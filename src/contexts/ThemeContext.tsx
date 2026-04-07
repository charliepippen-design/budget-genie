import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ThemeContext, type AppTheme } from '@/contexts/theme-context';

const THEME_STORAGE_KEY = 'budget-genie-theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<AppTheme>(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' || stored === 'contrast' ? stored : 'dark';
  });

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    const root = document.documentElement;

    // Force synchronize ALL theme classes immediately
    root.classList.remove(
      'light',
      'dark',
      'contrast',
      'theme-light',
      'theme-dark',
      'theme-contrast'
    );

    if (theme === 'light') {
      root.classList.add('light', 'theme-light');
      root.style.colorScheme = 'light';
      document.body.classList.remove('dark');
      return;
    }

    if (theme === 'contrast') {
      root.classList.add('dark', 'contrast', 'theme-contrast');
      root.style.colorScheme = 'dark';
      document.body.classList.add('dark');
      return;
    }

    // Dark theme
    root.classList.add('dark', 'theme-dark');
    root.style.colorScheme = 'dark';
    document.body.classList.add('dark');
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme: () => setTheme((current) => (current === 'dark' ? 'light' : 'dark')),
      cycleTheme: () =>
        setTheme((current) =>
          current === 'light' ? 'dark' : current === 'dark' ? 'contrast' : 'light'
        ),
    }),
    [theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
