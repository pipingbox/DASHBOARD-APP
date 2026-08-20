import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, PATCH, OPTIONS",
};

const TABLE_NAME = "beta_feedback_reports";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Ensure table exists
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        user_id UUID,
        user_email TEXT,
        category TEXT NOT NULL DEFAULT 'other',
        description TEXT NOT NULL,
        screenshot_url TEXT,
        page_url TEXT,
        user_agent TEXT,
        screen_size TEXT,
        status TEXT NOT NULL DEFAULT 'new',
        priority TEXT NOT NULL DEFAULT 'medium'
      );
    `;
    await supabase.rpc("exec_sql", { sql: createTableSQL }).catch(() => {
      // rpc may not exist, table might already exist — continue
    });

    // POST — submit a new feedback report
    if (req.method === "POST") {
      const body = await req.json();
      const { user_id, user_email, category, description, screenshot_url, page_url, user_agent, screen_size } = body;

      if (!description || !description.trim()) {
        return new Response(
          JSON.stringify({ success: false, error: "Description is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data, error } = await supabase.from(TABLE_NAME).insert([{
        user_id: user_id || null,
        user_email: user_email || null,
        category: category || "other",
        description: description.trim(),
        screenshot_url: screenshot_url || null,
        page_url: page_url || null,
        user_agent: user_agent || null,
        screen_size: screen_size || null,
        status: "new",
        priority: "medium",
      }]).select();

      if (error) {
        console.error("[BETA_FEEDBACK] Insert error:", error);
        return new Response(
          JSON.stringify({ success: false, error: error.message, code: error.code }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data }),
        { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET — fetch all reports (admin)
    if (req.method === "GET") {
      const url = new URL(req.url);
      const statusFilter = url.searchParams.get("status");

      let query = supabase
        .from(TABLE_NAME)
        .select("*")
        .order("created_at", { ascending: false });

      if (statusFilter && statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;

      if (error) {
        console.error("[BETA_FEEDBACK] Fetch error:", error);
        // If table doesn't exist, return empty array
        if (error.code === "42P01") {
          return new Response(
            JSON.stringify({ success: true, data: [] }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ success: false, error: error.message, code: error.code }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data: data || [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // PATCH — update status/priority of a report (admin)
    if (req.method === "PATCH") {
      const body = await req.json();
      const { id, field, value } = body;

      if (!id || !field || !value) {
        return new Response(
          JSON.stringify({ success: false, error: "Missing id, field, or value" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!["status", "priority"].includes(field)) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid field. Only status and priority allowed." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error } = await supabase
        .from(TABLE_NAME)
        .update({ [field]: value })
        .eq("id", id);

      if (error) {
        console.error("[BETA_FEEDBACK] Update error:", error);
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[BETA_FEEDBACK] Unexpected error:", err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});