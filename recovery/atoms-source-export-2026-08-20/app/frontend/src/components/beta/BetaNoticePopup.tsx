import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { isBetaDismissed, dismissBeta } from '@/lib/betaFeedback';

interface BetaNoticePopupProps {
  onReportProblem: () => void;
}

export function BetaNoticePopup({ onReportProblem }: BetaNoticePopupProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isBetaDismissed()) {
      setOpen(true);
    }
  }, []);

  const handleContinue = () => {
    dismissBeta();
    setOpen(false);
  };

  const handleReport = () => {
    dismissBeta();
    setOpen(false);
    onReportProblem();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleContinue(); }}>
      <DialogContent className="sm:max-w-md border-zinc-800 bg-[#0d0d0d]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/10">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            </div>
            <DialogTitle className="text-zinc-100">
              {t('betaFeedback.notice.title')}
            </DialogTitle>
          </div>
          <DialogDescription className="pt-3 text-sm leading-relaxed text-zinc-400">
            {t('betaFeedback.notice.message')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-400">
          <Mail className="h-4 w-4 shrink-0 text-amber-500" />
          <span>support@pipingbox.com</span>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={handleReport}
            className="border-amber-500/30 text-amber-500 hover:bg-amber-500/10 hover:text-amber-400"
          >
            {t('betaFeedback.notice.reportBtn')}
          </Button>
          <Button
            onClick={handleContinue}
            className="bg-amber-500 text-black hover:bg-amber-400"
          >
            {t('betaFeedback.notice.continueBtn')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}