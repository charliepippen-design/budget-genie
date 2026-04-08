import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';
import { useFtdVelocityMetrics } from '@/hooks/use-media-plan-store';
import { useVerticalConfig } from '@/hooks/use-vertical-config';

interface FunnelNodeProps {
  label: string;
  value: string;
  subMetric: string;
  delta: number;
  tone: 'blue' | 'cyan' | 'violet' | 'emerald' | 'amber';
  isDark: boolean;
}

function FunnelNode({ label, value, subMetric, delta, tone, isDark }: FunnelNodeProps) {
  const toneClass =
    tone === 'blue'
      ? 'from-blue-500/15 to-slate-900/5 border-blue-500/25'
      : tone === 'cyan'
        ? 'from-cyan-500/15 to-slate-900/5 border-cyan-500/25'
        : tone === 'violet'
          ? 'from-violet-500/15 to-slate-900/5 border-violet-500/25'
          : tone === 'emerald'
            ? 'from-emerald-500/15 to-slate-900/5 border-emerald-500/25'
            : 'from-amber-500/15 to-slate-900/5 border-amber-500/25';

  return (
    <div
      className={cn(
        'min-w-[180px] w-full rounded-lg border bg-gradient-to-br p-4 transition-transform duration-300 hover:-translate-y-0.5',
        toneClass,
        !isDark && 'bg-white/80'
      )}
    >
      <p
        className={cn(
          'text-[11px] uppercase tracking-[0.14em]',
          isDark ? 'text-slate-400' : 'text-slate-500'
        )}
      >
        {label}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <p
          className={cn(
            'text-3xl font-black tracking-tight',
            isDark ? 'text-slate-100' : 'text-slate-900'
          )}
        >
          {value}
        </p>
        {delta !== 0 ? (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-semibold',
              delta > 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
            )}
          >
            {delta > 0 ? '+' : ''}
            {delta.toFixed(1)}%
          </span>
        ) : null}
      </div>
      <p className={cn('mt-2 text-xs', isDark ? 'text-slate-400' : 'text-slate-500')}>
        {subMetric}
      </p>
    </div>
  );
}

export function FTDVelocityEngine() {
  const { theme } = useTheme();
  const { format } = useCurrency();
  const metrics = useFtdVelocityMetrics();
  const vc = useVerticalConfig();
  const isDark = theme === 'dark' || theme === 'contrast';

  const previousRef = useRef(metrics);
  const [deltas, setDeltas] = useState({
    impressions: 0,
    clicks: 0,
    registrations: 0,
    ftds: 0,
    ngr: 0,
  });

  useEffect(() => {
    const previous = previousRef.current;
    const computeDelta = (current: number, old: number) =>
      old > 0 ? ((current - old) / old) * 100 : 0;
    setDeltas({
      impressions: computeDelta(metrics.totalImpressions, previous.totalImpressions),
      clicks: computeDelta(metrics.qualityClicks, previous.qualityClicks),
      registrations: computeDelta(metrics.registrations, previous.registrations),
      ftds: computeDelta(metrics.ftds, previous.ftds),
      ngr: computeDelta(metrics.ngr, previous.ngr),
    });
    previousRef.current = metrics;
  }, [metrics]);

  const nodes = useMemo(
    () => [
      {
        label: 'Total Impressions',
        value: Math.round(metrics.totalImpressions).toLocaleString('en-US'),
        subMetric: `${(metrics.impressionToClickRate * 100).toFixed(2)}% Imp-to-Click`,
        delta: deltas.impressions,
        tone: 'blue' as const,
      },
      {
        label: 'Quality Clicks',
        value: Math.round(metrics.qualityClicks).toLocaleString('en-US'),
        subMetric: `${(metrics.clickToRegistrationRate * 100).toFixed(2)}% Click-to-${vc.terms.registrationLabel}`,
        delta: deltas.clicks,
        tone: 'cyan' as const,
      },
      {
        label: vc.terms.registrationLabel,
        value: Math.round(metrics.registrations).toLocaleString('en-US'),
        subMetric: `${(metrics.registrationToFtdRate * 100).toFixed(1)}% ${vc.terms.regToConversionRateLabel}`,
        delta: deltas.registrations,
        tone: 'violet' as const,
      },
      {
        label: vc.terms.conversionPlural,
        value: Math.round(metrics.ftds).toLocaleString('en-US'),
        subMetric: `${format(metrics.ngrPerFtd)} ${vc.terms.revenuePerConversionLabel}`,
        delta: deltas.ftds,
        tone: 'emerald' as const,
      },
      {
        label: vc.terms.revenueMetric,
        value: format(metrics.ngr),
        subMetric:
          vc.vertical === 'igaming' ? 'Post-bonus & cost adjusted' : 'Projected gross revenue',
        delta: deltas.ngr,
        tone: 'amber' as const,
      },
    ],
    [deltas, format, metrics, vc]
  );

  return (
    <section
      className={cn(
        'w-full rounded-xl border p-6 shadow-lg transition-colors duration-300',
        isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
      )}
    >
      <h2
        className={cn(
          'text-xs font-semibold uppercase tracking-[0.18em] mb-5',
          isDark ? 'text-slate-300' : 'text-slate-700'
        )}
      >
        {vc.terms.velocityEngineTitle}
      </h2>
      <div className="flex flex-row items-stretch justify-between gap-4 overflow-x-auto pb-1">
        {nodes.map((node, index) => (
          <div key={node.label} className="flex items-center gap-4 min-w-[180px]">
            <FunnelNode
              label={node.label}
              value={node.value}
              subMetric={node.subMetric}
              isDark={isDark}
              delta={node.delta}
              tone={node.tone}
            />
            {index < nodes.length - 1 ? (
              <ChevronRight className="h-5 w-5 shrink-0 text-emerald-500 animate-pulse" />
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
