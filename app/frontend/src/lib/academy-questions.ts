/**
 * English VCA exam question bank. Answer keys live in
 * `academy/content/vca-questions.meta.json` and the wording in
 * `academy/content/vca-questions.<lang>.json`, so translations can never
 * change which answer is correct. Use `useVcaContent()` for localised
 * questions; this export stays for English-only callers and tests.
 */
export { getVcaQuestionsSync as buildEnglishQuestions } from './academy/content';
import { getVcaQuestionsSync } from './academy/content';
import type { VCAQuestion } from './academy-types';

export const VCA_QUESTIONS: VCAQuestion[] = getVcaQuestionsSync('en');
