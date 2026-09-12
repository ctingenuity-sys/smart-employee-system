import React, { useState, useEffect, useRef } from 'react';
// @ts-ignore
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useLanguage } from '../contexts/LanguageContext';
import { db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';

declare const __APP_BUILD_TIME__: string | undefined;

function ReloadPrompt() {
  const { language, dir } = useLanguage();
  const [isUpdating, setIsUpdating] = useState(false);
  const [testMode, setTestMode] = useState<'refresh' | 'offline' | null>(null);
  const [htmlUpdateDetected, setHtmlUpdateDetected] = useState(false);
  const initialScriptsRef = useRef<string[]>([]);
  const checkIntervalRef = useRef<any>(null);

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onNeedRefresh() {
      console.log('SW: New content available, need refresh');
      setNeedRefresh(true);
    },
    onOfflineReady() {
      console.log('SW: App ready to work offline');
    },
    onRegistered(r: any) {
      console.log('SW Registered:', r);
      if (r) {
        // Immediate update check when component loads
        try {
          r.update().catch(() => {});
        } catch (e) {}

        // Periodic check every 30 seconds for new app versions
        const intervalId = setInterval(() => {
          try {
            r.update().catch(() => {});
          } catch (e) {}
        }, 30 * 1000);

        // Check whenever the user refocuses the app or switches back to this browser tab
        const triggerCheck = () => {
          try {
            r.update().catch(() => {});
          } catch (e) {}
        };
        window.addEventListener('focus', triggerCheck);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            triggerCheck();
          }
        });

        // Custom event for manual check
        window.addEventListener('check-for-updates', () => {
          try {
            r.update().then(() => {
              console.log('Manual SW update check completed');
            }).catch(() => {});
          } catch (e) {}
        });
      }
    },
    onRegisterError(error: any) {
      console.warn('SW registration error:', error);
    },
  });

  // Layer 2: Asset & HTML Differential Checker (Works on all deployed platforms)
  useEffect(() => {
    // Record initial scripts present in current DOM
    const currentScripts = Array.from(document.querySelectorAll('script[src]'))
      .map(s => (s as HTMLScriptElement).src)
      .filter(src => src.includes('/assets/') || src.includes('index.'));
    initialScriptsRef.current = currentScripts;

    const checkHtmlDiff = async () => {
      if (typeof window === 'undefined' || !navigator.onLine) return;
      try {
        const response = await fetch(`/index.html?_t=${Date.now()}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          }
        });
        if (response.ok) {
          const htmlText = await response.text();
          // Extract script tags from fetched HTML
          const matches = htmlText.match(/src="(\/assets\/[^"]+)"/g) || [];
          const fetchedSrcs = matches.map(m => m.replace(/^src="/, '').replace(/"$/, ''));
          
          if (initialScriptsRef.current.length > 0 && fetchedSrcs.length > 0) {
            const hasNewAsset = fetchedSrcs.some(src => !initialScriptsRef.current.some(curr => curr.includes(src)));
            if (hasNewAsset) {
              console.log('New build assets detected via differential HTML check!');
              setHtmlUpdateDetected(true);
              setNeedRefresh(true);
            }
          }
        }
      } catch (err) {
        // Network errors silently ignored
      }
    };

    // Initial check after 5 seconds
    const timeoutId = setTimeout(checkHtmlDiff, 5000);
    // Periodic check every 45 seconds
    checkIntervalRef.current = setInterval(checkHtmlDiff, 45000);

    return () => {
      clearTimeout(timeoutId);
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
    };
  }, []);

  // Layer 3: Firestore System Version Sync (Instant realtime push across all devices)
  useEffect(() => {
    try {
      const unsub = onSnapshot(doc(db, 'system_config', 'app_version'), (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          const currentBuild = typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : 'default';
          const savedBuild = localStorage.getItem('app_local_version') || currentBuild;
          
          if (data.latestBuildTime && data.latestBuildTime !== savedBuild && data.latestBuildTime !== currentBuild) {
            console.log('Realtime system update broadcast received from Firestore');
            setHtmlUpdateDetected(true);
            setNeedRefresh(true);
          }
        }
      }, () => {});

      return () => unsub();
    } catch (e) {}
  }, []);

  // Listen for custom test events so admin or user can test anytime
  useEffect(() => {
    const handleTest = (e: any) => {
      setTestMode(e.detail?.type || 'refresh');
    };
    window.addEventListener('test-reload-prompt', handleTest);
    return () => window.removeEventListener('test-reload-prompt', handleTest);
  }, []);

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
    setHtmlUpdateDetected(false);
    setTestMode(null);
  };

  const handleUpdate = async () => {
    try {
      setIsUpdating(true);
      
      // 1. Clear all service worker caches
      if ('caches' in window) {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map(key => caches.delete(key)));
        } catch (e) {}
      }

      // 2. Unregister or update SW
      if ('serviceWorker' in navigator) {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const reg of registrations) {
            await reg.unregister();
          }
        } catch (e) {}
      }

      // 3. Update PWA register state if active
      try {
        await updateServiceWorker(true);
      } catch (e) {}

      // 4. Update stored version stamp
      if (typeof __APP_BUILD_TIME__ !== 'undefined') {
        localStorage.setItem('app_local_version', __APP_BUILD_TIME__);
      }

      // 5. Force hard reload from server
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (e) {
      console.error('Update error:', e);
      setIsUpdating(false);
      window.location.reload();
    }
  };

  const isShowRefresh = needRefresh || htmlUpdateDetected || testMode === 'refresh';
  const isShowOffline = offlineReady || testMode === 'offline';

  if (!isShowOffline && !isShowRefresh) {
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

