import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Scissors } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  solvePipeCombFabrication,
  type PipeCombFabricationSolution,
  type FabricationPiece,
} from './pipe-comb-fabrication';
import type { LengthUnit } from '@/tools/core/units';
import {
  createLengthField,
  lengthFieldOnEdit,
  lengthFieldOnUnitChange,
  parseLengthInputToMm,
  formatLengthForUnit,
  type LengthFieldState,
} from './number-input';
import { PIPE_DIMENSIONS } from '@/tools/core/standards/generated/pipe-dimensions';

/**
 * PB-PIPE-COMB-CORRECTION-001 / P3-B — fabrication & cut list section.
 *
 * OPTIONAL, COLLAPSED BY DEFAULT. The P2 basic experience (inputs, results,
 * schematic) is untouched: this section only READS the canonical P2 geometry
 * (pipe count, Di, Df, angle) and the active unit — it never keeps a second
 * editable copy of those inputs.
 *
 * All fabrication numbers come EXCLUSIVELY from the approved P3-A module
 * `solvePipeCombFabrication` (which in turn delegates the stagger to the P1
 * kernel). No formula is reproduced in React; the UI maps module states
 * (`geometryValid`, `cutPlanValid`, piece `status`, `warnings`) to
 * presentation instead of re-validating in parallel.
 *
 * Input policy (inherited from number-input.ts): canonical physical mm at
 * full precision; unit toggles re-render text only; one point OR one comma;
 * ambiguous mixes rejected. An empty optional field (Lin/Lout) is absence,
 * NOT zero; an invalid text blocks the plan (state "review") instead of
 * silently falling back to the last valid value.
 */

/** Unique NPS options from the B36.10M layer, in table order. */
const NPS_OPTIONS: readonly string[] = [...new Set(PIPE_DIMENSIONS.map((r) => r.nps))];

export interface PipeCombFabGeometry {
  pipeCount: number;
  initialSpacingMm: number;
  finalSpacingMm: number;
  elbowAngleDeg: number;
}

type FabStatus =
  | 'closed'
  | 'p2-invalid'
  | 'review'
  | 'pending-refs'
  | 'invalid-plan'
  | 'complete'
  | 'complete-warnings';

interface FabState {
  status: FabStatus;
  /** Module error code when the solver rejected the input. */
  errorCode?: string;
  /** Review reason key when inputs are incomplete/invalid before solving. */
  reviewReason?: 'nps' | 'clr' | 'adjust' | 'lin' | 'lout';
  sol?: PipeCombFabricationSolution;
}

interface PipeCombFabricationSectionProps {
  unit: LengthUnit;
  /** Canonical P2 geometry; null while the basic inputs are invalid. */
  geometry: PipeCombFabGeometry | null;
}

/** A field is "filled and valid" when its visible text parses. */
function fieldValid(field: LengthFieldState): boolean {
  return field.text.trim() !== '' && parseLengthInputToMm(field.text, field.unit) !== null;
}

/** A field is empty (absence) — distinct from invalid text. */
function fieldEmpty(field: LengthFieldState): boolean {
  return field.text.trim() === '';
}

export default function PipeCombFabricationSection({ unit, geometry }: PipeCombFabricationSectionProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [nps, setNps] = useState('');
  const [elbowMode, setElbowMode] = useState<'catalog' | 'bend'>('catalog');
  const [radiusType, setRadiusType] = useState<'LR' | 'SR'>('LR');
  // Canonical mm fields; unit toggles only re-render their display text.
  const [clrField, setClrField] = useState<LengthFieldState>(() => ({ text: '', canonicalMm: null, unit: 'mm' }));
  const [linField, setLinField] = useState<LengthFieldState>(() => ({ text: '', canonicalMm: null, unit: 'mm' }));
  const [loutField, setLoutField] = useState<LengthFieldState>(() => ({ text: '', canonicalMm: null, unit: 'mm' }));
  const [gapField, setGapField] = useState<LengthFieldState>(() => createLengthField(0, 'mm'));
  const [allowField, setAllowField] = useState<LengthFieldState>(() => createLengthField(0, 'mm'));

  // Entries survive close/reopen during the session (state lives here).
  useEffect(() => {
    setClrField((f) => lengthFieldOnUnitChange(f, unit));
    setLinField((f) => lengthFieldOnUnitChange(f, unit));
    setLoutField((f) => lengthFieldOnUnitChange(f, unit));
    setGapField((f) => lengthFieldOnUnitChange(f, unit));
    setAllowField((f) => lengthFieldOnUnitChange(f, unit));
  }, [unit]);

  const fab: FabState = useMemo(() => {
    if (!open) return { status: 'closed' };
    if (!geometry) return { status: 'p2-invalid' };
    const bend = elbowMode === 'bend';
    if (nps === '') return { status: 'review', reviewReason: 'nps' };
    if (bend && !fieldValid(clrField)) return { status: 'review', reviewReason: 'clr' };
    if (!fieldValid(gapField) || !fieldValid(allowField)) return { status: 'review', reviewReason: 'adjust' };
    // Lin/Lout: empty = absence (optional); non-empty invalid text = review.
    if (!fieldEmpty(linField) && !fieldValid(linField)) return { status: 'review', reviewReason: 'lin' };
    if (!fieldEmpty(loutField) && !fieldValid(loutField)) return { status: 'review', reviewReason: 'lout' };

    const references: Record<string, number> = {};
    if (!fieldEmpty(linField)) references.inletAxisToAxisMm = parseLengthInputToMm(linField.text, linField.unit) as number;
    if (!fieldEmpty(loutField)) references.outletAxisToAxisMm = parseLengthInputToMm(loutField.text, loutField.unit) as number;
    // Weld gap is always handed to the module: in bend mode the module keeps
    // it, does NOT apply it, and emits weld_gap_not_applicable_bend — the
    // module's own treatment is the single source of this state.
    references.weldGapMm = parseLengthInputToMm(gapField.text, gapField.unit) as number;
    references.fittingAllowanceMm = parseLengthInputToMm(allowField.text, allowField.unit) as number;

    const res = solvePipeCombFabrication({
      pipeCount: geometry.pipeCount,
      initialSpacingMm: geometry.initialSpacingMm,
      finalSpacingMm: geometry.finalSpacingMm,
      elbowAngleDeg: geometry.elbowAngleDeg,
      nps,
      elbow: bend
        ? { kind: 'bend', clrMm: parseLengthInputToMm(clrField.text, clrField.unit) as number }
        : { kind: 'catalog', radiusType },
      references: Object.keys(references).length > 0 ? references : undefined,
    });
    if (res.success === false) {
      return { status: 'review', errorCode: res.code };
    }
    const sol = res.result;
    if (!sol.references.defined) return { status: 'pending-refs', sol };
    if (!sol.cutPlanValid || !sol.elbow.geometryValid) return { status: 'invalid-plan', sol };
    return { status: sol.warnings.length > 0 ? 'complete-warnings' : 'complete', sol };
  }, [open, geometry, elbowMode, nps, radiusType, clrField, linField, loutField, gapField, allowField]);

  /** Presentation-only formatting (documented convention: mm 2 decimals,
   *  in 3–4; auto-extended so a small positive value never shows as 0). */
  const fmtFab = (v: number | undefined) => {
    if (v === undefined || !Number.isFinite(v)) return '—';
    return `${formatLengthForUnit(v, unit)} ${unit}`;
  };

  const statusText: Record<FabStatus, string> = {
    closed: '',
    'p2-invalid': t('tools.prefab.pipeComb.fab.statusP2Invalid'),
    review: t('tools.prefab.pipeComb.fab.statusReview'),
    'pending-refs': t('tools.prefab.pipeComb.fab.statusPendingRefs'),
    'invalid-plan': t('tools.prefab.pipeComb.fab.statusInvalidPlan'),
    complete: t('tools.prefab.pipeComb.fab.statusComplete'),
    'complete-warnings': t('tools.prefab.pipeComb.fab.statusCompleteWarnings'),
  };

  const reviewReasonText: Record<NonNullable<FabState['reviewReason']>, string> = {
    nps: t('tools.prefab.pipeComb.fab.reviewNps'),
    clr: t('tools.prefab.pipeComb.fab.reviewClr'),
    adjust: t('tools.prefab.pipeComb.fab.reviewAdjust'),
    lin: t('tools.prefab.pipeComb.fab.reviewLin'),
    lout: t('tools.prefab.pipeComb.fab.reviewLout'),
  };

  const errorCodeKey = (code: string) =>
    `tools.prefab.pipeComb.fab.error.${code}` as const;

  const warningText = (w: { code: string; params: Record<string, string | number> }) => {
    const key = `tools.prefab.pipeComb.fab.warn.${w.code}` as const;
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(w.params)) {
      if (typeof v === 'number' && (k === 'clearance' || k === 'clr' || k === 'halfOd' || k === 'intradosRadius' || k === 'weldGap')) {
        params[k] = fmtFab(v);
      } else {
        params[k] = String(v);
      }
    }
    return t(key, params);
  };

  const markLabel = (id: string) => t(`tools.prefab.pipeComb.fab.mark.${id}` as const);
  const markMethod = (m: string) => t(`tools.prefab.pipeComb.fab.method.${m}` as const);
  const pieceStatusLabel = (piece: { status: string; statusCode?: string }) =>
    piece.statusCode
      ? t(`tools.prefab.pipeComb.fab.pieceReason.${piece.statusCode}` as const)
      : t(`tools.prefab.pipeComb.fab.pieceStatus.${piece.status}` as const);

  const sol = fab.sol;
  const bend = elbowMode === 'bend';

  return (
    <div
      className="rounded-lg border border-[#232A36] bg-[#151A22] p-4"
      data-testid="pipe-comb-fab-section"
      data-open={open ? 'true' : 'false'}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Scissors className="h-4 w-4 text-[#FF8C00]" aria-hidden="true" />
          <h4 className="text-[11px] uppercase tracking-wider text-[#A3A9B3]">
            {t('tools.prefab.pipeComb.fab.title')}
          </h4>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          id="pipe-comb-fab-toggle"
          data-testid="pipe-comb-fab-toggle"
          aria-expanded={open}
          aria-controls="pipe-comb-fab-panel"
          onClick={() => setOpen((v) => !v)}
          className="border-[#232A36]"
        >
          {open ? t('tools.prefab.pipeComb.fab.close') : t('tools.prefab.pipeComb.fab.open')}
        </Button>
      </div>

      {open && (
        <div id="pipe-comb-fab-panel" className="mt-4 space-y-5">
          {/* --- A. Pipe & elbow specification --- */}
          <div className="space-y-3">
            <p className="text-[11px] text-[#A3A9B3]">{t('tools.prefab.pipeComb.fab.specIntro')}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="pipe-comb-fab-nps" className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">
                  {t('tools.prefab.pipeComb.fab.nps')}
                </Label>
                <select
                  id="pipe-comb-fab-nps"
                  data-testid="pipe-comb-fab-nps"
                  value={nps}
                  onChange={(e) => setNps(e.target.value)}
                  className="h-9 w-full rounded-md border border-[#232A36] bg-[#0E1117] px-3 text-sm text-[#F5F7FA]"
                >
                  <option value="">{t('tools.prefab.pipeComb.fab.npsPlaceholder')}</option>
                  {NPS_OPTIONS.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">
                  {t('tools.prefab.pipeComb.fab.elbowMode')}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    aria-pressed={elbowMode === 'catalog'}
                    data-testid="pipe-comb-fab-mode-catalog"
                    onClick={() => setElbowMode('catalog')}
                    className={elbowMode === 'catalog' ? 'bg-[#FF8C00] text-black' : 'border-[#232A36]'}
                  >
                    {t('tools.prefab.pipeComb.fab.modeCatalog')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    aria-pressed={elbowMode === 'bend'}
                    data-testid="pipe-comb-fab-mode-bend"
                    onClick={() => setElbowMode('bend')}
                    className={elbowMode === 'bend' ? 'bg-[#FF8C00] text-black' : 'border-[#232A36]'}
                  >
                    {t('tools.prefab.pipeComb.fab.modeBend')}
                  </Button>
                </div>
              </div>
              {!bend && (
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">
                    {t('tools.prefab.pipeComb.fab.radiusType')}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      aria-pressed={radiusType === 'LR'}
                      data-testid="pipe-comb-fab-radius-lr"
                      onClick={() => setRadiusType('LR')}
                      className={radiusType === 'LR' ? 'bg-[#FF8C00] text-black' : 'border-[#232A36]'}
                    >
                      LR
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      aria-pressed={radiusType === 'SR'}
                      data-testid="pipe-comb-fab-radius-sr"
                      onClick={() => setRadiusType('SR')}
                      className={radiusType === 'SR' ? 'bg-[#FF8C00] text-black' : 'border-[#232A36]'}
                    >
                      SR
                    </Button>
                  </div>
                </div>
              )}
              {bend && (
                <div className="space-y-1">
                  <Label htmlFor="pipe-comb-fab-clr" className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">
                    {t('tools.prefab.pipeComb.fab.customClr')}
                  </Label>
                  <Input
                    id="pipe-comb-fab-clr"
                    data-testid="pipe-comb-fab-clr"
                    value={clrField.text}
                    inputMode="decimal"
                    aria-invalid={!fieldEmpty(clrField) && !fieldValid(clrField)}
                    onChange={(e) => setClrField((f) => lengthFieldOnEdit(f, e.target.value, unit))}
                    className="bg-[#0E1117] border-[#232A36]"
                  />
                </div>
              )}
            </div>
            {sol && (
              <p className="text-[11px] text-[#A3A9B3]" data-testid="pipe-comb-fab-od-clr">
                {t('tools.prefab.pipeComb.fab.odLabel')} {fmtFab(sol.elbow.odMm)} ·{' '}
                {t('tools.prefab.pipeComb.fab.clrLabel')} {fmtFab(sol.elbow.clrMm)} ·{' '}
                {bend
                  ? t('tools.prefab.pipeComb.fab.clrSourceCustom')
                  : t('tools.prefab.pipeComb.fab.clrSourceCatalog')}
                {geometry?.elbowAngleDeg === 90 && !bend
                  ? ` · ${t('tools.prefab.pipeComb.fab.noCutAt90')}`
                  : ''}
              </p>
            )}
          </div>

          {/* --- B. Absolute references --- */}
          <div className="space-y-3">
            <p className="text-[11px] font-medium text-[#F5F7FA]">{t('tools.prefab.pipeComb.fab.refsTitle')}</p>
            <p className="text-[11px] text-[#A3A9B3]">{t('tools.prefab.pipeComb.fab.refsIntro')}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="pipe-comb-fab-lin" className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">
                  {t('tools.prefab.pipeComb.fab.linLabel')}
                </Label>
                <Input
                  id="pipe-comb-fab-lin"
                  data-testid="pipe-comb-fab-lin"
                  value={linField.text}
                  inputMode="decimal"
                  aria-invalid={!fieldEmpty(linField) && !fieldValid(linField)}
                  onChange={(e) => setLinField((f) => lengthFieldOnEdit(f, e.target.value, unit))}
                  className="bg-[#0E1117] border-[#232A36]"
                />
                <p className="text-[10px] text-[#A3A9B3]">{t('tools.prefab.pipeComb.fab.linHelp')}</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="pipe-comb-fab-lout" className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">
                  {t('tools.prefab.pipeComb.fab.loutLabel')}
                </Label>
                <Input
                  id="pipe-comb-fab-lout"
                  data-testid="pipe-comb-fab-lout"
                  value={loutField.text}
                  inputMode="decimal"
                  aria-invalid={!fieldEmpty(loutField) && !fieldValid(loutField)}
                  onChange={(e) => setLoutField((f) => lengthFieldOnEdit(f, e.target.value, unit))}
                  className="bg-[#0E1117] border-[#232A36]"
                />
                <p className="text-[10px] text-[#A3A9B3]">{t('tools.prefab.pipeComb.fab.loutHelp')}</p>
              </div>
            </div>
            <p className="text-[10px] text-[#A3A9B3]">{t('tools.prefab.pipeComb.fab.refsNote')}</p>
          </div>

          {/* --- C. Adjustments --- */}
          <div className="space-y-3">
            <p className="text-[11px] font-medium text-[#F5F7FA]">{t('tools.prefab.pipeComb.fab.adjTitle')}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="pipe-comb-fab-gap" className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">
                  {t('tools.prefab.pipeComb.fab.weldGap')}
                </Label>
                <Input
                  id="pipe-comb-fab-gap"
                  data-testid="pipe-comb-fab-gap"
                  value={gapField.text}
                  inputMode="decimal"
                  aria-invalid={!fieldValid(gapField)}
                  onChange={(e) => setGapField((f) => lengthFieldOnEdit(f, e.target.value, unit))}
                  className="bg-[#0E1117] border-[#232A36]"
                />
                <p className="text-[10px] text-[#A3A9B3]">
                  {bend ? t('tools.prefab.pipeComb.fab.weldGapBendNote') : t('tools.prefab.pipeComb.fab.weldGapNote')}
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="pipe-comb-fab-allowance" className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">
                  {t('tools.prefab.pipeComb.fab.allowance')}
                </Label>
                <Input
                  id="pipe-comb-fab-allowance"
                  data-testid="pipe-comb-fab-allowance"
                  value={allowField.text}
                  inputMode="decimal"
                  aria-invalid={!fieldValid(allowField)}
                  onChange={(e) => setAllowField((f) => lengthFieldOnEdit(f, e.target.value, unit))}
                  className="bg-[#0E1117] border-[#232A36]"
                />
                <p className="text-[10px] text-[#A3A9B3]">{t('tools.prefab.pipeComb.fab.allowanceNote')}</p>
              </div>
            </div>
          </div>

          {/* --- Status --- */}
          {fab.status !== 'closed' && (
            <p
              role="status"
              data-testid="pipe-comb-fab-status"
              data-status={fab.status}
              className={[
                'text-xs font-medium',
                fab.status === 'complete' ? 'text-green-400' : '',
                fab.status === 'complete-warnings' ? 'text-yellow-400' : '',
                fab.status === 'review' || fab.status === 'p2-invalid' || fab.status === 'invalid-plan' ? 'text-red-400' : '',
                fab.status === 'pending-refs' ? 'text-[#8FB8E8]' : '',
              ].join(' ')}
            >
              {statusText[fab.status]}
            </p>
          )}
          {fab.status === 'review' && fab.reviewReason && (
            <p className="text-xs text-[#A3A9B3]" data-testid="pipe-comb-fab-review-reason">
              {reviewReasonText[fab.reviewReason]}
            </p>
          )}
          {fab.status === 'review' && fab.errorCode && (
            <p className="text-xs text-red-400" data-testid="pipe-comb-fab-error" data-code={fab.errorCode}>
              {t(errorCodeKey(fab.errorCode))}
            </p>
          )}

          {/* --- 5A. Summary (only with a solution) --- */}
          {sol && fab.status !== 'review' && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="pipe-comb-fab-summary">
              <div className="rounded-md border border-[#232A36] bg-[#0E1117] p-3">
                <p className="text-[11px] text-[#A3A9B3]">{t('tools.prefab.pipeComb.fab.takeOutLabel')}</p>
                <p className="break-words text-base font-semibold text-[#F5F7FA]" data-testid="pipe-comb-fab-metric" data-metric="takeOut">
                  {fmtFab(sol.elbow.takeOutMm)}
                </p>
                <p className="text-[10px] text-[#A3A9B3]">{t('tools.prefab.pipeComb.fab.takeOutHelp')}</p>
              </div>
              <div className="rounded-md border border-[#232A36] bg-[#0E1117] p-3">
                <p className="text-[11px] text-[#A3A9B3]">{t('tools.prefab.pipeComb.fab.refsApplied')}</p>
                <p className="break-words text-base font-semibold text-[#F5F7FA]" data-testid="pipe-comb-fab-metric" data-metric="refs">
                  {sol.references.inletAxisToAxisMm !== undefined
                    ? `${fmtFab(sol.references.inletAxisToAxisMm)} / ${fmtFab(sol.references.outletAxisToAxisMm)}`
                    : t('tools.prefab.pipeComb.fab.missingRefs')}
                </p>
                <p className="text-[10px] text-[#A3A9B3]">Lin / Lout</p>
              </div>
              <div className="rounded-md border border-[#232A36] bg-[#0E1117] p-3">
                <p className="text-[11px] text-[#A3A9B3]">{t('tools.prefab.pipeComb.fab.appliedAdjust')}</p>
                <p className="break-words text-base font-semibold text-[#F5F7FA]" data-testid="pipe-comb-fab-metric" data-metric="adjust">
                  {bend
                    ? t('tools.prefab.pipeComb.fab.gapNotApplied')
                    : `${t('tools.prefab.pipeComb.fab.gapShort')} ${fmtFab(sol.references.weldGapMm)} · ${t('tools.prefab.pipeComb.fab.allowanceShort')} ${fmtFab(sol.references.fittingAllowanceMm)}`}
                </p>
              </div>
              <div className="rounded-md border border-[#232A36] bg-[#0E1117] p-3">
                <p className="text-[11px] text-[#A3A9B3]">{t('tools.prefab.pipeComb.fab.staggerLabel')}</p>
                <p className="break-words text-base font-semibold text-[#F5F7FA]" data-testid="pipe-comb-fab-metric" data-metric="stagger">
                  {fmtFab(sol.stagger.adjacentStaggerMm)}
                </p>
                <p className="text-[10px] text-[#A3A9B3]">{t('tools.prefab.pipeComb.fab.staggerHelp')}</p>
              </div>
            </div>
          )}

          {/* --- Warnings --- */}
          {sol && sol.warnings.length > 0 && fab.status !== 'review' && (
            <ul className="space-y-1" data-testid="pipe-comb-fab-warnings">
              {sol.warnings.map((w) => (
                <li key={w.code} className="text-xs text-yellow-400" data-code={w.code}>
                  ⚠ {warningText(w)}
                </li>
              ))}
            </ul>
          )}

          {/* --- 5B. Cut list --- */}
          {sol && (fab.status === 'complete' || fab.status === 'complete-warnings' || fab.status === 'invalid-plan' || fab.status === 'pending-refs') && (
            <div className="space-y-2" data-testid="pipe-comb-fab-cutlist">
              <p className="text-[11px] font-medium text-[#F5F7FA]">{t('tools.prefab.pipeComb.fab.cutListTitle')}</p>

              {/* Desktop: table. */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wider text-[#A3A9B3]">
                      <th scope="col" className="py-2 pr-4">{t('tools.prefab.pipeComb.fab.colPiece')}</th>
                      <th scope="col" className="py-2 pr-4">{t('tools.prefab.pipeComb.fab.colPipe')}</th>
                      <th scope="col" className="py-2 pr-4">{t('tools.prefab.pipeComb.fab.colPos')}</th>
                      <th scope="col" className="py-2 pr-4">{t('tools.prefab.pipeComb.fab.colFinished')}</th>
                      <th scope="col" className="py-2 pr-4">{t('tools.prefab.pipeComb.fab.colAllowance')}</th>
                      <th scope="col" className="py-2 pr-4">{t('tools.prefab.pipeComb.fab.colCut')}</th>
                      <th scope="col" className="py-2">{t('tools.prefab.pipeComb.fab.colStatus')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#232A36]">
                    {sol.cutList.map((entry) => {
                      const piece = sol.pipes[entry.pipeNumber - 1]?.pieces.find((p) => p.id === entry.pieceId);
                      return (
                        <tr key={entry.pieceId} data-testid="pipe-comb-fab-piece" data-piece-id={entry.pieceId} data-status={entry.status}>
                          <td className="py-2 pr-4 font-mono text-[#F5F7FA]">{entry.pieceId}</td>
                          <td className="py-2 pr-4 text-[#F5F7FA]">{entry.pipeNumber}</td>
                          <td className="py-2 pr-4 text-[#F5F7FA]">
                            {entry.kind === 'inlet-pup' ? t('tools.prefab.pipeComb.fab.posInlet') : entry.kind === 'outlet-pup' ? t('tools.prefab.pipeComb.fab.posOutlet') : t('tools.prefab.pipeComb.fab.posBend')}
                          </td>
                          <td className="py-2 pr-4 text-[#F5F7FA]">{fmtFab(entry.cutLengthMm !== undefined ? (piece?.finishedLengthMm) : undefined)}</td>
                          <td className="py-2 pr-4 text-[#A3A9B3]">{fmtFab(entry.cutLengthMm !== undefined && piece ? piece.fittingAllowanceMm : undefined)}</td>
                          <td className="py-2 pr-4 font-semibold text-[#F5F7FA]">{fmtFab(entry.cutLengthMm)}</td>
                          <td className={`py-2 text-xs ${entry.status === 'ok' ? 'text-green-400' : entry.status === 'invalid' ? 'text-red-400' : 'text-[#8FB8E8]'}`}>
                            {piece ? pieceStatusLabel(piece) : t(`tools.prefab.pipeComb.fab.pieceStatus.${entry.status}` as const)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile: cards. Distinct testid from the desktop table rows —
                  both live in the DOM (CSS-hidden per breakpoint). */}
              <div className="space-y-2 md:hidden">
                {sol.cutList.map((entry) => {
                  const piece = sol.pipes[entry.pipeNumber - 1]?.pieces.find((p) => p.id === entry.pieceId);
                  return (
                    <div
                      key={entry.pieceId}
                      className="rounded-md border border-[#232A36] bg-[#0E1117] p-3"
                      data-testid="pipe-comb-fab-piece-card"
                      data-piece-id={entry.pieceId}
                      data-status={entry.status}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm text-[#F5F7FA]">{entry.pieceId}</span>
                        <span className={`text-xs ${entry.status === 'ok' ? 'text-green-400' : entry.status === 'invalid' ? 'text-red-400' : 'text-[#8FB8E8]'}`}>
                          {piece ? pieceStatusLabel(piece) : t(`tools.prefab.pipeComb.fab.pieceStatus.${entry.status}` as const)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[#A3A9B3]">
                        {t('tools.prefab.pipeComb.fab.colPipe')} {entry.pipeNumber} ·{' '}
                        {entry.kind === 'inlet-pup' ? t('tools.prefab.pipeComb.fab.posInlet') : entry.kind === 'outlet-pup' ? t('tools.prefab.pipeComb.fab.posOutlet') : t('tools.prefab.pipeComb.fab.posBend')}
                      </p>
                      {entry.cutLengthMm !== undefined ? (
                        <div className="mt-1 grid grid-cols-3 gap-1 text-xs">
                          <div>
                            <p className="text-[10px] text-[#A3A9B3]">{t('tools.prefab.pipeComb.fab.colFinished')}</p>
                            <p className="break-words text-[#F5F7FA]">{fmtFab(piece?.finishedLengthMm)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-[#A3A9B3]">{t('tools.prefab.pipeComb.fab.colAllowance')}</p>
                            <p className="break-words text-[#A3A9B3]">{fmtFab(piece?.fittingAllowanceMm)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-[#A3A9B3]">{t('tools.prefab.pipeComb.fab.colCut')}</p>
                            <p className="break-words font-semibold text-[#F5F7FA]">{fmtFab(entry.cutLengthMm)}</p>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-1 text-xs text-[#8FB8E8]">{t('tools.prefab.pipeComb.fab.pendingPieceNote')}</p>
                      )}
                      {/* Bend pieces: straight/arc breakdown. */}
                      {piece?.kind === 'bent-tube' && piece.straightInletMm !== undefined && (
                        <p className="mt-1 text-xs text-[#A3A9B3]">
                          {t('tools.prefab.pipeComb.fab.bendBreakdown', {
                            straightIn: fmtFab(piece.straightInletMm),
                            arc: fmtFab(piece.arcLengthMm),
                            straightOut: fmtFab(piece.straightOutletMm),
                            bar: fmtFab(piece.finishedLengthMm),
                          })}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Per-piece expandable detail (desktop table rows link here via id). */}
              <div className="space-y-1">
                {sol.pipes.flatMap((pipe) => pipe.pieces).map((piece) => (
                  <PieceDetail key={piece.id} piece={piece} fmtFab={fmtFab} t={t} />
                ))}
              </div>

              {/* Pending references: what is missing. */}
              {fab.status === 'pending-refs' && sol.references.missing.length > 0 && (
                <p className="text-xs text-[#8FB8E8]" data-testid="pipe-comb-fab-missing">
                  {t('tools.prefab.pipeComb.fab.missingList', {
                    missing: sol.references.missing
                      .map((m) => (m === 'inletAxisToAxisMm' ? t('tools.prefab.pipeComb.fab.linLabel') : t('tools.prefab.pipeComb.fab.loutLabel')))
                      .join(', '),
                  })}
                </p>
              )}

              {/* Elbows are NOT cut pieces: separate identification. */}
              {!bend && sol.pipes.some((p) => p.pieces.some((piece) => piece.kind === 'elbow')) && (
                <p className="text-[11px] text-[#A3A9B3]" data-testid="pipe-comb-fab-elbows">
                  {t('tools.prefab.pipeComb.fab.elbowsNote', {
                    count: sol.pipes.length,
                    angle: sol.elbow.keptAngleDeg,
                  })}
                </p>
              )}
            </div>
          )}

          {/* --- 5C. Elbow marking --- */}
          {sol && fab.status !== 'review' && fab.status !== 'pending-refs' && (
            <div className="space-y-3" data-testid="pipe-comb-fab-marks">
              <p className="text-[11px] font-medium text-[#F5F7FA]">{t('tools.prefab.pipeComb.fab.marksTitle')}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-[#232A36] bg-[#0E1117] p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">{t('tools.prefab.pipeComb.fab.marksMaterial')}</p>
                  {sol.elbow.marks.filter((m) => m.onMaterial).length > 0 ? (
                    <ul className="mt-2 space-y-2">
                      {sol.elbow.marks.filter((m) => m.onMaterial).map((m) => (
                        <li key={m.id} data-testid="pipe-comb-fab-mark" data-mark-id={m.id} data-material="true">
                          <p className="text-sm text-[#F5F7FA]">{markLabel(m.id)}: <span className="font-semibold">{fmtFab(m.valueMm)}</span></p>
                          <p className="text-[10px] text-[#A3A9B3]">{markMethod(m.method)} · {t('tools.prefab.pipeComb.fab.originKeptFace')}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-[#A3A9B3]">{t('tools.prefab.pipeComb.fab.noMaterialMarks')}</p>
                  )}
                </div>
                <div className="rounded-md border border-[#232A36] bg-[#0E1117] p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">{t('tools.prefab.pipeComb.fab.marksReference')}</p>
                  <ul className="mt-2 space-y-2">
                    {sol.elbow.marks.filter((m) => !m.onMaterial).map((m) => (
                      <li key={m.id} data-testid="pipe-comb-fab-mark" data-mark-id={m.id} data-material="false">
                        <p className="text-sm text-[#F5F7FA]">{markLabel(m.id)}: <span className="font-semibold">{fmtFab(m.valueMm)}</span></p>
                        <p className="text-[10px] text-[#A3A9B3]">{markMethod(m.method)}</p>
                      </li>
                    ))}
                  </ul>
                  {sol.elbow.cutIntradosMm !== undefined && (
                    <p className="mt-2 text-[10px] text-[#A3A9B3]" data-testid="pipe-comb-fab-cutvalues">
                      {t('tools.prefab.pipeComb.fab.cutValuesNote', {
                        intrados: fmtFab(sol.elbow.cutIntradosMm),
                        centerline: fmtFab(sol.elbow.cutCenterlineMm),
                        extrados: fmtFab(sol.elbow.cutExtradosMm),
                      })}
                    </p>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-[#A3A9B3]" data-testid="pipe-comb-fab-model-note">
                {t('tools.prefab.pipeComb.fab.modelNote')}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Map module end identifiers to localized labels; stable physical
 *  identifiers (REF-ENT, REF-SAL) keep their notation. */
function endsLabel(raw: string, t: (k: string, o?: Record<string, string | number>) => string): string {
  const own = raw.match(/^(P\d+)-IN own joint face/);
  if (own) return t('tools.prefab.pipeComb.fab.endOwnJointFace', { id: `${own[1]}-IN` });
  const ownOut = raw.match(/^(P\d+)-OUT own joint face/);
  if (ownOut) return t('tools.prefab.pipeComb.fab.endOwnJointFace', { id: `${ownOut[1]}-OUT` });
  if (raw === 'inlet face') return t('tools.prefab.pipeComb.fab.endInletFace');
  if (raw === 'cut face') return t('tools.prefab.pipeComb.fab.endCutFace');
  return raw;
}

/** Expandable per-piece detail: ends, axis length, deductions, faces, joint. */
function PieceDetail({
  piece,
  fmtFab,
  t,
}: {
  piece: FabricationPiece;
  fmtFab: (v: number | undefined) => string;
  t: (key: string, opts?: Record<string, string | number>) => string;
}) {
  const gap = piece.deductions.find((d) => d.source === 'weld_gap')?.mm;
  const elbow = piece.deductions.find((d) => d.source === 'elbow_face')?.mm;
  const faces = piece.faces as { free?: string; joint?: string; inlet?: string; outlet?: string } | undefined;
  return (
    <details data-testid="pipe-comb-fab-detail" data-piece-id={piece.id} className="text-xs">
      <summary className="cursor-pointer text-[#8FB8E8]">
        {piece.id} · {t('tools.prefab.pipeComb.fab.detailTitle')}
      </summary>
      <div className="mt-1 space-y-1 pl-4 text-[#A3A9B3]">
        <p>{t('tools.prefab.pipeComb.fab.detailEnds', { start: endsLabel(piece.ends.start, t), end: endsLabel(piece.ends.end, t) })}</p>
        {piece.axisToAxisLengthMm !== undefined && (
          <p>{t('tools.prefab.pipeComb.fab.detailAxis', { value: fmtFab(piece.axisToAxisLengthMm) })}</p>
        )}
        {elbow !== undefined && <p>{t('tools.prefab.pipeComb.fab.detailDeductElbow', { value: fmtFab(elbow) })}</p>}
        {gap !== undefined && <p>{t('tools.prefab.pipeComb.fab.detailDeductGap', { value: fmtFab(gap) })}</p>}
        {faces?.joint && <p>{t('tools.prefab.pipeComb.fab.detailFaces', { joint: faces.joint, free: faces.free ?? '' })}</p>}
        {piece.allowanceHandling === 'remove-at-fit-up' && piece.fittingAllowanceMm > 0 && (
          <p className="text-yellow-400">{t('tools.prefab.pipeComb.fab.detailAllowanceNote', { value: fmtFab(piece.fittingAllowanceMm) })}</p>
        )}
        {piece.kind === 'bent-tube' && piece.straightInletMm !== undefined && (
          <p>{t('tools.prefab.pipeComb.fab.bendBreakdown', {
            straightIn: fmtFab(piece.straightInletMm),
            arc: fmtFab(piece.arcLengthMm),
            straightOut: fmtFab(piece.straightOutletMm),
            bar: fmtFab(piece.finishedLengthMm),
          })}</p>
        )}
      </div>
    </details>
  );
}
