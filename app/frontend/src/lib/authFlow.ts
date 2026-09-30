export type AuthErrorCode = 'email_not_confirmed' | 'rate_limit' | 'generic';

export const CONFIRMATION_RESEND_COOLDOWN_SECONDS = 60;

interface AuthErrorLike {
  code?: string;
  message?: string;
  status?: number;
}

export function classifyAuthError(error: AuthErrorLike | string | null | undefined): AuthErrorCode | null {
  if (!error) return null;
  const code = typeof error === 'string' ? '' : (error.code ?? '').toLowerCase();
  const message = (typeof error === 'string' ? error : error.message ?? '').toLowerCase();
  const status = typeof error === 'string' ? undefined : error.status;

  if (
    code === 'email_not_confirmed' ||
    message.includes('email not confirmed') ||
    message.includes('email_not_confirmed')
  ) {
    return 'email_not_confirmed';
  }

  if (
    status === 429 ||
    code.includes('rate_limit') ||
    message.includes('rate limit') ||
    message.includes('too many requests')
  ) {
    return 'rate_limit';
  }

  return 'generic';
}

export function maskEmail(email: string): string {
  const separator = email.lastIndexOf('@');
  if (separator <= 0 || separator === email.length - 1) return '';
  return `${email[0]}***@${email.slice(separator + 1)}`;
}

export function isNewSignupIdentity(
  user:
    | { identities?: readonly unknown[] | null; created_at?: string | null }
    | null
    | undefined,
  now: number = Date.now(),
): boolean {
  if (!Array.isArray(user?.identities) || user.identities.length === 0) return false;
  const createdAt = Date.parse(user.created_at ?? '');
  if (!Number.isFinite(createdAt)) return false;
  return Math.abs(now - createdAt) <= 30_000;
}

export function safeAuthNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/dashboard';
  return value;
}