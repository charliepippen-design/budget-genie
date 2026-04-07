import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Lock, Sparkles, TrendingUp, TimerReset, Landmark } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useBlendedMetrics,
  useChannelsWithMetrics,
  useMediaPlanStore,
} from '@/hooks/use-media-plan-store';
import { useCurrency } from '@/contexts/CurrencyContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip as ReactTooltip } from 'react-tooltip';
import {
  buildScenarioEnvelope,
  getChannelGroup,
  GROUP_LABELS,
  type ChannelGroup,
} from '@/lib/planning-insights';
import { useTheme } from '@/hooks/use-theme';
import { Switch } from '@/components/ui/switch';
import { SandboxSpendChart } from '@/components/dashboard/SandboxSpendChart';
import { ScenarioChart } from '@/components/dashboard/ScenarioChart';
import { useSandboxStore, type ChannelSandboxAdjustment } from '@/store/useSandboxStore';

interface LtvCurvePoint {
  month: number;
  label: string;
  cumulativeLtvPerUser: number;
  monthlyLtvPerUser: number;
  cohortValue: number;
  netCohortValue: number;
  ltvToCac: number;
  cpaLine: number;
}

interface ScenarioPoint {
  scenario: 'Bear' | 'Base' | 'Bull';
  projectedLtvPerUser: number;
  projectedCohortValue: number;
  ltvToCac: number;
}

interface AggregateMetrics {
  totalSpend: number;
  totalConversions: number;
  projectedRevenue: number;
  blendedCpa: number | null;
  blendedRoas: number;
  roi: number;
}

type DecayCurveArchitecture =
  | 'standard-linear'
  | 'front-loaded-dropoff'
  | 'stable-long-term-retention';

const SCENARIO_COLORS = {
  Bear: '#ef4444',
  Base: '#14b8a6',
  Bull: '#22c55e',
};

const SCENARIO_DOT_CLASS = {
  Bear: 'bg-rose-500',
  Base: 'bg-teal-500',
  Bull: 'bg-emerald-500',
};

const SANDBOX_INCREASE_FILL = 'rgba(34,197,94,0.82)';
const SANDBOX_DECREASE_FILL = 'rgba(239,68,68,0.82)';
const SANDBOX_NEUTRAL_FILL = 'rgba(99,102,241,0.82)';

const SANDBOX_DEFAULT_ADJUSTMENT: ChannelSandboxAdjustment = {
  spendPct: 0,
  cpaPct: 0,
  roasPct: 0,
  churnPct: 0,
};

const CHANNEL_GROUPS: ChannelGroup[] = ['organic', 'paid', 'affiliate', 'influencer'];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

type ObservedLtvPoints = {
  m1: number | null;
  m3: number | null;
  m6: number | null;
};

function toAnchors(observed: ObservedLtvPoints): Array<{ month: number; value: number }> {
  const candidates = [
    { month: 1, value: observed.m1 },
    { month: 3, value: observed.m3 },
    { month: 6, value: observed.m6 },
  ];

  return candidates
    .filter((entry): entry is { month: number; value: number } => {
      return entry.value !== null && Number.isFinite(entry.value) && entry.value > 0;
    })
    .sort((a, b) => a.month - b.month);
}

function applyObservedCalibration(
  baselineCumulative: number[],
  observed: ObservedLtvPoints
): { cumulative: number[]; multiplier: number; isCalibrated: boolean } {
  const anchors = toAnchors(observed);
  if (anchors.length === 0 || baselineCumulative.length === 0) {
    return {
      cumulative: baselineCumulative,
      multiplier: 1,
      isCalibrated: false,
    };
  }

  const lastAnchor = anchors[anchors.length - 1];
  const baselineAtLastAnchor = baselineCumulative[lastAnchor.month - 1] || 1;
  const scaleAtLastAnchor = lastAnchor.value / Math.max(1, baselineAtLastAnchor);
  const projectedMonth12 = Math.max(
    lastAnchor.value,
    baselineCumulative[11] * clamp(scaleAtLastAnchor, 0.25, 4)
  );

  const segmentAnchors = [{ month: 0, value: 0 }, ...anchors];
  if (segmentAnchors[segmentAnchors.length - 1].month < 12) {
    segmentAnchors.push({ month: 12, value: projectedMonth12 });
  }

  const calibrated = [...baselineCumulative];
  for (let month = 1; month <= 12; month += 1) {
    const right = segmentAnchors.find((anchor) => anchor.month >= month);
    const left = [...segmentAnchors].reverse().find((anchor) => anchor.month <= month);

    if (!left || !right) {
      calibrated[month - 1] = baselineCumulative[month - 1];
      continue;
    }

    if (left.month === right.month) {
      calibrated[month - 1] = left.value;
      continue;
    }

    const progress = (month - left.month) / (right.month - left.month);
    const interpolated = left.value + (right.value - left.value) * progress;
    calibrated[month - 1] = Math.max(0, interpolated);
  }

  for (let idx = 1; idx < calibrated.length; idx += 1) {
    if (calibrated[idx] < calibrated[idx - 1]) {
      calibrated[idx] = calibrated[idx - 1];
    }
  }

  const baselineTerminal = Math.max(0.01, baselineCumulative[11]);
  const multiplier = calibrated[11] / baselineTerminal;

  return {
    cumulative: calibrated,
    multiplier: clamp(multiplier, 0.25, 4),
    isCalibrated: true,
  };
}

export function LtvForecastPanel() {
  const blended = useBlendedMetrics();
  const channels = useChannelsWithMetrics();
  const playerValue = useMediaPlanStore((state) => state.globalMultipliers.playerValue);
  const observedLtv = useMediaPlanStore((state) => state.observedLtv);
  const setObservedLtv = useMediaPlanStore((state) => state.setObservedLtv);
  const clearObservedLtv = useMediaPlanStore((state) => state.clearObservedLtv);
  const userStatus = useMediaPlanStore((state) => state.userStatus);
  const { format: formatCurrency, symbol } = useCurrency();
  const { theme } = useTheme();
  const isDark = theme === 'dark' || theme === 'contrast';
  const isDemo = userStatus === 'demo';

  const [churnRatePct, setChurnRatePct] = useState(4.2);
  const [cpaShockPct, setCpaShockPct] = useState(0);
  const [roasLiftPct, setRoasLiftPct] = useState(0);
  const [isExpanded, setIsExpanded] = useState(true);
  const [decayCurve, setDecayCurve] = useState<DecayCurveArchitecture>('standard-linear');
  const [activeSlider, setActiveSlider] = useState<'churn' | 'cpa' | 'roas' | null>(null);
  const sandboxEnabled = useSandboxStore((state) => state.sandboxEnabled);
  const selectedChannelIds = useSandboxStore((state) => state.selectedChannelIds);
  const channelAdjustments = useSandboxStore((state) => state.channelAdjustments);
  const groupAdjustments = useSandboxStore((state) => state.groupAdjustments);
  const channelFilter = useSandboxStore((state) => state.channelFilter);
  const collapsedGroups = useSandboxStore((state) => state.collapsedGroups);
  const setSandboxEnabled = useSandboxStore((state) => state.setSandboxEnabled);
  const toggleChannelSelection = useSandboxStore((state) => state.toggleChannelSelection);
  const setChannelAdjustment = useSandboxStore((state) => state.setChannelAdjustment);
  const setGroupAdjustment = useSandboxStore((state) => state.setGroupAdjustment);
  const setChannelFilter = useSandboxStore((state) => state.setChannelFilter);
  const toggleGroupCollapsed = useSandboxStore((state) => state.toggleGroupCollapsed);
  const resetSandbox = useSandboxStore((state) => state.resetSandbox);
  const setExportSnapshot = useSandboxStore((state) => state.setExportSnapshot);

  const chartAxisColor = theme === 'dark' ? '#94a3b8' : '#475569';
  const chartGridColor = theme === 'dark' ? 'rgba(100,116,139,0.22)' : 'rgba(148,163,184,0.32)';
  const tooltipStyle =
    theme === 'dark'
      ? {
          backgroundColor: 'rgba(2,6,23,0.95)',
          border: '1px solid rgba(71,85,105,0.7)',
          borderRadius: '12px',
          color: '#e2e8f0',
        }
      : {
          backgroundColor: 'rgba(255,255,255,0.98)',
          border: '1px solid rgba(148,163,184,0.6)',
          borderRadius: '12px',
          color: '#1f2937',
        };

  const baselineMetrics = useMemo<AggregateMetrics>(
    () => ({
      totalSpend: blended.totalSpend,
      totalConversions: blended.totalConversions,
      projectedRevenue: blended.projectedRevenue,
      blendedCpa: blended.blendedCpa,
      blendedRoas: blended.blendedRoas,
      roi:
        blended.totalSpend > 0
          ? (blended.projectedRevenue - blended.totalSpend) / blended.totalSpend
          : 0,
    }),
    [blended]
  );

  const selectedSet = useMemo(() => new Set(selectedChannelIds), [selectedChannelIds]);

  const sandboxChannelMetrics = useMemo(() => {
    return channels.map((channel) => {
      const group = getChannelGroup(channel);
      const groupDelta = groupAdjustments[group] ?? 0;
      const adjustment = selectedSet.has(channel.id)
        ? (channelAdjustments[channel.id] ?? SANDBOX_DEFAULT_ADJUSTMENT)
        : SANDBOX_DEFAULT_ADJUSTMENT;

      const spendMultiplier =
        (1 + groupDelta / 100) * (1 + clamp(adjustment.spendPct, -80, 200) / 100);
      const adjustedSpend = Math.max(0, channel.metrics.spend * spendMultiplier);

      const baselineCpa =
        channel.metrics.cpa ??
        (channel.metrics.conversions > 0 ? channel.metrics.spend / channel.metrics.conversions : 0);
      const adjustedCpa = Math.max(
        0.01,
        baselineCpa * (1 + clamp(adjustment.cpaPct, -70, 300) / 100)
      );

      const baselineRoas = Math.max(0, channel.metrics.roas);
      const adjustedRoas = Math.max(
        0,
        baselineRoas * (1 + clamp(adjustment.roasPct, -90, 300) / 100)
      );

      const churnEffect = Math.max(0.35, 1 - (clamp(adjustment.churnPct, -50, 80) / 100) * 0.25);
      const conversionsFromCpa =
        adjustedCpa > 0 ? adjustedSpend / adjustedCpa : channel.metrics.conversions;
      const adjustedConversions = Math.max(0, conversionsFromCpa * churnEffect);
      const adjustedRevenue = adjustedSpend * adjustedRoas * churnEffect;

      return {
        channelId: channel.id,
        channelName: channel.name,
        group,
        baselineSpend: channel.metrics.spend,
        adjustedSpend,
        baselineCpa,
        adjustedCpa,
        baselineRoas,
        adjustedRoas,
        adjustedConversions,
        adjustedRevenue,
        churnPct: adjustment.churnPct,
      };
    });
  }, [channelAdjustments, channels, groupAdjustments, selectedSet]);

  const weightedSandboxChurnDeltaPct = useMemo(() => {
    const activeChannels = sandboxChannelMetrics.filter((channel) =>
      selectedSet.has(channel.channelId)
    );
    const totalSelectedSpend = activeChannels.reduce(
      (sum, channel) => sum + channel.adjustedSpend,
      0
    );

    if (totalSelectedSpend <= 0) {
      return 0;
    }

    return activeChannels.reduce(
      (sum, channel) => sum + (channel.adjustedSpend / totalSelectedSpend) * channel.churnPct,
      0
    );
  }, [sandboxChannelMetrics, selectedSet]);

  const sandboxMetrics = useMemo<AggregateMetrics>(() => {
    const totals = sandboxChannelMetrics.reduce(
      (acc, channel) => {
        acc.spend += channel.adjustedSpend;
        acc.revenue += channel.adjustedRevenue;
        acc.conversions += channel.adjustedConversions;
        return acc;
      },
      { spend: 0, revenue: 0, conversions: 0 }
    );

    const blendedCpa = totals.conversions > 0 ? totals.spend / totals.conversions : null;
    const blendedRoas = totals.spend > 0 ? totals.revenue / totals.spend : 0;

    return {
      totalSpend: totals.spend,
      totalConversions: totals.conversions,
      projectedRevenue: totals.revenue,
      blendedCpa,
      blendedRoas,
      roi: totals.spend > 0 ? (totals.revenue - totals.spend) / totals.spend : 0,
    };
  }, [sandboxChannelMetrics]);

  const activeMetrics = sandboxEnabled ? sandboxMetrics : baselineMetrics;

  const assumptions = useMemo(
    () => ({
      churnRate: clamp(
        (churnRatePct + (sandboxEnabled ? weightedSandboxChurnDeltaPct : 0)) / 100,
        0.01,
        0.2
      ),
      cpaMultiplier: 1 + cpaShockPct / 100,
      roasMultiplier: 1 + roasLiftPct / 100,
    }),
    [churnRatePct, cpaShockPct, roasLiftPct, sandboxEnabled, weightedSandboxChurnDeltaPct]
  );

  const scenarioCalibration = useMemo(() => {
    const roasLift = 1 + roasLiftPct / 100;

    const computeBaselineCumulative = (blendedRoas: number) => {
      const monthlyChurnRate = assumptions.churnRate;
      const baseExpansion = clamp(
        0.008 + Math.max(0, blendedRoas * roasLift - 1) * 0.004,
        0.008,
        0.05
      );
      const monthlyExpansionRate =
        decayCurve === 'front-loaded-dropoff'
          ? clamp(baseExpansion * 0.85, 0.006, 0.05)
          : decayCurve === 'stable-long-term-retention'
            ? clamp(baseExpansion * 1.1, 0.008, 0.055)
            : baseExpansion;

      const initialMonetization = playerValue * 0.15 * roasLift;
      let rollingRetention = 1;
      let cumulative = 0;

      return Array.from({ length: 12 }, (_, idx) => {
        const month = idx + 1;
        const dynamicChurnRate =
          decayCurve === 'front-loaded-dropoff'
            ? month <= 3
              ? monthlyChurnRate * 1.7
              : monthlyChurnRate * 0.72
            : decayCurve === 'stable-long-term-retention'
              ? month <= 3
                ? monthlyChurnRate * 0.72
                : monthlyChurnRate * 0.85
              : monthlyChurnRate;

        rollingRetention *= 1 - clamp(dynamicChurnRate, 0.003, 0.35);
        const retention = rollingRetention;
        const expansion = 1 + monthlyExpansionRate * idx;
        const monthlyLtvPerUser = initialMonetization * retention * expansion;
        cumulative += monthlyLtvPerUser;
        return cumulative;
      });
    };

    const baselineCal = applyObservedCalibration(
      computeBaselineCumulative(Math.max(0, baselineMetrics.blendedRoas)),
      observedLtv
    );
    const activeCal = applyObservedCalibration(
      computeBaselineCumulative(Math.max(0, activeMetrics.blendedRoas)),
      observedLtv
    );

    return {
      baselineMultiplier: baselineCal.multiplier,
      activeMultiplier: activeCal.multiplier,
      isCalibrated: baselineCal.isCalibrated,
    };
  }, [
    activeMetrics.blendedRoas,
    assumptions.churnRate,
    baselineMetrics.blendedRoas,
    decayCurve,
    observedLtv,
    playerValue,
    roasLiftPct,
  ]);

  const baselineScenarioData = useMemo(
    () =>
      buildScenarioEnvelope({
        baseLtvPerUser:
          (baselineMetrics.blendedCpa ?? 0) *
          Math.max(0, baselineMetrics.blendedRoas) *
          scenarioCalibration.baselineMultiplier,
        conversions: baselineMetrics.totalConversions,
        cpa: baselineMetrics.blendedCpa ?? 0,
        assumptions,
      }) as ScenarioPoint[],
    [assumptions, baselineMetrics, scenarioCalibration.baselineMultiplier]
  );

  const scenarioData = useMemo(
    () =>
      buildScenarioEnvelope({
        baseLtvPerUser:
          (activeMetrics.blendedCpa ?? 0) *
          Math.max(0, activeMetrics.blendedRoas) *
          scenarioCalibration.activeMultiplier,
        conversions: activeMetrics.totalConversions,
        cpa: activeMetrics.blendedCpa ?? 0,
        assumptions,
      }) as ScenarioPoint[],
    [activeMetrics, assumptions, scenarioCalibration.activeMultiplier]
  );

  const baselineScenarioLookup = useMemo(
    () =>
      baselineScenarioData.reduce<Record<string, ScenarioPoint>>((acc, item) => {
        acc[item.scenario] = item;
        return acc;
      }, {}),
    [baselineScenarioData]
  );

  const activeSummaryText = useMemo(() => {
    const baselineRoiPct = baselineMetrics.roi * 100;
    const sandboxRoiPct = sandboxMetrics.roi * 100;
    const roiDeltaPct = sandboxRoiPct - baselineRoiPct;

    const paidChannels = sandboxChannelMetrics.filter((item) => item.group === 'paid');
    const paidBaselineSpend = paidChannels.reduce((sum, item) => sum + item.baselineSpend, 0);
    const paidSandboxSpend = paidChannels.reduce((sum, item) => sum + item.adjustedSpend, 0);

    const paidBaselineRoas =
      paidBaselineSpend > 0
        ? paidChannels.reduce((sum, item) => sum + item.baselineRoas * item.baselineSpend, 0) /
          paidBaselineSpend
        : 0;
    const paidSandboxRoas =
      paidSandboxSpend > 0
        ? paidChannels.reduce((sum, item) => sum + item.adjustedRoas * item.adjustedSpend, 0) /
          paidSandboxSpend
        : 0;

    const paidRiskRaised =
      paidSandboxRoas < paidBaselineRoas * 0.92 ||
      (paidBaselineSpend > 0 && paidSandboxSpend > paidBaselineSpend * 1.18);

    const direction = roiDeltaPct >= 0 ? 'increase' : 'reduce';
    const riskSignals = [
      paidRiskRaised ? 'raise risk in Paid Ads' : null,
      weightedSandboxChurnDeltaPct > 2.5 ? 'increase churn pressure' : null,
    ].filter(Boolean);

    const riskText =
      riskSignals.length > 0 ? `but ${riskSignals.join(' and ')}.` : 'while keeping risk stable.';

    return `Your changes ${direction} total ROI by ${Math.abs(roiDeltaPct).toFixed(1)}% ${riskText}`;
  }, [
    baselineMetrics.roi,
    sandboxChannelMetrics,
    sandboxMetrics.roi,
    weightedSandboxChurnDeltaPct,
  ]);

  const groupImpactData = useMemo(() => {
    return CHANNEL_GROUPS.map((group) => {
      const groupChannels = sandboxChannelMetrics.filter((channel) => channel.group === group);
      const baselineSpend = groupChannels.reduce((sum, item) => sum + item.baselineSpend, 0);
      const sandboxSpend = groupChannels.reduce((sum, item) => sum + item.adjustedSpend, 0);
      const delta = sandboxSpend - baselineSpend;

      return {
        group: GROUP_LABELS[group],
        baselineSpend,
        sandboxSpend,
        delta,
        sandboxFill:
          delta > 0
            ? SANDBOX_INCREASE_FILL
            : delta < 0
              ? SANDBOX_DECREASE_FILL
              : SANDBOX_NEUTRAL_FILL,
      };
    });
  }, [sandboxChannelMetrics]);

  const spendDistributionSummary = useMemo(() => {
    const increases = groupImpactData.filter((item) => item.delta > 0).map((item) => item.group);
    const decreases = groupImpactData.filter((item) => item.delta < 0).map((item) => item.group);

    const increaseText =
      increases.length > 0 ? `Increases: ${increases.join(', ')}.` : 'No group increases.';
    const decreaseText =
      decreases.length > 0 ? `Decreases: ${decreases.join(', ')}.` : 'No group decreases.';

    return `${increaseText} ${decreaseText}`;
  }, [groupImpactData]);

  const baselineAllocationData = useMemo(
    () =>
      sandboxChannelMetrics.map((channel) => ({
        channel: channel.channelName,
        spend: channel.baselineSpend,
      })),
    [sandboxChannelMetrics]
  );

  const adjustedAllocationData = useMemo(
    () =>
      sandboxChannelMetrics.map((channel) => ({
        channel: channel.channelName,
        spend: channel.adjustedSpend,
      })),
    [sandboxChannelMetrics]
  );

  const shouldShowChannelScaling = channels.length > 6;

  const filteredGroupedChannels = useMemo(() => {
    const normalizedFilter = channelFilter.trim().toLowerCase();

    return CHANNEL_GROUPS.map((group) => ({
      group,
      channels: channels.filter((channel) => {
        const matchesGroup = getChannelGroup(channel) === group;
        const matchesFilter =
          normalizedFilter.length === 0 ||
          channel.name.toLowerCase().includes(normalizedFilter) ||
          GROUP_LABELS[group].toLowerCase().includes(normalizedFilter);

        return matchesGroup && matchesFilter;
      }),
    })).filter((entry) => entry.channels.length > 0);
  }, [channelFilter, channels]);

  const baselineScenarioRoiData = useMemo(
    () =>
      baselineScenarioData.map((scenario) => ({
        scenario: scenario.scenario,
        roi:
          baselineMetrics.totalSpend > 0
            ? ((scenario.projectedCohortValue - baselineMetrics.totalSpend) /
                baselineMetrics.totalSpend) *
              100
            : 0,
      })),
    [baselineMetrics.totalSpend, baselineScenarioData]
  );

  const adjustedScenarioRoiData = useMemo(
    () =>
      scenarioData.map((scenario) => ({
        scenario: scenario.scenario,
        roi:
          sandboxMetrics.totalSpend > 0
            ? ((scenario.projectedCohortValue - sandboxMetrics.totalSpend) /
                sandboxMetrics.totalSpend) *
              100
            : 0,
      })),
    [sandboxMetrics.totalSpend, scenarioData]
  );

  const scenarioComparisonSummary = useMemo(() => {
    const baseScenario = baselineScenarioRoiData.find((scenario) => scenario.scenario === 'Base');
    const adjustedBaseScenario = adjustedScenarioRoiData.find(
      (scenario) => scenario.scenario === 'Base'
    );

    if (!baseScenario || !adjustedBaseScenario) {
      return 'Scenario comparison unavailable.';
    }

    const delta = adjustedBaseScenario.roi - baseScenario.roi;
    const direction = delta >= 0 ? 'up' : 'down';

    return `Base-case ROI projection is ${direction} ${Math.abs(delta).toFixed(1)} points versus baseline.`;
  }, [adjustedScenarioRoiData, baselineScenarioRoiData]);

  const { curveData, monthlyChurn, monthlyExpansion, paybackMonth } = useMemo(() => {
    const safeCpa = (activeMetrics.blendedCpa ?? 0) * (1 + cpaShockPct / 100);
    const safeConversions = Math.max(0, activeMetrics.totalConversions);

    const monthlyChurnRate = assumptions.churnRate;
    const roasLift = 1 + roasLiftPct / 100;
    const baseExpansion = clamp(
      0.008 + Math.max(0, activeMetrics.blendedRoas * roasLift - 1) * 0.004,
      0.008,
      0.05
    );
    const monthlyExpansionRate =
      decayCurve === 'front-loaded-dropoff'
        ? clamp(baseExpansion * 0.85, 0.006, 0.05)
        : decayCurve === 'stable-long-term-retention'
          ? clamp(baseExpansion * 1.1, 0.008, 0.055)
          : baseExpansion;

    const initialMonetization = playerValue * 0.15 * roasLift;
    let cumulativeLtvPerUser = 0;
    let rollingRetention = 1;

    const baselineCumulative: number[] = [];
    const baselineMonthly: number[] = [];

    Array.from({ length: 12 }, (_, idx) => {
      const month = idx + 1;
      const dynamicChurnRate =
        decayCurve === 'front-loaded-dropoff'
          ? month <= 3
            ? monthlyChurnRate * 1.7
            : monthlyChurnRate * 0.72
          : decayCurve === 'stable-long-term-retention'
            ? month <= 3
              ? monthlyChurnRate * 0.72
              : monthlyChurnRate * 0.85
            : monthlyChurnRate;
      rollingRetention *= 1 - clamp(dynamicChurnRate, 0.003, 0.35);
      const retention = rollingRetention;
      const expansion = 1 + monthlyExpansionRate * idx;
      const monthlyLtvPerUser = initialMonetization * retention * expansion;

      cumulativeLtvPerUser += monthlyLtvPerUser;

      baselineMonthly.push(monthlyLtvPerUser);
      baselineCumulative.push(cumulativeLtvPerUser);
    });

    const calibratedCurve = applyObservedCalibration(baselineCumulative, observedLtv);

    const points: LtvCurvePoint[] = Array.from({ length: 12 }, (_, idx) => {
      const month = idx + 1;
      const calibratedCumulative = calibratedCurve.cumulative[idx] ?? baselineCumulative[idx] ?? 0;
      const previousCumulative =
        idx === 0 ? 0 : (calibratedCurve.cumulative[idx - 1] ?? baselineCumulative[idx - 1] ?? 0);
      const monthlyLtvPerUser = Math.max(
        0,
        calibratedCumulative - previousCumulative || baselineMonthly[idx] || 0
      );

      const cohortValue = calibratedCumulative * safeConversions;
      const netCohortValue = cohortValue - activeMetrics.totalSpend;
      const ltvToCac = safeCpa > 0 ? calibratedCumulative / safeCpa : 0;

      return {
        month,
        label: `M${month}`,
        cumulativeLtvPerUser: calibratedCumulative,
        monthlyLtvPerUser,
        cohortValue,
        netCohortValue,
        ltvToCac,
        cpaLine: safeCpa,
      };
    });

    const payback = points.find((point) => point.ltvToCac >= 1)?.month ?? null;

    return {
      curveData: points,
      monthlyChurn: monthlyChurnRate,
      monthlyExpansion: monthlyExpansionRate,
      paybackMonth: payback,
    };
  }, [
    activeMetrics,
    assumptions.churnRate,
    cpaShockPct,
    decayCurve,
    observedLtv,
    playerValue,
    roasLiftPct,
  ]);

  const terminalPoint = curveData[curveData.length - 1];

  const handleChannelAdjustment = (
    channelId: string,
    field: keyof ChannelSandboxAdjustment,
    value: number
  ) => {
    setChannelAdjustment(channelId, field, value);
  };

  useEffect(() => {
    setExportSnapshot({
      enabled: sandboxEnabled,
      summaryText: activeSummaryText,
      baselineMetrics: {
        ...baselineMetrics,
        roiPct: baselineMetrics.roi * 100,
      },
      adjustedMetrics: {
        ...sandboxMetrics,
        roiPct: sandboxMetrics.roi * 100,
      },
      channelComparisons: sandboxChannelMetrics.map((channel) => ({
        channelId: channel.channelId,
        channelName: channel.channelName,
        group: channel.group,
        baselineSpend: channel.baselineSpend,
        adjustedSpend: channel.adjustedSpend,
        baselineCpa: channel.baselineCpa,
        adjustedCpa: channel.adjustedCpa,
        baselineRoas: channel.baselineRoas,
        adjustedRoas: channel.adjustedRoas,
        churnPct: channel.churnPct,
      })),
      scenarioComparisons: baselineScenarioData.map((baselineScenario) => {
        const adjustedScenario =
          scenarioData.find((scenario) => scenario.scenario === baselineScenario.scenario) ??
          baselineScenario;
        const baselineRoiPct =
          baselineMetrics.totalSpend > 0
            ? ((baselineScenario.projectedCohortValue - baselineMetrics.totalSpend) /
                baselineMetrics.totalSpend) *
              100
            : 0;
        const adjustedRoiPct =
          sandboxMetrics.totalSpend > 0
            ? ((adjustedScenario.projectedCohortValue - sandboxMetrics.totalSpend) /
                sandboxMetrics.totalSpend) *
              100
            : 0;

        return {
          scenario: baselineScenario.scenario,
          baselineProjectedCohortValue: baselineScenario.projectedCohortValue,
          adjustedProjectedCohortValue: adjustedScenario.projectedCohortValue,
          baselineLtvToCac: baselineScenario.ltvToCac,
          adjustedLtvToCac: adjustedScenario.ltvToCac,
          baselineRoiPct,
          adjustedRoiPct,
        };
      }),
    });
  }, [
    activeSummaryText,
    baselineMetrics,
    baselineScenarioData,
    sandboxEnabled,
    sandboxMetrics,
    sandboxChannelMetrics,
    scenarioData,
    setExportSnapshot,
  ]);

  if (!terminalPoint || activeMetrics.totalConversions <= 0) {
    return (
      <Card
        className={cn(
          'relative overflow-hidden backdrop-blur-md shadow-[0_10px_35px_rgba(15,23,42,0.45)]',
          isDark ? 'border border-slate-700/60 bg-slate-900/55' : 'border border-slate-200 bg-white'
        )}
      >
        <CardHeader className="pb-2">
          <CardTitle className={cn('text-base', isDark ? 'text-white' : 'text-slate-900')}>
            LTV Forecast Lab
          </CardTitle>
          <p className={cn('text-xs', isDark ? 'text-slate-400' : 'text-slate-600')}>
            Waiting for conversion volume to project cohort lifetime value.
          </p>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        'relative overflow-hidden backdrop-blur-md shadow-[0_12px_35px_rgba(15,23,42,0.45)]',
        isDark ? 'border border-slate-700/60 bg-slate-900/55' : 'border border-slate-200 bg-white'
      )}
    >
      <div>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className={cn('text-lg', isDark ? 'text-white' : 'text-slate-900')}>
                LTV Forecast Lab
              </CardTitle>
              <p className={cn('text-xs', isDark ? 'text-slate-400' : 'text-slate-600')}>
                Cohort-based value modeling with retention and expansion drift over 12 months.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] items-center">
              <span className="rounded-full border border-slate-600 bg-slate-950/50 px-3 py-1 text-slate-300">
                Churn {(monthlyChurn * 100).toFixed(1)}%/mo
              </span>
              <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-cyan-200">
                Expansion +{(monthlyExpansion * 100).toFixed(1)}%/mo
              </span>
              <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-emerald-200">
                Cohort{' '}
                {activeMetrics.totalConversions.toLocaleString(undefined, {
                  maximumFractionDigits: 0,
                })}{' '}
                users
              </span>
              {scenarioCalibration.isCalibrated ? (
                <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-amber-200">
                  Calibrated from M1/M3/M6
                </span>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant={isExpanded ? 'outline' : 'default'}
                className={cn(
                  'h-8 px-3',
                  isExpanded
                    ? 'border-slate-600 text-slate-200 hover:bg-slate-800'
                    : 'bg-cyan-600 hover:bg-cyan-700 text-white'
                )}
                onClick={() => setIsExpanded((value) => !value)}
              >
                {isExpanded ? 'Collapse Lab' : 'Expand Lab for Deep Modeling'}
              </Button>
            </div>
          </div>
        </CardHeader>

        {isExpanded ? (
          <CardContent className="space-y-5">
            <div
              className={cn(
                'rounded-xl border p-4 space-y-4 transition-all duration-300',
                isDark
                  ? 'border-slate-700/60 dark:border-slate-700/60 bg-slate-950/35 dark:bg-slate-950/35'
                  : 'border-slate-200 bg-white'
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p
                    className={cn(
                      'text-xs font-semibold uppercase tracking-wider transition-colors duration-300',
                      isDark ? 'text-slate-300 dark:text-slate-300' : 'text-slate-700'
                    )}
                  >
                    Sandbox Mode
                  </p>
                  <p
                    className={cn(
                      'text-xs transition-colors duration-300',
                      isDark ? 'text-slate-400 dark:text-slate-400' : 'text-slate-600'
                    )}
                  >
                    Select channels, apply grouped and channel-level adjustments, and compare to
                    baseline.
                  </p>
                </div>
                <div
                  className={cn(
                    'flex items-center gap-2 rounded-full border px-3 py-1.5 transition-all duration-300',
                    isDark
                      ? 'border-slate-700/70 dark:border-slate-700/70 bg-slate-900/50 dark:bg-slate-900/50'
                      : 'border-slate-300 bg-slate-50'
                  )}
                >
                  <span
                    className={cn(
                      'text-xs transition-colors duration-300',
                      isDark ? 'text-slate-300 dark:text-slate-300' : 'text-slate-600'
                    )}
                  >
                    Baseline
                  </span>
                  <Switch
                    checked={sandboxEnabled}
                    onCheckedChange={setSandboxEnabled}
                    aria-label="Enable sandbox mode"
                  />
                  <span
                    className={cn(
                      'text-xs transition-colors duration-300',
                      isDark ? 'text-cyan-300 dark:text-cyan-300' : 'text-cyan-600'
                    )}
                  >
                    Sandbox
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <label
                  htmlFor="decay-curve-architecture"
                  className={cn(
                    'text-xs font-semibold',
                    isDark ? 'text-slate-300' : 'text-slate-700'
                  )}
                >
                  Decay Curve Architecture
                </label>
                <select
                  id="decay-curve-architecture"
                  value={decayCurve}
                  onChange={(event) => setDecayCurve(event.target.value as DecayCurveArchitecture)}
                  className={cn(
                    'h-9 rounded-md border px-3 text-xs font-medium',
                    isDark
                      ? 'border-slate-700 bg-slate-900 text-slate-100'
                      : 'border-slate-300 bg-white text-slate-900'
                  )}
                >
                  <option value="standard-linear">Standard Linear Churn</option>
                  <option value="front-loaded-dropoff">Front-Loaded Dropoff</option>
                  <option value="stable-long-term-retention">Stable Long-Term Retention</option>
                </select>
              </div>

              <div className="rounded-lg border border-slate-700/60 bg-slate-900/35 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-slate-400">
                      Calibrate from Observed Data
                    </p>
                    <p className="text-xs text-slate-500">
                      Optional anchors for cumulative LTV per user at Month 1, 3, and 6.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs text-slate-300"
                    onClick={clearObservedLtv}
                  >
                    Clear
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <label className="text-xs text-slate-400">
                    Month 1
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={observedLtv.m1 ?? ''}
                      onChange={(event) => {
                        const value = event.target.value;
                        setObservedLtv('m1', value === '' ? null : Math.max(0, Number(value)));
                      }}
                      className="mt-1 h-9 border-slate-700 bg-slate-900/80 text-slate-100"
                      aria-label="Observed LTV at month 1"
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    Month 3
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={observedLtv.m3 ?? ''}
                      onChange={(event) => {
                        const value = event.target.value;
                        setObservedLtv('m3', value === '' ? null : Math.max(0, Number(value)));
                      }}
                      className="mt-1 h-9 border-slate-700 bg-slate-900/80 text-slate-100"
                      aria-label="Observed LTV at month 3"
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    Month 6
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={observedLtv.m6 ?? ''}
                      onChange={(event) => {
                        const value = event.target.value;
                        setObservedLtv('m6', value === '' ? null : Math.max(0, Number(value)));
                      }}
                      className="mt-1 h-9 border-slate-700 bg-slate-900/80 text-slate-100"
                      aria-label="Observed LTV at month 6"
                    />
                  </label>
                </div>
              </div>

              <p className="sr-only" aria-live="polite">
                {sandboxEnabled
                  ? `Sandbox enabled with ${selectedChannelIds.length} selected channels. ${activeSummaryText}`
                  : 'Sandbox disabled. Showing baseline projection.'}
              </p>

              {sandboxEnabled ? (
                <>
                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="space-y-3 rounded-lg border border-slate-700/60 bg-slate-900/35 p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] uppercase tracking-wider text-slate-400">
                          Channel Selection
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-slate-300"
                          onClick={resetSandbox}
                        >
                          Reset to Baseline
                        </Button>
                      </div>
                      {shouldShowChannelScaling ? (
                        <Input
                          value={channelFilter}
                          onChange={(event) => setChannelFilter(event.target.value)}
                          placeholder="Filter channels or groups"
                          aria-label="Filter sandbox channels"
                          className="h-11 bg-slate-950/60"
                        />
                      ) : null}
                      <div className="space-y-2">
                        {filteredGroupedChannels.map(({ group, channels: groupedChannels }) => (
                          <div
                            key={group}
                            className="rounded-lg border border-slate-700/60 bg-slate-950/35"
                          >
                            <button
                              type="button"
                              className="flex w-full items-center justify-between px-3 py-2 text-left"
                              onClick={() => toggleGroupCollapsed(group)}
                              aria-label={`${collapsedGroups[group] ? 'Expand' : 'Collapse'} ${GROUP_LABELS[group]} channel group`}
                            >
                              <span className="text-sm font-semibold text-slate-100">
                                {GROUP_LABELS[group]}
                              </span>
                              <span className="text-xs text-slate-400">
                                {groupedChannels.length} channels
                              </span>
                            </button>
                            {!collapsedGroups[group] ? (
                              <div className="grid grid-cols-1 gap-2 border-t border-slate-700/50 p-3 sm:grid-cols-2">
                                {groupedChannels.map((channel) => {
                                  const checked = selectedSet.has(channel.id);

                                  return (
                                    <label
                                      key={channel.id}
                                      className="flex cursor-pointer items-center justify-between rounded-md border border-slate-700/60 bg-slate-950/45 px-3 py-2"
                                    >
                                      <span className="text-sm text-slate-200">{channel.name}</span>
                                      <input
                                        type="checkbox"
                                        className="h-4 w-4 accent-cyan-400"
                                        checked={checked}
                                        onChange={() => toggleChannelSelection(channel.id)}
                                        aria-label={`Select ${channel.name} for sandbox adjustment`}
                                      />
                                    </label>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3 rounded-lg border border-slate-700/60 bg-slate-900/35 p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] uppercase tracking-wider text-slate-400">
                          Grouped Budget Shift
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Applies to every channel in each group
                        </p>
                      </div>
                      <div className="space-y-3">
                        {CHANNEL_GROUPS.map((group) => (
                          <div key={group} className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs text-slate-300">
                              <span>{GROUP_LABELS[group]}</span>
                              <span className="font-mono">
                                {groupAdjustments[group].toFixed(0)}%
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="range"
                                min={-40}
                                max={80}
                                step={1}
                                value={groupAdjustments[group]}
                                onChange={(event) =>
                                  setGroupAdjustment(group, Number(event.target.value))
                                }
                                className={cn(
                                  'h-2 w-full cursor-pointer appearance-none rounded-lg accent-emerald-400',
                                  theme !== 'light' ? 'bg-slate-700' : 'bg-slate-300'
                                )}
                                aria-label={`${GROUP_LABELS[group]} grouped adjustment`}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 border-slate-700 text-xs"
                                onClick={() => setGroupAdjustment(group, 0)}
                              >
                                Clear
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {selectedChannelIds.length > 0 ? (
                    <div className="space-y-2 rounded-lg border border-slate-700/60 bg-slate-900/35 p-3">
                      <p className="text-[11px] uppercase tracking-wider text-slate-400">
                        Selected Channel Adjustments
                      </p>
                      <div className="grid gap-2">
                        {selectedChannelIds.map((channelId) => {
                          const channel = channels.find((item) => item.id === channelId);
                          if (!channel) return null;

                          const current =
                            channelAdjustments[channelId] ?? SANDBOX_DEFAULT_ADJUSTMENT;

                          return (
                            <div
                              key={channelId}
                              className="grid grid-cols-1 gap-2 rounded-md border border-slate-700/60 bg-slate-950/45 px-3 py-2 md:grid-cols-5"
                            >
                              <div className="text-sm text-slate-200 md:pt-1">{channel.name}</div>
                              <label className="text-xs text-slate-400">
                                Spend %
                                <input
                                  type="number"
                                  value={current.spendPct}
                                  onChange={(event) =>
                                    handleChannelAdjustment(
                                      channelId,
                                      'spendPct',
                                      Number(event.target.value)
                                    )
                                  }
                                  className="mt-1 h-8 w-full rounded border border-slate-700 bg-slate-900 px-2 text-slate-100"
                                  aria-label={`${channel.name} spend adjustment percentage`}
                                />
                              </label>
                              <label className="text-xs text-slate-400">
                                CPA %
                                <input
                                  type="number"
                                  value={current.cpaPct}
                                  onChange={(event) =>
                                    handleChannelAdjustment(
                                      channelId,
                                      'cpaPct',
                                      Number(event.target.value)
                                    )
                                  }
                                  className="mt-1 h-8 w-full rounded border border-slate-700 bg-slate-900 px-2 text-slate-100"
                                  aria-label={`${channel.name} cpa adjustment percentage`}
                                />
                              </label>
                              <label className="text-xs text-slate-400">
                                ROAS %
                                <input
                                  type="number"
                                  value={current.roasPct}
                                  onChange={(event) =>
                                    handleChannelAdjustment(
                                      channelId,
                                      'roasPct',
                                      Number(event.target.value)
                                    )
                                  }
                                  className="mt-1 h-8 w-full rounded border border-slate-700 bg-slate-900 px-2 text-slate-100"
                                  aria-label={`${channel.name} roas adjustment percentage`}
                                />
                              </label>
                              <label className="text-xs text-slate-400">
                                Churn %
                                <input
                                  type="number"
                                  value={current.churnPct}
                                  onChange={(event) =>
                                    handleChannelAdjustment(
                                      channelId,
                                      'churnPct',
                                      Number(event.target.value)
                                    )
                                  }
                                  className="mt-1 h-8 w-full rounded border border-slate-700 bg-slate-900 px-2 text-slate-100"
                                  aria-label={`${channel.name} churn adjustment percentage`}
                                />
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
                    <div className="rounded-lg border border-slate-700/60 bg-slate-900/35 p-3">
                      <p className="text-[11px] uppercase tracking-wider text-slate-400">Spend</p>
                      <p className="mt-1 text-sm text-slate-300">Baseline</p>
                      <p className="text-lg font-semibold text-white">
                        {formatCurrency(baselineMetrics.totalSpend)}
                      </p>
                      <p className="mt-1 text-sm text-slate-300">Sandbox</p>
                      <p className="text-lg font-semibold text-cyan-300">
                        {formatCurrency(sandboxMetrics.totalSpend)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-700/60 bg-slate-900/35 p-3">
                      <p className="text-[11px] uppercase tracking-wider text-slate-400">ROAS</p>
                      <p className="mt-1 text-sm text-slate-300">Baseline</p>
                      <p className="text-lg font-semibold text-white">
                        {baselineMetrics.blendedRoas.toFixed(2)}x
                      </p>
                      <p className="mt-1 text-sm text-slate-300">Sandbox</p>
                      <p className="text-lg font-semibold text-cyan-300">
                        {sandboxMetrics.blendedRoas.toFixed(2)}x
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-700/60 bg-slate-900/35 p-3">
                      <p className="text-[11px] uppercase tracking-wider text-slate-400">ROI</p>
                      <p className="mt-1 text-sm text-slate-300">Baseline</p>
                      <p className="text-lg font-semibold text-white">
                        {(baselineMetrics.roi * 100).toFixed(1)}%
                      </p>
                      <p className="mt-1 text-sm text-slate-300">Sandbox</p>
                      <p className="text-lg font-semibold text-cyan-300">
                        {(sandboxMetrics.roi * 100).toFixed(1)}%
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-700/60 bg-slate-900/35 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-[11px] uppercase tracking-wider text-slate-400">
                        Baseline vs Adjusted Spend
                      </p>
                      <p className="text-xs text-slate-400">Realtime channel comparison</p>
                    </div>
                    <p className="mb-3 text-xs text-slate-400">
                      Baseline stays neutral, while adjusted bars change color by direction of spend
                      movement.
                    </p>
                    <div className="h-[260px]">
                      <SandboxSpendChart
                        baselineData={baselineAllocationData}
                        adjustedData={adjustedAllocationData}
                        axisColor={chartAxisColor}
                        gridColor={chartGridColor}
                        tooltipStyle={tooltipStyle}
                        formatCurrency={formatCurrency}
                        symbol={symbol}
                        ariaLabel="Bar chart comparing baseline spend and adjusted spend for each channel in sandbox mode."
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-700/60 bg-slate-900/35 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-[11px] uppercase tracking-wider text-slate-400">
                        Baseline vs Adjusted Scenarios
                      </p>
                      <p className="text-xs text-slate-400">
                        Bear, Base, and Bull update in real time
                      </p>
                    </div>
                    <p className="mb-3 text-xs text-slate-400">
                      Baseline stays fixed while the adjusted curve reflects the current sandbox
                      inputs.
                    </p>
                    <p className="sr-only" aria-live="polite">
                      {`Scenario comparison summary. ${scenarioComparisonSummary}`}
                    </p>
                    <div className="h-[260px]">
                      <ScenarioChart
                        baselineScenarios={baselineScenarioRoiData}
                        adjustedScenarios={adjustedScenarioRoiData}
                        axisColor={chartAxisColor}
                        gridColor={chartGridColor}
                        tooltipStyle={tooltipStyle}
                        ariaLabel="Line chart comparing baseline ROI and adjusted ROI across Bear, Base, and Bull scenarios."
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-700/60 bg-slate-900/35 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-[11px] uppercase tracking-wider text-slate-400">
                        Combined Impact by Group
                      </p>
                      <p className="text-xs text-cyan-300">{activeSummaryText}</p>
                    </div>
                    <p className="mb-3 text-xs text-slate-400">
                      Green bars show spend increases, red bars show spend decreases, and cyan
                      indicates no net change.
                    </p>
                    <p className="sr-only" aria-live="polite">
                      {`Spend distribution summary. ${spendDistributionSummary}`}
                    </p>
                    <div className="h-[170px]">
                      <div
                        role="img"
                        aria-label="Bar chart showing baseline and sandbox spend by channel group, with green increases and red decreases."
                        className="h-full w-full"
                      >
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={groupImpactData}>
                            <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                            <XAxis
                              dataKey="group"
                              tick={{ fill: chartAxisColor, fontSize: 11 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              tick={{ fill: chartAxisColor, fontSize: 11 }}
                              tickFormatter={(value: number) => `${symbol}${Math.round(value)}`}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip
                              contentStyle={tooltipStyle}
                              formatter={(value: number, _name: string, item) => [
                                formatCurrency(value),
                                item?.dataKey === 'baselineSpend'
                                  ? 'Baseline Spend'
                                  : 'Sandbox Spend',
                              ]}
                            />
                            <Legend />
                            <Bar
                              dataKey="baselineSpend"
                              name="Baseline"
                              fill="rgba(148,163,184,0.6)"
                              radius={[6, 6, 0, 0]}
                            />
                            <Bar dataKey="sandboxSpend" name="Sandbox" radius={[6, 6, 0, 0]}>
                              {groupImpactData.map((entry) => (
                                <Cell key={`${entry.group}-sandbox`} fill={entry.sandboxFill} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            <div
              className={cn(
                'rounded-xl border p-4 space-y-4 transition-all duration-300',
                isDark
                  ? 'border-slate-700/60 dark:border-slate-700/60 bg-slate-950/35 dark:bg-slate-950/35'
                  : 'border-slate-200 bg-white'
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <p
                  className={cn(
                    'text-xs font-semibold uppercase tracking-wider transition-colors duration-300',
                    isDark ? 'text-slate-300 dark:text-slate-300' : 'text-slate-700'
                  )}
                >
                  Scenario Stress Testing
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className={cn(
                      'h-9 text-sm transition-all duration-300',
                      isDark
                        ? 'border-slate-700 dark:border-slate-700 hover:border-slate-600 dark:hover:border-slate-600 hover:bg-slate-900/50 dark:hover:bg-slate-900/50'
                        : 'border-slate-300 hover:border-slate-400 hover:bg-slate-100'
                    )}
                    onClick={() => setChurnRatePct(6)}
                  >
                    Churn 6%
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className={cn(
                      'h-9 text-sm transition-all duration-300',
                      isDark
                        ? 'border-slate-700 dark:border-slate-700 hover:border-slate-600 dark:hover:border-slate-600 hover:bg-slate-900/50 dark:hover:bg-slate-900/50'
                        : 'border-slate-300 hover:border-slate-400 hover:bg-slate-100'
                    )}
                    onClick={() => setCpaShockPct(20)}
                  >
                    CPA +20%
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className={cn(
                      'h-9 text-sm transition-colors duration-300',
                      isDark
                        ? 'text-slate-300 dark:text-slate-300 hover:text-slate-100 dark:hover:text-slate-100 hover:bg-slate-900/50 dark:hover:bg-slate-900/50'
                        : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                    )}
                    onClick={() => {
                      setChurnRatePct(4.2);
                      setCpaShockPct(0);
                      setRoasLiftPct(0);
                    }}
                  >
                    Reset
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <div
                    className={cn(
                      'flex items-center justify-between text-xs transition-colors duration-300',
                      isDark ? 'text-slate-300 dark:text-slate-300' : 'text-slate-700'
                    )}
                  >
                    <span>Churn Rate</span>
                    <span className="font-mono">{churnRatePct.toFixed(1)}%</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={12}
                    step={0.1}
                    value={churnRatePct}
                    onChange={(event) => {
                      setActiveSlider('churn');
                      setChurnRatePct(Number(event.target.value));
                    }}
                    onMouseUp={() => setActiveSlider(null)}
                    onTouchEnd={() => setActiveSlider(null)}
                    onKeyUp={() => setActiveSlider(null)}
                    className={cn(
                      'slider-interactive h-2 w-full cursor-pointer appearance-none rounded-lg accent-cyan-400 dark:accent-cyan-400',
                      isDark ? 'bg-slate-700 dark:bg-slate-700' : 'bg-slate-300',
                      activeSlider === 'churn' && 'slider-active'
                    )}
                    aria-label="Churn stress assumption"
                    aria-valuetext={`${churnRatePct.toFixed(1)} percent`}
                  />
                </div>

                <div className="space-y-2">
                  <div
                    className={cn(
                      'flex items-center justify-between text-xs transition-colors duration-300',
                      isDark ? 'text-slate-300 dark:text-slate-300' : 'text-slate-700'
                    )}
                  >
                    <span>CPA Shock</span>
                    <span className="font-mono">+{cpaShockPct.toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={40}
                    step={1}
                    value={cpaShockPct}
                    onChange={(event) => {
                      setActiveSlider('cpa');
                      setCpaShockPct(Number(event.target.value));
                    }}
                    onMouseUp={() => setActiveSlider(null)}
                    onTouchEnd={() => setActiveSlider(null)}
                    onKeyUp={() => setActiveSlider(null)}
                    className={cn(
                      'slider-interactive h-2 w-full cursor-pointer appearance-none rounded-lg accent-rose-400 dark:accent-rose-400',
                      isDark ? 'bg-slate-700 dark:bg-slate-700' : 'bg-slate-300',
                      activeSlider === 'cpa' && 'slider-active'
                    )}
                    aria-label="CPA stress assumption"
                    aria-valuetext={`${cpaShockPct.toFixed(0)} percent`}
                  />
                </div>

                <div className="space-y-2">
                  <div
                    className={cn(
                      'flex items-center justify-between text-xs transition-colors duration-300',
                      isDark ? 'text-slate-300 dark:text-slate-300' : 'text-slate-700'
                    )}
                  >
                    <span>ROAS Lift</span>
                    <span className="font-mono">
                      {roasLiftPct >= 0 ? '+' : ''}
                      {roasLiftPct.toFixed(0)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-20}
                    max={30}
                    step={1}
                    value={roasLiftPct}
                    onChange={(event) => {
                      setActiveSlider('roas');
                      setRoasLiftPct(Number(event.target.value));
                    }}
                    onMouseUp={() => setActiveSlider(null)}
                    onTouchEnd={() => setActiveSlider(null)}
                    onKeyUp={() => setActiveSlider(null)}
                    className={cn(
                      'slider-interactive h-2 w-full cursor-pointer appearance-none rounded-lg accent-emerald-400 dark:accent-emerald-400',
                      isDark ? 'bg-slate-700 dark:bg-slate-700' : 'bg-slate-300',
                      activeSlider === 'roas' && 'slider-active'
                    )}
                    aria-label="ROAS stress assumption"
                    aria-valuetext={`${roasLiftPct.toFixed(0)} percent`}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div
                className={cn(
                  'rounded-xl border p-3 transition-all duration-300',
                  isDark
                    ? 'border-slate-700/60 dark:border-slate-700/60 bg-slate-950/55 dark:bg-slate-950/55'
                    : 'border-slate-200 bg-slate-50'
                )}
              >
                <div
                  className={cn(
                    'mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wider transition-colors duration-300',
                    isDark ? 'text-slate-400 dark:text-slate-400' : 'text-slate-600'
                  )}
                >
                  <Sparkles
                    className={cn(
                      'h-3.5 w-3.5',
                      isDark ? 'text-cyan-300 dark:text-cyan-300' : 'text-cyan-600'
                    )}
                  />{' '}
                  12M LTV per User
                </div>
                <div
                  className={cn(
                    'text-2xl font-bold transition-colors duration-300',
                    isDark ? 'text-white dark:text-white' : 'text-emerald-600'
                  )}
                >
                  {formatCurrency(terminalPoint.cumulativeLtvPerUser)}
                </div>
              </div>

              <div
                className={cn(
                  'rounded-xl border p-3 transition-all duration-300',
                  isDark
                    ? 'border-slate-700/60 dark:border-slate-700/60 bg-slate-950/55 dark:bg-slate-950/55'
                    : 'border-slate-200 bg-slate-50'
                )}
              >
                <div
                  className={cn(
                    'mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wider transition-colors duration-300',
                    isDark ? 'text-slate-400 dark:text-slate-400' : 'text-slate-600'
                  )}
                >
                  <TrendingUp
                    className={cn(
                      'h-3.5 w-3.5',
                      isDark ? 'text-emerald-300 dark:text-emerald-300' : 'text-emerald-600'
                    )}
                  />{' '}
                  LTV:CAC Ratio
                  <button
                    type="button"
                    className={cn(
                      'ml-1 rounded-full border px-1 text-[10px] transition-colors duration-300',
                      isDark
                        ? 'border-slate-600 dark:border-slate-600 text-slate-300 dark:text-slate-300'
                        : 'border-slate-400 text-slate-600'
                    )}
                    aria-label="Explain LTV:CAC Ratio"
                    data-tooltip-id="ltv-cac-ratio-tooltip"
                    data-tooltip-content="LTV:CAC compares customer value to acquisition cost. Values above 1.0 mean value exceeds cost."
                  >
                    ?
                  </button>
                </div>
                <div
                  className={cn(
                    'text-2xl font-bold',
                    terminalPoint.ltvToCac >= 3
                      ? isDark
                        ? 'text-emerald-400 dark:text-emerald-400'
                        : 'text-emerald-600'
                      : terminalPoint.ltvToCac >= 1
                        ? isDark
                          ? 'text-amber-300 dark:text-amber-300'
                          : 'text-amber-600'
                        : isDark
                          ? 'text-rose-400 dark:text-rose-400'
                          : 'text-rose-600'
                  )}
                >
                  {terminalPoint.ltvToCac.toFixed(2)}x
                </div>
              </div>

              <div
                className={cn(
                  'rounded-xl border p-3 transition-all duration-300',
                  isDark
                    ? 'border-slate-700/60 dark:border-slate-700/60 bg-slate-950/55 dark:bg-slate-950/55'
                    : 'border-slate-200 bg-slate-50'
                )}
              >
                <div
                  className={cn(
                    'mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wider transition-colors duration-300',
                    isDark ? 'text-slate-400 dark:text-slate-400' : 'text-slate-600'
                  )}
                >
                  <TimerReset
                    className={cn(
                      'h-3.5 w-3.5',
                      isDark ? 'text-amber-300 dark:text-amber-300' : 'text-amber-600'
                    )}
                  />{' '}
                  Payback Window
                </div>
                <div
                  className={cn(
                    'relative text-2xl font-bold transition-colors duration-300',
                    isDark ? 'text-white dark:text-white' : 'text-slate-900'
                  )}
                >
                  <span className={cn(isDemo && 'blur-md select-none')}>
                    {paybackMonth ? `M${paybackMonth}` : 'Beyond 12M'}
                  </span>
                  {isDemo ? (
                    <Lock className="pointer-events-none absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-slate-400" />
                  ) : null}
                </div>
              </div>

              <div
                className={cn(
                  'rounded-xl border p-3 transition-all duration-300',
                  isDark
                    ? 'border-slate-700/60 dark:border-slate-700/60 bg-slate-950/55 dark:bg-slate-950/55'
                    : 'border-slate-200 bg-slate-50'
                )}
              >
                <div
                  className={cn(
                    'mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wider transition-colors duration-300',
                    isDark ? 'text-slate-400 dark:text-slate-400' : 'text-slate-600'
                  )}
                >
                  <Landmark
                    className={cn(
                      'h-3.5 w-3.5',
                      isDark ? 'text-indigo-300 dark:text-indigo-300' : 'text-indigo-600'
                    )}
                  />{' '}
                  12M Net Cohort Value
                </div>
                <div
                  className={cn(
                    'relative text-2xl font-bold',
                    terminalPoint.netCohortValue >= 0
                      ? isDark
                        ? 'text-emerald-400 dark:text-emerald-400'
                        : 'text-emerald-600'
                      : isDark
                        ? 'text-rose-400 dark:text-rose-400'
                        : 'text-rose-600'
                  )}
                >
                  <span className={cn(isDemo && 'blur-md select-none')}>
                    {formatCurrency(terminalPoint.netCohortValue)}
                  </span>
                  {isDemo ? (
                    <Lock className="pointer-events-none absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-slate-400" />
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
              <div
                className={cn(
                  'xl:col-span-3 rounded-xl border p-3 transition-all duration-300',
                  isDark
                    ? 'border-slate-700/60 dark:border-slate-700/60 bg-slate-950/35 dark:bg-slate-950/35'
                    : 'border-slate-200 bg-white'
                )}
              >
                <div
                  className={cn(
                    'mb-2 text-xs font-semibold uppercase tracking-wider transition-colors duration-300',
                    isDark ? 'text-slate-300 dark:text-slate-300' : 'text-slate-700'
                  )}
                >
                  LTV Build-Up vs CAC
                </div>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={curveData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: chartAxisColor, fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        yAxisId="value"
                        tick={{ fill: chartAxisColor, fontSize: 11 }}
                        tickFormatter={(value: number) => `${symbol}${Math.round(value)}`}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        yAxisId="ratio"
                        orientation="right"
                        tick={{ fill: chartAxisColor, fontSize: 11 }}
                        tickFormatter={(value: number) => `${value.toFixed(1)}x`}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(value: number, name: string) => {
                          if (name === 'LTV:CAC') return [`${value.toFixed(2)}x`, name];
                          return [formatCurrency(value), name];
                        }}
                      />
                      <ReferenceLine
                        yAxisId="ratio"
                        y={1}
                        stroke="#f59e0b"
                        strokeDasharray="4 4"
                        label={{ value: 'Payback', fill: '#fbbf24', fontSize: 10 }}
                      />
                      <Area
                        yAxisId="value"
                        type="monotone"
                        dataKey="cumulativeLtvPerUser"
                        name="Cumulative LTV/User"
                        fill="rgba(34,211,238,0.22)"
                        stroke="#22d3ee"
                        strokeWidth={2.2}
                        animationDuration={450}
                        animationEasing="ease-in-out"
                      />
                      <Line
                        yAxisId="value"
                        type="monotone"
                        dataKey="cpaLine"
                        name="Blended CPA"
                        stroke="#f87171"
                        strokeDasharray="5 4"
                        dot={false}
                        strokeWidth={2}
                        animationDuration={450}
                        animationEasing="ease-in-out"
                      />
                      <Line
                        yAxisId="ratio"
                        type="monotone"
                        dataKey="ltvToCac"
                        name="LTV:CAC"
                        stroke="#34d399"
                        dot={{ r: 2 }}
                        strokeWidth={2}
                        animationDuration={450}
                        animationEasing="ease-in-out"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="xl:col-span-2 space-y-4">
                <div
                  className={cn(
                    'rounded-xl border p-3 transition-all duration-300',
                    isDark
                      ? 'border-slate-700/60 dark:border-slate-700/60 bg-slate-950/35 dark:bg-slate-950/35'
                      : 'border-slate-200 bg-white'
                  )}
                >
                  <div
                    className={cn(
                      'mb-2 text-xs font-semibold uppercase tracking-wider transition-colors duration-300',
                      isDark ? 'text-slate-300 dark:text-slate-300' : 'text-slate-700'
                    )}
                  >
                    12M Scenario Envelope
                  </div>
                  <div className="h-[142px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={scenarioData}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                        <XAxis
                          dataKey="scenario"
                          tick={{ fill: chartAxisColor, fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fill: chartAxisColor, fontSize: 11 }}
                          tickFormatter={(value: number) => `${symbol}${Math.round(value)}`}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={tooltipStyle}
                          formatter={(value: number, name: string) => {
                            if (name === 'LTV:CAC') return [`${value.toFixed(2)}x`, name];
                            return [formatCurrency(value), name];
                          }}
                        />
                        <Bar
                          dataKey="projectedLtvPerUser"
                          name="12M LTV/User"
                          radius={[8, 8, 0, 0]}
                          animationDuration={450}
                          animationEasing="ease-in-out"
                        >
                          {scenarioData.map((entry) => (
                            <Cell key={entry.scenario} fill={SCENARIO_COLORS[entry.scenario]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div
                  className={cn(
                    'rounded-xl border p-3 transition-all duration-300',
                    isDark
                      ? 'border-slate-700/60 dark:border-slate-700/60 bg-slate-950/35 dark:bg-slate-950/35'
                      : 'border-slate-200 bg-white'
                  )}
                >
                  <div
                    className={cn(
                      'mb-2 text-xs font-semibold uppercase tracking-wider transition-colors duration-300',
                      isDark ? 'text-slate-300 dark:text-slate-300' : 'text-slate-700'
                    )}
                  >
                    Cohort Value by Scenario
                  </div>
                  <div className="space-y-2">
                    {scenarioData.map((scenario) => {
                      const baselineScenario = baselineScenarioLookup[scenario.scenario];

                      return (
                        <div
                          key={scenario.scenario}
                          className={cn(
                            'flex items-center justify-between rounded-md border px-3 py-2 transition-all duration-300',
                            isDark
                              ? 'border-slate-700/60 dark:border-slate-700/60 bg-slate-900/40 dark:bg-slate-900/40'
                              : 'border-slate-200 bg-slate-50'
                          )}
                        >
                          <div
                            className={cn(
                              'flex items-center gap-2 text-sm transition-colors duration-300',
                              isDark ? 'text-slate-200 dark:text-slate-200' : 'text-slate-800'
                            )}
                          >
                            <span
                              className={cn(
                                'h-2.5 w-2.5 rounded-full',
                                SCENARIO_DOT_CLASS[scenario.scenario]
                              )}
                            />
                            {scenario.scenario}
                          </div>
                          <div className="text-right">
                            <div
                              className={cn(
                                'text-sm font-semibold transition-colors duration-300',
                                isDark ? 'text-white dark:text-white' : 'text-slate-900'
                              )}
                            >
                              {formatCurrency(scenario.projectedCohortValue)}
                            </div>
                            {sandboxEnabled && baselineScenario ? (
                              <div
                                className={cn(
                                  'text-[11px] transition-colors duration-300',
                                  isDark ? 'text-slate-400 dark:text-slate-400' : 'text-slate-600'
                                )}
                              >
                                Baseline {formatCurrency(baselineScenario.projectedCohortValue)}
                              </div>
                            ) : null}
                            <div
                              className={cn(
                                'text-[11px] transition-colors duration-300',
                                isDark ? 'text-slate-400 dark:text-slate-400' : 'text-slate-600'
                              )}
                            >
                              {scenario.ltvToCac.toFixed(2)}x LTV:CAC
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        ) : (
          <CardContent>
            <div
              className={cn(
                'rounded-xl border px-4 py-3 flex flex-wrap items-center justify-between gap-3',
                isDark ? 'border-slate-700/70 bg-slate-950/45' : 'border-slate-200 bg-white'
              )}
            >
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className={cn('font-medium', isDark ? 'text-slate-300' : 'text-slate-700')}>
                  LTV:CAC Ratio
                </span>
                <span
                  className={cn(
                    'font-mono font-semibold',
                    isDark ? 'text-cyan-300' : 'text-cyan-700'
                  )}
                >
                  {terminalPoint.ltvToCac.toFixed(2)}x
                </span>
                <span className={cn('font-medium', isDark ? 'text-slate-300' : 'text-slate-700')}>
                  Payback Window
                </span>
                <span
                  className={cn(
                    'relative font-mono font-semibold',
                    isDark ? 'text-emerald-300' : 'text-emerald-700'
                  )}
                >
                  <span className={cn(isDemo && 'blur-md select-none')}>
                    {paybackMonth ? `M${paybackMonth}` : 'Beyond 12M'}
                  </span>
                  {isDemo ? (
                    <Lock className="pointer-events-none absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 text-slate-400" />
                  ) : null}
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                className="bg-cyan-600 hover:bg-cyan-700 text-white"
                onClick={() => setIsExpanded(true)}
              >
                Expand Lab for Deep Modeling
              </Button>
            </div>
          </CardContent>
        )}

        <ReactTooltip
          id="ltv-cac-ratio-tooltip"
          place="top"
          className={cn(
            'z-50 max-w-64 rounded-md border px-2 py-1 text-xs transition-all duration-300',
            isDark
              ? 'border-slate-700 dark:border-slate-700 bg-slate-950 dark:bg-slate-950 text-slate-100 dark:text-slate-100'
              : 'border-slate-300 bg-white text-slate-900'
          )}
        />
      </div>
    </Card>
  );
}
