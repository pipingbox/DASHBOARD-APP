import { useEffect, useState } from 'react';
import { BetaNoticePopup } from './BetaNoticePopup';
import { BetaFeedbackModal } from './BetaFeedbackModal';
import { BetaFloatingButton } from './BetaFloatingButton';
import { onOpenBetaFeedback, type FeedbackCategory } from '@/lib/betaFeedback';

export function BetaFeedbackProvider() {
  const [modalOpen, setModalOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>('other');

  const open = (next: FeedbackCategory) => {
    setCategory(next);
    setModalOpen(true);
  };

  useEffect(() => onOpenBetaFeedback(open), []);

  return (
    <>
      <BetaNoticePopup onReportProblem={() => open('other')} />
      <BetaFloatingButton onClick={() => open('other')} />
      <BetaFeedbackModal open={modalOpen} onOpenChange={setModalOpen} initialCategory={category} />
    </>
  );
}
