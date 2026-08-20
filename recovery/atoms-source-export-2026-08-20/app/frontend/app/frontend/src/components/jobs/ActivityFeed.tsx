import { useEffect, useState } from 'react';
import { Users, BadgeCheck, X, Zap, Clock } from 'lucide-react';
import { ACTIVITY_FEED } from '@/lib/jobs/static-data';

export function ActivityFeed() {
  const [visibleActivities, setVisibleActivities] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisibleActivities((prev) => (prev < ACTIVITY_FEED.length ? prev + 1 : prev));
    }, 500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
          </div>
          <h2 className="text-sm font-semibold text-zinc-200">Recent Applications</h2>
        </div>
        <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-600">Live</span>
      </div>

      <div className="grid gap-1.5">
        {ACTIVITY_FEED.slice(0, visibleActivities).map((a, i) => (
          <div
            key={i}
            className="flex items-center gap-3 border border-zinc-800/50 bg-[#0d0d0d] rounded-sm px-4 py-2.5 animate-in fade-in slide-in-from-top-1 duration-300 hover:border-zinc-700 transition-colors"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                a.type === 'application'
                  ? 'bg-blue-500/10 text-blue-400'
                  : a.type === 'filled'
                    ? 'bg-green-500/10 text-green-400'
                    : a.type === 'closed'
                      ? 'bg-zinc-700/30 text-zinc-500'
                      : 'bg-[#f59e0b]/10 text-[#f59e0b]'
              }`}
            >
              {a.type === 'application' ? (
                <Users className="h-3 w-3" />
              ) : a.type === 'filled' ? (
                <BadgeCheck className="h-3 w-3" />
              ) : a.type === 'closed' ? (
                <X className="h-3 w-3" />
              ) : (
                <Zap className="h-3 w-3" />
              )}
            </div>
            <p className="flex-1 text-xs text-zinc-400">{a.text}</p>
            <span className="text-[10px] text-zinc-600 whitespace-nowrap flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {a.time}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
