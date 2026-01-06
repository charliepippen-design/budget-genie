import React, { createContext, useContext, useState, useEffect } from 'react';

type CurrencyCode = 'EUR' | 'USD' | 'GBP';

interface CurrencyContextType {
  code: CurrencyCode;
  symbol: string;
  format: (value: number, compact?: boolean) => string;
  setCode: (code: CurrencyCode) => void;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [code, setCodeState] = useState<CurrencyCode>('EUR');

  // Load from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem('app_currency');
    if (saved) setCodeState(saved as CurrencyCode);
  }, []);

  const setCode = (c: CurrencyCode) => {
    setCodeState(c);
    localStorage.setItem('app_currency', c);
  };

  const format = (value: number, compact = false) => {
    const locale = code === 'USD' ? 'en-US' : (code === 'GBP' ? 'en-GB' : 'de-DE');
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      notation: compact ? 'compact' : 'standard',
      maximumFractionDigits: compact ? 1 : 0,
    }).format(value);
  };

  const symbol = code === 'USD' ? '$' : (code === 'GBP' ? '£' : '€');

  return (
    <CurrencyContext.Provider value={{ code, symbol, format, setCode }}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error('useCurrency must be used within a CurrencyProvider');
  return context;
};

export type { CurrencyCode };
