const fs = require('fs');

let content = fs.readFileSync('pages/UserHistory.tsx', 'utf8');
const lines = content.split('\n');

const startIndex = lines.findIndex(l => l.includes('const handlePrintLeave = async'));
const endIndex = lines.findIndex(l => l.includes('<div className="max-w-5xl mx-auto px-4 py-8 animate-fade-in"'));

if (startIndex === -1 || endIndex === -1) {
    console.error("COULD NOT FIND INDICES", startIndex, endIndex);
    process.exit(1);
}

const before = lines.slice(0, startIndex).join('\n');
const after = lines.slice(endIndex - 1).join('\n'); // keep the return (

const middle = `
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

    const renderStamp = (name: string, jobTitle: string = 'Staff', hospital: string = 'AL JEDAANI HOSPITAL', approved: boolean = true) => {
        const rotation = (-3 - Math.random() * 5).toFixed(1);
        return \`
            <div class="stamp-box" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(\${rotation}deg); z-index: 50; pointer-events: none; \${!approved ? 'border-color: red; color: red;' : ''}">
                <div class="stamp-inner" style="\${!approved ? 'border-color: red;' : ''}">
                    <div class="stamp-hospital">AL JEDAANI HOSPITAL</div>
                    <div class="stamp-hospital" style="font-size: 9px; border-top: 1px dashed \${!approved ? 'red' : 'rgba(30, 58, 138, 0.4)'}; margin-top: 1px; padding-top: 1px;">RADIOLOGY DEPARTMENT</div>
                    <div class="stamp-dept" style="\${!approved ? 'color: red;' : ''}">\${jobTitle}</div>
                    <div class="stamp-name">\${name}</div>
                    <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; color: \${approved ? 'green' : 'red'}; opacity: 0.7; transform: rotate(-10deg);">
                        \${approved ? 'APPROVED' : 'NOT APPROVED'}
                    </div>
                </div>
            </div>
        \`;
    };

    const handlePrintLeave = async (leave: LeaveRequest) => {
        await handlePrintItem({ ...leave, titleEn: 'LEAVE REQUEST', titleAr: 'طلب إجازة', type: 'leave', userId: currentUserId });
    };

    const handlePrintSwap = async (swap: SwapRequest) => {
        await handlePrintItem({ ...swap, titleEn: 'SWAP REQUEST', titleAr: 'طلب تبديل', type: 'swap', userId: currentUserId });
    };

    const handlePrintItem = async (item: any) => {
        try {
            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                alert('Please allow popups to print the document.');
                return;
            }
            printWindow.document.write('<html><body><div style="text-align: center; margin-top: 50px; font-family: sans-serif;">Loading document...</div></body></html>');

            const isSwap = item.type === 'swap';
            const collectionName = isSwap ? 'swapRequests' : 'leaveRequests';
            const docRef = doc(db, collectionName, item.id);
            const docSnap = await getDoc(docRef);
            let fullData = docSnap.exists() ? docSnap.data() : item;

            const uDoc = await getDoc(doc(db, 'users', fullData.from || fullData.userId || item.userId || currentUserId));
            const uData = uDoc.exists() ? uDoc.data() : null;
            const userNameStr = uData ? (uData.name || fullData.from) : fullData.from;
            const userJobPosition = getJobTitle(uData);

            let relieversDataList: {name: string, job: string, approved: boolean}[] = [];
            let relieverName = '-';
            let relieverJob = 'Reliever';
            let relieverApproved = false;

            if (!isSwap) {
                const relieversList = fullData.relieverIds || [];
                if (relieversList.length > 0) {
                    for (const rId of relieversList) {
                        const rDoc = await getDoc(doc(db, 'users', rId));
                        let rName = rId;
                        let rJob = 'Reliever';
                        if (rDoc.exists()) {
                            const rd = rDoc.data();
                            rName = rd.name || rId;
                            rJob = getJobTitle(rd);
                        }
                        let rAppr = false;
                        if (fullData.relieverApprovals && fullData.relieverApprovals[rId]) {
                            rAppr = fullData.relieverApprovals[rId].approved;
                        }
                        relieversDataList.push({ name: rName, job: rJob, approved: rAppr });
                    }
                }
            } else {
                if (fullData.to) {
                    const rDoc = await getDoc(doc(db, 'users', fullData.to));
                    if (rDoc.exists()) {
                        const rd = rDoc.data();
                        relieverName = rd.name || fullData.to;
                        relieverJob = getJobTitle(rd);
                    } else {
                        relieverName = fullData.to;
                    }
                    relieverApproved = Boolean(fullData.status && fullData.status !== 'pending');
                }
            }

            let isApproved = fullData.status === 'confirmed' || fullData.status === 'approved' || fullData.status.toLowerCase().includes('approved');
            let supName = 'Supervisor';
            let supJob = 'Manager';
            let supApproved = false;
            let manName = 'Head of Dept';
            let manJob = 'Head of Dept';
            let manApproved = fullData.status === 'approved';
            let manRejected = fullData.status === 'rejected';

            if (fullData.supervisorApproval) {
                supName = fullData.supervisorApproval.name || supName;
                supApproved = fullData.supervisorApproval.approved;
            } else if (fullData.rejectedBySupervisor) {
                supApproved = false;
            } else if (fullData.status === 'approvedBySupervisor' || fullData.status === 'approvedByUser') {
                supApproved = true;
            }

            if (fullData.managerApproval) {
                manName = fullData.managerApproval.name || manName;
            }

            const logoUrl = new URL('/logo.png', window.location.origin).href;

            const printContent = \`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <title>\${item.titleEn} - \${userNameStr}</title>
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
                        .stamp-box { border: 3px solid #1e3a8a; border-radius: 6px; padding: 4px 8px; display: inline-block; color: #1e3a8a; text-align: center; font-family: 'Courier New', Courier, monospace; font-weight: bold; line-height: 1.1; background: transparent; margin: 2px auto; min-width: 100px; position: relative; text-transform: uppercase; }
                        .stamp-inner { border: 1px solid rgba(30, 58, 138, 0.5); padding: 2px; border-radius: 3px; }
                        .stamp-hospital { font-size: 8px; letter-spacing: 0.5px; margin-bottom: 1px; border-bottom: 1px dashed rgba(30, 58, 138, 0.4); padding-bottom: 1px; }
                        .stamp-dept { font-size: 10px; margin-bottom: 1px; color: #1e3a8a; }
                        .stamp-name { font-size: 12px; }
                        @media print { .print-container { border: 1px solid #1e3a8a; } }
                        .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); opacity: 0.06; width: 80%; max-width: 800px; z-index: -1; pointer-events: none; }
                    </style>
                </head>
                <body>
                    <img src="\${logoUrl}" class="watermark" alt="Watermark" crossorigin="anonymous" />
                    <div class="print-container">
                        <div class="header-section" style="display: flex; align-items: flex-start; justify-content: space-between;">
                            <div style="flex: 1; text-align: left; display: flex; flex-direction: column;">
                                <span style="font-weight: bold; font-size: 16px; color: #1e3a8a;">Radiology Department</span>
                                <span style="font-weight: bold; font-size: 18px; font-family: 'Cairo', sans-serif; color: #1e3a8a; margin-top: 2px;">قسم الأشعة</span>
                            </div>
                            
                            <div style="flex: 1.5; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; text-align: center;">
                                <img src="\${logoUrl}" alt="Logo" style="max-height: 80px;" crossOrigin="anonymous" />
                                <span style="font-weight: bold; font-size: 16px; color: #1e3a8a; letter-spacing: 1px; margin-top: 4px;">AL JEDAANI HOSPITAL</span>
                                <span style="font-weight: bold; font-size: 18px; font-family: 'Cairo', sans-serif; color: #1e3a8a; margin-top: -4px;">مستشفى الجدعاني</span>
                            </div>

                            <div style="flex: 1; display: flex; justify-content: flex-end;">
                                <div class="title-box">
                                    <div class="title-ar">\${item.titleAr}</div>
                                    <div class="title-en">\${item.titleEn}</div>
                                </div>
                            </div>
                        </div>
                        <div class="date-line">Date: \${fullData.startDate || item.startDate || '-'}</div>
                        <table>
                            <tr>
                                <td class="label-en">Name:</td>
                                <td class="value">\${userNameStr}</td>
                                <td class="label-ar">الاسم:</td>
                            </tr>
                            <tr>
                                <td class="label-en">Position:</td>
                                <td class="value">\${userJobPosition}</td>
                                <td class="label-ar">الوظيفة:</td>
                            </tr>
                            <tr>
                                <td class="label-en">Department:</td>
                                <td class="value">RADIOLOGY DEPARTMENT</td>
                                <td class="label-ar">القسم:</td>
                            </tr>
                            <tr>
                                <td class="label-en">Type:</td>
                                <td class="value">\${item.type}</td>
                                <td class="label-ar">النوع:</td>
                            </tr>
                            \${isSwap ? \`
                            <tr>
                                <td class="label-en">Details:</td>
                                <td class="value">\${fullData.details || '-'} → \${relieverName}</td>
                                <td class="label-ar">التفاصيل:</td>
                            </tr>
                            \` : ''}
                            <tr>
                                <td class="label-en">From:</td>
                                <td class="value">\${fullData.startDate || '-'}</td>
                                <td class="label-ar">من تاريخ:</td>
                            </tr>
                            <tr>
                                <td class="label-en">To:</td>
                                <td class="value">\${fullData.endDate || '-'}</td>
                                <td class="label-ar">حتي تاريخ:</td>
                            </tr>
                            <tr>
                                <td class="label-en">Signature:</td>
                                <td class="value" style="position: relative; height: 35px;">
                                    <div style="font-size: 11px; margin-bottom: 2px;">\${userNameStr}</div>
                                    \${renderStamp(userNameStr, userJobPosition, 'AL JEDAANI HOSPITAL')}
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
                            \${!isSwap ? \`
                                <tr>
                                    <td class="label-en">Reliever:</td>
                                    <td class="value">\${relieversDataList.map(r => r.name).join(', ')}</td>
                                    <td class="label-ar">الاسم البديل:</td>
                                </tr>
                                <tr>
                                    <td colspan="3" style="text-align: center; padding: 1px 2px;">
                                        <div style="display: flex; justify-content: space-between; font-weight: bold; margin-bottom: 2px;">
                                            <span>Signature of Reliever:</span>
                                            <span style="font-family: 'Cairo', sans-serif;">توقيع البديل:</span>
                                        </div>
                                        <div style="height: 35px; display: flex; align-items: center; justify-content: center; gap: 30px; width: 100%; position: relative;">
                                            \${relieversDataList.map((r) => r.approved ? \`<div style="position: relative; width: 120px; height: 10px;">\${renderStamp(r.name, r.job, 'AL JEDAANI HOSPITAL')}</div>\` : '').join('')}
                                        </div>
                                    </td>
                                </tr>
                            \` : \`
                                <tr>
                                    <td class="label-en">Reliever:</td>
                                    <td class="value">\${relieverName}</td>
                                    <td class="label-ar">الاسم البديل:</td>
                                </tr>
                                <tr>
                                    <td colspan="3" style="text-align: center; padding: 1px 2px;">
                                        <div style="display: flex; justify-content: space-between; font-weight: bold; margin-bottom: 2px;">
                                            <span>Signature of Reliever:</span>
                                            <span style="font-family: 'Cairo', sans-serif;">توقيع البديل:</span>
                                        </div>
                                        <div style="position: relative; height: 35px; width: 100%; display: flex; align-items: center; justify-content: center;">
                                            <div style="position: relative; width: 120px; height: 10px;">
                                                \${relieverApproved ? renderStamp(relieverName, relieverJob, 'AL JEDAANI HOSPITAL') : ''}
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            \`}
                            <tr>
                                <td class="label-en">Supervisor :</td>
                                <td class="value"></td>
                                <td class="label-ar">المشرف:</td>
                            </tr>
                            <tr>
                                <td colspan="3">
                                    <div style="display: flex; justify-content: space-between; padding: 0 30px; font-weight: bold;">
                                        \${supApproved ? \`
                                            <div class="checkbox-container"><div class="checkbox checked"></div><span>Approved</span></div>
                                            <div class="checkbox-container"><span>موافق</span><div class="checkbox checked"></div></div>
                                        \` : \`
                                            <div class="checkbox-container"><div class="checkbox \${!supApproved && fullData.status !== 'pending' ? 'checked' : ''}"></div><span>Disapproved</span></div>
                                            <div class="checkbox-container"><span>غير موافق</span><div class="checkbox \${!supApproved && fullData.status !== 'pending' ? 'checked' : ''}"></div></div>
                                        \`}
                                    </div>
                                </td>
                            </tr>
                            <tr>
                                <td class="label-en">Signature, Supervisor:</td>
                                <td class="value" style="position: relative; height: 35px; display: flex; align-items: center; justify-content: center; gap: 10px;">
                                    \${supApproved ? renderStamp(supName, supJob, 'AL JEDAANI HOSPITAL') : ''}
                                    <span style="font-weight: bold; position: relative; z-index: 60;">\${supName !== 'Supervisor' ? supName : ''}</span>
                                </td>
                                <td class="label-ar">توقيع المشرف:</td>
                            </tr>
                            \${!isSwap ? \`
                            <tr>
                                <td class="label-en">Date:</td>
                                <td class="value">\${fullData.managerApproval?.timestamp ? new Date(fullData.managerApproval.timestamp.seconds * 1000).toLocaleDateString() : '-'}</td>
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
                                        <div class="checkbox-container"><div class="checkbox \${manApproved ? 'checked' : ''}"></div><span>Approved</span></div>
                                        <div class="checkbox-container"><span>موافق</span><div class="checkbox \${manApproved ? 'checked' : ''}"></div></div>
                                    </div>
                                </td>
                            </tr>
                            <tr>
                                <td class="label-en">Reason:</td>
                                <td class="value">\${(fullData.status === 'rejected' || manRejected || fullData.status === 'rejectedBySupervisor') ? (fullData.managerApproval?.comment || fullData.supervisorApproval?.comment || fullData.details || '-') : '-'}</td>
                                <td class="label-ar">السبب :</td>
                            </tr>
                            <tr>
                                <td class="label-en">Signature, Head of Department:</td>
                                <td class="value" style="position: relative; height: 35px; display: flex; align-items: center; justify-content: center;">
                                    \${manApproved ? renderStamp(manName, manJob, 'AL JEDAANI HOSPITAL') : ''}
                                    <span style="font-weight: bold; position: relative; z-index: 60;">\${manName !== 'Head of Dept' ? manName : ''}</span>
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
                                <td colspan="3" style="height: 50px; text-align: center; position: relative;">
                                    
                                </td>
                            </tr>
                            \` : ''}
                        </table>
                    </div>
                </body>
                </html>
            \`;

            printWindow.document.open();
            printWindow.document.write(printContent);
            printWindow.document.close();
            setTimeout(() => {
                printWindow.focus();
                printWindow.print();
            }, 500);
            
        } catch (e) {
            console.error(e);
            alert("Error during printing");
        }
    };
`;

const res = before + '\n' + middle + '\n' + after;
fs.writeFileSync('pages/UserHistory.tsx', res);
console.log('Successfully completed script!');
