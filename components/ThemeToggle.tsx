import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = '', showLabel = false }) => {
  const { theme, toggleTheme, isDark } = useTheme();
  const { t } = useLanguage();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`relative inline-flex items-center justify-center rounded-2xl transition-all duration-300 cursor-pointer select-none group ${
        isDark
          ? 'bg-slate-800/90 hover:bg-slate-750 text-amber-300 border border-slate-700/80 shadow-md shadow-black/20 hover:border-amber-400/40'
          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300/80 shadow-xs hover:border-slate-400'
      } ${showLabel ? 'px-3 py-1.5 gap-2 text-xs font-bold' : 'w-9 h-9 sm:w-10 sm:h-10'} ${className}`}
      title={isDark ? `${t('theme.light')} (Switch to Light)` : `${t('theme.dark')} (Switch to Dark)`}
      aria-label="Toggle Theme"
    >
      <div className="relative flex items-center justify-center">
        {isDark ? (
          <i className="fas fa-moon text-sm sm:text-base text-amber-300 transition-transform duration-300 group-hover:-rotate-12"></i>
        ) : (
          <i className="fas fa-sun text-sm sm:text-base text-amber-500 transition-transform duration-300 group-hover:rotate-45"></i>
        )}
      </div>

      {showLabel && (
        <span className="truncate">
          {isDark ? t('theme.dark') : t('theme.light')}
        </span>
      )}
    </button>
  );
};

export default ThemeToggle;
