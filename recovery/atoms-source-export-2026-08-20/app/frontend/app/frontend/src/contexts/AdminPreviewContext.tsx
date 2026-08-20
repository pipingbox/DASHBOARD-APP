import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { UserRole } from '@/lib/roles';

export type PreviewRole = UserRole | null;

interface AdminPreviewContextValue {
  /** The role currently being previewed (null = no preview, use real role) */
  previewRole: PreviewRole;
  /** The effective role for UI display (preview role if active, otherwise real role) */
  effectiveRole: string;
  /** Whether the admin is currently in preview mode */
  isPreviewMode: boolean;
  /** Whether the current user is a real admin (not affected by preview) */
  isRealAdmin: boolean;
  /** Set the preview role (null to exit preview) */
  setPreviewRole: (role: PreviewRole) => void;
  /** Reset to admin view */
  resetPreview: () => void;
}

const AdminPreviewContext = createContext<AdminPreviewContextValue | undefined>(undefined);

export function AdminPreviewProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [previewRole, setPreviewRole] = useState<PreviewRole>(null);

  const isRealAdmin = profile?.role === 'admin';

  const effectiveRole = isRealAdmin && previewRole ? previewRole : (profile?.role || 'worker');

  const isPreviewMode = isRealAdmin && previewRole !== null && previewRole !== 'admin';

  const resetPreview = useCallback(() => {
    setPreviewRole(null);
  }, []);

  const handleSetPreviewRole = useCallback((role: PreviewRole) => {
    // Only admins can use preview mode
    if (!isRealAdmin) return;
    // Setting to 'admin' or null exits preview mode
    if (role === 'admin' || role === null) {
      setPreviewRole(null);
    } else {
      setPreviewRole(role);
    }
  }, [isRealAdmin]);

  return (
    <AdminPreviewContext.Provider
      value={{
        previewRole,
        effectiveRole,
        isPreviewMode,
        isRealAdmin,
        setPreviewRole: handleSetPreviewRole,
        resetPreview,
      }}
    >
      {children}
    </AdminPreviewContext.Provider>
  );
}

export function useAdminPreview() {
  const ctx = useContext(AdminPreviewContext);
  if (!ctx) throw new Error('useAdminPreview must be used within AdminPreviewProvider');
  return ctx;
}