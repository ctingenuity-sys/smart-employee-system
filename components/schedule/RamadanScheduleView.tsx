
import React, { useState } from 'react';
import { ModalityColumn, CommonDuty, SavedTemplate, FridayScheduleRow, ScheduleColumn } from '../../types';
import GeneralScheduleView from './GeneralScheduleView';
import FridayScheduleView from './FridayScheduleView';
import Modal from '../Modal';

interface RamadanScheduleViewProps {
    // Regular Ramadan Data
    ramadanData: ModalityColumn[];
    setRamadanData: (data: ModalityColumn[]) => void;
    ramadanCommonDuties: CommonDuty[];
    setRamadanCommonDuties: (duties: CommonDuty[]) => void;
    
    // Friday Ramadan Data
    ramadanFridayData: FridayScheduleRow[];
    setRamadanFridayData: (data: FridayScheduleRow[]) => void;
    ramadanFridayColumns: ScheduleColumn[];
    setRamadanFridayColumns: (cols: ScheduleColumn[]) => void;

    // Dates
    ramadanStartDate: string;
    setRamadanStartDate: (date: string) => void;
    ramadanEndDate: string;
    setRamadanEndDate: (date: string) => void;
    
    // Title
    scheduleNote: string;
    setScheduleNote: (note: string) => void;

    isEditing: boolean;
    allUsers: any[];
    locations: any[];
    savedTemplates: SavedTemplate[];
}

const RamadanScheduleView: React.FC<RamadanScheduleViewProps> = ({
    ramadanData, setRamadanData,
    ramadanCommonDuties, setRamadanCommonDuties,
    ramadanFridayData, setRamadanFridayData,
    ramadanFridayColumns, setRamadanFridayColumns,
    ramadanStartDate, setRamadanStartDate,
    ramadanEndDate, setRamadanEndDate,
    scheduleNote, setScheduleNote,
    isEditing, allUsers, locations, savedTemplates
}) => {
    const [activeTab, setActiveTab] = useState<'weekly' | 'friday'>('weekly');
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);

    const handleImportTemplate = (tpl: SavedTemplate) => {
        if (activeTab === 'weekly') {
            if (tpl.generalData) {
                setRamadanData(JSON.parse(JSON.stringify(tpl.generalData)));
            }
            if (tpl.commonDuties) {
                setRamadanCommonDuties(JSON.parse(JSON.stringify(tpl.commonDuties)));
            }
        } else {
            // Import Friday Structure (Columns)
            if (tpl.fridayColumns) {
                setRamadanFridayColumns(JSON.parse(JSON.stringify(tpl.fridayColumns)));
            }
            // Import Friday Data (Rows)
            if (tpl.fridayData) {
                // We clear IDs to avoid conflict but keep the data so user can edit dates
                const importedRows = JSON.parse(JSON.stringify(tpl.fridayData)).map((row: any) => ({
                    ...row,
                    id: Date.now() + Math.random().toString(), // New ID
                    date: row.date || '' // Keep date so user knows which row corresponds to what, they can edit it
                }));
                setRamadanFridayData(importedRows);
            }
        }
        setIsImportModalOpen(false);
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Ramadan Header & Controls */}
            <div className="bg-gradient-to-r from-indigo-900 to-slate-900 p-6 rounded-3xl shadow-lg border border-indigo-500/30 text-white relative overflow-hidden print:hidden">
                {/* Decorative Elements */}
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <i className="fas fa-mosque text-9xl"></i>
                </div>
                <div className="absolute top-0 left-10 w-px h-20 bg-amber-400/30"></div>
                <div className="absolute top-20 left-10 w-2 h-2 bg-amber-400 rounded-full shadow-[0_0_10px_#fbbf24]"></div>

                <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div>
                        <h2 className="text-3xl font-black text-amber-400 tracking-tight flex items-center gap-3">
                            <i className="fas fa-moon"></i> Ramadan Schedule
                        </h2>
                        <p className="text-indigo-200 text-sm mt-1 font-medium">Special timings and shifts for the holy month.</p>
                    </div>

                    <div className="flex flex-col gap-2 w-full md:w-auto">
                        <div className="flex items-center gap-2 bg-white/10 p-2 rounded-xl backdrop-blur-md border border-white/10">
                            <div className="flex flex-col">
                                <label className="text-[9px] uppercase font-bold text-amber-400/80">From</label>
                                <input 
                                    type="date" 
                                    value={ramadanStartDate}
                                    onChange={e => setRamadanStartDate(e.target.value)}
                                    className="bg-transparent text-white font-bold text-sm outline-none w-32"
                                />
                            </div>
                            <span className="text-white/30">➜</span>
                            <div className="flex flex-col">
                                <label className="text-[9px] uppercase font-bold text-amber-400/80">To</label>
                                <input 
                                    type="date" 
                                    value={ramadanEndDate}
                                    onChange={e => setRamadanEndDate(e.target.value)}
                                    className="bg-transparent text-white font-bold text-sm outline-none w-32"
                                />
                            </div>
                        </div>
                        
                        <div className="flex gap-2">
                            <div className="flex bg-slate-800/50 p-1 rounded-lg border border-white/10 flex-1">
                                <button 
                                    onClick={() => setActiveTab('weekly')}
                                    className={`flex-1 py-1.5 px-3 rounded-md text-xs font-bold transition-all ${activeTab === 'weekly' ? 'bg-amber-500 text-slate-900' : 'text-slate-400 hover:text-white'}`}
                                >
                                    Weekly
                                </button>
                                <button 
                                    onClick={() => setActiveTab('friday')}
                                    className={`flex-1 py-1.5 px-3 rounded-md text-xs font-bold transition-all ${activeTab === 'friday' ? 'bg-amber-500 text-slate-900' : 'text-slate-400 hover:text-white'}`}
                                >
                                    Fridays
                                </button>
                            </div>
                            
                            {isEditing && (
                                <button 
                                    onClick={() => setIsImportModalOpen(true)}
                                    className="px-3 bg-indigo-600 text-white rounded-lg font-bold text-xs hover:bg-indigo-500 transition-colors shadow-lg border border-indigo-400"
                                    title={`Import ${activeTab === 'weekly' ? 'Structure' : 'Friday Columns & Data'}`}
                                >
                                    <i className="fas fa-file-import"></i>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Title Input (Local to Ramadan View) */}
            <div className="print:hidden mb-2">
                <label className="text-[10px] uppercase font-bold text-indigo-400 mb-1 block">Ramadan Schedule Title</label>
                <input 
                    value={scheduleNote}
                    onChange={e => setScheduleNote(e.target.value)}
                    className="bg-white text-indigo-900 px-4 py-3 rounded-xl border border-indigo-100 text-lg font-black w-full outline-none focus:ring-2 focus:ring-amber-200 shadow-sm"
                    placeholder="e.g. RAMADAN 1446"
                />
            </div>

            {/* Content Area */}
            <div className="border-t-4 border-amber-500 rounded-t-none">
                {activeTab === 'weekly' ? (
                    <GeneralScheduleView 
                        data={ramadanData}
                        commonDuties={ramadanCommonDuties}
                        isEditing={isEditing}
                        publishMonth="" 
                        globalStartDate={ramadanStartDate}
                        globalEndDate={ramadanEndDate}
                        setGlobalStartDate={()=>{}}
                        setGlobalEndDate={()=>{}}
                        scheduleNote={scheduleNote}
                        setScheduleNote={setScheduleNote}
                        
                        onUpdateColumn={(i, d) => { const n = [...ramadanData]; n[i] = d; setRamadanData(n); }}
                        onUpdateDuty={(i, d) => { const n = [...ramadanCommonDuties]; n[i] = d; setRamadanCommonDuties(n); }}
                        onAddColumn={() => setRamadanData([...ramadanData, { id: Date.now().toString(), title: 'New', defaultTime: '', colorClass: 'bg-white', staff: [] }])}
                        onRemoveColumn={(i) => setRamadanData(ramadanData.filter((_, idx) => idx !== i))}
                        onReorderColumns={(from, to) => { const n = [...ramadanData]; const [rem] = n.splice(from, 1); n.splice(to, 0, rem); setRamadanData(n); }}
                        onAddDuty={() => setRamadanCommonDuties([...ramadanCommonDuties, { section: 'New Duty', time: '', staff: [] }])}
                        onRemoveDuty={(i) => setRamadanCommonDuties(ramadanCommonDuties.filter((_, idx) => idx !== i))}
                        
                        locations={locations}
                        allUsers={allUsers}
                        searchTerm=""
                    />
                ) : (
                    <FridayScheduleView
                        data={ramadanFridayData}
                        isEditing={isEditing}
                        allUsers={allUsers}
                        publishMonth="RAMADAN FRIDAYS"
                        onUpdateRow={(i, d) => { const n = [...ramadanFridayData]; n[i] = d; setRamadanFridayData(n); }}
                        onAddRow={() => setRamadanFridayData([...ramadanFridayData, { id: Date.now().toString(), date: '' }])}
                        onRemoveRow={(i) => setRamadanFridayData(ramadanFridayData.filter((_, idx) => idx !== i))}
                        columns={ramadanFridayColumns}
                        onUpdateColumn={(i, c) => { const n = [...ramadanFridayColumns]; n[i] = c; setRamadanFridayColumns(n); }}
                        onRemoveColumn={(id) => setRamadanFridayColumns(ramadanFridayColumns.filter(c => c.id !== id))}
                        searchTerm=""
                    />
                )}
            </div>

            {/* Import Modal */}
            <Modal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} title={`Import ${activeTab === 'weekly' ? 'Weekly' : 'Friday'} Template`}>
                <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                    <p className="text-xs text-slate-500 mb-2">
                        {activeTab === 'weekly' 
                            ? "Choose a template to copy its General Structure (Staff & Duties)." 
                            : "Choose a template to copy its Friday Rows & Columns."
                        }
                    </p>
                    {savedTemplates.length === 0 ? (
                        <p className="text-center text-slate-400 py-6">No saved templates found.</p>
                    ) : (
                        savedTemplates.map(tpl => (
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
                        ))
                    )}
                </div>
            </Modal>
        </div>
    );
};

export default RamadanScheduleView;
