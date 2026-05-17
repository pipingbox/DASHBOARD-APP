import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mwdauubztjxkbrefirbg.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13ZGF1dWJ6dGp4a2JyZWZpcmJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDY4NTAsImV4cCI6MjA5MzQ4Mjg1MH0.vtFpaUlevj5H65m1xUS84VHLq3B1YEXhX8G6BSP0wos';

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