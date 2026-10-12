import {
  LIFETIME_ROAS_LABEL,
  MONTH1_ROAS_LABEL,
  type RoasPair as RoasPairValue,
} from '@/lib/roas-pair';
import { cn } from '@/lib/utils';

/** The two ROAS figures side by side, so a lifetime return is never read as a monthly one. */
export function RoasPair({ pair, className }: { pair: RoasPairValue; className?: string }) {
  return (
    <div className={cn('flex flex-wrap gap-x-4 gap-y-0.5', className)} data-testid="roas-pair">
      <span data-testid="roas-lifetime">
        {LIFETIME_ROAS_LABEL}: {pair.lifetime.toFixed(2)}x
      </span>
      <span data-testid="roas-month1">
        {MONTH1_ROAS_LABEL}: {pair.month1 === null ? 'n/a' : `${pair.month1.toFixed(2)}x`}
      </span>
    </div>
  );
}
