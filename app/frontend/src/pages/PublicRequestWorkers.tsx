import { Link } from 'react-router-dom';
import RequestWorkers from './RequestWorkers';

/**
 * Public wrapper for RequestWorkers.
 * Adds a minimal branded header and footer so the page works
 * as a standalone lead-generation funnel without authentication.
 */
export default function PublicRequestWorkers() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 flex flex-col">
      {/* Minimal header */}
      <header className="border-b border-zinc-800/60 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link to="/">
            <img
              src="/assets/logos/logo-horizontal.png"
              alt="PipingBox"
              className="w-[160px] h-auto"
            />
          </Link>
          <div className="flex items-center gap-4">
            <Link
              to="/login"
              className="text-sm text-zinc-400 hover:text-zinc-200 transition"
            >
              Sign in
            </Link>
            <Link
              to="/register?type=company"
              className="text-sm bg-[#f59e0b] text-black px-4 py-2 rounded-md font-semibold hover:bg-[#d97706] transition"
            >
              Register
            </Link>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 px-6 py-10">
        <RequestWorkers isPublic />
      </main>

      {/* Minimal footer */}
      <footer className="border-t border-zinc-800/60 px-6 py-8">
        <div className="max-w-4xl mx-auto text-center space-y-3">
          <p className="text-xs text-zinc-600">
            PipingBox — The industrial platform for piping professionals
          </p>
          <div className="flex items-center justify-center gap-4 text-xs text-zinc-600">
            <Link to="/login" className="hover:text-zinc-400 transition">
              Sign in
            </Link>
            <span>·</span>
            <Link to="/register" className="hover:text-zinc-400 transition">
              Create account
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
