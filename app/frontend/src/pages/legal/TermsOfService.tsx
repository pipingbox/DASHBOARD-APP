import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';

export default function TermsOfService() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800/60 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link to="/">
            <img src="/assets/logos/logo-horizontal.png" alt="PipingBox" className="w-[160px] h-auto" />
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/login" className="text-sm text-zinc-400 hover:text-zinc-200 transition">
              {t('auth.signIn')}
            </Link>
            <Link
              to="/register"
              className="text-sm bg-[#f59e0b] text-black px-4 py-2 rounded-md font-semibold hover:bg-[#d97706] transition"
            >
              {t('auth.signUp')}
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-12">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition mb-8">
          <ArrowLeft className="h-4 w-4" />
          {t('common.home', 'Home')}
        </Link>

        <h1 className="text-3xl font-bold mb-2">{t('legal.termsTitle', 'Terms of Service')}</h1>
        <p className="text-sm text-zinc-500 mb-10">
          {t('legal.lastUpdated', 'Last updated')}: June 2026
        </p>

        <div className="space-y-8 text-sm text-zinc-400 leading-relaxed">
          {/* [REVISAR CON LEGAL] — Placeholder structure for legal review */}

          <section>
            <h2 className="text-lg font-semibold text-zinc-200 mb-3">1. {t('legal.acceptance', 'Acceptance of Terms')}</h2>
            <p>
              By accessing or using PipingBox ("the Service"), you agree to be bound by these Terms of Service.
              If you do not agree, you may not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-200 mb-3">2. {t('legal.description', 'Service Description')}</h2>
            <p>
              PipingBox is a digital platform for industrial professionals in the piping, mechanical,
              construction, and energy sectors. The platform provides access to training courses,
              calculation tools, job listings, community features, and talent management services.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-200 mb-3">3. {t('legal.accounts', 'User Accounts')}</h2>
            <p>
              You must provide accurate information when creating an account. You are responsible for
              maintaining the confidentiality of your login credentials and for all activities under your account.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-200 mb-3">4. {t('legal.acceptableUse', 'Acceptable Use')}</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Use the Service for any unlawful purpose.</li>
              <li>Submit false, misleading, or fraudulent information.</li>
              <li>Impersonate another person or entity.</li>
              <li>Attempt to access other users' accounts or private data.</li>
              <li>Use automated tools to scrape or extract data from the Service.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-200 mb-3">5. {t('legal.ip', 'Intellectual Property')}</h2>
            <p>
              All content, design, code, and branding of PipingBox is owned by PipingBox or its licensors.
              User-generated content remains the property of the user, but you grant PipingBox a
              non-exclusive license to display and distribute it within the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-200 mb-3">6. {t('legal.liability', 'Limitation of Liability')}</h2>
            <p>
              PipingBox is provided "as is" without warranties. We are not liable for any indirect,
              incidental, or consequential damages arising from your use of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-200 mb-3">7. {t('legal.termination', 'Termination')}</h2>
            <p>
              We may suspend or terminate your account at our discretion if you violate these terms.
              You may delete your account at any time through the platform settings.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-200 mb-3">8. {t('legal.changes', 'Changes to Terms')}</h2>
            <p>
              We may update these Terms from time to time. Continued use of the Service after changes
              constitutes acceptance of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-200 mb-3">9. {t('legal.contact', 'Contact')}</h2>
            <p>
              For questions about these Terms, contact us at:{' '}
              <a href="mailto:legal@pipingbox.com" className="text-[#f59e0b] hover:underline">
                legal@pipingbox.com
              </a>
            </p>
          </section>

          <div className="border border-amber-500/20 bg-amber-500/5 rounded-md p-4 mt-10">
            <p className="text-xs text-amber-400/80">
              [INTERNAL NOTE — REVIEW WITH LEGAL COUNSEL BEFORE FINAL PUBLICATION]
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
