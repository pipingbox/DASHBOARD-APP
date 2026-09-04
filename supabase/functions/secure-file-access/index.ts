// Edge Function: secure-file-access
// Purpose: Broker signed URLs for CV, documents and certifications.
//
// PB-STORAGE-SECURITY-001
//
// Security:
//   - Authenticates the caller via JWT (no anon access).
//   - Owner always has access to their own files.
//   - Admin/jobs_moderator have access.
//   - Company access is granted ONLY when the candidate applied to a job
//     owned by the company, AND the file is explicitly visible.
//   - Uses service_role to create short-lived signed URLs; the key never
//     leaves the Edge Function.
//   - Never returns raw legacy public URLs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SIGNED_URL_EXPIRY_SECONDS = 60 * 60; // 1 hour

interface AccessRequest {
  owner_user_id: string;
  file_type: "cv" | "document" | "certification";
  record_id?: string;
}

function errorResponse(status: number, message: string) {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return errorResponse(401, "Unauthorized");
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (userError || !user) {
    return errorResponse(401, "Unauthorized");
  }

  let body: AccessRequest = { owner_user_id: "", file_type: "cv" };
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  const { owner_user_id, file_type, record_id } = body;
  if (!owner_user_id || !["cv", "document", "certification"].includes(file_type)) {
    return errorResponse(400, "Missing or invalid owner_user_id/file_type");
  }

  const viewerUserId = user.id;

  // Fetch viewer profile for role.
  const { data: viewerProfile, error: viewerProfileError } = await supabase
    .from("app_14da0f1941_profiles")
    .select("role")
    .eq("user_id", viewerUserId)
    .single();

  if (viewerProfileError) {
    console.error("[secure-file-access] viewer profile error:", viewerProfileError.message);
    return errorResponse(500, "Failed to verify viewer");
  }

  const viewerRole = viewerProfile?.role || "worker";
  const isOwner = viewerUserId === owner_user_id;
  const isPrivileged = viewerRole === "admin" || viewerRole === "jobs_moderator";

  let bucket: string | null = null;
  let path: string | null = null;

  try {
    if (file_type === "cv") {
      const { data: profile, error } = await supabase
        .from("app_14da0f1941_profiles")
        .select("cv_storage_bucket, cv_storage_path, cv_file_url, cv_visible")
        .eq("user_id", owner_user_id)
        .single();

      if (error || !profile) {
        return errorResponse(404, "Profile not found");
      }

      if (!isOwner && !isPrivileged && !profile.cv_visible) {
        return errorResponse(403, "CV not visible to companies");
      }

      ({ bucket, path } = resolveBucketAndPath(profile.cv_storage_bucket, profile.cv_storage_path, profile.cv_file_url));
    } else if (file_type === "document") {
      if (!record_id) {
        return errorResponse(400, "record_id required for documents");
      }

      const { data: doc, error } = await supabase
        .from("app_worker_documents")
        .select("storage_bucket, storage_path, file_url, is_visible")
        .eq("id", record_id)
        .eq("user_id", owner_user_id)
        .single();

      if (error || !doc) {
        return errorResponse(404, "Document not found");
      }

      if (!isOwner && !isPrivileged && !doc.is_visible) {
        return errorResponse(403, "Document not visible to companies");
      }

      ({ bucket, path } = resolveBucketAndPath(doc.storage_bucket, doc.storage_path, doc.file_url));
    } else if (file_type === "certification") {
      if (!record_id) {
        return errorResponse(400, "record_id required for certifications");
      }

      const { data: cert, error } = await supabase
        .from("app_worker_certifications")
        .select("storage_bucket, storage_path, certificate_file_url, file_url, is_visible, visible_to_companies")
        .eq("id", record_id)
        .eq("user_id", owner_user_id)
        .single();

      if (error || !cert) {
        return errorResponse(404, "Certification not found");
      }

      const visible = cert.is_visible || cert.visible_to_companies;
      if (!isOwner && !isPrivileged && !visible) {
        return errorResponse(403, "Certification not visible to companies");
      }

      const sourceUrl = cert.certificate_file_url || cert.file_url;
      ({ bucket, path } = resolveBucketAndPath(cert.storage_bucket, cert.storage_path, sourceUrl));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[secure-file-access] resolution error:", message);
    return errorResponse(500, "Failed to resolve file");
  }

  if (!bucket || !path) {
    return errorResponse(404, "File location not available");
  }

  // Company access requires an explicit relationship to the candidate.
  if (!isOwner && !isPrivileged && viewerRole === "company") {
    const allowed = await isCompanyAuthorized(supabase, viewerUserId, owner_user_id);
    if (!allowed) {
      return errorResponse(403, "Company not authorized to access this candidate");
    }
  }

  const { data: signedData, error: signedError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS);

  if (signedError || !signedData?.signedUrl) {
    console.error("[secure-file-access] signed url error:", signedError?.message);
    return errorResponse(500, "Failed to create signed URL");
  }

  return new Response(
    JSON.stringify({ signedUrl: signedData.signedUrl, expiresIn: SIGNED_URL_EXPIRY_SECONDS }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

function resolveBucketAndPath(
  storageBucket: string | null,
  storagePath: string | null,
  legacyUrl: string | null,
): { bucket: string | null; path: string | null } {
  if (storageBucket && storagePath) {
    return { bucket: storageBucket, path: storagePath };
  }

  if (!legacyUrl) {
    return { bucket: null, path: null };
  }

  const publicMatch = legacyUrl.match(/\/object\/public\/([^/]+)\/(.+?)(?:\?|$)/);
  if (publicMatch) {
    return { bucket: publicMatch[1], path: publicMatch[2] };
  }

  const signedMatch = legacyUrl.match(/\/object\/sign\/([^/]+)\/(.+?)(?:\?|$)/);
  if (signedMatch) {
    return { bucket: signedMatch[1], path: signedMatch[2] };
  }

  return { bucket: null, path: null };
}

async function isCompanyAuthorized(
  supabase: ReturnType<typeof createClient>,
  companyUserId: string,
  candidateUserId: string,
): Promise<boolean> {
  // Direct application to a job owned by this company user.
  const { data: directApps } = await supabase
    .from("app_14da0f1941_job_applications")
    .select("id")
    .eq("user_id", candidateUserId)
    .eq("company_user_id", companyUserId)
    .limit(1);

  if (directApps && directApps.length > 0) return true;

  // Application to any job posted by this company user.
  const { data: companyJobs } = await supabase
    .from("app_14da0f1941_jobs")
    .select("id")
    .eq("company_user_id", companyUserId);

  if (companyJobs && companyJobs.length > 0) {
    const jobIds = companyJobs.map((j: { id: string }) => j.id);
    const { data: jobApps } = await supabase
      .from("app_14da0f1941_job_applications")
      .select("id")
      .eq("user_id", candidateUserId)
      .in("job_id", jobIds)
      .limit(1);

    if (jobApps && jobApps.length > 0) return true;
  }

  // Workforce assignment relationship (company recruiter view).
  const { data: workforceAssignments } = await supabase
    .from("app_14da0f1941_workforce_assignments")
    .select("id")
    .eq("candidate_user_id", candidateUserId)
    .eq("company_user_id", companyUserId)
    .limit(1);

  if (workforceAssignments && workforceAssignments.length > 0) return true;

  return false;
}
