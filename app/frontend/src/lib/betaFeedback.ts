import { supabase, TABLES } from '@/lib/supabase';
import i18n, { toSupportedCode } from '@/i18n';

export interface BetaFeedbackReport {
  category: FeedbackCategory;
  description?: string;
  visible_text?: string;
  suggested_text?: string;
  screenshot_url?: string;
}

export const BETA_SUPPORT_EMAIL = 'support@pipingbox.com';

export const FEEDBACK_CATEGORIES = [
  'translation',
  'ai_error',
  'export',
  'login_account',
  'interface',
  'performance',
  'other',
] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

const OPEN_FEEDBACK_EVENT = 'pipingbox:open-beta-feedback';

/**
 * Opens the beta feedback modal from anywhere in the tree (the modal lives in
 * `BetaFeedbackProvider` at the bottom of the shell, while triggers such as the
 * translation banner render above it).
 */
export function openBetaFeedback(category: FeedbackCategory) {
  window.dispatchEvent(new CustomEvent<FeedbackCategory>(OPEN_FEEDBACK_EVENT, { detail: category }));
}

export function onOpenBetaFeedback(handler: (category: FeedbackCategory) => void) {
  const listener = (event: Event) => handler((event as CustomEvent<FeedbackCategory>).detail);
  window.addEventListener(OPEN_FEEDBACK_EVENT, listener);
  return () => window.removeEventListener(OPEN_FEEDBACK_EVENT, listener);
}

const BETA_DISMISSED_KEY = 'pipingbox_beta_dismissed';
const SCREENSHOT_BUCKET = 'feedback-screenshots';
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_FILE_SIZE = 5 * 1024 * 1024;

export function isBetaDismissed(): boolean {
  return localStorage.getItem(BETA_DISMISSED_KEY) === 'true';
}

export function dismissBeta(): void {
  localStorage.setItem(BETA_DISMISSED_KEY, 'true');
}

export async function uploadScreenshot(file: File): Promise<string | null> {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type) || file.size > MAX_FILE_SIZE || file.size === 0) return null;
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;
  const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp';
  const path = `feedback/${user.id}/${crypto.randomUUID()}.${extension}`;
  const { data, error } = await supabase.storage.from(SCREENSHOT_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  return error ? null : data.path;
}

export async function submitFeedbackReport(report: BetaFeedbackReport): Promise<{ success: boolean; error?: string }> {
  const locale = toSupportedCode(i18n.language) ?? 'en';
  const route = window.location.pathname;
  const { data, error } = await supabase.functions.invoke('submit-beta-feedback', {
    body: {
      category: report.category,
      locale,
      route,
      visible_text: report.visible_text || '',
      suggested_text: report.suggested_text || '',
      description: report.description || '',
      screenshot_url: report.screenshot_url || '',
      build_sha: import.meta.env.VITE_APP_VERSION || '',
    },
  });
  if (error || !data?.created || typeof data.id !== 'string') {
    let message = typeof data?.error === 'string' ? data.error : undefined;
    if (!message && error && 'context' in error && error.context instanceof Response) {
      try {
        const response = await error.context.clone().json();
        if (typeof response?.error === 'string') message = response.error;
      } catch {
        message = undefined;
      }
    }
    return { success: false, error: message };
  }
  return { success: true };
}

/**
 * Fetch feedback reports (admin only).
 */
export async function fetchFeedbackReports(statusFilter?: string): Promise<{ success: boolean; data?: any[]; error?: string }> {
  try {
    let query = supabase
      .from(TABLES.betaFeedbackReports)
      .select('*')
      .order('created_at', { ascending: false });

    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[BETA_FEEDBACK] Fetch error:', error.message, error.code);
      if (error.code === '42501' || error.message?.includes('policy')) {
        return { success: false, error: 'Se requiere acceso de administrador.', data: [] };
      }
      return { success: false, error: error.message, data: [] };
    }

    return { success: true, data: data || [] };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, error: errorMsg, data: [] };
  }
}

/**
 * Update a feedback report field (admin only).
 * When status changes to 'resolved', creates a notification for the report author.
 */
export async function updateFeedbackReport(id: string, field: 'status' | 'priority', value: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from(TABLES.betaFeedbackReports)
      .update({ [field]: value })
      .eq('id', id);

    if (error) {
      console.error('[BETA_FEEDBACK] Update error:', error.message);
      return { success: false, error: error.message };
    }

    // If status changed to 'resolved', notify the report author
    if (field === 'status' && value === 'resolved') {
      try {
        // Fetch the report to get the user_id
        const { data: report } = await supabase
          .from(TABLES.betaFeedbackReports)
          .select('user_id')
          .eq('id', id)
          .single();

        if (report?.user_id) {
          // Get admin name for actor_name
          const { data: { user: adminUser } } = await supabase.auth.getUser();
          let adminName = 'Admin';
          if (adminUser) {
            const { data: adminProfile } = await supabase
              .from(TABLES.profiles)
              .select('full_name')
              .eq('user_id', adminUser.id)
              .single();
            if (adminProfile?.full_name) {
              adminName = adminProfile.full_name;
            }
          }

          // Import dynamically to avoid circular deps
          const { notifyFeedbackResolved } = await import('@/lib/notifications');
          await notifyFeedbackResolved(report.user_id, id, adminName);
          console.log('[BETA_FEEDBACK] ✅ Notification sent to user:', report.user_id);
        }
      } catch (notifErr) {
        // Don't fail the status update if notification fails
        console.error('[BETA_FEEDBACK] Notification error (non-blocking):', notifErr);
      }
    }

    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, error: errorMsg };
  }
}

/**
 * Get a signed URL for a screenshot (admin only, private bucket).
 */
export async function getScreenshotSignedUrl(path: string): Promise<string | null> {
  try {
    if (!path) return null;
    if (path.startsWith('http')) return path;

    const { data, error } = await supabase.storage
      .from(SCREENSHOT_BUCKET)
      .createSignedUrl(path, 3600);

    if (error) {
      console.error('[BETA_FEEDBACK] Signed URL error:', error.message);
      return null;
    }

    return data.signedUrl;
  } catch (err) {
    console.error('[BETA_FEEDBACK] Signed URL exception:', err);
    return null;
  }
}
