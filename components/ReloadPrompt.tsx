import React, { useState, useEffect } from 'react';
// @ts-ignore
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useLanguage } from '../contexts/LanguageContext';

declare const __APP_BUILD_TIME__: string | undefined;

function ReloadPrompt() {
  const { language, dir } = useLanguage();
  const [isUpdating, setIsUpdating] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // In development mode, NEVER show update prompts
  if (Boolean((import.meta as any)?.env?.DEV)) {
    return null;
  }

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onNeedRefresh() {
      console.log('SW: New production version published and available');
      setNeedRefresh(true);
    },
    onOfflineReady() {
      // Intentionally silent - do not bother users with offline-ready popups
    },
    onRegistered(r: any) {
      if (r) {
        // Periodic check for new app deployments (every 10 minutes)
        setInterval(() => {
          try {
            r.update().catch(() => {});
          } catch (e) {}
        }, 10 * 60 * 1000);

        // Check on tab focus
        const onTabFocus = () => {
          if (document.visibilityState === 'visible') {
            try {
              r.update().catch(() => {});
            } catch (e) {}
          }
        };
        document.addEventListener('visibilitychange', onTabFocus);
        window.addEventListener('focus', onTabFocus);
      }
    },
    onRegisterError(error: any) {
      console.warn('SW registration error:', error);
    },
  });

  const close = () => {
    setDismissed(true);
    setNeedRefresh(false);
  };

  const handleUpdate = async () => {
    try {
      setIsUpdating(true);
      
      // 1. Clear caches
      if ('caches' in window) {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map(key => caches.delete(key)));
        } catch (e) {}
      }

      // 2. Trigger SW update
      try {
        await updateServiceWorker(true);
      } catch (e) {}

      // 3. Reload to fresh version
      setTimeout(() => {
        window.location.reload();
      }, 300);
    } catch (e) {
      console.error('Update error:', e);
      setIsUpdating(false);
      window.location.reload();
    }
  };

  // Only show when there is a genuine new deployment waiting and not dismissed
  if (!needRefresh || dismissed) {
    return null;
  }

  const isAr = language === 'ar';

  return (
    <aside 
      aria-label="App Update Notification"
      dir={dir}
      style={{ zIndex: 2147483647 }}
      className={`fixed bottom-6 max-w-lg w-[calc(100vw-2rem)] sm:w-auto transition-all duration-300 animate-in fade-in slide-in-from-bottom-5 pointer-events-auto ${
        dir === 'rtl' 
          ? 'left-4 sm:left-8 right-4 sm:right-auto' 
          : 'right-4 sm:right-8 left-4 sm:left-auto'
      }`}
    >
      <div className="relative overflow-hidden rounded-2xl bg-slate-900/95 backdrop-blur-xl border border-slate-700/90 shadow-[0_20px_50px_rgba(0,0,0,0.5)] p-4 text-white">
        {/* Glow accent */}
        <div className={`absolute -top-10 ${dir === 'rtl' ? '-left-10' : '-right-10'} w-28 h-28 bg-blue-500/20 rounded-full blur-2xl pointer-events-none`} />

        <div className="flex items-start gap-3.5 relative z-10">
          {/* Icon Badge */}
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-inner bg-blue-500/20 text-blue-400 border border-blue-500/30">
            <i className="fas fa-sparkles text-lg animate-pulse"></i>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 pt-0.5">
            <h4 className="font-bold text-sm text-slate-100 flex items-center gap-2">
              <span>{isAr ? 'تحديث جديد متاح' : 'New Update Available'}</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                {isAr ? 'إصدار جديد' : 'New Release'}
              </span>
            </h4>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              {isAr 
                ? 'تم نشر إصدار وتحديث جديد للنظام. انقر على الزر لتحديث التطبيق فوراً والحصول على آخر الميزات.' 
                : 'A new application release has been published. Click update to load the latest features.'}
            </p>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 mt-3.5">
              <button
                type="button"
                disabled={isUpdating}
                onClick={handleUpdate}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-900/30 hover:shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUpdating ? (
                  <>
                    <i className="fas fa-spinner fa-spin text-xs"></i>
                    <span>{isAr ? 'جاري التحديث...' : 'Updating...'}</span>
                  </>
                ) : (
                  <>
                    <i className="fas fa-arrows-rotate text-xs"></i>
                    <span>{isAr ? 'تحديث التطبيق الآن' : 'Update App Now'}</span>
                  </>
                )}
              </button>
              
              <button
                type="button"
                onClick={close}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-medium border border-slate-700 transition-colors"
              >
                {isAr ? 'لاحقاً' : 'Later'}
              </button>
            </div>
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={close}
            aria-label={isAr ? 'إغلاق' : 'Dismiss'}
            className="text-slate-500 hover:text-slate-300 p-1 rounded-lg transition-colors shrink-0"
          >
            <i className="fas fa-times text-xs"></i>
          </button>
        </div>
      </div>
    </aside>
  );
}

export default ReloadPrompt;

