import { useUser, useAuth } from '@clerk/clerk-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePaymentStatus } from '@/hooks/use-payment-status';
import { createCheckoutSession } from '@/lib/billing';
import { PAID_PLANS, type PaidPlanInfo } from '@/lib/plans';
import { LegalLinks } from '@/pages/Legal';
import { BrandLogo } from '@/components/common/BrandLogo';

export default function Pricing() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { hasActivePayment, effectiveTier } = usePaymentStatus();
  const [processingTier, setProcessingTier] = useState<PaidPlanInfo['tier'] | null>(null);

  // Signed-out visitors go to sign-up (deliberate). Signed-in users, paying or not, can see the plans.
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      navigate('/sign-up');
    }
  }, [isLoaded, isSignedIn, navigate]);

  const currentPaidTier = hasActivePayment ? effectiveTier : null;

  useEffect(() => {
    if (params.get('checkout') === 'cancelled') toast.info('Checkout cancelled. No charge was made.');
  }, [params]);

  const startCheckout = async (tier: PaidPlanInfo['tier']) => {
    setProcessingTier(tier);
    try {
      const { url } = await createCheckoutSession({
        tier,
        email: user?.primaryEmailAddress?.emailAddress,
      });
      window.location.href = url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start checkout.');
      setProcessingTier(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-12 text-white">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <BrandLogo size="md" tone="dark" className="justify-center mb-6" />
          <h1 className="mb-4 text-4xl font-semibold text-white md:text-5xl">Choose Your Plan</h1>
          <p className="text-lg text-slate-400 md:text-xl">Plan your media budget with an AI planner</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-12">
          {PAID_PLANS.map((plan, idx) => {
            // A paying customer is never offered the plan they have, or a lower one.
            // Cards set their own colours: this page is dark whatever the app theme is.
            const isCurrent = currentPaidTier === plan.tier;
            const isIncluded = currentPaidTier === 'enterprise' && plan.tier === 'pro';
            return (
            <Card
              key={plan.tier}
              className={
                idx === 0
                  ? 'relative border border-slate-500 bg-slate-900 text-white'
                  : 'relative border border-slate-800 bg-slate-900 text-white transition-colors hover:border-slate-500'
              }
            >
              {idx === 0 && (
                <div className="absolute right-4 top-4 rounded-full border border-slate-700 px-3 py-0.5 text-xs font-medium text-slate-300">
                  Most Popular
                </div>
              )}
              <CardHeader>
                <CardTitle className="text-2xl font-bold">{plan.name}</CardTitle>
                <p className="mt-2 text-slate-400">{plan.tagline}</p>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <span className="text-4xl font-bold">{plan.priceLabel}</span>
                  <span className="ml-2 text-slate-400">/month</span>
                </div>
                <ul className="space-y-3 text-slate-200">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <span className="text-emerald-400" aria-hidden="true">✓</span>
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button
                  onClick={() => startCheckout(plan.tier)}
                  disabled={processingTier !== null || isCurrent || isIncluded}
                  className="w-full rounded-full bg-indigo-600 py-6 hover:bg-indigo-500"
                >
                  {isCurrent
                    ? 'Current plan'
                    : isIncluded
                      ? 'Included in your plan'
                      : processingTier === plan.tier
                        ? 'Opening checkout…'
                        : `Get ${plan.name}`}
                </Button>
              </CardContent>
            </Card>
            );
          })}
        </div>

        {currentPaidTier ? (
          <p className="text-center mb-4">
            <Link to="/app" className="text-sm font-semibold text-white underline underline-offset-4">
              Back to my plan
            </Link>
          </p>
        ) : null}
        <p className="mb-4 text-center text-sm text-slate-400">
          Billed monthly. Cancel any time. 14-day money-back guarantee on your first payment.
        </p>
        <LegalLinks />
      </div>
    </div>
  );
}
