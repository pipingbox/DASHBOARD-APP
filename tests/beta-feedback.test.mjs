import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateFeedback, resolveTranslation, rateLimitExceeded } from '../supabase/functions/submit-beta-feedback/validation.ts';
import { feedbackResult } from '../app/frontend/src/lib/feedbackResult.ts';

const anonymous = { category: 'translation', locale: 'ro-RO', route: '/register', visible_text: 'Nume complet', suggested_text: 'Nume și prenume' };

test('anonymous translation accepts two fields plus automatic context', () => {
  const result = validateFeedback(anonymous);
  assert.equal(result?.locale, 'ro');
  assert.equal(result?.route, '/register');
  assert.equal(result?.visible, 'Nume complet');
});

test('authenticated report never accepts client-supplied identity', () => {
  assert.equal(validateFeedback({ ...anonymous, user_id: 'forged' }), null);
  assert.ok(validateFeedback({ category: 'interface', locale: 'en', route: '/profile', description: 'Broken layout', screenshot_url: 'feedback/00000000-0000-4000-8000-000000000001/image.png' }));
  assert.equal(validateFeedback({ ...anonymous, user_email: 'person@example.com' }), null);
});

test('routes cannot contain search params, PII or external destinations', () => {
  assert.equal(validateFeedback({ ...anonymous, route: '/register?email=person@example.com' }), null);
  assert.equal(validateFeedback({ ...anonymous, route: '//evil.example' }), null);
  assert.equal(validateFeedback({ ...anonymous, route: '/register/../private' }), null);
});

test('unambiguous translation key only; repeated strings retain candidates', () => {
  const en = { auth: { fullName: 'Full name' } };
  assert.deepEqual(resolveTranslation('Nume complet', { auth: { fullName: 'Nume complet' } }, en), { key: 'auth.fullName', candidates: [], canonical: 'Full name' });
  assert.deepEqual(resolveTranslation('Salvare', { one: 'Salvare', two: 'Salvare' }, en), { key: null, candidates: ['one', 'two'], canonical: null });
});

test('rate limit boundary rejects sixth anonymous and twenty-first authenticated report', () => {
  assert.equal(rateLimitExceeded(5, 5), false);
  assert.equal(rateLimitExceeded(6, 5), true);
  assert.equal(rateLimitExceeded(20, 20), false);
  assert.equal(rateLimitExceeded(21, 20), true);
});

test('failed upload never claims image persisted; backend failure never claims success', () => {
  assert.equal(feedbackResult(true, true), 'savedWithoutImage');
  assert.equal(feedbackResult(true, false), 'success');
  assert.equal(feedbackResult(false, true), 'error');
  assert.equal(feedbackResult(false, false), 'error');
});

test('deployed translation indexes match the canonical locale files', () => {
  for (const locale of ['en', 'es', 'nl', 'fr', 'de', 'pt', 'it', 'ro', 'uk', 'pl', 'bg']) {
    const canonical = readFileSync(new URL(`../app/frontend/src/i18n/locales/${locale}.json`, import.meta.url), 'utf8');
    const deployed = readFileSync(new URL(`../supabase/functions/submit-beta-feedback/locales/${locale}.json`, import.meta.url), 'utf8');
    assert.equal(deployed, canonical, `${locale} needs syncing before deployment`);
  }
});

test('images must be linked to an authenticated UUID and supported format', () => {
  assert.equal(validateFeedback({ ...anonymous, screenshot_url: 'feedback/00000000-0000-4000-8000-000000000001/image.heic' }), null);
  assert.equal(validateFeedback({ ...anonymous, screenshot_url: 'https://elsewhere.test/image.png' }), null);
});
