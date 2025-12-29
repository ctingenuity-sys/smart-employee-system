
import React, { useState, useMemo, useCallback } from 'react';
import { DoctorFridayRow, VisualStaff, User, DoctorFridayHeaderMap } from '../../types';
import { PrintHeader, PrintFooter } from '../PrintLayout';

interface StaffMember {
    name: string;
    time?: string;
    color: string;
    isPP?: boolean;
}

const staffColorMap = new Map<string, string>();
const colorClasses = [
    'bg-blue-50 text-blue-900 border-blue-200',
  'bg-emerald-50 text-emerald-900 border-emerald-200',
  'bg-rose-50 text-rose-900 border-rose-200',
  'bg-amber-50 text-amber-900 border-amber-200',
  'bg-purple-50 text-purple-900 border-purple-200',

  'bg-cyan-50 text-cyan-900 border-cyan-200',
  'bg-lime-50 text-lime-900 border-lime-200',
  'bg-fuchsia-50 text-fuchsia-900 border-fuchsia-200',
  'bg-orange-50 text-orange-900 border-orange-200',
  'bg-teal-50 text-teal-900 border-teal-200',

  'bg-indigo-50 text-indigo-900 border-indigo-200',
  'bg-pink-50 text-pink-900 border-pink-200',
  'bg-sky-50 text-sky-900 border-sky-200',
  'bg-yellow-50 text-yellow-900 border-yellow-200',
  'bg-violet-50 text-violet-900 border-violet-200',

  'bg-green-100 text-green-900 border-green-200',
  'bg-blue-100 text-blue-900 border-blue-200',
  'bg-red-100 text-red-900 border-red-200',
  'bg-amber-100 text-amber-900 border-amber-200',
  'bg-purple-100 text-purple-900 border-purple-200',

  'bg-slate-50 text-slate-900 border-slate-200',
  'bg-gray-50 text-gray-900 border-gray-200',
  'bg-zinc-50 text-zinc-900 border-zinc-200',
  'bg-neutral-50 text-neutral-900 border-neutral-200',
  'bg-stone-50 text-stone-900 border-stone-200',
];

// Enhanced Regex: Matches (PP), [PP], {PP} case-insensitive, anywhere in string
const ppRegex = /(?:\(|\[|\{)\s*pp\s*(?:\)|\]|\})/i;

const getStaffColor = (name: string): string => {
    const trimmedName = (name || '').replace(ppRegex, '').trim();
    if (!trimmedName || trimmedName === 'New Dr') return 'bg-white text-slate-700 border-dashed border-slate-300';
    if (staffColorMap.has(trimmedName)) {
        return staffColorMap.get(trimmedName)!;
    }
    const newColor = colorClasses[staffColorMap.size % colorClasses.length];
    staffColorMap.set(trimmedName, newColor);
    return newColor;
};

const mapVisualToStaff = (list: VisualStaff[] | undefined): StaffMember[] => {
    if (!list || !Array.isArray(list)) return [];
    return list.map(s => ({
        name: s.name,
        time: s.time,
        color: getStaffColor(s.name),
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
  headers: DoctorFridayHeaderMap;
  onHeaderChange: (newHeaders: DoctorFridayHeaderMap) => void;
}

const defaultHeaders: DoctorFridayHeaderMap = {
    col1Time: '9am-1pm & 5pm-9pm',
    col1Title: 'CT & MRI',
    col2Time: '9am-1pm & 5pm-9pm',
    col2Title: 'ROUTINE + USG',
    col3Time: '1pm-9pm',
    col3Title: 'ROUTINE + USG',
    col4Time: '9pm-9am',
    col4Title: 'NIGHT SHIFT'
};

const DoctorFridayScheduleView: React.FC<DoctorFridayScheduleViewProps> = ({ 
    searchTerm, 
    data = [],
    isEditing,
    onUpdateRow,
    onAddRow,
    onRemoveRow,
    publishMonth,
    headers = defaultHeaders,
    onHeaderChange
}) => {
    const [editDragItem, setEditDragItem] = useState<{ rowIndex: number, column: keyof DoctorFridayRow, index: number } | null>(null);

    const staffData = useMemo(() => {
        if (!data || !Array.isArray(data)) return [];
        return data.map(row => ({
            ...row,
            col1: mapVisualToStaff(row.col1),
            col2: mapVisualToStaff(row.col2),
            col3: mapVisualToStaff(row.col3),
            col4: mapVisualToStaff(row.col4),
        }));
    }, [data]);

    const handleStaffChange = useCallback((rowIndex: number, column: keyof DoctorFridayRow, index: number, field: 'name' | 'time', value: string) => {
        if (!data[rowIndex]) return;
        const row = { ...data[rowIndex] };
        const currentList = [...(row[column] as VisualStaff[] || [])];
        if (currentList[index]) {
            currentList[index] = { ...currentList[index], [field]: value };
            onUpdateRow(rowIndex, { ...row, [column]: currentList });
        }
    }, [data, onUpdateRow]);

    const togglePP = useCallback((rowIndex: number, column: keyof DoctorFridayRow, index: number) => {
        const row = { ...data[rowIndex] };
        const currentList = [...(row[column] as VisualStaff[] || [])];
        if (currentList[index]) {
            let name = currentList[index].name;
            if (ppRegex.test(name)) {
                name = name.replace(ppRegex, '').trim();
            } else {
                name = `${name} (PP)`;
            }
            currentList[index] = { ...currentList[index], name: name };
            onUpdateRow(rowIndex, { ...row, [column]: currentList });
        }
    }, [data, onUpdateRow]);

    const handleAddNewStaff = useCallback((rowIndex: number, column: keyof DoctorFridayRow) => {
        if (!data[rowIndex]) return;
        const row = { ...data[rowIndex] };
        const currentList = [...(row[column] as VisualStaff[] || [])];
        currentList.push({ name: 'New Dr', time: '' });
        onUpdateRow(rowIndex, { ...row, [column]: currentList });
    }, [data, onUpdateRow]);

    const removeStaffMember = useCallback((rowIndex: number, column: keyof DoctorFridayRow, index: number) => {
         if (!data[rowIndex]) return;
         const row = { ...data[rowIndex] };
         const currentList = [...(row[column] as VisualStaff[] || [])];
         currentList.splice(index, 1);
         onUpdateRow(rowIndex, { ...row, [column]: currentList });
    }, [data, onUpdateRow]);

    const handleHeaderUpdate = (key: keyof DoctorFridayHeaderMap, value: string) => {
        if (onHeaderChange) {
            onHeaderChange({ ...headers, [key]: value });
        }
    };

    const formatDateDisplay = (dateStr: string) => {
        if(!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        if(isNaN(d.getTime())) return dateStr;
        const day = d.getDate();
        const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
        return `${day} ${month}`;
    };

    const onEditDragStart = (e: React.DragEvent, rowIndex: number, column: keyof DoctorFridayRow, index: number) => {
        e.stopPropagation();
        setEditDragItem({ rowIndex, column, index });
        e.dataTransfer.effectAllowed = "move";
    };

    const onEditDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = editDragItem ? "move" : "copy";
    };

    const onEditDrop = (e: React.DragEvent, targetRowIndex: number, targetColumn: keyof DoctorFridayRow) => {
        e.preventDefault();
        e.stopPropagation();

        if (editDragItem) {
            const { rowIndex: srcRowIdx, column: srcCol, index: srcIndex } = editDragItem;
            if (!data[srcRowIdx] || !data[targetRowIndex]) return;

            const sourceRow = { ...data[srcRowIdx] };
            const sourceList = [...(sourceRow[srcCol] as VisualStaff[] || [])];
            const itemToMove = sourceList[srcIndex];
            
            if(!itemToMove) return;

            sourceList.splice(srcIndex, 1);
            const updatedSourceRow = { ...sourceRow, [srcCol]: sourceList };

            const targetRow = (srcRowIdx === targetRowIndex) ? updatedSourceRow : { ...data[targetRowIndex] };
            const targetList = [...(targetRow[targetColumn] as VisualStaff[] || [])];
            targetList.push(itemToMove);
            const updatedTargetRow = { ...targetRow, [targetColumn]: targetList };

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
                 const currentList = [...(row[targetColumn] as VisualStaff[])];
                 currentList.push({ name: staffData.name, userId: staffData.id });
                 onUpdateRow(targetRowIndex, { ...row, [targetColumn]: currentList });
            }
        } catch(err) { console.error(err); }
    };

    const renderStaffList = (staffList: StaffMember[], rowIndex: number, column: keyof DoctorFridayRow) => {
        const safeStaffList = staffList || [];
        
        if (isEditing) {
            const rawList = (data[rowIndex] && data[rowIndex][column]) ? (data[rowIndex][column] as VisualStaff[]) : [];
            return (
                <div 
                    className="space-y-1 min-h-[50px] p-1 h-full"
                    onDragOver={onEditDragOver}
                    onDrop={(e) => onEditDrop(e, rowIndex, column)}
                >
                    {rawList.map((s, i) => {
                        const hasPP = ppRegex.test(s.name);
                        return (
                        <div key={i} draggable onDragStart={(e) => onEditDragStart(e, rowIndex, column, i)} className="flex items-center gap-1 group cursor-grab active:cursor-grabbing bg-white p-1 rounded border border-slate-200">
                            <div className="flex flex-col flex-1 gap-1">
                                <input
                                    value={s.name}
                                    onChange={(e) => handleStaffChange(rowIndex, column, i, 'name', e.target.value)}
                                    className={`w-full text-[11px] font-bold p-0.5 bg-transparent border-b border-transparent focus:border-blue-500 outline-none ${hasPP ? 'text-amber-800' : 'text-slate-800'}`}
                                    placeholder="Dr. Name"
                                />
                                <input
                                    value={s.time || ''}
                                    onChange={(e) => handleStaffChange(rowIndex, column, i, 'time', e.target.value)}
                                    className="w-full text-[9px] text-slate-500 p-0.5 bg-slate-50 border-b border-transparent focus:border-blue-300 outline-none"
                                    placeholder="Specific Time"
                                />
                            </div>
                            <button 
                                onClick={() => togglePP(rowIndex, column, i)} 
                                className={`px-1 rounded text-[9px] font-bold border transition-colors h-6 ${hasPP ? 'bg-yellow-400 text-black border-yellow-600 ring-2 ring-yellow-200 shadow-sm' : 'bg-slate-100 text-slate-400 border-slate-200'}`}
                                title={hasPP ? "Remove PP" : "Add PP Badge"}
                            >
                                PP
                            </button>
                            <button onClick={() => removeStaffMember(rowIndex, column, i)} className="text-red-400 hover:text-red-600">
                                <i className="fas fa-times text-xs"></i>
                            </button>
                        </div>
                    )})}
                    <button onClick={() => handleAddNewStaff(rowIndex, column)} className="w-full text-[10px] text-blue-600 bg-blue-50 py-1 rounded hover:bg-blue-100 mt-1">
                        + Add
                    </button>
                </div>
            );
        }
        return (
            <div className="flex flex-col gap-2 w-full h-full justify-center">
                {safeStaffList.map((s, idx) => {
                    const displayName = s.name.replace(ppRegex, '').trim();
                    return (
                        <div key={idx} className="flex flex-col items-center justify-center text-center leading-tight w-full">
                            <div className="text-sm font-bold text-slate-900 print:text-[11px] print:text-black uppercase text-center print:leading-tight flex flex-wrap justify-center gap-1 w-full">
                                <span>{displayName}</span>
                                {s.time && <span className="text-[10px] font-medium text-slate-600 print:text-black whitespace-nowrap">({s.time})</span>}
                            </div>
                            {s.isPP && (
                                <div className="w-full text-[10px] font-black bg-yellow-400 text-black border-2 border-yellow-600 rounded px-1 py-0.5 mt-1 shadow-md uppercase tracking-wider text-center block print:bg-yellow-400 print:text-black print:border-black print-color-adjust-exact z-10 relative">
                                    PORTABLE & PROCEDURE
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderHeaderCell = (timeKey: keyof DoctorFridayHeaderMap, titleKey: keyof DoctorFridayHeaderMap) => {
        const safeHeaders = headers || defaultHeaders;
        const timeVal = safeHeaders[timeKey] || "";
        const titleVal = safeHeaders[titleKey] || "";

        return (
            <th className="px-2 py-2 text-left align-top border-r-2 border-slate-800 bg-slate-200 print:bg-[#e6e7e8] print:text-black print:px-1 print:py-1 print:border-r print:border-slate-800">
                <div className="flex flex-col h-full">
                    <div className="border-b border-slate-400 pb-1 mb-1 font-black text-xs print:text-[9px] print:border-slate-600 print:pb-0.5 print:mb-0.5">
                        {isEditing ? (
                            <input 
                                value={timeVal} 
                                onChange={(e) => handleHeaderUpdate(timeKey, e.target.value)}
                                className="w-full bg-white border border-slate-300 px-1"
                            />
                        ) : timeVal}
                    </div>
                    <div className="text-[10px] font-bold uppercase leading-tight print:text-[9px]">
                        {isEditing ? (
                            <textarea 
                                value={titleVal} 
                                onChange={(e) => handleHeaderUpdate(titleKey, e.target.value)}
                                className="w-full bg-white border border-slate-300 px-1 h-12 resize-none"
                            />
                        ) : titleVal}
                    </div>
                </div>
            </th>
        );
    };

  return (
    <div className="space-y-6 animate-fade-in print:space-y-1 print:w-full relative print:bg-white print:text-left">
        <PrintHeader month={publishMonth} subtitle="RADIOLOGISTS FRIDAY DUTY SCHEDULE" themeColor="slate" />

        <div className="bg-slate-700 text-white p-4 rounded-xl shadow-md flex justify-between items-center print:hidden">
            <div>
                <h2 className="text-xl font-bold uppercase tracking-wide">Doctors Friday Duty Schedule</h2>
                <p className="text-slate-200 text-sm font-medium opacity-90">Customizable Friday Shifts</p>
                <p className="text-[10px] text-slate-400 mt-1">Sorting is automatic when entering Preview Mode</p>
            </div>
        </div>

      <div className="overflow-x-auto rounded-none border-2 border-slate-800 shadow-none bg-white print:block print:overflow-visible print:border-2 print:border-slate-900 print:w-full">
        <table className="min-w-full divide-y divide-slate-800 border-collapse table-fixed">
          <thead className="bg-slate-200 print:bg-[#e6e7e8] print-color-adjust-exact">
            <tr className="divide-x divide-slate-800 border-b-2 border-slate-800">
              <th className="px-2 py-3 text-left text-xs font-black text-slate-900 uppercase border-r-2 border-slate-800 w-32 bg-slate-200 print:bg-[#e6e7e8] print:w-20 print:px-1 print:py-2 print:text-[10px] print:leading-tight">
                  FRIDAY<br/>DUTY<br/>SCHEDULE
              </th>
              {renderHeaderCell('col1Time', 'col1Title')}
              {renderHeaderCell('col2Time', 'col2Title')}
              {renderHeaderCell('col3Time', 'col3Title')}
              {renderHeaderCell('col4Time', 'col4Title')}
              {isEditing && <th className="w-8 bg-white print:hidden"></th>}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-800 print:divide-slate-800">
            {staffData.map((row, idx) => (
              <tr key={idx} className="divide-x divide-slate-800 border-b border-slate-800 min-h-[5rem] print:h-auto print:border-b">
                <td className="px-2 py-2 text-sm font-bold text-slate-900 align-middle bg-slate-50 print:bg-transparent border-r-2 border-slate-800 print:p-1 print:text-[11px]">
                    {isEditing ? (
                        <input
                            type="date"
                            value={row.date} 
                            onChange={(e) => onUpdateRow(idx, {...data[idx], date: e.target.value})}
                            className="w-full bg-white border border-slate-300 p-1 text-xs font-bold rounded"
                        />
                    ) : (
                        <div className="font-black text-xs print:text-[11px]">{formatDateDisplay(row.date)}</div>
                    )}
                </td>
                
                <td className="px-2 py-1 align-middle bg-white border-r-2 border-slate-800 print:p-0.5">{renderStaffList(row.col1, idx, 'col1')}</td>
                <td className="px-2 py-1 align-middle bg-white border-r-2 border-slate-800 print:p-0.5">{renderStaffList(row.col2, idx, 'col2')}</td>
                <td className="px-2 py-1 align-middle bg-white border-r-2 border-slate-800 print:p-0.5">{renderStaffList(row.col3, idx, 'col3')}</td>
                <td className="px-2 py-1 align-middle bg-white border-r-2 border-slate-800 print:p-0.5">{renderStaffList(row.col4, idx, 'col4')}</td>

                {isEditing && (
                    <td className="px-1 py-1 align-middle print:hidden bg-white text-center">
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
