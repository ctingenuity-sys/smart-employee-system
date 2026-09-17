import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebaseData';
// @ts-ignore
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, Timestamp, query, where } from 'firebase/firestore';
import { uploadFile } from '../../services/storageClient';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useDepartment } from '../../contexts/DepartmentContext';
import Toast from '../../components/Toast';
import ThemeToggle from '../../components/ThemeToggle';
// @ts-ignore
import { useNavigate } from 'react-router-dom';
import DocumentScanner from '../../components/DocumentScanner';
import * as XLSX from 'xlsx';

import {
  DeviceItem,
  getDeviceOverallStatus,
  getModalityTheme,
  MODALITY_THEMES,
  checkDateStatus,
  getDaysRemaining,
} from '../../components/devices/deviceTypes';
import { DeviceCard } from '../../components/devices/DeviceCard';
import { DeviceTableView } from '../../components/devices/DeviceTableView';
import { DeviceDetailsModal } from '../../components/devices/DeviceDetailsModal';

const DeviceInventory: React.FC = () => {
  const { language, dir } = useLanguage();
  const { isDark } = useTheme();
  const isAr = language === 'ar' || dir === 'rtl';
  const navigate = useNavigate();
  const { selectedDepartmentId } = useDepartment();

  // Core Data
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Controls
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'ALL' | 'VALID' | 'WARNING' | 'EXPIRED'>('ALL');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [groupByCategory, setGroupByCategory] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Modals & Active Device
  const [inspectDevice, setInspectDevice] = useState<DeviceItem | null>(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    serial: '',
    category: '',
    installDate: '',
    image: '',
    maintUrl: '',
    maintDate: '',
    qualUrl: '',
    qualDate: '',
    enableQA: false,
  });

  // Upload States
  const [uploadingImg, setUploadingImg] = useState(false);
  const [uploadingPPM, setUploadingPPM] = useState(false);
  const [uploadingQC, setUploadingQC] = useState(false);

  // Scanner State
  const [scannerField, setScannerField] = useState<'maintUrl' | 'qualUrl' | null>(null);

  // Realtime Firestore Subscription
  useEffect(() => {
    setLoading(true);
    const q = selectedDepartmentId
      ? query(collection(db, 'inventory_devices'), where('departmentId', '==', selectedDepartmentId))
      : collection(db, 'inventory_devices');

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: DeviceItem[] = snap.docs.map((d) => ({
          ...(d.data() as any),
          id: d.id,
        }));
        setDevices(list);
        setLoading(false);

        // Auto-expand all categories by default on first load
        const cats = new Set(list.map((d) => (d.category || 'Other').toUpperCase()));
        setExpandedCategories(cats);
      },
      (err) => {
        console.error('Error fetching devices:', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [selectedDepartmentId]);

  const xrayCategories = [
    'CT',
    'X-Ray',
    'Panoramic & Dental',
    'Cath Lab',
    'Mammogram & BMD',
    'Portable',
    'C-ARM',
    'FLOUROSCOPY',
    'MRI',
    'Ultrasound',
    'Other',
  ];

  // Upload Handler
  const handleFileUpload = async (file: File, field: 'image' | 'maintUrl' | 'qualUrl') => {
    if (field === 'image') setUploadingImg(true);
    if (field === 'maintUrl') setUploadingPPM(true);
    if (field === 'qualUrl') setUploadingQC(true);

    try {
      const url = await uploadFile(file, `devices/${field}`);
      if (url) {
        setFormData((prev) => ({ ...prev, [field]: url }));
        setToast({ msg: isAr ? 'تم رفع الملف بنجاح' : 'File Uploaded', type: 'success' });
      }
    } catch (e: any) {
      if (e.message === 'CORS_ERROR') {
        alert(isAr ? 'خطأ في إعدادات الخادم (CORS).' : 'Server CORS configuration error.');
      }
      setToast({ msg: isAr ? 'فشل رفع الملف' : 'Upload Failed', type: 'error' });
    } finally {
      if (field === 'image') setUploadingImg(false);
      if (field === 'maintUrl') setUploadingPPM(false);
      if (field === 'qualUrl') setUploadingQC(false);
    }
  };

  const handleScannerSave = async (file: File) => {
    if (!scannerField) return;
    const target = scannerField;
    setScannerField(null);
    await handleFileUpload(file, target);
  };

  // Submit Handler
  const handleSubmit = async () => {
    if (!formData.name || !formData.category) {
      return setToast({ msg: isAr ? 'يرجى إدخال اسم الجهاز والتصنيف' : 'Missing required fields', type: 'error' });
    }

    try {
      if (editingId) {
        await updateDoc(doc(db, 'inventory_devices', editingId), formData);
        setToast({ msg: isAr ? 'تم تحديث بيانات الجهاز' : 'Device Updated', type: 'success' });
      } else {
        await addDoc(collection(db, 'inventory_devices'), {
          ...formData,
          createdAt: Timestamp.now(),
          departmentId: selectedDepartmentId || null,
        });
        setToast({ msg: isAr ? 'تمت إضافة الجهاز بنجاح' : 'Device Added', type: 'success' });
      }
      setIsFormModalOpen(false);
      resetForm();
    } catch (e) {
      setToast({ msg: isAr ? 'خطأ أثناء الحفظ' : 'Error saving', type: 'error' });
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm(isAr ? 'هل أنت متأكد من حذف هذا الجهاز من السجل؟' : 'Delete this device from inventory?')) {
      try {
        await deleteDoc(doc(db, 'inventory_devices', id));
        setToast({ msg: isAr ? 'تم حذف الجهاز' : 'Device deleted', type: 'success' });
        if (inspectDevice && inspectDevice.id === id) {
          setInspectDevice(null);
        }
      } catch (e) {
        setToast({ msg: isAr ? 'تعذر حذف الجهاز' : 'Failed to delete', type: 'error' });
      }
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      serial: '',
      category: '',
      installDate: '',
      image: '',
      maintUrl: '',
      maintDate: '',
      qualUrl: '',
      qualDate: '',
      enableQA: false,
    });
    setEditingId(null);
  };

  const openEdit = (dev: DeviceItem) => {
    setFormData({
      name: dev.name || '',
      serial: dev.serial || '',
      category: dev.category || '',
      installDate: dev.installDate || '',
      image: dev.image || '',
      maintUrl: dev.maintUrl || '',
      maintDate: dev.maintDate || '',
      qualUrl: dev.qualUrl || '',
      qualDate: dev.qualDate || '',
      enableQA: Boolean(dev.enableQA),
    });
    setEditingId(dev.id);
    setIsFormModalOpen(true);
  };

  const toggleCategory = (cat: string) => {
    const next = new Set(expandedCategories);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    setExpandedCategories(next);
  };

  // Filtered Devices
  const filteredDevices = useMemo(() => {
    return devices.filter((d) => {
      // Search term
      const matchesSearch =
        d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (d.serial || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (d.category || '').toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchesSearch) return false;

      // Category filter
      if (selectedCategory !== 'ALL') {
        if ((d.category || 'Other').toUpperCase() !== selectedCategory.toUpperCase()) {
          return false;
        }
      }

      // Status filter
      if (selectedStatusFilter !== 'ALL') {
        const overall = getDeviceOverallStatus(d);
        if (overall.status !== selectedStatusFilter) {
          return false;
        }
      }

      return true;
    });
  }, [devices, searchTerm, selectedCategory, selectedStatusFilter]);

  // Modality Categories in current dataset
  const availableCategories = useMemo(() => {
    const map = new Map<string, number>();
    devices.forEach((d) => {
      const cat = (d.category || 'Other').toUpperCase();
      map.set(cat, (map.get(cat) || 0) + 1);
    });
    return Array.from(map.entries()).map(([cat, count]) => ({ cat, count }));
  }, [devices]);

  // Overall Fleet Statistics
  const fleetStats = useMemo(() => {
    let validCount = 0;
    let warningCount = 0;
    let expiredCount = 0;
    let naCount = 0;

    devices.forEach((d) => {
      const s = getDeviceOverallStatus(d);
      if (s.level === 3) expiredCount++;
      else if (s.level === 2) warningCount++;
      else if (s.level === 1) validCount++;
      else naCount++;
    });

    const total = devices.length;
    const operationalPercent = total > 0 ? Math.round((validCount / total) * 100) : 0;

    return {
      total,
      validCount,
      warningCount,
      expiredCount,
      naCount,
      operationalPercent,
    };
  }, [devices]);

  // Export Fleet to Excel
  const handleExportExcel = () => {
    try {
      const rows = filteredDevices.map((d) => {
        const st = getDeviceOverallStatus(d);
        const ppmDays = getDaysRemaining(d.maintDate);
        return {
          [isAr ? 'اسم الجهاز' : 'Device Name']: d.name,
          [isAr ? 'الرقم التسلسلي' : 'Serial Number']: d.serial || 'N/A',
          [isAr ? 'التصنيف' : 'Category']: d.category || 'N/A',
          [isAr ? 'تاريخ التركيب' : 'Install Date']: d.installDate || 'N/A',
          [isAr ? 'تاريخ صيانة PPM' : 'PPM Date']: d.maintDate || 'N/A',
          [isAr ? 'الأيام المتبقية لـ PPM' : 'PPM Days Left']: ppmDays !== null ? ppmDays : 'N/A',
          [isAr ? 'تاريخ فحص الجودة QC' : 'QC Date']: d.enableQA ? (d.qualDate || 'N/A') : (isAr ? 'غير مفعّل' : 'Disabled'),
          [isAr ? 'الحالة التشغيلية' : 'Status']: isAr ? st.textAr : st.textEn,
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Medical_Devices');
      XLSX.writeFile(workbook, `Medical_Devices_Fleet_${new Date().toISOString().slice(0, 10)}.xlsx`);
      setToast({ msg: isAr ? 'تم تصدير ملف الإكسل بنجاح' : 'Fleet exported to Excel', type: 'success' });
    } catch (e) {
      setToast({ msg: isAr ? 'تعذر التصدير' : 'Export failed', type: 'error' });
    }
  };

  return (
    <div
      className={`min-h-screen ${
        isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-800'
      } font-sans pb-24 relative overflow-hidden transition-colors duration-300`}
      dir={dir}
    >
      {/* Dynamic Cyber-Clinical Ambient Flares */}
      {isDark ? (
        <>
          <div className="absolute top-0 inset-x-0 h-[480px] bg-gradient-to-b from-blue-950/60 via-slate-950 to-slate-950 pointer-events-none z-0" />
          <div className="absolute top-[-80px] -right-20 w-[420px] h-[420px] bg-cyan-500/15 rounded-full blur-3xl pointer-events-none z-0" />
          <div className="absolute top-[120px] -left-20 w-[380px] h-[380px] bg-violet-500/15 rounded-full blur-3xl pointer-events-none z-0" />
        </>
      ) : (
        <>
          <div className="absolute top-0 inset-x-0 h-[480px] bg-gradient-to-b from-sky-100/70 via-slate-50 to-slate-50 pointer-events-none z-0" />
          <div className="absolute top-[-80px] -right-20 w-[420px] h-[420px] bg-cyan-500/10 rounded-full blur-3xl pointer-events-none z-0" />
          <div className="absolute top-[120px] -left-20 w-[380px] h-[380px] bg-blue-500/10 rounded-full blur-3xl pointer-events-none z-0" />
        </>
      )}

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* Top Navigation & Applet Bar */}
      <div className="relative z-10 px-4 sm:px-6 lg:px-8 pt-6 pb-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4 w-full md:w-auto">
            <button
              onClick={() => navigate('/supervisor')}
              className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all border shadow-sm ${
                isDark
                  ? 'bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-800 hover:border-slate-700'
                  : 'bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 border-slate-200 hover:border-slate-300'
              }`}
              title={isAr ? 'العودة للوحة الإشراف' : 'Back to Supervisor'}
            >
              <i className={`fas ${isAr ? 'fa-arrow-right' : 'fa-arrow-left'}`}></i>
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 animate-ping"></span>
                <span
                  className={`text-[11px] font-mono uppercase tracking-widest font-bold ${
                    isDark ? 'text-cyan-300' : 'text-cyan-700'
                  }`}
                >
                  {isAr ? 'نظام إدارة الأصول الطبية والأجهزة' : 'CLINICAL FLEET HUB'}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black flex items-center gap-3">
                <span
                  className={
                    isDark
                      ? 'bg-gradient-to-r from-cyan-300 via-sky-300 to-blue-400 text-transparent bg-clip-text'
                      : 'bg-gradient-to-r from-cyan-700 via-sky-700 to-blue-800 text-transparent bg-clip-text'
                  }
                >
                  {isAr ? 'سجل الأجهزة والتجهيزات الطبية' : 'Medical Equipment Fleet'}
                </span>
              </h1>
            </div>
          </div>

          {/* Quick Header Actions */}
          <div className="flex items-center gap-2.5 w-full md:w-auto justify-end flex-wrap">
            {/* Theme Toggle Button */}
            <ThemeToggle />

            {/* View Mode Toggle */}
            <div
              className={`p-1 rounded-2xl border flex items-center shadow-xs transition-colors ${
                isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'
              }`}
            >
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                  viewMode === 'grid'
                    ? 'bg-cyan-500 text-white shadow-md shadow-cyan-500/30'
                    : isDark
                    ? 'text-slate-400 hover:text-white'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                title={isAr ? 'عرض البطاقات ثلاثية الأبعاد' : '3D Grid View'}
              >
                <i className="fas fa-th-large"></i>
                <span>{isAr ? 'معرض البطاقات' : 'Showcase'}</span>
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                  viewMode === 'table'
                    ? 'bg-cyan-500 text-white shadow-md shadow-cyan-500/30'
                    : isDark
                    ? 'text-slate-400 hover:text-white'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                title={isAr ? 'عرض الجدول التنفيذي' : 'Table View'}
              >
                <i className="fas fa-table-list"></i>
                <span>{isAr ? 'جدول المراجعة' : 'Table'}</span>
              </button>
            </div>

            {/* Export Button */}
            <button
              onClick={handleExportExcel}
              className={`px-4 py-2 rounded-2xl border text-xs font-bold flex items-center gap-2 transition-all shadow-xs ${
                isDark
                  ? 'bg-slate-900/80 hover:bg-slate-800 border-slate-800 text-white'
                  : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
              }`}
              title={isAr ? 'تصدير بيانات الأجهزة إلى إكسل' : 'Export Fleet to Excel'}
            >
              <i className="fas fa-file-excel text-emerald-500"></i>
              <span className="hidden sm:inline">{isAr ? 'تصدير إكسل' : 'Export Excel'}</span>
            </button>

            {/* Add New Device Button */}
            <button
              onClick={() => {
                resetForm();
                setIsFormModalOpen(true);
              }}
              className="px-5 py-2 rounded-2xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-black flex items-center gap-2 shadow-md shadow-cyan-600/30 hover:shadow-lg transition-all border border-cyan-400/30"
            >
              <i className="fas fa-plus-circle text-sm"></i>
              <span>{isAr ? 'إضافة جهاز جديد' : 'Add New Equipment'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Fleet Operational Health HUD (لوحة مؤشرات الأسطول الطبي) */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 my-4">
        <div
          className={`backdrop-blur-xl rounded-[2.5rem] p-5 md:p-6 border shadow-sm transition-colors space-y-5 ${
            isDark
              ? 'bg-slate-900/80 border-slate-800 shadow-slate-950/40'
              : 'bg-white border-slate-200 shadow-slate-200/50'
          }`}
        >
          {/* Top Bar: 4 Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {/* Metric 1: Total Fleet */}
            <div
              className={`p-4 rounded-2xl border flex items-center justify-between transition-colors ${
                isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div>
                <span
                  className={`text-[11px] font-bold uppercase tracking-wider block ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  {isAr ? 'إجمالي الأجهزة' : 'Total Fleet'}
                </span>
                <span
                  className={`text-2xl md:text-3xl font-black mt-1 block ${
                    isDark ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  {fleetStats.total}
                </span>
              </div>
              <div
                className={`w-12 h-12 rounded-2xl border flex items-center justify-center text-xl ${
                  isDark
                    ? 'bg-blue-500/15 border-blue-500/30 text-blue-400'
                    : 'bg-blue-50 border-blue-200 text-blue-600'
                }`}
              >
                <i className="fas fa-cubes"></i>
              </div>
            </div>

            {/* Metric 2: Operational / Valid */}
            <div
              className={`p-4 rounded-2xl border flex items-center justify-between transition-colors ${
                isDark
                  ? 'bg-slate-950/60 border-emerald-500/30'
                  : 'bg-emerald-50/60 border-emerald-200'
              }`}
            >
              <div>
                <span
                  className={`text-[11px] font-bold uppercase tracking-wider block ${
                    isDark ? 'text-emerald-400' : 'text-emerald-700'
                  }`}
                >
                  {isAr ? 'جاهزة وسارية (100%)' : 'Operational Ready'}
                </span>
                <span
                  className={`text-2xl md:text-3xl font-black mt-1 block ${
                    isDark ? 'text-emerald-300' : 'text-emerald-800'
                  }`}
                >
                  {fleetStats.validCount}
                </span>
              </div>
              <div
                className={`w-12 h-12 rounded-2xl border flex items-center justify-center text-xl ${
                  isDark
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                    : 'bg-emerald-100 border-emerald-300 text-emerald-700'
                }`}
              >
                <i className="fas fa-check-double"></i>
              </div>
            </div>

            {/* Metric 3: Warning / Due Soon */}
            <div
              className={`p-4 rounded-2xl border flex items-center justify-between transition-colors ${
                isDark
                  ? 'bg-slate-950/60 border-amber-500/30'
                  : 'bg-amber-50/60 border-amber-200'
              }`}
            >
              <div>
                <span
                  className={`text-[11px] font-bold uppercase tracking-wider block ${
                    isDark ? 'text-amber-400' : 'text-amber-700'
                  }`}
                >
                  {isAr ? 'صيانة قريبة (< 30 يوم)' : 'PPM Due Soon'}
                </span>
                <span
                  className={`text-2xl md:text-3xl font-black mt-1 block ${
                    isDark ? 'text-amber-300' : 'text-amber-800'
                  }`}
                >
                  {fleetStats.warningCount}
                </span>
              </div>
              <div
                className={`w-12 h-12 rounded-2xl border flex items-center justify-center text-xl ${
                  isDark
                    ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                    : 'bg-amber-100 border-amber-300 text-amber-700'
                }`}
              >
                <i className="fas fa-clock"></i>
              </div>
            </div>

            {/* Metric 4: Expired / Overdue */}
            <div
              className={`p-4 rounded-2xl border flex items-center justify-between transition-colors ${
                isDark
                  ? 'bg-slate-950/60 border-rose-500/30'
                  : 'bg-rose-50/60 border-rose-200'
              }`}
            >
              <div>
                <span
                  className={`text-[11px] font-bold uppercase tracking-wider block ${
                    isDark ? 'text-rose-400' : 'text-rose-700'
                  }`}
                >
                  {isAr ? 'منتهية وتحتاج تدخل' : 'Overdue / Attention'}
                </span>
                <span
                  className={`text-2xl md:text-3xl font-black mt-1 block ${
                    isDark ? 'text-rose-300' : 'text-rose-800'
                  }`}
                >
                  {fleetStats.expiredCount}
                </span>
              </div>
              <div
                className={`w-12 h-12 rounded-2xl border flex items-center justify-center text-xl ${
                  isDark
                    ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                    : 'bg-rose-100 border-rose-300 text-rose-700'
                }`}
              >
                <i className="fas fa-exclamation-triangle"></i>
              </div>
            </div>
          </div>

          {/* Bottom Bar: Operational Health Multi-Segment Gauge */}
          <div className="pt-2">
            <div
              className={`flex items-center justify-between text-xs mb-2 font-bold ${
                isDark ? 'text-slate-300' : 'text-slate-700'
              }`}
            >
              <span className="flex items-center gap-2">
                <i className={`fas fa-heartbeat ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}></i>
                {isAr ? 'مؤشر جاهزية الأسطول الطبي العام:' : 'Overall Fleet Health Readiness:'}
                <span
                  className={`font-mono font-black text-sm ${
                    isDark ? 'text-cyan-300' : 'text-cyan-600'
                  }`}
                >
                  {fleetStats.operationalPercent}%
                </span>
              </span>
              <div
                className={`flex items-center gap-4 text-[11px] ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  {isAr ? 'ساري' : 'Valid'} ({fleetStats.validCount})
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                  {isAr ? 'قريب' : 'Due'} ({fleetStats.warningCount})
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                  {isAr ? 'منتهي' : 'Overdue'} ({fleetStats.expiredCount})
                </span>
              </div>
            </div>

            {/* Segmented Bar */}
            <div
              className={`h-3 w-full rounded-full overflow-hidden flex p-0.5 border ${
                isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
              }`}
            >
              {fleetStats.total > 0 ? (
                <>
                  <div
                    style={{ width: `${(fleetStats.validCount / fleetStats.total) * 100}%` }}
                    className="h-full bg-emerald-500 transition-all duration-700"
                    title={`Valid: ${fleetStats.validCount}`}
                  />
                  <div
                    style={{ width: `${(fleetStats.warningCount / fleetStats.total) * 100}%` }}
                    className="h-full bg-amber-500 transition-all duration-700"
                    title={`Warning: ${fleetStats.warningCount}`}
                  />
                  <div
                    style={{ width: `${(fleetStats.expiredCount / fleetStats.total) * 100}%` }}
                    className="h-full bg-rose-500 transition-all duration-700"
                    title={`Expired: ${fleetStats.expiredCount}`}
                  />
                  <div
                    style={{ width: `${(fleetStats.naCount / fleetStats.total) * 100}%` }}
                    className="h-full bg-slate-400 dark:bg-slate-600 transition-all duration-700"
                    title={`N/A: ${fleetStats.naCount}`}
                  />
                </>
              ) : (
                <div className={`h-full w-full ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Control Strip: Search & Modality / Status Filters */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4 mb-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Live Search Input */}
          <div className="relative w-full md:w-96 group">
            <i
              className={`fas fa-search absolute ${
                isAr ? 'right-4' : 'left-4'
              } top-3.5 text-slate-400 group-focus-within:text-cyan-500 transition-colors text-sm`}
            ></i>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={
                isAr
                  ? 'ابحث باسم الجهاز، السيريال، أو التصنيف...'
                  : 'Search by name, serial, category...'
              }
              className={`w-full ${
                isAr ? 'pr-11 pl-10' : 'pl-11 pr-10'
              } py-3 rounded-2xl outline-none text-xs font-bold transition-all shadow-xs border ${
                isDark
                  ? 'bg-slate-900/90 border-slate-800 text-white placeholder-slate-500 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-500/20'
                  : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/15'
              }`}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className={`absolute ${
                  isAr ? 'left-3' : 'right-3'
                } top-3 text-slate-400 hover:text-slate-600 dark:hover:text-white`}
              >
                <i className="fas fa-times-circle"></i>
              </button>
            )}
          </div>

          {/* Status Quick Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1">
            <button
              onClick={() => setSelectedStatusFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap border shadow-xs ${
                selectedStatusFilter === 'ALL'
                  ? isDark
                    ? 'bg-white text-slate-950 font-black border-white'
                    : 'bg-slate-900 text-white font-black border-slate-900'
                  : isDark
                  ? 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {isAr ? 'كل الحالات' : 'All Statuses'}
            </button>
            <button
              onClick={() => setSelectedStatusFilter('VALID')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 border shadow-xs ${
                selectedStatusFilter === 'VALID'
                  ? 'bg-emerald-500 text-white border-emerald-500 font-black shadow-emerald-500/20'
                  : isDark
                  ? 'bg-slate-900 text-emerald-400 border-slate-800 hover:bg-slate-800'
                  : 'bg-white text-emerald-700 border-slate-200 hover:bg-emerald-50'
              }`}
            >
              <i className="fas fa-check-circle text-[10px]"></i>
              <span>{isAr ? 'سارية وجاهزة' : 'Operational'}</span>
            </button>
            <button
              onClick={() => setSelectedStatusFilter('WARNING')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 border shadow-xs ${
                selectedStatusFilter === 'WARNING'
                  ? 'bg-amber-500 text-white border-amber-500 font-black shadow-amber-500/20'
                  : isDark
                  ? 'bg-slate-900 text-amber-400 border-slate-800 hover:bg-slate-800'
                  : 'bg-white text-amber-700 border-slate-200 hover:bg-amber-50'
              }`}
            >
              <i className="fas fa-clock text-[10px]"></i>
              <span>{isAr ? 'صيانة قريبة' : 'Due Soon'}</span>
            </button>
            <button
              onClick={() => setSelectedStatusFilter('EXPIRED')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 border shadow-xs ${
                selectedStatusFilter === 'EXPIRED'
                  ? 'bg-rose-500 text-white border-rose-500 font-black shadow-rose-500/20'
                  : isDark
                  ? 'bg-slate-900 text-rose-400 border-slate-800 hover:bg-slate-800'
                  : 'bg-white text-rose-700 border-slate-200 hover:bg-rose-50'
              }`}
            >
              <i className="fas fa-exclamation-triangle text-[10px]"></i>
              <span>{isAr ? 'منتهية' : 'Overdue'}</span>
            </button>
          </div>
        </div>

        {/* Modality Chips Carousel */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 border shadow-xs ${
              selectedCategory === 'ALL'
                ? 'bg-cyan-600 text-white border-cyan-500 shadow-md shadow-cyan-600/20'
                : isDark
                ? 'bg-slate-900/80 hover:bg-slate-800/80 text-slate-300 border-slate-800'
                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <i className="fas fa-layer-group text-xs"></i>
            <span>{isAr ? 'جميع التصنيفات' : 'All Modalities'}</span>
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${
                isDark ? 'bg-black/30 text-cyan-200' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {devices.length}
            </span>
          </button>

          {availableCategories.map(({ cat, count }) => {
            const theme = getModalityTheme(cat);
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(isSelected ? 'ALL' : cat)}
                className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 border shadow-xs ${
                  isSelected
                    ? 'bg-gradient-to-r ' + theme.gradient + ' text-white border-white/30 shadow-md'
                    : isDark
                    ? 'bg-slate-900/80 hover:bg-slate-800/80 text-slate-300 border-slate-800'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                <i className={`fas ${theme.icon} text-xs`}></i>
                <span>{isAr ? theme.nameAr : cat}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${
                    isSelected
                      ? 'bg-black/30 text-white'
                      : isDark
                      ? 'bg-black/30 text-slate-400'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full border-4 border-cyan-500/20 border-t-cyan-500 animate-spin mb-4"></div>
            <p className="text-slate-400 font-bold text-sm">
              {isAr ? 'جاري تحميل سجل أجهزة المستشفى...' : 'Loading hospital fleet inventory...'}
            </p>
          </div>
        ) : filteredDevices.length === 0 ? (
          <div
            className={`py-16 px-6 rounded-[2.5rem] border text-center max-w-lg mx-auto transition-colors ${
              isDark
                ? 'bg-slate-900/60 border-slate-800'
                : 'bg-white border-slate-200 shadow-sm'
            }`}
          >
            <div
              className={`w-16 h-16 rounded-3xl flex items-center justify-center text-2xl mx-auto mb-4 ${
                isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'
              }`}
            >
              <i className="fas fa-search"></i>
            </div>
            <h3
              className={`text-lg font-black mb-1 ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}
            >
              {isAr ? 'لا توجد أجهزة مطابقة للبحث' : 'No matching equipment found'}
            </h3>
            <p className={`text-xs mb-5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {isAr
                ? 'جرب تغيير شروط البحث أو الفلاتر المختارة'
                : 'Try adjusting search terms or resetting status filters'}
            </p>
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedCategory('ALL');
                setSelectedStatusFilter('ALL');
              }}
              className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all shadow-sm"
            >
              {isAr ? 'إعادة ضبط كل الفلاتر' : 'Reset All Filters'}
            </button>
          </div>
        ) : viewMode === 'table' ? (
          /* High-Density Table View */
          <DeviceTableView
            devices={filteredDevices}
            onViewDetails={(dev) => setInspectDevice(dev)}
            onEdit={openEdit}
            onDelete={handleDelete}
            isAr={isAr}
          />
        ) : (
          /* Showcase 3D Grid View */
          <div className="space-y-10">
            {/* If user filtered to specific category or searched, show direct flat grid */}
            {selectedCategory !== 'ALL' || searchTerm !== '' || !groupByCategory ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredDevices.map((device) => (
                  <DeviceCard
                    key={device.id}
                    device={device}
                    onViewDetails={(dev) => setInspectDevice(dev)}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                    isAr={isAr}
                  />
                ))}
              </div>
            ) : (
              /* Grouped by Modality Accordion / Section */
              availableCategories.map(({ cat }) => {
                const catDevices = filteredDevices.filter(
                  (d) => (d.category || 'Other').toUpperCase() === cat
                );
                if (catDevices.length === 0) return null;

                const theme = getModalityTheme(cat);
                const isExpanded = expandedCategories.has(cat);

                return (
                  <div
                    key={cat}
                    className={`rounded-[2.5rem] border overflow-hidden transition-all shadow-xs ${
                      isDark
                        ? 'bg-slate-900/50 border-slate-800'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    {/* Section Header */}
                    <div
                      onClick={() => toggleCategory(cat)}
                      className={`p-5 md:p-6 flex items-center justify-between cursor-pointer transition-colors ${
                        isDark ? 'hover:bg-slate-800/60' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${theme.gradient} flex items-center justify-center text-white text-xl shadow-md`}
                        >
                          <i className={`fas ${theme.icon}`}></i>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h2
                              className={`text-lg md:text-xl font-black tracking-wide ${
                                isDark ? 'text-white' : 'text-slate-900'
                              }`}
                            >
                              {isAr ? theme.nameAr : cat}
                            </h2>
                            <span
                              className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full border ${
                                isDark
                                  ? 'text-cyan-300 bg-cyan-950/60 border-cyan-800'
                                  : 'text-cyan-800 bg-cyan-50 border-cyan-200'
                              }`}
                            >
                              {catDevices.length} {isAr ? 'أجهزة' : 'Machines'}
                            </span>
                          </div>
                          <p
                            className={`text-xs mt-0.5 ${
                              isDark ? 'text-slate-400' : 'text-slate-500'
                            }`}
                          >
                            {isAr
                              ? 'فحص جاهزية الصيانة الوقائية ومعايير الجودة'
                              : 'Preventive Maintenance & Quality Audit'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                            isExpanded
                              ? isDark
                                ? 'rotate-180 text-cyan-400 bg-slate-800'
                                : 'rotate-180 text-cyan-700 bg-slate-100'
                              : isDark
                              ? 'bg-slate-800/80 text-slate-400'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          <i className="fas fa-chevron-down"></i>
                        </div>
                      </div>
                    </div>

                    {/* Section Devices Grid */}
                    {isExpanded && (
                      <div className="p-5 md:p-6 pt-0">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                          {catDevices.map((device) => (
                            <DeviceCard
                              key={device.id}
                              device={device}
                              onViewDetails={(dev) => setInspectDevice(dev)}
                              onEdit={openEdit}
                              onDelete={handleDelete}
                              isAr={isAr}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Floating Add Action Button */}
      <button
        onClick={() => {
          resetForm();
          setIsFormModalOpen(true);
        }}
        className={`fixed bottom-8 ${
          isAr ? 'left-8' : 'right-8'
        } w-16 h-16 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-full shadow-[0_10px_35px_rgba(6,182,212,0.4)] flex items-center justify-center text-2xl hover:scale-105 transition-all z-40 border-4 border-white/20`}
        title={isAr ? 'إضافة جهاز جديد' : 'Add Device'}
      >
        <i className="fas fa-plus"></i>
      </button>

      {/* Device Detailed Dossier Modal */}
      {inspectDevice && (
        <DeviceDetailsModal
          device={inspectDevice}
          isOpen={Boolean(inspectDevice)}
          onClose={() => setInspectDevice(null)}
          onEdit={(dev) => {
            setInspectDevice(null);
            openEdit(dev);
          }}
          isAr={isAr}
        />
      )}

      {/* Add / Edit Device Form Modal */}
      {isFormModalOpen && (
        <div
          className={`fixed inset-0 backdrop-blur-md z-50 flex items-center justify-center p-4 transition-colors ${
            isDark ? 'bg-slate-950/80' : 'bg-slate-900/50'
          }`}
        >
          <div
            className={`border rounded-[2.5rem] w-full max-w-2xl max-h-[92vh] overflow-y-auto p-6 md:p-8 shadow-2xl transition-colors ${
              isDark
                ? 'bg-slate-900 border-slate-800 text-white'
                : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div
              className={`flex justify-between items-center mb-6 pb-4 border-b ${
                isDark ? 'border-slate-800' : 'border-slate-100'
              }`}
            >
              <div>
                <h2
                  className={`text-xl md:text-2xl font-black ${
                    isDark ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  {editingId
                    ? isAr
                      ? 'تعديل بيانات الجهاز'
                      : 'Edit Equipment Details'
                    : isAr
                    ? 'إضافة جهاز جديد للأسطول'
                    : 'Add New Equipment'}
                </h2>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {isAr
                    ? 'سجل بيانات التوريد، الصيانة الدورية، ومستندات الجودة'
                    : 'Record device specs, PPM cycles, and QC reports'}
                </p>
              </div>
              <button
                onClick={() => setIsFormModalOpen(false)}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                  isDark
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {/* Category */}
              <div className="md:col-span-2">
                <label
                  className={`text-xs font-bold uppercase tracking-wider mb-2 block ${
                    isDark ? 'text-slate-300' : 'text-slate-700'
                  }`}
                >
                  {isAr ? 'تصنيف الجهاز الطبي *' : 'Equipment Modality *'}
                </label>
                <div className="relative">
                  <select
                    className={`w-full rounded-xl p-3.5 text-sm font-bold outline-none transition-all appearance-none border ${
                      isDark
                        ? 'bg-slate-800 border-slate-700 text-white focus:border-cyan-400 focus:bg-slate-750'
                        : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-cyan-500 focus:bg-white'
                    }`}
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  >
                    <option value="">{isAr ? 'اختر تصنيف الجهاز...' : 'Select Category...'}</option>
                    {xrayCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <i
                    className={`fas fa-chevron-down absolute ${
                      isAr ? 'left-4' : 'right-4'
                    } top-4 text-slate-400 pointer-events-none`}
                  ></i>
                </div>
              </div>

              {/* Name */}
              <div>
                <label
                  className={`text-xs font-bold uppercase tracking-wider mb-2 block ${
                    isDark ? 'text-slate-300' : 'text-slate-700'
                  }`}
                >
                  {isAr ? 'اسم الجهاز والطراز *' : 'Device Name & Model *'}
                </label>
                <input
                  className={`w-full rounded-xl p-3 text-sm font-bold outline-none transition-all border ${
                    isDark
                      ? 'bg-slate-800 border-slate-700 text-white focus:border-cyan-400'
                      : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-cyan-500 focus:bg-white'
                  }`}
                  placeholder={isAr ? 'مثال: MRI Siemens MAGNETOM Vida' : 'e.g. MRI Siemens Vida'}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              {/* Serial */}
              <div>
                <label
                  className={`text-xs font-bold uppercase tracking-wider mb-2 block ${
                    isDark ? 'text-slate-300' : 'text-slate-700'
                  }`}
                >
                  {isAr ? 'الرقم التسلسلي (Serial Number)' : 'Serial Number'}
                </label>
                <input
                  className={`w-full rounded-xl p-3 text-sm font-mono font-bold outline-none transition-all border ${
                    isDark
                      ? 'bg-slate-800 border-slate-700 text-white focus:border-cyan-400'
                      : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-cyan-500 focus:bg-white'
                  }`}
                  placeholder="SN-123456"
                  value={formData.serial}
                  onChange={(e) => setFormData({ ...formData, serial: e.target.value })}
                />
              </div>

              {/* Install Date */}
              <div>
                <label
                  className={`text-xs font-bold uppercase tracking-wider mb-2 block ${
                    isDark ? 'text-slate-300' : 'text-slate-700'
                  }`}
                >
                  {isAr ? 'تاريخ التوريد والتركيب' : 'Installation Date'}
                </label>
                <input
                  type="date"
                  className={`w-full rounded-xl p-3 text-sm font-bold outline-none transition-all border ${
                    isDark
                      ? 'bg-slate-800 border-slate-700 text-white focus:border-cyan-400'
                      : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-cyan-500 focus:bg-white'
                  }`}
                  value={formData.installDate}
                  onChange={(e) => setFormData({ ...formData, installDate: e.target.value })}
                />
              </div>

              {/* Image Upload */}
              <div>
                <label
                  className={`text-xs font-bold uppercase tracking-wider mb-2 block ${
                    isDark ? 'text-slate-300' : 'text-slate-700'
                  }`}
                >
                  {isAr ? 'صورة الجهاز عالية الجودة' : 'Device Image'}
                </label>
                <div className="relative group cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                    onChange={(e) => e.target.files && handleFileUpload(e.target.files[0], 'image')}
                  />
                  <div
                    className={`w-full p-3 rounded-xl border-2 border-dashed flex items-center justify-center gap-2 transition-all ${
                      formData.image
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                        : isDark
                        ? 'border-slate-700 bg-slate-800 text-slate-400 group-hover:border-cyan-400 group-hover:text-cyan-300'
                        : 'border-slate-300 bg-slate-50 text-slate-500 group-hover:border-cyan-500 group-hover:text-cyan-600'
                    }`}
                  >
                    {uploadingImg ? (
                      <i className="fas fa-spinner fa-spin"></i>
                    ) : (
                      <i className="fas fa-camera"></i>
                    )}
                    <span className="text-xs font-bold">
                      {formData.image
                        ? isAr
                          ? 'تم رفع الصورة'
                          : 'Image Uploaded'
                        : isAr
                        ? 'رفع صورة الجهاز'
                        : 'Upload Photo'}
                    </span>
                  </div>
                </div>
              </div>

              {/* PPM Section */}
              <div
                className={`p-4 rounded-2xl border md:col-span-2 transition-colors ${
                  isDark
                    ? 'bg-slate-800/80 border-slate-700'
                    : 'bg-blue-50/50 border-blue-200'
                }`}
              >
                <h3
                  className={`font-bold text-sm mb-3 flex items-center gap-2 ${
                    isDark ? 'text-blue-300' : 'text-blue-900'
                  }`}
                >
                  <i className="fas fa-tools"></i>
                  {isAr ? 'الصيانة الوقائية الدورية (PPM Schedule)' : 'Preventive Maintenance (PPM)'}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      className={`text-[10px] font-bold uppercase mb-1 block ${
                        isDark ? 'text-slate-400' : 'text-slate-600'
                      }`}
                    >
                      {isAr ? 'تاريخ انتهاء الصيانة' : 'PPM Expiry Date'}
                    </label>
                    <input
                      type="date"
                      className={`w-full rounded-xl p-2.5 text-xs font-bold outline-none border ${
                        isDark
                          ? 'bg-slate-900 border-slate-700 text-white focus:border-blue-400'
                          : 'bg-white border-slate-300 text-slate-900 focus:border-blue-500'
                      }`}
                      value={formData.maintDate}
                      onChange={(e) => setFormData({ ...formData, maintDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <label
                      className={`text-[10px] font-bold uppercase mb-1 block ${
                        isDark ? 'text-slate-400' : 'text-slate-600'
                      }`}
                    >
                      {isAr ? 'تقرير الصيانة (PDF)' : 'Report Attachment'}
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type="file"
                          accept=".pdf,image/*"
                          className="absolute inset-0 opacity-0 cursor-pointer z-10"
                          onChange={(e) =>
                            e.target.files && handleFileUpload(e.target.files[0], 'maintUrl')
                          }
                        />
                        <div
                          className={`w-full p-2.5 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold ${
                            formData.maintUrl
                              ? 'border-emerald-500 text-emerald-500 bg-emerald-50 dark:bg-slate-900'
                              : isDark
                              ? 'bg-slate-900 border-slate-700 text-slate-400'
                              : 'bg-white border-slate-300 text-slate-500'
                          }`}
                        >
                          {uploadingPPM ? (
                            <i className="fas fa-spinner fa-spin"></i>
                          ) : (
                            <i className="fas fa-file-upload"></i>
                          )}
                          <span>
                            {formData.maintUrl
                              ? isAr
                                ? 'الملف مرفق'
                                : 'Attached'
                              : isAr
                              ? 'إرفاق تقرير'
                              : 'Attach PDF'}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => setScannerField('maintUrl')}
                        className={`p-2.5 rounded-xl border transition-colors ${
                          isDark
                            ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border-blue-500/30'
                            : 'bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-300'
                        }`}
                        title={isAr ? 'مسح التقرير بكاميرا الهاتف' : 'Scan document with camera'}
                      >
                        <i className="fas fa-camera"></i>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* QC Toggle */}
              <div className="md:col-span-2">
                <label
                  className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider cursor-pointer ${
                    isDark ? 'text-slate-300' : 'text-slate-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={formData.enableQA}
                    onChange={(e) => setFormData({ ...formData, enableQA: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-400 text-purple-600 focus:ring-purple-500 bg-slate-100 dark:bg-slate-800"
                  />
                  <span>
                    {isAr
                      ? 'تفعيل معايير ضبط الجودة والمعايرة (QC Audit)'
                      : 'Enable Quality Control (QC)'}
                  </span>
                </label>
              </div>

              {/* QC Section */}
              {formData.enableQA && (
                <div
                  className={`p-4 rounded-2xl border md:col-span-2 transition-colors ${
                    isDark
                      ? 'bg-slate-800/80 border-purple-900/50'
                      : 'bg-purple-50/50 border-purple-200'
                  }`}
                >
                  <h3
                    className={`font-bold text-sm mb-3 flex items-center gap-2 ${
                      isDark ? 'text-purple-300' : 'text-purple-900'
                    }`}
                  >
                    <i className="fas fa-certificate"></i>
                    {isAr ? 'معايير ضبط الجودة والمعايرة (QC)' : 'Quality Control (QC)'}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        className={`text-[10px] font-bold uppercase mb-1 block ${
                          isDark ? 'text-slate-400' : 'text-slate-600'
                        }`}
                      >
                        {isAr ? 'تاريخ انتهاء شهادة الجودة' : 'QC Expiry Date'}
                      </label>
                      <input
                        type="date"
                        className={`w-full rounded-xl p-2.5 text-xs font-bold outline-none border ${
                          isDark
                            ? 'bg-slate-900 border-slate-700 text-white focus:border-purple-400'
                            : 'bg-white border-slate-300 text-slate-900 focus:border-purple-500'
                        }`}
                        value={formData.qualDate}
                        onChange={(e) => setFormData({ ...formData, qualDate: e.target.value })}
                      />
                    </div>
                    <div>
                      <label
                        className={`text-[10px] font-bold uppercase mb-1 block ${
                          isDark ? 'text-slate-400' : 'text-slate-600'
                        }`}
                      >
                        {isAr ? 'شهادة الجودة والمعايرة (PDF)' : 'Certificate Attachment'}
                      </label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <input
                            type="file"
                            accept=".pdf,image/*"
                            className="absolute inset-0 opacity-0 cursor-pointer z-10"
                            onChange={(e) =>
                              e.target.files && handleFileUpload(e.target.files[0], 'qualUrl')
                            }
                          />
                          <div
                            className={`w-full p-2.5 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold ${
                              formData.qualUrl
                                ? 'border-emerald-500 text-emerald-500 bg-emerald-50 dark:bg-slate-900'
                                : isDark
                                ? 'bg-slate-900 border-slate-700 text-slate-400'
                                : 'bg-white border-slate-300 text-slate-500'
                            }`}
                          >
                            {uploadingQC ? (
                              <i className="fas fa-spinner fa-spin"></i>
                            ) : (
                              <i className="fas fa-file-upload"></i>
                            )}
                            <span>
                              {formData.qualUrl
                                ? isAr
                                ? 'الشهادة مرفقة'
                                : 'Attached'
                                : isAr
                                ? 'إرفاق شهادة'
                                : 'Attach PDF'}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => setScannerField('qualUrl')}
                          className={`p-2.5 rounded-xl border transition-colors ${
                            isDark
                              ? 'bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 border-purple-500/30'
                              : 'bg-purple-100 text-purple-700 hover:bg-purple-200 border-purple-300'
                          }`}
                          title={isAr ? 'مسح الشهادة بكاميرا الهاتف' : 'Scan certificate with camera'}
                        >
                          <i className="fas fa-camera"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div
              className={`flex gap-3 pt-4 border-t ${
                isDark ? 'border-slate-800' : 'border-slate-100'
              }`}
            >
              <button
                onClick={() => setIsFormModalOpen(false)}
                className={`flex-1 py-3.5 rounded-xl font-bold text-xs transition-colors ${
                  isDark
                    ? 'bg-slate-800 text-slate-300 hover:bg-slate-750'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={handleSubmit}
                className="flex-[2] py-3.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-black text-xs hover:shadow-lg shadow-cyan-600/20 transition-all"
              >
                {editingId
                  ? isAr
                    ? 'حفظ التعديلات'
                    : 'Update Equipment'
                  : isAr
                  ? 'إضافة الجهاز للأسطول'
                  : 'Save Equipment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Scanner Integration */}
      {scannerField && (
        <DocumentScanner
          onSave={handleScannerSave}
          onCancel={() => setScannerField(null)}
        />
      )}
    </div>
  );
};

export default DeviceInventory;
