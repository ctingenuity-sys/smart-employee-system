
import React, { useState } from 'react';

interface StaffUser {
    id: string;
    name: string;
    email: string;
    role: string;
}

interface StaffSidebarProps {
    users: StaffUser[];
}

const StaffSidebar: React.FC<StaffSidebarProps> = ({ users }) => {
    const [search, setSearch] = useState('');

    const filteredUsers = users.filter(u => 
        (u.name && u.name.toLowerCase().includes(search.toLowerCase())) || 
        (u.email && u.email.toLowerCase().includes(search.toLowerCase()))
    );

    const handleDragStart = (e: React.DragEvent, user: StaffUser) => {
        // Send JSON data with ID and Name
        const data = JSON.stringify({ id: user.id, name: user.name || user.email });
        
        // 1. Custom type for our app
        e.dataTransfer.setData('application/react-dnd-staff', data);
        
        // 2. Fallback type for browser compatibility
        e.dataTransfer.setData('text/plain', user.name || user.email);
        
        // 3. Allow both copy and move to ensure compatibility with various drop zones
        e.dataTransfer.effectAllowed = 'copyMove';
    };

    return (
        <div className="w-64 bg-white border-r border-gray-200 flex flex-col h-full print:hidden">
            <div className="p-4 border-b border-gray-100">
                <h3 className="font-bold text-slate-800 mb-2">قائمة الموظفين</h3>
                <div className="relative">
                    <i className="fas fa-search absolute right-3 top-2.5 text-gray-400 text-xs"></i>
                    <input 
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg py-2 pr-8 pl-2 text-xs focus:ring-2 focus:ring-blue-100 outline-none"
                        placeholder="بحث بالاسم..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {filteredUsers.map(user => (
                    <div 
                        key={user.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, user)}
                        className="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md hover:border-blue-300 cursor-grab active:cursor-grabbing transition-all group"
                    >
                        <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs group-hover:bg-blue-600 group-hover:text-white transition-colors">
                            {user.name ? user.name.charAt(0) : '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <h4 className="text-xs font-bold text-slate-700 truncate">{user.name || 'بدون اسم'}</h4>
                            <p className="text-[10px] text-slate-400 truncate">{user.role}</p>
                        </div>
                        <i className="fas fa-grip-vertical text-gray-300 text-xs opacity-0 group-hover:opacity-100"></i>
                    </div>
                ))}
                {filteredUsers.length === 0 && (
                    <div className="text-center py-8 text-gray-400 text-xs">
                        لا يوجد نتائج
                    </div>
                )}
            </div>
            
            <div className="p-3 bg-slate-50 border-t border-gray-200 text-[10px] text-slate-400 text-center">
                اسحب الموظف وأفلته في الجدول
            </div>
        </div>
    );
};

export default StaffSidebar;
