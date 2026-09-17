import React, { useState } from 'react';
import { DeviceItem, getDeviceOverallStatus, getModalityTheme, getDaysRemaining } from './deviceTypes';
import { DeviceVisualBadge } from './DeviceVisualBadge';

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
  const [isPrinting, setIsPrinting] = useState(false);

  if (!isOpen) return null;

  const status = getDeviceOverallStatus(device);
  const theme = getModalityTheme(device.category);
  const ppmDays = getDaysRemaining(device.maintDate);
  const qcDays = getDaysRemaining(device.qualDate);

  // Generate QR code data URL (using quick universal QR API)
  const qrData = encodeURIComponent(
    `DEVICE:${device.name || 'Medical Device'} | SN:${device.serial || 'N/A'} | CAT:${device.category || ''} | PPM:${device.maintDate || 'N/A'}`
  );
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${qrData}`;

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
    setIsPrinting(true);
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert(isAr ? 'يرجى السماح بالنوافذ المنبثقة للطباعة' : 'Please allow popups to print');
      setIsPrinting(false);
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html dir="${isAr ? 'rtl' : 'ltr'}">
        <head>
          <title>${device.name} - Asset Tag</title>
          <style>
            @page { size: 100mm 70mm; margin: 4mm; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 12px; }
            .tag-box { border: 2px solid #0284c7; border-radius: 10px; padding: 10px; display: flex; gap: 12px; align-items: center; }
            .info { flex: 1; }
            .hosp-title { font-size: 11px; font-weight: bold; color: #0369a1; text-transform: uppercase; border-bottom: 1px solid #bae6fd; padding-bottom: 4px; margin-bottom: 6px; }
            .device-name { font-size: 14px; font-weight: 900; color: #0f172a; margin-bottom: 4px; }
            .serial { font-family: monospace; font-size: 12px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; display: inline-block; margin-bottom: 6px; }
            .dates { font-size: 10px; color: #475569; }
            .dates strong { color: #0f172a; }
            .qr-side { width: 75px; text-align: center; }
            .qr-side img { width: 75px; height: 75px; }
            .qr-side span { font-size: 8px; color: #64748b; display: block; margin-top: 2px; }
          </style>
        </head>
        <body>
          <div class="tag-box">
            <div class="info">
              <div class="hosp-title">${isAr ? 'مستشفى - بطاقة تعريف أصل طبي' : 'HOSPITAL MEDICAL ASSET TAG'}</div>
              <div class="device-name">${device.name}</div>
              <div class="serial">SN: ${device.serial || 'N/A'}</div>
              <div class="dates">
                <div>${isAr ? 'التصنيف' : 'Modality'}: <strong>${device.category}</strong></div>
                <div>${isAr ? 'الصيانة الوقائية' : 'Next PPM'}: <strong>${device.maintDate || 'N/A'}</strong></div>
                ${device.enableQA ? `<div>${isAr ? 'شهادة الجودة' : 'Next QC'}: <strong>${device.qualDate || 'N/A'}</strong></div>` : ''}
              </div>
            </div>
            <div class="qr-side">
              <img src="${qrUrl}" alt="QR" />
              <span>SCAN FOR DOCS</span>
            </div>
          </div>
          <script>
            window.onload = () => { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    setIsPrinting(false);
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

              <div className="grid grid-cols-2 gap-3">
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

                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] font-bold text-slate-400 uppercase block mb-1">
                    {isAr ? 'حالة التفتيش والامتثال' : 'Compliance'}
                  </span>
                  <div className="flex items-center gap-2 text-sm font-black text-emerald-600 dark:text-emerald-400">
                    <i className="fas fa-shield-check text-xs"></i>
                    {isAr ? 'معتمد طبياً' : 'Audited & Certified'}
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
                    <a
                      href={device.maintUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-800 shadow-sm mt-1 transition-colors"
                    >
                      <i className="fas fa-file-pdf text-red-500"></i>
                      <span>{isAr ? 'عرض تقرير الصيانة المعتمد (PDF)' : 'View Certified PPM Report (PDF)'}</span>
                      <i className="fas fa-external-link-alt text-[10px]"></i>
                    </a>
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
                      <a
                        href={device.qualUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-xs font-bold text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-purple-200 dark:border-purple-800 shadow-sm mt-1 transition-colors"
                      >
                        <i className="fas fa-file-pdf text-red-500"></i>
                        <span>{isAr ? 'عرض شهادة المعايرة والجودة (PDF)' : 'View Calibration Certificate (PDF)'}</span>
                        <i className="fas fa-external-link-alt text-[10px]"></i>
                      </a>
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
                  disabled={isPrinting}
                  className="mt-4 w-full py-2.5 px-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-black flex items-center justify-center gap-2 shadow-sm transition-all"
                >
                  <i className="fas fa-print text-blue-600"></i>
                  <span>{isAr ? 'طباعة ملصق الجهاز (Asset Tag)' : 'Print Equipment Label'}</span>
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
    </div>
  );
};
