import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  CheckCircle2,
  Loader2,
  BookOpen,
  HelpCircle,
} from 'lucide-react';
import { supabase, TABLES } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import Markdown from 'markdown-to-jsx';

interface Lesson {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  content_type: string;
  content: string | null;
  content_url: string | null;
  duration_minutes: number;
  order_index: number;
  official_ref: string | null;
}

interface Course {
  id: string;
  title: string;
  slug: string;
}

export default function LessonView() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [allLessons, setAllLessons] = useState<Lesson[]>([]);
  const [progressStatus, setProgressStatus] = useState<string>('not_started');
  const [marking, setMarking] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchLesson = useCallback(async () => {
    if (!lessonId) return;
    setLoading(true);

    const { data: lessonData } = await supabase
      .from(TABLES.academyLessons)
      .select('*')
      .eq('id', lessonId)
      .single();

    if (!lessonData) {
      setLoading(false);
      return;
    }

    setLesson(lessonData as Lesson);

    // Fetch course
    const { data: courseData } = await supabase
      .from(TABLES.academyCourses)
      .select('id, title, slug')
      .eq('id', lessonData.course_id)
      .single();
    setCourse(courseData as Course);

    // Fetch all lessons in course (for prev/next navigation)
    const { data: lessonsData } = await supabase
      .from(TABLES.academyLessons)
      .select('*')
      .eq('course_id', lessonData.course_id)
      .order('order_index', { ascending: true });
    setAllLessons((lessonsData as Lesson[]) ?? []);

    // Fetch progress
    if (user) {
      const { data: progressData } = await supabase
        .from(TABLES.academyProgress)
        .select('status')
        .eq('user_id', user.id)
        .eq('lesson_id', lessonId)
        .single();
      setProgressStatus(progressData?.status ?? 'not_started');
    }

    setLoading(false);
  }, [lessonId, user]);

  useEffect(() => {
    fetchLesson();
  }, [fetchLesson]);

  const markComplete = async () => {
    if (!user || !lesson) return;
    setMarking(true);

    const existing = await supabase
      .from(TABLES.academyProgress)
      .select('id')
      .eq('user_id', user.id)
      .eq('lesson_id', lesson.id)
      .single();

    if (existing.data) {
      await supabase
        .from(TABLES.academyProgress)
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('lesson_id', lesson.id);
    } else {
      await supabase.from(TABLES.academyProgress).insert({
        user_id: user.id,
        lesson_id: lesson.id,
        course_id: lesson.course_id,
        status: 'completed',
        completed_at: new Date().toISOString(),
      });
    }

    setMarking(false);
    setProgressStatus('completed');
    toast.success('Lesson completed!');

    // Auto-navigate to next lesson if available
    const currentIdx = allLessons.findIndex((l) => l.id === lesson.id);
    if (currentIdx >= 0 && currentIdx < allLessons.length - 1) {
      const nextLesson = allLessons[currentIdx + 1];
      setTimeout(() => navigate(`/academy/lesson/${nextLesson.id}`), 1000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 text-[#f59e0b] animate-spin" />
      </div>
    );
  }

  if (!lesson || !course) {
    return (
      <div className="text-center py-24 space-y-3">
        <p className="text-sm text-zinc-500">Lesson not found.</p>
        <Link to="/academy" className="text-xs text-[#f59e0b] hover:underline">← Back to Academy</Link>
      </div>
    );
  }

  const currentIdx = allLessons.findIndex((l) => l.id === lesson.id);
  const prevLesson = currentIdx > 0 ? allLessons[currentIdx - 1] : null;
  const nextLesson = currentIdx < allLessons.length - 1 ? allLessons[currentIdx + 1] : null;
  const isCompleted = progressStatus === 'completed';

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <Link to="/academy" className="hover:text-zinc-300">Academy</Link>
        <span>/</span>
        <Link to={`/academy/course/${course.slug}`} className="hover:text-zinc-300">{course.title}</Link>
        <span>/</span>
        <span className="text-zinc-400">{lesson.title}</span>
      </div>

      {/* Lesson header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-zinc-600">
          <span className="flex items-center gap-1">
            <BookOpen className="h-3 w-3" />
            Lesson {currentIdx + 1} of {allLessons.length}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {lesson.duration_minutes} min
          </span>
          {lesson.official_ref && (
            <span className="text-[#f59e0b]">{lesson.official_ref}</span>
          )}
        </div>
        <h1 className="text-2xl font-bold text-zinc-100">{lesson.title}</h1>
        {lesson.description && (
          <p className="text-sm text-zinc-400">{lesson.description}</p>
        )}
      </div>

      {/* Lesson content */}
      <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-6 min-h-[400px]">
        {lesson.content_type === 'text' && lesson.content && (
          <div className="prose prose-invert prose-sm max-w-none">
            <Markdown
              options={{
                overrides: {
                  h1: { props: { className: 'text-xl font-bold text-zinc-100 mt-6 mb-3' } },
                  h2: { props: { className: 'text-lg font-semibold text-zinc-100 mt-5 mb-2' } },
                  h3: { props: { className: 'text-base font-medium text-zinc-200 mt-4 mb-2' } },
                  p: { props: { className: 'text-sm text-zinc-300 leading-relaxed mb-3' } },
                  ul: { props: { className: 'text-sm text-zinc-300 mb-3 space-y-1 list-disc list-inside' } },
                  ol: { props: { className: 'text-sm text-zinc-300 mb-3 space-y-1 list-decimal list-inside' } },
                  strong: { props: { className: 'text-zinc-100 font-semibold' } },
                  code: { props: { className: 'text-[#f59e0b] bg-zinc-800/60 px-1 py-0.5 rounded text-xs' } },
                  table: { props: { className: 'w-full text-xs border border-zinc-800 my-3' } },
                  th: { props: { className: 'border border-zinc-800 px-2 py-1 text-left text-zinc-300 font-medium bg-zinc-900' } },
                  td: { props: { className: 'border border-zinc-800 px-2 py-1 text-zinc-400' } },
                },
              }}
            >
              {lesson.content}
            </Markdown>
          </div>
        )}

        {lesson.content_type === 'video' && lesson.content_url && (
          <div className="space-y-3">
            <div className="aspect-video bg-black rounded-sm flex items-center justify-center">
              <video src={lesson.content_url} controls className="w-full h-full rounded-sm" />
            </div>
          </div>
        )}

        {lesson.content_type === 'pdf' && lesson.content_url && (
          <div className="space-y-3">
            <iframe src={lesson.content_url} className="w-full h-[600px] bg-white rounded-sm" title={lesson.title} />
          </div>
        )}

        {lesson.content_type === 'quiz' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <HelpCircle className="h-4 w-4 text-[#f59e0b]" />
              Practice Quiz
            </div>
            <p className="text-sm text-zinc-500">
              This lesson contains a practice quiz. The quiz engine will be available soon.
              For now, review the course material and mark this lesson as complete.
            </p>
          </div>
        )}

        {lesson.content_type === 'text' && !lesson.content && (
          <p className="text-sm text-zinc-500 text-center py-12">Lesson content coming soon.</p>
        )}
      </div>

      {/* Mark complete */}
      <div className="flex items-center justify-between">
        <button
          onClick={markComplete}
          disabled={marking || isCompleted || !user}
          className={`flex items-center gap-2 px-4 py-2 rounded-sm text-xs font-medium transition ${
            isCompleted
              ? 'bg-green-500/10 text-green-400 border border-green-500/30'
              : 'bg-[#f59e0b] text-black hover:bg-[#d97706]'
          } ${!user ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {marking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isCompleted ? (
            <><CheckCircle2 className="h-4 w-4" /> Completed</>
          ) : (
            <>Mark as Complete</>
          )}
        </button>

        <span className="text-[10px] text-zinc-600">
          {currentIdx + 1} / {allLessons.length}
        </span>
      </div>

      {/* Prev/Next navigation */}
      <div className="flex items-center justify-between border-t border-zinc-800 pt-4">
        {prevLesson ? (
          <Link
            to={`/academy/lesson/${prevLesson.id}`}
            className="flex items-center gap-2 text-xs text-zinc-400 hover:text-[#f59e0b] transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <div>
              <p className="text-[9px] uppercase tracking-wider text-zinc-600">Previous</p>
              <p>{prevLesson.title}</p>
            </div>
          </Link>
        ) : (
          <div />
        )}

        {nextLesson ? (
          <Link
            to={`/academy/lesson/${nextLesson.id}`}
            className="flex items-center gap-2 text-xs text-zinc-400 hover:text-[#f59e0b] transition text-right"
          >
            <div>
              <p className="text-[9px] uppercase tracking-wider text-zinc-600">Next</p>
              <p>{nextLesson.title}</p>
            </div>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <Link
            to={`/academy/course/${course.slug}`}
            className="flex items-center gap-2 text-xs text-[#f59e0b] hover:underline"
          >
            <div className="text-right">
              <p className="text-[9px] uppercase tracking-wider text-zinc-600">Finish</p>
              <p>Back to course</p>
            </div>
            <CheckCircle2 className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}
