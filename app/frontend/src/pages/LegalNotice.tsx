import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PipingBoxLogo } from '@/components/PipingBoxLogo';
import { ArrowLeft, Building2, AlertTriangle } from 'lucide-react';
import { supabase, TABLES } from '@/lib/supabase';

/**
 * PB-CORP-LEGAL-ENTITY-001 — public seller identification (impressum).
 *
 * Consumer law (BE/EU phase 1) requires the buyer to know WHO sells before
 * buying. The brand (PIPINGBOX) is constant; the legal seller is data held in
 * app_legal_entities (DEC-67). This page shows the ACTIVE entity and nothing
 * else — no invented fiscal data. When no entity is active yet (current
 * state: monetization not started, fiscal data not loaded), the page says so
 * explicitly instead of guessing.
 */

interface LegalEntity {
  entity_key: string;
  legal_name: string;
  trading_name: string;
  jurisdiction: string;
  legal_form: string;
  enterprise_number: string | null;
  vat_number: string | null;
  registered_address: string | null;
}

const LEGAL_FORM_LABELS: Record<string, string> = {
  sole_proprietor: 'Sole proprietor (self-employed)',
  private_limited_company: 'Private limited company',
};

const JURISDICTION_LABELS: Record<string, string> = {
  BE: 'Belgium',
  EE: 'Estonia',
};

export default function LegalNotice() {
  const [entity, setEntity] = useState<LegalEntity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from(TABLES.legalEntities)
          .select(
            'entity_key, legal_name, trading_name, jurisdiction, legal_form, enterprise_number, vat_number, registered_address'
          )
          .eq('is_active', true)
          .limit(1);
        setEntity(data?.[0] ?? null);
      } catch {
        setEntity(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-zinc-300">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-10 flex flex-col items-center gap-4">
          <PipingBoxLogo />
          <h1 className="text-3xl font-bold text-white">Legal Notice</h1>
          <p className="text-sm text-zinc-500">Seller identification</p>
        </div>

        <Link to="/" className="mb-8 inline-flex items-center gap-2 text-sm text-[#f59e0b] hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Back to PipingBox
        </Link>

        <div className="space-y-8 text-zinc-400 leading-relaxed">
          {loading && <p className="text-zinc-500">Loading seller information…</p>}

          {!loading && entity && (
            <section className="rounded-sm border border-zinc-800 bg-zinc-900/50 p-6">
              <div className="mb-4 flex items-center gap-3">
                <Building2 className="h-6 w-6 text-[#f59e0b]" />
                <h2 className="text-xl font-semibold text-white">{entity.trading_name}</h2>
              </div>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="inline font-medium text-zinc-300">Legal name: </dt>
                  <dd className="inline">{entity.legal_name}</dd>
                </div>
                <div>
                  <dt className="inline font-medium text-zinc-300">Legal form: </dt>
                  <dd className="inline">
                    {LEGAL_FORM_LABELS[entity.legal_form] ?? entity.legal_form}
                  </dd>
                </div>
                <div>
                  <dt className="inline font-medium text-zinc-300">Jurisdiction: </dt>
                  <dd className="inline">
                    {JURISDICTION_LABELS[entity.jurisdiction] ?? entity.jurisdiction}
                  </dd>
                </div>
                {entity.enterprise_number && (
                  <div>
                    <dt className="inline font-medium text-zinc-300">Enterprise number: </dt>
                    <dd className="inline">{entity.enterprise_number}</dd>
                  </div>
                )}
                {entity.vat_number && (
                  <div>
                    <dt className="inline font-medium text-zinc-300">VAT number: </dt>
                    <dd className="inline">{entity.vat_number}</dd>
                  </div>
                )}
                {entity.registered_address && (
                  <div>
                    <dt className="inline font-medium text-zinc-300">Registered address: </dt>
                    <dd className="inline whitespace-pre-line">{entity.registered_address}</dd>
                  </div>
                )}
              </dl>
              <p className="mt-4 text-xs text-zinc-500">
                Invoices, checkout and contractual documents identify this legal entity as the
                seller of record for all transactions completed while it is active.
              </p>
            </section>
          )}

          {!loading && !entity && (
            <section className="rounded-sm border border-[#f59e0b]/30 bg-[#f59e0b]/5 p-6">
              <div className="mb-3 flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-[#f59e0b]" />
                <h2 className="text-lg font-semibold text-white">No active selling entity yet</h2>
              </div>
              <p className="text-sm">
                PipingBox has not started commercial sales. The legal entity that will act as
                seller of record will be published here — with its legal name, legal form and
                registration numbers — as soon as commercial activity begins. No payment is
                collected at this time.
              </p>
              <p className="mt-3 text-xs text-zinc-500">
                Contact: <a className="text-[#f59e0b] hover:underline" href="mailto:hello@pipingbox.com">hello@pipingbox.com</a>
              </p>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">About this page</h2>
            <p className="text-sm">
              The PipingBox brand remains constant across all phases of the project, but the legal
              entity behind commercial transactions may change as the business grows (for example,
              from a Belgian sole proprietor to an Estonian private limited company). Every
              transaction is permanently linked to the legal entity that actually performed it,
              and this page always shows the currently active one.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
