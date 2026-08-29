import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Layers,
  Link2,
  Settings2,
  Lightbulb,
  AlertTriangle,
  PackageX,
  Box,
  Tag,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  getComponent,
  getStandard,
  getDimensionSets,
  formatSize,
  sizeRank,
  type CatalogComponent,
  type CatalogDrawing,
  type CatalogReferenceCompatibility,
  type DimensionSet,
  type DimensionField,
} from '@/tools/catalog';

/* ─────────────────────────────────────────────
   Types
   ───────────────────────────────────────────── */

interface AccessoryDetailPageProps {
  accessoryId: string;
  onBack: () => void;
}

type UnitSystem = 'metric' | 'imperial';
type ViewMode = 'obra' | 'ingenieria';
type TabKey = 'vista-rapida' | 'dimensiones' | 'normativa' | 'compatibilidades' | 'descargas';

const TABS_OBRA: { key: TabKey; labelKey: string; icon: typeof Eye }[] = [
  { key: 'vista-rapida', labelKey: 'Vista Rápida', icon: Eye },
];

const TABS_INGENIERIA: { key: TabKey; labelKey: string; icon: typeof Eye }[] = [
  { key: 'vista-rapida', labelKey: 'Vista Rápida', icon: Eye },
  { key: 'dimensiones', labelKey: 'Dimensiones', icon: Layers },
  { key: 'normativa', labelKey: 'Normativa', icon: FileText },
  { key: 'compatibilidades', labelKey: 'Compatibilidades', icon: Link2 },
  { key: 'descargas', labelKey: 'Descargas', icon: Download },
];

/* ─────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────── */

function titleCase(s: string): string {
  return s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

/** Renders a value that may legitimately be absent. Never invents data. */
function displayValue(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}

/**
 * The 2D assets are light CAD sheets (fill #e2e5e8, black strokes, red
 * dimension text). Dropping them straight onto the #0d0d0d UI would put black
 * lines on near-black. They are therefore presented on a light "drawing sheet"
 * panel — paper laid on the dark UI, which is also the professional convention.
 * The SVGs are never recoloured or inverted.
 */
function DrawingSheet({
  src,
  alt,
  caption,
  className = '',
}: {
  src: string;
  alt: string;
  caption?: string;
  className?: string;
}) {
  return (
    <figure className={`overflow-hidden rounded-lg border border-zinc-700/60 bg-[#f4f5f6] shadow-lg shadow-black/40 ${className}`}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="h-full w-full bg-[#f4f5f6] object-contain p-2"
      />
      {caption && (
        <figcaption className="border-t border-zinc-300/70 bg-[#e8eaec] px-3 py-1.5 text-[10px] uppercase tracking-wider text-zinc-600">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

/**
 * Split dimension fields by unit system. Fields ending in `_mm`/`_in` are
 * paired; anything else (counts, thread sizes, weights, free text) is common
 * to both systems and always shown. If a set has no field for the chosen
 * system, we show what exists rather than hiding real data.
 */
function fieldsForUnits(fields: DimensionField[], units: UnitSystem): DimensionField[] {
  const wanted = units === 'metric' ? '_mm' : '_in';
  const other = units === 'metric' ? '_in' : '_mm';

  const hasWanted = fields.some((f) => f.key.endsWith(wanted));
  if (!hasWanted) return fields; // nothing to filter — show everything.

  return fields.filter((f) => {
    if (f.key.endsWith(wanted)) return true;
    if (!f.key.endsWith(other)) return true; // unit-neutral field
    // Drop the counterpart only when the wanted twin actually exists.
    const twin = f.key.slice(0, -other.length) + wanted;
    return !fields.some((g) => g.key === twin);
  });
}

/* ─────────────────────────────────────────────
   Main Component
   ───────────────────────────────────────────── */

export default function AccessoryDetailPage({ accessoryId, onBack }: AccessoryDetailPageProps) {
  const { t } = useTranslation();
  const [units, setUnits] = useState<UnitSystem>('metric');
  const [mode, setMode] = useState<ViewMode>('obra');
  const [activeTab, setActiveTab] = useState<TabKey>('vista-rapida');
  const [consejoOpen, setConsejoOpen] = useState(false);

  const component = useMemo(() => getComponent(accessoryId), [accessoryId]);

  // Drawings ordered by real NPS, not by filename.
  const drawings = useMemo<CatalogDrawing[]>(
    () => (component ? [...component.drawings].sort((a, b) => sizeRank(a.size) - sizeRank(b.size)) : []),
    [component],
  );

  const [selectedSize, setSelectedSize] = useState<string | null>(null);

  const activeDrawing = useMemo(() => {
    if (drawings.length === 0) return undefined;
    return drawings.find((d) => d.size === selectedSize) ?? drawings[0];
  }, [drawings, selectedSize]);

  const tabs = mode === 'obra' ? TABS_OBRA : TABS_INGENIERIA;

  const handleModeSwitch = () => {
    if (mode === 'obra') {
      setMode('ingenieria');
      setActiveTab('dimensiones');
    } else {
      setMode('obra');
      setActiveTab('vista-rapida');
    }
  };

  /* ── Not found ── */
  if (!component) {
    return (
      <div className="rounded-xl border border-zinc-800/80 bg-[#0d0d0d] p-5">
        <button
          onClick={onBack}
          className="mb-6 flex items-center gap-1 text-xs text-zinc-400 transition-colors hover:text-amber-500"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>{t('common.back', { defaultValue: 'Volver' })}</span>
        </button>
        <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
          <div className="mb-3 rounded-full bg-zinc-800/50 p-3">
            <PackageX className="h-6 w-6 text-zinc-600" />
          </div>
          <p className="text-sm text-zinc-300">
            {t('tools.accessoryDetail.notFound', { defaultValue: 'Component not found' })}
          </p>
          <p className="mt-1 max-w-sm text-xs text-zinc-500">
            {t('tools.accessoryDetail.notFoundHint', {
              defaultValue: 'This component is not in the published catalog.',
            })}
          </p>
          <p className="mt-3 font-mono text-[11px] text-zinc-600">{accessoryId}</p>
        </div>
      </div>
    );
  }

  const standardRefs = component.standards;

  return (
    <div className="min-h-full space-y-0" style={{ background: '#0a0a0a' }}>
      {/* ═══ ZONE A — Header ═══ */}
      <div className="space-y-4 rounded-t-xl border border-zinc-800/80 bg-[#0d0d0d] p-5">
        {/* Back + Breadcrumb */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-zinc-400 transition-colors hover:text-amber-500"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{t('common.back', { defaultValue: 'Volver' })}</span>
          </button>
          <ChevronRight className="h-3 w-3" />
          <span>{t('tools.accessoriesLibrary.breadcrumb', { defaultValue: 'Biblioteca' })}</span>
          {component.category && (
            <>
              <ChevronRight className="h-3 w-3" />
              <span>{titleCase(component.category)}</span>
            </>
          )}
          {component.family && (
            <>
              <ChevronRight className="h-3 w-3" />
              <span className="text-zinc-300">{titleCase(component.family)}</span>
            </>
          )}
        </div>

        {/* Title row */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1 className="font-sans text-xl font-semibold text-zinc-100">{component.name}</h1>
            <p className="font-mono text-xs text-zinc-500">{component.id}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center rounded-full border border-zinc-700/60 bg-zinc-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              {component.status}
            </span>
            {/* Unit toggle */}
            <div className="flex overflow-hidden rounded-md border border-zinc-800/80 text-[11px]">
              <button
                onClick={() => setUnits('metric')}
                className={`px-3 py-1.5 transition-colors ${
                  units === 'metric'
                    ? 'bg-amber-500/10 font-medium text-amber-500'
                    : 'bg-[#111] text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Métrico
              </button>
              <button
                onClick={() => setUnits('imperial')}
                className={`px-3 py-1.5 transition-colors ${
                  units === 'imperial'
                    ? 'bg-amber-500/10 font-medium text-amber-500'
                    : 'bg-[#111] text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Imperial
              </button>
            </div>
          </div>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleModeSwitch}
            className="flex items-center gap-1.5 rounded-md border border-zinc-800/80 bg-[#111] px-3 py-1.5 text-[11px] text-zinc-400 transition-all hover:border-amber-500/30 hover:text-amber-500"
          >
            <Settings2 className="h-3.5 w-3.5" />
            {mode === 'obra' ? 'Modo Obra' : 'Modo Ingeniería'}
          </button>
          <span className="text-[10px] text-zinc-600">
            {mode === 'obra' ? '(simplificado)' : '(completo)'}
          </span>
        </div>
      </div>

      {/* ═══ ZONE B — Tabs ═══ */}
      <div className="border-x border-zinc-800/80 bg-[#0d0d0d]">
        <div className="hidden border-b border-zinc-800/80 sm:flex">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 border-b-2 px-4 py-3 text-xs font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'border-amber-500 text-amber-500'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.labelKey}
              </button>
            );
          })}
        </div>
        {/* Mobile tab select */}
        <div className="border-b border-zinc-800/80 px-4 py-2 sm:hidden">
          <select
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value as TabKey)}
            className="w-full rounded-md border border-zinc-800 bg-[#111] px-3 py-2 text-xs text-zinc-300"
          >
            {tabs.map((tab) => (
              <option key={tab.key} value={tab.key}>
                {tab.labelKey}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ═══ Tab Content ═══ */}
      <div className="rounded-b-xl border border-t-0 border-zinc-800/80 bg-[#0d0d0d] p-5">
        {activeTab === 'vista-rapida' && (
          <VistaRapidaTab
            component={component}
            drawings={drawings}
            activeDrawing={activeDrawing}
            selectedSize={activeDrawing?.size ?? null}
            setSelectedSize={setSelectedSize}
            consejoOpen={consejoOpen}
            setConsejoOpen={setConsejoOpen}
            onSwitchMode={handleModeSwitch}
          />
        )}
        {activeTab === 'dimensiones' && (
          <DimensionesTab
            component={component}
            units={units}
            drawings={drawings}
            activeDrawing={activeDrawing}
            selectedSize={activeDrawing?.size ?? null}
            setSelectedSize={setSelectedSize}
          />
        )}
        {activeTab === 'normativa' && <NormativaTab component={component} />}
        {activeTab === 'compatibilidades' && <CompatibilidadesTab component={component} />}
        {activeTab === 'descargas' && (
          <DescargasTab component={component} activeDrawing={activeDrawing} />
        )}
      </div>

      {standardRefs.length > 0 && <ReferenceNotice />}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Shared: size selector
   ───────────────────────────────────────────── */

function SizeSelector({
  drawings,
  selectedSize,
  setSelectedSize,
}: {
  drawings: CatalogDrawing[];
  selectedSize: string | null;
  setSelectedSize: (v: string | null) => void;
}) {
  const { t } = useTranslation();
  if (drawings.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <label className="block text-[10px] uppercase tracking-wider text-zinc-500">
        {t('tools.accessoryDetail.size', { defaultValue: 'Size (NPS)' })}
      </label>

      {/* Mobile: native select keeps long size lists usable. */}
      <select
        value={selectedSize ?? ''}
        onChange={(e) => setSelectedSize(e.target.value)}
        className="w-full rounded-md border border-zinc-800 bg-[#111] px-3 py-2 text-xs text-zinc-300 sm:hidden"
      >
        {drawings.map((d) => (
          <option key={d.src} value={d.size ?? ''}>
            {formatSize(d.size)}
          </option>
        ))}
      </select>

      {/* Desktop: scrollable chip row. */}
      <div className="hidden flex-wrap gap-1.5 sm:flex">
        {drawings.map((d) => (
          <button
            key={d.src}
            onClick={() => setSelectedSize(d.size)}
            className={`rounded-md border px-2.5 py-1 font-mono text-[11px] transition-all ${
              d.size === selectedSize
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-500'
                : 'border-zinc-800 bg-[#111] text-zinc-400 hover:border-amber-500/30 hover:text-zinc-200'
            }`}
          >
            {formatSize(d.size)}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Shared: engineering reference notice
   ───────────────────────────────────────────── */

function ReferenceNotice() {
  const { t } = useTranslation();
  return (
    <div className="mt-3 flex items-start gap-2 rounded-lg border border-zinc-800/80 bg-[#0d0d0d] px-4 py-3">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500/80" />
      <p className="text-[11px] leading-relaxed text-zinc-500">
        {t('tools.accessoryDetail.referenceNotice', {
          defaultValue:
            'Dimensional data is engineering reference only. Verify against the governing edition of the applicable standard before fabrication or procurement.',
        })}
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Shared: Level 1 referential brand mention
   ───────────────────────────────────────────── */

/**
 * PB-PARTNER-CATALOG-001, Level 1 REFERENTIAL.
 *
 * Third-party trademarks cited under art. 14(1)(c) EUTMR to indicate intended
 * purpose. Two rules drive this design and neither is cosmetic:
 *
 * 1. It must NOT read as normative data. Level 0 blocks in this file use the
 *    `bg-[#111]` card on the amber accent; this one is deliberately pushed
 *    down to a flatter `bg-[#0a0a0a]` card with a dashed separator above it,
 *    zinc-only accents and no amber, so a reader scanning the page cannot
 *    mistake a brand name for a standard-derived value.
 * 2. The disclaimer is not optional chrome. It is what keeps the mention
 *    inside "honest practices" under art. 14(2), so it renders unconditionally
 *    whenever brands render — it is never behind a collapsible.
 */
function ReferenceCompatibilityBlock({ data }: { data: CatalogReferenceCompatibility }) {
  const { t } = useTranslation();
  if (data.brands.length === 0) return null;

  const basis = data.basisLabel ?? data.basisStandardId ?? null;

  return (
    <section className="mt-6 border-t border-dashed border-zinc-800 pt-5">
      <div className="rounded-lg border border-zinc-800/60 bg-[#0a0a0a] p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Tag className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
          <h4 className="text-xs font-medium text-zinc-300">
            {t('tools.accessoryDetail.referenceCompatibilityTitle', {
              defaultValue: 'Referencia de mercado',
            })}
          </h4>
          <span className="rounded border border-zinc-700/60 bg-zinc-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-zinc-500">
            {t('tools.accessoryDetail.referenceCompatibilityBadge', {
              defaultValue: 'No normativo',
            })}
          </span>
        </div>

        {basis && (
          <p className="mb-3 text-[11px] leading-relaxed text-zinc-500">
            {t('tools.accessoryDetail.referenceCompatibilityBasis', {
              defaultValue: 'The interface is defined by {{standard}}, not by any manufacturer.',
              standard: basis,
            })}
          </p>
        )}

        <p className="mb-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
          {t('tools.accessoryDetail.referenceCompatibilityBrands', {
            defaultValue: 'Marcas del sector',
          })}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {data.brands.map((brand) => (
            <span
              key={brand}
              className="rounded-md border border-zinc-800/70 bg-[#111] px-2 py-1 text-[11px] text-zinc-400"
            >
              {brand}
            </span>
          ))}
        </div>

        {data.note && (
          <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">{data.note}</p>
        )}

        {/* Legal notice — always visible, never collapsible. */}
        <div className="mt-3 flex items-start gap-2 border-t border-zinc-800/60 pt-3">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-600" />
          <p className="text-[10px] leading-relaxed text-zinc-600">
            {t('tools.accessoryDetail.referenceCompatibilityDisclaimer', {
              defaultValue:
                'Las marcas citadas son propiedad de sus respectivos titulares. Se mencionan únicamente a título indicativo, para señalar que la interfaz de unión está definida por la norma aplicable. PIPINGBOX no reproduce datos técnicos de ningún fabricante ni mantiene relación comercial, patrocinio, asociación ni respaldo con ninguna de estas marcas. Consulte siempre la documentación del fabricante antes de especificar.',
            })}
            {data.legalBasis && (
              <span className="ml-1 text-zinc-700">({data.legalBasis})</span>
            )}
          </p>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   Tab: Vista Rápida
   ───────────────────────────────────────────── */

function VistaRapidaTab({
  component,
  drawings,
  activeDrawing,
  selectedSize,
  setSelectedSize,
  consejoOpen,
  setConsejoOpen,
  onSwitchMode,
}: {
  component: CatalogComponent;
  drawings: CatalogDrawing[];
  activeDrawing: CatalogDrawing | undefined;
  selectedSize: string | null;
  setSelectedSize: (v: string | null) => void;
  consejoOpen: boolean;
  setConsejoOpen: (v: boolean) => void;
  onSwitchMode: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        {/* 3D render — asset already carries a dark ground, shown as-is. */}
        <div className="flex max-h-[320px] aspect-square items-center justify-center overflow-hidden rounded-lg border border-zinc-800/80 bg-[#151515]">
          {component.render ? (
            <img
              src={component.render}
              alt={component.name}
              loading="lazy"
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="text-xs text-zinc-600">—</span>
          )}
        </div>

        {/* Key data */}
        <div className="space-y-4">
          {component.description && (
            <p className="text-xs leading-relaxed text-zinc-400">{component.description}</p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <DataChip
              label={t('tools.accessoryDetail.type', { defaultValue: 'Tipo' })}
              value={component.type ? titleCase(component.type) : '—'}
            />
            <DataChip
              label={t('tools.accessoryDetail.family', { defaultValue: 'Familia' })}
              value={component.family ? titleCase(component.family) : '—'}
            />
            <DataChip
              label={t('tools.accessoryDetail.connection', { defaultValue: 'Conexión' })}
              value={
                component.connectionTypes.length
                  ? component.connectionTypes.map(titleCase).join(', ')
                  : '—'
              }
            />
            <DataChip
              label={t('tools.accessoryDetail.sizes', { defaultValue: 'Medidas' })}
              value={drawings.length ? String(drawings.length) : '—'}
            />
          </div>

          {/* Materials */}
          {component.materials.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                {t('tools.accessoryDetail.materials', { defaultValue: 'Materiales' })}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {component.materials.map((m) => (
                  <span
                    key={m}
                    className="rounded-md border border-zinc-800/50 bg-[#0a0a0a] px-2 py-1 text-[11px] text-zinc-400"
                  >
                    {titleCase(m)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Pressure rating. An empty class list is NOT always a gap: ASME
              B16.9 butt-weld fittings and MSS SP-97 butt-weld olets are rated
              by wall thickness, so the basis is shown explicitly instead of
              leaving the reader to assume a class was forgotten. */}
          {(component.ratingBasis || component.pressureRatings.length > 0) && (
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                {t('tools.accessoryDetail.rating', { defaultValue: 'Clasificación de presión' })}
              </p>
              {component.pressureRatings.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {component.pressureRatings.map((r) => (
                    <span
                      key={r}
                      className="rounded-md border border-zinc-800/50 bg-[#0a0a0a] px-2 py-1 font-mono text-[11px] text-zinc-400"
                    >
                      {t('tools.accessoryDetail.classValue', {
                        defaultValue: 'Class {{value}}',
                        value: r,
                      })}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="inline-block rounded-md border border-amber-500/20 bg-amber-500/5 px-2 py-1 text-[11px] text-amber-500/90">
                  {component.ratingBasis === 'wall_thickness'
                    ? t('tools.accessoryDetail.basisWallThickness', {
                        defaultValue: 'Por espesor de pared (schedule), no por clase',
                      })
                    : component.ratingBasis === 'working_pressure'
                      ? t('tools.accessoryDetail.basisWorkingPressure', {
                          defaultValue: 'Por presión de trabajo del fabricante',
                        })
                      : t('tools.accessoryDetail.basisNotApplicable', {
                          defaultValue: 'Sin clase propia',
                        })}
                </span>
              )}
              {component.ratingNote && (
                <p className="text-[11px] leading-relaxed text-zinc-500">{component.ratingNote}</p>
              )}
            </div>
          )}

          {/* Tags */}
          {component.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {component.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded border border-amber-500/20 bg-amber-500/5 px-1.5 py-0.5 text-[10px] text-amber-500/90"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Size selector + the real 2D drawing on a light sheet. */}
      {drawings.length > 0 && (
        <div className="space-y-3">
          <SizeSelector
            drawings={drawings}
            selectedSize={selectedSize}
            setSelectedSize={setSelectedSize}
          />
          {activeDrawing && (
            <DrawingSheet
              src={activeDrawing.src}
              alt={`${component.name} — ${formatSize(activeDrawing.size)}`}
              caption={t('tools.accessoryDetail.drawingCaption', {
                defaultValue: 'Technical drawing — {{size}}',
                size: formatSize(activeDrawing.size),
              })}
            />
          )}
        </div>
      )}

      {/* Fabrication notes — real catalog content. */}
      {component.fabricationNotes.length > 0 && (
        <div className="rounded-lg border border-zinc-800/80 bg-[#111]">
          <button
            onClick={() => setConsejoOpen(!consejoOpen)}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <span className="flex items-center gap-2 text-xs font-medium text-zinc-300">
              <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
              {t('tools.accessoryDetail.fabricationNotes', {
                defaultValue: 'Notas de fabricación',
              })}
            </span>
            <ChevronDown
              className={`h-4 w-4 text-zinc-500 transition-transform ${consejoOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {consejoOpen && (
            <ul className="space-y-2 border-t border-zinc-800/80 px-4 py-3">
              {component.fabricationNotes.map((note, i) => (
                <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-zinc-400">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500/60" />
                  {note}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Level 1 referential mention. Repeated here because "Modo Obra" has no
          Compatibilidades tab, and the disclaimer must travel with the brands
          wherever they are shown — never only in the engineering view. */}
      {component.referenceCompatibility && (
        <ReferenceCompatibilityBlock data={component.referenceCompatibility} />
      )}

      <Button
        onClick={onSwitchMode}
        className="w-full bg-amber-500 text-sm font-medium text-black hover:bg-amber-600 sm:w-auto"
      >
        <Eye className="mr-2 h-4 w-4" />
        Ver ficha completa (Modo Ingeniería)
      </Button>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Tab: Dimensiones
   ───────────────────────────────────────────── */

function DimensionesTab({
  component,
  units,
  drawings,
  activeDrawing,
  selectedSize,
  setSelectedSize,
}: {
  component: CatalogComponent;
  units: UnitSystem;
  drawings: CatalogDrawing[];
  activeDrawing: CatalogDrawing | undefined;
  selectedSize: string | null;
  setSelectedSize: (v: string | null) => void;
}) {
  const { t } = useTranslation();
  const sets = useMemo(() => getDimensionSets(component), [component]);

  return (
    <div className="space-y-5">
      <SizeSelector
        drawings={drawings}
        selectedSize={selectedSize}
        setSelectedSize={setSelectedSize}
      />

      {/* The selected size's real drawing, on its proper light ground. */}
      {activeDrawing && (
        <DrawingSheet
          src={activeDrawing.src}
          alt={`${component.name} — ${formatSize(activeDrawing.size)}`}
          caption={t('tools.accessoryDetail.drawingCaption', {
            defaultValue: 'Technical drawing — {{size}}',
            size: formatSize(activeDrawing.size),
          })}
        />
      )}

      {sets.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-800 bg-[#0a0a0a] px-4 py-8 text-center text-xs text-zinc-500">
          {t('tools.accessoryDetail.noDimensions', {
            defaultValue: 'No dimensional data available for this component.',
          })}
        </p>
      ) : (
        sets.map((set) => (
          <DimensionTable key={set.id} set={set} units={units} selectedSize={selectedSize} />
        ))
      )}
    </div>
  );
}

function DimensionTable({
  set,
  units,
  selectedSize,
}: {
  set: DimensionSet;
  units: UnitSystem;
  selectedSize: string | null;
}) {
  const { t } = useTranslation();
  const standard = set.standardId ? getStandard(set.standardId) : undefined;
  const fields = useMemo(() => fieldsForUnits(set.fields, units), [set.fields, units]);
  const columns = [...set.selectors, ...fields];

  // Highlight the row matching the selected drawing, when the set exposes NPS.
  const npsSelector = set.selectors.find((s) => s.key === 'nps');
  const selectedLabel = selectedSize ? formatSize(selectedSize).replace(/"/g, '') : null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <h4 className="text-sm font-medium text-zinc-100">
          {standard
            ? [standard.organization, standard.code].filter(Boolean).join(' ')
            : titleCase(set.id)}
        </h4>
        <span className="text-[10px] text-zinc-500">
          {t('tools.accessoryDetail.rowCount', {
            defaultValue: '{{count}} rows',
            count: set.rows.length,
          })}
        </span>
      </div>

      {/* Horizontal scroll keeps wide engineering tables usable on mobile. */}
      <div className="overflow-x-auto rounded-lg border border-zinc-800/80">
        <table className="w-full min-w-[520px] text-xs">
          <thead>
            <tr className="border-b border-zinc-800/80 bg-[#111]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="whitespace-nowrap px-3 py-2 text-left font-medium text-zinc-400"
                >
                  {col.label}
                  {col.unit && col.unit !== 'dimensionless' && col.unit !== 'count' && (
                    <span className="ml-1 text-zinc-600">({col.unit})</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {set.rows.map((row, i) => {
              const isSelected =
                Boolean(npsSelector) &&
                selectedLabel !== null &&
                String(row[npsSelector!.key] ?? '').trim() === selectedLabel.trim();
              return (
                <tr
                  key={i}
                  className={`border-b border-zinc-800/50 transition-colors last:border-0 ${
                    isSelected
                      ? 'border-l-2 border-l-amber-500 bg-amber-500/5'
                      : 'hover:bg-white/[0.03]'
                  }`}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className="whitespace-nowrap px-3 py-2 font-mono text-zinc-300"
                    >
                      {displayValue(row[col.key])}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Tab: Normativa
   ───────────────────────────────────────────── */

function NormativaTab({ component }: { component: CatalogComponent }) {
  const { t } = useTranslation();

  if (component.standards.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-800 bg-[#0a0a0a] px-4 py-8 text-center text-xs text-zinc-500">
        {t('tools.accessoryDetail.noStandards', {
          defaultValue: 'No standards referenced for this component.',
        })}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {component.standards.map((ref) => {
        const std = getStandard(ref.standardId);
        if (!std) {
          return (
            <div
              key={ref.standardId}
              className="rounded-lg border border-zinc-800/80 bg-[#111] p-4"
            >
              <p className="font-mono text-xs text-zinc-400">{ref.standardId}</p>
            </div>
          );
        }
        return (
          <div key={ref.standardId} className="space-y-3 rounded-lg border border-zinc-800/80 bg-[#111] p-4">
            <div className="flex items-start gap-2">
              <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-zinc-100">
                  {[std.organization, std.code].filter(Boolean).join(' ') || std.id}
                </p>
                {std.title && <p className="text-xs text-zinc-400">{std.title}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <MetaCell
                label={t('tools.accessoryDetail.organization', { defaultValue: 'Organización' })}
                value={displayValue(std.organization)}
              />
              {/* Never invent an edition. */}
              <MetaCell
                label={t('tools.accessoryDetail.edition', { defaultValue: 'Edición' })}
                value={
                  std.edition ??
                  t('tools.accessoryDetail.editionUnspecified', {
                    defaultValue: 'Edition not specified',
                  })
                }
              />
              <MetaCell
                label={t('tools.accessoryDetail.role', { defaultValue: 'Rol' })}
                value={ref.role ? titleCase(ref.role) : '—'}
              />
            </div>

            {std.scope && (
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                  {t('tools.accessoryDetail.scope', { defaultValue: 'Alcance' })}
                </p>
                <p className="text-xs leading-relaxed text-zinc-400">{std.scope}</p>
              </div>
            )}

            {ref.note && <p className="text-[11px] italic text-zinc-500">{ref.note}</p>}
          </div>
        );
      })}
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-800/50 bg-[#0a0a0a] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-0.5 text-xs text-zinc-300">{value}</p>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Tab: Compatibilidades
   ───────────────────────────────────────────── */

function CompatibilidadesTab({ component }: { component: CatalogComponent }) {
  const { t } = useTranslation();
  const reference = component.referenceCompatibility;

  if (component.compatibleWith.length === 0) {
    return (
      <div>
        <p className="rounded-lg border border-dashed border-zinc-800 bg-[#0a0a0a] px-4 py-8 text-center text-xs text-zinc-500">
          {t('tools.accessoryDetail.noCompatibilities', {
            defaultValue: 'No compatibility data recorded for this component.',
          })}
        </p>
        {reference && <ReferenceCompatibilityBlock data={reference} />}
      </div>
    );
  }

  return (
    <div>
      {/* Level 0 — standard-derived compatibility. */}
      <div className="space-y-3">
        {component.compatibleWith.map((item, idx) => {
          // `conditions` is a free-form record in the generated data; render
          // whatever keys exist rather than assuming a fixed shape.
          const conditions =
            item.conditions && typeof item.conditions === 'object'
              ? Object.entries(item.conditions as Record<string, unknown>)
              : [];

          return (
            <div key={idx} className="rounded-lg border border-zinc-800/80 bg-[#111] p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Link2 className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-sm font-medium text-zinc-100">
                  {item.target ? titleCase(item.target) : '—'}
                </span>
                {item.relation && (
                  <span className="text-[10px] text-zinc-500">→ {titleCase(item.relation)}</span>
                )}
              </div>

              {conditions.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {conditions.map(([key, value]) => (
                    <span
                      key={key}
                      className="rounded-md border border-zinc-800/50 bg-[#0a0a0a] px-2 py-1 text-[11px] text-zinc-400"
                    >
                      <span className="text-zinc-500">{titleCase(key)}:</span>{' '}
                      {typeof value === 'boolean'
                        ? value
                          ? t('common.yes', { defaultValue: 'Sí' })
                          : t('common.no', { defaultValue: 'No' })
                        : displayValue(value as string | number | null)}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-zinc-600">—</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Level 1 — referential, kept below and visually separated. */}
      {reference && <ReferenceCompatibilityBlock data={reference} />}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Tab: Descargas
   ───────────────────────────────────────────── */

function DescargasTab({
  component,
  activeDrawing,
}: {
  component: CatalogComponent;
  activeDrawing: CatalogDrawing | undefined;
}) {
  const { t } = useTranslation();

  const downloads: { name: string; format: string; href: string; icon: typeof Download }[] = [];

  if (activeDrawing) {
    downloads.push({
      name: t('tools.accessoryDetail.download2d', {
        defaultValue: '2D drawing — {{size}}',
        size: formatSize(activeDrawing.size),
      }),
      format: 'SVG',
      href: activeDrawing.src,
      icon: FileText,
    });
  }

  if (component.render) {
    downloads.push({
      name: t('tools.accessoryDetail.download3d', { defaultValue: '3D render' }),
      format: 'WEBP',
      href: component.render,
      icon: Box,
    });
  }

  if (downloads.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-800 bg-[#0a0a0a] px-4 py-8 text-center text-xs text-zinc-500">
        {t('tools.accessoryDetail.noDownloads', { defaultValue: 'No assets available.' })}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {downloads.map((dl) => {
        const Icon = dl.icon;
        return (
          <div
            key={dl.href}
            className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800/80 bg-[#111] p-4"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-500/10">
                <Icon className="h-4 w-4 text-amber-500" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-zinc-200">{dl.name}</p>
                <p className="truncate font-mono text-[10px] text-zinc-500">
                  {dl.format} · {dl.href}
                </p>
              </div>
            </div>
            <a
              href={dl.href}
              download
              className="shrink-0 rounded-md border border-zinc-800 px-3 py-1.5 text-[11px] text-zinc-400 transition-colors hover:border-amber-500/30 hover:text-amber-500"
            >
              {t('common.download', { defaultValue: 'Descargar' })}
            </a>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Helper: DataChip
   ───────────────────────────────────────────── */

function DataChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-800/80 bg-[#111] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-0.5 font-mono text-sm text-zinc-200">{value}</p>
    </div>
  );
}
