import { Link } from 'react-router-dom';
import { PipingBoxLogo } from '@/components/PipingBoxLogo';
import { ArrowLeft } from 'lucide-react';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-[#0d0d0d] text-zinc-300">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-10 flex flex-col items-center gap-4">
          <PipingBoxLogo />
          <h1 className="text-3xl font-bold text-white">Privacy Policy</h1>
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
          {/* Introduction */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">1. Introduction</h2>
            <p>
              Welcome to PipingBox. We are committed to protecting your personal information and your
              right to privacy. This Privacy Policy explains how we collect, use, disclose, and
              safeguard your information when you use our platform. By accessing or using PipingBox,
              you agree to the terms of this Privacy Policy.
            </p>
          </section>

          {/* Information We Collect */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">2. Information We Collect</h2>
            <p className="mb-3">We collect information that you provide directly to us, including:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>Personal identification information (name, email address, phone number)</li>
              <li>Professional information (work experience, certifications, skills, specialties)</li>
              <li>Employment preferences (availability, travel willingness, relocation preferences)</li>
              <li>Documents you upload (CVs, certifications, identification documents)</li>
              <li>Profile photos and avatars</li>
              <li>Company information (for employer accounts)</li>
              <li>Messages and communications within the platform</li>
            </ul>
          </section>

          {/* Authentication Data */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">3. Authentication Data</h2>
            <p>
              We use Supabase Authentication to manage user accounts. When you sign up or log in, we
              process your email address and encrypted password. If you choose to sign in with Google
              OAuth, we receive your basic profile information (name, email, and profile picture) from
              Google. We do not store your Google password.
            </p>
          </section>

          {/* Cookies and Analytics */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">4. Cookies and Analytics</h2>
            <p className="mb-3">
              We use cookies and similar tracking technologies to enhance your experience:
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong className="text-zinc-200">Essential cookies:</strong> Required for
                authentication and session management
              </li>
              <li>
                <strong className="text-zinc-200">Analytics cookies:</strong> We use Google Analytics
                4 to understand how users interact with our platform, helping us improve the user
                experience
              </li>
              <li>
                <strong className="text-zinc-200">Preference cookies:</strong> Store your language
                preference and UI settings
              </li>
            </ul>
          </section>

          {/* Data Protection */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">5. Data Protection</h2>
            <p className="mb-3">
              We implement appropriate technical and organizational security measures to protect your
              personal data, including:
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li>Encryption of data in transit (TLS/SSL) and at rest</li>
              <li>Row-Level Security (RLS) policies ensuring users can only access their own data</li>
              <li>Regular security audits and vulnerability assessments</li>
              <li>Secure file storage with access controls</li>
              <li>Role-based access control for administrative functions</li>
            </ul>
          </section>

          {/* Third-Party Services */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">6. Third-Party Services</h2>
            <p className="mb-3">We use the following third-party services:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong className="text-zinc-200">Supabase:</strong> Database hosting,
                authentication, and file storage
              </li>
              <li>
                <strong className="text-zinc-200">Google Analytics:</strong> Usage analytics and
                platform improvement
              </li>
              <li>
                <strong className="text-zinc-200">Google OAuth:</strong> Optional social
                authentication
              </li>
            </ul>
            <p className="mt-3">
              Each third-party service has its own privacy policy governing their use of your data.
            </p>
          </section>

          {/* User Rights */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">7. User Rights</h2>
            <p className="mb-3">You have the right to:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>Access your personal data stored on our platform</li>
              <li>Request correction of inaccurate personal data</li>
              <li>Request deletion of your account and associated data</li>
              <li>Export your data in a portable format</li>
              <li>Withdraw consent for data processing at any time</li>
              <li>Object to processing of your personal data</li>
              <li>Control the visibility of your profile (public/private settings)</li>
            </ul>
          </section>

          {/* Contact Information */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">8. Contact Information</h2>
            <p>
              If you have any questions or concerns about this Privacy Policy or our data practices,
              please contact us at:
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