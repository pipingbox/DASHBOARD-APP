import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Shield,
  AlertTriangle,
  Flame,
  Scale,
  Leaf,
  HeartPulse,
  ClipboardList,
  Users,
  Clock,
} from 'lucide-react';

/* ─── SCC Course Content (Official Syllabus) ───
 * Based on official SCC Stiftung syllabus (SCC 2026).
 * 7 content domains per MARKET_GERMANY.md §2.5:
 *   1. Arbeitssicherheit (~30%)
 *   2. Gefahrstoffe (~20%)
 *   3. Brand- und Explosionsschutz (~15%)
 *   4. Gesetzliche Grundlagen (~10%)
 *   5. Umweltschutz (~10%)
 *   6. Erste Hilfe (~10%)
 *   7. Betriebliche Organisation (~5%)
 * Doc 017/018 add: Führung und Verantwortung (supervisor/self-employed).
 *
 * LEGAL: PipingBox prepara al alumno. No emite certificados SCC.
 * El certificado SCC lo emite SCC Stiftung / AUVA a través de organismos
 * examinadores reconocidos (TÜV, DEKRA, etc.).
 *
 * Languages: DE (primary), EN (secondary). AT uses DE.
 * Bilingual content (DE + EN) per I18N_STRATEGY Tier-1/2.
 */

interface SCCModule {
  id: string;
  title: string;
  titleDe: string;
  icon: React.ElementType;
  lessons: { title: string; titleDe: string; duration: string; topics: string[] }[];
  officialRef: string;
  weight: string;
}

const SCC_MODULES: SCCModule[] = [
  {
    id: 'm1-arbeitssicherheit',
    title: 'Module 1: Occupational Safety',
    titleDe: 'Modul 1: Arbeitssicherheit',
    icon: Shield,
    officialRef: 'SCC §1',
    weight: '~30%',
    lessons: [
      {
        title: '1.1 Basics of Occupational Safety',
        titleDe: '1.1 Grundlagen der Arbeitssicherheit',
        duration: '20 min',
        topics: ['ArbSchG (Arbeitsschutzgesetz)', 'Duties of employer and employee', 'Risk assessment (Gefährdungsbeurteilung)', 'Safety culture on industrial sites'],
      },
      {
        title: '1.2 Personal Protective Equipment (PPE)',
        titleDe: '1.2 Persönliche Schutzausrüstung (PSA)',
        duration: '15 min',
        topics: ['Helmet, safety glasses, gloves, safety shoes', 'PPE for welding and cutting', 'Hearing protection', 'Respiratory protection'],
      },
      {
        title: '1.3 Working at Heights',
        titleDe: '1.3 Arbeiten in der Höhe',
        duration: '15 min',
        topics: ['Fall protection (Absturzsicherung)', 'Scaffolding safety', 'Ladders and platforms', 'Harness inspection'],
      },
      {
        title: '1.4 Machine and Tool Safety',
        titleDe: '1.4 Maschinen- und Werkzeugsicherheit',
        duration: '15 min',
        topics: ['GUVMachine directive', 'Guards and emergency stops', 'Hand tool inspection', 'Grinding and cutting safety'],
      },
    ],
  },
  {
    id: 'm2-gefahrstoffe',
    title: 'Module 2: Hazardous Substances',
    titleDe: 'Modul 2: Gefahrstoffe',
    icon: AlertTriangle,
    officialRef: 'SCC §2',
    weight: '~20%',
    lessons: [
      {
        title: '2.1 GHS and Hazard Symbols',
        titleDe: '2.1 GHS und Gefahrensymbole',
        duration: '15 min',
        topics: ['GHS pictograms', 'H and P phrases', 'CLP regulation', 'Safety data sheets (Sicherheitsdatenblatt)'],
      },
      {
        title: '2.2 Asbestos and Silica',
        titleDe: '2.2 Asbest und Silikastaub',
        duration: '15 min',
        topics: ['Asbestos in old piping (critical for pipefitters)', 'Silica dust (quartz)', 'TRGS 519 (asbestos)', 'TRGS 559 (silica)'],
      },
      {
        title: '2.3 Chemical Exposure on Industrial Sites',
        titleDe: '2.3 Chemische Belastung auf Industrieanlagen',
        duration: '15 min',
        topics: ['BASF / Bayer / Ludwigshafen context', 'Chemical plants — specific risks', 'Exposure limits (AGW)', 'Decontamination procedures'],
      },
    ],
  },
  {
    id: 'm3-brandschutz',
    title: 'Module 3: Fire and Explosion Protection',
    titleDe: 'Modul 3: Brand- und Explosionsschutz',
    icon: Flame,
    officialRef: 'SCC §3',
    weight: '~15%',
    lessons: [
      {
        title: '3.1 Fire Classes and Extinguishers',
        titleDe: '3.1 Brandklassen und Feuerlöscher',
        duration: '12 min',
        topics: ['Fire classes A-D', 'Extinguisher types', 'Use on industrial sites', 'Hot work (Schweißarbeiten) permits'],
      },
      {
        title: '3.2 Explosion Protection (Ex)',
        titleDe: '3.2 Explosionsschutz (Ex)',
        duration: '15 min',
        topics: ['ATEX zones (Zone 0/1/2)', 'Explosion-proof equipment', 'Hot work in Ex-zones', 'Permits and gas measurements'],
      },
    ],
  },
  {
    id: 'm4-gesetz',
    title: 'Module 4: Legal Basics',
    titleDe: 'Modul 4: Gesetzliche Grundlagen',
    icon: Scale,
    officialRef: 'SCC §4',
    weight: '~10%',
    lessons: [
      {
        title: '4.1 German Safety Law',
        titleDe: '4.1 Deutsches Arbeitsschutzrecht',
        duration: '15 min',
        topics: ['ArbSchG', 'BetrSichV (Betriebssicherheitsverordnung)', 'DGUV regulations', 'Responsibilities of contractor vs. site owner'],
      },
      {
        title: '4.2 SCC System',
        titleDe: '4.2 Das SCC-System',
        duration: '10 min',
        topics: ['SCC Stiftung governance', 'Doc 016/017/018 differences', 'Validity (3-5 years)', 'Recertification process'],
      },
    ],
  },
  {
    id: 'm5-umweltschutz',
    title: 'Module 5: Environmental Protection',
    titleDe: 'Modul 5: Umweltschutz',
    icon: Leaf,
    officialRef: 'SCC §5',
    weight: '~10%',
    lessons: [
      {
        title: '5.1 Waste and Pollution',
        titleDe: '5.1 Abfälle und Umweltbelastung',
        duration: '15 min',
        topics: ['Waste separation on industrial sites', 'KrWG (Kreislaufwirtschaftsgesetz)', 'Soil and water protection', 'Reporting environmental incidents'],
      },
    ],
  },
  {
    id: 'm6-erste-hilfe',
    title: 'Module 6: First Aid',
    titleDe: 'Modul 6: Erste Hilfe',
    icon: HeartPulse,
    officialRef: 'SCC §6',
    weight: '~10%',
    lessons: [
      {
        title: '6.1 Emergency Response on Industrial Sites',
        titleDe: '6.1 Notfallmaßnahmen auf Industrieanlagen',
        duration: '15 min',
        topics: ['CPR (Herz-Lungen-Wiederbelebung)', 'Severe bleeding', 'Burns (chemical and thermal)', 'Site-specific emergency numbers'],
      },
      {
        title: '6.2 Reporting Accidents',
        titleDe: '6.2 Unfallmeldung',
        duration: '10 min',
        topics: ['BG (Berufsgenossenschaft) reporting', 'Near-miss reporting', 'Documentation requirements', 'Investigation process'],
      },
    ],
  },
  {
    id: 'm7-organisation',
    title: 'Module 7: Organizational Aspects',
    titleDe: 'Modul 7: Betriebliche Organisation',
    icon: ClipboardList,
    officialRef: 'SCC §7',
    weight: '~5%',
    lessons: [
      {
        title: '7.1 Permits and Coordination',
        titleDe: '7.1 Erlaubnisse und Koordination',
        duration: '15 min',
        topics: ['Work permits (Arbeitserlaubnis)', 'Permit-to-work systems', 'Coordination with site owner', 'Briefings (Unterweisung)'],
      },
    ],
  },
  {
    id: 'm8-fuehrung',
    title: 'Module 8: Leadership & Responsibility (Doc 017/018 only)',
    titleDe: 'Modul 8: Führung und Verantwortung (nur Doc 017/018)',
    icon: Users,
    officialRef: 'SCC §8 (Supervisor)',
    weight: 'Doc 017/018',
    lessons: [
      {
        title: '8.1 Supervisor Duties',
        titleDe: '8.1 Führungskräftepflichten',
        duration: '20 min',
        topics: ['Delegating tasks safely', 'Instruction and supervision', 'Documentation for supervisors', 'Liability (Führungshaftung)'],
      },
      {
        title: '8.2 Self-Employed Contractor Obligations',
        titleDe: '8.2 Pflichten selbstständiger Unternehmer',
        duration: '15 min',
        topics: ['Doc 018 specific', 'Risk assessment as self-employed', 'Insurance (Berufshaftpflicht)', 'Coordination with general contractor'],
      },
    ],
  },
];

interface SCCCourseContentProps {
  variant?: 'Doc 016' | 'Doc 017' | 'Doc 018';
  showLanguage?: 'de' | 'en';
}

export function SCCCourseContent({ variant = 'Doc 016', showLanguage = 'de' }: SCCCourseContentProps) {
  const { t } = useTranslation();
  const [expandedModule, setExpandedModule] = useState<string | null>('m1-arbeitssicherheit');

  // Doc 016 (operative) sees modules 1-7. Doc 017/018 see modules 1-8.
  const visibleModules = variant === 'Doc 016'
    ? SCC_MODULES.filter((m) => m.id !== 'm8-fuehrung')
    : SCC_MODULES;

  const totalLessons = visibleModules.reduce((sum, m) => sum + m.lessons.length, 0);
  const totalMinutes = visibleModules.reduce(
    (sum, m) => sum + m.lessons.reduce((s, l) => s + parseInt(l.duration), 0),
    0,
  );

  const isDe = showLanguage === 'de';
  const variantLabel = variant === 'Doc 016'
    ? (isDe ? 'Operative Mitarbeiter' : 'Operative employees')
    : variant === 'Doc 017'
      ? (isDe ? 'Führungskraft' : 'Supervisor')
      : (isDe ? 'Selbstständige' : 'Self-employed');

  return (
    <div className="space-y-6">
      {/* Course header */}
      <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20 rounded-sm">
                SCC 2026
              </span>
              <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-sm">
                {isDe ? 'Offizieller Lehrplan' : 'Official Syllabus'}
              </span>
              <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-zinc-800/60 text-zinc-400 rounded-sm">
                {variant}
              </span>
            </div>
            <h2 className="text-lg font-bold text-zinc-100">
              {isDe ? 'SCC Vorbereitungskurs' : 'SCC Preparation Course'}
            </h2>
            <p className="text-xs text-zinc-500">
              {totalLessons} {isDe ? 'Lektionen' : 'lessons'} · {totalMinutes} min ·{' '}
              {visibleModules.length} {isDe ? 'Module' : 'modules'} · {variantLabel}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-[#f59e0b]">€59.90</p>
            <p className="text-[10px] text-zinc-600">
              {isDe ? 'einmalig · DE + EN' : 'one-time · DE + EN'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {['DE', 'EN'].map((lang) => (
            <span key={lang} className="px-2 py-0.5 text-[10px] bg-zinc-800/60 text-zinc-400 rounded-sm">{lang}</span>
          ))}
        </div>

        <div className="border-t border-zinc-800 pt-3">
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            <strong className="text-zinc-400">
              {isDe ? 'Rechtlicher Hinweis:' : 'Legal notice:'}
            </strong>{' '}
            {isDe
              ? 'PipingBox bereitet Sie auf die SCC-Prüfung vor. Das offizielle SCC-Zertifikat wird von der SCC Stiftung (bzw. AUVA in Österreich) durch anerkannte Prüfstellen wie TÜV oder DEKRA ausgestellt. PipingBox ist ein unabhängiger Vorbereitungsanbieter und nicht mit der SCC Stiftung verbunden.'
              : 'PipingBox prepares you for the SCC exam. The official SCC certificate is issued by SCC Stiftung (or AUVA in Austria) through recognized exam bodies such as TÜV or DEKRA. PipingBox is an independent preparation provider, not affiliated with SCC Stiftung.'}
          </p>
        </div>
      </div>

      {/* Modules */}
      <div className="space-y-2">
        {visibleModules.map((module) => {
          const Icon = module.icon;
          const isExpanded = expandedModule === module.id;
          return (
            <div
              key={module.id}
              className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm overflow-hidden"
            >
              <button
                onClick={() => setExpandedModule(isExpanded ? null : module.id)}
                className="w-full flex items-center gap-3 p-4 hover:bg-zinc-900/50 transition-colors"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-[#f59e0b]/10 border border-[#f59e0b]/20">
                  <Icon className="h-4 w-4 text-[#f59e0b]" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-zinc-200">
                    {isDe ? module.titleDe : module.title}
                  </p>
                  <p className="text-[10px] text-zinc-500">
                    {module.lessons.length} {isDe ? 'Lektionen' : 'lessons'} ·{' '}
                    {module.lessons.reduce((s, l) => s + parseInt(l.duration), 0)} min ·{' '}
                    {module.officialRef} · {module.weight}
                  </p>
                </div>
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-zinc-500" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-zinc-500" />
                )}
              </button>

              {isExpanded && (
                <div className="border-t border-zinc-800/60 p-4 space-y-3">
                  {module.lessons.map((lesson, idx) => (
                    <div key={idx} className="flex items-start gap-3 group">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-zinc-700 text-[10px] text-zinc-500">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-zinc-300">
                            {isDe ? lesson.titleDe : lesson.title}
                          </p>
                          <span className="flex items-center gap-1 text-[10px] text-zinc-600">
                            <Clock className="h-3 w-3" />
                            {lesson.duration}
                          </span>
                        </div>
                        <ul className="space-y-0.5">
                          {lesson.topics.map((topic, ti) => (
                            <li key={ti} className="flex items-start gap-1.5 text-[11px] text-zinc-500">
                              <CheckCircle2 className="h-3 w-3 text-zinc-700 shrink-0 mt-0.5" />
                              {topic}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Exam simulator teaser */}
      <div className="border border-[#f59e0b]/30 bg-[#f59e0b]/5 rounded-sm p-5 text-center space-y-3">
        <BookOpen className="h-8 w-8 text-[#f59e0b] mx-auto" />
        <h3 className="text-sm font-semibold text-zinc-200">
          {isDe ? 'SCC Prüfungssimulator — 180 Fragen' : 'SCC Exam Simulator — 180 Questions'}
        </h3>
        <p className="text-xs text-zinc-400 max-w-md mx-auto">
          {isDe
            ? 'Üben Sie mit echten SCC-Prüfungsfragen. Timer, sofortiges Feedback und detaillierte Erklärungen. Im Kurs enthalten.'
            : 'Practice with real-style SCC exam questions. Timer, instant feedback, and detailed explanations. Included with the course.'}
        </p>
        <div className="flex items-center justify-center gap-2 text-[10px] text-zinc-600">
          <span className="px-2 py-0.5 bg-zinc-800/60 rounded-sm">
            {isDe ? '30 Fragen (Doc 016)' : '30 questions (Doc 016)'}
          </span>
          <span className="px-2 py-0.5 bg-zinc-800/60 rounded-sm">
            {isDe ? '40 Fragen (Doc 017/018)' : '40 questions (Doc 017/018)'}
          </span>
          <span className="px-2 py-0.5 bg-zinc-800/60 rounded-sm">
            {isDe ? 'Sofortige Auswertung' : 'Instant scoring'}
          </span>
        </div>
      </div>
    </div>
  );
}
