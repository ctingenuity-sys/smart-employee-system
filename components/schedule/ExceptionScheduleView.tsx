
import React, { useState, useEffect } from 'react';
import { DateException, ModalityColumn, CommonDuty, SavedTemplate, DoctorScheduleRow, ScheduleColumn } from '../../types';
import GeneralScheduleView from './GeneralScheduleView';
import DoctorScheduleView from './DoctorScheduleView';
import { PrintHeader } from '../PrintLayout';
import Modal from '../Modal';

interface ExceptionScheduleViewProps {
    exceptions: DateException[];
    setExceptions: React.Dispatch<React.SetStateAction<DateException[]>>;
    isEditing: boolean;
    allUsers: any[];
    locations: any[];
    savedTemplates: SavedTemplate[]; // Passed for import feature
}

// Default columns for doctors if none exist
const defaultDoctorCols: ScheduleColumn[] = [
    { id: 'morning', title: 'MORNING', time: '09:00 - 17:00' },
    { id: 'evening', title: 'EVENING', time: '17:00 - 01:00' },
    { id: 'night', title: 'NIGHT', time: '01:00 - 09:00' }
];

const ExceptionScheduleView: React.FC<ExceptionScheduleViewProps> = ({
    exceptions,
    setExceptions,
    isEditing,
    allUsers,
    locations,
    savedTemplates
}) => {
    const [activeExceptionId, setActiveExceptionId] = useState<string | null>(null);
    const [activeSubTab, setActiveSubTab] = useState<'staff' | 'doctor'>('staff');
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);

    useEffect(() => {
        if (exceptions.length > 0 && !activeExceptionId) {
            setActiveExceptionId(exceptions[0].id);
        }
    }, [exceptions]);

    const handleAddException = () => {
        const newException: DateException = {
            id: Date.now().toString(),
            date: new Date().toISOString().split('T')[0],
            note: 'New Exception (e.g. National Day)',
            columns: [
                { id: '1', title: 'MRI', defaultTime: '08:00 - 20:00', colorClass: 'bg-blue-100', staff: [] },
                { id: '2', title: 'CT Scan', defaultTime: '24 Hours', colorClass: 'bg-green-100', staff: [] }
            ],
            doctorData: [{
                id: `doc_ex_${Date.now()}`,
                dateRange: 'Single Day',
                morning: [], evening: [], night: []
            }],
            doctorColumns: defaultDoctorCols
        };
        setExceptions([...exceptions, newException]);
        setActiveExceptionId(newException.id);
    };

    const handleRemoveException = (id: string) => {
        if (!confirm('Are you sure you want to delete this exception day?')) return;
        const newExceptions = exceptions.filter(e => e.id !== id);
        setExceptions(newExceptions);
        if (activeExceptionId === id && newExceptions.length > 0) {
            setActiveExceptionId(newExceptions[0].id);
        } else if (newExceptions.length === 0) {
            setActiveExceptionId(null);
        }
    };

    const updateActiveException = (updatedEx: DateException) => {
        setExceptions(prev => prev.map(ex => ex.id === updatedEx.id ? updatedEx : ex));
    };

    // Import Handler
    const handleImportTemplate = (tpl: SavedTemplate) => {
        if (!activeException) return;
        
        // Deep copy needed
        const newException = { ...activeException };
        
        if (activeSubTab === 'staff') {
            if (tpl.generalData) {
                newException.columns = JSON.parse(JSON.stringify(tpl.generalData));
            }
        } else {
             // Import Doctor Data if available
             if (tpl.doctorData && tpl.doctorData.length > 0) {
                 // We need to map the first row of template doctor data to this exception
                 // But typically templates have multiple rows for weeks. We take the first one as structure.
                 if(tpl.doctorColumns) newException.doctorColumns = JSON.parse(JSON.stringify(tpl.doctorColumns));
                 
                 // Reset data to single row with new columns structure
                 newException.doctorData = [{
                     id: `doc_ex_${Date.now()}`,
                     dateRange: activeException.date,
                     ...tpl.doctorData[0] // Copy first row data as starting point
                 }];
             }
        }
        
        updateActiveException(newException);
        setIsImportModalOpen(false);
    };

    const activeException = exceptions.find(e => e.id === activeExceptionId);

    return (
        <div className="space-y-6">
            
            {/* Sidebar / Tabs for Exceptions */}
            <div className="flex gap-2 overflow-x-auto pb-2 print:hidden">
                {exceptions.map(ex => (
                    <div 
                        key={ex.id}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl cursor-pointer border transition-all ${activeExceptionId === ex.id ? 'bg-amber-100 border-amber-300 text-amber-900 shadow-md' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                        onClick={() => setActiveExceptionId(ex.id)}
                    >
                        <div className="flex flex-col">
                            <span className="text-xs font-bold whitespace-nowrap">{ex.date}</span>
                            <span className="text-[10px] truncate max-w-[100px]">{ex.note}</span>
                        </div>
                        {isEditing && (
                            <button onClick={(e) => { e.stopPropagation(); handleRemoveException(ex.id); }} className="text-red-400 hover:text-red-600">
                                <i className="fas fa-times"></i>
                            </button>
                        )}
                    </div>
                ))}
                
                {isEditing && (
                    <button 
                        onClick={handleAddException}
                        className="px-4 py-2 rounded-xl border-2 border-dashed border-slate-300 text-slate-400 hover:border-amber-300 hover:text-amber-500 hover:bg-amber-50 transition-all flex items-center gap-2 whitespace-nowrap"
                    >
                        <i className="fas fa-plus"></i> Add Exception Day
                    </button>
                )}
            </div>

            {/* Main Editor Area */}
            {activeException ? (
                <div className="animate-fade-in">
                    {/* Header Inputs for the specific Exception */}
                    <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 mb-4 flex flex-col md:flex-row justify-between items-center gap-4 print:hidden">
                        <div className="flex gap-4 items-end flex-1 w-full">
                            <div className="flex-1 min-w-[200px]">
                                <label className="text-xs font-bold text-amber-800 uppercase mb-1 block">Occasion Name</label>
                                <input 
                                    className="w-full bg-white border border-amber-200 rounded-lg p-2 text-sm font-bold outline-none focus:ring-2 focus:ring-amber-300"
                                    value={activeException.note}
                                    onChange={e => updateActiveException({...activeException, note: e.target.value})}
                                    placeholder="e.g. National Day"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-amber-800 uppercase mb-1 block">Date</label>
                                <input 
                                    type="date"
                                    className="bg-white border border-amber-200 rounded-lg p-2 text-sm font-bold outline-none focus:ring-2 focus:ring-amber-300"
                                    value={activeException.date}
                                    onChange={e => updateActiveException({...activeException, date: e.target.value})}
                                />
                            </div>
                        </div>

                        {/* Sub-Tabs & Import */}
                        <div className="flex items-center gap-2">
                            <div className="bg-white p-1 rounded-lg border border-amber-200 flex">
                                <button 
                                    onClick={() => setActiveSubTab('staff')}
                                    className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeSubTab === 'staff' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                                >
                                    Staff
                                </button>
                                <button 
                                    onClick={() => setActiveSubTab('doctor')}
                                    className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeSubTab === 'doctor' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                                >
                                    Doctors
                                </button>
                            </div>
                            {isEditing && (
                                <button 
                                    onClick={() => setIsImportModalOpen(true)}
                                    className="px-3 py-2 bg-indigo-50 text-indigo-600 rounded-lg border border-indigo-100 font-bold text-xs hover:bg-indigo-100 flex items-center gap-1"
                                >
                                    <i className="fas fa-file-import"></i> Import
                                </button>
                            )}
                        </div>
                    </div>

                    {/* View Switcher */}
                    {activeSubTab === 'staff' ? (
                        <GeneralScheduleView 
                            data={activeException.columns}
                            commonDuties={[]} // No common duties section for exceptions to keep it simple
                            isEditing={isEditing}
                            publishMonth="" 
                            globalStartDate=""
                            globalEndDate=""
                            setGlobalStartDate={()=>{}}
                            setGlobalEndDate={()=>{}}
                            scheduleNote={activeException.note} 
                            setScheduleNote={()=>{}}
                            onUpdateColumn={(idx, newCol) => {
                                const newCols = [...activeException.columns];
                                newCols[idx] = newCol;
                                updateActiveException({...activeException, columns: newCols});
                            }}
                            onAddColumn={() => {
                                const newCol: ModalityColumn = { 
                                    id: Date.now().toString(), 
                                    title: 'New Section', 
                                    defaultTime: '', 
                                    colorClass: 'bg-white', 
                                    staff: [] 
                                };
                                updateActiveException({...activeException, columns: [...activeException.columns, newCol]});
                            }}
                            onRemoveColumn={(idx) => {
                                const newCols = activeException.columns.filter((_, i) => i !== idx);
                                updateActiveException({...activeException, columns: newCols});
                            }}
                            onReorderColumns={(from, to) => {
                                const newCols = [...activeException.columns];
                                const [moved] = newCols.splice(from, 1);
                                newCols.splice(to, 0, moved);
                                updateActiveException({...activeException, columns: newCols});
                            }}
                            onUpdateDuty={()=>{}} onAddDuty={()=>{}} onRemoveDuty={()=>{}}
                            locations={locations} allUsers={allUsers} searchTerm=""
                        />
                    ) : (
                        <DoctorScheduleView 
                            data={activeException.doctorData || [{ id: 'init', dateRange: activeException.date }]}
                            isEditing={isEditing}
                            allUsers={allUsers}
                            publishMonth=""
                            columns={activeException.doctorColumns || defaultDoctorCols}
                            onUpdateRow={(idx, newRow) => {
                                const newData = [...(activeException.doctorData || [])];
                                // Ensure initialized
                                if (newData.length === 0) newData.push({ id: 'init', dateRange: activeException.date });
                                newData[idx] = newRow;
                                updateActiveException({...activeException, doctorData: newData});
                            }}
                            onAddRow={() => {
                                // Single row logic mainly, but allow multiple if needed
                            }} 
                            onRemoveRow={() => {}}
                            onUpdateColumn={(idx, newCol) => {
                                const newCols = [...(activeException.doctorColumns || defaultDoctorCols)];
                                newCols[idx] = newCol;
                                updateActiveException({...activeException, doctorColumns: newCols});
                            }}
                            onRemoveColumn={(colId) => {
                                const newCols = (activeException.doctorColumns || defaultDoctorCols).filter(c => c.id !== colId);
                                updateActiveException({...activeException, doctorColumns: newCols});
                            }}
                            searchTerm=""
                        />
                    )}
                </div>
            ) : (
                <div className="text-center py-20 text-slate-400 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                    <i className="fas fa-calendar-star text-4xl mb-4 text-amber-300"></i>
                    <p>No exception days created yet.</p>
                    <button onClick={handleAddException} className="text-amber-600 font-bold hover:underline mt-2">Create First Exception</button>
                </div>
            )}

            {/* Import Modal */}
            <Modal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} title="Import Pattern to Exception">
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                    <p className="text-xs text-slate-500 mb-2">Select a template to overwrite the current {activeSubTab === 'staff' ? 'Staff' : 'Doctor'} schedule for this exception day.</p>
                    {savedTemplates.map(tpl => (
                        <button
                            key={tpl.id}
                            onClick={() => handleImportTemplate(tpl)}
                            className="w-full text-left p-3 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all flex justify-between items-center group"
                        >
                            <div>
                                <h4 className="font-bold text-slate-800 text-sm group-hover:text-indigo-700">{tpl.name}</h4>
                                <p className="text-[10px] text-slate-400">Created: {new Date(tpl.createdAt?.seconds * 1000).toLocaleDateString()}</p>
                            </div>
                            <i className="fas fa-download text-slate-300 group-hover:text-indigo-500"></i>
                        </button>
                    ))}
                    {savedTemplates.length === 0 && <p className="text-center text-slate-400 text-xs">No saved templates found.</p>}
                </div>
            </Modal>

        </div>
    );
};

export default ExceptionScheduleView;
