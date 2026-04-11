import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { db } from '../firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { Department, UserRole } from '../types';

interface DepartmentContextType {
    departments: Department[];
    selectedDepartmentId: string | null;
    setSelectedDepartmentId: (id: string | null) => void;
    loadingDepartments: boolean;
}

const DepartmentContext = createContext<DepartmentContextType>({
    departments: [],
    selectedDepartmentId: null,
    setSelectedDepartmentId: () => {},
    loadingDepartments: true,
});

export const useDepartment = () => useContext(DepartmentContext);

export const DepartmentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, role, departmentId } = useAuth();
    const [departments, setDepartments] = useState<Department[]>([]);
    const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(null);
    const [loadingDepartments, setLoadingDepartments] = useState(true);

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
                    // Admin can see all, default to first or a specific one
                    const saved = localStorage.getItem('selected_department_id');
                    if (saved && depts.find(d => d.id === saved)) {
                        setSelectedDepartmentId(saved);
                    } else if (depts.length > 0) {
                        setSelectedDepartmentId(depts[0].id);
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

    // Save admin selection
    useEffect(() => {
        if (role === UserRole.ADMIN && selectedDepartmentId) {
            localStorage.setItem('selected_department_id', selectedDepartmentId);
        }
    }, [selectedDepartmentId, role]);

    return (
        <DepartmentContext.Provider value={{ departments, selectedDepartmentId, setSelectedDepartmentId, loadingDepartments }}>
            {children}
        </DepartmentContext.Provider>
    );
};
