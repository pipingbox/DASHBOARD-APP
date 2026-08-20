import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package, Plus, Loader2 } from 'lucide-react';
import { fetchCatalogPrices, formatPrice, redirectToCheckout, type CatalogPrice } from '@/lib/stripe';

// MON-001 / PB-STRIPE-001 Fase 5: Job Credits UI component.
// Shows remaining job credits and a purchase CTA wired to Stripe Checkout.
//
// The credit packs are NOT hardcoded any more. They are read from
// app_stripe_prices, so the price shown here is by construction the price
// charged at checkout. The previous hardcoded list had drifted away from the
// catalog (it advertised EUR 49 / 199 / 349 against a catalog of 29 / 129 / 399).

interface JobCreditsWidgetProps {
  creditsRemaining: number;
  planType: 'starter' | 'professional' | 'enterprise' | 'custom';
}

/** job_credit_5 -> "5 Job Posts" */
function packLabel(productKey: string): string {
  const n = Number(productKey.replace('job_credit_', ''));
  if (!Number.isFinite(n)) return productKey;
  return n === 1 ? '1 Job Post' : `${n} Job Posts`;
}

function packQuantity(productKey: string): number {
  const n = Number(productKey.replace('job_credit_', ''));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function JobCreditsWidget({ creditsRemaining, planType }: JobCreditsWidgetProps) {
  const [packs, setPacks] = useState<CatalogPrice[] | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const planLabel = planType.charAt(0).toUpperCase() + planType.slice(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await fetchCatalogPrices('job_credit_');
      if (!cancelled) setPacks(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleBuy(productKey: string) {
    setBusyKey(productKey);
    setError(null);
    const reason = await redirectToCheckout(productKey);
    if (reason) {
      setBusyKey(null);
      setError(
        reason === 'not_authenticated'
          ? 'Sign in to purchase credits.'
          : reason === 'not_available'
            ? 'This pack is not available right now.'
            : 'Could not start checkout. Please try again.',
      );
    }
    // On success the browser navigates away, so no state reset is needed.
  }

  const basePricePerPost =
    packs?.find((p) => packQuantity(p.product_key) === 1)?.amount_cents ?? null;

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

        {packs === null && (
          <div className="flex items-center gap-2 p-3 text-xs text-zinc-500">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading packs…
          </div>
        )}

        {packs !== null && packs.length === 0 && (
          <div className="border border-zinc-800/60 bg-zinc-950 p-3 text-xs text-zinc-400">
            Credit packs are not available yet.{' '}
            <a
              href="mailto:hello@pipingbox.com?subject=Job%20Credits"
              className="text-[#f59e0b] hover:underline"
            >
              Contact us
            </a>{' '}
            to purchase.
          </div>
        )}

        {packs?.map((pack) => {
          const qty = packQuantity(pack.product_key);
          const perPost = pack.amount_cents != null ? pack.amount_cents / qty : null;
          const savings =
            basePricePerPost && perPost && qty > 1
              ? Math.round((1 - perPost / basePricePerPost) * 100)
              : 0;

          return (
            <div
              key={pack.product_key}
              className="flex items-center justify-between border border-zinc-800/60 bg-zinc-950 p-3 rounded-sm"
            >
              <div>
                <p className="text-sm text-zinc-200">{packLabel(pack.product_key)}</p>
                <p className="text-[10px] text-zinc-500">
                  {savings > 0
                    ? `Save ${savings}%`
                    : `€${formatPrice(perPost)} per post`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-zinc-100">
                  €{formatPrice(pack.amount_cents)}
                </span>
                <button
                  disabled={busyKey !== null}
                  className="rounded-sm bg-[#f59e0b] px-3 py-1 text-xs font-semibold text-black transition hover:bg-[#d97706] disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => handleBuy(pack.product_key)}
                >
                  {busyKey === pack.product_key ? (
                    <Loader2 className="h-3 w-3 inline animate-spin" />
                  ) : (
                    <Plus className="h-3 w-3 inline" />
                  )}{' '}
                  Buy
                </button>
              </div>
            </div>
          );
        })}

        {error && (
          <p className="text-[10px] text-red-400 pt-1">{error}</p>
        )}
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
