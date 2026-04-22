const fs = require('fs');
let content = fs.readFileSync('pages/supervisor/SupervisorHistory.tsx', 'utf8');

// Add imports if needed
if (!content.includes('PrintStyleModal')) {
    content = content.replace("import { PrintHeader, PrintFooter }", "import { PrintHeader, PrintFooter } from '../../components/PrintLayout';\nimport { PrintStyleModal } from '../../components/PrintStyleModal';");
}

// Add state variables
if (!content.includes('isPrintStyleModalOpen')) {
    content = content.replace(
        "const [refreshTrigger, setRefreshTrigger] = useState(0);",
        "const [refreshTrigger, setRefreshTrigger] = useState(0);\n    const [isPrintStyleModalOpen, setIsPrintStyleModalOpen] = useState(false);\n    const [itemToPrint, setItemToPrint] = useState<HistoryItem | null>(null);"
    );
}

// Extract onClick content
const onClickRegex = /<button onClick=\{async \(\) => \{(.*?)\}\} className="text-slate-300 hover:text-indigo-500">/s;
const match = content.match(onClickRegex);

if (match) {
    let printLogic = match[1];

    let newButton = `<button onClick={() => {
                                            setItemToPrint(item);
                                            setIsPrintStyleModalOpen(true);
                                        }} className="text-slate-300 hover:text-indigo-500">`;

    content = content.replace(onClickRegex, newButton);

    // Apply color logic to printLogic
    printLogic = printLogic.replace(
        "const logoUrl = new URL('/logo.png', window.location.origin).href;",
        "const printStyle = style;\n                                            const logoUrl = new URL(printStyle === 'old' ? '/old-logo.png' : '/logo.png', window.location.origin).href;\n                                            const printColor = printStyle === 'old' ? '#000000' : '#1e3a8a';\n                                            const printColorRgb = printStyle === 'old' ? '0, 0, 0' : '30, 58, 138';"
    );
    printLogic = printLogic.replace(/#1e3a8a/g, '${printColor}');
    printLogic = printLogic.replace(/rgba\(30, 58, 138/g, 'rgba(${printColorRgb}');
    
    let newFunc = `
    const handleConfirmPrint = async (style: 'new' | 'old') => {
        if (!itemToPrint) return;
        const item = itemToPrint;
        setIsPrintStyleModalOpen(false);
${printLogic}
    };
    `;
    
    content = content.replace("const handleDelete = async (item: HistoryItem) => {", newFunc + "\n\n    const handleDelete = async (item: HistoryItem) => {");

    content = content.replace(
        "            <PrintFooter themeColor=\"indigo\" />\n        </div>", 
        "            <PrintFooter themeColor=\"indigo\" />\n            <PrintStyleModal isOpen={isPrintStyleModalOpen} onClose={() => setIsPrintStyleModalOpen(false)} onConfirm={handleConfirmPrint} />\n        </div>"
    );

    fs.writeFileSync('pages/supervisor/SupervisorHistory.tsx', content);
    console.log("Successfully updated SupervisorHistory.tsx");
} else {
    console.log("Regex not found");
}
