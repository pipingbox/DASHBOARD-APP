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
  | 'NEW_MESSAGE'
  | 'DOCUMENT_REQUEST'
  | 'CERTIFICATE_EXPIRING'
  | 'ADMIN_ALERT';

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