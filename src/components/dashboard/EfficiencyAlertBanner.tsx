import { useCurrency } from '@/contexts/CurrencyContext';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useMediaPlanStore, usePlanResult } from '@/hooks/use-media-plan-store';

export function EfficiencyAlertBanner() {
  const { format } = useCurrency();
  const { channels, alerts } = usePlanResult();
  const subscriptionTier = useMediaPlanStore((state) => state.subscriptionTier);
  const globalMultipliers = useMediaPlanStore((state) => state.globalMultipliers);
  const setIsGenieOpen = useMediaPlanStore((state) => state.setIsGenieOpen);

  const [dismissRoas, setDismissRoas] = useState(false);
  const [dismissSaturation, setDismissSaturation] = useState(false);

  const isPro = subscriptionTier === 'pro' || subscriptionTier === 'enterprise';

  const roasUnderperformers = alerts.belowBreakEven;
  const saturationChannels = useMemo(
    () => channels.filter((c) => alerts.nearSaturation.includes(c.id)),
    [channels, alerts.nearSaturation]
  );

  const money = format(alerts.wastedSpend);

  if (!isPro) {
    return null;
  }

  return (
    <div className="space-y-2">
      {!dismissRoas && roasUnderperformers.length > 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/15 px-4 py-3 text-sm text-amber-100">
          <p>
            {`⚠ ${roasUnderperformers.length} channel${roasUnderperformers.length > 1 ? 's' : ''} below 1x ROAS — ${money} potentially mis-allocated.`}{' '}
            <button
              type="button"
              className="font-semibold underline underline-offset-2"
              onClick={() => setIsGenieOpen(true)}
            >
              Review with the assistant →
            </button>
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDismissRoas(true)}
            className="h-7 px-2 text-amber-100 hover:bg-amber-500/20"
          >
            Dismiss
          </Button>
        </div>
      ) : null}

      {!dismissSaturation && saturationChannels.length > 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/15 px-4 py-3 text-sm text-amber-100">
          <p>
            {`⚠ ${saturationChannels[0].name} is approaching its saturation ceiling.`}
            {globalMultipliers.roasTarget
              ? ` (ROAS target ${globalMultipliers.roasTarget.toFixed(2)}x)`
              : ''}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDismissSaturation(true)}
            className="h-7 px-2 text-amber-100 hover:bg-amber-500/20"
          >
            Dismiss
          </Button>
        </div>
      ) : null}
    </div>
  );
}
