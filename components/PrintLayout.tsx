
import React from 'react';

interface PrintHeaderProps {
  title?: string;
  subtitle?: string;
  dateRange?: string;
  month?: string;
  note?: string; 
  themeColor?: 'slate' | 'teal' | 'purple' | 'rose' | 'indigo' | 'blue' | 'emerald' | 'amber' | 'violet' | 'cyan'; 
  hideCoverageBadge?: boolean; 
  compact?: boolean; 
}

export const PrintHeader: React.FC<PrintHeaderProps> = ({ 
    title, 
    subtitle, 
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

    // Color Maps: LIGHT PASTEL BACKGROUNDS, DARK TEXT
    const colors = {
        slate: { text: 'text-slate-800', sub: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-300', logoBg: 'bg-slate-800', badge: 'bg-slate-100 text-slate-800' },
        teal: { text: 'text-teal-900', sub: 'text-teal-700', bg: 'bg-teal-50', border: 'border-teal-200', logoBg: 'bg-teal-700', badge: 'bg-teal-100 text-teal-900' },
        purple: { text: 'text-purple-900', sub: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200', logoBg: 'bg-purple-700', badge: 'bg-purple-100 text-purple-900' },
        rose: { text: 'text-rose-900', sub: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200', logoBg: 'bg-rose-700', badge: 'bg-rose-100 text-rose-900' },
        indigo: { text: 'text-indigo-900', sub: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200', logoBg: 'bg-indigo-700', badge: 'bg-indigo-100 text-indigo-900' },
        blue: { text: 'text-blue-900', sub: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', logoBg: 'bg-blue-700', badge: 'bg-blue-100 text-blue-900' },
        emerald: { text: 'text-emerald-900', sub: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', logoBg: 'bg-emerald-700', badge: 'bg-emerald-100 text-emerald-900' },
        amber: { text: 'text-amber-900', sub: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', logoBg: 'bg-amber-600', badge: 'bg-amber-100 text-amber-900' },
        violet: { text: 'text-violet-900', sub: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200', logoBg: 'bg-violet-700', badge: 'bg-violet-100 text-violet-900' },
        cyan: { text: 'text-cyan-900', sub: 'text-cyan-700', bg: 'bg-cyan-50', border: 'border-cyan-200', logoBg: 'bg-cyan-700', badge: 'bg-cyan-100 text-cyan-900' },
    };

    // @ts-ignore
    const c = colors[themeColor] || colors.slate;

    // Compact styles vs Normal styles
    const headerHeightClass = compact ? 'mb-1' : 'mb-3';
    const logoSize = compact ? 'w-10 h-10 text-base' : 'w-20 h-20 text-3xl';
    const titleSize = compact ? 'text-lg' : 'text-4xl';
    const deptSize = compact ? 'text-sm' : 'text-3xl';
    const subTextSize = compact ? 'text-[7px] mt-0 tracking-wide' : 'text-[10px] mt-1 tracking-[0.4em]';
    const badgePadding = compact ? 'py-0 px-2 text-[8px]' : 'py-1 px-3 text-[10px]';
    const containerPadding = compact ? 'p-2 rounded-md' : 'p-4 rounded-xl';

    return (
        <div className={`hidden print:flex flex-col w-full break-inside-avoid print-color-adjust-exact font-serif ${headerHeightClass}`} dir="ltr">
            
            {/* Main Header Container - Light Background */}
            {/* Added pr-4 to prevent cutting off text on the right */}
            <div className={`flex justify-between items-end w-full ${c.bg} ${c.text} shadow-sm border ${c.border} ${containerPadding} relative print:pr-6`}>
                
                {/* Left: Branding */}
                <div className="flex items-center gap-3 relative z-10">
                    {/* Logo Box - Solid Color for Contrast */}
                    <div className={`${logoSize} ${c.logoBg} text-white flex flex-col items-center justify-center font-black rounded-lg shadow-sm border border-white/20`}>
                        <span className="leading-none tracking-tighter">AJ</span>
                    </div>
                    <div className="flex flex-col justify-center">
                        <h1 className={`${compact ? 'text-sm' : 'text-2xl'} font-black ${c.text} uppercase tracking-tight leading-none`}>AL JEDAANI GROUP</h1>
                        <h2 className={`${compact ? 'text-[9px]' : 'text-sm'} font-bold ${c.sub} uppercase tracking-widest leading-none`}>OF HOSPITALS</h2>
                    </div>
                </div>
                
                {/* Center: Title Context */}
                <div className="text-center absolute left-1/2 transform -translate-x-1/2 bottom-4 w-full max-w-2xl z-10">
                     <h1 className={`${titleSize} font-black ${c.text} uppercase tracking-tight leading-none mb-2`}>{displayMonth || title || "REPORT"}</h1>
                     <div className="flex flex-col items-center gap-1">
                        {/* Note displayed here */}
                        {note && (
                            <div className="text-lg font-bold text-red-600 bg-white border border-red-200 px-4 py-0.5 rounded-md uppercase tracking-tight leading-none print-color-adjust-exact shadow-sm">
                                {note}
                            </div>
                        )}
                        {dateRange && (
                             <div className={`text-[10px] font-bold ${c.sub} border ${c.border} bg-white/50 px-3 py-0.5 rounded-full inline-block uppercase tracking-wide leading-tight`}>
                                 {dateRange}
                             </div>
                        )}
                     </div>
                </div>

                {/* Right: Department Info */}
                <div className="text-right relative z-10 flex-shrink-0">
                    <div className="flex flex-col items-end">
                        {/* Removed leading-none on dept title to prevent clipping, added padding bottom */}
                        <h1 className={`${deptSize} font-black ${c.text} uppercase pb-1`}>RADIOLOGY</h1>
                        <h2 className={`font-bold ${c.sub} uppercase mr-0.5 ${subTextSize}`}>Department</h2>
                    </div>
                    {/* Subtitle Badge */}
                    <div className={`mt-2 ${badgePadding} ${c.badge} border ${c.border} font-bold uppercase tracking-widest rounded-md shadow-sm inline-block`}>
                        {subtitle || "Duty Schedule"}
                    </div>
                </div>
            </div>
            
            {/* Optional Bottom Line matching the theme color for separation */}
            <div className={`w-full h-1 ${c.logoBg} mt-1 opacity-50 rounded-full`}></div>
        </div>
    );
};

export const PrintFooter: React.FC<{ themeColor?: 'slate' | 'teal' | 'purple' | 'rose' | 'indigo' | 'blue' | 'emerald' | 'amber' | 'violet' | 'cyan' }> = ({ themeColor = 'slate' }) => {
    
    const colors = {
        slate: { text: 'text-slate-900', bg: 'bg-slate-900' },
        teal: { text: 'text-teal-900', bg: 'bg-teal-800' },
        purple: { text: 'text-purple-900', bg: 'bg-purple-800' },
        rose: { text: 'text-rose-900', bg: 'bg-rose-800' },
        indigo: { text: 'text-indigo-900', bg: 'bg-indigo-800' },
        blue: { text: 'text-blue-900', bg: 'bg-blue-800' },
        emerald: { text: 'text-emerald-900', bg: 'bg-emerald-800' },
        amber: { text: 'text-amber-900', bg: 'bg-amber-800' },
        violet: { text: 'text-violet-900', bg: 'bg-violet-800' },
        cyan: { text: 'text-cyan-900', bg: 'bg-cyan-800' },
    };
    // @ts-ignore
    const c = colors[themeColor] || colors.slate;

    return (
        <div className="hidden print:flex flex-col mt-1 w-full break-inside-avoid print-color-adjust-exact font-serif" dir="ltr">
             <div className={`w-full h-px ${c.bg} mb-1 opacity-20`}></div>
             
             <div className="flex justify-between items-end px-10 pb-0.5">
                 {/* Left Signature - Supervisor */}
                 <div className="text-center w-40">
                     <div className={`h-6 border-b ${c.bg} opacity-30 mb-0.5`}></div> 
                     <p className={`text-[8px] font-black ${c.text} uppercase tracking-wide`}> Supervisor</p>
                 </div>
                 
                 {/* Right - Head of Dept */}
                 <div className="text-center w-40">
                     <div className={`h-6 border-b ${c.bg} opacity-30 mb-0.5`}></div>
                     <h3 className={`font-black text-[9px] ${c.text} uppercase leading-none`}>DR. MOHAMED SHAFEE</h3>
                     <p className={`font-bold text-[7px] ${c.text} opacity-60 uppercase tracking-wider`}>Head of Department</p>
                 </div>
             </div>
             
             {/* Bottom Decoration */}
             <div className={`w-full h-1 ${c.bg} mt-0.5 rounded-full`}></div>
        </div>
    );
};
