import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './i18n';
import { loadRuntimeConfig } from './lib/config.ts';

// TD-13 (CODE_STANDARDS §13 #4): Silence verbose console methods in production.
// In production builds, console.log/debug/info become no-ops to prevent
// bundle bloat and PII leakage (DEC-35). console.warn/error are kept
// because they are critical for diagnosing issues. New code should use
// the logger module (src/lib/logger.ts) for structured, dev-only logging.
if (import.meta.env.PROD) {
  console.log = () => {};
  console.debug = () => {};
  console.info = () => {};
}

// PB-MOBILE-OFFLINE-TOOLS-001: register service worker for offline Tools.
// Only in production and only when the runtime supports it.
function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
    return;
  }

  navigator.serviceWorker
    .register('/sw.js')
    .then(() => {
      // Intentionally silent in production (console.info is no-op in PROD).
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.warn('Service Worker registration failed:', error);
    });

  // Prompt reload when a new service worker takes control.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (window.location.pathname.startsWith('/tools')) {
      window.location.reload();
    }
  });
}

// Load runtime configuration before rendering the app
async function initializeApp() {
  // Prerendered blog pages are served as pure static HTML for SEO.
  // Intentionally skip React mounting so the crawler-facing markup stays
  // lightweight and self-contained — no client-side hydration needed.
  if (
    document
      .querySelector('meta[name="prerender-static-page"]')
      ?.getAttribute('content') === 'blog'
  ) {
    return;
  }

  try {
    await loadRuntimeConfig();
    console.log('Runtime configuration loaded successfully');
  } catch (error) {
    console.warn(
      'Failed to load runtime configuration, using defaults:',
      error
    );
  }

  registerServiceWorker();

  // Render the app
  createRoot(document.getElementById('root')!).render(<App />);
}

// Initialize the app
initializeApp();
