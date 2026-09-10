import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useLanguage } from '../contexts/LanguageContext';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const { language } = useLanguage();
  const isAr = language === 'ar';

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-md hover:from-blue-500 hover:to-indigo-500 transition cursor-pointer active:scale-95"
        title={isAr ? 'تثبيت التطبيق على الجوال' : 'Install App on Mobile'}
      >
        <i className="fas fa-download text-xs"></i>
        <span>{isAr ? 'تثبيت التطبيق' : 'Install App'}</span>
      </button>
    );
  }

  // iOS Safari flow (beforeinstallprompt is not supported by WebKit)
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer"
          title={isAr ? 'تثبيت على آيفون' : 'Install on iPhone'}
        >
          <i className="fab fa-apple text-xs"></i>
          <span>{isAr ? 'تثبيت التطبيق' : 'Install on iOS'}</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-[100050] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800 text-right">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-base">
                  <i className="fab fa-apple text-xl text-blue-500"></i>
                  <h3>{isAr ? 'تثبيت التطبيق على آيفون / آيباد' : 'Install on iPhone / iPad'}</h3>
                </div>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm p-1 rounded-lg"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>

              <div className="mt-4 space-y-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                <p className="font-semibold text-slate-800 dark:text-slate-200">
                  {isAr 
                    ? 'لاستلام الإشعارات عند قفل التطبيق على أجهزة آبل، اتبع الخطوتين:' 
                    : 'To receive notifications when the app is closed on iOS:'}
                </p>
                <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700">
                  <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">1</span>
                  <p>
                    {isAr 
                      ? 'اضغط على زر المشاركة (Share ⎋) في شريط متصفح سفاري السفلي.' 
                      : 'Tap the Share button (⎋) in the Safari toolbar.'}
                  </p>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700">
                  <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">2</span>
                  <p>
                    {isAr 
                      ? 'مرر للأسفل واختر "إضافة إلى الصفحة الرئيسية" (Add to Home Screen ➕).' 
                      : 'Scroll down and tap "Add to Home Screen" (➕).'}
                  </p>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300">
                  <i className="fas fa-check-circle text-emerald-500 mt-0.5 shrink-0"></i>
                  <p>
                    {isAr 
                      ? 'افتح التطبيق من الشاشة الرئيسية، واضغط "تفعيل إشعارات الجوال" لتصلك الرسائل حتى والشاشة مقفلة.' 
                      : 'Open from Home Screen and enable notifications for background alerts.'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-slate-100 dark:bg-slate-800 py-2.5 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
              >
                {isAr ? 'فهمت، إغلاق' : 'Got it, Close'}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
