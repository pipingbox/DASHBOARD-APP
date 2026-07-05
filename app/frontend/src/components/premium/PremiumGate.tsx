import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  X,
  Crown,
  Check,
  Download,
  Printer,
  FileText,
  Sparkles,
  Users,
  GraduationCap,
  Lock,
} from 'lucide-react';
import type { PremiumStatus } from '@/lib/premium';
import { PREMIUM_PRICE_MONTHLY, PREMIUM_PRICE_YEARLY, PREMIUM_FEATURES } from '@/lib/premium';

/**
 * PremiumGate — paywall modal for premium features.
 *
 * Shows when a free user tries to export/print a premium feature.
 * Offers 4 unlock paths: Stripe (when live), Referrals, Academy, Enterprise.
 *
 * Until Stripe is activated (DEC-30), the CTA is "Contact us" + referral path.
 */

interface PremiumGateProps {
  open: boolean;
  onClose: () => void;
  feature: string; // e.g., 'PDF Export', 'Printable Template'
  featureDescription?: string;
  status: PremiumStatus;
}

export function PremiumGate({ open, onClose, feature, featureDescription, status }: PremiumGateProps) {
  if (!open) return null;

  const referralProgress = status.referralLevel ?? 0;
  const referralTarget = 3;
  const referralRemaining = Math.max(0, referralTarget - referralProgress);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-[#0a0a0a] border border-[#f59e0b]/30 rounded-sm shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative p-6 border-b border-zinc-800">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#f59e0b] via-[#f59e0b]/50 to-transparent" />
          <button onClick={onClose} className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300">
            <X className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-[#f59e0b]/10 border border-[#f59e0b]/30">
              <Crown className="h-5 w-5 text-[#f59e0b]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-100">Premium Feature</h3>
              <p className="text-xs text-zinc-500">{feature}</p>
            </div>
          </div>
          {featureDescription && (
            <p className="text-xs text-zinc-400 mt-3 leading-relaxed">{featureDescription}</p>
          )}
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Pricing */}
          <div className="grid grid-cols-2 gap-3">
            <div className="border border-zinc-800 bg-zinc-950/50 rounded-sm p-4 text-center space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">Monthly</p>
              <p className="text-2xl font-bold text-zinc-100">€{PREMIUM_PRICE_MONTHLY}</p>
              <p className="text-[10px] text-zinc-600">per month</p>
            </div>
            <div className="border border-[#f59e0b]/30 bg-[#f59e0b]/5 rounded-sm p-4 text-center space-y-1 relative">
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 text-[9px] uppercase tracking-wider bg-[#f59e0b] text-black rounded-sm font-bold">
                Save 35%
              </span>
              <p className="text-[10px] uppercase tracking-wider text-[#f59e0b]">Yearly</p>
              <p className="text-2xl font-bold text-[#f59e0b]">€{PREMIUM_PRICE_YEARLY}</p>
              <p className="text-[10px] text-zinc-500">€3.25/month</p>
            </div>
          </div>

          {/* Features list */}
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">What you get</p>
            {PREMIUM_FEATURES.map((feat) => (
              <div key={feat.key} className="flex items-start gap-2">
                <Check className="h-3.5 w-3.5 text-[#f59e0b] shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-zinc-300 font-medium">{feat.label}</p>
                  <p className="text-[10px] text-zinc-500">{feat.description}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Unlock paths */}
          <div className="border-t border-zinc-800 pt-4 space-y-3">
            <p className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">
              Or unlock for free:
            </p>

            {/* Referral path */}
            <div className="flex items-center gap-3 border border-zinc-800 bg-zinc-950/50 rounded-sm p-3">
              <Users className="h-4 w-4 text-blue-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-zinc-300 font-medium">Refer {referralRemaining} more {referralRemaining === 1 ? 'worker' : 'workers'}</p>
                <p className="text-[10px] text-zinc-500">
                  {referralProgress}/{referralTarget} referrals — get premium tools free
                </p>
                <div className="h-1.5 bg-zinc-800 rounded-full mt-1.5 overflow-hidden">
                  <div
                    className="h-full bg-blue-400 rounded-full transition-all"
                    style={{ width: `${Math.min(100, (referralProgress / referralTarget) * 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Academy path */}
            <Link
              to="/academy/vca-course"
              className="flex items-center gap-3 border border-zinc-800 bg-zinc-950/50 rounded-sm p-3 hover:border-[#f59e0b]/30 transition"
            >
              <GraduationCap className="h-4 w-4 text-[#f59e0b] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-zinc-300 font-medium">Buy VCA Course (€59.90)</p>
                <p className="text-[10px] text-zinc-500">Includes 1 year of premium tools</p>
              </div>
            </Link>
          </div>

          {/* CTA */}
          <div className="space-y-2 pt-2">
            {/* Stripe CTA (when live) */}
            <button
              className="w-full bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold py-2.5 rounded-sm text-sm transition flex items-center justify-center gap-2"
              onClick={() => {
                // TODO: When Stripe is live (DEC-30), redirect to checkout
                // For now, show contact message
                window.location.href = 'mailto:hello@pipingbox.com?subject=Premium Tools Subscription&body=I want to subscribe to PipingBox Premium Tools (€4.99/month or €39/year).';
              }}
            >
              <Crown className="h-4 w-4" />
              Upgrade to Premium
            </button>
            <p className="text-[10px] text-zinc-600 text-center">
              Stripe activation pending. Email us to subscribe manually.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * PremiumBadge — small crown badge for premium features.
 */
export function PremiumBadge({ size = 'sm' }: { size?: 'sm' | 'xs' }) {
  const sizeClass = size === 'xs' ? 'px-1 py-0 text-[8px]' : 'px-1.5 py-0.5 text-[9px]';
  return (
    <span className={`inline-flex items-center gap-0.5 ${sizeClass} uppercase tracking-wider bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20 rounded-sm font-medium`}>
      <Crown className={size === 'xs' ? 'h-2 w-2' : 'h-2.5 w-2.5'} />
      PRO
    </span>
  );
}

/**
 * usePremiumGate — hook to manage the premium gate modal.
 * Returns: isGateOpen, gateFeature, openGate, closeGate, isPremium, status
 */
export function usePremiumGate() {
  const [isGateOpen, setIsGateOpen] = useState(false);
  const [gateFeature, setGateFeature] = useState({ name: '', description: '' });

  const openGate = (feature: string, description?: string) => {
    setGateFeature({ name: feature, description: description ?? '' });
    setIsGateOpen(true);
  };

  const closeGate = () => setIsGateOpen(false);

  return {
    isGateOpen,
    gateFeature,
    openGate,
    closeGate,
  };
}
