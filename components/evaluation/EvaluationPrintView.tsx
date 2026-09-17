import React, { useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnnualEvaluation, User } from '../../types';
import { getRatingGradeLabel } from '../../services/evaluationService';
import { useDepartment } from '../../contexts/DepartmentContext';

interface EvaluationPrintViewProps {
  evaluation: AnnualEvaluation;
  onClose?: () => void;
  users?: User[];
}

export const EvaluationPrintView: React.FC<EvaluationPrintViewProps> = ({ evaluation, onClose, users }) => {
  const ratingInfo = getRatingGradeLabel(evaluation.ratingGrade, true);
  const { departments } = useDepartment();

  // Attach and detach print class to isolate printing from the rest of the application
  useEffect(() => {
    document.body.classList.add('print-evaluation-only');
    return () => {
      document.body.classList.remove('print-evaluation-only');
    };
  }, []);

  const resolvedEmployeeNumber = useMemo(() => {
    if (users && users.length > 0) {
      const matched = users.find(u => u.id === evaluation.employeeId || u.name === evaluation.employeeName);
      if (matched?.employeeNumber) return matched.employeeNumber;
    }
    return evaluation.employeeNumber || '—';
  }, [users, evaluation.employeeId, evaluation.employeeName, evaluation.employeeNumber]);

  const isHeadOfDept = useMemo(() => {
    if (evaluation.evaluatorRole === 'manager') return true;
    if (evaluation.evaluatorRole === 'supervisor') return false;
    const title = (evaluation.evaluatorTitle || '').toLowerCase();
    const name = (evaluation.supervisorName || '').toLowerCase();
    return title.includes('رئيس') || title.includes('head') || title.includes('director') || title.includes('مدير') || name.includes('رئيس');
  }, [evaluation.evaluatorRole, evaluation.evaluatorTitle, evaluation.supervisorName]);

  const resolvedDeptName = useMemo(() => {
    const raw = evaluation.departmentName || evaluation.departmentId;
    if (!raw) return '—';
    const found = departments.find(d => d.id === raw || d.name === raw || (evaluation.departmentId && d.id === evaluation.departmentId));
    return found ? found.name : raw;
  }, [departments, evaluation.departmentName, evaluation.departmentId]);

  const handlePrintA4 = () => {
    const paperElement = document.getElementById('annual-evaluation-paper-printable');
    if (!paperElement) {
      window.print();
      return;
    }

    // Collect parent stylesheets & tailwind links
    let stylesHtml = '';
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
      stylesHtml += node.outerHTML;
    });

    let iframe = document.getElementById('eval-isolated-print-iframe') as HTMLIFrameElement;
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'eval-isolated-print-iframe';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0px';
      iframe.style.height = '0px';
      iframe.style.border = 'none';
      iframe.style.zIndex = '-9999';
      document.body.appendChild(iframe);
    }

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!doc) {
      window.print();
      return;
    }

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8">
        <title>نموذج تقييم أداء الموظف السنوي - ${evaluation.employeeName || ''}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
        ${stylesHtml}
        <style>
          @page {
            size: A4 portrait !important;
            margin: 7mm 9mm 7mm 9mm !important;
          }
          * {
            box-sizing: border-box !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          html, body {
            background-color: #ffffff !important;
            background-image: none !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
            font-family: 'Cairo', sans-serif !important;
            font-size: 11.5px !important;
            line-height: 1.4 !important;
          }
          .eval-print-hidden, button, nav, header {
            display: none !important;
          }
          .eval-page-1 {
            margin-top: 0 !important;
            padding-top: 0 !important;
            page-break-after: always !important;
            break-after: page !important;
            padding-bottom: 2mm !important;
          }
          .eval-page-2 {
            page-break-before: always !important;
            break-before: page !important;
            padding-top: 4mm !important;
          }
          table {
            border-collapse: collapse !important;
            width: 100% !important;
          }
          img {
            max-width: 100% !important;
          }
        </style>
      </head>
      <body class="bg-white text-slate-900 p-0 m-0">
        ${paperElement.innerHTML}
      </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    }, 450);
  };

  const content = (
    <div 
      id="annual-evaluation-print-portal"
      className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm overflow-y-auto flex justify-center p-2 sm:p-6 print:p-0 print:static print:bg-white print:overflow-visible print:block"
    >
      <style>{`
        @media print {
          @page {
            size: A4 portrait !important;
            margin: 6mm 8mm 6mm 8mm !important;
          }
          html, body {
            background-color: #ffffff !important;
            background-image: none !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: auto !important;
          }
          body.print-evaluation-only #root {
            display: none !important;
          }
          #annual-evaluation-print-portal {
            display: block !important;
            position: static !important;
            width: 100% !important;
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            background: #ffffff !important;
            box-shadow: none !important;
            overflow: visible !important;
          }
          #annual-evaluation-paper {
            width: 100% !important;
            max-width: 100% !important;
            min-height: auto !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            background: #ffffff !important;
          }
          .eval-print-hidden, .print\\:hidden, button, nav, header {
            display: none !important;
            height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .eval-page-1 {
            margin-top: 0 !important;
            padding-top: 0 !important;
            page-break-after: always !important;
            break-after: page !important;
            padding-bottom: 2mm !important;
          }
          .eval-page-2 {
            page-break-before: always !important;
            break-before: page !important;
            padding-top: 3mm !important;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      {/* Container */}
      <div 
        id="annual-evaluation-paper"
        className="bg-white text-slate-900 w-full max-w-[210mm] min-h-[297mm] shadow-2xl p-6 sm:p-10 my-auto rounded-xl print:shadow-none print:m-0 print:p-0 print:rounded-none print:w-full print:max-w-none text-xs"
      >
        
        {/* Screen Controls Header (Hidden in Print) */}
        <div className="eval-print-hidden flex items-center justify-between pb-4 mb-4 border-b border-slate-200 print:hidden">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="font-bold text-slate-700 text-sm">معاينة طباعة نموذج التقييم السنوي المعتمد</span>
            {evaluation.supervisorName && (
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1">
                <i className={isHeadOfDept ? "fas fa-user-shield text-indigo-500 text-[10px]" : "fas fa-user-tie text-blue-500 text-[10px]"}></i>
                <span>{isHeadOfDept ? 'المعتمد (رئيس القسم):' : 'المعتمد (مشرف القسم):'}</span>
                <span className="text-slate-900 font-extrabold">{evaluation.supervisorName}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrintA4}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-lg shadow flex items-center gap-2 text-xs transition-colors cursor-pointer"
            >
              <i className="fas fa-print"></i>
              <span>طباعة النموذج (Print A4)</span>
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors text-xs"
              >
                إغلاق
              </button>
            )}
          </div>
        </div>

        {/* Printable Area Wrapper */}
        <div id="annual-evaluation-paper-printable">
          {/* ================= PAGE 1 ================= */}
          <div className="eval-page-1 relative pt-0 mt-0">
          {/* Header */}
          <div className="flex justify-between items-center pb-3 border-b-2 border-slate-900 pt-0 mt-0">
            {/* English Header */}
            <div className="text-left w-1/3 leading-tight font-serif">
              <h2 className="font-bold text-[14px] text-slate-900">Al Jedaani Group of Hospitals</h2>
              <p className="text-[11px] text-slate-700">Kingdom of Saudi Arabia</p>
              <p className="text-[11px] text-slate-700">P.O. Box 7500, Jeddah 21462</p>
            </div>

            {/* Logo in Center */}
            <div className="w-1/3 flex flex-col items-center text-center">
              <img
                src="/old-logo.png"
                alt="Al Jedaani Logo"
                className="h-16 w-16 object-contain"
                onError={(e) => {
                  // Fallback if old-logo fails
                  (e.target as HTMLImageElement).src = '/logo.png';
                }}
              />
            </div>

            {/* Arabic Header */}
            <div className="text-right w-1/3 leading-tight font-serif" dir="rtl">
              <h2 className="font-bold text-[14px] text-slate-900">مجموعة مستشفيات الجدعاني</h2>
              <p className="text-[11px] text-slate-700">المملكة العربية السعودية</p>
              <p className="text-[11px] text-slate-700">ص.ب 7500، جدة 21462</p>
            </div>
          </div>

          {/* Form Title */}
          <div className="text-center my-3 py-1.5 bg-slate-100 border border-slate-300 rounded">
            <h1 className="text-[14px] font-black uppercase tracking-wider text-slate-900">
              ANNUAL PERFORMANCE APPRAISAL FORM
            </h1>
            <h2 className="text-xs font-bold text-slate-800" dir="rtl">
              نموذج تقييم أداء الموظف السنوي ({evaluation.evaluationYear || new Date().getFullYear()})
            </h2>
          </div>

          {/* Employee Information Table */}
          <div className="border border-slate-800 mb-3.5 text-xs">
            <div className="grid grid-cols-2 divide-x divide-slate-800 border-b border-slate-800">
              <div className="p-2 flex justify-between items-center">
                <span className="font-semibold text-slate-600">Employee Name: / اسم الموظف:</span>
                <span className="font-bold text-slate-900 text-[13px]">{evaluation.employeeName}</span>
              </div>
              <div className="p-2 flex justify-between items-center">
                <span className="font-semibold text-slate-600">Employee Number: / الرقم الوظيفي:</span>
                <span className="font-bold text-slate-900 text-[13px]">{resolvedEmployeeNumber}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 divide-x divide-slate-800 border-b border-slate-800">
              <div className="p-2 flex justify-between items-center">
                <span className="font-semibold text-slate-600">Position: / الوظيفة:</span>
                <span className="font-bold text-slate-900 text-[13px]">{evaluation.position || '—'}</span>
              </div>
              <div className="p-2 flex justify-between items-center">
                <span className="font-semibold text-slate-600">Department: / القسم:</span>
                <span className="font-bold text-slate-900 text-[13px]">{resolvedDeptName}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 divide-x divide-slate-800">
              <div className="p-2 flex justify-between items-center">
                <span className="font-semibold text-slate-600">Current Contract: / تاريخ العقد الحالي:</span>
                <span className="font-bold text-slate-900 text-[13px]">{evaluation.currentContract || '—'}</span>
              </div>
              <div className="p-2 flex justify-between items-center">
                <span className="font-semibold text-slate-600">Evaluation Date: / تاريخ التقييم:</span>
                <span className="font-bold text-slate-900 text-[13px]">{evaluation.evaluationDate || '—'}</span>
              </div>
            </div>
          </div>

          {/* Rating Scale Guide Table */}
          <div className="mb-3.5 border border-slate-700 text-[11px]">
            <div className="grid grid-cols-5 text-center font-bold divide-x divide-slate-700 bg-slate-50 border-b border-slate-700">
              <div className="py-1.5 px-1 bg-emerald-50 text-emerald-900">Excellent ممتاز</div>
              <div className="py-1.5 px-1 bg-blue-50 text-blue-900">Very Good جيد جداً</div>
              <div className="py-1.5 px-1 bg-teal-50 text-teal-900">Good جيد</div>
              <div className="py-1.5 px-1 bg-amber-50 text-amber-900">Fair مقبول</div>
              <div className="py-1.5 px-1 bg-rose-50 text-rose-900">Poor ضعيف</div>
            </div>
            <div className="grid grid-cols-5 text-center divide-x divide-slate-700">
              <div className="py-1 font-semibold">90 - 100</div>
              <div className="py-1 font-semibold">80 - 89</div>
              <div className="py-1 font-semibold">70 - 79</div>
              <div className="py-1 font-semibold">60 - 69</div>
              <div className="py-1 font-semibold">0 - 60</div>
            </div>
          </div>

          {/* Section I: Knowledge and Performance */}
          <div className="mb-3.5 border border-slate-800 text-[11px]">
            <div className="bg-slate-800 text-white font-bold py-1.5 px-2 flex justify-between items-center text-xs">
              <span>Section I: Knowledge and Performance (Total 40)</span>
              <span dir="rtl">المعرفة وأداء العمل: (الدرجة القصوى 40)</span>
            </div>
            <table className="w-full text-center border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-800 font-bold">
                  <th className="py-1.5 px-2 text-left w-2/5 border-r border-slate-800">Criteria / المعايير</th>
                  <th className="py-1.5 px-1 w-9 border-r border-slate-800">2</th>
                  <th className="py-1.5 px-1 w-9 border-r border-slate-800">4</th>
                  <th className="py-1.5 px-1 w-9 border-r border-slate-800">6</th>
                  <th className="py-1.5 px-1 w-9 border-r border-slate-800">8</th>
                  <th className="py-1.5 px-1 w-9 border-r border-slate-800">10</th>
                  <th className="py-1.5 px-1 w-14 bg-slate-200">Score</th>
                </tr>
              </thead>
              <tbody>
                {evaluation.section1Criteria.map((c, i) => (
                  <tr key={c.id || i} className="border-b border-slate-300">
                    <td className="py-1.5 px-2 text-left border-r border-slate-800">
                      <div className="font-semibold text-slate-800 text-xs">{i + 1}. {c.nameEn}</div>
                      <div className="text-slate-600 text-[10px]" dir="rtl">{c.nameAr}</div>
                    </td>
                    {[2, 4, 6, 8, 10].map((opt) => (
                      <td key={opt} className="py-1.5 px-1 border-r border-slate-800">
                        {c.score === opt ? (
                          <span className="inline-block w-4 h-4 rounded-full bg-slate-900 text-white font-black text-[10px] leading-4">✓</span>
                        ) : '○'}
                      </td>
                    ))}
                    <td className="py-1.5 px-1 font-bold bg-slate-50 text-xs">{c.score}</td>
                  </tr>
                ))}
                <tr className="bg-slate-100 font-bold border-t border-slate-800">
                  <td colSpan={6} className="py-1.5 px-2 text-right border-r border-slate-800 font-bold text-xs">
                    Subtotal Section I / مجموع القسم الأول (المعرفة وأداء العمل):
                  </td>
                  <td className="py-1.5 px-1 text-center bg-slate-200 font-black text-xs">
                    {evaluation.section1Score} / 40
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Section II: Professional conduct and attitudes */}
          <div className="mb-3.5 border border-slate-800 text-[11px]">
            <div className="bg-slate-800 text-white font-bold py-1.5 px-2 flex justify-between items-center text-xs">
              <span>Section II: Professional conduct and attitudes (Total 40)</span>
              <span dir="rtl">الأسلوب في العمل: (الدرجة القصوى 40)</span>
            </div>
            <table className="w-full text-center border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-800 font-bold">
                  <th className="py-1.5 px-2 text-left w-2/5 border-r border-slate-800">Criteria / المعايير</th>
                  <th className="py-1.5 px-1 w-9 border-r border-slate-800">2</th>
                  <th className="py-1.5 px-1 w-9 border-r border-slate-800">4</th>
                  <th className="py-1.5 px-1 w-9 border-r border-slate-800">6</th>
                  <th className="py-1.5 px-1 w-9 border-r border-slate-800">8</th>
                  <th className="py-1.5 px-1 w-9 border-r border-slate-800">10</th>
                  <th className="py-1.5 px-1 w-14 bg-slate-200">Score</th>
                </tr>
              </thead>
              <tbody>
                {evaluation.section2Criteria.map((c, i) => (
                  <tr key={c.id || i} className="border-b border-slate-300">
                    <td className="py-1.5 px-2 text-left border-r border-slate-800">
                      <div className="font-semibold text-slate-800 text-xs">{i + 1}. {c.nameEn}</div>
                      <div className="text-slate-600 text-[10px]" dir="rtl">{c.nameAr}</div>
                    </td>
                    {[2, 4, 6, 8, 10].map((opt) => (
                      <td key={opt} className="py-1.5 px-1 border-r border-slate-800">
                        {c.score === opt ? (
                          <span className="inline-block w-4 h-4 rounded-full bg-slate-900 text-white font-black text-[10px] leading-4">✓</span>
                        ) : '○'}
                      </td>
                    ))}
                    <td className="py-1.5 px-1 font-bold bg-slate-50 text-xs">{c.score}</td>
                  </tr>
                ))}
                <tr className="bg-slate-100 font-bold border-t border-slate-800">
                  <td colSpan={6} className="py-1.5 px-2 text-right border-r border-slate-800 font-bold text-xs">
                    Subtotal Section II / مجموع القسم الثاني (الأسلوب في العمل):
                  </td>
                  <td className="py-1.5 px-1 text-center bg-slate-200 font-black text-xs">
                    {evaluation.section2Score} / 40
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Section III: Personal Behaviour */}
          <div className="mb-3.5 border border-slate-800 text-[11px]">
            <div className="bg-slate-800 text-white font-bold py-1.5 px-2 flex justify-between items-center text-xs">
              <span>Section III: Personal Behaviour (Total 20)</span>
              <span dir="rtl">السلوك الشخصي: (الدرجة القصوى 20)</span>
            </div>
            <table className="w-full text-center border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-800 font-bold">
                  <th className="py-1.5 px-2 text-left w-2/5 border-r border-slate-800">Criteria / المعايير</th>
                  <th className="py-1.5 px-1 w-9 border-r border-slate-800">1</th>
                  <th className="py-1.5 px-1 w-9 border-r border-slate-800">2</th>
                  <th className="py-1.5 px-1 w-9 border-r border-slate-800">3</th>
                  <th className="py-1.5 px-1 w-9 border-r border-slate-800">4</th>
                  <th className="py-1.5 px-1 w-9 border-r border-slate-800">5</th>
                  <th className="py-1.5 px-1 w-14 bg-slate-200">Score</th>
                </tr>
              </thead>
              <tbody>
                {evaluation.section3Criteria.map((c, i) => (
                  <tr key={c.id || i} className="border-b border-slate-300">
                    <td className="py-1.5 px-2 text-left border-r border-slate-800">
                      <div className="font-semibold text-slate-800 text-xs">{i + 1}. {c.nameEn}</div>
                      <div className="text-slate-600 text-[10px]" dir="rtl">{c.nameAr}</div>
                    </td>
                    {[1, 2, 3, 4, 5].map((opt) => (
                      <td key={opt} className="py-1.5 px-1 border-r border-slate-800">
                        {c.score === opt ? (
                          <span className="inline-block w-4 h-4 rounded-full bg-slate-900 text-white font-black text-[10px] leading-4">✓</span>
                        ) : '○'}
                      </td>
                    ))}
                    <td className="py-1.5 px-1 font-bold bg-slate-50 text-xs">{c.score}</td>
                  </tr>
                ))}
                <tr className="bg-slate-100 font-bold border-t border-slate-800">
                  <td colSpan={6} className="py-1.5 px-2 text-right border-r border-slate-800 font-bold text-xs">
                    Subtotal Section III / مجموع القسم الثالث (السلوك الشخصي):
                  </td>
                  <td className="py-1.5 px-1 text-center bg-slate-200 font-black text-xs">
                    {evaluation.section3Score} / 20
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Grand Total Summary Box */}
          <div className="border-2 border-slate-900 p-3 bg-slate-50 flex justify-between items-center">
            <div>
              <div className="text-xs font-black text-slate-900">GRAND TOTAL SCORE / المجموع الكلي للتقييم:</div>
              <div className="text-xs font-bold text-slate-600">
                (Section I: {evaluation.section1Score} + Section II: {evaluation.section2Score} + Section III: {evaluation.section3Score})
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-2xl font-black text-slate-900 bg-white border border-slate-400 px-3.5 py-1 rounded shadow-inner">
                {evaluation.totalScore} / 100
              </div>
              <div className="text-right">
                <div className="text-[11px] text-slate-500 font-semibold">التقدير العام / Rating:</div>
                <div className={`font-black text-base ${ratingInfo.color}`}>
                  {ratingInfo.label}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Page Break for Official 2-Page Print */}
        <div className="my-8 border-b-2 border-dashed border-slate-300 eval-print-hidden print:hidden"></div>

        {/* ================= PAGE 2 ================= */}
        <div className="eval-page-2 relative">
          
          {/* Header mini for Page 2 */}
          <div className="flex justify-between items-center pb-2.5 mb-4 border-b border-slate-400 text-xs">
            <span className="font-bold">ANNUAL PERFORMANCE APPRAISAL FORM - PAGE 2</span>
            <span className="font-bold" dir="rtl">الموظف: {evaluation.employeeName} ({resolvedEmployeeNumber})</span>
          </div>

          {/* Strength Points */}
          <div className="mb-4 border border-slate-800">
            <div className="bg-slate-100 font-bold py-1.5 px-2.5 border-b border-slate-800 flex justify-between text-xs">
              <span>Strength points:</span>
              <span dir="rtl">نقاط القوة:</span>
            </div>
            <div className="p-3 min-h-[75px] text-xs whitespace-pre-wrap leading-relaxed text-slate-800 bg-white">
              {evaluation.strengthPoints || 'لا توجد ملاحظات مسجلة.'}
            </div>
          </div>

          {/* Weakness Points */}
          <div className="mb-4 border border-slate-800">
            <div className="bg-slate-100 font-bold py-1.5 px-2.5 border-b border-slate-800 flex justify-between text-xs">
              <span>Weakness points:</span>
              <span dir="rtl">نقاط الضعف وفرص التحسين:</span>
            </div>
            <div className="p-3 min-h-[75px] text-xs whitespace-pre-wrap leading-relaxed text-slate-800 bg-white">
              {evaluation.weaknessPoints || 'لا توجد نقاط ضعف مسجلة.'}
            </div>
          </div>

          {/* Evaluator Signature (Supervisor or Head of Department) */}
          <div className="mb-4 border border-slate-800 p-3 text-xs bg-slate-50">
            <div className="font-bold mb-2.5 flex justify-between border-b border-slate-300 pb-1.5 text-slate-900 text-xs">
              <span>
                {isHeadOfDept ? 'Head of Dept. Signature & Approval:' : 'Supervisor Signature & Approval:'}
              </span>
              <span dir="rtl">
                {isHeadOfDept ? 'اعتماد وتوقيع رئيس القسم:' : 'اعتماد وتوقيع مشرف القسم:'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <span className="text-slate-600 block text-[11px]">الاسم / Name:</span>
                <span className="font-bold text-slate-900 text-[13px]">{evaluation.supervisorName || '—'}</span>
              </div>
              <div>
                <span className="text-slate-600 block text-[11px]">التاريخ / Date:</span>
                <span className="font-bold text-slate-900 text-[13px]">{evaluation.supervisorSignatureDate || evaluation.evaluationDate || '—'}</span>
              </div>
              <div>
                <span className="text-slate-600 block text-[11px]">التوقيع / Signature:</span>
                <div className="border-b border-slate-600 pb-1 font-serif italic text-blue-900 font-bold text-sm">
                  {evaluation.supervisorSigned 
                    ? (isHeadOfDept 
                        ? `✓ Approved (Head of Dept: ${evaluation.supervisorName})` 
                        : `✓ Approved (Supervisor: ${evaluation.supervisorName})`) 
                    : '______________________'}
                </div>
              </div>
            </div>
          </div>

          {/* Employee Acknowledgement for Evaluation Results */}
          <div className="mb-4 border-2 border-slate-800 p-3 bg-white text-xs">
            <div className="font-bold mb-2 flex justify-between border-b border-slate-800 pb-1.5 text-slate-900 text-xs">
              <span>Employee acknowledgement for evaluation results:</span>
              <span dir="rtl">إقرار واطلاع الموظف على نتائج التقييم:</span>
            </div>
            
            <p className="font-semibold text-slate-700 mb-2.5">
              The results of my evaluation had been discussed with me and: / لقد تم مناقشة التقييم معي وأنه:
            </p>

            <div className="grid grid-cols-2 gap-3 mb-3.5 bg-slate-50 p-2.5 border border-slate-300 rounded">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                <span className={`w-4 h-4 border-2 border-slate-800 rounded flex items-center justify-center ${evaluation.employeeObjectionStatus === 'none' ? 'bg-slate-900 text-white' : 'bg-white'}`}>
                  {evaluation.employeeObjectionStatus === 'none' ? '✓' : ''}
                </span>
                <span>I don't have any objections / ليس لدي أي اعتراضات</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                <span className={`w-4 h-4 border-2 border-slate-800 rounded flex items-center justify-center ${evaluation.employeeObjectionStatus === 'has_objections' ? 'bg-slate-900 text-white' : 'bg-white'}`}>
                  {evaluation.employeeObjectionStatus === 'has_objections' ? '✓' : ''}
                </span>
                <span>I have some objections / لدي بعض الإعتراضات</span>
              </label>
            </div>

            <div className="mb-3.5">
              <span className="text-slate-700 font-semibold block mb-1">Comments: / ملاحظات الموظف:</span>
              <div className="min-h-[50px] p-2 border border-slate-300 bg-slate-50 text-[11px] rounded leading-relaxed">
                {evaluation.employeeComments || 'لا توجد ملاحظات إضافية من قبل الموظف.'}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-slate-300 pt-2.5">
              <div>
                <span className="text-slate-600 block text-[11px]">توقيع الموظف / Employee Signature:</span>
                <span className="font-bold text-blue-900 font-serif italic text-sm">
                  {evaluation.employeeSigned ? `✓ ${evaluation.employeeSignature || evaluation.employeeName}` : '______________________'}
                </span>
              </div>
              <div>
                <span className="text-slate-600 block text-[11px]">تاريخ الاطلاع والاعتماد / Date:</span>
                <span className="font-bold text-slate-900 text-[13px]">
                  {evaluation.employeeSignedDate || '______________________'}
                </span>
              </div>
            </div>
          </div>

          {/* Final Decision */}
          <div className="border border-slate-800 text-xs">
            <div className="bg-slate-800 text-white font-bold py-1.5 px-2.5 flex justify-between items-center text-xs">
              <span>Final decision:</span>
              <span dir="rtl">القرار النهائي:</span>
            </div>

            <div className="p-2.5 bg-slate-50 border-b border-slate-300">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <span className={`w-4 h-4 border-2 border-slate-800 rounded flex items-center justify-center ${evaluation.recommendTraining ? 'bg-slate-900 text-white' : 'bg-white'}`}>
                  {evaluation.recommendTraining ? '✓' : ''}
                </span>
                <span>Recommend training program / التوصية ببرنامج تدريبي</span>
              </div>
              <p className="text-slate-600 text-[10px] mt-1">
                Fill this table in case of recommend training program / في حالة التوصية ببرنامج تدريبي الرجاء تعبئة الجدول التالي:
              </p>
            </div>

            <table className="w-full text-center border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-800 font-bold text-xs">
                  <th className="py-1.5 px-2 w-1/2 border-r border-slate-800 text-left">Program name / اسم البرنامج التدريبي</th>
                  <th className="py-1.5 px-1 w-1/4 border-r border-slate-800">Time period / المدة الزمنية</th>
                  <th className="py-1.5 px-1 w-1/4">Training place / مكان التدريب</th>
                </tr>
              </thead>
              <tbody>
                {evaluation.trainingPrograms && evaluation.trainingPrograms.length > 0 ? (
                  evaluation.trainingPrograms.map((tp, idx) => (
                    <tr key={tp.id || idx} className="border-b border-slate-300 text-xs">
                      <td className="py-1.5 px-2 text-left border-r border-slate-800 font-semibold">{tp.programName}</td>
                      <td className="py-1.5 px-1 border-r border-slate-800">{tp.timePeriod}</td>
                      <td className="py-1.5 px-1">{tp.trainingPlace}</td>
                    </tr>
                  ))
                ) : (
                  <>
                    <tr className="border-b border-slate-300 h-7">
                      <td className="border-r border-slate-800"></td>
                      <td className="border-r border-slate-800"></td>
                      <td></td>
                    </tr>
                    <tr className="border-b border-slate-300 h-7">
                      <td className="border-r border-slate-800"></td>
                      <td className="border-r border-slate-800"></td>
                      <td></td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* Official Stamp Box at bottom */}
          <div className="flex justify-between items-end mt-5 pt-2 border-t border-slate-300 text-[11px] text-slate-500">
            <div>Form Ref: AJH-HR-APPRAISAL-V2 • ISO 9001:2015 & CBAHI Compliant</div>
            <div className="text-right">Al Jedaani Hospital Management System</div>
          </div>
        </div>

        </div>

      </div>
    </div>
  );

  return createPortal(content, document.body);
};
