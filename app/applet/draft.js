import fs from 'fs';

const content = fs.readFileSync('pages/UserHistory.tsx', 'utf8');

const replacement = `
    const handlePrintLeave = async (leave: any) => {
        await handlePrintItem({ id: leave.id, type: 'leave', userId: leave.from, targetId: leave.to, startDate: leave.startDate, endDate: leave.endDate, status: leave.status, details: leave.details });
    };

    const handlePrintSwap = async (swap: any) => {
        await handlePrintItem({ id: swap.id, type: 'swap', userId: swap.from, targetId: swap.to, startDate: swap.startDate, endDate: swap.endDate, status: swap.status, details: swap.details });
    };

    const handlePrintItem = async (item: any) => {
        try {
            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                alert('Please allow popups to print the document.');
                return;
            }

            printWindow.document.write('<html><body><div style="text-align: center; margin-top: 50px; font-family: sans-serif;">Loading document...</div></body></html>');

            let collectionName = '';
            if (item.type === 'swap') collectionName = 'swapRequests';
            else if (item.type === 'leave') collectionName = 'leaveRequests';

            let fullData: any = {};
            if (collectionName) {
                // Wait, db is imported in UserHistory! getDoc is imported. doc is imported.
                // We must use them dynamically or assume they are in scope. They are in scope!
                // Wait! I will literally paste this inside the component!
            }
        } catch (e) {
            console.error(e);
        }
    };
`;
// Wait, I must put the db calls in there precisely.
