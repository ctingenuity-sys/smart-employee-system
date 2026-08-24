import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db, auth } from '../firebase';
// @ts-ignore
import { collection, addDoc, updateDoc, deleteDoc, doc, query, orderBy, limit, Timestamp, arrayUnion, where, getDocs, onSnapshot } from 'firebase/firestore';
import { ShiftLog, Announcement, User, Location } from '../types';
import SkeletonLoader from '../components/SkeletonLoader';
import Toast from '../components/Toast';
import Modal from '../components/Modal';
import VoiceInput from '../components/VoiceInput';
import { useLanguage } from '../contexts/LanguageContext';
import { useDepartment } from '../contexts/DepartmentContext';
import { useAuth } from '../contexts/AuthContext';
import { GoogleGenAI } from "@google/genai";

const CommunicationPage: React.FC = () => {
    const { t, dir } = useLanguage();
    const { selectedDepartmentId, departments } = useDepartment();
    const currentDepartment = departments.find(d => d.id === selectedDepartmentId);
    
    // Primary Tab: Logbook (Shift Handovers) vs Announcements
    const [activeTab, setActiveTab] = useState<'logbook' | 'announcements'>('logbook');
    
    // Core Data State
    const [shiftLogs, setShiftLogs] = useState<ShiftLog[]>([]);
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [users, setUsers] = useState<User[]>(() => {
        const cached = localStorage.getItem('usr_cached_users');
        return cached ? JSON.parse(cached) : [];
    });
    const [locations, setLocations] = useState<Location[]>(() => {
        const cached = localStorage.getItem('usr_cached_locs');
        return cached ? JSON.parse(cached) : [];
    });
    
    const [loading, setLoading] = useState(true);
    const [announcementsLoading, setAnnouncementsLoading] = useState(true);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'info' | 'error' } | null>(null);

    // Form Modes & Inputs
    const [handoverMode, setHandoverMode] = useState<'quick' | 'sbar'>('quick');
    const [logLocation, setLogLocation] = useState('');
    const [logShiftType, setLogShiftType] = useState<'morning' | 'evening' | 'night' | 'oncall'>('morning');
    const [logHandoverTo, setLogHandoverTo] = useState('');
    const [logCategory, setLogCategory] = useState<'general' | 'machine' | 'patient' | 'supply'>('general');
    const [logImportant, setLogImportant] = useState(false);
    const [logContent, setLogContent] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // SBAR Specific Fields
    const [sbarSituation, setSbarSituation] = useState('');
    const [sbarBackground, setSbarBackground] = useState('');
    const [sbarAssessment, setSbarAssessment] = useState('');
    const [sbarRecommendation, setSbarRecommendation] = useState('');

    // Pending Tasks List Builder
    const [pendingTasks, setPendingTasks] = useState<string[]>([]);
    const [newTaskInput, setNewTaskInput] = useState('');

    // Smart Checklist State
    const [checklist, setChecklist] = useState({
        devices: false,
        inventory: false,
        keys: false,
        clean: false,
        pacsWorkstation: false,
        consumables: false
    });

    // Filtering and Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<'all' | 'handovers' | 'pending' | 'urgent' | 'myLogs'>('all');
    const [filterMonth, setFilterMonth] = useState((new Date().getMonth() + 1).toString());
    const [filterYear, setFilterYear] = useState(new Date().getFullYear().toString());

    // Modals
    const [receiveModal, setReceiveModal] = useState<{ isOpen: boolean; log: ShiftLog | null }>({
        isOpen: false,
        log: null
    });
    const [receiverLocation, setReceiverLocation] = useState('');
    const [receiverNotes, setReceiverNotes] = useState('');
    const [isConfirmingReceive, setIsConfirmingReceive] = useState(false);

    const [viewersModal, setViewersModal] = useState<{ isOpen: boolean; title: string; viewers: string[] }>({
        isOpen: false,
        title: '',
        viewers: []
    });

    const [editLogModal, setEditLogModal] = useState<{ isOpen: boolean; log: ShiftLog | null }>({
        isOpen: false,
        log: null
    });

    const [editAnnounceModal, setEditAnnounceModal] = useState<{ isOpen: boolean; ann: Announcement | null }>({
        isOpen: false,
        ann: null
    });

    // AI Analysis Modal
    const [showInsightsModal, setShowInsightsModal] = useState(false);
    const [insightsContent, setInsightsContent] = useState('');
    const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);

    // Announcements Form
    const [newAnnounceTitle, setNewAnnounceTitle] = useState('');
    const [newAnnounceContent, setNewAnnounceContent] = useState('');
    const [newAnnouncePriority, setNewAnnouncePriority] = useState<'normal' | 'urgent' | 'critical'>('normal');
    const [isPostingAnnounce, setIsPostingAnnounce] = useState(false);

    const [isPrinting, setIsPrinting] = useState(false);

    const userId = auth.currentUser?.uid;
    const { user: authUser, role: authRole, departmentId: userDepartmentId } = useAuth();
    const userName = localStorage.getItem('username') || t('role.user');
    const storedRole = localStorage.getItem('role') || authRole || 'user';
    const isSupervisor = storedRole === 'admin' || storedRole === 'supervisor' || storedRole === 'manager' || authRole === 'admin';

    // Current user's full profile from loaded users list
    const currentUserObj = useMemo(() => {
        return users.find(u => u.uid === userId || u.id === userId);
    }, [users, userId]);

    // Colleague list filtered strictly by the current selected department
    const departmentUsers = useMemo(() => {
        if (!selectedDepartmentId) return users;
        return users.filter(u => 
            u.departmentId === selectedDepartmentId || 
            (u.departments && u.departments.includes(selectedDepartmentId))
        );
    }, [users, selectedDepartmentId]);

    // Check if the current user belongs to the specified department
    const isUserInDepartment = (deptId?: string) => {
        if (!deptId) return true; // Legacy/General logs
        
        // System admin can oversee and acknowledge all
        if (storedRole === 'admin' || authRole === 'admin') return true;
        
        // Direct department link on auth context
        if (userDepartmentId === deptId) return true;
        
        // Match from database profile
        if (currentUserObj?.departmentId === deptId) return true;
        if (currentUserObj?.departments && currentUserObj.departments.includes(deptId)) return true;

        // Current department matches and user is authorized in this view
        if (selectedDepartmentId === deptId) {
            if (userDepartmentId === selectedDepartmentId || currentUserObj?.departments?.includes(selectedDepartmentId) || isSupervisor) {
                return true;
            }
        }
        
        return false;
    };

    // Quick Templates
    const quickTemplates = useMemo(() => [
        t('comm.tpl.handover'),
        t('comm.tpl.deviceIssue'),
        t('comm.tpl.patientHandover'),
        t('comm.tpl.contrastCheck'),
        t('comm.tpl.pacsCheck'),
        t('comm.tpl.smooth')
    ], [t]);

    // Local Storage Caches
    useEffect(() => {
        if (users.length > 0) localStorage.setItem('usr_cached_users', JSON.stringify(users));
    }, [users]);

    useEffect(() => {
        if (locations.length > 0) localStorage.setItem('usr_cached_locs', JSON.stringify(locations));
    }, [locations]);

    // --- Realtime Data Fetching ---
    useEffect(() => {
        if (!selectedDepartmentId) return;
        setLoading(true);

        // 1. Fetch Users in the department or workspace
        getDocs(collection(db, 'users')).then((snap: any) => {
            const list = snap.docs.map((d: any) => ({ ...d.data(), id: d.id } as User));
            setUsers(list);
        }).catch(console.error);

        // 2. Fetch Locations
        getDocs(query(collection(db, 'locations'), where('departmentId', '==', selectedDepartmentId))).then((snap: any) => {
            const list = snap.docs.map((d: any) => ({ ...d.data(), id: d.id } as Location));
            setLocations(list);
            if (list.length > 0 && !logLocation) {
                setLogLocation(list[0].name);
            }
        }).catch(console.error);

        // 3. Fetch Logs for Month/Year
        const start = new Date(parseInt(filterYear), parseInt(filterMonth) - 1, 1);
        const end = new Date(parseInt(filterYear), parseInt(filterMonth), 0, 23, 59, 59);

        const qLogs = query(
            collection(db, 'shiftLogs'),
            where('departmentId', '==', selectedDepartmentId),
            where('createdAt', '>=', Timestamp.fromDate(start)),
            where('createdAt', '<=', Timestamp.fromDate(end)),
            orderBy('createdAt', 'desc')
        );

        const unsubLogs = onSnapshot(qLogs, (snap: any) => {
            const logs = snap.docs.map((d: any) => ({ ...d.data(), id: d.id } as ShiftLog));
            setShiftLogs(logs);
            setLoading(false);
        }, (err: any) => {
            console.error("ShiftLogs snapshot error:", err);
            setLoading(false);
        });

        // 4. Fetch Announcements
        setAnnouncementsLoading(true);
        const qAnnounce = query(
            collection(db, 'announcements'),
            where('departmentId', '==', selectedDepartmentId),
            orderBy('createdAt', 'desc')
        );

        const unsubAnnounce = onSnapshot(qAnnounce, (snap: any) => {
            const list = snap.docs.map((d: any) => ({ ...d.data(), id: d.id } as Announcement));
            setAnnouncements(list);
            setAnnouncementsLoading(false);

            // Auto-mark as seen
            if (userId) {
                list.forEach((ann: any) => {
                    if (ann.isActive && !ann.seenBy?.includes(userId)) {
                        updateDoc(doc(db, 'announcements', ann.id), {
                            seenBy: arrayUnion(userId)
                        }).catch(console.error);
                    }
                });
            }
        }, (err: any) => {
            console.error("Announcements snapshot error:", err);
            setAnnouncementsLoading(false);
        });

        return () => {
            unsubLogs();
            unsubAnnounce();
        };
    }, [selectedDepartmentId, filterMonth, filterYear, userId]);

    // Toggle Checklist
    const toggleCheck = (key: keyof typeof checklist) => {
        setChecklist(prev => ({ ...prev, [key]: !prev[key] }));
    };

    // Add Pending Task
    const handleAddPendingTask = () => {
        if (!newTaskInput.trim()) return;
        setPendingTasks(prev => [...prev, newTaskInput.trim()]);
        setNewTaskInput('');
    };

    const handleRemovePendingTask = (index: number) => {
        setPendingTasks(prev => prev.filter((_, i) => i !== index));
    };

    // Quick Template Click
    const handleApplyTemplate = (tpl: string) => {
        setLogContent(prev => {
            if (!prev.trim()) return tpl;
            return `${prev}\n• ${tpl}`;
        });
    };

    // Voice Dictation
    const handleDictation = (text: string) => {
        setLogContent(prev => prev ? `${prev} ${text}` : text);
    };

    // --- Submit Handover Log ---
    const handleLogSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!logLocation) {
            setToast({ msg: t('comm.log.loc') + ' ' + (t('required') || 'مطلوب'), type: 'error' });
            return;
        }

        const hasTextContent = logContent.trim().length > 0;
        const hasSbarContent = (sbarSituation.trim() || sbarBackground.trim() || sbarAssessment.trim() || sbarRecommendation.trim()).length > 0;
        const hasChecklist = Object.values(checklist).some(Boolean);
        const hasTasks = pendingTasks.length > 0;

        if (!hasTextContent && !hasSbarContent && !hasChecklist && !hasTasks) {
            setToast({ msg: t('comm.log.content') + ' ' + (t('required') || 'مطلوب'), type: 'error' });
            return;
        }

        setIsSubmitting(true);

        // Target colleague name
        let targetColleagueName = '';
        if (logHandoverTo) {
            const targetUser = users.find(u => u.id === logHandoverTo);
            targetColleagueName = targetUser?.name || '';
        }

        // Build Combined Description
        let fullText = logContent.trim();
        if (handoverMode === 'sbar') {
            const sbarSections = [];
            if (sbarSituation.trim()) sbarSections.push(`[S] Situation: ${sbarSituation.trim()}`);
            if (sbarBackground.trim()) sbarSections.push(`[B] Background: ${sbarBackground.trim()}`);
            if (sbarAssessment.trim()) sbarSections.push(`[A] Assessment: ${sbarAssessment.trim()}`);
            if (sbarRecommendation.trim()) sbarSections.push(`[R] Recommendation: ${sbarRecommendation.trim()}`);
            fullText = sbarSections.join('\n\n') + (fullText ? `\n\nNotes:\n${fullText}` : '');
        }

        const newLogData: Partial<ShiftLog> = {
            userId: userId || 'unknown',
            userName: userName || 'Employee',
            location: logLocation,
            type: logImportant ? 'issue' : 'handover',
            category: logCategory,
            isImportant: logImportant,
            content: fullText,
            shiftType: logShiftType,
            handoverToUserId: logHandoverTo || undefined,
            handoverToUserName: targetColleagueName || undefined,
            departmentId: selectedDepartmentId || undefined,
            createdAt: Timestamp.now(),
            checklist: checklist,
            pendingTasks: pendingTasks.length > 0 ? pendingTasks : undefined,
            sbar: handoverMode === 'sbar' ? {
                situation: sbarSituation.trim() || undefined,
                background: sbarBackground.trim() || undefined,
                assessment: sbarAssessment.trim() || undefined,
                recommendation: sbarRecommendation.trim() || undefined
            } : undefined
        };

        try {
            await addDoc(collection(db, 'shiftLogs'), newLogData);
            setToast({ msg: t('save'), type: 'success' });

            // Reset Form
            setLogContent('');
            setSbarSituation('');
            setSbarBackground('');
            setSbarAssessment('');
            setSbarRecommendation('');
            setPendingTasks([]);
            setLogImportant(false);
            setChecklist({
                devices: false,
                inventory: false,
                keys: false,
                clean: false,
                pacsWorkstation: false,
                consumables: false
            });
        } catch (err: any) {
            console.error("Error creating shift log:", err);
            setToast({ msg: 'Error saving log', type: 'error' });
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- Confirm Receipt & Acknowledgment ---
    const handleOpenReceiveModal = (log: ShiftLog) => {
        // Enforce same department receipt check
        if (log.departmentId && !isUserInDepartment(log.departmentId)) {
            const dept = departments.find(d => d.id === log.departmentId);
            setToast({ 
                msg: dir === 'rtl' 
                    ? `عذراً، يحق فقط لموظفي قسم (${dept?.name || 'نفس القسم'}) استلام هذه الوردية`
                    : `Only employees belonging to ${dept?.name || 'this department'} can receive this handover`, 
                type: 'error' 
            });
            return;
        }
        setReceiveModal({ isOpen: true, log });
        setReceiverLocation(log.location || (locations[0]?.name || ''));
        setReceiverNotes('');
    };

    const handleConfirmReceive = async () => {
        if (!receiveModal.log) return;

        // Double-check department authorization
        if (receiveModal.log.departmentId && !isUserInDepartment(receiveModal.log.departmentId)) {
            setToast({ 
                msg: dir === 'rtl' 
                    ? 'عذراً، يحق فقط لموظفي نفس القسم استلام وتأكيد الوردية' 
                    : 'Only employees in the same department can acknowledge this shift', 
                type: 'error' 
            });
            return;
        }

        if (!receiverLocation) {
            setToast({ msg: t('comm.receive.loc') + ' ' + (t('required') || 'مطلوب'), type: 'error' });
            return;
        }

        setIsConfirmingReceive(true);
        try {
            await updateDoc(doc(db, 'shiftLogs', receiveModal.log.id), {
                receivedBy: userName,
                receivedById: userId || '',
                receiverLocation: receiverLocation,
                receiverDepartmentId: userDepartmentId || selectedDepartmentId || null,
                receiverNotes: receiverNotes.trim() || '',
                receivedAt: Timestamp.now()
            });

            setToast({ msg: t('comm.receive') + ' ' + (t('success') || 'بنجاح'), type: 'success' });
            setReceiveModal({ isOpen: false, log: null });
            setReceiverNotes('');
        } catch (err) {
            console.error("Error confirming receipt:", err);
            setToast({ msg: 'Error confirming receipt', type: 'error' });
        } finally {
            setIsConfirmingReceive(false);
        }
    };

    // --- Delete Log ---
    const handleDeleteLog = async (id: string) => {
        if (!isSupervisor) return;
        if (confirm(t('confirm') + '?')) {
            try {
                await deleteDoc(doc(db, 'shiftLogs', id));
                setToast({ msg: t('delete'), type: 'success' });
            } catch (err) {
                console.error("Error deleting log:", err);
                setToast({ msg: 'Error deleting log', type: 'error' });
            }
        }
    };

    // --- Edit Log Save ---
    const handleEditLogSave = async () => {
        if (!editLogModal.log) return;
        try {
            await updateDoc(doc(db, 'shiftLogs', editLogModal.log.id), {
                content: editLogModal.log.content,
                location: editLogModal.log.location || '',
                isImportant: editLogModal.log.isImportant || false,
                category: editLogModal.log.category || 'general'
            });
            setToast({ msg: t('save'), type: 'success' });
            setEditLogModal({ isOpen: false, log: null });
        } catch (err) {
            console.error("Error updating log:", err);
            setToast({ msg: 'Error updating log', type: 'error' });
        }
    };

    // --- Announcements: Add ---
    const handleAddAnnouncement = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isSupervisor) return;
        if (!newAnnounceTitle.trim() || !newAnnounceContent.trim()) {
            setToast({ msg: 'Title & Content are required', type: 'error' });
            return;
        }

        setIsPostingAnnounce(true);
        try {
            await addDoc(collection(db, 'announcements'), {
                title: newAnnounceTitle.trim(),
                content: newAnnounceContent.trim(),
                priority: newAnnouncePriority,
                isActive: true,
                createdAt: Timestamp.now(),
                createdBy: userName,
                departmentId: selectedDepartmentId,
                seenBy: userId ? [userId] : []
            });

            // Notification
            await addDoc(collection(db, 'notifications'), {
                departmentId: selectedDepartmentId,
                title: 'notif.announce.new',
                message: newAnnounceTitle.trim(),
                link: '/communications',
                readBy: [],
                createdAt: Timestamp.now(),
                type: 'announcement'
            });

            setNewAnnounceTitle('');
            setNewAnnounceContent('');
            setNewAnnouncePriority('normal');
            setToast({ msg: t('comm.ann.post') + ' ' + (t('success') || 'بنجاح'), type: 'success' });
        } catch (err) {
            console.error("Error adding announcement:", err);
            setToast({ msg: 'Error posting announcement', type: 'error' });
        } finally {
            setIsPostingAnnounce(false);
        }
    };

    // Delete Announcement
    const handleDeleteAnnouncement = async (id: string) => {
        if (!isSupervisor) return;
        if (confirm(t('confirm') + '?')) {
            try {
                await deleteDoc(doc(db, 'announcements', id));
                setToast({ msg: t('delete'), type: 'success' });
            } catch (err) {
                console.error("Error deleting announcement:", err);
            }
        }
    };

    // Edit Announcement Save
    const handleEditAnnounceSave = async () => {
        if (!editAnnounceModal.ann) return;
        try {
            await updateDoc(doc(db, 'announcements', editAnnounceModal.ann.id), {
                title: editAnnounceModal.ann.title,
                content: editAnnounceModal.ann.content,
                priority: editAnnounceModal.ann.priority
            });
            setToast({ msg: t('save'), type: 'success' });
            setEditAnnounceModal({ isOpen: false, ann: null });
        } catch (err) {
            console.error("Error updating announcement:", err);
        }
    };

    // --- Copy Handover to Clipboard (WhatsApp/Telegram formatted) ---
    const handleCopyLogSummary = (log: ShiftLog) => {
        const dateStr = log.createdAt?.toDate ? log.createdAt.toDate().toLocaleString('ar-SA') : '';
        const shiftStr = t(`comm.shift.${log.shiftType || 'morning'}`);
        const categoryStr = t(`comm.cat.${log.category || 'general'}`);
        
        let text = `🏥 *تقرير تسليم وردية - ${currentDepartment?.name || 'القسم'}*\n`;
        text += `👤 *المُسلّم:* ${log.userName} (${log.location || 'القسم'})\n`;
        text += `⏰ *الوردية:* ${shiftStr} | ${dateStr}\n`;
        text += `🏷️ *التصنيف:* ${categoryStr}\n`;
        if (log.handoverToUserName) text += `🎯 *المُستلم المستهدف:* ${log.handoverToUserName}\n`;
        if (log.isImportant) text += `⚠️ *بلاغ هام / عطل طارئ!*\n`;
        text += `\n📝 *الملاحظات والتفاصيل:*\n${log.content}\n`;

        if (log.pendingTasks && log.pendingTasks.length > 0) {
            text += `\n📌 *المهام والفحوصات المعلقة:*\n`;
            log.pendingTasks.forEach(t => { text += `  ▫️ ${t}\n`; });
        }

        if (log.receivedBy) {
            text += `\n✅ *تم الاستلام بواسطة:* ${log.receivedBy} (${log.receiverLocation || ''})\n`;
            if (log.receiverNotes) text += `💬 *ملاحظات الاستلام:* ${log.receiverNotes}\n`;
        } else {
            text += `\n⏳ *الحالة:* بانتظار استلام الوردية التالية.\n`;
        }

        navigator.clipboard.writeText(text);
        setToast({ msg: dir === 'rtl' ? 'تم نسخ التقرير للحافظة (جاهز للواتساب)' : 'Summary copied to clipboard!', type: 'success' });
    };

    // --- AI Insights Generator ---
    const handleGenerateInsights = async () => {
        if (shiftLogs.length === 0) {
            setToast({ msg: 'No logs available to analyze', type: 'info' });
            return;
        }

        setShowInsightsModal(true);
        setIsGeneratingInsights(true);
        setInsightsContent('');

        try {
            const apiKey = (import.meta as any).env.VITE_GEMINI_API_KEY;
            if (!apiKey) {
                throw new Error("Missing Gemini API Key in .env");
            }

            const logTexts = shiftLogs.slice(0, 40).map(l => {
                const date = l.createdAt?.toDate ? l.createdAt.toDate().toLocaleDateString('en-US') : '';
                return `- [${date}][${l.shiftType || 'Shift'}][${l.location || 'General'}] ${l.userName} (${l.category}): ${l.content} ${l.isImportant ? '!!FLAGGED!!' : ''} ${l.receivedBy ? `[Received by: ${l.receivedBy}]` : '[PENDING RECEIPT]'}`;
            }).join('\n');

            const ai = new GoogleGenAI({ apiKey });
            const prompt = `
                You are a senior hospital supervisor & clinical operations expert analyzing department shift handover logs.
                Review the following shift logs and create a structured Arabic / English executive handover summary with:
                1. 🔴 **الأعطال والبلاغات الحرجة العاجلة (Critical Incidents & Equipment Faults)**: Any machine breakdowns, urgent pending cases, or safety alerts.
                2. 🟡 **سير العمل وثغرات التسليم (Operational Bottlenecks & Gaps)**: Patterns of pending receipts, communication delays, or inventory needs.
                3. 🟢 **نقاط القوة وسلاسة التسليم (Positive Trends & Best Practices)**: High acknowledgment rates, proactive staff.
                4. 💡 **توصيات تنفيذية سريعة للوردية القادمة (Actionable Recommendations)**.

                Format with clean HTML (<h3>, <ul>, <li>, <strong>, <div class="p-3 bg-red-50 rounded-xl mb-3"> etc.). Keep it clear, concise, and professional.

                Shift Logs:
                ${logTexts}
            `;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt
            });

            setInsightsContent(response.text || "No insights found.");
        } catch (e: any) {
            console.error(e);
            setInsightsContent(`<div class="p-4 bg-rose-50 text-rose-700 rounded-xl font-bold">تعذر توليد التحليل الذكي: ${e.message || 'فشل الاتصال'}</div>`);
        } finally {
            setIsGeneratingInsights(false);
        }
    };

    // --- Export Excel / CSV ---
    const handleExportExcel = () => {
        if (shiftLogs.length === 0) {
            setToast({ msg: 'No logs to export', type: 'info' });
            return;
        }

        const headers = [
            'ID',
            'التاريخ والوقت',
            'المُسلّم (Staff)',
            'مكان العمل (Location)',
            'الوردية (Shift)',
            'التصنيف (Category)',
            'بلاغ هام (Important)',
            'المحتوى والملاحظات (Content)',
            'المستلم المستهدف (Handover To)',
            'المستلم الفعلي (Received By)',
            'مكان المستلم (Receiver Location)',
            'توقيت الاستلام (Received At)',
            'ملاحظات الاستلام (Receiver Notes)'
        ];

        const rows = filteredLogs.map(l => [
            l.id,
            l.createdAt?.toDate ? l.createdAt.toDate().toLocaleString('ar-SA') : '',
            l.userName,
            l.location || '',
            t(`comm.shift.${l.shiftType || 'morning'}`),
            t(`comm.cat.${l.category || 'general'}`),
            l.isImportant ? 'نعم (هام)' : 'لا',
            `"${(l.content || '').replace(/"/g, '""')}"`,
            l.handoverToUserName || '',
            l.receivedBy || 'قيد الانتظار',
            l.receiverLocation || '',
            l.receivedAt?.toDate ? l.receivedAt.toDate().toLocaleString('ar-SA') : '',
            `"${(l.receiverNotes || '').replace(/"/g, '""')}"`
        ]);

        const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `Shift_Handover_Log_${filterYear}_${filterMonth}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setToast({ msg: t('comm.exportExcel') + ' ' + (t('success') || 'بنجاح'), type: 'success' });
    };

    // --- Print Shift Logbook ---
    const handlePrintLogs = () => {
        setIsPrinting(true);
        setTimeout(() => {
            const printContent = document.getElementById('printable-handover-logbook');
            if (printContent) {
                const w = window.open("", "_blank");
                if (w) {
                    w.document.write(`
                        <html dir="${dir}">
                        <head>
                            <title>${t('comm.logbook')} - ${currentDepartment?.name || ''}</title>
                            <style>
                                @page { size: A4 landscape; margin: 12mm; }
                                body { font-family: 'Segoe UI', 'Cairo', Tahoma, sans-serif; padding: 15px; color: #1e293b; background: #fff; }
                                table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; }
                                th { background: #0f172a; color: white; border: 1px solid #334155; padding: 8px 6px; font-weight: 800; text-align: ${dir === 'rtl' ? 'right' : 'left'}; }
                                td { border: 1px solid #cbd5e1; padding: 7px 6px; text-align: ${dir === 'rtl' ? 'right' : 'left'}; }
                                tr:nth-child(even) { background: #f8fafc; }
                                .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #0f172a; padding-bottom: 12px; margin-bottom: 15px; }
                                .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: bold; }
                                .badge-urgent { background: #fee2e2; color: #991b1b; }
                                .badge-received { background: #dcfce7; color: #166534; }
                                .badge-pending { background: #fef3c7; color: #92400e; }
                                .footer { margin-top: 25px; display: flex; justify-content: space-between; font-size: 11px; font-weight: bold; border-top: 1px solid #cbd5e1; padding-top: 12px; }
                            </style>
                        </head>
                        <body>
                            <div class="header">
                                <div>
                                    <h2 style="margin:0; font-size: 18px; color: #0f172a;">مستشفى الجدعاني / AL JEDAANI HOSPITAL</h2>
                                    <p style="margin:2px 0 0; color: #64748b; font-size: 12px;">قسم ${currentDepartment?.name || 'الأشعة والتصوير الطبي'} - سجل تسليم الورديات</p>
                                </div>
                                <div style="text-align: center;">
                                    <h1 style="margin:0; font-size: 20px; font-weight: 900; color: #1e293b;">${t('comm.logbook')}</h1>
                                    <span style="font-size: 12px; color: #475569; font-weight: bold;">الفترة: ${filterMonth} / ${filterYear}</span>
                                </div>
                                <div style="text-align: ${dir === 'rtl' ? 'left' : 'right'}; font-size: 11px; color: #64748b;">
                                    <div>تاريخ الطباعة: ${new Date().toLocaleDateString('ar-SA')}</div>
                                    <div>إجمالي السجلات: ${filteredLogs.length}</div>
                                </div>
                            </div>

                            ${printContent.innerHTML}

                            <div class="footer">
                                <div>توقيع مسؤول الوردية المسلم: ___________________</div>
                                <div>توقيع مسؤول الوردية المستلم: ___________________</div>
                                <div>اعتماد رئيس القسم / المشرف: ___________________</div>
                            </div>
                        </body>
                        </html>
                    `);
                    w.document.close();
                    w.focus();
                    setTimeout(() => w.print(), 400);
                }
            }
            setIsPrinting(false);
        }, 300);
    };

    // --- Filtered Logs Computation ---
    const filteredLogs = useMemo(() => {
        return shiftLogs.filter(log => {
            // Category / Tab filter
            if (categoryFilter === 'handovers' && log.type !== 'handover') return false;
            if (categoryFilter === 'pending' && log.receivedBy) return false;
            if (categoryFilter === 'urgent' && !log.isImportant) return false;
            if (categoryFilter === 'myLogs' && log.userId !== userId) return false;

            // Text search
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const matchUser = (log.userName || '').toLowerCase().includes(q);
                const matchLoc = (log.location || '').toLowerCase().includes(q);
                const matchContent = (log.content || '').toLowerCase().includes(q);
                const matchReceiver = (log.receivedBy || '').toLowerCase().includes(q);
                const matchTasks = (log.pendingTasks || []).some(t => t.toLowerCase().includes(q));
                if (!matchUser && !matchLoc && !matchContent && !matchReceiver && !matchTasks) {
                    return false;
                }
            }

            return true;
        });
    }, [shiftLogs, categoryFilter, searchQuery, userId]);

    // Metrics
    const metrics = useMemo(() => {
        const total = shiftLogs.length;
        const received = shiftLogs.filter(l => l.receivedBy).length;
        const pending = total - received;
        const urgent = shiftLogs.filter(l => l.isImportant).length;
        return { total, received, pending, urgent };
    }, [shiftLogs]);

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 p-6 md:p-10 max-w-7xl mx-auto space-y-6" dir={dir}>
                <SkeletonLoader type="card" count={1} />
                <div className="grid md:grid-cols-12 gap-6">
                    <div className="md:col-span-4"><SkeletonLoader type="card" count={2} /></div>
                    <div className="md:col-span-8"><SkeletonLoader type="card" count={4} /></div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-50 pb-24 font-sans text-slate-800" dir={dir}>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            {/* Top Hero Banner */}
            <div className="bg-slate-900 text-white shadow-xl border-b border-slate-800">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 md:py-8">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <span className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-2xl border border-indigo-500/30">
                                    <i className="fas fa-handshake text-xl"></i>
                                </span>
                                <div>
                                    <h1 className="text-2xl md:text-3xl font-black tracking-tight">{t('comm.title')}</h1>
                                    <p className="text-xs md:text-sm text-slate-400 font-medium">{t('comm.subtitle')}</p>
                                </div>
                            </div>
                        </div>

                        {/* Top Action Buttons */}
                        <div className="flex flex-wrap items-center gap-2.5">
                            {isSupervisor && (
                                <button
                                    onClick={handleGenerateInsights}
                                    className="px-3.5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-900/30 transition-all hover:scale-105"
                                >
                                    <i className="fas fa-brain"></i>
                                    <span>{t('comm.aiAnalysis')}</span>
                                </button>
                            )}

                            <button
                                onClick={handleExportExcel}
                                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 rounded-xl text-xs font-bold flex items-center gap-2 transition-all hover:scale-105"
                            >
                                <i className="fas fa-file-excel"></i>
                                <span>{t('comm.exportExcel')}</span>
                            </button>

                            <button
                                onClick={handlePrintLogs}
                                disabled={isPrinting}
                                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold flex items-center gap-2 transition-all hover:scale-105"
                            >
                                {isPrinting ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-print"></i>}
                                <span>{t('print')}</span>
                            </button>
                        </div>
                    </div>

                    {/* Quick Stats Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-800/80">
                        <div className="bg-slate-800/60 backdrop-blur-sm p-3.5 rounded-2xl border border-slate-700/60 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-lg">
                                <i className="fas fa-clipboard-check"></i>
                            </div>
                            <div>
                                <span className="text-[11px] text-slate-400 font-bold block">{t('comm.stats.total')}</span>
                                <span className="text-xl font-black text-white">{metrics.total}</span>
                            </div>
                        </div>

                        <div className="bg-slate-800/60 backdrop-blur-sm p-3.5 rounded-2xl border border-slate-700/60 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-lg">
                                <i className="fas fa-check-double"></i>
                            </div>
                            <div>
                                <span className="text-[11px] text-slate-400 font-bold block">{t('comm.stats.received')}</span>
                                <span className="text-xl font-black text-emerald-400">{metrics.received}</span>
                            </div>
                        </div>

                        <div className="bg-slate-800/60 backdrop-blur-sm p-3.5 rounded-2xl border border-slate-700/60 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-lg">
                                <i className="fas fa-clock"></i>
                            </div>
                            <div>
                                <span className="text-[11px] text-slate-400 font-bold block">{t('comm.stats.pending')}</span>
                                <span className="text-xl font-black text-amber-400">{metrics.pending}</span>
                            </div>
                        </div>

                        <div className="bg-slate-800/60 backdrop-blur-sm p-3.5 rounded-2xl border border-slate-700/60 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold text-lg">
                                <i className="fas fa-exclamation-triangle"></i>
                            </div>
                            <div>
                                <span className="text-[11px] text-slate-400 font-bold block">{t('comm.stats.urgent')}</span>
                                <span className="text-xl font-black text-rose-400">{metrics.urgent}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-6">
                {/* Navigation Tabs */}
                <div className="flex items-center justify-between gap-4 mb-6 border-b border-slate-200 pb-2">
                    <div className="flex gap-3">
                        <button
                            onClick={() => setActiveTab('logbook')}
                            className={`pb-2.5 px-4 text-sm font-bold transition-all border-b-2 flex items-center gap-2 ${
                                activeTab === 'logbook'
                                    ? 'border-indigo-600 text-indigo-600'
                                    : 'border-transparent text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            <i className="fas fa-exchange-alt"></i>
                            <span>{t('comm.logbook')}</span>
                            <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-bold">
                                {metrics.total}
                            </span>
                        </button>

                        <button
                            onClick={() => setActiveTab('announcements')}
                            className={`pb-2.5 px-4 text-sm font-bold transition-all border-b-2 flex items-center gap-2 ${
                                activeTab === 'announcements'
                                    ? 'border-orange-500 text-orange-600'
                                    : 'border-transparent text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            <i className="fas fa-bullhorn"></i>
                            <span>{t('comm.announcements')}</span>
                            {announcements.length > 0 && (
                                <span className="text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full font-bold">
                                    {announcements.length}
                                </span>
                            )}
                        </button>
                    </div>

                    {/* Month/Year Filter */}
                    <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-2xl border border-slate-200 shadow-sm">
                        <i className="fas fa-calendar-alt text-slate-400 text-xs"></i>
                        <select
                            className="bg-transparent border-none text-xs font-bold text-slate-700 outline-none cursor-pointer"
                            value={filterMonth}
                            onChange={e => setFilterMonth(e.target.value)}
                        >
                            {[...Array(12)].map((_, i) => (
                                <option key={i} value={i + 1}>
                                    {new Date(2026, i, 1).toLocaleString(dir === 'rtl' ? 'ar-SA' : 'en-US', { month: 'short' })} ({i + 1})
                                </option>
                            ))}
                        </select>
                        <select
                            className="bg-transparent border-none text-xs font-bold text-slate-700 outline-none cursor-pointer"
                            value={filterYear}
                            onChange={e => setFilterYear(e.target.value)}
                        >
                            {[2024, 2025, 2026, 2027].map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* --- TAB 1: SHIFT HANDOVER LOGBOOK --- */}
                {activeTab === 'logbook' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                        {/* LEFT COLUMN: Modern Handover Submission Form (5 Cols) */}
                        <div className="lg:col-span-5 space-y-4">
                            <div className="bg-white rounded-3xl p-5 md:p-6 shadow-sm border border-slate-200/80 sticky top-4">
                                <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                                            <i className="fas fa-pen-nib"></i>
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-900 text-base">{t('comm.log.title')}</h3>
                                            <p className="text-[11px] text-slate-400 font-medium">
                                                {userName} ({t(`comm.shift.${logShiftType}`)})
                                            </p>
                                        </div>
                                    </div>

                                    {/* Mode Toggle: Quick vs SBAR */}
                                    <div className="flex bg-slate-100 p-1 rounded-xl">
                                        <button
                                            type="button"
                                            onClick={() => setHandoverMode('quick')}
                                            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                                                handoverMode === 'quick' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
                                            }`}
                                        >
                                            {t('comm.mode.quick')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setHandoverMode('sbar')}
                                            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                                                handoverMode === 'sbar' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
                                            }`}
                                        >
                                            {t('comm.mode.sbar')}
                                        </button>
                                    </div>
                                </div>

                                <form onSubmit={handleLogSubmit} className="space-y-4">
                                    {/* Location & Shift Period */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-600 mb-1.5">
                                                <i className="fas fa-map-marker-alt text-indigo-500 rtl:ml-1 ltr:mr-1"></i>
                                                {t('comm.log.loc')}
                                            </label>
                                            <select
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-100 transition-all"
                                                value={logLocation}
                                                onChange={e => setLogLocation(e.target.value)}
                                                required
                                            >
                                                <option value="">...</option>
                                                {locations.map(loc => (
                                                    <option key={loc.id} value={loc.name}>{loc.name}</option>
                                                ))}
                                                <option value="القسم العام / Main Floor">القسم العام / Main Floor</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-600 mb-1.5">
                                                <i className="fas fa-sun text-amber-500 rtl:ml-1 ltr:mr-1"></i>
                                                {t('comm.shift.type')}
                                            </label>
                                            <select
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-100 transition-all"
                                                value={logShiftType}
                                                onChange={e => setLogShiftType(e.target.value as any)}
                                            >
                                                <option value="morning">{t('comm.shift.morning')}</option>
                                                <option value="evening">{t('comm.shift.evening')}</option>
                                                <option value="night">{t('comm.shift.night')}</option>
                                                <option value="oncall">{t('comm.shift.oncall')}</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Handover Target (Filtered to Same Department Only) */}
                                    <div>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <label className="block text-[11px] font-bold text-slate-600">
                                                <i className="fas fa-user-check text-blue-500 rtl:ml-1 ltr:mr-1"></i>
                                                {t('comm.handover.to')}
                                            </label>
                                            <span className="text-[10px] text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded-md">
                                                {currentDepartment?.name ? `موظفي قسم ${currentDepartment.name}` : 'موظفي القسم'}
                                            </span>
                                        </div>
                                        <select
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100"
                                            value={logHandoverTo}
                                            onChange={e => setLogHandoverTo(e.target.value)}
                                        >
                                            <option value="">{t('comm.handover.toAnyone')} ({dir === 'rtl' ? 'أي موظف في نفس القسم' : 'Any same-department staff'})</option>
                                            {departmentUsers.map(u => (
                                                <option key={u.id} value={u.id}>{u.name} ({u.role || 'Staff'})</option>
                                            ))}
                                        </select>
                                        {departmentUsers.length === 0 && (
                                            <p className="text-[10px] text-amber-600 font-medium mt-1">
                                                <i className="fas fa-info-circle rtl:ml-1 ltr:mr-1"></i>
                                                {dir === 'rtl' ? 'لم يتم تعيين موظفين بعد لهذا القسم' : 'No staff currently assigned to this department'}
                                            </p>
                                        )}
                                    </div>

                                    {/* Primary Category Selector */}
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-600 mb-1.5">{t('comm.log.cat')}</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {[
                                                { id: 'general', label: t('comm.cat.general'), icon: 'fa-comments', color: 'text-indigo-600' },
                                                { id: 'machine', label: t('comm.cat.machine'), icon: 'fa-microchip', color: 'text-amber-600' },
                                                { id: 'patient', label: t('comm.cat.patient'), icon: 'fa-user-injured', color: 'text-emerald-600' },
                                                { id: 'supply', label: t('comm.cat.supply'), icon: 'fa-boxes', color: 'text-purple-600' }
                                            ].map(cat => (
                                                <button
                                                    key={cat.id}
                                                    type="button"
                                                    onClick={() => setLogCategory(cat.id as any)}
                                                    className={`py-2 px-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                                                        logCategory === cat.id
                                                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
                                                            : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                                                    }`}
                                                >
                                                    <i className={`fas ${cat.icon}`}></i>
                                                    <span className="truncate">{cat.label}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Smart Checklist Toggles */}
                                    <div className="bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/80">
                                        <label className="text-[11px] font-black text-slate-700 mb-2 flex items-center gap-1.5">
                                            <i className="fas fa-tasks text-indigo-500"></i>
                                            <span>فحص واستلام البنود (Smart Checklist):</span>
                                        </label>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                                            {[
                                                { key: 'devices', label: t('check.devices'), icon: 'fa-stethoscope' },
                                                { key: 'inventory', label: t('check.inventory'), icon: 'fa-archive' },
                                                { key: 'keys', label: t('check.keys'), icon: 'fa-key' },
                                                { key: 'clean', label: t('check.clean'), icon: 'fa-broom' },
                                                { key: 'pacsWorkstation', label: t('check.pacsWorkstation'), icon: 'fa-desktop' },
                                                { key: 'consumables', label: t('check.consumables'), icon: 'fa-syringe' }
                                            ].map(item => {
                                                const isChecked = checklist[item.key as keyof typeof checklist];
                                                return (
                                                    <button
                                                        key={item.key}
                                                        type="button"
                                                        onClick={() => toggleCheck(item.key as any)}
                                                        className={`p-2 rounded-xl text-[11px] font-bold border flex items-center gap-1.5 transition-all text-start ${
                                                            isChecked
                                                                ? 'bg-emerald-50 border-emerald-300 text-emerald-700 shadow-sm'
                                                                : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                                                        }`}
                                                    >
                                                        <i className={`fas ${isChecked ? 'fa-check-circle text-emerald-600' : 'fa-circle text-slate-300'}`}></i>
                                                        <span className="truncate">{item.label}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* SBAR MODE INPUTS */}
                                    {handoverMode === 'sbar' && (
                                        <div className="space-y-2.5 bg-indigo-50/40 p-3.5 rounded-2xl border border-indigo-100">
                                            <div>
                                                <label className="block text-[11px] font-black text-indigo-900 mb-1">
                                                    🔴 S - {t('comm.sbar.s')}
                                                </label>
                                                <input
                                                    type="text"
                                                    value={sbarSituation}
                                                    onChange={e => setSbarSituation(e.target.value)}
                                                    placeholder="الحالة الراهنة والأجهزة الحالية..."
                                                    className="w-full bg-white border border-indigo-200 rounded-xl p-2 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-300"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[11px] font-black text-indigo-900 mb-1">
                                                    🔵 B - {t('comm.sbar.b')}
                                                </label>
                                                <input
                                                    type="text"
                                                    value={sbarBackground}
                                                    onChange={e => setSbarBackground(e.target.value)}
                                                    placeholder="الخلفية وسير العمل في الوردية..."
                                                    className="w-full bg-white border border-indigo-200 rounded-xl p-2 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-300"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[11px] font-black text-indigo-900 mb-1">
                                                    🟡 A - {t('comm.sbar.a')}
                                                </label>
                                                <input
                                                    type="text"
                                                    value={sbarAssessment}
                                                    onChange={e => setSbarAssessment(e.target.value)}
                                                    placeholder="الملاحظات والمشاكل المحتملة..."
                                                    className="w-full bg-white border border-indigo-200 rounded-xl p-2 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-300"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[11px] font-black text-indigo-900 mb-1">
                                                    🟢 R - {t('comm.sbar.r')}
                                                </label>
                                                <input
                                                    type="text"
                                                    value={sbarRecommendation}
                                                    onChange={e => setSbarRecommendation(e.target.value)}
                                                    placeholder="التوصيات والخطوات المطلوبة..."
                                                    className="w-full bg-white border border-indigo-200 rounded-xl p-2 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-300"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* Pending Tasks Builder */}
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-600 mb-1.5">
                                            <i className="fas fa-list-ol text-indigo-500 rtl:ml-1 ltr:mr-1"></i>
                                            {t('comm.pending.tasks')}
                                        </label>
                                        <div className="flex gap-2 mb-2">
                                            <input
                                                type="text"
                                                value={newTaskInput}
                                                onChange={e => setNewTaskInput(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddPendingTask(); } }}
                                                placeholder={t('comm.pending.taskPlaceholder')}
                                                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100"
                                            />
                                            <button
                                                type="button"
                                                onClick={handleAddPendingTask}
                                                className="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-3 py-2 rounded-xl text-xs font-bold transition-colors"
                                            >
                                                <i className="fas fa-plus"></i>
                                            </button>
                                        </div>

                                        {pendingTasks.length > 0 && (
                                            <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                                                {pendingTasks.map((task, i) => (
                                                    <div key={i} className="flex items-center justify-between bg-indigo-50/50 border border-indigo-100 px-2.5 py-1.5 rounded-xl text-xs text-indigo-950 font-medium">
                                                        <span className="truncate">▫️ {task}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemovePendingTask(i)}
                                                            className="text-rose-400 hover:text-rose-600 rtl:mr-2 ltr:ml-2"
                                                        >
                                                            <i className="fas fa-times"></i>
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Handover Details & Notes (Voice & Text) */}
                                    <div>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <label className="text-[11px] font-bold text-slate-600">{t('comm.log.content')}</label>
                                            <span className="text-[10px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md font-bold">
                                                <i className="fas fa-microphone rtl:ml-1 ltr:mr-1"></i> {t('voice') || 'صوتي'}
                                            </span>
                                        </div>

                                        {/* Quick Templates Chips */}
                                        <div className="flex gap-1.5 flex-wrap mb-2">
                                            {quickTemplates.map((tpl, idx) => (
                                                <button
                                                    key={idx}
                                                    type="button"
                                                    onClick={() => handleApplyTemplate(tpl)}
                                                    className="bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 text-[10px] px-2.5 py-1 rounded-lg border border-slate-200/80 transition-colors font-medium text-start"
                                                >
                                                    {tpl.slice(0, 26)}...
                                                </button>
                                            ))}
                                        </div>

                                        <VoiceInput
                                            isTextArea
                                            value={logContent}
                                            onChange={setLogContent}
                                            onTranscript={handleDictation}
                                            placeholder={t('comm.log.content') + '...'}
                                        />
                                    </div>

                                    {/* Urgent Alert Checkbox */}
                                    <div className={`flex items-center gap-2.5 p-3 rounded-2xl border transition-all ${
                                        logImportant
                                            ? 'bg-rose-50 border-rose-200 text-rose-700 shadow-sm'
                                            : 'bg-slate-50 border-slate-200 text-slate-600'
                                    }`}>
                                        <input
                                            type="checkbox"
                                            id="isImportant"
                                            checked={logImportant}
                                            onChange={e => setLogImportant(e.target.checked)}
                                            className="w-4 h-4 text-rose-600 rounded focus:ring-rose-500 cursor-pointer"
                                        />
                                        <label htmlFor="isImportant" className="text-xs font-bold cursor-pointer flex-1">
                                            <i className="fas fa-exclamation-circle text-rose-500 rtl:ml-1 ltr:mr-1"></i>
                                            {t('comm.log.important')}
                                        </label>
                                    </div>

                                    {/* Submit Button */}
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-2xl font-black text-sm shadow-lg shadow-indigo-200 transition-transform active:scale-95 disabled:opacity-70 disabled:scale-100 flex items-center justify-center gap-2"
                                    >
                                        {isSubmitting ? (
                                            <i className="fas fa-spinner fa-spin"></i>
                                        ) : (
                                            <>
                                                <i className="fas fa-paper-plane"></i>
                                                <span>{t('comm.log.btn')}</span>
                                            </>
                                        )}
                                    </button>
                                </form>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: Handover Feed & Timeline (7 Cols) */}
                        <div className="lg:col-span-7 space-y-4">
                            {/* Filter and Search Bar */}
                            <div className="bg-white p-3.5 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-3">
                                {/* Search Input */}
                                <div className="relative w-full md:w-64">
                                    <i className="fas fa-search absolute rtl:right-3 ltr:left-3 top-2.5 text-slate-400 text-xs"></i>
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        placeholder={t('comm.search.placeholder')}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl rtl:pr-8 rtl:pl-3 ltr:pl-8 ltr:pr-3 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100"
                                    />
                                    {searchQuery && (
                                        <button
                                            onClick={() => setSearchQuery('')}
                                            className="absolute rtl:left-2.5 ltr:right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs"
                                        >
                                            <i className="fas fa-times"></i>
                                        </button>
                                    )}
                                </div>

                                {/* Filter Tabs */}
                                <div className="flex items-center gap-1 overflow-x-auto w-full md:w-auto no-scrollbar pb-1 md:pb-0">
                                    {[
                                        { id: 'all', label: t('comm.filter.all'), icon: 'fa-list' },
                                        { id: 'pending', label: t('comm.filter.pending'), icon: 'fa-clock', count: metrics.pending },
                                        { id: 'urgent', label: t('comm.filter.urgent'), icon: 'fa-exclamation-triangle', count: metrics.urgent },
                                        { id: 'myLogs', label: t('comm.filter.myLogs'), icon: 'fa-user' }
                                    ].map(tab => (
                                        <button
                                            key={tab.id}
                                            onClick={() => setCategoryFilter(tab.id as any)}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                                                categoryFilter === tab.id
                                                    ? 'bg-slate-900 text-white shadow-sm'
                                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                            }`}
                                        >
                                            <i className={`fas ${tab.icon} text-[10px]`}></i>
                                            <span>{tab.label}</span>
                                            {tab.count !== undefined && tab.count > 0 && (
                                                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                                                    categoryFilter === tab.id ? 'bg-white text-slate-900' : 'bg-slate-200 text-slate-700'
                                                }`}>
                                                    {tab.count}
                                                </span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Feed List */}
                            <div className="space-y-4">
                                {filteredLogs.length === 0 ? (
                                    <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/80 shadow-sm">
                                        <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3 text-2xl">
                                            <i className="fas fa-clipboard-list"></i>
                                        </div>
                                        <h4 className="font-bold text-slate-700 text-base mb-1">
                                            {dir === 'rtl' ? 'لا توجد سجلات تسليم مطابقة' : 'No matching handover logs found'}
                                        </h4>
                                        <p className="text-xs text-slate-400 max-w-sm mx-auto">
                                            {dir === 'rtl'
                                                ? 'قم بتسجيل تسليم وردية جديد من النموذج الأيمن أو تغيير خيارات الفلترة والتاريخ.'
                                                : 'Record a new shift handover from the form or adjust your date filter.'}
                                        </p>
                                    </div>
                                ) : (
                                    filteredLogs.map(log => {
                                        const isMyLog = log.userId === userId;
                                        const isReceived = !!log.receivedBy;
                                        const shiftBadge = t(`comm.shift.${log.shiftType || 'morning'}`);
                                        const categoryBadge = t(`comm.cat.${log.category || 'general'}`);

                                        return (
                                            <div
                                                key={log.id}
                                                className={`bg-white rounded-3xl p-5 shadow-sm border transition-all hover:shadow-md relative group ${
                                                    log.isImportant
                                                        ? 'border-rose-300 bg-gradient-to-r from-rose-50/40 via-white to-white'
                                                        : 'border-slate-200'
                                                }`}
                                            >
                                                {/* Header Row: Staff Profile & Meta */}
                                                <div className="flex items-start justify-between gap-3 mb-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-11 h-11 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-base shadow-sm">
                                                            {log.userName ? log.userName.charAt(0).toUpperCase() : 'U'}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <h4 className="font-bold text-slate-900 text-sm">{log.userName}</h4>
                                                                {log.location && (
                                                                    <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-lg">
                                                                        <i className="fas fa-map-marker-alt text-indigo-500 rtl:ml-1 ltr:mr-1"></i>
                                                                        {log.location}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                <span className="text-[10px] text-slate-400 font-medium">
                                                                    {log.createdAt?.toDate ? log.createdAt.toDate().toLocaleString('ar-SA') : ''}
                                                                </span>
                                                                <span className="text-[10px] font-bold px-2 py-0.2 rounded-md bg-indigo-50 text-indigo-700">
                                                                    {shiftBadge}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Category & Status Badges */}
                                                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                                        {log.isImportant && (
                                                            <span className="bg-rose-100 text-rose-700 text-[10px] font-black px-2.5 py-1 rounded-full flex items-center gap-1 animate-pulse">
                                                                <i className="fas fa-exclamation-triangle"></i>
                                                                <span>{t('comm.prio.urgent')}</span>
                                                            </span>
                                                        )}
                                                        <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2.5 py-1 rounded-full border border-slate-200">
                                                            {categoryBadge}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Target Handover To Recipient Banner */}
                                                {log.handoverToUserName && (
                                                    <div className="mb-3 bg-blue-50/70 text-blue-800 px-3 py-1.5 rounded-xl text-xs font-bold border border-blue-100 flex items-center gap-2">
                                                        <i className="fas fa-user-tag text-blue-500"></i>
                                                        <span>{t('comm.handover.to')}: <strong>{log.handoverToUserName}</strong></span>
                                                    </div>
                                                )}

                                                {/* Main Content / SBAR */}
                                                <div className="text-slate-700 text-xs md:text-sm leading-relaxed whitespace-pre-wrap mb-4 bg-slate-50/60 p-3.5 rounded-2xl border border-slate-100 font-medium">
                                                    {log.content}
                                                </div>

                                                {/* Checklist Badges if checked */}
                                                {log.checklist && Object.values(log.checklist).some(Boolean) && (
                                                    <div className="flex flex-wrap gap-1.5 mb-3">
                                                        {log.checklist.devices && (
                                                            <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-md border border-emerald-200">
                                                                ✓ {t('check.devices')}
                                                            </span>
                                                        )}
                                                        {log.checklist.inventory && (
                                                            <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-md border border-emerald-200">
                                                                ✓ {t('check.inventory')}
                                                            </span>
                                                        )}
                                                        {log.checklist.keys && (
                                                            <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-md border border-emerald-200">
                                                                ✓ {t('check.keys')}
                                                            </span>
                                                        )}
                                                        {log.checklist.clean && (
                                                            <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-md border border-emerald-200">
                                                                ✓ {t('check.clean')}
                                                            </span>
                                                        )}
                                                        {log.checklist.pacsWorkstation && (
                                                            <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-md border border-emerald-200">
                                                                ✓ {t('check.pacsWorkstation')}
                                                            </span>
                                                        )}
                                                        {log.checklist.consumables && (
                                                            <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-md border border-emerald-200">
                                                                ✓ {t('check.consumables')}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Pending Tasks List */}
                                                {log.pendingTasks && log.pendingTasks.length > 0 && (
                                                    <div className="bg-amber-50/60 border border-amber-200/80 rounded-2xl p-3 mb-3">
                                                        <span className="text-[11px] font-black text-amber-900 block mb-1.5">
                                                            📌 {t('comm.pending.tasks')}:
                                                        </span>
                                                        <div className="space-y-1">
                                                            {log.pendingTasks.map((pt, pIdx) => (
                                                                <div key={pIdx} className="text-xs text-amber-950 font-medium flex items-center gap-1.5">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                                                    <span>{pt}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Receipt Status & Action Footer */}
                                                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
                                                    {/* Received / Acknowledged Banner */}
                                                    {isReceived ? (
                                                        <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 px-3.5 py-1.5 rounded-xl border border-emerald-200">
                                                            <i className="fas fa-check-double text-emerald-600"></i>
                                                            <span>
                                                                {t('comm.receivedBy')}: <strong>{log.receivedBy}</strong>
                                                                {log.receiverLocation && ` (${log.receiverLocation})`}
                                                            </span>
                                                            <span className="text-[10px] text-emerald-600 font-normal">
                                                                • {log.receivedAt?.toDate ? log.receivedAt.toDate().toLocaleTimeString('ar-SA') : ''}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-bold text-amber-700 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200 flex items-center gap-1.5">
                                                                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                                                                <span>{t('comm.stats.pending')}</span>
                                                            </span>

                                                            {/* Acknowledge & Receive Button - STRICT SAME DEPARTMENT ONLY */}
                                                            {isUserInDepartment(log.departmentId) ? (
                                                                (!isMyLog || isSupervisor) && (
                                                                    <button
                                                                        onClick={() => handleOpenReceiveModal(log)}
                                                                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black px-3.5 py-1.5 rounded-xl shadow-md shadow-indigo-100 flex items-center gap-1.5 transition-all hover:scale-105"
                                                                    >
                                                                        <i className="fas fa-check-circle"></i>
                                                                        <span>{t('comm.receive')}</span>
                                                                    </button>
                                                                )
                                                            ) : (
                                                                <span className="text-[11px] font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 flex items-center gap-1" title="يحق فقط لموظفي نفس القسم استلام الوردية">
                                                                    <i className="fas fa-lock text-slate-400"></i>
                                                                    <span>خاص بموظفي القسم</span>
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* Utility Actions: Copy to WhatsApp, Edit, Delete */}
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => handleCopyLogSummary(log)}
                                                            title="Copy Handover Report"
                                                            className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                                                        >
                                                            <i className="fas fa-copy text-xs"></i>
                                                        </button>

                                                        {(isSupervisor || isMyLog) && (
                                                            <button
                                                                onClick={() => setEditLogModal({ isOpen: true, log })}
                                                                title={t('edit')}
                                                                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                                                            >
                                                                <i className="fas fa-pen text-xs"></i>
                                                            </button>
                                                        )}

                                                        {isSupervisor && (
                                                            <button
                                                                onClick={() => handleDeleteLog(log.id)}
                                                                title={t('delete')}
                                                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                                                            >
                                                                <i className="fas fa-trash text-xs"></i>
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* --- TAB 2: ANNOUNCEMENTS & OFFICIAL DECISIONS --- */}
                {activeTab === 'announcements' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                        {/* Supervisor Post Announcement Form (5 cols) */}
                        {isSupervisor && (
                            <div className="lg:col-span-4">
                                <div className="bg-white rounded-3xl p-5 md:p-6 shadow-sm border border-orange-200 sticky top-4">
                                    <div className="flex items-center gap-2.5 pb-4 mb-4 border-b border-slate-100">
                                        <div className="w-9 h-9 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center font-bold">
                                            <i className="fas fa-bullhorn"></i>
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-900 text-base">{t('comm.ann.new')}</h3>
                                            <p className="text-[11px] text-slate-400">{t('comm.ann.post')}</p>
                                        </div>
                                    </div>

                                    <form onSubmit={handleAddAnnouncement} className="space-y-4">
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-600 mb-1">{t('comm.ann.title')}</label>
                                            <input
                                                type="text"
                                                value={newAnnounceTitle}
                                                onChange={e => setNewAnnounceTitle(e.target.value)}
                                                placeholder={t('comm.ann.title') + '...'}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-orange-200"
                                                required
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-600 mb-1">{t('comm.ann.content')}</label>
                                            <textarea
                                                value={newAnnounceContent}
                                                onChange={e => setNewAnnounceContent(e.target.value)}
                                                placeholder={t('comm.ann.content') + '...'}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-orange-200 min-h-[120px]"
                                                required
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-600 mb-1">{t('comm.ann.priority')}</label>
                                            <select
                                                value={newAnnouncePriority}
                                                onChange={e => setNewAnnouncePriority(e.target.value as any)}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-orange-200"
                                            >
                                                <option value="normal">{t('comm.prio.normal')}</option>
                                                <option value="urgent">{t('comm.prio.urgent')}</option>
                                                <option value="critical">{t('comm.prio.critical')}</option>
                                            </select>
                                        </div>

                                        <button
                                            type="submit"
                                            disabled={isPostingAnnounce}
                                            className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-2xl font-black text-xs shadow-lg shadow-orange-200 transition-all hover:scale-105 flex items-center justify-center gap-2"
                                        >
                                            {isPostingAnnounce ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-paper-plane"></i>}
                                            <span>{t('comm.ann.post')}</span>
                                        </button>
                                    </form>
                                </div>
                            </div>
                        )}

                        {/* Announcements Feed (8 cols or 12 cols) */}
                        <div className={`${isSupervisor ? 'lg:col-span-8' : 'lg:col-span-12'} space-y-4`}>
                            {announcementsLoading ? (
                                <SkeletonLoader type="card" count={3} />
                            ) : announcements.length === 0 ? (
                                <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/80 shadow-sm">
                                    <i className="fas fa-bullhorn text-4xl text-slate-300 mb-3"></i>
                                    <h4 className="font-bold text-slate-700 text-base mb-1">
                                        {dir === 'rtl' ? 'لا توجد تعاميم حالياً' : 'No announcements posted yet'}
                                    </h4>
                                    <p className="text-xs text-slate-400">
                                        {dir === 'rtl' ? 'سيتم نشر القرارات والتعاميم الإدارية الهامة هنا فور صدورها.' : 'Official administrative updates will appear here.'}
                                    </p>
                                </div>
                            ) : (
                                announcements.map(ann => {
                                    const isCritical = ann.priority === 'critical';
                                    const isUrgent = ann.priority === 'urgent';

                                    return (
                                        <div
                                            key={ann.id}
                                            className={`bg-white rounded-3xl p-6 shadow-sm border transition-all hover:shadow-md relative group ${
                                                isCritical
                                                    ? 'border-rose-300 bg-rose-50/20'
                                                    : isUrgent
                                                    ? 'border-amber-300 bg-amber-50/20'
                                                    : 'border-slate-200'
                                            }`}
                                        >
                                            {/* Header */}
                                            <div className="flex items-start justify-between gap-4 mb-3">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <h4 className="font-black text-lg text-slate-900">{ann.title}</h4>
                                                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                                            isCritical
                                                                ? 'bg-rose-100 text-rose-700 animate-pulse'
                                                                : isUrgent
                                                                ? 'bg-amber-100 text-amber-700'
                                                                : 'bg-blue-50 text-blue-700'
                                                        }`}>
                                                            {t(`comm.prio.${ann.priority}`)}
                                                        </span>
                                                    </div>
                                                    <span className="text-[11px] text-slate-400 font-medium">
                                                        {t('from')}: <strong className="text-slate-700">{ann.createdBy}</strong> • {ann.createdAt?.toDate ? ann.createdAt.toDate().toLocaleDateString('ar-SA') : ''}
                                                    </span>
                                                </div>

                                                {/* Supervisor Actions */}
                                                {isSupervisor && (
                                                    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            onClick={() => setEditAnnounceModal({ isOpen: true, ann })}
                                                            className="p-2 text-slate-400 hover:text-blue-600 rounded-xl hover:bg-blue-50"
                                                        >
                                                            <i className="fas fa-pen text-xs"></i>
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteAnnouncement(ann.id)}
                                                            className="p-2 text-slate-400 hover:text-rose-600 rounded-xl hover:bg-rose-50"
                                                        >
                                                            <i className="fas fa-trash text-xs"></i>
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Content */}
                                            <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap mb-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                                                {ann.content}
                                            </p>

                                            {/* Footer Seen By */}
                                            <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
                                                <div className="text-slate-500 font-semibold flex items-center gap-1.5">
                                                    <i className="fas fa-check-circle text-emerald-500"></i>
                                                    <span>{dir === 'rtl' ? 'تم تعميمه على كافة منسوبي القسم' : 'Broadcasted to all department staff'}</span>
                                                </div>

                                                {isSupervisor && (
                                                    <button
                                                        onClick={() => setViewersModal({ isOpen: true, title: ann.title, viewers: ann.seenBy || [] })}
                                                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-colors"
                                                    >
                                                        <i className="fas fa-eye text-indigo-500"></i>
                                                        <span>{t('comm.views')}: {ann.seenBy ? ann.seenBy.length : 0}</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* --- HIDDEN PRINT TABLE --- */}
            <div id="printable-handover-logbook" className="hidden">
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>التاريخ والوقت</th>
                            <th>المُسلّم (Staff)</th>
                            <th>المكان (Location)</th>
                            <th>الوردية (Shift)</th>
                            <th>التصنيف</th>
                            <th>التفاصيل والملاحظات</th>
                            <th>المهام المعلقة</th>
                            <th>المستلم الفعلي</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredLogs.map((log, index) => (
                            <tr key={log.id}>
                                <td>{index + 1}</td>
                                <td>{log.createdAt?.toDate ? log.createdAt.toDate().toLocaleString('ar-SA') : ''}</td>
                                <td><strong>{log.userName}</strong></td>
                                <td>{log.location || '-'}</td>
                                <td>{t(`comm.shift.${log.shiftType || 'morning'}`)}</td>
                                <td>{t(`comm.cat.${log.category || 'general'}`)}</td>
                                <td>
                                    {log.content}
                                    {log.isImportant && <span className="badge badge-urgent rtl:mr-1 ltr:ml-1">(!بلاغ هام)</span>}
                                </td>
                                <td>
                                    {log.pendingTasks && log.pendingTasks.length > 0
                                        ? log.pendingTasks.join(' • ')
                                        : '-'}
                                </td>
                                <td>
                                    {log.receivedBy ? (
                                        <div>
                                            <span className="badge badge-received">{log.receivedBy}</span>
                                            <div style={{ fontSize: '9px', color: '#64748b' }}>{log.receiverLocation || ''}</div>
                                        </div>
                                    ) : (
                                        <span className="badge badge-pending">قيد الانتظار</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* --- MODAL: CONFIRM RECEIPT --- */}
            <Modal
                isOpen={receiveModal.isOpen}
                onClose={() => setReceiveModal({ isOpen: false, log: null })}
                title={t('comm.receive.title')}
            >
                {receiveModal.log && (
                    <div className="space-y-4">
                        <div className="bg-indigo-50/70 p-4 rounded-2xl border border-indigo-100 text-xs text-indigo-950 space-y-1.5">
                            <div className="flex items-center justify-between pb-2 border-b border-indigo-100/70">
                                <div><strong>المُسلّم:</strong> {receiveModal.log.userName} ({receiveModal.log.location})</div>
                                <span className="bg-indigo-100 text-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded-md">
                                    {currentDepartment?.name || 'القسم'}
                                </span>
                            </div>
                            <div><strong>الوردية:</strong> {t(`comm.shift.${receiveModal.log.shiftType || 'morning'}`)}</div>
                            <div className="text-slate-700 mt-2 p-2.5 bg-white rounded-xl border border-indigo-100/60 max-h-24 overflow-y-auto">
                                {receiveModal.log.content}
                            </div>
                        </div>

                        <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs flex items-center gap-2">
                            <i className="fas fa-id-badge text-emerald-600 text-base"></i>
                            <div>
                                <span className="font-bold block">المستلم: {userName}</span>
                                <span className="text-[10px] text-emerald-600 font-medium">تأكيد الاستلام بصفتك موظفاً في قسم {currentDepartment?.name || 'القسم'}</span>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">{t('comm.receive.loc')}</label>
                            <select
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200"
                                value={receiverLocation}
                                onChange={e => setReceiverLocation(e.target.value)}
                                required
                            >
                                <option value="">...</option>
                                {locations.map(l => (
                                    <option key={l.id} value={l.name}>{l.name}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">{t('comm.receive.notes')}</label>
                            <textarea
                                value={receiverNotes}
                                onChange={e => setReceiverNotes(e.target.value)}
                                placeholder="ملاحظات الاستلام، جاهزية الغرفة، استلام المفاتيح..."
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200 min-h-[80px]"
                            />
                        </div>

                        <button
                            onClick={handleConfirmReceive}
                            disabled={isConfirmingReceive}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-2xl font-black text-xs shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"
                        >
                            {isConfirmingReceive ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-check-double"></i>}
                            <span>{t('comm.receive')}</span>
                        </button>
                    </div>
                )}
            </Modal>

            {/* --- MODAL: EDIT LOG --- */}
            <Modal
                isOpen={editLogModal.isOpen}
                onClose={() => setEditLogModal({ isOpen: false, log: null })}
                title={t('edit')}
            >
                {editLogModal.log && (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">{t('location')}</label>
                            <select
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800"
                                value={editLogModal.log.location || ''}
                                onChange={e => setEditLogModal(prev => ({
                                    ...prev,
                                    log: prev.log ? { ...prev.log, location: e.target.value } : null
                                }))}
                            >
                                {locations.map(loc => (
                                    <option key={loc.id} value={loc.name}>{loc.name}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">{t('comm.log.content')}</label>
                            <textarea
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-medium min-h-[120px]"
                                value={editLogModal.log.content}
                                onChange={e => setEditLogModal(prev => ({
                                    ...prev,
                                    log: prev.log ? { ...prev.log, content: e.target.value } : null
                                }))}
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="editIsImportant"
                                checked={editLogModal.log.isImportant || false}
                                onChange={e => setEditLogModal(prev => ({
                                    ...prev,
                                    log: prev.log ? { ...prev.log, isImportant: e.target.checked } : null
                                }))}
                            />
                            <label htmlFor="editIsImportant" className="text-xs font-bold text-rose-700">
                                {t('comm.log.important')}
                            </label>
                        </div>

                        <button
                            onClick={handleEditLogSave}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-2xl font-black text-xs shadow-lg shadow-indigo-200 transition-all"
                        >
                            {t('save')}
                        </button>
                    </div>
                )}
            </Modal>

            {/* --- MODAL: EDIT ANNOUNCEMENT --- */}
            <Modal
                isOpen={editAnnounceModal.isOpen}
                onClose={() => setEditAnnounceModal({ isOpen: false, ann: null })}
                title={t('edit')}
            >
                {editAnnounceModal.ann && (
                    <div className="space-y-4">
                        <input
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold"
                            value={editAnnounceModal.ann.title}
                            onChange={e => setEditAnnounceModal(prev => ({
                                ...prev,
                                ann: prev.ann ? { ...prev.ann, title: e.target.value } : null
                            }))}
                        />
                        <textarea
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs min-h-[100px]"
                            value={editAnnounceModal.ann.content}
                            onChange={e => setEditAnnounceModal(prev => ({
                                ...prev,
                                ann: prev.ann ? { ...prev.ann, content: e.target.value } : null
                            }))}
                        />
                        <select
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold"
                            value={editAnnounceModal.ann.priority}
                            onChange={e => setEditAnnounceModal(prev => ({
                                ...prev,
                                ann: prev.ann ? { ...prev.ann, priority: e.target.value as any } : null
                            }))}
                        >
                            <option value="normal">{t('comm.prio.normal')}</option>
                            <option value="urgent">{t('comm.prio.urgent')}</option>
                            <option value="critical">{t('comm.prio.critical')}</option>
                        </select>
                        <button
                            onClick={handleEditAnnounceSave}
                            className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-2xl font-black text-xs shadow-lg shadow-orange-200"
                        >
                            {t('save')}
                        </button>
                    </div>
                )}
            </Modal>

            {/* --- MODAL: VIEWERS --- */}
            <Modal
                isOpen={viewersModal.isOpen}
                onClose={() => setViewersModal(prev => ({ ...prev, isOpen: false }))}
                title={t('comm.views')}
            >
                <div className="mb-4">
                    <h4 className="font-bold text-slate-800 text-sm mb-1">{viewersModal.title}</h4>
                    <p className="text-xs text-slate-500">{t('comm.views')}: <strong>{viewersModal.viewers.length}</strong></p>
                </div>
                <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                    {viewersModal.viewers.length === 0 ? (
                        <div className="text-center py-8 text-slate-400 text-xs">
                            {dir === 'rtl' ? 'لم يقم أي موظف بفتح التعميم بعد' : 'No viewers yet'}
                        </div>
                    ) : (
                        viewersModal.viewers.map(uid => {
                            const user = users.find(u => u.id === uid);
                            return (
                                <div key={uid} className="flex items-center gap-3 p-2.5 bg-slate-50 border border-slate-100 rounded-2xl">
                                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                                        {user?.name ? user.name.charAt(0) : '?'}
                                    </div>
                                    <div>
                                        <p className="font-bold text-slate-800 text-xs">{user?.name || 'Unknown'}</p>
                                        <p className="text-[10px] text-slate-400">{user?.role || 'Staff'}</p>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </Modal>

            {/* --- MODAL: AI INSIGHTS --- */}
            <Modal
                isOpen={showInsightsModal}
                onClose={() => setShowInsightsModal(false)}
                title={t('comm.aiAnalysis')}
            >
                <div className="space-y-4">
                    {isGeneratingInsights ? (
                        <div className="text-center py-12">
                            <div className="w-14 h-14 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
                            <p className="text-slate-600 font-bold text-xs animate-pulse">
                                {dir === 'rtl' ? 'جاري تحليل سجلات الورديات واستخراج التوصيات الذكية...' : 'Analyzing shift handovers and generating clinical insights...'}
                            </p>
                        </div>
                    ) : (
                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 max-h-[65vh] overflow-y-auto text-xs md:text-sm text-slate-800 leading-relaxed space-y-3">
                            <div dangerouslySetInnerHTML={{ __html: insightsContent }} />
                        </div>
                    )}
                    <button
                        onClick={() => setShowInsightsModal(false)}
                        className="w-full bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-2xl font-bold text-xs transition-colors"
                    >
                        {dir === 'rtl' ? 'إغلاق التقرير' : 'Close Insights'}
                    </button>
                </div>
            </Modal>
        </div>
    );
};

export default CommunicationPage;
