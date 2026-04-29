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

    // Add print-color-adjust to body
    content = content.replace(/body\s*\{/g, "body { -webkit-print-color-adjust: exact; print-color-adjust: exact; ");

    // Change dark blue stamp to a vivid blue
    // #1e3a8a -> #2563eb
    // 30, 58, 138 -> 37, 99, 235
    content = content.replace(/#1e3a8a/g, "#2563eb");
    content = content.replace(/30,\s*58,\s*138/g, "37, 99, 235");

    fs.writeFileSync(file, content);
  }
});

console.log('Fixed ink colors to vivid blue and added color adjust');
