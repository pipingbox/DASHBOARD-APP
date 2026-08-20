import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { LessonRenderer } from '@/components/LessonRenderer';
import { VCA_LESSONS } from '@/lib/vca-lessons';
import { getModuleQuestions, VCAQuizQuestion } from '@/lib/vca-questions';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import {
  ArrowLeft,
  BookOpen,
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  RotateCcw,
  ChevronRight,
  Scale,
  Shield,
  AlertTriangle,
  Users,
  FileText,
  Siren,
  FlaskConical,
  Flame,
  Wrench,
  Building2,
  Sparkles,
  Shovel,
  ArrowUpFromLine,
  Zap,
  Box,
  Anchor,
  Radiation,
  Activity,
  Volume2,
  HardHat,
  SignpostBig,
} from 'lucide-react';

const MODULE_ICONS: Record<number, React.ReactNode> = {
  1: <Scale className="h-6 w-6" />,
  2: <AlertTriangle className="h-6 w-6" />,
  3: <Shield className="h-6 w-6" />,
  4: <Users className="h-6 w-6" />,
  5: <FileText className="h-6 w-6" />,
  6: <FileText className="h-6 w-6" />,
  7: <Siren className="h-6 w-6" />,
  8: <FlaskConical className="h-6 w-6" />,
  9: <Flame className="h-6 w-6" />,
  10: <Wrench className="h-6 w-6" />,
  11: <Building2 className="h-6 w-6" />,
  12: <Sparkles className="h-6 w-6" />,
  13: <Shovel className="h-6 w-6" />,
  14: <ArrowUpFromLine className="h-6 w-6" />,
  15: <Zap className="h-6 w-6" />,
  16: <Box className="h-6 w-6" />,
  17: <Anchor className="h-6 w-6" />,
  18: <Radiation className="h-6 w-6" />,
  19: <Activity className="h-6 w-6" />,
  20: <Volume2 className="h-6 w-6" />,
  21: <HardHat className="h-6 w-6" />,
  22: <SignpostBig className="h-6 w-6" />,
};

const MODULE_NAMES: Record<number, string> = {
  1: 'Legislation',
  2: 'Dangers, Risks and Prevention',
  3: 'Accidents: Causes and Prevention',
  4: 'Safety Conduct',
  5: 'Tasks, Rights, Duties and Discussions',
  6: 'Procedures, Instructions and Signs',
  7: 'Preparations for Emergencies',
  8: 'Hazardous Substances',
  9: 'Fire and Explosions',
  10: 'Equipment',
  11: 'Demolish Activities',
  12: 'Welding, Cutting and Burning',
  13: 'Digging and Excavations',
  14: 'Working at Height',
  15: 'Electricity',
  16: 'Confined Spaces',
  17: 'Hoisting',
  18: 'Radiation',
  19: 'The Ergonomic Workplace',
  20: 'Noise at the Workplace',
  21: 'Personal Protective Equipment',
  22: 'Signs and Markings',
};

export default function AcademyModule() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const mid = Number(moduleId) || 1;

  const [activeTab, setActiveTab] = useState('study');
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState({ correct: 0, total: 0, percentage: 0 });
  const [readingProgress, setReadingProgress] = useState(0);
  const [existingProgress, setExistingProgress] = useState<{ best_score: number; attempts: number } | null>(null);
  const studyRef = useRef<HTMLDivElement>(null);

  const questions = getModuleQuestions(mid);
  const lesson = VCA_LESSONS[mid];
  const moduleName = MODULE_NAMES[mid] || `Module ${mid}`;
  const estimatedMinutes = Math.max(5, Math.ceil(questions.length * 1.5));

  // Load existing progress
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('app_14da0f1941_academy_progress')
      .select('best_score, attempts')
      .eq('user_id', user.id)
      .eq('module_id', mid)
      .single()
      .then(({ data }) => {
        if (data) setExistingProgress(data);
      })
      .catch(() => {});
  }, [user?.id, mid]);

  // Scroll progress tracking
  const handleScroll = useCallback(() => {
    if (!studyRef.current) return;
    const el = studyRef.current;
    const scrollTop = el.scrollTop;
    const scrollHeight = el.scrollHeight - el.clientHeight;
    if (scrollHeight > 0) {
      setReadingProgress(Math.min(100, Math.round((scrollTop / scrollHeight) * 100)));
    }
  }, []);

  const handleSubmit = async () => {
    let correct = 0;
    questions.forEach((q) => {
      if (answers[q.id] === q.correctAnswer) correct++;
    });
    const percentage = Math.round((correct / questions.length) * 100);
    setScore({ correct, total: questions.length, percentage });
    setSubmitted(true);

    // Save to Supabase
    if (user?.id) {
      try {
        await supabase
          .from('app_14da0f1941_academy_progress')
          .upsert({
            user_id: user.id,
            module_id: mid,
            completed: percentage >= 70,
            score: percentage,
            best_score: Math.max(existingProgress?.best_score || 0, percentage),
            attempts: (existingProgress?.attempts || 0) + 1,
            last_attempt_at: new Date().toISOString(),
          });
      } catch (e) {
        console.warn('Could not save progress:', e);
      }
    }
  };

  const handleRetry = () => {
    setAnswers({});
    setSubmitted(false);
    setScore({ correct: 0, total: 0, percentage: 0 });
  };

  const getOptionStyle = (question: VCAQuizQuestion, option: 'A' | 'B' | 'C') => {
    if (!submitted) {
      return answers[question.id] === option
        ? 'border-[#f59e0b] ring-2 ring-[#f59e0b] bg-[#f59e0b]/5'
        : 'border-zinc-800/80 hover:border-zinc-700';
    }
    const isCorrect = question.correctAnswer === option;
    const isSelected = answers[question.id] === option;
    if (isCorrect && isSelected) return 'border-emerald-500 bg-emerald-500/10';
    if (isCorrect && !isSelected) return 'border-emerald-500/50 bg-emerald-500/5';
    if (!isCorrect && isSelected) return 'border-rose-500 bg-rose-500/10';
    return 'border-zinc-800/80 opacity-60';
  };

  const getBadgeStyle = (question: VCAQuizQuestion, option: 'A' | 'B' | 'C') => {
    if (!submitted) {
      return answers[question.id] === option
        ? 'border-[#f59e0b] text-[#f59e0b]'
        : 'border-zinc-600 text-zinc-400';
    }
    const isCorrect = question.correctAnswer === option;
    const isSelected = answers[question.id] === option;
    if (isCorrect) return 'border-emerald-500 text-emerald-400';
    if (!isCorrect && isSelected) return 'border-rose-500 text-rose-400';
    return 'border-zinc-700 text-zinc-500';
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-zinc-400 mb-4">
          <button onClick={() => navigate('/academy')} className="hover:text-zinc-200 transition-colors">
            {t('academy.eyebrow', 'Academy')}
          </button>
          <ChevronRight className="h-3 w-3" />
          <span className="text-zinc-200">Module {mid}</span>
        </div>

        {/* Back button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/academy')}
          className="mb-4 text-zinc-400 hover:text-zinc-100 -ml-2"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          {t('academy.backToAcademy', 'Back to Academy')}
        </Button>

        {/* Module Header */}
        <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-lg p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-lg bg-[#f59e0b]/10 border border-[#f59e0b]/20 flex items-center justify-center text-[#f59e0b]">
              {MODULE_ICONS[mid] || <BookOpen className="h-6 w-6" />}
            </div>
            <div className="flex-1">
              <p className="text-xs text-[#f59e0b] font-medium uppercase tracking-wider mb-1">
                Module {mid}
              </p>
              <h1 className="text-xl font-bold text-zinc-100 mb-2">{moduleName}</h1>
              <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                <span>{questions.length} {t('academy.questions', 'questions')}</span>
                <span className="text-zinc-600">|</span>
                <span>~{estimatedMinutes} min</span>
                <span className="text-zinc-600">|</span>
                <Badge variant="outline" className="text-[10px] border-[#f59e0b]/30 text-[#f59e0b]">
                  {questions.some(q => !q.isBVCA) ? 'VOL-VCA' : 'B-VCA / VOL-VCA'}
                </Badge>
              </div>
            </div>
          </div>

          {existingProgress && (
            <div className="mt-4 pt-4 border-t border-zinc-800/80">
              <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                <span>{t('academy.moduleCompleted', 'Module Completed')}</span>
                <span>{existingProgress.best_score}%</span>
              </div>
              <Progress value={existingProgress.best_score} className="h-1.5" />
            </div>
          )}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-[#0d0d0d] border border-zinc-800/80 mb-6">
            <TabsTrigger value="study" className="data-[state=active]:bg-[#f59e0b]/10 data-[state=active]:text-[#f59e0b]">
              <BookOpen className="h-4 w-4 mr-2" />
              {t('academy.moduleStudy', 'Study')}
            </TabsTrigger>
            <TabsTrigger value="quiz" className="data-[state=active]:bg-[#f59e0b]/10 data-[state=active]:text-[#f59e0b]">
              <ClipboardCheck className="h-4 w-4 mr-2" />
              {t('academy.moduleQuiz', 'Module Quiz')}
            </TabsTrigger>
          </TabsList>

          {/* Study Tab */}
          <TabsContent value="study">
            {/* Reading progress */}
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                <span>{t('academy.readingProgress', 'Reading progress')}</span>
                <span>{readingProgress}%</span>
              </div>
              <Progress value={readingProgress} className="h-1" />
            </div>

            <div
              ref={studyRef}
              onScroll={handleScroll}
              className="border border-zinc-800/80 bg-[#0d0d0d] rounded-lg p-6 max-h-[70vh] overflow-y-auto"
            >
              {lesson ? (
                <LessonRenderer content={lesson} />
              ) : (
                <p className="text-zinc-400 text-sm">No lesson content available for this module.</p>
              )}

              {/* Go to quiz button */}
              <div className="mt-8 pt-6 border-t border-zinc-800/80 text-center">
                <Button
                  onClick={() => setActiveTab('quiz')}
                  className="bg-[#f59e0b] hover:bg-[#d97706] text-black font-medium"
                >
                  <ClipboardCheck className="h-4 w-4 mr-2" />
                  {t('academy.goToQuiz', 'Go to Quiz')}
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Quiz Tab */}
          <TabsContent value="quiz">
            {/* Score result */}
            {submitted && (
              <div className={`border rounded-lg p-5 mb-6 ${
                score.percentage >= 70
                  ? 'border-emerald-500/50 bg-emerald-500/5'
                  : 'border-rose-500/50 bg-rose-500/5'
              }`}>
                <div className="flex items-center gap-3 mb-2">
                  {score.percentage >= 70 ? (
                    <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                  ) : (
                    <XCircle className="h-6 w-6 text-rose-400" />
                  )}
                  <h3 className="text-lg font-semibold text-zinc-100">
                    {t('academy.scoreResult', 'You scored {{correct}}/{{total}} ({{percentage}}%)')
                      .replace('{{correct}}', String(score.correct))
                      .replace('{{total}}', String(score.total))
                      .replace('{{percentage}}', String(score.percentage))}
                  </h3>
                </div>
                <p className="text-sm text-zinc-300 mb-4">
                  {score.percentage >= 70
                    ? t('academy.passedModule', 'Module passed!')
                    : t('academy.failedModule', 'Score below 70%. Keep studying!')}
                </p>
                <div className="flex gap-3">
                  <Button onClick={handleRetry} variant="outline" size="sm" className="border-zinc-700">
                    <RotateCcw className="h-3 w-3 mr-1" />
                    {t('academy.retryQuiz', 'Retry')}
                  </Button>
                  <Button onClick={() => setActiveTab('study')} variant="outline" size="sm" className="border-zinc-700">
                    <BookOpen className="h-3 w-3 mr-1" />
                    {t('academy.backToCourse', 'Back to Course')}
                  </Button>
                </div>
              </div>
            )}

            {/* Questions */}
            <div className="space-y-4">
              {questions.map((question, qi) => (
                <div
                  key={question.id}
                  className="border border-zinc-800/80 bg-[#0d0d0d] rounded-lg p-5"
                >
                  <p className="text-xs text-zinc-500 mb-2">
                    {t('academy.questionNumber', 'Question {{number}}').replace('{{number}}', String(qi + 1))}
                  </p>
                  <p className="text-sm font-medium text-zinc-100 mb-4">{question.questionText}</p>

                  <RadioGroup
                    value={answers[question.id] || ''}
                    onValueChange={(val) => {
                      if (!submitted) setAnswers(prev => ({ ...prev, [question.id]: val }));
                    }}
                    className="space-y-2"
                  >
                    {(['A', 'B', 'C'] as const).map((letter) => {
                      const optionText = question[`option${letter}` as keyof VCAQuizQuestion] as string;
                      return (
                        <div
                          key={letter}
                          className={`flex items-center gap-3 p-3 rounded-md border transition-all cursor-pointer ${getOptionStyle(question, letter)}`}
                          onClick={() => {
                            if (!submitted) setAnswers(prev => ({ ...prev, [question.id]: letter }));
                          }}
                        >
                          <div className={`h-7 w-7 rounded-full border flex items-center justify-center text-xs font-bold shrink-0 ${getBadgeStyle(question, letter)}`}>
                            {letter}
                          </div>
                          <RadioGroupItem value={letter} id={`q${question.id}-${letter}`} className="sr-only" />
                          <Label htmlFor={`q${question.id}-${letter}`} className="text-sm text-zinc-300 cursor-pointer flex-1">
                            {optionText}
                          </Label>
                          {submitted && question.correctAnswer === letter && (
                            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                          )}
                          {submitted && answers[question.id] === letter && question.correctAnswer !== letter && (
                            <XCircle className="h-4 w-4 text-rose-400 shrink-0" />
                          )}
                        </div>
                      );
                    })}
                  </RadioGroup>

                  {/* Show correct answer explanation after submit */}
                  {submitted && answers[question.id] !== question.correctAnswer && (
                    <div className="mt-3 p-3 rounded-md bg-emerald-500/5 border border-emerald-500/20">
                      <p className="text-xs text-emerald-400 font-medium">
                        {t('academy.correctAnswer', 'Correct answer')}: {question.correctAnswer}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Submit button */}
            {!submitted && questions.length > 0 && (
              <div className="mt-6 text-center">
                <Button
                  onClick={handleSubmit}
                  disabled={Object.keys(answers).length < questions.length}
                  className="bg-[#f59e0b] hover:bg-[#d97706] text-black font-medium px-8"
                >
                  {t('academy.submitAnswers', 'Submit Answers')}
                </Button>
                <p className="text-xs text-zinc-500 mt-2">
                  {Object.keys(answers).length}/{questions.length} answered
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}