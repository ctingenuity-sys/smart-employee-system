const fs = require('fs');

const files = [
  'pages/UserHistory.tsx',
  'pages/supervisor/SupervisorLeaves.tsx',
  'pages/supervisor/SupervisorSwaps.tsx',
  'pages/supervisor/SupervisorHistory.tsx'
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');

  // We only replace ${printColor} and ${printColorRgb} on lines containing .stamp-
  const lines = content.split('\n');
  const newLines = lines.map(line => {
    if (line.includes('.stamp-')) {
      return line
        .replace(/\$\{printColor\}/g, '#1e3a8a')
        .replace(/\$\{printColorRgb\}/g, '30, 58, 138');
    }
    return line;
  });

  fs.writeFileSync(file, newLines.join('\n'));
});

console.log('Successfully updated stamp colors.');
