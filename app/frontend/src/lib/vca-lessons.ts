/**
 * English VCA lesson content. The text now lives in
 * `lib/academy/content/vca-lessons.en.json` so it can be translated per
 * language and lazy-loaded (see `lib/academy/content`).
 */
import type { LessonContent } from './academy-types';
import lessons from './academy/content/vca-lessons.en.json';

export type { LessonContent, LessonSection } from './academy-types';

export const VCA_LESSONS = lessons as unknown as Record<number, LessonContent>;
