import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../app/frontend/node_modules/esbuild/lib/main.js';

const entry = new URL('../app/frontend/src/lib/academy/content/loadVcaContent.ts', import.meta.url).pathname;
const bundle = await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', write: false });
const { loadVcaContentForLanguage } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

for (const failing of ['questions', 'lessons']) {
  test(`${failing} load failure prevents ready, and a fresh attempt recovers`, async () => {
    const events = [];
    const failure = new Error('chunk unavailable');
    const lessons = () => failing === 'lessons' ? Promise.reject(failure) : Promise.resolve('lecciones ES');
    const questions = () => failing === 'questions' ? Promise.reject(failure) : Promise.resolve('preguntas ES');
    loadVcaContentForLanguage('es', lessons, questions, (l, q) => events.push([l, q]), () => events.push('error'));
    await tick();
    assert.deepEqual(events, ['error']);
    loadVcaContentForLanguage('es', () => Promise.resolve('lecciones ES'), () => Promise.resolve('preguntas ES'),
      (l, q) => events.push([l, q]), () => events.push('error'));
    await tick();
    assert.deepEqual(events, ['error', ['lecciones ES', 'preguntas ES']]);
  });
}

test('ES → PT → ES ignores late responses and preserves the current language', async () => {
  const stale = deferred();
  const events = [];
  const cancelEs = loadVcaContentForLanguage('es', () => stale.promise, () => Promise.resolve('ES questions'),
    (l, q) => events.push([l, q]), () => events.push('ES error'));
  cancelEs();
  const cancelPt = loadVcaContentForLanguage('pt', () => Promise.resolve('PT lessons'), () => Promise.resolve('PT questions'),
    (l, q) => events.push([l, q]), () => events.push('PT error'));
  await tick();
  cancelPt();
  loadVcaContentForLanguage('es', () => Promise.resolve('ES lessons'), () => Promise.resolve('ES questions'),
    (l, q) => events.push([l, q]), () => events.push('ES error'));
  stale.resolve('stale ES lessons');
  await tick();
  assert.deepEqual(events, [['PT lessons', 'PT questions'], ['ES lessons', 'ES questions']]);
});

test('a late error from a previous language cannot replace the current status', async () => {
  const stale = deferred();
  const events = [];
  const cancel = loadVcaContentForLanguage('es', () => stale.promise, () => Promise.resolve('ES questions'),
    () => events.push('ES ready'), () => events.push('ES error'));
  cancel();
  loadVcaContentForLanguage('pt', () => Promise.resolve('PT lessons'), () => Promise.resolve('PT questions'),
    () => events.push('PT ready'), () => events.push('PT error'));
  stale.reject(new Error('stale failure'));
  await tick();
  assert.deepEqual(events, ['PT ready']);
});
