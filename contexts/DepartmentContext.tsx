import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { db } from '../firebase';
import { collection, getDocs, query, orderBy, onSnapshot } from 'firebase/firestore';
import { Department, UserRole, User } from '../types';
import { VisualStaffMember, getVisualStaffForDepartment, filterUsersByVisualStaff } from '../utils/staffUtils';

interface DepartmentContextType {
    departments: Department[];
    selectedDepartmentId: string | null;
    setSelectedDepartmentId: (id: string | null) => void;
    loadingDepartments: boolean;
    monthlyPublishes: Record<string, any>;
    scheduleTemplates: any[];
    isVisualLoaded: boolean;
    getDepartmentVisualStaff: (deptId?: string | null) => VisualStaffMember[];
    filterVisualUsers: (users: User[], deptId?: string | null) => User[];
}

const DepartmentContext = createContext<DepartmentContextType>({
    departments: [],
    selectedDepartmentId: null,
    setSelectedDepartmentId: () => {},
    loadingDepartments: true,
    monthlyPublishes: {},
    scheduleTemplates: [],
    isVisualLoaded: false,
    getDepartmentVisualStaff: () => [],
    filterVisualUsers: (users) => users,
});

export const useDepartment = () => useContext(DepartmentContext);

export const DepartmentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, role, departmentId } = useAuth();
    const [departments, setDepartments] = useState<Department[]>([]);
    const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(null);
    const [loadingDepartments, setLoadingDepartments] = useState(true);

    const [monthlyPublishes, setMonthlyPublishes] = useState<Record<string, any>>({});
    const [scheduleTemplates, setScheduleTemplates] = useState<any[]>([]);
    const [isVisualLoaded, setIsVisualLoaded] = useState(false);

    useEffect(() => {
        const fetchDepartments = async () => {
            try {
                const q = query(collection(db, 'departments'), orderBy('name'));
                const snap = await getDocs(q);
                const depts = snap.docs.map(d => ({ ...d.data(), id: d.id } as Department));
                
                // Ensure "Radiology" exists for legacy data if no departments exist
                if (depts.length === 0) {
                    const legacyDept: Department = { id: 'legacy_radiology', name: 'الأشعة (Radiology)' };
                    depts.push(legacyDept);
                }

                setDepartments(depts);

                // Set default selected department
                if (role === UserRole.ADMIN) {
                    // Admin can see all, default to all
                    const saved = localStorage.getItem('selected_department_id');
                    if (saved && depts.find(d => d.id === saved)) {
                        setSelectedDepartmentId(saved);
                    } else {
                        setSelectedDepartmentId(null);
                    }
                } else {
                    // Supervisor/Manager/User locked to their department
                    // Check if they manage any department first
                    const managedDept = depts.find(d => d.managerId === user?.uid);
                    if (managedDept) {
                        setSelectedDepartmentId(managedDept.id);
                    } else if (departmentId) {
                        setSelectedDepartmentId(departmentId);
                    } else {
                        // Fallback to legacy if they don't have a department assigned yet
                        setSelectedDepartmentId(depts[0]?.id || null);
                    }
                }
            } catch (error) {
                console.error("Error fetching departments:", error);
            } finally {
                setLoadingDepartments(false);
            }
        };

        fetchDepartments();
    }, [role, departmentId, user]);

    // Real-time synchronization of Visual View Published Schedules and Templates
    useEffect(() => {
        let isSubscribed = true;

        const unsubPublishes = onSnapshot(collection(db, 'monthly_publishes'), (snap) => {
            if (!isSubscribed) return;
            const publishesMap: Record<string, any> = {};
            snap.forEach(doc => {
                publishesMap[doc.id] = doc.data();
            });
            setMonthlyPublishes(publishesMap);
            setIsVisualLoaded(true);
        }, (err) => {
            console.warn("Could not stream monthly_publishes:", err);
            setIsVisualLoaded(true);
        });

        const unsubTemplates = onSnapshot(collection(db, 'schedule_templates'), (snap) => {
            if (!isSubscribed) return;
            const templates = snap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
            setScheduleTemplates(templates);
        }, (err) => {
            console.warn("Could not stream schedule_templates:", err);
        });

        return () => {
            isSubscribed = false;
            unsubPublishes();
            unsubTemplates();
        };
    }, []);

    // Helper: Extract visual staff for a department
    const getDepartmentVisualStaff = useCallback((deptId?: string | null): VisualStaffMember[] => {
        const target = deptId !== undefined ? deptId : selectedDepartmentId;
        return getVisualStaffForDepartment(monthlyPublishes, scheduleTemplates, target);
    }, [monthlyPublishes, scheduleTemplates, selectedDepartmentId]);

    // Helper: Filter a user list strictly to Visual View staff for the given department
    const filterVisualUsers = useCallback((users: User[], deptId?: string | null): User[] => {
        const target = deptId !== undefined ? deptId : selectedDepartmentId;
        const visualStaff = getDepartmentVisualStaff(target);
        return filterUsersByVisualStaff(users, visualStaff, target, departments);
    }, [getDepartmentVisualStaff, selectedDepartmentId, departments]);

    // Save admin selection
    useEffect(() => {
        if (role === UserRole.ADMIN && selectedDepartmentId) {
            localStorage.setItem('selected_department_id', selectedDepartmentId);
        }
    }, [selectedDepartmentId, role]);

    return (
        <DepartmentContext.Provider value={{ 
            departments, 
            selectedDepartmentId, 
            setSelectedDepartmentId, 
            loadingDepartments,
            monthlyPublishes,
            scheduleTemplates,
            isVisualLoaded,
            getDepartmentVisualStaff,
            filterVisualUsers
        }}>
            {children}
        </DepartmentContext.Provider>
    );
};
