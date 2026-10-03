import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { ELBOW_DATA, SCHEDULE_WT } from '@/tools/data/elbowData';
import { computeElbowOnPipe, type ElbowOnPipeDatum, type ElbowOnPipeErrorCode, type ElbowOnPipeStation } from '@/tools/branch/elbowOnPipeGeometry';
import { formatMm } from '@/tools/branch/formatMm';

const DIVISIONS = [12, 16, 24, 36, 48];
const INPUT_CLASS = 'min-h-11 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:ring-1 focus:ring-amber-500';
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
  NON_FINITE_RESULT: 'errorDomain',
};

function parseMm(value: string): number {
  return value.trim() === '' ? Number.NaN : Number(value);
}

export default function BranchElbowOnPipePanel() {
  const { t } = useTranslation();
  const [elbowNps, setElbowNps] = useState('3"');
  const [schedule, setSchedule] = useState('40');
  const [receiverNps, setReceiverNps] = useState('6"');
  const [radius, setRadius] = useState('114.3');
  const [divisions, setDivisions] = useState(24);
  const [datumType, setDatumType] = useState<ElbowOnPipeDatum['type']>('EJE');
  const [fe, setFe] = useState('20');
  const [yPrime, setYPrime] = useState('');

  const elbow = ELBOW_DATA.find(pipe => pipe.nps === elbowNps)!;
  const receiver = ELBOW_DATA.find(pipe => pipe.nps === receiverNps)!;
  const schedules = Object.entries(SCHEDULE_WT[elbowNps]).filter(([, wall]) => wall > 0);
  const elbowId = elbow.od - 2 * SCHEDULE_WT[elbowNps][schedule];
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
  }, [elbowId, elbow.od, receiver.od, radius, divisions, datumType, fe]);
  const yPrimeValue = yPrime.trim() === '' ? null : parseMm(yPrime);
  const stationLabel = (station: ElbowOnPipeStation) => station.index === divisions
    ? t('tools.branchOnElbow.closure')
    : `P${station.index + 1}`;
  const stationStatus = (station: ElbowOnPipeStation) => station.clampedAtElbowEnd
    ? t('tools.elbowOnPipe.limit') : null;
  const errorCode = result.errors[0]?.code;

  return (
    <section className="space-y-5" aria-label={t('tools.elbowOnPipe.family')}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3 rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4">
          <h4 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">{t('tools.elbowOnPipe.member')}</h4>
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
              {schedules.map(([key, wall]) => <option key={key} value={key}>Sch {key} (WT {formatMm(wall)} mm)</option>)}
            </select>
          </div>
          <p className="text-xs text-zinc-300">{t('tools.elbowOnPipe.od')}: <span data-testid="eop-elbow-od" className="font-mono">{formatMm(elbow.od)} mm</span> · {t('tools.elbowOnPipe.id')}: <span data-testid="eop-elbow-id" className="font-mono">{formatMm(elbowId)} mm</span></p>
          <div className="space-y-2">
            <Label htmlFor="eop-radius">{t('tools.branchOnElbow.radius')} (mm)</Label>
            <input id="eop-radius" type="number" inputMode="decimal" step="any" className={INPUT_CLASS} value={radius} onChange={event => setRadius(event.target.value)} />
            <p className="text-xs text-zinc-500">{t('tools.branchOnElbow.radiusHint')}</p>
          </div>
        </div>
        <div className="space-y-3 rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4">
          <h4 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">{t('tools.elbowOnPipe.receiver')}</h4>
          <div className="space-y-2">
            <Label htmlFor="eop-receiver-nps">{t('tools.branchLayout.npsSize')}</Label>
            <select id="eop-receiver-nps" className={INPUT_CLASS} value={receiverNps} onChange={event => setReceiverNps(event.target.value)}>
              {ELBOW_DATA.map(pipe => <option key={pipe.nps} value={pipe.nps}>{pipe.nps} (D {formatMm(pipe.od)} mm)</option>)}
            </select>
          </div>
          <p className="text-xs text-zinc-300">{t('tools.elbowOnPipe.receiverD')}: <span data-testid="eop-receiver-d" className="font-mono">{formatMm(receiver.od)} mm</span></p>
          <div className="space-y-2">
            <Label htmlFor="eop-divisions">{t('tools.branchLayout.markingDivisions')}</Label>
            <select id="eop-divisions" className={INPUT_CLASS} value={divisions} onChange={event => setDivisions(Number(event.target.value))}>
              {DIVISIONS.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
        </div>
      </div>
      <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400">{t('tools.branchOnElbow.datum')}</h4>
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
            <Label htmlFor="eop-fe">{t('tools.branchOnElbow.fe')} (mm)</Label>
            <input id="eop-fe" type="number" inputMode="decimal" step="any" className={INPUT_CLASS} value={fe} onChange={event => setFe(event.target.value)} />
            <p className="text-xs text-zinc-400">{t('tools.elbowOnPipe.feHint')}</p>
          </div>
        )}
        <div className="mt-4 max-w-xs space-y-2">
          <Label htmlFor="eop-y-prime">{t('tools.elbowOnPipe.yPrime')} (mm)</Label>
          <input id="eop-y-prime" type="number" inputMode="decimal" step="any" className={INPUT_CLASS} value={yPrime} onChange={event => setYPrime(event.target.value)} />
          <p className="text-xs text-zinc-400">{t('tools.elbowOnPipe.yPrimeHint')}</p>
        </div>
      </div>
      {yPrimeValue !== null && !Number.isFinite(yPrimeValue) && (
        <div role="alert" className="border-l-2 border-red-500 bg-red-500/5 p-4 text-sm text-red-400">{t('tools.elbowOnPipe.errorYPrime')}</div>
      )}
      {!result.valid && errorCode && (
        <div role="alert" data-geometry-error-code={errorCode} className="border-l-2 border-red-500 bg-red-500/5 p-4 text-sm text-red-400">
          {t(`tools.elbowOnPipe.${ERROR_KEYS[errorCode]}`)}
        </div>
      )}
      {result.valid && (yPrimeValue === null || Number.isFinite(yPrimeValue)) && (
        <div data-testid="eop-results" className="space-y-4">
          <h4 className="text-sm font-semibold text-zinc-100">{t('tools.elbowOnPipe.results')}</h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {([
              ['div', result.stationSpacingMm], ['cotaX', result.cotaXMm],
              ...(yPrimeValue === null ? [] : [['yPrime', yPrimeValue]]),
            ] as [string, number][]).map(([key, value]) => (
              <div key={key} data-testid={`eop-metric-${key}`} className="min-w-0 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                <p className="text-xs text-zinc-400">{t(`tools.elbowOnPipe.${key}`)}</p>
                <p className="mt-1 font-mono text-xl font-semibold text-amber-400">{formatMm(value)} mm</p>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4">
            <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              {([
                ['member', `${elbowNps} Sch ${schedule}`],
                ['od', `${formatMm(elbow.od)} mm`], ['id', `${formatMm(elbowId)} mm`],
                ['radius', `${formatMm(parseMm(radius))} mm`],
                ['receiverD', `${receiverNps} · ${formatMm(receiver.od)} mm`],
                ['datum', t(`tools.branchOnElbow.datum${datumType}`)],
                ...(datumType === 'FE' ? [['fe', `${formatMm(parseMm(fe))} mm`]] : []),
                ['count', String(divisions)],
              ] as [string, string][]).map(([key, value]) => (
                <div key={key}><dt className="text-zinc-500">{t(`tools.elbowOnPipe.${key}`)}</dt><dd className="break-words font-mono text-zinc-200">{value}</dd></div>
              ))}
            </dl>
            <details className="mt-3 text-xs text-zinc-400">
              <summary className="cursor-pointer">{t('tools.elbowOnPipe.technical')}</summary>
              <p className="mt-2">{t('tools.elbowOnPipe.seating')}: {formatMm(result.seatingHeightMm, 3)} mm · {t('tools.elbowOnPipe.offset')}: {formatMm(result.datumOffsetMm, 3)} mm</p>
            </details>
          </div>
          <p className="text-xs text-zinc-500">{t('tools.branchOnElbow.mapping', { n: divisions, last: divisions - 1 })}</p>
          <p className="text-xs text-zinc-500">{t('tools.elbowOnPipe.convention')}</p>
          <div className="rounded-lg border border-zinc-800/80 bg-zinc-950 p-4">
            <h5 className="mb-3 text-xs font-medium uppercase tracking-widest text-zinc-400">{t('tools.elbowOnPipe.stations')}</h5>
            <div className="space-y-2 sm:hidden">
              {result.stations.map(station => (
                <div key={station.index} data-testid={station.index === divisions ? 'eop-closure' : 'eop-station'}
                  className={`min-w-0 rounded-md border p-3 ${station.index === divisions ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-zinc-800 bg-zinc-900/40'}`}>
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                    <strong className="text-amber-400">{stationLabel(station)}</strong>
                    <span className="ml-auto font-mono text-zinc-400">{formatMm(station.angleDeg, 1)}°</span>
                    {stationStatus(station) && <span className="text-xs text-amber-400">{stationStatus(station)}</span>}
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    {([
                      ['picajeX', station.picajeXMm], ['picajeY', station.picajeYMm],
                      ['arcLength', station.arcLengthMm], ['arcRadius', station.arcRadiusMm],
                    ] as const).map(([key, value]) => (
                      <div key={key} className="min-w-0"><dt className="text-zinc-500">{t(`tools.elbowOnPipe.${key}`)}</dt><dd className="font-mono text-zinc-200">{formatMm(value, 3)} mm</dd></div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
            <div className="hidden max-h-[420px] overflow-x-auto overflow-y-auto sm:block">
              <table className="w-full min-w-[680px] text-left text-xs">
                <thead className="sticky top-0 bg-zinc-950 text-zinc-400"><tr className="border-b border-zinc-800">
                  <th className="p-2">P</th><th className="p-2">{t('tools.elbowOnPipe.angle')}</th>
                  <th className="p-2">{t('tools.elbowOnPipe.picajeX')} (mm)</th>
                  <th className="p-2">{t('tools.elbowOnPipe.picajeY')} (mm)</th>
                  <th className="p-2">{t('tools.elbowOnPipe.arcLength')} (mm)</th>
                  <th className="p-2">{t('tools.elbowOnPipe.arcRadius')} (mm)</th>
                </tr></thead>
                <tbody>{result.stations.map(station => (
                  <tr key={station.index} data-testid={station.index === divisions ? 'eop-closure-row' : 'eop-station-row'} className={`border-b border-zinc-800/60 ${station.index === divisions ? 'text-emerald-400' : 'text-zinc-200'}`}>
                    <td className="whitespace-nowrap p-2">{stationLabel(station)}{stationStatus(station) && <span className="ml-2 text-amber-400">{stationStatus(station)}</span>}</td>
                    <td className="p-2 font-mono">{formatMm(station.angleDeg, 1)}°</td>
                    <td className="p-2 font-mono">{formatMm(station.picajeXMm, 3)}</td>
                    <td className="p-2 font-mono">{formatMm(station.picajeYMm, 3)}</td>
                    <td className="p-2 font-mono">{formatMm(station.arcLengthMm, 3)}</td>
                    <td className="p-2 font-mono">{formatMm(station.arcRadiusMm, 3)}</td>
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
