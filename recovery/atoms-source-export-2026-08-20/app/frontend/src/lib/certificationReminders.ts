import { supabase, TABLES } from '@/lib/supabase';

const REMINDER_DAYS = [90, 60, 30, 15, 7, 1] as const;

interface ReminderPayload {
  user_id: string;
  certification_id: string;
  reminder_days: number;
  reminder_date: string;
  status: string;
}

/**
 * Calculate and upsert certification expiry reminders.
 * - If expiration_date is null or already expired, no reminders are created.
 * - Uses upsert with conflict on certification_id + reminder_days to avoid duplicates.
 * - Returns { success, message, remindersCreated }
 */
export async function syncCertificationReminders(
  userId: string,
  certificationId: string,
  expirationDate: string | null
): Promise<{ success: boolean; message: string; remindersCreated: number }> {
  // No expiry date — no reminders needed
  if (!expirationDate) {
    return {
      success: true,
      message: 'No expiry date, reminders not required.',
      remindersCreated: 0,
    };
  }

  const expiry = new Date(expirationDate);
  const now = new Date();

  // Already expired — no future reminders
  if (expiry <= now) {
    // Clean up any existing pending reminders for this cert
    try {
      await supabase
        .from(TABLES.workerCertificationReminders)
        .update({ status: 'expired' })
        .eq('certification_id', certificationId)
        .eq('status', 'pending');
    } catch {
      // Non-critical, continue
    }
    return {
      success: true,
      message: 'Certification is already expired. No future reminders created.',
      remindersCreated: 0,
    };
  }

  // Calculate reminder dates
  const reminders: ReminderPayload[] = [];
  for (const days of REMINDER_DAYS) {
    const reminderDate = new Date(expiry);
    reminderDate.setDate(reminderDate.getDate() - days);

    // Only create reminders that are in the future
    if (reminderDate > now) {
      reminders.push({
        user_id: userId,
        certification_id: certificationId,
        reminder_days: days,
        reminder_date: reminderDate.toISOString().split('T')[0],
        status: 'pending',
      });
    }
  }

  if (reminders.length === 0) {
    return {
      success: true,
      message: 'All reminder dates have already passed.',
      remindersCreated: 0,
    };
  }

  // Upsert reminders — conflict on certification_id + reminder_days
  const { error } = await supabase
    .from(TABLES.workerCertificationReminders)
    .upsert(reminders, {
      onConflict: 'certification_id,reminder_days',
      ignoreDuplicates: false,
    });

  if (error) {
    throw new Error(`Failed to sync reminders: ${error.message}`);
  }

  return {
    success: true,
    message: `${reminders.length} reminder(s) scheduled.`,
    remindersCreated: reminders.length,
  };
}

/**
 * Delete all reminders for a certification (when cert is deleted).
 */
export async function deleteCertificationReminders(
  certificationId: string
): Promise<void> {
  const { error } = await supabase
    .from(TABLES.workerCertificationReminders)
    .delete()
    .eq('certification_id', certificationId);

  if (error) {
    console.error('Failed to delete reminders:', error.message);
  }
}