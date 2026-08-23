import React, { useState, useEffect, useRef, useMemo } from 'react';
import { collection, query, where, onSnapshot, orderBy, updateDoc, doc, arrayUnion, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useDepartment } from '../contexts/DepartmentContext';

export interface AppNotification {
    id: string;
    userId?: string;
    departmentId?: string;
    targetRole?: string;
    title: string;
    message: string;
    link?: string;
    readBy: string[];
    createdAt: any;
    type?: string;
}

const NotificationBell: React.FC<{ userRole: string }> = ({ userRole }) => {
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [dismissedIds, setDismissedIds] = useState<string[]>(() => {
        try {
            const cached = localStorage.getItem('dismissed_notif_ids');
            return cached ? JSON.parse(cached) : [];
        } catch {
            return [];
        }
    });
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'unread' | 'all'>('all');
    const [isMarkingAll, setIsMarkingAll] = useState(false);
    const { selectedDepartmentId } = useDepartment();
    const { t, dir, language } = useLanguage();
    const navigate = useNavigate();
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Save dismissed notification IDs in localStorage
    const handleDismiss = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const updated = [...dismissedIds, id];
        setDismissedIds(updated);
        localStorage.setItem('dismissed_notif_ids', JSON.stringify(updated));
    };

    const handleClearAll = () => {
        const allIds = visibleNotifications.map(n => n.id);
        const updated = Array.from(new Set([...dismissedIds, ...allIds]));
        setDismissedIds(updated);
        localStorage.setItem('dismissed_notif_ids', JSON.stringify(updated));
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (!auth.currentUser || !selectedDepartmentId) return;
        const uid = auth.currentUser.uid;

        const q = query(
            collection(db, 'notifications'), 
            where('departmentId', '==', selectedDepartmentId),
            orderBy('createdAt', 'desc')
        );

        const unsub = onSnapshot(q, (snap) => {
            const notifs: AppNotification[] = [];
            snap.docs.forEach(d => {
                const data = d.data() as AppNotification;
                data.id = d.id;
                
                let isForMe = false;
                if (data.userId === uid) isForMe = true;
                else if (userRole === 'supervisor' && (data.targetRole === 'supervisor' || (!data.userId && !data.targetRole))) isForMe = true;
                else if (!data.userId && data.targetRole === userRole) isForMe = true;
                else if (!data.userId && !data.targetRole) isForMe = true;

                if (isForMe) {
                    notifs.push(data);
                }
            });
            setNotifications(notifs);
        });

        return () => unsub();
    }, [selectedDepartmentId, userRole]);

    const visibleNotifications = useMemo(() => {
        return notifications.filter(n => !dismissedIds.includes(n.id));
    }, [notifications, dismissedIds]);

    const currentUid = auth.currentUser?.uid || '';
    const unreadCount = useMemo(() => {
        return visibleNotifications.filter(n => !n.readBy?.includes(currentUid)).length;
    }, [visibleNotifications, currentUid]);

    const displayedNotifications = useMemo(() => {
        if (activeTab === 'unread') {
            return visibleNotifications.filter(n => !n.readBy?.includes(currentUid));
        }
        return visibleNotifications;
    }, [visibleNotifications, activeTab, currentUid]);

    const handleNotificationClick = async (notif: AppNotification) => {
        if (!auth.currentUser) return;
        const uid = auth.currentUser.uid;
        
        // Mark as read immediately in state
        if (!notif.readBy?.includes(uid)) {
            setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, readBy: [...(n.readBy || []), uid] } : n));
            try {
                await updateDoc(doc(db, 'notifications', notif.id), {
                    readBy: arrayUnion(uid)
                });
            } catch (e) {
                console.error("Error marking notification as read", e);
            }
        }

        setIsOpen(false);
        if (notif.link) {
            let path = notif.link.startsWith('/') ? notif.link : `/${notif.link}`;
            if (path === '/incoming') {
                path = '/user/incoming';
            }
            navigate(path);
        }
    };

    const markSingleAsRead = async (e: React.MouseEvent, notif: AppNotification) => {
        e.stopPropagation();
        if (!auth.currentUser) return;
        const uid = auth.currentUser.uid;
        
        // Optimistic update
        setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, readBy: [...(n.readBy || []), uid] } : n));
        
        try {
            await updateDoc(doc(db, 'notifications', notif.id), {
                readBy: arrayUnion(uid)
            });
        } catch (e) {
            console.error("Error marking as read", e);
        }
    };

    const markAllAsRead = async () => {
        if (!auth.currentUser || isMarkingAll) return;
        const uid = auth.currentUser.uid;
        const unreadNotifs = visibleNotifications.filter(n => !n.readBy?.includes(uid));
        
        if (unreadNotifs.length === 0) return;

        setIsMarkingAll(true);
        // Optimistic update - clear red badge immediately!
        setNotifications(prev => prev.map(n => ({
            ...n,
            readBy: n.readBy?.includes(uid) ? n.readBy : [...(n.readBy || []), uid]
        })));

        try {
            await Promise.all(
                unreadNotifs.map(notif => 
                    updateDoc(doc(db, 'notifications', notif.id), {
                        readBy: arrayUnion(uid)
                    }).catch(() => {})
                )
            );
        } catch (e) {
            console.error("Error in markAllAsRead:", e);
        } finally {
            setIsMarkingAll(false);
        }
    };

    const formatRelativeTime = (timestamp: any) => {
        if (!timestamp) return '';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMinutes = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMinutes / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMinutes < 1) return language === 'ar' ? 'الآن' : 'Just now';
        if (diffMinutes < 60) return language === 'ar' ? `منذ ${diffMinutes} دقيقة` : `${diffMinutes}m ago`;
        if (diffHours < 24) return language === 'ar' ? `منذ ${diffHours} ساعة` : `${diffHours}h ago`;
        if (diffDays === 1) return language === 'ar' ? 'أمس' : 'Yesterday';
        if (diffDays < 7) return language === 'ar' ? `منذ ${diffDays} أيام` : `${diffDays}d ago`;

        return date.toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US', {
            month: 'short',
            day: 'numeric'
        });
    };

    const getNotificationTheme = (notif: AppNotification) => {
        const type = (notif.type || '').toLowerCase();
        const title = (notif.title || '').toLowerCase();

        if (type === 'leave' || title.includes('leave') || title.includes('إجازة')) {
            return {
                icon: 'fas fa-umbrella-beach',
                bg: 'bg-emerald-50 text-emerald-600 border-emerald-200',
                badge: 'bg-emerald-500'
            };
        }
        if (type === 'swap' || title.includes('swap') || title.includes('تبديل')) {
            return {
                icon: 'fas fa-sync-alt',
                bg: 'bg-blue-50 text-blue-600 border-blue-200',
                badge: 'bg-blue-500'
            };
        }
        if (type === 'schedule' || title.includes('schedule') || title.includes('جدول')) {
            return {
                icon: 'fas fa-calendar-alt',
                bg: 'bg-indigo-50 text-indigo-600 border-indigo-200',
                badge: 'bg-indigo-500'
            };
        }
        if (type === 'alert' || type === 'violation' || type === 'penalty' || title.includes('جزاء') || title.includes('مخالفة') || title.includes('تنبيه')) {
            return {
                icon: 'fas fa-exclamation-triangle',
                bg: 'bg-rose-50 text-rose-600 border-rose-200',
                badge: 'bg-rose-500'
            };
        }
        if (type === 'broadcast' || title.includes('إعلان') || title.includes('announcement')) {
            return {
                icon: 'fas fa-bullhorn',
                bg: 'bg-amber-50 text-amber-600 border-amber-200',
                badge: 'bg-amber-500'
            };
        }
        return {
            icon: 'fas fa-bell',
            bg: 'bg-slate-100 text-slate-600 border-slate-200',
            badge: 'bg-blue-500'
        };
    };

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Notification Bell Button */}
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className={`relative p-2.5 rounded-xl transition-all duration-200 flex items-center justify-center ${
                    isOpen 
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30 ring-2 ring-blue-400' 
                        : unreadCount > 0 
                            ? 'bg-slate-800 text-amber-400 hover:bg-slate-700 hover:text-amber-300' 
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                }`}
                title={t('notifications.title')}
            >
                <i className={`fas fa-bell text-lg ${unreadCount > 0 && !isOpen ? 'animate-bounce' : ''}`}></i>
                
                {/* Unread Counter Badge */}
                {unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full border-2 border-slate-900 shadow-md min-w-[20px] text-center leading-none">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Dropdown Popover */}
            {isOpen && (
                <>
                    {/* Mobile Backdrop to prevent clipping and dismiss easily */}
                    <div 
                        className="fixed inset-0 bg-black/40 backdrop-blur-[1px] z-[9998] sm:hidden" 
                        onClick={() => setIsOpen(false)} 
                    />

                    <div 
                        className={`fixed inset-x-3 top-16 sm:absolute sm:top-full sm:inset-auto sm:mt-2.5 sm:w-[380px] max-w-[calc(100vw-1.5rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-[9999] transition-all animate-fadeIn flex flex-col ${
                            dir === 'rtl' ? 'sm:right-0' : 'sm:left-0'
                        }`}
                    >
                        {/* Header */}
                        <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-3.5 text-white flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
                                    <i className="fas fa-bell text-xs"></i>
                                </div>
                                <div>
                                    <h3 className="font-bold text-sm leading-tight text-white">{t('notifications.title')}</h3>
                                    <p className="text-[10px] text-slate-400">
                                        {unreadCount > 0 
                                            ? `${unreadCount} ${language === 'ar' ? 'إشعار جديد' : 'new'}` 
                                            : (language === 'ar' ? 'محدث أولاً بأول' : 'All caught up')}
                                    </p>
                                </div>
                            </div>

                            {/* Quick Header Actions */}
                            <div className="flex items-center gap-1.5">
                                {unreadCount > 0 && (
                                    <button 
                                        onClick={markAllAsRead} 
                                        disabled={isMarkingAll}
                                        className="text-[11px] bg-blue-600/80 hover:bg-blue-600 text-white px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition shadow-sm"
                                        title={t('notifications.markAllRead')}
                                    >
                                        <i className={`fas fa-check-double text-[10px] ${isMarkingAll ? 'animate-spin' : ''}`}></i>
                                        <span>{language === 'ar' ? 'قراءة الكل' : 'Read All'}</span>
                                    </button>
                                )}

                                {visibleNotifications.length > 0 && (
                                    <button 
                                        onClick={handleClearAll}
                                        className="text-[11px] bg-slate-800 hover:bg-rose-900/60 text-slate-300 hover:text-rose-200 px-2 py-1 rounded-lg font-medium transition"
                                        title={t('notifications.clearAll')}
                                    >
                                        <i className="fas fa-trash-alt text-[10px]"></i>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Filter Tabs */}
                        <div className="flex items-center bg-slate-100/80 p-1 border-b border-slate-200 shrink-0">
                            <button
                                onClick={() => setActiveTab('all')}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                                    activeTab === 'all' 
                                        ? 'bg-white text-slate-800 shadow-sm' 
                                        : 'text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                <span>{t('notifications.all')}</span>
                                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === 'all' ? 'bg-slate-100 text-slate-800' : 'bg-slate-200 text-slate-600'}`}>
                                    {visibleNotifications.length}
                                </span>
                            </button>

                            <button
                                onClick={() => setActiveTab('unread')}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                                    activeTab === 'unread' 
                                        ? 'bg-white text-blue-600 shadow-sm' 
                                        : 'text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                <span>{t('notifications.unread')}</span>
                                {unreadCount > 0 && (
                                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-500 text-white font-black">
                                        {unreadCount}
                                    </span>
                                )}
                            </button>
                        </div>
                        
                        {/* Notification List Container */}
                        <div className="max-h-[min(65vh,400px)] sm:max-h-[380px] overflow-y-auto divide-y divide-slate-100">
                            {displayedNotifications.length === 0 ? (
                                <div className="p-8 text-center text-slate-400 flex flex-col items-center justify-center">
                                    <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-300 text-2xl mb-2.5">
                                        <i className={activeTab === 'unread' ? "fas fa-envelope-open-text" : "fas fa-bell-slash"}></i>
                                    </div>
                                    <p className="text-xs font-bold text-slate-600">
                                        {activeTab === 'unread' ? t('notifications.noUnread') : t('notifications.empty')}
                                    </p>
                                    <p className="text-[11px] text-slate-400 mt-1">
                                        {language === 'ar' ? 'ستظهر هنا التنبيهات والطلبات الجديدة فور وصولها' : 'New requests and alerts will appear here'}
                                    </p>
                                </div>
                            ) : (
                                displayedNotifications.map(notif => {
                                    const isRead = notif.readBy?.includes(currentUid);
                                    const theme = getNotificationTheme(notif);
                                    
                                    return (
                                        <div 
                                            key={notif.id} 
                                            onClick={() => handleNotificationClick(notif)}
                                            className={`group relative p-3.5 cursor-pointer transition-all duration-150 flex items-start gap-3 hover:bg-blue-50/40 ${
                                                isRead ? 'bg-white opacity-80 hover:opacity-100' : 'bg-blue-50/25'
                                            }`}
                                        >
                                            {/* Unread Indicator Bar */}
                                            {!isRead && (
                                                <div className="absolute top-0 bottom-0 start-0 w-1 bg-blue-600 rounded-e"></div>
                                            )}

                                            {/* Notification Category Icon */}
                                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${theme.bg}`}>
                                                <i className={`${theme.icon} text-sm`}></i>
                                            </div>

                                            {/* Body Content */}
                                            <div className="flex-1 min-w-0 pr-1">
                                                <div className="flex items-center justify-between gap-1 mb-0.5">
                                                    <h4 className={`text-xs truncate ${isRead ? 'font-semibold text-slate-700' : 'font-black text-slate-900'}`}>
                                                        {t(notif.title) || notif.title}
                                                    </h4>
                                                    <span className="text-[10px] text-slate-400 font-medium shrink-0 flex items-center gap-1">
                                                        <i className="far fa-clock text-[9px]"></i>
                                                        {formatRelativeTime(notif.createdAt)}
                                                    </span>
                                                </div>

                                                <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                                                    {(t(notif.message) || notif.message)
                                                        .replace('{name}', notif.userId || '')
                                                        .replace('{month}', '')
                                                        .replace('{mode}', '')
                                                        .replace('{action}', '')}
                                                </p>

                                                {notif.link && (
                                                    <div className="mt-1 flex items-center gap-1 text-[11px] text-blue-600 font-bold group-hover:text-blue-700">
                                                        <span>{language === 'ar' ? 'عرض التفاصيل' : 'View Details'}</span>
                                                        <i className={`fas fa-chevron-${dir === 'rtl' ? 'left' : 'right'} text-[9px] transition-transform group-hover:translate-x-0.5`}></i>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Quick Actions (Hover & Touch) */}
                                            <div className="flex flex-col gap-1 shrink-0 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                                                {!isRead && (
                                                    <button
                                                        onClick={(e) => markSingleAsRead(e, notif)}
                                                        className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-blue-100 text-slate-500 hover:text-blue-700 flex items-center justify-center transition"
                                                        title={t('notifications.markRead') || 'تحديد كمقروء'}
                                                    >
                                                        <i className="fas fa-check text-[10px]"></i>
                                                    </button>
                                                )}
                                                <button
                                                    onClick={(e) => handleDismiss(e, notif.id)}
                                                    className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-400 hover:text-rose-600 flex items-center justify-center transition"
                                                    title={language === 'ar' ? 'إخفاء الإشعار' : 'Dismiss'}
                                                >
                                                    <i className="fas fa-times text-[10px]"></i>
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Footer Quick Action Bar */}
                        {visibleNotifications.length > 0 && (
                            <div className="bg-slate-50 p-2.5 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 px-3 shrink-0">
                                <span className="text-[11px] font-medium text-slate-500">
                                    {unreadCount > 0 
                                        ? `${unreadCount} ${language === 'ar' ? 'إشعار غير مقروء' : 'unread'}` 
                                        : (language === 'ar' ? 'كل شيء مقروء' : 'Caught up')}
                                </span>

                                {unreadCount > 0 && (
                                    <button
                                        onClick={markAllAsRead}
                                        disabled={isMarkingAll}
                                        className="text-blue-600 font-bold hover:text-blue-800 text-[11px] flex items-center gap-1 transition"
                                    >
                                        <i className="fas fa-check-double text-[10px]"></i>
                                        <span>{t('notifications.markAllRead')}</span>
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default NotificationBell;

