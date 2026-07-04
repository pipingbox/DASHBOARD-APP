import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Package, Plus } from 'lucide-react';

// MON-001: Job Credits UI component.
// Shows remaining job credits and a purchase CTA.
// NOTE: This is UI-only. Stripe integration is NOT implemented yet.
// When Stripe is connected, the "Buy credits" button will redirect to Stripe Checkout.

interface JobCreditsWidgetProps {
  creditsRemaining: number;
  planType: 'starter' | 'professional' | 'enterprise' | 'custom';
}

const CREDIT_PACKS = [
  { id: 'single', label: '1 Job Post', price: 49, pricePer: 49 },
  { id: 'pack5', label: '5 Job Posts', price: 199, pricePer: 39.8, savings: '20%' },
  { id: 'pack10', label: '10 Job Posts', price: 349, pricePer: 34.9, savings: '30%' },
  { id: 'featured', label: 'Featured Post', price: 99, pricePer: 99, note: '30 days in carousel' },
];

export function JobCreditsWidget({ creditsRemaining, planType }: JobCreditsWidgetProps) {
  const { t } = useTranslation();

  const planLabel = planType.charAt(0).toUpperCase() + planType.slice(1);

  return (
    <div className="border border-zinc-800/80 bg-[#0d0d0d] p-5 rounded-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-[#f59e0b]" />
          <h3 className="text-sm font-semibold text-zinc-200">Job Credits</h3>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">{planLabel} plan</span>
      </div>

      {/* Credits remaining */}
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold text-zinc-100">{creditsRemaining}</span>
        <span className="text-xs text-zinc-500">credits remaining</span>
      </div>

      {creditsRemaining <= 2 && (
        <div className="border border-[#f59e0b]/30 bg-[#f59e0b]/5 p-3 text-xs text-[#f59e0b]">
          You're running low on job credits. Top up to keep posting.
        </div>
      )}

      {/* Credit packs */}
      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Buy more credits</p>
        {CREDIT_PACKS.map((pack) => (
          <div
            key={pack.id}
            className="flex items-center justify-between border border-zinc-800/60 bg-zinc-950 p-3 rounded-sm"
          >
            <div>
              <p className="text-sm text-zinc-200">{pack.label}</p>
              <p className="text-[10px] text-zinc-500">
                {pack.savings ? `Save ${pack.savings}` : pack.note || `€${pack.pricePer.toFixed(2)} per post`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-zinc-100">€{pack.price}</span>
              {/* MON-001 TODO: Wire to Stripe Checkout when Stripe is configured */}
              <button
                className="rounded-sm bg-[#f59e0b] px-3 py-1 text-xs font-semibold text-black transition hover:bg-[#d97706]"
                onClick={() => alert('Stripe integration pending. Contact hello@pipingbox.com to purchase credits.')}
              >
                <Plus className="h-3 w-3 inline" /> Buy
              </button>
            </div>
          </div>
        ))}
      </div>

      <Link
        to="/pricing"
        className="block text-center text-xs text-zinc-500 transition hover:text-zinc-300"
      >
        Compare plans →
      </Link>
    </div>
  );
}
