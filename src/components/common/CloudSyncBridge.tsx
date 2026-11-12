import { useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useLocation } from 'react-router-dom';
import { setCloudSyncUser } from '@/hooks/use-cloud-sync';

/**
 * Mounted once in the app shell: tells the project sync who is signed in, which starts a sync on
 * sign-in. Shared plan pages (/p/...) are read-only for the visitor, so nothing syncs there.
 */
export function CloudSyncBridge() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const onSharedPlan = useLocation().pathname.startsWith('/p/');
  useEffect(() => {
    if (!isLoaded) return;
    setCloudSyncUser(isSignedIn && userId && !onSharedPlan ? userId : null);
  }, [isLoaded, isSignedIn, userId, onSharedPlan]);
  return null;
}
