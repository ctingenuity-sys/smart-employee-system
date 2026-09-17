// Preset suggestions for Employee Annual Performance Appraisals

export interface AppraisalSuggestion {
  id: string;
  category: string;
  textAr: string;
  textEn: string;
}

export interface TrainingProgramPreset {
  id: string;
  programNameAr: string;
  programNameEn: string;
  timePeriodAr: string;
  timePeriodEn: string;
  trainingPlaceAr: string;
  trainingPlaceEn: string;
  category: string;
}

// 1. Suggestions for Strengths (نقاط القوة)
export const STRENGTH_SUGGESTIONS: AppraisalSuggestion[] = [
  {
    id: 'str_1',
    category: 'quality',
    textAr: 'دقة عالية وجودة متناهية في أداء المهام والفحوصات مع الالتزام التام بالبروتوكولات.',
    textEn: 'High precision and exceptional quality in executing duties and procedures with strict adherence to protocols.',
  },
  {
    id: 'str_2',
    category: 'teamwork',
    textAr: 'روح عمل جماعي متميزة وتوافق عالٍ مع الزملاء ومساعدة الفريق أثناء أوقات ضغط العمل.',
    textEn: 'Outstanding teamwork spirit, excellent rapport with peers, and supporting the team during peak workload.',
  },
  {
    id: 'str_3',
    category: 'attendance',
    textAr: 'انضباط ممتاز في مواعيد النوبات والحضور المبكر والجاهزية الدائمة لتغطية الطوارئ.',
    textEn: 'Exemplary punctuality, early shift arrival, and constant readiness to cover emergency call-ins.',
  },
  {
    id: 'str_4',
    category: 'safety',
    textAr: 'التزام صارم بمعايير سلامة المرضى وسياسات مكافحة العدوى ومعايير CBAHI و ISO.',
    textEn: 'Strict adherence to patient safety standards, infection control policies, and CBAHI / ISO guidelines.',
  },
  {
    id: 'str_5',
    category: 'patient_care',
    textAr: 'تعامل مهني ولبق مع المرضى وذويهم وحسن إدارة الحالات المتوترة باحترافية.',
    textEn: 'Courteous and professional communication with patients and families, adeptly defusing stressful situations.',
  },
  {
    id: 'str_6',
    category: 'initiative',
    textAr: 'روح المبادرة العالية في تقديم مقترحات لتحسين سير العمل وتطوير كفاءة القسم.',
    textEn: 'High initiative in proposing constructive ideas to optimize departmental workflows and efficiency.',
  },
  {
    id: 'str_7',
    category: 'equipment',
    textAr: 'محافظة ممتازة على الأجهزة الطبية والمعدات والإبلاغ الفوري عن أي أعطال أو صيانة دورية.',
    textEn: 'Exceptional care of medical devices and equipment, ensuring timely reporting of technical issues or preventative maintenance.',
  },
  {
    id: 'str_8',
    category: 'learning',
    textAr: 'حرص مستمر على التعلم والتطوير الذاتي ومواكبة أحدث الممارسات والتقنيات الطبية.',
    textEn: 'Continuous dedication to professional development and keeping up-to-date with medical innovations.',
  },
];

// 2. Suggestions for Areas of Improvement / Weaknesses (فرص التحسين والتطوير)
export const IMPROVEMENT_SUGGESTIONS: AppraisalSuggestion[] = [
  {
    id: 'imp_1',
    category: 'documentation',
    textAr: 'الحاجة إلى تعزيز سرعة ودقة التوثيق في النظام الإلكتروني وملفات المرضى فور إنجاز المهام.',
    textEn: 'Need to enhance prompt and thorough documentation in the Electronic Health Record (EHR) system immediately after procedures.',
  },
  {
    id: 'imp_2',
    category: 'time_management',
    textAr: 'تطوير مهارات إدارة الوقت وترتيب الأولويات أثناء فترات الذروة وتسليم النوبات.',
    textEn: 'Developing advanced time management and prioritization skills during peak working hours and shift handovers.',
  },
  {
    id: 'imp_3',
    category: 'communication',
    textAr: 'تعزيز التواصل الفعال مع الأقسام الطبية الأخرى لتسريع خدمة الحالات الحرجة والمحولة.',
    textEn: 'Improving interdepartmental communication to accelerate the turnaround of urgent referred cases.',
  },
  {
    id: 'imp_4',
    category: 'stress_management',
    textAr: 'تحسين التعامل مع ضغوط العمل الشديدة والحفاظ على الهدوء والتركيز أثناء الحالات الطارئة المتتالية.',
    textEn: 'Enhancing stress resilience and maintaining composure under intense, consecutive emergency situations.',
  },
  {
    id: 'imp_5',
    category: 'tech_skills',
    textAr: 'الاستفادة من برامج التدريب الداخلي لرفع الكفاءة في استخدام البروتوكولات والتقنيات الحديثة.',
    textEn: 'Participating in in-house training to elevate competency with newer modalities, protocols, and equipment features.',
  },
  {
    id: 'imp_6',
    category: 'feedback',
    textAr: 'التقبل الأسرع للتوجيهات والملاحظات الإشرافية وتطبيق التوصيات العملية بشكل فوري.',
    textEn: 'Being more receptive to supervisory guidance and implementing actionable feedback promptly.',
  },
  {
    id: 'imp_7',
    category: 'radiation_safety',
    textAr: 'مزيد من التركيز على الالتزام الصارم بمبادئ الحماية الإشعاعية (ALARA) واستخدام وسائل الوقاية.',
    textEn: 'Increased focus on radiation safety principles (ALARA) and consistent utilization of personal protective equipment.',
  },
];

// 3. Recommended Training Programs Presets (البرامج التدريبية الموصى بها)
export const TRAINING_PROGRAM_PRESETS: TrainingProgramPreset[] = [
  {
    id: 'tr_1',
    category: 'quality',
    programNameAr: 'معايير الجودة وسلامة المرضى (CBAHI & JCI Essentials)',
    programNameEn: 'Patient Safety & Healthcare Quality Standards (CBAHI & JCI)',
    timePeriodAr: 'أسبوع (15 ساعة تدريبية)',
    timePeriodEn: '1 Week (15 Training Hours)',
    trainingPlaceAr: 'مركز التعليم الطبي المستمر بالمستشفى',
    trainingPlaceEn: 'Hospital Continuous Medical Education Center',
  },
  {
    id: 'tr_2',
    category: 'infection_control',
    programNameAr: 'أساسيات وتطبيقات مكافحة العدوى والوقاية المتقدمة',
    programNameEn: 'Advanced Infection Prevention & Control Practices',
    timePeriodAr: '3 أيام (10 ساعات)',
    timePeriodEn: '3 Days (10 Hours)',
    trainingPlaceAr: 'قسم مكافحة العدوى والتدريب السريري',
    trainingPlaceEn: 'Infection Control Department',
  },
  {
    id: 'tr_3',
    category: 'bls',
    programNameAr: 'الإنعاش القلبي الرئوي الأساسي المعتمد (BLS / CPR)',
    programNameEn: 'Basic Life Support (BLS / CPR Certified)',
    timePeriodAr: 'يوم واحد (8 ساعات)',
    timePeriodEn: '1 Day (8 Hours)',
    trainingPlaceAr: 'مركز تدريب جمعية القلب السعودية / المستشفى',
    trainingPlaceEn: 'Saudi Heart Association Accredited Center',
  },
  {
    id: 'tr_4',
    category: 'radiation_safety',
    programNameAr: 'الحماية من الإشعاع والسلامة في أقسام التصوير الطبي (RSO Course)',
    programNameEn: 'Radiation Protection & Safety in Medical Imaging (RSO)',
    timePeriodAr: 'أسبوعان (30 ساعة معتمدة)',
    timePeriodEn: '2 Weeks (30 CME Hours)',
    trainingPlaceAr: 'هيئة الرقابة النووية والإشعاعية / أونلاين',
    trainingPlaceEn: 'Nuclear & Radiological Regulatory Commission / Online',
  },
  {
    id: 'tr_5',
    category: 'soft_skills',
    programNameAr: 'مهارات التواصل الفعال والتعامل مع المرضى وخدمة العملاء',
    programNameEn: 'Effective Healthcare Communication & Patient Experience',
    timePeriodAr: 'يومان (12 ساعة)',
    timePeriodEn: '2 Days (12 Hours)',
    trainingPlaceAr: 'إدارة التدريب وتجربة المريض بالمستشفى',
    trainingPlaceEn: 'Hospital Training & Patient Experience Department',
  },
  {
    id: 'tr_6',
    category: 'ehr',
    programNameAr: 'التوثيق الطبي المتقدم واستخدام السجل الصحي الإلكتروني (HIS / PACS)',
    programNameEn: 'Advanced Medical Documentation & HIS / PACS Utilization',
    timePeriodAr: '3 أيام (9 ساعات)',
    timePeriodEn: '3 Days (9 Hours)',
    trainingPlaceAr: 'قسم تقنية المعلومات الصحية بالمستشفى',
    trainingPlaceEn: 'Health Information Technology Dept.',
  },
  {
    id: 'tr_7',
    category: 'advanced_imaging',
    programNameAr: 'تقنيات وبروتوكولات الأشعة المقطعية والرنين المغناطيسي المتقدمة',
    programNameEn: 'Advanced MRI & CT Imaging Protocols & Techniques',
    timePeriodAr: 'شهر واحد (تدريب إكلينيكي مكثف)',
    timePeriodEn: '1 Month (Intensive Clinical Hands-on)',
    trainingPlaceAr: 'قسم الأشعة التخصصي - مستشفى الجدعاني',
    trainingPlaceEn: 'Specialized Radiology Dept - Al Jedaani Hospital',
  },
];
