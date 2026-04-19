const fs = require('fs');

const files = [
    'pages/supervisor/SupervisorHistory.tsx',
    'pages/supervisor/SupervisorLeaves.tsx',
    'pages/supervisor/SupervisorSwaps.tsx',
    'utils/printPenalty.ts'
];

const targetPattern = /<div class="header-section" style="display: flex; align-items: flex-start; justify-content: space-between;">([\s\S]*?)<div style="flex: 1\.5; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; text-align: center;">([\s\S]*?)<\/div>/g;

const replacement = `<div class="header-section" style="display: flex; align-items: flex-start; justify-content: space-between;">
                            <div style="flex: 1; text-align: left; display: flex; flex-direction: column;">
                                <span style="font-weight: bold; font-size: 16px; color: #1e3a8a;">Radiology Department</span>
                                <span style="font-weight: bold; font-size: 18px; font-family: 'Cairo', sans-serif; color: #1e3a8a; margin-top: 2px;">قسم الأشعة</span>
                            </div>

                            <div style="flex: 1; display: flex; justify-content: center; align-items: center;">
                                <div class="title-box">
                                    $1
                                </div>
                            </div>

                            <div style="flex: 1; display: flex; flex-direction: column; align-items: flex-end; justify-content: flex-start; text-align: right;">
                                $2
                            </div>
`;

// Note: utils/printPenalty.ts has a different structure, need to handle it separately.
files.forEach(file => {
    if (!fs.existsSync(file)) return;
    let content = fs.readFileSync(file, 'utf8');
    
    // Simple logic for Supervisor files which share the same structure
    if (file.includes('Supervisor')) {
        content = content.replace(targetPattern, replacement);
        fs.writeFileSync(file, content);
        console.log(`Updated ${file}`);
    } else if (file === 'utils/printPenalty.ts') {
        // Handle printPenalty.ts
        const printPenaltyPattern = /<div class="header-section" style="display: flex; align-items: flex-start; justify-content: space-between;">([\s\S]*?)<div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;">([\s\S]*?)<\/div>/g;
        // ... (this is getting complex, maybe just skip printPenalty.ts for now or do it manually)
    }
});
console.log('Done.');
