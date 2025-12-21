
import React, { useState, useMemo, useCallback } from 'react';
import { FridayScheduleRow, VisualStaff, User, HeaderMap } from '../../types';
import { PrintHeader, PrintFooter } from '../PrintLayout';

// =================================================================
// 💡 Logic for Fixed Colors & Type Mapping
// =================================================================
interface StaffMember {
    name: string;
    color: string;
}

const staffColorMap = new Map<string, string>();
const colorClasses = [
    'bg-blue-100 text-blue-900 border-blue-200',
    'bg-green-100 text-green-900 border-green-200',
    'bg-rose-100 text-rose-900 border-rose-200',
    'bg-purple-100 text-purple-900 border-purple-200',
    'bg-amber-100 text-amber-900 border-amber-200',
    'bg-cyan-100 text-cyan-900 border-cyan-200',
    'bg-indigo-100 text-indigo-900 border-indigo-200',
    'bg-teal-100 text-teal-900 border-teal-200'
];

const getStaffColor = (name: string): string => {
    const trimmedName = name.trim();
    if (!trimmedName) return 'bg-slate-100 text-slate-700 border-slate-200';
    if (staffColorMap.has(trimmedName)) {
        return staffColorMap.get(trimmedName)!;
    }
    const newColor = colorClasses[staffColorMap.size % colorClasses.length];
    staffColorMap.set(trimmedName, newColor);
    return newColor;
};

// Convert VisualStaff object list to StaffMember objects (for display logic)
const mapVisualToStaff = (list: VisualStaff[]): StaffMember[] => {
    return list
        .filter(s => s.name && s.name.trim() !== '')
        .map(s => ({
            name: s.name.trim() + (s.time ? ` • ${s.time}` : ''),
            color: getStaffColor(s.name.trim()),
        }));
};

interface FridayScheduleViewProps {
  searchTerm: string;
  data: FridayScheduleRow[];
  isEditing: boolean;
  allUsers: User[];
  publishMonth: string;
  onUpdateRow: (index: number, newRow: FridayScheduleRow) => void;
  onAddRow: () => void;
  onRemoveRow: (index: number) => void;
  headers: HeaderMap;
  onHeaderChange: (newHeaders: HeaderMap) => void;
}

const FridayScheduleView: React.FC<FridayScheduleViewProps> = ({ 
    searchTerm, 
    data, 
    isEditing,
    allUsers,
    publishMonth,
    onUpdateRow,
    onAddRow,
    onRemoveRow,
    headers,
    onHeaderChange
}) => {
    const [editDragItem, setEditDragItem] = useState<{ rowIndex: number, column: keyof FridayScheduleRow, index: number } | null>(null);

    // 💡 Memoize Staff Data for Rendering (Visual only)
    const staffData = useMemo(() => {
        return data.map(row => ({
            ...row,
            morning: mapVisualToStaff(row.morning),
            evening: mapVisualToStaff(row.evening),
            broken: mapVisualToStaff(row.broken),
            cathLab: mapVisualToStaff(row.cathLab),
            mri: mapVisualToStaff(row.mri),
            night: mapVisualToStaff(row.night),
        }));
    }, [data]);

    // --- Edit Handlers ---
    const handleStaffNameChange = useCallback((rowIndex: number, column: keyof FridayScheduleRow, index: number, newName: string) => {
        const row = { ...data[rowIndex] };
        const currentList = [...(row[column] as VisualStaff[])];
        currentList[index] = { ...currentList[index], name: newName };
        onUpdateRow(rowIndex, { ...row, [column]: currentList });
    }, [data, onUpdateRow]);

    const handleAddNewStaff = useCallback((rowIndex: number, column: keyof FridayScheduleRow) => {
        const row = { ...data[rowIndex] };
        const currentList = [...(row[column] as VisualStaff[])];
        currentList.push({ name: 'New Staff' }); 
        onUpdateRow(rowIndex, { ...row, [column]: currentList });
    }, [data, onUpdateRow]);

    const removeStaffMember = useCallback((rowIndex: number, column: keyof FridayScheduleRow, index: number) => {
         const row = { ...data[rowIndex] };
         const currentList = [...(row[column] as VisualStaff[])];
         currentList.splice(index, 1);
         onUpdateRow(rowIndex, { ...row, [column]: currentList });
    }, [data, onUpdateRow]);

    const handleHeaderChange = (key: keyof HeaderMap, value: string) => {
        onHeaderChange({ ...headers, [key]: value });
    };

    // --- Drag & Drop ---
    const onEditDragStart = (e: React.DragEvent, rowIndex: number, column: keyof FridayScheduleRow, index: number) => {
        e.stopPropagation();
        setEditDragItem({ rowIndex, column, index });
        e.dataTransfer.effectAllowed = "move";
    };

    const onEditDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        // Allow copy for external (sidebar) drops, move for internal
        e.dataTransfer.dropEffect = editDragItem ? "move" : "copy";
    };

    const onEditDrop = (e: React.DragEvent, targetRowIndex: number, targetColumn: keyof FridayScheduleRow) => {
        e.preventDefault();
        e.stopPropagation();
        
        // 1. Internal Drag
        if (editDragItem) {
            const { rowIndex: srcRowIdx, column: srcCol, index: srcIndex } = editDragItem;
            if (srcRowIdx === targetRowIndex && srcCol === targetColumn) {
                 setEditDragItem(null);
                 return;
            }

            const sourceRow = { ...data[srcRowIdx] };
            const sourceList = [...(sourceRow[srcCol] as VisualStaff[])];
            const itemToMove = sourceList[srcIndex];

            sourceList.splice(srcIndex, 1);
            const updatedSourceRow = { ...sourceRow, [srcCol]: sourceList };

            const targetRow = (srcRowIdx === targetRowIndex) ? updatedSourceRow : { ...data[targetRowIndex] };
            const targetList = [...(targetRow[targetColumn] as VisualStaff[])];
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

        // 2. External Drop (Sidebar)
        try {
            const rawData = e.dataTransfer.getData('application/react-dnd-staff');
            if (rawData) {
                 const staffData = JSON.parse(rawData);
                 const row = { ...data[targetRowIndex] };
                 const currentList = [...(row[targetColumn] as VisualStaff[])];
                 
                 currentList.push({ 
                     name: staffData.name,
                     userId: staffData.id
                 });
                 
                 onUpdateRow(targetRowIndex, { ...row, [targetColumn]: currentList });
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

    const hasMatch = (list: StaffMember[]) => {
        if(!searchTerm) return false;
        return list.some(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }

    // Header Renderer
    const renderHeader = (key: keyof HeaderMap, bgColorClass: string, borderClass: string) => {
        return (
            <th scope="col" className={`px-6 py-4 text-center text-xs font-extrabold text-white uppercase tracking-wider border-r border-white/20 ${bgColorClass} ${borderClass}`}>
                {isEditing ? (
                    <input 
                        value={headers[key]}
                        onChange={(e) => handleHeaderChange(key, e.target.value)}
                        className="bg-white/20 text-white text-center w-full rounded px-1 py-0.5 outline-none placeholder-white/50"
                        placeholder="Header Name"
                    />
                ) : (
                    headers[key]
                )}
            </th>
        );
    };

    // Main Renderer for Staff Lists
    const renderStaffList = (staffList: StaffMember[], rowIndex: number, column: keyof FridayScheduleRow) => {
        // --- EDIT MODE ---
        if (isEditing) {
            const rawList = data[rowIndex][column] as VisualStaff[];
            return (
                <div 
                    className="space-y-2 p-1 min-w-[140px] min-h-[60px] transition-colors rounded"
                    onDragOver={onEditDragOver}
                    onDrop={(e) => onEditDrop(e, rowIndex, column)}
                >
                    {rawList.map((s, i) => (
                        <div 
                            key={i} 
                            draggable
                            onDragStart={(e) => onEditDragStart(e, rowIndex, column, i)}
                            className="flex items-start gap-1 group bg-white border border-slate-300 p-1 rounded-md shadow-sm cursor-grab active:cursor-grabbing hover:border-blue-400 hover:shadow-md transition-all"
                        >
                            <div className={`p-1 rounded-full bg-slate-100 cursor-grab mt-1`}>
                                <i className="fas fa-grip-vertical text-slate-500 text-xs"></i>
                            </div>
                            <textarea
                                value={s.name}
                                onChange={(e) => handleStaffNameChange(rowIndex, column, i, e.target.value)}
                                className="w-full text-xs font-bold p-1 bg-gray-100 focus:bg-white border border-transparent focus:border-blue-300 rounded resize-y min-h-[40px] overflow-hidden text-gray-900"
                                placeholder="Name"
                                rows={2}
                            />
                            <button 
                                onClick={() => removeStaffMember(rowIndex, column, i)}
                                className="text-slate-400 hover:text-red-500 p-1 transition-all"
                            >
                                <i className="fas fa-times text-xs"></i>
                            </button>
                        </div>
                    ))}
                    <button
                        onClick={() => handleAddNewStaff(rowIndex, column)}
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
                {staffList.map((s, idx) => (
                    <div 
                        key={idx} 
                        className={`text-sm px-2 py-1.5 rounded-lg border shadow-sm flex items-center justify-center text-center break-words w-full print-color-adjust-exact ${s.color} 
                        print:shadow-none print:px-2 print:py-1 print:rounded-md print:text-[9px] print:font-bold print:leading-tight print:border-transparent`}
                        dir="ltr"
                    >
                        {highlightMatch(s.name)}
                    </div>
                ))}
            </div>
        );
    };

  return (
    <div className="space-y-6 animate-fade-in print:space-y-2 print:w-full print:bg-white relative">
        
        {/* Modern Print Header */}
        <PrintHeader 
            month={publishMonth} 
            subtitle="FRIDAY DUTY" 
            dateRange="24 HOUR COVERAGE" 
            themeColor="teal" 
        />

        {/* Screen Header */}
        <div className="bg-teal-700 text-white p-4 rounded-xl shadow-md flex justify-between items-center print:hidden">
            <div>
                <h2 className="text-xl font-bold uppercase tracking-wide">Friday 24 Hour Coverage</h2>
                <p className="text-teal-100 text-sm font-medium opacity-90">Specific Duty Assignments</p>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-xs bg-teal-800 px-3 py-1.5 rounded-lg border border-teal-600 shadow-sm">
                <span>Note: Late/Early hours deducted from Friday duties only</span>
            </div>
        </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-lg bg-white print:block print:shadow-none print:overflow-visible print:border-none print:flex-grow relative z-10 print:bg-transparent">
        <table className="min-w-full divide-y divide-slate-200 print:divide-slate-900 print:border-2 print:border-slate-900 h-full print-color-adjust-exact print:table-fixed">
          <thead className="bg-slate-50 print:bg-teal-900 print:text-white print-color-adjust-exact">
            <tr>
              <th scope="col" className="px-6 py-4 text-left text-xs font-extrabold text-slate-600 uppercase tracking-wider min-w-[160px] border-r border-slate-200 print:px-2 print:py-2 print:text-[10px] print:w-24 print:border-r print:border-white/20 print:text-white print:text-center">Date</th>
              {renderHeader('morning', 'bg-indigo-50 text-indigo-700 print:bg-teal-900 print:text-white', 'border-indigo-100')}
              {renderHeader('evening', 'bg-violet-50 text-violet-700 print:bg-teal-900 print:text-white', 'border-violet-100')}
              {renderHeader('broken', 'bg-amber-50 text-amber-700 print:bg-teal-900 print:text-white', 'border-amber-100')}
              {renderHeader('cathLab', 'bg-rose-50 text-rose-700 print:bg-teal-900 print:text-white', 'border-rose-100')}
              {renderHeader('mri', 'bg-teal-50 text-teal-700 print:bg-teal-900 print:text-white', 'border-teal-100')}
              {renderHeader('night', 'bg-slate-100 text-slate-800 print:bg-teal-900 print:text-white', 'border-slate-200')}
              {isEditing && <th className="px-2 py-3 w-10 print:hidden"></th>}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200 print:divide-slate-300 print:bg-transparent">
            {staffData.map((row, idx) => (
              <tr key={idx} className="hover:bg-slate-50 transition-colors print:break-inside-avoid h-full print:bg-white">
                {/* Date Column with Fix for Print Mode */}
                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-900 border-r border-slate-200 align-middle print:px-1 print:py-2 print:text-xs print:border-r print:border-slate-300 print:bg-teal-50/50 print-color-adjust-exact">
                    <div className="flex items-center justify-center">
                        {isEditing && (
                             <input 
                                value={row.date} 
                                onChange={(e) => onUpdateRow(idx, {...data[idx], date: e.target.value})}
                                className="w-full border border-slate-300 rounded-lg p-2 text-base font-bold text-center outline-none focus:ring-2 focus:ring-teal-200 shadow-sm bg-gray-100 text-gray-900 print:hidden"
                                placeholder="DD-MM-YYYY"
                            />
                        )}
                        <div className={`font-black text-center whitespace-normal print:w-full print:text-teal-900 ${isEditing ? 'hidden print:block' : ''}`}>
                            {row.date}
                        </div>
                    </div>
                </td>
                
                {/* Shift Columns */}
                {['morning', 'evening', 'broken', 'cathLab', 'mri', 'night'].map((colKey) => (
                    <td 
                        key={colKey}
                        className={`px-6 py-4 text-sm text-slate-700 align-middle border-r border-slate-100 print:px-1 print:py-1 print:border-r print:border-slate-300 print:text-[10px] print:align-middle ${!isEditing && hasMatch(row[colKey as keyof typeof row] as StaffMember[]) ? 'bg-yellow-50' : ''}`}
                    >
                        {renderStaffList(row[colKey as keyof typeof row] as StaffMember[], idx, colKey as keyof FridayScheduleRow)}
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
      
      <PrintFooter themeColor="teal" />
    </div>
  );
};

export default FridayScheduleView;
