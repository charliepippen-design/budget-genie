import { useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { usePaymentStatus } from '@/hooks/use-payment-status';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';

export function SubscriptionAccessSync() {
  const { isLoaded, isSignedIn } = useAuth();
  const { hasActivePayment, isSuperUser, effectiveTier } = usePaymentStatus();
  const subscriptionTier = useMediaPlanStore((state) => state.subscriptionTier);
  const setSubscriptionTier = useMediaPlanStore((state) => state.setSubscriptionTier);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (!isSignedIn) {
      if (subscriptionTier !== 'free') {
        setSubscriptionTier('free');
      }
      return;
    }

    if (isSuperUser) {
      if (subscriptionTier !== 'enterprise') {
        setSubscriptionTier('enterprise');
      }
      return;
    }

    if (hasActivePayment) {
      if (subscriptionTier !== effectiveTier) {
        setSubscriptionTier(effectiveTier);
      }
      return;
    }

    if (subscriptionTier !== 'free') {
      setSubscriptionTier('free');
    }
  }, [
    effectiveTier,
    hasActivePayment,
    isLoaded,
    isSignedIn,
    isSuperUser,
    setSubscriptionTier,
    subscriptionTier,
  ]);

  return null;
}
