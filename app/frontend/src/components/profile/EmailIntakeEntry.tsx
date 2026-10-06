/**
 * PB-DOCUMENT-INTAKE-001 — Entrega B: entrada del canal documental por correo.
 *
 * «¿No puedes subir el archivo? Envíalo por correo.» — solicita una referencia
 * temporal segura al backend y abre el cliente de correo con destinatario,
 * asunto con la referencia e instrucciones en el idioma del usuario.
 * Visible SOLO con el flag VITE_DOCUMENT_EMAIL_INTAKE (preview/TEST).
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, Loader2 } from 'lucide-react';
import {
  DOCUMENT_EMAIL_INTAKE_ENABLED,
  buildDocumentMailto,
  requestDocumentEmailReference,
  type EmailIntakeReference,
} from '@/lib/documentEmailIntake';

interface Props {
  documentType: 'certificate' | 'cv';
  /** testid base para los tests E2E/unitarios. */
  testId: string;
}

export function EmailIntakeEntry({ documentType, testId }: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [reference, setReference] = useState<EmailIntakeReference | null>(null);
  const [error, setError] = useState(false);

  if (!DOCUMENT_EMAIL_INTAKE_ENABLED) return null;

  const instructions = t('workerProfile.emailIntake.instructions', {
    defaultValue:
      'Envía el archivo como adjunto a la dirección indicada, sin cambiar el asunto. Formatos: PDF, PNG o JPG (máx. 10 MB). La referencia caduca en 72 horas y es de un solo uso. Tu documento será revisado antes de añadirse a tu perfil; nada se publica automáticamente.',
  });

  const handleClick = async () => {
    setLoading(true);
    setError(false);
    try {
      const ref = reference ?? (await requestDocumentEmailReference(documentType));
      setReference(ref);
      window.location.href = buildDocumentMailto({ address: ref.address, subject: ref.subject, body: instructions });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-3" data-testid={`${testId}-email-intake`}>
      <button
        type="button"
        data-testid={`${testId}-email-intake-link`}
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-2 hover:underline disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
        {t('workerProfile.emailIntake.link', '¿No puedes subir el archivo? Envíalo por correo.')}
      </button>
      {reference && (
        <p data-testid={`${testId}-email-intake-info`} className="mt-1 text-xs text-muted-foreground">
          {t('workerProfile.emailIntake.referenceReady', {
            defaultValue: 'Referencia creada. Revisa tu cliente de correo: el asunto ya incluye la referencia.',
          })}
        </p>
      )}
      {error && (
        <p data-testid={`${testId}-email-intake-error`} className="mt-1 text-xs text-destructive">
          {t('workerProfile.emailIntake.error', 'No se pudo preparar el envío por correo. Inténtalo de nuevo.')}
        </p>
      )}
    </div>
  );
}
