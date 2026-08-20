import { Brain, CheckCircle2, AlertTriangle, Users } from 'lucide-react';
import type { AIMatchResult } from '@/lib/workforce-pipeline';

interface AIMatchingPreviewProps {
  match: AIMatchResult;
  compact?: boolean;
}

export function AIMatchingPreview({ match, compact = false }: AIMatchingPreviewProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Brain className="h-3 w-3 text-violet-400" />
        <span className="text-[10px] text-violet-300">{match.totalMatching} matches</span>
        <span className="text-[10px] text-emerald-400">{match.readyWorkers} ready</span>
      </div>
    );
  }

  return (
    <div className="border border-violet-500/20 bg-violet-500/5 rounded-sm p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/10 border border-violet-500/30">
          <Brain className="h-3 w-3 text-violet-400" />
        </div>
        <p className="text-[10px] uppercase tracking-[0.15em] text-violet-400 font-semibold">AI Matching Preview</p>
        <span className="ml-auto text-[8px] uppercase tracking-wider text-zinc-600 border border-zinc-700 px-1.5 py-0.5 rounded">Demo</span>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5 text-zinc-400" />
          <span className="text-xs text-zinc-300">
            <strong className="text-violet-300">{match.totalMatching}</strong> matching workers found
          </span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-xs text-zinc-300">
            <strong className="text-emerald-400">{match.readyWorkers}</strong> workers ready with valid certificates
          </span>
        </div>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
          <span className="text-xs text-zinc-300">
            <strong className="text-amber-400">{match.missingCerts}</strong> missing {match.missingCertName} certificate
          </span>
        </div>
      </div>
    </div>
  );
}