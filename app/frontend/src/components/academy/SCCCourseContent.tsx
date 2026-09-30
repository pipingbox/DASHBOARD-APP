import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Shield,
  AlertTriangle,
  Flame,
  Scale,
  Leaf,
  HeartPulse,
  ClipboardList,
  Users,
  Clock,
} from 'lucide-react';
import { ACADEMY_CONTENT_LANGUAGES, useSyllabus } from '@/lib/academy/content';

/* ─── SCC Course Content (Official Syllabus) ───
 * Based on official SCC Stiftung syllabus (SCC 2026).
 * 7 content domains per MARKET_GERMANY.md §2.5:
 *   1. Occupational safety (~30%)
 *   2. Hazardous substances (~20%)
 *   3. Fire and explosion protection (~15%)
 *   4. Legal basics (~10%)
 *   5. Environmental protection (~10%)
 *   6. First aid (~10%)
 *   7. Organizational aspects (~5%)
 * Doc 017/018 add: Leadership & responsibility (supervisor/self-employed).
 *
 * LEGAL: PipingBox prepares the learner. It does not issue SCC certificates.
 * The SCC certificate is issued by SCC Stiftung / AUVA through recognized
 * exam bodies (TÜV, DEKRA, etc.).
 *
 * The outline text lives in `lib/academy/content/syllabus-scc.<lang>.json`
 * (see PB-I18N-LAYER3-001); only the icons stay in the component.
 */

/** Languages the study material is actually available in (English + Layer 3). */
const COURSE_LANGUAGES = ['en', ...ACADEMY_CONTENT_LANGUAGES];

const MODULE_ICONS: Record<string, React.ElementType> = {
  Shield,
  AlertTriangle,
  Flame,
  Scale,
  Leaf,
  HeartPulse,
  ClipboardList,
  Users,
};

interface SCCCourseContentProps {
  variant?: 'Doc 016' | 'Doc 017' | 'Doc 018';
}

export function SCCCourseContent({ variant = 'Doc 016' }: SCCCourseContentProps) {
  const { t } = useTranslation();
  const [expandedModule, setExpandedModule] = useState<string | null>('m1-arbeitssicherheit');
  const modules = useSyllabus('scc');

  // Doc 016 (operative) sees modules 1-7. Doc 017/018 see modules 1-8.
  const visibleModules = variant === 'Doc 016'
    ? modules.filter((m) => m.id !== 'm8-fuehrung')
    : modules;

  const totalLessons = visibleModules.reduce((sum, m) => sum + m.lessons.length, 0);
  const totalMinutes = visibleModules.reduce(
    (sum, m) => sum + m.lessons.reduce((s, l) => s + parseInt(l.duration), 0),
    0,
  );

  const variantLabel = variant === 'Doc 016'
    ? t('academy.courseContent.scc.variantOperative')
    : variant === 'Doc 017'
      ? t('academy.courseContent.scc.variantSupervisor')
      : t('academy.courseContent.scc.variantSelfEmployed');

  return (
    <div className="space-y-6">
      {/* Course header */}
      <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20 rounded-sm">
                SCC 2026
              </span>
              <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-sm">
                {t('academy.courseContent.officialSyllabus')}
              </span>
              <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-zinc-800/60 text-zinc-400 rounded-sm">
                {variant}
              </span>
            </div>
            <h2 className="text-lg font-bold text-zinc-100">
              {t('academy.courseContent.scc.title')}
            </h2>
            <p className="text-xs text-zinc-500">
              {t('academy.courseContent.meta', {
                lessons: totalLessons,
                minutes: totalMinutes,
                modules: visibleModules.length,
              })}{' '}
              · {variantLabel}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-[#f59e0b]">€59.90</p>
            <p className="text-[10px] text-zinc-600">{t('academy.courseContent.oneTimePayment')}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {COURSE_LANGUAGES.map((lang) => (
            <span key={lang} className="px-2 py-0.5 text-[10px] bg-zinc-800/60 text-zinc-400 rounded-sm">
              {lang.toUpperCase()}
            </span>
          ))}
          <span className="text-[10px] text-zinc-600">{t('academy.courseContent.otherLanguagesInEnglish')}</span>
        </div>

        <div className="border-t border-zinc-800 pt-3">
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            <strong className="text-zinc-400">{t('academy.courseContent.legalNoticeLabel')}</strong>{' '}
            {t('academy.courseContent.scc.legalNotice')}
          </p>
        </div>
      </div>

      {/* Modules */}
      <div className="space-y-2">
        {visibleModules.map((module) => {
          const Icon = MODULE_ICONS[module.iconKey] ?? Shield;
          const isExpanded = expandedModule === module.id;
          return (
            <div
              key={module.id}
              className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm overflow-hidden"
            >
              <button
                onClick={() => setExpandedModule(isExpanded ? null : module.id)}
                className="w-full flex items-center gap-3 p-4 hover:bg-zinc-900/50 transition-colors"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-[#f59e0b]/10 border border-[#f59e0b]/20">
                  <Icon className="h-4 w-4 text-[#f59e0b]" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-zinc-200">{module.title}</p>
                  <p className="text-[10px] text-zinc-500">
                    {t('academy.courseContent.moduleMeta', {
                      lessons: module.lessons.length,
                      minutes: module.lessons.reduce((s, l) => s + parseInt(l.duration), 0),
                    })}{' '}
                    · {module.officialRef}
                  </p>
                </div>
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-zinc-500" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-zinc-500" />
                )}
              </button>

              {isExpanded && (
                <div className="border-t border-zinc-800/60 p-4 space-y-3">
                  {module.lessons.map((lesson, idx) => (
                    <div key={idx} className="flex items-start gap-3 group">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-zinc-700 text-[10px] text-zinc-500">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-zinc-300">{lesson.title}</p>
                          <span className="flex items-center gap-1 text-[10px] text-zinc-600">
                            <Clock className="h-3 w-3" />
                            {lesson.duration}
                          </span>
                        </div>
                        <ul className="space-y-0.5">
                          {lesson.topics.map((topic, ti) => (
                            <li key={ti} className="flex items-start gap-1.5 text-[11px] text-zinc-500">
                              <CheckCircle2 className="h-3 w-3 text-zinc-700 shrink-0 mt-0.5" />
                              {topic}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Exam simulator teaser */}
      <div className="border border-[#f59e0b]/30 bg-[#f59e0b]/5 rounded-sm p-5 text-center space-y-3">
        <BookOpen className="h-8 w-8 text-[#f59e0b] mx-auto" />
        <h3 className="text-sm font-semibold text-zinc-200">
          {t('academy.courseContent.scc.simulatorTitle', { count: 180 })}
        </h3>
        <p className="text-xs text-zinc-400 max-w-md mx-auto">
          {t('academy.courseContent.scc.simulatorDescription')}
        </p>
        <div className="flex items-center justify-center gap-2 text-[10px] text-zinc-600">
          <span className="px-2 py-0.5 bg-zinc-800/60 rounded-sm">
            {t('academy.courseContent.scc.simulatorDoc016', { count: 30 })}
          </span>
          <span className="px-2 py-0.5 bg-zinc-800/60 rounded-sm">
            {t('academy.courseContent.scc.simulatorDoc017018', { count: 40 })}
          </span>
          <span className="px-2 py-0.5 bg-zinc-800/60 rounded-sm">
            {t('academy.courseContent.scc.simulatorInstantScoring')}
          </span>
        </div>
      </div>
    </div>
  );
}
