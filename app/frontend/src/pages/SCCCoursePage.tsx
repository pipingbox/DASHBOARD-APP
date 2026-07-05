import { useState } from 'react';
import { BookOpen, Calendar } from 'lucide-react';
import { SCCCourseContent } from '@/components/academy/SCCCourseContent';

/**
 * SCC (Germany / Austria) certification page.
 * Public route — no auth required to view course content.
 * Auth required only to save progress or book an exam.
 *
 * Routes: /certifications/scc and /academy/scc-course
 * Source: CERTIFICATION_PLATFORM_STRATEGY.md Fase 3, DEC-51
 */
export default function SCCCoursePage() {
  const [activeTab, setActiveTab] = useState<'course' | 'info'>('course');
  const [variant, setVariant] = useState<'Doc 016' | 'Doc 017' | 'Doc 018'>('Doc 016');
  const [lang, setLang] = useState<'de' | 'en'>('de');

  return (
    <div className="space-y-6">
      {/* Variant selector — Doc 016 (operative) is the default */}
      <div className="flex items-center gap-2 border-b border-zinc-800/80">
        {(['Doc 016', 'Doc 017', 'Doc 018'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setVariant(v)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-all ${
              variant === v
                ? 'border-[#f59e0b] text-[#f59e0b]'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {v}
            <span className="text-[9px] text-zinc-600">
              {v === 'Doc 016' ? 'Operative' : v === 'Doc 017' ? 'Supervisor' : 'Self-employed'}
            </span>
          </button>
        ))}
      </div>

      {/* Language toggle */}
      <div className="flex items-center justify-end gap-2">
        <span className="text-[10px] uppercase tracking-wider text-zinc-600">Sprache / Language:</span>
        {(['de', 'en'] as const).map((l) => (
          <button
            key={l}
            onClick={() => setLang(l)}
            className={`px-2.5 py-1 text-[10px] font-medium rounded-sm border transition-all ${
              lang === l
                ? 'bg-[#f59e0b]/10 border-[#f59e0b]/40 text-[#f59e0b]'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400'
            }`}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Tab selector */}
      <div className="flex items-center gap-2 border-b border-zinc-800/80">
        <button
          onClick={() => setActiveTab('course')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-all ${
            activeTab === 'course'
              ? 'border-[#f59e0b] text-[#f59e0b]'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <BookOpen className="h-4 w-4" />
          {lang === 'de' ? 'Vorbereitungskurs' : 'Preparation Course'}
        </button>
        <button
          onClick={() => setActiveTab('info')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-all ${
            activeTab === 'info'
              ? 'border-[#f59e0b] text-[#f59e0b]'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Calendar className="h-4 w-4" />
          {lang === 'de' ? 'Prüfung & Buchung' : 'Exam & Booking'}
        </button>
      </div>

      {activeTab === 'course' ? (
        <SCCCourseContent variant={variant} showLanguage={lang} />
      ) : (
        <SCCExamInfo variant={variant} lang={lang} />
      )}
    </div>
  );
}

function SCCExamInfo({ variant, lang }: { variant: string; lang: 'de' | 'en' }) {
  const isDe = lang === 'de';
  return (
    <div className="space-y-6">
      <div className="border border-[#f59e0b]/30 bg-[#f59e0b]/5 rounded-sm p-5 space-y-3">
        <h3 className="text-sm font-semibold text-[#f59e0b]">
          {isDe ? 'SCC-Prüfung — Offizielle Informationen' : 'SCC Exam — Official Information'}
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 text-xs">
          <div className="space-y-1">
            <p className="text-zinc-500">{isDe ? 'Prüfstelle' : 'Exam body'}</p>
            <p className="text-zinc-300">SCC Stiftung / TÜV / DEKRA</p>
          </div>
          <div className="space-y-1">
            <p className="text-zinc-500">{isDe ? 'Format' : 'Format'}</p>
            <p className="text-zinc-300">
              {variant === 'Doc 016' ? '30 Fragen, 45 min' : '40 Fragen, 60 min'}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-zinc-500">{isDe ? 'Bestehensgrenze' : 'Pass mark'}</p>
            <p className="text-zinc-300">
              {variant === 'Doc 016' ? '60 % (18/30)' : '65 % (26/40)'}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-zinc-500">{isDe ? 'Gültigkeit' : 'Validity'}</p>
            <p className="text-zinc-300">3–5 Jahre</p>
          </div>
          <div className="space-y-1">
            <p className="text-zinc-500">{isDe ? 'Prüfungsgebühr (offiziell)' : 'Exam fee (official)'}</p>
            <p className="text-zinc-300">€100–180 (an TÜV/DEKRA zu zahlen)</p>
          </div>
          <div className="space-y-1">
            <p className="text-zinc-500">{isDe ? 'PipingBox-Servicegebühr' : 'PipingBox management fee'}</p>
            <p className="text-[#f59e0b] font-medium">€10 Standard / €15 Express</p>
          </div>
        </div>
      </div>

      <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-5 space-y-3">
        <h4 className="text-xs uppercase tracking-[0.15em] text-zinc-500 font-semibold">
          {isDe ? 'Wie funktioniert die Buchung?' : 'How does booking work?'}
        </h4>
        <ol className="space-y-2 text-xs text-zinc-400">
          <li className="flex gap-2">
            <span className="text-[#f59e0b] font-bold">1.</span>
            {isDe
              ? 'Sie bereiten sich mit dem PipingBox-Kurs vor.'
              : 'You prepare with the PipingBox course.'}
          </li>
          <li className="flex gap-2">
            <span className="text-[#f59e0b] font-bold">2.</span>
            {isDe
              ? 'Sie reichen eine Buchungsanfrage ein (Postleitzahl, Sprache, Datum).'
              : 'You submit a booking request (postal code, language, date).'}
          </li>
          <li className="flex gap-2">
            <span className="text-[#f59e0b] font-bold">3.</span>
            {isDe
              ? 'PipingBox kontaktiert Sie innerhalb von 24–48h zur Bestätigung.'
              : 'PipingBox contacts you within 24–48h to confirm availability.'}
          </li>
          <li className="flex gap-2">
            <span className="text-[#f59e0b] font-bold">4.</span>
            {isDe
              ? 'Sie zahlen die Servicegebühr (€10/€15).'
              : 'You pay the management fee (€10/€15).'}
          </li>
          <li className="flex gap-2">
            <span className="text-[#f59e0b] font-bold">5.</span>
            {isDe
              ? 'PipingBox reserviert Ihren Prüftermin bei TÜV/DEKRA.'
              : 'PipingBox reserves your exam slot at TÜV/DEKRA.'}
          </li>
          <li className="flex gap-2">
            <span className="text-[#f59e0b] font-bold">6.</span>
            {isDe
              ? 'Sie nehmen an der Prüfung teil. Die Prüfstelle stellt das Zertifikat aus.'
              : 'You attend the exam. The exam body issues your certificate.'}
          </li>
        </ol>
        <p className="text-[10px] text-zinc-600 pt-2 border-t border-zinc-800/60">
          {isDe
            ? '⚠️ PipingBox stellt keine SCC-Zertifikate aus. PipingBox bereitet vor und verwaltet die Buchung. Das Zertifikat wird von SCC Stiftung / AUVA über die Prüfstelle ausgestellt.'
            : '⚠️ PipingBox does NOT issue SCC certificates. PipingBox prepares and manages the booking. The certificate is issued by SCC Stiftung / AUVA through the exam body.'}
        </p>
      </div>

      <div className="border border-zinc-800/60 bg-[#0d0d0d] rounded-sm p-4 text-center">
        <p className="text-xs text-zinc-400">
          {isDe
            ? 'Buchungsanfragen für SCC-Prüfungen in Deutschland und Österreich werden in Kürze verfügbar sein.'
            : 'SCC exam booking requests for Germany and Austria will be available soon.'}
        </p>
        <p className="text-[10px] text-zinc-600 mt-1">
          {isDe ? 'Fase 3 — Beta' : 'Fase 3 — Beta'}
        </p>
      </div>
    </div>
  );
}
