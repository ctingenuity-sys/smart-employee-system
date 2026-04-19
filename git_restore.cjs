const { execSync } = require('child_process');
try {
  console.log(execSync('git restore pages/UserHistory.tsx').toString());
} catch(e) {
  console.log('No git restore: ', e.message);
  try {
     console.log(execSync('git checkout -- pages/UserHistory.tsx').toString());
  } catch(e2) {
     console.log('No git checkout: ', e2.message);
  }
}
