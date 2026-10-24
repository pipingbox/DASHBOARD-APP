import { test, expect, chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * PB-UI-DOM-PROFILE-INSERTBEFORE-UNRESOLVED-001 — RCA + fix del
 * "NotFoundError insertBefore" residual en /profile (último evento
 * 2026-10-23 16:29 Europe/Brussels, build 80747eb con todos los fixes DOM
 * previos ya integrados).
 *
 * Refinamiento de la clase causal respecto a PR #101: no basta "elemento
 * condicional + bare text". El swap ternario entre DOS COMPONENTES LUCIDE
 * DISTINTOS (p. ej. Camera ↔ Loader2) hace que React DESMONTE uno y MONTE el
 * otro (tipos de elemento distintos), y el mount se ancla al sibling
 * siguiente. Si ese sibling es un bare Text que Chrome auto-translate ha
 * envuelto en <font> (desplazado del parent), insertBefore recibe un nodo que
 * ya no es child → NotFoundError — la firma exacta de producción. Un swap
 * entre elementos del MISMO tipo host (i↔i, svg↔svg inline) se actualiza en
 * sitio y NO reproduce (verificado: primera iteración del harness, 0 errores).
 *
 * RCA CONFIRMADOS (presentes en 80747eb y main, montados en /profile, con
 * transición real de usuario):
 *
 *   C1 — AvatarUpload upload CTA:   <label>{uploading ? <Loader2/> : <Camera/>}BARE<input/></label>
 *   C2 — AvatarUpload visibility:   <button>{toggling ? <Loader2/> : <EyeOff/>|<Eye/>}BARE</button>
 *   C3 — AvatarUpload remove CTA:   <button>{removing ? <Loader2/> : <Trash2/>}BARE</button>
 *   C4 — CVUploadSection view CTA:  <button>{openingCv ? <Loader2/> : <Download/>}BARE</button>
 *
 * NO-RCA / descartados con evidencia (matriz completa en el ticket BRAIN):
 *   - Submit principal de Profile.tsx: PROBE en PR #101, no reproduce
 *     (React 18 actualiza text child solitario via nodeValue) — HARDENING.
 *   - Icon-only Eye/EyeOff swaps (WorkExperience/Certifications/Documents
 *     visibility toggles, CVUploadSection remove): sin bare text sibling, el
 *     mount usa anchor=null (appendChild) — SAFE.
 *   - MatchReadyBanner action (Briefcase/ArrowRight + bare text): la clase
 *     estructural existe, pero item.target.kind es estable durante la vida
 *     del item (sin transición real que cambie el icono bajo el mismo
     parent/key sin remount) — THEORETICAL / NO RCA, dejado intacto.
 *   - Save-status badge, GenerateCV, AvailabilityMobility save,
 *     Certifications submit/delete, Documents submit, ExperienceQuickCapture
 *     submit, CVUpload upload label, PhoneVerification OTP buttons:
 *     labels ya anclados en <span> por fixes previos — STABLE / SAFE
 *     (regression guards preexistentes).
 *
 * Estructura: HISTORICAL CONTROLS (shapes PRE-FIX lucide-fieles, DEBEN
 * reproducir la firma exacta) + AFTER (shapes corregidas con <span> estable,
 * 0 pageerrors, label/icono/CTA operativos). Harness: React 18.3.1 UMD local,
 * sin red, translateSim con font-wrap real.
 */

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND = join(REPO_ROOT, 'app', 'frontend');
const REACT_UMD = readFileSync(
  join(FRONTEND, 'node_modules', 'react', 'umd', 'react.production.min.js'),
  'utf-8',
);
const REACT_DOM_UMD = readFileSync(
  join(FRONTEND, 'node_modules', 'react-dom', 'umd', 'react-dom.production.min.js'),
  'utf-8',
);

function translateSim(target: Element): number {
  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode())
    if ((walker.currentNode as Text).nodeValue?.trim()) nodes.push(walker.currentNode as Text);
  for (const n of nodes) {
    const font = document.createElement('font');
    font.style.verticalAlign = 'inherit';
    font.textContent = n.nodeValue;
    n.parentNode!.replaceChild(font, n);
  }
  return nodes.length;
}

async function launchBrowser() {
  // CI uses the default playwright-managed browser. Sandbox environments
  // without install permissions can point CHROMIUM_EXECUTABLE_PATH at an
  // existing chromium/headless-shell binary.
  const executablePath = process.env.CHROMIUM_EXECUTABLE_PATH || undefined;
  return chromium.launch({ executablePath });
}

/** Lucide-faithful icon factory: each icon is a DISTINCT component type, so a
 *  ternary swap unmounts one and mounts the other (exactly like lucide-react
 *  forwardRef icons: Camera ≠ Loader2 ≠ Eye ≠ …). */
const LUCIDE_PRELUDE = `
  const React = window.React, ReactDOM = window.ReactDOM, h = React.createElement;
  const mkIcon = (cls) => {
    const Icon = () => h('svg', { className: cls }, h('path', { d: 'M0 0h24v24H0z' }));
    return Icon;
  };
  const Loader2 = mkIcon('loader'), Camera = mkIcon('camera'), Eye = mkIcon('eye'),
        EyeOff = mkIcon('eyeoff'), Trash2 = mkIcon('trash'), Download = mkIcon('download');
`;

interface CaseDef {
  testid: string;
  mountFn: string;
  transitions: string[];
  expectLabel: string;
}

const CASES: Record<string, CaseDef> = {
  C1: {
    testid: 'c1-upload',
    mountFn: `(() => { ${LUCIDE_PRELUDE}
      function Cta({ uploading, hasAvatar, fixed }) {
        const label = uploading ? 'Uploading photo...' : hasAvatar ? 'Change photo' : 'Upload photo';
        return h('label', { 'data-testid': 'c1-upload' },
          uploading ? h(Loader2) : h(Camera),
          fixed ? h('span', null, label) : label,
          h('input', { type: 'file', hidden: true }));
      }
      let set;
      function App() { const [u, s] = React.useState(false); set = s;
        return h(Cta, { uploading: u, hasAvatar: true, fixed: window.__FIXED }); }
      window.__set = (b) => set(b);
      ReactDOM.createRoot(document.getElementById('root')).render(h(App));
    })()`,
    transitions: ['window.__set(true)', 'window.__set(false)'],
    expectLabel: 'Change photo',
  },
  C2: {
    testid: 'c2-visibility',
    mountFn: `(() => { ${LUCIDE_PRELUDE}
      function Cta({ toggling, show, fixed }) {
        const label = show ? 'Hide photo' : 'Show photo';
        return h('button', { 'data-testid': 'c2-visibility' },
          toggling ? h(Loader2) : show ? h(EyeOff) : h(Eye),
          fixed ? h('span', null, label) : label);
      }
      let setT, setS;
      function App() {
        const [t, st] = React.useState(false);
        const [sh, ss] = React.useState(true);
        setT = st; setS = ss;
        return h(Cta, { toggling: t, show: sh, fixed: window.__FIXED });
      }
      window.__toggle = (b) => setT(b);
      window.__show = (b) => setS(b);
      ReactDOM.createRoot(document.getElementById('root')).render(h(App));
    })()`,
    transitions: ['window.__toggle(true)', 'window.__toggle(false)', 'window.__show(false)'],
    expectLabel: 'Show photo',
  },
  C3: {
    testid: 'c3-remove',
    mountFn: `(() => { ${LUCIDE_PRELUDE}
      function Cta({ removing, fixed }) {
        return h('button', { 'data-testid': 'c3-remove' },
          removing ? h(Loader2) : h(Trash2),
          fixed ? h('span', null, 'Remove') : 'Remove');
      }
      let set;
      function App() { const [r, s] = React.useState(false); set = s;
        return h(Cta, { removing: r, fixed: window.__FIXED }); }
      window.__set = (b) => set(b);
      ReactDOM.createRoot(document.getElementById('root')).render(h(App));
    })()`,
    transitions: ['window.__set(true)', 'window.__set(false)'],
    expectLabel: 'Remove',
  },
  C4: {
    testid: 'c4-viewcv',
    mountFn: `(() => { ${LUCIDE_PRELUDE}
      function Cta({ opening, fixed }) {
        return h('button', { 'data-testid': 'c4-viewcv' },
          opening ? h(Loader2) : h(Download),
          fixed ? h('span', null, 'View CV') : 'View CV');
      }
      let set;
      function App() { const [o, s] = React.useState(false); set = s;
        return h(Cta, { opening: o, fixed: window.__FIXED }); }
      window.__set = (b) => set(b);
      ReactDOM.createRoot(document.getElementById('root')).render(h(App));
    })()`,
    transitions: ['window.__set(true)', 'window.__set(false)'],
    expectLabel: 'View CV',
  },
};

async function runShape(c: CaseDef, fixed: boolean): Promise<string[]> {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`${e.name}: ${e.message}`));
  await page.setContent('<!doctype html><html><body><div id="root"></div></body></html>');
  await page.addScriptTag({ content: REACT_UMD });
  await page.addScriptTag({ content: REACT_DOM_UMD });
  await page.evaluate(`window.__FIXED = ${fixed};`);
  await page.evaluate(c.mountFn);

  const root = await page.locator('#root').elementHandle();
  const wrapped = await page.evaluate(translateSim, root);
  expect(wrapped).toBeGreaterThan(0);

  for (const t of c.transitions) {
    await page.evaluate(t);
    await page.waitForTimeout(90);
  }

  if (fixed) {
    // AFTER: label survives, CTA content correct after the full cycle.
    await expect(page.locator(`[data-testid="${c.testid}"] span`).first()).toBeVisible();
    await expect(page.locator(`[data-testid="${c.testid}"]`)).toContainText(c.expectLabel);
  }

  await browser.close();
  return errors;
}

test.describe('PB-UI-DOM-PROFILE-INSERTBEFORE-UNRESOLVED-001 — HISTORICAL CONTROLS (PRE-FIX, must reproduce)', () => {
  for (const [id, c] of Object.entries(CASES)) {
    test(`${id} PRE-FIX reproduces NotFoundError insertBefore (exact production signature)`, async () => {
      const errors = await runShape(c, false);
      const crash = errors.filter((e) => /NotFoundError/.test(e) && /insertBefore/.test(e));
      console.log(`[${id} BEFORE] pageerrors:`, JSON.stringify(errors));
      expect(
        crash.length,
        `${id} PRE-FIX must reproduce the production crash; got: ${JSON.stringify(errors)}`,
      ).toBeGreaterThan(0);
      expect(crash[0]).toContain('not a child of this node');
    });
  }
});

test.describe('PB-UI-DOM-PROFILE-INSERTBEFORE-UNRESOLVED-001 — AFTER (fixed <span> shapes)', () => {
  for (const [id, c] of Object.entries(CASES)) {
    test(`${id} AFTER: stable <span> label, full transition cycle under mutated DOM, zero pageerrors`, async () => {
      const errors = await runShape(c, true);
      const crash = errors.filter((e) => /insertBefore|removeChild|NotFoundError/.test(e));
      console.log(`[${id} AFTER] pageerrors:`, JSON.stringify(errors));
      expect(
        crash,
        `${id} AFTER (fixed) must not throw under translate-mutated DOM`,
      ).toEqual([]);
    });
  }
});

// §12 ROUTE-LEVEL VALIDATION — composite /profile tree (all FIXED shapes plus
// the previously hardened nodes) exercised under a single font-wrap mutation
// to detect any OTHER insertBefore/removeChild NotFoundError across the real
// transition set. Not a substitute for the historical controls above.
test('route-level: /profile composite tree under font-wrap, all real transitions, zero DOM errors', async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`${e.name}: ${e.message}`));
  await page.setContent('<!doctype html><html><body><div id="root"></div></body></html>');
  await page.addScriptTag({ content: REACT_UMD });
  await page.addScriptTag({ content: REACT_DOM_UMD });

  await page.evaluate(() => {
    const React = (window as any).React, ReactDOM = (window as any).ReactDOM, h = React.createElement;
    const mkIcon = (cls: string) => {
      const Icon = () => h('svg', { className: cls }, h('path', { d: 'M0 0h24v24H0z' }));
      return Icon;
    };
    const Loader2 = mkIcon('loader'), Camera = mkIcon('camera'), Eye = mkIcon('eye'),
          EyeOff = mkIcon('eyeoff'), Trash2 = mkIcon('trash'), Download = mkIcon('download'),
          CheckCircle2 = mkIcon('check'), AlertCircle = mkIcon('alert'), Clock = mkIcon('clock');

    // FIXED C1: AvatarUpload upload CTA
    function UploadCta({ u, has }: { u: boolean; has: boolean }) {
      return h('label', { 'data-testid': 'rl-upload' },
        u ? h(Loader2) : h(Camera),
        h('span', null, u ? 'Uploading photo...' : has ? 'Change photo' : 'Upload photo'),
        h('input', { type: 'file', hidden: true }));
    }
    // FIXED C2+C3: visibility + remove
    function AvatarActions({ t_, show, r }: { t_: boolean; show: boolean; r: boolean }) {
      return h(React.Fragment, null,
        h('button', { 'data-testid': 'rl-vis' },
          t_ ? h(Loader2) : show ? h(EyeOff) : h(Eye),
          h('span', null, show ? 'Hide photo' : 'Show photo')),
        h('button', { 'data-testid': 'rl-remove' },
          r ? h(Loader2) : h(Trash2),
          h('span', null, 'Remove')));
    }
    // FIXED C4: view CV
    function ViewCv({ o }: { o: boolean }) {
      return h('button', { 'data-testid': 'rl-viewcv' },
        o ? h(Loader2) : h(Download),
        h('span', null, 'View CV'));
    }
    // Pre-hardened: save-status badge (a72f225) + Profile submit (PR #101) +
    // availability save + phone OTP buttons (fragments with <span>).
    function Badge({ st }: { st: string }) {
      if (st === 'idle') return null;
      return h('div', { 'data-testid': 'rl-badge' },
        st === 'saving' ? h(Loader2) : null,
        st === 'saved' ? h(CheckCircle2) : null,
        st === 'error' ? h(AlertCircle) : null,
        h('span', null, st === 'saving' ? 'Saving...' : st === 'saved' ? 'Saved' : 'Save error'));
    }
    function Submit({ s }: { s: boolean }) {
      return h('button', { 'data-testid': 'rl-submit', type: 'submit' },
        h('span', null, s ? 'Saving...' : 'Save profile'));
    }
    function OtpBtn({ sending, cooldown }: { sending: boolean; cooldown: number }) {
      return h('button', { 'data-testid': 'rl-otp' },
        sending
          ? h(React.Fragment, null, h(Loader2), h('span', null, 'Sending...'))
          : cooldown > 0
            ? h(React.Fragment, null, h(Clock), h('span', null, `Resend in ${cooldown}s`))
            : h('span', null, 'Send code'));
    }

    const S: any = {};
    function App() {
      const [up, setUp] = React.useState(false);
      const [tv, setTv] = React.useState(false);
      const [show, setShow] = React.useState(true);
      const [rm, setRm] = React.useState(false);
      const [oc, setOc] = React.useState(false);
      const [badge, setBadge] = React.useState('idle');
      const [saving, setSaving] = React.useState(false);
      const [sending, setSending] = React.useState(false);
      const [cool, setCool] = React.useState(0);
      Object.assign(S, { setUp, setTv, setShow, setRm, setOc, setBadge, setSaving, setSending, setCool });
      return h('div', null,
        h(UploadCta, { u: up, has: true }),
        h(AvatarActions, { t_: tv, show, r: rm }),
        h(ViewCv, { o: oc }),
        h(Badge, { st: badge }),
        h(Submit, { s: saving }),
        h(OtpBtn, { sending, cooldown: cool }));
    }
    (window as any).__S = S;
    ReactDOM.createRoot(document.getElementById('root')!).render(h(App));
  });

  // One translate-grade mutation over the whole tree, then the full real
  // transition set (avatar upload/visibility/remove, CV open, save cycle,
  // OTP send/cooldown).
  const root = await page.locator('#root').elementHandle();
  const wrapped = await page.evaluate(translateSim, root);
  expect(wrapped).toBeGreaterThan(0);

  const seq: Array<[string, any]> = [
    ['setUp', true], ['setUp', false],
    ['setTv', true], ['setTv', false],
    ['setShow', false], ['setShow', true],
    ['setRm', true], ['setRm', false],
    ['setOc', true], ['setOc', false],
    ['setSaving', true], ['setBadge', 'saving'],
    ['setSaving', false], ['setBadge', 'saved'],
    ['setBadge', 'idle'],
    ['setSending', true], ['setSending', false], ['setCool', 42], ['setCool', 0],
  ];
  for (const [fn, v] of seq) {
    await page.evaluate(`window.__S.${fn}(${JSON.stringify(v)})`);
    await page.waitForTimeout(40);
  }

  const crash = errors.filter((e) => /insertBefore|removeChild|NotFoundError/.test(e));
  console.log('[route-level] pageerrors:', JSON.stringify(errors));
  expect(crash, 'route-level /profile composite must stay clean under mutated DOM').toEqual([]);

  // Spot-check operativity after the storm.
  await expect(page.locator('[data-testid="rl-upload"]')).toContainText('Change photo');
  await expect(page.locator('[data-testid="rl-vis"]')).toContainText('Hide photo');
  await expect(page.locator('[data-testid="rl-viewcv"]')).toContainText('View CV');
  await expect(page.locator('[data-testid="rl-submit"]')).toContainText('Save profile');

  await browser.close();
});

// Static guardrail (secondary to the browser reproductions above): the fixed
// nodes keep their stable <span> labels in the real sources.
test('source guardrail: C1-C4 keep stable <span> labels', () => {
  const avatarSrc = readFileSync(join(FRONTEND, 'src', 'components', 'AvatarUpload.tsx'), 'utf-8');
  const cvSrc = readFileSync(join(FRONTEND, 'src', 'components', 'profile', 'CVUploadSection.tsx'), 'utf-8');

  expect(avatarSrc).toContain(
    "<span>{uploading ? t('profile.avatarUploading') : avatarUrl ? t('profile.avatarChange') : t('profile.avatarUpload')}</span>",
  );
  expect(avatarSrc).toContain("<span>{showAvatar ? t('profile.avatarHide') : t('profile.avatarShow')}</span>");
  expect(avatarSrc).toContain('<span>Remove</span>');
  expect(cvSrc).toContain("<span>{t('workerProfile.cv.view')}</span>");
});
