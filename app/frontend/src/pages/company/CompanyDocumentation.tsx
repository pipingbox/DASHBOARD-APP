import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { useTranslation } from 'react-i18next';
import {
  FolderOpen,
  Upload,
  Search,
  Filter,
  FileText,
  Shield,
  Users,
  Briefcase,
  Heart,
  Award,
  CreditCard,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Send,
  PenTool,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ─── Types ─── */
type DocCategory =
  | 'all'
  | 'worker_documents'
  | 'company_documents'
  | 'shared_documents'
  | 'contracts'
  | 'certificates'
  | 'payroll'
  | 'safety'
  | 'medical';

type DocStatus =
  | 'pending'
  | 'sent'
  | 'signed'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'requires_update';

interface DocumentItem {
  id: string;
  title: string;
  category: DocCategory;
  status: DocStatus;
  worker?: string;
  job?: string;
  uploadedAt: string;
  expiresAt?: string;
  size: string;
}

/* ─── Demo Data ─── */
const DEMO_DOCUMENTS: DocumentItem[] = [
  {
    id: '1',
    title: 'Contrato de Trabajo - Juan Pérez',
    category: 'contracts',
    status: 'signed',
    worker: 'Juan Pérez',
    job: 'Pipe Fitter Senior',
    uploadedAt: '2026-05-15',
    size: '245 KB',
  },
  {
    id: '2',
    title: 'Certificado de Soldadura AWS D1.1',
    category: 'certificates',
    status: 'approved',
    worker: 'Carlos Rodríguez',
    job: 'Welder 6G',
    uploadedAt: '2026-05-10',
    expiresAt: '2027-05-10',
    size: '1.2 MB',
  },
  {
    id: '3',
    title: 'Examen Médico Ocupacional',
    category: 'medical',
    status: 'pending',
    worker: 'María García',
    job: 'QA/QC Inspector',
    uploadedAt: '2026-05-18',
    size: '3.4 MB',
  },
  {
    id: '4',
    title: 'Inducción de Seguridad - Planta Norte',
    category: 'safety',
    status: 'sent',
    worker: 'Pedro Martínez',
    job: 'Pipe Fitter',
    uploadedAt: '2026-05-12',
    size: '890 KB',
  },
  {
    id: '5',
    title: 'Nómina Mayo 2026 - Equipo Turnaround',
    category: 'payroll',
    status: 'approved',
    uploadedAt: '2026-05-01',
    size: '156 KB',
  },
  {
    id: '6',
    title: 'Política de EPP - Actualización 2026',
    category: 'company_documents',
    status: 'requires_update',
    uploadedAt: '2026-04-20',
    size: '2.1 MB',
  },
  {
    id: '7',
    title: 'Permiso de Trabajo en Altura',
    category: 'safety',
    status: 'expired',
    worker: 'Luis Fernández',
    job: 'Scaffolder',
    uploadedAt: '2025-11-15',
    expiresAt: '2026-05-15',
    size: '520 KB',
  },
  {
    id: '8',
    title: 'Acuerdo de Confidencialidad - Proyecto Offshore',
    category: 'shared_documents',
    status: 'signed',
    worker: 'Ana López',
    job: 'Project Engineer',
    uploadedAt: '2026-05-08',
    size: '180 KB',
  },
];

/* ─── Category Config ─── */
const CATEGORIES: { value: DocCategory; label: string; icon: typeof FolderOpen }[] = [
  { value: 'all', label: 'Todos', icon: FolderOpen },
  { value: 'worker_documents', label: 'Documentos de Trabajador', icon: Users },
  { value: 'company_documents', label: 'Documentos de Empresa', icon: Briefcase },
  { value: 'shared_documents', label: 'Documentos Compartidos', icon: FolderOpen },
  { value: 'contracts', label: 'Contratos', icon: FileText },
  { value: 'certificates', label: 'Certificados', icon: Award },
  { value: 'payroll', label: 'Nómina / Viáticos', icon: CreditCard },
  { value: 'safety', label: 'Seguridad', icon: Shield },
  { value: 'medical', label: 'Médico / Compliance', icon: Heart },
];

/* ─── Status Config ─── */
const STATUS_CONFIG: Record<DocStatus, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: 'Pendiente', color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30', icon: Clock },
  sent: { label: 'Enviado', color: 'text-blue-400 bg-blue-400/10 border-blue-400/30', icon: Send },
  signed: { label: 'Firmado', color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30', icon: PenTool },
  approved: { label: 'Aprobado', color: 'text-green-400 bg-green-400/10 border-green-400/30', icon: CheckCircle2 },
  rejected: { label: 'Rechazado', color: 'text-red-400 bg-red-400/10 border-red-400/30', icon: XCircle },
  expired: { label: 'Expirado', color: 'text-orange-400 bg-orange-400/10 border-orange-400/30', icon: AlertTriangle },
  requires_update: { label: 'Requiere Actualización', color: 'text-amber-400 bg-amber-400/10 border-amber-400/30', icon: RefreshCw },
};

export default function CompanyDocumentation() {
  const { t } = useTranslation();
  const [selectedCategory, setSelectedCategory] = useState<DocCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<DocStatus | 'all'>('all');

  const filteredDocs = DEMO_DOCUMENTS.filter((doc) => {
    if (selectedCategory !== 'all' && doc.category !== selectedCategory) return false;
    if (statusFilter !== 'all' && doc.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        doc.title.toLowerCase().includes(q) ||
        doc.worker?.toLowerCase().includes(q) ||
        doc.job?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const stats = {
    total: DEMO_DOCUMENTS.length,
    pending: DEMO_DOCUMENTS.filter((d) => d.status === 'pending').length,
    expired: DEMO_DOCUMENTS.filter((d) => d.status === 'expired').length,
    requiresUpdate: DEMO_DOCUMENTS.filter((d) => d.status === 'requires_update').length,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav.companyDocumentation', { defaultValue: 'Gestión Documental Industrial' })}
        description={t('companyDocs.description', { defaultValue: 'Administra, intercambia y da seguimiento a documentos con trabajadores y candidatos.' })}
      />

      {/* Stats Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-2xl font-bold text-zinc-100">{stats.total}</p>
          <p className="text-xs text-zinc-500">{t('companyDocs.totalDocs', { defaultValue: 'Total Documentos' })}</p>
        </div>
        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4">
          <p className="text-2xl font-bold text-yellow-400">{stats.pending}</p>
          <p className="text-xs text-zinc-500">{t('companyDocs.pending', { defaultValue: 'Pendientes' })}</p>
        </div>
        <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-4">
          <p className="text-2xl font-bold text-orange-400">{stats.expired}</p>
          <p className="text-xs text-zinc-500">{t('companyDocs.expired', { defaultValue: 'Expirados' })}</p>
        </div>
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="text-2xl font-bold text-amber-400">{stats.requiresUpdate}</p>
          <p className="text-xs text-zinc-500">{t('companyDocs.requiresUpdate', { defaultValue: 'Requieren Actualización' })}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 sm:max-w-xs">
            <Search className="h-4 w-4 text-zinc-500" />
            <input
              type="text"
              placeholder={t('companyDocs.searchPlaceholder', { defaultValue: 'Buscar por título, trabajador o puesto...' })}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-600"
            />
          </div>
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as DocStatus | 'all')}
              className="appearance-none rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 pr-8 text-sm text-zinc-300 outline-none focus:border-[#f59e0b]/40"
            >
              <option value="all">{t('companyDocs.allStatuses', { defaultValue: 'Todos los estados' })}</option>
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.label}</option>
              ))}
            </select>
            <Filter className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          </div>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-[#f59e0b] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#f59e0b]/90">
          <Upload className="h-4 w-4" />
          {t('companyDocs.uploadDocument', { defaultValue: 'Subir Documento' })}
        </button>
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setSelectedCategory(cat.value)}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition',
              selectedCategory === cat.value
                ? 'border-[#f59e0b]/50 bg-[#f59e0b]/10 text-[#f59e0b]'
                : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300'
            )}
          >
            <cat.icon className="h-3.5 w-3.5" />
            {cat.label}
          </button>
        ))}
      </div>

      {/* Documents Table */}
      {filteredDocs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/30 py-16">
          <FolderOpen className="h-12 w-12 text-zinc-700" />
          <p className="mt-3 text-sm text-zinc-500">
            {t('companyDocs.emptyState', { defaultValue: 'No se encontraron documentos con los filtros seleccionados.' })}
          </p>
          <button className="mt-4 flex items-center gap-2 rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:border-[#f59e0b]/40 hover:text-[#f59e0b]">
            <Upload className="h-4 w-4" />
            {t('companyDocs.uploadFirst', { defaultValue: 'Subir primer documento' })}
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-900/80">
              <tr>
                <th className="px-4 py-3 font-medium text-zinc-400">{t('companyDocs.colTitle', { defaultValue: 'Documento' })}</th>
                <th className="hidden px-4 py-3 font-medium text-zinc-400 sm:table-cell">{t('companyDocs.colWorker', { defaultValue: 'Trabajador' })}</th>
                <th className="hidden px-4 py-3 font-medium text-zinc-400 md:table-cell">{t('companyDocs.colJob', { defaultValue: 'Puesto' })}</th>
                <th className="px-4 py-3 font-medium text-zinc-400">{t('companyDocs.colStatus', { defaultValue: 'Estado' })}</th>
                <th className="hidden px-4 py-3 font-medium text-zinc-400 lg:table-cell">{t('companyDocs.colDate', { defaultValue: 'Fecha' })}</th>
                <th className="hidden px-4 py-3 font-medium text-zinc-400 lg:table-cell">{t('companyDocs.colSize', { defaultValue: 'Tamaño' })}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {filteredDocs.map((doc) => {
                const statusCfg = STATUS_CONFIG[doc.status];
                const StatusIcon = statusCfg.icon;
                return (
                  <tr key={doc.id} className="transition hover:bg-zinc-900/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-zinc-600" />
                        <span className="font-medium text-zinc-200">{doc.title}</span>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-zinc-400 sm:table-cell">
                      {doc.worker || '—'}
                    </td>
                    <td className="hidden px-4 py-3 text-zinc-400 md:table-cell">
                      {doc.job || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', statusCfg.color)}>
                        <StatusIcon className="h-3 w-3" />
                        {statusCfg.label}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-zinc-500 lg:table-cell">
                      {doc.uploadedAt}
                    </td>
                    <td className="hidden px-4 py-3 text-zinc-500 lg:table-cell">
                      {doc.size}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Info Banner */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
        <div className="flex items-start gap-3">
          <Shield className="mt-0.5 h-5 w-5 shrink-0 text-[#f59e0b]" />
          <div>
            <p className="text-sm font-medium text-zinc-200">
              {t('companyDocs.infoTitle', { defaultValue: 'Gestión Documental Industrial' })}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {t('companyDocs.infoDescription', { defaultValue: 'Este módulo está diseñado para la coordinación de documentos entre empresas, contratistas y trabajadores industriales. Gestione contratos, certificaciones, permisos de trabajo, nóminas y documentos de seguridad desde un solo lugar.' })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}