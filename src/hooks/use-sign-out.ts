import { useClerk } from '@clerk/clerk-react';

/** Signs out through Clerk and lands on the public home page. */
export function useSignOut() {
  const { signOut } = useClerk();
  return () => signOut({ redirectUrl: '/' });
}
