import { SUPPLY_CONSENT_TEXT } from '@/lib/academy/consent';

/**
 * PB-MARKET-CONSENT-001 — the immediate-supply consent checkbox.
 *
 * NEVER pre-ticked (the legal regime requires an EXPRESS act by the buyer).
 * The parent keeps the checked state and refuses checkout until it is true;
 * create-checkout independently refuses a session for flagged products
 * without the consent, so this component is the UX half of a server-enforced
 * rule, not the enforcement itself.
 */

interface SupplyConsentCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function SupplyConsentCheckbox({ checked, onChange, disabled }: SupplyConsentCheckboxProps) {
  return (
    <label
      className={`flex items-start gap-2.5 border border-zinc-800 bg-zinc-950/50 rounded-sm p-3 ${
        disabled ? 'opacity-60' : 'cursor-pointer hover:border-zinc-700'
      } transition`}
    >
      <input
        type="checkbox"
        // Explicitly uncontrolled-by-default in the parent: initial state must
        // be false. Never default this to true.
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[#f59e0b]"
        data-testid="supply-consent-checkbox"
      />
      <span className="text-[11px] text-zinc-400 leading-relaxed">{SUPPLY_CONSENT_TEXT}</span>
    </label>
  );
}
