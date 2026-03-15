import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import SignaturePad from 'signature_pad';
// @ts-ignore
import html2pdf from 'html2pdf.js';

const CTConsentPage: React.FC = () => {
    const navigate = useNavigate();
    const [lang, setLang] = useState<'ar' | 'en'>('ar');
    
    // Form State
    const [patientName, setPatientName] = useState('');
    const [mrn, setMrn] = useState('');
    const [patientAge, setPatientAge] = useState('');
    const [patientGender, setPatientGender] = useState('');
    const [date, setDate] = useState('');
    
    const [referral, setReferral] = useState('');
    const [radiologist, setRadiologist] = useState('');
    const [procedure, setProcedure] = useState('');
    
    const [clinicalAnswers, setClinicalAnswers] = useState<Record<string, string>>({});
    const [diagnosis, setDiagnosis] = useState('');
    
    const [isRep, setIsRep] = useState(false);
    const [repRelation, setRepRelation] = useState('');
    const [repName, setRepName] = useState('');
    
    const [consentType, setConsentType] = useState('CT');

    const patientCanvasRef = useRef<HTMLCanvasElement>(null);
    const repCanvasRef = useRef<HTMLCanvasElement>(null);
    const patientPadRef = useRef<SignaturePad | null>(null);
    const repPadRef = useRef<SignaturePad | null>(null);
    
    const [isPrinting, setIsPrinting] = useState(false);

    const referrals = {
      ar: ["د. أحمد الطوخي", "د. رامي عبدالله", "د. محمد المصري ", "د. أحمد فاروق", "د. احمد زكريا", "د. أحمد صلاح", "د. سيد سعد", "د. أحمد عبدالفتاح", "د. هاني عبد المولي", "د. ياسر حامد", "د. أحمد عصمت", "د. فيصل الترازي", "د. عبد الحكيم سالم", "د. هشام أبو العينين", "د. مصطفى السيد", "د. أحمد يسري", "د. حسين رجب", "د. محمود اليماني", "د. حسين كامل", "د. أحمد الجندي", "د. عفاف عراقي", "د. منى سراج"],
      en: ["Dr. Ahmed El-Toukhy", "Dr. Rami Abdullah", "Dr. mohamed Elmasry", "Dr. Ahmed Farouk", "Dr. Ahmed Zakaria", "Dr. Ahmed Salah", "Dr. Sayed Saad", "Dr. Ahmed Abdel-Fattah", "Dr. Hany Abdel-Mawla", "Dr. Yasser Hamed", "Dr. Ahmed Esmat", "Dr. Faisal Al-Tarazi", "Dr. Abdel-Hakim Salem", "Dr. Hesham Abou El-Einen", "Dr. Mostafa El-Sayed", "Dr. Ahmed Yousry", "Dr. Hussein Ragab", "Dr. Mahmoud El-Yamani", "Dr. Hussein Kamel", "Dr. Ahmed El-Gendy", "Dr. Afaf Iraqi", "Dr. Mona Serag"]
    };
    const radiologists = {
      ar: ["د. محمد شفيع", "د. أمير أحمد", "د. أحمد عشماوي", "د. أسماء رأفت", "د. شيماء نبيل"],
      en: ["Dr. Mohamed Shafee", "Dr. Amir Ahmed", "Dr. Ahmed Ashmawy", "Dr. Asmaa Raafat", "Dr. Shaimaa Nabil"]
    };
    const procedures = {
      ar: ["أشعه مقطعيه للرقبه بالصبغه", "أشعه مقطعيه للصدر بالصبغه", "أشعه مقطعيه للبطن والحوض بالصبغه", "أشعه مقطعيه للراس بالصبغه", "أشعه مقطعيه للأجزاء السفليه بالصبغه", "أشعه مقطعيه لشرايين المخ", "أشعه مقطعيه لشرايين الرئه", "أشعه مقطعيه لشرايين البطن", "أشعه مقطعيه لشرايين الاطراف السفليه", "أشعه مقطعيه لشرايين الاطراف العلويه", "أشعه مقطعيه لشرايين القلب", "أشعه مقطعيه للحجاج العيني بالصبغه", "أشعه مقطعيه لشرايين الرقبه", "أشعه مقطعيه لشرايين المخيخ"],
      en: ["CT Neck with Contrast", "CT Chest with Contrast", "CT Abdomen and Pelvis with Contrast", "CT Head with Contrast", "CT Lower Limbs with Contrast", "CT Brain Angiography", "CT Pulmonary Angiography", "CT Abdominal Angiography", "CT Lower Limb Angiography", "CT Upper Limb Angiography", "CT Coronary Angiography", "CT Orbit with Contrast", "CT Neck Angiography", "CT Cerebellar Angiography"]
    };

    useEffect(() => {
        if (patientCanvasRef.current) {
            patientPadRef.current = new SignaturePad(patientCanvasRef.current);
        }
        if (repCanvasRef.current) {
            repPadRef.current = new SignaturePad(repCanvasRef.current);
        }
        
        // Load saved answers
        const saved = localStorage.getItem("clinicalAnswers");
        if (saved) {
            setClinicalAnswers(JSON.parse(saved));
        }

        // Parse URL parameters
        const params = new URLSearchParams(window.location.hash.split('?')[1]);
        if (params.get('name')) setPatientName(params.get('name') || '');
        if (params.get('mrn')) setMrn(params.get('mrn') || '');
        if (params.get('age')) {
            setPatientAge(params.get('age') || '');
        }
        if (params.get('gender')) {
            setPatientGender(params.get('gender') || '');
        }
        if (params.get('ref')) {
            // Check if the doctor exists in our list, otherwise just set it as a custom value or leave empty if we want strict select.
            // Since it's a select, we might need to add it to the list or use a free text field.
            // For now, we'll set it, but if it's not in the list, the select might not show it.
            setReferral(params.get('ref') || '');
        }
        if (params.get('proc')) setProcedure(params.get('proc') || '');
        if (params.get('type')) setConsentType(params.get('type') || 'CT');
        
        const today = new Date().toISOString().split('T')[0];
        setDate(today);
    }, []);

    const handleAnswerChange = (key: string, value: string) => {
        const newAnswers = { ...clinicalAnswers, [key]: value };
        setClinicalAnswers(newAnswers);
        localStorage.setItem("clinicalAnswers", JSON.stringify(newAnswers));
    };

    const calculateEGFR = (ageVal: string, sexVal: string, creatVal: string) => {
        const a = parseFloat(ageVal);
        const scr = parseFloat(creatVal);

        if (isNaN(a) || isNaN(scr)) {
            return null;
        }

        let k = (sexVal === "female") ? 0.7 : 0.9;
        let alpha = (sexVal === "female") ? -0.241 : -0.302;
        let minPart = Math.min(scr / k, 1) ** alpha;
        let maxPart = Math.max(scr / k, 1) ** -1.200;
        let sexFactor = (sexVal === "female") ? 1.012 : 1.0;

        let egfr = 142 * minPart * maxPart * (0.9938 ** a) * sexFactor;
        return egfr.toFixed(1);
    };

    useEffect(() => {
        if (clinicalAnswers.creatinine) {
            const egfrVal = calculateEGFR(patientAge, patientGender, clinicalAnswers.creatinine);
            if (egfrVal && egfrVal !== clinicalAnswers.egfr) {
                handleAnswerChange('egfr', egfrVal);
            } else if (!egfrVal && clinicalAnswers.egfr) {
                handleAnswerChange('egfr', '');
            }
        }
    }, [patientAge, patientGender, clinicalAnswers.creatinine]);

    const handleCreatinineChange = (val: string) => {
        handleAnswerChange('creatinine', val);
    };

    const clearPatientPad = () => patientPadRef.current?.clear();
    const clearRepPad = () => repPadRef.current?.clear();

    const renderQuestionHTML = (id: string, text: string) => {
        const val = clinicalAnswers[id];
        const yesLabel = t('نعم', 'Yes');
        const noLabel = t('لا', 'No');
        const isYes = val === 'yes';
        const isNo = val === 'no';
        
        return `
        <div class="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
            <span class="font-bold text-sm text-slate-700">${text}</span>
            <div class="flex gap-4">
                <div class="flex items-center gap-1 ${isYes ? 'text-blue-600 font-bold' : 'text-slate-400'}">
                    <i class="${isYes ? 'fas fa-check-circle' : 'far fa-circle'}"></i> <span>${yesLabel}</span>
                </div>
                <div class="flex items-center gap-1 ${isNo ? 'text-blue-600 font-bold' : 'text-slate-400'}">
                    <i class="${isNo ? 'fas fa-check-circle' : 'far fa-circle'}"></i> <span>${noLabel}</span>
                </div>
            </div>
        </div>
        `;
    };

    const resetForm = () => {
        localStorage.removeItem("clinicalAnswers");
        setClinicalAnswers({});
        setPatientName('');
        setMrn('');
        setPatientAge('');
        setPatientGender('');
        setDate('');
        setReferral('');
        setRadiologist('');
        setProcedure('');
        setDiagnosis('');
        setIsRep(false);
        setRepRelation('');
        setRepName('');
        clearPatientPad();
        clearRepPad();
    };

    const consentTitles = {
        CT: { ar: '✅ موافقه علي الأشعه المقطعيه بالصبغه', en: 'Consent For CT SCAN With Contrast ✅' },
        MRI: { ar: '✅ موافقه علي الرنين المغناطيسي بالصبغه', en: 'Consent For MRI With Contrast ✅' },
        Fluoro: { ar: '✅ موافقه علي فحص الباريوم', en: 'Consent For Barium ✅' }
    };

    const getBase64ImageFromUrl = async (imageUrl: string) => {
        try {
            const res = await fetch(imageUrl);
            if (!res.ok) throw new Error("Network response was not ok");
            const blob = await res.blob();
            return new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.addEventListener("load", () => resolve(reader.result as string), false);
                reader.addEventListener("error", () => reject("Error loading image"));
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.error("Failed to load watermark image", e);
            return imageUrl;
        }
    };

    const saveAsPDF = async () => {
        const patientSignature = patientPadRef.current && !patientPadRef.current.isEmpty() ? patientPadRef.current.toDataURL() : '';
        const repSignature = repPadRef.current && !repPadRef.current.isEmpty() ? repPadRef.current.toDataURL() : '';
        const watermarkBase64 = await getBase64ImageFromUrl('/logo.png');

        const renderPrintQuestion = (text: string, value: string) => {
            const isYes = value === 'yes';
            const isNo = value === 'no';
            const checkedSvg = encodeURIComponent(`<svg width="14" height="14" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg"><circle cx="7" cy="7" r="6" stroke="black" stroke-width="1.5" fill="white"/><circle cx="7" cy="7" r="3.5" fill="black"/></svg>`);
            const uncheckedSvg = encodeURIComponent(`<svg width="14" height="14" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg"><circle cx="7" cy="7" r="6" stroke="black" stroke-width="1.5" fill="white"/></svg>`);
            const radioYes = `<img src="data:image/svg+xml;charset=utf-8,${isYes ? checkedSvg : uncheckedSvg}" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-top: -2px;" />`;
            const radioNo = `<img src="data:image/svg+xml;charset=utf-8,${isNo ? checkedSvg : uncheckedSvg}" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-top: -2px;" />`;

            return `
            <div class="flex justify-between items-center border-b border-gray-300 border-dashed pb-1 pt-1">
                <div class="font-bold text-right flex-1 ml-4">${text}</div>
                <div class="flex gap-4" dir="ltr">
                    <div class="flex items-center gap-1">No ${radioNo}</div>
                    <div class="flex items-center gap-1">Yes ${radioYes}</div>
                </div>
            </div>
            `;
        };

        const htmlContent = `
            <div style="padding: 40px; font-family: 'Cairo', sans-serif; background: white; color: black; position: relative; min-height: 1100px;" dir="rtl">
                <!-- Watermark -->
                <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); opacity: 0.05; pointer-events: none; z-index: 0;">
                    ${watermarkBase64 ? `<img src="${watermarkBase64}" style="width: 600px; max-width: 90vw; object-fit: contain;" alt="شعار المستشفى" />` : ''}
                </div>

                <div style="position: relative; z-index: 10;">
                    <div style="height: 80px;"></div>
                    <div style="text-align: center; font-weight: bold; font-size: 16px; margin-bottom: 20px;">
                        ${consentTitles[consentType as keyof typeof consentTitles].en}
                    </div>

                    <div style="display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 12px;">
                        <div style="width: 25%; padding: 0 4px;">
                            <div style="font-weight: bold; text-align: right;">Name</div>
                            <div style="border-bottom: 1px solid black; text-align: center; height: 20px;">${patientName}</div>
                        </div>
                        <div style="width: 15%; padding: 0 4px;">
                            <div style="font-weight: bold; text-align: right;">MRN</div>
                            <div style="border-bottom: 1px solid black; text-align: center; height: 20px;">${mrn}</div>
                        </div>
                        <div style="width: 15%; padding: 0 4px;">
                            <div style="font-weight: bold; text-align: right;">Age</div>
                            <div style="border-bottom: 1px solid black; text-align: center; height: 20px;">${patientAge}</div>
                        </div>
                        <div style="width: 20%; padding: 0 4px;">
                            <div style="font-weight: bold; text-align: right;">Gender</div>
                            <div style="border-bottom: 1px solid black; text-align: center; height: 20px;">${patientGender === 'male' ? 'Male / ذكر' : patientGender === 'female' ? 'Female / أنثى' : ''}</div>
                        </div>
                        <div style="width: 25%; padding: 0 4px;">
                            <div style="font-weight: bold; text-align: right;">Date</div>
                            <div style="border-bottom: 1px solid black; text-align: center; height: 20px;">${date}</div>
                        </div>
                    </div>

                    <div style="display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 12px;">
                        <div style="width: 33%; padding: 0 4px;">
                            <div style="font-weight: bold; text-align: right;">Referred by Dr.</div>
                            <div style="border-bottom: 1px solid black; text-align: center; height: 20px; text-transform: uppercase;">${referral}</div>
                        </div>
                        <div style="width: 33%; padding: 0 4px;">
                            <div style="font-weight: bold; text-align: right;">Radiologist</div>
                            <div style="border-bottom: 1px solid black; text-align: center; height: 20px; text-transform: uppercase;">${radiologist}</div>
                        </div>
                        <div style="width: 33%; padding: 0 4px;">
                            <div style="font-weight: bold; text-align: right;">Procedure</div>
                            <div style="border-bottom: 1px solid black; text-align: center; height: 20px;">${procedure}</div>
                        </div>
                    </div>

                    <div style="text-align: center; font-weight: bold; font-size: 14px; margin-bottom: 10px;">Clinical Questions</div>
                    <div style="font-size: 12px; margin-bottom: 20px;">
                        ${renderPrintQuestion('Previous contrast CT scan?', clinicalAnswers.prevContrast)}
                        ${clinicalAnswers.prevContrast === 'yes' ? renderPrintQuestion('Contrast allergy?', clinicalAnswers.contrastAllergy) : ''}
                        ${renderPrintQuestion('Any allergies?', clinicalAnswers.allergy)}
                        ${renderPrintQuestion('Kidney disease or failure?', clinicalAnswers.kidneyDisease)}
                        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed #ccc; padding: 4px 0;">
                            <div style="width: 50%; display: flex; align-items: center;">
                                <span style="font-weight: bold; margin-left: 8px;">Creatinine:</span>
                                <div style="border-bottom: 1px solid black; flex: 1; text-align: center;">${clinicalAnswers.creatinine || ''}</div>
                            </div>
                            <div style="width: 50%; display: flex; align-items: center;" dir="ltr">
                                <span style="font-weight: bold; margin-right: 8px;">eGFR:</span>
                                <div style="border-bottom: 1px solid black; flex: 1; text-align: center;">${clinicalAnswers.egfr || ''}</div>
                            </div>
                        </div>
                        ${renderPrintQuestion('Asthma or respiratory diseases?', clinicalAnswers.asthma)}
                        ${renderPrintQuestion('Diabetes?', clinicalAnswers.diabetes)}
                        ${clinicalAnswers.diabetes === 'yes' ? renderPrintQuestion('Taking Metformin?', clinicalAnswers.metformin) : ''}
                        ${renderPrintQuestion('Cardiac issues?', clinicalAnswers.cardiac)}
                        ${patientGender !== 'male' ? renderPrintQuestion('Pregnant or breastfeeding?', clinicalAnswers.pregnancy) : ''}
                    </div>

                    <div style="text-align: center; font-weight: bold; font-size: 14px; margin-bottom: 5px;">Diagnosis</div>
                    <div style="border: 1px solid #444; padding: 8px; font-size: 12px; font-weight: bold; text-align: center; text-transform: uppercase; margin-bottom: 20px;">
                        ${diagnosis}
                    </div>

                    <div style="text-align: center; font-weight: bold; font-size: 14px; margin-bottom: 10px;">Doctor Signature</div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 12px;">
                        <div style="width: 33%; padding: 0 4px;">
                            <div style="font-weight: bold; text-align: right;">Name</div>
                            <div style="border-bottom: 1px solid black; text-align: center; height: 20px; text-transform: uppercase;">${radiologist}</div>
                        </div>
                        <div style="width: 33%; padding: 0 4px;">
                            <div style="font-weight: bold; text-align: right;">Signature</div>
                            <div style="border-bottom: 1px solid black; height: 20px;"></div>
                        </div>
                    </div>

                    <div style="text-align: center; font-weight: bold; font-size: 14px; margin-bottom: 10px;">Patient Consent</div>
                    <div style="font-size: 11px; text-align: justify; margin-bottom: 20px;" dir="ltr">
                        I confirm that I have accurately completed this form and I consent and authorize Dr. <strong>${radiologist || '_________________'}</strong> to perform the procedure <strong>${procedure || '_________________'}</strong>, which is either essential or recommended by Dr. <strong>${referral || '_________________'}</strong>. The nature, purpose, risks, and possible complications of the procedure have been fully explained to me by Dr. <strong>${radiologist || '_________________'}</strong>.
                    </div>

                    <div style="display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 12px;">
                        <div style="width: 33%; padding: 0 4px;">
                            <div style="font-weight: bold; text-align: right;">${isRep ? 'Representative Name' : 'Patient Name'}</div>
                            <div style="border-bottom: 1px solid black; text-align: center; height: 20px;">${isRep ? repName : patientName}</div>
                        </div>
                        <div style="width: 33%; padding: 0 4px;">
                            <div style="font-weight: bold; text-align: right;">${isRep ? 'Representative Signature' : 'Patient Signature'}</div>
                            <div style="border-bottom: 1px solid black; height: 40px; position: relative; text-align: center;">
                                ${patientSignature && !isRep ? `<img src="${patientSignature}" style="max-height: 35px; position: absolute; bottom: 2px; left: 50%; transform: translateX(-50%);" />` : ''}
                                ${repSignature && isRep ? `<img src="${repSignature}" style="max-height: 35px; position: absolute; bottom: 2px; left: 50%; transform: translateX(-50%);" />` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const opt = {
            margin: 0,
            filename: `Consent-${patientName || 'Patient'}.pdf`,
            image: { type: 'jpeg' as const, quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' as const }
        };

        const worker = html2pdf().from(htmlContent).set(opt).save();
    };

    const printAsHTML = async () => {
        const patientSignature = patientPadRef.current && !patientPadRef.current.isEmpty() ? patientPadRef.current.toDataURL() : '';
        const repSignature = repPadRef.current && !repPadRef.current.isEmpty() ? repPadRef.current.toDataURL() : '';
        const watermarkBase64 = await getBase64ImageFromUrl('/logo.png');

        const renderPrintQuestion = (text: string, value: string) => {
            const isYes = value === 'yes';
            const isNo = value === 'no';
            
            // Using base64 encoded SVGs to guarantee they print regardless of browser background graphics settings
            const checkedSvg = encodeURIComponent(`<svg width="14" height="14" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg"><circle cx="7" cy="7" r="6" stroke="black" stroke-width="1.5" fill="white"/><circle cx="7" cy="7" r="3.5" fill="black"/></svg>`);
            const uncheckedSvg = encodeURIComponent(`<svg width="14" height="14" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg"><circle cx="7" cy="7" r="6" stroke="black" stroke-width="1.5" fill="white"/></svg>`);
            
            const radioYes = `<img src="data:image/svg+xml;charset=utf-8,${isYes ? checkedSvg : uncheckedSvg}" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-top: -2px;" />`;
            const radioNo = `<img src="data:image/svg+xml;charset=utf-8,${isNo ? checkedSvg : uncheckedSvg}" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-top: -2px;" />`;

            return `
            <div class="flex justify-between items-center border-b border-gray-300 border-dashed pb-1 pt-1">
                <div class="font-bold text-right flex-1 ml-4">${text}</div>
                <div class="flex gap-4" dir="ltr">
                    <div class="flex items-center gap-1">No ${radioNo}</div>
                    <div class="flex items-center gap-1">Yes ${radioYes}</div>
                </div>
            </div>
            `;
        };

        const htmlContent = `
            <!DOCTYPE html>
            <html lang="en" dir="rtl">
            <head>
                <meta charset="UTF-8">
                <title>CT Consent Print</title>
                <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&family=Dancing+Script:wght@700&display=swap" rel="stylesheet">
                <script src="https://cdn.tailwindcss.com"></script>
                <style>
                    body { font-family: 'Cairo', sans-serif; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; color: black; margin: 0; padding: 0; }
                    @media print {
                        @page { size: A4 portrait; margin: 0; }
                        body { width: 100vw; height: 100vh; overflow: hidden; box-sizing: border-box; }
                    }
                </style>
            </head>
            <body class="p-8 text-sm relative flex flex-col h-screen box-border">
                <!-- Watermark -->
                <div class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-0 opacity-[0.05] pointer-events-none">
                    ${watermarkBase64 ? `<img src="${watermarkBase64}" style="width: 600px; max-width: 80vw; object-fit: contain;" alt="شعار المستشفى" />` : ''}
                </div>

                <div class="relative z-10 flex flex-col h-full">
                    
                    <!-- Header Placeholder -->
                    <div class="h-24 w-full mb-6 shrink-0"></div>

                    <!-- Title -->
                    <div class="text-center font-bold text-sm mb-4 shrink-0">
                        ${consentTitles[consentType as keyof typeof consentTitles].en}
                    </div>

                    <!-- Row 1 -->
                    <div class="flex justify-between mb-4 text-xs shrink-0">
                        <div class="flex flex-col w-[25%] px-1">
                            <span class="font-bold text-right w-full">Name</span>
                            <div class="border-b border-black w-full text-center h-5">${patientName}</div>
                        </div>
                        <div class="flex flex-col w-[15%] px-1">
                            <span class="font-bold text-right w-full">MRN</span>
                            <div class="border-b border-black w-full text-center h-5">${mrn}</div>
                        </div>
                        <div class="flex flex-col w-[15%] px-1">
                            <span class="font-bold text-right w-full">Age</span>
                            <div class="border-b border-black w-full text-center h-5">${patientAge}</div>
                        </div>
                        <div class="flex flex-col w-[20%] px-1">
                            <span class="font-bold text-right w-full">Gender</span>
                            <div class="border-b border-black w-full text-center h-5">${patientGender === 'male' ? 'Male / ذكر' : patientGender === 'female' ? 'Female / أنثى' : ''}</div>
                        </div>
                        <div class="flex flex-col w-[25%] px-1">
                            <span class="font-bold text-right w-full">Date</span>
                            <div class="border-b border-black w-full text-center h-5">${date}</div>
                        </div>
                    </div>

                    <!-- Row 2 -->
                    <div class="flex justify-between mb-4 text-xs shrink-0">
                        <div class="flex flex-col w-1/3 px-1">
                            <span class="font-bold text-right w-full">Referred by Dr.</span>
                            <div class="border-b border-black w-full text-center h-5 uppercase">${referral}</div>
                        </div>
                        <div class="flex flex-col w-1/3 px-1">
                            <span class="font-bold text-right w-full">Radiologist</span>
                            <div class="border-b border-black w-full text-center h-5 uppercase">${radiologist}</div>
                        </div>
                        <div class="flex flex-col w-1/3 px-1">
                            <span class="font-bold text-right w-full">Procedure</span>
                            <div class="border-b border-black w-full text-center h-5">${procedure}</div>
                        </div>
                    </div>

                    <!-- Clinical Questions Title -->
                    <div class="text-center font-bold text-sm mb-2 shrink-0">
                        Clinical Questions
                    </div>

                    <!-- Questions -->
                    <div class="text-xs space-y-1 mb-4 shrink-0">
                        ${renderPrintQuestion('Previous contrast CT scan?', clinicalAnswers.prevContrast)}
                        ${clinicalAnswers.prevContrast === 'yes' ? renderPrintQuestion('Contrast allergy?', clinicalAnswers.contrastAllergy) : ''}
                        ${renderPrintQuestion('Any allergies?', clinicalAnswers.allergy)}
                        ${renderPrintQuestion('Kidney disease or failure?', clinicalAnswers.kidneyDisease)}
                        
                        <!-- Creatinine & eGFR -->
                        <div class="flex justify-between items-center border-b border-gray-300 border-dashed pb-1 pt-1">
                            <div class="flex items-center w-1/2 pl-4">
                                <span class="font-bold whitespace-nowrap ml-2">Creatinine:</span>
                                <div class="border-b border-black w-full text-center h-4">${clinicalAnswers.creatinine || ''}</div>
                            </div>
                            <div class="flex items-center w-1/2 pr-4" dir="ltr">
                                <span class="font-bold whitespace-nowrap mr-2">eGFR:</span>
                                <div class="border-b border-black w-full text-center h-4">${clinicalAnswers.egfr ? clinicalAnswers.egfr + ' <span class="text-[10px] text-gray-600">mL/min/1.73m²</span>' : ''}</div>
                            </div>
                        </div>

                        ${renderPrintQuestion('Asthma or respiratory diseases?', clinicalAnswers.asthma)}
                        ${renderPrintQuestion('Diabetes?', clinicalAnswers.diabetes)}
                        ${clinicalAnswers.diabetes === 'yes' ? renderPrintQuestion('Taking Metformin?', clinicalAnswers.metformin) : ''}
                        ${renderPrintQuestion('Cardiac issues?', clinicalAnswers.cardiac)}
                        ${patientGender !== 'male' ? renderPrintQuestion('Pregnant or breastfeeding?', clinicalAnswers.pregnancy) : ''}
                    </div>

                    <!-- Diagnosis Title -->
                    <div class="text-center font-bold text-sm mb-1 shrink-0">
                        Diagnosis
                    </div>
                    <div class="border border-gray-400 rounded p-2 text-xs font-bold text-center uppercase mb-4 shrink-0">
                        ${diagnosis}
                    </div>

                    <!-- Doctor Signature Title -->
                    <div class="text-center font-bold text-sm mb-2 shrink-0">
                        Doctor Signature 💉
                    </div>
                    <div class="flex justify-between mb-4 text-xs shrink-0">
                        <div class="flex flex-col w-1/3 px-1">
                            <span class="font-bold text-right w-full">Name</span>
                            <div class="border-b border-black w-full text-center h-5 uppercase">${radiologist}</div>
                        </div>
                        <div class="flex flex-col w-1/3 px-1">
                            <span class="font-bold text-right w-full">Signature</span>
                            <div class="border-b border-black w-full text-center h-5" style="font-family: 'Dancing Script', cursive; font-size: 18px; transform: translateY(-5px); color: #1e3a8a;"></div>
                        </div>
                    </div>

                    <!-- Patient Consent Title -->
                    <div class="text-center font-bold text-sm mb-2 shrink-0">
                        Patient Consent ✍️
                    </div>
                    <div class="text-xs text-justify mb-4 shrink-0" dir="ltr">
                        I confirm that I have accurately completed this form and I consent and authorize Dr. <strong>${radiologist || '_________________'}</strong> to perform the procedure <strong>${procedure || '_________________'}</strong>, which is either essential or recommended by Dr. <strong>${referral || '_________________'}</strong>. The nature, purpose, risks, and possible complications of the procedure have been fully explained to me by Dr. <strong>${radiologist || '_________________'}</strong>.
                    </div>

                    <!-- Patient Signature Area -->
                    ${isRep ? `
                    <div class="flex flex-col items-end text-xs mb-2 shrink-0">
                        <div class="flex items-center gap-2">
                            <span class="font-bold">The signer is not the patient but a legal representative</span>
                            <div style="width: 14px; height: 14px; border: 1px solid black; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold;">✓</div>
                        </div>
                    </div>
                    ` : ''}
                    
                    <div class="flex justify-between mb-2 text-xs shrink-0">
                        <div class="flex flex-col w-1/3 px-1">
                            <span class="font-bold text-right w-full">${isRep ? 'Representative Name' : 'Patient Name'}</span>
                            <div class="border-b border-black w-full text-center h-5">${isRep ? repName : patientName}</div>
                        </div>
                        <div class="flex flex-col w-1/3 px-1">
                            <span class="font-bold text-right w-full">${isRep ? 'Representative Signature' : 'Patient Signature'}</span>
                            <div class="border-b border-black w-full text-center h-10 relative">
                                ${patientSignature && !isRep ? `<img src="${patientSignature}" class="absolute bottom-0 left-1/2 -translate-x-1/2 max-h-12" />` : ''}
                                ${repSignature && isRep ? `<img src="${repSignature}" class="absolute bottom-0 left-1/2 -translate-x-1/2 max-h-12" />` : ''}
                            </div>
                        </div>
                    </div>

                </div>
            </body>
            </html>
        `;

        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const iframeDoc = iframe.contentWindow?.document;
        if (iframeDoc) {
            iframeDoc.open();
            iframeDoc.write(htmlContent);
            iframeDoc.close();

            setTimeout(() => {
                iframe.contentWindow?.focus();
                iframe.contentWindow?.print();
                setTimeout(() => {
                    document.body.removeChild(iframe);
                }, 2000);
            }, 1000);
        } else {
            const printWindow = window.open('', '_blank');
            if (printWindow) {
                printWindow.document.write(htmlContent);
                printWindow.document.close();
                printWindow.focus();
                setTimeout(() => {
                    printWindow.print();
                    printWindow.close();
                }, 1000);
            } else {
                alert('Please allow popups to print.');
            }
        }
    };

    const t = (ar: string, en: string) => lang === 'ar' ? ar : en;

    return (
        <div className={`min-h-screen bg-gradient-to-br from-cyan-50 to-pink-50 p-4 font-cairo ${lang === 'ar' ? 'rtl' : 'ltr'}`} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
            
            {/* Top Bar */}
            <div className="max-w-5xl mx-auto mb-4 flex justify-between items-center print:hidden">
                <button onClick={() => navigate(-1)} className="bg-white px-4 py-2 rounded-lg shadow font-bold text-slate-700 hover:bg-slate-50">
                    <i className="fas fa-arrow-left mr-2"></i> {t('رجوع', 'Back')}
                </button>
                <div className="flex gap-2">
                    <button onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} className="bg-indigo-600 text-white px-4 py-2 rounded-lg shadow font-bold hover:bg-indigo-700">
                        🌐 {t('English', 'العربية')}
                    </button>
                    <button onClick={saveAsPDF} className="bg-emerald-600 text-white px-4 py-2 rounded-lg shadow font-bold hover:bg-emerald-700">
                        📄 {t('حفظ PDF', 'Save PDF')}
                    </button>
                    <button onClick={printAsHTML} className="bg-slate-800 text-white px-4 py-2 rounded-lg shadow font-bold hover:bg-slate-700">
                        🖨️ {t('طباعة', 'Print')}
                    </button>
                    <button onClick={resetForm} className="bg-white text-red-600 px-4 py-2 rounded-lg shadow font-bold border border-red-200 hover:bg-red-50">
                        {t('إعادة ضبط', 'Reset')}
                    </button>
                </div>
            </div>

            <div className="flex flex-col gap-6 max-w-4xl mx-auto">
                
                {/* Consent Form */}
                <div id="print-area" className="w-full bg-white rounded-2xl p-8 shadow-lg relative">
                    <div className="relative z-10">
                        <div className="text-center mb-6 border-b-2 border-blue-100 pb-4">
                            <select 
                                value={consentType} 
                                onChange={e => setConsentType(e.target.value)} 
                                className="text-xl font-black text-blue-900 bg-transparent focus:outline-none text-center cursor-pointer hover:bg-slate-50 rounded px-2 py-1"
                                dir={lang === 'ar' ? 'rtl' : 'ltr'}
                            >
                                <option value="CT">{t(consentTitles.CT.ar, consentTitles.CT.en)}</option>
                                <option value="MRI">{t(consentTitles.MRI.ar, consentTitles.MRI.en)}</option>
                                <option value="Fluoro">{t(consentTitles.Fluoro.ar, consentTitles.Fluoro.en)}</option>
                            </select>
                        </div>

                        {/* Patient Info */}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                            <div className="col-span-2 md:col-span-2">
                                <label className="block text-xs font-bold text-slate-700 mb-1">{t('الإسم', 'Name')}</label>
                                <input type="text" value={patientName} onChange={e=>setPatientName(e.target.value)} className="w-full border-b border-slate-300 p-1 focus:outline-none focus:border-blue-500 bg-transparent" />
                            </div>
                            <div className="col-span-2 md:col-span-1">
                                <label className="block text-xs font-bold text-slate-700 mb-1">{t('رقم الملف', 'MRN')}</label>
                                <input type="text" value={mrn} onChange={e=>setMrn(e.target.value)} className="w-full border-b border-slate-300 p-1 focus:outline-none focus:border-blue-500 bg-transparent" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">{t('السن', 'Age')}</label>
                                <input type="number" value={patientAge} onChange={e=>setPatientAge(e.target.value)} className="w-full border-b border-slate-300 p-1 focus:outline-none focus:border-blue-500 bg-transparent" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">{t('الجنس', 'Gender')}</label>
                                <select value={patientGender} onChange={e=>setPatientGender(e.target.value)} className="w-full border-b border-slate-300 p-1 focus:outline-none focus:border-blue-500 bg-transparent">
                                    <option value="">{t('اختر', 'Select')}</option>
                                    <option value="male">{t('ذكر', 'Male')}</option>
                                    <option value="female">{t('أنثى', 'Female')}</option>
                                </select>
                            </div>
                            <div className="col-span-2 md:col-span-1">
                                <label className="block text-xs font-bold text-slate-700 mb-1">{t('التاريخ', 'Date')}</label>
                                <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full border-b border-slate-300 p-1 focus:outline-none focus:border-blue-500 bg-transparent" />
                            </div>
                        </div>

                        {/* Doctors Info */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">{t('محوَّل من الطبيب', 'Referred by Dr.')}</label>
                                <input list="referrals-list" value={referral} onChange={e=>setReferral(e.target.value)} className="w-full border-b border-slate-300 p-1 bg-transparent focus:outline-none focus:border-blue-500" placeholder={t('اختر أو اكتب', 'Select or type')} />
                                <datalist id="referrals-list">
                                    {referrals[lang].map(r => <option key={r} value={r} />)}
                                </datalist>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">{t('أخصائي الأشعة', 'Radiologist')}</label>
                                <input list="radiologists-list" value={radiologist} onChange={e=>setRadiologist(e.target.value)} className="w-full border-b border-slate-300 p-1 bg-transparent focus:outline-none focus:border-blue-500" placeholder={t('اختر أو اكتب', 'Select or type')} />
                                <datalist id="radiologists-list">
                                    {radiologists[lang].map(r => <option key={r} value={r} />)}
                                </datalist>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">{t('نوع الأشعة', 'Procedure')}</label>
                                <input list="procedures-list" value={procedure} onChange={e=>setProcedure(e.target.value)} className="w-full border-b border-slate-300 p-1 bg-transparent focus:outline-none focus:border-blue-500" placeholder={t('اختر أو اكتب', 'Select or type')} />
                                <datalist id="procedures-list">
                                    {procedures[lang].map(r => <option key={r} value={r} />)}
                                </datalist>
                            </div>
                        </div>

                        {/* Clinical Questions */}
                        <h2 className="text-lg font-bold text-blue-900 mb-4 border-b border-slate-200 pb-2">
                            {t('✅ الأسئلة الصحية', 'Clinical Questions')}
                        </h2>
                        <div className="space-y-3 mb-8 text-sm">
                            <div className="flex justify-between items-center border-b border-dashed border-slate-200 pb-2">
                                <span className="font-bold">{t('خضعت سابقًا لأشعة بصبغة؟', 'Previous contrast CT scan?')}</span>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-1"><input type="radio" name="prevContrast" checked={clinicalAnswers.prevContrast === 'yes'} onChange={() => handleAnswerChange('prevContrast', 'yes')} /> {t('نعم', 'Yes')}</label>
                                    <label className="flex items-center gap-1"><input type="radio" name="prevContrast" checked={clinicalAnswers.prevContrast === 'no'} onChange={() => handleAnswerChange('prevContrast', 'no')} /> {t('لا', 'No')}</label>
                                </div>
                            </div>

                            {clinicalAnswers.prevContrast === 'yes' && (
                                <div className="flex justify-between items-center border-b border-dashed border-slate-200 pb-2 bg-red-50 p-2 rounded">
                                    <span className="font-bold text-red-700">{t('حساسية سابقة من الصبغة؟', 'Contrast allergy?')}</span>
                                    <div className="flex gap-4">
                                        <label className="flex items-center gap-1"><input type="radio" name="contrastAllergy" checked={clinicalAnswers.contrastAllergy === 'yes'} onChange={() => handleAnswerChange('contrastAllergy', 'yes')} /> {t('نعم', 'Yes')}</label>
                                        <label className="flex items-center gap-1"><input type="radio" name="contrastAllergy" checked={clinicalAnswers.contrastAllergy === 'no'} onChange={() => handleAnswerChange('contrastAllergy', 'no')} /> {t('لا', 'No')}</label>
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-between items-center border-b border-dashed border-slate-200 pb-2">
                                <span className="font-bold">{t('هل لديك أي نوع من الحساسية؟', 'Any allergies?')}</span>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-1"><input type="radio" name="allergy" checked={clinicalAnswers.allergy === 'yes'} onChange={() => handleAnswerChange('allergy', 'yes')} /> {t('نعم', 'Yes')}</label>
                                    <label className="flex items-center gap-1"><input type="radio" name="allergy" checked={clinicalAnswers.allergy === 'no'} onChange={() => handleAnswerChange('allergy', 'no')} /> {t('لا', 'No')}</label>
                                </div>
                            </div>

                            <div className="flex justify-between items-center border-b border-dashed border-slate-200 pb-2">
                                <span className="font-bold">{t('أمراض كلى أو فشل كلوي؟', 'Kidney disease or failure?')}</span>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-1"><input type="radio" name="kidneyDisease" checked={clinicalAnswers.kidneyDisease === 'yes'} onChange={() => handleAnswerChange('kidneyDisease', 'yes')} /> {t('نعم', 'Yes')}</label>
                                    <label className="flex items-center gap-1"><input type="radio" name="kidneyDisease" checked={clinicalAnswers.kidneyDisease === 'no'} onChange={() => handleAnswerChange('kidneyDisease', 'no')} /> {t('لا', 'No')}</label>
                                </div>
                            </div>

                            <div className="flex gap-6 border-b border-dashed border-slate-200 pb-2">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold">Creatinine:</span>
                                    <input type="number" step="0.01" value={clinicalAnswers.creatinine || ''} onChange={(e) => handleCreatinineChange(e.target.value)} className="border-b border-slate-300 w-24 bg-transparent focus:outline-none focus:border-blue-500" placeholder="mg/dL" />
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="font-bold">eGFR:</span>
                                    <input type="text" readOnly value={clinicalAnswers.egfr || ''} className="border-b border-slate-300 w-24 bg-transparent focus:outline-none text-blue-700 font-bold" placeholder="mL/min" />
                                </div>
                            </div>

                            <div className="flex justify-between items-center border-b border-dashed border-slate-200 pb-2">
                                <span className="font-bold">{t('ربو أو أمراض تنفسية؟', 'Asthma or respiratory diseases?')}</span>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-1"><input type="radio" name="asthma" checked={clinicalAnswers.asthma === 'yes'} onChange={() => handleAnswerChange('asthma', 'yes')} /> {t('نعم', 'Yes')}</label>
                                    <label className="flex items-center gap-1"><input type="radio" name="asthma" checked={clinicalAnswers.asthma === 'no'} onChange={() => handleAnswerChange('asthma', 'no')} /> {t('لا', 'No')}</label>
                                </div>
                            </div>

                            <div className="flex justify-between items-center border-b border-dashed border-slate-200 pb-2">
                                <span className="font-bold">{t('السكري؟', 'Diabetes?')}</span>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-1"><input type="radio" name="diabetes" checked={clinicalAnswers.diabetes === 'yes'} onChange={() => handleAnswerChange('diabetes', 'yes')} /> {t('نعم', 'Yes')}</label>
                                    <label className="flex items-center gap-1"><input type="radio" name="diabetes" checked={clinicalAnswers.diabetes === 'no'} onChange={() => handleAnswerChange('diabetes', 'no')} /> {t('لا', 'No')}</label>
                                </div>
                            </div>

                            {clinicalAnswers.diabetes === 'yes' && (
                                <div className="flex justify-between items-center border-b border-dashed border-slate-200 pb-2 bg-amber-50 p-2 rounded">
                                    <span className="font-bold text-amber-800">{t('تستخدم الميتفورمين؟', 'Taking Metformin?')}</span>
                                    <div className="flex gap-4">
                                        <label className="flex items-center gap-1"><input type="radio" name="metformin" checked={clinicalAnswers.metformin === 'yes'} onChange={() => handleAnswerChange('metformin', 'yes')} /> {t('نعم', 'Yes')}</label>
                                        <label className="flex items-center gap-1"><input type="radio" name="metformin" checked={clinicalAnswers.metformin === 'no'} onChange={() => handleAnswerChange('metformin', 'no')} /> {t('لا', 'No')}</label>
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-between items-center border-b border-dashed border-slate-200 pb-2">
                                <span className="font-bold">{t('مشاكل قلبية؟', 'Cardiac issues?')}</span>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-1"><input type="radio" name="cardiac" checked={clinicalAnswers.cardiac === 'yes'} onChange={() => handleAnswerChange('cardiac', 'yes')} /> {t('نعم', 'Yes')}</label>
                                    <label className="flex items-center gap-1"><input type="radio" name="cardiac" checked={clinicalAnswers.cardiac === 'no'} onChange={() => handleAnswerChange('cardiac', 'no')} /> {t('لا', 'No')}</label>
                                </div>
                            </div>

                            {patientGender !== 'male' && (
                                <div className="flex justify-between items-center border-b border-dashed border-slate-200 pb-2">
                                    <span className="font-bold">{t('هل يوجد حمل؟', 'Pregnant?')}</span>
                                    <div className="flex gap-4">
                                        <label className="flex items-center gap-1"><input type="radio" name="pregnancy" checked={clinicalAnswers.pregnancy === 'yes'} onChange={() => handleAnswerChange('pregnancy', 'yes')} /> {t('نعم', 'Yes')}</label>
                                        <label className="flex items-center gap-1"><input type="radio" name="pregnancy" checked={clinicalAnswers.pregnancy === 'no'} onChange={() => handleAnswerChange('pregnancy', 'no')} /> {t('لا', 'No')}</label>
                                        <label className="flex items-center gap-1"><input type="radio" name="pregnancy" checked={clinicalAnswers.pregnancy === 'unsure'} onChange={() => handleAnswerChange('pregnancy', 'unsure')} /> {t('غير متأكدة', 'Not sure')}</label>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Diagnosis */}
                        <h2 className="text-lg font-bold text-blue-900 mb-4 border-b border-slate-200 pb-2 flex items-center justify-between">
                            <span>✅ {t('التشخيص', 'Diagnosis')}</span>
                        </h2>
                        <div className="relative mb-8">
                            <textarea 
                                value={diagnosis} 
                                onChange={e=>setDiagnosis(e.target.value)} 
                                className="w-full border border-slate-300 rounded-lg p-3 bg-transparent focus:outline-none focus:border-blue-500" 
                                rows={3}
                                spellCheck={true}
                                placeholder={t('اكتب التشخيص أو اختر من القائمة...', 'Type diagnosis or select from list...')}
                            ></textarea>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {[
                                    'Headache', 'Stroke', 'Appendicitis', 'Abdominal Pain', 
                                    'Pulmonary Embolism', 'Trauma', 'Tumor Staging', 'Renal Stones'
                                ].map(diag => (
                                    <button 
                                        key={diag}
                                        onClick={() => setDiagnosis(prev => prev ? `${prev}, ${diag}` : diag)}
                                        className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded-full transition-colors border border-slate-200 print:hidden"
                                    >
                                        + {diag}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Signatures */}
                        <div className="mb-8">
                            <h2 className="text-lg font-bold text-blue-900 mb-4 border-b border-slate-200 pb-2">
                                💉 {t('توقيع الطبيب', 'Doctor Signature')}
                            </h2>
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">{t('الإسم', 'Name')}</label>
                                    <input type="text" value={radiologist} readOnly className="w-full border-b border-slate-300 p-1 bg-transparent focus:outline-none uppercase text-slate-600" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">{t('التوقيع', 'Signature')}</label>
                                    <div className="w-full border-b border-slate-300 p-1 bg-transparent h-8 flex items-end justify-center" style={{ fontFamily: "'Dancing Script', cursive", fontSize: '24px', color: '#1e3a8a' }}>
                                        {/* Signature space */}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mb-8">
                            <h2 className="text-lg font-bold text-blue-900 mb-4 border-b border-slate-200 pb-2">
                                ✍️ {t('موافقة المريض', 'Patient Consent')}
                            </h2>
                            <p className="text-sm leading-relaxed mb-6 text-slate-700 text-justify">
                                {lang === 'ar' ? (
                                    <>
                                        أقر بأنني قرأت وملأت هذا النموذج بدقة وأوافق وأفوض الدكتور <strong className="border-b border-black px-2">{radiologist || '________'}</strong> للقيام بإجراء <strong className="border-b border-black px-2">{procedure || '________'}</strong> باعتباره ضروريًا جدًا أو قد نصح به بواسطة الدكتور <strong className="border-b border-black px-2">{referral || '________'}</strong>. لقد تم شرح طبيعة وغرض الإجراء والمخاطر والمضاعفات المحتملة لي بالتفصيل من قبل الدكتور <strong className="border-b border-black px-2">{radiologist || '________'}</strong>.
                                    </>
                                ) : (
                                    <>
                                        I confirm that I have accurately completed this form and I consent and authorize Dr. <strong className="border-b border-black px-2">{radiologist || '________'}</strong> to perform the procedure <strong className="border-b border-black px-2">{procedure || '________'}</strong>, which is either essential or recommended by Dr. <strong className="border-b border-black px-2">{referral || '________'}</strong>. The nature, purpose, risks, and possible complications of the procedure have been fully explained to me by Dr. <strong className="border-b border-black px-2">{radiologist || '________'}</strong>.
                                    </>
                                )}
                            </p>

                            <div className="mb-4 print:hidden">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={isRep} onChange={e=>setIsRep(e.target.checked)} className="w-4 h-4" />
                                    <span className="font-bold text-sm text-slate-700">{t('الموقع ليس المريض وإنما مفوض قانونيًا عنه', 'The signer is not the patient but a legal representative')}</span>
                                </label>
                            </div>

                            {!isRep ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">{t('اسم المريض', 'Patient Name')}</label>
                                        <input type="text" value={patientName} readOnly className="w-full border-b border-slate-300 p-1 bg-transparent" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">{t('توقيع المريض', 'Patient Signature')}</label>
                                        <div className="border border-slate-300 rounded-lg bg-slate-50 relative">
                                            <canvas id="patientCanvas" ref={patientCanvasRef} width={400} height={100} className="w-full h-[100px] touch-none"></canvas>
                                            <button onClick={clearPatientPad} className="absolute top-1 right-1 text-xs bg-white border border-slate-200 px-2 py-1 rounded shadow-sm text-slate-500 hover:text-red-500 print:hidden">
                                                <i className="fas fa-eraser"></i>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">{t('نوع القرابة', 'Relationship')}</label>
                                        <input type="text" value={repRelation} onChange={e=>setRepRelation(e.target.value)} placeholder={t('مثال: الأب / ولي أمر / وصي شرعي', 'e.g., Father / Guardian')} className="w-full border-b border-slate-300 p-1 bg-transparent focus:outline-none" />
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-700 mb-1">{t('اسم المفوض', 'Representative Name')}</label>
                                            <input type="text" value={repName} onChange={e=>setRepName(e.target.value)} className="w-full border-b border-slate-300 p-1 bg-transparent focus:outline-none" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-700 mb-1">{t('توقيع المفوض', 'Representative Signature')}</label>
                                            <div className="border border-slate-300 rounded-lg bg-slate-50 relative">
                                                <canvas id="representativeCanvas" ref={repCanvasRef} width={400} height={100} className="w-full h-[100px] touch-none"></canvas>
                                                <button onClick={clearRepPad} className="absolute top-1 right-1 text-xs bg-white border border-slate-200 px-2 py-1 rounded shadow-sm text-slate-500 hover:text-red-500 print:hidden">
                                                    <i className="fas fa-eraser"></i>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CTConsentPage;
