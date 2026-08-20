import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  User,
  MapPin,
  Briefcase,
  Clock,
  Star,
  FileText,
  Calendar,
  Loader2,
  Shield,
  CheckCircle2,
  XCircle,
  UserCheck,
  PhoneCall,
  ListChecks,
  MessageSquare,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  AlertTriangle,
  Languages,
  Plane,
  Globe,
  RotateCcw,
} from 'lucide-react';
import { supabase, TABLES, STORAGE_BUCKETS } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useAdminPreview } from '@/contexts/AdminPreviewContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FilePreviewModal, type FilePreviewData } from '@/components/ui/file-preview-modal';
import { toast } from 'sonner';
import { findOrCreateConversation } from '@/lib/messaging';
import type { WorkExperience, WorkerCertification, WorkerDocument } from '@/lib/workerProfile';
import { normalizeExperience, normalizeCertification, normalizeDocument, getExperienceDescriptionByLanguage, LANGUAGE_NAMES } from '@/lib/workerProfile';
import { useTranslation } from 'react-i18next';
import { InviteToJobModal } from '@/components/InviteToJobModal';

const PRIMARY_ADMIN_EMAIL = 'gaspardelhierromata@gmail.com';

const STATUS_OPTIONS = [
  'applied',
  'reviewed',
  'interview',
  'shortlisted',
  'rejected',
  'hired',
] as const;

type ApplicationStatus = (typeof STATUS_OPTIONS)[number];

interface CandidateProfileData {
  user_id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  role: string;
  title: string | null;
  company: string | null;
  location: string | null;
  years_experience: number | null;
  skills: string[] | null;
  cv_url: string | null;
  cv_file_url: string | null;
  cv_file_name: string | null;
  cv_visible: boolean;
  created_at: string;
  show_avatar: boolean;
  // Availability & Mobility fields
  employment_status: string | null;
  availability_status: string | null;
  available_from: string | null;
  willing_to_travel: boolean | null;
  willing_to_relocate: boolean | null;
  preferred_regions: string | null;
  rotation_preference: string | null;
  notice_period: string | null;
}

interface CandidateApplication {
  id: string;
  job_id?: string;
  job_title: string;
  company_name: string;
  status: string;
  created_at: string;
}

export default function CandidateProfile() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user, profile: viewerProfile } = useAuth();
  const { t, i18n } = useTranslation();
  const [profile, setProfile] = useState<CandidateProfileData | null>(null);
  const [applications, setApplications] = useState<CandidateApplication[]>([]);
  const [experiences, setExperiences] = useState<WorkExperience[]>([]);
  const [documents, setDocuments] = useState<WorkerCertification[]>([]);
  const [workerDocs, setWorkerDocs] = useState<WorkerDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<FilePreviewData | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);

  // Safely get admin preview context
  let effectiveRole = viewerProfile?.role || 'worker';
  let isRealAdmin = false;
  let isPreviewMode = false;
  try {
    const preview = useAdminPreview();
    effectiveRole = preview.effectiveRole;
    isRealAdmin = preview.isRealAdmin;
    isPreviewMode = preview.isPreviewMode;
  } catch {
    effectiveRole = viewerProfile?.role || 'worker';
    isRealAdmin = viewerProfile?.role === 'admin';
  }

  const isAdminViewer = isRealAdmin || effectiveRole === 'admin' || isPreviewMode;

  const checkAccessAndFetch = useCallback(async () => {
    if (!userId || !user) return;

    setLoading(true);
    setAccessDenied(false);
    setErrorMessage('');

    const candidateUserId = userId;
    const viewerUserId = user.id;
    const viewerEmail = user.email || '';
    const viewerRole = effectiveRole;

    // --- ACCESS CHECK ---
    if (viewerEmail === PRIMARY_ADMIN_EMAIL) {
      await fetchCandidateData(candidateUserId);
      return;
    }
    if (isRealAdmin || viewerRole === 'admin') {
      await fetchCandidateData(candidateUserId);
      return;
    }
    if (isPreviewMode) {
      await fetchCandidateData(candidateUserId);
      return;
    }
    if (viewerRole === 'jobs_moderator') {
      await fetchCandidateData(candidateUserId);
      return;
    }
    if (viewerRole === 'company') {
      const { data: relatedApps } = await supabase
        .from(TABLES.jobApplications)
        .select('id')
        .eq('user_id', candidateUserId)
        .eq('company_user_id', viewerUserId)
        .limit(1);

      if (relatedApps && relatedApps.length > 0) {
        await fetchCandidateData(candidateUserId);
        return;
      }

      const { data: companyJobs } = await supabase
        .from(TABLES.jobs)
        .select('id')
        .eq('company_user_id', viewerUserId);

      if (companyJobs && companyJobs.length > 0) {
        const jobIds = companyJobs.map((j: { id: string }) => j.id);
        const { data: jobApps } = await supabase
          .from(TABLES.jobApplications)
          .select('id')
          .eq('user_id', candidateUserId)
          .in('job_id', jobIds)
          .limit(1);

        if (jobApps && jobApps.length > 0) {
          await fetchCandidateData(candidateUserId);
          return;
        }
      }

      setAccessDenied(true);
      setErrorMessage('You can only view profiles of candidates who applied to your jobs.');
      setLoading(false);
      return;
    }
    if (viewerUserId === candidateUserId) {
      await fetchCandidateData(candidateUserId);
      return;
    }

    setAccessDenied(true);
    setErrorMessage('You do not have permission to view this profile.');
    setLoading(false);
  }, [userId, user, effectiveRole, isRealAdmin, isPreviewMode]);

  useEffect(() => {
    checkAccessAndFetch();
  }, [checkAccessAndFetch]);

  const fetchCandidateData = async (candidateUserId: string) => {
    console.log('[CandidateProfile] fetchCandidateData - current logged user id:', user?.id);
    console.log('[CandidateProfile] fetchCandidateData - candidateUserId param:', candidateUserId);
    try {
      let profileData: Record<string, unknown> | null = null;

      const { data: byUserId } = await supabase
        .from(TABLES.profiles)
        .select('*')
        .eq('user_id', candidateUserId)
        .maybeSingle();

      if (byUserId) {
        profileData = byUserId;
      } else {
        const { data: byId } = await supabase
          .from(TABLES.profiles)
          .select('*')
          .eq('id', candidateUserId)
          .maybeSingle();
        if (byId) {
          profileData = byId;
        }
      }

      if (profileData) {
        console.log('[CandidateProfile] candidate profile object:', profileData);
        setProfile(profileData as unknown as CandidateProfileData);
        // Use the profile's user_id for related queries (candidateUserId might be the profile's `id` field)
        const actualUserId = (profileData as Record<string, unknown>).user_id as string || candidateUserId;
        console.log('[CandidateProfile] resolved actualUserId for certifications:', actualUserId);
        await Promise.all([
          fetchApplications(actualUserId),
          fetchExperiences(actualUserId),
          fetchDocuments(actualUserId),
          fetchWorkerDocs(actualUserId),
        ]);
      } else {
        await fetchProfileFallback(candidateUserId);
      }
    } catch {
      await fetchProfileFallback(candidateUserId);
    } finally {
      setLoading(false);
    }
  };

  const fetchExperiences = async (candidateUserId: string) => {
    try {
      let query = supabase
        .from(TABLES.workerExperiences)
        .select('*')
        .eq('user_id', candidateUserId)
        .order('start_date', { ascending: false, nullsFirst: false });

      // Non-admin viewers only see visible experiences
      if (!isAdminViewer) {
        query = query.eq('visible_to_companies', true);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Failed to load experiences:', error.message);
        setExperiences([]);
        return;
      }
      setExperiences(
        (data ?? []).map((row) => normalizeExperience(row as Record<string, unknown>))
      );
    } catch (err) {
      console.error('Error fetching experiences:', err);
      setExperiences([]);
    }
  };

  const fetchDocuments = async (candidateUserId: string) => {
    console.log('[CandidateProfile] fetchDocuments - current logged user id:', user?.id);
    console.log('[CandidateProfile] fetchDocuments - resolved candidateUserId:', candidateUserId);
    try {
      let query = supabase
        .from('app_worker_certifications')
        .select('*')
        .eq('user_id', candidateUserId)
        .order('created_at', { ascending: false });

      // Non-admin viewers only see visible certifications
      if (!isAdminViewer) {
        query = query.eq('is_visible', true);
      }

      const { data, error } = await query;
      console.log('[CandidateProfile] certifications response data:', data);
      console.log('[CandidateProfile] certifications response error:', error);
      if (error) {
        console.error('Failed to load certifications:', error.message);
        setDocuments([]);
        return;
      }
      if (data && data.length > 0) {
        const normalized = data.map((row: Record<string, unknown>) => normalizeCertification(row));
        setDocuments(normalized);
      } else {
        setDocuments([]);
      }
    } catch (err) {
      console.error('Error fetching certifications:', err);
      setDocuments([]);
    }
  };

  const fetchWorkerDocs = async (candidateUserId: string) => {
    try {
      let query = supabase
        .from(TABLES.workerDocuments)
        .select('*')
        .eq('user_id', candidateUserId)
        .order('created_at', { ascending: false });

      // Non-admin viewers only see visible documents
      if (!isAdminViewer) {
        query = query.eq('is_visible', true);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Failed to load worker documents:', error.message);
        setWorkerDocs([]);
        return;
      }
      setWorkerDocs(
        (data ?? []).map((row) => normalizeDocument(row as Record<string, unknown>))
      );
    } catch (err) {
      console.error('Error fetching worker documents:', err);
      setWorkerDocs([]);
    }
  };

  const fetchProfileFallback = async (candidateUserId: string) => {
    try {
      const { data: appsData, error: appsError } = await supabase
        .from(TABLES.jobApplications)
        .select('id, user_id, applicant_name, applicant_email, job_title, company_name, status, created_at, location')
        .eq('user_id', candidateUserId)
        .order('created_at', { ascending: false });

      if (appsError || !appsData || appsData.length === 0) {
        setErrorMessage('Could not load candidate profile.');
        setAccessDenied(true);
        setLoading(false);
        return;
      }

      const firstApp = appsData[0] as Record<string, unknown>;
      const fallbackProfile: CandidateProfileData = {
        user_id: candidateUserId,
        full_name: (firstApp.applicant_name as string) || 'Worker',
        username: null,
        avatar_url: null,
        bio: null,
        role: 'worker',
        title: (firstApp.job_title as string) || null,
        company: null,
        location: (firstApp.location as string) || null,
        years_experience: null,
        skills: null,
        cv_url: null,
        cv_file_url: null,
        cv_file_name: null,
        cv_visible: true,
        created_at: (firstApp.created_at as string) || new Date().toISOString(),
        show_avatar: false,
        employment_status: null,
        availability_status: null,
        available_from: null,
        willing_to_travel: null,
        willing_to_relocate: null,
        preferred_regions: null,
        rotation_preference: null,
        notice_period: null,
      };

      setProfile(fallbackProfile);

      const mappedApps: CandidateApplication[] = appsData.map((app: Record<string, unknown>) => ({
        id: app.id as string,
        job_title: (app.job_title as string) || 'Unknown Job',
        company_name: (app.company_name as string) || '',
        status: (app.status as string) || 'applied',
        created_at: (app.created_at as string) || '',
      }));

      setApplications(mappedApps);
      setLoading(false);
    } catch {
      setErrorMessage('Failed to load candidate profile.');
      setAccessDenied(true);
      setLoading(false);
    }
  };

  const fetchApplications = async (candidateUserId: string) => {
    const viewerUserId = user!.id;
    const viewerRole = effectiveRole;

    let query = supabase
      .from(TABLES.jobApplications)
      .select('id, job_id, job_title, company_name, status, created_at')
      .eq('user_id', candidateUserId)
      .order('created_at', { ascending: false });

    if (viewerRole === 'company' && !isRealAdmin && !isPreviewMode) {
      query = query.eq('company_user_id', viewerUserId);
    }

    const { data: appsData } = await query;
    setApplications((appsData ?? []) as CandidateApplication[]);
  };

  const updateApplicationStatus = async (applicationId: string, newStatus: ApplicationStatus) => {
    setUpdatingId(applicationId);
    const { error } = await supabase
      .from(TABLES.jobApplications)
      .update({ status: newStatus })
      .eq('id', applicationId);

    if (error) {
      toast.error('Failed to update status', { description: error.message });
    } else {
      toast.success(`Status updated to "${newStatus}"`);
      setApplications((prev) =>
        prev.map((a) => (a.id === applicationId ? { ...a, status: newStatus } : a))
      );
    }
    setUpdatingId(null);
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { label: string; classes: string }> = {
      applied: { label: 'Applied', classes: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30' },
      reviewed: { label: 'Reviewed', classes: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
      interview: { label: 'Interview', classes: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
      shortlisted: { label: 'Shortlisted', classes: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
      rejected: { label: 'Rejected', classes: 'bg-red-500/10 text-red-400 border-red-500/30' },
      hired: { label: 'Hired', classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
    };
    const c = config[status] || config.applied;
    return (
      <Badge variant="outline" className={`text-[10px] font-semibold uppercase tracking-wider ${c.classes}`}>
        {c.label}
      </Badge>
    );
  };

  const getStatusActions = (currentStatus: string): { label: string; status: ApplicationStatus; icon: React.ElementType; variant: 'default' | 'outline' | 'destructive' }[] => {
    const actions: { label: string; status: ApplicationStatus; icon: React.ElementType; variant: 'default' | 'outline' | 'destructive' }[] = [];
    if (currentStatus !== 'shortlisted') {
      actions.push({ label: 'Shortlist', status: 'shortlisted', icon: ListChecks, variant: 'outline' });
    }
    if (currentStatus !== 'interview') {
      actions.push({ label: 'Schedule Interview', status: 'interview', icon: PhoneCall, variant: 'outline' });
    }
    if (currentStatus !== 'hired') {
      actions.push({ label: 'Hire', status: 'hired', icon: UserCheck, variant: 'default' });
    }
    if (currentStatus !== 'rejected') {
      actions.push({ label: 'Reject', status: 'rejected', icon: XCircle, variant: 'destructive' });
    }
    return actions;
  };

  const getSignedUrl = async (bucket: string, path: string): Promise<string | null> => {
    try {
      console.log('[CandidateProfile] getSignedUrl request:', { bucket, path });
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 3600);
      if (error || !data?.signedUrl) {
        console.error('[CandidateProfile] getSignedUrl failed:', { bucket, path, error });
        return null;
      }
      console.log('[CandidateProfile] getSignedUrl success:', { bucket, path, signedUrl: data.signedUrl.substring(0, 80) + '...' });
      return data.signedUrl;
    } catch (err) {
      console.error('[CandidateProfile] getSignedUrl exception:', { bucket, path, err });
      return null;
    }
  };

  const handleCertFileDownload = async (cert: WorkerCertification) => {
    if (!cert.file_url) return;
    // If it's a full URL (public), open directly
    if (cert.file_url.startsWith('http')) {
      window.open(cert.file_url, '_blank');
      return;
    }
    // Otherwise treat as a storage path and get signed URL
    const signedUrl = await getSignedUrl(STORAGE_BUCKETS.certificates, cert.file_url);
    if (signedUrl) {
      window.open(signedUrl, '_blank');
    } else {
      toast.error('Failed to generate download link');
    }
  };

  const handleCVDownload = async () => {
    if (!profile) return;
    // If cv_file_url is a full URL, open directly
    if (profile.cv_file_url && profile.cv_file_url.startsWith('http')) {
      window.open(profile.cv_file_url, '_blank');
      return;
    }
    // Otherwise try signed URL from certificates bucket
    const path = profile.cv_file_url || '';
    if (!path) return;
    const signedUrl = await getSignedUrl(STORAGE_BUCKETS.workerDocuments, path);
    if (signedUrl) {
      window.open(signedUrl, '_blank');
    } else {
      toast.error('Failed to generate CV download link');
    }
  };

  const getCertExpiryBadge = (cert: WorkerCertification) => {
    const expiryDate = cert.expiry_date || cert.expiration_date || null;
    if (!expiryDate) {
      return (
        <Badge variant="outline" className="text-[9px] font-semibold uppercase tracking-wider border-zinc-600 text-zinc-400 bg-zinc-800/50">
          No expiry
        </Badge>
      );
    }
    const isExpired = new Date(expiryDate) < new Date();
    if (isExpired) {
      return (
        <Badge variant="outline" className="text-[9px] font-semibold uppercase tracking-wider border-red-600/50 text-red-400 bg-red-500/10">
          Expired
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-[9px] font-semibold uppercase tracking-wider border-emerald-600/50 text-emerald-400 bg-emerald-500/10">
        Valid
      </Badge>
    );
  };

  const canUpdateStatus = effectiveRole === 'company' || effectiveRole === 'admin' || effectiveRole === 'jobs_moderator' || isRealAdmin || isPreviewMode;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
        <span className="ml-2 text-sm text-zinc-500">Loading candidate profile...</span>
      </div>
    );
  }

  if (accessDenied || !profile) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-900 border border-zinc-800">
          <Shield className="h-6 w-6 text-red-400" />
        </div>
        <h2 className="text-lg font-semibold text-zinc-200">Access Denied</h2>
        <p className="mt-2 text-sm text-zinc-500 max-w-sm">
          {errorMessage || 'You do not have permission to view this profile.'}
        </p>
        <Button
          variant="outline"
          onClick={() => navigate(-1)}
          className="mt-4 border-zinc-700 text-zinc-300"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Go Back
        </Button>
      </div>
    );
  }

  const showCV = profile.cv_file_url && (isAdminViewer || profile.cv_visible);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate(-1)}
        className="text-zinc-400 hover:text-zinc-200"
      >
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        Back to Candidates
      </Button>

      {/* Profile Header */}
      <div className="border border-zinc-800 bg-[#0d0d0d] rounded-sm p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800 border border-zinc-700 text-lg font-bold text-zinc-300 shrink-0">
            {profile.show_avatar && profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.full_name || 'Candidate'}
                className="h-16 w-16 rounded-full object-cover"
              />
            ) : (
              (profile.full_name || 'W')
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()
            )}
          </div>
          <div className="flex-1 space-y-1">
            <h1 className="text-xl font-bold text-zinc-100">
              {profile.full_name || 'Worker'}
            </h1>
            {profile.title && (
              <p className="text-sm text-[#f59e0b] font-medium">{profile.title}</p>
            )}
            <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500 mt-2">
              {profile.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {profile.location}
                </span>
              )}
              {profile.years_experience != null && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {profile.years_experience} years experience
                </span>
              )}
              {profile.role && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {profile.role}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        {(effectiveRole === 'company' || effectiveRole === 'admin') && (
          <div className="mt-4 pt-4 border-t border-zinc-800 flex flex-wrap gap-2">
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-500 text-black text-xs h-8 gap-1.5"
              onClick={async () => {
                if (!user || !userId) return;
                const jobId = applications.length > 0 ? (applications[0].job_id ?? null) : null;
                const appId = applications.length > 0 ? applications[0].id : null;
                const convId = await findOrCreateConversation({
                  companyUserId: user.id,
                  workerUserId: userId,
                  applicationId: appId,
                  jobId: jobId,
                });
                if (convId) {
                  navigate(`/messages?conversation=${convId}`);
                } else {
                  toast.error('Failed to start conversation');
                }
              }}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {t('candidateProfile.messageCandidate')}
            </Button>
            <Button
              size="sm"
              className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs h-8 gap-1.5"
              onClick={() => setInviteModalOpen(true)}
            >
              <Briefcase className="h-3.5 w-3.5" />
              {t('inviteToJob.buttonLabel')}
            </Button>
          </div>
        )}

        {/* Bio */}
        {profile.bio && (
          <div className="mt-4 pt-4 border-t border-zinc-800">
            <h3 className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium mb-2">About</h3>
            <p className="text-sm text-zinc-300 leading-relaxed">{profile.bio}</p>
          </div>
        )}
      </div>

      {/* Skills */}
      {profile.skills && profile.skills.length > 0 && (
        <div className="border border-zinc-800 bg-[#0d0d0d] rounded-sm p-6">
          <h3 className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium mb-3 flex items-center gap-1.5">
            <Star className="h-3 w-3" />
            Skills
          </h3>
          <div className="flex flex-wrap gap-2">
            {profile.skills.map((skill) => (
              <span
                key={skill}
                className="inline-flex items-center px-2.5 py-1 rounded-sm border border-zinc-800 bg-zinc-900/50 text-xs font-medium text-zinc-300"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* CV Section */}
      <div className="border border-zinc-800 bg-[#0d0d0d] rounded-sm p-6">
        <h3 className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium mb-3 flex items-center gap-1.5">
          <FileText className="h-3 w-3" />
          CV / Resume
        </h3>
        {showCV ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (profile.cv_file_url) {
                  setPreviewFile({
                    url: profile.cv_file_url,
                    title: profile.cv_file_name || 'CV / Resume',
                    subtitle: profile.full_name || undefined,
                    fileName: profile.cv_file_name || undefined,
                  });
                  setPreviewOpen(true);
                }
              }}
              className="inline-flex items-center gap-1.5 border border-[#f59e0b]/40 bg-[#f59e0b]/10 px-3 py-2 text-xs font-medium text-[#f59e0b] hover:bg-[#f59e0b]/20 cursor-pointer"
            >
              <Eye className="h-3.5 w-3.5" />
              Ver
            </button>
            <button
              type="button"
              onClick={handleCVDownload}
              className="inline-flex items-center gap-1.5 border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              Descargar
            </button>
            <span className="text-xs text-zinc-500 ml-1">{profile.cv_file_name || ''}</span>
          </div>
        ) : !profile.cv_file_url ? (
          <p className="flex items-center gap-2 text-xs text-zinc-500">
            <FileText className="h-3.5 w-3.5" />
            No CV uploaded yet.
          </p>
        ) : !profile.cv_visible && !isAdminViewer ? (
          <p className="flex items-center gap-2 text-xs text-zinc-500">
            <EyeOff className="h-3.5 w-3.5" />
            This candidate has chosen not to share their CV.
          </p>
        ) : null}
      </div>

      {/* Work Experience */}
      {experiences.length > 0 && (
        <div className="border border-zinc-800 bg-[#0d0d0d] rounded-sm p-6">
          <h3 className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium mb-3 flex items-center gap-1.5">
            <Briefcase className="h-3 w-3" />
            Work Experience
          </h3>
          <div className="space-y-4">
            {experiences.map((exp) => (
              <div key={exp.id} className="border-l-2 border-zinc-800 pl-4">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-zinc-200">{exp.position}</h4>
                  {exp.currently_working && (
                    <span className="border border-emerald-600/40 bg-emerald-600/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-emerald-300">
                      Current
                    </span>
                  )}
                  {!exp.visible_to_companies && isAdminViewer && (
                    <span className="border border-zinc-700 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-zinc-500">
                      Hidden
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">{exp.company_name}</p>
                {exp.project_name && (
                  <p className="text-[11px] text-zinc-500 mt-0.5">{exp.project_name}</p>
                )}
                <div className="flex flex-wrap gap-3 mt-1 text-[11px] text-zinc-500">
                  {(exp.city_region || exp.country) && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {[exp.city_region, exp.country].filter(Boolean).join(', ')}
                    </span>
                  )}
                  {exp.start_date && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(exp.start_date).toLocaleDateString()} –{' '}
                      {exp.currently_working ? 'Present' : exp.end_date ? new Date(exp.end_date).toLocaleDateString() : ''}
                    </span>
                  )}
                </div>
                {/* Show description based on viewer's current language */}
                {exp.description_original && (() => {
                  const desc = getExperienceDescriptionByLanguage(exp, i18n.language);
                  return (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-zinc-300">{desc.text}</p>
                      {desc.isTranslated && desc.originalLanguage && (
                        <p className="text-[11px] text-zinc-500 italic flex items-center gap-1">
                          <Languages className="h-3 w-3" />
                          Original ({LANGUAGE_NAMES[desc.originalLanguage] || desc.originalLanguage}): {exp.description_original}
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Certifications */}
      <div className="border border-zinc-800 bg-[#0d0d0d] rounded-sm p-6">
        <h3 className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium mb-3 flex items-center gap-1.5">
          <Shield className="h-3 w-3" />
          Certifications
        </h3>
        {documents.length === 0 ? (
          <p className="text-xs text-zinc-500 flex items-center gap-2">
            <Shield className="h-3.5 w-3.5" />
            No certifications added yet.
          </p>
        ) : (
          <div className="space-y-3">
            {documents.map((cert) => {
              const certExpiry = cert.expiry_date || cert.expiration_date || null;
              const certFileUrl = cert.file_url || cert.certificate_file_url || null;
              return (
                <div key={cert.id} className="border border-zinc-800 bg-zinc-950 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <FileText className="h-5 w-5 text-[#f59e0b] shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-zinc-200">
                            {cert.certification_name}
                          </p>
                          {getCertExpiryBadge(cert)}
                        </div>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          {cert.issuing_organization}
                        </p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-zinc-500">
                          {cert.issue_date && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Issued: {new Date(cert.issue_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          )}
                          {certExpiry && (
                            <span className="flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Expires: {new Date(certExpiry).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          )}
                          {cert.credential_id && (
                            <span className="flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              ID: {cert.credential_id}
                            </span>
                          )}
                          {cert.verification_url && (
                            <a
                              href={cert.verification_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-[#f59e0b] hover:text-[#d97706]"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Verify
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {certFileUrl && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewFile({
                                url: certFileUrl,
                                title: cert.certification_name,
                                subtitle: cert.issuing_organization || undefined,
                                expiryDate: certExpiry,
                                fileName: cert.file_name || certFileUrl,
                              });
                              setPreviewOpen(true);
                            }}
                            className="inline-flex items-center gap-1 text-xs text-[#f59e0b] hover:text-[#d97706] border border-[#f59e0b]/30 px-2 py-1 hover:bg-[#f59e0b]/10"
                            title="Ver certificado"
                          >
                            <Eye className="h-3 w-3" />
                            Ver
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCertFileDownload({ ...cert, file_url: certFileUrl })}
                            className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 px-2 py-1 hover:bg-zinc-800"
                            title="Descargar certificado"
                          >
                            <Download className="h-3 w-3" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Worker Documents */}
      {workerDocs.length > 0 && (
        <div className="border border-zinc-800 bg-[#0d0d0d] rounded-sm p-6">
          <h3 className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium mb-3 flex items-center gap-1.5">
            <FileText className="h-3 w-3" />
            Documents
          </h3>
          <div className="space-y-3">
            {workerDocs.map((doc) => {
              const isExpired = doc.expires_at ? new Date(doc.expires_at) < new Date() : false;
              return (
                <div key={doc.id} className="border border-zinc-800 bg-zinc-950 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <FileText className="h-5 w-5 text-[#f59e0b] shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-zinc-200">
                            {doc.file_name}
                          </p>
                          <span className="border border-zinc-700 px-2 py-0.5 text-[9px] uppercase tracking-wider text-zinc-400">
                            {doc.document_type}
                          </span>
                          {doc.verified && (
                            <Badge variant="outline" className="text-[9px] font-semibold uppercase tracking-wider border-emerald-600/50 text-emerald-400 bg-emerald-500/10">
                              Verified
                            </Badge>
                          )}
                          {doc.expires_at && (
                            <Badge variant="outline" className={`text-[9px] font-semibold uppercase tracking-wider ${isExpired ? 'border-red-600/50 text-red-400 bg-red-500/10' : 'border-zinc-600 text-zinc-400 bg-zinc-800/50'}`}>
                              {isExpired ? 'Expired' : `Exp: ${new Date(doc.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                            </Badge>
                          )}
                          {!doc.is_visible && isAdminViewer && (
                            <span className="border border-zinc-700 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-zinc-500">
                              Hidden
                            </span>
                          )}
                        </div>
                        {doc.document_category && doc.document_category !== 'other' && (
                          <p className="text-xs text-zinc-500 mt-0.5">{doc.document_category}</p>
                        )}
                        {doc.notes && (
                          <p className="text-xs text-zinc-400 mt-1">{doc.notes}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {doc.file_url && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewFile({
                                url: doc.file_url!,
                                title: doc.file_name,
                                subtitle: doc.document_type || undefined,
                                expiryDate: doc.expires_at,
                                fileName: doc.file_name,
                                mimeType: doc.mime_type,
                              });
                              setPreviewOpen(true);
                            }}
                            className="inline-flex items-center gap-1 text-xs text-[#f59e0b] hover:text-[#d97706] border border-[#f59e0b]/30 px-2 py-1 hover:bg-[#f59e0b]/10"
                            title="Ver documento"
                          >
                            <Eye className="h-3 w-3" />
                            Ver
                          </button>
                          <a
                            href={doc.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 px-2 py-1 hover:bg-zinc-800"
                            title="Descargar documento"
                          >
                            <Download className="h-3 w-3" />
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Experience & Details */}
      <div className="border border-zinc-800 bg-[#0d0d0d] rounded-sm p-6 space-y-4">
        <h3 className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium flex items-center gap-1.5">
          <Briefcase className="h-3 w-3" />
          Details
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {profile.title && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">Title</p>
              <p className="text-sm text-zinc-300">{profile.title}</p>
            </div>
          )}
          {profile.company && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">Company</p>
              <p className="text-sm text-zinc-300">{profile.company}</p>
            </div>
          )}
          {profile.location && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">Location</p>
              <p className="text-sm text-zinc-300">{profile.location}</p>
            </div>
          )}
          {profile.years_experience != null && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">Experience</p>
              <p className="text-sm text-zinc-300">{profile.years_experience} years</p>
            </div>
          )}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">Member Since</p>
            <p className="text-sm text-zinc-300">
              {new Date(profile.created_at).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </p>
          </div>
        </div>

        {/* Legacy CV Link */}
        {profile.cv_url && !profile.cv_file_url && (
          <div className="pt-3 border-t border-zinc-800">
            <a
              href={profile.cv_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-[#f59e0b] hover:text-[#d97706] font-medium transition-colors"
            >
              <FileText className="h-3.5 w-3.5" />
              View CV / Resume
            </a>
          </div>
        )}
      </div>

      {/* Availability & Mobility */}
      {(profile.employment_status || profile.availability_status || profile.rotation_preference || profile.notice_period || profile.willing_to_travel || profile.willing_to_relocate || profile.preferred_regions) && (
        <div className="border border-zinc-800 bg-[#0d0d0d] rounded-sm p-6 space-y-4">
          <h3 className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium flex items-center gap-1.5">
            <Globe className="h-3 w-3" />
            {t('availability.title', 'Availability & Mobility')}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {profile.employment_status && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">
                  {t('availability.employmentStatus', 'Employment Status')}
                </p>
                <p className="text-sm text-zinc-300">
                  {t(`availability.employment.${profile.employment_status}`, profile.employment_status.replace(/_/g, ' '))}
                </p>
              </div>
            )}
            {profile.availability_status && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">
                  {t('availability.availabilityStatus', 'Availability')}
                </p>
                <p className="text-sm text-zinc-300">
                  {t(`availability.status.${profile.availability_status}`, profile.availability_status.replace(/_/g, ' '))}
                  {profile.availability_status === 'available_from_date' && profile.available_from && (
                    <span className="text-zinc-500 ml-1">
                      ({new Date(profile.available_from).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })})
                    </span>
                  )}
                </p>
              </div>
            )}
            {profile.notice_period && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">
                  {t('availability.noticePeriod', 'Notice Period')}
                </p>
                <p className="text-sm text-zinc-300">
                  {t(`availability.notice.${profile.notice_period}`, profile.notice_period.replace(/_/g, ' '))}
                </p>
              </div>
            )}
            {profile.rotation_preference && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">
                  {t('availability.rotationPreference', 'Rotation Preference')}
                </p>
                <p className="text-sm text-zinc-300">
                  {t(`availability.rotation.${profile.rotation_preference}`, profile.rotation_preference.replace(/_/g, ' '))}
                </p>
              </div>
            )}
          </div>

          {/* Mobility indicators */}
          <div className="border-t border-zinc-800 pt-3">
            <div className="flex flex-wrap gap-3">
              {profile.willing_to_travel && (
                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 border border-emerald-600/30 bg-emerald-500/10 px-2.5 py-1 rounded-sm">
                  <Plane className="h-3 w-3" />
                  {t('availability.willingToTravel', 'Willing to Travel')}
                </span>
              )}
              {profile.willing_to_relocate && (
                <span className="inline-flex items-center gap-1.5 text-xs text-blue-400 border border-blue-600/30 bg-blue-500/10 px-2.5 py-1 rounded-sm">
                  <MapPin className="h-3 w-3" />
                  {t('availability.willingToRelocate', 'Willing to Relocate')}
                </span>
              )}
              {!profile.willing_to_travel && profile.willing_to_travel !== null && (
                <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500 border border-zinc-700 px-2.5 py-1 rounded-sm">
                  <Plane className="h-3 w-3" />
                  {t('availability.notWillingToTravel', 'Not available for travel')}
                </span>
              )}
            </div>
          </div>

          {profile.preferred_regions && (
            <div className="pt-1">
              <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">
                {t('availability.preferredRegions', 'Preferred Regions')}
              </p>
              <p className="text-sm text-zinc-300">{profile.preferred_regions}</p>
            </div>
          )}
        </div>
      )}

      {/* Applications with Status Actions */}
      {applications.length > 0 && (
        <div className="border border-zinc-800 bg-[#0d0d0d] rounded-sm p-6">
          <h3 className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium mb-3 flex items-center gap-1.5">
            <Calendar className="h-3 w-3" />
            Applications to Your Jobs
          </h3>
          <div className="space-y-3">
            {applications.map((app) => (
              <div
                key={app.id}
                className="rounded-sm bg-zinc-900/50 border border-zinc-800/50 p-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-zinc-200 font-medium">{app.job_title}</p>
                    <p className="text-[11px] text-zinc-500">
                      Applied {new Date(app.created_at).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                  {getStatusBadge(app.status)}
                </div>

                {canUpdateStatus && (
                  <div className="mt-3 pt-3 border-t border-zinc-800/50 flex flex-wrap gap-2">
                    {getStatusActions(app.status).map((action) => {
                      const Icon = action.icon;
                      const isUpdating = updatingId === app.id;
                      return (
                        <Button
                          key={action.status}
                          variant={action.variant}
                          size="sm"
                          disabled={isUpdating}
                          onClick={() => updateApplicationStatus(app.id, action.status)}
                          className={`text-xs h-7 px-2.5 gap-1.5 ${
                            action.variant === 'default'
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              : action.variant === 'destructive'
                              ? 'bg-red-600/10 hover:bg-red-600/20 text-red-400 border-red-500/30'
                              : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                          }`}
                        >
                          {isUpdating ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Icon className="h-3 w-3" />
                          )}
                          {action.label}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {/* File Preview Modal */}
      <FilePreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        file={previewFile}
      />
      {/* Invite to Job Modal */}
      {userId && profile && (
        <InviteToJobModal
          open={inviteModalOpen}
          onOpenChange={setInviteModalOpen}
          candidateUserId={userId}
          candidateName={profile.full_name || profile.username || 'Candidate'}
        />
      )}
    </div>
  );
}