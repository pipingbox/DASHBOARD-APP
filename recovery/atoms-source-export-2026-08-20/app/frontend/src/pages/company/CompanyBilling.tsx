import { PageHeader } from '@/components/PageHeader';
import { useTranslation } from 'react-i18next';
import { CreditCard, CheckCircle2, Zap } from 'lucide-react';

export default function CompanyBilling() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav.companyBilling', { defaultValue: 'Facturación / Planes' })}
        description={t('companyBilling.description', { defaultValue: 'Gestiona tu suscripción y métodos de pago.' })}
      />

      {/* Current Plan */}
      <div className="rounded-lg border border-[#f59e0b]/30 bg-[#f59e0b]/5 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f59e0b]/20">
              <Zap className="h-5 w-5 text-[#f59e0b]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Plan Beta</h3>
              <p className="text-xs text-zinc-400">Acceso completo durante el período beta</p>
            </div>
          </div>
          <span className="rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs font-medium text-green-400">
            Activo
          </span>
        </div>
      </div>

      {/* Features */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
        <h3 className="mb-4 text-sm font-medium text-zinc-200">Incluido en tu plan</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            'Publicación ilimitada de vacantes',
            'Búsqueda de trabajadores',
            'Gestión de candidatos',
            'Mensajería directa',
            'Gestión documental',
            'Solicitudes de personal',
            'Analítica básica',
            'Soporte por email',
          ].map((feature) => (
            <div key={feature} className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-green-400" />
              <span className="text-xs text-zinc-300">{feature}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Payment Method */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-zinc-500" />
            <div>
              <h3 className="text-sm font-medium text-zinc-200">Método de Pago</h3>
              <p className="text-xs text-zinc-500">No se requiere pago durante el período beta</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
        <p className="text-xs text-zinc-500">
          Los planes de pago estarán disponibles cuando finalice el período beta. Te notificaremos con anticipación.
        </p>
      </div>
    </div>
  );
}