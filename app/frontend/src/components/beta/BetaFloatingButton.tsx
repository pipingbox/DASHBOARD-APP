import { useTranslation } from 'react-i18next';
import { Bug } from 'lucide-react';

interface BetaFloatingButtonProps {
  onClick: () => void;
}

export function BetaFloatingButton({ onClick }: BetaFloatingButtonProps) {
  const { t } = useTranslation();

  return (
    <button
      onClick={onClick}
      className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full border border-amber-500/30 bg-[#0d0d0d]/95 px-4 py-2.5 text-sm font-medium text-amber-500 shadow-lg backdrop-blur transition-all hover:border-amber-500/60 hover:bg-zinc-900 hover:shadow-amber-500/10"
      aria-label={t('betaFeedback.floatingBtn')}
    >
      <Bug className="h-4 w-4" />
      <span className="hidden sm:inline">{t('betaFeedback.floatingBtn')}</span>
    </button>
  );
}
