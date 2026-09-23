import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
import { localizedCourse } from '@/lib/academy/courseI18n';
import { localizedLesson, type LessonContentI18n } from '@/lib/academy/lessonI18n';
import { hasCourseEntitlement, courseProductKeys } from '@/lib/academy/entitlement';
import { getCourseNetPriceEur } from '@/lib/academy/pricing';
import { redirectToCheckout } from '@/lib/stripe';
import { SupplyConsentCheckbox } from '@/components/academy/SupplyConsentCheckbox';
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
  content_i18n?: Record<string, LessonContentI18n> | null;
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
  const { t, i18n } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const { user, profile } = useAuth();
  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [progress, setProgress] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  // PB-MARKET-ACCESS-001: entitlement resolved from canonical sources only.
  // Default false (fail-closed) until proven otherwise.
  const [courseAccess, setCourseAccess] = useState(false);
  // PB-MARKET-PRICING-001: net price with catalog priority; price_eur is a
  // display cache only.
  const [netPriceEur, setNetPriceEur] = useState<number | null>(null);
  // PB-MARKET-CONSENT-001: immediate-supply consent, NEVER pre-ticked, and the
  // in-flight checkout state. The server re-checks the catalog flag, so this
  // state is the UX half of a server-enforced rule.
  const [supplyConsent, setSupplyConsent] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

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

    // PB-MARKET-ACCESS-001: resolve entitlement from canonical sources
    // (paid order / admin). Non-premium short-circuits to true inside.
    const access = await hasCourseEntitlement(
      { userId: user?.id ?? null, role: profile?.role ?? null },
      { slug: courseData.slug, is_premium: courseData.is_premium },
    );
    setCourseAccess(access);

    // PB-MARKET-PRICING-001: resolve the display price from the catalog
    // (single source of truth) with the course column as display cache.
    const netEur = await getCourseNetPriceEur(courseData.slug, courseData.price_eur);
    setNetPriceEur(netEur);

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
  }, [slug, user, profile]);

  useEffect(() => {
    fetchCourse();
  }, [fetchCourse]);

  const completedCount = Object.values(progress).filter((s) => s === 'completed').length;
  const totalLessons = lessons.length;
  const pct = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

  // PB-MARKET-CONSENT-001: the consent checkbox gates the CTA client-side;
  // create-checkout enforces the same rule server-side from the catalog flag.
  const handleBuy = async () => {
    if (!course) return;
    const keys = courseProductKeys(course.slug);
    if (keys.length === 0) {
      setCheckoutError(t('checkout.errorGeneric'));
      return;
    }
    if (!supplyConsent) {
      setCheckoutError(t('checkout.consentRequired', 'Please tick the consent checkbox to continue.'));
      return;
    }
    setCheckoutBusy(true);
    setCheckoutError(null);
    const reason = await redirectToCheckout(keys, undefined, { supplyConsent: true });
    if (reason) {
      setCheckoutBusy(false);
      setCheckoutError(
        reason === 'consent_required'
          ? t('checkout.consentRequired', 'Please tick the consent checkbox to continue.')
          : reason === 'not_available'
            ? t('checkout.notAvailablePack')
            : t('checkout.errorGeneric'),
      );
    }
    // null → the browser is already navigating to Stripe.
  };

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
        <p className="text-sm text-zinc-500">{t('academy.course.notFound')}</p>
        <Link to="/academy" className="text-xs text-[#f59e0b] hover:underline">← {t('academy.backToAcademy')}</Link>
      </div>
    );
  }

  const localised = localizedCourse(t, { ...course, description: course.description ?? '' });

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link to="/academy" className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition">
        <ArrowLeft className="h-3.5 w-3.5" />
        {t('academy.backToAcademy')}
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
                  {t('academy.course.premiumPrice', { price: netPriceEur ?? course.price_eur })}
                </span>
              ) : (
                <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-green-500/10 text-green-400 border border-green-500/20 rounded-sm">
                  {t('academy.course.free')}
                </span>
              )}
            </div>

            <h1 className="text-2xl font-bold text-zinc-100">{localised.title}</h1>
            <p className="text-sm text-zinc-400 max-w-3xl">{localised.description}</p>

            <div className="flex items-center gap-4 text-xs text-zinc-500 pt-1">
              <span className="flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5" />
                {t('academy.course.lessonsCount', { count: totalLessons })}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {t('academy.course.estimatedHours', { hours: course.estimated_hours })}
              </span>
              {completedCount > 0 && (
                <span className="flex items-center gap-1.5 text-[#f59e0b]">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {t('academy.course.completedOf', { completed: completedCount, total: totalLessons, pct })}
                </span>
              )}
            </div>
          </div>

          {course.cert_body && (
            <div className="hidden md:flex flex-col items-center gap-1 text-center shrink-0">
              <Shield className="h-8 w-8 text-[#f59e0b]" />
              <p className="text-[9px] uppercase tracking-wider text-zinc-600">{t('academy.course.officialPrep')}</p>
              <p className="text-[10px] text-zinc-500">{course.cert_body}</p>
            </div>
          )}
        </div>

        {/* Progress bar */}
        {pct > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-zinc-500">
              <span>{t('academy.course.progress')}</span>
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
              <strong className="text-[#f59e0b]">{t('academy.course.importantLabel')}</strong>{' '}
              {t('academy.course.certDisclaimer', { certBody: course.cert_body })}
              {course.slug === 'vca-preparation' && (
                <> <Link to="/academy/vca-booking" className="text-[#f59e0b] hover:underline">{t('academy.course.bookVcaExam')}</Link></>
              )}
            </p>
          </div>
        )}
      </div>

      {/* PB-MARKET-ACCESS-001: purchase notice — premium course without entitlement.
          PB-MARKET-CONSENT-001: the (never pre-ticked) immediate-supply consent
          checkbox gates the buy CTA; the server enforces the same rule from the
          catalog flag, so this is the UX half, not the enforcement. */}
      {course.is_premium && !courseAccess && (
        <div className="border border-[#f59e0b]/30 bg-[#f59e0b]/5 rounded-sm p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Lock className="h-5 w-5 text-[#f59e0b] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-zinc-200">
                {t('academy.course.premiumPrice', { price: netPriceEur ?? course.price_eur })}
              </p>
              <p className="text-[11px] text-zinc-500">{t('academy.course.freePreview')}</p>
            </div>
          </div>
          {!user ? (
            <Link
              to="/login"
              className="inline-block bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold px-4 py-2 rounded-sm text-xs transition"
            >
              {t('common.signIn')}
            </Link>
          ) : (
            <div className="space-y-2" data-testid="course-purchase-box">
              <SupplyConsentCheckbox
                checked={supplyConsent}
                onChange={setSupplyConsent}
                disabled={checkoutBusy}
              />
              <button
                type="button"
                onClick={handleBuy}
                disabled={checkoutBusy || !supplyConsent}
                className="bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold px-4 py-2 rounded-sm text-xs transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {checkoutBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {checkoutBusy
                  ? t('checkout.redirecting', 'Redirecting to checkout…')
                  : t('academy.course.buyNow', 'Buy course')}
              </button>
              {checkoutError && (
                <p className="text-[10px] text-red-400">{checkoutError}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Lessons list */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-200">{t('academy.course.content')}</h2>

        {lessons.length === 0 ? (
          <div className="border border-zinc-800/60 bg-[#0d0d0d] rounded-sm p-6 text-center">
            <p className="text-xs text-zinc-500">{t('academy.course.noLessons')}</p>
          </div>
        ) : (
          <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm overflow-hidden">
            {lessons.map((rawLesson, idx) => {
              const lesson = localizedLesson(i18n.language, rawLesson);
              const Icon = CONTENT_ICONS[lesson.content_type] ?? FileText;
              const lessonStatus = progress[lesson.id] ?? 'not_started';
              const isCompleted = lessonStatus === 'completed';
              const isLocked = course.is_premium && !lesson.is_free_preview && !courseAccess;

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
                        {t('academy.course.minutes', { count: lesson.duration_minutes })}
                      </span>
                      {lesson.official_ref && (
                        <span className="text-zinc-700">{lesson.official_ref}</span>
                      )}
                      {lesson.is_free_preview && course.is_premium && (
                        <span className="text-green-400">{t('academy.course.freePreview')}</span>
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
          <h3 className="text-sm font-semibold text-zinc-200">{t('academy.course.completedTitle')}</h3>
          <p className="text-xs text-zinc-400">{t('academy.course.completedBody')}</p>
          {course.cert_body && (
            <p className="text-xs text-[#f59e0b]">
              {t('academy.course.readyForExam')} <Link to="/academy/vca-booking" className="underline">{t('academy.course.bookExam')}</Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
