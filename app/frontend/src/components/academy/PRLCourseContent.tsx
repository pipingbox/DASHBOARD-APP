import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Scale,
  AlertTriangle,
  Factory,
  ShieldCheck,
  HeartPulse,
  Users,
  ClipboardList,
  Search,
  Clock,
  Award,
} from 'lucide-react';
import { ACADEMY_CONTENT_LANGUAGES, useSyllabus } from '@/lib/academy/content';
import { getNetPriceCents, formatNetPriceEur, EXCL_VAT_NOTE } from '@/lib/academy/pricing';

/* ─── PRL Course Content (Official Syllabus) ───
 * Based on Ley 31/1995 de Prevención de Riesgos Laborales + RD 39/1997.
 *
 * PRL is training_based (not exam_based like VCA/SCC).
 * PipingBox issues a training certificate on 100% completion.
 * There is no official exam — the training itself is the legal requirement.
 *
 * LEGAL: PipingBox provides PRL training. Legal compliance is verified by
 * the Inspección de Trabajo. PipingBox does not replace the company's
 * insurer or its external prevention service.
 *
 * PRL Básico: 5 modules × 4h = 20h (Ley 31/1995 minimum).
 * PRL Intermedio: 8 modules = 60h (supervisors, technicians).
 *
 * The outline text lives in `lib/academy/content/syllabus-prl-basico.<lang>.json`
 * and `syllabus-prl-intermedio.<lang>.json` (see PB-I18N-LAYER3-001);
 * only the icons stay in the component.
 */

/** Languages the study material is actually available in (English + Layer 3). */
const COURSE_LANGUAGES = ['en', ...ACADEMY_CONTENT_LANGUAGES];

const MODULE_ICONS: Record<string, React.ElementType> = {
  Scale,
  AlertTriangle,
  Factory,
  ShieldCheck,
  HeartPulse,
  ClipboardList,
  Search,
  Users,
};

interface PRLCourseContentProps {
  variant?: 'Básico' | 'Intermedio';
}

export function PRLCourseContent({ variant = 'Básico' }: PRLCourseContentProps) {
  const { t } = useTranslation();
  const [expandedModule, setExpandedModule] = useState<string | null>('m1-conceptos');
  const basicoModules = useSyllabus('prl-basico');
  const intermedioExtraModules = useSyllabus('prl-intermedio');

  const visibleModules = variant === 'Básico'
    ? basicoModules
    : [...basicoModules, ...intermedioExtraModules];

  const totalLessons = visibleModules.reduce((sum, m) => sum + m.lessons.length, 0);
  const totalMinutes = visibleModules.reduce(
    (sum, m) => sum + m.lessons.reduce((s, l) => s + parseInt(l.duration), 0),
    0,
  );
  const totalHours = (totalMinutes / 60).toFixed(1);
  // PB-MARKET-PRICING-001: catalog-driven net price, never a hardcoded literal.
  const productKey = variant === 'Básico' ? 'prl_course_basico' : 'prl_course_intermedio';
  const [price, setPrice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getNetPriceCents(productKey).then((cents) => {
      if (!cancelled && cents != null) setPrice(formatNetPriceEur(cents));
    });
    return () => {
      cancelled = true;
    };
  }, [productKey]);

  return (
    <div className="space-y-6">
      {/* Course header */}
      <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20 rounded-sm">
                PRL 2026
              </span>
              <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-sm">
                {t('academy.courseContent.prl.officialTraining')}
              </span>
              <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-green-500/10 text-green-400 border border-green-500/20 rounded-sm">
                {t('academy.courseContent.prl.hoursBadge', { hours: variant === 'Básico' ? 20 : 60 })}
              </span>
            </div>
            <h2 className="text-lg font-bold text-zinc-100">
              {variant === 'Básico'
                ? t('academy.courseContent.prl.titleBasico')
                : t('academy.courseContent.prl.titleIntermedio')}
            </h2>
            <p className="text-xs text-zinc-500">
              {t('academy.courseContent.prl.meta', {
                lessons: totalLessons,
                hours: totalHours,
                modules: visibleModules.length,
              })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-[#f59e0b]">{price ?? ''}</p>
            <p className="text-[10px] text-zinc-600">
              {price ? `${t('academy.courseContent.oneTimePayment')} · ${EXCL_VAT_NOTE}` : ''}
            </p>
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

        <div className="border-t border-zinc-800 pt-3 space-y-2">
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            <strong className="text-zinc-400">{t('academy.courseContent.legalNoticeLabel')}</strong>{' '}
            {t('academy.courseContent.prl.legalNotice')}
          </p>
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            <strong className="text-zinc-400">{t('academy.courseContent.prl.certificationTypeLabel')}</strong>{' '}
            {t('academy.courseContent.prl.certificationTypeText')}{' '}
            <strong className="text-zinc-300">{t('academy.courseContent.prl.certificationTypeHighlight')}</strong>{' '}
            {t('academy.courseContent.prl.certificationTypeTail')}
          </p>
        </div>
      </div>

      {/* Modules */}
      <div className="space-y-2">
        {visibleModules.map((module) => {
          const Icon = MODULE_ICONS[module.iconKey] ?? ClipboardList;
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

      {/* Training completion certificate teaser */}
      <div className="border border-green-500/30 bg-green-500/5 rounded-sm p-5 text-center space-y-3">
        <Award className="h-8 w-8 text-green-400 mx-auto" />
        <h3 className="text-sm font-semibold text-green-400">
          {t('academy.courseContent.prl.certificateTeaserTitle')}
        </h3>
        <p className="text-xs text-zinc-400 max-w-md mx-auto">
          {t('academy.courseContent.prl.certificateTeaserDescription')}
        </p>
        <div className="flex items-center justify-center gap-2 text-[10px] text-zinc-600">
          <span className="px-2 py-0.5 bg-zinc-800/60 rounded-sm">
            {t('academy.courseContent.prl.badgeCompliance')}
          </span>
          <span className="px-2 py-0.5 bg-zinc-800/60 rounded-sm">
            {t('academy.courseContent.prl.badgeHours', { hours: 20 })}
          </span>
          <span className="px-2 py-0.5 bg-zinc-800/60 rounded-sm">
            {t('academy.courseContent.prl.badgeDownloadable')}
          </span>
        </div>
      </div>
    </div>
  );
}
