import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUser, useAuth } from '@clerk/clerk-react';
import { Button } from '@/components/ui/button';
import { usePaymentStatus } from '@/hooks/use-payment-status';
import { LegalLinks } from '@/pages/Legal';
import { BrandLogo } from '@/components/common/BrandLogo';
import { BRAND_NAME, BRAND_TAGLINE } from '@/lib/brand';
import { FREE_PLAN } from '@/lib/plans';

const BENEFITS = [
  { title: 'Allocate by channel', body: 'Split one budget across channels and markets.' },
  { title: 'Compare scenarios', body: 'Change inputs and see the plan update instantly.' },
  { title: 'Export the plan', body: 'Share results as PDF, Excel or CSV on Pro.' },
];

const MOCK_ROWS = [
  { name: 'Search', pct: 35 },
  { name: 'Social', pct: 30 },
  { name: 'Video', pct: 20 },
  { name: 'Display', pct: 15 },
];

/** Lightweight illustration of the planner (not live data). */
function DashboardPreview() {
  return (
    <figure className="mt-10 mx-auto max-w-md rounded-2xl bg-slate-900/90 border border-white/20 p-4 text-left shadow-2xl">
      <figcaption className="text-xs uppercase tracking-wider text-slate-300 mb-3">
        Example plan (illustration)
      </figcaption>
      <ul className="space-y-3">
        {MOCK_ROWS.map((r) => (
          <li key={r.name}>
            <div className="flex justify-between text-sm text-slate-100">
              <span>{r.name}</span>
              <span>{r.pct}%</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-slate-700" aria-hidden="true">
              <div className="h-2 rounded-full bg-blue-400" style={{ width: `${r.pct}%` }} />
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
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-500 to-purple-600 flex flex-col items-center justify-center relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
      <div className="absolute top-0 right-0 w-96 h-96 bg-purple-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
      <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-pink-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>

      {/* Content */}
      <div className="relative z-10 text-center px-4 py-10 w-full max-w-3xl">
        <BrandLogo size="md" as="h2" className="justify-center mb-6" />

        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-white drop-shadow-lg break-words">
          Plan your media budget across channels in minutes
        </h1>
        <p className="mt-4 text-base sm:text-lg md:text-xl text-blue-50 leading-relaxed">
          {BRAND_TAGLINE}. Split a budget across channels, compare scenarios and export the plan.
        </p>

        {/* Benefits */}
        <ul className="mt-8 grid gap-3 sm:grid-cols-3 text-left" aria-label="Benefits">
          {BENEFITS.map((b) => (
            <li key={b.title} className="rounded-xl bg-white/10 border border-white/20 p-4 text-white">
              <p className="font-semibold">{b.title}</p>
              <p className="mt-1 text-sm text-blue-50">{b.body}</p>
            </li>
          ))}
        </ul>

        {/* CTA */}
        <div className="mt-8">
          <Button
            onClick={handleEnter}
            size="lg"
            className="px-6 sm:px-8 py-6 text-base sm:text-lg font-semibold bg-white text-blue-700 hover:bg-blue-50 shadow-2xl whitespace-normal h-auto"
          >
            {isSignedIn ? `Enter ${BRAND_NAME} →` : 'Start free, no card required'}
          </Button>
          {isLoaded && !isSignedIn && (
            <p className="mt-4 text-white/90 text-sm">
              Already have an account?{' '}
              <Link to="/auth" className="font-semibold underline">
                Sign in
              </Link>
            </p>
          )}
        </div>

        <DashboardPreview />

        <p className="mt-8 text-white/80 text-sm">
          The {FREE_PLAN.name} plan includes the planner and scenarios.{' '}
          <Link to="/pricing" className="underline font-semibold">
            See plans
          </Link>
        </p>
        <LegalLinks className="mt-6 text-white/80" />
      </div>

      {/* CSS for animations */}
      <style>{`
        @keyframes blob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </div>
  );
}
