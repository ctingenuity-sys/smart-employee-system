const fs = require('fs');
const path = require('path');

function processFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');

    // Make crossorigin case-insensitive in match just in case
    // For single-line and multi-line matching of the header gap: 10px to gap: 15px
    content = content.replace(/<div\s+style="display:\s*flex;\s*align-items:\s*center;\s*gap:\s*10px;">\s*<img\s+src="\$\{logoUrl\}"\s+alt="Logo"\s+style="max-height:\s*80px;"\s+cross[Oo]rigin="anonymous"\s*\/>\s*<\/div>/g, 
        `<div style="display: flex; align-items: center; gap: 15px;">
                                <img src="\${logoUrl}" alt="Logo" style="max-height: 80px;" crossOrigin="anonymous" />
                                <div style="display: flex; flex-direction: column; text-align: left;">
                                    <span style="font-weight: bold; font-size: 18px; color: #1e3a8a; letter-spacing: 1px;">AL JEDAANI HOSPITAL</span>
                                    <span style="font-weight: bold; font-size: 20px; font-family: 'Cairo', sans-serif; color: #1e3a8a; margin-top: -5px;">مستشفى الجدعاني</span>
                                </div>
                            </div>`);

    // Fix watermark
    content = content.replace(/transform:\s*translate\(-50%,\s*-50%\)\s*rotate\(-45deg\);/g, 'transform: translate(-50%, -50%);');
    content = content.replace(/opacity:\s*0\.1[0-9];/g, 'opacity: 0.06;'); // Match 0.15 etc
    // Match width: 70%; or width: 50%; with optional max-width
    content = content.replace(/width:\s*70%;/g, 'width: 50%; max-width: 500px;');

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Processed ${filePath}`);
}

const filesToProcess = [
    './pages/UserHistory.tsx',
    './pages/supervisor/SupervisorHistory.tsx',
    './pages/supervisor/SupervisorLeaves.tsx',
    './pages/supervisor/SupervisorSwaps.tsx',
    './pages/CTConsentPage.tsx'
];

filesToProcess.forEach(processFile);

// For components/PenaltyPrintable.tsx
// It uses Tailwind classes
const penaltyPath = './components/PenaltyPrintable.tsx';
if (fs.existsSync(penaltyPath)) {
    let content = fs.readFileSync(penaltyPath, 'utf8');
    // Replace header 
     content = content.replace(/<img src="\/logo\.png".*?\/>/g, 
        `<div className="flex items-center gap-4">
            <img src="/logo.png" alt="Hospital Logo" className="w-20 h-20 object-contain" />
            <div className="flex flex-col text-left">
              <span className="font-bold text-lg text-blue-900 tracking-wide">AL JEDAANI HOSPITAL</span>
              <span className="font-bold text-xl font-arabic text-blue-900 -mt-1">مستشفى الجدعاني</span>
            </div>
          </div>`);
          
    // Update watermark
    content = content.replace(/className="absolute top-1\/4 left-1\/4 w-1\/2 h-1\/2 opacity-10 rotate-[-45deg]"/g, 
        `className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1/2 max-w-[500px] opacity-[0.06] object-contain pointer-events-none"`);
    content = content.replace(/className="w-full h-full object-contain pointer-events-none"/g, ``); // clean up nested if needed

    fs.writeFileSync(penaltyPath, content, 'utf8');
    console.log(`Processed ${penaltyPath}`);
}
