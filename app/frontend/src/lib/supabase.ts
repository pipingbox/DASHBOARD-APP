import { createClient } from '@supabase/supabase-js';

// TD-01 (DEC-36): Supabase credentials are read from environment variables,
// NOT hardcoded. The anon key is public by design (protected by RLS, DEC-07).
// See .env.example for required variables and brain/03-ENGINEERING/DEPLOYMENT.md.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing Supabase environment variables. Copy .env.example to .env.local and fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. (TD-01 / DEC-36)'
  );
}

// Helper to build Edge Function URLs without duplicating the project URL.
export const edgeFunctionUrl = (name: string) =>
  `${SUPABASE_URL}/functions/v1/${name}`;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Table name helpers — keeps module app table prefix consistent
export const TABLES = {
  profiles: 'app_14da0f1941_profiles',
  jobs: 'app_14da0f1941_jobs',
  jobApplications: 'app_14da0f1941_job_applications',
  toolUsage: 'app_14da0f1941_tool_usage',
  dailyLogs: 'app_14da0f1941_daily_logs',
  workDayLogs: 'app_14da0f1941_work_day_logs',
  ratePresets: 'app_14da0f1941_salary_rate_presets',
  communityChannels: 'app_14da0f1941_community_channels',
  communityPosts: 'app_14da0f1941_community_posts',
  communityComments: 'app_14da0f1941_community_comments',
  communityPostLikes: 'app_14da0f1941_community_post_likes',
  communitySavedPosts: 'app_14da0f1941_community_saved_posts',
  communityModerators: 'app_14da0f1941_community_moderators',
  certifications: 'app_worker_certifications', // TD-09: unified into worker_certifications
  certificationAlerts: 'app_14da0f1941_certification_alerts',
  jobAlerts: 'app_14da0f1941_job_alerts',
  notifications: 'app_14da0f1941_notifications',
  companyLeads: 'app_14da0f1941_company_leads',
  aiContentDrafts: 'app_14da0f1941_ai_content_drafts',
  auditLogs: 'app_14da0f1941_audit_logs',
  messages: 'app_14da0f1941_messages',
  conversations: 'app_14da0f1941_conversations',
  certAlertPrefs: 'app_14da0f1941_cert_alert_prefs',
  workerExperiences: 'app_worker_experiences',
  workerCertifications: 'app_worker_certifications',
  workerCertificationReminders: 'app_worker_certification_reminders',
  workerCertificationAlertPreferences: 'app_worker_certification_alert_preferences',
  workerDocuments: 'app_worker_documents',
  referrals: 'app_14da0f1941_referrals',
  savedFilters: 'app_14da0f1941_saved_filters',
  jobInvitations: 'app_14da0f1941_job_invitations',
  vcaExamCenters: 'app_vca_exam_centers', // DEPRECATED — use certificationExamCenters (DEC-51)
  vcaBookings: 'app_vca_bookings',        // DEPRECATED — use certificationBookings (DEC-51)
  // Generic certification platform (DEC-51, BRAIN-VCA-002)
  certificationModules: 'app_certification_modules',
  certificationLessons: 'app_certification_lessons',
  certificationExamCenters: 'app_certification_exam_centers',
  certificationBookings: 'app_certification_bookings',
  certificationProgress: 'app_certification_progress',
  academyCourses: 'app_academy_courses',
  academyLessons: 'app_academy_lessons',
  academyProgress: 'app_academy_progress',
  academyCertificates: 'app_academy_certificates',
  academyMockExams: 'app_14da0f1941_academy_mock_exams',
  academyExamAnswers: 'app_14da0f1941_academy_exam_answers',
  certificationAccessGrants: 'app_certification_access_grants',
  // Workforce request pipeline (PB-DRIFT-001 reconciliation)
  workforceRequests: 'app_14da0f1941_workforce_requests',
  workforceAssignments: 'app_14da0f1941_workforce_assignments',
  // Stripe / monetization (PB-STRIPE-001 Fase 2, DEC-30)
  // Client access is read-only; all writes happen in Edge Functions via service_role.
  stripePrices: 'app_stripe_prices',
  orders: 'app_orders',
  subscriptions: 'app_subscriptions',
  stripeEvents: 'app_stripe_events',
  invoices: 'app_invoices',
  // Course marketplace (PB-MARKET-SCHEMA-001, sql/004-marketplace-schema.sql)
  // NOTE: unrelated to profiles.marketplace_ready, which belongs to the JOB
  // marketplace (see lib/onboarding.ts). Different domain, different vocabulary.
  marketplaceInstructors: 'app_marketplace_instructors',
  marketplaceInstructorsPublic: 'app_marketplace_instructors_public',
  marketplaceCourseReviews: 'app_marketplace_course_reviews',
  marketplaceDsaNotices: 'app_marketplace_dsa_notices',
  // Revenue events (PB-MARKET-REVENUE-EVENTS-001, sql/005-revenue-events.sql)
  // APPEND-ONLY ledger of observed economic facts. Written only by the
  // stripe-webhook Edge Function as service_role; authenticated holds SELECT
  // and nothing else. Registered here so future call sites do not hardcode the
  // name — no frontend component queries it today, and the SQL is UNAPPLIED.
  // Instructor-facing code must use marketplaceRevenueEventsInstructor: the
  // base table carries the full Stripe object and buyer fields, i.e. student
  // personal data, which instructors must never receive.
  marketplaceRevenueEvents: 'app_marketplace_revenue_events',
  marketplaceRevenueEventsInstructor: 'app_marketplace_revenue_events_instructor',
  // PIDM Catalog (Phase C — PIDM-CATALOG-EXPANSION-001)
  pidmStandards: 'pidm_standards',
  pidmComponents: 'pidm_components',
  pidmDimensionSets: 'pidm_dimension_sets',
  pidmDimensions: 'pidm_dimensions',
  // Beta feedback (solo-produccion, Apendice B — PB-DRIFT-001)
  betaFeedbackReports: 'beta_feedback_reports',
} as const;

export const STORAGE_BUCKETS = {
  avatars: 'app_14da0f1941_avatars',
  certificates: 'app_14da0f1941_certificates',
  workerDocuments: 'app_14da0f1941_certificates',
} as const;