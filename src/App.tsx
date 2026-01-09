
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
import { NetworkStatus } from "./components/NetworkStatus";
import { useStoreSync } from "./hooks/use-store-sync";

const queryClient = new QueryClient();

const App = () => {
  // Check for maintenance mode
  const isMaintenance = import.meta.env.VITE_MAINTENANCE_MODE === 'true';
  const isBypass = new URLSearchParams(window.location.search).get('dev') === 'bypass';

  useStoreSync();

  if (isMaintenance && !isBypass) {
    return <MaintenanceMode />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <CurrencyProvider>
            <NetworkStatus />
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </CurrencyProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;