import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Camera,
  User,
  Briefcase,
  Building2,
  MapPin,
  Clock,
  Wrench,
  FileText,
  Upload,
  Award,
  FolderOpen,
  CheckCircle2,
  Circle,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { supabase, TABLES } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import {
  getCompletionStatus,
  type CompletionStatusLevel,
} from '@/lib/profileCompletion';
import { withQueryTimeout } from '@/lib/queryTimeout';

interface CompletenessItem {
  key: string;
  completed: boolean;
  icon: React.ReactNode;
}

function getStatusLevel(percentage: number): CompletionStatusLevel {
  return getCompletionStatus(percentage);
}

export function ProfileCompleteness() {
  const { t } = useTranslation();
  const { user, profile } = useAuth();
  const [items, setItems] = useState<CompletenessItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Read directly from DB-stored value — no local calculation
  const percentage = (profile as Record<string, unknown>)?.profile_completion as number ?? 0;

  useEffect(() => {
    if (!user || !profile) {
      setLoading(false);
      return;
    }
    buildChecklist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile]);

  const buildChecklist = async () => {
    if (!user || !profile) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);

    // Fetch counts only for the checklist display (not for percentage calculation)
    let experienceCount = 0;
    let certificationCount = 0;
    let documentCount = 0;

    try {
      const [expRes, certRes, docRes] = await withQueryTimeout(
        Promise.all([
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
        ])
      );

      experienceCount = expRes.count ?? 0;
      certificationCount = certRes.count ?? 0;
      documentCount = docRes.error ? 0 : (docRes.count ?? 0);
    } catch {
      setError(true);
    }

    const iconMap: Record<string, React.ReactNode> = {
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

    // Simple field checks for checklist (not used for percentage)
    const p = profile as Record<string, unknown>;
    const checklistItems: CompletenessItem[] = [
      { key: 'photo', completed: !!(p.avatar_url), icon: iconMap.photo },
      { key: 'fullName', completed: !!(p.full_name), icon: iconMap.fullName },
      { key: 'position', completed: !!(p.title), icon: iconMap.position },
      { key: 'company', completed: !!(p.company), icon: iconMap.company },
      { key: 'location', completed: !!(p.location), icon: iconMap.location },
      { key: 'yearsExperience', completed: !!(p.years_experience), icon: iconMap.yearsExperience },
      { key: 'skills', completed: Array.isArray(p.skills) ? (p.skills as unknown[]).length > 0 : !!(p.skills), icon: iconMap.skills },
      { key: 'bio', completed: !!(p.bio), icon: iconMap.bio },
      { key: 'cv', completed: !!(p.cv_file_url) || !!(p.cv_url), icon: iconMap.cv },
      { key: 'experience', completed: experienceCount > 0, icon: iconMap.experience },
      { key: 'certification', completed: certificationCount > 0, icon: iconMap.certification },
      { key: 'documents', completed: documentCount > 0, icon: iconMap.documents },
    ];

    setItems(checklistItems);
    setLoading(false);
  };

  const statusLevel = getStatusLevel(percentage);
  const missingItems = items.filter((item) => !item.completed);

  if (loading && (!user || !profile)) return null;

  if (loading) {
    return (
      <div className="border border-zinc-800/80 bg-[#0d0d0d] p-6 animate-pulse">
        <div className="h-4 w-32 bg-zinc-800 rounded mb-3" />
        <div className="h-2 w-full bg-zinc-800 rounded mb-4" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-3 w-48 bg-zinc-800 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-zinc-800/80 bg-[#0d0d0d] p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-zinc-500">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{t('common.loadError', 'Could not load data')}</span>
          </div>
          <button
            type="button"
            onClick={buildChecklist}
            className="flex items-center gap-1.5 text-xs text-[#f59e0b] hover:underline"
          >
            <RefreshCw className="h-3 w-3" />
            {t('common.retry', 'Retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-zinc-800/80 bg-[#0d0d0d] p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">
          {t('profileCompleteness.title')}
        </p>
        <span className="text-lg font-bold text-[#f59e0b]">{percentage}%</span>
      </div>

      {/* Progress bar */}
      <div className="relative h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${percentage}%`,
            background:
              percentage >= 90
                ? 'linear-gradient(90deg, #f59e0b, #22c55e)'
                : percentage >= 70
                  ? 'linear-gradient(90deg, #f59e0b, #eab308)'
                  : percentage >= 40
                    ? '#f59e0b'
                    : '#ef4444',
          }}
        />
      </div>

      {/* Status label */}
      <div className="flex items-center gap-2">
        <span
          className={`text-xs font-medium ${
            statusLevel === 'recruiter_ready'
              ? 'text-green-400'
              : statusLevel === 'almost_ready'
                ? 'text-yellow-400'
                : statusLevel === 'good_start'
                  ? 'text-amber-400'
                  : 'text-red-400'
          }`}
        >
          {t(`profileCompleteness.status.${statusLevel}`)}
        </span>
      </div>

      {/* Motivational message */}
      {percentage < 100 && (
        <p className="text-xs text-zinc-400">
          {t('profileCompleteness.motivation')}
        </p>
      )}
      {percentage >= 100 && (
        <p className="text-xs text-green-400">
          {t('profileCompleteness.complete')}
        </p>
      )}

      {/* Missing items checklist */}
      {missingItems.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-zinc-800/60">
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-2">
            {t('profileCompleteness.missingItems')}
          </p>
          {missingItems.map((item) => (
            <div key={item.key} className="flex items-center gap-2 text-xs text-zinc-400">
              <Circle className="h-3 w-3 text-zinc-600" />
              <span className="flex items-center gap-1.5">
                {item.icon}
                {t(`profileCompleteness.items.${item.key}`)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Completed items (collapsed) */}
      {items.filter((i) => i.completed).length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-zinc-800/60">
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-2">
            {t('profileCompleteness.completedItems')}
          </p>
          {items
            .filter((i) => i.completed)
            .map((item) => (
              <div key={item.key} className="flex items-center gap-2 text-xs text-zinc-500">
                <CheckCircle2 className="h-3 w-3 text-green-500" />
                <span className="flex items-center gap-1.5 line-through opacity-60">
                  {item.icon}
                  {t(`profileCompleteness.items.${item.key}`)}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

/**
 * Compact badge version for CandidateProfile page (company view)
 * Reads profile_completion directly from the database
 */
export function ProfileCompletenessBadge({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const [percentage, setPercentage] = useState<number | null>(null);

  useEffect(() => {
    if (!userId) return;
    fetchCompletion();
  }, [userId]);

  const fetchCompletion = async () => {
    try {
      const { data: profileData } = await supabase
        .from(TABLES.profiles)
        .select('profile_completion')
        .eq('user_id', userId)
        .single();

      if (profileData) {
        setPercentage(profileData.profile_completion ?? 0);
      }
    } catch {
      // Silently fail
    }
  };

  if (percentage === null) return null;

  const statusLevel = getStatusLevel(percentage);
  const colorClass =
    statusLevel === 'recruiter_ready'
      ? 'bg-green-500/10 text-green-400 border-green-500/30'
      : statusLevel === 'almost_ready'
        ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
        : statusLevel === 'good_start'
          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
          : 'bg-red-500/10 text-red-400 border-red-500/30';

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium border rounded ${colorClass}`}
      title={t(`profileCompleteness.status.${statusLevel}`)}
    >
      {percentage}% {t('profileCompleteness.badgeLabel')}
    </span>
  );
}