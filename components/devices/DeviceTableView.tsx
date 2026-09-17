import React from 'react';
import { DeviceItem, getDeviceOverallStatus, getModalityTheme, getDaysRemaining } from './deviceTypes';

interface DeviceTableViewProps {
  devices: DeviceItem[];
  onViewDetails: (device: DeviceItem) => void;
  onEdit: (device: DeviceItem) => void;
  onDelete: (id: string) => void;
  isAr: boolean;
}

export const DeviceTableView: React.FC<DeviceTableViewProps> = ({
  devices,
  onViewDetails,
  onEdit,
  onDelete,
  isAr,
}) => {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-[2rem] shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm" dir={isAr ? 'rtl' : 'ltr'}>
          <thead className="bg-slate-50 dark:bg-slate-800/80 text-[11px] font-black uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th className="py-4 px-6">{isAr ? 'الجهاز / الطراز' : 'Device / Model'}</th>
              <th className="py-4 px-4">{isAr ? 'التصنيف' : 'Category'}</th>
              <th className="py-4 px-4">{isAr ? 'الرقم التسلسلي' : 'Serial Number'}</th>
              <th className="py-4 px-4">{isAr ? 'الصيانة الوقائية PPM' : 'PPM Expiry'}</th>
              <th className="py-4 px-4">{isAr ? 'معايير الجودة QC' : 'QC Expiry'}</th>
              <th className="py-4 px-4">{isAr ? 'الحالة التشغيلية' : 'Operational Status'}</th>
              <th className="py-4 px-6 text-center">{isAr ? 'الإجراءات' : 'Actions'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
            {devices.map((device) => {
              const status = getDeviceOverallStatus(device);
              const theme = getModalityTheme(device.category);
              const ppmDays = getDaysRemaining(device.maintDate);
              const qcDays = getDaysRemaining(device.qualDate);

              return (
                <tr
                  key={device.id}
                  onClick={() => onViewDetails(device)}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                >
                  {/* Name + Thumbnail */}
                  <td className="py-3.5 px-6">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-slate-900 overflow-hidden flex-shrink-0 relative flex items-center justify-center border border-slate-200 dark:border-slate-700">
                        {device.image ? (
                          <img src={device.image} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <i className={`fas ${theme.icon} text-sm text-cyan-400`}></i>
                        )}
                      </div>
                      <div>
                        <span className="font-black text-slate-900 dark:text-white block hover:text-blue-600 transition-colors">
                          {device.name}
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono">
                          {device.installDate ? `${isAr ? 'تاريخ التركيب' : 'Installed'}: ${device.installDate}` : (isAr ? 'تاريخ غير محدد' : 'No date')}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* Category */}
                  <td className="py-3.5 px-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${theme.badgeBg}`}>
                      <i className={`fas ${theme.icon} text-[10px]`}></i>
                      {device.category || 'General'}
                    </span>
                  </td>

                  {/* Serial */}
                  <td className="py-3.5 px-4">
                    <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                      {device.serial || 'N/A'}
                    </span>
                  </td>

                  {/* PPM */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2">
                      <div>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                          {device.maintDate || (isAr ? 'غير مسجل' : 'N/A')}
                        </span>
                        {ppmDays !== null && (
                          <span
                            className={`text-[10px] font-black ${
                              ppmDays <= 0 ? 'text-rose-500' : ppmDays <= 30 ? 'text-amber-500' : 'text-emerald-500'
                            }`}
                          >
                            {ppmDays <= 0
                              ? (isAr ? `منتهي (${Math.abs(ppmDays)}d)` : `Overdue (${Math.abs(ppmDays)}d)`)
                              : (isAr ? `باقي ${ppmDays} يوم` : `${ppmDays}d left`)}
                          </span>
                        )}
                      </div>
                      {device.maintUrl && (
                        <a
                          href={device.maintUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-blue-500 hover:text-blue-700 text-xs p-1"
                          title={isAr ? 'عرض تقرير PPM' : 'View PPM'}
                        >
                          <i className="fas fa-file-pdf"></i>
                        </a>
                      )}
                    </div>
                  </td>

                  {/* QC */}
                  <td className="py-3.5 px-4">
                    {device.enableQA ? (
                      <div className="flex items-center gap-2">
                        <div>
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                            {device.qualDate || (isAr ? 'غير مسجل' : 'N/A')}
                          </span>
                          {qcDays !== null && (
                            <span
                              className={`text-[10px] font-black ${
                                qcDays <= 0 ? 'text-rose-500' : qcDays <= 30 ? 'text-amber-500' : 'text-emerald-500'
                              }`}
                            >
                              {qcDays <= 0
                                ? (isAr ? `منتهي (${Math.abs(qcDays)}d)` : `Overdue (${Math.abs(qcDays)}d)`)
                                : (isAr ? `باقي ${qcDays} يوم` : `${qcDays}d left`)}
                            </span>
                          )}
                        </div>
                        {device.qualUrl && (
                          <a
                            href={device.qualUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-purple-500 hover:text-purple-700 text-xs p-1"
                            title={isAr ? 'عرض شهادة QC' : 'View QC'}
                          >
                            <i className="fas fa-file-pdf"></i>
                          </a>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400 text-xs italic">{isAr ? 'غير مفعّل' : 'Disabled'}</span>
                    )}
                  </td>

                  {/* Status Capsule */}
                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black border shadow-sm ${status.badgeClass}`}
                    >
                      <i className={`fas ${status.icon} text-[10px]`}></i>
                      {isAr ? status.textAr : status.textEn}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="py-3.5 px-6 text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        onClick={() => onViewDetails(device)}
                        className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs transition-colors"
                        title={isAr ? 'فحص الجهاز و QR' : 'Inspect & QR'}
                      >
                        <i className="fas fa-qrcode"></i>
                      </button>
                      <button
                        onClick={() => onEdit(device)}
                        className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 text-slate-600 dark:text-slate-300 hover:text-blue-600 flex items-center justify-center text-xs transition-colors"
                        title={isAr ? 'تعديل' : 'Edit'}
                      >
                        <i className="fas fa-pen"></i>
                      </button>
                      <button
                        onClick={() => onDelete(device.id)}
                        className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center text-xs transition-colors"
                        title={isAr ? 'حذف' : 'Delete'}
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
