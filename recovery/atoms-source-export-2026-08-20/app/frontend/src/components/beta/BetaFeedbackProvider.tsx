import { useState } from 'react';
import { BetaNoticePopup } from './BetaNoticePopup';
import { BetaFeedbackModal } from './BetaFeedbackModal';
import { BetaFloatingButton } from './BetaFloatingButton';

export function BetaFeedbackProvider() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <BetaNoticePopup onReportProblem={() => setModalOpen(true)} />
      <BetaFloatingButton onClick={() => setModalOpen(true)} />
      <BetaFeedbackModal open={modalOpen} onOpenChange={setModalOpen} />
    </>
  );
}