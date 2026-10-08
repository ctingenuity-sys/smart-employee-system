import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { DeviceItem, getDeviceOverallStatus, getModalityTheme, getDaysRemaining, getDeviceComplianceStatus } from './deviceTypes';
import { DeviceVisualBadge } from './DeviceVisualBadge';
import { DeviceStickerModal } from './DeviceStickerModal';
import { openDocumentUrl } from '../../services/storageClient';

interface DeviceDetailsModalProps {
  device: DeviceItem;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (device: DeviceItem) => void;
  isAr: boolean;
}

export const DeviceDetailsModal: React.FC<DeviceDetailsModalProps> = ({
  device,
  isOpen,
  onClose,
  onEdit,
  isAr,
}) => {
  const [copiedSerial, setCopiedSerial] = useState(false);
  const [isStickerModalOpen, setIsStickerModalOpen] = useState(false);

  if (!isOpen) return null;

  const status = getDeviceOverallStatus(device);
  const compliance = getDeviceComplianceStatus(device);
  const theme = getModalityTheme(device.category);
  const ppmDays = getDaysRemaining(device.maintDate);
  const qcDays = getDaysRemaining(device.qualDate);

  const [qrUrl, setQrUrl] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    const generateQr = async () => {
      try {
        const origin = typeof window !== 'undefined' && window.location.origin ? window.location.origin : '';
        const payload = device.id && origin
          ? `${origin}/#/public/device/${encodeURIComponent(device.id)}`
          : `DEVICE:${device.name || 'Medical Device'} | SN:${device.serial || 'N/A'} | CAT:${device.category || ''} | PPM:${device.maintDate || 'N/A'}`;

        const dataUrl = await QRCode.toDataURL(payload, {
          width: 200,
          margin: 1,
          errorCorrectionLevel: 'M',
          color: {
            dark: '#1e293b',
            light: '#ffffff',
          },
        });
        if (isMounted) setQrUrl(dataUrl);
      } catch (err) {
        console.warn('QR code generation notice:', err);
        try {
          const fallback = await QRCode.toDataURL(`DEVICE:${device.name || 'ASSET'}`, { width: 200, margin: 1 });
          if (isMounted) setQrUrl(fallback);
        } catch (e2) {}
      }
    };
    generateQr();
    return () => {
      isMounted = false;
    };
  }, [device]);

  const copySerial = () => {
    if (device.serial) {
      navigator.clipboard.writeText(device.serial);
      setCopiedSerial(true);
      setTimeout(() => setCopiedSerial(false), 2000);
    }
  };

  const calculateDeviceAge = (installDateStr?: string) => {
    if (!installDateStr) return isAr ? 'غير مسجل' : 'Not recorded';
    const installDate = new Date(installDateStr);
    if (isNaN(installDate.getTime())) return isAr ? 'غير مسجل' : 'Not recorded';
    const today = new Date();
    const diffMonths = (today.getFullYear() - installDate.getFullYear()) * 12 + (today.getMonth() - installDate.getMonth());
    const years = Math.floor(diffMonths / 12);
    const months = diffMonths % 12;
    if (years > 0) {
      return isAr
        ? `${years} ${years > 1 ? 'سنوات' : 'سنة'}${months > 0 ? ` و ${months} أشهر` : ''}`
        : `${years} yr${years > 1 ? 's' : ''}${months > 0 ? ` ${months} mo` : ''}`;
    }
    return isAr ? `${months} أشهر في الخدمة` : `${months} months in service`;
  };

  const handlePrintLabel = () => {
    setIsStickerModalOpen(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div 
        className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-[2rem] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[92vh] flex flex-col transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Visual Banner */}
        <div className="relative h-48 md:h-56 w-full bg-slate-900 overflow-hidden">
          <DeviceVisualBadge device={device} isDetailed className="h-full w-full" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md text-white flex items-center justify-center transition-all z-20 border border-white/20"
          >
            <i className="fas fa-times text-sm"></i>
          </button>

          {/* Status Capsule */}
          <div className="absolute top-4 left-4 z-20">
            <span className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-black border backdrop-blur-md shadow-lg ${status.badgeClass}`}>
              <i className={`fas ${status.icon}`}></i>
              {isAr ? status.textAr : status.textEn}
            </span>
          </div>

          {/* Machine identity strip */}
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent p-4 md:p-6 z-10 flex flex-col md:flex-row md:items-end justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-black px-2.5 py-0.5 rounded-md ${theme.badgeBg}`}>
                  {isAr ? theme.nameAr : theme.name}
                </span>
                <span className="text-slate-300 text-xs font-mono bg-white/10 backdrop-blur-sm px-2 py-0.5 rounded border border-white/15">
                  ID: #{device.id.slice(-6).toUpperCase()}
                </span>
              </div>
              <h2 className="text-xl md:text-2xl font-black text-white drop-shadow-md">
                {device.name}
              </h2>
            </div>
            
            {/* Serial copy badge */}
            <div className="flex items-center gap-2">
              <button
                onClick={copySerial}
                className="group flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 backdrop-blur-md text-white text-xs font-mono transition-all"
                title={isAr ? 'انقر لنسخ الرقم التسلسلي' : 'Click to copy serial number'}
              >
                <i className={`fas ${copiedSerial ? 'fa-check text-emerald-400' : 'fa-copy text-cyan-300'}`}></i>
                <span>{device.serial || 'SN: N/A'}</span>
                <span className="text-[10px] text-cyan-200">
                  {copiedSerial ? (isAr ? 'تم النسخ!' : 'Copied!') : (isAr ? 'نسخ' : 'Copy')}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Main Grid: Technical Specs & QR Pass */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Left 2 Cols: Technical Dossier */}
            <div className="md:col-span-2 space-y-4">
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                <i className="fas fa-microchip text-blue-600"></i>
                {isAr ? 'المواصفات الفنية وتاريخ التثبيت' : 'Technical Specs & Installation'}
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] font-bold text-slate-400 uppercase block mb-1">
                    {isAr ? 'رقم / موقع الغرفة' : 'Room Number'}
                  </span>
                  <div className="flex items-center gap-2 text-sm font-black text-sky-600 dark:text-sky-400">
                    <i className="fas fa-door-open text-xs"></i>
                    {device.roomNumber || device.room || (isAr ? 'غير مسجل' : 'Not set')}
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] font-bold text-slate-400 uppercase block mb-1">
                    {isAr ? 'تاريخ التوريد والتركيب' : 'Install Date'}
                  </span>
                  <div className="flex items-center gap-2 text-sm font-black text-slate-800 dark:text-white">
                    <i className="fas fa-calendar-alt text-blue-500 text-xs"></i>
                    {device.installDate || (isAr ? 'غير محدد' : 'Not set')}
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] font-bold text-slate-400 uppercase block mb-1">
                    {isAr ? 'عمر الجهاز بالخدمة' : 'Service Lifespan'}
                  </span>
                  <div className="flex items-center gap-2 text-sm font-black text-slate-800 dark:text-white">
                    <i className="fas fa-history text-indigo-500 text-xs"></i>
                    {calculateDeviceAge(device.installDate)}
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] font-bold text-slate-400 uppercase block mb-1">
                    {isAr ? 'القسم المسؤول' : 'Department'}
                  </span>
                  <div className="flex items-center gap-2 text-sm font-black text-slate-800 dark:text-white">
                    <i className="fas fa-hospital text-teal-500 text-xs"></i>
                    {isAr ? 'قسم الأشعة والتصوير الطبي' : 'Radiology & Medical Imaging'}
                  </div>
                </div>

                <div className={`p-4 rounded-2xl border sm:col-span-2 transition-all ${
                  compliance.status === 'EXPIRED'
                    ? 'bg-rose-50/80 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50'
                    : compliance.status === 'WARNING'
                    ? 'bg-amber-50/80 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50'
                    : compliance.status === 'NA'
                    ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800'
                    : 'bg-emerald-50/80 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50'
                }`}>
                  <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                    <span className="text-[11px] font-bold text-slate-400 uppercase">
                      {isAr ? 'حالة التفتيش والامتثال الدوري' : 'Inspection & Compliance Status'}
                    </span>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-black px-2.5 py-0.5 rounded-full border ${compliance.badgeClass}`}>
                      <i className={`fas ${compliance.icon} text-xs`}></i>
                      <span>{isAr ? compliance.titleAr : compliance.titleEn}</span>
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <p className={`text-xs font-semibold leading-relaxed ${compliance.textColor}`}>
                      {isAr ? compliance.summaryAr : compliance.summaryEn}
                    </p>
                  </div>
                </div>
              </div>

              {/* Maintenance & Quality Blocks */}
              <div className="space-y-3 pt-2">
                {/* PPM Card */}
                <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50/80 to-cyan-50/50 dark:from-blue-950/20 dark:to-cyan-950/10 border border-blue-100 dark:border-blue-900/50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center text-xs shadow-md shadow-blue-500/20">
                        <i className="fas fa-tools"></i>
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-blue-950 dark:text-blue-200 uppercase">
                          {isAr ? 'الصيانة الوقائية الدورية (PPM)' : 'Preventive Maintenance (PPM)'}
                        </h4>
                        <span className="text-[10px] text-blue-700 dark:text-blue-300">
                          {device.maintDate ? `${isAr ? 'تاريخ الانتهاء' : 'Due'}: ${device.maintDate}` : (isAr ? 'لم يحدد موعد' : 'No date specified')}
                        </span>
                      </div>
                    </div>
                    {ppmDays !== null && (
                      <span className={`text-[11px] font-black px-2.5 py-1 rounded-full ${
                        ppmDays <= 0 ? 'bg-rose-500 text-white' : ppmDays <= 30 ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'
                      }`}>
                        {ppmDays <= 0
                          ? (isAr ? `منتهي منذ ${Math.abs(ppmDays)} يوم` : `Overdue by ${Math.abs(ppmDays)}d`)
                          : (isAr ? `باقي ${ppmDays} يوم` : `${ppmDays} days left`)}
                      </span>
                    )}
                  </div>
                  {device.maintUrl ? (
                    <button
                      type="button"
                      onClick={() => openDocumentUrl(device.maintUrl!)}
                      className="inline-flex items-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-800 shadow-sm mt-1 transition-colors"
                    >
                      <i className="fas fa-file-pdf text-red-500"></i>
                      <span>{isAr ? 'عرض تقرير الصيانة المعتمد (PDF)' : 'View Certified PPM Report (PDF)'}</span>
                      <i className="fas fa-external-link-alt text-[10px]"></i>
                    </button>
                  ) : (
                    <p className="text-[11px] text-slate-400 italic">
                      {isAr ? 'لا يوجد ملف تقرير مرفق حالياً' : 'No report attached'}
                    </p>
                  )}
                </div>

                {/* QC Card */}
                {device.enableQA && (
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-50/80 to-fuchsia-50/50 dark:from-purple-950/20 dark:to-fuchsia-950/10 border border-purple-100 dark:border-purple-900/50">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center text-xs shadow-md shadow-purple-500/20">
                          <i className="fas fa-certificate"></i>
                        </div>
                        <div>
                          <h4 className="text-xs font-black text-purple-950 dark:text-purple-200 uppercase">
                            {isAr ? 'معايير ضبط الجودة (Quality Control - QC)' : 'Quality Control (QC)'}
                          </h4>
                          <span className="text-[10px] text-purple-700 dark:text-purple-300">
                            {device.qualDate ? `${isAr ? 'تاريخ الانتهاء' : 'Due'}: ${device.qualDate}` : (isAr ? 'لم يحدد موعد' : 'No date specified')}
                          </span>
                        </div>
                      </div>
                      {qcDays !== null && (
                        <span className={`text-[11px] font-black px-2.5 py-1 rounded-full ${
                          qcDays <= 0 ? 'bg-rose-500 text-white' : qcDays <= 30 ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'
                        }`}>
                          {qcDays <= 0
                            ? (isAr ? `منتهي منذ ${Math.abs(qcDays)} يوم` : `Overdue by ${Math.abs(qcDays)}d`)
                            : (isAr ? `باقي ${qcDays} يوم` : `${qcDays} days left`)}
                        </span>
                      )}
                    </div>
                    {device.qualUrl ? (
                      <button
                        type="button"
                        onClick={() => openDocumentUrl(device.qualUrl!)}
                        className="inline-flex items-center gap-2 text-xs font-bold text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-purple-200 dark:border-purple-800 shadow-sm mt-1 transition-colors"
                      >
                        <i className="fas fa-file-pdf text-red-500"></i>
                        <span>{isAr ? 'عرض شهادة المعايرة والجودة (PDF)' : 'View Calibration Certificate (PDF)'}</span>
                        <i className="fas fa-external-link-alt text-[10px]"></i>
                      </button>
                    ) : (
                      <p className="text-[11px] text-slate-400 italic">
                        {isAr ? 'لا توجد شهادة جودة مرفقة حالياً' : 'No certificate attached'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right Col: QR Asset Passport & Physical Sticker */}
            <div className="space-y-4 flex flex-col">
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                <i className="fas fa-qrcode text-purple-600"></i>
                {isAr ? 'بطاقة الأصل ورمز QR' : 'Asset Tag & QR Pass'}
              </h3>

              <div className="flex-1 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center text-center">
                <div className="p-3 bg-white rounded-2xl shadow-md border border-slate-200 mb-3">
                  <img
                    src={qrUrl}
                    alt="Device QR Code"
                    className="w-36 h-36 object-contain"
                  />
                </div>
                <span className="text-xs font-black text-slate-700 dark:text-slate-200">
                  {device.serial || 'DEVICE-PASS'}
                </span>
                <p className="text-[10px] text-slate-400 mt-1 max-w-[200px]">
                  {isAr
                    ? 'امسح الرمز بواسطة هاتف المهندس الفني لعرض بيانات الجهاز وملفات الصيانة فوراً'
                    : 'Scan with mobile camera to instantly review specs and maintenance logs on-site'}
                </p>

                <button
                  onClick={handlePrintLabel}
                  className="mt-4 w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white text-xs font-black flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 transition-all transform active:scale-95"
                >
                  <i className="fas fa-print"></i>
                  <span>{isAr ? 'طباعة ملصق الجهاز (7 سم × 5 سم)' : 'Print Equipment Label (7cm × 5cm)'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 md:p-6 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
          >
            {isAr ? 'إغلاق' : 'Close'}
          </button>

          <button
            onClick={() => {
              onClose();
              onEdit(device);
            }}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-black text-xs hover:shadow-lg shadow-blue-500/20 flex items-center gap-2 transition-all"
          >
            <i className="fas fa-pen"></i>
            <span>{isAr ? 'تعديل بيانات الجهاز' : 'Edit Equipment'}</span>
          </button>
        </div>
      </div>

      {/* Device Sticker Print Modal (7cm x 5cm) */}
      <DeviceStickerModal
        device={device}
        isOpen={isStickerModalOpen}
        onClose={() => setIsStickerModalOpen(false)}
        isAr={isAr}
      />
    </div>
  );
};
