import React, { useState, useEffect, useMemo } from 'react';
import QRCode from 'qrcode';
import { DeviceItem, getDaysRemaining } from './deviceTypes';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebaseData';

interface DeviceStickerModalProps {
  device: DeviceItem;
  isOpen: boolean;
  onClose: () => void;
  isAr: boolean;
  onDeviceUpdated?: (updated: DeviceItem) => void;
}

export const DeviceStickerModal: React.FC<DeviceStickerModalProps> = ({
  device,
  isOpen,
  onClose,
  isAr,
  onDeviceUpdated,
}) => {
  // Editable fields in preview
  const [roomNumber, setRoomNumber] = useState<string>(device.roomNumber || device.room || '');
  const [installDate, setInstallDate] = useState<string>(device.installDate || '');
  const [isSavingRoom, setIsSavingRoom] = useState(false);

  // Print mode: 'thermal' (70x50mm exact single label) or 'a4' (sheet with 8 labels)
  const [printMode, setPrintMode] = useState<'thermal' | 'a4'>('thermal');
  // Visual theme: 'zebra_bw' (pure 100% monochrome black for Zebra / thermal printers) or 'color' (standard colored)
  const [stickerTheme, setStickerTheme] = useState<'zebra_bw' | 'color'>('zebra_bw');
  const [copiesCount, setCopiesCount] = useState<number>(1);
  const [showZebraGuide, setShowZebraGuide] = useState<boolean>(true);

  // Generated QR codes (Data URLs)
  const [ppmQrUrl, setPpmQrUrl] = useState<string>('');
  const [qcQrUrl, setQcQrUrl] = useState<string>('');
  const [isGeneratingQr, setIsGeneratingQr] = useState<boolean>(true);

  // Sync state when device changes
  useEffect(() => {
    if (device) {
      setRoomNumber(device.roomNumber || device.room || '');
      setInstallDate(device.installDate || '');
    }
  }, [device]);

  // Calculate device age
  const deviceAge = useMemo(() => {
    if (!installDate) return isAr ? 'غير مسجل' : 'Not recorded';
    const inst = new Date(installDate);
    if (isNaN(inst.getTime())) return isAr ? 'غير مسجل' : 'Not recorded';
    const today = new Date();
    const diffMonths = (today.getFullYear() - inst.getFullYear()) * 12 + (today.getMonth() - inst.getMonth());
    if (diffMonths <= 0) return isAr ? 'حديث التركيب' : 'Newly Installed';
    const years = Math.floor(diffMonths / 12);
    const months = diffMonths % 12;

    if (years > 0) {
      if (months > 0) {
        return isAr ? `${years} سنة و ${months} شهر` : `${years}y ${months}m`;
      }
      return isAr ? `${years} سنوات` : `${years} years`;
    }
    return isAr ? `${months} أشهر` : `${months} months`;
  }, [installDate, isAr]);

  // Safely resolve report QR content for PPM / QC (prevent oversized data URLs from breaking QR generation)
  const resolveReportQrPayload = (
    rawUrl: string | undefined | null,
    type: 'PPM' | 'QC',
    dev: DeviceItem,
    room: string
  ): string => {
    const origin = typeof window !== 'undefined' && window.location.origin ? window.location.origin : '';
    const publicReportUrl = origin && dev.id
      ? `${origin}/#/public/report/${encodeURIComponent(dev.id)}/${type.toLowerCase()}`
      : '';

    // 1. Prioritize dedicated public report reader:
    // Guarantees immediate high-DPI rendering across all mobile devices without login,
    // and stays dynamically linked to the latest report even if updated later.
    if (publicReportUrl) {
      return publicReportUrl;
    }

    // 2. Direct remote URL fallback if dev.id is unavailable
    if (rawUrl && typeof rawUrl === 'string') {
      const trimmed = rawUrl.trim();
      if ((trimmed.startsWith('http://') || trimmed.startsWith('https://')) && trimmed.length < 1200) {
        return trimmed;
      }
    }

    // 3. Fallback: Concise structured metadata tag for on-site scanning
    const dueDate = type === 'PPM' ? (dev.maintDate || 'N/A') : (dev.qualDate || 'N/A');
    return `[${type} INSPECTION]\nName: ${dev.name}\nSN: ${dev.serial || 'N/A'}\nRoom: ${room || 'N/A'}\nDue: ${dueDate}`;
  };

  // Generate QR codes for PPM and QC
  useEffect(() => {
    let isMounted = true;
    const generateQrs = async () => {
      setIsGeneratingQr(true);
      try {
        const ppmContent = resolveReportQrPayload(device.maintUrl, 'PPM', device, roomNumber);
        const qcContent = resolveReportQrPayload(device.qualUrl, 'QC', device, roomNumber);

        // Generate PPM QR Code client-side (Pure #000000 black prevents dithering blur on Zebra thermal printheads)
        let ppmData = '';
        try {
          ppmData = await QRCode.toDataURL(ppmContent, {
            width: 260,
            margin: 1,
            errorCorrectionLevel: 'M',
            color: {
              dark: '#000000',
              light: '#ffffff',
            },
          });
        } catch (ppmErr) {
          console.warn('Fallback PPM QR generation:', ppmErr);
          ppmData = await QRCode.toDataURL(`PPM:${device.name || 'ASSET'}\nSN:${device.serial || 'N/A'}`, {
            width: 260,
            margin: 1,
            errorCorrectionLevel: 'L',
            color: { dark: '#000000', light: '#ffffff' },
          });
        }

        // Generate QC QR Code client-side (Pure #000000 black for thermal & optical scanner clarity)
        let qcData = '';
        try {
          qcData = await QRCode.toDataURL(qcContent, {
            width: 260,
            margin: 1,
            errorCorrectionLevel: 'M',
            color: {
              dark: '#000000',
              light: '#ffffff',
            },
          });
        } catch (qcErr) {
          console.warn('Fallback QC QR generation:', qcErr);
          qcData = await QRCode.toDataURL(`QC:${device.name || 'ASSET'}\nSN:${device.serial || 'N/A'}`, {
            width: 260,
            margin: 1,
            errorCorrectionLevel: 'L',
            color: { dark: '#000000', light: '#ffffff' },
          });
        }

        if (isMounted) {
          setPpmQrUrl(ppmData);
          setQcQrUrl(qcData);
          setIsGeneratingQr(false);
        }
      } catch (err) {
        console.error('Error generating sticker QR codes:', err);
        if (isMounted) {
          // Guaranteed client-side fallback with zero network dependencies
          try {
            const fallbackPpm = await QRCode.toDataURL(`PPM:${device.name || 'ASSET'}`, {
              width: 260,
              margin: 1,
              color: { dark: '#000000', light: '#ffffff' },
            });
            const fallbackQc = await QRCode.toDataURL(`QC:${device.name || 'ASSET'}`, {
              width: 260,
              margin: 1,
              color: { dark: '#000000', light: '#ffffff' },
            });
            setPpmQrUrl(fallbackPpm);
            setQcQrUrl(fallbackQc);
          } catch (e2) {
            console.error('Final QR fallback error:', e2);
          }
          setIsGeneratingQr(false);
        }
      }
    };

    generateQrs();
    return () => {
      isMounted = false;
    };
  }, [device, roomNumber]);

  // Save room number directly to device in Firestore if updated
  const handleSaveRoomNumber = async () => {
    if (!device.id) return;
    setIsSavingRoom(true);
    try {
      await updateDoc(doc(db, 'inventory_devices', device.id), {
        roomNumber: roomNumber.trim(),
        installDate: installDate,
      });
      if (onDeviceUpdated) {
        onDeviceUpdated({
          ...device,
          roomNumber: roomNumber.trim(),
          installDate: installDate,
        });
      }
    } catch (e) {
      console.error('Error saving room number:', e);
    } finally {
      setIsSavingRoom(false);
    }
  };

  const ppmRemaining = getDaysRemaining(device.maintDate);
  const qcRemaining = getDaysRemaining(device.qualDate);

  // Generate single sticker HTML
  const generateStickerRawHtml = () => {
    const isPpmOverdue = ppmRemaining !== null && ppmRemaining <= 0;
    const isQcOverdue = qcRemaining !== null && qcRemaining <= 0;
    const isZebra = stickerTheme === 'zebra_bw';

    return `
      <div class="sticker-card ${isZebra ? 'sticker-zebra-bw' : 'sticker-color-mode'}" dir="${isAr ? 'rtl' : 'ltr'}">
        <!-- Header: Hospital Name & Department -->
        <div class="sticker-header">
          <div class="header-logo-title">
            <img src="/old-logo.png" onerror="this.src='/logo.png'" alt="Hospital Logo" class="hosp-logo ${isZebra ? 'mono-logo' : ''}" />
            <div class="hosp-titles">
              <div class="hosp-main">${isAr ? "مستشفي الجدعاني -ح الصفا" : 'ALJEDAANI HOSPITAL -ALSFA'}</div>
              <div class="hosp-sub">${isAr ? 'قسم الأشعة والتصوير الطبي' : 'Radiology & Medical Imaging'}</div>
            </div>
          </div>
          <div class="${isZebra ? 'badge-tag-mono' : 'badge-tag'}">${device.category || 'ASSET'}</div>
        </div>

        <!-- Middle: Device Name, Serial, Room & Age -->
        <div class="device-info-section">
          <div class="device-row-primary">
            <div class="device-name-text" title="${device.name}">${device.name}</div>
            <div class="device-sn-badge">SN: ${device.serial || 'N/A'}</div>
          </div>

          <div class="meta-row">
            <div class="meta-item room-box">
              <span class="meta-lbl">${isAr ? 'رقم الغرفة' : 'Room #'}</span>
              <span class="meta-val room-val">${roomNumber ? roomNumber : (isAr ? 'غير محدد' : 'N/A')}</span>
            </div>
            <div class="meta-item">
              <span class="meta-lbl">${isAr ? 'تاريخ التركيب' : 'Install Date'}</span>
              <span class="meta-val">${installDate || '—'}</span>
            </div>
            <div class="meta-item">
              <span class="meta-lbl">${isAr ? 'عمر الجهاز' : 'Device Age'}</span>
              <span class="meta-val age-val">${deviceAge}</span>
            </div>
          </div>
        </div>

        <!-- Bottom Grid: PPM & QC with QR Codes -->
        <div class="inspection-grid">
          <!-- PPM Block -->
          <div class="inspect-box ppm-box">
            <div class="inspect-header ppm-header">
              <span class="inspect-title">${isAr ? 'الصيانة الوقائية PPM' : 'PPM Maintenance'}</span>
              <span class="inspect-badge ${isPpmOverdue ? 'badge-overdue' : 'badge-ok'}">
                ${device.maintDate ? (isPpmOverdue ? (isAr ? 'منتهي' : 'Due') : (isAr ? 'سارٍ' : 'Valid')) : (isAr ? '—' : 'N/A')}
              </span>
            </div>
            <div class="inspect-body">
              <div class="inspect-details">
                <span class="detail-label">${isAr ? 'تاريخ الانتهاء:' : 'Expiry Date:'}</span>
                <span class="detail-date ${isPpmOverdue && !isZebra ? 'text-danger' : ''}">${device.maintDate || (isAr ? 'غير مسجل' : 'Not set')}</span>
                <span class="scan-tip">${isAr ? 'امسح لتقرير PPM' : 'Scan for PPM Report'}</span>
              </div>
              <div class="qr-wrapper">
                <img src="${ppmQrUrl}" alt="PPM QR" class="qr-img" />
              </div>
            </div>
          </div>

          <!-- QC Block -->
          <div class="inspect-box qc-box">
            <div class="inspect-header qc-header">
              <span class="inspect-title">${isAr ? 'ضبط الجودة QC' : 'Quality Control QC'}</span>
              <span class="inspect-badge ${isQcOverdue ? 'badge-overdue' : 'badge-ok'}">
                ${device.enableQA ? (device.qualDate ? (isQcOverdue ? (isAr ? 'منتهي' : 'Due') : (isAr ? 'سارٍ' : 'Valid')) : (isAr ? '—' : 'N/A')) : (isAr ? 'معفى' : 'Exempt')}
              </span>
            </div>
            <div class="inspect-body">
              <div class="inspect-details">
                <span class="detail-label">${isAr ? 'تاريخ الانتهاء:' : 'Expiry Date:'}</span>
                <span class="detail-date ${isQcOverdue && !isZebra ? 'text-danger' : ''}">${device.enableQA ? (device.qualDate || (isAr ? 'غير مسجل' : 'Not set')) : (isAr ? 'غير مفعل' : 'Disabled')}</span>
                <span class="scan-tip">${isAr ? 'امسح لتقرير QC' : 'Scan for QC Report'}</span>
              </div>
              <div class="qr-wrapper">
                <img src="${qcQrUrl}" alt="QC QR" class="qr-img" />
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  };

  // Generate full printable page with exact 7cm x 5cm dimensions
  const getFullPrintHtml = () => {
    const rawCard = generateStickerRawHtml();
    let contentHtml = '';

    if (printMode === 'thermal') {
      contentHtml = `
        <div class="print-single-wrapper">
          ${rawCard}
        </div>
      `;
    } else {
      // A4 sheet mode (8 stickers per page: 2 columns x 4 rows)
      const count = Math.max(1, Math.min(12, copiesCount));
      const stickers = Array(count).fill(rawCard).join('');
      contentHtml = `
        <div class="a4-sheet-wrapper">
          ${stickers}
        </div>
      `;
    }

    return `
      <!DOCTYPE html>
      <html lang="${isAr ? 'ar' : 'en'}" dir="${isAr ? 'rtl' : 'ltr'}">
        <head>
          <meta charset="utf-8" />
          <title>${device.name} - Asset Label (70x50mm)</title>
          <style>
            @charset "utf-8";
            *, *::before, *::after {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }

            @page {
              ${printMode === 'thermal' ? 'size: 70mm 50mm;' : 'size: A4 portrait;'}
              margin: 0;
            }

            html, body {
              width: 100%;
              height: 100%;
              margin: 0;
              padding: 0;
              background: #ffffff;
              color: #000000;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Cairo", "Tajawal", "Arial", sans-serif;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              text-rendering: geometricPrecision;
            }

            ${printMode === 'thermal' ? `
            .print-single-wrapper {
              width: 70mm;
              height: 50mm;
              max-width: 70mm;
              max-height: 50mm;
              overflow: hidden;
              margin: 0;
              padding: 1.5mm;
              page-break-inside: avoid;
              page-break-after: avoid;
            }
            ` : `
            .a4-sheet-wrapper {
              width: 210mm;
              min-height: 297mm;
              padding: 10mm 15mm;
              display: grid;
              grid-template-columns: repeat(2, 70mm);
              gap: 8mm 20mm;
              justify-content: center;
              align-content: start;
            }
            `}

            /* Exact 70mm x 50mm Sticker Container */
            .sticker-card {
              width: 67mm;
              height: 47mm;
              max-width: 67mm;
              max-height: 47mm;
              overflow: hidden;
              border-radius: 3mm;
              padding: 1.5mm 1.8mm;
              background: #ffffff;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              font-size: 7pt;
              line-height: 1.15;
            }

            /* --- ZEBRA / THERMAL B&W HIGH-CONTRAST MONOCHROME RULES --- */
            .sticker-zebra-bw {
              border: 1.8px solid #000000 !important;
              background: #ffffff !important;
              color: #000000 !important;
              -webkit-font-smoothing: antialiased;
              text-rendering: geometricPrecision;
            }

            .sticker-zebra-bw * {
              color: #000000;
              border-color: #000000;
              box-shadow: none !important;
              text-shadow: none !important;
            }

            .sticker-zebra-bw .sticker-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              border-bottom: 1.2px solid #000000 !important;
              padding-bottom: 0.8mm;
              margin-bottom: 0.7mm;
            }

            .sticker-zebra-bw .mono-logo {
              filter: grayscale(100%) contrast(300%) brightness(85%) !important;
            }

            .sticker-zebra-bw .hosp-main {
              font-size: 6.2pt !important;
              font-weight: 900 !important;
              color: #000000 !important;
              text-transform: uppercase;
              letter-spacing: -0.1px;
            }

            .sticker-zebra-bw .hosp-sub {
              font-size: 5.2pt !important;
              font-weight: 800 !important;
              color: #000000 !important;
            }

            .sticker-zebra-bw .badge-tag-mono {
              font-size: 6pt !important;
              font-weight: 900 !important;
              background: #000000 !important;
              color: #ffffff !important;
              border: 1px solid #000000 !important;
              padding: 0.4mm 1.6mm !important;
              border-radius: 0.8mm !important;
              text-transform: uppercase;
            }

            .sticker-zebra-bw .device-name-text {
              font-size: 8.8pt !important;
              font-weight: 900 !important;
              color: #000000 !important;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              flex: 1;
            }

            .sticker-zebra-bw .device-sn-badge {
              font-family: "SF Mono", "Courier New", Courier, monospace, Arial !important;
              font-size: 6.8pt !important;
              font-weight: 900 !important;
              background: #ffffff !important;
              color: #000000 !important;
              border: 1.4px solid #000000 !important;
              padding: 0.3mm 1.4mm !important;
              border-radius: 0.8mm !important;
              white-space: nowrap;
            }

            .sticker-zebra-bw .meta-row {
              display: grid;
              grid-template-columns: 1.3fr 1fr 1fr;
              gap: 1mm;
              background: #ffffff !important;
              border: 1.2px solid #000000 !important;
              border-radius: 1mm;
              padding: 0.8mm 1.2mm !important;
            }

            .sticker-zebra-bw .meta-lbl {
              font-size: 5.2pt !important;
              font-weight: 800 !important;
              color: #000000 !important;
              text-transform: uppercase;
            }

            .sticker-zebra-bw .meta-val {
              font-size: 7.2pt !important;
              font-weight: 900 !important;
              color: #000000 !important;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            .sticker-zebra-bw .room-box {
              border-inline-end: 1.2px solid #000000 !important;
              padding-inline-end: 1mm;
            }

            .sticker-zebra-bw .room-val,
            .sticker-zebra-bw .age-val {
              color: #000000 !important;
              font-weight: 900 !important;
            }

            .sticker-zebra-bw .inspect-box {
              border-radius: 1.4mm;
              padding: 0.8mm 1mm;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              border: 1.4px solid #000000 !important;
              background: #ffffff !important;
            }

            .sticker-zebra-bw .inspect-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              border-bottom: 1.2px solid #000000 !important;
              padding-bottom: 0.4mm;
              margin-bottom: 0.5mm;
            }

            .sticker-zebra-bw .inspect-title {
              font-size: 6.4pt !important;
              font-weight: 900 !important;
              color: #000000 !important;
              text-transform: uppercase;
            }

            .sticker-zebra-bw .badge-ok {
              background: #ffffff !important;
              color: #000000 !important;
              border: 1.2px solid #000000 !important;
              font-size: 5.4pt !important;
              font-weight: 900 !important;
              padding: 0.2mm 1mm !important;
              border-radius: 0.6mm !important;
            }

            .sticker-zebra-bw .badge-overdue {
              background: #000000 !important;
              color: #ffffff !important;
              border: 1.2px solid #000000 !important;
              font-size: 5.4pt !important;
              font-weight: 900 !important;
              padding: 0.2mm 1mm !important;
              border-radius: 0.6mm !important;
            }

            .sticker-zebra-bw .detail-label {
              font-size: 5.2pt !important;
              font-weight: 800 !important;
              color: #000000 !important;
            }

            .sticker-zebra-bw .detail-date {
              font-size: 7.2pt !important;
              font-weight: 900 !important;
              color: #000000 !important;
              font-family: "SF Mono", "Courier New", Courier, monospace, Arial !important;
              white-space: nowrap;
            }

            .sticker-zebra-bw .scan-tip {
              font-size: 5.2pt !important;
              font-weight: 800 !important;
              color: #000000 !important;
              margin-top: 0.3mm;
              line-height: 1;
            }

            .sticker-zebra-bw .qr-wrapper {
              width: 15.5mm !important;
              height: 15.5mm !important;
              min-width: 15.5mm !important;
              min-height: 15.5mm !important;
              background: #ffffff !important;
              padding: 0.2mm !important;
              border-radius: 0.8mm;
              border: 1.2px solid #000000 !important;
              display: flex;
              align-items: center;
              justify-content: center;
            }

            .sticker-zebra-bw .qr-img {
              width: 100%;
              height: 100%;
              object-fit: contain;
              display: block;
              image-rendering: -moz-crisp-edges !important;
              image-rendering: -webkit-optimize-contrast !important;
              image-rendering: pixelated !important;
              image-rendering: crisp-edges !important;
            }

            /* --- STANDARD COLOR PROFILE RULES (FOR COLOR PRINTERS) --- */
            .sticker-color-mode {
              border: 1.2px solid #0369a1;
            }

            .sticker-color-mode .sticker-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              border-bottom: 0.6px solid #cbd5e1;
              padding-bottom: 1mm;
              margin-bottom: 0.8mm;
            }

            .sticker-color-mode .hosp-main {
              font-size: 5.5pt;
              font-weight: 900;
              color: #0369a1;
              text-transform: uppercase;
              letter-spacing: -0.1px;
            }

            .sticker-color-mode .hosp-sub {
              font-size: 4.5pt;
              font-weight: 700;
              color: #64748b;
            }

            .sticker-color-mode .badge-tag {
              font-size: 4.8pt;
              font-weight: 900;
              background: #f0f9ff;
              color: #0369a1;
              border: 0.5px solid #bae6fd;
              padding: 0.3mm 1.2mm;
              border-radius: 1mm;
              text-transform: uppercase;
            }

            .sticker-color-mode .device-name-text {
              font-size: 7.6pt;
              font-weight: 900;
              color: #0f172a;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              flex: 1;
            }

            .sticker-color-mode .device-sn-badge {
              font-family: "SF Mono", "Courier New", Courier, monospace;
              font-size: 5.4pt;
              font-weight: 800;
              background: #f1f5f9;
              color: #334155;
              border: 0.5px solid #cbd5e1;
              padding: 0.3mm 1.2mm;
              border-radius: 0.8mm;
              white-space: nowrap;
            }

            .sticker-color-mode .meta-row {
              display: grid;
              grid-template-columns: 1.3fr 1fr 1fr;
              gap: 1mm;
              background: #f8fafc;
              border: 0.5px solid #e2e8f0;
              border-radius: 1.2mm;
              padding: 0.6mm 1mm;
            }

            .sticker-color-mode .meta-lbl {
              font-size: 4.2pt;
              font-weight: 700;
              color: #64748b;
              text-transform: uppercase;
            }

            .sticker-color-mode .meta-val {
              font-size: 5.5pt;
              font-weight: 800;
              color: #1e293b;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            .sticker-color-mode .room-box {
              border-inline-end: 0.5px solid #cbd5e1;
              padding-inline-end: 1mm;
            }

            .sticker-color-mode .room-val {
              color: #0284c7;
              font-weight: 900;
            }

            .sticker-color-mode .age-val {
              color: #0f766e;
            }

            .sticker-color-mode .inspect-box {
              border-radius: 1.5mm;
              padding: 0.8mm 1mm;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              border: 0.6px solid #cbd5e1;
              background: #ffffff;
            }

            .sticker-color-mode .ppm-box {
              border-color: #7dd3fc;
              background: #f0f9ff;
            }

            .sticker-color-mode .qc-box {
              border-color: #d8b4fe;
              background: #faf5ff;
            }

            .sticker-color-mode .inspect-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              border-bottom: 0.4px solid rgba(0,0,0,0.08);
              padding-bottom: 0.4mm;
              margin-bottom: 0.5mm;
            }

            .sticker-color-mode .inspect-title {
              font-size: 4.8pt;
              font-weight: 900;
              text-transform: uppercase;
            }

            .sticker-color-mode .ppm-header .inspect-title {
              color: #0369a1;
            }

            .sticker-color-mode .qc-header .inspect-title {
              color: #7e22ce;
            }

            .sticker-color-mode .badge-ok {
              background: #dcfce7;
              color: #15803d;
              font-size: 4pt;
              font-weight: 800;
              padding: 0.2mm 0.8mm;
              border-radius: 0.6mm;
            }

            .sticker-color-mode .badge-overdue {
              background: #fee2e2;
              color: #b91c1c;
              font-size: 4pt;
              font-weight: 800;
              padding: 0.2mm 0.8mm;
              border-radius: 0.6mm;
            }

            .sticker-color-mode .detail-label {
              font-size: 4pt;
              font-weight: 700;
              color: #64748b;
            }

            .sticker-color-mode .detail-date {
              font-size: 5.4pt;
              font-weight: 900;
              color: #0f172a;
              white-space: nowrap;
            }

            .sticker-color-mode .text-danger {
              color: #b91c1c !important;
            }

            .sticker-color-mode .scan-tip {
              font-size: 3.8pt;
              font-weight: 700;
              color: #0369a1;
              margin-top: 0.4mm;
              line-height: 1;
            }

            .sticker-color-mode .qc-box .scan-tip {
              color: #7e22ce;
            }

            .sticker-color-mode .qr-wrapper {
              width: 14.5mm;
              height: 14.5mm;
              min-width: 14.5mm;
              min-height: 14.5mm;
              background: #ffffff;
              padding: 0.4mm;
              border-radius: 0.8mm;
              border: 0.4px solid #cbd5e1;
              display: flex;
              align-items: center;
              justify-content: center;
            }

            .header-logo-title {
              display: flex;
              align-items: center;
              gap: 1.5mm;
            }

            .hosp-logo {
              height: 4.8mm;
              width: auto;
              max-width: 7mm;
              object-fit: contain;
            }

            .hosp-titles {
              display: flex;
              flex-direction: column;
            }

            .device-info-section {
              margin-bottom: 0.8mm;
            }

            .device-row-primary {
              display: flex;
              align-items: baseline;
              justify-content: space-between;
              gap: 1.5mm;
              margin-bottom: 0.8mm;
            }

            .meta-item {
              display: flex;
              flex-direction: column;
              min-width: 0;
            }

            .inspection-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 1.2mm;
              flex: 1;
              min-height: 20mm;
            }

            .inspect-body {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 1mm;
              flex: 1;
            }

            .inspect-details {
              display: flex;
              flex-direction: column;
              gap: 0.3mm;
              flex: 1;
              min-width: 0;
            }

            .qr-img {
              width: 100%;
              height: 100%;
              object-fit: contain;
              display: block;
            }
          </style>
        </head>
        <body>
          ${contentHtml}
        </body>
      </html>
    `;
  };

  // Safe Print Execution via Hidden Iframe (Bypasses all popup blockers)
  const handlePrint = () => {
    // Also save room number if it changed
    handleSaveRoomNumber();

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.zIndex = '-999';

    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      return;
    }

    doc.open();
    doc.write(getFullPrintHtml());
    doc.close();

    // Give images & fonts time to render, then trigger print
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();

      // Clean up iframe after user completes print
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 1500);
    }, 400);
  };

  if (!isOpen) return null;

  const isPpmOverdue = ppmRemaining !== null && ppmRemaining <= 0;
  const isQcOverdue = qcRemaining !== null && qcRemaining <= 0;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in print:hidden">
      <div
        className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[95vh] transition-all"
        onClick={(e) => e.stopPropagation()}
        dir={isAr ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-600 via-cyan-600 to-sky-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-lg shadow-inner">
              <i className="fas fa-tag"></i>
            </div>
            <div>
              <h3 className="text-base font-black leading-tight">
                {isAr ? 'طباعة ملصق الجهاز الطبي (7 سم × 5 سم)' : 'Print Medical Equipment Label (7cm × 5cm)'}
              </h3>
              <p className="text-xs text-sky-100 font-medium mt-0.5">
                {isAr
                  ? 'ملصق معتمد لتعريف الأجهزة بالأشعة متضمن الباركود لتقارير PPM و QC'
                  : 'Certified radiology equipment tag with PPM & QC report barcodes'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors text-sm"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5">
          {/* Controls Bar: Quick Edit of Room # & Install Date */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <i className="fas fa-sliders-h text-blue-600"></i>
                {isAr ? 'تخصيص بيانات الملصق قبل الطباعة:' : 'Customize label data before printing:'}
              </span>
              <span className="text-[11px] font-bold text-slate-500 bg-white dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                {isAr ? 'المقاس: 7 سم عرض × 5 سم ارتفاع' : 'Dimensions: 70mm × 50mm'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Room Number Input */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  <i className="fas fa-door-open text-blue-500 mr-1 ml-1"></i>
                  {isAr ? 'رقم / اسم الغرفة (Room #)' : 'Room Number'}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={roomNumber}
                    onChange={(e) => setRoomNumber(e.target.value)}
                    placeholder={isAr ? 'مثال: غرفة 104 أو أشعة مقطعية' : 'e.g. Room 104'}
                    className="w-full text-xs font-bold p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:border-blue-500"
                  />
                  {roomNumber !== (device.roomNumber || device.room || '') && (
                    <button
                      onClick={handleSaveRoomNumber}
                      disabled={isSavingRoom}
                      className="absolute left-2 rtl:left-2 rtl:right-auto ltr:right-2 ltr:left-auto top-2 px-2 py-1 bg-emerald-600 text-white text-[10px] font-black rounded-lg hover:bg-emerald-700 shadow-sm transition-all"
                    >
                      {isSavingRoom ? <i className="fas fa-spinner fa-spin"></i> : (isAr ? 'حفظ للجهاز' : 'Save')}
                    </button>
                  )}
                </div>
              </div>

              {/* Install Date Input */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  <i className="fas fa-calendar-alt text-cyan-500 mr-1 ml-1"></i>
                  {isAr ? 'تاريخ تركيب الجهاز' : 'Installation Date'}
                </label>
                <input
                  type="date"
                  value={installDate}
                  onChange={(e) => setInstallDate(e.target.value)}
                  className="w-full text-xs font-bold p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            {/* Quick summary badges */}
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200 dark:border-slate-700/60 text-[11px]">
              <span className="font-bold text-slate-500 dark:text-slate-400">
                {isAr ? 'عمر الجهاز المحسوب:' : 'Calculated age:'} <strong className="text-teal-600 dark:text-teal-400">{deviceAge}</strong>
              </span>
              <span className="text-slate-300">•</span>
              <span className="font-bold text-slate-500 dark:text-slate-400">
                {isAr ? 'انتهاء PPM:' : 'PPM Expiry:'} <strong className={isPpmOverdue ? 'text-rose-600' : 'text-blue-600'}>{device.maintDate || (isAr ? 'غير مسجل' : 'N/A')}</strong>
              </span>
              <span className="text-slate-300">•</span>
              <span className="font-bold text-slate-500 dark:text-slate-400">
                {isAr ? 'انتهاء QC:' : 'QC Expiry:'} <strong className={isQcOverdue ? 'text-rose-600' : 'text-purple-600'}>{device.enableQA ? (device.qualDate || (isAr ? 'غير مسجل' : 'N/A')) : (isAr ? 'معفى' : 'N/A')}</strong>
              </span>
            </div>
          </div>

          {/* Real-Scale Visual Preview of the 7cm x 5cm Sticker */}
          <div className="flex flex-col items-center">
            <div className="text-center mb-2">
              <span className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center justify-center gap-2">
                <i className={`fas ${stickerTheme === 'zebra_bw' ? 'fa-barcode text-slate-900 dark:text-white' : 'fa-eye text-blue-600'}`}></i>
                {isAr
                  ? (stickerTheme === 'zebra_bw' ? 'معاينة ملصق زيبرا الحراري (أبيض وأسود 100% عالي التباين)' : 'معاينة الملصق المطبوع (أبعاد حقيقية 70 × 50 مم)')
                  : (stickerTheme === 'zebra_bw' ? 'Zebra Thermal Preview (100% Monochrome Black & White)' : 'Print Preview (Real 70mm × 50mm Ratio)')}
              </span>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                {stickerTheme === 'zebra_bw'
                  ? (isAr
                      ? 'خطوط سوداء مصمتة بدون تدرجات رمادية لضمان وضوح فائق ومنع البهتان على طابعات Zebra'
                      : 'Pure solid black fonts without gray dithering for razor-sharp legibility on thermal printheads')
                  : (isAr
                      ? 'تصميم ملون مناسب للطابعات العادية أو ورق ملصقات A4'
                      : 'Full color design suitable for laser/inkjet and A4 sticker sheets')}
              </p>
            </div>

            {/* Sticker Preview Box */}
            <div className="relative p-2 bg-slate-200 dark:bg-slate-800 rounded-2xl shadow-inner border border-slate-300 dark:border-slate-700">
              <div
                className={`bg-white text-slate-900 rounded-[10px] shadow-xl overflow-hidden p-3 flex flex-col justify-between transition-all ${
                  stickerTheme === 'zebra_bw' ? 'border-2 border-black' : 'border-2 border-sky-600'
                }`}
                style={{
                  width: '380px',
                  height: '270px',
                  boxSizing: 'border-box',
                }}
              >
                {/* Header */}
                <div className={`flex items-center justify-between pb-1.5 mb-1 ${
                  stickerTheme === 'zebra_bw' ? 'border-b-2 border-black' : 'border-b border-slate-200'
                }`}>
                  <div className="flex items-center gap-2">
                    <img
                      src="/old-logo.png"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/logo.png';
                      }}
                      alt="Logo"
                      className={`h-6 w-auto object-contain ${
                        stickerTheme === 'zebra_bw' ? 'grayscale contrast-200' : ''
                      }`}
                    />
                    <div>
                      <div className={`text-[10px] font-black leading-tight uppercase ${
                        stickerTheme === 'zebra_bw' ? 'text-black' : 'text-sky-800'
                      }`}>
                        {isAr ? "مستشفي الجدعاني -ح الصفا" : 'ALJEDAANI HOSPITAL -ALSFA'}
                      </div>
                      <div className={`text-[8px] font-bold ${
                        stickerTheme === 'zebra_bw' ? 'text-black' : 'text-slate-500'
                      }`}>
                        {isAr ? 'قسم الأشعة والتصوير الطبي' : 'Radiology & Medical Imaging'}
                      </div>
                    </div>
                  </div>
                  <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${
                    stickerTheme === 'zebra_bw'
                      ? 'bg-black text-white'
                      : 'bg-sky-50 text-sky-800 border border-sky-200'
                  }`}>
                    {device.category || 'ASSET'}
                  </span>
                </div>

                {/* Device Name, SN, Room, Age */}
                <div className="space-y-1 mb-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <h4 className="text-xs font-black text-black truncate flex-1">
                      {device.name}
                    </h4>
                    <span className={`font-mono text-[9px] font-black px-1.5 py-0.5 rounded whitespace-nowrap ${
                      stickerTheme === 'zebra_bw'
                        ? 'bg-white text-black border-2 border-black'
                        : 'bg-slate-100 text-slate-700 border border-slate-200'
                    }`}>
                      SN: {device.serial || 'N/A'}
                    </span>
                  </div>

                  <div className={`grid grid-cols-3 gap-1 rounded-lg p-1.5 text-[9px] ${
                    stickerTheme === 'zebra_bw'
                      ? 'bg-white border-2 border-black'
                      : 'bg-slate-50 border border-slate-200'
                  }`}>
                    <div className={`px-1 ${
                      stickerTheme === 'zebra_bw'
                        ? 'border-l-2 rtl:border-l-0 rtl:border-r-2 border-black'
                        : 'border-l rtl:border-l-0 rtl:border-r border-slate-200'
                    }`}>
                      <span className={`text-[7.5px] font-black block uppercase ${
                        stickerTheme === 'zebra_bw' ? 'text-black' : 'text-slate-400'
                      }`}>
                        {isAr ? 'الغرفة' : 'Room'}
                      </span>
                      <span className={`font-black truncate block ${
                        stickerTheme === 'zebra_bw' ? 'text-black' : 'text-sky-700'
                      }`}>
                        {roomNumber || (isAr ? 'غير محدد' : 'N/A')}
                      </span>
                    </div>

                    <div className={`px-1 ${
                      stickerTheme === 'zebra_bw'
                        ? 'border-l-2 rtl:border-l-0 rtl:border-r-2 border-black'
                        : 'border-l rtl:border-l-0 rtl:border-r border-slate-200'
                    }`}>
                      <span className={`text-[7.5px] font-black block uppercase ${
                        stickerTheme === 'zebra_bw' ? 'text-black' : 'text-slate-400'
                      }`}>
                        {isAr ? 'تاريخ التركيب' : 'Install'}
                      </span>
                      <span className="font-black text-black truncate block">
                        {installDate || '—'}
                      </span>
                    </div>

                    <div className="px-1">
                      <span className={`text-[7.5px] font-black block uppercase ${
                        stickerTheme === 'zebra_bw' ? 'text-black' : 'text-slate-400'
                      }`}>
                        {isAr ? 'عمر الجهاز' : 'Age'}
                      </span>
                      <span className={`font-black truncate block ${
                        stickerTheme === 'zebra_bw' ? 'text-black' : 'text-teal-700'
                      }`}>
                        {deviceAge}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom Inspection Columns (PPM & QC with Barcodes) */}
                <div className="grid grid-cols-2 gap-2 flex-1 pt-0.5">
                  {/* PPM Column */}
                  <div className={`rounded-lg p-1.5 flex flex-col justify-between ${
                    stickerTheme === 'zebra_bw'
                      ? 'border-2 border-black bg-white'
                      : 'border border-sky-200 bg-sky-50/70'
                  }`}>
                    <div className={`flex items-center justify-between pb-0.5 mb-1 ${
                      stickerTheme === 'zebra_bw' ? 'border-b-2 border-black' : 'border-b border-sky-200/80'
                    }`}>
                      <span className={`text-[8.5px] font-black ${
                        stickerTheme === 'zebra_bw' ? 'text-black' : 'text-sky-900'
                      }`}>
                        {isAr ? 'الصيانة PPM' : 'PPM Maint.'}
                      </span>
                      <span
                        className={`text-[7px] font-black px-1 rounded ${
                          stickerTheme === 'zebra_bw'
                            ? (isPpmOverdue ? 'bg-black text-white' : 'border border-black bg-white text-black')
                            : (isPpmOverdue ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700')
                        }`}
                      >
                        {device.maintDate ? (isPpmOverdue ? (isAr ? 'منتهي' : 'Due') : (isAr ? 'سارٍ' : 'Valid')) : '—'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-1">
                      <div className="flex flex-col text-[8px] leading-tight flex-1">
                        <span className={`text-[7px] font-bold ${
                          stickerTheme === 'zebra_bw' ? 'text-black' : 'text-slate-500'
                        }`}>
                          {isAr ? 'تاريخ الانتهاء:' : 'Expiry:'}
                        </span>
                        <span className={`font-black ${
                          stickerTheme === 'zebra_bw'
                            ? 'text-black'
                            : (isPpmOverdue ? 'text-rose-600' : 'text-slate-900')
                        }`}>
                          {device.maintDate || (isAr ? 'غير مسجل' : 'N/A')}
                        </span>
                        <span className={`text-[6.5px] font-black mt-1 flex items-center gap-0.5 ${
                          stickerTheme === 'zebra_bw' ? 'text-black' : 'text-sky-700'
                        }`}>
                          <i className="fas fa-qrcode"></i>
                          {isAr ? 'امسح لتقرير PPM' : 'Scan PPM'}
                        </span>
                      </div>

                      <div className={`w-12 h-12 bg-white rounded p-0.5 flex items-center justify-center shadow-xs ${
                        stickerTheme === 'zebra_bw' ? 'border-2 border-black' : 'border border-slate-300'
                      }`}>
                        {isGeneratingQr ? (
                          <i className="fas fa-spinner fa-spin text-slate-800 text-xs"></i>
                        ) : (
                          <img src={ppmQrUrl} alt="PPM QR" className="w-full h-full object-contain" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* QC Column */}
                  <div className={`rounded-lg p-1.5 flex flex-col justify-between ${
                    stickerTheme === 'zebra_bw'
                      ? 'border-2 border-black bg-white'
                      : 'border border-purple-200 bg-purple-50/70'
                  }`}>
                    <div className={`flex items-center justify-between pb-0.5 mb-1 ${
                      stickerTheme === 'zebra_bw' ? 'border-b-2 border-black' : 'border-b border-purple-200/80'
                    }`}>
                      <span className={`text-[8.5px] font-black ${
                        stickerTheme === 'zebra_bw' ? 'text-black' : 'text-purple-900'
                      }`}>
                        {isAr ? 'الجودة QC' : 'Quality QC'}
                      </span>
                      <span
                        className={`text-[7px] font-black px-1 rounded ${
                          stickerTheme === 'zebra_bw'
                            ? (isQcOverdue ? 'bg-black text-white' : 'border border-black bg-white text-black')
                            : (isQcOverdue ? 'bg-rose-100 text-rose-700' : 'bg-purple-100 text-purple-700')
                        }`}
                      >
                        {device.enableQA
                          ? (device.qualDate ? (isQcOverdue ? (isAr ? 'منتهي' : 'Due') : (isAr ? 'سارٍ' : 'Valid')) : '—')
                          : (isAr ? 'معفى' : 'Exempt')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-1">
                      <div className="flex flex-col text-[8px] leading-tight flex-1">
                        <span className={`text-[7px] font-bold ${
                          stickerTheme === 'zebra_bw' ? 'text-black' : 'text-slate-500'
                        }`}>
                          {isAr ? 'تاريخ الانتهاء:' : 'Expiry:'}
                        </span>
                        <span className={`font-black ${
                          stickerTheme === 'zebra_bw'
                            ? 'text-black'
                            : (isQcOverdue ? 'text-rose-600' : 'text-slate-900')
                        }`}>
                          {device.enableQA ? (device.qualDate || (isAr ? 'غير مسجل' : 'N/A')) : (isAr ? 'غير مفعل' : 'Disabled')}
                        </span>
                        <span className={`text-[6.5px] font-black mt-1 flex items-center gap-0.5 ${
                          stickerTheme === 'zebra_bw' ? 'text-black' : 'text-purple-700'
                        }`}>
                          <i className="fas fa-qrcode"></i>
                          {isAr ? 'امسح لتقرير QC' : 'Scan QC'}
                        </span>
                      </div>

                      <div className={`w-12 h-12 bg-white rounded p-0.5 flex items-center justify-center shadow-xs ${
                        stickerTheme === 'zebra_bw' ? 'border-2 border-black' : 'border border-slate-300'
                      }`}>
                        {isGeneratingQr ? (
                          <i className="fas fa-spinner fa-spin text-slate-800 text-xs"></i>
                        ) : (
                          <img src={qcQrUrl} alt="QC QR" className="w-full h-full object-contain" />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Style & Printer Configuration Controls */}
          <div className="space-y-2.5">
            {/* 1. Theme Style Selector (Zebra Monochrome vs Color) */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20">
              <div className="flex items-center gap-2">
                <i className="fas fa-palette text-amber-600 dark:text-amber-400 text-sm"></i>
                <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                  {isAr ? 'نمط وضوح الطباعة:' : 'Print Style & Theme:'}
                </span>
              </div>
              <div className="inline-flex rounded-xl p-1 bg-slate-200 dark:bg-slate-700 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setStickerTheme('zebra_bw')}
                  className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                    stickerTheme === 'zebra_bw'
                      ? 'bg-slate-900 text-white shadow-sm ring-1 ring-white/20'
                      : 'text-slate-700 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  <i className="fas fa-print text-amber-400"></i>
                  <span>{isAr ? 'أبيض وأسود Zebra (أسود نقي 100%)' : 'Zebra Monochrome (Pure B&W)'}</span>
                  <span className="text-[9px] bg-amber-500 text-black px-1 rounded font-black ml-1">
                    {isAr ? 'موصى به' : 'Best'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setStickerTheme('color')}
                  className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                    stickerTheme === 'color'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-700 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  <i className="fas fa-palette text-sky-200"></i>
                  <span>{isAr ? 'نمط ملون (طابعات عادية)' : 'Full Color'}</span>
                </button>
              </div>
            </div>

            {/* 2. Paper / Media Mode Selector */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  {isAr ? 'حجم الورق والمقاس:' : 'Paper Size:'}
                </span>
                <div className="inline-flex rounded-xl p-1 bg-slate-200 dark:bg-slate-700">
                  <button
                    type="button"
                    onClick={() => setPrintMode('thermal')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                      printMode === 'thermal'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                    }`}
                  >
                    <i className="fas fa-receipt mr-1 ml-1"></i>
                    {isAr ? 'رول حراري (7×5 سم فردي)' : 'Thermal Roll (70×50mm)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintMode('a4')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                      printMode === 'a4'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                    }`}
                  >
                    <i className="fas fa-copy mr-1 ml-1"></i>
                    {isAr ? 'ورقة A4 (ملصقات متعددة)' : 'A4 Sticker Sheet'}
                  </button>
                </div>
              </div>

              {printMode === 'a4' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">
                    {isAr ? 'عدد الملصقات في الصفحة:' : 'Stickers per sheet:'}
                  </span>
                  <select
                    value={copiesCount}
                    onChange={(e) => setCopiesCount(Number(e.target.value))}
                    className="p-1.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-black"
                  >
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={4}>4</option>
                    <option value={6}>6</option>
                    <option value={8}>8 (صفحة كاملة)</option>
                  </select>
                </div>
              )}
            </div>

            {/* 3. Zebra Printer Optimization & Troubleshooting Guide */}
            <div className="rounded-2xl border border-amber-300 dark:border-amber-700/60 bg-amber-50/70 dark:bg-amber-950/20 p-3 text-xs">
              <button
                type="button"
                onClick={() => setShowZebraGuide(!showZebraGuide)}
                className="w-full flex items-center justify-between font-black text-amber-950 dark:text-amber-200 text-right cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <i className="fas fa-lightbulb text-amber-600 text-sm"></i>
                  <span>
                    {isAr
                      ? 'حل مشكلة بهتان أو عدم وضوح الكتابة على طابعة Zebra (نصائح هامة)'
                      : 'Zebra Print Quality Tips: How to fix blurry/faint text'}
                  </span>
                </div>
                <i className={`fas fa-chevron-${showZebraGuide ? 'up' : 'down'} text-amber-600 text-xs`}></i>
              </button>

              {showZebraGuide && (
                <div className="mt-2.5 space-y-2 text-[11px] leading-relaxed text-amber-900 dark:text-amber-300/90 border-t border-amber-200 dark:border-amber-800/50 pt-2">
                  <p className="font-semibold text-slate-700 dark:text-slate-300">
                    {isAr
                      ? 'طابعات زيبرا الحرارية لا تحتوي على حبر رمادي أو تدريج، لذلك عند طباعة نصوص رمادية أو ملونة تقوم الطابعة بتنقيط الخطوط (Dithering) فيظهر الكلام باهتاً ومشوشاً. تم حل هذه المشكلة بالكامل كالتالي:'
                      : 'Thermal printers do not have gray ink; when printing colored or gray text, they use halftone dithering dots, causing text to look faint or fuzzy. Here is how to achieve razor-sharp prints:'}
                  </p>
                  <ul className="list-disc list-inside space-y-1.5 font-medium pr-1">
                    <li>
                      <strong>{isAr ? '1. نمط الأبيض والأسود المفعّل الآن:' : '1. Monochrome Mode (Enabled):'}</strong>{' '}
                      {isAr
                        ? 'يحول جميع النصوص والإطارات والباركودات إلى أسود مصمت 100% (#000000) بخطوط سميكة عريضة (Bold 900) لمنع التنقيط نهائياً.'
                        : 'Converts all texts, borders, and barcodes to pure 100% black with heavy font weights to eliminate fuzzy dithering dots.'}
                    </li>
                    <li>
                      <strong>{isAr ? '2. درجة السواد (Darkness / Density):' : '2. Head Darkness (18 - 22):'}</strong>{' '}
                      {isAr
                        ? 'من لوحة التحكم في الويندوز (Devices & Printers > Zebra Properties > Printing Preferences > Options)، ارفع قيمة الـ Darkness إلى 18 أو 22 لزيادة حرارة الرأس الحراري.'
                        : 'In Windows Zebra Printing Preferences > Options, increase Darkness/Density from default 10 to 18-22.'}
                    </li>
                    <li>
                      <strong>{isAr ? '3. سرعة الطباعة (Print Speed):' : '3. Print Speed (2.0 - 3.0 IPS):'}</strong>{' '}
                      {isAr
                        ? 'قلل سرعة الطباعة في إعدادات الطابعة إلى 2.0 أو 3.0 بوصة/ثانية؛ السرعة البطيئة تمنح الرأس الحراري وقتاً كافياً لحفر الخطوط بحدة عالية.'
                        : 'Reduce print speed to 2.0 or 3.0 inches/sec to give the thermal head enough dwell time.'}
                    </li>
                    <li>
                      <strong>{isAr ? '4. نوع الورق (Media Type):' : '4. Media Type:'}</strong>{' '}
                      {isAr
                        ? 'اختر Thermal Direct إذا كان الورق حرارياً بدون ريبون، أو Thermal Transfer إذا كنت تستخدم ريبون أسود.'
                        : 'Select Thermal Direct if using thermal paper without ribbon, or Thermal Transfer with ribbon.'}
                    </li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 bg-slate-50 dark:bg-slate-900/90 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-600 to-sky-700 hover:from-blue-700 hover:to-sky-800 text-white font-black text-xs hover:shadow-lg shadow-blue-500/25 flex items-center gap-2 transition-all transform active:scale-95"
          >
            <i className="fas fa-print"></i>
            <span>
              {isAr ? 'طباعة الملصق الآن (7 سم × 5 سم)' : 'Print Sticker Now (7cm × 5cm)'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
