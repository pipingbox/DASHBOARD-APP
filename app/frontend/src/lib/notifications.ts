import { supabase, TABLES } from './supabase';

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
 */
export async function createNotification(args: CreateNotificationArgs): Promise<void> {
  if (!args.recipientId) return;
  if (args.actorId && args.recipientId === args.actorId) return;

  try {
    await supabase.from(TABLES.notifications).insert({
      user_id: args.recipientId,
      type: args.type,
      title: args.title ?? null,
      message: args.message ?? null,
      related_entity_type: args.relatedEntityType ?? null,
      related_entity_id: args.relatedEntityId ?? null,
      action_url: args.actionUrl ?? null,
      actor_id: args.actorId ?? null,
      actor_name: args.actorName ?? null,
    });
  } catch {
    // Silently ignore — notification failure must not break core UX.
  }
}

// ─── Convenience Helpers ───

/** Notify worker that their profile is incomplete after signup */
export async function notifyProfileIncomplete(userId: string): Promise<void> {
  await createNotification({
    recipientId: userId,
    type: 'PROFILE_INCOMPLETE',
    title: 'Perfil incompleto',
    message: 'Completa tu perfil para aparecer ante empresas.',
    actionUrl: '/profile',
  });
}

/** Notify worker that their profile is marketplace-ready */
export async function notifyProfileReady(userId: string): Promise<void> {
  await createNotification({
    recipientId: userId,
    type: 'PROFILE_READY',
    title: 'Perfil listo',
    message: 'Tu perfil ya puede ser descubierto por empresas.',
    actionUrl: '/profile',
  });
}

/** Notify referrer that their referral has joined */
export async function notifyReferralJoined(referrerId: string, referralName: string): Promise<void> {
  await createNotification({
    recipientId: referrerId,
    type: 'REFERRAL_JOINED',
    title: 'Nuevo referido',
    message: `Tu referido ${referralName} se ha registrado en PipingBox.`,
    relatedEntityType: 'referral',
    actionUrl: '/dashboard',
  });
}

/** Notify referrer that their referral has been verified */
export async function notifyReferralVerified(referrerId: string, referralName: string): Promise<void> {
  await createNotification({
    recipientId: referrerId,
    type: 'REFERRAL_VERIFIED',
    title: 'Referido verificado',
    message: `Tu referido ${referralName} ha completado su perfil mínimo.`,
    relatedEntityType: 'referral',
    actionUrl: '/dashboard',
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
  const { count } = await supabase
    .from(TABLES.notifications)
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);
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
// Each suggestion uses PROFILE_INCOMPLETE type + related_entity_id = "field:<key>"
// for dedup. The same suggestion is not re-sent within SUGGESTION_COOLDOWN_DAYS.

const SUGGESTION_COOLDOWN_DAYS = 30;

export interface ProfileSuggestionInput {
  title: string | null | undefined;
  skills: string[] | null | undefined;
  location: string | null | undefined;
  languages: string[] | null | undefined;
  years_experience: number | null | undefined;
  availability_status: string | null | undefined;
}

/** Returns up to `maxSuggestions` actionable suggestions for the given profile gaps. */
export function buildProfileSuggestions(
  profile: ProfileSuggestionInput,
  maxSuggestions = 3,
): { fieldKey: string; message: string }[] {
  const suggestions: { fieldKey: string; message: string }[] = [];

  if (!profile.title?.trim())
    suggestions.push({
      fieldKey: 'title',
      message: 'Añade tu especialización (ej. Piping Designer, Welder) para aparecer en búsquedas relevantes.',
    });

  if (!profile.skills || profile.skills.length === 0)
    suggestions.push({
      fieldKey: 'skills',
      message: 'Añade tus habilidades técnicas para mejorar tu compatibilidad con ofertas.',
    });

  if (!profile.location?.trim())
    suggestions.push({
      fieldKey: 'location',
      message: 'Añade tu ubicación para recibir ofertas locales y proyectos cercanos.',
    });

  if (!profile.languages || profile.languages.length === 0)
    suggestions.push({
      fieldKey: 'languages',
      message: 'Indica los idiomas en que puedes trabajar para acceder a más oportunidades.',
    });

  if (!profile.years_experience || profile.years_experience === 0)
    suggestions.push({
      fieldKey: 'years_experience',
      message: 'Añade tus años de experiencia para que las empresas puedan evaluar tu perfil correctamente.',
    });

  if (!profile.availability_status)
    suggestions.push({
      fieldKey: 'availability_status',
      message: 'Indica tu disponibilidad actual para recibir invitaciones de empresas.',
    });

  return suggestions.slice(0, maxSuggestions);
}

/**
 * Send actionable profile improvement notifications.
 * Each field deduped independently with a 30-day cooldown so the user
 * only receives each suggestion once a month at most.
 */
export async function notifyProfileSuggestions(
  userId: string,
  profile: ProfileSuggestionInput,
): Promise<void> {
  const suggestions = buildProfileSuggestions(profile);
  if (suggestions.length === 0) return;

  const cooloff = new Date(Date.now() - SUGGESTION_COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();

  for (const { fieldKey, message } of suggestions) {
    const entityId = `field:${fieldKey}`;

    // Dedup: skip if already sent within cooldown window
    const { data: existing } = await supabase
      .from(TABLES.notifications)
      .select('id')
      .eq('user_id', userId)
      .eq('type', 'PROFILE_INCOMPLETE')
      .eq('related_entity_id', entityId)
      .gte('created_at', cooloff)
      .limit(1);

    if (existing && existing.length > 0) continue;

    await createNotification({
      recipientId: userId,
      type: 'PROFILE_INCOMPLETE',
      title: 'Completa tu perfil',
      message,
      relatedEntityType: 'profile',
      relatedEntityId: entityId,
      actionUrl: '/profile',
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