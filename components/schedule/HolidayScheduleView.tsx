
import React, { useState, useMemo, useCallback } from 'react';
import { HolidayScheduleRow, VisualStaff, User, ScheduleColumn } from '../../types';
import { PrintHeader, PrintFooter } from '../PrintLayout';

interface StaffMember {
    name: string;
    color: string;
    time?: string;
    note?: string;
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

const mapVisualToStaff = (list: VisualStaff[]): StaffMember[] => {
    if (!list || !Array.isArray(list)) return [];
    return list
        .filter(s => s.name && s.name.trim() !== '')
        .map(s => ({
            name: s.name.trim(),
            color: getStaffColor(s.name.trim()),
            time: s.time,
            note: s.note
        }));
};

interface HolidayScheduleViewProps {
  searchTerm: string;
  data: HolidayScheduleRow[];
  isEditing: boolean;
  allUsers: User[];
  publishMonth: string;
  onUpdateRow: (index: number, newRow: HolidayScheduleRow) => void;
  onAddRow: () => void;
  onRemoveRow: (index: number) => void;
  
  columns: ScheduleColumn[];
  onUpdateColumn: (index: number, newCol: ScheduleColumn) => void;
  onRemoveColumn: (colId: string) => void;
}

const HolidayScheduleView: React.FC<HolidayScheduleViewProps> = ({ 
    searchTerm, 
    data, 
    isEditing,
    onUpdateRow,
    onAddRow,
    onRemoveRow,
    publishMonth,
    columns,
    onUpdateColumn,
    onRemoveColumn
}) => {
    const [editDragItem, setEditDragItem] = useState<{ rowIndex: number, column: string, index: number } | null>(null);
    const [printTitle, setPrintTitle] = useState("HOLIDAY SCHEDULE");
    const [printSubtitle, setPrintSubtitle] = useState("HOLIDAY COVERAGE");
    const [headerColor, setHeaderColor] = useState<any>("purple");

    // Dynamic styles
    const activeColorClasses = {
        purple: 'bg-purple-700 print:bg-purple-800 text-white border-purple-900',
        indigo: 'bg-indigo-700 print:bg-indigo-800 text-white border-indigo-900',
        rose: 'bg-rose-700 print:bg-rose-800 text-white border-rose-900',
        teal: 'bg-teal-700 print:bg-teal-800 text-white border-teal-900',
        slate: 'bg-slate-700 print:bg-slate-800 text-white border-slate-900',
        violet: 'bg-violet-700 print:bg-violet-800 text-white border-violet-900'
    }[headerColor] || 'bg-purple-700 print:bg-purple-800 text-white';

    const printHeaderBg = {
        purple: 'print:bg-purple-800 print:text-white print:border-purple-900',
        indigo: 'print:bg-indigo-800 print:text-white print:border-indigo-900',
        rose: 'print:bg-rose-800 print:text-white print:border-rose-900',
        teal: 'print:bg-teal-800 print:text-white print:border-teal-900',
        slate: 'print:bg-slate-800 print:text-white print:border-slate-900',
        violet: 'print:bg-violet-800 print:text-white print:border-violet-900'
    }[headerColor] || 'print:bg-slate-900 print:text-white';

    const staffData = useMemo(() => {
        return data.map(row => {
            const mappedRow: any = { ...row };
            columns.forEach(col => {
                mappedRow[col.id] = mapVisualToStaff(row[col.id] as VisualStaff[]);
            });
            return mappedRow;
        });
    }, [data, columns]);

    const handleStaffFieldChange = useCallback((rowIndex: number, columnId: string, index: number, field: keyof VisualStaff, value: string) => {
        const row = { ...data[rowIndex] };
        const currentList = [...(row[columnId] as VisualStaff[] || [])];
        if (currentList[index]) {
            currentList[index] = { ...currentList[index], [field]: value };
            onUpdateRow(rowIndex, { ...row, [columnId]: currentList });
        }
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

    // Drag & Drop (Edit Mode)
    const onEditDragStart = (e: React.DragEvent, rowIndex: number, columnId: string, index: number) => {
        setEditDragItem({ rowIndex, column: columnId, index });
        e.dataTransfer.effectAllowed = "move";
    };

    const onEditDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = editDragItem ? "move" : "copy";
    };

    const onEditDrop = (e: React.DragEvent, targetRowIndex: number, targetColumnId: string) => {
        e.preventDefault();

        // 1. Internal Drag
        if (editDragItem) {
            const { rowIndex: srcRowIdx, column: srcCol, index: srcIndex } = editDragItem;
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

        // 2. External Drop (Sidebar)
        try {
            const rawData = e.dataTransfer.getData('application/react-dnd-staff');
            if (rawData) {
                 const staffData = JSON.parse(rawData);
                 const row = { ...data[targetRowIndex] };
                 const currentList = [...(row[targetColumnId] as VisualStaff[] || [])];
                 
                 currentList.push({ 
                     name: staffData.name,
                     userId: staffData.id
                 });
                 
                 onUpdateRow(targetRowIndex, { ...row, [targetColumnId]: currentList });
            }
        } catch(err) { console.error(err); }
    };

  const highlightMatch = (text: string) => {
    if (!searchTerm) return <span className="font-bold font-sans">{text}</span>;
    const parts = text.split(new RegExp(`(${searchTerm})`, 'gi'));
    return (
      <span className="font-bold font-sans">
        {parts.map((part, i) => 
          part.toLowerCase() === searchTerm.toLowerCase() ? 
            <span key={i} className="bg-yellow-300 text-black px-1 rounded">{part}</span> : part
        )}
      </span>
    );
  };

  const hasMatch = (list: StaffMember[]) => {
      if(!searchTerm || !list) return false;
      return list.some(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }

    // Dynamic Header Renderer
const renderHeader = (col: ScheduleColumn, index: number) => {
        return (
            <th 
                key={col.id} 
                scope="col" 
                className={`group relative px-2 py-4 text-center text-xs font-extrabold text-white uppercase tracking-wider border-r border-white/20 bg-slate-700 ${printHeaderBg} print:text-white print:py-1`}
            >
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
                    <div className="flex flex-col items-center justify-center leading-tight">
                        <div className="whitespace-pre-wrap">{col.title}</div>
                        {/* عرض الوقت أسفل العنوان بشكل مضغوط جداً في الطباعة */}
                        {col.time && (
                            <div className="text-[9px] opacity-90 mt-0.5 font-normal lowercase tracking-tighter border-t border-white/10 pt-0.5 w-full print:text-[10px] print:mt-0 print:pt-0 print:border-none print:font-bold print:leading-none">
                                {col.time}
                            </div>
                        )}
                    </div>
                )}
            </th>
        );
    };
    const renderStaffList = (staffList: StaffMember[], rowIndex: number, columnId: string) => {
        const safeList = staffList || [];
        if (isEditing) {
            const rawList = (data[rowIndex][columnId] as VisualStaff[]) || [];
            return (
                <div 
                    className="space-y-2 p-1 min-w-[140px] min-h-[60px]"
                    onDragOver={onEditDragOver}
                    onDrop={(e) => onEditDrop(e, rowIndex, columnId)}
                >
                    {rawList.map((s, i) => (
                        <div key={i} draggable onDragStart={(e) => onEditDragStart(e, rowIndex, columnId, i)} className="flex flex-col gap-1 group bg-white border border-slate-200 p-1.5 rounded-md shadow-sm cursor-grab active:cursor-grabbing hover:border-blue-300 hover:shadow-md transition-all">
                            <div className="flex items-center gap-1 w-full">
                                <div className={`p-1 rounded-full bg-slate-100 mt-1`}>
                                    <i className="fas fa-grip-vertical text-xs text-slate-400"></i>
                                </div>
                                <input
                                    value={s.name}
                                    onChange={(e) => handleStaffFieldChange(rowIndex, columnId, i, 'name', e.target.value)}
                                    className="w-full text-xs font-bold p-1 bg-gray-50 focus:bg-white border-b border-transparent focus:border-blue-300 outline-none text-gray-900"
                                    placeholder="Name"
                                />
                                <button 
                                    onClick={() => removeStaffMember(rowIndex, columnId, i)}
                                    className="text-slate-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-all"
                                >
                                    <i className="fas fa-times text-xs"></i>
                                </button>
                            </div>
                            
                            {/* Extra fields for holiday */}
                            <div className="flex gap-1 pl-5">
                                <input
                                    value={s.time || ''}
                                    onChange={(e) => handleStaffFieldChange(rowIndex, columnId, i, 'time', e.target.value)}
                                    className="w-1/2 text-[10px] p-1 bg-slate-50 border border-slate-200 rounded outline-none focus:border-blue-300"
                                    placeholder="Time"
                                />
                                <input
                                    value={s.note || ''}
                                    onChange={(e) => handleStaffFieldChange(rowIndex, columnId, i, 'note', e.target.value)}
                                    className="w-1/2 text-[10px] p-1 bg-yellow-50 border border-yellow-200 rounded outline-none focus:border-yellow-400 text-yellow-800"
                                    placeholder="Note"
                                />
                            </div>
                        </div>
                    ))}
                    <button
                        onClick={() => handleAddNewStaff(rowIndex, columnId)}
                        className="w-full mt-2 py-1.5 text-blue-600 hover:bg-blue-50 border border-dashed border-blue-200 rounded-md text-xs font-semibold flex items-center justify-center gap-1 transition-colors"
                    >
                        <i className="fas fa-plus text-xs mr-1"></i> Add
                    </button>
                </div>
            );
        }
        return (
            <div className="flex flex-col gap-1 w-full items-center">
                {safeList.map((s, idx) => (
                    <div 
                        key={idx} 
                        className={`text-sm px-2 py-1.5 rounded-lg border shadow-sm flex flex-col items-center justify-center text-center break-words w-full print-color-adjust-exact ${s.color} 
                        print:shadow-none print:px-1 print:py-0.5 print:rounded print:border-transparent font-sans`}
                        dir="ltr"
                    >
                        <span className="font-bold print:text-[11px] leading-tight">
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
                ))}
            </div>
        );
    };

  return (
    <div className="space-y-6 animate-fade-in print:space-y-2 print:w-full relative">
        
        <PrintHeader 
            title={printTitle} 
            subtitle={printSubtitle} 
            month="" 
            themeColor={headerColor} 
        />

        {/* Config Area - Visible only on Screen */}
        <div className={`bg-slate-800 text-white p-4 rounded-xl shadow-md flex flex-col md:flex-row justify-between items-center gap-4 print:hidden transition-colors duration-300`}>
            <div className="w-full">
                {isEditing ? (
                    <div className="flex flex-col gap-3">
                        <div className="flex justify-between items-center">
                            <label className="text-[10px] uppercase font-bold opacity-80">Print Header Configuration</label>
                            <div className="flex gap-1 bg-white/10 p-1 rounded-full">
                                {['purple', 'indigo', 'rose', 'teal', 'slate', 'violet'].map(c => (
                                    <button 
                                        key={c}
                                        onClick={() => setHeaderColor(c)}
                                        className={`w-6 h-6 rounded-full border-2 border-white/50 hover:scale-110 transition-transform ${
                                            c === 'purple' ? 'bg-purple-600' :
                                            c === 'indigo' ? 'bg-indigo-600' :
                                            c === 'rose' ? 'bg-rose-600' :
                                            c === 'teal' ? 'bg-teal-600' :
                                            c === 'slate' ? 'bg-slate-600' :
                                            'bg-violet-600'
                                        } ${headerColor === c ? 'ring-2 ring-white scale-110' : ''}`}
                                        title={c}
                                    />
                                ))}
                            </div>
                        </div>
                        <input 
                            value={printTitle}
                            onChange={(e) => setPrintTitle(e.target.value)}
                            className="bg-white/20 border border-white/30 rounded px-2 py-1 text-white font-bold placeholder-white/50 outline-none focus:bg-white/30 w-full"
                            placeholder="Main Title (e.g. EID SCHEDULE)"
                        />
                        <input 
                            value={printSubtitle}
                            onChange={(e) => setPrintSubtitle(e.target.value)}
                            className="bg-white/20 border border-white/30 rounded px-2 py-1 text-xs text-white placeholder-white/50 outline-none focus:bg-white/30 w-full"
                            placeholder="Subtitle (e.g. Coverage Plan)"
                        />
                    </div>
                ) : (
                    <div>
                        <h2 className="text-xl font-bold uppercase tracking-wide">{printTitle}</h2>
                        <p className="text-white/80 text-sm font-medium">{printSubtitle}</p>
                    </div>
                )}
            </div>
            <div className="flex items-center gap-2">
                 <i className="fas fa-magic text-yellow-300 text-2xl"></i>
            </div>
        </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-lg bg-white print:block print:shadow-none print:overflow-visible print:border-none print:flex-grow relative z-10 print:bg-transparent">
        <table className="min-w-full divide-y divide-slate-200 print:divide-slate-900 print:border-2 print:border-slate-900 h-full print-color-adjust-exact print:table-fixed">
          {/* Main Table Header: Dynamic Color in Print */}
          <thead className={`bg-slate-50 ${printHeaderBg} print-color-adjust-exact`}>
            <tr className="print:h-fit">
              <th scope="col" className="px-6 py-4 text-left text-xs font-black text-slate-600 uppercase tracking-wider min-w-[220px] border-r border-slate-200 print:px-2 print:py-2 print:text-xs print:w-24 print:border-r print:border-white/20 print:text-white print:text-center font-sans">Occasion / Date</th>
              {columns.map((col, idx) => renderHeader(col, idx))}
              {isEditing && <th className="px-2 py-3 w-10 print:hidden"></th>}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200 print:divide-slate-300 print:bg-transparent">
            {staffData.map((row, idx) => (
              <tr key={idx} className="hover:bg-slate-50 transition-colors print:break-inside-avoid h-full print:bg-white">
                {/* Occasion / Date Cell: Takes the DAZZLING Color */}
                <td className={`px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-900 border-r border-slate-200 align-middle print:px-1 print:py-2 print:text-sm print:border-r print:border-slate-300 print-color-adjust-exact ${activeColorClasses}`}>
                    <div className="flex items-center justify-center">
                        {isEditing ? (
                             <input 
                                value={row.occasion} 
                                onChange={(e) => onUpdateRow(idx, {...data[idx], occasion: e.target.value})}
                                className="w-full border border-white/30 rounded-lg p-2 text-base font-bold text-center outline-none focus:ring-2 focus:ring-white/50 shadow-sm bg-black/20 text-white placeholder-white/70 print:bg-transparent print:text-black print:placeholder-transparent"
                                placeholder="Occasion / Date"
                            />
                        ) : (
                            <div className={`font-black text-center print:block whitespace-normal print:w-full text-white font-sans text-lg`}>
                                {row.occasion}
                            </div>
                        )}
                    </div>
                </td>
                
                {columns.map((col) => (
                    <td 
                        key={col.id}
                        className={`px-6 py-4 text-sm text-slate-700 align-middle border-r border-slate-100 print:px-1 print:py-1 print:border-r print:border-slate-300 print:text-[10px] print:align-middle ${!isEditing && hasMatch(row[col.id] as StaffMember[]) ? 'bg-yellow-50' : ''}`}
                    >
                        {renderStaffList(row[col.id] as StaffMember[], idx, col.id)}
                    </td>
                ))}

                {isEditing && (
                    <td className="px-2 py-4 align-top print:hidden">
                        <button 
                            onClick={() => {
                                if(window.confirm('Delete this row?')) {
                                    onRemoveRow(idx);
                                }
                            }} 
                            className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-full transition-colors"
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
                 <i className="fas fa-plus mr-2"></i> Add New Holiday Row
             </button>
        )}
      </div>

      <PrintFooter themeColor={headerColor} />
    </div>
  );
};

export default HolidayScheduleView;
