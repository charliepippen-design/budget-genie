import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCurrency, CurrencyCode, CURRENCIES } from '@/contexts/CurrencyContext';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';

interface CurrencySelectorProps {
  compact?: boolean;
}

export function CurrencySelector({ compact = false }: CurrencySelectorProps) {
  const { code, setCode, info: currentInfo } = useCurrency();
  const { theme } = useTheme();
  const isDark = theme === 'dark' || theme === 'contrast';

  return (
    <Select value={code} onValueChange={(v) => setCode(v as CurrencyCode)}>
      <SelectTrigger
        className={cn(
          'h-10 rounded-lg border px-3 text-sm font-medium transition-colors',
          compact ? 'w-[112px]' : 'w-[152px]',
          isDark
            ? 'border-slate-700 bg-slate-900/60 text-slate-100 focus:ring-slate-600'
            : 'border-slate-300 bg-white text-slate-900 focus:ring-slate-400'
        )}
      >
        <SelectValue>
          <div className="flex items-center gap-1.5">
            <span>{currentInfo.flag}</span>
            <span className="font-medium">{currentInfo.code}</span>
          </div>
        </SelectValue>
      </SelectTrigger>
      <SelectContent
        className={cn(
          'border-2',
          isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-300 bg-white'
        )}
      >
        {Object.values(CURRENCIES).map((currency) => (
          <SelectItem
            key={currency.code}
            value={currency.code}
            className={cn(
              'cursor-pointer font-medium',
              isDark ? 'focus:bg-slate-800' : 'focus:bg-slate-100'
            )}
          >
            <div className="flex items-center gap-2">
              <span>{currency.flag}</span>
              <span className="font-medium">{currency.code}</span>
              {!compact && (
                <span className={cn('text-xs', isDark ? 'text-slate-400' : 'text-slate-600')}>
                  - {currency.name}
                </span>
              )}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
