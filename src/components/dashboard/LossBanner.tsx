import { useCurrency } from '@/contexts/CurrencyContext';
import { useBlendedMetrics, useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { computePlanHealth, type PlanHealth } from '@/lib/plan-health';

export function LossBannerView({ health }: { health: PlanHealth }) {
  const { format } = useCurrency();
  if (!health.losesMoney || health.breakEvenCpa === null) return null;
  const current = health.blendedCpa === null ? 'n/a' : format(health.blendedCpa);
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-500/60 bg-red-600/15 px-4 py-3 text-sm font-medium text-red-700 dark:text-red-200"
    >
      This plan loses money at these assumptions: about {format(health.monthlyContribution)} per
      month. Break-even cost per customer: {format(health.breakEvenCpa)} (current {current}).
    </div>
  );
}

export function LossBanner() {
  const blended = useBlendedMetrics();
  const vertical = useMediaPlanStore((s) => s.onboardingVertical);
  const multipliers = useMediaPlanStore((s) => s.globalMultipliers);
  return <LossBannerView health={computePlanHealth(blended, vertical, multipliers)} />;
}
