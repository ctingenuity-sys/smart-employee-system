
import React, { useState, useMemo, useCallback } from 'react';
import { DoctorFridayRow, VisualStaff, User, ScheduleColumn } from '../../types';
import { PrintHeader, PrintFooter } from '../PrintLayout';
import { SoftColorInfo, getSoftStaffColor } from './scheduleColorUtils';
import { useDepartment } from '../../contexts/DepartmentContext';

export type DoctorColorInfo = SoftColorInfo;

interface StaffMember {
  name: string;
  time?: string;
  color: string;
  isPP?: boolean;
  note?: string;
}

const ppRegex = /(?:\(|\[|\{)\s*pp\s*(?:\)|\]|\})/i;

const mapVisualToStaff = (list: VisualStaff[] | undefined, uniqueList?: string[]): StaffMember[] => {
    if (!list || !Array.isArray(list)) return [];
    return list.map(s => ({
        name: s.name,
        time: s.time,
        note: s.note,
        color: getSoftStaffColor(s.name, uniqueList).className,
        isPP: ppRegex.test(s.name)
    }));
};

interface DoctorFridayScheduleViewProps {
  searchTerm: string;
  data: DoctorFridayRow[];
  isEditing: boolean;
  allUsers: User[];
  publishMonth: string;
  onUpdateRow: (index: number, newRow: DoctorFridayRow) => void;
  onAddRow: () => void;
  onRemoveRow: (index: number) => void;
  
  columns: ScheduleColumn[];
  onUpdateColumn: (index: number, newCol: ScheduleColumn) => void;
  onRemoveColumn: (colId: string) => void;
}

const DoctorFridayScheduleView: React.FC<DoctorFridayScheduleViewProps> = ({ 
    searchTerm: _searchTerm, 
    data = [],
    isEditing,
    allUsers = [],
    onUpdateRow,
    onAddRow,
    onRemoveRow,
    publishMonth,
    columns,
    onUpdateColumn,
    onRemoveColumn
}) => {
    const [editDragItem, setEditDragItem] = useState<{ rowIndex: number, column: string, index: number } | null>(null);
    const [customTitle, setCustomTitle] = useState('');
    const [selectedDoctorName, setSelectedDoctorName] = useState<string | null>(null);
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
        return (allUsers || []).filter(u => {
            if (selectedDepartmentId && !matchesDept(u, selectedDepartmentId)) {
                return false;
            }
            const role = (u.role || '').toLowerCase();
            const cat = (u.jobCategory || '').toLowerCase();
            const name = (u.name || '').toLowerCase();
            return role === 'doctor' || cat === 'doctor' || cat.includes('طبيب') || name.startsWith('dr.') || name.startsWith('dr ') || name.includes('د.');
        });
    }, [allUsers, selectedDepartmentId, matchesDept]);

    // Compute Doctor Friday Statistics
    const doctorFridayStats = useMemo(() => {
        const stats: Record<string, { count: number; dates: string[]; originalName: string; shifts: { date: string; colTitle: string; time?: string }[] }> = {};

        data.forEach(row => {
            const rowDate = row.date || 'جمعة بدون تاريخ';
            columns.forEach(col => {
                const list = (row[col.id] as VisualStaff[]) || [];
                list.forEach(s => {
                    const cleanName = (s.name || '').replace(ppRegex, '').trim();
                    if (!cleanName || cleanName === 'New Dr' || cleanName === 'Doctor Name' || cleanName === 'Dr. Name') return;
                    const normalized = cleanName.toLowerCase();
                    if (!stats[normalized]) {
                        stats[normalized] = { count: 0, dates: [], originalName: cleanName, shifts: [] };
                    }
                    stats[normalized].count += 1;
                    if (!stats[normalized].dates.includes(rowDate)) {
                        stats[normalized].dates.push(rowDate);
                    }
                    stats[normalized].shifts.push({
                        date: rowDate,
                        colTitle: col.title || 'شفت',
                        time: s.time || col.time
                    });
                });
            });
        });

        return stats;
    }, [data, columns]);

    const uniqueDoctorNames = useMemo(() => {
        return Object.values(doctorFridayStats).map(s => s.originalName);
    }, [doctorFridayStats]);

    const sortedDoctorStats = useMemo(() => {
        return Object.values(doctorFridayStats).sort((a, b) => b.count - a.count || a.originalName.localeCompare(b.originalName));
    }, [doctorFridayStats]);

    const handleDoctorClick = useCallback((name: string) => {
        const clean = (name || '').replace(ppRegex, '').trim();
        if (!clean || clean === 'New Dr' || clean === 'Doctor Name') return;
        const normalized = clean.toLowerCase();
        setSelectedDoctorName(prev => (prev === normalized ? null : normalized));
    }, []);

    const staffData = useMemo(() => {
        if (!data || !Array.isArray(data)) return [];
        return data.map(row => {
            const mappedRow: any = { ...row };
            columns.forEach(col => {
                mappedRow[col.id] = mapVisualToStaff(row[col.id], uniqueDoctorNames);
            });
            return mappedRow;
        });
    }, [data, columns, uniqueDoctorNames]);

    const handleStaffChange = useCallback((rowIndex: number, columnId: string, index: number, field: 'name' | 'time' | 'note', value: string) => {
        if (!data[rowIndex]) return;
        const row = { ...data[rowIndex] };
        if (columnId !== 'id' && columnId !== 'date') {
            const currentList = [...(row[columnId] as VisualStaff[] || [])];
            if (currentList[index]) {
                currentList[index] = { ...currentList[index], [field]: value };
                onUpdateRow(rowIndex, { ...row, [columnId]: currentList });
            }
        }
    }, [data, onUpdateRow]);

    const togglePP = useCallback((rowIndex: number, columnId: string, index: number) => {
        const row = { ...data[rowIndex] };
        if (columnId !== 'id' && columnId !== 'date') {
            const currentList = [...(row[columnId] as VisualStaff[] || [])];
            if (currentList[index]) {
                let name = currentList[index].name;
                if (ppRegex.test(name)) {
                    name = name.replace(ppRegex, '').trim();
                } else {
                    name = `${name} (PP)`;
                }
                currentList[index] = { ...currentList[index], name: name };
                onUpdateRow(rowIndex, { ...row, [columnId]: currentList });
            }
        }
    }, [data, onUpdateRow]);

    const handleAddNewStaff = useCallback((rowIndex: number, columnId: string) => {
        if (!data[rowIndex]) return;
        const row = { ...data[rowIndex] };
        if (columnId !== 'id' && columnId !== 'date') {
            const currentList = [...(row[columnId] as VisualStaff[] || [])];
            currentList.push({ name: 'New Dr', time: '' });
            onUpdateRow(rowIndex, { ...row, [columnId]: currentList });
        }
    }, [data, onUpdateRow]);

    const removeStaffMember = useCallback((rowIndex: number, columnId: string, index: number) => {
         if (!data[rowIndex]) return;
         const row = { ...data[rowIndex] };
         if (columnId !== 'id' && columnId !== 'date') {
            const currentList = [...(row[columnId] as VisualStaff[] || [])];
            currentList.splice(index, 1);
            onUpdateRow(rowIndex, { ...row, [columnId]: currentList });
         }
    }, [data, onUpdateRow]);

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
            if (srcCol === 'id' || srcCol === 'date' || targetColumnId === 'id' || targetColumnId === 'date') return;

            const sourceRow = { ...data[srcRowIdx] };
            const sourceList = [...(sourceRow[srcCol] as VisualStaff[] || [])];
            const itemToMove = sourceList[srcIndex];
            
            if(!itemToMove) return;

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

        try {
            const rawData = e.dataTransfer.getData('application/react-dnd-staff');
            if (rawData) {
                 const staffData = JSON.parse(rawData);
                 const row = { ...data[targetRowIndex] };
                 if (targetColumnId !== 'id' && targetColumnId !== 'date') {
                    const currentList = [...(row[targetColumnId] as VisualStaff[])];
                    currentList.push({ name: staffData.name, userId: staffData.id });
                    onUpdateRow(targetRowIndex, { ...row, [targetColumnId]: currentList });
                 }
            }
        } catch(err) { console.error(err); }
    };

    const renderStaffList = (staffList: StaffMember[], rowIndex: number, columnId: string) => {
        const safeStaffList = staffList || [];
        
        if (isEditing) {
            const rawList = (data[rowIndex] && data[rowIndex][columnId]) ? (data[rowIndex][columnId] as VisualStaff[]) : [];
            return (
                <>
                    <div 
                        className="space-y-2 min-h-[60px] p-1.5 h-full print:hidden"
                        onDragOver={onEditDragOver}
                        onDrop={(e) => onEditDrop(e, rowIndex, columnId)}
                    >
                        {rawList.map((s, i) => {
                            const hasPP = ppRegex.test(s.name);
                            const cleanName = s.name.replace(ppRegex, '').trim();
                            const colorInfo = getSoftStaffColor(cleanName, uniqueDoctorNames);
                            const stats = cleanName ? doctorFridayStats[cleanName.toLowerCase()] : null;
                            const count = stats?.count || 0;
                            const isSelected = selectedDoctorName && cleanName.toLowerCase() === selectedDoctorName;

                            return (
                            <div 
                                key={i} 
                                draggable 
                                onDragStart={(e) => onEditDragStart(e, rowIndex, columnId, i)} 
                                className={`flex items-start gap-1.5 group cursor-grab active:cursor-grabbing p-2 rounded-lg border-2 transition-all shadow-xs ${
                                    isSelected 
                                        ? 'ring-2 ring-offset-1 ring-blue-500 border-blue-500 shadow-md scale-[1.01]' 
                                        : 'border-slate-200 hover:border-slate-300'
                                }`}
                                style={{ backgroundColor: colorInfo.bg, borderColor: isSelected ? undefined : colorInfo.border }}
                            >
                                <div className="flex flex-col flex-1 gap-1.5 min-w-0">
                                    <div className="flex items-center justify-between gap-1">
                                        <input
                                            value={cleanName}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                handleStaffChange(rowIndex, columnId, i, 'name', hasPP ? `${val} (PP)` : val);
                                            }}
                                            className={`w-full text-xs font-black px-2 py-1 bg-white border border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 rounded-md outline-none transition-all shadow-xs ${
                                                hasPP ? 'text-amber-900' : 'text-slate-900'
                                            }`}
                                            placeholder="اسم الطبيب / Dr. Name"
                                            list={`dr-friday-list-${rowIndex}-${columnId}-${i}`}
                                        />
                                        <datalist id={`dr-friday-list-${rowIndex}-${columnId}-${i}`}>
                                            {availableDoctors.map(doc => (
                                                <option key={doc.id} value={doc.name} />
                                            ))}
                                        </datalist>
                                        {count > 0 && (
                                            <span 
                                                className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full whitespace-nowrap shadow-xs shrink-0"
                                                style={{ backgroundColor: colorInfo.badgeBg, color: colorInfo.badgeText }}
                                                title={`إجمالي جمعات الطبيب في الشهر: ${count}`}
                                            >
                                                {count} ج
                                            </span>
                                        )}
                                    </div>
                                    <div className="relative flex items-center">
                                        <span className="absolute left-2 text-[10px] text-slate-400 pointer-events-none">
                                            <i className="far fa-clock"></i>
                                        </span>
                                        <input
                                            value={s.time || ''}
                                            onChange={(e) => handleStaffChange(rowIndex, columnId, i, 'time', e.target.value)}
                                            className="w-full text-xs font-bold text-slate-800 pl-6 pr-2 py-1 bg-white border border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none rounded-md transition-all shadow-xs placeholder:text-slate-400 placeholder:font-normal"
                                            placeholder="الوقت المحدد (Specific Time)"
                                        />
                                    </div>
                                    <div className="relative flex items-center">
                                        <span className="absolute left-2 text-[10px] text-amber-600 pointer-events-none">
                                            <i className="fas fa-sticky-note"></i>
                                        </span>
                                        <input
                                            value={s.note || ''}
                                            onChange={(e) => handleStaffChange(rowIndex, columnId, i, 'note', e.target.value)}
                                            className="w-full text-xs font-bold text-amber-950 pl-6 pr-2 py-1 bg-amber-50/90 border border-amber-300 focus:border-amber-600 focus:ring-2 focus:ring-amber-100 outline-none rounded-md transition-all shadow-xs placeholder:text-amber-700/60 placeholder:font-normal"
                                            placeholder="ملاحظة (Note)"
                                        />
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1 shrink-0 pt-0.5">
                                    <button 
                                        type="button"
                                        onClick={() => togglePP(rowIndex, columnId, i)} 
                                        className={`px-1.5 py-1 rounded text-[10px] font-black border transition-all shadow-xs ${
                                            hasPP 
                                                ? 'bg-amber-400 text-amber-950 border-amber-500 ring-2 ring-amber-200' 
                                                : 'bg-slate-100 text-slate-500 border-slate-300 hover:bg-slate-200'
                                        }`}
                                        title={hasPP ? "إزالة شارة PP" : "إضافة شارة PP (Portable & Procedure)"}
                                    >
                                        PP
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => removeStaffMember(rowIndex, columnId, i)} 
                                        className="p-1 rounded text-red-400 hover:text-red-700 hover:bg-red-50 transition-colors flex items-center justify-center"
                                        title="حذف الطبيب من هذا الشفت"
                                    >
                                        <i className="fas fa-trash-alt text-xs"></i>
                                    </button>
                                </div>
                            </div>
                        )})}
                        <button 
                            type="button"
                            onClick={() => handleAddNewStaff(rowIndex, columnId)} 
                            className="w-full text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 py-1.5 rounded-lg transition-all shadow-xs flex items-center justify-center gap-1.5 mt-1.5 cursor-pointer"
                        >
                            <i className="fas fa-plus text-[10px]"></i>
                            <span>إضافة طبيب (+ Add)</span>
                        </button>
                    </div>

                    {/* Dedicated Print View for Edit Mode */}
                    <div className="hidden print:flex flex-col gap-1 w-full h-full justify-center">
                        {rawList.map((s, idx) => {
                            const displayName = s.name.replace(ppRegex, '').trim();
                            const colorInfo = getSoftStaffColor(displayName, uniqueDoctorNames);
                            const hasPP = ppRegex.test(s.name);

                            return (
                                <div 
                                    key={idx}
                                    className="flex flex-col items-center justify-center text-center leading-tight w-full rounded-md p-1 border print-color-adjust-exact"
                                    style={{
                                        backgroundColor: colorInfo.bg,
                                        color: colorInfo.text,
                                        borderColor: colorInfo.border,
                                        borderWidth: '1px',
                                        borderStyle: 'solid'
                                    }}
                                >
                                    <div className="text-sm font-bold uppercase text-center print:leading-tight flex flex-wrap justify-center items-center gap-1 w-full print:text-[11px] print:text-black">
                                        <span className="font-black font-oswald">{displayName}</span>
                                        {s.time && <span className="text-[10px] font-medium opacity-80 whitespace-nowrap">({s.time})</span>}
                                    </div>
                                    {s.note && (
                                        <div className="text-[10px] font-bold text-yellow-700 bg-yellow-50 px-1 py-0.5 rounded border border-yellow-200 mt-1 w-full text-center print:text-[8px] print:bg-white print:text-black">
                                            {s.note}
                                        </div>
                                    )}
                                    {hasPP && (
                                        <div className="w-full text-[10px] font-black bg-yellow-400 text-black border-2 border-yellow-600 rounded px-1 py-0.5 mt-1 shadow-md uppercase tracking-wider text-center block print:bg-yellow-400 print:text-black print:border-black print-color-adjust-exact print:text-[8px]">
                                            PORTABLE & PROCEDURE
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </>
            );
        }
        return (
            <div className="flex flex-col gap-2 w-full h-full justify-center">
                {safeStaffList.map((s, idx) => {
                    const displayName = s.name.replace(ppRegex, '').trim();
                    const colorInfo = getSoftStaffColor(displayName, uniqueDoctorNames);
                    const isSelected = selectedDoctorName && displayName.toLowerCase() === selectedDoctorName;
                    const stats = displayName ? doctorFridayStats[displayName.toLowerCase()] : null;
                    const count = stats?.count || 0;

                    return (
                        <div 
                            key={idx} 
                            onClick={() => handleDoctorClick(displayName)}
                            className={`flex flex-col items-center justify-center text-center leading-tight w-full rounded-md p-1 transition-all cursor-pointer ${
                                isSelected 
                                    ? 'ring-4 ring-offset-2 ring-blue-600 shadow-xl scale-[1.04] z-10' 
                                    : 'hover:opacity-95 hover:shadow-xs'
                            } print:p-1 print:border print-color-adjust-exact`}
                            style={{
                                backgroundColor: colorInfo.bg,
                                color: colorInfo.text,
                                borderColor: colorInfo.border,
                                borderWidth: '1px',
                                borderStyle: 'solid',
                                WebkitPrintColorAdjust: 'exact',
                                printColorAdjust: 'exact'
                            }}
                            title={`انقر لتمييز وإظهار إحصائيات الطبيب (${count} جمعات)`}
                        >
                            <div className="text-sm font-bold uppercase text-center print:leading-tight flex flex-wrap justify-center items-center gap-1 w-full print:text-[11px]">
                                <span className="font-black">{displayName}</span>
                                {count > 0 && (
                                    <span 
                                        className="text-[9px] font-extrabold px-1.5 py-0.2 rounded-full whitespace-nowrap shadow-xs print:text-[8px] print:px-1"
                                        style={{ 
                                            backgroundColor: colorInfo.badgeBg, 
                                            color: colorInfo.badgeText,
                                            WebkitPrintColorAdjust: 'exact',
                                            printColorAdjust: 'exact'
                                        }}
                                    >
                                        {count} ج
                                    </span>
                                )}
                                {s.time && <span className="text-[10px] font-medium opacity-80 whitespace-nowrap">({s.time})</span>}
                            </div>
                            {s.note && (
                                <div className="text-[10px] font-bold text-yellow-700 bg-yellow-50 px-1 py-0.5 rounded border border-yellow-200 mt-1 w-full text-center print:text-[8px]">
                                    {s.note}
                                </div>
                            )}
                            {s.isPP && (
                                <div className="w-full text-[10px] font-black bg-yellow-400 text-black border-2 border-yellow-600 rounded px-1 py-0.5 mt-1 shadow-md uppercase tracking-wider text-center block print:bg-yellow-400 print:text-black print:border-black print-color-adjust-exact z-10 relative print:text-[8px]">
                                    PORTABLE & PROCEDURE
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderHeaderCell = (col: ScheduleColumn, index: number, widthClass: string) => {
        return (
            <th key={col.id} className={`group relative px-2 py-2 text-center border-r-2 border-slate-800 bg-slate-200 print:bg-[#e6e7e8] print:text-black print:px-1 print:py-1 print:border-r print:border-slate-800 ${widthClass}`}>
                <div className="flex flex-col h-full items-center justify-center">
                    <div className="border-b-2 border-slate-800 pb-1 mb-1 font-black text-xs print:text-[10px] print:border-slate-600 print:pb-0.5 print:mb-0.5 uppercase tracking-wide w-full">
                        {isEditing ? (
                            <input 
                                value={col.title} 
                                onChange={(e) => onUpdateColumn(index, {...col, title: e.target.value})}
                                className="w-full bg-white border border-slate-300 px-1 text-center"
                            />
                        ) : col.title}
                    </div>
                    {/* Time or Subtitle */}
                    <div className="text-[9px] font-bold uppercase leading-tight print:text-[8px] whitespace-pre-wrap">
                        {isEditing ? (
                            <textarea 
                                value={col.time || ''} 
                                onChange={(e) => onUpdateColumn(index, {...col, time: e.target.value})}
                                className="w-full bg-white border border-slate-300 px-1 h-12 resize-none text-center"
                                placeholder="Time"
                            />
                        ) : col.time}
                    </div>
                    {isEditing && (
                        <button 
                            onClick={() => onRemoveColumn(col.id)}
                            className="absolute top-1 right-1 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <i className="fas fa-trash text-[10px]"></i>
                        </button>
                    )}
                </div>
            </th>
        );
    };

  // Calculate width based on columns count
  const colWidth = columns.length > 0 ? `w-[${Math.floor(100 / columns.length)}%]` : 'w-auto';

  return (
    <div className="space-y-6 animate-fade-in print:space-y-1 print:w-full relative print:bg-white print:text-left">
        <PrintHeader month={customTitle || publishMonth} subtitle="DOCTORS FRIDAY SCHEDULE" themeColor="slate" />

        <div className="bg-slate-800 text-white p-4 rounded-xl shadow-md flex flex-col md:flex-row justify-between items-center gap-4 print:hidden">
            <div>
                <h2 className="text-xl font-bold uppercase tracking-wide">Doctors Friday Schedule</h2>
                <p className="text-slate-300 text-sm font-medium opacity-90">Manage Friday shifts for doctors</p>
            </div>
            
            {isEditing && (
                <div className="flex flex-col min-w-[200px]">
                    <input 
                        className="bg-slate-700 text-white px-3 py-1.5 rounded border border-slate-600 text-sm font-bold w-full focus:bg-slate-600 transition-colors"
                        placeholder="Custom Print Title (Overrides Month)"
                        value={customTitle}
                        onChange={(e) => setCustomTitle(e.target.value)}
                    />
                </div>
            )}
        </div>

        {/* Doctor Friday Counts Quick Bar (Interactive) */}
        {sortedDoctorStats.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 shadow-xs print:hidden">
                <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                            <i className="fas fa-user-md text-blue-600"></i>
                            إحصائيات جمعات الأطباء (اضغط على أي طبيب لتحديده وتمييزه في الجدول):
                        </span>
                        <span className="text-[11px] font-medium bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                            {sortedDoctorStats.length} طبيب
                        </span>
                    </div>
                    {selectedDoctorName && (
                        <button
                            onClick={() => setSelectedDoctorName(null)}
                            className="text-xs font-semibold text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
                        >
                            <i className="fas fa-times-circle"></i>
                            إلغاء التحديد
                        </button>
                    )}
                </div>

                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1">
                    {sortedDoctorStats.map((item) => {
                        const colorInfo = getSoftStaffColor(item.originalName, uniqueDoctorNames);
                        const isSelected = selectedDoctorName === item.originalName.toLowerCase();
                        return (
                            <button
                                key={item.originalName}
                                onClick={() => handleDoctorClick(item.originalName)}
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                                    isSelected
                                        ? 'ring-2 ring-blue-500 shadow-md scale-105 font-black'
                                        : 'hover:opacity-90 hover:scale-[1.02]'
                                }`}
                                style={{
                                    backgroundColor: colorInfo.bg,
                                    color: colorInfo.text,
                                    borderColor: colorInfo.border
                                }}
                            >
                                <span>{item.originalName}</span>
                                <span
                                    className="px-1.5 py-0.2 rounded-full text-[10px] font-extrabold shadow-xs"
                                    style={{
                                        backgroundColor: colorInfo.badgeBg,
                                        color: colorInfo.badgeText
                                    }}
                                >
                                    {item.count} {item.count === 1 ? 'جمعة' : item.count === 2 ? 'جمعتين' : 'جمعات'}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Selected Doctor Detailed Shift Info Banner */}
                {selectedDoctorName && doctorFridayStats[selectedDoctorName] && (
                    <div 
                        className="mt-3 p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in"
                        style={{
                            backgroundColor: getSoftStaffColor(doctorFridayStats[selectedDoctorName].originalName, uniqueDoctorNames).bg,
                            borderColor: getSoftStaffColor(doctorFridayStats[selectedDoctorName].originalName, uniqueDoctorNames).border,
                            color: getSoftStaffColor(doctorFridayStats[selectedDoctorName].originalName, uniqueDoctorNames).text
                        }}
                    >
                        <div className="flex items-center gap-3">
                            <div 
                                className="w-10 h-10 rounded-full flex items-center justify-center font-black text-sm shadow-sm"
                                style={{
                                    backgroundColor: getSoftStaffColor(doctorFridayStats[selectedDoctorName].originalName, uniqueDoctorNames).badgeBg,
                                    color: getSoftStaffColor(doctorFridayStats[selectedDoctorName].originalName, uniqueDoctorNames).badgeText
                                }}
                            >
                                {doctorFridayStats[selectedDoctorName].count}
                            </div>
                            <div>
                                <div className="font-black text-sm flex items-center gap-2">
                                    <span>الطبيب: {doctorFridayStats[selectedDoctorName].originalName}</span>
                                    <span className="text-xs opacity-80 font-normal">
                                        (إجمالي {doctorFridayStats[selectedDoctorName].count} {doctorFridayStats[selectedDoctorName].count === 1 ? 'جمعة' : 'جمعات'} في الشهر)
                                    </span>
                                </div>
                                <div className="text-xs opacity-90 mt-0.5">
                                    الجمعات المحددة في الجدول مضاءة بلون مميز لسهولة المتابعة.
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-1.5 items-center">
                            {doctorFridayStats[selectedDoctorName].shifts.map((shift, sIdx) => (
                                <span 
                                    key={sIdx}
                                    className="bg-white/80 backdrop-blur-xs px-2 py-0.5 rounded text-[11px] font-semibold border border-black/10 shadow-xs"
                                >
                                    {shift.date} : {shift.colTitle} {shift.time ? `(${shift.time})` : ''}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        )}

      <div dir="ltr" className="overflow-x-auto rounded-none border-2 border-slate-800 shadow-none bg-white print:block print:overflow-visible print:border-2 print:border-slate-900 print:w-full">
        <table className="doctor-schedule-table min-w-full divide-y divide-slate-800 border-collapse table-fixed">
          <thead className="bg-slate-200 print:bg-[#e6e7e8] print-color-adjust-exact">
            <tr className="divide-x divide-slate-800 border-b-2 border-slate-800">
              <th className="px-2 py-3 text-center text-xs font-black text-slate-900 uppercase border-r-2 border-slate-800 min-w-[130px] w-36 bg-slate-200 print:bg-[#e6e7e8] print:w-20 print:px-1 print:py-2 print:text-[10px] print:leading-tight">
                  DATE
              </th>
              {columns.map((col, idx) => renderHeaderCell(col, idx, colWidth))}
              <th className="px-2 py-3 text-center text-xs font-black text-slate-900 uppercase border-r-2 border-slate-800 min-w-[120px] w-32 bg-slate-200 print:bg-[#e6e7e8] print:w-24 print:px-1 print:py-2 print:text-[10px] print:leading-tight">
                  NOTE
              </th>
              {isEditing && <th className="w-8 bg-white print:hidden"></th>}
            </tr>
          </thead>
          <tbody className="bg-white">
            {staffData.map((row, idx) => (
              <tr key={idx} className="divide-x divide-slate-800 border-b-2 border-slate-800 print:border-b-2 print:border-slate-900 min-h-[5rem] print:h-auto">
                <td className="px-2 py-2 text-sm font-bold text-slate-900 align-middle bg-slate-50 print:bg-transparent border-r-2 border-slate-800 border-b-2 border-slate-800 print:border-b-2 print:border-slate-900 print:p-1 print:text-[10px] text-center min-w-[130px] w-36">
                    {isEditing ? (
                        <input
                            type="text"
                            value={row.date || ''}
                            onChange={(e) => onUpdateRow(idx, {...data[idx], date: e.target.value})}
                            className="w-full bg-white border-2 border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 p-2 text-xs font-black rounded-lg text-center shadow-xs transition-all placeholder:text-slate-400"
                            placeholder="DD/MM/YYYY"
                        />
                    ) : (
                        <div className="font-black text-xs print:text-[10px] whitespace-pre-line leading-tight">
                            {row.date}
                        </div>
                    )}
                </td>
                
                {columns.map((col) => (
                    <td key={col.id} className="px-1.5 py-1.5 align-middle bg-white border-r-2 border-slate-800 border-b-2 border-slate-800 print:border-b-2 print:border-slate-900 print:p-0.5">
                        {renderStaffList(row[col.id], idx, col.id)}
                    </td>
                ))}

                <td className="px-2 py-2 text-sm font-bold text-slate-900 align-middle bg-slate-50 print:bg-transparent border-r-2 border-slate-800 border-b-2 border-slate-800 print:border-b-2 print:border-slate-900 print:p-1 print:text-[10px] text-center min-w-[120px] w-32">
                    {isEditing ? (
                        <textarea
                            value={row.note || ''}
                            onChange={(e) => onUpdateRow(idx, {...data[idx], note: e.target.value})}
                            className="w-full bg-white border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 p-1.5 text-xs font-medium rounded-lg text-center resize-none h-16 shadow-xs transition-all placeholder:text-slate-400"
                            placeholder="ملاحظات..."
                        />
                    ) : (
                        <div className="font-bold text-[10px] print:text-[9px] whitespace-pre-line leading-tight text-slate-600">
                            {row.note}
                        </div>
                    )}
                </td>

                {isEditing && (
                    <td className="px-1 py-1 align-middle print:hidden bg-white text-center border-b-2 border-slate-800">
                        <button onClick={() => { if(window.confirm('Delete this row?')) onRemoveRow(idx); }} className="text-red-500 hover:bg-red-50 p-1 rounded">
                            <i className="fas fa-times"></i>
                        </button>
                    </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {isEditing && (
            <button onClick={onAddRow} className="w-full py-3 bg-slate-50 border border-slate-300 text-slate-600 font-bold hover:bg-slate-100 transition-colors print:hidden">
                + Add Friday Row
            </button>
      )}
      
      <div className="print:mt-4 print:flex print:justify-end">
          <PrintFooter themeColor="slate" />
      </div>
    </div>
  );
};

export default DoctorFridayScheduleView;
