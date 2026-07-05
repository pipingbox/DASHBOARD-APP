import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Scale,
  AlertTriangle,
  Factory,
  ShieldCheck,
  HeartPulse,
  Users,
  ClipboardList,
  Search,
  Clock,
  Award,
} from 'lucide-react';

/* ─── PRL Course Content (Official Syllabus) ───
 * Based on Ley 31/1995 de Prevención de Riesgos Laborales + RD 39/1997.
 *
 * PRL es training_based (no exam_based como VCA/SCC).
 * PipingBox emite un certificado de formación al completar el 100%.
 * No hay examen oficial — la formación es el requisito legal.
 *
 * LEGAL: PipingBox proporciona formación PRL. El cumplimiento legal
 * lo verifica la Inspección de Trabajo. PipingBox no sustituye a la
 * mutua ni al servicio de prevención ajeno de la empresa.
 *
 * Languages: ES (mercado España).
 * PRL Básico: 5 módulos × 4h = 20h (Ley 31/1995 mínimo).
 * PRL Intermedio: 8 módulos = 60h (supervisores, técnicos).
 */

interface PRLModule {
  id: string;
  title: string;
  icon: React.ElementType;
  lessons: { title: string; duration: string; topics: string[] }[];
  officialRef: string;
  hours: string;
}

const PRL_BASICO_MODULES: PRLModule[] = [
  {
    id: 'm1-conceptos',
    title: 'Módulo 1: Conceptos básicos y marco normativo',
    icon: Scale,
    officialRef: 'Ley 31/1995 §1',
    hours: '4 horas',
    lessons: [
      {
        title: '1.1 Concepto de trabajo y de salud',
        duration: '45 min',
        topics: ['Definición de trabajo', 'Definición de salud (OMS)', 'Trabajo y salud: relación', 'Daños derivados del trabajo'],
      },
      {
        title: '1.2 Marco normativo',
        duration: '60 min',
        topics: ['Ley 31/1995 de Prevención de Riesgos Laborales', 'RD 39/1997 Reglamento de los Servicios de Prevención', 'Directivas marco de la UE (89/391/CEE)', 'Obligaciones del empresario y del trabajador'],
      },
      {
        title: '1.3 Organización de la prevención',
        duration: '45 min',
        topics: ['Servicios de prevención propios y ajenos', 'Delegados de prevención', 'Comité de Seguridad y Salud', 'Mutuas de accidentes de trabajo'],
      },
      {
        title: '1.4 Riesgo profesional y daño',
        duration: '30 min',
        topics: ['Concepto de riesgo profesional', 'Factor de riesgo', 'Daño: accidente vs enfermedad profesional', 'Enfermedades profesionales (RD 1299/2006)'],
      },
    ],
  },
  {
    id: 'm2-riesgos-generales',
    title: 'Módulo 2: Riesgos generales',
    icon: AlertTriangle,
    officialRef: 'RD 39/1997 §2',
    hours: '4 horas',
    lessons: [
      {
        title: '2.1 Caídas y atrapamientos',
        duration: '45 min',
        topics: ['Caídas al mismo nivel', 'Caídas a distinto nivel', 'Atrapamientos por máquinas', 'Prevención en trabajos en altura'],
      },
      {
        title: '2.2 Riesgo eléctrico',
        duration: '45 min',
        topics: ['Contacto directo e indirecto', 'Zonas de riesgo eléctrico (BA4/BA5)', 'Trabajos en proximidad', 'Locales húmedos y conductores'],
      },
      {
        title: '2.3 Riesgo químico',
        duration: '45 min',
        topics: ['Vías de entrada (inhalación, dérmica, ingestión)', 'Productos químicos peligrosos', 'Frases H y P (CLP)', 'Fichas de datos de seguridad'],
      },
      {
        title: '2.4 Riesgo de incendio',
        duration: '45 min',
        topics: ['Triángulo del fuego', 'Clases de fuego (A, B, C, D, K)', 'Extintores portátiles', 'Plan de evacuación'],
      },
    ],
  },
  {
    id: 'm3-sector-industrial',
    title: 'Módulo 3: Riesgos específicos del sector industrial',
    icon: Factory,
    officialRef: 'RD 39/1997 §3',
    hours: '4 horas',
    lessons: [
      {
        title: '3.1 Soldadura y oxicorte',
        duration: '60 min',
        topics: ['Riesgos de soldadura eléctrica (SMAW, GMAW, GTAW)', 'Humos de soldadura (manganeso, níquel, cromo VI)', 'Radiación UV/IR', 'Oxicorte: riesgo de incendio y explosión', 'Permiso de trabajo en caliente'],
      },
      {
        title: '3.2 Trabajos con tuberías industriales',
        duration: '60 min',
        topics: ['Espacios confinados (RD 681/2003)', 'Izaje de cargas (grúas, polipastos)', 'Trabajos a presión', 'Etiquetado y bloqueo (LOTO)'],
      },
      {
        title: '3.3 Espacios confinados',
        duration: '60 min',
        topics: ['Definición y ejemplos (tanques, tuberías, pozos)', 'Atmósferas peligrosas (O2, H2S, CO, LEL)', 'Permisos de entrada', 'Vigilante y equipo de rescate', 'Ventilación y medición de gases'],
      },
    ],
  },
  {
    id: 'm4-preventivas',
    title: 'Módulo 4: Medidas preventivas y EPIs',
    icon: ShieldCheck,
    officialRef: 'RD 39/1997 §4',
    hours: '4 horas',
    lessons: [
      {
        title: '4.1 EPIs (Equipos de Protección Individual)',
        duration: '60 min',
        topics: ['Clases de EPI (categoría I, II, III)', 'Casco, gafas, guantes, calzado', 'Protectores auditivos', 'Mascarillas (FFP1/2/3)', 'Arnés anticaída'],
      },
      {
        title: '4.2 Señalización de seguridad',
        duration: '45 min',
        topics: ['Señales de prohibición (rojo)', 'Advertencia (amarillo)', 'Obligación (azul)', 'Salvamento o socorro (verde)', 'Señalización de tuberías (RD 485/1997)'],
      },
      {
        title: '4.3 LOTO (Lockout/Tagout)',
        duration: '45 min',
        topics: ['Bloqueo de energías', 'Etiquetado', 'Procedimiento LOTO paso a paso', 'Aplicación en válvulas y bombas'],
      },
      {
        title: '4.4 Permisos de trabajo',
        duration: '30 min',
        topics: ['Permiso de trabajo en caliente', 'Permiso de espacios confinados', 'Permiso de trabajo en altura', 'Permiso de trabajo eléctrico'],
      },
    ],
  },
  {
    id: '5-primeros-auxilios',
    title: 'Módulo 5: Primeros auxilios y emergencias',
    icon: HeartPulse,
    officialRef: 'RD 39/1997 §5',
    hours: '4 horas',
    lessons: [
      {
        title: '5.1 RCP (Reanimación Cardiopulmonar)',
        duration: '60 min',
        topics: ['Cadena de supervivencia', 'Compresiones torácicas (30:2)', 'Uso de DEA (desfibrilador)', 'Posición lateral de seguridad'],
      },
      {
        title: '5.2 Hemorragias y heridas',
        duration: '45 min',
        topics: ['Hemorragias externas', 'Compresión directa', 'Torniquete (cuándo usarlo)', 'Heridas y quemaduras'],
      },
      {
        title: '5.3 Quemaduras químicas y térmicas',
        duration: '45 min',
        topics: ['Clasificación de quemaduras (1º, 2º, 3º grado)', 'Quemaduras químicas (ducha de emergencia)', 'Tratamiento de primeros auxilios', 'Evacuación'],
      },
      {
        title: '5.4 Plan de autoprotección y emergencias',
        duration: '30 min',
        topics: ['Plan de autoprotección (RD 393/2007)', 'Simulacros', 'Puntos de encuentro', 'Equipos de primera intervención (EPI)'],
      },
    ],
  },
];

const PRL_INTERMEDIO_EXTRA_MODULES: PRLModule[] = [
  {
    id: 'm6-gestion',
    title: 'Módulo 6: Gestión de la prevención',
    icon: ClipboardList,
    officialRef: 'RD 39/1997 §6',
    hours: '8 horas',
    lessons: [
      {
        title: '6.1 Evaluación de riesgos',
        duration: '90 min',
        topics: ['Metodología de evaluación', 'Identificación, estimación, valoración', 'Documentación', 'Revisiones'],
      },
      {
        title: '6.2 Planificación de la prevención',
        duration: '90 min',
        topics: ['Plan de prevención', 'Medidas preventivas', 'Plazos y responsables', 'Seguimiento'],
      },
      {
        title: '6.3 Investigación de accidentes',
        duration: '60 min',
        topics: ['Árbol de causas', 'Recogida de información', 'Análisis de causas', 'Medidas correctoras'],
      },
    ],
  },
  {
    id: 'm7-auditorias',
    title: 'Módulo 7: Auditorías e inspecciones',
    icon: Search,
    officialRef: 'RD 39/1997 §7',
    hours: '6 horas',
    lessons: [
      {
        title: '7.1 Auditorías del sistema de prevención',
        duration: '90 min',
        topics: ['Objeto de la auditoría', 'Auditoría reglamentaria', 'Auditoría voluntaria', 'Informe de auditoría'],
      },
      {
        title: '7.2 Inspecciones de seguridad',
        duration: '90 min',
        topics: ['Inspecciones programadas', 'Inspecciones de lugares de trabajo', 'Inspecciones de equipos', 'Partes de inspección'],
      },
    ],
  },
  {
    id: 'm8-cae',
    title: 'Módulo 8: Coordinación de actividades empresariales (CAE)',
    icon: Users,
    officialRef: 'RD 171/2004',
    hours: '6 horas',
    lessons: [
      {
        title: '8.1 Obligaciones del contratante',
        duration: '90 min',
        topics: ['RD 171/2004', 'Verificación de la prevención del contratista', 'Información sobre riesgos', 'Coordinador de actividades'],
      },
      {
        title: '8.2 Obligaciones del contratista',
        duration: '90 min',
        topics: ['Cumplimiento de normas del centro', 'Información a los trabajadores', 'Subcontratación', 'Libro de subcontratación (sector construcción)'],
      },
    ],
  },
];

interface PRLCourseContentProps {
  variant?: 'Básico' | 'Intermedio';
}

export function PRLCourseContent({ variant = 'Básico' }: PRLCourseContentProps) {
  const { t } = useTranslation();
  const [expandedModule, setExpandedModule] = useState<string | null>('m1-conceptos');

  const visibleModules = variant === 'Básico'
    ? PRL_BASICO_MODULES
    : [...PRL_BASICO_MODULES, ...PRL_INTERMEDIO_EXTRA_MODULES];

  const totalLessons = visibleModules.reduce((sum, m) => sum + m.lessons.length, 0);
  const totalMinutes = visibleModules.reduce(
    (sum, m) => sum + m.lessons.reduce((s, l) => s + parseInt(l.duration), 0),
    0,
  );
  const totalHours = (totalMinutes / 60).toFixed(1);
  const price = variant === 'Básico' ? '€29.90' : '€89.90';

  return (
    <div className="space-y-6">
      {/* Course header */}
      <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20 rounded-sm">
                PRL 2026
              </span>
              <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-sm">
                Formación oficial
              </span>
              <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-green-500/10 text-green-400 border border-green-500/20 rounded-sm">
                {variant === 'Básico' ? '20h' : '60h'}
              </span>
            </div>
            <h2 className="text-lg font-bold text-zinc-100">
              PRL {variant} — Prevención de Riesgos Laborales
            </h2>
            <p className="text-xs text-zinc-500">
              {totalLessons} lecciones · {totalHours}h · {visibleModules.length} módulos · Ley 31/1995
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-[#f59e0b]">{price}</p>
            <p className="text-[10px] text-zinc-600">pago único · ES</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="px-2 py-0.5 text-[10px] bg-zinc-800/60 text-zinc-400 rounded-sm">ES</span>
        </div>

        <div className="border-t border-zinc-800 pt-3 space-y-2">
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            <strong className="text-zinc-400">Aviso legal:</strong> PipingBox proporciona formación PRL conforme a la
            Ley 31/1995 de Prevención de Riesgos Laborales y el RD 39/1997. PipingBox no sustituye al servicio de
            prevención propio o ajeno de la empresa, ni a la mutua de accidentes de trabajo. La verificación del
            cumplimiento legal corresponde a la Inspección de Trabajo y Seguridad Social.
          </p>
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            <strong className="text-zinc-400">Tipo de certificación:</strong> Basada en formación (sin examen).
            Al completar el 100% del curso, PipingBox emite un <strong className="text-zinc-300">certificado de formación</strong>{' '}
            que cumple el requisito legal de formación PRL para trabajadores.
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
                  <p className="text-sm font-medium text-zinc-200">{module.title}</p>
                  <p className="text-[10px] text-zinc-500">
                    {module.lessons.length} lecciones · {module.hours} · {module.officialRef}
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

      {/* Training completion certificate teaser */}
      <div className="border border-green-500/30 bg-green-500/5 rounded-sm p-5 text-center space-y-3">
        <Award className="h-8 w-8 text-green-400 mx-auto" />
        <h3 className="text-sm font-semibold text-green-400">
          Certificado de formación — Sin examen
        </h3>
        <p className="text-xs text-zinc-400 max-w-md mx-auto">
          A diferencia de VCA y SCC, PRL no tiene examen oficial. La formación es el requisito legal.
          Al completar el 100% de los módulos, PipingBox emite un certificado de formación que cumple
          el requisito de la Ley 31/1995 para trabajadores.
        </p>
        <div className="flex items-center justify-center gap-2 text-[10px] text-zinc-600">
          <span className="px-2 py-0.5 bg-zinc-800/60 rounded-sm">Cumple Ley 31/1995</span>
          <span className="px-2 py-0.5 bg-zinc-800/60 rounded-sm">20h formación</span>
          <span className="px-2 py-0.5 bg-zinc-800/60 rounded-sm">Certificado descargable</span>
        </div>
      </div>
    </div>
  );
}
