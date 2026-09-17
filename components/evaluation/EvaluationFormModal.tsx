import React, { useState, useMemo, useEffect } from 'react';
import { User, AnnualEvaluation, AppraisalCriterion, AppraisalTrainingProgram } from '../../types';
import { useLanguage } from '../../contexts/LanguageContext';
import { useDepartment } from '../../contexts/DepartmentContext';
import { 
  getDefaultSection1Criteria, 
  getDefaultSection2Criteria, 
  getDefaultSection3Criteria, 
  calculateRatingGrade, 
  getRatingGradeLabel 
} from '../../services/evaluationService';
import { 
  STRENGTH_SUGGESTIONS, 
  IMPROVEMENT_SUGGESTIONS, 
  TRAINING_PROGRAM_PRESETS,
  AppraisalSuggestion,
  TrainingProgramPreset
} from '../../data/evaluationSuggestions';
import { db, auth } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
// @ts-ignore
import { doc, setDoc, serverTimestamp, collection } from 'firebase/firestore';

interface EvaluationFormModalProps {
  initialEvaluation?: AnnualEvaluation | null;
  users: User[];
  onClose: () => void;
  onSaved: (evaluation: AnnualEvaluation) => void;
  userDepartmentName?: string;
}

export const EvaluationFormModal: React.FC<EvaluationFormModalProps> = ({
  initialEvaluation,
  users,
  onClose,
  onSaved,
  userDepartmentName,
}) => {
  const { language, dir, t } = useLanguage();
  const isEn = language === 'en';
  const { departments } = useDepartment();
  const { userName, role: userRole } = useAuth();

  const currentYear = new Date().getFullYear();
  const todayStr = new Date().toISOString().split('T')[0];
  const currentUser = auth.currentUser;

  // Helper to resolve human-readable department name from ID or Name
  const resolveDeptDisplayName = (deptIdOrName?: string | null): string => {
    if (!deptIdOrName) return userDepartmentName || '';
    const found = departments.find(d => d.id === deptIdOrName || d.name === deptIdOrName);
    if (found) return found.name;
    if (userDepartmentName) return userDepartmentName;
    return deptIdOrName;
  };

  // Selected Employee
  const [selectedUserId, setSelectedUserId] = useState<string>(initialEvaluation?.employeeId || '');
  const [employeeName, setEmployeeName] = useState(initialEvaluation?.employeeName || '');
  const [employeeNumber, setEmployeeNumber] = useState(initialEvaluation?.employeeNumber || '');
  const [position, setPosition] = useState(initialEvaluation?.position || '');
  const [departmentName, setDepartmentName] = useState(() => {
    const raw = initialEvaluation?.departmentName || initialEvaluation?.departmentId || userDepartmentName || '';
    return resolveDeptDisplayName(raw);
  });
  const [departmentId, setDepartmentId] = useState(initialEvaluation?.departmentId || '');
  const [currentContract, setCurrentContract] = useState(initialEvaluation?.currentContract || '');
  const [evaluationDate, setEvaluationDate] = useState(initialEvaluation?.evaluationDate || todayStr);
  const [evaluationYear, setEvaluationYear] = useState<number>(initialEvaluation?.evaluationYear || currentYear);

  // Synchronize department name if departments load or if it matches a department ID
  useEffect(() => {
    if (departments.length > 0 && departmentName) {
      const match = departments.find(d => d.id === departmentName);
      if (match) {
        setDepartmentName(match.name);
        setDepartmentId(match.id);
      }
    } else if (!departmentName && userDepartmentName) {
      setDepartmentName(userDepartmentName);
    }
  }, [departments, userDepartmentName]);

  // If creating new evaluation, require selecting employee first before scoring
  const [isEmployeeSelected, setIsEmployeeSelected] = useState<boolean>(
    Boolean(initialEvaluation?.employeeId || initialEvaluation?.employeeName)
  );

  // Sections
  const [section1Criteria, setSection1Criteria] = useState<AppraisalCriterion[]>(
    initialEvaluation?.section1Criteria || getDefaultSection1Criteria()
  );
  const [section2Criteria, setSection2Criteria] = useState<AppraisalCriterion[]>(
    initialEvaluation?.section2Criteria || getDefaultSection2Criteria()
  );
  const [section3Criteria, setSection3Criteria] = useState<AppraisalCriterion[]>(
    initialEvaluation?.section3Criteria || getDefaultSection3Criteria()
  );

  // Qualitative Points
  const [strengthPoints, setStrengthPoints] = useState(initialEvaluation?.strengthPoints || '');
  const [weaknessPoints, setWeaknessPoints] = useState(initialEvaluation?.weaknessPoints || '');

  // Training Recommendations
  const [recommendTraining, setRecommendTraining] = useState(initialEvaluation?.recommendTraining ?? false);
  const [trainingPrograms, setTrainingPrograms] = useState<AppraisalTrainingProgram[]>(
    initialEvaluation?.trainingPrograms || []
  );

  // Evaluator Type (Supervisor vs Head of Dept. automatically derived from user role)
  const defaultEvaluatorRole: 'supervisor' | 'manager' = 
    initialEvaluation?.evaluatorRole || 
    ((userRole?.toLowerCase() === 'admin' || userRole?.toLowerCase() === 'manager') ? 'manager' : 'supervisor');

  const evaluatorRole: 'supervisor' | 'manager' = defaultEvaluatorRole;

  const getInitialEvaluatorName = () => {
    if (initialEvaluation?.supervisorName && 
        initialEvaluation.supervisorName !== 'Department Supervisor' && 
        initialEvaluation.supervisorName !== 'المشرف المسؤول' &&
        initialEvaluation.supervisorName !== 'General Manager' &&
        initialEvaluation.supervisorName !== 'المدير العام') {
      return initialEvaluation.supervisorName;
    }
    if (userName) return userName;
    if (currentUser?.displayName) return currentUser.displayName;
    return defaultEvaluatorRole === 'manager'
      ? (isEn ? 'Head of Department' : 'رئيس القسم')
      : (isEn ? 'Department Supervisor' : 'مشرف القسم');
  };

  const [supervisorName, setSupervisorName] = useState(getInitialEvaluatorName());
  const [supervisorSigned, setSupervisorSigned] = useState(initialEvaluation?.supervisorSigned ?? true);

  // Auto-sync evaluator name to the logged in user who is performing the evaluation
  useEffect(() => {
    if (!initialEvaluation && userName && (supervisorName === 'Department Supervisor' || supervisorName === 'المشرف المسؤول' || !supervisorName || supervisorName === 'Head of Department' || supervisorName === 'رئيس القسم')) {
      setSupervisorName(userName);
    }
  }, [userName, initialEvaluation]);

  // Status & Saving State
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'scoring' | 'qualitative' | 'decision'>('info');

  // Custom Criteria Modal State
  const [showAddCriteriaModal, setShowAddCriteriaModal] = useState<1 | 2 | 3 | null>(null);
  const [newCriteriaNameAr, setNewCriteriaNameAr] = useState('');
  const [newCriteriaNameEn, setNewCriteriaNameEn] = useState('');
  const [newCriteriaMaxScore, setNewCriteriaMaxScore] = useState<number>(10);

  // Auto-sync latest employee details (especially employee number) from users list
  useEffect(() => {
    const targetId = selectedUserId || initialEvaluation?.employeeId;
    if (targetId && users.length > 0) {
      const u = users.find(x => x.id === targetId || (employeeName && x.name === employeeName));
      if (u) {
        if (u.employeeNumber) {
          setEmployeeNumber(u.employeeNumber);
        }
        if (!position && (u.jobCategory || u.role)) {
          setPosition(u.jobCategory || u.role || '');
        }
      }
    }
  }, [selectedUserId, initialEvaluation?.employeeId, users, employeeName]);

  // Auto-fill when selecting employee
  const handleSelectUser = (userId: string) => {
    setSelectedUserId(userId);
    if (!userId) {
      setIsEmployeeSelected(false);
      return;
    }
    const u = users.find(x => x.id === userId);
    if (u) {
      setEmployeeName(u.name || '');
      setEmployeeNumber(u.employeeNumber || '');
      setPosition(u.jobCategory || u.role || (isEn ? 'Staff' : 'موظف'));
      
      // Look up friendly department name
      const matchedDept = departments.find(d => d.id === u.departmentId || d.name === u.departmentId);
      const friendlyDeptName = matchedDept?.name || userDepartmentName || (isEn ? 'Department' : 'القسم');
      
      setDepartmentName(friendlyDeptName);
      setDepartmentId(matchedDept?.id || u.departmentId || '');
      setCurrentContract(u.hireDate || '');
      setIsEmployeeSelected(true);
    }
  };

  // Score Calculations
  const section1Score = section1Criteria.reduce((sum, c) => sum + (c.score || 0), 0);
  const section2Score = section2Criteria.reduce((sum, c) => sum + (c.score || 0), 0);
  const section3Score = section3Criteria.reduce((sum, c) => sum + (c.score || 0), 0);
  const totalScore = section1Score + section2Score + section3Score;
  const ratingGrade = calculateRatingGrade(totalScore);
  const ratingInfo = getRatingGradeLabel(ratingGrade, !isEn);

  // Append Suggestion to Strength or Weakness textareas
  const appendStrength = (suggestion: AppraisalSuggestion) => {
    const textToAdd = isEn ? suggestion.textEn : suggestion.textAr;
    if (strengthPoints.includes(textToAdd)) return;
    setStrengthPoints(prev => {
      const trimmed = prev.trim();
      return trimmed ? `${trimmed}\n• ${textToAdd}` : `• ${textToAdd}`;
    });
  };

  const appendWeakness = (suggestion: AppraisalSuggestion) => {
    const textToAdd = isEn ? suggestion.textEn : suggestion.textAr;
    if (weaknessPoints.includes(textToAdd)) return;
    setWeaknessPoints(prev => {
      const trimmed = prev.trim();
      return trimmed ? `${trimmed}\n• ${textToAdd}` : `• ${textToAdd}`;
    });
  };

  // Append Preset Training Program
  const appendTrainingPreset = (preset: TrainingProgramPreset) => {
    setRecommendTraining(true);
    const alreadyExists = trainingPrograms.some(
      tp => tp.programName.toLowerCase() === (isEn ? preset.programNameEn : preset.programNameAr).toLowerCase()
    );
    if (alreadyExists) return;

    setTrainingPrograms(prev => [
      ...prev,
      {
        id: 'tp_' + Date.now() + Math.random().toString(36).substr(2, 4),
        programName: isEn ? preset.programNameEn : preset.programNameAr,
        timePeriod: isEn ? preset.timePeriodEn : preset.timePeriodAr,
        trainingPlace: isEn ? preset.trainingPlaceEn : preset.trainingPlaceAr,
      }
    ]);
  };

  // Add Empty Training Program Row
  const addTrainingProgramRow = () => {
    setRecommendTraining(true);
    setTrainingPrograms([
      ...trainingPrograms,
      {
        id: 'tp_' + Date.now(),
        programName: '',
        timePeriod: '',
        trainingPlace: '',
      },
    ]);
  };

  const updateTrainingProgram = (id: string, field: keyof AppraisalTrainingProgram, val: string) => {
    setTrainingPrograms(trainingPrograms.map(tp => tp.id === id ? { ...tp, [field]: val } : tp));
  };

  const removeTrainingProgram = (id: string) => {
    setTrainingPrograms(trainingPrograms.filter(tp => tp.id !== id));
  };

  // Add Custom Criteria to a Section
  const handleAddCustomCriteria = () => {
    if (!newCriteriaNameAr.trim() && !newCriteriaNameEn.trim()) return;

    const newCriterion: AppraisalCriterion = {
      id: `custom_${Date.now()}`,
      nameAr: newCriteriaNameAr.trim() || newCriteriaNameEn.trim(),
      nameEn: newCriteriaNameEn.trim() || newCriteriaNameAr.trim(),
      score: Math.min(newCriteriaMaxScore, 8),
      maxScore: newCriteriaMaxScore,
      options: newCriteriaMaxScore === 5 ? [1, 2, 3, 4, 5] : [2, 4, 6, 8, 10],
      isCustom: true,
    };

    if (showAddCriteriaModal === 1) {
      setSection1Criteria([...section1Criteria, newCriterion]);
    } else if (showAddCriteriaModal === 2) {
      setSection2Criteria([...section2Criteria, newCriterion]);
    } else if (showAddCriteriaModal === 3) {
      setSection3Criteria([...section3Criteria, newCriterion]);
    }

    setNewCriteriaNameAr('');
    setNewCriteriaNameEn('');
    setShowAddCriteriaModal(null);
  };

  // Remove Criterion
  const removeCriterion = (sectionNum: 1 | 2 | 3, id: string) => {
    if (sectionNum === 1) setSection1Criteria(section1Criteria.filter(c => c.id !== id));
    if (sectionNum === 2) setSection2Criteria(section2Criteria.filter(c => c.id !== id));
    if (sectionNum === 3) setSection3Criteria(section3Criteria.filter(c => c.id !== id));
  };

  // Save Handler
  const handleSave = async (status: 'draft' | 'published') => {
    if (!selectedUserId && !employeeName.trim()) {
      alert(isEn ? 'Please select an employee first.' : 'يرجى اختيار الموظف أولاً قبل الحفظ');
      setActiveTab('info');
      return;
    }

    setSaving(true);
    try {
      const evalId = initialEvaluation?.id || doc(collection(db, 'annual_evaluations')).id;
      
      const payload: AnnualEvaluation = {
        id: evalId,
        employeeId: selectedUserId || `emp_${Date.now()}`,
        employeeName: employeeName.trim(),
        employeeNumber: employeeNumber.trim(),
        position: position.trim(),
        departmentId: departmentId.trim(),
        departmentName: departmentName.trim(),
        currentContract: currentContract.trim(),
        evaluationDate,
        evaluationYear: Number(evaluationYear),
        section1Criteria,
        section1Score,
        section2Criteria,
        section2Score,
        section3Criteria,
        section3Score,
        totalScore,
        ratingGrade,
        strengthPoints: strengthPoints.trim(),
        weaknessPoints: weaknessPoints.trim(),
        supervisorId: currentUser?.uid || 'supervisor',
        supervisorName: supervisorName.trim(),
        supervisorSignatureDate: evaluationDate,
        supervisorSigned,
        evaluatorRole,
        evaluatorTitle: evaluatorRole === 'manager'
          ? (isEn ? 'Head of Department' : 'رئيس القسم')
          : (isEn ? 'Department Supervisor' : 'مشرف القسم'),
        employeeDiscussed: initialEvaluation?.employeeDiscussed ?? false,
        employeeObjectionStatus: initialEvaluation?.employeeObjectionStatus ?? 'none',
        employeeComments: initialEvaluation?.employeeComments ?? '',
        employeeSignature: initialEvaluation?.employeeSignature ?? '',
        employeeSignedDate: initialEvaluation?.employeeSignedDate ?? '',
        employeeSigned: initialEvaluation?.employeeSigned ?? false,
        recommendTraining,
        trainingPrograms,
        status,
        createdAt: initialEvaluation?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(db, 'annual_evaluations', evalId), payload, { merge: true });
      onSaved(payload);
      onClose();
    } catch (err: any) {
      console.error('Error saving evaluation:', err);
      alert((isEn ? 'Error saving appraisal: ' : 'حدث خطأ أثناء حفظ التقييم: ') + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm overflow-y-auto flex justify-center p-2 sm:p-4 md:p-6 animate-fade-in" dir={dir}>
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col my-auto max-h-[94vh] overflow-hidden">
        
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md">
              <i className="fas fa-clipboard-check text-lg"></i>
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                {initialEvaluation 
                  ? (isEn ? `Edit Appraisal: ${employeeName || 'Staff'}` : `تعديل التقييم السنوي: ${employeeName || 'الموظف'}`)
                  : (isEn ? 'Annual Performance Appraisal Form' : 'نموذج تقييم الأداء السنوي للموظف')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isEn ? 'Al Jedaani Group of Hospitals • Official Appraisal Form' : 'مجموعة مستشفيات الجدعاني • نموذج التقييم السنوي المعتمد'}
              </p>
            </div>
          </div>

          {/* Quick Score Badge in Header */}
          <div className="flex items-center gap-3">
            <div className={isEn ? 'text-right' : 'text-left'}>
              <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                {isEn ? 'Total Score' : 'المجموع الكلي'}
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-slate-900 dark:text-white">{totalScore}</span>
                <span className="text-xs text-slate-400">/ 100</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${ratingInfo.bg} ${ratingInfo.color} ${isEn ? 'ml-1' : 'mr-1'}`}>
                  {ratingInfo.label}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
              title={isEn ? 'Close' : 'إغلاق'}
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>

        {/* Step Alert If Employee Not Selected */}
        {!isEmployeeSelected && (
          <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800/60 px-5 py-2.5 flex items-center justify-between text-xs text-amber-800 dark:text-amber-200 font-medium">
            <div className="flex items-center gap-2">
              <i className="fas fa-exclamation-circle text-amber-600 dark:text-amber-400"></i>
              <span>
                {isEn 
                  ? 'Step 1: Please select the department employee first before filling the scores and evaluation criteria.' 
                  : 'الخطوة الأولى: يرجى اختيار موظف القسم أولاً قبل الشروع في وضع الدرجات والتقييم.'}
              </span>
            </div>
            <button
              onClick={() => setActiveTab('info')}
              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-[11px] transition-colors"
            >
              {isEn ? 'Select Employee' : 'اختيار الموظف الآن'}
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="px-5 pt-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex gap-2 overflow-x-auto flex-shrink-0">
          <button
            onClick={() => setActiveTab('info')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
              activeTab === 'info'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <i className="fas fa-user-check"></i>
            <span>{isEn ? '1. Staff & Department' : '1. اختيار الموظف والقسم'}</span>
            {employeeName && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
            )}
          </button>
          
          <button
            onClick={() => {
              if (!isEmployeeSelected) {
                alert(isEn ? 'Please select an employee first' : 'يرجى اختيار الموظف أولاً لتفعيل نموذج الدرجات');
                setActiveTab('info');
                return;
              }
              setActiveTab('scoring');
            }}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
              activeTab === 'scoring'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            } ${!isEmployeeSelected ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <i className="fas fa-list-ol"></i>
            <span>{isEn ? `2. Scoring Criteria (${totalScore}/100)` : `2. بنود التقييم والدرجات (${totalScore}/100)`}</span>
          </button>

          <button
            onClick={() => {
              if (!isEmployeeSelected) {
                alert(isEn ? 'Please select an employee first' : 'يرجى اختيار الموظف أولاً');
                setActiveTab('info');
                return;
              }
              setActiveTab('qualitative');
            }}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
              activeTab === 'qualitative'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            } ${!isEmployeeSelected ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <i className="fas fa-comment-dots"></i>
            <span>{isEn ? '3. Strengths & Improvements' : '3. نقاط القوة وفرص التحسين'}</span>
          </button>

          <button
            onClick={() => {
              if (!isEmployeeSelected) {
                alert(isEn ? 'Please select an employee first' : 'يرجى اختيار الموظف أولاً');
                setActiveTab('info');
                return;
              }
              setActiveTab('decision');
            }}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
              activeTab === 'decision'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            } ${!isEmployeeSelected ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <i className="fas fa-graduation-cap"></i>
            <span>{isEn ? '4. Training & Approval' : '4. البرامج التدريبية والاعتماد'}</span>
          </button>
        </div>

        {/* Modal Body (Scrollable) */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          
          {/* ============ TAB 1: EMPLOYEE SELECTION & INFO ============ */}
          {activeTab === 'info' && (
            <div className="space-y-4">
              {/* Department Notice */}
              <div className="bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 p-3.5 rounded-xl flex items-start gap-3">
                <i className="fas fa-hospital-user text-blue-600 dark:text-blue-400 text-base mt-0.5"></i>
                <div className="space-y-1">
                  <h4 className="font-bold text-slate-900 dark:text-white">
                    {isEn ? 'Department Staff Selection' : 'اختيار موظفي قسم المشرف'}
                  </h4>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-[11px]">
                    {isEn
                      ? 'The list below contains exclusively the staff registered in your department. Selecting a name will auto-populate their position, employee ID, and department.'
                      : 'القائمة المنسدلة أدناه مخصصة فقط لموظفي قسمك المعتمدين. عند اختيار اسم الموظف سيقوم النظام بتعبئة مسماه الوظيفي ورقمه وقسمه تلقائياً.'}
                  </p>
                </div>
              </div>

              {/* Employee Selector Card */}
              <div className="bg-white dark:bg-slate-850 border-2 border-blue-500/30 dark:border-blue-500/20 p-4 rounded-xl shadow-sm space-y-4">
                <div>
                  <label className="font-bold text-slate-800 dark:text-slate-200 block mb-1.5 text-xs flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <i className="fas fa-user-check text-blue-600 dark:text-blue-400"></i>
                      <span>{isEn ? 'Select Staff Member from Department:' : 'اختيار اسم الموظف من قائمة موظفي القسم:'}</span>
                    </span>
                    <span className="text-[11px] text-blue-600 dark:text-blue-400 font-normal">
                      ({users.length} {isEn ? 'employees in department' : 'موظف في هذا القسم'})
                    </span>
                  </label>
                  
                  <select
                    value={selectedUserId}
                    onChange={(e) => handleSelectUser(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-blue-400/50 dark:border-blue-600/50 rounded-xl p-3 text-slate-900 dark:text-white font-bold text-sm focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                  >
                    <option value="">{isEn ? '-- Select an employee to begin appraisal --' : '-- اختر اسم الموظف لبدء التقييم --'}</option>
                    {users.map((u) => {
                      const deptObj = departments.find(d => d.id === u.departmentId || d.name === u.departmentId);
                      const deptText = deptObj ? ` • ${deptObj.name}` : (userDepartmentName ? ` • ${userDepartmentName}` : '');
                      const empNumText = u.employeeNumber ? ` [الرقم: ${u.employeeNumber}]` : (u.phone ? ` [${u.phone}]` : '');
                      return (
                        <option key={u.id} value={u.id}>
                          {u.name} — ({u.role || u.jobCategory || (isEn ? 'Staff' : 'موظف')}){deptText}{empNumText}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Selected Employee Summary Card */}
                {selectedUserId && (
                  <div className="bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 p-3 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-sm">
                        {employeeName.charAt(0) || 'U'}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white text-sm">{employeeName}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {position} • {departmentName} • {employeeNumber}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('scoring')}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-sm transition-all flex items-center gap-2"
                    >
                      <span>{isEn ? 'Proceed to Scoring' : 'الانتقال لتقييم الدرجات'}</span>
                      <i className={`fas fa-arrow-${isEn ? 'right' : 'left'}`}></i>
                    </button>
                  </div>
                )}
              </div>

              {/* Editable Information Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                {/* Employee Name */}
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    {isEn ? 'Employee Name:' : 'اسم الموظف:'}
                  </label>
                  <input
                    type="text"
                    value={employeeName}
                    onChange={(e) => setEmployeeName(e.target.value)}
                    placeholder={isEn ? 'Full employee name' : 'اسم الموظف الرباعي'}
                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                {/* Employee Number */}
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    {isEn ? 'Employee Number / Staff ID:' : 'الرقم الوظيفي / الكود:'}
                  </label>
                  <input
                    type="text"
                    value={employeeNumber}
                    onChange={(e) => setEmployeeNumber(e.target.value)}
                    placeholder={isEn ? 'e.g. AJ-1045' : 'مثال: AJ-1045'}
                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                {/* Position / Job Title */}
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    {isEn ? 'Position / Job Title:' : 'الوظيفة:'}
                  </label>
                  <input
                    type="text"
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    placeholder={isEn ? 'e.g. Radiology Specialist / Nurse' : 'مثال: أخصائي أشعة / فني مختبر / ممرض'}
                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                {/* Department */}
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    {isEn ? 'Department:' : 'القسم:'}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      list="appraisal-departments-list"
                      value={departmentName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDepartmentName(val);
                        const matched = departments.find(d => d.name === val || d.id === val);
                        if (matched) {
                          setDepartmentId(matched.id);
                        }
                      }}
                      placeholder={isEn ? 'e.g. Radiology Dept.' : 'مثال: قسم الأشعة'}
                      className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                    />
                    <datalist id="appraisal-departments-list">
                      {departments.map((d) => (
                        <option key={d.id} value={d.name} />
                      ))}
                    </datalist>
                  </div>
                </div>

                {/* Current Contract */}
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    {isEn ? 'Contract / Hire Date:' : 'تاريخ بداية العقد أو التعيين:'}
                  </label>
                  <input
                    type="text"
                    value={currentContract}
                    onChange={(e) => setCurrentContract(e.target.value)}
                    placeholder={isEn ? 'e.g. 2022-04-01' : 'مثال: 2022-04-01 أو تجديد سنوي'}
                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                {/* Evaluation Date */}
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    {isEn ? 'Appraisal Date:' : 'تاريخ إجراء التقييم:'}
                  </label>
                  <input
                    type="date"
                    value={evaluationDate}
                    onChange={(e) => setEvaluationDate(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                {/* Appraisal Year */}
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    {isEn ? 'Appraisal Year:' : 'سنة التقييم السنوي:'}
                  </label>
                  <input
                    type="number"
                    value={evaluationYear}
                    onChange={(e) => setEvaluationYear(Number(e.target.value))}
                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ============ TAB 2: SCORING ============ */}
          {activeTab === 'scoring' && (
            <div className="space-y-6">
              
              {/* Section I: Knowledge & Performance */}
              <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl overflow-hidden shadow-sm">
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-3 px-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-blue-500/30 text-blue-300 flex items-center justify-center font-bold text-xs border border-blue-400/30">
                      I
                    </span>
                    <span className="font-bold text-sm">
                      {isEn ? 'I. Professional Knowledge & Performance' : 'أولاً: المعرفة والأداء المهني'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs bg-slate-700/80 px-2.5 py-1 rounded-full font-bold">
                      {isEn ? 'Total:' : 'المجموع:'} <span className="text-blue-300 font-black">{section1Score}</span> / 40
                    </span>
                    <button
                      onClick={() => setShowAddCriteriaModal(1)}
                      className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                      title={isEn ? 'Add Custom Criterion' : 'إضافة بند تقييم مخصص لهذا القسم'}
                    >
                      <i className="fas fa-plus"></i>
                      <span>{isEn ? 'Add Criterion' : 'إضافة معيار'}</span>
                    </button>
                  </div>
                </div>

                <div className="p-4 divide-y divide-slate-100 dark:divide-slate-800/80">
                  {section1Criteria.map((c, idx) => (
                    <div key={c.id || idx} className="py-3 first:pt-0 last:pb-0 flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            {idx + 1}. {isEn ? (c.nameEn || c.nameAr) : (c.nameAr || c.nameEn)}
                          </span>
                          {c.isCustom && (
                            <button
                              onClick={() => removeCriterion(1, c.id)}
                              className="text-rose-500 hover:text-rose-700 text-xs"
                              title={isEn ? 'Remove' : 'حذف هذا المعيار المخصص'}
                            >
                              <i className="fas fa-trash-alt"></i>
                            </button>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 font-sans tracking-wide">
                          {isEn ? c.nameAr : c.nameEn}
                        </div>
                      </div>

                      {/* Score Options Buttons */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {c.options.map((val) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => {
                              setSection1Criteria(section1Criteria.map(item => item.id === c.id ? { ...item, score: val } : item));
                            }}
                            className={`w-9 h-8 rounded-lg font-black text-xs transition-all flex items-center justify-center ${
                              c.score === val
                                ? 'bg-blue-600 text-white shadow-md scale-105 ring-2 ring-blue-400/50'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                            }`}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section II: Work Style & Attitude */}
              <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl overflow-hidden shadow-sm">
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-3 px-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-indigo-500/30 text-indigo-300 flex items-center justify-center font-bold text-xs border border-indigo-400/30">
                      II
                    </span>
                    <span className="font-bold text-sm">
                      {isEn ? 'II. Work Style & Attitude' : 'ثانياً: الأسلوب في العمل'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs bg-slate-700/80 px-2.5 py-1 rounded-full font-bold">
                      {isEn ? 'Total:' : 'المجموع:'} <span className="text-indigo-300 font-black">{section2Score}</span> / 40
                    </span>
                    <button
                      onClick={() => setShowAddCriteriaModal(2)}
                      className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                      title={isEn ? 'Add Custom Criterion' : 'إضافة بند تقييم إضافي لهذا القسم'}
                    >
                      <i className="fas fa-plus"></i>
                      <span>{isEn ? 'Add Criterion' : 'إضافة معيار'}</span>
                    </button>
                  </div>
                </div>

                <div className="p-4 divide-y divide-slate-100 dark:divide-slate-800/80">
                  {section2Criteria.map((c, idx) => (
                    <div key={c.id || idx} className="py-3 first:pt-0 last:pb-0 flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            {idx + 1}. {isEn ? (c.nameEn || c.nameAr) : (c.nameAr || c.nameEn)}
                          </span>
                          {c.isCustom && (
                            <button
                              onClick={() => removeCriterion(2, c.id)}
                              className="text-rose-500 hover:text-rose-700 text-xs"
                              title={isEn ? 'Remove' : 'حذف هذا المعيار المخصص'}
                            >
                              <i className="fas fa-trash-alt"></i>
                            </button>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 font-sans tracking-wide">
                          {isEn ? c.nameAr : c.nameEn}
                        </div>
                      </div>

                      {/* Score Options Buttons */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {c.options.map((val) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => {
                              setSection2Criteria(section2Criteria.map(item => item.id === c.id ? { ...item, score: val } : item));
                            }}
                            className={`w-9 h-8 rounded-lg font-black text-xs transition-all flex items-center justify-center ${
                              c.score === val
                                ? 'bg-indigo-600 text-white shadow-md scale-105 ring-2 ring-indigo-400/50'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                            }`}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section III: Personal Behaviour */}
              <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl overflow-hidden shadow-sm">
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-3 px-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-emerald-500/30 text-emerald-300 flex items-center justify-center font-bold text-xs border border-emerald-400/30">
                      III
                    </span>
                    <span className="font-bold text-sm">
                      {isEn ? 'III. Personal Behaviour' : 'ثالثاً: السلوك الشخصي'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs bg-slate-700/80 px-2.5 py-1 rounded-full font-bold">
                      {isEn ? 'Total:' : 'المجموع:'} <span className="text-emerald-300 font-black">{section3Score}</span> / 20
                    </span>
                    <button
                      onClick={() => setShowAddCriteriaModal(3)}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                      title={isEn ? 'Add Custom Criterion' : 'إضافة بند تقييم إضافي لهذا القسم'}
                    >
                      <i className="fas fa-plus"></i>
                      <span>{isEn ? 'Add Criterion' : 'إضافة معيار'}</span>
                    </button>
                  </div>
                </div>

                <div className="p-4 divide-y divide-slate-100 dark:divide-slate-800/80">
                  {section3Criteria.map((c, idx) => (
                    <div key={c.id || idx} className="py-3 first:pt-0 last:pb-0 flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            {idx + 1}. {isEn ? (c.nameEn || c.nameAr) : (c.nameAr || c.nameEn)}
                          </span>
                          {c.isCustom && (
                            <button
                              onClick={() => removeCriterion(3, c.id)}
                              className="text-rose-500 hover:text-rose-700 text-xs"
                              title={isEn ? 'Remove' : 'حذف هذا المعيار المخصص'}
                            >
                              <i className="fas fa-trash-alt"></i>
                            </button>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 font-sans tracking-wide">
                          {isEn ? c.nameAr : c.nameEn}
                        </div>
                      </div>

                      {/* Score Options Buttons */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {c.options.map((val) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => {
                              setSection3Criteria(section3Criteria.map(item => item.id === c.id ? { ...item, score: val } : item));
                            }}
                            className={`w-9 h-8 rounded-lg font-black text-xs transition-all flex items-center justify-center ${
                              c.score === val
                                ? 'bg-emerald-600 text-white shadow-md scale-105 ring-2 ring-emerald-400/50'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                            }`}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* ============ TAB 3: QUALITATIVE & SMART SUGGESTIONS ============ */}
          {activeTab === 'qualitative' && (
            <div className="space-y-6">
              
              {/* Strength Points Section */}
              <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-750 p-4 rounded-xl shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-850 dark:text-slate-100 flex items-center gap-2 text-xs sm:text-sm">
                    <i className="fas fa-thumbs-up text-emerald-500"></i>
                    <span>{isEn ? 'Strength Points (نقاط القوة):' : 'نقاط القوة (Strength points):'}</span>
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {isEn ? 'Achievements, high skills, and excellence' : 'سجل الإنجازات والتميز والمهارات العالية للموظف'}
                  </span>
                </div>

                {/* Smart Preset Chips for Strengths */}
                <div className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40 p-2.5 rounded-xl space-y-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-750 dark:text-emerald-300">
                    <i className="fas fa-magic"></i>
                    <span>{isEn ? '💡 Quick Suggestions for Strengths (Click to insert):' : '💡 مقترحات سريعة لنقاط القوة (اضغط لإدراج النص مباشرة):'}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {STRENGTH_SUGGESTIONS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => appendStrength(item)}
                        className="text-left bg-white dark:bg-slate-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all shadow-2xs hover:border-emerald-400 flex items-center gap-1"
                      >
                        <i className="fas fa-plus-circle text-emerald-500 text-[10px]"></i>
                        <span>{isEn ? item.textEn : item.textAr}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <textarea
                  rows={4}
                  value={strengthPoints}
                  onChange={(e) => setStrengthPoints(e.target.value)}
                  placeholder={isEn ? 'e.g. Exceptional precision in emergency procedures, outstanding teamwork...' : 'مثال: دقة متناهية في الفحوصات الطارئة، روح تعاونية ممتازة مع الزملاء، انضباط تام في مواعيد النوبات...'}
                  className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg p-3 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none leading-relaxed text-xs"
                ></textarea>
              </div>

              {/* Weakness & Improvement Points Section */}
              <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-750 p-4 rounded-xl shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-850 dark:text-slate-100 flex items-center gap-2 text-xs sm:text-sm">
                    <i className="fas fa-exclamation-triangle text-amber-500"></i>
                    <span>{isEn ? 'Weakness / Improvement Points (نقاط الضعف وفرص التحسين):' : 'نقاط الضعف وفرص التحسين (Weakness points):'}</span>
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {isEn ? 'Areas requiring training and development' : 'المجالات التي تحتاج لتطوير وتدريب'}
                  </span>
                </div>

                {/* Smart Preset Chips for Improvements */}
                <div className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 p-2.5 rounded-xl space-y-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-800 dark:text-amber-300">
                    <i className="fas fa-lightbulb"></i>
                    <span>{isEn ? '💡 Quick Suggestions for Areas of Improvement (Click to insert):' : '💡 مقترحات سريعة لفرص التحسين والتطوير (اضغط للإدراج):'}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {IMPROVEMENT_SUGGESTIONS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => appendWeakness(item)}
                        className="text-left bg-white dark:bg-slate-800 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all shadow-2xs hover:border-amber-400 flex items-center gap-1"
                      >
                        <i className="fas fa-plus-circle text-amber-500 text-[10px]"></i>
                        <span>{isEn ? item.textEn : item.textAr}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <textarea
                  rows={4}
                  value={weaknessPoints}
                  onChange={(e) => setWeaknessPoints(e.target.value)}
                  placeholder={isEn ? 'e.g. Needs to expedite EHR documentation, develop advanced time management...' : 'مثال: يحتاج لتطوير مهارات التوثيق في السجل الإلكتروني، تعزيز سرعة الاستجابة لطلبات الأشعة المقطعية...'}
                  className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg p-3 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none leading-relaxed text-xs"
                ></textarea>
              </div>

              {/* Evaluator Signature Details */}
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-4 rounded-xl">
                <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-200 dark:border-slate-700">
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 text-sm">
                    <i className="fas fa-signature text-blue-500"></i>
                    <span>
                      {evaluatorRole === 'manager'
                        ? (isEn ? 'Head of Department Approval & Signature' : 'اعتماد وتوقيع رئيس القسم')
                        : (isEn ? 'Supervisor Approval & Signature' : 'اعتماد وتوقيع مشرف القسم')}
                    </span>
                  </h4>

                  <span className="text-xs px-3 py-1 rounded-full font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                    <i className={evaluatorRole === 'manager' ? "fas fa-user-shield text-indigo-500" : "fas fa-user-tie text-blue-500"}></i>
                    <span>
                      {evaluatorRole === 'manager'
                        ? (isEn ? 'Head of Department' : 'رئيس القسم')
                        : (isEn ? 'Supervisor' : 'مشرف القسم')}
                    </span>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1 text-xs">
                      {evaluatorRole === 'manager'
                        ? (isEn ? 'Head of Department Name:' : 'اسم رئيس القسم:')
                        : (isEn ? 'Supervisor Name:' : 'اسم المشرف:')}
                    </label>
                    <input
                      type="text"
                      value={supervisorName}
                      onChange={(e) => setSupervisorName(e.target.value)}
                      placeholder={evaluatorRole === 'manager' ? (isEn ? 'Head of Department Name' : 'اسم رئيس القسم') : (isEn ? 'Supervisor Name' : 'اسم المشرف')}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-slate-800 dark:text-slate-100 font-bold text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-3 pt-2 sm:pt-6">
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800 dark:text-slate-200 text-xs">
                      <input
                        type="checkbox"
                        checked={supervisorSigned}
                        onChange={(e) => setSupervisorSigned(e.target.checked)}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span>
                        {evaluatorRole === 'manager'
                          ? (isEn ? 'Confirm Head of Department Approval & Signature' : 'تأكيد اعتماد وتوقيع رئيس القسم إلكترونياً')
                          : (isEn ? 'Confirm Supervisor Approval & Signature' : 'تأكيد اعتماد وتوقيع المشرف إلكترونياً')}
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============ TAB 4: TRAINING & DECISION ============ */}
          {activeTab === 'decision' && (
            <div className="space-y-5">
              <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-750 p-4 rounded-xl shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 flex-wrap gap-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={recommendTraining}
                      onChange={(e) => setRecommendTraining(e.target.checked)}
                      className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <span className="font-bold text-sm text-slate-900 dark:text-white block">
                        {isEn ? 'Recommend Training Program (التوصية ببرنامج تدريبي)' : 'التوصية ببرنامج تدريبي (Recommend training program)'}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {isEn ? 'Select or add training programs below to support employee growth' : 'في حالة التوصية ببرنامج تدريبي الرجاء تعبئة أو اختيار جدول البرامج أدناه'}
                      </span>
                    </div>
                  </label>

                  <button
                    type="button"
                    onClick={addTrainingProgramRow}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                  >
                    <i className="fas fa-plus"></i>
                    <span>{isEn ? 'Add Custom Program' : 'إضافة برنامج يدوي'}</span>
                  </button>
                </div>

                {/* Smart Preset Programs Catalog */}
                <div className="bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/70 dark:border-indigo-800/40 p-3 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold text-indigo-900 dark:text-indigo-300">
                    <span className="flex items-center gap-1.5">
                      <i className="fas fa-graduation-cap text-indigo-600 dark:text-indigo-400"></i>
                      <span>{isEn ? '💡 Suggested Official Hospital Training Programs (Click to add):' : '💡 باقة البرامج التدريبية المعتمدة المقترحة (اضغط للإضافة الفورية):'}</span>
                    </span>
                    <span className="text-[10px] text-slate-500 font-normal">
                      {isEn ? 'Accredited CBAHI / SHA courses' : 'دورات معتمدة متوافقة مع معايير سباهي'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {TRAINING_PROGRAM_PRESETS.map((preset) => {
                      const title = isEn ? preset.programNameEn : preset.programNameAr;
                      const duration = isEn ? preset.timePeriodEn : preset.timePeriodAr;
                      const place = isEn ? preset.trainingPlaceEn : preset.trainingPlaceAr;
                      const isAdded = trainingPrograms.some(tp => tp.programName.toLowerCase() === title.toLowerCase());

                      return (
                        <div
                          key={preset.id}
                          className={`p-2.5 rounded-lg border text-left transition-all flex items-start justify-between gap-2 ${
                            isAdded
                              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-400 hover:shadow-xs'
                          }`}
                        >
                          <div className="space-y-0.5 flex-1">
                            <div className="font-bold text-xs text-slate-900 dark:text-white leading-tight">
                              {title}
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">
                              {duration} • {place}
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={isAdded}
                            onClick={() => appendTrainingPreset(preset)}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-bold flex-shrink-0 transition-colors ${
                              isAdded
                                ? 'bg-emerald-600 text-white cursor-default'
                                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                            }`}
                          >
                            {isAdded ? (
                              <>
                                <i className="fas fa-check ml-1"></i>
                                <span>{isEn ? 'Added' : 'تمت الإضافة'}</span>
                              </>
                            ) : (
                              <>
                                <i className="fas fa-plus ml-1"></i>
                                <span>{isEn ? 'Add' : 'إضافة'}</span>
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Training Programs List Table */}
                <div className="space-y-3">
                  <div className="font-bold text-slate-800 dark:text-slate-200 text-xs flex items-center justify-between">
                    <span>{isEn ? 'Selected Training Programs for Employee:' : 'البرامج التدريبية المعتمدة للموظف في التقييم:'}</span>
                    <span className="text-[11px] text-slate-500">
                      ({trainingPrograms.length} {isEn ? 'programs scheduled' : 'برامج مسجلة'})
                    </span>
                  </div>

                  {trainingPrograms.length === 0 ? (
                    <div className="text-center py-6 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-slate-500">
                      <i className="fas fa-book-reader text-2xl mb-2 text-slate-400"></i>
                      <p>{isEn ? 'No training programs added yet.' : 'لم تتم إضافة أي برامج تدريبية بعد.'}</p>
                      <button
                        type="button"
                        onClick={addTrainingProgramRow}
                        className="mt-2 text-blue-600 dark:text-blue-400 font-bold hover:underline"
                      >
                        + {isEn ? 'Add Custom Training Program' : 'إضافة برنامج تدريبي يدوي'}
                      </button>
                    </div>
                  ) : (
                    trainingPrograms.map((tp, idx) => (
                      <div
                        key={tp.id || idx}
                        className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80 items-center"
                      >
                        <div className="sm:col-span-5">
                          <label className="text-[10px] text-slate-500 font-bold block mb-1">
                            {isEn ? 'Program Name:' : 'اسم البرنامج التدريبي:'}
                          </label>
                          <input
                            type="text"
                            value={tp.programName}
                            onChange={(e) => updateTrainingProgram(tp.id, 'programName', e.target.value)}
                            placeholder={isEn ? 'e.g. Infection Prevention' : 'مثال: إدارة الجودة الصحية وسلامة المرضى'}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-100"
                          />
                        </div>

                        <div className="sm:col-span-3">
                          <label className="text-[10px] text-slate-500 font-bold block mb-1">
                            {isEn ? 'Time Period:' : 'المدة الزمنية:'}
                          </label>
                          <input
                            type="text"
                            value={tp.timePeriod}
                            onChange={(e) => updateTrainingProgram(tp.id, 'timePeriod', e.target.value)}
                            placeholder={isEn ? 'e.g. 1 Week / 15 Hours' : 'مثال: أسبوعان / 30 ساعة'}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-100"
                          />
                        </div>

                        <div className="sm:col-span-3">
                          <label className="text-[10px] text-slate-500 font-bold block mb-1">
                            {isEn ? 'Training Location:' : 'مكان ومقر التدريب:'}
                          </label>
                          <input
                            type="text"
                            value={tp.trainingPlace}
                            onChange={(e) => updateTrainingProgram(tp.id, 'trainingPlace', e.target.value)}
                            placeholder={isEn ? 'e.g. CME Center' : 'مثال: مركز التدريب والتعليم الطبي المستمر'}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-100"
                          />
                        </div>

                        <div className="sm:col-span-1 flex justify-center pt-4 sm:pt-0">
                          <button
                            type="button"
                            onClick={() => removeTrainingProgram(tp.id)}
                            className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-900/60 flex items-center justify-center transition-colors"
                            title={isEn ? 'Delete Program' : 'حذف البرنامج'}
                          >
                            <i className="fas fa-trash-alt"></i>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 font-bold transition-colors"
          >
            {isEn ? 'Cancel' : 'إلغاء'}
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave('draft')}
              className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold transition-colors disabled:opacity-50"
            >
              <i className={`fas fa-save ${isEn ? 'mr-1' : 'ml-1'}`}></i>
              <span>{isEn ? 'Save as Draft' : 'حفظ كمسودة'}</span>
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave('published')}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold shadow-md hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i>
                  <span>{isEn ? 'Saving...' : 'جاري الحفظ...'}</span>
                </>
              ) : (
                <>
                  <i className="fas fa-paper-plane"></i>
                  <span>{isEn ? 'Approve & Publish to Staff' : 'اعتماد ونشر للموظف'}</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>

      {/* Mini Modal for Adding Custom Criteria */}
      {showAddCriteriaModal && (
        <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl max-w-md w-full shadow-2xl space-y-4">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
              <i className="fas fa-plus-circle text-blue-500"></i>
              <span>
                {isEn 
                  ? `Add Custom Criterion to Section ${showAddCriteriaModal}` 
                  : `إضافة معيار تقييم مخصص للقسم ${showAddCriteriaModal}`}
              </span>
            </h3>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                {isEn ? 'Criterion Name in Arabic:' : 'اسم المعيار بالعربية:'}
              </label>
              <input
                type="text"
                value={newCriteriaNameAr}
                onChange={(e) => setNewCriteriaNameAr(e.target.value)}
                placeholder={isEn ? 'e.g. سرعة إنجاز التقارير' : 'مثال: سرعة إنجاز التقارير العاجلة'}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-slate-800 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                {isEn ? 'Criterion Name in English (Optional):' : 'اسم المعيار بالإنجليزية (اختياري):'}
              </label>
              <input
                type="text"
                value={newCriteriaNameEn}
                onChange={(e) => setNewCriteriaNameEn(e.target.value)}
                placeholder="e.g. Urgent Reporting Turnaround"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-slate-800 dark:text-slate-100 text-left font-sans"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                {isEn ? 'Max Score Options:' : 'الدرجة القصوى:'}
              </label>
              <select
                value={newCriteriaMaxScore}
                onChange={(e) => setNewCriteriaMaxScore(Number(e.target.value))}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-slate-800 dark:text-slate-100"
              >
                <option value={10}>{isEn ? '10 points (Options: 2, 4, 6, 8, 10)' : '10 درجات (خيارات: 2, 4, 6, 8, 10)'}</option>
                <option value={5}>{isEn ? '5 points (Options: 1, 2, 3, 4, 5)' : '5 درجات (خيارات: 1, 2, 3, 4, 5)'}</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddCriteriaModal(null)}
                className="px-4 py-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold"
              >
                {isEn ? 'Cancel' : 'إلغاء'}
              </button>
              <button
                type="button"
                onClick={handleAddCustomCriteria}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold"
              >
                {isEn ? 'Add Criterion' : 'إضافة المعيار'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
