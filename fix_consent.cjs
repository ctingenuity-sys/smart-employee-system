const fs = require('fs');

function fixConsentPage(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');

    // 1. In `saveAsPDF` (first print generator)
    // Replace the `<div style="height: 80px;"></div>` with the actual header
    content = content.replace(
        /<div style="height: 80px;"><\/div>/g,
        `<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; border-bottom: 2px solid #1e3a8a; padding-bottom: 10px;">
                        <div style="display: flex; align-items: center; gap: 15px;">
                            <img src="\${logoUrl}" style="max-height: 70px;" alt="Logo" crossOrigin="anonymous" />
                            <div style="display: flex; flex-direction: column; text-align: left;" dir="ltr">
                                <span style="font-weight: bold; font-size: 16px; color: #1e3a8a; letter-spacing: 1px;">AL JEDAANI HOSPITAL</span>
                                <span style="font-weight: bold; font-size: 18px; font-family: 'Cairo', sans-serif; color: #1e3a8a; margin-top: -4px;">مستشفى الجدعاني</span>
                            </div>
                        </div>
                    </div>`
    );

    // Turn #000/black into blue #1e3a8a for the first print generator
    content = content.replace(/color: black;/g, 'color: #1e3a8a;');
    content = content.replace(/border-bottom: 1px solid black;/g, 'border-bottom: 1px solid #1e3a8a;');
    content = content.replace(/stroke="black"/g, 'stroke="#1e3a8a"');
    content = content.replace(/fill="black"/g, 'fill="#1e3a8a"');

    // 2. In `handlePrint` (second print generator)
    // Add header to `handlePrint`
    content = content.replace(
        /<!-- Header Placeholder -->[\s\S]*?<div class="h-24 w-full mb-6 shrink-0"><\/div>/,
        `<!-- Header -->
                    <div class="flex items-center justify-between mb-4 border-b-2 border-blue-900 pb-2 shrink-0">
                        <div class="flex items-center gap-4">
                            <img src="\${logoUrl}" style="max-height: 60px;" alt="Logo" crossOrigin="anonymous" />
                            <div class="flex flex-col text-left" dir="ltr">
                                <span class="font-bold text-base text-blue-900 tracking-wide">AL JEDAANI HOSPITAL</span>
                                <span class="font-bold text-lg font-[Cairo] text-blue-900 -mt-1">مستشفى الجدعاني</span>
                            </div>
                        </div>
                    </div>`
    );

    // Update body css for tailwind print to be blue
    content = content.replace(/body \{ font-family: 'Cairo', sans-serif; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; color: black; margin: 0; padding: 0; \}/g, 
        `body { font-family: 'Cairo', sans-serif; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; color: #1e3a8a; margin: 0; padding: 0; }`);
    
    // Update body class inside handlePrint
    content = content.replace(/<body class="p-8 text-sm relative flex flex-col h-screen box-border">/g,
        `<body class="p-8 text-sm relative flex flex-col h-screen box-border text-blue-900">`);

    content = content.replace(/border-black/g, 'border-blue-900');
    content = content.replace(/fill="currentColor"/g, 'fill="#1e3a8a"'); // Just in case

    // Update watermark opacity in handlePrint
    content = content.replace(/opacity-\[0\.15\]/g, 'opacity-[0.06]');

    fs.writeFileSync(filePath, content, 'utf8');
}

fixConsentPage('pages/CTConsentPage.tsx');
