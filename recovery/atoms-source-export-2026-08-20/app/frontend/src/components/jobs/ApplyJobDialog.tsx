import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { Job } from '@/lib/jobs/types';

interface ApplyJobDialogProps {
  job: Job;
  applied: boolean;
  applying: boolean;
  onApply: () => void;
}

/**
 * Apply button component for job listings.
 * Handles the visual state of the application action.
 * Business logic (Supabase insert, toast) lives in useJobs hook.
 */
export function ApplyJobButton({ applied, applying, onApply }: ApplyJobDialogProps) {
  const { t } = useTranslation();

  return (
    <Button
      onClick={onApply}
      disabled={applied || applying}
      className={`relative shrink-0 font-semibold ${
        applied
          ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-800'
          : 'bg-[#f59e0b] text-black hover:bg-[#d97706]'
      }`}
    >
      {applied ? t('jobs.applied') : applying ? t('jobs.applying') : t('jobs.apply')}
      {!applied && !applying && <ArrowRight className="ml-1.5 h-3.5 w-3.5" />}
    </Button>
  );
}