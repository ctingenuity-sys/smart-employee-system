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

    // Replace the border of stamp-box
    content = content.replace(/border: 3px solid \$\{printColor\};/g, "border: 3px solid #1e3a8a;");
    
    // Also inline styles style="border-top: 1px dashed rgba(${printColorRgb}, 0.4)..."
    // Wait I already replaced that. 
    
    // Check if there are any remaining ${printColor} inside .stamp-
    // Actually, let's just make sure we are fine.

    fs.writeFileSync(file, content);
  }
});
console.log('Fixed border thick color');
