import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Shield,
  AlertTriangle,
  HardHat,
  Flame,
  Zap,
  Wind,
  Droplets,
  Eye,
  ClipboardList,
  Clock,
} from 'lucide-react';

/* ─── VCA Course Content (Official Syllabus) ───
 * Based on official VCA/BESACC/SSVV syllabus.
 * Updated to VCA 2026.
 * Modules traceable to official criteria.
 *
 * LEGAL: PipingBox prepara al alumno. No emite certificados VCA.
 * The VCA certificate is issued by SSVV/BESACC through recognized exam centers.
 *
 * Languages: ES, PT, EN, NL (this component serves structured content;
 * actual lesson text will be stored in Supabase per-language in Fase 2).
 */

interface VCAModule {
  id: string;
  title: string;
  icon: React.ElementType;
  lessons: { title: string; duration: string; topics: string[] }[];
  officialRef: string;
}

const VCA_MODULES: VCAModule[] = [
  {
    id: 'm1-legal',
    title: 'Module 1: Legislation and Regulations',
    icon: Shield,
    officialRef: 'VCA 2026 §1',
    lessons: [
      {
        title: '1.1 Belgian and EU Safety Law',
        duration: '15 min',
        topics: ['Codex over Welzijn op het Werk', 'EU Framework Directive 89/391/EEC', 'Worker rights and obligations', 'Employer responsibilities'],
      },
      {
        title: '1.2 VCA System and Certification',
        duration: '10 min',
        topics: ['What is VCA?', 'B-VCA vs VOL-VCA', 'Validity (10 years)', 'SSVV/BESACC governance'],
      },
      {
        title: '1.3 ARAB and CODELCO',
        duration: '12 min',
        topics: ['Algemeen Reglement voor de Arbeidsbescherming', 'Commissie voor Welzijn op het Werk', 'Reporting accidents'],
      },
    ],
  },
  {
    id: 'm2-risk',
    title: 'Module 2: Risk Analysis and Prevention',
    icon: AlertTriangle,
    officialRef: 'VCA 2026 §2',
    lessons: [
      {
        title: '2.1 Risk Identification',
        duration: '20 min',
        topics: ['What is a risk?', 'Hazard vs risk', 'Risk matrix', 'Job Safety Analysis (JSA)'],
      },
      {
        title: '2.2 Hierarchy of Controls',
        duration: '15 min',
        topics: ['Elimination', 'Substitution', 'Engineering controls', 'Organizational measures', 'PPE (last resort)'],
      },
      {
        title: '2.3 Permit-to-Work System',
        duration: '12 min',
        topics: ['Hot work permit', 'Confined space permit', 'Lockout/Tagout (LOTO)', 'Height work permit'],
      },
    ],
  },
  {
    id: 'm3-ppe',
    title: 'Module 3: Personal Protective Equipment',
    icon: HardHat,
    officialRef: 'VCA 2026 §3',
    lessons: [
      {
        title: '3.1 Mandatory PPE on Industrial Sites',
        duration: '10 min',
        topics: ['Hard hat (EN 397)', 'Safety glasses (EN 166)', 'Safety shoes (EN ISO 20345)', 'Hi-vis vest (EN 20471)', 'Gloves (EN 388)'],
      },
      {
        title: '3.2 Respiratory Protection',
        duration: '15 min',
        topics: ['FFP1/FFP2/FFP3 masks', 'Half-face and full-face masks', 'SCBA for confined spaces', 'Filter selection (A, B, E, K, P)'],
      },
      {
        title: '3.3 Hearing and Fall Protection',
        duration: '10 min',
        topics: ['Earplugs vs earmuffs (SNR rating)', 'Harness (EN 361)', 'Lanyards and lifelines', 'Anchor points (EN 795)'],
      },
    ],
  },
  {
    id: 'm4-fire',
    title: 'Module 4: Fire and Explosion Safety',
    icon: Flame,
    officialRef: 'VCA 2026 §4',
    lessons: [
      {
        title: '4.1 Fire Triangle and Classes',
        duration: '12 min',
        topics: ['Fire triangle (heat, fuel, oxygen)', 'Classes A/B/C/D/F', 'Extinguisher types (water, foam, CO2, powder)', 'PASS method'],
      },
      {
        title: '4.2 ATEX Zones',
        duration: '15 min',
        topics: ['Zone 0/1/2 (gas)', 'Zone 20/21/22 (dust)', 'Equipment categories (1/2/3)', 'Hot work in ATEX zones'],
      },
      {
        title: '4.3 Evacuation Procedures',
        duration: '10 min',
        topics: ['Alarm signals', 'Evacuation routes', 'Assembly points', 'Muster roll call'],
      },
    ],
  },
  {
    id: 'm5-electrical',
    title: 'Module 5: Electrical Safety',
    icon: Zap,
    officialRef: 'VCA 2026 §5',
    lessons: [
      {
        title: '5.1 Electrical Hazards',
        duration: '15 min',
        topics: ['Electric shock', 'Arc flash', 'Step potential', 'BA4/BA5 authorization levels'],
      },
      {
        title: '5.2 Lockout/Tagout (LOTO)',
        duration: '12 min',
        topics: ['6-step LOTO procedure', 'Energy isolation', 'Verification of zero energy', 'Group lockout'],
      },
    ],
  },
  {
    id: 'm6-height',
    title: 'Module 6: Working at Height',
    icon: Wind,
    officialRef: 'VCA 2026 §6',
    lessons: [
      {
        title: '6.1 Fall Hazards and Prevention',
        duration: '15 min',
        topics: ['Definition (>2m)', 'Guardrails and toe boards', 'Safety nets', 'Fall arrest systems'],
      },
      {
        title: '6.2 Scaffolding Safety',
        duration: '12 min',
        topics: ['Scaffold tags (green/red/yellow)', 'Inspection requirements', 'Load classes', 'Competent person'],
      },
    ],
  },
  {
    id: 'm7-chemical',
    title: 'Module 7: Hazardous Substances',
    icon: Droplets,
    officialRef: 'VCA 2026 §7',
    lessons: [
      {
        title: '7.1 CLP/GHS Classification',
        duration: '15 min',
        topics: ['Hazard pictograms', 'H-statements and P-statements', 'Signal words (Danger/Warning)', 'Safety data sheets (SDS)'],
      },
      {
        title: '7.2 Asbestos and Silica',
        duration: '12 min',
        topics: ['Asbestos types (white/brown/blue)', 'REACH regulation', 'Silica dust (RESPIRE-SILICE)', 'Exposure limits'],
      },
    ],
  },
  {
    id: 'm8-ergonomics',
    title: 'Module 8: Ergonomics and Manual Handling',
    icon: Eye,
    officialRef: 'VCA 2026 §8',
    lessons: [
      {
        title: '8.1 Lifting Techniques',
        duration: '10 min',
        topics: ['Correct lifting posture', 'Team lifting', 'Mechanical aids', 'Weight limits (25kg men / 12.5kg women)'],
      },
      {
        title: '8.2 Screen Work and Posture',
        duration: '8 min',
        topics: ['Screen distance', 'Chair adjustment', 'Breaks (5 min/hour)', 'Eye strain prevention'],
      },
    ],
  },
  {
    id: 'm9-accidents',
    title: 'Module 9: Accidents and First Aid',
    icon: ClipboardList,
    officialRef: 'VCA 2026 §9',
    lessons: [
      {
        title: '9.1 Accident Reporting',
        duration: '12 min',
        topics: ['Near-miss reporting', 'Accident investigation', 'Root cause analysis', 'Corrective actions'],
      },
      {
        title: '9.2 Basic First Aid',
        duration: '15 min',
        topics: ['DRABC protocol', 'CPR (30:2)', 'Recovery position', 'Bleeding control', 'Burn treatment', 'Eye wash'],
      },
    ],
  },
];

export function VCACourseContent() {
  const { t } = useTranslation();
  const [expandedModule, setExpandedModule] = useState<string | null>('m1-legal');

  const totalLessons = VCA_MODULES.reduce((sum, m) => sum + m.lessons.length, 0);
  const totalMinutes = VCA_MODULES.reduce(
    (sum, m) => sum + m.lessons.reduce((s, l) => s + parseInt(l.duration), 0),
    0,
  );

  return (
    <div className="space-y-6">
      {/* Course header */}
      <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20 rounded-sm">
                VCA 2026
              </span>
              <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-sm">
                Official Syllabus
              </span>
            </div>
            <h2 className="text-lg font-bold text-zinc-100">VCA Preparation Course</h2>
            <p className="text-xs text-zinc-500">
              {totalLessons} lessons · {totalMinutes} min · 9 modules · B-VCA & VOL-VCA
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-[#f59e0b]">€59.90</p>
            <p className="text-[10px] text-zinc-600">one-time · all languages</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {['ES', 'PT', 'EN', 'NL'].map((lang) => (
            <span key={lang} className="px-2 py-0.5 text-[10px] bg-zinc-800/60 text-zinc-400 rounded-sm">{lang}</span>
          ))}
        </div>

        <div className="border-t border-zinc-800 pt-3">
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            <strong className="text-zinc-400">Legal notice:</strong> PipingBox prepares you for the VCA exam.
            The official VCA certificate is issued by SSVV/BESACC through recognized exam centers.
            PipingBox is an independent preparation provider, not affiliated with SSVV/BESACC.
          </p>
        </div>
      </div>

      {/* Modules */}
      <div className="space-y-2">
        {VCA_MODULES.map((module) => {
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
                  <p className="text-sm font-medium text-zinc-200">{module.title}</p>
                  <p className="text-[10px] text-zinc-500">
                    {module.lessons.length} lessons · {module.lessons.reduce((s, l) => s + parseInt(l.duration), 0)} min · {module.officialRef}
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
                          <p className="text-xs font-medium text-zinc-300">{lesson.title}</p>
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
        <h3 className="text-sm font-semibold text-zinc-200">VCA Exam Simulator — 252 Questions</h3>
        <p className="text-xs text-zinc-400 max-w-md mx-auto">
          Practice with real-style VCA exam questions. Timer, instant feedback, and detailed explanations
          for foreign workers. Included with the course.
        </p>
        <div className="flex items-center justify-center gap-2 text-[10px] text-zinc-600">
          <span className="px-2 py-0.5 bg-zinc-800/60 rounded-sm">40 questions (B-VCA)</span>
          <span className="px-2 py-0.5 bg-zinc-800/60 rounded-sm">70 questions (VOL-VCA)</span>
          <span className="px-2 py-0.5 bg-zinc-800/60 rounded-sm">Instant scoring</span>
        </div>
      </div>
    </div>
  );
}
