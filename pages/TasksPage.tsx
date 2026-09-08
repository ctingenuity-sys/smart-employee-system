import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
// @ts-ignore
import { collection, addDoc, updateDoc, deleteDoc, doc, query, orderBy, Timestamp, limit, getDocs, where } from 'firebase/firestore';
import { DepartmentTask, Location } from '../types';
import Loading from '../components/Loading';
import Toast from '../components/Toast';
import VoiceInput from '../components/VoiceInput';
import { useLanguage } from '../contexts/LanguageContext';
import { useDepartment } from '../contexts/DepartmentContext';
import { useTheme } from '../contexts/ThemeContext';

const TasksPage: React.FC = () => {
    const { t, dir } = useLanguage();
    const { isDark } = useTheme();
    const { selectedDepartmentId } = useDepartment();
    const [tasks, setTasks] = useState<DepartmentTask[]>(() => {
        const cached = localStorage.getItem('usr_cached_tasks');
        return cached ? JSON.parse(cached) : [];
    });
    const [locations, setLocations] = useState<Location[]>(() => {
        const cached = localStorage.getItem('usr_cached_task_locs');
        return cached ? JSON.parse(cached) : [];
    });
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'info'|'error'} | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Task Form
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [newTaskLocation, setNewTaskLocation] = useState('');
    const [newTaskPriority, setNewTaskPriority] = useState<'low'|'medium'|'high'>('medium');

    // Filter State for Done Column
    const [doneMonth, setDoneMonth] = useState(new Date().toISOString().slice(0, 7));
    const [useDateFilter, setUseDateFilter] = useState(true);

    const userId = auth.currentUser?.uid;
    const userName = localStorage.getItem('username') || t('role.user');
    const storedRole = localStorage.getItem('role') || 'user';
    const isSupervisor = storedRole === 'admin' || storedRole === 'supervisor';

    useEffect(() => {
        localStorage.setItem('usr_cached_tasks', JSON.stringify(tasks));
    }, [tasks]);

    useEffect(() => {
        localStorage.setItem('usr_cached_task_locs', JSON.stringify(locations));
    }, [locations]);

    useEffect(() => {
        if (!selectedDepartmentId) return;
        setLoading(true);
        
        // Fetch Locations
        const qLocs = query(collection(db, 'locations'), where('departmentId', '==', selectedDepartmentId));
        getDocs(qLocs).then(snap => {
            setLocations(snap.docs.map((d: any) => ({ ...d.data(), id: d.id } as Location)));
        });

        // Fetch Tasks
        const qTasks = query(collection(db, 'departmentTasks'), where('departmentId', '==', selectedDepartmentId), orderBy('createdAt', 'desc'), limit(100));
        getDocs(qTasks).then((snap: any) => {
             setTasks(snap.docs.map((d: any) => ({ ...d.data(), id: d.id } as DepartmentTask)));
             setLoading(false);
        });

    }, [refreshTrigger, selectedDepartmentId]);

    // ... (rest of the component)
    const handleAddTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!isSupervisor) return setToast({msg: 'Access Denied', type: 'error'});
        if(!newTaskTitle || !newTaskLocation) return setToast({msg: 'Missing Data', type: 'error'});
        
        try {
            await addDoc(collection(db, 'departmentTasks'), {
                title: newTaskTitle,
                location: newTaskLocation,
                departmentId: selectedDepartmentId,
                priority: newTaskPriority,
                status: 'pending',
                createdBy: userName,
                createdAt: Timestamp.now()
            });
            setToast({msg: t('save'), type: 'success'});
            setNewTaskTitle('');
        } catch(e) { setToast({msg: 'Error', type: 'error'}); }
    };

    const handleStartTask = async (task: DepartmentTask) => {
        if (!userId) return;
        try {
            // 1. Update Task to In Progress and Assign to User
            await updateDoc(doc(db, 'departmentTasks', task.id), { 
                status: 'in_progress',
                assignedTo: userId,
                assignedByName: userName
            });

            // 2. Add Points (Action Log) - Bonus for initiative
            await addDoc(collection(db, 'actions'), {
                employeeId: userId,
                type: 'positive', // This corresponds to bonus points in Reports
                description: `Started task: ${task.title}`,
                fromDate: new Date().toISOString().split('T')[0],
                toDate: new Date().toISOString().split('T')[0],
                createdAt: Timestamp.now()
            });

            setToast({msg: 'Task started! Bonus points added.', type: 'success'});
        } catch(e) { setToast({msg: 'Error', type: 'error'}); }
    };

    const handleCompleteTask = async (taskId: string) => {
        try {
            await updateDoc(doc(db, 'departmentTasks', taskId), { status: 'done' });
            setToast({msg: 'Great job!', type: 'success'});
        } catch(e) { setToast({msg: 'Error', type: 'error'}); }
    };

    const handleRevertTask = async (taskId: string) => {
         try {
            await updateDoc(doc(db, 'departmentTasks', taskId), { 
                status: 'pending',
                assignedTo: null,
                assignedByName: null
            });
            setToast({msg: t('task.revert'), type: 'info'});
        } catch(e) { setToast({msg: 'Error', type: 'error'}); }
    }

    const deleteTask = async (taskId: string) => {
        if(!isSupervisor) return;
        if(!confirm(t('confirm') + '?')) return;
        try {
            await deleteDoc(doc(db, 'departmentTasks', taskId));
            setToast({msg: t('delete'), type: 'success'});
        } catch(e) { setToast({msg: 'Error', type: 'error'}); }
    };

    // Filter Logic for Done Column
    const doneTasks = tasks.filter(t => {
        if (t.status !== 'done') return false;
        if (!useDateFilter) return true;
        
        if (!t.createdAt) return false;
        const d = t.createdAt.toDate ? t.createdAt.toDate() : new Date(t.createdAt.seconds * 1000);
        return d.toISOString().slice(0, 7) === doneMonth;
    });

    if (loading) return <Loading />;

    return (
        <div className={`min-h-screen pb-20 font-sans transition-colors duration-200 ${isDark ? 'dark-theme bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-800'}`} dir={dir}>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            {/* Header */}
            <div className={`p-6 md:p-10 mb-6 text-white ${isDark ? 'bg-slate-900 border-b border-slate-800' : 'bg-amber-500'}`}>
                <div className="max-w-6xl mx-auto">
                    <h1 className="text-3xl font-black mb-2 flex items-center gap-3">
                        <i className={`fas fa-tasks ${isDark ? 'text-amber-400' : ''}`}></i> {t('task.title')}
                    </h1>
                    <p className={`${isDark ? 'text-slate-400' : 'text-amber-100'} font-bold`}>{t('task.subtitle')}</p>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-4">
                
                {/* Add Task Form (Supervisor Only) */}
                {isSupervisor && (
                    <div className={`p-6 rounded-3xl shadow-sm mb-8 animate-fade-in-up border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-amber-100'}`}>
                        <h3 className={`font-bold text-lg mb-4 flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-800'}`}>
                            <i className="fas fa-plus-circle text-amber-500"></i> {t('task.add')}
                        </h3>
                        <form onSubmit={handleAddTask} className="flex flex-col md:flex-row gap-4 items-end">
                            <div className="flex-1 w-full">
                                <label className={`text-xs font-bold block mb-1 ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>{t('comm.ann.title')}</label>
                                <VoiceInput
                                    value={newTaskTitle}
                                    onChange={setNewTaskTitle}
                                    onTranscript={setNewTaskTitle}
                                    placeholder={t('comm.ann.title')}
                                />
                            </div>
                            <div className="w-full md:w-64">
                                <label className={`text-xs font-bold block mb-1 ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>{t('location')}</label>
                                <select 
                                    className={`w-full border rounded-xl p-3 text-sm font-bold outline-none cursor-pointer ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-700'}`}
                                    value={newTaskLocation}
                                    onChange={e => setNewTaskLocation(e.target.value)}
                                >
                                    <option value="">...</option>
                                    {locations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
                                </select>
                            </div>
                            <div className="w-full md:w-40">
                                <label className={`text-xs font-bold block mb-1 ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>{t('comm.ann.priority')}</label>
                                <select 
                                    className={`w-full border rounded-xl p-3 text-sm font-bold outline-none cursor-pointer ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-700'}`}
                                    value={newTaskPriority}
                                    onChange={e => setNewTaskPriority(e.target.value as any)}
                                >
                                    <option value="low">{t('task.priority.low')}</option>
                                    <option value="medium">{t('task.priority.medium')}</option>
                                    <option value="high">{t('task.priority.high')}</option>
                                </select>
                            </div>
                            <button type="submit" className="w-full md:w-auto bg-amber-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-amber-700 shadow-lg shadow-amber-600/30 transition-transform active:scale-95">
                                {t('add')}
                            </button>
                        </form>
                    </div>
                )}

                {/* Kanban Board */}
                <div className="grid md:grid-cols-3 gap-6 overflow-x-auto pb-4">
                    
                    {/* Column 1: PENDING */}
                    <div className={`rounded-3xl p-4 min-w-[300px] h-fit border ${isDark ? 'bg-slate-900/70 border-slate-800' : 'bg-slate-100 border-transparent'}`}>
                        <div className="flex justify-between items-center mb-4 px-2">
                            <h4 className={`font-bold flex items-center gap-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                <span className="w-3 h-3 rounded-full bg-slate-400"></span> {t('task.pending')}
                            </h4>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-white text-slate-400'}`}>
                                {tasks.filter(t => t.status === 'pending').length}
                            </span>
                        </div>
                        <div className="space-y-3">
                            {tasks.filter(t => t.status === 'pending').map(task => (
                                <div key={task.id} className={`p-5 rounded-2xl shadow-sm border hover:shadow-md transition-all group relative overflow-hidden ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                                    <div className={`absolute ${dir === 'rtl' ? 'left-0' : 'right-0'} top-0 bottom-0 w-1 ${task.priority === 'high' ? 'bg-red-500' : task.priority === 'medium' ? 'bg-amber-400' : 'bg-blue-400'}`}></div>
                                    
                                    <div className="flex justify-between items-start mb-2 pl-2">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                                            task.priority === 'high' 
                                                ? (isDark ? 'bg-red-950/60 text-red-400 border border-red-900/50' : 'bg-red-100 text-red-600') 
                                                : task.priority === 'medium' 
                                                    ? (isDark ? 'bg-amber-950/60 text-amber-400 border border-amber-900/50' : 'bg-amber-100 text-amber-600') 
                                                    : (isDark ? 'bg-blue-950/60 text-blue-400 border border-blue-900/50' : 'bg-blue-50 text-blue-600')
                                        }`}>
                                            {t(`task.priority.${task.priority}`)}
                                        </span>
                                        {isSupervisor && (
                                            <button onClick={() => deleteTask(task.id)} className={`hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity ${isDark ? 'text-slate-500' : 'text-slate-300'}`}><i className="fas fa-trash"></i></button>
                                        )}
                                    </div>
                                    
                                    <h5 className={`font-bold text-base mb-1 pl-2 ${isDark ? 'text-white' : 'text-slate-800'}`}>{task.title}</h5>
                                    <p className={`text-xs mb-4 pl-2 ${isDark ? 'text-slate-400' : 'text-slate-400'}`}><i className="fas fa-map-marker-alt mx-1"></i> {task.location}</p>
                                    
                                    <div className={`flex justify-between items-center border-t pt-3 pl-2 ${isDark ? 'border-slate-800' : 'border-slate-50'}`}>
                                        <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{task.createdBy}</span>
                                        <button 
                                            onClick={() => handleStartTask(task)} 
                                            className="text-xs bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 font-bold transition-all shadow-md shadow-indigo-600/30 active:scale-95"
                                        >
                                            {t('task.start')}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Column 2: IN PROGRESS */}
                    <div className={`rounded-3xl p-4 min-w-[300px] h-fit border ${isDark ? 'bg-blue-950/20 border-blue-900/40' : 'bg-blue-50 border-transparent'}`}>
                        <div className="flex justify-between items-center mb-4 px-2">
                            <h4 className={`font-bold flex items-center gap-2 ${isDark ? 'text-blue-400' : 'text-blue-800'}`}>
                                <span className="w-3 h-3 rounded-full bg-blue-500 animate-pulse"></span> {t('task.progress')}
                            </h4>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${isDark ? 'bg-slate-800 text-blue-400' : 'bg-white text-blue-400'}`}>
                                {tasks.filter(t => t.status === 'in_progress').length}
                            </span>
                        </div>
                        <div className="space-y-3">
                            {tasks.filter(t => t.status === 'in_progress').map(task => (
                                <div key={task.id} className={`p-5 rounded-2xl shadow-md border relative group ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-blue-100'}`}>
                                    <div className="flex justify-between items-start mb-2">
                                         <div className="flex items-center gap-2">
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${isDark ? 'bg-blue-900/50 text-blue-400' : 'bg-blue-100 text-blue-600'}`}>
                                                <i className="fas fa-user-clock"></i>
                                            </div>
                                            <span className={`text-xs font-bold ${isDark ? 'text-blue-300' : 'text-blue-800'}`}>{task.assignedByName || 'Unknown'}</span>
                                         </div>
                                        {isSupervisor && (
                                            <button onClick={() => deleteTask(task.id)} className={`hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity ${isDark ? 'text-slate-500' : 'text-slate-300'}`}><i className="fas fa-trash"></i></button>
                                        )}
                                    </div>
                                    <h5 className={`font-bold text-sm mb-1 ${isDark ? 'text-white' : 'text-slate-800'}`}>{task.title}</h5>
                                    <p className={`text-xs mb-3 ${isDark ? 'text-slate-400' : 'text-slate-400'}`}><i className="fas fa-map-marker-alt mx-1"></i> {task.location}</p>
                                    <div className={`flex justify-between items-center border-t pt-3 gap-2 ${isDark ? 'border-slate-800' : 'border-slate-50'}`}>
                                            {(isSupervisor || task.assignedTo === userId) ? (
                                                <>
                                                    <button onClick={() => handleRevertTask(task.id)} className={`text-[10px] font-bold px-2 ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-400 hover:text-slate-600'}`}>
                                                        {t('task.revert')}
                                                    </button>
                                                    <button onClick={() => handleCompleteTask(task.id)} className="flex-1 text-xs bg-emerald-500 text-white px-2 py-2 rounded-lg hover:bg-emerald-600 font-bold transition-colors shadow-md shadow-emerald-500/30">
                                                        {t('task.complete')} <i className="fas fa-check mx-1"></i>
                                                    </button>
                                                </>
                                            ) : (
                                                <span className="text-[10px] text-slate-400 italic w-full text-center">...</span>
                                            )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Column 3: DONE */}
                    <div className={`rounded-3xl p-4 min-w-[300px] h-fit border ${isDark ? 'bg-emerald-950/20 border-emerald-900/40' : 'bg-emerald-50 border-transparent'}`}>
                        <div className="flex flex-col gap-3 mb-4 px-2">
                            <div className="flex justify-between items-center">
                                <h4 className={`font-bold flex items-center gap-2 ${isDark ? 'text-emerald-400' : 'text-emerald-800'}`}>
                                    <span className="w-3 h-3 rounded-full bg-emerald-500"></span> {t('task.done')}
                                </h4>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${isDark ? 'bg-slate-800 text-emerald-400' : 'bg-white text-emerald-400'}`}>
                                    {doneTasks.length}
                                </span>
                            </div>
                            
                            {/* Filter Controls */}
                            <div className={`flex items-center gap-2 p-1.5 rounded-xl ${isDark ? 'bg-slate-800/80 border border-slate-700' : 'bg-white/50 border border-transparent'}`}>
                                <button 
                                    onClick={() => setUseDateFilter(!useDateFilter)}
                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap ${
                                        !useDateFilter 
                                            ? 'bg-emerald-600 text-white shadow-md' 
                                            : isDark
                                                ? 'bg-slate-700 text-emerald-300 border border-emerald-900/40'
                                                : 'bg-white text-emerald-600 border border-emerald-100'
                                    }`}
                                >
                                    {useDateFilter ? t('view') + ' All' : t('comm.filter')}
                                </button>
                                {useDateFilter && (
                                    <input 
                                        type="month" 
                                        className={`flex-1 rounded-lg px-2 py-1 text-[10px] font-bold outline-none min-w-0 ${
                                            isDark 
                                                ? 'bg-slate-900 border border-slate-700 text-emerald-300 [color-scheme:dark] focus:ring-1 focus:ring-emerald-500' 
                                                : 'bg-white border border-emerald-100 text-emerald-800 focus:ring-1 focus:ring-emerald-300'
                                        }`}
                                        value={doneMonth}
                                        onChange={e => setDoneMonth(e.target.value)}
                                    />
                                )}
                            </div>
                        </div>

                        <div className="space-y-3 opacity-80">
                            {doneTasks.map(task => (
                                <div key={task.id} className={`p-4 rounded-2xl shadow-sm border group hover:opacity-100 transition-opacity ${isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white/80 border-emerald-100'}`}>
                                    <div className="flex justify-between items-start mb-2">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                                            task.priority === 'high' 
                                                ? (isDark ? 'bg-red-950/60 text-red-400 border border-red-900/50' : 'bg-red-100 text-red-600') 
                                                : task.priority === 'medium' 
                                                    ? (isDark ? 'bg-amber-950/60 text-amber-400 border border-amber-900/50' : 'bg-amber-100 text-amber-600') 
                                                    : (isDark ? 'bg-blue-950/60 text-blue-400 border border-blue-900/50' : 'bg-blue-50 text-blue-600')
                                        }`}>
                                            {t(`task.priority.${task.priority}`)}
                                        </span>
                                        {isSupervisor && (
                                            <button onClick={() => deleteTask(task.id)} className={`hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity ${isDark ? 'text-slate-500' : 'text-slate-300'}`}><i className="fas fa-trash"></i></button>
                                        )}
                                    </div>
                                    <h5 className={`font-bold text-base mb-1 line-through opacity-70 ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>{task.title}</h5>
                                    <p className={`text-xs mb-4 ${isDark ? 'text-slate-400' : 'text-slate-400'}`}><i className="fas fa-map-marker-alt mx-1"></i> {task.location}</p>
                                    
                                    <div className={`flex justify-between items-center border-t pt-3 ${isDark ? 'border-slate-800' : 'border-slate-50'}`}>
                                        <span className={`text-[10px] font-bold px-2 py-1 rounded ${isDark ? 'text-emerald-400 bg-emerald-950/60 border border-emerald-900/50' : 'text-emerald-600 bg-emerald-100'}`}>
                                            {t('task.done')}
                                        </span>
                                        <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{task.assignedByName}</span>
                                    </div>
                                </div>
                            ))}
                            {doneTasks.length === 0 && (
                                <div className={`text-center py-8 opacity-50 text-xs font-bold border-2 border-dashed rounded-2xl ${isDark ? 'border-emerald-900/40 text-emerald-500' : 'border-emerald-100 text-emerald-400'}`}>
                                    {t('user.market.empty')}
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default TasksPage;