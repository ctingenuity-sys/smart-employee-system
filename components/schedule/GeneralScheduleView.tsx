
import React, { useState } from 'react';
import { ModalityColumn, CommonDuty } from '../../types';
import { PrintHeader, PrintFooter } from '../PrintLayout';

// Solid, Fixed Colors for Headers to look professional and consistent
const fixedHeaderColors = [
    'bg-slate-200 text-black border-slate-300',
 'bg-blue-200 text-black border-blue-300',
 'bg-emerald-200 text-black border-emerald-300',
 'bg-rose-200 text-black border-rose-300',
 'bg-amber-200 text-black border-amber-300',
 'bg-purple-200 text-black border-purple-300',
 'bg-teal-200 text-black border-teal-300',
 'bg-indigo-200 text-black border-indigo-300',
];

const staffColorMap = new Map<string, string>();
const colorClasses = [
    'bg-blue-50 text-blue-900 border-blue-200',
  'bg-amber-50 text-amber-900 border-amber-200',
  'bg-emerald-50 text-emerald-900 border-emerald-200',
  'bg-purple-50 text-purple-900 border-purple-200',
  'bg-slate-100 text-slate-900 border-slate-200',

  'bg-rose-50 text-rose-900 border-rose-200',
  'bg-cyan-50 text-cyan-900 border-cyan-200',
  'bg-orange-50 text-orange-900 border-orange-200',
  'bg-teal-50 text-teal-900 border-teal-200',
  'bg-zinc-100 text-zinc-900 border-zinc-200',

  'bg-indigo-50 text-indigo-900 border-indigo-200',
  'bg-lime-50 text-lime-900 border-lime-200',
  'bg-fuchsia-50 text-fuchsia-900 border-fuchsia-200',
  'bg-yellow-50 text-yellow-900 border-yellow-200',
  'bg-stone-100 text-stone-900 border-stone-200',

  'bg-sky-50 text-sky-900 border-sky-200',
  'bg-red-100 text-red-900 border-red-200',
  'bg-green-100 text-green-900 border-green-200',
  'bg-violet-50 text-violet-900 border-violet-200',
  'bg-neutral-100 text-neutral-900 border-neutral-200',

  'bg-blue-100 text-blue-900 border-blue-200',
  'bg-amber-100 text-amber-900 border-amber-200',
  'bg-emerald-100 text-emerald-900 border-emerald-200',
  'bg-purple-100 text-purple-900 border-purple-200',
  'bg-gray-100 text-gray-900 border-gray-200',
];

const getStaffColor = (name: string): string => {
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName === 'Staff Name' || trimmedName === 'New Staff') {
        return 'bg-white text-slate-700 border-slate-200';
    }
    if (staffColorMap.has(trimmedName)) {
        return staffColorMap.get(trimmedName)!;
    }
    const newColor = colorClasses[staffColorMap.size % colorClasses.length];
    staffColorMap.set(trimmedName, newColor);
    return newColor;
};

// Helper to format date YYYY-MM-DD to DD/MM/YYYY
const formatDate = (isoString: string) => {
    if (!isoString) return '';
    const parts = isoString.split('-');
    if (parts.length !== 3) return isoString;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

interface GeneralScheduleViewProps {
  searchTerm: string;
  data: ModalityColumn[];
  commonDuties: CommonDuty[];
  isEditing: boolean;
  publishMonth: string;
  
  // Global Props
  globalStartDate: string;
  globalEndDate: string;
  setGlobalStartDate: (date: string) => void;
  setGlobalEndDate: (date: string) => void;
  
  scheduleNote: string;
  setScheduleNote: (note: string) => void;

  locations: { id: string; name: string }[];
  allUsers: any[];
  onUpdateColumn: (index: number, newData: ModalityColumn) => void;
  onUpdateDuty: (index: number, newData: CommonDuty) => void;
  onAddColumn: () => void;
  onRemoveColumn: (index: number) => void;
  onReorderColumns: (fromIndex: number, toIndex: number) => void;
  onAddDuty: () => void;
  onRemoveDuty: (index: number) => void;
}

const GeneralScheduleView: React.FC<GeneralScheduleViewProps> = ({ 
    searchTerm, 
    data, 
    commonDuties,
    isEditing,
    publishMonth,
    globalStartDate,
    globalEndDate,
    setGlobalStartDate,
    setGlobalEndDate,
    scheduleNote,
    setScheduleNote,
    onUpdateColumn,
    onUpdateDuty,
    onAddColumn,
    onRemoveColumn,
    onReorderColumns,
    onAddDuty,
    onRemoveDuty
}) => {
  
  const [draggedItem, setDraggedItem] = useState<{ colIndex: number, staffIndex: number } | null>(null);
  const [draggedColIndex, setDraggedColIndex] = useState<number | null>(null);

  // --- Helpers ---
  const highlightMatch = (text: string) => {
    if (!searchTerm || isEditing) return <span className="font-oswald tracking-wide font-medium">{text}</span>;
    const parts = text.split(new RegExp(`(${searchTerm})`, 'gi'));
    return (
      <span className="font-oswald tracking-wide font-medium">
        {parts.map((part, i) => 
          part.toLowerCase() === searchTerm.toLowerCase() ? 
            <span key={i} className="bg-yellow-300 text-black px-1 rounded">{part}</span> : part
        )}
      </span>
    );
  };

  const isMatched = (text: string) => {
      if (!searchTerm) return false;
      return text.toLowerCase().includes(searchTerm.toLowerCase());
  }

  // --- Logic Handlers ---
  const handleStaffChange = (colIndex: number, staffIndex: number, field: 'name' | 'time' | 'startDate' | 'endDate' | 'note', value: string) => {
      const newCols = [...data];
      const newStaff = [...newCols[colIndex].staff];
      newStaff[staffIndex] = { ...newStaff[staffIndex], [field]: value };
      newCols[colIndex].staff = newStaff;
      onUpdateColumn(colIndex, newCols[colIndex]);
  };

  const addStaff = (colIndex: number) => {
      const newCols = [...data];
      newCols[colIndex].staff = [...newCols[colIndex].staff, { name: 'New Staff' }];
      onUpdateColumn(colIndex, newCols[colIndex]);
  };

  const removeStaff = (colIndex: number, staffIndex: number) => {
      const newCols = [...data];
      newCols[colIndex].staff = newCols[colIndex].staff.filter((_, i) => i !== staffIndex);
      onUpdateColumn(colIndex, newCols[colIndex]);
  };

  // --- DRAG AND DROP HANDLERS ---
  const onColumnDragStart = (e: React.DragEvent, index: number) => {
      setDraggedColIndex(index);
      e.dataTransfer.effectAllowed = "move";
  };

  const onColumnDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      if (draggedColIndex !== null) {
          e.dataTransfer.dropEffect = "move";
      }
  };

  const onColumnDrop = (e: React.DragEvent, targetColIndex: number) => {
      e.preventDefault();
      if (draggedColIndex !== null) {
          if (draggedColIndex !== targetColIndex) {
            onReorderColumns(draggedColIndex, targetColIndex);
          }
          setDraggedColIndex(null);
      }
  };

  const onStaffDragStart = (e: React.DragEvent, colIndex: number, staffIndex: number) => {
      e.stopPropagation();
      setDraggedItem({ colIndex, staffIndex });
      e.dataTransfer.effectAllowed = "move";
  };

  const onStaffContainerDragOver = (e: React.DragEvent) => {
      e.preventDefault(); 
      e.stopPropagation();
      e.dataTransfer.dropEffect = draggedItem ? "move" : "copy";
  };

  const onStaffContainerDrop = (e: React.DragEvent, targetColIndex: number) => {
      e.preventDefault();
      e.stopPropagation();
      
      // 1. Internal Staff Drag (Reorder/Move)
      if (draggedItem) {
          const { colIndex: sourceColIndex, staffIndex: sourceStaffIndex } = draggedItem;
          
          const newCols = [...data];
          const sourceStaffList = [...newCols[sourceColIndex].staff];
          const itemToMove = sourceStaffList[sourceStaffIndex];

          if (sourceColIndex !== targetColIndex) {
              sourceStaffList.splice(sourceStaffIndex, 1);
              newCols[sourceColIndex].staff = sourceStaffList;
              
              const targetStaffList = [...newCols[targetColIndex].staff];
              targetStaffList.push(itemToMove);
              newCols[targetColIndex].staff = targetStaffList;
              
              onUpdateColumn(sourceColIndex, newCols[sourceColIndex]); 
              onUpdateColumn(targetColIndex, newCols[targetColIndex]); 
          }
          setDraggedItem(null);
          return;
      }

      // 2. External Drag (From Sidebar)
      try {
          const rawData = e.dataTransfer.getData('application/react-dnd-staff');
          if (rawData) {
              const staffData = JSON.parse(rawData);
              const newCols = [...data];
              newCols[targetColIndex].staff.push({ 
                  name: staffData.name, 
                  userId: staffData.id 
              });
              onUpdateColumn(targetColIndex, newCols[targetColIndex]);
          }
      } catch (err) { console.error("Drop error", err); }
  };

  // --- Duty Handlers ---
  const onDutyDrop = (e: React.DragEvent, dutyIndex: number) => {
      e.preventDefault();
      try {
          const rawData = e.dataTransfer.getData('application/react-dnd-staff');
          if (rawData) {
              const staffData = JSON.parse(rawData);
              const newDuties = [...commonDuties];
              newDuties[dutyIndex].staff.push({
                  name: staffData.name,
                  userId: staffData.id
              });
              onUpdateDuty(dutyIndex, newDuties[dutyIndex]);
          }
      } catch (err) { console.error("Duty Drop error", err); }
  };

  const handleDutyStaffChange = (dutyIndex: number, staffIndex: number, field: 'name' | 'time' | 'startDate' | 'endDate' | 'note', val: string) => {
     const newDuties = [...commonDuties];
     const newStaffList = [...newDuties[dutyIndex].staff];
     newStaffList[staffIndex] = { ...newStaffList[staffIndex], [field]: val };
     newDuties[dutyIndex].staff = newStaffList;
     onUpdateDuty(dutyIndex, newDuties[dutyIndex]);
  };

  const addDutyStaff = (dutyIndex: number) => {
    const newDuties = [...commonDuties];
    newDuties[dutyIndex].staff.push({ name: 'New Staff' });
    onUpdateDuty(dutyIndex, newDuties[dutyIndex]);
  };

  const removeDutyStaff = (dutyIndex: number, staffIndex: number) => {
      const newDuties = [...commonDuties];
      newDuties[dutyIndex].staff = newDuties[dutyIndex].staff.filter((_, i) => i !== staffIndex);
      onUpdateDuty(dutyIndex, newDuties[dutyIndex]);
  };

  const renderCard = (column: ModalityColumn, colIndex: number) => {
    // Select fixed color based on column index
    const fixedColorClass = fixedHeaderColors[colIndex % fixedHeaderColors.length];
    
    // Extract background color class for header from the fixed string
    const bgClass = fixedColorClass.split(' ').find(c => c.startsWith('bg-')) || 'bg-slate-800';
    const textClass = 'text-white';
    const borderClass = fixedColorClass.split(' ').find(c => c.startsWith('border-')) || 'border-slate-900';

    return (
        <div 
            className={`flex flex-col w-full mb-4 print-color-adjust-exact overflow-hidden rounded-3xl shadow-md transition-all duration-200 break-inside-avoid
            ${isEditing ? 'hover:shadow-lg hover:ring-2 hover:ring-blue-100 border-t-8 ' + borderClass : 'border-t-8 ' + borderClass}
            print:break-inside-avoid print:page-break-inside-avoid print:bg-white print:border print:border-slate-800 print:rounded-2xl print:mb-1 print:mx-0.5 print:shadow-none print:border-t-0`}
        >
        {/* Header - Solid Color - Updated for Print Consistency */}
        <div 
            draggable={isEditing}
            onDragStart={isEditing ? (e) => onColumnDragStart(e, colIndex) : undefined}
            className={`text-center relative group flex flex-col items-center justify-center print-color-adjust-exact p-3 border-b ${borderClass}
            ${fixedColorClass} 
            ${isEditing ? 'cursor-grab active:cursor-grabbing' : ''}
            print:${bgClass} print:text-white print:p-2 print:border-b print:rounded-t-[14px]`}
        >
            {isEditing && (
                <>
                    <div className="absolute top-2 left-2 text-white/50 hover:text-white print:hidden" title="Drag to reorder">
                        <i className="fas fa-grip-lines"></i>
                    </div>
                    <button 
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => { if(window.confirm(`Delete ${column.title}?`)) onRemoveColumn(colIndex); }}
                    className="absolute top-2 right-2 text-red-200 hover:text-white hover:bg-red-500/50 p-1 rounded-full transition-colors z-10 print:hidden"
                    >
                        <i className="fas fa-trash"></i>
                    </button>
                </>
            )}

            {isEditing ? (
                <input 
                value={column.title}
                onChange={(e) => { const newCol = {...column, title: e.target.value}; onUpdateColumn(colIndex, newCol); }}
                onMouseDown={(e) => e.stopPropagation()}
                className="font-oswald font-bold text-2xl text-center bg-transparent w-full border-b border-dashed border-white/40 focus:outline-none uppercase tracking-wide text-white placeholder-white/50 print:hidden"
                />
            ) : (
                <h3 className="font-oswald font-bold uppercase tracking-wide leading-none text-2xl print:hidden text-white">{column.title}</h3>
            )}
            
            {/* View/Print Title - Always Solid White on Dark BG, filling header */}
            <h3 className={`hidden print:block font-oswald font-bold uppercase tracking-wide leading-none text-xl md:print:text-2xl print:text-white print:w-full`}>{column.title}</h3>

            {(column.defaultTime || isEditing) && (
                <div className={`font-bold opacity-90 leading-none text-xs mt-1 flex items-center justify-center gap-1 print:text-[11px] print:mt-1 print:font-bold text-white`}>
                    <i className="far fa-clock print:hidden"></i>
                    {isEditing ? (
                        <input 
                            value={column.defaultTime} 
                            onChange={(e) => { const newCol = {...column, defaultTime: e.target.value}; onUpdateColumn(colIndex, newCol); }}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="bg-transparent text-center w-full focus:outline-none border-b border-dashed border-white/40 print:hidden text-white"
                        />
                    ) : (
                        <span dir="ltr" className="print:hidden">{column.defaultTime}</span>
                    )}
                    <span dir="ltr" className="hidden print:block font-sans">{column.defaultTime}</span>
                </div>
            )}
        </div>

        <div 
            className={`flex-1 bg-white p-3 space-y-2 min-h-[100px] print:p-0.5 print:space-y-0.5 print:min-h-0 relative ${isEditing ? 'hover:bg-slate-50 transition-colors' : ''}`}
            onDragOver={isEditing ? onStaffContainerDragOver : undefined}
            onDrop={isEditing ? (e) => onStaffContainerDrop(e, colIndex) : undefined}
        >
            {isEditing && column.staff.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-30 text-xs font-bold text-slate-400 uppercase tracking-widest print:hidden">
                    Drop Staff Here
                </div>
            )}

            {column.staff.map((staff, staffIndex) => {
            const staffColor = getStaffColor(staff.name);
            return (
                <div 
                    key={staffIndex}
                    draggable={isEditing}
                    onDragStart={(e) => onStaffDragStart(e, colIndex, staffIndex)} 
                    className={`relative rounded-xl border transition-all group flex flex-col items-center justify-center print-color-adjust-exact p-3 w-full shadow-sm z-10
                            ${isMatched(staff.name) && !isEditing ? 'bg-yellow-50 border-yellow-400 ring-2 ring-yellow-200' : staffColor} 
                        ${isEditing ? 'cursor-grab active:cursor-grabbing hover:border-blue-300' : ''} 
                        print:p-0.5 print:rounded-md print:border print:mb-0.5 print:min-h-0 print:shadow-none`}
                >
                {/* Delete Button */}
                {isEditing && (
                    <button 
                        onClick={(e) => {e.stopPropagation(); removeStaff(colIndex, staffIndex);}}
                        className="absolute -top-2 -right-2 bg-red-100 text-red-500 rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-200 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity z-20 print:hidden"
                    >
                        <i className="fas fa-times text-[10px]"></i>
                    </button>
                )}

                <div className={`flex flex-col items-center gap-0 w-full justify-center`}>
                    {isEditing ? (
                        <input 
                            value={staff.name} 
                            onChange={(e) => handleStaffChange(colIndex, staffIndex, 'name', e.target.value)}
                            onMouseDown={(e) => e.stopPropagation()} 
                            className="w-full bg-white border border-slate-200 rounded px-1 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-blue-300 mb-1 print:hidden font-oswald"
                            placeholder="Name"
                        />
                    ) : (
                        <span className={`text-lg font-medium text-center whitespace-nowrap overflow-hidden text-ellipsis w-full print:hidden font-oswald tracking-wide`}>
                                {staff.name}
                        </span>
                    )}
                    
                    {/* View/Print Name - OSWALD FONT */}
                    <span className={`hidden print:block text-lg font-medium font-oswald tracking-wide print:text-black print:text-[15px] md:print:text-[16px] print:leading-tight text-center whitespace-nowrap overflow-hidden text-ellipsis w-full`}>
                        {staff.name}
                    </span>

                     {staff.time && (
                        <span className="hidden print:block text-[11px] font-mono font-bold text-slate-800 whitespace-nowrap print:text-[11px] print:leading-none print:mt-0" dir="ltr">{staff.time}</span>
                     )}
                     
                     {/* NOTE DISPLAY */}
                     {staff.note && (
                         <div className="hidden print:block text-[9px] text-yellow-900 bg-yellow-100/50 border border-yellow-200 px-1 rounded-md mt-0.5 print:text-[9px] print:border-0 print:bg-white/50 font-bold print:mt-0 leading-none text-center italic w-full">
                             {staff.note}
                         </div>
                     )}
                     
                     {/* Specific Override Display */}
                     {(staff.startDate && staff.endDate) && (
                         <div className="hidden print:block text-[9px] bg-red-50 text-red-600 px-1 rounded border border-red-100 mt-0.5 print:text-[9px] print:border-0 print:bg-white/50 print:text-red-700 font-bold print:mt-0 uppercase leading-none text-center">
                             FROM {formatDate(staff.startDate)} TO {formatDate(staff.endDate)}
                         </div>
                     )}
                </div>
                
                {/* --- EDITING EXTRA FIELDS (Time, Note, Start, End) --- */}
                {isEditing && (
                    <div className="flex flex-col w-full gap-1 mt-1 print:hidden">
                        <input 
                            placeholder="Time (Optional)"
                            value={staff.time || ''} 
                            onChange={(e) => handleStaffChange(colIndex, staffIndex, 'time', e.target.value)}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="w-full text-xs text-slate-500 bg-white border border-slate-200 rounded px-1 focus:outline-none"
                        />
                        <input 
                            placeholder="Note (e.g. 4PM-12AM)"
                            value={staff.note || ''} 
                            onChange={(e) => handleStaffChange(colIndex, staffIndex, 'note', e.target.value)}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="w-full text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 focus:outline-none placeholder-amber-300/70"
                        />
                        <div className="flex gap-1">
                            <input 
                                type="date"
                                title="Start Date Override"
                                value={staff.startDate || ''}
                                onChange={(e) => handleStaffChange(colIndex, staffIndex, 'startDate', e.target.value)}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="w-1/2 text-[10px] bg-white border border-slate-200 rounded px-1 focus:outline-none"
                            />
                            <input 
                                type="date"
                                title="End Date Override"
                                value={staff.endDate || ''}
                                onChange={(e) => handleStaffChange(colIndex, staffIndex, 'endDate', e.target.value)}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="w-1/2 text-[10px] bg-white border border-slate-200 rounded px-1 focus:outline-none"
                            />
                        </div>
                    </div>
                )}

                {/* VIEW MODE TIME & NOTE */}
                {!isEditing && (
                    <>
                        {staff.time && (
                            <div className="mt-1 text-[10px] font-black text-slate-700 bg-white/70 inline-block px-2 py-0.5 rounded border border-slate-300 uppercase tracking-tight print:hidden" dir="ltr">
                                {staff.time}
                            </div>
                        )}
                        {staff.note && (
                            <div className="mt-1 text-[10px] font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-200 italic print:hidden w-full text-center">
                                {staff.note}
                            </div>
                        )}
                    </>
                )}
                </div>
            );
            })}
            
            {isEditing && (
                <button 
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); addStaff(colIndex); }}
                className="w-full py-2 border-2 border-dashed border-slate-200 rounded-lg text-slate-400 flex items-center justify-center gap-1 hover:border-blue-300 hover:text-blue-500 transition-colors text-xs font-medium uppercase tracking-wide z-20 relative print:hidden"
                >
                    <i className="fas fa-plus"></i> Add Staff
                </button>
            )}
        </div>
    </div>
  )};

  return (
    <div className="space-y-8 animate-fade-in print:space-y-1 print:w-full print:bg-white print:text-left print:pb-8" dir="ltr">
      
      {/* Global Controls & Header Area */}
      <div className="print:hidden bg-slate-800 text-white p-4 rounded-xl shadow-md mb-6">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              <div>
                  <h2 className="text-lg font-bold uppercase tracking-wider text-slate-200">Global Settings</h2>
                  <p className="text-xs text-slate-400">Defaults for all staff unless overridden</p>
              </div>
              <div className="flex gap-2 w-full md:w-auto">
                  <div className="flex flex-col">
                      <label className="text-[10px] uppercase font-bold text-slate-400">Global Start</label>
                      <input 
                          type="date" 
                          value={globalStartDate}
                          onChange={e => setGlobalStartDate(e.target.value)}
                          className="bg-slate-700 text-white px-2 py-1 rounded border border-slate-600 text-xs"
                      />
                  </div>
                  <div className="flex flex-col">
                      <label className="text-[10px] uppercase font-bold text-slate-400">Global End</label>
                      <input 
                          type="date" 
                          value={globalEndDate}
                          onChange={e => setGlobalEndDate(e.target.value)}
                          className="bg-slate-700 text-white px-2 py-1 rounded border border-slate-600 text-xs"
                      />
                  </div>
                  <div className="flex flex-col flex-1">
                      <label className="text-[10px] uppercase font-bold text-slate-400">Schedule Note</label>
                      <input 
                          value={scheduleNote}
                          onChange={e => setScheduleNote(e.target.value)}
                          className="bg-slate-700 text-white px-2 py-1 rounded border border-slate-600 text-xs w-full"
                          placeholder="e.g. Approved By..."
                      />
                  </div>
              </div>
          </div>
      </div>

      {/* Print Header with Global Dates & Note Passed */}
      <div className="print:block">
          <PrintHeader 
            month={publishMonth} 
            subtitle="DUTY SCHEDULE" 
            dateRange={globalStartDate && globalEndDate ? `FROM ${formatDate(globalStartDate)} TO ${formatDate(globalEndDate)}` : undefined}
            note={scheduleNote}
          />
      </div>

      <div 
        className="columns-1 md:columns-2 lg:columns-3 xl:columns-5 gap-4 w-full print:columns-4 print:gap-1 print:w-full" 
        dir="ltr"
      >
        {data.map((column, colIndex) => (
          <div 
            key={column.id} 
            onDragOver={isEditing ? onColumnDragOver : undefined}
            onDrop={isEditing ? (e) => onColumnDrop(e, colIndex) : undefined}
            className={`transition-opacity ${draggedColIndex === colIndex ? 'opacity-50' : ''} break-inside-avoid mb-4 print:mb-1`}
          >
            {renderCard(column, colIndex)}
          </div>
        ))}

        {isEditing && (
            <button 
                onClick={onAddColumn}
                className="w-full rounded-3xl border-4 border-dashed border-slate-200 bg-slate-50 hover:bg-slate-100 flex flex-col items-center justify-center p-8 transition-colors min-h-[300px] text-slate-400 hover:text-blue-500 hover:border-blue-300 gap-4 print:hidden break-inside-avoid mb-4"
            >
                <div className="bg-white p-4 rounded-full shadow-sm">
                    <i className="fas fa-plus-circle text-3xl"></i>
                </div>
                <span className="font-bold text-lg">Add New Department</span>
            </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 mt-8 print:mt-2 print:grid print:grid-cols-3 print:gap-2 text-left break-before-avoid" dir="ltr">
        {commonDuties.map((duty, dutyIndex) => (
          <div key={dutyIndex} className="bg-white rounded-3xl shadow-md border border-slate-200 overflow-hidden h-full break-inside-avoid page-break-inside-avoid print-color-adjust-exact print:border print:border-slate-800 print:shadow-none print:rounded-2xl print:flex print:flex-col print:h-auto">
            {/* Common Duty Header - Fixed Dark */}
            <div className="bg-slate-900 text-white px-5 py-3 flex flex-col justify-center items-center gap-1 
                print:bg-slate-900 print:text-white print-color-adjust-exact print:w-full print:items-center print:justify-center print:px-2 print:py-2 print:border-b print:border-slate-800">
                {isEditing ? (
                    <div className="flex gap-2 w-full items-center print:hidden">
                        <input 
                            value={duty.section}
                            onChange={(e) => { const newDuties = [...commonDuties]; newDuties[dutyIndex].section = e.target.value; onUpdateDuty(dutyIndex, newDuties[dutyIndex]); }}
                            className="font-oswald font-bold text-sm tracking-wider bg-slate-800 text-white px-2 rounded w-full border border-slate-600 outline-none"
                        />
                        <button onClick={() => onRemoveDuty(dutyIndex)} className="text-red-400 hover:text-red-300 px-2"><i className="fas fa-trash"></i></button>
                    </div>
                ) : (
                    <span className="font-oswald font-bold text-lg tracking-wide uppercase whitespace-normal text-center print:hidden">{duty.section}</span>
                )}
                
                {/* Print Title */}
                <span className="hidden print:block font-oswald font-bold text-lg tracking-wide uppercase print:text-[15px] whitespace-normal text-center print:leading-tight">{duty.section}</span>

                {isEditing ? (
                     <input 
                        value={duty.time}
                        onChange={(e) => { const newDuties = [...commonDuties]; newDuties[dutyIndex].time = e.target.value; onUpdateDuty(dutyIndex, newDuties[dutyIndex]); }}
                        className="text-xs bg-slate-700 px-2 py-1 rounded text-slate-300 w-full text-center border border-slate-600 outline-none print:hidden"
                    />
                ) : (
                    duty.time && <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded text-white font-mono print:hidden" dir="ltr">{duty.time}</span>
                )}
                
                {/* Print Time */}
                {duty.time && <span className="hidden print:block text-[10px] bg-white/20 px-2 py-0.5 rounded text-white font-mono print:text-white/80 print:bg-white/10 print:p-0.5 print:rounded print:font-bold print:text-[11px]" dir="ltr">{duty.time}</span>}
            </div>
            
            <div 
                onDragOver={isEditing ? (e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; } : undefined}
                onDrop={isEditing ? (e) => { e.stopPropagation(); onDutyDrop(e, dutyIndex); } : undefined}
                className="p-4 flex flex-wrap gap-2 justify-center bg-slate-50 min-h-[80px] print:flex-1 print:bg-white print:justify-center print:items-start print:p-1 print:min-h-0 print:gap-1 print:flex-row print:flex-wrap"
            >
                {duty.staff.map((s, sIndex) => {
                    const dutyStaffColor = getStaffColor(s.name);
                    return (
                        <div key={sIndex} className="relative group w-full print:w-auto print:flex-1 print:min-w-[80px]">
                            {isEditing ? (
                                <div className="flex flex-col gap-1 bg-white p-1 rounded border border-slate-200 shadow-sm print:hidden">
                                    <div className="flex items-center gap-1">
                                        <input 
                                            value={s.name}
                                            onChange={(e) => handleDutyStaffChange(dutyIndex, sIndex, 'name', e.target.value)}
                                            className="px-2 py-1 rounded text-sm w-full outline-none bg-transparent font-bold font-oswald"
                                            placeholder="Name"
                                        />
                                        <button onClick={() => removeDutyStaff(dutyIndex, sIndex)} className="text-red-400 hover:text-red-600"><i className="fas fa-times"></i></button>
                                    </div>
                                    <input 
                                        value={s.time || ''}
                                        onChange={(e) => handleDutyStaffChange(dutyIndex, sIndex, 'time', e.target.value)}
                                        className="px-2 py-1 rounded text-xs w-full outline-none bg-slate-50 border border-slate-100 text-slate-500"
                                        placeholder="Time (Optional)"
                                    />
                                    <input 
                                        value={s.note || ''}
                                        onChange={(e) => handleDutyStaffChange(dutyIndex, sIndex, 'note', e.target.value)}
                                        className="px-2 py-1 rounded text-xs w-full outline-none bg-amber-50 border border-amber-100 text-amber-700"
                                        placeholder="Note"
                                    />
                                    <div className="flex gap-1">
                                        <input 
                                            type="date"
                                            value={s.startDate || ''}
                                            onChange={(e) => handleDutyStaffChange(dutyIndex, sIndex, 'startDate', e.target.value)}
                                            className="w-1/2 px-1 text-[9px] border rounded"
                                        />
                                        <input 
                                            type="date"
                                            value={s.endDate || ''}
                                            onChange={(e) => handleDutyStaffChange(dutyIndex, sIndex, 'endDate', e.target.value)}
                                            className="w-1/2 px-1 text-[9px] border rounded"
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div 
                                    className={`px-3 py-2 rounded-xl text-sm font-semibold border flex flex-col justify-center items-center text-center shadow-sm w-full print-color-adjust-exact print:hidden
                                        ${isMatched(s.name) ? 'bg-yellow-100 text-yellow-900 border-yellow-300' : dutyStaffColor}`}
                                >
                                    <span className="font-oswald tracking-wide text-xl">{highlightMatch(s.name)}</span>
                                    {s.time && <span className="text-[11px] bg-white/50 px-1 py-0 rounded mt-1 font-mono border border-black/5" dir="ltr">{s.time}</span>}
                                    {s.note && <span className="text-[10px] text-amber-800 bg-amber-100 px-1 py-0.5 rounded mt-1 w-full italic">{s.note}</span>}
                                </div>
                            )}
                            
                            {/* Print Version */}
                            <div 
                                className={`hidden print:flex flex-col justify-center items-center text-center w-full print-color-adjust-exact
                                    ${dutyStaffColor}
                                    print:rounded-lg print:border-none print:px-1 print:py-0.5 print:text-[12px] print:w-full print:gap-0 print:shadow-none print:h-full`}
                            >
                                <span className="font-oswald font-medium text-xl print:text-[15px] print:font-medium print:leading-tight">{s.name}</span>
                                {s.time && <span className="text-[11px] bg-white/50 px-1 py-0 rounded mt-1 font-mono border border-black/5 print:bg-white/50 print:mt-0.5 print:border-none print:text-[11px] print:font-bold print:text-black" dir="ltr">{s.time}</span>}
                                {s.note && <span className="text-[9px] text-amber-900 bg-amber-100/50 px-1 rounded mt-0.5 print:text-[9px] print:border-0 print:bg-white/50 print:text-black font-bold print:mt-0 leading-none text-center italic">{s.note}</span>}
                                {(s.startDate && s.endDate) && (
                                    <div className="hidden print:block text-[9px] bg-red-50 text-red-600 px-1 rounded border border-red-100 mt-0.5 print:text-[9px] print:border-0 print:bg-white/50 print:text-red-700 font-bold print:mt-0 uppercase leading-none text-center">
                                        FROM {formatDate(s.startDate)} TO {formatDate(s.endDate)}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
                {isEditing && (
                    <button onClick={() => addDutyStaff(dutyIndex)} className="bg-blue-50 text-blue-600 px-3 py-1 rounded-full text-xs font-bold border border-blue-200 hover:bg-blue-100 uppercase h-fit self-center transition-colors print:hidden">
                        + Add
                    </button>
                )}
            </div>
          </div>
        ))}

        {isEditing && (
            <button onClick={onAddDuty} className="col-span-1 lg:col-span-1 border-2 border-dashed border-slate-300 rounded-3xl p-6 flex flex-col items-center justify-center text-slate-400 hover:text-blue-500 hover:border-blue-400 hover:bg-slate-50 transition-all cursor-pointer min-h-[150px] print:hidden">
                <i className="fas fa-plus-circle text-3xl mb-2"></i>
                <span className="font-bold uppercase tracking-wider">Add New Duty Section</span>
            </button>
        )}
      </div>

      <PrintFooter />
    </div>
  );
};

export default GeneralScheduleView;
