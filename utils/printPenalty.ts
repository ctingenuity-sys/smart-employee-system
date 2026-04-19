import { Penalty } from '../types';

export const printPenaltyDocument = (penalty: Penalty) => {
    const dateStr = penalty.createdAt?.toDate ? penalty.createdAt.toDate().toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB');
    const logoUrl = window.location.origin + '/logo.png';

    const renderStampInline = (name: string, status: 'accepted' | 'rejected') => {
        const isAccepted = status === 'accepted';
        const color = isAccepted ? '#1e40af' : '#dc2626';
        const statusText = isAccepted ? 'ACCEPTED' : 'REJECTED';
        
        return `
            <div style="border: 4px solid ${color}; border-radius: 8px; padding: 4px; display: inline-block; text-align: center; font-family: monospace; font-weight: bold; text-transform: uppercase; position: relative; transform: rotate(-6deg); color: ${color};">
                <div style="border: 1px solid ${color}; opacity: 0.8; padding: 4px; border-radius: 4px;">
                    <div style="font-size: 10px; letter-spacing: 1px; margin-bottom: 4px;">AL JEDAANI HOSPITAL</div>
                    <div style="font-size: 9px; border-top: 1px dashed ${color}; margin-top: 2px; padding-top: 2px;">RADIOLOGY DEPARTMENT</div>
                    <div style="font-size: 11px; border-top: 1px solid ${color}; border-bottom: 1px solid ${color}; padding: 2px 0; margin: 2px 0;">Staff</div>
                    <div style="font-size: 13px;">${name}</div>
                    <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; opacity: 0.7; transform: rotate(-12deg); color: ${isAccepted ? '#16a34a' : '#dc2626'};">
                        ${statusText}
                    </div>
                </div>
            </div>
        `;
    };

    const htmlContent = `
        <!DOCTYPE html>
        <html dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>Disciplinary Notice - ${penalty.employeeName}</title>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&family=Inter:wght@400;700&display=swap');
                @page {
                    size: A4 portrait;
                    margin: 5mm;
                }
                body { 
                    font-family: 'Cairo', 'Inter', sans-serif; 
                    margin: 0;
                    padding: 0;
                    color: #1e3a8a;
                    background: #fff;
                    font-size: 11px;
                }
                .print-container { 
                    width: 100%;
                    max-width: 100%;
                    margin: 0 auto; 
                    box-sizing: border-box;
                }
                .header-section {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    border-bottom: 2px solid #000;
                    padding-bottom: 5px;
                    margin-bottom: 5px;
                }
                .header-text-en {
                    text-align: left;
                    font-size: 10px;
                    font-weight: bold;
                    font-family: 'Inter', sans-serif;
                    direction: ltr;
                }
                .header-text-ar {
                    text-align: right;
                    font-size: 11px;
                    font-weight: bold;
                    line-height: 1.1; /* تقليل المسافة الرأسية بين السطور */
                }
                .header-logo {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }
                .header-logo img {
                    width: 100px;
                    height: 100px;
                    object-fit: contain;
                }
                .title-section {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-end;
                    margin-bottom: 10px;
                }
                .date-box {
                    font-size: 11px;
                    font-weight: bold;
                    display: flex;
                    align-items: flex-end;
                    gap: 8px;
                }
                .date-line {
                    border-bottom: 1px dotted #000;
                    width: 100px;
                    text-align: center;
                    display: inline-block;
                }
                .main-title {
                    text-align: center;
                }
                .main-title h2 {
                    font-size: 18px;
                    font-weight: bold;
                    border-bottom: 2px solid #000;
                    display: inline-block;
                    padding: 0 15px 3px;
                    margin: 0;
                }
                .main-title p {
                    font-size: 11px;
                    font-weight: bold;
                    margin: 3px 0 0;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    font-family: 'Inter', sans-serif;
                }
                .form-container {
                    border: 2px solid #1e3a8a;
                }
                .section {
                    border-bottom: 2px solid #000;
                    padding: 5px 10px;
                }
                .section:last-child {
                    border-bottom: none;
                }
                .section-header {
                    display: flex;
                    justify-content: space-between;
                    font-weight: bold;
                    margin-bottom: 5px;
                }
                .flex-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-end;
                    margin-bottom: 5px;
                }
                .label-en {
                    width: 120px;
                    text-align: left;
                    direction: ltr;
                    font-family: 'Inter', sans-serif;
                }
                .label-ar {
                    width: 100px;
                    text-align: right;
                    font-size: 13px;
                                        padding: 0 2px;

                }
                .value-line {
                    flex-grow: 1;
                    border-bottom: 1px dotted #000;
                    margin: 0 10px;
                    text-align: center;
                    font-size: 13px;
                    font-weight: bold;
                }
                .notice-text {
                    text-align: center;
                    font-size: 14px;
                    line-height: 1.8;
                    position: relative;
                    min-height: 60px;
                    padding-top: 5px;
                }
                .notice-text p {
                    position: relative;
                    z-index: 10;
                    display: inline-block;
                    background: #fff;
                    padding: 0 10px;
                    margin: 0;
                }
                .notice-lines {
                    position: absolute;
                    top: 25px;
                    left: 0;
                    right: 0;
                    border-bottom: 1px dotted #000;
                    z-index: 0;
                }
                .notice-lines:after {
                    content: '';
                    position: absolute;
                    top: 25px;
                    left: 0;
                    right: 0;
                    border-bottom: 1px dotted #000;
                }
                .action-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 5px;
                    padding: 0 20px;
                }
                .action-en {
                    width: 35%;
                    text-align: left;
                    direction: ltr;
                    font-family: 'Inter', sans-serif;
                }
                .action-ar {
                    width: 35%;
                    text-align: right;
                }
                .checkbox {
                    width: 16px;
                    height: 16px;
                    border: 2px solid #1e3a8a;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: #fff;
                    font-size: 14px;
                    font-weight: bold;
                }
                .inline-input {
                    border-bottom: 1px dotted #000;
                    display: inline-block;
                    text-align: center;
                    font-weight: bold;
                }
                .bg-gray {
                    background-color: #f9fafb;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }
                .signature-section {
                    display: flex;
                    justify-content: space-between;
                    font-weight: bold;
                    margin-top: 10px;
                }
                .rejection-reason {
                    margin-top: 10px;
                    text-align: center;
                    color: #dc2626;
                    font-weight: bold;
                    font-size: 12px;
                }
                /* Watermark Style */
                .watermark {
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    opacity: 0.06;
                    width: 50%;
                    max-width: 500px;
                    z-index: -1;
                    pointer-events: none;
                }
            </style>
        </head>
        <body>
            <img src="${logoUrl}" class="watermark" alt="Watermark" crossOrigin="anonymous" />
            <div class="print-container">
                <!-- Header -->
                <div class="header-section">
                    <div class="header-text-en">
                        <p style="margin: 0 0 2px;">AL JEDAANI HOSPITAL</p>
                        <p style="margin: 0 0 4px; font-weight: bold; font-size: 8px;">AL SAFA DISTRICT</p>
                        <p style="margin: 0 0 4px; font-weight: normal;">Kingdom of Saudi Arabia</p>
                        <p style="margin: 0; font-weight: normal;">P.O. Box 7500 Jeddah 21462</p>
                    </div>
                    <div class="header-logo">
                        <img src="${logoUrl}" alt="Hospital Logo" crossOrigin="anonymous" />
                    </div>
                    <div class="header-text-ar">
                        <p style="margin: 0 0 2px; font-size: 18px;">مستشفى الجدعاني</p>
                        <p style="margin: 0 0 4px; font-size: 11px; font-weight: bold;">حي الصفــــا</p>
                        <p style="margin: 0 0 4px; font-weight: normal;">المملكة العربية السعودية</p>
                        <p style="margin: 0; font-weight: normal;">ص.ب ٧٥٠٠ جـدة ٢١٤٦٢</p>
                    </div>
                </div>

                <!-- Title & Date -->
                <div class="title-section">
                    <div class="date-box" style="direction: ltr; font-family: 'Inter', sans-serif;">
                        <span>Date:</span>
                        <span class="date-line">${dateStr}</span>
                    </div>
                    <div class="main-title">
                        <h2>اخطار انــــذار</h2>
                        <p>Disciplinary Notice</p>
                    </div>
                    <div class="date-box">
                        <span>التاريخ:</span>
                        <span class="date-line">${dateStr}</span>
                    </div>
                </div>

                <!-- Main Form Container -->
                <div class="form-container">
                    
                    <!-- Employee Info Section -->
                    <div class="section">
                        <div class="section-header">
                            <span style="text-decoration: underline; font-family: 'Inter', sans-serif; direction: ltr;">TO</span>
                            <span style="text-decoration: underline;">الى</span>
                        </div>
                        
                        <div class="flex-row">
                            <span class="label-en">NAME</span>
                            <span class="value-line">${penalty.employeeName}</span>
                            <span class="label-ar">الاســـــم</span>
                        </div>
                        <div class="flex-row">
                            <span class="label-en">POSITION</span>
                            <span class="value-line">أخصائي أشعة</span>
                            <span class="label-ar">الوظيفـــــة</span>
                        </div>
                        <div class="flex-row" style="margin-bottom: 0;">
                            <span class="label-en">DEPT / SEC.</span>
                            <span class="value-line">قسم الأشعة</span>
                            <span class="label-ar">القسم / الادارة</span>
                        </div>
                    </div>

                    <!-- Notice Section -->
                    <div class="section" style="min-height: 150px;">
                        <div class="section-header">
                            <span style="font-family: 'Inter', sans-serif; direction: ltr;">NOTICE</span>
                            <span>ملاحظــــــات</span>
                        </div>
                        <div class="notice-text">
                            <p>${penalty.description}</p>
                            <div class="notice-lines"></div>
                        </div>
                    </div>

                    <!-- Actions Section -->
                    <div class="section bg-gray">
                        <div class="section-header" style="margin-bottom: 10px;">
                            <span style="font-family: 'Inter', sans-serif; direction: ltr;">As a measure of discipline we have to:</span>
                            <span>وعليه قررت الادارة الاجراء التالــــــي</span>
                        </div>
                        
                        <div class="action-row">
                            <span class="action-en">- 1st Warning</span>
                            <div class="checkbox">${penalty.penaltyType === '1st Warning' ? '✓' : ''}</div>
                            <span class="action-ar">- انــــذار أول</span>
                        </div>
                        
                        <div class="action-row">
                            <span class="action-en">- 2nd Warning</span>
                            <div class="checkbox">${penalty.penaltyType === '2nd Warning' ? '✓' : ''}</div>
                            <span class="action-ar">- انــــذار ثاني</span>
                        </div>
                        
                        <div class="action-row">
                            <span class="action-en">- Final Warning</span>
                            <div class="checkbox">${penalty.penaltyType === 'Final Warning' ? '✓' : ''}</div>
                            <span class="action-ar">- انــــذار نهائي</span>
                        </div>

                        <div class="action-row">
                            <span class="action-en"></span>
                            <div class="checkbox">${penalty.penaltyType === 'Dismissal' ? '✓' : ''}</div>
                            <span class="action-ar">- فصل من الخدمة</span>
                        </div>
                        
                        <div class="action-row" style="margin-top: 10px;">
                            <span class="action-en" style="width: auto;">
                                - Deduct <span class="inline-input" style="width: 50px;">${penalty.deductionDays || ''}</span> days wages from your salary
                            </span>
                            <span class="action-ar" style="width: auto;">
                                - خصم أجر <span class="inline-input" style="width: 50px;">${penalty.deductionDays || ''}</span> من راتبك الشهري
                            </span>
                        </div>
                        
                        <div class="action-row">
                            <span class="action-en" style="width: auto;">
                                - Suspend from work for <span class="inline-input" style="width: 50px;">${penalty.suspensionDays || ''}</span> days
                            </span>
                            <span class="action-ar" style="width: auto;">
                                - إيقاف عن العمل عدد <span class="inline-input" style="width: 50px;">${penalty.suspensionDays || ''}</span> أيام
                            </span>
                        </div>

                        <div class="action-row">
                            <span class="action-en" style="width: auto;">
                                - from <span class="inline-input" style="width: 100px;">${penalty.suspensionFrom || ''}</span> to: <span class="inline-input" style="width: 100px;">${penalty.suspensionTo || ''}</span>
                            </span>
                            <span class="action-ar" style="width: auto;">
                                من تاريخ <span class="inline-input" style="width: 100px;">${penalty.suspensionFrom || ''}</span> الى تاريخ <span class="inline-input" style="width: 100px;">${penalty.suspensionTo || ''}</span>
                            </span>
                        </div>
                    </div>

                    <!-- Signatures Section -->
                    <div class="section">
                        <div class="section-header" style="margin-bottom: 10px;">
                            <span style="font-family: 'Inter', sans-serif; direction: ltr;">We hope that this is not repeated</span>
                            <span>نرجو عدم تكرار ذلك مستقبلا</span>
                        </div>
                        
                        <div class="section-header" style="margin-bottom: 10px;">
                            <span style="font-family: 'Inter', sans-serif; direction: ltr;">Personnel Manager</span>
                            <span>مدير شئون الموظفين</span>
                        </div>
                        
                        <div class="signature-section" style="margin-top: 0;">
                            <span style="font-family: 'Inter', sans-serif; direction: ltr;">
                                Date: <span class="inline-input" style="width: 150px;"></span>
                            </span>
                            <span>
                                التاريخ <span class="inline-input" style="width: 150px;"></span>
                            </span>
                        </div>
                    </div>

                    <!-- Employee Receipt Section -->
                    <div class="section bg-gray">
                        <div class="section-header" style="margin-bottom: 15px;">
                            <span style="font-family: 'Inter', sans-serif; direction: ltr;">Disciplinary Notice received by employee</span>
                            <span>اقرار بإستلام لفت النظر من قبل العامل / الموظف</span>
                        </div>
                        
                        <div style="position: relative; min-height: 50px;">
                            <div class="signature-section" style="margin-top: 0; align-items: flex-end;">
                                <span style="font-family: 'Inter', sans-serif; direction: ltr;">
                                    signature : <span class="inline-input" style="width: 200px;"></span>
                                </span>
                                
                                <span>
                                    التوقيع : <span class="inline-input" style="width: 200px;"></span>
                                </span>
                            </div>

                            ${penalty.status !== 'pending' ? `
                                <div style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);">
                                    ${renderStampInline(penalty.employeeName, penalty.status)}
                                </div>
                            ` : ''}
                        </div>

                        ${penalty.status === 'rejected' && penalty.rejectionReason ? `
                            <div class="rejection-reason">
                                سبب الرفض: ${penalty.rejectionReason}
                            </div>
                        ` : ''}
                    </div>

                </div>
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
            let loadedImages = 0;
            
            if (images.length === 0) {
                printWindow.focus();
                printWindow.print();
                return;
            }

            for (let i = 0; i < images.length; i++) {
                images[i].onload = () => {
                    loadedImages++;
                    if (loadedImages === images.length) {
                        printWindow.focus();
                        printWindow.print();
                    }
                };
                images[i].onerror = () => {
                    loadedImages++;
                    if (loadedImages === images.length) {
                        printWindow.focus();
                        printWindow.print();
                    }
                };
            }
        }, 250);
    } else {
        alert('Please allow popups to print the document.');
    }
};
