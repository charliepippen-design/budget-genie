import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { CurrencyProvider } from '@/contexts/CurrencyContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { ClerkProvider } from '@clerk/clerk-react';
import { RouteLoadingSkeleton } from '@/components/common/AppSkeletons';
import { useTheme } from '@/hooks/use-theme';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';

import { useStoreSync } from './hooks/use-store-sync';
import { useHistoryRecorder } from '@/hooks/use-history';
import { KeyboardManager } from '@/components/common/KeyboardManager';

const Landing = lazy(() => import('./pages/Landing'));
const Index = lazy(() => import('./pages/Index'));
const Pricing = lazy(() => import('./pages/Pricing'));
const NotFound = lazy(() => import('./pages/NotFound'));
const Auth = lazy(() => import('./pages/Auth'));
const Settings = lazy(() => import('./pages/Settings'));
const Onboard = lazy(() => import('./pages/Onboard'));
const Report = lazy(() => import('./pages/Report'));
const Output = lazy(() => import('./pages/Output'));

const queryClient = new QueryClient();

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkEnabled = !!clerkPubKey;

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
          <BrowserRouter>
            <CurrencyProvider>
              <Suspense fallback={<RouteLoadingSkeleton />}>
                <Routes>
                  <Route path="/" element={<Landing />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/pricing" element={<Pricing />} />
                  <Route
                    path="/app"
                    element={
                      <ProtectedRoute>
                        <Index />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/settings"
                    element={
                      <ProtectedRoute>
                        <Settings />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/onboard"
                    element={
                      <ProtectedRoute>
                        <Onboard />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/report"
                    element={
                      <ProtectedRoute>
                        <Report />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/output"
                    element={
                      <ProtectedRoute>
                        <Output />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </CurrencyProvider>
          </BrowserRouter>
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

  return <ClerkProvider publishableKey={clerkPubKey}>{appContent}</ClerkProvider>;
};

const App = () => {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
};

export default App;
