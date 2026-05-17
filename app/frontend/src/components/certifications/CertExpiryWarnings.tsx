import { useTranslation } from 'react-i18next';
import { AlertTriangle, Clock, RefreshCw } from 'lucide-react';
import { useCertExpiryAlerts, type ExpiringCert } from '@/hooks/useCertExpiryAlerts';
import { getExpiryInfo, getAlertMessage } from '@/lib/certifications';

function WarningItem({ item }: { item: ExpiringCert }) {
  const { t, i18n } = useTranslation();
  const { cert, daysUntilExpiry } = item;
  const expiryInfo = getExpiryInfo(cert);
  const lang = i18n.language?.startsWith('es') ? 'es' : 'en';
  const alertMessage = getAlertMessage(daysUntilExpiry, lang);

  const isExpired = daysUntilExpiry <= 0;
  const isCritical = daysUntilExpiry > 0 && daysUntilExpiry <= 30;

  return (
    <div
      className={[
        'flex items-start gap-3 border p-3',
        isExpired
          ? 'border-red-600/40 bg-red-600/5'
          : isCritical
            ? 'border-orange-500/40 bg-orange-500/5'
            : 'border-amber-500/20 bg-amber-500/5',
      ].join(' ')}
    >
      <AlertTriangle
        className={[
          'mt-0.5 h-4 w-4 flex-shrink-0',
          isExpired
            ? 'text-red-400'
            : isCritical
              ? 'text-orange-400'
              : 'text-amber-400',
        ].join(' ')}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-200">{cert.name}</p>
        <p className="text-xs text-zinc-500">{cert.issuer}</p>
        {alertMessage && (
          <p className="mt-1 text-xs font-medium text-amber-300">{alertMessage}</p>
        )}
        <div className="mt-1 flex items-center gap-1 text-xs">
          <Clock className="h-3 w-3" />
          {isExpired ? (
            <span className="text-red-400">
              {t('certAlerts.expiredAgo', { days: Math.abs(daysUntilExpiry) })}
            </span>
          ) : (
            <span
              className={
                isCritical
                  ? 'text-orange-400'
                  : 'text-amber-300'
              }
            >
              {t('certAlerts.expiresIn', { days: daysUntilExpiry })}
            </span>
          )}
        </div>
        <div className="mt-1">
          <span
            className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider ${
              expiryInfo.status === 'expired'
                ? 'text-red-400'
                : expiryInfo.status === 'critical'
                  ? 'text-orange-400'
                  : 'text-amber-400'
            }`}
          >
            <RefreshCw className="h-2.5 w-2.5" />
            {t(`certStatus.${expiryInfo.status}`)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function CertExpiryWarnings() {
  const { t } = useTranslation();
  const { expiringCerts, loading } = useCertExpiryAlerts();

  if (loading || expiringCerts.length === 0) return null;

  return (
    <section className="border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-amber-400" />
        <h3 className="text-sm font-semibold text-amber-300">
          {t('certAlerts.warningTitle', { count: expiringCerts.length })}
        </h3>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        {t('certAlerts.warningSubtitle')}
      </p>
      <div className="mt-3 space-y-2">
        {expiringCerts.map((item) => (
          <WarningItem key={item.cert.id} item={item} />
        ))}
      </div>
    </section>
  );
}