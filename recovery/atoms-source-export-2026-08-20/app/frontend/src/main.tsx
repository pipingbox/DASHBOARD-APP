import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './i18n';

// Prerendered blog pages are served as pure static HTML for SEO.
// Skip React mounting so the crawler-facing markup stays lightweight.
if (
  document
    .querySelector('meta[name="prerender-static-page"]')
    ?.getAttribute('content') !== 'blog'
) {
  createRoot(document.getElementById('root')!).render(<App />);
}