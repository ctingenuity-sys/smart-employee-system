// components/ReloadPrompt.tsx
import React from 'react';
// @ts-ignore
import { useRegisterSW } from 'virtual:pwa-register/react';

function ReloadPrompt() {
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

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  return (
    <div className="ReloadPrompt-container">
      { (offlineReady || needRefresh) && (
        <div className="fixed bottom-4 right-4 p-4 bg-slate-800 text-white rounded-lg shadow-lg z-50 flex flex-col gap-2 max-w-sm border border-slate-700">
          <div className="flex items-start gap-3">
            <div className="text-blue-400 mt-1">
              <i className="fas fa-info-circle"></i>
            </div>
            <div className="flex-1">
              { offlineReady ? (
                <span className="text-sm">التطبيق جاهز للعمل بدون إنترنت</span>
              ) : (
                <span className="text-sm">يتوفر تحديث جديد للتطبيق. يرجى التحديث لضمان أفضل أداء.</span>
              ) }
            </div>
          </div>
          
          <div className="flex gap-2 justify-end mt-2">
            { needRefresh && (
              <button 
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-xs font-medium transition-colors"
                onClick={() => updateServiceWorker(true)}
              >
                تحديث الآن
              </button>
            ) }
            <button 
              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-xs font-medium transition-colors"
              onClick={() => close()}
            >
              إغلاق
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReloadPrompt;