import fs from 'fs';

const files = [
    'pages/supervisor/SupervisorLeaves.tsx',
    'pages/supervisor/SupervisorSwaps.tsx',
    'pages/UserHistory.tsx'
];

files.forEach(file => {
    if (!fs.existsSync(file)) return;
    let s = fs.readFileSync(file, 'utf8');
    
    // Replace html template in each one
    let htmlStart = s.indexOf('let htmlContent = `');
    if (htmlStart === -1) htmlStart = s.indexOf('const htmlContent = `');
    
    if (htmlStart !== -1) {
        let htmlEnd = s.indexOf('`;\n', htmlStart);
        if (htmlEnd === -1) htmlEnd = s.indexOf('`;', htmlStart);
        let before = s.slice(0, htmlStart);
        let html = s.slice(htmlStart, htmlEnd);
        let after = s.slice(htmlEnd);
        
        html = html.replace(/#1e3a8a/g, '${printColor}');
        html = html.replace(/30,\s*58,\s*138/g, '${printColorRgb}');
        
        s = before + html + after;
        fs.writeFileSync(file, s);
        console.log("Updated CSS inside", file);
    }
});
