
import React, { useState, useCallback, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { db } from '../firebase'; 
// @ts-ignore
import { collection, addDoc, getDocs, deleteDoc, doc } from 'firebase/firestore'; 
import type { EmployeeSummary, ProcessedRecord } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { PrintHeader, PrintFooter } from '../components/PrintLayout';

declare global {
  interface Window {
    XLSX: any;
  }
}

// Updated Interface for specific columns
interface DetailedAttendanceRecord {
    employeeName: string;
    date: string;
    clockIn: string | null;
    clockOut: string | null;
    breakOut: string | null;
    breakIn: string | null;
    isModified?: boolean; // To track if we moved a midnight shift
    ignore?: boolean; // To mark rows that were merged into previous day
}

// --- SUB-COMPONENTS ---

const Loader: React.FC = () => (
  <div className="flex justify-center items-center p-12">
    <div className="relative">
        <div className="h-16 w-16 rounded-full border-t-4 border-b-4 border-sky-600 animate-spin"></div>
        <div className="absolute top-0 left-0 h-16 w-16 rounded-full border-t-4 border-b-4 border-sky-400 animate-ping opacity-30"></div>
    </div>
  </div>
);

const SummaryCard: React.FC<{ icon: React.ReactNode; label: string; value: string | number; color: string }> = ({ icon, label, value, color }) => (
  <div className={`p-5 rounded-2xl shadow-lg flex items-center gap-4 text-white ${color} transform transition-transform hover:scale-105 print:hidden`}>
    <div className="flex-shrink-0 bg-white/20 p-3 rounded-xl backdrop-blur-sm">
      {icon}
    </div>
    <div>
      <div className="text-2xl font-black">{value}</div>
      <p className="text-xs font-bold opacity-90 uppercase tracking-wide">{label}</p>
    </div>
  </div>
);

const FileUpload: React.FC<{ onFileUpload: (file: File) => void; isLoading: boolean }> = ({ onFileUpload, isLoading }) => {
  const { t } = useLanguage();
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent<HTMLDivElement | HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement | HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileUpload(e.dataTransfer.files[0]);
    }
  }, [onFileUpload]);
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
        onFileUpload(e.target.files[0]);
    }
  };

  return (
    <div className="text-center print:hidden">
      <label
        htmlFor="file-upload"
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        className={`relative flex flex-col items-center justify-center w-full h-64 rounded-3xl border-2 border-dashed p-6 transition-all duration-300
        ${dragActive ? 'border-sky-500 bg-sky-50 scale-105' : 'border-slate-300 bg-slate-50 hover:bg-white hover:border-sky-400'}
        ${isLoading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
      >
        <div className="w-20 h-20 bg-white rounded-full shadow-md flex items-center justify-center mb-4">
            <i className="fas fa-cloud-upload-alt text-4xl text-sky-500"></i>
        </div>
        <span className="text-lg font-bold text-slate-700">
          {t('att.upload.label')}
        </span>
        <span className="mt-2 text-xs font-bold text-slate-400 bg-slate-200 px-3 py-1 rounded-full">
            Supports Excel (XLSX, XLS) - Smart Detection
        </span>
        <input
            id="file-upload"
            name="file-upload"
            type="file"
            className="sr-only"
            accept=".xlsx,.xls"
            onChange={handleChange}
            disabled={isLoading}
        />
      </label>
       {isLoading && (
        <p className="mt-4 text-sm font-bold text-sky-600 animate-pulse">
          {t('loading')}
        </p>
      )}
    </div>
  );
};

// --- DATA TABLE COMPONENTS ---

const DetailRow: React.FC<{ record: ProcessedRecord }> = ({ record }) => {
    return (
        <tr className="bg-slate-50 text-xs border-b border-slate-100 last:border-0 hover:bg-slate-100 transition-colors print:bg-white print:border-slate-300">
            <td className="px-4 py-3 font-mono text-slate-600 print:text-black">{record.date}</td>
            <td className="px-4 py-3 font-medium text-slate-700 print:text-black">{record.day}</td>
            <td className="px-4 py-3 font-mono text-slate-500 dir-ltr text-right print:text-black">
                {/* Display multiple timestamps clearly */}
                {record.timestamps.map((ts, idx) => (
                    <div key={idx} className={`${idx > 0 ? 'mt-1 pt-1 border-t border-slate-200' : ''}`}>
                        {ts}
                    </div>
                ))}
            </td>
            <td className="px-4 py-3 font-bold text-center text-slate-800 print:text-black">{record.totalHours.toFixed(2)}</td>
            <td className="px-4 py-3 font-bold text-center text-emerald-600 print:text-black">{record.overtimeHours > 0 ? record.overtimeHours.toFixed(2) : '-'}</td>
            <td className="px-4 py-3 font-bold text-center text-red-600 print:text-black">{record.shortfallHours > 0 ? record.shortfallHours.toFixed(2) : '-'}</td>
            <td className="px-4 py-3 font-bold text-center text-amber-600 print:text-black">{record.latenessMinutes > 0 ? record.latenessMinutes : '-'}</td>
        </tr>
    );
};

const EmployeeRow: React.FC<{ employee: EmployeeSummary }> = ({ employee }) => {
    const { t } = useLanguage();
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <tr className={`border-b border-slate-100 hover:bg-slate-50 transition-all cursor-pointer print:break-inside-avoid print:border-slate-300 ${isOpen ? 'bg-slate-50 shadow-inner' : 'bg-white'}`} onClick={() => setIsOpen(!isOpen)}>
                <td className="px-6 py-4 font-bold text-slate-900 whitespace-nowrap flex items-center gap-3 print:text-black">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white print:hidden ${isOpen ? 'bg-indigo-500' : 'bg-slate-400'}`}>
                        {employee.employeeName.charAt(0)}
                    </div>
                    {employee.employeeName}
                </td>
                <td className="px-6 py-4 text-center font-mono font-bold text-slate-600 print:text-black">{employee.totalWorkDays}</td>
                <td className="px-6 py-4 text-center font-mono font-bold text-slate-600 print:text-black">{employee.fridaysWorked}</td>
                <td className="px-6 py-4 text-center">
                    <span className={`px-2 py-1 rounded-md font-bold text-xs ${employee.absentDays > 0 ? 'bg-red-100 text-red-700' : 'text-slate-400'} print:bg-transparent print:text-black`}>
                        {employee.absentDays}
                    </span>
                </td>
                <td className="px-6 py-4 text-center">
                    <span className={`px-2 py-1 rounded-md font-bold text-xs ${employee.totalOvertimeHours > 0 ? 'bg-emerald-100 text-emerald-700' : 'text-slate-400'} print:bg-transparent print:text-black`}>
                        {employee.totalOvertimeHours.toFixed(2)}
                    </span>
                </td>
                <td className="px-6 py-4 text-center font-mono text-amber-600 font-bold print:text-black">{employee.totalLatenessMinutes}</td>
                <td className="px-6 py-4 text-center text-slate-400 print:hidden">
                    <i className={`fas fa-chevron-${isOpen ? 'up' : 'down'} transition-transform duration-300`}></i>
                </td>
            </tr>
            {/* Always show details in Print mode, otherwise toggle */}
            {(isOpen) && (
                <tr className="print:table-row">
                    <td colSpan={8} className="p-0">
                        <div className="bg-slate-50/50 p-4 shadow-inner border-b border-slate-200 animate-fade-in print:bg-white print:shadow-none print:border-none print:p-2">
                            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden print:border-slate-800">
                                <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 flex items-center gap-2 print:bg-slate-200 print:border-slate-800">
                                    <i className="fas fa-list-alt text-indigo-500 print:hidden"></i>
                                    <h4 className="font-bold text-xs text-slate-600 print:text-black">{t('details')}: {employee.employeeName}</h4>
                                </div>
                                <table className="w-full text-right">
                                    <thead className="text-[10px] text-slate-500 uppercase bg-slate-50 font-bold border-b border-slate-100 print:bg-white print:text-black print:border-slate-800">
                                        <tr>
                                            <th className="px-4 py-2">{t('date')}</th>
                                            <th className="px-4 py-2">Day</th>
                                            <th className="px-4 py-2 text-right dir-ltr">Shifts (In &#8594; Out)</th>
                                            <th className="px-4 py-2 text-center">Total Hrs</th>
                                            <th className="px-4 py-2 text-center">OT (&#62;9h)</th>
                                            <th className="px-4 py-2 text-center">Short</th>
                                            <th className="px-4 py-2 text-center">Late</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {employee.records.map(record => <DetailRow key={record.id} record={record} />)}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}

const DataTable: React.FC<{ data: EmployeeSummary[] }> = ({ data }) => {
  const { t } = useLanguage();
  if (!data || data.length === 0) return <p className="text-center text-slate-500 py-8">No data available.</p>;

  return (
    <div className="relative overflow-hidden shadow-xl rounded-3xl bg-white border border-slate-200 print:shadow-none print:rounded-none print:border-none">
      <table className="w-full text-sm text-right text-slate-600 print:text-black">
        <thead className="text-xs text-slate-700 uppercase bg-slate-100 border-b border-slate-200 print:bg-white print:border-slate-900 print:text-black">
          <tr>
            <th scope="col" className="px-6 py-4 font-extrabold">{t('att.table.name')}</th>
            <th scope="col" className="px-6 py-4 font-extrabold text-center">{t('att.table.workdays')}</th>
            <th scope="col" className="px-6 py-4 font-extrabold text-center">{t('att.table.fridays')}</th>
            <th scope="col" className="px-6 py-4 font-extrabold text-center text-red-600 print:text-black">{t('att.table.absent')}</th>
            <th scope="col" className="px-6 py-4 font-extrabold text-center text-emerald-600 print:text-black">{t('att.table.overtime')}</th>
            <th scope="col" className="px-6 py-4 font-extrabold text-center text-amber-600 print:text-black">{t('att.table.late')}</th>
            <th scope="col" className="px-6 py-4 font-extrabold text-center print:hidden">{t('details')}</th>
          </tr>
        </thead>
        <tbody className="print:text-black">
            {data.map(employee => <EmployeeRow key={employee.employeeName} employee={employee} />)}
        </tbody>
      </table>
    </div>
  );
};

// --- LOGIC HELPERS ---

const timeToHours = (time: string | null): number => {
  if (!time || typeof time !== 'string' || !time.includes(':')) return 0;
  const [hours, minutes] = time.split(':').map(Number);
  return hours + minutes / 60;
};

// Convert 24h to 12h Format
const formatTime = (time: string | null): string => {
    if (!time) return '--:--';
    try {
        const [hStr, mStr] = time.split(':');
        let h = parseInt(hStr);
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12;
        h = h ? h : 12; // the hour '0' should be '12'
        return `${h}:${mStr} ${ampm}`;
    } catch (e) {
        return time;
    }
};

const AttendanceAnalyzer: React.FC = () => {
  const { t, dir } = useLanguage();
  const [stage, setStage] = useState<'upload' | 'analysis'>('upload');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  const [analysisResult, setAnalysisResult] = useState<EmployeeSummary[] | null>(null);

  // Constants
  const OVERTIME_THRESHOLD = 9; // Hours

  // Main File Processor
  const handleFileUpload = async (file: File) => {
      setIsLoading(true);
      setError(null);
      
      try {
        let extractedData: DetailedAttendanceRecord[] = [];

        // SMART EXCEL PARSER
        const data = await file.arrayBuffer();
        const workbook = window.XLSX.read(data);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        // Use header:1 to get array of arrays
        const json: any[][] = window.XLSX.utils.sheet_to_json(sheet, { header: 1 });
        
        let lastFoundName = "";

        // Helper to normalize odd times like "20:63" -> "21:03"
        const normalizeTimeStr = (raw: any): string | null => {
            if (!raw) return null;
            const s = String(raw).trim();
            
            // Matches H:M or HH:MM, allowing minutes > 59 (e.g., 20:76)
            const match = s.match(/^(\d{1,2}):(\d{1,2})$/);
            if (!match) return null;

            let h = parseInt(match[1], 10);
            let m = parseInt(match[2], 10);

            // Normalize minutes: if 20:61, m=61 -> h+=1 (21), m=1 (01)
            if (m >= 60) {
                h += Math.floor(m / 60);
                m = m % 60;
            }

            // Normalize hours (0-23)
            h = h % 24;

            return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        };

        // Iterate Rows
        json.forEach((row: any[]) => {
            if (row.length < 2) return; // Skip empty rows

            // Helper to get value cleanly using normalization
            const getVal = (idx: number) => {
                const val = row[idx];
                return normalizeTimeStr(val);
            };

            // 1. Detect Name (Col B)
            const nameCell = row[1];
            if (nameCell && typeof nameCell === 'string' && nameCell.length > 2 && !nameCell.includes('First Name')) {
                lastFoundName = nameCell;
            }

            // 2. Detect Date (Col D in previous image, let's look for YYYY-MM-DD pattern in row)
            let date = "";
            row.forEach(cell => {
                if (cell && String(cell).match(/^\d{4}-\d{2}-\d{2}$/)) {
                    date = String(cell);
                }
            });

            // 3. Extract Times with Normalization
            const clockIn = getVal(6);  // G
            const clockOut = getVal(7); // H
            const breakOut = getVal(9); // J
            const breakIn = getVal(10); // K

            // If we have a date and at least one punch, add record
            if (date && (clockIn || clockOut || breakOut || breakIn)) {
                extractedData.push({
                    employeeName: lastFoundName || "Unknown",
                    date,
                    clockIn,
                    clockOut,
                    breakOut,
                    breakIn
                });
            }
        });

        if (extractedData.length === 0) throw new Error("No valid records found in Excel. Please check format.");

        analyzeData(extractedData);

      } catch (e: any) {
          console.error(e);
          setError(e.message || "Failed to process file");
          setIsLoading(false);
      }
  };

  const analyzeData = (records: DetailedAttendanceRecord[]) => {
    if (records.length === 0) return;

    // 1. Determine Date Range from the file
    const sortedDates = records.map(r => r.date).sort();
    const startDate = new Date(sortedDates[0]);
    const endDate = new Date(sortedDates[sortedDates.length - 1]);

    // 2. Sort Records: Employee -> Date
    records.sort((a, b) => {
        if (a.employeeName === b.employeeName) {
            return a.date.localeCompare(b.date);
        }
        return a.employeeName.localeCompare(b.employeeName);
    });

    // --- SMART LOOK-AHEAD LOGIC FOR MIDNIGHT SHIFTS ---
    for (let i = 0; i < records.length; i++) {
        const curr = records[i];
        
        // Safety check
        if (!curr || curr.ignore) continue;

        // Check against next record
        if (i + 1 < records.length) {
            const next = records[i+1];
            
            // Only compare if same employee
            if (next.employeeName === curr.employeeName) {
                const currDate = new Date(curr.date);
                const nextDate = new Date(next.date);
                const diffTime = Math.abs(nextDate.getTime() - currDate.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

                // Is it the next day?
                if (diffDays === 1) {
                    
                    // Case 1: Straight Shift Night (e.g., 5pm IN -> 1am OUT)
                    // Logic: If current has IN but no OUT, and next has Early Morning IN (which is actually the OUT)
                    if (curr.clockIn && !curr.clockOut) {
                        // Check if Next Day's "Clock In" is essentially the "Clock Out" for today
                        // Threshold: Punch is before 7 AM
                        const potentialOut = next.clockIn || next.breakOut;
                        if (potentialOut && parseInt(potentialOut.split(':')[0]) < 7) {
                            curr.clockOut = potentialOut; // Steal the punch
                            curr.isModified = true;
                            
                            // Clear it from next day so it doesn't count as a new shift start
                            next.clockIn = null;
                            // If next day is now empty of meaningful punches, ignore it entirely
                            if (!next.clockOut && !next.breakIn && !next.breakOut) {
                                next.ignore = true;
                            }
                        }
                    }

                    // Case 2: Broken Shift Night (e.g., Shift 2 is 5pm to 1am)
                    // Logic: If current has BreakIN (Shift 2 Start) but no ClockOut (Shift 2 End)
                    if (curr.breakIn && !curr.clockOut) {
                        const potentialOut = next.clockIn || next.breakOut;
                        if (potentialOut && parseInt(potentialOut.split(':')[0]) < 7) {
                            curr.clockOut = potentialOut;
                            curr.isModified = true;
                            next.clockIn = null;
                            if (!next.clockOut && !next.breakIn && !next.breakOut) {
                                next.ignore = true;
                            }
                        }
                    }
                }
            }
        }
    }

    const summaryMap = new Map<string, EmployeeSummary>();
    const empWorkedDates = new Map<string, Set<string>>();

    records.forEach(record => {
        if (record.ignore) return; // Skip merged rows

        const name = record.employeeName;
        if (!summaryMap.has(name)) {
            summaryMap.set(name, {
                employeeName: name,
                totalWorkDays: 0,
                fridaysWorked: 0,
                absentDays: 0,
                totalOvertimeHours: 0,
                totalShortfallHours: 0,
                totalLatenessMinutes: 0,
                totalEarlyDepartureMinutes: 0,
                records: []
            });
            empWorkedDates.set(name, new Set());
        }

        const empSummary = summaryMap.get(name)!;

        // --- CALCULATE HOURS (Split vs Single) ---
        let dailyHours = 0;
        let shift1 = 0;
        let shift2 = 0;
        let lateness = 0;
        let displayTimestamps: string[] = [];

        // Determine First Punch for Lateness
        const firstPunchStr = record.clockIn || record.breakOut || record.breakIn || record.clockOut;
        const firstPunch = timeToHours(firstPunchStr);

        // -- Calculation Logic --
        
        // Shift 1: Clock In -> Break Out (or Clock Out if single)
        // Only calculate if BOTH In and Out exist to prevent "time calculated between them" error
        if (record.clockIn) {
            const start = timeToHours(record.clockIn);
            let end = 0;
            
            if (record.breakOut) {
                // Split shift part 1 ending
                end = timeToHours(record.breakOut);
                displayTimestamps.push(`Shift 1: ${formatTime(record.clockIn)} \u2192 ${formatTime(record.breakOut)}`);
            } else if (record.clockOut && !record.breakIn) {
                // Single shift ending
                end = timeToHours(record.clockOut);
                displayTimestamps.push(`${formatTime(record.clockIn)} \u2192 ${formatTime(record.clockOut)}`);
            } else {
                // Missing OUT punch for first shift
                displayTimestamps.push(`${formatTime(record.clockIn)} \u2192 ???`);
            }

            if (end > 0) {
                let dur = end - start;
                if (dur < 0) dur += 24; // Cross midnight calculation
                shift1 = dur;
            }
        }

        // Shift 2: Break In -> Clock Out
        if (record.breakIn && record.clockOut) {
            const start = timeToHours(record.breakIn);
            const end = timeToHours(record.clockOut);
            
            let dur = end - start;
            if (dur < 0) dur += 24; // Cross midnight
            shift2 = dur;
            
            displayTimestamps.push(`Shift 2: ${formatTime(record.breakIn)} \u2192 ${formatTime(record.clockOut)}`);
        } else if (record.breakIn && !record.clockOut) {
             displayTimestamps.push(`Shift 2: ${formatTime(record.breakIn)} \u2192 ???`);
        }

        // Fallback: If strict single shift logic failing but data exists in G & H only
        if (shift1 === 0 && shift2 === 0 && record.clockIn && record.clockOut && !record.breakOut && !record.breakIn) {
             let dur = timeToHours(record.clockOut) - timeToHours(record.clockIn);
             if (dur < 0) dur += 24;
             shift1 = dur;
             if (displayTimestamps.length === 0) displayTimestamps.push(`${formatTime(record.clockIn)} \u2192 ${formatTime(record.clockOut)}`);
        }

        dailyHours = shift1 + shift2;

        // --- OVERTIME & SHORTFALL ---
        let overtime = 0;
        let shortfall = 0;

        if (dailyHours > OVERTIME_THRESHOLD) {
            overtime = dailyHours - OVERTIME_THRESHOLD;
        } else if (dailyHours > 0 && dailyHours < 8) {
            shortfall = 8 - dailyHours;
        }

        // Lateness Logic (Assuming standard start 8 AM, ignores shifts starting after 12PM)
        if (firstPunch > 8.25 && firstPunch < 12) {
             lateness = (firstPunch - 8) * 60;
        }

        if (dailyHours > 0) {
            empSummary.totalWorkDays++;
            empSummary.totalOvertimeHours += overtime;
            empSummary.totalShortfallHours += shortfall;
            empSummary.totalLatenessMinutes += Math.round(lateness);
            empWorkedDates.get(name)!.add(record.date);
        }

        const dayOfWeek = new Date(record.date).getDay();
        if (dayOfWeek === 5 && dailyHours > 0) {
            empSummary.fridaysWorked++;
        }

        if (record.isModified) {
            displayTimestamps.push("(+Next Day Exit)");
        }

        const processed: ProcessedRecord = {
            id: Math.random().toString(),
            employeeName: name,
            date: record.date,
            day: new Date(record.date).toLocaleDateString('en-US', { weekday: 'short' }),
            timestamps: displayTimestamps,
            status: dailyHours > 0 ? 'Present' : 'Missing Punch',
            totalHours: dailyHours,
            overtimeHours: overtime,
            shortfallHours: shortfall,
            latenessMinutes: Math.round(lateness),
            earlyDepartureMinutes: 0
        };
        
        empSummary.records.push(processed);
    });

    // 4. Fill in Absences for Missing Days
    summaryMap.forEach((summary, empName) => {
        const workedDates = empWorkedDates.get(empName) || new Set();
        const loopDate = new Date(startDate);

        while (loopDate <= endDate) {
            const dateStr = loopDate.toISOString().split('T')[0];
            const dayOfWeek = loopDate.getDay(); 

            if (dayOfWeek !== 5 && !workedDates.has(dateStr)) {
                summary.absentDays++;
                
                summary.records.push({
                    id: Math.random().toString(),
                    employeeName: empName,
                    date: dateStr,
                    day: loopDate.toLocaleDateString('en-US', { weekday: 'short' }),
                    timestamps: ["(Absent / No Record)"],
                    status: 'Absent',
                    totalHours: 0,
                    overtimeHours: 0,
                    shortfallHours: 8, 
                    latenessMinutes: 0,
                    earlyDepartureMinutes: 0
                });
            }
            loopDate.setDate(loopDate.getDate() + 1);
        }
        summary.records.sort((a, b) => a.date.localeCompare(b.date));
    });

    setAnalysisResult(Array.from(summaryMap.values()));
    setStage('analysis');
    setIsLoading(false);
  };

  const handlePrint = () => {
      window.print();
  };

  const handleExportExcel = () => {
      if (!analysisResult || !window.XLSX) return;
      
      const wb = window.XLSX.utils.book_new();
      
      // Create Summary Sheet
      const summaryData = analysisResult.map(emp => ({
          "Name": emp.employeeName,
          "Work Days": emp.totalWorkDays,
          "Fridays Worked": emp.fridaysWorked,
          "Absent Days": emp.absentDays,
          "Total Overtime (Hrs)": emp.totalOvertimeHours.toFixed(2),
          "Total Late (Mins)": emp.totalLatenessMinutes
      }));
      const wsSummary = window.XLSX.utils.json_to_sheet(summaryData);
      window.XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

      // Create Detailed Sheet (All records flat)
      const detailData: any[] = [];
      analysisResult.forEach(emp => {
          emp.records.forEach(rec => {
              detailData.push({
                  "Employee": emp.employeeName,
                  "Date": rec.date,
                  "Day": rec.day,
                  "Time In/Out": rec.timestamps.join(' '),
                  "Total Hours": rec.totalHours.toFixed(2),
                  "Overtime": rec.overtimeHours.toFixed(2),
                  "Lateness": rec.latenessMinutes,
                  "Status": rec.status
              });
          });
      });

      if (detailData.length === 0) {
          detailData.push({ "Employee": "No records", "Date": "-", "Day": "-", "Time In/Out": "-", "Total Hours": 0, "Overtime": 0, "Lateness": 0, "Status": "-" });
      }

      const wsDetail = window.XLSX.utils.json_to_sheet(detailData);
      window.XLSX.utils.book_append_sheet(wb, wsDetail, "Detailed Logs");

      window.XLSX.writeFile(wb, `Attendance_Report_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const resetApp = () => {
    setStage('upload');
    setAnalysisResult(null);
    setError(null);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20 print:p-0 print:pb-0 print:space-y-2 print:max-w-none print:w-full" dir={dir}>
        
        <PrintHeader title={t('att.title')} subtitle="ATTENDANCE REPORT" />

        <div className="bg-gradient-to-r from-sky-600 to-indigo-600 rounded-3xl p-8 text-white shadow-xl mb-8 print:hidden">
            <div className="flex flex-col md:flex-row items-center gap-6">
                <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-md border-2 border-white/30">
                    <i className="fas fa-robot text-4xl"></i>
                </div>
                <div className="text-center md:text-right">
                    <h1 className="text-3xl font-black mb-2">{t('att.title')}</h1>
                    <p className="text-sky-100 opacity-90 max-w-xl">{t('att.desc')}</p>
                </div>
            </div>
        </div>

        {error && <div className="bg-red-50 border-r-4 border-red-500 p-4 rounded-lg shadow-sm print:hidden"><p className="text-red-600">{error}</p></div>}

        {isLoading && <Loader />}
        
        {!isLoading && stage === 'upload' && (
            <div className="bg-white p-8 rounded-3xl shadow-lg border border-slate-100 space-y-8 animate-fade-in-up print:hidden">
                <div className="pt-4">
                    <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><i className="fas fa-upload text-sky-500"></i> {t('att.step2')}</h3>
                    <p className="text-sm text-slate-500 mb-4">Upload Excel. Auto-detects Split Shifts (4 punches) & 1AM Exits.</p>
                    <FileUpload onFileUpload={handleFileUpload} isLoading={isLoading} />
                </div>
            </div>
        )}

        {!isLoading && stage === 'analysis' && analysisResult && (
             <div className="space-y-8 animate-fade-in print:space-y-4">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 print:hidden">
                    <h2 className="text-2xl font-black text-slate-800">{t('att.step3')}</h2>
                    <div className="flex gap-2">
                        <button onClick={handleExportExcel} className="bg-emerald-600 text-white px-6 py-2 rounded-xl font-bold text-sm hover:bg-emerald-700 shadow-lg flex items-center gap-2">
                            <i className="fas fa-file-excel"></i> Export Excel
                        </button>
                        <button onClick={handlePrint} className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold text-sm hover:bg-blue-700 shadow-lg flex items-center gap-2">
                            <i className="fas fa-print"></i> {t('print')}
                        </button>
                        <button onClick={resetApp} className="bg-slate-800 text-white px-6 py-2 rounded-xl font-bold text-sm hover:bg-slate-700 shadow-lg">
                            {t('att.reset')}
                        </button>
                    </div>
                </div>
                 <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 print:grid-cols-3 print:gap-4">
                    <SummaryCard icon={<i className="fas fa-users text-2xl"></i>} label={t('sup.totalEmp')} value={analysisResult.length} color="bg-gradient-to-br from-cyan-500 to-blue-500 print:text-black print:bg-white print:border print:border-slate-300" />
                    <SummaryCard icon={<i className="fas fa-stopwatch text-2xl"></i>} label="Total Overtime (>9h)" value={`${analysisResult.reduce((a,b)=>a+b.totalOvertimeHours,0).toFixed(1)} hrs`} color="bg-gradient-to-br from-emerald-500 to-teal-500 print:text-black print:bg-white print:border print:border-slate-300" />
                    <SummaryCard icon={<i className="fas fa-clock text-2xl"></i>} label="Late Minutes" value={analysisResult.reduce((a,b)=>a+b.totalLatenessMinutes,0)} color="bg-gradient-to-br from-orange-500 to-red-500 print:text-black print:bg-white print:border print:border-slate-300" />
                  </div>
                <DataTable data={analysisResult} />
            </div>
        )}
        
        <PrintFooter />
    </div>
  );
};

export default AttendanceAnalyzer;
