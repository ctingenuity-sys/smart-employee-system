import { AppraisalCriterion, AppraisalTrainingProgram, AnnualEvaluation } from '../types';
import { db } from '../firebase';
// @ts-ignore
import { collection, doc, setDoc, getDocs, getDoc, updateDoc, deleteDoc, query, where, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';

export const getDefaultSection1Criteria = (): AppraisalCriterion[] => [
  {
    id: 's1_1',
    nameEn: 'Knowledge of job duties and responsibilities',
    nameAr: 'المعرفة بواجبات ومسؤوليات العمل',
    score: 8,
    maxScore: 10,
    options: [2, 4, 6, 8, 10],
  },
  {
    id: 's1_2',
    nameEn: 'Ability to solve problems',
    nameAr: 'القدرة على حل مشكلات العمل',
    score: 8,
    maxScore: 10,
    options: [2, 4, 6, 8, 10],
  },
  {
    id: 's1_3',
    nameEn: 'Application of knowledge',
    nameAr: 'القدرة على تطبيق المعرفة في العمل',
    score: 8,
    maxScore: 10,
    options: [2, 4, 6, 8, 10],
  },
  {
    id: 's1_4',
    nameEn: 'Capability, Productivity, accuracy and effectiveness',
    nameAr: 'القدرات ومدى الإنتاجية ودقة وكفاءة العمل',
    score: 8,
    maxScore: 10,
    options: [2, 4, 6, 8, 10],
  },
];

export const getDefaultSection2Criteria = (): AppraisalCriterion[] => [
  {
    id: 's2_1',
    nameEn: 'Acceptance of constructive criticisms',
    nameAr: 'تقبل النقد البناء',
    score: 8,
    maxScore: 10,
    options: [2, 4, 6, 8, 10],
  },
  {
    id: 's2_2',
    nameEn: 'Effective communication skills',
    nameAr: 'مهارات التواصل الفعال',
    score: 8,
    maxScore: 10,
    options: [2, 4, 6, 8, 10],
  },
  {
    id: 's2_3',
    nameEn: 'Team work spirit',
    nameAr: 'روح العمل الجماعي',
    score: 8,
    maxScore: 10,
    options: [2, 4, 6, 8, 10],
  },
  {
    id: 's2_4',
    nameEn: 'Continuing education (active)',
    nameAr: 'الاستمرارية في التعلم والتطوير',
    score: 8,
    maxScore: 10,
    options: [2, 4, 6, 8, 10],
  },
];

export const getDefaultSection3Criteria = (): AppraisalCriterion[] => [
  {
    id: 's3_1',
    nameEn: 'Cultural Adjustment',
    nameAr: 'التكيف مع البيئة المحلية',
    score: 5,
    maxScore: 5,
    options: [1, 2, 3, 4, 5],
  },
  {
    id: 's3_2',
    nameEn: 'Loyalty to hospital',
    nameAr: 'المسؤولية والإخلاص تجاه المستشفى',
    score: 5,
    maxScore: 5,
    options: [1, 2, 3, 4, 5],
  },
  {
    id: 's3_3',
    nameEn: 'Behavior towards colleagues / Supervisors / Patients',
    nameAr: 'التعامل مع الزملاء / المشرفين / المرضى',
    score: 5,
    maxScore: 5,
    options: [1, 2, 3, 4, 5],
  },
  {
    id: 's3_4',
    nameEn: 'Attendance punctuality',
    nameAr: 'المواظبة على الحضور والغياب والانضباط',
    score: 5,
    maxScore: 5,
    options: [1, 2, 3, 4, 5],
  },
];

export const calculateRatingGrade = (totalScore: number): 'excellent' | 'very_good' | 'good' | 'fair' | 'poor' => {
  if (totalScore >= 90) return 'excellent';
  if (totalScore >= 80) return 'very_good';
  if (totalScore >= 70) return 'good';
  if (totalScore >= 60) return 'fair';
  return 'poor';
};

export const getRatingGradeLabel = (grade: 'excellent' | 'very_good' | 'good' | 'fair' | 'poor', isAr: boolean) => {
  switch (grade) {
    case 'excellent':
      return { label: isAr ? 'ممتاز (90 - 100)' : 'Excellent (90 - 100)', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800' };
    case 'very_good':
      return { label: isAr ? 'جيد جداً (80 - 89)' : 'Very Good (80 - 89)', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800' };
    case 'good':
      return { label: isAr ? 'جيد (70 - 79)' : 'Good (70 - 79)', color: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-950/40 border-teal-300 dark:border-teal-800' };
    case 'fair':
      return { label: isAr ? 'مقبول (60 - 69)' : 'Fair (60 - 69)', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800' };
    case 'poor':
      return { label: isAr ? 'ضعيف (0 - 59)' : 'Poor (0 - 59)', color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800' };
  }
};
