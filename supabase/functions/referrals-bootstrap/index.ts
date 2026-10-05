import { createClient } from "https://esm.sh/@supabase/supabase-js@2";


interface BootstrapBody {
  referral_code?: string;
}

Deno.serve(async (req: Request) => {
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

  // Idempotency: an existing referral_code is stable and must be returned
  // as-is instead of being regenerated (PB-REFERRAL-ALDO-001).
  const { data: profile } = await adminClient
    .from('app_14da0f1941_profiles')
    .select('referral_code, referred_by_user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  let code = (profile?.referral_code as string | null) ?? null;

  if (!code) {
    // Generate with collision retry (referral_code has a UNIQUE index).
    for (let attempt = 0; attempt < 3 && !code; attempt++) {
      const candidate = `PB-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      const { error: codeErr } = await adminClient
        .from('app_14da0f1941_profiles')
        .update({ referral_code: candidate })
        .eq('user_id', user.id)
        .is('referral_code', null);
      if (!codeErr) {
        code = candidate;
      } else if (codeErr.code !== '23505') {
        return new Response(JSON.stringify({ error: codeErr.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    if (!code) {
      return new Response(JSON.stringify({ error: 'Could not allocate referral code' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // Referrer assignment: only when the profile has NO previous attribution.
  // A prior referred_by_user_id is never overwritten (PB-REFERRAL-ALDO-001).
  let referrerId: string | null = null;
  if (body.referral_code && !profile?.referred_by_user_id) {
    const { data: referrer } = await adminClient
      .from('app_14da0f1941_profiles')
      .select('user_id')
      .eq('referral_code', body.referral_code)
      .maybeSingle();
    if (referrer && referrer.user_id !== user.id) {
      referrerId = referrer.user_id as string;
    }
  }

  if (referrerId) {
    const { error: updateErr } = await adminClient
      .from('app_14da0f1941_profiles')
      .update({ referred_by_user_id: referrerId })
      .eq('user_id', user.id)
      .is('referred_by_user_id', null);

    if (updateErr) {
      return new Response(JSON.stringify({ error: updateErr.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

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
  }

  return new Response(JSON.stringify({ referral_code: code, referrer_id: referrerId }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
