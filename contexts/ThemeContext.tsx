import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type AppTheme = 'dark' | 'light';

interface ThemeContextType {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
  isDark: boolean;
}

const THEME_STORAGE_KEY = 'app_theme';
const BACKUP_THEME_STORAGE_KEY = 'theme';

export const applyThemeToDOM = (theme: AppTheme) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
    root.setAttribute('data-theme', 'dark');
    root.style.colorScheme = 'dark';
  } else {
    root.classList.remove('dark');
    root.setAttribute('data-theme', 'light');
    root.style.colorScheme = 'light';
  }

  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', theme === 'dark' ? '#0f172a' : '#f1f5f9');
  }
};

export const persistThemeToStorage = (theme: AppTheme) => {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    localStorage.setItem(BACKUP_THEME_STORAGE_KEY, theme);
  } catch (e) {}

  try {
    document.cookie = `app_theme=${theme}; path=/; max-age=31536000; SameSite=Lax`;
  } catch (e) {}
};

export const getPersistedTheme = (): AppTheme => {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY) || localStorage.getItem(BACKUP_THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch (e) {}

  try {
    if (typeof document !== 'undefined') {
      const match = document.cookie.match(/(?:^|;\s*)app_theme=(dark|light)/);
      if (match && (match[1] === 'light' || match[1] === 'dark')) {
        return match[1] as AppTheme;
      }
    }
  } catch (e) {}

  try {
    if (typeof document !== 'undefined') {
      const attr = document.documentElement.getAttribute('data-theme');
      if (attr === 'light' || attr === 'dark') return attr as AppTheme;
      if (document.documentElement.classList.contains('dark')) return 'dark';
    }
  } catch (e) {}

  // Default to dark so the entire app matches the sleek executive palette requested
  return 'dark';
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<AppTheme>(() => {
    const initialTheme = getPersistedTheme();
    // Apply immediately to prevent any flicker during render
    applyThemeToDOM(initialTheme);
    return initialTheme;
  });

  // Ensure DOM and storage are in sync on mount and whenever theme changes
  useEffect(() => {
    persistThemeToStorage(theme);
    applyThemeToDOM(theme);
  }, [theme]);

  // Synchronize across tabs if changed in another window
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY || e.key === BACKUP_THEME_STORAGE_KEY) {
        if (e.newValue === 'light' || e.newValue === 'dark') {
          setThemeState(e.newValue);
          applyThemeToDOM(e.newValue);
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const setTheme = useCallback((newTheme: AppTheme) => {
    persistThemeToStorage(newTheme);
    applyThemeToDOM(newTheme);
    setThemeState(newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState(prev => {
      const nextTheme: AppTheme = prev === 'dark' ? 'light' : 'dark';
      persistThemeToStorage(nextTheme);
      applyThemeToDOM(nextTheme);
      return nextTheme;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, isDark: theme === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

