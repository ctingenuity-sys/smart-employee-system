const fs = require('fs');
const file = 'pages/supervisor/SupervisorSwaps.tsx';
let content = fs.readFileSync(file, 'utf8');

// The replacement payload
const payload = `,
                      supervisorApproval: {
                          uid: currentUser?.uid || '',
                          name: currentUser?.name || 'Supervisor',
                          jobTitle: currentUser?.role || 'Supervisor',
                          approved: isApproved,
                          timestamp: Timestamp.now()
                      }`;

// Replace { status } or { status, ... }
// We have:
// batch.update(doc(db, 'swapRequests', req.id), { status });
// await updateDoc(doc(db, 'swapRequests', req.id), { status });
// batch.update(doc(db, 'swapRequests', req.id), { status, swapOption: excludeFridays ? 'exclude_fridays' : 'full_month' });
// batch.update(doc(db, 'swapRequests', req.id), { \n                      status, \n                      swapOption: excludeFridays ? 'exclude_fridays' : 'full_period'\n                  });

content = content.replace(/batch\.update\(doc\(db,\s*'swapRequests',\s*req\.id\),\s*\{\s*status\s*\}\);/g, 
  `batch.update(doc(db, 'swapRequests', req.id), { status ${payload} });`);

content = content.replace(/await updateDoc\(doc\(db,\s*'swapRequests',\s*req\.id\),\s*\{\s*status\s*\}\);/g, 
  `await updateDoc(doc(db, 'swapRequests', req.id), { status ${payload} });`);

content = content.replace(/batch\.update\(doc\(db,\s*'swapRequests',\s*req\.id\),\s*\{\s*status,\s*swapOption:\s*([^}]+)\s*\}\);/g, 
  `batch.update(doc(db, 'swapRequests', req.id), { status, swapOption: $1 ${payload} });`);

fs.writeFileSync(file, content);
console.log('Fixed swap updates to include supervisorApproval');
