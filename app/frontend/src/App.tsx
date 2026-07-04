import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthProvider } from '@/hooks/useAuth';
import { AdminPreviewProvider } from '@/contexts/AdminPreviewContext';
import { ProtectedRoute, GuestRoute } from '@/components/ProtectedRoute';
import { AppShell } from '@/components/layout/AppShell';
import { useReferralCapture } from '@/hooks/useReferralCapture';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { OnboardingGate } from '@/components/OnboardingGate';

import Index from './pages/Index';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import CompanyDashboard from './pages/CompanyDashboard';
import Academy from './pages/Academy';
import Tools from './pages/Tools';
import ToolsPage from './pages/ToolsPage';
import Jobs from './pages/Jobs';
import Community from './pages/Community';
import CommunityChannel from './pages/CommunityChannel';
import CommunityPost from './pages/CommunityPost';
import Companies from './pages/Companies';
import RequestWorkers from './pages/RequestWorkers';
import Profile from './pages/Profile';
import Admin from './pages/Admin';
import Applications from './pages/Applications';
import Messages from './pages/Messages';
import ContentDrafts from './pages/ContentDrafts';
import {
  CompanyJobs,
  CompanyPostJob,
  CompanyCandidates,
  CandidateProfile,
  CompanyWorkersSearch,
  CompanyWorkforceRequests,
  CompanyProfile,
  CompanyAnalytics,
} from './pages/company';
import PricingPage from './pages/PricingPage';

// BUG-002: Blog connected to router. Lazy-loaded for better bundle splitting.
// Public routes (no auth) for SEO. Prerendered at build time via vite-prerender.
const BlogIndexPage = lazy(() => import('./pages/blog/BlogIndexPage'));
const BlogPostPage = lazy(() => import('./pages/blog/BlogPostPage'));

const queryClient = new QueryClient();

const withShell = (node: React.ReactNode) => (
  <ProtectedRoute>
    <OnboardingGate>
      <AppShell>{node}</AppShell>
    </OnboardingGate>
  </ProtectedRoute>
);

const withShellRoles = (node: React.ReactNode, allowedRoles: string[]) => (
  <ProtectedRoute allowedRoles={allowedRoles}>
    <AppShell>{node}</AppShell>
  </ProtectedRoute>
);

const AppRoutes = () => {
  // Capture referral codes from any page URL globally
  useReferralCapture();
  // Set dynamic page titles for browser tab
  useDocumentTitle();

  return (
  <Routes>
    <Route path="/" element={<Index />} />

    {/* BUG-002: Blog — public routes for SEO, lazy-loaded, prerendered */}
    <Route
      path="/blog"
      element={
        <Suspense fallback={<div className="min-h-screen bg-[#0a0a0a]" />}>
          <BlogIndexPage />
        </Suspense>
      }
    />
    <Route
      path="/blog/:slug"
      element={
        <Suspense fallback={<div className="min-h-screen bg-[#0a0a0a]" />}>
          <BlogPostPage />
        </Suspense>
      }
    />

    {/* ENT-002: Pricing page (public) */}
    <Route path="/pricing" element={<PricingPage />} />

    <Route
      path="/login"
      element={
        <GuestRoute>
          <Login />
        </GuestRoute>
      }
    />
    <Route
      path="/register"
      element={
        <GuestRoute>
          <Register />
        </GuestRoute>
      }
    />
    <Route path="/dashboard" element={withShell(<Dashboard />)} />
    <Route
      path="/company-dashboard"
      element={withShellRoles(<CompanyDashboard />, ['admin', 'company'])}
    />
    <Route
      path="/company/jobs"
      element={withShellRoles(<CompanyJobs />, ['admin', 'company'])}
    />
    <Route
      path="/company/post-job"
      element={withShellRoles(<CompanyPostJob />, ['admin', 'company'])}
    />
    <Route
      path="/company/candidates"
      element={withShellRoles(<CompanyCandidates />, ['admin', 'company'])}
    />
    <Route
      path="/candidate/:userId"
      element={withShellRoles(<CandidateProfile />, ['admin', 'jobs_moderator', 'company'])}
    />
    <Route
      path="/company/workers-search"
      element={withShellRoles(<CompanyWorkersSearch />, ['admin', 'company'])}
    />
    <Route
      path="/company/workforce-requests"
      element={withShellRoles(<CompanyWorkforceRequests />, ['admin', 'company'])}
    />
    <Route
      path="/company/profile"
      element={withShellRoles(<CompanyProfile />, ['admin', 'company'])}
    />
    <Route
      path="/company/analytics"
      element={withShellRoles(<CompanyAnalytics />, ['admin', 'company'])}
    />
    <Route
      path="/academy"
      element={withShellRoles(<Academy />, ['admin', 'worker'])}
    />
    <Route
      path="/tools"
      element={<ToolsPage />}
    />
    <Route
      path="/jobs"
      element={withShellRoles(<Jobs />, ['admin', 'jobs_moderator', 'worker', 'company'])}
    />
    <Route
      path="/community"
      element={withShellRoles(<Community />, ['admin', 'community_moderator', 'worker'])}
    />
    <Route
      path="/community/:channelSlug"
      element={withShellRoles(<CommunityChannel />, ['admin', 'community_moderator', 'worker'])}
    />
    <Route
      path="/community/:channelSlug/post/:postId"
      element={withShellRoles(<CommunityPost />, ['admin', 'community_moderator', 'worker'])}
    />
    <Route
      path="/companies"
      element={withShellRoles(<Companies />, ['admin', 'jobs_moderator', 'company'])}
    />
    <Route
      path="/companies/request-workers"
      element={withShellRoles(<RequestWorkers />, ['admin', 'jobs_moderator', 'company'])}
    />
    <Route path="/profile" element={withShell(<Profile />)} />
    <Route
      path="/applications"
      element={withShellRoles(<Applications />, ['admin', 'worker'])}
    />
    <Route
      path="/messages"
      element={withShellRoles(<Messages />, ['admin', 'worker', 'company', 'jobs_moderator'])}
    />
    <Route
      path="/content-drafts"
      element={withShellRoles(<ContentDrafts />, ['admin', 'community_moderator'])}
    />
    <Route
      path="/admin"
      element={
        <ProtectedRoute adminOnly>
          <AppShell>
            <Admin />
          </AppShell>
        </ProtectedRoute>
      }
    />
    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <AdminPreviewProvider>
        <TooltipProvider>
          <Toaster theme="dark" />
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </TooltipProvider>
      </AdminPreviewProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
export { AppRoutes };