export interface Certification {
  id: string;
  user_id: string;
  name: string;
  issuer: string;
  credential_id: string | null;
  verification_url: string | null;
  qr_code_url: string | null;
  file_url: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  is_verified: boolean;
  verified_at: string | null;
  visibility?: 'public' | 'private';
  created_at: string;
  updated_at: string;
}

export interface CertificationInput {
  name: string;
  issuer: string;
  credential_id?: string | null;
  verification_url?: string | null;
  qr_code_url?: string | null;
  file_url?: string | null;
  issue_date?: string | null;
  expiry_date?: string | null;
}

export type ExpiryStatus = 'valid' | 'expiring_soon' | 'critical' | 'expired';

export interface ExpiryInfo {
  status: ExpiryStatus;
  daysRemaining: number | null;
  label: string;
  labelEs: string;
}

export function isCertExpired(cert: Certification): boolean {
  if (!cert.expiry_date) return false;
  return new Date(cert.expiry_date) < new Date();
}

/**
 * Calculate detailed expiry status based on days remaining.
 * - Valid: more than 90 days remaining
 * - Expiring soon: 90 days or less
 * - Critical: 30 days or less
 * - Expired: expiry date passed
 */
export function getExpiryInfo(cert: Certification): ExpiryInfo {
  if (!cert.expiry_date) {
    return { status: 'valid', daysRemaining: null, label: 'Valid', labelEs: 'Válido' };
  }

  const now = new Date();
  const expiryDate = new Date(cert.expiry_date);
  const diffMs = expiryDate.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (daysRemaining <= 0) {
    return { status: 'expired', daysRemaining, label: 'Expired', labelEs: 'Caducado' };
  }
  if (daysRemaining <= 30) {
    return { status: 'critical', daysRemaining, label: 'Critical', labelEs: 'Crítico' };
  }
  if (daysRemaining <= 90) {
    return { status: 'expiring_soon', daysRemaining, label: 'Expiring soon', labelEs: 'Próximo a caducar' };
  }
  return { status: 'valid', daysRemaining, label: 'Valid', labelEs: 'Válido' };
}

/**
 * Get alert message based on days remaining
 */
export function getAlertMessage(daysRemaining: number, lang: 'en' | 'es' = 'en'): string {
  if (daysRemaining <= 0) {
    return lang === 'es' ? 'Tu certificado ha caducado.' : 'Your certificate has expired.';
  }
  if (daysRemaining <= 30) {
    return lang === 'es'
      ? 'Tu certificado caducará en 1 mes.'
      : 'Your certificate will expire in 1 month.';
  }
  if (daysRemaining <= 60) {
    return lang === 'es'
      ? 'Tu certificado caducará en 2 meses.'
      : 'Your certificate will expire in 2 months.';
  }
  if (daysRemaining <= 90) {
    return lang === 'es'
      ? 'Tu certificado caducará en 3 meses.'
      : 'Your certificate will expire in 3 months.';
  }
  return '';
}

export function certStatusLabel(cert: Certification): {
  label: string;
  tone: 'valid' | 'expired' | 'verifiable' | 'pending' | 'expiring_soon' | 'critical';
} {
  const expiryInfo = getExpiryInfo(cert);

  if (expiryInfo.status === 'expired') return { label: 'Expired', tone: 'expired' };
  if (expiryInfo.status === 'critical') return { label: 'Critical', tone: 'critical' };
  if (expiryInfo.status === 'expiring_soon') return { label: 'Expiring soon', tone: 'expiring_soon' };
  if (cert.is_verified) return { label: 'Verified', tone: 'valid' };
  if (cert.verification_url) return { label: 'Verifiable', tone: 'verifiable' };
  return { label: 'Valid', tone: 'valid' };
}