import { createClient } from 'jsr:@supabase/supabase-js@2';
import { serve } from 'jsr:@supabase/functions-js@latest';

interface ApplyBody {
  referred_id: string;
  referrer_id: string;
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

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  const { data: caller } = await adminClient
    .from('app_14da0f1941_profiles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  const isAdmin = caller?.role === 'admin';
  const isSelf = user.id === (await req.clone().json().catch(() => ({}))).referred_id;

  // Allow admin assignment or self-service bootstrap.
  if (!isAdmin && !isSelf) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body: ApplyBody = await req.json().catch(() => ({}));
  const { referred_id, referrer_id } = body;

  if (!referred_id || !referrer_id || referred_id === referrer_id) {
    return new Response(JSON.stringify({ error: 'Invalid referral pair' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { error: profileErr } = await adminClient
    .from('app_14da0f1941_profiles')
    .update({ referred_by_user_id: referrer_id })
    .eq('user_id', referred_id);

  if (profileErr) {
    return new Response(JSON.stringify({ error: profileErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: existing } = await adminClient
    .from('app_14da0f1941_referrals')
    .select('id')
    .eq('referrer_id', referrer_id)
    .eq('referred_id', referred_id)
    .maybeSingle();

  if (!existing) {
    await adminClient.from('app_14da0f1941_referrals').insert({
      referrer_id,
      referred_id,
      referred_email: user.email ?? '',
      status: 'pending',
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
