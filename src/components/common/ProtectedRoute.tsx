import { ReactNode } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Navigate } from 'react-router-dom';
import { usePaymentStatus } from '@/hooks/use-payment-status';

interface ProtectedRouteProps {
  children: ReactNode;
  requirePayment?: boolean;
}

// Signed-in free users may use the app; only AI usage is capped (server-side, api/_usage.ts).
// Pass requirePayment for a route that should stay paid-only.
export const ProtectedRoute = ({ children, requirePayment = false }: ProtectedRouteProps) => {
  const { isLoaded, isSignedIn } = useAuth();
  const { hasActivePayment } = usePaymentStatus();

  if (!isLoaded) {
    return <div>Loading...</div>;
  }

  if (!isSignedIn) {
    return <Navigate to="/auth" replace />;
  }

  if (requirePayment && !hasActivePayment) {
    return <Navigate to="/pricing" replace />;
  }

  return <>{children}</>;
};
