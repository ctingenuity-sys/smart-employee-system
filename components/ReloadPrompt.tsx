import React, { useState } from 'react';
// @ts-ignore
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useLanguage } from '../contexts/LanguageContext';

function ReloadPrompt() {
  const { language, dir } = useLanguage();
  const [isUpdating, setIsUpdating] = useState(false);
  const [testMode, setTestMode] = useState<'refresh' | 'offline' | null>(null);

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r: any) {
      console.log('SW Registered: ' + r);
    },
    onRegisterError(error: any) {
      console.log('SW registration error', error);
    },
  });

  // Listen for custom test events so admin or user can test anytime
  React.useEffect(() => {
    const handleTest = (e: any) => {
      setTestMode(e.detail?.type || 'refresh');
    };
    window.addEventListener('test-reload-prompt', handleTest);
    return () => window.removeEventListener('test-reload-prompt', handleTest);
  }, []);

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
    setTestMode(null);
  };

  const handleUpdate = async () => {
    try {
      setIsUpdating(true);
      if (testMode) {
        setTimeout(() => {
          setIsUpdating(false);
          setTestMode(null);
          window.location.reload();
        }, 1200);
        return;
      }
      await updateServiceWorker(true);
    } catch (e) {
      console.error('Update error:', e);
      setIsUpdating(false);
    }
  };

  const isShowRefresh = needRefresh || testMode === 'refresh';
  const isShowOffline = offlineReady || testMode === 'offline';

  if (!isShowOffline && !isShowRefresh) {
    return null;
  }

  const isAr = language === 'ar';

  return (
    <aside 
      aria-label="App Update Notification"
      dir={dir}
      className={`fixed bottom-6 z-[100000] max-w-lg w-[calc(100vw-2rem)] sm:w-auto transition-all duration-300 animate-in fade-in slide-in-from-bottom-5 ${
        dir === 'rtl' ? 'left-4 sm:left-6 sm:right-auto' : 'right-4 sm:right-6 sm:left-auto'
      }`}
    >
      <div className="relative overflow-hidden rounded-2xl bg-slate-900/95 backdrop-blur-xl border border-slate-700/90 shadow-[0_20px_50px_rgba(0,0,0,0.5)] p-4 text-white">
        {/* Glow accent */}
        <div className={`absolute -top-10 ${dir === 'rtl' ? '-left-10' : '-right-10'} w-28 h-28 ${isShowOffline ? 'bg-emerald-500/20' : 'bg-blue-500/20'} rounded-full blur-2xl pointer-events-none`} />

        <div className="flex items-start gap-3.5 relative z-10">
          {/* Icon Badge */}
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-inner ${
            isShowOffline ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
          }`}>
            {isShowOffline ? (
              <i className="fas fa-check-circle text-lg"></i>
            ) : (
              <i className="fas fa-sparkles text-lg animate-pulse"></i>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 pt-0.5">
            <h4 className="font-bold text-sm text-slate-100 flex items-center gap-2">
              {isShowOffline ? (
                <span>{isAr ? 'جاهز للعمل بدون إنترنت' : 'Ready for Offline Use'}</span>
              ) : (
                <>
                  <span>{isAr ? 'تحديث جديد متاح' : 'New Update Available'}</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    {isAr ? 'إصدار جديد' : 'New Version'}
                  </span>
                </>
              )}
            </h4>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              {isShowOffline
                ? (isAr ? 'تم تحميل بيانات النظام بنجاح ويمكنك تصفحه والعمل عليه بدون اتصال بالشبكة.' : 'App data is cached and ready to work smoothly even when offline.')
                : (isAr ? 'تم نشر تحسينات وميزات جديدة. حدّث التطبيق الآن للاستمتاع بآخر التحديثات والأداء الأفضل.' : 'New features and improvements are ready. Update now to ensure optimal performance.')}
            </p>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 mt-3.5">
              {isShowRefresh && (
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
              )}
              
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

