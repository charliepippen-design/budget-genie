import { useUser } from '@clerk/clerk-react';
import type { SubscriptionTier } from '@/hooks/use-media-plan-store';

export interface PaymentStatus {
  hasActivePayment: boolean;
  isSuperUser: boolean;
  effectiveTier: SubscriptionTier;
  paymentMethod?: string;
  expiresAt?: number;
}

interface ClerkPublicMetadata {
  payment_status?: boolean | string | number;
  payment_method?: string;
  payment_expires_at?: number;
  is_superuser?: boolean | string | number;
  role?: string;
  subscription_tier?: string;
  plan_tier?: string;
}

const isTruthyFlag = (value: unknown): boolean => {
  return value === true || value === 'true' || value === 1 || value === '1';
};

const parseTier = (value: unknown): SubscriptionTier | null => {
  if (value === 'free' || value === 'pro' || value === 'enterprise') {
    return value;
  }

  return null;
};

export const usePaymentStatus = (): PaymentStatus => {
  const { user, isLoaded } = useUser();

  if (!isLoaded || !user) {
    return { hasActivePayment: false, isSuperUser: false, effectiveTier: 'free' };
  }

  // Check custom metadata stored in Clerk
  const publicMetadata = (user.publicMetadata || {}) as ClerkPublicMetadata;
  const isSuperUser =
    isTruthyFlag(publicMetadata.is_superuser) || publicMetadata.role === 'superuser';
  const hasActivePayment = isTruthyFlag(publicMetadata.payment_status) || isSuperUser;
  const metadataTier =
    parseTier(publicMetadata.subscription_tier) ?? parseTier(publicMetadata.plan_tier);

  const effectiveTier: SubscriptionTier = isSuperUser
    ? 'enterprise'
    : (metadataTier ?? (hasActivePayment ? 'pro' : 'free'));

  return {
    hasActivePayment,
    isSuperUser,
    effectiveTier,
    paymentMethod: publicMetadata.payment_method,
    expiresAt: publicMetadata.payment_expires_at,
  };
};
