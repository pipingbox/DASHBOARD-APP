import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, Calendar } from 'lucide-react';
import { SCCCourseContent } from '@/components/academy/SCCCourseContent';
import { TranslationBetaBanner } from '@/components/beta/TranslationBetaBanner';

/**
 * SCC (Germany / Austria) certification page.
 * Public route — no auth required to view course content.
 * Auth required only to save progress or book an exam.
 *
 * Routes: /certifications/scc and /academy/scc-course
 * Source: CERTIFICATION_PLATFORM_STRATEGY.md Fase 3, DEC-51
 *
 * The page has no local language toggle: the app-wide language selector plus
 * i18n is the single mechanism (PB-I18N-LAYER3-001).
 */
export default function SCCCoursePage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'course' | 'info'>('course');
  const [variant, setVariant] = useState<'Doc 016' | 'Doc 017' | 'Doc 018'>('Doc 016');

  return (
    <div className="space-y-6">
      <TranslationBetaBanner />
      {/* Variant selector — Doc 016 (operative) is the default */}
      <div className="flex items-center gap-2 border-b border-zinc-800/80">
        {(['Doc 016', 'Doc 017', 'Doc 018'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setVariant(v)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-all ${
              variant === v
                ? 'border-[#f59e0b] text-[#f59e0b]'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {v}
            <span className="text-[9px] text-zinc-600">
              {v === 'Doc 016'
                ? t('academy.courseContent.scc.variantOperative')
                : v === 'Doc 017'
                  ? t('academy.courseContent.scc.variantSupervisor')
                  : t('academy.courseContent.scc.variantSelfEmployed')}
            </span>
          </button>
        ))}
      </div>

      {/* Tab selector */}
      <div className="flex items-center gap-2 border-b border-zinc-800/80">
        <button
          onClick={() => setActiveTab('course')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-all ${
            activeTab === 'course'
              ? 'border-[#f59e0b] text-[#f59e0b]'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <BookOpen className="h-4 w-4" />
          {t('academy.coursePage.tabPreparationCourse')}
        </button>
        <button
          onClick={() => setActiveTab('info')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-all ${
            activeTab === 'info'
              ? 'border-[#f59e0b] text-[#f59e0b]'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Calendar className="h-4 w-4" />
          {t('academy.coursePage.scc.tabExamAndBooking')}
        </button>
      </div>

      {activeTab === 'course' ? (
        <SCCCourseContent variant={variant} />
      ) : (
        <SCCExamInfo variant={variant} />
      )}
    </div>
  );
}

function SCCExamInfo({ variant }: { variant: string }) {
  const { t } = useTranslation();
  const isDoc016 = variant === 'Doc 016';
  return (
    <div className="space-y-6">
      <div className="border border-[#f59e0b]/30 bg-[#f59e0b]/5 rounded-sm p-5 space-y-3">
        <h3 className="text-sm font-semibold text-[#f59e0b]">
          {t('academy.coursePage.scc.examInfoTitle')}
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 text-xs">
          <div className="space-y-1">
            <p className="text-zinc-500">{t('academy.coursePage.scc.examBodyLabel')}</p>
            <p className="text-zinc-300">SCC Stiftung / TÜV / DEKRA</p>
          </div>
          <div className="space-y-1">
            <p className="text-zinc-500">{t('academy.coursePage.scc.formatLabel')}</p>
            <p className="text-zinc-300">
              {isDoc016
                ? t('academy.coursePage.scc.formatDoc016')
                : t('academy.coursePage.scc.formatDoc017018')}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-zinc-500">{t('academy.coursePage.scc.passMarkLabel')}</p>
            <p className="text-zinc-300">
              {isDoc016
                ? t('academy.coursePage.scc.passMarkDoc016')
                : t('academy.coursePage.scc.passMarkDoc017018')}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-zinc-500">{t('academy.coursePage.scc.validityLabel')}</p>
            <p className="text-zinc-300">{t('academy.coursePage.scc.validityValue')}</p>
          </div>
          <div className="space-y-1">
            <p className="text-zinc-500">{t('academy.coursePage.scc.examFeeLabel')}</p>
            <p className="text-zinc-300">{t('academy.coursePage.scc.examFeeValue')}</p>
          </div>
          <div className="space-y-1">
            <p className="text-zinc-500">{t('academy.coursePage.scc.managementFeeLabel')}</p>
            <p className="text-[#f59e0b] font-medium">
              {t('academy.coursePage.scc.managementFeeValue')}
            </p>
          </div>
        </div>
      </div>

      <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-5 space-y-3">
        <h4 className="text-xs uppercase tracking-[0.15em] text-zinc-500 font-semibold">
          {t('academy.coursePage.scc.howBookingWorksTitle')}
        </h4>
        <ol className="space-y-2 text-xs text-zinc-400">
          <li className="flex gap-2">
            <span className="text-[#f59e0b] font-bold">1.</span>
            {t('academy.coursePage.scc.bookingStep1')}
          </li>
          <li className="flex gap-2">
            <span className="text-[#f59e0b] font-bold">2.</span>
            {t('academy.coursePage.scc.bookingStep2')}
          </li>
          <li className="flex gap-2">
            <span className="text-[#f59e0b] font-bold">3.</span>
            {t('academy.coursePage.scc.bookingStep3')}
          </li>
          <li className="flex gap-2">
            <span className="text-[#f59e0b] font-bold">4.</span>
            {t('academy.coursePage.scc.bookingStep4')}
          </li>
          <li className="flex gap-2">
            <span className="text-[#f59e0b] font-bold">5.</span>
            {t('academy.coursePage.scc.bookingStep5')}
          </li>
          <li className="flex gap-2">
            <span className="text-[#f59e0b] font-bold">6.</span>
            {t('academy.coursePage.scc.bookingStep6')}
          </li>
        </ol>
        <p className="text-[10px] text-zinc-600 pt-2 border-t border-zinc-800/60">
          {t('academy.coursePage.scc.bookingDisclaimer')}
        </p>
      </div>

      <div className="border border-zinc-800/60 bg-[#0d0d0d] rounded-sm p-4 text-center">
        <p className="text-xs text-zinc-400">{t('academy.coursePage.scc.bookingSoon')}</p>
        <p className="text-[10px] text-zinc-600 mt-1">
          {t('academy.coursePage.scc.bookingSoonPhase')}
        </p>
      </div>
    </div>
  );
}
