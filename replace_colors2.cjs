const fs = require('fs');

function replaceColorsInFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');

    // Replace #000 in specific CSS blocks
    content = content.replace(/color: #000;/g, 'color: #1e3a8a;');
    content = content.replace(/border: 1px solid #000;/g, 'border: 1px solid #1e3a8a;');
    content = content.replace(/border: 2px solid #000;/g, 'border: 2px solid #1e3a8a;');
    content = content.replace(/border: 1.5px solid #000;/g, 'border: 1.5px solid #1e3a8a;');

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Replaced colors in ${filePath}`);
}

replaceColorsInFile('./pages/supervisor/SupervisorLeaves.tsx');
replaceColorsInFile('./pages/supervisor/SupervisorSwaps.tsx');
replaceColorsInFile('./pages/CTConsentPage.tsx');
replaceColorsInFile('./utils/printPenalty.ts');
