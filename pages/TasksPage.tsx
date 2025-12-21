
import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
// @ts-ignore
import { collection, addDoc, updateDoc, deleteDoc, doc, query, orderBy, onSnapshot, Timestamp, limit, getDocs } from 'firebase/firestore';
import { DepartmentTask, Location } from '../types';
import Loading from '../components/Loading';
import Toast from '../components/Toast';
import VoiceInput from '../components/VoiceInput';
import { useLanguage } from '../contexts/LanguageContext';

const TasksPage: React.FC = () => {
    const { t, dir } = useLanguage();
    const [tasks, setTasks] = useState<DepartmentTask[]>([]);
    const [locations, setLocations] = useState<Location[]>([]);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'info'|'error'} | null>(null);

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
        setLoading(true);
        
        // Fetch Locations
        getDocs(collection(db, 'locations')).then(snap => {
            setLocations(snap.docs.map(d => ({ id: d.id, ...d.data() } as Location)));
        });

        // Fetch Tasks (Real-time)
        const qTasks = query(collection(db, 'departmentTasks'), orderBy('createdAt', 'desc'), limit(100));
        const unsubTasks = onSnapshot(qTasks, (snap) => {
             setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() } as DepartmentTask)));
             setLoading(false);
        });

        return () => unsubTasks();
    }, []);

    const handleAddTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!isSupervisor) return setToast({msg: 'Access Denied', type: 'error'});
        if(!newTaskTitle || !newTaskLocation) return setToast({msg: 'Missing Data', type: 'error'});
        
        try {
            await addDoc(collection(db, 'departmentTasks'), {
                title: newTaskTitle,
                location: newTaskLocation,
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
        <div className="min-h-screen bg-slate-50 pb-20 font-sans" dir={dir}>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            {/* Header */}
            <div className="bg-amber-500 text-white p-6 md:p-10 mb-6">
                <div className="max-w-6xl mx-auto">
                    <h1 className="text-3xl font-black mb-2 flex items-center gap-3">
                        <i className="fas fa-tasks"></i> {t('task.title')}
                    </h1>
                    <p className="text-amber-100 font-bold">{t('task.subtitle')}</p>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-4">
                
                {/* Add Task Form (Supervisor Only) */}
                {isSupervisor && (
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-amber-100 mb-8 animate-fade-in-up">
                        <h3 className="font-bold text-slate-800 text-lg mb-4 flex items-center gap-2">
                            <i className="fas fa-plus-circle text-amber-500"></i> {t('task.add')}
                        </h3>
                        <form onSubmit={handleAddTask} className="flex flex-col md:flex-row gap-4 items-end">
                            <div className="flex-1 w-full">
                                <label className="text-xs font-bold text-slate-400 block mb-1">{t('comm.ann.title')}</label>
                                <VoiceInput
                                    value={newTaskTitle}
                                    onChange={setNewTaskTitle}
                                    onTranscript={setNewTaskTitle}
                                    placeholder={t('comm.ann.title')}
                                />
                            </div>
                            <div className="w-full md:w-64">
                                    <label className="text-xs font-bold text-slate-400 block mb-1">{t('location')}</label>
                                    <select 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold outline-none"
                                    value={newTaskLocation}
                                    onChange={e => setNewTaskLocation(e.target.value)}
                                    >
                                    <option value="">...</option>
                                    {locations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
                                    </select>
                            </div>
                            <div className="w-full md:w-40">
                                    <label className="text-xs font-bold text-slate-400 block mb-1">{t('comm.ann.priority')}</label>
                                    <select 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold outline-none"
                                    value={newTaskPriority}
                                    onChange={e => setNewTaskPriority(e.target.value as any)}
                                    >
                                    <option value="low">{t('task.priority.low')}</option>
                                    <option value="medium">{t('task.priority.medium')}</option>
                                    <option value="high">{t('task.priority.high')}</option>
                                    </select>
                            </div>
                            <button type="submit" className="w-full md:w-auto bg-amber-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-amber-700 shadow-lg shadow-amber-200 transition-transform active:scale-95">
                                {t('add')}
                            </button>
                        </form>
                    </div>
                )}

                {/* Kanban Board */}
                <div className="grid md:grid-cols-3 gap-6 overflow-x-auto pb-4">
                    
                    {/* Column 1: PENDING */}
                    <div className="bg-slate-100 rounded-3xl p-4 min-w-[300px] h-fit">
                        <div className="flex justify-between items-center mb-4 px-2">
                            <h4 className="font-bold text-slate-600 flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full bg-slate-400"></span> {t('task.pending')}
                            </h4>
                            <span className="bg-white px-2 py-0.5 rounded-full text-xs font-bold text-slate-400">
                                {tasks.filter(t => t.status === 'pending').length}
                            </span>
                        </div>
                        <div className="space-y-3">
                            {tasks.filter(t => t.status === 'pending').map(task => (
                                <div key={task.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-all group relative overflow-hidden">
                                    <div className={`absolute ${dir === 'rtl' ? 'left-0' : 'right-0'} top-0 bottom-0 w-1 ${task.priority === 'high' ? 'bg-red-500' : task.priority === 'medium' ? 'bg-amber-400' : 'bg-blue-400'}`}></div>
                                    
                                    <div className="flex justify-between items-start mb-2 pl-2">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${task.priority === 'high' ? 'bg-red-100 text-red-600' : task.priority === 'medium' ? 'bg-amber-100 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                                            {t(`task.priority.${task.priority}`)}
                                        </span>
                                        {isSupervisor && (
                                            <button onClick={() => deleteTask(task.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><i className="fas fa-trash"></i></button>
                                        )}
                                    </div>
                                    
                                    <h5 className="font-bold text-slate-800 text-base mb-1 pl-2">{task.title}</h5>
                                    <p className="text-xs text-slate-400 mb-4 pl-2"><i className="fas fa-map-marker-alt mx-1"></i> {task.location}</p>
                                    
                                    <div className="flex justify-between items-center border-t border-slate-50 pt-3 pl-2">
                                        <span className="text-[10px] text-slate-400">{task.createdBy}</span>
                                        <button 
                                            onClick={() => handleStartTask(task)} 
                                            className="text-xs bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 font-bold transition-all shadow-md shadow-indigo-200 active:scale-95"
                                        >
                                            {t('task.start')}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Column 2: IN PROGRESS */}
                    <div className="bg-blue-50 rounded-3xl p-4 min-w-[300px] h-fit">
                        <div className="flex justify-between items-center mb-4 px-2">
                            <h4 className="font-bold text-blue-800 flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full bg-blue-500 animate-pulse"></span> {t('task.progress')}
                            </h4>
                            <span className="bg-white px-2 py-0.5 rounded-full text-xs font-bold text-blue-400">
                                {tasks.filter(t => t.status === 'in_progress').length}
                            </span>
                        </div>
                        <div className="space-y-3">
                            {tasks.filter(t => t.status === 'in_progress').map(task => (
                                <div key={task.id} className="bg-white p-5 rounded-2xl shadow-md border border-blue-100 relative group">
                                    <div className="flex justify-between items-start mb-2">
                                         <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold">
                                                <i className="fas fa-user-clock"></i>
                                            </div>
                                            <span className="text-xs font-bold text-blue-800">{task.assignedByName || 'Unknown'}</span>
                                         </div>
                                        {isSupervisor && (
                                            <button onClick={() => deleteTask(task.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><i className="fas fa-trash"></i></button>
                                        )}
                                    </div>
                                    <h5 className="font-bold text-slate-800 text-sm mb-1">{task.title}</h5>
                                    <p className="text-xs text-slate-400 mb-3"><i className="fas fa-map-marker-alt mx-1"></i> {task.location}</p>
                                    <div className="flex justify-between items-center border-t border-slate-50 pt-3 gap-2">
                                            {(isSupervisor || task.assignedTo === userId) ? (
                                                <>
                                                    <button onClick={() => handleRevertTask(task.id)} className="text-[10px] text-slate-400 hover:text-slate-600 font-bold px-2">
                                                        {t('task.revert')}
                                                    </button>
                                                    <button onClick={() => handleCompleteTask(task.id)} className="flex-1 text-xs bg-emerald-500 text-white px-2 py-2 rounded-lg hover:bg-emerald-600 font-bold transition-colors shadow-md shadow-emerald-200">
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
                    <div className="bg-emerald-50 rounded-3xl p-4 min-w-[300px] h-fit">
                        <div className="flex flex-col gap-3 mb-4 px-2">
                            <div className="flex justify-between items-center">
                                <h4 className="font-bold text-emerald-800 flex items-center gap-2">
                                    <span className="w-3 h-3 rounded-full bg-emerald-500"></span> {t('task.done')}
                                </h4>
                                <span className="bg-white px-2 py-0.5 rounded-full text-xs font-bold text-emerald-400">
                                    {doneTasks.length}
                                </span>
                            </div>
                            
                            {/* Filter Controls */}
                            <div className="flex items-center gap-2 bg-white/50 p-1.5 rounded-xl">
                                <button 
                                    onClick={() => setUseDateFilter(!useDateFilter)}
                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap ${!useDateFilter ? 'bg-emerald-600 text-white shadow-md' : 'bg-white text-emerald-600 border border-emerald-100'}`}
                                >
                                    {useDateFilter ? t('view') + ' All' : t('comm.filter')}
                                </button>
                                {useDateFilter && (
                                    <input 
                                        type="month" 
                                        className="flex-1 bg-white border border-emerald-100 rounded-lg px-2 py-1 text-[10px] font-bold text-emerald-800 outline-none focus:ring-1 focus:ring-emerald-300 min-w-0"
                                        value={doneMonth}
                                        onChange={e => setDoneMonth(e.target.value)}
                                    />
                                )}
                            </div>
                        </div>

                        <div className="space-y-3 opacity-80">
                            {doneTasks.map(task => (
                                <div key={task.id} className="bg-white/80 p-4 rounded-2xl shadow-sm border border-emerald-100 group hover:opacity-100 transition-opacity">
                                    <div className="flex justify-between items-start mb-2">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${task.priority === 'high' ? 'bg-red-100 text-red-600' : task.priority === 'medium' ? 'bg-amber-100 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                                            {t(`task.priority.${task.priority}`)}
                                        </span>
                                        {isSupervisor && (
                                            <button onClick={() => deleteTask(task.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><i className="fas fa-trash"></i></button>
                                        )}
                                    </div>
                                    <h5 className="font-bold text-slate-800 text-base mb-1 line-through opacity-70">{task.title}</h5>
                                    <p className="text-xs text-slate-400 mb-4"><i className="fas fa-map-marker-alt mx-1"></i> {task.location}</p>
                                    
                                    <div className="flex justify-between items-center border-t border-slate-50 pt-3">
                                        <span className="text-[10px] text-emerald-600 font-bold bg-emerald-100 px-2 py-1 rounded">
                                            {t('task.done')}
                                        </span>
                                        <span className="text-[10px] text-slate-400">{task.assignedByName}</span>
                                    </div>
                                </div>
                            ))}
                            {doneTasks.length === 0 && (
                                <div className="text-center py-8 text-emerald-400 opacity-50 text-xs font-bold border-2 border-dashed border-emerald-100 rounded-2xl">
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
