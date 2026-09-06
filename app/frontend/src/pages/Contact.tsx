import { Link } from 'react-router-dom';
import { PipingBoxLogo } from '@/components/PipingBoxLogo';
import { ArrowLeft, Mail, Scale, ShieldCheck } from 'lucide-react';
import { useSeo } from '@/hooks/useSeo';

/**
 * Public contact page.
 *
 * Created for the manufacturer/distributor outreach round: the emails ask for a
 * conversation, and a recipient who wants to check who we are before replying
 * previously had nowhere to land. `/contact` did not exist — the SPA catch-all
 * answered 200 with the shell, and the footer "Contact" link pointed at
 * `/register`, which asks a stranger to create an account before they can reach
 * us. That is the wrong order.
 *
 * On the addresses below — same rule as DsaContact.tsx: a published address must
 * be one that actually receives mail. Publishing a bouncing address is worse than
 * publishing none. `support@pipingbox.com` is already published in Terms, Privacy
 * and the DSA page and is monitored. `info@pipingbox.com` is the address used for
 * commercial correspondence and is the canonical sender for outreach; it is
 * published here on that basis.
 *
 * On the absence of a legal entity: this page deliberately does NOT state a legal
 * form, company number, VAT ID, registered address, or that PipingBox is
 * "established" anywhere. The approved corporate position is BELGIUM FIRST ->
 * ESTONIA OU LATER, under external review, and until the Belgian registration
 * formally exists it is forbidden to publish `PipingBox OU`, to claim
 * incorporation in Estonia, or to invent registry data. See the standing note in
 * DsaContact.tsx. Neutral wording is the approved state, not a stopgap.
 *
 * The public copy is kept to one sentence on purpose: this is a contact page, not
 * a corporate disclosure. Do not grow it into an explanation of the company
 * structure, and do not add an entity here until the PO closes that decision.
 */

const GENERAL_CONTACT = 'support@pipingbox.com';
const COMMERCIAL_CONTACT = 'info@pipingbox.com';

export default function Contact() {
  useSeo({
    title: 'Contact — PipingBox',
    description:
      'How to reach PipingBox: general enquiries, commercial and partnership enquiries, and privacy or legal requests.',
  });

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-zinc-300">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-10 flex flex-col items-center gap-4">
          <PipingBoxLogo />
          <h1 className="text-3xl font-bold text-white">Contact</h1>
          <p className="text-sm text-zinc-500">
            We read everything that arrives. Please allow a few working days for a reply.
          </p>
        </div>

        {/* Back link */}
        <Link
          to="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-[#f59e0b] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to PipingBox
        </Link>

        {/* Content */}
        <div className="space-y-8 text-zinc-400 leading-relaxed">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Mail className="h-5 w-5 text-[#f59e0b]" />
              <h2 className="text-xl font-semibold text-white">General enquiries</h2>
            </div>
            <p className="mb-3">
              For questions about the platform, the engineering tools, an account, or anything
              that does not fit the sections below:
            </p>
            <p>
              <a
                href={`mailto:${GENERAL_CONTACT}`}
                className="text-[#f59e0b] hover:underline"
              >
                {GENERAL_CONTACT}
              </a>
            </p>
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[#f59e0b]" />
              <h2 className="text-xl font-semibold text-white">
                Manufacturers, distributors and partnerships
              </h2>
            </div>
            <p className="mb-3">
              We are building a manufacturer layer for the technical library: dimensional data,
              materials and certificates shown next to the standard an engineer is consulting,
              sourced from and owned by the manufacturer rather than copied by us. If you
              publish product data and want to understand what that would involve, write to:
            </p>
            <p>
              <a
                href={`mailto:${COMMERCIAL_CONTACT}`}
                className="text-[#f59e0b] hover:underline"
              >
                {COMMERCIAL_CONTACT}
              </a>
            </p>
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <Scale className="h-5 w-5 text-[#f59e0b]" />
              <h2 className="text-xl font-semibold text-white">Privacy and legal</h2>
            </div>
            <p className="mb-3">
              For data protection requests, or to exercise your rights over personal data, use{' '}
              <a
                href={`mailto:${GENERAL_CONTACT}`}
                className="text-[#f59e0b] hover:underline"
              >
                {GENERAL_CONTACT}
              </a>
              . Please see our{' '}
              <Link to="/privacy" className="text-[#f59e0b] hover:underline">
                Privacy Policy
              </Link>{' '}
              and{' '}
              <Link to="/terms" className="text-[#f59e0b] hover:underline">
                Terms of Service
              </Link>
              .
            </p>
            <p>
              Authorities and recipients of the service should use the points of contact
              designated under the Digital Services Act, set out on our{' '}
              <Link to="/dsa" className="text-[#f59e0b] hover:underline">
                DSA Contact Points
              </Link>{' '}
              page.
            </p>
          </section>

          <section className="border-t border-zinc-800/80 pt-6">
            <p className="text-sm text-zinc-500">
              PipingBox is an early-stage platform operated from Europe. Our corporate
              registration is in progress, so we do not yet publish registry details. The
              addresses above are monitored and are the way to reach us.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
