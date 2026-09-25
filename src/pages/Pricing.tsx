import { useUser, useAuth } from '@clerk/clerk-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePaymentStatus } from '@/hooks/use-payment-status';
import { createCheckoutSession } from '@/lib/billing';
import { PAID_PLANS, type PlanInfo } from '@/lib/plans';
import { LegalLinks } from '@/pages/Legal';

export default function Pricing() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { hasActivePayment } = usePaymentStatus();
  const [processingTier, setProcessingTier] = useState<PlanInfo['tier'] | null>(null);

  // Redirect if already paid or not signed in
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      navigate('/auth');
    }
    if (isLoaded && hasActivePayment) {
      navigate('/app');
    }
  }, [isLoaded, isSignedIn, hasActivePayment, navigate]);

  useEffect(() => {
    if (params.get('checkout') === 'cancelled') toast.info('Checkout cancelled. No charge was made.');
  }, [params]);

  const startCheckout = async (tier: PlanInfo['tier']) => {
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">Choose Your Plan</h1>
          <p className="text-xl text-gray-600">Plan your media budget with an AI planner</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-12">
          {PAID_PLANS.map((plan, idx) => (
            <Card
              key={plan.tier}
              className={
                idx === 0
                  ? 'relative border-2 border-blue-500 shadow-lg'
                  : 'relative border-2 border-gray-200 hover:border-blue-500 transition-colors'
              }
            >
              {idx === 0 && (
                <div className="absolute top-4 right-4 bg-blue-500 text-white px-4 py-1 rounded-full text-sm font-semibold">
                  Most Popular
                </div>
              )}
              <CardHeader>
                <CardTitle className="text-2xl font-bold">{plan.name}</CardTitle>
                <p className="text-gray-600 mt-2">{plan.tagline}</p>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <span className="text-4xl font-bold">{plan.priceLabel}</span>
                  <span className="text-gray-600 ml-2">/month</span>
                </div>
                <ul className="space-y-3 text-gray-700">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button
                  onClick={() => startCheckout(plan.tier)}
                  disabled={processingTier !== null}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-6"
                >
                  {processingTier === plan.tier ? 'Opening checkout…' : `Get ${plan.name}`}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="text-center text-sm text-gray-600 mb-4">
          Billed monthly. Cancel any time. 14-day money-back guarantee on your first payment.
        </p>
        <LegalLinks />
      </div>
    </div>
  );
}
