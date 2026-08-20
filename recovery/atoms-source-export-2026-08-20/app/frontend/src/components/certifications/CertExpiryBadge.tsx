import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { useCertExpiryAlerts } from '@/hooks/useCertExpiryAlerts';

export function CertExpiryBadge() {
  const { t } = useTranslation();
  const { expiringCount, loading } = useCertExpiryAlerts();

  if (loading || expiringCount === 0) return null;

  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-400">
      <AlertTriangle className="h-3.5 w-3.5" />
      <span>
        {expiringCount} {t('certAlerts.expiringBadge', { count: expiringCount })}
      </span>
    </div>
  );
}