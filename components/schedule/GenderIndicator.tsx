import React from 'react';
import { User, VisualStaff } from '../../types';

export type GenderType = 'male' | 'female';

/**
 * Resolves the gender of a staff member either from their own object or by looking up in a list of users.
 */
export const resolveUserGender = (
    staffOrName: VisualStaff | User | string | undefined | null,
    allUsers?: User[]
): GenderType | undefined => {
    if (!staffOrName) return undefined;

    // Direct string passed
    if (typeof staffOrName === 'string') {
        const clean = staffOrName.trim().toLowerCase();
        if (!clean || !allUsers || allUsers.length === 0) return undefined;
        const found = allUsers.find(u => 
            (u.name && u.name.trim().toLowerCase() === clean) ||
            (u.id && u.id.toLowerCase() === clean) ||
            (u.employeeNumber && u.employeeNumber.trim().toLowerCase() === clean)
        );
        return found?.gender;
    }

    // Object passed (VisualStaff or User)
    if ('gender' in staffOrName && staffOrName.gender) {
        return staffOrName.gender as GenderType;
    }

    // Check by userId or id in allUsers
    if (allUsers && allUsers.length > 0) {
        const targetId = ('userId' in staffOrName ? staffOrName.userId : undefined) || ('id' in staffOrName ? (staffOrName as User).id : undefined);
        const targetName = staffOrName.name ? staffOrName.name.trim().toLowerCase() : '';

        const found = allUsers.find(u => 
            (targetId && u.id === targetId) ||
            (targetName && u.name && u.name.trim().toLowerCase() === targetName)
        );
        if (found?.gender) {
            return found.gender as GenderType;
        }
    }

    return undefined;
};

interface GenderBadgeProps {
    gender?: GenderType | string | null;
    variant?: 'pill' | 'mini' | 'dot' | 'icon';
    showLabel?: boolean;
    isAr?: boolean;
    className?: string;
}

/**
 * Visual badge for differentiating male vs female staff members
 */
export const GenderBadge: React.FC<GenderBadgeProps> = ({
    gender,
    variant = 'pill',
    showLabel = true,
    isAr = true,
    className = ''
}) => {
    if (!gender || (gender !== 'male' && gender !== 'female')) {
        return null;
    }

    const isFemale = gender === 'female';

    if (variant === 'dot') {
        return (
            <span
                title={isFemale ? (isAr ? 'أنثى' : 'Female') : (isAr ? 'ذكر' : 'Male')}
                className={`inline-block w-2 h-2 rounded-full shrink-0 ${isFemale ? 'bg-pink-500 ring-2 ring-pink-200' : 'bg-sky-500 ring-2 ring-sky-200'} ${className}`}
            />
        );
    }

    if (variant === 'mini') {
        return (
            <span
                title={isFemale ? (isAr ? 'أنثى' : 'Female') : (isAr ? 'ذكر' : 'Male')}
                className={`inline-flex items-center justify-center font-bold font-mono px-1 py-0.2 text-[10px] rounded leading-none border shrink-0 transition-transform ${
                    isFemale
                        ? 'bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950/60 dark:text-pink-300 dark:border-pink-800'
                        : 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800'
                } ${className}`}
            >
                {isFemale ? '♀' : '♂'}
                {showLabel && (
                    <span className="ms-0.5 text-[9px] font-sans">
                        {isFemale ? (isAr ? 'أنثى' : 'F') : (isAr ? 'ذكر' : 'M')}
                    </span>
                )}
            </span>
        );
    }

    if (variant === 'icon') {
        return (
            <span
                title={isFemale ? (isAr ? 'أنثى' : 'Female') : (isAr ? 'ذكر' : 'Male')}
                className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-black shadow-2xs shrink-0 ${
                    isFemale
                        ? 'bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-300'
                        : 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300'
                } ${className}`}
            >
                {isFemale ? '♀' : '♂'}
            </span>
        );
    }

    // Default 'pill' variant
    return (
        <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black tracking-wide border shadow-2xs shrink-0 ${
                isFemale
                    ? 'bg-pink-50/90 text-pink-700 border-pink-200/80 dark:bg-pink-950/50 dark:text-pink-300 dark:border-pink-800/80'
                    : 'bg-sky-50/90 text-sky-700 border-sky-200/80 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800/80'
            } ${className}`}
        >
            <span className="text-xs font-bold leading-none">{isFemale ? '♀' : '♂'}</span>
            {showLabel && (
                <span className="font-sans leading-tight">
                    {isFemale ? (isAr ? 'أنثى' : 'Female') : (isAr ? 'ذكر' : 'Male')}
                </span>
            )}
        </span>
    );
};

interface GenderFilterSegmentProps {
    current: 'all' | 'male' | 'female';
    onChange: (val: 'all' | 'male' | 'female') => void;
    counts?: { all: number; male: number; female: number };
    isAr?: boolean;
    size?: 'sm' | 'md';
}

/**
 * Filter control bar for quickly switching between All / Males / Females
 */
export const GenderFilterSegment: React.FC<GenderFilterSegmentProps> = ({
    current,
    onChange,
    counts,
    isAr = true,
    size = 'sm'
}) => {
    const isSm = size === 'sm';
    return (
        <div className="inline-flex items-center p-0.5 rounded-xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 shadow-2xs">
            <button
                type="button"
                onClick={() => onChange('all')}
                className={`flex items-center gap-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                    isSm ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm'
                } ${
                    current === 'all'
                        ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-xs font-black'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
            >
                <i className="fas fa-users text-[11px] opacity-70"></i>
                <span>{isAr ? 'الكل' : 'All'}</span>
                {counts && (
                    <span className="text-[10px] font-mono font-black opacity-80 px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-600">
                        {counts.all}
                    </span>
                )}
            </button>

            <button
                type="button"
                onClick={() => onChange('male')}
                className={`flex items-center gap-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                    isSm ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm'
                } ${
                    current === 'male'
                        ? 'bg-sky-500 text-white shadow-xs font-black'
                        : 'text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400'
                }`}
            >
                <span className="text-[11px] font-bold">♂</span>
                <span>{isAr ? 'الذكور' : 'Males'}</span>
                {counts && (
                    <span className={`text-[10px] font-mono font-black px-1 py-0.2 rounded ${current === 'male' ? 'bg-sky-600 text-white' : 'bg-slate-100 dark:bg-slate-600'}`}>
                        {counts.male}
                    </span>
                )}
            </button>

            <button
                type="button"
                onClick={() => onChange('female')}
                className={`flex items-center gap-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                    isSm ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm'
                } ${
                    current === 'female'
                        ? 'bg-pink-500 text-white shadow-xs font-black'
                        : 'text-slate-500 dark:text-slate-400 hover:text-pink-600 dark:hover:text-pink-400'
                }`}
            >
                <span className="text-[11px] font-bold">♀</span>
                <span>{isAr ? 'الإناث' : 'Females'}</span>
                {counts && (
                    <span className={`text-[10px] font-mono font-black px-1 py-0.2 rounded ${current === 'female' ? 'bg-pink-600 text-white' : 'bg-slate-100 dark:bg-slate-600'}`}>
                        {counts.female}
                    </span>
                )}
            </button>
        </div>
    );
};
