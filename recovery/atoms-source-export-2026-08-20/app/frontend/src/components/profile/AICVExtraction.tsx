import { useTranslation } from 'react-i18next';
import { Sparkles, Upload, FileSearch } from 'lucide-react';

export function AICVExtraction() {
  const { t } = useTranslation();

  return (
    <section className="border border-zinc-800/80 bg-[#0d0d0d] p-6">
      <div>
        <p className="text-[10px] uppercase tracking-[0.3em] text-purple-400">
          {t('workerProfile.aiExtraction.label')}
        </p>
        <h2 className="mt-1 text-xl font-semibold">
          {t('workerProfile.aiExtraction.title')}
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          {t('workerProfile.aiExtraction.description')}
        </p>
      </div>

      <div className="mt-6 border border-dashed border-purple-500/30 bg-purple-500/5 p-6">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-purple-400" />
            <FileSearch className="h-6 w-6 text-purple-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-purple-300">
              {t('workerProfile.aiExtraction.comingSoon')}
            </h3>
            <p className="mt-2 text-xs text-zinc-500 max-w-sm mx-auto">
              {t('workerProfile.aiExtraction.comingSoonDesc')}
            </p>
          </div>
          <div className="mt-2 border border-purple-500/20 bg-purple-500/10 px-4 py-2">
            <p className="text-[11px] text-purple-300">
              {t('workerProfile.aiExtraction.features')}
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2 text-[10px] uppercase tracking-wider text-zinc-500">
            <span className="border border-zinc-800 px-2 py-1 text-center">
              {t('workerProfile.aiExtraction.featureProfile')}
            </span>
            <span className="border border-zinc-800 px-2 py-1 text-center">
              {t('workerProfile.aiExtraction.featureExperience')}
            </span>
            <span className="border border-zinc-800 px-2 py-1 text-center">
              {t('workerProfile.aiExtraction.featureCerts')}
            </span>
            <span className="border border-zinc-800 px-2 py-1 text-center">
              {t('workerProfile.aiExtraction.featureSkills')}
            </span>
            <span className="border border-zinc-800 px-2 py-1 text-center">
              {t('workerProfile.aiExtraction.featureLanguages')}
            </span>
            <span className="border border-zinc-800 px-2 py-1 text-center">
              {t('workerProfile.aiExtraction.featureEducation')}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}