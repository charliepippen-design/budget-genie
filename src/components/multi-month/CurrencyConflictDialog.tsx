import { AlertTriangle, ArrowRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { CURRENCIES, CurrencyCode } from '@/contexts/CurrencyContext';
import { cn } from '@/lib/utils';

export type CurrencyConflictResolution = 'keep-numbers' | 'convert';

interface CurrencyConflictDialogProps {
  fileCurrency: CurrencyCode;
  appCurrency: CurrencyCode;
  samples: string[];
  resolution: CurrencyConflictResolution;
  onResolutionChange: (resolution: CurrencyConflictResolution) => void;
}

export function CurrencyConflictDialog({
  fileCurrency,
  appCurrency,
  samples,
  resolution,
  onResolutionChange,
}: CurrencyConflictDialogProps) {
  const fileInfo = CURRENCIES[fileCurrency];
  const appInfo = CURRENCIES[appCurrency];

  return (
    <div className="space-y-4 p-4 rounded-lg bg-warning/10 border border-warning/30">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-warning/20 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="h-4 w-4 text-warning" />
        </div>
        <div>
          <p className="font-medium text-foreground">Currency Mismatch Detected</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            File uses <span className="font-medium text-foreground">{fileInfo.symbol} ({fileInfo.name})</span> but app is set to <span className="font-medium text-foreground">{appInfo.symbol} ({appInfo.name})</span>
          </p>
        </div>
      </div>

      {samples.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {samples.slice(0, 3).map((sample, i) => (
            <code key={i} className="text-xs px-2 py-1 bg-muted rounded">
              {sample}
            </code>
          ))}
        </div>
      )}

      <RadioGroup
        value={resolution}
        onValueChange={(v) => onResolutionChange(v as CurrencyConflictResolution)}
        className="space-y-2"
      >
        <Label
          htmlFor="keep-numbers"
          className={cn(
            "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
            resolution === 'keep-numbers'
              ? "border-primary bg-primary/5"
              : "border-border hover:bg-muted/50"
          )}
        >
          <RadioGroupItem value="keep-numbers" id="keep-numbers" className="mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">Keep Numbers As-Is</p>
              <span className="text-xs text-muted-foreground">(Recommended)</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              100{fileInfo.symbol} → 100{appInfo.symbol} — Just change the symbol
            </p>
          </div>
        </Label>

        <Label
          htmlFor="convert"
          className={cn(
            "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors opacity-50",
            resolution === 'convert'
              ? "border-primary bg-primary/5"
              : "border-border"
          )}
        >
          <RadioGroupItem value="convert" id="convert" className="mt-0.5" disabled />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">Convert with Exchange Rate</p>
              <span className="text-xs px-1.5 py-0.5 bg-muted rounded">Coming Soon</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Apply real exchange rates to convert values
            </p>
          </div>
        </Label>
      </RadioGroup>
    </div>
  );
}
