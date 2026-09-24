import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useBlendedMetrics, useChannelsWithMetrics, useMediaPlanStore, useCategoryTotals } from '@/hooks/use-media-plan-store';
import { useCurrency } from '@/contexts/CurrencyContext';
import { ShieldCheck, AlertTriangle, TrendingUp, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type VerticalType = 'casino' | 'sports' | 'poker' | 'bingo';

const BENCHMARK_ALLOCATIONS: Record<VerticalType, Record<string, number>> = {
  casino: {
    'Affiliate': 45,
    'Display/Programmatic': 20,
    'Paid Search': 15,
    'SEO/Content': 12,
    'Paid Social': 8,
  },
  sports: {
    'Affiliate': 30,
    'Display/Programmatic': 15,
    'Paid Search': 20,
    'SEO/Content': 10,
    'Paid Social': 25,
  },
  poker: {
    'Affiliate': 25,
    'Display/Programmatic': 15,
    'Paid Search': 15,
    'SEO/Content': 20,
    'Paid Social': 25,
  },
  bingo: {
    'Affiliate': 20,
    'Display/Programmatic': 30,
    'Paid Search': 15,
    'SEO/Content': 15,
    'Paid Social': 20,
  }
};

interface BenchmarkData {
  name: string;
  description: string;
  cpa: number;
  roas: number;
  ctr: number;
  cr: number;
}

const VERTICAL_BENCHMARKS: Record<VerticalType, BenchmarkData> = {
  casino: {
    name: 'Online Casino / Slots',
    description: 'High LTV players but extremely competitive acquisition with high CPA barriers.',
    cpa: 220,
    roas: 3.8,
    ctr: 1.6,
    cr: 2.5
  },
  sports: {
    name: 'Sportsbook / Betting',
    description: 'Higher conversion rates and search CTR, lower individual player LTV and CPA.',
    cpa: 110,
    roas: 2.5,
    ctr: 3.2,
    cr: 4.0
  },
  poker: {
    name: 'iGaming Poker',
    description: 'Niche skill-based players with moderate conversion rates and long-term retention potential.',
    cpa: 140,
    roas: 3.0,
    ctr: 1.8,
    cr: 3.0
  },
  bingo: {
    name: 'Online Bingo / Social iGaming',
    description: 'Low barriers, low average CPA, high volumes, but lower individual deposit values.',
    cpa: 70,
    roas: 2.1,
    ctr: 2.4,
    cr: 3.5
  }
};

export function IndustryBenchmarks() {
  const [vertical, setVertical] = useState<VerticalType>('casino');
  const [showAllocations, setShowAllocations] = useState(false);
  const blended = useBlendedMetrics();
  const channels = useChannelsWithMetrics();
  const categoryTotals = useCategoryTotals();
  const { symbol, format: formatCurrency } = useCurrency();

  const benchmark = VERTICAL_BENCHMARKS[vertical];
  const benchmarkAlloc = BENCHMARK_ALLOCATIONS[vertical];

  // Compute blended CTR from channels
  const planCtr = useMemo(() => {
    let totalImpr = 0;
    let totalClicks = 0;
    channels.forEach(ch => {
      if (ch.isActive) {
        totalImpr += ch.metrics.impressions;
        totalClicks += ch.metrics.clicks;
      }
    });
    return totalImpr > 0 ? (totalClicks / totalImpr) * 100 : 0.0;
  }, [channels]);

  // Compute blended CR
  const planCr = useMemo(() => {
    let totalClicks = 0;
    let totalFTDs = 0;
    channels.forEach(ch => {
      if (ch.isActive) {
        totalClicks += ch.metrics.clicks;
        totalFTDs += ch.metrics.conversions;
      }
    });
    return totalClicks > 0 ? (totalFTDs / totalClicks) * 100 : 0.0;
  }, [channels]);

  const planCpa = blended.blendedCpa || 0;
  const planRoas = blended.blendedRoas;

  // Comparison logic:
  // CPA: lower is better
  // ROAS: higher is better
  // CTR: higher is better
  // CR: higher is better
  const compareCpa = planCpa === 0 ? 0 : ((benchmark.cpa - planCpa) / benchmark.cpa) * 100;
  const compareRoas = ((planRoas - benchmark.roas) / benchmark.roas) * 100;
  const compareCtr = planCtr === 0 ? 0 : ((planCtr - benchmark.ctr) / benchmark.ctr) * 100;
  const compareCr = planCr === 0 ? 0 : ((planCr - benchmark.cr) / benchmark.cr) * 100;

  return (
    <Card className="border-border bg-slate-900/60 backdrop-blur-md">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/40 pb-4">
        <div>
          <CardTitle className="text-lg font-bold text-white">iGaming Industry Benchmarks</CardTitle>
          <CardDescription className="text-slate-400">
            Compare your blended planning metrics against standard B2B iGaming verticals.
          </CardDescription>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 border-r border-slate-800 pr-4">
            <span className="text-xs text-slate-400 font-medium">Compare Allocations</span>
            <input
              type="checkbox"
              checked={showAllocations}
              onChange={(e) => setShowAllocations(e.target.checked)}
              className="rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
            />
          </div>
          <div className="w-[200px]">
            <Select value={vertical} onValueChange={(v) => setVertical(v as VerticalType)}>
              <SelectTrigger className="bg-slate-950 border-slate-800 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-950 border-slate-800 text-white">
                {Object.entries(VERTICAL_BENCHMARKS).map(([key, data]) => (
                  <SelectItem key={key} value={key} className="focus:bg-indigo-600 focus:text-white">
                    {data.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        <div className="text-sm text-slate-300 bg-slate-950/40 p-3 rounded-lg border border-slate-800/60 leading-relaxed">
          <strong>Vertical Insights:</strong> {benchmark.description}
        </div>

        {showAllocations ? (
          <div className="space-y-6">
            <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider mb-2">Category Budget Allocation vs Industry Benchmark</h3>
            <div className="space-y-4 bg-slate-950/40 p-5 rounded-xl border border-slate-800/80">
              {Object.entries(benchmarkAlloc).map(([category, benchPct]) => {
                const planPct = categoryTotals[category as any]?.percentage || 0;
                const difference = planPct - benchPct;

                return (
                  <div key={category} className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-slate-300">
                        {category === 'Display/Programmatic' ? 'Paid Media (Display)' : category === 'Paid Social' ? 'Influencers / Social' : category}
                      </span>
                      <div className="flex items-center gap-2 font-mono">
                        <span className="text-indigo-400">Plan: {planPct.toFixed(1)}%</span>
                        <span className="text-slate-500">|</span>
                        <span className="text-slate-400">Benchmark: {benchPct}%</span>
                        {Math.abs(difference) > 0.5 && (
                          <span className={cn(
                            "text-[10px] px-1 rounded ml-1",
                            difference > 0 ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          )}>
                            {difference > 0 ? `+${difference.toFixed(1)}%` : `${difference.toFixed(1)}%`}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Double progress bar visual */}
                    <div className="space-y-1">
                      {/* Active plan bar (Indigo) */}
                      <div className="h-2 bg-slate-850 rounded-full overflow-hidden relative">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
                          style={{ width: `${Math.min(100, planPct)}%` }}
                        />
                      </div>
                      {/* Industry standard bar (Dashed or subtle cyan/slate) */}
                      <div className="h-1 bg-slate-800 rounded-full overflow-hidden relative">
                        <div
                          className="h-full bg-slate-600 transition-all duration-500"
                          style={{ width: `${benchPct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="text-[11px] text-slate-500 leading-normal bg-slate-950/20 p-3 rounded-lg border border-slate-900">
              * The double progress bar shows your active plan allocation percentage (indigo, top thicker bar) directly aligned against the vertical's industry average benchmark allocation (grey, bottom thin bar) to identify structural differences in strategy.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 1. ROAS comparison */}
            <BenchmarkCard
              title="Blended ROAS"
              planVal={`${planRoas.toFixed(2)}x`}
              benchVal={`${benchmark.roas.toFixed(1)}x`}
              pct={compareRoas}
              better={planRoas >= benchmark.roas}
              unit="x"
              desc="Return on Ad Spend tells you the revenue generated per unit currency spent."
            />

            {/* 2. CPA comparison */}
            <BenchmarkCard
              title="Blended CPA"
              planVal={planCpa > 0 ? `${symbol}${Math.round(planCpa)}` : '--'}
              benchVal={`${symbol}${benchmark.cpa}`}
              pct={compareCpa}
              better={planCpa > 0 && planCpa <= benchmark.cpa}
              invertColors // CPA lower is better
              unit="CPA"
              desc="Cost Per Acquisition (FTD) benchmark is crucial to verify affiliate deal thresholds."
            />

            {/* 3. CTR comparison */}
            <BenchmarkCard
              title="Click-Through Rate (CTR)"
              planVal={`${planCtr.toFixed(2)}%`}
              benchVal={`${benchmark.ctr.toFixed(1)}%`}
              pct={compareCtr}
              better={planCtr >= benchmark.ctr}
              unit="%"
              desc="Aggregated media plan ad click density. Higher CTR indicates better hook relevance."
            />

            {/* 4. Conversion Rate (CR) */}
            <BenchmarkCard
              title="Conversion Rate (CR)"
              planVal={`${planCr.toFixed(2)}%`}
              benchVal={`${benchmark.cr.toFixed(1)}%`}
              pct={compareCr}
              better={planCr >= benchmark.cr}
              unit="%"
              desc="Percentage of site/landing page clicks converted to First Time Depositors (FTDs)."
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BenchmarkCard({
  title,
  planVal,
  benchVal,
  pct,
  better,
  invertColors = false,
  desc
}: {
  title: string;
  planVal: string;
  benchVal: string;
  pct: number;
  better: boolean;
  invertColors?: boolean;
  unit?: string;
  desc?: string;
}) {
  const pctStr = pct > 0 ? `+${pct.toFixed(0)}%` : `${pct.toFixed(0)}%`;
  
  // Decide positive color behavior
  const isPositiveBetter = invertColors ? !better : better;
  
  let labelColor = "text-yellow-400 border-yellow-500/20 bg-yellow-500/5";
  let Icon = AlertTriangle;
  
  if (better) {
    labelColor = "text-emerald-400 border-emerald-500/20 bg-emerald-500/5";
    Icon = ShieldCheck;
  } else if (pct === 0) {
    labelColor = "text-slate-400 border-slate-800 bg-slate-900/50";
    Icon = HelpCircle;
  } else {
    labelColor = "text-red-400 border-red-500/20 bg-red-500/5";
    Icon = AlertTriangle;
  }

  return (
    <div className="border border-border/40 bg-slate-950/30 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700/50 transition-colors">
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="font-semibold text-slate-200 text-sm">{title}</span>
          <Badge variant="outline" className={cn("text-[10px] font-bold px-2 py-0.5", labelColor)}>
            <Icon className="h-3 w-3 mr-1" />
            {pct === 0 ? "No plan data" : better ? "Outperforming" : "Needs Optimization"}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-4 my-2">
          <div className="bg-slate-900/40 p-2.5 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">Your Plan</span>
            <p className="text-xl font-bold text-white font-mono mt-0.5">{planVal}</p>
          </div>
          <div className="bg-slate-900/40 p-2.5 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">iGaming Avg</span>
            <p className="text-xl font-bold text-slate-300 font-mono mt-0.5">{benchVal}</p>
          </div>
        </div>

        {pct !== 0 && (
          <div className="flex items-center gap-1.5 text-xs mt-3 text-slate-400 font-medium">
            <TrendingUp className={cn("h-3.5 w-3.5", better ? "text-emerald-500" : "text-red-500")} />
            <span>Plan is</span>
            <span className={cn("font-bold font-mono", better ? "text-emerald-400" : "text-red-400")}>
              {Math.abs(pct).toFixed(0)}% {better ? "better" : "worse"}
            </span>
            <span>than benchmark.</span>
          </div>
        )}
      </div>

      <p className="text-[10px] text-slate-500 italic mt-3 pt-3 border-t border-slate-900">
        {desc}
      </p>
    </div>
  );
}
