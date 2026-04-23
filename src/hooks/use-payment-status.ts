import { useUser } from '@clerk/clerk-react';

export interface PaymentStatus {
  hasActivePayment: boolean;
  isSuperUser: boolean;
  paymentMethod?: string;
  expiresAt?: number;
}

interface ClerkPublicMetadata {
  payment_status?: boolean | string | number;
  payment_method?: string;
  payment_expires_at?: number;
  is_superuser?: boolean | string | number;
  role?: string;
}

const isTruthyFlag = (value: unknown): boolean => {
  return value === true || value === 'true' || value === 1 || value === '1';
};

export const usePaymentStatus = (): PaymentStatus => {
  const { user, isLoaded } = useUser();

  if (!isLoaded || !user) {
    return { hasActivePayment: false, isSuperUser: false };
  }

  // Check custom metadata stored in Clerk
  const publicMetadata = (user.publicMetadata || {}) as ClerkPublicMetadata;
  const isSuperUser =
    isTruthyFlag(publicMetadata.is_superuser) || publicMetadata.role === 'superuser';
  const hasActivePayment = isTruthyFlag(publicMetadata.payment_status) || isSuperUser;

  return {
    hasActivePayment,
    isSuperUser,
    paymentMethod: publicMetadata.payment_method,
    expiresAt: publicMetadata.payment_expires_at,
  };
};
