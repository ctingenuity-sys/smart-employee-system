
import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';

type Language = 'ar' | 'en';

interface LanguageContextType {
  language: Language;
  toggleLanguage: () => void;
  t: (key: string) => string;
  dir: 'rtl' | 'ltr';
}

const translations: Record<string, { ar: string; en: string }> = {
  // --- General ---
  'app.name': { ar: 'نظام الموظفين الذكي', en: 'Smart Employee System' },
  'welcome': { ar: 'مرحباً بك', en: 'Welcome' },
  'logout': { ar: 'تسجيل الخروج', en: 'Logout' },
  'loading': { ar: 'جاري التحميل...', en: 'Loading...' },
  'print': { ar: 'طباعة', en: 'Print' },
  'search': { ar: 'بحث...', en: 'Search...' },
  'save': { ar: 'حفظ', en: 'Save' },
  'cancel': { ar: 'إلغاء', en: 'Cancel' },
  'delete': { ar: 'حذف', en: 'Delete' },
  'edit': { ar: 'تعديل', en: 'Edit' },
  'add': { ar: 'إضافة', en: 'Add' },
  'confirm': { ar: 'تأكيد', en: 'Confirm' },
  'view': { ar: 'عرض', en: 'View' },
  'actions': { ar: 'إجراءات', en: 'Actions' },
  'date': { ar: 'التاريخ', en: 'Date' },
  'time': { ar: 'الوقت', en: 'Time' },
  'location': { ar: 'المكان', en: 'Location' },
  'status': { ar: 'الحالة', en: 'Status' },
  'notes': { ar: 'ملاحظات', en: 'Notes' },
  'submit': { ar: 'إرسال', en: 'Submit' },
  'details': { ar: 'التفاصيل', en: 'Details' },
  'month': { ar: 'الشهر', en: 'Month' },
  'year': { ar: 'السنة', en: 'Year' },
  'from': { ar: 'من', en: 'From' },
  'to': { ar: 'إلى', en: 'To' },
  'update': { ar: 'تحديث', en: 'Update' },
  'close': { ar: 'إغلاق', en: 'Close' },
  'export': { ar: 'تصدير اكسل', en: 'Export Excel' },
  'refresh': { ar: 'تحديث', en: 'Refresh' },
  'generatedOn': { ar: 'تم الإنشاء في', en: 'Generated on' },
  'electronicDoc': { ar: 'هذا المستند تم إنشاؤه واعتماده إلكترونياً عبر نظام الموظفين الذكي.', en: 'This document is electronically generated and approved via the Smart Employee System.' },
  
  // --- Status & Common ---
  'status.active': { ar: 'نشط الآن', en: 'Active Now' },
  'status.online': { ar: 'متصل', en: 'ONLINE' },
  'status.syncing': { ar: 'مزامنة', en: 'SYNCING' },
  'status.in': { ar: 'حضور', en: 'IN' },
  'status.notyet': { ar: 'لم يحضر', en: 'Not Yet' },
  
  // --- Roles ---
  'role.admin': { ar: 'مسؤول', en: 'Admin' },
  'role.supervisor': { ar: 'مشرف', en: 'Supervisor' },
  'role.user': { ar: 'موظف', en: 'Employee' },
  'role.doctor': { ar: 'طبيب', en: 'Doctor' },
  'role.manager':{ar:'المدير',en:'maneger'},

  // --- Doctor Station ---
  'doc.station': { ar: 'محطة طبيب الأشعة', en: 'Radiologist Station' },
  
  'rot.filter.general': { ar: 'الشهور', en: 'Months' },
  'rot.suggest.stay': { ar: 'بقاء', en: 'Stay' },
  'rot.suggest': { ar: 'اقتراحات التدوير', en: 'Rotation Suggestions' },
  'rot.legend': { ar: 'دليل الألوان', en: 'Legend' },
  'rot.staff': { ar: 'الموظف', en: 'Staff' },
  'rot.subtitle': { ar: 'مصفوفة التدوير التاريخية', en: 'Historical Rotation Matrix' },

'rot.filter.friday':{ar:'الجمع',en:'Fridays'},
'rot.filter.months':{ar:'الفتره',en:'Range'},
'nav.rotation':{ar:'تدوير الجدول',en:'rotation'},

  // --- Sidebar Links ---
  'nav.dashboard': { ar: 'لوحة التحكم', en: 'Dashboard' },
  'nav.scheduleBuilder': { ar: 'إعداد الجداول', en: 'Schedule Builder' },
  'nav.reports': { ar: 'التقارير والمراجعة', en: 'Reports & Review' },
  'nav.attendance': { ar: 'المحلل الذكي', en: 'Attendance AI' },
  'nav.mySchedule': { ar: 'جدولي وطلباتي', en: 'My Schedule' },
  'nav.sharedTools': { ar: 'أدوات مشتركة', en: 'Shared Tools' },
  'nav.communications': { ar: 'التواصل والورديات', en: 'Communication & Log' },
  'nav.inventory': { ar: 'نظام المخزون', en: 'Inventory System' },
  'nav.tasks': { ar: 'لوحة المهام', en: 'Task Board' },
  'nav.techSupport': { ar: 'الدعم الفني الذكي', en: 'AI Tech Support' },
  'nav.appointments': { ar: 'المواعيد', en: 'Appointments' },
  'nav.penalties': { ar: 'الجزاءات', en: 'Penalties' },
  
  // --- Penalties ---
  'penalty.title': { ar: 'إدارة الجزاءات', en: 'Penalties Management' },
  'penalty.subtitle': { ar: 'إصدار وإدارة جزاءات الموظفين بناءً على لائحة مكتب العمل', en: 'Issue and manage employee penalties based on labor law' },
  'penalty.myPenalties': { ar: 'الجزاءات الموجهة إليك', en: 'Your Penalties' },
  'penalty.myPenaltiesSubtitle': { ar: 'سجل الجزاءات والإشعارات الإدارية الخاصة بك', en: 'Your Penalties and Administrative Notices Log' },
  'penalty.send': { ar: 'إرسال جزاء', en: 'Send Penalty' },
  'penalty.employee': { ar: 'الموظف', en: 'Employee' },
  'penalty.selectEmployee': { ar: 'اختر الموظف', en: 'Select Employee' },
  'penalty.type': { ar: 'نوع الجزاء', en: 'Penalty Type' },
  'penalty.category': { ar: 'تصنيف المخالفة', en: 'Violation Category' },
  'penalty.violation': { ar: 'المخالفة', en: 'Violation' },
  'penalty.description': { ar: 'وصف إضافي', en: 'Additional Description' },
  'penalty.status': { ar: 'الحالة', en: 'Status' },
  'penalty.action': { ar: 'إجراء', en: 'Action' },
  'penalty.accept': { ar: 'موافقة', en: 'Accept' },
  'penalty.reject': { ar: 'رفض', en: 'Reject' },
  'penalty.reason': { ar: 'سبب الرفض', en: 'Rejection Reason' },
  'penalty.pending': { ar: 'بانتظار توقيع الموظف', en: 'Waiting for employee signature' },
  'penalty.accepted': { ar: 'تم التوقيع', en: 'Signed' },
  'penalty.rejected': { ar: 'مرفوض', en: 'Rejected' },
  'penalty.1stWarning': { ar: 'إنذار أول', en: '1st Warning' },
  'penalty.2ndWarning': { ar: 'إنذار ثاني', en: '2nd Warning' },
  'penalty.finalWarning': { ar: 'إنذار نهائي', en: 'Final Warning' },
  'penalty.dismissal': { ar: 'فصل من الخدمة', en: 'Dismissal' },
  'penalty.deduction': { ar: 'خصم من الراتب', en: 'Deduction' },
  'penalty.suspension': { ar: 'إيقاف عن العمل', en: 'Suspension' },
  'penalty.days': { ar: 'أيام', en: 'Days' },
  'penalty.deductionDays': { ar: 'عدد أيام الخصم', en: 'Deduction Days' },
  'penalty.suspensionDays': { ar: 'عدد أيام الإيقاف', en: 'Suspension Days' },
  'penalty.fromDate': { ar: 'من تاريخ', en: 'From Date' },
  'penalty.toDate': { ar: 'إلى تاريخ', en: 'To Date' },
  'penalty.log': { ar: 'سجل الجزاءات', en: 'Penalties Log' },
  'penalty.noRecords': { ar: 'لا توجد جزاءات مسجلة', en: 'No penalties recorded' },
  'penalty.noPenalties': { ar: 'لا توجد جزاءات مسجلة', en: 'No penalties recorded' },
  'penalty.cleanRecord': { ar: 'سجلك نظيف', en: 'Clean Record' },
  'penalty.pleaseTakeAction': { ar: 'الرجاء اتخاذ إجراء بشأن هذا الجزاء', en: 'Please take action regarding this penalty' },
  'penalty.writeRejectionReason': { ar: 'اكتب سبب الرفض هنا...', en: 'Write rejection reason here...' },
  'penalty.confirmRejection': { ar: 'تأكيد الرفض', en: 'Confirm Rejection' },
  'penalty.confirmDelete': { ar: 'هل أنت متأكد من حذف هذا الجزاء؟', en: 'Are you sure you want to delete this penalty?' },
  'penalty.errSelectEmployee': { ar: 'يرجى اختيار الموظف', en: 'Please select an employee' },
  'penalty.errDeductionDays': { ar: 'يرجى إدخال عدد أيام الخصم', en: 'Please enter deduction days' },
  'penalty.errSuspensionDetails': { ar: 'يرجى إدخال تفاصيل الإيقاف', en: 'Please enter suspension details' },
  'penalty.successSend': { ar: 'تم إرسال الجزاء بنجاح', en: 'Penalty sent successfully' },
  'penalty.successDelete': { ar: 'تم حذف الجزاء بنجاح', en: 'Penalty deleted successfully' },
  'penalty.errDelete': { ar: 'حدث خطأ أثناء حذف الجزاء', en: 'Error deleting penalty' },
  'penalty.successUpdate': { ar: 'تم تحديث الحالة بنجاح', en: 'Status updated successfully' },
  
  // --- Print Penalty ---
  'print.hospitalGroup': { ar: 'مجموعة مستشفيات الجدعاني', en: 'Al-Jadaani Hospitals Group' },
  'print.saudiArabia': { ar: 'المملكة العربية السعودية', en: 'Kingdom of Saudi Arabia' },
  'print.poBox': { ar: 'ص.ب ٧٥٠٠ جـدة ٢١٤٦٢', en: 'P.O. Box 7500 Jeddah 21462' },
  'print.warningNotice': { ar: 'اخطار انــــذار', en: 'Warning Notice' },
  'print.date': { ar: 'التاريخ:', en: 'Date:' },
  'print.to': { ar: 'الى', en: 'To' },
  'print.name': { ar: 'الاســـــم', en: 'Name' },
  'print.radiologist': { ar: 'أخصائي أشعة', en: 'Radiologist' },
  'print.jobTitle': { ar: 'الوظيفـــــة', en: 'Job Title' },
  'print.radiologyDept': { ar: 'قسم الأشعة', en: 'Radiology Dept' },
  'print.department': { ar: 'القسم / الادارة', en: 'Department' },
  'print.notes': { ar: 'ملاحظــــــات', en: 'Notes' },
  'print.managementDecision': { ar: 'وعليه قررت الادارة الاجراء التالــــــي', en: 'Accordingly, Management Decided the Following' },
  'print.firstWarning': { ar: '- انــــذار أول', en: '- 1st Warning' },
  'print.secondWarning': { ar: '- انــــذار ثاني', en: '- 2nd Warning' },
  'print.finalWarning': { ar: '- انــــذار نهائي', en: '- Final Warning' },
  'print.dismissal': { ar: '- فصل من الخدمة', en: '- Dismissal' },
  'print.deductionOf': { ar: '- خصم أجر', en: '- Deduction of' },
  'print.fromMonthlySalary': { ar: 'من راتبك الشهري', en: 'from your monthly salary' },
  'print.suspensionFor': { ar: '- إيقاف عن العمل عدد', en: '- Suspension for' },
  'print.days': { ar: 'أيام', en: 'days' },
  'print.fromDate': { ar: 'من تاريخ', en: 'From date' },
  'print.toDate': { ar: 'الى تاريخ', en: 'To date' },
  'print.doNotRepeat': { ar: 'نرجو عدم تكرار ذلك مستقبلا', en: 'Please do not repeat this in the future' },
  'print.hrManager': { ar: 'مدير شئون الموظفين', en: 'HR Manager' },
  'print.employeeAcknowledgment': { ar: 'اقرار بإستلام لفت النظر من قبل العامل / الموظف', en: 'Acknowledgment of receipt by the employee' },
  'print.signature': { ar: 'التوقيع :', en: 'Signature :' },
  'print.rejectionReason': { ar: 'سبب الرفض:', en: 'Rejection Reason:' },
  
  // --- Violation Categories ---
  'violationCat.schedule': { ar: 'مخالفات تتعلق بمواعيد العمل', en: 'Work Schedule Violations' },
  'violationCat.organization': { ar: 'مخالفات تتعلق بتنظيم العمل', en: 'Work Organization Violations' },
  'violationCat.behavior': { ar: 'مخالفات تتعلق بسلوك العامل', en: 'Employee Behavior Violations' },

  // --- Violations (Schedule) ---
  'violation.schedule.1': { ar: 'التأخر عن مواعيد الحضور للعمل لغاية (15) دقيقة دون إذن، أو عذر مقبول.', en: 'Delay in attending work for up to (15) minutes without permission or acceptable excuse.' },
  'violation.schedule.2': { ar: 'التأخر عن مواعيد الحضور للعمل لغاية (15) دقيقة دون إذن، أو عذر مقبول: إذا ترتب على ذلك تعطيل عمال آخرين.', en: 'Delay in attending work for up to (15) minutes without permission or acceptable excuse: if it results in delaying other workers.' },
  'violation.schedule.3': { ar: 'التأخر عن مواعيد الحضور للعمل أكثر من (15) دقيقة لغاية (30) دقيقة دون إذن، أو عذر مقبول.', en: 'Delay in attending work for more than (15) minutes up to (30) minutes without permission or acceptable excuse.' },
  'violation.schedule.4': { ar: 'التأخر عن مواعيد الحضور للعمل أكثر من (15) دقيقة لغاية (30) دقيقة دون إذن، أو عذر مقبول: إذا ترتب على ذلك تعطيل عمال آخرين.', en: 'Delay in attending work for more than (15) minutes up to (30) minutes without permission or acceptable excuse: if it results in delaying other workers.' },
  'violation.schedule.5': { ar: 'التأخر عن مواعيد الحضور للعمل أكثر من (30) دقيقة لغاية (60) دقيقة دون إذن، أو عذر مقبول.', en: 'Delay in attending work for more than (30) minutes up to (60) minutes without permission or acceptable excuse.' },
  'violation.schedule.6': { ar: 'التأخر عن مواعيد الحضور للعمل أكثر من (30) دقيقة لغاية (60) دقيقة دون إذن، أو عذر مقبول: إذا ترتب على ذلك تعطيل عمال آخرين.', en: 'Delay in attending work for more than (30) minutes up to (60) minutes without permission or acceptable excuse: if it results in delaying other workers.' },
  'violation.schedule.7': { ar: 'التأخر عن مواعيد الحضور للعمل لمدة تزيد على ساعة دون إذن، أو عذر مقبول.', en: 'Delay in attending work for more than an hour without permission or acceptable excuse.' },
  'violation.schedule.8': { ar: 'ترك العمل، أو الانصراف قبل الميعاد دون إذن، أو عذر مقبول بما لا يتجاوز (15) دقيقة.', en: 'Leaving work or departing before the scheduled time without permission or acceptable excuse for up to (15) minutes.' },
  'violation.schedule.9': { ar: 'ترك العمل، أو الانصراف قبل الميعاد دون إذن، أو عذر مقبول بما يتجاوز (15) دقيقة.', en: 'Leaving work or departing before the scheduled time without permission or acceptable excuse for more than (15) minutes.' },
  'violation.schedule.10': { ar: 'البقاء في أماكن العمل، أو العودة إليها بعد انتهاء مواعيد العمل دون إذن مسبق.', en: 'Staying in the workplace or returning to it after working hours without prior permission.' },
  'violation.schedule.11': { ar: 'الغياب دون إذن كتابي، أو عذر مقبول لمدة يوم، خلال السنة العقدية الواحدة.', en: 'Absence without written permission or acceptable excuse for one day during a single contract year.' },
  'violation.schedule.12': { ar: 'الغياب المتصل دون إذن كتابي، أو عذر مقبول من يومين إلى ستة أيام، خلال السنة العقدية الواحدة.', en: 'Continuous absence without written permission or acceptable excuse for two to six days during a single contract year.' },
  'violation.schedule.13': { ar: 'الغياب المتصل دون إذن كتابي، أو عذر مقبول من سبعة أيام إلى عشرة أيام، خلال السنة العقدية الواحدة.', en: 'Continuous absence without written permission or acceptable excuse for seven to ten days during a single contract year.' },
  'violation.schedule.14': { ar: 'الغياب المتصل دون إذن كتابي، أو عذر مقبول من أحد عشر يوماً إلى أربعة عشر يوماً، خلال السنة العقدية الواحدة.', en: 'Continuous absence without written permission or acceptable excuse for eleven to fourteen days during a single contract year.' },
  'violation.schedule.15': { ar: 'الانقطاع عن العمل دون سبب مشروع مدة تزيد على خمسة عشر يوماً متصلة.', en: 'Interruption of work without a legitimate reason for more than fifteen continuous days.' },
  'violation.schedule.16': { ar: 'الغياب المتقطع دون سبب مشروع مدداً تزيد في مجموعها على ثلاثين يوماً خلال السنة العقدية الواحدة.', en: 'Intermittent absence without a legitimate reason for periods totaling more than thirty days during a single contract year.' },

  // --- Violations (Organization) ---
  'violation.org.1': { ar: 'التواجد دون مبرر في غير مكان العمل المخصص للعامل أثناء وقت الدوام.', en: 'Unjustified presence in a place other than the designated workplace during working hours.' },
  'violation.org.2': { ar: 'استقبال زائرين في غير أمور عمل المنشأة في أماكن العمل، دون إذن من الإدارة.', en: 'Receiving visitors for non-work matters in the workplace without permission from management.' },
  'violation.org.3': { ar: 'استعمال آلات، ومعدات، وأدوات المنشأة؛ لأغراض خاصة، دون إذن.', en: 'Using the facility\'s machines, equipment, and tools for private purposes without permission.' },
  'violation.org.4': { ar: 'تدخل العامل، دون وجه حق في أي عمل ليس في اختصاصه، أو لم يعهد به إليه.', en: 'Unjustified interference by the worker in any work that is not their specialty or assigned to them.' },
  'violation.org.5': { ar: 'الخروج، أو الدخول من غير المكان المخصص لذلك.', en: 'Exiting or entering from a place other than the designated one.' },
  'violation.org.6': { ar: 'الإهمال في تنظيف الآلات، وصيانتها، أو عدم العناية بها، أو عدم التبليغ عن ما بها من خلل.', en: 'Negligence in cleaning and maintaining machines, lack of care for them, or failure to report defects.' },
  'violation.org.7': { ar: 'عدم وضع أدوات الإصلاح، والصيانة، واللوازم الأخرى في الأماكن المخصصة لها، بعد الانتهاء من العمل.', en: 'Failure to place repair and maintenance tools and other supplies in their designated places after finishing work.' },
  'violation.org.8': { ar: 'تمزيق، أو إتلاف إعلانات، أو بلاغات إدارة المنشأة.', en: 'Tearing or destroying facility management announcements or notices.' },
  'violation.org.9': { ar: 'الإهمال في العهد التي بحوزته، مثال: (سيارات، آلات، أجهزة، معدات، أدوات، ......الخ).', en: 'Negligence in the custody in their possession, e.g., (cars, machines, devices, equipment, tools, etc.).' },
  'violation.org.10': { ar: 'الأكل في مكان العمل، أو غير المكان المعد له، أو في غير أوقات الراحة.', en: 'Eating in the workplace, outside the designated area, or outside rest times.' },
  'violation.org.11': { ar: 'النوم أثناء العمل.', en: 'Sleeping during work.' },
  'violation.org.12': { ar: 'النوم في الحالات التي تستدعي يقظة مستمرة.', en: 'Sleeping in situations that require continuous alertness.' },
  'violation.org.13': { ar: 'التسكع، أو وجود العامل في غير مكان عمله، أثناء ساعات العمل.', en: 'Loitering or the worker\'s presence outside their workplace during working hours.' },
  'violation.org.14': { ar: 'التلاعب في إثبات الحضور، والانصراف.', en: 'Tampering with attendance and departure records.' },
  'violation.org.15': { ar: 'عدم إطاعة الأوامر العادية الخاصة بالعمل، أو عدم تنفيذ التعليمات الخاصة بالعمل، والمعلقة في مكان ظاهر.', en: 'Disobeying normal work orders or failing to execute work instructions posted in a visible place.' },
  'violation.org.16': { ar: 'التحريض على مخالفة الأوامر، والتعليمات الخطية الخاصة بالعمل.', en: 'Inciting violation of written work orders and instructions.' },
  'violation.org.17': { ar: 'التدخين في الأماكن المحظورة، والمعلن عنها للمحافظة على سلامة العمال، والمنشأة.', en: 'Smoking in prohibited areas announced to maintain the safety of workers and the facility.' },
  'violation.org.18': { ar: 'الإهمال، أو التهاون في العمل الذي قد ينشأ عنه ضرر في صحة العمال، أو سلامتهم، أو في المواد، أو الأدوات، والأجهزة.', en: 'Negligence or complacency in work that may cause harm to workers\' health or safety, or to materials, tools, and devices.' },

  // --- Violations (Behavior) ---
  'violation.behavior.1': { ar: 'التشاجر مع الزملاء، أو مع الغير، أو إحداث مشاغبات في مكان العمل.', en: 'Quarreling with colleagues or others, or causing disturbances in the workplace.' },
  'violation.behavior.2': { ar: 'التمارض، أو ادعاء العامل كذباً أنه أصيب أثناء العمل، أو بسببه.', en: 'Feigning illness or falsely claiming injury during or due to work.' },
  'violation.behavior.3': { ar: 'الامتناع عن إجراء الكشف الطبي عند طلب طبيب المنشأة، أو رفض اتباع التعليمات الطبية أثناء العلاج.', en: 'Refusing to undergo a medical examination when requested by the facility\'s doctor, or refusing to follow medical instructions during treatment.' },
  'violation.behavior.4': { ar: 'مخالفة التعليمات الصحية المعلقة بأماكن العمل.', en: 'Violating health instructions posted in the workplace.' },
  'violation.behavior.5': { ar: 'الكتابة على جدران المنشأة، أو لصق إعلانات عليها.', en: 'Writing on the facility\'s walls or pasting advertisements on them.' },
  'violation.behavior.6': { ar: 'رفض التفتيش الإداري عند الانصراف.', en: 'Refusing administrative inspection upon departure.' },
  'violation.behavior.7': { ar: 'عدم تسليم النقود المحصلة لحساب المنشأة في المواعيد المحددة دون تبرير مقبول.', en: 'Failure to hand over money collected for the facility\'s account on time without acceptable justification.' },
  'violation.behavior.8': { ar: 'الامتناع عن ارتداء الملابس، والأجهزة المقررة للوقاية وللسلامة.', en: 'Refusing to wear prescribed clothing and devices for prevention and safety.' },
  'violation.behavior.9': { ar: 'تعمد الخلوة مع الجنس الآخر في أماكن العمل.', en: 'Intentionally being alone with the opposite sex in the workplace.' },
  'violation.behavior.10': { ar: 'الإيحاء للآخرين بما يخدش الحياء قولاً، أو فعلاً.', en: 'Suggesting to others what offends modesty in word or deed.' },
  'violation.behavior.11': { ar: 'الاعتداء على زملاء العمل بالقول، أو الإشارة، أو باستعمال وسائل الاتصال الالكترونية بالشتم، أو التحقير.', en: 'Assaulting colleagues by word, gesture, or using electronic communication means with insults or contempt.' },
  'violation.behavior.12': { ar: 'الاعتداء بالإيذاء الجسدي على زملاء العمل، أو على غيرهم بطريقة إباحية.', en: 'Physical assault on colleagues or others in an obscene manner.' },
  'violation.behavior.13': { ar: 'الاعتداء الجسدي، أو القولي، أو بأي وسيلة من وسائل الاتصال الالكترونية على صاحب العمل، أو المدير المسئول، أو أحد الرؤساء أثناء العمل، أو بسببه.', en: 'Physical or verbal assault, or by any electronic communication means, on the employer, responsible manager, or a superior during or due to work.' },
  'violation.behavior.14': { ar: 'تقديم بلاغ، أو شكوى كيدية.', en: 'Submitting a malicious report or complaint.' },
  'violation.behavior.15': { ar: 'عدم الامتثال لطلب لجنة التحقيق بالحضور، أو الإدلاء بالأقوال، أو الشهادة.', en: 'Failure to comply with the investigation committee\'s request to attend, make statements, or testify.' },
  'penalty.print': { ar: 'عرض للطباعة', en: 'View Printable' },
  'penalty.delete': { ar: 'حذف', en: 'Delete' },
  'penalty.confirmDelete': { ar: 'هل أنت متأكد من حذف هذا الجزاء؟', en: 'Are you sure you want to delete this penalty?' },
  'penalty.noPenalties': { ar: 'لا توجد جزاءات', en: 'No penalties found' },
  'penalty.pending': { ar: 'قيد الانتظار', en: 'Pending' },
  'penalty.accepted': { ar: 'مقبول', en: 'Accepted' },
  'penalty.rejected': { ar: 'مرفوض', en: 'Rejected' },
  'penalty.1stWarning': { ar: 'إنذار أول', en: '1st Warning' },
  'penalty.2ndWarning': { ar: 'إنذار ثاني', en: '2nd Warning' },
  'penalty.finalWarning': { ar: 'إنذار نهائي', en: 'Final Warning' },
  'penalty.deduction': { ar: 'خصم', en: 'Deduction' },
  'penalty.suspension': { ar: 'إيقاف', en: 'Suspension' },
  'penalty.dismissal': { ar: 'فصل من الخدمة', en: 'Dismissal' },
  'penalty.days': { ar: 'أيام', en: 'Days' },
  'penalty.history': { ar: 'سجل الجزاءات', en: 'Penalties History' },
  'penalty.issue': { ar: 'إصدار جزاء', en: 'Issue Penalty' },

  // --- Appointments Page (NEW) ---
  
  'appt.title': { ar: 'نظام حجز المواعيد', en: 'Appointment Booking System' },
  'appt.search': { ar: 'بحث بالاسم أو الكود...', en: 'Search by name or code...' },
  'appt.status.waiting': { ar: 'انتظار', en: 'Pending' },
  'appt.status.work': { ar: 'العمل', en: 'In Progress' },
  'appt.status.schudle': { ar: 'مواعيد', en: 'Scheduled' },
  'appt.room': { ar: 'رقم الغرفة', en: 'Room Number' },
  'appt.prep': { ar: 'التحضيرات', en: 'Preparations' },
  'appt.confirm': { ar: 'تأكيد الحجز', en: 'Confirm Booking' },
  'appt.limitReached': { ar: 'تم الوصول للحد الأقصى اليوم', en: 'Daily Limit Reached' },
  'appt.new': { ar: ' جديد حجز ', en: 'New Booking' },
  'appt.pending': { ar: 'انتظار', en: 'Pending' },
  'appt.processing': { ar: 'العمل', en: 'Processing' },
  'appt.scheduled': { ar: 'مواعيد', en: 'Scheduled' },
  'appt.done': { ar: 'منجز', en: 'Done' },
  'appt.searchPlaceholder': { ar: 'بحث باسم المريض أو رقم الملف...', en: 'Search Patient Name or File No...' },
  'appt.viewScheduled': { ar: 'عرض المواعيد المحجوزة', en: 'View Scheduled' },
  'appt.settings': { ar: 'إعدادات المواعيد', en: ' appointment Settings' },
  'appt.autoSync': { ar: 'الربط التلقائي', en: 'Auto Sync' },
  'appt.all': { ar: 'الكل', en: 'All' },
  'appt.dayFull': { ar: 'عذراً، اكتملت الحجوزات اليوم', en: 'Sorry, fully booked today' },
  'appt.fullCapacity': { ar: 'اكتمل العدد لهذا القسم', en: 'Full Capacity for this section' },
  'appt.limit': { ar: 'الحد الأقصى', en: 'Limit' },
  'appt.current': { ar: 'الحالي', en: 'Current' },
  'appt.editCapacity': { ar: 'تعديل السعة', en: 'Edit Capacity' },
  'appt.noResults': { ar: 'لا توجد نتائج للبحث', en: 'No results found' },
  'appt.noList': { ar: 'لا توجد مواعيد في هذه القائمة', en: 'No appointments in this list' },
  'appt.addFirst': { ar: 'إضافة موعد جديد', en: 'Add New Appointment' },
  'appt.cancelWait': { ar: 'إلغاء الموعد (عودة للانتظار)', en: 'Cancel (Return to Pending)' },
  'appt.edit': { ar: 'تعديل', en: 'Edit' },
  'appt.startExam': { ar: 'بدء الفحص', en: 'Start Exam' },
  'appt.finish': { ar: 'إنهاء (تم)', en: 'Finish' },
  'appt.book': { ar: 'حجز', en: 'Book' },
  'appt.patientName': { ar: 'اسم المريض', en: 'Patient Name' },
  'appt.fileNo': { ar: 'رقم الملف', en: 'File No' },
  'appt.doctor': { ar: 'الطبيب', en: 'Doctor' },
  'appt.age': { ar: 'العمر', en: 'Age' },
  'appt.examType': { ar: 'نوع الفحص', en: 'Exam Type' },
  'appt.specificExam': { ar: 'اسم الفحص المحدد (اختياري)', en: 'Specific Exam (Optional)' },
  'appt.notes': { ar: 'ملاحظات إضافية', en: 'Notes' },
  'appt.savePrint': { ar: 'حفظ وطباعة التذكرة', en: 'Save & Print Ticket' },
  'appt.scanLocal': { ar: 'مسح محلي (سريع)', en: 'Local Scan (Fast)' },
  'appt.scanAI': { ar: 'مسح ذكي (AI)', en: 'Smart Scan (AI)' },
  'appt.geminiUse': { ar: 'استخدم موقع Gemini الخارجي', en: 'Use External Gemini' },
  'appt.geminiCopy': { ar: 'نسخ الأمر + فتح الموقع 🚀', en: 'Copy Command + Open Site 🚀' },
  'appt.geminiPaste': { ar: 'الصق النتيجة من Gemini هنا (JSON)...', en: 'Paste Gemini Result (JSON)...' },
  'appt.autoFill': { ar: 'تعبئة البيانات تلقائياً', en: 'Auto Fill' },
  'appt.manualData': { ar: 'بيانات الحجز', en: 'Booking Data' },
  'appt.date': { ar: 'التاريخ', en: 'Date' },
  'appt.time': { ar: 'الوقت', en: 'Time' },
  'appt.prepInst': { ar: 'تعليمات التحضير (تظهر للمريض)', en: 'Prep Instructions (Patient View)' },
  'appt.successBook': { ar: 'تم حجز الموعد بنجاح ✅', en: 'Booking Successful ✅' },
  'appt.scanTicket': { ar: 'امسح الكود لعرض التذكرة وتحميلها', en: 'Scan to view/download ticket' },
  'appt.openTicket': { ar: 'فتح التذكرة للطباعة', en: 'Open Ticket to Print' },
  'appt.panicQuestion': { ar: 'هل كانت الحالة طارئة (Panic)؟', en: 'Was it a Panic Case?' },
  'appt.panicDesc': { ar: 'في حال وجود نتائج حرجة، يرجى تسجيلها فوراً.', en: 'Record critical findings immediately.' },
  'appt.yesPanic': { ar: 'نعم (Panic)', en: 'Yes (Panic)' },
  'appt.noNormal': { ar: 'لا (Normal)', en: 'No (Normal)' },
  'appt.panicDetails': { ar: 'وصف الحالة الحرجة:', en: 'Critical Findings:' },
  'appt.saveFinishReport': { ar: 'حفظ التقرير وإنهاء', en: 'Save & Finish' },
  'appt.startSuccess': { ar: 'تم بدء الفحص ✅', en: 'Exam Started ✅' },
  'appt.writeReg': { ar: 'يرجى كتابة رقم التسجيل التالي على الفيلم/الجهاز:', en: 'Write this Reg No on film/device:' },
  'appt.ok': { ar: 'حسناً، تم', en: 'OK, Done' },
  'appt.bridge': { ar: 'الربط الذكي', en: 'Smart Bridge' },
  'appt.bridgeInfo': { ar: 'إذا كنت تستخدم نظام IHMS، يمكنك نسخ هذا الكود في وحدة التحكم (Console) لنقل البيانات تلقائياً.', en: 'Copy this code to Console for IHMS auto-sync.' },
  'appt.copyScript': { ar: 'نسخ كود المراقبة (V13 - الشبح)', en: 'Copy Ghost Script (V13)' },
  'appt.manualJson': { ar: 'أو الصق البيانات يدوياً هنا:', en: 'Or paste JSON manually:' },
  'appt.processManual': { ar: 'معالجة البيانات يدوياً', en: 'Process Manually' },
  'appt.settingsTitle': { ar: 'إعدادات المواعيد (للمشرف)', en: 'Appointment Settings (Supervisor)' },
  'appt.settingsWarning': { ar: '⚠️ التغييرات هنا ستؤثر على جميع المستخدمين عند حجز مواعيد جديدة.', en: '⚠️ Changes affect all users.' },
  'appt.slotsCount': { ar: 'عدد المواعيد المتاحة للقسم', en: 'Available Slots' },
  'appt.addSlot': { ar: '➕ إضافة موعد', en: '➕ Add Slot' },
  'appt.defaultPrep': { ar: 'تعليمات التحضير الافتراضية', en: 'Default Prep Instructions' },
  'appt.saveSettings': { ar: 'حفظ التغييرات', en: 'Save Changes' },
  'appt.logbookTitle': { ar: 'سجل الأشعة (Log Book)', en: 'Radiology Log Book' },
  'appt.fromDate': { ar: 'من تاريخ', en: 'From Date' },
  'appt.toDate': { ar: 'إلى تاريخ', en: 'To Date' },
  'appt.viewLog': { ar: 'عرض التقرير', en: 'View Report' },
  'appt.printLogBtn': { ar: 'Print Log Book', en: 'Print Log Book' },
  'appt.close': { ar: 'إغلاق', en: 'Close' },
  "appt.reg":{ar:'تم تسجيل الموعد!',en:'appointment booked !'},
  "appt.construc":{ar:"اكتب التعليمات هنا ",en:"Write the instructions here"},
  'appt.rep':{ar:'لا توجد بيانات للعرض. اختر التاريخ واضغط "عرض التقرير',en:'No data is available to display. Select the date and click "View Report".'},
  'appt.appdate':{ar:'تاريح الموعد',en:'Appointment date'},
  'appt.apptime':{ar:'وقت الموعد',en:'Appointment time'},
  "app.cantbook":{ar:'لا يمكن حجز المزيد من المواعيد لهذا اليوم.',en:'No more appointments can be booked for today.'},
  "app.select":{ar:'اختر الوقت',en:'Select time'},
  'appt.panicSuccess': { ar: 'تم تسجيل حالة Panic 🚨', en: 'Panic state recorded 🚨' },
  'appt.finishSuccess': { ar: 'تم إنهاء الفحص بنجاح ✅', en: 'Examination finished successfully ✅' },
  'appt.saveError': { ar: 'حدث خطأ أثناء الحفظ', en: 'Error occurred while saving' },
'appt.noPrep': { 
    ar: 'لا توجد تحضيرات خاصة', 
    en: 'No special preparations' 
  },
  'appt.limitWarning': { 
    ar: '⚠️ تم اكتمال العدد لهذا القسم ({mod}) ({count}/{limit}).', 
    en: '⚠️ Capacity reached for this section ({mod}) ({count}/{limit}).' 
  },
  'appt.confirmCancel': { 
    ar: 'هل تريد إلغاء الموعد وإعادة المريض لقائمة الانتظار؟', 
    en: 'Do you want to cancel the appointment and return the patient to the waiting list?' 
  },
  'appt.toast.cancelled': { 
    ar: 'تم إلغاء الموعد وإعادته للانتظار', 
    en: 'Appointment cancelled and returned to waiting list' 
  },
  'error.general': { 
    ar: 'خطأ في العملية', 
    en: 'Process error' 
  },
  'appt.alreadyTaken': { 
    ar: 'عذراً، هذه الحالة تم سحبها بالفعل!', 
    en: 'Sorry, this case has already been taken!' 
  },
  'appt.toast.anotherUser': { 
    ar: 'عذراً، هذا المريض في عهدة موظف آخر', 
    en: 'Sorry, this patient is being handled by another staff member' 
  },
  'appt.slotsAvailable': { 
    ar: '✅ متاح: ${limit - currentCount} أماكن.', 
    en: '✅ Available: ${limit - currentCount} slots.' 
  },
  'appt.error.notYourColleague': { 
    ar: 'لا يمكنك التراجع عن حالة زميل', 
    en: 'You cannot undo a colleague\'s case' 
  },
  'appt.toast.dataFilled': { 
    ar: 'تم تعبئة البيانات بنجاح! ✅', 
    en: 'Data filled successfully! ✅' 
  },
  'appt.error.alreadyBooked': { 
    ar: '⚠️ عذراً، هذا الموعد ({time}) محجوز مسبقاً لهذا القسم.', 
    en: '⚠️ Sorry, this time slot ({time}) is already booked for this section.' 
  },
'appt.toast.addSuccess': { 
    ar: 'تم إضافة الموعد بنجاح ✅', 
    en: 'Appointment added successfully ✅' 
  },
  'appt.toast.settingsUpdated': { 
    ar: 'تم تحديث الإعدادات بنجاح', 
    en: 'Settings updated successfully' 
  },'appt.toast.settingsError': { 
    ar: 'فشل حفظ الإعدادات', 
    en: 'Failed to save settings' 
  },

  // --- Login ---,
  'login.title': { ar: 'تسجيل الدخول', en: 'Login' },
  'login.subtitle': { ar: 'أدخل بياناتك للمتابعة', en: 'Enter your credentials' },
  'login.email': { ar: 'البريد الإلكتروني', en: 'Email Address' },
  'login.password': { ar: 'كلمة المرور', en: 'Password' },
  'login.button': { ar: 'دخول', en: 'Sign In' },
  'login.error': { ar: 'البريد الإلكتروني أو كلمة المرور غير صحيحة', en: 'Invalid email or password' },

  // --- Password Change ---
  'pw.change': { ar: 'تغيير كلمة المرور', en: 'Change Password' },
  'pw.current': { ar: 'كلمة المرور الحالية', en: 'Current Password' },
  'pw.new': { ar: 'كلمة المرور الجديدة', en: 'New Password' },
  'pw.confirm': { ar: 'تأكيد كلمة المرور الجديدة', en: 'Confirm New Password' },
  'pw.matchError': { ar: 'كلمات المرور الجديدة غير متطابقة', en: 'Passwords do not match' },
  'pw.lengthError': { ar: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل', en: 'Password must be at least 6 chars' },
  'pw.success': { ar: 'تم تغيير كلمة المرور بنجاح', en: 'Password changed successfully' },

  // --- Supervisor Dashboard ---
  'dash.quickAction': { ar: 'مركز الإجراءات السريعة', en: 'Quick Action Center' },
  'dash.selectEmp': { ar: 'اختر الموظف', en: 'Select Employee' },
  'dash.sendKudos': { ar: 'إرسال شكر', en: 'Send Kudos' },
  'dash.flagIssue': { ar: 'تسجيل مخالفة', en: 'Flag Issue' },
  'dash.liveActivity': { ar: 'النشاط المباشر', en: 'Live Activity' },
  'dash.noActivity': { ar: 'لا يوجد نشاط بعد.', en: 'No activity yet.' },
  'dash.onShift': { ar: 'المناوبون الآن', en: "Who's on Shift" },
  'dash.activeNow': { ar: 'متواجدون الآن', en: "Active Now" },
  'dash.noActiveStaff': { ar: 'لا يوجد موظفين حالياً', en: "No active staff found" },
  'dash.filterActive': { ar: 'نشط', en: "Active" },
  'dash.filterAll': { ar: 'الكل', en: "All" },
  'dash.call': { ar: 'اتصال', en: "Call" },
  'dash.locationCode': { ar: 'كود الموقع', en: 'Location Code' },

  'sup.totalEmp': { ar: 'إجمالي الموظفين', en: 'Total Employees' },
  'sup.swapReqs': { ar: 'طلبات التبديل', en: 'Swap Requests' },
  'sup.leaveReqs': { ar: 'طلبات الغياب', en: 'Leave Requests' },
  'sup.pending': { ar: 'طلبات معلقة', en: 'Pending Requests' },
  
  'sup.tab.users': { ar: 'الموظفين', en: 'Employees' },
  'sup.tab.swaps': { ar: 'التبديلات', en: 'Swaps' },
  'sup.tab.market': { ar: 'سوق الورديات', en: 'Shift Market' },
  'sup.tab.leaves': { ar: 'الغيابات', en: 'Leaves' },
  'sup.tab.locations': { ar: 'الأماكن', en: 'Locations' },
  'sup.tab.reports': { ar: 'التقارير', en: 'Reports' },

  'sup.user.add': { ar: 'إضافة موظف جديد', en: 'Add New Employee' },
  'sup.user.name': { ar: 'الاسم الكامل', en: 'Full Name' },
  'sup.user.role': { ar: 'الصلاحية', en: 'Role' },

  'sup.loc.title': { ar: 'أماكن العمل والأقسام', en: 'Work Locations & Departments' },
  'sup.loc.add': { ar: 'إضافة قسم', en: 'Add Location' },

  'sup.approve': { ar: 'موافقة', en: 'Approve' },
  'sup.reject': { ar: 'رفض', en: 'Reject' },

  'sup.market.post': { ar: 'نشر وردية متاحة', en: 'Post Open Shift' },
  'sup.market.claimed': { ar: 'محجوزة (انتظار الموافقة)', en: 'Claimed (Pending)' },
  'sup.market.approveClaim': { ar: 'اعتماد التغطية', en: 'Approve Claim' },

  // --- User Dashboard ---
  'user.hero.welcome': { ar: 'مرحباً بعودتك،', en: 'Welcome back,' },
  'user.hero.currentStatus': { ar: 'الحالة الحالية', en: 'Current Status' },
  'user.hero.leave': { ar: 'إجازة', en: 'On Leave' },
  'user.hero.nextShift': { ar: 'الوردية القادمة', en: 'Next Shift' },
  'user.hero.noShift': { ar: 'لا توجد ورديات مسجلة', en: 'No shifts scheduled' },
  'user.code': { ar: 'كود الموقع', en: 'Location Code' },
  'user.generate': { ar: 'توليد الكود', en: 'Generate Code' },
  'user.copy': { ar: 'نسخ وإغلاق', en: 'Copy & Close' },
  'user.female': { ar: 'أنثى', en: 'Female' },
  'user.male': { ar: 'ذكر', en: 'Male' },
  
  'user.tab.schedule': { ar: 'التذاكر (الجدول)', en: 'My Tickets' },
  'user.tab.market': { ar: 'تغطية وردية', en: 'Cover Shift' },
  'user.tab.requests': { ar: 'الطلبات', en: 'Requests' },
  'user.tab.incoming': { ar: 'الوارد', en: 'Incoming' },
  'user.tab.history': { ar: 'السجل', en: 'History' },
  'user.tab.profile': { ar: 'ملفي وأدائي', en: 'My Profile & Stats' },

  'user.req.swap': { ar: 'طلب تبديل', en: 'Swap Request' },
  'user.req.colleague': { ar: 'الزميل', en: 'Colleague' },
  'user.req.type': { ar: 'النوع', en: 'Type' },
  'user.req.day': { ar: 'يومي', en: 'Daily' },
  'user.req.month': { ar: 'شهري', en: 'Monthly' },
  'user.req.send': { ar: 'إرسال الطلب', en: 'Send Request' },

  'user.req.leave': { ar: 'طلب إجازة', en: 'Leave Request' },
  'user.req.leaveType': { ar: 'نوع الإجازة', en: 'Leave Type' },
  'user.req.duration': { ar: 'المدة (أيام)', en: 'Duration (Days)' },
  'user.req.relievers': { ar: 'البدلاء', en: 'Relievers' },
  'user.req.dateHired': { ar: 'تاريخ التعيين', en: 'Date Hired' },
  'user.req.dueDateForLeave': { ar: 'تاريخ استحقاق الإجازة', en: 'Due Date for Leave' },
  'user.req.status.pending_reliever': { ar: 'بانتظار موافقة البديل', en: 'Pending Reliever' },
  'user.req.status.pending_supervisor': { ar: 'بانتظار موافقة المشرف', en: 'Pending Supervisor' },
  'user.req.status.pending_manager': { ar: 'بانتظار موافقة المدير', en: 'Pending Manager' },
  'user.hist.unknown': { ar: 'غير معروف', en: 'Unknown' },
  'user.hist.filterBy': { ar: 'تصفية حسب:', en: 'Filter By:' },
  'user.hist.allTypes': { ar: 'كل الأنواع', en: 'All Types' },
  'user.hist.swaps': { ar: 'التبديلات', en: 'Swaps' },
  'user.hist.leaves': { ar: 'الإجازات', en: 'Leaves' },
  'user.hist.allStatus': { ar: 'كل الحالات', en: 'All Status' },
  'user.hist.waitingSupervisor': { ar: 'في انتظار المشرف', en: 'Waiting Supervisor' },
  'user.hist.waitingReliever': { ar: 'في انتظار البديل', en: 'Waiting Reliever' },
  'user.hist.waitingManager': { ar: 'في انتظار المدير', en: 'Waiting Manager' },
  'user.req.status.approved': { ar: 'موافق عليه', en: 'Approved' },
  'user.req.status.rejected': { ar: 'مرفوض', en: 'Rejected' },
  'sup.tab.managerApprovals': { ar: 'موافقات المدير', en: 'Manager Approvals' },
  'sup.tab.supervisorApprovals': { ar: 'موافقات المشرف', en: 'Supervisor Approvals' },
  'sup.relieverApprovals': { ar: 'موافقات البدلاء:', en: 'Reliever Approvals:' },
  'sup.supervisorApproval': { ar: 'موافقة المشرف:', en: 'Supervisor Approval:' },
  'user.req.holdCtrl': { ar: 'اضغط Ctrl (أو Cmd) لاختيار أكثر من بديل', en: 'Hold Ctrl (or Cmd) to select multiple' },
  'user.req.from': { ar: 'من', en: 'From' },
  'user.req.to': { ar: 'إلى', en: 'To' },
  'user.req.reason': { ar: 'السبب', en: 'Reason' },
  'user.req.apply': { ar: 'تقديم الطلب', en: 'Apply' },

  'user.market.title': { ar: 'سوق الورديات المتاحة', en: 'Open Shift Marketplace' },
  'user.market.desc': { ar: 'يمكنك هنا استعراض الورديات الشاغرة وطلب تغطيتها.', en: 'Browse and claim open shifts to earn extra points.' },
  'user.market.empty': { ar: 'لا توجد ورديات شاغرة حالياً', en: 'No open shifts available currently' },
  'user.market.claim': { ar: 'حجز الوردية', en: 'Claim Shift' },
  'user.market.claimed': { ar: 'تم طلب الحجز', en: 'Claim Requested' },

  'user.incoming.empty': { ar: 'لا توجد رسائل واردة', en: 'No incoming messages' },
  'user.incoming.accept': { ar: 'قبول', en: 'Accept' },
  
  // --- Inventory ---
  'inv.dashboard': { ar: 'نظرة عامة', en: 'Overview' },
  'inv.usage': { ar: 'صرف مواد', en: 'Dispense' },
  'inv.incoming': { ar: 'وارد جديد', en: 'Incoming Stock' },
  'inv.materials': { ar: 'إدارة المواد', en: 'Materials Mgmt' },
  'inv.reports': { ar: 'التقارير', en: 'Reports' },
  
  'inv.stat.low': { ar: 'مواد أوشكت على النفاذ', en: 'Low Stock Items' },
  'inv.stat.expiry': { ar: 'تنتهي صلاحيتها قريباً', en: 'Expiring Soon' },
  'inv.stat.total': { ar: 'إجمالي الوحدات بالمخزن', en: 'Total Units in Stock' },
  'inv.stat.usage': { ar: 'عملية صرف', en: 'Dispense Ops' },
  'inv.alert.good': { ar: 'المخزون في حالة جيدة', en: 'Inventory is healthy' },

  'inv.usage.title': { ar: 'صرف مواد', en: 'Dispense Material' },
  'inv.usage.subtitle': { ar: 'تسجيل استهلاك مريض', en: 'Record patient consumption' },
  'inv.usage.material': { ar: 'المادة', en: 'Material' },
  'inv.usage.amount': { ar: 'الكمية', en: 'Amount' },
  'inv.usage.file': { ar: 'رقم الملف', en: 'Patient File No' },
  'inv.usage.confirm': { ar: 'تأكيد الصرف', en: 'Confirm Dispense' },
  'inv.quick': { ar: 'الإجراءات السريعة', en: 'Quick Actions' },
  'inv.recent': { ar: 'آخر العمليات', en: 'Recent Transactions' },

  'inv.inc.title': { ar: 'إضافة وارد جديد', en: 'Add Incoming Stock' },
  'inv.inc.upload': { ar: 'اسحب صورة الفاتورة هنا', en: 'Drag invoice image here' },
  'inv.inc.btn': { ar: 'تحديث المخزون', en: 'Update Stock' },
  'inv.inc.qty': { ar: 'الكمية', en: 'Quantity' },
  'inv.inc.exp': { ar: 'تاريخ الصلاحية (اختياري)', en: 'Expiry Date (Optional)' },

  'inv.mat.title': { ar: 'إدارة المواد', en: 'Materials Management' },
  'inv.mat.name': { ar: 'اسم المادة', en: 'Material Name' },
  'inv.mat.unit': { ar: 'وحدة', en: 'Units' },

  'inv.rep.title': { ar: 'سجل العمليات', en: 'Transaction Log' },

  // --- Communication ---
  'comm.title': { ar: 'مركز التواصل والورديات', en: 'Communication & Logbook' },
  'comm.subtitle': { ar: 'سجل الملاحظات، المهام، والتعاميم الإدارية', en: 'Shift logs, tasks, and administrative announcements' },
  'comm.logbook': { ar: 'دفتر الورديات', en: 'Logbook' },
  'comm.announcements': { ar: 'التعاميم', en: 'Announcements' },
  'comm.log.title': { ar: 'سجل ملاحظة / تسليم', en: 'Log Entry / Handover' },
  'comm.log.loc': { ar: 'مكان العمل (المرسل)', en: 'Location (Sender)' },
  'comm.log.cat': { ar: 'التصنيف', en: 'Category' },
  'comm.log.content': { ar: 'المحتوى', en: 'Content' },
  'comm.log.important': { ar: 'بلاغ هام (عطل/مشكلة)', en: 'Important Issue / Flag' },
  'comm.log.btn': { ar: 'حفظ في السجل', en: 'Save to Log' },
  'comm.cat.general': { ar: 'عام', en: 'General' },
  'comm.cat.machine': { ar: 'أعطال أجهزة', en: 'Machine Issue' },
  'comm.cat.patient': { ar: 'حالات مرضى', en: 'Patient Care' },
  'comm.cat.supply': { ar: 'نواقص', en: 'Supply Check' },
  
  'comm.ann.new': { ar: 'إضافة تعميم جديد', en: 'New Announcement' },
  'comm.ann.title': { ar: 'العنوان', en: 'Title' },
  'comm.ann.content': { ar: 'نص التعميم', en: 'Content' },
  'comm.ann.priority': { ar: 'الأهمية', en: 'Priority' },
  'comm.ann.post': { ar: 'نشر التعميم', en: 'Post Announcement' },
  
  'comm.prio.normal': { ar: 'عادي', en: 'Normal' },
  'comm.prio.urgent': { ar: 'هام', en: 'Urgent' },
  'comm.prio.critical': { ar: 'طارئ جداً', en: 'Critical' },

  'comm.receive': { ar: 'استلام', en: 'Receive' },
  'comm.receivedBy': { ar: 'تم الاستلام بواسطة', en: 'Received By' },
  'comm.views': { ar: 'المشاهدات', en: 'Views' },
  'comm.filter': { ar: 'تصفية', en: 'Filter' },

  'comm.tpl.handover': { ar: 'تسليم عهدة كاملة، لا توجد مشاكل.', en: 'Full handover completed, no issues.' },
  'comm.tpl.deviceIssue': { ar: 'يوجد عطل في جهاز ...', en: 'There is an issue with machine ...' },
  'comm.tpl.patientHandover': { ar: 'مريض بحاجة لمتابعة ...', en: 'Patient needs follow up ...' },
  'comm.tpl.smooth': { ar: 'سير العمل ممتاز.', en: 'Smooth workflow today.' },

  'check.devices': { ar: 'فحص الأجهزة', en: 'Check Devices' },
  'check.inventory': { ar: 'جرد العهدة', en: 'Inventory Check' },
  'check.keys': { ar: 'المفاتيح', en: 'Keys Handover' },
  'check.clean': { ar: 'نظافة المكان', en: 'Room Cleanliness' },

  // --- Tasks ---
  'task.title': { ar: 'لوحة المهام', en: 'Task Board' },
  'task.subtitle': { ar: 'متابعة مهام القسم الفنية والإدارية', en: 'Track departmental tasks and maintenance' },
  'task.add': { ar: 'إسناد مهمة جديدة', en: 'Assign New Task' },
  'task.pending': { ar: 'قيد الانتظار', en: 'Pending' },
  'task.progress': { ar: 'جاري العمل', en: 'In Progress' },
  'task.done': { ar: 'مكتملة', en: 'Completed' },
  'task.start': { ar: 'بدء المهمة', en: 'Start Task' },
  'task.complete': { ar: 'إنهاء', en: 'Done' },
  'task.revert': { ar: 'إعادة للانتظار', en: 'Revert to Pending' },
  'task.priority.low': { ar: 'منخفضة', en: 'Low' },
  'task.priority.medium': { ar: 'متوسطة', en: 'Medium' },
  'task.priority.high': { ar: 'عالية', en: 'High' },

  // --- Reports ---
  'rep.title': { ar: 'التقارير والتقييم', en: 'Reports & Evaluation' },
  'rep.subtitle': { ar: 'نظام النقاط وتقييم الأداء الشهري', en: 'Points system & monthly performance' },
  'rep.add': { ar: 'تسجيل مخالفة/إجراء', en: 'Log Action/Violation' },
  'rep.card': { ar: 'بطاقة الأداء', en: 'Performance Card' },
  'rep.base': { ar: 'الرصيد الأساسي', en: 'Base Score' },
  'rep.deduct': { ar: 'الخصومات', en: 'Deductions' },
  'rep.net': { ar: 'الرصيد النهائي', en: 'Net Score' },
  'rep.log': { ar: 'سجل الإجراءات', en: 'Action Log' },
  'rep.filter.emp': { ar: 'الموظف', en: 'Employee' },

  'grade.excellent': { ar: 'ممتاز', en: 'Excellent' },
  'grade.vgood': { ar: 'جيد جداً', en: 'Very Good' },
  'grade.good': { ar: 'جيد', en: 'Good' },
  'grade.acceptable': { ar: 'مقبول', en: 'Acceptable' },
  'grade.weak': { ar: 'ضعيف', en: 'Weak' },

  'action.late': { ar: 'تأخير', en: 'Late Arrival' },
  'action.sick_leave': { ar: 'إجازة مرضية', en: 'Sick Leave' },
  'action.unjustified_absence': { ar: 'غياب غير مبرر', en: 'Unjustified Absence' },
  'action.violation': { ar: 'مخالفة إدارية', en: 'Violation' },
  'action.positive': { ar: 'مبادرة إيجابية (بونص)', en: 'Positive Initiative (Bonus)' },
  'action.justified_absence': { ar: 'غياب بعذر', en: 'Justified Absence' },
  'action.annual_leave': { ar: 'إجازة سنوية', en: 'Annual Leave' },
  'action.mission': { ar: 'انتداب / مهمة', en: 'Mission' },

  // --- Attendance ---
  'att.title': { ar: 'محلل الحضور الذكي', en: 'Smart Attendance Analyzer' },
  'att.desc': { ar: 'تحليل ملفات البصمة واكتشاف الورديات المقسمة والتأخيرات تلقائياً', en: 'Analyze fingerprint logs, detect split shifts and lateness automatically' },
  'att.upload.label': { ar: 'ارفع ملف اكسل هنا', en: 'Upload Excel File Here' },
  'att.step2': { ar: 'معالجة البيانات', en: 'Data Processing' },
  'att.step3': { ar: 'النتائج', en: 'Results' },
  'att.reset': { ar: 'تحليل ملف جديد', en: 'Analyze New File' },
  'att.table.name': { ar: 'الاسم', en: 'Name' },
  'att.table.workdays': { ar: 'أيام العمل', en: 'Work Days' },
  'att.table.fridays': { ar: 'الجمع', en: 'Fridays' },
  'att.table.absent': { ar: 'الغياب', en: 'Absence' },
  'att.table.overtime': { ar: 'الأوفر تايم', en: 'Overtime' },
  'att.table.late': { ar: 'تأخير (دقيقة)', en: 'Late (Mins)' },
  'att.punch': { ar: 'تسجيل البصمة', en: 'Attendance Punch' },
  'att.history': { ar: 'سجل البصمات', en: 'Punch History' },
  'att.override': { ar: 'استثناء (تجاوز الموقع)', en: 'Override Location' },
  'att.risk': { ar: 'تنبيه أمني', en: 'Security Alert' },

  // --- Kudos ---
  'kudos.title': { ar: 'لوحة التقدير', en: 'Appreciation Wall' },
  'kudos.send': { ar: 'أرسل شكر لزميل', en: 'Send Kudos' },
  'kudos.received': { ar: 'تشجيعات مستلمة', en: 'Kudos Received' },
  'kudos.thank': { ar: 'شكراً لك', en: 'Thank You' },
  'kudos.hero': { ar: 'بطل القوى الخارقة', en: 'Super Hero' },
  'kudos.team': { ar: 'روح الفريق', en: 'Team Player' },
  
  // --- Stats ---
  'stats.attendance': { ar: 'درجة الالتزام', en: 'Commitment Score' },
  'stats.balance': { ar: 'رصيد الإجازات', en: 'Leave Balance' },

  // --- Voice ---
  'voice.tap': { ar: 'اضغط للتحدث', en: 'Tap to Speak' },
  
  // --- Schedule Builder ---
  'sb.publish': { ar: 'نشر الجدول', en: 'Publish Schedule' },
  'sb.unpublish': { ar: 'حذف الجدول (الشهر المحدد)', en: 'Unpublish (Clear Month)' },
  'sb.btn.saved': { ar: 'القوالب المحفوظة', en: 'Saved Templates' },
  'sb.empty': { ar: 'لا توجد قوالب محفوظة', en: 'No saved templates found' },
  'sb.updateExisting': { ar: 'تحديث القالب الحالي', en: 'Update Existing Template' },
  'sb.saveAsNew': { ar: 'حفظ كقالب جديد', en: 'Save as New Template' },
  'sb.newTemplateName': { ar: 'اسم القالب الجديد', en: 'New Template Name' },
};

export const LanguageContext = createContext<LanguageContextType>({
  language: 'ar',
  toggleLanguage: () => {},
  t: (k) => k,
  dir: 'rtl'
});

export const useLanguage = () => useContext(LanguageContext);

export const getTranslationKeyForArabic = (arabicText: string): string | null => {
  for (const [key, value] of Object.entries(translations)) {
    if (value.ar === arabicText) return key;
  }
  return null;
};

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('ar');

  useEffect(() => {
      const saved = localStorage.getItem('app_lang') as Language;
      if (saved) setLanguage(saved);
  }, []);

  const toggleLanguage = () => {
    const newLang = language === 'ar' ? 'en' : 'ar';
    setLanguage(newLang);
    localStorage.setItem('app_lang', newLang);
  };

  const t = (key: string) => {
    return translations[key]?.[language] || key;
  };

  const dir = language === 'ar' ? 'rtl' : 'ltr';

  return (
    <LanguageContext.Provider value={{ language, toggleLanguage, t, dir }}>
      {children}
    </LanguageContext.Provider>
  );
};
