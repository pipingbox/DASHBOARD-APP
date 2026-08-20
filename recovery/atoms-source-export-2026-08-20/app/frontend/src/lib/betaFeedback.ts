import { supabase, TABLES } from '@/lib/supabase';

export interface BetaFeedbackReport {
  user_id?: string;
  user_email?: string;
  category: string;
  description: string;
  screenshot_url?: string;
  page_url: string;
  user_agent: string;
  screen_size: string;
}

export const FEEDBACK_CATEGORIES = [
  'ai_error',
  'export',
  'login_account',
  'interface',
  'performance',
  'other',
] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

const BETA_DISMISSED_KEY = 'pipingbox_beta_dismissed';
const SCREENSHOT_BUCKET = 'feedback-screenshots';
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export function isBetaDismissed(): boolean {
  return localStorage.getItem(BETA_DISMISSED_KEY) === 'true';
}

export function dismissBeta(): void {
  localStorage.setItem(BETA_DISMISSED_KEY, 'true');
}

export function collectTechnicalData(): Pick<BetaFeedbackReport, 'page_url' | 'user_agent' | 'screen_size'> {
  return {
    page_url: window.location.href,
    user_agent: navigator.userAgent,
    screen_size: `${window.innerWidth}x${window.innerHeight}`,
  };
}

/**
 * Get the current authenticated user using supabase.auth.getUser().
 * This makes a server call to validate the token and returns the real auth.uid().
 */
async function getAuthUser(): Promise<{ id: string; email?: string } | null> {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) {
      console.error('[BETA_FEEDBACK] auth.getUser() error:', error.message);
      return null;
    }
    if (!user) {
      console.error('[BETA_FEEDBACK] auth.getUser() returned null user');
      return null;
    }
    console.log('[BETA_FEEDBACK] auth.getUser() OK:', { id: user.id, email: user.email });
    return { id: user.id, email: user.email || undefined };
  } catch (err) {
    console.error('[BETA_FEEDBACK] auth.getUser() exception:', err);
    return null;
  }
}

/**
 * Upload a screenshot to the feedback-screenshots bucket.
 * Returns the storage path on success, null on failure.
 * Does NOT throw — callers can proceed without screenshot.
 */
export async function uploadScreenshot(file: File, userId?: string): Promise<string | null> {
  try {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      console.error('[BETA_FEEDBACK] Invalid file type:', file.type);
      return null;
    }
    if (file.size > MAX_FILE_SIZE) {
      console.error('[BETA_FEEDBACK] File too large:', (file.size / 1024 / 1024).toFixed(2), 'MB');
      return null;
    }

    const authUser = await getAuthUser();
    if (!authUser) {
      console.error('[BETA_FEEDBACK] Cannot upload: not authenticated');
      return null;
    }

    const userFolder = userId || authUser.id;
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `feedback/${userFolder}/${timestamp}-${safeName}`;

    console.log('[BETA_FEEDBACK] Uploading screenshot:', { bucket: SCREENSHOT_BUCKET, path: filePath });

    const { data, error } = await supabase.storage
      .from(SCREENSHOT_BUCKET)
      .upload(filePath, file, { contentType: file.type, upsert: false });

    if (error) {
      console.error('[BETA_FEEDBACK] Upload error:', error.message);
      return null;
    }

    console.log('[BETA_FEEDBACK] Screenshot uploaded:', data.path);
    return data.path;
  } catch (err) {
    console.error('[BETA_FEEDBACK] Upload exception:', err);
    return null;
  }
}

/**
 * Submit feedback report to Supabase table (beta_feedback_reports).
 * 
 * The RLS policy requires: auth.uid()::text = user_id
 * So we MUST send user_id as the string from auth.getUser().
 */
export async function submitFeedbackReport(report: BetaFeedbackReport): Promise<{ success: boolean; error?: string }> {
  try {
    if (!report.description?.trim()) {
      return { success: false, error: 'Description is required' };
    }

    // Step 1: Get authenticated user (validates token with server)
    const authUser = await getAuthUser();
    
    if (!authUser) {
      console.error('[BETA_FEEDBACK] ❌ Not authenticated — cannot insert');
      return { success: false, error: 'Debes iniciar sesión para enviar un reporte.' };
    }

    // Step 2: Build payload — user_id MUST equal auth.uid() for RLS
    const payload = {
      user_id: authUser.id,
      user_email: authUser.email || report.user_email || null,
      category: report.category || 'other',
      description: report.description.trim(),
      screenshot_url: report.screenshot_url || null,
      page_url: report.page_url || window.location.href,
      user_agent: report.user_agent || navigator.userAgent,
      screen_size: report.screen_size || `${window.innerWidth}x${window.innerHeight}`,
      status: 'new',
      priority: 'medium',
    };

    // Step 3: Debug logging
    console.log('[BETA_FEEDBACK] ─── INSERT DEBUG ───');
    console.log('[BETA_FEEDBACK] auth.uid():', authUser.id);
    console.log('[BETA_FEEDBACK] payload.user_id:', payload.user_id);
    console.log('[BETA_FEEDBACK] match:', authUser.id === payload.user_id);
    console.log('[BETA_FEEDBACK] table:', TABLES.betaFeedbackReports);
    console.log('[BETA_FEEDBACK] payload:', JSON.stringify(payload, null, 2));

    // Step 4: Insert
    const { data, error, status, statusText } = await supabase
      .from(TABLES.betaFeedbackReports)
      .insert(payload)
      .select();

    // Step 5: Debug response
    console.log('[BETA_FEEDBACK] ─── RESPONSE ───');
    console.log('[BETA_FEEDBACK] status:', status, statusText);
    console.log('[BETA_FEEDBACK] data:', data);
    console.log('[BETA_FEEDBACK] error:', error);

    if (error) {
      console.error('[BETA_FEEDBACK] ❌ Insert failed:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });

      // Specific error handling
      if (error.code === '42P01') {
        return { success: false, error: 'Tabla no encontrada. Contacta al administrador.' };
      }
      if (error.code === '42501' || error.message?.includes('row-level security') || error.message?.includes('policy')) {
        // This is the RLS block — provide detailed debug info
        console.error('[BETA_FEEDBACK] 🔒 RLS BLOCK DETAILS:');
        console.error('[BETA_FEEDBACK]   auth.uid() =', authUser.id);
        console.error('[BETA_FEEDBACK]   payload.user_id =', payload.user_id);
        console.error('[BETA_FEEDBACK]   typeof user_id =', typeof payload.user_id);
        console.error('[BETA_FEEDBACK]   Possible causes:');
        console.error('[BETA_FEEDBACK]   1. user_id column is UUID but value is text');
        console.error('[BETA_FEEDBACK]   2. RLS policy not applied (run SQL migration)');
        console.error('[BETA_FEEDBACK]   3. Policy uses wrong comparison');
        return { success: false, error: 'Permiso denegado por política de seguridad. Verifica que ejecutaste la migración SQL.' };
      }
      if (error.code === '23502') {
        return { success: false, error: 'Faltan campos obligatorios.' };
      }
      return { success: false, error: error.message || 'Error de base de datos.' };
    }

    console.log('[BETA_FEEDBACK] ✅ Report submitted successfully!');
    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[BETA_FEEDBACK] Exception:', errorMsg);

    if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError')) {
      return { success: false, error: 'No se pudo conectar con el servidor. Verifica tu conexión.' };
    }
    return { success: false, error: 'Error inesperado. Inténtalo de nuevo.' };
  }
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