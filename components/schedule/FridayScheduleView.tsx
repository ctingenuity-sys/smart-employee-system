
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { FridayScheduleRow, VisualStaff, User, ScheduleColumn } from '../../types';
import { PrintHeader, PrintFooter } from '../PrintLayout';
import { SoftColorInfo, getSoftStaffColor } from './scheduleColorUtils';

export type StaffColorInfo = SoftColorInfo;

interface FridayScheduleViewProps {
  searchTerm: string;
  data: FridayScheduleRow[];
  isEditing: boolean;
  allUsers: User[];
  publishMonth: string;
  onUpdateRow: (index: number, newRow: FridayScheduleRow) => void;
  onAddRow: () => void;
  onRemoveRow: (index: number) => void;
  
  // Dynamic Columns
  columns: ScheduleColumn[];
  onUpdateColumn: (index: number, newCol: ScheduleColumn) => void;
  onRemoveColumn: (colId: string) => void;
}

type HeaderColor = 'teal' | 'blue' | 'purple' | 'rose' | 'indigo' | 'amber' | 'cyan' | 'emerald' | 'slate' | 'violet';

const FridayScheduleView: React.FC<FridayScheduleViewProps> = ({ 
    searchTerm, 
    data, 
    isEditing,
    publishMonth,
    onUpdateRow,
    onAddRow,
    onRemoveRow,
    columns,
    onUpdateColumn,
    onRemoveColumn
}) => {
    const [editDragItem, setEditDragItem] = useState<{ rowIndex: number, column: string, index: number } | null>(null);
    const [headerColor, setHeaderColor] = useState<HeaderColor>('teal');
    const [customTitle, setCustomTitle] = useState('');
    const [selectedStaffName, setSelectedStaffName] = useState<string | null>(null);

    // Compute Friday Statistics for each staff member across the table
    const staffFridayStats = useMemo(() => {
        const stats: Record<string, { count: number; dates: string[]; originalName: string; shifts: { date: string; colTitle: string; time?: string }[] }> = {};

        data.forEach(row => {
            const rowDate = row.date || 'جمعة بدون تاريخ';
            columns.forEach(col => {
                const list = (row[col.id] as VisualStaff[]) || [];
                list.forEach(s => {
                    const name = (s.name || '').trim();
                    if (!name || name === 'New Staff' || name === 'Staff Name' || name === 'New Dr') return;
                    const normalized = name.toLowerCase();
                    if (!stats[normalized]) {
                        stats[normalized] = { count: 0, dates: [], originalName: name, shifts: [] };
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

    // Sorted staff list for quick summary bar
    const sortedStaffStats = useMemo(() => {
        return Object.values(staffFridayStats).sort((a, b) => b.count - a.count || a.originalName.localeCompare(b.originalName));
    }, [staffFridayStats]);

    const uniqueStaffNames = useMemo(() => {
        return Object.values(staffFridayStats).map(s => s.originalName);
    }, [staffFridayStats]);

    // Helper to toggle staff selection
    const handleStaffClick = useCallback((name: string) => {
        const trimmed = (name || '').trim();
        if (!trimmed || trimmed === 'New Staff' || trimmed === 'Staff Name') return;
        const normalized = trimmed.toLowerCase();
        setSelectedStaffName(prev => (prev === normalized ? null : normalized));
    }, []);

    const activeDateColumnClasses = {
        teal: 'print:bg-teal-50 print:text-teal-900',
        blue: 'print:bg-blue-50 print:text-blue-900',
        purple: 'print:bg-purple-50 print:text-purple-900',
        rose: 'print:bg-rose-50 print:text-rose-900',
        indigo: 'print:bg-indigo-50 print:text-indigo-900',
        amber: 'print:bg-amber-50 print:text-amber-900',
        cyan: 'print:bg-cyan-50 print:text-cyan-900',
        emerald: 'print:bg-emerald-50 print:text-emerald-900',
        slate: 'print:bg-slate-50 print:text-slate-900',
        violet: 'print:bg-violet-50 print:text-violet-900'
    }[headerColor] || 'print:bg-teal-50 print:text-teal-900';

    const activeHeaderBg = {
        teal: 'print:bg-teal-800',
        blue: 'print:bg-blue-800',
        purple: 'print:bg-purple-800',
        rose: 'print:bg-rose-800',
        indigo: 'print:bg-indigo-800',
        amber: 'print:bg-amber-700',
        cyan: 'print:bg-cyan-800',
        emerald: 'print:bg-emerald-800',
        slate: 'print:bg-slate-800',
        violet: 'print:bg-violet-800'
    }[headerColor] || 'print:bg-teal-800';

    // --- Edit Handlers ---
    const handleStaffChange = useCallback((rowIndex: number, columnId: string, index: number, field: keyof VisualStaff, value: string) => {
        const row = { ...data[rowIndex] };
        const currentList = [...(row[columnId] as VisualStaff[] || [])];
        if (!currentList[index]) return;
        currentList[index] = { ...currentList[index], [field]: value };
        onUpdateRow(rowIndex, { ...row, [columnId]: currentList });
    }, [data, onUpdateRow]);

    const handleAddNewStaff = useCallback((rowIndex: number, columnId: string) => {
        const row = { ...data[rowIndex] };
        const currentList = [...(row[columnId] as VisualStaff[] || [])];
        currentList.push({ name: 'New Staff' }); 
        onUpdateRow(rowIndex, { ...row, [columnId]: currentList });
    }, [data, onUpdateRow]);

    const removeStaffMember = useCallback((rowIndex: number, columnId: string, index: number) => {
         const row = { ...data[rowIndex] };
         const currentList = [...(row[columnId] as VisualStaff[] || [])];
         currentList.splice(index, 1);
         onUpdateRow(rowIndex, { ...row, [columnId]: currentList });
    }, [data, onUpdateRow]);

    const moveFridayStaff = useCallback((rowIndex: number, columnId: string, index: number, action: 'up' | 'down' | 'top' | 'bottom' | 'middle') => {
        const row = { ...data[rowIndex] };
        const currentList = [...((row[columnId] as VisualStaff[]) || [])];
        if (!currentList[index]) return;
        const item = currentList[index];
        currentList.splice(index, 1);

        if (action === 'top') {
            currentList.unshift(item);
        } else if (action === 'bottom') {
            currentList.push(item);
        } else if (action === 'middle') {
            const mid = Math.floor(currentList.length / 2);
            currentList.splice(mid, 0, item);
        } else if (action === 'up') {
            const target = Math.max(0, index - 1);
            currentList.splice(target, 0, item);
        } else if (action === 'down') {
            const target = Math.min(currentList.length, index + 1);
            currentList.splice(target, 0, item);
        }
        onUpdateRow(rowIndex, { ...row, [columnId]: currentList });
    }, [data, onUpdateRow]);

    // --- Drag & Drop ---
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
            // Prevent drop on same cell
            if (srcRowIdx === targetRowIndex && srcCol === targetColumnId) {
                 setEditDragItem(null);
                 return;
            }

            const sourceRow = { ...data[srcRowIdx] };
            const sourceList = [...(sourceRow[srcCol] as VisualStaff[] || [])];
            const itemToMove = sourceList[srcIndex];

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
                 const currentList = [...(row[targetColumnId] as VisualStaff[] || [])];
                 currentList.push({ name: staffData.name, userId: staffData.id });
                 onUpdateRow(targetRowIndex, { ...row, [targetColumnId]: currentList });
            }
        } catch(err) { console.error(err); }
    };

    const highlightMatch = (text: string) => {
        if (!searchTerm) return <span className="font-bold">{text}</span>;
        const parts = text.split(new RegExp(`(${searchTerm})`, 'gi'));
        return (
        <span className="font-bold">
            {parts.map((part, i) => 
            part.toLowerCase() === searchTerm.toLowerCase() ? 
                <span key={i} className="bg-yellow-300 text-black px-1 rounded">{part}</span> : part
            )}
        </span>
        );
    };

    const hasMatch = (list: VisualStaff[]) => {
        if(!searchTerm || !list) return false;
        return list.some(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()));
    };

    // Dynamic Header Renderer
    const renderHeader = (col: ScheduleColumn, index: number) => {
        return (
            <th key={col.id} scope="col" className={`group relative px-2 py-4 text-center text-xs font-extrabold text-white uppercase tracking-wider border-r border-white/20 bg-slate-700 ${activeHeaderBg} print:text-white print:py-1`}>
                {isEditing ? (
                    <div className="flex flex-col gap-1">
                        <input 
                            value={col.title}
                            onChange={(e) => onUpdateColumn(index, { ...col, title: e.target.value })}
                            className="bg-white/20 text-white text-center w-full rounded px-1 py-0.5 outline-none placeholder-white/50 text-[10px] font-bold"
                            placeholder="Title"
                        />
                        <input 
                            value={col.time || ''}
                            onChange={(e) => onUpdateColumn(index, { ...col, time: e.target.value })}
                            className="bg-white/10 text-white/80 text-center w-full rounded px-1 py-0.5 outline-none placeholder-white/30 text-[9px]"
                            placeholder="08:00 - 16:00"
                        />
                        <button 
                            onClick={() => onRemoveColumn(col.id)}
                            className="absolute top-1 right-1 text-red-300 hover:text-red-100 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Delete Column"
                        >
                            <i className="fas fa-trash text-[10px]"></i>
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center">
                        <div className="whitespace-pre-wrap leading-tight">{col.title}</div>
                        {col.time && (
                            <div className="text-[11px] font-normal opacity-90 mt-0.5 border-t border-white/20 pt-0.5 w-full print:text-[11px] print:font-bold print:leading-none">
                                {col.time}
                            </div>
                        )}
                    </div>
                )}
            </th>
        );
    };

    // Main Renderer for Staff Lists
    const renderStaffList = (staffList: VisualStaff[], rowIndex: number, columnId: string) => {
        const list = staffList || [];
        
        // --- EDIT MODE ---
        if (isEditing) {
            return (
                <div 
                    className="space-y-2 p-1 min-w-[140px] min-h-[60px] transition-colors rounded"
                    onDragOver={onEditDragOver}
                    onDrop={(e) => onEditDrop(e, rowIndex, columnId)}
                >
                    {list.map((s, i) => {
                        const trimmed = (s.name || '').trim();
                        const normalized = trimmed.toLowerCase();
                        const colorInfo = getSoftStaffColor(trimmed, uniqueStaffNames);
                        const isSelected = selectedStaffName && normalized === selectedStaffName;
                        const hasSelection = Boolean(selectedStaffName);
                        const staffStats = staffFridayStats[normalized];
                        const count = staffStats ? staffStats.count : 1;

                        return (
                            <div 
                                key={i} 
                                draggable
                                onDragStart={(e) => onEditDragStart(e, rowIndex, columnId, i)}
                                style={{
                                    backgroundColor: isSelected ? '#fef08a' : colorInfo.bg,
                                    borderColor: isSelected ? '#eab308' : colorInfo.border,
                                }}
                                className={`flex flex-col gap-1 group border-2 p-1.5 rounded-lg shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-all relative ${
                                    isSelected 
                                        ? 'ring-4 ring-amber-400 ring-offset-1 !bg-amber-100 text-amber-950 font-black shadow-lg scale-[1.02] z-20' 
                                        : hasSelection 
                                            ? 'opacity-40 hover:opacity-100' 
                                            : ''
                                }`}
                            >
                                <div className="flex items-center gap-1 w-full">
                                    <div className="p-1 rounded-md bg-black/5 cursor-grab">
                                        <i className="fas fa-grip-vertical text-slate-500 text-[10px]"></i>
                                    </div>
                                    <input
                                        value={s.name}
                                        onChange={(e) => handleStaffChange(rowIndex, columnId, i, 'name', e.target.value)}
                                        className="w-full text-xs font-bold p-1 bg-white/70 focus:bg-white rounded border border-transparent focus:border-blue-400 outline-none text-gray-900"
                                        placeholder="Name"
                                    />
                                    {/* Quick Check & Count Button */}
                                    {trimmed && trimmed !== 'New Staff' && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleStaffClick(trimmed);
                                            }}
                                            className={`px-1.5 py-0.5 rounded text-[10px] font-black border transition-all flex items-center gap-0.5 whitespace-nowrap ${
                                                isSelected 
                                                    ? 'bg-amber-500 text-white border-amber-600 shadow' 
                                                    : 'bg-white/80 text-slate-700 hover:bg-white border-slate-300'
                                            }`}
                                            title="فحص وتتبع عدد الجمعات لهذا الموظف"
                                        >
                                            <i className="fas fa-eye text-[9px]"></i>
                                            <span>{count}</span>
                                        </button>
                                    )}
                                    <button 
                                        onClick={() => removeStaffMember(rowIndex, columnId, i)}
                                        className="text-slate-400 hover:text-red-500 p-1 transition-all"
                                    >
                                        <i className="fas fa-times text-xs"></i>
                                    </button>
                                </div>
                                
                                {/* Extra Fields in Edit Mode */}
                                <div className="flex flex-col gap-1 pl-5">
                                    <div className="flex gap-1">
                                        <input
                                            value={s.time || ''}
                                            onChange={(e) => handleStaffChange(rowIndex, columnId, i, 'time', e.target.value)}
                                            className="w-1/2 text-[10px] p-1 bg-white/80 border border-slate-200 rounded outline-none focus:border-blue-300"
                                            placeholder="Time"
                                        />
                                        <select
                                            value={s.shiftType || 'morning'}
                                            onChange={(e) => handleStaffChange(rowIndex, columnId, i, 'shiftType', e.target.value)}
                                            className="w-1/2 text-[10px] p-1 bg-white/80 border border-slate-200 rounded outline-none focus:border-blue-300 font-bold"
                                        >
                                            <option value="morning">Morning</option>
                                            <option value="evening">Evening</option>
                                            <option value="night">Night</option>
                                            <option value="broken">Broken</option>
                                            <option value="high_broken">High Broken</option>
                                            <option value="long_duty">Long Duty</option>
                                        </select>
                                    </div>
                                    <input
                                        value={s.note || ''}
                                        onChange={(e) => handleStaffChange(rowIndex, columnId, i, 'note', e.target.value)}
                                        className="w-full text-[10px] p-1 bg-yellow-50 border border-yellow-200 rounded outline-none focus:border-yellow-400 text-yellow-800"
                                        placeholder="Note"
                                    />

                                    {/* Quick Reorder Buttons */}
                                    <div className="flex items-center justify-between gap-1 pt-1 mt-0.5 border-t border-slate-200/80 w-full" onMouseDown={(e) => e.stopPropagation()}>
                                        <span className="text-[9px] font-bold text-slate-400">#{i + 1}</span>
                                        <div className="flex items-center gap-0.5">
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); moveFridayStaff(rowIndex, columnId, i, 'top'); }}
                                                className="p-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[9px] font-bold cursor-pointer"
                                                title="Move to Top"
                                            >
                                                <i className="fas fa-angle-double-up"></i>
                                            </button>
                                            <button
                                                type="button"
                                                disabled={i === 0}
                                                onClick={(e) => { e.stopPropagation(); moveFridayStaff(rowIndex, columnId, i, 'up'); }}
                                                className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-30 text-[9px] cursor-pointer"
                                                title="Move Up"
                                            >
                                                <i className="fas fa-arrow-up"></i>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); moveFridayStaff(rowIndex, columnId, i, 'middle'); }}
                                                className="p-1 rounded bg-purple-50 hover:bg-purple-100 text-purple-700 text-[9px] font-bold cursor-pointer"
                                                title="Move to Middle"
                                            >
                                                <i className="fas fa-arrows-alt-v"></i>
                                            </button>
                                            <button
                                                type="button"
                                                disabled={i === list.length - 1}
                                                onClick={(e) => { e.stopPropagation(); moveFridayStaff(rowIndex, columnId, i, 'down'); }}
                                                className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-30 text-[9px] cursor-pointer"
                                                title="Move Down"
                                            >
                                                <i className="fas fa-arrow-down"></i>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); moveFridayStaff(rowIndex, columnId, i, 'bottom'); }}
                                                className="p-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[9px] font-bold cursor-pointer"
                                                title="Move to Bottom"
                                            >
                                                <i className="fas fa-angle-double-down"></i>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    <button
                        onClick={() => handleAddNewStaff(rowIndex, columnId)}
                        className="w-full mt-2 py-1.5 text-blue-700 bg-blue-50 hover:bg-blue-100 border border-dashed border-blue-300 rounded-md text-xs font-bold flex items-center justify-center gap-1 transition-colors"
                    >
                        <i className="fas fa-plus text-xs mr-1"></i> Add
                    </button>
                </div>
            );
        }
        
        // --- VIEW / PRINT MODE ---
        return (
            <div className="flex flex-col gap-1 w-full items-center">
                {list.map((s, idx) => {
                    const trimmed = (s.name || '').trim();
                    const normalized = trimmed.toLowerCase();
                    const colorInfo = getSoftStaffColor(trimmed, uniqueStaffNames);
                    const isSelected = selectedStaffName && normalized === selectedStaffName;
                    const hasSelection = Boolean(selectedStaffName);
                    const staffStats = staffFridayStats[normalized];
                    const count = staffStats ? staffStats.count : 1;

                    return (
                        <div 
                            key={idx} 
                            onClick={() => handleStaffClick(trimmed)}
                            style={{
                                backgroundColor: isSelected ? '#fde047' : colorInfo.bg,
                                color: isSelected ? '#713f12' : colorInfo.text,
                                borderColor: isSelected ? '#ca8a04' : colorInfo.border,
                                WebkitPrintColorAdjust: 'exact',
                                printColorAdjust: 'exact'
                            }}
                            className={`text-sm px-2 py-1.5 rounded-lg border-2 shadow-sm flex flex-col items-center justify-center text-center break-words w-full cursor-pointer select-none transition-all ${
                                isSelected 
                                    ? 'ring-4 ring-amber-400 ring-offset-2 !bg-yellow-300 !text-amber-950 font-black shadow-xl scale-[1.04] z-20 print:ring-0 print:scale-100' 
                                    : hasSelection 
                                        ? 'opacity-35 hover:opacity-100 print:opacity-100' 
                                        : 'hover:scale-[1.02] hover:shadow-md'
                            } print:shadow-none print:px-1 print:py-0.5 print:rounded-md print:border-solid print:text-[10px] print:break-inside-avoid`}
                            dir="ltr"
                        >
                            <div className="flex items-center gap-1 justify-center w-full relative">
                                {s.shiftType === 'morning' && <i className="fas fa-sun text-[10px] text-amber-500 print:hidden"></i>}
                                {s.shiftType === 'evening' && <i className="fas fa-moon text-[10px] text-indigo-500 print:hidden"></i>}
                                {s.shiftType === 'night' && <i className="fas fa-star text-[10px] text-purple-500 print:hidden"></i>}
                                {s.shiftType === 'broken' && <i className="fas fa-cut text-[10px] text-red-500 print:hidden"></i>}
                                {s.shiftType === 'high_broken' && <i className="fas fa-bolt text-[10px] text-red-700 print:hidden"></i>}
                                {s.shiftType === 'long_duty' && <i className="fas fa-arrow-right text-[10px] text-emerald-500 print:hidden"></i>}
                                
                                <span className="font-bold print:text-[10px] leading-tight">
                                    {highlightMatch(s.name)}
                                </span>
                            </div>

                            {/* Friday count indicator when selected or on hover */}
                            {isSelected && (
                                <div className="mt-0.5 px-2 py-0.2 bg-amber-900 text-yellow-100 text-[10px] font-black rounded-full shadow-sm flex items-center gap-1 print:hidden animate-bounce">
                                    <i className="fas fa-check-circle text-[9px]"></i>
                                    <span>مجموع الجمعات: {count}</span>
                                </div>
                            )}
                            
                            {s.time && (
                                <span className="text-[10px] font-mono bg-white/60 px-1 rounded mt-0.5 print:text-[9px] print:bg-transparent print:p-0 print:mt-0 leading-none">
                                    {s.time}
                                </span>
                            )}
                            
                            {s.note && (
                                <span className="text-[9px] text-slate-900 bg-yellow-200/60 border border-yellow-300 px-1.5 py-0.5 rounded-md mt-1 w-full font-semibold print:text-[8px] print:bg-yellow-100 print:border-none print:mt-0.5 print:leading-none whitespace-pre-wrap">
                                    {s.note}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    const selectedStaffDetails = selectedStaffName ? staffFridayStats[selectedStaffName] : null;

    return (
        <div className="space-y-6 animate-fade-in print:space-y-0 print:mt-[-30px] print:pt-0 print:w-full relative print:bg-white">
            {/* Modern Print Header */}
            <div className="print:mb-1">
                <PrintHeader 
                    month={customTitle || publishMonth} 
                    subtitle="FRIDAY DUTY" 
                    dateRange="24 HOUR COVERAGE" 
                    themeColor={headerColor} 
                />
            </div> 
            
            {/* Screen Header & Color Control */}
            <div className={`bg-slate-800 text-white p-4 rounded-xl shadow-md flex flex-col md:flex-row justify-between items-center gap-4 print:hidden transition-colors duration-300`}>
                <div className="flex-1">
                    <div className="flex items-center gap-3">
                        <h2 className="text-xl font-bold uppercase tracking-wide">Friday 24 Hour Coverage</h2>
                        <span className="bg-teal-500/20 text-teal-300 text-xs px-2.5 py-1 rounded-full font-bold border border-teal-400/30 flex items-center gap-1">
                            <i className="fas fa-mouse-pointer text-[10px]"></i> اضغط على أي اسم لتتبعه وإحصاء جمعاته
                        </span>
                    </div>
                    <p className="text-slate-300 text-sm font-medium opacity-90 mt-0.5">جدول نوباتجيات الجمع وتوزيع الأطباء والفنيين</p>
                </div>
                
                {isEditing && (
                    <div className="flex flex-col gap-2 items-center w-full md:w-auto">
                        <input 
                            className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-white placeholder-white/50 w-full font-bold focus:bg-white/20 outline-none transition-colors"
                            placeholder="Custom Title (Overrides Month)"
                            value={customTitle}
                            onChange={(e) => setCustomTitle(e.target.value)}
                        />
                        
                        <div className="flex gap-1 bg-white/10 p-1 rounded-full">
                            {['teal', 'blue', 'purple', 'rose', 'indigo', 'amber', 'cyan', 'emerald', 'slate', 'violet'].map(c => (
                                <button 
                                    key={c}
                                    onClick={() => setHeaderColor(c as HeaderColor)}
                                    className={`w-6 h-6 rounded-full border-2 border-white/50 hover:scale-110 transition-transform ${
                                        c === 'teal' ? 'bg-teal-600' :
                                        c === 'blue' ? 'bg-blue-600' :
                                        c === 'purple' ? 'bg-purple-600' :
                                        c === 'rose' ? 'bg-rose-600' :
                                        c === 'indigo' ? 'bg-indigo-600' :
                                        c === 'amber' ? 'bg-amber-600' :
                                        c === 'cyan' ? 'bg-cyan-600' :
                                        c === 'emerald' ? 'bg-emerald-600' :
                                        c === 'slate' ? 'bg-slate-600' :
                                        'bg-violet-600'
                                    } ${headerColor === c ? 'ring-2 ring-white scale-110' : ''}`}
                                    title={c}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Quick Friday Staff Counter Bar (شريط إحصاء جمعات الموظفين) */}
            {sortedStaffStats.length > 0 && (
                <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-sm print:hidden">
                    <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                            <i className="fas fa-calendar-check text-teal-600 text-sm"></i>
                            <span className="font-extrabold text-xs text-slate-800">إحصاء عدد الجمعات لكل موظف في هذا الجدول:</span>
                            <span className="text-[11px] text-slate-400 font-medium">({sortedStaffStats.length} موظف/طبيب)</span>
                        </div>
                        {selectedStaffName && (
                            <button
                                onClick={() => setSelectedStaffName(null)}
                                className="text-xs text-slate-500 hover:text-red-500 font-bold flex items-center gap-1 transition-colors"
                            >
                                <i className="fas fa-times text-[10px]"></i>
                                إلغاء التحديد
                            </button>
                        )}
                    </div>
                    
                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                        {sortedStaffStats.map((item, idx) => {
                            const normalized = item.originalName.toLowerCase();
                            const isSelected = selectedStaffName === normalized;
                            const colorInfo = getSoftStaffColor(item.originalName, uniqueStaffNames);

                            return (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => handleStaffClick(item.originalName)}
                                    style={{
                                        backgroundColor: isSelected ? '#fef08a' : colorInfo.bg,
                                        color: isSelected ? '#713f12' : colorInfo.text,
                                        borderColor: isSelected ? '#ca8a04' : colorInfo.border,
                                    }}
                                    className={`px-2.5 py-1 rounded-xl text-xs font-bold border-2 transition-all flex items-center gap-1.5 ${
                                        isSelected 
                                            ? 'ring-2 ring-amber-500 shadow-md scale-105 font-black z-10' 
                                            : 'hover:scale-105 shadow-sm opacity-95'
                                    }`}
                                >
                                    <span>{item.originalName}</span>
                                    <span 
                                        style={{ backgroundColor: colorInfo.badgeBg, color: colorInfo.badgeText }}
                                        className="px-1.5 py-0.2 rounded-full text-[10px] font-black shadow-sm"
                                    >
                                        {item.count} {item.count === 1 ? 'جمعة' : item.count === 2 ? 'جمعتين' : 'جمعات'}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Prominent Active Selection Banner (عند تحديد موظف يظهر شريط واضح بتفاصيل جمعاته) */}
            {selectedStaffDetails && (
                <div className="bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 text-slate-950 p-4 rounded-2xl shadow-xl border-2 border-amber-300 flex flex-wrap items-center justify-between gap-3 animate-fade-in print:hidden">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-amber-950 text-yellow-300 font-black flex flex-col items-center justify-center text-base shadow-md border border-yellow-400/40">
                            <span>{selectedStaffDetails.count}</span>
                            <span className="text-[9px] leading-none font-bold">جمعة</span>
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="font-black text-lg text-slate-950">{selectedStaffDetails.originalName}</h3>
                                <span className="bg-amber-950/20 text-slate-900 text-xs px-2.5 py-0.5 rounded-full font-bold border border-amber-950/20 flex items-center gap-1">
                                    <i className="fas fa-lightbulb text-amber-950"></i> تم تظهير كافة شفتات الجمعة في الجدول باللون الأصفر المضيء
                                </span>
                            </div>
                            <div className="text-xs text-slate-900 font-bold mt-1 flex flex-wrap items-center gap-2">
                                <span>📅 التواريخ والشفتات:</span>
                                {selectedStaffDetails.shifts.map((sh, sIdx) => (
                                    <span key={sIdx} className="bg-white/80 text-amber-950 px-2 py-0.5 rounded-lg border border-amber-600/30 text-[11px]">
                                        {sh.date} ({sh.colTitle} {sh.time ? `- ${sh.time}` : ''})
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setSelectedStaffName(null)}
                            className="bg-amber-950 text-yellow-200 hover:bg-black text-xs font-black px-4 py-2 rounded-xl shadow transition-all flex items-center gap-1.5"
                        >
                            <i className="fas fa-times"></i>
                            إغلاق التظليل
                        </button>
                    </div>
                </div>
            )}

            <div dir="ltr" className="overflow-x-auto rounded-xl border border-slate-200 shadow-lg bg-white print:block print:shadow-none print:overflow-visible print:border-none print:flex-grow relative z-10 print:bg-transparent">
                <table className="min-w-full divide-y divide-slate-200 print:divide-slate-900 print:border-2 print:border-slate-900 h-full print-color-adjust-exact print:table-fixed">
                <thead className={`bg-slate-50 ${activeHeaderBg} print:text-white print-color-adjust-exact`}>
                <tr className="print:h-fit">
                    <th scope="col" className="px-6 py-4 text-left text-xs font-extrabold text-slate-600 uppercase tracking-wider min-w-[160px] border-r border-slate-200 
                        print:px-1 
                        print:py-0 
                        print:h-5 
                        print:leading-none 
                        print:text-[9px] 
                        print:w-20 
                        print:border-r 
                        print:border-white/20 
                        print:text-white 
                        print:text-center">
                        Date
                    </th>
                    
                    {columns.map((col, idx) => renderHeader(col, idx))}
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200 print:divide-slate-300 print:bg-transparent">
                    {data.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors print:break-inside-avoid h-full print:bg-white">
                        {/* Date Column with Fix for Print Mode */}
                        <td className={`px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-900 border-r border-slate-200 align-middle print:px-1 print:py-2 print:text-xs print:border-r print:border-slate-300 ${activeDateColumnClasses} print-color-adjust-exact`}>
                            <div className="flex items-center justify-center">
                                {isEditing && (
                                    <input 
                                        value={row.date} 
                                        onChange={(e) => onUpdateRow(idx, {...data[idx], date: e.target.value})}
                                        className="w-full border border-slate-300 rounded-lg p-2 text-base font-bold text-center outline-none focus:ring-2 focus:ring-teal-200 shadow-sm bg-gray-100 text-gray-900 print:hidden"
                                        placeholder="DD-MM-YYYY"
                                    />
                                )}
                                <div className={`font-black text-center whitespace-normal print:w-full ${isEditing ? 'hidden print:block' : ''}`}>
                                    {row.date}
                                </div>
                            </div>
                        </td>
                        
                        {/* Dynamic Shift Columns */}
                        {columns.map((col) => (
                            <td 
                                key={col.id}
                                className={`px-6 py-4 text-sm text-slate-700 align-middle border-r border-slate-100 print:px-1 print:py-1 print:border-r print:border-slate-300 print:text-[10px] print:align-middle ${!isEditing && hasMatch(row[col.id] as VisualStaff[]) ? 'bg-yellow-50' : ''}`}
                            >
                                {renderStaffList(row[col.id] as VisualStaff[], idx, col.id)}
                            </td>
                        ))}

                        {/* Edit Controls */}
                        {isEditing && (
                            <td className="px-2 py-4 align-top print:hidden">
                                <button 
                                    onClick={() => {
                                        if(window.confirm('Delete this Friday row?')) {
                                            onRemoveRow(idx);
                                        }
                                    }} 
                                    className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-full transition-colors"
                                    title="Delete Row"
                                >
                                    <i className="fas fa-times"></i>
                                </button>
                            </td>
                        )}
                    </tr>
                    ))}
                </tbody>
                </table>
                
                {isEditing && (
                    <button 
                        onClick={onAddRow}
                        className="w-full py-4 bg-slate-50 border-t border-slate-200 text-slate-500 font-medium hover:bg-slate-100 flex items-center justify-center gap-2 transition-colors print:hidden"
                    >
                        <i className="fas fa-plus mr-2"></i> Add New Friday Row
                    </button>
                )}
            </div>
            
            <PrintFooter themeColor={headerColor} />
        </div>
    );
};

export default FridayScheduleView;

