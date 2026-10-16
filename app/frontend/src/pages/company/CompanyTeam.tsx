/**
 * PB-CE-COMPANY-CORE-001 — Team page: members, invitations, role changes,
 * removals and ownership transfer. All mutations go through pb_company_* RPCs
 * that re-validate actor/company/role server-side; the permission checks here
 * are UX-only mirrors of the backend rules.
 */

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Copy, UserMinus, Crown, Mail } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { CompanyContextSwitcher } from '@/components/company/CompanyContextSwitcher';
import { useCompanyContexts } from '@/hooks/useCompanyContexts';
import {
  buildInviteLink,
  changeCompanyMemberRole,
  CompanyCoreRpcError,
  CompanyInvitation,
  CompanyMember,
  CompanyRole,
  fetchCompanyInvitations,
  fetchCompanyMembers,
  InvitableRole,
  inviteCompanyMember,
  removeCompanyMember,
  revokeCompanyInvitation,
  transferCompanyOwnership,
} from '@/lib/companyCore';

const ROLE_BADGE: Record<CompanyRole, string> = {
  owner: 'bg-[#f59e0b]/10 text-[#f59e0b]',
  admin: 'bg-sky-500/10 text-sky-400',
  recruiter: 'bg-emerald-500/10 text-emerald-400',
  viewer: 'bg-zinc-700/40 text-zinc-300',
};

const ALL_ROLES: CompanyRole[] = ['owner', 'admin', 'recruiter', 'viewer'];
const INVITABLE_ROLES: InvitableRole[] = ['admin', 'recruiter', 'viewer'];

export default function CompanyTeam() {
  const { t } = useTranslation();
  const { contexts, active } = useCompanyContexts();
  const [members, setMembers] = useState<CompanyMember[] | null>(null);
  const [invitations, setInvitations] = useState<CompanyInvitation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<InvitableRole>('recruiter');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const myRole = active?.role ?? null;
  const canManageTeam = myRole === 'owner' || myRole === 'admin';
  const isOwner = myRole === 'owner';

  const showError = useCallback(
    (err: unknown) => {
      const code = err instanceof CompanyCoreRpcError ? err.code : 'unknown';
      setError(t(`companyCore.errors.${code}`));
    },
    [t],
  );

  const reload = useCallback(async () => {
    if (!active) return;
    try {
      setError(null);
      const list = await fetchCompanyMembers(active.company_id);
      setMembers(list);
      if (canManageTeam) {
        setInvitations(await fetchCompanyInvitations(active.company_id));
      }
    } catch (err) {
      showError(err);
      setMembers([]);
    }
  }, [active, canManageTeam, showError]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (contexts !== null && contexts.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('companyCore.team.title')} />
        <p className="text-sm text-zinc-400">
          {t('companyCore.team.noCompany')}{' '}
          <Link to="/company/tenant" className="text-[#f59e0b] underline">
            {t('companyCore.team.createLink')}
          </Link>
        </p>
      </div>
    );
  }

  if (!active || members === null) {
    return <p className="text-sm text-zinc-400">{t('companyCore.loading')}</p>;
  }

  const handleInvite = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    setInviteLink(null);
    try {
      const result = await inviteCompanyMember(active.company_id, inviteEmail, inviteRole);
      if (result.alreadyPending) {
        setNotice(t('companyCore.invite.alreadyPending'));
      } else if (result.token) {
        setInviteLink(buildInviteLink(result.token));
        setNotice(t('companyCore.invite.created'));
      }
      setInviteEmail('');
      await reload();
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleRoleChange = async (member: CompanyMember, newRole: CompanyRole) => {
    setError(null);
    try {
      await changeCompanyMemberRole(active.company_id, member.membership_id, newRole);
      await reload();
    } catch (err) {
      showError(err);
    }
  };

  const handleRemove = async (member: CompanyMember) => {
    if (!window.confirm(t('companyCore.team.confirmRemove'))) return;
    setError(null);
    try {
      await removeCompanyMember(active.company_id, member.membership_id);
      await reload();
    } catch (err) {
      showError(err);
    }
  };

  const handleTransfer = async (member: CompanyMember) => {
    if (!window.confirm(t('companyCore.team.confirmTransfer'))) return;
    setError(null);
    try {
      await transferCompanyOwnership(active.company_id, member.membership_id);
      await reload();
    } catch (err) {
      showError(err);
    }
  };

  const handleRevoke = async (invitationId: string) => {
    setError(null);
    try {
      await revokeCompanyInvitation(active.company_id, invitationId);
      await reload();
    } catch (err) {
      showError(err);
    }
  };

  const copyLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setNotice(t('companyCore.invite.copied'));
    } catch {
      setNotice(inviteLink);
    }
  };

  /** UX mirror of backend rules; the RPCs enforce them authoritatively. */
  const roleOptionsFor = (member: CompanyMember): CompanyRole[] => {
    if (isOwner) return ALL_ROLES;
    if (myRole === 'admin' && member.role !== 'owner' && member.role !== 'admin') {
      return ['recruiter', 'viewer'];
    }
    return [member.role];
  };

  const canRemoveMember = (member: CompanyMember): boolean => {
    if (member.is_you) return true; // self-removal (leave) allowed; backend guards last owner
    if (isOwner) return true;
    if (myRole === 'admin') return member.role !== 'owner' && member.role !== 'admin';
    return false;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('companyCore.team.title')}
        description={t('companyCore.team.description', { company: active.company_name })}
        actions={
          contexts.length > 1 ? (
            <CompanyContextSwitcher contexts={contexts} active={active} />
          ) : undefined
        }
      />

      {error && <p className="text-sm text-red-400">{error}</p>}
      {notice && <p className="text-sm text-emerald-400">{notice}</p>}

      {/* ── Members ── */}
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/50">
        <h2 className="border-b border-zinc-800 px-4 py-3 text-sm font-semibold text-zinc-200">
          {t('companyCore.team.membersTitle')}
        </h2>
        <ul className="divide-y divide-zinc-800">
          {members.map((m) => (
            <li key={m.membership_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-zinc-200">
                  {m.full_name || t('companyCore.team.unnamedMember')}
                  {m.is_you && (
                    <span className="ml-2 text-xs text-zinc-500">({t('companyCore.team.you')})</span>
                  )}
                </p>
              </div>

              {canManageTeam && roleOptionsFor(m).length > 1 ? (
                <select
                  className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
                  value={m.role}
                  onChange={(e) => handleRoleChange(m, e.target.value as CompanyRole)}
                >
                  {roleOptionsFor(m).map((r) => (
                    <option key={r} value={r}>
                      {t(`companyCore.roles.${r}`)}
                    </option>
                  ))}
                </select>
              ) : (
                <span className={`rounded-full px-2 py-0.5 text-xs ${ROLE_BADGE[m.role]}`}>
                  {t(`companyCore.roles.${m.role}`)}
                </span>
              )}

              {isOwner && !m.is_you && m.role !== 'owner' && (
                <button
                  type="button"
                  title={t('companyCore.team.transferTitle')}
                  onClick={() => handleTransfer(m)}
                  className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-[#f59e0b]"
                >
                  <Crown className="h-4 w-4" />
                </button>
              )}

              {(canManageTeam || m.is_you) && canRemoveMember(m) && (
                <button
                  type="button"
                  title={m.is_you ? t('companyCore.team.leaveTitle') : t('companyCore.team.removeTitle')}
                  onClick={() => handleRemove(m)}
                  className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-red-400"
                >
                  <UserMinus className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* ── Invite ── */}
      {canManageTeam && (
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-200">
            <Mail className="h-4 w-4 text-[#f59e0b]" />
            {t('companyCore.invite.title')}
          </h2>
          <form onSubmit={handleInvite} className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1">
              <label className="mb-1 block text-xs text-zinc-400" htmlFor="invite-email">
                {t('companyCore.invite.emailLabel')}
              </label>
              <input
                id="invite-email"
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-400" htmlFor="invite-role">
                {t('companyCore.invite.roleLabel')}
              </label>
              <select
                id="invite-role"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as InvitableRole)}
                className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-zinc-200"
              >
                {INVITABLE_ROLES.filter((r) => isOwner || r !== 'admin').map((r) => (
                  <option key={r} value={r}>
                    {t(`companyCore.roles.${r}`)}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-[#f59e0b] px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50"
            >
              {busy ? t('companyCore.invite.submitting') : t('companyCore.invite.submit')}
            </button>
          </form>

          {inviteLink && (
            <div className="mt-3 flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2">
              <code className="min-w-0 flex-1 truncate text-xs text-zinc-300">{inviteLink}</code>
              <button
                type="button"
                onClick={copyLink}
                className="flex items-center gap-1 rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                <Copy className="h-3 w-3" />
                {t('companyCore.invite.copy')}
              </button>
            </div>
          )}
          <p className="mt-2 text-xs text-zinc-500">{t('companyCore.invite.emailNotice')}</p>
        </section>
      )}

      {/* ── Pending invitations ── */}
      {canManageTeam && invitations.length > 0 && (
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/50">
          <h2 className="border-b border-zinc-800 px-4 py-3 text-sm font-semibold text-zinc-200">
            {t('companyCore.invitations.title')}
          </h2>
          <ul className="divide-y divide-zinc-800">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-zinc-200">{inv.email_normalized}</p>
                  <p className="text-xs text-zinc-500">
                    {t(`companyCore.roles.${inv.role}`)} · {t(`companyCore.invitations.status.${inv.status}`)} ·{' '}
                    {t('companyCore.invitations.expires', {
                      date: new Date(inv.expires_at).toLocaleDateString(),
                    })}
                  </p>
                </div>
                {inv.status === 'pending' && (
                  <button
                    type="button"
                    onClick={() => handleRevoke(inv.id)}
                    className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-red-400"
                  >
                    {t('companyCore.invitations.revoke')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
