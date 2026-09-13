import type { TFunction } from 'i18next';

/**
 * Catalog courses live in Supabase with English `title`/`description`, while
 * their translations ship as i18n keys (`academy.courses.<key>`) that were
 * authored in Layer 2. This maps a course slug onto that key and falls back to
 * the database text whenever a translation does not exist, so a new course is
 * never hidden or blanked by a missing key.
 *
 * Example: `piping-fundamentals` -> `academy.courses.piping_fundamentals`.
 */
export function courseI18nKey(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const key = slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return key || null;
}

export interface LocalisableCourse {
  slug?: string | null;
  title: string;
  description: string;
}

export function localizedCourse<T extends LocalisableCourse>(t: TFunction, course: T) {
  const key = courseI18nKey(course.slug);
  if (!key) return { title: course.title, description: course.description };
  return {
    title: t(`academy.courses.${key}.title`, { defaultValue: course.title }),
    description: t(`academy.courses.${key}.description`, { defaultValue: course.description }),
  };
}
