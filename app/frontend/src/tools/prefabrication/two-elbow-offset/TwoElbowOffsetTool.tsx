import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoveHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { solvePipeComb } from '@/tools/core/geometry/pipe-comb';
import { listNps, getElbowRadius } from '@/tools/core/standards';
import { fromMm } from '@/tools/core/units';
import { mapEngineError, type UnitSystem } from '../shared';
import {
  createLengthField,
  lengthFieldOnEdit,
  lengthFieldOnUnitChange,
  lengthFieldIsValid,
  parseDecimalInput,
  type LengthFieldState,
} from '../pipe-comb/number-input';
import { presentTwoElbowOffset } from './two-elbow-offset-model';
import { buildTwoElbowOffsetDiagram, type TwoElbowOffsetDiagramModel } from './two-elbow-offset-diagram';
import TwoElbowOffsetDiagramView from './TwoElbowOffsetDiagram';

/**
 * PB-PIPE-COMB-CORRECTION-001 / P4 — "Desplazamiento con dos codos"
 * (two-elbow offset between parallel lines).
 *
 * Re-homes the legacy W1.B.1 engine `solvePipeComb` as its own tool. The
 * engine is the single source of geometry; this component only manages
 * canonical input state (same accepted policy as the pipe comb: physical
 * values in mm at full precision, unit toggles re-render text only, invalid
 * text stays invalid, empty stays empty) and presents engine outputs.
 *
 * Scope notes encoded in the UI:
 *   - The reference line (offset 0) is a straight run: no elbows, no cuts.
 *   - A zero intermediate straight means tangent elbows, not a 0 mm cut.
 *   - Straight cuts are NOMINAL between tangent points (no weld gap,
 *     assembly margin or saw kerf added).
 *   - The jog station in the drawing is a display-only alignment, not a
 *     works dimension.
 */

const KEY = 'tools.prefab.twoElbowOffset';
/** Elbow angles with common commercial fittings; others are nominal geometry. */
const COMMERCIAL_ANGLES = new Set([45, 90]);

/**
 * Provenance of the CLR value, made explicit so a non-tabulated catalog
 * combination can never silently reuse a previous radius as its own:
 *   - 'catalog': resolved from the standards elbow-radius table.
 *   - 'custom': entered/edited by the user (visible, explicit choice).
 *   - 'untabulated': NPS/type has no CLR in this tool's catalog; the field
 *     is cleared and calculation is blocked until the user enters one.
 */
type ClrSource = 'catalog' | 'custom' | 'untabulated';

/** Trim trailing zeros of a decimal string ("200.00" -> "200"). */
function trimTrailingZeros(s: string): string {
  if (!s.includes('.')) return s;
  return s.replace(/\.?0+$/, '');
}

/**
 * Display a value without ever rendering a non-zero quantity as "0":
 * precision extends until the rounded text is non-zero (0.004 mm,
 * 0.0002 in). Presentation only — canonical values and engine precision
 * are untouched.
 */
function fmtNonZero(v: number, baseDecimals: number): string {
  if (v === 0) return '0';
  for (let p = baseDecimals; p <= 8; p++) {
    const s = trimTrailingZeros(v.toFixed(p));
    if (Number(s) !== 0) return s;
  }
  return v.toExponential(2);
}

export default function TwoElbowOffsetTool() {
  const { t } = useTranslation();
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('metric');
  const unit = unitSystem === 'metric' ? ('mm' as const) : ('in' as const);

  const [lineCount, setLineCount] = useState('4');
  const [elbowAngle, setElbowAngle] = useState('45');
  // Canonical physical values (mm, full precision). Unit toggles only
  // re-render display text; they never rewrite these values.
  const [initialField, setInitialField] = useState<LengthFieldState>(() => createLengthField(200, 'mm'));
  const [finalField, setFinalField] = useState<LengthFieldState>(() => createLengthField(400, 'mm'));
  const [clrField, setClrField] = useState<LengthFieldState>(() => createLengthField(152.4, 'mm'));

  // Catalog CLR resolver (standards elbow-radius table, Weldbend p.26
  // provenance): choosing NPS + elbow type writes the CLR field once.
  // Default matches the PC-01 reference: CLR 152.4 mm = NPS 4 LR (A = 6 in).
  const [nps, setNps] = useState('4');
  const [elbowType, setElbowType] = useState<'LR' | 'SR'>('LR');
  const [clrSource, setClrSource] = useState<ClrSource>('catalog');

  useEffect(() => {
    // P4 policy (GO): empty stays empty and invalid text stays invalid
    // through a unit toggle — the last valid value is never resurrected.
    // number-input.ts (frozen) keeps the canonical value on invalid edits,
    // so the toggle here must skip re-rendering when the text is not valid.
    setInitialField((f) => (lengthFieldIsValid(f) ? lengthFieldOnUnitChange(f, unit) : { ...f, unit }));
    setFinalField((f) => (lengthFieldIsValid(f) ? lengthFieldOnUnitChange(f, unit) : { ...f, unit }));
    setClrField((f) => (lengthFieldIsValid(f) ? lengthFieldOnUnitChange(f, unit) : { ...f, unit }));
  }, [unit]);

  const applyCatalogSelection = (nextNps: string, nextType: 'LR' | 'SR') => {
    const radius = getElbowRadius(nextNps, nextType);
    if (radius !== undefined) {
      setClrField(createLengthField(radius, unit));
      setClrSource('catalog');
    } else {
      // Non-tabulated combination: clear the field instead of silently
      // keeping a radius that belongs to a different NPS/type. Calculation
      // is blocked until the user explicitly enters a CLR.
      setClrField({ text: '', canonicalMm: null, unit });
      setClrSource('untabulated');
    }
  };

  const { presentation, diagram, error, invalidInput } = useMemo(() => {
    const count = parseDecimalInput(lineCount);
    const angle = parseDecimalInput(elbowAngle);
    const initialValid = lengthFieldIsValid(initialField);
    const finalValid = lengthFieldIsValid(finalField);
    const clrValid = lengthFieldIsValid(clrField);

    if (
      count === null ||
      angle === null ||
      !initialValid ||
      !finalValid ||
      !clrValid ||
      initialField.canonicalMm === null ||
      finalField.canonicalMm === null ||
      clrField.canonicalMm === null
    ) {
      return { presentation: null, diagram: null, error: null, invalidInput: true };
    }

    const res = solvePipeComb({
      lineCount: count,
      initialSpacingMm: initialField.canonicalMm,
      finalSpacingMm: finalField.canonicalMm,
      elbowAngleDeg: angle,
      clrMm: clrField.canonicalMm,
    });
    if (res.success === false) {
      return { presentation: null, diagram: null, error: mapEngineError(t, res), invalidInput: false };
    }
    return {
      presentation: presentTwoElbowOffset(res.result),
      diagram: buildTwoElbowOffsetDiagram(res.result, clrField.canonicalMm),
      error: null,
      invalidInput: false,
    };
  }, [lineCount, elbowAngle, initialField, finalField, clrField, t]);

  /** Human-readable formatting; the engine itself never rounds. Precision
   * extends so a positive value never displays as "0" (review finding 4). */
  const fmt = (v: number | undefined) => {
    if (v === undefined || !Number.isFinite(v)) return '—';
    if (unitSystem === 'metric') return `${fmtNonZero(v, 2)} mm`;
    return `${fmtNonZero(fromMm(v, 'in'), 3)} in`;
  };

  const fmtSigned = (v: number) => {
    if (v === 0) return fmt(0);
    const abs = fmt(Math.abs(v));
    return v > 0 ? `+${abs}` : `−${abs}`;
  };

  const nominalAngle = useMemo(() => {
    const angle = parseDecimalInput(elbowAngle);
    return angle !== null && !COMMERCIAL_ANGLES.has(angle);
  }, [elbowAngle]);

  const dimText = (dim: TwoElbowOffsetDiagramModel['dimensions'][number]) =>
    `${t(`${KEY}.dims.${dim.labelKey}`)} ${fmt(dim.valueMm)}`;

  const fieldInvalid = (f: LengthFieldState) => !lengthFieldIsValid(f);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 border-b border-[#232A36] pb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#FF8C00]/10 text-[#FF8C00]">
          <MoveHorizontal className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-[#F5F7FA]">{t(`${KEY}.title`)}</h3>
          <p className="text-xs text-[#A3A9B3]">{t('tools.prefab.common.engineBadge')}</p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant={unitSystem === 'metric' ? 'default' : 'outline'}
          onClick={() => setUnitSystem('metric')}
          aria-pressed={unitSystem === 'metric'}
          data-testid="two-elbow-offset-unit-mm"
          className={unitSystem === 'metric' ? 'bg-[#FF8C00] text-black' : 'border-[#232A36]'}
        >
          mm
        </Button>
        <Button
          type="button"
          size="sm"
          variant={unitSystem === 'imperial' ? 'default' : 'outline'}
          onClick={() => setUnitSystem('imperial')}
          aria-pressed={unitSystem === 'imperial'}
          data-testid="two-elbow-offset-unit-in"
          className={unitSystem === 'imperial' ? 'bg-[#FF8C00] text-black' : 'border-[#232A36]'}
        >
          in
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="teo-line-count" className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">
            {t(`${KEY}.lineCount`)}
          </Label>
          <Input
            id="teo-line-count"
            value={lineCount}
            onChange={(e) => setLineCount(e.target.value)}
            aria-invalid={parseDecimalInput(lineCount) === null}
            className="bg-[#0E1117] border-[#232A36]"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="teo-elbow-angle" className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">
            {t(`${KEY}.elbowAngle`)}
          </Label>
          <Input
            id="teo-elbow-angle"
            value={elbowAngle}
            onChange={(e) => setElbowAngle(e.target.value)}
            aria-invalid={parseDecimalInput(elbowAngle) === null}
            className="bg-[#0E1117] border-[#232A36]"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="teo-initial-spacing" className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">
            {t(`${KEY}.initialSpacing`)}
          </Label>
          <Input
            id="teo-initial-spacing"
            value={initialField.text}
            onChange={(e) => setInitialField((f) => lengthFieldOnEdit(f, e.target.value, unit))}
            aria-invalid={fieldInvalid(initialField)}
            className="bg-[#0E1117] border-[#232A36]"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="teo-final-spacing" className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">
            {t(`${KEY}.finalSpacing`)}
          </Label>
          <Input
            id="teo-final-spacing"
            value={finalField.text}
            onChange={(e) => setFinalField((f) => lengthFieldOnEdit(f, e.target.value, unit))}
            aria-invalid={fieldInvalid(finalField)}
            className="bg-[#0E1117] border-[#232A36]"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="teo-clr" className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">
            {t(`${KEY}.clr`)}
          </Label>
          <Input
            id="teo-clr"
            value={clrField.text}
            onChange={(e) => {
              setClrField((f) => lengthFieldOnEdit(f, e.target.value, unit));
              // Any manual edit is an explicit user choice: it no longer
              // belongs to the catalog selection.
              setClrSource((prev) => (prev === 'untabulated' && e.target.value === '' ? prev : 'custom'));
            }}
            aria-invalid={fieldInvalid(clrField)}
            className="bg-[#0E1117] border-[#232A36]"
          />
          {/* Visible CLR provenance: catalog / custom / missing data. */}
          <p
            data-testid="two-elbow-offset-clr-source"
            className={`text-[10px] ${clrSource === 'untabulated' ? 'text-amber-400' : 'text-[#7C8694]'}`}
          >
            {clrSource === 'catalog' && t(`${KEY}.clrSourceCatalog`, { combo: `${nps}" ${elbowType}` })}
            {clrSource === 'custom' && t(`${KEY}.clrSourceCustom`)}
            {clrSource === 'untabulated' && t(`${KEY}.clrMissing`, { combo: `${nps}" ${elbowType}` })}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">{t(`${KEY}.nps`)}</Label>
            <Select
              value={nps}
              onValueChange={(v) => {
                setNps(v);
                applyCatalogSelection(v, elbowType);
              }}
            >
              <SelectTrigger className="bg-[#0E1117] border-[#232A36]" aria-label={t(`${KEY}.nps`)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0E1117] border-[#232A36]">
                {listNps().map((n) => (
                  <SelectItem key={n} value={n}>{`${n}"`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">{t(`${KEY}.elbowType`)}</Label>
            <Select
              value={elbowType}
              onValueChange={(v) => {
                const next = v as 'LR' | 'SR';
                setElbowType(next);
                applyCatalogSelection(nps, next);
              }}
            >
              <SelectTrigger className="bg-[#0E1117] border-[#232A36]" aria-label={t(`${KEY}.elbowType`)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0E1117] border-[#232A36]">
                <SelectItem value="LR">LR</SelectItem>
                <SelectItem value="SR">SR</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-[#A3A9B3]">{t(`${KEY}.catalogHint`)}</p>

      {invalidInput && (
        <p role="alert" className="text-xs text-amber-400">
          {t(`${KEY}.invalidFields`)}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}

      <div className="rounded-lg border border-[#232A36] bg-[#151A22] p-4">
        <h4 className="mb-3 text-[11px] uppercase tracking-wider text-[#A3A9B3]">{t('tools.prefab.common.drawing')}</h4>
        {diagram ? (
          <TwoElbowOffsetDiagramView
            model={diagram}
            dimText={dimText}
            angleText={(deg) => `${t(`${KEY}.angleLabel`)} ${deg}°`}
            lineText={(id) => `L${id}`}
          />
        ) : (
          <p className="text-sm text-[#A3A9B3]">{t(`${KEY}.drawPlaceholder`)}</p>
        )}
        {diagram && (
          <p className="mt-2 text-[11px] text-[#7C8694]">{t(`${KEY}.alignmentNote`)}</p>
        )}
      </div>

      <div className="rounded-lg border border-[#232A36] bg-[#151A22] p-4">
        <h4 className="mb-3 text-[11px] uppercase tracking-wider text-[#A3A9B3]">{t('tools.prefab.common.results')}</h4>
        {presentation ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-md border border-[#232A36] bg-[#0E1117] p-3">
                <p className="text-[11px] text-[#A3A9B3]">{t(`${KEY}.angleLabel`)}</p>
                <p className="text-lg font-semibold text-[#F5F7FA]">{presentation.elbowAngleDeg}°</p>
              </div>
              <div className="rounded-md border border-[#232A36] bg-[#0E1117] p-3">
                <p className="text-[11px] text-[#A3A9B3]">{t(`${KEY}.direction`)}</p>
                <p className="text-lg font-semibold text-[#F5F7FA]">{t(`${KEY}.direction_${presentation.direction}`)}</p>
              </div>
              <div className="rounded-md border border-[#232A36] bg-[#0E1117] p-3">
                <p className="text-[11px] text-[#A3A9B3]">{t(`${KEY}.travelSpread`)}</p>
                <p className="text-lg font-semibold text-[#F5F7FA]">{fmt(presentation.travelSpreadMm)}</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-[#A3A9B3]">
                    <th scope="col" className="py-2 pr-3">{t(`${KEY}.line`)}</th>
                    <th scope="col" className="py-2 pr-3">{t(`${KEY}.offset`)}</th>
                    <th scope="col" className="py-2 pr-3">{t(`${KEY}.advance`)}</th>
                    <th scope="col" className="py-2 pr-3">{t(`${KEY}.travel`)}</th>
                    <th scope="col" className="py-2 pr-3">{t(`${KEY}.takeOut`)}</th>
                    <th scope="col" className="py-2 pr-3">{t(`${KEY}.straightCut`)}</th>
                    <th scope="col" className="py-2 pr-3">{t(`${KEY}.diff`)}</th>
                    <th scope="col" className="py-2">{t(`${KEY}.status`)}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232A36]">
                  {presentation.rows.map((row) => (
                    <tr key={row.id} data-testid={`two-elbow-offset-row-${row.id}`}>
                      <td className="py-2 pr-3 text-[#F5F7FA]">L{row.id}</td>
                      <td className="py-2 pr-3 text-[#F5F7FA]">{row.status === 'reference' ? fmt(0) : fmtSigned(row.offsetMm)}</td>
                      <td className="py-2 pr-3 text-[#F5F7FA]">{row.status === 'reference' ? '—' : fmt(row.advanceMm)}</td>
                      <td className="py-2 pr-3 text-[#F5F7FA]">{row.status === 'reference' ? '—' : fmt(row.travelMm)}</td>
                      <td className="py-2 pr-3 text-[#F5F7FA]">{row.status === 'reference' ? '—' : fmt(row.takeOutPerElbowMm)}</td>
                      <td className="py-2 pr-3 text-[#F5F7FA]">{row.status === 'reference' ? '—' : fmt(row.straightCutLengthMm)}</td>
                      <td className="py-2 pr-3 text-[#F5F7FA]">{row.status === 'reference' ? '—' : fmt(row.travelDifferenceMm)}</td>
                      <td className="py-2 text-[#A3A9B3]">
                        {row.status === 'reference'
                          ? t(`${KEY}.statusReference`)
                          : row.status === 'tangent_elbows'
                            ? t(`${KEY}.statusTangent`)
                            : t(`${KEY}.statusDisplaced`)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-1 text-[11px] text-[#7C8694]">
              <p>{t(`${KEY}.noteGeometry`)}</p>
              <p>{t(`${KEY}.nominalCutNote`)}</p>
              {nominalAngle && <p className="text-amber-400/90">{t(`${KEY}.nominalAngleNote`)}</p>}
              {presentation.hasTangentElbows && <p className="text-amber-400/90">{t(`${KEY}.tangentNote`)}</p>}
            </div>
          </div>
        ) : (
          <p className="text-sm text-[#A3A9B3]">{t('tools.prefab.common.noResult')}</p>
        )}
      </div>
    </div>
  );
}
