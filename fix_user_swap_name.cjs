const fs = require('fs');

const file = 'pages/UserHistory.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
`            const supApp = (swap as any).supervisorApproval;
            if (supApp?.uid) {
                const sDoc = await getDoc(doc(db, 'users', supApp.uid));
                if (sDoc.exists()) {
                    const sData = sDoc.data();
                    supervisorName = sData.name || supApp.uid;
                    supervisorJob = sData.role || supApp.jobTitle || getJobTitle(sData);
                }
            }`,
`            const supApp = (swap as any).supervisorApproval;
            if (supApp) {
                supervisorName = supApp.name || '-';
                supervisorJob = supApp.jobTitle || '-';
            }
            if (supApp?.uid) {
                const sDoc = await getDoc(doc(db, 'users', supApp.uid));
                if (sDoc.exists()) {
                    const sData = sDoc.data();
                    supervisorName = sData.name || supervisorName || supApp.uid;
                    supervisorJob = sData.role || supervisorJob || getJobTitle(sData);
                }
            }`
);

fs.writeFileSync(file, content);
console.log('Fixed supervisor detail fetching in UserHistory');
