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

    // Find all .stamp- CSS lines and replace printColor with #1e3a8a hardcoded
    const lines = content.split('\n');
    const changedLines = lines.map(line => {
      if (line.includes('.stamp-')) {
        return line.replace(/\$\{printColor\}/g, '#1e3a8a')
                   .replace(/\$\{printColorRgb\}/g, '30, 58, 138');
      }
      return line;
    });

    fs.writeFileSync(file, changedLines.join('\n'));
  }
});
console.log('Done stamp colors.');
