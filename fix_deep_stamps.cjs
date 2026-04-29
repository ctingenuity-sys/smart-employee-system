const fs = require('fs');

const files = [
  'pages/UserHistory.tsx',
  'pages/supervisor/SupervisorLeaves.tsx',
  'pages/supervisor/SupervisorSwaps.tsx',
  'pages/supervisor/SupervisorHistory.tsx',
  'utils/printPenalty.ts'
];

files.forEach(file => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');

    // Replace within .stamp-box
    content = content.replace(/\.stamp-box\s*\{[^}]+\}/g, match => {
        return match.replace(/\$\{printColor\}/g, '#1e3a8a')
                    .replace(/\$\{printColorRgb\}/g, '30, 58, 138');
    });

    // Replace within .stamp-inner
    content = content.replace(/\.stamp-inner\s*\{[^}]+\}/g, match => {
        return match.replace(/\$\{printColor\}/g, '#1e3a8a')
                    .replace(/\$\{printColorRgb\}/g, '30, 58, 138');
    });

    // Replace within .stamp-hospital
    content = content.replace(/\.stamp-hospital\s*\{[^}]+\}/g, match => {
        return match.replace(/\$\{printColor\}/g, '#1e3a8a')
                    .replace(/\$\{printColorRgb\}/g, '30, 58, 138');
    });

    // Replace within .stamp-dept
    content = content.replace(/\.stamp-dept\s*\{[^}]+\}/g, match => {
        return match.replace(/\$\{printColor\}/g, '#1e3a8a')
                    .replace(/\$\{printColorRgb\}/g, '30, 58, 138');
    });

    fs.writeFileSync(file, content);
  }
});
console.log('Done deep stamp colors.');
