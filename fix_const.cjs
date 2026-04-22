const fs = require('fs');
const files = ['pages/UserHistory.tsx', 'pages/supervisor/SupervisorLeaves.tsx', 'pages/supervisor/SupervisorSwaps.tsx', 'pages/supervisor/SupervisorHistory.tsx', 'utils/printPenalty.ts'];
files.forEach(f => {
  let c = fs.readFileSync(f, 'utf8');
  c = c.replace(/const printColor = printStyle === 'old' \? '#000000' : '\$\{printColor\}';/g, "const printColor = printStyle === 'old' ? '#000000' : '#1e3a8a';");
  fs.writeFileSync(f, c);
});
console.log("Fixed const");
