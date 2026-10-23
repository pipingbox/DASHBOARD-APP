#!/usr/bin/env node
/**
 * PB-I18N-LAYER3-001 — Academy content i18n pipeline.
 *
 * The VCA study material (lessons + exam question bank) used to live inline in
 * TypeScript in English only. This script:
 *
 *   extract           -> writes the English source of truth JSON files
 *   chunks <lang>     -> splits the English JSON into translation work units
 *   assemble <lang>   -> rebuilds the locale JSON from translated chunks
 *   validate <lang>   -> structural parity check against English
 *   validate-vca      -> PB-VCA-I18N-11-001: strict VCA gate — every canonical
 *                        language (i18n/languages.json) must ship its own
 *                        syllabus, lessons and questions, fully translated and
 *                        registered in the lazy loaders. Exit 1 otherwise.
 *                        ACADEMY_CONTENT_DIR / ACADEMY_INDEX_FILE override the
 *                        inputs so the regression test can run on a mutated copy.
 *
 * Structural fields (correctAnswer, moduleId, difficulty, flags, callout type,
 * table shape) are NEVER part of the translatable payload, so a translation can
 * not change the correct answer of an exam question.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'app/frontend/src');
const CONTENT = process.env.ACADEMY_CONTENT_DIR ?? join(SRC, 'lib/academy/content');
const INDEX_FILE = process.env.ACADEMY_INDEX_FILE ?? join(CONTENT, 'index.ts');
const TX = '/workspace/i18n-tx/academy';
const TMP = join(tmpdir(), 'pb-academy-extract');
const SYLLABI = ['vca', 'scc', 'prl-basico', 'prl-intermedio'];
const EXISTING_COURSE_COVERAGE = {
  scc: ['en', 'de', 'ro', 'uk', 'pl', 'bg'],
  'prl-basico': ['en', 'es', 'ro', 'uk', 'pl', 'bg'],
  'prl-intermedio': ['en', 'es', 'ro', 'uk', 'pl', 'bg'],
};

const loadTsData = async () => {
  // The TS sources mix JSON-style and JS-style object literals, so they are
  // transpiled with the bundler already used by the app instead of text-parsed.
  const entry = join(TMP, 'academy-entry.ts');
  mkdirSync(TMP, { recursive: true });
  writeFileSync(
    entry,
    [
      `export { VCA_LESSONS } from ${JSON.stringify(join(SRC, 'lib/vca-lessons.ts'))};`,
      `export { VCA_QUESTIONS } from ${JSON.stringify(join(SRC, 'lib/academy-questions.ts'))};`,
      '',
    ].join('\n'),
  );
  const out = join(TMP, 'academy-entry.mjs');
  execFileSync(
    join(ROOT, 'app/frontend/node_modules/.bin/esbuild'),
    [entry, '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`, '--log-level=error'],
    { stdio: 'inherit' },
  );
  return import(`file://${out}?t=${Date.now()}`);
};

const write = (file, data) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
};

/** Plain string fields of the exam question bank that must be translated. */
const QUESTION_TEXT_FIELDS = ['questionText', 'optionA', 'optionB', 'optionC', 'explanation', 'officialRef', 'moduleName'];

/**
 * Interactive question types keep their answer keys (isCorrect, isTrue,
 * correctPosition, matchesLeftId) in the metadata file and expose only the
 * `text` of each item for translation, addressed by its stable id.
 */
const QUESTION_ITEM_FIELDS = ['options', 'statements', 'items', 'leftItems', 'rightItems'];

async function extract() {
  const { VCA_LESSONS: lessons, VCA_QUESTIONS: questions } = await loadTsData();
  write(join(CONTENT, 'vca-lessons.en.json'), lessons);

  const text = {};
  const meta = [];
  for (const q of questions) {
    const entry = {};
    for (const f of QUESTION_TEXT_FIELDS) if (q[f] !== undefined) entry[f] = q[f];
    const rest = { ...q };
    for (const f of QUESTION_TEXT_FIELDS) delete rest[f];
    for (const f of QUESTION_ITEM_FIELDS) {
      if (!Array.isArray(q[f])) continue;
      entry[f] = {};
      rest[f] = q[f].map((item) => {
        entry[f][item.id] = item.text;
        const { text: _text, ...structural } = item;
        return structural;
      });
    }
    text[q.id] = entry;
    meta.push(rest);
  }
  write(join(CONTENT, 'vca-questions.en.json'), text);
  write(join(CONTENT, 'vca-questions.meta.json'), meta);

  const counts = {
    lessons: Object.keys(lessons).length,
    sections: Object.values(lessons).reduce((a, l) => a + l.sections.length, 0),
    questions: meta.length,
  };
  console.log('extracted', JSON.stringify(counts));
}

const chunkTargets = (lang) => ({
  lessons: join(TX, lang, 'lessons'),
  questions: join(TX, lang, 'questions'),
});

function chunks(lang) {
  const lessons = JSON.parse(readFileSync(join(CONTENT, 'vca-lessons.en.json'), 'utf8'));
  const questions = JSON.parse(readFileSync(join(CONTENT, 'vca-questions.en.json'), 'utf8'));
  const dirs = chunkTargets(lang);

  const lessonIds = Object.keys(lessons);
  const perLessonChunk = Math.ceil(lessonIds.length / 4);
  for (let i = 0; i < 4; i++) {
    const slice = lessonIds.slice(i * perLessonChunk, (i + 1) * perLessonChunk);
    if (!slice.length) continue;
    const part = {};
    for (const id of slice) part[id] = lessons[id];
    write(join(dirs.lessons, `chunk-${String(i + 1).padStart(2, '0')}.json`), part);
  }

  const qIds = Object.keys(questions);
  const perQChunk = Math.ceil(qIds.length / 6);
  for (let i = 0; i < 6; i++) {
    const slice = qIds.slice(i * perQChunk, (i + 1) * perQChunk);
    if (!slice.length) continue;
    const part = {};
    for (const id of slice) part[id] = questions[id];
    write(join(dirs.questions, `chunk-${String(i + 1).padStart(2, '0')}.json`), part);
  }
  console.log(`chunks for ${lang}: lessons in ${dirs.lessons}, questions in ${dirs.questions}`);
}

const readChunks = (dir) => {
  const out = {};
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    Object.assign(out, JSON.parse(readFileSync(join(dir, f), 'utf8')));
  }
  return out;
};

function validateLessons(en, tr, errors, label) {
  for (const [id, lesson] of Object.entries(en)) {
    const t = tr[id];
    if (!t) {
      errors.push(`${label}: missing lesson ${id}`);
      continue;
    }
    if (!Array.isArray(t.sections) || t.sections.length !== lesson.sections.length) {
      errors.push(`${label}: lesson ${id} section count ${t.sections?.length} != ${lesson.sections.length}`);
      continue;
    }
    lesson.sections.forEach((s, i) => {
      const ts = t.sections[i];
      const at = `${label}: lesson ${id} section ${i + 1}`;
      if (!ts.title?.trim()) errors.push(`${at}: empty title`);
      for (const key of ['paragraphs', 'bullets']) {
        if (s[key] && (!Array.isArray(ts[key]) || ts[key].length !== s[key].length)) {
          errors.push(`${at}: ${key} count ${ts[key]?.length} != ${s[key].length}`);
        } else if (s[key]) {
          ts[key].forEach((v, j) => {
            if (typeof v !== 'string' || !v.trim()) errors.push(`${at}: empty ${key}[${j}]`);
          });
        }
        if (!s[key] && ts[key]) errors.push(`${at}: unexpected ${key}`);
      }
      if (s.table) {
        if (!ts.table || !Array.isArray(ts.table.headers) || !Array.isArray(ts.table.rows)
          || ts.table.headers.length !== s.table.headers.length || ts.table.rows.length !== s.table.rows.length) {
          errors.push(`${at}: table shape mismatch`);
        } else {
          s.table.headers.forEach((header, column) => {
            const value = ts.table.headers[column];
            if (typeof value !== 'string' || (header.trim() && !value.trim())) {
              errors.push(`${at}: table header ${column + 1} empty or not a string`);
            }
          });
          s.table.rows.forEach((row, r) => {
            const translated = ts.table.rows[r];
            if (!Array.isArray(translated) || translated.length !== row.length) {
              errors.push(`${at}: table row ${r + 1} width mismatch`);
            } else {
              row.forEach((cell, column) => {
                const value = translated[column];
                if (typeof value !== 'string' || (cell.trim() && !value.trim())) {
                  errors.push(`${at}: table row ${r + 1} cell ${column + 1} empty or not a string`);
                }
              });
            }
          });
        }
      } else if (ts.table) errors.push(`${at}: unexpected table`);
      if (s.callout) {
        if (!ts.callout) errors.push(`${at}: missing callout`);
        else if (ts.callout.type !== s.callout.type) errors.push(`${at}: callout type changed (${ts.callout.type} != ${s.callout.type})`);
        else if (!ts.callout.text?.trim()) errors.push(`${at}: empty callout text`);
      } else if (ts.callout) errors.push(`${at}: unexpected callout`);
    });
  }
  for (const id of Object.keys(tr)) if (!en[id]) errors.push(`${label}: unexpected lesson ${id}`);
}

function validateQuestions(en, tr, errors, label) {
  for (const [id, q] of Object.entries(en)) {
    const t = tr[id];
    if (!t) {
      errors.push(`${label}: missing question ${id}`);
      continue;
    }
    for (const [f, expected] of Object.entries(q)) {
      if (typeof expected === 'string') {
        if (typeof t[f] !== 'string' || !t[f].trim()) errors.push(`${label}: ${id}.${f} empty or not a string`);
        continue;
      }
      // Item maps: same ids, all non-empty strings.
      const got = t[f];
      if (!got || typeof got !== 'object') {
        errors.push(`${label}: ${id}.${f} missing item map`);
        continue;
      }
      for (const itemId of Object.keys(expected)) {
        if (typeof got[itemId] !== 'string' || !got[itemId].trim()) errors.push(`${label}: ${id}.${f}.${itemId} empty`);
      }
      for (const itemId of Object.keys(got)) {
        if (!(itemId in expected)) errors.push(`${label}: ${id}.${f}.${itemId} unexpected item`);
      }
    }
    for (const f of Object.keys(t)) if (!(f in q)) errors.push(`${label}: ${id}.${f} unexpected field`);
  }
  for (const id of Object.keys(tr)) if (!en[id]) errors.push(`${label}: unexpected question ${id}`);
}

function assemble(lang) {
  const dirs = chunkTargets(lang);
  const enLessons = JSON.parse(readFileSync(join(CONTENT, 'vca-lessons.en.json'), 'utf8'));
  const enQuestions = JSON.parse(readFileSync(join(CONTENT, 'vca-questions.en.json'), 'utf8'));
  const errors = [];

  const lessons = readChunks(dirs.lessons);
  const questions = readChunks(dirs.questions);
  validateLessons(enLessons, lessons, errors, 'lessons');
  validateQuestions(enQuestions, questions, errors, 'questions');

  if (errors.length) {
    console.error(`✗ ${errors.length} problem(s) assembling ${lang}`);
    errors.slice(0, 40).forEach((e) => console.error('  -', e));
    process.exit(1);
  }

  // Preserve English key order so diffs stay readable.
  const orderedLessons = {};
  for (const id of Object.keys(enLessons)) orderedLessons[id] = lessons[id];
  const orderedQuestions = {};
  for (const id of Object.keys(enQuestions)) orderedQuestions[id] = questions[id];

  write(join(CONTENT, `vca-lessons.${lang}.json`), orderedLessons);
  write(join(CONTENT, `vca-questions.${lang}.json`), orderedQuestions);
  console.log(`✓ ${lang}: ${Object.keys(orderedLessons).length} lessons, ${Object.keys(orderedQuestions).length} questions`);
}

/**
 * Script guard: Ukrainian must not contain Russian-only letters, and Cyrillic
 * locales must actually use their own alphabet.
 */
const SCRIPT_RULES = {
  uk: { forbidden: /[\u044B\u044A\u044D\u0451\u042B\u042A\u042D\u0401]/, required: /[\u0456\u0457\u0454\u0491]/ },
  bg: { forbidden: /[\u044B\u044D\u0451\u042B\u042D\u0401]/, required: /[\u0430-\u044F]/ },
  ro: { forbidden: null, required: /[\u0103\u00E2\u00EE\u0219\u021B]/ },
  pl: { forbidden: null, required: /[\u0105\u0107\u0119\u0142\u0144\u00F3\u015B\u017A\u017C]/ },
  // Latin-script locales: the "required" probe is a mix of native diacritics and
  // very frequent function words, so an English leftover is caught statistically.
  es: { forbidden: null, required: /[\u00E1\u00E9\u00ED\u00F3\u00FA\u00F1\u00BF\u00A1]|\b(el|la|los|las|de|del|que|con|para|una?)\b/i },
  pt: { forbidden: null, required: /[\u00E3\u00F5\u00E7\u00E1\u00E9\u00ED\u00F3\u00FA\u00E2\u00EA\u00F4]|\b(os|as|de|do|da|dos|das|que|com|para|uma?|n\u00E3o|s\u00E3o)\b/i },
  nl: { forbidden: null, required: /\b(de|het|een|van|en|niet|met|voor|wordt|worden|zijn|bij|op|aan|moet|u)\b/i },
  fr: { forbidden: null, required: /[\u00E9\u00E8\u00EA\u00E0\u00E7\u00F9\u00FB\u00EE\u00F4]|\b(le|la|les|des|du|une?|et|est|pour|dans|sur|avec|ne|pas)\b/i },
  de: { forbidden: null, required: /[\u00E4\u00F6\u00FC\u00DF\u00C4\u00D6\u00DC]|\b(der|die|das|und|nicht|mit|ist|sind|f\u00FCr|bei|auf|von|werden|muss|wird|eine?n?)\b/i },
  it: { forbidden: null, required: /[\u00E0\u00E8\u00E9\u00EC\u00F2\u00F9]|\b(il|lo|la|gli|le|di|del|della|che|con|per|una?|non|sono|\u00E8)\b/i },
};

function checkScript(lang, data, errors, label) {
  const rule = SCRIPT_RULES[lang];
  if (!rule) return;
  const strings = [];
  const walk = (v, path) => {
    if (typeof v === 'string') strings.push([path, v]);
    else if (v && typeof v === 'object') for (const k of Object.keys(v)) walk(v[k], `${path}.${k}`);
  };
  walk(data, label);
  let requiredHits = 0;
  for (const [path, value] of strings) {
    if (rule.forbidden && rule.forbidden.test(value)) {
      errors.push(`${label}: ${path} contains letters foreign to ${lang}: "${value.slice(0, 70)}"`);
    }
    if (rule.required.test(value)) requiredHits++;
  }
  if (strings.length > 20 && requiredHits / strings.length < 0.2) {
    errors.push(`${label}: only ${requiredHits}/${strings.length} strings use ${lang} native characters`);
  }
}

/**
 * A translation must never be able to break an exam: the answer key stored in
 * the metadata has to stay resolvable against the wording of every language.
 */
function checkAnswerKeys(lang, questions, errors) {
  for (const meta of questionMetaCache()) {
    const wording = questions[meta.id];
    if (!wording) continue;
    const at = `${lang} answer key ${meta.id}`;
    if (meta.questionType === 'single_choice') {
      const letters = ['A', 'B', 'C'].filter((l) => wording[`option${l}`]);
      if (!letters.includes(meta.correctAnswer)) {
        errors.push(`${at}: correctAnswer "${meta.correctAnswer}" has no translated option (${letters.join('/') || 'none'})`);
      }
    }
    for (const field of ['options', 'statements', 'items', 'leftItems', 'rightItems']) {
      const items = meta[field];
      if (!Array.isArray(items)) continue;
      const translated = wording[field] ?? {};
      for (const item of items) {
        if (!translated[item.id]?.trim()) errors.push(`${at}: ${field}.${item.id} has no translated text`);
      }
    }
    if (Array.isArray(meta.options) && !meta.options.some((o) => o.isCorrect)) {
      errors.push(`${at}: no option flagged as correct`);
    }
    if (Array.isArray(meta.items)) {
      const positions = meta.items.map((i) => i.correctPosition).sort((a, b) => a - b).join();
      const zeroBased = meta.items.map((_, i) => i).join();
      const oneBased = meta.items.map((_, i) => i + 1).join();
      if (positions !== zeroBased && positions !== oneBased) errors.push(`${at}: correctPosition is not a permutation`);
    }
    if (Array.isArray(meta.rightItems) && Array.isArray(meta.leftItems)) {
      const left = meta.leftItems.map((l) => l.id);
      for (const right of meta.rightItems) {
        if (right.matchesLeftId && !left.includes(right.matchesLeftId)) {
          errors.push(`${at}: matchesLeftId "${right.matchesLeftId}" does not exist`);
        }
      }
    }
  }
}

/** The same module must carry the same translated name in every question. */
function checkModuleNames(lang, questions, errors) {
  const moduleOf = {};
  for (const q of questionMetaCache()) moduleOf[q.id] = q.moduleId;
  const seen = {};
  for (const [id, q] of Object.entries(questions)) {
    if (!q.moduleName) continue;
    const mod = moduleOf[id];
    if (seen[mod] && seen[mod] !== q.moduleName) {
      errors.push(`${lang}: module ${mod} named both "${seen[mod]}" and "${q.moduleName}" (${id})`);
    }
    seen[mod] ??= q.moduleName;
  }
}

let META_CACHE = null;
const questionMetaCache = () => (META_CACHE ??= JSON.parse(readFileSync(join(CONTENT, 'vca-questions.meta.json'), 'utf8')));

function validate(langs) {
  const enLessons = JSON.parse(readFileSync(join(CONTENT, 'vca-lessons.en.json'), 'utf8'));
  const enQuestions = JSON.parse(readFileSync(join(CONTENT, 'vca-questions.en.json'), 'utf8'));
  const errors = [];
  for (const lang of langs) {
    const lp = join(CONTENT, `vca-lessons.${lang}.json`);
    const qp = join(CONTENT, `vca-questions.${lang}.json`);
    for (const key of SYLLABI) {
      const sp = join(CONTENT, `syllabus-${key}.${lang}.json`);
      if (!existsSync(sp)) {
        if (key === 'vca' || EXISTING_COURSE_COVERAGE[key]?.includes(lang)) {
          errors.push(`${lang}: missing syllabus-${key}.${lang}.json`);
        }
        continue;
      }
      const tr = JSON.parse(readFileSync(sp, 'utf8'));
      validateSyllabus(JSON.parse(readFileSync(join(CONTENT, `syllabus-${key}.en.json`), 'utf8')), tr, errors, `${lang} syllabus ${key}`);
      checkScript(lang, tr, errors, `${lang} syllabus ${key}`);
    }
    if (!existsSync(lp) || !existsSync(qp)) {
      // PB-VCA-I18N-11-001: no longer tolerated for canonical languages — see validate-vca.
      errors.push(`${lang}: missing VCA study material (vca-lessons / vca-questions)`);
      continue;
    }
    const lessons = JSON.parse(readFileSync(lp, 'utf8'));
    const questions = JSON.parse(readFileSync(qp, 'utf8'));
    validateLessons(enLessons, lessons, errors, `${lang} lessons`);
    validateQuestions(enQuestions, questions, errors, `${lang} questions`);
    checkScript(lang, lessons, errors, `${lang} lessons`);
    checkScript(lang, questions, errors, `${lang} questions`);
    checkModuleNames(lang, questions, errors);
    checkAnswerKeys(lang, questions, errors);
  }
  if (errors.length) {
    console.error(`✗ ${errors.length} Academy content problem(s)`);
    errors.slice(0, 40).forEach((e) => console.error('  -', e));
    process.exit(1);
  }
  console.log('✓ Academy content is structurally consistent with English.');
}

/** Structural gate for a translated course syllabus. */
function validateSyllabus(en, tr, errors, label) {
  if (!Array.isArray(tr) || tr.length !== en.length) {
    errors.push(`${label}: module count ${tr?.length} != ${en.length}`);
    return;
  }
  en.forEach((mod, i) => {
    const t = tr[i];
    const at = `${label}: module ${i + 1}`;
    if (t.id !== mod.id) errors.push(`${at}: id changed (${t.id} != ${mod.id})`);
    if (t.iconKey !== mod.iconKey) errors.push(`${at}: iconKey changed`);
    if (t.officialRef !== mod.officialRef) errors.push(`${at}: officialRef must stay verbatim`);
    if (mod.weight !== undefined && t.weight !== mod.weight) errors.push(`${at}: weight must stay verbatim`);
    if (mod.hours !== undefined && !t.hours?.trim()) errors.push(`${at}: empty hours`);
    if (!t.title?.trim()) errors.push(`${at}: empty title`);
    if (!Array.isArray(t.lessons) || t.lessons.length !== mod.lessons.length) {
      errors.push(`${at}: lesson count mismatch`);
      return;
    }
    mod.lessons.forEach((lesson, j) => {
      const tl = t.lessons[j];
      const la = `${at} lesson ${j + 1}`;
      if (!tl.title?.trim()) errors.push(`${la}: empty title`);
      if (tl.duration !== lesson.duration) errors.push(`${la}: duration must stay verbatim (${tl.duration} != ${lesson.duration})`);
      if (!Array.isArray(tl.topics) || tl.topics.length !== lesson.topics.length) {
        errors.push(`${la}: topic count ${tl.topics?.length} != ${lesson.topics.length}`);
      } else {
        tl.topics.forEach((topic, k) => {
          if (typeof topic !== 'string' || !topic.trim()) errors.push(`${la}: empty topic ${k + 1}`);
        });
      }
    });
  });
}

/** Strings equal to the English source that are long enough to be sentences. */
function findUntranslated(en, tr, label) {
  const hits = [];
  const walk = (a, b, path) => {
    if (typeof a === 'string') {
      // Units, codes, acronyms and short headers may legitimately coincide; a
      // string of more than three words identical to English is an omission.
      if (a === b && a.trim().split(/\s+/).length > 3) hits.push(`${label}: ${path} is untranslated: "${a.slice(0, 60)}"`);
      return;
    }
    if (a && typeof a === 'object' && b && typeof b === 'object') {
      for (const k of Object.keys(a)) walk(a[k], b[k], `${path}.${k}`);
    }
  };
  walk(en, tr, '');
  return hits;
}

/** Languages registered in a `const X_LOADERS = { ... }` map of content/index.ts. */
function loaderLanguages(indexSource, mapName, syllabusKey) {
  const start = indexSource.indexOf(`const ${mapName}`);
  if (start < 0) return null;
  // Skip the type annotation (`Record<..., { default: unknown }>`): the map
  // literal is the first `{` after the assignment.
  const open = indexSource.indexOf('{', indexSource.indexOf('= {', start));
  let depth = 0;
  let end = open;
  for (; end < indexSource.length; end++) {
    if (indexSource[end] === '{') depth++;
    else if (indexSource[end] === '}' && --depth === 0) break;
  }
  const body = indexSource.slice(open, end + 1);
  if (!syllabusKey) {
    return [...body.matchAll(/^\s*([a-z]{2}):\s*\(\)\s*=>\s*import\(['"]\.\/([^'"]+)['"]\)/gm)]
      .map((m) => ({ lang: m[1], file: m[2] }));
  }
  const loaders = [];
  const re = /^\s{2}([a-z]{2}):\s*\{([\s\S]*?)^\s{2}\},?/gm;
  for (const m of body.matchAll(re)) {
    const entry = new RegExp(`^\\s*'?${syllabusKey}'?:\\s*\\(\\)\\s*=>\\s*import\\(['"]\\./([^'"]+)['"]\\)`, 'm').exec(m[2]);
    if (entry) loaders.push({ lang: m[1], file: entry[1] });
  }
  return loaders;
}

/**
 * PB-VCA-I18N-11-001 — strict VCA coverage gate for the canonical language list.
 * Fails when any language relies on the English fallback for VCA material.
 */
function validateVca(langs) {
  const errors = [];
  const required = ['syllabus-vca', 'vca-lessons', 'vca-questions'];
  const read = (name) => JSON.parse(readFileSync(join(CONTENT, `${name}.json`), 'utf8'));
  const en = { syllabus: read('syllabus-vca.en'), lessons: read('vca-lessons.en'), questions: read('vca-questions.en') };
  const indexSource = existsSync(INDEX_FILE) ? readFileSync(INDEX_FILE, 'utf8') : '';
  const registered = {
    lessons: loaderLanguages(indexSource, 'LESSON_LOADERS'),
    questions: loaderLanguages(indexSource, 'QUESTION_LOADERS'),
    syllabus: loaderLanguages(indexSource, 'SYLLABUS_LOADERS', 'vca'),
  };
  for (const [k, v] of Object.entries(registered)) if (!v) errors.push(`index.ts: ${k} loader map not found`);

  const summary = [];
  for (const lang of langs) {
    const missing = required.filter((name) => !existsSync(join(CONTENT, `${name}.${lang}.json`)));
    if (lang !== 'en' && missing.length) {
      errors.push(`${lang}: missing required VCA resource(s): ${missing.map((m) => `${m}.${lang}.json`).join(', ')}`);
      continue;
    }
    if (lang !== 'en') {
      for (const [kind, langsIn] of Object.entries(registered)) {
        if (langsIn && !langsIn.some((loader) => loader.lang === lang)) errors.push(`${lang}: ${kind} file exists but is not registered in index.ts loaders`);
      }
    }
    const syllabus = read(`syllabus-vca.${lang}`);
    const lessons = read(`vca-lessons.${lang}`);
    const questions = read(`vca-questions.${lang}`);
    validateSyllabus(en.syllabus, syllabus, errors, `${lang} syllabus vca`);
    validateLessons(en.lessons, lessons, errors, `${lang} lessons`);
    validateQuestions(en.questions, questions, errors, `${lang} questions`);
    checkModuleNames(lang, questions, errors);
    checkAnswerKeys(lang, questions, errors);
    if (lang !== 'en') {
      checkScript(lang, syllabus, errors, `${lang} syllabus vca`);
      checkScript(lang, lessons, errors, `${lang} lessons`);
      checkScript(lang, questions, errors, `${lang} questions`);
      errors.push(...findUntranslated(en.syllabus, syllabus, `${lang} syllabus vca`));
      errors.push(...findUntranslated(en.lessons, lessons, `${lang} lessons`));
      errors.push(...findUntranslated(en.questions, questions, `${lang} questions`));
    }
    const sections = Object.values(lessons).reduce((n, l) => n + (l.sections?.length ?? 0), 0);
    summary.push(`${lang}: ${syllabus.length} modules / ${Object.keys(lessons).length} lessons / ${sections} sections / ${Object.keys(questions).length} questions`);
  }
  // Resources present on disk for a language outside the canonical list, or
  // registered loaders without a file, are configuration drift.
  for (const kind of ['syllabus-vca', 'vca-lessons', 'vca-questions']) {
    for (const file of readdirSync(CONTENT)) {
      const m = new RegExp(`^${kind}\\.([a-z]{2})\\.json$`).exec(file);
      if (m && !langs.includes(m[1])) errors.push(`${file}: resource for a language outside i18n/languages.json`);
    }
  }
  for (const [kind, langsIn] of Object.entries(registered)) {
    const name = kind === 'syllabus' ? 'syllabus-vca' : `vca-${kind}`;
    for (const { lang, file } of langsIn ?? []) {
      const expected = `${name}.${lang}.json`;
      if (file !== expected) errors.push(`index.ts: ${kind} loader for "${lang}" imports ${file} instead of ${expected}`);
      if (!existsSync(join(CONTENT, expected))) errors.push(`index.ts: ${kind} loader for "${lang}" points to a missing file`);
      if (!langs.includes(lang)) errors.push(`index.ts: ${kind} loader for "${lang}" is not a canonical language`);
    }
  }

  summary.forEach((line) => console.log('  ', line));
  if (errors.length) {
    console.error(`✗ validate-vca: ${errors.length} problem(s) — VCA is not fully localised`);
    errors.slice(0, 60).forEach((e) => console.error('  -', e));
    process.exit(1);
  }
  console.log(`✓ validate-vca: VCA syllabus, lessons and questions are complete and registered for ${langs.length} languages (${langs.join(', ')}).`);
}

/** Per-chunk gate used by translators before assembling a language. */
function verifyChunk(kind, refFile, trFile) {
  const ref = JSON.parse(readFileSync(refFile, 'utf8'));
  const tr = JSON.parse(readFileSync(trFile, 'utf8'));
  const errors = [];
  if (kind === 'lessons') validateLessons(ref, tr, errors, 'lessons');
  else if (kind === 'syllabus') validateSyllabus(ref, tr, errors, 'syllabus');
  else validateQuestions(ref, tr, errors, 'questions');
  const lang = /\/academy\/([a-z]{2})\//.exec(trFile)?.[1];
  if (lang) checkScript(lang, tr, errors, kind);
  const identical = [];
  const walk = (a, b, path) => {
    if (typeof a === 'string') {
      if (a === b && a.trim().split(/\s+/).length > 3) identical.push(path);
      return;
    }
    if (a && typeof a === 'object' && b && typeof b === 'object') {
      for (const k of Object.keys(a)) walk(a[k], b[k], `${path}.${k}`);
    }
  };
  walk(ref, tr, kind);
  console.log(`errors ${errors.length}`);
  errors.slice(0, 30).forEach((e) => console.log('  -', e));
  if (identical.length) {
    console.log(`untranslated (identical to English) ${identical.length}`);
    identical.slice(0, 20).forEach((e) => console.log('  ~', e));
  }
  if (errors.length || identical.length) process.exit(1);
}

const [cmd, arg] = process.argv.slice(2);
const LANGS = JSON.parse(readFileSync(join(SRC, 'i18n/languages.json'), 'utf8')).map((l) => l.code);
if (cmd === 'extract') await extract();
else if (cmd === 'chunks') chunks(arg);
else if (cmd === 'assemble') assemble(arg);
else if (cmd === 'validate') validate(arg ? [arg] : LANGS);
else if (cmd === 'validate-vca') validateVca(LANGS);
else if (cmd === 'verify-chunk') verifyChunk(arg, process.argv[4], process.argv[5]);
else {
  console.error('usage: academy-content.mjs extract | chunks <lang> | assemble <lang> | validate [lang] | validate-vca | verify-chunk <kind> <en> <tr>');
  process.exit(2);
}
