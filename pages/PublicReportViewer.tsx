import React, { useEffect, useState, useRef, useCallback } from 'react';
// @ts-ignore
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
// @ts-ignore
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseData';
import Loading from '../components/Loading';
import { getDeviceComplianceStatus, getDaysRemaining } from '../components/devices/deviceTypes';

// Import PDF.js for bulletproof mobile canvas rendering
import * as pdfjsLib from 'pdfjs-dist';

// Setup PDF.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

interface PublicDeviceInfo {
  id: string;
  name?: string;
  serial?: string;
  model?: string;
  category?: string;
  roomId?: string;
  room?: string;
  roomNumber?: string;
  maintDate?: string;
  maintUrl?: string;
  qualDate?: string;
  qualUrl?: string;
  installDate?: string;
  supplier?: string;
  agent?: string;
  status?: string;
  [key: string]: any;
}

export const PublicReportViewer: React.FC = () => {
  const { deviceId: paramDeviceId, reportType: paramReportType } = useParams<{
    deviceId?: string;
    reportType?: string;
  }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const deviceId = paramDeviceId || searchParams.get('deviceId') || '';
  const reportType = (paramReportType || searchParams.get('report') || searchParams.get('type') || 'ppm').toLowerCase();

  const [loading, setLoading] = useState(true);
  const [device, setDevice] = useState<PublicDeviceInfo | null>(null);
  const [rawReportUrl, setRawReportUrl] = useState<string>('');
  const [activeReportType, setActiveReportType] = useState<string>(reportType);
  const [error, setError] = useState<string>('');
  const [isCopied, setIsCopied] = useState(false);

  // PDF.js State
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pdfLoading, setPdfLoading] = useState<boolean>(false);
  const [pdfError, setPdfError] = useState<string>('');
  const [scale, setScale] = useState<number>(1.2);
  const [isImage, setIsImage] = useState<boolean>(false);
  const [blobUrl, setBlobUrl] = useState<string>('');

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);

  // 1. Fetch device data from Firestore
  useEffect(() => {
    let isMounted = true;

    const fetchDeviceData = async () => {
      if (!deviceId) {
        if (isMounted) {
          setError('معرف الجهاز غير محدد في الرابط');
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        setError('');

        const deviceDocRef = doc(db, 'inventory_devices', deviceId);
        const deviceSnap = await getDoc(deviceDocRef);

        if (!deviceSnap.exists()) {
          if (isMounted) {
            setError('الجهاز غير مسجل أو تم حذفه من قاعدة البيانات');
            setLoading(false);
          }
          return;
        }

        const data = { id: deviceSnap.id, ...deviceSnap.data() } as PublicDeviceInfo;
        if (!isMounted) return;
        setDevice(data);

        // Determine target report URL
        let targetUrl = '';
        let resolvedType = reportType;
        if (reportType === 'qc' || reportType === 'quality') {
          targetUrl = data.qualUrl || '';
          resolvedType = 'qc';
        } else if (reportType === 'device') {
          if (data.maintUrl) {
            targetUrl = data.maintUrl;
            resolvedType = 'ppm';
          } else if (data.qualUrl) {
            targetUrl = data.qualUrl;
            resolvedType = 'qc';
          }
        } else {
          // Default: PPM
          if (data.maintUrl) {
            targetUrl = data.maintUrl;
            resolvedType = 'ppm';
          } else if (data.qualUrl) {
            targetUrl = data.qualUrl;
            resolvedType = 'qc';
          }
        }

        setActiveReportType(resolvedType);
        setRawReportUrl(targetUrl);
      } catch (err: any) {
        console.error('Error fetching public device report:', err);
        if (isMounted) {
          setError('تعذر تحميل بيانات الجهاز. يرجى التحقق من اتصال الإنترنت.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchDeviceData();

    return () => {
      isMounted = false;
    };
  }, [deviceId, reportType]);

  // 2. Process and Load PDF document using PDF.js or Image handler
  useEffect(() => {
    let isMounted = true;
    let localBlobUrl: string | null = null;

    if (!rawReportUrl) {
      setPdfDoc(null);
      setNumPages(0);
      setIsImage(false);
      setBlobUrl('');
      return;
    }

    const checkIsImage =
      rawReportUrl.startsWith('data:image/') ||
      /\.(jpg|jpeg|png|webp|gif|bmp)($|\?)/i.test(rawReportUrl);

    if (checkIsImage) {
      setIsImage(true);
      setPdfDoc(null);
      setNumPages(0);
      setBlobUrl(rawReportUrl);
      return;
    }

    setIsImage(false);
    setPdfLoading(true);
    setPdfError('');

    const loadPdfDocument = async () => {
      try {
        let loadingTask: any;

        // If Base64 data URL
        if (rawReportUrl.startsWith('data:')) {
          try {
            const parts = rawReportUrl.split(',');
            const mimeMatch = parts[0].match(/:(.*?);/);
            const mimeType = mimeMatch ? mimeMatch[1] : 'application/pdf';
            const base64Data = parts[1];

            const byteCharacters = atob(base64Data);
            const byteNumbers = new Uint8Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }

            // Create blob for native downloads/viewers
            const blob = new Blob([byteNumbers], { type: mimeType });
            localBlobUrl = URL.createObjectURL(blob);
            if (isMounted) setBlobUrl(localBlobUrl);

            // Load directly from binary Uint8Array into PDF.js
            loadingTask = pdfjsLib.getDocument({ data: byteNumbers });
          } catch (b64Err) {
            console.error('Failed to parse base64 PDF:', b64Err);
            throw new Error('تنسيق ملف الـ PDF غير صالح');
          }
        } else {
          // Remote HTTP/HTTPS URL
          localBlobUrl = rawReportUrl;
          if (isMounted) setBlobUrl(rawReportUrl);
          loadingTask = pdfjsLib.getDocument({
            url: rawReportUrl,
            withCredentials: false,
          });
        }

        const loadedPdf = await loadingTask.promise;
        if (!isMounted) return;

        setPdfDoc(loadedPdf);
        setNumPages(loadedPdf.numPages);
        setCurrentPage(1);
      } catch (err: any) {
        console.error('PDF.js loading error:', err);
        if (isMounted) {
          setPdfError('تعذر عرض ملف الـ PDF عبر المتصفح مباشرة. اضغط على زر التحميل أو الفتح المباشر لمطالعة التقرير.');
        }
      } finally {
        if (isMounted) setPdfLoading(false);
      }
    };

    loadPdfDocument();

    return () => {
      isMounted = false;
      if (localBlobUrl && localBlobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(localBlobUrl);
      }
    };
  }, [rawReportUrl]);

  // 3. Render all pages of PDF to HTML5 canvases with High-DPI support
  const renderAllPages = useCallback(async () => {
    if (!pdfDoc || numPages === 0) return;

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const canvas = canvasRefs.current[pageNum - 1];
      if (!canvas) continue;

      try {
        const page = await pdfDoc.getPage(pageNum);
        const pixelRatio = window.devicePixelRatio || 1.5;

        // Auto calculate scale for mobile container if scale is auto
        let effectiveScale = scale;
        if (containerRef.current) {
          const containerWidth = containerRef.current.clientWidth - 32;
          const defaultViewport = page.getViewport({ scale: 1 });
          if (containerWidth > 0 && defaultViewport.width > 0) {
            // Target width with zoom multiplier
            effectiveScale = (containerWidth / defaultViewport.width) * (scale / 1.2);
            effectiveScale = Math.max(0.6, Math.min(effectiveScale, 3.0));
          }
        }

        const viewport = page.getViewport({ scale: effectiveScale });
        const context = canvas.getContext('2d');
        if (!context) continue;

        // Set high-DPI canvas dimensions
        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        await page.render(renderContext).promise;
      } catch (pageErr) {
        console.warn(`Error rendering PDF page ${pageNum}:`, pageErr);
      }
    }
  }, [pdfDoc, numPages, scale]);

  useEffect(() => {
    renderAllPages();
  }, [renderAllPages]);

  // Auto-fit to width on window resize
  useEffect(() => {
    const handleResize = () => {
      renderAllPages();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderAllPages]);

  // Active Document Metadata
  const isPpm = activeReportType !== 'qc' && activeReportType !== 'quality';
  const reportTitleAr = isPpm ? 'تقرير الصيانة الوقائية السنوي (PPM)' : 'تقرير ضبط ومراقبة الجودة (QC)';
  const reportTitleEn = isPpm ? 'PPM Maintenance Inspection Report' : 'Quality Control (QC) Certificate';
  const dueDate = isPpm ? device?.maintDate : device?.qualDate;
  const daysLeft = dueDate ? getDaysRemaining(dueDate) : null;
  const complianceInfo = device ? getDeviceComplianceStatus(device as any) : null;

  // Actions
  const handleDownload = () => {
    const target = blobUrl || rawReportUrl;
    if (!target) return;
    const a = document.createElement('a');
    a.href = target;
    const cleanDevName = (device?.name || 'Device').replace(/[^a-zA-Z0-9_\u0600-\u06FF-]/g, '_');
    a.download = `${isPpm ? 'PPM_Report' : 'QC_Report'}_${cleanDevName}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleOpenDirect = () => {
    const target = blobUrl || rawReportUrl;
    if (!target) return;
    window.open(target, '_blank');
  };

  const handlePrint = () => {
    window.print();
  };

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    }
  };

  const handleSwitchReport = (type: 'ppm' | 'qc') => {
    if (!deviceId) return;
    navigate(`/public/report/${deviceId}/${type}`);
  };

  // Zoom helpers
  const handleZoomIn = () => setScale((prev) => Math.min(prev + 0.25, 2.5));
  const handleZoomOut = () => setScale((prev) => Math.max(prev - 0.25, 0.7));
  const handleResetZoom = () => setScale(1.2);

  // --- Initial Loading Screen ---
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-white" dir="rtl">
        <div className="w-16 h-16 rounded-2xl bg-sky-500/20 flex items-center justify-center mb-4 text-sky-400">
          <Loading />
        </div>
        <h2 className="text-xl font-bold tracking-tight">جاري قراءة تقرير الـ PDF...</h2>
        <p className="text-xs text-slate-400 mt-2">يتم فتح المستند الطبي مباشرة بدون تسجيل دخول</p>
      </div>
    );
  }

  // --- Error Screen (Invalid Device / Missing DB record) ---
  if (error || !device) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 text-white" dir="rtl">
        <div className="max-w-md w-full bg-slate-800 rounded-3xl p-6 sm:p-8 text-center border border-slate-700 shadow-2xl space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto text-2xl border border-amber-500/20">
            <i className="fas fa-exclamation-triangle"></i>
          </div>
          <h2 className="text-lg font-bold text-slate-100">{error || 'الجهاز غير موجود'}</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            تأكد من مسح الرمز الصحيح المطبوع على ملصق الجهاز الطبي.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-bold transition-all"
          >
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none" dir="rtl">
      {/* 
        ============================================================
        TOP DEDICATED PDF VIEWER TOOLBAR (Like Adobe / Google Drive)
        ============================================================
      */}
      <header className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 shadow-lg px-3 py-2.5 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2.5">
          {/* Document Brand & Title */}
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-white text-base sm:text-lg shadow-md shrink-0 ${
              isPpm ? 'bg-gradient-to-br from-sky-500 to-blue-700' : 'bg-gradient-to-br from-purple-500 to-indigo-700'
            }`}>
              <i className={`fas ${isPpm ? 'fa-tools' : 'fa-certificate'}`}></i>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                  isPpm ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                }`}>
                  {isPpm ? 'PPM REPORT' : 'QC REPORT'}
                </span>
                <span className="text-xs sm:text-sm font-bold text-white truncate max-w-[150px] sm:max-w-[280px]">
                  {device.name || 'Medical Device'}
                </span>
                <span className="text-[10px] text-slate-400 hidden md:inline">
                  &bull; غرفة: <strong className="text-sky-300">{device.roomNumber || device.room || 'غير محدد'}</strong>
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate max-w-[260px] sm:max-w-md">
                {reportTitleAr}
              </p>
            </div>
          </div>

          {/* Quick Switch (PPM / QC) */}
          <div className="hidden sm:flex items-center bg-slate-800/80 p-0.5 rounded-lg border border-slate-700 text-xs">
            <button
              onClick={() => handleSwitchReport('ppm')}
              className={`px-2.5 py-1 rounded-md font-bold transition-all ${
                isPpm ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-tools ml-1"></i>
              PPM
            </button>
            <button
              onClick={() => handleSwitchReport('qc')}
              className={`px-2.5 py-1 rounded-md font-bold transition-all ${
                !isPpm ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-certificate ml-1"></i>
              QC
            </button>
          </div>

          {/* Viewer Tools & Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Zoom Controls (Hidden on narrow screens) */}
            {numPages > 0 && !isImage && (
              <div className="hidden md:flex items-center bg-slate-800/80 rounded-lg border border-slate-700 px-1 py-0.5 text-xs">
                <button
                  onClick={handleZoomOut}
                  className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 rounded transition"
                  title="تصغير"
                >
                  <i className="fas fa-minus text-[10px]"></i>
                </button>
                <button
                  onClick={handleResetZoom}
                  className="px-2 h-7 flex items-center justify-center font-mono text-[11px] text-slate-300 hover:text-white"
                  title="إعادة ضبط الحجم"
                >
                  {Math.round(scale * 100)}%
                </button>
                <button
                  onClick={handleZoomIn}
                  className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 rounded transition"
                  title="تكبير"
                >
                  <i className="fas fa-plus text-[10px]"></i>
                </button>
              </div>
            )}

            {/* Direct Open in native browser/reader */}
            {rawReportUrl && (
              <button
                onClick={handleOpenDirect}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700 hover:border-sky-500/50 rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95"
                title="فتح مباشر في تطبيق PDF الخاص بالهاتف"
              >
                <i className="fas fa-external-link-alt text-[11px]"></i>
                <span className="hidden xs:inline">فتح مباشر</span>
              </button>
            )}

            {/* Download PDF */}
            {rawReportUrl && (
              <button
                onClick={handleDownload}
                className="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-sky-900/30 transition active:scale-95"
                title="تحميل ملف الـ PDF إلى الهاتف"
              >
                <i className="fas fa-download text-[11px]"></i>
                <span>تحميل</span>
              </button>
            )}

            {/* Print */}
            <button
              onClick={handlePrint}
              className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white flex items-center justify-center text-xs transition"
              title="طباعة التقرير"
            >
              <i className="fas fa-print"></i>
            </button>

            {/* Share */}
            <button
              onClick={handleShare}
              className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white flex items-center justify-center text-xs transition"
              title="نسخ رابط التقرير"
            >
              <i className={`fas ${isCopied ? 'fa-check text-emerald-400' : 'fa-share-alt'}`}></i>
            </button>
          </div>
        </div>

        {/* Mobile Sub-bar: Device info pills & Report Switch */}
        <div className="max-w-6xl mx-auto mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 flex-wrap gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span>
              الغرفة: <strong className="text-white font-mono">{device.roomNumber || device.room || 'N/A'}</strong>
            </span>
            <span>
              الرقم التسلسلي: <strong className="text-white font-mono">{device.serial || 'N/A'}</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <span>صلاحية {isPpm ? 'PPM' : 'QC'}:</span>
              <strong className={`font-mono px-2 py-0.5 rounded text-[10px] font-bold ${
                daysLeft === null
                  ? 'bg-slate-800 text-slate-300'
                  : daysLeft <= 0
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  : daysLeft <= 30
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              }`}>
                {dueDate || 'غير محدد'}
                {daysLeft !== null && (
                  <span className="mr-1">
                    ({daysLeft <= 0 ? `منتهي منذ ${Math.abs(daysLeft)} يوم` : `باقي ${daysLeft} يوم`})
                  </span>
                )}
              </strong>
            </span>

            {/* Dynamic Compliance Badge */}
            {complianceInfo && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${complianceInfo.badgeClass}`}>
                <i className={`fas ${complianceInfo.icon} text-[9px]`}></i>
                <span>{complianceInfo.titleAr}</span>
              </span>
            )}
          </div>

          <div className="flex sm:hidden items-center gap-1">
            <button
              onClick={() => handleSwitchReport('ppm')}
              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                isPpm ? 'bg-sky-600 text-white' : 'text-slate-400'
              }`}
            >
              PPM
            </button>
            <button
              onClick={() => handleSwitchReport('qc')}
              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                !isPpm ? 'bg-purple-600 text-white' : 'text-slate-400'
              }`}
            >
              QC
            </button>
          </div>
        </div>
      </header>

      {/* 
        ============================================================
        DOCUMENT CANVAS CONTAINER (Pure PDF Reader, No System Clutter)
        ============================================================
      */}
      <main
        ref={containerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-6 flex flex-col items-center bg-slate-950 min-h-[calc(100vh-120px)]"
      >
        {/* Case 1: Empty / No document attached yet */}
        {!rawReportUrl && (
          <div className="max-w-lg w-full my-auto bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-center space-y-4 shadow-xl">
            <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto text-slate-400 text-2xl">
              <i className="fas fa-file-pdf"></i>
            </div>
            <div className="space-y-1">
              <h3 className="text-base sm:text-lg font-bold text-white">
                لا يوجد تقرير PDF مرفق حالياً لـ ({isPpm ? 'PPM' : 'QC'})
              </h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                الجهاز مسجل ومعتمد بالنظام، ولكن لم يتم إرفاق ملف الفحص الأخير بعد.
              </p>
            </div>

            {/* Device Passport Summary Card */}
            <div className="bg-slate-950/80 rounded-2xl p-4 border border-slate-800 text-right space-y-2 text-xs">
              <div className="flex justify-between border-b border-slate-800/80 pb-2">
                <span className="text-slate-400">اسم الجهاز:</span>
                <span className="font-bold text-white">{device.name}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800/80 pb-2">
                <span className="text-slate-400">رقم الغرفة:</span>
                <span className="font-mono text-sky-400">{device.roomNumber || device.room || 'N/A'}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800/80 pb-2">
                <span className="text-slate-400">الرقم التسلسلي (SN):</span>
                <span className="font-mono text-white">{device.serial || 'N/A'}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800/80 pb-2">
                <span className="text-slate-400">تاريخ الاستحقاق المسجل:</span>
                <span className={`font-mono font-bold ${
                  daysLeft === null ? 'text-slate-400' : daysLeft <= 0 ? 'text-rose-400' : daysLeft <= 30 ? 'text-amber-400' : 'text-emerald-400'
                }`}>
                  {dueDate || 'غير محدد'}
                  {daysLeft !== null && ` (${daysLeft <= 0 ? `منتهي منذ ${Math.abs(daysLeft)} يوم` : `باقي ${daysLeft} يوم`})`}
                </span>
              </div>
              {complianceInfo && (
                <div className="pt-1 flex items-center justify-between">
                  <span className="text-slate-400">حالة التفتيش والامتثال:</span>
                  <span className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded text-[11px] ${complianceInfo.badgeClass}`}>
                    <i className={`fas ${complianceInfo.icon} text-[10px]`}></i>
                    <span>{complianceInfo.titleAr}</span>
                  </span>
                </div>
              )}
            </div>

            {/* Quick Button to try the other report if available */}
            <div className="pt-2 flex justify-center gap-2">
              <button
                onClick={() => handleSwitchReport(isPpm ? 'qc' : 'ppm')}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition"
              >
                عرض {isPpm ? 'تقرير الـ QC' : 'تقرير الـ PPM'} بدلاً من ذلك
              </button>
            </div>
          </div>
        )}

        {/* Case 2: Loading PDF pages */}
        {pdfLoading && (
          <div className="my-auto flex flex-col items-center justify-center p-8 space-y-3">
            <div className="w-12 h-12 rounded-xl bg-sky-500/10 flex items-center justify-center text-sky-400 text-xl animate-spin">
              <i className="fas fa-spinner"></i>
            </div>
            <p className="text-sm font-bold text-slate-200">جاري معالجة صفحات المستند...</p>
            <span className="text-xs text-slate-500">يتم توليد الصفحات بدقة فائقة للهاتف</span>
          </div>
        )}

        {/* Case 3: PDF Render Error with direct action fallback */}
        {pdfError && (
          <div className="max-w-md w-full my-auto bg-slate-900 border border-amber-900/40 rounded-2xl p-6 text-center space-y-4">
            <i className="fas fa-exclamation-circle text-3xl text-amber-500"></i>
            <h4 className="text-sm font-bold text-slate-200">{pdfError}</h4>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleOpenDirect}
                className="w-full py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition"
              >
                <i className="fas fa-external-link-alt ml-1.5"></i>
                فتح المستند في تطبيق الهاتف الخارجي
              </button>
              <button
                onClick={handleDownload}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition"
              >
                <i className="fas fa-download ml-1.5"></i>
                تحميل ملف الـ PDF
              </button>
            </div>
          </div>
        )}

        {/* Case 4: Document is an Image (JPG/PNG) */}
        {isImage && rawReportUrl && (
          <div className="max-w-4xl w-full flex flex-col items-center my-auto p-2">
            <img
              src={blobUrl || rawReportUrl}
              alt={reportTitleAr}
              className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl border border-slate-800 bg-black"
            />
          </div>
        )}

        {/* Case 5: PDF Document Pages Rendered via HTML5 Canvas (100% Reliable on all Phones) */}
        {!isImage && numPages > 0 && (
          <div className="w-full flex flex-col items-center space-y-6 max-w-5xl">
            {Array.from({ length: numPages }).map((_, idx) => {
              const pageNumber = idx + 1;
              return (
                <div
                  key={`pdf-page-${pageNumber}`}
                  className="flex flex-col items-center w-full group"
                >
                  {/* Page Number Label */}
                  <div className="w-full flex items-center justify-between max-w-[850px] px-2 mb-1.5 text-[11px] text-slate-500 font-mono">
                    <span>صفحة {pageNumber} من {numPages}</span>
                    <span className="text-[10px] text-slate-600 hidden sm:inline">
                      {device.name} &bull; {isPpm ? 'PPM' : 'QC'}
                    </span>
                  </div>

                  {/* Canvas Sheet (Clean Paper Presentation) */}
                  <div className="relative bg-white rounded-xl shadow-2xl shadow-black/80 overflow-hidden border border-slate-700/50 flex items-center justify-center max-w-full">
                    <canvas
                      ref={(el) => (canvasRefs.current[idx] = el)}
                      className="block max-w-full h-auto"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Floating Fast Download Button for Mobile Scanners */}
      {rawReportUrl && (
        <div className="fixed bottom-4 left-4 z-40 sm:hidden">
          <button
            onClick={handleDownload}
            className="w-12 h-12 rounded-full bg-sky-600 text-white shadow-2xl flex items-center justify-center text-lg active:scale-90 transition shadow-sky-600/50"
            title="تحميل الـ PDF"
          >
            <i className="fas fa-file-download"></i>
          </button>
        </div>
      )}
    </div>
  );
};

export default PublicReportViewer;
