export interface LessonContentI18n {
  title?: string;
  description?: string;
  content?: string;
}

export interface LocalizableLesson {
  title: string;
  description?: string | null;
  content?: string | null;
  content_i18n?: Record<string, LessonContentI18n> | null;
}

/**
 * Resolves a DB-backed lesson (title/description/content markdown) to the
 * active UI language, using `content_i18n[lang]` when present and falling
 * back to the base English columns otherwise. Does not mutate the input.
 */
export function localizedLesson<T extends LocalizableLesson>(lang: string, lesson: T): T {
  const translations = lesson.content_i18n;
  if (!translations) return lesson;

  const base = lang.split('-')[0].toLowerCase();
  const tr = translations[base];
  if (!tr) return lesson;

  return {
    ...lesson,
    title: tr.title || lesson.title,
    description: tr.description ?? lesson.description,
    content: tr.content ?? lesson.content,
  };
}
