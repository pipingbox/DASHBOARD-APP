import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Use service_role key to bypass RLS for admin operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Missing Supabase environment variables' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify caller is admin
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if user is admin
      const { data: profile } = await adminClient
        .from('app_14da0f1941_profiles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (!profile || profile.role !== 'admin') {
        return new Response(
          JSON.stringify({ error: 'Admin access required' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Apply RLS migration SQL
    const migrationSQL = `
      BEGIN;

      -- Enable RLS
      ALTER TABLE public.app_worker_certifications ENABLE ROW LEVEL SECURITY;

      -- Drop existing policies to avoid conflicts
      DROP POLICY IF EXISTS "cert_owner_select" ON public.app_worker_certifications;
      DROP POLICY IF EXISTS "cert_owner_insert" ON public.app_worker_certifications;
      DROP POLICY IF EXISTS "cert_owner_update" ON public.app_worker_certifications;
      DROP POLICY IF EXISTS "cert_owner_delete" ON public.app_worker_certifications;
      DROP POLICY IF EXISTS "cert_authenticated_select_visible" ON public.app_worker_certifications;
      DROP POLICY IF EXISTS "cert_admin_all" ON public.app_worker_certifications;

      -- Owner SELECT own rows
      CREATE POLICY "cert_owner_select"
        ON public.app_worker_certifications
        FOR SELECT TO authenticated
        USING (auth.uid() = user_id);

      -- Authenticated users SELECT visible certs (for candidate profiles)
      CREATE POLICY "cert_authenticated_select_visible"
        ON public.app_worker_certifications
        FOR SELECT TO authenticated
        USING (is_visible = true);

      -- Owner INSERT own rows
      CREATE POLICY "cert_owner_insert"
        ON public.app_worker_certifications
        FOR INSERT TO authenticated
        WITH CHECK (auth.uid() = user_id);

      -- Owner UPDATE own rows
      CREATE POLICY "cert_owner_update"
        ON public.app_worker_certifications
        FOR UPDATE TO authenticated
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);

      -- Owner DELETE own rows
      CREATE POLICY "cert_owner_delete"
        ON public.app_worker_certifications
        FOR DELETE TO authenticated
        USING (auth.uid() = user_id);

      -- Admin full access
      CREATE POLICY "cert_admin_all"
        ON public.app_worker_certifications
        FOR ALL TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.app_14da0f1941_profiles
            WHERE user_id = auth.uid() AND role = 'admin'
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM public.app_14da0f1941_profiles
            WHERE user_id = auth.uid() AND role = 'admin'
          )
        );

      COMMIT;
    `;

    const { data, error } = await adminClient.rpc('exec_sql', { sql: migrationSQL });

    if (error) {
      // If exec_sql RPC doesn't exist, try direct REST API
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceRoleKey,
          'Authorization': `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ sql: migrationSQL }),
      });

      if (!response.ok) {
        return new Response(
          JSON.stringify({
            error: 'Could not execute SQL automatically. Please run the migration manually.',
            manual_sql: migrationSQL,
            details: error.message,
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'RLS policies applied successfully to app_worker_certifications',
        policies_created: [
          'cert_owner_select - Owner can read own certifications',
          'cert_authenticated_select_visible - Authenticated users can read visible certs',
          'cert_owner_insert - Owner can create own certifications',
          'cert_owner_update - Owner can update own certifications',
          'cert_owner_delete - Owner can delete own certifications',
          'cert_admin_all - Admin has full access to all rows',
        ],
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Internal error', details: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});