const fs = require('fs');

const replaceMap = [
    {
        file: './pages/UserHistory.tsx',
        watermarks: [{ from: /width:\s*50%;\s*max-width:\s*500px;/g, to: 'width: 80%; max-width: 800px;' }],
        headers: [{
            from: /<span style="font-weight: bold; font-size: 20px; font-family: 'Cairo', sans-serif; color: #1e3a8a; margin-top: -5px;">مستشفى الجدعاني<\/span>/g,
            to: `<span style="font-weight: bold; font-size: 20px; font-family: 'Cairo', sans-serif; color: #1e3a8a; margin-top: -5px;">مستشفى الجدعاني</span>\n                                    <span style="font-weight: bold; font-size: 14px; color: #1e3a8a; margin-top: 2px;">Radiology Department - قسم الأشعة</span>`
        }]
    },
    {
        file: './pages/supervisor/SupervisorHistory.tsx',
        watermarks: [{ from: /width:\s*80%;\s*max-width:\s*500px;/g, to: 'width: 100%; max-width: 800px;' }],
        headers: [{
            from: /<span style="font-weight: bold; font-size: 20px; font-family: 'Cairo', sans-serif; color: #1e3a8a; margin-top: -5px;">مستشفى الجدعاني<\/span>/g,
            to: `<span style="font-weight: bold; font-size: 20px; font-family: 'Cairo', sans-serif; color: #1e3a8a; margin-top: -5px;">مستشفى الجدعاني</span>\n                                    <span style="font-weight: bold; font-size: 14px; color: #1e3a8a; margin-top: 2px;">Radiology Department - قسم الأشعة</span>`
        }]
    },
    {
        file: './pages/supervisor/SupervisorLeaves.tsx',
        watermarks: [{ from: /width:\s*80%;\s*max-width:\s*800px;/g, to: 'width: 800%; max-width: 800px;' }],
        headers: [{
            from: /<span style="font-weight: bold; font-size: 20px; font-family: 'Cairo', sans-serif; color: #1e3a8a; margin-top: -5px;">مستشفى الجدعاني<\/span>/g,
            to: `<span style="font-weight: bold; font-size: 20px; font-family: 'Cairo', sans-serif; color: #1e3a8a; margin-top: -5px;">مستشفى الجدعاني</span>\n                                    <span style="font-weight: bold; font-size: 14px; color: #1e3a8a; margin-top: 2px;">Radiology Department - قسم الأشعة</span>`
        }]
    },
    {
        file: './pages/supervisor/SupervisorSwaps.tsx',
        watermarks: [{ from: /width:\s*50%;\s*max-width:\s*500px;/g, to: 'width: 80%; max-width: 800px;' }],
        headers: [{
            from: /<span style="font-weight: bold; font-size: 20px; font-family: 'Cairo', sans-serif; color: #1e3a8a; margin-top: -5px;">مستشفى الجدعاني<\/span>/g,
            to: `<span style="font-weight: bold; font-size: 20px; font-family: 'Cairo', sans-serif; color: #1e3a8a; margin-top: -5px;">مستشفى الجدعاني</span>\n                                    <span style="font-weight: bold; font-size: 14px; color: #1e3a8a; margin-top: 2px;">Radiology Department - قسم الأشعة</span>`
        }]
    },
    {
        file: './components/PenaltyPrintable.tsx',
        watermarks: [{ from: /w-1\/2 max-w-\[500px\]/g, to: 'w-[80%] max-w-[800px]' }],
        headers: [{
            from: /<span className="font-bold text-xl font-arabic text-blue-900 -mt-1">مستشفى الجدعاني<\/span>/g,
            to: `<span className="font-bold text-xl font-arabic text-blue-900 -mt-1">مستشفى الجدعاني</span>\n              <span className="font-bold text-sm text-blue-900 mt-1">Radiology Department - قسم الأشعة</span>`
        }]
    },
    {
        file: './pages/CTConsentPage.tsx',
        watermarks: [
            { from: /width:\s*400px;\s*max-width:\s*90vw;/g, to: 'width: 800px; max-width: 95vw;' },
            { from: /width:\s*400px;\s*max-width:\s*80vw;/g, to: 'width: 800px; max-width: 95vw;' }
        ],
        headers: [
            {
                from: /<span style="font-weight: bold; font-size: 18px; font-family: 'Cairo', sans-serif; color: #1e3a8a; margin-top: -4px;">مستشفى الجدعاني<\/span>/g,
                to: `<span style="font-weight: bold; font-size: 18px; font-family: 'Cairo', sans-serif; color: #1e3a8a; margin-top: -4px;">مستشفى الجدعاني</span>\n                                <span style="font-weight: bold; font-size: 14px; color: #1e3a8a; margin-top: 2px;">Radiology Department - قسم الأشعة</span>`
            },
            {
                from: /<span class="font-bold text-lg font-\[Cairo\] text-blue-900 -mt-1">مستشفى الجدعاني<\/span>/g,
                to: `<span class="font-bold text-lg font-[Cairo] text-blue-900 -mt-1">مستشفى الجدعاني</span>\n                                <span class="font-bold text-sm text-blue-900 mt-1">Radiology Department - قسم الأشعة</span>`
            }
        ]
    },
    {
        file: './utils/printPenalty.ts',
        watermarks: [{ from: /width:\s*50%;\n?\s*max-width:\s*500px;/g, to: 'width: 80%;\n                    max-width: 800px;' }],
        headers: [{
            from: /<div class="header-logo">\s*<img src="\$\{logoUrl\}" alt="Hospital Logo" crossOrigin="anonymous" \/>\s*<\/div>/g,
            to: `<div class="header-logo">\n                        <img src="\${logoUrl}" alt="Hospital Logo" crossOrigin="anonymous" />\n                        <div style="font-weight: bold; font-size: 13px; margin-top: 5px; color: #1e3a8a;">Radiology Dept. - قسم الأشعة</div>\n                    </div>`
        }]
    }
];

replaceMap.forEach(item => {
    if (!fs.existsSync(item.file)) return;
    let content = fs.readFileSync(item.file, 'utf8');

    item.watermarks.forEach(wm => {
        content = content.replace(wm.from, wm.to);
    });

    item.headers.forEach(hd => {
        content = content.replace(hd.from, hd.to);
    });

    fs.writeFileSync(item.file, content, 'utf8');
    console.log('Updated', item.file);
});
