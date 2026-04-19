import fs from 'fs';
const content = fs.readFileSync('pages/UserHistory.tsx', 'utf8');
const match = content.match(/const handlePrintLeave = async \(leave: LeaveRequest\) => \{[\s\S]*?console\.error\("Error printing swap request:", error\);\s*\}\s*\};\s*/);
if (match) {
    console.log("MATCH FOUND!");
    console.log("Length:", match[0].length);
} else {
    console.log("NO MATCH");
}
