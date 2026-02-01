
import React, { useState, useMemo, useCallback } from 'react';
import { HolidayScheduleRow, VisualStaff, User, HeaderMap } from '../../types';
import { PrintHeader, PrintFooter } from '../PrintLayout';

// =================================================================
// 💡 Logic for Fixed Colors & Type Mapping
// =================================================================
interface StaffMember {
    name: string;
    time?: string;
    note?: string;
    color: string;
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
    if (!trimmedName || trimmedName === 'New Staff') return 'bg-slate-100 text-slate-700 border-slate-200';
    if (staffColorMap.has(trimmedName)) {
        return staffColorMap.get(trimmedName)!;
    }
    const newColor = colorClasses[staffColorMap.size % colorClasses.length];
    staffColorMap.set(trimmedName, newColor);
    return newColor;
};

const mapVisualToStaff = (list: VisualStaff[]): StaffMember[] => {
    return list
        .map(s => ({
            name: s.name,
            time: s.time,
            note: s.note,
            color: getStaffColor(s.name || ''),
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
  headers: HeaderMap;
  onHeaderChange: (newHeaders: HeaderMap) => void;
}

const HolidayScheduleView: React.FC<HolidayScheduleViewProps> = ({ 
    searchTerm, 
    data, 
    isEditing,
    onUpdateRow,
    onAddRow,
    onRemoveRow,
    publishMonth,
    headers,
    onHeaderChange
}) => {
    const [editDragItem, setEditDragItem] = useState<{ rowIndex: number, column: keyof HolidayScheduleRow, index: number } | null>(null);
    
    // --- Customizable Print Headers State ---
    const [printTitle, setPrintTitle] = useState("HOLIDAY SCHEDULE");
    const [printSubtitle, setPrintSubtitle] = useState("HOLIDAY COVERAGE");
    const [headerColor, setHeaderColor] = useState<any>("purple");

    // Dynamic styles based on selected color - Controls Main Title & Holiday Name Cell
    const activeColorClasses = {
        purple: 'bg-purple-700 print:bg-purple-800 text-white border-purple-900',
        indigo: 'bg-indigo-700 print:bg-indigo-800 text-white border-indigo-900',
        rose: 'bg-rose-700 print:bg-rose-800 text-white border-rose-900',
        teal: 'bg-teal-700 print:bg-teal-800 text-white border-teal-900',
        slate: 'bg-slate-700 print:bg-slate-800 text-white border-slate-900',
        violet: 'bg-violet-700 print:bg-violet-800 text-white border-violet-900'
    }[headerColor] || 'bg-purple-700 print:bg-purple-800 text-white';


    const activePrintBg = {
        purple: 'print:bg-purple-800',
        indigo: 'print:bg-indigo-800',
        rose: 'print:bg-rose-800',
        teal: 'print:bg-teal-800',
        slate: 'print:bg-slate-800',
        violet: 'print:bg-violet-800'
    }[headerColor] || 'print:bg-purple-800';

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

    // Enhanced Handler to support field updates (name, time, note)
    const handleStaffChange = useCallback((rowIndex: number, column: keyof HolidayScheduleRow, index: number, field: keyof VisualStaff, value: string) => {
        const row = { ...data[rowIndex] };
        const currentList = [...(row[column] as VisualStaff[])];
        currentList[index] = { ...currentList[index], [field]: value };
        onUpdateRow(rowIndex, { ...row, [column]: currentList });
    }, [data, onUpdateRow]);

    const handleAddNewStaff = useCallback((rowIndex: number, column: keyof HolidayScheduleRow) => {
        const row = { ...data[rowIndex] };
        const currentList = [...(row[column] as VisualStaff[])];
        currentList.push({ name: 'New Staff' });
        onUpdateRow(rowIndex, { ...row, [column]: currentList });
    }, [data, onUpdateRow]);

    const removeStaffMember = useCallback((rowIndex: number, column: keyof HolidayScheduleRow, index: number) => {
         const row = { ...data[rowIndex] };
         const currentList = [...(row[column] as VisualStaff[])];
         currentList.splice(index, 1);
         onUpdateRow(rowIndex, { ...row, [column]: currentList });
    }, [data, onUpdateRow]);

    const handleHeaderChange = (key: keyof HeaderMap, value: string) => {
        onHeaderChange({ ...headers, [key]: value });
    };

    // Drag & Drop (Edit Mode)
    const onEditDragStart = (e: React.DragEvent, rowIndex: number, column: keyof HolidayScheduleRow, index: number) => {
        setEditDragItem({ rowIndex, column, index });
        e.dataTransfer.effectAllowed = "move";
    };

    const onEditDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = editDragItem ? "move" : "copy";
    };

    const onEditDrop = (e: React.DragEvent, targetRowIndex: number, targetColumn: keyof HolidayScheduleRow) => {
        e.preventDefault();

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
      if(!searchTerm) return false;
      return list.some(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }

    // Header Renderer - Section Names (Morning, Evening, etc.)
const renderHeader = (key: keyof HeaderMap, bgColorClass: string, borderClass: string) => {
    return (
        // تم استبدال print:bg-slate-900 بـ ${activePrintBg}
        <th scope="col" className={`px-2 py-4 text-center text-xs font-black text-white uppercase tracking-wider border-r border-white/20 ${bgColorClass} ${borderClass} ${activePrintBg} print:text-white print:px-1 print:py-2 print:text-xs font-sans`}>
            {isEditing ? (
                <textarea 
                    value={headers[key]}
                    onChange={(e) => handleHeaderChange(key, e.target.value)}
                    className="bg-black/50 text-white text-center w-full rounded px-1 py-0.5 outline-none placeholder-black/70 min-h-[40px] text-[10px] resize-none focus:bg-black/100 transition-colors"
                    placeholder="Header Name"
                />
            ) : (
                <div className="whitespace-pre-wrap leading-tight print:leading-none">{headers[key]}</div>
            )}
        </th>
    );
};

    const renderStaffList = (staffList: StaffMember[], rowIndex: number, column: keyof HolidayScheduleRow) => {
        if (isEditing) {
            const rawList = data[rowIndex][column] as VisualStaff[];
            return (
                <div 
                    className="space-y-2 p-1 min-w-[140px] min-h-[60px]"
                    onDragOver={onEditDragOver}
                    onDrop={(e) => onEditDrop(e, rowIndex, column)}
                >
                    {rawList.map((s, i) => (
                        <div key={i} draggable onDragStart={(e) => onEditDragStart(e, rowIndex, column, i)} className="flex flex-col gap-1 group bg-white border border-slate-200 p-1.5 rounded-md shadow-sm cursor-grab active:cursor-grabbing hover:border-blue-300 hover:shadow-md transition-all relative">
                            {/* Header: Grip, Name, Delete */}
                            <div className="flex items-center gap-1 w-full">
                                <div className={`p-1 rounded-full bg-slate-100 cursor-grab`}>
                                    <i className="fas fa-grip-vertical text-slate-500 text-[10px]"></i>
                                </div>
                                <input
                                    value={s.name}
                                    onChange={(e) => handleStaffChange(rowIndex, column, i, 'name', e.target.value)}
                                    className="w-full text-xs font-bold p-1 bg-gray-50 focus:bg-white border-b border-transparent focus:border-blue-300 outline-none text-gray-900"
                                    placeholder="Name"
                                />
                                <button 
                                    onClick={() => removeStaffMember(rowIndex, column, i)}
                                    className="text-slate-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-all"
                                >
                                    <i className="fas fa-times text-xs"></i>
                                </button>
                            </div>

                            {/* Details: Time & Note */}
                            <div className="flex gap-1 pl-5">
                                <input
                                    value={s.time || ''}
                                    onChange={(e) => handleStaffChange(rowIndex, column, i, 'time', e.target.value)}
                                    className="w-1/2 text-[10px] p-1 bg-slate-50 border border-slate-200 rounded outline-none focus:border-blue-300 placeholder-slate-400"
                                    placeholder="Time"
                                />
                                <input
                                    value={s.note || ''}
                                    onChange={(e) => handleStaffChange(rowIndex, column, i, 'note', e.target.value)}
                                    className="w-1/2 text-[10px] p-1 bg-yellow-50 border border-yellow-200 rounded outline-none focus:border-yellow-400 text-yellow-900 placeholder-yellow-400"
                                    placeholder="Note"
                                />
                            </div>
                        </div>
                    ))}
                    <button
                        onClick={() => handleAddNewStaff(rowIndex, column)}
                        className="w-full mt-2 py-1.5 text-blue-600 hover:bg-blue-50 border border-dashed border-blue-200 rounded-md text-xs font-semibold flex items-center justify-center gap-1 transition-colors"
                    >
                        <i className="fas fa-plus text-xs mr-1"></i> Add
                    </button>
                </div>
            );
        }
        
        // VIEW / PRINT MODE
        return (
            <div className="flex flex-col gap-1 w-full items-center">
                {staffList.map((s, idx) => (
                    <div 
                        key={idx} 
                        className={`text-sm px-2 py-1.5 rounded-lg border shadow-sm flex flex-col items-center justify-center text-center break-words w-full print-color-adjust-exact ${s.color} 
                        print:shadow-none print:px-1 print:py-0.5 print:rounded print:border-transparent font-sans`}
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
  {/* هنا تم استبدال print:bg-slate-900 بالمتغير الجديد activePrintBg */}
  <thead className={`bg-slate-50 ${activePrintBg} print:text-white print-color-adjust-exact`}>
    <tr className="print:h-fit">
      {/* تحديث أول خلية لتأخذ نفس اللون في الطباعة */}
      <th scope="col" className={`px-6 py-4 text-left text-xs font-black text-slate-600 uppercase tracking-wider min-w-[220px] border-r border-slate-200 print:px-2 print:py-2 print:text-xs print:w-24 print:border-r print:border-white/20 print:text-white print:text-center font-sans ${activePrintBg}`}>
        Occasion / Date
      </th>
      
      {/* باقي الهيدرز ستعمل تلقائياً لأنك عدلت وظيفة renderHeader */}
      {renderHeader('morning', 'bg-indigo-50 text-indigo-700', 'border-indigo-100')}
      {renderHeader('evening', 'bg-violet-50 text-violet-700', 'border-violet-100')}
      {renderHeader('broken', 'bg-amber-50 text-amber-700', 'border-amber-100')}
      {renderHeader('cathLab', 'bg-rose-50 text-rose-700', 'border-rose-100')}
      {renderHeader('mri', 'bg-teal-50 text-teal-700', 'border-teal-100')}
      {renderHeader('night', 'bg-slate-100 text-slate-800', 'border-slate-200')}
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
                
                {['morning', 'evening', 'broken', 'cathLab', 'mri', 'night'].map((colKey) => (
                    <td 
                        key={colKey}
                        className={`px-6 py-4 text-sm text-slate-700 align-middle border-r border-slate-100 print:px-1 print:py-1 print:border-r print:border-slate-300 print:text-[10px] print:align-middle ${!isEditing && hasMatch(row[colKey as keyof typeof row] as StaffMember[]) ? 'bg-yellow-50' : ''}`}
                    >
                        {renderStaffList(row[colKey as keyof typeof row] as StaffMember[], idx, colKey as keyof HolidayScheduleRow)}
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
