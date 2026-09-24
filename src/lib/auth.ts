/**
 * Safe auth hooks — work with real Clerk OR the MockClerkProvider.
 * Always import from here instead of @clerk/clerk-react directly,
 * to avoid "useUser must be used within a ClerkProvider" crashes.
 */
import { useAuth as clerkUseAuth, useUser as clerkUseUser } from '@clerk/clerk-react';
import { useMockAuth, useMockUser } from './mock-clerk';

const KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? '';
export const CLERK_ENABLED = KEY.startsWith('pk_test_') || KEY.startsWith('pk_live_');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const useAuth: () => any = CLERK_ENABLED ? clerkUseAuth : useMockAuth;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const useUser: () => any = CLERK_ENABLED ? clerkUseUser : useMockUser;
