import { useId, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  CandlestickChart,
  Check,
  Dice5,
  Loader2,
  Search,
  ShoppingBag,
  Sparkles,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { ConfirmDialog, type ConfirmRequest } from '@/components/common/ConfirmDialog';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { BRAND_NAME } from '@/lib/brand';
import { getOnboardingMarkets } from '@/lib/geo-market-data';
import { INDUSTRY_PACKS, industryToVertical, type IndustryId } from '@/lib/industries';
import { announcePlanReady, applyOnboardingPlan, replacePlanConfirm } from '@/lib/onboarding-apply';
import { GOAL_OPTIONS } from '@/lib/onboarding-goals';
import { generatePlan } from '@/lib/plan-generator';
import {
  INDUSTRY_CARDS,
  INITIAL_QUICK_START,
  QUICK_START_EXAMPLES,
  QUICK_START_FIELD_LABELS,
  fillBriefWithAI,
  industryFunnel,
  parseTargetCpa,
  previewPlan,
  quickStartBrief,
  type QuickStartField,
  type QuickStartForm,
} from '@/lib/quick-start';
import { WIZARD_MAX_BUDGET, WIZARD_MIN_BUDGET, isValidBudget, parseBudgetInput } from '@/lib/wizard-budget';
import { useOnboardingDraftStore } from '@/store/useOnboardingDraftStore';

const INDUSTRY_ICONS: Record<IndustryId, LucideIcon> = {
  igaming: Dice5,
  forex: CandlestickChart,
  fintech: Wallet,
  ecommerce: ShoppingBag,
  saas: Building2,
};

const QUICK_BUDGETS = [10000, 25000, 50000, 100000, 250000];
const COMMON_MARKETS = 8;
const PREVIEW_COLORS = ['bg-indigo-400', 'bg-indigo-500', 'bg-indigo-600'];

type AiStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'filled'; fields: QuickStartField[]; skippedMarkets: string[] }
  | { kind: 'failed'; message: string };

const optionClass = (selected: boolean) =>
  `border transition-colors ${
    selected
      ? 'border-indigo-500 bg-indigo-600/20 text-white'
      : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500 hover:text-white'
  }`;

const AiTag = () => (
  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/15 px-1.5 py-0.5 text-[11px] font-medium leading-none text-indigo-300">
    <Sparkles className="h-3 w-3" aria-hidden />
    AI filled
  </span>
);

function FieldLabel({ htmlFor, id, children, ai, hint }: {
  htmlFor?: string;
  id?: string;
  children: ReactNode;
  ai: boolean;
  hint?: string;
}) {
  const className = 'text-xs font-semibold uppercase tracking-wide text-slate-400';
  return (
    <div className="mb-2 flex min-h-5 items-center gap-2">
      {htmlFor ? (
        <label htmlFor={htmlFor} className={className}>{children}</label>
      ) : (
        <span id={id} className={className}>{children}</span>
      )}
      {hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
      {ai ? <AiTag /> : null}
    </div>
  );
}

export const QuickStart = () => {
  const { format, symbol, code } = useCurrency();
  const navigate = useNavigate();
  const hasExistingPlan = useMediaPlanStore((state) => state.hasCompletedOnboarding);
  const ids = useId();

  const [form, setForm] = useState<QuickStartForm>(INITIAL_QUICK_START);
  const [description, setDescription] = useState('');
  const [ai, setAi] = useState<AiStatus>({ kind: 'idle' });
  const [marketQuery, setMarketQuery] = useState('');
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);

  const aiFilled = ai.kind === 'filled' ? ai.fields : [];
  const isAi = (field: QuickStartField) => aiFilled.includes(field);

  /** A manual change: the field is no longer "AI filled". */
  const update = (field: QuickStartField, patch: Partial<QuickStartForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setAi((prev) =>
      prev.kind === 'filled' ? { ...prev, fields: prev.fields.filter((f) => f !== field) } : prev
    );
  };

  const markets = useMemo(() => getOnboardingMarkets(form.industry), [form.industry]);
  const query = marketQuery.trim().toLowerCase();
  const shownMarkets = markets.filter((m, index) =>
    query
      ? m.name.toLowerCase().includes(query) || m.code.toLowerCase() === query
      : index < COMMON_MARKETS || form.markets.includes(m.code)
  );

  const selectIndustry = (industry: IndustryId) => {
    // Market lists differ per industry: keep only the picked markets the new list offers.
    const offered = new Set(getOnboardingMarkets(industry).map((m) => m.code));
    update('industry', { industry, markets: form.markets.filter((c) => offered.has(c)) });
  };

  const toggleMarket = (marketCode: string) =>
    update('markets', {
      markets: form.markets.includes(marketCode)
        ? form.markets.filter((c) => c !== marketCode)
        : [...form.markets, marketCode],
    });

  const fillWithAI = async () => {
    const text = description.trim();
    if (text.length < 3 || ai.kind === 'loading') return;
    setAi({ kind: 'loading' });
    const result = await fillBriefWithAI(text, code, form.industry);
    if (!result.ok) {
      setAi({ kind: 'failed', message: result.message });
      return;
    }
    setForm((prev) => ({ ...prev, ...result.patch }));
    setMarketQuery('');
    setAi({ kind: 'filled', fields: result.filled, skippedMarkets: result.skippedMarkets });
  };

  const brief = useMemo(() => quickStartBrief(form), [form]);
  const plan = useMemo(() => (brief ? generatePlan(brief) : null), [brief]);
  const preview = useMemo(() => (plan ? previewPlan(plan) : null), [plan]);
  const funnel = industryFunnel(form.industry);

  const budgetRange = `${format(WIZARD_MIN_BUDGET)} to ${format(WIZARD_MAX_BUDGET)}`;
  const budgetInvalid = form.budget !== '' && !isValidBudget(form.budget);
  const missing = [
    form.industry ? null : 'pick an industry',
    isValidBudget(form.budget) ? null : form.budget === '' ? 'enter a monthly budget' : `set a budget from ${budgetRange}`,
  ].filter(Boolean);
  const missingHint = missing.length > 0 ? `To build: ${missing.join(' and ')}.` : null;

  const build = (replaceConfirmed = false) => {
    if (!plan || !form.industry || !isValidBudget(form.budget)) return;
    if (hasExistingPlan && !replaceConfirmed) {
      setConfirmRequest(replacePlanConfirm(() => build(true)));
      return;
    }
    applyOnboardingPlan({
      vertical: industryToVertical(form.industry),
      subvertical: null,
      budget: form.budget,
      geos: form.markets,
      generatedPlan: plan,
      knownCpa: parseTargetCpa(form.targetCpa),
    });
    // A half-finished guided run must not resume after a plan was built here.
    useOnboardingDraftStore.getState().reset();
    announcePlanReady();
    navigate('/app', { replace: true });
  };

  const linkClass = 'rounded text-sm text-slate-400 underline-offset-4 hover:text-white hover:underline';

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <ConfirmDialog request={confirmRequest} onClose={() => setConfirmRequest(null)} />
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 pt-4 sm:px-8">
        <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600">
              <Sparkles className="h-4 w-4" aria-hidden />
            </span>
            {BRAND_NAME}
          </span>
          <nav className="flex items-center gap-5">
            {hasExistingPlan ? (
              <Link to="/app" className={linkClass}>← Back to my plan</Link>
            ) : null}
            <Link to="/onboard?mode=guided" className={linkClass}>Guided setup (6 steps)</Link>
          </nav>
        </header>

        <div className="mt-4">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Your media plan in a few clicks</h1>
          <p className="mt-1 text-sm text-slate-400">
            Describe the campaign or pick the basics. The planning engine builds the plan; you fine-tune it after.
          </p>
        </div>

        <section
          aria-labelledby={`${ids}-describe`}
          className="mt-5 rounded-xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/50 via-slate-900 to-slate-900 p-4 sm:p-5"
        >
          <label
            id={`${ids}-describe`}
            htmlFor={`${ids}-text`}
            className="flex items-center gap-2 text-base font-semibold text-white"
          >
            <Sparkles className="h-4 w-4 text-indigo-400" aria-hidden />
            Describe your business and campaign in a sentence
          </label>
          <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-stretch">
            <textarea
              id={`${ids}-text`}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void fillWithAI();
                }
              }}
              rows={2}
              maxLength={600}
              placeholder="e.g. Online casino, €60k/month, Germany and Canada, more first-time depositors"
              className="min-h-[4.5rem] flex-1 resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={() => void fillWithAI()}
              disabled={description.trim().length < 3 || ai.kind === 'loading'}
              className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-indigo-500/60 bg-indigo-600/20 px-5 text-sm font-semibold text-indigo-100 transition-colors hover:bg-indigo-600/40 disabled:cursor-not-allowed disabled:opacity-50 md:w-44"
            >
              {ai.kind === 'loading' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden />
              )}
              {ai.kind === 'loading' ? 'Reading…' : 'Fill with AI'}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">Try:</span>
            {QUICK_START_EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                title={example.text}
                onClick={() => setDescription(example.text)}
                className="min-h-0 rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-left text-xs leading-snug text-slate-300 transition-colors hover:border-indigo-500 hover:text-white"
              >
                {example.label}
              </button>
            ))}
          </div>
          <div role="status" aria-live="polite" data-testid="ai-status">
            {ai.kind === 'filled' ? (
              <p className="mt-3 flex items-start gap-2 text-sm text-emerald-300">
                <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  AI filled {ai.fields.map((f) => QUICK_START_FIELD_LABELS[f]).join(', ') || 'nothing new'}. Check the
                  choices below, then build.
                  {ai.skippedMarkets.length > 0
                    ? ` Not in our market list: ${ai.skippedMarkets.join(', ')}.`
                    : ''}
                </span>
              </p>
            ) : null}
            {ai.kind === 'failed' ? <p className="mt-3 text-sm text-amber-300">{ai.message}</p> : null}
          </div>
        </section>

        <div className="my-3 flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-slate-500">
          <span className="h-px flex-1 bg-slate-800" />
          or pick the basics
          <span className="h-px flex-1 bg-slate-800" />
        </div>

        <form
          className="flex flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            build();
          }}
        >
          <section className="mb-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5">
            <FieldLabel id={`${ids}-industry`} ai={isAi('industry')}>Industry</FieldLabel>
            <div
              role="group"
              aria-labelledby={`${ids}-industry`}
              className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
            >
              {INDUSTRY_PACKS.map((pack) => {
                const selected = form.industry === pack.id;
                const Icon = INDUSTRY_ICONS[pack.id];
                return (
                  <button
                    key={pack.id}
                    type="button"
                    aria-pressed={selected}
                    title={pack.description}
                    onClick={() => selectIndustry(pack.id)}
                    className={`flex min-h-0 items-start gap-2.5 rounded-xl p-3 text-left ${optionClass(selected)}`}
                  >
                    <Icon
                      className={`mt-0.5 h-5 w-5 shrink-0 ${selected ? 'text-indigo-300' : 'text-slate-500'}`}
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold leading-tight text-white">
                        {INDUSTRY_CARDS[pack.id].title}
                      </span>
                      <span className="mt-1 block text-xs leading-snug text-slate-400">
                        {INDUSTRY_CARDS[pack.id].tagline}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 grid gap-x-6 gap-y-5 lg:grid-cols-[1fr_1.15fr_1.35fr]">
              <div>
                <FieldLabel htmlFor={`${ids}-budget`} ai={isAi('budget')}>Monthly budget</FieldLabel>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                    {symbol}
                  </span>
                  <input
                    id={`${ids}-budget`}
                    inputMode="numeric"
                    autoComplete="off"
                    value={form.budget === '' ? '' : form.budget.toLocaleString('en-US')}
                    onChange={(event) => update('budget', { budget: parseBudgetInput(event.target.value) })}
                    placeholder="50,000"
                    aria-invalid={budgetInvalid}
                    aria-describedby={`${ids}-budget-hint`}
                    className={`h-11 w-full rounded-lg border bg-slate-950 pl-8 pr-3 text-base font-semibold text-white placeholder:font-normal placeholder:text-slate-600 ${
                      budgetInvalid ? 'border-amber-500' : 'border-slate-700 focus:border-indigo-500'
                    }`}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {QUICK_BUDGETS.map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      aria-pressed={form.budget === amount}
                      aria-label={`Set budget to ${format(amount)}`}
                      onClick={() => update('budget', { budget: amount })}
                      className={`min-h-0 rounded-full px-2 py-1 text-xs font-medium ${optionClass(form.budget === amount)}`}
                    >
                      {format(amount, true).replace('.0K', 'k')}
                    </button>
                  ))}
                </div>
                <p
                  id={`${ids}-budget-hint`}
                  className={`mt-1.5 text-xs ${budgetInvalid ? 'text-amber-300' : 'text-slate-500'}`}
                >
                  {budgetInvalid ? `Enter an amount from ${budgetRange}.` : 'Per month. You can change it later.'}
                </p>

                <div className="mt-4">
                  <FieldLabel htmlFor={`${ids}-cpa`} ai={isAi('targetCpa')} hint="optional">
                    Target cost per conversion
                  </FieldLabel>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                      {symbol}
                    </span>
                    <input
                      id={`${ids}-cpa`}
                      inputMode="decimal"
                      autoComplete="off"
                      value={form.targetCpa}
                      onChange={(event) =>
                        update('targetCpa', { targetCpa: event.target.value.replace(/[^0-9.,]/g, '') })
                      }
                      placeholder={funnel ? `Your ${funnel.costPerConversion}` : 'What one new customer may cost'}
                      className="h-10 min-h-0 w-full rounded-lg border border-slate-700 bg-slate-950 pl-8 pr-3 text-sm text-white placeholder:text-slate-600 focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              <div>
                <FieldLabel id={`${ids}-goal`} ai={isAi('goal')}>Goal</FieldLabel>
                <div role="group" aria-labelledby={`${ids}-goal`} className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
                  {GOAL_OPTIONS.map((goal) => {
                    const selected = form.goal === goal.key;
                    return (
                      <button
                        key={goal.key}
                        type="button"
                        aria-pressed={selected}
                        title={goal.subtitle}
                        onClick={() => update('goal', { goal: goal.key })}
                        className={`flex min-h-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium ${optionClass(selected)}`}
                      >
                        <goal.Icon
                          className={`h-4 w-4 shrink-0 ${selected ? 'text-indigo-300' : 'text-slate-500'}`}
                          aria-hidden
                        />
                        {goal.short}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <FieldLabel
                  id={`${ids}-markets`}
                  ai={isAi('markets')}
                  hint={form.markets.length > 0 ? `${form.markets.length} selected` : 'optional'}
                >
                  Markets
                </FieldLabel>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
                  <input
                    type="search"
                    aria-label="Search markets"
                    value={marketQuery}
                    onChange={(event) => setMarketQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return;
                      // Enter picks the first match instead of submitting the form.
                      event.preventDefault();
                      const first = query ? shownMarkets.find((m) => !form.markets.includes(m.code)) : undefined;
                      if (first) {
                        toggleMarket(first.code);
                        setMarketQuery('');
                      }
                    }}
                    placeholder={`Search ${markets.length} markets`}
                    className="h-10 min-h-0 w-full rounded-lg border border-slate-700 bg-slate-950 pl-9 pr-3 text-sm text-white placeholder:text-slate-600 focus:border-indigo-500"
                  />
                </div>
                <div role="group" aria-labelledby={`${ids}-markets`} className="mt-2 flex flex-wrap gap-1.5">
                  {shownMarkets.map((market) => {
                    const selected = form.markets.includes(market.code);
                    return (
                      <button
                        key={market.code}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleMarket(market.code)}
                        className={`flex min-h-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${optionClass(selected)}`}
                      >
                        {selected ? <Check className="h-3 w-3" aria-hidden /> : null}
                        {market.name}
                      </button>
                    );
                  })}
                  {shownMarkets.length === 0 ? (
                    <p className="text-xs text-slate-500">No market matches “{marketQuery.trim()}”.</p>
                  ) : null}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {form.markets.length === 0
                    ? 'No market picked: the plan uses premium-market costs.'
                    : 'Costs and volumes follow the markets you pick.'}
                </p>
              </div>
            </div>
          </section>

          <div className="sticky bottom-0 z-10 -mx-4 mt-auto border-t border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-6">
              <div className="min-w-0 flex-1" data-testid="plan-preview" aria-live="polite">
                {preview && plan ? (
                  <>
                    <p className="line-clamp-2 text-xs leading-snug text-slate-300 sm:text-sm">
                      <span className="font-semibold text-white">
                        {preview.channelCount} {preview.channelCount === 1 ? 'channel' : 'channels'}
                      </span>
                      {preview.channels.slice(0, 3).map((channel) => (
                        <span key={channel.id}>
                          {' · '}
                          {channel.name} <span className="font-semibold text-indigo-300">{Math.round(channel.sharePct)}%</span>
                        </span>
                      ))}
                    </p>
                    <div className="mt-1.5 hidden h-1.5 w-full max-w-xl gap-0.5 overflow-hidden rounded-full sm:flex" aria-hidden>
                      {preview.channels.map((channel, index) => (
                        <span
                          key={channel.id}
                          className={`h-full ${PREVIEW_COLORS[index] ?? 'bg-slate-700'}`}
                          style={{ width: `${channel.sharePct}%` }}
                        />
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-slate-500 sm:mt-1.5">
                      ≈ {Math.round(preview.conversions).toLocaleString('en-US')} conversions
                      {funnel ? ` (${funnel.conversionShort})` : ''} a month
                      {preview.costPerConversion ? ` · ${format(preview.costPerConversion)} each` : ''}
                      {plan.unallocated > 0
                        ? ` · ${format(plan.unallocated)} left unplaced to avoid saturating channels`
                        : ''}
                      <span className="hidden sm:inline"> · engine estimates, not guarantees</span>
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">
                    Your plan preview appears here as soon as you pick an industry and a budget.
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-stretch md:items-end">
                <button
                  type="submit"
                  disabled={!plan}
                  aria-describedby={missingHint ? `${ids}-missing` : undefined}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-7 md:h-12 text-base font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                >
                  Build my plan
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
                {missingHint ? (
                  <p id={`${ids}-missing`} className="mt-1 text-center text-xs text-slate-400 md:text-right">
                    {missingHint}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
