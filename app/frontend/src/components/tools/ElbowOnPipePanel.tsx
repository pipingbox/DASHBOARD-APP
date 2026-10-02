import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { ELBOW_DATA, SCHEDULE_WT } from '@/tools/data/elbowData';
import {
  computeElbowOnPipe,
  type ElbowOnPipeDatum,
  type ElbowOnPipeErrorCode,
} from '@/tools/branch/elbowOnPipeGeometry';
import {
  projectElbowOnPipe,
  type ElbowOnPipeSummaryKey,
} from '@/tools/branch/elbowOnPipeDisplay';
import { formatMm } from '@/tools/branch/formatMm';

/**
 * PB-BRANCH-INJERTO-EXPANSION-001 — U5.2a
 * CODO → TUBO panel: numeric results only.
 *
 * The elbow is the member being cut and the straight pipe is the receiver, the
 * exact inverse of the tubo→codo family. Two consequences are visible on screen
 * and must not be smoothed over:
 *
 *   1. The datum sign convention belongs to this family. A positive Fe moves the
 *      bend plane toward TOP, not toward BOP as in tubo→codo. The panel states
 *      it (feHint) instead of silently re-orienting, because re-orienting would
 *      break agreement with the reference corpus that validates the U5.1 kernel.
 *
 *   2. Stations whose cut reaches the 90° end face of the finite elbow are
 *      flagged. That plateau is a real cut limit, not a rounding artifact.
 *
 * Cota Y' is an external positioning dimension carried over from the drawing. It
 * is deliberately NOT part of the kernel input, so it cannot move Cota X', the
 * seating height, any picaje coordinate or any arc output. An unusable Y' is
 * reported next to its own field and never suppresses the geometry, precisely
 * because the geometry does not depend on it.
 *
 * No SVG and no PDF here: screen graphics are U5.3, physical sheets are U5.4.
 */

const DIVISIONS = [12, 16, 24, 36, 48];
const INPUT_CLASS = 'min-h-11 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:ring-1 focus:ring-amber-500';
const DATUM_TYPES = ['EJE', 'BOP', 'TOP', 'FE'] as const;

/** All eleven kernel codes map onto a shop-readable cause. */
const ERROR_KEYS: Record<ElbowOnPipeErrorCode, string> = {
  NON_FINITE_INPUT: 'errorNumber',
  NON_POSITIVE_DIMENSION: 'errorDimension',
  INNER_EXCEEDS_OUTER: 'errorDimension',
  ELBOW_EXCEEDS_RECEIVER: 'errorReceiver',
  ELBOW_RADIUS_TOO_SMALL: 'errorRadius',
  INVALID_DIVISIONS: 'errorNumber',
  INVALID_DATUM: 'errorNumber',
  OFFSET_OUT_OF_RANGE: 'errorOffset',
  ASIN_OUT_OF_RANGE: 'errorDomain',
  NO_INTERSECTION: 'errorIntersection',
  NON_FINITE_RESULT: 'errorNumber',
};

/** Cota Y' reuses the yPrime label: it is the same external dimension. */
const SUMMARY_LABEL_KEYS: Record<ElbowOnPipeSummaryKey, string> = {
  cotaX: 'tools.elbowOnPipe.cotaX',
  seatingHeight: 'tools.elbowOnPipe.seating',
  div: 'tools.elbowOnPipe.div',
  circumference: 'tools.elbowOnPipe.circumference',
  cotaY: 'tools.elbowOnPipe.yPrime',
};

function parseMm(value: string): number {
  return value.trim() === '' ? Number.NaN : Number(value);
}

export default function ElbowOnPipePanel() {
  const { t } = useTranslation();
  const [elbowNps, setElbowNps] = useState('3"');
  const [schedule, setSchedule] = useState('40');
  const [radius, setRadius] = useState('114.3');
  const [receiverNps, setReceiverNps] = useState('6"');
  const [divisions, setDivisions] = useState(24);
  const [datumType, setDatumType] = useState<ElbowOnPipeDatum['type']>('EJE');
  const [fe, setFe] = useState('20');
  const [yPrime, setYPrime] = useState('');

  const elbow = ELBOW_DATA.find(pipe => pipe.nps === elbowNps)!;
  const receiver = ELBOW_DATA.find(pipe => pipe.nps === receiverNps)!;
  const schedules = Object.entries(SCHEDULE_WT[elbowNps]).filter(([, wall]) => wall > 0);
  const wall = SCHEDULE_WT[elbowNps][schedule] ?? 0;
  const elbowId = elbow.od - 2 * wall;

  /* yPrime is absent from this dependency list on purpose: it is not geometry. */
  const result = useMemo(() => {
    const datum: ElbowOnPipeDatum = datumType === 'FE'
      ? { type: 'FE', fe: parseMm(fe) }
      : { type: datumType };
    return computeElbowOnPipe({
      elbowInnerDiameterMm: elbowId,
      elbowOuterDiameterMm: elbow.od,
      elbowCentrelineRadiusMm: parseMm(radius),
      receiverOuterDiameterMm: receiver.od,
      divisions,
      datum,
    });
  }, [elbowId, elbow.od, radius, receiver.od, divisions, datumType, fe]);

  const yPrimeRaw = yPrime.trim();
  const yPrimeMm = yPrimeRaw === '' || !Number.isFinite(Number(yPrimeRaw)) ? null : Number(yPrimeRaw);
  const yPrimeUnusable = yPrimeRaw !== '' && yPrimeMm === null;
  const display = useMemo(() => projectElbowOnPipe(result, { yPrimeMm }), [result, yPrimeMm]);
  const errorCode = result.errors[0]?.code;

  const references = [
    ['D', receiver.od], ['R', parseMm(radius)],
    ['d.ex', elbow.od], ['d.in', elbowId],
  ] as const;

  return (
    <section className="space-y-5" aria-label={t('tools.elbowOnPipe.family')}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-3 rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">{t('tools.elbowOnPipe.member')}</p>
          <div className="space-y-2">
            <Label htmlFor="eop-elbow-nps">{t('tools.branchLayout.npsSize')}</Label>
            <select id="eop-elbow-nps" className={INPUT_CLASS} value={elbowNps} onChange={event => {
              const next = event.target.value;
              setElbowNps(next);
              if (!(SCHEDULE_WT[next]?.[schedule] > 0)) {
                setSchedule(Object.keys(SCHEDULE_WT[next]).find(key => SCHEDULE_WT[next][key] > 0) ?? '40');
              }
            }}>
              {ELBOW_DATA.map(pipe => <option key={pipe.nps} value={pipe.nps}>{pipe.nps} (OD {formatMm(pipe.od)} mm)</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="eop-schedule">{t('tools.branchLayout.schedule')}</Label>
            <select id="eop-schedule" className={INPUT_CLASS} value={schedule} onChange={event => setSchedule(event.target.value)}>
              {schedules.map(([sch, wt]) => <option key={sch} value={sch}>Sch {sch} (WT {formatMm(wt)} mm)</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="eop-radius">{t('tools.branchOnElbow.radius')} (mm)</Label>
            <input id="eop-radius" type="number" inputMode="decimal" step="any" className={INPUT_CLASS} value={radius} onChange={event => setRadius(event.target.value)} />
          </div>
          <p className="text-xs text-zinc-400">
            {t('tools.elbowOnPipe.od')}: <span className="font-mono text-zinc-100">{formatMm(elbow.od)} mm</span>
            {' · '}{t('tools.elbowOnPipe.id')}: <span className="font-mono text-zinc-100">{formatMm(elbowId)} mm</span>
          </p>
          <p className="text-xs text-zinc-500">{t('tools.branchOnElbow.radiusHint')}</p>
        </div>

        <div className="space-y-3 rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">{t('tools.elbowOnPipe.receiver')}</p>
          <div className="space-y-2">
            <Label htmlFor="eop-receiver-nps">{t('tools.branchLayout.npsSize')}</Label>
            <select id="eop-receiver-nps" className={INPUT_CLASS} value={receiverNps} onChange={event => setReceiverNps(event.target.value)}>
              {ELBOW_DATA.map(pipe => <option key={pipe.nps} value={pipe.nps}>{pipe.nps} (D {formatMm(pipe.od)} mm)</option>)}
            </select>
          </div>
          <p className="text-xs text-zinc-400">{t('tools.elbowOnPipe.receiverD')}: <span className="font-mono text-zinc-100">{formatMm(receiver.od)} mm</span></p>
          <p className="text-xs text-zinc-500">{t('tools.elbowOnPipe.convention')}</p>
        </div>

        <div className="space-y-3 rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">{t('tools.branchLayout.parameters')}</p>
          <div className="space-y-2">
            <Label htmlFor="eop-divisions">{t('tools.branchLayout.markingDivisions')}</Label>
            <select id="eop-divisions" className={INPUT_CLASS} value={divisions} onChange={event => setDivisions(Number(event.target.value))}>
              {DIVISIONS.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="eop-y-prime">{t('tools.elbowOnPipe.yPrime')} (mm)</Label>
            <input id="eop-y-prime" type="number" inputMode="decimal" step="any" className={INPUT_CLASS}
              value={yPrime} onChange={event => setYPrime(event.target.value)} />
          </div>
          <p className="text-xs text-zinc-500">{t('tools.elbowOnPipe.yPrimeHint')}</p>
          {yPrimeUnusable && (
            <p role="status" data-testid="elbow-on-pipe-y-prime-warning" className="text-xs text-amber-400">
              {t('tools.elbowOnPipe.errorYPrime')}
            </p>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4">
        <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">{t('tools.elbowOnPipe.datum')}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label={t('tools.elbowOnPipe.datum')}>
          {DATUM_TYPES.map(type => (
            <button key={type} type="button" aria-pressed={datumType === type} onClick={() => setDatumType(type)}
              className={`min-h-11 rounded-md border px-3 py-2 text-sm font-semibold ${datumType === type ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-600'}`}>
              {t(`tools.branchOnElbow.datum${type}`)}
            </button>
          ))}
        </div>
        {datumType === 'FE' && (
          <div className="mt-4 max-w-xs space-y-2">
            <Label htmlFor="eop-fe">{t('tools.elbowOnPipe.fe')} (mm)</Label>
            <input id="eop-fe" type="number" inputMode="decimal" step="any" className={INPUT_CLASS} value={fe} onChange={event => setFe(event.target.value)} />
          </div>
        )}
        {/* Sign convention of THIS family, stated whatever the datum, because its
            BOP/TOP sense is the opposite of the tubo→codo panel. */}
        <p className="mt-3 text-xs text-amber-400/90" data-testid="elbow-on-pipe-convention">{t('tools.elbowOnPipe.feHint')}</p>
      </div>

      {!result.valid && errorCode && (
        <div role="alert" data-geometry-error-code={errorCode} className="border-l-2 border-red-500 bg-red-500/5 p-4 text-sm text-red-400">
          {t(`tools.elbowOnPipe.${ERROR_KEYS[errorCode]}`)}
        </div>
      )}

      {result.valid && display && (
        <div data-testid="elbow-on-pipe-results" className="space-y-4">
          <h4 className="text-sm font-semibold text-zinc-100">{t('tools.elbowOnPipe.results')}</h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {display.summary.map(entry => (
              <div key={entry.key} data-testid="elbow-on-pipe-metric" data-metric={entry.key} data-external={entry.external}
                className={`rounded-lg border p-4 ${entry.external ? 'border-zinc-700 bg-zinc-900/60' : 'border-amber-500/30 bg-amber-500/5'}`}>
                <p className="text-xs text-zinc-400">{t(SUMMARY_LABEL_KEYS[entry.key])}</p>
                <p className={`mt-1 font-mono text-xl font-semibold ${entry.external ? 'text-zinc-200' : 'text-amber-400'}`}>{entry.value} mm</p>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4">
            <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">{t('tools.elbowOnPipe.technical')}</p>
            <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <div><dt className="text-zinc-500">{t('tools.elbowOnPipe.datum')}</dt><dd className="font-mono text-zinc-200">{t(`tools.branchOnElbow.datum${datumType}`)}</dd></div>
              <div><dt className="text-zinc-500">{t('tools.elbowOnPipe.offset')}</dt><dd className="font-mono text-zinc-200">{formatMm(result.datumOffsetMm)} mm</dd></div>
              {references.map(([label, value]) => (
                <div key={label}><dt className="text-zinc-500">{label}</dt><dd className="font-mono text-zinc-200">{formatMm(value)} mm</dd></div>
              ))}
              <div><dt className="text-zinc-500">{t('tools.elbowOnPipe.count')}</dt><dd className="font-mono text-zinc-200">{divisions}</dd></div>
            </dl>
          </div>

          <p className="text-xs text-zinc-500">{t('tools.branchOnElbow.mapping', { n: divisions, last: divisions - 1 })}</p>
          {display.clampedCount > 0 && (
            <p data-testid="elbow-on-pipe-clamp-note" data-clamped-count={display.clampedCount} className="text-xs text-amber-400/90">
              {t('tools.elbowOnPipe.clampedNote', { stations: display.clampedCount, total: divisions })}
            </p>
          )}
          <p className="text-xs text-zinc-500">{t('tools.elbowOnPipe.description')}</p>

          <div className="rounded-lg border border-zinc-800/80 bg-zinc-950 p-4">
            <h5 className="mb-3 text-xs font-medium uppercase tracking-widest text-zinc-400">{t('tools.elbowOnPipe.stations')}</h5>
            <div className="space-y-2 sm:hidden">
              {display.rows.map(row => (
                <div key={row.index} data-testid={row.isClosure ? 'elbow-on-pipe-closure' : 'elbow-on-pipe-physical-station'}
                  data-clamped={row.clamped}
                  className={`rounded-md border p-3 ${row.isClosure ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-zinc-800 bg-zinc-900/40'}`}>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <strong className="text-amber-400">{row.isClosure ? t('tools.branchOnElbow.closure') : row.label}</strong>
                    <span className="font-mono text-zinc-400">{row.angleDeg}°</span>
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    <div><dt className="text-zinc-500">{t('tools.branchOnElbow.arc')}</dt><dd className="font-mono text-zinc-200">{row.arcPosition} mm</dd></div>
                    <div>
                      <dt className="text-zinc-500">{t('tools.elbowOnPipe.bendAngle')}</dt>
                      <dd className="font-mono text-amber-400">{row.bendAngleDeg}°{row.clamped ? ` · ${t('tools.elbowOnPipe.limit')}` : ''}</dd>
                    </div>
                    <div><dt className="text-zinc-500">{t('tools.elbowOnPipe.picajeX')}</dt><dd className="font-mono text-zinc-200">{row.picajeX} mm</dd></div>
                    <div><dt className="text-zinc-500">{t('tools.elbowOnPipe.picajeY')}</dt><dd className="font-mono text-zinc-200">{row.picajeY} mm</dd></div>
                    <div><dt className="text-zinc-500">{t('tools.elbowOnPipe.arcRadius')}</dt><dd className="font-mono text-zinc-200">{row.arcRadius} mm</dd></div>
                    <div><dt className="text-zinc-500">{t('tools.elbowOnPipe.arcLength')}</dt><dd className="font-mono text-zinc-200">{row.arcLength} mm</dd></div>
                  </dl>
                </div>
              ))}
            </div>
            <div className="hidden max-h-[420px] overflow-x-auto overflow-y-auto sm:block">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="sticky top-0 bg-zinc-950 text-zinc-400"><tr className="border-b border-zinc-800">
                  <th className="p-2">P#</th>
                  <th className="p-2">{t('tools.elbowOnPipe.angle')}</th>
                  <th className="p-2">{t('tools.branchOnElbow.arc')} (mm)</th>
                  <th className="p-2">{t('tools.elbowOnPipe.picajeX')} (mm)</th>
                  <th className="p-2">{t('tools.elbowOnPipe.picajeY')} (mm)</th>
                  <th className="p-2">{t('tools.elbowOnPipe.arcRadius')} (mm)</th>
                  <th className="p-2">{t('tools.elbowOnPipe.arcLength')} (mm)</th>
                  <th className="p-2">{t('tools.elbowOnPipe.bendAngle')}</th>
                </tr></thead>
                <tbody>{display.rows.map(row => (
                  <tr key={row.index} data-testid="elbow-on-pipe-row" data-station-index={row.index} data-clamped={row.clamped}
                    className={`border-b border-zinc-800/60 ${row.isClosure ? 'text-emerald-400' : 'text-zinc-200'}`}>
                    <td className="p-2 whitespace-nowrap">{row.isClosure ? t('tools.branchOnElbow.closure') : row.label}</td>
                    <td className="p-2 font-mono">{row.angleDeg}</td>
                    <td className="p-2 font-mono">{row.arcPosition}</td>
                    <td className="p-2 font-mono">{row.picajeX}</td>
                    <td className="p-2 font-mono">{row.picajeY}</td>
                    <td className="p-2 font-mono">{row.arcRadius}</td>
                    <td className="p-2 font-mono">{row.arcLength}</td>
                    <td className="p-2 font-mono text-amber-400">{row.bendAngleDeg}{row.clamped ? ' *' : ''}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {display.clampedCount > 0 && (
              <p className="mt-3 text-[10px] text-zinc-500">* {t('tools.elbowOnPipe.limit')}</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
