import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCurrencyStore, CURRENCIES, CurrencyCode } from '@/hooks/use-currency-store';
import { DollarSign } from 'lucide-react';

interface CurrencySelectorProps {
  compact?: boolean;
}

export function CurrencySelector({ compact = false }: CurrencySelectorProps) {
  const { currency, setCurrency } = useCurrencyStore();
  
  return (
    <Select value={currency} onValueChange={(v) => setCurrency(v as CurrencyCode)}>
      <SelectTrigger className={compact ? "w-[80px] h-8" : "w-[140px]"}>
        <SelectValue>
          <div className="flex items-center gap-1.5">
            {compact ? (
              <span className="font-medium">{CURRENCIES[currency].symbol}</span>
            ) : (
              <>
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{CURRENCIES[currency].code}</span>
              </>
            )}
          </div>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-popover border-border">
        {(Object.keys(CURRENCIES) as CurrencyCode[]).map((code) => {
          const info = CURRENCIES[code];
          return (
            <SelectItem key={code} value={code}>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs w-6">{info.symbol}</span>
                <span>{info.code}</span>
                <span className="text-muted-foreground text-xs">- {info.name}</span>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
