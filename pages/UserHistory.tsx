import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../firebase';
// @ts-ignore
import { collection, query, where, getDoc, doc, getDocs, limit } from 'firebase/firestore';
import { SwapRequest, LeaveRequest } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
// @ts-ignore
import { useNavigate } from 'react-router-dom';

interface UnifiedHistoryItem {
    id: string;
    rawType: 'swap' | 'leave';
    displayType: string;
    date: string;
    details: string;
    status: string;
    createdAt: any;
    isOutgoing?: boolean;
    originalData?: any;
}

const UserHistory: React.FC = () => {
    const { t, dir } = useLanguage();
    const navigate = useNavigate();
    const currentUserId = auth.currentUser?.uid;
    
    const [sentHistory, setSentHistory] = useState<any[]>([]);
    const [receivedHistory, setReceivedHistory] = useState<any[]>([]);
    const [leaveHistory, setLeaveHistory] = useState<any[]>([]);
    
    const [histFilterType, setHistFilterType] = useState<'all' | 'swap' | 'leave'>('all');
    const [histFilterStatus, setHistFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

    const [refreshTrigger, setRefreshTrigger] = useState(0);

    useEffect(() => {
        if (!currentUserId) return;

        // Sent Swaps
        const qSent = query(collection(db, 'swapRequests'), where('from', '==', currentUserId));
        getDocs(qSent).then(async (snap) => {
            const list = await Promise.all(snap.docs.map(async d => { 
                const data = d.data() as SwapRequest; 
                // Fetch recipient name
                let name = t('user.hist.unknown');
                try {
                    const uDoc = await getDoc(doc(db, 'users', data.to));
                    if(uDoc.exists()) name = uDoc.data().name;
                } catch(e){}
                return { ...data, id: d.id, isOutgoing: true, otherUserName: name }; 
            }));
            setSentHistory(list);
        });

        // Received Swaps (Not pending)
        const qReceived = query(collection(db, 'swapRequests'), where('to', '==', currentUserId));
        getDocs(qReceived).then(async (snap) => {
            const list = await Promise.all(snap.docs.filter(d => d.data().status !== 'pending').map(async d => { 
                const data = d.data() as SwapRequest; 
                let name = t('user.hist.unknown');
                try {
                    const uDoc = await getDoc(doc(db, 'users', data.from));
                    if(uDoc.exists()) name = uDoc.data().name;
                } catch(e){}
                return { ...data, id: d.id, isOutgoing: false, otherUserName: name }; 
            }));
            setReceivedHistory(list);
        });

        // Leaves
        const qLeaves = query(collection(db, 'leaveRequests'), where('from', '==', currentUserId));
        getDocs(qLeaves).then((snap) => {
            setLeaveHistory(snap.docs.map(d => ({ ...d.data(), id: d.id } as LeaveRequest)).reverse());
        });

    }, [currentUserId, refreshTrigger]);

    const filteredHistory = useMemo(() => {
        const swaps: UnifiedHistoryItem[] = [...sentHistory, ...receivedHistory].map(s => ({
            id: s.id,
            rawType: 'swap',
            displayType: s.type,
            date: s.endDate ? `${s.startDate} > ${s.endDate}` : (s.startDate || ''),
            details: `${s.isOutgoing ? t('user.req.to') : t('user.req.from')}: ${s.otherUserName} ${s.details ? `(${s.details})` : ''}`,
            status: s.status,
            createdAt: s.createdAt,
            isOutgoing: s.isOutgoing
        }));
        const leaves: UnifiedHistoryItem[] = leaveHistory.map(l => ({
            id: l.id,
            rawType: 'leave',
            displayType: l.typeOfLeave || 'Leave',
            date: `${l.startDate} > ${l.endDate}`,
            details: l.reason,
            status: l.status,
            createdAt: l.createdAt,
            originalData: l
        }));
        let combined = [...swaps, ...leaves];
        combined.sort((a, b) => {
            const ta = a.createdAt?.seconds || 0;
            const tb = b.createdAt?.seconds || 0;
            return tb - ta;
        });
        return combined.filter(item => {
            if (histFilterType !== 'all' && item.rawType !== histFilterType) return false;
            if (histFilterStatus !== 'all') {
                const s = (item.status || '').toLowerCase();
                if (histFilterStatus === 'approved' && !s.includes('approved')) return false;
                if (histFilterStatus === 'rejected' && !s.includes('rejected')) return false;
                if (histFilterStatus === 'pending' && !s.includes('pending') && s !== 'approvedbyuser') return false;
            }
            return true;
        });
    }, [sentHistory, receivedHistory, leaveHistory, histFilterType, histFilterStatus, t]);

    const handleExport = () => {
        if (filteredHistory.length === 0) return;
        const dataToExport = filteredHistory.map(item => ({
            Type: item.displayType,
            Date: item.date,
            Details: item.details,
            Status: item.status
        }));
        
        const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
            + Object.keys(dataToExport[0]).join(",") + "\n"
            + dataToExport.map(e => Object.values(e).map(v => `"${v || ''}"`).join(",")).join("\n");
            
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `my_history_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handlePrintLeave = async (leave: LeaveRequest) => {
        try {
            const fetchWorkLocation = async (userId: string) => {
                let loc = 'AL JEDAANI HOSPITAL';
                try {
                    const now = new Date();
                    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                    const todayStr = now.toISOString().split('T')[0];
                    
                    const sSnap = await getDocs(query(
                        collection(db, 'schedules'), 
                        where('userId', '==', userId)
                    ));
                    
                    if (!sSnap.empty) {
                        const schedules = sSnap.docs.map(d => ({ ...d.data(), id: d.id } as any));
                        let match = schedules.find(s => s.date === todayStr);
                        if (!match) match = schedules.find(s => s.month === currentMonth);
                        if (!match) {
                            match = schedules.find(s => {
                                if (s.validFrom && s.validTo) {
                                    return todayStr >= s.validFrom && todayStr <= s.validTo;
                                }
                                return false;
                            });
                        }
                        if (!match && schedules.length > 0) {
                            schedules.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
                            match = schedules[0];
                        }

                        if (match) {
                            if (match.locationId === 'common_duty' && match.note) {
                                loc = match.note.split('-')[0].trim();
                            } else if (match.locationId) {
                                const lDoc = await getDoc(doc(db, 'locations', match.locationId));
                                if (lDoc.exists()) loc = lDoc.data().name;
                                else loc = match.locationId;
                            }
                        }
                    }

                    if (loc === 'AL JEDAANI HOSPITAL') {
                        const uDoc = await getDoc(doc(db, 'users', userId));
                        if (uDoc.exists()) {
                            const uData = uDoc.data();
                            if (uData.departmentId) {
                                const depDoc = await getDoc(doc(db, 'departments', uData.departmentId));
                                if (depDoc.exists()) loc = depDoc.data().name;
                                else {
                                    const locDoc = await getDoc(doc(db, 'locations', uData.departmentId));
                                    if (locDoc.exists()) loc = locDoc.data().name;
                                }
                            }
                        }
                    }
                } catch (e) {}
                return loc;
            };

            // Fetch the user's details
            const uDoc = await getDoc(doc(db, 'users', leave.from));
            const userData = uDoc.exists() ? uDoc.data() : null;
            const userName = userData?.name || leave.from;
            const workLocation = await fetchWorkLocation(leave.from);
            const userStampPosition = workLocation;
            
            // Map jobCategory to title using JOB_CATEGORIES
            const JOB_CATEGORIES = [
                { id: 'doctor', title: 'Doctors' },
                { id: 'technologist', title: 'Specialists' },
                { id: 'usg', title: 'Ultrasound' },
                { id: 'technician', title: 'Technicians' },
                { id: 'nurse', title: 'Nurses' },
                { id: 'rso', title: 'R S O' },
            ];
            const jobCat = JOB_CATEGORIES.find(c => c.id === userData?.jobCategory);
            const userTablePosition = jobCat ? jobCat.title : (userData?.section || userData?.role || userData?.jobCategory || '-');

            const userStamp = userData?.stamp || '';
            
            // Fetch department name
            const departmentName = 'RADIOLOGY DEPARTMENT';
            
            // Fetch reliever details and departments
            const relieverDataList = await Promise.all(
                (leave.relieverIds || []).map(async (id: string) => {
                    const rDoc = await getDoc(doc(db, 'users', id));
                    let rJob = '-';
                    let rName = id;
                    if (rDoc.exists()) {
                        const rData = rDoc.data();
                        rName = rData.name || id;
                        const rLoc = await fetchWorkLocation(id);
                        rJob = rLoc;
                    }
                    return { name: rName, job: rJob };
                })
            );

            // Fetch supervisor department and job
            let supervisorDept = '-';
            let supervisorJob = '-';
            const supApp = leave.supervisorApproval as any;
            if (supApp?.uid) {
                const sDoc = await getDoc(doc(db, 'users', supApp.uid));
                if (sDoc.exists()) {
                    const sData = sDoc.data();
                    const sLoc = await fetchWorkLocation(supApp.uid);
                    supervisorJob = sLoc;
                    supervisorDept = sData.department || '-';
                    if (sData.departmentId) {
                        const sdDoc = await getDoc(doc(db, 'departments', sData.departmentId));
                        if (sdDoc.exists()) supervisorDept = sdDoc.data().name;
                    }
                }
            }

            // Fetch manager department and job
            let managerDept = '-';
            let managerJob = '-';
            const manApp = leave.managerApproval as any;
            if (manApp?.uid) {
                const mDoc = await getDoc(doc(db, 'users', manApp.uid));
                if (mDoc.exists()) {
                    const mData = mDoc.data();
                    const mLoc = await fetchWorkLocation(manApp.uid);
                    managerJob = mLoc;
                    managerDept = mData.department || '-';
                    if (mData.departmentId) {
                        const mdDoc = await getDoc(doc(db, 'departments', mData.departmentId));
                        if (mdDoc.exists()) managerDept = mdDoc.data().name;
                    }
                }
            }

            // Build the HTML content
            const logoUrl = new URL('/logo.png', window.location.origin).href;
            
            const renderStampInline = (name: string, jobTitle: string = 'Staff', hospital: string = 'AL JEDAANI HOSPITAL') => {
                return `
                    <div class="stamp-box" style="position: static; transform: none; margin: 0; z-index: 1;">
                        <div class="stamp-inner">
                            <div class="stamp-hospital">AL JEDAANI HOSPITAL</div>
                            <div class="stamp-hospital" style="font-size: 9px; border-top: 1px dashed rgba(30, 58, 138, 0.4); margin-top: 1px; padding-top: 1px;">RADIOLOGY DEPARTMENT</div>
                            <div class="stamp-dept">${jobTitle}</div>
                            <div class="stamp-name">${name}</div>
                        </div>
                    </div>
                `;
            };

            const renderStamp = (name: string, jobTitle: string = 'Staff', hospital: string = 'AL JEDAANI HOSPITAL', index: number = 0, total: number = 1) => {
                const rotation = (Math.random() * 6 - 3).toFixed(1);
                // Spread out stamps if there are multiple (especially for relievers)
                const offset = total > 1 ? (index - (total - 1) / 2) * 140 : 0;
                return `
                    <div class="stamp-box" style="transform: rotate(${rotation}deg); position: absolute; top: -15px; left: calc(50% + ${offset}px); transform: translateX(-50%) rotate(${rotation}deg); z-index: 50; pointer-events: none;">
                        <div class="stamp-inner">
                            <div class="stamp-hospital">AL JEDAANI HOSPITAL</div>
                            <div class="stamp-hospital" style="font-size: 9px; border-top: 1px dashed rgba(30, 58, 138, 0.4); margin-top: 1px; padding-top: 1px;">RADIOLOGY DEPARTMENT</div>
                            <div class="stamp-dept">${jobTitle}</div>
                            <div class="stamp-name">${name}</div>
                        </div>
                    </div>
                `;
            };
            
            const htmlContent = `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <title>Leave Application - ${userName}</title>
                    <style>
                        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&family=Inter:wght@400;700&display=swap');
                        @page {
                            size: A4;
                            margin: 10mm;
                        }
                        body { 
                            font-family: 'Inter', 'Cairo', sans-serif; 
                            margin: 0;
                            padding: 0;
                            color: #000;
                            background: #fff;
                            font-size: 12px;
                        }
                        .print-container { 
                            width: 100%;
                            max-width: 100%;
                            margin: 0 auto; 
                            border: 1px solid #000; 
                            padding: 15px;
                            box-sizing: border-box;
                        }
                        .header-section {
                            text-align: center;
                            margin-bottom: 10px;
                        }
                        .title-box {
                            display: inline-block;
                            border: 2px solid #000;
                            border-radius: 12px;
                            padding: 5px 30px;
                            text-align: center;
                        }
                        .title-ar { font-size: 20px; font-weight: bold; margin-bottom: 2px; }
                        .title-en { font-size: 14px; font-weight: bold; text-transform: uppercase; }
                        
                        .date-line {
                            text-align: left;
                            margin-bottom: 5px;
                            font-weight: bold;
                        }

                        table {
                            width: 100%;
                            border-collapse: collapse;
                        }
                        td {
                            border: 1px solid #000;
                            padding: 4px 8px;
                            vertical-align: middle;
                        }
                        .label-en { width: 25%; text-align: left; font-weight: bold; }
                        .label-ar { width: 25%; text-align: right; font-weight: bold; font-family: 'Cairo', sans-serif; }
                        .value { width: 50%; text-align: center; font-weight: bold; font-size: 13px; }
                        
                        .section-header {
                            background: #fff;
                            font-weight: bold;
                        }
                        .section-header td {
                            padding: 2px 0;
                        }
                        .section-title-flex {
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            padding: 0 15px;
                            font-size: 14px;
                        }

                        .checkbox-container {
                            display: flex;
                            align-items: center;
                            gap: 8px;
                        }
                        .checkbox {
                            width: 14px;
                            height: 14px;
                            border: 1.5px solid #000;
                            display: inline-block;
                            position: relative;
                        }
                        .checkbox.checked::after {
                            content: '✓';
                            position: absolute;
                            top: -5px;
                            left: 1px;
                            font-size: 14px;
                        }

                        .stamp-img {
                            max-height: 45px;
                            display: block;
                            margin: 2px auto;
                        }
                        .stamp-box {
                            border: 3px solid #1e3a8a;
                            border-radius: 6px;
                            padding: 4px 8px;
                            display: inline-block;
                            color: #1e3a8a;
                            text-align: center;
                            font-family: 'Courier New', Courier, monospace;
                            font-weight: bold;
                            line-height: 1.1;
                            background: transparent;
                            margin: 2px auto;
                            min-width: 100px;
                            position: relative;
                            text-transform: uppercase;
                            box-shadow: inset 0 0 2px rgba(30, 58, 138, 0.2);
                        }
                        .stamp-inner {
                            border: 1px solid rgba(30, 58, 138, 0.5);
                            padding: 2px;
                            border-radius: 3px;
                        }
                        .stamp-hospital {
                            font-size: 8px;
                            letter-spacing: 0.5px;
                            margin-bottom: 1px;
                            border-bottom: 1px dashed rgba(30, 58, 138, 0.4);
                            padding-bottom: 1px;
                        }
                        .stamp-dept {
                            font-size: 10px;
                            margin-bottom: 1px;
                            color: #1e3a8a;
                        }
                        .stamp-name {
                            font-size: 12px;
                        }

                        @media print {
                            .print-container { border: 1px solid #000; }
                            .no-print { display: none; }
                        }

                        /* Watermark Style */
                        .watermark {
                            position: fixed;
                            top: 50%;
                            left: 50%;
                            transform: translate(-50%, -50%) rotate(-45deg);
                            opacity: 0.15;
                            width: 70%;
                            z-index: -1;
                            pointer-events: none;
                        }
                    </style>
                </head>
                <body>
                    <img src="${logoUrl}" class="watermark" alt="Watermark" crossOrigin="anonymous" />
                    <div class="print-container">
                        <div class="header-section" style="display: flex; align-items: center; justify-content: space-between;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <img src="${logoUrl}" alt="Logo" style="max-height: 80px;" crossOrigin="anonymous" />
                                ${leave.supervisorApproval?.uid ? renderStampInline(leave.supervisorApproval.name, supervisorJob, 'AL JEDAANI HOSPITAL') : ''}
                            </div>
                            <div class="title-box">
                                <div class="title-ar">طلب اجازة</div>
                                <div class="title-en">LEAVE APPLICATION</div>
                            </div>
                        </div>

                        <div class="date-line">
                            Date: ____________________
                        </div>

                        <table>
                            <tr>
                                <td class="label-en">Name:</td>
                                <td class="value">${userName}</td>
                                <td class="label-ar">الاسم:</td>
                            </tr>
                            <tr>
                                <td class="label-en">Position:</td>
                                <td class="value">${userTablePosition}</td>
                                <td class="label-ar">الوظيفة:</td>
                            </tr>
                            <tr>
                                <td class="label-en">Department:</td>
                                <td class="value">${departmentName}</td>
                                <td class="label-ar">القسم:</td>
                            </tr>
                            <tr>
                                <td class="label-en">Type of Leave:</td>
                                <td class="value">${leave.typeOfLeave || '-'}</td>
                                <td class="label-ar">نوع الاجازة:</td>
                            </tr>
                            <tr>
                                <td class="label-en">Duration of Leave:</td>
                                <td class="value">${leave.duration || '-'}</td>
                                <td class="label-ar">مدة الاجازة:</td>
                            </tr>
                            <tr>
                                <td class="label-en">From:</td>
                                <td class="value">${leave.startDate}</td>
                                <td class="label-ar">من تاريخ:</td>
                            </tr>
                            <tr>
                                <td class="label-en">To:</td>
                                <td class="value">${leave.endDate}</td>
                                <td class="label-ar">حتي تاريخ:</td>
                            </tr>
                            <tr>
                                <td class="label-en">Signature:</td>
                                <td class="value" style="position: relative; height: 60px;">
                                    <div style="font-size: 11px; margin-bottom: 2px;">${userName}</div>
                                    ${renderStamp(userName, userStampPosition, 'AL JEDAANI HOSPITAL')}
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
                                <td class="label-en">Head of Department:</td>
                                <td class="value" style="position: relative; height: 60px;">
                                    <div style="font-size: 11px; margin-bottom: 2px;"></div>
                                    ${manApp?.status === 'approved' ? renderStamp(manApp.userName || 'Manager', managerJob, 'AL JEDAANI HOSPITAL') : ''}
                                </td>
                                <td class="label-ar">رئيس القسم:</td>
                            </tr>
                            <tr>
                                <td class="label-en">Manager:</td>
                                <td class="value"></td>
                                <td class="label-ar">المدير:</td>
                            </tr>
                            <tr>
                                <td colspan="3">
                                    <div style="display: flex; justify-content: space-between; padding: 0 30px;">
                                        <div class="checkbox-container">
                                            <div class="checkbox ${leave.status === 'approved' || leave.status === 'pending_manager' ? 'checked' : ''}"></div>
                                            <span>Approved</span>
                                        </div>
                                        <div class="checkbox-container">
                                            <span>موافق</span>
                                            <div class="checkbox ${leave.status === 'approved' || leave.status === 'pending_manager' ? 'checked' : ''}"></div>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                            <tr>
                                <td class="label-en">Reliever:</td>
                                <td class="value">${relieverDataList.map(r => r.name).join(', ')}</td>
                                <td class="label-ar">الاسم البديل:</td>
                            </tr>
                            <tr>
                                <td class="label-en">Signature of Reliever:</td>
                                <td class="value" style="position: relative; height: 60px;">
                                    ${relieverDataList.map((r, idx) => renderStamp(r.name, r.job, 'AL JEDAANI HOSPITAL', idx, relieverDataList.length)).join('')}
                                </td>
                                <td class="label-ar">توقيع البديل:</td>
                            </tr>
                            <tr>
                                <td class="label-en">Signature, Head of Department:</td>
                                <td class="value" style="position: relative; height: 60px;">
                                    ${leave.managerApproval ? renderStamp(leave.managerApproval.name, managerJob, 'AL JEDAANI HOSPITAL') : ''}
                                </td>
                                <td class="label-ar">توقيع رئيس القسم :</td>
                            </tr>
                            <tr>
                                <td class="label-en">Date:</td>
                                <td class="value">${leave.managerApproval?.timestamp ? new Date(leave.managerApproval.timestamp.seconds * 1000).toLocaleDateString() : ''}</td>
                                <td class="label-ar">التاريخ:</td>
                            </tr>
                            <tr>
                                <td colspan="3">
                                    <div style="display: flex; justify-content: space-between; padding: 0 30px;">
                                        <div class="checkbox-container">
                                            <div class="checkbox ${leave.status === 'rejected' ? 'checked' : ''}"></div>
                                            <span>Disapproved</span>
                                        </div>
                                        <div class="checkbox-container">
                                            <span>غير موافق</span>
                                            <div class="checkbox ${leave.status === 'rejected' ? 'checked' : ''}"></div>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                            <tr>
                                <td class="label-en">Reason:</td>
                                <td class="value">${leave.status === 'rejected' ? (leave.supervisorApproval?.comment || leave.managerApproval?.comment || '') : ''}</td>
                                <td class="label-ar">السبب :</td>
                            </tr>
                            <tr>
                                <td class="label-en">Signature, Head of Department:</td>
                                <td class="value" style="position: relative; height: 60px;">
                                    ${leave.status === 'rejected' && leave.managerApproval ? renderStamp(leave.managerApproval.name, managerJob, 'AL JEDAANI HOSPITAL') : ''}
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
                                <td class="value">${leave.dateHired || ''}</td>
                                <td class="label-ar">تاريخ الإلتحاق:</td>
                            </tr>
                            <tr>
                                <td class="label-en">Due Date For Leave:</td>
                                <td class="value">${leave.dueDateForLeave || ''}</td>
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

            const printWindow = window.open('', '_blank');
            if (printWindow) {
                printWindow.document.open();
                printWindow.document.write(htmlContent);
                printWindow.document.close();
                
                setTimeout(() => {
                    const images = printWindow.document.getElementsByTagName('img');
                    let loadedCount = 0;
                    const totalImages = images.length;
                    
                    const doPrint = () => {
                        printWindow.focus();
                        printWindow.print();
                    };

                    if (totalImages === 0) {
                        doPrint();
                    } else {
                        for (let i = 0; i < totalImages; i++) {
                            if (images[i].complete) {
                                loadedCount++;
                            } else {
                                images[i].onload = () => {
                                    loadedCount++;
                                    if (loadedCount === totalImages) doPrint();
                                };
                                images[i].onerror = () => {
                                    loadedCount++;
                                    if (loadedCount === totalImages) doPrint();
                                };
                            }
                        }
                        if (loadedCount === totalImages) doPrint();
                    }
                }, 500);
            } else {
                alert('Please allow popups to print the document.');
            }
        } catch (error) {
            console.error("Error printing leave request:", error);
        }
    };

    return (
        <div className="max-w-5xl mx-auto px-4 py-8 animate-fade-in" dir={dir}>
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/user')} className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-300 transition-colors">
                        <i className="fas fa-arrow-left rtl:rotate-180"></i>
                    </button>
                    <h1 className="text-2xl font-black text-slate-800">{t('user.tab.history')}</h1>
                </div>
                <button onClick={handleExport} className="bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl font-bold hover:bg-emerald-100 transition-colors flex items-center gap-2">
                    <i className="fas fa-file-excel"></i> {t('export')}
                </button>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap gap-4 items-center">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-400 uppercase">{t('user.hist.filterBy')}</span>
                        <select className="bg-white border-none rounded-lg text-xs font-bold text-slate-600 py-1.5 focus:ring-0" value={histFilterType} onChange={e => setHistFilterType(e.target.value as any)}>
                            <option value="all">{t('user.hist.allTypes')}</option>
                            <option value="swap">{t('user.hist.swaps')}</option>
                            <option value="leave">{t('user.hist.leaves')}</option>
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <select className="bg-white border-none rounded-lg text-xs font-bold text-slate-600 py-1.5 focus:ring-0" value={histFilterStatus} onChange={e => setHistFilterStatus(e.target.value as any)}>
                            <option value="all">{t('user.hist.allStatus')}</option>
                            <option value="approved">{t('user.req.status.approved')}</option>
                            <option value="pending">{t('user.hist.pending')}</option>
                            <option value="rejected">{t('user.req.status.rejected')}</option>
                        </select>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-white text-slate-500 font-bold border-b border-slate-100">
                            <tr>
                                <th className="p-4 w-10"></th>
                                <th className="p-4">{t('user.req.type')}</th>
                                <th className="p-4">{t('details')}</th>
                                <th className="p-4">{t('date')}</th>
                                <th className="p-4 text-center">{t('status')}</th>
                                <th className="p-4 text-center">{t('actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filteredHistory.map(item => (
                                <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="p-4 text-center">
                                        <div className={`w-2 h-2 rounded-full ${item.status.includes('approved') ? 'bg-emerald-500' : item.status.includes('rejected') ? 'bg-red-500' : 'bg-amber-500'}`}></div>
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${item.rawType === 'swap' ? 'bg-indigo-50 text-indigo-600' : 'bg-rose-50 text-rose-600'}`}>
                                            {item.rawType === 'swap' ? (item.isOutgoing ? 'Sent Swap' : 'Received Swap') : item.displayType}
                                        </span>
                                    </td>
                                    <td className="p-4 text-slate-600 font-medium">
                                        {item.details}
                                    </td>
                                    <td className="p-4 font-mono text-xs text-slate-500">
                                        {item.date}
                                    </td>
                                    <td className="p-4 text-center">
                                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wide border ${
                                            item.status === 'approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                                            item.status === 'rejected' ? 'bg-red-50 text-red-600 border-red-100' : 
                                            'bg-amber-50 text-amber-600 border-amber-100'
                                        }`}>
                                            {item.status === 'approvedByUser' ? t('user.hist.waitingSupervisor') : 
                                             item.status === 'pending_reliever' ? t('user.hist.waitingReliever') :
                                             item.status === 'pending_supervisor' ? t('user.hist.waitingSupervisor') :
                                             item.status === 'pending_manager' ? t('user.hist.waitingManager') :
                                             item.status}
                                        </span>
                                    </td>
                                    <td className="p-4 text-center">
                                        {item.rawType === 'leave' && item.originalData && (
                                            <button 
                                                onClick={() => handlePrintLeave(item.originalData)}
                                                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-colors flex items-center justify-center mx-auto"
                                                title={t('print')}
                                            >
                                                <i className="fas fa-print"></i>
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default UserHistory;