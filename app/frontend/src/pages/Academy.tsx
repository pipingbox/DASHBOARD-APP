import { GraduationCap, Clock, BookOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';

type Level = 'Beginner' | 'Intermediate' | 'Advanced';

const TRACKS: Array<{
  title: string;
  level: Level;
  lessons: number;
  hours: string;
  description: string;
}> = [
  {
    title: 'Piping Fundamentals',
    level: 'Beginner',
    lessons: 24,
    hours: '8h',
    description: 'Pipe classes, fittings, supports, and basic isometric reading.',
  },
  {
    title: 'Stress Analysis with CAESAR II',
    level: 'Intermediate',
    lessons: 38,
    hours: '16h',
    description: 'Model, load cases, allowable stresses, and reporting.',
  },
  {
    title: 'Process Piping per ASME B31.3',
    level: 'Advanced',
    lessons: 42,
    hours: '20h',
    description: 'Design, fabrication, examination, and testing workflows.',
  },
  {
    title: 'Isometric & GA Drawings',
    level: 'Beginner',
    lessons: 18,
    hours: '6h',
    description: 'Industry standards, annotations, BOM, and revision control.',
  },
  {
    title: 'Material Selection',
    level: 'Intermediate',
    lessons: 20,
    hours: '7h',
    description: 'Corrosion, service, and ASME material grade trade-offs.',
  },
  {
    title: 'Pipe Support Engineering',
    level: 'Intermediate',
    lessons: 26,
    hours: '10h',
    description: 'Span tables, spring hangers, and constant-effort design.',
  },
];

const LEVEL_STYLES: Record<Level, string> = {
  Beginner: 'text-emerald-400 border-emerald-400/40',
  Intermediate: 'text-[#f59e0b] border-[#f59e0b]/40',
  Advanced: 'text-rose-400 border-rose-400/40',
};

const LEVEL_KEYS: Record<Level, string> = {
  Beginner: 'academy.levelBeginner',
  Intermediate: 'academy.levelIntermediate',
  Advanced: 'academy.levelAdvanced',
};

export default function Academy() {
  const { t } = useTranslation();
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t('academy.eyebrow')}
        title={t('academy.title')}
        description={t('academy.description')}
      />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {TRACKS.map((track) => (
          <div
            key={track.title}
            className="group flex flex-col border border-zinc-800/80 bg-[#0d0d0d] p-6 hover:border-[#f59e0b] transition"
          >
            <div className="flex items-start justify-between">
              <GraduationCap className="h-6 w-6 text-[#f59e0b]" />
              <span
                className={`px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] border ${LEVEL_STYLES[track.level]}`}
              >
                {t(LEVEL_KEYS[track.level])}
              </span>
            </div>
            <h3 className="mt-4 text-lg font-semibold">{track.title}</h3>
            <p className="mt-1 text-sm text-zinc-400 flex-1">{track.description}</p>
            <div className="mt-4 flex items-center gap-4 text-xs text-zinc-500">
              <span className="flex items-center gap-1">
                <BookOpen className="h-3.5 w-3.5" />{' '}
                {t('academy.lessons', { count: track.lessons })}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> {track.hours}
              </span>
            </div>
            <Button
              variant="outline"
              className="mt-4 border-zinc-800 bg-transparent hover:bg-[#f59e0b] hover:text-black hover:border-[#f59e0b]"
            >
              {t('academy.startTrack')}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}