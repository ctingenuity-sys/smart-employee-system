import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { StandaloneCase, IncomingPatient, MODALITY_CONFIG, detectModality } from '../pages/StandaloneRadiologyLogbook';

export interface PacsRecord {
    id: string;
    patientName: string;
    fileNumber: string;         // MRN / Patient ID
    modality: 'X-RAY' | 'CT' | 'MRI' | 'US' | 'FLUO' | 'MAMMO' | 'OTHER';
    rawModality: string;        // e.g. "CR", "CT", "US", "MR"
    examName: string;           // e.g. "Chest - 1 View", "CT_HEAD PLAIN"
    accessionNo?: string;       // e.g. "US22802", "CT58207"
    date?: string;              // e.g. "Aug 30, 2026" or "2026-08-30"
    time?: string;              // e.g. "6:14 AM"
    age?: string;
    gender?: string;
    dob?: string;
    rawText: string;
}

export type ReconciliationStatus = 'MATCHED' | 'MISSING_IN_PACS' | 'MISSING_IN_IHMS' | 'MODALITY_MISMATCH';

export interface ComparisonItem {
    key: string;
    fileNumber: string;
    patientName: string;
    status: ReconciliationStatus;
    
    // IHMS Logbook data
    inIHMS: boolean;
    ihmsCase?: StandaloneCase;
    ihmsQueueItem?: IncomingPatient;
    ihmsModality?: string;
    ihmsSerial?: string;
    ihmsExam?: string;
    ihmsTime?: string;
    ihmsDate?: string;
    ihmsTech?: string;
    ihmsDoctor?: string;

    // PACS data
    inPACS: boolean;
    pacsRecord?: PacsRecord;
    pacsAllRecords?: PacsRecord[]; // If patient has multiple studies in PACS
    pacsModality?: string;
    pacsExam?: string;
    pacsAccession?: string;
    pacsTime?: string;
    pacsDate?: string;
    pacsGender?: string;
    pacsAge?: string;

    discrepancyNote?: string;
}

// Convert PACS modality code to standard modality
export const normalizePacsModality = (rawCode?: string, examDesc?: string): 'X-RAY' | 'CT' | 'MRI' | 'US' | 'FLUO' | 'MAMMO' | 'OTHER' => {
    if (!rawCode && !examDesc) return 'X-RAY';
    const code = (rawCode || '').trim().toUpperCase();
    
    if (code === 'CR' || code === 'DX' || code === 'XR' || code === 'RG' || code === 'RAD') return 'X-RAY';
    if (code === 'CT' || code === 'CAT') return 'CT';
    if (code === 'MR' || code === 'MRI') return 'MRI';
    if (code === 'US' || code === 'ECHO' || code === 'SONO') return 'US';
    if (code === 'RF' || code === 'FL' || code === 'FLUO') return 'FLUO';
    if (code === 'MG' || code === 'MAMMO' || code === 'MX') return 'MAMMO';
    
    return detectModality(examDesc || '', rawCode || '');
};

// Robust PACS Raw Text Parser
export const parsePacsRawText = (rawText: string): PacsRecord[] => {
    if (!rawText || !rawText.trim()) return [];

    const records: PacsRecord[] = [];
    const text = rawText.trim();

    // Strategy 1: Multi-line Block Pattern (Like the user's PACS copy)
    // Example:
    // ABDULRUHMAN MOHD 27Y, Unknown (O)ID: 1373724DoB: Jan 1, 1800 Open images
    // US - US_UNKNOWNAcn: US22802Aug 30, 2026 6:14 AM
    // CR - CR_UNKNOWNAcn:Aug 30, 2026 6:12 AM
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    let currentPatient: {
        name: string;
        fileNumber: string;
        age?: string;
        gender?: string;
        dob?: string;
    } | null = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // 1. Check if this line is a Patient Header line
        // Look for "ID: 1373724" or "MRN: 1373724" or "Patient ID: 1373724" or "ID:1373724"
        const idMatch = line.match(/(?:ID|MRN|File\s*No|Patient\s*ID)[:\s]*([A-Za-z0-9_-]+)/i);

        if (idMatch) {
            let fileNumber = idMatch[1].trim();
            // Remove DoB/DOB/dob or any trailing letters glued to the MRN (e.g., "1373724DoB" -> "1373724")
            fileNumber = fileNumber.replace(/(?:DoB|DOB|dob|Date|Age|Gender).*$/i, '').trim();
            fileNumber = fileNumber.replace(/[^A-Za-z0-9_-]/g, '').trim();
            
            // Extract text before "ID:" or before Age/Gender
            let name = line.substring(0, idMatch.index).trim();
            // Remove common trailing junk like "27Y, Unknown (O)", "Unknown (M)", "25 Y", "(M)", "(F)"
            let age: string | undefined;
            let gender: string | undefined;

            const ageMatch = name.match(/(\d{1,3}\s*[YyMm])/);
            if (ageMatch) {
                age = ageMatch[1];
                name = name.substring(0, ageMatch.index).trim();
            }

            const genderMatch = line.match(/\(([MFOmfo])\)|Gender[:\s]+([MFOmfo])/i);
            if (genderMatch) {
                const g = (genderMatch[1] || genderMatch[2] || '').toUpperCase();
                gender = g === 'M' ? 'M' : g === 'F' ? 'F' : 'O';
            }

            // Clean name from trailing commas, "Unknown", or symbols
            name = name.replace(/[,;:\-]+$/, '').trim();
            name = name.replace(/\s*,\s*Unknown.*$/i, '').trim();
            name = name.replace(/\s*Unknown.*$/i, '').trim();
            name = name.replace(/[,;:\-]+$/, '').trim();

            if (!name) name = `مريض ملف ${fileNumber}`;

            // DoB check
            let dob: string | undefined;
            const dobMatch = line.match(/DoB[:\s]+([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{4}[-/]\d{2}[-/]\d{2})/i);
            if (dobMatch) {
                dob = dobMatch[1].trim();
            }

            currentPatient = {
                name,
                fileNumber,
                age,
                gender,
                dob
            };
            continue;
        }

        // 2. Check if this line is a Study / Exam Line under the current patient
        // Example: "US - US_UNKNOWNAcn: US22802Aug 30, 2026 6:14 AM"
        // Example: "CR - CR_Chest - 1 ViewAcn: XRAug 30, 2026 8:27 AM"
        // Example: "CT - CT_HEAD PLAINAcn: CT58207Aug 30, 2026 2:45 AM"
        // Example: "CR - CR_UNKNOWNAcn:Aug 30, 2026 6:12 AM"
        const studyMatch = line.match(/^([A-Za-z]{2,5})\s*-\s*(.+)$/);
        
        if (studyMatch && currentPatient) {
            const rawModality = studyMatch[1].toUpperCase();
            const rest = studyMatch[2].trim();

            let examName = rest;
            let accessionNo: string | undefined;
            let dateStr: string | undefined;
            let timeStr: string | undefined;

            // Look for "Acn: US22802" or "Acn: XR38195" or "Acn:" followed by date
            const acnIndex = rest.indexOf('Acn:');
            if (acnIndex !== -1) {
                examName = rest.substring(0, acnIndex).trim();
                const afterAcn = rest.substring(acnIndex + 4).trim();

                // Extract date time from after Acn
                // Date time formats: "Aug 30, 2026 6:14 AM" or "30/08/2026 06:14" or "2026-08-30 06:14"
                const dateTimeMatch = afterAcn.match(/([A-Za-z]{3}\s+\d{1,2},?\s+\d{4})\s+(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)/i);
                
                if (dateTimeMatch) {
                    const fullMatch = dateTimeMatch[0];
                    const fullMatchIdx = afterAcn.indexOf(fullMatch);
                    accessionNo = afterAcn.substring(0, fullMatchIdx).trim();
                    dateStr = dateTimeMatch[1].trim();
                    timeStr = dateTimeMatch[2].trim();
                } else {
                    // Check other date formats
                    const stdDateMatch = afterAcn.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})\s*(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)?/i);
                    if (stdDateMatch) {
                        const fullMatch = stdDateMatch[0];
                        const fullMatchIdx = afterAcn.indexOf(fullMatch);
                        accessionNo = afterAcn.substring(0, fullMatchIdx).trim();
                        dateStr = stdDateMatch[1].trim();
                        timeStr = stdDateMatch[2]?.trim();
                    } else {
                        accessionNo = afterAcn;
                    }
                }
            } else {
                // No Acn keyword, check for date & time in line
                const dtMatch = rest.match(/([A-Za-z]{3}\s+\d{1,2},?\s+\d{4})\s+(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)/i);
                if (dtMatch) {
                    dateStr = dtMatch[1].trim();
                    timeStr = dtMatch[2].trim();
                    examName = rest.substring(0, rest.indexOf(dtMatch[0])).trim();
                }
            }

            // Clean exam name
            examName = examName.replace(/^[-_\s]+|[-_\s]+$/g, '');
            if (!examName) examName = `${rawModality} Scan`;

            const modality = normalizePacsModality(rawModality, examName);

            records.push({
                id: `pacs_${currentPatient.fileNumber}_${records.length}_${Math.random().toString(36).substring(2, 6)}`,
                patientName: currentPatient.name,
                fileNumber: currentPatient.fileNumber,
                modality,
                rawModality,
                examName,
                accessionNo: accessionNo ? accessionNo.replace(/^[:\s]+/, '').trim() : undefined,
                date: dateStr,
                time: timeStr,
                age: currentPatient.age,
                gender: currentPatient.gender,
                dob: currentPatient.dob,
                rawText: line
            });
            continue;
        }

        // 3. Strategy 2: Tab-delimited row (from copied HTML table or Excel grid from PACS)
        if (line.includes('\t')) {
            const parts = line.split('\t').map(p => p.trim());
            // Check if one of parts is a file number / MRN (numbers with length 4-10)
            let fNum = '';
            let pName = '';
            let pMod = '';
            let pExam = '';
            let pAcn = '';
            let pTime = '';
            let pDate = '';

            for (const p of parts) {
                if (!fNum && /^\d{3,10}$/.test(p)) {
                    fNum = p;
                } else if (!pMod && /^(CR|DX|XR|CT|MR|MRI|US|FL|FLUO|MG|MAMMO)$/i.test(p)) {
                    pMod = p.toUpperCase();
                } else if (!pAcn && /^(XR|CT|MR|US|FL|MG)\d{4,10}$/i.test(p)) {
                    pAcn = p;
                } else if (!pTime && /\d{1,2}:\d{2}/.test(p)) {
                    pTime = p;
                } else if (!pName && p.length > 3 && /[A-Za-z\u0600-\u06FF]/.test(p) && !p.includes(':')) {
                    pName = p;
                } else if (!pExam && p.length > 2) {
                    pExam = p;
                }
            }

            if (fNum) {
                const modality = normalizePacsModality(pMod, pExam);
                records.push({
                    id: `pacs_tab_${fNum}_${records.length}_${Math.random().toString(36).substring(2, 6)}`,
                    patientName: pName || `مريض ${fNum}`,
                    fileNumber: fNum,
                    modality,
                    rawModality: pMod || modality,
                    examName: pExam || `${modality} Exam`,
                    accessionNo: pAcn,
                    date: pDate,
                    time: pTime,
                    rawText: line
                });
                continue;
            }
        }

        // 4. Strategy 3: Isolated patient block with no study line yet
        // If currentPatient exists and we hit another patient line without a study, create a fallback record
    }

    // If currentPatient was parsed but had no separate study lines (e.g. just patient list)
    if (currentPatient && records.filter(r => r.fileNumber === currentPatient?.fileNumber).length === 0) {
        records.push({
            id: `pacs_fallback_${currentPatient.fileNumber}_0`,
            patientName: currentPatient.name,
            fileNumber: currentPatient.fileNumber,
            modality: 'X-RAY',
            rawModality: 'CR',
            examName: 'فحص باكس عام',
            age: currentPatient.age,
            gender: currentPatient.gender,
            dob: currentPatient.dob,
            rawText: currentPatient.name
        });
    }

    return records;
};

interface PacsReconciliationModalProps {
    isOpen: boolean;
    onClose: () => void;
    cases: StandaloneCase[];
    incomingQueue: IncomingPatient[];
    selectedDate: string;
    isEn: boolean;
    onAddPacsCaseToLogbook: (pacs: PacsRecord) => void;
    onAddMultiplePacsCases?: (pacsList: PacsRecord[]) => void;
    showToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export const PacsReconciliationModal: React.FC<PacsReconciliationModalProps> = ({
    isOpen,
    onClose,
    cases,
    incomingQueue,
    selectedDate,
    isEn,
    onAddPacsCaseToLogbook,
    onAddMultiplePacsCases,
    showToast
}) => {
    const txt = (ar: string, en: string) => (isEn ? en : ar);

    // PACS Input text state (persisted in localStorage for convenience)
    const [pacsRawText, setPacsRawText] = useState<string>(() => {
        return localStorage.getItem('stand_pacs_raw_text') || '';
    });

    // Filters and scope
    const [filterStatus, setFilterStatus] = useState<'ALL' | ReconciliationStatus>('ALL');
    const [filterModality, setFilterModality] = useState<string>('ALL');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [scopeFilter, setScopeFilter] = useState<'SELECTED_DATE' | 'ALL_DATES'>('SELECTED_DATE');
    const [includeIncomingQueue, setIncludeIncomingQueue] = useState<boolean>(true);

    // Save text to localStorage
    useEffect(() => {
        localStorage.setItem('stand_pacs_raw_text', pacsRawText);
    }, [pacsRawText]);

    // Parse PACS records
    const pacsRecords = useMemo(() => {
        return parsePacsRawText(pacsRawText);
    }, [pacsRawText]);

    // Determine candidate IHMS cases based on scope
    const candidateIhmsCases = useMemo(() => {
        let list = cases;
        if (scopeFilter === 'SELECTED_DATE' && selectedDate) {
            list = list.filter(c => c.date === selectedDate);
        }
        return list;
    }, [cases, scopeFilter, selectedDate]);

    // Build the Comprehensive Reconciliation Matrix
    const reconciliationData = useMemo((): ComparisonItem[] => {
        const itemMap = new Map<string, ComparisonItem>();

        // 1. Process all IHMS Cases
        for (const ihms of candidateIhmsCases) {
            if (!ihms.fileNumber && !ihms.patientName) continue;
            const key = (ihms.fileNumber || '').trim() || `ihms_name_${ihms.patientName.trim()}`;

            if (!itemMap.has(key)) {
                itemMap.set(key, {
                    key,
                    fileNumber: (ihms.fileNumber || '').trim(),
                    patientName: ihms.patientName || '',
                    status: 'MISSING_IN_PACS', // Default until matched
                    inIHMS: true,
                    ihmsCase: ihms,
                    ihmsModality: ihms.modality,
                    ihmsSerial: ihms.modalitySerial,
                    ihmsExam: ihms.examName || (ihms.examList ? ihms.examList.join(', ') : ''),
                    ihmsTime: ihms.time,
                    ihmsDate: ihms.date,
                    ihmsTech: ihms.technicianName,
                    ihmsDoctor: ihms.doctorName,
                    inPACS: false
                });
            } else {
                // Multi-exam in IHMS for same patient
                const existing = itemMap.get(key)!;
                if (!existing.ihmsCase) {
                    existing.ihmsCase = ihms;
                    existing.inIHMS = true;
                    existing.ihmsModality = ihms.modality;
                    existing.ihmsSerial = ihms.modalitySerial;
                    existing.ihmsExam = ihms.examName;
                    existing.ihmsTime = ihms.time;
                    existing.ihmsDate = ihms.date;
                    existing.ihmsTech = ihms.technicianName;
                    existing.ihmsDoctor = ihms.doctorName;
                }
            }
        }

        // 2. Process Incoming Queue if enabled
        if (includeIncomingQueue) {
            for (const inc of incomingQueue) {
                if (!inc.fileNumber && !inc.patientName) continue;
                const key = (inc.fileNumber || '').trim() || `ihms_queue_${inc.patientName.trim()}`;

                if (!itemMap.has(key)) {
                    itemMap.set(key, {
                        key,
                        fileNumber: (inc.fileNumber || '').trim(),
                        patientName: inc.patientName || '',
                        status: 'MISSING_IN_PACS',
                        inIHMS: true,
                        ihmsQueueItem: inc,
                        ihmsModality: inc.modality,
                        ihmsSerial: txt('في الانتظار', 'In Queue'),
                        ihmsExam: inc.examName,
                        ihmsTime: inc.time,
                        ihmsDate: inc.date,
                        ihmsDoctor: inc.doctorName,
                        inPACS: false
                    });
                }
            }
        }

        // 3. Match PACS Records against IHMS Data
        for (const pacs of pacsRecords) {
            const key = (pacs.fileNumber || '').trim() || `pacs_name_${pacs.patientName.trim()}`;
            
            // Check exact MRN match or clean number match
            let matchedItem = itemMap.get(key);

            // Fuzzy match by patient name if not found by MRN
            if (!matchedItem && pacs.patientName && pacs.patientName.length > 4) {
                const pacsNameClean = pacs.patientName.toLowerCase().replace(/[^a-z\u0600-\u06FF]/g, '');
                for (const item of itemMap.values()) {
                    const itemNameClean = item.patientName.toLowerCase().replace(/[^a-z\u0600-\u06FF]/g, '');
                    if (pacsNameClean.includes(itemNameClean) || itemNameClean.includes(pacsNameClean)) {
                        matchedItem = item;
                        break;
                    }
                }
            }

            if (matchedItem) {
                // Matched in both IHMS and PACS!
                matchedItem.inPACS = true;
                if (!matchedItem.pacsRecord) {
                    matchedItem.pacsRecord = pacs;
                    matchedItem.pacsModality = pacs.modality;
                    matchedItem.pacsExam = pacs.examName;
                    matchedItem.pacsAccession = pacs.accessionNo;
                    matchedItem.pacsTime = pacs.time;
                    matchedItem.pacsDate = pacs.date;
                    matchedItem.pacsGender = pacs.gender;
                    matchedItem.pacsAge = pacs.age;
                    matchedItem.pacsAllRecords = [pacs];
                } else {
                    matchedItem.pacsAllRecords?.push(pacs);
                }

                // Check modality match
                if (matchedItem.ihmsModality && matchedItem.pacsModality && matchedItem.ihmsModality !== matchedItem.pacsModality) {
                    matchedItem.status = 'MODALITY_MISMATCH';
                    matchedItem.discrepancyNote = txt(
                        `القسم في الباكس (${matchedItem.pacsModality}) يختلف عن الـ IHMS (${matchedItem.ihmsModality})`,
                        `Modality in PACS (${matchedItem.pacsModality}) differs from IHMS (${matchedItem.ihmsModality})`
                    );
                } else {
                    matchedItem.status = 'MATCHED';
                }
            } else {
                // In PACS Only (Missing in IHMS)
                itemMap.set(key, {
                    key,
                    fileNumber: pacs.fileNumber,
                    patientName: pacs.patientName,
                    status: 'MISSING_IN_IHMS',
                    inIHMS: false,
                    inPACS: true,
                    pacsRecord: pacs,
                    pacsAllRecords: [pacs],
                    pacsModality: pacs.modality,
                    pacsExam: pacs.examName,
                    pacsAccession: pacs.accessionNo,
                    pacsTime: pacs.time,
                    pacsDate: pacs.date,
                    pacsGender: pacs.gender,
                    pacsAge: pacs.age
                });
            }
        }

        return Array.from(itemMap.values());
    }, [candidateIhmsCases, incomingQueue, pacsRecords, includeIncomingQueue, txt]);

    // Filtered comparison items
    const filteredItems = useMemo(() => {
        return reconciliationData.filter(item => {
            // Status Filter
            if (filterStatus !== 'ALL' && item.status !== filterStatus) return false;

            // Modality Filter
            if (filterModality !== 'ALL') {
                const itemMod = item.pacsModality || item.ihmsModality;
                if (itemMod !== filterModality) return false;
            }

            // Search Query
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const matchMRN = item.fileNumber.toLowerCase().includes(q);
                const matchName = item.patientName.toLowerCase().includes(q);
                const matchAcn = item.pacsAccession?.toLowerCase().includes(q);
                const matchExam = item.pacsExam?.toLowerCase().includes(q) || item.ihmsExam?.toLowerCase().includes(q);
                const matchSerial = item.ihmsSerial?.toLowerCase().includes(q);
                if (!matchMRN && !matchName && !matchAcn && !matchExam && !matchSerial) return false;
            }

            return true;
        });
    }, [reconciliationData, filterStatus, filterModality, searchQuery]);

    // Statistics & Summary Metrics
    const metrics = useMemo(() => {
        const totalIhms = reconciliationData.filter(i => i.inIHMS).length;
        const totalPacs = pacsRecords.length;
        const matched = reconciliationData.filter(i => i.status === 'MATCHED').length;
        const missingInPacs = reconciliationData.filter(i => i.status === 'MISSING_IN_PACS').length;
        const missingInIhms = reconciliationData.filter(i => i.status === 'MISSING_IN_IHMS').length;
        const modalityMismatch = reconciliationData.filter(i => i.status === 'MODALITY_MISMATCH').length;
        const totalUnique = reconciliationData.length;

        const reconciliationRate = totalIhms > 0 ? Math.round((matched / totalIhms) * 100) : 0;

        return {
            totalIhms,
            totalPacs,
            matched,
            missingInPacs,
            missingInIhms,
            modalityMismatch,
            totalUnique,
            reconciliationRate
        };
    }, [reconciliationData, pacsRecords]);

    // Load Sample PACS Data for instant testing
    const loadSampleData = () => {
        const sample = `ABDULRUHMAN MOHD 27Y, Unknown (O)ID: 1373724DoB: Jan 1, 1800		Open images
Open images
	
US - US_UNKNOWNAcn: US22802Aug 30, 2026 6:14 AM	
	
CR - CR_UNKNOWNAcn:Aug 30, 2026 6:12 AM	
	ABOKOR MOHD, Unknown (M)ID: 1627313DoB: Jan 1, 1966		Open images
Open images
	
CR - CR_Chest - 1 ViewAcn: XRAug 30, 2026 8:27 AM	
	
CR - CR_UNKNOWNAcn: XR38195Aug 30, 2026 2:49 AM	
	
CT - CT_HEAD PLAINAcn: CT58207Aug 30, 2026 2:45 AM	
	
US - US_UNKNOWNAcn: US22798Aug 30, 2026 2:31 AM	
	AHMED ABED, Unknown (O)ID: 1627202DoB: Jan 1, 1800`;
        setPacsRawText(sample);
        showToast(txt('تم تحميل بيانات باكس نموذجية للمعاينة والمطابقة', 'Loaded sample PACS dataset for testing'), 'success');
    };

    // Copy Missing MRNs to Clipboard
    const copyMissingMRNs = (type: 'MISSING_IN_PACS' | 'MISSING_IN_IHMS') => {
        const list = reconciliationData
            .filter(i => i.status === type && i.fileNumber)
            .map(i => `${i.fileNumber}\t${i.patientName}\t${i.pacsModality || i.ihmsModality || ''}`);

        if (list.length === 0) {
            showToast(txt('لا توجد حالات في هذه الفئة', 'No items in this category'), 'info');
            return;
        }

        navigator.clipboard.writeText(list.join('\n'));
        showToast(txt(`تم نسخ ${list.length} رقم ملف إلى الحافظة`, `Copied ${list.length} MRNs to clipboard`), 'success');
    };

    // Export Comparison Report to Excel
    const exportReconciliationExcel = () => {
        if (filteredItems.length === 0) {
            showToast(txt('لا توجد بيانات مطابقة للتصدير', 'No comparison data to export'), 'error');
            return;
        }

        const data = filteredItems.map((item, idx) => {
            let statusText = '';
            if (item.status === 'MATCHED') statusText = 'مطابق (Matched)';
            else if (item.status === 'MISSING_IN_PACS') statusText = 'ناقص في الباكس (Missing in PACS)';
            else if (item.status === 'MISSING_IN_IHMS') statusText = 'غير مسجل بالـ IHMS (PACS Only)';
            else if (item.status === 'MODALITY_MISMATCH') statusText = 'اختلاف القسم (Modality Mismatch)';

            return {
                '#': idx + 1,
                'حالة المطابقة (Audit Status)': statusText,
                'رقم الملف (MRN)': item.fileNumber || '-',
                'اسم المريض (Patient Name)': item.patientName || '-',
                'مسجل بالـ IHMS؟': item.inIHMS ? 'نعم (Yes)' : 'لا (No)',
                'رقم الأشعة بالـ IHMS': item.ihmsSerial || '-',
                'القسم بالـ IHMS': item.ihmsModality || '-',
                'الفحص المطلوب (IHMS Exam)': item.ihmsExam || '-',
                'وقت التسجيل (IHMS Time)': item.ihmsTime || '-',
                'القائم بالفحص (Tech)': item.ihmsTech || '-',
                'موجود بالباكس؟ (In PACS)': item.inPACS ? 'نعم (Yes)' : 'لا (No)',
                'القسم بالباكس (PACS Modality)': item.pacsModality || '-',
                'فحص الباكس (PACS Exam)': item.pacsExam || '-',
                'رقم الأكسشن (Acn)': item.pacsAccession || '-',
                'توقيت الباكس (PACS Time)': `${item.pacsDate || ''} ${item.pacsTime || ''}`.trim() || '-',
                'ملاحظات الاختلاف': item.discrepancyNote || '-'
            };
        });

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'PACS_vs_IHMS_Audit');
        const filename = `PACS_IHMS_Reconciliation_${selectedDate || 'Report'}.xlsx`;
        XLSX.writeFile(wb, filename);
        showToast(txt(`تم تصدير تقرير المطابقة إلى (${filename})`, `Exported audit report to (${filename})`), 'success');
    };

    // Add all Missing PACS cases to IHMS logbook in 1-Click
    const handleAddAllMissingToLogbook = () => {
        const missingInIhms = reconciliationData.filter(i => i.status === 'MISSING_IN_IHMS' && i.pacsRecord);
        if (missingInIhms.length === 0) {
            showToast(txt('لا توجد حالات ناقصة لإضافتها', 'No missing cases to add'), 'info');
            return;
        }

        if (confirm(txt(`هل تريد إضافة عدد (${missingInIhms.length}) حالة من الباكس إلى سجل الـ IHMS وتوليد أرقام متسلسلة لها فوراً؟`, `Do you want to add (${missingInIhms.length}) cases from PACS into IHMS Logbook now?`))) {
            if (onAddMultiplePacsCases) {
                onAddMultiplePacsCases(missingInIhms.map(i => i.pacsRecord!));
            } else {
                missingInIhms.forEach(i => onAddPacsCaseToLogbook(i.pacsRecord!));
            }
            showToast(txt(`تمت إضافة (${missingInIhms.length}) حالة إلى سجل الأشعة بنجاح`, `Added (${missingInIhms.length}) cases to logbook`), 'success');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-5">
            <div 
                className="bg-white rounded-3xl shadow-2xl max-w-7xl w-full max-h-[95vh] flex flex-col border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                dir={isEn ? "ltr" : "rtl"}
            >
                {/* MODAL HEADER */}
                <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 border-b border-indigo-900/50 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-600/80 border border-indigo-400/30 flex items-center justify-center text-xl shadow-lg">
                            <i className="fas fa-sync-alt animate-spin-slow text-amber-300"></i>
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-lg font-black tracking-tight">
                                    {txt('مطابقة ومقارنة سجل الـ IHMS مع الباكس (PACS vs IHMS)', 'PACS vs IHMS Reconciliation & Audit Engine')}
                                </h3>
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                    v4.0 Smart Audit
                                </span>
                            </div>
                            <p className="text-xs text-slate-300 font-medium mt-0.5">
                                {txt('المطابقة الفورية لأرقام الملفات والفحوصات للتأكد من تصوير كافة مرضى الـ IHMS ورصد الحالات غير المسجلة', 'Instant MRN audit to verify all IHMS patients are scanned on PACS & catch unregistered exams')}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={exportReconciliationExcel}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow transition cursor-pointer"
                        >
                            <i className="fas fa-file-excel"></i>
                            <span>{txt('تصدير إكسل', 'Export Excel')}</span>
                        </button>
                        <button
                            onClick={onClose}
                            className="text-slate-400 hover:text-white w-9 h-9 rounded-xl flex items-center justify-center hover:bg-white/10 transition cursor-pointer"
                        >
                            <i className="fas fa-times text-lg"></i>
                        </button>
                    </div>
                </div>

                {/* METRICS SUMMARY BAR */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 p-4 bg-slate-50 border-b border-slate-200">
                    {/* 1. IHMS Total */}
                    <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
                        <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold mb-1">
                            <span>{txt('إجمالي الـ IHMS', 'Total IHMS')}</span>
                            <i className="fas fa-hospital text-indigo-500"></i>
                        </div>
                        <div className="text-xl font-black text-slate-900 font-mono">
                            {metrics.totalIhms} <span className="text-[10px] text-slate-400 font-sans font-bold">{txt('حالة', 'cases')}</span>
                        </div>
                    </div>

                    {/* 2. PACS Total */}
                    <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
                        <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold mb-1">
                            <span>{txt('إجمالي الباكس (PACS)', 'Total PACS')}</span>
                            <i className="fas fa-x-ray text-teal-500"></i>
                        </div>
                        <div className="text-xl font-black text-slate-900 font-mono">
                            {metrics.totalPacs} <span className="text-[10px] text-slate-400 font-sans font-bold">{txt('فحص', 'studies')}</span>
                        </div>
                    </div>

                    {/* 3. Matched in Both */}
                    <div 
                        onClick={() => setFilterStatus(filterStatus === 'MATCHED' ? 'ALL' : 'MATCHED')}
                        className={`p-3 rounded-2xl border transition-all cursor-pointer shadow-xs ${
                            filterStatus === 'MATCHED' 
                                ? 'bg-emerald-100 border-emerald-400 ring-2 ring-emerald-400' 
                                : 'bg-emerald-50/80 hover:bg-emerald-100/80 border-emerald-200'
                        }`}
                    >
                        <div className="flex items-center justify-between text-emerald-800 text-[11px] font-bold mb-1">
                            <span>{txt('🟢 مطابق بالكامل', '🟢 Matched Both')}</span>
                            <i className="fas fa-check-double text-emerald-600"></i>
                        </div>
                        <div className="text-xl font-black text-emerald-950 font-mono flex items-baseline justify-between">
                            <span>{metrics.matched}</span>
                            <span className="text-xs font-bold text-emerald-700 bg-emerald-200/70 px-1.5 py-0.5 rounded-md">
                                {metrics.reconciliationRate}%
                            </span>
                        </div>
                    </div>

                    {/* 4. Missing in PACS (In IHMS Only) */}
                    <div 
                        onClick={() => setFilterStatus(filterStatus === 'MISSING_IN_PACS' ? 'ALL' : 'MISSING_IN_PACS')}
                        className={`p-3 rounded-2xl border transition-all cursor-pointer shadow-xs ${
                            filterStatus === 'MISSING_IN_PACS' 
                                ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-400' 
                                : 'bg-amber-50/80 hover:bg-amber-100/80 border-amber-200'
                        }`}
                    >
                        <div className="flex items-center justify-between text-amber-800 text-[11px] font-bold mb-1">
                            <span>{txt('🟡 ناقص في الباكس', '🟡 Missing in PACS')}</span>
                            <i className="fas fa-exclamation-triangle text-amber-600"></i>
                        </div>
                        <div className="text-xl font-black text-amber-950 font-mono">
                            {metrics.missingInPacs} <span className="text-[10px] text-amber-700 font-sans font-bold">{txt('غير مصور', 'unscanned')}</span>
                        </div>
                    </div>

                    {/* 5. Missing in IHMS (In PACS Only) */}
                    <div 
                        onClick={() => setFilterStatus(filterStatus === 'MISSING_IN_IHMS' ? 'ALL' : 'MISSING_IN_IHMS')}
                        className={`p-3 rounded-2xl border transition-all cursor-pointer shadow-xs ${
                            filterStatus === 'MISSING_IN_IHMS' 
                                ? 'bg-rose-100 border-rose-400 ring-2 ring-rose-400' 
                                : 'bg-rose-50/80 hover:bg-rose-100/80 border-rose-200'
                        }`}
                    >
                        <div className="flex items-center justify-between text-rose-800 text-[11px] font-bold mb-1">
                            <span>{txt('🔴 غير مسجل بالـ IHMS', '🔴 Missing in IHMS')}</span>
                            <i className="fas fa-user-plus text-rose-600"></i>
                        </div>
                        <div className="text-xl font-black text-rose-950 font-mono">
                            {metrics.missingInIhms} <span className="text-[10px] text-rose-700 font-sans font-bold">{txt('بالباكس فقط', 'PACS only')}</span>
                        </div>
                    </div>

                    {/* 6. Modality Mismatch */}
                    <div 
                        onClick={() => setFilterStatus(filterStatus === 'MODALITY_MISMATCH' ? 'ALL' : 'MODALITY_MISMATCH')}
                        className={`p-3 rounded-2xl border transition-all cursor-pointer shadow-xs ${
                            filterStatus === 'MODALITY_MISMATCH' 
                                ? 'bg-purple-100 border-purple-400 ring-2 ring-purple-400' 
                                : 'bg-purple-50/80 hover:bg-purple-100/80 border-purple-200'
                        }`}
                    >
                        <div className="flex items-center justify-between text-purple-800 text-[11px] font-bold mb-1">
                            <span>{txt('⚠️ اختلاف القسم', '⚠️ Modality Diff')}</span>
                            <i className="fas fa-random text-purple-600"></i>
                        </div>
                        <div className="text-xl font-black text-purple-950 font-mono">
                            {metrics.modalityMismatch} <span className="text-[10px] text-purple-700 font-sans font-bold">{txt('حالة', 'cases')}</span>
                        </div>
                    </div>
                </div>

                {/* MAIN BODY: SPLIT VIEW (PASTE INPUT ACCORDION / TOGGLE + AUDIT TABLE) */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                    
                    {/* PACS TEXT INPUT AREA */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <label className="text-xs font-black text-slate-800 flex items-center gap-2">
                                <i className="fas fa-clipboard-check text-indigo-600"></i>
                                <span>{txt('الصق بيانات المرضى المنسوخة من الباكس هنا (Paste PACS Data):', 'Paste copied PACS data here:')}</span>
                            </label>
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={loadSampleData}
                                    className="px-2.5 py-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg cursor-pointer transition"
                                >
                                    <i className="fas fa-magic mr-1"></i>
                                    <span>{txt('تجربة بيانات نموذجية', 'Load Sample PACS')}</span>
                                </button>
                                {pacsRawText && (
                                    <button
                                        type="button"
                                        onClick={() => setPacsRawText('')}
                                        className="px-2 py-1 text-[11px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg cursor-pointer transition"
                                    >
                                        <i className="fas fa-trash-alt mr-1"></i>
                                        <span>{txt('مسح النص', 'Clear')}</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        <textarea
                            rows={3}
                            value={pacsRawText}
                            onChange={e => setPacsRawText(e.target.value)}
                            placeholder={txt(
                                'الصق النص المنسوخ من الباكس هنا مباشرة (مثل:\nABDULRUHMAN MOHD 27Y, Unknown (O)ID: 1373724DoB: Jan 1, 1800\nUS - US_UNKNOWNAcn: US22802Aug 30, 2026 6:14 AM\nCR - CR_UNKNOWNAcn:Aug 30, 2026 6:12 AM)',
                                'Paste text copied directly from PACS here...'
                            )}
                            className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs font-mono text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none placeholder:text-slate-400 leading-relaxed"
                        />

                        {pacsRecords.length > 0 && (
                            <div className="mt-2 flex flex-wrap items-center justify-between text-[11px] text-slate-500 font-medium">
                                <span className="text-emerald-700 font-bold flex items-center gap-1">
                                    <i className="fas fa-check-circle text-emerald-600"></i>
                                    {txt(`تم تحليل ${pacsRecords.length} فحص باكس بنجاح`, `Successfully parsed ${pacsRecords.length} PACS studies`)}
                                </span>
                                <span className="text-slate-400">
                                    {txt('يتم تحديث المطابقة لحظياً مع سجل الـ IHMS', 'Audit updates automatically in real-time')}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* FILTER & ACTIONS TOOLBAR */}
                    <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                        {/* Status Filter Chips */}
                        <div className="flex flex-wrap items-center gap-1.5">
                            <button
                                onClick={() => setFilterStatus('ALL')}
                                className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
                                    filterStatus === 'ALL'
                                        ? 'bg-slate-900 text-white shadow-xs'
                                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                                }`}
                            >
                                {txt('كافة الحالات', 'All Cases')} ({reconciliationData.length})
                            </button>
                            <button
                                onClick={() => setFilterStatus('MATCHED')}
                                className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1 ${
                                    filterStatus === 'MATCHED'
                                        ? 'bg-emerald-600 text-white shadow-xs'
                                        : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                                }`}
                            >
                                <i className="fas fa-check text-[10px]"></i>
                                <span>{txt('مطابق فقط', 'Matched Only')}</span> ({metrics.matched})
                            </button>
                            <button
                                onClick={() => setFilterStatus('MISSING_IN_PACS')}
                                className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1 ${
                                    filterStatus === 'MISSING_IN_PACS'
                                        ? 'bg-amber-500 text-slate-950 shadow-xs'
                                        : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
                                }`}
                            >
                                <i className="fas fa-exclamation text-[10px]"></i>
                                <span>{txt('ناقص بالباكس', 'Missing in PACS')}</span> ({metrics.missingInPacs})
                            </button>
                            <button
                                onClick={() => setFilterStatus('MISSING_IN_IHMS')}
                                className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1 ${
                                    filterStatus === 'MISSING_IN_IHMS'
                                        ? 'bg-rose-600 text-white shadow-xs'
                                        : 'bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100'
                                }`}
                            >
                                <i className="fas fa-plus text-[10px]"></i>
                                <span>{txt('غير مسجل بالـ IHMS', 'Missing in IHMS')}</span> ({metrics.missingInIhms})
                            </button>
                        </div>

                        {/* Modality & Scope Controls */}
                        <div className="flex flex-wrap items-center gap-2">
                            {/* Modality Filter */}
                            <select
                                value={filterModality}
                                onChange={e => setFilterModality(e.target.value)}
                                className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                            >
                                <option value="ALL">{txt('كافة الأقسام', 'All Modalities')}</option>
                                <option value="X-RAY">X-RAY (الأشعة العادية)</option>
                                <option value="CT">CT (المقطعية)</option>
                                <option value="MRI">MRI (الرنين)</option>
                                <option value="US">US (السونار)</option>
                                <option value="FLUO">FLUO (الفلورو والصبغة)</option>
                                <option value="MAMMO">MAMMO (الماموجرام)</option>
                            </select>

                            {/* Scope Filter: Selected Date vs All Dates */}
                            <select
                                value={scopeFilter}
                                onChange={e => setScopeFilter(e.target.value as any)}
                                className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                            >
                                <option value="SELECTED_DATE">{txt(`تاريخ اليوم (${selectedDate})`, `Selected Date (${selectedDate})`)}</option>
                                <option value="ALL_DATES">{txt('كافة الأيام المسجلة بالسجل', 'All Dates in Logbook')}</option>
                            </select>

                            {/* Search Input */}
                            <div className="relative">
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder={txt('بحث برقم الملف / الاسم...', 'Search MRN / Name...')}
                                    className="bg-white border border-slate-300 rounded-xl pl-8 pr-3 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-44 placeholder:text-slate-400"
                                />
                                <i className="fas fa-search absolute left-2.5 top-2.5 text-slate-400 text-xs"></i>
                            </div>
                        </div>
                    </div>

                    {/* BULK ACTIONS ROW (FOR MISSING CASES) */}
                    {metrics.missingInIhms > 0 && (
                        <div className="bg-rose-50 border border-rose-200 p-3 rounded-2xl flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2 text-rose-900 text-xs">
                                <i className="fas fa-exclamation-circle text-rose-600 text-sm"></i>
                                <span className="font-bold">
                                    {txt(
                                        `تم اكتشاف عدد (${metrics.missingInIhms}) مريض مصورين على الباكس وغير مسجلين في سجل الـ IHMS`,
                                        `Found (${metrics.missingInIhms}) patients scanned on PACS but not registered in IHMS logbook`
                                    )}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => copyMissingMRNs('MISSING_IN_IHMS')}
                                    className="bg-white hover:bg-rose-100 text-rose-700 font-bold px-3 py-1.5 rounded-xl text-xs border border-rose-300 transition cursor-pointer flex items-center gap-1"
                                >
                                    <i className="fas fa-copy"></i>
                                    <span>{txt('نسخ أرقام الملفات', 'Copy MRNs')}</span>
                                </button>
                                <button
                                    onClick={handleAddAllMissingToLogbook}
                                    className="bg-rose-600 hover:bg-rose-500 text-white font-black px-3.5 py-1.5 rounded-xl text-xs shadow-sm transition cursor-pointer flex items-center gap-1.5"
                                >
                                    <i className="fas fa-bolt text-amber-300"></i>
                                    <span>{txt('إضافة كافة الحالات للسجل فوراً', 'Add All to Logbook')}</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* RECONCILIATION DATA TABLE */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs text-start border-collapse">
                                <thead>
                                    <tr className="bg-slate-900 text-white text-[11px] font-black uppercase tracking-wider">
                                        <th className="p-3 text-center w-10">#</th>
                                        <th className="p-3 text-center w-36">{txt('حالة المطابقة', 'Audit Status')}</th>
                                        <th className="p-3 w-28 font-mono">{txt('رقم الملف (MRN)', 'File No. (MRN)')}</th>
                                        <th className="p-3">{txt('اسم المريض', 'Patient Name')}</th>
                                        <th className="p-3 bg-indigo-950/80 border-x border-indigo-900">{txt('بيانات الـ IHMS (السجل)', 'IHMS Logbook Record')}</th>
                                        <th className="p-3 bg-teal-950/80 border-r border-teal-900">{txt('بيانات الباكس (PACS)', 'PACS Study Record')}</th>
                                        <th className="p-3 text-center w-32">{txt('الإجراء السريع', 'Action')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 font-medium">
                                    {filteredItems.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="p-10 text-center text-slate-400">
                                                <i className="fas fa-inbox text-4xl mb-2 block text-slate-300"></i>
                                                <p className="font-bold text-sm text-slate-600">{txt('لا توجد نتائج مطابقة للشروط المحددة', 'No matching cases found')}</p>
                                                <p className="text-xs text-slate-400 mt-1">{txt('تأكد من لصق نص الباكس أعلاه أو تغيير خيارات الفلترة', 'Paste PACS data above or adjust filter options')}</p>
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredItems.map((item, idx) => {
                                            const isMatched = item.status === 'MATCHED';
                                            const isMissingInPacs = item.status === 'MISSING_IN_PACS';
                                            const isMissingInIhms = item.status === 'MISSING_IN_IHMS';
                                            const isMismatch = item.status === 'MODALITY_MISMATCH';

                                            return (
                                                <tr 
                                                    key={item.key + idx}
                                                    className={`hover:bg-slate-50 transition-colors ${
                                                        isMatched 
                                                            ? 'bg-emerald-50/20' 
                                                            : isMissingInPacs 
                                                            ? 'bg-amber-50/30' 
                                                            : isMissingInIhms 
                                                            ? 'bg-rose-50/40 font-semibold' 
                                                            : 'bg-purple-50/30'
                                                    }`}
                                                >
                                                    {/* Row # */}
                                                    <td className="p-3 text-center font-mono font-bold text-slate-400">
                                                        {idx + 1}
                                                    </td>

                                                    {/* Status Badge */}
                                                    <td className="p-3 text-center">
                                                        {isMatched && (
                                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs">
                                                                <i className="fas fa-check-circle text-emerald-600"></i>
                                                                <span>{txt('مطابق بالكامل', 'Matched')}</span>
                                                            </span>
                                                        )}
                                                        {isMissingInPacs && (
                                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 shadow-xs" title={txt("مسجل في IHMS ولم يتم العثور عليه في الباكس", "In IHMS but not found in PACS")}>
                                                                <i className="fas fa-exclamation-triangle text-amber-600"></i>
                                                                <span>{txt('ناقص في الباكس', 'Missing in PACS')}</span>
                                                            </span>
                                                        )}
                                                        {isMissingInIhms && (
                                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300 shadow-xs animate-pulse" title={txt("تم تصويره على الباكس وغير مسجل بالـ IHMS", "Found in PACS but not registered in IHMS")}>
                                                                <i className="fas fa-user-plus text-rose-600"></i>
                                                                <span>{txt('غير مسجل بالـ IHMS', 'Missing in IHMS')}</span>
                                                            </span>
                                                        )}
                                                        {isMismatch && (
                                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-purple-100 text-purple-900 border border-purple-300 shadow-xs">
                                                                <i className="fas fa-random text-purple-600"></i>
                                                                <span>{txt('اختلاف القسم', 'Mismatch')}</span>
                                                            </span>
                                                        )}
                                                    </td>

                                                    {/* File Number / MRN */}
                                                    <td className="p-3 font-mono font-black text-slate-900 text-sm">
                                                        <div className="flex items-center gap-1.5">
                                                            <span>{item.fileNumber || '-'}</span>
                                                            {item.fileNumber && (
                                                                <button
                                                                    onClick={() => {
                                                                        navigator.clipboard.writeText(item.fileNumber);
                                                                        showToast(txt(`تم نسخ رقم الملف (${item.fileNumber})`, `Copied MRN (${item.fileNumber})`), 'info');
                                                                    }}
                                                                    className="text-slate-300 hover:text-indigo-600 transition cursor-pointer"
                                                                    title={txt("نسخ رقم الملف", "Copy MRN")}
                                                                >
                                                                    <i className="fas fa-copy text-[10px]"></i>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>

                                                    {/* Patient Name */}
                                                    <td className="p-3 font-bold text-slate-900">
                                                        <div>{item.patientName}</div>
                                                        {item.pacsAge && (
                                                            <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                                                                {item.pacsAge} {item.pacsGender ? `• ${item.pacsGender}` : ''}
                                                            </div>
                                                        )}
                                                    </td>

                                                    {/* IHMS Record Column */}
                                                    <td className="p-3 bg-indigo-50/40 border-x border-indigo-100/80">
                                                        {item.inIHMS ? (
                                                            <div className="space-y-1">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-mono font-black text-xs px-2 py-0.5 rounded bg-indigo-100 text-indigo-900 border border-indigo-200">
                                                                        {item.ihmsSerial || '-'}
                                                                    </span>
                                                                    <span className="text-[11px] font-bold text-slate-700 truncate max-w-[200px]" title={item.ihmsExam}>
                                                                        {item.ihmsExam || '-'}
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center gap-3 text-[10px] text-slate-500 font-medium">
                                                                    {item.ihmsTime && (
                                                                        <span><i className="far fa-clock mr-0.5 text-indigo-500"></i> {item.ihmsTime}</span>
                                                                    )}
                                                                    {item.ihmsTech && (
                                                                        <span><i className="fas fa-user-tag mr-0.5 text-indigo-500"></i> {item.ihmsTech}</span>
                                                                    )}
                                                                    {item.ihmsDoctor && (
                                                                        <span className="truncate max-w-[120px]"><i className="fas fa-user-md mr-0.5 text-indigo-500"></i> {item.ihmsDoctor}</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-400 italic text-[11px] font-normal">
                                                                {txt('غير مسجل في سجل الـ IHMS', 'Not registered in IHMS')}
                                                            </span>
                                                        )}
                                                    </td>

                                                    {/* PACS Record Column */}
                                                    <td className="p-3 bg-teal-50/40 border-r border-teal-100/80">
                                                        {item.inPACS ? (
                                                            <div className="space-y-1">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-mono font-black text-[11px] px-2 py-0.5 rounded bg-teal-100 text-teal-900 border border-teal-200">
                                                                        {item.pacsModality || item.pacsRecord?.rawModality}
                                                                    </span>
                                                                    <span className="text-[11px] font-bold text-slate-800 truncate max-w-[220px]" title={item.pacsExam}>
                                                                        {item.pacsExam || '-'}
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center gap-3 text-[10px] text-slate-500 font-medium">
                                                                    {item.pacsAccession && (
                                                                        <span className="font-mono font-bold text-teal-700 bg-teal-50 px-1 rounded border border-teal-200">
                                                                            Acn: {item.pacsAccession}
                                                                        </span>
                                                                    )}
                                                                    {item.pacsTime && (
                                                                        <span><i className="far fa-clock mr-0.5 text-teal-600"></i> {item.pacsDate || ''} {item.pacsTime}</span>
                                                                    )}
                                                                </div>
                                                                {item.pacsAllRecords && item.pacsAllRecords.length > 1 && (
                                                                    <div className="text-[10px] text-indigo-600 font-bold">
                                                                        + {item.pacsAllRecords.length - 1} {txt('فحوصات أخرى بالباكس', 'more studies in PACS')}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span className="text-amber-600 italic text-[11px] font-normal flex items-center gap-1">
                                                                <i className="fas fa-times-circle"></i>
                                                                <span>{txt('لم يتم العثور عليه في الباكس', 'Not found in PACS')}</span>
                                                            </span>
                                                        )}
                                                    </td>

                                                    {/* Actions */}
                                                    <td className="p-3 text-center">
                                                        {isMissingInIhms && item.pacsRecord && (
                                                            <button
                                                                onClick={() => onAddPacsCaseToLogbook(item.pacsRecord!)}
                                                                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3 py-1.5 rounded-xl text-xs shadow-xs transition flex items-center justify-center gap-1 w-full cursor-pointer"
                                                                title={txt("إضافة المريض فوراً إلى سجل الـ IHMS وتوليد رقم مسلسل", "Add patient to IHMS Logbook and assign serial")}
                                                            >
                                                                <i className="fas fa-plus"></i>
                                                                <span>{txt('تسجيل بالسجل', 'Add to Logbook')}</span>
                                                            </button>
                                                        )}

                                                        {isMissingInPacs && (
                                                            <button
                                                                onClick={() => {
                                                                    navigator.clipboard.writeText(item.fileNumber);
                                                                    showToast(txt(`تم نسخ رقم الملف (${item.fileNumber}) للبحث في الباكس`, `Copied MRN (${item.fileNumber}) to search in PACS`), 'info');
                                                                }}
                                                                className="bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold px-2.5 py-1.5 rounded-xl text-[11px] border border-amber-300 transition flex items-center justify-center gap-1 w-full cursor-pointer"
                                                            >
                                                                <i className="fas fa-search"></i>
                                                                <span>{txt('بحث بالباكس', 'Find in PACS')}</span>
                                                            </button>
                                                        )}

                                                        {isMatched && (
                                                            <span className="text-emerald-600 font-bold text-xs flex items-center justify-center gap-1">
                                                                <i className="fas fa-check text-xs"></i>
                                                                <span>{txt('مكتمل', 'Done')}</span>
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* MODAL FOOTER */}
                <div className="bg-slate-50 p-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <i className="fas fa-info-circle text-indigo-500"></i>
                        <span>
                            {txt(
                                'تطابق أرقام الملفات يعتمد على رقم الـ MRN والتطابق الذكي للاسم والقسم.',
                                'Reconciliation uses MRN matching with smart fuzzy name & modality recognition.'
                            )}
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={exportReconciliationExcel}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                        >
                            <i className="fas fa-file-excel"></i>
                            <span>{txt('تنزيل شيت المطابقة (Excel)', 'Download Excel Audit')}</span>
                        </button>
                        <button
                            onClick={onClose}
                            className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-5 py-2 rounded-xl text-xs transition cursor-pointer"
                        >
                            {txt('إغلاق', 'Close')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PacsReconciliationModal;
