
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
// @ts-ignore
import { collection, query, where, getDocs, doc, deleteDoc, getDoc } from 'firebase/firestore';
import { SwapRequest, LeaveRequest, User } from '../../types';
import Toast from '../../components/Toast';
import { useLanguage } from '../../contexts/LanguageContext';
import { useDepartment } from '../../contexts/DepartmentContext';
import { PrintHeader, PrintFooter } from '../../components/PrintLayout';
// @ts-ignore
import { useNavigate } from 'react-router-dom';

interface HistoryItem {
    id: string;
    type: 'swap' | 'leave' | 'absence';
    userId: string; 
    targetId?: string; 
    startDate: string;
    endDate?: string;
    details: string;
    status: string;
    createdAt: any;
}

const SupervisorHistory: React.FC = () => {
    const { t, dir } = useLanguage();
    const navigate = useNavigate();
    const { selectedDepartmentId } = useDepartment();
    const [historyData, setHistoryData] = useState<HistoryItem[]>(() => {
        const cached = localStorage.getItem('usr_cached_sup_hist');
        return cached ? JSON.parse(cached) : [];
    });
    const [users, setUsers] = useState<User[]>(() => {
        const cached = localStorage.getItem('usr_cached_sup_users');
        return cached ? JSON.parse(cached) : [];
    });
    const [histFilterType, setHistFilterType] = useState<'all' | 'swap' | 'leave'>('all');
    const [histFilterMonth, setHistFilterMonth] = useState(new Date().toISOString().slice(0, 7));
    const [toast, setToast] = useState<{msg: string, type: 'success'|'error'} | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    useEffect(() => {
        localStorage.setItem('usr_cached_sup_hist', JSON.stringify(historyData));
    }, [historyData]);

    useEffect(() => {
        localStorage.setItem('usr_cached_sup_users', JSON.stringify(users));
    }, [users]);

    useEffect(() => {
        const withDept = (baseQuery: any) => selectedDepartmentId ? query(baseQuery, where('departmentId', '==', selectedDepartmentId)) : baseQuery;

        const qUsers = withDept(collection(db, 'users'));
        getDocs(qUsers).then(snap => {
            const fetchedUsers = snap.docs.map(d => ({id:d.id, ...(d.data() as any)} as User));
            setUsers(fetchedUsers.filter(u => !['admin', 'supervisor', 'manager'].includes(u.role)));
        });
        
        const qSwaps = withDept(query(collection(db, 'swapRequests'), where('status', 'in', ['approvedBySupervisor', 'rejectedBySupervisor', 'rejected'])));
        getDocs(qSwaps).then(snap => {
            const swaps = snap.docs.map(d => {
                const data = d.data() as any;
                return {
                    id: d.id, type: 'swap', userId: data.from, targetId: data.to, startDate: data.startDate, details: data.details, status: data.status, createdAt: data.createdAt
                } as HistoryItem;
            });
            setHistoryData(prev => [...prev.filter(i => i.type !== 'swap'), ...swaps]);
        });

        const qLeaves = withDept(query(collection(db, 'leaveRequests'), where('status', 'in', ['approved', 'rejected', 'pending_manager', 'pending_supervisor', 'approvedBySupervisor'])));
        getDocs(qLeaves).then(snap => {
            const leaves = snap.docs.map(d => {
                const data = d.data() as any;
                return {
                    id: d.id, type: 'leave', userId: data.from, startDate: data.startDate, endDate: data.endDate, details: data.reason, status: data.status, createdAt: data.createdAt
                } as HistoryItem;
            });
            setHistoryData(prev => [...prev.filter(i => i.type !== 'leave'), ...leaves]);
        });

        const qAbsences = withDept(query(collection(db, 'actions'), where('type', '==', 'unjustified_absence')));
        getDocs(qAbsences).then(snap => {
            const absences = snap.docs.map(d => {
                const data = d.data() as any;
                return {
                    id: d.id, type: 'absence', userId: data.employeeId, startDate: data.fromDate, details: data.description, status: 'confirmed', createdAt: data.createdAt
                } as HistoryItem;
            });
            setHistoryData(prev => [...prev.filter(i => i.type !== 'absence'), ...absences]);
        });
    }, [refreshTrigger, selectedDepartmentId]);

    const getUserName = (id: string) => users.find(u => u.id === id)?.name || id;

    const handleDelete = async (item: HistoryItem) => {
        if(!confirm('Delete record?')) return;
        try {
            let collectionName = 'leaveRequests';
            if (item.type === 'swap') collectionName = 'swapRequests';
            else if (item.type === 'absence') collectionName = 'actions';
            
            await deleteDoc(doc(db, collectionName, item.id));
            setHistoryData(prev => prev.filter(i => i.id !== item.id));
            setToast({ msg: 'Deleted', type: 'success' });
        } catch(e) { setToast({ msg: 'Error', type: 'error' }); }
    };

    const filteredData = useMemo(() => {
        return historyData.filter(item => {
            if (histFilterType !== 'all' && item.type !== histFilterType) return false;
            if (histFilterMonth && !item.startDate?.startsWith(histFilterMonth)) return false;
            return true;
        }).sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    }, [historyData, histFilterType, histFilterMonth]);

    return (
        <div className="max-w-6xl mx-auto px-4 py-8 animate-fade-in print:p-0 print:max-w-none" dir={dir}>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            
            <PrintHeader title="Request History Report" month={histFilterMonth} subtitle="Processed Requests" themeColor="indigo" />

            <div className="flex items-center gap-4 mb-8 print:hidden">
                <button onClick={() => navigate('/supervisor')} className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-300 transition-colors">
                    <i className="fas fa-arrow-left rtl:rotate-180"></i>
                </button>
                <h1 className="text-2xl font-black text-slate-800">Request History</h1>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden print:border-2 print:border-slate-800 print:shadow-none print:rounded-none">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap gap-4 items-center print:hidden">
                    <select className="bg-white border-none rounded-lg text-xs font-bold p-2" value={histFilterType} onChange={e => setHistFilterType(e.target.value as any)}>
                        <option value="all">All Types</option>
                        <option value="swap">Swaps</option>
                        <option value="leave">Leaves</option>
                        <option value="absence">Absences</option>
                    </select>
                    <input type="month" className="bg-white border-none rounded-lg text-xs font-bold p-2" value={histFilterMonth} onChange={e => setHistFilterMonth(e.target.value)} />
                    <button onClick={() => window.print()} className="ml-auto bg-slate-800 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-700 flex items-center gap-2">
                        <i className="fas fa-print"></i> Print Report
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-100 text-slate-500 text-xs uppercase font-bold print:bg-white print:border-b-2 print:border-slate-800 print:text-black">
                            <tr>
                                <th className="p-4 print:p-2">Type</th>
                                <th className="p-4 print:p-2">User</th>
                                <th className="p-4 print:p-2">Details</th>
                                <th className="p-4 print:p-2">Date</th>
                                <th className="p-4 print:p-2">Status</th>
                                <th className="p-4 w-10 print:hidden"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 print:divide-slate-300">
                            {filteredData.map(item => (
                                <tr key={item.id} data-id={item.id} className="hover:bg-slate-50 print:break-inside-avoid">
                                    <td className="p-4 print:p-2">
                                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase border ${item.type === 'swap' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : item.type === 'leave' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-amber-50 text-amber-600 border-amber-100'} print:border-0 print:bg-transparent print:text-black print:p-0`}>
                                            {item.type}
                                        </span>
                                    </td>
                                    <td className="p-4 font-bold text-slate-700 print:p-2 print:text-black">{getUserName(item.userId)}</td>
                                    <td className="p-4 text-slate-600 text-xs print:p-2 print:text-black">{item.details} {item.type === 'swap' && `→ ${getUserName(item.targetId!)}`}</td>
                                    <td className="p-4 font-mono text-xs text-slate-500 print:p-2 print:text-black">{item.startDate} {item.endDate ? `- ${item.endDate}` : ''}</td>
                                    <td className="p-4 print:p-2">
                                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${item.status.includes('approved') ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'} print:bg-transparent print:text-black print:border print:border-black`}>
                                            {item.status.replace(/BySupervisor|ByUser/, '')}
                                        </span>
                                    </td>
                                    <td className="p-4 text-center print:hidden flex gap-2">
                                        <button onClick={async () => {
                                            const printWindow = window.open('', '_blank');
                                            if (!printWindow) return;

                                            printWindow.document.write('<html><body><div style="text-align: center; margin-top: 50px; font-family: sans-serif;">Loading document...</div></body></html>');

                                            // Determine which collection to fetch from
                                            let collectionName = '';
                                            if (item.type === 'swap') collectionName = 'swapRequests';
                                            else if (item.type === 'leave') collectionName = 'leaveRequests';
                                            else if (item.type === 'absence') collectionName = 'actions';

                                            let fullData: any = {};
                                            if (collectionName) {
                                                const docRef = doc(db, collectionName, item.id);
                                                const docSnap = await getDoc(docRef);
                                                if (docSnap.exists()) {
                                                    fullData = docSnap.data();
                                                }
                                            }

                                            // Setup details
                                            const userNameStr = getUserName(item.userId);
                                            // Get User Job (best effort from state)
                                            const uStateObj = users.find(u => u.id === item.userId);
                                            
                                            // Fetch department name
                                            let departmentName = '...';
                                            if (uStateObj?.departmentId) {
                                                const deptDoc = await getDoc(doc(db, 'departments', uStateObj.departmentId));
                                                if (deptDoc.exists()) departmentName = deptDoc.data().name;
                                            }

                                            // Basic Job Title Helper
                                            const getJobTitle = (uData: any) => {
                                                const JOB_CATEGORIES = [
                                                    { id: 'doctor', title: 'Doctors' },
                                                    { id: 'technologist', title: 'Specialists' },
                                                    { id: 'usg', title: 'Ultrasound' },
                                                    { id: 'technician', title: 'Technicians' },
                                                    { id: 'nurse', title: 'Nurses' },
                                                    { id: 'rso', title: 'R S O' },
                                                ];
                                                const jobCat = JOB_CATEGORIES.find(c => c.id === uData?.jobCategory);
                                                return jobCat ? jobCat.title : (uData?.section || uData?.role || uData?.jobCategory || '-');
                                            };

                                            const userJobPosition = getJobTitle(uStateObj);

                                            const renderStamp = (name: string, jobTitle: string = 'Staff', hospital: string = 'AL JEDAANI HOSPITAL', approved: boolean = true) => {
                                                const rotation = (-3 - Math.random() * 5).toFixed(1); // Upward tilt between -3 and -8
                                                return `
                                                    <div class="stamp-box" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(${rotation}deg); z-index: 50; pointer-events: none; ${!approved ? 'border-color: red; color: red;' : ''}">
                                                        <div class="stamp-inner" style="${!approved ? 'border-color: red;' : ''}">
                                                            <div class="stamp-hospital">${hospital.toUpperCase()}</div>
                                                            <div class="stamp-hospital" style="font-size: 9px; border-top: 1px dashed ${!approved ? 'red' : 'rgba(30, 58, 138, 0.4)'}; margin-top: 1px; padding-top: 1px;">${departmentName.toUpperCase()}</div>
                                                            <div class="stamp-dept" style="${!approved ? 'color: red;' : ''}">${jobTitle}</div>
                                                            <div class="stamp-name">${name}</div>
                                                            <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; color: ${approved ? '#006000' : 'red'}; opacity: 0.15; transform: rotate(-10deg);">
                                                                ${approved ? 'APPROVED' : 'NOT APPROVED'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                `;
                                            };
                                            
                                            const isApproved = item.status === 'confirmed' || item.status.toLowerCase().includes('approved');

                                            // Extract actual approvals
                                            // For Swaps: targetId represents reliever. Reliever approval state is item.status === 'approvedByUser' or higher
                                            let relieverName = item.targetId ? getUserName(item.targetId) : '-';
                                            let relieverJob = 'Reliever';
                                            let relieverApproved = true; // For swaps, typically approved by reliever if it reached supervisor
                                            
                                            // Extract reliever details using fullData
                                            let relieversDataList: {name: string, job: string, approved: boolean}[] = [];
                                            
                                            if (item.type === 'leave') {
                                                const relieversList = fullData.relieverIds || [];
                                                if (relieversList.length > 0) {
                                                    for (const rId of relieversList) {
                                                        const rName = getUserName(rId);
                                                        let rJob = 'Reliever';
                                                        const rStateObj = users.find(u => u.id === rId);
                                                        if (rStateObj) rJob = getJobTitle(rStateObj);
                                                        
                                                        let rApproved = false;
                                                        if (fullData.relieverApprovals && fullData.relieverApprovals[rId]) {
                                                            rApproved = fullData.relieverApprovals[rId].approved;
                                                        }
                                                        relieversDataList.push({ name: rName, job: rJob, approved: rApproved });
                                                    }
                                                }
                                            } else if (item.type === 'swap' && item.targetId) {
                                                const rStateObj = users.find(u => u.id === item.targetId);
                                                if (rStateObj) relieverJob = getJobTitle(rStateObj);
                                                // If supervisor reviewed it, reliever definitely approved it
                                                relieverApproved = Boolean(fullData.status && fullData.status !== 'pending'); 
                                            }

                                            // Extract Supervisor
                                            let supName = 'Supervisor';
                                            let supJob = 'Manager/Supervisor';
                                            let supApproved = isApproved;
                                            if (fullData.supervisorApproval) {
                                                supName = fullData.supervisorApproval.name || supName;
                                                // If we have actual supervisor uid, fetch job (or use general)
                                                // It's mostly fine to just use the name we stored
                                                supApproved = fullData.supervisorApproval.approved;
                                            } else if (fullData.rejectedBySupervisor) {
                                                supApproved = false;
                                            }

                                            // Extract Manager (for leaves)
                                            let manName = 'Head of Dept';
                                            let manApproved = fullData.status === 'approved';
                                            let manRejected = fullData.status === 'rejected';
                                            let managerJob = 'Head of Dept';
                                            if (fullData.managerApproval) {
                                                manName = fullData.managerApproval.name || manName;
                                            }

                                            let titleEn = '';
                                            let titleAr = '';
                                            if (item.type === 'swap') { titleEn = 'SWAP REQUEST'; titleAr = 'طلب تبديل'; }
                                            else if (item.type === 'leave') { titleEn = 'LEAVE REQUEST'; titleAr = 'طلب إجازة'; }
                                            else { titleEn = 'ABSENCE RECORD'; titleAr = 'سجل غياب'; }

                                            const logoUrl = new URL('/logo.png', window.location.origin).href;

                                            let printContent = '';
                                            if (item.type === 'leave' || item.type === 'absence') {
                                                printContent = `
                                                    <!DOCTYPE html>
                                                    <html lang="en">
                                                    <head>
                                                        <meta charset="UTF-8">
                                                        <title>${titleEn} - ${userNameStr}</title>
                                                        <style>
                                                            @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&family=Inter:wght@400;700&display=swap');
                                                            @page { size: A4; margin: 10mm; }
                                                            body { font-family: 'Inter', 'Cairo', sans-serif; margin: 0; padding: 0; color: #1e3a8a; background: #fff; font-size: 12px; }
                                                            .print-container { width: 100%; max-width: 100%; margin: 0 auto; border: 1px solid #1e3a8a; padding: 15px; box-sizing: border-box; }
                                                            .header-section { text-align: center; margin-bottom: 10px; }
                                                            .title-box { display: inline-block; border: 2px solid #1e3a8a; background: rgba(30, 58, 138, 0.05); border-radius: 12px; padding: 5px 30px; text-align: center; }
                                                            .title-ar { font-size: 20px; font-weight: bold; margin-bottom: 2px; }
                                                            .title-en { font-size: 14px; font-weight: bold; text-transform: uppercase; }
                                                            .date-line { text-align: left; margin-bottom: 5px; font-weight: bold; }
                                                            table { width: 100%; border-collapse: collapse; }
                                                            td { border: 1px solid #1e3a8a; padding: 4px 8px; vertical-align: middle; }
                                                            .label-en { width: 25%; text-align: left; font-weight: bold; }
                                                            .label-ar { width: 25%; text-align: right; font-weight: bold; font-family: 'Cairo', sans-serif; }
                                                            .value { width: 50%; text-align: center; font-weight: bold; font-size: 13px; }
                                                            .section-header { background: rgba(30, 58, 138, 0.05); font-weight: bold; color: #1e3a8a; }
                                                            .section-header td { padding: 2px 0; }
                                                            .section-title-flex { display: flex; justify-content: space-between; align-items: center; padding: 0 15px; font-size: 14px; }
                                                            .checkbox-container { display: flex; align-items: center; gap: 8px; }
                                                            .checkbox { width: 14px; height: 14px; border: 1.5px solid #1e3a8a; display: inline-block; position: relative; }
                                                            .checkbox.checked::after { content: '✓'; position: absolute; top: -5px; left: 1px; font-size: 18px; font-weight: bold; color: #1e3a8a; }
                                                            .stamp-box { border: 3px solid #1e3a8a; border-radius: 6px; padding: 4px; display: inline-block; color: #1e3a8a; text-align: center; font-family: 'Courier New', Courier, monospace; font-weight: bold; line-height: 1.1; background: transparent; margin: 2px auto; width: 140px; height: 85px; position: relative; text-transform: uppercase; box-sizing: border-box; overflow: hidden; }
                                                            .stamp-inner { border: 1px solid rgba(30, 58, 138, 0.5); padding: 2px; border-radius: 3px; height: 100%; display: flex; flex-direction: column; justify-content: center; box-sizing: border-box; }
                                                            .stamp-hospital { font-size: 8px; letter-spacing: 0.2px; margin-bottom: 1px; border-bottom: 1px dashed rgba(30, 58, 138, 0.4); padding-bottom: 2px; }
                                                            .stamp-dept { font-size: 9px; margin-bottom: 2px; color: #1e3a8a; }
                                                            .stamp-name { font-size: 11px; line-height: 1.2; }
                                                            @media print { .print-container { border: 1px solid #1e3a8a; } }
                                                            .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); opacity: 0.10; width: 100%; max-width: 900px; z-index: -1; pointer-events: none; }
                                                        </style>
                                                    </head>
                                                    <body>
                                                        <img src="${logoUrl}" class="watermark" alt="Watermark" crossorigin="anonymous" />
                                                        <div class="print-container">
                                                            <div class="header-section" style="display: flex; align-items: center; justify-content: space-between;">
                                                                <div style="display: flex; align-items: center; gap: 15px;">
                                 <img src="${logoUrl}" alt="Logo" style="max-height: 80px;" crossOrigin="anonymous" />
                                 <div style="display: flex; flex-direction: column; text-align: left;">
                                     <span style="font-weight: bold; font-size: 15px; color: #1e3a8a; letter-spacing: 1px;">AL JEDAANI HOSPITAL</span>
                                     <span style="font-weight: bold; font-size: 8px; color: #1e3a8a; letter-spacing: 1px;">AL SAFA DISTRICT</span>
                                     <span style="font-weight: bold; font-size: 15px; font-family: 'Cairo', sans-serif; color: #1e3a8a; margin-top: -5px;">مستشفى الجدعاني</span>
                                     <span style="font-weight: bold; font-size: 8px; font-family: 'Cairo', sans-serif; color: #1e3a8a; margin-top: -3px;">حي الصفــــا</span>
                                 </div>
                             </div>
                                                                <div class="title-box">
                                                                    <div class="title-ar">${titleAr}</div>
                                                                    <div class="title-en">${titleEn}</div>
                                                                </div>
                                                            </div>
                                                            <div class="date-line">Date: ${item.startDate}</div>
                                                            <table>
                                                                <tr>
                                                                    <td class="label-en">Name:</td>
                                                                    <td class="value">${userNameStr}</td>
                                                                    <td class="label-ar">الاسم:</td>
                                                                </tr>
                                                                <tr>
                                                                    <td class="label-en">Position:</td>
                                                                    <td class="value">${userJobPosition}</td>
                                                                    <td class="label-ar">الوظيفة:</td>
                                                                </tr>
                                                                <tr>
                                                                    <td class="label-en">Department:</td>
                                                                    <td class="value">${departmentName}</td>
                                                                    <td class="label-ar">القسم:</td>
                                                                </tr>
                                                                <tr>
                                                                    <td class="label-en">Type of Leave:</td>
                                                                    <td class="value">${fullData.typeOfLeave || item.type || '-'}</td>
                                                                    <td class="label-ar">نوع الاجازة:</td>
                                                                </tr>
                                                                <tr>
                                                                    <td class="label-en">Duration of Leave:</td>
                                                                    <td class="value">${fullData.duration || '-'}</td>
                                                                    <td class="label-ar">مدة الاجازة:</td>
                                                                </tr>
                                                                <tr>
                                                                    <td class="label-en">From:</td>
                                                                    <td class="value">${item.startDate}</td>
                                                                    <td class="label-ar">من تاريخ:</td>
                                                                </tr>
                                                                <tr>
                                                                    <td class="label-en">To:</td>
                                                                    <td class="value">${item.endDate || '-'}</td>
                                                                    <td class="label-ar">حتي تاريخ:</td>
                                                                </tr>
                                                                <tr>
                                                                    <td class="label-en">Signature:</td>
                                                                    <td class="value" style="position: relative; height: 20px;">
                                                                        <div style="font-size: 11px; margin-bottom: 2px;">${userNameStr}</div>
                                                                        ${renderStamp(userNameStr, userJobPosition, 'AL JEDAANI HOSPITAL')}
                                                                    </td>
                                                                    <td class="label-ar">التوقيع :</td>
                                                                </tr>
                                                                <tr class="section-header">
                                                                    <td colspan="3">
                                                                        <div class="section-title-flex">
                                                                            <span>AUTHORIZATION</span>
                                                                            <span>المصدقة</span>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                                <tr>
                                                                    <td colspan="3">
                                                                        <div style="display: flex; justify-content: space-between; padding: 0 30px;">
                                                                            <div class="checkbox-container">
                                                                                <div class="checkbox ${isApproved ? 'checked' : ''}"></div>
                                                                                <span>Approved</span>
                                                                            </div>
                                                                            <div class="checkbox-container">
                                                                                <span>موافق</span>
                                                                                <div class="checkbox ${isApproved ? 'checked' : ''}"></div>
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                                ${item.type === 'leave' && relieversDataList.length > 0 ? `
                                                                    <tr>
                                                                        <td class="label-en">Reliever:</td>
                                                                        <td class="value">${relieversDataList.map(r => r.name).join(', ')}</td>
                                                                        <td class="label-ar">الاسم البديل:</td>
                                                                    </tr>
                                                                    <tr>
                                                                        <td colspan="3" style="text-align: center; padding: 1px 2px;">
                                                                            <div style="display: flex; justify-content: space-between; font-weight: bold; margin-bottom: 2px;">
                                                                                <span>Signature of Reliever:</span>
                                                                                <span style="font-family: 'Cairo', sans-serif;">توقيع البديل:</span>
                                                                            </div>
                                                                            <div style="height: 10px; display: flex; align-items: center; justify-content: center; gap: 30px; width: 100%; position: relative;">
                                                                                ${relieversDataList.map((r, idx) => r.approved ? `<div style="position: relative; width: 120px; height: 10px;">${renderStamp(r.name, r.job, 'AL JEDAANI HOSPITAL')}</div>` : '').join('')}
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                ` : `
                                                                    <tr>
                                                                        <td class="label-en">Reliever:</td>
                                                                        <td class="value">${relieverName}</td>
                                                                        <td class="label-ar">الاسم البديل:</td>
                                                                    </tr>
                                                                    <tr>
                                                                        <td colspan="3" style="text-align: center; padding: 1px 2px;">
                                                                            <div style="display: flex; justify-content: space-between; font-weight: bold; margin-bottom: 2px;">
                                                                                <span>Signature of Reliever:</span>
                                                                                <span style="font-family: 'Cairo', sans-serif;">توقيع البديل:</span>
                                                                            </div>
                                                                            <div style="position: relative; height: 10px; width: 100%; display: flex; align-items: center; justify-content: center;">
                                                                                <div style="position: relative; width: 120px; height: 10px;">
                                                                                    ${item.targetId && relieverApproved ? renderStamp(relieverName, relieverJob, 'AL JEDAANI HOSPITAL') : ''}
                                                                                </div>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                `}
                                                                <tr>
                                                                    <td class="label-en">Supervisor :</td>
                                                                    <td class="value"></td>
                                                                    <td class="label-ar">المشرف:</td>
                                                                </tr>
                                                                <tr>
                                                                    <td colspan="3">
                                                                        <div style="display: flex; justify-content: space-between; padding: 0 30px; font-weight: bold;">
                                                                            ${supApproved ? `
                                                                                <div class="checkbox-container"><div class="checkbox checked"></div><span>Approved</span></div>
                                                                                <div class="checkbox-container"><span>موافق</span><div class="checkbox checked"></div></div>
                                                                            ` : `
                                                                                <div class="checkbox-container"><div class="checkbox ${!supApproved && fullData.status !== 'pending' ? 'checked' : ''}"></div><span>Disapproved</span></div>
                                                                                <div class="checkbox-container"><span>غير موافق</span><div class="checkbox ${!supApproved && fullData.status !== 'pending' ? 'checked' : ''}"></div></div>
                                                                            `}
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                                <tr>
                                                                    <td class="label-en">Signature, Supervisor:</td>
                                                                    <td class="value" style="position: relative; height: 30px; display: flex; align-items: center; gap: 10px; justify-content: center;">
                                                                        ${supApproved ? renderStamp(supName, supJob, 'AL JEDAANI HOSPITAL') : ''}
                                                                        <span style="font-weight: bold; position: relative; z-index: 60;">${supName !== 'Supervisor' ? supName : ''}</span>
                                                                    </td>
                                                                    <td class="label-ar">توقيع المشرف:</td>
                                                                </tr>
                                                                <tr>
                                                                    <td class="label-en">Date:</td>
                                                                    <td class="value">${fullData.managerApproval?.timestamp ? new Date(fullData.managerApproval.timestamp.seconds * 1000).toLocaleDateString() : '-'}</td>
                                                                    <td class="label-ar">التاريخ:</td>
                                                                </tr>
                                                                <tr>
                                                                    <td class="label-en">Head of Dept :</td>
                                                                    <td class="value"></td>
                                                                    <td class="label-ar"> رئيس القسم:</td>
                                                                </tr>
                                                                <tr>
                                                                    <td colspan="3">
                                                                        <div style="display: flex; justify-content: space-between; padding: 0 30px; font-weight: bold;">
                                                                            <div class="checkbox-container"><div class="checkbox ${manApproved ? 'checked' : ''}"></div><span>Approved</span></div>
                                                                            <div class="checkbox-container"><span>موافق</span><div class="checkbox ${manApproved ? 'checked' : ''}"></div></div>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                                <tr>
                                                                    <td class="label-en">Reason:</td>
                                                                    <td class="value">${item.status === 'rejected' || manRejected ? (fullData.managerApproval?.comment || fullData.supervisorApproval?.comment || item.details) : '-'}</td>
                                                                    <td class="label-ar">السبب :</td>
                                                                </tr>
                                                                <tr>
                                                                    <td class="label-en">Signature, Head of Department:</td>
                                                                    <td class="value" style="position: relative; height: 30px; display: flex; align-items: center; justify-content: center;">
                                                                        ${manApproved ? renderStamp(manName, managerJob, 'AL JEDAANI HOSPITAL') : ''}
                                                                        <span style="font-weight: bold; position: relative; z-index: 60;">${manName !== 'Head of Dept' ? manName : ''}</span>
                                                                    </td>
                                                                    <td class="label-ar">توقيع رئيس القسم :</td>
                                                                </tr>
                                                                <tr class="section-header">
                                                                    <td colspan="3">
                                                                        <div class="section-title-flex">
                                                                            <span>PERSONNEL DEPARTMENT</span>
                                                                            <span>شئون الموظفين</span>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                                <tr>
                                                                    <td class="label-en">Date Hired:</td>
                                                                    <td class="value">-</td>
                                                                    <td class="label-ar">تاريخ الإلتحاق:</td>
                                                                </tr>
                                                                <tr>
                                                                    <td class="label-en">Due Date For Leave:</td>
                                                                    <td class="value">-</td>
                                                                    <td class="label-ar">الإجازة المستحقة:</td>
                                                                </tr>
                                                                <tr>
                                                                    <td class="label-en">Personnel Department Manager:</td>
                                                                    <td class="value"></td>
                                                                    <td class="label-ar">مدير شئون الموظفين :</td>
                                                                </tr>

                                                                <tr class="section-header">
                                                                    <td colspan="3">
                                                                        <div class="section-title-flex">
                                                                            <span>GENERAL MANAGER (</span>
                                                                            <span>المدير العــــام (</span>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                                <tr>
                                                                    <td colspan="3" style="height: 70px; text-align: center; position: relative;">
                                                                        
                                                                    </td>
                                                                </tr>
                                                            </table>
                                                        </div>
                                                    </body>
                                                    </html>
                                                `;
                                            } else {
                                                printContent = `
                                                    <!DOCTYPE html>
                                                    <html lang="en">
                                                    <head>
                                                        <meta charset="UTF-8">
                                                        <title>${titleEn} - ${userNameStr}</title>
                                                        <style>
                                                            @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&family=Inter:wght@400;700&display=swap');
                                                            @page { size: A4; margin: 10mm; }
                                                            body { font-family: 'Inter', 'Cairo', sans-serif; margin: 0; padding: 0; color: #1e3a8a; background: #fff; font-size: 12px; }
                                                            .print-container { width: 100%; max-width: 100%; margin: 0 auto; border: 1px solid #1e3a8a; padding: 15px; box-sizing: border-box; }
                                                            .header-section { text-align: center; margin-bottom: 10px; }
                                                            .title-box { display: inline-block; border: 2px solid #1e3a8a; background: rgba(30, 58, 138, 0.05); border-radius: 12px; padding: 5px 30px; text-align: center; }
                                                            .title-ar { font-size: 20px; font-weight: bold; margin-bottom: 2px; }
                                                            .title-en { font-size: 14px; font-weight: bold; text-transform: uppercase; }
                                                            .date-line { text-align: left; margin-bottom: 5px; font-weight: bold; }
                                                            table { width: 100%; border-collapse: collapse; }
                                                            td { border: 1px solid #1e3a8a; padding: 4px 8px; vertical-align: middle; }
                                                            .label-en { width: 25%; text-align: left; font-weight: bold; }
                                                            .label-ar { width: 25%; text-align: right; font-weight: bold; font-family: 'Cairo', sans-serif; }
                                                            .value { width: 50%; text-align: center; font-weight: bold; font-size: 13px; }
                                                            .section-header { background: rgba(30, 58, 138, 0.05); font-weight: bold; color: #1e3a8a; }
                                                            .section-header td { padding: 2px 0; }
                                                            .section-title-flex { display: flex; justify-content: space-between; align-items: center; padding: 0 15px; font-size: 14px; }
                                                            .checkbox-container { display: flex; align-items: center; gap: 8px; }
                                                            .checkbox { width: 14px; height: 14px; border: 1.5px solid #1e3a8a; display: inline-block; position: relative; }
                                                            .checkbox.checked::after { content: '✓'; position: absolute; top: -5px; left: 1px; font-size: 18px; font-weight: bold; color: #1e3a8a; }
                                                            .stamp-box { border: 3px solid #1e3a8a; border-radius: 6px; padding: 4px; display: inline-block; color: #1e3a8a; text-align: center; font-family: 'Courier New', Courier, monospace; font-weight: bold; line-height: 1.1; background: transparent; margin: 2px auto; width: 140px; height: 85px; position: relative; text-transform: uppercase; box-sizing: border-box; overflow: hidden; }
                                                            .stamp-inner { border: 1px solid rgba(30, 58, 138, 0.5); padding: 2px; border-radius: 3px; height: 100%; display: flex; flex-direction: column; justify-content: center; box-sizing: border-box; }
                                                            .stamp-hospital { font-size: 8px; letter-spacing: 0.2px; margin-bottom: 1px; border-bottom: 1px dashed rgba(30, 58, 138, 0.4); padding-bottom: 2px; }
                                                            .stamp-dept { font-size: 9px; margin-bottom: 2px; color: #1e3a8a; }
                                                            .stamp-name { font-size: 11px; line-height: 1.2; }
                                                            @media print { .print-container { border: 1px solid #1e3a8a; } }
                                                            .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); opacity: 0.10; width: 100%; max-width: 900px; z-index: -1; pointer-events: none; }
                                                        </style>
                                                    </head>
                                                    <body>
                                                        <img src="${logoUrl}" class="watermark" alt="Watermark" crossorigin="anonymous" />
                                                        <div class="print-container">
                                                            <div class="header-section" style="display: flex; align-items: center; justify-content: space-between;">
                                                                <div style="display: flex; align-items: center; gap: 15px;">
                                 <img src="${logoUrl}" alt="Logo" style="max-height: 80px;" crossOrigin="anonymous" />
                                 <div style="display: flex; flex-direction: column; text-align: left;">
                                     <span style="font-weight: bold; font-size: 15px; color: #1e3a8a; letter-spacing: 1px;">AL JEDAANI HOSPITAL</span>
                                     <span style="font-weight: bold; font-size: 8px; color: #1e3a8a; letter-spacing: 1px;">AL SAFA DISTRICT</span>
                                     <span style="font-weight: bold; font-size: 15px; font-family: 'Cairo', sans-serif; color: #1e3a8a; margin-top: -5px;">مستشفى الجدعاني</span>
                                     <span style="font-weight: bold; font-size: 8px; font-family: 'Cairo', sans-serif; color: #1e3a8a; margin-top: -3px;">حي الصفــــا</span>
                                 </div>
                             </div>
                                                                <div class="title-box">
                                                                    <div class="title-ar">${titleAr}</div>
                                                                    <div class="title-en">${titleEn}</div>
                                                                </div>
                                                            </div>
                                                            <div class="date-line">Date: ${item.startDate}</div>
                                                            <table>
                                                                <tr>
                                                                    <td class="label-en">Name:</td>
                                                                    <td class="value">${userNameStr}</td>
                                                                    <td class="label-ar">الاسم:</td>
                                                                </tr>
                                                                <tr>
                                                                    <td class="label-en">Position:</td>
                                                                    <td class="value">${userJobPosition}</td>
                                                                    <td class="label-ar">الوظيفة:</td>
                                                                </tr>
                                                                <tr>
                                                                    <td class="label-en">Department:</td>
                                                                    <td class="value">${departmentName}</td>
                                                                    <td class="label-ar">القسم:</td>
                                                                </tr>
                                                                <tr>
                                                                    <td class="label-en">Type:</td>
                                                                    <td class="value">${item.type}</td>
                                                                    <td class="label-ar">النوع:</td>
                                                                </tr>
                                                                <tr>
                                                                    <td class="label-en">Details:</td>
                                                                    <td class="value">${item.details} 
                                                                        ${item.type === 'swap' ? ` → ${getUserName(item.targetId!)}` : ''}
                                                                    </td>
                                                                    <td class="label-ar">التفاصيل:</td>
                                                                </tr>
                                                                <tr>
                                                                    <td class="label-en">From:</td>
                                                                    <td class="value">${item.startDate}</td>
                                                                    <td class="label-ar">من تاريخ:</td>
                                                                </tr>
                                                                <tr>
                                                                    <td class="label-en">To:</td>
                                                                    <td class="value">${item.endDate || '-'}</td>
                                                                    <td class="label-ar">حتي تاريخ:</td>
                                                                </tr>
                                                                <tr>
                                                                    <td class="label-en">Signature:</td>
                                                                    <td class="value" style="position: relative; height: 60px;">
                                                                        ${item.type === 'swap' || item.type === 'leave' || item.type === 'absence' ? `
                                                                            <div style="font-size: 11px; margin-bottom: 2px;">${userNameStr}</div>
                                                                            ${renderStamp(userNameStr, userJobPosition, 'AL JEDAANI HOSPITAL')}
                                                                        ` : ''}
                                                                    </td>
                                                                    <td class="label-ar">التوقيع :</td>
                                                                </tr>
                                                                <tr class="section-header">
                                                                    <td colspan="3">
                                                                        <div class="section-title-flex">
                                                                            <span>AUTHORIZATION</span>
                                                                            <span>المصدقة</span>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                                ${item.type === 'swap' && item.targetId ? `
                                                                <tr>
                                                                    <td class="label-en">Reliever:</td>
                                                                    <td class="value">${getUserName(item.targetId)}</td>
                                                                    <td class="label-ar">الاسم البديل:</td>
                                                                </tr>
                                                                <tr>
                                                                    <td class="label-en">Signature of Reliever:</td>
                                                                    <td class="value" style="position: relative; height: 60px;">
                                                                        ${isApproved ? renderStamp(getUserName(item.targetId), 'Reliever', 'AL JEDAANI HOSPITAL') : ''}
                                                                    </td>
                                                                    <td class="label-ar">توقيع البديل:</td>
                                                                </tr>
                                                                ` : ''}
                                                                <tr>
                                                                    <td class="label-en">Supervisor :</td>
                                                                    <td class="value"></td>
                                                                    <td class="label-ar">المشرف:</td>
                                                                </tr>
                                                                <tr>
                                                                    <td colspan="3">
                                                                        <div style="display: flex; justify-content: space-between; padding: 0 30px; font-weight: bold;">
                                                                            ${isApproved ? `
                                                                                <div class="checkbox-container"><div class="checkbox checked"></div><span>Approved</span></div>
                                                                                <div class="checkbox-container"><span>موافق</span><div class="checkbox checked"></div></div>
                                                                            ` : `
                                                                                <div class="checkbox-container"><div class="checkbox ${!isApproved ? 'checked' : ''}"></div><span>Disapproved</span></div>
                                                                                <div class="checkbox-container"><span>غير موافق</span><div class="checkbox ${!isApproved ? 'checked' : ''}"></div></div>
                                                                            `}
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                                <tr>
                                                                    <td class="label-en">Signature, Supervisor:</td>
                                                                    <td class="value" style="position: relative; height: 60px;">
                                                                        ${isApproved ? renderStamp('System Verified', 'Manager/Supervisor', 'AL JEDAANI HOSPITAL') : ''}
                                                                    </td>
                                                                    <td class="label-ar">توقيع المشرف :</td>
                                                                </tr>
                                                            </table>
                                                        </div>
                                                    </body>
                                                    </html>
                                                `;
                                            }
                                            
                                            printWindow.document.open();
                                            printWindow.document.write(printContent);
                                            printWindow.document.close();
                                            setTimeout(() => {
                                                printWindow.focus();
                                                printWindow.print();
                                            }, 500);
                                        }} className="text-slate-300 hover:text-indigo-500"><i className="fas fa-print"></i></button>
                                        <button onClick={() => handleDelete(item)} className="text-slate-300 hover:text-red-500"><i className="fas fa-trash"></i></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <PrintFooter themeColor="indigo" />
        </div>
    );
};

export default SupervisorHistory;
