
import React from 'react';

interface PrintHeaderProps {
  title?: string;
  subtitle?: string;
  departmentName?: string; // Added prop for dynamic department
  dateRange?: string;
  month?: string;
  note?: string; // NEW PROP
  themeColor?: 'slate' | 'teal' | 'purple' | 'rose' | 'indigo' | 'violet' | 'blue' | 'amber' | 'cyan' | 'emerald'; 
  hideCoverageBadge?: boolean; 
  compact?: boolean; 
}

export const PrintHeader: React.FC<PrintHeaderProps> = ({ 
    title, 
    subtitle, 
    departmentName, // Use dynamic department
    dateRange, 
    month, 
    note,
    themeColor = 'slate',
    hideCoverageBadge = false,
    compact = false
}) => {
    // Format month title
    let displayMonth = month || "";
    if (month && month.includes("-")) {
        const dateObj = new Date(month + "-01");
        if (!isNaN(dateObj.getTime())) {
            displayMonth = dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        }
    }

    // Color Maps for Modern Look
    const colors = {
        slate: { primary: 'text-slate-900', border: 'border-slate-900', bg: 'bg-slate-900', light: 'bg-slate-50' },
        teal: { primary: 'text-teal-900', border: 'border-teal-800', bg: 'bg-teal-800', light: 'bg-teal-50' },
        purple: { primary: 'text-purple-900', border: 'border-purple-900', bg: 'bg-purple-900', light: 'bg-purple-50' },
        rose: { primary: 'text-rose-900', border: 'border-rose-900', bg: 'bg-rose-900', light: 'bg-rose-50' },
        indigo: { primary: 'text-indigo-900', border: 'border-indigo-900', bg: 'bg-indigo-900', light: 'bg-indigo-50' },
        violet: { primary: 'text-violet-900', border: 'border-violet-900', bg: 'bg-violet-900', light: 'bg-violet-50' },
        blue: { primary: 'text-blue-900', border: 'border-blue-900', bg: 'bg-blue-900', light: 'bg-blue-50' },
        amber: { primary: 'text-amber-900', border: 'border-amber-900', bg: 'bg-amber-900', light: 'bg-amber-50' },
        cyan: { primary: 'text-cyan-900', border: 'border-cyan-900', bg: 'bg-cyan-900', light: 'bg-cyan-50' },
        emerald: { primary: 'text-emerald-900', border: 'border-emerald-900', bg: 'bg-emerald-900', light: 'bg-emerald-50' },
    };

    const c = colors[themeColor] || colors.slate;

    // Compact styles vs Normal styles
    const headerHeightClass = compact ? 'mb-0.5' : 'mb-2';
    const topBarHeight = compact ? 'h-1 mb-1' : 'h-2 mb-4';
    const logoSize = compact ? 'w-10 h-10 text-base border' : 'w-20 h-20 text-3xl border-4';
    const titleSize = compact ? 'text-lg' : 'text-4xl';
    const deptSize = compact ? 'text-sm' : 'text-3xl';
    const subTextSize = compact ? 'text-[7px] mt-0 tracking-wide' : 'text-[10px] mt-1 tracking-[0.4em]';
    const badgePadding = compact ? 'py-0 px-2 text-[8px]' : 'py-1 px-3 text-[10px]';

    return (
        <div className={`hidden print:flex flex-col ${headerHeightClass} w-full break-inside-avoid print-color-adjust-exact font-serif`} dir="ltr">
            {/* Top Colored Bar */}
            <div className={`w-full ${c.bg} ${topBarHeight} rounded-sm opacity-90`}></div>

            <div className={`flex justify-between items-end border-b border-gray-800 ${compact ? 'pb-0.5 mb-0.5' : 'pb-2 mb-2'} relative`}>
                {/* Left: Branding with Logos */}
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3">
                        <img src="/old-logo.png" alt="Hospital Logo" className={`${compact ? 'w-10 h-10' : 'w-20 h-20'} object-contain`} />
                        <img src="/cbahi.png" alt="CBAHI Logo" className={`${compact ? 'w-8 h-8' : 'w-16 h-16'} object-contain`} />
                    </div>
                    <div className="flex flex-col justify-center">
                        <h1 className={`${compact ? 'text-sm' : 'text-2xl'} font-black text-blue-900 uppercase tracking-tight leading-none`}>AL JEDAANI HOSPITAL</h1>
                        <h1 className={`${compact ? 'text-[8px]' : 'text-[10px]'} font-bold text-blue-800 tracking-widest leading-none mt-1`}>AL SAFA DISTRICT</h1>
                        <h2 className={`${compact ? 'text-[9px]' : 'text-sm'} font-bold text-gray-600 uppercase tracking-widest leading-none mt-1`}>مستشفى الجدعاني</h2>
                        <h2 className={`${compact ? 'text-[9px]' : 'text-sm'} font-bold text-gray-500 tracking-widest leading-none mt-0.5`}>حي الصفــــا</h2>
                    </div>
                </div>
                
                {/* Center: Title Context */}
                <div className="text-center absolute left-1/2 transform -translate-x-1/2 bottom-0 w-full max-w-2xl">
                     <h1 className={`${titleSize} font-black ${c.primary} uppercase tracking-tight leading-none mb-1`}>{displayMonth || title || "REPORT"}</h1>
                     <div className="flex flex-col items-center gap-1">
                        {/* Note displayed here */}
                        {note && (
                            <div className="text-lg font-bold text-red-700 bg-red-50 border border-red-200 px-4 py-0.5 rounded-md uppercase tracking-tight leading-none print-color-adjust-exact">
                                {note}
                            </div>
                        )}
                        {dateRange && (
                             <div className={`text-[10px] font-bold text-gray-800 ${c.light} px-2 rounded-full border border-gray-300 inline-block uppercase tracking-wide leading-tight`}>
                                 {dateRange}
                             </div>
                        )}
                     </div>
                </div>

                {/* Right: Department Info */}
                <div className="text-right">
                    <div className="flex flex-col items-end">
                        <h1 className={`${deptSize} font-black ${c.primary} uppercase leading-none`}>{departmentName || "RADIOLOGY"}</h1>
                        <h2 className={`font-bold text-gray-400 uppercase mr-0.5 ${subTextSize}`}>Department</h2>
                    </div>
                    <div className={`mt-0.5 ${badgePadding} ${c.bg} text-white font-bold uppercase tracking-widest rounded-l-md shadow-sm`}>
                        {subtitle || "Duty Schedule"}
                    </div>
                </div>
            </div>
        </div>
    );
};

export const PrintFooter: React.FC<{ themeColor?: 'slate' | 'teal' | 'purple' | 'rose' | 'indigo' | 'violet' | 'blue' | 'amber' | 'cyan' | 'emerald' }> = ({ themeColor = 'slate' }) => {
    
    const colors = {
        slate: { text: 'text-slate-900', bg: 'bg-slate-900' },
        teal: { text: 'text-teal-900', bg: 'bg-teal-800' },
        purple: { text: 'text-purple-900', bg: 'bg-purple-800' },
        rose: { text: 'text-rose-900', bg: 'bg-rose-800' },
        indigo: { text: 'text-indigo-900', bg: 'bg-indigo-800' },
        violet: { text: 'text-violet-900', bg: 'bg-violet-800' },
        blue: { text: 'text-blue-900', bg: 'bg-blue-800' },
        amber: { text: 'text-amber-900', bg: 'bg-amber-800' },
        cyan: { text: 'text-cyan-900', bg: 'bg-cyan-800' },
        emerald: { text: 'text-emerald-900', bg: 'bg-emerald-800' },
    };
    const c = colors[themeColor] || colors.slate;

    return (
        <div className="hidden print:flex flex-col mt-1 w-full break-inside-avoid print-color-adjust-exact font-serif" dir="ltr">
             <div className={`w-full h-px ${c.bg} mb-1 opacity-20`}></div>
             
             <div className="flex justify-between items-end px-10 pb-0.5">
                 {/* Left Signature - Supervisor */}
                 <div className="text-center w-40">
                     <div className="h-6 border-b border-gray-800 mb-0.5"></div> 
                     <p className="text-[8px] font-black text-gray-900 uppercase tracking-wide"> Supervisor</p>
                 </div>
                 
                 {/* Right - Head of Dept */}
                 <div className="text-center w-40">
                     <div className="h-6 border-b border-gray-800 mb-0.5"></div>
                     <p className="font-bold text-[8px] text-gray-900 uppercase tracking-wider">Head of Department</p>
                 </div>
             </div>
             
             {/* Bottom Decoration */}
             <div className={`w-full h-0.5 ${c.bg} mt-0.5`}></div>
        </div>
    );
};
