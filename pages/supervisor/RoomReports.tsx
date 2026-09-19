
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebaseData';
// @ts-ignore
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, Timestamp, query, where } from 'firebase/firestore';
import { uploadFile } from '../../services/storageClient';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useDepartment } from '../../contexts/DepartmentContext';
import Toast from '../../components/Toast';
// @ts-ignore
import { useNavigate } from 'react-router-dom';
import DocumentScanner from '../../components/DocumentScanner';
import * as XLSX from 'xlsx';

export interface RoomReportItem {
    id: string;
    number: string;
    device: string;
    surveyDate: string;
    surveyUrl?: string;
    notes?: string;
    departmentId?: string | null;
    createdAt?: any;
}

type FilterStatus = 'ALL' | 'VALID' | 'WARNING' | 'EXPIRED' | 'NO_SURVEY';
type SortOption = 'EXPIRY_ASC' | 'EXPIRY_DESC' | 'ROOM_ASC' | 'DEVICE_ASC';

const RoomReports: React.FC = () => {
    const { language, dir } = useLanguage();
    const { isDark } = useTheme();
    const isAr = language === 'ar' || dir === 'rtl';
    const navigate = useNavigate();
    const { selectedDepartmentId, departments } = useDepartment();

    // Data State
    const [rooms, setRooms] = useState<RoomReportItem[]>([]);
    const [loading, setLoading] = useState(true);

    // Filter & Search Controls
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<FilterStatus>('ALL');
    const [sortBy, setSortBy] = useState<SortOption>('EXPIRY_ASC');
    const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

    // Modals
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRoom, setEditingRoom] = useState<RoomReportItem | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [previewPdfUrl, setPreviewPdfUrl] = useState<{ url: string; title: string } | null>(null);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
    const [showScanner, setShowScanner] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        number: '',
        device: '',
        surveyDate: '',
        surveyUrl: '',
        notes: '',
    });
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);

    // Active Department Name
    const currentDeptName = useMemo(() => {
        if (!selectedDepartmentId) return null;
        const found = departments.find(d => d.id === selectedDepartmentId);
        return found ? found.name : null;
    }, [departments, selectedDepartmentId]);

    // Realtime Firestore Subscription
    useEffect(() => {
        setLoading(true);
        const q = selectedDepartmentId
            ? query(collection(db, 'room_reports'), where('departmentId', '==', selectedDepartmentId))
            : collection(db, 'room_reports');

        const unsub = onSnapshot(
            q,
            (snap) => {
                const list = snap.docs.map(d => ({ ...d.data(), id: d.id } as RoomReportItem));
                setRooms(list);
                setLoading(false);
            },
            (err) => {
                console.error('Error fetching room reports:', err);
                setToast({ msg: isAr ? 'فشل تحميل البيانات' : 'Failed to load rooms', type: 'error' });
                setLoading(false);
            }
        );
        return () => unsub();
    }, [selectedDepartmentId, isAr]);

    // Survey Status Calculator
    const getSurveyStatus = (dateStr: string, hasUrl?: boolean) => {
        if (!dateStr) {
            return {
                status: 'NO_DATE' as const,
                text: isAr ? 'بدون تاريخ مسح' : 'No Survey Date',
                badgeClass: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700',
                dotClass: 'bg-slate-400',
                countdownText: isAr ? 'غير محدد' : 'Not set',
                daysDiff: null,
                isExpired: false,
                isWarning: false,
                isValid: false,
            };
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const expiry = new Date(dateStr);
        expiry.setHours(0, 0, 0, 0);

        const diffTime = expiry.getTime() - today.getTime();
        const daysDiff = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (daysDiff < 0) {
            const absDays = Math.abs(daysDiff);
            return {
                status: 'EXPIRED' as const,
                text: isAr ? 'منتهي الصلاحية' : 'Expired',
                badgeClass: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60',
                dotClass: 'bg-rose-500 animate-pulse',
                countdownText: isAr ? `منتهي منذ ${absDays} يوم` : `Expired ${absDays}d ago`,
                daysDiff,
                isExpired: true,
                isWarning: false,
                isValid: false,
            };
        } else if (daysDiff <= 30) {
            return {
                status: 'WARNING' as const,
                text: isAr ? 'ينتهي قريباً' : 'Expires Soon',
                badgeClass: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60',
                dotClass: 'bg-amber-500 animate-pulse',
                countdownText: daysDiff === 0 ? (isAr ? 'ينتهي اليوم!' : 'Expires today!') : (isAr ? `متبقي ${daysDiff} يوم` : `${daysDiff}d left`),
                daysDiff,
                isExpired: false,
                isWarning: true,
                isValid: false,
            };
        } else {
            return {
                status: 'VALID' as const,
                text: isAr ? 'ساري وصالح' : 'Valid',
                badgeClass: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60',
                dotClass: 'bg-emerald-500',
                countdownText: isAr ? `ساري (متبقي ${daysDiff} يوم)` : `Valid (${daysDiff}d left)`,
                daysDiff,
                isExpired: false,
                isWarning: false,
                isValid: true,
            };
        }
    };

    // Statistical KPI Metrics
    const stats = useMemo(() => {
        let valid = 0;
        let warning = 0;
        let expired = 0;
        let noDate = 0;
        let noSurvey = 0;

        rooms.forEach((r) => {
            const s = getSurveyStatus(r.surveyDate);
            if (s.isValid) valid++;
            else if (s.isWarning) warning++;
            else if (s.isExpired) expired++;
            else noDate++;

            if (!r.surveyUrl) noSurvey++;
        });

        const total = rooms.length;
        const complianceRate = total > 0 ? Math.round((valid / total) * 100) : 0;

        return {
            total,
            valid,
            warning,
            expired,
            noDate,
            noSurvey,
            complianceRate,
        };
    }, [rooms, isAr]);

    // Filter and Sort Logic
    const filteredRooms = useMemo(() => {
        return rooms
            .filter((room) => {
                // Search term match
                const matchSearch =
                    room.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    room.device.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (room.notes && room.notes.toLowerCase().includes(searchTerm.toLowerCase()));

                if (!matchSearch) return false;

                // Status filter
                if (statusFilter === 'ALL') return true;
                if (statusFilter === 'NO_SURVEY') return !room.surveyUrl;

                const st = getSurveyStatus(room.surveyDate);
                if (statusFilter === 'VALID') return st.isValid;
                if (statusFilter === 'WARNING') return st.isWarning;
                if (statusFilter === 'EXPIRED') return st.isExpired;

                return true;
            })
            .sort((a, b) => {
                if (sortBy === 'ROOM_ASC') {
                    return a.number.localeCompare(b.number, undefined, { numeric: true });
                }
                if (sortBy === 'DEVICE_ASC') {
                    return a.device.localeCompare(b.device);
                }
                if (sortBy === 'EXPIRY_ASC') {
                    if (!a.surveyDate) return 1;
                    if (!b.surveyDate) return -1;
                    return new Date(a.surveyDate).getTime() - new Date(b.surveyDate).getTime();
                }
                if (sortBy === 'EXPIRY_DESC') {
                    if (!a.surveyDate) return 1;
                    if (!b.surveyDate) return -1;
                    return new Date(b.surveyDate).getTime() - new Date(a.surveyDate).getTime();
                }
                return 0;
            });
    }, [rooms, searchTerm, statusFilter, sortBy, isAr]);

    // File Processing
    const processFile = async (file: File) => {
        setUploading(true);
        try {
            const url = await uploadFile(file, 'room_reports');
            if (url) {
                setFormData(prev => ({ ...prev, surveyUrl: url }));
                setToast({ msg: isAr ? 'تم رفع التقرير بنجاح' : 'Survey report uploaded successfully', type: 'success' });
            }
        } catch (e: any) {
            console.error('File upload error:', e);
            if (e.message === 'CORS_ERROR') {
                alert(isAr ? 'خطأ في إعدادات الخادم (CORS).' : 'Server configuration error (CORS).');
            }
            setToast({ msg: isAr ? 'تعذر رفع الملف' : 'Upload Error', type: 'error' });
        } finally {
            setUploading(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || !e.target.files[0]) return;
        await processFile(e.target.files[0]);
    };

    const handleScannerSave = async (file: File) => {
        setShowScanner(false);
        await processFile(file);
    };

    // Open Add or Edit Modal
    const handleOpenModal = (room?: RoomReportItem) => {
        if (room) {
            setEditingRoom(room);
            setFormData({
                number: room.number || '',
                device: room.device || '',
                surveyDate: room.surveyDate || '',
                surveyUrl: room.surveyUrl || '',
                notes: room.notes || '',
            });
        } else {
            setEditingRoom(null);
            setFormData({
                number: '',
                device: '',
                surveyDate: '',
                surveyUrl: '',
                notes: '',
            });
        }
        setIsModalOpen(true);
    };

    // Quick Date Presets
    const setQuickDate = (monthsToAdd: number) => {
        const d = new Date();
        d.setMonth(d.getMonth() + monthsToAdd);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        setFormData(prev => ({ ...prev, surveyDate: `${yyyy}-${mm}-${dd}` }));
    };

    // Submit Form
    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!formData.number.trim() || !formData.device.trim()) {
            setToast({ msg: isAr ? 'يرجى إدخال رقم الغرفة واسم الجهاز' : 'Please provide room number and device name', type: 'error' });
            return;
        }

        setSaving(true);
        try {
            const payload = {
                number: formData.number.trim(),
                device: formData.device.trim(),
                surveyDate: formData.surveyDate || '',
                surveyUrl: formData.surveyUrl || '',
                notes: formData.notes.trim() || '',
                updatedAt: Timestamp.now(),
            };

            if (editingRoom) {
                await updateDoc(doc(db, 'room_reports', editingRoom.id), payload);
                setToast({ msg: isAr ? 'تم تحديث بيانات الغرفة بنجاح' : 'Room updated successfully', type: 'success' });
            } else {
                await addDoc(collection(db, 'room_reports'), {
                    ...payload,
                    createdAt: Timestamp.now(),
                    departmentId: selectedDepartmentId || null,
                });
                setToast({ msg: isAr ? 'تمت إضافة الغرفة بنجاح' : 'New room added successfully', type: 'success' });
            }
            setIsModalOpen(false);
            setEditingRoom(null);
        } catch (e) {
            console.error('Error saving room report:', e);
            setToast({ msg: isAr ? 'حدث خطأ أثناء الحفظ' : 'Error saving record', type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    // Delete Room
    const confirmDelete = async () => {
        if (!deleteConfirmId) return;
        try {
            await deleteDoc(doc(db, 'room_reports', deleteConfirmId));
            setToast({ msg: isAr ? 'تم حذف سجل الغرفة بنجاح' : 'Room record deleted', type: 'success' });
            setDeleteConfirmId(null);
        } catch (e) {
            console.error('Error deleting room:', e);
            setToast({ msg: isAr ? 'تعذر حذف الغرفة' : 'Failed to delete room', type: 'error' });
        }
    };

    // Export to Excel
    const handleExportExcel = () => {
        try {
            const exportRows = filteredRooms.map((r) => {
                const st = getSurveyStatus(r.surveyDate);
                return {
                    [isAr ? 'رقم الغرفة' : 'Room Number']: r.number,
                    [isAr ? 'اسم الجهاز / المعدة' : 'Device Name']: r.device,
                    [isAr ? 'تاريخ انتهاء المسح' : 'Survey Expiry Date']: r.surveyDate || (isAr ? 'غير محدد' : 'N/A'),
                    [isAr ? 'حالة المسح' : 'Survey Status']: st.text,
                    [isAr ? 'العد التنازلي' : 'Countdown']: st.countdownText,
                    [isAr ? 'تقرير المسح (PDF)' : 'Survey Report']: r.surveyUrl ? (isAr ? 'مرفق ✅' : 'Attached ✅') : (isAr ? 'غير مرفق ❌' : 'Missing ❌'),
                    [isAr ? 'ملاحظات' : 'Notes']: r.notes || '',
                };
            });

            const worksheet = XLSX.utils.json_to_sheet(exportRows);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Room_Reports');
            const fileName = `Room_Radiation_Reports_${new Date().toISOString().slice(0, 10)}.xlsx`;
            XLSX.writeFile(workbook, fileName);
            setToast({ msg: isAr ? 'تم تصدير ملف الإكسل بنجاح' : 'Exported to Excel successfully', type: 'success' });
        } catch (e) {
            console.error('Export error:', e);
            setToast({ msg: isAr ? 'فشل تصدير الإكسل' : 'Export failed', type: 'error' });
        }
    };

    return (
        <div className={`min-h-screen bg-slate-50 dark:bg-slate-950 font-sans pb-24 transition-colors duration-200 ${dir === 'rtl' ? 'rtl' : 'ltr'}`} dir={dir}>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            {/* Top Navigation & Header */}
            <header className="bg-white/85 dark:bg-slate-900/85 backdrop-blur-md sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
                    {/* Left: Back & Title */}
                    <div className="flex items-center gap-3.5 w-full md:w-auto">
                        <button
                            onClick={() => navigate('/supervisor')}
                            className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white transition-all shadow-xs"
                            title={isAr ? 'العودة للوحة التحكم' : 'Back to Dashboard'}
                        >
                            <i className={`fas ${isAr ? 'fa-arrow-right' : 'fa-arrow-left'} text-sm`}></i>
                        </button>

                        <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white flex items-center justify-center text-lg shadow-md shadow-indigo-500/20">
                                <i className="fas fa-radiation"></i>
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                                        {isAr ? 'تقارير الغرف والمسح الإشعاعي' : 'Room Reports & Radiation Survey'}
                                    </h1>
                                    {currentDeptName && (
                                        <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60">
                                            {currentDeptName}
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                                    {isAr ? 'متابعة أجهزة الغرف وصلاحية شهادات وتقارير المسح الدوري' : 'Track room devices, compliance, and periodic radiation safety surveys'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Right: Quick Action Buttons */}
                    <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
                        <button
                            onClick={handleExportExcel}
                            disabled={rooms.length === 0}
                            className="px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-all flex items-center gap-2 border border-slate-200 dark:border-slate-700/80 disabled:opacity-50 cursor-pointer"
                            title={isAr ? 'تصدير القائمة إلى ملف Excel' : 'Export list to Excel'}
                        >
                            <i className="fas fa-file-excel text-emerald-600 dark:text-emerald-400"></i>
                            <span className="hidden sm:inline">{isAr ? 'تصدير Excel' : 'Export Excel'}</span>
                        </button>

                        <button
                            onClick={() => handleOpenModal()}
                            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold transition-all flex items-center gap-2 shadow-md shadow-indigo-600/25 cursor-pointer"
                        >
                            <i className="fas fa-plus"></i>
                            <span>{isAr ? 'إضافة غرفة جديدة' : 'Add Room'}</span>
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
                {/* 1. Executive KPI Summary Cards */}
                <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
                    {/* All Rooms */}
                    <button
                        onClick={() => setStatusFilter('ALL')}
                        className={`p-4 rounded-2xl border text-start transition-all cursor-pointer ${
                            statusFilter === 'ALL'
                                ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-400 dark:border-indigo-500 shadow-sm ring-2 ring-indigo-500/20'
                                : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700/60'
                        }`}
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                                {isAr ? 'إجمالي الغرف' : 'Total Rooms'}
                            </span>
                            <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs">
                                <i className="fas fa-door-open"></i>
                            </div>
                        </div>
                        <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">{stats.total}</div>
                        <div className="text-[11px] text-slate-400 dark:text-slate-500 font-medium mt-0.5">
                            {isAr ? 'كافة الغرف المسجلة' : 'All registered rooms'}
                        </div>
                    </button>

                    {/* Valid Surveys */}
                    <button
                        onClick={() => setStatusFilter('VALID')}
                        className={`p-4 rounded-2xl border text-start transition-all cursor-pointer ${
                            statusFilter === 'VALID'
                                ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-500 shadow-sm ring-2 ring-emerald-500/20'
                                : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700/60'
                        }`}
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                                {isAr ? 'تقارير سارية' : 'Valid Surveys'}
                            </span>
                            <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs">
                                <i className="fas fa-shield-check"></i>
                            </div>
                        </div>
                        <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-2">{stats.valid}</div>
                        <div className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 font-medium mt-0.5">
                            {stats.complianceRate}% {isAr ? 'نسبة الامتثال' : 'compliance'}
                        </div>
                    </button>

                    {/* Expiring Soon */}
                    <button
                        onClick={() => setStatusFilter('WARNING')}
                        className={`p-4 rounded-2xl border text-start transition-all cursor-pointer ${
                            statusFilter === 'WARNING'
                                ? 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-400 dark:border-amber-500 shadow-sm ring-2 ring-amber-500/20'
                                : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-700/60'
                        }`}
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                                {isAr ? 'تنتهي قريباً' : 'Expiring Soon'}
                            </span>
                            <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xs">
                                <i className="fas fa-clock"></i>
                            </div>
                        </div>
                        <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-2">{stats.warning}</div>
                        <div className="text-[11px] text-amber-600/80 dark:text-amber-400/80 font-medium mt-0.5">
                            {isAr ? 'خلال 30 يوماً' : 'Within 30 days'}
                        </div>
                    </button>

                    {/* Expired */}
                    <button
                        onClick={() => setStatusFilter('EXPIRED')}
                        className={`p-4 rounded-2xl border text-start transition-all cursor-pointer ${
                            statusFilter === 'EXPIRED'
                                ? 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-400 dark:border-rose-500 shadow-sm ring-2 ring-rose-500/20'
                                : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-rose-300 dark:hover:border-rose-700/60'
                        }`}
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-rose-700 dark:text-rose-400">
                                {isAr ? 'منتهية الصلاحية' : 'Expired'}
                            </span>
                            <div className="w-8 h-8 rounded-xl bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400 flex items-center justify-center text-xs">
                                <i className="fas fa-exclamation-triangle"></i>
                            </div>
                        </div>
                        <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-2">{stats.expired}</div>
                        <div className="text-[11px] text-rose-600/80 dark:text-rose-400/80 font-medium mt-0.5">
                            {isAr ? 'تحتاج مسحاً عاجلاً' : 'Action required'}
                        </div>
                    </button>

                    {/* Missing Survey Document */}
                    <button
                        onClick={() => setStatusFilter('NO_SURVEY')}
                        className={`col-span-2 sm:col-span-1 p-4 rounded-2xl border text-start transition-all cursor-pointer ${
                            statusFilter === 'NO_SURVEY'
                                ? 'bg-sky-50/80 dark:bg-sky-950/40 border-sky-400 dark:border-sky-500 shadow-sm ring-2 ring-sky-500/20'
                                : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-sky-300 dark:hover:border-sky-700/60'
                        }`}
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-sky-700 dark:text-sky-400">
                                {isAr ? 'بدون وثيقة مسح' : 'Missing PDF'}
                            </span>
                            <div className="w-8 h-8 rounded-xl bg-sky-100 dark:bg-sky-900/50 text-sky-600 dark:text-sky-400 flex items-center justify-center text-xs">
                                <i className="fas fa-file-medical-alt"></i>
                            </div>
                        </div>
                        <div className="text-2xl font-black text-sky-600 dark:text-sky-400 mt-2">{stats.noSurvey}</div>
                        <div className="text-[11px] text-sky-600/80 dark:text-sky-400/80 font-medium mt-0.5">
                            {isAr ? 'بحاجة لرفع التقرير' : 'Awaiting upload'}
                        </div>
                    </button>
                </section>

                {/* 2. Search, Status Filter Tabs, and View Options */}
                <section className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
                    {/* Search Field */}
                    <div className="relative w-full md:w-80">
                        <i className={`fas fa-search absolute ${isAr ? 'right-3.5' : 'left-3.5'} top-1/2 -translate-y-1/2 text-slate-400 text-xs`}></i>
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder={isAr ? 'بحث برقم الغرفة أو اسم الجهاز...' : 'Search by room # or device...'}
                            className={`w-full ${
                                isAr ? 'pr-9 pl-8' : 'pl-9 pr-8'
                            } py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all`}
                        />
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                className={`absolute ${isAr ? 'left-2.5' : 'right-2.5'} top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs p-1`}
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        )}
                    </div>

                    {/* Filter Pills */}
                    <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 scrollbar-none">
                        {[
                            { id: 'ALL', label: isAr ? 'الكل' : 'All', count: stats.total },
                            { id: 'VALID', label: isAr ? 'ساري' : 'Valid', count: stats.valid },
                            { id: 'WARNING', label: isAr ? 'ينتهي قريباً' : 'Soon', count: stats.warning },
                            { id: 'EXPIRED', label: isAr ? 'منتهي' : 'Expired', count: stats.expired },
                            { id: 'NO_SURVEY', label: isAr ? 'بدون وثيقة' : 'Missing File', count: stats.noSurvey },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setStatusFilter(tab.id as FilterStatus)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                                    statusFilter === tab.id
                                        ? 'bg-indigo-600 text-white shadow-xs'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'
                                }`}
                            >
                                <span>{tab.label}</span>
                                <span
                                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                                        statusFilter === tab.id
                                            ? 'bg-white/25 text-white'
                                            : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                                    }`}
                                >
                                    {tab.count}
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* Sorting and View Toggle */}
                    <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
                        {/* Sort Selector */}
                        <div className="relative">
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value as SortOption)}
                                className="appearance-none bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                            >
                                <option value="EXPIRY_ASC">{isAr ? 'الأقرب انتهاءً' : 'Expiry (Soonest)'}</option>
                                <option value="EXPIRY_DESC">{isAr ? 'الأبعد انتهاءً' : 'Expiry (Furthest)'}</option>
                                <option value="ROOM_ASC">{isAr ? 'رقم الغرفة (تصاعدي)' : 'Room Number (A-Z)'}</option>
                                <option value="DEVICE_ASC">{isAr ? 'اسم الجهاز (أبجدي)' : 'Device Name (A-Z)'}</option>
                            </select>
                        </div>

                        {/* View Switcher Buttons */}
                        <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                                    viewMode === 'grid'
                                        ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                                        : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                                }`}
                                title={isAr ? 'عرض البطاقات' : 'Grid View'}
                            >
                                <i className="fas fa-th-large"></i>
                            </button>
                            <button
                                onClick={() => setViewMode('table')}
                                className={`p-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                                    viewMode === 'table'
                                        ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                                        : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                                }`}
                                title={isAr ? 'عرض الجدول' : 'Table View'}
                            >
                                <i className="fas fa-table-list"></i>
                            </button>
                        </div>
                    </div>
                </section>

                {/* 3. Rooms Content Area */}
                {loading ? (
                    <div className="py-20 flex flex-col items-center justify-center text-center">
                        <div className="w-12 h-12 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                        <p className="text-sm font-bold text-slate-500 dark:text-slate-400">
                            {isAr ? 'جاري تحميل سجلات الغرف...' : 'Loading room records...'}
                        </p>
                    </div>
                ) : filteredRooms.length === 0 ? (
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 border border-slate-200/80 dark:border-slate-800 text-center shadow-sm max-w-lg mx-auto mt-8">
                        <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500 dark:text-indigo-400 rounded-3xl flex items-center justify-center text-3xl mx-auto mb-5 shadow-inner">
                            <i className="fas fa-door-closed"></i>
                        </div>
                        <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">
                            {searchTerm || statusFilter !== 'ALL'
                                ? (isAr ? 'لا توجد نتائج مطابقة للبحث' : 'No matching rooms found')
                                : (isAr ? 'لا توجد غرف مسجلة حالياً' : 'No rooms registered yet')}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto mb-6">
                            {searchTerm || statusFilter !== 'ALL'
                                ? (isAr ? 'جرب تغيير معايير البحث أو تصفية الحالة لعرض بقية الغرف' : 'Try clearing your search or status filter')
                                : (isAr ? 'ابدأ بإضافة أول غرفة ومتابعة شهادات وتقارير المسح الإشعاعي' : 'Get started by adding your first medical room and survey record')}
                        </p>
                        {searchTerm || statusFilter !== 'ALL' ? (
                            <button
                                onClick={() => {
                                    setSearchTerm('');
                                    setStatusFilter('ALL');
                                }}
                                className="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                            >
                                {isAr ? 'إعادة ضبط التصفية' : 'Reset Filters'}
                            </button>
                        ) : (
                            <button
                                onClick={() => handleOpenModal()}
                                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-600/25 transition-all"
                            >
                                <i className="fas fa-plus mr-1.5 ml-1.5"></i>
                                {isAr ? 'إضافة أول غرفة الآن' : 'Add First Room Now'}
                            </button>
                        )}
                    </div>
                ) : viewMode === 'grid' ? (
                    /* Grid Cards View */
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {filteredRooms.map((room) => {
                            const status = getSurveyStatus(room.surveyDate, Boolean(room.surveyUrl));
                            return (
                                <div
                                    key={room.id}
                                    className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs hover:shadow-lg transition-all duration-200 flex flex-col justify-between overflow-hidden group hover:-translate-y-1"
                                >
                                    {/* Top Status Border Accent */}
                                    <div
                                        className={`h-1.5 w-full ${
                                            status.isExpired
                                                ? 'bg-rose-500'
                                                : status.isWarning
                                                ? 'bg-amber-500'
                                                : status.isValid
                                                ? 'bg-emerald-500'
                                                : 'bg-slate-300 dark:bg-slate-700'
                                        }`}
                                    />

                                    <div className="p-5 flex-1 flex flex-col">
                                        {/* Card Header: Room Number & Status Badge */}
                                        <div className="flex items-start justify-between gap-3 mb-3">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black text-sm border border-indigo-100 dark:border-indigo-900/60 shadow-xs">
                                                    <i className="fas fa-door-open"></i>
                                                </div>
                                                <div>
                                                    <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                                                        {isAr ? 'رقم الغرفة' : 'Room ID'}
                                                    </div>
                                                    <h3 className="text-lg font-black text-slate-900 dark:text-white leading-tight">
                                                        {room.number}
                                                    </h3>
                                                </div>
                                            </div>

                                            {/* Status Badge */}
                                            <span
                                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black border ${status.badgeClass}`}
                                            >
                                                <span className={`w-1.5 h-1.5 rounded-full ${status.dotClass}`}></span>
                                                <span>{status.text}</span>
                                            </span>
                                        </div>

                                        {/* Device / Modality Info */}
                                        <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 border border-slate-100 dark:border-slate-800 mb-3.5">
                                            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
                                                <i className="fas fa-radiation text-indigo-500 text-xs"></i>
                                                <span className="truncate">{room.device}</span>
                                            </div>
                                            {room.notes && (
                                                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                                                    {room.notes}
                                                </p>
                                            )}
                                        </div>

                                        {/* Survey Expiry & Countdown */}
                                        <div className="space-y-2 mt-auto">
                                            <div className="flex items-center justify-between text-xs font-bold bg-slate-50/70 dark:bg-slate-800/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                                                <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 text-[11px]">
                                                    <i className="fas fa-calendar-alt text-slate-400"></i>
                                                    {isAr ? 'صلاحية المسح:' : 'Survey Expiry:'}
                                                </span>
                                                <span className="font-mono text-slate-800 dark:text-slate-200 text-xs">
                                                    {room.surveyDate || (isAr ? 'غير محدد' : 'Not specified')}
                                                </span>
                                            </div>

                                            <div className="flex items-center justify-between px-1">
                                                <span className="text-[10px] font-bold text-slate-400">
                                                    {isAr ? 'الحالة الزمنية' : 'Timeline'}
                                                </span>
                                                <span
                                                    className={`text-[11px] font-extrabold ${
                                                        status.isExpired
                                                            ? 'text-rose-600 dark:text-rose-400'
                                                            : status.isWarning
                                                            ? 'text-amber-600 dark:text-amber-400'
                                                            : status.isValid
                                                            ? 'text-emerald-600 dark:text-emerald-400'
                                                            : 'text-slate-400'
                                                    }`}
                                                >
                                                    {status.countdownText}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Card Footer: PDF Actions and Edit/Delete Controls */}
                                    <div className="bg-slate-50/90 dark:bg-slate-800/80 px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                                        {room.surveyUrl ? (
                                            <button
                                                onClick={() => setPreviewPdfUrl({ url: room.surveyUrl!, title: `Room ${room.number} - ${room.device}` })}
                                                className="flex-1 py-1.5 px-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 border border-indigo-200/70 dark:border-indigo-800/60 cursor-pointer"
                                            >
                                                <i className="fas fa-file-pdf text-rose-500"></i>
                                                <span>{isAr ? 'عرض التقرير' : 'View Survey'}</span>
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => handleOpenModal(room)}
                                                className="flex-1 py-1.5 px-3 rounded-xl bg-slate-200/70 dark:bg-slate-700/60 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                                            >
                                                <i className="fas fa-upload text-slate-400"></i>
                                                <span>{isAr ? 'إرفاق مسح' : 'Upload PDF'}</span>
                                            </button>
                                        )}

                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => handleOpenModal(room)}
                                                className="w-8 h-8 rounded-xl bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 flex items-center justify-center text-xs transition-colors cursor-pointer"
                                                title={isAr ? 'تعديل بيانات الغرفة' : 'Edit Room'}
                                            >
                                                <i className="fas fa-pen"></i>
                                            </button>

                                            <button
                                                onClick={() => setDeleteConfirmId(room.id)}
                                                className="w-8 h-8 rounded-xl bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 flex items-center justify-center text-xs transition-colors cursor-pointer"
                                                title={isAr ? 'حذف سجل الغرفة' : 'Delete Room'}
                                            >
                                                <i className="fas fa-trash"></i>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    /* Detailed Table View */
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-start text-xs border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold">
                                        <th className="py-3.5 px-4 text-start">{isAr ? 'رقم الغرفة' : 'Room #'}</th>
                                        <th className="py-3.5 px-4 text-start">{isAr ? 'اسم الجهاز / المعدة' : 'Device'}</th>
                                        <th className="py-3.5 px-4 text-start">{isAr ? 'تاريخ انتهاء المسح' : 'Expiry Date'}</th>
                                        <th className="py-3.5 px-4 text-start">{isAr ? 'حالة المسح الإشعاعي' : 'Survey Status'}</th>
                                        <th className="py-3.5 px-4 text-start">{isAr ? 'التقرير (PDF)' : 'Report'}</th>
                                        <th className="py-3.5 px-4 text-end">{isAr ? 'إجراءات' : 'Actions'}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                                    {filteredRooms.map((room) => {
                                        const status = getSurveyStatus(room.surveyDate, Boolean(room.surveyUrl));
                                        return (
                                            <tr key={room.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                                                <td className="py-3.5 px-4 font-black text-slate-900 dark:text-white">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs">
                                                            <i className="fas fa-door-open"></i>
                                                        </span>
                                                        <span>{room.number}</span>
                                                    </div>
                                                </td>
                                                <td className="py-3.5 px-4 font-bold text-slate-700 dark:text-slate-300">
                                                    <div>{room.device}</div>
                                                    {room.notes && (
                                                        <div className="text-[11px] text-slate-400 font-normal truncate max-w-xs">
                                                            {room.notes}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="py-3.5 px-4 font-mono font-medium text-slate-600 dark:text-slate-300">
                                                    {room.surveyDate || '—'}
                                                </td>
                                                <td className="py-3.5 px-4">
                                                    <div className="flex flex-col gap-1">
                                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black border w-max ${status.badgeClass}`}>
                                                            <span className={`w-1.5 h-1.5 rounded-full ${status.dotClass}`}></span>
                                                            <span>{status.text}</span>
                                                        </span>
                                                        <span className="text-[10px] text-slate-400 font-medium">
                                                            {status.countdownText}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="py-3.5 px-4">
                                                    {room.surveyUrl ? (
                                                        <button
                                                            onClick={() => setPreviewPdfUrl({ url: room.surveyUrl!, title: `Room ${room.number} - ${room.device}` })}
                                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold hover:bg-indigo-100 transition-colors cursor-pointer"
                                                        >
                                                            <i className="fas fa-file-pdf text-rose-500"></i>
                                                            <span>{isAr ? 'عرض' : 'View'}</span>
                                                        </button>
                                                    ) : (
                                                        <span className="text-slate-400 text-[11px]">
                                                            {isAr ? 'غير مرفق' : 'Missing'}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-3.5 px-4 text-end">
                                                    <div className="inline-flex items-center gap-1.5">
                                                        <button
                                                            onClick={() => handleOpenModal(room)}
                                                            className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
                                                            title={isAr ? 'تعديل' : 'Edit'}
                                                        >
                                                            <i className="fas fa-pen"></i>
                                                        </button>
                                                        <button
                                                            onClick={() => setDeleteConfirmId(room.id)}
                                                            className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                                                            title={isAr ? 'حذف' : 'Delete'}
                                                        >
                                                            <i className="fas fa-trash"></i>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </main>

            {/* Modal: Add or Edit Room */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg p-6 sm:p-8 shadow-2xl border border-slate-200 dark:border-slate-800 animate-fade-in-up max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-100 dark:border-slate-800">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-base font-bold">
                                    <i className={`fas ${editingRoom ? 'fa-pen' : 'fa-plus'}`}></i>
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-slate-900 dark:text-white">
                                        {editingRoom
                                            ? (isAr ? 'تعديل بيانات الغرفة' : 'Edit Room Record')
                                            : (isAr ? 'إضافة غرفة جديدة' : 'Add New Room Record')}
                                    </h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        {isAr ? 'سجل بيانات الغرفة وتاريخ انتهاء المسح الإشعاعي' : 'Record room info and radiation survey validity'}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center transition-colors"
                            >
                                <i className="fas fa-times text-xs"></i>
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* Room Number */}
                            <div>
                                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">
                                    {isAr ? 'رقم / مسمى الغرفة' : 'Room Number / Identifier'} <span className="text-rose-500">*</span>
                                </label>
                                <div className="relative">
                                    <i className={`fas fa-door-open absolute ${isAr ? 'right-3.5' : 'left-3.5'} top-1/2 -translate-y-1/2 text-slate-400 text-xs`}></i>
                                    <input
                                        required
                                        type="text"
                                        value={formData.number}
                                        onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                                        placeholder={isAr ? 'مثال: R-101 أو غرفة الأشعة 1' : 'e.g. R-101 or CT Room 1'}
                                        className={`w-full ${isAr ? 'pr-9 pl-3.5' : 'pl-9 pr-3.5'} py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500`}
                                    />
                                </div>
                            </div>

                            {/* Device Name */}
                            <div>
                                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">
                                    {isAr ? 'اسم الجهاز أو المعدة' : 'Device / Equipment Name'} <span className="text-rose-500">*</span>
                                </label>
                                <div className="relative">
                                    <i className={`fas fa-radiation absolute ${isAr ? 'right-3.5' : 'left-3.5'} top-1/2 -translate-y-1/2 text-slate-400 text-xs`}></i>
                                    <input
                                        required
                                        type="text"
                                        value={formData.device}
                                        onChange={(e) => setFormData({ ...formData, device: e.target.value })}
                                        placeholder={isAr ? 'مثال: Siemens Somatom Definition CT' : 'e.g. Siemens Somatom Definition CT'}
                                        className={`w-full ${isAr ? 'pr-9 pl-3.5' : 'pl-9 pr-3.5'} py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500`}
                                    />
                                </div>
                            </div>

                            {/* Survey Expiry Date & Presets */}
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                        {isAr ? 'تاريخ انتهاء صلاحية المسح الإشعاعي' : 'Survey Expiry Date'}
                                    </label>
                                    <div className="flex items-center gap-1 text-[10px]">
                                        <span className="text-slate-400 font-bold">{isAr ? 'اختصار سريع:' : 'Quick:'}</span>
                                        <button
                                            type="button"
                                            onClick={() => setQuickDate(6)}
                                            className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-400 rounded-md font-bold cursor-pointer"
                                        >
                                            +6M
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setQuickDate(12)}
                                            className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-400 rounded-md font-bold cursor-pointer"
                                        >
                                            +1Y
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setQuickDate(24)}
                                            className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-400 rounded-md font-bold cursor-pointer"
                                        >
                                            +2Y
                                        </button>
                                    </div>
                                </div>
                                <input
                                    type="date"
                                    value={formData.surveyDate}
                                    onChange={(e) => setFormData({ ...formData, surveyDate: e.target.value })}
                                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                />
                            </div>

                            {/* Survey PDF Upload and Scanner */}
                            <div>
                                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">
                                    {isAr ? 'تقرير المسح الإشعاعي (ملف PDF)' : 'Radiation Survey Report (PDF)'}
                                </label>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <input
                                            type="file"
                                            accept="application/pdf,image/*"
                                            className="hidden"
                                            id="survey-upload-input"
                                            onChange={handleFileUpload}
                                        />
                                        <label
                                            htmlFor="survey-upload-input"
                                            className={`w-full py-3.5 px-4 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer text-xs font-bold transition-all ${
                                                formData.surveyUrl
                                                    ? 'border-emerald-400 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'
                                                    : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 hover:border-indigo-400'
                                            }`}
                                        >
                                            {uploading ? (
                                                <>
                                                    <i className="fas fa-spinner fa-spin"></i>
                                                    <span>{isAr ? 'جاري الرفع والمعالجة...' : 'Uploading file...'}</span>
                                                </>
                                            ) : formData.surveyUrl ? (
                                                <>
                                                    <i className="fas fa-check-circle text-emerald-500"></i>
                                                    <span className="truncate max-w-[180px]">
                                                        {isAr ? 'تم إرفاق تقرير المسح بنجاح ✅' : 'Survey Attached ✅'}
                                                    </span>
                                                </>
                                            ) : (
                                                <>
                                                    <i className="fas fa-file-upload text-indigo-500"></i>
                                                    <span>{isAr ? 'انقر لرفع ملف PDF أو صورة' : 'Click to upload PDF / file'}</span>
                                                </>
                                            )}
                                        </label>
                                    </div>

                                    {/* Camera Scanner Button */}
                                    <button
                                        type="button"
                                        onClick={() => setShowScanner(true)}
                                        className="px-3.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-xl border border-indigo-200 dark:border-indigo-800/60 transition-colors flex items-center justify-center text-base cursor-pointer"
                                        title={isAr ? 'مسح ضوئي عبر الكاميرا' : 'Scan Document via Camera'}
                                    >
                                        <i className="fas fa-camera"></i>
                                    </button>

                                    {/* Clear Attached File Button */}
                                    {formData.surveyUrl && (
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, surveyUrl: '' })}
                                            className="px-3 bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 hover:bg-rose-100 rounded-xl border border-rose-200 dark:border-rose-800/60 transition-colors flex items-center justify-center text-xs cursor-pointer"
                                            title={isAr ? 'إزالة الملف المرفق' : 'Remove Attached File'}
                                        >
                                            <i className="fas fa-trash"></i>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Additional Notes */}
                            <div>
                                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">
                                    {isAr ? 'ملاحظات إضافية (اختياري)' : 'Additional Notes (Optional)'}
                                </label>
                                <textarea
                                    rows={2}
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    placeholder={isAr ? 'ملاحظات حول التدريع أو فني الصيانة...' : 'Notes regarding shielding, vendor, etc.'}
                                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                />
                            </div>

                            {/* Modal Action Buttons */}
                            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                                >
                                    {isAr ? 'إلغاء' : 'Cancel'}
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving || uploading}
                                    className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs shadow-md shadow-indigo-600/25 transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                                >
                                    {saving && <i className="fas fa-spinner fa-spin"></i>}
                                    <span>{editingRoom ? (isAr ? 'حفظ التعديلات' : 'Save Changes') : (isAr ? 'إضافة الغرفة' : 'Add Room')}</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Document Preview Modal */}
            {previewPdfUrl && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-fade-in-up">
                        {/* Header */}
                        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <i className="fas fa-file-pdf text-rose-500 text-base"></i>
                                <span className="text-xs font-black text-slate-800 dark:text-white truncate max-w-md">
                                    {previewPdfUrl.title}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <a
                                    href={previewPdfUrl.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-2 rounded-xl bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-100 flex items-center gap-1.5 border border-slate-200 dark:border-slate-600 transition-colors"
                                    title={isAr ? 'فتح في نافذة كاملة' : 'Open in new tab'}
                                >
                                    <i className="fas fa-external-link-alt"></i>
                                    <span className="hidden sm:inline">{isAr ? 'نافذة جديدة' : 'Open Tab'}</span>
                                </a>
                                <button
                                    onClick={() => setPreviewPdfUrl(null)}
                                    className="p-2 rounded-xl bg-slate-200/80 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 text-xs transition-colors"
                                >
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                        </div>

                        {/* Embed / Iframe Viewer */}
                        <div className="flex-1 bg-slate-100 dark:bg-slate-950 p-2">
                            <iframe
                                src={previewPdfUrl.url}
                                title="Radiation Survey Document"
                                className="w-full h-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirmId && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-sm p-6 shadow-2xl border border-slate-200 dark:border-slate-800 text-center animate-fade-in-up">
                        <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center text-xl mx-auto mb-4">
                            <i className="fas fa-trash-alt"></i>
                        </div>
                        <h3 className="text-base font-black text-slate-900 dark:text-white mb-1.5">
                            {isAr ? 'تأكيد حذف سجل الغرفة' : 'Confirm Delete Room'}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
                            {isAr
                                ? 'هل أنت متأكد من رغبتك في حذف هذا السجل نهائياً؟ لن يمكن استرجاع الوثيقة المرفقة.'
                                : 'Are you sure you want to permanently delete this room record and its survey link?'}
                        </p>
                        <div className="flex items-center justify-center gap-3">
                            <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                            >
                                {isAr ? 'إلغاء' : 'Cancel'}
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold text-xs shadow-md shadow-rose-600/25 transition-all cursor-pointer"
                            >
                                {isAr ? 'نعم، احذف' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Document Scanner Component */}
            {showScanner && (
                <DocumentScanner
                    onSave={handleScannerSave}
                    onCancel={() => setShowScanner(false)}
                />
            )}
        </div>
    );
};

export default RoomReports;
