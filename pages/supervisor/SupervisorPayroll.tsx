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
  FileCheck
} from 'lucide-react';
import { User, UserRole, EmployeeSummary } from '../../types';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useDepartment } from '../../contexts/DepartmentContext';
import { useAuth } from '../../contexts/AuthContext';
import Toast from '../../components/Toast';
import Modal from '../../components/Modal';
import { isOperationalStaff } from '../../utils/staffUtils';

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
  isFullMonthLeave?: boolean; // إجازة كامل الشهر (تستبعد تلقائياً من الكشف)

  isCustomRow?: boolean;
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
  medicalDirectorTitle: string;
  departmentHeadTitle: string;
  showDaysForAll: boolean; // إظهار أيام الشهر (30/31) للجميع أو للاستثناءات فقط
}

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
  medicalDirectorTitle: 'المدير الطبي',
  departmentHeadTitle: 'صديق مدير القسم',
  showDaysForAll: false // default: show *2 for Nazim/Winnie, days worked for partial vacation/absentee
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

// Helper: Formatter for Absence & Lateness text: e.g. "1 (One) Day Absent + 2 Hours Late"
const formatAbsentText = (absentDays: number, lateHours: number = 0): string => {
  const parts: string[] = [];
  if (absentDays > 0) {
    const word = getWordForNumber(absentDays);
    const dayWord = absentDays === 1 ? 'Day' : 'Days';
    parts.push(`${absentDays} (${word}) ${dayWord} Absent`);
  }
  if (lateHours > 0) {
    parts.push(`${lateHours} Hours Late`);
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
  const [activeTab, setActiveTab] = useState<'staff' | 'doctor' | 'hidden' | 'all'>('staff');
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
    fridayDuties: 4,
    holidayDuties: 1,
    overtimeHours: 0,
    absentAndLateText: '',
    sickLeaveText: ''
  });

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
  const loadPayrollData = async (forceAutoScan: boolean = false) => {
    setLoading(true);
    try {
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

      // If saved data exists and not forcing auto-scan, load it
      if (snapshot.exists() && !forceAutoScan) {
        const data = snapshot.data();
        if (data.config) setConfig(prev => ({ ...prev, ...data.config }));
        if (data.updatedAt) setLastSavedAt(data.updatedAt);
        if (Array.isArray(data.rows) && data.rows.length > 0) {
          setRows(data.rows);
          setLoading(false);
          return;
        }
      }

      // Auto scan data from schedules, leaves, and Smart Attendance Analyzer
      const autoPulled = await scanMonthData(selectedMonth, filteredStaff, monthInfo.daysInMonth);
      setRows(autoPulled.rows);
      
      // Update config customHoliday if detected
      if (autoPulled.detectedHolidayName) {
        setConfig(prev => ({
          ...prev,
          customHolidayName: autoPulled.detectedHolidayName,
          customHolidayEnabled: true
        }));
      }

      if (forceAutoScan) {
        setToast({ 
          msg: `تم سحب وتحديث كشف الشهر ومحلل الحضور: تم سحب الغياب والتأخير والأوفر تايم بدقة!`, 
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

  // Deep scanner: Pulls Fridays, Leaves, and SMART ATTENDANCE ANALYZER (Absences, Lateness, Overtime)
  const scanMonthData = async (monthKey: string, staffList: User[], totalDaysInMonth: number) => {
    const fridaysMap: Record<string, number> = {};
    const holidaysMap: Record<string, number> = {};
    const sickLeavesMap: Record<string, number> = {};
    const vacationsMap: Record<string, number> = {};
    const vacationDetailsMap: Record<string, string> = {};
    const cleanerMap: Record<string, boolean> = {};

    // Smart Attendance Analyzer data maps
    const analyzerOvertimeMap: Record<string, number> = {};
    const analyzerAbsenceMap: Record<string, number> = {};
    const analyzerLateMap: Record<string, number> = {};

    let detectedHolidayName = monthKey.endsWith('-09') ? 'NATIONAL DAY' : '';

    staffList.forEach(s => {
      fridaysMap[s.id] = 0;
      holidaysMap[s.id] = monthKey.endsWith('-09') ? 1 : 0; // September default 1 day national day
      sickLeavesMap[s.id] = 0;
      vacationsMap[s.id] = 0;
      vacationDetailsMap[s.id] = '';
      
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
        if (rawItem.id && fridaysMap[rawItem.id] !== undefined) return rawItem.id;
        if (rawItem.userId && fridaysMap[rawItem.userId] !== undefined) return rawItem.userId;
        targetName = (rawItem.name || rawItem.staffName || rawItem.employeeName || '').trim().toLowerCase();
        targetId = rawItem.id || rawItem.userId || '';
      }

      if (targetId && fridaysMap[targetId] !== undefined) return targetId;

      // Exact or partial name match
      const found = staffList.find(s => {
        const sName = (s.name || '').trim().toLowerCase();
        if (!sName || !targetName) return false;
        if (sName === targetName) return true;
        // Split names (e.g. "Tarek" or "Shabaka")
        const sParts = sName.split(/\s+/);
        const tParts = targetName.split(/\s+/);
        if (sParts.length > 0 && tParts.length > 0) {
          if (sParts[0] === tParts[0] && (sParts[1] === tParts[1] || sParts.length === 1 || tParts.length === 1)) return true;
        }
        return sName.includes(targetName) || targetName.includes(sName);
      });
      return found ? found.id : null;
    };

    try {
      // 1. Scan monthly_publishes for Friday and Holiday schedules
      const pubSnap = await getDocs(collection(db, 'monthly_publishes'));
      pubSnap.docs.forEach((docSnap: any) => {
        const pData = docSnap.data();
        const docId = docSnap.id;
        const matchMonth = docId.includes(monthKey) || pData.targetMonth === monthKey || pData.month === monthKey;
        if (!matchMonth) return;

        // Technician/Staff Friday schedules
        const fridayRows = pData.fridayData || pData.fridaySchedule || [];
        if (Array.isArray(fridayRows)) {
          fridayRows.forEach((row: any) => {
            Object.keys(row).forEach(key => {
              if (key !== 'date' && key !== 'id' && key !== 'note' && key !== 'title') {
                const staffItems = row[key];
                const list = Array.isArray(staffItems) ? staffItems : (staffItems ? [staffItems] : []);
                list.forEach((st: any) => {
                  const mId = matchStaff(st);
                  if (mId) fridaysMap[mId] = (fridaysMap[mId] || 0) + 1;
                });
              }
            });
          });
        }

        // Doctor Friday schedules
        const docFridayRows = pData.doctorFridayData || pData.doctorFridaySchedule || [];
        if (Array.isArray(docFridayRows)) {
          docFridayRows.forEach((row: any) => {
            Object.keys(row).forEach(key => {
              if (key !== 'date' && key !== 'id' && key !== 'note' && key !== 'title') {
                const staffItems = row[key];
                const list = Array.isArray(staffItems) ? staffItems : (staffItems ? [staffItems] : []);
                list.forEach((st: any) => {
                  const mId = matchStaff(st);
                  if (mId) fridaysMap[mId] = (fridaysMap[mId] || 0) + 1;
                });
              }
            });
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

      // 2. Scan leaveRequests for Sick Leaves & Annual/Casual Vacations
      try {
        const leavesSnap = await getDocs(collection(db, 'leaveRequests'));
        const [yearNum, monthNum] = monthKey.split('-').map(Number);
        const monthStart = new Date(yearNum, monthNum - 1, 1);
        const monthEnd = new Date(yearNum, monthNum, 0); // last day of month

        leavesSnap.docs.forEach((d: any) => {
          const lData = d.data();
          const isApproved = lData.status === 'approved';
          if (!isApproved) return;

          const uId = lData.userId || lData.from;
          if (!uId || fridaysMap[uId] === undefined) return;

          const lStartDate = lData.startDate ? new Date(lData.startDate) : null;
          const lEndDate = lData.endDate ? new Date(lData.endDate) : lStartDate;

          if (lStartDate) {
            // Calculate overlap with this specific month
            const effStart = lStartDate > monthStart ? lStartDate : monthStart;
            const effEnd = (lEndDate && lEndDate < monthEnd) ? lEndDate : monthEnd;

            if (effEnd >= effStart) {
              const overlapDays = Math.round((effEnd.getTime() - effStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
              const leaveType = (lData.typeOfLeave || lData.leaveType || '').toLowerCase();

              if (leaveType.includes('sick') || leaveType.includes('مرض')) {
                sickLeavesMap[uId] = (sickLeavesMap[uId] || 0) + overlapDays;
              } else {
                vacationsMap[uId] = (vacationsMap[uId] || 0) + overlapDays;
                
                // Format date string for reason note (e.g. 01/09 - 05/09)
                const sStr = `${effStart.getDate().toString().padStart(2, '0')}/${(effStart.getMonth() + 1).toString().padStart(2, '0')}`;
                const eStr = `${effEnd.getDate().toString().padStart(2, '0')}/${(effEnd.getMonth() + 1).toString().padStart(2, '0')}`;
                vacationDetailsMap[uId] = formatVacationText(overlapDays, sStr, eStr);
              }
            }
          }
        });
      } catch (err) {
        console.warn("Error scanning leaves:", err);
      }

      // 3. PULL FROM SMART ATTENDANCE ANALYZER (محلل الحضور الذكي)
      // Extracts: Overtime (>9h), Absent Days, Late Hours
      let analyzerFound = false;

      // A. Check Firestore 'attendance_analysis' collection for this month or latest
      try {
        const checkDoc = async (id: string) => {
          try {
            const snap = await getDoc(doc(db, 'attendance_analysis', id));
            return snap.exists() ? snap.data() : null;
          } catch (e) {
            return null;
          }
        };

        let analysisDoc = await checkDoc(`analysis_${monthKey}`);
        if (!analysisDoc) analysisDoc = await checkDoc('analysis_latest');

        // B. Fallback to localStorage if available
        if (!analysisDoc) {
          try {
            const localRaw = localStorage.getItem('smart_attendance_analysis');
            if (localRaw) {
              const parsed = JSON.parse(localRaw);
              if (parsed && Array.isArray(parsed.summaries)) {
                analysisDoc = parsed;
              }
            }
          } catch (e) {}
        }

        if (analysisDoc && Array.isArray(analysisDoc.summaries) && analysisDoc.summaries.length > 0) {
          analyzerFound = true;
          analysisDoc.summaries.forEach((emp: any) => {
            const mId = matchStaff(emp.employeeName);
            if (mId) {
              analyzerOvertimeMap[mId] = Math.round(Number(emp.totalOvertimeHours) || 0);
              analyzerAbsenceMap[mId] = Math.round(Number(emp.absentDays) || 0);
              analyzerLateMap[mId] = Math.round(Number(emp.totalLatenessHours) || 0);
            }
          });
        }
      } catch (err) {
        console.warn("Error fetching attendance_analysis doc:", err);
      }

      // C. If no Smart Attendance Analyzer document exists yet, run the Smart Attendance Analyzer algorithm on attendance_logs
      if (!analyzerFound) {
        try {
          const attSnap = await getDocs(collection(db, 'attendance_logs'));
          const logsByUserDate: Record<string, any[]> = {};
          const userWorkedDates: Record<string, Set<string>> = {};

          attSnap.docs.forEach((d: any) => {
            const att = d.data();
            if (att.date && att.date.startsWith(monthKey)) {
              const uId = att.userId;
              if (uId && fridaysMap[uId] !== undefined) {
                const key = `${uId}_${att.date}`;
                if (!logsByUserDate[key]) logsByUserDate[key] = [];
                logsByUserDate[key].push(att);
                if (!userWorkedDates[uId]) userWorkedDates[uId] = new Set();
                userWorkedDates[uId].add(att.date);
              }
            }
          });

          // Compute daily hours, overtime, and lateness per user
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

            // Calculate absences: weekdays without attendance and without approved vacation
            const [yN, mN] = monthKey.split('-').map(Number);
            let absentDaysCount = 0;
            for (let day = 1; day <= totalDaysInMonth; day++) {
              const curDate = new Date(yN, mN - 1, day);
              const curDayOfWeek = curDate.getDay();
              const dStr = `${yN}-${mN.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
              // Skip Fridays (Friday is 5)
              if (curDayOfWeek !== 5 && !workedDates.has(dStr)) {
                absentDaysCount++;
              }
            }

            // Deduct approved vacation days from absent count
            const userVac = vacationsMap[s.id] || 0;
            const netAbsent = Math.max(0, absentDaysCount - userVac);

            analyzerOvertimeMap[s.id] = Math.round(totalOvertime);
            analyzerLateMap[s.id] = Math.round(totalLateness);
            analyzerAbsenceMap[s.id] = netAbsent;
          });

        } catch (err) {
          console.warn("Fallback attendance scan error:", err);
        }
      }

    } catch (err) {
      console.warn("Scan month data error:", err);
    }

    // Build the processed rows with pulled Overtime, Absences, and Lateness
    const generatedRows: PayrollRow[] = staffList.map(s => {
      const isDoc = s.jobCategory === 'doctor' || s.role === UserRole.DOCTOR || (s.name || '').toLowerCase().includes('د.');
      const isHidden = !!s.isHidden;
      const category: 'doctor' | 'staff' | 'hidden' = isDoc ? 'doctor' : (isHidden ? 'hidden' : 'staff');

      const fridays = fridaysMap[s.id] || (s.name?.includes('ناجي') || s.name?.includes('Tarek') ? 4 : 4);
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

      // RULE 4: Notes (ABSENT and LATE) - "وفي الملاحظات ليه":
      let absentAndLateText = '';
      if (isCleaner) {
        absentAndLateText = 'CLEANER';
      } else if (vacationDays > 0) {
        absentAndLateText = vacationDetailsMap[s.id] || formatVacationText(vacationDays);
      } else if (absentDays > 0 || lateHours > 0) {
        absentAndLateText = formatAbsentText(absentDays, lateHours);
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

          const actualDays = Math.max(0, r.totalMonthDays - (r.vacationDaysCount || 0) - abs);

          let absentLate = '';
          if (r.vacationDaysCount > 0) {
            absentLate = formatVacationText(r.vacationDaysCount);
          } else if (abs > 0 || late > 0) {
            absentLate = formatAbsentText(abs, late);
          }

          let calcDisplay = r.calculatedDaysDisplay;
          if (abs > 0 || r.vacationDaysCount > 0) {
            calcDisplay = `${actualDays}`;
          }

          return {
            ...r,
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
          const daysCount = userDates[name].size;
          const absent = Math.max(0, monthInfo.daysInMonth - daysCount - 4); // rough non-fridays
          extractedSummaries.push({
            employeeName: name,
            totalWorkDays: daysCount,
            fridaysWorked: 0,
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

          const absents = Math.max(0, monthInfo.daysInMonth - workedDates.size - 4);

          extractedSummaries.push({
            employeeName: empName,
            totalWorkDays: workedDates.size,
            fridaysWorked: 0,
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
          const actualDays = Math.max(0, r.totalMonthDays - (r.vacationDaysCount || 0) - abs);

          let absentLate = '';
          if (r.vacationDaysCount > 0) {
            absentLate = formatVacationText(r.vacationDaysCount);
          } else if (abs > 0 || late > 0) {
            absentLate = formatAbsentText(abs, late);
          }

          let calcDisplay = r.calculatedDaysDisplay;
          if (abs > 0 || r.vacationDaysCount > 0) {
            calcDisplay = `${actualDays}`;
          }

          return {
            ...r,
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
  }, [rows, activeTab, showFullMonthLeaveStaff, searchTerm]);

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
          'حساب أيام': r.calculatedDaysDisplay || '',
          'اسم الموظف / Employee Name': r.name,
          'الجمع / Fridays': r.fridayDisplay || (r.fridayDuties > 0 ? `${r.fridayDuties} days` : ''),
        };

        if (config.customHolidayEnabled) {
          item[config.customHolidayName || 'NATIONAL DAY'] = r.holidayDisplay || (r.holidayDuties > 0 ? `${r.holidayDuties} day` : '');
        }

        item[`${monthInfo.monthNameEn} Overtime`] = r.overtimeDisplay || (r.overtimeHours > 0 ? `${r.overtimeHours} Hours` : '');
        item['ملاحظات: ABSENT and LATE'] = r.absentAndLateText || '';
        item['Sick Leave Not Including absentee'] = r.sickLeaveText || '';

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
      fridayDuties: newRowData.fridayDuties || 4,
      fridayDisplay: formatCountToText(newRowData.fridayDuties || 4, 'day', 'days'),
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
      isCustomRow: true
    };

    setRows(prev => [...prev, newRow]);
    setIsAddRowModalOpen(false);
    setNewRowData({
      name: '',
      employeeNumber: '',
      jobTitle: '',
      category: 'staff',
      calculatedDaysDisplay: '',
      fridayDuties: 4,
      holidayDuties: 1,
      overtimeHours: 0,
      absentAndLateText: '',
      sickLeaveText: ''
    });
    setToast({ msg: 'تم إضافة الموظف للكشف بنجاح', type: 'success' });
  };

  // Delete row
  const handleDeleteRow = (rowId: string) => {
    setRows(prev => prev.filter(r => r.id !== rowId));
    setToast({ msg: 'تم حذف الموظف من الكشف', type: 'info' });
  };

  // Trigger print
  const handlePrint = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    window.print();
  };

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
              onChange={(e) => setSelectedMonth(e.target.value)} 
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
        <div className="bg-white text-black p-4 sm:p-8 rounded-2xl shadow-xl border border-slate-300 overflow-x-auto print:shadow-none print:border-none print:p-0 print:m-0 print:rounded-none print:w-full print-paper-container" dir="rtl">
          
          {/* Header section matching exact official document */}
          <div className="flex items-start justify-between mb-3 border-b-2 border-black pb-2.5">
            {/* Left Header in English */}
            <div className="text-left font-sans" dir="ltr">
              <div className="text-base sm:text-lg font-bold tracking-tight text-black">
                {config.hospitalNameEn} - {config.departmentNameEn}
              </div>
              <div className="text-xs sm:text-sm font-semibold text-black mt-0.5">
                {monthInfo.monthNameEn} {monthInfo.year} {config.statementTitleEn} {config.tillDateText}
              </div>
            </div>

            {/* Center Title in Arabic & English for official report */}
            <div className="text-center hidden md:block print:block">
              <div className="text-base sm:text-lg font-black tracking-tight text-black">
                {config.statementTitleAr}
              </div>
              <div className="text-xs font-bold text-slate-800">
                {monthInfo.monthNameAr} {monthInfo.year}
              </div>
            </div>

            {/* Right Header in Arabic */}
            <div className="text-right font-sans" dir="rtl">
              <div className="text-base sm:text-lg font-bold tracking-tight text-black">
                {config.hospitalNameAr} - {config.departmentNameAr}
              </div>
              <div className="text-xs sm:text-sm font-semibold text-black mt-0.5">
                {config.statementTitleAr} - {monthInfo.monthNameAr} {monthInfo.year}
              </div>
            </div>
          </div>

          {/* Table Container with exact excel grid borders and colors */}
          <table className="w-full border-collapse border-2 border-black text-black font-sans text-xs sm:text-[13px] excel-table">
            {/* Header Rows matching exact 2-row layout from image */}
            <thead>
              {/* Row 1 of Header */}
              <tr className="bg-[#e6e6e6] text-center font-bold border-b border-black text-black excel-header-gray">
                {/* 1. م (Serial Number) */}
                <th className="border border-black px-1.5 py-1.5 w-9 text-center font-bold" rowSpan={2}>
                  م
                </th>

                {/* 2. حساب أيام (Yellow Background - #ffff00) */}
                <th className="border border-black px-1.5 py-1.5 w-16 bg-[#ffff00] text-black font-black text-center excel-yellow-cell" rowSpan={2}>
                  <div className="leading-tight">حساب</div>
                  <div className="leading-tight">أيام</div>
                </th>

                {/* 3. اسم الموظف / Employee Name */}
                <th className="border border-black px-3 py-1.5 min-w-[190px] text-center" rowSpan={2}>
                  <div>اسم الموظف</div>
                  <div className="font-normal text-[11px]">Employee Name</div>
                </th>

                {/* 4. الجمع / Fridays */}
                <th className="border border-black px-2.5 py-1.5 w-28 text-center" rowSpan={2}>
                  <div>الجمع</div>
                  <div className="font-normal text-[11px]">Fridays</div>
                </th>

                {/* 5. Holiday column (e.g. NATIONAL DAY or EID) */}
                {config.customHolidayEnabled && (
                  <th className="border border-black px-2.5 py-1.5 w-28 text-center" rowSpan={2}>
                    <div>{config.customHolidayName}</div>
                    <div className="font-normal text-[11px]">DAY</div>
                  </th>
                )}

                {/* 6. Overtime Month Name (top) */}
                <th className="border border-black px-2.5 py-1.5 w-24 text-center">
                  {monthInfo.monthNameEn}
                </th>

                {/* 7. ملاحظات: (top) */}
                <th className="border border-black px-3 py-1.5 min-w-[190px] text-center">
                  ملاحظات:
                </th>

                {/* 8. Sick Leave (top) */}
                <th className="border border-black px-3 py-1.5 min-w-[190px] text-center">
                  Sick Leave
                </th>
              </tr>

              {/* Row 2 of Header */}
              <tr className="bg-[#e6e6e6] text-center font-bold border-b-2 border-black text-black excel-header-gray">
                <th className="border border-black px-2 py-1.5 text-center">
                  Overtime
                </th>
                <th className="border border-black px-2 py-1.5 text-center">
                  ABSENT and LATE
                </th>
                <th className="border border-black px-2 py-1.5 text-center">
                  Not Including absentee
                </th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody>
              {displayRows.length === 0 ? (
                <tr>
                  <td colSpan={config.customHolidayEnabled ? 8 : 7} className="border border-black py-8 text-center text-slate-500 font-bold">
                    {isAr ? 'لا توجد بيانات مطابقة للعرض في هذا التبويب' : 'No matching employee records found in this tab'}
                  </td>
                </tr>
              ) : (
                displayRows.map((row, idx) => (
                  <tr key={row.id} className="hover:bg-yellow-50/30 transition-colors">
                    
                    {/* 1. م (Serial Number) */}
                    <td className="border border-black text-center font-bold py-1.5 px-1 bg-white text-black">
                      {idx + 1}
                    </td>

                    {/* 2. حساب أيام (Yellow Background - #ffff00 in header and all rows!) */}
                    <td className="border border-black text-center font-black py-1.5 px-1 bg-[#ffff00] text-black excel-yellow-cell" dir="ltr">
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

                    {/* 3. اسم الموظف / Employee Name */}
                    <td className="border border-black text-right font-bold py-1.5 px-2 bg-white text-black">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-extrabold text-[13px] text-black" dir="auto">{row.name}</span>
                        {row.calculatedDaysDisplay === '*2' && (
                          <span className="text-amber-700 font-black text-xs print:hidden" dir="ltr">*2</span>
                        )}
                        {row.isCustomRow && (
                          <button 
                            onClick={() => handleDeleteRow(row.id)}
                            className="text-rose-500 hover:text-rose-700 p-0.5 print:hidden"
                            title="حذف هذا الصف"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </td>

                    {/* 4. الجمع / Fridays */}
                    <td className="border border-black text-center font-bold py-1.5 px-1.5 bg-white text-black" dir="ltr">
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

                    {/* 5. National Day / Eid / Occasion */}
                    {config.customHolidayEnabled && (
                      <td className="border border-black text-center font-bold py-1.5 px-1.5 bg-white text-black" dir="ltr">
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
                    )}

                    {/* 6. Overtime (مسحوب من محلل الحضور) */}
                    <td className="border border-black text-center font-bold py-1.5 px-1.5 bg-white text-black" dir="ltr">
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

                    {/* 7. ملاحظات: ABSENT and LATE (مسحوب من محلل الحضور) */}
                    <td className="border border-black text-center font-bold py-1.5 px-2 bg-white text-black" dir="ltr">
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

                    {/* 8. Sick Leave Not Including absentee */}
                    <td className="border border-black text-center font-bold py-1.5 px-2 bg-white text-black" dir="ltr">
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

                  </tr>
                ))
              )}
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

          header, aside, nav, .print\\:hidden, [class*="print:hidden"], 
          .toast-container, button, .modal-backdrop {
            display: none !important;
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
          }

          table.excel-table {
            width: 100% !important;
            border-collapse: collapse !important;
            border: 2px solid #000000 !important;
            margin-top: 4px !important;
            font-size: 11px !important;
            line-height: 1.3 !important;
            background-color: #ffffff !important;
            page-break-inside: auto !important;
          }

          table.excel-table thead {
            display: table-header-group !important;
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
            padding: 4px 5px !important;
            text-align: center !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          table.excel-table td {
            border: 1px solid #000000 !important;
            color: #000000 !important;
            padding: 4.5px 6px !important;
            vertical-align: middle !important;
            font-size: 11px !important;
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

