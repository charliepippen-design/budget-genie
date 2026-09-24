/**
 * MockClerkProvider + mock hooks
 * Used when VITE_CLERK_PUBLISHABLE_KEY is absent or invalid.
 * Provides a no-op auth context so the app renders and all
 * useUser / useAuth call-sites still resolve without crashing.
 */
import React, { createContext, useContext, ReactNode } from 'react';

interface MockUser {
  id: string;
  publicMetadata: { tier: string };
  primaryEmailAddress: { emailAddress: string } | null;
}

interface MockAuth {
  isSignedIn: boolean;
  userId: string | null;
  getToken: () => Promise<null>;
  isLoaded: boolean;
}

interface MockUserHook {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: MockUser | null;
}

const GUEST_USER: MockUser = {
  id: 'guest',
  publicMetadata: { tier: 'FREE' },
  primaryEmailAddress: null,
};

const MockAuthCtx = createContext<MockAuth>({
  isSignedIn: false,
  userId: null,
  getToken: async () => null,
  isLoaded: true,
});

const MockUserCtx = createContext<MockUserHook>({
  isLoaded: true,
  isSignedIn: false,
  user: GUEST_USER,
});

export function MockClerkProvider({ children }: { children: ReactNode }) {
  const auth: MockAuth = {
    isSignedIn: false,
    userId: null,
    getToken: async () => null,
    isLoaded: true,
  };
  const userHook: MockUserHook = {
    isLoaded: true,
    isSignedIn: false,
    user: GUEST_USER,
  };
  return (
    <MockAuthCtx.Provider value={auth}>
      <MockUserCtx.Provider value={userHook}>
        {children}
      </MockUserCtx.Provider>
    </MockAuthCtx.Provider>
  );
}

// These replace the real @clerk/clerk-react hooks when in mock mode
export const useMockAuth = () => useContext(MockAuthCtx);
export const useMockUser = () => useContext(MockUserCtx);
