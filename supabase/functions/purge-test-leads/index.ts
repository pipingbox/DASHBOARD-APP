// Edge Function: purge-test-leads
// Purpose: Delete the synthetic lead rows that the RLS security gate
//          (tests/rls-security.spec.ts — PB-SEC-RLS-WORKFORCE-001) inserts on every
//          CI run into the real commercial tables.
//
//          The gate MUST insert as `anon` — that is the assertion: the public B2B funnel
//          still works after the RLS lockdown. But `anon` has no DELETE policy (by design)
//          and the QA account is not an admin, so nothing could clean up. Each CI run left
//          2 junk rows in the sales pipeline forever. This function is the cleanup arm.
//
// Trigger: called from the `afterAll` hook of tests/rls-security.spec.ts (best-effort:
//          a failure here never fails the security gate). Can also be invoked manually:
//
//     curl -X POST 'https://<project-ref>.functions.supabase.co/purge-test-leads' \
//       -H 'Authorization: Bearer <SERVICE_ROLE_KEY>' \
//       -H 'Content-Type: application/json'
//
// Auth: caller must present an Authorization Bearer token equal to either
//       SUPABASE_SERVICE_ROLE_KEY or PURGE_TEST_LEADS_SECRET. Same "Bearer token in the
//       Authorization header" convention as broadcast-notification, but compared against a
//       secret instead of resolved to a user session, because CI has no admin user to log
//       in as (that is precisely the reason this debt existed). Comparison is
//       constant-time to avoid leaking the secret through timing.
//
// SAFETY CONSTRAINT (non-negotiable):
//   The delete filter is hard-coded to `.like('company_name', 'RLS-TEST%')`.
//   The prefix is a compile-time constant — it is NEVER read from the request body, query
//   string or env — so this endpoint cannot be coerced into a mass delete. Any real lead
//   whose company_name does not literally start with `RLS-TEST` is untouchable here.
//
// Idempotent: purging when there is nothing to purge returns { purged: { ... 0 } } with 200.
//
// Environment variables required:
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY  (bypasses RLS to perform the DELETE; also a valid caller token)
//   - PURGE_TEST_LEADS_SECRET    (optional — alternative caller token, so CI never needs
//                                 the service role key in its environment)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * The ONLY rows this function may ever touch. Hard-coded on purpose: see the safety
 * constraint in the header. Do not parameterise, do not widen, do not read from input.
 */
const TEST_LEAD_PREFIX = "RLS-TEST";

/** Tables the security gate inserts into, and therefore the only ones purged. */
const TARGET_TABLES = [
  "app_14da0f1941_workforce_requests",
  "app_14da0f1941_company_leads",
] as const;

/** Response key per table, so the payload stays stable if the table prefix ever changes. */
const RESULT_KEYS: Record<(typeof TARGET_TABLES)[number], string> = {
  app_14da0f1941_workforce_requests: "workforce_requests",
  app_14da0f1941_company_leads: "company_leads",
};

/** Length-safe, constant-time string compare so the guard cannot be brute-forced by timing. */
function secureEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const purgeSecret = Deno.env.get("PURGE_TEST_LEADS_SECRET");

  // ── Auth guard: Bearer token must match a configured secret ──────────────
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Missing authorization header" }, 401);
  }

  const callerToken = authHeader.slice(7).trim();
  const accepted = [serviceRoleKey, purgeSecret].filter(
    (candidate): candidate is string => typeof candidate === "string" && candidate.length > 0,
  );
  const authorized = accepted.some((candidate) => secureEquals(callerToken, candidate));

  if (!authorized) {
    // Never echo the presented token or the expected secret.
    console.warn("[purge-test-leads] Rejected call with invalid bearer token.");
    return jsonResponse({ error: "Forbidden: invalid token" }, 403);
  }

  // ── Purge with service role (bypasses the RLS lockdown that blocks anon DELETE) ──
  const svc = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const purged: Record<string, number> = {};

  try {
    for (const table of TARGET_TABLES) {
      const key = RESULT_KEYS[table];

      const { data, error } = await svc
        .from(table)
        .delete()
        .like("company_name", `${TEST_LEAD_PREFIX}%`)
        .select("id");

      if (error) {
        console.error(`[purge-test-leads] Delete failed on ${table}:`, error.message);
        return jsonResponse(
          { ok: false, error: `Failed to purge ${key}`, details: error.message, purged },
          500,
        );
      }

      purged[key] = data?.length ?? 0;
    }

    const total = Object.values(purged).reduce((sum, n) => sum + n, 0);
    console.log(`[purge-test-leads] Purged ${total} test row(s):`, purged);

    // Idempotent: zero rows to purge is a normal, successful outcome.
    return jsonResponse({ ok: true, purged }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[purge-test-leads] Fatal error:", message, err);
    return jsonResponse({ ok: false, error: "Internal error", details: message }, 500);
  }
});
