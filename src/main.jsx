import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import QueryProvider from './providers/QueryProvider';
import { ToastProvider } from './context/ToastContext';

// Restore original deep link if GH Pages served 404.html and redirected
try {
  const saved = sessionStorage.getItem('__gh_redirect__');
  if (saved) {
    sessionStorage.removeItem('__gh_redirect__');
    const base = import.meta.env.BASE_URL || '/';
    const prefix = base.endsWith('/') ? base.slice(0, -1) : base;
    const target = saved.startsWith(prefix) ? saved : prefix + saved;
    if (location.pathname !== target) {
      history.replaceState(null, '', target);
    }
  }
} catch {
  // ignore
}

const basename = import.meta.env.BASE_URL || '/';
ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter basename={basename}>
    <QueryProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </QueryProvider>
  </BrowserRouter>
);

// Service Worker registration
// - Production only (import.meta.env.PROD)
// - Development: unregister any existing SW to avoid stale cache issues
if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    // PRODUCTION: register the Service Worker
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}sw.js`)
        .then((reg) => {
          console.info('[SW] registered:', reg.scope);
        })
        .catch((err) => {
          console.warn('[SW] registration failed:', err);
        });
    });
  } else {
    // DEVELOPMENT: unregister all existing service workers
    // This prevents stale dev caches from interfering with development.
    const DEV_SW_CLEANUP_KEY = 'royal_sw_dev_cleanup_v2';
    if (!sessionStorage.getItem(DEV_SW_CLEANUP_KEY)) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => {
          if (regs.length === 0) return;
          console.info(`[SW] dev mode: unregistering ${regs.length} service worker(s)`);
          return Promise.all(regs.map((r) => r.unregister()));
        })
        .catch(() => {});
      // Also clear all caches in dev
      if ('caches' in window) {
        caches
          .keys()
          .then((keys) => {
            if (keys.length === 0) return;
            console.info(`[SW] dev mode: clearing ${keys.length} cache(s)`);
            return Promise.all(keys.map((k) => caches.delete(k)));
          })
          .catch(() => {});
      }
      sessionStorage.setItem(DEV_SW_CLEANUP_KEY, '1');
    }
  }
}