import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUser, useAuth } from '@clerk/clerk-react';
import { Button } from '@/components/ui/button';
import { usePaymentStatus } from '@/hooks/use-payment-status';
import { LegalLinks } from '@/pages/Legal';
import { BrandLogo } from '@/components/common/BrandLogo';
import { BRAND_NAME } from '@/lib/brand';
import { FREE_PLAN } from '@/lib/plans';
import { formatMoney } from '@/contexts/CurrencyContext';

const BENEFITS = [
  {
    title: 'Markets with CPA and LTV benchmarks',
    body: 'Split an iGaming budget by market and tier, with CPA and player value for each.',
  },
  {
    title: 'P&L and payback',
    body: 'See month-1 and lifetime profit, break-even CPA and payback before you spend.',
  },
  {
    title: 'AI media planner',
    body: 'Ask the planner to rebuild the plan or rebalance channels on Pro.',
  },
];

// Fixed demo plan, rendered read-only (illustrative numbers, not live data).
const DEMO_BUDGET = 50000;
const DEMO_MARKETS = [
  { name: 'United Kingdom', share: 40, cpa: 180, ltv: 310 },
  { name: 'Canada', share: 35, cpa: 150, ltv: 270 },
  { name: 'Germany', share: 25, cpa: 130, ltv: 210 },
];

function DashboardPreview() {
  const money = (v: number) => formatMoney(v, 'EUR');
  const rows = DEMO_MARKETS.map((m) => {
    const customers = Math.round((DEMO_BUDGET * m.share) / 100 / m.cpa);
    return { ...m, customers, value: customers * m.ltv };
  });
  const customers = rows.reduce((a, r) => a + r.customers, 0);
  const value = rows.reduce((a, r) => a + r.value, 0);
  return (
    <figure
      data-testid="landing-preview"
      className="mx-auto mt-12 max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-5 text-left"
    >
      <figcaption className="mb-3 text-[11px] uppercase tracking-wider text-slate-500">
        Example plan (illustration, not live data)
      </figcaption>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          ['Budget', money(DEMO_BUDGET)],
          ['New players', String(customers)],
          ['Lifetime value', money(value)],
        ].map(([label, val]) => (
          <div key={label} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
            <div className="text-base font-semibold tabular-nums text-white sm:text-lg">{val}</div>
          </div>
        ))}
      </div>
      <ul className="mt-4 space-y-3">
        {rows.map((r) => (
          <li key={r.name}>
            <div className="flex flex-wrap justify-between gap-x-2 text-sm text-slate-100">
              <span>
                {r.name} {r.share}%
              </span>
              <span className="tabular-nums text-slate-400">
                CPA {money(r.cpa)} / LTV {money(r.ltv)}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-slate-800" aria-hidden="true">
              <div className="h-1.5 rounded-full bg-white" style={{ width: `${r.share}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </figure>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { hasActivePayment } = usePaymentStatus();

  // Redirect authenticated + paid users directly to app
  useEffect(() => {
    if (isLoaded && isSignedIn && hasActivePayment) {
      navigate('/app', { replace: true });
    }
  }, [isLoaded, isSignedIn, hasActivePayment, navigate]);

  const handleEnter = () => {
    // Free tier: every signed-in user goes to the app (AI usage is capped server-side).
    if (isSignedIn) {
      navigate('/app');
    } else {
      navigate('/sign-up');
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-white">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <BrandLogo size="md" as="h2" />
        <nav className="flex items-center gap-2" aria-label="Account">
          {isLoaded && !isSignedIn && (
            <Link
              to="/auth"
              className="rounded-full border border-slate-800 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:border-slate-600 hover:text-white"
            >
              Sign in
            </Link>
          )}
          <Link
            to={isSignedIn ? '/app' : '/sign-up'}
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-slate-200"
          >
            {isSignedIn ? 'Open app' : 'Start free'}
          </Link>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 pb-16 pt-10 text-center sm:pt-16">
        <h1 className="mx-auto max-w-4xl break-words text-3xl font-medium leading-[1.05] tracking-[-0.05em] sm:text-6xl md:text-7xl">
          Plan and forecast iGaming acquisition budgets by market
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
          Split a budget across markets and channels, check CPA, LTV, P&amp;L and payback, and compare scenarios before
          you spend.
        </p>

        {/* CTA */}
        <div className="mt-8 flex flex-col items-center gap-3">
          <Button
            onClick={handleEnter}
            size="lg"
            className="h-auto whitespace-normal rounded-full bg-white px-7 py-3.5 text-base font-semibold text-slate-950 hover:bg-slate-200"
          >
            {isSignedIn ? `Enter ${BRAND_NAME} →` : 'Start free, no card required'}
          </Button>
          {isLoaded && !isSignedIn && (
            <p className="text-sm text-slate-400">
              Already have an account?{' '}
              <Link to="/auth" className="font-semibold text-white underline underline-offset-4">
                Sign in
              </Link>
            </p>
          )}
        </div>

        <DashboardPreview />

        {/* Benefits */}
        <ul
          className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-slate-800 bg-slate-800 text-left sm:grid-cols-3"
          aria-label="Benefits"
        >
          {BENEFITS.map((b) => (
            <li key={b.title} className="bg-slate-950 p-6">
              <p className="font-semibold tracking-tight">{b.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{b.body}</p>
            </li>
          ))}
        </ul>

        <p className="mt-10 text-sm text-slate-400">
          The {FREE_PLAN.name} plan includes the planner and scenarios. Pro adds the AI planner and exports.{' '}
          <Link to="/pricing" className="font-semibold text-white underline underline-offset-4">
            See pricing
          </Link>
        </p>
        <LegalLinks className="mt-6 text-slate-500" />
      </main>
    </div>
  );
}
