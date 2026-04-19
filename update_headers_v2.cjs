const fs = require('fs');

const files = [
    'pages/UserHistory.tsx',
    'pages/supervisor/SupervisorHistory.tsx',
    'pages/supervisor/SupervisorLeaves.tsx',
    'pages/supervisor/SupervisorSwaps.tsx',
    'utils/printPenalty.ts'
];

// Patterns based on observations
const logoRightPattern = /<div class="header-section" style="display: flex; align-items: flex-start; justify-content: space-between;">([\s\S]*?)<div style="flex: 1; text-align: left; display: flex; flex-direction: column;">([\s\S]*?)<\/div>([\s\S]*?)<div style="flex: 1; display: flex; justify-content: center; align-items: center;">([\s\S]*?)<\/div>([\s\S]*?)<div style="flex: 1; display: flex; flex-direction: column; align-items: flex-end; justify-content: flex-start; text-align: right;">([\s\S]*?)<\/div>([\s\S]*?)<\/div>/g;

const replacement = `<div class="header-section" style="display: flex; align-items: center; justify-content: space-between;">
                            <div style="flex: 1; text-align: left; font-weight: bold; font-size: 16px; color: #1e3a8a;">
                                Radiology Department <br/> قسم الأشعة
                            </div>

                            <div style="flex: 1; display: flex; justify-content: center; align-items: center;">
                                <div class="title-box">
                                    $4
                                </div>
                            </div>

                            <div style="flex: 1; display: flex; flex-direction: row; align-items: center; justify-content: flex-end; text-align: right; gap: 10px;">
                                <div style="display: flex; flex-direction: column; font-weight: bold; color: #1e3a8a;">
                                    <span style="font-size: 14px;">AL JEDAANI HOSPITAL</span>
                                    <span style="font-family: 'Cairo', sans-serif; font-size: 16px;">مستشفى الجدعاني</span>
                                </div>
                                <img src="\${logoUrl}" alt="Logo" style="max-height: 50px;" crossOrigin="anonymous" />
                            </div>
                        </div>`;

files.forEach(file => {
    if (!fs.existsSync(file)) return;
    let content = fs.readFileSync(file, 'utf8');
    
    // We need to be careful with the pattern. The first part is roughly common.
    // The previous update script used regex to replace the old header. 
    // Let's refine the replacement to be simpler based on structure.
    
    // This is a rough replace. It might fail if the structure varies slightly in files.
    // Given the previous successful run, let's proceed but with caution.
    content = content.replace(/<div class="header-section" style="display: flex; align-items: flex-start; justify-content: space-between;">([\s\S]*?)<div style="flex: 1; text-align: left; display: flex; flex-direction: column;">[\s\S]*?<\/div>([\s\S]*?)<div style="flex: 1; display: flex; justify-content: center; align-items: center;">([\s\S]*?)<\/div>([\s\S]*?)<div style="flex: 1; display: flex; flex-direction: column; align-items: flex-end; justify-content: flex-start; text-align: right;">([\s\S]*?)<\/div>[\s\S]*?<\/div>/g, 
    `<div class="header-section" style="display: flex; align-items: center; justify-content: space-between;">
                            <div style="flex: 1; text-align: left; font-weight: bold; font-size: 16px; color: #1e3a8a;">
                                Radiology Department <br/> قسم الأشعة
                            </div>

                            <div style="flex: 1; display: flex; justify-content: center; align-items: center;">
                                <div class="title-box">
                                    $3
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
    
    fs.writeFileSync(file, content);
    console.log(`Updated ${file}`);
});
console.log('Done.');
