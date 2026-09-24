import { createRoot } from "react-dom/client";
import { ClerkProvider } from '@clerk/clerk-react';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { MockClerkProvider } from './lib/mock-clerk';
import App from "./App.tsx";
import "./index.css";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? '';

// A real Clerk key always starts with pk_test_ or pk_live_
const CLERK_ENABLED =
  PUBLISHABLE_KEY.startsWith('pk_test_') ||
  PUBLISHABLE_KEY.startsWith('pk_live_');

const AuthProvider = CLERK_ENABLED
  ? ({ children }: { children: React.ReactNode }) => (
      <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
        {children}
      </ClerkProvider>
    )
  : MockClerkProvider;

import React from 'react';

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <AuthProvider>
      <App />
    </AuthProvider>
  </ErrorBoundary>
);
