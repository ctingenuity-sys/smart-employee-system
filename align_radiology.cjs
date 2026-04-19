const fs = require('fs');

const fixHeader3Columns = (htmlContent, titleAr, titleEn) => {
    return `<div class="header-section" style="display: flex; align-items: flex-start; justify-content: space-between;">
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
                                    <div class="title-ar">${titleAr}</div>
                                    <div class="title-en">${titleEn}</div>
                                </div>
                            </div>
                        </div>`;
};

// 1. Process UserHistory
let uh = fs.readFileSync('pages/UserHistory.tsx', 'utf8');
uh = uh.replace(/<div class="header-section".*?>[\s\S]*?<div class="title-en">LEAVE APPLICATION<\/div>\s*<\/div>\s*<\/div>/g, 
    fixHeader3Columns(uh, 'طلب اجازة', 'LEAVE APPLICATION').replace(/\$\{titleAr\}/g, 'طلب اجازة').replace(/\$\{titleEn\}/g, 'LEAVE APPLICATION'));
uh = uh.replace(/<div class="header-section".*?>[\s\S]*?<div class="title-en">SWAP REQUEST<\/div>\s*<\/div>\s*<\/div>/g, 
    fixHeader3Columns(uh, 'طلب تبديل', 'SWAP REQUEST').replace(/\$\{titleAr\}/g, 'طلب تبديل').replace(/\$\{titleEn\}/g, 'SWAP REQUEST'));
fs.writeFileSync('pages/UserHistory.tsx', uh, 'utf8');

// 2. Process SupervisorHistory
let sh = fs.readFileSync('pages/supervisor/SupervisorHistory.tsx', 'utf8');
sh = sh.replace(/<div class="header-section".*?>[\s\S]*?<div class="title-en">\$\{titleEn\}<\/div>\s*<\/div>\s*<\/div>/g, 
    fixHeader3Columns(sh, '${titleAr}', '${titleEn}'));
fs.writeFileSync('pages/supervisor/SupervisorHistory.tsx', sh, 'utf8');

// 3. Process SupervisorLeaves
let sl = fs.readFileSync('pages/supervisor/SupervisorLeaves.tsx', 'utf8');
sl = sl.replace(/<div class="header-section".*?>[\s\S]*?<div class="title-en">LEAVE APPLICATION<\/div>\s*<\/div>\s*<\/div>/g, 
    fixHeader3Columns(sl, 'طلب اجازة', 'LEAVE APPLICATION').replace(/\$\{titleAr\}/g, 'طلب اجازة').replace(/\$\{titleEn\}/g, 'LEAVE APPLICATION'));
fs.writeFileSync('pages/supervisor/SupervisorLeaves.tsx', sl, 'utf8');

// 4. Process SupervisorSwaps
let sw = fs.readFileSync('pages/supervisor/SupervisorSwaps.tsx', 'utf8');
sw = sw.replace(/<div class="header-section".*?>[\s\S]*?<div class="title-en">SWAP REQUEST<\/div>\s*<\/div>\s*<\/div>/g, 
    fixHeader3Columns(sw, 'طلب تبديل', 'SWAP REQUEST').replace(/\$\{titleAr\}/g, 'طلب تبديل').replace(/\$\{titleEn\}/g, 'SWAP REQUEST'));
fs.writeFileSync('pages/supervisor/SupervisorSwaps.tsx', sw, 'utf8');

// 5. Process CTConsent (LTR container but inside RTL body)
// We have two print blocks in CTConsentPage
let ct = fs.readFileSync('pages/CTConsentPage.tsx', 'utf8');

// The first print block (saveAsPDF function) has this structure wrapper:
ct = ct.replace(/<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; border-bottom: 2px solid #1e3a8a; padding-bottom: 10px;">\s*<div style="display: flex; align-items: center; gap: 15px;">\s*<img src="\$\{logoUrl\}" style="max-height: 70px;" alt="Logo" crossOrigin="anonymous" \/>\s*<div style="display: flex; flex-direction: column; text-align: left;" dir="ltr">\s*<span style="font-weight: bold; font-size: 16px; color: #1e3a8a; letter-spacing: 1px;">AL JEDAANI HOSPITAL<\/span>\s*<span style="font-weight: bold; font-size: 18px; font-family: 'Cairo', sans-serif; color: #1e3a8a; margin-top: -4px;">مستشفى الجدعاني<\/span>\s*<span style="font-weight: bold; font-size: 14px; color: #1e3a8a; margin-top: 2px;">Radiology Department - قسم الأشعة<\/span>\s*<\/div>\s*<\/div>\s*<\/div>/g, 
`<div style="display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 20px; border-bottom: 2px solid #1e3a8a; padding-bottom: 10px; flex-direction: row-reverse;">
                            <div style="flex: 1; text-align: left; display: flex; flex-direction: column;" dir="ltr">
                                <span style="font-weight: bold; font-size: 16px; color: #1e3a8a;">Radiology Department</span>
                                <span style="font-weight: bold; font-size: 18px; font-family: 'Cairo', sans-serif; color: #1e3a8a; margin-top: 2px;">قسم الأشعة</span>
                            </div>
                            
                            <div style="flex: 2; display: flex; flex-direction: column; align-items: center; text-align: center;" dir="ltr">
                                <img src="\${logoUrl}" style="max-height: 70px;" alt="Logo" crossOrigin="anonymous" />
                                <span style="font-weight: bold; font-size: 16px; color: #1e3a8a; letter-spacing: 1px; margin-top: 4px;">AL JEDAANI HOSPITAL</span>
                                <span style="font-weight: bold; font-size: 18px; font-family: 'Cairo', sans-serif; color: #1e3a8a; margin-top: -4px;">مستشفى الجدعاني</span>
                            </div>

                            <div style="flex: 1;">
                                <!-- Empty to balance flex -->
                            </div>
                        </div>`);

// The second print block (handlePrint function)
ct = ct.replace(/<!-- Header -->\s*<div class="flex items-center justify-between mb-4 border-b-2 border-blue-900 pb-2 shrink-0">\s*<div class="flex items-center gap-4">\s*<img src="\$\{logoUrl\}" style="max-height: 60px;" alt="Logo" crossOrigin="anonymous" \/>\s*<div class="flex flex-col text-left" dir="ltr">\s*<span class="font-bold text-base text-blue-900 tracking-wide">AL JEDAANI HOSPITAL<\/span>\s*<span class="font-bold text-lg font-\[Cairo\] text-blue-900 -mt-1">مستشفى الجدعاني<\/span>\s*<span class="font-bold text-sm text-blue-900 mt-1">Radiology Department - قسم الأشعة<\/span>\s*<\/div>\s*<\/div>\s*<\/div>/g,
    `<!-- Header -->
                    <div class="flex items-end justify-between mb-4 border-b-2 border-blue-900 pb-2 shrink-0 flex-row-reverse">
                        <div class="flex-1 flex flex-col items-start text-left" dir="ltr">
                            <span class="font-bold text-base text-blue-900">Radiology Department</span>
                            <span class="font-bold text-lg font-[Cairo] text-blue-900 -mt-1">قسم الأشعة</span>
                        </div>
                        <div class="flex-[2] flex flex-col items-center justify-center text-center" dir="ltr">
                            <img src="\${logoUrl}" style="max-height: 60px;" alt="Logo" crossOrigin="anonymous" />
                            <span class="font-bold text-base text-blue-900 tracking-wide mt-1">AL JEDAANI HOSPITAL</span>
                            <span class="font-bold text-lg font-[Cairo] text-blue-900 -mt-1">مستشفى الجدعاني</span>
                        </div>
                        <div class="flex-1"></div>
                    </div>`);

fs.writeFileSync('pages/CTConsentPage.tsx', ct, 'utf8');

// 6. Process PenaltyPrintable
let pp = fs.readFileSync('components/PenaltyPrintable.tsx', 'utf8');
pp = pp.replace(/<div className="flex flex-col items-center">\s*<div className="flex items-center gap-4">\s*<img src="\/logo\.png" alt="Hospital Logo" className="w-20 h-20 object-contain" \/>\s*<div className="flex flex-col text-left">\s*<span className="font-bold text-lg text-blue-900 tracking-wide">AL JEDAANI HOSPITAL<\/span>\s*<span className="font-bold text-xl font-arabic text-blue-900 -mt-1">مستشفى الجدعاني<\/span>\s*<span className="font-bold text-sm text-blue-900 mt-1">Radiology Department - قسم الأشعة<\/span>\s*<\/div>\s*<\/div>\s*<\/div>/g, 
    `<div className="flex flex-col items-center">
          <img src="/logo.png" alt="Hospital Logo" className="w-20 h-20 object-contain" />
          <span className="font-bold text-lg text-blue-900 tracking-wide mt-1">AL JEDAANI HOSPITAL</span>
          <span className="font-bold text-xl font-arabic text-blue-900 -mt-1">مستشفى الجدعاني</span>
        </div>`);

pp = pp.replace(/<div className="text-left text-sm font-bold" dir="ltr">\s*<p>AL-JEDAANI GROUP OF HOSPITALS<\/p>\s*<p className="font-normal">Kingdom of Saudi Arabia<\/p>\s*<p className="font-normal">P\.O\. Box 7500 Jeddah 21462<\/p>\s*<\/div>/g, 
    `<div className="text-left text-sm font-bold flex flex-col justify-end" dir="ltr">
          <span className="font-bold text-base text-blue-900">Radiology Department</span>
          <span className="font-bold text-lg font-arabic text-blue-900">قسم الأشعة</span>
        </div>`);

fs.writeFileSync('components/PenaltyPrintable.tsx', pp, 'utf8');

// 7. Process printPenalty.ts
let ppen = fs.readFileSync('utils/printPenalty.ts', 'utf8');
ppen = ppen.replace(/<div class="header-text-en">\s*<p style="margin: 0 0 4px;">AL-JEDAANI GROUP OF HOSPITALS<\/p>\s*<p style="margin: 0 0 4px; font-weight: normal;">Kingdom of Saudi Arabia<\/p>\s*<p style="margin: 0; font-weight: normal;">P\.O\. Box 7500 Jeddah 21462<\/p>\s*<\/div>/g,
    `<div class="header-text-en" style="display: flex; flex-direction: column; justify-content: flex-end;">
                        <span style="font-weight: bold; font-size: 16px; color: #1e3a8a;">Radiology Department</span>
                        <span style="font-weight: bold; font-size: 18px; font-family: 'Cairo', sans-serif; color: #1e3a8a;">قسم الأشعة</span>
                    </div>`);

ppen = ppen.replace(/<div class="header-logo">\s*<img src="\$\{logoUrl\}" alt="Hospital Logo" crossOrigin="anonymous" \/>\s*<div style="font-weight: bold; font-size: 13px; margin-top: 5px; color: #1e3a8a;">Radiology Dept\. - قسم الأشعة<\/div>\s*<\/div>/g,
    `<div class="header-logo" style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;">
                        <img src="\${logoUrl}" alt="Hospital Logo" crossOrigin="anonymous" style="max-height: 70px;" />
                        <span style="font-weight: bold; font-size: 15px; color: #1e3a8a; letter-spacing: 1px; margin-top: 4px;">AL JEDAANI HOSPITAL</span>
                        <span style="font-weight: bold; font-size: 16px; font-family: 'Cairo', sans-serif; color: #1e3a8a; margin-top: -2px;">مستشفى الجدعاني</span>
                    </div>`);
fs.writeFileSync('utils/printPenalty.ts', ppen, 'utf8');

console.log("Aligned Radiology");
