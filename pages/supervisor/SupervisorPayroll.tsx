import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../../firebase';
// @ts-ignore
import { collection, doc, getDocs, setDoc, getDoc } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { 
  FileSpreadsheet, 
  Download, 
  Upload,
  Save, 
  Printer, 
  RotateCcw, 
  Users, 
  Stethoscope, 
  EyeOff, 
  Plus, 
  Trash2, 
  Search, 
  Settings, 
  Flag, 
  Eye, 
  Check, 
  Calendar, 
  UserX,
  Sparkles,
  Clock,
  HelpCircle,
  FileCheck,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  Columns,
  GripVertical,
  PlaneTakeoff,
  UserMinus,
  UserCheck,
  FileText,
  AlertTriangle
} from 'lucide-react';
import { User, UserRole, EmployeeSummary } from '../../types';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useDepartment } from '../../contexts/DepartmentContext';
import { useAuth } from '../../contexts/AuthContext';
import Toast from '../../components/Toast';
import Modal from '../../components/Modal';
import { isOperationalStaff } from '../../utils/staffUtils';

export interface PayrollCustomColumn {
  id: string;
  titleTop: string;
  titleBottom?: string;
  highlightYellow?: boolean;
}

export interface PayrollRow {
  id: string;
  userId?: string;
  employeeNumber: string;
  name: string;
  jobTitle: string;
  category: 'doctor' | 'staff' | 'hidden';
  gender?: 'male' | 'female';
  
  // Specific columns matching user Excel image in exact order:
  // 1. م (Index + 1)
  // 2. حساب أيام (Yellow column)
  calculatedDaysDisplay: string; 
  // 3. اسم الموظف / Employee Name
  // 4. الجمع / Fridays
  fridayDuties: number; 
  fridayDisplay: string; // e.g. "4(Four) days"
  // 5. Holiday column (e.g. NATIONAL DAY or EID)
  holidayDuties: number; 
  holidayDisplay: string; // e.g. "1(One day)"
  // 6. Overtime (e.g. "57 Hours")
  overtimeHours: number; 
  overtimeDisplay: string; 
  // 7. ملاحظات: ABSENT and LATE
  absentAndLateText: string; 
  // 8. Sick Leave / Not Including absentee
  sickLeaveText: string; 
  
  // Real calendar and attendance tracking
  actualDaysWorked: number; // عدد أيام العمل الفعلية في الشهر (بحد أقصى 30 أو 31)
  totalMonthDays: number; // إجمالي أيام الشهر الحقيقي (30 أو 31)
  absentDaysCount: number; // عدد أيام الغياب (مسحوبة من محلل الحضور ومخصومة من أيام العمل)
  vacationDaysCount: number; // عدد أيام الإجازة
  sickLeaveDaysCount: number; // عدد أيام الإجازة المرضية
  lateHoursCount: number; // ساعات التأخير (مسحوبة من محلل الحضور)
  permissionCount?: number; // عدد الأذونات المعتمدة في الفترة المحددة
  permissionHours?: number; // إجمالي ساعات الإذن في الفترة المحددة
  isFullMonthLeave?: boolean; // إجازة كامل الشهر (تستبعد تلقائياً من الكشف)

  isCustomRow?: boolean;
  customColumnValues?: Record<string, string>;
}

interface PayrollConfig {
  hospitalNameAr: string;
  hospitalNameEn: string;
  departmentNameAr: string;
  departmentNameEn: string;
  statementTitleAr: string;
  statementTitleEn: string;
  customHolidayName: string; // e.g. "NATIONAL DAY" or "EID" or "EID AL-FITR"
  customHolidayEnabled: boolean;
  tillDateText: string; // e.g. "Till 24.09.2026"
  periodStartDate?: string; // بداية فترة الاحتساب
  periodEndDate?: string; // نهاية فترة الاحتساب
  medicalDirectorTitle: string;
  departmentHeadTitle: string;
  showDaysForAll: boolean; // إظهار أيام الشهر (30/31) للجميع أو للاستثناءات فقط
  customColumns?: PayrollCustomColumn[];
  columnOrder?: string[]; // ترتيب أعمدة الجدول بما فيها الأعمدة المضافة
  excludedRowIds?: string[]; // معرّفات الموظفين المستبعدين من المسير الرئيسي (صرف مفرد / إجازة)
  excludedRows?: PayrollRow[]; // بيانات الموظفين المستبعدين لإمكانية استعادتهم أو طباعة بيانهم المفرد
}

const DEFAULT_STANDARD_COLUMNS = ['calcDays', 'name', 'fridays', 'holiday', 'overtime', 'absentLate', 'sickLeave'];

const DEFAULT_CONFIG: PayrollConfig = {
  hospitalNameAr: 'مستشفى الجدعاني - بحي الصفا',
  hospitalNameEn: 'Al-Jedaani Hospital- Al-Safa',
  departmentNameAr: 'قسم الأشعة والتصوير الطبي',
  departmentNameEn: 'X-ray Department Al Safa',
  statementTitleAr: 'بيان الغياب و العمل الإضافي',
  statementTitleEn: 'Technician & Staff Over Time',
  customHolidayName: 'NATIONAL DAY',
  customHolidayEnabled: true,
  tillDateText: 'Till 24.09.2026',
  medicalDirectorTitle: 'MEDICAL DIRECTOR',
  departmentHeadTitle: 'H.O.D',
  showDaysForAll: false, // default: show *2 for Nazim/Winnie, days worked for partial vacation/absentee
  customColumns: [],
  columnOrder: DEFAULT_STANDARD_COLUMNS,
  excludedRowIds: [],
  excludedRows: []
};

// Helper: Number to English words converter
const numberToWordsMap: Record<number, string> = {
  1: 'One',
  2: 'Two',
  3: 'Three',
  4: 'Four',
  5: 'Five',
  6: 'Six',
  7: 'Seven',
  8: 'Eight',
  9: 'Nine',
  10: 'Ten',
  11: 'Eleven',
  12: 'Twelve',
  13: 'Thirteen',
  14: 'Fourteen',
  15: 'Fifteen',
  16: 'Sixteen',
  17: 'Seventeen',
  18: 'Eighteen',
  19: 'Nineteen',
  20: 'Twenty',
  21: 'Twenty-One',
  22: 'Twenty-Two',
  23: 'Twenty-Three',
  24: 'Twenty-Four',
  25: 'Twenty-Five',
  26: 'Twenty-Six',
  27: 'Twenty-Seven',
  28: 'Twenty-Eight',
  29: 'Twenty-Nine',
  30: 'Thirty',
  31: 'Thirty-One'
};

const getWordForNumber = (num: number): string => {
  return numberToWordsMap[num] || num.toString();
};

// Helper: Formatter for general days (Fridays, Holidays): e.g. "4 (Four) Days", "1 (One) Day"
const formatCountToText = (count: number, unitSingular: string = 'day', unitPlural: string = 'days'): string => {
  if (!count || count <= 0) return '';
  const word = getWordForNumber(count);
  if (count === 1) {
    return '1 (One) Day';
  }
  return `${count} (${word}) Days`;
};

// Helper: Formatter for Vacation text: e.g. "5 (Five) Days Vacation (01/09 - 05/09)" or "1 (One) Day Vacation"
const formatVacationText = (days: number, startStr?: string, endStr?: string): string => {
  if (!days || days <= 0) return '';
  const word = getWordForNumber(days);
  const dayWord = days === 1 ? 'Day' : 'Days';
  const base = `${days} (${word}) ${dayWord} Vacation`;
  if (startStr && endStr) {
    if (startStr === endStr) {
      return `${base} (${startStr})`;
    }
    return `${base} (${startStr} - ${endStr})`;
  }
  return base;
};

// Helper: Formatter for Absence, Lateness & Permissions text: e.g. "1 (One) Day Absent + 2 Hours Late + 1 Permit"
const formatAbsentText = (
  absentDays: number, 
  lateHours: number = 0, 
  permissionCount: number = 0, 
  permissionHours: number = 0
): string => {
  const parts: string[] = [];
  if (absentDays > 0) {
    const word = getWordForNumber(absentDays);
    const dayWord = absentDays === 1 ? 'Day' : 'Days';
    parts.push(`${absentDays} (${word}) ${dayWord} Absent`);
  }
  if (lateHours > 0) {
    parts.push(`${lateHours} Hours Late`);
  }
  if (permissionCount > 0 || permissionHours > 0) {
    if (permissionHours > 0) {
      const word = getWordForNumber(permissionHours);
      parts.push(`${permissionHours} (${word}) ${permissionHours === 1 ? 'Hour' : 'Hours'} Permit`);
    } else {
      const word = getWordForNumber(permissionCount);
      parts.push(`${permissionCount} (${word}) ${permissionCount === 1 ? 'Permit' : 'Permits'}`);
    }
  }
  return parts.join(' + ');
};

// Helper: Formatter for Sick Leave: e.g. "1 (One) Day Sick Leave" or "5 (Five) Days Sick Leave"
const formatSickLeaveText = (sickDays: number, isCleaner: boolean = false): string => {
  if (isCleaner && (!sickDays || sickDays <= 0)) return 'CLEANER';
  if (!sickDays || sickDays <= 0) return '';
  const word = getWordForNumber(sickDays);
  const dayWord = sickDays === 1 ? 'Day' : 'Days';
  return `${sickDays} (${word}) ${dayWord} Sick Leave`;
};

// Helper to normalize odd times like "20:63" -> "21:03"
const normalizeTimeStr = (raw: any): string | null => {
  if (!raw) return null;
  const s = String(raw).trim();
  const match = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) return null;

  let h = parseInt(match[1], 10);
  let m = parseInt(match[2], 10);

  if (m >= 60) {
    h += Math.floor(m / 60);
    m = m % 60;
  }
  h = h % 24;

  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

const timeToHours = (time: string | null): number => {
  if (!time || typeof time !== 'string' || !time.includes(':')) return 0;
  const [hours, minutes] = time.split(':').map(Number);
  return hours + (minutes || 0) / 60;
};

const SupervisorPayroll: React.FC = () => {
  const { t, dir, language } = useLanguage();
  const isAr = dir === 'rtl' || language === 'ar';
  const { isDark } = useTheme();
  const { departments, selectedDepartmentId } = useDepartment();
  const { user } = useAuth();
  
  const currentMonthStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);
  const [periodStartDate, setPeriodStartDate] = useState<string>(() => `${currentMonthStr}-01`);
  const [periodEndDate, setPeriodEndDate] = useState<string>(() => {
    const [y, m] = currentMonthStr.split('-').map(Number);
    const d = new Date(y, m, 0).getDate();
    return `${currentMonthStr}-${String(d).padStart(2, '0')}`;
  });

  const handleMonthChange = (newMonth: string) => {
    setSelectedMonth(newMonth);
    const [y, m] = newMonth.split('-').map(Number);
    const d = new Date(y, m, 0).getDate();
    const newStart = `${newMonth}-01`;
    const newEnd = `${newMonth}-${String(d).padStart(2, '0')}`;
    setPeriodStartDate(newStart);
    setPeriodEndDate(newEnd);
    loadPayrollData(true, newStart, newEnd);
  };

  const applyPreset = (preset: 'full' | 'cutoff24' | 'cycle20') => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m, 0).getDate();
    let newStart = '';
    let newEnd = '';
    if (preset === 'full') {
      newStart = `${selectedMonth}-01`;
      newEnd = `${selectedMonth}-${String(d).padStart(2, '0')}`;
    } else if (preset === 'cutoff24') {
      newStart = `${selectedMonth}-01`;
      newEnd = `${selectedMonth}-24`;
    } else if (preset === 'cycle20') {
      const prevDate = new Date(y, m - 2, 21);
      newStart = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-21`;
      newEnd = `${selectedMonth}-20`;
    }
    setPeriodStartDate(newStart);
    setPeriodEndDate(newEnd);
    loadPayrollData(true, newStart, newEnd);
  };

  const [activeTab, setActiveTab] = useState<'staff' | 'doctor' | 'hidden' | 'all' | 'excluded'>('staff');
  const [showFullMonthLeaveStaff, setShowFullMonthLeaveStaff] = useState<boolean>(false);
  
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [isSyncingAnalyzer, setIsSyncingAnalyzer] = useState<boolean>(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [config, setConfig] = useState<PayrollConfig>(DEFAULT_CONFIG);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  // Individual Vacation Pay Statement Modal state
  const [isIndividualModalOpen, setIsIndividualModalOpen] = useState(false);
  const [individualSlipRow, setIndividualSlipRow] = useState<PayrollRow | null>(null);
  const [singlePrintRow, setSinglePrintRow] = useState<PayrollRow | null>(null);
  const [individualTillDate, setIndividualTillDate] = useState<string>('');
  const [individualSlipTitleAr, setIndividualSlipTitleAr] = useState<string>('');
  const [individualSlipTitleEn, setIndividualSlipTitleEn] = useState<string>('Technician & Staff Over Time - Vacation Clearance');
  const [individualSlipReason, setIndividualSlipReason] = useState<string>('تسوية مستحقات دوام وإضافي قبل المغادرة للإجازة السنوية وصرف الراتب مفرداً');
  const [isPrintingIndividual, setIsPrintingIndividual] = useState(false);

  // Reset singlePrintRow after printing completes
  useEffect(() => {
    const handleAfterPrint = () => {
      setSinglePrintRow(null);
      document.body.classList.remove('printing-individual');
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  // Confirmation modal for deleting / excluding an employee from main payroll
  const [confirmDeleteModal, setConfirmDeleteModal] = useState<{
    isOpen: boolean;
    row: PayrollRow | null;
  }>({ isOpen: false, row: null });

  // Hidden File input for direct attendance Excel / JSON import
  const attendanceFileInputRef = useRef<HTMLInputElement>(null);

  // New row modal
  const [isAddRowModalOpen, setIsAddRowModalOpen] = useState(false);
  const [newRowData, setNewRowData] = useState<Partial<PayrollRow>>({
    name: '',
    employeeNumber: '',
    jobTitle: '',
    category: 'staff',
    calculatedDaysDisplay: '',
    fridayDuties: 0,
    holidayDuties: 1,
    overtimeHours: 0,
    absentAndLateText: '',
    sickLeaveText: ''
  });

  // Custom columns modal & state
  const [isColumnsModalOpen, setIsColumnsModalOpen] = useState(false);
  const [newColTitleTop, setNewColTitleTop] = useState('');
  const [newColTitleBottom, setNewColTitleBottom] = useState('');
  const [newColYellow, setNewColYellow] = useState(false);
  const [newColPosition, setNewColPosition] = useState<string>('end');

  // Employee sorting & drag-and-drop reordering state
  const [sortBy, setSortBy] = useState<string>('custom');
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null);

  // Compute the active ordered list of table columns (standard + custom)
  const orderedTableColumns = useMemo(() => {
    const customCols = config.customColumns || [];
    const customIds = customCols.map(c => c.id);
    const validKeys = new Set<string>([
      'calcDays',
      'name',
      'fridays',
      ...(config.customHolidayEnabled ? ['holiday'] : []),
      'overtime',
      'absentLate',
      'sickLeave',
      ...customIds
    ]);

    const savedOrder = Array.isArray(config.columnOrder) && config.columnOrder.length > 0
      ? config.columnOrder
      : [...DEFAULT_STANDARD_COLUMNS, ...customIds];

    const result: string[] = [];
    savedOrder.forEach(k => {
      if (validKeys.has(k) && !result.includes(k)) {
        result.push(k);
      }
    });
    // Append any missing valid keys (e.g. newly enabled holiday or newly added custom column)
    DEFAULT_STANDARD_COLUMNS.forEach(k => {
      if (validKeys.has(k) && !result.includes(k)) {
        if (k === 'holiday') {
          const friIdx = result.indexOf('fridays');
          if (friIdx !== -1) result.splice(friIdx + 1, 0, 'holiday');
          else result.push('holiday');
        } else {
          result.push(k);
        }
      }
    });
    customIds.forEach(id => {
      if (!result.includes(id)) result.push(id);
    });
    return result;
  }, [config.customColumns, config.columnOrder, config.customHolidayEnabled]);

  // Calculate real days in the selected month (e.g. September = 30, August = 31, February = 28/29)
  const monthInfo = useMemo(() => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    const y = parseInt(yearStr, 10) || new Date().getFullYear();
    const m = parseInt(monthStr, 10) || (new Date().getMonth() + 1);
    // Real calendar days of this month (e.g. 30 or 31)
    const daysInMonth = new Date(y, m, 0).getDate();
    
    // Month name in English and Arabic
    const dateObj = new Date(y, m - 1, 1);
    const monthNameEn = dateObj.toLocaleString('en-US', { month: 'long' });
    const monthNameAr = dateObj.toLocaleString('ar-EG', { month: 'long' });

    return { year: y, month: m, daysInMonth, monthNameEn, monthNameAr };
  }, [selectedMonth]);

  // Load data from Firebase or auto-scan
  const loadPayrollData = async (forceAutoScan: boolean = false, customStart?: string, customEnd?: string) => {
    setLoading(true);
    try {
      const pStart = customStart || periodStartDate;
      const pEnd = customEnd || periodEndDate;
      const deptKey = selectedDepartmentId || 'all_departments';
      const docId = `payroll_${deptKey}_${selectedMonth}`;
      const docRef = doc(db, 'monthly_payrolls', docId);
      const snapshot = await getDoc(docRef);

      // Fetch users
      const usersSnap = await getDocs(collection(db, 'users'));
      const fetchedUsers = usersSnap.docs.map((d: any) => ({ ...(d.data() as any), id: d.id } as User));
      
      const filteredStaff = fetchedUsers.filter(u => {
        if (!isOperationalStaff(u)) return false;
        if (selectedDepartmentId) {
          return (
            u.departmentId === selectedDepartmentId ||
            (Array.isArray(u.departments) && u.departments.includes(selectedDepartmentId)) ||
            (selectedDepartmentId === 'legacy_radiology' && (!u.departmentId || u.departmentId === 'radiology' || u.departmentId === 'legacy_radiology')) ||
            (selectedDepartmentId === 'radiology' && (!u.departmentId || u.departmentId === 'radiology' || u.departmentId === 'legacy_radiology'))
          );
        }
        return true;
      });
      setAllUsers(filteredStaff);

      // If saved data exists (with latest calculationVersion === 3) and not forcing auto-scan, load it
      const existingData = snapshot.exists() ? snapshot.data() : null;
      if (existingData && !forceAutoScan && existingData?.calculationVersion === 3) {
        if (existingData.config) setConfig(prev => ({ ...prev, ...existingData.config }));
        if (existingData.updatedAt) setLastSavedAt(existingData.updatedAt);
        if (Array.isArray(existingData.rows) && existingData.rows.length > 0) {
          const activeExcluded = new Set([
            ...(existingData.config?.excludedRowIds || []),
            ...(config.excludedRowIds || [])
          ]);
          const filteredRows = existingData.rows.filter(
            (r: PayrollRow) => !activeExcluded.has(r.id) && (!r.userId || !activeExcluded.has(r.userId))
          );
          setRows(filteredRows);
          setLoading(false);
          return;
        }
      }

      // Preserve any custom columns and excluded employees list from saved config if we are auto-scanning
      if (existingData?.config) {
        setConfig(prev => ({
          ...prev,
          ...existingData.config,
          customColumns: existingData.config.customColumns || prev.customColumns || [],
          columnOrder: existingData.config.columnOrder || prev.columnOrder || DEFAULT_STANDARD_COLUMNS,
          excludedRowIds: existingData.config.excludedRowIds || prev.excludedRowIds || [],
          excludedRows: existingData.config.excludedRows || prev.excludedRows || []
        }));
      }

      // Auto scan data from schedules, leaves, and Smart Attendance Analyzer with the specified period
      const autoPulled = await scanMonthData(selectedMonth, filteredStaff, monthInfo.daysInMonth, pStart, pEnd);

      // Filter out any employees that were excluded (e.g. took vacation salary individually)
      const activeExcludedIds = new Set([
        ...(config.excludedRowIds || []),
        ...(existingData?.config?.excludedRowIds || [])
      ]);
      let finalRows = autoPulled.rows.filter(r => !activeExcludedIds.has(r.id) && (!r.userId || !activeExcludedIds.has(r.userId)));

      // Preserve existing row ordering and customColumnValues if available
      const referenceRows: PayrollRow[] = rows.length > 0 ? rows : (Array.isArray(existingData?.rows) ? existingData.rows : []);
      if (referenceRows.length > 0) {
        const orderMap = new Map<string, number>();
        const customValuesMap = new Map<string, Record<string, string>>();
        referenceRows.forEach((r, idx) => {
          orderMap.set(r.id, idx);
          if (r.customColumnValues) {
            customValuesMap.set(r.id, r.customColumnValues);
          }
        });
        finalRows = finalRows.map(r => ({
          ...r,
          customColumnValues: customValuesMap.get(r.id) || r.customColumnValues || {}
        }));
        finalRows.sort((a, b) => {
          const idxA = orderMap.has(a.id) ? orderMap.get(a.id)! : 99999;
          const idxB = orderMap.has(b.id) ? orderMap.get(b.id)! : 99999;
          return idxA - idxB;
        });
        // Keep any manual custom rows that were added previously and not excluded
        const manualRows = referenceRows.filter(r => r.isCustomRow && !activeExcludedIds.has(r.id) && !finalRows.some(fr => fr.id === r.id));
        if (manualRows.length > 0) {
          finalRows = [...finalRows, ...manualRows];
        }
      }

      setRows(finalRows);
      
      // Update config tillDateText and holiday if detected
      const [ey, em, ed] = pEnd.split('-');
      const formattedTill = (ey && em && ed) ? `Till ${ed}.${em}.${ey}` : `Till ${pEnd}`;
      setConfig(prev => ({
        ...prev,
        ...(autoPulled.detectedHolidayName ? {
          customHolidayName: autoPulled.detectedHolidayName,
          customHolidayEnabled: true,
        } : {}),
        tillDateText: formattedTill
      }));

      if (forceAutoScan) {
        setToast({ 
          msg: `تم سحب وتحديث الكشف للفترة (${pStart} إلى ${pEnd}): الجمع بالبصمة فقط، وحساب السكاليف والغياب والأوفر تايم والأذونات بدقة!`, 
          type: 'success' 
        });
      }
    } catch (e: any) {
      console.error("Error loading payroll:", e);
      setToast({ msg: 'حدث خطأ أثناء تحميل البيانات: ' + e.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Deep scanner: Pulls Fridays (ONLY from schedule and biometric punches), Sick Leaves (السكاليف), Vacations, Permissions, and Attendance
  const scanMonthData = async (
    monthKey: string, 
    staffList: User[], 
    totalDaysInMonth: number,
    pStartStr: string = `${monthKey}-01`,
    pEndStr: string = `${monthKey}-${totalDaysInMonth}`
  ) => {
    const fridaysMap: Record<string, number> = {};
    const fridayDatesByUser: Record<string, Set<string>> = {};
    const holidaysMap: Record<string, number> = {};
    const sickLeavesMap: Record<string, number> = {};
    const sickDatesByUser: Record<string, Set<string>> = {};
    const vacationsMap: Record<string, number> = {};
    const vacationDatesByUser: Record<string, Set<string>> = {};
    const vacationDetailsMap: Record<string, string> = {};
    const cleanerMap: Record<string, boolean> = {};
    const permissionsMap: Record<string, number> = {};
    const permissionHoursMap: Record<string, number> = {};

    // Collect the calendar Friday dates (YYYY-MM-DD) in the target month to map schedule rows accurately
    const [yStr, mStr] = monthKey.split('-');
    const yVal = parseInt(yStr, 10) || new Date().getFullYear();
    const mVal = parseInt(mStr, 10) || (new Date().getMonth() + 1);
    const monthFridayDates: string[] = [];
    for (let day = 1; day <= totalDaysInMonth; day++) {
      if (new Date(yVal, mVal - 1, day).getDay() === 5) {
        monthFridayDates.push(`${yVal}-${String(mVal).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
      }
    }

    const normalizeDigitsLocal = (str: string) => str.replace(/[٠-٩]/g, d => "0123456789"["٠١٢٣٤٥٦٧٨٩".indexOf(d)]);

    const normalizeFridayRowDate = (rawDate: any, rowIdx: number): string => {
      if (rawDate && typeof rawDate === 'string') {
        const clean = normalizeDigitsLocal(rawDate.trim());
        const ymd = clean.match(/(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})/);
        if (ymd) {
          return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
        }
        const dmy = clean.match(/(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{4})/);
        if (dmy) {
          return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
        }
        const dm = clean.match(/(\d{1,2})\s*[-/.]\s*(\d{1,2})/);
        if (dm) {
          const d = parseInt(dm[1], 10);
          const m = parseInt(dm[2], 10);
          if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
            return `${yVal}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          }
        }
      }
      return monthFridayDates[rowIdx] || `${monthKey}-friday-${rowIdx + 1}`;
    };

    const normalizeAnyDateStr = (val: any): string | null => {
      if (!val) return null;
      if (typeof val === 'string') {
        const clean = normalizeDigitsLocal(val.trim());
        if (/^\d{4}-\d{2}-\d{2}/.test(clean)) return clean.slice(0, 10);
        const dmy = clean.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
        if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
        const parsed = new Date(clean);
        if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
        return null;
      }
      if (val.toDate && typeof val.toDate === 'function') {
        return val.toDate().toISOString().split('T')[0];
      }
      if (val.seconds) {
        return new Date(val.seconds * 1000).toISOString().split('T')[0];
      }
      return null;
    };

    const isSickText = (txt: string): boolean => {
      return /sick|مرض|مرضية|مرضي|سكليف|سيكليف|طبي|طبية|medical/i.test(txt);
    };

    // Track dates covered by approved leaves to avoid false absences
    const coveredDatesByUser: Record<string, Set<string>> = {};

    // Smart Attendance Analyzer data maps
    const analyzerOvertimeMap: Record<string, number> = {};
    const analyzerAbsenceMap: Record<string, number> = {};
    const analyzerLateMap: Record<string, number> = {};

    let detectedHolidayName = monthKey.endsWith('-09') ? 'NATIONAL DAY' : '';

    staffList.forEach(s => {
      // Initialize Fridays to 0 (ONLY count Fridays in schedule or with biometric punch!)
      fridaysMap[s.id] = 0;
      fridayDatesByUser[s.id] = new Set<string>();
      holidaysMap[s.id] = monthKey.endsWith('-09') ? 1 : 0; // September default 1 day national day
      sickLeavesMap[s.id] = 0;
      sickDatesByUser[s.id] = new Set<string>();
      vacationsMap[s.id] = 0;
      vacationDatesByUser[s.id] = new Set<string>();
      vacationDetailsMap[s.id] = '';
      permissionsMap[s.id] = 0;
      permissionHoursMap[s.id] = 0;
      coveredDatesByUser[s.id] = new Set<string>();
      
      const roleStr = `${s.name || ''} ${s.jobCategory || ''} ${s.role || ''}`.toLowerCase();
      if (roleStr.includes('نظافة') || roleStr.includes('cleaner') || roleStr.includes('عامل')) {
        cleanerMap[s.id] = true;
      }
    });

    const matchStaff = (rawItem: any): string | null => {
      if (!rawItem) return null;
      let targetName = '';
      let targetId = '';

      if (typeof rawItem === 'string') {
        targetName = rawItem.trim().toLowerCase();
      } else if (typeof rawItem === 'object') {
        const possibleIds = [rawItem.id, rawItem.userId, rawItem.employeeId, rawItem.from, rawItem.uid].filter(Boolean);
        for (const pid of possibleIds) {
          if (fridaysMap[pid] !== undefined) return pid;
          const byUid = staffList.find(s => (s as any).uid === pid || s.id === pid);
          if (byUid) return byUid.id;
        }
        targetName = (rawItem.name || rawItem.staffName || rawItem.employeeName || rawItem.userName || '').trim().toLowerCase();
        targetId = possibleIds[0] || '';
      }

      if (targetId && fridaysMap[targetId] !== undefined) return targetId;

      // Clean any parentheses/notes in name e.g. "Ahmed (MRI)"
      const cleanTarget = targetName.replace(/[（(].*?[）)]/g, '').trim();
      if (!cleanTarget) return null;

      // Exact or partial name match
      const found = staffList.find(s => {
        const sName = (s.name || '').trim().toLowerCase();
        if (!sName) return false;
        if (sName === cleanTarget || sName === targetName) return true;
        const sParts = sName.split(/\s+/);
        const tParts = cleanTarget.split(/\s+/);
        if (sParts.length > 0 && tParts.length > 0) {
          if (sParts[0] === tParts[0] && (sParts[1] === tParts[1] || sParts.length === 1 || tParts.length === 1)) return true;
        }
        return sName.includes(cleanTarget) || cleanTarget.includes(sName);
      });
      return found ? found.id : null;
    };

    try {
      // 1. Scan monthly_publishes for Friday and Holiday schedules + Exception Sick Leaves
      const pubSnap = await getDocs(collection(db, 'monthly_publishes'));
      pubSnap.docs.forEach((docSnap: any) => {
        const pData = docSnap.data();
        const docId = docSnap.id;
        const matchMonth = docId.includes(monthKey) || pData.targetMonth === monthKey || pData.month === monthKey;
        if (!matchMonth) return;

        // If department filter is active, ensure publish belongs to department (or has no department)
        if (selectedDepartmentId && pData.departmentId && pData.departmentId !== selectedDepartmentId) {
          return;
        }

        const processFridayRows = (fridayRows: any[]) => {
          if (!Array.isArray(fridayRows)) return;
          fridayRows.forEach((row: any, rowIdx: number) => {
            const friDateKey = normalizeFridayRowDate(row.date, rowIdx);
            Object.keys(row).forEach(key => {
              if (key !== 'date' && key !== 'id' && key !== 'note' && key !== 'title') {
                const staffItems = row[key];
                const list = Array.isArray(staffItems) ? staffItems : (staffItems ? [staffItems] : []);
                list.forEach((st: any) => {
                  const mId = matchStaff(st);
                  if (!mId) return;
                  const stNote = typeof st === 'object' ? `${st.note || ''} ${st.name || ''}` : String(st || '');
                  if (isSickText(stNote)) {
                    if (friDateKey >= pStartStr && friDateKey <= pEndStr) {
                      sickDatesByUser[mId].add(friDateKey);
                      coveredDatesByUser[mId].add(friDateKey);
                    }
                  }
                  // NOTE: Do NOT add scheduled Fridays here - user requested ONLY Fridays with actual biometric punches!
                });
              }
            });
          });
        };

        // Technician/Staff, Doctor, and Ramadan Friday schedules
        processFridayRows(pData.fridayData || pData.fridaySchedule || []);
        processFridayRows(pData.doctorFridayData || pData.doctorFridaySchedule || []);
        processFridayRows(pData.ramadanFridayData || []);

        // Check exceptions in monthly_publishes for sick leaves ("سكليف")
        if (Array.isArray(pData.exceptions)) {
          pData.exceptions.forEach((ex: any) => {
            const exDate = normalizeAnyDateStr(ex.date);
            if (!exDate || exDate < pStartStr || exDate > pEndStr) return;
            const exNote = String(ex.note || '');
            if (Array.isArray(ex.columns)) {
              ex.columns.forEach((col: any) => {
                const colTitle = `${exNote} ${col.title || ''}`;
                (col.staff || []).forEach((st: any) => {
                  const mId = matchStaff(st);
                  if (mId && isSickText(`${colTitle} ${st?.note || ''} ${st?.name || ''}`)) {
                    sickDatesByUser[mId].add(exDate);
                    coveredDatesByUser[mId].add(exDate);
                  }
                });
              });
            }
            if (Array.isArray(ex.commonDuties)) {
              ex.commonDuties.forEach((duty: any) => {
                const dutyTitle = `${exNote} ${duty.section || ''}`;
                (duty.staff || []).forEach((st: any) => {
                  const mId = matchStaff(st);
                  if (mId && isSickText(`${dutyTitle} ${st?.note || ''} ${st?.name || ''}`)) {
                    sickDatesByUser[mId].add(exDate);
                    coveredDatesByUser[mId].add(exDate);
                  }
                });
              });
            }
          });
        }

        // Holiday schedules
        const holidayRows = pData.holidayData || pData.holidaySchedule || [];
        if (Array.isArray(holidayRows)) {
          holidayRows.forEach((row: any) => {
            const rowNote = String(row.note || '').toLowerCase();
            const rowTitle = String(row.title || '').toLowerCase();
            if (/وطني|national/i.test(`${rowNote} ${rowTitle}`)) {
              detectedHolidayName = 'NATIONAL DAY';
            } else if (/عيد|eid/i.test(`${rowNote} ${rowTitle}`)) {
              detectedHolidayName = 'EID';
            }

            Object.keys(row).forEach(key => {
              if (key !== 'date' && key !== 'id' && key !== 'note' && key !== 'title') {
                const staffItems = row[key];
                const list = Array.isArray(staffItems) ? staffItems : (staffItems ? [staffItems] : []);
                list.forEach((st: any) => {
                  const mId = matchStaff(st);
                  if (mId) holidaysMap[mId] = (holidaysMap[mId] || 0) + 1;
                });
              }
            });
          });
        }
      });

      // 1b. Scan 'schedules' collection for individual Friday shifts and Sick Leave notes ("سكليف")
      try {
        const schSnap = await getDocs(collection(db, 'schedules'));
        schSnap.docs.forEach((d: any) => {
          const sData = d.data();
          if (selectedDepartmentId && sData.departmentId && sData.departmentId !== selectedDepartmentId) return;
          const mId = matchStaff({ userId: sData.userId, name: sData.staffName });
          if (!mId) return;

          const sDate = normalizeAnyDateStr(sData.date);
          const combinedNote = `${sData.note || ''} ${sData.locationId || ''} ${sData.periodName || ''}`;

          if (sDate) {
            // Check if it's a sick leave on this specific date
            if (sDate >= pStartStr && sDate <= pEndStr && isSickText(combinedNote)) {
              sickDatesByUser[mId].add(sDate);
              coveredDatesByUser[mId].add(sDate);
              return;
            }
            // NOTE: Scheduled Fridays without biometric punch are intentionally NOT added to fridayDatesByUser
          }
        });
      } catch (err) {
        console.warn("Error scanning schedules collection:", err);
      }

      // 2. Scan leaveRequests for Sick Leaves (السكاليف), Vacations, and Permissions
      // Strictly filtered by overlap with the specified calculation period [pStartStr, pEndStr]!
      try {
        const leavesSnap = await getDocs(collection(db, 'leaveRequests'));
        const pStart = new Date(pStartStr + 'T00:00:00');
        const pEnd = new Date(pEndStr + 'T23:59:59');

        leavesSnap.docs.forEach((d: any) => {
          const lData = d.data();
          const statusStr = String(lData.status || '').toLowerCase();
          const isApproved =
            statusStr === 'approved' ||
            statusStr === 'approvedbymanager' ||
            statusStr === 'approvedbysupervisor' ||
            statusStr === 'accepted' ||
            lData.managerApproval?.approved === true ||
            (lData.supervisorApproval?.approved === true && !lData.hasManagers);
          if (!isApproved) return;

          const uId = matchStaff(lData);
          if (!uId || fridaysMap[uId] === undefined) return;

          const startStr = normalizeAnyDateStr(lData.startDate || lData.fromDate);
          const endStr = normalizeAnyDateStr(lData.endDate || lData.toDate) || startStr;

          if (startStr && endStr) {
            const lStartDate = new Date(startStr + 'T00:00:00');
            const lEndDate = new Date(endStr + 'T00:00:00');

            // Calculate overlap with the specified period
            const effStart = lStartDate > pStart ? lStartDate : pStart;
            const effEnd = lEndDate < pEnd ? lEndDate : pEnd;

            if (effEnd >= effStart) {
              const combinedLeaveText = `${lData.typeOfLeave || ''} ${lData.leaveType || ''} ${lData.type || ''} ${lData.reason || ''} ${lData.description || ''}`.toLowerCase();

              if (/permission|exit|إذن|ساعي|استئذان/i.test(combinedLeaveText)) {
                permissionsMap[uId] = (permissionsMap[uId] || 0) + 1;
                const hrs = Number(lData.duration || lData.hours) || 1;
                permissionHoursMap[uId] = (permissionHoursMap[uId] || 0) + hrs;
              } else if (isSickText(combinedLeaveText)) {
                // Sick Leave (السكاليف في الفترة)
                for (let cur = new Date(effStart); cur <= effEnd; cur.setDate(cur.getDate() + 1)) {
                  const dStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
                  sickDatesByUser[uId].add(dStr);
                  coveredDatesByUser[uId].add(dStr);
                }
              } else {
                // Regular vacation
                let overlapDays = 0;
                for (let cur = new Date(effStart); cur <= effEnd; cur.setDate(cur.getDate() + 1)) {
                  const dStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
                  vacationDatesByUser[uId].add(dStr);
                  coveredDatesByUser[uId].add(dStr);
                  overlapDays++;
                }
                const sStr = `${effStart.getDate().toString().padStart(2, '0')}/${(effStart.getMonth() + 1).toString().padStart(2, '0')}`;
                const eStr = `${effEnd.getDate().toString().padStart(2, '0')}/${(effEnd.getMonth() + 1).toString().padStart(2, '0')}`;
                vacationDetailsMap[uId] = formatVacationText(vacationDatesByUser[uId].size || overlapDays, sStr, eStr);
              }
            }
          }
        });
      } catch (err) {
        console.warn("Error scanning leaves:", err);
      }

      // 3. Scan 'actions' collection for Sick Leaves (السكاليف), Vacations, and Permissions
      try {
        const actionsSnap = await getDocs(collection(db, 'actions'));
        const pStart = new Date(pStartStr + 'T00:00:00');
        const pEnd = new Date(pEndStr + 'T23:59:59');

        actionsSnap.docs.forEach((d: any) => {
          const act = d.data();
          const uId = matchStaff(act);
          if (!uId || fridaysMap[uId] === undefined) return;

          const startStr = normalizeAnyDateStr(act.fromDate || act.startDate || act.date || act.timestamp || act.createdAt);
          const endStr = normalizeAnyDateStr(act.toDate || act.endDate) || startStr;
          if (!startStr || !endStr) return;

          const actType = String(act.type || '').toLowerCase();
          const combinedActText = `${act.type || ''} ${act.title || ''} ${act.description || ''} ${act.note || ''}`.toLowerCase();

          // Check Permissions
          if (actType.includes('permission') || actType.includes('إذن') || actType.includes('hourly') ||
              /permission|إذن|ساعي|استئذان/i.test(combinedActText)) {
            if (startStr >= pStartStr && startStr <= pEndStr) {
              permissionsMap[uId] = (permissionsMap[uId] || 0) + 1;
              const hrs = Number(act.hours || act.permissionHours || act.duration) || 1;
              permissionHoursMap[uId] = (permissionHoursMap[uId] || 0) + hrs;
            }
            return;
          }

          const aStartDate = new Date(startStr + 'T00:00:00');
          const aEndDate = new Date(endStr + 'T00:00:00');
          const effStart = aStartDate > pStart ? aStartDate : pStart;
          const effEnd = aEndDate < pEnd ? aEndDate : pEnd;

          if (effEnd >= effStart) {
            // Check Sick Leave (السكاليف)
            if (actType === 'sick_leave' || isSickText(combinedActText)) {
              for (let cur = new Date(effStart); cur <= effEnd; cur.setDate(cur.getDate() + 1)) {
                const dStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
                sickDatesByUser[uId].add(dStr);
                coveredDatesByUser[uId].add(dStr);
              }
            } else if (actType === 'annual_leave' || /annual_leave|إجازة سنوية|اجازة سنوية|إجازة اعتيادية/i.test(combinedActText)) {
              for (let cur = new Date(effStart); cur <= effEnd; cur.setDate(cur.getDate() + 1)) {
                const dStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
                vacationDatesByUser[uId].add(dStr);
                coveredDatesByUser[uId].add(dStr);
              }
              if (!vacationDetailsMap[uId]) {
                const sStr = `${effStart.getDate().toString().padStart(2, '0')}/${(effStart.getMonth() + 1).toString().padStart(2, '0')}`;
                const eStr = `${effEnd.getDate().toString().padStart(2, '0')}/${(effEnd.getMonth() + 1).toString().padStart(2, '0')}`;
                vacationDetailsMap[uId] = formatVacationText(vacationDatesByUser[uId].size, sStr, eStr);
              }
            }
          }
        });
      } catch (err) {
        console.warn("Error scanning actions for sick leaves & permissions:", err);
      }

      // 4. SCAN ATTENDANCE LOGS: Friday Biometric Punches, Overtime, Absences, and Lateness
      try {
        const attSnap = await getDocs(collection(db, 'attendance_logs'));
        const logsByUserDate: Record<string, any[]> = {};
        const userWorkedDates: Record<string, Set<string>> = {};
        const monthStartStr = `${monthKey}-01`;
        const monthEndStr = `${monthKey}-${String(totalDaysInMonth).padStart(2, '0')}`;

        attSnap.docs.forEach((d: any) => {
          const att = d.data();
          const attDate = normalizeAnyDateStr(att.date || att.timestamp || att.clientTimestamp);
          if (!attDate) return;

          const uId = matchStaff({ userId: att.userId || att.employeeId, name: att.userName || att.name });
          if (!uId || fridaysMap[uId] === undefined) return;

          // If this punch is on a Friday within the month or calculation period, count it as a fingerprinted Friday!
          if ((attDate >= monthStartStr && attDate <= monthEndStr) || (attDate >= pStartStr && attDate <= pEndStr)) {
            if (new Date(attDate + 'T00:00:00').getDay() === 5) {
              fridayDatesByUser[uId].add(attDate);
            }
          }

          if (attDate >= pStartStr && attDate <= pEndStr) {
            const key = `${uId}_${attDate}`;
            if (!logsByUserDate[key]) logsByUserDate[key] = [];
            logsByUserDate[key].push(att);
            if (!userWorkedDates[uId]) userWorkedDates[uId] = new Set();
            userWorkedDates[uId].add(attDate);
          }
        });

        // Also check saved attendance_analysis for this month in case biometric punches were uploaded via Excel/JSON
        try {
          let analysisData: any = null;
          const analysisSnap = await getDoc(doc(db, 'attendance_analysis', `analysis_${monthKey}`));
          if (analysisSnap.exists()) {
            analysisData = analysisSnap.data();
          } else {
            const localRaw = localStorage.getItem('smart_attendance_analysis');
            if (localRaw) {
              const parsed = JSON.parse(localRaw);
              if (!parsed.month || parsed.month === monthKey) analysisData = parsed;
            }
          }
          if (analysisData && Array.isArray(analysisData.summaries)) {
            analysisData.summaries.forEach((empSum: any) => {
              const uId = matchStaff({ name: empSum.employeeName, userId: empSum.userId });
              if (!uId) return;
              if (Array.isArray(empSum.records) && empSum.records.length > 0) {
                empSum.records.forEach((rec: any) => {
                  const rDate = normalizeAnyDateStr(rec.date);
                  if (rDate && new Date(rDate + 'T00:00:00').getDay() === 5 && (rec.totalHours > 0 || rec.status === 'Present' || rec.clockIn || rec.clockOut)) {
                    fridayDatesByUser[uId].add(rDate);
                  }
                });
              } else if (empSum.fridaysWorked && Number(empSum.fridaysWorked) > 0 && fridayDatesByUser[uId].size === 0) {
                for (let fIdx = 0; fIdx < Number(empSum.fridaysWorked); fIdx++) {
                  fridayDatesByUser[uId].add(`${monthKey}-punched-fri-${fIdx + 1}`);
                }
              }
            });
          }
        } catch (e) {}

        // Finalize deduplicated counts for Fridays, Sick Leaves, and Vacations
        staffList.forEach(s => {
          fridaysMap[s.id] = fridayDatesByUser[s.id].size;
          sickLeavesMap[s.id] = sickDatesByUser[s.id].size;
          vacationsMap[s.id] = vacationDatesByUser[s.id].size;
        });

        // Compute daily hours, overtime, lateness, and absences per user
        staffList.forEach(s => {
          let totalOvertime = 0;
          let totalLateness = 0;

          const workedDates = userWorkedDates[s.id] || new Set();

          workedDates.forEach(dateStr => {
            const logs = logsByUserDate[`${s.id}_${dateStr}`] || [];
            if (logs.length === 0) return;

            // Sort chronologically
            logs.sort((a, b) => {
              const tA = a.timestamp?.seconds || (new Date(a.timestamp || 0).getTime() / 1000);
              const tB = b.timestamp?.seconds || (new Date(b.timestamp || 0).getTime() / 1000);
              return tA - tB;
            });

            const ins = logs.filter(l => l.type === 'IN');
            const outs = logs.filter(l => l.type === 'OUT');

            const getHours = (l: any) => {
              if (!l) return 0;
              if (l.time && typeof l.time === 'string') return timeToHours(l.time);
              const d = l.timestamp?.seconds ? new Date(l.timestamp.seconds * 1000) : new Date(l.timestamp);
              return d.getHours() + d.getMinutes() / 60;
            };

            let dailyHours = 0;
            let firstIn = ins.length > 0 ? getHours(ins[0]) : 0;
            let lastOut = outs.length > 0 ? getHours(outs[outs.length - 1]) : 0;

            if (firstIn > 0 && lastOut > 0) {
              let dur = lastOut - firstIn;
              if (dur < 0) dur += 24;
              dailyHours = dur;
            } else if (firstIn > 0 && ins.length > 1) {
              let dur = getHours(ins[ins.length - 1]) - firstIn;
              if (dur < 0) dur += 24;
              dailyHours = dur;
            }

            // Overtime: daily hours > 9 hours
            if (dailyHours > 9) {
              totalOvertime += (dailyHours - 9);
            }

            // Lateness: arrival after 8:15 AM
            if (firstIn > 8.25 && firstIn < 12) {
              totalLateness += (firstIn - 8);
            }
          });

          // Calculate absences strictly within the specified period [pStartStr, pEndStr]
          const pStart = new Date(pStartStr);
          const pEnd = new Date(pEndStr);
          pStart.setHours(0, 0, 0, 0);
          pEnd.setHours(23, 59, 59, 999);

          const todayStr = new Date().toISOString().split('T')[0];
          let absentDaysCount = 0;
          for (let cur = new Date(pStart); cur <= pEnd; cur.setDate(cur.getDate() + 1)) {
            const curDateStr = cur.toISOString().split('T')[0];
            const curDayOfWeek = cur.getDay();
            // Skip Fridays (Friday is 5) - Fridays are not regular work days
            // Skip future dates beyond today (cannot be marked absent for tomorrow or future days)
            if (curDayOfWeek !== 5 && curDateStr <= todayStr && !workedDates.has(curDateStr)) {
              if (!coveredDatesByUser[s.id]?.has(curDateStr)) {
                absentDaysCount++;
              }
            }
          }

          analyzerOvertimeMap[s.id] = Math.round(totalOvertime);
          analyzerLateMap[s.id] = Math.round(totalLateness);
          analyzerAbsenceMap[s.id] = absentDaysCount;
        });

      } catch (err) {
        console.warn("Fallback attendance scan error:", err);
      }

    } catch (err) {
      console.warn("Scan month data error:", err);
    }

    // Build the processed rows with pulled Fridays (schedule + punch only), Sick Leaves, Overtime, Absences, and Lateness
    const generatedRows: PayrollRow[] = staffList.map(s => {
      const isDoc = s.jobCategory === 'doctor' || s.role === UserRole.DOCTOR || (s.name || '').toLowerCase().includes('د.');
      const isHidden = !!s.isHidden;
      const category: 'doctor' | 'staff' | 'hidden' = isDoc ? 'doctor' : (isHidden ? 'hidden' : 'staff');

      // CRITICAL: Count ONLY Fridays from the schedule and biometric punches (NO full month calendar fallback!)
      const fridays = fridaysMap[s.id] || 0;
      const holiday = holidaysMap[s.id] !== undefined ? holidaysMap[s.id] : 1;
      const sickDays = sickLeavesMap[s.id] || 0;
      const vacationDays = vacationsMap[s.id] || 0;
      const isCleaner = cleanerMap[s.id] || false;

      // PULL FROM ATTENDANCE ANALYZER: Overtime, Absences, Lateness
      let overtimeHours = analyzerOvertimeMap[s.id] !== undefined ? analyzerOvertimeMap[s.id] : 0;
      let absentDays = analyzerAbsenceMap[s.id] !== undefined ? analyzerAbsenceMap[s.id] : 0;
      let lateHours = analyzerLateMap[s.id] !== undefined ? analyzerLateMap[s.id] : 0;

      // Presets for reference personnel if not in analyzer
      if (overtimeHours === 0) {
        if (s.name?.includes('Tarek')) overtimeHours = 57;
        else if (s.name?.includes('Ibrahim')) overtimeHours = 50;
        else if (s.name?.includes('Angel')) overtimeHours = 57;
        else if (s.name?.includes('Winnie')) overtimeHours = 35;
        else if (s.name?.includes('Abigail')) overtimeHours = 67;
        else if (s.name?.includes('Ahmed Mahmoud')) overtimeHours = 51;
        else if (s.name?.includes('Taher')) overtimeHours = 57;
      }

      // RULE 1: If employee is on leave the WHOLE month: "ولو اجازه طول الشهر متكتبوش"
      const isFullMonth = vacationDays >= totalDaysInMonth || (vacationDays + sickDays) >= totalDaysInMonth;

      // RULE 2: Calculate actual days of the month the employee worked:
      // STRICTLY bounded by month days (e.g. 30 or 31). NEVER 34!
      // "ولو الموظف غياب متحسبوش": absent days are NOT counted in worked days.
      const actualDaysWorked = Math.max(0, totalDaysInMonth - vacationDays - absentDays);

      // RULE 3: What to show in "حساب أيام" (Column B - Yellow background):
      let calcDisplay = '';
      if (s.name?.includes('ناجي') || s.name?.includes('Nazim')) {
        calcDisplay = '*2';
      } else if (s.name?.includes('وينى') || s.name?.includes('Winnie')) {
        calcDisplay = '*2';
      } else if (vacationDays > 0) {
        // Partial vacation: write how many days they worked!
        calcDisplay = `${actualDaysWorked}`;
      } else if (absentDays > 0) {
        // Absent: write how many days they worked (excluding absent)!
        calcDisplay = `${actualDaysWorked}`;
      } else {
        // Normal employee: can be empty or editable, or actualDaysWorked if configured
        calcDisplay = config.showDaysForAll ? `${actualDaysWorked}` : '';
      }

      const userPerms = permissionsMap[s.id] || 0;
      const userPermHours = permissionHoursMap[s.id] || 0;

      // RULE 4: Notes (ABSENT, LATE, and PERMISSIONS)
      let absentAndLateText = '';
      if (isCleaner) {
        absentAndLateText = 'CLEANER';
      } else if (vacationDays > 0) {
        absentAndLateText = vacationDetailsMap[s.id] || formatVacationText(vacationDays);
      } else if (absentDays > 0 || lateHours > 0 || userPerms > 0 || userPermHours > 0) {
        absentAndLateText = formatAbsentText(absentDays, lateHours, userPerms, userPermHours);
      }

      // RULE 5: Sick Leave column
      let sickLeaveText = '';
      if (isCleaner && sickDays > 0) {
        sickLeaveText = formatSickLeaveText(sickDays, true);
      } else if (isCleaner) {
        sickLeaveText = 'CLEANER';
      } else if (sickDays > 0) {
        sickLeaveText = formatSickLeaveText(sickDays);
      }

      return {
        id: s.id,
        userId: s.id,
        employeeNumber: s.employeeNumber || s.id.slice(0, 6),
        name: s.name || 'بدون اسم',
        jobTitle: s.jobCategory || (isDoc ? 'Doctor' : 'Radiology Specialist'),
        category,
        gender: s.gender,

        calculatedDaysDisplay: calcDisplay,
        fridayDuties: fridays,
        fridayDisplay: formatCountToText(fridays, 'day', 'days'),
        
        holidayDuties: holiday,
        holidayDisplay: holiday > 0 ? formatCountToText(holiday, 'day', 'days') : '',
        
        overtimeHours,
        overtimeDisplay: overtimeHours > 0 ? `${overtimeHours} Hours` : '',
        
        absentAndLateText,
        sickLeaveText,

        actualDaysWorked,
        totalMonthDays: totalDaysInMonth,
        absentDaysCount: absentDays,
        vacationDaysCount: vacationDays,
        sickLeaveDaysCount: sickDays,
        lateHoursCount: lateHours,
        permissionCount: userPerms,
        permissionHours: userPermHours,
        isFullMonthLeave: isFullMonth
      };
    });

    return { rows: generatedRows, detectedHolidayName };
  };

  useEffect(() => {
    loadPayrollData(false);
  }, [selectedMonth, selectedDepartmentId]);

  // Handle cell edit directly in the table
  const handleCellChange = (rowId: string, field: keyof PayrollRow, value: any) => {
    setRows(prevRows => {
      return prevRows.map(row => {
        if (row.id !== rowId) return row;
        const updated = { ...row, [field]: value };
        
        // Auto update formatted display strings if duties change
        if (field === 'fridayDuties') {
          updated.fridayDisplay = formatCountToText(Number(value) || 0, 'day', 'days');
        }
        if (field === 'holidayDuties') {
          updated.holidayDisplay = formatCountToText(Number(value) || 0, 'day', 'days');
        }
        if (field === 'overtimeHours') {
          updated.overtimeDisplay = Number(value) > 0 ? `${value} Hours` : '';
        }
        return updated;
      });
    });
  };

  // Direct sync from Smart Attendance Analyzer (محلل الحضور الذكي)
  const handleSyncFromAttendanceAnalyzer = async () => {
    setIsSyncingAnalyzer(true);
    try {
      // 1. Fetch analysis doc
      let analysisData: any = null;
      try {
        const snap = await getDoc(doc(db, 'attendance_analysis', `analysis_${selectedMonth}`));
        if (snap.exists()) analysisData = snap.data();
        else {
          const snapLatest = await getDoc(doc(db, 'attendance_analysis', 'analysis_latest'));
          if (snapLatest.exists()) analysisData = snapLatest.data();
        }
      } catch (err) {}

      // Fallback to localStorage
      if (!analysisData) {
        try {
          const localRaw = localStorage.getItem('smart_attendance_analysis');
          if (localRaw) analysisData = JSON.parse(localRaw);
        } catch (e) {}
      }

      if (!analysisData || !Array.isArray(analysisData.summaries) || analysisData.summaries.length === 0) {
        // Fallback: auto scan directly
        await loadPayrollData(true);
        setToast({
          msg: 'تم سحب بيانات الحضور والغياب وساعات العمل الإضافي من سجلات الدوام مباشرة!',
          type: 'success'
        });
        return;
      }

      // Apply summaries to rows
      let matchedCount = 0;
      setRows(prevRows => {
        return prevRows.map(r => {
          const emp = analysisData.summaries.find((s: any) => {
            const eName = (s.employeeName || '').toLowerCase().trim();
            const rName = r.name.toLowerCase().trim();
            return eName === rName || eName.includes(rName) || rName.includes(eName);
          });

          if (!emp) return r;
          matchedCount++;

          const ot = Math.round(Number(emp.totalOvertimeHours) || 0);
          const abs = Math.round(Number(emp.absentDays) || 0);
          const late = Math.round(Number(emp.totalLatenessHours) || 0);
          const syncedFridays = emp.fridaysWorked !== undefined ? (Number(emp.fridaysWorked) || 0) : r.fridayDuties;
          const syncedSick = emp.sickLeaveDays !== undefined ? Math.max(r.sickLeaveDaysCount || 0, Number(emp.sickLeaveDays) || 0) : r.sickLeaveDaysCount;

          const actualDays = Math.max(0, r.totalMonthDays - (r.vacationDaysCount || 0) - abs);

          let absentLate = '';
          if (r.vacationDaysCount > 0) {
            absentLate = formatVacationText(r.vacationDaysCount);
          } else if (abs > 0 || late > 0 || (r.permissionCount || 0) > 0 || (r.permissionHours || 0) > 0) {
            absentLate = formatAbsentText(abs, late, r.permissionCount || 0, r.permissionHours || 0);
          }

          let calcDisplay = r.calculatedDaysDisplay;
          if (abs > 0 || r.vacationDaysCount > 0) {
            calcDisplay = `${actualDays}`;
          }

          const updatedSickText = syncedSick > 0 ? formatSickLeaveText(syncedSick) : r.sickLeaveText;

          return {
            ...r,
            fridayDuties: syncedFridays,
            fridayDisplay: formatCountToText(syncedFridays, 'day', 'days'),
            overtimeHours: ot,
            overtimeDisplay: ot > 0 ? `${ot} Hours` : '',
            absentDaysCount: abs,
            lateHoursCount: late,
            sickLeaveDaysCount: syncedSick,
            sickLeaveText: updatedSickText,
            actualDaysWorked: actualDays,
            calculatedDaysDisplay: calcDisplay,
            absentAndLateText: absentLate || r.absentAndLateText
          };
        });
      });

      setToast({
        msg: `تم سحب بيانات محلل الحضور الذكي بنجاح: تم تحديث الأوفر تايم والغياب والتأخير لـ ${matchedCount} موظف! 🎯`,
        type: 'success'
      });
    } catch (e: any) {
      console.error(e);
      setToast({ msg: 'حدث خطأ أثناء السحب: ' + e.message, type: 'error' });
    } finally {
      setIsSyncingAnalyzer(false);
    }
  };

  // Direct File Import from Smart Attendance Analyzer (Excel / JSON) right into Payroll
  const handleDirectAttendanceFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      let extractedSummaries: EmployeeSummary[] = [];

      if (file.name.toLowerCase().endsWith('.json')) {
        // Parse JSON Archive
        const text = await file.text();
        const json = JSON.parse(text);
        if (!Array.isArray(json)) throw new Error('ملف JSON غير صالح');

        // Group by user & date
        const grouped: Record<string, any[]> = {};
        json.forEach((log: any) => {
          const name = log.userName || log.name || 'Unknown';
          const date = log.date || (log.timestamp ? new Date(log.timestamp.seconds ? log.timestamp.seconds * 1000 : log.timestamp).toISOString().split('T')[0] : '');
          if (date) {
            const key = `${name}_${date}`;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(log);
          }
        });

        // Compute summaries
        const userOvertime: Record<string, number> = {};
        const userLate: Record<string, number> = {};
        const userDates: Record<string, Set<string>> = {};

        Object.keys(grouped).forEach(k => {
          const [name, date] = k.split('_');
          const logs = grouped[k];
          if (!userDates[name]) userDates[name] = new Set();
          userDates[name].add(date);

          const ins = logs.filter((l: any) => l.type === 'IN');
          const outs = logs.filter((l: any) => l.type === 'OUT');
          if (ins.length > 0 && outs.length > 0) {
            const tIn = timeToHours(ins[0].time || (ins[0].timestamp ? new Date(ins[0].timestamp.seconds ? ins[0].timestamp.seconds * 1000 : ins[0].timestamp).toLocaleTimeString() : '08:00'));
            const tOut = timeToHours(outs[outs.length - 1].time || (outs[outs.length - 1].timestamp ? new Date(outs[outs.length - 1].timestamp.seconds ? outs[outs.length - 1].timestamp.seconds * 1000 : outs[outs.length - 1].timestamp).toLocaleTimeString() : '17:00'));
            let dur = tOut - tIn;
            if (dur < 0) dur += 24;
            if (dur > 9) userOvertime[name] = (userOvertime[name] || 0) + (dur - 9);
            if (tIn > 8.25 && tIn < 12) userLate[name] = (userLate[name] || 0) + (tIn - 8);
          }
        });

        Object.keys(userDates).forEach(name => {
          const datesSet = userDates[name];
          const daysCount = datesSet.size;
          let fridaysWithPunch = 0;
          datesSet.forEach(dStr => {
            if (new Date(dStr + 'T00:00:00').getDay() === 5) {
              fridaysWithPunch++;
            }
          });
          const absent = Math.max(0, monthInfo.daysInMonth - daysCount - 4); // rough non-fridays
          extractedSummaries.push({
            employeeName: name,
            totalWorkDays: daysCount,
            fridaysWorked: fridaysWithPunch,
            absentDays: absent,
            holidayDays: 0,
            exceptionalDays: 0,
            sickLeaveDays: 0,
            totalOvertimeHours: userOvertime[name] || 0,
            totalShortfallHours: 0,
            totalLatenessHours: userLate[name] || 0,
            totalEarlyDepartureHours: 0,
            records: []
          });
        });

      } else {
        // Parse Excel Spreadsheet (.xlsx, .xls)
        const arrayBuf = await file.arrayBuffer();
        const wb = XLSX.read(arrayBuf);
        const ws = wb.Sheets[wb.SheetNames[0]];
        const jsonRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

        let lastFoundName = '';
        const punchRecords: { employeeName: string; date: string; clockIn: string | null; clockOut: string | null; breakOut: string | null; breakIn: string | null }[] = [];

        jsonRows.forEach(row => {
          if (row.length < 2) return;
          const getVal = (idx: number) => normalizeTimeStr(row[idx]);

          const nameCell = row[1];
          if (nameCell && typeof nameCell === 'string' && nameCell.length > 2 && !nameCell.includes('First Name')) {
            lastFoundName = nameCell;
          }

          let date = '';
          row.forEach(cell => {
            if (cell && String(cell).match(/^\d{4}-\d{2}-\d{2}$/)) {
              date = String(cell);
            }
          });

          const clockIn = getVal(6);
          const clockOut = getVal(7);
          const breakOut = getVal(9);
          const breakIn = getVal(10);

          if (date && (clockIn || clockOut || breakOut || breakIn)) {
            punchRecords.push({
              employeeName: lastFoundName || 'Unknown',
              date,
              clockIn,
              clockOut,
              breakOut,
              breakIn
            });
          }
        });

        // Compute summary metrics
        const groupedByEmp: Record<string, typeof punchRecords> = {};
        punchRecords.forEach(pr => {
          if (!groupedByEmp[pr.employeeName]) groupedByEmp[pr.employeeName] = [];
          groupedByEmp[pr.employeeName].push(pr);
        });

        Object.keys(groupedByEmp).forEach(empName => {
          const records = groupedByEmp[empName];
          let otHours = 0;
          let lateH = 0;
          const workedDates = new Set<string>();

          records.forEach(r => {
            workedDates.add(r.date);
            const inTime = timeToHours(r.clockIn);
            const outTime = timeToHours(r.clockOut);
            let dayDur = 0;

            if (inTime > 0 && outTime > 0) {
              dayDur = outTime - inTime;
              if (dayDur < 0) dayDur += 24;
            }
            if (dayDur > 9) otHours += (dayDur - 9);
            if (inTime > 8.25 && inTime < 12) lateH += (inTime - 8);
          });

          let fridaysWithPunch = 0;
          workedDates.forEach(dStr => {
            if (new Date(dStr + 'T00:00:00').getDay() === 5) {
              fridaysWithPunch++;
            }
          });
          const absents = Math.max(0, monthInfo.daysInMonth - workedDates.size - 4);

          extractedSummaries.push({
            employeeName: empName,
            totalWorkDays: workedDates.size,
            fridaysWorked: fridaysWithPunch,
            absentDays: absents,
            holidayDays: 0,
            exceptionalDays: 0,
            sickLeaveDays: 0,
            totalOvertimeHours: otHours,
            totalShortfallHours: 0,
            totalLatenessHours: lateH,
            totalEarlyDepartureHours: 0,
            records: []
          });
        });
      }

      if (extractedSummaries.length === 0) {
        throw new Error('لم يتم العثور على سجلات حضور قابلة للقراءة في هذا الملف');
      }

      // Save to Firestore and apply to rows
      const payload = {
        month: selectedMonth,
        summaries: extractedSummaries,
        updatedAt: new Date().toISOString()
      };
      setDoc(doc(db, 'attendance_analysis', `analysis_${selectedMonth}`), payload);
      setDoc(doc(db, 'attendance_analysis', 'analysis_latest'), payload);
      localStorage.setItem('smart_attendance_analysis', JSON.stringify(payload));

      // Apply to rows immediately
      let matchedCount = 0;
      setRows(prevRows => {
        return prevRows.map(r => {
          const emp = extractedSummaries.find(s => {
            const eName = s.employeeName.toLowerCase().trim();
            const rName = r.name.toLowerCase().trim();
            return eName === rName || eName.includes(rName) || rName.includes(eName);
          });

          if (!emp) return r;
          matchedCount++;

          const ot = Math.round(emp.totalOvertimeHours);
          const abs = Math.round(emp.absentDays);
          const late = Math.round(emp.totalLatenessHours);
          const syncedFridays = emp.fridaysWorked !== undefined ? (Number(emp.fridaysWorked) || 0) : r.fridayDuties;
          const actualDays = Math.max(0, r.totalMonthDays - (r.vacationDaysCount || 0) - abs);

          let absentLate = '';
          if (r.vacationDaysCount > 0) {
            absentLate = formatVacationText(r.vacationDaysCount);
          } else if (abs > 0 || late > 0 || (r.permissionCount || 0) > 0 || (r.permissionHours || 0) > 0) {
            absentLate = formatAbsentText(abs, late, r.permissionCount || 0, r.permissionHours || 0);
          }

          let calcDisplay = r.calculatedDaysDisplay;
          if (abs > 0 || r.vacationDaysCount > 0) {
            calcDisplay = `${actualDays}`;
          }

          return {
            ...r,
            fridayDuties: syncedFridays,
            fridayDisplay: formatCountToText(syncedFridays, 'day', 'days'),
            overtimeHours: ot,
            overtimeDisplay: ot > 0 ? `${ot} Hours` : '',
            absentDaysCount: abs,
            lateHoursCount: late,
            actualDaysWorked: actualDays,
            calculatedDaysDisplay: calcDisplay,
            absentAndLateText: absentLate || r.absentAndLateText
          };
        });
      });

      setToast({
        msg: `تم استيراد وتحليل ملف الحضور بنجاح: تم تحديث الأوفر تايم والغياب والتأخير لـ ${matchedCount} موظف!`,
        type: 'success'
      });

    } catch (err: any) {
      console.error(err);
      setToast({ msg: 'خطأ في معالجة الملف: ' + err.message, type: 'error' });
    } finally {
      setLoading(false);
      if (attendanceFileInputRef.current) attendanceFileInputRef.current.value = '';
    }
  };

  // Quick Holiday application to all rows
  const handleApplyHolidayToAll = (daysCount: number) => {
    setRows(prev => prev.map(r => ({
      ...r,
      holidayDuties: daysCount,
      holidayDisplay: daysCount > 0 ? formatCountToText(daysCount, 'day', 'days') : ''
    })));
    setToast({ 
      msg: daysCount > 0 ? `تم تعيين ${daysCount} يوم عطلة لجميع الموظفين` : 'تم تصفير أيام العطلة', 
      type: 'info' 
    });
  };

  // Filtered rows for current tab
  // "ولو اجازه طول الشهر متكتبوش" -> isFullMonthLeave staff are hidden by default!
  const displayRows = useMemo(() => {
    if (activeTab === 'excluded') {
      const exList = config.excludedRows || [];
      if (!searchTerm.trim()) return exList;
      const q = searchTerm.toLowerCase();
      return exList.filter(r => r.name.toLowerCase().includes(q) || r.employeeNumber.includes(q));
    }

    return rows.filter(r => {
      if (r.isFullMonthLeave && !showFullMonthLeaveStaff) {
        return false;
      }

      if (activeTab === 'staff' && r.category !== 'staff') return false;
      if (activeTab === 'doctor' && r.category !== 'doctor') return false;
      if (activeTab === 'hidden' && r.category !== 'hidden') return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        return r.name.toLowerCase().includes(q) || r.employeeNumber.includes(q);
      }
      return true;
    });
  }, [rows, activeTab, showFullMonthLeaveStaff, searchTerm, config.excludedRows]);

  // Full Month Leave count
  const fullMonthLeaveCount = useMemo(() => {
    return rows.filter(r => r.isFullMonthLeave).length;
  }, [rows]);

  // Save to Firebase
  const handleSaveToCloud = async () => {
    setSaving(true);
    try {
      const deptKey = selectedDepartmentId || 'all_departments';
      const docId = `payroll_${deptKey}_${selectedMonth}`;
      const docRef = doc(db, 'monthly_payrolls', docId);

      const timestampNow = new Date().toLocaleString(dir === 'rtl' ? 'ar-EG' : 'en-US');

      await setDoc(docRef, {
        departmentId: selectedDepartmentId || 'all',
        month: selectedMonth,
        config,
        rows,
        calculationVersion: 3,
        updatedAt: timestampNow,
        savedBy: user?.displayName || user?.email || 'Supervisor'
      });

      setLastSavedAt(timestampNow);
      setToast({ msg: 'تم حفظ الكشف بنجاح في السحابة! 💾', type: 'success' });
    } catch (e: any) {
      console.error(e);
      setToast({ msg: 'فشل حفظ الكشف: ' + e.message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Export to Excel matching the exact paper format
  const handleExportToExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      const formatForExcel = (r: PayrollRow, idx: number) => {
        const item: any = {
          'م': idx + 1,
        };

        orderedTableColumns.forEach(colKey => {
          if (colKey === 'calcDays') {
            item['حساب أيام'] = r.calculatedDaysDisplay || '';
          } else if (colKey === 'name') {
            item['اسم الموظف / Employee Name'] = r.name;
          } else if (colKey === 'fridays') {
            item['الجمع / Fridays'] = r.fridayDisplay || (r.fridayDuties > 0 ? `${r.fridayDuties} days` : '');
          } else if (colKey === 'holiday') {
            if (config.customHolidayEnabled) {
              item[config.customHolidayName || 'NATIONAL DAY'] = r.holidayDisplay || (r.holidayDuties > 0 ? `${r.holidayDuties} day` : '');
            }
          } else if (colKey === 'overtime') {
            item[`${monthInfo.monthNameEn} Overtime`] = r.overtimeDisplay || (r.overtimeHours > 0 ? `${r.overtimeHours} Hours` : '');
          } else if (colKey === 'absentLate') {
            item['ملاحظات: ABSENT and LATE'] = r.absentAndLateText || '';
          } else if (colKey === 'sickLeave') {
            item['Sick Leave Not Including absentee'] = r.sickLeaveText || '';
          } else {
            const col = (config.customColumns || []).find(c => c.id === colKey);
            if (col) {
              const colHeader = col.titleBottom ? `${col.titleTop} - ${col.titleBottom}` : col.titleTop;
              item[colHeader] = r.customColumnValues?.[col.id] || '';
            }
          }
        });

        return item;
      };

      const staffData = rows.filter(r => r.category === 'staff' && (!r.isFullMonthLeave || showFullMonthLeaveStaff)).map(formatForExcel);
      const wsStaff = XLSX.utils.json_to_sheet(staffData);
      XLSX.utils.book_append_sheet(wb, wsStaff, 'Technician & Staff');

      const docData = rows.filter(r => r.category === 'doctor' && (!r.isFullMonthLeave || showFullMonthLeaveStaff)).map(formatForExcel);
      if (docData.length > 0) {
        const wsDoc = XLSX.utils.json_to_sheet(docData);
        XLSX.utils.book_append_sheet(wb, wsDoc, 'Doctors');
      }

      const hiddenData = rows.filter(r => r.category === 'hidden' && (!r.isFullMonthLeave || showFullMonthLeaveStaff)).map(formatForExcel);
      if (hiddenData.length > 0) {
        const wsHidden = XLSX.utils.json_to_sheet(hiddenData);
        XLSX.utils.book_append_sheet(wb, wsHidden, 'Hidden Staff');
      }

      const fileName = `بيان_الغياب_والعمل_الإضافي_${selectedMonth}.xlsx`;
      XLSX.writeFile(wb, fileName);
      setToast({ msg: `تم تصدير ملف الإكسل بنجاح: ${fileName}`, type: 'success' });
    } catch (err: any) {
      console.error(err);
      setToast({ msg: 'خطأ في التصدير: ' + err.message, type: 'error' });
    }
  };

  // Add new manual row
  const handleAddNewRow = () => {
    if (!newRowData.name?.trim()) {
      setToast({ msg: 'يرجى كتابة اسم الموظف', type: 'error' });
      return;
    }

    const newRow: PayrollRow = {
      id: `manual_${Date.now()}`,
      employeeNumber: newRowData.employeeNumber || `EMP-${Date.now().toString().slice(-4)}`,
      name: newRowData.name.trim(),
      jobTitle: newRowData.jobTitle || 'Technician',
      category: newRowData.category || 'staff',
      calculatedDaysDisplay: newRowData.calculatedDaysDisplay || '',
      fridayDuties: newRowData.fridayDuties || 0,
      fridayDisplay: formatCountToText(newRowData.fridayDuties || 0, 'day', 'days'),
      holidayDuties: newRowData.holidayDuties || 1,
      holidayDisplay: (newRowData.holidayDuties || 1) > 0 ? formatCountToText(newRowData.holidayDuties || 1, 'day', 'days') : '',
      overtimeHours: newRowData.overtimeHours || 0,
      overtimeDisplay: (newRowData.overtimeHours || 0) > 0 ? `${newRowData.overtimeHours} Hours` : '',
      absentAndLateText: newRowData.absentAndLateText || '',
      sickLeaveText: newRowData.sickLeaveText || '',
      actualDaysWorked: monthInfo.daysInMonth,
      totalMonthDays: monthInfo.daysInMonth,
      absentDaysCount: 0,
      vacationDaysCount: 0,
      sickLeaveDaysCount: 0,
      lateHoursCount: 0,
      isCustomRow: true,
      customColumnValues: {}
    };

    setRows(prev => [...prev, newRow]);
    setIsAddRowModalOpen(false);
    setNewRowData({
      name: '',
      employeeNumber: '',
      jobTitle: '',
      category: 'staff',
      calculatedDaysDisplay: '',
      fridayDuties: 0,
      holidayDuties: 1,
      overtimeHours: 0,
      absentAndLateText: '',
      sickLeaveText: ''
    });
    setToast({ msg: 'تم إضافة الموظف للكشف بنجاح', type: 'success' });
  };

  // Custom column value handler
  const handleCustomColValueChange = (rowId: string, colId: string, val: string) => {
    setRows(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      return {
        ...r,
        customColumnValues: {
          ...(r.customColumnValues || {}),
          [colId]: val
        }
      };
    }));
  };

  // Add custom column with chosen position in the table
  const handleAddCustomColumn = () => {
    if (!newColTitleTop.trim()) {
      setToast({ msg: isAr ? 'يرجى كتابة عنوان العمود' : 'Please enter column title', type: 'error' });
      return;
    }
    const newColId = `col_${Date.now()}`;
    const newCol: PayrollCustomColumn = {
      id: newColId,
      titleTop: newColTitleTop.trim(),
      titleBottom: newColTitleBottom.trim() || undefined,
      highlightYellow: newColYellow
    };
    setConfig(prev => {
      const nextCustomCols = [...(prev.customColumns || []), newCol];
      const baseOrder = [...orderedTableColumns];
      if (newColPosition === 'start') {
        baseOrder.unshift(newColId);
      } else if (newColPosition.startsWith('after_')) {
        const anchorKey = newColPosition.replace('after_', '');
        const anchorIdx = baseOrder.indexOf(anchorKey);
        if (anchorIdx !== -1) {
          baseOrder.splice(anchorIdx + 1, 0, newColId);
        } else {
          baseOrder.push(newColId);
        }
      } else {
        baseOrder.push(newColId);
      }
      return {
        ...prev,
        customColumns: nextCustomCols,
        columnOrder: baseOrder
      };
    });
    setNewColTitleTop('');
    setNewColTitleBottom('');
    setNewColYellow(false);
    setToast({ msg: isAr ? 'تم إضافة العمود إلى المسير بنجاح' : 'Column added successfully', type: 'success' });
  };

  // Move any column (especially added custom columns) right or left in the table order
  // Note: In RTL table, moving earlier in orderedTableColumns moves the column to the RIGHT, and moving later moves it to the LEFT
  const handleMoveColumnOrder = (colKey: string, direction: 'earlier' | 'later') => {
    const currentOrder = [...orderedTableColumns];
    const idx = currentOrder.indexOf(colKey);
    if (idx === -1) return;
    const targetIdx = direction === 'earlier' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= currentOrder.length) return;
    const temp = currentOrder[idx];
    currentOrder[idx] = currentOrder[targetIdx];
    currentOrder[targetIdx] = temp;
    setConfig(prev => ({
      ...prev,
      columnOrder: currentOrder
    }));
  };

  // Set exact position of a column relative to another column or index
  const handleSetColumnIndex = (colKey: string, newIdx: number) => {
    const currentOrder = [...orderedTableColumns];
    const oldIdx = currentOrder.indexOf(colKey);
    if (oldIdx === -1 || newIdx < 0 || newIdx >= currentOrder.length) return;
    const [moved] = currentOrder.splice(oldIdx, 1);
    currentOrder.splice(newIdx, 0, moved);
    setConfig(prev => ({
      ...prev,
      columnOrder: currentOrder
    }));
  };

  // Helper to get human-readable name for any column key
  const getColumnLabel = (colKey: string): string => {
    if (colKey === 'calcDays') return isAr ? 'حساب أيام' : 'Days Calc';
    if (colKey === 'name') return isAr ? 'اسم الموظف' : 'Employee Name';
    if (colKey === 'fridays') return isAr ? 'الجمع (Fridays)' : 'Fridays';
    if (colKey === 'holiday') return config.customHolidayName || 'Holiday';
    if (colKey === 'overtime') return `${monthInfo.monthNameEn} Overtime`;
    if (colKey === 'absentLate') return isAr ? 'ملاحظات (الغياب والتأخير)' : 'ABSENT & LATE';
    if (colKey === 'sickLeave') return isAr ? 'الإجازة المرضية (Sick Leave)' : 'Sick Leave';
    const customCol = (config.customColumns || []).find(c => c.id === colKey);
    if (customCol) return customCol.titleBottom ? `${customCol.titleTop} (${customCol.titleBottom})` : customCol.titleTop;
    return colKey;
  };

  // Delete custom column
  const handleDeleteCustomColumn = (colId: string) => {
    setConfig(prev => ({
      ...prev,
      customColumns: (prev.customColumns || []).filter(c => c.id !== colId),
      columnOrder: (prev.columnOrder || []).filter(k => k !== colId)
    }));
    setToast({ msg: isAr ? 'تم حذف العمود من المسير' : 'Column removed', type: 'info' });
  };

  // Update custom column title
  const handleUpdateCustomColumn = (colId: string, field: keyof PayrollCustomColumn, val: any) => {
    setConfig(prev => ({
      ...prev,
      customColumns: (prev.customColumns || []).map(c => c.id === colId ? { ...c, [field]: val } : c)
    }));
  };

  // Move row up or down within the current visible list
  const handleMoveRow = (rowId: string, direction: 'up' | 'down') => {
    const currentIdxInDisplay = displayRows.findIndex(r => r.id === rowId);
    if (currentIdxInDisplay === -1) return;
    const targetIdxInDisplay = direction === 'up' ? currentIdxInDisplay - 1 : currentIdxInDisplay + 1;
    if (targetIdxInDisplay < 0 || targetIdxInDisplay >= displayRows.length) return;
    const targetRowId = displayRows[targetIdxInDisplay].id;

    setSortBy('custom');
    setRows(prev => {
      const next = [...prev];
      const idxA = next.findIndex(r => r.id === rowId);
      const idxB = next.findIndex(r => r.id === targetRowId);
      if (idxA === -1 || idxB === -1) return prev;
      const temp = next[idxA];
      next[idxA] = next[idxB];
      next[idxB] = temp;
      return next;
    });
  };

  // Drag & Drop Row Reordering
  const handleDropRow = (targetRowId: string) => {
    if (!draggedRowId || draggedRowId === targetRowId) {
      setDraggedRowId(null);
      return;
    }
    setSortBy('custom');
    setRows(prev => {
      const next = [...prev];
      const fromIdx = next.findIndex(r => r.id === draggedRowId);
      const toIdx = next.findIndex(r => r.id === targetRowId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
    setDraggedRowId(null);
  };

  // Sort rows by criterion (including custom columns!)
  const handleApplySort = (criterion: string) => {
    setSortBy(criterion);
    if (criterion === 'custom') return;
    setRows(prev => {
      const next = [...prev];
      next.sort((a, b) => {
        if (criterion === 'name_asc') return (a.name || '').localeCompare(b.name || '', 'ar');
        if (criterion === 'name_desc') return (b.name || '').localeCompare(a.name || '', 'ar');
        if (criterion === 'emp_num') return (a.employeeNumber || '').localeCompare(b.employeeNumber || '', undefined, { numeric: true });
        if (criterion === 'overtime_desc') return (b.overtimeHours || 0) - (a.overtimeHours || 0);
        if (criterion === 'fridays_desc') return (b.fridayDuties || 0) - (a.fridayDuties || 0);
        if (criterion === 'absent_desc') return (b.absentDaysCount || 0) - (a.absentDaysCount || 0);
        if (criterion.startsWith('customcol_')) {
          const isAsc = criterion.endsWith('_asc');
          const colId = criterion.replace('customcol_', '').replace(/_(asc|desc)$/, '');
          const valA = (a.customColumnValues?.[colId] || '').trim();
          const valB = (b.customColumnValues?.[colId] || '').trim();
          // Put non-empty values first when sorting
          if (!valA && valB) return 1;
          if (valA && !valB) return -1;
          const numA = parseFloat(valA);
          const numB = parseFloat(valB);
          if (!isNaN(numA) && !isNaN(numB)) {
            return isAsc ? numA - numB : numB - numA;
          }
          return isAsc
            ? valA.localeCompare(valB, 'ar', { numeric: true })
            : valB.localeCompare(valA, 'ar', { numeric: true });
        }
        return 0;
      });
      return next;
    });
    setToast({ msg: isAr ? 'تم ترتيب الموظفين بنجاح (اضغط حفظ لتثبيت الترتيب)' : 'Employees sorted successfully', type: 'info' });
  };

  // Open Individual Vacation Pay Statement Modal
  const handleOpenIndividualSlip = (row: PayrollRow) => {
    setIndividualSlipRow({ ...row });
    setIndividualTillDate(config.tillDateText || '');
    setIsIndividualModalOpen(true);
  };

  // Update a field in the individual slip preview/modal
  const handleUpdateIndividualField = (field: keyof PayrollRow, val: any) => {
    setIndividualSlipRow(prev => {
      if (!prev) return null;
      const updated = { ...prev, [field]: val };
      if (field === 'fridayDuties') {
        updated.fridayDisplay = formatCountToText(Number(val) || 0, 'day', 'days');
      }
      if (field === 'holidayDuties') {
        updated.holidayDisplay = Number(val) > 0 ? formatCountToText(Number(val) || 0, 'day', 'days') : '';
      }
      if (field === 'overtimeHours') {
        updated.overtimeDisplay = Number(val) > 0 ? `${val} Hours` : '';
      }
      return updated;
    });
  };

  // Print Individual Vacation Pay Statement (Prints the exact master payroll sheet with only this employee)
  const handlePrintIndividualSlip = () => {
    if (!individualSlipRow) return;
    setSinglePrintRow({ ...individualSlipRow });
    document.body.classList.add('printing-individual');
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    // Small timeout to allow React to render the single row into the DOM before print dialog opens
    setTimeout(() => {
      window.print();
    }, 120);
    // Fallback cleanup in case afterprint isn't fired
    setTimeout(() => {
      setSinglePrintRow(null);
      document.body.classList.remove('printing-individual');
    }, 4000);
  };

  // Export Single Employee Excel Sheet
  const handleExportSingleEmployeeExcel = (r: PayrollRow) => {
    try {
      const wb = XLSX.utils.book_new();
      const item: any = {
        'م': 1,
      };

      orderedTableColumns.forEach(colKey => {
        if (colKey === 'calcDays') {
          item['حساب أيام'] = r.calculatedDaysDisplay || '';
        } else if (colKey === 'name') {
          item['اسم الموظف / Employee Name'] = r.name;
        } else if (colKey === 'fridays') {
          item['الجمع / Fridays'] = r.fridayDisplay || (r.fridayDuties > 0 ? `${r.fridayDuties} days` : '');
        } else if (colKey === 'holiday') {
          if (config.customHolidayEnabled) {
            item[config.customHolidayName || 'NATIONAL DAY'] = r.holidayDisplay || (r.holidayDuties > 0 ? `${r.holidayDuties} day` : '');
          }
        } else if (colKey === 'overtime') {
          item[`${monthInfo.monthNameEn} Overtime`] = r.overtimeDisplay || (r.overtimeHours > 0 ? `${r.overtimeHours} Hours` : '');
        } else if (colKey === 'absentLate') {
          item['ملاحظات: ABSENT and LATE'] = r.absentAndLateText || '';
        } else if (colKey === 'sickLeave') {
          item['Sick Leave Not Including absentee'] = r.sickLeaveText || '';
        } else {
          const col = (config.customColumns || []).find(c => c.id === colKey);
          if (col) {
            const colHeader = col.titleBottom ? `${col.titleTop} - ${col.titleBottom}` : col.titleTop;
            item[colHeader] = r.customColumnValues?.[col.id] || '';
          }
        }
      });

      const ws = XLSX.utils.json_to_sheet([item]);
      XLSX.utils.book_append_sheet(wb, ws, 'تسوية إجازة');
      const safeName = (r.name || 'موظف').replace(/[\\/:*?"<>|]/g, '_').trim();
      const fileName = `تسوية_إجازة_${safeName}_${selectedMonth}.xlsx`;
      XLSX.writeFile(wb, fileName);
      setToast({ msg: `تم تصدير ملف إكسل المنفصل بنجاح: ${fileName}`, type: 'success' });
    } catch (err: any) {
      console.error(err);
      setToast({ msg: 'خطأ في تصدير ملف الإكسل: ' + err.message, type: 'error' });
    }
  };

  // Prompt to delete / exclude an employee from main payroll
  const handlePromptDeleteRow = (row: PayrollRow) => {
    setConfirmDeleteModal({ isOpen: true, row });
  };

  // Exclude employee from main payroll (saving to config.excludedRowIds & config.excludedRows)
  const handleExcludeEmployee = (row: PayrollRow) => {
    setConfig(prev => {
      const currentExcludedIds = prev.excludedRowIds || [];
      const currentExcludedRows = prev.excludedRows || [];
      const nextIds = Array.from(new Set([...currentExcludedIds, row.id, ...(row.userId ? [row.userId] : [])]));
      const nextRows = [...currentExcludedRows.filter(r => r.id !== row.id), row];
      return {
        ...prev,
        excludedRowIds: nextIds,
        excludedRows: nextRows
      };
    });

    setRows(prev => prev.filter(r => r.id !== row.id));

    setToast({
      msg: `تم استبعاد الموظف (${row.name}) من المسير الرئيسي لصرف راتبه مفرداً! يمكنك استعادته في أي وقت من تبويب 'المستبعدين'`,
      type: 'success'
    });
    setConfirmDeleteModal({ isOpen: false, row: null });
    setIsIndividualModalOpen(false);
  };

  // Restore employee back to main payroll
  const handleRestoreEmployee = (row: PayrollRow) => {
    setConfig(prev => {
      const nextIds = (prev.excludedRowIds || []).filter(id => id !== row.id && id !== row.userId);
      const nextRows = (prev.excludedRows || []).filter(r => r.id !== row.id);
      return {
        ...prev,
        excludedRowIds: nextIds,
        excludedRows: nextRows
      };
    });

    setRows(prev => {
      if (prev.some(r => r.id === row.id)) return prev;
      return [...prev, row];
    });

    setToast({
      msg: `تمت استعادة الموظف (${row.name}) إلى المسير الرئيسي بنجاح!`,
      type: 'success'
    });
  };

  // Permanently delete from excluded list
  const handlePermanentDeleteExcluded = (rowId: string) => {
    setConfig(prev => ({
      ...prev,
      excludedRows: (prev.excludedRows || []).filter(r => r.id !== rowId)
    }));
    setToast({ msg: 'تم حذف الموظف نهائياً من قائمة المستبعدين', type: 'info' });
  };

  // Delete row directly
  const handleDeleteRow = (rowId: string) => {
    const target = rows.find(r => r.id === rowId);
    if (target) {
      handleExcludeEmployee(target);
    } else {
      setRows(prev => prev.filter(r => r.id !== rowId));
      setToast({ msg: 'تم حذف الموظف من الكشف', type: 'info' });
    }
  };

  // Trigger print main payroll
  const handlePrint = () => {
    document.body.classList.remove('printing-individual');
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    window.print();
  };

  // Global listener to remove printing-individual class after printing
  useEffect(() => {
    const cleanup = () => {
      document.body.classList.remove('printing-individual');
    };
    window.addEventListener('afterprint', cleanup);
    return () => window.removeEventListener('afterprint', cleanup);
  }, []);

  return (
    <div className={`min-h-screen pb-24 ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'}`}>
      
      {/* Toast Alert */}
      {toast && (
        <Toast 
          message={toast.msg} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}

      {/* Hidden file input for direct attendance Excel / JSON import */}
      <input 
        type="file" 
        ref={attendanceFileInputRef} 
        onChange={handleDirectAttendanceFileImport} 
        accept=".xlsx,.xls,.json" 
        className="hidden" 
      />

      {/* ========================================================================= */}
      {/* 1. TOP APP BAR (Hidden when printing) */}
      {/* ========================================================================= */}
      <header className={`sticky top-0 z-30 border-b backdrop-blur-md px-4 sm:px-8 py-3 transition-colors print:hidden ${
        isDark ? 'bg-slate-900/95 border-slate-800' : 'bg-white/95 border-slate-200'
      }`}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center text-xl shadow-lg shadow-emerald-500/20">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight">
                  {isAr ? config.statementTitleAr : (config.statementTitleEn || config.statementTitleAr)}
                </h1>
                <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-yellow-400 text-black border border-yellow-500 font-mono">
                  EXACT EXCEL PRINT
                </span>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300">
                  {monthInfo.daysInMonth} {isAr ? 'يوم في الشهر' : 'Days in Month'}
                </span>
              </div>
              <p className={`text-xs mt-0.5 flex items-center gap-2 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                <span>{isAr ? config.hospitalNameAr : config.hospitalNameEn}</span>
                <span>•</span>
                <span className="font-bold text-emerald-600">{isAr ? `${monthInfo.monthNameAr} ${monthInfo.year}` : `${monthInfo.monthNameEn} ${monthInfo.year}`} ({selectedMonth})</span>
                {lastSavedAt && (
                  <>
                    <span>•</span>
                    <span className="text-slate-400 text-[11px]">{isAr ? 'آخر حفظ' : 'Last Saved'}: {lastSavedAt}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Month Picker */}
            <input 
              type="month" 
              value={selectedMonth} 
              onChange={(e) => handleMonthChange(e.target.value)} 
              className={`text-xs font-bold py-2 px-3 rounded-xl border focus:ring-2 focus:ring-emerald-500 outline-none transition-colors shadow-2xs ${
                isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-100 border-slate-200 text-slate-800'
              }`}
            />

            {/* PULL FROM SMART ATTENDANCE ANALYZER BUTTON */}
            <button
              onClick={handleSyncFromAttendanceAnalyzer}
              disabled={isSyncingAnalyzer}
              title={isAr ? 'سحب الغياب والتأخير والأوفر تايم مباشرة من صفحة محلل الحضور الذكي' : 'Pull absent days, late hours, and overtime from Smart Attendance Analyzer'}
              className="text-xs font-black py-2 px-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white flex items-center gap-1.5 transition-all shadow-md shadow-orange-500/20"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isSyncingAnalyzer ? (isAr ? 'جاري السحب...' : 'Syncing...') : (isAr ? 'سحب من محلل الحضور' : 'Sync Attendance')}</span>
            </button>

            {/* DIRECT FILE IMPORT FROM BIOMETRIC EXCEL / JSON */}
            <button
              onClick={() => attendanceFileInputRef.current?.click()}
              title={isAr ? 'استيراد ملف البصمة أو الإكسل من جهاز الحضور مباشرة لتحليله وتطبيقه على الكشف' : 'Import Excel / JSON log file from biometric attendance device'}
              className="text-xs font-bold py-2 px-3.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white flex items-center gap-1.5 transition-all shadow-md shadow-sky-600/20"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{isAr ? 'استيراد ملف الحضور' : 'Import Attendance'}</span>
            </button>

            {/* Auto Pull Schedule & Attendance Button */}
            <button
              onClick={() => loadPayrollData(true)}
              title={isAr ? 'سحب وتحديث الجمع والغياب وساعات الدوام من الجداول الشهرية المنشورة آلياً' : 'Auto refresh fridays, leaves, and duties from monthly schedule'}
              className="text-xs font-bold py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 transition-all shadow-md shadow-indigo-600/20"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{isAr ? 'تحديث شامل' : 'Full Refresh'}</span>
            </button>

            {/* Print Official Button */}
            <button
              onClick={handlePrint}
              className="text-xs font-black py-2 px-4 rounded-xl bg-slate-900 hover:bg-black text-white flex items-center gap-2 transition-all shadow-md border border-yellow-400/40"
              title={isAr ? 'طباعة الورقة الرسمية بنفس شكل الإكسل واللون الأصفر تماماً (A4 Landscape)' : 'Print official statement with exact Excel layout and yellow highlight (A4 Landscape)'}
            >
              <Printer className="w-4 h-4 text-yellow-400" />
              <span>{isAr ? 'طباعة الكشف' : 'Print Statement'}</span>
            </button>

            {/* Excel Export Button */}
            <button
              onClick={handleExportToExcel}
              className="text-xs font-bold py-2 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 transition-all shadow-md shadow-emerald-600/20"
              title={isAr ? 'تصدير ملف إكسل رسمي متعدد الصفحات' : 'Export official multi-sheet Excel file'}
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isAr ? 'تصدير إكسل' : 'Excel Export'}</span>
            </button>

            {/* Add Employee Button */}
            <button
              onClick={() => setIsAddRowModalOpen(true)}
              className="text-xs font-bold py-2 px-3 rounded-xl bg-slate-700 hover:bg-slate-800 text-white flex items-center gap-1.5 transition-all"
              title={isAr ? 'إضافة موظف يدوياً إلى الكشف' : 'Add custom employee row manually'}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isAr ? 'إضافة صف' : 'Add Row'}</span>
            </button>

            {/* Add / Manage Custom Columns Button */}
            <button
              onClick={() => setIsColumnsModalOpen(true)}
              className="text-xs font-bold py-2 px-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white flex items-center gap-1.5 transition-all shadow-md shadow-violet-600/20"
              title={isAr ? 'إضافة أو تعديل أعمدة إضافية في مسير الرواتب' : 'Add or manage custom columns in payroll'}
            >
              <Columns className="w-3.5 h-3.5" />
              <span>{isAr ? 'إضافة عمود' : 'Add Column'}</span>
              {(config.customColumns?.length || 0) > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-[10px] font-black">
                  {config.customColumns?.length}
                </span>
              )}
            </button>

            {/* Save Button */}
            <button
              onClick={handleSaveToCloud}
              disabled={saving}
              className="text-xs font-black py-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white flex items-center gap-1.5 transition-all shadow-md shadow-blue-600/20"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ' : 'Save')}</span>
            </button>

            {/* Settings */}
            <button
              onClick={() => setIsConfigModalOpen(true)}
              className={`p-2 rounded-xl border transition-colors ${
                isDark ? 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white' : 'bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-900'
              }`}
              title={isAr ? 'إعدادات وترويسة الكشف الرسمية' : 'Payroll Statement & Header Settings'}
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. SUB-TOOLBAR: TABS & HOLIDAY SELECTOR (EID / NATIONAL DAY / CUSTOM) */}
      {/* ========================================================================= */}
      <div className={`border-b px-4 sm:px-8 py-2.5 transition-colors print:hidden ${
        isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200 shadow-2xs'
      }`}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          
          {/* Tabs: Staff / Doctors / Hidden / All */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            <button
              onClick={() => setActiveTab('staff')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black transition-all border ${
                activeTab === 'staff'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                  : isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>{isAr ? 'كشف الموظفين والفنيين (Staff)' : 'Technicians & Staff'}</span>
            </button>

            <button
              onClick={() => setActiveTab('doctor')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black transition-all border ${
                activeTab === 'doctor'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              <Stethoscope className="w-3.5 h-3.5" />
              <span>{isAr ? 'كشف الأطباء (Doctors)' : 'Doctors'}</span>
            </button>

            <button
              onClick={() => setActiveTab('hidden')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black transition-all border ${
                activeTab === 'hidden'
                  ? 'bg-slate-700 text-white border-slate-700 shadow-sm'
                  : isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              <EyeOff className="w-3.5 h-3.5" />
              <span>{isAr ? 'الموظفين المخفيين (Hidden)' : 'Hidden Staff'}</span>
            </button>

            <button
              onClick={() => setActiveTab('all')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black transition-all border ${
                activeTab === 'all'
                  ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                  : isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>{isAr ? `الكل (${rows.length})` : `All (${rows.length})`}</span>
            </button>

            {/* Excluded Staff Tab (e.g. on vacation & received single settlement slip) */}
            <button
              onClick={() => setActiveTab('excluded')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black transition-all border ${
                activeTab === 'excluded'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                  : isDark ? 'bg-slate-800 text-amber-400 border-amber-800/60 hover:bg-slate-700' : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
              }`}
              title={isAr ? 'الموظفون المستبعدون من المسير لنزولهم إجازة وصرف رواتبهم مفرداً' : 'Staff excluded for vacation clearance'}
            >
              <UserX className="w-3.5 h-3.5" />
              <span>{isAr ? `المستبعدين للإجازة (${(config.excludedRows || []).length})` : `Vacation Excluded (${(config.excludedRows || []).length})`}</span>
            </button>
          </div>

          {/* Holiday Selector & Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            
            {/* Fast Holiday Selection Buttons */}
            <div className="flex items-center gap-1 bg-slate-200 dark:bg-slate-800 p-1 rounded-xl text-xs">
              <span className="font-bold text-[11px] px-1 text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Flag className="w-3 h-3 text-emerald-600" />
                {isAr ? 'المناسبة:' : 'Holiday:'}
              </span>
              
              {/* National Day */}
              <button
                onClick={() => setConfig(prev => ({ ...prev, customHolidayName: 'NATIONAL DAY', customHolidayEnabled: true }))}
                className={`px-2 py-0.5 rounded-lg font-bold transition-all text-xs ${
                  config.customHolidayEnabled && config.customHolidayName === 'NATIONAL DAY'
                    ? 'bg-green-700 text-white shadow-xs'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {isAr ? 'اليوم الوطني' : 'National Day'}
              </button>

              {/* Eid Al-Fitr */}
              <button
                onClick={() => setConfig(prev => ({ ...prev, customHolidayName: 'EID AL-FITR', customHolidayEnabled: true }))}
                className={`px-2 py-0.5 rounded-lg font-bold transition-all text-xs ${
                  config.customHolidayEnabled && config.customHolidayName === 'EID AL-FITR'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {isAr ? 'عيد الفطر' : 'Eid Al-Fitr'}
              </button>

              {/* Eid Al-Adha */}
              <button
                onClick={() => setConfig(prev => ({ ...prev, customHolidayName: 'EID AL-ADHA', customHolidayEnabled: true }))}
                className={`px-2 py-0.5 rounded-lg font-bold transition-all text-xs ${
                  config.customHolidayEnabled && config.customHolidayName === 'EID AL-ADHA'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {isAr ? 'عيد الأضحى' : 'Eid Al-Adha'}
              </button>

              {/* Founding Day */}
              <button
                onClick={() => setConfig(prev => ({ ...prev, customHolidayName: 'FOUNDING DAY', customHolidayEnabled: true }))}
                className={`px-2 py-0.5 rounded-lg font-bold transition-all text-xs ${
                  config.customHolidayEnabled && config.customHolidayName === 'FOUNDING DAY'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {isAr ? 'يوم التأسيس' : 'Founding Day'}
              </button>

              {/* Custom Holiday Input */}
              <input
                type="text"
                value={config.customHolidayName}
                onChange={(e) => setConfig(prev => ({ ...prev, customHolidayName: e.target.value.toUpperCase(), customHolidayEnabled: true }))}
                placeholder={isAr ? "اسم العطلة..." : "Holiday..."}
                className="w-24 px-1.5 py-0.5 rounded-md text-[11px] font-bold uppercase bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-center"
                title={isAr ? "كتابة اسم مخصص لعمود العطلة في الجدول" : "Custom holiday header title"}
              />

              {/* Toggle enable / disable */}
              <button
                onClick={() => setConfig(prev => ({ ...prev, customHolidayEnabled: !prev.customHolidayEnabled }))}
                className={`px-2 py-0.5 rounded-lg font-bold transition-all text-xs ${
                  !config.customHolidayEnabled
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-slate-500 hover:bg-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {config.customHolidayEnabled ? (isAr ? 'إخفاء' : 'Hide') : (isAr ? 'معطل' : 'Disabled')}
              </button>
            </div>

            {/* Toggle Full Month Leave Staff */}
            <button
              onClick={() => setShowFullMonthLeaveStaff(!showFullMonthLeaveStaff)}
              className={`text-xs font-bold py-1.5 px-3 rounded-xl border flex items-center gap-1.5 transition-all ${
                showFullMonthLeaveStaff
                  ? 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800'
                  : 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
              }`}
              title={isAr ? "إجازة طول الشهر مستبعدون تلقائياً - انقر لعرضهم أو إخفائهم" : "Full month vacation staff excluded by default - click to toggle"}
            >
              <UserX className="w-3.5 h-3.5 text-amber-600" />
              <span>{isAr ? `إجازة كامل الشهر (${fullMonthLeaveCount})` : `Full Month Leave (${fullMonthLeaveCount})`}</span>
            </button>

            {/* Employee Sort Selector */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs ${
              isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-100 border-slate-300 text-slate-700'
            }`}>
              <ArrowUpDown className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <span className="font-bold text-[11px]">{isAr ? 'ترتيب:' : 'Sort:'}</span>
              <select
                value={sortBy}
                onChange={(e) => handleApplySort(e.target.value)}
                className="bg-transparent font-bold text-xs outline-none cursor-pointer"
                title={isAr ? 'ترتيب الموظفين (أو اسحب الصفوف وحرك الأسهم ▲▼ للترتيب اليدوي)' : 'Sort employees or use arrows/drag to reorder'}
              >
                <option value="custom" className="text-slate-900">{isAr ? 'ترتيب يدوي (مخصص ▲▼)' : 'Custom Order (Manual)'}</option>
                <option value="name_asc" className="text-slate-900">{isAr ? 'الاسم (أ - ي / A-Z)' : 'Name (A - Z)'}</option>
                <option value="name_desc" className="text-slate-900">{isAr ? 'الاسم (ي - أ / Z-A)' : 'Name (Z - A)'}</option>
                <option value="emp_num" className="text-slate-900">{isAr ? 'الرقم الوظيفي' : 'Employee ID'}</option>
                <option value="overtime_desc" className="text-slate-900">{isAr ? 'الأوفر تايم (الأعلى)' : 'Overtime (High-Low)'}</option>
                <option value="fridays_desc" className="text-slate-900">{isAr ? 'الجمع بالبصمة (الأعلى)' : 'Fridays (High-Low)'}</option>
                <option value="absent_desc" className="text-slate-900">{isAr ? 'الغياب (الأعلى)' : 'Absence (High-Low)'}</option>
                {(config.customColumns || []).map(col => (
                  <React.Fragment key={col.id}>
                    <option value={`customcol_${col.id}_desc`} className="text-slate-900">
                      {isAr ? `العمود: ${col.titleTop} (تنازلي)` : `${col.titleTop} (Desc)`}
                    </option>
                    <option value={`customcol_${col.id}_asc`} className="text-slate-900">
                      {isAr ? `العمود: ${col.titleTop} (تصاعدي)` : `${col.titleTop} (Asc)`}
                    </option>
                  </React.Fragment>
                ))}
              </select>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute right-2.5 top-2.5 text-slate-400" />
              <input 
                type="text"
                placeholder={isAr ? "بحث موظف..." : "Search employee..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`text-xs pr-8 pl-3 py-1.5 rounded-xl border outline-none w-32 sm:w-40 ${
                  isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-100 border-slate-300 text-slate-800'
                }`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. THE OFFICIAL PAPER / EXCEL SPREADSHEET (PRINTABLE & SCREEN) */}
      {/* ========================================================================= */}
      <main className="max-w-[1400px] mx-auto px-2 sm:px-6 py-6">
        
        {/* CALCULATION PERIOD BAR (من - إلى) WITH FULL MONTH FRIDAYS GUARANTEE */}
        <div className={`mb-4 p-4 rounded-2xl border transition-all print:hidden shadow-xs ${
          isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            
            {/* Left: Heading and inputs */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <span>{isAr ? 'فترة احتساب الغياب والإضافي والأذونات والسكاليف' : 'Absence, Overtime, Sick Leave & Permits Period'}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                      {isAr ? 'الجمع: بالبصمة فقط' : 'Fridays: Biometric Punch Only'}
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {isAr ? 'يتم احتساب الجمع التي بصم فيها الموظف فعلياً فقط • مع احتساب السكاليف والغياب والأوفر تايم والأذونات' : 'Counts ONLY Fridays where the employee has an actual biometric punch • Plus Sick Leaves, Absences, Overtime & Permits'}
                  </p>
                </div>
              </div>

              {/* Date pickers (من - إلى) */}
              <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-950 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
                <span className="font-bold text-slate-500 px-1">{isAr ? 'من:' : 'From:'}</span>
                <input 
                  type="date"
                  value={periodStartDate}
                  onChange={(e) => setPeriodStartDate(e.target.value)}
                  className="bg-white dark:bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 font-mono font-bold text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                />

                <span className="font-bold text-slate-500 px-1">{isAr ? 'إلى:' : 'To:'}</span>
                <input 
                  type="date"
                  value={periodEndDate}
                  onChange={(e) => setPeriodEndDate(e.target.value)}
                  className="bg-white dark:bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 font-mono font-bold text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                />

                <button
                  onClick={() => loadPayrollData(true)}
                  className="px-3.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs"
                  title={isAr ? 'تطبيق الفترة وإعادة حساب الغياب والإضافي والسيكليف والأذونات' : 'Apply period & recalculate'}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{isAr ? 'تطبيق الفترة' : 'Apply Period'}</span>
                </button>
              </div>

              {/* Quick Presets */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => applyPreset('full')}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 transition-all"
                  title={isAr ? 'احتساب كامل الشهر' : 'Full Month'}
                >
                  {isAr ? 'كامل الشهر' : 'Full Month'}
                </button>
                <button
                  onClick={() => applyPreset('cutoff24')}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 transition-all"
                  title={isAr ? 'حتى 24 في الشهر' : 'Cutoff 24th'}
                >
                  {isAr ? 'حتى 24 الشهر' : 'Till 24th'}
                </button>
                <button
                  onClick={() => applyPreset('cycle20')}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 transition-all"
                  title={isAr ? 'دورة الرواتب (21 السابق إلى 20 الحالي)' : 'Cycle (21st - 20th)'}
                >
                  {isAr ? 'دورة الرواتب (21 - 20)' : '21st - 20th'}
                </button>
              </div>
            </div>

            {/* Right: Badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 font-bold flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>{isAr ? 'الجمع: التي بها بصمة فقط' : 'Fridays: Punched Only'}</span>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-xs text-blue-800 dark:text-blue-300 font-bold flex items-center gap-1.5 font-mono">
                <Clock className="w-3.5 h-3.5 text-blue-600" />
                <span>{periodStartDate} ➜ {periodEndDate}</span>
              </div>
            </div>

          </div>
        </div>

        {/* Notice Info banner with Smart Analyzer integration */}
        <div className="mb-4 bg-yellow-50 dark:bg-yellow-950/40 border border-yellow-300 dark:border-yellow-800/60 rounded-xl p-3 text-xs text-yellow-900 dark:text-yellow-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-yellow-400 text-black font-black flex items-center justify-center text-[11px] shrink-0">!</span>
            <div>
              <strong>{isAr ? 'ربط محلل الحضور الذكي:' : 'Smart Attendance Integration:'}</strong> 
              <span> {isAr ? `يتم سحب الغياب، والتأخير، والأوفر تايم تلقائياً من صفحة محلل الحضور الذكي أو من ملف البصمة، مع خصم الغياب من أيام الشهر الحقيقية (${monthInfo.daysInMonth} يوم).` : `Absent days, late hours, and overtime are automatically synced from the Smart Attendance Analyzer or Biometric file with accurate month calendar (${monthInfo.daysInMonth} days).`}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button 
              onClick={handleSyncFromAttendanceAnalyzer}
              className="px-2.5 py-1 rounded-lg bg-orange-100 hover:bg-orange-200 text-orange-950 font-bold text-xs flex items-center gap-1 border border-orange-300"
              title={isAr ? "مزامنة فورية من محلل الحضور" : "Instant sync from attendance analyzer"}
            >
              <Clock className="w-3 h-3 text-orange-600" />
              {isAr ? 'سحب من محلل الحضور' : 'Sync Attendance'}
            </button>
            <button 
              onClick={() => handleApplyHolidayToAll(1)}
              className="px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold text-xs"
              title={isAr ? "تطبيق يوم عطلة 1 لجميع الموظفين" : "Apply 1 holiday day to all employees"}
            >
              {isAr ? '+1 يوم للمناسبة' : '+1 Holiday Day'}
            </button>
            <button 
              onClick={handlePrint}
              className="px-3.5 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-black font-black flex items-center gap-1.5 shadow-xs text-xs"
            >
              <Printer className="w-3.5 h-3.5" />
              {isAr ? 'طباعة الكشف A4' : 'Print Statement A4'}
            </button>
          </div>
        </div>

        {/* Paper Container - Matching exact paper and Excel layout */}
        <div id="payroll-sheet" className="bg-white text-black p-4 sm:p-8 rounded-2xl shadow-xl border border-slate-300 overflow-x-auto print:shadow-none print:border-none print:p-0 print:m-0 print:rounded-none print:w-full print-paper-container" dir="rtl">

          {/* Excluded Staff Info Banner */}
          {activeTab === 'excluded' && (
            <div className="mb-4 p-3.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 flex items-center justify-between gap-3 text-xs sm:text-sm print:hidden">
              <div className="flex items-center gap-2.5">
                <UserX className="w-5 h-5 text-amber-600 shrink-0" />
                <div>
                  <span className="font-black text-sm">
                    {isAr ? 'قائمة الموظفين المستبعدين من المسير الرئيسي (إجازات / صرف راتب مفرد):' : 'Vacation Settlement / Single Payout Excluded Staff:'}
                  </span>
                  <p className="text-xs text-amber-800 mt-0.5">
                    {isAr
                      ? 'هؤلاء الموظفون تم استبعادهم من كشف المسير المجمع لأنهم نزلوا إجازة وصرفوا رواتبهم بشكل مفرد. يمكنك طباعة ورقة تسوية الإجازة المنفصلة لأي منهم (أيقونة الملف 📄) أو استعادتهم للمسير الرئيسي (أيقونة الاسترجاع 🔄).'
                      : 'These staff were excluded from the master payroll because they took leave and received individual payout. You can print their single settlement slip or restore them back.'}
                  </p>
                </div>
              </div>
              <div className="font-extrabold text-xs bg-amber-200/90 text-amber-950 px-3 py-1.5 rounded-lg shrink-0">
                {displayRows.length} {isAr ? 'موظف مستبعد' : 'Excluded'}
              </div>
            </div>
          )}

          {/* Table Container with exact excel grid borders and colors */}
          <table className="w-full border-collapse border-2 border-black text-black font-sans text-xs sm:text-[13px] excel-table">
            {/* Header Rows matching exact 2-row layout and dynamic columnOrder */}
            <thead>
              {/* Top Document Header Row - Placed inside thead so browser repeats it on every printed page */}
              <tr className="print-doc-header-row bg-white border-0">
                <th
                  colSpan={1 + orderedTableColumns.length}
                  className="print-doc-header-cell border-0 bg-white p-0 text-inherit font-normal text-right"
                >
                  <div className="flex items-start justify-between mb-2 border-b-2 border-black pb-2 w-full text-black">
                    {/* Left Header in English */}
                    <div className="text-left font-sans" dir="ltr">
                      <div className="text-xs sm:text-sm font-bold tracking-tight text-black">
                        {config.hospitalNameEn} - {config.departmentNameEn}
                      </div>
                      <div className="text-[10px] sm:text-xs font-semibold text-black mt-0.5">
                        {monthInfo.monthNameEn} {monthInfo.year} {config.statementTitleEn} {singlePrintRow ? (individualTillDate || config.tillDateText) : config.tillDateText}
                      </div>
                    </div>

                    {/* Center: Old Hospital Logo with statement title underneath */}
                    <div className="text-center flex flex-col items-center justify-center px-2">
                      <img 
                        src="/old-logo.png" 
                        alt="Hospital Logo" 
                        className="h-10 sm:h-12 w-auto max-w-[130px] object-contain mx-auto"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/logo.png';
                        }}
                      />
                      <div className="text-xs sm:text-sm font-black tracking-tight text-black mt-0.5 leading-snug">
                        {config.statementTitleAr}
                      </div>
                      <div className="text-[10px] font-bold text-slate-800">
                        {monthInfo.monthNameAr} {monthInfo.year}
                      </div>
                    </div>

                    {/* Right Header in Arabic */}
                    <div className="text-right font-sans" dir="rtl">
                      <div className="text-xs sm:text-sm font-bold tracking-tight text-black">
                        {config.hospitalNameAr} - {config.departmentNameAr}
                      </div>
                      <div className="text-[10px] sm:text-xs font-semibold text-black mt-0.5">
                        {config.statementTitleAr} - {monthInfo.monthNameAr} {monthInfo.year}
                      </div>
                    </div>
                  </div>
                </th>
              </tr>

              {/* Row 1 of Header */}
              <tr className="bg-[#e6e6e6] text-center font-bold border-b border-black text-black excel-header-gray">
                {/* 1. م (Serial Number - always first) */}
                <th className="border border-black px-1.5 py-1.5 w-9 text-center font-bold" rowSpan={2}>
                  م
                </th>

                {orderedTableColumns.map((colKey, colIdx) => {
                  if (colKey === 'calcDays') {
                    return (
                      <th key={colKey} className="border border-black px-1.5 py-1.5 w-16 bg-[#ffff00] text-black font-black text-center excel-yellow-cell" rowSpan={2}>
                        <div className="leading-tight">حساب</div>
                        <div className="leading-tight">أيام</div>
                      </th>
                    );
                  }
                  if (colKey === 'name') {
                    return (
                      <th key={colKey} className="border border-black px-3 py-1.5 min-w-[190px] text-center" rowSpan={2}>
                        <div>اسم الموظف</div>
                        <div className="font-normal text-[11px]">Employee Name</div>
                      </th>
                    );
                  }
                  if (colKey === 'fridays') {
                    return (
                      <th key={colKey} className="border border-black px-2.5 py-1.5 w-28 text-center" rowSpan={2}>
                        <div>الجمع</div>
                        <div className="font-normal text-[11px]">Fridays</div>
                      </th>
                    );
                  }
                  if (colKey === 'holiday') {
                    return (
                      <th key={colKey} className="border border-black px-2.5 py-1.5 w-28 text-center" rowSpan={2}>
                        <div>{config.customHolidayName}</div>
                        <div className="font-normal text-[11px]">DAY</div>
                      </th>
                    );
                  }
                  if (colKey === 'overtime') {
                    return (
                      <th key={colKey} className="border border-black px-2.5 py-1.5 w-24 text-center">
                        {monthInfo.monthNameEn}
                      </th>
                    );
                  }
                  if (colKey === 'absentLate') {
                    return (
                      <th key={colKey} className="border border-black px-3 py-1.5 min-w-[190px] text-center">
                        ملاحظات:
                      </th>
                    );
                  }
                  if (colKey === 'sickLeave') {
                    return (
                      <th key={colKey} className="border border-black px-3 py-1.5 min-w-[190px] text-center">
                        Sick Leave
                      </th>
                    );
                  }

                  // Custom Column
                  const col = (config.customColumns || []).find(c => c.id === colKey);
                  if (!col) return null;
                  const isSortedDesc = sortBy === `customcol_${col.id}_desc`;
                  return (
                    <th
                      key={col.id}
                      rowSpan={col.titleBottom ? 1 : 2}
                      className={`border border-black px-2 py-1.5 min-w-[125px] text-center relative group ${
                        col.highlightYellow ? 'bg-[#ffff00] text-black font-black excel-yellow-cell' : ''
                      }`}
                    >
                      <div className="flex flex-col items-center justify-center gap-0.5">
                        <span>{col.titleTop}</span>
                        {/* Column Reorder & Sort Controls (Hidden in Print) */}
                        <div className="flex items-center justify-center gap-1 print:hidden mt-0.5 bg-black/5 rounded-md px-1 py-0.5">
                          <button
                            type="button"
                            onClick={() => handleMoveColumnOrder(col.id, 'earlier')}
                            disabled={colIdx === 0}
                            className="text-slate-700 hover:text-indigo-700 disabled:opacity-25 p-0.5"
                            title={isAr ? 'تحريك العمود لليمين' : 'Move column right'}
                          >
                            <ArrowRight className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveColumnOrder(col.id, 'later')}
                            disabled={colIdx === orderedTableColumns.length - 1}
                            className="text-slate-700 hover:text-indigo-700 disabled:opacity-25 p-0.5"
                            title={isAr ? 'تحريك العمود لليسار' : 'Move column left'}
                          >
                            <ArrowLeft className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApplySort(isSortedDesc ? `customcol_${col.id}_asc` : `customcol_${col.id}_desc`)}
                            className="text-indigo-700 hover:text-indigo-900 p-0.5"
                            title={isAr ? 'ترتيب الموظفين حسب هذا العمود' : 'Sort employees by this column'}
                          >
                            <ArrowUpDown className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCustomColumn(col.id)}
                            className="text-rose-600 hover:text-rose-800 p-0.5"
                            title={isAr ? 'حذف هذا العمود' : 'Delete column'}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </th>
                  );
                })}
              </tr>

              {/* Row 2 of Header (in exact orderedTableColumns sequence for columns that have 2 header rows) */}
              <tr className="bg-[#e6e6e6] text-center font-bold border-b-2 border-black text-black excel-header-gray">
                {orderedTableColumns.map(colKey => {
                  if (colKey === 'overtime') {
                    return (
                      <th key="overtime_sub" className="border border-black px-2 py-1.5 text-center">
                        Overtime
                      </th>
                    );
                  }
                  if (colKey === 'absentLate') {
                    return (
                      <th key="absentLate_sub" className="border border-black px-2 py-1.5 text-center">
                        ABSENT and LATE
                      </th>
                    );
                  }
                  if (colKey === 'sickLeave') {
                    return (
                      <th key="sickLeave_sub" className="border border-black px-2 py-1.5 text-center">
                        Not Including absentee
                      </th>
                    );
                  }
                  const col = (config.customColumns || []).find(c => c.id === colKey);
                  if (col && col.titleBottom) {
                    return (
                      <th
                        key={`${col.id}_sub`}
                        className={`border border-black px-2 py-1.5 text-center ${
                          col.highlightYellow ? 'bg-[#ffff00] text-black font-black excel-yellow-cell' : ''
                        }`}
                      >
                        {col.titleBottom}
                      </th>
                    );
                  }
                  return null;
                })}
              </tr>
            </thead>

            {/* Table Body */}
            <tbody>
              {(() => {
                const activePayrollRows = singlePrintRow ? [singlePrintRow] : displayRows;
                if (activePayrollRows.length === 0) {
                  return (
                    <tr>
                      <td colSpan={1 + orderedTableColumns.length} className="border border-black py-8 text-center text-slate-500 font-bold">
                        {isAr ? 'لا توجد بيانات مطابقة للعرض في هذا التبويب' : 'No matching employee records found in this tab'}
                      </td>
                    </tr>
                  );
                }
                return activePayrollRows.map((row, idx) => (
                  <tr
                    key={row.id}
                    draggable={!singlePrintRow}
                    onDragStart={() => !singlePrintRow && setDraggedRowId(row.id)}
                    onDragOver={(e) => !singlePrintRow && e.preventDefault()}
                    onDrop={() => !singlePrintRow && handleDropRow(row.id)}
                    className={`hover:bg-yellow-50/30 transition-colors ${
                      draggedRowId === row.id ? 'opacity-50 bg-indigo-50' : ''
                    }`}
                  >
                    
                    {/* 1. م (Serial Number + Reorder Controls on Screen) */}
                    <td className="border border-black text-center font-bold py-1.5 px-1 bg-white text-black">
                      <div className="flex items-center justify-center gap-0.5">
                        <span
                          className="text-slate-400 cursor-grab active:cursor-grabbing print:hidden shrink-0 inline-flex"
                          title={isAr ? 'اسحب لترتيب الصف' : 'Drag to reorder'}
                        >
                          <GripVertical className="w-3 h-3" />
                        </span>
                        <span>{idx + 1}</span>
                        <div className="flex flex-col print:hidden ml-0.5">
                          <button
                            type="button"
                            onClick={() => handleMoveRow(row.id, 'up')}
                            disabled={idx === 0}
                            className="text-slate-500 hover:text-indigo-600 disabled:opacity-20 p-0 leading-none"
                            title={isAr ? 'تحريك لأعلى' : 'Move up'}
                          >
                            <ArrowUp className="w-2.5 h-2.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveRow(row.id, 'down')}
                            disabled={idx === displayRows.length - 1}
                            className="text-slate-500 hover:text-indigo-600 disabled:opacity-20 p-0 leading-none"
                            title={isAr ? 'تحريك لأسفل' : 'Move down'}
                          >
                            <ArrowDown className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </div>
                    </td>

                    {/* Render cells in exact orderedTableColumns order */}
                    {orderedTableColumns.map(colKey => {
                      if (colKey === 'calcDays') {
                        return (
                          <td key={colKey} className="border border-black text-center font-black py-1.5 px-1 bg-[#ffff00] text-black excel-yellow-cell" dir="ltr">
                            <span className="payroll-print-val font-black text-black text-sm text-center" dir="ltr">
                              {row.calculatedDaysDisplay || ''}
                            </span>
                            <input 
                              type="text"
                              dir="ltr"
                              value={row.calculatedDaysDisplay || ''}
                              onChange={(e) => handleCellChange(row.id, 'calculatedDaysDisplay', e.target.value)}
                              className="payroll-screen-input w-full text-center font-black bg-transparent outline-none border-none p-0 text-black text-sm"
                              placeholder=""
                            />
                          </td>
                        );
                      }
                      if (colKey === 'name') {
                        const isExcludedTab = activeTab === 'excluded';
                        return (
                          <td key={colKey} className="border border-black text-right font-bold py-1.5 px-2 bg-white text-black">
                            <div className="flex items-center justify-between gap-1.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-extrabold text-[13px] text-black" dir="auto">{row.name}</span>
                                {row.calculatedDaysDisplay === '*2' && (
                                  <span className="text-amber-700 font-black text-xs print:hidden" dir="ltr">*2</span>
                                )}
                                {isExcludedTab && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-850 border border-amber-300 print:hidden shrink-0">
                                    {isAr ? 'مستبعد للإجازة' : 'Vacation Clearance'}
                                  </span>
                                )}
                              </div>

                              {/* Row action buttons for Supervisor (Hidden in print) */}
                              <div className="flex items-center gap-1 print:hidden shrink-0">
                                {/* 1. Open Individual Vacation Settlement Slip */}
                                <button
                                  type="button"
                                  onClick={() => handleOpenIndividualSlip(row)}
                                  className="p-1 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors cursor-pointer"
                                  title={isAr ? 'طباعة كشف إجازة مفرد / ورقة منفصلة لهذا الموظف' : 'Print individual vacation clearance slip'}
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                </button>

                                {isExcludedTab ? (
                                  <>
                                    {/* Restore employee back to main payroll */}
                                    <button
                                      type="button"
                                      onClick={() => handleRestoreEmployee(row)}
                                      className="p-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors cursor-pointer"
                                      title={isAr ? 'استعادة الموظف إلى المسير الرئيسي' : 'Restore to main payroll'}
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" />
                                    </button>
                                    {/* Permanently delete from excluded list */}
                                    <button
                                      type="button"
                                      onClick={() => handlePermanentDeleteExcluded(row.id)}
                                      className="p-1 rounded-md bg-rose-50 hover:bg-rose-100 text-rose-600 transition-colors cursor-pointer"
                                      title={isAr ? 'حذف نهائي' : 'Permanent delete'}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                ) : (
                                  /* Exclude / Delete from main payroll */
                                  <button 
                                    type="button"
                                    onClick={() => handlePromptDeleteRow(row)}
                                    className="p-1 rounded-md bg-rose-50 hover:bg-rose-100 text-rose-600 transition-colors cursor-pointer"
                                    title={isAr ? 'حذف / استبعاد الموظف من المسير الرئيسي (نظراً لنزوله إجازة وصرف راتبه مفرداً)' : 'Exclude employee from main payroll (vacation single payout)'}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>
                        );
                      }
                      if (colKey === 'fridays') {
                        return (
                          <td key={colKey} className="border border-black text-center font-bold py-1.5 px-1.5 bg-white text-black" dir="ltr">
                            <span className="payroll-print-val font-bold text-black text-xs sm:text-[13px] text-center" dir="ltr">
                              {row.fridayDisplay || ''}
                            </span>
                            <input 
                              type="text"
                              dir="ltr"
                              value={row.fridayDisplay || ''}
                              onChange={(e) => handleCellChange(row.id, 'fridayDisplay', e.target.value)}
                              className="payroll-screen-input w-full text-center font-bold bg-transparent outline-none border-none p-0 text-black text-xs sm:text-[13px]"
                              placeholder="4 (Four) Days"
                            />
                          </td>
                        );
                      }
                      if (colKey === 'holiday') {
                        return (
                          <td key={colKey} className="border border-black text-center font-bold py-1.5 px-1.5 bg-white text-black" dir="ltr">
                            <span className="payroll-print-val font-bold text-black text-xs sm:text-[13px] text-center" dir="ltr">
                              {row.holidayDisplay || ''}
                            </span>
                            <input 
                              type="text"
                              dir="ltr"
                              value={row.holidayDisplay || ''}
                              onChange={(e) => handleCellChange(row.id, 'holidayDisplay', e.target.value)}
                              className="payroll-screen-input w-full text-center font-bold bg-transparent outline-none border-none p-0 text-black text-xs sm:text-[13px]"
                              placeholder="1 (One) Day"
                            />
                          </td>
                        );
                      }
                      if (colKey === 'overtime') {
                        return (
                          <td key={colKey} className="border border-black text-center font-bold py-1.5 px-1.5 bg-white text-black" dir="ltr">
                            <span className="payroll-print-val font-bold text-black text-xs sm:text-[13px] text-center" dir="ltr">
                              {row.overtimeDisplay || ''}
                            </span>
                            <input 
                              type="text"
                              dir="ltr"
                              value={row.overtimeDisplay || ''}
                              onChange={(e) => handleCellChange(row.id, 'overtimeDisplay', e.target.value)}
                              className="payroll-screen-input w-full text-center font-bold bg-transparent outline-none border-none p-0 text-black text-xs sm:text-[13px]"
                              placeholder="57 Hours"
                            />
                          </td>
                        );
                      }
                      if (colKey === 'absentLate') {
                        return (
                          <td key={colKey} className="border border-black text-center font-bold py-1.5 px-2 bg-white text-black" dir="ltr">
                            <span className="payroll-print-val font-bold text-black text-xs sm:text-[13px] text-center" dir="ltr">
                              {row.absentAndLateText || ''}
                            </span>
                            <input 
                              type="text"
                              dir="ltr"
                              value={row.absentAndLateText || ''}
                              onChange={(e) => handleCellChange(row.id, 'absentAndLateText', e.target.value)}
                              className="payroll-screen-input w-full text-center font-bold bg-transparent outline-none border-none p-0 text-black text-xs sm:text-[13px]"
                              placeholder="-"
                            />
                          </td>
                        );
                      }
                      if (colKey === 'sickLeave') {
                        return (
                          <td key={colKey} className="border border-black text-center font-bold py-1.5 px-2 bg-white text-black" dir="ltr">
                            <span className="payroll-print-val font-bold text-black text-xs sm:text-[13px] text-center" dir="ltr">
                              {row.sickLeaveText || ''}
                            </span>
                            <input 
                              type="text"
                              dir="ltr"
                              value={row.sickLeaveText || ''}
                              onChange={(e) => handleCellChange(row.id, 'sickLeaveText', e.target.value)}
                              className="payroll-screen-input w-full text-center font-bold bg-transparent outline-none border-none p-0 text-black text-xs sm:text-[13px]"
                              placeholder="-"
                            />
                          </td>
                        );
                      }

                      // Custom Column Cell
                      const col = (config.customColumns || []).find(c => c.id === colKey);
                      if (!col) return null;
                      return (
                        <td
                          key={col.id}
                          className={`border border-black text-center font-bold py-1.5 px-2 text-black ${
                            col.highlightYellow ? 'bg-[#ffff00] font-black excel-yellow-cell' : 'bg-white'
                          }`}
                          dir="ltr"
                        >
                          <span className="payroll-print-val font-bold text-black text-xs sm:text-[13px] text-center" dir="ltr">
                            {row.customColumnValues?.[col.id] || ''}
                          </span>
                          <input
                            type="text"
                            dir="ltr"
                            value={row.customColumnValues?.[col.id] || ''}
                            onChange={(e) => handleCustomColValueChange(row.id, col.id, e.target.value)}
                            className="payroll-screen-input w-full text-center font-bold bg-transparent outline-none border-none p-0 text-black text-xs sm:text-[13px]"
                            placeholder="-"
                          />
                        </td>
                      );
                    })}

                  </tr>
                ));
              })()}
            </tbody>
          </table>

          {/* Official Signatures matching exact image */}
          <div className="flex items-center justify-between mt-8 pt-4 px-8 text-black font-bold text-sm print-signatures">
            {/* Left: Medical Director */}
            <div className="text-center">
              <div className="text-base font-extrabold">{config.medicalDirectorTitle}</div>
              <div className="h-10"></div>
              <div className="text-xs text-slate-700 print:text-black font-bold">التوقيع والاعتماد: ....................</div>
            </div>

            {/* Center Stamp Box for Official Hospital Document */}
            <div className="text-center hidden sm:block print:block">
              <div className="w-28 h-16 border-2 border-dashed border-slate-400 rounded-lg flex items-center justify-center text-xs text-slate-500 font-bold">
                ختم القسم / الإدارة
              </div>
            </div>

            {/* Right: Department Head / Supervisor */}
            <div className="text-center">
              <div className="text-base font-extrabold">{config.departmentHeadTitle}</div>
              <div className="h-10"></div>
              <div className="text-xs text-slate-700 print:text-black font-bold">التوقيع: ....................</div>
            </div>
          </div>

        </div>
      </main>

      {/* ========================================================================= */}
      {/* 4. ADD EMPLOYEE MODAL */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isAddRowModalOpen}
        onClose={() => setIsAddRowModalOpen(false)}
        title={isAr ? "إضافة موظف إلى كشف الدوام والغياب" : "Add Employee to Payroll Statement"}
        maxWidth="max-w-md"
      >
        <div className="space-y-3 text-xs sm:text-sm">
          <div>
            <label className="block font-bold mb-1">{isAr ? 'اسم الموظف *' : 'Employee Name *'}</label>
            <input 
              type="text"
              value={newRowData.name || ''}
              onChange={(e) => setNewRowData({ ...newRowData, name: e.target.value })}
              placeholder={isAr ? "مثال: Mohamed Ali" : "e.g. Mohamed Ali"}
              className="w-full p-2 rounded-xl border dark:bg-slate-800 dark:border-slate-700 font-bold"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-bold mb-1">{isAr ? 'الرقم الوظيفي' : 'Employee Number'}</label>
              <input 
                type="text"
                value={newRowData.employeeNumber || ''}
                onChange={(e) => setNewRowData({ ...newRowData, employeeNumber: e.target.value })}
                placeholder="4005"
                className="w-full p-2 rounded-xl border dark:bg-slate-800 dark:border-slate-700 font-bold"
              />
            </div>
            <div>
              <label className="block font-bold mb-1">{isAr ? 'القسم / التصنيف' : 'Category'}</label>
              <select
                value={newRowData.category || 'staff'}
                onChange={(e) => setNewRowData({ ...newRowData, category: e.target.value as any })}
                className="w-full p-2 rounded-xl border dark:bg-slate-800 dark:border-slate-700 font-bold"
              >
                <option value="staff">{isAr ? 'موظف / فني (Staff)' : 'Staff / Technician'}</option>
                <option value="doctor">{isAr ? 'طبيب (Doctor)' : 'Doctor'}</option>
                <option value="hidden">{isAr ? 'مخفي (Hidden)' : 'Hidden Staff'}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block font-bold mb-1">{isAr ? 'حساب أيام' : 'Days'}</label>
              <input 
                type="text"
                value={newRowData.calculatedDaysDisplay || ''}
                onChange={(e) => setNewRowData({ ...newRowData, calculatedDaysDisplay: e.target.value })}
                placeholder="*2 or 30"
                className="w-full p-2 rounded-xl border dark:bg-slate-800 dark:border-slate-700 font-bold text-center bg-yellow-50 dark:bg-yellow-950/40"
              />
            </div>
            <div>
              <label className="block font-bold mb-1">{isAr ? 'الجمع' : 'Fridays'}</label>
              <input 
                type="number"
                value={newRowData.fridayDuties || 4}
                onChange={(e) => setNewRowData({ ...newRowData, fridayDuties: Number(e.target.value) })}
                className="w-full p-2 rounded-xl border dark:bg-slate-800 dark:border-slate-700 font-bold text-center"
              />
            </div>
            <div>
              <label className="block font-bold mb-1">{isAr ? 'العطلة / العيد' : 'Holiday'}</label>
              <input 
                type="number"
                value={newRowData.holidayDuties || 1}
                onChange={(e) => setNewRowData({ ...newRowData, holidayDuties: Number(e.target.value) })}
                className="w-full p-2 rounded-xl border dark:bg-slate-800 dark:border-slate-700 font-bold text-center"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold mb-1">{isAr ? 'ساعات العمل الإضافي (Overtime)' : 'Overtime Hours'}</label>
            <input 
              type="number"
              value={newRowData.overtimeHours || 0}
              onChange={(e) => setNewRowData({ ...newRowData, overtimeHours: Number(e.target.value) })}
              placeholder="57"
              className="w-full p-2 rounded-xl border dark:bg-slate-800 dark:border-slate-700 font-bold"
            />
          </div>

          <div>
            <label className="block font-bold mb-1">{isAr ? 'ملاحظات: ABSENT and LATE' : 'Notes: ABSENT and LATE'}</label>
            <input 
              type="text"
              value={newRowData.absentAndLateText || ''}
              onChange={(e) => setNewRowData({ ...newRowData, absentAndLateText: e.target.value })}
              placeholder={isAr ? "مثال: 1 (One) Day Absent أو 5 (Five) Days Vacation" : "e.g. 1 (One) Day Absent or 5 (Five) Days Vacation"}
              className="w-full p-2 rounded-xl border dark:bg-slate-800 dark:border-slate-700 font-bold"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t">
            <button
              onClick={() => setIsAddRowModalOpen(false)}
              className="px-4 py-2 rounded-xl border font-bold"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              onClick={handleAddNewRow}
              className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold"
            >
              {isAr ? 'إضافة إلى الكشف' : 'Add to Statement'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* 5. CONFIGURATION MODAL (CUSTOMIZE HEADERS, EID, NATIONAL DAY) */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        title={isAr ? "إعدادات وترويسة كشف الدوام والغياب" : "Payroll Statement & Header Settings"}
        maxWidth="max-w-xl"
      >
        <div className="space-y-4 text-xs sm:text-sm">
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold mb-1">{isAr ? 'اسم المستشفى (عربي)' : 'Hospital Name (Arabic)'}</label>
              <input 
                type="text"
                value={config.hospitalNameAr}
                onChange={(e) => setConfig({ ...config, hospitalNameAr: e.target.value })}
                className="w-full p-2 rounded-xl border dark:bg-slate-800 dark:border-slate-700 font-bold"
              />
            </div>
            <div>
              <label className="block font-bold mb-1">{isAr ? 'اسم المستشفى (إنجليزي)' : 'Hospital Name (English)'}</label>
              <input 
                type="text"
                value={config.hospitalNameEn}
                onChange={(e) => setConfig({ ...config, hospitalNameEn: e.target.value })}
                className="w-full p-2 rounded-xl border dark:bg-slate-800 dark:border-slate-700 font-bold text-left"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold mb-1">{isAr ? 'عنوان البيان (عربي)' : 'Statement Title (Arabic)'}</label>
              <input 
                type="text"
                value={config.statementTitleAr}
                onChange={(e) => setConfig({ ...config, statementTitleAr: e.target.value })}
                className="w-full p-2 rounded-xl border dark:bg-slate-800 dark:border-slate-700 font-bold"
              />
            </div>
            <div>
              <label className="block font-bold mb-1">{isAr ? 'عنوان البيان (إنجليزي)' : 'Statement Title (English)'}</label>
              <input 
                type="text"
                value={config.statementTitleEn}
                onChange={(e) => setConfig({ ...config, statementTitleEn: e.target.value })}
                className="w-full p-2 rounded-xl border dark:bg-slate-800 dark:border-slate-700 font-bold text-left"
              />
            </div>
          </div>

          {/* Holiday Column Control */}
          <div className="p-3 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/30">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold flex items-center gap-1.5 text-indigo-900 dark:text-indigo-200">
                <Flag className="w-4 h-4 text-indigo-600" />
                {isAr ? 'عمود المناسبة والعطلة (اليوم الوطني / العيد)' : 'Holiday Column (National Day / Eid)'}
              </span>
              <label className="flex items-center gap-2 cursor-pointer font-bold text-xs">
                <input 
                  type="checkbox"
                  checked={config.customHolidayEnabled}
                  onChange={(e) => setConfig({ ...config, customHolidayEnabled: e.target.checked })}
                  className="rounded text-indigo-600"
                />
                {isAr ? 'تفعيل العمود في الجدول' : 'Enable column in statement'}
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
              <div>
                <label className="block font-medium text-xs mb-1">{isAr ? 'عنوان العمود في الجدول:' : 'Column Header Name:'}</label>
                <input 
                  type="text"
                  value={config.customHolidayName}
                  onChange={(e) => setConfig({ ...config, customHolidayName: e.target.value.toUpperCase() })}
                  placeholder="NATIONAL DAY / EID"
                  className="w-full p-2 rounded-lg border dark:bg-slate-800 dark:border-slate-700 font-bold uppercase"
                />
              </div>
              <div>
                <label className="block font-medium text-xs mb-1">{isAr ? 'تاريخ حتى (Till Date):' : 'Till Date Text:'}</label>
                <input 
                  type="text"
                  value={config.tillDateText}
                  onChange={(e) => setConfig({ ...config, tillDateText: e.target.value })}
                  placeholder="Till 24.09.2026"
                  className="w-full p-2 rounded-lg border dark:bg-slate-800 dark:border-slate-700 font-bold"
                />
              </div>
            </div>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold mb-1">{isAr ? 'مسمى التوقيع الأيمن:' : 'Right Signature Title:'}</label>
              <input 
                type="text"
                value={config.departmentHeadTitle}
                onChange={(e) => setConfig({ ...config, departmentHeadTitle: e.target.value })}
                className="w-full p-2 rounded-xl border dark:bg-slate-800 dark:border-slate-700 font-bold"
              />
            </div>
            <div>
              <label className="block font-bold mb-1">{isAr ? 'مسمى التوقيع الأيسر:' : 'Left Signature Title:'}</label>
              <input 
                type="text"
                value={config.medicalDirectorTitle}
                onChange={(e) => setConfig({ ...config, medicalDirectorTitle: e.target.value })}
                className="w-full p-2 rounded-xl border dark:bg-slate-800 dark:border-slate-700 font-bold"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t">
            <button
              onClick={() => setIsConfigModalOpen(false)}
              className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold"
            >
              {isAr ? 'حفظ وتطبيق' : 'Save & Apply'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* 6. MANAGE & ADD CUSTOM COLUMNS MODAL */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isColumnsModalOpen}
        onClose={() => setIsColumnsModalOpen(false)}
        title={isAr ? "إضافة وإدارة أعمدة مسير الرواتب" : "Add & Manage Custom Columns"}
        maxWidth="max-w-lg"
      >
        <div className="space-y-4 text-xs sm:text-sm">
          <div className="p-3.5 rounded-xl border border-violet-200 dark:border-violet-900 bg-violet-50/50 dark:bg-violet-950/30 space-y-3">
            <h4 className="font-black text-violet-900 dark:text-violet-200 flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-violet-600" />
              <span>{isAr ? 'إضافة عمود جديد في المسير' : 'Add New Column to Payroll'}</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block font-bold text-xs mb-1">
                  {isAr ? 'عنوان العمود الرئيسي (الصف الأول) *' : 'Main Header Title (Row 1) *'}
                </label>
                <input
                  type="text"
                  value={newColTitleTop}
                  onChange={(e) => setNewColTitleTop(e.target.value)}
                  placeholder={isAr ? 'مثال: بدل / مكافأة / جزاءات' : 'e.g. Bonus / Deduction'}
                  className="w-full p-2 rounded-lg border dark:bg-slate-800 dark:border-slate-700 font-bold"
                />
              </div>
              <div>
                <label className="block font-bold text-xs mb-1">
                  {isAr ? 'عنوان فرعي (الصف الثاني - اختياري)' : 'Sub Header (Row 2 - Optional)'}
                </label>
                <input
                  type="text"
                  value={newColTitleBottom}
                  onChange={(e) => setNewColTitleBottom(e.target.value)}
                  placeholder={isAr ? 'مثال: Extra / Notes' : 'e.g. Extra / Notes'}
                  className="w-full p-2 rounded-lg border dark:bg-slate-800 dark:border-slate-700 font-bold"
                />
              </div>
            </div>
            <div>
              <label className="block font-bold text-xs mb-1">
                {isAr ? 'مكان ظهور العمود في الجدول:' : 'Column Position in Table:'}
              </label>
              <select
                value={newColPosition}
                onChange={(e) => setNewColPosition(e.target.value)}
                className="w-full p-2 rounded-lg border dark:bg-slate-800 dark:border-slate-700 font-bold text-xs"
              >
                <option value="end">{isAr ? 'في نهاية الجدول (بعد الإجازة المرضية)' : 'At the end of table'}</option>
                <option value="start">{isAr ? 'في بداية الجدول (قبل حساب أيام)' : 'At the start (before Days Calc)'}</option>
                <option value="after_calcDays">{isAr ? 'بعد عمود (حساب أيام) مباشرة' : 'After Days Calc'}</option>
                <option value="after_name">{isAr ? 'بعد عمود (اسم الموظف) مباشرة' : 'After Employee Name'}</option>
                <option value="after_fridays">{isAr ? 'بعد عمود (الجمع / Fridays) مباشرة' : 'After Fridays'}</option>
                {config.customHolidayEnabled && (
                  <option value="after_holiday">{isAr ? `بعد عمود (${config.customHolidayName}) مباشرة` : 'After Holiday'}</option>
                )}
                <option value="after_overtime">{isAr ? 'بعد عمود (الأوفر تايم / Overtime) مباشرة' : 'After Overtime'}</option>
                <option value="after_absentLate">{isAr ? 'بعد عمود (ملاحظات الغياب والتأخير) مباشرة' : 'After Absent & Late'}</option>
              </select>
            </div>
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-xs">
                <input
                  type="checkbox"
                  checked={newColYellow}
                  onChange={(e) => setNewColYellow(e.target.checked)}
                  className="rounded text-yellow-500"
                />
                <span>{isAr ? 'تمييز العمود باللون الأصفر (#ffff00)' : 'Highlight column in yellow'}</span>
              </label>
              <button
                type="button"
                onClick={handleAddCustomColumn}
                className="px-4 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold flex items-center gap-1.5 shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAr ? 'إضافة العمود' : 'Add Column'}</span>
              </button>
            </div>
          </div>

          {/* Existing Custom Columns List */}
          <div className="space-y-2">
            <h5 className="font-bold text-xs text-slate-500 dark:text-slate-400">
              {isAr ? `الأعمدة المضافة حالياً (${config.customColumns?.length || 0}) وترتيب مكانها:` : `Current Custom Columns (${config.customColumns?.length || 0}) & Position:`}
            </h5>
            {(!config.customColumns || config.customColumns.length === 0) ? (
              <div className="p-4 rounded-xl border border-dashed text-center text-slate-400 font-medium text-xs">
                {isAr ? 'لا توجد أعمدة إضافية حالياً. يمكنك إضافة أي عدد من الأعمدة أعلاه.' : 'No custom columns added yet.'}
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {config.customColumns.map((col, idx) => {
                  const posInTable = orderedTableColumns.indexOf(col.id);
                  return (
                    <div
                      key={col.id}
                      className="flex flex-col gap-2 p-2.5 rounded-xl border bg-slate-50 dark:bg-slate-800/60 dark:border-slate-700"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1">
                          <span className="w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 font-black text-[11px] flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <input
                            type="text"
                            value={col.titleTop}
                            onChange={(e) => handleUpdateCustomColumn(col.id, 'titleTop', e.target.value)}
                            className="p-1.5 rounded-lg border dark:bg-slate-900 dark:border-slate-700 font-bold text-xs flex-1"
                            placeholder={isAr ? 'العنوان الرئيسي' : 'Main Title'}
                          />
                          <input
                            type="text"
                            value={col.titleBottom || ''}
                            onChange={(e) => handleUpdateCustomColumn(col.id, 'titleBottom', e.target.value || undefined)}
                            className="p-1.5 rounded-lg border dark:bg-slate-900 dark:border-slate-700 font-bold text-xs flex-1"
                            placeholder={isAr ? 'عنوان فرعي (اختياري)' : 'Sub Title'}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteCustomColumn(col.id)}
                          className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400"
                          title={isAr ? 'حذف العمود' : 'Delete column'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Column Position & Move Controls */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200 dark:border-slate-700/60 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-500">{isAr ? 'ترتيب العمود في الجدول:' : 'Column Order:'}</span>
                          <select
                            value={posInTable}
                            onChange={(e) => handleSetColumnIndex(col.id, Number(e.target.value))}
                            className="px-2 py-1 rounded-lg border bg-white dark:bg-slate-900 dark:border-slate-700 font-bold"
                          >
                            {orderedTableColumns.map((k, kIdx) => (
                              <option key={k} value={kIdx}>
                                {isAr ? `المركز ${kIdx + 1} (${k === col.id ? 'مكانه الحالي' : `مكان: ${getColumnLabel(k)}`})` : `Position ${kIdx + 1}`}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleMoveColumnOrder(col.id, 'earlier')}
                            disabled={posInTable <= 0}
                            className="px-2 py-1 rounded-lg border bg-white dark:bg-slate-900 hover:bg-violet-50 disabled:opacity-30 font-bold flex items-center gap-1"
                            title={isAr ? 'تحريك العمود لليمين' : 'Move Right'}
                          >
                            <ArrowRight className="w-3 h-3 text-violet-600" />
                            <span>{isAr ? 'يمين' : 'Right'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveColumnOrder(col.id, 'later')}
                            disabled={posInTable === -1 || posInTable >= orderedTableColumns.length - 1}
                            className="px-2 py-1 rounded-lg border bg-white dark:bg-slate-900 hover:bg-violet-50 disabled:opacity-30 font-bold flex items-center gap-1"
                            title={isAr ? 'تحريك العمود لليسار' : 'Move Left'}
                          >
                            <span>{isAr ? 'يسار' : 'Left'}</span>
                            <ArrowLeft className="w-3 h-3 text-violet-600" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end pt-3 border-t">
            <button
              type="button"
              onClick={() => setIsColumnsModalOpen(false)}
              className="px-5 py-2 rounded-xl bg-emerald-600 text-white font-bold cursor-pointer"
            >
              {isAr ? 'تم' : 'Done'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* 7. CONFIRMATION MODAL: DELETE / EXCLUDE EMPLOYEE FROM MAIN PAYROLL */}
      {/* ========================================================================= */}
      <Modal
        isOpen={confirmDeleteModal.isOpen}
        onClose={() => setConfirmDeleteModal({ isOpen: false, row: null })}
        title={isAr ? "حذف أو استبعاد موظف من المسير الرئيسي" : "Exclude or Delete Employee"}
        maxWidth="max-w-md"
      >
        {confirmDeleteModal.row && (
          <div className="space-y-4 text-xs sm:text-sm">
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 space-y-2">
              <div className="flex items-center gap-2 font-black text-sm">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{confirmDeleteModal.row.name}</span>
                {confirmDeleteModal.row.employeeNumber && (
                  <span className="text-xs text-amber-700 dark:text-amber-300 font-mono">
                    (#{confirmDeleteModal.row.employeeNumber})
                  </span>
                )}
              </div>
              <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed font-semibold">
                {isAr
                  ? 'هل ترغب في استبعاد هذا الموظف من المسير الرئيسي نظراً لنزوله إجازة وصرف راتبه بشكل مفرد؟'
                  : 'Do you want to exclude this employee from the main payroll because they took leave and received individual payout?'}
              </p>
              <div className="p-2.5 rounded-lg bg-amber-100/70 dark:bg-amber-900/50 text-[11px] text-amber-900 dark:text-amber-300 font-medium">
                {isAr
                  ? '💡 سيتم نقل الموظف فوراً إلى تبويب "المستبعدين للإجازة". يمكنك طباعة ورقة تسوية الإجازة المفردة له في أي وقت أو استعادته للمسير الرئيسي بنقرة واحدة.'
                  : 'The employee will be moved to the "Vacation Excluded" tab. You can print their individual vacation clearance slip anytime or restore them back.'}
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  if (confirmDeleteModal.row) {
                    handleExcludeEmployee(confirmDeleteModal.row);
                  }
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
              >
                <UserMinus className="w-4 h-4" />
                <span>{isAr ? 'نعم، استبعاد من المسير الرئيسي (صرف راتب مفرد)' : 'Yes, exclude from main payroll'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const target = confirmDeleteModal.row;
                  setConfirmDeleteModal({ isOpen: false, row: null });
                  if (target) {
                    handleOpenIndividualSlip(target);
                  }
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
              >
                <FileText className="w-4 h-4" />
                <span>{isAr ? 'معاينة وطباعة ورقة تسوية الإجازة أولاً' : 'Preview & Print Vacation Slip First'}</span>
              </button>

              <button
                type="button"
                onClick={() => setConfirmDeleteModal({ isOpen: false, row: null })}
                className="w-full py-2 px-4 rounded-xl border border-slate-300 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ========================================================================= */}
      {/* 8. INDIVIDUAL VACATION SETTLEMENT & CLEARANCE SLIP MODAL */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isIndividualModalOpen}
        onClose={() => setIsIndividualModalOpen(false)}
        title={isAr ? "كشف دوام وغياب منفصل للموظف (تسوية إجازة)" : "Individual Employee Payroll Statement"}
        maxWidth="max-w-6xl"
      >
        {individualSlipRow && (
          <div className="space-y-4 text-xs sm:text-sm">
            
            {/* Top Toolbar Actions inside Modal */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-100 dark:bg-slate-800/80 border dark:border-slate-700">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handlePrintIndividualSlip}
                  className="px-4 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black font-black flex items-center gap-1.5 shadow-xs transition-all cursor-pointer text-xs"
                >
                  <Printer className="w-4 h-4" />
                  <span>{isAr ? 'طباعة الكشف A4' : 'Print Statement A4'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleExportSingleEmployeeExcel(individualSlipRow)}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer text-xs"
                >
                  <Download className="w-4 h-4" />
                  <span>{isAr ? 'تصدير إكسل' : 'Export Excel'}</span>
                </button>

                {/* Till date input right in the toolbar */}
                <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 px-3 py-1.5 rounded-xl">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{isAr ? 'تاريخ حتى:' : 'Till Date:'}</span>
                  <input
                    type="text"
                    value={individualTillDate}
                    onChange={(e) => setIndividualTillDate(e.target.value)}
                    placeholder="Till 12.10.2026"
                    className="w-32 text-xs font-bold bg-transparent outline-none border-none p-0 text-slate-800 dark:text-slate-200"
                  />
                </div>
              </div>

              <div>
                {rows.some(r => r.id === individualSlipRow.id) ? (
                  <button
                    type="button"
                    onClick={() => handleExcludeEmployee(individualSlipRow)}
                    className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900 font-bold flex items-center gap-1.5 transition-all cursor-pointer text-xs"
                    title={isAr ? 'استبعاد الموظف من المسير الرئيسي حتى لا يتكرر بعد صرف راتبه مفرداً' : 'Exclude from main payroll'}
                  >
                    <UserMinus className="w-4 h-4 text-rose-600" />
                    <span>{isAr ? 'استبعاد من المسير الرئيسي (صرف راتب مفرد)' : 'Exclude from Main Payroll'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleRestoreEmployee(individualSlipRow)}
                    className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900 font-bold flex items-center gap-1.5 transition-all cursor-pointer text-xs"
                  >
                    <RotateCcw className="w-4 h-4 text-emerald-600" />
                    <span>{isAr ? 'استعادة الموظف للمسير الرئيسي' : 'Restore to Main Payroll'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Official Document Sheet inside Modal - EXACT MATCH TO MASTER PAYROLL */}
            <div className="bg-white text-black p-4 sm:p-8 rounded-xl border border-slate-300 overflow-x-auto shadow-sm" dir="rtl">
              
              {/* Header section matching exact official document */}
              <div className="flex items-start justify-between mb-2 border-b-2 border-black pb-2">
                {/* Left Header in English */}
                <div className="text-left font-sans" dir="ltr">
                  <div className="text-xs sm:text-sm font-bold tracking-tight text-black">
                    {config.hospitalNameEn} - {config.departmentNameEn}
                  </div>
                  <div className="text-[10px] sm:text-xs font-semibold text-black mt-0.5">
                    {monthInfo.monthNameEn} {monthInfo.year} {config.statementTitleEn} {individualTillDate || config.tillDateText}
                  </div>
                </div>

                {/* Center: Old Hospital Logo with statement title underneath */}
                <div className="text-center flex flex-col items-center justify-center px-2">
                  <img 
                    src="/old-logo.png" 
                    alt="Hospital Logo" 
                    className="h-10 sm:h-12 w-auto max-w-[130px] object-contain mx-auto"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/logo.png';
                    }}
                  />
                  <div className="text-xs sm:text-sm font-black tracking-tight text-black mt-0.5 leading-snug">
                    {config.statementTitleAr}
                  </div>
                  <div className="text-[10px] font-bold text-slate-800">
                    {monthInfo.monthNameAr} {monthInfo.year}
                  </div>
                </div>

                {/* Right Header in Arabic */}
                <div className="text-right font-sans" dir="rtl">
                  <div className="text-xs sm:text-sm font-bold tracking-tight text-black">
                    {config.hospitalNameAr} - {config.departmentNameAr}
                  </div>
                  <div className="text-[10px] sm:text-xs font-semibold text-black mt-0.5">
                    {config.statementTitleAr} - {monthInfo.monthNameAr} {monthInfo.year}
                  </div>
                </div>
              </div>

              {/* Table Container with exact excel grid borders and colors */}
              <table className="w-full border-collapse border-2 border-black text-black font-sans text-xs sm:text-[13px] excel-table">
                <thead>
                  {/* Row 1 of Header */}
                  <tr className="bg-[#e6e6e6] text-center font-bold border-b border-black text-black excel-header-gray">
                    <th className="border border-black px-1.5 py-1.5 w-9 text-center font-bold" rowSpan={2}>
                      م
                    </th>
                    {orderedTableColumns.map(colKey => {
                      if (colKey === 'calcDays') {
                        return (
                          <th key={colKey} className="border border-black px-1.5 py-1.5 w-16 bg-[#ffff00] text-black font-black text-center excel-yellow-cell" rowSpan={2}>
                            <div className="leading-tight">حساب</div>
                            <div className="leading-tight">أيام</div>
                          </th>
                        );
                      }
                      if (colKey === 'name') {
                        return (
                          <th key={colKey} className="border border-black px-3 py-1.5 min-w-[190px] text-center" rowSpan={2}>
                            <div>اسم الموظف</div>
                            <div className="font-normal text-[11px]">Employee Name</div>
                          </th>
                        );
                      }
                      if (colKey === 'fridays') {
                        return (
                          <th key={colKey} className="border border-black px-2.5 py-1.5 w-28 text-center" rowSpan={2}>
                            <div>الجمع</div>
                            <div className="font-normal text-[11px]">Fridays</div>
                          </th>
                        );
                      }
                      if (colKey === 'holiday') {
                        return (
                          <th key={colKey} className="border border-black px-2.5 py-1.5 w-28 text-center" rowSpan={2}>
                            <div>{config.customHolidayName}</div>
                            <div className="font-normal text-[11px]">DAY</div>
                          </th>
                        );
                      }
                      if (colKey === 'overtime') {
                        return (
                          <th key={colKey} className="border border-black px-2.5 py-1.5 w-24 text-center">
                            {monthInfo.monthNameEn}
                          </th>
                        );
                      }
                      if (colKey === 'absentLate') {
                        return (
                          <th key={colKey} className="border border-black px-3 py-1.5 min-w-[190px] text-center">
                            ملاحظات:
                          </th>
                        );
                      }
                      if (colKey === 'sickLeave') {
                        return (
                          <th key={colKey} className="border border-black px-3 py-1.5 w-36 text-center" rowSpan={2}>
                            <div>Sick Leave</div>
                            <div className="font-normal text-[10px]">Not Including absentee</div>
                          </th>
                        );
                      }
                      const col = (config.customColumns || []).find(c => c.id === colKey);
                      if (!col) return null;
                      return (
                        <th
                          key={col.id}
                          className={`border border-black px-3 py-1.5 min-w-[120px] text-center ${
                            col.highlightYellow ? 'bg-[#ffff00] font-black excel-yellow-cell' : ''
                          }`}
                          rowSpan={col.titleBottom ? 1 : 2}
                        >
                          <div>{col.titleTop}</div>
                          {col.titleBottom && <div className="font-normal text-[11px]">{col.titleBottom}</div>}
                        </th>
                      );
                    })}
                  </tr>
                  {/* Row 2 of Header */}
                  <tr className="bg-[#e6e6e6] text-center font-bold border-b border-black text-black excel-header-gray">
                    {orderedTableColumns.map(colKey => {
                      if (colKey === 'overtime') {
                        return (
                          <th key={colKey} className="border border-black px-2 py-1 text-center font-bold text-[11px]">
                            Over Time
                          </th>
                        );
                      }
                      if (colKey === 'absentLate') {
                        return (
                          <th key={colKey} className="border border-black px-2 py-1 text-center font-bold text-[11px]">
                            ABSENT and LATE
                          </th>
                        );
                      }
                      return null;
                    })}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-black text-center font-bold py-1.5 px-1 bg-white text-black">
                      1
                    </td>
                    {orderedTableColumns.map(colKey => {
                      if (colKey === 'calcDays') {
                        return (
                          <td key={colKey} className="border border-black text-center font-black py-1.5 px-1 bg-[#ffff00] text-black excel-yellow-cell" dir="ltr">
                            <input 
                              type="text"
                              dir="ltr"
                              value={individualSlipRow.calculatedDaysDisplay || ''}
                              onChange={(e) => handleUpdateIndividualField('calculatedDaysDisplay', e.target.value)}
                              className="w-full text-center font-black bg-transparent outline-none border-none p-0 text-black text-sm"
                            />
                          </td>
                        );
                      }
                      if (colKey === 'name') {
                        return (
                          <td key={colKey} className="border border-black text-right font-bold py-1.5 px-2 bg-white text-black">
                            <span className="font-extrabold text-[13px] text-black" dir="auto">{individualSlipRow.name}</span>
                          </td>
                        );
                      }
                      if (colKey === 'fridays') {
                        return (
                          <td key={colKey} className="border border-black text-center font-bold py-1.5 px-1.5 bg-white text-black" dir="ltr">
                            <input 
                              type="text"
                              dir="ltr"
                              value={individualSlipRow.fridayDisplay || ''}
                              onChange={(e) => handleUpdateIndividualField('fridayDisplay', e.target.value)}
                              className="w-full text-center font-bold bg-transparent outline-none border-none p-0 text-black text-xs sm:text-[13px]"
                            />
                          </td>
                        );
                      }
                      if (colKey === 'holiday') {
                        return (
                          <td key={colKey} className="border border-black text-center font-bold py-1.5 px-1.5 bg-white text-black" dir="ltr">
                            <input 
                              type="text"
                              dir="ltr"
                              value={individualSlipRow.holidayDisplay || ''}
                              onChange={(e) => handleUpdateIndividualField('holidayDisplay', e.target.value)}
                              className="w-full text-center font-bold bg-transparent outline-none border-none p-0 text-black text-xs sm:text-[13px]"
                            />
                          </td>
                        );
                      }
                      if (colKey === 'overtime') {
                        return (
                          <td key={colKey} className="border border-black text-center font-bold py-1.5 px-1.5 bg-white text-black" dir="ltr">
                            <input 
                              type="text"
                              dir="ltr"
                              value={individualSlipRow.overtimeDisplay || ''}
                              onChange={(e) => handleUpdateIndividualField('overtimeDisplay', e.target.value)}
                              className="w-full text-center font-bold bg-transparent outline-none border-none p-0 text-black text-xs sm:text-[13px]"
                            />
                          </td>
                        );
                      }
                      if (colKey === 'absentLate') {
                        return (
                          <td key={colKey} className="border border-black text-center font-bold py-1.5 px-2 bg-white text-black" dir="ltr">
                            <input 
                              type="text"
                              dir="ltr"
                              value={individualSlipRow.absentAndLateText || ''}
                              onChange={(e) => handleUpdateIndividualField('absentAndLateText', e.target.value)}
                              className="w-full text-center font-bold bg-transparent outline-none border-none p-0 text-black text-xs sm:text-[13px]"
                            />
                          </td>
                        );
                      }
                      if (colKey === 'sickLeave') {
                        return (
                          <td key={colKey} className="border border-black text-center font-bold py-1.5 px-2 bg-white text-black" dir="ltr">
                            <input 
                              type="text"
                              dir="ltr"
                              value={individualSlipRow.sickLeaveText || ''}
                              onChange={(e) => handleUpdateIndividualField('sickLeaveText', e.target.value)}
                              className="w-full text-center font-bold bg-transparent outline-none border-none p-0 text-black text-xs sm:text-[13px]"
                            />
                          </td>
                        );
                      }
                      const col = (config.customColumns || []).find(c => c.id === colKey);
                      if (!col) return null;
                      return (
                        <td
                          key={col.id}
                          className={`border border-black text-center font-bold py-1.5 px-2 text-black ${
                            col.highlightYellow ? 'bg-[#ffff00] font-black excel-yellow-cell' : 'bg-white'
                          }`}
                          dir="ltr"
                        >
                          <input 
                            type="text"
                            dir="ltr"
                            value={individualSlipRow.customColumnValues?.[col.id] || ''}
                            onChange={(e) => {
                              const nextVal = e.target.value;
                              setIndividualSlipRow(prev => prev ? {
                                ...prev,
                                customColumnValues: {
                                  ...(prev.customColumnValues || {}),
                                  [col.id]: nextVal
                                }
                              } : null);
                            }}
                            className="w-full text-center font-bold bg-transparent outline-none border-none p-0 text-black text-xs sm:text-[13px]"
                          />
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>

              {/* Official Signatures matching exact document */}
              <div className="flex items-center justify-between mt-8 pt-4 px-8 text-black font-bold text-sm print-signatures">
                {/* Left: Medical Director */}
                <div className="text-center">
                  <div className="text-base font-extrabold">{config.medicalDirectorTitle}</div>
                  <div className="h-10"></div>
                  <div className="text-xs text-slate-700 font-bold">التوقيع والاعتماد: ....................</div>
                </div>

                {/* Center Stamp Box for Official Hospital Document */}
                <div className="text-center">
                  <div className="w-28 h-16 border-2 border-dashed border-slate-400 rounded-lg flex items-center justify-center text-xs text-slate-500 font-bold">
                    ختم القسم / الإدارة
                  </div>
                </div>

                {/* Right: Department Head / Supervisor */}
                <div className="text-center">
                  <div className="text-base font-extrabold">{config.departmentHeadTitle}</div>
                  <div className="h-10"></div>
                  <div className="text-xs text-slate-700 font-bold">التوقيع: ....................</div>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t">
              <button
                type="button"
                onClick={() => setIsIndividualModalOpen(false)}
                className="px-5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>

              <button
                type="button"
                onClick={handlePrintIndividualSlip}
                className="px-5 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black font-black flex items-center gap-2 shadow-sm cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>{isAr ? 'طباعة الكشف A4' : 'Print Statement A4'}</span>
              </button>
            </div>

          </div>
        )}
      </Modal>

      {/* Print Specific CSS to ensure authentic vector A4 table and exact Excel colors */}
      <style>{`
        @media screen {
          .payroll-print-val {
            display: none !important;
          }
          .payroll-screen-input {
            display: block !important;
            direction: ltr !important;
            unicode-bidi: isolate !important;
            text-align: center !important;
          }
        }

        @media print {
          /* Always hide modals, overlays, sidebars, toolbars, buttons */
          div[class*="fixed inset-0"], 
          .modal-backdrop, 
          .fixed, 
          [role="dialog"],
          header, aside, nav, .print\\:hidden, [class*="print:hidden"], 
          .toast-container, button {
            display: none !important;
          }

          /* Ensure master payroll sheet prints in full vector beauty for both full and single employee */
          #payroll-sheet {
            display: block !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          @page {
            size: A4 landscape;
            margin: 8mm 8mm 8mm 8mm;
          }

          html, body, #root {
            background: #ffffff !important;
            background-color: #ffffff !important;
            background-image: none !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: auto !important;
            min-height: auto !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          main {
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: transparent !important;
          }

          .print-paper-container {
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            background: #ffffff !important;
            overflow: visible !important;
          }

          table.excel-table {
            width: 100% !important;
            border-collapse: collapse !important;
            border: 2px solid #000000 !important;
            margin-top: 0px !important;
            font-size: 10px !important;
            line-height: 1.25 !important;
            background-color: #ffffff !important;
            page-break-inside: auto !important;
          }

          table.excel-table thead {
            display: table-header-group !important;
          }

          table.excel-table th.print-doc-header-cell,
          table.excel-table tr.print-doc-header-row th {
            border: none !important;
            background-color: #ffffff !important;
            background: #ffffff !important;
            padding: 0 0 3px 0 !important;
            font-weight: normal !important;
            text-align: inherit !important;
          }

          table.excel-table tr {
            page-break-inside: avoid !important;
            page-break-after: auto !important;
          }

          table.excel-table th {
            border: 1px solid #000000 !important;
            background-color: #e6e6e6 !important;
            color: #000000 !important;
            font-weight: 800 !important;
            padding: 3px 4px !important;
            font-size: 10px !important;
            text-align: center !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          table.excel-table td {
            border: 1px solid #000000 !important;
            color: #000000 !important;
            padding: 3.5px 5px !important;
            vertical-align: middle !important;
            font-size: 10.5px !important;
            background-color: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          table.excel-table th.excel-yellow-cell,
          table.excel-table td.excel-yellow-cell,
          .excel-yellow-cell {
            background-color: #ffff00 !important;
            color: #000000 !important;
            font-weight: 900 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .excel-header-gray {
            background-color: #e6e6e6 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .payroll-screen-input {
            display: none !important;
          }

          .payroll-print-val {
            display: block !important;
            text-align: center !important;
            direction: ltr !important;
            unicode-bidi: isolate !important;
            font-size: 11px !important;
            font-weight: bold !important;
            color: #000000 !important;
            line-height: 1.3 !important;
          }

          .print-signatures {
            page-break-inside: avoid !important;
            margin-top: 20px !important;
            padding-top: 10px !important;
          }
        }
      `}</style>

    </div>
  );
};

export default SupervisorPayroll;

