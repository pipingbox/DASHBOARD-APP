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
//     owned by the company user, AND the file is explicitly visible.
//   - Uses service_role to create short-lived signed URLs; the key never
//     leaves the Edge Function.
//   - Never returns raw legacy public URLs.
//   - Storage path integrity: bucket allowlist, object must exist, owner
//     must match owner_user_id, path must be inside the owner's namespace.
//
// Fail-closed: any role other than owner / admin / jobs_moderator / company
// is denied, and the final deny happens before createSignedUrl().

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

interface FileRecord {
  bucket: string;
  path: string;
  visibleToCompany: boolean;
}

const EXPECTED_BUCKETS: Record<string, string> = {
  cv: "app_14da0f1941_certificates",
  document: "worker-documents",
  certification: "worker-documents",
};

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

  if (viewerProfileError || !viewerProfile) {
    console.error("[secure-file-access] viewer profile error:", viewerProfileError?.message);
    return errorResponse(403, "Failed to verify viewer");
  }

  const viewerRole = viewerProfile.role || "worker";
  const isOwner = viewerUserId === owner_user_id;
  const isPrivileged = viewerRole === "admin" || viewerRole === "jobs_moderator";
  const isCompany = viewerRole === "company";

  // Fall-closed: only owner, privileged or company may proceed.
  if (!isOwner && !isPrivileged && !isCompany) {
    return errorResponse(403, "Access denied");
  }

  let fileRecord: FileRecord | null = null;

  try {
    if (file_type === "cv") {
      fileRecord = await resolveCV(supabase, owner_user_id, isOwner || isPrivileged);
    } else if (file_type === "document") {
      if (!record_id) {
        return errorResponse(400, "record_id required for documents");
      }
      fileRecord = await resolveDocument(supabase, owner_user_id, record_id, isOwner || isPrivileged);
    } else if (file_type === "certification") {
      if (!record_id) {
        return errorResponse(400, "record_id required for certifications");
      }
      fileRecord = await resolveCertification(supabase, owner_user_id, record_id, isOwner || isPrivileged);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[secure-file-access] resolution error:", message);
    return errorResponse(500, "Failed to resolve file");
  }

  if (!fileRecord) {
    return errorResponse(404, "File not found");
  }

  // Company access requires an explicit relationship to the candidate and
  // explicit visibility consent.
  if (isCompany) {
    if (!fileRecord.visibleToCompany) {
      return errorResponse(403, "File not visible to companies");
    }
    let allowed = false;
    try {
      allowed = await isCompanyAuthorized(supabase, viewerUserId, owner_user_id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[secure-file-access] company authorization error:", message);
      return errorResponse(403, "Company authorization failed");
    }
    if (!allowed) {
      return errorResponse(403, "Company not authorized to access this candidate");
    }
  }

  // Final deny gate: never sign unless authorization was explicitly granted.
  if (!isOwner && !isPrivileged && !isCompany) {
    return errorResponse(403, "Access denied");
  }

  // Bucket allowlist and owner-namespace check before calling the backend RPC.
  const expectedBucket = EXPECTED_BUCKETS[file_type];
  if (!expectedBucket || fileRecord.bucket !== expectedBucket) {
    return errorResponse(403, "Bucket not allowed for file type");
  }
  if (!fileRecord.path.startsWith(`${owner_user_id}/`)) {
    return errorResponse(403, "Path does not belong to owner namespace");
  }

  // Storage path integrity: a backend-only RPC confirms the object exists and
  // is owned by the declared owner. We never trust client-editable metadata.
  let rpcResult: { data?: { result: boolean }; error?: any };
  try {
    rpcResult = await supabase.rpc("pb_verify_storage_object_ownership", {
      p_bucket_name: fileRecord.bucket,
      p_path: fileRecord.path,
      p_owner_user_id: owner_user_id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[secure-file-access] ownership RPC error:", message);
    return errorResponse(403, "Storage ownership verification failed");
  }

  if (rpcResult.error) {
    console.error("[secure-file-access] ownership RPC returned error:", rpcResult.error.message);
    return errorResponse(403, "Storage ownership verification failed");
  }

  if (rpcResult.data?.result !== true) {
    console.error("[secure-file-access] ownership RPC denied:", file_type, fileRecord.bucket, fileRecord.path);
    return errorResponse(403, "Storage object not found or ownership mismatch");
  }

  const { data: signedData, error: signedError } = await supabase.storage
    .from(fileRecord.bucket)
    .createSignedUrl(fileRecord.path, SIGNED_URL_EXPIRY_SECONDS);

  if (signedError || !signedData?.signedUrl) {
    console.error("[secure-file-access] signed url error:", signedError?.message);
    return errorResponse(500, "Failed to create signed URL");
  }

  return new Response(
    JSON.stringify({ signedUrl: signedData.signedUrl, expiresIn: SIGNED_URL_EXPIRY_SECONDS }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

async function resolveCV(
  supabase: ReturnType<typeof createClient>,
  owner_user_id: string,
  skipVisibilityCheck: boolean,
): Promise<FileRecord | null> {
  const { data: profile, error } = await supabase
    .from("app_14da0f1941_profiles")
    .select("cv_storage_bucket, cv_storage_path, cv_file_url, cv_visible")
    .eq("user_id", owner_user_id)
    .single();

  if (error || !profile) {
    return null;
  }

  const { bucket, path } = resolveBucketAndPath(profile.cv_storage_bucket, profile.cv_storage_path, profile.cv_file_url);
  if (!bucket || !path) {
    return null;
  }

  return {
    bucket,
    path,
    visibleToCompany: skipVisibilityCheck || Boolean(profile.cv_visible),
  };
}

async function resolveDocument(
  supabase: ReturnType<typeof createClient>,
  owner_user_id: string,
  record_id: string,
  skipVisibilityCheck: boolean,
): Promise<FileRecord | null> {
  const { data: doc, error } = await supabase
    .from("app_worker_documents")
    .select("storage_bucket, storage_path, file_url, is_visible")
    .eq("id", record_id)
    .eq("user_id", owner_user_id)
    .single();

  if (error || !doc) {
    return null;
  }

  const { bucket, path } = resolveBucketAndPath(doc.storage_bucket, doc.storage_path, doc.file_url);
  if (!bucket || !path) {
    return null;
  }

  return {
    bucket,
    path,
    visibleToCompany: skipVisibilityCheck || Boolean(doc.is_visible),
  };
}

async function resolveCertification(
  supabase: ReturnType<typeof createClient>,
  owner_user_id: string,
  record_id: string,
  skipVisibilityCheck: boolean,
): Promise<FileRecord | null> {
  const { data: cert, error } = await supabase
    .from("app_worker_certifications")
    .select("storage_bucket, storage_path, certificate_file_url, file_url, is_visible, visible_to_companies")
    .eq("id", record_id)
    .eq("user_id", owner_user_id)
    .single();

  if (error || !cert) {
    return null;
  }

  const sourceUrl = cert.certificate_file_url || cert.file_url;
  const { bucket, path } = resolveBucketAndPath(cert.storage_bucket, cert.storage_path, sourceUrl);
  if (!bucket || !path) {
    return null;
  }

  return {
    bucket,
    path,
    visibleToCompany: skipVisibilityCheck || Boolean(cert.is_visible || cert.visible_to_companies),
  };
}

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

async function verifyStorageIntegrity(
  supabase: ReturnType<typeof createClient>,
  file_type: string,
  owner_user_id: string,
  bucket: string,
  path: string,
): Promise<{ ok: boolean; message?: string }> {
  const expectedBucket = EXPECTED_BUCKETS[file_type];
  if (!expectedBucket || bucket !== expectedBucket) {
    return { ok: false, message: "Bucket not allowed for file type" };
  }

  // Path must live inside the owner's namespace.
  if (!path.startsWith(`${owner_user_id}/`)) {
    return { ok: false, message: "Path does not belong to owner namespace" };
  }

  const { data: bucketRow, error: bucketError } = await supabase
    .from("storage.buckets")
    .select("id")
    .eq("name", bucket)
    .single();

  if (bucketError || !bucketRow) {
    return { ok: false, message: "Bucket not found" };
  }

  const { data: objectRow, error: objectError } = await supabase
    .from("storage.objects")
    .select("id, owner")
    .eq("bucket_id", bucketRow.id)
    .eq("name", path)
    .single();

  if (objectError || !objectRow) {
    return { ok: false, message: "Storage object not found" };
  }

  if (objectRow.owner !== owner_user_id) {
    return { ok: false, message: "Storage object ownership mismatch" };
  }

  return { ok: true };
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
  // Production schema uses workforce_assignments(worker_id, request_id) and
  // workforce_requests(id, company_id). company_id is the user_id of the
  // company account that owns the request.
  const { data: workforceAssignments } = await supabase
    .from("app_14da0f1941_workforce_assignments")
    .select("request_id")
    .eq("worker_id", candidateUserId);

  if (workforceAssignments && workforceAssignments.length > 0) {
    const requestIds = workforceAssignments.map((wa: { request_id: string }) => wa.request_id);
    const { data: matchingRequests } = await supabase
      .from("app_14da0f1941_workforce_requests")
      .select("id")
      .in("id", requestIds)
      .eq("company_id", companyUserId)
      .limit(1);

    if (matchingRequests && matchingRequests.length > 0) return true;
  }

  return false;
}
