import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCurrency, CurrencyCode } from '@/contexts/CurrencyContext';

const CURRENCY_OPTIONS: { code: CurrencyCode; symbol: string; name: string; flag: string }[] = [
  { code: 'EUR', symbol: '€', name: 'Euro', flag: '🇪🇺' },
  { code: 'USD', symbol: '$', name: 'US Dollar', flag: '🇺🇸' },
  { code: 'GBP', symbol: '£', name: 'British Pound', flag: '🇬🇧' },
];

interface CurrencySelectorProps {
  compact?: boolean;
}

export function CurrencySelector({ compact = false }: CurrencySelectorProps) {
  const { code, setCode } = useCurrency();
  const currentInfo = CURRENCY_OPTIONS.find(c => c.code === code) || CURRENCY_OPTIONS[0];
  
  return (
    <Select value={code} onValueChange={(v) => setCode(v as CurrencyCode)}>
      <SelectTrigger className={compact ? "w-[90px] h-8" : "w-[140px]"}>
        <SelectValue>
          <div className="flex items-center gap-1.5">
            <span>{currentInfo.flag}</span>
            <span className="font-medium">{currentInfo.code}</span>
          </div>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-popover border-border">
        {CURRENCY_OPTIONS.map((currency) => (
          <SelectItem key={currency.code} value={currency.code}>
            <div className="flex items-center gap-2">
              <span>{currency.flag}</span>
              <span className="font-medium">{currency.code}</span>
              {!compact && (
                <span className="text-muted-foreground text-xs">- {currency.name}</span>
              )}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
