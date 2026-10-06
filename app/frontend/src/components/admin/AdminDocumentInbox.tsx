/**
 * PB-DOCUMENT-INTAKE-001 — Entrega B: bandeja administrativa
 * «Documentos recibidos» (Vía B, canal correo).
 *
 * Visible SOLO con VITE_DOCUMENT_EMAIL_INTAKE=true (preview/TEST). Lee a
 * través de la Edge Function document-email-admin (JWT + rol admin). Sin
 * exposición innecesaria: el sistema no persiste remitente, asunto ni
 * contenido — solo metadatos sanitizados.
 *
 * La acción «Promover al perfil» está DESHABILITADA por diseño en esta fase
 * (la función también la rechaza con 403).
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, RefreshCw, FileWarning } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { DOCUMENT_EMAIL_INTAKE_ENABLED } from '@/lib/documentEmailIntake';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface InboundMessageRow {
  id: string;
  provider: string;
  status: string;
  sender_match: 'match' | 'mismatch' | 'unknown';
  attachment_count: number;
  received_at: string;
  processed_at: string | null;
  error_category: string | null;
}

interface AttachmentDetail {
  id: string;
  document_type: string | null;
  detected_mime: string;
  declared_mime: string | null;
  size_bytes: number;
  malware_status: string;
  extraction_status: string;
  confidence: number | null;
  canonical_status: string;
  review_url: string | null;
}

const STATUS_BADGE: Record<string, string> = {
  RECEIVED: 'bg-sky-500/15 text-sky-400',
  QUARANTINED: 'bg-amber-500/15 text-amber-400',
  SCANNING: 'bg-amber-500/15 text-amber-400',
  EXTRACTION_PENDING: 'bg-violet-500/15 text-violet-400',
  NEEDS_REVIEW: 'bg-orange-500/15 text-orange-400',
  AWAITING_USER_CONFIRMATION: 'bg-emerald-500/15 text-emerald-400',
  REJECTED: 'bg-red-500/15 text-red-400',
  FAILED: 'bg-red-500/15 text-red-400',
  EXPIRED: 'bg-zinc-500/15 text-zinc-400',
};

export function AdminDocumentInbox() {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<InboundMessageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<InboundMessageRow | null>(null);
  const [attachments, setAttachments] = useState<AttachmentDetail[]>([]);
  const [actionBusy, setActionBusy] = useState(false);

  const callAdmin = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('document-email-admin', { body });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(String(data.error));
    return data;
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callAdmin({ op: 'list', limit: 50 });
      setMessages((data?.messages as InboundMessageRow[]) ?? []);
    } catch (err) {
      toast.error(t('admin.documentInbox.loadError', 'No se pudo cargar la bandeja documental.'));
      console.error('[AdminDocumentInbox]', err);
    } finally {
      setLoading(false);
    }
  }, [callAdmin, t]);

  useEffect(() => {
    if (DOCUMENT_EMAIL_INTAKE_ENABLED) void refresh();
  }, [refresh]);

  if (!DOCUMENT_EMAIL_INTAKE_ENABLED) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-6 text-sm text-zinc-500">
        {t('admin.documentInbox.disabled', 'La bandeja documental está desactivada en este entorno (VITE_DOCUMENT_EMAIL_INTAKE).')}
      </div>
    );
  }

  const openDetail = async (message: InboundMessageRow) => {
    setSelected(message);
    setAttachments([]);
    try {
      const data = await callAdmin({ op: 'detail', message_id: message.id });
      setAttachments((data?.attachments as AttachmentDetail[]) ?? []);
    } catch (err) {
      toast.error(t('admin.documentInbox.loadError', 'No se pudo cargar la bandeja documental.'));
      console.error('[AdminDocumentInbox detail]', err);
    }
  };

  const runAction = async (op: 'send_for_confirmation' | 'reject' | 'promote') => {
    if (!selected) return;
    setActionBusy(true);
    try {
      await callAdmin({ op, message_id: selected.id });
      toast.success(t('admin.documentInbox.actionDone', 'Acción aplicada.'));
      setSelected(null);
      setAttachments([]);
      await refresh();
    } catch (err) {
      toast.error(
        err instanceof Error && err.message.includes('promotion_disabled')
          ? t('admin.documentInbox.promotionDisabled', 'La promoción al perfil está desactivada en esta fase.')
          : t('admin.documentInbox.actionError', 'No se pudo aplicar la acción.'),
      );
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="admin-document-inbox">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-100">
          {t('admin.documentInbox.title', 'Documentos recibidos')}
        </h2>
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>

      {messages.length === 0 && !loading && (
        <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-6 text-sm text-zinc-500">
          <FileWarning className="h-4 w-4" />
          {t('admin.documentInbox.empty', 'No hay documentos recibidos por correo.')}
        </div>
      )}

      <div className="space-y-2">
        {messages.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => void openDetail(m)}
            data-testid={`admin-document-inbox-row-${m.id}`}
            className="flex w-full items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 text-left hover:border-zinc-700"
          >
            <div className="min-w-0">
              <p className="text-sm text-zinc-200">
                {new Date(m.received_at).toLocaleString()} · {m.provider} ·{' '}
                {t('admin.documentInbox.attachments', { count: m.attachment_count, defaultValue: '{{count}} adjuntos' })}
              </p>
              <p className="text-xs text-zinc-500">
                {t(`admin.documentInbox.senderMatch.${m.sender_match}`, m.sender_match)}
                {m.error_category ? ` · ${m.error_category}` : ''}
              </p>
            </div>
            <span
              data-testid={`admin-document-inbox-status-${m.id}`}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_BADGE[m.status] ?? 'bg-zinc-500/15 text-zinc-400'}`}
            >
              {m.status}
            </span>
          </button>
        ))}
      </div>

      {selected && (
        <div className="space-y-3 rounded-lg border border-zinc-700 bg-zinc-900 p-4" data-testid="admin-document-inbox-detail">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100">
              {t('admin.documentInbox.detail', 'Detalle del mensaje')}
            </h3>
            <button type="button" className="text-xs text-zinc-500 hover:text-zinc-300" onClick={() => setSelected(null)}>
              {t('common.close', 'Cerrar')}
            </button>
          </div>
          {attachments.map((a) => (
            <div key={a.id} className="rounded border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300" data-testid={`admin-document-inbox-attachment-${a.id}`}>
              <p>
                {a.detected_mime} · {(a.size_bytes / 1024).toFixed(0)} KB ·{' '}
                {t('admin.documentInbox.malware', 'Seguridad')}: {a.malware_status} ·{' '}
                {t('admin.documentInbox.extraction', 'Extracción')}: {a.extraction_status}
              </p>
              {a.review_url && (
                <a
                  href={a.review_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-primary underline"
                  data-testid={`admin-document-inbox-review-${a.id}`}
                >
                  {t('admin.documentInbox.reviewFile', 'Revisar archivo (enlace temporal)')}
                </a>
              )}
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-2">
            {selected.status === 'EXTRACTION_PENDING' && (
              <Button
                size="sm"
                onClick={() => void runAction('send_for_confirmation')}
                disabled={actionBusy}
                data-testid="admin-document-inbox-send-confirmation"
              >
                {t('admin.documentInbox.sendForConfirmation', 'Enviar al usuario para confirmación')}
              </Button>
            )}
            <Button
              size="sm"
              variant="destructive"
              onClick={() => void runAction('reject')}
              disabled={actionBusy}
              data-testid="admin-document-inbox-reject"
            >
              {t('admin.documentInbox.reject', 'Rechazar')}
            </Button>
            {/* Deshabilitado por diseño en la fase TEST (el backend también
                devuelve 403 promotion_disabled_test_phase). */}
            <Button size="sm" variant="outline" disabled title={t('admin.documentInbox.promotionDisabled', 'La promoción al perfil está desactivada en esta fase.')} data-testid="admin-document-inbox-promote">
              {t('admin.documentInbox.promote', 'Promover al perfil (desactivado)')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
