// Edge Function: secure-file-access
// Purpose: Broker signed URLs for CV, documents and certifications.
//
// PB-STORAGE-SECURITY-001
// PB-SEC-01 (PB-MARKETPLACE-V3-RECRUITMENT-001 TRACK B):
//   - Company actors NO LONGER receive the original CV during search and
//     shortlist (403 cv_original_not_available). The protected professional
//     profile (ficha) replaces it; original CV only after the candidate's
//     explicit acceptance (TRACK D, not yet built).
//   - Company deliveries of documents/certifications are PROXIED through this
//     function: no signed URL is ever issued to a company. A 15-minute URL is
//     not revocation; a proxied stream leaves no reusable link at all.
//   - Signed URLs for owner/admin drop from 1h to 15 minutes.
//   - Every grant and every denial is written to the append-only audit table
//     app_14da0f1941_file_access_log (RLS closed, service_role insert only).
//
// PB-SEC-01b (PO review P1a/P1b/P1c):
//   - P1a: a company account must be VERIFIED (company_verified=true and
//     company_status='verified') before any documental privilege; pending or
//     rejected companies are denied before any file resolution. Terminal
//     relationships (hired/rejected/withdrawn applications) are expired and
//     no longer grant access.
//   - P1b: deliveries are fail-closed on audit: if the access row cannot be
//     durably written, the file is NOT delivered (503 audit_unavailable).
//     Object paths are stored hashed (SHA-256) to keep filenames out of the
//     audit trail while preserving joinability.
//   - P1c: proxied responses carry the REAL content type (storage object
//     metadata via a backend-only RPC) and a neutral filename with the real
//     extension instead of a forced .pdf.
//
// PB-SEC-01c (PO RELEASE DECISION 002): operational kill-switch.
//   Setting SECURE_FILE_ACCESS_FAILSAFE=1 makes the broker fail-closed for
//   every non-owner, non-admin actor (companies included), while preserving
//   legitimate owner access, admin recovery and the append-only audit trail.
//   This is the safe contingency path: the previous vulnerable version of
//   this function is NEVER redeployed as a rollback.
//
// Security:
//   - Authenticates the caller via JWT (no anon access).
//   - Owner always has access to their own files.
//   - Admin/jobs_moderator have access.
//   - Company access requires a verified account, an active relationship to
//     the candidate and explicit visibility consent, and is served only by
//     proxy.
//   - Uses service_role to read storage; the key never leaves the function.
//   - Never returns raw legacy public URLs.
//   - Storage path integrity: bucket allowlist, object must exist, owner
//     must match owner_user_id, path must be inside the owner's namespace.
//
// Fail-closed: any role other than owner / admin / jobs_moderator / company
// is denied, and the final deny happens before any storage access.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correlation-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SIGNED_URL_EXPIRY_SECONDS = 15 * 60; // 15 minutes (PB-SEC-01)

const AUDIT_TABLE = "app_14da0f1941_file_access_log";

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

/**
 * Buckets accepted per file type. This is a defense-in-depth control, not the
 * primary one: an object is only signed after ownership, owner namespace,
 * visibility and relationship checks all pass. The allowlist exists so a
 * tampered `storage_bucket` cannot point the broker at an unrelated bucket.
 *
 * Documents accept two buckets by design. worker-documents is canonical and is
 * where every new document is written; app_14da0f1941_certificates is a
 * documented compatibility exception for the 16 historical documents that
 * predate the split. They are not relocated: moving them would require either
 * writing to storage.objects by hand or impersonating their owners, and both
 * were rejected. See acceptance criterion #11.
 *
 * Never widen this to an arbitrary bucket.
 */
const ALLOWED_BUCKETS: Record<string, readonly string[]> = {
  cv: ["app_14da0f1941_certificates"],
  certification: ["app_14da0f1941_certificates"],
  document: ["worker-documents", "app_14da0f1941_certificates"],
};

function errorResponse(status: number, message: string, reason?: string) {
  return new Response(
    JSON.stringify({ error: message, ...(reason ? { reason } : {}) }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

interface AuditEntry {
  actor_user_id: string;
  actor_role: string;
  owner_user_id: string;
  file_type: string;
  record_id?: string | null;
  bucket?: string | null;
  object_path?: string | null;
  decision: "granted" | "denied";
  reason: string;
  delivery?: "signed_url" | "proxy" | null;
  correlation_id: string;
}

/** SHA-256 hex of the object path: keeps filenames (which may embed personal
 * names) out of the audit trail while preserving exact joinability. */
async function hashObjectPath(path: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(path));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Append-only audit of every access decision. Returns true when the row was
 * durably written. Deliveries are fail-closed on this evidence: a grant that
 * cannot be recorded is NOT delivered (503 audit_unavailable). Denials are
 * already safe decisions, so a logging failure there is only reported.
 */
async function auditAccess(
  supabase: ReturnType<typeof createClient>,
  entry: AuditEntry,
): Promise<boolean> {
  try {
    const { error } = await supabase.from(AUDIT_TABLE).insert({
      actor_user_id: entry.actor_user_id,
      actor_role: entry.actor_role,
      owner_user_id: entry.owner_user_id,
      file_type: entry.file_type,
      record_id: entry.record_id ?? null,
      bucket: entry.bucket ?? null,
      object_path_hash: entry.object_path ? await hashObjectPath(entry.object_path) : null,
      decision: entry.decision,
      reason: entry.reason,
      delivery: entry.delivery ?? null,
      correlation_id: entry.correlation_id,
    });
    if (error) {
      console.error("[secure-file-access] audit insert failed:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error(
      "[secure-file-access] audit insert exception:",
      err instanceof Error ? err.message : String(err),
    );
    return false;
  }
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

  const correlationId = req.headers.get("x-correlation-id") ?? crypto.randomUUID();

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

  // Fetch viewer profile for role and (for companies) verification state.
  const { data: viewerProfile, error: viewerProfileError } = await supabase
    .from("app_14da0f1941_profiles")
    .select("role, company_verified, company_status")
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

  const auditBase = {
    actor_user_id: viewerUserId,
    actor_role: viewerRole,
    owner_user_id,
    file_type,
    record_id: record_id ?? null,
    correlation_id: correlationId,
  };

  const deny = async (reason: string, status: number, message: string) => {
    await auditAccess(supabase, { ...auditBase, decision: "denied", reason });
    return errorResponse(status, message, reason);
  };

  // Fall-closed: only owner, privileged or company may proceed.
  if (!isOwner && !isPrivileged && !isCompany) {
    return deny("role_not_allowed", 403, "Access denied");
  }

  // PB-SEC-01c: operational kill-switch (safe rollback contingency). With the
  // failsafe armed, every non-owner, non-privileged actor is denied BEFORE
  // any file resolution. Owner and admin access stay available so the
  // candidate keeps legitimate access to their own files and authorized
  // documents remain recoverable in a controlled way. The denial is audited
  // like any other decision; the audit table is never dropped.
  if (!isOwner && !isPrivileged && Deno.env.get("SECURE_FILE_ACCESS_FAILSAFE") === "1") {
    return deny("broker_failsafe_active", 403, "broker_failsafe_active");
  }

  // PB-SEC-01: companies never receive the original CV during search and
  // shortlist. The protected professional profile replaces it; access to the
  // original CV requires the candidate's explicit acceptance (TRACK D).
  if (isCompany && file_type === "cv") {
    return deny("cv_original_not_available", 403, "cv_original_not_available");
  }

  // PB-SEC-01b (P1a): no documental privilege for companies pending
  // verification. The gate runs before any file resolution so a pending or
  // rejected account learns nothing about the candidate's files.
  if (isCompany && !(viewerProfile.company_verified === true && viewerProfile.company_status === "verified")) {
    return deny("company_not_verified", 403, "company_not_verified");
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
    return deny("not_found", 404, "File not found");
  }

  // Company access requires an explicit relationship to the candidate and
  // explicit visibility consent.
  if (isCompany) {
    if (!fileRecord.visibleToCompany) {
      return deny("not_visible_to_companies", 403, "File not visible to companies");
    }
    let relation: CompanyRelation = "none";
    try {
      relation = await getCompanyRelation(supabase, viewerUserId, owner_user_id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[secure-file-access] company authorization error:", message);
      return deny("company_authorization_error", 403, "Company authorization failed");
    }
    if (relation === "expired") {
      return deny("relationship_expired", 403, "Company relationship expired");
    }
    if (relation !== "active") {
      return deny("cross_tenant", 403, "Company not authorized to access this candidate");
    }
  }

  // Final deny gate: never sign unless authorization was explicitly granted.
  if (!isOwner && !isPrivileged && !isCompany) {
    return deny("role_not_allowed", 403, "Access denied");
  }

  // Bucket allowlist and owner-namespace check before calling the backend RPC.
  const allowedBuckets = ALLOWED_BUCKETS[file_type];
  if (!allowedBuckets || !allowedBuckets.includes(fileRecord.bucket)) {
    return deny("bucket_not_allowed", 403, "Bucket not allowed for file type");
  }
  if (!fileRecord.path.startsWith(`${owner_user_id}/`)) {
    return deny("path_namespace_mismatch", 403, "Path does not belong to owner namespace");
  }

  // Storage path integrity: a backend-only RPC confirms the object exists and
  // is owned by the declared owner. We never trust client-editable metadata.
  const { data: ownershipOk, error: ownershipError } = await supabase.rpc(
    "pb_verify_storage_object_ownership",
    {
      p_bucket_name: fileRecord.bucket,
      p_path: fileRecord.path,
      p_owner_user_id: owner_user_id,
    },
  );

  if (ownershipError) {
    console.error(
      "[secure-file-access] ownership RPC returned error:",
      ownershipError.message,
    );
    return deny("ownership_verification_failed", 403, "Storage ownership verification failed");
  }

  if (ownershipOk !== true) {
    console.error(
      "[secure-file-access] ownership RPC denied:",
      file_type,
      fileRecord.bucket,
      fileRecord.path,
    );
    return deny("ownership_mismatch", 403, "Storage object not found or ownership mismatch");
  }

  // PB-SEC-01: company deliveries are proxied through this function. No
  // signed URL is issued to a company: a 15-minute URL is not revocation,
  // while a proxied stream leaves no reusable link, carries a neutral
  // filename and can be refused at any moment.
  if (isCompany) {
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(fileRecord.bucket)
      .download(fileRecord.path);

    if (downloadError || !fileData) {
      console.error("[secure-file-access] proxy download error:", downloadError?.message);
      await auditAccess(supabase, {
        ...auditBase,
        bucket: fileRecord.bucket,
        object_path: fileRecord.path,
        decision: "denied",
        reason: "proxy_download_failed",
      });
      return errorResponse(500, "Failed to retrieve file");
    }

    // P1b fail-closed: the delivery only happens after the access row is
    // durably written. Bytes fetched server-side are discarded on failure.
    const audited = await auditAccess(supabase, {
      ...auditBase,
      bucket: fileRecord.bucket,
      object_path: fileRecord.path,
      decision: "granted",
      reason: "company_authorized",
      delivery: "proxy",
    });
    if (!audited) {
      return errorResponse(503, "audit_unavailable");
    }

    // P1c: real content type from storage object metadata (backend-only RPC),
    // with an extension-map fallback; neutral filename carries the REAL
    // extension instead of a forced .pdf.
    const meta = await getStorageObjectMeta(supabase, fileRecord.bucket, fileRecord.path, owner_user_id);
    const contentType = meta?.mimetype || mimeFromExtension(fileRecord.path) || "application/octet-stream";
    const extension = extensionForMime(contentType) || extensionFromPath(fileRecord.path) || "bin";

    return new Response(fileData, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="pipingbox-${file_type}.${extension}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const { data: signedData, error: signedError } = await supabase.storage
    .from(fileRecord.bucket)
    .createSignedUrl(fileRecord.path, SIGNED_URL_EXPIRY_SECONDS);

  if (signedError || !signedData?.signedUrl) {
    console.error("[secure-file-access] signed url error:", signedError?.message);
    return errorResponse(500, "Failed to create signed URL");
  }

  // P1b fail-closed: no signed URL leaves this function without a durable
  // access row. A created-but-undelivered URL expires unused in 15 minutes.
  const audited = await auditAccess(supabase, {
    ...auditBase,
    bucket: fileRecord.bucket,
    object_path: fileRecord.path,
    decision: "granted",
    reason: isOwner ? "owner" : "privileged",
    delivery: "signed_url",
  });
  if (!audited) {
    return errorResponse(503, "audit_unavailable");
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

type CompanyRelation = "active" | "expired" | "none";

// Application statuses that end the company<->candidate relationship for
// document access purposes (same terminal set as sql/034).
const TERMINAL_APPLICATION_STATUSES: readonly string[] = ["hired", "rejected", "withdrawn"];

/**
 * PB-SEC-01b (P1a): tri-state relationship between a verified company account
 * and a candidate.
 *   - "active":  a live (non-terminal) application or workforce assignment.
 *   - "expired": relationships exist but ALL are terminal — distinguishable
 *     in the audit trail from a company that never had any relationship.
 *   - "none":    no relationship at all.
 *
 * Interim policy while per-document / per-company / scope / duration grants
 * do not exist: only "active" grants access, every decision is audited, and
 * every delivery is proxied.
 */
async function getCompanyRelation(
  supabase: ReturnType<typeof createClient>,
  companyUserId: string,
  candidateUserId: string,
): Promise<CompanyRelation> {
  let sawTerminal = false;

  // Direct application to a job owned by this company user.
  const { data: directApps } = await supabase
    .from("app_14da0f1941_job_applications")
    .select("status")
    .eq("user_id", candidateUserId)
    .eq("company_user_id", companyUserId);

  if (directApps && directApps.length > 0) {
    if (directApps.some((a: { status: string }) => !TERMINAL_APPLICATION_STATUSES.includes(a.status))) {
      return "active";
    }
    sawTerminal = true;
  }

  // Application to any job posted by this company user.
  const { data: companyJobs } = await supabase
    .from("app_14da0f1941_jobs")
    .select("id")
    .eq("company_user_id", companyUserId);

  if (companyJobs && companyJobs.length > 0) {
    const jobIds = companyJobs.map((j: { id: string }) => j.id);
    const { data: jobApps } = await supabase
      .from("app_14da0f1941_job_applications")
      .select("status")
      .eq("user_id", candidateUserId)
      .in("job_id", jobIds);

    if (jobApps && jobApps.length > 0) {
      if (jobApps.some((a: { status: string }) => !TERMINAL_APPLICATION_STATUSES.includes(a.status))) {
        return "active";
      }
      sawTerminal = true;
    }
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

    if (matchingRequests && matchingRequests.length > 0) return "active";
  }

  return sawTerminal ? "expired" : "none";
}

/** Backend-only RPC: real MIME of the storage object (service_role only). */
async function getStorageObjectMeta(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  path: string,
  ownerUserId: string,
): Promise<{ mimetype: string | null } | null> {
  const { data, error } = await supabase.rpc("pb_get_storage_object_meta", {
    p_bucket_name: bucket,
    p_path: path,
    p_owner_user_id: ownerUserId,
  });
  if (error) {
    console.error("[secure-file-access] object meta RPC error:", error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row ?? null;
}

const EXTENSION_MIME_MAP: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  txt: "text/plain",
};

const MIME_EXTENSION_MAP: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "text/plain": "txt",
};

function extensionFromPath(path: string): string | null {
  const match = path.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match && EXTENSION_MIME_MAP[match[1]] ? match[1] : null;
}

function mimeFromExtension(path: string): string | null {
  const ext = extensionFromPath(path);
  return ext ? EXTENSION_MIME_MAP[ext] : null;
}

function extensionForMime(mimetype: string): string | null {
  return MIME_EXTENSION_MAP[mimetype] ?? null;
}
