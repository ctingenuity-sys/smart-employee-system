import { User, UserRole } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useDepartment } from '../contexts/DepartmentContext';

export const useFilteredUsers = (users: User[]) => {
    const { role: authRole, user: currentUser } = useAuth();
    const { selectedDepartmentId } = useDepartment();

    return users.filter(u => {
        if (authRole === UserRole.ADMIN) return true;
        
        // Doctor filtering logic
        const isAuthDoctor = (authRole && authRole.toLowerCase() === UserRole.DOCTOR.toLowerCase()) || (currentUser?.jobCategory && currentUser.jobCategory.toLowerCase() === 'doctor');
        const isUserDoctor = (u.role && u.role.toLowerCase() === UserRole.DOCTOR.toLowerCase()) || (u.jobCategory && u.jobCategory.toLowerCase() === 'doctor');
        
        if (isAuthDoctor) {
            if (!isUserDoctor) return false;
        } else {
            if (isUserDoctor) return false;
        }
        
        if (authRole === UserRole.SUPERVISOR) {
            return u.departmentId === selectedDepartmentId || u.supervisorId === currentUser?.uid;
        } else if (authRole === UserRole.MANAGER) {
            return u.departmentId === selectedDepartmentId || u.managerId === currentUser?.uid;
        } else if (authRole === UserRole.USER) {
            return u.departmentId === currentUser?.departmentId;
        }
        
        return false;
    });
};
