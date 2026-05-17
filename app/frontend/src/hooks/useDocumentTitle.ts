import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const BASE_TITLE = 'PipingBox';
const APP_TITLE = 'PipingBox';

const PAGE_TITLES: Record<string, string> = {
  '/': `${BASE_TITLE} - Industrial Workforce Platform`,
  '/login': `${BASE_TITLE} - Sign In`,
  '/register': `${BASE_TITLE} - Create Account`,
  '/dashboard': `${APP_TITLE} - Dashboard`,
  '/profile': `${APP_TITLE} - Profile`,
  '/jobs': `${APP_TITLE} - Jobs`,
  '/messages': `${APP_TITLE} - Messages`,
  '/community': `${APP_TITLE} - Community`,
  '/admin': `${APP_TITLE} - Admin`,
  '/applications': `${APP_TITLE} - Applications`,
  '/company-dashboard': `${APP_TITLE} - Company Dashboard`,
  '/academy': `${APP_TITLE} - Academy`,
  '/tools': `${APP_TITLE} - Tools`,
  '/companies': `${APP_TITLE} - Companies`,
};

export function useDocumentTitle() {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;

    // Check exact match first
    if (PAGE_TITLES[path]) {
      document.title = PAGE_TITLES[path];
      return;
    }

    // Check prefix matches for nested routes
    const matchedKey = Object.keys(PAGE_TITLES)
      .filter((key) => key !== '/' && path.startsWith(key))
      .sort((a, b) => b.length - a.length)[0];

    if (matchedKey) {
      document.title = PAGE_TITLES[matchedKey];
    } else if (path.startsWith('/company')) {
      document.title = `${APP_TITLE} - Company`;
    } else if (path.startsWith('/blog')) {
      document.title = `${BASE_TITLE} - Blog`;
    } else {
      document.title = APP_TITLE;
    }
  }, [location.pathname]);
}