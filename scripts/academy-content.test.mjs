#!/usr/bin/env node
/**
 * PB-VCA-I18N-11-001 — regression test for `academy-content.mjs validate-vca`.
 *
 * Copies the real content directory to a temp folder, applies one mutation at a
 * time (missing resource, missing translation, empty text, broken option map,
 * unregistered loader, English text left in a translated file) and asserts the
 * strict VCA gate exits 1 for each of them while the pristine copy passes.
 *
 *   node --test scripts/academy-content.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'scripts/academy-content.mjs');
const CONTENT = join(ROOT, 'app/frontend/src/lib/academy/content');

function withCopy(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'pb-vca-gate-'));
  cpSync(CONTENT, dir, { recursive: true });
  try {
    mutate(dir);
    const res = spawnSync(process.execPath, [SCRIPT, 'validate-vca'], {
      env: { ...process.env, ACADEMY_CONTENT_DIR: dir, ACADEMY_INDEX_FILE: join(dir, 'index.ts') },
      encoding: 'utf8',
    });
    return { status: res.status, out: `${res.stdout}\n${res.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const editJson = (dir, file, fn) => {
  const path = join(dir, file);
  const data = JSON.parse(readFileSync(path, 'utf8'));
  fn(data);
  writeFileSync(path, JSON.stringify(data, null, 2));
};

test('pristine content passes the strict VCA gate', () => {
  const r = withCopy(() => {});
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /✓ validate-vca/);
});

test('fails when a required resource is deleted (pt questions)', () => {
  const r = withCopy((dir) => unlinkSync(join(dir, 'vca-questions.pt.json')));
  assert.equal(r.status, 1);
  assert.match(r.out, /pt: missing required VCA resource\(s\): vca-questions\.pt\.json/);
});

test('fails when a syllabus is deleted (es)', () => {
  const r = withCopy((dir) => unlinkSync(join(dir, 'syllabus-vca.es.json')));
  assert.equal(r.status, 1);
  assert.match(r.out, /es: missing required VCA resource\(s\): syllabus-vca\.es\.json/);
});

test('fails when a lesson translation is removed', () => {
  const r = withCopy((dir) => editJson(dir, 'vca-lessons.es.json', (d) => delete d['14']));
  assert.equal(r.status, 1);
  assert.match(r.out, /es lessons: missing lesson 14/);
});

test('fails when a mandatory text is emptied', () => {
  const r = withCopy((dir) => editJson(dir, 'vca-questions.pt.json', (d) => (d.m1q1.optionB = '   ')));
  assert.equal(r.status, 1);
  assert.match(r.out, /pt questions: m1q1\.optionB empty/);
});

test('fails when an interactive option loses its text', () => {
  const r = withCopy((dir) =>
    editJson(dir, 'vca-questions.fr.json', (d) => {
      const q = Object.values(d).find((x) => x.leftItems);
      delete q.leftItems[Object.keys(q.leftItems)[0]];
    }),
  );
  assert.equal(r.status, 1);
  assert.match(r.out, /leftItems\.[a-z0-9_-]+ (empty|has no translated text)/i);
});

test('fails when a translated paragraph is left in English', () => {
  const r = withCopy((dir) => {
    const en = JSON.parse(readFileSync(join(dir, 'vca-lessons.en.json'), 'utf8'));
    editJson(dir, 'vca-lessons.de.json', (d) => {
      d['1'].sections[0].paragraphs[0] = en['1'].sections[0].paragraphs[0];
    });
  });
  assert.equal(r.status, 1);
  assert.match(r.out, /de lessons: .*is untranslated/);
});

test('fails when a resource exists but is not registered in the loaders', () => {
  const r = withCopy((dir) => {
    const idx = join(dir, 'index.ts');
    writeFileSync(idx, readFileSync(idx, 'utf8').replace(/^\s*it: \(\) => import\('\.\/vca-questions\.it\.json'\),\n/m, ''));
  });
  assert.equal(r.status, 1);
  assert.match(r.out, /it: questions file exists but is not registered in index\.ts loaders/);
});

test('fails when the correct-answer option disappears from a translation', () => {
  const r = withCopy((dir) =>
    editJson(dir, 'vca-questions.nl.json', (d) => {
      const meta = JSON.parse(readFileSync(join(dir, 'vca-questions.meta.json'), 'utf8'));
      const single = meta.find((m) => m.questionType === 'single_choice');
      delete d[single.id][`option${single.correctAnswer}`];
    }),
  );
  assert.equal(r.status, 1);
  assert.match(r.out, /nl (questions|answer key)/);
});
