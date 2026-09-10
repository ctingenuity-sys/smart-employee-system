import React, { useState, useEffect } from 'react';
import {
  isNotificationSupported,
  getNotificationPermission,
  requestMobileNotificationPermission,
  sendMobileNotification,
  getNotificationPreferences,
  saveNotificationPreferences,
  NotificationPreferences,
  isIOSDevice,
  isStandalonePWA
} from '../services/notificationService';
import { useLanguage } from '../contexts/LanguageContext';

interface MobileNotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MobileNotificationModal: React.FC<MobileNotificationModalProps> = ({
  isOpen,
  onClose
}) => {
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [prefs, setPrefs] = useState<NotificationPreferences>(getNotificationPreferences());
  const [isRequesting, setIsRequesting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPermission(getNotificationPermission());
      setPrefs(getNotificationPreferences());
      setStatusMessage(null);
    }
  }, [isOpen]);

  const handleRequestPermission = async () => {
    setIsRequesting(true);
    setStatusMessage(null);
    try {
      const res = await requestMobileNotificationPermission();
      setPermission(res.permission);
      if (res.granted) {
        setStatusMessage({
          text: isAr ? 'تم تفعيل إشعارات الجوال بنجاح! 🎉' : 'Mobile notifications activated successfully! 🎉',
          type: 'success'
        });
        // Send a friendly greeting notification immediately
        await sendMobileNotification(isAr ? 'نظام الموظفين الذكي 🔔' : 'Smart Staff System 🔔', {
          body: isAr ? 'أهلاً بك! تم تفعيل إشعارات الجوال بنجاح وستصلك الرسائل والتنبيهات أولاً بأول.' : 'Welcome! Mobile notifications are now active.',
          type: 'normal',
          vibrate: [200, 100, 200]
        });
      } else if (res.error) {
        setStatusMessage({ text: res.error, type: 'error' });
      }
    } catch (e: any) {
      setStatusMessage({ text: e?.message || 'حدث خطأ أثناء طلب الإذن', type: 'error' });
    } finally {
      setIsRequesting(false);
    }
  };

  const handleTogglePref = (key: keyof NotificationPreferences) => {
    const updated = saveNotificationPreferences({ [key]: !prefs[key] });
    setPrefs(updated);
  };

  if (!isOpen) return null;

  const isIOS = isIOSDevice();
  const isPWA = isStandalonePWA();

  return (
    <div className="fixed inset-0 z-[100060] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]"
        dir={isAr ? 'rtl' : 'ltr'}
      >
        {/* Modal Header */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-blue-600 via-indigo-600 to-slate-900 text-white relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-inner">
              <i className="fas fa-bell text-2xl text-amber-300 animate-pulse"></i>
            </div>
            <div>
              <h3 className="text-lg font-extrabold flex items-center gap-2">
                <span>{isAr ? 'إشعارات الجوال المباشرة' : 'Mobile Push Notifications'}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-white border border-white/30">
                  {isAr ? 'حتى والتطبيق مقفل' : 'Background / Closed'}
                </span>
              </h3>
              <p className="text-xs text-blue-100/90 mt-0.5">
                {isAr 
                  ? 'استلام تنبيهات ورسائل العمل والجروبات مباشرة على هاتفك' 
                  : 'Receive work messages and shift alerts on your mobile'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
          >
            <i className="fas fa-times text-sm"></i>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-slate-700 dark:text-slate-200 text-xs">
          
          {/* Status Message */}
          {statusMessage && (
            <div className={`p-3.5 rounded-2xl border flex items-start gap-3 animate-in fade-in slide-in-from-top-2 ${
              statusMessage.type === 'success' 
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                : statusMessage.type === 'error'
                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300'
            }`}>
              <i className={`fas mt-0.5 shrink-0 text-sm ${
                statusMessage.type === 'success' ? 'fa-check-circle text-emerald-500' :
                statusMessage.type === 'error' ? 'fa-exclamation-circle text-rose-500' :
                'fa-info-circle text-blue-500'
              }`}></i>
              <p className="font-bold flex-1 leading-relaxed">{statusMessage.text}</p>
            </div>
          )}

          {/* Device Notification Status Card */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <i className="fas fa-mobile-alt text-blue-500"></i>
                <span>{isAr ? 'حالة إشعارات هذا الجهاز:' : 'Device Notification Status:'}</span>
              </span>

              {permission === 'granted' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                  <span>{isAr ? 'مفعلة وتعمل بنجاح' : 'Active & Working'}</span>
                </span>
              ) : permission === 'denied' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                  <i className="fas fa-ban text-[10px]"></i>
                  <span>{isAr ? 'محظورة في المتصفح' : 'Blocked in Browser'}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  <i className="fas fa-exclamation-triangle text-[10px]"></i>
                  <span>{isAr ? 'غير مفعلة بعد' : 'Not Activated Yet'}</span>
                </span>
              )}
            </div>

            {/* Permission Actions */}
            {permission !== 'granted' && (
              <div className="pt-2">
                {permission === 'denied' ? (
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-300 space-y-1 text-[11px] leading-relaxed">
                    <p className="font-bold">{isAr ? 'كيفية فك الحظر والسماح بالإشعارات:' : 'How to unblock notifications:'}</p>
                    <p>{isAr ? '1. اضغط على أيقونة القفل (🔒) أو الإعدادات بجوار عنوان الموقع في شريط المتصفح العلوي.' : '1. Tap the lock icon (🔒) beside the URL.'}</p>
                    <p>{isAr ? '2. اختر "أذونات الموقع" (Permissions) ثم الإشعارات -> "سماح" (Allow).' : '2. Go to Site settings -> Notifications -> Allow.'}</p>
                  </div>
                ) : (
                  <button
                    onClick={handleRequestPermission}
                    disabled={isRequesting}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 transition cursor-pointer active:scale-98 disabled:opacity-50"
                  >
                    {isRequesting ? (
                      <>
                        <i className="fas fa-spinner fa-spin text-sm"></i>
                        <span>{isAr ? 'جاري التفعيل...' : 'Activating...'}</span>
                      </>
                    ) : (
                      <>
                        <i className="fas fa-bell text-sm"></i>
                        <span>{isAr ? 'تفعيل إشعارات الجوال الآن بنقرة واحدة' : 'Enable Mobile Notifications Now'}</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Preferences Toggles */}
          <div className="space-y-3 pt-1">
            <h4 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <i className="fas fa-sliders-h text-slate-400"></i>
              <span>{isAr ? 'أنواع الإشعارات المراد استلامها:' : 'Notification Categories:'}</span>
            </h4>

            <div className="space-y-2">
              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs">
                    <i className="fas fa-comments"></i>
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 dark:text-slate-200">{isAr ? 'رسائل الدردشة والجروبات الفورية' : 'Chat & Work Group Messages'}</p>
                    <p className="text-[10px] text-slate-400">{isAr ? 'إشعار فوري عند ورود رسالة جديدة في مجموعاتك أو من زميل' : 'Alerts when receiving messages in your groups or direct'}</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.chatMessages}
                  onChange={() => handleTogglePref('chatMessages')}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 flex items-center justify-center text-xs">
                    <i className="fas fa-exclamation-triangle"></i>
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 dark:text-slate-200">{isAr ? 'تنبيهات الطوارئ والتقارير العاجلة' : 'Urgent Emergency Alerts'}</p>
                    <p className="text-[10px] text-slate-400">{isAr ? 'إشعارات عاجلة ذات أولوية قصوى واهتزاز قوي' : 'High priority alerts with strong vibration'}</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.urgentAlerts}
                  onChange={() => handleTogglePref('urgentAlerts')}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs">
                    <i className="fas fa-exchange-alt"></i>
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 dark:text-slate-200">{isAr ? 'طلبات تبديل النبطشيات والإجازات' : 'Shift Swaps & Leave Updates'}</p>
                    <p className="text-[10px] text-slate-400">{isAr ? 'إشعار بالموافقات والطلبات الجديدة الواردة إليك' : 'Notices on incoming swap requests and approvals'}</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.shiftSwaps}
                  onChange={() => handleTogglePref('shiftSwaps')}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </label>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 cursor-pointer">
                  <span className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <i className="fas fa-vibrate text-purple-500"></i>
                    <span>{isAr ? 'الاهتزاز 📳' : 'Vibration'}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={prefs.vibration}
                    onChange={() => handleTogglePref('vibration')}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 cursor-pointer">
                  <span className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <i className="fas fa-volume-up text-amber-500"></i>
                    <span>{isAr ? 'نغمة التنبيه 🔊' : 'Sound Chime'}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={prefs.sound}
                    onChange={() => handleTogglePref('sound')}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* OS-specific tips */}
          <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-[11px] space-y-2">
            <p className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <i className="fas fa-shield-alt text-blue-500"></i>
              <span>{isAr ? 'لضمان وصول الإشعارات دائماً والتطبيق مغلق:' : 'To guarantee delivery when app is closed:'}</span>
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-300 leading-relaxed pr-1">
              <li>
                <strong>{isAr ? 'تثبيت التطبيق على الشاشة الرئيسية (PWA):' : 'Install PWA:'}</strong>{' '}
                {isAr 
                  ? 'يعامل النظام التطبيق المثبت كتطبيق جوال رسمي ويوفر له أولوية استقبال الإشعارات في الخلفية.' 
                  : 'Installed PWAs get background execution privileges.'}
              </li>
              <li>
                <strong>{isAr ? 'إلغاء تقييد البطارية (Battery Optimization):' : 'Battery settings:'}</strong>{' '}
                {isAr 
                  ? 'في هواتف أندرويد (سامسونج، شاومي، هواوي)، اجعل إعداد البطارية للتطبيق "غير مقيد" (Unrestricted) حتى لا يوقفه النظام لتوفير الطاقة.' 
                  : 'On Android, set battery usage to Unrestricted.'}
              </li>
              {isIOS && (
                <li className="text-amber-700 dark:text-amber-300 font-semibold">
                  <strong>{isAr ? 'مستخدمي آيفون (iOS 16.4+):' : 'iPhone Users:'}</strong>{' '}
                  {isAr 
                    ? 'يلزم فتح الموقع في متصفح Safari والضغط على "مشاركة" ثم "إضافة إلى الصفحة الرئيسية" لتفعيل الإشعارات.' 
                    : 'Must add to Home Screen via Safari Share menu.'}
                </li>
              )}
            </ul>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-5 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 font-bold transition cursor-pointer"
          >
            {isAr ? 'تم وحفظ' : 'Done & Save'}
          </button>
        </div>

      </div>
    </div>
  );
};
