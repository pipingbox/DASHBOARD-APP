import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Clock,
  BookOpen,
  CheckCircle2,
  Loader2,
  Lock,
  Shield,
  Award,
  PlayCircle,
  FileText,
  HelpCircle,
  ChevronRight,
  GraduationCap,
} from 'lucide-react';
import { supabase, TABLES } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface Course {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  level: string;
  category: string;
  estimated_hours: number;
  lessons_count: number;
  is_premium: boolean;
  price_eur: number;
  cert_body: string | null;
}

interface Lesson {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  content_type: string;
  duration_minutes: number;
  order_index: number;
  is_free_preview: boolean;
  official_ref: string | null;
}

interface ProgressEntry {
  lesson_id: string;
  status: string;
}

const CONTENT_ICONS: Record<string, React.ElementType> = {
  text: FileText,
  video: PlayCircle,
  pdf: FileText,
  quiz: HelpCircle,
};

export default function CourseDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [progress, setProgress] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const fetchCourse = useCallback(async () => {
    if (!slug) return;
    setLoading(true);

    const { data: courseData } = await supabase
      .from(TABLES.academyCourses)
      .select('*')
      .eq('slug', slug)
      .single();

    if (!courseData) {
      setLoading(false);
      return;
    }

    setCourse(courseData as Course);

    const { data: lessonsData } = await supabase
      .from(TABLES.academyLessons)
      .select('*')
      .eq('course_id', courseData.id)
      .order('order_index', { ascending: true });

    setLessons((lessonsData as Lesson[]) ?? []);

    // Fetch progress
    if (user) {
      const { data: progressData } = await supabase
        .from(TABLES.academyProgress)
        .select('lesson_id, status')
        .eq('user_id', user.id)
        .eq('course_id', courseData.id);

      const progressMap: Record<string, string> = {};
      (progressData ?? []).forEach((p: ProgressEntry) => {
        progressMap[p.lesson_id] = p.status;
      });
      setProgress(progressMap);
    }

    setLoading(false);
  }, [slug, user]);

  useEffect(() => {
    fetchCourse();
  }, [fetchCourse]);

  const completedCount = Object.values(progress).filter((s) => s === 'completed').length;
  const totalLessons = lessons.length;
  const pct = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 text-[#f59e0b] animate-spin" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="text-center py-24 space-y-3">
        <p className="text-sm text-zinc-500">Course not found.</p>
        <Link to="/academy" className="text-xs text-[#f59e0b] hover:underline">← Back to Academy</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link to="/academy" className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Academy
      </Link>

      {/* Course header */}
      <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-2 py-0.5 text-[10px] uppercase tracking-wider border rounded-sm ${
                course.level === 'beginner' ? 'text-emerald-400 border-emerald-400/40' :
                course.level === 'intermediate' ? 'text-amber-400 border-amber-400/40' :
                'text-red-400 border-red-400/40'
              }`}>
                {course.level}
              </span>
              <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-zinc-800/60 text-zinc-400 rounded-sm">
                {course.category}
              </span>
              {course.cert_body && (
                <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-wider bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20 rounded-sm">
                  <Award className="h-3 w-3" />
                  {course.cert_body}
                </span>
              )}
              {course.is_premium ? (
                <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-wider bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20 rounded-sm">
                  <Lock className="h-3 w-3" />
                  Premium · €{course.price_eur}
                </span>
              ) : (
                <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-green-500/10 text-green-400 border border-green-500/20 rounded-sm">
                  Free
                </span>
              )}
            </div>

            <h1 className="text-2xl font-bold text-zinc-100">{course.title}</h1>
            <p className="text-sm text-zinc-400 max-w-3xl">{course.description}</p>

            <div className="flex items-center gap-4 text-xs text-zinc-500 pt-1">
              <span className="flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5" />
                {totalLessons} lessons
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {course.estimated_hours}h estimated
              </span>
              {completedCount > 0 && (
                <span className="flex items-center gap-1.5 text-[#f59e0b]">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {completedCount}/{totalLessons} completed ({pct}%)
                </span>
              )}
            </div>
          </div>

          {course.cert_body && (
            <div className="hidden md:flex flex-col items-center gap-1 text-center shrink-0">
              <Shield className="h-8 w-8 text-[#f59e0b]" />
              <p className="text-[9px] uppercase tracking-wider text-zinc-600">Official Prep</p>
              <p className="text-[10px] text-zinc-500">{course.cert_body}</p>
            </div>
          )}
        </div>

        {/* Progress bar */}
        {pct > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-zinc-500">
              <span>Course Progress</span>
              <span className="text-[#f59e0b] font-medium">{pct}%</span>
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-[#f59e0b] rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {/* Legal disclaimer for cert courses */}
        {course.cert_body && (
          <div className="border border-[#f59e0b]/20 bg-[#f59e0b]/5 rounded-sm p-3">
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              <strong className="text-[#f59e0b]">Important:</strong> PipingBox prepares you for the exam.
              The official certificate is issued by <strong className="text-zinc-300">{course.cert_body}</strong> through recognized exam centers.
              {course.slug === 'vca-preparation' && (
                <> <Link to="/academy/vca-booking" className="text-[#f59e0b] hover:underline">Book your official VCA exam →</Link></>
              )}
            </p>
          </div>
        )}
      </div>

      {/* Lessons list */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-200">Course Content</h2>

        {lessons.length === 0 ? (
          <div className="border border-zinc-800/60 bg-[#0d0d0d] rounded-sm p-6 text-center">
            <p className="text-xs text-zinc-500">No lessons available yet.</p>
          </div>
        ) : (
          <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm overflow-hidden">
            {lessons.map((lesson, idx) => {
              const Icon = CONTENT_ICONS[lesson.content_type] ?? FileText;
              const lessonStatus = progress[lesson.id] ?? 'not_started';
              const isCompleted = lessonStatus === 'completed';
              const isLocked = course.is_premium && !lesson.is_free_preview && !user;

              return (
                <Link
                  key={lesson.id}
                  to={isLocked ? '#' : `/academy/lesson/${lesson.id}`}
                  className={`flex items-center gap-3 p-4 border-b border-zinc-800/50 last:border-0 transition ${
                    isLocked ? 'opacity-50 cursor-not-allowed' : 'hover:bg-zinc-900/50'
                  }`}
                  onClick={(e) => isLocked && e.preventDefault()}
                >
                  {/* Status icon */}
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                    isCompleted
                      ? 'bg-green-500/10 border-green-500/30 text-green-400'
                      : isLocked
                        ? 'bg-zinc-800 border-zinc-700 text-zinc-600'
                        : 'bg-zinc-900 border-zinc-700 text-zinc-500'
                  }`}>
                    {isCompleted ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : isLocked ? (
                      <Lock className="h-3.5 w-3.5" />
                    ) : (
                      <span className="text-[10px] font-bold">{idx + 1}</span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className={`text-sm font-medium ${isCompleted ? 'text-zinc-400' : 'text-zinc-200'}`}>
                      {lesson.title}
                    </p>
                    {lesson.description && (
                      <p className="text-[11px] text-zinc-500 line-clamp-1">{lesson.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-[10px] text-zinc-600">
                      <span className="flex items-center gap-1">
                        <Icon className="h-3 w-3" />
                        {lesson.content_type}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {lesson.duration_minutes} min
                      </span>
                      {lesson.official_ref && (
                        <span className="text-zinc-700">{lesson.official_ref}</span>
                      )}
                      {lesson.is_free_preview && course.is_premium && (
                        <span className="text-green-400">Free preview</span>
                      )}
                    </div>
                  </div>

                  <ChevronRight className="h-4 w-4 text-zinc-700 shrink-0" />
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Course completion */}
      {pct === 100 && (
        <div className="border border-green-500/30 bg-green-500/5 rounded-sm p-5 text-center space-y-2">
          <GraduationCap className="h-8 w-8 text-green-400 mx-auto" />
          <h3 className="text-sm font-semibold text-zinc-200">Course Completed!</h3>
          <p className="text-xs text-zinc-400">You've completed all lessons in this course.</p>
          {course.cert_body && (
            <p className="text-xs text-[#f59e0b]">
              Ready for the official exam? <Link to="/academy/vca-booking" className="underline">Book your exam →</Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
