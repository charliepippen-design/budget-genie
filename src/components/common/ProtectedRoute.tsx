import { ReactNode } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Navigate } from 'react-router-dom';
import { usePaymentStatus } from '@/hooks/use-payment-status';

interface ProtectedRouteProps {
  children: ReactNode;
  requirePayment?: boolean;
}

export const ProtectedRoute = ({ children, requirePayment = true }: ProtectedRouteProps) => {
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
