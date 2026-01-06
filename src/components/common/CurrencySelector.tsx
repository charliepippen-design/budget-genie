import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCurrencyStore, CURRENCIES, CurrencyCode } from '@/hooks/use-currency-store';

interface CurrencySelectorProps {
  compact?: boolean;
}

export function CurrencySelector({ compact = false }: CurrencySelectorProps) {
  const { currency, setCurrency } = useCurrencyStore();
  const info = CURRENCIES[currency];
  
  return (
    <Select value={currency} onValueChange={(v) => setCurrency(v as CurrencyCode)}>
      <SelectTrigger className={compact ? "w-[90px] h-8" : "w-[140px]"}>
        <SelectValue>
          <div className="flex items-center gap-1.5">
            {compact ? (
              <>
                <span>{info.flag}</span>
                <span className="font-medium">{info.code}</span>
              </>
            ) : (
              <>
                <span>{info.flag}</span>
                <span>{info.code}</span>
              </>
            )}
          </div>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-popover border-border">
        {(Object.keys(CURRENCIES) as CurrencyCode[]).map((code) => {
          const currencyInfo = CURRENCIES[code];
          return (
            <SelectItem key={code} value={code}>
              <div className="flex items-center gap-2">
                <span>{currencyInfo.flag}</span>
                <span className="font-medium">{currencyInfo.code}</span>
                {!compact && (
                  <span className="text-muted-foreground text-xs">- {currencyInfo.name}</span>
                )}
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
