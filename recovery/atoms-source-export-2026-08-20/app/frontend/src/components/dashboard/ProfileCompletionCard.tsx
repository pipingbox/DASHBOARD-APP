import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Link } from 'react-router-dom';
import { User, Briefcase, MapPin, FileText, Award, ChevronRight, CheckCircle2, Camera, Building2, Clock, Wrench, Upload, FolderOpen } from 'lucide-react';
import { supabase, TABLES } from '@/lib/supabase';
import {
  calculateProfileCompletion,
  type ProfileCompletionInput,
  type ProfileCompletionResult,
  COMPLETION_THRESHOLDS,
} from '@/lib/profileCompletion';

const ITEM_ICONS: Record<string, React.ReactNode> = {
  photo: <Camera className="h-3.5 w-3.5" />,
  fullName: <User className="h-3.5 w-3.5" />,
  position: <Briefcase className="h-3.5 w-3.5" />,
  company: <Building2 className="h-3.5 w-3.5" />,
  location: <MapPin className="h-3.5 w-3.5" />,
  yearsExperience: <Clock className="h-3.5 w-3.5" />,
  skills: <Wrench className="h-3.5 w-3.5" />,
  bio: <FileText className="h-3.5 w-3.5" />,
  cv: <Upload className="h-3.5 w-3.5" />,
  experience: <Briefcase className="h-3.5 w-3.5" />,
  certification: <Award className="h-3.5 w-3.5" />,
  documents: <FolderOpen className="h-3.5 w-3.5" />,
};

const ITEM_LABELS: Record<string, string> = {
  photo: 'Foto de perfil',
  fullName: 'Nombre completo',
  position: 'Rol / especialidad',
  company: 'Empresa',
  location: 'Ubicación',
  yearsExperience: 'Años de experiencia',
  skills: 'Habilidades',
  bio: 'Biografía',
  cv: 'CV / Documentos',
  experience: 'Experiencia laboral',
  certification: 'Certificaciones',
  documents: 'Documentos',
};

export function ProfileCompletionCard() {
  const { user, profile } = useAuth();
  const [result, setResult] = useState<ProfileCompletionResult | null>(null);

  useEffect(() => {
    if (!user || !profile) return;
    computeCompletion();
  }, [user, profile]);

  const computeCompletion = async () => {
    if (!user || !profile) return;

    // Fetch related record counts
    let experience_count = 0;
    let certification_count = 0;
    let document_count = 0;

    try {
      const [expRes, certRes, docRes] = await Promise.all([
        supabase
          .from(TABLES.workerExperiences)
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id),
        supabase
          .from(TABLES.workerCertifications)
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id),
        supabase
          .from(TABLES.workerDocuments)
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id),
      ]);
      experience_count = expRes.count ?? 0;
      certification_count = certRes.count ?? 0;
      document_count = docRes.error ? 0 : (docRes.count ?? 0);
    } catch {
      // Continue with zeros
    }

    const input: ProfileCompletionInput = {
      avatar_url: profile.avatar_url,
      full_name: profile.full_name,
      title: profile.title,
      company: profile.company,
      location: profile.location,
      years_experience: profile.years_experience,
      skills: profile.skills,
      bio: profile.bio,
      cv_file_url: profile.cv_file_url,
      cv_url: profile.cv_url,
      experience_count,
      certification_count,
      document_count,
    };

    const calculated = calculateProfileCompletion(input);

    console.log("[PROFILE_COMPLETION]", {
      source: "dashboard",
      user_id: user.id,
      calculated: calculated.percentage,
      stored: profile.profile_completion,
    });

    setResult(calculated);

    // Optionally sync back to DB as cached value (non-blocking)
    if (calculated.percentage !== profile.profile_completion) {
      supabase
        .from(TABLES.profiles)
        .update({ profile_completion: calculated.percentage })
        .eq('user_id', user.id)
        .then(() => {});
    }
  };

  if (!profile || !result) return null;

  const completion = result.percentage;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-[#f59e0b]" />
          <h3 className="text-sm font-semibold text-zinc-200">Perfil completado</h3>
        </div>
        <span className="text-xs font-bold text-[#f59e0b]">{completion}%</span>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full rounded-full bg-zinc-800 mb-3">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.min(completion, 100)}%`,
            background:
              completion >= 100
                ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                : completion >= COMPLETION_THRESHOLDS.RECRUITER_READY
                  ? 'linear-gradient(90deg, #f59e0b, #22c55e)'
                  : completion >= COMPLETION_THRESHOLDS.ALMOST_READY
                    ? 'linear-gradient(90deg, #f59e0b, #eab308)'
                    : 'linear-gradient(90deg, #f59e0b, #d97706)',
          }}
        />
      </div>

      {/* Status messages */}
      {completion >= 100 && (
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle2 className="h-4 w-4 text-green-400" />
          <p className="text-xs text-green-400 font-medium">
            ¡Perfil completo!
          </p>
        </div>
      )}
      {completion >= COMPLETION_THRESHOLDS.RECRUITER_READY && completion < 100 && (
        <p className="text-xs text-emerald-400 mb-3">
          ✓ Perfil listo para reclutadores
        </p>
      )}

      {/* Pending items */}
      {result.missingItems.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">
            Completa para mejorar tu visibilidad:
          </p>
          {result.missingItems.slice(0, 4).map((item) => (
            <Link
              key={item.key}
              to="/profile"
              className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 transition group"
            >
              {ITEM_ICONS[item.key] || <User className="h-3.5 w-3.5" />}
              <span className="flex-1">{ITEM_LABELS[item.key] || item.key}</span>
              <span className="text-[9px] text-zinc-600">+{item.weight}%</span>
              <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition" />
            </Link>
          ))}
        </div>
      )}

      {completion >= COMPLETION_THRESHOLDS.MARKETPLACE_MIN && completion < COMPLETION_THRESHOLDS.RECRUITER_READY && (
        <p className="text-[10px] text-emerald-400 mt-2">
          ✓ Tu perfil está visible en el marketplace
        </p>
      )}
    </div>
  );
}