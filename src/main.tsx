import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/common/ErrorBoundary.tsx';
import { reloadOncePerKey } from './lib/lazy-with-reload.ts';
import './index.css';

// A lazy chunk of an old deploy no longer exists: reload once to pick up the current build.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  reloadOncePerKey('vite-preload');
});

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

// A previous release cached scripts in a service worker, which could serve stale code after a
// deploy. No worker is registered any more; remove any that are still installed.
window.addEventListener('load', async () => {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if ('caches' in window) {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((key) => caches.delete(key)));
    }
  } catch (error) {
    console.warn('Service worker cleanup failed', error);
  }
});
