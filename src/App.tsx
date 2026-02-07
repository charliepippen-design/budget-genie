
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import Settings from "./pages/Settings";
import MaintenanceMode from "./pages/MaintenanceMode";
import { CloudStatus } from "./components/common/CloudStatus";
import { useStoreSync } from "./hooks/use-store-sync";
import { useHistoryRecorder } from "@/hooks/use-history";
import { KeyboardManager } from "@/components/common/KeyboardManager";
import UnderConstruction from "./pages/UnderConstruction";

const queryClient = new QueryClient();

const App = () => {
  // MAINTENANCE LOGIC: Domain Check
  const currentDomain = window.location.hostname;
  const isLocal = currentDomain === 'localhost' || currentDomain === '127.0.0.1';

  // Also keep env check as a fallback or explicit override if needed, but primary request is domain check.
  // User asked: "IF we are NOT local... STOP and show Maintenance Page."

  if (!isLocal) {
    return <UnderConstruction />;
  }

  useStoreSync();
  useHistoryRecorder();
  // ... rest of app

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <KeyboardManager />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <CurrencyProvider>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </CurrencyProvider>
        </BrowserRouter>
        {/* REPAIR 3: Force-Mount outside of everything else */}
        {/* NetworkStatus moved to dashboard layout */}
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;