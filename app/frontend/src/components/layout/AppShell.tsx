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
  FolderOpen,
  BarChart3,
  Settings,
  CreditCard,
  ArrowLeftRight,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { isNavVisible, getRoleLabel, PREVIEW_ROLE_OPTIONS } from '@/lib/roles';
import { useAdminPreview } from '@/contexts/AdminPreviewContext';
import { LanguageSelector } from '@/components/LanguageSelector';
import { NotificationsBell } from '@/components/NotificationsBell';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { useAdminFeedbackCount } from '@/hooks/useAdminFeedbackCount';
import { PipingBoxLogo } from '@/components/PipingBoxLogo';
import { BetaFeedbackProvider } from '@/components/beta/BetaFeedbackProvider';

/**
 * Navigation items for WORKER / MODERATOR views.
 */
const WORKER_NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, i18nKey: 'nav.dashboard' },
  { to: '/academy', label: 'Academy', icon: GraduationCap, i18nKey: 'nav.academy' },
  { to: '/tools', label: 'Tools', icon: Wrench, i18nKey: 'nav.tools' },
  { to: '/jobs', label: 'Jobs', icon: Briefcase, i18nKey: 'nav.jobs' },
  { to: '/community', label: 'Community', icon: Users, i18nKey: 'nav.community' },
  { to: '/companies', label: 'Companies', icon: Building2, i18nKey: 'nav.companies' },
  { to: '/applications', label: 'My Applications', icon: ClipboardList, i18nKey: 'nav.applications' },
  { to: '/messages', label: 'Messages', icon: MessageSquare, i18nKey: 'nav.messages' },
  { to: '/content-drafts', label: 'Content Drafts', icon: FileText, i18nKey: 'nav.contentDrafts' },
  { to: '/profile', label: 'Profile / CV', icon: UserCircle2, i18nKey: 'nav.profile' },
];

/**
 * Company navigation — structured in two sections:
 * ENTORNO EMPRESA (workspace) + EMPRESA (company settings)
 */
const COMPANY_NAV_WORKSPACE = [
  { to: '/company-dashboard', label: 'Dashboard', icon: LayoutDashboard, i18nKey: 'nav.companyDashboard' },
  { to: '/company/jobs', label: 'Vacantes', icon: Briefcase, i18nKey: 'nav.companyJobs' },
  { to: '/company/candidates', label: 'Candidatos', icon: Users, i18nKey: 'nav.companyCandidates' },
  { to: '/company/workers-search', label: 'Buscar Trabajadores', icon: Search, i18nKey: 'nav.companyWorkersSearch' },
  { to: '/messages', label: 'Mensajes', icon: MessageSquare, i18nKey: 'nav.messages' },
  { to: '/company/documentation', label: 'Documentación', icon: FolderOpen, i18nKey: 'nav.companyDocumentation' },
  { to: '/company/workforce-requests', label: 'Solicitudes de Personal', icon: ClipboardList, i18nKey: 'nav.companyWorkforceRequests' },
  { to: '/company/analytics', label: 'Analítica', icon: BarChart3, i18nKey: 'nav.companyAnalytics' },
];

const COMPANY_NAV_SETTINGS = [
  { to: '/company/profile', label: 'Perfil de Empresa', icon: Building2, i18nKey: 'nav.companyProfile' },
  { to: '/company/settings', label: 'Configuración', icon: Settings, i18nKey: 'nav.companySettings' },
  { to: '/company/billing', label: 'Facturación / Planes', icon: CreditCard, i18nKey: 'nav.companyBilling' },
];

/**
 * Legacy flat NAV_ITEMS for admin view (sees everything).
 */
const NAV_ITEMS = [
  ...WORKER_NAV_ITEMS,
  { to: '/company-dashboard', label: 'Company Dashboard', icon: LayoutDashboard, i18nKey: 'nav.companyDashboard' },
  { to: '/company/jobs', label: 'Jobs Management', icon: Briefcase, i18nKey: 'nav.companyJobs' },
  { to: '/company/post-job', label: 'Post Job', icon: ClipboardList, i18nKey: 'nav.companyPostJob' },
  { to: '/company/candidates', label: 'Candidates', icon: Users, i18nKey: 'nav.companyCandidates' },
  { to: '/company/workers-search', label: 'Worker Search', icon: Search, i18nKey: 'nav.companyWorkersSearch' },
  { to: '/company/workforce-requests', label: 'Workforce Requests', icon: Building2, i18nKey: 'nav.companyWorkforceRequests' },
  { to: '/company/documentation', label: 'Documentation', icon: FolderOpen, i18nKey: 'nav.companyDocumentation' },
  { to: '/company/profile', label: 'Company Profile', icon: Building2, i18nKey: 'nav.companyProfile' },
  { to: '/company/analytics', label: 'Analytics', icon: BarChart3, i18nKey: 'nav.companyAnalytics' },
  { to: '/company/settings', label: 'Settings', icon: Settings, i18nKey: 'nav.companySettings' },
  { to: '/company/billing', label: 'Billing', icon: CreditCard, i18nKey: 'nav.companyBilling' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const { t } = useTranslation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [previewDropdownOpen, setPreviewDropdownOpen] = useState(false);
  const navigate = useNavigate();
  const { effectiveRole, isRealAdmin, isPreviewMode, setPreviewRole } = useAdminPreview();
  const { unreadCount } = useUnreadMessages();
  const { newCount: feedbackCount, markAsSeen: markFeedbackSeen } = useAdminFeedbackCount();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  // Use effective role (preview role if admin is previewing, real role otherwise)
  const displayRole = effectiveRole;
  const showAdminNav = isRealAdmin && !isPreviewMode;

  // Determine if we're in company view
  const isCompanyView = effectiveRole === 'company';

  // Filter nav items based on effective role for preview (non-company views)
  const visibleNavItems = useMemo(() => {
    if (isCompanyView) {
      // Company view uses structured navigation, not flat list
      return [];
    }
    return NAV_ITEMS.filter((item) => isNavVisible(effectiveRole, item.to));
  }, [effectiveRole, isCompanyView]);

  // Get current preview label
  const currentPreviewLabel = useMemo(() => {
    if (!isPreviewMode) return t('nav.adminView');
    const option = PREVIEW_ROLE_OPTIONS.find(
      (o) => o.value === effectiveRole
    );
    return option?.label || t('nav.adminView');
  }, [isPreviewMode, effectiveRole, t]);

  return (
    <div className="min-h-screen max-w-full overflow-x-hidden bg-[#0a0a0a] text-zinc-100">
      {/* Preview mode banner */}
      {isPreviewMode && (
        <div className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-center gap-3 bg-amber-600/90 px-4 py-1.5 text-xs font-semibold text-black backdrop-blur">
          <Eye className="h-3.5 w-3.5" />
          <span>{t('nav.previewMode')} — {t('nav.viewingAs')}: {currentPreviewLabel}</span>
          <button
            onClick={() => setPreviewRole(null)}
            className="ml-2 rounded bg-black/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black hover:bg-black/30 transition"
          >
            {t('nav.exitPreview')}
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
        <div className="flex items-center justify-center border-b border-zinc-800/80 px-4 py-3">
          <PipingBoxLogo variant="horizontal" size={32} />
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {isCompanyView ? (
            <>
              {/* ENTORNO EMPRESA section */}
              <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                {t('nav.companyWorkspace', { defaultValue: 'Entorno Empresa' })}
              </p>
              {COMPANY_NAV_WORKSPACE.map((item) => (
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

              {/* EMPRESA section */}
              <p className="mt-4 px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                {t('nav.companySection', { defaultValue: 'Empresa' })}
              </p>
              {COMPANY_NAV_SETTINGS.map((item) => (
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
                </NavLink>
              ))}
            </>
          ) : (
            <>
              {/* Worker / Admin / Moderator flat nav */}
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
            </>
          )}

          {showAdminNav && (
            <>
              <p className="mt-4 px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                {t('nav.system')}
              </p>
              <NavLink
                to="/admin"
                onClick={() => markFeedbackSeen()}
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
                <span className="flex-1">{t('nav.admin')}</span>
                {feedbackCount > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white animate-pulse">
                    {feedbackCount > 99 ? '99+' : feedbackCount}
                  </span>
                )}
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
                    {t('nav.viewAs')}
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
            <div className="flex items-center justify-between border-b border-zinc-800/80 px-4 py-3">
              <PipingBoxLogo variant="horizontal" size={32} />
              <button onClick={() => setMobileOpen(false)} className="text-zinc-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
              {isCompanyView ? (
                <>
                  <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                    {t('nav.companyWorkspace', { defaultValue: 'Entorno Empresa' })}
                  </p>
                  {COMPANY_NAV_WORKSPACE.map((item) => (
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
                  <p className="mt-4 px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                    {t('nav.companySection', { defaultValue: 'Empresa' })}
                  </p>
                  {COMPANY_NAV_SETTINGS.map((item) => (
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
                    </NavLink>
                  ))}
                </>
              ) : (
                <>
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
                </>
              )}
              {showAdminNav && (
                <NavLink
                  to="/admin"
                  onClick={() => { setMobileOpen(false); markFeedbackSeen(); }}
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
                  <span className="flex-1">{t('nav.admin')}</span>
                  {feedbackCount > 0 && (
                    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white animate-pulse">
                      {feedbackCount > 99 ? '99+' : feedbackCount}
                    </span>
                  )}
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

        {/* Footer */}
        <footer className="border-t border-zinc-800/80 px-3 py-4 sm:px-4 lg:px-8">
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-zinc-600">
            <span>© {new Date().getFullYear()} PipingBox</span>
            <span className="hidden sm:inline">·</span>
            <Link to="/privacy" className="hover:text-zinc-400 transition">
              {t('footer.privacy', { defaultValue: 'Privacy Policy' })}
            </Link>
            <span>·</span>
            <Link to="/terms" className="hover:text-zinc-400 transition">
              {t('footer.terms', { defaultValue: 'Terms of Service' })}
            </Link>
          </div>
        </footer>
      </div>

      {/* Beta feedback system */}
      <BetaFeedbackProvider />
    </div>
  );
}