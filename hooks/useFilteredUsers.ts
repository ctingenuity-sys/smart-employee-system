import { User, UserRole } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useDepartment } from '../contexts/DepartmentContext';

export const useFilteredUsers = (users: User[], overrideDeptId?: string | null) => {
    const { role: authRole, user: currentUser } = useAuth();
    const { selectedDepartmentId, filterVisualUsers } = useDepartment();

    const targetDeptId = overrideDeptId !== undefined ? overrideDeptId : selectedDepartmentId;

    // 1. Filter by Visual View staff according to department
    const visualUsers = filterVisualUsers(users, targetDeptId);

    // 2. Filter by Roles & Permissions
    return visualUsers.filter(u => {
        if (authRole === UserRole.ADMIN) {
            if (targetDeptId) {
                return (
                    u.departmentId === targetDeptId ||
                    (Array.isArray(u.departments) && u.departments.includes(targetDeptId)) ||
                    (targetDeptId === 'legacy_radiology' && !u.departmentId)
                );
            }
            return true;
        }
        
        // Doctor filtering logic
        const isAuthDoctor = (authRole && authRole.toLowerCase() === UserRole.DOCTOR.toLowerCase()) || (currentUser?.jobCategory && currentUser.jobCategory.toLowerCase() === 'doctor');
        const isUserDoctor = (u.role && u.role.toLowerCase() === UserRole.DOCTOR.toLowerCase()) || (u.jobCategory && u.jobCategory.toLowerCase() === 'doctor');
        
        if (isAuthDoctor) {
            if (!isUserDoctor) return false;
        } else {
            if (isUserDoctor) return false;
        }
        
        if (authRole === UserRole.SUPERVISOR) {
            return (
                u.departmentId === selectedDepartmentId || 
                (Array.isArray(u.departments) && u.departments.includes(selectedDepartmentId || '')) ||
                (selectedDepartmentId === 'legacy_radiology' && !u.departmentId) ||
                u.supervisorId === currentUser?.uid
            );
        } else if (authRole === UserRole.MANAGER) {
            return (
                u.departmentId === selectedDepartmentId || 
                (Array.isArray(u.departments) && u.departments.includes(selectedDepartmentId || '')) ||
                (selectedDepartmentId === 'legacy_radiology' && !u.departmentId) ||
                u.managerId === currentUser?.uid
            );
        } else if (authRole === UserRole.USER) {
            return (
                u.departmentId === currentUser?.departmentId ||
                (Array.isArray(u.departments) && u.departments.includes(currentUser?.departmentId || ''))
            );
        }
        
        return false;
    });
};
