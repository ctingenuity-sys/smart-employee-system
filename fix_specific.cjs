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

    // Replace color within CSS declarations
    // We can confidently replace all `${printColor}` with `#1e3a8a` BEFORE `text-align: center; font-family: 'Courier New'`
    content = content.replace(/color: \$\{printColor\};\s*text-align: center;\s*font-family: 'Courier New'/g, "color: #1e3a8a;\n                            text-align: center;\n                            font-family: 'Courier New'");

    // box-shadow: inset 0 0 2px rgba(${printColorRgb}, 0.2);
    content = content.replace(/box-shadow: inset 0 0 2px rgba\(\$\{printColorRgb\}, 0\.2\);/g, "box-shadow: inset 0 0 2px rgba(30, 58, 138, 0.2);");

    // border: 1px solid rgba(${printColorRgb}, 0.5);
    content = content.replace(/border: 1px solid rgba\(\$\{printColorRgb\}, 0\.5\);/g, "border: 1px solid rgba(30, 58, 138, 0.5);");
    
    // border-bottom: 1px dashed rgba(${printColorRgb}, 0.4);
    content = content.replace(/border-bottom: 1px dashed rgba\(\$\{printColorRgb\}, 0\.4\);/g, "border-bottom: 1px dashed rgba(30, 58, 138, 0.4);");
    content = content.replace(/border-top: 1px dashed rgba\(\$\{printColorRgb\}, 0\.4\);/g, "border-top: 1px dashed rgba(30, 58, 138, 0.4);");

    fs.writeFileSync(file, content);
  }
});
console.log('Done very specific deep stamp colors.');
