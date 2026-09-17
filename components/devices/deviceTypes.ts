export interface DeviceItem {
  id: string;
  name: string;
  serial: string;
  category: string;
  installDate?: string;
  image?: string;
  maintUrl?: string;
  maintDate?: string;
  qualUrl?: string;
  qualDate?: string;
  enableQA?: boolean;
  departmentId?: string | null;
  createdAt?: any;
}

export type StatusLevel = 'EXPIRED' | 'WARNING' | 'VALID' | 'NA';

export interface DeviceStatusInfo {
  level: number; // 3 = expired, 2 = warning, 1 = valid, 0 = na
  status: StatusLevel;
  badgeClass: string;
  glowClass: string;
  textAr: string;
  textEn: string;
  icon: string;
}

export const checkDateStatus = (dateStr?: string): StatusLevel => {
  if (!dateStr) return 'NA';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(dateStr);
  if (isNaN(expiry.getTime())) return 'NA';
  
  const warningDate = new Date(expiry);
  warningDate.setDate(expiry.getDate() - 30);

  if (today > expiry) return 'EXPIRED';
  if (today >= warningDate) return 'WARNING';
  return 'VALID';
};

export const getDaysRemaining = (dateStr?: string): number | null => {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(dateStr);
  if (isNaN(expiry.getTime())) return null;
  const diffTime = expiry.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

export const getDeviceOverallStatus = (dev: DeviceItem): DeviceStatusInfo => {
  const ppm = checkDateStatus(dev.maintDate);
  const qc = dev.enableQA ? checkDateStatus(dev.qualDate) : 'VALID';

  if (ppm === 'EXPIRED' || qc === 'EXPIRED') {
    return {
      level: 3,
      status: 'EXPIRED',
      badgeClass: 'bg-rose-500/90 text-white border-rose-400 shadow-rose-500/30',
      glowClass: 'ring-rose-500/30 shadow-rose-500/20',
      textAr: 'منتهي الصلاحية',
      textEn: 'OVERDUE / EXPIRED',
      icon: 'fa-exclamation-triangle',
    };
  }

  if (ppm === 'WARNING' || qc === 'WARNING') {
    return {
      level: 2,
      status: 'WARNING',
      badgeClass: 'bg-amber-500/90 text-white border-amber-400 shadow-amber-500/30',
      glowClass: 'ring-amber-500/30 shadow-amber-500/20',
      textAr: 'صيانة قريبة',
      textEn: 'DUE SOON',
      icon: 'fa-clock',
    };
  }

  if (ppm === 'NA' && (!dev.enableQA || qc === 'NA')) {
    return {
      level: 0,
      status: 'NA',
      badgeClass: 'bg-slate-500/80 text-white border-slate-400 shadow-slate-500/20',
      glowClass: 'ring-slate-500/20',
      textAr: 'غير محدد',
      textEn: 'NOT SET',
      icon: 'fa-minus-circle',
    };
  }

  return {
    level: 1,
    status: 'VALID',
    badgeClass: 'bg-emerald-500/90 text-white border-emerald-400 shadow-emerald-500/30',
    glowClass: 'ring-emerald-500/30 shadow-emerald-500/20',
    textAr: 'جاهز وسارٍ',
    textEn: 'OPERATIONAL',
    icon: 'fa-check-circle',
  };
};

export interface ModalityTheme {
  name: string;
  nameAr: string;
  gradient: string;
  badgeBg: string;
  badgeText: string;
  border: string;
  icon: string;
  accent: string;
}

export const MODALITY_THEMES: Record<string, ModalityTheme> = {
  'MRI': {
    name: 'MRI',
    nameAr: 'الرنين المغناطيسي',
    gradient: 'from-violet-600 via-purple-600 to-indigo-700',
    badgeBg: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800',
    badgeText: 'text-violet-600 dark:text-violet-400',
    border: 'border-violet-200 hover:border-violet-400',
    icon: 'fa-magnet',
    accent: '#8b5cf6',
  },
  'CT': {
    name: 'CT',
    nameAr: 'الأشعة المقطعية',
    gradient: 'from-cyan-600 via-sky-600 to-blue-700',
    badgeBg: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800',
    badgeText: 'text-cyan-600 dark:text-cyan-400',
    border: 'border-cyan-200 hover:border-cyan-400',
    icon: 'fa-circle-notch',
    accent: '#06b6d4',
  },
  'X-RAY': {
    name: 'X-Ray',
    nameAr: 'الأشعة السينية',
    gradient: 'from-emerald-600 via-teal-600 to-cyan-700',
    badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
    badgeText: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-200 hover:border-emerald-400',
    icon: 'fa-bone',
    accent: '#10b981',
  },
  'ULTRASOUND': {
    name: 'Ultrasound',
    nameAr: 'الموجات الصوتية (السونار)',
    gradient: 'from-pink-600 via-rose-600 to-red-600',
    badgeBg: 'bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950/40 dark:text-pink-300 dark:border-pink-800',
    badgeText: 'text-pink-600 dark:text-pink-400',
    border: 'border-pink-200 hover:border-pink-400',
    icon: 'fa-wave-square',
    accent: '#f43f5e',
  },
  'CATH LAB': {
    name: 'Cath Lab',
    nameAr: 'قسطرة القلب والأوعية',
    gradient: 'from-amber-500 via-orange-600 to-red-600',
    badgeBg: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
    badgeText: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-200 hover:border-amber-400',
    icon: 'fa-heartbeat',
    accent: '#f59e0b',
  },
  'C-ARM': {
    name: 'C-Arm',
    nameAr: 'قوس العمليات (C-Arm)',
    gradient: 'from-indigo-600 via-blue-600 to-slate-800',
    badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800',
    badgeText: 'text-indigo-600 dark:text-indigo-400',
    border: 'border-indigo-200 hover:border-indigo-400',
    icon: 'fa-microscope',
    accent: '#6366f1',
  },
  'MAMMOGRAM': {
    name: 'Mammogram & BMD',
    nameAr: 'فحص الثدي وكثافة العظام',
    gradient: 'from-fuchsia-600 via-pink-600 to-purple-700',
    badgeBg: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-950/40 dark:text-fuchsia-300 dark:border-fuchsia-800',
    badgeText: 'text-fuchsia-600 dark:text-fuchsia-400',
    border: 'border-fuchsia-200 hover:border-fuchsia-400',
    icon: 'fa-ribbon',
    accent: '#d946ef',
  },
  'PORTABLE': {
    name: 'Portable X-Ray',
    nameAr: 'الأشعة المتنقلة',
    gradient: 'from-teal-600 via-emerald-600 to-slate-800',
    badgeBg: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800',
    badgeText: 'text-teal-600 dark:text-teal-400',
    border: 'border-teal-200 hover:border-teal-400',
    icon: 'fa-truck-medical',
    accent: '#14b8a6',
  },
  'FLOUROSCOPY': {
    name: 'Fluoroscopy',
    nameAr: 'الفلوروسكوبي والتنظير',
    gradient: 'from-blue-600 via-indigo-600 to-cyan-700',
    badgeBg: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
    badgeText: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-200 hover:border-blue-400',
    icon: 'fa-tv',
    accent: '#3b82f6',
  },
  'DEFAULT': {
    name: 'Medical Equipment',
    nameAr: 'جهاز طبي عام',
    gradient: 'from-slate-700 via-slate-800 to-slate-950',
    badgeBg: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    badgeText: 'text-slate-600 dark:text-slate-400',
    border: 'border-slate-200 hover:border-slate-400',
    icon: 'fa-stethoscope',
    accent: '#64748b',
  },
};

export const getModalityTheme = (cat?: string): ModalityTheme => {
  if (!cat) return MODALITY_THEMES['DEFAULT'];
  const upper = cat.toUpperCase();
  for (const key of Object.keys(MODALITY_THEMES)) {
    if (key !== 'DEFAULT' && upper.includes(key)) {
      return MODALITY_THEMES[key];
    }
  }
  return MODALITY_THEMES['DEFAULT'];
};
