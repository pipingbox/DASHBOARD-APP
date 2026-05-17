import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { supabase, TABLES } from '@/lib/supabase';
import { COMPLETION_THRESHOLDS } from '@/lib/profileCompletion';
import {
  Search,
  Filter,
  MapPin,
  Wrench,
  Shield,
  Clock,
  Users,
  Eye,
  Loader2,
  AlertCircle,
  Plane,
  Home,
  Award,
  FileText,
  Briefcase,
} from 'lucide-react';

interface WorkerProfile {
  user_id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  title: string | null;
  company: string | null;
  location: string | null;
  years_experience: number | null;
  skills: string[] | null;
  bio: string | null;
  cv_visible: boolean;
  show_avatar: boolean;
  employment_status: string | null;
  availability_status: string | null;
  available_from: string | null;
  willing_to_travel: boolean | null;
  willing_to_relocate: boolean | null;
  preferred_regions: string | null;
  rotation_preference: string | null;
  notice_period: string | null;
  role: string | null;
  created_at: string;
}

interface WorkerWithCounts extends WorkerProfile {
  experienceCount: number;
  certificationCount: number;
  documentCount: number;
  certificationNames: string[];
  completenessPercent: number;
}



export default function CompanyWorkersSearch() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [filters, setFilters] = useState({
    keyword: '',
    role: '',
    country: '',
    availability: '',
    certification: '',
    experience: '',
  });

  const [workers, setWorkers] = useState<WorkerWithCounts[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const fetchWorkers = useCallback(async (applyFilters = true) => {
    setLoading(true);
    setError(null);
    setSearched(true);

    try {
      // Fetch profiles that qualify for Worker Search:
      // account_type = 'worker' OR title is not null OR (full_name is not null AND cv_visible = true)
      // Do NOT filter by role - role is for permissions only, not search visibility
      const { data: profiles, error: profilesError } = await supabase
        .from(TABLES.profiles)
        .select('*')
        .or('account_type.eq.worker,title.not.is.null,and(full_name.not.is.null,cv_visible.eq.true)');

      console.log('[WorkerSearch] Raw query result:', profiles);
      console.log('[WorkerSearch] Profiles fetched count:', profiles?.length ?? 0);

      if (profilesError) {
        console.error('[WorkerSearch] Query error:', profilesError);
        throw profilesError;
      }

      if (!profiles || profiles.length === 0) {
        console.warn('[WorkerSearch] No profiles returned from Supabase. Check RLS policies or data.');
        // Debug: fetch a sample of profiles to check what exists
        const { data: allProfiles, error: allErr } = await supabase
          .from(TABLES.profiles)
          .select('user_id, role, account_type, full_name, title, cv_visible')
          .limit(10);
        console.log('[WorkerSearch] DEBUG - First 10 profiles (any):', allProfiles, allErr);
        setWorkers([]);
        setLoading(false);
        return;
      }

      // Show first 10 raw profiles in console for debug
      console.log('[WorkerSearch] DEBUG - First 10 raw profiles:', profiles.slice(0, 10));

      // MARKETPLACE FILTER: Only show MARKETPLACE_READY profiles
      // Rules: full_name + (position OR title) + profile_completion >= 30 + profile_visibility = public (cv_visible = true)
      // Private profiles and incomplete/orphan profiles should NOT appear in public marketplace
      const visibleProfiles = (profiles as WorkerProfile[]).filter((p) => {
        const hasName = !!p.full_name;
        const hasPositionOrTitle = !!(p.position || p.title);
        const hasMinCompletion = (p.profile_completion ?? 0) >= COMPLETION_THRESHOLDS.MARKETPLACE_MIN;
        // Check both profile_visibility and cv_visible for backwards compatibility
        const pVisibility = (p as Record<string, unknown>).profile_visibility as string | undefined;
        const isVisible = pVisibility ? pVisibility === 'public' : p.cv_visible !== false;
        const show = hasName && hasPositionOrTitle && hasMinCompletion && isVisible;
        if (!show) {
          console.log('[WorkerSearch] Excluded:', p.user_id, p.full_name, 'completion:', p.profile_completion, 'visibility:', pVisibility ?? p.cv_visible);
        }
        return show;
      });

      console.log('[WorkerSearch] Marketplace-ready profiles:', visibleProfiles.length);
      console.log('[WorkerSearch] Excluded (incomplete):', profiles.length - visibleProfiles.length);

      if (visibleProfiles.length === 0) {
        // No marketplace-ready profiles found
        console.warn('[WorkerSearch] No marketplace-ready profiles found.');
        setWorkers([]);
        setLoading(false);
        return;
      }

      const userIds = visibleProfiles.map((p) => p.user_id);

      // Fetch experience counts (graceful - don't fail if table doesn't exist)
      const expCounts: Record<string, number> = {};
      const certCounts: Record<string, number> = {};
      const certNames: Record<string, string[]> = {};
      const docCounts: Record<string, number> = {};

      try {
        const { data: expData } = await supabase
          .from(TABLES.workerExperiences)
          .select('user_id')
          .in('user_id', userIds);

        (expData || []).forEach((e: { user_id: string }) => {
          expCounts[e.user_id] = (expCounts[e.user_id] || 0) + 1;
        });
      } catch {
        console.warn('[WorkerSearch] Could not fetch experiences');
      }

      try {
        const { data: certData } = await supabase
          .from(TABLES.workerCertifications)
          .select('user_id, name, visible_to_companies')
          .in('user_id', userIds);

        (certData || []).forEach((c: { user_id: string; name: string; visible_to_companies?: boolean }) => {
          certCounts[c.user_id] = (certCounts[c.user_id] || 0) + 1;
          if (c.visible_to_companies !== false && c.name) {
            if (!certNames[c.user_id]) certNames[c.user_id] = [];
            if (!certNames[c.user_id].includes(c.name)) {
              certNames[c.user_id].push(c.name);
            }
          }
        });
      } catch {
        console.warn('[WorkerSearch] Could not fetch certifications');
      }

      try {
        const { data: docData } = await supabase
          .from(TABLES.workerDocuments)
          .select('user_id')
          .in('user_id', userIds);

        (docData || []).forEach((d: { user_id: string }) => {
          docCounts[d.user_id] = (docCounts[d.user_id] || 0) + 1;
        });
      } catch {
        console.warn('[WorkerSearch] Could not fetch documents');
      }

      // Build enriched workers
      let enrichedWorkers: WorkerWithCounts[] = visibleProfiles.map((p) => ({
        ...p,
        experienceCount: expCounts[p.user_id] || 0,
        certificationCount: certCounts[p.user_id] || 0,
        documentCount: docCounts[p.user_id] || 0,
        certificationNames: certNames[p.user_id] || [],
        completenessPercent: (p as Record<string, unknown>).profile_completion as number ?? 0,
      }));

      // Only apply filters if explicitly requested (not on initial load)
      if (applyFilters) {
        // Apply client-side filters ONLY if they have values
        if (filters.keyword && filters.keyword.trim()) {
          const kw = filters.keyword.toLowerCase();
          enrichedWorkers = enrichedWorkers.filter((w) => {
            const searchable = [
              w.full_name,
              w.title,
              w.company,
              w.location,
              ...(w.skills || []),
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase();
            return searchable.includes(kw);
          });
        }

        if (filters.role) {
          const role = filters.role.toLowerCase();
          enrichedWorkers = enrichedWorkers.filter((w) => {
            const titleMatch = w.title?.toLowerCase().includes(role);
            const skillsMatch = w.skills?.some((s) => s.toLowerCase().includes(role));
            return titleMatch || skillsMatch;
          });
        }

        if (filters.country) {
          const country = filters.country.toLowerCase();
          enrichedWorkers = enrichedWorkers.filter((w) =>
            w.location?.toLowerCase().includes(country)
          );
        }

        if (filters.availability) {
          enrichedWorkers = enrichedWorkers.filter((w) => {
            if (filters.availability === 'Immediately') {
              return w.availability_status === 'available' || w.employment_status === 'unemployed';
            }
            if (filters.availability === 'Within 2 weeks') {
              return w.availability_status === 'available' || w.notice_period === '2_weeks' || w.notice_period === 'immediate';
            }
            if (filters.availability === 'Within 1 month') {
              return w.availability_status === 'available' || w.notice_period === '2_weeks' || w.notice_period === '1_month' || w.notice_period === 'immediate';
            }
            if (filters.availability === 'Within 3 months') {
              return w.availability_status !== 'not_available';
            }
            return true;
          });
        }

        if (filters.certification) {
          const cert = filters.certification.toLowerCase();
          enrichedWorkers = enrichedWorkers.filter((w) =>
            w.certificationNames.some((c) => c.toLowerCase().includes(cert))
          );
        }

        if (filters.experience) {
          enrichedWorkers = enrichedWorkers.filter((w) => {
            const years = w.years_experience || 0;
            if (filters.experience === '0-2 years') return years <= 2;
            if (filters.experience === '3-5 years') return years >= 3 && years <= 5;
            if (filters.experience === '5-10 years') return years >= 5 && years <= 10;
            if (filters.experience === '10+ years') return years > 10;
            return true;
          });
        }
      }

      console.log('[WorkerSearch] Final filtered result count:', enrichedWorkers.length);
      setWorkers(enrichedWorkers);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch workers';
      console.error('[WorkerSearch] Error:', message, err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Auto-search on mount - NO filters applied on initial load
  useEffect(() => {
    fetchWorkers(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = () => {
    fetchWorkers(true);
  };

  const handleClear = () => {
    setFilters({ keyword: '', role: '', country: '', availability: '', certification: '', experience: '' });
    // Re-fetch without filters
    setTimeout(() => fetchWorkers(false), 0);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Company"
        title="Worker Search"
        description="Search available industrial workers by role, location, certifications, and experience."
        actions={
          <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-zinc-500">
            <Search className="h-3.5 w-3.5" />
            {workers.length > 0 && `${workers.length} result${workers.length !== 1 ? 's' : ''}`}
          </span>
        }
      />

      {/* Search Bar */}
      <div className="flex items-center gap-2 rounded-sm border border-zinc-800 bg-zinc-950 px-4 py-3">
        <Search className="h-5 w-5 text-zinc-500" />
        <input
          placeholder="Search workers by name, skill, or keyword..."
          value={filters.keyword}
          onChange={(e) => setFilters((prev) => ({ ...prev, keyword: e.target.value }))}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          className="flex-1 bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-600"
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          className="rounded-sm bg-[#f59e0b] px-4 py-1.5 text-xs font-semibold text-black hover:bg-[#d97706] transition disabled:opacity-50"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {/* Filters */}
      <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-[#f59e0b]" />
          <h3 className="text-sm font-semibold text-zinc-200">Filters</h3>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <FilterSelect
            label="Role / Trade"
            name="role"
            value={filters.role}
            onChange={handleChange}
            icon={Wrench}
            options={['', 'Pipe Fitter', 'Welder', 'Electrician', 'Rigger', 'Scaffolder', 'Instrument Tech', 'Mechanical Fitter', 'Painter/Blaster']}
          />
          <FilterSelect
            label="Country"
            name="country"
            value={filters.country}
            onChange={handleChange}
            icon={MapPin}
            options={['', 'UAE', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Philippines', 'India', 'Poland', 'Romania', 'Kazakhstan']}
          />
          <FilterSelect
            label="Availability"
            name="availability"
            value={filters.availability}
            onChange={handleChange}
            icon={Clock}
            options={['', 'Immediately', 'Within 2 weeks', 'Within 1 month', 'Within 3 months']}
          />
          <FilterSelect
            label="Certification"
            name="certification"
            value={filters.certification}
            onChange={handleChange}
            icon={Shield}
            options={['', 'ASME IX', 'AWS D1.1', '6G', 'CISRS', 'LEEA', 'CompEx', 'NEBOSH', 'IOSH']}
          />
          <FilterSelect
            label="Experience Level"
            name="experience"
            value={filters.experience}
            onChange={handleChange}
            icon={Users}
            options={['', '0-2 years', '3-5 years', '5-10 years', '10+ years']}
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button onClick={handleSearch} className="text-xs text-[#f59e0b] hover:underline">
            Apply Filters
          </button>
          <button onClick={handleClear} className="text-xs text-zinc-500 hover:text-zinc-300">
            Clear All
          </button>
        </div>
      </div>

      {/* Results */}
      {loading && (
        <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-12 text-center space-y-3">
          <Loader2 className="h-8 w-8 text-[#f59e0b] mx-auto animate-spin" />
          <p className="text-sm text-zinc-400">Searching workers...</p>
        </div>
      )}

      {error && (
        <div className="border border-red-900/50 bg-red-950/20 rounded-sm p-6 text-center space-y-2">
          <AlertCircle className="h-8 w-8 text-red-400 mx-auto" />
          <p className="text-sm text-red-300">{error}</p>
          <button onClick={handleSearch} className="text-xs text-[#f59e0b] hover:underline">
            Try again
          </button>
        </div>
      )}

      {!loading && !error && searched && workers.length === 0 && (
        <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-12 text-center space-y-3">
          <Users className="h-10 w-10 text-zinc-700 mx-auto" />
          <p className="text-sm text-zinc-400">No workers found. Try changing your filters.</p>
          <p className="text-[11px] text-zinc-600">Check browser console for debug information.</p>
        </div>
      )}

      {!loading && !error && workers.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {workers.map((worker) => (
            <WorkerCard key={worker.user_id} worker={worker} onView={() => navigate(`/candidate/${worker.user_id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}

function WorkerCard({ worker, onView }: { worker: WorkerWithCounts; onView: () => void }) {
  const availabilityBadge = getAvailabilityBadge(worker);

  return (
    <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-5 space-y-4 hover:border-zinc-700 transition">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 text-sm font-bold shrink-0 overflow-hidden">
          {worker.avatar_url && worker.show_avatar ? (
            <img src={worker.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            (worker.full_name || worker.username || '?')[0].toUpperCase()
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-zinc-100 truncate">{worker.full_name || worker.username || 'Worker'}</h4>
          <p className="text-xs text-zinc-400 truncate">{worker.title || 'Position not specified'}</p>
          {worker.company && (
            <p className="text-[11px] text-zinc-500 truncate flex items-center gap-1">
              <Briefcase className="h-3 w-3" />
              {worker.company}
            </p>
          )}
        </div>
      </div>

      {/* Location & Experience */}
      <div className="flex flex-wrap gap-2 text-[11px]">
        {worker.location ? (
          <span className="flex items-center gap-1 text-zinc-400">
            <MapPin className="h-3 w-3" />
            {worker.location}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-zinc-600">
            <MapPin className="h-3 w-3" />
            Location not specified
          </span>
        )}
        {worker.years_experience != null && worker.years_experience > 0 && (
          <span className="flex items-center gap-1 text-zinc-400">
            <Clock className="h-3 w-3" />
            {worker.years_experience} yrs
          </span>
        )}
      </div>

      {/* Skills */}
      {worker.skills && worker.skills.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {worker.skills.slice(0, 4).map((skill) => (
            <span key={skill} className="rounded-sm bg-zinc-800/80 px-2 py-0.5 text-[10px] text-zinc-300">
              {skill}
            </span>
          ))}
          {worker.skills.length > 4 && (
            <span className="rounded-sm bg-zinc-800/50 px-2 py-0.5 text-[10px] text-zinc-500">
              +{worker.skills.length - 4}
            </span>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-sm bg-zinc-800/50 px-2 py-0.5 text-[10px] text-zinc-600">
            No skills listed
          </span>
        </div>
      )}

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5">
        {availabilityBadge ? (
          <span className={`inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-[10px] font-medium ${availabilityBadge.className}`}>
            {availabilityBadge.label}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-sm bg-zinc-800/50 border border-zinc-700/30 px-2 py-0.5 text-[10px] text-zinc-500">
            Availability not specified
          </span>
        )}
        {worker.willing_to_travel && (
          <span className="inline-flex items-center gap-1 rounded-sm bg-blue-950/50 border border-blue-800/30 px-2 py-0.5 text-[10px] text-blue-300">
            <Plane className="h-2.5 w-2.5" />
            Travel
          </span>
        )}
        {worker.willing_to_relocate && (
          <span className="inline-flex items-center gap-1 rounded-sm bg-purple-950/50 border border-purple-800/30 px-2 py-0.5 text-[10px] text-purple-300">
            <Home className="h-2.5 w-2.5" />
            Relocate
          </span>
        )}
      </div>

      {/* Stats Row */}
      <div className="flex items-center gap-4 text-[11px] text-zinc-500 border-t border-zinc-800/60 pt-3">
        <span className="flex items-center gap-1" title="Certifications">
          <Award className="h-3 w-3" />
          {worker.certificationCount}
        </span>
        <span className="flex items-center gap-1" title="Experience entries">
          <Briefcase className="h-3 w-3" />
          {worker.experienceCount}
        </span>
        <span className="flex items-center gap-1" title="Documents">
          <FileText className="h-3 w-3" />
          {worker.documentCount}
        </span>
        <span className="ml-auto flex items-center gap-1">
          <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#f59e0b] rounded-full transition-all"
              style={{ width: `${worker.completenessPercent}%` }}
            />
          </div>
          <span className="text-[10px] text-zinc-400">{worker.completenessPercent}%</span>
        </span>
      </div>

      {/* Certifications preview */}
      {worker.certificationNames.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {worker.certificationNames.slice(0, 3).map((name) => (
            <span key={name} className="rounded-sm bg-emerald-950/40 border border-emerald-800/30 px-1.5 py-0.5 text-[9px] text-emerald-300">
              {name}
            </span>
          ))}
          {worker.certificationNames.length > 3 && (
            <span className="text-[9px] text-zinc-500">+{worker.certificationNames.length - 3}</span>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1">
          <span className="text-[9px] text-zinc-600">No certifications</span>
        </div>
      )}

      {/* Action */}
      <button
        onClick={onView}
        className="w-full flex items-center justify-center gap-2 rounded-sm border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800 hover:border-[#f59e0b]/50 transition"
      >
        <Eye className="h-3.5 w-3.5" />
        View Profile
      </button>
    </div>
  );
}

function getAvailabilityBadge(worker: WorkerWithCounts): { label: string; className: string } | null {
  if (worker.availability_status === 'available' || worker.employment_status === 'unemployed') {
    return { label: 'Available Now', className: 'bg-green-950/50 border border-green-800/30 text-green-300' };
  }
  if (worker.availability_status === 'open_to_offers') {
    return { label: 'Open to Offers', className: 'bg-amber-950/50 border border-amber-800/30 text-amber-300' };
  }
  if (worker.availability_status === 'not_available') {
    return { label: 'Not Available', className: 'bg-zinc-800/50 border border-zinc-700/30 text-zinc-400' };
  }
  if (worker.employment_status === 'employed') {
    return { label: 'Employed', className: 'bg-zinc-800/50 border border-zinc-700/30 text-zinc-400' };
  }
  return null;
}

function FilterSelect({ label, name, value, onChange, icon: Icon, options }: {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  icon: React.ElementType;
  options: string[];
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        <Icon className="h-3 w-3" />
        {label}
      </label>
      <select
        name={name}
        value={value}
        onChange={onChange}
        className="w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300 outline-none focus:border-[#f59e0b]/50 transition"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt || 'All'}</option>
        ))}
      </select>
    </div>
  );
}