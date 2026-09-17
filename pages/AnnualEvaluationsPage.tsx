import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useDepartment } from '../contexts/DepartmentContext';
import { db } from '../firebase';
// @ts-ignore
import { collection, query, where, onSnapshot, doc, deleteDoc, getDocs, orderBy } from 'firebase/firestore';
import { AnnualEvaluation, UserRole, User } from '../types';
import { getRatingGradeLabel } from '../services/evaluationService';
import { EvaluationFormModal } from '../components/evaluation/EvaluationFormModal';
import { EvaluationPrintView } from '../components/evaluation/EvaluationPrintView';
import { EmployeeAcknowledgeModal } from '../components/evaluation/EmployeeAcknowledgeModal';
import Loading from '../components/Loading';

export const AnnualEvaluationsPage: React.FC = () => {
  const { user, role, departmentId } = useAuth();
  const { language, dir, t } = useLanguage();
  const isEn = language === 'en';
  const { selectedDepartmentId, departments, filterVisualUsers } = useDepartment();

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [evaluations, setEvaluations] = useState<AnnualEvaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [allUsers, setAllUsers] = useState<User[]>([]);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'published' | 'acknowledged'>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');

  // Modals
  const [editingEvaluation, setEditingEvaluation] = useState<AnnualEvaluation | null>(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [printingEvaluation, setPrintingEvaluation] = useState<AnnualEvaluation | null>(null);
  const [acknowledgingEvaluation, setAcknowledgingEvaluation] = useState<AnnualEvaluation | null>(null);

  const isSupervisorOrAdmin = 
    role?.toLowerCase() === UserRole.ADMIN.toLowerCase() ||
    role?.toLowerCase() === UserRole.SUPERVISOR.toLowerCase() ||
    role?.toLowerCase() === UserRole.MANAGER.toLowerCase();

  const isAdmin = role?.toLowerCase() === UserRole.ADMIN.toLowerCase();

  // 1. Fetch Users List (Real-time synchronization so changes to employee numbers and profiles reflect instantly)
  useEffect(() => {
    const qUsers = collection(db, 'users');
    const unsubscribe = onSnapshot(
      qUsers,
      (snap: any) => {
        const uList = snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as User));
        setAllUsers(uList);
      },
      (err: any) => {
        console.error('Error fetching users in real-time:', err);
      }
    );
    return () => unsubscribe();
  }, []);

  // Determine current supervisor's department
  const supervisorDepartment = useMemo(() => {
    if (isAdmin) {
      if (selectedDepartmentId) {
        return departments.find(d => d.id === selectedDepartmentId) || null;
      }
      return null;
    }
    // Supervisor / Manager: locked to their department
    if (departmentId) {
      return departments.find(d => d.id === departmentId) || null;
    }
    if (selectedDepartmentId) {
      return departments.find(d => d.id === selectedDepartmentId) || null;
    }
    return null;
  }, [isAdmin, departmentId, selectedDepartmentId, departments]);

  // Filter users specifically belonging to supervisor's department
  const departmentEmployees = useMemo(() => {
    if (allUsers.length === 0) return [];
    
    // If Admin and no specific department selected, allow all users
    if (isAdmin && !selectedDepartmentId) {
      return allUsers;
    }

    const targetDeptId = supervisorDepartment?.id || selectedDepartmentId || departmentId;
    if (!targetDeptId) return allUsers;

    // Use DepartmentContext filterVisualUsers for strict roster matching
    const visualFiltered = filterVisualUsers(allUsers, targetDeptId);
    if (visualFiltered && visualFiltered.length > 0) {
      return visualFiltered;
    }

    // Direct fallback by departmentId or department name
    return allUsers.filter(u => 
      u.departmentId === targetDeptId || 
      (supervisorDepartment && u.departmentId === supervisorDepartment.name)
    );
  }, [allUsers, isAdmin, selectedDepartmentId, supervisorDepartment, departmentId, filterVisualUsers]);

  // 2. Real-time Subscription to Annual Evaluations
  useEffect(() => {
    setLoading(true);

    let q = query(
      collection(db, 'annual_evaluations'),
      where('evaluationYear', '==', Number(selectedYear))
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AnnualEvaluation));
        // Sort in memory by totalScore or createdAt
        list.sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));
        setEvaluations(list);
        setLoading(false);
      },
      (err) => {
        console.error('Error listening to annual evaluations:', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [selectedYear]);

  // Delete Evaluation
  const handleDeleteEvaluation = async (evalId: string, empName: string) => {
    const confirmMsg = t('eval.deleteConfirm|name:' + empName);
    if (!window.confirm(confirmMsg || `هل أنت متأكد من حذف التقييم السنوي للموظف (${empName})؟`)) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'annual_evaluations', evalId));
    } catch (err: any) {
      alert(t('eval.deleteError') + err.message);
    }
  };

  // Filtered Evaluations for Supervisors
  const filteredEvaluations = evaluations.filter((ev) => {
    // If not supervisor/admin, only show own evaluations
    if (!isSupervisorOrAdmin) {
      const matchesUser = ev.employeeId === user?.uid || ev.employeeName?.trim() === user?.displayName?.trim();
      if (!matchesUser) return false;
      // Do not show drafts to employees
      if (ev.status === 'draft') return false;
      return true;
    }

    // If supervisor (not admin), only show evaluations of their department
    if (!isAdmin && supervisorDepartment) {
      const isDeptMatch = 
        ev.departmentId === supervisorDepartment.id || 
        ev.departmentName?.trim() === supervisorDepartment.name?.trim() ||
        departmentEmployees.some(emp => emp.id === ev.employeeId || emp.name?.trim() === ev.employeeName?.trim());
      if (!isDeptMatch) return false;
    }

    // Status filter
    if (statusFilter !== 'all' && ev.status !== statusFilter) return false;

    // Department dropdown filter
    if (deptFilter !== 'all' && ev.departmentId !== deptFilter && ev.departmentName !== deptFilter) return false;

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchName = ev.employeeName?.toLowerCase().includes(term);
      const matchNumber = ev.employeeNumber?.toLowerCase().includes(term);
      const matchPos = ev.position?.toLowerCase().includes(term);
      if (!matchName && !matchNumber && !matchPos) return false;
    }

    return true;
  });

  // Employee's own evaluation for this year (if user role)
  const myEvaluation = evaluations.find(
    ev => (ev.employeeId === user?.uid || ev.employeeName?.trim() === user?.displayName?.trim()) && ev.status !== 'draft'
  );

  // Statistics
  const totalCount = filteredEvaluations.length;
  const excellentCount = filteredEvaluations.filter(e => e.ratingGrade === 'excellent').length;
  const pendingAckCount = filteredEvaluations.filter(e => e.status === 'published').length;
  const avgScore = filteredEvaluations.length > 0 
    ? Math.round(filteredEvaluations.reduce((s, e) => s + (e.totalScore || 0), 0) / filteredEvaluations.length)
    : 0;

  // Helper to resolve human-readable department name from ID or Name
  const getDeptDisplayName = (deptName?: string | null, deptId?: string | null): string => {
    const raw = deptName || deptId;
    if (!raw) return '';
    const found = departments.find(d => d.id === raw || d.name === raw || (deptId && d.id === deptId));
    return found ? found.name : raw;
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-4 sm:p-6 lg:p-8 transition-colors" dir={dir}>
      
      {/* Page Header */}
      <div className="max-w-7xl mx-auto space-y-6">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 rounded-2xl shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20 flex-shrink-0">
              <i className="fas fa-award text-2xl"></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  {t('eval.pageTitle')}
                </h1>
                <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900">
                  {t('eval.badge')}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                {t('eval.subtitle')}
              </p>
              {supervisorDepartment && !isAdmin && (
                <div className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
                  <i className="fas fa-building"></i>
                  <span>
                    {isEn ? `Department: ${supervisorDepartment.name}` : `القسم المعتمد: ${supervisorDepartment.name}`}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Year Selector */}
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <i className="fas fa-calendar-alt text-slate-400 text-xs"></i>
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{t('eval.yearLabel')}</span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="bg-transparent font-bold text-sm text-blue-600 dark:text-blue-400 outline-none cursor-pointer"
              >
                {[currentYear + 1, currentYear, currentYear - 1, currentYear - 2].map((y) => (
                  <option key={y} value={y} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
                    {t(`eval.yearPrefix|year:${y}`) || `عام ${y}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Supervisor Action Button: Add New Evaluation */}
            {isSupervisorOrAdmin && (
              <button
                onClick={() => {
                  setEditingEvaluation(null);
                  setIsFormModalOpen(true);
                }}
                className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs sm:text-sm font-bold rounded-xl shadow-md hover:shadow-indigo-500/25 transition-all flex items-center gap-2"
              >
                <i className="fas fa-plus-circle"></i>
                <span>{t('eval.createNew')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Statistics KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-2">
              <span>{t(`eval.totalAppraisals|year:${selectedYear}`)}</span>
              <i className="fas fa-users text-blue-500"></i>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
              {totalCount}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-2">
              <span>{t('eval.excellentCount')}</span>
              <i className="fas fa-star text-emerald-500"></i>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">
              {excellentCount}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-2">
              <span>{t('eval.averageScore')}</span>
              <i className="fas fa-chart-line text-indigo-500"></i>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-indigo-600 dark:text-indigo-400">
              {avgScore} <span className="text-xs text-slate-400">/ 100</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-2">
              <span>{t('eval.pendingAck')}</span>
              <i className="fas fa-clock text-amber-500"></i>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-400">
              {pendingAckCount}
            </div>
          </div>
        </div>

        {/* Regular Employee View: Highlighted Personal Evaluation Card */}
        {!isSupervisorOrAdmin && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <i className="fas fa-user-check text-blue-600 dark:text-blue-400"></i>
                  <span>{t(`eval.myEvaluation|year:${selectedYear}`)}</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('eval.myEvaluationDesc')}
                </p>
              </div>

              {myEvaluation && (
                <button
                  onClick={() => setPrintingEvaluation(myEvaluation)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-2"
                >
                  <i className="fas fa-print text-blue-500"></i>
                  <span>{t('eval.printOfficial')}</span>
                </button>
              )}
            </div>

            {myEvaluation ? (
              <div className="space-y-6">
                
                {/* Result Hero Banner */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-2xl p-6 shadow-lg flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="space-y-2 text-center md:text-right">
                    <span className="text-xs font-bold text-blue-200 uppercase tracking-wider block">
                      {t('eval.approvedRating')}
                    </span>
                    <div className="flex items-center gap-3 justify-center md:justify-start">
                      <span className="text-4xl sm:text-5xl font-black">{myEvaluation.totalScore}</span>
                      <span className="text-xl text-blue-200 font-bold">/ 100</span>
                      <span className="px-3 py-1 rounded-full text-sm font-bold bg-white/20 backdrop-blur-sm text-white border border-white/30">
                        {getRatingGradeLabel(myEvaluation.ratingGrade, !isEn).label}
                      </span>
                    </div>
                    <p className="text-xs text-blue-100">
                      {t('eval.conductedOn')} {myEvaluation.evaluationDate} • {t('eval.supervisor')} {myEvaluation.supervisorName}
                    </p>
                  </div>

                  {/* Section Breakdown Mini Badges */}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs w-full md:w-auto">
                    <div className="bg-white/10 backdrop-blur-sm p-3 rounded-xl border border-white/10">
                      <div className="text-blue-200 text-[11px] mb-1">{t('eval.sec1Knowledge')}</div>
                      <div className="font-black text-lg">{myEvaluation.section1Score} <span className="text-xs font-normal opacity-70">/ 40</span></div>
                    </div>
                    <div className="bg-white/10 backdrop-blur-sm p-3 rounded-xl border border-white/10">
                      <div className="text-blue-200 text-[11px] mb-1">{t('eval.sec2WorkStyle')}</div>
                      <div className="font-black text-lg">{myEvaluation.section2Score} <span className="text-xs font-normal opacity-70">/ 40</span></div>
                    </div>
                    <div className="bg-white/10 backdrop-blur-sm p-3 rounded-xl border border-white/10">
                      <div className="text-blue-200 text-[11px] mb-1">{t('eval.sec3Behaviour')}</div>
                      <div className="font-black text-lg">{myEvaluation.section3Score} <span className="text-xs font-normal opacity-70">/ 20</span></div>
                    </div>
                  </div>
                </div>

                {/* Strengths & Weaknesses Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 p-4 rounded-xl text-xs">
                    <h3 className="font-bold text-emerald-800 dark:text-emerald-400 mb-2 flex items-center gap-2 text-sm">
                      <i className="fas fa-thumbs-up"></i>
                      <span>{t('eval.strengthsRecorded')}</span>
                    </h3>
                    <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                      {myEvaluation.strengthPoints || (isEn ? 'No strengths recorded.' : 'لا توجد نقاط قوة مسجلة.')}
                    </p>
                  </div>

                  <div className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 p-4 rounded-xl text-xs">
                    <h3 className="font-bold text-amber-800 dark:text-amber-400 mb-2 flex items-center gap-2 text-sm">
                      <i className="fas fa-lightbulb"></i>
                      <span>{t('eval.improvementsRecorded')}</span>
                    </h3>
                    <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                      {myEvaluation.weaknessPoints || (isEn ? 'No improvement points recorded.' : 'لا توجد نقاط ضعف مسجلة.')}
                    </p>
                  </div>
                </div>

                {/* Training Recommendations if any */}
                {myEvaluation.recommendTraining && myEvaluation.trainingPrograms && myEvaluation.trainingPrograms.length > 0 && (
                  <div className="bg-blue-50/40 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 p-4 rounded-xl text-xs">
                    <h3 className="font-bold text-blue-800 dark:text-blue-400 mb-3 flex items-center gap-2 text-sm">
                      <i className="fas fa-graduation-cap"></i>
                      <span>{t('eval.trainingRecommended')}</span>
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {myEvaluation.trainingPrograms.map((tp, i) => (
                        <div key={tp.id || i} className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                          <div className="font-bold text-slate-800 dark:text-slate-200">{tp.programName}</div>
                          <div className="text-slate-500 mt-1">{t('eval.duration')} {tp.timePeriod}</div>
                          <div className="text-slate-500">{t('eval.place')} {tp.trainingPlace}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Acknowledgement Status Section */}
                <div className="p-5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                  {myEvaluation.employeeSigned ? (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-lg">
                        <i className="fas fa-check-double"></i>
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white text-sm">
                          {t('eval.ackSignedTitle')}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {t('eval.by')} {myEvaluation.employeeSignature} • {t('eval.dateLabel')} {myEvaluation.employeeSignedDate} • 
                          <span className={myEvaluation.employeeObjectionStatus === 'has_objections' ? 'text-amber-600 font-bold mx-1' : 'text-emerald-600 font-bold mx-1'}>
                            {myEvaluation.employeeObjectionStatus === 'has_objections' ? ` (${t('eval.hasObjections')})` : ` (${t('eval.noObjections')})`}
                          </span>
                        </div>
                        {myEvaluation.employeeComments && (
                          <div className="text-xs text-slate-600 dark:text-slate-300 mt-1 italic">
                            "{myEvaluation.employeeComments}"
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center text-lg animate-pulse">
                        <i className="fas fa-pen-alt"></i>
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white text-sm">
                          {t('eval.ackPendingTitle')}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {t('eval.ackPendingDesc')}
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => setAcknowledgingEvaluation(myEvaluation)}
                    className={`px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm shadow-md transition-all flex items-center gap-2 ${
                      myEvaluation.employeeSigned
                        ? 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-300'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/30 animate-bounce'
                    }`}
                  >
                    <i className="fas fa-signature"></i>
                    <span>{myEvaluation.employeeSigned ? t('eval.viewEditAck') : t('eval.signAckNow')}</span>
                  </button>
                </div>

              </div>
            ) : (
              <div className="text-center py-12 text-slate-400">
                <i className="fas fa-file-invoice text-4xl mb-3 opacity-40"></i>
                <p className="font-bold text-sm">{t(`eval.myEvalNotYet|year:${selectedYear}`)}</p>
                <p className="text-xs mt-1">{t('eval.myEvalNotYetDesc')}</p>
              </div>
            )}
          </div>
        )}

        {/* Supervisor / Admin Management Table & Cards */}
        {isSupervisorOrAdmin && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
            
            {/* Filter Bar */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              
              {/* Search */}
              <div className="relative w-full md:w-72">
                <i className={`fas fa-search absolute ${isEn ? 'left-3' : 'right-3'} top-3 text-slate-400 text-xs`}></i>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={t('eval.searchPlaceholder')}
                  className={`w-full ${isEn ? 'pl-9 pr-4' : 'pr-9 pl-4'} py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none`}
                />
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
                {/* Department Filter (Admin only or All) */}
                {isAdmin && (
                  <select
                    value={deptFilter}
                    onChange={(e) => setDeptFilter(e.target.value)}
                    className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 outline-none"
                  >
                    <option value="all">{t('eval.allDepartments')}</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                )}

                {/* Status Filter */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 outline-none"
                >
                  <option value="all">{t('eval.allStatuses')}</option>
                  <option value="draft">{t('eval.statusDraft')}</option>
                  <option value="published">{t('eval.statusPublished')}</option>
                  <option value="acknowledged">{t('eval.statusAcknowledged')}</option>
                </select>
              </div>
            </div>

            {/* Department Restricted Badge for Supervisors */}
            {!isAdmin && supervisorDepartment && (
              <div className="bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 px-3.5 py-2 rounded-xl text-xs flex items-center justify-between text-blue-800 dark:text-blue-300">
                <div className="flex items-center gap-2">
                  <i className="fas fa-shield-alt text-blue-600 dark:text-blue-400"></i>
                  <span>
                    {t(`eval.deptRestrictedNotice|dept:${supervisorDepartment.name}`)}
                  </span>
                </div>
                <span className="font-bold text-[11px] bg-white dark:bg-slate-850 px-2 py-0.5 rounded-lg border border-blue-200 dark:border-blue-800">
                  {departmentEmployees.length} {isEn ? 'Department Staff' : 'موظف في قسمك'}
                </span>
              </div>
            )}

            {/* Evaluations List */}
            {loading ? (
              <Loading />
            ) : filteredEvaluations.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <i className="fas fa-clipboard-list text-4xl mb-3 opacity-30"></i>
                <p className="font-bold text-sm">{t(`eval.noEvaluationsFound|year:${selectedYear}`)}</p>
                <button
                  onClick={() => {
                    setEditingEvaluation(null);
                    setIsFormModalOpen(true);
                  }}
                  className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors"
                >
                  {t('eval.addFirstEval')}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredEvaluations.map((ev) => {
                  const rating = getRatingGradeLabel(ev.ratingGrade, !isEn);
                  const dynamicEmpNumber = allUsers.find(u => u.id === ev.employeeId || u.name === ev.employeeName)?.employeeNumber || ev.employeeNumber;

                  return (
                    <div
                      key={ev.id}
                      className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-750 hover:border-blue-400 dark:hover:border-blue-500/50 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group"
                    >
                      <div>
                        {/* Top: Name & Status */}
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div>
                            <h3 className="font-bold text-slate-900 dark:text-white text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                              {ev.employeeName}
                            </h3>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                              {dynamicEmpNumber && <span>#{dynamicEmpNumber}</span>}
                              {ev.position && <span>• {ev.position}</span>}
                            </div>
                            {(ev.departmentName || ev.departmentId) && (
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                {getDeptDisplayName(ev.departmentName, ev.departmentId)}
                              </div>
                            )}
                          </div>

                          {/* Status Badge */}
                          <div>
                            {ev.status === 'draft' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                {isEn ? 'Draft' : 'مسودة'}
                              </span>
                            )}
                            {ev.status === 'published' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                                {isEn ? 'Awaiting Ack' : 'بانتظار الإقرار'}
                              </span>
                            )}
                            {ev.status === 'acknowledged' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                                <i className="fas fa-check-circle text-[9px]"></i>
                                <span>{isEn ? 'Acknowledged' : 'معتمد'}</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Score Circle & Rating Pill */}
                        <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl mb-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center shadow-inner">
                              <span className="text-lg font-black text-slate-900 dark:text-white leading-none">
                                {ev.totalScore}
                              </span>
                              <span className="text-[9px] text-slate-400">100</span>
                            </div>
                            <div>
                              <span className={`text-xs font-black px-2 py-0.5 rounded-md border ${rating.bg} ${rating.color}`}>
                                {rating.label}
                              </span>
                              <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1.5 flex-wrap">
                                <span>{ev.evaluationDate}</span>
                                {ev.supervisorName && (
                                  <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                    <i className={ev.evaluatorRole === 'manager' ? "fas fa-user-shield text-indigo-500 text-[9px]" : "fas fa-user-tie text-blue-500 text-[9px]"}></i>
                                    <span>
                                      {ev.evaluatorRole === 'manager' 
                                        ? (isEn ? `Dept. Head: ${ev.supervisorName}` : `رئيس القسم: ${ev.supervisorName}`)
                                        : (isEn ? `Supervisor: ${ev.supervisorName}` : `المشرف: ${ev.supervisorName}`)}
                                    </span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className={`${isEn ? 'text-right' : 'text-left'} text-[10px] text-slate-500 space-y-0.5`}>
                            <div>{isEn ? 'Knowl: ' : 'أداء: '}<span className="font-bold text-slate-700 dark:text-slate-300">{ev.section1Score}/40</span></div>
                            <div>{isEn ? 'Style: ' : 'سلوك: '}<span className="font-bold text-slate-700 dark:text-slate-300">{ev.section2Score}/40</span></div>
                            <div>{isEn ? 'Behav: ' : 'شخصي: '}<span className="font-bold text-slate-700 dark:text-slate-300">{ev.section3Score}/20</span></div>
                          </div>
                        </div>

                        {/* Employee Feedback indicator */}
                        {ev.employeeSigned && (
                          <div className="mb-3 p-2 bg-slate-50 dark:bg-slate-800/40 rounded-lg text-[10px] border border-slate-200 dark:border-slate-700/60">
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500">{isEn ? 'Employee Ack:' : 'إقرار الموظف:'}</span>
                              <span className={`font-bold ${ev.employeeObjectionStatus === 'has_objections' ? 'text-amber-600' : 'text-emerald-600'}`}>
                                {ev.employeeObjectionStatus === 'has_objections' ? (isEn ? '⚠️ Objections Noted' : '⚠️ يوجد اعتراضات') : (isEn ? '✓ Agreed' : '✓ موافق بدون اعتراضات')}
                              </span>
                            </div>
                            {ev.employeeComments && (
                              <div className="text-slate-600 dark:text-slate-400 mt-1 truncate italic">
                                "{ev.employeeComments}"
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Card Actions */}
                      <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                        <div className="flex items-center gap-1">
                          {/* Print / View A4 */}
                          <button
                            onClick={() => setPrintingEvaluation(ev)}
                            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-lg transition-colors"
                            title={t('eval.printOfficialA4')}
                          >
                            <i className="fas fa-print"></i>
                          </button>

                          {/* Edit */}
                          <button
                            onClick={() => {
                              setEditingEvaluation(ev);
                              setIsFormModalOpen(true);
                            }}
                            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-indigo-600 dark:text-indigo-400 rounded-lg transition-colors"
                            title={t('eval.editTooltip')}
                          >
                            <i className="fas fa-edit"></i>
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => handleDeleteEvaluation(ev.id, ev.employeeName)}
                            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-rose-500 hover:text-rose-700 rounded-lg transition-colors"
                            title={t('eval.deleteTooltip')}
                          >
                            <i className="fas fa-trash-alt"></i>
                          </button>
                        </div>

                        {/* Sign as Employee shortcut if supervisor is looking at own evaluation */}
                        {ev.employeeId === user?.uid && !ev.employeeSigned && (
                          <button
                            onClick={() => setAcknowledgingEvaluation(ev)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px] transition-colors"
                          >
                            {t('eval.signMyOwn')}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Form Modal (Create / Edit) with strictly filtered Department Staff */}
      {isFormModalOpen && (
        <EvaluationFormModal
          initialEvaluation={editingEvaluation}
          users={departmentEmployees}
          userDepartmentName={supervisorDepartment?.name}
          onClose={() => {
            setIsFormModalOpen(false);
            setEditingEvaluation(null);
          }}
          onSaved={() => {
            setIsFormModalOpen(false);
            setEditingEvaluation(null);
          }}
        />
      )}

      {/* Official A4 Print View Modal */}
      {printingEvaluation && (
        <EvaluationPrintView
          evaluation={printingEvaluation}
          users={allUsers}
          onClose={() => setPrintingEvaluation(null)}
        />
      )}

      {/* Employee Acknowledgement Modal */}
      {acknowledgingEvaluation && (
        <EmployeeAcknowledgeModal
          evaluation={acknowledgingEvaluation}
          onClose={() => setAcknowledgingEvaluation(null)}
          onAcknowledged={(updated) => {
            setAcknowledgingEvaluation(null);
          }}
        />
      )}

    </div>
  );
};
