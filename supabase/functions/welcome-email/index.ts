// Edge Function: welcome-email
// PB-WELCOME-EMAIL-001 — Correo automático de bienvenida PIPINGBOX.
//
// Drena el outbox app_14da0f1941_welcome_emails (una fila por usuario, creada
// por el trigger de confirmación real de sql/046). Cada fila produce como
// máximo UN correo, garantizado por el claim atómico.
//
// Modos de invocación:
//   { }                         -> el usuario autenticado drena SU propia fila
//                                  (self-healing tras confirmar el email).
//   { user_id }                 -> sólo admin. Ops / reintentos puntuales.
//   { drain: "all", limit }     -> sólo admin. Vacía el lote pendiente.
//
// Autorización: un usuario normal NUNCA puede drenar la fila de otro. El rol se
// lee del perfil canónico con cliente service_role, no del token del cliente.
//
// Este endpoint no activa la feature ni encola nada por su cuenta: si el flag
// de sql/046 está desactivado no hay filas que drenar, así que responde vacío.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createServiceClient,
  drainWelcomeEmails,
  PROFILES_TABLE,
  WELCOME_DEFAULT_DRAIN_LIMIT,
} from "../_shared/welcome-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    if (!supabaseUrl || !anonKey) return json({ error: "missing_env" }, 500);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    const caller = userData?.user;
    if (userError || !caller) return json({ error: "unauthorized" }, 401);

    let body: { user_id?: string; drain?: string; limit?: number } = {};
    try {
      body = await req.json();
    } catch {
      // Body opcional: sin cuerpo, el usuario drena su propia fila.
    }

    const admin = createServiceClient();

    // Rol desde la fuente canónica (service_role), nunca desde el JWT.
    const { data: callerProfile } = await admin
      .from(PROFILES_TABLE)
      .select("role")
      .eq("user_id", caller.id)
      .maybeSingle();
    const isAdmin = callerProfile?.role === "admin";

    if (body.drain === "all") {
      if (!isAdmin) return json({ error: "forbidden" }, 403);
      const result = await drainWelcomeEmails(
        { supabase: admin },
        { limit: body.limit ?? WELCOME_DEFAULT_DRAIN_LIMIT },
      );
      return json({ ok: true, mode: "drain_all", ...result });
    }

    const targetUserId = body.user_id ?? caller.id;
    if (targetUserId !== caller.id && !isAdmin) {
      return json({ error: "forbidden" }, 403);
    }

    const result = await drainWelcomeEmails({ supabase: admin }, { userId: targetUserId });
    return json({ ok: true, mode: "single", ...result });
  } catch (err) {
    console.error("[welcome-email] unexpected error", err instanceof Error ? err.message : err);
    return json({ error: "internal_error" }, 500);
  }
});
