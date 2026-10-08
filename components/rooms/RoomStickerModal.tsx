import React, { useState, useEffect, useMemo } from 'react';
import QRCode from 'qrcode';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../firebaseData';
import { RoomReportItem } from '../../pages/supervisor/RoomReports';

interface RoomStickerModalProps {
  room: RoomReportItem | null;
  isOpen: boolean;
  onClose: () => void;
  isAr: boolean;
  departmentName?: string | null;
  onRoomUpdated?: (updated: RoomReportItem) => void;
}

export type StickerSizePreset = '100x80' | '100x140' | '100x70' | '70x50';

export const RoomStickerModal: React.FC<RoomStickerModalProps> = ({
  room,
  isOpen,
  onClose,
  isAr,
  departmentName,
  onRoomUpdated,
}) => {
  if (!room || !isOpen) return null;

  // Editable fields in preview
  const [roomNumber, setRoomNumber] = useState<string>(room.number || '');
  const [device, setDevice] = useState<string>(room.device || '');
  const [surveyDate, setSurveyDate] = useState<string>(room.surveyDate || '');
  const [notes, setNotes] = useState<string>(room.notes || '');
  const [isSaving, setIsSaving] = useState(false);

  // Size preset: default is large 100x80mm door sign
  const [sizePreset, setSizePreset] = useState<StickerSizePreset>('100x80');
  // Print mode: 'thermal' (exact single label) or 'a4' (multi-label sheet)
  const [printMode, setPrintMode] = useState<'thermal' | 'a4'>('thermal');
  // Visual theme: 'zebra_bw' (monochrome for thermal Zebra) or 'color'
  const [stickerTheme, setStickerTheme] = useState<'zebra_bw' | 'color'>('zebra_bw');
  const [copiesCount, setCopiesCount] = useState<number>(1);
  const [showZebraGuide, setShowZebraGuide] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // QR Code URL data
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isGeneratingQr, setIsGeneratingQr] = useState<boolean>(true);

  // Dimensions lookup (in mm)
  const dimensions = useMemo(() => {
    switch (sizePreset) {
      case '100x140':
        return { width: 100, height: 140, labelAr: 'لافتة جدارية كبيرة (10×14 سم)', labelEn: 'Extended Wall Sign (100x140mm)' };
      case '100x70':
        return { width: 100, height: 70, labelAr: 'لافتة عريضة (10×7 سم)', labelEn: 'Wide Door Sign (100x70mm)' };
      case '70x50':
        return { width: 70, height: 50, labelAr: 'ملصق مدمج (7×5 سم)', labelEn: 'Compact Label (70x50mm)' };
      case '100x80':
      default:
        return { width: 100, height: 80, labelAr: 'لافتة باب الغرفة (كبير 10×8 سم - موصى به)', labelEn: 'Room Door Sign (100x80mm - Recommended)' };
    }
  }, [sizePreset]);

  // Sync state when room changes
  useEffect(() => {
    if (room) {
      setRoomNumber(room.number || '');
      setDevice(room.device || '');
      setSurveyDate(room.surveyDate || '');
      setNotes(room.notes || '');
    }
  }, [room]);

  // Compute status
  const surveyStatus = useMemo(() => {
    if (!surveyDate) {
      return {
        status: 'NO_DATE' as const,
        text: isAr ? 'غير مسجل' : 'Not set',
        badgeClass: 'bg-slate-200 text-slate-800 border-slate-400',
        dotClass: 'bg-slate-500',
        countdownText: isAr ? 'تاريخ غير محدد' : 'No date set',
        daysDiff: null,
        isExpired: false,
        isWarning: false,
        isValid: false,
      };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(surveyDate);
    expiry.setHours(0, 0, 0, 0);

    const diffTime = expiry.getTime() - today.getTime();
    const daysDiff = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (daysDiff < 0) {
      const absDays = Math.abs(daysDiff);
      return {
        status: 'EXPIRED' as const,
        text: isAr ? 'منتهي الصلاحية' : 'Expired',
        badgeClass: 'bg-rose-100 text-rose-800 border-rose-400',
        dotClass: 'bg-rose-600',
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
        badgeClass: 'bg-amber-100 text-amber-900 border-amber-400',
        dotClass: 'bg-amber-600',
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
        badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-400',
        dotClass: 'bg-emerald-600',
        countdownText: isAr ? `ساري (متبقي ${daysDiff} يوم)` : `Valid (${daysDiff}d left)`,
        daysDiff,
        isExpired: false,
        isWarning: false,
        isValid: true,
      };
    }
  }, [surveyDate, isAr]);

  // Public Report Link
  const publicUrl = useMemo(() => {
    const origin = typeof window !== 'undefined' && window.location.origin ? window.location.origin : '';
    if (!origin || !room.id) return '';
    return `${origin}/#/public/report/${encodeURIComponent(room.id)}/survey`;
  }, [room.id]);

  // Generate QR Code
  useEffect(() => {
    let isMounted = true;
    const generateQr = async () => {
      setIsGeneratingQr(true);
      try {
        const payload = publicUrl || (room.surveyUrl ? room.surveyUrl : `ROOM:${roomNumber}\nDEV:${device}\nEXP:${surveyDate}`);
        
        // High resolution QR code (360px) pure black #000000
        const dataUrl = await QRCode.toDataURL(payload, {
          width: 360,
          margin: 1,
          errorCorrectionLevel: 'M',
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
        });

        if (isMounted) {
          setQrDataUrl(dataUrl);
          setIsGeneratingQr(false);
        }
      } catch (err) {
        console.error('Error generating room survey QR:', err);
        try {
          const fallback = await QRCode.toDataURL(`ROOM:${roomNumber || 'RM'}\nSURVEY`, {
            width: 360,
            margin: 1,
            color: { dark: '#000000', light: '#ffffff' },
          });
          if (isMounted) {
            setQrDataUrl(fallback);
            setIsGeneratingQr(false);
          }
        } catch {
          if (isMounted) setIsGeneratingQr(false);
        }
      }
    };

    generateQr();
    return () => {
      isMounted = false;
    };
  }, [publicUrl, roomNumber, device, surveyDate, room.surveyUrl]);

  // Save changes to Firestore
  const handleSaveRoom = async () => {
    if (!room.id) return;
    setIsSaving(true);
    try {
      const payload = {
        number: roomNumber.trim(),
        device: device.trim(),
        surveyDate: surveyDate,
        notes: notes.trim(),
        updatedAt: Timestamp.now(),
      };
      await updateDoc(doc(db, 'room_reports', room.id), payload);
      if (onRoomUpdated) {
        onRoomUpdated({
          ...room,
          ...payload,
        });
      }
    } catch (e) {
      console.error('Error updating room in sticker modal:', e);
    } finally {
      setIsSaving(false);
    }
  };

  // Copy public link
  const handleCopyLink = () => {
    if (publicUrl && navigator.clipboard) {
      navigator.clipboard.writeText(publicUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  // Radiation Trefoil SVG String
  const radiationIconSvg = `
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor">
      <circle cx="12" cy="12" r="2.8"/>
      <path d="M12 2a10 10 0 0 0-4.63 1.13l2.45 4.25a5 5 0 0 1 4.36 0l2.45-4.25A10 10 0 0 0 12 2zm-8.87 6.13a10 10 0 0 0 0 7.74l4.25-2.45a5 5 0 0 1 0-2.84L3.13 8.13zm17.74 0l-4.25 2.45a5 5 0 0 1 0 2.84l4.25 2.45a10 10 0 0 0 0-7.74zM8.37 16.62l-2.45 4.25A10 10 0 0 0 12 22a10 10 0 0 0 6.08-1.13l-2.45-4.25a5 5 0 0 1-7.26 0z"/>
    </svg>
  `;

  // Raw HTML for sticker print
  const generateStickerRawHtml = () => {
    const isZebra = stickerTheme === 'zebra_bw';
    const hasReportPdf = Boolean(room.surveyUrl);
    const w = dimensions.width;
    const h = dimensions.height;

    return `
      <div class="room-sticker-card ${isZebra ? 'theme-zebra-bw' : 'theme-color'} size-${sizePreset}" dir="${isAr ? 'rtl' : 'ltr'}">
        <!-- Header: Radiation Safety & Hospital -->
        <div class="card-header">
          <div class="header-left">
            <div class="rad-icon-wrapper ${isZebra ? 'rad-mono' : 'rad-color'}">
              ${radiationIconSvg}
            </div>
            <div class="header-text">
              <div class="hosp-name">${isAr ? "مسح غرفة الإشعاع" : 'Radiation Room Survey'}</div>
              <div class="doc-title">${isAr ? 'شهادة ومسح إشعاعي معتمد' : 'CERTIFIED RADIATION SURVEY & SAFETY'}</div>
            </div>
          </div>
          <div class="header-badge ${isZebra ? 'badge-mono' : 'badge-rad'}">
            ☢️ ${isAr ? 'منطقة إشعاعية' : 'RADIATION AREA'}
          </div>
        </div>

        <!-- Middle: Prominent Room Number & Device Info -->
        <div class="room-hero-box">
          <div class="room-num-block">
            <span class="room-tag">${isAr ? 'رقم الغرفة' : 'ROOM NUMBER'}</span>
            <span class="room-val">${roomNumber || '—'}</span>
          </div>

          <div class="room-device-block">
            <div class="device-label">${isAr ? 'الجهاز / المعدة الطبية' : 'MEDICAL EQUIPMENT / MODALITY'}</div>
            <div class="device-name" title="${device}">${device || (isAr ? 'غير محدد' : 'N/A')}</div>
            ${departmentName ? `<div class="dept-name"><i class="dept-dot"></i>${departmentName}</div>` : ''}
          </div>
        </div>

        <!-- Survey Status & Validity Strip -->
        <div class="survey-status-strip ${surveyStatus.isExpired ? 'strip-expired' : surveyStatus.isWarning ? 'strip-warning' : 'strip-valid'}">
          <div class="strip-item">
            <span class="strip-label">${isAr ? 'تاريخ انتهاء صلاحية المسح:' : 'SURVEY EXPIRY DATE:'}</span>
            <span class="strip-val font-mono">${surveyDate || (isAr ? 'غير مسجل' : 'Not recorded')}</span>
          </div>
          <div class="strip-badge-wrap">
            <span class="strip-badge ${isZebra ? (surveyStatus.isExpired ? 'badge-mono-black' : 'badge-mono-white') : ''}">
              ${surveyStatus.text}
            </span>
          </div>
        </div>

        <!-- Bottom Grid: Large QR Code + Verification & Barcode -->
        <div class="card-bottom-grid">
          <!-- Verification and instructions -->
          <div class="instructions-block">
            <div class="scan-cta">
              <div class="scan-cta-title">
                ${isAr ? 'امسح الباركود بهاتفك المحمول' : 'SCAN QR WITH SMARTPHONE'}
              </div>
              <div class="scan-cta-desc">
                ${hasReportPdf
                  ? (isAr ? 'يفتح تقرير المسح الإشعاعي (PDF) فوراً دون تسجيل دخول' : 'Directly opens survey PDF without login')
                  : (isAr ? 'التحقق المباشر من صلاحية وامتثال الغرفة' : 'Direct verification of room safety status')}
              </div>
            </div>

            <!-- Optical Barcode simulation / Room ID -->
            <div class="barcode-linear-block">
              <div class="barcode-lines">
                <span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span>
              </div>
              <div class="barcode-text">RAD-RM-${roomNumber || '00'}</div>
            </div>

            ${notes ? `<div class="room-notes-text">${notes}</div>` : ''}
          </div>

          <!-- Large High-Contrast QR Code -->
          <div class="qr-container">
            <div class="qr-border-box">
              <img src="${qrDataUrl}" alt="Survey QR" class="qr-img-tag" />
            </div>
            <div class="qr-bottom-label">
              ${isAr ? 'شهادة إلكترونية' : 'VERIFIED CERT'}
            </div>
          </div>
        </div>

        <!-- Card Footer Micro-Stamp -->
        <div class="card-footer-stamp">
          <span>${isAr ? 'معتمد ومطابق للوائح الأمان الإشعاعي' : 'Approved according to radiation safety protocols'}</span>
          <span class="cert-code">RAD-${room.id.slice(0, 8).toUpperCase()}</span>
        </div>
      </div>
    `;
  };

  // Build full printable page
  const getFullPrintHtml = () => {
    const rawCard = generateStickerRawHtml();
    const w = dimensions.width;
    const h = dimensions.height;
    let contentHtml = '';

    if (printMode === 'thermal') {
      contentHtml = `
        <div class="print-single-wrapper">
          ${rawCard}
        </div>
      `;
    } else {
      // A4 Sheet mode
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
          <title>Room ${roomNumber} - Radiation Survey Label (${w}x${h}mm)</title>
          <style>
            @charset "utf-8";
            *, *::before, *::after {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }

            @page {
              ${printMode === 'thermal' ? `size: ${w}mm ${h}mm;` : 'size: A4 portrait;'}
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
              width: ${w}mm;
              height: ${h}mm;
              max-width: ${w}mm;
              max-height: ${h}mm;
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
              padding: 10mm;
              display: grid;
              grid-template-columns: repeat(2, ${w}mm);
              gap: 8mm 10mm;
              justify-content: center;
              align-content: start;
            }
            `}

            /* Sticker Container */
            .room-sticker-card {
              width: ${w - 3}mm;
              height: ${h - 3}mm;
              max-width: ${w - 3}mm;
              max-height: ${h - 3}mm;
              overflow: hidden;
              border-radius: 2.5mm;
              padding: 2.2mm 2.8mm;
              background: #ffffff;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              font-size: 8pt;
              line-height: 1.2;
            }

            /* --- ZEBRA / THERMAL B&W HIGH CONTRAST (Pure #000000, 0 blur/dithering) --- */
            .theme-zebra-bw {
              border: 2px solid #000000 !important;
              background: #ffffff !important;
              color: #000000 !important;
              -webkit-font-smoothing: antialiased;
            }

            .theme-zebra-bw * {
              color: #000000 !important;
              border-color: #000000 !important;
              box-shadow: none !important;
              text-shadow: none !important;
            }

            .theme-zebra-bw .card-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              border-bottom: 1.6px solid #000000 !important;
              padding-bottom: 1.2mm;
              margin-bottom: 1mm;
            }

            .theme-zebra-bw .header-left {
              display: flex;
              align-items: center;
              gap: 1.8mm;
            }

            .theme-zebra-bw .rad-icon-wrapper {
              width: 6.5mm;
              height: 6.5mm;
              color: #000000 !important;
            }

            .theme-zebra-bw .hosp-name {
              font-size: 6.5pt !important;
              font-weight: 900 !important;
              text-transform: uppercase;
              letter-spacing: -0.2px;
            }

            .theme-zebra-bw .doc-title {
              font-size: 5.6pt !important;
              font-weight: 800 !important;
            }

            .theme-zebra-bw .badge-mono {
              font-size: 6.5pt !important;
              font-weight: 900 !important;
              background: #000000 !important;
              color: #ffffff !important;
              border: 1.2px solid #000000 !important;
              padding: 0.6mm 2mm !important;
              border-radius: 1mm !important;
              text-transform: uppercase;
            }

            .theme-zebra-bw .badge-mono * {
              color: #ffffff !important;
            }

            /* Hero Room Number & Device */
            .theme-zebra-bw .room-hero-box {
              display: flex;
              align-items: center;
              gap: 2mm;
              background: #ffffff !important;
              border: 1.6px solid #000000 !important;
              border-radius: 1.5mm;
              padding: 1.2mm 2mm;
              margin-bottom: 1.2mm;
            }

            .theme-zebra-bw .room-num-block {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              padding-inline-end: 2mm;
              border-inline-end: 1.6px solid #000000 !important;
              min-width: 24mm;
            }

            .theme-zebra-bw .room-tag {
              font-size: 5.5pt !important;
              font-weight: 800 !important;
              text-transform: uppercase;
            }

            .theme-zebra-bw .room-val {
              font-size: 14pt !important;
              font-weight: 900 !important;
              font-family: "SF Mono", "Courier New", Courier, monospace, Arial !important;
              line-height: 1;
            }

            .theme-zebra-bw .room-device-block {
              flex: 1;
              min-width: 0;
            }

            .theme-zebra-bw .device-label {
              font-size: 5.4pt !important;
              font-weight: 800 !important;
              text-transform: uppercase;
            }

            .theme-zebra-bw .device-name {
              font-size: 9.5pt !important;
              font-weight: 900 !important;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            .theme-zebra-bw .dept-name {
              font-size: 6pt !important;
              font-weight: 700 !important;
            }

            /* Survey Expiry Strip */
            .theme-zebra-bw .survey-status-strip {
              display: flex;
              align-items: center;
              justify-content: space-between;
              border: 1.4px solid #000000 !important;
              background: #ffffff !important;
              border-radius: 1.2mm;
              padding: 1mm 2mm;
              margin-bottom: 1.4mm;
            }

            .theme-zebra-bw .strip-label {
              font-size: 6pt !important;
              font-weight: 800 !important;
            }

            .theme-zebra-bw .strip-val {
              font-size: 8.5pt !important;
              font-weight: 900 !important;
              font-family: "SF Mono", "Courier New", monospace !important;
              margin-inline-start: 1.5mm;
            }

            .theme-zebra-bw .badge-mono-black {
              background: #000000 !important;
              color: #ffffff !important;
              font-size: 6.2pt !important;
              font-weight: 900 !important;
              padding: 0.4mm 1.8mm !important;
              border-radius: 0.8mm !important;
              border: 1.2px solid #000000 !important;
            }

            .theme-zebra-bw .badge-mono-white {
              background: #ffffff !important;
              color: #000000 !important;
              font-size: 6.2pt !important;
              font-weight: 900 !important;
              padding: 0.4mm 1.8mm !important;
              border-radius: 0.8mm !important;
              border: 1.2px solid #000000 !important;
            }

            /* Bottom Grid: Large QR Code and Instructions */
            .theme-zebra-bw .card-bottom-grid {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 2.5mm;
              flex: 1;
              min-height: 0;
            }

            .theme-zebra-bw .instructions-block {
              flex: 1;
              min-width: 0;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              height: 100%;
            }

            .theme-zebra-bw .scan-cta-title {
              font-size: 7.2pt !important;
              font-weight: 900 !important;
              text-transform: uppercase;
            }

            .theme-zebra-bw .scan-cta-desc {
              font-size: 5.6pt !important;
              font-weight: 800 !important;
              margin-top: 0.5mm;
              line-height: 1.15;
            }

            .theme-zebra-bw .barcode-linear-block {
              margin-top: 1mm;
              border-top: 1px dashed #000000 !important;
              padding-top: 0.8mm;
            }

            .theme-zebra-bw .barcode-lines {
              display: flex;
              gap: 0.5mm;
              height: 3.5mm;
              align-items: stretch;
            }

            .theme-zebra-bw .barcode-lines span {
              width: 0.6mm;
              background: #000000 !important;
            }

            .theme-zebra-bw .barcode-text {
              font-family: "Courier New", Courier, monospace !important;
              font-size: 5.8pt !important;
              font-weight: 900 !important;
              letter-spacing: 0.5px;
            }

            .theme-zebra-bw .room-notes-text {
              font-size: 5.2pt !important;
              font-weight: 700 !important;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            /* QR Container: LARGE HIGH RESOLUTION */
            .theme-zebra-bw .qr-container {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              width: 28mm;
              min-width: 28mm;
            }

            .theme-zebra-bw .qr-border-box {
              width: 25mm;
              height: 25mm;
              border: 1.6px solid #000000 !important;
              padding: 0.6mm;
              border-radius: 1mm;
              background: #ffffff !important;
              display: flex;
              align-items: center;
              justify-content: center;
            }

            .theme-zebra-bw .qr-img-tag {
              width: 100%;
              height: 100%;
              object-fit: contain;
              image-rendering: -webkit-optimize-contrast !important;
              image-rendering: crisp-edges !important;
            }

            .theme-zebra-bw .qr-bottom-label {
              font-size: 4.8pt !important;
              font-weight: 900 !important;
              margin-top: 0.4mm;
              text-align: center;
            }

            .theme-zebra-bw .card-footer-stamp {
              border-top: 1.2px solid #000000 !important;
              padding-top: 0.6mm;
              margin-top: 0.8mm;
              display: flex;
              align-items: center;
              justify-content: space-between;
              font-size: 4.8pt !important;
              font-weight: 800 !important;
            }

            /* --- FULL COLOR MODE --- */
            .theme-color {
              border: 2px solid #e2e8f0;
              background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
              box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            }

            .theme-color .card-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              border-bottom: 2px solid #e2e8f0;
              padding-bottom: 1.2mm;
              margin-bottom: 1.2mm;
            }

            .theme-color .header-left {
              display: flex;
              align-items: center;
              gap: 1.8mm;
            }

            .theme-color .rad-icon-wrapper {
              width: 6.5mm;
              height: 6.5mm;
              color: #f59e0b;
            }

            .theme-color .hosp-name {
              font-size: 6.5pt;
              font-weight: 800;
              color: #1e293b;
            }

            .theme-color .doc-title {
              font-size: 5.6pt;
              font-weight: 700;
              color: #64748b;
            }

            .theme-color .badge-rad {
              font-size: 6.5pt;
              font-weight: 800;
              background: #fef3c7;
              color: #92400e;
              border: 1px solid #fde68a;
              padding: 0.6mm 2mm;
              border-radius: 1mm;
            }

            .theme-color .room-hero-box {
              display: flex;
              align-items: center;
              gap: 2mm;
              background: #ffffff;
              border: 1.5px solid #cbd5e1;
              border-radius: 1.5mm;
              padding: 1.2mm 2mm;
              margin-bottom: 1.2mm;
            }

            .theme-color .room-num-block {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              padding-inline-end: 2mm;
              border-inline-end: 1.5px solid #e2e8f0;
              min-width: 24mm;
            }

            .theme-color .room-tag {
              font-size: 5.5pt;
              font-weight: 700;
              color: #64748b;
            }

            .theme-color .room-val {
              font-size: 14pt;
              font-weight: 900;
              color: #4f46e5;
              font-family: monospace;
            }

            .theme-color .device-label {
              font-size: 5.4pt;
              font-weight: 700;
              color: #64748b;
            }

            .theme-color .device-name {
              font-size: 9.5pt;
              font-weight: 800;
              color: #0f172a;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            .theme-color .survey-status-strip {
              display: flex;
              align-items: center;
              justify-content: space-between;
              border-radius: 1.2mm;
              padding: 1mm 2mm;
              margin-bottom: 1.4mm;
            }

            .theme-color .strip-valid {
              background: #ecfdf5;
              border: 1.2px solid #a7f3d0;
              color: #065f46;
            }

            .theme-color .strip-warning {
              background: #fffbeb;
              border: 1.2px solid #fde68a;
              color: #92400e;
            }

            .theme-color .strip-expired {
              background: #fef2f2;
              border: 1.2px solid #fecaca;
              color: #991b1b;
            }

            .theme-color .strip-label {
              font-size: 6pt;
              font-weight: 700;
            }

            .theme-color .strip-val {
              font-size: 8.5pt;
              font-weight: 800;
              font-family: monospace;
              margin-inline-start: 1.5mm;
            }

            .theme-color .card-bottom-grid {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 2.5mm;
              flex: 1;
              min-height: 0;
            }

            .theme-color .instructions-block {
              flex: 1;
              min-width: 0;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              height: 100%;
            }

            .theme-color .scan-cta-title {
              font-size: 7.2pt;
              font-weight: 800;
              color: #1e293b;
            }

            .theme-color .scan-cta-desc {
              font-size: 5.6pt;
              font-weight: 600;
              color: #64748b;
              margin-top: 0.5mm;
            }

            .theme-color .barcode-linear-block {
              margin-top: 1mm;
              border-top: 1px dashed #cbd5e1;
              padding-top: 0.8mm;
            }

            .theme-color .barcode-lines {
              display: flex;
              gap: 0.5mm;
              height: 3.5mm;
              align-items: stretch;
            }

            .theme-color .barcode-lines span {
              width: 0.6mm;
              background: #334155;
            }

            .theme-color .barcode-text {
              font-family: monospace;
              font-size: 5.8pt;
              font-weight: 700;
              color: #475569;
            }

            .theme-color .qr-container {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              width: 28mm;
              min-width: 28mm;
            }

            .theme-color .qr-border-box {
              width: 25mm;
              height: 25mm;
              border: 1.5px solid #cbd5e1;
              padding: 0.6mm;
              border-radius: 1mm;
              background: #ffffff;
              display: flex;
              align-items: center;
              justify-content: center;
            }

            .theme-color .qr-img-tag {
              width: 100%;
              height: 100%;
              object-fit: contain;
            }

            .theme-color .qr-bottom-label {
              font-size: 4.8pt;
              font-weight: 700;
              color: #64748b;
              margin-top: 0.4mm;
            }

            .theme-color .card-footer-stamp {
              border-top: 1.2px solid #e2e8f0;
              padding-top: 0.6mm;
              margin-top: 0.8mm;
              display: flex;
              align-items: center;
              justify-content: space-between;
              font-size: 4.8pt;
              font-weight: 600;
              color: #64748b;
            }
          </style>
        </head>
        <body>
          ${contentHtml}
        </body>
      </html>
    `;
  };

  // Perform Print
  const handlePrint = () => {
    const html = getFullPrintHtml();
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.top = '-9999px';
    iframe.style.left = '-9999px';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = 'none';

    document.body.appendChild(iframe);

    const docRef = iframe.contentWindow?.document;
    if (docRef) {
      docRef.open();
      docRef.write(html);
      docRef.close();

      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1500);
      }, 350);
    }
  };

  const isZebra = stickerTheme === 'zebra_bw';

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-fade-in">
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        dir={isAr ? 'rtl' : 'ltr'}
      >
        {/* Header Modal */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center text-xl shadow-xs">
              <i className="fas fa-radiation"></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                  {isAr ? 'طباعة ملصق وباركود المسح الإشعاعي للغرفة' : 'Room Radiation Survey Barcode Label'}
                </h2>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                  {dimensions.labelAr}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {isAr
                  ? 'ملصق كبير مخصص للأبواب واللوحات الجدارية يفتح تقرير المسح (PDF) فوراً عند سحب الباركود بالهاتف'
                  : 'Large door sign that opens the radiation survey PDF instantly when scanned by any phone'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-white flex items-center justify-center transition-colors"
          >
            <i className="fas fa-times text-sm"></i>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {/* Controls Bar: Sizing, Theme & Print Mode */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800">
            {/* 1. Size Preset Selector (Highlighting Larger Sizing) */}
            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1.5 flex items-center gap-1.5">
                <i className="fas fa-expand text-indigo-500"></i>
                {isAr ? 'حجم الملصق والباركود (مقاس مخصص للأبواب):' : 'Sticker Size Preset:'}
              </label>
              <select
                value={sizePreset}
                onChange={(e) => setSizePreset(e.target.value as StickerSizePreset)}
                className="w-full text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="100x80">{isAr ? 'لافتة باب الغرفة (كبير 10×8 سم) - موصى به' : 'Door Sign (Large 100x80mm) - Recommended'}</option>
                <option value="100x140">{isAr ? 'لوحة جدارية موسعة (10×14 سم - كبير جداً)' : 'Extended Wall Sign (100x140mm)'}</option>
                <option value="100x70">{isAr ? 'لافتة عريضة (10×7 سم)' : 'Wide Door Sign (100x70mm)'}</option>
                <option value="70x50">{isAr ? 'ملصق مدمج (7×5 سم)' : 'Compact Label (70x50mm)'}</option>
              </select>
            </div>

            {/* 2. Visual Theme (Zebra B&W vs Color) */}
            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1.5 flex items-center gap-1.5">
                <i className="fas fa-palette text-amber-500"></i>
                {isAr ? 'نمط الطباعة والألوان:' : 'Print Style & Contrast:'}
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setStickerTheme('zebra_bw')}
                  className={`py-1.5 px-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 border ${
                    stickerTheme === 'zebra_bw'
                      ? 'bg-black text-white border-black shadow-xs'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <i className="fas fa-print"></i>
                  <span>{isAr ? 'طابعات Zebra (أبيض وأسود)' : 'Zebra B&W'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStickerTheme('color')}
                  className={`py-1.5 px-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 border ${
                    stickerTheme === 'color'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <i className="fas fa-tint"></i>
                  <span>{isAr ? 'ألوان كاملة (Color)' : 'Full Color'}</span>
                </button>
              </div>
            </div>

            {/* 3. Paper Output Mode */}
            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1.5 flex items-center gap-1.5">
                <i className="fas fa-copy text-emerald-500"></i>
                {isAr ? 'نوع الورق والطباعة:' : 'Paper Output:'}
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={printMode}
                  onChange={(e) => setPrintMode(e.target.value as 'thermal' | 'a4')}
                  className="flex-1 text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="thermal">{isAr ? 'طابعة حرارية (استيكر منفرد)' : 'Thermal Single Sticker'}</option>
                  <option value="a4">{isAr ? 'ورق A4 عادي (متعدد)' : 'A4 Regular Sheet'}</option>
                </select>

                {printMode === 'a4' && (
                  <div className="flex items-center gap-1 bg-white dark:bg-slate-900 px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] text-slate-400 font-bold">{isAr ? 'نسخ:' : 'Qty:'}</span>
                    <input
                      type="number"
                      min={1}
                      max={8}
                      value={copiesCount}
                      onChange={(e) => setCopiesCount(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-10 text-xs font-bold bg-transparent text-center text-slate-800 dark:text-white outline-none"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Real-Scale Visual Preview of the Room Sticker */}
          <div className="flex flex-col items-center">
            <div className="text-center mb-2 flex items-center gap-2">
              <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                {isAr ? 'معاينة اللافتة بالحجم الكبير للأبواب:' : 'Preview Large Door Sign:'}
              </span>
              <span className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md text-slate-600 dark:text-slate-300 font-bold">
                {dimensions.width}mm × {dimensions.height}mm ({dimensions.width / 10} × {dimensions.height / 10} cm)
              </span>
            </div>

            {/* Render Preview Card */}
            <div
              className={`w-full max-w-[500px] rounded-3xl p-5 sm:p-6 transition-all duration-200 shadow-xl ${
                isZebra
                  ? 'bg-white text-black border-4 border-black'
                  : 'bg-white dark:bg-slate-900 border-2 border-indigo-100 dark:border-indigo-900/60 shadow-indigo-500/5'
              }`}
            >
              {/* Card Header */}
              <div
                className={`flex items-center justify-between pb-3 mb-3 border-b-2 ${
                  isZebra ? 'border-black' : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 flex items-center justify-center ${isZebra ? 'text-black' : 'text-amber-500'}`}>
                    <svg viewBox="0 0 24 24" className="w-full h-full" fill="currentColor">
                      <circle cx="12" cy="12" r="2.8" />
                      <path d="M12 2a10 10 0 0 0-4.63 1.13l2.45 4.25a5 5 0 0 1 4.36 0l2.45-4.25A10 10 0 0 0 12 2zm-8.87 6.13a10 10 0 0 0 0 7.74l4.25-2.45a5 5 0 0 1 0-2.84L3.13 8.13zm17.74 0l-4.25 2.45a5 5 0 0 1 0 2.84l4.25 2.45a10 10 0 0 0 0-7.74zM8.37 16.62l-2.45 4.25A10 10 0 0 0 12 22a10 10 0 0 0 6.08-1.13l-2.45-4.25a5 5 0 0 1-7.26 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className={`text-xs font-black uppercase ${isZebra ? 'text-black' : 'text-slate-900 dark:text-white'}`}>
                      {isAr ? "مسح غرفة الإشعاع" : 'Radiation Room Survey'}
                    </h3>
                    <p className={`text-[11px] font-bold ${isZebra ? 'text-black' : 'text-slate-500 dark:text-slate-400'}`}>
                      {isAr ? 'شهادة ومسح إشعاعي معتمد للغرفة' : 'CERTIFIED RADIATION SURVEY & SAFETY'}
                    </p>
                  </div>
                </div>

                <span
                  className={`text-[10px] font-black px-2.5 py-1 rounded-lg border ${
                    isZebra
                      ? 'bg-black text-white border-black'
                      : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                  }`}
                >
                  ☢️ {isAr ? 'منطقة إشعاعية' : 'RADIATION AREA'}
                </span>
              </div>

              {/* Room Hero Box */}
              <div
                className={`flex items-center gap-4 p-3.5 rounded-2xl mb-3 border-2 ${
                  isZebra
                    ? 'border-black bg-white'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50'
                }`}
              >
                <div
                  className={`text-center px-4 py-1 border-inline-end-2 min-w-[100px] ${
                    isZebra ? 'border-black' : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <span className={`text-[10px] font-black block uppercase ${isZebra ? 'text-black' : 'text-slate-400'}`}>
                    {isAr ? 'رقم الغرفة' : 'ROOM #'}
                  </span>
                  <span className={`text-2xl font-black font-mono ${isZebra ? 'text-black' : 'text-indigo-600 dark:text-indigo-400'}`}>
                    {roomNumber || '—'}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className={`text-[10px] font-black uppercase ${isZebra ? 'text-black' : 'text-slate-400'}`}>
                    {isAr ? 'اسم الجهاز والمعدة الطبية' : 'MEDICAL EQUIPMENT'}
                  </div>
                  <div className={`text-sm font-black truncate ${isZebra ? 'text-black' : 'text-slate-900 dark:text-white'}`}>
                    {device}
                  </div>
                  {departmentName && (
                    <div className={`text-[11px] font-bold ${isZebra ? 'text-black' : 'text-slate-500'}`}>
                      {departmentName}
                    </div>
                  )}
                </div>
              </div>

              {/* Expiry Status Strip */}
              <div
                className={`flex items-center justify-between p-3 rounded-xl mb-3 border-2 ${
                  isZebra
                    ? 'border-black bg-white'
                    : surveyStatus.isExpired
                    ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300'
                    : surveyStatus.isWarning
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300'
                    : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-black">{isAr ? 'انتهاء صلاحية المسح:' : 'Survey Expiry:'}</span>
                  <span className="font-mono text-xs font-black">{surveyDate || (isAr ? 'غير محدد' : 'Not set')}</span>
                </div>
                <span
                  className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${
                    isZebra
                      ? surveyStatus.isExpired
                        ? 'bg-black text-white border-black'
                        : 'bg-white text-black border-black'
                      : surveyStatus.badgeClass
                  }`}
                >
                  {surveyStatus.text}
                </span>
              </div>

              {/* Bottom Large QR Code and Barcode */}
              <div className="flex items-center justify-between gap-4 pt-1">
                <div className="flex-1 space-y-2">
                  <div>
                    <div className={`text-xs font-black uppercase ${isZebra ? 'text-black' : 'text-slate-900 dark:text-white'}`}>
                      {isAr ? 'امسح الباركود بهاتفك المحمول' : 'SCAN WITH SMARTPHONE'}
                    </div>
                    <div className={`text-[10px] font-bold mt-0.5 ${isZebra ? 'text-black' : 'text-slate-500 dark:text-slate-400'}`}>
                      {room.surveyUrl
                        ? (isAr ? 'يفتح تقرير المسح الإشعاعي (PDF) فوراً دون تسجيل دخول' : 'Directly opens survey PDF without login')
                        : (isAr ? 'التحقق المباشر من امتثال الغرفة' : 'Direct verification')}
                    </div>
                  </div>

                  {/* Linear Barcode representation */}
                  <div className={`pt-2 border-t border-dashed ${isZebra ? 'border-black' : 'border-slate-300 dark:border-slate-700'}`}>
                    <div className="flex gap-[2px] h-6 items-stretch">
                      {Array.from({ length: 28 }).map((_, i) => (
                        <div
                          key={i}
                          className={`w-[2px] ${i % 3 === 0 ? 'w-[3px]' : 'w-[1.5px]'} ${
                            isZebra ? 'bg-black' : 'bg-slate-700 dark:bg-slate-300'
                          }`}
                        />
                      ))}
                    </div>
                    <div className={`text-[10px] font-mono font-bold mt-1 ${isZebra ? 'text-black' : 'text-slate-600 dark:text-slate-400'}`}>
                      RAD-RM-{roomNumber}
                    </div>
                  </div>
                </div>

                {/* Big High-Contrast QR Code */}
                <div className="flex flex-col items-center">
                  <div
                    className={`w-28 h-28 p-1.5 rounded-2xl bg-white border-2 flex items-center justify-center ${
                      isZebra ? 'border-black' : 'border-slate-300 dark:border-slate-700 shadow-md'
                    }`}
                  >
                    {isGeneratingQr ? (
                      <div className="w-6 h-6 border-2 border-black border-t-transparent animate-spin rounded-full" />
                    ) : (
                      <img src={qrDataUrl} alt="Room Survey QR" className="w-full h-full object-contain" />
                    )}
                  </div>
                  <span className={`text-[9px] font-black mt-1 ${isZebra ? 'text-black' : 'text-slate-400'}`}>
                    {isAr ? 'شهادة إلكترونية' : 'VERIFIED CERT'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Editable Data & Direct Link Section */}
          <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <i className="fas fa-edit text-indigo-500"></i>
                {isAr ? 'تعديل سريع لبيانات اللافتة وحفظها مباشرة:' : 'Quick Edit & Update:'}
              </span>
              <button
                type="button"
                onClick={handleSaveRoom}
                disabled={isSaving}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 disabled:opacity-50"
              >
                <i className={`fas ${isSaving ? 'fa-spinner fa-spin' : 'fa-save'}`}></i>
                <span>{isAr ? 'حفظ التعديل' : 'Save'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">{isAr ? 'رقم الغرفة:' : 'Room Number:'}</label>
                <input
                  type="text"
                  value={roomNumber}
                  onChange={(e) => setRoomNumber(e.target.value)}
                  className="w-full text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-white outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">{isAr ? 'الجهاز / المعدة:' : 'Equipment:'}</label>
                <input
                  type="text"
                  value={device}
                  onChange={(e) => setDevice(e.target.value)}
                  className="w-full text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-white outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">{isAr ? 'تاريخ انتهاء المسح:' : 'Survey Expiry:'}</label>
                <input
                  type="date"
                  value={surveyDate}
                  onChange={(e) => setSurveyDate(e.target.value)}
                  className="w-full text-xs font-mono font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-white outline-none"
                />
              </div>
            </div>

            {/* Direct Public Link Actions */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                <i className="fas fa-link text-indigo-500"></i>
                <span>{isAr ? 'الرابط المباشر للتقرير (بدون تسجيل دخول):' : 'Public direct scan URL:'}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-100 transition flex items-center gap-1 text-xs"
                >
                  <i className={`fas ${copiedLink ? 'fa-check text-emerald-500' : 'fa-copy'}`}></i>
                  <span>{copiedLink ? (isAr ? 'تم النسخ!' : 'Copied!') : (isAr ? 'نسخ الرابط' : 'Copy')}</span>
                </button>
                {publicUrl && (
                  <a
                    href={publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 font-bold hover:bg-indigo-100 transition flex items-center gap-1 text-xs"
                  >
                    <i className="fas fa-external-link-alt"></i>
                    <span>{isAr ? 'تجربة فتح الرابط' : 'Test Open'}</span>
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Zebra Printer Setup Guide Collapsible */}
          <div className="bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/50 rounded-2xl p-3.5">
            <button
              type="button"
              onClick={() => setShowZebraGuide(!showZebraGuide)}
              className="w-full flex items-center justify-between text-amber-900 dark:text-amber-200 text-xs font-bold"
            >
              <div className="flex items-center gap-2">
                <i className="fas fa-info-circle text-amber-600"></i>
                <span>{isAr ? 'إرشادات وضبط طابعات Zebra الحرارية للحصول على أعلى وضوح' : 'Zebra Thermal Printer Best Clarity Guide'}</span>
              </div>
              <i className={`fas fa-chevron-${showZebraGuide ? 'up' : 'down'}`}></i>
            </button>

            {showZebraGuide && (
              <div className="mt-3 pt-3 border-t border-amber-200/60 dark:border-amber-900/60 text-xs text-amber-800 dark:text-amber-300 space-y-2">
                <p>
                  <strong>1. درجة الحرق والغمقان (Darkness):</strong> اضبطها بين <strong>20 و 24</strong> من إعدادات الطابعة للطباعة بلون أسود فاحم دون أي ضبابية.
                </p>
                <p>
                  <strong>2. سرعة الطباعة (Print Speed):</strong> اخفض السرعة إلى <strong>2.0 أو 3.0 بوصة/ثانية (IPS)</strong> لإتاحة الوقت للرأس الحراري لطباعة الباركود بدقة عالية.
                </p>
                <p>
                  <strong>3. نوع الورق (Media Type):</strong> اختر <strong>Direct Thermal</strong> إذا كان الورق حرارياً، أو <strong>Thermal Transfer</strong> في حال استخدام شريط ريبون.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/60 gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-100 transition"
          >
            {isAr ? 'إغلاق' : 'Close'}
          </button>

          <button
            onClick={handlePrint}
            className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs shadow-lg shadow-indigo-600/30 hover:shadow-indigo-600/50 transition active:scale-95 flex items-center gap-2"
          >
            <i className="fas fa-print"></i>
            <span>{isAr ? `طباعة لافتة الغرفة الآن (${dimensions.width}×${dimensions.height} مم)` : 'Print Label Now'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default RoomStickerModal;
