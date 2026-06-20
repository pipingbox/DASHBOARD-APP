import { lazy, Suspense } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/hooks/useAuth';
import { AdminPreviewProvider } from '@/contexts/AdminPreviewContext';
import { ProtectedRoute, GuestRoute } from '@/components/ProtectedRoute';
import { AppShell } from '@/components/layout/AppShell';
import { useReferralCapture } from '@/hooks/useReferralCapture';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { OnboardingGate } from '@/components/OnboardingGate';

// Eagerly loaded — critical auth path
import Index from './pages/Index';
import Login from './pages/Login';
import Register from './pages/Register';
import AuthCallback from './pages/AuthCallback';
import AuthErrorPage from './pages/AuthError';
import ForgotPassword from './pages/ForgotPassword';

// Lazy loaded — post-auth and secondary pages
const PublicRequestWorkers = lazy(() => import('./pages/PublicRequestWorkers'));
const NotFound = lazy(() => import('./pages/NotFound'));
const TermsOfService = lazy(() => import('./pages/legal/TermsOfService'));
const PrivacyPolicy = lazy(() => import('./pages/legal/PrivacyPolicy'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const CompanyDashboard = lazy(() => import('./pages/CompanyDashboard'));
const Academy = lazy(() => import('./pages/Academy'));
const Tools = lazy(() => import('./pages/Tools'));
const Jobs = lazy(() => import('./pages/Jobs'));
const Community = lazy(() => import('./pages/Community'));
const CommunityChannel = lazy(() => import('./pages/CommunityChannel'));
const CommunityPost = lazy(() => import('./pages/CommunityPost'));
const Companies = lazy(() => import('./pages/Companies'));
const RequestWorkers = lazy(() => import('./pages/RequestWorkers'));
const Profile = lazy(() => import('./pages/Profile'));
const Admin = lazy(() => import('./pages/Admin'));
const Applications = lazy(() => import('./pages/Applications'));
const Messages = lazy(() => import('./pages/Messages'));
const ContentDrafts = lazy(() => import('./pages/ContentDrafts'));

// Company sub-pages
const CompanyJobs = lazy(() => import('./pages/company/CompanyJobs'));
const CompanyPostJob = lazy(() => import('./pages/company/CompanyPostJob'));
const CompanyCandidates = lazy(() => import('./pages/company/CompanyCandidates'));
const CandidateProfile = lazy(() => import('./pages/company/CandidateProfile'));
const CompanyWorkersSearch = lazy(() => import('./pages/company/CompanyWorkersSearch'));
const CompanyWorkforceRequests = lazy(() => import('./pages/company/CompanyWorkforceRequests'));
const CompanyProfile = lazy(() => import('./pages/company/CompanyProfile'));
const CompanyAnalytics = lazy(() => import('./pages/company/CompanyAnalytics'));

const queryClient = new QueryClient();

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
    <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#f59e0b] border-t-transparent" />
  </div>
);

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
  <Suspense fallback={<PageLoader />}>
  <Routes>
    <Route path="/" element={<Index />} />
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
    <Route path="/auth/callback" element={<AuthCallback />} />
    <Route path="/auth/error" element={<AuthErrorPage />} />
    <Route
      path="/forgot-password"
      element={
        <GuestRoute>
          <ForgotPassword />
        </GuestRoute>
      }
    />
    <Route path="/request-workers" element={<PublicRequestWorkers />} />
    <Route path="/terms" element={<TermsOfService />} />
    <Route path="/privacy" element={<PrivacyPolicy />} />
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
      element={withShellRoles(<Tools />, ['admin', 'worker'])}
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
    <Route path="*" element={<NotFound />} />
  </Routes>
  </Suspense>
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
