import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Users, TrendingUp, FlaskConical, Shield, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ChannelData, useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { TIER_DEFAULTS, TOP_IGAMING_GEOS } from '@/lib/geo-market-data';
import { IGAMING_SUBVERTICAL_PRESETS } from '@/lib/igaming-revenue-model';
import { WizardAnswers, generateOnboardingPlan } from '@/lib/onboarding-ai';
import { IgamingSubvertical, Vertical, VERTICAL_PRESETS } from '@/lib/vertical-presets';

interface WizardState {
  step: 1 | 2 | 3 | 4 | 5 | 6 | 'generating' | 'done';
  budget: number | '';
  vertical: Vertical | null;
  subvertical: IgamingSubvertical | null;
  goal: WizardAnswers['goal'] | null;
  geos: string[];
  benchmarks: { cpa: string; ltv: string };
}

const STATUS_MESSAGES = [
  'Analysing your vertical...',
  'Selecting the right channels...',
  'Optimising for your markets...',
  'Calibrating performance benchmarks...',
  'Building your spend projections...',
  'Almost ready...',
] as const;

const GOAL_OPTIONS: Array<{
  key: WizardAnswers['goal'];
  title: string;
  subtitle: string;
  Icon: typeof Users;
}> = [
  {
    key: 'acquire_volume',
    title: 'Acquire as many new customers as possible',
    subtitle: 'Focus on reaching more people and growing quickly.',
    Icon: Users,
  },
  {
    key: 'maximize_revenue',
    title: 'Maximise revenue per customer',
    subtitle: 'Prioritise higher value outcomes over raw volume.',
    Icon: TrendingUp,
  },
  {
    key: 'test_channels',
    title: 'Test new channels and find what works',
    subtitle: 'Spread budget across options to learn faster.',
    Icon: FlaskConical,
  },
  {
    key: 'maintain',
    title: 'Maintain current performance, minimise risk',
    subtitle: 'Protect consistency and avoid major swings.',
    Icon: Shield,
  },
];

const GEO_GROUPS: Array<{ title: string; tier: 'tier1' | 'tier2' | 'tier3' }> = [
  { title: 'Premium Markets (Tier 1)', tier: 'tier1' },
  { title: 'Volume Markets (Tier 2)', tier: 'tier2' },
  { title: 'Emerging Markets (Tier 3)', tier: 'tier3' },
];

const BUDGET_TIERS = [
  {
    key: 'getting-started',
    title: 'Getting Started',
    rangeLabel: '$5,000 - $20,000',
    helper: '/ month',
    description: 'Test 2-3 channels and identify what works before scaling.',
    min: 5000,
    max: 20000,
    midpoint: 10000,
  },
  {
    key: 'growing',
    title: 'Growing',
    rangeLabel: '$20,000 - $75,000',
    helper: '/ month',
    description: 'Build a multi-channel presence with enough data to optimise.',
    min: 20000,
    max: 75000,
    midpoint: 40000,
  },
  {
    key: 'scaling',
    title: 'Scaling',
    rangeLabel: '$75,000 - $250,000',
    helper: '/ month',
    description: 'Compete across all key channels with serious volume.',
    min: 75000,
    max: 250000,
    midpoint: 150000,
  },
  {
    key: 'market-leader',
    title: 'Market Leader',
    rangeLabel: '$250,000+',
    helper: '/ month',
    description: 'Dominate your vertical with full-funnel coverage.',
    min: 250000,
    max: 1000000,
    midpoint: 400000,
  },
] as const;

function toFlagEmoji(code: string): string {
  return code
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

function parsePositive(value: string): number | undefined {
  const parsed = Number.parseFloat(value.replace(/,/g, '').trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

export const OnboardWizard = () => {
  const navigate = useNavigate();
  const setTotalBudget = useMediaPlanStore((state) => state.setTotalBudget);
  const setOnboardingVertical = useMediaPlanStore((state) => state.setOnboardingVertical);
  const setOnboardingSubvertical = useMediaPlanStore((state) => state.setOnboardingSubvertical);
  const setChannels = useMediaPlanStore((state) => state.setChannels);
  const normalizeAllocations = useMediaPlanStore((state) => state.normalizeAllocations);
  const setGlobalMultipliers = useMediaPlanStore((state) => state.setGlobalMultipliers);
  const addActiveGeo = useMediaPlanStore((state) => state.addActiveGeo);
  const clearActiveGeos = useMediaPlanStore((state) => state.clearActiveGeos);
  const setTierAllocation = useMediaPlanStore((state) => state.setTierAllocation);
  const setHasCompletedOnboarding = useMediaPlanStore((state) => state.setHasCompletedOnboarding);

  const [state, setState] = useState<WizardState>({
    step: 1,
    budget: '',
    vertical: null,
    subvertical: null,
    goal: null,
    geos: [],
    benchmarks: { cpa: '', ltv: '' },
  });
  const [selectedBudgetTierKey, setSelectedBudgetTierKey] = useState<string | null>(null);
  const [statusIndex, setStatusIndex] = useState(0);
  const [isContinueAttentionActive, setIsContinueAttentionActive] = useState(false);
  const [showContinueLetsGo, setShowContinueLetsGo] = useState(false);
  const continuePulseTimerRef = useRef<number | null>(null);
  const continueLabelTimerRef = useRef<number | null>(null);

  const selectedBudgetTier = useMemo(
    () => BUDGET_TIERS.find((tier) => tier.key === selectedBudgetTierKey) ?? null,
    [selectedBudgetTierKey]
  );

  const selectedPreset = useMemo(
    () => (state.vertical ? VERTICAL_PRESETS[state.vertical] : null),
    [state.vertical]
  );
  const selectedSubverticalPreset = useMemo(
    () => (state.subvertical ? IGAMING_SUBVERTICAL_PRESETS[state.subvertical] : null),
    [state.subvertical]
  );

  const isBudgetValid =
    typeof state.budget === 'number' && state.budget >= 5000 && state.budget <= 1000000;

  const goToStep = useCallback((step: WizardState['step']) => {
    setState((prev) => ({ ...prev, step }));
  }, []);

  const continueFromBudget = useCallback(() => {
    if (!selectedBudgetTierKey || !isBudgetValid) return;
    goToStep(2);
  }, [goToStep, isBudgetValid, selectedBudgetTierKey]);

  const triggerStepOneContinueAttention = useCallback(() => {
    if (continuePulseTimerRef.current) {
      window.clearTimeout(continuePulseTimerRef.current);
    }
    if (continueLabelTimerRef.current) {
      window.clearTimeout(continueLabelTimerRef.current);
    }

    setIsContinueAttentionActive(true);
    setShowContinueLetsGo(true);

    continuePulseTimerRef.current = window.setTimeout(() => {
      setIsContinueAttentionActive(false);
    }, 600);

    continueLabelTimerRef.current = window.setTimeout(() => {
      setShowContinueLetsGo(false);
    }, 1000);
  }, []);

  const selectVertical = useCallback(
    (vertical: Vertical) => {
      setState((prev) => ({ ...prev, vertical, subvertical: null }));
      window.setTimeout(() => goToStep(vertical === 'igaming' ? 3 : 4), 300);
    },
    [goToStep]
  );

  const selectSubvertical = useCallback(
    (subvertical: IgamingSubvertical | null) => {
      setState((prev) => ({ ...prev, subvertical }));
      window.setTimeout(() => goToStep(4), 300);
    },
    [goToStep]
  );

  const selectGoal = useCallback(
    (goal: WizardAnswers['goal']) => {
      setState((prev) => ({ ...prev, goal }));
      window.setTimeout(() => goToStep(5), 300);
    },
    [goToStep]
  );

  const toggleGeo = useCallback((geoName: string) => {
    setState((prev) => ({
      ...prev,
      geos: prev.geos.includes(geoName)
        ? prev.geos.filter((name) => name !== geoName)
        : [...prev.geos, geoName],
    }));
  }, []);

  const applyPlan = useCallback(
    async (withBenchmarks: boolean) => {
      if (!state.vertical || !state.goal || typeof state.budget !== 'number') return;

      const preset = VERTICAL_PRESETS[state.vertical];
      const parsedCpa = withBenchmarks ? parsePositive(state.benchmarks.cpa) : undefined;
      const parsedLtv = withBenchmarks ? parsePositive(state.benchmarks.ltv) : undefined;

      const answers: WizardAnswers = {
        budget: state.budget,
        vertical: state.vertical,
        goal: state.goal,
        geos: state.geos,
        benchmarks: {
          cpa: parsedCpa,
          ltv: parsedLtv,
        },
      };

      goToStep('generating');

      const startedAt = Date.now();
      let refinedPlan: Awaited<ReturnType<typeof generateOnboardingPlan>> = null;
      try {
        refinedPlan = await generateOnboardingPlan(answers);
      } catch {
        // AI generation failed — continue with preset defaults
      }
      const elapsed = Date.now() - startedAt;
      if (elapsed < 2000) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000 - elapsed));
      }

      setOnboardingVertical(answers.vertical);
      setOnboardingSubvertical(state.subvertical);
      setHasCompletedOnboarding(true);
      setTotalBudget(answers.budget);

      const adjustedPresetChannels = preset.channels.map((channel) => {
        const aiAdj = refinedPlan?.channelAdjustments.find(
          (adj) => adj.channelName === channel.name
        );
        return {
          ...channel,
          allocationPct: aiAdj?.allocationPct ?? channel.allocationPct,
        };
      });

      const mappedChannels: ChannelData[] = adjustedPresetChannels.map((channel) => {
        // FLAT_FEE and RETAINER channels are "fixed cost" — their typeConfig.price IS
        // their monthly spend. Presets set price:0 as a placeholder; compute the actual
        // spend from the budget allocation so the pool-aware engine deducts them correctly.
        const fixedChannelPrice =
          channel.buyingModel === 'RETAINER' || channel.buyingModel === 'FLAT_FEE'
            ? Math.round((channel.allocationPct / 100) * answers.budget)
            : channel.typeConfig.price;

        return {
          id: crypto.randomUUID(),
          name: channel.name,
          category: channel.category,
          family: channel.family,
          buyingModel: channel.buyingModel,
          allocationPct: channel.allocationPct,
          typeConfig: {
            family: channel.family,
            buyingModel: channel.buyingModel,
            price: fixedChannelPrice,
            secondaryPrice: channel.typeConfig.secondaryPrice ?? 0,
            baselineMetrics: {
              ctr: channel.typeConfig.baselineMetrics.ctr ?? 1,
              conversionRate: channel.typeConfig.baselineMetrics.conversionRate ?? 2.5,
              aov: channel.typeConfig.baselineMetrics.aov,
              trafficPerUnit: channel.typeConfig.baselineMetrics.trafficPerUnit,
              saturationCeiling: channel.typeConfig.baselineMetrics.saturationCeiling,
            },
          },
          tier:
            channel.buyingModel === 'RETAINER' || channel.buyingModel === 'FLAT_FEE'
              ? 'fixed'
              : 'scalable',
          locked: false,
          isActive: true,
          maxSpendLimit: 0,
        };
      });

      setChannels(mappedChannels);
      normalizeAllocations();

      // Use || (not ??) so that a zero returned by the AI falls through to the preset
      // default. playerValue === 0 would make all revenue calculations return 0.
      const revenueModelDefaults =
        answers.vertical === 'igaming' && state.subvertical
          ? IGAMING_SUBVERTICAL_PRESETS[state.subvertical]
          : null;

      setGlobalMultipliers({
        playerValue:
          parsedLtv ||
          refinedPlan?.recommendedPlayerValue ||
          revenueModelDefaults?.playerValue ||
          preset.defaultPlayerValue,
        cpaTarget: parsedCpa || refinedPlan?.recommendedCpaTarget || preset.defaultCpaTarget,
        roasTarget: refinedPlan?.recommendedRoasTarget || preset.defaultRoasTarget,
        retentionRate: revenueModelDefaults?.retentionRate,
        regToFtdCvr: revenueModelDefaults?.regToFtdCvr,
        turnoverRate: revenueModelDefaults?.turnoverRate,
        margin: revenueModelDefaults?.margin,
        bonusRate: revenueModelDefaults?.bonusRate,
        spendMultiplier: 1,
      });

      clearActiveGeos();
      if (answers.geos.length > 0) {
        answers.geos.forEach((geoName) => addActiveGeo(geoName));
      } else {
        setTierAllocation('tier1', TIER_DEFAULTS.tier1);
        setTierAllocation('tier2', TIER_DEFAULTS.tier2);
      }

      goToStep('done');
      window.requestAnimationFrame(() => navigate('/', { replace: true }));

      if (refinedPlan) {
        toast('Your plan is ready', {
          description: refinedPlan.rationale,
          duration: 6000,
        });
      } else {
        toast('Your plan is ready', {
          description: `We've built your plan using ${preset.label} industry defaults.`,
          duration: 6000,
        });
      }
    },
    [
      addActiveGeo,
      clearActiveGeos,
      goToStep,
      navigate,
      normalizeAllocations,
      setChannels,
      setGlobalMultipliers,
      setHasCompletedOnboarding,
      setOnboardingSubvertical,
      setOnboardingVertical,
      setTierAllocation,
      setTotalBudget,
      state,
    ]
  );

  useEffect(() => {
    if (state.step !== 'generating') return;

    const interval = window.setInterval(() => {
      setStatusIndex((prev) => (prev + 1) % STATUS_MESSAGES.length);
    }, 800);

    return () => window.clearInterval(interval);
  }, [state.step]);

  useEffect(() => {
    return () => {
      if (continuePulseTimerRef.current) {
        window.clearTimeout(continuePulseTimerRef.current);
      }
      if (continueLabelTimerRef.current) {
        window.clearTimeout(continueLabelTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        return;
      }

      if (event.key !== 'Enter') return;

      if (state.step === 1) {
        event.preventDefault();
        continueFromBudget();
      } else if (state.step === 5) {
        event.preventDefault();
        goToStep(6);
      } else if (state.step === 6) {
        event.preventDefault();
        void applyPlan(true);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [applyPlan, continueFromBudget, goToStep, state.step]);

  const progress = typeof state.step === 'number' ? Math.min(state.step, 6) : 6;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 pb-12 pt-8 sm:px-8">
        {state.step !== 'generating' && (
          <div className="mb-8 flex items-center gap-2">
            {[1, 2, 3, 4, 5, 6].map((dot) => (
              <span
                key={dot}
                className={`h-2.5 w-8 rounded-full transition-colors ${
                  dot <= progress ? 'bg-indigo-600' : 'bg-slate-800'
                }`}
              />
            ))}
          </div>
        )}

        {state.step === 1 && (
          <section className="flex flex-1 flex-col justify-center">
            <h1 className="text-4xl font-bold tracking-tight">
              What's your monthly marketing budget?
            </h1>
            <p className="mt-3 text-slate-400">We'll build your entire plan around this number.</p>
            <p className="mt-2 text-sm text-slate-500">
              Not sure? Pick the closest range - you can always change it later.
            </p>

            <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2">
              {BUDGET_TIERS.map((tier) => {
                const selected = tier.key === selectedBudgetTierKey;

                return (
                  <Card
                    key={tier.key}
                    role="button"
                    tabIndex={0}
                    className={`relative cursor-pointer rounded-2xl border p-6 transition-all ${
                      selected
                        ? 'border-indigo-500 bg-indigo-950/40 ring-2 ring-indigo-500/30'
                        : 'border-slate-700 bg-slate-900 hover:border-slate-500 hover:bg-slate-800/60'
                    }`}
                    onClick={() => {
                      if (!selectedBudgetTierKey) {
                        triggerStepOneContinueAttention();
                      }
                      setSelectedBudgetTierKey(tier.key);
                      setState((prev) => ({ ...prev, budget: tier.midpoint }));
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        if (!selectedBudgetTierKey) {
                          triggerStepOneContinueAttention();
                        }
                        setSelectedBudgetTierKey(tier.key);
                        setState((prev) => ({ ...prev, budget: tier.midpoint }));
                      }
                    }}
                  >
                    {selected ? (
                      <CheckCircle className="absolute right-4 top-4 h-5 w-5 text-indigo-400" />
                    ) : null}
                    <p className="text-sm font-semibold text-slate-200">{tier.title}</p>
                    <p className="mt-2 text-2xl font-bold text-white">{tier.rangeLabel}</p>
                    <p className="mt-1 text-sm text-slate-400">{tier.helper}</p>
                    <p className="mt-2 text-sm text-slate-400">{tier.description}</p>
                  </Card>
                );
              })}
            </div>

            <div
              className={`overflow-hidden transition-all duration-300 ${
                selectedBudgetTier ? 'mt-6 max-h-80 opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              <div className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
                <p className="text-sm text-slate-400">Fine-tune your budget</p>
                <input
                  type="range"
                  min={selectedBudgetTier?.min ?? 5000}
                  max={selectedBudgetTier?.max ?? 1000000}
                  step={5000}
                  value={
                    typeof state.budget === 'number'
                      ? state.budget
                      : (selectedBudgetTier?.midpoint ?? 5000)
                  }
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setState((prev) => ({ ...prev, budget: next }));
                  }}
                  className="mt-4 h-2 w-full accent-indigo-500"
                  aria-label="Fine tune monthly budget"
                />
                <p className="mt-4 text-3xl font-bold text-indigo-400">
                  {typeof state.budget === 'number'
                    ? `$${state.budget.toLocaleString('en-US')}`
                    : '$0'}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  You can adjust this at any time from the dashboard.
                </p>
              </div>
            </div>

            <div className="mt-12 flex justify-end">
              <Button
                className={`bg-indigo-600 px-7 text-base hover:bg-indigo-500 ${
                  isContinueAttentionActive ? 'animate-pulse' : ''
                }`}
                disabled={!selectedBudgetTierKey}
                onClick={continueFromBudget}
              >
                {showContinueLetsGo ? "Continue → Let's go" : 'Continue →'}
              </Button>
            </div>
          </section>
        )}

        {state.step === 2 && (
          <section className="flex flex-1 flex-col">
            <h1 className="text-4xl font-bold tracking-tight">What are you promoting?</h1>
            <p className="mt-3 text-slate-400">
              This sets your default channel mix and performance benchmarks.
            </p>

            <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3">
              {(Object.keys(VERTICAL_PRESETS) as Vertical[]).map((vertical) => {
                const preset = VERTICAL_PRESETS[vertical];
                const selected = state.vertical === vertical;

                return (
                  <Card
                    key={vertical}
                    role="button"
                    tabIndex={0}
                    className={`cursor-pointer border bg-slate-900 p-5 transition-all ${
                      selected
                        ? 'border-indigo-500 ring-2 ring-indigo-500/60'
                        : 'border-slate-700 hover:border-indigo-400'
                    }`}
                    onClick={() => selectVertical(vertical)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        selectVertical(vertical);
                      }
                    }}
                  >
                    <div className="text-4xl">{preset.emoji}</div>
                    <h3 className="mt-4 text-lg font-semibold">{preset.label}</h3>
                    <p className="mt-2 text-sm text-slate-400">{preset.description}</p>
                  </Card>
                );
              })}
            </div>

            <div className="mt-10 flex items-center justify-between">
              <Button
                variant="ghost"
                className="text-muted-foreground hover:bg-slate-900 hover:text-white"
                onClick={() => goToStep(1)}
              >
                ← Back
              </Button>
              <p className="text-sm text-slate-500">Select a vertical to continue</p>
            </div>
          </section>
        )}

        {state.step === 3 && (
          <section className="flex flex-1 flex-col">
            <h1 className="text-4xl font-bold tracking-tight">Choose your iGaming preset</h1>
            <p className="mt-3 text-slate-400">
              These are industry benchmarks. You can adjust them in Settings at any time.
            </p>

            <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
              {(Object.keys(IGAMING_SUBVERTICAL_PRESETS) as IgamingSubvertical[]).map((key) => {
                const preset = IGAMING_SUBVERTICAL_PRESETS[key];
                const selected = state.subvertical === key;

                return (
                  <Card
                    key={key}
                    role="button"
                    tabIndex={0}
                    className={`cursor-pointer border bg-slate-900 p-5 transition-all ${
                      selected
                        ? 'border-indigo-500 ring-2 ring-indigo-500/60'
                        : 'border-slate-700 hover:border-indigo-400'
                    }`}
                    onClick={() => selectSubvertical(key)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        selectSubvertical(key);
                      }
                    }}
                  >
                    <h3 className="text-lg font-semibold">{preset.label}</h3>
                    <p className="mt-2 text-sm text-slate-400">{preset.description}</p>
                    <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/80 p-4 text-sm text-slate-300 space-y-1">
                      <p>Margin: {(preset.margin * 100).toFixed(1)}%</p>
                      <p>Bonus Rate: {(preset.bonusRate * 100).toFixed(1)}%</p>
                      <p>Reg to FTD CVR: {(preset.regToFtdCvr * 100).toFixed(1)}%</p>
                      <p>Player Value: ${preset.playerValue}</p>
                      <p>Retention Rate: {(preset.retentionRate * 100).toFixed(0)}%</p>
                    </div>
                  </Card>
                );
              })}
            </div>

            <div className="mt-10 rounded-2xl border border-slate-700 bg-slate-900 p-6">
              <p className="text-sm font-semibold text-slate-200">Preview</p>
              <p className="mt-2 text-sm text-slate-400">
                {selectedSubverticalPreset
                  ? `${selectedSubverticalPreset.label}: margin ${(selectedSubverticalPreset.margin * 100).toFixed(1)}%, bonus ${(selectedSubverticalPreset.bonusRate * 100).toFixed(1)}%, reg to FTD ${(selectedSubverticalPreset.regToFtdCvr * 100).toFixed(1)}%, player value $${selectedSubverticalPreset.playerValue}, retention ${(selectedSubverticalPreset.retentionRate * 100).toFixed(0)}%.`
                  : 'Skip this if you want to enter your own revenue model inputs later.'}
              </p>
            </div>

            <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
              <Button
                variant="ghost"
                className="text-muted-foreground hover:bg-slate-900 hover:text-white"
                onClick={() => goToStep(2)}
              >
                ← Back
              </Button>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="ghost"
                  className="text-slate-300 hover:bg-slate-900 hover:text-white"
                  onClick={() => selectSubvertical(null)}
                >
                  Skip / I'll enter my own numbers
                </Button>
              </div>
            </div>
          </section>
        )}

        {state.step === 4 && (
          <section className="flex flex-1 flex-col">
            <h1 className="text-4xl font-bold tracking-tight">
              What's your primary goal this month?
            </h1>
            <p className="mt-3 text-slate-400">
              This shapes how your budget is weighted across channels.
            </p>

            <div className="mt-10 space-y-4">
              {GOAL_OPTIONS.map(({ key, title, subtitle, Icon }) => {
                const selected = state.goal === key;
                return (
                  <Card
                    key={key}
                    role="button"
                    tabIndex={0}
                    className={`cursor-pointer border bg-slate-900 p-5 transition-all ${
                      selected
                        ? 'border-indigo-500 ring-2 ring-indigo-500/60'
                        : 'border-slate-700 hover:border-indigo-400'
                    }`}
                    onClick={() => selectGoal(key)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        selectGoal(key);
                      }
                    }}
                  >
                    <div className="flex items-start gap-4">
                      <span className="rounded-md bg-slate-800 p-2">
                        <Icon className="h-5 w-5 text-indigo-300" />
                      </span>
                      <div>
                        <h3 className="text-lg font-semibold">{title}</h3>
                        <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>

            <div className="mt-10 flex items-center justify-between">
              <Button
                variant="ghost"
                className="text-muted-foreground hover:bg-slate-900 hover:text-white"
                onClick={() => goToStep(state.vertical === 'igaming' ? 3 : 2)}
              >
                ← Back
              </Button>
              <p className="text-sm text-slate-500">Select a goal to continue</p>
            </div>
          </section>
        )}

        {state.step === 5 && (
          <section className="flex flex-1 flex-col">
            <h1 className="text-4xl font-bold tracking-tight">Where are your target markets?</h1>
            <p className="mt-3 max-w-3xl text-slate-400">
              Select the countries you want to reach. We'll optimise your cost and customer value
              estimates for your chosen markets. Skip if unsure and we'll use global defaults.
            </p>

            <div className="mt-8 space-y-8">
              {GEO_GROUPS.map((group) => {
                const countries = TOP_IGAMING_GEOS.filter((geo) => geo.tier === group.tier);
                return (
                  <div key={group.tier}>
                    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
                      {group.title}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {countries.map((geo) => {
                        const selected = state.geos.includes(geo.name);
                        return (
                          <Button
                            key={geo.name}
                            type="button"
                            variant="outline"
                            className={`h-11 border-slate-700 bg-slate-900 px-4 text-sm ${
                              selected
                                ? 'border-indigo-500 bg-indigo-600 text-white hover:bg-indigo-500'
                                : 'text-slate-200 hover:bg-slate-800'
                            }`}
                            onClick={() => toggleGeo(geo.name)}
                          >
                            <span className="mr-2">{toFlagEmoji(geo.code)}</span>
                            {geo.name}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
              <Button
                variant="ghost"
                className="text-muted-foreground hover:bg-slate-900 hover:text-white"
                onClick={() => goToStep(4)}
              >
                ← Back
              </Button>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="ghost"
                  className="text-slate-300 hover:bg-slate-900 hover:text-white"
                  onClick={() => {
                    setState((prev) => ({ ...prev, geos: [] }));
                    goToStep(6);
                  }}
                >
                  Skip - use global defaults
                </Button>
                <Button
                  className="bg-indigo-600 px-7 hover:bg-indigo-500"
                  onClick={() => goToStep(6)}
                >
                  Continue -&gt;
                </Button>
              </div>
            </div>
          </section>
        )}

        {state.step === 6 && (
          <section className="flex flex-1 flex-col">
            <h1 className="text-4xl font-bold tracking-tight">Do you know your numbers?</h1>
            <p className="mt-3 max-w-3xl text-slate-400">
              If you have real data, enter it here. Otherwise skip and we'll use industry averages
              for your selected business type.
            </p>

            <div className="mt-10 grid gap-6 md:grid-cols-2">
              <Card className="border-slate-700 bg-slate-900 p-5">
                <label className="text-sm font-semibold text-slate-200">
                  Cost to acquire one customer
                </label>
                <div className="relative mt-3">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                    $
                  </span>
                  <Input
                    inputMode="decimal"
                    value={state.benchmarks.cpa}
                    onChange={(event) =>
                      setState((prev) => ({
                        ...prev,
                        benchmarks: { ...prev.benchmarks, cpa: event.target.value },
                      }))
                    }
                    placeholder={String(selectedPreset?.defaultCpaTarget ?? '')}
                    className="h-12 border-slate-700 bg-slate-950 pl-10 text-lg text-white"
                    aria-label="Cost to acquire one customer"
                  />
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  How much does it cost you to acquire one paying customer?
                </p>
              </Card>

              <Card className="border-slate-700 bg-slate-900 p-5">
                <label className="text-sm font-semibold text-slate-200">
                  Customer lifetime value
                </label>
                <div className="relative mt-3">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                    $
                  </span>
                  <Input
                    inputMode="decimal"
                    value={state.benchmarks.ltv}
                    onChange={(event) =>
                      setState((prev) => ({
                        ...prev,
                        benchmarks: { ...prev.benchmarks, ltv: event.target.value },
                      }))
                    }
                    placeholder={String(selectedPreset?.defaultPlayerValue ?? '')}
                    className="h-12 border-slate-700 bg-slate-950 pl-10 text-lg text-white"
                    aria-label="Customer lifetime value"
                  />
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  How much does one customer spend with you over their lifetime?
                </p>
              </Card>
            </div>

            <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
              <Button
                variant="ghost"
                className="text-muted-foreground hover:bg-slate-900 hover:text-white"
                onClick={() => goToStep(5)}
              >
                ← Back
              </Button>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="ghost"
                  className="text-slate-300 hover:bg-slate-900 hover:text-white"
                  onClick={() => void applyPlan(false)}
                >
                  Skip - use defaults
                </Button>
                <Button
                  className="h-12 bg-indigo-600 px-8 text-base hover:bg-indigo-500"
                  onClick={() => void applyPlan(true)}
                >
                  Build my plan -&gt;
                </Button>
              </div>
            </div>
          </section>
        )}

        {state.step === 'generating' && (
          <section className="flex flex-1 flex-col items-center justify-center">
            <div className="rounded-full bg-indigo-600/20 p-6">
              <Sparkles className="h-16 w-16 animate-pulse text-indigo-400" />
            </div>
            <p className="mt-8 text-lg text-slate-200">{STATUS_MESSAGES[statusIndex]}</p>
          </section>
        )}
      </div>
    </div>
  );
};
