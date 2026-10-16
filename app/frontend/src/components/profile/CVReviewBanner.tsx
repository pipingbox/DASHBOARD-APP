import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileText, ArrowRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getPendingDraft, type CvDraft } from '@/lib/cvDrafts';

/**
 * PB-CV-AUTO-PROFILE-001 — Banner del draft pendiente de revisión.
 *
 * UX PRINCIPAL (ticket §3): "Hemos preparado tu perfil a partir de tu CV.
 * Revisa los datos y confirma." con CTA "Revisar mi perfil". Aparece también
 * para el candidato auth-only cuyo CV llegó por soporte (ticket §10).
 */
export function CVReviewBanner() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [draft, setDraft] = useState<CvDraft | null>(null);

  useEffect(() => {
    let alive = true;
    getPendingDraft().then((d) => {
      if (alive) setDraft(d);
    });
    return () => {
      alive = false;
    };
  }, [profile?.cv_storage_path]);

  if (!draft || draft.extraction_status !== 'pending_review') return null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[#f59e0b]/40 bg-[#f59e0b]/10 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <FileText className="mt-0.5 h-5 w-5 shrink-0 text-[#f59e0b]" />
        <div>
          <p className="text-sm font-medium text-zinc-100">{t('cvReview.bannerTitle')}</p>
          <p className="text-sm text-zinc-400">{t('cvReview.bannerBody')}</p>
        </div>
      </div>
      <Link
        to="/profile/cv-review"
        className="inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[#f59e0b] px-4 py-2 text-sm font-medium text-zinc-950 transition-colors hover:bg-[#d97706]"
      >
        {t('cvReview.reviewCta')}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
