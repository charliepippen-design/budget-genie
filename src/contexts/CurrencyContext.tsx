import React, { createContext, useContext, useState, useEffect } from 'react';

export type CurrencyCode = 'EUR' | 'USD' | 'GBP' | 'CHF' | 'CAD' | 'AUD' | 'JPY' | 'CNY';

export interface CurrencyInfo {
  code: CurrencyCode;
  symbol: string;
  name: string;
  locale: string;
  symbolPosition: 'before' | 'after';
  flag: string;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyInfo> = {
  EUR: { code: 'EUR', symbol: '€', name: 'Euro', locale: 'de-DE', symbolPosition: 'after', flag: '🇪🇺' },
  USD: { code: 'USD', symbol: '$', name: 'US Dollar', locale: 'en-US', symbolPosition: 'before', flag: '🇺🇸' },
  GBP: { code: 'GBP', symbol: '£', name: 'British Pound', locale: 'en-GB', symbolPosition: 'before', flag: '🇬🇧' },
  CHF: { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc', locale: 'de-CH', symbolPosition: 'after', flag: '🇨🇭' },
  CAD: { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', locale: 'en-CA', symbolPosition: 'before', flag: '🇨🇦' },
  AUD: { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', locale: 'en-AU', symbolPosition: 'before', flag: '🇦🇺' },
  JPY: { code: 'JPY', symbol: '¥', name: 'Japanese Yen', locale: 'ja-JP', symbolPosition: 'before', flag: '🇯🇵' },
  CNY: { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', locale: 'zh-CN', symbolPosition: 'before', flag: '🇨🇳' },
};

interface CurrencyContextType {
  code: CurrencyCode;
  symbol: string;
  info: CurrencyInfo;
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
    const info = CURRENCIES[code];
    // Safety check just in case
    if (!info) return `${value}`;

    if (compact && Math.abs(value) >= 1000) {
      let formatted: string;
      if (Math.abs(value) >= 1000000) {
        formatted = `${(value / 1000000).toFixed(1)}M`;
      } else {
        formatted = `${(value / 1000).toFixed(1)}K`;
      }
      return info.symbolPosition === 'before'
        ? `${info.symbol}${formatted}`
        : `${formatted}${info.symbol}`;
    }

    const formatter = new Intl.NumberFormat(info.locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      style: 'currency',
      currency: code,
    });

    return formatter.format(value);
  };

  const info = CURRENCIES[code] || CURRENCIES['EUR'];
  const symbol = info.symbol;

  return (
    <CurrencyContext.Provider value={{ code, symbol, info, format, setCode }}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error('useCurrency must be used within a CurrencyProvider');
  return context;
};

