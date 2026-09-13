import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Languages, X } from 'lucide-react';
import { SUPPORTED_LANGUAGES, toSupportedCode } from '@/i18n';
import { BETA_SUPPORT_EMAIL, openBetaFeedback } from '@/lib/betaFeedback';

const DISMISS_PREFIX = 'pipingbox_tx_banner_dismissed_';

function dismissKey(code: string) {
  return `${DISMISS_PREFIX}${code}`;
}

/**
 * Small, dismissible notice shown when the UI is displayed in a translated
 * language. Lets workers report a wrong translation while the platform is in
 * beta, either in-app or by email (works without an account).
 */
export function TranslationBetaBanner() {
  const { t, i18n } = useTranslation();
  const code = toSupportedCode(i18n.language) ?? 'en';
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (code === 'en') {
      setDismissed(true);
      return;
    }
    try {
      setDismissed(localStorage.getItem(dismissKey(code)) === 'true');
    } catch {
      setDismissed(false);
    }
  }, [code]);

  if (code === 'en' || dismissed) return null;

  const languageName = SUPPORTED_LANGUAGES.find((l) => l.code === code)?.label ?? code.toUpperCase();

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(dismissKey(code), 'true');
    } catch {
      // Ignore storage failures; the banner simply reappears next visit.
    }
  };

  const mailtoHref = `mailto:${BETA_SUPPORT_EMAIL}?subject=${encodeURIComponent(
    `[Translation ${code.toUpperCase()}] ${t('translationBanner.emailSubject')}`,
  )}&body=${encodeURIComponent(
    `${t('translationBanner.emailBodyLanguage', { language: languageName, code })}\n${t(
      'translationBanner.emailBodyPage',
    )}: ${typeof window !== 'undefined' ? window.location.href : ''}\n\n${t(
      'translationBanner.emailBodyHint',
    )}\n`,
  )}`;

  return (
    <div
      data-testid="translation-beta-banner"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-amber-500/20 bg-amber-500/[0.07] px-3 py-1.5 text-[11px] text-amber-200/90 sm:px-4 lg:px-8"
    >
      <Languages className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
      <span className="min-w-0">
        {t('translationBanner.text', { language: languageName })}
      </span>
      <button
        type="button"
        onClick={() => openBetaFeedback('translation')}
        className="rounded border border-amber-500/40 px-1.5 py-0.5 font-medium text-amber-300 transition hover:bg-amber-500/15"
      >
        {t('translationBanner.reportBtn')}
      </button>
      <a
        href={mailtoHref}
        className="text-amber-300/70 underline decoration-dotted transition hover:text-amber-200"
      >
        {t('translationBanner.emailBtn')}
      </a>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('translationBanner.dismiss')}
        className="ml-auto shrink-0 rounded p-0.5 text-amber-300/60 transition hover:bg-amber-500/15 hover:text-amber-200"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
