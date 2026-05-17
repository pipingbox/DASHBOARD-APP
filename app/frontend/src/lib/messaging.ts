import { supabase, TABLES } from './supabase';

/**
 * Find or create a conversation between a company user and a worker.
 * Returns the conversation ID.
 * 
 * In Admin Preview mode, the authenticated user (admin) acts as the company_user_id.
 */
export async function findOrCreateConversation(params: {
  companyUserId: string;
  workerUserId: string;
  applicationId?: string | null;
  jobId?: string | null;
}): Promise<string | null> {
  const { companyUserId, workerUserId, applicationId, jobId } = params;

  // Get the authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  console.log('[Messaging] findOrCreateConversation called with:', {
    companyUserId,
    workerUserId,
    applicationId,
    jobId,
  });
  console.log('[Messaging] Authenticated user:', user?.id, user?.email);

  if (authError || !user) {
    console.error('[Messaging] Auth error or no user:', authError);
    return null;
  }

  // Try to find existing conversation by application_id first (most specific)
  if (applicationId) {
    const { data: existingByApp, error: appErr } = await supabase
      .from(TABLES.conversations)
      .select('id')
      .eq('application_id', applicationId)
      .maybeSingle();

    console.log('[Messaging] Search by application_id:', { existingByApp, error: appErr });

    if (existingByApp) {
      return existingByApp.id;
    }
  }

  // Try to find existing conversation by company + worker + job
  let query = supabase
    .from(TABLES.conversations)
    .select('id')
    .eq('company_user_id', companyUserId)
    .eq('worker_user_id', workerUserId);

  if (jobId) {
    query = query.eq('job_id', jobId);
  }

  const { data: existing, error: searchErr } = await query.maybeSingle();

  console.log('[Messaging] Search by company+worker+job:', { existing, error: searchErr });

  if (existing) {
    return existing.id;
  }

  // Create new conversation
  // The insert must use the authenticated user's ID as company_user_id for RLS to pass
  // In admin preview mode, the admin IS the authenticated user, so we use their ID
  const insertPayload = {
    company_user_id: user.id, // Use authenticated user's ID for RLS compliance
    worker_user_id: workerUserId,
    application_id: applicationId || null,
    job_id: jobId || null,
    last_message: null,
    last_message_at: new Date().toISOString(),
    unread_company: 0,
    unread_worker: 0,
  };

  console.log('[Messaging] Inserting conversation with payload:', insertPayload);

  const { data: newConv, error: insertError } = await supabase
    .from(TABLES.conversations)
    .insert(insertPayload)
    .select('id')
    .single();

  if (insertError) {
    console.error('[Messaging] Failed to create conversation:', {
      error: insertError,
      code: insertError.code,
      message: insertError.message,
      details: insertError.details,
      hint: insertError.hint,
    });
    return null;
  }

  console.log('[Messaging] Conversation created successfully:', newConv.id);
  return newConv.id;
}