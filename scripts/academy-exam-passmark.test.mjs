import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXAM_CONFIG, examPassPercent, examPassPoints, examPassed } from '../app/frontend/src/lib/academy/examPassMark.ts';

const root = new URL('../app/frontend/src/', import.meta.url);
const languages = JSON.parse(readFileSync(new URL('i18n/languages.json', root), 'utf8')).map(({ code }) => code);
const source = readFileSync(new URL('pages/AcademyExam.tsx', root), 'utf8');

for (const [type, expectedQuestions, expectedPoints] of [['bvca', 40, 2600], ['volvca', 60, 3900]]) {
  test(`${type}: same pass mark in scoring, introduction and results`, () => {
    const config = EXAM_CONFIG[type];
    assert.equal(config.questions, expectedQuestions);
    assert.equal(config.passScore, expectedQuestions * 0.65);
    assert.equal(config.maxPoints, expectedQuestions * 100);
    assert.equal(examPassPercent(type), 65);
    assert.equal(examPassPoints(type), expectedPoints);
    assert.equal(examPassed(type, expectedPoints, config.maxPoints), true);
    assert.equal(examPassed(type, expectedPoints - 1, config.maxPoints), false);
    assert.equal(examPassed(type, 0, 0), false);
  });
}

test('the exam UI reads the same pass-mark helpers for scoring, introduction and result', () => {
  assert.match(source, /const passed = examPassed\(type, totalPoints, maxPoints\)/);
  assert.match(source, /const passPercent = examPassPercent\(type\)/);
  assert.match(source, /academy\.examIntroRule4[^\n]*percent: passPercent/);
  assert.match(source, /academy\.examPassScoreValue[^\n]*percent: passPercent[^\n]*threshold: examPassPoints\(type\)/);
  assert.match(source, /\/ \{passPercent\}%/);
  assert.doesNotMatch(source, /percentage >= 65|maxPoints \* 0\.65/);
});

test('all 11 exam languages interpolate the pass mark instead of embedding a percentage', () => {
  assert.deepEqual(languages, ['en', 'es', 'nl', 'fr', 'de', 'pt', 'it', 'ro', 'uk', 'pl', 'bg']);
  for (const code of languages) {
    const { academy } = JSON.parse(readFileSync(new URL(`i18n/locales/${code}.json`, root), 'utf8'));
    for (const key of ['examIntroRule4', 'examPassScoreValue']) {
      const template = academy[key];
      assert.equal((template.match(/\{\{percent\}\}/g) ?? []).length, 1, `${code}.${key}`);
      assert.doesNotMatch(template, /\b(?:65|70)\s*%/, `${code}.${key}`);
      const rendered = template.replace('{{percent}}', String(examPassPercent('bvca')));
      assert.match(rendered, /65%/, `${code}.${key}`);
    }
    const points = academy.examPassScoreValue.replace('{{percent}}', String(examPassPercent('bvca')))
      .replace('{{threshold}}', String(examPassPoints('bvca')))
      .replace('{{max}}', String(EXAM_CONFIG.bvca.maxPoints));
    assert.match(points, /65% \(2600\/4000 /, code);
  }
});
