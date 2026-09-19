import React, { useState, useMemo } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { User } from '../../types';
import { GenderBadge, GenderFilterSegment } from './GenderIndicator';

interface StaffSidebarProps {
    users: User[];
    onOpenStaffHistory?: (user: User) => void;
}

const StaffSidebar: React.FC<StaffSidebarProps> = ({ users, onOpenStaffHistory }) => {
    const { language, dir } = useLanguage();
    const isAr = language === 'ar' || dir === 'rtl';
    const isEn = !isAr;

    const [search, setSearch] = useState('');
    const [genderFilter, setGenderFilter] = useState<'all' | 'male' | 'female'>('all');

    // Filter out supervisors and administrators unless desired
    const staffPool = useMemo(() => {
        return users.filter(u => !['admin', 'supervisor', 'manager'].includes(u.role));
    }, [users]);

    // Count statistics
    const counts = useMemo(() => {
        let male = 0;
        let female = 0;
        staffPool.forEach(u => {
            if (u.gender === 'female') female++;
            else if (u.gender === 'male') male++;
        });
        return {
            all: staffPool.length,
            male,
            female
        };
    }, [staffPool]);

    const filteredUsers = useMemo(() => {
        return staffPool.filter(u => {
            // Gender match
            if (genderFilter === 'male' && u.gender !== 'male') return false;
            if (genderFilter === 'female' && u.gender !== 'female') return false;

            // Search term match
            if (!search.trim()) return true;
            const q = search.toLowerCase().trim();
            const nameMatch = u.name && String(u.name).toLowerCase().includes(q);
            const emailMatch = u.email && String(u.email).toLowerCase().includes(q);
            const numMatch = u.employeeNumber && String(u.employeeNumber).toLowerCase().includes(q);
            const catMatch = u.jobCategory && String(u.jobCategory).toLowerCase().includes(q);
            return Boolean(nameMatch || emailMatch || numMatch || catMatch);
        });
    }, [staffPool, genderFilter, search]);

    const handleDragStart = (e: React.DragEvent, user: User) => {
        // Send JSON data with ID, Name, and Gender
        const data = JSON.stringify({
            id: user.id,
            name: user.name || user.email,
            gender: user.gender || (user.gender === 'female' ? 'female' : 'male')
        });
        
        // 1. Custom type for our app
        e.dataTransfer.setData('application/react-dnd-staff', data);
        
        // 2. Fallback type for browser compatibility
        e.dataTransfer.setData('text/plain', user.name || user.email);
        
        // 3. Allow both copy and move to ensure compatibility with various drop zones
        e.dataTransfer.effectAllowed = 'copyMove';
    };

    return (
        <div className="w-72 bg-white border-r border-slate-200 flex flex-col h-full print:hidden shadow-sm select-none">
            {/* Header */}
            <div className="p-3.5 border-b border-slate-100 bg-slate-50/80">
                <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center text-xs shadow-xs">
                            <i className="fas fa-users-cog"></i>
                        </div>
                        <h3 className="font-black text-slate-800 text-sm">
                            {isAr ? 'كادر الموظفين' : 'Staff Directory'}
                        </h3>
                    </div>
                    <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                        {filteredUsers.length} / {counts.all}
                    </span>
                </div>

                {/* Gender Quick Selector */}
                <div className="mb-2.5 flex justify-center">
                    <GenderFilterSegment
                        current={genderFilter}
                        onChange={setGenderFilter}
                        counts={counts}
                        isAr={isAr}
                        size="sm"
                    />
                </div>

                {/* Search Bar */}
                <div className="relative">
                    <i className="fas fa-search absolute right-3 top-2.5 text-slate-400 text-xs"></i>
                    <input 
                        className="w-full bg-white border border-slate-200 rounded-xl py-2 pr-8 pl-7 text-xs font-semibold focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none transition-all"
                        placeholder={isAr ? 'بحث بالاسم، الرقم، التخصص...' : 'Search staff or ID...'}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    {search && (
                        <button
                            onClick={() => setSearch('')}
                            className="absolute left-2.5 top-2.5 text-slate-400 hover:text-slate-600 text-xs"
                        >
                            <i className="fas fa-times"></i>
                        </button>
                    )}
                </div>
            </div>
            
            {/* Staff List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5 scrollbar-thin">
                {filteredUsers.map(user => {
                    const isFemale = user.gender === 'female';
                    const isMale = user.gender === 'male';

                    return (
                        <div 
                            key={user.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, user)}
                            className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all cursor-grab active:cursor-grabbing group hover:shadow-md ${
                                isFemale
                                    ? 'bg-pink-50/30 border-pink-100 hover:border-pink-300 hover:bg-pink-50/70'
                                    : isMale
                                    ? 'bg-sky-50/30 border-sky-100 hover:border-sky-300 hover:bg-sky-50/70'
                                    : 'bg-white border-slate-100 hover:border-blue-300'
                            }`}
                        >
                            {/* Avatar with gender color */}
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs shrink-0 shadow-2xs relative transition-transform group-hover:scale-105 ${
                                isFemale
                                    ? 'bg-pink-100 text-pink-700 ring-2 ring-pink-200/80'
                                    : isMale
                                    ? 'bg-sky-100 text-sky-700 ring-2 ring-sky-200/80'
                                    : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
                            }`}>
                                <span>{user.name ? user.name.charAt(0) : '?'}</span>
                                {isFemale && (
                                    <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-pink-500 text-white rounded-full text-[9px] flex items-center justify-center font-bold leading-none ring-1 ring-white">
                                        ♀
                                    </span>
                                )}
                                {isMale && (
                                    <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-sky-500 text-white rounded-full text-[9px] flex items-center justify-center font-bold leading-none ring-1 ring-white">
                                        ♂
                                    </span>
                                )}
                            </div>

                            {/* Staff Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1">
                                    <h4 className="text-xs font-bold text-slate-800 truncate">
                                        {user.name || (isAr ? 'بدون اسم' : 'Unnamed')}
                                    </h4>
                                    {onOpenStaffHistory && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onOpenStaffHistory(user);
                                            }}
                                            className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 text-[10px] transition-colors cursor-pointer shrink-0"
                                            title={isAr ? 'معاينة روتيشن آخر 6 شهور' : 'View 6-Month History'}
                                        >
                                            <i className="fas fa-history"></i>
                                        </button>
                                    )}
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <GenderBadge
                                        gender={user.gender}
                                        variant="mini"
                                        showLabel={true}
                                        isAr={isAr}
                                    />
                                    {user.employeeNumber && (
                                        <span className="text-[10px] font-mono text-slate-400 font-bold">
                                            #{user.employeeNumber}
                                        </span>
                                    )}
                                    {user.jobCategory && (
                                        <span className="text-[9px] font-semibold text-slate-400 truncate max-w-[80px]">
                                            {user.jobCategory}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <i className="fas fa-grip-vertical text-slate-300 text-xs opacity-0 group-hover:opacity-100 transition-opacity"></i>
                        </div>
                    );
                })}

                {filteredUsers.length === 0 && (
                    <div className="text-center py-10 px-4">
                        <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                            <i className="fas fa-user-slash text-sm"></i>
                        </div>
                        <p className="text-xs font-bold text-slate-500 mb-1">
                            {isAr ? 'لا يوجد موظفون مطابقون' : 'No staff matched'}
                        </p>
                        <p className="text-[10px] text-slate-400">
                            {isAr ? 'جرب تغيير شروط البحث أو الفلتر' : 'Try adjusting search or gender filter'}
                        </p>
                    </div>
                )}
            </div>
            
            {/* Footer Hint */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 text-[11px] font-bold text-slate-500 flex items-center justify-center gap-2">
                <i className="fas fa-hand-pointer text-blue-500 text-xs"></i>
                <span>{isAr ? 'اسحب الموظف وأفلته في خانة الجدول' : 'Drag & drop staff into schedule'}</span>
            </div>
        </div>
    );
};

export default StaffSidebar;
