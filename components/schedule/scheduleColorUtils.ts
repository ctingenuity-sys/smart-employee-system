// Utilitiy for generating soft, elegant, non-glaring pastel colors for staff and doctors

export interface SoftColorInfo {
  bg: string;
  text: string;
  border: string;
  badgeBg: string;
  badgeText: string;
  className: string;
}

// 48+ Handcrafted soft pastel tones with gentle backgrounds, crisp dark text, and subtle borders
export const SOFT_PASTEL_PALETTE: SoftColorInfo[] = [
  // Soft Sky & Ice Blues
  { bg: '#f0f9ff', text: '#0369a1', border: '#bae6fd', badgeBg: '#0284c7', badgeText: '#ffffff', className: 'bg-sky-50 text-sky-900 border-sky-200' },
  { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe', badgeBg: '#2563eb', badgeText: '#ffffff', className: 'bg-blue-50 text-blue-900 border-blue-200' },
  { bg: '#f0fdfa', text: '#0f766e', border: '#99f6e4', badgeBg: '#0d9488', badgeText: '#ffffff', className: 'bg-teal-50 text-teal-900 border-teal-200' },
  { bg: '#ecfeff', text: '#0e7490', border: '#a5f3fc', badgeBg: '#0891b2', badgeText: '#ffffff', className: 'bg-cyan-50 text-cyan-900 border-cyan-200' },
  { bg: '#e0f2fe', text: '#0284c7', border: '#7dd3fc', badgeBg: '#0369a1', badgeText: '#ffffff', className: 'bg-sky-100 text-sky-900 border-sky-300' },

  // Soft Sage, Mint & Emerald
  { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0', badgeBg: '#16a34a', badgeText: '#ffffff', className: 'bg-green-50 text-green-900 border-green-200' },
  { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0', badgeBg: '#059669', badgeText: '#ffffff', className: 'bg-emerald-50 text-emerald-900 border-emerald-200' },
  { bg: '#f7fee7', text: '#4d7c0f', border: '#d9f99d', badgeBg: '#65a30d', badgeText: '#ffffff', className: 'bg-lime-50 text-lime-900 border-lime-200' },
  { bg: '#dcfce7', text: '#166534', border: '#86efac', badgeBg: '#15803d', badgeText: '#ffffff', className: 'bg-green-100 text-green-900 border-green-300' },
  { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7', badgeBg: '#047857', badgeText: '#ffffff', className: 'bg-emerald-100 text-emerald-900 border-emerald-300' },

  // Soft Lavender, Purple & Violet
  { bg: '#faf5ff', text: '#7e22ce', border: '#e9d5ff', badgeBg: '#9333ea', badgeText: '#ffffff', className: 'bg-purple-50 text-purple-900 border-purple-200' },
  { bg: '#f5f3ff', text: '#6d28d9', border: '#ddd6fe', badgeBg: '#7c3aed', badgeText: '#ffffff', className: 'bg-violet-50 text-violet-900 border-violet-200' },
  { bg: '#eef2ff', text: '#4338ca', border: '#c7d2fe', badgeBg: '#4f46e5', badgeText: '#ffffff', className: 'bg-indigo-50 text-indigo-900 border-indigo-200' },
  { bg: '#fdf4ff', text: '#a21caf', border: '#f5d0fe', badgeBg: '#c026d3', badgeText: '#ffffff', className: 'bg-fuchsia-50 text-fuchsia-900 border-fuchsia-200' },
  { bg: '#f3e8ff', text: '#6b21a8', border: '#d8b4fe', badgeBg: '#7e22ce', badgeText: '#ffffff', className: 'bg-purple-100 text-purple-900 border-purple-300' },
  { bg: '#ede9fe', text: '#5b21b6', border: '#c4b5fd', badgeBg: '#6d28d9', badgeText: '#ffffff', className: 'bg-violet-100 text-violet-900 border-violet-300' },

  // Soft Rose, Pink & Blush
  { bg: '#fff1f2', text: '#be123c', border: '#fecdd3', badgeBg: '#e11d48', badgeText: '#ffffff', className: 'bg-rose-50 text-rose-900 border-rose-200' },
  { bg: '#fdf2f8', text: '#be185d', border: '#fbcfe8', badgeBg: '#db2777', badgeText: '#ffffff', className: 'bg-pink-50 text-pink-900 border-pink-200' },
  { bg: '#ffe4e6', text: '#9f1239', border: '#fda4af', badgeBg: '#be123c', badgeText: '#ffffff', className: 'bg-rose-100 text-rose-900 border-rose-300' },
  { bg: '#fce7f3', text: '#9d174d', border: '#f472b6', badgeBg: '#be185d', badgeText: '#ffffff', className: 'bg-pink-100 text-pink-900 border-pink-300' },

  // Soft Amber, Peach, Apricot & Warm Cream
  { bg: '#fffbeb', text: '#b45309', border: '#fde68a', badgeBg: '#d97706', badgeText: '#ffffff', className: 'bg-amber-50 text-amber-900 border-amber-200' },
  { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa', badgeBg: '#ea580c', badgeText: '#ffffff', className: 'bg-orange-50 text-orange-900 border-orange-200' },
  { bg: '#fefce8', text: '#a16207', border: '#fef08a', badgeBg: '#ca8a04', badgeText: '#ffffff', className: 'bg-yellow-50 text-yellow-900 border-yellow-200' },
  { bg: '#fef3c7', text: '#92400e', border: '#fcd34d', badgeBg: '#b45309', badgeText: '#ffffff', className: 'bg-amber-100 text-amber-900 border-amber-300' },
  { bg: '#ffedd5', text: '#9a3412', border: '#fdba74', badgeBg: '#c2410c', badgeText: '#ffffff', className: 'bg-orange-100 text-orange-900 border-orange-300' },

  // Soft Slate, Stone & Cool Neutrals
  { bg: '#f8fafc', text: '#334155', border: '#cbd5e1', badgeBg: '#475569', badgeText: '#ffffff', className: 'bg-slate-50 text-slate-800 border-slate-200' },
  { bg: '#f4f4f5', text: '#3f3f46', border: '#d4d4d8', badgeBg: '#52525b', badgeText: '#ffffff', className: 'bg-zinc-50 text-zinc-800 border-zinc-200' },
  { bg: '#f5f5f4', text: '#44403c', border: '#d6d3d1', badgeBg: '#57534e', badgeText: '#ffffff', className: 'bg-stone-50 text-stone-800 border-stone-200' },
  { bg: '#f1f5f9', text: '#1e293b', border: '#94a3b8', badgeBg: '#334155', badgeText: '#ffffff', className: 'bg-slate-100 text-slate-900 border-slate-300' },

  // Additional Subtle Multi-tone Pastel Harmonies
  { bg: '#f0f4f8', text: '#2d3748', border: '#cbd5e0', badgeBg: '#4a5568', badgeText: '#ffffff', className: 'bg-slate-50 text-slate-900 border-slate-200' },
  { bg: '#fcf4ec', text: '#8c4819', border: '#f6d3b7', badgeBg: '#af5b20', badgeText: '#ffffff', className: 'bg-amber-50 text-amber-950 border-amber-200' },
  { bg: '#f2f8f5', text: '#1b4d3e', border: '#bde0d0', badgeBg: '#236350', badgeText: '#ffffff', className: 'bg-teal-50 text-teal-950 border-teal-200' },
  { bg: '#f8f2f8', text: '#5c2d5c', border: '#e2c6e2', badgeBg: '#773a77', badgeText: '#ffffff', className: 'bg-fuchsia-50 text-fuchsia-950 border-fuchsia-200' },
  { bg: '#f4f6fb', text: '#23395d', border: '#c9d4e8', badgeBg: '#304c7a', badgeText: '#ffffff', className: 'bg-blue-50 text-blue-950 border-blue-200' },
  { bg: '#f9f6f0', text: '#594a2b', border: '#e2d7be', badgeBg: '#736038', badgeText: '#ffffff', className: 'bg-stone-50 text-stone-900 border-stone-200' },
  { bg: '#f1fbf8', text: '#125446', border: '#b5ebd9', badgeBg: '#186d5b', badgeText: '#ffffff', className: 'bg-emerald-50 text-emerald-950 border-emerald-200' },
  { bg: '#fcf1f4', text: '#701e33', border: '#f7cad5', badgeBg: '#912742', badgeText: '#ffffff', className: 'bg-rose-50 text-rose-950 border-rose-200' },
  { bg: '#f5f0fa', text: '#451f69', border: '#d9c7ea', badgeBg: '#5c298c', badgeText: '#ffffff', className: 'bg-purple-50 text-purple-950 border-purple-200' },
  { bg: '#f3fbf3', text: '#1e521e', border: '#bee7be', badgeBg: '#286e28', badgeText: '#ffffff', className: 'bg-green-50 text-green-950 border-green-200' },
  { bg: '#fef7ee', text: '#7a3e0b', border: '#fcdab5', badgeBg: '#9e500e', badgeText: '#ffffff', className: 'bg-orange-50 text-orange-950 border-orange-200' },
  { bg: '#f2f8fc', text: '#164863', border: '#bfe1f5', badgeBg: '#1e5f82', badgeText: '#ffffff', className: 'bg-sky-50 text-sky-950 border-sky-200' },
  { bg: '#faf0f5', text: '#6b204e', border: '#eec4dd', badgeBg: '#8c2a66', badgeText: '#ffffff', className: 'bg-pink-50 text-pink-950 border-pink-200' },
  { bg: '#f5f8ed', text: '#3c5214', border: '#cee2a8', badgeBg: '#4f6c1a', badgeText: '#ffffff', className: 'bg-lime-50 text-lime-950 border-lime-200' },
  { bg: '#fcf6f0', text: '#663914', border: '#f4d5b9', badgeBg: '#854a1a', badgeText: '#ffffff', className: 'bg-amber-50 text-amber-950 border-amber-200' },
  { bg: '#f3f4fa', text: '#2e386b', border: '#c7cde7', badgeBg: '#3d4a8d', badgeText: '#ffffff', className: 'bg-indigo-50 text-indigo-950 border-indigo-200' },
  { bg: '#f1faf9', text: '#13524b', border: '#b8e9e3', badgeBg: '#196b62', badgeText: '#ffffff', className: 'bg-teal-50 text-teal-950 border-teal-200' },
  { bg: '#faf5f2', text: '#543729', border: '#e3cfc4', badgeBg: '#6e4835', badgeText: '#ffffff', className: 'bg-stone-50 text-stone-900 border-stone-200' }
];

const DEFAULT_BLANK_COLOR: SoftColorInfo = {
  bg: '#ffffff',
  text: '#475569',
  border: '#cbd5e1',
  badgeBg: '#64748b',
  badgeText: '#ffffff',
  className: 'bg-white text-slate-700 border-dashed border-slate-300'
};

const ppRegex = /(?:\(|\[|\{)\s*pp\s*(?:\)|\]|\})/i;

/**
 * Generates an algorithmic golden-ratio soft pastel color for extreme edge cases (e.g. >50 staff).
 */
export const generateGoldenRatioPastel = (index: number): SoftColorInfo => {
  const goldenRatio = 0.618033988749895;
  const hue = Math.round(((index * goldenRatio) % 1) * 360);
  
  const bg = `hsl(${hue}, 45%, 95%)`;
  const border = `hsl(${hue}, 40%, 82%)`;
  const text = `hsl(${hue}, 65%, 25%)`;
  const badgeBg = `hsl(${hue}, 60%, 40%)`;
  const badgeText = '#ffffff';

  return {
    bg,
    text,
    border,
    badgeBg,
    badgeText,
    className: 'border'
  };
};

/**
 * Returns a soft, distinct pastel color for a given staff or doctor name.
 * If uniqueList is passed, colors are guaranteed to be distinct without collisions.
 */
export const getSoftStaffColor = (name: string, uniqueList?: string[]): SoftColorInfo => {
  const cleanName = (name || '').replace(ppRegex, '').trim();
  const normalized = cleanName.toLowerCase();

  if (!normalized || normalized === 'new dr' || normalized === 'doctor name' || normalized === 'dr. name' || normalized === 'new staff' || normalized === 'staff name') {
    return DEFAULT_BLANK_COLOR;
  }

  // 1. If unique list of names in the schedule is provided, use position for zero-collision distinct assignment
  if (uniqueList && uniqueList.length > 0) {
    const listIndex = uniqueList.findIndex(n => (n || '').replace(ppRegex, '').trim().toLowerCase() === normalized);
    if (listIndex >= 0) {
      if (listIndex < SOFT_PASTEL_PALETTE.length) {
        return SOFT_PASTEL_PALETTE[listIndex];
      }
      return generateGoldenRatioPastel(listIndex);
    }
  }

  // 2. High-dispersion deterministic string hash fallback
  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) + hash) ^ normalized.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % SOFT_PASTEL_PALETTE.length;
  return SOFT_PASTEL_PALETTE[index];
};
