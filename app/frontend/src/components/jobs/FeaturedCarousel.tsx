import { useRef } from 'react';
import { ChevronLeft, ChevronRight, Zap } from 'lucide-react';
import { FeaturedJobCard } from '@/components/jobs/FeaturedJobCard';
import { STATIC_JOBS, FEATURED_INDICES } from '@/lib/jobs/static-data';
import type { Job } from '@/lib/jobs/types';

interface FeaturedCarouselProps {
  onApply: (job: Job) => void;
  appliedKeys: Set<string>;
  applyingId: string | null;
}

export function FeaturedCarousel({ onApply, appliedKeys, applyingId }: FeaturedCarouselProps) {
  const carouselRef = useRef<HTMLDivElement>(null);

  const scrollCarousel = (dir: 'left' | 'right') => {
    if (!carouselRef.current) return;
    const amount = 360;
    carouselRef.current.scrollBy({
      left: dir === 'left' ? -amount : amount,
      behavior: 'smooth',
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-[#f59e0b]" />
          <h2 className="text-sm font-semibold text-zinc-200">Featured Positions</h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => scrollCarousel('left')}
            className="flex h-7 w-7 items-center justify-center rounded-sm border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => scrollCarousel('right')}
            className="flex h-7 w-7 items-center justify-center rounded-sm border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={carouselRef}
        className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {FEATURED_INDICES.map((idx) => (
          <FeaturedJobCard
            key={idx}
            job={STATIC_JOBS[idx]}
            idx={idx}
            onApply={() => onApply({ ...STATIC_JOBS[idx], id: `static-${idx}`, created_at: '', posted_by: null } as Job)}
            applied={appliedKeys.has(`${STATIC_JOBS[idx].title}|${STATIC_JOBS[idx].company}`)}
            applying={applyingId === `static-${idx}`}
          />
        ))}
      </div>
    </div>
  );
}
