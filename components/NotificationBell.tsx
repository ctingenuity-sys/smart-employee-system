import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, orderBy, updateDoc, doc, arrayUnion, Timestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Link, useNavigate } from 'react-router-dom';
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
    type: string;
}

const NotificationBell: React.FC<{ userRole: string }> = ({ userRole }) => {
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const { selectedDepartmentId } = useDepartment();
    const { t, dir } = useLanguage();
    const navigate = useNavigate();
    const dropdownRef = useRef<HTMLDivElement>(null);

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

    const unreadCount = notifications.filter(n => !n.readBy?.includes(auth.currentUser?.uid || '')).length;

    const handleNotificationClick = async (notif: AppNotification) => {
        if (!auth.currentUser) return;
        
        if (!notif.readBy?.includes(auth.currentUser.uid)) {
            try {
                await updateDoc(doc(db, 'notifications', notif.id), {
                    readBy: arrayUnion(auth.currentUser.uid)
                });
            } catch (e) {
                console.error("Error marking notification as read", e);
            }
        }

        setIsOpen(false);
        if (notif.link) {
            // Ensure link starts with / for internal routing
            let path = notif.link.startsWith('/') ? notif.link : `/${notif.link}`;
            
            // Fix legacy link
            if (path === '/incoming') {
                path = '/user/incoming';
            }
            
            console.log("Navigating to:", path);
            navigate(path);
        }
    };

    const markAllAsRead = async () => {
        if (!auth.currentUser) return;
        const uid = auth.currentUser.uid;
        const unreadNotifs = notifications.filter(n => !n.readBy?.includes(uid));
        
        for (const notif of unreadNotifs) {
             try {
                await updateDoc(doc(db, 'notifications', notif.id), {
                    readBy: arrayUnion(uid)
                });
            } catch (e) {}
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 text-slate-500 hover:text-indigo-600 transition-colors rounded-full hover:bg-indigo-50"
            >
                <i className={`fas fa-bell text-xl ${unreadCount > 0 ? 'animate-wiggle text-indigo-600' : ''}`}></i>
                {unreadCount > 0 && (
                    <span className="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-white animate-pulse">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className={`absolute top-full mt-1 w-60 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-[100] ${dir === 'rtl' ? 'left-0' : 'right-0'}`}>
                    <div className="bg-slate-50 p-3 border-b border-slate-100 flex justify-between items-center">
                        <h3 className="font-black text-slate-800 text-sm">الإشعارات</h3>
                        {unreadCount > 0 && (
                            <button onClick={markAllAsRead} className="text-xs text-indigo-600 font-bold hover:text-indigo-800">
                                تحديد الكل كمقروء
                            </button>
                        )}
                    </div>
                    
                    <div className="max-h-[70vh] overflow-y-auto custom-scrollbar">
                        {notifications.length === 0 ? (
                            <div className="p-6 text-center text-slate-400">
                                <i className="fas fa-bell-slash text-3xl mb-2 opacity-20"></i>
                                <p className="text-sm font-medium">لا توجد إشعارات</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-50">
                                {notifications.map(notif => {
                                    const isRead = notif.readBy?.includes(auth.currentUser?.uid || '');
                                    return (
                                        <div 
                                            key={notif.id} 
                                            onClick={() => handleNotificationClick(notif)}
                                            className={`p-3 cursor-pointer transition-colors hover:bg-slate-50 flex gap-3 ${isRead ? 'opacity-60' : 'bg-indigo-50/30'}`}
                                        >
                                            <div className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${isRead ? 'bg-transparent' : 'bg-indigo-500'}`}></div>
                                            <div>
                                                <h4 className={`text-sm ${isRead ? 'font-medium text-slate-700' : 'font-bold text-slate-900'}`}>
                                                    {notif.title}
                                                </h4>
                                                <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{notif.message}</p>
                                                <span className="text-[10px] text-slate-400 mt-1 block">
                                                    {notif.createdAt?.toDate ? notif.createdAt.toDate().toLocaleString('ar-EG') : ''}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationBell;
