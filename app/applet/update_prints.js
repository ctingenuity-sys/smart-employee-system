import fs from 'fs';

const files = [
    'pages/UserHistory.tsx',
    'pages/supervisor/SupervisorLeaves.tsx',
    'pages/supervisor/SupervisorSwaps.tsx'
];

files.forEach(file => {
    if (!fs.existsSync(file)) {
        console.log("File not found:", file);
        return;
    }
    let content = fs.readFileSync(file, 'utf8');
    
    // Add PrintStyleModal import if not exists
    if (!content.includes('PrintStyleModal')) {
        content = content.replace(/(import .*;\n)(?=\n|(?:\w+ \w+ =))/s, "$1import { PrintStyleModal } from '../components/PrintStyleModal';\n");
    }
    // Correct relative path for supervisor files
    if (file.includes('supervisor')) {
        content = content.replace(/import \{ PrintStyleModal \} from '\.\.\/components\/PrintStyleModal';/, "import { PrintStyleModal } from '../../components/PrintStyleModal';");
    }
    
    // Replace handlePrintSwap definition
    content = content.replace(/const handlePrintSwap = async \(([^)]+)\) => \{/g, "const handlePrintSwap = async ($1, printStyle: 'new' | 'old' = 'new') => {");
    
    // For UserHistory leave definition (if missed)
    content = content.replace(/const handlePrintLeave = async \(leave: LeaveRequest\) => \{/g, "const handlePrintLeave = async (leave: LeaveRequest, printStyle: 'new' | 'old' = 'new') => {");

    // Replace logoUrl and add colors inside the functions
    // We match the origin string and capture it to insert variables right after
    const logoUrlRegex = /const logoUrl = new URL\('\/logo.png', window.location.origin\).href;/g;
    content = content.replace(logoUrlRegex, "const logoUrl = new URL(printStyle === 'old' ? '/old-logo.png' : '/logo.png', window.location.origin).href;\n            const printColor = printStyle === 'old' ? '#000000' : '#1e3a8a';\n            const printColorRgb = printStyle === 'old' ? '0, 0, 0' : '30, 58, 138';");
    
    let htmlContentRegex = /let htmlContent = `([\s\S]*?)`;/g;
    let match;
    const replacements = [];
    
    while ((match = htmlContentRegex.exec(content)) !== null) {
        let snippet = match[0];
        // Only replace if it contains #1e3a8a (indicating it's the print template)
        if (snippet.includes('#1e3a8a')) {
            snippet = snippet.replace(/#1e3a8a/g, "${printColor}");
            snippet = snippet.replace(/30, 58, 138/g, "${printColorRgb}");
            replacements.push({ target: match[0], replacement: snippet });
        }
    }
    
    for (const r of replacements) {
        content = content.replace(r.target, r.replacement);
    }
    
    fs.writeFileSync(file, content, 'utf8');
    console.log("Updated", file);
});
