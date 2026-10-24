import { supabase, TABLES } from './supabase';
import { trackEvent } from './observability';

// ─── Notification Types ───
export type NotificationType =
  | 'like'
  | 'comment'
  | 'job_invitation'
  | 'PROFILE_INCOMPLETE'
  | 'PROFILE_READY'
  | 'REFERRAL_JOINED'
  | 'REFERRAL_VERIFIED'
  | 'JOB_INVITATION'
  | 'JOB_MATCH'
  | 'WORKFORCE_INVITATION'
  | 'NEW_MESSAGE'
  | 'DOCUMENT_REQUEST'
  | 'CERTIFICATE_EXPIRING'
  | 'ADMIN_ALERT'
  | 'FEEDBACK_RESOLVED'
  | 'PRODUCT_UPDATE';

// ─── Row Interface ───
export interface NotificationRow {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string | null;
  message: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  action_url: string | null;
  actor_id: string | null;
  actor_name: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

// ─── Create Notification Args ───
interface CreateNotificationArgs {
  recipientId: string;
  type: NotificationType;
  title?: string;
  message?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  actionUrl?: string;
  actorId?: string;
  actorName?: string;
}

/**
 * Create a notification row. Skips if recipient equals actor (no self-notify).
 * Errors are swallowed to avoid breaking the primary action.
 *
 * PB-NOTIFICATIONS-INSERT-HARDENING-001: direct table INSERT from the browser
 * is no longer possible for cross-recipient rows (RLS restricts INSERT to
 * self-only). Cross-recipient creation goes through the narrowly scoped
 * pb_create_client_notification RPC, which (a) derives the actor from
 * auth.uid(), (b) allows only client types, and (c) requires a
 * verifiable business relationship for social, job, and referral types.
 */
export async function createNotification(args: CreateNotificationArgs): Promise<void> {
  if (!args.recipientId) return;
  if (args.actorId && args.recipientId === args.actorId) return;

  try {
    const { error } = await supabase.rpc('pb_create_client_notification', {
      p_type: args.type,
      p_title: args.title ?? null,
      p_message: args.message ?? null,
      p_related_entity_type: args.relatedEntityType ?? null,
      p_related_entity_id: args.relatedEntityId ?? null,
      p_action_url: args.actionUrl ?? null,
      p_recipient_id: args.recipientId,
    });
    if (error) {
      // PostgREST resolves with { data: null, error } on RPC failures; the
      // catch below only fires on thrown/network errors. Surface both through
      // sanitized telemetry (fail-open: never break the primary action).
      trackEvent('app_error', {
        error_name: 'notification_rpc_error',
        error_message: `${args.type}: ${error.code ?? 'unknown'}`,
        component_top: 'notifications',
        origin: 'createNotification',
      });
    }
  } catch (err) {
    trackEvent('app_error', {
      error_name: 'notification_rpc_exception',
      error_message: `${args.type}: ${err instanceof Error ? err.name : 'unknown'}`,
      component_top: 'notifications',
      origin: 'createNotification',
    });
  }
}

// ─── Convenience Helpers ───
// (notifyProfileIncomplete / notifyProfileReady were removed in
// PB-NOTIFICATION-PROFILE-INCOMPLETE-FIX-001: they had no callers and used
// the cross-user RPC for self-notifications — the same broken path that
// caused the PROFILE_INCOMPLETE: P0001 incident. Profile suggestions now
// go through the dedicated pb_create_profile_suggestions() RPC above.)

/** Notify referrer that their referral has joined */
export async function notifyReferralJoined(referrerId: string, referralId: string): Promise<void> {
  await createNotification({
    recipientId: referrerId,
    type: 'REFERRAL_JOINED',
    relatedEntityType: 'referral',
    relatedEntityId: referralId,
  });
}

/** Notify referrer that their referral has been verified */
export async function notifyReferralVerified(referrerId: string, referralId: string): Promise<void> {
  await createNotification({
    recipientId: referrerId,
    type: 'REFERRAL_VERIFIED',
    relatedEntityType: 'referral',
    relatedEntityId: referralId,
  });
}

/** Notify worker about a job invitation */
export async function notifyJobInvitation(
  workerId: string,
  jobTitle: string,
  jobId: string,
  companyName?: string,
): Promise<void> {
  await createNotification({
    recipientId: workerId,
    type: 'JOB_INVITATION',
    title: 'Invitación de trabajo',
    message: `Has recibido una invitación de trabajo: ${jobTitle}`,
    relatedEntityType: 'job',
    relatedEntityId: jobId,
    actionUrl: '/jobs',
    actorName: companyName,
  });
}

/** Notify worker about a new job match (score >= threshold, fired by job-match-notify Edge Function) */
export async function notifyJobMatch(
  workerId: string,
  jobTitle: string,
  jobId: string,
  score: number,
  companyName?: string,
): Promise<void> {
  await createNotification({
    recipientId: workerId,
    type: 'JOB_MATCH',
    title: 'Nueva oferta compatible',
    message: `${score}% de compatibilidad con "${jobTitle}"${companyName ? ` en ${companyName}` : ''}.`,
    relatedEntityType: 'job',
    relatedEntityId: jobId,
    actionUrl: '/jobs',
    actorName: companyName,
  });
}

/** Notify user about a new message */
export async function notifyNewMessage(
  recipientId: string,
  senderName: string,
  senderId: string,
): Promise<void> {
  await createNotification({
    recipientId,
    type: 'NEW_MESSAGE',
    title: 'Nuevo mensaje',
    message: `Tienes un nuevo mensaje de ${senderName}.`,
    relatedEntityType: 'message',
    relatedEntityId: senderId,
    actionUrl: '/messages',
    actorId: senderId,
    actorName: senderName,
  });
}

/** Notify worker about an expiring certificate */
export async function notifyCertificateExpiring(
  userId: string,
  certName: string,
  certId: string,
): Promise<void> {
  await createNotification({
    recipientId: userId,
    type: 'CERTIFICATE_EXPIRING',
    title: 'Certificado por vencer',
    message: `Uno de tus certificados está próximo a vencer: ${certName}`,
    relatedEntityType: 'certification',
    relatedEntityId: certId,
    actionUrl: '/profile',
  });
}

/** Notify admin about an alert (orphan user, failed profile, etc.) */
export async function notifyAdminAlert(
  adminId: string,
  alertMessage: string,
  entityType?: string,
  entityId?: string,
): Promise<void> {
  await createNotification({
    recipientId: adminId,
    type: 'ADMIN_ALERT',
    title: 'Alerta de administrador',
    message: alertMessage,
    relatedEntityType: entityType,
    relatedEntityId: entityId,
    actionUrl: '/admin',
  });
}

/** Notify user that their feedback report has been resolved (with duplicate check) */
export async function notifyFeedbackResolved(
  userId: string,
  reportId: string,
  adminName?: string,
): Promise<void> {
  if (!userId || !reportId) return;

  // Check for duplicate: don't create if one already exists for this report
  try {
    const { data: existing } = await supabase
      .from(TABLES.notifications)
      .select('id')
      .eq('user_id', userId)
      .eq('type', 'FEEDBACK_RESOLVED')
      .eq('related_entity_id', reportId)
      .limit(1);

    if (existing && existing.length > 0) {
      console.log('[NOTIFY] Feedback resolved notification already exists for report:', reportId);
      return;
    }
  } catch {
    // If check fails, proceed anyway — worst case is a duplicate
  }

  await createNotification({
    recipientId: userId,
    type: 'FEEDBACK_RESOLVED',
    title: 'Problema resuelto',
    message: 'Hemos revisado y marcado como resuelto tu reporte. Gracias por ayudarnos a mejorar PipingBox.',
    relatedEntityType: 'beta_feedback_report',
    relatedEntityId: reportId,
    actionUrl: '/dashboard',
    actorName: adminName,
  });
}

/** Notify about a document request */
export async function notifyDocumentRequest(
  userId: string,
  documentName: string,
): Promise<void> {
  await createNotification({
    recipientId: userId,
    type: 'DOCUMENT_REQUEST',
    title: 'Solicitud de documento',
    message: `Se ha solicitado el documento: ${documentName}`,
    relatedEntityType: 'document',
    actionUrl: '/profile',
  });
}

/** Notify all admin users about a new company lead */
export async function notifyNewCompanyLead(
  companyName: string,
  workersNeeded: string,
  country: string,
  leadId?: string,
): Promise<void> {
  try {
    // Fetch all admin users
    const { data: admins } = await supabase
      .from(TABLES.profiles)
      .select('user_id')
      .eq('role', 'admin');

    if (!admins || admins.length === 0) {
      console.warn('[notifyNewCompanyLead] No admin users found to notify');
      return;
    }

    console.log('[notifyNewCompanyLead] Notifying', admins.length, 'admins about lead from', companyName);

    // Create notification for each admin
    await Promise.all(
      admins.map((admin) =>
        createNotification({
          recipientId: admin.user_id,
          type: 'ADMIN_ALERT',
          title: 'Nueva solicitud de empresa',
          message: `${companyName} necesita ${workersNeeded} en ${country}`,
          relatedEntityType: 'company_lead',
          relatedEntityId: leadId,
          actionUrl: '/admin',
        }),
      ),
    );
  } catch (err) {
    console.error('[notifyNewCompanyLead] Failed:', err);
  }
}

/**
 * Notify admins that a lead was captured but its email never went out.
 *
 * The Edge Function reports this as HTTP 200, so from the visitor's side it
 * looks like a success and there is nothing to show them -- their request IS
 * stored. The problem is purely internal: without this, the only trace is a
 * console.error in the browser of whoever filled the form, which nobody at
 * PipingBox will ever read. That is how the SMTP gap stayed invisible.
 */
export async function notifyLeadEmailFailure(
  companyName: string,
  reason: string,
  leadEmail?: string,
): Promise<void> {
  try {
    const { data: admins } = await supabase
      .from(TABLES.profiles)
      .select('user_id')
      .eq('role', 'admin');

    if (!admins || admins.length === 0) {
      console.warn('[notifyLeadEmailFailure] No admin users found to notify');
      return;
    }

    const contact = leadEmail ? ` Contactar manualmente: ${leadEmail}` : '';

    await Promise.all(
      admins.map((admin) =>
        createNotification({
          recipientId: admin.user_id,
          type: 'ADMIN_ALERT',
          title: 'Aviso: email de lead NO enviado',
          message: `El lead de ${companyName} se guardó correctamente, pero el email no salió (${reason}).${contact}`,
          relatedEntityType: 'company_lead',
          actionUrl: '/admin',
        }),
      ),
    );
  } catch (err) {
    console.error('[notifyLeadEmailFailure] Failed:', err);
  }
}

// ─── Query Helpers ───

export async function fetchNotifications(userId: string, limit = 30): Promise<NotificationRow[]> {
  const { data } = await supabase
    .from(TABLES.notifications)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data as NotificationRow[]) ?? [];
}

export async function fetchAllNotificationsAdmin(limit = 100): Promise<NotificationRow[]> {
  const { data } = await supabase
    .from(TABLES.notifications)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data as NotificationRow[]) ?? [];
}

export async function countUnread(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from(TABLES.notifications)
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);
  if (error) {
    // PB-GROWTH-GATE-FINAL-001: surface instead of silently swallowing so the
    // polling loop (useNotifications) can back off on persistent denials
    // (e.g. stale/mismatched session) instead of retrying forever.
    throw error;
  }
  return count ?? 0;
}

export async function markAllRead(userId: string): Promise<void> {
  await supabase
    .from(TABLES.notifications)
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('is_read', false);
}

export async function markRead(notificationId: string): Promise<void> {
  await supabase
    .from(TABLES.notifications)
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', notificationId);
}

export async function deleteNotification(notificationId: string): Promise<void> {
  await supabase
    .from(TABLES.notifications)
    .delete()
    .eq('id', notificationId);
}

// ─── Profile improvement suggestions (PB-NOTIF-001 Fase 3) ────────────────
//
// PB-NOTIFICATION-PROFILE-INCOMPLETE-FIX-001: suggestions used to go through
// createNotification() → pb_create_client_notification, which is the hardened
// cross-user boundary (client-creatable types only, self-recipient banned).
// PROFILE_INCOMPLETE is a self-notification and was never client-creatable,
// so every attempt failed with P0001 (21 × notification_rpc_error on 23/10).
//
// The dedicated RPC pb_create_profile_suggestions() takes ZERO arguments:
// the user comes from auth.uid(), the gaps from the canonical profile row,
// and the type/content/action_url are fixed server-side. Per-field dedup
// with a 30-day cooldown and the 3-per-call limit also live in the RPC.
// Fail-open: errors are swallowed so the profile save is never affected.

export async function notifyProfileSuggestions(): Promise<void> {
  try {
    const { error } = await supabase.rpc('pb_create_profile_suggestions');
    if (error) {
      // Distinct error name so this path is never confused with the
      // cross-user RPC boundary telemetry.
      trackEvent('app_error', {
        error_name: 'profile_suggestion_rpc_error',
        error_message: `PROFILE_INCOMPLETE: ${error.code ?? 'unknown'}`,
        component_top: 'notifications',
        origin: 'notifyProfileSuggestions',
      });
    }
  } catch (err) {
    trackEvent('app_error', {
      error_name: 'profile_suggestion_rpc_exception',
      error_message: `PROFILE_INCOMPLETE: ${err instanceof Error ? err.name : 'unknown'}`,
      component_top: 'notifications',
      origin: 'notifyProfileSuggestions',
    });
  }
}

// ─── PRODUCT_UPDATE helpers ────────────────────────────────────────────────

/**
 * Notify a single user about a new product update/announcement.
 * In practice this is called in bulk by the broadcast-notification Edge Function.
 */
export async function notifyProductUpdate(
  userId: string,
  title: string,
  message: string,
  actionUrl = '/dashboard',
): Promise<void> {
  await createNotification({
    recipientId: userId,
    type: 'PRODUCT_UPDATE',
    title,
    message,
    relatedEntityType: 'announcement',
    actionUrl,
  });
}