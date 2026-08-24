import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthProvider } from '@/hooks/useAuth';
import { AdminPreviewProvider } from '@/contexts/AdminPreviewContext';
import { ProtectedRoute, GuestRoute } from '@/components/ProtectedRoute';
import { AppShell } from '@/components/layout/AppShell';
import { useReferralCapture } from '@/hooks/useReferralCapture';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { OnboardingGate } from '@/components/OnboardingGate';
import ErrorBoundary from '@/components/ErrorBoundary';
import { CompanyVerificationGate } from '@/components/company/CompanyVerificationGate';

import Index from './pages/Index';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import CompanyDashboard from './pages/CompanyDashboard';
import EnterpriseDashboard from './pages/EnterpriseDashboard';
import Academy from './pages/Academy';
import VCAExamBookingPage from './pages/VCAExamBookingPage';
import SCCCoursePage from './pages/SCCCoursePage';
import PRLCoursePage from './pages/PRLCoursePage';
import CourseDetail from './pages/academy/CourseDetail';
import LessonView from './pages/academy/LessonView';
import AcademyModule from './pages/AcademyModule';
import AcademyExam from './pages/AcademyExam';
import Tools from './pages/Tools';
import Jobs from './pages/Jobs';
import Community from './pages/Community';
import CommunityChannel from './pages/CommunityChannel';
import CommunityPost from './pages/CommunityPost';
import Companies from './pages/Companies';
import RequestWorkers from './pages/RequestWorkers';
import Profile from './pages/Profile';
import PublicWorkerProfile from './pages/PublicWorkerProfile';
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
  CompanyDocumentation,
  CompanyProfile,
  CompanyAnalytics,
  CompanySettings,
  CompanyBilling,
} from './pages/company';
import PricingPage from './pages/PricingPage';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';

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

// PB-WEB-005 (F1): routes reachable WITHOUT a session.
// DEC-54 requires app.pipingbox.com to expose public routes; the tools are also the
// acquisition funnel, so gating them behind login contradicts the roadmap.
//
// This only removes the route-level auth wall. Per-feature gating stays inside each page:
// /tools is public but personal/premium state needs an account, /academy exposes the catalog
// while progress, exams and certificates stay authenticated.
// AppShell is safe without a session — it reads `profile?.` defensively.
const withPublicShell = (node: React.ReactNode) => <AppShell>{node}</AppShell>;

// PD-COMPANY / PB-DRIFT-001: wraps company routes that grant privileges
// reserved to VERIFIED companies (posting jobs, searching workers, viewing
// candidates). Gated by CompanyVerificationGate — currently a pass-through
// while COMPANY_VERIFICATION_ENABLED=false (see component + brain docs).
const withShellRolesVerified = (node: React.ReactNode, allowedRoles: string[]) => (
  <ProtectedRoute allowedRoles={allowedRoles}>
    <AppShell>
      <CompanyVerificationGate>{node}</CompanyVerificationGate>
    </AppShell>
  </ProtectedRoute>
);

// PB-DRIFT-001: legacy /academy/:moduleId alias for route parity with
// production, which used this shorter path before the canonical candidate
// introduced /academy/module/:moduleId. Only redirects numeric moduleId
// (1-22) so it doesn't shadow named academy routes like /academy/vca-course
// — those are matched earlier by React Router since they are more specific.
const AcademyModuleLegacyRedirect = () => {
  const { moduleId } = useParams<{ moduleId: string }>();
  if (!moduleId || !/^([1-9]|1[0-9]|2[0-2])$/.test(moduleId)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Navigate to={`/academy/module/${moduleId}`} replace />;
};

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

    {/* UX-003: Public worker profile (SEO + shareable) */}
    <Route path="/worker/:id" element={<PublicWorkerProfile />} />

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
    <Route
      path="/forgot-password"
      element={
        <GuestRoute>
          <ForgotPassword />
        </GuestRoute>
      }
    />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/dashboard" element={withShell(<Dashboard />)} />
    <Route
      path="/company-dashboard"
      element={withShellRoles(<CompanyDashboard />, ['admin', 'company'])}
    />
    <Route
      path="/enterprise-dashboard"
      element={withShellRoles(<EnterpriseDashboard />, ['admin', 'company'])}
    />
    <Route
      path="/company/jobs"
      element={withShellRoles(<CompanyJobs />, ['admin', 'company'])}
    />
    <Route
      path="/company/post-job"
      element={withShellRolesVerified(<CompanyPostJob />, ['admin', 'company'])}
    />
    <Route
      path="/company/candidates"
      element={withShellRolesVerified(<CompanyCandidates />, ['admin', 'company'])}
    />
    <Route
      path="/candidate/:userId"
      element={withShellRolesVerified(<CandidateProfile />, ['admin', 'jobs_moderator', 'company'])}
    />
    <Route
      path="/company/workers-search"
      element={withShellRolesVerified(<CompanyWorkersSearch />, ['admin', 'company'])}
    />
    <Route
      path="/company/workforce-requests"
      element={withShellRoles(<CompanyWorkforceRequests />, ['admin', 'company'])}
    />
    <Route
      path="/company/documentation"
      element={withShellRoles(<CompanyDocumentation />, ['admin', 'company'])}
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
      path="/company/settings"
      element={withShellRoles(<CompanySettings />, ['admin', 'company'])}
    />
    <Route
      path="/company/billing"
      element={withShellRoles(<CompanyBilling />, ['admin', 'company'])}
    />
    <Route
      path="/academy"
      element={withPublicShell(<Academy />)}
    />
    <Route
      path="/academy/vca-course"
      element={<VCAExamBookingPage />}
    />
    <Route
      path="/academy/vca-booking"
      element={<VCAExamBookingPage />}
    />
    {/* Public certification landing pages (DEC-51, BRAIN-VCA-002) */}
    <Route
      path="/certifications"
      element={<VCAExamBookingPage />}
    />
    <Route
      path="/certifications/vca"
      element={<VCAExamBookingPage />}
    />
    {/* SCC (Germany / Austria) — Fase 3, DEC-51 */}
    <Route
      path="/certifications/scc"
      element={<SCCCoursePage />}
    />
    <Route
      path="/academy/scc-course"
      element={<SCCCoursePage />}
    />
    {/* PRL (Spain) — Fase 4, DEC-51 — training_based (no exam) */}
    <Route
      path="/certificaciones/prl"
      element={<PRLCoursePage />}
    />
    <Route
      path="/certifications/prl"
      element={<PRLCoursePage />}
    />
    <Route
      path="/academy/prl-course"
      element={<PRLCoursePage />}
    />
    <Route
      path="/academy/course/:slug"
      element={withShellRoles(<CourseDetail />, ['admin', 'worker', 'company'])}
    />
    <Route
      path="/academy/lesson/:lessonId"
      element={withShellRoles(<LessonView />, ['admin', 'worker', 'company'])}
    />
    {/* PD-VCA: VCA exam simulator (ported from production, 2026-08-22) */}
    <Route
      path="/academy/module/:moduleId"
      element={withShellRoles(<AcademyModule />, ['admin', 'worker', 'company'])}
    />
    <Route
      path="/academy/exam/:examType"
      element={withShellRoles(<AcademyExam />, ['admin', 'worker', 'company'])}
    />
    {/* PB-DRIFT-001: legacy alias, must stay after all specific /academy/* routes above
        so named paths (vca-course, scc-course, prl-course, course/:slug, lesson/:lessonId,
        module/:moduleId, exam/:examType) keep matching first. */}
    <Route
      path="/academy/:moduleId"
      element={<AcademyModuleLegacyRedirect />}
    />
    <Route
      path="/tools"
      element={withPublicShell(<Tools />)}
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
      element={withPublicShell(<RequestWorkers />)}
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
    <Route path="/privacy" element={<Privacy />} />
    <Route path="/terms" element={<Terms />} />
    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes>
  );
};

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AdminPreviewProvider>
          <TooltipProvider>
            <Toaster theme="dark" />
            <BrowserRouter>
              <ErrorBoundary>
                <AppRoutes />
              </ErrorBoundary>
            </BrowserRouter>
          </TooltipProvider>
        </AdminPreviewProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
export { AppRoutes };