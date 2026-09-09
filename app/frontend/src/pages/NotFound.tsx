import { Link } from 'react-router-dom';
import { PipingBoxLogo } from '@/components/PipingBoxLogo';
import { Home, Wrench, Briefcase, SearchX } from 'lucide-react';
import { useSeo } from '@/hooks/useSeo';

/**
 * Public 404 page.
 *
 * PB-SEO-102: replaces the legacy <Navigate to="/dashboard" replace /> catch-all
 * with a real NotFound view. The HTTP 404 status is the Worker's responsibility;
 * this component only renders the UI for that response (and for client-side
 * navigations that land on the * route).
 */
export default function NotFound() {
  useSeo({
    title: 'Page Not Found — PipingBox',
    description:
      'We could not find the page you were looking for. Explore PipingBox tools, jobs and courses, or return home.',
    noindex: true,
  });

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0d0d0d] px-4 py-12 text-zinc-300">
      <div className="flex w-full max-w-lg flex-col items-center text-center">
        <PipingBoxLogo variant="header" className="mb-8" />
        <SearchX className="mb-4 h-16 w-16 text-[#f59e0b]" aria-hidden="true" />
        <h1 className="mb-2 text-4xl font-bold text-white sm:text-5xl">404</h1>
        <p className="mb-8 text-lg text-zinc-400">
          We could not find that page. It may have been moved or removed.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-lg bg-[#f59e0b] px-5 py-2.5 font-semibold text-black hover:bg-amber-400"
          >
            <Home className="h-4 w-4" />
            Home
          </Link>
          <Link
            to="/tools"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-5 py-2.5 font-semibold text-white hover:border-zinc-500"
          >
            <Wrench className="h-4 w-4" />
            Tools
          </Link>
          <Link
            to="/jobs"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-5 py-2.5 font-semibold text-white hover:border-zinc-500"
          >
            <Briefcase className="h-4 w-4" />
            Jobs
          </Link>
        </div>
      </div>
    </div>
  );
}
