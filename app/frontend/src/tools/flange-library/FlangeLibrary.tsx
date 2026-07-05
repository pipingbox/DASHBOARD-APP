import { useState, useMemo } from 'react';
import {
  Search,
  Cog,
  Ruler,
  Weight,
  Bolt,
  CircleDot,
  ChevronRight,
  X,
  Download,
  ShieldCheck,
  BookOpen,
  Wrench,
  AlertTriangle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  FLANGE_SPECS,
  FLANGE_TYPES,
  PRESSURE_CLASSES,
  NPS_SIZES,
  type FlangeSpec,
  type FlangeType,
  type PressureClass,
} from './flange-data';
import { getGasketForFlange, getStudBoltForFlange, type GasketSpec, type StudBoltSpec } from './gasket-bolt-data';

/**
 * TICKET-001 Fase 2: Flange Library — the killer differentiator.
 *
 * Visual component library with:
 * - Filter by type (WN/SO/BL), pressure class (150#/300#), NPS
 * - SVG technical drawing for each flange type
 * - Full dimension table (ASME B16.5)
 * - Weight, bolt info, gasket cross-link data
 * - Search by NPS
 *
 * No competitor has this level of visual + data integration.
 */

export function FlangeLibrary({ user }: { user?: { id: string } | null }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<FlangeType | 'all'>('all');
  const [classFilter, setClassFilter] = useState<PressureClass | 'all'>('all');
  const [npsFilter, setNpsFilter] = useState<string>('all');
  const [selectedSpec, setSelectedSpec] = useState<FlangeSpec | null>(null);

  const filteredSpecs = useMemo(() => {
    return FLANGE_SPECS.filter((spec) => {
      if (typeFilter !== 'all' && spec.type !== typeFilter) return false;
      if (classFilter !== 'all' && spec.pressureClass !== classFilter) return false;
      if (npsFilter !== 'all' && spec.nps !== npsFilter) return false;
      if (search && !spec.nps.includes(search) && !spec.typeLabel.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [search, typeFilter, classFilter, npsFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-sm">
            ASME B16.5
          </span>
          <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20 rounded-sm">
            Technical Library
          </span>
        </div>
        <h2 className="text-xl font-bold text-zinc-100">Flange Library</h2>
        <p className="text-sm text-zinc-500 max-w-2xl">
          Visual reference for ASME B16.5 flanges. Select by type, pressure class, and size.
          Includes dimensions, weights, bolt data, and gasket compatibility.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="flex items-center gap-2 rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-1.5">
          <Search className="h-4 w-4 text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search NPS..."
            className="h-7 w-[120px] bg-transparent text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
          />
        </div>

        {/* Type filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-zinc-600">Type:</span>
          <FilterChip label="All" active={typeFilter === 'all'} onClick={() => setTypeFilter('all')} />
          {FLANGE_TYPES.map((ft) => (
            <FilterChip
              key={ft.type}
              label={ft.label}
              active={typeFilter === ft.type}
              onClick={() => setTypeFilter(ft.type)}
            />
          ))}
        </div>

        {/* Class filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-zinc-600">Class:</span>
          <FilterChip label="All" active={classFilter === 'all'} onClick={() => setClassFilter('all')} />
          {PRESSURE_CLASSES.map((pc) => (
            <FilterChip
              key={pc}
              label={pc}
              active={classFilter === pc}
              onClick={() => setClassFilter(pc)}
            />
          ))}
        </div>

        {/* NPS filter */}
        {npsFilter !== 'all' && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-zinc-600">Size:</span>
            <FilterChip label={npsFilter} active={true} onClick={() => setNpsFilter('all')} />
          </div>
        )}

        <span className="ml-auto text-[10px] text-zinc-600">
          {filteredSpecs.length} flanges
        </span>
      </div>

      {/* Quick NPS selector */}
      <div className="flex flex-wrap gap-1.5">
        {NPS_SIZES.map((nps) => (
          <button
            key={nps}
            onClick={() => setNpsFilter(npsFilter === nps ? 'all' : nps)}
            className={`px-2 py-1 rounded-sm text-[10px] font-medium transition ${
              npsFilter === nps
                ? 'bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/30'
                : 'bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300'
            }`}
          >
            {nps}
          </button>
        ))}
      </div>

      {/* Cards grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredSpecs.map((spec, idx) => (
          <FlangeCard
            key={`${spec.type}-${spec.pressureClass}-${spec.nps}-${idx}`}
            spec={spec}
            onClick={() => setSelectedSpec(spec)}
          />
        ))}
      </div>

      {filteredSpecs.length === 0 && (
        <div className="border border-zinc-800/60 bg-[#0d0d0d] rounded-sm p-8 text-center">
          <BookOpen className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
          <p className="text-xs text-zinc-500">No flanges match your filters.</p>
        </div>
      )}

      {/* Detail modal */}
      {selectedSpec && (
        <FlangeDetailModal spec={selectedSpec} onClose={() => setSelectedSpec(null)} />
      )}
    </div>
  );
}

/* ─── Filter Chip ─── */
function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-sm text-[10px] uppercase tracking-wider font-medium transition ${
        active
          ? 'bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/30'
          : 'bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300'
      }`}
    >
      {label}
    </button>
  );
}

/* ─── Flange Card ─── */
function FlangeCard({ spec, onClick }: { spec: FlangeSpec; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group border border-zinc-800/80 bg-[#0d0d0d] rounded-sm overflow-hidden hover:border-[#f59e0b]/40 transition-all duration-300 text-left"
    >
      {/* SVG drawing */}
      <div className="relative h-32 bg-gradient-to-br from-zinc-900 to-[#0d0d0d] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#f59e0b]/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <FlangeSVG type={spec.type} compact />

        {/* Type badge */}
        <div className="absolute top-2 left-2">
          <span className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider bg-zinc-900/80 text-zinc-400 rounded-sm">
            {spec.type}
          </span>
        </div>

        {/* Class badge */}
        <div className="absolute top-2 right-2">
          <span className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20 rounded-sm">
            {spec.pressureClass}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="p-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-zinc-100 group-hover:text-[#f59e0b] transition-colors">
            NPS {spec.nps}
          </p>
          <span className="text-[10px] text-zinc-500">{spec.typeLabel}</span>
        </div>

        <div className="grid grid-cols-3 gap-1 text-[10px]">
          <div className="flex items-center gap-1 text-zinc-500">
            <Ruler className="h-2.5 w-2.5" />
            Ø{spec.od}
          </div>
          <div className="flex items-center gap-1 text-zinc-500">
            <Bolt className="h-2.5 w-2.5" />
            {spec.numBolts}×{spec.boltSize}
          </div>
          <div className="flex items-center gap-1 text-zinc-500">
            <Weight className="h-2.5 w-2.5" />
            {spec.weight}kg
          </div>
        </div>
      </div>
    </button>
  );
}

/* ─── SVG Technical Drawings ─── */
function FlangeSVG({ type, compact = false }: { type: FlangeType; compact?: boolean }) {
  const stroke = '#52525b';
  const accent = '#f59e0b';
  const w = compact ? 100 : 200;
  const h = compact ? 80 : 140;
  const cx = w / 2;

  if (type === 'WN') {
    // Weld Neck: flange disc + hub taper + pipe
    return (
      <svg width={w} height={h} viewBox="0 0 100 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Pipe */}
        <line x1="5" y1="35" x2="30" y2="35" stroke={stroke} strokeWidth="1.5" />
        <line x1="5" y1="45" x2="30" y2="45" stroke={stroke} strokeWidth="1.5" />
        {/* Hub taper */}
        <line x1="30" y1="35" x2="40" y2="25" stroke={stroke} strokeWidth="1.5" />
        <line x1="30" y1="45" x2="40" y2="55" stroke={stroke} strokeWidth="1.5" />
        <line x1="40" y1="25" x2="40" y2="55" stroke={stroke} strokeWidth="1.5" />
        {/* Flange body */}
        <rect x="40" y="15" width="20" height="50" stroke={stroke} strokeWidth="1.5" fill="#18181b" />
        {/* Bolt holes */}
        <circle cx="50" cy="20" r="2" stroke={accent} strokeWidth="1" fill="none" />
        <circle cx="50" cy="40" r="2" stroke={accent} strokeWidth="1" fill="none" />
        <circle cx="50" cy="60" r="2" stroke={accent} strokeWidth="1" fill="none" />
        {/* Right side pipe continuation */}
        <line x1="60" y1="25" x2="60" y2="55" stroke={stroke} strokeWidth="1.5" />
        <line x1="60" y1="30" x2="90" y2="30" stroke={stroke} strokeWidth="1.5" />
        <line x1="60" y1="50" x2="90" y2="50" stroke={stroke} strokeWidth="1.5" />
        {/* Center line */}
        <line x1="0" y1="40" x2="100" y2="40" stroke={stroke} strokeWidth="0.5" strokeDasharray="2,2" />
      </svg>
    );
  }

  if (type === 'SO') {
    // Slip-On: flange disc + pipe slips through
    return (
      <svg width={w} height={h} viewBox="0 0 100 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Pipe (goes through flange) */}
        <line x1="5" y1="33" x2="95" y2="33" stroke={stroke} strokeWidth="1.5" />
        <line x1="5" y1="47" x2="95" y2="47" stroke={stroke} strokeWidth="1.5" />
        {/* Flange body (over pipe) */}
        <rect x="35" y="15" width="25" height="50" stroke={stroke} strokeWidth="1.5" fill="#18181b" />
        {/* Weld fillet on left */}
        <path d="M35,33 L33,30 L35,33 L33,36 Z" stroke={accent} strokeWidth="1" fill="none" />
        <path d="M35,47 L33,44 L35,47 L33,50 Z" stroke={accent} strokeWidth="1" fill="none" />
        {/* Weld fillet on right */}
        <path d="M60,33 L62,30 L60,33 L62,36 Z" stroke={accent} strokeWidth="1" fill="none" />
        <path d="M60,47 L62,44 L60,47 L62,50 Z" stroke={accent} strokeWidth="1" fill="none" />
        {/* Bolt holes */}
        <circle cx="47.5" cy="20" r="2" stroke={accent} strokeWidth="1" fill="none" />
        <circle cx="47.5" cy="40" r="2" stroke={accent} strokeWidth="1" fill="none" />
        <circle cx="47.5" cy="60" r="2" stroke={accent} strokeWidth="1" fill="none" />
        {/* Center line */}
        <line x1="0" y1="40" x2="100" y2="40" stroke={stroke} strokeWidth="0.5" strokeDasharray="2,2" />
      </svg>
    );
  }

  // BL: Blind (solid disc, no bore)
  return (
    <svg width={w} height={h} viewBox="0 0 100 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Blind flange (solid) */}
      <rect x="35" y="15" width="25" height="50" stroke={stroke} strokeWidth="1.5" fill="#27272a" />
      {/* Solid face indication */}
      <line x1="35" y1="15" x2="35" y2="65" stroke={stroke} strokeWidth="3" />
      {/* Bolt holes */}
      <circle cx="47.5" cy="20" r="2" stroke={accent} strokeWidth="1" fill="none" />
      <circle cx="47.5" cy="40" r="2" stroke={accent} strokeWidth="1" fill="none" />
      <circle cx="47.5" cy="60" r="2" stroke={accent} strokeWidth="1" fill="none" />
      {/* Hatching (indicates solid) */}
      <line x1="37" y1="17" x2="40" y2="20" stroke={stroke} strokeWidth="0.5" />
      <line x1="37" y1="22" x2="42" y2="27" stroke={stroke} strokeWidth="0.5" />
      <line x1="37" y1="27" x2="44" y2="34" stroke={stroke} strokeWidth="0.5" />
      <line x1="37" y1="32" x2="46" y2="41" stroke={stroke} strokeWidth="0.5" />
      <line x1="37" y1="37" x2="48" y2="48" stroke={stroke} strokeWidth="0.5" />
      <line x1="37" y1="42" x2="48" y2="53" stroke={stroke} strokeWidth="0.5" />
      <line x1="37" y1="47" x2="46" y2="56" stroke={stroke} strokeWidth="0.5" />
      <line x1="37" y1="52" x2="44" y2="59" stroke={stroke} strokeWidth="0.5" />
      <line x1="37" y1="57" x2="42" y2="62" stroke={stroke} strokeWidth="0.5" />
      <line x1="37" y1="62" x2="40" y2="65" stroke={stroke} strokeWidth="0.5" />
      {/* Center line */}
      <line x1="0" y1="40" x2="100" y2="40" stroke={stroke} strokeWidth="0.5" strokeDasharray="2,2" />
    </svg>
  );
}

/* ─── Detail Modal ─── */
function FlangeDetailModal({ spec, onClose }: { spec: FlangeSpec; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-3xl bg-[#0a0a0a] border border-zinc-800 rounded-sm shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20 rounded-sm">
                {spec.pressureClass}
              </span>
              <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-sm">
                ASME B16.5
              </span>
              <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-zinc-800 text-zinc-400 rounded-sm">
                {spec.facing}
              </span>
            </div>
            <h3 className="text-lg font-bold text-zinc-100">
              {spec.typeLabel} Flange — NPS {spec.nps}
            </h3>
            <p className="text-xs text-zinc-500">
              {spec.pressureClass} · {spec.facing} · {spec.typeLabel}
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          {/* SVG + key dimensions */}
          <div className="grid gap-4 md:grid-cols-[1fr_300px]">
            <div className="border border-zinc-800/60 bg-zinc-950/50 rounded-sm p-6 flex items-center justify-center min-h-[200px]">
              <FlangeSVG type={spec.type} />
            </div>

            <div className="space-y-3">
              <h4 className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">Key Dimensions</h4>
              <DimRow label="Outside Diameter (OD)" value={`${spec.od} mm`} icon={CircleDot} />
              <DimRow label="Flange Thickness" value={`${spec.flangeThickness} mm`} icon={Ruler} />
              <DimRow label="Bolt Circle Diameter" value={`${spec.boltCircleDiameter} mm`} icon={CircleDot} />
              <DimRow label="Pipe OD" value={`${spec.pipeOD} mm`} icon={Ruler} />
              {spec.hubLength && (
                <DimRow label="Hub Length" value={`${spec.hubLength} mm`} icon={Ruler} />
              )}
              {spec.boreDiameter && (
                <DimRow label="Bore Diameter" value={`${spec.boreDiameter} mm`} icon={CircleDot} />
              )}
              <DimRow label="Weight (approx)" value={`${spec.weight} kg`} icon={Weight} />
            </div>
          </div>

          {/* Bolt data */}
          <div className="border border-zinc-800/60 bg-zinc-950/30 rounded-sm p-4 space-y-3">
            <h4 className="flex items-center gap-2 text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">
              <Bolt className="h-3.5 w-3.5" />
              Bolt & Stud Data
            </h4>
            <div className="grid gap-3 sm:grid-cols-4">
              <DimBox label="Number of Bolts" value={String(spec.numBolts)} />
              <DimBox label="Bolt Size" value={spec.boltSize} />
              <DimBox label="Bolt Hole Ø" value={`${spec.boltHoleDiameter} mm`} />
              <DimBox label="Stud Length" value={`${spec.studLength} mm`} />
            </div>
          </div>

          {/* Gasket cross-link (Fase 3) */}
          {(() => {
            const gasket = getGasketForFlange(spec.nps, spec.pressureClass);
            if (!gasket) return null;
            return (
              <div className="border border-[#f59e0b]/20 bg-[#f59e0b]/5 rounded-sm p-4 space-y-3">
                <h4 className="flex items-center gap-2 text-[10px] uppercase tracking-[0.15em] text-[#f59e0b] font-semibold">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Compatible Gasket
                </h4>
                <div className="grid gap-3 sm:grid-cols-4">
                  <DimBox label="Type" value={gasket.type} />
                  <DimBox label="Material" value={gasket.material} />
                  <DimBox label="Inner Ø" value={`${gasket.innerDiameter} mm`} />
                  <DimBox label="Outer Ø" value={`${gasket.outerDiameter} mm`} />
                  <DimBox label="Thickness" value={`${gasket.thickness} mm`} />
                  <DimBox label="Seal Type" value={gasket.sealType} />
                </div>
                <p className="text-[10px] text-zinc-500 leading-relaxed">
                  Gasket dimensions per ASME B16.20 (spiral wound) / ASME B16.21 (non-metallic).
                  For {spec.pressureClass === '900#' || spec.pressureClass === '1500#' ? 'high-pressure service, RTJ ring joint recommended' : 'RF flanges, spiral wound CGI is standard'}.
                  Always verify against the gasket manufacturer's specification.
                </p>
              </div>
            );
          })()}

          {/* Stud bolt + torque cross-link (Fase 3) */}
          {(() => {
            const stud = getStudBoltForFlange(spec.boltSize, spec.numBolts, spec.studLength, spec.nps, spec.pressureClass);
            if (!stud) return null;
            return (
              <div className="border border-blue-500/20 bg-blue-500/5 rounded-sm p-4 space-y-3">
                <h4 className="flex items-center gap-2 text-[10px] uppercase tracking-[0.15em] text-blue-400 font-semibold">
                  <Bolt className="h-3.5 w-3.5" />
                  Stud Bolts & Torque (ASME PCC-1)
                </h4>
                <div className="grid gap-3 sm:grid-cols-4">
                  <DimBox label="Quantity" value={String(stud.quantity)} />
                  <DimBox label="Stud Size" value={stud.studDiameter} />
                  <DimBox label="Stud Ø (mm)" value={`${stud.studDiameterMm} mm`} />
                  <DimBox label="Stud Length" value={`${stud.studLength} mm`} />
                  <DimBox label="Nut Size" value={stud.nutSize} />
                  <DimBox label="Torque (min)" value={`${stud.torqueMin} Nm`} />
                  <DimBox label="Torque (target)" value={`${stud.torqueLubricated} Nm`} highlight />
                  <DimBox label="Torque (max)" value={`${stud.torqueMax} Nm`} />
                </div>

                {/* Torque pattern */}
                <div className="border-t border-blue-500/10 pt-3 space-y-2">
                  <p className="text-[10px] uppercase tracking-wider text-blue-400 font-medium">Tightening Pattern</p>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Use a <strong className="text-zinc-300">crisscross (star) pattern</strong> in minimum 3 passes:
                  </p>
                  <ol className="space-y-1 text-[11px] text-zinc-400">
                    <li><span className="text-blue-400 font-bold">1.</span> Pass 1: 30% of target torque — tighten in star pattern</li>
                    <li><span className="text-blue-400 font-bold">2.</span> Pass 2: 70% of target torque — tighten in star pattern</li>
                    <li><span className="text-blue-400 font-bold">3.</span> Pass 3: 100% of target torque — tighten in star pattern</li>
                    <li><span className="text-blue-400 font-bold">4.</span> Final pass: 100% clockwise — verify all bolts</li>
                  </ol>
                </div>

                <div className="flex items-start gap-2 border-t border-blue-500/10 pt-3">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-zinc-500 leading-relaxed">
                    Torque values are guidelines for lubricated studs (anti-seize or copper grease) at ambient temperature.
                    For elevated temperature, exotic materials, or critical service, consult ASME PCC-1 and your company procedure.
                    Dry torque requires ~30% more force (not recommended).
                  </p>
                </div>
              </div>
            );
          })()}

          {/* Full dimension table */}
          <div className="space-y-2">
            <h4 className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">Full Dimensions (mm)</h4>
            <div className="border border-zinc-800/60 rounded-sm overflow-hidden">
              <table className="w-full text-xs">
                <tbody>
                  {spec.hubDiameterEnd && (
                    <DimTableRow label="Hub Diameter at Face" value={`${spec.hubDiameterEnd} mm`} />
                  )}
                  {spec.hubDiameterBase && (
                    <DimTableRow label="Hub Diameter at Base" value={`${spec.hubDiameterBase} mm`} />
                  )}
                  <DimTableRow label="Outside Diameter" value={`${spec.od} mm`} />
                  <DimTableRow label="Flange Thickness" value={`${spec.flangeThickness} mm`} />
                  <DimTableRow label="Bolt Circle Diameter" value={`${spec.boltCircleDiameter} mm`} />
                  <DimTableRow label="Number of Bolts" value={String(spec.numBolts)} />
                  <DimTableRow label="Bolt Hole Diameter" value={`${spec.boltHoleDiameter} mm`} />
                  <DimTableRow label="Bolt Size" value={spec.boltSize} />
                  <DimTableRow label="Stud Length (approx)" value={`${spec.studLength} mm`} />
                  {spec.hubLength && (
                    <DimTableRow label="Hub Length" value={`${spec.hubLength} mm`} />
                  )}
                  {spec.boreDiameter && (
                    <DimTableRow label="Bore Diameter" value={`${spec.boreDiameter} mm`} />
                  )}
                  <DimTableRow label="Pipe OD" value={`${spec.pipeOD} mm`} />
                  <DimTableRow label="Weight (approx)" value={`${spec.weight} kg`} />
                </tbody>
              </table>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="text-[10px] text-zinc-600 leading-relaxed border-t border-zinc-800 pt-3">
            <strong>Disclaimer:</strong> Dimensions per ASME B16.5. This reference is for informational purposes only.
            Always verify against the current ASME B16.5 edition for design and fabrication.
            PipingBox is not affiliated with ASME.
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-zinc-800">
          <span className="text-[10px] text-zinc-600">
            Standard: ASME B16.5 · Facing: {spec.facing} · {spec.typeLabel}
          </span>
          <button
            className="flex items-center gap-1.5 text-xs text-[#f59e0b] hover:underline"
            onClick={() => toast('PDF export coming with Premium tier (Fase 6)')}
          >
            <Download className="h-3.5 w-3.5" />
            Export PDF
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */
function DimRow({ label, value, icon: Icon }: { label: string; value: string; icon: React.ElementType }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="flex items-center gap-1.5 text-zinc-500">
        <Icon className="h-3 w-3" />
        {label}
      </span>
      <span className="text-zinc-200 font-medium">{value}</span>
    </div>
  );
}

function DimBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`border rounded-sm p-2.5 space-y-1 ${
      highlight ? 'border-[#f59e0b]/40 bg-[#f59e0b]/5' : 'border-zinc-800/60 bg-zinc-950/50'
    }`}>
      <p className="text-[9px] uppercase tracking-wider text-zinc-600">{label}</p>
      <p className={`text-sm font-semibold ${highlight ? 'text-[#f59e0b]' : 'text-zinc-200'}`}>{value}</p>
    </div>
  );
}

function DimTableRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-zinc-800/40 last:border-0">
      <td className="px-3 py-2 text-zinc-500">{label}</td>
      <td className="px-3 py-2 text-right text-zinc-200 font-medium">{value}</td>
    </tr>
  );
}

// Simple toast stub (since we don't import sonner here to keep it standalone)
function toast(message: string) {
  console.log('[FlangeLibrary]', message);
}
