import { User, UserRole } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useDepartment } from '../contexts/DepartmentContext';

export const useFilteredUsers = (users: User[], overrideDeptId?: string | null) => {
    const { role: authRole, user: currentUser } = useAuth();
    const { selectedDepartmentId, filterVisualUsers } = useDepartment();

    const targetDeptId = overrideDeptId !== undefined ? overrideDeptId : selectedDepartmentId;

    // 1. Filter by Visual View staff according to department
    const visualUsers = filterVisualUsers(users, targetDeptId);

    const matchesDept = (u: User, deptId?: string | null) => {
        if (!deptId) return true;
        return (
            u.departmentId === deptId ||
            (Array.isArray(u.departments) && u.departments.includes(deptId)) ||
            (deptId === 'legacy_radiology' && (!u.departmentId || u.departmentId === 'radiology' || u.departmentId === 'legacy_radiology')) ||
            (deptId === 'radiology' && (!u.departmentId || u.departmentId === 'radiology' || u.departmentId === 'legacy_radiology'))
        );
    };

    // 2. Filter by Roles & Permissions
    return visualUsers.filter(u => {
        const isUserDoctor = (u.role && u.role.toLowerCase() === UserRole.DOCTOR.toLowerCase()) || 
                             (u.jobCategory && u.jobCategory.toLowerCase() === 'doctor') ||
                             (u.name && (u.name.toLowerCase().startsWith('dr.') || u.name.toLowerCase().startsWith('dr ') || u.name.includes('د.')));

        if (authRole === UserRole.ADMIN) {
            if (targetDeptId) {
                return matchesDept(u, targetDeptId);
            }
            return true;
        }
        
        // Doctor filtering logic
        const isAuthDoctor = (authRole && authRole.toLowerCase() === UserRole.DOCTOR.toLowerCase()) || (currentUser?.jobCategory && currentUser.jobCategory.toLowerCase() === 'doctor');
        
        if (isAuthDoctor) {
            // Doctors only view doctor rosters and fellow doctors belonging to their department
            if (!isUserDoctor) return false;
            const deptId = targetDeptId || currentUser?.departmentId;
            return matchesDept(u, deptId);
        }
        
        const effectiveDept = targetDeptId || selectedDepartmentId || currentUser?.departmentId;

        if (authRole === UserRole.SUPERVISOR) {
            // Supervisors only manage and view staff/doctors belonging to the department
            if (matchesDept(u, effectiveDept)) return true;
            return u.supervisorId === currentUser?.uid;
        } else if (authRole === UserRole.MANAGER) {
            // Managers only manage and view staff/doctors belonging to the department
            if (matchesDept(u, effectiveDept)) return true;
            return u.managerId === currentUser?.uid;
        } else if (authRole === UserRole.USER) {
            const userDept = effectiveDept || currentUser?.departmentId;
            return matchesDept(u, userDept);
        }
        
        return false;
    });
};
