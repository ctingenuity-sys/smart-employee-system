const fs = require('fs');

function replaceColorsInFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');

    // Replace #000 in specific CSS blocks
    content = content.replace(/color: #000;/g, 'color: #1e3a8a;');
    content = content.replace(/border: 1px solid #000;/g, 'border: 1px solid #1e3a8a;');
    content = content.replace(/border: 2px solid #000;/g, 'border: 2px solid #1e3a8a; background: rgba(30, 58, 138, 0.05);');
    content = content.replace(/border: 1.5px solid #000;/g, 'border: 1.5px solid #1e3a8a;');
    content = content.replace(/background: #fff; font-weight: bold;/g, 'background: rgba(30, 58, 138, 0.05); font-weight: bold; color: #1e3a8a;');

    // Change title-box
    content = content.replace(/.title-box { display: inline-block; border: 2px solid #1e3a8a; border-radius: 12px; padding: 5px 30px; text-align: center; }/g, 
                             '.title-box { display: inline-block; border: 2px solid #1e3a8a; border-radius: 12px; padding: 5px 30px; text-align: center; background: rgba(30, 58, 138, 0.05); }');

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Replaced colors in ${filePath}`);
}

replaceColorsInFile('./pages/UserHistory.tsx');
replaceColorsInFile('./pages/supervisor/SupervisorHistory.tsx');
