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

import { useStoreSync } from './hooks/use-store-sync';
import { useHistoryRecorder } from '@/hooks/use-history';
import { KeyboardManager } from '@/components/common/KeyboardManager';

const Index = lazy(() => import('./pages/Index'));
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
                  <Route path="/" element={<Index />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/onboard" element={<Onboard />} />
                  <Route path="/report" element={<Report />} />
                  <Route path="/output" element={<Output />} />
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

  if (clerkEnabled) {
    return <ClerkProvider publishableKey={clerkPubKey}>{appContent}</ClerkProvider>;
  }

  return appContent;
};

const App = () => {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
};

export default App;
