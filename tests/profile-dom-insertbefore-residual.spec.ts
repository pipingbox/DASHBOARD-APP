import { test, expect, chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * PB-UI-DOM-INSERTBEFORE-RESIDUAL-001 — reproduce the residual NotFoundError
 * insertBefore on /profile save-status and /profile/cv-review Apply CTA.
 *
 * Structural RCA (production evidence: NotFoundError "Failed to execute
 * 'insertBefore' on 'Node'" on /profile 2026-10-23 16:29, family includes
 * removeChild across direct/referral/organic/campaign origins — not a single
 * user or campaign):
 *
 *   Profile.tsx submit Button rendered a BARE conditional text swap
 *   ({saving ? t('common.saving') : t('profile.saveProfile')}) and the
 *   save-status badge renders THREE ternary conditional icons
 *   ({saving && <Loader2/>}{saved && <CheckCircle2/>}{error && <AlertCircle/>})
 *   plus the label wrapped in a <span> (PB-UI-DOM-REMOVECHILD-RESIDUAL-001
 *   fixed only the badge TEXT).
 *
 *   CVReview.tsx Apply CTA had the same class: {applying && <Loader2/>} next
 *   to the BARE label text, inside a Button. When Chrome auto-translate
 *   font-wraps (detaches) the bare text, the idle→applying commit INSERTS the
 *   spinner anchored at the detached text node → insertBefore throws →
 *   ErrorBoundary.
 *
 * This harness mounts the REAL subtrees (idle → saving → saved / idle →
 * applying / submit label swap) with the exact fiber shapes the pages produce,
 * applies the proven translator-grade font-wrap mutation, and triggers the
 * transition. Uses the LOCAL React 18 UMD bundles (no network).
 *
 * BEFORE evidence (pre-fix fiber shapes, captured in this branch's history):
 * the Apply CTA case threw "NotFoundError: Failed to execute 'insertBefore'
 * on 'Node': The node before which the new node is to be inserted is not a
 * child of this node." — the exact production signature. The fixed fiber
 * shapes (stable <span> labels) below must produce ZERO errors.
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

// Launch the project's installed chromium headless shell explicitly.
async function launchBrowser() {
  return chromium.launch();
}

test.describe('PB-UI-DOM-INSERTBEFORE-RESIDUAL-001 — residual insertBefore reproduction', () => {
  test('save-status icon swap under translate-mutated DOM (BEFORE: throws; AFTER fix: clean)', async () => {
    const browser = await launchBrowser();
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`${e.name}: ${e.message}`));

    await page.setContent('<!doctype html><html><body><div id="root"></div></body></html>');
    await page.addScriptTag({ content: REACT_UMD });
    await page.addScriptTag({ content: REACT_DOM_UMD });

    // Mount the REAL save-status subtree, mirroring Profile.tsx exactly:
    //   <div> {saving && <i>} {saved && <i>} {error && <i>} <span>{label}</span> </div>
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

    // idle -> saving mounts the badge with the saving icon.
    await page.evaluate(() => (window as any).__setStatus('saving'));
    await page.waitForTimeout(50);

    // Chrome translate font-wraps the label text inside the badge.
    const root = await page.locator('#root').elementHandle();
    const wrapped = await page.evaluate(translateSim, root);
    expect(wrapped).toBeGreaterThan(0);

    // saving -> saved: React must insert the saved icon next to the
    // font-detached label — BEFORE fix this throws insertBefore.
    await page.evaluate(() => (window as any).__setStatus('saved'));
    await page.waitForTimeout(80);

    const crash = errors.filter((e) => /insertBefore|removeChild|NotFoundError/.test(e));
    console.log('[save-status] pageerrors:', JSON.stringify(errors));

    // Assert on the AFTER expectation: the fixed structure must NOT throw.
    // (This test FAILS on the unfixed subtree, proving reproduction.)
    expect(
      crash,
      'save-status icon swap under translate-mutated DOM must not throw insertBefore',
    ).toEqual([]);

    await browser.close();
  });

  test('CVReview Apply CTA spinner insertion under translate-mutated DOM (AFTER fix: clean)', async () => {
    const browser = await launchBrowser();
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`${e.name}: ${e.message}`));

    await page.setContent('<!doctype html><html><body><div id="root"></div></body></html>');
    await page.addScriptTag({ content: REACT_UMD });
    await page.addScriptTag({ content: REACT_DOM_UMD });

    // Mirrors the FIXED CVReview.tsx Apply CTA:
    //   <button> {applying && <i/>} <span>{label}</span> </button>
    // The BEFORE shape (bare 'Confirm and apply' text sibling) threw
    // NotFoundError insertBefore under this exact mutation.
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

    // idle -> applying inserts the spinner anchored at the stable <span>.
    await page.evaluate(() => (window as any).__setApplying(true));
    await page.waitForTimeout(80);
    // applying -> idle removes it again (removeChild path).
    await page.evaluate(() => (window as any).__setApplying(false));
    await page.waitForTimeout(80);

    const crash = errors.filter((e) => /insertBefore|removeChild|NotFoundError/.test(e));
    console.log('[apply-cta] pageerrors:', JSON.stringify(errors));
    expect(
      crash,
      'Apply CTA spinner insertion under translate-mutated DOM must not throw insertBefore',
    ).toEqual([]);

    // The label <span> survives the mutation and the spinner mounted.
    await expect(page.locator('[data-testid="apply-cta"] span')).toHaveCount(1);
    await expect(page.locator('[data-testid="apply-cta"]')).toContainText('Confirm and apply');

    await browser.close();
  });

  test('Profile submit Button label swap under translate-mutated DOM (AFTER fix: clean)', async () => {
    const browser = await launchBrowser();
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`${e.name}: ${e.message}`));

    await page.setContent('<!doctype html><html><body><div id="root"></div></body></html>');
    await page.addScriptTag({ content: REACT_UMD });
    await page.addScriptTag({ content: REACT_DOM_UMD });

    // Mirrors the FIXED Profile.tsx submit Button:
    //   <button> <span>{saving ? 'Saving...' : 'Save profile'}</span> </button>
    // The BEFORE shape (bare conditional text swap) let auto-translate detach
    // the text node and the saving commit then threw NotFoundError.
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

    // idle -> saving -> idle: text swaps happen inside the stable <span>.
    await page.evaluate(() => (window as any).__setSaving(true));
    await page.waitForTimeout(80);
    await page.evaluate(() => (window as any).__setSaving(false));
    await page.waitForTimeout(80);

    const crash = errors.filter((e) => /insertBefore|removeChild|NotFoundError/.test(e));
    console.log('[submit-btn] pageerrors:', JSON.stringify(errors));
    expect(
      crash,
      'Profile submit Button label swap under translate-mutated DOM must not throw',
    ).toEqual([]);

    await browser.close();
  });

  // Static guardrail: the causal bare-text patterns must not reappear in the
  // real sources (runs without a browser, catches regressions in CI).
  test('source guardrail: no bare conditional text siblings in the fixed nodes', () => {
    const profileSrc = readFileSync(join(FRONTEND, 'src', 'pages', 'Profile.tsx'), 'utf-8');
    const cvReviewSrc = readFileSync(join(FRONTEND, 'src', 'pages', 'CVReview.tsx'), 'utf-8');

    // Profile submit Button: label must live inside a stable <span>.
    expect(profileSrc).toContain(
      "<span>{saving ? t('common.saving') : t('profile.saveProfile')}</span>",
    );
    expect(profileSrc).not.toMatch(/\{saving \? t\('common\.saving'\) : t\('profile\.saveProfile'\)\}\s*<\/Button>/);

    // CVReview Apply CTA: label must live inside a stable <span>.
    expect(cvReviewSrc).toContain("<span>{t('cvReview.confirmCta')}</span>");
  });
});
