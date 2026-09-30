import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, Award, AlertCircle } from 'lucide-react';
import { PRLCourseContent } from '@/components/academy/PRLCourseContent';
import { TranslationBetaBanner } from '@/components/beta/TranslationBetaBanner';

/**
 * PRL (Spain) certification page.
 * Public route — no auth required to view course content.
 * Auth required only to save progress or download certificate.
 *
 * Routes: /certificaciones/prl and /academy/prl-course
 * Source: CERTIFICATION_PLATFORM_STRATEGY.md Fase 4, DEC-51
 *
 * PRL is training_based (no exam). PipingBox issues a training-completion
 * certificate when 100% complete. This is different from VCA/SCC (exam_based).
 *
 * The page has no local language toggle: the app-wide language selector plus
 * i18n is the single mechanism (PB-I18N-LAYER3-001).
 */
export default function PRLCoursePage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'course' | 'info'>('course');
  const [variant, setVariant] = useState<'Básico' | 'Intermedio'>('Básico');

  return (
    <div className="space-y-6">
      <TranslationBetaBanner />
      {/* Variant selector */}
      <div className="flex items-center gap-2 border-b border-zinc-800/80">
        {(['Básico', 'Intermedio'] as const).map((v) => (
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
              {v === 'Básico'
                ? t('academy.coursePage.prl.variantBasicoMeta')
                : t('academy.coursePage.prl.variantIntermedioMeta')}
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
          {t('academy.coursePage.prl.tabTrainingCourse')}
        </button>
        <button
          onClick={() => setActiveTab('info')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-all ${
            activeTab === 'info'
              ? 'border-[#f59e0b] text-[#f59e0b]'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Award className="h-4 w-4" />
          {t('academy.coursePage.prl.tabCertificateAndLegality')}
        </button>
      </div>

      {activeTab === 'course' ? (
        <PRLCourseContent variant={variant} />
      ) : (
        <PRLInfoTab />
      )}
    </div>
  );
}

function PRLInfoTab() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      {/* Key difference: training_based vs exam_based */}
      <div className="border border-green-500/30 bg-green-500/5 rounded-sm p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Award className="h-5 w-5 text-green-400" />
          <h3 className="text-sm font-semibold text-green-400">
            {t('academy.coursePage.prl.trainingNotExamTitle')}
          </h3>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">
          {t('academy.coursePage.prl.trainingNotExamP1Before')}{' '}
          <strong className="text-zinc-300">
            {t('academy.coursePage.prl.trainingNotExamP1Strong')}
          </strong>
          {t('academy.coursePage.prl.trainingNotExamP1After')}
        </p>
        <p className="text-xs text-zinc-400 leading-relaxed">
          {t('academy.coursePage.prl.trainingNotExamP2Before')}{' '}
          <strong className="text-zinc-300">
            {t('academy.coursePage.prl.trainingNotExamP2Strong')}
          </strong>{' '}
          {t('academy.coursePage.prl.trainingNotExamP2After')}
        </p>
      </div>

      {/* Legal framework */}
      <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-5 space-y-3">
        <h4 className="text-xs uppercase tracking-[0.15em] text-zinc-500 font-semibold">
          {t('academy.coursePage.prl.legalFrameworkTitle')}
        </h4>
        <div className="grid gap-4 sm:grid-cols-2 text-xs">
          <div className="space-y-1">
            <p className="text-zinc-500">{t('academy.coursePage.prl.mainLawLabel')}</p>
            <p className="text-zinc-300">{t('academy.coursePage.prl.mainLawValue')}</p>
          </div>
          <div className="space-y-1">
            <p className="text-zinc-500">{t('academy.coursePage.prl.regulationLabel')}</p>
            <p className="text-zinc-300">{t('academy.coursePage.prl.regulationValue')}</p>
          </div>
          <div className="space-y-1">
            <p className="text-zinc-500">{t('academy.coursePage.prl.bodyLabel')}</p>
            <p className="text-zinc-300">{t('academy.coursePage.prl.bodyValue')}</p>
          </div>
          <div className="space-y-1">
            <p className="text-zinc-500">{t('academy.coursePage.prl.verificationLabel')}</p>
            <p className="text-zinc-300">{t('academy.coursePage.prl.verificationValue')}</p>
          </div>
          <div className="space-y-1">
            <p className="text-zinc-500">{t('academy.coursePage.prl.minDurationBasicoLabel')}</p>
            <p className="text-zinc-300">{t('academy.coursePage.prl.minDurationBasicoValue')}</p>
          </div>
          <div className="space-y-1">
            <p className="text-zinc-500">{t('academy.coursePage.prl.durationIntermedioLabel')}</p>
            <p className="text-zinc-300">{t('academy.coursePage.prl.durationIntermedioValue')}</p>
          </div>
        </div>
      </div>

      {/* Comparison with VCA/SCC */}
      <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-5 space-y-3">
        <h4 className="text-xs uppercase tracking-[0.15em] text-zinc-500 font-semibold">
          {t('academy.coursePage.prl.comparisonTitle')}
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="text-left py-2 pr-4 font-medium">
                  {t('academy.coursePage.prl.comparisonDimension')}
                </th>
                <th className="text-left py-2 pr-4 font-medium">
                  {t('academy.coursePage.prl.comparisonPrlColumn')}
                </th>
                <th className="text-left py-2 pr-4 font-medium">
                  {t('academy.coursePage.prl.comparisonVcaColumn')}
                </th>
                <th className="text-left py-2 font-medium">
                  {t('academy.coursePage.prl.comparisonSccColumn')}
                </th>
              </tr>
            </thead>
            <tbody className="text-zinc-400">
              <tr className="border-b border-zinc-800/60">
                <td className="py-2 pr-4 text-zinc-500">
                  {t('academy.coursePage.prl.comparisonTypeRow')}
                </td>
                <td className="py-2 pr-4 text-green-400">
                  {t('academy.coursePage.prl.comparisonTypePrl')}
                </td>
                <td className="py-2 pr-4">{t('academy.coursePage.prl.comparisonTypeVca')}</td>
                <td className="py-2">{t('academy.coursePage.prl.comparisonTypeScc')}</td>
              </tr>
              <tr className="border-b border-zinc-800/60">
                <td className="py-2 pr-4 text-zinc-500">
                  {t('academy.coursePage.prl.comparisonOfficialExamRow')}
                </td>
                <td className="py-2 pr-4">
                  {t('academy.coursePage.prl.comparisonOfficialExamPrl')}
                </td>
                <td className="py-2 pr-4">
                  {t('academy.coursePage.prl.comparisonOfficialExamVca')}
                </td>
                <td className="py-2">{t('academy.coursePage.prl.comparisonOfficialExamScc')}</td>
              </tr>
              <tr className="border-b border-zinc-800/60">
                <td className="py-2 pr-4 text-zinc-500">
                  {t('academy.coursePage.prl.comparisonIssuerRow')}
                </td>
                <td className="py-2 pr-4">{t('academy.coursePage.prl.comparisonIssuerPrl')}</td>
                <td className="py-2 pr-4">{t('academy.coursePage.prl.comparisonIssuerVca')}</td>
                <td className="py-2">{t('academy.coursePage.prl.comparisonIssuerScc')}</td>
              </tr>
              <tr className="border-b border-zinc-800/60">
                <td className="py-2 pr-4 text-zinc-500">
                  {t('academy.coursePage.prl.comparisonValidityRow')}
                </td>
                <td className="py-2 pr-4">{t('academy.coursePage.prl.comparisonValidityPrl')}</td>
                <td className="py-2 pr-4">{t('academy.coursePage.prl.comparisonValidityVca')}</td>
                <td className="py-2">{t('academy.coursePage.prl.comparisonValidityScc')}</td>
              </tr>
              <tr className="border-b border-zinc-800/60">
                <td className="py-2 pr-4 text-zinc-500">
                  {t('academy.coursePage.prl.comparisonPriceRow')}
                </td>
                <td className="py-2 pr-4 text-[#f59e0b]">€29.90</td>
                <td className="py-2 pr-4 text-[#f59e0b]">€59.90</td>
                <td className="py-2 text-[#f59e0b]">€59.90</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 text-zinc-500">
                  {t('academy.coursePage.prl.comparisonMarketRow')}
                </td>
                <td className="py-2 pr-4">{t('academy.coursePage.prl.comparisonMarketPrl')}</td>
                <td className="py-2 pr-4">{t('academy.coursePage.prl.comparisonMarketVca')}</td>
                <td className="py-2">{t('academy.coursePage.prl.comparisonMarketScc')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* What PipingBox is NOT */}
      <div className="border border-[#f59e0b]/30 bg-[#f59e0b]/5 rounded-sm p-5 space-y-2">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-[#f59e0b] shrink-0 mt-0.5" />
          <div className="space-y-2 text-xs text-zinc-400">
            <p>
              <strong className="text-zinc-300">
                {t('academy.coursePage.prl.notReplaceTitle')}
              </strong>
            </p>
            <ul className="space-y-1 pl-4">
              <li>• {t('academy.coursePage.prl.notReplaceItem1')}</li>
              <li>• {t('academy.coursePage.prl.notReplaceItem2')}</li>
              <li>• {t('academy.coursePage.prl.notReplaceItem3')}</li>
              <li>• {t('academy.coursePage.prl.notReplaceItem4')}</li>
            </ul>
            <p className="pt-2">
              <strong className="text-zinc-300">
                {t('academy.coursePage.prl.doesComplyStrong')}
              </strong>{' '}
              {t('academy.coursePage.prl.doesComplyText')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
