import { useEffect, useState, useCallback } from 'react';
import { supabase, TABLES } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import type { Certification } from '@/lib/certifications';

export interface CertAlertPrefs {
  id?: string;
  user_id: string;
  days_before_expiry: number;
  in_app_alerts: boolean;
  email_alerts: boolean;
}

const DEFAULT_PREFS: Omit<CertAlertPrefs, 'user_id'> = {
  days_before_expiry: 90,
  in_app_alerts: true,
  email_alerts: false,
};

export interface ExpiringCert {
  cert: Certification;
  daysUntilExpiry: number;
}

export function useCertExpiryAlerts() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<CertAlertPrefs | null>(null);
  const [expiringCerts, setExpiringCerts] = useState<ExpiringCert[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPrefs = useCallback(async () => {
    if (!user) return null;
    const { data } = await supabase
      .from(TABLES.certAlertPrefs)
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (data) {
      const p: CertAlertPrefs = {
        id: data.id,
        user_id: data.user_id,
        days_before_expiry: data.days_before_expiry,
        in_app_alerts: data.in_app_alerts,
        email_alerts: data.email_alerts,
      };
      setPrefs(p);
      return p;
    }
    // Return defaults if no prefs saved yet
    const defaultP: CertAlertPrefs = { ...DEFAULT_PREFS, user_id: user.id };
    setPrefs(defaultP);
    return defaultP;
  }, [user]);

  const loadExpiringCerts = useCallback(
    async (alertPrefs: CertAlertPrefs | null) => {
      if (!user || !alertPrefs || !alertPrefs.in_app_alerts) {
        setExpiringCerts([]);
        return;
      }

      const { data } = await supabase
        .from(TABLES.certifications)
        .select('*')
        .eq('user_id', user.id)
        .or('expiry_date.not.is.null,expiration_date.not.is.null');

      if (!data || data.length === 0) {
        setExpiringCerts([]);
        return;
      }

      const now = new Date();
      const threshold = alertPrefs.days_before_expiry;
      const expiring: ExpiringCert[] = [];

      // TD-09: normalize — use expiration_date or expiry_date
      const normalized = (data as Record<string, unknown>[]).map((row) => ({
        ...row,
        name: row.certification_name ?? row.name ?? '',
        issuer: row.issuing_organization ?? row.issuer ?? '',
        expiry_date: row.expiration_date ?? row.expiry_date ?? null,
      })) as Certification[];

      for (const cert of normalized) {
        if (!cert.expiry_date) continue;
        const expiryDate = new Date(cert.expiry_date);
        const diffMs = expiryDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        // Include certs expiring within threshold (and already expired up to 30 days ago)
        if (diffDays <= threshold && diffDays >= -30) {
          expiring.push({ cert, daysUntilExpiry: diffDays });
        }
      }

      // Sort: most urgent first
      expiring.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
      setExpiringCerts(expiring);
    },
    [user],
  );

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    loadPrefs().then((p) => {
      loadExpiringCerts(p ?? null).then(() => setLoading(false));
    });
  }, [user, loadPrefs, loadExpiringCerts]);

  const savePrefs = async (
    newPrefs: Partial<Omit<CertAlertPrefs, 'user_id' | 'id'>>,
  ) => {
    if (!user) return;
    const updated = {
      ...DEFAULT_PREFS,
      ...prefs,
      ...newPrefs,
      user_id: user.id,
      updated_at: new Date().toISOString(),
    };

    if (prefs?.id) {
      const { error } = await supabase
        .from(TABLES.certAlertPrefs)
        .update({
          days_before_expiry: updated.days_before_expiry,
          in_app_alerts: updated.in_app_alerts,
          email_alerts: updated.email_alerts,
          updated_at: updated.updated_at,
        })
        .eq('id', prefs.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from(TABLES.certAlertPrefs).insert({
        user_id: user.id,
        days_before_expiry: updated.days_before_expiry,
        in_app_alerts: updated.in_app_alerts,
        email_alerts: updated.email_alerts,
      });
      if (error) throw error;
    }

    const p = await loadPrefs();
    await loadExpiringCerts(p ?? null);
  };

  const refresh = async () => {
    const p = await loadPrefs();
    await loadExpiringCerts(p ?? null);
  };

  return {
    prefs,
    expiringCerts,
    expiringCount: expiringCerts.length,
    loading,
    savePrefs,
    refresh,
  };
}