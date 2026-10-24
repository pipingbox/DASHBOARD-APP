/**
 * PB-CE-COMPANY-CORE-001 — Company tenant, memberships and team accounts.
 *
 * Typed client for the pb_company_* RPCs (sql/041). All mutations are
 * SECURITY DEFINER RPCs that validate actor/company/role server-side; the
 * frontend NEVER sends a company_id/role as an authorization claim — only as
 * a target selector. Direct table writes are revoked for `authenticated`.
 */

import { supabase } from '@/lib/supabase';
import { trackEvent } from '@/lib/observability';

export type CompanyRole = 'owner' | 'admin' | 'recruiter' | 'viewer';
export type InvitableRole = Exclude<CompanyRole, 'owner'>;

export interface CompanyContext {
  company_id: string;
  company_name: string;
  role: CompanyRole;
  verification_status: 'unverified' | 'pending' | 'verified' | 'rejected';
}

export interface CompanyMember {
  membership_id: string;
  user_id: string;
  full_name: string | null;
  role: CompanyRole;
  is_you: boolean;
  created_at: string;
}

export interface CompanyInvitation {
  id: string;
  company_id: string;
  email_normalized: string;
  role: InvitableRole;
  status: 'pending' | 'accepted' | 'rejected' | 'revoked' | 'expired';
  expires_at: string;
  created_at: string;
}

/** Maps backend error codes to stable UI codes (no backend text leaks). */
export type CompanyCoreError =
  | 'not_authenticated'
  | 'forbidden'
  | 'not_found'
  | 'invalid_name'
  | 'invalid_email'
  | 'invalid_role'
  | 'invalid_or_expired'
  | 'email_mismatch'
  | 'not_active'
  | 'last_owner'
  | 'cannot_transfer_to_self'
  | 'target_already_owner'
  | 'unknown';

function extractErrorCode(err: unknown): CompanyCoreError {
  const msg = String((err as { message?: string })?.message ?? err ?? '');
  const codes: CompanyCoreError[] = [
    'not_authenticated', 'forbidden', 'not_found', 'invalid_name', 'invalid_email',
    'invalid_role', 'invalid_or_expired', 'email_mismatch', 'not_active',
    'last_owner', 'cannot_transfer_to_self', 'target_already_owner',
  ];
  for (const code of codes) {
    if (msg.includes(code)) return code;
  }
  return 'unknown';
}

export class CompanyCoreRpcError extends Error {
  readonly code: CompanyCoreError;
  constructor(err: unknown) {
    super(extractErrorCode(err));
    this.name = 'CompanyCoreRpcError';
    this.code = extractErrorCode(err);
  }
}

/* ── Active company context (client-side selection; NOT an auth claim) ── */

const ACTIVE_COMPANY_KEY = 'pb_active_company_id';
const ACTIVE_COMPANY_EVENT = 'pb-active-company-changed';

export function getActiveCompanyId(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_COMPANY_KEY);
  } catch {
    return null;
  }
}

export function setActiveCompanyId(companyId: string): void {
  try {
    window.localStorage.setItem(ACTIVE_COMPANY_KEY, companyId);
    window.dispatchEvent(new CustomEvent(ACTIVE_COMPANY_EVENT));
  } catch {
    /* storage unavailable — selection is session-only */
  }
}

export function onActiveCompanyChange(listener: () => void): () => void {
  window.addEventListener(ACTIVE_COMPANY_EVENT, listener);
  return () => window.removeEventListener(ACTIVE_COMPANY_EVENT, listener);
}

/* ── RPCs ── */

/** Companies the actor belongs to (active memberships, active companies). */
export async function fetchMyCompanyContexts(): Promise<CompanyContext[]> {
  const { data, error } = await supabase.rpc('pb_company_my_context');
  if (error) throw new CompanyCoreRpcError(error);
  return (data ?? []) as CompanyContext[];
}

/** Select the active company context (UI-only; authorization stays in DB). */
export function selectCompanyContext(ctx: CompanyContext): void {
  setActiveCompanyId(ctx.company_id);
  trackEvent('company_context_selected', {
    company_id: ctx.company_id,
    role: ctx.role,
  });
}

/** Create a company; the creator becomes owner. Never verified by creation. */
export async function createCompany(name: string, country?: string): Promise<string> {
  const { data, error } = await supabase.rpc('pb_company_create', {
    p_name: name,
    p_country: country ?? null,
  });
  if (error) throw new CompanyCoreRpcError(error);
  const companyId = String(data);
  trackEvent('company_created', { company_id: companyId });
  return companyId;
}

export async function fetchCompanyMembers(companyId: string): Promise<CompanyMember[]> {
  // pb_company_members (SECURITY DEFINER) discloses teammates' full_name only
  // to active members of that company; profiles RLS is own-row only.
  const { data, error } = await supabase.rpc('pb_company_members', {
    p_company_id: companyId,
  });
  if (error) throw new CompanyCoreRpcError(error);
  return (data ?? []) as CompanyMember[];
}

export async function fetchCompanyInvitations(companyId: string): Promise<CompanyInvitation[]> {
  const { data, error } = await supabase
    .from('app_company_invitations')
    .select('id, company_id, email_normalized, role, status, expires_at, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (error) throw new CompanyCoreRpcError(error);
  return (data ?? []) as CompanyInvitation[];
}

export interface InviteResult {
  invitationId: string;
  /** Plain token, returned ONCE. Null when an invite is already pending. */
  token: string | null;
  alreadyPending: boolean;
}

export async function inviteCompanyMember(
  companyId: string,
  email: string,
  role: InvitableRole,
): Promise<InviteResult> {
  const { data, error } = await supabase.rpc('pb_company_invite', {
    p_company_id: companyId,
    p_email: email,
    p_role: role,
  });
  if (error) throw new CompanyCoreRpcError(error);
  const row = Array.isArray(data) ? data[0] : data;
  const result: InviteResult = {
    invitationId: String(row?.invitation_id ?? ''),
    token: (row?.token as string | null) ?? null,
    alreadyPending: Boolean(row?.already_pending),
  };
  if (!result.alreadyPending) {
    trackEvent('company_invite_sent', {
      company_id: companyId,
      invitation_id: result.invitationId,
      role,
    });
  }
  return result;
}

/** Absolute invite link for manual sharing (email delivery: later phase). */
export function buildInviteLink(token: string): string {
  return `${window.location.origin}/company-invite/${token}`;
}

export async function acceptCompanyInvitation(token: string): Promise<string> {
  const { data, error } = await supabase.rpc('pb_company_invitation_accept', {
    p_token: token,
  });
  if (error) throw new CompanyCoreRpcError(error);
  trackEvent('company_invite_accepted', { membership_id: String(data) });
  return String(data);
}

export async function rejectCompanyInvitation(token: string): Promise<void> {
  const { error } = await supabase.rpc('pb_company_invitation_reject', {
    p_token: token,
  });
  if (error) throw new CompanyCoreRpcError(error);
}

export async function revokeCompanyInvitation(
  companyId: string,
  invitationId: string,
): Promise<void> {
  const { error } = await supabase.rpc('pb_company_invitation_revoke', {
    p_invitation_id: invitationId,
  });
  if (error) throw new CompanyCoreRpcError(error);
  trackEvent('company_invite_revoked', { company_id: companyId, invitation_id: invitationId });
}

export async function changeCompanyMemberRole(
  companyId: string,
  membershipId: string,
  newRole: CompanyRole,
): Promise<void> {
  const { error } = await supabase.rpc('pb_company_member_change_role', {
    p_membership_id: membershipId,
    p_new_role: newRole,
  });
  if (error) throw new CompanyCoreRpcError(error);
  trackEvent('company_member_role_changed', {
    company_id: companyId,
    membership_id: membershipId,
    role: newRole,
  });
}

export async function removeCompanyMember(
  companyId: string,
  membershipId: string,
): Promise<void> {
  const { error } = await supabase.rpc('pb_company_member_remove', {
    p_membership_id: membershipId,
  });
  if (error) throw new CompanyCoreRpcError(error);
  trackEvent('company_member_removed', { company_id: companyId, membership_id: membershipId });
}

export async function transferCompanyOwnership(
  companyId: string,
  targetMembershipId: string,
): Promise<void> {
  const { error } = await supabase.rpc('pb_company_transfer_ownership', {
    p_company_id: companyId,
    p_target_membership_id: targetMembershipId,
  });
  if (error) throw new CompanyCoreRpcError(error);
  trackEvent('company_owner_transferred', {
    company_id: companyId,
    membership_id: targetMembershipId,
  });
}
