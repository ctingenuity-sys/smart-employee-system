import { User, Department } from '../types';

export interface VisualStaffMember {
    id?: string;
    userId?: string;
    name: string;
    time?: string;
    role?: string;
    shiftType?: string;
    departmentId?: string;
}

/**
 * Normalizes Arabic / English names for fuzzy matching and deduplication
 */
export const normalizeStaffName = (text?: string): string => {
    if (!text) return '';
    let s = String(text).trim().toLowerCase();
    
    // Remove diacritics / tashkeel
    s = s.replace(/[\u064B-\u065F\u0670]/g, '');
    
    // Normalize Alefs (أ, إ, آ, ٱ -> ا)
    s = s.replace(/[أإآٱ]/g, 'ا');
    
    // Normalize Taa Marbuta (ة -> ه)
    s = s.replace(/ة/g, 'ه');
    
    // Normalize Yaa (ى -> ي)
    s = s.replace(/ى/g, 'ي');
    
    // Remove common titles/honorifics
    s = s.replace(/^(د\.?|د\/|دكتور[ة]?|dr\.?|dr\/|أ\.?|ا\/|استاذ[ة]?|فني|اخصائي[ة]?|ممرض[ة]?|مسؤول)\s+/i, '');
    
    // Normalize whitespace
    s = s.replace(/\s+/g, ' ').trim();
    return s;
};

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
    allowHidden?: boolean
): boolean => {
    if (!u) return false;

    const shouldAllowHidden = allowHidden !== undefined 
        ? allowHidden 
        : (typeof window !== 'undefined' && localStorage.getItem('show_hidden_employees') === 'true');

    // 1. If user is marked as hidden and shouldAllowHidden is false, exclude them
    if (u.isHidden && !shouldAllowHidden) {
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
    allowHidden?: boolean
): User[] => {
    const shouldAllowHidden = allowHidden !== undefined 
        ? allowHidden 
        : (typeof window !== 'undefined' && localStorage.getItem('show_hidden_employees') === 'true');

    const seen = new Set<string>();
    return (users || []).filter(u => {
        if (!isOperationalStaff(u, departments, shouldAllowHidden)) return false;
        const key = (u.id || u.email || u.name).trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

/**
 * Validates whether a given string is a genuine human staff name
 */
export const isValidStaffName = (name?: string): boolean => {
    if (!name || typeof name !== 'string') return false;
    const trimmed = name.trim();
    if (trimmed.length < 2) return false;
    
    // Pure numeric timestamps or IDs (e.g. 1764923465293)
    if (/^\d+$/.test(trimmed)) return false;
    
    // System generated exception/column prefixes
    if (/^(doc_ex_|vis_|col_|row_|temp_|custom_|init|undefined|null|\[object)/i.test(trimmed)) return false;
    
    // Structure key names
    const blacklistedKeys = [
        'columns', 'commonduties', 'doctordata', 'doctorcolumns', 
        'fridaycolumns', 'holidaycolumns', 'staff', 'generaldata', 
        'fridaydata', 'holidaydata', 'exceptions', 'ramadandata'
    ];
    if (blacklistedKeys.includes(trimmed.toLowerCase())) return false;
    
    // Must contain at least one Arabic or Latin letter
    return /[\p{L}\u0600-\u06FF]/u.test(trimmed);
};

/**
 * Extracts all visual staff members from a published monthly schedule or template
 */
export const extractVisualStaffFromDoc = (docData: any, defaultDeptId?: string): VisualStaffMember[] => {
    if (!docData || typeof docData !== 'object') return [];
    const staffMap = new Map<string, VisualStaffMember>();

    const deptId = docData.departmentId || defaultDeptId;

    const addStaff = (s: any, defaultRole?: string) => {
        if (!s) return;
        let name = '';
        let userId = '';
        let time = '';
        let shiftType = '';

        if (typeof s === 'string') {
            name = s.trim();
        } else if (typeof s === 'object') {
            name = (s.name || s.staffName || s.userName || '').trim();
            userId = (s.userId || s.uid || '').trim();
            time = s.time || '';
            shiftType = s.shiftType || '';
        }

        // Validate name strictly - do NOT fallback to numeric/system IDs as name!
        if (!isValidStaffName(name)) return;

        const norm = normalizeStaffName(name);
        const key = userId ? `id_${userId}` : `norm_${norm}`;

        if (!staffMap.has(key)) {
            staffMap.set(key, {
                id: userId || undefined,
                userId: userId || undefined,
                name: name,
                time: time || undefined,
                role: defaultRole || s.role || 'Staff',
                shiftType: shiftType || undefined,
                departmentId: deptId
            });
        }
    };

    const processStaffArray = (arr: any[], defaultRole?: string) => {
        if (!Array.isArray(arr)) return;
        arr.forEach(item => {
            if (!item) return;
            if (typeof item === 'string') {
                addStaff(item, defaultRole);
            } else if (item.name || item.staffName || item.userName) {
                addStaff(item, defaultRole);
            }
        });
    };

    const processColumns = (columns: any[], defaultRole?: string) => {
        if (!Array.isArray(columns)) return;
        columns.forEach(col => {
            if (!col || typeof col !== 'object') return;
            if (Array.isArray(col.staff)) {
                processStaffArray(col.staff, defaultRole);
            }
        });
    };

    const processCommonDuties = (duties: any[], defaultRole?: string) => {
        if (!Array.isArray(duties)) return;
        duties.forEach(duty => {
            if (!duty || typeof duty !== 'object') return;
            if (Array.isArray(duty.staff)) {
                processStaffArray(duty.staff, defaultRole);
            }
        });
    };

    const processDoctorRows = (rows: any[]) => {
        if (!Array.isArray(rows)) return;
        const metaKeys = new Set([
            'id', 'date', 'dateRange', 'startDate', 'endDate', 'note',
            'nightStartDate', 'nightEndDate', 'departmentId'
        ]);
        rows.forEach(row => {
            if (!row || typeof row !== 'object') return;
            Object.keys(row).forEach(key => {
                if (metaKeys.has(key)) return;
                const val = row[key];
                if (Array.isArray(val)) {
                    processStaffArray(val, 'doctor');
                } else if (val && typeof val === 'object' && (val.name || val.staffName)) {
                    addStaff(val, 'doctor');
                }
            });
        });
    };

    const processExceptions = (exceptions: any[]) => {
        if (!Array.isArray(exceptions)) return;
        exceptions.forEach(ex => {
            if (!ex || typeof ex !== 'object') return;
            if (Array.isArray(ex.columns)) processColumns(ex.columns);
            if (Array.isArray(ex.commonDuties)) processCommonDuties(ex.commonDuties);
            if (Array.isArray(ex.doctorData)) processDoctorRows(ex.doctorData);
        });
    };

    // 1. General Data columns
    processColumns(docData.generalData);
    // 2. Common Duties
    processCommonDuties(docData.commonDuties);
    // 3. Friday Data
    processColumns(docData.fridayData);
    // 4. Holiday Data
    processColumns(docData.holidayData);
    // 5. Ramadan Data
    processColumns(docData.ramadanData);
    // 6. Ramadan Common Duties
    processCommonDuties(docData.ramadanCommonDuties);
    // 7. Ramadan Friday Data
    processColumns(docData.ramadanFridayData);
    // 8. Doctor Data
    processDoctorRows(docData.doctorData);
    // 9. Doctor Friday Data
    processDoctorRows(docData.doctorFridayData);
    // 10. Exceptions
    processExceptions(docData.exceptions);

    return Array.from(staffMap.values());
};

/**
 * Extracts all distinct visual staff members for a specific department (or all) across all published schedules and templates
 */
export const getVisualStaffForDepartment = (
    monthlyPublishes: Record<string, any> | any[],
    scheduleTemplates: any[] = [],
    targetDeptId?: string | null
): VisualStaffMember[] => {
    const combined = new Map<string, VisualStaffMember>();

    const processDoc = (docId: string, data: any) => {
        if (!data) return;
        const docDept = data.departmentId || (docId.includes('_') ? docId.split('_')[0] : null);
        
        // If targetDeptId is specified, check if doc matches
        if (targetDeptId) {
            const matchesDept = docDept === targetDeptId || 
                               (targetDeptId === 'legacy_radiology' && !docDept) ||
                               docId.startsWith(`${targetDeptId}_`);
            if (!matchesDept) return;
        }

        const staffList = extractVisualStaffFromDoc(data, docDept || targetDeptId || undefined);
        staffList.forEach(s => {
            const norm = normalizeStaffName(s.name);
            const key = s.userId ? `id_${s.userId}` : `norm_${norm}`;
            if (!combined.has(key)) {
                combined.set(key, s);
            }
        });
    };

    // Process monthly publishes
    if (Array.isArray(monthlyPublishes)) {
        monthlyPublishes.forEach(d => processDoc(d.id || '', d.data ? d.data() : d));
    } else if (monthlyPublishes && typeof monthlyPublishes === 'object') {
        Object.entries(monthlyPublishes).forEach(([id, data]) => processDoc(id, data));
    }

    // Process templates
    if (Array.isArray(scheduleTemplates)) {
        scheduleTemplates.forEach(t => processDoc(t.id || '', t));
    }

    return Array.from(combined.values());
};

/**
 * Filters a list of Users to only those who are actively present in the Visual View / Department
 */
export const filterUsersByVisualStaff = (
    users: User[],
    visualStaff: VisualStaffMember[],
    targetDeptId?: string | null,
    departments?: Department[]
): User[] => {
    // 1. Base operational filter (exclude admins, supervisors, managers, hidden accounts, dedicated machines)
    const operationalUsers = getOperationalStaffList(users, departments).filter(u => {
        return isValidStaffName(u.name);
    });

    // 2. If no target department is specified, return all valid operational users
    if (!targetDeptId) {
        return operationalUsers;
    }

    // 3. Operational users explicitly assigned to this department
    const deptAssignedUsers = operationalUsers.filter(u => 
        u.departmentId === targetDeptId ||
        (Array.isArray(u.departments) && u.departments.includes(targetDeptId)) ||
        (targetDeptId === 'legacy_radiology' && !u.departmentId)
    );

    // 4. If no visual staff found for this department, return the assigned operational users
    if (!visualStaff || visualStaff.length === 0) {
        return deptAssignedUsers;
    }

    // 5. Match operational users with visual staff members
    const matchedUsers: User[] = [];
    const seenIds = new Set<string>();

    // First include assigned users
    deptAssignedUsers.forEach(u => {
        seenIds.add(u.id);
        matchedUsers.push(u);
    });

    // Then check if any visual staff maps to another operational user (e.g. cross-department shift or legacy naming)
    visualStaff.forEach(vStaff => {
        const normVName = normalizeStaffName(vStaff.name);
        if (!normVName) return;

        const foundUser = operationalUsers.find(u => {
            if (seenIds.has(u.id)) return false;
            
            // ID match
            if (vStaff.userId && (u.id === vStaff.userId || (u as any).uid === vStaff.userId)) {
                return true;
            }
            
            // Name match
            if (u.name) {
                const normUName = normalizeStaffName(u.name);
                if (normUName === normVName) return true;
                if (normUName.length >= 4 && normVName.length >= 4) {
                    return normUName.includes(normVName) || normVName.includes(normUName);
                }
            }
            return false;
        });

        if (foundUser && !seenIds.has(foundUser.id)) {
            seenIds.add(foundUser.id);
            matchedUsers.push(foundUser);
        }
    });

    return matchedUsers;
};
