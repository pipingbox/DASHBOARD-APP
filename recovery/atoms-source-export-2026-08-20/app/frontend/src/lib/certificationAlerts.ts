import { supabase, TABLES } from './supabase';

/**
 * Certification alert structure for future email delivery.
 * This prepares the data layer — no actual emails are sent yet.
 */
export interface CertificationAlert {
  id: string;
  user_id: string;
  certification_id: string;
  alert_type: 'expiry_90' | 'expiry_60' | 'expiry_30' | 'expired';
  scheduled_for: string;
  sent_at: string | null;
  status: 'pending' | 'sent' | 'cancelled';
  created_at: string;
}

/**
 * Generate scheduled alerts for a certification based on its expiry date.
 * Creates alerts at 90, 60, 30 days before and on expiry.
 */
export async function generateCertAlerts(
  userId: string,
  certificationId: string,
  expiryDate: string,
): Promise<void> {
  const expiry = new Date(expiryDate);
  const now = new Date();

  // Define alert schedule: days before expiry
  const alertSchedule: { days: number; type: CertificationAlert['alert_type'] }[] = [
    { days: 90, type: 'expiry_90' },
    { days: 60, type: 'expiry_60' },
    { days: 30, type: 'expiry_30' },
    { days: 0, type: 'expired' },
  ];

  // Remove existing pending alerts for this certification
  await supabase
    .from(TABLES.certificationAlerts)
    .delete()
    .eq('user_id', userId)
    .eq('certification_id', certificationId)
    .eq('status', 'pending');

  // Create new alerts for future dates only
  const alertsToInsert = alertSchedule
    .map(({ days, type }) => {
      const scheduledDate = new Date(expiry);
      scheduledDate.setDate(scheduledDate.getDate() - days);
      return {
        user_id: userId,
        certification_id: certificationId,
        alert_type: type,
        scheduled_for: scheduledDate.toISOString(),
        status: 'pending' as const,
      };
    })
    .filter((alert) => new Date(alert.scheduled_for) > now);

  if (alertsToInsert.length > 0) {
    await supabase.from(TABLES.certificationAlerts).insert(alertsToInsert);
  }
}

/**
 * Fetch pending alerts for a user (for notification bell display).
 */
export async function fetchPendingAlerts(
  userId: string,
): Promise<CertificationAlert[]> {
  const now = new Date().toISOString();
  const { data } = await supabase
    .from(TABLES.certificationAlerts)
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .lte('scheduled_for', now)
    .order('scheduled_for', { ascending: false });

  return (data as CertificationAlert[]) ?? [];
}

/**
 * Mark alerts as sent (for future email integration).
 */
export async function markAlertsSent(alertIds: string[]): Promise<void> {
  if (alertIds.length === 0) return;
  await supabase
    .from(TABLES.certificationAlerts)
    .update({ sent_at: new Date().toISOString(), status: 'sent' })
    .in('id', alertIds);
}

/**
 * Cancel all pending alerts for a certification (e.g., when deleted or renewed).
 */
export async function cancelCertAlerts(
  userId: string,
  certificationId: string,
): Promise<void> {
  await supabase
    .from(TABLES.certificationAlerts)
    .update({ status: 'cancelled' })
    .eq('user_id', userId)
    .eq('certification_id', certificationId)
    .eq('status', 'pending');
}