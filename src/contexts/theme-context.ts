import { createContext } from 'react';

export type AppTheme = 'light' | 'dark' | 'contrast';

export interface ThemeContextValue {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
  cycleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);
