
import React, { useState, useCallback, useEffect } from 'react';
import { FridayScheduleRow, VisualStaff, User, ScheduleColumn } from '../../types';
import { PrintHeader, PrintFooter } from '../PrintLayout';

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

const getStaffColor = (name: string): string => {
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName === 'New Staff') return 'bg-slate-100 text-slate-700 border-slate-200';
    if (staffColorMap.has(trimmedName)) {
        return staffColorMap.get(trimmedName)!;
    }
    const newColor = colorClasses[staffColorMap.size % colorClasses.length];
    staffColorMap.set(trimmedName, newColor);
    return newColor;
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
  
  // Dynamic Columns
  columns: ScheduleColumn[];
  onUpdateColumn: (index: number, newCol: ScheduleColumn) => void;
  onRemoveColumn: (colId: string) => void;
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
    columns,
    onUpdateColumn,
    onRemoveColumn
}) => {
    const [editDragItem, setEditDragItem] = useState<{ rowIndex: number, column: string, index: number } | null>(null);
    const [headerColor, setHeaderColor] = useState<any>('teal');
    const [customTitle, setCustomTitle] = useState('');

    useEffect(() => {
        // Reset custom title when month changes (optional, keeps UI clean)
        // setCustomTitle('');
    }, [publishMonth]);

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
    }

    // Dynamic Header Renderer
    const renderHeader = (col: ScheduleColumn, index: number) => {
        return (
            <th key={col.id} scope="col" className={`group relative px-2 py-4 text-center text-xs font-extrabold text-white uppercase tracking-wider border-r border-white/20 bg-slate-700 ${activeHeaderBg} print:text-white`}>
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
                    <div className="whitespace-pre-wrap">{col.title}</div>
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
                    {list.map((s, i) => (
                        <div 
                            key={i} 
                            draggable
                            onDragStart={(e) => onEditDragStart(e, rowIndex, columnId, i)}
                            className="flex flex-col gap-1 group bg-white border border-slate-300 p-1.5 rounded-md shadow-sm cursor-grab active:cursor-grabbing hover:border-blue-400 hover:shadow-md transition-all relative"
                        >
                            <div className="flex items-center gap-1 w-full">
                                <div className={`p-1 rounded-full bg-slate-100 cursor-grab`}>
                                    <i className="fas fa-grip-vertical text-slate-500 text-[10px]"></i>
                                </div>
                                <input
                                    value={s.name}
                                    onChange={(e) => handleStaffChange(rowIndex, columnId, i, 'name', e.target.value)}
                                    className="w-full text-xs font-bold p-1 bg-gray-50 focus:bg-white border-b border-transparent focus:border-blue-300 outline-none text-gray-900"
                                    placeholder="Name"
                                />
                                <button 
                                    onClick={() => removeStaffMember(rowIndex, columnId, i)}
                                    className="text-slate-400 hover:text-red-500 p-1 transition-all"
                                >
                                    <i className="fas fa-times text-xs"></i>
                                </button>
                            </div>
                            
                            {/* Extra Fields in Edit Mode */}
                            <div className="flex gap-1 pl-5">
                                <input
                                    value={s.time || ''}
                                    onChange={(e) => handleStaffChange(rowIndex, columnId, i, 'time', e.target.value)}
                                    className="w-1/2 text-[10px] p-1 bg-slate-50 border border-slate-200 rounded outline-none focus:border-blue-300"
                                    placeholder="Time"
                                />
                                <input
                                    value={s.note || ''}
                                    onChange={(e) => handleStaffChange(rowIndex, columnId, i, 'note', e.target.value)}
                                    className="w-1/2 text-[10px] p-1 bg-yellow-50 border border-yellow-200 rounded outline-none focus:border-yellow-400 text-yellow-800"
                                    placeholder="Note"
                                />
                            </div>
                        </div>
                    ))}
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
                    const colorClass = getStaffColor(s.name);
                    return (
                        <div 
                            key={idx} 
                            className={`text-sm px-2 py-1.5 rounded-lg border shadow-sm flex flex-col items-center justify-center text-center break-words w-full print-color-adjust-exact ${colorClass} 
                            print:shadow-none print:px-1 print:py-0.5 print:rounded-md print:border-transparent`}
                            dir="ltr"
                        >
                            <span className="font-bold print:text-[10px] leading-tight">
                                {highlightMatch(s.name)}
                            </span>
                            
                            {s.time && (
                                <span className="text-[10px] font-mono bg-white/50 px-1 rounded mt-0.5 print:text-[9px] print:bg-transparent print:p-0 print:mt-0 leading-none">
                                    {s.time}
                                </span>
                            )}
                            
                            {s.note && (
                                <span className="text-[9px] text-slate-900 bg-yellow-200/50 border border-yellow-200 px-1.5 py-0.5 rounded-md mt-1 w-full font-semibold print:text-[8px] print:bg-yellow-100 print:border-none print:mt-0.5 print:leading-none whitespace-pre-wrap">
                                    {s.note}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

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
                <h2 className="text-xl font-bold uppercase tracking-wide">Friday 24 Hour Coverage</h2>
                <p className="text-slate-300 text-sm font-medium opacity-90">Specific Duty Assignments</p>
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
                        {['teal', 'blue', 'purple', 'rose', 'indigo', 'amber', 'cyan', 'emerald'].map(c => (
                            <button 
                                key={c}
                                onClick={() => setHeaderColor(c)}
                                className={`w-6 h-6 rounded-full border-2 border-white/50 hover:scale-110 transition-transform ${
                                    c === 'teal' ? 'bg-teal-600' :
                                    c === 'blue' ? 'bg-blue-600' :
                                    c === 'purple' ? 'bg-purple-600' :
                                    c === 'rose' ? 'bg-rose-600' :
                                    c === 'indigo' ? 'bg-indigo-600' :
                                    c === 'amber' ? 'bg-amber-600' :
                                    c === 'cyan' ? 'bg-cyan-600' :
                                    'bg-emerald-600'
                                } ${headerColor === c ? 'ring-2 ring-white scale-110' : ''}`}
                                title={c}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-lg bg-white print:block print:shadow-none print:overflow-visible print:border-none print:flex-grow relative z-10 print:bg-transparent">
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
