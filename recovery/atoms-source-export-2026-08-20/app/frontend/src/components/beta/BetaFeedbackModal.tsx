import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, Paperclip, X, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import {
  FEEDBACK_CATEGORIES,
  FeedbackCategory,
  collectTechnicalData,
  uploadScreenshot,
  submitFeedbackReport,
} from '@/lib/betaFeedback';

interface BetaFeedbackModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BetaFeedbackModal({ open, onOpenChange }: BetaFeedbackModalProps) {
  const { t } = useTranslation();
  const { user, profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [category, setCategory] = useState<FeedbackCategory>('other');
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setScreenshot(file);
      const reader = new FileReader();
      reader.onload = () => setScreenshotPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const removeScreenshot = () => {
    setScreenshot(null);
    setScreenshotPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async () => {
    if (!description.trim()) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const techData = collectTechnicalData();
      let screenshotUrl: string | undefined;

      if (screenshot) {
        const url = await uploadScreenshot(screenshot, user?.id);
        if (url) screenshotUrl = url;
        // If screenshot upload fails, continue without it
      }

      const result = await submitFeedbackReport({
        user_id: user?.id,
        user_email: user?.email || profile?.email,
        category,
        description: description.trim(),
        screenshot_url: screenshotUrl,
        ...techData,
      });

      if (result.success) {
        setSubmitted(true);
        setTimeout(() => {
          resetForm();
          onOpenChange(false);
        }, 2500);
      } else {
        console.error('[BETA_FEEDBACK] Submission failed:', result.error);
        // Show error state but don't close modal so user can retry
        setSubmitError(result.error || t('betaFeedback.modal.submitError'));
      }
    } catch (err) {
      console.error('[BETA_FEEDBACK] Unexpected error:', err);
      setSubmitError(t('betaFeedback.modal.submitError'));
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setCategory('other');
    setDescription('');
    setScreenshot(null);
    setScreenshotPreview(null);
    setSubmitted(false);
    setSubmitError(null);
  };

  const handleClose = (v: boolean) => {
    if (!v) resetForm();
    onOpenChange(v);
  };

  if (submitted) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md border-zinc-800 bg-[#0d0d0d]">
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            {/* Animated success ring + icon */}
            <div className="relative flex h-16 w-16 items-center justify-center">
              {/* Expanding ring */}
              <span className="absolute inset-0 animate-[feedbackRing_0.6s_ease-out_forwards] rounded-full border-2 border-amber-500/60" />
              {/* Icon container with scale-in */}
              <span className="flex h-14 w-14 animate-[feedbackPop_0.4s_cubic-bezier(0.34,1.56,0.64,1)_0.15s_both] items-center justify-center rounded-full bg-amber-500/15">
                <CheckCircle2 className="h-8 w-8 text-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.4)]" />
              </span>
            </div>
            {/* Success text with fade-in */}
            <p className="animate-[feedbackFadeUp_0.4s_ease-out_0.35s_both] text-sm font-medium text-zinc-200">
              {t('betaFeedback.modal.successMessage')}
            </p>
            <p className="animate-[feedbackFadeUp_0.4s_ease-out_0.5s_both] text-xs text-zinc-500">
              {t('betaFeedback.modal.successSubtext', 'Gracias por ayudarnos a mejorar.')}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg border-zinc-800 bg-[#0d0d0d]">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">
            {t('betaFeedback.modal.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Category */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-300">
              {t('betaFeedback.modal.categoryLabel')}
            </label>
            <Select value={category} onValueChange={(v) => setCategory(v as FeedbackCategory)}>
              <SelectTrigger className="border-zinc-800 bg-zinc-900 text-zinc-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-zinc-800 bg-zinc-900">
                {FEEDBACK_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat} className="text-zinc-200">
                    {t(`betaFeedback.categories.${cat}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-300">
              {t('betaFeedback.modal.descriptionLabel')}
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('betaFeedback.modal.descriptionPlaceholder')}
              className="min-h-[100px] resize-none border-zinc-800 bg-zinc-900 text-zinc-200 placeholder:text-zinc-600"
            />
          </div>

          {/* Screenshot */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-300">
              {t('betaFeedback.modal.screenshotLabel')}
            </label>
            {screenshotPreview ? (
              <div className="relative inline-block">
                <img
                  src={screenshotPreview}
                  alt="Screenshot preview"
                  className="h-24 rounded-md border border-zinc-800 object-cover"
                />
                <button
                  onClick={removeScreenshot}
                  className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="border-zinc-700 text-zinc-400 hover:text-zinc-200"
              >
                <Paperclip className="mr-2 h-4 w-4" />
                {t('betaFeedback.modal.attachBtn')}
              </Button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        </div>

        {submitError && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {submitError}
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            className="border-zinc-700 text-zinc-400 hover:text-zinc-200"
          >
            {t('betaFeedback.modal.cancelBtn')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!description.trim() || submitting}
            className="bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-50"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
                {t('betaFeedback.modal.sending')}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Send className="h-4 w-4" />
                {t('betaFeedback.modal.submitBtn')}
              </span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}