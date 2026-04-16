import { useUser } from '@clerk/clerk-react';

export interface PaymentStatus {
  hasActivePayment: boolean;
  paymentMethod?: string;
  expiresAt?: number;
}

export const usePaymentStatus = (): PaymentStatus => {
  const { user, isLoaded } = useUser();

  if (!isLoaded || !user) {
    return { hasActivePayment: false };
  }

  // Check custom metadata stored in Clerk
  const publicMetadata = (user.publicMetadata || {}) as Record<string, any>;
  const hasActivePayment = publicMetadata.payment_status === true;

  return {
    hasActivePayment,
    paymentMethod: publicMetadata.payment_method,
    expiresAt: publicMetadata.payment_expires_at,
  };
};
