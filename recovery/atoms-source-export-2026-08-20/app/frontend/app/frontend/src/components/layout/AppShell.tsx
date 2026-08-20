import { ReactNode, useState, useMemo } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  GraduationCap,
  Wrench,
  Briefcase,
  Users,
  Building2,
  UserCircle2,
  ShieldCheck,
  LogOut,
  Menu,
  X,
  Search,
  ClipboardList,
  FileText,
  Eye,
  ChevronDown,
  MessageSquare,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { isNavVisible, getRoleLabel, PREVIEW_ROLE_OPTIONS } from '@/lib/roles';
import { useAdminPreview } from '@/contexts/AdminPreviewContext';
import { LanguageSelector } from '@/components/LanguageSelector';
import { NotificationsBell } from '@/components/NotificationsBell';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { PipingBoxLogo } from '@/components/PipingBoxLogo';

/**
 * Navigation items.
 * Per brand guidelines the labels Academy / Tools / Jobs / Community /
 * Companies / Profile / CV are module names that must NOT be translated.
 * Only the Dashboard entry uses a translated label; the i18n key for every
 * other item is kept purely for potential future use and currently falls
 * back to its English module name in every locale.
 */
const NAV_ITEMS = [
  // Worker / Moderator items
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, i18nKey: 'nav.dashboard' },
  { to: '/academy', label: 'Academy', icon: GraduationCap, i18nKey: 'nav.academy' },
  { to: '/tools', label: 'Tools', icon: Wrench, i18nKey: 'nav.tools' },
  { to: '/jobs', label: 'Jobs', icon: Briefcase, i18nKey: 'nav.jobs' },
  { to: '/community', label: 'Community', icon: Users, i18nKey: 'nav.community' },
  { to: '/companies', label: 'Companies', icon: Building2, i18nKey: 'nav.companies' },
  { to: '/applications', label: 'My Applications', icon: ClipboardList, i18nKey: 'nav.applications' },
  { to: '/messages', label: 'Messages', icon: MessageSquare, i18nKey: 'nav.messages' },
  { to: '/content-drafts', label: 'Content Drafts', icon: FileText, i18nKey: 'nav.contentDrafts' },
  // Company-specific items
  { to: '/company-dashboard', label: 'Company Dashboard', icon: LayoutDashboard, i18nKey: 'nav.companyDashboard' },
  { to: '/company/jobs', label: 'Jobs Management', icon: Briefcase, i18nKey: 'nav.companyJobs' },
  { to: '/company/post-job', label: 'Post Job', icon: ClipboardList, i18nKey: 'nav.companyPostJob' },
  { to: '/company/candidates', label: 'Candidates', icon: Users, i18nKey: 'nav.companyCandidates' },
  { to: '/company/workers-search', label: 'Worker Search', icon: Search, i18nKey: 'nav.companyWorkersSearch' },
  { to: '/company/workforce-requests', label: 'Workforce Requests', icon: Building2, i18nKey: 'nav.companyWorkforceRequests' },
  { to: '/company/profile', label: 'Company Profile', icon: Building2, i18nKey: 'nav.companyProfile' },
  { to: '/company/analytics', label: 'Analytics', icon: Eye, i18nKey: 'nav.companyAnalytics' },
  // Shared
  { to: '/profile', label: 'Profile / CV', icon: UserCircle2, i18nKey: 'nav.profile' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const { t } = useTranslation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [previewDropdownOpen, setPreviewDropdownOpen] = useState(false);
  const navigate = useNavigate();
  const { effectiveRole, isRealAdmin, isPreviewMode, setPreviewRole } = useAdminPreview();
  const { unreadCount } = useUnreadMessages();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  // Use effective role (preview role if admin is previewing, real role otherwise)
  const displayRole = effectiveRole;
  const showAdminNav = isRealAdmin && !isPreviewMode;

  // Filter nav items based on effective role for preview
  const visibleNavItems = useMemo(() => {
    return NAV_ITEMS.filter((item) => isNavVisible(effectiveRole, item.to));
  }, [effectiveRole]);

  // Get current preview label
  const currentPreviewLabel = useMemo(() => {
    if (!isPreviewMode) return 'Admin View';
    const option = PREVIEW_ROLE_OPTIONS.find(
      (o) => o.value === effectiveRole
    );
    return option?.label || 'Admin View';
  }, [isPreviewMode, effectiveRole]);

  return (
    <div className="min-h-screen max-w-full overflow-x-hidden bg-[#0a0a0a] text-zinc-100">
      {/* Preview mode banner */}
      {isPreviewMode && (
        <div className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-center gap-3 bg-amber-600/90 px-4 py-1.5 text-xs font-semibold text-black backdrop-blur">
          <Eye className="h-3.5 w-3.5" />
          <span>PREVIEW MODE — Viewing as: {currentPreviewLabel}</span>
          <button
            onClick={() => setPreviewRole(null)}
            className="ml-2 rounded bg-black/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black hover:bg-black/30 transition"
          >
            Exit Preview
          </button>
        </div>
      )}

      {/* Sidebar - desktop */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-zinc-800/80 bg-[#0d0d0d] lg:flex',
          isPreviewMode && 'top-8'
        )}
      >
        <div className="flex h-16 items-center gap-3 border-b border-zinc-800/80 px-6">
          <PipingBoxLogo variant="icon" size={32} className="rounded-sm" />
          <div>
            <p className="text-sm font-semibold tracking-wider">PIPINGBOX</p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              {t('nav.tagline')}
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
            {t('nav.workspace')}
          </p>
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium transition',
                  isActive
                    ? 'bg-[#f59e0b]/10 text-[#f59e0b] border-l-2 border-[#f59e0b]'
                    : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100',
                )
              }
            >
              <item.icon className="h-4 w-4" />
              <span className="flex-1">{t(item.i18nKey, { defaultValue: item.label })}</span>
              {item.to === '/messages' && unreadCount > 0 && (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-600 px-1.5 text-[10px] font-bold text-black">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </NavLink>
          ))}

          {showAdminNav && (
            <>
              <p className="mt-4 px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                {t('nav.system')}
              </p>
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  cn(
                    'group flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium transition',
                    isActive
                      ? 'bg-[#f59e0b]/10 text-[#f59e0b] border-l-2 border-[#f59e0b]'
                      : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100',
                  )
                }
              >
                <ShieldCheck className="h-4 w-4" />
                {t('nav.admin')}
              </NavLink>
            </>
          )}
        </nav>

        {/* Admin Preview Switcher + Role badge + sign out */}
        <div className="border-t border-zinc-800/80 p-3 space-y-2">
          {/* Admin "View As" Switcher */}
          {isRealAdmin && (
            <div className="relative px-1 mb-2">
              <button
                onClick={() => setPreviewDropdownOpen(!previewDropdownOpen)}
                className="flex w-full items-center justify-between gap-2 rounded-sm border border-zinc-700/60 bg-zinc-900/80 px-3 py-2 text-xs font-medium text-zinc-300 hover:border-[#f59e0b]/40 hover:text-zinc-100 transition"
              >
                <div className="flex items-center gap-2">
                  <Eye className="h-3.5 w-3.5 text-[#f59e0b]" />
                  <span>{currentPreviewLabel}</span>
                </div>
                <ChevronDown
                  className={cn(
                    'h-3.5 w-3.5 text-zinc-500 transition-transform',
                    previewDropdownOpen && 'rotate-180'
                  )}
                />
              </button>
              {previewDropdownOpen && (
                <div className="absolute bottom-full left-1 right-1 mb-1 rounded-sm border border-zinc-700/80 bg-[#111] shadow-xl overflow-hidden z-50">
                  <p className="px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-zinc-500 border-b border-zinc-800/60">
                    View As
                  </p>
                  {PREVIEW_ROLE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setPreviewRole(option.value);
                        setPreviewDropdownOpen(false);
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-2 text-xs transition',
                        ((!isPreviewMode && option.value === 'admin') ||
                          (isPreviewMode && effectiveRole === option.value))
                          ? 'bg-[#f59e0b]/10 text-[#f59e0b] font-medium'
                          : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Role badge */}
          <div className="flex items-center gap-2 px-3 py-1.5">
            <div
              className={cn(
                'flex h-5 w-5 items-center justify-center rounded-full border',
                isPreviewMode
                  ? 'bg-amber-500/10 border-amber-500/30'
                  : 'bg-[#f59e0b]/10 border-[#f59e0b]/20'
              )}
            >
              <span
                className={cn(
                  'text-[8px] font-bold',
                  isPreviewMode ? 'text-amber-400' : 'text-[#f59e0b]'
                )}
              >
                {(displayRole === 'user' ? 'W' : displayRole.charAt(0)).toUpperCase()}
              </span>
            </div>
            <span
              className={cn(
                'text-[10px] uppercase tracking-[0.15em] font-medium',
                isPreviewMode ? 'text-amber-400/70' : 'text-zinc-500'
              )}
            >
              {getRoleLabel(displayRole)}
            </span>
            {isPreviewMode && (
              <span className="text-[8px] uppercase tracking-wider text-amber-500/60 ml-1">
                (preview)
              </span>
            )}
          </div>

          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-sm text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-100"
          >
            <LogOut className="h-4 w-4" />
            {t('common.signOut')}
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 bg-[#0d0d0d] border-r border-zinc-800/80 flex flex-col">
            <div className="flex h-16 items-center justify-between border-b border-zinc-800/80 px-5">
              <div className="flex items-center gap-3">
                <PipingBoxLogo variant="icon" size={32} className="rounded-sm" />
                <span className="text-sm font-semibold tracking-wider">PIPINGBOX</span>
              </div>
              <button onClick={() => setMobileOpen(false)} className="text-zinc-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
              {visibleNavItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium transition',
                      isActive
                        ? 'bg-[#f59e0b]/10 text-[#f59e0b]'
                        : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100',
                    )
                  }
                >
                  <item.icon className="h-4 w-4" />
                  <span className="flex-1">{t(item.i18nKey, { defaultValue: item.label })}</span>
                  {item.to === '/messages' && unreadCount > 0 && (
                    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-600 px-1.5 text-[10px] font-bold text-black">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </NavLink>
              ))}
              {showAdminNav && (
                <NavLink
                  to="/admin"
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium transition',
                      isActive
                        ? 'bg-[#f59e0b]/10 text-[#f59e0b]'
                        : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100',
                    )
                  }
                >
                  <ShieldCheck className="h-4 w-4" />
                  {t('nav.admin')}
                </NavLink>
              )}
            </nav>
            <div className="border-t border-zinc-800/80 p-3 space-y-2">
              {/* Mobile Admin Preview Switcher */}
              {isRealAdmin && (
                <div className="px-1 mb-2">
                  <select
                    value={isPreviewMode ? effectiveRole : 'admin'}
                    onChange={(e) => setPreviewRole(e.target.value as any)}
                    className="w-full rounded-sm border border-zinc-700/60 bg-zinc-900/80 px-3 py-2 text-xs font-medium text-zinc-300 outline-none focus:border-[#f59e0b]/40"
                  >
                    {PREVIEW_ROLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center gap-2 px-3 py-1.5">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#f59e0b]/10 border border-[#f59e0b]/20">
                  <span className="text-[8px] font-bold text-[#f59e0b]">
                    {(displayRole === 'user' ? 'W' : displayRole.charAt(0)).toUpperCase()}
                  </span>
                </div>
                <span className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-medium">
                  {getRoleLabel(displayRole)}
                </span>
                {isPreviewMode && (
                  <span className="text-[8px] uppercase tracking-wider text-amber-500/60 ml-1">
                    (preview)
                  </span>
                )}
              </div>
              <button
                onClick={handleSignOut}
                className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
              >
                <LogOut className="h-4 w-4" />
                {t('common.signOut')}
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main */}
      <div className={cn('lg:pl-64 min-w-0 max-w-full overflow-x-hidden', isPreviewMode && 'pt-8')}>
        {/* Top nav */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-zinc-800/80 bg-[#0a0a0a]/90 px-3 backdrop-blur sm:gap-3 sm:px-4 lg:px-8">
          <button
            onClick={() => setMobileOpen(true)}
            className="shrink-0 rounded-sm p-2 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-sm border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-400 sm:px-3 md:max-w-[320px] md:flex-none">
            <Search className="h-4 w-4 shrink-0" />
            <input
              placeholder={t('nav.searchPlaceholder')}
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-zinc-600 max-w-[120px] sm:max-w-none"
            />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <LanguageSelector />
            <NotificationsBell />
            <Link
              to="/profile"
              className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-[#f59e0b] hover:text-[#f59e0b] transition sm:h-9 sm:w-9"
              aria-label={t('nav.profile')}
            >
              {profile?.avatar_url && profile?.show_avatar !== false ? (
                <img
                  src={profile.avatar_url}
                  alt="avatar"
                  className="h-full w-full object-cover"
                />
              ) : (
                <UserCircle2 className="h-5 w-5" />
              )}
            </Link>
          </div>
        </header>

        <main className="min-w-0 overflow-x-hidden p-3 sm:p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}