import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LessonContent } from '@/lib/academy-types';
import type { VCAQuestion } from '@/lib/academy-types';
import { toSupportedCode } from '@/i18n';
import enLessons from './vca-lessons.en.json';
import enSyllabusVca from './syllabus-vca.en.json';
import enSyllabusScc from './syllabus-scc.en.json';
import enSyllabusPrlBasico from './syllabus-prl-basico.en.json';
import enSyllabusPrlIntermedio from './syllabus-prl-intermedio.en.json';
import enQuestionText from './vca-questions.en.json';
import questionMeta from './vca-questions.meta.json';

/**
 * Academy study material (VCA lessons + exam question bank) per language.
 *
 * English ships in the main bundle and is always the fallback; every other
 * language is a lazy chunk, so adding a language costs nothing on first load.
 * Answer keys live in `vca-questions.meta.json` and are never part of a
 * translation payload — a locale file can only change wording.
 *
 * To add a language: translate the JSON pair with `scripts/academy-content.mjs`
 * and register one loader in each map below.
 */
type LessonMap = Record<string, LessonContent>;
type QuestionTextMap = Record<string, Record<string, string | Record<string, string>>>;

const LESSON_LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  ro: () => import('./vca-lessons.ro.json'),
  uk: () => import('./vca-lessons.uk.json'),
  pl: () => import('./vca-lessons.pl.json'),
  bg: () => import('./vca-lessons.bg.json'),
};

const QUESTION_LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  ro: () => import('./vca-questions.ro.json'),
  uk: () => import('./vca-questions.uk.json'),
  pl: () => import('./vca-questions.pl.json'),
  bg: () => import('./vca-questions.bg.json'),
};

export type SyllabusKey = 'vca' | 'scc' | 'prl-basico' | 'prl-intermedio';

export interface SyllabusLesson {
  title: string;
  duration: string;
  topics: string[];
}

export interface SyllabusModule {
  id: string;
  iconKey: string;
  officialRef: string;
  title: string;
  lessons: SyllabusLesson[];
}

const EN_SYLLABI: Record<SyllabusKey, SyllabusModule[]> = {
  vca: enSyllabusVca as unknown as SyllabusModule[],
  scc: enSyllabusScc as unknown as SyllabusModule[],
  'prl-basico': enSyllabusPrlBasico as unknown as SyllabusModule[],
  'prl-intermedio': enSyllabusPrlIntermedio as unknown as SyllabusModule[],
};

/**
 * Not every language ships every outline: German seeds the SCC course (it is the
 * German/Austrian scheme) and Spanish the PRL courses (Spanish legislation).
 */
const SYLLABUS_LOADERS: Record<string, Partial<Record<SyllabusKey, () => Promise<{ default: unknown }>>>> = {
  es: {
    'prl-basico': () => import('./syllabus-prl-basico.es.json'),
    'prl-intermedio': () => import('./syllabus-prl-intermedio.es.json'),
  },
  de: {
    scc: () => import('./syllabus-scc.de.json'),
  },
  ro: {
    vca: () => import('./syllabus-vca.ro.json'),
    scc: () => import('./syllabus-scc.ro.json'),
    'prl-basico': () => import('./syllabus-prl-basico.ro.json'),
    'prl-intermedio': () => import('./syllabus-prl-intermedio.ro.json'),
  },
  uk: {
    vca: () => import('./syllabus-vca.uk.json'),
    scc: () => import('./syllabus-scc.uk.json'),
    'prl-basico': () => import('./syllabus-prl-basico.uk.json'),
    'prl-intermedio': () => import('./syllabus-prl-intermedio.uk.json'),
  },
  pl: {
    vca: () => import('./syllabus-vca.pl.json'),
    scc: () => import('./syllabus-scc.pl.json'),
    'prl-basico': () => import('./syllabus-prl-basico.pl.json'),
    'prl-intermedio': () => import('./syllabus-prl-intermedio.pl.json'),
  },
  bg: {
    vca: () => import('./syllabus-vca.bg.json'),
    scc: () => import('./syllabus-scc.bg.json'),
    'prl-basico': () => import('./syllabus-prl-basico.bg.json'),
    'prl-intermedio': () => import('./syllabus-prl-intermedio.bg.json'),
  },
};

const syllabusCache = new Map<string, SyllabusModule[]>();

export async function loadSyllabus(key: SyllabusKey, lang: string): Promise<SyllabusModule[]> {
  const cacheKey = `${key}:${lang}`;
  const cached = syllabusCache.get(cacheKey);
  if (cached) return cached;
  const loader = SYLLABUS_LOADERS[lang]?.[key];
  if (!loader) return EN_SYLLABI[key];
  try {
    const mod = await loader();
    const value = (mod.default ?? mod) as unknown as SyllabusModule[];
    syllabusCache.set(cacheKey, value);
    return value;
  } catch (err) {
    console.warn(`[academy] falling back to English syllabus "${key}" for "${lang}"`, err);
    return EN_SYLLABI[key];
  }
}

/** Course outline in the active UI language, English until the chunk resolves. */
export function useSyllabus(key: SyllabusKey): SyllabusModule[] {
  const { i18n } = useTranslation();
  const lang = toSupportedCode(i18n.language) ?? 'en';
  const [modules, setModules] = useState<SyllabusModule[]>(
    () => syllabusCache.get(`${key}:${lang}`) ?? EN_SYLLABI[key],
  );

  useEffect(() => {
    let active = true;
    setModules(syllabusCache.get(`${key}:${lang}`) ?? EN_SYLLABI[key]);
    void loadSyllabus(key, lang).then((value) => {
      if (active) setModules(value);
    });
    return () => {
      active = false;
    };
  }, [key, lang]);

  return modules;
}

/** Languages with translated Academy content (others read English). */
export const ACADEMY_CONTENT_LANGUAGES = Object.keys(LESSON_LOADERS);

const EN_LESSONS = enLessons as unknown as LessonMap;
const EN_QUESTION_TEXT = enQuestionText as unknown as QuestionTextMap;

const ITEM_FIELDS = ['options', 'statements', 'items', 'leftItems', 'rightItems'] as const;

/** Merges answer-key metadata with the wording of one language. */
function buildQuestions(text: QuestionTextMap): VCAQuestion[] {
  return (questionMeta as Array<Record<string, unknown>>).map((meta) => {
    const wording = text[meta.id as string] ?? EN_QUESTION_TEXT[meta.id as string] ?? {};
    const merged: Record<string, unknown> = { ...meta };
    for (const [field, value] of Object.entries(wording)) {
      if (typeof value === 'string') {
        merged[field] = value;
        continue;
      }
      if (!ITEM_FIELDS.includes(field as (typeof ITEM_FIELDS)[number])) continue;
      const items = meta[field] as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(items)) continue;
      merged[field] = items.map((item) => ({
        ...item,
        text: value[item.id as string] ?? '',
      }));
    }
    return merged as unknown as VCAQuestion;
  });
}

const EN_QUESTIONS = buildQuestions(EN_QUESTION_TEXT);

const lessonCache = new Map<string, LessonMap>([['en', EN_LESSONS]]);
const questionCache = new Map<string, VCAQuestion[]>([['en', EN_QUESTIONS]]);

export function getVcaLessonsSync(lang = 'en'): LessonMap {
  return lessonCache.get(lang) ?? EN_LESSONS;
}

export function getVcaQuestionsSync(lang = 'en'): VCAQuestion[] {
  return questionCache.get(lang) ?? EN_QUESTIONS;
}

export async function loadVcaLessons(lang: string): Promise<LessonMap> {
  const cached = lessonCache.get(lang);
  if (cached) return cached;
  const loader = LESSON_LOADERS[lang];
  if (!loader) return EN_LESSONS;
  try {
    const mod = await loader();
    const value = (mod.default ?? mod) as unknown as LessonMap;
    lessonCache.set(lang, value);
    return value;
  } catch (err) {
    console.warn(`[academy] falling back to English lessons for "${lang}"`, err);
    return EN_LESSONS;
  }
}

export async function loadVcaQuestions(lang: string): Promise<VCAQuestion[]> {
  const cached = questionCache.get(lang);
  if (cached) return cached;
  const loader = QUESTION_LOADERS[lang];
  if (!loader) return EN_QUESTIONS;
  try {
    const mod = await loader();
    const value = buildQuestions((mod.default ?? mod) as unknown as QuestionTextMap);
    questionCache.set(lang, value);
    return value;
  } catch (err) {
    console.warn(`[academy] falling back to English questions for "${lang}"`, err);
    return EN_QUESTIONS;
  }
}

/**
 * Study material in the active UI language. Starts from the cached/English
 * value so consumers never render an empty state, then swaps in the
 * translation once its chunk resolves.
 */
export function useVcaContent() {
  const { i18n } = useTranslation();
  const lang = toSupportedCode(i18n.language) ?? 'en';
  const [lessons, setLessons] = useState<LessonMap>(() => getVcaLessonsSync(lang));
  const [questions, setQuestions] = useState<VCAQuestion[]>(() => getVcaQuestionsSync(lang));

  useEffect(() => {
    let active = true;
    setLessons(getVcaLessonsSync(lang));
    setQuestions(getVcaQuestionsSync(lang));
    void Promise.all([loadVcaLessons(lang), loadVcaQuestions(lang)]).then(([l, q]) => {
      if (!active) return;
      setLessons(l);
      setQuestions(q);
    });
    return () => {
      active = false;
    };
  }, [lang]);

  return { lessons, questions, lang };
}
