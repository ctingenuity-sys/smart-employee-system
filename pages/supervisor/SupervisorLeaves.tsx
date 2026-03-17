import React, { useState, useEffect } from 'react';
import { db, auth } from '../../firebase';
// @ts-ignore
import { collection, query, where, getDocs, doc, updateDoc, Timestamp, getDoc } from 'firebase/firestore';
import { LeaveRequest, User, UserRole } from '../../types';
import Toast from '../../components/Toast';
import { useLanguage } from '../../contexts/LanguageContext';
// @ts-ignore
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../App';

const SupervisorLeaves: React.FC = () => {
    const { t, dir } = useLanguage();
    const navigate = useNavigate();
    const { role } = useAuth();
    const [activeTab, setActiveTab] = useState<'supervisor' | 'manager'>('supervisor');

    const fetchWorkLocation = async (userId: string) => {
        try {
            const currentMonth = new Date().toISOString().slice(0, 7);
            const qSch = query(collection(db, 'schedules'), where('userId', '==', userId), where('month', '==', currentMonth));
            const schSnap = await getDocs(qSch);
            if (!schSnap.empty) {
                const locId = schSnap.docs[0].data().locationId;
                if (locId) {
                    const locDoc = await getDoc(doc(db, 'locations', locId));
                    if (locDoc.exists()) return locDoc.data().name;
                }
            }
        } catch (e) {
            console.error("Error fetching work location:", e);
        }
        return 'AL JEDAANI HOSPITAL';
    };

    useEffect(() => {
        if (role === UserRole.MANAGER) {
            setActiveTab('manager');
        } else {
            setActiveTab('supervisor');
        }
    }, [role]);
    
    const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>(() => {
        const cached = localStorage.getItem('usr_cached_sup_leaves');
        return cached ? JSON.parse(cached) : [];
    });
    const [managerRequests, setManagerRequests] = useState<LeaveRequest[]>(() => {
        const cached = localStorage.getItem('usr_cached_man_leaves');
        return cached ? JSON.parse(cached) : [];
    });
    const [users, setUsers] = useState<User[]>(() => {
        const cached = localStorage.getItem('usr_cached_sup_users_leaves');
        return cached ? JSON.parse(cached) : [];
    });
    const [toast, setToast] = useState<{msg: string, type: 'success'|'error'} | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    useEffect(() => {
        localStorage.setItem('usr_cached_sup_leaves', JSON.stringify(leaveRequests));
        localStorage.setItem('usr_cached_man_leaves', JSON.stringify(managerRequests));
    }, [leaveRequests, managerRequests]);

    useEffect(() => {
        localStorage.setItem('usr_cached_sup_users_leaves', JSON.stringify(users));
    }, [users]);

    useEffect(() => {
        const currentUserId = auth.currentUser?.uid;
        if (!currentUserId) return;

        getDocs(collection(db, 'users')).then(snap => {
            setUsers(snap.docs.map(d => ({ ...d.data(), id: d.id } as User)));
        });
        
        // Supervisor Tab: Show requests where I am the assigned supervisor
        // If Admin, show ALL pending_supervisor requests
        let qLeavesSup;
        if (role === UserRole.ADMIN) {
            qLeavesSup = query(
                collection(db, 'leaveRequests'), 
                where('status', '==', 'pending_supervisor')
            );
        } else {
            qLeavesSup = query(
                collection(db, 'leaveRequests'), 
                where('status', '==', 'pending_supervisor'),
                where('supervisorId', '==', currentUserId)
            );
        }
        
        getDocs(qLeavesSup).then(snap => {
            setLeaveRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as LeaveRequest)));
        });

        // Manager Tab: Show requests where I am the assigned manager
        // If Admin, show ALL pending_manager requests
        let qLeavesMan;
        if (role === UserRole.ADMIN) {
            qLeavesMan = query(
                collection(db, 'leaveRequests'), 
                where('status', '==', 'pending_manager')
            );
        } else {
            qLeavesMan = query(
                collection(db, 'leaveRequests'), 
                where('status', '==', 'pending_manager'),
                where('managerId', '==', currentUserId)
            );
        }
        
        getDocs(qLeavesMan).then(snap => {
            setManagerRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as LeaveRequest)));
        });

        // Fallback for Admins: If I am an admin, I might want to see ALL pending requests that don't have an assigned supervisor/manager
        if (role === UserRole.ADMIN) {
            // We could add more queries here if needed, but for now let's stick to assigned ones
        }
    }, [refreshTrigger, role]);

    const getUserName = (id: string) => users.find(u => u.id === id)?.name || id;

    const handleLeaveAction = async (req: LeaveRequest, isApproved: boolean, isManagerAction: boolean = false) => {
        try {
            const currentUserId = auth.currentUser?.uid;
            if (!currentUserId) return;
            
            const uDoc = await getDoc(doc(db, 'users', currentUserId));
            const userData = uDoc.exists() ? uDoc.data() : { name: 'Unknown', role: isManagerAction ? 'Manager' : 'Supervisor', department: '' };
            
            // Fetch work location for the current month
            let workLocation = 'AL JEDAANI HOSPITAL';
            const currentMonth = new Date().toISOString().slice(0, 7);
            const qSch = query(collection(db, 'schedules'), where('userId', '==', currentUserId), where('month', '==', currentMonth));
            const schSnap = await getDocs(qSch);
            if (!schSnap.empty) {
                const locId = schSnap.docs[0].data().locationId;
                if (locId) {
                    const locDoc = await getDoc(doc(db, 'locations', locId));
                    if (locDoc.exists()) workLocation = locDoc.data().name;
                }
            }

            const stamp = `AL JEDAANI HOSPITAL\nRADIOLOGY DEPARTMENT\n${workLocation}\n${userData?.name || userData?.email || 'Unknown'}\n${new Date().toLocaleDateString()}`;

            const approvalData = {
                approved: isApproved,
                stamp: stamp,
                name: userData?.name || userData?.email || 'Unknown',
                uid: currentUserId,
                jobTitle: workLocation,
                timestamp: Timestamp.now()
            };

            if (isManagerAction) {
                await updateDoc(doc(db, 'leaveRequests', req.id!), { 
                    status: isApproved ? 'approved' : 'rejected',
                    managerApproval: approvalData
                });
            } else {
                // If the supervisor is also the manager, approve as manager too
                const isAlsoManager = req.managerId === currentUserId;
                if (isApproved && isAlsoManager) {
                    await updateDoc(doc(db, 'leaveRequests', req.id!), { 
                        status: 'approved',
                        supervisorApproval: approvalData,
                        managerApproval: approvalData
                    });
                } else {
                    await updateDoc(doc(db, 'leaveRequests', req.id!), { 
                        status: isApproved ? 'pending_manager' : 'rejected',
                        supervisorApproval: approvalData
                    });
                }
            }
            
            setToast({ msg: `Request ${isApproved ? 'Approved' : 'Rejected'}`, type: 'success' });
            setRefreshTrigger(prev => prev + 1);
        } catch (e) { setToast({ msg: 'Error', type: 'error' }); }
    };

    const handleExport = () => {
        const dataToExport = (activeTab === 'supervisor' ? leaveRequests : managerRequests).map(req => ({
            Employee: getUserName(req.from),
            Type: req.typeOfLeave,
            StartDate: req.startDate,
            EndDate: req.endDate,
            Duration: req.duration,
            Reason: req.reason,
            Status: req.status
        }));
        
        const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
            + Object.keys(dataToExport[0] || {}).join(",") + "\n"
            + dataToExport.map(e => Object.values(e).map(v => `"${v || ''}"`).join(",")).join("\n");
            
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `leave_requests_${activeTab}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handlePrintLeave = async (leave: LeaveRequest) => {
        try {
            // Fetch the user's details
            const uDoc = await getDoc(doc(db, 'users', leave.from));
            const userData = uDoc.exists() ? uDoc.data() : null;
            console.log("userData:", userData);
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
                            border: 2px double #1e40af;
                            border-radius: 6px;
                            padding: 4px 10px;
                            display: inline-block;
                            color: #1e40af;
                            text-align: center;
                            font-family: 'Cairo', sans-serif;
                            line-height: 1.0;
                            background: rgba(30, 64, 175, 0.03);
                            margin: 5px auto;
                            min-width: 130px;
                            position: relative;
                            overflow: hidden;
                        }
                        .stamp-inner {
                            border: 1px solid rgba(30, 64, 175, 0.3);
                            padding: 3px;
                            border-radius: 4px;
                        }
                        .stamp-hospital {
                            font-size: 8px;
                            font-weight: bold;
                            text-transform: uppercase;
                            margin-bottom: 1px;
                        }
                        .stamp-dept {
                            font-size: 9px;
                            font-weight: 800;
                            margin-bottom: 3px;
                            color: #1d4ed8;
                        }
                        .stamp-name {
                            font-weight: 900;
                            font-size: 11px;
                            text-decoration: underline;
                            margin-bottom: 1px;
                        }
                        .stamp-status {
                            font-size: 7px;
                            font-weight: bold;
                            letter-spacing: 1px;
                            opacity: 0.8;
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
                                ${leave.supervisorApproval?.uid ? renderStampInline(leave.supervisorApproval.name, supervisorJob, 'Al Jedaani Hospital') : ''}
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
                                    ${leave.supervisorApproval ? renderStamp(leave.supervisorApproval.name, supervisorJob, 'AL JEDAANI HOSPITAL') : ''}
                                </td>
                                <td class="label-ar">توقيع رئيس القسم :</td>
                            </tr>
                            <tr>
                                <td class="label-en">Date:</td>
                                <td class="value">${leave.supervisorApproval?.timestamp ? new Date(leave.supervisorApproval.timestamp.seconds * 1000).toLocaleDateString() : ''}</td>
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
                                    ${leave.status === 'rejected' && leave.supervisorApproval ? renderStamp(leave.supervisorApproval.name, supervisorJob, 'AL JEDAANI HOSPITAL') : ''}
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
                                    ${leave.managerApproval ? renderStamp(leave.managerApproval.name, managerJob, 'AL JEDAANI HOSPITAL') : ''}
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
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/supervisor')} className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-300 transition-colors">
                        <i className="fas fa-arrow-left rtl:rotate-180"></i>
                    </button>
                    <h1 className="text-2xl font-black text-slate-800">{t('sup.leaveReqs')}</h1>
                </div>
                
                <div className="flex items-center gap-4">
                    <button onClick={handleExport} className="bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl font-bold hover:bg-emerald-100 transition-colors flex items-center gap-2">
                        <i className="fas fa-file-excel"></i> {t('export')}
                    </button>
                {(role === UserRole.ADMIN || role === UserRole.MANAGER || role === UserRole.SUPERVISOR) && (
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                        {(role === UserRole.ADMIN || role === UserRole.SUPERVISOR) && (
                            <button 
                                onClick={() => setActiveTab('supervisor')}
                                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'supervisor' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                {t('sup.tab.supervisorApprovals')}
                            </button>
                        )}
                        {(role === UserRole.ADMIN || role === UserRole.MANAGER) && (
                            <button 
                                onClick={() => setActiveTab('manager')}
                                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'manager' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                {t('sup.tab.managerApprovals')}
                            </button>
                        )}
                    </div>
                )}
                </div>
            </div>

            <div className="grid gap-4">
                {(activeTab === 'supervisor' ? leaveRequests : managerRequests).length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200 text-slate-400">
                        {t('appt.noResults')}
                    </div>
                ) : (
                    (activeTab === 'supervisor' ? leaveRequests : managerRequests).map(req => (
                        <div key={req.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center text-xl shadow-sm">
                                    <i className="fas fa-umbrella-beach"></i>
                                </div>
                                <div>
                                    <h4 className="font-bold text-slate-800 text-lg">{getUserName(req.from)}</h4>
                                    <p className="text-sm text-slate-500 font-medium">{t('user.req.leave')} • {req.typeOfLeave}</p>
                                    <p className="text-sm text-slate-500 mt-1">
                                        <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-600">{req.startDate}</span>
                                        <i className="fas fa-arrow-right mx-2 text-slate-300 text-xs"></i>
                                        <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-600">{req.endDate}</span>
                                        <span className="ml-2 text-xs">({req.duration} {t('user.req.duration')})</span>
                                    </p>
                                    {req.reason && <p className="text-xs text-slate-400 mt-1 italic">"{req.reason}"</p>}
                                    
                                    {/* Display Reliever Approvals */}
                                    {req.relieverApprovals && Object.keys(req.relieverApprovals).length > 0 && (
                                        <div className="mt-3 bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs">
                                            <p className="font-bold text-slate-600 mb-2">{t('sup.relieverApprovals')}</p>
                                            {Object.values(req.relieverApprovals).map((approval, idx) => (
                                                <div key={idx} className="mb-2 last:mb-0 border-l-2 border-emerald-400 pl-2">
                                                    <p className="font-bold text-emerald-600">{approval.name} <i className="fas fa-check-circle"></i></p>
                                                    <p className="text-slate-500">{approval.jobTitle}</p>
                                                    <p className="text-slate-400 whitespace-pre-wrap mt-1 font-mono text-[10px]">{approval.stamp}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Display Supervisor Approval if in Manager Tab */}
                                    {activeTab === 'manager' && req.supervisorApproval && (
                                        <div className="mt-3 bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs">
                                            <p className="font-bold text-slate-600 mb-2">{t('sup.supervisorApproval')}</p>
                                            <div className="border-l-2 border-emerald-400 pl-2">
                                                <p className="font-bold text-emerald-600">{req.supervisorApproval.name} <i className="fas fa-check-circle"></i></p>
                                                <p className="text-slate-400 whitespace-pre-wrap mt-1 font-mono text-[10px]">{req.supervisorApproval.stamp}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-col gap-2">
                                <div className="flex gap-2">
                                    <button onClick={() => handleLeaveAction(req, true, activeTab === 'manager')} className="bg-emerald-500 text-white px-5 py-2 rounded-xl font-bold hover:bg-emerald-600 shadow-md transition-all flex-1">
                                        {t('sup.approve')}
                                    </button>
                                    <button onClick={() => handleLeaveAction(req, false, activeTab === 'manager')} className="bg-white border border-red-200 text-red-500 px-5 py-2 rounded-xl font-bold hover:bg-red-50 transition-all flex-1">
                                        {t('sup.reject')}
                                    </button>
                                </div>
                                <button onClick={() => handlePrintLeave(req)} className="bg-slate-100 text-slate-600 px-5 py-2 rounded-xl font-bold hover:bg-slate-200 transition-all flex items-center justify-center gap-2">
                                    <i className="fas fa-print"></i> {t('print')}
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default SupervisorLeaves;