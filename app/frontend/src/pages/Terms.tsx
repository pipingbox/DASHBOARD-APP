import { Link } from 'react-router-dom';
import { PipingBoxLogo } from '@/components/PipingBoxLogo';
import { ArrowLeft } from 'lucide-react';

export default function Terms() {
  return (
    <div className="min-h-screen bg-[#0d0d0d] text-zinc-300">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-10 flex flex-col items-center gap-4">
          <PipingBoxLogo />
          <h1 className="text-3xl font-bold text-white">Terms of Service</h1>
          <p className="text-sm text-zinc-500">Last updated: May 20, 2026</p>
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
          {/* Acceptance of Terms */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">1. Acceptance of Terms</h2>
            <p>
              By accessing or using PipingBox, you agree to be bound by these Terms of Service and
              all applicable laws and regulations. If you do not agree with any of these terms, you
              are prohibited from using or accessing this platform. These Terms of Service apply to
              all users of the platform, including workers, companies, and administrators.
            </p>
          </section>

          {/* User Responsibilities */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">2. User Responsibilities</h2>
            <p className="mb-3">As a user of PipingBox, you agree to:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>Provide accurate and truthful information in your profile and communications</li>
              <li>Keep your account credentials secure and confidential</li>
              <li>Not impersonate other users or misrepresent your qualifications</li>
              <li>Not upload malicious content, spam, or inappropriate material</li>
              <li>Respect the intellectual property rights of others</li>
              <li>Comply with all applicable local, national, and international laws</li>
              <li>Report any security vulnerabilities or suspicious activity</li>
            </ul>
          </section>

          {/* Professional Use */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">3. Professional Use</h2>
            <p>
              PipingBox is designed exclusively for professional use in the piping engineering and
              industrial sectors. All content, job listings, certifications, and communications must
              be related to legitimate professional activities. Users must not use the platform for
              any illegal, fraudulent, or non-professional purposes. Companies posting job listings
              must represent real employment opportunities with accurate descriptions and
              requirements.
            </p>
          </section>

          {/* Account Security */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">4. Account Security</h2>
            <p>
              You are responsible for maintaining the confidentiality of your account and password.
              You agree to notify us immediately of any unauthorized use of your account. PipingBox
              cannot and will not be liable for any loss or damage arising from your failure to
              maintain the security of your account credentials. We recommend using strong, unique
              passwords and enabling all available security features.
            </p>
          </section>

          {/* Intellectual Property */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">5. Intellectual Property</h2>
            <p>
              The PipingBox platform, including its design, logos, features, and content created by
              PipingBox, is protected by intellectual property laws. Users retain ownership of content
              they upload (CVs, certifications, documents, profile information). By uploading content,
              you grant PipingBox a non-exclusive license to display and process that content as
              necessary to provide our services. You may not copy, modify, or distribute any part of
              the platform without prior written consent.
            </p>
          </section>

          {/* Platform Availability */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">6. Platform Availability</h2>
            <p>
              We strive to maintain high availability of the PipingBox platform. However, we do not
              guarantee uninterrupted access. The platform may be temporarily unavailable due to
              maintenance, updates, or circumstances beyond our control. We will make reasonable
              efforts to notify users of planned downtime in advance. We reserve the right to modify,
              suspend, or discontinue any part of the service at any time.
            </p>
          </section>

          {/* Limitation of Liability */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">7. Limitation of Liability</h2>
            <p>
              PipingBox is provided "as is" without warranties of any kind. To the fullest extent
              permitted by law, PipingBox shall not be liable for any indirect, incidental, special,
              consequential, or punitive damages resulting from your use of the platform. This
              includes, but is not limited to, damages for loss of profits, data, or other
              intangible losses. Our total liability shall not exceed the amount paid by you, if any,
              for accessing the platform during the twelve months preceding the claim.
            </p>
          </section>

          {/* Termination */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">8. Termination</h2>
            <p>
              We reserve the right to terminate or suspend your account at any time, without prior
              notice, for conduct that we believe violates these Terms of Service or is harmful to
              other users, us, or third parties, or for any other reason at our sole discretion. Upon
              termination, your right to use the platform will immediately cease. You may also
              request account deletion at any time by contacting our support team.
            </p>
          </section>

          {/* Contact Information */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">9. Contact Information</h2>
            <p>
              If you have any questions about these Terms of Service, please contact us at:
            </p>
            <p className="mt-3">
              <a
                href="mailto:support@pipingbox.com"
                className="text-[#f59e0b] hover:underline"
              >
                support@pipingbox.com
              </a>
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