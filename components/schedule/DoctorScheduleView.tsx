import React, { useState, useMemo, useCallback } from 'react';
import { DoctorScheduleRow, VisualStaff, User, ScheduleColumn } from '../../types';
import { PrintHeader, PrintFooter } from '../PrintLayout';
import { getSoftStaffColor } from './scheduleColorUtils';
import { GenderBadge, resolveUserGender } from './GenderIndicator';
import { useDepartment } from '../../contexts/DepartmentContext';

interface StaffMember {
    name: string;
    time?: string;
    color: string;
    isPP?: boolean;
    note?: string;
    gender?: 'male' | 'female';
    shiftType?: string;
    userId?: string;
}

const ppRegex = /(?:\(|\[|\{)\s*pp\s*(?:\)|\]|\})/i;

const fixedHeaderColors = [
    { bg: 'bg-blue-600', text: 'text-white', border: 'border-blue-700', defaultIcon: 'fas fa-unlink' },
    { bg: 'bg-teal-700', text: 'text-white', border: 'border-teal-800', defaultIcon: 'fas fa-sun' },
    { bg: 'bg-emerald-600', text: 'text-white', border: 'border-emerald-700', defaultIcon: 'fas fa-sun' },
    { bg: 'bg-amber-600', text: 'text-white', border: 'border-amber-700', defaultIcon: 'fas fa-cloud-sun' },
    { bg: 'bg-orange-600', text: 'text-white', border: 'border-orange-700', defaultIcon: 'fas fa-cloud-sun' },
    { bg: 'bg-purple-700', text: 'text-white', border: 'border-purple-800', defaultIcon: 'fas fa-clock' },
    { bg: 'bg-indigo-900', text: 'text-white', border: 'border-indigo-950', defaultIcon: 'fas fa-moon' },
    { bg: 'bg-slate-800', text: 'text-white', border: 'border-slate-900', defaultIcon: 'fas fa-calendar-check' },
];

const detectShiftType = (col: ScheduleColumn, staff?: VisualStaff): string => {
    if (staff?.shiftType) return staff.shiftType;
    const title = (col.title || '').toLowerCase();
    const id = (col.id || '').toLowerCase();
    const time = (col.time || staff?.time || '').toLowerCase();

    if (title.includes('night') || id.includes('night') || time.includes('01:00') || time.includes('night')) return 'night';
    if (title.includes('broken') || id.includes('broken') || time.includes(',')) return 'broken';
    if (title.includes('morning') || id.includes('morning') || title.includes('صباح') || time.includes('08:00') || time.includes('09:00')) return 'morning';
    if (title.includes('evening') || id.includes('evening') || title.includes('مساء') || time.includes('16:00') || time.includes('17:00')) return 'evening';
    if (title.includes('straight') || title.includes('long') || id.includes('straight')) return 'straight';
    return 'morning';
};

interface DoctorScheduleViewProps {
    searchTerm: string;
    data: DoctorScheduleRow[];
    isEditing: boolean;
    allUsers: User[];
    publishMonth: string;
    onUpdateRow: (index: number, newRow: DoctorScheduleRow) => void;
    onAddRow: () => void;
    onRemoveRow: (index: number) => void;
    columns: ScheduleColumn[];
    onUpdateColumn: (index: number, newCol: ScheduleColumn) => void;
    onRemoveColumn: (colId: string) => void;
    onAddColumn?: () => void;
    onOpenStaffHistory?: (staffName: string) => void;
    scheduleNote?: string;
    setScheduleNote?: (note: string) => void;
    globalStartDate?: string;
    globalEndDate?: string;
}

const DoctorScheduleView: React.FC<DoctorScheduleViewProps> = ({ 
    searchTerm, 
    data = [],
    isEditing,
    allUsers = [],
    onUpdateRow,
    onAddRow,
    onRemoveRow,
    publishMonth,
    columns = [],
    onUpdateColumn,
    onRemoveColumn,
    onAddColumn,
    onOpenStaffHistory,
    scheduleNote,
    setScheduleNote,
    globalStartDate,
    globalEndDate
}) => {
    const [editDragItem, setEditDragItem] = useState<{ rowIndex: number, column: string, index: number } | null>(null);
    const [customTitle, setCustomTitle] = useState('');
    const [selectedDoctorFilter, setSelectedDoctorFilter] = useState<string | null>(null);
    const { selectedDepartmentId } = useDepartment();

    const matchesDept = useCallback((u: User, deptId?: string | null) => {
        if (!deptId) return true;
        return (
            u.departmentId === deptId ||
            (Array.isArray(u.departments) && u.departments.includes(deptId)) ||
            (deptId === 'legacy_radiology' && (!u.departmentId || u.departmentId === 'radiology' || u.departmentId === 'legacy_radiology')) ||
            (deptId === 'radiology' && (!u.departmentId || u.departmentId === 'radiology' || u.departmentId === 'legacy_radiology'))
        );
    }, []);

    // List of available doctors from allUsers for quick selection - filtered strictly to section/department
    const availableDoctors = useMemo(() => {
        return allUsers.filter(u => {
            if (selectedDepartmentId && !matchesDept(u, selectedDepartmentId)) {
                return false;
            }
            const role = (u.role || '').toLowerCase();
            const cat = (u.jobCategory || '').toLowerCase();
            const name = (u.name || '').toLowerCase();
            return role === 'doctor' || cat === 'doctor' || cat.includes('طبيب') || name.startsWith('dr.') || name.startsWith('dr ') || name.includes('د.');
        });
    }, [allUsers, selectedDepartmentId, matchesDept]);

    // Format Date Range
    const formatDateRange = (row: DoctorScheduleRow, idx: number) => {
        if (row.dateRange) return row.dateRange;
        if (row.startDate) {
            const start = new Date(row.startDate);
            const end = row.endDate ? new Date(row.endDate) : null;
            if (!isNaN(start.getTime())) {
                const sDay = String(start.getDate()).padStart(2, '0');
                const sMonth = String(start.getMonth() + 1).padStart(2, '0');
                const sStr = `${sDay}/${sMonth}`;
                if (end && !isNaN(end.getTime())) {
                    const eDay = String(end.getDate()).padStart(2, '0');
                    const eMonth = String(end.getMonth() + 1).padStart(2, '0');
                    return `${sStr} - ${eDay}/${eMonth}`;
                }
                return sStr;
            }
        }
        return `WEEK ${idx + 1}`;
    };

    // Calculate Shift and Doctor Workload Statistics
    const { shiftCounts, doctorStats } = useMemo(() => {
        const counts = { morning: 0, evening: 0, night: 0, broken: 0, straight: 0, total: 0 };
        const docMap: Record<string, { count: number; name: string; shifts: { week: number; colTitle: string; time?: string }[] }> = {};

        data.forEach((row, rowIdx) => {
            columns.forEach(col => {
                const list = (row[col.id] as VisualStaff[]) || [];
                list.forEach(s => {
                    const cleanName = (s.name || '').replace(ppRegex, '').trim();
                    if (!cleanName || cleanName === 'New Dr' || cleanName === 'Doctor Name' || cleanName === 'Dr. Name') return;

                    const shiftType = detectShiftType(col, s);
                    if (shiftType === 'night') counts.night++;
                    else if (shiftType === 'broken') counts.broken++;
                    else if (shiftType === 'evening') counts.evening++;
                    else if (shiftType === 'straight') counts.straight++;
                    else counts.morning++;
                    counts.total++;

                    const normName = cleanName.toLowerCase();
                    if (!docMap[normName]) {
                        docMap[normName] = { count: 0, name: cleanName, shifts: [] };
                    }
                    docMap[normName].count++;
                    docMap[normName].shifts.push({
                        week: rowIdx + 1,
                        colTitle: col.title,
                        time: s.time || col.time
                    });
                });
            });
        });

        return { shiftCounts: counts, doctorStats: Object.values(docMap) };
    }, [data, columns]);

    // Search term highlight helper
    const highlightMatch = (text: string) => {
        if (!searchTerm || isEditing) return <span>{text}</span>;
        const parts = text.split(new RegExp(`(${searchTerm})`, 'gi'));
        return (
            <span>
                {parts.map((part, i) => 
                    part.toLowerCase() === searchTerm.toLowerCase() ? (
                        <mark key={i} className="bg-yellow-300 text-black px-0.5 rounded font-bold">{part}</mark>
                    ) : (
                        part
                    )
                )}
            </span>
        );
    };

    const isMatched = (name: string) => {
        if (!searchTerm) return false;
        return name.toLowerCase().includes(searchTerm.toLowerCase());
    };

    // Staff change handlers
    const handleStaffChange = useCallback((rowIndex: number, columnId: string, index: number, field: keyof VisualStaff, value: any) => {
        if (!data[rowIndex]) return;
        const row = { ...data[rowIndex] };
        const currentList = [...(row[columnId] as VisualStaff[] || [])];
        if (currentList[index]) {
            currentList[index] = { ...currentList[index], [field]: value };
            onUpdateRow(rowIndex, { ...row, [columnId]: currentList });
        }
    }, [data, onUpdateRow]);

    const togglePP = useCallback((rowIndex: number, columnId: string, index: number) => {
        if (!data[rowIndex]) return;
        const row = { ...data[rowIndex] };
        const currentList = [...(row[columnId] as VisualStaff[] || [])];
        if (currentList[index]) {
            let name = currentList[index].name;
            if (ppRegex.test(name)) {
                name = name.replace(ppRegex, '').trim();
            } else {
                name = `${name} (PP)`;
            }
            currentList[index] = { ...currentList[index], name };
            onUpdateRow(rowIndex, { ...row, [columnId]: currentList });
        }
    }, [data, onUpdateRow]);

    const handleAddNewStaff = useCallback((rowIndex: number, columnId: string) => {
        if (!data[rowIndex]) return;
        const row = { ...data[rowIndex] };
        const currentList = [...(row[columnId] as VisualStaff[] || [])];
        currentList.push({ name: 'New Dr', time: '' });
        onUpdateRow(rowIndex, { ...row, [columnId]: currentList });
    }, [data, onUpdateRow]);

    const removeStaffMember = useCallback((rowIndex: number, columnId: string, index: number) => {
        if (!data[rowIndex]) return;
        const row = { ...data[rowIndex] };
        const currentList = [...(row[columnId] as VisualStaff[] || [])];
        currentList.splice(index, 1);
        onUpdateRow(rowIndex, { ...row, [columnId]: currentList });
    }, [data, onUpdateRow]);

    const moveStaffInCell = useCallback((rowIndex: number, columnId: string, staffIndex: number, action: 'up' | 'down' | 'top' | 'bottom' | 'middle') => {
        if (!data[rowIndex]) return;
        const row = { ...data[rowIndex] };
        const currentList = [...(row[columnId] as VisualStaff[] || [])];
        const item = currentList[staffIndex];
        if (!item) return;

        currentList.splice(staffIndex, 1);
        if (action === 'top') {
            currentList.unshift(item);
        } else if (action === 'bottom') {
            currentList.push(item);
        } else if (action === 'middle') {
            const mid = Math.floor(currentList.length / 2);
            currentList.splice(mid, 0, item);
        } else if (action === 'up') {
            const target = Math.max(0, staffIndex - 1);
            currentList.splice(target, 0, item);
        } else if (action === 'down') {
            const target = Math.min(currentList.length, staffIndex + 1);
            currentList.splice(target, 0, item);
        }
        onUpdateRow(rowIndex, { ...row, [columnId]: currentList });
    }, [data, onUpdateRow]);

    // Drag & Drop Handlers
    const onEditDragStart = (e: React.DragEvent, rowIndex: number, columnId: string, index: number) => {
        e.stopPropagation();
        setEditDragItem({ rowIndex, column: columnId, index });
        e.dataTransfer.effectAllowed = "move";
    };

    const onEditDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = editDragItem ? "move" : "copy";
    };

    const onEditDrop = (e: React.DragEvent, targetRowIndex: number, targetColumnId: string) => {
        e.preventDefault();
        e.stopPropagation();

        if (editDragItem) {
            const { rowIndex: srcRowIdx, column: srcCol, index: srcIndex } = editDragItem;
            if (!data[srcRowIdx] || !data[targetRowIndex]) return;

            const sourceRow = { ...data[srcRowIdx] };
            const sourceList = [...(sourceRow[srcCol] as VisualStaff[] || [])];
            const itemToMove = sourceList[srcIndex];
            if (!itemToMove) return;

            sourceList.splice(srcIndex, 1);
            const updatedSourceRow = { ...sourceRow, [srcCol]: sourceList };

            const targetRow = (srcRowIdx === targetRowIndex) ? updatedSourceRow : { ...data[targetRowIndex] };
            const targetList = [...(targetRow[targetColumnId] as VisualStaff[] || [])];
            targetList.push(itemToMove);
            const updatedTargetRow = { ...targetRow, [targetColumnId]: targetList };

            if (srcRowIdx === targetRowIndex) {
                onUpdateRow(srcRowIdx, updatedTargetRow);
            } else {
                onUpdateRow(srcRowIdx, updatedSourceRow);
                onUpdateRow(targetRowIndex, updatedTargetRow);
            }
            setEditDragItem(null);
            return;
        }

        // Drop from StaffSidebar
        try {
            const rawData = e.dataTransfer.getData('application/react-dnd-staff');
            if (rawData) {
                const staffData = JSON.parse(rawData);
                const row = { ...data[targetRowIndex] };
                const currentList = [...(row[targetColumnId] as VisualStaff[] || [])];
                currentList.push({ 
                    name: staffData.name, 
                    userId: staffData.id,
                    gender: staffData.gender || resolveUserGender(staffData.name, allUsers)
                });
                onUpdateRow(targetRowIndex, { ...row, [targetColumnId]: currentList });
                return;
            }

            const plainText = e.dataTransfer.getData('text/plain');
            if (plainText) {
                const row = { ...data[targetRowIndex] };
                const currentList = [...(row[targetColumnId] as VisualStaff[] || [])];
                currentList.push({ 
                    name: plainText,
                    gender: resolveUserGender(plainText, allUsers)
                });
                onUpdateRow(targetRowIndex, { ...row, [targetColumnId]: currentList });
            }
        } catch (err) { 
            console.error("Drop error in DoctorScheduleView:", err); 
        }
    };

    // Render Doctor List in a Cell
    const renderStaffList = (staffList: VisualStaff[] | undefined, rowIndex: number, columnId: string, col: ScheduleColumn) => {
        const rawList = staffList || [];
        
        if (isEditing) {
            return (
                <>
                    {/* Screen-only Interactive Editing UI */}
                    <div 
                        className="space-y-2 min-h-[60px] p-1.5 h-full rounded-xl transition-colors border border-transparent hover:border-indigo-200 hover:bg-slate-50/50 print:hidden"
                        onDragOver={onEditDragOver}
                        onDrop={(e) => onEditDrop(e, rowIndex, columnId)}
                    >
                        {rawList.map((s, i) => {
                            const hasPP = ppRegex.test(s.name);
                            const cleanName = s.name.replace(ppRegex, '').trim();
                            const softColor = getSoftStaffColor(cleanName);
                            const doctorGender = s.gender || resolveUserGender(cleanName, allUsers);
                            const shiftType = detectShiftType(col, s);

                            return (
                                <div 
                                    key={i} 
                                    draggable 
                                    onDragStart={(e) => onEditDragStart(e, rowIndex, columnId, i)} 
                                    className={`flex flex-col gap-1.5 p-2 rounded-xl border shadow-xs transition-all group cursor-grab active:cursor-grabbing ${softColor.className}`}
                                >
                                    {/* Row 1: Shift Icon, Doctor Name input (full remaining width), and Delete button */}
                                    <div className="flex items-center gap-1.5 w-full">
                                        {/* Shift Icon */}
                                        {shiftType === 'morning' && <i className="fas fa-sun text-amber-500 text-xs shrink-0" title="Morning"></i>}
                                        {shiftType === 'evening' && <i className="fas fa-cloud-sun text-orange-500 text-xs shrink-0" title="Evening"></i>}
                                        {shiftType === 'night' && <i className="fas fa-moon text-indigo-600 text-xs shrink-0" title="Night"></i>}
                                        {shiftType === 'broken' && <i className="fas fa-unlink text-blue-600 text-xs shrink-0" title="Broken"></i>}
                                        {shiftType === 'straight' && <i className="fas fa-clock text-purple-600 text-xs shrink-0" title="Straight"></i>}

                                        {/* Doctor Name Input - takes full width so name is completely visible */}
                                        <div className="flex-1 min-w-0 relative">
                                            <input
                                                value={cleanName}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    handleStaffChange(rowIndex, columnId, i, 'name', hasPP ? `${val} (PP)` : val);
                                                }}
                                                className="w-full text-xs font-bold px-2 py-1 bg-white border border-slate-300 rounded focus:border-indigo-500 focus:ring-1 focus:ring-indigo-300 outline-none font-oswald text-slate-900 shadow-2xs"
                                                placeholder="Doctor Name"
                                                list={`doc-list-${rowIndex}-${columnId}-${i}`}
                                            />
                                            <datalist id={`doc-list-${rowIndex}-${columnId}-${i}`}>
                                                {availableDoctors.map(doc => (
                                                    <option key={doc.id} value={doc.name} />
                                                ))}
                                            </datalist>
                                        </div>

                                        {/* Delete Doctor button */}
                                        <button 
                                            type="button"
                                            onClick={() => removeStaffMember(rowIndex, columnId, i)} 
                                            className="text-slate-400 hover:text-red-600 p-1 transition-colors shrink-0"
                                            title="Remove Doctor"
                                        >
                                            <i className="fas fa-times text-xs"></i>
                                        </button>
                                    </div>

                                    {/* Row 2: Badges & Actions (Gender, 6-Month History, and PP Toggle) */}
                                    <div className="flex items-center justify-between gap-1 w-full">
                                        <div className="flex items-center gap-1">
                                            {doctorGender && (
                                                <GenderBadge gender={doctorGender} variant="mini" isAr={true} className="shrink-0" />
                                            )}
                                            {onOpenStaffHistory && cleanName && cleanName !== 'New Dr' && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); onOpenStaffHistory(cleanName); }}
                                                    className="px-1.5 py-0.5 text-slate-600 hover:text-indigo-600 hover:bg-white rounded transition-colors text-[9px] font-bold flex items-center gap-1 border border-slate-200/80 bg-white/80 shrink-0"
                                                    title="View 6-Month History"
                                                >
                                                    <i className="fas fa-history text-[9px]"></i>
                                                    <span>سجل</span>
                                                </button>
                                            )}
                                        </div>

                                        <button 
                                            type="button"
                                            onClick={() => togglePP(rowIndex, columnId, i)} 
                                            className={`px-2 py-0.5 rounded text-[9px] font-black tracking-wider border transition-colors shrink-0 ${hasPP ? 'bg-yellow-400 text-black border-yellow-600 shadow-xs' : 'bg-white text-slate-600 border-slate-300 hover:text-slate-900'}`}
                                            title={hasPP ? "Remove PP Badge" : "Add (PP) Badge"}
                                        >
                                            PP
                                        </button>
                                    </div>

                                    {/* Extra Time & Note Controls */}
                                    <div className="grid grid-cols-2 gap-1 text-[10px]">
                                        <input
                                            value={s.time || ''}
                                            onChange={(e) => handleStaffChange(rowIndex, columnId, i, 'time', e.target.value)}
                                            className="bg-white/90 border border-slate-200 rounded px-1.5 py-0.5 text-slate-700 placeholder-slate-400 outline-none focus:border-indigo-400"
                                            placeholder="Time (override)"
                                        />
                                        <input
                                            value={s.note || ''}
                                            onChange={(e) => handleStaffChange(rowIndex, columnId, i, 'note', e.target.value)}
                                            className="bg-amber-50/90 border border-amber-200 rounded px-1.5 py-0.5 text-amber-900 placeholder-amber-400 outline-none focus:border-amber-400 font-medium"
                                            placeholder="Special Note"
                                        />
                                    </div>

                                    {/* Quick Reorder Controls */}
                                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[10px] text-slate-400">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase">Reorder</span>
                                        <div className="flex items-center gap-1">
                                            <button 
                                                type="button" 
                                                onClick={() => moveStaffInCell(rowIndex, columnId, i, 'top')} 
                                                title="Move to Top" 
                                                className="hover:text-indigo-600 hover:bg-white px-1 py-0.5 rounded transition-colors"
                                            >
                                                ⏫
                                            </button>
                                            <button 
                                                type="button" 
                                                onClick={() => moveStaffInCell(rowIndex, columnId, i, 'up')} 
                                                title="Move Up" 
                                                className="hover:text-indigo-600 hover:bg-white px-1 py-0.5 rounded transition-colors"
                                            >
                                                ▲
                                            </button>
                                            <button 
                                                type="button" 
                                                onClick={() => moveStaffInCell(rowIndex, columnId, i, 'middle')} 
                                                title="Move to Middle" 
                                                className="hover:text-indigo-600 hover:bg-white px-1 py-0.5 rounded transition-colors"
                                            >
                                                ↕️
                                            </button>
                                            <button 
                                                type="button" 
                                                onClick={() => moveStaffInCell(rowIndex, columnId, i, 'down')} 
                                                title="Move Down" 
                                                className="hover:text-indigo-600 hover:bg-white px-1 py-0.5 rounded transition-colors"
                                            >
                                                ▼
                                            </button>
                                            <button 
                                                type="button" 
                                                onClick={() => moveStaffInCell(rowIndex, columnId, i, 'bottom')} 
                                                title="Move to Bottom" 
                                                className="hover:text-indigo-600 hover:bg-white px-1 py-0.5 rounded transition-colors"
                                            >
                                                ⏬
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        <button 
                            type="button"
                            onClick={() => handleAddNewStaff(rowIndex, columnId)} 
                            className="w-full text-xs font-bold text-indigo-700 bg-indigo-50/80 hover:bg-indigo-100 py-1.5 rounded-xl border border-dashed border-indigo-200 transition-colors flex items-center justify-center gap-1"
                        >
                            <i className="fas fa-plus text-[10px]"></i>
                            <span>Add Doctor</span>
                        </button>
                    </div>

                    {/* Dedicated Print View for Edit Mode */}
                    <div className="hidden print:flex flex-col gap-1 w-full h-full justify-center p-0.5">
                        {rawList.length === 0 ? (
                            <div className="h-full min-h-[30px] flex items-center justify-center text-slate-300 print:text-slate-400 text-xs italic font-medium">
                                —
                            </div>
                        ) : (
                            rawList.map((s, idx) => {
                                const cleanName = s.name.replace(ppRegex, '').trim();
                                const hasPP = ppRegex.test(s.name);
                                const softColor = getSoftStaffColor(cleanName);
                                const shiftType = detectShiftType(col, s);

                                return (
                                    <div 
                                        key={idx} 
                                        className={`flex flex-col items-center justify-center text-center p-1 rounded-md border border-slate-300 print-color-adjust-exact ${softColor.className}`}
                                    >
                                        <div className="flex items-center justify-center gap-1 text-sm font-bold font-oswald tracking-wide print:text-black print:text-[13px] md:print:text-[14px] print:leading-tight text-center whitespace-nowrap overflow-hidden text-ellipsis w-full">
                                            {shiftType === 'morning' && <i className="fas fa-sun text-amber-500 text-[10px]"></i>}
                                            {shiftType === 'evening' && <i className="fas fa-cloud-sun text-orange-500 text-[10px]"></i>}
                                            {shiftType === 'night' && <i className="fas fa-moon text-indigo-700 text-[10px]"></i>}
                                            {shiftType === 'broken' && <i className="fas fa-unlink text-blue-600 text-[10px]"></i>}
                                            {shiftType === 'straight' && <i className="fas fa-clock text-purple-600 text-[10px]"></i>}
                                            <span className="font-oswald font-bold print:text-black uppercase">{cleanName}</span>
                                        </div>
                                        {s.time && (
                                            <div className="text-[9px] font-mono font-bold text-black mt-0.5 leading-none" dir="ltr">
                                                {s.time}
                                            </div>
                                        )}
                                        {s.note && (
                                            <div className="text-[8px] font-bold text-black bg-white px-1.5 py-0.5 rounded border border-slate-400 mt-0.5 w-full text-center">
                                                {s.note}
                                            </div>
                                        )}
                                        {hasPP && (
                                            <div className="w-full text-[9px] font-black bg-yellow-300 text-black border border-black rounded px-1.5 py-0.5 mt-0.5 uppercase tracking-wider text-center block print-color-adjust-exact">
                                                PORTABLE & PROCEDURE
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </>
            );
        }

        // View and Print Mode
        if (rawList.length === 0) {
            return (
                <div className="h-full min-h-[50px] flex items-center justify-center text-slate-300 print:text-slate-400 text-xs italic font-medium">
                    —
                </div>
            );
        }

        return (
            <div className="flex flex-col gap-2 w-full h-full justify-center p-1.5 print:p-0.5 print:gap-1">
                {rawList.map((s, idx) => {
                    const cleanName = s.name.replace(ppRegex, '').trim();
                    const hasPP = ppRegex.test(s.name);
                    const softColor = getSoftStaffColor(cleanName);
                    const doctorGender = s.gender || resolveUserGender(cleanName, allUsers);
                    const shiftType = detectShiftType(col, s);
                    const isSearchHit = isMatched(cleanName);
                    const isDoctorFilterActive = selectedDoctorFilter && selectedDoctorFilter.toLowerCase() === cleanName.toLowerCase();

                    return (
                        <div 
                            key={idx} 
                            className={`flex flex-col items-center justify-center text-center p-2 rounded-xl border transition-all print:p-1 print:rounded-md print:border-slate-300 print-color-adjust-exact shadow-xs print:shadow-none ${
                                isSearchHit 
                                    ? 'bg-yellow-100 border-yellow-400 ring-2 ring-yellow-300' 
                                    : isDoctorFilterActive 
                                    ? 'ring-2 ring-indigo-500 ' + softColor.className 
                                    : softColor.className
                            }`}
                        >
                            {/* Screen Interactive Container (Hidden in print) */}
                            <div className="flex items-center justify-center gap-1.5 w-full flex-wrap leading-tight print:hidden">
                                {/* Shift Icon in View Mode */}
                                {shiftType === 'morning' && <i className="fas fa-sun text-amber-500 text-xs shrink-0"></i>}
                                {shiftType === 'evening' && <i className="fas fa-cloud-sun text-orange-500 text-xs shrink-0"></i>}
                                {shiftType === 'night' && <i className="fas fa-moon text-indigo-700 text-xs shrink-0"></i>}
                                {shiftType === 'broken' && <i className="fas fa-unlink text-blue-600 text-xs shrink-0"></i>}
                                {shiftType === 'straight' && <i className="fas fa-clock text-purple-600 text-xs shrink-0"></i>}

                                {onOpenStaffHistory ? (
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); onOpenStaffHistory(cleanName); }}
                                        className="font-oswald font-bold text-sm md:text-base uppercase text-center hover:underline hover:text-indigo-600 cursor-pointer inline-flex items-center gap-1 transition-colors"
                                        title="View 6-Month History"
                                    >
                                        <span>{highlightMatch(cleanName)}</span>
                                        <i className="fas fa-history text-[10px] text-slate-400 opacity-60 hover:opacity-100"></i>
                                    </button>
                                ) : (
                                    <span className="font-oswald font-bold text-sm md:text-base uppercase text-center">
                                        {highlightMatch(cleanName)}
                                    </span>
                                )}

                                {doctorGender && (
                                    <GenderBadge gender={doctorGender} variant="mini" isAr={true} className="shrink-0" />
                                )}
                            </div>

                            {/* Dedicated Print Doctor Name (Guaranteed visible in print, OSWALD font, bold, black) */}
                            <div className="hidden print:flex items-center justify-center gap-1 text-sm font-bold font-oswald tracking-wide print:text-black print:text-[13px] md:print:text-[14px] print:leading-tight text-center whitespace-nowrap overflow-hidden text-ellipsis w-full">
                                {shiftType === 'morning' && <i className="fas fa-sun text-amber-500 text-[10px]"></i>}
                                {shiftType === 'evening' && <i className="fas fa-cloud-sun text-orange-500 text-[10px]"></i>}
                                {shiftType === 'night' && <i className="fas fa-moon text-indigo-700 text-[10px]"></i>}
                                {shiftType === 'broken' && <i className="fas fa-unlink text-blue-600 text-[10px]"></i>}
                                {shiftType === 'straight' && <i className="fas fa-clock text-purple-600 text-[10px]"></i>}
                                <span className="font-oswald font-bold print:text-black uppercase">{cleanName}</span>
                            </div>

                            {/* Specific Time */}
                            {s.time && (
                                <div className="text-[10px] print:text-[9px] font-mono font-bold text-slate-600 print:text-black mt-0.5 print:mt-0 print:leading-none" dir="ltr">
                                    {s.time}
                                </div>
                            )}

                            {/* Doctor Note */}
                            {s.note && (
                                <div className="text-[10px] print:text-[8px] font-bold text-amber-900 bg-amber-100/90 px-1.5 py-0.5 rounded border border-amber-200 mt-1 w-full text-center print:bg-white print:text-black print:border-slate-400 print:mt-0.5">
                                    {s.note}
                                </div>
                            )}

                            {/* PORTABLE & PROCEDURE (PP) Badge */}
                            {hasPP && (
                                <div className="w-full text-[9px] md:text-[10px] font-black bg-yellow-400 text-black border border-yellow-600 rounded px-1.5 py-0.5 mt-1 shadow-xs uppercase tracking-wider text-center block print:bg-yellow-300 print:text-black print:border-black print-color-adjust-exact print:mt-0.5">
                                    PORTABLE & PROCEDURE
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="space-y-6 animate-fade-in print:space-y-1 print:w-full relative print:bg-white print:text-left font-sans">
            {/* High-Fidelity Print Header */}
            <PrintHeader 
                month={customTitle || scheduleNote || publishMonth} 
                subtitle="RADIOLOGISTS WEEKLY ROSTER" 
                themeColor="blue"
                dateRange={globalStartDate && globalEndDate ? `FROM ${globalStartDate} TO ${globalEndDate}` : undefined}
            />

            {/* Interactive Header / Management Banner */}
            <div className="bg-slate-900 text-white p-4 md:p-5 rounded-2xl shadow-md border border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4 print:hidden">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center text-lg shadow-sm">
                        <i className="fas fa-user-md"></i>
                    </div>
                    <div>
                        <h2 className="text-lg md:text-xl font-black uppercase tracking-wide flex items-center gap-2">
                            <span>Doctors Weekly Schedule</span>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-500/30 text-blue-300 border border-blue-400/40">
                                Radiologists Roster
                            </span>
                        </h2>
                        <p className="text-slate-300 text-xs font-medium">
                            Weekly rotational duty assignments with drag-and-drop, doctor statistics, and print views
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto">
                    {/* Custom Title Input */}
                    {isEditing ? (
                        <div className="flex items-center gap-2 w-full md:w-72">
                            <input 
                                className="bg-slate-800 text-white px-3 py-2 rounded-xl border border-slate-700 text-xs font-bold w-full focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none transition-all placeholder-slate-400"
                                placeholder="Custom Schedule Title (Overrides Month)"
                                value={customTitle || scheduleNote || ''}
                                onChange={(e) => {
                                    setCustomTitle(e.target.value);
                                    if (setScheduleNote) setScheduleNote(e.target.value);
                                }}
                            />
                        </div>
                    ) : (
                        <div className="text-xs font-bold text-slate-300 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700">
                            {customTitle || scheduleNote || publishMonth}
                        </div>
                    )}

                    {/* Add Column Button */}
                    {isEditing && onAddColumn && (
                        <button
                            type="button"
                            onClick={onAddColumn}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shrink-0 shadow-sm"
                        >
                            <i className="fas fa-plus"></i>
                            <span>Add Column</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Global Shift Counters Summary Bar */}
            <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-xs flex flex-wrap items-center justify-between gap-3 print:hidden">
                <div className="flex items-center gap-2 text-xs font-black text-slate-700">
                    <i className="fas fa-chart-pie text-blue-600"></i>
                    <span>Shift Summary:</span>
                </div>

                <div className="flex items-center flex-wrap gap-2 text-xs font-bold">
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-50 text-amber-900 border border-amber-200">
                        <i className="fas fa-sun text-amber-500"></i>
                        <span>Morning: {shiftCounts.morning}</span>
                    </span>
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-orange-50 text-orange-900 border border-orange-200">
                        <i className="fas fa-cloud-sun text-orange-500"></i>
                        <span>Evening: {shiftCounts.evening}</span>
                    </span>
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-indigo-50 text-indigo-900 border border-indigo-200">
                        <i className="fas fa-moon text-indigo-600"></i>
                        <span>Night: {shiftCounts.night}</span>
                    </span>
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-blue-50 text-blue-900 border border-blue-200">
                        <i className="fas fa-unlink text-blue-600"></i>
                        <span>Broken: {shiftCounts.broken}</span>
                    </span>
                    {shiftCounts.straight > 0 && (
                        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-purple-50 text-purple-900 border border-purple-200">
                            <i className="fas fa-clock text-purple-600"></i>
                            <span>Straight: {shiftCounts.straight}</span>
                        </span>
                    )}
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 text-slate-800 border border-slate-200">
                        <i className="fas fa-check-double text-slate-500"></i>
                        <span>Total Assignments: {shiftCounts.total}</span>
                    </span>
                </div>
            </div>

            {/* Doctor Workload Distribution Bar */}
            {doctorStats.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 shadow-xs print:hidden">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 text-xs font-black text-slate-700">
                            <i className="fas fa-stethoscope text-indigo-600"></i>
                            <span>Doctor Monthly Assignments:</span>
                        </div>
                        {selectedDoctorFilter && (
                            <button
                                type="button"
                                onClick={() => setSelectedDoctorFilter(null)}
                                className="text-[11px] font-bold text-red-600 hover:underline"
                            >
                                Clear Highlight
                            </button>
                        )}
                    </div>
                    <div className="flex items-center flex-wrap gap-1.5">
                        {doctorStats.map(doc => {
                            const isSelected = selectedDoctorFilter?.toLowerCase() === doc.name.toLowerCase();
                            const softColor = getSoftStaffColor(doc.name);
                            return (
                                <button
                                    key={doc.name}
                                    type="button"
                                    onClick={() => setSelectedDoctorFilter(isSelected ? null : doc.name)}
                                    className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border shadow-2xs ${
                                        isSelected 
                                            ? 'ring-2 ring-indigo-600 scale-105 font-black ' + softColor.className
                                            : 'hover:scale-102 ' + softColor.className
                                    }`}
                                >
                                    <span>🩺 {doc.name}</span>
                                    <span className="px-1.5 py-0.2 rounded-full bg-white/80 text-[10px] font-black">
                                        {doc.count} {doc.count === 1 ? 'week' : 'weeks'}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Main Schedule Matrix Table */}
            <div dir="ltr" className="overflow-x-auto rounded-2xl border-2 border-slate-800 shadow-sm bg-white print:block print:overflow-visible print:border-2 print:border-slate-900 print:rounded-none print:shadow-none print:w-full">
                <table className="doctor-schedule-table min-w-full border-collapse table-fixed print:border-collapse print:w-full">
                    <thead>
                        <tr className="border-b-2 border-slate-800 print:border-b-2 print:border-slate-900">
                            {/* Week Date Header */}
                            <th className="px-3 py-3 text-center text-xs font-black text-white uppercase bg-slate-900 border-r border-slate-700 w-36 print:bg-[#1e293b] print:text-white print:w-24 print:px-1 print:py-2 print:text-[10px] print:border-r print:border-slate-800 print-color-adjust-exact">
                                <div className="flex flex-col items-center justify-center">
                                    <span className="font-oswald tracking-wider font-bold text-sm print:text-[10px]">WEEK</span>
                                    <span className="text-[10px] opacity-80 print:text-[8px]">DATE RANGE</span>
                                </div>
                            </th>

                            {/* Dynamic Duty Columns */}
                            {columns.map((col, idx) => {
                                const headerTheme = fixedHeaderColors[idx % fixedHeaderColors.length];
                                const isNightCol = col.id === 'night' || col.title.toLowerCase().includes('night');

                                return (
                                    <th 
                                        key={col.id} 
                                        className={`group relative px-2 py-2.5 text-center border-r border-slate-200 print:border-r print:border-slate-800 print:px-1 print:py-1 ${headerTheme.bg} ${headerTheme.text} print:bg-[#2e3b4e] print:text-white print-color-adjust-exact`}
                                    >
                                        <div className="flex flex-col h-full items-center justify-center">
                                            {/* Column Title */}
                                            {isEditing ? (
                                                <>
                                                    <input 
                                                        value={col.title} 
                                                        onChange={(e) => onUpdateColumn(idx, { ...col, title: e.target.value })}
                                                        className="w-full bg-white/20 border-b border-white/40 px-1 text-center font-oswald font-bold text-sm md:text-base uppercase tracking-wide text-white outline-none rounded print:hidden"
                                                        placeholder="Duty Title"
                                                    />
                                                    <div className="hidden print:block font-oswald font-bold text-[11px] uppercase tracking-wide leading-tight text-white">
                                                        {col.title}
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="font-oswald font-bold text-sm md:text-base print:text-[11px] uppercase tracking-wide flex items-center justify-center gap-1 leading-tight">
                                                    {isNightCol && <i className="fas fa-moon text-indigo-300 text-xs print:hidden"></i>}
                                                    <span>{col.title}</span>
                                                </div>
                                            )}

                                            {/* Timing Badge */}
                                            {(col.time || isEditing) && (
                                                <div className="mt-1 text-[10px] print:text-[8px] font-mono font-bold opacity-90 leading-tight">
                                                    {isEditing ? (
                                                        <>
                                                            <input 
                                                                value={col.time || ''} 
                                                                onChange={(e) => onUpdateColumn(idx, { ...col, time: e.target.value })}
                                                                className="w-full bg-white/10 border-b border-dashed border-white/30 px-1 text-center outline-none rounded print:hidden"
                                                                placeholder="Time e.g. 09:00 - 13:00"
                                                            />
                                                            {col.time && <span className="hidden print:inline-block" dir="ltr">{col.time}</span>}
                                                        </>
                                                    ) : (
                                                        <span dir="ltr">{col.time}</span>
                                                    )}
                                                </div>
                                            )}

                                            {/* Subtitle */}
                                            {(col.subTitle || isEditing) && (
                                                <div className="mt-0.5 text-[9px] print:text-[7px] font-semibold opacity-80 leading-tight">
                                                    {isEditing ? (
                                                        <>
                                                            <textarea 
                                                                value={col.subTitle || ''} 
                                                                onChange={(e) => onUpdateColumn(idx, { ...col, subTitle: e.target.value })}
                                                                className="w-full bg-white/10 border border-white/30 px-1 h-8 resize-none text-center outline-none rounded text-[9px] print:hidden"
                                                                placeholder="Subtitle e.g. CT + MRI"
                                                            />
                                                            {col.subTitle && <span className="hidden print:inline-block">{col.subTitle}</span>}
                                                        </>
                                                    ) : (
                                                        <span>{col.subTitle}</span>
                                                    )}
                                                </div>
                                            )}

                                            {/* Column Delete Button in Edit Mode */}
                                            {isEditing && (
                                                <button 
                                                    type="button"
                                                    onClick={() => onRemoveColumn(col.id)}
                                                    className="absolute top-1 right-1 text-white/60 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity p-1 print:hidden"
                                                    title="Delete Column"
                                                >
                                                    <i className="fas fa-trash text-[10px]"></i>
                                                </button>
                                            )}
                                        </div>
                                    </th>
                                );
                            })}

                            {/* Row Note Header */}
                            <th className="px-2 py-3 text-center text-xs font-black text-white uppercase bg-slate-800 border-r border-slate-700 w-32 print:bg-[#334155] print:text-white print:w-24 print:px-1 print:py-2 print:text-[10px] print:border-r print:border-slate-800 print-color-adjust-exact">
                                <span className="font-oswald tracking-wide font-bold">NOTE</span>
                            </th>

                            {isEditing && <th className="w-10 bg-slate-100 print:hidden"></th>}
                        </tr>
                    </thead>

                    <tbody className="bg-white">
                        {data.map((row, idx) => (
                            <tr 
                                key={row.id || idx} 
                                className="border-b-2 border-slate-800 print:border-b-2 print:border-slate-900 hover:bg-slate-50/40 transition-colors print:h-auto break-inside-avoid page-break-inside-avoid"
                            >
                                {/* Week Date Cell */}
                                <td className="px-2.5 py-3 text-center align-middle bg-slate-50/60 print:bg-transparent border-r border-slate-200 print:border-r print:border-slate-800 border-b-2 border-slate-800 print:border-b-2 print:border-slate-900 print:p-1">
                                    {isEditing ? (
                                        <>
                                            <div className="flex flex-col gap-1.5 print:hidden">
                                                <span className="text-[10px] font-black text-slate-500 font-oswald">WEEK {idx + 1}</span>
                                                <input
                                                    type="date"
                                                    value={row.startDate || ''}
                                                    onChange={(e) => onUpdateRow(idx, { ...data[idx], startDate: e.target.value })}
                                                    className="w-full bg-white border border-slate-300 p-1 text-[11px] font-bold rounded focus:ring-1 focus:ring-blue-400 outline-none"
                                                />
                                                <input
                                                    type="date"
                                                    value={row.endDate || ''}
                                                    onChange={(e) => onUpdateRow(idx, { ...data[idx], endDate: e.target.value })}
                                                    className="w-full bg-white border border-slate-300 p-1 text-[11px] font-bold rounded focus:ring-1 focus:ring-blue-400 outline-none"
                                                />
                                            </div>
                                            <div className="hidden print:flex flex-col items-center justify-center">
                                                <span className="font-oswald font-black text-xs md:text-sm text-slate-800 print:text-black uppercase">
                                                    WEEK {idx + 1}
                                                </span>
                                                <span className="font-mono text-[10px] md:text-xs font-bold text-slate-600 print:text-black mt-0.5" dir="ltr">
                                                    {formatDateRange(row, idx)}
                                                </span>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center">
                                            <span className="font-oswald font-black text-xs md:text-sm text-slate-800 print:text-black uppercase">
                                                WEEK {idx + 1}
                                            </span>
                                            <span className="font-mono text-[10px] md:text-xs font-bold text-slate-600 print:text-black mt-0.5" dir="ltr">
                                                {formatDateRange(row, idx)}
                                            </span>
                                        </div>
                                    )}
                                </td>

                                {/* Cells for Each Duty Column */}
                                {columns.map((col) => {
                                    const isNightCol = col.id === 'night' || col.title.toLowerCase().includes('night');
                                    const cellStaff = row[col.id] as VisualStaff[] | undefined;

                                    return (
                                        <td key={col.id} className="p-1 align-top bg-white print:bg-transparent border-r border-slate-200 print:border-r print:border-slate-800 border-b-2 border-slate-800 print:border-b-2 print:border-slate-900 print:p-0.5 print:static">
                                            {renderStaffList(cellStaff, idx, col.id, col)}

                                            {/* Night Shift Specific Date Range Overrides */}
                                            {isNightCol && (isEditing || row.nightStartDate || row.nightEndDate) && (
                                                <div className="mt-1 pt-1 border-t border-dashed border-slate-200 print:border-slate-400 text-center">
                                                    {isEditing ? (
                                                        <>
                                                            <div className="flex flex-col gap-1 p-1 bg-indigo-50/50 rounded-lg print:hidden">
                                                                <span className="text-[8px] font-bold text-indigo-700 uppercase">🌙 Night Specific Dates</span>
                                                                <div className="flex gap-1">
                                                                    <input 
                                                                        type="date" 
                                                                        className="w-1/2 text-[9px] border border-slate-200 bg-white rounded p-0.5" 
                                                                        value={row.nightStartDate || ''} 
                                                                        onChange={(e) => onUpdateRow(idx, { ...data[idx], nightStartDate: e.target.value })} 
                                                                    />
                                                                    <input 
                                                                        type="date" 
                                                                        className="w-1/2 text-[9px] border border-slate-200 bg-white rounded p-0.5" 
                                                                        value={row.nightEndDate || ''} 
                                                                        onChange={(e) => onUpdateRow(idx, { ...data[idx], nightEndDate: e.target.value })} 
                                                                    />
                                                                </div>
                                                            </div>
                                                            {(row.nightStartDate || row.nightEndDate) && (
                                                                <div className="hidden print:inline-block text-[9px] print:text-[8px] font-bold text-indigo-800 bg-indigo-50/80 px-1 py-0.5 rounded border border-indigo-200" dir="ltr">
                                                                    🌙 {row.nightStartDate || ''} {row.nightEndDate ? `— ${row.nightEndDate}` : ''}
                                                                </div>
                                                            )}
                                                        </>
                                                    ) : (
                                                        (row.nightStartDate || row.nightEndDate) && (
                                                            <div className="text-[9px] print:text-[8px] font-bold text-indigo-800 bg-indigo-50/80 px-1 py-0.5 rounded border border-indigo-200 inline-block" dir="ltr">
                                                                🌙 {row.nightStartDate || ''} {row.nightEndDate ? `— ${row.nightEndDate}` : ''}
                                                            </div>
                                                        )
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                    );
                                })}

                                {/* Row Note Cell */}
                                <td className="px-2 py-2 text-center align-middle bg-slate-50/40 print:bg-transparent border-r border-slate-200 print:border-r print:border-slate-800 border-b-2 border-slate-800 print:border-b-2 print:border-slate-900 print:p-1">
                                    {isEditing ? (
                                        <>
                                            <textarea
                                                value={row.note || ''}
                                                onChange={(e) => onUpdateRow(idx, { ...data[idx], note: e.target.value })}
                                                className="w-full bg-white border border-slate-300 p-1.5 text-xs rounded-xl text-center resize-none h-16 focus:ring-1 focus:ring-blue-400 outline-none print:hidden"
                                                placeholder="Weekly note..."
                                            />
                                            {row.note ? (
                                                <div className="hidden print:block font-bold text-[10px] print:text-[8px] whitespace-pre-line leading-tight text-amber-900 bg-amber-50 p-1.5 rounded-lg border border-amber-200">
                                                    {row.note}
                                                </div>
                                            ) : (
                                                <span className="hidden print:inline text-slate-300 print:text-slate-400 text-xs">—</span>
                                            )}
                                        </>
                                    ) : (
                                        row.note ? (
                                            <div className="font-bold text-[10px] print:text-[8px] whitespace-pre-line leading-tight text-amber-900 bg-amber-50 p-1.5 rounded-lg border border-amber-200">
                                                {row.note}
                                            </div>
                                        ) : (
                                            <span className="text-slate-300 print:text-slate-400 text-xs">—</span>
                                        )
                                    )}
                                </td>

                                {/* Delete Row Button in Edit Mode */}
                                {isEditing && (
                                    <td className="px-1 py-2 align-middle print:hidden bg-white text-center border-b-2 border-slate-800">
                                        <button 
                                            type="button"
                                            onClick={() => { if (window.confirm('Delete this weekly row?')) onRemoveRow(idx); }} 
                                            className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-colors"
                                            title="Delete Weekly Row"
                                        >
                                            <i className="fas fa-trash text-xs"></i>
                                        </button>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Add Weekly Row Button in Edit Mode */}
            {isEditing && (
                <button 
                    type="button"
                    onClick={onAddRow} 
                    className="w-full py-3.5 bg-white border-2 border-dashed border-slate-300 text-slate-700 font-black rounded-2xl hover:bg-slate-50 hover:border-blue-400 hover:text-blue-600 transition-all flex items-center justify-center gap-2 shadow-xs print:hidden"
                >
                    <i className="fas fa-plus-circle text-base"></i>
                    <span>+ Add Weekly Row</span>
                </button>
            )}

            {/* Print Footer */}
            <div className="print:mt-6 print:flex print:justify-end">
                <PrintFooter themeColor="blue" />
            </div>
        </div>
    );
};

export default DoctorScheduleView;
