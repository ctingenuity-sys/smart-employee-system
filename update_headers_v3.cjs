const fs = require('fs');

const files = [
    'pages/UserHistory.tsx',
    'pages/supervisor/SupervisorHistory.tsx',
    'pages/supervisor/SupervisorLeaves.tsx',
    'pages/supervisor/SupervisorSwaps.tsx',
    'utils/printPenalty.ts'
];

// Current broken header pattern based on UserHistory.tsx observation
// We need to clean up the double title-box and fix the layout.

files.forEach(file => {
    if (!fs.existsSync(file)) return;
    let content = fs.readFileSync(file, 'utf8');

    // The pattern found included double <div class="title-box"> and messed up variable substitution
    // Let's replace the whole header section with a clean, hardcoded structure per file.
    
    // For UserHistory.tsx
    if (file === 'pages/UserHistory.tsx') {
        content = content.replace(/<div class="header-section" style="[\s\S]*?<\/div>[\s\S]*?<\/div>[\s\S]*?<\/div>/, `<div class="header-section" style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #1e3a8a; padding-bottom: 10px; margin-bottom: 10px;">
                            <div style="flex: 1; text-align: left; font-weight: bold; font-size: 16px; color: #1e3a8a;">
                                Radiology Department <br/> قسم الأشعة
                            </div>

                            <div style="flex: 1; display: flex; justify-content: center; align-items: center;">
                                <div class="title-box">
                                    <div class="title-ar">\${item.titleAr}</div>
                                    <div class="title-en">\${item.titleEn}</div>
                                </div>
                            </div>

                            <div style="flex: 1; display: flex; flex-direction: row; align-items: center; justify-content: flex-end; text-align: right; gap: 10px;">
                                <div style="display: flex; flex-direction: column; font-weight: bold; color: #1e3a8a;">
                                    <span style="font-size: 14px;">AL JEDAANI HOSPITAL</span>
                                    <span style="font-family: 'Cairo', sans-serif; font-size: 16px;">مستشفى الجدعاني</span>
                                </div>
                                <img src="\${logoUrl}" alt="Logo" style="max-height: 50px;" crossOrigin="anonymous" />
                            </div>
                        </div>`);
    } else if (file.includes('Supervisor')) {
        // Similar for others, just ensure titleAr/titleEn or static titles are used
        content = content.replace(/<div class="header-section" style="[\s\S]*?<\/div>[\s\S]*?<\/div>[\s\S]*?<\/div>/, `<div class="header-section" style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #1e3a8a; padding-bottom: 10px; margin-bottom: 10px;">
                            <div style="flex: 1; text-align: left; font-weight: bold; font-size: 16px; color: #1e3a8a;">
                                Radiology Department <br/> قسم الأشعة
                            </div>

                            <div style="flex: 1; display: flex; justify-content: center; align-items: center;">
                                <div class="title-box">
                                   <!-- Title dynamically inserted here in original -->
                                </div>
                            </div>

                            <div style="flex: 1; display: flex; flex-direction: row; align-items: center; justify-content: flex-end; text-align: right; gap: 10px;">
                                <div style="display: flex; flex-direction: column; font-weight: bold; color: #1e3a8a;">
                                    <span style="font-size: 14px;">AL JEDAANI HOSPITAL</span>
                                    <span style="font-family: 'Cairo', sans-serif; font-size: 16px;">مستشفى الجدعاني</span>
                                </div>
                                <img src="\${logoUrl}" alt="Logo" style="max-height: 50px;" crossOrigin="anonymous" />
                            </div>
                        </div>`);
    }
    
    fs.writeFileSync(file, content);
    console.log(`Updated ${file}`);
});
console.log('Done.');
