import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAdminPreview } from '@/contexts/AdminPreviewContext';
import { hasRouteAccess, getDefaultRoute, getRoleLabel } from '@/lib/roles';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PRIMARY_ADMIN_EMAIL = 'gaspardelhierromata@gmail.com';

interface Props {
  children: ReactNode;
  adminOnly?: boolean;
  allowedRoles?: string[];
}

export function ProtectedRoute({ children, adminOnly = false, allowedRoles }: Props) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  // Safely try to use AdminPreviewContext — it may not be available in all routes
  let effectiveRole: string | undefined;
  let isRealAdmin = false;
  try {
    const preview = useAdminPreview();
    effectiveRole = preview.effectiveRole;
    isRealAdmin = preview.isRealAdmin;
  } catch {
    // AdminPreviewProvider not available, use profile role directly
    effectiveRole = profile?.role || undefined;
    isRealAdmin = profile?.role === 'admin';
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#f59e0b] border-t-transparent" />
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Loading PipingBox</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // CRITICAL FALLBACK: Primary admin email always gets admin access regardless of profile state
  const isPrimaryAdmin = user.email === PRIMARY_ADMIN_EMAIL;
  if (isPrimaryAdmin) {
    isRealAdmin = true;
    effectiveRole = effectiveRole || 'admin';
    // If profile somehow doesn't have admin role, still allow access
    if (!profile || profile.role !== 'admin') {
      // The useAuth hook should fix this in the background, but don't block access
      return <>{children}</>;
    }
  }

  // Determine the role to use for access checks
  const roleForAccess = effectiveRole || profile?.role || 'worker';

  // /dashboard should NEVER be blocked for any authenticated user
  if (location.pathname === '/dashboard') {
    return <>{children}</>;
  }

  // Real admins (not in preview mode) always have full access
  if (isRealAdmin && !isPrimaryAdmin) {
    // Check if in preview mode — if effectiveRole differs from 'admin', apply preview restrictions
    const realProfileRole = profile?.role;
    if (realProfileRole === 'admin' && effectiveRole === 'admin') {
      return <>{children}</>;
    }
  }

  // Primary admin always has access (already handled above, but belt-and-suspenders)
  if (isPrimaryAdmin && effectiveRole === 'admin') {
    return <>{children}</>;
  }

  // Legacy adminOnly check
  if (adminOnly && roleForAccess !== 'admin') {
    return <AccessDenied role={roleForAccess} />;
  }

  // Role-based route check using allowedRoles prop
  if (allowedRoles && allowedRoles.length > 0) {
    const normalizedRole = roleForAccess === 'user' ? 'worker' : roleForAccess;
    if (normalizedRole !== 'admin' && !allowedRoles.includes(normalizedRole)) {
      return <AccessDenied role={roleForAccess} />;
    }
  }

  // Route-based access check from roles config
  if (!hasRouteAccess(roleForAccess, location.pathname)) {
    return <AccessDenied role={roleForAccess} />;
  }

  return <>{children}</>;
}

function AccessDenied({ role }: { role?: string | null }) {
  const roleLabel = getRoleLabel(role || 'worker');
  const defaultRoute = getDefaultRoute(role);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20">
            <ShieldAlert className="h-8 w-8 text-red-400" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-zinc-100">Access Restricted</h1>
          <p className="text-sm text-zinc-400">
            Your current role (<span className="text-[#f59e0b] font-medium">{roleLabel}</span>) does not have permission to access this section.
          </p>
          <p className="text-xs text-zinc-600">
            If you believe this is an error, please contact your platform administrator.
          </p>
        </div>
        <Button
          onClick={() => window.location.href = defaultRoute}
          className="bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold"
        >
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
}

export function GuestRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#f59e0b] border-t-transparent" />
      </div>
    );
  }
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}