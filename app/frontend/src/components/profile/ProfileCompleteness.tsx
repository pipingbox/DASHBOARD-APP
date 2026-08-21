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
} from 'lucide-react';
import { supabase, TABLES } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import {
  calculateProfileCompletion,
  getCompletionStatus,
  type ProfileCompletionInput,
  type ProfileCompletionResult,
  type CompletionStatusLevel,
} from '@/lib/profileCompletion';

interface CompletenessItem {
  key: string;
  completed: boolean;
  icon: React.ReactNode;
}

export function ProfileCompleteness() {
  const { t } = useTranslation();
  const { user, profile } = useAuth();
  const [result, setResult] = useState<ProfileCompletionResult | null>(null);
  const [items, setItems] = useState<CompletenessItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !profile) return;
    buildChecklist();
  }, [user, profile]);

  const buildChecklist = async () => {
    if (!user || !profile) return;
    setLoading(true);

    // Fetch counts for calculation
    let experienceCount = 0;
    let certificationCount = 0;
    let documentCount = 0;

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

      experienceCount = expRes.count ?? 0;
      certificationCount = certRes.count ?? 0;
      documentCount = docRes.error ? 0 : (docRes.count ?? 0);
    } catch {
      // Continue with zeros
    }

    // Use the centralized calculation engine
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
      experience_count: experienceCount,
      certification_count: certificationCount,
      document_count: documentCount,
    };

    const calculated = calculateProfileCompletion(input);

    console.log("[PROFILE_COMPLETION]", {
      source: "profile",
      user_id: user.id,
      calculated: calculated.percentage,
      stored: profile.profile_completion,
    });

    setResult(calculated);

    // Build checklist items with icons for display
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

    const checklistItems: CompletenessItem[] = calculated.items.map((item) => ({
      key: item.key,
      completed: item.completed,
      icon: iconMap[item.key] || <User className="h-3.5 w-3.5" />,
    }));

    setItems(checklistItems);
    setLoading(false);

    // Optionally sync back to DB as cached value (non-blocking)
    if (calculated.percentage !== profile.profile_completion) {
      supabase
        .from(TABLES.profiles)
        .update({ profile_completion: calculated.percentage })
        .eq('user_id', user.id)
        .then(() => {});
    }
  };

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

  if (!result) return null;

  const percentage = result.percentage;
  const statusLevel = result.status;
  const missingItems = items.filter((item) => !item.completed);

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
              percentage >= 100
                ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                : percentage >= 90
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
 * Uses calculateProfileCompletion for consistency
 */
export function ProfileCompletenessBadge({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const [percentage, setPercentage] = useState<number | null>(null);

  useEffect(() => {
    if (!userId) return;
    fetchAndCalculateCompletion();
  }, [userId]);

  const fetchAndCalculateCompletion = async () => {
    try {
      // Fetch profile data
      const { data: profileData } = await supabase
        .from(TABLES.profiles)
        .select('avatar_url, full_name, title, company, location, years_experience, skills, bio, cv_file_url, cv_url')
        .eq('user_id', userId)
        .single();

      if (!profileData) return;

      // Fetch related counts
      let experience_count = 0;
      let certification_count = 0;
      let document_count = 0;

      try {
        const [expRes, certRes, docRes] = await Promise.all([
          supabase
            .from(TABLES.workerExperiences)
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId),
          supabase
            .from(TABLES.workerCertifications)
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId),
          supabase
            .from(TABLES.workerDocuments)
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId),
        ]);
        experience_count = expRes.count ?? 0;
        certification_count = certRes.count ?? 0;
        document_count = docRes.error ? 0 : (docRes.count ?? 0);
      } catch {
        // Continue with zeros
      }

      const input: ProfileCompletionInput = {
        avatar_url: profileData.avatar_url,
        full_name: profileData.full_name,
        title: profileData.title,
        company: profileData.company,
        location: profileData.location,
        years_experience: profileData.years_experience,
        skills: profileData.skills,
        bio: profileData.bio,
        cv_file_url: profileData.cv_file_url,
        cv_url: profileData.cv_url,
        experience_count,
        certification_count,
        document_count,
      };

      const result = calculateProfileCompletion(input);

      console.log("[PROFILE_COMPLETION]", {
        source: "badge",
        user_id: userId,
        calculated: result.percentage,
      });

      setPercentage(result.percentage);
    } catch {
      // Silently fail
    }
  };

  if (percentage === null) return null;

  const statusLevel = getCompletionStatus(percentage);
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