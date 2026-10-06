/**
 * PB-DOCUMENT-INTAKE-001 — Entrega B: adaptadores reales (SOLO Deno/Edge
 * Functions; los tests usan fakes en memoria sobre las mismas interfaces).
 * Cablea el núcleo puro de _shared/document-intake a Supabase (service role,
 * solo server-side) y a la API de Resend.
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  DownloadFailedError,
  OversizeAttachmentError,
  ProviderUnavailableError,
  type DbAdapter,
  type MessageRow,
  type ProviderAdapter,
  type ProviderAttachmentMeta,
  type ReferenceRow,
  type StorageAdapter,
} from './pipeline.ts';
import { DOC_INTAKE_LIMITS, type InboundErrorCategory, type MessageStatus } from './states.ts';
import type { DetectedMime } from './mimeSniff.ts';

const T_REFERENCES = 'app_14da0f1941_document_email_references';
const T_MESSAGES = 'app_14da0f1941_document_inbound_messages';
const T_ATTACHMENTS = 'app_14da0f1941_document_inbound_attachments';
const T_EXTRACTION = 'app_14da0f1941_document_extraction_fields';
const QUARANTINE_BUCKET = 'document-quarantine';

export function createServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export function createSupabaseDbAdapter(supabase: SupabaseClient): DbAdapter {
  return {
    async countRecentReferences(userId, sinceIso) {
      const { count, error } = await supabase
        .from(T_REFERENCES)
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', sinceIso);
      if (error) throw error;
      return count ?? 0;
    },
    async insertReference(row) {
      const { data, error } = await supabase
        .from(T_REFERENCES)
        .insert({ ...row, status: 'REFERENCE_CREATED' })
        .select('id')
        .single();
      if (error) throw error;
      return { id: data.id as string };
    },
    async findReferenceByHash(tokenHash) {
      const { data, error } = await supabase
        .from(T_REFERENCES)
        .select('*')
        .eq('token_hash', tokenHash)
        .maybeSingle();
      if (error) throw error;
      return (data as ReferenceRow | null) ?? null;
    },
    async getReference(id) {
      const { data, error } = await supabase
        .from(T_REFERENCES)
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return (data as ReferenceRow | null) ?? null;
    },
    async markReferenceConsumed(id, consumedAtIso) {
      const { error } = await supabase
        .from(T_REFERENCES)
        .update({ status: 'CONSUMED', consumed_at: consumedAtIso })
        .eq('id', id)
        .eq('status', 'REFERENCE_CREATED'); // consumo atómico e idempotente
      if (error) throw error;
    },
    async insertMessage(row) {
      const { data, error } = await supabase
        .from(T_MESSAGES)
        .insert(row)
        .select('id')
        .single();
      if (error) {
        if (error.code === '23505') return { id: '', conflict: true }; // unique_violation
        throw error;
      }
      return { id: data.id as string, conflict: false };
    },
    async getMessage(id) {
      const { data, error } = await supabase.from(T_MESSAGES).select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return (data as MessageRow | null) ?? null;
    },
    async updateMessage(id, patch) {
      const { error } = await supabase.from(T_MESSAGES).update(patch).eq('id', id);
      if (error) throw error;
    },
    async insertAttachment(row) {
      const { data, error } = await supabase
        .from(T_ATTACHMENTS)
        .insert(row)
        .select('id')
        .single();
      if (error) {
        if (error.code === '23505') return { id: '', conflict: true };
        throw error;
      }
      return { id: data.id as string, conflict: false };
    },
    async listAttachments(messageId) {
      const { data, error } = await supabase
        .from(T_ATTACHMENTS)
        .select('*')
        .eq('inbound_message_id', messageId);
      if (error) throw error;
      return data ?? [];
    },
    async insertExtractionFields(rows) {
      const { error } = await supabase.from(T_EXTRACTION).insert(rows);
      if (error && error.code !== '23505') throw error;
    },
    async getUserEmail(userId) {
      const { data, error } = await supabase.auth.admin.getUserById(userId);
      if (error) return null;
      return data?.user?.email ?? null;
    },
    async listMessages(filter: { status?: MessageStatus; limit: number }) {
      let query = supabase
        .from(T_MESSAGES)
        .select('*')
        .order('received_at', { ascending: false })
        .limit(filter.limit);
      if (filter.status) query = query.eq('status', filter.status);
      const { data, error } = await query;
      if (error) throw error;
      return (data as MessageRow[]) ?? [];
    },
    async updateExtractionField(id, patch) {
      const { error } = await supabase
        .from(T_EXTRACTION)
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
  };
}

export function createSupabaseStorageAdapter(supabase: SupabaseClient): StorageAdapter {
  return {
    async putQuarantine(objectKey, bytes, mime: DetectedMime) {
      const { error } = await supabase.storage
        .from(QUARANTINE_BUCKET)
        .upload(objectKey, bytes, { contentType: mime ?? 'application/octet-stream', upsert: false });
      if (error) throw error;
    },
    async createSignedQuarantineUrl(objectKey, expiresSeconds) {
      const { data, error } = await supabase.storage
        .from(QUARANTINE_BUCKET)
        .createSignedUrl(objectKey, Math.min(expiresSeconds, 60)); // corta duración, tope 60 s
      if (error) throw error;
      return data.signedUrl;
    },
  };
}

export function createResendAdapter(apiKey: string): ProviderAdapter {
  const base = 'https://api.resend.com';
  return {
    async listAttachments(providerMessageId): Promise<ProviderAttachmentMeta[]> {
      let res: Response;
      try {
        res = await fetch(`${base}/emails/receiving/${providerMessageId}/attachments`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
      } catch (err) {
        throw new ProviderUnavailableError(String(err));
      }
      if (res.status >= 500) throw new ProviderUnavailableError(`http_${res.status}`);
      if (!res.ok) throw new DownloadFailedError(`http_${res.status}`);
      const json = (await res.json()) as { data?: Record<string, unknown>[] };
      return (json.data ?? []).map((a) => ({
        id: String(a.id ?? ''),
        size: Number(a.size ?? 0),
        contentType: typeof a.content_type === 'string' ? a.content_type : null,
        downloadUrl: String(a.download_url ?? ''),
      }));
    },
    async download(downloadUrl, maxBytes) {
      let res: Response;
      try {
        res = await fetch(downloadUrl);
      } catch (err) {
        throw new DownloadFailedError(String(err));
      }
      if (!res.ok || !res.body) throw new DownloadFailedError(`http_${res.status}`);
      // Límite duro en streaming: aborta al superar maxBytes (defensa 2).
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new OversizeAttachmentError(`>${maxBytes}`);
        }
        chunks.push(value);
      }
      const out = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        out.set(c, offset);
        offset += c.byteLength;
      }
      return out;
    },
  };
}

export { DOC_INTAKE_LIMITS };
export type { InboundErrorCategory };
