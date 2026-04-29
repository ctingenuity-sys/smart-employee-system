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

    // color: ${printColor}; text-align: center;
    content = content.replace(/color: \$\{printColor\};\s*text-align: center;/g, "color: #1e3a8a; text-align: center;");
    
    // .stamp-dept { font-size: 10px; margin-bottom: 1px; color: ${printColor}; }
    content = content.replace(/margin-bottom: 1px;\s*color: \$\{printColor\};/g, "margin-bottom: 1px; color: #1e3a8a;");
    
    // SupervisorHistory variant: .stamp-dept { font-size: 9px; margin-bottom: 2px; color: ${printColor}; }
    content = content.replace(/margin-bottom: 2px;\s*color: \$\{printColor\};/g, "margin-bottom: 2px; color: #1e3a8a;");

    fs.writeFileSync(file, content);
  }
});
console.log('Fixed more colors');
