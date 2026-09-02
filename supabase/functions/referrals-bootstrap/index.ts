import { createClient } from 'jsr:@supabase/supabase-js@2';
import { serve } from 'jsr:@supabase/functions-js@latest';

interface BootstrapBody {
  referral_code?: string;
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing authorization' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    },
  );

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body: BootstrapBody = await req.json().catch(() => ({}));

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  const code = `PB-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  let referrerId: string | null = null;
  if (body.referral_code) {
    const { data: referrer } = await adminClient
      .from('app_14da0f1941_profiles')
      .select('user_id')
      .eq('referral_code', body.referral_code)
      .maybeSingle();
    if (referrer && referrer.user_id !== user.id) {
      referrerId = referrer.user_id as string;
    }
  }

  const updates: Record<string, unknown> = { referral_code: code };
  if (referrerId) {
    updates.referred_by_user_id = referrerId;
  }

  const { error: updateErr } = await adminClient
    .from('app_14da0f1941_profiles')
    .update(updates)
    .eq('user_id', user.id);

  if (updateErr) {
    return new Response(JSON.stringify({ error: updateErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (referrerId) {
    const { data: existing } = await adminClient
      .from('app_14da0f1941_referrals')
      .select('id')
      .eq('referrer_id', referrerId)
      .eq('referred_id', user.id)
      .maybeSingle();

    if (!existing) {
      await adminClient.from('app_14da0f1941_referrals').insert({
        referrer_id: referrerId,
        referred_id: user.id,
        referred_email: user.email ?? '',
        status: 'pending',
      });
    }

    const { data: referrerProfile } = await adminClient
      .from('app_14da0f1941_profiles')
      .select('referral_count')
      .eq('user_id', referrerId)
      .maybeSingle();

    const currentCount = (referrerProfile?.referral_count as number) ?? 0;
    await adminClient
      .from('app_14da0f1941_profiles')
      .update({ referral_count: currentCount + 1 })
      .eq('user_id', referrerId);
  }

  return new Response(JSON.stringify({ referral_code: code, referrer_id: referrerId }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
