import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  GraduationCap,
  Clock,
  BookOpen,
  Lock,
  CheckCircle2,
  Loader2,
  TrendingUp,
  Shield,
  Award,
  Search,
  ChevronRight,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { supabase, TABLES } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

interface Course {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  level: string;
  category: string;
  thumbnail_url: string | null;
  estimated_hours: number;
  lessons_count: number;
  is_premium: boolean;
  price_eur: number;
  cert_body: string | null;
  language: string;
}

interface ProgressMap {
  [courseId: string]: { completed: number; total: number };
}

const CATEGORIES = ['All', 'Piping Fundamentals', 'Safety & Compliance', 'Welding', 'Codes & Standards', 'Software'];
const LEVELS: Record<string, string> = {
  beginner: 'text-emerald-400 border-emerald-400/40',
  intermediate: 'text-amber-400 border-amber-400/40',
  advanced: 'text-red-400 border-red-400/40',
};

export default function Academy() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [progress, setProgress] = useState<ProgressMap>({});
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('All');
  const [search, setSearch] = useState('');

  const fetchCourses = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from(TABLES.academyCourses)
      .select('*')
      .eq('is_published', true)
      .order('order_index', { ascending: true });

    if (error) {
      console.error('[Academy] Error fetching courses:', error);
    }
    setCourses((data as Course[]) ?? []);
    setLoading(false);
  }, []);

  const fetchProgress = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from(TABLES.academyLessons)
      .select('id, course_id');

    if (!data) return;

    // Count total lessons per course
    const totals: Record<string, number> = {};
    data.forEach((l: { course_id: string }) => {
      totals[l.course_id] = (totals[l.course_id] ?? 0) + 1;
    });

    // Fetch completed lessons
    const { data: progressData } = await supabase
      .from(TABLES.academyProgress)
      .select('course_id')
      .eq('user_id', user.id)
      .eq('status', 'completed');

    const completed: Record<string, number> = {};
    (progressData ?? []).forEach((p: { course_id: string }) => {
      completed[p.course_id] = (completed[p.course_id] ?? 0) + 1;
    });

    const progressMap: ProgressMap = {};
    Object.keys(totals).forEach((courseId) => {
      progressMap[courseId] = {
        completed: completed[courseId] ?? 0,
        total: totals[courseId],
      };
    });
    setProgress(progressMap);
  }, [user]);

  useEffect(() => {
    fetchCourses();
    fetchProgress();
  }, [fetchCourses, fetchProgress]);

  const filteredCourses = courses.filter((c) => {
    if (activeCategory !== 'All' && c.category !== activeCategory) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return c.title.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q);
  });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t('academy.eyebrow', 'Certification Training')}
        title={t('academy.title', 'PipingBox Academy')}
        description="Certification preparation and technical courses for pipefitters, welders, and engineers."
        actions={
          <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-zinc-500">
            <GraduationCap className="h-3.5 w-3.5" />
            {courses.length} Courses
          </span>
        }
      />

      {/* Quick link to VCA booking */}
      <Link
        to="/academy/vca-booking"
        className="flex items-center justify-between border border-[#f59e0b]/30 bg-[#f59e0b]/5 rounded-sm p-4 hover:bg-[#f59e0b]/10 transition"
      >
        <div className="flex items-center gap-3">
          <Shield className="h-5 w-5 text-[#f59e0b]" />
          <div>
            <p className="text-sm font-semibold text-zinc-200">Book Your Official VCA Exam</p>
            <p className="text-xs text-zinc-500">Browse exam centers and book your reservation</p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-[#f59e0b]" />
      </Link>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-1.5">
          <Search className="h-4 w-4 text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search courses..."
            className="h-7 w-[200px] bg-transparent text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-2.5 py-1 rounded-sm text-[10px] uppercase tracking-wider font-medium transition ${
                activeCategory === cat
                  ? 'bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/30'
                  : 'bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Courses grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 text-[#f59e0b] animate-spin" />
        </div>
      ) : filteredCourses.length === 0 ? (
        <div className="border border-zinc-800/60 bg-[#0d0d0d] rounded-sm p-8 text-center">
          <BookOpen className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
          <p className="text-xs text-zinc-500">No courses found.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredCourses.map((course) => {
            const courseProgress = progress[course.id];
            const pct = courseProgress ? Math.round((courseProgress.completed / courseProgress.total) * 100) : 0;
            const isComplete = courseProgress && courseProgress.completed === courseProgress.total;

            return (
              <Link
                key={course.id}
                to={`/academy/course/${course.slug}`}
                className="group border border-zinc-800/80 bg-[#0d0d0d] rounded-sm overflow-hidden hover:border-[#f59e0b]/40 transition-all duration-300"
              >
                {/* Thumbnail area */}
                <div className="relative h-32 bg-gradient-to-br from-zinc-900 to-[#0d0d0d] flex items-center justify-center overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-[#f59e0b]/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <GraduationCap className="h-10 w-10 text-zinc-700 group-hover:text-[#f59e0b]/50 transition-colors" />

                  {/* Badges */}
                  <div className="absolute top-2 left-2 flex flex-col gap-1">
                    {course.is_premium ? (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] uppercase tracking-wider bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20 rounded-sm">
                        <Lock className="h-2.5 w-2.5" />
                        Premium
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider bg-green-500/10 text-green-400 border border-green-500/20 rounded-sm">
                        Free
                      </span>
                    )}
                    {isComplete && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-sm">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        Completed
                      </span>
                    )}
                  </div>

                  {/* Price */}
                  {course.is_premium && (
                    <div className="absolute top-2 right-2">
                      <span className="text-sm font-bold text-[#f59e0b]">€{course.price_eur}</span>
                    </div>
                  )}

                  {/* Progress bar */}
                  {pct > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-800">
                      <div className="h-full bg-[#f59e0b] transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 text-[9px] uppercase tracking-wider border rounded-sm ${LEVELS[course.level] ?? LEVELS.beginner}`}>
                      {course.level}
                    </span>
                    {course.cert_body && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] uppercase tracking-wider bg-zinc-800/60 text-zinc-400 rounded-sm">
                        <Award className="h-2.5 w-2.5" />
                        {course.cert_body}
                      </span>
                    )}
                  </div>

                  <h3 className="text-sm font-semibold text-zinc-100 group-hover:text-[#f59e0b] transition-colors">
                    {course.title}
                  </h3>

                  <p className="text-[11px] text-zinc-500 line-clamp-2">
                    {course.description}
                  </p>

                  <div className="flex items-center justify-between pt-1 text-[10px] text-zinc-600">
                    <span className="flex items-center gap-1">
                      <BookOpen className="h-3 w-3" />
                      {course.lessons_count} lessons
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {course.estimated_hours}h
                    </span>
                    {pct > 0 && (
                      <span className="flex items-center gap-1 text-[#f59e0b]">
                        <TrendingUp className="h-3 w-3" />
                        {pct}%
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
