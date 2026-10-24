import { test, expect, chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * PB-UI-DOM-INSERTBEFORE-RESIDUAL-001 — residual NotFoundError insertBefore
 * under Chrome auto-translate DOM mutation. Causal class: an EXTERNAL DOM
 * mutation (Chrome Translate font-wraps bare text nodes, detaching them from
 * their parent) collides with a later React commit that anchors an
 * insertBefore/removeChild at the detached node.
 *
 * What is proven HERE, in browser, with the exact fiber shapes (React 18.3.1
 * production UMD, local bundles, no network):
 *
 *   [RCA CONFIRMED — CVReview Apply CTA]
 *   PRE-FIX shape `<button>{applying && <i/>}BARE TEXT</button>`: idle→applying
 *   after font-wrap throws NotFoundError insertBefore ("not a child of this
 *   node") — the exact production signature. Historical control below MUST
 *   keep failing (crashing) to prove the reproduction stays auditable; the
 *   AFTER shape (stable <span> label) must stay clean.
 *
 *   [HARDENING ONLY — Profile submit Button]
 *   PRE-FIX shape `<button>{saving ? 'Saving...' : 'Save profile'}</button>`
 *   (single bare conditional text) was exercised under the same mutation with
 *   the full idle→saving→idle cycle AND with the production-like badge
 *   sibling layout: ZERO pageerrors, DOM updated correctly. React 18 updates
 *   a lone text child in place (nodeValue), it never needs insertBefore at a
 *   detached anchor. The <span> added to Profile.tsx is therefore PREVENTIVE
 *   HARDENING (stable structure, consistent with prior hardening), NOT a
 *   demonstrated root cause. This file must keep saying so.
 *
 *   [PRE-EXISTING REGRESSION GUARD — save-status badge]
 *   The badge label was already wrapped in a <span> by
 *   PB-UI-DOM-REMOVECHILD-RESIDUAL-001 (a72f225) before this PR. The badge
 *   test below guards that pre-existing hardening; PR #101 did NOT fix that
 *   node, and nothing here claims a "BEFORE: throws" for it.
 *
 *   [PRODUCTION CORRELATION — /profile event 2026-10-23 16:29 UTC]
 *   Deployed build at event time: 80747eb (deploy-production 2026-10-22
 *   15:01:53Z), which already contained every prior DOM fix (0f151fc,
 *   a72f225). Route attribution is the exact pathname
 *   (observability.normalizeRoute — no prefix grouping), so the confirmed
 *   CVReview RCA (route /profile/cv-review) does NOT explain the /profile
 *   event, and the submit Button is empirically disproven (see above).
 *   Conclusion: /profile root cause UNRESOLVED with current evidence —
 *   tracked as a separate follow-up (scan of /profile subcomponents:
 *   MatchReadyBanner, ProfileCompleteness, WorkExperienceSection, ...).
 *   This PR does NOT claim to fix the /profile event.
 *
 * Out of scope (explicit): /dashboard WorkDay* patterns, CVReview conflict
 * banner (line ~291, theoretical low risk), global DOM refactors, DOM API
 * monkey-patching, global translate="no", observability silencing.
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

async function mountHarness(page: import('@playwright/test').Page) {
  await page.setContent('<!doctype html><html><body><div id="root"></div></body></html>');
  await page.addScriptTag({ content: REACT_UMD });
  await page.addScriptTag({ content: REACT_DOM_UMD });
}

test.describe('PB-UI-DOM-INSERTBEFORE-RESIDUAL-001 — BEFORE historical controls', () => {
  test('HISTORICAL CONTROL CVReview Apply CTA PRE-FIX: reproduces insertBefore NotFoundError', async () => {
    const browser = await launchBrowser();
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`${e.name}: ${e.message}`));
    await mountHarness(page);

    // EXACT pre-fix fiber shape of CVReview.tsx Apply CTA (production build
    // 80747eb): <button>{applying && <Loader2/>}BARE TEXT</button>
    await page.evaluate(() => {
      const React = (window as any).React;
      const ReactDOM = (window as any).ReactDOM;
      const h = React.createElement;
      function ApplyCtaPreFix({ applying }: { applying: boolean }) {
        return h(
          'button',
          { 'data-testid': 'apply-cta-prefix' },
          applying ? h('i', { className: 'spinner' }) : null,
          'Confirm and apply', // bare text sibling — the historical defect
        );
      }
      let setApplying: (b: boolean) => void;
      function App() {
        const [applying, _set] = React.useState(false);
        setApplying = _set;
        return h(ApplyCtaPreFix, { applying });
      }
      (window as any).__setApplying = (b: boolean) => setApplying(b);
      ReactDOM.createRoot(document.getElementById('root')!).render(h(App));
    });

    // 1. render applying=false; 2. external Chrome-Translate-grade mutation
    //    font-wraps (detaches) the bare text; 3. idle→applying mounts the
    //    spinner anchored at the detached text node.
    const root = await page.locator('#root').elementHandle();
    const wrapped = await page.evaluate(translateSim, root);
    expect(wrapped).toBeGreaterThan(0);
    await page.evaluate(() => (window as any).__setApplying(true));
    await page.waitForTimeout(100);

    // 4. The reproduction is the assertion: this historical control MUST
    //    throw the exact production signature. If a future React/browser
    //    change stops reproducing it, this test FAILS and forces a review of
    //    the RCA claim instead of letting it rot into prose.
    const crash = errors.filter((e) => /NotFoundError/.test(e) && /insertBefore/.test(e));
    expect(
      crash.length,
      `CVReview PRE-FIX shape must reproduce the production crash; got: ${JSON.stringify(errors)}`,
    ).toBeGreaterThan(0);
    expect(crash[0]).toContain('not a child of this node');

    await browser.close();
  });

  test('HISTORICAL PROBE Profile submit PRE-FIX: does NOT reproduce (result recorded, fix reclassified as hardening)', async () => {
    const browser = await launchBrowser();
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`${e.name}: ${e.message}`));
    await mountHarness(page);

    // EXACT pre-fix fiber shape of Profile.tsx submit Button (production
    // build 80747eb): <button>{saving ? 'Saving...' : 'Save profile'}</button>
    // — a SINGLE bare conditional text child.
    await page.evaluate(() => {
      const React = (window as any).React;
      const ReactDOM = (window as any).ReactDOM;
      const h = React.createElement;
      function SubmitPreFix({ saving }: { saving: boolean }) {
        return h(
          'button',
          { 'data-testid': 'submit-prefix', type: 'submit' },
          saving ? 'Saving...' : 'Save profile', // bare conditional text swap
        );
      }
      let setSaving: (b: boolean) => void;
      function App() {
        const [saving, _set] = React.useState(false);
        setSaving = _set;
        return h(SubmitPreFix, { saving });
      }
      (window as any).__setSaving = (b: boolean) => setSaving(b);
      ReactDOM.createRoot(document.getElementById('root')!).render(h(App));
    });

    // saving=false → font-wrap → saving=true → saving=false (full cycle).
    const root = await page.locator('#root').elementHandle();
    const wrapped = await page.evaluate(translateSim, root);
    expect(wrapped).toBeGreaterThan(0);
    await page.evaluate(() => (window as any).__setSaving(true));
    await page.waitForTimeout(100);
    await page.evaluate(() => (window as any).__setSaving(false));
    await page.waitForTimeout(100);

    // REAL recorded result (2026-10-24, React 18.3.1 prod UMD, chromium
    // headless): ZERO pageerrors; the label still swapped correctly. React 18
    // updates a lone text child via nodeValue — no insertBefore at a detached
    // anchor is ever required. The pre-fix submit shape is therefore NOT a
    // demonstrated RCA, and this probe pins that negative result so the
    // classification (hardening, not RCA) stays evidence-backed.
    const crash = errors.filter((e) => /insertBefore|removeChild|NotFoundError/.test(e));
    console.log('[submit-prefix probe] pageerrors:', JSON.stringify(errors));
    expect(
      crash,
      `Profile submit PRE-FIX probe: recorded result is NO reproduction; if this now crashes, the hardening→RCA classification must be re-evaluated. Got: ${JSON.stringify(errors)}`,
    ).toEqual([]);
    await expect(page.locator('[data-testid="submit-prefix"]')).toContainText('Save profile');

    await browser.close();
  });
});

test.describe('PB-UI-DOM-INSERTBEFORE-RESIDUAL-001 — AFTER (fixed / hardened shapes)', () => {
  test('CVReview Apply CTA AFTER: stable <span> label, idle↔applying, mutated DOM, zero pageerrors', async () => {
    const browser = await launchBrowser();
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`${e.name}: ${e.message}`));
    await mountHarness(page);

    // Mirrors the FIXED CVReview.tsx Apply CTA:
    //   <button> {applying && <Loader2/>} <span>{t('cvReview.confirmCta')}</span> </button>
    await page.evaluate(() => {
      const React = (window as any).React;
      const ReactDOM = (window as any).ReactDOM;
      const h = React.createElement;
      function ApplyCta({ applying }: { applying: boolean }) {
        return h(
          'button',
          { 'data-testid': 'apply-cta' },
          applying ? h('i', { className: 'spinner' }) : null,
          h('span', null, 'Confirm and apply'),
        );
      }
      let setApplying: (b: boolean) => void;
      function App() {
        const [applying, _set] = React.useState(false);
        setApplying = _set;
        return h(ApplyCta, { applying });
      }
      (window as any).__setApplying = (b: boolean) => setApplying(b);
      ReactDOM.createRoot(document.getElementById('root')!).render(h(App));
    });

    const root = await page.locator('#root').elementHandle();
    const wrapped = await page.evaluate(translateSim, root);
    expect(wrapped).toBeGreaterThan(0);

    // idle → applying inserts the spinner anchored at the stable <span>;
    // applying → idle exercises the removeChild path.
    await page.evaluate(() => (window as any).__setApplying(true));
    await page.waitForTimeout(80);
    await page.evaluate(() => (window as any).__setApplying(false));
    await page.waitForTimeout(80);

    const crash = errors.filter((e) => /insertBefore|removeChild|NotFoundError/.test(e));
    console.log('[apply-cta AFTER] pageerrors:', JSON.stringify(errors));
    expect(
      crash,
      'Apply CTA (fixed) must not throw insertBefore/removeChild under translate-mutated DOM',
    ).toEqual([]);

    // The label <span> survives the mutation and the spinner mounted/unmounted.
    await expect(page.locator('[data-testid="apply-cta"] span')).toHaveCount(1);
    await expect(page.locator('[data-testid="apply-cta"]')).toContainText('Confirm and apply');

    await browser.close();
  });

  test('Profile submit AFTER (hardening): stable <span>, idle↔saving cycle, mutated DOM, zero pageerrors', async () => {
    const browser = await launchBrowser();
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`${e.name}: ${e.message}`));
    await mountHarness(page);

    // Mirrors the HARDENED Profile.tsx submit Button:
    //   <button> <span>{saving ? 'Saving...' : 'Save profile'}</span> </button>
    await page.evaluate(() => {
      const React = (window as any).React;
      const ReactDOM = (window as any).ReactDOM;
      const h = React.createElement;
      function SubmitBtn({ saving }: { saving: boolean }) {
        return h(
          'button',
          { 'data-testid': 'submit-btn', type: 'submit' },
          h('span', null, saving ? 'Saving...' : 'Save profile'),
        );
      }
      let setSaving: (b: boolean) => void;
      function App() {
        const [saving, _set] = React.useState(false);
        setSaving = _set;
        return h(SubmitBtn, { saving });
      }
      (window as any).__setSaving = (b: boolean) => setSaving(b);
      ReactDOM.createRoot(document.getElementById('root')!).render(h(App));
    });

    const root = await page.locator('#root').elementHandle();
    const wrapped = await page.evaluate(translateSim, root);
    expect(wrapped).toBeGreaterThan(0);

    // idle → saving → idle: text swaps inside the stable <span>.
    await page.evaluate(() => (window as any).__setSaving(true));
    await page.waitForTimeout(80);
    await page.evaluate(() => (window as any).__setSaving(false));
    await page.waitForTimeout(80);

    const crash = errors.filter((e) => /insertBefore|removeChild|NotFoundError/.test(e));
    console.log('[submit-btn AFTER] pageerrors:', JSON.stringify(errors));
    expect(
      crash,
      'Profile submit (hardened) must not throw under translate-mutated DOM',
    ).toEqual([]);
    await expect(page.locator('[data-testid="submit-btn"]')).toContainText('Save profile');

    await browser.close();
  });

  test('save-status badge: PRE-EXISTING regression guard (hardened by PB-UI-DOM-REMOVECHILD-RESIDUAL-001, not by this PR)', async () => {
    const browser = await launchBrowser();
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`${e.name}: ${e.message}`));
    await mountHarness(page);

    // Mirrors the CURRENT production save-status subtree (already hardened by
    // a72f225 — label inside a single <span>, three conditional icons):
    //   <div> {saving && <i>} {saved && <i>} {error && <i>} <span>{label}</span> </div>
    // PR #101 did NOT modify this node; this test is a regression guard for
    // the pre-existing hardening. No "BEFORE: throws" claim is made here.
    await page.evaluate(() => {
      const React = (window as any).React;
      const ReactDOM = (window as any).ReactDOM;
      const h = React.createElement;

      function Badge({ status }: { status: string }) {
        return h(
          'div',
          { 'data-testid': 'save-status' },
          status === 'saving' ? h('i', { className: 'icon-saving' }) : null,
          status === 'saved' ? h('i', { className: 'icon-saved' }) : null,
          status === 'error' ? h('i', { className: 'icon-error' }) : null,
          h(
            'span',
            null,
            status === 'saving' ? 'Saving...' : status === 'saved' ? 'Saved' : 'Save error',
          ),
        );
      }

      let setStatus: (s: string) => void;
      function App() {
        const [status, _set] = React.useState('idle');
        setStatus = _set;
        return h(Badge, { status });
      }
      (window as any).__setStatus = (s: string) => setStatus(s);
      ReactDOM.createRoot(document.getElementById('root')!).render(h(App));
    });

    // idle -> saving mounts the badge; translate font-wraps the label text
    // inside the stable <span>; saving -> saved swaps the icons anchored at
    // the surviving <span>.
    await page.evaluate(() => (window as any).__setStatus('saving'));
    await page.waitForTimeout(50);
    const root = await page.locator('#root').elementHandle();
    const wrapped = await page.evaluate(translateSim, root);
    expect(wrapped).toBeGreaterThan(0);
    await page.evaluate(() => (window as any).__setStatus('saved'));
    await page.waitForTimeout(80);

    const crash = errors.filter((e) => /insertBefore|removeChild|NotFoundError/.test(e));
    console.log('[save-status regression guard] pageerrors:', JSON.stringify(errors));
    expect(
      crash,
      'save-status pre-existing hardening must keep holding under translate-mutated DOM',
    ).toEqual([]);

    await browser.close();
  });

  // Static guardrail (secondary to the browser reproductions above, not a
  // substitute): the AFTER structures this PR intentionally preserves must
  // not silently revert in the real sources.
  test('source guardrail: fixed nodes keep their stable <span> labels', () => {
    const profileSrc = readFileSync(join(FRONTEND, 'src', 'pages', 'Profile.tsx'), 'utf-8');
    const cvReviewSrc = readFileSync(join(FRONTEND, 'src', 'pages', 'CVReview.tsx'), 'utf-8');

    // Profile submit Button (hardening): label inside a stable <span>.
    expect(profileSrc).toContain(
      "<span>{saving ? t('common.saving') : t('profile.saveProfile')}</span>",
    );
    expect(profileSrc).not.toMatch(/\{saving \? t\('common\.saving'\) : t\('profile\.saveProfile'\)\}\s*<\/Button>/);

    // CVReview Apply CTA (RCA fix): label inside a stable <span>.
    expect(cvReviewSrc).toContain("<span>{t('cvReview.confirmCta')}</span>");
  });
});
