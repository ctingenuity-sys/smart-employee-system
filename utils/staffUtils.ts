import { User, Department } from '../types';

/**
 * Checks if a user is an operational employee (Doctor, Specialist, Technician, Nurse, Reception, Worker, Custody Clerk, etc.)
 * Excludes:
 * - Admin, Supervisor, Manager roles
 * - Standalone/Individual tool accounts (e.g. Cath Lab dedicated calculator)
 * - Users with excludeFromCount / isIndividualAccount flags
 * - Hidden users
 */
export const isOperationalStaff = (
    u: User | null | undefined, 
    departments?: Department[],
    allowHidden: boolean = false
): boolean => {
    if (!u) return false;

    // 1. If user is marked as hidden and allowHidden is false, exclude them
    if (u.isHidden && !allowHidden) {
        return false;
    }

    // 2. ALWAYS Exclude standalone / individual tools / dedicated accounts
    if (u.isIndividualAccount || u.excludeFromCount || u.role === 'cath_lab') {
        return false;
    }

    // 3. ALWAYS Exclude management roles (Admin, Supervisor, Manager, etc.)
    const roleStr = String(u.role || '').trim().toLowerCase();
    const managementRoles = ['admin', 'supervisor', 'manager', 'head_department', 'head_dept', 'مشرف', 'مدير', 'ادمن', 'مسؤول'];
    if (managementRoles.some(r => roleStr === r || roleStr.includes(r))) {
        return false;
    }

    // 4. ALWAYS Exclude by job category if categorized as management
    const catStr = String(u.jobCategory || '').trim().toLowerCase();
    if (managementRoles.some(r => catStr === r || catStr.includes(r))) {
        return false;
    }

    // 5. ALWAYS Exclude by direct boolean flags for management
    if ((u as any).isAdmin || (u as any).isSupervisor || (u as any).isManager) {
        return false;
    }

    // 6. ALWAYS Exclude if user is the assigned manager/supervisor of a department
    if (departments && departments.length > 0) {
        const isDeptManager = departments.some(d => d.managerId === u.id || d.managerId === u.uid || (d as any).supervisorId === u.id || (d as any).supervisorId === u.uid);
        if (isDeptManager && (roleStr === 'admin' || roleStr === 'supervisor' || roleStr === 'manager' || !u.jobCategory)) {
            return false;
        }
    }

    return true;
};

/**
 * Deduplicates and filters users to only include operational staff
 */
export const getOperationalStaffList = (
    users: User[], 
    departments?: Department[],
    allowHidden: boolean = false
): User[] => {
    const seen = new Set<string>();
    return (users || []).filter(u => {
        if (!isOperationalStaff(u, departments, allowHidden)) return false;
        const key = (u.id || u.email || u.name).trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};
