import { Link } from 'react-router-dom';
import { PipingBoxLogo } from '@/components/PipingBoxLogo';
import { ArrowLeft } from 'lucide-react';
import { useSeo } from '@/hooks/useSeo';

/**
 * PB-MARKET-PROD-001 §7.2 — DSA single points of contact (arts. 11 and 12).
 *
 * Static, unauthenticated page. No database access, by design: the obligation is
 * to publish an address, not to render state.
 *
 * On the addresses below: the published address must ALWAYS be one that actually
 * receives mail. Publishing a contact address that bounces would turn a
 * non-compliance by omission into a misrepresentation towards an authority, which
 * is strictly worse. `support@pipingbox.com` exists, is monitored, and is already
 * published in Terms and Privacy.
 *
 * A dedicated authorities mailbox (e.g. `authorities@pipingbox.com`) is best
 * practice and should be adopted once it exists and is monitored; art. 11 requires
 * a single point of contact, not a dedicated mailbox, so this is an upgrade rather
 * than a fix. When that mailbox is live, changing AUTHORITIES_CONTACT below is the
 * only code change required.
 */
const AUTHORITIES_CONTACT = 'support@pipingbox.com';
const RECIPIENTS_CONTACT = 'support@pipingbox.com';

/** §7.9 — declared target response time for the art. 12 contact point. */
const RECIPIENTS_RESPONSE_TIME = '5 business days';

export default function DsaContact() {
  useSeo({
    title: 'DSA Contact Points — PipingBox',
    description:
      'Single points of contact of PipingBox OÜ under Articles 11 and 12 of Regulation (EU) 2022/2065 (Digital Services Act), for authorities and for recipients of the service.',
  });

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-zinc-300">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-10 flex flex-col items-center gap-4">
          <PipingBoxLogo />
          <h1 className="text-3xl font-bold text-white">DSA Contact Points</h1>
          <p className="text-sm text-zinc-500">Last updated: August 27, 2026</p>
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
          {/* Introduction */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">1. Operator and scope</h2>
            <p className="mb-3">
              The PipingBox platform is operated by PipingBox OÜ, a company established in Estonia.
              This page sets out the single points of contact designated by PipingBox OÜ under
              Articles 11 and 12 of Regulation (EU) 2022/2065 (the Digital Services Act), and states
              the position of PipingBox OÜ regarding Article 13.
            </p>
            <p>
              This page is publicly accessible and does not require registration, authentication or
              any form of account with PipingBox in order to be read or used.
            </p>
          </section>

          {/* Article 11 */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">
              2. Article 11 — Point of contact for authorities
            </h2>
            <p className="mb-3">
              PipingBox OÜ designates a single point of contact enabling direct communication, by
              electronic means, with the authorities of the Member States, the European Commission
              and the European Board for Digital Services, in relation to the application of the
              Digital Services Act.
            </p>
            <p className="mb-3">
              Contact address:{' '}
              <a
                href={`mailto:${AUTHORITIES_CONTACT}`}
                className="text-[#f59e0b] hover:underline"
              >
                {AUTHORITIES_CONTACT}
              </a>
            </p>
            <p className="mb-3">
              Communications should indicate "DSA Article 11" in the subject line so that they can be
              routed and prioritised correctly.
            </p>
            <p className="mb-3">
              <span className="text-zinc-300">Languages of communication.</span> PipingBox OÜ handles
              communications from authorities in English and in Spanish. Either language may be used
              and neither is subordinate to the other.
            </p>
            <p>
              <span className="text-zinc-300">Means of communication.</span> Communication takes place
              by electronic means. This channel does not rely on an automated tool as its sole means
              of communication: messages received at the address above are read and answered by
              members of the PipingBox team.
            </p>
          </section>

          {/* Article 12 */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">
              3. Article 12 — Point of contact for recipients of the service
            </h2>
            <p className="mb-3">
              PipingBox OÜ designates a single point of contact enabling recipients of the service to
              communicate directly and rapidly with PipingBox OÜ by electronic means. It is available
              to students, instructors and third parties, whether or not they hold a PipingBox
              account.
            </p>
            <p className="mb-3">
              Contact address:{' '}
              <a href={`mailto:${RECIPIENTS_CONTACT}`} className="text-[#f59e0b] hover:underline">
                {RECIPIENTS_CONTACT}
              </a>
            </p>
            <p className="mb-3">
              <span className="text-zinc-300">Target response time.</span> PipingBox OÜ aims to
              respond to enquiries received at this point of contact within{' '}
              {RECIPIENTS_RESPONSE_TIME}.
            </p>
            <p className="mb-3">
              <span className="text-zinc-300">Languages of communication.</span> Enquiries are handled
              in English and in Spanish.
            </p>
            <p>
              <span className="text-zinc-300">Human channel.</span> This is a direct channel to the
              PipingBox team. It is not a chatbot and it does not rely solely on automated means:
              every message received at the address above is read and answered by a person. No
              recipient of the service is required to interact with an automated tool in order to
              reach PipingBox OÜ.
            </p>
          </section>

          {/* Article 13 */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">
              4. Article 13 — Legal representative: not applicable
            </h2>
            <p>
              Article 13 of the Digital Services Act requires providers of intermediary services that
              do not have an establishment in the Union to designate a legal representative in a
              Member State. PipingBox OÜ is established in Estonia, a Member State of the European
              Union. PipingBox OÜ is therefore not required to designate a legal representative in the
              Union, and has not designated one. This section is stated explicitly rather than omitted
              so that the position of PipingBox OÜ under Article 13 is unambiguous.
            </p>
          </section>

          {/* Related pages */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">5. Related information</h2>
            <p>
              See also the{' '}
              <Link to="/terms" className="text-[#f59e0b] hover:underline">
                Terms of Service
              </Link>{' '}
              and the{' '}
              <Link to="/privacy" className="text-[#f59e0b] hover:underline">
                Privacy Policy
              </Link>
              . Enquiries that are not related to the Digital Services Act may be sent to the same
              address.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-12 border-t border-zinc-800 pt-6 text-center text-sm text-zinc-600">
          <p>© {new Date().getFullYear()} PipingBox. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
