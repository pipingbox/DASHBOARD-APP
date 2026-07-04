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
  certifications: 'app_14da0f1941_certifications',
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
} as const;

export const STORAGE_BUCKETS = {
  avatars: 'app_14da0f1941_avatars',
  certificates: 'app_14da0f1941_certificates',
  workerDocuments: 'app_14da0f1941_certificates',
} as const;