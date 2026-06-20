import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';

export default function PrivacyPolicy() {
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

        <h1 className="text-3xl font-bold mb-2">{t('legal.privacyTitle', 'Privacy Policy')}</h1>
        <p className="text-sm text-zinc-500 mb-10">
          {t('legal.lastUpdated', 'Last updated')}: June 2026
        </p>

        <div className="space-y-8 text-sm text-zinc-400 leading-relaxed">
          {/* [REVISAR CON LEGAL] — Placeholder structure for legal review */}

          <section>
            <h2 className="text-lg font-semibold text-zinc-200 mb-3">1. {t('legal.dataController', 'Data Controller')}</h2>
            <p>
              PipingBox is the data controller for personal data processed through this platform.
              For questions, contact:{' '}
              <a href="mailto:privacy@pipingbox.com" className="text-[#f59e0b] hover:underline">
                privacy@pipingbox.com
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-200 mb-3">2. {t('legal.dataCollected', 'Data We Collect')}</h2>
            <p>We collect the following types of personal data:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li><strong className="text-zinc-300">Account data:</strong> name, email address, password (hashed), account type.</li>
              <li><strong className="text-zinc-300">Profile data:</strong> professional title, certifications, skills, work history, location, photo.</li>
              <li><strong className="text-zinc-300">Usage data:</strong> pages visited, features used, timestamps, device information.</li>
              <li><strong className="text-zinc-300">Communication data:</strong> messages sent through the community or support channels.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-200 mb-3">3. {t('legal.purpose', 'Purpose of Processing')}</h2>
            <p>We process your personal data for:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Providing and maintaining the platform services.</li>
              <li>Matching professionals with job opportunities.</li>
              <li>Personalizing your learning and tool recommendations.</li>
              <li>Communicating service updates, security alerts, and support.</li>
              <li>Improving the platform through usage analytics.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-200 mb-3">4. {t('legal.legalBasis', 'Legal Basis (GDPR)')}</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong className="text-zinc-300">Contractual necessity:</strong> processing required to provide the services you signed up for.</li>
              <li><strong className="text-zinc-300">Legitimate interest:</strong> analytics, fraud prevention, platform improvement.</li>
              <li><strong className="text-zinc-300">Consent:</strong> marketing emails, optional cookies, third-party integrations.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-200 mb-3">5. {t('legal.dataSharing', 'Data Sharing')}</h2>
            <p>
              We do not sell your personal data. We may share data with:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Employers who view your public profile (with your consent).</li>
              <li>Service providers (hosting, email, analytics) under strict data processing agreements.</li>
              <li>Legal authorities when required by law.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-200 mb-3">6. {t('legal.rights', 'Your Rights')}</h2>
            <p>Under GDPR and applicable laws, you have the right to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li><strong className="text-zinc-300">Access</strong> your personal data.</li>
              <li><strong className="text-zinc-300">Rectify</strong> inaccurate data.</li>
              <li><strong className="text-zinc-300">Erase</strong> your data ("right to be forgotten").</li>
              <li><strong className="text-zinc-300">Port</strong> your data to another service.</li>
              <li><strong className="text-zinc-300">Object</strong> to processing based on legitimate interest.</li>
              <li><strong className="text-zinc-300">Withdraw consent</strong> at any time.</li>
            </ul>
            <p className="mt-2">
              To exercise these rights, contact:{' '}
              <a href="mailto:privacy@pipingbox.com" className="text-[#f59e0b] hover:underline">
                privacy@pipingbox.com
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-200 mb-3">7. {t('legal.cookies', 'Cookies')}</h2>
            <p>
              We use essential cookies for authentication and session management. Analytics cookies
              (Google Analytics) are used to understand platform usage. You can manage cookie
              preferences through your browser settings.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-200 mb-3">8. {t('legal.retention', 'Data Retention')}</h2>
            <p>
              We retain your personal data for as long as your account is active. After account deletion,
              we retain anonymized analytics data. Backup copies are purged within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-200 mb-3">9. {t('legal.security', 'Security')}</h2>
            <p>
              We implement industry-standard security measures including encryption in transit (TLS),
              encryption at rest, and row-level security in our database. However, no system is
              completely secure.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-200 mb-3">10. {t('legal.contact', 'Contact')}</h2>
            <p>
              Data Protection Officer:{' '}
              <a href="mailto:privacy@pipingbox.com" className="text-[#f59e0b] hover:underline">
                privacy@pipingbox.com
              </a>
            </p>
          </section>

          <div className="border border-amber-500/20 bg-amber-500/5 rounded-md p-4 mt-10">
            <p className="text-xs text-amber-400/80">
              [INTERNAL NOTE — REVIEW WITH LEGAL COUNSEL / DPO BEFORE FINAL PUBLICATION]
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
