import React, { useState } from 'react';
import { DeviceItem, getDeviceOverallStatus, getModalityTheme, getDaysRemaining } from './deviceTypes';
import { DeviceVisualBadge } from './DeviceVisualBadge';

interface DeviceCardProps {
  device: DeviceItem;
  onViewDetails: (device: DeviceItem) => void;
  onEdit: (device: DeviceItem) => void;
  onDelete: (id: string) => void;
  isAr: boolean;
}

export const DeviceCard: React.FC<DeviceCardProps> = ({
  device,
  onViewDetails,
  onEdit,
  onDelete,
  isAr,
}) => {
  const [copied, setCopied] = useState(false);
  const status = getDeviceOverallStatus(device);
  const theme = getModalityTheme(device.category);
  const ppmDays = getDaysRemaining(device.maintDate);

  const handleCopySerial = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (device.serial) {
      navigator.clipboard.writeText(device.serial);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  // PPM health percentage (assuming 180-day cycle for relative visual gauge)
  const getPpmHealthPercent = () => {
    if (ppmDays === null) return 0;
    if (ppmDays <= 0) return 0;
    return Math.min(100, Math.round((ppmDays / 180) * 100));
  };

  const healthPercent = getPpmHealthPercent();

  return (
    <div
      onClick={() => onViewDetails(device)}
      className="group relative bg-white dark:bg-slate-900 rounded-[2rem] p-2 shadow-sm hover:shadow-2xl hover:-translate-y-2.5 transition-all duration-300 border border-slate-100 dark:border-slate-800 flex flex-col cursor-pointer overflow-hidden"
    >
      {/* Top Decorative Ambient Accent */}
      <div className={`absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r ${theme.gradient} opacity-80 group-hover:opacity-100 transition-opacity`} />

      {/* Visual Image Header */}
      <div className="h-44 w-full relative rounded-[1.6rem] overflow-hidden bg-slate-900 shadow-inner">
        <DeviceVisualBadge device={device} />

        {/* Floating Quick Action Buttons */}
        <div
          className="absolute top-3 right-3 flex items-center gap-1.5 z-20 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-[-6px] group-hover:translate-y-0"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => onEdit(device)}
            className="w-8 h-8 rounded-full bg-white/90 dark:bg-slate-800/90 backdrop-blur-md text-blue-600 dark:text-blue-400 shadow-md hover:bg-blue-600 hover:text-white flex items-center justify-center text-xs transition-colors"
            title={isAr ? 'تعديل الجهاز' : 'Edit device'}
          >
            <i className="fas fa-pen"></i>
          </button>
          <button
            onClick={() => onDelete(device.id)}
            className="w-8 h-8 rounded-full bg-white/90 dark:bg-slate-800/90 backdrop-blur-md text-rose-500 shadow-md hover:bg-rose-500 hover:text-white flex items-center justify-center text-xs transition-colors"
            title={isAr ? 'حذف الجهاز' : 'Delete device'}
          >
            <i className="fas fa-trash"></i>
          </button>
        </div>

        {/* Status Capsule Indicator */}
        <div className="absolute top-3 left-3 z-10 pointer-events-none">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black tracking-wider uppercase border backdrop-blur-md shadow-md ${status.badgeClass}`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                status.level === 3 ? 'bg-white animate-ping' : status.level === 2 ? 'bg-white animate-pulse' : 'bg-emerald-200'
              }`}
            />
            <i className={`fas ${status.icon} text-[10px]`}></i>
            <span>{isAr ? status.textAr : status.textEn}</span>
          </span>
        </div>

        {/* Modality Category Ribbon */}
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between z-10 pointer-events-none">
          <span className="px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md border border-white/20 text-white text-[11px] font-bold flex items-center gap-1.5 shadow-sm">
            <i className={`fas ${theme.icon} text-[11px] text-cyan-300`}></i>
            {device.category || 'General'}
          </span>

          {device.enableQA && (
            <span className="px-2 py-0.5 rounded-md bg-purple-950/70 backdrop-blur-md border border-purple-400/40 text-purple-200 text-[10px] font-mono font-bold flex items-center gap-1">
              <i className="fas fa-certificate text-[9px] text-purple-300"></i>
              QC ON
            </span>
          )}
        </div>
      </div>

      {/* Card Information Body */}
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          {/* Machine Name */}
          <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight leading-snug mb-1.5 group-hover:text-blue-600 dark:group-hover:text-cyan-400 transition-colors line-clamp-1">
            {device.name}
          </h3>

          {/* Serial Number & Install Year */}
          <div className="flex items-center justify-between gap-2 mb-3.5">
            <button
              onClick={handleCopySerial}
              className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:text-blue-600 dark:hover:text-blue-300 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 transition-all"
              title={isAr ? 'انقر لنسخ الرقم التسلسلي' : 'Click to copy SN'}
            >
              <i className={`fas ${copied ? 'fa-check text-emerald-500' : 'fa-barcode text-slate-400'}`}></i>
              <span>{device.serial ? `SN: ${device.serial}` : (isAr ? 'بدون سيريال' : 'No SN')}</span>
              {copied && <span className="text-[9px] text-emerald-600 font-bold">({isAr ? 'تم' : 'Copied'})</span>}
            </button>

            {device.installDate && (
              <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                <i className="fas fa-calendar-day text-[10px]"></i>
                {device.installDate.slice(0, 7)}
              </span>
            )}
          </div>
        </div>

        {/* Maintenance Telemetry Bar */}
        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <i className="fas fa-tools text-blue-500 text-xs"></i>
              {isAr ? 'الصيانة الوقائية PPM' : 'PPM Schedule'}
            </span>
            <span
              className={`font-black text-[11px] ${
                ppmDays === null
                  ? 'text-slate-400'
                  : ppmDays <= 0
                  ? 'text-rose-600 dark:text-rose-400 animate-pulse'
                  : ppmDays <= 30
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {ppmDays === null
                ? (isAr ? 'غير مسجل' : 'N/A')
                : ppmDays <= 0
                ? (isAr ? `منتهية (${Math.abs(ppmDays)}d)` : `Overdue (${Math.abs(ppmDays)}d)`)
                : (isAr ? `باقي ${ppmDays} يوم` : `${ppmDays} days left`)}
            </span>
          </div>

          {/* Micro Progress Line */}
          <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                ppmDays === null
                  ? 'w-0'
                  : ppmDays <= 0
                  ? 'w-full bg-rose-500'
                  : ppmDays <= 30
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
              style={{ width: ppmDays !== null && ppmDays > 0 ? `${healthPercent}%` : ppmDays !== null ? '100%' : '0%' }}
            />
          </div>
        </div>

        {/* Card Footer Actions */}
        <div className="mt-3.5 pt-2 flex items-center justify-between gap-2">
          {/* PPM PDF link if available */}
          {device.maintUrl ? (
            <a
              href={device.maintUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="px-2.5 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 text-[11px] font-bold flex items-center gap-1.5 transition-colors"
              title={isAr ? 'عرض تقرير الصيانة' : 'View PPM report'}
            >
              <i className="fas fa-file-pdf text-red-500"></i>
              <span>PDF</span>
            </a>
          ) : (
            <span className="text-[10px] text-slate-300 dark:text-slate-600 italic">
              {isAr ? 'لا يوجد تقرير' : 'No PDF'}
            </span>
          )}

          {/* Inspect & QR button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails(device);
            }}
            className="flex-1 py-1.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm group-hover:bg-blue-600 group-hover:text-white"
          >
            <i className="fas fa-qrcode text-xs"></i>
            <span>{isAr ? 'الفحص و QR' : 'Pass & QR'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
