import React, { useState, useEffect, useMemo } from 'react';
import { inventoryDb, inventoryStorage } from '../firebaseInventory';
import { db } from '../firebase';
// @ts-ignore
import { collection, addDoc, doc, updateDoc, onSnapshot, Timestamp, deleteDoc, writeBatch, getDocs, query, where } from 'firebase/firestore';
// @ts-ignore
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { Material, Invoice, MaterialUsage, ForecastResult, MaterialDistribution, User, CustodyTransfer } from '../types';
import Loading from '../components/Loading';
import Toast from '../components/Toast';
import { useLanguage } from '../contexts/LanguageContext';
import { useDepartment } from '../contexts/DepartmentContext';
import { PrintHeader, PrintFooter } from './PrintLayout';
import { GoogleGenAI } from "@google/genai";
import imageCompression from 'browser-image-compression';

interface InventorySystemProps {
    userRole: string;
    userName: string;
    userEmail: string;
}

const InventorySystem: React.FC<InventorySystemProps> = ({ userRole, userName, userEmail }) => {
    const { t, dir, language } = useLanguage();
    const { selectedDepartmentId } = useDepartment();
    const [activeTab, setActiveTab] = useState<'dashboard' | 'usage' | 'incoming' | 'materials' | 'reports' | 'distribution' | 'custody'>(userRole === 'custody_clerk' ? 'distribution' : 'dashboard');
    const [materials, setMaterials] = useState<Material[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [usages, setUsages] = useState<MaterialUsage[]>([]);
    const [distributions, setDistributions] = useState<MaterialDistribution[]>([]);
    const [transfers, setTransfers] = useState<CustodyTransfer[]>([]);
    const [employees, setEmployees] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<{msg: string, type: 'success' | 'info' | 'error'} | null>(null);

    // AI Forecasting State
    const [forecasts, setForecasts] = useState<ForecastResult[]>([]);
    const [isForecasting, setIsForecasting] = useState(false);

    // --- Inputs States ---
    const [selectedMaterial, setSelectedMaterial] = useState('');
    const [usageAmount, setUsageAmount] = useState('');
    const [patientFileNumber, setPatientFileNumber] = useState('');
    const [usageDate, setUsageDate] = useState(new Date().toISOString().split('T')[0]);
    const [usageStaffName, setUsageStaffName] = useState(userName);

    const [incMaterial, setIncMaterial] = useState('');
    const [incQuantity, setIncQuantity] = useState('');
    const [incExpiry, setIncExpiry] = useState('');

    const [distMaterial, setDistMaterial] = useState('');
    const [distAmount, setDistAmount] = useState('');
    const [distStaffName, setDistStaffName] = useState('');
    const [distStaffEmail, setDistStaffEmail] = useState('');
    const [distDate, setDistDate] = useState(new Date().toISOString().split('T')[0]);

    const [custodyMaterial, setCustodyMaterial] = useState('');
    const [custodyAmount, setCustodyAmount] = useState('');
    const [custodyPatientFile, setCustodyPatientFile] = useState('');
    const [custodyUsageDate, setCustodyUsageDate] = useState(new Date().toISOString().split('T')[0]);
    const [custodySubTab, setCustodySubTab] = useState<'use' | 'transfer'>('use');
    const [transferMaterial, setTransferMaterial] = useState('');
    const [transferAmount, setTransferAmount] = useState('');
    const [transferRecipient, setTransferRecipient] = useState('');
    const [incImage, setIncImage] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);

    const [newMatName, setNewMatName] = useState('');
    const [newMatQty, setNewMatQty] = useState('');
    const [editingMat, setEditingMat] = useState<Material | null>(null);
    const [correctionDate, setCorrectionDate] = useState(new Date().toISOString().split('T')[0]); 
    const [materialSearch, setMaterialSearch] = useState('');

    // Supervisor Custody Dashboard & Handover state
    const [distSubTab, setDistSubTab] = useState<'distribute' | 'monitoring' | 'handovers'>('distribute');
    const [distMonitoringSearch, setDistMonitoringSearch] = useState('');
    const [distMonitoringFilter, setDistMonitoringFilter] = useState<'all' | 'unused' | 'active'>('all');
    const [distListSearch, setDistListSearch] = useState('');
    const [expandedConsolidatedKey, setExpandedConsolidatedKey] = useState<string | null>(null);

    // Report Filters (Updated for Range)
    const [reportFilter, setReportFilter] = useState<'all' | 'range'>('range');
    const [reportStart, setReportStart] = useState(new Date().toISOString().slice(0, 7));
    const [reportEnd, setReportEnd] = useState(new Date().toISOString().slice(0, 7));
    const [reportSearch, setReportSearch] = useState('');

    // Print Options Toggles
    const [printMaterialBreakdown, setPrintMaterialBreakdown] = useState(true);
    const [printTransactionLogs, setPrintTransactionLogs] = useState(true);
    const [printStaffCustody, setPrintStaffCustody] = useState(true);

    // Incoming Tab Filter
    const [incomingViewMonth, setIncomingViewMonth] = useState(new Date().toISOString().slice(0, 7));

    const isAdmin = userRole === 'admin' || userRole === 'supervisor';

    const normalizedUserEmail = useMemo(() => userEmail ? userEmail.toLowerCase().trim() : '', [userEmail]);
    const normalizedUserName = useMemo(() => userName ? userName.toLowerCase().trim() : '', [userName]);

    const isUserDistribution = useMemo(() => {
        return (d: MaterialDistribution) => {
            const dEmail = d.staffEmail ? d.staffEmail.toLowerCase().trim() : '';
            const dName = d.staffName ? d.staffName.toLowerCase().trim() : '';
            return (normalizedUserEmail && dEmail === normalizedUserEmail) || 
                   (!dEmail && normalizedUserName && dName === normalizedUserName) ||
                   (dName === normalizedUserName);
        };
    }, [normalizedUserEmail, normalizedUserName]);

    const isUserUsage = useMemo(() => {
        return (u: MaterialUsage) => {
            const uEmail = u.staffEmail ? u.staffEmail.toLowerCase().trim() : '';
            const uName = u.staffName ? u.staffName.toLowerCase().trim() : '';
            return (normalizedUserEmail && uEmail === normalizedUserEmail) || 
                   (!uEmail && normalizedUserName && uName === normalizedUserName) ||
                   (uName === normalizedUserName);
        };
    }, [normalizedUserEmail, normalizedUserName]);

    useEffect(() => {
        setLoading(true);
        if (!selectedDepartmentId) return;

        getDocs(collection(db, 'users')).then(snap => {
            const fetchedUsers = snap.docs.map(d => ({ ...d.data(), id: d.id } as User));
            setEmployees(fetchedUsers.filter(u => u.departmentId === selectedDepartmentId && !['admin', 'supervisor', 'manager'].includes(u.role)));
        }).catch(err => console.error("Failed to fetch employees:", err));

        const unsubMat = onSnapshot(query(collection(inventoryDb, 'materials'), where('departmentId', '==', selectedDepartmentId)), (snap: any) => {
            setMaterials(snap.docs.map((d: any) => ({ ...d.data(), id: d.id } as Material)));
        });
        const unsubInv = onSnapshot(query(collection(inventoryDb, 'invoices'), where('departmentId', '==', selectedDepartmentId)), (snap: any) => {
            const list = snap.docs.map((d: any) => ({ ...d.data(), id: d.id } as Invoice));
            setInvoices(list.sort((a: any, b: any) => {
                const da = a.date?.toDate ? a.date.toDate() : new Date(a.date?.seconds * 1000);
                const db = b.date?.toDate ? b.date.toDate() : new Date(b.date?.seconds * 1000);
                return db.getTime() - da.getTime();
            }));
        });
        const unsubUse = onSnapshot(query(collection(inventoryDb, 'usages'), where('departmentId', '==', selectedDepartmentId)), (snap: any) => {
            const list = snap.docs.map((d: any) => ({ ...d.data(), id: d.id } as MaterialUsage));
            setUsages(list.sort((a: any, b: any) => {
                const da = a.date?.toDate ? a.date.toDate() : new Date(a.date?.seconds * 1000);
                const db = b.date?.toDate ? b.date.toDate() : new Date(b.date?.seconds * 1000);
                return db.getTime() - da.getTime();
            }));
        });

        const unsubDist = onSnapshot(query(collection(inventoryDb, 'distributions'), where('departmentId', '==', selectedDepartmentId)), (snap: any) => {
            const list = snap.docs.map((d: any) => ({ ...d.data(), id: d.id } as MaterialDistribution));
            setDistributions(list.sort((a: any, b: any) => {
                const da = a.date?.toDate ? a.date.toDate() : new Date(a.date?.seconds * 1000);
                const db = b.date?.toDate ? b.date.toDate() : new Date(b.date?.seconds * 1000);
                return db.getTime() - da.getTime();
            }));
        });

        const unsubTransfers = onSnapshot(query(collection(inventoryDb, 'custody_transfers'), where('departmentId', '==', selectedDepartmentId)), (snap: any) => {
            const list = snap.docs.map((d: any) => ({ ...d.data(), id: d.id } as CustodyTransfer));
            setTransfers(list.sort((a: any, b: any) => {
                const da = a.date?.toDate ? a.date.toDate() : new Date(a.date?.seconds * 1000);
                const db = b.date?.toDate ? b.date.toDate() : new Date(b.date?.seconds * 1000);
                return db.getTime() - da.getTime();
            }));
        });

        setLoading(false);
        return () => { unsubMat(); unsubInv(); unsubUse(); unsubDist(); unsubTransfers(); };
    }, [selectedDepartmentId]);

    // ... (rest of the component implementation)
    const staffBalances = useMemo(() => {
        const getRecordKey = (email?: string, name?: string) => {
            if (email) return email.toLowerCase().trim();
            if (name) return name.toLowerCase().trim();
            return '';
        };
        const balances: Record<string, {name: string, materials: Record<string, number>}> = {}; 
        distributions.forEach(d => {
            const staffKey = getRecordKey(d.staffEmail, d.staffName);
            if (!staffKey) return;
            if (!balances[staffKey]) balances[staffKey] = { name: d.staffName, materials: {} };
            const matName = d.material.trim();
            balances[staffKey].materials[matName] = (balances[staffKey].materials[matName] || 0) + d.amount;
        });
        usages.forEach(u => {
            if (!u.fromCustody) return;
            const staffKey = getRecordKey(u.staffEmail, u.staffName);
            if (!staffKey) return;
            if (!balances[staffKey]) balances[staffKey] = { name: u.staffName, materials: {} };
            const matName = u.material.trim();
            balances[staffKey].materials[matName] = (balances[staffKey].materials[matName] || 0) - u.amount;
        });
        return balances;
    }, [distributions, usages]);

    const staffCustodyDetailed = useMemo(() => {
        const getRecordKey = (email?: string, name?: string) => {
            if (email) return email.toLowerCase().trim();
            if (name) return name.toLowerCase().trim();
            return '';
        };

        const records: Record<string, {
            staffName: string,
            staffEmail: string,
            materials: Record<string, {
                received: number,    // Sum of positive direct distributions and incoming transfers
                used: number,        // Sum of usages from custody
                balance: number      // Current remaining custody
            }>
        }> = {};

        // Initialize records with employees in the department
        employees.forEach(emp => {
            const key = getRecordKey(emp.email, emp.name);
            if (!key) return;
            records[key] = {
                staffName: emp.name,
                staffEmail: emp.email || '',
                materials: {}
            };
        });

        // Process distributions
        distributions.forEach(d => {
            const key = getRecordKey(d.staffEmail, d.staffName);
            if (!key) return;
            if (!records[key]) {
                records[key] = {
                    staffName: d.staffName,
                    staffEmail: d.staffEmail || '',
                    materials: {}
                };
            }
            const matName = d.material.trim();
            if (!records[key].materials[matName]) {
                records[key].materials[matName] = { received: 0, used: 0, balance: 0 };
            }
            records[key].materials[matName].balance += d.amount;
            if (d.amount > 0) {
                records[key].materials[matName].received += d.amount;
            }
        });

        // Process usages
        usages.forEach(u => {
            if (!u.fromCustody) return;
            const key = getRecordKey(u.staffEmail, u.staffName);
            if (!key) return;
            if (!records[key]) {
                records[key] = {
                    staffName: u.staffName,
                    staffEmail: u.staffEmail || '',
                    materials: {}
                };
            }
            const matName = u.material.trim();
            if (!records[key].materials[matName]) {
                records[key].materials[matName] = { received: 0, used: 0, balance: 0 };
            }
            records[key].materials[matName].used += u.amount;
            records[key].materials[matName].balance -= u.amount;
        });

        return records;
    }, [distributions, usages, employees]);

    const consolidatedTransfers = useMemo(() => {
        const groups: Record<string, {
            key: string,
            senderName: string,
            senderEmail: string,
            recipientName: string,
            recipientEmail: string,
            material: string,
            totalAmount: number,
            status: 'pending' | 'confirmed' | 'rejected',
            dates: Date[],
            items: CustodyTransfer[]
        }> = {};

        transfers.forEach(tr => {
            const key = `${tr.senderName}_${tr.recipientName}_${tr.material}_${tr.status}`;
            const d = tr.date?.toDate ? tr.date.toDate() : new Date(tr.date?.seconds * 1000 || Date.now());
            if (!groups[key]) {
                groups[key] = {
                    key,
                    senderName: tr.senderName,
                    senderEmail: tr.senderEmail,
                    recipientName: tr.recipientName,
                    recipientEmail: tr.recipientEmail,
                    material: tr.material,
                    totalAmount: 0,
                    status: tr.status,
                    dates: [],
                    items: []
                };
            }
            groups[key].totalAmount += tr.amount;
            groups[key].dates.push(d);
            groups[key].items.push(tr);
        });

        // Sort items inside each group by date descending
        Object.values(groups).forEach(g => {
            g.items.sort((a, b) => {
                const da = a.date?.toDate ? a.date.toDate() : new Date(a.date?.seconds * 1000 || Date.now());
                const db = b.date?.toDate ? b.date.toDate() : new Date(b.date?.seconds * 1000 || Date.now());
                return db.getTime() - da.getTime();
            });
        });

        return Object.values(groups).sort((a, b) => {
            const maxA = Math.max(...a.dates.map(d => d.getTime()));
            const maxB = Math.max(...b.dates.map(d => d.getTime()));
            return maxB - maxA;
        });
    }, [transfers]);

    const frequentMaterials = useMemo(() => {
        const counts: Record<string, number> = {};
        usages.forEach(u => {
            counts[u.material] = (counts[u.material] || 0) + 1;
        });
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(entry => entry[0]);
    }, [usages]);

    const stats = useMemo(() => {
        const lowStock = materials.filter(m => m.quantity <= 10 && m.quantity >= 0).length;
        // Check for NEGATIVE stock (Over-usage)
        const negativeStock = materials.filter(m => m.quantity < 0).length;
        
        const totalItems = materials.reduce((acc, curr) => acc + curr.quantity, 0);
        const totalUsages = usages.length;
        const recentIncomings = invoices.length;
        
        const today = new Date();
        const nextMonth = new Date();
        nextMonth.setMonth(today.getMonth() + 1);
        
        const expiringSoon = invoices.filter(inv => {
            if (!inv.expiryDate) return false;
            const exp = new Date(inv.expiryDate);
            return exp >= today && exp <= nextMonth;
        }).length;

        return { lowStock, negativeStock, totalItems, totalUsages, recentIncomings, expiringSoon };
    }, [materials, usages, invoices]);

    // --- AI FORECASTING LOGIC ---
    const generateForecast = async () => {
        setIsForecasting(true);
        try {
            const apiKey = (process.env.API_KEY || '').trim();
            if (!apiKey) throw new Error("API Key missing");
            const ai = new GoogleGenAI({ apiKey });

            // Prepare Data: Current Stock + Usage History (last 30 days)
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            const recentUsages = usages.filter(u => {
                const d = u.date.toDate ? u.date.toDate() : new Date(u.date.seconds * 1000);
                return d >= thirtyDaysAgo;
            });

            // Format for AI
            const usageData = recentUsages.map(u => ({
                material: u.material,
                date: u.date.toDate ? u.date.toDate().toISOString().split('T')[0] : '',
                amount: u.amount
            }));

            const stockData = materials.map(m => ({
                name: m.name,
                current: m.quantity
            }));

            const prompt = `
                Analyze usage and stock to predict run-out dates.
                
                Current Stock:
                ${JSON.stringify(stockData)}
                
                Usage History (Last 30 Days):
                ${JSON.stringify(usageData)}
                
                For EACH material, calculate:
                1. Average daily usage (based on history).
                2. Days until stock hits zero.
                3. Predicted Date (YYYY-MM-DD).
                
                Return JSON ONLY:
                [
                  {
                    "materialName": "string",
                    "currentStock": number,
                    "avgDailyUsage": number,
                    "daysLeft": number,
                    "predictedDate": "YYYY-MM-DD",
                    "status": "critical" | "low" | "good" // critical if < 7 days, low if < 14 days
                  }
                ]
            `;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: { responseMimeType: 'application/json' }
            });

            const resultText = response.text || "[]";
            const predictions = JSON.parse(resultText) as ForecastResult[];
            setForecasts(predictions);
            setToast({ msg: 'Forecast Generated!', type: 'success' });

        } catch (e: any) {
            console.error(e);
            setToast({ msg: 'Forecasting failed: ' + e.message, type: 'error' });
        } finally {
            setIsForecasting(false);
        }
    };

    const handleUsageSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!isAdmin) {
            setToast({ msg: 'غير مصرح لك بالصرف من المخزن الرئيسي', type: 'error' });
            return;
        }

        if (!selectedMaterial || !usageAmount || !patientFileNumber) {
            setToast({ msg: 'Missing Data', type: 'error' });
            return;
        }

        const mat = materials.find(m => m.name === selectedMaterial);
        if (!mat) return;

        const amount = parseFloat(usageAmount);
        
        // STRICT CHECK: Prevent Over Usage
        if (mat.quantity < amount) {
            setToast({ msg: `❌ خطأ: الرصيد غير كافٍ! المتاح: ${mat.quantity}`, type: 'error' });
            return;
        }

        try {
            const [y, mVal, dVal] = usageDate.split('-').map(Number);
            const dateObj = new Date(y, mVal - 1, dVal);
            const now = new Date();
            const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
            if (usageDate === todayStr) {
                dateObj.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
            } else {
                dateObj.setHours(12, 0, 0);
            }
            const tsDate = isNaN(dateObj.getTime()) ? Timestamp.now() : Timestamp.fromDate(dateObj);

            await updateDoc(doc(inventoryDb, 'materials', mat.id), { quantity: mat.quantity - amount });
            await addDoc(collection(inventoryDb, 'usages'), {
                material: selectedMaterial,
                amount: amount,
                patientFileNumber,
                staffName: usageStaffName || userName,
                staffEmail: userEmail,
                staffRole: userRole,
                date: tsDate,
                isCorrection: false, // Explicitly mark as NOT a correction
                departmentId: selectedDepartmentId
            });

            setToast({ msg: t('save'), type: 'success' });
            setUsageAmount('');
            setPatientFileNumber('');
            setUsageDate(new Date().toISOString().split('T')[0]);
            setUsageStaffName(userName);
        } catch (err) {
            setToast({ msg: 'Error', type: 'error' });
        }
    };

    const handleDeleteOldInvoices = async () => {
        if (!window.confirm('Are you sure you want to delete invoices older than one year? This will also delete the associated images.')) return;
        
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        
        const qOld = query(collection(inventoryDb, 'invoices'), where('date', '<', Timestamp.fromDate(oneYearAgo)));
        const snap = await getDocs(qOld);
        
        const batch = writeBatch(inventoryDb);
        
        for (const d of snap.docs) {
            const data = d.data() as Invoice;
            if (data.imageUrl) {
                try {
                    // Extract path from URL if needed or just use the URL directly if storage supports it
                    // Assuming imageUrl is a direct download URL, we need to get the reference
                    const imageRef = ref(inventoryStorage, data.imageUrl);
                    await deleteObject(imageRef);
                } catch (e) {
                    console.error("Error deleting image:", e);
                }
            }
            batch.delete(d.ref);
        }
        
        await batch.commit();
        
        setToast({ msg: 'Old invoices and images deleted', type: 'success' });
    };

    const handleDistributionSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!distMaterial || !distAmount || !distStaffName) {
            setToast({ msg: 'Missing Data', type: 'error' });
            return;
        }

        const mat = materials.find(m => m.name === distMaterial);
        if (!mat) return;

        const amount = parseFloat(distAmount);
        
        if (mat.quantity < amount) {
            setToast({ msg: `❌ خطأ: الرصيد غير كافٍ! المتاح: ${mat.quantity}`, type: 'error' });
            return;
        }

        try {
            await updateDoc(doc(inventoryDb, 'materials', mat.id), { quantity: mat.quantity - amount });
            
            const [y, mVal, dVal] = distDate.split('-').map(Number);
            const dateObj = new Date(y, mVal - 1, dVal);
            const now = new Date();
            const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
            if (distDate === todayStr) {
                dateObj.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
            } else {
                dateObj.setHours(12, 0, 0);
            }
            const tsDate = isNaN(dateObj.getTime()) ? Timestamp.now() : Timestamp.fromDate(dateObj);

            await addDoc(collection(inventoryDb, 'distributions'), {
                material: distMaterial,
                amount: amount,
                staffName: distStaffName,
                staffEmail: distStaffEmail || '',
                distributedBy: userName,
                date: tsDate,
                departmentId: selectedDepartmentId
            });

            setToast({ msg: t('save'), type: 'success' });
            setDistMaterial('');
            setDistAmount('');
            setDistStaffName('');
            setDistStaffEmail('');
            setDistDate(new Date().toISOString().split('T')[0]);
        } catch (err) {
            setToast({ msg: 'Error', type: 'error' });
        }
    };

    const handleCustodyUsageSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!custodyMaterial || !custodyAmount || !custodyPatientFile) {
            setToast({ msg: 'Missing Data', type: 'error' });
            return;
        }

        const amount = parseFloat(custodyAmount);

        const distributed = distributions.filter(d => d.material.trim() === custodyMaterial.trim() && isUserDistribution(d)).reduce((sum, d) => sum + d.amount, 0);
        const used = usages.filter(u => u.material.trim() === custodyMaterial.trim() && u.fromCustody && isUserUsage(u)).reduce((sum, u) => sum + u.amount, 0);
        const balance = distributed - used;

        if (amount > balance) {
            setToast({ msg: `❌ خطأ: رصيد عهدتك غير كافٍ! المتاح: ${balance}`, type: 'error' });
            return;
        }

        try {
            const [y, mVal, dVal] = custodyUsageDate.split('-').map(Number);
            const dateObj = new Date(y, mVal - 1, dVal);
            const now = new Date();
            const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
            if (custodyUsageDate === todayStr) {
                dateObj.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
            } else {
                dateObj.setHours(12, 0, 0);
            }
            const tsDate = isNaN(dateObj.getTime()) ? Timestamp.now() : Timestamp.fromDate(dateObj);
            
            // NOTE: We do NOT update the main materials collection here!
            // It was already deducted when distributed to the staff member.

            await addDoc(collection(inventoryDb, 'usages'), {
                material: custodyMaterial,
                amount: amount,
                patientFileNumber: custodyPatientFile,
                staffName: userName,
                staffEmail: userEmail,
                staffRole: userRole,
                date: tsDate,
                isCorrection: false,
                fromCustody: true, // Mark this as a usage from personal custody
                departmentId: selectedDepartmentId
            });

            setToast({ msg: t('save'), type: 'success' });
            setCustodyMaterial('');
            setCustodyAmount('');
            setCustodyPatientFile('');
            setCustodyUsageDate(new Date().toISOString().split('T')[0]);
        } catch (err) {
            setToast({ msg: 'Error', type: 'error' });
        }
    };

    const handleCustodyTransferSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!transferMaterial || !transferAmount || !transferRecipient) {
            setToast({ msg: 'Missing Data', type: 'error' });
            return;
        }
        const amount = parseFloat(transferAmount);
        if (amount <= 0 || isNaN(amount)) {
            setToast({ msg: 'الكمية يجب أن تكون أكبر من صفر', type: 'error' });
            return;
        }

        const recipientUser = employees.find(emp => emp.id === transferRecipient);
        if (!recipientUser) {
            setToast({ msg: 'الموظف المستلم غير موجود', type: 'error' });
            return;
        }

        // Check sender's balance for this material
        const distributed = distributions.filter(d => d.material.trim() === transferMaterial.trim() && isUserDistribution(d)).reduce((sum, d) => sum + d.amount, 0);
        const used = usages.filter(u => u.material.trim() === transferMaterial.trim() && u.fromCustody && isUserUsage(u)).reduce((sum, u) => sum + u.amount, 0);
        const balance = distributed - used;

        if (amount > balance) {
            setToast({ msg: `❌ خطأ: رصيد عهدتك غير كافٍ لنقله! المتاح: ${balance}`, type: 'error' });
            return;
        }

        try {
            // Create a single pending custody transfer record
            await addDoc(collection(inventoryDb, 'custody_transfers'), {
                material: transferMaterial,
                amount: amount,
                senderName: userName,
                senderEmail: userEmail || '',
                recipientName: recipientUser.name,
                recipientEmail: recipientUser.email || '',
                recipientId: recipientUser.id,
                date: Timestamp.now(),
                status: 'pending',
                departmentId: selectedDepartmentId
            });

            setToast({ msg: 'تم إرسال طلب نقل العهدة بنجاح ✅ بانتظار تأكيد الاستلام والعد من الزميل المستلم', type: 'success' });
            setTransferMaterial('');
            setTransferAmount('');
            setTransferRecipient('');
        } catch (err) {
            console.error(err);
            setToast({ msg: 'Error transferring custody', type: 'error' });
        }
    };

    const handleConfirmTransfer = async (transfer: CustodyTransfer) => {
        // Double check sender's current balance before processing!
        const normalizedSenderEmail = transfer.senderEmail ? transfer.senderEmail.toLowerCase().trim() : '';
        const normalizedSenderName = transfer.senderName ? transfer.senderName.toLowerCase().trim() : '';
        const senderMat = transfer.material.trim();

        const senderDistributed = distributions.filter(d => 
            d.material.trim() === senderMat && 
            (
                (d.staffEmail && d.staffEmail.toLowerCase().trim() === normalizedSenderEmail) || 
                (d.staffName && d.staffName.toLowerCase().trim() === normalizedSenderName)
            )
        ).reduce((sum, d) => sum + d.amount, 0);

        const senderUsed = usages.filter(u => 
            u.material.trim() === senderMat && 
            u.fromCustody && 
            (
                (u.staffEmail && u.staffEmail.toLowerCase().trim() === normalizedSenderEmail) || 
                (u.staffName && u.staffName.toLowerCase().trim() === normalizedSenderName)
            )
        ).reduce((sum, u) => sum + u.amount, 0);

        const senderBalance = senderDistributed - senderUsed;

        if (transfer.amount > senderBalance) {
            setToast({ msg: `❌ خطأ: رصيد عهدة المرسل غير كافٍ الآن لنقلها! المتاح لديه: ${senderBalance}`, type: 'error' });
            return;
        }

        try {
            // 1. Update the transfer status in custody_transfers to confirmed
            await updateDoc(doc(inventoryDb, 'custody_transfers', transfer.id), {
                status: 'confirmed'
            });

            // 2. Add negative distribution entry for sender
            await addDoc(collection(inventoryDb, 'distributions'), {
                material: transfer.material,
                amount: -transfer.amount,
                staffName: transfer.senderName,
                staffEmail: transfer.senderEmail,
                distributedBy: transfer.senderName,
                date: Timestamp.now(),
                departmentId: transfer.departmentId,
                isTransfer: true,
                transferPartner: transfer.recipientName,
                transferDirection: 'out'
            });

            // 3. Add positive distribution entry for recipient
            await addDoc(collection(inventoryDb, 'distributions'), {
                material: transfer.material,
                amount: transfer.amount,
                staffName: transfer.recipientName,
                staffEmail: transfer.recipientEmail,
                distributedBy: transfer.senderName,
                date: Timestamp.now(),
                departmentId: transfer.departmentId,
                isTransfer: true,
                transferPartner: transfer.senderName,
                transferDirection: 'in'
            });

            setToast({ msg: t('inv.custody.successConfirm'), type: 'success' });
        } catch (err) {
            console.error(err);
            setToast({ msg: 'Error confirming custody transfer', type: 'error' });
        }
    };

    const handleRejectTransfer = async (transfer: CustodyTransfer) => {
        try {
            await updateDoc(doc(inventoryDb, 'custody_transfers', transfer.id), {
                status: 'rejected'
            });
            setToast({ msg: t('inv.custody.rejected'), type: 'info' });
        } catch (err) {
            console.error(err);
            setToast({ msg: 'Error rejecting custody transfer', type: 'error' });
        }
    };

    const handleIncomingSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!incMaterial || !incQuantity) {
            setToast({ msg: 'Missing Data', type: 'error' });
            return;
        }

        setUploading(true);
        try {
            const mat = materials.find(m => m.name === incMaterial);
            if (!mat) throw new Error('Material not found');

            let imageUrl = null;
            if (incImage) {
                const options = {
                    maxSizeMB: 0.5,
                    maxWidthOrHeight: 1024,
                    useWebWorker: true
                };
                const compressedFile = await imageCompression(incImage, options);
                
                const storageRef = ref(inventoryStorage, `invoices/${Date.now()}_${compressedFile.name}`);
                await uploadBytes(storageRef, compressedFile);
                imageUrl = await getDownloadURL(storageRef);
            }

            const qty = parseFloat(incQuantity);
            await updateDoc(doc(inventoryDb, 'materials', mat.id), { quantity: mat.quantity + qty });
            await addDoc(collection(inventoryDb, 'invoices'), {
                material: incMaterial,
                quantityAdded: qty,
                date: Timestamp.now(),
                expiryDate: incExpiry || null,
                imageUrl: imageUrl,
                createdBy: userName,
                isCorrection: false, // Explicitly mark as NOT a correction
                departmentId: selectedDepartmentId
            });

            setToast({ msg: t('save'), type: 'success' });
            setIncQuantity('');
            setIncExpiry('');
            setIncImage(null);
        } catch (err: any) {
            setToast({ msg: 'Error: ' + err.message, type: 'error' });
        } finally {
            setUploading(false);
        }
    };

    const handleMaterialSave = async () => {
        if (!newMatName || !newMatQty) return;
        try {
            const qty = parseFloat(newMatQty);
            let correctionTs = Timestamp.now();
            if (correctionDate) {
                const [y, mVal, dVal] = correctionDate.split('-').map(Number);
                const dateObj = new Date(y, mVal - 1, dVal);
                const now = new Date();
                const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
                if (correctionDate === todayStr) {
                    dateObj.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
                } else {
                    dateObj.setHours(12, 0, 0);
                }
                correctionTs = isNaN(dateObj.getTime()) ? Timestamp.now() : Timestamp.fromDate(dateObj);
            }

            if (editingMat) {
                // CORRECTION MODE
                const oldQty = editingMat.quantity;
                const diff = qty - oldQty;

                if (diff !== 0) {
                    // Update Material Snapshot
                    await updateDoc(doc(inventoryDb, 'materials', editingMat.id), { 
                        name: newMatName, 
                        quantity: qty 
                    });

                    // CREATE HISTORY RECORD WITH 'isCorrection' FLAG
                    // Note: We create this for database consistency, but we will FILTER it out in the UI
                    if (diff > 0) {
                        await addDoc(collection(inventoryDb, 'invoices'), {
                            material: newMatName,
                            quantityAdded: diff,
                            date: correctionTs, 
                            expiryDate: null,
                            imageUrl: null,
                            createdBy: userName + " (Correction)",
                            isCorrection: true, // FLAG: Hidden from "Added" column
                            departmentId: selectedDepartmentId
                        });
                    } else {
                        await addDoc(collection(inventoryDb, 'usages'), {
                            material: newMatName,
                            amount: Math.abs(diff),
                            patientFileNumber: "STOCK CORRECTION",
                            staffName: userName,
                            staffEmail: userEmail,
                            staffRole: userRole,
                            date: correctionTs,
                            isCorrection: true, // FLAG: Hidden from "Used" column
                            departmentId: selectedDepartmentId
                        });
                    }
                    setToast({ msg: `Stock Corrected (Hidden Record Created)`, type: 'success' });
                } else {
                     // Just Name Change
                     await updateDoc(doc(inventoryDb, 'materials', editingMat.id), { name: newMatName });
                     setToast({ msg: 'Name Updated', type: 'success' });
                }
            } else {
                // NEW MATERIAL
                await addDoc(collection(inventoryDb, 'materials'), { 
                    name: newMatName, 
                    quantity: qty,
                    departmentId: selectedDepartmentId
                });
                setToast({ msg: t('save'), type: 'success' });
            }
            setNewMatName(''); setNewMatQty(''); setEditingMat(null); setCorrectionDate(new Date().toISOString().split('T')[0]);
        } catch (err) {
            console.error(err);
            setToast({ msg: 'Error', type: 'error' });
        }
    };

    // --- NEW: Purge Correction History Function ---
    const handlePurgeCorrections = async () => {
        if(!confirm("⚠️ تحذير: سيتم حذف جميع سجلات 'تعديل المخزون' القديمة.\nالرصيد الحالي لن يتأثر، ولكن سجل التعديلات سيتم مسحه.\nهل أنت متأكد؟")) return;
        
        setLoading(true);
        try {
            const batch = writeBatch(inventoryDb);
            let count = 0;

            // 1. Find Correction Usages
            const qUsages = query(collection(inventoryDb, 'usages'), where('patientFileNumber', '==', 'STOCK CORRECTION'));
            const uSnap = await getDocs(qUsages);
            uSnap.docs.forEach(d => {
                batch.delete(d.ref);
                count++;
            });

            // 2. Find Correction Invoices (using the flag isCorrection)
            const qInvoices = query(collection(inventoryDb, 'invoices'), where('isCorrection', '==', true));
            const iSnap = await getDocs(qInvoices);
            iSnap.docs.forEach(d => {
                batch.delete(d.ref);
                count++;
            });

            if (count > 0) {
                await batch.commit();
                setToast({ msg: `تم تنظيف ${count} سجل تصحيح قديم بنجاح ✅`, type: 'success' });
            } else {
                setToast({ msg: 'لا توجد سجلات تصحيح لحذفها', type: 'info' });
            }

        } catch (e: any) {
            console.error(e);
            setToast({ msg: 'خطأ في عملية التنظيف: ' + e.message, type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    // --- NEW: Fix Missing Department IDs ---
    const handleFixMissingDepartmentIds = async () => {
        if(!confirm("سيتم تعيين جميع السجلات غير المرتبطة بقسم إلى القسم الحالي. هل أنت متأكد؟")) return;
        setLoading(true);
        try {
            let count = 0;

            // Fix Usages
            const usagesSnap = await getDocs(collection(inventoryDb, 'usages'));
            for (const docSnap of usagesSnap.docs) {
                if (!docSnap.data().departmentId) {
                    await updateDoc(doc(inventoryDb, 'usages', docSnap.id), { departmentId: selectedDepartmentId });
                    count++;
                }
            }

            // Fix Invoices
            const invoicesSnap = await getDocs(collection(inventoryDb, 'invoices'));
            for (const docSnap of invoicesSnap.docs) {
                if (!docSnap.data().departmentId) {
                    await updateDoc(doc(inventoryDb, 'invoices', docSnap.id), { departmentId: selectedDepartmentId });
                    count++;
                }
            }

            // Fix Materials
            const materialsSnap = await getDocs(collection(inventoryDb, 'materials'));
            for (const docSnap of materialsSnap.docs) {
                if (!docSnap.data().departmentId) {
                    await updateDoc(doc(inventoryDb, 'materials', docSnap.id), { departmentId: selectedDepartmentId });
                    count++;
                }
            }

            if (count > 0) {
                setToast({ msg: `تم استرجاع ${count} سجل بنجاح! ✅`, type: 'success' });
            } else {
                setToast({ msg: 'لا توجد سجلات مفقودة', type: 'info' });
            }
        } catch (e) {
            console.error(e);
            setToast({ msg: 'حدث خطأ أثناء الاسترجاع', type: 'error' });
        }
        setLoading(false);
    };

    const handleDeleteUsage = async (usage: MaterialUsage) => {
        if(!confirm(t('confirm') + (usage.fromCustody ? ' (حذف الاستهلاك من عهدة الموظف)؟' : ' (سيتم استرجاع الكمية للمخزن)؟'))) return;
        try {
            // 1. Restore Stock (only if it wasn't from personal custody)
            if (!usage.fromCustody) {
                const mat = materials.find(m => m.name === usage.material);
                if (mat) {
                    await updateDoc(doc(inventoryDb, 'materials', mat.id), {
                        quantity: mat.quantity + usage.amount
                    });
                }
            }
            
            // 2. Delete Record
            await deleteDoc(doc(inventoryDb, 'usages', usage.id));
            setToast({ msg: 'Deleted', type: 'success' });
        } catch (e) {
            setToast({ msg: 'Error', type: 'error' });
        }
    };

    const handleDeleteDistribution = async (dist: MaterialDistribution) => {
        if(!confirm(t('confirm') + ' (سيتم استرجاع الكمية للمخزن)؟')) return;
        try {
            const mat = materials.find(m => m.name === dist.material);
            if (mat) {
                await updateDoc(doc(inventoryDb, 'materials', mat.id), {
                    quantity: mat.quantity + dist.amount
                });
            }
            await deleteDoc(doc(inventoryDb, 'distributions', dist.id));
            setToast({ msg: 'Deleted', type: 'success' });
        } catch (e) {
            setToast({ msg: 'Error', type: 'error' });
        }
    };

    const handleDeleteInvoice = async (id: string) => {
        if(!confirm(t('confirm') + '?')) return;
        try {
            await deleteDoc(doc(inventoryDb, 'invoices', id));
            setToast({ msg: t('delete'), type: 'success' });
        } catch (e) {
            setToast({ msg: 'Error', type: 'error' });
        }
    };

    // --- AGGREGATION LOGIC FOR REPORTS (REVERSE CALCULATION) ---
    // Instead of summing up from zero (which drifts), we start from the CURRENT STOCK (Truth)
    // and work backwards. This ensures "Net Balance" always matches the Materials Tab.

    // 1. Filter Raw Data based on Report Settings (For Details View)
    const filteredUsages = useMemo(() => {
        const list = usages.filter(u => {
            let passDate = false;
            if (reportFilter === 'all') passDate = true;
            else if (u.date) {
                const d = u.date.toDate ? u.date.toDate() : new Date(u.date.seconds * 1000);
                const iso = d.toISOString().slice(0, 7);
                passDate = iso >= reportStart && iso <= reportEnd;
            }
            const searchLower = reportSearch.toLowerCase();
            const passSearch = !reportSearch || 
                (u.patientFileNumber && u.patientFileNumber.toLowerCase().includes(searchLower)) ||
                (u.staffName && u.staffName.toLowerCase().includes(searchLower));
            
            return passDate && passSearch;
        });

        // Explicitly sort descending by date and time
        return list.sort((a, b) => {
            const da = a.date?.toDate ? a.date.toDate().getTime() : (a.date?.seconds || 0) * 1000;
            const db = b.date?.toDate ? b.date.toDate().getTime() : (b.date?.seconds || 0) * 1000;
            return db - da;
        });
    }, [usages, reportFilter, reportStart, reportEnd, reportSearch]);

    const filteredInvoices = useMemo(() => {
        return invoices.filter(inv => {
            if (reportFilter === 'all') return true;
            if (!inv.date) return false;
            const d = inv.date.toDate ? inv.date.toDate() : new Date(inv.date.seconds * 1000);
            const iso = d.toISOString().slice(0, 7);
            return iso >= reportStart && iso <= reportEnd;
        });
    }, [invoices, reportFilter, reportStart, reportEnd]);

    // 2. Incoming Tab Display Data (Separate filter for the Incoming Tab view)
    const displayedInvoices = useMemo(() => {
        return invoices.filter(inv => {
            if (!inv.date) return false;
            const d = inv.date.toDate ? inv.date.toDate() : new Date(inv.date.seconds * 1000);
            const iso = d.toISOString().slice(0, 7);
            return iso === incomingViewMonth;
        });
    }, [invoices, incomingViewMonth]);

    // 3. Detailed Material Breakdown (REVERSE CALCULATION)
    const materialStats = useMemo(() => {
        interface MatStat {
            startBalance: number;
            periodIn: number;
            periodOut: number;
            endBalance: number;
            staffUsage: Record<string, number>;
        }
        const stats: Record<string, MatStat> = {};

        // Loop through all physical materials (The Source of Truth)
        materials.forEach(mat => {
            stats[mat.name] = { startBalance: 0, periodIn: 0, periodOut: 0, endBalance: mat.quantity, staffUsage: {} };
            
            // 1. Calculate Future Transactions (After Report End Date)
            // If we are looking at past months, we need to add/subtract future transactions to get the historic balance.
            let futureNetChange = 0;
            const rangeLimit = reportFilter === 'range' ? reportEnd : '9999-99';

            // 2. Calculate Period Transactions (Within Report Range)
            // Here we EXCLUDE corrections because the user doesn't want to see them as "Added/Used"
            
            // Process Invoices
            invoices.forEach(inv => {
                if (inv.material !== mat.name || !inv.date) return;
                const d = inv.date.toDate ? inv.date.toDate() : new Date(inv.date.seconds * 1000);
                const isoMonth = d.toISOString().slice(0, 7);
                const isCorrection = (inv as any).isCorrection === true || (inv.createdBy && inv.createdBy.includes('(Correction)'));

                if (isoMonth > rangeLimit) {
                    // Future transaction: Backtrack from current stock
                    // Invoice added stock, so to go back, we subtract it
                    futureNetChange += inv.quantityAdded;
                } else if (reportFilter === 'all' || isoMonth >= reportStart) {
                    // In Period
                    if (!isCorrection) {
                        stats[mat.name].periodIn += inv.quantityAdded;
                    } 
                    
                }
            });

            // Process Usages
            usages.forEach(u => {
                if (u.material !== mat.name || !u.date) return;
                const d = u.date.toDate ? u.date.toDate() : new Date(u.date.seconds * 1000);
                const isoMonth = d.toISOString().slice(0, 7);
                const isCorrection = (u as any).isCorrection === true || u.patientFileNumber === 'STOCK CORRECTION';

                if (isoMonth > rangeLimit) {
                    // Future usage: Removed stock, so to go back, we add it
                    futureNetChange -= u.amount;
                } else if (reportFilter === 'all' || isoMonth >= reportStart) {
                    // In Period
                    if (!isCorrection) {
                        stats[mat.name].periodOut += u.amount;
                        const staff = u.staffName || 'Unknown';
                        if (!stats[mat.name].staffUsage[staff]) stats[mat.name].staffUsage[staff] = 0;
                        stats[mat.name].staffUsage[staff] += u.amount;
                    }
                }
            });

            // 3. Calculate Closing Balance at End of Selected Period
            // RE-RUN for strict mathematical accuracy (Reverse Calculation)
            let balanceAtEndOfPeriod = mat.quantity;
            
            // Revert Future Transactions
            invoices.forEach(inv => {
                 if (inv.material !== mat.name || !inv.date) return;
                 const d = inv.date.toDate ? inv.date.toDate() : new Date(inv.date.seconds * 1000);
                 const isoMonth = d.toISOString().slice(0, 7);
                 if (isoMonth > rangeLimit) {
                     balanceAtEndOfPeriod -= inv.quantityAdded;
                 }
            });
            usages.forEach(u => {
                 if (u.material !== mat.name || !u.date) return;
                 const d = u.date.toDate ? u.date.toDate() : new Date(u.date.seconds * 1000);
                 const isoMonth = d.toISOString().slice(0, 7);
                 if (isoMonth > rangeLimit) {
                     balanceAtEndOfPeriod += u.amount;
                 }
            });

            stats[mat.name].endBalance = balanceAtEndOfPeriod;

            // 4. Calculate Opening Balance
            stats[mat.name].startBalance = stats[mat.name].endBalance - stats[mat.name].periodIn + stats[mat.name].periodOut;
        });

        return Object.entries(stats).sort((a,b) => a[0].localeCompare(b[0]));
    }, [filteredInvoices, filteredUsages, invoices, usages, reportFilter, reportStart, reportEnd, materials]);


    const filteredMaterials = materials.filter(m => 
        m.name.toLowerCase().includes(materialSearch.toLowerCase())
    );

    if (loading) return <Loading />;

    return (
        <div className="flex h-full min-h-screen bg-slate-50 print:bg-white" dir={dir}>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            {/* --- Internal Sidebar --- */}
            <div className="w-64 bg-white border-l border-slate-200 flex flex-col hidden lg:flex print:hidden">
                <div className="p-6">
                    <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                        <i className="fas fa-boxes text-emerald-500"></i> {t('nav.inventory')}
                    </h2>
                </div>
                
                <nav className="flex-1 px-4 space-y-2">
                    {userRole !== 'custody_clerk' && (
                        <>
                            <button onClick={() => setActiveTab('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'dashboard' ? 'bg-slate-800 text-white shadow-lg shadow-slate-300' : 'text-slate-500 hover:bg-slate-50'}`}>
                                <i className="fas fa-th-large w-5"></i>
                                <span className="font-bold text-sm">{t('inv.dashboard')}</span>
                            </button>
                            <button onClick={() => setActiveTab('custody')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'custody' ? 'bg-teal-600 text-white shadow-lg shadow-teal-300' : 'text-slate-500 hover:bg-slate-50'}`}>
                                <i className="fas fa-box-open w-5"></i>
                                <span className="font-bold text-sm">{t('inv.custody')}</span>
                            </button>
                        </>
                    )}
                    
                    {userRole === 'custody_clerk' && (
                        <button onClick={() => setActiveTab('distribution')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'distribution' ? 'bg-orange-600 text-white shadow-lg shadow-orange-300' : 'text-slate-500 hover:bg-slate-50'}`}>
                            <i className="fas fa-share-square w-5"></i>
                            <span className="font-bold text-sm">{t('inv.distribution')}</span>
                        </button>
                    )}

                    {isAdmin && (
                        <>
                            <button onClick={() => setActiveTab('usage')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'usage' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-300' : 'text-slate-500 hover:bg-slate-50'}`}>
                                <i className="fas fa-hand-holding-medical w-5"></i>
                                <span className="font-bold text-sm">{t('inv.usage')}</span>
                            </button>
                            <button onClick={() => setActiveTab('distribution')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'distribution' ? 'bg-orange-600 text-white shadow-lg shadow-orange-300' : 'text-slate-500 hover:bg-slate-50'}`}>
                                <i className="fas fa-share-square w-5"></i>
                                <span className="font-bold text-sm">{t('inv.distribution')}</span>
                            </button>
                            <button onClick={() => setActiveTab('reports')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'reports' ? 'bg-purple-600 text-white shadow-lg shadow-purple-300' : 'text-slate-500 hover:bg-slate-50'}`}>
                                <i className="fas fa-chart-bar w-5"></i>
                                <span className="font-bold text-sm">{t('inv.reports')}</span>
                            </button>
                            <button onClick={() => setActiveTab('incoming')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'incoming' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-300' : 'text-slate-500 hover:bg-slate-50'}`}>
                                <i className="fas fa-truck-loading w-5"></i>
                                <span className="font-bold text-sm">{t('inv.incoming')}</span>
                            </button>
                            <button onClick={() => setActiveTab('materials')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'materials' ? 'bg-blue-600 text-white shadow-lg shadow-blue-300' : 'text-slate-500 hover:bg-slate-50'}`}>
                                <i className="fas fa-cubes w-5"></i>
                                <span className="font-bold text-sm">{t('inv.materials')}</span>
                            </button>
                        </>
                    )}
                </nav>

                <div className="p-4 bg-slate-50 m-4 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-2">
                        <span className="text-2xl font-black text-emerald-500">{materials.length}</span>
                        <span className="text-xs text-slate-400">{t('inv.mat.unit')}</span>
                    </div>
                </div>
            </div>

            {/* --- Main Content Area --- */}
            <div className="flex-1 p-6 md:p-10 overflow-y-auto print:p-0">
                
                {/* Mobile Navigation */}
                <div className="lg:hidden flex overflow-x-auto gap-2 mb-6 pb-2 no-scrollbar print:hidden">
                    {(isAdmin ? ['dashboard', 'usage', 'custody', 'distribution', 'reports', 'incoming', 'materials'] : userRole === 'custody_clerk' ? ['distribution'] : ['dashboard', 'custody']).map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab as any)} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap ${activeTab === tab ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
                            {t(`inv.${tab}`)}
                        </button>
                    ))}
                </div>

                {/* --- DASHBOARD TAB --- */}
                {activeTab === 'dashboard' && (
                    <div className="space-y-8 animate-fade-in-up">
                        <header className="mb-8 flex justify-between items-center">
                            <h1 className="text-3xl font-black text-slate-800">{t('inv.dashboard')}</h1>
                            
                            {/* AI Forecasting Button */}
                            <button 
                                onClick={generateForecast} 
                                disabled={isForecasting}
                                className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-lg flex items-center gap-2 hover:scale-105 transition-transform"
                            >
                                {isForecasting ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-crystal-ball"></i>}
                                AI Forecast
                            </button>
                        </header>

                        {/* NEGATIVE STOCK ALERT */}
                        {stats.negativeStock > 0 && (
                            <div className="bg-red-100 border-l-4 border-red-500 text-red-800 p-4 rounded-xl shadow-md mb-6 animate-pulse">
                                <div className="flex items-center gap-3">
                                    <i className="fas fa-exclamation-circle text-2xl"></i>
                                    <div>
                                        <h3 className="font-bold text-lg">تحذير هام للمشرف</h3>
                                        <p className="text-sm font-bold">يوجد {stats.negativeStock} مواد برصيد سالب (الاستهلاك تجاوز المخزون!). يرجى تصحيح الأرصدة فوراً.</p>
                                    </div>
                                </div>
                                <ul className="mt-2 text-xs list-disc list-inside font-bold">
                                    {materials.filter(m => m.quantity < 0).map(m => (
                                        <li key={m.id}>{m.name} (R: {m.quantity})</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* AI Forecast Results Widget */}
                        {forecasts.length > 0 && (
                            <div className="bg-white rounded-[2rem] p-6 shadow-xl border border-purple-100 relative overflow-hidden animate-fade-in">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-purple-50 rounded-full blur-3xl -mr-16 -mt-16"></div>
                                <h3 className="font-bold text-purple-900 text-lg mb-4 flex items-center gap-2">
                                    <i className="fas fa-robot text-purple-500"></i> AI Stock Predictions 📦
                                </h3>
                                <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
                                    {forecasts.map((f, i) => (
                                        <div key={i} className={`min-w-[200px] p-4 rounded-xl border-l-4 shadow-sm flex-shrink-0 ${f.status === 'critical' ? 'bg-red-50 border-red-500' : f.status === 'low' ? 'bg-orange-50 border-orange-500' : 'bg-emerald-50 border-emerald-500'}`}>
                                            <h4 className="font-bold text-slate-800">{f.materialName}</h4>
                                            <p className="text-xs text-slate-500 mt-1">Runs out in <span className="font-bold">{f.daysLeft} days</span></p>
                                            <p className="text-[10px] text-slate-400">Date: {f.predictedDate}</p>
                                            <div className="mt-2 text-xs font-bold">
                                                Avg Usage: {f.avgDailyUsage.toFixed(1)}/day
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Stats Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-between h-40">
                                <div className="flex justify-between items-start">
                                    <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center text-red-500 text-xl"><i className="fas fa-exclamation-triangle"></i></div>
                                </div>
                                <div>
                                    <h3 className="text-3xl font-black text-slate-800">{stats.lowStock}</h3>
                                    <p className="text-sm font-bold text-slate-400">{t('inv.stat.low')}</p>
                                </div>
                            </div>
                            
                            {stats.expiringSoon > 0 && (
                                <div className="bg-white p-6 rounded-3xl shadow-sm border border-orange-100 flex flex-col justify-between h-40 relative overflow-hidden">
                                    <div className="absolute right-0 top-0 w-2 h-full bg-orange-400"></div>
                                    <div className="flex justify-between items-start">
                                        <div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-500 text-xl"><i className="fas fa-hourglass-half"></i></div>
                                    </div>
                                    <div>
                                        <h3 className="text-3xl font-black text-slate-800">{stats.expiringSoon}</h3>
                                        <p className="text-sm font-bold text-slate-400">{t('inv.stat.expiry')}</p>
                                    </div>
                                </div>
                            )}

                            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-between h-40">
                                <div className="flex justify-between items-start">
                                    <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-500 text-xl"><i className="fas fa-hand-holding-medical"></i></div>
                                </div>
                                <div>
                                    <h3 className="text-3xl font-black text-slate-800">{stats.totalUsages}</h3>
                                    <p className="text-sm font-bold text-slate-400">{t('inv.stat.usage')}</p>
                                </div>
                            </div>
                            
                            <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-6 rounded-3xl shadow-lg shadow-slate-300 text-white flex flex-col justify-between h-40">
                                <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-white text-xl"><i className="fas fa-cubes"></i></div>
                                <div>
                                    <h3 className="text-3xl font-black text-white">{stats.totalItems}</h3>
                                    <p className="text-sm font-bold text-slate-400">{t('inv.stat.total')}</p>
                                </div>
                            </div>
                        </div>

                        {/* Low Stock Grid */}
                        <div>
                            <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                                <i className="fas fa-battery-quarter text-red-500"></i> {t('inv.stat.low')}
                            </h3>
                            {materials.filter(m => m.quantity <= 10).length === 0 ? (
                                <div className="bg-emerald-50 p-8 rounded-3xl text-center border border-emerald-100">
                                    <i className="fas fa-check-circle text-4xl text-emerald-400 mb-2"></i>
                                    <p className="font-bold text-emerald-700">{t('inv.alert.good')}</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                    {materials.filter(m => m.quantity <= 10).map(m => (
                                        <div key={m.id} className="bg-white p-4 rounded-2xl border-2 border-red-50 flex items-center gap-4 shadow-sm animate-pulse-slow">
                                            <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center font-bold text-sm">
                                                {m.quantity}
                                            </div>
                                            <div className="flex-1">
                                                <h4 className="font-bold text-slate-800 truncate">{m.name}</h4>
                                                <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2">
                                                    <div className="bg-red-500 h-1.5 rounded-full" style={{ width: `${(Math.max(0, m.quantity)/20)*100}%` }}></div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* --- USAGE TAB --- */}
                {activeTab === 'usage' && (
                    <div className="max-w-4xl mx-auto animate-fade-in-up">
                        <div className="grid md:grid-cols-2 gap-8 items-start">
                            <div className="bg-white p-8 rounded-[2rem] shadow-xl shadow-indigo-100 border border-indigo-50">
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="w-14 h-14 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center text-2xl"><i className="fas fa-hand-holding-medical"></i></div>
                                    <div>
                                        <h2 className="text-2xl font-black text-slate-800">{t('inv.usage.title')}</h2>
                                        <p className="text-slate-400 text-sm">{t('inv.usage.subtitle')}</p>
                                    </div>
                                </div>

                                {frequentMaterials.length > 0 && (
                                    <div className="mb-6">
                                        <p className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wide">{t('inv.quick')}</p>
                                        <div className="flex flex-wrap gap-2">
                                            {frequentMaterials.map(matName => (
                                                <button 
                                                    key={matName}
                                                    onClick={() => setSelectedMaterial(matName)}
                                                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border ${selectedMaterial === matName ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                                                >
                                                    {matName}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <form onSubmit={handleUsageSubmit} className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-slate-600">{t('inv.usage.material')}</label>
                                        <div className="relative">
                                            <select 
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 rtl:pr-10 ltr:pl-4 outline-none focus:ring-2 focus:ring-indigo-200 font-bold text-slate-700 appearance-none"
                                                value={selectedMaterial}
                                                onChange={e => setSelectedMaterial(e.target.value)}
                                            >
                                                <option value="">...</option>
                                                {materials.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                                            </select>
                                        </div>
                                        {selectedMaterial && (
                                            <div className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg inline-block">
                                                Qty: {materials.find(m => m.name === selectedMaterial)?.quantity}
                                            </div>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-slate-600">{t('inv.usage.amount')}</label>
                                            <input type="number" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 font-bold outline-none focus:ring-2 focus:ring-indigo-200" value={usageAmount} onChange={e => setUsageAmount(e.target.value)} placeholder="0" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-slate-600">{t('inv.usage.file')}</label>
                                            <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 font-bold outline-none focus:ring-2 focus:ring-indigo-200" value={patientFileNumber} onChange={e => setPatientFileNumber(e.target.value)} placeholder="File No." />
                                        </div>
                                        {isAdmin && (
                                            <>
                                                <div className="space-y-2">
                                                    <label className="text-sm font-bold text-slate-600">{t('inv.usage.date')}</label>
                                                    <input type="date" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 font-bold outline-none focus:ring-2 focus:ring-indigo-200" value={usageDate} onChange={e => setUsageDate(e.target.value)} />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-sm font-bold text-slate-600">{t('inv.usage.staffName')}</label>
                                                    <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 font-bold outline-none focus:ring-2 focus:ring-indigo-200" value={usageStaffName} onChange={e => setUsageStaffName(e.target.value)} />
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    <button type="submit" className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold text-lg shadow-xl shadow-indigo-300 hover:bg-indigo-700 hover:scale-[1.02] transition-all active:scale-95">
                                        {t('inv.usage.confirm')}
                                    </button>
                                </form>
                            </div>

                            <div className="space-y-4">
                                <h3 className="font-bold text-slate-700 text-lg">{t('inv.recent')}</h3>
                                {usages.slice(0, 5).map(u => (
                                    <div key={u.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-center">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                                                <i className="fas fa-syringe"></i>
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-slate-800 text-sm">{u.material}</h4>
                                                <p className="text-xs text-slate-400">{u.staffName} • {u.patientFileNumber}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className="block font-black text-indigo-600">-{u.amount}</span>
                                            <span className="text-[10px] text-slate-400 font-mono dir-ltr">{u.date?.toDate ? u.date.toDate().toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'}) : ''}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* --- DISTRIBUTION TAB (ADMIN / CUSTODY CLERK) --- */}
                {(isAdmin || userRole === 'custody_clerk') && activeTab === 'distribution' && (
                    <div className="max-w-4xl mx-auto animate-fade-in-up space-y-6">
                        {/* Tab Switcher for Admin / Custody Clerk */}
                        <div className="flex bg-slate-100 p-1.5 rounded-[1.5rem] shadow-sm border border-slate-200">
                            <button
                                type="button"
                                onClick={() => setDistSubTab('distribute')}
                                className={`flex-1 py-3 rounded-xl text-xs md:text-sm font-bold transition-all flex items-center justify-center gap-2 ${distSubTab === 'distribute' ? 'bg-orange-600 text-white shadow-md' : 'text-slate-600 hover:text-slate-800'}`}
                            >
                                <i className="fas fa-share-square"></i>
                                {t('inv.distribution')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setDistSubTab('monitoring')}
                                className={`flex-1 py-3 rounded-xl text-xs md:text-sm font-bold transition-all flex items-center justify-center gap-2 ${distSubTab === 'monitoring' ? 'bg-orange-600 text-white shadow-md' : 'text-slate-600 hover:text-slate-800'}`}
                            >
                                <i className="fas fa-eye animate-pulse-slow"></i>
                                {t('inv.custody.monitor')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setDistSubTab('handovers')}
                                className={`flex-1 py-3 rounded-xl text-xs md:text-sm font-bold transition-all flex items-center justify-center gap-2 ${distSubTab === 'handovers' ? 'bg-orange-600 text-white shadow-md' : 'text-slate-600 hover:text-slate-800'}`}
                            >
                                <i className="fas fa-exchange-alt"></i>
                                {t('inv.custody.handoverLog')}
                            </button>
                        </div>

                        {distSubTab === 'distribute' && (
                            <div className="grid md:grid-cols-2 gap-8 items-start">
                                <div className="bg-white p-8 rounded-[2rem] shadow-xl shadow-orange-100 border border-orange-50">
                                    <div className="flex items-center gap-4 mb-8">
                                        <div className="w-14 h-14 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center text-2xl"><i className="fas fa-share-square"></i></div>
                                        <div>
                                            <h2 className="text-2xl font-black text-slate-800">{t('inv.distribution')}</h2>
                                            <p className="text-slate-400 text-sm">{t('inv.dist.subtitle')}</p>
                                        </div>
                                    </div>
                                    <form onSubmit={handleDistributionSubmit} className="space-y-6">
                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-slate-600">{t('inv.usage.material')}</label>
                                            <div className="relative">
                                                <select
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 rtl:pr-10 ltr:pl-4 outline-none focus:ring-2 focus:ring-orange-200 font-bold text-slate-700 appearance-none"
                                                    value={distMaterial}
                                                    onChange={e => setDistMaterial(e.target.value)}
                                                >
                                                    <option value="">...</option>
                                                    {materials.map(m => (
                                                        <option key={m.id} value={m.name}>
                                                            {m.name} {t('inv.dist.remainingInStock|qty:' + m.quantity)}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-sm font-bold text-slate-600">{t('inv.usage.amount')}</label>
                                                <input type="number" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 font-bold outline-none focus:ring-2 focus:ring-orange-200" value={distAmount} onChange={e => setDistAmount(e.target.value)} placeholder="0" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-bold text-slate-600">{t('inv.dist.staffName')}</label>
                                                <div className="relative">
                                                    <select
                                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 rtl:pr-10 ltr:pl-4 font-bold outline-none focus:ring-2 focus:ring-orange-200 appearance-none text-slate-700"
                                                        value={distStaffName}
                                                        onChange={e => {
                                                            const emp = employees.find(emp => emp.name === e.target.value);
                                                            setDistStaffName(e.target.value);
                                                            setDistStaffEmail(emp?.email || '');
                                                        }}
                                                    >
                                                        <option value="">...</option>
                                                        {employees.map(emp => (
                                                            <option key={emp.id} value={emp.name}>{emp.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="space-y-2 col-span-2">
                                                <label className="text-sm font-bold text-slate-600">{t('inv.dist.date')}</label>
                                                <input type="date" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 font-bold outline-none focus:ring-2 focus:ring-orange-200 text-slate-600" value={distDate} onChange={e => setDistDate(e.target.value)} />
                                            </div>
                                        </div>
                                        <button type="submit" className="w-full bg-orange-600 text-white py-4 rounded-xl font-bold text-lg shadow-xl shadow-orange-300 hover:bg-orange-700 hover:scale-[1.02] transition-all active:scale-95">
                                            {t('inv.dist.confirm')}
                                        </button>
                                    </form>
                                </div>
                                <div className="space-y-4 bg-white p-6 rounded-[2rem] shadow-xl border border-slate-50">
                                    <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                                        <h3 className="font-bold text-slate-800 text-lg">{t('inv.dist.log')}</h3>
                                        <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-lg">{t('inv.custody.total')}: {distributions.length}</span>
                                    </div>
                                    
                                    {/* Distributions Search bar */}
                                    <div className="relative">
                                        <i className="fas fa-search absolute right-3 top-3 text-slate-400 text-xs"></i>
                                        <input
                                            type="text"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pr-8 pl-4 text-xs font-bold outline-none focus:ring-2 focus:ring-orange-200"
                                            placeholder={t('inv.dist.searchPlaceholder')}
                                            value={distListSearch}
                                            onChange={e => setDistListSearch(e.target.value)}
                                        />
                                    </div>

                                    <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1">
                                        {distributions
                                            .filter(d => {
                                                if (!distListSearch) return true;
                                                const s = distListSearch.toLowerCase();
                                                return d.material.toLowerCase().includes(s) ||
                                                    d.staffName.toLowerCase().includes(s) ||
                                                    (d.distributedBy && d.distributedBy.toLowerCase().includes(s)) ||
                                                    (d.transferPartner && d.transferPartner.toLowerCase().includes(s));
                                            })
                                            .map(d => (
                                                <div key={d.id} className="bg-slate-50 hover:bg-orange-50/30 p-3.5 rounded-xl flex items-center gap-3 shadow-sm border border-slate-100/80 transition-all">
                                                    <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center font-black text-sm shrink-0"><i className="fas fa-user-tag"></i></div>
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="font-bold text-slate-800 text-sm truncate">{d.material}</h4>
                                                        <div className="text-[10px] text-slate-500 space-y-0.5 mt-0.5">
                                                            <div className="flex items-center gap-1.5 truncate">
                                                                <i className="fas fa-user text-slate-300 text-[9px]"></i> 
                                                                <span>المستلم: <strong className="text-slate-700">{d.staffName}</strong></span>
                                                            </div>
                                                            {d.distributedBy && (
                                                                <div className="flex items-center gap-1.5 truncate">
                                                                    <i className="fas fa-user-shield text-slate-300 text-[9px]"></i> 
                                                                    <span>بواسطة: <strong className="text-slate-700">{d.distributedBy}</strong></span>
                                                                </div>
                                                            )}
                                                            {d.isTransfer && (
                                                                <div className="mt-1">
                                                                    <span className="inline-block text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-bold">
                                                                        {d.amount < 0 ? `نقل عهدة إلى: ${d.transferPartner}` : `استلام عهدة من: ${d.transferPartner}`}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="text-center shrink-0 flex flex-col items-end gap-1">
                                                        <span className={`block font-black text-sm ${d.amount < 0 ? 'text-red-500' : 'text-orange-600'}`}>
                                                            {d.amount > 0 ? `+${d.amount}` : d.amount}
                                                        </span>
                                                        <span className="text-[9px] text-slate-400 font-mono dir-ltr">{d.date?.toDate ? `${d.date.toDate().toLocaleDateString('en-US')} ${d.date.toDate().toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'})}` : ''}</span>
                                                        <button onClick={() => handleDeleteDistribution(d)} className="text-red-400 hover:text-red-600 text-xs mt-1" title="Delete">
                                                            <i className="fas fa-trash-alt"></i>
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {distSubTab === 'monitoring' && (
                            <div className="bg-white p-8 rounded-[2rem] shadow-xl border border-slate-50 space-y-6">
                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-4">
                                    <div>
                                        <h2 className="text-xl font-black text-slate-800">{t('inv.custody.monitor')}</h2>
                                        <p className="text-slate-400 text-xs mt-0.5">{t('inv.custody.monitorDesc')}</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setDistMonitoringFilter('all')}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${distMonitoringFilter === 'all' ? 'bg-orange-600 text-white shadow' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                                        >
                                            {t('inv.dist.all')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setDistMonitoringFilter('unused')}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${distMonitoringFilter === 'unused' ? 'bg-amber-500 text-white shadow' : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'}`}
                                        >
                                            <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                                            {t('inv.custody.notUsed')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setDistMonitoringFilter('active')}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${distMonitoringFilter === 'active' ? 'bg-teal-600 text-white shadow' : 'bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200'}`}
                                        >
                                            {t('inv.custody.partiallyUsed')}
                                        </button>
                                    </div>
                                </div>

                                <div className="relative">
                                    <i className="fas fa-search absolute right-3.5 top-3.5 text-slate-400 text-sm"></i>
                                    <input
                                        type="text"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pr-10 ltr:pl-4 outline-none focus:ring-2 focus:ring-orange-200"
                                        placeholder={t('inv.custody.searchPlaceholder')}
                                        value={distMonitoringSearch}
                                        onChange={e => setDistMonitoringSearch(e.target.value)}
                                    />
                                </div>

                                <div className="space-y-6">
                                    {Object.values(staffCustodyDetailed)
                                        .filter(record => {
                                            if (distMonitoringSearch) {
                                                const searchLower = distMonitoringSearch.toLowerCase();
                                                const matchesStaff = record.staffName.toLowerCase().includes(searchLower);
                                                const matchesMaterial = Object.keys(record.materials).some(mName => mName.toLowerCase().includes(searchLower));
                                                if (!matchesStaff && !matchesMaterial) return false;
                                            }
                                            return true;
                                        })
                                        .map(record => {
                                            const filteredMaterials = Object.entries(record.materials).filter(([mName, stat]) => {
                                                if (distMonitoringSearch) {
                                                    const s = distMonitoringSearch.toLowerCase();
                                                    if (!record.staffName.toLowerCase().includes(s) && !mName.toLowerCase().includes(s)) return false;
                                                }

                                                const isUnused = stat.received > 0 && stat.used === 0 && stat.balance > 0;
                                                const isActive = stat.used > 0 && stat.balance > 0;

                                                if (distMonitoringFilter === 'unused') return isUnused;
                                                if (distMonitoringFilter === 'active') return isActive;
                                                return stat.received > 0;
                                            });

                                            if (filteredMaterials.length === 0) return null;

                                            return (
                                                <div key={record.staffName} className="border border-slate-100 bg-slate-50/50 rounded-2xl p-5 space-y-4 shadow-sm animate-fade-in">
                                                    <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center"><i className="fas fa-user text-sm"></i></div>
                                                            <div>
                                                                 <h4 className="font-bold text-slate-800 text-base">{record.staffName}</h4>
                                                                 <p className="text-[10px] text-slate-400 font-mono">{record.staffEmail}</p>
                                                            </div>
                                                        </div>
                                                        <span className="text-[10px] bg-slate-200 text-slate-600 px-2.5 py-1 rounded-full font-bold">{t('inv.custody.custodiesCount|count:' + filteredMaterials.length)}</span>
                                                    </div>

                                                    <div className="grid sm:grid-cols-2 gap-4">
                                                        {filteredMaterials.map(([mName, stat]) => {
                                                            const isUnused = stat.received > 0 && stat.used === 0 && stat.balance > 0;
                                                            return (
                                                                <div
                                                                    key={mName}
                                                                    className={`p-4 rounded-xl shadow-xs transition-all border ${
                                                                        isUnused
                                                                            ? 'bg-amber-50/70 border-amber-300 shadow-amber-50 relative overflow-hidden'
                                                                            : 'bg-white border-slate-100'
                                                                    }`}
                                                                >
                                                                    {isUnused && (
                                                                        <div className="absolute top-0 left-0 right-0 h-1 bg-amber-400 animate-pulse"></div>
                                                                    )}
                                                                    <div className="flex justify-between items-start mb-2">
                                                                        <h5 className="font-bold text-slate-800 text-sm truncate w-2/3" title={mName}>{mName}</h5>
                                                                        {isUnused ? (
                                                                            <span className="flex items-center gap-1 text-[9px] bg-amber-500 text-white font-black px-1.5 py-0.5 rounded-md animate-pulse">
                                                                                <i className="fas fa-exclamation-triangle"></i>
                                                                                {t('inv.custody.unusedWarning')}
                                                                            </span>
                                                                        ) : stat.balance === 0 ? (
                                                                            <span className="text-[9px] bg-slate-200 text-slate-600 font-bold px-1.5 py-0.5 rounded-md">
                                                                                {t('inv.custody.fullyConsumed')}
                                                                            </span>
                                                                        ) : (
                                                                            <span className="text-[9px] bg-teal-500 text-white font-bold px-1.5 py-0.5 rounded-md">
                                                                                {t('inv.custody.partiallyUsed')} ✅
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className="grid grid-cols-3 gap-1 text-center bg-slate-50 p-2 rounded-lg text-xs mt-2 border border-slate-100 font-bold">
                                                                        <div>
                                                                            <span className="block text-[8px] text-slate-400 font-bold">{t('inv.custody.received')}</span>
                                                                            <span className="text-slate-700">{stat.received}</span>
                                                                        </div>
                                                                        <div>
                                                                            <span className="block text-[8px] text-slate-400 font-bold">{t('inv.custody.consumed')}</span>
                                                                            <span className="text-slate-700">{stat.used}</span>
                                                                        </div>
                                                                        <div>
                                                                            <span className="block text-[8px] text-slate-400 font-bold">{t('inv.custody.remaining')}</span>
                                                                            <span className={`font-black ${stat.balance > 0 ? 'text-teal-600' : 'text-slate-400'}`}>{stat.balance}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}

                                    {Object.values(staffCustodyDetailed).length === 0 && (
                                        <div className="text-center py-12 text-slate-400">
                                            <i className="fas fa-users-slash text-3xl mb-2"></i>
                                            <p className="text-sm">{t('inv.custody.noStaff')}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {distSubTab === 'handovers' && (
                            <div className="bg-white p-8 rounded-[2rem] shadow-xl border border-slate-50 space-y-6 animate-fade-in">
                                <div className="border-b border-slate-100 pb-4">
                                    <h2 className="text-xl font-black text-slate-800">{t('inv.custody.handoverLog')}</h2>
                                    <p className="text-slate-400 text-xs mt-0.5">{t('inv.custody.handoverLogDesc')}</p>
                                </div>

                                <div className="space-y-4">
                                    {consolidatedTransfers.length === 0 ? (
                                        <div className="text-center py-16 text-slate-400 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-100">
                                            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-xs">
                                                <i className="fas fa-exchange-alt text-2xl opacity-40"></i>
                                            </div>
                                            <p className="font-bold">{t('inv.custody.noHandovers')}</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {consolidatedTransfers.map(group => {
                                                const isExpanded = expandedConsolidatedKey === group.key;
                                                return (
                                                    <div
                                                        key={group.key}
                                                        className={`border rounded-2xl transition-all shadow-sm ${
                                                            group.status === 'pending'
                                                                ? 'bg-amber-50/40 border-amber-200'
                                                                : group.status === 'rejected'
                                                                ? 'bg-red-50/20 border-red-100'
                                                                : 'bg-white border-slate-100 hover:shadow-md'
                                                        }`}
                                                    >
                                                        {/* Main summary row */}
                                                        <div 
                                                            className="p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 cursor-pointer select-none" 
                                                            onClick={() => setExpandedConsolidatedKey(isExpanded ? null : group.key)}
                                                        >
                                                            <div className="flex-1 space-y-2">
                                                                {/* Sender & Recipient Header */}
                                                                <div className="flex flex-wrap items-center gap-2 font-bold text-sm">
                                                                    <span className="text-slate-700 bg-slate-100 px-3 py-1 rounded-full">{group.senderName}</span>
                                                                    <span className="text-indigo-500 font-black px-1">
                                                                        <i className="fas fa-long-arrow-alt-left text-lg align-middle animate-pulse-slow"></i>
                                                                    </span>
                                                                    <span className="text-slate-700 bg-indigo-50 px-3 py-1 rounded-full">{group.recipientName}</span>
                                                                </div>

                                                                {/* Material and consolidated amount */}
                                                                <div className="flex items-center gap-3 mt-1.5">
                                                                    <span className="text-sm font-extrabold text-slate-800">{group.material}</span>
                                                                    <span className="text-slate-300">|</span>
                                                                    <span className="text-xs text-slate-500 font-bold flex items-center gap-1">
                                                                        <i className="fas fa-layer-group text-slate-400"></i>
                                                                        {t('inv.custody.total')}: <strong className="text-indigo-600 text-sm font-black">{group.totalAmount}</strong> {t('inv.custody.units')}
                                                                    </span>
                                                                    <span className="text-slate-300">|</span>
                                                                    <span className="text-xs text-slate-500 font-bold">
                                                                        {t('inv.custody.transferCount|count:' + group.items.length)}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            {/* Right actions and status */}
                                                            <div className="flex items-center gap-3 shrink-0 self-end md:self-auto">
                                                                {group.status === 'pending' ? (
                                                                    <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-xs font-black flex items-center gap-1.5 animate-pulse">
                                                                        {t('inv.custody.pendingReceipt')}
                                                                    </span>
                                                                ) : group.status === 'rejected' ? (
                                                                    <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-xs font-bold">
                                                                        {t('inv.custody.rejectedStatus')}
                                                                    </span>
                                                                ) : (
                                                                    <span className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-bold">
                                                                        {t('inv.custody.confirmedStatus')}
                                                                    </span>
                                                                )}
                                                                
                                                                <button type="button" className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-100 rounded-full transition-colors">
                                                                    <i className={`fas ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} text-sm`}></i>
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Expanded transaction details list */}
                                                        {isExpanded && (
                                                            <div className="border-t border-slate-100 bg-slate-50/50 p-5 rounded-b-2xl space-y-3 animate-fade-in-down">
                                                                <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider mb-2 flex items-center gap-1">
                                                                    <i className="fas fa-list-ul"></i>
                                                                    {t('inv.custody.individualMovements|count:' + group.items.length)}
                                                                </p>
                                                                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                                                    {group.items.map((item, idx) => {
                                                                        const d = item.date?.toDate ? item.date.toDate() : new Date(item.date?.seconds * 1000 || Date.now());
                                                                        return (
                                                                            <div key={item.id || idx} className="bg-white p-3 rounded-xl border border-slate-100 shadow-xs flex justify-between items-center text-xs">
                                                                                <div className="flex items-center gap-2">
                                                                                    <span className="bg-slate-100 text-slate-600 w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px]">
                                                                                        {idx + 1}
                                                                                    </span>
                                                                                    <span className="text-slate-600 font-medium">
                                                                                        {d.toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                                                    </span>
                                                                                    <span className="text-slate-300">•</span>
                                                                                    <span className="text-slate-500 font-mono">
                                                                                        {d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                                                                    </span>
                                                                                </div>
                                                                                <div className="flex items-center gap-3 font-bold">
                                                                                    <span className="font-extrabold text-slate-800">
                                                                                        {item.amount} {t('inv.custody.units')}
                                                                                    </span>
                                                                                    {group.status === 'pending' && (
                                                                                        <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 font-bold">
                                                                                            {t('inv.custody.pendingCount')}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* --- CUSTODY TAB (ALL USERS) --- */}
                {activeTab === 'custody' && (
                    <div className="max-w-4xl mx-auto animate-fade-in-up">
                        <div className="grid md:grid-cols-2 gap-8 items-start">
                            <div className="bg-white p-8 rounded-[2rem] shadow-xl shadow-teal-100 border border-teal-50">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="w-14 h-14 bg-teal-100 text-teal-600 rounded-2xl flex items-center justify-center text-2xl"><i className="fas fa-box-open"></i></div>
                                    <div>
                                        <h2 className="text-2xl font-black text-slate-800">
                                            {custodySubTab === 'use' ? t('inv.custody.use') : 'نقل عهدة لزميل'}
                                        </h2>
                                        <p className="text-slate-400 text-sm">
                                            {custodySubTab === 'use' ? 'Record usage from your personal custody' : 'نقل رصيد من عهدتك الحالية إلى موظف آخر بالقسم (تسليم وردية)'}
                                        </p>
                                    </div>
                                </div>

                                {/* Custody Subtab Switcher */}
                                <div className="flex bg-slate-100 p-1 rounded-xl mb-6">
                                    <button
                                        type="button"
                                        onClick={() => setCustodySubTab('use')}
                                        className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${custodySubTab === 'use' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                                    >
                                        <i className="fas fa-notes-medical mr-1 ml-1"></i>
                                        تسجيل استهلاك العهدة
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCustodySubTab('transfer')}
                                        className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${custodySubTab === 'transfer' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                                    >
                                        <i className="fas fa-exchange-alt mr-1 ml-1"></i>
                                        نقل العهدة لزميل
                                    </button>
                                </div>

                                {custodySubTab === 'use' ? (
                                    <form onSubmit={handleCustodyUsageSubmit} className="space-y-6">
                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-slate-600">{t('inv.usage.material')}</label>
                                            <div className="relative">
                                                <select
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 rtl:pr-10 ltr:pl-4 outline-none focus:ring-2 focus:ring-teal-200 font-bold text-slate-700 appearance-none"
                                                    value={custodyMaterial}
                                                    onChange={e => setCustodyMaterial(e.target.value)}
                                                >
                                                    <option value="">...</option>
                                                    {materials.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-sm font-bold text-slate-600">{t('inv.usage.amount')}</label>
                                                <input type="number" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 font-bold outline-none focus:ring-2 focus:ring-teal-200" value={custodyAmount} onChange={e => setCustodyAmount(e.target.value)} placeholder="0" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-bold text-slate-600">{t('inv.usage.file')}</label>
                                                <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 font-bold outline-none focus:ring-2 focus:ring-teal-200" value={custodyPatientFile} onChange={e => setCustodyPatientFile(e.target.value)} placeholder="File No." />
                                            </div>
                                            <div className="space-y-2 col-span-2">
                                                <label className="text-sm font-bold text-slate-600">{t('inv.usage.date')}</label>
                                                <input type="date" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 font-bold outline-none focus:ring-2 focus:ring-teal-200" value={custodyUsageDate} onChange={e => setCustodyUsageDate(e.target.value)} />
                                            </div>
                                        </div>
                                        <button type="submit" className="w-full bg-teal-600 text-white py-4 rounded-xl font-bold text-lg shadow-xl shadow-teal-300 hover:bg-teal-700 hover:scale-[1.02] transition-all active:scale-95">
                                            {t('inv.usage.confirm')}
                                        </button>
                                    </form>
                                ) : (
                                    <form onSubmit={handleCustodyTransferSubmit} className="space-y-6">
                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-slate-600">المادة (Material)</label>
                                            <div className="relative">
                                                <select
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 rtl:pr-10 ltr:pl-4 outline-none focus:ring-2 focus:ring-teal-200 font-bold text-slate-700 appearance-none"
                                                    value={transferMaterial}
                                                    onChange={e => setTransferMaterial(e.target.value)}
                                                >
                                                    <option value="">اختر المادة لنقلها...</option>
                                                    {materials.map(m => {
                                                        const distributed = distributions.filter(d => d.material.trim() === m.name.trim() && isUserDistribution(d)).reduce((sum, d) => sum + d.amount, 0);
                                                        const used = usages.filter(u => u.material.trim() === m.name.trim() && u.fromCustody && isUserUsage(u)).reduce((sum, u) => sum + u.amount, 0);
                                                        const balance = distributed - used;
                                                        if (balance <= 0) return null;
                                                        return <option key={m.id} value={m.name}>{m.name} (المتاح: {balance})</option>;
                                                    })}
                                                </select>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2 col-span-2">
                                                <label className="text-sm font-bold text-slate-600">الكمية المراد نقلها (Amount to transfer)</label>
                                                <input type="number" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 font-bold outline-none focus:ring-2 focus:ring-teal-200" value={transferAmount} onChange={e => setTransferAmount(e.target.value)} placeholder="0" />
                                            </div>
                                            <div className="space-y-2 col-span-2">
                                                <label className="text-sm font-bold text-slate-600">الموظف المستلم (Recipient Employee)</label>
                                                <select
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 outline-none focus:ring-2 focus:ring-teal-200 font-bold text-slate-700 appearance-none"
                                                    value={transferRecipient}
                                                    onChange={e => setTransferRecipient(e.target.value)}
                                                >
                                                    <option value="">اختر الموظف المستلم...</option>
                                                    {employees.filter(emp => 
                                                        emp.email !== userEmail && 
                                                        emp.name !== userName && 
                                                        !['admin', 'supervisor', 'manager', 'custody_clerk'].includes(emp.role)
                                                    ).map(emp => (
                                                        <option key={emp.id} value={emp.id}>{emp.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                        <button type="submit" className="w-full bg-teal-600 text-white py-4 rounded-xl font-bold text-lg shadow-xl shadow-teal-300 hover:bg-teal-700 hover:scale-[1.02] transition-all active:scale-95">
                                            تأكيد نقل العهدة
                                        </button>
                                    </form>
                                )}
                            </div>
                            <div className="space-y-4">
                                {transfers.filter(tr => tr.status === 'pending' && ((userEmail && tr.recipientEmail === userEmail) || tr.recipientName === userName)).length > 0 && (
                                    <div className="bg-amber-50 p-6 rounded-[2rem] border border-amber-100 shadow-sm space-y-4">
                                        <h3 className="font-bold text-amber-800 text-sm flex items-center gap-2">
                                            <span className="animate-pulse inline-block w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                                            {t('inv.custody.pendingReceipts')}
                                        </h3>
                                        <div className="space-y-3">
                                            {transfers.filter(tr => tr.status === 'pending' && ((userEmail && tr.recipientEmail === userEmail) || tr.recipientName === userName)).map(tr => (
                                                <div key={tr.id} className="bg-white p-4 rounded-xl border border-amber-200 shadow-sm flex flex-col gap-3">
                                                    <div className="flex justify-between items-start">
                                                        <div>
                                                            <h4 className="font-bold text-slate-800 text-sm">{tr.material}</h4>
                                                            <p className="text-xs text-slate-500 mt-1">
                                                                {t('inv.custody.transferor')}: <span className="font-bold text-slate-700">{tr.senderName}</span>
                                                            </p>
                                                        </div>
                                                        <span className="bg-amber-100 text-amber-800 px-2 py-1 rounded-lg text-xs font-black">
                                                            +{tr.amount}
                                                        </span>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => handleConfirmTransfer(tr)}
                                                            className="flex-1 bg-teal-600 text-white py-2 rounded-lg text-xs font-bold hover:bg-teal-700 transition-colors"
                                                        >
                                                            {t('inv.custody.confirmBtn')}
                                                        </button>
                                                        <button
                                                            onClick={() => handleRejectTransfer(tr)}
                                                            className="bg-slate-100 text-slate-600 hover:bg-slate-200 px-3 py-2 rounded-lg text-xs font-bold transition-colors"
                                                        >
                                                            {t('inv.custody.rejectBtn')}
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* أحدث تسجيلات الصبغة للموظف بترتيب الوقت والتاريخ */}
                                <div className="mb-6 pb-6 border-b border-slate-150">
                                    <h3 className="font-black text-slate-700 text-lg mb-4 flex items-center gap-2">
                                        <i className="fas fa-history text-teal-600"></i>
                                        أحدث تسجيلاتك للصبغة (استهلاك العهدة)
                                    </h3>
                                    
                                    {usages.filter(isUserUsage).length === 0 ? (
                                        <p className="text-sm text-slate-400 text-center py-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200">لا توجد تسجيلات استهلاك سابقة لك بعد</p>
                                    ) : (
                                        <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                                            {usages
                                                .filter(isUserUsage)
                                                .sort((a, b) => {
                                                     const da = a.date?.toDate ? a.date.toDate().getTime() : (a.date?.seconds || 0) * 1000;
                                                     const db = b.date?.toDate ? b.date.toDate().getTime() : (b.date?.seconds || 0) * 1000;
                                                     return db - da;
                                                })
                                                .map(u => {
                                                    const d = u.date?.toDate ? u.date.toDate() : new Date((u.date?.seconds || 0) * 1000);
                                                    return (
                                                        <div key={u.id} className="bg-white p-4 rounded-2xl shadow-xs border border-slate-100 hover:shadow-sm transition-all flex items-center gap-3">
                                                            <div className="w-10 h-10 bg-teal-50 text-teal-600 rounded-xl flex items-center justify-center font-black text-sm shrink-0">
                                                                <i className="fas fa-file-medical"></i>
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex justify-between items-start">
                                                                    <h4 className="font-bold text-slate-800 text-sm truncate">{u.material}</h4>
                                                                    <span className="text-red-500 font-extrabold text-sm">
                                                                        -{u.amount}
                                                                    </span>
                                                                </div>
                                                                <div className="text-[10px] text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                                                                    {u.patientFileNumber && (
                                                                        <span className="flex items-center gap-1">
                                                                            <i className="fas fa-folder text-slate-300"></i>
                                                                            ملف: <strong className="text-slate-700">{u.patientFileNumber}</strong>
                                                                        </span>
                                                                    )}
                                                                    <span className="text-slate-400 font-mono">
                                                                        {d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' })} - {d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                    )}
                                </div>

                                <h3 className="font-bold text-slate-700 text-lg">{t('inv.custody.balance')}</h3>
                                {materials.map(m => {
                                    const distributed = distributions.filter(d => d.material.trim() === m.name.trim() && isUserDistribution(d)).reduce((sum, d) => sum + d.amount, 0);
                                    const used = usages.filter(u => u.material.trim() === m.name.trim() && u.fromCustody && isUserUsage(u)).reduce((sum, u) => sum + u.amount, 0);
                                    const balance = distributed - used;
                                    if (distributed === 0) return null;
                                    return (
                                        <div key={m.id} className="bg-white p-4 rounded-2xl flex items-center gap-4 shadow-sm border border-slate-100">
                                            <div className="w-12 h-12 bg-teal-50 text-teal-500 rounded-xl flex items-center justify-center font-black"><i className="fas fa-boxes"></i></div>
                                            <div className="flex-1">
                                                <h4 className="font-bold text-slate-800">{m.name}</h4>
                                                <div className="text-xs text-slate-500 flex items-center gap-2 mt-1">
                                                    In: {distributed} | Out: {used}
                                                </div>
                                            </div>
                                            <div className="text-center">
                                                <span className={`block font-black ${balance > 0 ? 'text-teal-600' : 'text-red-500'}`}>{balance}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* --- MATERIALS & INCOMING --- */}
                {(activeTab === 'materials' || activeTab === 'incoming') && (
                    <div className="animate-fade-in-up">
                        {activeTab === 'incoming' ? (
                            <div className="space-y-10">
                                {/* Top: Add New Invoice Form */}
                                <div className="max-w-3xl mx-auto bg-white p-8 rounded-[2rem] shadow-xl border border-emerald-50 relative overflow-hidden">
                                    <div className="absolute top-0 left-0 w-full h-2 bg-emerald-500"></div>
                                    <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3">
                                        <span className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center shadow-md shadow-emerald-100"><i className="fas fa-truck-loading"></i></span>
                                        {t('inv.inc.title')}
                                    </h2>
                                    <form onSubmit={handleIncomingSubmit} className="space-y-6">
                                        <div className="grid grid-cols-2 gap-4">
                                            <select 
                                                className="col-span-2 w-full bg-slate-50 border border-slate-200 rounded-xl p-4 outline-none font-bold text-slate-700 focus:ring-2 focus:ring-emerald-200 transition-all"
                                                value={incMaterial}
                                                onChange={e => setIncMaterial(e.target.value)}
                                            >
                                                <option value="">...</option>
                                                {materials.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                                            </select>
                                            <div className="col-span-2 md:col-span-1">
                                                <label className="block text-xs font-bold text-slate-500 mb-1">{t('inv.inc.qty')}</label>
                                                <input type="number" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 font-bold outline-none focus:ring-2 focus:ring-emerald-200 transition-all" value={incQuantity} onChange={e => setIncQuantity(e.target.value)} placeholder="0" />
                                            </div>
                                            <div className="col-span-2 md:col-span-1">
                                                <label className="block text-xs font-bold text-slate-500 mb-1">{t('inv.inc.exp')}</label>
                                                <input type="date" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 font-bold outline-none text-slate-600 focus:ring-2 focus:ring-emerald-200 transition-all" value={incExpiry} onChange={e => setIncExpiry(e.target.value)} />
                                            </div>
                                        </div>
                                        <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center hover:bg-emerald-50 hover:border-emerald-300 transition-all relative cursor-pointer group">
                                            <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer z-10" onChange={e => setIncImage(e.target.files ? e.target.files[0] : null)} />
                                            <div className="relative z-0">
                                                <i className={`fas fa-cloud-upload-alt text-4xl mb-3 transition-colors ${incImage ? 'text-emerald-500' : 'text-slate-300 group-hover:text-emerald-400'}`}></i>
                                                <p className={`font-bold ${incImage ? 'text-emerald-600' : 'text-slate-500 group-hover:text-emerald-600'}`}>{incImage ? incImage.name : t('inv.inc.upload')}</p>
                                            </div>
                                        </div>
                                        <button disabled={uploading} className="w-full bg-emerald-600 text-white py-4 rounded-xl font-bold shadow-lg shadow-emerald-200 hover:bg-emerald-700 hover:scale-[1.01] transition-all active:scale-95 disabled:opacity-70 disabled:scale-100">
                                            {uploading ? <i className="fas fa-spinner fa-spin"></i> : t('inv.inc.btn')}
                                        </button>
                                    </form>
                                </div>

                                {/* Bottom: Invoice History Grid */}
                                <div>
                                    <div className="flex justify-between items-center mb-6 px-2">
                                        <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                                            <i className="fas fa-history text-slate-400"></i> {t('inv.recent')}
                                            <span className="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded-full">{displayedInvoices.length}</span>
                                        </h3>
                                        <div className="flex gap-2">
                                            {isAdmin && (
                                                <button onClick={handleDeleteOldInvoices} className="text-xs bg-red-50 text-red-600 px-3 py-2 rounded-lg font-bold hover:bg-red-100">
                                                    <i className="fas fa-trash mr-1"></i> Delete Old (&gt;1yr)
                                                </button>
                                            )}
                                            <input 
                                                type="month" 
                                                className="bg-white border border-slate-200 rounded-lg p-2 text-sm font-bold text-slate-600 outline-none focus:ring-2 focus:ring-emerald-200"
                                                value={incomingViewMonth}
                                                onChange={e => setIncomingViewMonth(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                        {displayedInvoices.map(inv => (
                                            <div key={inv.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all group flex flex-col relative">
                                                {isAdmin && (
                                                    <button 
                                                        onClick={() => handleDeleteInvoice(inv.id)}
                                                        className="absolute top-2 left-2 z-20 text-red-400 hover:text-red-600 bg-white/80 p-1.5 rounded-full hover:bg-white shadow-sm opacity-0 group-hover:opacity-100 transition-all"
                                                        title="Delete Invoice"
                                                    >
                                                        <i className="fas fa-trash"></i>
                                                    </button>
                                                )}
                                                {/* Image / Header */}
                                                <div className="h-40 bg-slate-50 relative overflow-hidden cursor-pointer" onClick={() => inv.imageUrl && window.open(inv.imageUrl, '_blank')}>
                                                    {inv.imageUrl ? (
                                                        <>
                                                            <img src={inv.imageUrl} alt="Invoice" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                                                <i className="fas fa-external-link-alt text-white text-2xl drop-shadow-md"></i>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 bg-slate-100">
                                                            <i className="fas fa-file-invoice text-4xl mb-2"></i>
                                                            <span className="text-[10px] font-bold uppercase tracking-wider">No Image</span>
                                                        </div>
                                                    )}
                                                    {/* Date Badge */}
                                                    <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm text-slate-800 text-[10px] font-bold px-2 py-1 rounded-lg shadow-sm border border-slate-100">
                                                        {inv.date?.toDate ? inv.date.toDate().toLocaleDateString('en-US') : 'N/A'}
                                                    </div>
                                                </div>

                                                {/* Content */}
                                                <div className="p-5 flex-1 flex flex-col">
                                                    <div className="flex justify-between items-start mb-4">
                                                        <h4 className="font-bold text-slate-800 text-lg truncate pr-2" title={inv.material}>{inv.material}</h4>
                                                        <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500 font-bold text-sm shrink-0 border border-emerald-100">
                                                            <i className="fas fa-arrow-down"></i>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="mt-auto space-y-3">
                                                        <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                            <span className="text-xs font-bold text-slate-500">{t('inv.inc.qty')}</span>
                                                            <span className="text-xl font-black text-emerald-600">+{inv.quantityAdded}</span>
                                                        </div>
                                                        
                                                        {inv.expiryDate && (
                                                            <div className="flex items-center gap-2 text-xs font-bold text-orange-600 bg-orange-50 px-3 py-2 rounded-lg border border-orange-100">
                                                                <i className="fas fa-hourglass-end"></i>
                                                                <span>Exp: <span className="font-mono">{inv.expiryDate}</span></span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    
                                    {displayedInvoices.length === 0 && (
                                        <div className="text-center py-16 text-slate-400 bg-white rounded-[2rem] border border-dashed border-slate-200">
                                            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                                <i className="fas fa-box-open text-2xl opacity-50"></i>
                                            </div>
                                            <p className="font-medium">No invoices for {incomingViewMonth}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                                    <h2 className="text-2xl font-black text-slate-800">{t('inv.mat.title')}</h2>
                                    <div className="flex gap-2 w-full md:w-auto">
                                        <div className="relative flex-1 md:w-64">
                                            <i className="fas fa-search absolute right-3 top-3.5 text-slate-400 text-sm"></i>
                                            <input 
                                                className="w-full bg-white border border-slate-200 rounded-xl py-3 pr-9 pl-4 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100"
                                                placeholder={t('search')}
                                                value={materialSearch}
                                                onChange={e => setMaterialSearch(e.target.value)}
                                            />
                                        </div>
                                        <button onClick={() => { setEditingMat(null); setNewMatName(''); setNewMatQty(''); }} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-blue-700">
                                            <i className="fas fa-plus rtl:ml-2 ltr:mr-2"></i> {t('add')}
                                        </button>
                                    </div>
                                </div>
                                
                                {/* Add/Edit Area (Improved for Correction) */}
                                {(newMatName || editingMat || newMatQty) && (
                                    <div className="bg-white border-2 border-slate-200 p-6 rounded-2xl shadow-lg flex flex-col gap-4 animate-fade-in relative overflow-hidden">
                                        <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                                        <div className="flex justify-between items-center">
                                            <h3 className="font-bold text-slate-800 text-lg">
                                                {editingMat ? 'Correct Stock Level' : 'Add New Material'}
                                            </h3>
                                            <button onClick={() => { setEditingMat(null); setNewMatName(''); setNewMatQty(''); }} className="text-slate-400 hover:text-slate-600"><i className="fas fa-times"></i></button>
                                        </div>
                                        
                                        {editingMat && (
                                            <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-xs text-amber-800 font-bold mb-2">
                                                <i className="fas fa-info-circle mr-1"></i> Use this form to manually correct stock discrepancies.
                                            </div>
                                        )}

                                        <div className="grid md:grid-cols-3 gap-4">
                                            <div className="md:col-span-2">
                                                <label className="text-xs font-bold text-slate-500 mb-1 block">Material Name</label>
                                                <input className="bg-slate-50 border border-slate-200 rounded-xl p-3 w-full text-slate-800 font-bold outline-none focus:ring-2 focus:ring-blue-100" placeholder={t('inv.mat.name')} value={newMatName} onChange={e => setNewMatName(e.target.value)} />
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-slate-500 mb-1 block">Actual Quantity</label>
                                                <input className="bg-slate-50 border border-slate-200 rounded-xl p-3 w-full text-slate-800 font-bold outline-none focus:ring-2 focus:ring-blue-100" type="number" placeholder="Qty" value={newMatQty} onChange={e => setNewMatQty(e.target.value)} />
                                            </div>
                                        </div>
                                        
                                        {/* Correction Date Input */}
                                        {editingMat && (
                                            <div>
                                                <label className="text-xs font-bold text-slate-500 mb-1 block">Correction Effective Date</label>
                                                <input 
                                                    type="date" 
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 font-bold outline-none focus:ring-2 focus:ring-blue-100" 
                                                    value={correctionDate} 
                                                    onChange={e => setCorrectionDate(e.target.value)} 
                                                />
                                                <p className="text-[10px] text-slate-400 mt-1">
                                                    * This date will be used for the adjustment transaction record.
                                                </p>
                                            </div>
                                        )}

                                        <button onClick={handleMaterialSave} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 shadow-md w-full">
                                            {editingMat ? 'Update & Correct Stock' : t('save')}
                                        </button>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {filteredMaterials.map(m => (
                                        <div key={m.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group relative">
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                                                    <i className="fas fa-box"></i>
                                                </div>
                                                <button onClick={() => { setEditingMat(m); setNewMatName(m.name); setNewMatQty(m.quantity.toString()); setCorrectionDate(new Date().toISOString().split('T')[0]); }} className="text-slate-300 hover:text-blue-500 bg-slate-50 hover:bg-blue-50 p-2 rounded-full transition-colors"><i className="fas fa-pen"></i></button>
                                            </div>
                                            <h4 className="font-bold text-slate-800 mb-1 truncate" title={m.name}>{m.name}</h4>
                                            <p className={`text-sm font-bold ${m.quantity <= 10 ? 'text-red-500' : 'text-emerald-500'}`}>{m.quantity} {t('inv.mat.unit')}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* --- REPORTS TAB --- */}
                {activeTab === 'reports' && (
                    <div className="space-y-6 animate-fade-in-up">
                        
                        <PrintHeader title={t('inv.rep.title')} subtitle="TRANSACTION LOG" />

                        {/* Control Panel: Filters & Print Trigger */}
                        <div className="flex flex-col sm:flex-row justify-between sm:items-center bg-white p-5 rounded-2xl shadow-sm border border-slate-150 print:hidden gap-4">
                            <div className="flex items-center gap-2">
                                <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center text-lg shadow-sm">
                                    <i className="fas fa-file-invoice"></i>
                                </div>
                                <div>
                                    <h2 className="text-xl font-black text-slate-800">{t('inv.rep.title')}</h2>
                                    <p className="text-xs text-slate-400">تنسيق وتصدير تقارير المخزون الرئيسي والعهد</p>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2 items-center">
                                <select className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-600 outline-none focus:ring-2 focus:ring-indigo-100" value={reportFilter} onChange={e => setReportFilter(e.target.value as any)}>
                                    <option value="all">All Time</option>
                                    <option value="range">Date Range</option>
                                </select>
                                {reportFilter === 'range' && (
                                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2">
                                        <input type="month" className="bg-transparent border-none text-sm p-1 font-bold text-slate-600 outline-none" value={reportStart} onChange={e => setReportStart(e.target.value)} />
                                        <span className="text-slate-400 font-bold">➜</span>
                                        <input type="month" className="bg-transparent border-none text-sm p-1 font-bold text-slate-600 outline-none" value={reportEnd} onChange={e => setReportEnd(e.target.value)} />
                                    </div>
                                )}
                                <button onClick={() => window.print()} className="bg-indigo-600 text-white px-5 py-3 rounded-xl text-sm font-bold hover:bg-indigo-750 transition-all flex items-center gap-2 shadow-lg shadow-indigo-100 hover:scale-[1.01] active:scale-95">
                                    <i className="fas fa-print"></i> {t('print')}
                                </button>
                            </div>
                        </div>

                        {/* --- Print Settings Control Card (Screen Only) --- */}
                        <div className="bg-gradient-to-br from-indigo-50/70 to-blue-50/50 border border-indigo-100/80 p-5 rounded-2xl shadow-sm print:hidden space-y-4">
                            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                                <div>
                                    <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm sm:text-base">
                                        <i className="fas fa-sliders-h text-indigo-600"></i> {t('inv.print.options')}
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-1">{t('inv.print.warning')}</p>
                                </div>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => {
                                            const allOn = !printMaterialBreakdown || !printTransactionLogs || !printStaffCustody;
                                            setPrintMaterialBreakdown(allOn);
                                            setPrintTransactionLogs(allOn);
                                            setPrintStaffCustody(allOn);
                                        }}
                                        className="text-xs font-bold px-3 py-2 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-700 transition-colors flex items-center gap-1.5"
                                    >
                                        <i className="fas fa-check-double"></i> {t('inv.print.all')}
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <label className={`flex items-start gap-3 p-3 bg-white rounded-xl border cursor-pointer transition-all hover:border-indigo-300 ${printMaterialBreakdown ? 'border-indigo-400 ring-2 ring-indigo-50/50' : 'border-slate-200'}`}>
                                    <input 
                                        type="checkbox" 
                                        className="mt-1 rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4" 
                                        checked={printMaterialBreakdown} 
                                        onChange={e => setPrintMaterialBreakdown(e.target.checked)} 
                                    />
                                    <div>
                                        <span className="block font-black text-slate-800 text-xs">{t('inv.print.materialBreakdown')}</span>
                                        <span className="block text-[10px] text-slate-400 mt-0.5">تحليل استهلاك رصيد الصبغات والمواد والعهد النشطة</span>
                                    </div>
                                </label>

                                <label className={`flex items-start gap-3 p-3 bg-white rounded-xl border cursor-pointer transition-all hover:border-indigo-300 ${printTransactionLogs ? 'border-indigo-400 ring-2 ring-indigo-50/50' : 'border-slate-200'}`}>
                                    <input 
                                        type="checkbox" 
                                        className="mt-1 rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4" 
                                        checked={printTransactionLogs} 
                                        onChange={e => setPrintTransactionLogs(e.target.checked)} 
                                    />
                                    <div>
                                        <span className="block font-black text-slate-800 text-xs">{t('inv.print.transactionLogs')}</span>
                                        <span className="block text-[10px] text-slate-400 mt-0.5">سجل العمليات المفصل لجميع الصرف والتوريد</span>
                                    </div>
                                </label>

                                <label className={`flex items-start gap-3 p-3 bg-white rounded-xl border cursor-pointer transition-all hover:border-indigo-300 ${printStaffCustody ? 'border-indigo-400 ring-2 ring-indigo-50/50' : 'border-slate-200'}`}>
                                    <input 
                                        type="checkbox" 
                                        className="mt-1 rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4" 
                                        checked={printStaffCustody} 
                                        onChange={e => setPrintStaffCustody(e.target.checked)} 
                                    />
                                    <div>
                                        <span className="block font-black text-slate-800 text-xs">{t('inv.print.staffCustody')}</span>
                                        <span className="block text-[10px] text-slate-400 mt-0.5">تقرير أرصدة العهد الفردية لجميع الموظفين بالقسم</span>
                                    </div>
                                </label>
                            </div>
                        </div>

                        {/* --- SECTION 1: DETAILED MATERIAL BREAKDOWN --- */}
                        {printMaterialBreakdown && (
                            <div className="space-y-4 print:break-inside-avoid">
                                <h3 className="text-lg font-black text-slate-700 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-2 print:border-slate-300">
                                    <i className="fas fa-cubes text-indigo-500"></i> {t('inv.print.materialBreakdown')}
                                    <span className="text-xs font-normal text-slate-400 ml-2">
                                        ({reportFilter === 'range' ? `${reportStart} ➜ ${reportEnd}` : 'All Time'})
                                    </span>
                                </h3>
                                
                                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                                    {materialStats.map(([matName, stat]) => {
                                        // 1. Calculate Active Custody Holders for this specific material
                                        const activeCustodies = Object.entries(staffBalances)
                                            .map(([email, data]) => ({
                                                name: data.name,
                                                balance: data.materials[matName.trim()] || 0
                                            }))
                                            .filter(c => c.balance > 0);

                                        // 2. Get Recent Transactions (Usages & Invoices) for this specific material inside period
                                        const materialUsages = usages.filter(u => u.material.trim() === matName.trim() && (reportFilter === 'all' || (() => {
                                            const d = u.date?.toDate ? u.date.toDate() : new Date((u.date?.seconds || 0) * 1000);
                                            const isoMonth = d.toISOString().slice(0, 7);
                                            return isoMonth >= reportStart && isoMonth <= reportEnd;
                                        })()));

                                        const materialInvoices = invoices.filter(inv => inv.material.trim() === matName.trim() && (reportFilter === 'all' || (() => {
                                            const d = inv.date?.toDate ? inv.date.toDate() : new Date((inv.date?.seconds || 0) * 1000);
                                            const isoMonth = d.toISOString().slice(0, 7);
                                            return isoMonth >= reportStart && isoMonth <= reportEnd;
                                        })()));

                                        const recentActions = [
                                            ...materialUsages.map(u => ({
                                                type: 'usage',
                                                date: u.date,
                                                amount: u.amount,
                                                user: u.staffName,
                                                ref: u.patientFileNumber || ''
                                            })),
                                            ...materialInvoices.map(inv => ({
                                                type: 'invoice',
                                                date: inv.date,
                                                amount: inv.quantityAdded,
                                                user: inv.createdBy || 'System',
                                                ref: (inv as any).invoiceNumber || 'Invoice'
                                            }))
                                        ].sort((a, b) => {
                                            const da = a.date?.toDate ? a.date.toDate().getTime() : (a.date?.seconds || 0) * 1000;
                                            const db = b.date?.toDate ? b.date.toDate().getTime() : (b.date?.seconds || 0) * 1000;
                                            return db - da;
                                        }).slice(0, 5);

                                        return (
                                            <div key={matName} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-all print:break-inside-avoid print:border-slate-400 print:shadow-none flex flex-col">
                                                {/* Card Header */}
                                                <div className="bg-slate-50 p-4 border-b border-slate-100 flex justify-between items-center print:bg-slate-100 print:border-slate-300">
                                                    <h4 className="font-bold text-slate-800 text-base truncate pr-2" title={matName}>{matName}</h4>
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-black uppercase ${stat.endBalance <= 10 ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                                                        {stat.endBalance <= 10 ? 'Low Stock' : 'Good Level'}
                                                    </span>
                                                </div>
                                                
                                                {/* Card Body */}
                                                <div className="p-4 space-y-4 flex-1 flex flex-col justify-between">
                                                    <div>
                                                        {/* Stock Flow Visualization */}
                                                        <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100 print:bg-slate-50 print:border-slate-200 mb-3">
                                                            <div className="text-center">
                                                                <span className="block text-[9px] text-slate-400 font-bold uppercase mb-0.5">Open</span>
                                                                <span className="block text-xs font-black text-slate-600">{stat.startBalance}</span>
                                                            </div>
                                                            <div className="text-slate-300 text-[10px]"><i className="fas fa-plus"></i></div>
                                                            <div className="text-center">
                                                                <span className="block text-[9px] text-emerald-500 font-bold uppercase mb-0.5">Added</span>
                                                                <span className="block text-xs font-black text-emerald-600">+{stat.periodIn}</span>
                                                            </div>
                                                            <div className="text-slate-300 text-[10px]"><i className="fas fa-minus"></i></div>
                                                            <div className="text-center">
                                                                <span className="block text-[9px] text-red-500 font-bold uppercase mb-0.5">Used</span>
                                                                <span className="block text-xs font-black text-red-600">-{stat.periodOut}</span>
                                                            </div>
                                                        </div>
                                                        
                                                        {/* Net Result */}
                                                        <div className="flex justify-between items-center border-b border-slate-100 pb-2 mb-3">
                                                             <span className="text-[11px] font-bold text-slate-500 uppercase">Net Balance</span>
                                                             <span className="text-base font-black text-slate-800 bg-slate-100 px-2.5 py-0.5 rounded-lg print:bg-slate-200">
                                                                 {stat.endBalance}
                                                             </span>
                                                        </div>

                                                        {/* Grid: Staff Usage & Staff Custody */}
                                                        <div className="grid grid-cols-2 gap-4 border-b border-slate-100 pb-3 mb-3">
                                                            {/* Usage Breakdown */}
                                                            <div className="border-r border-slate-150 pr-2">
                                                                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1.5 pb-0.5 border-b border-slate-100 flex items-center gap-1">
                                                                    <i className="fas fa-user-tag text-indigo-400 text-[8px]"></i> Usage By Staff
                                                                </p>
                                                                <div className="space-y-1 max-h-24 overflow-y-auto custom-scrollbar">
                                                                    {Object.entries(stat.staffUsage).length === 0 ? (
                                                                        <p className="text-[9px] text-slate-400 italic text-center py-1">No usage</p>
                                                                    ) : (
                                                                        Object.entries(stat.staffUsage).sort((a,b)=>b[1]-a[1]).map(([staff, amount]) => (
                                                                            <div key={staff} className="flex justify-between items-center text-[10px]">
                                                                                <span className="text-slate-600 font-medium truncate w-2/3" title={staff}>{staff}</span>
                                                                                <span className="font-bold text-slate-800 bg-slate-100 px-1 rounded">{amount}</span>
                                                                            </div>
                                                                        ))
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Custody Balances */}
                                                            <div>
                                                                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1.5 pb-0.5 border-b border-slate-100 flex items-center gap-1">
                                                                    <i className="fas fa-briefcase text-teal-400 text-[8px]"></i> Active Custody
                                                                </p>
                                                                <div className="space-y-1 max-h-24 overflow-y-auto custom-scrollbar">
                                                                    {activeCustodies.length === 0 ? (
                                                                        <p className="text-[9px] text-slate-400 italic text-center py-1">No custody</p>
                                                                    ) : (
                                                                        activeCustodies.sort((a,b)=>b.balance-a.balance).map(cust => (
                                                                            <div key={cust.name} className="flex justify-between items-center text-[10px]">
                                                                                <span className="text-slate-600 font-medium truncate w-2/3" title={cust.name}>{cust.name}</span>
                                                                                <span className="font-bold text-teal-600 bg-teal-50 px-1 rounded">{cust.balance}</span>
                                                                            </div>
                                                                        ))
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Recent Activities Section */}
                                                    <div>
                                                        <p className="text-[9px] font-bold text-slate-400 uppercase mb-1.5 pb-0.5 border-b border-slate-100 flex items-center gap-1">
                                                            <i className="fas fa-history text-indigo-400 text-[8px]"></i> Recent Activity
                                                        </p>
                                                        <div className="space-y-1">
                                                            {recentActions.length === 0 ? (
                                                                <p className="text-[9px] text-slate-400 italic text-center py-1">No activities</p>
                                                            ) : (
                                                                recentActions.map((act, i) => {
                                                                    const dateString = act.date?.toDate ? act.date.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'N/A';
                                                                    return (
                                                                        <div key={i} className="flex justify-between items-center text-[9px] bg-slate-50 p-1 rounded border border-slate-100">
                                                                            <span className="text-slate-400">{dateString}</span>
                                                                            <span className="text-slate-600 truncate max-w-[80px]" title={act.user}>{act.user}</span>
                                                                            <span className={`font-black ${act.type === 'invoice' ? 'text-emerald-600' : 'text-red-500'}`}>
                                                                                {act.type === 'invoice' ? `+${act.amount}` : `-${act.amount}`}
                                                                            </span>
                                                                        </div>
                                                                    );
                                                                })
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* --- SECTION 2: TRANSACTION LOGS --- */}
                        {printTransactionLogs && (
                            <div className="space-y-4 print:break-inside-avoid print:mt-8">
                                {/* Logs Header with Search */}
                                <div className="flex flex-col sm:flex-row justify-between sm:items-center mt-8 mb-4 print:hidden gap-4">
                                    <h3 className="text-lg font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
                                        <i className="fas fa-list text-indigo-500"></i> {t('inv.print.transactionLogs')}
                                    </h3>
                                    <div className="relative border border-slate-200 rounded-xl bg-white overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500 max-w-sm w-full shadow-sm">
                                        <i className="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 rtl:right-auto rtl:left-3"></i>
                                        <input type="text" placeholder={t('inv.searchHint')} className="w-full p-3 pl-3 rtl:pl-9 rtl:pr-3 outline-none text-sm font-medium" value={reportSearch} onChange={e => setReportSearch(e.target.value)} />
                                    </div>
                                </div>

                                <div className="hidden print:block mb-3">
                                    <h3 className="text-lg font-black text-slate-700 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-2 print:border-slate-300">
                                        <i className="fas fa-list text-indigo-500"></i> {t('inv.print.transactionLogs')}
                                    </h3>
                                </div>

                                {/* Original Detailed Log Table */}
                                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden print:border print:border-slate-400 print:shadow-none print:rounded-none">
                                    <table className={`w-full text-sm ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>
                                        <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100 print:bg-slate-100 print:border-b print:border-slate-400 print:text-black">
                                            <tr>
                                                <th className="p-4 border-r print:border-slate-400">{t('date')}</th>
                                                <th className="p-4 border-r print:border-slate-400">{t('inv.usage.material')}</th>
                                                <th className="p-4 border-r print:border-slate-400">{t('inv.usage.amount')}</th>
                                                <th className="p-4 border-r print:border-slate-400">{t('role.user')}</th>
                                                <th className="p-4">{t('inv.usage.file')}</th>
                                                {isAdmin && <th className="p-4 print:hidden w-10"></th>}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 print:divide-slate-300">
                                            {filteredUsages.map(u => (
                                                <tr key={u.id} className="hover:bg-slate-50/50 print:break-inside-avoid group">
                                                    <td className="p-4 font-mono text-slate-500 dir-ltr print:text-black border-r print:border-slate-400">{u.date?.toDate ? u.date.toDate().toLocaleDateString('en-US') : 'N/A'}</td>
                                                    <td className="p-4 font-bold text-slate-800 border-r print:border-slate-400">{u.material}</td>
                                                    <td className="p-4 font-bold text-red-500 border-r print:border-slate-400">-{u.amount}</td>
                                                    <td className="p-4 text-slate-600 border-r print:border-slate-400 print:text-black">{u.staffName}</td>
                                                    <td className="p-4 font-mono text-slate-500 print:text-black">{u.patientFileNumber}</td>
                                                    {isAdmin && (
                                                        <td className="p-4 print:hidden text-center">
                                                            <button onClick={() => handleDeleteUsage(u)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all" title="Delete & Restore Stock">
                                                                <i className="fas fa-trash"></i>
                                                            </button>
                                                        </td>
                                                    )}
                                                </tr>
                                            ))}
                                            {filteredUsages.length === 0 && (
                                                <tr>
                                                    <td colSpan={isAdmin ? 6 : 5} className="text-center py-8 text-slate-400 italic bg-slate-50/50">
                                                        No records found
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* --- SECTION 3: STAFF CUSTODY REPORT --- */}
                        {printStaffCustody && (
                            <div className="space-y-4 print:break-inside-avoid print:mt-8">
                                <div className="mt-8 mb-4">
                                    <h3 className="text-lg font-black text-slate-700 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-2 print:border-slate-300">
                                        <i className="fas fa-briefcase text-indigo-500"></i> {t('inv.print.staffCustody')}
                                    </h3>
                                </div>

                                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border print:border-slate-400 print:rounded-none">
                                    <table className="w-full text-left text-sm print:text-xs">
                                        <thead className="bg-slate-50 text-slate-500 font-bold print:bg-slate-100 print:border-b print:border-slate-400 print:text-black">
                                            <tr>
                                                <th className="p-4 border-r print:border-slate-400">{t('inv.dist.staffName')}</th>
                                                <th className="p-4 border-r print:border-slate-400">{t('inv.usage.material')}</th>
                                                <th className="p-4 border-r print:border-slate-400">Total In</th>
                                                <th className="p-4 border-r print:border-slate-400">Total Out</th>
                                                <th className="p-4 print:border-slate-400">Balance</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 print:divide-slate-300">
                                            {Object.entries(staffBalances).map(([email, data]) => (
                                                Object.entries(data.materials).map(([mat, bal], idx) => {
                                                    const distSum = distributions.filter(d => d.material === mat && (d.staffEmail === email || d.staffName === email)).reduce((sum, d) => sum + d.amount, 0);
                                                    const useSum = usages.filter(u => u.material === mat && u.fromCustody && (u.staffEmail === email || u.staffName === email)).reduce((sum, u) => sum + u.amount, 0);
                                                    return (
                                                        <tr key={`${email}-${mat}`} className="hover:bg-slate-50/50 print:break-inside-avoid">
                                                            {idx === 0 && (
                                                                <td className="p-4 font-bold text-slate-800 border-r print:border-slate-400 print:text-black" rowSpan={Object.keys(data.materials).length}>
                                                                    {data.name}
                                                                </td>
                                                            )}
                                                            <td className="p-4 font-bold text-slate-700 border-r print:border-slate-400">{mat}</td>
                                                            <td className="p-4 text-orange-600 font-bold border-r print:border-slate-400">+{distSum}</td>
                                                            <td className="p-4 text-teal-600 font-bold border-r print:border-slate-400 text-teal-600 font-bold">-{useSum}</td>
                                                            <td className={`p-4 font-black ${bal > 0 ? 'text-emerald-600' : 'text-red-500'}`}>{bal}</td>
                                                        </tr>
                                                    );
                                                })
                                            ))}
                                            {Object.keys(staffBalances).length === 0 && (
                                                <tr>
                                                    <td colSpan={5} className="text-center py-8 text-slate-400 italic bg-slate-50/50">
                                                        No active custody balances
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                        
                        <PrintFooter />
                    </div>
                )}

            </div>
        </div>
    );
};

export default InventorySystem;