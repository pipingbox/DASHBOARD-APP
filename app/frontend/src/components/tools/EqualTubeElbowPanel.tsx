import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ELBOW_DATA, SCHEDULE_WT } from '@/tools/data/elbowData';
import {
  computeEqualTubeElbowJoint,
  type EqualTubeElbowErrorCode,
} from '@/tools/branch/equalTubeElbowGeometry';
import {
  projectEqualTubeElbow,
  type EqualTubeElbowSummaryKey,
} from '@/tools/branch/equalTubeElbowDisplay';
import { buildEqualTubeElbowTubePreview, buildEqualTubeElbowMarkingPreview, buildEqualTubeElbowSchematic } from '@/tools/branch/equalTubeElbowPreviewSvg';
import { formatMm } from '@/tools/branch/formatMm';
import { buildEqualTubeTemplate, type EqualTubeTemplateOrdinate } from '@/tools/branch/equalTubeElbowTemplateSvg';
import { buildEqualTubeGuide } from '@/tools/branch/equalTubeElbowGuideSvg';
import { buildEqualTubeElbowPdfLabels } from '@/tools/branch/equalTubeElbowPdfLabels';
import { svgPagesToPdf } from '@/tools/branch/svgMmToPdf';
import { PDF_PAGE_FORMATS, type PdfPageFormatId } from '@/tools/branch/pdfPageFormat';

/**
 * PB-BRANCH-EQUAL-TUBE-ELBOW-001 — U6.2
 * TUBO ⇄ CODO IGUALES panel: numeric results, screen previews and fabrication
 * PDFs for the fourth injerto family.
 *
 * Both members share one dimension set (d.in/d.ex from NPS + schedule), which
 * is what makes this family "equal". Two fabrication objects, deliberately of
 * different kinds (same doctrine as codo→tubo, U5.4):
 *
 *   - the TUBE is a cylinder: its cut contour develops exactly and ships as a
 *     true 1:1 template, with a switchable ordinate (cut-back from the
 *     elbow-side end for wrapping; Cota tubo for cross-checking the table);
 *   - the ELBOW is a torus with no flat development: it gets a MARKING GUIDE
 *     (1:1 OD division strip + per-station arc radius / arc length), never a
 *     "flat elbow template".
 *
 * No geometry is computed here. Every number is a projection of the validated
 * U6.1 kernel; the SVG/PDF generators only map mm → px / mm.
 */

const DIVISIONS = [12, 16, 24];
const INPUT_CLASS = 'min-h-11 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:ring-1 focus:ring-amber-500';

type GraphicTab = 'tube' | 'marking' | 'schematic';
const GRAPHIC_TABS: GraphicTab[] = ['tube', 'marking', 'schematic'];
const GRAPHIC_TAB_KEYS: Record<GraphicTab, string> = {
  tube: 'tools.equalTubeElbow.tabTube',
  marking: 'tools.equalTubeElbow.tabMarking',
  schematic: 'tools.equalTubeElbow.tabSchematic',
};

/** All kernel codes map onto a shop-readable cause. */
const ERROR_KEYS: Record<EqualTubeElbowErrorCode, string> = {
  NON_FINITE_INPUT: 'errorNumber',
  INVALID_LENGTH: 'errorLength',
  INVALID_DIAMETERS: 'errorDimension',
  ELBOW_RADIUS_TOO_SMALL: 'errorRadius',
  TUBE_TOO_SHORT: 'errorTooShort',
  DIVISIONS_OUT_OF_RANGE: 'errorDivisions',
  NON_FINITE_RESULT: 'errorNumber',
};

const SUMMARY_LABEL_KEYS: Record<EqualTubeElbowSummaryKey, string> = {
  length: 'tools.equalTubeElbow.length',
  radius: 'tools.branchOnElbow.radius',
  maxCutback: 'tools.equalTubeElbow.maxCutback',
  div: 'tools.elbowOnPipe.div',
  circumference: 'tools.elbowOnPipe.circumference',
};

/** Default R = B16.9 long radius (1.5 × NPS) — the standard butt-weld elbow. */
const defaultRadius = (nps: string) => formatMm(ELBOW_DATA.find(entry => entry.nps === nps)!.lrRadius);

function parseMm(value: string): number {
  return value.trim() === '' ? Number.NaN : Number(value);
}

export default function EqualTubeElbowPanel() {
  const { t } = useTranslation();
  const [nps, setNps] = useState('3"');
  const [schedule, setSchedule] = useState('40');
  const [radius, setRadius] = useState(defaultRadius('3"'));
  const [length, setLength] = useState('300');
  const [divisions, setDivisions] = useState(24);
  const [graphic, setGraphic] = useState<GraphicTab>('tube');
  const [pdfFormat, setPdfFormat] = useState<PdfPageFormatId>('A4');
  const [ordinate, setOrdinate] = useState<EqualTubeTemplateOrdinate>('fromEnd');

  const pipe = ELBOW_DATA.find(entry => entry.nps === nps)!;
  const schedules = Object.entries(SCHEDULE_WT[nps]).filter(([, wall]) => wall > 0);
  const wall = SCHEDULE_WT[nps][schedule] ?? 0;
  const innerDiameter = pipe.od - 2 * wall;

  const result = useMemo(() => computeEqualTubeElbowJoint({
    lengthMm: parseMm(length),
    innerDiameterMm: innerDiameter,
    outerDiameterMm: pipe.od,
    elbowCenterlineRadiusMm: parseMm(radius),
    divisions,
  }), [length, innerDiameter, pipe.od, radius, divisions]);

  const display = useMemo(() => projectEqualTubeElbow(result), [result]);
  const errorCode = result.errors[0]?.code;

  const memberLabel = `${nps} Sch ${schedule} · OD ${formatMm(pipe.od)} mm · ID ${formatMm(innerDiameter)} mm · R ${formatMm(parseMm(radius))} mm · L ${formatMm(parseMm(length))} mm`;

  /* Screen previews: projections of the kernel result; generators only map
     mm → px. */
  const graphicSvg = useMemo(() => {
    if (!result.valid) return null;
    const screenPreviewNote = t('tools.branchOnElbow.screenPreview');
    if (graphic === 'tube') {
      return buildEqualTubeElbowTubePreview(result, {
        title: t('tools.equalTubeElbow.tubeTitle'),
        note: t('tools.equalTubeElbow.tubeNote'),
        arcAxis: t('tools.equalTubeElbow.tubeArcAxis'),
        cotaAxis: t('tools.equalTubeElbow.tubeCotaAxis'),
        closureLabel: t('tools.branchOnElbow.closure'),
        screenPreviewNote,
      })?.svg ?? null;
    }
    if (graphic === 'marking') {
      return buildEqualTubeElbowMarkingPreview(result, {
        title: t('tools.equalTubeElbow.markingTitle'),
        note: t('tools.equalTubeElbow.markingNote'),
        arcAxis: t('tools.equalTubeElbow.tubeArcAxis'),
        lengthAxis: t('tools.equalTubeElbow.markingLengthAxis'),
        angleAxis: t('tools.equalTubeElbow.markingAngleAxis'),
        limitLabel: t('tools.equalTubeElbow.markingLimit'),
        closureLabel: t('tools.branchOnElbow.closure'),
        clampedLegend: t('tools.elbowOnPipe.clampedLegend'),
        screenPreviewNote,
      })?.svg ?? null;
    }
    return buildEqualTubeElbowSchematic({
      elbowCentrelineRadiusMm: parseMm(radius),
      outerDiameterMm: pipe.od,
      innerDiameterMm: innerDiameter,
      lengthMm: parseMm(length),
      maxCutbackMm: result.valid ? result.maxCutbackMm : 0,
    }, {
      title: t('tools.branchOnElbow.schematicTitle'),
      notToScale: t('tools.branchOnElbow.notToScale'),
      screenPreviewNote,
      tube: t('tools.equalTubeElbow.member'),
      elbow: t('tools.equalTubeElbow.elbowMember'),
      extrados: t('tools.equalTubeElbow.extrados'),
      intrados: t('tools.equalTubeElbow.intrados'),
      radiusLabel: t('tools.branchOnElbow.radius'),
      cutbackLabel: t('tools.equalTubeElbow.maxCutback'),
      lengthLabel: t('tools.equalTubeElbow.length'),
      bendPlane: t('tools.equalTubeElbow.bendPlane'),
    })?.svg ?? null;
  }, [result, graphic, radius, pipe.od, innerDiameter, length, t]);

  /* Physical outputs, built from the kernel result through the PDF-safe label
     layer; paper format only changes MediaBox and tiling. */
  const pdfLabels = useMemo(() => buildEqualTubeElbowPdfLabels({
    translate: (key: string) => t(key),
    memberLabel,
  }), [memberLabel, t]);
  const tubeTemplate = useMemo(() => result.valid ? buildEqualTubeTemplate(result, {
    format: pdfFormat, ordinate, meta: pdfLabels.template,
  }) : null, [result, pdfFormat, ordinate, pdfLabels]);
  const markingGuide = useMemo(() => result.valid ? buildEqualTubeGuide(result, {
    format: pdfFormat, meta: pdfLabels.guide,
  }) : null, [result, pdfFormat, pdfLabels]);

  const downloadPdf = (bytes: Uint8Array, filename: string) => {
    const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast.success(t('tools.branchLayout.pdfDownloaded'));
  };
  const slug = (value: string) => value.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  const fileStem = `pipingbox-tubo-codo-iguales-${slug(nps)}-sch${slug(schedule)}-${pdfFormat}`;
  const handleDownloadTubePdf = () => {
    if (!tubeTemplate) return;
    downloadPdf(svgPagesToPdf(tubeTemplate.tiles.map(tile => ({ svg: tile.svg, widthMm: tile.widthMm, heightMm: tile.heightMm }))),
      `${fileStem}-tube-cut-template-1to1.pdf`);
  };
  const handleDownloadGuidePdf = () => {
    if (!markingGuide) return;
    downloadPdf(svgPagesToPdf(markingGuide.tiles.map(tile => ({ svg: tile.svg, widthMm: tile.widthMm, heightMm: tile.heightMm }))),
      `${fileStem}-elbow-marking-guide.pdf`);
  };

  return (
    <section className="space-y-5" aria-label={t('tools.equalTubeElbow.family')}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-3 rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">{t('tools.equalTubeElbow.member')}</p>
          <div className="space-y-2">
            <Label htmlFor="ete-nps">{t('tools.branchLayout.npsSize')}</Label>
            <select id="ete-nps" className={INPUT_CLASS} value={nps} onChange={event => {
              const next = event.target.value;
              setNps(next);
              setRadius(defaultRadius(next));
              if (!(SCHEDULE_WT[next]?.[schedule] > 0)) {
                setSchedule(Object.keys(SCHEDULE_WT[next]).find(key => SCHEDULE_WT[next][key] > 0) ?? '40');
              }
            }}>
              {ELBOW_DATA.map(entry => <option key={entry.nps} value={entry.nps}>{entry.nps} (OD {formatMm(entry.od)} mm)</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ete-schedule">{t('tools.branchLayout.schedule')}</Label>
            <select id="ete-schedule" className={INPUT_CLASS} value={schedule} onChange={event => setSchedule(event.target.value)}>
              {schedules.map(([sch, wt]) => <option key={sch} value={sch}>Sch {sch} (WT {formatMm(wt)} mm)</option>)}
            </select>
          </div>
          <p className="text-xs text-zinc-400">
            {t('tools.equalTubeElbow.od')}: <span className="font-mono text-zinc-100">{formatMm(pipe.od)} mm</span>
            {' · '}{t('tools.equalTubeElbow.id')}: <span className="font-mono text-zinc-100">{formatMm(innerDiameter)} mm</span>
          </p>
          <p className="text-xs text-zinc-500">{t('tools.equalTubeElbow.equalMembers')}</p>
        </div>

        <div className="space-y-3 rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">{t('tools.branchLayout.parameters')}</p>
          <div className="space-y-2">
            <Label htmlFor="ete-radius">{t('tools.branchOnElbow.radius')} (mm)</Label>
            <input id="ete-radius" type="number" inputMode="decimal" step="any" className={INPUT_CLASS} value={radius} onChange={event => setRadius(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ete-length">{t('tools.equalTubeElbow.length')} (mm)</Label>
            <input id="ete-length" type="number" inputMode="decimal" step="any" className={INPUT_CLASS} value={length} onChange={event => setLength(event.target.value)} />
          </div>
          <p className="text-xs text-zinc-500">{t('tools.equalTubeElbow.lengthHint')}</p>
        </div>

        <div className="space-y-3 rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">{t('tools.equalTubeElbow.marking')}</p>
          <div className="space-y-2">
            <Label htmlFor="ete-divisions">{t('tools.branchLayout.markingDivisions')}</Label>
            <select id="ete-divisions" className={INPUT_CLASS} value={divisions} onChange={event => setDivisions(Number(event.target.value))}>
              {DIVISIONS.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
          <p className="text-xs text-zinc-500">{t('tools.equalTubeElbow.mapping', { n: divisions, last: divisions - 1 })}</p>
        </div>
      </div>

      {!result.valid && errorCode && (
        <div role="alert" data-geometry-error-code={errorCode} className="border-l-2 border-red-500 bg-red-500/5 p-4 text-sm text-red-400">
          {t(`tools.equalTubeElbow.${ERROR_KEYS[errorCode]}`)}
        </div>
      )}

      {result.valid && display && (
        <div data-testid="equal-tube-elbow-results" className="space-y-4">
          <h4 className="text-sm font-semibold text-zinc-100">{t('tools.equalTubeElbow.results')}</h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {display.summary.map(entry => (
              <div key={entry.key} data-testid="equal-tube-elbow-metric" data-metric={entry.key}
                className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                <p className="text-xs text-zinc-400">{t(SUMMARY_LABEL_KEYS[entry.key])}</p>
                <p className="mt-1 font-mono text-xl font-semibold text-amber-400">{entry.value} mm</p>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4">
            <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">{t('tools.equalTubeElbow.technical')}</p>
            <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <div><dt className="text-zinc-500">d.ex</dt><dd className="font-mono text-zinc-200">{formatMm(pipe.od)} mm</dd></div>
              <div><dt className="text-zinc-500">d.in</dt><dd className="font-mono text-zinc-200">{formatMm(innerDiameter)} mm</dd></div>
              <div><dt className="text-zinc-500">R</dt><dd className="font-mono text-zinc-200">{formatMm(parseMm(radius))} mm</dd></div>
              <div><dt className="text-zinc-500">{t('tools.equalTubeElbow.count')}</dt><dd className="font-mono text-zinc-200">{divisions}</dd></div>
            </dl>
          </div>

          {display.clampedCount > 0 && (
            <p data-testid="equal-tube-elbow-clamp-note" data-clamped-count={display.clampedCount} className="text-xs text-amber-400/90">
              {t('tools.equalTubeElbow.clampedNote', { stations: display.clampedCount, total: divisions })}
            </p>
          )}
          <p className="text-xs text-zinc-500">{t('tools.equalTubeElbow.description')}</p>

          {tubeTemplate && markingGuide && (
            <div data-testid="equal-tube-elbow-fabrication" className="space-y-3 rounded-lg border border-amber-500/30 bg-zinc-950 p-4">
              <h5 className="text-xs font-medium uppercase tracking-widest text-zinc-400">{t('tools.equalTubeElbow.fabrication')}</h5>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Label htmlFor="equal-tube-elbow-pdf-format" className="whitespace-nowrap text-xs text-zinc-500">{t('tools.branchLayout.printFormat')}</Label>
                  <select id="equal-tube-elbow-pdf-format" value={pdfFormat} onChange={event => setPdfFormat(event.target.value as PdfPageFormatId)}
                    className="min-h-11 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:ring-1 focus:ring-amber-500">
                    {PDF_PAGE_FORMATS.map(format => (
                      <option key={format.id} value={format.id}>{format.id} · {format.widthMm} × {format.heightMm} mm</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="equal-tube-elbow-ordinate" className="whitespace-nowrap text-xs text-zinc-500">{t('tools.equalTubeElbow.ordinate')}</Label>
                  <select id="equal-tube-elbow-ordinate" value={ordinate} onChange={event => setOrdinate(event.target.value as EqualTubeTemplateOrdinate)}
                    className="min-h-11 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:ring-1 focus:ring-amber-500">
                    <option value="fromEnd">{t('tools.equalTubeElbow.ordinateFromEnd')}</option>
                    <option value="cota">{t('tools.equalTubeElbow.ordinateCota')}</option>
                  </select>
                </div>
                <Button onClick={handleDownloadTubePdf} data-testid="equal-tube-elbow-download-tube" className="min-h-11 max-w-full whitespace-normal text-left bg-amber-500 font-semibold text-black hover:bg-amber-600">
                  {t('tools.equalTubeElbow.downloadTubePdf')}
                </Button>
                <Button onClick={handleDownloadGuidePdf} data-testid="equal-tube-elbow-download-guide" variant="outline" className="min-h-11 max-w-full whitespace-normal text-left border-zinc-700 !bg-transparent !text-zinc-100 hover:!bg-zinc-900">
                  {t('tools.equalTubeElbow.downloadGuidePdf')}
                </Button>
              </div>
              <p data-testid="equal-tube-elbow-template-pages" data-pages={tubeTemplate.tiles.length} data-pages-x={tubeTemplate.pagesX} data-pages-y={tubeTemplate.pagesY}
                data-circumference-mm={tubeTemplate.circumferenceMm} className="text-xs text-zinc-300">
                {t('tools.equalTubeElbow.templatePages', { pages: tubeTemplate.tiles.length, format: pdfFormat, circumference: formatMm(tubeTemplate.circumferenceMm) })}
              </p>
              <p className="text-xs text-zinc-500">{t('tools.equalTubeElbow.templateWhy')}</p>
              <p data-testid="equal-tube-elbow-guide-pages" data-pages={markingGuide.tiles.length} data-strip-length-mm={markingGuide.stripLengthMm} className="text-xs text-zinc-500">
                {t('tools.equalTubeElbow.guideWhy')}
              </p>
              <p className="text-xs font-medium text-amber-400/90">{t('tools.branchOnElbow.printPolicy')}</p>
            </div>
          )}

          <div className="rounded-lg border border-zinc-800/80 bg-zinc-950 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h5 className="text-xs font-medium uppercase tracking-widest text-zinc-400">{t('tools.equalTubeElbow.graphics')}</h5>
              <span className="text-[10px] text-zinc-500">{t('tools.branchOnElbow.screenPreview')}</span>
            </div>
            <div role="tablist" aria-label={t('tools.equalTubeElbow.graphics')} className="grid grid-cols-3 gap-2">
              {GRAPHIC_TABS.map(tab => (
                <button key={tab} type="button" role="tab" id={`equal-tube-elbow-tab-${tab}`}
                  aria-selected={graphic === tab} aria-controls="equal-tube-elbow-graphic-panel"
                  onClick={() => setGraphic(tab)}
                  className={`min-h-11 rounded-md border px-2 py-2 text-xs font-semibold sm:text-sm ${graphic === tab ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:border-zinc-600'}`}>
                  {t(GRAPHIC_TAB_KEYS[tab])}
                </button>
              ))}
            </div>
            {graphicSvg && (
              <div id="equal-tube-elbow-graphic-panel" role="tabpanel" aria-labelledby={`equal-tube-elbow-tab-${graphic}`}
                data-testid="equal-tube-elbow-graphic" data-graphic={graphic}
                className="mt-3 w-full overflow-hidden rounded-md border border-zinc-800/80"
                dangerouslySetInnerHTML={{ __html: graphicSvg }} />
            )}
            {graphic === 'marking' && (
              <p className="mt-3 text-xs text-amber-400/90" data-testid="equal-tube-elbow-marking-note">{t('tools.equalTubeElbow.markingNote')}</p>
            )}
          </div>

          <div className="rounded-lg border border-zinc-800/80 bg-zinc-950 p-4">
            <h5 className="mb-3 text-xs font-medium uppercase tracking-widest text-zinc-400">{t('tools.equalTubeElbow.stations')}</h5>
            <div className="space-y-2 sm:hidden">
              {display.rows.map(row => (
                <div key={row.index} data-testid={row.isClosure ? 'equal-tube-elbow-closure' : 'equal-tube-elbow-physical-station'}
                  data-clamped={row.clamped}
                  className={`rounded-md border p-3 ${row.isClosure ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-zinc-800 bg-zinc-900/40'}`}>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <strong className="text-amber-400">{row.isClosure ? t('tools.branchOnElbow.closure') : row.label}</strong>
                    <span className="font-mono text-zinc-400">{row.angleDeg}°</span>
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    <div><dt className="text-zinc-500">{t('tools.branchOnElbow.arc')}</dt><dd className="font-mono text-zinc-200">{row.arcPosition} mm</dd></div>
                    <div><dt className="text-zinc-500">{t('tools.equalTubeElbow.tubeCota')}</dt><dd className="font-mono text-zinc-200">{row.tubeCota} mm</dd></div>
                    <div><dt className="text-zinc-500">{t('tools.equalTubeElbow.markFromEnd')}</dt><dd className="font-mono text-amber-400">{row.markFromEnd} mm</dd></div>
                    <div>
                      <dt className="text-zinc-500">{t('tools.equalTubeElbow.bendAngle')}</dt>
                      <dd className="font-mono text-amber-400">{row.bendAngleDeg}°{row.clamped ? ` · ${t('tools.equalTubeElbow.limit')}` : ''}</dd>
                    </div>
                    <div><dt className="text-zinc-500">{t('tools.equalTubeElbow.arcRadius')}</dt><dd className="font-mono text-zinc-200">{row.arcRadius} mm</dd></div>
                    <div><dt className="text-zinc-500">{t('tools.equalTubeElbow.arcLength')}</dt><dd className="font-mono text-zinc-200">{row.arcLength} mm</dd></div>
                  </dl>
                </div>
              ))}
            </div>
            <div className="hidden max-h-[420px] overflow-x-auto overflow-y-auto sm:block">
              <table className="w-full min-w-[820px] text-left text-xs">
                <thead className="sticky top-0 bg-zinc-950 text-zinc-400"><tr className="border-b border-zinc-800">
                  <th className="p-2">P#</th>
                  <th className="p-2">{t('tools.equalTubeElbow.angle')}</th>
                  <th className="p-2">{t('tools.branchOnElbow.arc')} (mm)</th>
                  <th className="p-2">{t('tools.equalTubeElbow.tubeCota')} (mm)</th>
                  <th className="p-2">{t('tools.equalTubeElbow.markFromEnd')} (mm)</th>
                  <th className="p-2">{t('tools.equalTubeElbow.arcRadius')} (mm)</th>
                  <th className="p-2">{t('tools.equalTubeElbow.arcLength')} (mm)</th>
                  <th className="p-2">{t('tools.equalTubeElbow.bendAngle')}</th>
                </tr></thead>
                <tbody>{display.rows.map(row => (
                  <tr key={row.index} data-testid="equal-tube-elbow-row" data-station-index={row.index} data-clamped={row.clamped}
                    className={`border-b border-zinc-800/60 ${row.isClosure ? 'text-emerald-400' : 'text-zinc-200'}`}>
                    <td className="p-2 whitespace-nowrap">{row.isClosure ? t('tools.branchOnElbow.closure') : row.label}</td>
                    <td className="p-2 font-mono">{row.angleDeg}</td>
                    <td className="p-2 font-mono">{row.arcPosition}</td>
                    <td className="p-2 font-mono">{row.tubeCota}</td>
                    <td className="p-2 font-mono text-amber-400">{row.markFromEnd}</td>
                    <td className="p-2 font-mono">{row.arcRadius}</td>
                    <td className="p-2 font-mono">{row.arcLength}</td>
                    <td className="p-2 font-mono text-amber-400">{row.bendAngleDeg}{row.clamped ? ' *' : ''}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {display.clampedCount > 0 && (
              <p className="mt-3 text-[10px] text-zinc-500">* {t('tools.equalTubeElbow.limit')}</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
