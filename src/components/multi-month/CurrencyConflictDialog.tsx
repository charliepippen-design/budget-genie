import { AlertTriangle, ArrowRight, RefreshCw } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { CURRENCIES, CurrencyCode } from '@/contexts/CurrencyContext';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type CurrencyConflictResolution = 'keep-numbers' | 'convert-estimate' | 'convert-latest';

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
            File uses{' '}
            <span className="font-medium text-foreground">
              {fileInfo.symbol} ({fileInfo.name})
            </span>{' '}
            but app is set to{' '}
            <span className="font-medium text-foreground">
              {appInfo.symbol} ({appInfo.name})
            </span>
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

      <div className="space-y-2">
        <Label className="text-sm">Auto-fix strategy</Label>
        <Select
          value={resolution}
          onValueChange={(v) => onResolutionChange(v as CurrencyConflictResolution)}
        >
          <SelectTrigger
            className={cn('w-full', resolution !== 'keep-numbers' && 'border-warning/60')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="keep-numbers">Keep numbers as-is (symbol swap only)</SelectItem>
            <SelectItem value="convert-estimate">Auto-convert using estimated rate</SelectItem>
            <SelectItem value="convert-latest">Auto-convert using latest available rate</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Source sample: 100{fileInfo.symbol}{' '}
          {resolution === 'keep-numbers'
            ? `-> 100${appInfo.symbol}`
            : `-> converted to ${appInfo.symbol}`}
        </p>
      </div>
    </div>
  );
}
