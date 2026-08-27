// Edge Function: broadcast-notification
// Purpose: Admin-only endpoint that inserts a PRODUCT_UPDATE (or ADMIN_ALERT)
//          notification for every user matching the requested audience segment.
//
// Request body:
//   {
//     type?:      'PRODUCT_UPDATE' | 'ADMIN_ALERT'    default: 'PRODUCT_UPDATE'
//     audience:   'all' | 'workers' | 'companies'
//     title:      string  (required)
//     message:    string  (required)
//     action_url?: string  default: '/dashboard'
//   }
//
// Auth: caller must supply an Authorization header with a valid session token
//       belonging to a profile with role='admin'. Service-role is used internally.
//
// Dedup: if a PRODUCT_UPDATE with the same (title, message) was already sent to
//        a user in the last 7 days, that user is skipped.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Audience = "all" | "workers" | "companies";
type NotifType = "PRODUCT_UPDATE" | "ADMIN_ALERT";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // ── Verify caller is an authenticated admin ──────────────────────────────
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Missing authorization header" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const callerToken = authHeader.slice(7);
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user: callerUser }, error: authError } = await callerClient.auth.getUser();
  if (authError || !callerUser) {
    return new Response(
      JSON.stringify({ error: "Invalid session" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Use service role to check admin role (RLS would block this otherwise)
  const svc = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: callerProfile } = await svc
    .from("app_14da0f1941_profiles")
    .select("role")
    .eq("user_id", callerUser.id)
    .maybeSingle();

  if (callerProfile?.role !== "admin") {
    return new Response(
      JSON.stringify({ error: "Forbidden: admin role required" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ── Parse body ───────────────────────────────────────────────────────────
  let body: { type?: string; audience?: string; title?: string; message?: string; action_url?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const notifType: NotifType = (body.type === "ADMIN_ALERT" ? "ADMIN_ALERT" : "PRODUCT_UPDATE");
  const audience: Audience = (["all", "workers", "companies"].includes(body.audience ?? "") ? body.audience as Audience : "all");
  const title = (body.title ?? "").trim();
  const message = (body.message ?? "").trim();
  const actionUrl = body.action_url ?? "/dashboard";

  if (!title || !message) {
    return new Response(
      JSON.stringify({ error: "title and message are required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ── Fetch target users ───────────────────────────────────────────────────
  let profileQuery = svc
    .from("app_14da0f1941_profiles")
    .select("user_id, role");

  if (audience === "workers") {
    profileQuery = profileQuery.eq("role", "worker");
  } else if (audience === "companies") {
    profileQuery = profileQuery.eq("role", "company");
  }
  // else: 'all' → no filter

  const { data: targets, error: targetsError } = await profileQuery;

  if (targetsError) {
    console.error("[broadcast-notification] Error fetching targets:", targetsError);
    return new Response(
      JSON.stringify({ error: targetsError.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (!targets || targets.length === 0) {
    return new Response(
      JSON.stringify({ sent: 0, skipped: 0, message: "No users found for audience." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ── Dedup: skip users who received the same announcement in the last 7 days ──
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Bulk-query already-notified user IDs
  const targetIds = targets.map((t: { user_id: string }) => t.user_id);
  const { data: alreadyNotified } = await svc
    .from("app_14da0f1941_notifications")
    .select("user_id")
    .in("user_id", targetIds)
    .eq("type", notifType)
    .eq("title", title)
    .gte("created_at", sevenDaysAgo);

  const alreadySet = new Set<string>((alreadyNotified ?? []).map((r: { user_id: string }) => r.user_id));

  // ── Insert notifications in batch (100 at a time) ────────────────────────
  const rows = targets
    .filter((t: { user_id: string }) => !alreadySet.has(t.user_id))
    .map((t: { user_id: string }) => ({
      user_id: t.user_id,
      type: notifType,
      title,
      message,
      related_entity_type: "announcement",
      action_url: actionUrl,
      is_read: false,
    }));

  const BATCH = 100;
  let sentCount = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error: insertError } = await svc
      .from("app_14da0f1941_notifications")
      .insert(batch);
    if (insertError) {
      console.error("[broadcast-notification] Batch insert error:", insertError);
    } else {
      sentCount += batch.length;
    }
  }

  const summary = {
    sent: sentCount,
    skipped_duplicates: alreadySet.size,
    total_targets: targets.length,
    audience,
    type: notifType,
  };

  console.log("[broadcast-notification] Summary:", summary);

  return new Response(
    JSON.stringify(summary),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
