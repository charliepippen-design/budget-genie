import { ReactNode, useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Navigate } from 'react-router-dom';
import { usePaymentStatus } from '@/hooks/use-payment-status';

interface ProtectedRouteProps {
  children: ReactNode;
  requirePayment?: boolean;
}

const SLOW_LOAD_MS = 10_000;

function AuthLoading() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_LOAD_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      role="status"
      className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-950 px-6 text-center text-white"
    >
      <p className="text-lg font-semibold">MediaPlanner Pro</p>
      {slow ? (
        <>
          <p className="text-base">Still loading your account</p>
          <p className="max-w-sm text-sm text-slate-400">
            Check your connection and disable ad or privacy blockers for this site, then reload.
            Your plan is saved in this browser.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500"
          >
            Reload
          </button>
        </>
      ) : (
        <p className="text-sm text-slate-400">Loading...</p>
      )}
    </div>
  );
}

// Signed-in free users may use the app; only AI usage is capped (server-side, api/_usage.ts).
// Pass requirePayment for a route that should stay paid-only.
export const ProtectedRoute = ({ children, requirePayment = false }: ProtectedRouteProps) => {
  const { isLoaded, isSignedIn } = useAuth();
  const { hasActivePayment } = usePaymentStatus();

  if (!isLoaded) {
    return <AuthLoading />;
  }

  if (!isSignedIn) {
    return <Navigate to="/auth" replace />;
  }

  if (requirePayment && !hasActivePayment) {
    return <Navigate to="/pricing" replace />;
  }

  return <>{children}</>;
};
