import { PageHeader } from '@/components/PageHeader';
import { useTranslation } from 'react-i18next';
import { Settings, Bell, Shield, Globe } from 'lucide-react';

export default function CompanySettings() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav.companySettings', { defaultValue: 'Configuración' })}
        description={t('companySettings.description', { defaultValue: 'Gestiona las preferencias y configuración de tu empresa.' })}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f59e0b]/10">
              <Bell className="h-5 w-5 text-[#f59e0b]" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-zinc-200">Notificaciones</h3>
              <p className="text-xs text-zinc-500">Configura alertas y notificaciones</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f59e0b]/10">
              <Shield className="h-5 w-5 text-[#f59e0b]" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-zinc-200">Seguridad</h3>
              <p className="text-xs text-zinc-500">Contraseña y acceso</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f59e0b]/10">
              <Globe className="h-5 w-5 text-[#f59e0b]" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-zinc-200">Idioma y Región</h3>
              <p className="text-xs text-zinc-500">Preferencias de idioma</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f59e0b]/10">
              <Settings className="h-5 w-5 text-[#f59e0b]" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-zinc-200">Integraciones</h3>
              <p className="text-xs text-zinc-500">Conecta herramientas externas</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
        <p className="text-xs text-zinc-500">
          Módulo en desarrollo. Próximamente podrás configurar notificaciones, permisos de equipo e integraciones.
        </p>
      </div>
    </div>
  );
}