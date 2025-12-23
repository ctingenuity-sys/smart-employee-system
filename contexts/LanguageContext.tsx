
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
  
  // --- Roles ---
  'role.admin': { ar: 'مسؤول', en: 'Admin' },
  'role.supervisor': { ar: 'مشرف', en: 'Supervisor' },
  'role.user': { ar: 'موظف', en: 'Employee' },
  'role.doctor': { ar: 'طبيب', en: 'Doctor' },

  // --- Doctor Station (Radiology) ---
  'doc.station': { ar: 'محطة طبيب الأشعة', en: 'Radiologist Station' },
  'doc.subtitle': { ar: 'أدواتك الذكية وجدول مناوباتك', en: 'Your Smart Tools & Roster' },
  'doc.ai.title': { ar: 'المساعد الإشعاعي الذكي', en: 'AI Radiology Copilot' },
  'doc.ai.explain': { ar: 'شرح للمريض', en: 'Patient Explainer' },
  'doc.ai.safety': { ar: 'مدقق السلامة', en: 'Safety Check' },
  'doc.ai.protocol': { ar: 'البروتوكولات', en: 'Protocols' },
  'doc.oncall.today': { ar: 'مناوبات الأطباء اليوم', en: 'Doctors On-Call Today' },
  'doc.myschedule': { ar: 'وردياتي القادمة', en: 'My Upcoming Shifts' },

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
  
  // --- Appointments ---
  'appt.title': { ar: 'إدارة المواعيد', en: 'Appointment Management' },
  'appt.new': { ar: 'حجز موعد جديد', en: 'Book New Appointment' },
  'appt.patient': { ar: 'اسم المريض', en: 'Patient Name' },
  'appt.exam': { ar: 'الفحص المطلوب', en: 'Examination Type' },
  'appt.voice': { ar: 'إدخال صوتي', en: 'Voice Input' },
  'appt.list': { ar: 'قائمة المواعيد', en: 'Appointments List' },
  'appt.pending': { ar: 'قيد الانتظار', en: 'Pending' },
  'appt.done': { ar: 'تم الفحص', en: 'Completed' },
  'appt.by': { ar: 'بواسطة', en: 'By' },
  
  // --- Login ---
  'login.title': { ar: 'تسجيل الدخول', en: 'Login' },
  'login.subtitle': { ar: 'أدخل بياناتك للمتابعة', en: 'Enter your credentials' },
  'login.email': { ar: 'البريد الإلكتروني', en: 'Email Address' },
  'login.password': { ar: 'كلمة المرور', en: 'Password' },
  'login.button': { ar: 'دخول', en: 'Sign In' },
  'login.error': { ar: 'البريد الإلكتروني أو كلمة المرور غير صحيحة', en: 'Invalid email or password' },
  'login.noData': { ar: 'بيانات المستخدم غير موجودة في النظام', en: 'User data not found' },

  // --- Password Change ---
  'pw.change': { ar: 'تغيير كلمة المرور', en: 'Change Password' },
  'pw.current': { ar: 'كلمة المرور الحالية', en: 'Current Password' },
  'pw.new': { ar: 'كلمة المرور الجديدة', en: 'New Password' },
  'pw.confirm': { ar: 'تأكيد كلمة المرور الجديدة', en: 'Confirm New Password' },
  'pw.matchError': { ar: 'كلمات المرور الجديدة غير متطابقة', en: 'Passwords do not match' },
  'pw.lengthError': { ar: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل', en: 'Password must be at least 6 chars' },
  'pw.success': { ar: 'تم تغيير كلمة المرور بنجاح', en: 'Password changed successfully' },

  // --- Supervisor Dashboard ---
  'dash.onShift': { ar: 'المناوبون الآن', en: "Who's on Shift" },
  'sup.totalEmp': { ar: 'إجمالي الموظفين', en: 'Total Employees' },
  'sup.swapReqs': { ar: 'طلبات التبديل', en: 'Swap Requests' },
  'sup.leaveReqs': { ar: 'طلبات الغياب', en: 'Leave Requests' },
  'sup.empReg': { ar: 'موظف مسجل في النظام', en: 'Registered Employees' },
  'sup.pending': { ar: 'طلب معلق بانتظار الموافقة', en: 'Pending Requests' },
  'sup.newLeaves': { ar: 'طلب إجازة/غياب جديد', en: 'New Leave Requests' },
  
  'sup.tab.overview': { ar: 'نظرة عامة', en: 'Overview' },
  'sup.tab.users': { ar: 'الموظفين', en: 'Employees' },
  'sup.tab.swaps': { ar: 'التبديلات', en: 'Swaps' },
  'sup.tab.market': { ar: 'سوق الورديات', en: 'Shift Market' },
  'sup.tab.leaves': { ar: 'الغيابات', en: 'Leaves' },
  'sup.tab.locations': { ar: 'الأماكن', en: 'Locations' },
  'sup.tab.liveLogs': { ar: 'سجل البصمة الحي', en: 'Live Attendance Log' },

  'sup.user.list': { ar: 'قائمة الموظفين', en: 'Employee List' },
  'sup.user.add': { ar: 'إضافة موظف جديد', en: 'Add New Employee' },
  'sup.user.name': { ar: 'الاسم الكامل', en: 'Full Name' },
  'sup.user.role': { ar: 'الصلاحية', en: 'Role' },
  'sup.user.confirmDelete': { ar: 'هل أنت متأكد من حذف هذا الموظف؟ لن يتمكن من الدخول للنظام.', en: 'Are you sure? This user will lose access.' },

  'sup.loc.title': { ar: 'أماكن العمل والأقسام', en: 'Work Locations & Departments' },
  'sup.loc.add': { ar: 'إضافة قسم', en: 'Add Location' },

  'sup.swap.pending': { ar: 'طلبات التبديل المعلقة', en: 'Pending Swap Requests' },
  'sup.swap.from': { ar: 'من', en: 'From' },
  'sup.swap.to': { ar: 'إلى', en: 'To' },
  'sup.swap.details': { ar: 'التفاصيل', en: 'Details' },
  'sup.approve': { ar: 'موافقة', en: 'Approve' },
  'sup.reject': { ar: 'رفض', en: 'Reject' },

  'sup.market.post': { ar: 'نشر وردية متاحة', en: 'Post Open Shift' },
  'sup.market.date': { ar: 'التاريخ', en: 'Date' },
  'sup.market.time': { ar: 'الوقت', en: 'Time' },
  'sup.market.claimed': { ar: 'محجوزة (انتظار الموافقة)', en: 'Claimed (Pending Approval)' },
  'sup.market.approved': { ar: 'معتمدة', en: 'Approved' },
  'sup.market.approveClaim': { ar: 'اعتماد التغطية', en: 'Approve Claim' },

  // --- User Dashboard ---
  'user.hero.welcome': { ar: 'مرحباً بعودتك،', en: 'Welcome back,' },
  'user.hero.newReqs': { ar: 'طلبات جديدة', en: 'New Requests' },
  'user.hero.currentStatus': { ar: 'الحالة الحالية', en: 'Current Status' },
  'user.hero.leave': { ar: 'إجازة', en: 'On Leave' },
  'user.hero.nextShift': { ar: 'الوردية القادمة', en: 'Next Shift' },
  'user.hero.noShift': { ar: 'لا توجد ورديات مسجلة لهذا الشهر', en: 'No shifts scheduled this month' },
  
  'user.tab.schedule': { ar: 'التذاكر (الجدول)', en: 'My Tickets' },
  'user.tab.market': { ar: 'تغطية وردية', en: 'Cover Shift' },
  'user.tab.requests': { ar: 'الطلبات', en: 'Requests' },
  'user.tab.incoming': { ar: 'الوارد', en: 'Incoming' },
  'user.tab.history': { ar: 'السجل', en: 'History' },
  'user.tab.assistant': { ar: 'المساعد الذكي', en: 'AI Assistant' },
  'user.tab.profile': { ar: 'ملفي وأدائي', en: 'My Profile & Stats' },

  'user.req.swap': { ar: 'طلب تبديل', en: 'Swap Request' },
  'user.req.swapDesc': { ar: 'تبديل وردية أو شهر كامل مع زميل', en: 'Swap a shift or month with a colleague' },
  'user.req.colleague': { ar: 'الزميل', en: 'Colleague' },
  'user.req.type': { ar: 'النوع', en: 'Type' },
  'user.req.day': { ar: 'يومي', en: 'Daily' },
  'user.req.month': { ar: 'شهري', en: 'Monthly' },
  'user.req.send': { ar: 'إرسال الطلب', en: 'Send Request' },
  'user.req.suggest': { ar: 'اقتراح بديل', en: 'Suggest Colleague' },
  'user.req.suggestTitle': { ar: 'الزملاء المتاحين', en: 'Available Colleagues' },

  'user.req.leave': { ar: 'طلب إجازة', en: 'Leave Request' },
  'user.req.leaveDesc': { ar: 'تقديم طلب إجازة اعتيادية أو عارضة', en: 'Apply for annual or sick leave' },
  'user.req.from': { ar: 'من', en: 'From' },
  'user.req.to': { ar: 'إلى', en: 'To' },
  'user.req.reason': { ar: 'السبب', en: 'Reason' },
  'user.req.apply': { ar: 'تقديم الطلب', en: 'Apply' },

  'user.market.title': { ar: 'سوق الورديات المتاحة', en: 'Open Shift Marketplace' },
  'user.market.desc': { ar: 'يمكنك هنا استعراض الورديات الشاغرة وطلب تغطيتها لزيادة رصيدك.', en: 'Browse and claim open shifts to earn extra points.' },
  'user.market.empty': { ar: 'لا توجد ورديات شاغرة حالياً', en: 'No open shifts available currently' },
  'user.market.claim': { ar: 'حجز الوردية', en: 'Claim Shift' },

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

  // --- Tech Support & SBAR ---
  'tech.title': { ar: 'الدعم الفني الذكي', en: 'AI Tech Support' },
  'tech.ask': { ar: 'اوصف المشكلة التقنية...', en: 'Describe the technical issue...' },
  'sbar.title': { ar: 'تسليم SBAR', en: 'SBAR Handover' },
  'sbar.desc': { ar: 'تحويل الملاحظات الصوتية إلى تنسيق SBAR الطبي', en: 'Convert voice notes to SBAR format' },
  'sbar.gen': { ar: 'إنشاء التقرير', en: 'Generate Report' },

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
  'rep.filter.custom': { ar: 'تاريخ مخصص', en: 'Custom Date' },

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
  'att.log.location': { ar: 'الموقع الجغرافي', en: 'Geo Location' },
  'att.log.device': { ar: 'الجهاز', en: 'Device' },
  'att.log.map': { ar: 'عرض الخريطة', en: 'View Map' },

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

  // --- Schedule Builder ---
  'sb.publish': { ar: 'نشر الجدول', en: 'Publish Schedule' },
  'sb.unpublish': { ar: 'حذف الجدول (الشهر المحدد)', en: 'Unpublish (Clear Month)' },
  'sb.btn.saved': { ar: 'القوالب المحفوظة', en: 'Saved Templates' },
  'sb.empty': { ar: 'لا توجد قوالب محفوظة', en: 'No saved templates found' },
};

export const LanguageContext = createContext<LanguageContextType>({
  language: 'ar',
  toggleLanguage: () => {},
  t: (k) => k,
  dir: 'rtl'
});

export const useLanguage = () => useContext(LanguageContext);

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