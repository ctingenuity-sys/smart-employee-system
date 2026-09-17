import React, { useState } from 'react';
import { AnnualEvaluation } from '../../types';
import { getRatingGradeLabel } from '../../services/evaluationService';
import { useLanguage } from '../../contexts/LanguageContext';
import { db } from '../../firebase';
// @ts-ignore
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

interface EmployeeAcknowledgeModalProps {
  evaluation: AnnualEvaluation;
  onClose: () => void;
  onAcknowledged: (updated: AnnualEvaluation) => void;
}

export const EmployeeAcknowledgeModal: React.FC<EmployeeAcknowledgeModalProps> = ({
  evaluation,
  onClose,
  onAcknowledged,
}) => {
  const { language, dir } = useLanguage();
  const isEn = language === 'en';

  const [objectionStatus, setObjectionStatus] = useState<'none' | 'has_objections'>(
    evaluation.employeeObjectionStatus || 'none'
  );
  const [comments, setComments] = useState(evaluation.employeeComments || '');
  const [signatureName, setSignatureName] = useState(
    evaluation.employeeSignature || evaluation.employeeName || ''
  );
  const [confirmedDiscussion, setConfirmedDiscussion] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const ratingInfo = getRatingGradeLabel(evaluation.ratingGrade, !isEn);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signatureName.trim()) {
      alert(isEn ? 'Please enter your full name for digital signature.' : 'يرجى إدخال اسمك للتوقيع الإلكتروني');
      return;
    }

    setSubmitting(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const updatedFields: Partial<AnnualEvaluation> = {
        employeeDiscussed: confirmedDiscussion,
        employeeObjectionStatus: objectionStatus,
        employeeComments: comments.trim(),
        employeeSignature: signatureName.trim(),
        employeeSigned: true,
        employeeSignedDate: todayStr,
        status: 'acknowledged',
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, 'annual_evaluations', evaluation.id), updatedFields);
      
      onAcknowledged({
        ...evaluation,
        ...updatedFields,
      });
      onClose();
    } catch (err: any) {
      console.error('Error submitting employee acknowledgement:', err);
      alert((isEn ? 'Error saving acknowledgment: ' : 'حدث خطأ أثناء اعتماد الإقرار: ') + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm overflow-y-auto flex justify-center p-3 sm:p-6 animate-fade-in" dir={dir}>
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col my-auto max-h-[92vh] overflow-hidden">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-600 text-white flex items-center justify-center shadow-md">
              <i className="fas fa-file-signature text-lg"></i>
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                {isEn ? 'Employee Annual Appraisal Acknowledgment' : 'إقرار واطلاع الموظف على نتائج التقييم السنوي'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isEn ? `Appraisal Year ${evaluation.evaluationYear} • ${evaluation.employeeName}` : `تقييم عام ${evaluation.evaluationYear} • ${evaluation.employeeName}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs flex-1">
          
          {/* Summary Score Card */}
          <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-850 dark:to-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                {isEn ? 'Appraisal Result' : 'نتيجة التقييم السنوي'}
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-slate-900 dark:text-white">{evaluation.totalScore}</span>
                <span className="text-sm text-slate-400 font-bold">/ 100</span>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${ratingInfo.bg} ${ratingInfo.color} ${isEn ? 'ml-2' : 'mr-2'}`}>
                  {ratingInfo.label}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-[10px] w-full sm:w-auto">
              <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                <span className="text-slate-500 block">{isEn ? 'Knowledge' : 'المعرفة والأداء'}</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">{evaluation.section1Score} / 40</span>
              </div>
              <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                <span className="text-slate-500 block">{isEn ? 'Work Style' : 'الأسلوب بالعمل'}</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">{evaluation.section2Score} / 40</span>
              </div>
              <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                <span className="text-slate-500 block">{isEn ? 'Behaviour' : 'السلوك الشخصي'}</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">{evaluation.section3Score} / 20</span>
              </div>
            </div>
          </div>

          {/* Strengths and Improvements overview */}
          {(evaluation.strengthPoints || evaluation.weaknessPoints) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {evaluation.strengthPoints && (
                <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 rounded-xl">
                  <h4 className="font-bold text-emerald-800 dark:text-emerald-400 mb-1 flex items-center gap-1.5">
                    <i className="fas fa-check-circle"></i>
                    <span>{isEn ? 'Strengths:' : 'نقاط القوة:'}</span>
                  </h4>
                  <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap text-[11px]">
                    {evaluation.strengthPoints}
                  </p>
                </div>
              )}

              {evaluation.weaknessPoints && (
                <div className="p-3 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl">
                  <h4 className="font-bold text-amber-800 dark:text-amber-400 mb-1 flex items-center gap-1.5">
                    <i className="fas fa-lightbulb"></i>
                    <span>{isEn ? 'Areas for Improvement:' : 'فرص التحسين والتطوير:'}</span>
                  </h4>
                  <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap text-[11px]">
                    {evaluation.weaknessPoints}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Acknowledgement Form */}
          <form onSubmit={handleSubmit} className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
            
            {/* Discussion Confirmation */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
              <label className="flex items-center gap-3 cursor-pointer font-bold text-slate-800 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={confirmedDiscussion}
                  onChange={(e) => setConfirmedDiscussion(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                />
                <span>
                  {isEn 
                    ? 'The results of my evaluation had been discussed with me and:' 
                    : 'لقد تم مناقشة التقييم معي وأنه: (The results of my evaluation had been discussed with me and:)'}
                </span>
              </label>
            </div>

            {/* Objections Choice */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                className={`p-3 rounded-xl border cursor-pointer flex items-center gap-3 transition-all ${
                  objectionStatus === 'none'
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500 text-emerald-900 dark:text-emerald-300 font-bold shadow-sm'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="objection"
                  value="none"
                  checked={objectionStatus === 'none'}
                  onChange={() => setObjectionStatus('none')}
                  className="w-4 h-4 text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <span className="block font-bold">
                    {isEn ? "I don't have any objections" : "ليس لدي أي اعتراضات"}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    {isEn ? "Fully agreed with the results" : "I don't have any objections"}
                  </span>
                </div>
              </label>

              <label
                className={`p-3 rounded-xl border cursor-pointer flex items-center gap-3 transition-all ${
                  objectionStatus === 'has_objections'
                    ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-500 text-amber-900 dark:text-amber-300 font-bold shadow-sm'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="objection"
                  value="has_objections"
                  checked={objectionStatus === 'has_objections'}
                  onChange={() => setObjectionStatus('has_objections')}
                  className="w-4 h-4 text-amber-600 focus:ring-amber-500"
                />
                <div>
                  <span className="block font-bold">
                    {isEn ? "I have some objections" : "لدي بعض الإعتراضات"}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    {isEn ? "State concerns in comments below" : "I have some objections"}
                  </span>
                </div>
              </label>
            </div>

            {/* Employee Comments */}
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                {isEn ? 'Employee Feedback / Comments:' : 'ملاحظات الموظف (Comments):'}
              </label>
              <textarea
                rows={3}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder={isEn ? 'Enter your feedback or notes regarding your appraisal here...' : 'أدخل أي ملاحظات أو تعقيب على تقييمك السنوي هنا...'}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-3 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none leading-relaxed"
              ></textarea>
            </div>

            {/* Electronic Signature */}
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                {isEn ? 'Electronic Signature (Your full name):' : 'التوقيع الإلكتروني للموظف (اسمك الصريح كإقرار):'}
              </label>
              <input
                type="text"
                value={signatureName}
                onChange={(e) => setSignatureName(e.target.value)}
                placeholder={isEn ? 'Enter your full legal name' : 'أدخل اسمك الرباعي للتوقيع والاعتماد'}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                required
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl font-bold transition-colors"
              >
                {isEn ? 'Close' : 'إغلاق'}
              </button>

              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i>
                    <span>{isEn ? 'Submitting...' : 'جاري الإرسال...'}</span>
                  </>
                ) : (
                  <>
                    <i className="fas fa-check-circle"></i>
                    <span>{isEn ? 'Confirm & Sign Acknowledgment' : 'تأكيد الاطلاع وتوقيع الإقرار'}</span>
                  </>
                )}
              </button>
            </div>
          </form>

        </div>

      </div>
    </div>
  );
};
