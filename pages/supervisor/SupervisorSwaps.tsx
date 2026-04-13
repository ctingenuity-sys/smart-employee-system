
import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
// @ts-ignore
import { collection, query, where, onSnapshot, doc, updateDoc, writeBatch, getDocs, Timestamp, getDoc, addDoc, QuerySnapshot, DocumentData } from 'firebase/firestore';
import { SwapRequest, Schedule, User, UserRole } from '../../types';
import Toast from '../../components/Toast';
import Modal from '../../components/Modal';
import { useLanguage } from '../../contexts/LanguageContext';
import { useDepartment } from '../../contexts/DepartmentContext';
import { useAuth } from '../../contexts/AuthContext';
// @ts-ignore
import { useNavigate } from 'react-router-dom';

const SupervisorSwaps: React.FC = () => {
    const { t, dir } = useLanguage();
    const navigate = useNavigate();
    const { selectedDepartmentId } = useDepartment();
    const { role: authRole, user: currentUser } = useAuth();
    
    // Data States
    const [pendingRequests, setPendingRequests] = useState<SwapRequest[]>([]);
    const [historyRequests, setHistoryRequests] = useState<SwapRequest[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    
    // UI States
    const [toast, setToast] = useState<{msg: string, type: 'success'|'error'} | null>(null);
    const [selectedReq, setSelectedReq] = useState<SwapRequest | null>(null);
    const [isOptionModalOpen, setIsOptionModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');

    // Exception Modal State
    const [isExceptionModalOpen, setIsExceptionModalOpen] = useState(false);
    const [exceptionDate, setExceptionDate] = useState('');
    const [exceptionTargetUser, setExceptionTargetUser] = useState('');
    const [currentMonthReq, setCurrentMonthReq] = useState<SwapRequest | null>(null);

    useEffect(() => {
        const qUsers = selectedDepartmentId 
            ? query(collection(db, 'users'), where('departmentId', '==', selectedDepartmentId))
            : collection(db, 'users');
            
        const unsubUsers = onSnapshot(qUsers, (snap: QuerySnapshot<DocumentData>) => {
            const fetchedUsers = snap.docs.map(d => ({ ...d.data(), id: d.id } as User));
            console.log('Debug: authRole', authRole);
            const filteredUsers = fetchedUsers.filter(u => {
                // Exclude admin/supervisor/manager
                if (['admin', 'supervisor', 'manager'].includes(u.role)) return false;

                // Doctor filtering logic
                if (authRole === UserRole.ADMIN) return true;
                
                const isAuthDoctor = (authRole && authRole.toLowerCase() === UserRole.DOCTOR.toLowerCase()) || (currentUser?.jobCategory && currentUser.jobCategory.toLowerCase() === 'doctor');
                const isUserDoctor = (u.role && u.role.toLowerCase() === UserRole.DOCTOR.toLowerCase()) || (u.jobCategory && u.jobCategory.toLowerCase() === 'doctor');
                
                if (isAuthDoctor) return isUserDoctor;
                
                console.log(`Debug: User ${u.name} role: ${u.role}, jobCategory: ${u.jobCategory}, isDoctor: ${isUserDoctor}, keep: ${!isUserDoctor}`);
                return !isUserDoctor;
            });
            setUsers(filteredUsers);
        });
        
        const withDept = (baseQuery: any) => selectedDepartmentId ? query(baseQuery, where('departmentId', '==', selectedDepartmentId)) : baseQuery;

        // Pending Requests
        const qPending = withDept(query(collection(db, 'swapRequests'), where('status', '==', 'approvedByUser')));
        const unsubPending = onSnapshot(qPending, (snap: QuerySnapshot<DocumentData>) => {
            const list = snap.docs.map(d => ({ ...d.data(), id: d.id } as SwapRequest));
            // Sort Pending by newest as well
            list.sort((a: any, b: any) => {
                const tA = a.createdAt?.seconds || 0;
                const tB = b.createdAt?.seconds || 0;
                return tB - tA;
            });
            // We will filter this in the render or using a separate effect that depends on users
            setPendingRequests(list);
        });

        // History/Active Requests (Approved Month Swaps for Revert capability)
        const qHistory = withDept(query(collection(db, 'swapRequests'), where('status', '==', 'approvedBySupervisor')));
        const unsubHistory = onSnapshot(qHistory, (snap: QuerySnapshot<DocumentData>) => {
            const list = snap.docs.map(d => ({ ...d.data(), id: d.id } as SwapRequest));
            
            // SORTING LOGIC: Newest First
            list.sort((a: any, b: any) => {
                const tA = a.createdAt?.seconds || 0;
                const tB = b.createdAt?.seconds || 0;
                return tB - tA; // Descending order
            });
            
            setHistoryRequests(list);
        });

        return () => { unsubUsers(); unsubPending(); unsubHistory(); };
    }, []);

    const getUserName = (id: string) => users.find(u => u.id === id)?.name || id;

    // Helper to identify Friday shifts
    const isFridayShift = (sch: Schedule) => {
        const loc = (sch.locationId || '').toLowerCase();
        const note = (sch.note || '').toLowerCase();
        
        // Check text markers
        if (loc.includes('friday') || loc.includes('الجمعة') || note.includes('friday') || note.includes('الجمعة')) return true;
        
        // Check specific date
        if (sch.date) {
            const d = new Date(sch.date);
            if (d.getDay() === 5) return true; // 5 is Friday
        }
        
        return false;
    };

    // Helper logic for resolving shift time (Day Swap)
    const resolveShiftForUserDate = (userId: string, dateStr: string, schedules: Schedule[]) => {
        const userSchedules = schedules.filter(s => s.userId === userId);
        const dayOfWeek = new Date(dateStr).getDay();
        const specific = userSchedules.find(s => s.date === dateStr);
        if (specific) return specific;
        return userSchedules.find(sch => {
            if (sch.date) return false;
            let applies = false;
            const isFri = isFridayShift(sch);
            if (dayOfWeek === 5) { if (isFri) applies = true; } else { if (!isFri && !(sch.locationId || '').includes('Holiday')) applies = true; }
            if (applies) {
                if (sch.validFrom && dateStr < sch.validFrom) applies = false;
                if (sch.validTo && dateStr > sch.validTo) applies = false;
            }
            return applies;
        });
    };

    const [isCleaning, setIsCleaning] = useState(false);

    const handleCleanOrphanedSwaps = async () => {
        if (!confirm('Are you sure you want to clean up orphaned swap schedules? This will delete swap schedules that have no corresponding swap request.')) return;
        setIsCleaning(true);
        try {
            // 1. Get all swap requests
            const qReqs = query(collection(db, 'swapRequests'));
            const reqsSnap = await getDocs(qReqs);
            const validSwapDatesByUser: Record<string, Set<string>> = {};
            
            reqsSnap.docs.forEach(d => {
                const data = d.data();
                if (data.status === 'approvedBySupervisor' && data.startDate) {
                    if (!validSwapDatesByUser[data.from]) validSwapDatesByUser[data.from] = new Set();
                    if (!validSwapDatesByUser[data.to]) validSwapDatesByUser[data.to] = new Set();
                    
                    if (data.type === 'day') {
                        validSwapDatesByUser[data.from].add(data.startDate);
                        validSwapDatesByUser[data.to].add(data.startDate);
                    } else if (data.type === 'period' && data.endDate) {
                        const dates = getDatesInRange(data.startDate, data.endDate);
                        dates.forEach(date => {
                            validSwapDatesByUser[data.from].add(date);
                            validSwapDatesByUser[data.to].add(date);
                        });
                    }
                }
            });

            // 2. Get all schedules that are swaps
            const qSch = query(collection(db, 'schedules'));
            const schSnap = await getDocs(qSch);
            
            const batch = writeBatch(db);
            let deleteCount = 0;

            schSnap.docs.forEach(d => {
                const data = d.data();
                const isSwap = (data.locationId && data.locationId.toString().includes('Swap Duty')) || 
                               (data.note && data.note.toString().includes('Swap Approved'));
                
                if (isSwap && data.date) {
                    const userId = data.userId;
                    const date = data.date;
                    
                    // If this user doesn't have a valid swap request for this date, delete it
                    if (!validSwapDatesByUser[userId] || !validSwapDatesByUser[userId].has(date)) {
                        batch.delete(d.ref);
                        deleteCount++;
                    }
                }
            });

            if (deleteCount > 0) {
                await batch.commit();
                setToast({ msg: `Cleaned ${deleteCount} orphaned swap schedules.`, type: 'success' });
            } else {
                setToast({ msg: 'No orphaned swap schedules found.', type: 'success' });
            }
        } catch (error) {
            console.error("Error cleaning orphaned swaps:", error);
            setToast({ msg: 'Error cleaning orphaned swaps.', type: 'error' });
        }
        setIsCleaning(false);
    };

    // Helper to get dates in range
    const getDatesInRange = (startDate: string, endDate: string) => {
        const date = new Date(startDate);
        const end = new Date(endDate);
        const dates = [];
        while (date <= end) {
            dates.push(new Date(date).toISOString().slice(0, 10));
            date.setDate(date.getDate() + 1);
        }
        return dates;
    };

    // Open Modal for Month Swaps
    const initiateApproval = (req: SwapRequest) => {
        if (req.type === 'month' || req.type === 'period') {
            setSelectedReq(req);
            setIsOptionModalOpen(true);
        } else {
            handleSwapAction(req, true, false); // Day swap doesn't need friday options
        }
    };

    const handlePrintSwap = async (swap: SwapRequest) => {
        try {
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

            // Fetch the requester's details
            const uDoc = await getDoc(doc(db, 'users', swap.from));
            const userData = uDoc.exists() ? uDoc.data() : null;
            const userName = userData?.name || swap.from;
            const userJobPosition = getJobTitle(userData);

            // Fetch the reliever's details
            const rDoc = await getDoc(doc(db, 'users', swap.to));
            const relieverData = rDoc.exists() ? rDoc.data() : null;
            const relieverName = relieverData?.name || swap.to;
            const relieverJobPosition = getJobTitle(relieverData);

            // Fetch supervisor details
            let supervisorJob = '-';
            let supervisorName = '-';
            const supApp = (swap as any).supervisorApproval;
            if (supApp?.uid) {
                const sDoc = await getDoc(doc(db, 'users', supApp.uid));
                if (sDoc.exists()) {
                    const sData = sDoc.data();
                    supervisorName = sData.name || supApp.uid;
                    supervisorJob = sData.role || supApp.jobTitle || getJobTitle(sData);
                }
            }

            const departmentName = 'RADIOLOGY DEPARTMENT';
            const logoUrl = new URL('/logo.png', window.location.origin).href;

            const renderStamp = (name: string, jobTitle: string = 'Staff', hospital: string = 'AL JEDAANI HOSPITAL', approved: boolean = true) => {
                const rotation = (Math.random() * 6 - 3).toFixed(1);
                return `
                    <div class="stamp-box" style="transform: rotate(${rotation}deg); position: absolute; top: -15px; left: 50%; transform: translateX(-50%) rotate(${rotation}deg); z-index: 50; pointer-events: none; ${!approved ? 'border-color: red; color: red;' : ''}">
                        <div class="stamp-inner" style="${!approved ? 'border-color: red;' : ''}">
                            <div class="stamp-hospital">AL JEDAANI HOSPITAL</div>
                            <div class="stamp-hospital" style="font-size: 9px; border-top: 1px dashed ${!approved ? 'red' : 'rgba(30, 58, 138, 0.4)'}; margin-top: 1px; padding-top: 1px;">RADIOLOGY DEPARTMENT</div>
                            <div class="stamp-dept" style="${!approved ? 'color: red;' : ''}">${jobTitle}</div>
                            <div class="stamp-name">${name}</div>
                            <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; color: ${approved ? 'green' : 'red'}; opacity: 0.7; transform: rotate(-10deg);">
                                ${approved ? 'APPROVED' : 'NOT APPROVED'}
                            </div>
                        </div>
                    </div>
                `;
            };

            const htmlContent = `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <title>Swap Request - ${userName}</title>
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
                            </div>
                            <div class="title-box">
                                <div class="title-ar">طلب تبديل</div>
                                <div class="title-en">SWAP REQUEST</div>
                            </div>
                        </div>

                        <div class="date-line">
                            Date: ${swap.createdAt ? new Date(swap.createdAt.seconds * 1000).toLocaleDateString() : ''}
                        </div>

                        <table>
                            <tr>
                                <td class="label-en">Name:</td>
                                <td class="value">${userName}</td>
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
                                <td class="label-en">Type of Swap:</td>
                                <td class="value">${swap.type || '-'}</td>
                                <td class="label-ar">نوع التبديل:</td>
                            </tr>
                            <tr>
                                <td class="label-en">Details:</td>
                                <td class="value">${swap.details || '-'}</td>
                                <td class="label-ar">التفاصيل:</td>
                            </tr>
                            <tr>
                                <td class="label-en">From:</td>
                                <td class="value">${swap.startDate || '-'}</td>
                                <td class="label-ar">من تاريخ:</td>
                            </tr>
                            <tr>
                                <td class="label-en">To:</td>
                                <td class="value">${swap.endDate || '-'}</td>
                                <td class="label-ar">حتي تاريخ:</td>
                            </tr>
                            <tr>
                                <td class="label-en">Signature:</td>
                                <td class="value" style="position: relative; height: 60px;">
                                    <div style="font-size: 11px; margin-bottom: 2px;">${userName}</div>
                                    ${renderStamp(userName, userJobPosition, 'AL JEDAANI HOSPITAL')}
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
                                <td class="label-en">Reliever:</td>
                                <td class="value">${relieverName}</td>
                                <td class="label-ar">الاسم البديل:</td>
                            </tr>
                            <tr>
                                <td class="label-en">Signature of Reliever:</td>
                                <td class="value" style="position: relative; height: 60px;">
                                    ${(swap.status === 'approvedByUser' || swap.status === 'approvedBySupervisor' || swap.status === 'rejectedBySupervisor') ? renderStamp(relieverName, relieverJobPosition, 'AL JEDAANI HOSPITAL', true) : ''}
                                </td>
                                <td class="label-ar">توقيع البديل:</td>
                            </tr>
                            <tr>
                                <td class="label-en">Supervisor :</td>
                                <td class="value"></td>
                                <td class="label-ar">المشرف:</td>
                            </tr>
                            <tr>
                                <td colspan="3">
                                    <div style="display: flex; justify-content: space-between; padding: 0 30px; font-weight: bold;">
                                        ${swap.status === 'approvedBySupervisor' ? `
                                            <div class="checkbox-container">
                                                <div class="checkbox checked"></div>
                                                <span>Approved</span>
                                            </div>
                                            <div class="checkbox-container">
                                                <span>موافق</span>
                                                <div class="checkbox checked"></div>
                                            </div>
                                        ` : `
                                            <div class="checkbox-container">
                                                <div class="checkbox ${swap.status === 'rejectedBySupervisor' ? 'checked' : ''}"></div>
                                                <span>Disapproved</span>
                                            </div>
                                            <div class="checkbox-container">
                                                <span>غير موافق</span>
                                                <div class="checkbox ${swap.status === 'rejectedBySupervisor' ? 'checked' : ''}"></div>
                                            </div>
                                        `}
                                    </div>
                                </td>
                            </tr>
                            <tr>
                                <td class="label-en">Reason:</td>
                                <td class="value">${swap.status === 'rejectedBySupervisor' && (swap as any).supervisorApproval?.comment ? (swap as any).supervisorApproval.comment : ''}</td>
                                <td class="label-ar">السبب :</td>
                            </tr>
                            <tr>
                                <td class="label-en">Signature, Supervisor:</td>
                                <td class="value" style="position: relative; height: 60px; display: flex; align-items: center; gap: 10px; min-width: 350px;">
                                    ${(swap.status === 'approvedBySupervisor' || swap.status === 'rejectedBySupervisor') ? renderStamp(supervisorName, supervisorJob, 'AL JEDAANI HOSPITAL', swap.status === 'approvedBySupervisor') : ''}
                                    ${(swap.status === 'approvedBySupervisor' || swap.status === 'rejectedBySupervisor') ? `<span style="font-weight: bold;">${supervisorName}</span>` : ''}
                                </td>
                                <td class="label-ar">توقيع المشرف :</td>
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
            console.error("Error printing swap request:", error);
        }
    };

    const handleSwapAction = async (req: SwapRequest, isApproved: boolean, excludeFridays: boolean = false) => {
      try {
          const status = isApproved ? 'approvedBySupervisor' : 'rejectedBySupervisor';
          
          if (isApproved && req.startDate) {
              const batch = writeBatch(db);
              const nameA = getUserName(req.from);
              const nameB = getUserName(req.to);

              if (req.type === 'month') {
                  // --- MONTH SWAP LOGIC ---
                  const targetMonth = req.startDate.slice(0, 7); // YYYY-MM

                  // 1. Get User A's schedules
                  const qA = query(collection(db, 'schedules'), where('userId', '==', req.from), where('month', '==', targetMonth));
                  const snapA = await getDocs(qA);

                  // 2. Get User B's schedules
                  const qB = query(collection(db, 'schedules'), where('userId', '==', req.to), where('month', '==', targetMonth));
                  const snapB = await getDocs(qB);

                  let count = 0;

                  // Move A's tickets to B
                  snapA.docs.forEach(d => {
                      const sch = d.data() as Schedule;
                      if (excludeFridays && isFridayShift(sch)) return; // Skip if Excluding Fridays

                      batch.update(d.ref, {
                          userId: req.to,
                          staffName: nameB,
                          note: (sch.note || '') + ` - Month Swap: Was ${nameA}`,
                          updatedAt: Timestamp.now()
                      });
                      count++;
                  });

                  // Move B's tickets to A
                  snapB.docs.forEach(d => {
                      const sch = d.data() as Schedule;
                      if (excludeFridays && isFridayShift(sch)) return; // Skip if Excluding Fridays

                      batch.update(d.ref, {
                          userId: req.from,
                          staffName: nameA,
                          note: (sch.note || '') + ` - Month Swap: Was ${nameB}`,
                          updatedAt: Timestamp.now()
                      });
                      count++;
                  });

                  // Store the option chosen in the request for reference/revert
                  batch.update(doc(db, 'swapRequests', req.id), { 
                      status, 
                      swapOption: excludeFridays ? 'exclude_fridays' : 'full_month'
                  });

                  setToast({ msg: `Month Swapped! (${count} shifts moved)`, type: 'success' });

              } else if (req.type === 'period' && req.startDate && req.endDate) {
                  // --- PERIOD SWAP LOGIC ---
                  const dates = getDatesInRange(req.startDate, req.endDate);
                  const months = new Set<string>();
                  dates.forEach(d => {
                      months.add(d.slice(0, 7));
                      const dateObj = new Date(d);
                      dateObj.setMonth(dateObj.getMonth() - 1);
                      months.add(dateObj.toISOString().slice(0, 7));
                  });
                  const monthList = Array.from(months).slice(0, 10);

                  const qSch = query(collection(db, 'schedules'), where('month', 'in', monthList));
                  const snap = await getDocs(qSch);
                  const allSchedules = snap.docs.map(d => d.data() as Schedule);

                  let count = 0;
                  for (const dateStr of dates) {
                      const dObj = new Date(dateStr);
                      if (excludeFridays && dObj.getDay() === 5) continue;

                      const shiftA = resolveShiftForUserDate(req.from, dateStr, allSchedules);
                      const shiftB = resolveShiftForUserDate(req.to, dateStr, allSchedules);

                      const newDocA = doc(collection(db, 'schedules'));
                      batch.set(newDocA, {
                          userId: req.from,
                          staffName: nameA,
                          date: dateStr,
                          month: dateStr.slice(0, 7),
                          locationId: shiftB ? `Swap Duty - ${shiftB.locationId}` : 'Swap Duty - Off',
                          shifts: shiftB ? (shiftB.shifts || []) : [],
                          note: `Swap Approved: Covering ${nameB}`,
                          userType: 'user',
                          departmentId: selectedDepartmentId || null,
                          createdAt: Timestamp.now()
                      });

                      const newDocB = doc(collection(db, 'schedules'));
                      batch.set(newDocB, {
                          userId: req.to,
                          staffName: nameB,
                          date: dateStr,
                          month: dateStr.slice(0, 7),
                          locationId: shiftA ? `Swap Duty - ${shiftA.locationId}` : 'Swap Duty - Off',
                          shifts: shiftA ? (shiftA.shifts || []) : [],
                          note: `Swap Approved: Covered by ${nameA}`,
                          userType: 'user',
                          departmentId: selectedDepartmentId || null,
                          createdAt: Timestamp.now()
                      });
                      count++;
                  }

                  batch.update(doc(db, 'swapRequests', req.id), { 
                      status, 
                      swapOption: excludeFridays ? 'exclude_fridays' : 'full_period'
                  });
                  setToast({ msg: `Period Swapped! (${count} days)`, type: 'success' });

              } else {
                  // --- DAY SWAP LOGIC (Existing) ---
                  const currentMonth = req.startDate.slice(0, 7);
                  const d = new Date(req.startDate);
                  d.setMonth(d.getMonth() - 1);
                  const prevMonth = d.toISOString().slice(0, 7);

                  const qSch = query(
                      collection(db, 'schedules'), 
                      where('month', 'in', [prevMonth, currentMonth])
                  );
                  
                  const snap = await getDocs(qSch);
                  const allSchedules = snap.docs.map(d => d.data() as Schedule);

                  const shiftA = resolveShiftForUserDate(req.from, req.startDate, allSchedules);
                  const shiftB = resolveShiftForUserDate(req.to, req.startDate, allSchedules);

                  const newDocA = doc(collection(db, 'schedules'));
                  batch.set(newDocA, {
                      userId: req.from,
                      staffName: nameA,
                      date: req.startDate,
                      month: currentMonth,
                      locationId: shiftB ? `Swap Duty - ${shiftB.locationId}` : 'Swap Duty - Off',
                      shifts: shiftB ? (shiftB.shifts || []) : [],
                      note: `Swap Approved: Covering ${nameB}`,
                      userType: 'user',
                      departmentId: selectedDepartmentId || null,
                      createdAt: Timestamp.now()
                  });

                  const newDocB = doc(collection(db, 'schedules'));
                  batch.set(newDocB, {
                      userId: req.to,
                      staffName: nameB,
                      date: req.startDate,
                      month: currentMonth,
                      locationId: shiftA ? `Swap Duty - ${shiftA.locationId}` : 'Swap Duty - Off',
                      shifts: shiftA ? (shiftA.shifts || []) : [],
                      note: `Swap Approved: Covered by ${nameA}`,
                      userType: 'user',
                      departmentId: selectedDepartmentId || null,
                      createdAt: Timestamp.now()
                  });
                  
                  batch.update(doc(db, 'swapRequests', req.id), { status });
                  setToast({ msg: `Day Swap Approved!`, type: 'success' });
              }

              await batch.commit();

          } else {
              // Reject
              await updateDoc(doc(db, 'swapRequests', req.id), { status });
              setToast({ msg: `Request Rejected`, type: 'success' });
          }
          
          setIsOptionModalOpen(false);
          setSelectedReq(null);

      } catch (e: any) { 
          setToast({ msg: 'Error: ' + e.message, type: 'error' }); 
      }
    };

    // --- REVERT FUNCTIONALITY ---
    const handleRevertSwap = async (req: SwapRequest) => {
        if (!confirm('هل أنت متأكد من إلغاء هذا التبديل وإعادة الجداول لأصحابها تماماً؟')) return;
        
        try {
            const batch = writeBatch(db);
            
            // Helper to clean notes from swap text
            const cleanNote = (note: string) => {
                return note.replace(/ ?-? ?Month Swap: Was.+/gi, '').trim();
            };

            if (req.type === 'month') {
                const nameA = getUserName(req.from); // Original Owner A
                const nameB = getUserName(req.to);   // Original Owner B
                const targetMonth = req.startDate ? req.startDate.slice(0, 7) : '';

                // 1. Find tickets currently with User A (that were originally B's)
                const qA_holding_B = query(
                    collection(db, 'schedules'), 
                    where('userId', '==', req.from), 
                    where('month', '==', targetMonth)
                );
                // 2. Find tickets currently with User B (that were originally A's)
                const qB_holding_A = query(
                    collection(db, 'schedules'), 
                    where('userId', '==', req.to), 
                    where('month', '==', targetMonth)
                );

                const snapA = await getDocs(qA_holding_B);
                const snapB = await getDocs(qB_holding_A);

                // Revert B's tickets (currently at A) back to B
                snapA.docs.forEach(d => {
                    const data = d.data() as Schedule;
                    // Check if this ticket was part of a swap
                    if ((data.note || '').includes('Month Swap: Was')) {
                        batch.update(d.ref, {
                            userId: req.to, // Give back to B
                            staffName: nameB,
                            note: cleanNote(data.note || ''), // Remove swap text
                            updatedAt: Timestamp.now()
                        });
                    }
                });

                // Revert A's tickets (currently at B) back to A
                snapB.docs.forEach(d => {
                    const data = d.data() as Schedule;
                    if ((data.note || '').includes('Month Swap: Was')) {
                        batch.update(d.ref, {
                            userId: req.from, // Give back to A
                            staffName: nameA,
                            note: cleanNote(data.note || ''), // Remove swap text
                            updatedAt: Timestamp.now()
                        });
                    }
                });

            } else if (req.type === 'period' && req.startDate && req.endDate) {
                // --- PERIOD SWAP REVERT ---
                const dates = getDatesInRange(req.startDate, req.endDate);
                
                for (const dateStr of dates) {
                     const qDaySwaps = query(
                        collection(db, 'schedules'),
                        where('date', '==', dateStr),
                        where('note', '>=', 'Swap Approved'),
                        where('note', '<=', 'Swap Approved\uf8ff')
                    );
                    const snapDay = await getDocs(qDaySwaps);
                    snapDay.docs.forEach(d => {
                        const data = d.data();
                        if (data.userId === req.from || data.userId === req.to) {
                            batch.delete(d.ref);
                        }
                    });
                }

            } else {
                // --- DAY SWAP REVERT ---
                // Find and DELETE the specific schedule docs created for this day
                const qDaySwaps = query(
                    collection(db, 'schedules'),
                    where('date', '==', req.startDate),
                    where('note', '>=', 'Swap Approved'),
                    where('note', '<=', 'Swap Approved\uf8ff')
                );
                
                const snapDay = await getDocs(qDaySwaps);
                snapDay.docs.forEach(d => {
                    // Only delete docs belonging to these two users
                    const data = d.data();
                    if (data.userId === req.from || data.userId === req.to) {
                        batch.delete(d.ref);
                    }
                });
            }

            // Change status to 'rejected' so it disappears from "Active History" 
            batch.update(doc(db, 'swapRequests', req.id), { status: 'rejected' });

            await batch.commit();
            setToast({ msg: `تم إلغاء التبديل وإعادة الجداول لحالتها الأصلية.`, type: 'success' });

        } catch (e: any) {
            console.error(e);
            setToast({ msg: 'Revert Error: ' + e.message, type: 'error' });
        }
    };

    // --- EXCEPTION DAY HANDLER (Swap Back Specific Day) ---
    const handleOpenException = (req: SwapRequest) => {
        setCurrentMonthReq(req);
        // Default to reversing the swap: If User A holds the month, target is User B (original owner)
        // Since 'req.to' is holding 'req.from' shifts usually (or vice versa), let's default to the *original requester* (req.from)
        // Actually, we should check who holds the month now.
        // req.from sent to req.to. So req.to holds req.from's shift.
        // If we want to swap back, we take from req.to and give to req.from.
        setExceptionTargetUser(req.from); 
        setExceptionDate(req.startDate || '');
        setIsExceptionModalOpen(true);
    };

    const confirmExceptionSwap = async () => {
        if (!currentMonthReq || !exceptionDate || !exceptionTargetUser) return;
        
        try {
            // Who currently "owns" the shift for this month?
            // In a Month Swap (A -> B), B holds A's shift.
            // We want to move this specific day from [Current Holder] to [Target User].
            
            // Note: Since Month Swap physically moved the shift to B, B is the current owner in DB.
            // We just need to perform a "Day Swap" logic where:
            // FROM: The person currently working (likely req.to or req.from depending on perspective)
            // TO: The person we selected (exceptionTargetUser)
            
            // To be safe, we query the schedule for this date/month to find the *actual* shift object
            // regardless of who holds it, then re-assign it for this specific day.
            
            const monthStr = exceptionDate.slice(0, 7);
            const targetName = getUserName(exceptionTargetUser);

            // 1. Find ANY schedule for the original participants on this date/month
            // We search for schedules belonging to either A or B for this month.
            const qSch = query(
                collection(db, 'schedules'),
                where('month', '==', monthStr),
                where('userId', 'in', [currentMonthReq.from, currentMonthReq.to])
            );
            
            const snap = await getDocs(qSch);
            const schedules = snap.docs.map(d => d.data() as Schedule);
            
            // We need to find the shift that is ACTIVE on this day.
            // Since it's a month swap, the 'userId' field in DB reflects the current worker.
            // We want to find the shift currently assigned to the OTHER person, and give it to 'exceptionTargetUser'.
            
            // Identify the "Current Holder" who needs to give up the shift
            // It is the person who is NOT the 'exceptionTargetUser'
            const currentHolderId = (currentMonthReq.from === exceptionTargetUser) ? currentMonthReq.to : currentMonthReq.from;
            const currentHolderName = getUserName(currentHolderId);

            // Resolve shift for the Current Holder
            const shiftToSwap = resolveShiftForUserDate(currentHolderId, exceptionDate, schedules);
            
            if (!shiftToSwap) {
                setToast({ msg: 'No shift found for the current holder on this date.', type: 'error' });
                return;
            }

            // Create Exception (Day Override)
            await addDoc(collection(db, 'schedules'), {
                userId: exceptionTargetUser,
                staffName: targetName,
                date: exceptionDate,
                month: monthStr,
                locationId: `Swap Duty - ${shiftToSwap.locationId}`,
                shifts: shiftToSwap.shifts || [],
                note: `Day Exception (Month Swap Override) - Was ${currentHolderName}`,
                userType: 'user',
                departmentId: selectedDepartmentId || null,
                createdAt: Timestamp.now()
            });

            // We also need to make sure the Current Holder doesn't show up.
            // We create an "Off" or "Swap Duty - Off" ticket for them for this day.
            await addDoc(collection(db, 'schedules'), {
                userId: currentHolderId,
                staffName: currentHolderName,
                date: exceptionDate,
                month: monthStr,
                locationId: 'Swap Duty - Off', // Marker for OFF
                shifts: [],
                note: `Day Exception - Covered by ${targetName}`,
                userType: 'user',
                departmentId: selectedDepartmentId || null,
                createdAt: Timestamp.now()
            });

            setToast({ msg: 'تم استثناء اليوم وتبديله بنجاح!', type: 'success' });
            setIsExceptionModalOpen(false);

        } catch (e: any) {
            console.error(e);
            setToast({ msg: 'Error: ' + e.message, type: 'error' });
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
                    <h1 className="text-2xl font-black text-slate-800">{t('sup.swapReqs')}</h1>
                </div>
                
                <div className="flex items-center gap-4">
                    <button 
                        onClick={handleCleanOrphanedSwaps}
                        disabled={isCleaning}
                        className="bg-rose-50 text-rose-600 px-4 py-2 rounded-xl font-bold hover:bg-rose-100 transition-colors flex items-center gap-2 text-xs"
                        title="Delete swap schedules that have no corresponding swap request"
                    >
                        <i className={`fas ${isCleaning ? 'fa-spinner fa-spin' : 'fa-broom'}`}></i> 
                        {isCleaning ? 'Cleaning...' : 'Clean Orphaned Swaps'}
                    </button>

                    <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button 
                            onClick={() => setActiveTab('pending')}
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'pending' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}
                        >
                            Pending ({pendingRequests.length})
                        </button>
                        <button 
                            onClick={() => setActiveTab('history')}
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'history' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                        >
                            Active History
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid gap-4">
                {(activeTab === 'pending' ? pendingRequests : historyRequests)
                    .filter(req => users.some(u => u.id === req.from))
                    .length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200 text-slate-400">
                        {activeTab === 'pending' ? 'No pending requests' : 'No active history'}
                    </div>
                ) : (
                    (activeTab === 'pending' ? pendingRequests : historyRequests)
                        .filter(req => users.some(u => u.id === req.from))
                        .map(req => (
                        <div key={req.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4 group hover:border-indigo-200 transition-colors">
                            <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl shadow-sm ${req.status === 'approvedBySupervisor' ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}>
                                    <i className="fas fa-exchange-alt"></i>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 font-bold text-slate-800 text-lg">
                                        <span>{getUserName(req.from)}</span>
                                        <i className="fas fa-arrow-right text-slate-300 text-xs"></i>
                                        <span>{getUserName(req.to)}</span>
                                    </div>
                                    <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
                                        <span className={`bg-slate-100 px-2 py-0.5 rounded font-bold ${req.type === 'month' ? 'text-indigo-600' : 'text-slate-600'}`}>
                                            {req.type === 'month' ? `MONTH: ${req.startDate?.slice(0,7)}` : req.type === 'period' ? `${req.startDate} > ${req.endDate}` : req.startDate}
                                        </span>
                                        {req.details && <span className="italic text-slate-400">"{req.details}"</span>}
                                        {(req as any).swapOption === 'exclude_fridays' && (
                                            <span className="text-[10px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded font-bold">No Fridays</span>
                                        )}
                                    </p>
                                </div>
                            </div>
                            
                            <div className="flex flex-col gap-2">
                                {activeTab === 'pending' ? (
                                    <>
                                        <div className="flex gap-2">
                                            <button onClick={() => initiateApproval(req)} className="bg-emerald-500 text-white px-5 py-2 rounded-xl font-bold hover:bg-emerald-600 shadow-md transition-all text-sm flex-1">
                                                {t('sup.approve')}
                                            </button>
                                            <button onClick={() => handleSwapAction(req, false)} className="bg-white border border-red-200 text-red-500 px-5 py-2 rounded-xl font-bold hover:bg-red-50 transition-all text-sm flex-1">
                                                {t('sup.reject')}
                                            </button>
                                        </div>
                                        <button onClick={() => handlePrintSwap(req)} className="bg-slate-100 text-slate-600 px-5 py-2 rounded-xl font-bold hover:bg-slate-200 transition-all flex items-center justify-center gap-2">
                                            <i className="fas fa-print"></i> {t('print')}
                                        </button>
                                    </>
                                ) : (
                                    // HISTORY ACTIONS: REVERT & EXCEPTION
                                    <div className="flex gap-2">
                                        <button onClick={() => handlePrintSwap(req)} className="bg-slate-100 text-slate-600 px-4 py-2 rounded-xl font-bold hover:bg-slate-200 transition-all text-xs flex items-center gap-2 shadow-sm">
                                            <i className="fas fa-print"></i> {t('print')}
                                        </button>
                                        {req.type === 'month' && (
                                            <button 
                                                onClick={() => handleOpenException(req)}
                                                className="bg-amber-50 text-amber-700 px-4 py-2 rounded-xl font-bold hover:bg-amber-100 border border-amber-200 transition-all text-xs flex items-center gap-2"
                                                title="تبديل يوم محدد داخل الشهر"
                                            >
                                                <i className="fas fa-calendar-day"></i> استثناء يوم
                                            </button>
                                        )}
                                        <button onClick={() => handleRevertSwap(req)} className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-xl font-bold hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all text-xs flex items-center gap-2 shadow-sm">
                                            <i className="fas fa-undo"></i> إلغاء التبديل
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Modal for Month/Period Swap Options */}
            <Modal isOpen={isOptionModalOpen} onClose={() => setIsOptionModalOpen(false)} title={selectedReq?.type === 'period' ? "خيارات تبديل الفترة" : "خيارات تبديل الشهر"}>
                <div className="space-y-4 text-center">
                    <p className="text-slate-600 mb-4 font-bold">
                        {selectedReq?.type === 'period' 
                            ? `موافقة على الفترة من ${selectedReq.startDate} إلى ${selectedReq.endDate}`
                            : 'كيف تريد تنفيذ تبديل الشهر؟'}
                    </p>
                    
                    <button 
                        onClick={() => selectedReq && handleSwapAction(selectedReq, true, false)}
                        className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold shadow-lg hover:bg-indigo-700 flex items-center justify-center gap-2"
                    >
                        <i className="fas fa-calendar-alt"></i>
                        {selectedReq?.type === 'period' ? 'تبديل الفترة بالكامل' : 'تبديل الشهر بالكامل'}
                        <span className="text-xs font-normal opacity-80">(يشمل الجمع)</span>
                    </button>

                    <button 
                        onClick={() => selectedReq && handleSwapAction(selectedReq, true, true)}
                        className="w-full bg-white border-2 border-indigo-100 text-indigo-700 py-4 rounded-xl font-bold hover:bg-indigo-50 flex items-center justify-center gap-2"
                    >
                        <i className="fas fa-calendar-minus"></i>
                        {selectedReq?.type === 'period' ? 'تبديل الفترة' : 'تبديل الشهر'}
                        <span className="text-red-500 font-black">(بدون الجمع)</span>
                    </button>

                    <button 
                        onClick={() => setIsOptionModalOpen(false)}
                        className="text-slate-400 text-sm mt-2 hover:text-slate-600"
                    >
                        إلغاء
                    </button>
                </div>
            </Modal>

            {/* Exception Day Modal */}
            <Modal isOpen={isExceptionModalOpen} onClose={() => setIsExceptionModalOpen(false)} title="استثناء يوم (تبديل جزئي)">
                <div className="space-y-4">
                    <div className="bg-amber-50 p-3 rounded-xl text-amber-800 text-xs font-bold border border-amber-200">
                        <i className="fas fa-info-circle mr-1"></i> سيتم إنشاء "تبديل يومي" للتاريخ المحدد، مما يغطي على التبديل الشهري لهذا اليوم فقط.
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">اختر التاريخ</label>
                        <input 
                            type="date" 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold"
                            value={exceptionDate}
                            onChange={e => setExceptionDate(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">الموظف البديل لهذا اليوم</label>
                        <select 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold"
                            value={exceptionTargetUser}
                            onChange={e => setExceptionTargetUser(e.target.value)}
                        >
                            <option value="">اختر موظف...</option>
                            {/* Option 1: The original requester (Swap Back) */}
                            {currentMonthReq && (
                                <>
                                    <option value={currentMonthReq.from}>
                                        {getUserName(currentMonthReq.from)} (إرجاع للأصل)
                                    </option>
                                    <option value={currentMonthReq.to}>
                                        {getUserName(currentMonthReq.to)} (تثبيت للبديل)
                                    </option>
                                </>
                            )}
                            <option disabled>-----------</option>
                            {/* Option 2: Anyone else */}
                            {users.map(u => (
                                <option key={u.id} value={u.id}>{u.name || u.email}</option>
                            ))}
                        </select>
                    </div>

                    <button 
                        onClick={confirmExceptionSwap}
                        className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-black transition-all"
                    >
                        تأكيد التبديل الجزئي
                    </button>
                </div>
            </Modal>

        </div>
    );
};

export default SupervisorSwaps;
