/* eslint-disable react-refresh/only-export-components -- module stand-in, not a refreshable component file */
// Local QA only: stands in for @clerk/clerk-react when the dev server runs with MOCK_CLERK=1.
// Simulates a signed-in superuser so protected routes can be exercised without a Clerk instance.
// Never bundled in production builds (the alias is only set for `vite serve`).
import type { ReactNode } from 'react';

const user = {
  id: 'qa_superuser',
  firstName: 'QA',
  fullName: 'QA Superuser',
  primaryEmailAddress: { emailAddress: 'qa@example.com' },
  emailAddresses: [{ emailAddress: 'qa@example.com' }],
  publicMetadata: { is_superuser: true, payment_status: true, subscription_tier: 'enterprise' },
  reload: async () => undefined,
};

export const ClerkProvider = ({ children }: { children: ReactNode; publishableKey?: string }) => <>{children}</>;

export const useAuth = () => ({
  isLoaded: true,
  isSignedIn: true,
  userId: user.id,
  getToken: async () => null,
  signOut: async () => undefined,
});

export const useUser = () => ({ isLoaded: true, isSignedIn: true, user });

export const useClerk = () => ({ signOut: async () => undefined, openSignIn: () => undefined });

export const SignIn = () => <div data-qa="mock-sign-in">Mock sign-in (QA mode)</div>;
export const SignUp = SignIn;
export const SignedIn = ({ children }: { children: ReactNode }) => <>{children}</>;
export const SignedOut = () => null;
export const UserButton = () => <div data-qa="mock-user-button">QA</div>;
