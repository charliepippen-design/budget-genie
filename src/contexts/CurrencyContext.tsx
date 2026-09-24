import React, { createContext, useContext, useState, useEffect } from 'react';

export type CurrencyCode = 'EUR' | 'USD' | 'GBP' | 'BRL' | 'CHF' | 'CAD' | 'AUD' | 'JPY' | 'CNY';

export interface CurrencyInfo {
  code: CurrencyCode;
  symbol: string;
  name: string;
  locale: string;
  symbolPosition: 'before' | 'after';
  flag: string;
  rate: number;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyInfo> = {
  EUR: { code: 'EUR', symbol: '€', name: 'Euro', locale: 'de-DE', symbolPosition: 'after', flag: '🇪🇺', rate: 1.0 },
  USD: { code: 'USD', symbol: '$', name: 'US Dollar', locale: 'en-US', symbolPosition: 'before', flag: '🇺🇸', rate: 1.10 },
  GBP: { code: 'GBP', symbol: '£', name: 'British Pound', locale: 'en-GB', symbolPosition: 'before', flag: '🇬🇧', rate: 0.85 },
  CHF: { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc', locale: 'de-CH', symbolPosition: 'after', flag: '🇨🇭', rate: 0.98 },
  CAD: { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', locale: 'en-CA', symbolPosition: 'before', flag: '🇨🇦', rate: 1.45 },
  AUD: { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', locale: 'en-AU', symbolPosition: 'before', flag: '🇦🇺', rate: 1.62 },
  JPY: { code: 'JPY', symbol: '¥', name: 'Japanese Yen', locale: 'ja-JP', symbolPosition: 'before', flag: '🇯🇵', rate: 160.0 },
  CNY: { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', locale: 'zh-CN', symbolPosition: 'before', flag: '🇨🇳', rate: 7.85 },
  BRL: { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', locale: 'pt-BR', symbolPosition: 'before', flag: '🇧🇷', rate: 5.50 },
};

interface CurrencyContextType {
  code: CurrencyCode;
  symbol: string;
  info: CurrencyInfo;
  currentRate: number;
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
    if (!info) return `${value}`;
    
    // Apply exchange rate to the value
    const convertedValue = value * info.rate;

    if (compact && Math.abs(convertedValue) >= 1000) {
      let formatted: string;
      if (Math.abs(convertedValue) >= 1000000) {
        formatted = `${(convertedValue / 1000000).toFixed(1)}M`;
      } else {
        formatted = `${(convertedValue / 1000).toFixed(1)}K`;
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

    return formatter.format(convertedValue);
  };

  const info = CURRENCIES[code] || CURRENCIES['EUR'];
  const symbol = info.symbol;
  const currentRate = info.rate;

  return (
    <CurrencyContext.Provider value={{ code, symbol, info, currentRate, format, setCode }}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error('useCurrency must be used within a CurrencyProvider');
  return context;
};

