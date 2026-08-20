import { useState } from 'react';
import { BookOpen, Award, AlertCircle } from 'lucide-react';
import { PRLCourseContent } from '@/components/academy/PRLCourseContent';

/**
 * PRL (Spain) certification page.
 * Public route — no auth required to view course content.
 * Auth required only to save progress or download certificate.
 *
 * Routes: /certificaciones/prl and /academy/prl-course
 * Source: CERTIFICATION_PLATFORM_STRATEGY.md Fase 4, DEC-51
 *
 * PRL is training_based (no exam). PipingBox issues a training-completion
 * certificate when 100% complete. This is different from VCA/SCC (exam_based).
 */
export default function PRLCoursePage() {
  const [activeTab, setActiveTab] = useState<'course' | 'info'>('course');
  const [variant, setVariant] = useState<'Básico' | 'Intermedio'>('Básico');

  return (
    <div className="space-y-6">
      {/* Variant selector */}
      <div className="flex items-center gap-2 border-b border-zinc-800/80">
        {(['Básico', 'Intermedio'] as const).map((v) => (
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
              {v === 'Básico' ? '20h · todos los trabajadores' : '60h · supervisores'}
            </span>
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
          Curso de formación
        </button>
        <button
          onClick={() => setActiveTab('info')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-all ${
            activeTab === 'info'
              ? 'border-[#f59e0b] text-[#f59e0b]'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Award className="h-4 w-4" />
          Certificado y legalidad
        </button>
      </div>

      {activeTab === 'course' ? (
        <PRLCourseContent variant={variant} />
      ) : (
        <PRLInfoTab variant={variant} />
      )}
    </div>
  );
}

function PRLInfoTab({ variant }: { variant: string }) {
  return (
    <div className="space-y-6">
      {/* Key difference: training_based vs exam_based */}
      <div className="border border-green-500/30 bg-green-500/5 rounded-sm p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Award className="h-5 w-5 text-green-400" />
          <h3 className="text-sm font-semibold text-green-400">
            PRL es formación, no examen
          </h3>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">
          A diferencia de VCA (Bélgica/Países Bajos) y SCC (Alemania/Austria), que requieren aprobar un examen
          oficial, <strong className="text-zinc-300">PRL no tiene examen</strong>. El requisito legal español
          (Ley 31/1995) es recibir la formación, no aprobar una prueba.
        </p>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Al completar el 100% de los módulos del curso, PipingBox emite un <strong className="text-zinc-300">certificado
          de formación PRL</strong> que cumple el requisito legal para trabajadores del sector industrial.
        </p>
      </div>

      {/* Legal framework */}
      <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-5 space-y-3">
        <h4 className="text-xs uppercase tracking-[0.15em] text-zinc-500 font-semibold">
          Marco legal
        </h4>
        <div className="grid gap-4 sm:grid-cols-2 text-xs">
          <div className="space-y-1">
            <p className="text-zinc-500">Ley principal</p>
            <p className="text-zinc-300">Ley 31/1995 de Prevención de Riesgos Laborales</p>
          </div>
          <div className="space-y-1">
            <p className="text-zinc-500">Reglamento</p>
            <p className="text-zinc-300">RD 39/1997 (Servicios de Prevención)</p>
          </div>
          <div className="space-y-1">
            <p className="text-zinc-500">Organismo</p>
            <p className="text-zinc-300">INSST (Instituto Nacional de Seguridad y Salud en el Trabajo)</p>
          </div>
          <div className="space-y-1">
            <p className="text-zinc-500">Verificación</p>
            <p className="text-zinc-300">Inspección de Trabajo y Seguridad Social</p>
          </div>
          <div className="space-y-1">
            <p className="text-zinc-500">Duración mínima (Básico)</p>
            <p className="text-zinc-300">20 horas</p>
          </div>
          <div className="space-y-1">
            <p className="text-zinc-500">Duración (Intermedio)</p>
            <p className="text-zinc-300">60 horas</p>
          </div>
        </div>
      </div>

      {/* Comparison with VCA/SCC */}
      <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-5 space-y-3">
        <h4 className="text-xs uppercase tracking-[0.15em] text-zinc-500 font-semibold">
          Comparativa: PRL vs VCA vs SCC
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="text-left py-2 pr-4 font-medium">Dimensión</th>
                <th className="text-left py-2 pr-4 font-medium">PRL (ES)</th>
                <th className="text-left py-2 pr-4 font-medium">VCA (BE/NL)</th>
                <th className="text-left py-2 font-medium">SCC (DE/AT)</th>
              </tr>
            </thead>
            <tbody className="text-zinc-400">
              <tr className="border-b border-zinc-800/60">
                <td className="py-2 pr-4 text-zinc-500">Tipo</td>
                <td className="py-2 pr-4 text-green-400">Formación</td>
                <td className="py-2 pr-4">Examen</td>
                <td className="py-2">Examen</td>
              </tr>
              <tr className="border-b border-zinc-800/60">
                <td className="py-2 pr-4 text-zinc-500">Examen oficial</td>
                <td className="py-2 pr-4">No</td>
                <td className="py-2 pr-4">Sí (40q/60min)</td>
                <td className="py-2">Sí (30-40q/45-60min)</td>
              </tr>
              <tr className="border-b border-zinc-800/60">
                <td className="py-2 pr-4 text-zinc-500">Emite certificado</td>
                <td className="py-2 pr-4">PipingBox (formación)</td>
                <td className="py-2 pr-4">SSVV/BeSaCC</td>
                <td className="py-2">SCC Stiftung/AUVA</td>
              </tr>
              <tr className="border-b border-zinc-800/60">
                <td className="py-2 pr-4 text-zinc-500">Validez</td>
                <td className="py-2 pr-4">Periódico (refresh)</td>
                <td className="py-2 pr-4">10 años</td>
                <td className="py-2">3-5 años</td>
              </tr>
              <tr className="border-b border-zinc-800/60">
                <td className="py-2 pr-4 text-zinc-500">Precio PipingBox</td>
                <td className="py-2 pr-4 text-[#f59e0b]">€29.90</td>
                <td className="py-2 pr-4 text-[#f59e0b]">€59.90</td>
                <td className="py-2 text-[#f59e0b]">€59.90</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 text-zinc-500">Mercado</td>
                <td className="py-2 pr-4">~1.5M trabajadores</td>
                <td className="py-2 pr-4">~500k exámenes/año</td>
                <td className="py-2">~200k exámenes/año</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* What PipingBox is NOT */}
      <div className="border border-[#f59e0b]/30 bg-[#f59e0b]/5 rounded-sm p-5 space-y-2">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-[#f59e0b] shrink-0 mt-0.5" />
          <div className="space-y-2 text-xs text-zinc-400">
            <p>
              <strong className="text-zinc-300">PipingBox NO sustituye:</strong>
            </p>
            <ul className="space-y-1 pl-4">
              <li>• Al servicio de prevención propio o ajeno de tu empresa.</li>
              <li>• A la mutua de accidentes de trabajo (Mutua Universal, Fremap, etc.).</li>
              <li>• A la formación específica que tu empresa debe darte sobre tus riesgos concretos.</li>
              <li>• Al TPC (Trabajos de Prevención en Construcción) si trabajas en construcción.</li>
            </ul>
            <p className="pt-2">
              <strong className="text-zinc-300">PipingBox SÍ cumple</strong> el requisito legal de formación
              PRL Básica de 20 horas para trabajadores, conforme al artículo 19 de la Ley 31/1995.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
