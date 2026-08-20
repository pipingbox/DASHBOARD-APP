import { useAuth } from '@/hooks/useAuth';
import { Link } from 'react-router-dom';
import { User, Briefcase, MapPin, FileText, Award, ChevronRight } from 'lucide-react';

interface CompletionItem {
  label: string;
  done: boolean;
  icon: React.ReactNode;
  link: string;
}

export function ProfileCompletionCard() {
  const { profile } = useAuth();

  if (!profile) return null;

  // Read directly from DB-stored value — no local calculation
  const completion = (profile as Record<string, unknown>).profile_completion as number ?? 0;

  // Don't show if profile is fully complete
  if (completion >= 90) return null;

  // Build pending items from profile fields (simple field checks, no calculation)
  const pendingItems: CompletionItem[] = [
    {
      label: 'Rol / especialidad',
      done: !!(profile as Record<string, unknown>).title,
      icon: <Briefcase className="h-3.5 w-3.5" />,
      link: '/profile',
    },
    {
      label: 'Ubicación',
      done: !!(profile as Record<string, unknown>).location,
      icon: <MapPin className="h-3.5 w-3.5" />,
      link: '/profile',
    },
    {
      label: 'CV / Documentos',
      done: !!(profile.cv_file_url) || !!(profile.cv_url),
      icon: <FileText className="h-3.5 w-3.5" />,
      link: '/profile',
    },
    {
      label: 'Certificaciones',
      done: false, // We don't query here — just show as suggestion
      icon: <Award className="h-3.5 w-3.5" />,
      link: '/profile',
    },
  ].filter((i) => !i.done);

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
          className="h-full rounded-full bg-gradient-to-r from-[#f59e0b] to-[#d97706] transition-all duration-500"
          style={{ width: `${Math.min(completion, 100)}%` }}
        />
      </div>

      {/* Pending items */}
      {pendingItems.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">
            Completa para mejorar tu visibilidad:
          </p>
          {pendingItems.slice(0, 3).map((item) => (
            <Link
              key={item.label}
              to={item.link}
              className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 transition group"
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
              <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition" />
            </Link>
          ))}
        </div>
      )}

      {completion >= 30 && (
        <p className="text-[10px] text-emerald-400 mt-2">
          ✓ Tu perfil está visible en el marketplace
        </p>
      )}
    </div>
  );
}