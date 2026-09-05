import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { inventoryDb, inventoryStorage } from '../firebaseInventory';
import { db } from '../firebase';
// @ts-ignore
import { collection, addDoc, doc, updateDoc, onSnapshot, Timestamp, deleteDoc, writeBatch, getDocs, query, where, increment } from 'firebase/firestore';
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

export const normalizeArabic = (text?: string): string => {
    if (!text) return '';
    return text
        .trim()
        .toLowerCase()
        .replace(/[أإآٱ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/ـ/g, '')
        .replace(/[\u064B-\u065F\u0670]/g, '')
        .replace(/\s+/g, ' ');
};

export const normalizeFileNumber = (text?: string): string => {
    if (!text) return '';
    const arabicNums = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    let str = text.trim().toLowerCase();
    for (let i = 0; i < 10; i++) {
        str = str.replaceAll(arabicNums[i], String(i));
    }
    return str.replace(/\s+/g, '');
};

interface DuplicateHistoryItem {
    id: string;
    material: string;
    amount: number;
    staffName: string;
    fromCustody?: boolean;
    dateStr: string;
    timeStr: string;
    timeAgo: string;
    rawDate: any;
}

interface DuplicateWarningModalState {
    isOpen: boolean;
    patientFileNumber: string;
    submittingType: 'mainUsage' | 'custodyUsage';
    newMaterial: string;
    newAmount: number;
    history: DuplicateHistoryItem[];
}

interface InventorySystemProps {
    userRole: string;
    userName: string;
    userEmail: string;
    userId?: string;
    userPermissions?: string[];
    initialTab?: 'dashboard' | 'usage' | 'incoming' | 'materials' | 'reports' | 'distribution' | 'custody';
}

const InventorySystem: React.FC<InventorySystemProps> = ({ userRole, userName, userEmail, userId, userPermissions = [], initialTab }) => {
    const { t, dir, language } = useLanguage();
    const { selectedDepartmentId, departments } = useDepartment();
    const normalizedRole = (userRole || '').toLowerCase();
    const isAdmin = normalizedRole === 'admin';
    const isSupervisor = normalizedRole === 'supervisor';
    const isManager = normalizedRole === 'manager' || normalizedRole === 'director';
    const canManageInventory = isAdmin || isSupervisor || isManager;
    const canDistribute = canManageInventory || 
        normalizedRole === 'custody_clerk' || 
        Boolean(userPermissions?.includes('custody_distribution') || userPermissions?.includes('inventory_distribution'));

    const currentDept = departments?.find(d => d.id === selectedDepartmentId);
    const currentDeptName = currentDept?.name || 'الأشعة والتصوير الطبي (Radiology)';

    const [activeTab, setActiveTab] = useState<'dashboard' | 'usage' | 'incoming' | 'materials' | 'reports' | 'distribution' | 'custody'>(
        initialTab || (
            normalizedRole === 'custody_clerk' ? 'distribution' : 'dashboard'
        )
    );

    useEffect(() => {
        if (initialTab) {
            setActiveTab(initialTab);
        }
    }, [initialTab]);

    // Safety guard against unauthorized activeTab access
    useEffect(() => {
        if (!canManageInventory) {
            if (['usage', 'incoming', 'materials', 'reports'].includes(activeTab)) {
                setActiveTab('dashboard');
            } else if (activeTab === 'distribution' && !canDistribute) {
                setActiveTab('dashboard');
            }
        }
    }, [activeTab, canManageInventory, canDistribute]);
    const [materials, setMaterials] = useState<Material[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [usages, setUsages] = useState<MaterialUsage[]>([]);
    const [distributions, setDistributions] = useState<MaterialDistribution[]>([]);
    const [transfers, setTransfers] = useState<CustodyTransfer[]>([]);
    const [employees, setEmployees] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<{msg: string, type: 'success' | 'info' | 'error'} | null>(null);

    // Network and Double-Submission Guard
    const [submittingOp, setSubmittingOp] = useState<string | null>(null);
    const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

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
    const [distStaffId, setDistStaffId] = useState('');
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
    const [compressedPreview, setCompressedPreview] = useState<{
        originalSizeKB: number;
        compressedSizeKB: number;
        ratio: number;
        dataUrl: string;
        compressedFile: File;
    } | null>(null);
    const [isCompressing, setIsCompressing] = useState(false);
    const [uploading, setUploading] = useState(false);

    // Purge Invoice Images (Non-destructive cleanup of image files within date range)
    const [isPurgeModalOpen, setIsPurgeModalOpen] = useState(false);
    const [purgePeriod, setPurgePeriod] = useState<'1month' | '3months' | '6months' | '1year' | 'custom' | 'all'>('6months');
    const [purgeFromDate, setPurgeFromDate] = useState('');
    const [purgeToDate, setPurgeToDate] = useState(new Date().toISOString().split('T')[0]);
    const [isPurging, setIsPurging] = useState(false);

    const [newMatName, setNewMatName] = useState('');
    const [newMatQty, setNewMatQty] = useState('');
    const [editingMat, setEditingMat] = useState<Material | null>(null);
    const [correctionDate, setCorrectionDate] = useState(new Date().toISOString().split('T')[0]); 
    const [materialSearch, setMaterialSearch] = useState('');

    // Deletion states to prevent multiple clicks and display loading spinners
    const [deletingDistIds, setDeletingDistIds] = useState<string[]>([]);
    const [deletingUsageIds, setDeletingUsageIds] = useState<string[]>([]);
    const [deletingInvoiceIds, setDeletingInvoiceIds] = useState<string[]>([]);

    // Material Stock Adjustment Modal State
    const [adjustingMat, setAdjustingMat] = useState<Material | null>(null);
    const [adjustTargetQty, setAdjustTargetQty] = useState('');
    const [adjustDate, setAdjustDate] = useState(new Date().toISOString().split('T')[0]);
    const [adjustNote, setAdjustNote] = useState('');
    const [isAdjusting, setIsAdjusting] = useState(false);
    const [materialsViewMode, setMaterialsViewMode] = useState<'list' | 'corrections'>('list');

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

    // Duplicate Patient File Confirmation Modal State
    const [duplicateWarningModal, setDuplicateWarningModal] = useState<DuplicateWarningModalState>({
        isOpen: false,
        patientFileNumber: '',
        submittingType: 'mainUsage',
        newMaterial: '',
        newAmount: 0,
        history: []
    });

    // Robust User Matching with Arabic Normalization
    const isUserMatch = useCallback((staffEmail?: string, staffName?: string, staffId?: string) => {
        // 1. Direct ID match if available
        if (staffId && userId && staffId === userId) return true;

        // 2. Direct Email match
        const cleanStaffEmail = (staffEmail || '').trim().toLowerCase();
        const cleanUserEmail = (userEmail || '').trim().toLowerCase();
        if (cleanStaffEmail && cleanUserEmail && cleanStaffEmail === cleanUserEmail) {
            return true;
        }

        // 3. Arabic Normalized Name matching
        const normStaffName = normalizeArabic(staffName);
        const normUserName = normalizeArabic(userName);
        if (normStaffName && normUserName) {
            if (normStaffName === normUserName) return true;
            // Compound / Substring match (e.g. if one contains the other)
            if (normStaffName.length >= 4 && normUserName.length >= 4) {
                if (normStaffName.includes(normUserName) || normUserName.includes(normStaffName)) {
                    return true;
                }
            }
            // First & last name match
            const staffParts = normStaffName.split(' ').filter(Boolean);
            const userParts = normUserName.split(' ').filter(Boolean);
            if (staffParts.length >= 2 && userParts.length >= 2) {
                if (staffParts[0] === userParts[0] && staffParts[staffParts.length - 1] === userParts[userParts.length - 1]) {
                    return true;
                }
            }
        }

        return false;
    }, [userEmail, userName, userId]);

    const isUserDistribution = useCallback((d: MaterialDistribution) => {
        return isUserMatch(d.staffEmail, d.staffName, (d as any).staffId);
    }, [isUserMatch]);

    const isUserUsage = useCallback((u: MaterialUsage) => {
        return isUserMatch(u.staffEmail, u.staffName, (u as any).staffId);
    }, [isUserMatch]);

    // Data Listeners with Offline & Cross-Department Custody Sync
    useEffect(() => {
        setLoading(true);

        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        getDocs(collection(db, 'users')).then(snap => {
            const fetchedUsers = snap.docs.map(d => ({ ...d.data(), id: d.id } as User));
            if (selectedDepartmentId) {
                setEmployees(fetchedUsers.filter(u => u.departmentId === selectedDepartmentId && !['admin', 'supervisor', 'manager'].includes(u.role)));
            } else {
                setEmployees(fetchedUsers.filter(u => !['admin', 'supervisor', 'manager'].includes(u.role)));
            }
        }).catch(err => console.error("Failed to fetch employees:", err));

        const qMat = selectedDepartmentId
            ? query(collection(inventoryDb, 'materials'), where('departmentId', '==', selectedDepartmentId))
            : collection(inventoryDb, 'materials');
        const unsubMat = onSnapshot(qMat, (snap: any) => {
            setMaterials(snap.docs.map((d: any) => ({ ...d.data(), id: d.id } as Material)));
            setLoading(false);
        }, (err: any) => {
            console.error("Materials error:", err);
            setLoading(false);
        });

        const qInv = selectedDepartmentId
            ? query(collection(inventoryDb, 'invoices'), where('departmentId', '==', selectedDepartmentId))
            : collection(inventoryDb, 'invoices');
        const unsubInv = onSnapshot(qInv, (snap: any) => {
            const list = snap.docs.map((d: any) => ({ ...d.data(), id: d.id } as Invoice));
            setInvoices(list.sort((a: any, b: any) => {
                const da = a.date?.toDate ? a.date.toDate() : new Date(a.date?.seconds * 1000);
                const db = b.date?.toDate ? b.date.toDate() : new Date(b.date?.seconds * 1000);
                return db.getTime() - da.getTime();
            }));
        }, (err: any) => console.error("Invoices error:", err));

        let deptUsages: MaterialUsage[] = [];
        let userUsages: MaterialUsage[] = [];
        const syncUsages = () => {
            const map = new Map<string, MaterialUsage>();
            deptUsages.forEach(u => map.set(u.id, u));
            userUsages.forEach(u => map.set(u.id, u));
            const sorted = Array.from(map.values()).sort((a: any, b: any) => {
                const da = a.date?.toDate ? a.date.toDate() : new Date((a.date?.seconds || 0) * 1000);
                const db = b.date?.toDate ? b.date.toDate() : new Date((b.date?.seconds || 0) * 1000);
                return db.getTime() - da.getTime();
            });
            setUsages(sorted);
        };

        let deptDists: MaterialDistribution[] = [];
        let userDists: MaterialDistribution[] = [];
        const syncDistributions = () => {
            const map = new Map<string, MaterialDistribution>();
            deptDists.forEach(d => map.set(d.id, d));
            userDists.forEach(d => map.set(d.id, d));
            const sorted = Array.from(map.values()).sort((a: any, b: any) => {
                const da = a.date?.toDate ? a.date.toDate() : new Date((a.date?.seconds || 0) * 1000);
                const db = b.date?.toDate ? b.date.toDate() : new Date((b.date?.seconds || 0) * 1000);
                return db.getTime() - da.getTime();
            });
            setDistributions(sorted);
        };

        let deptTransfersList: CustodyTransfer[] = [];
        let userTransfersList: CustodyTransfer[] = [];
        const syncTransfers = () => {
            const map = new Map<string, CustodyTransfer>();
            deptTransfersList.forEach(t => map.set(t.id, t));
            userTransfersList.forEach(t => map.set(t.id, t));
            const sorted = Array.from(map.values()).sort((a: any, b: any) => {
                const da = a.date?.toDate ? a.date.toDate() : new Date((a.date?.seconds || 0) * 1000);
                const db = b.date?.toDate ? b.date.toDate() : new Date((b.date?.seconds || 0) * 1000);
                return db.getTime() - da.getTime();
            });
            setTransfers(sorted);
        };

        const qUse = selectedDepartmentId
            ? query(collection(inventoryDb, 'usages'), where('departmentId', '==', selectedDepartmentId))
            : collection(inventoryDb, 'usages');
        const unsubUse = onSnapshot(qUse, (snap: any) => {
            deptUsages = snap.docs.map((d: any) => ({ ...d.data(), id: d.id } as MaterialUsage));
            syncUsages();
        }, (err: any) => console.error("Usages error:", err));

        const qDist = selectedDepartmentId
            ? query(collection(inventoryDb, 'distributions'), where('departmentId', '==', selectedDepartmentId))
            : collection(inventoryDb, 'distributions');
        const unsubDist = onSnapshot(qDist, (snap: any) => {
            deptDists = snap.docs.map((d: any) => ({ ...d.data(), id: d.id } as MaterialDistribution));
            syncDistributions();
        }, (err: any) => console.error("Distributions error:", err));

        const qTransfers = selectedDepartmentId
            ? query(collection(inventoryDb, 'custody_transfers'), where('departmentId', '==', selectedDepartmentId))
            : collection(inventoryDb, 'custody_transfers');
        const unsubTransfers = onSnapshot(qTransfers, (snap: any) => {
            deptTransfersList = snap.docs.map((d: any) => ({ ...d.data(), id: d.id } as CustodyTransfer));
            syncTransfers();
        }, (err: any) => console.error("Transfers error:", err));

        // In addition, if userEmail is present, query personal distributions, usages, and transfers to ensure no custody is hidden by department mismatch
        let unsubUserDist = () => {};
        let unsubUserUse = () => {};
        let unsubUserTransfers = () => {};
        if (userEmail) {
            const cleanEmail = userEmail.trim().toLowerCase();
            try {
                unsubUserDist = onSnapshot(query(collection(inventoryDb, 'distributions'), where('staffEmail', '==', cleanEmail)), snap => {
                    userDists = snap.docs.map(d => ({ ...d.data(), id: d.id } as MaterialDistribution));
                    syncDistributions();
                }, err => console.warn("User dist listener:", err));

                unsubUserUse = onSnapshot(query(collection(inventoryDb, 'usages'), where('staffEmail', '==', cleanEmail)), snap => {
                    userUsages = snap.docs.map(d => ({ ...d.data(), id: d.id } as MaterialUsage));
                    syncUsages();
                }, err => console.warn("User usage listener:", err));

                unsubUserTransfers = onSnapshot(query(collection(inventoryDb, 'custody_transfers'), where('recipientEmail', '==', cleanEmail)), snap => {
                    userTransfersList = snap.docs.map(d => ({ ...d.data(), id: d.id } as CustodyTransfer));
                    syncTransfers();
                }, err => console.warn("User transfer listener:", err));
            } catch (e) {
                console.warn(e);
            }
        }

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            unsubMat();
            unsubInv();
            unsubUse();
            unsubDist();
            unsubTransfers();
            unsubUserDist();
            unsubUserUse();
            unsubUserTransfers();
        };
    }, [selectedDepartmentId, userEmail]);

    // Active User Custody Summary List
    const userCustodyList = useMemo(() => {
        const matMap: Record<string, { material: string, distributed: number, used: number, balance: number }> = {};
        
        distributions.filter(isUserDistribution).forEach(d => {
            const matName = d.material.trim();
            if (!matMap[matName]) {
                matMap[matName] = { material: matName, distributed: 0, used: 0, balance: 0 };
            }
            matMap[matName].distributed += d.amount;
            matMap[matName].balance += d.amount;
        });

        usages.filter(u => u.fromCustody && isUserUsage(u)).forEach(u => {
            const matName = u.material.trim();
            if (!matMap[matName]) {
                matMap[matName] = { material: matName, distributed: 0, used: 0, balance: 0 };
            }
            matMap[matName].used += u.amount;
            matMap[matName].balance -= u.amount;
        });

        return Object.values(matMap).filter(item => item.distributed > 0 || item.balance !== 0);
    }, [distributions, usages, isUserDistribution, isUserUsage]);

    const staffBalances = useMemo(() => {
        const getRecordKey = (email?: string, name?: string) => {
            const cleanEmail = (email || '').toLowerCase().trim();
            const normName = normalizeArabic(name);
            const matchedEmp = employees.find(e => 
                (cleanEmail && e.email && e.email.toLowerCase().trim() === cleanEmail) ||
                (normName && normalizeArabic(e.name) === normName)
            );
            if (matchedEmp) return matchedEmp.email?.toLowerCase().trim() || normalizeArabic(matchedEmp.name);
            return cleanEmail || normName || '';
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
    }, [distributions, usages, employees]);

    const staffCustodyDetailed = useMemo(() => {
        const getRecordKey = (email?: string, name?: string) => {
            const cleanEmail = (email || '').toLowerCase().trim();
            const normName = normalizeArabic(name);
            const matchedEmp = employees.find(e => 
                (cleanEmail && e.email && e.email.toLowerCase().trim() === cleanEmail) ||
                (normName && normalizeArabic(e.name) === normName)
            );
            if (matchedEmp) return matchedEmp.email?.toLowerCase().trim() || normalizeArabic(matchedEmp.name);
            return cleanEmail || normName || '';
        };

        const records: Record<string, {
            staffName: string,
            staffEmail: string,
            materials: Record<string, {
                received: number,
                used: number,
                balance: number
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

    // Live detection of existing patient usage for immediate visual badge feedback
    const mainFileMatches = useMemo(() => {
        const norm = normalizeFileNumber(patientFileNumber);
        if (!norm || norm.length < 2) return [];
        return usages.filter(u => {
            if (!u.patientFileNumber || u.patientFileNumber === 'STOCK CORRECTION' || (u as any).isCorrection) return false;
            return normalizeFileNumber(u.patientFileNumber) === norm;
        });
    }, [patientFileNumber, usages]);

    const custodyFileMatches = useMemo(() => {
        const norm = normalizeFileNumber(custodyPatientFile);
        if (!norm || norm.length < 2) return [];
        return usages.filter(u => {
            if (!u.patientFileNumber || u.patientFileNumber === 'STOCK CORRECTION' || (u as any).isCorrection) return false;
            return normalizeFileNumber(u.patientFileNumber) === norm;
        });
    }, [custodyPatientFile, usages]);

    const formatUsageDateTime = (dateVal: any) => {
        let d: Date | null = null;
        if (dateVal) {
            if (typeof dateVal.toDate === 'function') {
                d = dateVal.toDate();
            } else if (dateVal.seconds) {
                d = new Date(dateVal.seconds * 1000);
            } else if (dateVal instanceof Date) {
                d = dateVal;
            } else {
                const parsed = new Date(dateVal);
                if (!isNaN(parsed.getTime())) d = parsed;
            }
        }

        if (!d) return { dateStr: language === 'en' ? 'Unspecified' : 'غير محدد', timeStr: '--:--', timeAgo: '' };

        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        const isEn = language === 'en';
        const hours = d.getHours();
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const period = hours >= 12 ? (isEn ? 'PM' : 'مساءً') : (isEn ? 'AM' : 'صباحاً');
        const h12 = hours % 12 || 12;
        const timeStr = `${h12}:${minutes} ${period}`;

        const diffMs = Date.now() - d.getTime();
        let timeAgo = '';
        if (diffMs >= 0) {
            const diffMins = Math.floor(diffMs / (1000 * 60));
            const diffHours = Math.floor(diffMins / 60);
            const diffDays = Math.floor(diffHours / 24);

            if (diffMins < 1) timeAgo = isEn ? 'Just now' : 'الآن';
            else if (diffMins < 60) timeAgo = isEn ? `${diffMins}m ago` : `منذ ${diffMins} دقيقة`;
            else if (diffHours < 24) timeAgo = isEn ? `${diffHours}h ago` : `منذ ${diffHours} ساعة`;
            else if (diffDays === 1) timeAgo = isEn ? 'Yesterday' : 'أمس';
            else if (diffDays < 30) timeAgo = isEn ? `${diffDays}d ago` : `منذ ${diffDays} يوم`;
            else if (diffDays < 365) timeAgo = isEn ? `${Math.floor(diffDays / 30)}mo ago` : `منذ ${Math.floor(diffDays / 30)} شهر`;
            else timeAgo = isEn ? `${Math.floor(diffDays / 365)}y ago` : `منذ ${Math.floor(diffDays / 365)} سنة`;
        }

        return { dateStr, timeStr, timeAgo };
    };

    const findPreviousPatientUsages = async (fileNo: string): Promise<DuplicateHistoryItem[]> => {
        const norm = normalizeFileNumber(fileNo);
        if (!norm) return [];

        const localMatches = usages.filter(u => {
            if (!u.patientFileNumber || u.patientFileNumber === 'STOCK CORRECTION' || (u as any).isCorrection) return false;
            return normalizeFileNumber(u.patientFileNumber) === norm;
        });

        const matchMap = new Map<string, MaterialUsage>();
        localMatches.forEach(u => matchMap.set(u.id, u));

        try {
            const trimmed = fileNo.trim();
            const snap = await getDocs(query(collection(inventoryDb, 'usages'), where('patientFileNumber', '==', trimmed)));
            snap.docs.forEach(d => {
                const data = { ...d.data(), id: d.id } as MaterialUsage;
                if (data.patientFileNumber && data.patientFileNumber !== 'STOCK CORRECTION' && !(data as any).isCorrection) {
                    matchMap.set(data.id, data);
                }
            });
        } catch (err) {
            console.warn("Firestore patient query err:", err);
        }

        const allMatches = Array.from(matchMap.values());
        allMatches.sort((a, b) => {
            const da = a.date?.toDate ? a.date.toDate().getTime() : (a.date?.seconds ? a.date.seconds * 1000 : new Date(a.date || 0).getTime());
            const db = b.date?.toDate ? b.date.toDate().getTime() : (b.date?.seconds ? b.date.seconds * 1000 : new Date(b.date || 0).getTime());
            return db - da;
        });

        return allMatches.map(u => {
            const { dateStr, timeStr, timeAgo } = formatUsageDateTime(u.date);
            return {
                id: u.id,
                material: u.material,
                amount: u.amount,
                staffName: u.staffName || (language === 'en' ? 'Unspecified' : 'غير محدد'),
                fromCustody: u.fromCustody,
                dateStr,
                timeStr,
                timeAgo,
                rawDate: u.date
            };
        });
    };

    const confirmDuplicateSave = () => {
        const type = duplicateWarningModal.submittingType;
        setDuplicateWarningModal(prev => ({ ...prev, isOpen: false }));
        if (type === 'mainUsage') {
            handleUsageSubmit(undefined, true);
        } else if (type === 'custodyUsage') {
            handleCustodyUsageSubmit(undefined, true);
        }
    };

    const cancelDuplicateSave = () => {
        setDuplicateWarningModal(prev => ({ ...prev, isOpen: false }));
    };

    const handleUsageSubmit = async (e?: React.FormEvent, skipConfirmation: boolean = false) => {
        if (e) e.preventDefault();
        
        if (submittingOp) return;

        if (!canManageInventory) {
            setToast({ msg: 'غير مصرح لك بالصرف من المخزن الرئيسي', type: 'error' });
            return;
        }

        if (!selectedMaterial || !usageAmount || !patientFileNumber) {
            setToast({ msg: t('inv.usage.fillRequired'), type: 'error' });
            return;
        }

        const mat = materials.find(m => m.name === selectedMaterial);
        if (!mat) return;

        const amount = parseFloat(usageAmount);
        if (amount <= 0 || isNaN(amount)) {
            setToast({ msg: t('inv.usage.amountPositive'), type: 'error' });
            return;
        }
        
        // STRICT CHECK: Prevent Over Usage
        if (mat.quantity < amount) {
            setToast({ msg: language === 'en' ? `❌ Error: Insufficient stock! Available: ${mat.quantity}` : `❌ خطأ: الرصيد غير كافٍ! المتاح: ${mat.quantity}`, type: 'error' });
            return;
        }

        // Check if patient file was registered before
        if (!skipConfirmation) {
            const history = await findPreviousPatientUsages(patientFileNumber);
            if (history.length > 0) {
                setDuplicateWarningModal({
                    isOpen: true,
                    patientFileNumber: patientFileNumber.trim(),
                    submittingType: 'mainUsage',
                    newMaterial: selectedMaterial,
                    newAmount: amount,
                    history
                });
                return;
            }
        }

        setSubmittingOp('mainUsage');
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
                isCorrection: false,
                departmentId: selectedDepartmentId
            });

            // Prevent double submission: Clear form immediately & display reassuring message
            setUsageAmount('');
            setPatientFileNumber('');
            setUsageDate(new Date().toISOString().split('T')[0]);
            setUsageStaffName(userName);

            setToast({ 
                msg: isOnline ? '✅ تم تسجيل الصرف بنجاح! يرجى عدم إعادة الضغط.' : '✅ تم حفظ الصرف محلياً (ضعف إنترنت). ستتم المزامنة تلقائياً - يرجى عدم التكرار.', 
                type: 'success' 
            });
        } catch (err: any) {
            console.error('Error submitting main usage:', err);
            // In case of network timeout, Firestore offline persistence will queue it
            if (!navigator.onLine || err?.message?.includes('network') || err?.code === 'unavailable') {
                setUsageAmount('');
                setPatientFileNumber('');
                setToast({ msg: '⚠️ تم تسجيل العملية في ذاكرة النظام (انقطاع/بطء إنترنت). سيتم ترحيلها تلقائياً عند استقرار الشبكة - يرجى عدم إعادة المحاولة.', type: 'info' });
            } else {
                setToast({ msg: 'حدث خطأ: ' + (err.message || 'Error'), type: 'error' });
            }
        } finally {
            setSubmittingOp(null);
        }
    };

    const handleInvoiceImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) {
            setIncImage(null);
            setCompressedPreview(null);
            return;
        }

        setIsCompressing(true);
        try {
            const originalSizeKB = Math.round(file.size / 1024);
            const options = {
                maxSizeMB: 0.12, // Target ~120KB max (optimal for high capacity)
                maxWidthOrHeight: 1280, // High clarity for receipt text & numbers
                useWebWorker: true,
                fileType: 'image/jpeg',
                initialQuality: 0.72
            };

            let compressedFile: File;
            let dataUrl: string;

            try {
                compressedFile = await imageCompression(file, options);
                dataUrl = await imageCompression.getDataUrlFromFile(compressedFile);
            } catch (compErr) {
                // Fallback to Canvas resizing
                const res = await new Promise<{ file: File, url: string }>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (re) => {
                        const img = new Image();
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            let w = img.width;
                            let h = img.height;
                            const maxDim = 1280;
                            if (w > maxDim || h > maxDim) {
                                if (w > h) {
                                    h = Math.round((h * maxDim) / w);
                                    w = maxDim;
                                } else {
                                    w = Math.round((w * maxDim) / h);
                                    h = maxDim;
                                }
                            }
                            canvas.width = w;
                            canvas.height = h;
                            const ctx = canvas.getContext('2d');
                            ctx?.drawImage(img, 0, 0, w, h);
                            const url = canvas.toDataURL('image/jpeg', 0.72);
                            canvas.toBlob((blob) => {
                                const f = new File([blob || file], file.name, { type: 'image/jpeg' });
                                resolve({ file: f, url });
                            }, 'image/jpeg', 0.72);
                        };
                        img.src = re.target?.result as string;
                    };
                    reader.readAsDataURL(file);
                });
                compressedFile = res.file;
                dataUrl = res.url;
            }

            const compressedSizeKB = Math.round(compressedFile.size / 1024);
            const ratio = Math.max(0, Math.round((1 - compressedSizeKB / Math.max(1, originalSizeKB)) * 100));

            setIncImage(compressedFile);
            setCompressedPreview({
                originalSizeKB,
                compressedSizeKB,
                ratio,
                dataUrl,
                compressedFile
            });
        } catch (err: any) {
            console.error('Compression failed:', err);
            setIncImage(file);
            setCompressedPreview({
                originalSizeKB: Math.round(file.size / 1024),
                compressedSizeKB: Math.round(file.size / 1024),
                ratio: 0,
                dataUrl: URL.createObjectURL(file),
                compressedFile: file
            });
        } finally {
            setIsCompressing(false);
        }
    };

    // Calculate invoices matching the purge period that have images
    const matchingInvoicesForPurge = useMemo(() => {
        const now = new Date();
        return invoices.filter(inv => {
            if (!inv.imageUrl) return false;
            let invDate: Date | null = null;
            if (inv.date?.toDate) invDate = inv.date.toDate();
            else if (inv.date) invDate = new Date(inv.date);
            if (!invDate) return false;

            if (purgePeriod === 'all') return true;
            if (purgePeriod === '1month') {
                const threshold = new Date(now);
                threshold.setMonth(threshold.getMonth() - 1);
                return invDate <= threshold;
            }
            if (purgePeriod === '3months') {
                const threshold = new Date(now);
                threshold.setMonth(threshold.getMonth() - 3);
                return invDate <= threshold;
            }
            if (purgePeriod === '6months') {
                const threshold = new Date(now);
                threshold.setMonth(threshold.getMonth() - 6);
                return invDate <= threshold;
            }
            if (purgePeriod === '1year') {
                const threshold = new Date(now);
                threshold.setFullYear(threshold.getFullYear() - 1);
                return invDate <= threshold;
            }
            if (purgePeriod === 'custom') {
                const from = purgeFromDate ? new Date(purgeFromDate) : new Date(0);
                const to = purgeToDate ? new Date(purgeToDate + 'T23:59:59') : new Date();
                return invDate >= from && invDate <= to;
            }
            return false;
        });
    }, [invoices, purgePeriod, purgeFromDate, purgeToDate]);

    // Non-destructive cleanup: Delete only invoice images from storage & Firestore, keep record & quantity intact!
    const handlePurgeInvoiceImages = async () => {
        if (matchingInvoicesForPurge.length === 0) {
            setToast({ msg: 'لا توجد صور فواتير مطابقة للمدة المحددة', type: 'info' });
            return;
        }

        setIsPurging(true);
        try {
            let deletedCount = 0;
            const batch = writeBatch(inventoryDb);

            for (const inv of matchingInvoicesForPurge) {
                // Delete storage object if possible
                if (inv.imageUrl && !inv.imageUrl.startsWith('data:')) {
                    try {
                        const imageRef = ref(inventoryStorage, inv.imageUrl);
                        await deleteObject(imageRef);
                    } catch (e) {
                        console.warn("Storage image deletion note:", e);
                    }
                }
                
                // Update Firestore document: remove imageUrl, mark imagePurged, keep ALL other data (material, quantity, date, exp)
                const docRef = doc(inventoryDb, 'invoices', inv.id);
                batch.update(docRef, {
                    imageUrl: null,
                    imagePurged: true,
                    imagePurgedAt: Timestamp.now()
                });
                deletedCount++;
            }

            await batch.commit();

            setToast({
                msg: `✅ تم مسح صور ${deletedCount} فاتورة بنجاح لتوفير المساحة، مع الاحتفاظ بجميع السجلات والكميات كاملة دون أي تعديل.`,
                type: 'success'
            });
            setIsPurgeModalOpen(false);
        } catch (err: any) {
            console.error('Error purging invoice images:', err);
            setToast({ msg: 'حدث خطأ أثناء مسح صور الفواتير: ' + err.message, type: 'error' });
        } finally {
            setIsPurging(false);
        }
    };

    const handleDistributionSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submittingOp) return;

        if (!distMaterial || !distAmount || !distStaffName) {
            setToast({ msg: 'يرجى إكمال بيانات التوزيع المطلوبة', type: 'error' });
            return;
        }

        const mat = materials.find(m => m.name === distMaterial);
        if (!mat) return;

        const amount = parseFloat(distAmount);
        if (amount <= 0 || isNaN(amount)) {
            setToast({ msg: 'الكمية يجب أن تكون أكبر من صفر', type: 'error' });
            return;
        }
        
        if (mat.quantity < amount) {
            setToast({ msg: `❌ خطأ: الرصيد غير كافٍ! المتاح بالمخزن: ${mat.quantity}`, type: 'error' });
            return;
        }

        // Try to enrich staffEmail and staffId if missing from state
        const matchedEmp = employees.find(emp => 
            (distStaffEmail && emp.email && emp.email.toLowerCase().trim() === distStaffEmail.toLowerCase().trim()) ||
            normalizeArabic(emp.name) === normalizeArabic(distStaffName)
        );
        const resolvedEmail = distStaffEmail || matchedEmp?.email || '';
        const resolvedId = distStaffId || matchedEmp?.id || '';

        setSubmittingOp('distribution');
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
                staffEmail: resolvedEmail,
                staffId: resolvedId,
                distributedBy: userName,
                date: tsDate,
                departmentId: selectedDepartmentId
            });

            // Prevent double submission: clear form immediately
            setDistMaterial('');
            setDistAmount('');
            setDistStaffName('');
            setDistStaffEmail('');
            setDistStaffId('');
            setDistDate(new Date().toISOString().split('T')[0]);

            setToast({ 
                msg: isOnline ? '✅ تم تسجيل توزيع العهدة بنجاح! الرجاء عدم إعادة الضغط.' : '✅ تم تسجيل التوزيع محلياً (ضعف إنترنت). ستتم المزامنة تلقائياً - يرجى عدم التكرار.', 
                type: 'success' 
            });
        } catch (err: any) {
            console.error('Error submitting distribution:', err);
            if (!navigator.onLine || err?.message?.includes('network') || err?.code === 'unavailable') {
                setDistMaterial('');
                setDistAmount('');
                setDistStaffName('');
                setDistStaffEmail('');
                setDistStaffId('');
                setToast({ msg: '⚠️ تم تسجيل التوزيع في ذاكرة الجهاز (انقطاع/بطء إنترنت). سيتم ترحيل البيانات تلقائياً - يرجى عدم إعادة المحاولة.', type: 'info' });
            } else {
                setToast({ msg: 'خطأ أثناء تسجيل التوزيع: ' + (err.message || 'Error'), type: 'error' });
            }
        } finally {
            setSubmittingOp(null);
        }
    };

    const handleCustodyUsageSubmit = async (e?: React.FormEvent, skipConfirmation: boolean = false) => {
        if (e) e.preventDefault();
        if (submittingOp) return;

        if (!custodyMaterial || !custodyAmount || !custodyPatientFile) {
            setToast({ msg: t('inv.custody.fillRequired'), type: 'error' });
            return;
        }

        const amount = parseFloat(custodyAmount);
        if (amount <= 0 || isNaN(amount)) {
            setToast({ msg: t('inv.usage.amountPositive'), type: 'error' });
            return;
        }

        const distributed = distributions.filter(d => d.material.trim() === custodyMaterial.trim() && isUserDistribution(d)).reduce((sum, d) => sum + d.amount, 0);
        const used = usages.filter(u => u.material.trim() === custodyMaterial.trim() && u.fromCustody && isUserUsage(u)).reduce((sum, u) => sum + u.amount, 0);
        const balance = distributed - used;

        if (amount > balance) {
            setToast({ msg: language === 'en' ? `❌ Error: Insufficient custody balance! Available: ${balance}` : `❌ خطأ: رصيد عهدتك غير كافٍ! المتاح بعهدتك: ${balance}`, type: 'error' });
            return;
        }

        // Check if patient file was registered before
        if (!skipConfirmation) {
            const history = await findPreviousPatientUsages(custodyPatientFile);
            if (history.length > 0) {
                setDuplicateWarningModal({
                    isOpen: true,
                    patientFileNumber: custodyPatientFile.trim(),
                    submittingType: 'custodyUsage',
                    newMaterial: custodyMaterial,
                    newAmount: amount,
                    history
                });
                return;
            }
        }

        setSubmittingOp('custodyUsage');
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

            await addDoc(collection(inventoryDb, 'usages'), {
                material: custodyMaterial,
                amount: amount,
                patientFileNumber: custodyPatientFile,
                staffName: userName,
                staffEmail: userEmail,
                staffId: userId || '',
                staffRole: userRole,
                date: tsDate,
                isCorrection: false,
                fromCustody: true,
                departmentId: selectedDepartmentId
            });

            // Prevent double submission: clear form immediately
            setCustodyMaterial('');
            setCustodyAmount('');
            setCustodyPatientFile('');
            setCustodyUsageDate(new Date().toISOString().split('T')[0]);

            setToast({ 
                msg: isOnline ? '✅ تم تسجيل استهلاك العهدة بنجاح! الرجاء عدم إعادة الضغط.' : '✅ تم حفظ الاستهلاك محلياً (ضعف إنترنت). ستتم المزامنة تلقائياً - يرجى عدم التكرار.', 
                type: 'success' 
            });
        } catch (err: any) {
            console.error('Error submitting custody usage:', err);
            if (!navigator.onLine || err?.message?.includes('network') || err?.code === 'unavailable') {
                setCustodyMaterial('');
                setCustodyAmount('');
                setCustodyPatientFile('');
                setToast({ msg: '⚠️ تم حفظ استهلاك العهدة بذاكرة المتصفح (ضعف الشبكة). سيتم رفعه تلقائياً فور توفر الاتصال - لا تقم بإعادة التسجيل.', type: 'info' });
            } else {
                setToast({ msg: 'خطأ: ' + (err.message || 'Error'), type: 'error' });
            }
        } finally {
            setSubmittingOp(null);
        }
    };

    const handleCustodyTransferSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submittingOp) return;

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

        setSubmittingOp('custodyTransfer');
        try {
            await addDoc(collection(inventoryDb, 'custody_transfers'), {
                material: transferMaterial,
                amount: amount,
                senderName: userName,
                senderEmail: userEmail || '',
                senderId: userId || '',
                recipientName: recipientUser.name,
                recipientEmail: recipientUser.email || '',
                recipientId: recipientUser.id,
                date: Timestamp.now(),
                status: 'pending',
                departmentId: selectedDepartmentId
            });

            setTransferMaterial('');
            setTransferAmount('');
            setTransferRecipient('');
            setToast({ 
                msg: isOnline 
                    ? '✅ تم إرسال طلب نقل العهدة بنجاح! بانتظار تأكيد الاستلام من الزميل - يرجى عدم إعادة الإرسال.' 
                    : '✅ تم حفظ طلب نقل العهدة محلياً (ضعف إنترنت). ستتم المزامنة تلقائياً - يرجى عدم التكرار.', 
                type: 'success' 
            });
        } catch (err: any) {
            console.error('Error transferring custody:', err);
            if (!navigator.onLine || err?.message?.includes('network') || err?.code === 'unavailable') {
                setTransferMaterial('');
                setTransferAmount('');
                setTransferRecipient('');
                setToast({ msg: '⚠️ تم حفظ طلب النقل مؤقتاً (ضعف الشبكة). سيتم إرساله تلقائياً فور توفر الاتصال.', type: 'info' });
            } else {
                setToast({ msg: 'Error transferring custody: ' + (err.message || 'Error'), type: 'error' });
            }
        } finally {
            setSubmittingOp(null);
        }
    };

    const handleConfirmTransfer = async (transfer: CustodyTransfer) => {
        if (submittingOp) return;

        // Double check sender's current balance before processing!
        const normalizedSenderEmail = transfer.senderEmail ? transfer.senderEmail.toLowerCase().trim() : '';
        const normalizedSenderName = transfer.senderName ? transfer.senderName.toLowerCase().trim() : '';
        const senderMat = transfer.material.trim();

        const senderDistributed = distributions.filter(d => {
            if (d.material.trim() !== senderMat) return false;
            const dEmail = d.staffEmail ? d.staffEmail.toLowerCase().trim() : '';
            const dName = d.staffName ? d.staffName.toLowerCase().trim() : '';
            if (dEmail && normalizedSenderEmail) {
                return dEmail === normalizedSenderEmail;
            }
            return !!(normalizedSenderName && dName === normalizedSenderName);
        }).reduce((sum, d) => sum + d.amount, 0);

        const senderUsed = usages.filter(u => {
            if (u.material.trim() !== senderMat || !u.fromCustody) return false;
            const uEmail = u.staffEmail ? u.staffEmail.toLowerCase().trim() : '';
            const uName = u.staffName ? u.staffName.toLowerCase().trim() : '';
            if (uEmail && normalizedSenderEmail) {
                return uEmail === normalizedSenderEmail;
            }
            return !!(normalizedSenderName && uName === normalizedSenderName);
        }).reduce((sum, u) => sum + u.amount, 0);

        const senderBalance = senderDistributed - senderUsed;

        if (transfer.amount > senderBalance) {
            setToast({ msg: `❌ خطأ: رصيد عهدة المرسل غير كافٍ الآن لنقلها! المتاح لديه: ${senderBalance}`, type: 'error' });
            return;
        }

        setSubmittingOp(`confirm_${transfer.id}`);
        try {
            await updateDoc(doc(inventoryDb, 'custody_transfers', transfer.id), {
                status: 'confirmed'
            });

            await addDoc(collection(inventoryDb, 'distributions'), {
                material: transfer.material,
                amount: -transfer.amount,
                staffName: transfer.senderName,
                staffEmail: transfer.senderEmail,
                staffId: (transfer as any).senderId || '',
                distributedBy: transfer.senderName,
                date: Timestamp.now(),
                departmentId: transfer.departmentId,
                isTransfer: true,
                transferPartner: transfer.recipientName,
                transferDirection: 'out'
            });

            await addDoc(collection(inventoryDb, 'distributions'), {
                material: transfer.material,
                amount: transfer.amount,
                staffName: transfer.recipientName,
                staffEmail: transfer.recipientEmail,
                staffId: transfer.recipientId || '',
                distributedBy: transfer.senderName,
                date: Timestamp.now(),
                departmentId: transfer.departmentId,
                isTransfer: true,
                transferPartner: transfer.senderName,
                transferDirection: 'in'
            });

            setToast({ msg: '✅ ' + t('inv.custody.successConfirm') + ' (تم تأكيد الاستلام بنجاح)', type: 'success' });
        } catch (err: any) {
            console.error('Error confirming custody transfer:', err);
            setToast({ msg: 'خطأ أثناء تأكيد الاستلام: ' + (err.message || 'Error'), type: 'error' });
        } finally {
            setSubmittingOp(null);
        }
    };

    const handleRejectTransfer = async (transfer: CustodyTransfer) => {
        if (submittingOp) return;
        setSubmittingOp(`reject_${transfer.id}`);
        try {
            await updateDoc(doc(inventoryDb, 'custody_transfers', transfer.id), {
                status: 'rejected'
            });
            setToast({ msg: t('inv.custody.rejected'), type: 'info' });
        } catch (err: any) {
            console.error(err);
            setToast({ msg: 'Error rejecting custody transfer', type: 'error' });
        } finally {
            setSubmittingOp(null);
        }
    };

    const handleIncomingSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (uploading || submittingOp) return;

        if (!incMaterial || !incQuantity) {
            setToast({ msg: 'يرجى تحديد المادة والكمية الواردة', type: 'error' });
            return;
        }

        setUploading(true);
        setSubmittingOp('incoming');
        try {
            const mat = materials.find(m => m.name === incMaterial);
            if (!mat) throw new Error('Material not found');

            let imageUrl = null;
            const fileToUpload = compressedPreview?.compressedFile || incImage;
            
            if (fileToUpload) {
                try {
                    const storageRef = ref(inventoryStorage, `invoices/${Date.now()}_${fileToUpload.name}`);
                    await uploadBytes(storageRef, fileToUpload);
                    imageUrl = await getDownloadURL(storageRef);
                } catch (storageErr) {
                    console.warn("Storage upload failed, falling back to dataUrl:", storageErr);
                    if (compressedPreview?.dataUrl) {
                        imageUrl = compressedPreview.dataUrl;
                    }
                }
            }

            const qty = parseFloat(incQuantity);
            await updateDoc(doc(inventoryDb, 'materials', mat.id), { quantity: mat.quantity + qty });
            await addDoc(collection(inventoryDb, 'invoices'), {
                material: incMaterial,
                quantityAdded: qty,
                date: Timestamp.now(),
                expiryDate: incExpiry || null,
                imageUrl: imageUrl,
                imageSizeKB: compressedPreview?.compressedSizeKB || (fileToUpload ? Math.round(fileToUpload.size / 1024) : null),
                createdBy: userName,
                isCorrection: false,
                departmentId: selectedDepartmentId
            });

            setIncQuantity('');
            setIncExpiry('');
            setIncImage(null);
            setCompressedPreview(null);

            setToast({ 
                msg: isOnline ? '✅ تم حفظ الفاتورة والوارد بنجاح! الرجاء عدم إعادة الإرسال.' : '✅ تم حفظ الوارد محلياً (ضعف إنترنت). ستتم المزامنة تلقائياً - يرجى عدم التكرار.', 
                type: 'success' 
            });
        } catch (err: any) {
            console.error('Error submitting incoming:', err);
            if (!navigator.onLine || err?.message?.includes('network') || err?.code === 'unavailable') {
                setIncQuantity('');
                setIncExpiry('');
                setIncImage(null);
                setCompressedPreview(null);
                setToast({ msg: '⚠️ تم حفظ الوارد محلياً بسبب بطء الشبكة. لا داعي لإعادة الإرسال.', type: 'info' });
            } else {
                setToast({ msg: 'خطأ أثناء حفظ الوارد: ' + (err.message || 'Error'), type: 'error' });
            }
        } finally {
            setUploading(false);
            setSubmittingOp(null);
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
        if (deletingUsageIds.includes(usage.id)) return;
        const confirmMsg = language === 'en'
            ? `Are you sure you want to delete this usage record?${usage.fromCustody ? ' (Removes usage from staff custody)' : ' (Restores quantity to main stock)'}`
            : `هل أنت متأكد من حذف هذا السجل؟${usage.fromCustody ? ' (سيتم إلغاء الاستهلاك من عهدة الموظف)' : ' (سيتم استرجاع الكمية فوراً للمخزن)'}`;
        if (!confirm(confirmMsg)) return;

        // 1. Mark as deleting to prevent double clicks
        setDeletingUsageIds(prev => [...prev, usage.id]);

        // 2. Optimistic UI update: Remove usage immediately from state
        setUsages(prev => prev.filter(u => u.id !== usage.id));

        // 3. Optimistically restore stock in local state if not from custody
        if (!usage.fromCustody) {
            setMaterials(prev => prev.map(m => m.name === usage.material ? { ...m, quantity: m.quantity + usage.amount } : m));
        }

        try {
            // 4. Update Firestore
            if (!usage.fromCustody) {
                const mat = materials.find(m => m.name === usage.material);
                if (mat) {
                    await updateDoc(doc(inventoryDb, 'materials', mat.id), {
                        quantity: increment(usage.amount)
                    });
                }
            }
            await deleteDoc(doc(inventoryDb, 'usages', usage.id));
            setToast({
                msg: language === 'en' ? 'Usage record deleted and stock restored' : 'تم حذف السجل واسترجاع الكمية للمخزن فوراً ✅',
                type: 'success'
            });
        } catch (e: any) {
            console.error("Delete usage error:", e);
            // Revert state if error occurs
            setUsages(prev => [usage, ...prev]);
            if (!usage.fromCustody) {
                setMaterials(prev => prev.map(m => m.name === usage.material ? { ...m, quantity: Math.max(0, m.quantity - usage.amount) } : m));
            }
            setToast({ msg: language === 'en' ? 'Failed to delete record' : 'حدث خطأ أثناء الحذف', type: 'error' });
        } finally {
            setDeletingUsageIds(prev => prev.filter(id => id !== usage.id));
        }
    };

    const handleDeleteDistribution = async (dist: MaterialDistribution) => {
        if (deletingDistIds.includes(dist.id)) return;
        const confirmMsg = language === 'en'
            ? `Are you sure you want to delete this custody distribution? (Will restore ${dist.amount} to main stock)`
            : `هل أنت متأكد من حذف حركة التوزيع هذه؟ (سيتم استرجاع ${dist.amount} علبة فوراً إلى رصيد المخزن الرئيسي)`;
        if (!confirm(confirmMsg)) return;

        // 1. Mark as deleting to prevent double clicks
        setDeletingDistIds(prev => [...prev, dist.id]);

        // 2. Optimistic UI update: Remove distribution immediately
        setDistributions(prev => prev.filter(d => d.id !== dist.id));

        // 3. Optimistically restore main stock in local state
        setMaterials(prev => prev.map(m => m.name === dist.material ? { ...m, quantity: m.quantity + dist.amount } : m));

        try {
            const mat = materials.find(m => m.name === dist.material);
            if (mat) {
                await updateDoc(doc(inventoryDb, 'materials', mat.id), {
                    quantity: increment(dist.amount)
                });
            }
            await deleteDoc(doc(inventoryDb, 'distributions', dist.id));
            setToast({
                msg: language === 'en' ? 'Distribution deleted and stock restored' : `تم حذف التوزيع واسترجاع ${dist.amount} للمخزن فوراً ✅`,
                type: 'success'
            });
        } catch (e: any) {
            console.error("Delete distribution error:", e);
            // Revert optimistic state
            setDistributions(prev => [dist, ...prev]);
            setMaterials(prev => prev.map(m => m.name === dist.material ? { ...m, quantity: Math.max(0, m.quantity - dist.amount) } : m));
            setToast({ msg: language === 'en' ? 'Failed to delete distribution' : 'حدث خطأ أثناء الحذف', type: 'error' });
        } finally {
            setDeletingDistIds(prev => prev.filter(id => id !== dist.id));
        }
    };

    const handleDeleteInvoice = async (inv: Invoice | string) => {
        const id = typeof inv === 'string' ? inv : inv.id;
        if (deletingInvoiceIds.includes(id)) return;
        if (!confirm(language === 'en' ? 'Delete this incoming invoice record?' : 'هل أنت متأكد من حذف سجل الفاتورة/الوارد هذا؟')) return;

        setDeletingInvoiceIds(prev => [...prev, id]);
        const removed = invoices.find(i => i.id === id);
        setInvoices(prev => prev.filter(i => i.id !== id));

        try {
            await deleteDoc(doc(inventoryDb, 'invoices', id));
            setToast({ msg: language === 'en' ? 'Invoice deleted' : 'تم حذف السجل بنجاح ✅', type: 'success' });
        } catch (e) {
            if (removed) setInvoices(prev => [removed, ...prev]);
            setToast({ msg: language === 'en' ? 'Error deleting invoice' : 'حدث خطأ أثناء الحذف', type: 'error' });
        } finally {
            setDeletingInvoiceIds(prev => prev.filter(itemId => itemId !== id));
        }
    };

    // --- NEW: Stock Adjustment & Manual Inventory Correction System ---
    const handleOpenStockAdjustment = (mat: Material) => {
        setAdjustingMat(mat);
        setAdjustTargetQty(mat.quantity.toString());
        setAdjustDate(new Date().toISOString().split('T')[0]);
        setAdjustNote('');
    };

    const handleConfirmStockAdjustment = async () => {
        if (!adjustingMat) return;
        const targetQty = parseFloat(adjustTargetQty);
        if (isNaN(targetQty) || targetQty < 0) {
            setToast({ msg: language === 'en' ? 'Please enter a valid quantity (>= 0)' : 'يرجى إدخال كمية صحيحة أكبر من أو تساوي 0', type: 'error' });
            return;
        }

        const oldQty = adjustingMat.quantity;
        const diff = targetQty - oldQty;

        if (diff === 0) {
            setToast({ msg: language === 'en' ? 'No change in quantity' : 'لم يتم تغيير الكمية (الرصيد مطابق)', type: 'info' });
            setAdjustingMat(null);
            return;
        }

        setIsAdjusting(true);
        try {
            let correctionTs = Timestamp.now();
            if (adjustDate) {
                const [y, mVal, dVal] = adjustDate.split('-').map(Number);
                const dateObj = new Date(y, mVal - 1, dVal);
                const now = new Date();
                const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
                if (adjustDate === todayStr) {
                    dateObj.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
                } else {
                    dateObj.setHours(12, 0, 0);
                }
                correctionTs = isNaN(dateObj.getTime()) ? Timestamp.now() : Timestamp.fromDate(dateObj);
            }

            // Optimistically update material in local state
            setMaterials(prev => prev.map(m => m.id === adjustingMat.id ? { ...m, quantity: targetQty } : m));

            // Update in Firestore
            await updateDoc(doc(inventoryDb, 'materials', adjustingMat.id), {
                quantity: targetQty
            });

            // Create Correction Ledger Record
            const noteText = adjustNote.trim() || 'Manual adjustment';
            if (diff > 0) {
                await addDoc(collection(inventoryDb, 'invoices'), {
                    material: adjustingMat.name,
                    quantityAdded: diff,
                    date: correctionTs,
                    expiryDate: null,
                    imageUrl: null,
                    createdBy: `${userName} (Correction: ${noteText})`,
                    isCorrection: true,
                    departmentId: selectedDepartmentId
                });
            } else {
                await addDoc(collection(inventoryDb, 'usages'), {
                    material: adjustingMat.name,
                    amount: Math.abs(diff),
                    patientFileNumber: `STOCK CORRECTION: ${noteText}`,
                    staffName: userName,
                    staffEmail: userEmail,
                    staffRole: userRole,
                    date: correctionTs,
                    isCorrection: true,
                    departmentId: selectedDepartmentId
                });
            }

            setToast({
                msg: language === 'en'
                    ? `Stock for "${adjustingMat.name}" corrected from ${oldQty} to ${targetQty} (${diff > 0 ? '+' : ''}${diff})`
                    : `تم تعديل وتصحيح رصيد "${adjustingMat.name}" من ${oldQty} إلى ${targetQty} (${diff > 0 ? '+' : ''}${diff}) بنجاح ✅`,
                type: 'success'
            });

            setAdjustingMat(null);
            setAdjustTargetQty('');
            setAdjustNote('');
        } catch (err: any) {
            console.error("Adjustment error:", err);
            setToast({ msg: language === 'en' ? 'Failed to update stock' : 'حدث خطأ أثناء تعديل الرصيد', type: 'error' });
        } finally {
            setIsAdjusting(false);
        }
    };

    const handleRevertCorrection = async (corr: { id: string; type: 'invoice' | 'usage'; material: string; diff: number }) => {
        const confirmMsg = language === 'en'
            ? `Revert this adjustment for "${corr.material}"? This will reverse the ${corr.diff > 0 ? '+' + corr.diff : corr.diff} quantity and delete the record.`
            : `هل أنت متأكد من التراجع عن هذا التعديل لـ "${corr.material}"؟ سيتم عكس التغيير (${corr.diff > 0 ? '+' + corr.diff : corr.diff}) وحذف سجل التصحيح.`;
        if (!confirm(confirmMsg)) return;

        try {
            // Find material
            const mat = materials.find(m => m.name === corr.material);
            if (mat) {
                const revertedQty = Math.max(0, mat.quantity - corr.diff);
                setMaterials(prev => prev.map(m => m.id === mat.id ? { ...m, quantity: revertedQty } : m));
                await updateDoc(doc(inventoryDb, 'materials', mat.id), {
                    quantity: revertedQty
                });
            }

            if (corr.type === 'invoice') {
                setInvoices(prev => prev.filter(inv => inv.id !== corr.id));
                await deleteDoc(doc(inventoryDb, 'invoices', corr.id));
            } else {
                setUsages(prev => prev.filter(u => u.id !== corr.id));
                await deleteDoc(doc(inventoryDb, 'usages', corr.id));
            }

            setToast({
                msg: language === 'en' ? 'Correction reverted successfully' : 'تم التراجع عن حركة التصحيح واسترجاع الرصيد بنجاح ✅',
                type: 'success'
            });
        } catch (err) {
            console.error(err);
            setToast({ msg: language === 'en' ? 'Failed to revert correction' : 'حدث خطأ أثناء التراجع', type: 'error' });
        }
    };

    // Corrections list extracted from both invoices and usages
    const stockCorrections = useMemo(() => {
        const list: Array<{
            id: string;
            type: 'invoice' | 'usage';
            material: string;
            diff: number;
            date: any;
            author: string;
            note: string;
        }> = [];

        invoices.forEach(inv => {
            if ((inv as any).isCorrection) {
                let note = '';
                if (inv.createdBy && inv.createdBy.includes('Correction:')) {
                    note = inv.createdBy.split('Correction:')[1]?.replace(')', '')?.trim() || '';
                }
                list.push({
                    id: inv.id,
                    type: 'invoice',
                    material: inv.material,
                    diff: inv.quantityAdded,
                    date: inv.date,
                    author: inv.createdBy?.replace(/\(Correction.*?\)/, '').trim() || 'System',
                    note: note || (language === 'en' ? 'Stock addition correction' : 'تصحيح إضافة رصيد')
                });
            }
        });

        usages.forEach(u => {
            if ((u as any).isCorrection || (u.patientFileNumber && u.patientFileNumber.startsWith('STOCK CORRECTION'))) {
                let note = '';
                if (u.patientFileNumber && u.patientFileNumber.includes(':')) {
                    note = u.patientFileNumber.split(':')[1]?.trim() || '';
                }
                list.push({
                    id: u.id,
                    type: 'usage',
                    material: u.material,
                    diff: -u.amount,
                    date: u.date,
                    author: u.staffName || 'System',
                    note: note || (language === 'en' ? 'Stock deduction correction' : 'تصحيح خصم رصيد')
                });
            }
        });

        return list.sort((a, b) => {
            const da = a.date?.toDate ? a.date.toDate().getTime() : (a.date?.seconds || 0) * 1000;
            const db = b.date?.toDate ? b.date.toDate().getTime() : (b.date?.seconds || 0) * 1000;
            return db - da;
        });
    }, [invoices, usages, language]);

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

    const handleExportCSV = () => {
        let csv = '\uFEFF';
        csv += `تقرير حركة ومخزون المواد والصبغات الطبية - مستشفى الجدعاني\n`;
        csv += `القسم:,"${currentDeptName}"\n`;
        csv += `الفترة:,"${reportFilter === 'range' ? `${reportStart} إلى ${reportEnd}` : 'جميع السجلات'}"\n`;
        csv += `تاريخ التصدير:,"${new Date().toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US')}"\n`;
        csv += `المشرف المستخرج:,"${userName || 'المشرف'}"\n\n`;

        // 1. Materials Summary
        csv += `=== كشف أرصدة وجرد المواد والصبغات ===\n`;
        csv += `م,اسم المادة,الرصيد الافتتاحي,الوارد (+),المنصرف (-),العهد النشطة,صافي الرصيد المتبقي,حالة المخزون\n`;
        materialStats.forEach(([matName, stat], idx) => {
            const totalCustody = Object.values(staffBalances)
                .reduce((sum, d) => sum + (d.materials[matName.trim()] || 0), 0);
            const status = stat.endBalance <= 10 ? 'رصيد منخفض' : 'متوفر';
            csv += `${idx + 1},"${matName}",${stat.startBalance},${stat.periodIn},${stat.periodOut},${totalCustody},${stat.endBalance},"${status}"\n`;
        });

        // 2. Transaction Logs
        csv += `\n=== سجل تفاصيل العمليات والحركات ===\n`;
        csv += `م,التاريخ,المادة,الكمية,الموظف,رقم ملف المريض,نوع الحركة\n`;
        filteredUsages.forEach((u, idx) => {
            const dateStr = u.date?.toDate ? u.date.toDate().toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US') : 'N/A';
            const src = u.fromCustody ? 'عهدة شخصية' : 'مخزن رئيسي';
            csv += `${idx + 1},"${dateStr}","${u.material}",-${u.amount},"${u.staffName || ''}","${u.patientFileNumber || ''}","${src}"\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `تقرير_المخزون_${currentDeptName.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };


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
                    {/* 1. نظرة عامة (Overview) - للجميع (المشرف، الأدمن، المدير، والموظف العادي) */}
                    <button 
                        onClick={() => setActiveTab('dashboard')} 
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'dashboard' ? 'bg-slate-800 text-white shadow-lg shadow-slate-300' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        <i className="fas fa-th-large w-5"></i>
                        <span className="font-bold text-sm">{t('inv.dashboard')}</span>
                    </button>

                    {/* 2. عهدتي (My Custody) - للجميع (المشرف، الأدمن، المدير، والموظف العادي) */}
                    <button 
                        onClick={() => setActiveTab('custody')} 
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'custody' ? 'bg-teal-600 text-white shadow-lg shadow-teal-300' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        <i className="fas fa-box-open w-5"></i>
                        <span className="font-bold text-sm">{t('inv.custody')}</span>
                    </button>

                    {/* 3. صرف مواد (Usage) - للمشرف والأدمن والمدير فقط */}
                    {canManageInventory && (
                        <button 
                            onClick={() => setActiveTab('usage')} 
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'usage' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-300' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                            <i className="fas fa-hand-holding-medical w-5"></i>
                            <span className="font-bold text-sm">{t('inv.usage')}</span>
                        </button>
                    )}

                    {/* 4. توزيع العهد (Distribution) - للمشرف والأدمن والمدير، وللموظف العادي إذا تم تفعيل التوزيع له */}
                    {(canManageInventory || canDistribute) && (
                        <button 
                            onClick={() => setActiveTab('distribution')} 
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'distribution' ? 'bg-orange-600 text-white shadow-lg shadow-orange-300' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                            <i className="fas fa-share-square w-5"></i>
                            <span className="font-bold text-sm">{t('inv.distribution')}</span>
                        </button>
                    )}

                    {/* 5. التقارير (Reports) - للمشرف والأدمن والمدير فقط */}
                    {canManageInventory && (
                        <button 
                            onClick={() => setActiveTab('reports')} 
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'reports' ? 'bg-purple-600 text-white shadow-lg shadow-purple-300' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                            <i className="fas fa-chart-bar w-5"></i>
                            <span className="font-bold text-sm">{t('inv.reports')}</span>
                        </button>
                    )}

                    {/* 6. وارد جديد (Incoming) - للمشرف والأدمن والمدير فقط */}
                    {canManageInventory && (
                        <button 
                            onClick={() => setActiveTab('incoming')} 
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'incoming' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-300' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                            <i className="fas fa-truck-loading w-5"></i>
                            <span className="font-bold text-sm">{t('inv.incoming')}</span>
                        </button>
                    )}

                    {/* 7. إدارة المواد (Materials) - للمشرف والأدمن والمدير فقط */}
                    {canManageInventory && (
                        <button 
                            onClick={() => setActiveTab('materials')} 
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'materials' ? 'bg-blue-600 text-white shadow-lg shadow-blue-300' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                            <i className="fas fa-cubes w-5"></i>
                            <span className="font-bold text-sm">{t('inv.materials')}</span>
                        </button>
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
                
                {/* Offline / Slow Connection Notice */}
                {!isOnline && (
                    <div className="mb-6 bg-amber-500 text-white px-5 py-3.5 rounded-2xl text-xs sm:text-sm font-bold flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg shadow-amber-200 animate-pulse">
                        <div className="flex items-center gap-3">
                            <i className="fas fa-wifi-slash text-lg"></i>
                            <div>
                                <p className="font-extrabold">تنبيه: أنت غير متصل بالإنترنت حالياً (أو الاتصال ضعيف)</p>
                                <p className="text-xs text-amber-100 font-normal">يمكنك مواصلة العمل؛ سيتم حفظ العمليات محلياً ومزامنتها تلقائياً عند استقرار الشبكة. يرجى عدم تكرار الضغط على زر التسجيل.</p>
                            </div>
                        </div>
                        <span className="bg-white/25 px-3 py-1 rounded-lg text-xs font-mono shrink-0">وضع عدم الاتصال</span>
                    </div>
                )}

                {/* Mobile Navigation */}
                <div className="lg:hidden flex overflow-x-auto gap-2 mb-6 pb-2 no-scrollbar print:hidden">
                    {(canManageInventory 
                        ? ['dashboard', 'custody', 'usage', 'distribution', 'reports', 'incoming', 'materials'] 
                        : (canDistribute
                            ? ['dashboard', 'custody', 'distribution']
                            : ['dashboard', 'custody'])
                    ).map(tab => (
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

                        {/* EMPLOYEE PERSONAL CUSTODY SUMMARY WIDGET */}
                        {userRole !== 'custody_clerk' && (
                            <div className="bg-gradient-to-br from-teal-700 via-teal-800 to-slate-900 rounded-[2rem] p-6 text-white shadow-xl shadow-teal-900/20 relative overflow-hidden">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-teal-600/50 pb-4 mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-teal-300 text-xl font-black">
                                            <i className="fas fa-box-open"></i>
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-black flex items-center gap-2">
                                                <span>{language === 'en' ? 'Available Personal Custody Balance' : 'رصيد عهدتك الشخصية المتاحة'}</span>
                                                <span className="text-xs bg-teal-500/40 text-teal-200 px-2.5 py-0.5 rounded-full font-bold">
                                                    {userName}
                                                </span>
                                            </h3>
                                            <p className="text-xs text-teal-200 mt-0.5">
                                                {language === 'en' ? 'Materials and contrast registered in your custody by distribution supervisor' : 'المواد والصبغات المسجلة بعهدتك من مسئول التوزيع'}
                                            </p>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => setActiveTab('custody')}
                                        className="bg-teal-500 hover:bg-teal-400 text-white px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-md self-end sm:self-auto"
                                    >
                                        <i className="fas fa-notes-medical"></i>
                                        <span>{language === 'en' ? 'Record Custody Usage' : 'تسجيل استهلاك عهدة'}</span>
                                    </button>
                                </div>

                                {userCustodyList.length === 0 ? (
                                    <div className="py-4 text-center text-teal-200 text-xs bg-teal-900/30 rounded-xl border border-teal-600/30">
                                        <i className="fas fa-info-circle ml-1 mr-1"></i>
                                        {language === 'en' ? 'No custody currently registered under your name, or your full balance has been consumed.' : 'لا توجد عهدة مسجلة باسمك حالياً، أو تم استهلاك كامل الرصيد المسلم لك.'}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                        {userCustodyList.map((item, idx) => (
                                            <div key={idx} className="bg-white/10 backdrop-blur-md p-3.5 rounded-xl border border-white/15 flex flex-col justify-between gap-2">
                                                <div className="flex justify-between items-start">
                                                    <span className="font-extrabold text-sm text-white truncate" title={item.material}>{item.material}</span>
                                                    <span className={`text-xs px-2 py-0.5 rounded font-black ${item.balance > 0 ? 'bg-emerald-500 text-white' : 'bg-white/20 text-slate-200'}`}>
                                                        {item.balance} {language === 'en' ? 'Available' : 'متاح'}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between text-[11px] text-teal-200/90 pt-1 border-t border-white/10 font-medium">
                                                    <span>{language === 'en' ? 'Received: ' : 'استلمت: '}<strong className="text-white font-black">{item.distributed}</strong></span>
                                                    <span>{language === 'en' ? 'Used: ' : 'صرفت: '}<strong className="text-white font-black">{item.used}</strong></span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* NEGATIVE STOCK ALERT */}
                        {stats.negativeStock > 0 && (
                            <div className="bg-red-100 border-l-4 border-red-500 text-red-800 p-4 rounded-xl shadow-md mb-6 animate-pulse">
                                <div className="flex items-center gap-3">
                                    <i className="fas fa-exclamation-circle text-2xl"></i>
                                    <div>
                                        <h3 className="font-bold text-lg">{language === 'en' ? 'Supervisor Stock Alert' : 'تحذير هام للمشرف'}</h3>
                                        <p className="text-sm font-bold">
                                            {language === 'en' 
                                                ? `There are ${stats.negativeStock} items with negative balance (usage exceeded stock!). Please correct balances immediately.` 
                                                : `يوجد ${stats.negativeStock} مواد برصيد سالب (الاستهلاك تجاوز المخزون!). يرجى تصحيح الأرصدة فوراً.`}
                                        </p>
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
                {canManageInventory && activeTab === 'usage' && (
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
                                            <div className="flex items-center justify-between">
                                                <label className="text-sm font-bold text-slate-600">{t('inv.usage.file')}</label>
                                                {mainFileMatches.length > 0 && (
                                                    <span className="text-[11px] font-extrabold text-amber-800 bg-amber-100/90 border border-amber-200 px-2 py-0.5 rounded-lg flex items-center gap-1">
                                                        <i className="fas fa-exclamation-triangle text-amber-600"></i>
                                                        <span>{t('inv.duplicate.badge')} ({mainFileMatches.length})</span>
                                                        {language === 'ar' && <span className="text-[9px] text-amber-700/80 font-normal">(Recorded)</span>}
                                                    </span>
                                                )}
                                            </div>
                                            <input 
                                                type="text" 
                                                className={`w-full bg-slate-50 border rounded-xl p-4 font-bold outline-none focus:ring-2 transition-all ${
                                                    mainFileMatches.length > 0 
                                                        ? 'border-amber-400 bg-amber-50/25 focus:ring-amber-200 text-amber-950' 
                                                        : 'border-slate-200 focus:ring-indigo-200 text-slate-800'
                                                }`} 
                                                value={patientFileNumber} 
                                                onChange={e => setPatientFileNumber(e.target.value)} 
                                                placeholder="File No." 
                                            />
                                        </div>
                                        {canManageInventory && (
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
                                    <button 
                                        type="submit" 
                                        disabled={submittingOp === 'mainUsage'}
                                        className={`w-full bg-indigo-600 text-white py-4 rounded-xl font-bold text-lg shadow-xl shadow-indigo-300 transition-all ${
                                            submittingOp === 'mainUsage' 
                                                ? 'opacity-60 cursor-not-allowed' 
                                                : 'hover:bg-indigo-700 hover:scale-[1.02] active:scale-95'
                                        }`}
                                    >
                                        {submittingOp === 'mainUsage' ? (
                                            <span className="flex items-center justify-center gap-2">
                                                <i className="fas fa-spinner fa-spin"></i> {language === 'en' ? 'Recording dispense...' : 'جاري تسجيل الصرف...'}
                                            </span>
                                        ) : (
                                            t('inv.usage.confirm')
                                        )}
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

                {/* --- DISTRIBUTION TAB (ADMIN / CUSTODY CLERK / ASSIGNED EMPLOYEES) --- */}
                {canDistribute && activeTab === 'distribution' && (
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
                                                            setDistStaffId(emp?.id || '');
                                                        }}
                                                    >
                                                        <option value="">{language === 'en' ? 'Select Employee...' : 'اختر الموظف...'}</option>
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
                                        <button 
                                            type="submit" 
                                            disabled={submittingOp === 'distribution'}
                                            className={`w-full bg-orange-600 text-white py-4 rounded-xl font-bold text-lg shadow-xl shadow-orange-300 transition-all ${
                                                submittingOp === 'distribution' 
                                                    ? 'opacity-60 cursor-not-allowed' 
                                                    : 'hover:bg-orange-700 hover:scale-[1.02] active:scale-95'
                                            }`}
                                        >
                                            {submittingOp === 'distribution' ? (
                                                <span className="flex items-center justify-center gap-2">
                                                    <i className="fas fa-spinner fa-spin"></i> {language === 'en' ? 'Recording custody distribution...' : 'جاري تسجيل توزيع العهدة...'}
                                                </span>
                                            ) : (
                                                t('inv.dist.confirm')
                                            )}
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
                                                                <span>{language === 'en' ? 'Recipient: ' : 'المستلم: '}<strong className="text-slate-700">{d.staffName}</strong></span>
                                                            </div>
                                                            {d.distributedBy && (
                                                                <div className="flex items-center gap-1.5 truncate">
                                                                    <i className="fas fa-user-shield text-slate-300 text-[9px]"></i> 
                                                                    <span>{language === 'en' ? 'By: ' : 'بواسطة: '}<strong className="text-slate-700">{d.distributedBy}</strong></span>
                                                                </div>
                                                            )}
                                                            {d.isTransfer && (
                                                                <div className="mt-1">
                                                                    <span className="inline-block text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-bold">
                                                                        {d.amount < 0 
                                                                            ? (language === 'en' ? `Transferred custody to: ${d.transferPartner}` : `نقل عهدة إلى: ${d.transferPartner}`) 
                                                                            : (language === 'en' ? `Received custody from: ${d.transferPartner}` : `استلام عهدة من: ${d.transferPartner}`)}
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
                                                        <button 
                                                            disabled={deletingDistIds.includes(d.id)}
                                                            onClick={() => handleDeleteDistribution(d)} 
                                                            className="text-red-400 hover:text-red-600 text-xs mt-1 p-1 rounded hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed" 
                                                            title={language === 'en' ? 'Delete & Restore Stock' : 'حذف واسترجاع للمخزن'}
                                                        >
                                                            {deletingDistIds.includes(d.id) ? (
                                                                <i className="fas fa-spinner fa-spin text-red-500"></i>
                                                            ) : (
                                                                <i className="fas fa-trash-alt"></i>
                                                            )}
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
                                            {custodySubTab === 'use' 
                                                ? t('inv.custody.use') 
                                                : (language === 'en' ? 'Transfer Custody to Colleague' : 'نقل عهدة لزميل')}
                                        </h2>
                                        <p className="text-slate-400 text-sm">
                                            {custodySubTab === 'use' 
                                                ? (language === 'en' ? 'Record usage from your personal custody' : 'تسجيل صرف من عهدتك الشخصية') 
                                                : (language === 'en' ? 'Transfer balance from your current custody to another employee (Shift Handover)' : 'نقل رصيد من عهدتك الحالية إلى موظف آخر بالقسم (تسليم وردية)')}
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
                                        {language === 'en' ? 'Record Custody Usage' : 'تسجيل استهلاك العهدة'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCustodySubTab('transfer')}
                                        className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${custodySubTab === 'transfer' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                                    >
                                        <i className="fas fa-exchange-alt mr-1 ml-1"></i>
                                        {language === 'en' ? 'Transfer Custody to Colleague' : 'نقل العهدة لزميل'}
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
                                                <div className="flex items-center justify-between">
                                                    <label className="text-sm font-bold text-slate-600">{t('inv.usage.file')}</label>
                                                    {custodyFileMatches.length > 0 && (
                                                        <span className="text-[11px] font-extrabold text-amber-800 bg-amber-100/90 border border-amber-200 px-2 py-0.5 rounded-lg flex items-center gap-1">
                                                            <i className="fas fa-exclamation-triangle text-amber-600"></i>
                                                            <span>{t('inv.duplicate.badge')} ({custodyFileMatches.length})</span>
                                                            {language === 'ar' && <span className="text-[9px] text-amber-700/80 font-normal">(Recorded)</span>}
                                                        </span>
                                                    )}
                                                </div>
                                                <input 
                                                    type="text" 
                                                    className={`w-full bg-slate-50 border rounded-xl p-4 font-bold outline-none focus:ring-2 transition-all ${
                                                        custodyFileMatches.length > 0 
                                                            ? 'border-amber-400 bg-amber-50/25 focus:ring-amber-200 text-amber-950' 
                                                            : 'border-slate-200 focus:ring-teal-200 text-slate-800'
                                                    }`} 
                                                    value={custodyPatientFile} 
                                                    onChange={e => setCustodyPatientFile(e.target.value)} 
                                                    placeholder="File No." 
                                                />
                                            </div>
                                            <div className="space-y-2 col-span-2">
                                                <label className="text-sm font-bold text-slate-600">{t('inv.usage.date')}</label>
                                                <input type="date" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 font-bold outline-none focus:ring-2 focus:ring-teal-200" value={custodyUsageDate} onChange={e => setCustodyUsageDate(e.target.value)} />
                                            </div>
                                        </div>
                                        <button 
                                            type="submit" 
                                            disabled={submittingOp === 'custodyUsage'}
                                            className={`w-full bg-teal-600 text-white py-4 rounded-xl font-bold text-lg shadow-xl shadow-teal-300 transition-all ${
                                                submittingOp === 'custodyUsage' 
                                                    ? 'opacity-60 cursor-not-allowed' 
                                                    : 'hover:bg-teal-700 hover:scale-[1.02] active:scale-95'
                                            }`}
                                        >
                                            {submittingOp === 'custodyUsage' ? (
                                                <span className="flex items-center justify-center gap-2">
                                                    <i className="fas fa-spinner fa-spin"></i> {language === 'en' ? 'Recording custody usage...' : 'جاري تسجيل استهلاك العهدة...'}
                                                </span>
                                            ) : (
                                                t('inv.usage.confirm')
                                            )}
                                        </button>
                                    </form>
                                ) : (
                                    <form onSubmit={handleCustodyTransferSubmit} className="space-y-6">
                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-slate-600">{language === 'en' ? 'Material' : 'المادة (Material)'}</label>
                                            <div className="relative">
                                                <select
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 rtl:pr-10 ltr:pl-4 outline-none focus:ring-2 focus:ring-teal-200 font-bold text-slate-700 appearance-none"
                                                    value={transferMaterial}
                                                    onChange={e => setTransferMaterial(e.target.value)}
                                                >
                                                    <option value="">{language === 'en' ? 'Select material to transfer...' : 'اختر المادة لنقلها...'}</option>
                                                    {materials.map(m => {
                                                        const distributed = distributions.filter(d => d.material.trim() === m.name.trim() && isUserDistribution(d)).reduce((sum, d) => sum + d.amount, 0);
                                                        const used = usages.filter(u => u.material.trim() === m.name.trim() && u.fromCustody && isUserUsage(u)).reduce((sum, u) => sum + u.amount, 0);
                                                        const balance = distributed - used;
                                                        if (balance <= 0) return null;
                                                        return (
                                                            <option key={m.id} value={m.name}>
                                                                {m.name} ({language === 'en' ? 'Available:' : 'المتاح:'} {balance})
                                                            </option>
                                                        );
                                                    })}
                                                </select>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2 col-span-2">
                                                <label className="text-sm font-bold text-slate-600">{language === 'en' ? 'Amount to Transfer' : 'الكمية المراد نقلها (Amount to transfer)'}</label>
                                                <input type="number" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 font-bold outline-none focus:ring-2 focus:ring-teal-200" value={transferAmount} onChange={e => setTransferAmount(e.target.value)} placeholder="0" />
                                            </div>
                                            <div className="space-y-2 col-span-2">
                                                <label className="text-sm font-bold text-slate-600">{language === 'en' ? 'Recipient Employee' : 'الموظف المستلم (Recipient Employee)'}</label>
                                                <select
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 outline-none focus:ring-2 focus:ring-teal-200 font-bold text-slate-700 appearance-none"
                                                    value={transferRecipient}
                                                    onChange={e => setTransferRecipient(e.target.value)}
                                                >
                                                    <option value="">{language === 'en' ? 'Select recipient employee...' : 'اختر الموظف المستلم...'}</option>
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
                                        <button 
                                            type="submit" 
                                            disabled={submittingOp === 'custodyTransfer'}
                                            className={`w-full bg-teal-600 text-white py-4 rounded-xl font-bold text-lg shadow-xl shadow-teal-300 transition-all ${
                                                submittingOp === 'custodyTransfer' 
                                                    ? 'opacity-60 cursor-not-allowed' 
                                                    : 'hover:bg-teal-700 hover:scale-[1.02] active:scale-95'
                                            }`}
                                        >
                                            {submittingOp === 'custodyTransfer' ? (
                                                <span className="flex items-center justify-center gap-2">
                                                    <i className="fas fa-spinner fa-spin"></i> {language === 'en' ? 'Sending transfer request...' : 'جاري إرسال طلب النقل...'}
                                                </span>
                                            ) : (
                                                language === 'en' ? 'Confirm Custody Transfer' : 'تأكيد نقل العهدة'
                                            )}
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
                                        {language === 'en' ? 'Your Recent Contrast Records (Custody Usage)' : 'أحدث تسجيلاتك للصبغة (استهلاك العهدة)'}
                                    </h3>
                                    
                                    {usages.filter(isUserUsage).length === 0 ? (
                                        <p className="text-sm text-slate-400 text-center py-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                            {language === 'en' ? 'No previous usage records for you yet' : 'لا توجد تسجيلات استهلاك سابقة لك بعد'}
                                        </p>
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
                                                                            <span>{language === 'en' ? 'File: ' : 'ملف: '}</span>
                                                                            <strong className="text-slate-700">{u.patientFileNumber}</strong>
                                                                        </span>
                                                                    )}
                                                                    <span className="text-slate-400 font-mono">
                                                                        {d.toLocaleDateString(language === 'en' ? 'en-US' : 'ar-EG', { day: 'numeric', month: 'short', year: 'numeric' })} - {d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
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
                                                    {language === 'en' ? `Received: ${distributed} | Used: ${used}` : `المستلم: ${distributed} | المنصرف: ${used}`}
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
                {canManageInventory && (activeTab === 'materials' || activeTab === 'incoming') && (
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
                                        {/* File Upload with High-Efficiency Smart Compression */}
                                        <div className="border-2 border-dashed border-emerald-200 bg-emerald-50/40 rounded-2xl p-6 text-center hover:bg-emerald-50 hover:border-emerald-400 transition-all relative group">
                                            {!compressedPreview && !isCompressing && (
                                                <>
                                                    <input 
                                                        type="file" 
                                                        accept="image/*" 
                                                        className="absolute inset-0 opacity-0 cursor-pointer z-10" 
                                                        onChange={handleInvoiceImageSelect} 
                                                    />
                                                    <div className="flex flex-col items-center justify-center pointer-events-none">
                                                        <div className="w-14 h-14 rounded-2xl bg-white shadow-sm border border-emerald-100 flex items-center justify-center text-emerald-600 text-2xl mb-3 group-hover:scale-110 transition-transform">
                                                            <i className="fas fa-file-invoice-dollar"></i>
                                                        </div>
                                                        <p className="font-black text-slate-700 text-sm">{t('inv.inc.upload') || 'اضغط أو اسحب صورة الفاتورة للرفع'}</p>
                                                        <p className="text-xs text-slate-500 mt-1 font-medium flex items-center gap-1">
                                                            <i className="fas fa-compress-arrows-alt text-emerald-500"></i>
                                                            {dir === 'rtl' ? 'ضغط تلقائي فائق لتحمل عدد كبير من الفواتير' : 'Auto-compressed to save 90%+ storage'}
                                                        </p>
                                                    </div>
                                                </>
                                            )}

                                            {isCompressing && (
                                                <div className="py-6 flex flex-col items-center justify-center">
                                                    <i className="fas fa-spinner fa-spin text-3xl text-emerald-600 mb-3"></i>
                                                    <p className="font-bold text-slate-700 text-sm">
                                                        {dir === 'rtl' ? 'جاري ضغط وتحسين صورة الفاتورة...' : 'Compressing invoice image...'}
                                                    </p>
                                                </div>
                                            )}

                                            {compressedPreview && !isCompressing && (
                                                <div className="relative flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border border-emerald-100 shadow-sm">
                                                    <div className="flex items-center gap-4 w-full md:w-auto">
                                                        <img 
                                                            src={compressedPreview.dataUrl} 
                                                            alt="Compressed Preview" 
                                                            className="w-16 h-16 object-cover rounded-xl border border-slate-200 shadow-xs cursor-pointer"
                                                            onClick={() => window.open(compressedPreview.dataUrl, '_blank')}
                                                        />
                                                        <div className="text-right">
                                                            <p className="font-bold text-slate-800 text-sm truncate max-w-[200px]">
                                                                {compressedPreview.compressedFile.name}
                                                            </p>
                                                            <div className="flex flex-wrap items-center gap-2 mt-1">
                                                                <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-mono">
                                                                    {compressedPreview.originalSizeKB} KB &rarr; <strong className="text-emerald-700">{compressedPreview.compressedSizeKB} KB</strong>
                                                                </span>
                                                                <span className="text-[11px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                                                                    <i className="fas fa-bolt text-amber-500"></i>
                                                                    {dir === 'rtl' ? `توفير ${compressedPreview.ratio}%` : `Saved ${compressedPreview.ratio}%`}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    
                                                    <button 
                                                        type="button" 
                                                        onClick={() => {
                                                            setIncImage(null);
                                                            setCompressedPreview(null);
                                                        }}
                                                        className="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                                                    >
                                                        <i className="fas fa-times"></i>
                                                        {dir === 'rtl' ? 'إلغاء / تغيير' : 'Change'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        <button 
                                            type="submit"
                                            disabled={uploading || isCompressing || submittingOp === 'incoming'} 
                                            className="w-full bg-emerald-600 text-white py-4 rounded-xl font-bold shadow-lg shadow-emerald-200 hover:bg-emerald-700 hover:scale-[1.01] transition-all active:scale-95 disabled:opacity-70 disabled:scale-100"
                                        >
                                            {(uploading || submittingOp === 'incoming') ? (
                                                <span className="flex items-center justify-center gap-2">
                                                    <i className="fas fa-spinner fa-spin"></i> جاري تسجيل الوارد...
                                                </span>
                                            ) : (
                                                t('inv.inc.btn')
                                            )}
                                        </button>
                                    </form>
                                </div>

                                {/* Bottom: Invoice History Grid */}
                                <div>
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 px-2">
                                        <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                                            <i className="fas fa-history text-slate-400"></i> {t('inv.recent')}
                                            <span className="text-xs bg-slate-200 text-slate-600 px-2.5 py-1 rounded-full font-mono">{displayedInvoices.length}</span>
                                        </h3>
                                        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                                            {canManageInventory && (
                                                <button 
                                                    onClick={() => setIsPurgeModalOpen(true)} 
                                                    className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 px-3.5 py-2 rounded-xl font-bold transition-all shadow-xs flex items-center gap-1.5"
                                                    title={dir === 'rtl' ? 'مسح صور الفواتير لتوفير المساحة مع الاحتفاظ بالسجلات والأعداد' : 'Purge images to free storage'}
                                                >
                                                    <i className="fas fa-broom text-amber-600"></i>
                                                    <span>{dir === 'rtl' ? 'تنظيف صور الفواتير (تفريغ مساحة)' : 'Clean Invoice Images'}</span>
                                                </button>
                                            )}
                                            <input 
                                                type="month" 
                                                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-600 outline-none focus:ring-2 focus:ring-emerald-200 shadow-xs"
                                                value={incomingViewMonth}
                                                onChange={e => setIncomingViewMonth(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                        {displayedInvoices.map(inv => (
                                            <div key={inv.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all group flex flex-col relative">
                                                {canManageInventory && (
                                                    <button 
                                                        onClick={() => handleDeleteInvoice(inv.id)}
                                                        className="absolute top-2 left-2 z-20 text-red-400 hover:text-red-600 bg-white/80 p-1.5 rounded-full hover:bg-white shadow-sm opacity-0 group-hover:opacity-100 transition-all"
                                                        title="Delete Invoice Record"
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
                                                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-slate-100/70 p-4 text-center">
                                                            {inv.imagePurged ? (
                                                                <>
                                                                    <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-lg mb-2">
                                                                        <i className="fas fa-shield-alt"></i>
                                                                    </div>
                                                                    <span className="text-[11px] font-bold text-amber-800">
                                                                        {dir === 'rtl' ? 'تم تفريغ الصورة لتوفير المساحة' : 'Image Purged (Space Saved)'}
                                                                    </span>
                                                                    <span className="text-[10px] text-slate-500 font-medium mt-0.5">
                                                                        {dir === 'rtl' ? 'البيانات والكميات محفوظة بالكامل' : 'Record & stock preserved'}
                                                                    </span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <i className="fas fa-file-invoice text-3xl mb-2 text-slate-300"></i>
                                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">بدون مرفق صورة</span>
                                                                </>
                                                            )}
                                                        </div>
                                                    )}
                                                    {/* Date Badge */}
                                                    <div className="absolute top-3 right-3 bg-white/95 backdrop-blur-sm text-slate-800 text-[10px] font-bold px-2 py-1 rounded-lg shadow-sm border border-slate-100">
                                                        {inv.date?.toDate ? inv.date.toDate().toLocaleDateString(dir === 'rtl' ? 'ar-EG' : 'en-US') : 'N/A'}
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

                                {/* Date-Range Invoice Image Purge Modal */}
                                {isPurgeModalOpen && (
                                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
                                        <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 relative overflow-hidden animate-scale-up">
                                            <div className="flex justify-between items-center mb-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center text-xl">
                                                        <i className="fas fa-broom"></i>
                                                    </div>
                                                    <div>
                                                        <h3 className="text-lg font-black text-slate-800">
                                                            {dir === 'rtl' ? 'تفريغ صور الفواتير لتوفير المساحة' : 'Purge Invoice Images'}
                                                        </h3>
                                                        <p className="text-xs text-slate-500">
                                                            {dir === 'rtl' ? 'مسح الصور فقط مع الحفاظ التام على السجلات والكميات' : 'Preserves all records & quantities'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <button 
                                                    onClick={() => setIsPurgeModalOpen(false)}
                                                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
                                                >
                                                    <i className="fas fa-times"></i>
                                                </button>
                                            </div>

                                            {/* Safety Notice Box */}
                                            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-5 text-xs text-emerald-800 leading-relaxed font-medium">
                                                <div className="flex items-center gap-2 font-bold text-emerald-900 mb-1">
                                                    <i className="fas fa-shield-alt text-emerald-600 text-sm"></i>
                                                    <span>{dir === 'rtl' ? 'ضمان سلامة المخزون والسجلات' : 'Stock & Ledger Protection'}</span>
                                                </div>
                                                {dir === 'rtl' 
                                                    ? 'هذا الإجراء سيقوم بحذف ملفات وصور الفواتير فقط لتفريغ مساحة التخزين (Storage). ستبقى جميع الفواتير، الأعداد، التواريخ، الأصناف، وتاريخ الإدخال مسجلة ومحفوظة بالكامل دون أي تعديل على أرصدة المخزون.' 
                                                    : 'This will only purge heavy image files from cloud storage. All ledger entries, counts, dates, and stock balances remain 100% intact.'}
                                            </div>

                                            {/* Period Selection */}
                                            <div className="space-y-4 mb-6">
                                                <label className="block text-xs font-bold text-slate-600 uppercase">
                                                    {dir === 'rtl' ? 'اختر الفترة الزمنية المستهدفة:' : 'Select Target Duration:'}
                                                </label>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {[
                                                        { id: '1month', label: dir === 'rtl' ? 'أقدم من شهر' : 'Older than 1 mo' },
                                                        { id: '3months', label: dir === 'rtl' ? 'أقدم من 3 أشهر' : 'Older than 3 mos' },
                                                        { id: '6months', label: dir === 'rtl' ? 'أقدم من 6 أشهر' : 'Older than 6 mos' },
                                                        { id: '1year', label: dir === 'rtl' ? 'أقدم من سنة' : 'Older than 1 yr' },
                                                        { id: 'custom', label: dir === 'rtl' ? 'فترة مخصصة' : 'Custom range' },
                                                        { id: 'all', label: dir === 'rtl' ? 'كافة الصور' : 'All invoice images' },
                                                    ].map(p => (
                                                        <button
                                                            key={p.id}
                                                            type="button"
                                                            onClick={() => setPurgePeriod(p.id as any)}
                                                            className={`p-3 rounded-xl text-xs font-bold border transition-all text-center ${
                                                                purgePeriod === p.id 
                                                                    ? 'bg-amber-600 text-white border-amber-600 shadow-md shadow-amber-200' 
                                                                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                                                            }`}
                                                        >
                                                            {p.label}
                                                        </button>
                                                    ))}
                                                </div>

                                                {/* Custom Date Inputs if 'custom' is selected */}
                                                {purgePeriod === 'custom' && (
                                                    <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200 animate-fade-in">
                                                        <div>
                                                            <label className="block text-[11px] font-bold text-slate-500 mb-1">
                                                                {dir === 'rtl' ? 'من تاريخ:' : 'From Date:'}
                                                            </label>
                                                            <input 
                                                                type="date"
                                                                value={purgeFromDate}
                                                                onChange={e => setPurgeFromDate(e.target.value)}
                                                                className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-200"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[11px] font-bold text-slate-500 mb-1">
                                                                {dir === 'rtl' ? 'إلى تاريخ:' : 'To Date:'}
                                                            </label>
                                                            <input 
                                                                type="date"
                                                                value={purgeToDate}
                                                                onChange={e => setPurgeToDate(e.target.value)}
                                                                className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-200"
                                                            />
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Matched Count Badge */}
                                                <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3 flex items-center justify-between text-xs">
                                                    <span className="font-bold text-amber-900">
                                                        {dir === 'rtl' ? 'عدد الصور المطابقة للحذف:' : 'Matching images to purge:'}
                                                    </span>
                                                    <span className="font-black bg-amber-200/80 text-amber-900 px-2.5 py-1 rounded-lg text-sm font-mono">
                                                        {matchingInvoicesForPurge.length} {dir === 'rtl' ? 'صورة' : 'images'}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Modal Actions */}
                                            <div className="flex gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => setIsPurgeModalOpen(false)}
                                                    className="flex-1 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition-colors"
                                                >
                                                    {dir === 'rtl' ? 'إلغاء' : 'Cancel'}
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={isPurging || matchingInvoicesForPurge.length === 0}
                                                    onClick={handlePurgeInvoiceImages}
                                                    className="flex-2 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm shadow-lg shadow-amber-200 transition-all disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
                                                >
                                                    {isPurging ? (
                                                        <>
                                                            <i className="fas fa-spinner fa-spin"></i>
                                                            <span>{dir === 'rtl' ? 'جاري التنظيف...' : 'Purging...'}</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <i className="fas fa-trash-alt"></i>
                                                            <span>{dir === 'rtl' ? 'تأكيد مسح الصور فقط' : 'Confirm Purge Images Only'}</span>
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {/* Top Controls & Tab Selector */}
                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-xl shadow-xs">
                                            <i className="fas fa-boxes-stacked"></i>
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-black text-slate-800">{t('inv.mat.title')}</h2>
                                            <p className="text-xs text-slate-400">
                                                {language === 'en' ? 'Manage items, actual counts, and stock corrections' : 'إدارة الأصناف، الأرصدة الحالية، وسجل تصحيح الجرد'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* View Toggle Tabs */}
                                    <div className="flex flex-wrap items-center gap-2">
                                        <div className="bg-slate-100 p-1 rounded-xl flex gap-1">
                                            <button
                                                type="button"
                                                onClick={() => setMaterialsViewMode('list')}
                                                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${materialsViewMode === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                                            >
                                                <i className="fas fa-boxes"></i>
                                                <span>{language === 'en' ? 'Stock List' : 'قائمة المواد والأرصدة'}</span>
                                                <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold">{materials.length}</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setMaterialsViewMode('corrections')}
                                                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${materialsViewMode === 'corrections' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                                            >
                                                <i className="fas fa-history"></i>
                                                <span>{language === 'en' ? 'Corrections Log' : 'سجل تصحيحات وجرد المخزون'}</span>
                                                {stockCorrections.length > 0 && (
                                                    <span className="bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold">{stockCorrections.length}</span>
                                                )}
                                            </button>
                                        </div>

                                        <button 
                                            onClick={() => { setEditingMat(null); setNewMatName(''); setNewMatQty(''); }} 
                                            className="bg-blue-600 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-md hover:bg-blue-700 transition-all flex items-center gap-1.5"
                                        >
                                            <i className="fas fa-plus"></i>
                                            <span>{language === 'en' ? 'New Material' : 'صنف جديد'}</span>
                                        </button>
                                    </div>
                                </div>

                                {/* LIST VIEW */}
                                {materialsViewMode === 'list' && (
                                    <div className="space-y-6">
                                        {/* Search Bar */}
                                        <div className="relative max-w-md">
                                            <i className="fas fa-search absolute right-3 top-3.5 text-slate-400 text-sm"></i>
                                            <input 
                                                className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pr-9 pl-4 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-100 shadow-xs"
                                                placeholder={language === 'en' ? 'Search materials...' : 'بحث في الأصناف...'}
                                                value={materialSearch}
                                                onChange={e => setMaterialSearch(e.target.value)}
                                            />
                                        </div>
                                        
                                        {/* Add / Edit Form Modal-like Area */}
                                        {(newMatName || editingMat || newMatQty) && (
                                            <div className="bg-white border-2 border-blue-100 p-6 rounded-2xl shadow-lg flex flex-col gap-4 animate-fade-in relative overflow-hidden">
                                                <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500"></div>
                                                <div className="flex justify-between items-center">
                                                    <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                                                        <i className="fas fa-box text-blue-500"></i>
                                                        {editingMat 
                                                            ? (language === 'en' ? 'Edit Material Name & Info' : 'تعديل بيانات الصنف')
                                                            : (language === 'en' ? 'Add New Material' : 'إضافة صنف جديد')}
                                                    </h3>
                                                    <button onClick={() => { setEditingMat(null); setNewMatName(''); setNewMatQty(''); }} className="text-slate-400 hover:text-slate-600">
                                                        <i className="fas fa-times"></i>
                                                    </button>
                                                </div>

                                                <div className="grid md:grid-cols-3 gap-4">
                                                    <div className="md:col-span-2">
                                                        <label className="text-xs font-bold text-slate-500 mb-1 block">
                                                            {language === 'en' ? 'Material Name' : 'اسم المادة / الصنف'}
                                                        </label>
                                                        <input 
                                                            className="bg-slate-50 border border-slate-200 rounded-xl p-3 w-full text-slate-800 font-bold text-sm outline-none focus:ring-2 focus:ring-blue-100" 
                                                            placeholder={t('inv.mat.name')} 
                                                            value={newMatName} 
                                                            onChange={e => setNewMatName(e.target.value)} 
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-xs font-bold text-slate-500 mb-1 block">
                                                            {language === 'en' ? 'Initial Stock' : 'الرصيد الافتتاحي'}
                                                        </label>
                                                        <input 
                                                            className="bg-slate-50 border border-slate-200 rounded-xl p-3 w-full text-slate-800 font-bold text-sm outline-none focus:ring-2 focus:ring-blue-100" 
                                                            type="number" 
                                                            placeholder="0" 
                                                            value={newMatQty} 
                                                            onChange={e => setNewMatQty(e.target.value)} 
                                                        />
                                                    </div>
                                                </div>

                                                <button onClick={handleMaterialSave} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 shadow-md w-full text-sm">
                                                    {editingMat ? (language === 'en' ? 'Save Changes' : 'حفظ التعديلات') : t('save')}
                                                </button>
                                            </div>
                                        )}

                                        {/* Materials Grid */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                            {filteredMaterials.map(m => (
                                                <div key={m.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group flex flex-col justify-between">
                                                    <div>
                                                        <div className="flex justify-between items-start mb-3">
                                                            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 group-hover:scale-105 transition-transform">
                                                                <i className="fas fa-box"></i>
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <button 
                                                                    onClick={() => handleOpenStockAdjustment(m)}
                                                                    className="text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 p-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1"
                                                                    title={language === 'en' ? 'Correct Stock' : 'تعديل أو تصحيح الرصيد'}
                                                                >
                                                                    <i className="fas fa-sliders-h"></i>
                                                                </button>
                                                                <button 
                                                                    onClick={() => { setEditingMat(m); setNewMatName(m.name); setNewMatQty(m.quantity.toString()); }} 
                                                                    className="text-slate-400 hover:text-blue-500 bg-slate-50 hover:bg-blue-50 p-2 rounded-xl text-xs transition-colors"
                                                                    title={language === 'en' ? 'Edit details' : 'تعديل الاسم'}
                                                                >
                                                                    <i className="fas fa-pen"></i>
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <h4 className="font-bold text-slate-800 text-sm mb-1 truncate" title={m.name}>{m.name}</h4>
                                                        <div className="flex items-baseline gap-1.5 mt-2">
                                                            <span className={`text-2xl font-black ${m.quantity <= 5 ? 'text-red-500' : m.quantity <= 15 ? 'text-amber-500' : 'text-emerald-600'}`}>
                                                                {m.quantity}
                                                            </span>
                                                            <span className="text-xs text-slate-400 font-bold">{t('inv.mat.unit')}</span>
                                                        </div>
                                                    </div>

                                                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${m.quantity <= 5 ? 'bg-red-50 text-red-600' : m.quantity <= 15 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                                            {m.quantity <= 5 
                                                                ? (language === 'en' ? 'Low Stock' : 'منخفض جداً')
                                                                : (language === 'en' ? 'Available' : 'متوفر بالمخزن')}
                                                        </span>
                                                        <button 
                                                            onClick={() => handleOpenStockAdjustment(m)}
                                                            className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                                        >
                                                            <span>{language === 'en' ? 'Adjust' : 'تصحيح الرصيد'}</span>
                                                            <i className="fas fa-chevron-left text-[10px] rtl:rotate-0 ltr:rotate-180"></i>
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* CORRECTIONS & AUDIT LOG VIEW */}
                                {materialsViewMode === 'corrections' && (
                                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4">
                                        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 border-b border-slate-100 pb-4">
                                            <div>
                                                <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                                                    <i className="fas fa-history text-amber-500"></i>
                                                    {language === 'en' ? 'Inventory Stock Corrections Log' : 'سجل حركات وتصحيحات جرد المخزون'}
                                                </h3>
                                                <p className="text-xs text-slate-400">
                                                    {language === 'en'
                                                        ? 'All manual quantity adjustments and inventory reconcile actions with rollback support'
                                                        : 'كافة عمليات تعديل الأرصدة يدوياً مع إمكانية التعديل السريع أو التراجع الفوري عن أي خطأ'}
                                                </p>
                                            </div>
                                            <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl self-start">
                                                {language === 'en' ? `Total Corrections: ${stockCorrections.length}` : `إجمالي حركات التصحيح: ${stockCorrections.length}`}
                                            </span>
                                        </div>

                                        {stockCorrections.length === 0 ? (
                                            <div className="text-center py-12 text-slate-400">
                                                <i className="fas fa-clipboard-check text-4xl mb-3 text-slate-200"></i>
                                                <p className="font-bold text-sm">
                                                    {language === 'en' ? 'No stock corrections recorded yet' : 'لا توجد حركات تصحيح رصيد مسجلة حتى الآن'}
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="overflow-x-auto">
                                                <table className={`w-full text-xs ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>
                                                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                                                        <tr>
                                                            <th className="p-3">{language === 'en' ? 'Date & Time' : 'التاريخ والوقت'}</th>
                                                            <th className="p-3">{language === 'en' ? 'Material' : 'الصنف'}</th>
                                                            <th className="p-3">{language === 'en' ? 'Adjustment' : 'قيمة التعديل'}</th>
                                                            <th className="p-3">{language === 'en' ? 'Reason / Notes' : 'سبب التصحيح / البيان'}</th>
                                                            <th className="p-3">{language === 'en' ? 'User' : 'المسؤول'}</th>
                                                            <th className="p-3 text-center">{language === 'en' ? 'Actions' : 'إجراءات'}</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100 font-medium">
                                                        {stockCorrections.map((corr) => {
                                                            const d = corr.date?.toDate ? corr.date.toDate() : new Date((corr.date?.seconds || 0) * 1000);
                                                            const targetMat = materials.find(m => m.name === corr.material);
                                                            return (
                                                                <tr key={corr.id} className="hover:bg-amber-50/30 transition-colors">
                                                                    <td className="p-3 font-mono text-slate-500 whitespace-nowrap">
                                                                        {d.toLocaleDateString(language === 'en' ? 'en-US' : 'ar-EG')} {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                    </td>
                                                                    <td className="p-3 font-bold text-slate-800">
                                                                        {corr.material}
                                                                    </td>
                                                                    <td className="p-3 font-black whitespace-nowrap">
                                                                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs ${corr.diff > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                                                            <i className={`fas ${corr.diff > 0 ? 'fa-arrow-up' : 'fa-arrow-down'}`}></i>
                                                                            {corr.diff > 0 ? `+${corr.diff}` : corr.diff}
                                                                        </span>
                                                                    </td>
                                                                    <td className="p-3 text-slate-600 max-w-xs truncate" title={corr.note}>
                                                                        {corr.note}
                                                                    </td>
                                                                    <td className="p-3 text-slate-600 whitespace-nowrap">
                                                                        {corr.author}
                                                                    </td>
                                                                    <td className="p-3 text-center whitespace-nowrap">
                                                                        <div className="flex items-center justify-center gap-2">
                                                                            {targetMat && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => handleOpenStockAdjustment(targetMat)}
                                                                                    className="text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                                                                                    title={language === 'en' ? 'Re-adjust stock for this item' : 'تعديل رصيد الصنف مجدداً'}
                                                                                >
                                                                                    <i className="fas fa-edit"></i>
                                                                                    <span>{language === 'en' ? 'Edit Stock' : 'تعديل'}</span>
                                                                                </button>
                                                                            )}
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleRevertCorrection(corr)}
                                                                                className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                                                                                title={language === 'en' ? 'Rollback and delete this correction' : 'تراجع عن حركة التصحيح واسترجاع الرصيد'}
                                                                            >
                                                                                <i className="fas fa-undo"></i>
                                                                                <span>{language === 'en' ? 'Revert' : 'تراجع'}</span>
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* QUICK STOCK ADJUSTMENT MODAL */}
                                {adjustingMat && (
                                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
                                        <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 space-y-5 border border-slate-100 relative animate-scale-up">
                                            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-lg">
                                                        <i className="fas fa-sliders-h"></i>
                                                    </div>
                                                    <div>
                                                        <h3 className="font-black text-slate-800 text-lg">
                                                            {language === 'en' ? 'Stock Adjustment & Reconcile' : 'تعديل وتصحيح رصيد الصنف'}
                                                        </h3>
                                                        <p className="text-xs text-slate-400 font-bold">{adjustingMat.name}</p>
                                                    </div>
                                                </div>
                                                <button 
                                                    onClick={() => setAdjustingMat(null)}
                                                    className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100"
                                                >
                                                    <i className="fas fa-times text-base"></i>
                                                </button>
                                            </div>

                                            {/* Quantity Comparison Card */}
                                            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                                <div className="text-center p-2 rounded-xl bg-white border border-slate-200/60 shadow-2xs">
                                                    <span className="text-[10px] font-bold text-slate-400 block mb-1">
                                                        {language === 'en' ? 'Current Registered Stock' : 'الرصيد المسجل حالياً'}
                                                    </span>
                                                    <span className="text-2xl font-black text-slate-700 font-mono">
                                                        {adjustingMat.quantity}
                                                    </span>
                                                </div>
                                                <div className="text-center p-2 rounded-xl bg-blue-50/50 border border-blue-200/60 shadow-2xs">
                                                    <span className="text-[10px] font-bold text-blue-600 block mb-1">
                                                        {language === 'en' ? 'New Target Stock' : 'الرصيد الفعلي الجديد'}
                                                    </span>
                                                    <span className="text-2xl font-black text-blue-700 font-mono">
                                                        {adjustTargetQty !== '' ? adjustTargetQty : '0'}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Live Difference Badge */}
                                            {(() => {
                                                const targetVal = parseFloat(adjustTargetQty);
                                                const diff = isNaN(targetVal) ? 0 : targetVal - adjustingMat.quantity;
                                                if (diff === 0) {
                                                    return (
                                                        <div className="p-2.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold text-center">
                                                            {language === 'en' ? 'No change in quantity' : 'الرصيد مطابق - لا يوجد تعديل'}
                                                        </div>
                                                    );
                                                }
                                                return (
                                                    <div className={`p-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 ${diff > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                                                        <i className={`fas ${diff > 0 ? 'fa-plus-circle' : 'fa-minus-circle'}`}></i>
                                                        <span>
                                                            {language === 'en'
                                                                ? `${diff > 0 ? 'Increase' : 'Decrease'} of ${Math.abs(diff)} unit(s) will be applied`
                                                                : diff > 0 
                                                                    ? `سيتم زيادة ${diff} علبة في المخزن لتصحيح الرصيد`
                                                                    : `سيتم خصم ${Math.abs(diff)} علبة من المخزن لتصحيح الرصيد`}
                                                        </span>
                                                    </div>
                                                );
                                            })()}

                                            {/* Target Quantity Input & Stepper Buttons */}
                                            <div className="space-y-2">
                                                <label className="text-xs font-bold text-slate-700 block">
                                                    {language === 'en' ? 'Enter Actual Quantity' : 'أدخل الكمية الفعلية الصحيحة:'}
                                                </label>
                                                <input 
                                                    type="number"
                                                    min="0"
                                                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl p-3 text-center text-xl font-black text-slate-800 outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white transition-all font-mono"
                                                    value={adjustTargetQty}
                                                    onChange={e => setAdjustTargetQty(e.target.value)}
                                                />

                                                {/* Steppers */}
                                                <div className="flex flex-wrap gap-1.5 justify-center pt-1">
                                                    {[-10, -5, -3, -1, 1, 3, 5, 10].map(step => (
                                                        <button
                                                            key={step}
                                                            type="button"
                                                            onClick={() => {
                                                                const current = parseFloat(adjustTargetQty) || 0;
                                                                setAdjustTargetQty(Math.max(0, current + step).toString());
                                                            }}
                                                            className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono transition-colors ${step < 0 ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
                                                        >
                                                            {step > 0 ? `+${step}` : step}
                                                        </button>
                                                    ))}
                                                    <button
                                                        type="button"
                                                        onClick={() => setAdjustTargetQty(adjustingMat.quantity.toString())}
                                                        className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                                                    >
                                                        {language === 'en' ? 'Reset' : 'إعادة ضبط'}
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Reason & Date */}
                                            <div className="space-y-3">
                                                <div>
                                                    <label className="text-xs font-bold text-slate-600 mb-1 block">
                                                        {language === 'en' ? 'Reason / Notes' : 'سبب التعديل أو الملاحظة:'}
                                                    </label>
                                                    <input 
                                                        type="text"
                                                        placeholder={language === 'en' ? 'e.g. Correction of duplicate delete, physical count...' : 'مثال: تصحيح خطأ مسح مكرر، مطابقة الجرد الفعلي...'}
                                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-200"
                                                        value={adjustNote}
                                                        onChange={e => setAdjustNote(e.target.value)}
                                                    />
                                                    {/* Quick reason chips */}
                                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                                        {[
                                                            language === 'en' ? 'Duplicate distribution delete fix' : 'تصحيح تكرار مسح حركة توزيع',
                                                            language === 'en' ? 'Physical inventory match' : 'مطابقة الجرد الفعلي للمخزن',
                                                            language === 'en' ? 'Typo correction' : 'تصحيح إدخال خاطئ للكمية',
                                                            language === 'en' ? 'Damaged / Expired items' : 'استبعاد تالف أو منتهي'
                                                        ].map((chipText, i) => (
                                                            <button
                                                                key={i}
                                                                type="button"
                                                                onClick={() => setAdjustNote(chipText)}
                                                                className="text-[10px] font-bold bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-600 px-2 py-1 rounded-lg transition-colors"
                                                            >
                                                                + {chipText}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                <div>
                                                    <label className="text-xs font-bold text-slate-600 mb-1 block">
                                                        {language === 'en' ? 'Effective Date' : 'تاريخ حركة التصحيح:'}
                                                    </label>
                                                    <input 
                                                        type="date"
                                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-200"
                                                        value={adjustDate}
                                                        onChange={e => setAdjustDate(e.target.value)}
                                                    />
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex gap-3 pt-2">
                                                <button
                                                    type="button"
                                                    disabled={isAdjusting}
                                                    onClick={() => setAdjustingMat(null)}
                                                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl font-bold text-xs transition-colors"
                                                >
                                                    {language === 'en' ? 'Cancel' : 'إلغاء'}
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={isAdjusting}
                                                    onClick={handleConfirmStockAdjustment}
                                                    className="flex-2 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold text-xs shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                                                >
                                                    {isAdjusting ? (
                                                        <>
                                                            <i className="fas fa-spinner fa-spin"></i>
                                                            <span>{language === 'en' ? 'Applying...' : 'جاري الحفظ وتعديل الرصيد...'}</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <i className="fas fa-check"></i>
                                                            <span>{language === 'en' ? 'Save & Correct Stock' : 'حفظ وتعديل الرصيد فوراً'}</span>
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* --- REPORTS TAB --- */}
                {canManageInventory && activeTab === 'reports' && (
                    <div className="space-y-6 animate-fade-in-up">
                        
                        <PrintHeader 
                            title={language === 'ar' ? 'تقرير حركة ومخزون المواد والصبغات الطبية' : 'Official Material Inventory & Audit Report'} 
                            subtitle={language === 'ar' ? 'سجل العمليات ومطابقة الأرصدة المستندية' : 'TRANSACTION LOG & STOCK AUDIT'}
                            departmentName={currentDeptName}
                            themeColor="indigo"
                            compact={true}
                            titleClassName="text-sm sm:text-base font-bold"
                            subtitleClassName="text-[8px] py-0.5 px-2.5"
                        />

                        {/* PRINT-ONLY METADATA AUDIT BAR */}
                        <div className="hidden print:flex justify-between items-center bg-slate-100 border border-slate-400 p-2.5 rounded mb-4 text-[10px] text-slate-900 font-sans" dir={dir}>
                            <div>
                                <span className="font-bold">{language === 'ar' ? 'نطاق التقرير: ' : 'Reporting Period: '}</span>
                                <span className="font-mono font-black">{reportFilter === 'range' ? `${reportStart} ➜ ${reportEnd}` : (language === 'ar' ? 'كافة السجلات التاريخية' : 'All Time')}</span>
                            </div>
                            <div>
                                <span className="font-bold">{language === 'ar' ? 'تاريخ ووقت التوليد: ' : 'Printed On: '}</span>
                                <span className="font-mono">{new Date().toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US')}</span>
                            </div>
                            <div>
                                <span className="font-bold">{language === 'ar' ? 'المشرف المسؤول: ' : 'Issued By: '}</span>
                                <span className="font-bold">{userName || 'Supervisor'}</span>
                            </div>
                        </div>

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
                                <button onClick={handleExportCSV} className="bg-emerald-600 text-white px-4 py-3 rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-lg shadow-emerald-100 hover:scale-[1.01] active:scale-95" title="تصدير جدول إكسل منظم">
                                    <i className="fas fa-file-excel"></i>
                                    <span>{language === 'ar' ? 'تصدير إكسل' : 'Export Excel'}</span>
                                </button>
                                <button onClick={() => window.print()} className="bg-indigo-600 text-white px-5 py-3 rounded-xl text-sm font-bold hover:bg-indigo-750 transition-all flex items-center gap-2 shadow-lg shadow-indigo-100 hover:scale-[1.01] active:scale-95">
                                    <i className="fas fa-print"></i>
                                    <span>{language === 'ar' ? 'طباعة تقرير منسق (PDF / A4)' : t('print')}</span>
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

                                {/* PRINT-ONLY: Comprehensive Materials Balance & Movement Table */}
                                <div className="hidden print:block mb-6">
                                    <table className="w-full text-[10px] border-collapse border border-slate-400 text-right" dir="rtl">
                                        <thead>
                                            <tr className="bg-slate-200 text-slate-900 font-bold border-b border-slate-400">
                                                <th className="p-1.5 border border-slate-300 text-center w-8">#</th>
                                                <th className="p-1.5 border border-slate-300 text-right">{language === 'ar' ? 'اسم المادة / الصنف' : 'Material'}</th>
                                                <th className="p-1.5 border border-slate-300 text-center">{language === 'ar' ? 'الرصيد الافتتاحي' : 'Opening'}</th>
                                                <th className="p-1.5 border border-slate-300 text-center text-emerald-800">{language === 'ar' ? 'الوارد (+)' : 'Added (+)'}</th>
                                                <th className="p-1.5 border border-slate-300 text-center text-red-800">{language === 'ar' ? 'المنصرف (-)' : 'Used (-)'}</th>
                                                <th className="p-1.5 border border-slate-300 text-center text-teal-800">{language === 'ar' ? 'العهد النشطة' : 'In Custody'}</th>
                                                <th className="p-1.5 border border-slate-300 text-center font-black">{language === 'ar' ? 'صافي الرصيد المتبقي' : 'Net Balance'}</th>
                                                <th className="p-1.5 border border-slate-300 text-center">{language === 'ar' ? 'حالة المخزون' : 'Status'}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {materialStats.map(([matName, stat], idx) => {
                                                const totalCustody = Object.values(staffBalances)
                                                    .reduce((sum, d) => sum + (d.materials[matName.trim()] || 0), 0);
                                                return (
                                                    <tr key={matName} className="border-b border-slate-300 text-slate-900">
                                                        <td className="p-1.5 border border-slate-300 text-center font-mono">{idx + 1}</td>
                                                        <td className="p-1.5 border border-slate-300 font-bold text-right">{matName}</td>
                                                        <td className="p-1.5 border border-slate-300 text-center font-mono">{stat.startBalance}</td>
                                                        <td className="p-1.5 border border-slate-300 text-center font-mono font-bold text-emerald-800">+{stat.periodIn}</td>
                                                        <td className="p-1.5 border border-slate-300 text-center font-mono font-bold text-red-800">-{stat.periodOut}</td>
                                                        <td className="p-1.5 border border-slate-300 text-center font-mono text-teal-800 font-bold">{totalCustody}</td>
                                                        <td className="p-1.5 border border-slate-300 text-center font-mono font-black bg-slate-100">{stat.endBalance}</td>
                                                        <td className="p-1.5 border border-slate-300 text-center text-[9px] font-bold">
                                                            {stat.endBalance <= 10 
                                                                ? (language === 'ar' ? 'منخفض' : 'Low Stock') 
                                                                : (language === 'ar' ? 'متوفر' : 'Good Level')}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot>
                                            <tr className="bg-slate-200 font-bold border-t-2 border-slate-400 text-slate-900">
                                                <td colSpan={2} className="p-1.5 text-center font-bold">{language === 'ar' ? 'الإجماليات (Totals)' : 'Totals'}</td>
                                                <td className="p-1.5 text-center font-mono">{materialStats.reduce((s, [, m]) => s + m.startBalance, 0)}</td>
                                                <td className="p-1.5 text-center font-mono text-emerald-800">+{materialStats.reduce((s, [, m]) => s + m.periodIn, 0)}</td>
                                                <td className="p-1.5 text-center font-mono text-red-800">-{materialStats.reduce((s, [, m]) => s + m.periodOut, 0)}</td>
                                                <td className="p-1.5 text-center font-mono text-teal-800">
                                                    {materialStats.reduce((s, [matName]) => s + Object.values(staffBalances).reduce((sum, d) => sum + (d.materials[matName.trim()] || 0), 0), 0)}
                                                </td>
                                                <td className="p-1.5 text-center font-mono font-black">{materialStats.reduce((s, [, m]) => s + m.endBalance, 0)}</td>
                                                <td className="p-1.5 text-center">-</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                                
                                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 print:hidden">
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
                            <div className="space-y-4 print:break-inside-avoid print:mt-6">
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

                                <div className="hidden print:flex justify-between items-end mb-2 border-b-2 border-slate-800 pb-1">
                                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                        <span>2. {language === 'ar' ? 'سجل تفاصيل العمليات وحركات الصرف (Detailed Transaction Logs)' : '2. Detailed Transaction Logs'}</span>
                                    </h3>
                                    <span className="text-[9px] font-mono text-slate-600">
                                        {language === 'ar' ? `إجمالي السجلات: ${filteredUsages.length} حركة` : `Total: ${filteredUsages.length} records`}
                                    </span>
                                </div>

                                {/* Detailed Log Table */}
                                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden print:border print:border-slate-400 print:shadow-none print:rounded-none">
                                    <table className={`w-full text-sm print:text-[10px] border-collapse ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>
                                        <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-150 print:bg-slate-200 print:border-b-2 print:border-slate-400 print:text-slate-900">
                                            <tr>
                                                <th className="p-3 print:p-1.5 border-r print:border-slate-300 text-center w-8 print:w-7">#</th>
                                                <th className="p-3 print:p-1.5 border-r print:border-slate-300">{t('date')}</th>
                                                <th className="p-3 print:p-1.5 border-r print:border-slate-300">{t('inv.usage.material')}</th>
                                                <th className="p-3 print:p-1.5 border-r print:border-slate-300 text-center">{t('inv.usage.amount')}</th>
                                                <th className="p-3 print:p-1.5 border-r print:border-slate-300">{t('role.user')}</th>
                                                <th className="p-3 print:p-1.5 border-r print:border-slate-300">{t('inv.usage.file')}</th>
                                                <th className="p-3 print:p-1.5 border-r print:border-slate-300 text-center hidden print:table-cell">{language === 'ar' ? 'المصدر' : 'Source'}</th>
                                                {canManageInventory && <th className="p-3 print:hidden w-10"></th>}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 print:divide-slate-300">
                                            {filteredUsages.map((u, idx) => (
                                                <tr key={u.id} className="hover:bg-slate-50/50 print:break-inside-avoid group text-slate-800">
                                                    <td className="p-3 print:p-1.5 font-mono text-center text-slate-500 print:text-slate-900 border-r print:border-slate-300">{idx + 1}</td>
                                                    <td className="p-3 print:p-1.5 font-mono text-slate-600 print:text-slate-900 border-r print:border-slate-300 dir-ltr">{u.date?.toDate ? u.date.toDate().toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US') : 'N/A'}</td>
                                                    <td className="p-3 print:p-1.5 font-bold text-slate-800 border-r print:border-slate-300">{u.material}</td>
                                                    <td className="p-3 print:p-1.5 font-bold text-red-600 border-r print:border-slate-300 text-center font-mono">-{u.amount}</td>
                                                    <td className="p-3 print:p-1.5 text-slate-700 print:text-slate-900 border-r print:border-slate-300">{u.staffName}</td>
                                                    <td className="p-3 print:p-1.5 font-mono text-slate-600 print:text-slate-900 border-r print:border-slate-300">{u.patientFileNumber || '-'}</td>
                                                    <td className="p-3 print:p-1.5 text-center text-slate-600 print:text-slate-900 border-r print:border-slate-300 hidden print:table-cell font-sans">
                                                        {u.fromCustody ? (language === 'ar' ? 'عهدة شخصية' : 'Custody') : (language === 'ar' ? 'مخزن رئيسي' : 'Main')}
                                                    </td>
                                                    {canManageInventory && (
                                                        <td className="p-3 print:hidden text-center">
                                                            <button 
                                                                disabled={deletingUsageIds.includes(u.id)}
                                                                onClick={() => handleDeleteUsage(u)} 
                                                                className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1.5 rounded hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed" 
                                                                title={language === 'en' ? 'Delete & Restore Stock' : 'حذف واسترجاع للمخزن'}
                                                            >
                                                                {deletingUsageIds.includes(u.id) ? (
                                                                    <i className="fas fa-spinner fa-spin text-red-500"></i>
                                                                ) : (
                                                                    <i className="fas fa-trash"></i>
                                                                )}
                                                            </button>
                                                        </td>
                                                    )}
                                                </tr>
                                            ))}
                                            {filteredUsages.length === 0 && (
                                                <tr>
                                                    <td colSpan={canManageInventory ? 7 : 6} className="text-center py-8 text-slate-400 italic bg-slate-50/50">
                                                        {language === 'ar' ? 'لا توجد حركات مسجلة خلال الفترة' : 'No records found'}
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                        {filteredUsages.length > 0 && (
                                            <tfoot>
                                                <tr className="bg-slate-100 font-bold border-t-2 border-slate-300 print:bg-slate-200 print:border-slate-400 text-slate-900 text-xs print:text-[10px]">
                                                    <td colSpan={3} className="p-3 print:p-1.5 text-center font-bold">
                                                        {language === 'ar' ? 'إجمالي المنصرف (Total Disbursed)' : 'Total Disbursed'}
                                                    </td>
                                                    <td className="p-3 print:p-1.5 text-center font-mono font-black text-red-700">
                                                        -{filteredUsages.reduce((sum, u) => sum + (u.amount || 0), 0)}
                                                    </td>
                                                    <td colSpan={canManageInventory ? 3 : 2} className="p-3 print:p-1.5 text-slate-500 print:text-slate-700 font-mono text-[10px]">
                                                        {filteredUsages.length} {language === 'ar' ? 'حركات منفذة' : 'transactions'}
                                                    </td>
                                                    <td className="print:hidden"></td>
                                                </tr>
                                            </tfoot>
                                        )}
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* --- SECTION 3: STAFF CUSTODY REPORT --- */}
                        {printStaffCustody && (
                            <div className="space-y-4 print:break-inside-avoid print:mt-6">
                                <div className="mt-8 mb-4 print:hidden">
                                    <h3 className="text-lg font-black text-slate-700 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-2">
                                        <i className="fas fa-briefcase text-indigo-500"></i> {t('inv.print.staffCustody')}
                                    </h3>
                                </div>

                                <div className="hidden print:flex justify-between items-end mb-2 border-b-2 border-slate-800 pb-1">
                                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                        <span>3. {language === 'ar' ? 'كشف أرصدة العهد الشخصية للموظفين (Staff Custody Balances)' : '3. Staff Custody Balances'}</span>
                                    </h3>
                                    <span className="text-[9px] font-mono text-slate-600">
                                        {Object.keys(staffBalances).length} {language === 'ar' ? 'موظفين لديهم عهد' : 'staff members'}
                                    </span>
                                </div>

                                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border print:border-slate-400 print:rounded-none">
                                    <table className={`w-full text-sm print:text-[10px] border-collapse ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>
                                        <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-150 print:bg-slate-200 print:border-b-2 print:border-slate-400 print:text-slate-900">
                                            <tr>
                                                <th className="p-3 print:p-1.5 border-r print:border-slate-300">{t('inv.dist.staffName')}</th>
                                                <th className="p-3 print:p-1.5 border-r print:border-slate-300">{t('inv.usage.material')}</th>
                                                <th className="p-3 print:p-1.5 border-r print:border-slate-300 text-center">{language === 'ar' ? 'إجمالي المستلم (+)' : 'Total In (+)'}</th>
                                                <th className="p-3 print:p-1.5 border-r print:border-slate-300 text-center">{language === 'ar' ? 'المستهلك للمرضى (-)' : 'Total Used (-)'}</th>
                                                <th className="p-3 print:p-1.5 text-center">{language === 'ar' ? 'المتبقي بالعهدة' : 'Custody Balance'}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 print:divide-slate-300">
                                            {Object.entries(staffBalances).map(([emailKey, data]) => (
                                                Object.entries(data.materials).map(([mat, bal], idx) => {
                                                    const getStaffKey = (em?: string, nm?: string) => {
                                                        if (em) return em.toLowerCase().trim();
                                                        if (nm) return nm.toLowerCase().trim();
                                                        return '';
                                                    };
                                                    const distSum = distributions.filter(d => d.material === mat && getStaffKey(d.staffEmail, d.staffName) === emailKey).reduce((sum, d) => sum + d.amount, 0);
                                                    const useSum = usages.filter(u => u.material === mat && u.fromCustody && getStaffKey(u.staffEmail, u.staffName) === emailKey).reduce((sum, u) => sum + u.amount, 0);
                                                    return (
                                                        <tr key={`${emailKey}-${mat}`} className="hover:bg-slate-50/50 print:break-inside-avoid text-slate-800">
                                                            {idx === 0 && (
                                                                <td className="p-3 print:p-1.5 font-bold text-slate-800 border-r print:border-slate-300 print:text-black bg-slate-50/40 print:bg-transparent" rowSpan={Object.keys(data.materials).length}>
                                                                    {data.name}
                                                                </td>
                                                            )}
                                                            <td className="p-3 print:p-1.5 font-bold text-slate-700 border-r print:border-slate-300">{mat}</td>
                                                            <td className="p-3 print:p-1.5 text-orange-600 font-bold border-r print:border-slate-300 text-center font-mono">+{distSum}</td>
                                                            <td className="p-3 print:p-1.5 text-teal-600 font-bold border-r print:border-slate-300 text-center font-mono">-{useSum}</td>
                                                            <td className={`p-3 print:p-1.5 font-black text-center font-mono ${bal > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>{bal}</td>
                                                        </tr>
                                                    );
                                                })
                                            ))}
                                            {Object.keys(staffBalances).length === 0 && (
                                                <tr>
                                                    <td colSpan={5} className="text-center py-8 text-slate-400 italic bg-slate-50/50">
                                                        {language === 'ar' ? 'لا توجد عهد نشطة حالياً' : 'No active custody balances'}
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                        
                        <PrintFooter themeColor="indigo" />
                    </div>
                )}

                {/* Patient File Duplicate Warning / Confirmation Modal */}
                {duplicateWarningModal.isOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in print:hidden">
                        <div className="bg-white rounded-[2rem] max-w-xl w-full p-6 sm:p-7 shadow-2xl border border-slate-100 relative overflow-hidden flex flex-col max-h-[92vh] animate-scale-up" dir={dir}>
                            {/* Modal Header */}
                            <div className="flex justify-between items-start mb-4 border-b border-slate-100 pb-4">
                                <div className="flex items-center gap-3.5">
                                    <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center text-2xl shrink-0 shadow-inner">
                                        <i className="fas fa-exclamation-triangle"></i>
                                    </div>
                                    <div>
                                        <h3 className="text-lg sm:text-xl font-black text-slate-800 flex flex-col gap-0.5">
                                            <span>{t('inv.duplicate.title')}</span>
                                            {language === 'ar' && (
                                                <span className="text-xs font-semibold text-amber-700/80">
                                                    Warning: Patient Previously Received Contrast / Material!
                                                </span>
                                            )}
                                        </h3>
                                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                                            <span className="text-xs font-bold text-slate-500">{t('inv.duplicate.fileNo')}</span>
                                            <span className="text-xs font-mono font-black bg-slate-100 text-slate-800 px-2.5 py-0.5 rounded-lg border border-slate-200">
                                                {duplicateWarningModal.patientFileNumber}
                                            </span>
                                            <span className="text-xs bg-amber-100 text-amber-800 font-extrabold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                                                <span>{duplicateWarningModal.history.length}</span>
                                                <span>{t('inv.duplicate.timesCount')}</span>
                                                {language === 'ar' && <span className="text-[10px] text-amber-700/70 font-normal">({duplicateWarningModal.history.length} prev.)</span>}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <button 
                                    type="button"
                                    onClick={cancelDuplicateSave}
                                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors shrink-0"
                                    title={language === 'en' ? 'Cancel' : 'إلغاء'}
                                >
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>

                            {/* Current pending action summary */}
                            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 mb-4 text-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                <div>
                                    <span className="text-slate-400 block text-[11px] font-bold">
                                        {t('inv.duplicate.pendingAction')}
                                        {language === 'ar' && <span className="text-[10px] text-slate-400 font-normal mr-1.5 ml-1.5">(Pending Action)</span>}
                                    </span>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="font-extrabold text-slate-800 text-sm">{duplicateWarningModal.newMaterial}</span>
                                        <span className="text-slate-300">•</span>
                                        <span className="font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md">
                                            {t('inv.duplicate.quantity')} {duplicateWarningModal.newAmount}
                                        </span>
                                    </div>
                                </div>
                                <span className="text-[11px] font-bold text-slate-600 bg-white border border-slate-200 px-2.5 py-1 rounded-lg">
                                    {duplicateWarningModal.submittingType === 'mainUsage' 
                                        ? t('inv.duplicate.mainStockSource') 
                                        : t('inv.duplicate.custodySource')}
                                    {language === 'ar' && (
                                        <span className="text-[10px] text-slate-400 block font-normal text-center">
                                            {duplicateWarningModal.submittingType === 'mainUsage' ? 'Main Stock' : 'Personal Custody'}
                                        </span>
                                    )}
                                </span>
                            </div>

                            {/* History List Header */}
                            <div className="flex items-center justify-between mb-2 px-1">
                                <span className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
                                    <i className="fas fa-history text-amber-500"></i>
                                    <span>{t('inv.duplicate.historyTitle')}</span>
                                    {language === 'ar' && <span className="text-[10px] text-slate-400 font-normal">(Previous Records)</span>}
                                </span>
                                <span className="text-[11px] text-slate-400 font-medium">{t('inv.duplicate.sortOrder')}</span>
                            </div>

                            {/* History Records */}
                            <div className="overflow-y-auto max-h-[220px] space-y-2.5 pr-1 mb-4 rounded-xl">
                                {duplicateWarningModal.history.map((item, idx) => (
                                    <div key={item.id || idx} className="bg-amber-50/60 hover:bg-amber-50 border border-amber-200/90 rounded-2xl p-3.5 transition-all text-xs">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <span className="w-5 h-5 rounded-full bg-amber-200 text-amber-900 font-black flex items-center justify-center text-[10px] shrink-0">
                                                    {idx + 1}
                                                </span>
                                                <span className="font-black text-slate-800 text-sm">{item.material}</span>
                                            </div>
                                            <span className="font-black bg-white px-2.5 py-0.5 rounded-lg border border-amber-200 text-amber-900">
                                                {t('inv.duplicate.quantity')} {item.amount}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-600 pt-2 border-t border-amber-200/60">
                                            <div className="flex items-center gap-1.5">
                                                <i className="far fa-calendar-alt text-amber-600"></i>
                                                <span>{t('inv.duplicate.itemDate')} <strong className="text-slate-800 font-mono">{item.dateStr}</strong></span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <i className="far fa-clock text-amber-600"></i>
                                                <span>{t('inv.duplicate.itemTime')} <strong className="text-slate-800 font-mono">{item.timeStr}</strong> {item.timeAgo && <span className="text-[10px] text-amber-700 font-medium">({item.timeAgo})</span>}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 truncate">
                                                <i className="far fa-user text-slate-400"></i>
                                                <span className="truncate">{t('inv.duplicate.itemStaff')} <strong className="text-slate-700">{item.staffName}</strong></span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <i className="fas fa-box text-slate-400"></i>
                                                <span>{t('inv.duplicate.itemSource')} <span className="text-slate-700">{item.fromCustody ? t('inv.duplicate.custody') : t('inv.duplicate.mainStock')}</span></span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Confirmation Prompt Banner */}
                            <div className="bg-amber-100/80 border border-amber-300 rounded-2xl p-3.5 text-center mb-5">
                                <p className="font-black text-amber-950 text-sm">
                                    {t('inv.duplicate.promptTitle')}
                                </p>
                                {language === 'ar' && (
                                    <p className="text-[11px] text-amber-900/80 font-semibold mt-0.5">
                                        Do you want to confirm saving this material for this patient?
                                    </p>
                                )}
                                <p className="text-[11px] text-amber-800 mt-1 leading-relaxed">
                                    {t('inv.duplicate.promptSubtitle')}
                                </p>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex flex-col-reverse sm:flex-row gap-2.5">
                                <button
                                    type="button"
                                    onClick={cancelDuplicateSave}
                                    className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs sm:text-sm transition-all text-center flex flex-col items-center justify-center"
                                >
                                    <span>{t('inv.duplicate.cancelBtn')}</span>
                                    {language === 'ar' && <span className="text-[10px] text-slate-500 font-normal">Cancel & Review</span>}
                                </button>
                                <button
                                    type="button"
                                    onClick={confirmDuplicateSave}
                                    disabled={Boolean(submittingOp)}
                                    className="flex-1 py-3 px-4 bg-amber-600 hover:bg-amber-700 text-white font-black rounded-xl text-xs sm:text-sm shadow-lg shadow-amber-200 transition-all flex flex-col items-center justify-center gap-0.5"
                                >
                                    <span className="flex items-center gap-1.5">
                                        <i className="fas fa-check-circle"></i>
                                        <span>{t('inv.duplicate.confirmBtn')}</span>
                                    </span>
                                    {language === 'ar' && <span className="text-[10px] text-amber-100 font-normal">Yes, Confirm Save</span>}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};

export default InventorySystem;