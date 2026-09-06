import React, { useState, useEffect } from 'react';
import { db, auth } from '../../firebase';
import { collection, addDoc, onSnapshot, serverTimestamp, query, orderBy, deleteDoc, doc, getDocs, where, updateDoc } from 'firebase/firestore';
import { User, Penalty } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useFilteredUsers } from '../../hooks/useFilteredUsers';
import PenaltyPrintable from '../../components/PenaltyPrintable';
import { useLanguage, getTranslationKeyForArabic } from '../../contexts/LanguageContext';
import { printPenaltyDocument } from '../../utils/printPenalty';
import { PrintStyleModal } from '../../components/PrintStyleModal';

const VIOLATION_CATEGORIES = {
    "مخالفات تتعلق بمواعيد العمل": [
        "التأخر عن مواعيد الحضور للعمل لغاية (15) دقيقة دون إذن، أو عذر مقبول.",
        "التأخر عن مواعيد الحضور للعمل لغاية (15) دقيقة دون إذن، أو عذر مقبول: إذا ترتب على ذلك تعطيل عمال آخرين.",
        "التأخر عن مواعيد الحضور للعمل أكثر من (15) دقيقة لغاية (30) دقيقة دون إذن، أو عذر مقبول.",
        "التأخر عن مواعيد الحضور للعمل أكثر من (15) دقيقة لغاية (30) دقيقة دون إذن، أو عذر مقبول: إذا ترتب على ذلك تعطيل عمال آخرين.",
        "التأخر عن مواعيد الحضور للعمل أكثر من (30) دقيقة لغاية (60) دقيقة دون إذن، أو عذر مقبول.",
        "التأخر عن مواعيد الحضور للعمل أكثر من (30) دقيقة لغاية (60) دقيقة دون إذن، أو عذر مقبول: إذا ترتب على ذلك تعطيل عمال آخرين.",
        "التأخر عن مواعيد الحضور للعمل لمدة تزيد على ساعة دون إذن، أو عذر مقبول.",
        "ترك العمل، أو الانصراف قبل الميعاد دون إذن، أو عذر مقبول بما لا يتجاوز (15) دقيقة.",
        "ترك العمل، أو الانصراف قبل الميعاد دون إذن، أو عذر مقبول بما يتجاوز (15) دقيقة.",
        "البقاء في أماكن العمل، أو العودة إليها بعد انتهاء مواعيد العمل دون إذن مسبق.",
        "الغياب دون إذن كتابي، أو عذر مقبول لمدة يوم، خلال السنة العقدية الواحدة.",
        "الغياب المتصل دون إذن كتابي، أو عذر مقبول من يومين إلى ستة أيام، خلال السنة العقدية الواحدة.",
        "الغياب المتصل دون إذن كتابي، أو عذر مقبول من سبعة أيام إلى عشرة أيام، خلال السنة العقدية الواحدة.",
        "الغياب المتصل دون إذن كتابي، أو عذر مقبول من أحد عشر يوماً إلى أربعة عشر يوماً، خلال السنة العقدية الواحدة.",
        "الانقطاع عن العمل دون سبب مشروع مدة تزيد على خمسة عشر يوماً متصلة.",
        "الغياب المتقطع دون سبب مشروع مدداً تزيد في مجموعها على ثلاثين يوماً خلال السنة العقدية الواحدة."
    ],
    "مخالفات تتعلق بتنظيم العمل": [
        "التواجد دون مبرر في غير مكان العمل المخصص للعامل أثناء وقت الدوام.",
        "استقبال زائرين في غير أمور عمل المنشأة في أماكن العمل، دون إذن من الإدارة.",
        "استعمال آلات، ومعدات، وأدوات المنشأة؛ لأغراض خاصة، دون إذن.",
        "تدخل العامل، دون وجه حق في أي عمل ليس في اختصاصه، أو لم يعهد به إليه.",
        "الخروج، أو الدخول من غير المكان المخصص لذلك.",
        "الإهمال في تنظيف الآلات، وصيانتها، أو عدم العناية بها، أو عدم التبليغ عن ما بها من خلل.",
        "عدم وضع أدوات الإصلاح، والصيانة، واللوازم الأخرى في الأماكن المخصصة لها، بعد الانتهاء من العمل.",
        "تمزيق، أو إتلاف إعلانات، أو بلاغات إدارة المنشأة.",
        "الإهمال في العهد التي بحوزته، مثال: (سيارات، آلات، أجهزة، معدات، أدوات، ......الخ).",
        "الأكل في مكان العمل، أو غير المكان المعد له، أو في غير أوقات الراحة.",
        "النوم أثناء العمل.",
        "النوم في الحالات التي تستدعي يقظة مستمرة.",
        "التسكع، أو وجود العامل في غير مكان عمله، أثناء ساعات العمل.",
        "التلاعب في إثبات الحضور، والانصراف.",
        "عدم إطاعة الأوامر العادية الخاصة بالعمل، أو عدم تنفيذ التعليمات الخاصة بالعمل، والمعلقة في مكان ظاهر.",
        "التحريض على مخالفة الأوامر، والتعليمات الخطية الخاصة بالعمل.",
        "التدخين في الأماكن المحظورة، والمعلن عنها للمحافظة على سلامة العمال، والمنشأة.",
        "الإهمال، أو التهاون في العمل الذي قد ينشأ عنه ضرر في صحة العمال، أو سلامتهم، أو في المواد، أو الأدوات، والأجهزة."
    ],
    "مخالفات تتعلق بسلوك العامل": [
        "التشاجر مع الزملاء، أو مع الغير، أو إحداث مشاغبات في مكان العمل.",
        "التمارض، أو ادعاء العامل كذباً أنه أصيب أثناء العمل، أو بسببه.",
        "الامتناع عن إجراء الكشف الطبي عند طلب طبيب المنشأة، أو رفض اتباع التعليمات الطبية أثناء العلاج.",
        "مخالفة التعليمات الصحية المعلقة بأماكن العمل.",
        "الكتابة على جدران المنشأة، أو لصق إعلانات عليها.",
        "رفض التفتيش الإداري عند الانصراف.",
        "عدم تسليم النقود المحصلة لحساب المنشأة في المواعيد المحددة دون تبرير مقبول.",
        "الامتناع عن ارتداء الملابس، والأجهزة المقررة للوقاية وللسلامة.",
        "تعمد الخلوة مع الجنس الآخر في أماكن العمل.",
        "الإيحاء للآخرين بما يخدش الحياء قولاً، أو فعلاً.",
        "الاعتداء على زملاء العمل بالقول، أو الإشارة، أو باستعمال وسائل الاتصال الالكترونية بالشتم، أو التحقير.",
        "الاعتداء بالإيذاء الجسدي على زملاء العمل، أو على غيرهم بطريقة إباحية.",
        "الاعتداء الجسدي، أو القولي، أو بأي وسيلة من وسائل الاتصال الالكترونية على صاحب العمل، أو المدير المسئول، أو أحد الرؤساء أثناء العمل، أو بسببه.",
        "تقديم بلاغ، أو شكوى كيدية.",
        "عدم الامتثال لطلب لجنة التحقيق بالحضور، أو الإدلاء بالأقوال، أو الشهادة."
    ]
};

const SupervisorPenalties: React.FC = () => {
    const { userName } = useAuth();
    const { t, dir } = useLanguage();
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const users = useFilteredUsers(allUsers);
    const [penalties, setPenalties] = useState<Penalty[]>([]);
    const [selectedEmployee, setSelectedEmployee] = useState('');
    const [penaltyType, setPenaltyType] = useState<'1st Warning' | '2nd Warning' | 'Final Warning' | 'Deduction' | 'Suspension' | 'Dismissal'>('1st Warning');
    const [violationCategory, setViolationCategory] = useState(Object.keys(VIOLATION_CATEGORIES)[0]);
    const [violation, setViolation] = useState(VIOLATION_CATEGORIES[Object.keys(VIOLATION_CATEGORIES)[0] as keyof typeof VIOLATION_CATEGORIES][0]);
    const [selectedPenalty, setSelectedPenalty] = useState<Penalty | null>(null);
    const [isPrintStyleModalOpen, setIsPrintStyleModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    
    const [deductionDays, setDeductionDays] = useState<number | ''>('');
    const [suspensionDays, setSuspensionDays] = useState<number | ''>('');
    const [suspensionFrom, setSuspensionFrom] = useState('');
    const [suspensionTo, setSuspensionTo] = useState('');

    useEffect(() => {
        const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
            const fetchedUsers = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as User));
            setAllUsers(fetchedUsers.filter(u => !['admin', 'supervisor', 'manager'].includes(u.role?.toLowerCase() || '')));
        });
        const unsubscribePenalties = onSnapshot(query(collection(db, 'penalties'), orderBy('createdAt', 'desc')), (snapshot) => {
            setPenalties(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Penalty)));
        });
        return () => { unsubscribeUsers(); unsubscribePenalties(); };
    }, []);

    const handleSendPenalty = async () => {
        if (!selectedEmployee) return alert(t('penalty.errSelectEmployee'));
        const employee = users.find(u => u.id === selectedEmployee);
        
        const penaltyData: any = {
            employeeId: selectedEmployee,
            employeeName: employee?.name || 'Unknown',
            managerId: auth.currentUser?.uid,
            managerName: userName,
            penaltyType,
            description: violation,
            status: 'pending',
            createdAt: serverTimestamp()
        };

        if (penaltyType === 'Deduction') {
            if (!deductionDays) return alert(t('penalty.errDeductionDays'));
            penaltyData.deductionDays = Number(deductionDays);
        } else if (penaltyType === 'Suspension') {
            if (!suspensionDays || !suspensionFrom || !suspensionTo) return alert(t('penalty.errSuspensionDetails'));
            penaltyData.suspensionDays = Number(suspensionDays);
            penaltyData.suspensionFrom = suspensionFrom;
            penaltyData.suspensionTo = suspensionTo;
        }

        const penaltyRef = await addDoc(collection(db, 'penalties'), penaltyData);

        // Sync to actions collection so it also automatically shows in Reports!
        try {
            const todayStr = new Date().toISOString().split('T')[0];
            const actionPayload: any = {
                employeeId: selectedEmployee,
                employeeName: employee?.name || 'Unknown',
                userName: employee?.name || 'Unknown',
                type: 'violation',
                fromDate: suspensionFrom || todayStr,
                toDate: suspensionTo || todayStr,
                description: `[جزاء رسمي] ${violation}`,
                createdAt: serverTimestamp(),
                penaltyId: penaltyRef.id
            };
            const actionRef = await addDoc(collection(db, 'actions'), actionPayload);
            await updateDoc(doc(db, 'penalties', penaltyRef.id), {
                actionId: actionRef.id
            });
        } catch (syncErr) {
            console.warn("Could not sync penalty to actions:", syncErr);
        }

        alert(t('penalty.successSend'));
        
        // Reset form
        setPenaltyType('1st Warning');
        setDeductionDays('');
        setSuspensionDays('');
        setSuspensionFrom('');
        setSuspensionTo('');
    };

    const handleDeletePenalty = async (penaltyId: string) => {
        if (window.confirm(t('penalty.confirmDelete'))) {
            try {
                // 1. Identify penalty before deletion
                const targetPenalty = penalties.find(p => p.id === penaltyId);

                // 2. Delete the penalty document from 'penalties' collection
                // This instantly removes it from the supervisor table, and from UserPenalties & UserDashboard for the employee!
                await deleteDoc(doc(db, 'penalties', penaltyId));

                // 3. Delete linked action from 'actions' collection by actionId
                if (targetPenalty?.actionId) {
                    try {
                        await deleteDoc(doc(db, 'actions', targetPenalty.actionId));
                    } catch (e) {
                        console.warn("Error deleting action by actionId:", e);
                    }
                }

                // 4. Also delete any actions linked via penaltyId == penaltyId
                try {
                    const qActions = query(collection(db, 'actions'), where('penaltyId', '==', penaltyId));
                    const snapActions = await getDocs(qActions);
                    for (const aDoc of snapActions.docs) {
                        await deleteDoc(doc(db, 'actions', aDoc.id));
                    }
                } catch (e) {
                    console.warn("Error deleting actions with matching penaltyId:", e);
                }

                // 5. Fallback: match by employeeId and description
                if (targetPenalty?.employeeId) {
                    try {
                        const qEmpActions = query(collection(db, 'actions'), where('employeeId', '==', targetPenalty.employeeId));
                        const snapEmp = await getDocs(qEmpActions);
                        for (const aDoc of snapEmp.docs) {
                            const aData = aDoc.data();
                            if (aData.penaltyId === penaltyId || aDoc.id === targetPenalty.actionId) {
                                await deleteDoc(doc(db, 'actions', aDoc.id));
                            } else if (aData.description && targetPenalty.description) {
                                const cleanPenaltyDesc = targetPenalty.description.replace(/^\[جزاء رسمي\]\s*/, '').trim();
                                if (cleanPenaltyDesc && (aData.description.includes(cleanPenaltyDesc) || cleanPenaltyDesc.includes(aData.description))) {
                                    await deleteDoc(doc(db, 'actions', aDoc.id));
                                }
                            }
                        }
                    } catch (e) {
                        console.warn("Fallback action delete error:", e);
                    }

                    // 6. Clean notifications for employee
                    try {
                        const qNotif = query(collection(db, 'notifications'), where('userId', '==', targetPenalty.employeeId), where('type', '==', 'penalty'));
                        const snapNotif = await getDocs(qNotif);
                        for (const nDoc of snapNotif.docs) {
                            const nData = nDoc.data();
                            if (targetPenalty.description && nData.message && nData.message.includes(targetPenalty.description.slice(0, 20))) {
                                await deleteDoc(doc(db, 'notifications', nDoc.id));
                            }
                        }
                    } catch (nErr) {
                        console.warn("Notification cleanup error:", nErr);
                    }
                }

                alert(t('penalty.successDelete'));
            } catch (error) {
                console.error("Error deleting penalty: ", error);
                alert(t('penalty.errDelete'));
            }
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto" dir={dir}>
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">{t('penalty.title')}</h1>
                    <p className="text-gray-500 mt-2">{t('penalty.subtitle')}</p>
                </div>
                <div className="bg-red-100 p-3 rounded-full">
                    <i className="fas fa-gavel text-red-600 text-2xl"></i>
                </div>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 mb-8">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-gray-800">
                    <i className="fas fa-plus-circle text-red-500"></i>
                    {t('penalty.send')}
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">{t('penalty.employee')}</label>
                        <select className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all outline-none" value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)}>
                            <option value="">{t('penalty.selectEmployee')}</option>
                            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                    </div>
                    
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">{t('penalty.category')}</label>
                        <select className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all outline-none" value={violationCategory} onChange={(e) => {
                            setViolationCategory(e.target.value);
                            setViolation(VIOLATION_CATEGORIES[e.target.value as keyof typeof VIOLATION_CATEGORIES][0]);
                        }}>
                            {Object.keys(VIOLATION_CATEGORIES).map(cat => {
                                const key = getTranslationKeyForArabic(cat);
                                return <option key={cat} value={cat}>{key ? t(key) : cat}</option>;
                            })}
                        </select>
                    </div>
                </div>

                <div className="mb-6">
                    <label className="block text-sm font-bold text-gray-700 mb-2">{t('penalty.violation')}</label>
                    <select className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all outline-none" value={violation} onChange={(e) => setViolation(e.target.value)}>
                        {VIOLATION_CATEGORIES[violationCategory as keyof typeof VIOLATION_CATEGORIES].map(v => {
                            const key = getTranslationKeyForArabic(v);
                            return <option key={v} value={v}>{key ? t(key) : v}</option>;
                        })}
                    </select>
                </div>

                <div className="mb-6">
                    <label className="block text-sm font-bold text-gray-700 mb-2">{t('penalty.type')}</label>
                    <select className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all outline-none" value={penaltyType} onChange={(e) => setPenaltyType(e.target.value as any)}>
                        <option value="1st Warning">{t('penalty.1stWarning')}</option>
                        <option value="2nd Warning">{t('penalty.2ndWarning')}</option>
                        <option value="Final Warning">{t('penalty.finalWarning')}</option>
                        <option value="Deduction">{t('penalty.deduction')}</option>
                        <option value="Suspension">{t('penalty.suspension')}</option>
                        <option value="Dismissal">{t('penalty.dismissal')}</option>
                    </select>
                </div>

                {penaltyType === 'Deduction' && (
                    <div className="mb-6 animate-fade-in-up">
                        <label className="block text-sm font-bold text-gray-700 mb-2">{t('penalty.deductionDays')}</label>
                        <input type="number" className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all outline-none" value={deductionDays} onChange={(e) => setDeductionDays(e.target.value ? Number(e.target.value) : '')} />
                    </div>
                )}

                {penaltyType === 'Suspension' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6 animate-fade-in-up">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">{t('penalty.suspensionDays')}</label>
                            <input type="number" className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all outline-none" value={suspensionDays} onChange={(e) => setSuspensionDays(e.target.value ? Number(e.target.value) : '')} />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">{t('penalty.fromDate')}</label>
                            <input type="date" className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all outline-none" value={suspensionFrom} onChange={(e) => setSuspensionFrom(e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">{t('penalty.toDate')}</label>
                            <input type="date" className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all outline-none" value={suspensionTo} onChange={(e) => setSuspensionTo(e.target.value)} />
                        </div>
                    </div>
                )}

                <button 
                    className="w-full p-4 bg-red-600 text-white rounded-xl font-bold text-lg hover:bg-red-700 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2" 
                    onClick={handleSendPenalty}
                >
                    <i className="fas fa-paper-plane"></i>
                    {t('penalty.send')}
                </button>
            </div>
            
            <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800">
                        <i className="fas fa-history text-blue-500"></i>
                        {t('penalty.history')}
                        <span className="text-xs font-normal text-gray-400 font-mono">({penalties.length})</span>
                    </h2>
                    
                    {/* Search box by REF #, Name, or Violation */}
                    <div className="relative w-full sm:w-80">
                        <i className="fas fa-search absolute right-3 top-3 text-gray-400 text-xs"></i>
                        <input 
                            type="text" 
                            placeholder={dir === 'rtl' ? 'بحث بالرقم المرجعي (REF #) أو الموظف...' : 'Search by REF # or employee...'} 
                            value={searchTerm} 
                            onChange={e => setSearchTerm(e.target.value)} 
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl pr-9 pl-8 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-100 outline-none"
                        />
                        {searchTerm && (
                            <button onClick={() => setSearchTerm('')} className="absolute left-3 top-2.5 text-xs text-gray-400 hover:text-gray-600">
                                <i className="fas fa-times"></i>
                            </button>
                        )}
                    </div>
                </div>
                
                <div className="space-y-4">
                    {penalties.filter(p => {
                        if (!searchTerm.trim()) return true;
                        const raw = searchTerm.toLowerCase().trim();
                        const clean = raw.replace(/^ref\s*#?|^#/i, '').trim();
                        const empName = (p.employeeName || '').toLowerCase();
                        const desc = (p.description || '').toLowerCase();
                        const pType = (p.penaltyType || '').toLowerCase();
                        const pId = (p.id || '').toLowerCase();
                        const pRef = (p.id ? p.id.slice(-6) : '').toLowerCase();
                        const actId = (p.actionId || '').toLowerCase();
                        const actRef = (p.actionId ? p.actionId.slice(-6) : '').toLowerCase();

                        return empName.includes(raw) ||
                            desc.includes(raw) ||
                            pType.includes(raw) ||
                            (clean ? (pId.includes(clean) || pRef.includes(clean) || actId.includes(clean) || actRef.includes(clean)) : false);
                    }).map(p => {
                        const descKey = getTranslationKeyForArabic(p.description);
                        const refCode = (p.actionId ? p.actionId.slice(-6) : p.id.slice(-6)).toUpperCase();
                        return (
                        <div key={p.id} className="border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow bg-gray-50/50">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-bold">
                                        {p.employeeName.charAt(0)}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="font-bold text-lg text-gray-900">{p.employeeName}</p>
                                            <span className="font-mono text-[11px] font-black text-slate-700 bg-white border border-gray-200 px-2 py-0.5 rounded shadow-xs" title="الرقم المرجعي">
                                                REF #{refCode}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm mt-0.5">
                                            <span className="px-2 py-1 bg-gray-200 text-gray-700 rounded-md font-medium">
                                                {
                                                    p.penaltyType === '1st Warning' ? t('penalty.1stWarning') :
                                                    p.penaltyType === '2nd Warning' ? t('penalty.2ndWarning') :
                                                    p.penaltyType === 'Final Warning' ? t('penalty.finalWarning') :
                                                    p.penaltyType === 'Deduction' ? `${t('penalty.deduction')} (${p.deductionDays} ${t('penalty.days')})` :
                                                    p.penaltyType === 'Suspension' ? `${t('penalty.suspension')} (${p.suspensionDays} ${t('penalty.days')})` :
                                                    p.penaltyType === 'Dismissal' ? t('penalty.dismissal') : p.penaltyType
                                                }
                                            </span>
                                            <span className={`px-2 py-1 rounded-md font-medium ${
                                                p.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                                p.status === 'accepted' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                            }`}>
                                                {
                                                    p.status === 'pending' ? t('penalty.pending') :
                                                    p.status === 'accepted' ? t('penalty.accepted') : t('penalty.rejected')
                                                }
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 w-full md:w-auto">
                                    <button 
                                        className="flex-1 md:flex-none px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 font-medium" 
                                        onClick={() => setSelectedPenalty(p)}
                                    >
                                        <i className="fas fa-print"></i> {t('print')}
                                    </button>
                                    <button 
                                        className="flex-1 md:flex-none px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors flex items-center justify-center gap-2 font-medium" 
                                        onClick={() => handleDeletePenalty(p.id)}
                                    >
                                        <i className="fas fa-trash-alt"></i> {t('delete')}
                                    </button>
                                </div>
                            </div>
                            <div className="bg-white p-4 rounded-lg border border-gray-100">
                                <p className="text-gray-700 leading-relaxed"><i className="fas fa-quote-right text-gray-300 mr-2"></i>{descKey ? t(descKey) : p.description}</p>
                            </div>
                            {p.status === 'rejected' && p.rejectionReason && (
                                <div className="mt-3 bg-red-50 p-3 rounded-lg border border-red-100">
                                    <p className="text-red-700 text-sm font-medium"><span className="font-bold">{t('penalty.reason')}:</span> {p.rejectionReason}</p>
                                </div>
                            )}
                        </div>
                    )})}
                    {penalties.length === 0 && (
                        <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                            <i className="fas fa-folder-open text-4xl text-gray-300 mb-3"></i>
                            <p className="text-gray-500 font-medium">{t('penalty.noPenalties')}</p>
                        </div>
                    )}
                </div>
            </div>
            
            {selectedPenalty && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto relative animate-fade-in-up">
                        <button 
                            className="absolute top-4 right-4 w-10 h-10 bg-gray-100 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-200 transition-colors print:hidden flex items-center justify-center z-10"
                            onClick={() => setSelectedPenalty(null)}
                        >
                            <i className="fas fa-times text-xl"></i>
                        </button>
                        <div className="p-8 print:p-0">
                            <PenaltyPrintable penalty={selectedPenalty} />
                            <div className="mt-8 flex justify-center print:hidden">
                                <button 
                                    className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-md hover:shadow-lg flex items-center gap-2"
                                    onClick={() => setIsPrintStyleModalOpen(true)}
                                >
                                    <i className="fas fa-print text-xl"></i> {t('print')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <PrintStyleModal 
                isOpen={isPrintStyleModalOpen} 
                onClose={() => setIsPrintStyleModalOpen(false)} 
                onConfirm={(style) => {
                    if (selectedPenalty) {
                        printPenaltyDocument(selectedPenalty, style);
                    }
                }} 
            />
        </div>
    );
};

export default SupervisorPenalties;
