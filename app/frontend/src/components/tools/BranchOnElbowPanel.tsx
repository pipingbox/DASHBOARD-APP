import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { ELBOW_DATA, SCHEDULE_WT } from '@/tools/data/elbowData';
import { computeBranchOnElbow, type BranchOnElbowDatum, type BranchOnElbowErrorCode, type BranchOnElbowStation } from '@/tools/branch/branchOnElbowGeometry';
import { buildBranchOnElbowDevelopment } from '@/tools/branch/branchOnElbowDevelopmentSvg';
import { buildBranchOnElbowPicaje } from '@/tools/branch/branchOnElbowPicajeSvg';
import { buildBranchOnElbowSchematic } from '@/tools/branch/branchOnElbowSchematicSvg';
import { formatMm } from '@/tools/branch/formatMm';

type GraphicTab = 'injerto' | 'picaje' | 'geometry';
const GRAPHIC_TABS: GraphicTab[] = ['injerto', 'picaje', 'geometry'];
const GRAPHIC_TAB_KEYS: Record<GraphicTab, string> = {
  injerto: 'tabInjerto', picaje: 'tabPicaje', geometry: 'tabGeometry',
};

const DIVISIONS = [12, 16, 24, 36, 48];
const INPUT_CLASS = 'min-h-11 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:ring-1 focus:ring-amber-500';
const ERROR_KEYS: Record<BranchOnElbowErrorCode, string> = {
  NON_FINITE_INPUT: 'errorNumber',
  NON_POSITIVE_DIMENSION: 'errorDimension',
  INNER_EXCEEDS_OUTER: 'errorDimension',
  INVALID_DIVISIONS: 'errorNumber',
  INVALID_DATUM: 'errorNumber',
  OFFSET_OUT_OF_RANGE: 'errorOffset',
  ASIN_OUT_OF_RANGE: 'errorOffset',
  NO_INTERSECTION: 'errorIntersection',
  NON_FINITE_RESULT: 'errorNumber',
};

function parseMm(value: string): number {
  return value.trim() === '' ? Number.NaN : Number(value);
}

export default function BranchOnElbowPanel() {
  const { t } = useTranslation();
  const [branchNps, setBranchNps] = useState('3"');
  const [schedule, setSchedule] = useState('40');
  const [elbowNps, setElbowNps] = useState('6"');
  const [radius, setRadius] = useState('228.6');
  const [length, setLength] = useState('200');
  const [height, setHeight] = useState('150');
  const [divisions, setDivisions] = useState(24);
  const [datumType, setDatumType] = useState<BranchOnElbowDatum['type']>('EJE');
  const [fe, setFe] = useState('20');
  const [graphic, setGraphic] = useState<GraphicTab>('injerto');

  const branch = ELBOW_DATA.find(pipe => pipe.nps === branchNps)!;
  const elbow = ELBOW_DATA.find(pipe => pipe.nps === elbowNps)!;
  const schedules = Object.entries(SCHEDULE_WT[branchNps]).filter(([, wall]) => wall > 0);
  const wall = SCHEDULE_WT[branchNps][schedule] ?? 0;
  const branchId = branch.od - 2 * wall;
  const result = useMemo(() => {
    const datum: BranchOnElbowDatum = datumType === 'FE'
      ? { type: 'FE', fe: parseMm(fe) }
      : { type: datumType };
    return computeBranchOnElbow({
      elbowCentrelineRadiusMm: parseMm(radius),
      elbowOuterDiameterMm: elbow.od,
      branchInnerDiameterMm: branchId,
      branchOuterDiameterMm: branch.od,
      axisHeightMm: parseMm(height),
      referenceLengthMm: parseMm(length),
      divisions,
      datum,
    });
  }, [radius, elbow.od, branchId, branch.od, height, length, divisions, datumType, fe]);
  const errorCode = result.errors[0]?.code;
  const stationLabel = (station: BranchOnElbowStation) => station.index === divisions
    ? t('tools.branchOnElbow.closure')
    : `P${station.index + 1}`;
  const metrics = result.valid ? [
    [t('tools.branchOnElbow.cotaX'), result.cotaX],
    [t('tools.branchOnElbow.cotaY'), result.cotaY],
    [t('tools.branchOnElbow.div'), result.stationSpacing],
  ] as const : [];
  const inputs = [
    ['L', parseMm(length)], ['a', parseMm(height)], ['D', elbow.od],
    ['R', parseMm(radius)], ['OD', branch.od], ['ID', branchId],
  ] as const;

  /* Screen previews are projections of the U1 result: no geometry is computed
     here, the renderers only map the kernel millimetres to screen pixels. */
  const graphicSvg = useMemo(() => {
    if (!result.valid) return null;
    const note = t('tools.branchOnElbow.screenPreview');
    if (graphic === 'injerto') {
      return buildBranchOnElbowDevelopment(result, {
        title: t('tools.branchOnElbow.devTitle'),
        arcAxis: t('tools.branchOnElbow.devArcAxis'),
        injertoAxis: t('tools.branchOnElbow.devInjertoAxis'),
        minLabel: t('tools.branchOnElbow.devMin'),
        maxLabel: t('tools.branchOnElbow.devMax'),
        closureLabel: t('tools.branchOnElbow.closure'),
        screenPreviewNote: note,
      })?.svg ?? null;
    }
    if (graphic === 'picaje') {
      return buildBranchOnElbowPicaje(result, {
        title: t('tools.branchOnElbow.picajeTitle'),
        originLabel: t('tools.branchOnElbow.picajeOrigin'),
        xAxis: t('tools.branchOnElbow.picajeXAxis'),
        yAxis: t('tools.branchOnElbow.picajeYAxis'),
        cotaX: t('tools.branchOnElbow.cotaX'),
        cotaY: t('tools.branchOnElbow.cotaY'),
        datum: t(`tools.branchOnElbow.datum${datumType}`),
        closesOn: t('tools.branchOnElbow.picajeClosesOn'),
        screenPreviewNote: note,
      })?.svg ?? null;
    }
    return buildBranchOnElbowSchematic({
      elbowCentrelineRadiusMm: parseMm(radius),
      elbowOuterDiameterMm: elbow.od,
      branchOuterDiameterMm: branch.od,
      axisHeightMm: parseMm(height),
      referenceLengthMm: parseMm(length),
      datumOffsetMm: result.datumOffsetMm,
      datumName: datumType,
    }, {
      title: t('tools.branchOnElbow.schematicTitle'),
      elevation: t('tools.branchOnElbow.schematicElevation'),
      section: t('tools.branchOnElbow.schematicSection'),
      branch: t('tools.branchLayout.branchPipe'),
      elbow: t('tools.branchOnElbow.elbow'),
      referencePlane: t('tools.branchOnElbow.schematicRefPlane'),
      datumOffset: t('tools.branchOnElbow.schematicOffset'),
      screenPreviewNote: note,
      notToScale: t('tools.branchOnElbow.notToScale'),
    })?.svg ?? null;
  }, [result, graphic, datumType, radius, height, length, elbow.od, branch.od, t]);

  return (
    <section className="space-y-5" aria-label={t('tools.branchOnElbow.familyElbow')}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-3 rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">{t('tools.branchLayout.branchPipe')}</p>
          <div className="space-y-2">
            <Label htmlFor="elbow-branch-nps">{t('tools.branchLayout.npsSize')}</Label>
            <select id="elbow-branch-nps" className={INPUT_CLASS} value={branchNps} onChange={event => {
              const next = event.target.value;
              setBranchNps(next);
              if (!(SCHEDULE_WT[next]?.[schedule] > 0)) {
                setSchedule(Object.keys(SCHEDULE_WT[next]).find(key => SCHEDULE_WT[next][key] > 0) ?? '40');
              }
            }}>
              {ELBOW_DATA.map(pipe => <option key={pipe.nps} value={pipe.nps}>{pipe.nps} (OD {formatMm(pipe.od)} mm)</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="elbow-branch-schedule">{t('tools.branchLayout.schedule')}</Label>
            <select id="elbow-branch-schedule" className={INPUT_CLASS} value={schedule} onChange={event => setSchedule(event.target.value)}>
              {schedules.map(([sch, wt]) => <option key={sch} value={sch}>Sch {sch} (WT {formatMm(wt)} mm)</option>)}
            </select>
          </div>
          <p className="text-xs text-zinc-400">OD: <span className="font-mono text-zinc-100">{formatMm(branch.od)} mm</span> · ID: <span className="font-mono text-zinc-100">{formatMm(branchId)} mm</span></p>
        </div>

        <div className="space-y-3 rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">{t('tools.branchOnElbow.elbow')}</p>
          <div className="space-y-2">
            <Label htmlFor="elbow-nps">{t('tools.branchLayout.npsSize')}</Label>
            <select id="elbow-nps" className={INPUT_CLASS} value={elbowNps} onChange={event => setElbowNps(event.target.value)}>
              {ELBOW_DATA.map(pipe => <option key={pipe.nps} value={pipe.nps}>{pipe.nps} (D {formatMm(pipe.od)} mm)</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="elbow-radius">{t('tools.branchOnElbow.radius')} (mm)</Label>
            <input id="elbow-radius" type="number" inputMode="decimal" step="any" className={INPUT_CLASS} value={radius} onChange={event => setRadius(event.target.value)} />
          </div>
          <p className="text-xs text-zinc-500">{t('tools.branchOnElbow.radiusHint')}</p>
        </div>

        <div className="space-y-3 rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">{t('tools.branchLayout.parameters')}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="space-y-2">
              <Label htmlFor="elbow-length">{t('tools.branchOnElbow.length')} (mm)</Label>
              <input id="elbow-length" type="number" inputMode="decimal" step="any" className={INPUT_CLASS} value={length} onChange={event => setLength(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="elbow-height">{t('tools.branchOnElbow.height')} (mm)</Label>
              <input id="elbow-height" type="number" inputMode="decimal" step="any" className={INPUT_CLASS} value={height} onChange={event => setHeight(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="elbow-divisions">{t('tools.branchLayout.markingDivisions')}</Label>
              <select id="elbow-divisions" className={INPUT_CLASS} value={divisions} onChange={event => setDivisions(Number(event.target.value))}>
                {DIVISIONS.map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4">
        <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">{t('tools.branchOnElbow.datum')}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label={t('tools.branchOnElbow.datum')}>
          {(['EJE', 'BOP', 'TOP', 'FE'] as const).map(type => (
            <button key={type} type="button" aria-pressed={datumType === type} onClick={() => setDatumType(type)}
              className={`min-h-11 rounded-md border px-3 py-2 text-sm font-semibold ${datumType === type ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-600'}`}>
              {t(`tools.branchOnElbow.datum${type}`)}
            </button>
          ))}
        </div>
        {datumType === 'FE' && (
          <div className="mt-4 max-w-xs space-y-2">
            <Label htmlFor="elbow-fe">{t('tools.branchOnElbow.fe')} (mm)</Label>
            <input id="elbow-fe" type="number" inputMode="decimal" step="any" className={INPUT_CLASS} value={fe} onChange={event => setFe(event.target.value)} />
            <p className="text-xs text-zinc-400">{t('tools.branchOnElbow.feHint')}</p>
          </div>
        )}
      </div>

      {!result.valid && errorCode && (
        <div role="alert" data-geometry-error-code={errorCode} className="border-l-2 border-red-500 bg-red-500/5 p-4 text-sm text-red-400">
          {t(`tools.branchOnElbow.${ERROR_KEYS[errorCode]}`)}
        </div>
      )}

      {result.valid && (
        <div data-testid="elbow-results" className="space-y-4">
          <h4 className="text-sm font-semibold text-zinc-100">{t('tools.branchOnElbow.results')}</h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {metrics.map(([label, value]) => (
              <div key={label} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                <p className="text-xs text-zinc-400">{label}</p>
                <p className="mt-1 font-mono text-xl font-semibold text-amber-400">{formatMm(value)} mm</p>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4">
            <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <div><dt className="text-zinc-500">{t('tools.branchOnElbow.datum')}</dt><dd className="font-mono text-zinc-200">{t(`tools.branchOnElbow.datum${datumType}`)}{datumType === 'FE' ? ` (${formatMm(result.datumOffsetMm)} mm)` : ''}</dd></div>
              {inputs.map(([label, value]) => (
                <div key={label}><dt className="text-zinc-500">{label}</dt><dd className="font-mono text-zinc-200">{formatMm(value)} mm</dd></div>
              ))}
              <div><dt className="text-zinc-500">N</dt><dd className="font-mono text-zinc-200">{divisions}</dd></div>
            </dl>
          </div>
          <p className="text-xs text-zinc-500">{t('tools.branchOnElbow.mapping', { n: divisions, last: divisions - 1 })}</p>
          <p className="text-xs text-zinc-500">{t('tools.branchOnElbow.numericOnly')}</p>

          <div className="rounded-lg border border-zinc-800/80 bg-zinc-950 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h5 className="text-xs font-medium uppercase tracking-widest text-zinc-400">{t('tools.branchOnElbow.graphics')}</h5>
              <span className="text-[10px] text-zinc-500">{t('tools.branchOnElbow.screenPreview')}</span>
            </div>
            <div role="tablist" aria-label={t('tools.branchOnElbow.graphics')} className="grid grid-cols-3 gap-2">
              {GRAPHIC_TABS.map(tab => (
                <button key={tab} type="button" role="tab" id={`elbow-tab-${tab}`}
                  aria-selected={graphic === tab} aria-controls="elbow-graphic-panel"
                  onClick={() => setGraphic(tab)}
                  className={`min-h-11 rounded-md border px-2 py-2 text-xs font-semibold sm:text-sm ${graphic === tab ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:border-zinc-600'}`}>
                  {t(`tools.branchOnElbow.${GRAPHIC_TAB_KEYS[tab]}`)}
                </button>
              ))}
            </div>
            {graphicSvg && (
              <div id="elbow-graphic-panel" role="tabpanel" aria-labelledby={`elbow-tab-${graphic}`}
                data-testid="elbow-graphic" data-graphic={graphic}
                className="mt-3 w-full overflow-hidden rounded-md border border-zinc-800/80"
                dangerouslySetInnerHTML={{ __html: graphicSvg }} />
            )}
          </div>

          <div className="rounded-lg border border-zinc-800/80 bg-zinc-950 p-4">
            <h5 className="mb-3 text-xs font-medium uppercase tracking-widest text-zinc-400">{t('tools.branchOnElbow.stations')}</h5>
            <div className="space-y-2 sm:hidden">
              {result.stations.map(station => (
                <div key={station.index} data-testid={station.index === divisions ? 'elbow-closure' : 'elbow-physical-station'}
                  className={`rounded-md border p-3 ${station.index === divisions ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-zinc-800 bg-zinc-900/40'}`}>
                  <div className="mb-2 flex items-center justify-between text-sm"><strong className="text-amber-400">{stationLabel(station)}</strong><span className="font-mono text-zinc-400">{formatMm(station.thetaDeg, 1)}°</span></div>
                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    <div><dt className="text-zinc-500">{t('tools.branchOnElbow.arc')}</dt><dd className="font-mono text-zinc-200">{formatMm(station.arcPosition, 3)} mm</dd></div>
                    <div><dt className="text-zinc-500">{t('tools.branchOnElbow.injerto')}</dt><dd className="font-mono text-amber-400">{formatMm(station.cutOrdinate, 3)} mm</dd></div>
                    <div><dt className="text-zinc-500">{t('tools.branchOnElbow.picajeX')}</dt><dd className="font-mono text-zinc-200">{formatMm(station.picajeX, 3)} mm</dd></div>
                    <div><dt className="text-zinc-500">{t('tools.branchOnElbow.picajeY')}</dt><dd className="font-mono text-zinc-200">{formatMm(station.picajeY, 3)} mm</dd></div>
                  </dl>
                </div>
              ))}
            </div>
            <div className="hidden max-h-[420px] overflow-x-auto overflow-y-auto sm:block">
              <table className="w-full min-w-[660px] text-left text-xs">
                <thead className="sticky top-0 bg-zinc-950 text-zinc-400"><tr className="border-b border-zinc-800">
                  <th className="p-2">P#</th><th className="p-2">θ (°)</th>
                  <th className="p-2">{t('tools.branchOnElbow.arc')} (mm)</th>
                  <th className="p-2">{t('tools.branchOnElbow.injerto')} (mm)</th>
                  <th className="p-2">{t('tools.branchOnElbow.picajeX')} (mm)</th>
                  <th className="p-2">{t('tools.branchOnElbow.picajeY')} (mm)</th>
                </tr></thead>
                <tbody>{result.stations.map(station => (
                  <tr key={station.index} className={`border-b border-zinc-800/60 ${station.index === divisions ? 'text-emerald-400' : 'text-zinc-200'}`}>
                    <td className="p-2 whitespace-nowrap">{stationLabel(station)}</td>
                    <td className="p-2 font-mono">{formatMm(station.thetaDeg, 1)}</td>
                    <td className="p-2 font-mono">{formatMm(station.arcPosition, 3)}</td>
                    <td className="p-2 font-mono text-amber-400">{formatMm(station.cutOrdinate, 3)}</td>
                    <td className="p-2 font-mono">{formatMm(station.picajeX, 3)}</td>
                    <td className="p-2 font-mono">{formatMm(station.picajeY, 3)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
