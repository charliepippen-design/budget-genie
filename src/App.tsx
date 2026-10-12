import { AITokenBridge } from '@/lib/ai-client';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Suspense, type ReactNode } from 'react';
import { lazyWithReload } from '@/lib/lazy-with-reload';
import { SectionErrorBoundary } from '@/components/common/SectionErrorBoundary';
import { SIGN_IN_PATH, SIGN_UP_PATH } from '@/lib/auth-routes';
import { CurrencyProvider } from '@/contexts/CurrencyContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { ClerkProvider } from '@clerk/clerk-react';
import { RouteLoadingSkeleton } from '@/components/common/AppSkeletons';
import { useTheme } from '@/hooks/use-theme';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';

import { useStoreSync } from './hooks/use-store-sync';
import { useHistoryRecorder } from '@/hooks/use-history';
import { KeyboardManager } from '@/components/common/KeyboardManager';
import { SubscriptionAccessSync } from '@/components/common/SubscriptionAccessSync';

const Landing = lazyWithReload(() => import('./pages/Landing'), 'Landing');
const Index = lazyWithReload(() => import('./pages/Index'), 'Index');
const Pricing = lazyWithReload(() => import('./pages/Pricing'), 'Pricing');
const NotFound = lazyWithReload(() => import('./pages/NotFound'), 'NotFound');
const Auth = lazyWithReload(() => import('./pages/Auth'), 'Auth');
const Settings = lazyWithReload(() => import('./pages/Settings'), 'Settings');
const Onboard = lazyWithReload(() => import('./pages/Onboard'), 'Onboard');
const Report = lazyWithReload(() => import('./pages/Report'), 'Report');
const Output = lazyWithReload(() => import('./pages/Output'), 'Output');
const Legal = lazyWithReload(() => import('./pages/Legal'), 'Legal');

// Each route gets its own boundary, reset on navigation, so one broken page never blanks the app.
const RouteBoundary = ({ name, children }: { name: string; children: ReactNode }) => {
  const location = useLocation();
  return (
    <SectionErrorBoundary name={name} resetKeys={[location.pathname]}>
      {children}
    </SectionErrorBoundary>
  );
};

const queryClient = new QueryClient();

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkEnabled = !!clerkPubKey;

// Clerk navigates through react-router so multi-step flows never trigger a full page reload.
const ClerkWithRouter = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
      signInUrl={SIGN_IN_PATH}
      signUpUrl={SIGN_UP_PATH}
    >
      {children}
    </ClerkProvider>
  );
};

const AppShell = () => {
  const { theme } = useTheme();

  useStoreSync();
  useHistoryRecorder();

  // ... rest of app

  const appContent = (
    <div
      className={`min-h-screen dashboard-theme ${
        theme === 'contrast'
          ? 'dark contrast theme-contrast'
          : theme === 'dark'
            ? 'dark theme-dark'
            : 'light theme-light'
      }`}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <KeyboardManager />
          <SubscriptionAccessSync />
          <AITokenBridge />
          <CurrencyProvider>
              <Suspense fallback={<RouteLoadingSkeleton />}>
                <Routes>
                  <Route path="/" element={<RouteBoundary name="route:/"><Landing /></RouteBoundary>} />
                  <Route path="/auth/*" element={<RouteBoundary name="route:/auth"><Auth mode="sign-in" /></RouteBoundary>} />
                  <Route path="/sign-up/*" element={<RouteBoundary name="route:/sign-up"><Auth mode="sign-up" /></RouteBoundary>} />
                  <Route path="/pricing" element={<RouteBoundary name="route:/pricing"><Pricing /></RouteBoundary>} />
                  <Route path="/terms" element={<RouteBoundary name="route:/terms"><Legal doc="terms" /></RouteBoundary>} />
                  <Route path="/refund-policy" element={<RouteBoundary name="route:/refund-policy"><Legal doc="refund" /></RouteBoundary>} />
                  <Route path="/privacy" element={<RouteBoundary name="route:/privacy"><Legal doc="privacy" /></RouteBoundary>} />
                  <Route path="/app" element={<RouteBoundary name="route:/app"><ProtectedRoute>
                        <Index />
                      </ProtectedRoute></RouteBoundary>} />
                  <Route path="/settings" element={<RouteBoundary name="route:/settings"><ProtectedRoute>
                        <Settings />
                      </ProtectedRoute></RouteBoundary>} />
                  <Route path="/onboard" element={<RouteBoundary name="route:/onboard"><ProtectedRoute>
                        <Onboard />
                      </ProtectedRoute></RouteBoundary>} />
                  <Route path="/report" element={<RouteBoundary name="route:/report"><ProtectedRoute>
                        <Report />
                      </ProtectedRoute></RouteBoundary>} />
                  <Route path="/output" element={<RouteBoundary name="route:/output"><ProtectedRoute>
                        <Output />
                      </ProtectedRoute></RouteBoundary>} />
                  {/* Common guessed URLs go to the app instead of a 404. */}
                  {['/dashboard', '/planner', '/demo'].map((path) => (
                    <Route key={path} path={path} element={<Navigate to="/app" replace />} />
                  ))}
                  <Route path="*" element={<RouteBoundary name="route:404"><NotFound /></RouteBoundary>} />
                </Routes>
              </Suspense>
          </CurrencyProvider>
          {/* REPAIR 3: Force-Mount outside of everything else */}
          {/* NetworkStatus moved to dashboard layout */}
        </TooltipProvider>
      </QueryClientProvider>
    </div>
  );

  if (!clerkEnabled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white px-6">
        <div className="max-w-xl text-center rounded-3xl border border-white/10 bg-slate-900/90 p-10 shadow-2xl">
          <h1 className="text-3xl font-bold mb-4">Site configuration is missing</h1>
          <p className="text-slate-300 mb-6 leading-7">
            Budget Genie requires Clerk configuration to run. Please add the environment variable{' '}
            <code className="bg-slate-800 px-2 py-1 rounded">VITE_CLERK_PUBLISHABLE_KEY</code> to
            your Vercel project and redeploy.
          </p>
          <p className="text-slate-400 text-sm">
            This error means the app is trying to use Clerk authentication before the provider is
            available.
          </p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <ClerkWithRouter>{appContent}</ClerkWithRouter>
    </BrowserRouter>
  );
};

const App = () => {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
};

export default App;
