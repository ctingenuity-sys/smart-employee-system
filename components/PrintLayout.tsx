
import React from 'react';

interface PrintHeaderProps {
  title?: string;
  subtitle?: string;
  dateRange?: string;
  month?: string;
  themeColor?: 'slate' | 'teal' | 'purple' | 'rose' | 'indigo'; 
  hideCoverageBadge?: boolean; 
}

export const PrintHeader: React.FC<PrintHeaderProps> = ({ 
    title, 
    subtitle, 
    dateRange, 
    month, 
    themeColor = 'slate',
    hideCoverageBadge = false
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
    };

    const c = colors[themeColor] || colors.slate;

    return (
        <div className="hidden print:flex flex-col mb-2 w-full break-inside-avoid print-color-adjust-exact font-serif" dir="ltr">
            {/* Top Colored Bar */}
            <div className={`w-full h-2 ${c.bg} mb-4 rounded-sm`}></div>

            <div className="flex justify-between items-end border-b-2 border-gray-800 pb-2 mb-2 relative">
                {/* Left: Branding */}
                <div className="flex items-center gap-4">
                    <div className={`w-20 h-20 ${c.bg} text-white flex flex-col items-center justify-center font-black rounded-xl border-4 border-double border-white shadow-sm ring-1 ring-black/10`}>
                        <span className="text-3xl leading-none tracking-tighter">AJ</span>
                        <span className="text-[9px] uppercase tracking-widest mt-1 opacity-90">Group</span>
                    </div>
                    <div>
                        <h1 className={`text-2xl font-black ${c.primary} uppercase tracking-tight leading-none`}>AL JEDAANI GROUP</h1>
                        <h2 className="text-sm font-bold text-gray-600 uppercase tracking-widest mt-0.5">OF HOSPITALS</h2>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="bg-gray-800 text-white text-[9px] font-bold px-2 py-0.5 rounded uppercase">Jeddah</span>
                        </div>
                    </div>
                </div>
                
                {/* Center: Title Context - Absolutely Centered */}
                <div className="text-center absolute left-1/2 transform -translate-x-1/2 bottom-2 w-full max-w-lg">
                     <h1 className={`text-4xl font-black ${c.primary} uppercase tracking-tight drop-shadow-sm`}>{displayMonth || title || "REPORT"}</h1>
                     {dateRange && (
                         <div className={`text-xs font-bold text-gray-800 ${c.light} px-4 py-0.5 rounded-full border border-gray-300 inline-block mt-1 uppercase tracking-wide shadow-sm`}>
                             {dateRange}
                         </div>
                     )}
                </div>

                {/* Right: Department Info */}
                <div className="text-right">
                    <div className="flex flex-col items-end">
                        <h1 className={`text-3xl font-black ${c.primary} uppercase leading-none`}>RADIOLOGY</h1>
                        <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.4em] mt-1 mr-0.5">Department</h2>
                    </div>
                    <div className={`mt-2 py-1 px-3 ${c.bg} text-white text-[10px] font-bold uppercase tracking-widest rounded-l-lg shadow-sm`}>
                        {subtitle || "Duty Schedule"}
                    </div>
                </div>
            </div>
            
            {/* REMOVED SUB-HEADER BANNER AS REQUESTED TO SAVE SPACE */}
        </div>
    );
};

export const PrintFooter: React.FC<{ themeColor?: 'slate' | 'teal' | 'purple' | 'rose' | 'indigo' }> = ({ themeColor = 'slate' }) => {
    
    const colors = {
        slate: { text: 'text-slate-900', bg: 'bg-slate-900' },
        teal: { text: 'text-teal-900', bg: 'bg-teal-800' },
        purple: { text: 'text-purple-900', bg: 'bg-purple-800' },
        rose: { text: 'text-rose-900', bg: 'bg-rose-800' },
        indigo: { text: 'text-indigo-900', bg: 'bg-indigo-800' },
    };
    const c = colors[themeColor] || colors.slate;

    return (
        <div className="hidden print:flex flex-col mt-4 w-full break-inside-avoid print-color-adjust-exact font-serif" dir="ltr">
             <div className={`w-full h-px ${c.bg} mb-4 opacity-20`}></div>
             
             <div className="flex justify-between items-end px-16 pb-2">
                 {/* Left Signature - Supervisor */}
                 <div className="text-center w-64">
                     <div className="h-12 border-b-2 border-gray-800 mb-1"></div> {/* Space for signature */}
                     <p className="text-[10px] font-black text-gray-900 uppercase tracking-wide">Radiology Supervisor</p>
                 </div>
                 
                 {/* Right - Head of Dept */}
                 <div className="text-center w-64">
                     <div className="h-12 border-b-2 border-gray-800 mb-1 flex justify-center items-end pb-1 opacity-20">
                     </div>
                     <h3 className={`font-black text-xs ${c.text} uppercase leading-none`}>DR. MOHAMED SHAFEE</h3>
                     <p className="font-bold text-[9px] text-gray-500 uppercase mt-0.5 tracking-wider">Head of Department</p>
                 </div>
             </div>
             
             {/* Bottom Decoration */}
             <div className={`w-full h-2 ${c.bg} mt-2`}></div>
        </div>
    );
};
