import React from 'react';
import { Penalty } from '../types';
import { useLanguage, getTranslationKeyForArabic } from '../contexts/LanguageContext';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { PrintHeader } from './PrintLayout';

interface PenaltyPrintableProps {
  penalty: Penalty;
}

const PenaltyPrintable: React.FC<PenaltyPrintableProps> = ({ penalty }) => {
  const { t } = useLanguage();
  const [departmentName, setDepartmentName] = React.useState<string>('...');
  const dateStr = penalty.createdAt?.toDate ? penalty.createdAt.toDate().toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB');

  React.useEffect(() => {
    const fetchDept = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', penalty.employeeId));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          if (userData.departmentId) {
            const deptDoc = await getDoc(doc(db, 'departments', userData.departmentId));
            if (deptDoc.exists()) {
              setDepartmentName(deptDoc.data().name);
            }
          }
        }
      } catch (error) {
        console.error("Error fetching department for penalty print:", error);
      }
    };
    fetchDept();
  }, [penalty.employeeId]);

  const renderStamp = (name: string, status: 'accepted' | 'rejected') => {
    const isAccepted = status === 'accepted';
    const colorClass = isAccepted ? 'border-blue-800 text-blue-800' : 'border-red-600 text-red-600';
    const borderColorClass = isAccepted ? 'border-blue-800' : 'border-red-600';
    const overlayColorClass = isAccepted ? 'text-green-600' : 'text-red-600';
    
    return (
      <div className={`border-[3px] rounded-lg p-1 inline-flex flex-col justify-center text-center font-mono font-bold uppercase relative transform -rotate-6 ${colorClass} w-[140px] h-[85px] box-border overflow-hidden bg-white/10`}>
        <div className={`border border-opacity-50 p-1 rounded h-full flex flex-col justify-center ${borderColorClass}`}>
          <div className="text-[8px] tracking-tighter mb-1 border-b border-dashed pb-1">AL JEDAANI HOSPITAL</div>
          <div className={`text-[8px] mt-[1px] pt-[1px] mb-1`}>{departmentName.toUpperCase()}</div>
          <div className={`text-[9px] border-y py-[1px] my-[1px] ${isAccepted ? 'border-blue-800/30' : 'border-red-600/30'}`}>Staff</div>
          <div className="text-[11px] leading-tight break-words">{name}</div>
          <div className={`absolute inset-0 flex items-center justify-center text-base font-bold opacity-15 -rotate-12 pointer-events-none ${overlayColorClass}`}>
            {isAccepted ? 'ACCEPTED' : 'REJECTED'}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-8 bg-white max-w-4xl mx-auto my-4 print:p-0 print:m-0 font-sans text-right relative" dir="rtl">
      <style type="text/css" media="print">
        {`
          @media print {
            .watermark { 
                position: fixed; 
                top: 50%; 
                left: 50%; 
                transform: translate(-50%, -50%); 
                opacity: 0.10; 
                width: 100%; 
                max-width: 900px; 
                z-index: -1; 
                pointer-events: none; 
            }
          }
        `}
      </style>

      {/* Watermark */}
      <img src="/logo.png" className="watermark hidden print:block" alt="Watermark" />

      {/* Header */}
      <PrintHeader 
        title={t('print.warningNotice')} 
        subtitle="Disciplinary Notice" 
        departmentName={departmentName} 
        themeColor="blue"
      />

      {/* Title & Date */}
      <div className="flex justify-between items-end mb-6">
        <div className="flex items-end gap-2 text-sm font-bold" dir="ltr">
          <span>Date:</span>
          <span className="border-b border-dotted border-black w-32 inline-block text-center">{dateStr}</span>
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold border-b-2 border-black inline-block px-8 pb-1">{t('print.warningNotice')}</h2>
          <p className="text-sm font-bold mt-1 uppercase tracking-widest">Disciplinary Notice</p>
        </div>
        <div className="flex items-end gap-2 text-sm font-bold">
          <span>{t('print.date')}</span>
          <span className="border-b border-dotted border-black w-32 inline-block text-center">{dateStr}</span>
        </div>
      </div>

      {/* Main Form Container */}
      <div className="border-2 border-black">
        
        {/* Employee Info Section */}
        <div className="border-b-2 border-black p-4">
          <div className="flex justify-between font-bold mb-4">
            <span className="underline" dir="ltr">TO</span>
            <span className="underline">{t('print.to')}</span>
          </div>
          
          <div className="space-y-4">
            <div className="flex justify-between items-end">
              <span className="w-32 text-left" dir="ltr">NAME</span>
              <span className="flex-grow border-b border-dotted border-black mx-4 text-center text-lg">{penalty.employeeName}</span>
              <span className="w-32 text-right">{t('print.name')}</span>
            </div>
            <div className="flex justify-between items-end">
              <span className="w-32 text-left" dir="ltr">POSITION</span>
              <span className="flex-grow border-b border-dotted border-black mx-4 text-center text-lg">{t('print.radiologist')}</span>
              <span className="w-32 text-right">{t('print.jobTitle')}</span>
            </div>
            <div className="flex justify-between items-end">
              <span className="w-32 text-left" dir="ltr">DEPT / SEC.</span>
              <span className="flex-grow border-b border-dotted border-black mx-4 text-center text-lg">{departmentName.toUpperCase()}</span>
              <span className="w-32 text-right">{t('print.department')}</span>
            </div>
          </div>
        </div>

        {/* Notice Section */}
        <div className="border-b-2 border-black p-4 min-h-[150px]">
          <div className="flex justify-between font-bold mb-4">
            <span dir="ltr">NOTICE</span>
            <span>{t('print.notes')}</span>
          </div>
          <div className="text-center text-xl mt-4 leading-loose relative">
            <p className="relative z-10 inline-block px-4 bg-white">
              {getTranslationKeyForArabic(penalty.description) ? t(getTranslationKeyForArabic(penalty.description)!) : penalty.description}
            </p>
            <div className="absolute top-8 left-0 right-0 border-b border-dotted border-black z-0"></div>
            <div className="absolute top-16 left-0 right-0 border-b border-dotted border-black z-0"></div>
          </div>
        </div>

        {/* Actions Section */}
        <div className="border-b-2 border-black p-4 bg-gray-50">
          <div className="flex justify-between font-bold mb-6">
            <span dir="ltr">As a measure of discipline we have to:</span>
            <span>{t('print.managementDecision')}</span>
          </div>
          
          <div className="space-y-3 px-8">
            <div className="flex justify-between items-center">
              <span className="w-1/3 text-left" dir="ltr">- 1st Warning</span>
              <div className="w-6 h-6 border-2 border-black flex items-center justify-center bg-white">
                {penalty.penaltyType === '1st Warning' && <span className="text-xl font-bold">✓</span>}
              </div>
              <span className="w-1/3 text-right">{t('print.firstWarning')}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="w-1/3 text-left" dir="ltr">- 2nd Warning</span>
              <div className="w-6 h-6 border-2 border-black flex items-center justify-center bg-white">
                {penalty.penaltyType === '2nd Warning' && <span className="text-xl font-bold">✓</span>}
              </div>
              <span className="w-1/3 text-right">{t('print.secondWarning')}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="w-1/3 text-left" dir="ltr">- Final Warning</span>
              <div className="w-6 h-6 border-2 border-black flex items-center justify-center bg-white">
                {penalty.penaltyType === 'Final Warning' && <span className="text-xl font-bold">✓</span>}
              </div>
              <span className="w-1/3 text-right">{t('print.finalWarning')}</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="w-1/3 text-left" dir="ltr"></span>
              <div className="w-6 h-6 border-2 border-black flex items-center justify-center bg-white">
                {penalty.penaltyType === 'Dismissal' && <span className="text-xl font-bold">✓</span>}
              </div>
              <span className="w-1/3 text-right">{t('print.dismissal')}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="w-1/3 text-left flex items-center gap-2" dir="ltr">
                - Deduct <span className="border-b border-dotted border-black w-12 text-center inline-block">{penalty.deductionDays || ''}</span> days wages from your salary
              </span>
              <span className="w-1/3 text-right flex items-center justify-end gap-2" dir="rtl">
                {t('print.deductionOf')} <span className="border-b border-dotted border-black w-12 text-center inline-block">{penalty.deductionDays || ''}</span> {t('print.fromMonthlySalary')}
              </span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="w-1/3 text-left flex items-center gap-2" dir="ltr">
                - Suspend from work for <span className="border-b border-dotted border-black w-12 text-center inline-block">{penalty.suspensionDays || ''}</span> days
              </span>
              <span className="w-1/3 text-right flex items-center justify-end gap-2" dir="rtl">
                {t('print.suspensionFor')} <span className="border-b border-dotted border-black w-12 text-center inline-block">{penalty.suspensionDays || ''}</span> {t('print.days')}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="w-1/3 text-left flex items-center gap-2" dir="ltr">
                - from <span className="border-b border-dotted border-black w-24 text-center inline-block">{penalty.suspensionFrom || ''}</span> to: <span className="border-b border-dotted border-black w-24 text-center inline-block">{penalty.suspensionTo || ''}</span>
              </span>
              <span className="w-1/3 text-right flex items-center justify-end gap-2" dir="rtl">
                {t('print.fromDate')} <span className="border-b border-dotted border-black w-24 text-center inline-block">{penalty.suspensionFrom || ''}</span> {t('print.toDate')} <span className="border-b border-dotted border-black w-24 text-center inline-block">{penalty.suspensionTo || ''}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Signatures Section */}
        <div className="border-b-2 border-black p-4">
          <div className="flex justify-between font-bold mb-8">
            <span dir="ltr">We hope that this is not repeated</span>
            <span>{t('print.doNotRepeat')}</span>
          </div>
          
          <div className="flex justify-between font-bold mb-8">
            <span dir="ltr">Personnel Manager</span>
            <span>{t('print.hrManager')}</span>
          </div>
          
          <div className="flex justify-between font-bold">
            <span className="flex items-end gap-2" dir="ltr">
              Date: <span className="border-b border-dotted border-black w-32 inline-block"></span>
            </span>
            <span className="flex items-end gap-2">
              {t('print.date')} <span className="border-b border-dotted border-black w-32 inline-block"></span>
            </span>
          </div>
        </div>

        {/* Employee Receipt Section */}
        <div className="p-4 bg-gray-50">
          <div className="flex justify-between font-bold mb-8">
            <span dir="ltr">Disciplinary Notice received by employee</span>
            <span>{t('print.employeeAcknowledgment')}</span>
          </div>
          
          <div className="flex justify-between font-bold items-end relative min-h-[80px]">
            <span className="flex items-end gap-2" dir="ltr">
              signature : <span className="border-b border-dotted border-black w-48 inline-block"></span>
            </span>
            
            {/* Employee Stamp */}
            {penalty.status !== 'pending' && (
              <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2">
                {renderStamp(penalty.employeeName, penalty.status)}
              </div>
            )}

            <span className="flex items-end gap-2">
              {t('print.signature')} <span className="border-b border-dotted border-black w-48 inline-block"></span>
            </span>
          </div>

          {/* Rejection Reason */}
          {penalty.status === 'rejected' && penalty.rejectionReason && (
            <div className="mt-8 text-center text-red-600 font-bold">
              <p>{t('print.rejectionReason')} {penalty.rejectionReason}</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default PenaltyPrintable;
