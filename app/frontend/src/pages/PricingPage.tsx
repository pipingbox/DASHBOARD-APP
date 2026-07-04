import { Link } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// ENT-002: Pricing page UI (no Stripe integration yet — this is display only).
// Plans per DEC-31 (subscription-based) and MASTER_ROADMAP ENT-002.

interface Plan {
  name: string;
  price: string;
  period: string;
  description: string;
  features: { text: string; included: boolean }[];
  cta: string;
  highlighted?: boolean;
}

const PLANS: Plan[] = [
  {
    name: 'Starter',
    price: 'Free',
    period: '',
    description: 'For companies getting started',
    features: [
      { text: '3 job posts / month', included: true },
      { text: 'Basic worker search', included: true },
      { text: 'Company profile page', included: true },
      { text: 'Certification verification', included: false },
      { text: 'ATS (Applicant Tracking)', included: false },
      { text: 'Analytics dashboard', included: false },
    ],
    cta: 'Get started',
  },
  {
    name: 'Professional',
    price: '299',
    period: '/month',
    description: 'For growing companies hiring regularly',
    features: [
      { text: '15 job posts / month', included: true },
      { text: 'Advanced worker search + filters', included: true },
      { text: 'Certification verification', included: true },
      { text: '2 recruiter accounts', included: true },
      { text: 'ATS (Applicant Tracking)', included: false },
      { text: 'Analytics dashboard', included: false },
    ],
    cta: 'Start free trial',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: '799',
    period: '/month',
    description: 'For large-scale industrial contractors',
    features: [
      { text: 'Unlimited job posts', included: true },
      { text: 'Advanced search + saved filters', included: true },
      { text: 'Certification verification + compliance reports', included: true },
      { text: '10 recruiter accounts', included: true },
      { text: 'ATS + candidate pipeline (Kanban)', included: true },
      { text: 'Analytics dashboard + export', included: true },
    ],
    cta: 'Contact sales',
  },
];

export default function PricingPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-800/80 bg-[#0a0a0a]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="text-lg font-bold tracking-tight">
            Piping<span className="text-[#f59e0b]">Box</span>
          </Link>
          <Link
            to="/register"
            className="rounded-md bg-[#f59e0b] px-4 py-1.5 text-sm font-semibold text-black transition hover:bg-[#d97706]"
          >
            {t('landing.signUpFree', { defaultValue: 'Sign up free' })}
          </Link>
        </div>
      </header>

      {/* Pricing */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#f59e0b]">
            {t('pricing.eyebrow', { defaultValue: 'For companies' })}
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
            {t('pricing.title', { defaultValue: 'Simple, transparent pricing' })}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-zinc-400">
            {t('pricing.subtitle', {
              defaultValue: 'Workers are always free. Companies pay for hiring tools. No hidden fees.',
            })}
          </p>
        </div>

        {/* Plans */}
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-lg border p-6 ${
                plan.highlighted
                  ? 'border-[#f59e0b] bg-[#f59e0b]/5'
                  : 'border-zinc-800 bg-[#0d0d0d]'
              }`}
            >
              {plan.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#f59e0b] px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black">
                  {t('pricing.popular', { defaultValue: 'Most popular' })}
                </span>
              )}
              <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">{plan.name}</h3>
              <div className="mt-3 flex items-baseline gap-1">
                {plan.price !== 'Free' && <span className="text-2xl text-zinc-500">€</span>}
                <span className="text-4xl font-bold">{plan.price}</span>
                {plan.period && <span className="text-sm text-zinc-500">{plan.period}</span>}
              </div>
              <p className="mt-2 text-xs text-zinc-500">{plan.description}</p>

              <ul className="mt-6 flex-1 space-y-3">
                {plan.features.map((f) => (
                  <li key={f.text} className="flex items-start gap-2 text-sm">
                    {f.included ? (
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#f59e0b]" />
                    ) : (
                      <X className="mt-0.5 h-4 w-4 shrink-0 text-zinc-700" />
                    )}
                    <span className={f.included ? 'text-zinc-300' : 'text-zinc-600'}>{f.text}</span>
                  </li>
                ))}
              </ul>

              <Link
                to="/register"
                className={`mt-8 block rounded-md py-2.5 text-center text-sm font-semibold transition ${
                  plan.highlighted
                    ? 'bg-[#f59e0b] text-black hover:bg-[#d97706]'
                    : 'border border-zinc-700 text-zinc-200 hover:bg-zinc-900'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        {/* Workers free note */}
        <div className="mt-12 text-center">
          <p className="text-sm text-zinc-400">
            {t('pricing.workersFree', {
              defaultValue: 'Workers are always free — profile, marketplace, tools, and community.',
            })}
          </p>
        </div>

        {/* Custom plan */}
        <div className="mt-8 rounded-lg border border-zinc-800 bg-[#0d0d0d] p-6 text-center">
          <h3 className="text-sm font-semibold text-zinc-200">Custom</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Multi-site, ERP integration, SLA, dedicated onboarding
          </p>
          <a
            href="mailto:hello@pipingbox.com"
            className="mt-4 inline-block text-sm font-semibold text-[#f59e0b] hover:underline"
          >
            Contact us →
          </a>
        </div>
      </section>
    </div>
  );
}
