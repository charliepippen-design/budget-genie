import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ========== TYPES ==========

export type CurrencyCode = 'EUR' | 'USD' | 'GBP' | 'CHF' | 'CAD' | 'AUD' | 'JPY' | 'CNY';

export interface CurrencyInfo {
  code: CurrencyCode;
  symbol: string;
  name: string;
  locale: string;
  symbolPosition: 'before' | 'after';
}

// ========== CURRENCY DATA ==========

export const CURRENCIES: Record<CurrencyCode, CurrencyInfo> = {
  EUR: { code: 'EUR', symbol: '€', name: 'Euro', locale: 'de-DE', symbolPosition: 'after' },
  USD: { code: 'USD', symbol: '$', name: 'US Dollar', locale: 'en-US', symbolPosition: 'before' },
  GBP: { code: 'GBP', symbol: '£', name: 'British Pound', locale: 'en-GB', symbolPosition: 'before' },
  CHF: { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc', locale: 'de-CH', symbolPosition: 'after' },
  CAD: { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', locale: 'en-CA', symbolPosition: 'before' },
  AUD: { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', locale: 'en-AU', symbolPosition: 'before' },
  JPY: { code: 'JPY', symbol: '¥', name: 'Japanese Yen', locale: 'ja-JP', symbolPosition: 'before' },
  CNY: { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', locale: 'zh-CN', symbolPosition: 'before' },
};

// ========== DETECTION ==========

const CURRENCY_SYMBOLS: Record<string, CurrencyCode> = {
  '€': 'EUR',
  '$': 'USD',
  '£': 'GBP',
  '¥': 'JPY',
  'CHF': 'CHF',
  'C$': 'CAD',
  'A$': 'AUD',
};

export function detectCurrencyFromValue(value: string): CurrencyCode | null {
  if (!value || typeof value !== 'string') return null;
  
  const cleaned = value.trim();
  
  // Check for currency symbols
  for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (cleaned.includes(symbol)) {
      return code;
    }
  }
  
  // Check for currency codes in the string
  for (const code of Object.keys(CURRENCIES) as CurrencyCode[]) {
    if (cleaned.toUpperCase().includes(code)) {
      return code;
    }
  }
  
  return null;
}

export function detectCurrencyFromData(data: string[][]): {
  detected: CurrencyCode | null;
  confidence: number;
  samples: string[];
} {
  const currencyCounts: Partial<Record<CurrencyCode, number>> = {};
  const samples: string[] = [];
  let totalNumericCells = 0;
  
  // Scan first 20 rows and all columns
  for (let i = 0; i < Math.min(20, data.length); i++) {
    const row = data[i];
    if (!row) continue;
    
    for (const cell of row) {
      if (!cell || typeof cell !== 'string') continue;
      
      // Check if cell looks like a monetary value
      const hasNumber = /\d/.test(cell);
      if (!hasNumber) continue;
      
      totalNumericCells++;
      
      const detected = detectCurrencyFromValue(cell);
      if (detected) {
        currencyCounts[detected] = (currencyCounts[detected] || 0) + 1;
        if (samples.length < 5) {
          samples.push(cell);
        }
      }
    }
  }
  
  // Find most common currency
  let maxCount = 0;
  let detectedCurrency: CurrencyCode | null = null;
  
  for (const [code, count] of Object.entries(currencyCounts)) {
    if (count > maxCount) {
      maxCount = count;
      detectedCurrency = code as CurrencyCode;
    }
  }
  
  const confidence = totalNumericCells > 0 ? Math.min(maxCount / totalNumericCells, 1) : 0;
  
  return {
    detected: detectedCurrency,
    confidence,
    samples,
  };
}

// ========== FORMATTING ==========

export function formatCurrency(value: number, currency: CurrencyCode, compact = false): string {
  const info = CURRENCIES[currency];
  
  if (compact && Math.abs(value) >= 1000) {
    const formatter = new Intl.NumberFormat(info.locale, {
      notation: 'compact',
      maximumFractionDigits: 1,
    });
    const formatted = formatter.format(value);
    return info.symbolPosition === 'before' 
      ? `${info.symbol}${formatted}` 
      : `${formatted}${info.symbol}`;
  }
  
  const formatter = new Intl.NumberFormat(info.locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  
  const formatted = formatter.format(value);
  return info.symbolPosition === 'before' 
    ? `${info.symbol}${formatted}` 
    : `${formatted}${info.symbol}`;
}

// ========== STORE ==========

interface CurrencyState {
  currency: CurrencyCode;
  setCurrency: (currency: CurrencyCode) => void;
}

export const useCurrencyStore = create<CurrencyState>()(
  persist(
    (set) => ({
      currency: 'EUR',
      setCurrency: (currency) => set({ currency }),
    }),
    {
      name: 'media-plan-currency',
    }
  )
);

// ========== HOOK ==========

export function useCurrency() {
  const { currency, setCurrency } = useCurrencyStore();
  const info = CURRENCIES[currency];
  
  const format = (value: number, compact = false) => formatCurrency(value, currency, compact);
  
  return {
    currency,
    setCurrency,
    info,
    format,
    symbol: info.symbol,
  };
}
