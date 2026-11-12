import type { EngineRange } from '@/engine/contract';
import { RANGE_HINT } from '@/lib/plan-ranges';
import { cn } from '@/lib/utils';

/**
 * The quiet second line under a headline figure: its likely range, low end to high end.
 * Renders nothing when the engine gives no range (point estimates only).
 */
export function RangeLine({
  range,
  format,
  className,
}: {
  range: EngineRange | null | undefined;
  format: (value: number) => string;
  className?: string;
}) {
  if (!range) return null;
  // Cost per conversion has its cheap end at p10, so the ends are ordered for display.
  const low = format(Math.min(range.p10, range.p90));
  const high = format(Math.max(range.p10, range.p90));
  // Two parts, so a narrow tile wraps the range at the dash instead of cutting a figure.
  return (
    <p
      data-testid="range-line"
      title={RANGE_HINT}
      className={cn('flex flex-wrap gap-x-1 text-[10px] leading-4 tabular-nums text-slate-400', className)}
    >
      <span className="max-w-full truncate">{low} –{' '}</span>
      <span className="max-w-full truncate">{high}</span>
    </p>
  );
}
