import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { VCA_QUESTIONS } from '@/lib/academy-questions';
import { VCAQuestion } from '@/lib/academy-types';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Clock,
  Shield,
  RotateCcw,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';

// Fisher-Yates shuffle
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

type ExamType = 'bvca' | 'volvca';

const EXAM_CONFIG: Record<ExamType, { questions: number; duration: number; passScore: number }> = {
  bvca: { questions: 40, duration: 60 * 60, passScore: 28 },
  volvca: { questions: 70, duration: 105 * 60, passScore: 49 },
};

export default function AcademyExam() {
  const { examType } = useParams<{ examType: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();

  const type: ExamType = examType === 'volvca' ? 'volvca' : 'bvca';
  const config = EXAM_CONFIG[type];

  const [phase, setPhase] = useState<'intro' | 'exam' | 'results'>('intro');
  const [questions, setQuestions] = useState<VCAQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, 'A' | 'B' | 'C'>>({});
  const [timeLeft, setTimeLeft] = useState(config.duration);
  const [showConfirmFinish, setShowConfirmFinish] = useState(false);
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [result, setResult] = useState<{ correct: number; total: number; percentage: number; passed: boolean; duration: number } | null>(null);
  const startTimeRef = useRef<number>(0);
  const warningShownRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Select questions on exam start
  const startExam = useCallback(() => {
    const pool = VCA_QUESTIONS.filter(q =>
      type === 'bvca' ? q.isBVCA : q.isVOLVCA
    );

    let selected: VCAQuestion[];
    if (pool.length >= config.questions) {
      selected = shuffle(pool).slice(0, config.questions);
    } else {
      console.warn(`Only ${pool.length} questions available, need ${config.questions}. Repeating some.`);
      const shuffled = shuffle(pool);
      selected = [];
      while (selected.length < config.questions) {
        selected.push(...shuffled);
      }
      selected = selected.slice(0, config.questions);
    }

    setQuestions(selected);
    setAnswers({});
    setCurrentIdx(0);
    setTimeLeft(config.duration);
    startTimeRef.current = Date.now();
    warningShownRef.current = false;
    setPhase('exam');
  }, [type, config]);

  // Timer
  useEffect(() => {
    if (phase !== 'exam') return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          handleSubmit();
          return 0;
        }
        if (prev === 301 && !warningShownRef.current) {
          warningShownRef.current = true;
          toast.warning(t('academy.examTimeWarning', '5 minutes remaining!'));
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase]);

  const handleSubmit = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);

    const correct = questions.filter(q => answers[q.id] === q.correctAnswer).length;
    const total = questions.length;
    const percentage = Math.round((correct / total) * 100);
    const passed = correct >= config.passScore;
    const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);

    setResult({ correct, total, percentage, passed, duration });

    // Save to Supabase
    try {
      if (user?.id) {
        await supabase.from('app_14da0f1941_academy_mock_exams').insert({
          user_id: user.id,
          exam_type: type,
          total_questions: total,
          correct_answers: correct,
          passed,
          duration_seconds: duration,
          completed_at: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn('Could not save exam result:', e);
    }

    setPhase('results');
  }, [questions, answers, config.passScore, type, user]);

  const handleNewExam = () => {
    setPhase('intro');
    setRulesAccepted(false);
    setShowReview(false);
    setResult(null);
  };

  const currentQuestion = questions[currentIdx];
  const answeredCount = Object.keys(answers).length;
  const unansweredCount = questions.length - answeredCount;

  // ─── INTRO PHASE ───
  if (phase === 'intro') {
    return (
      <div className="min-h-screen bg-[#0a0a0a]">
        <div className="max-w-2xl mx-auto px-4 py-8">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-zinc-400 mb-4">
            <button onClick={() => navigate('/academy')} className="hover:text-zinc-200 transition-colors">
              {t('academy.eyebrow', 'Academy')}
            </button>
            <ChevronRight className="h-3 w-3" />
            <span className="text-zinc-200">{t('academy.examIntroTitle', 'VCA Practice Exam')}</span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/academy')}
            className="mb-6 text-zinc-400 hover:text-zinc-100 -ml-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            {t('academy.examBackToAcademy', 'Back to Academy')}
          </Button>

          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="h-12 w-12 rounded-lg bg-[#f59e0b]/10 border border-[#f59e0b]/20 flex items-center justify-center">
              <Shield className="h-6 w-6 text-[#f59e0b]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-100">
                {t('academy.examIntroTitle', 'VCA Practice Exam')}
              </h1>
              <p className="text-sm text-[#f59e0b]">
                {type === 'bvca'
                  ? t('academy.examIntroBVCA', 'B-VCA (Basic Safety)')
                  : t('academy.examIntroVOLVCA', 'VOL-VCA (Operational Supervisors)')}
              </p>
            </div>
          </div>

          {/* Info Card */}
          <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-lg p-6 mb-6">
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <p className="text-xs text-zinc-500 mb-1">{t('academy.examIntroQuestions', 'Questions')}</p>
                <p className="text-lg font-semibold text-zinc-100">{config.questions}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-1">{t('academy.examIntroDuration', 'Duration')}</p>
                <p className="text-lg font-semibold text-zinc-100">{config.duration / 60} min</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-1">{t('academy.examIntroPassScore', 'Pass Score')}</p>
                <p className="text-lg font-semibold text-zinc-100">{config.passScore}/{config.questions} (70%)</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-1">{t('academy.examIntroFormat', 'Format')}</p>
                <p className="text-lg font-semibold text-zinc-100">{t('academy.examIntroFormatValue', 'Multiple choice (A/B/C)')}</p>
              </div>
            </div>

            {/* Rules */}
            <div className="border-t border-zinc-800/80 pt-4">
              <p className="text-sm font-medium text-zinc-200 mb-3">{t('academy.examIntroRules', 'Rules')}</p>
              <ul className="space-y-2 text-sm text-zinc-400">
                <li className="flex items-start gap-2">
                  <span className="text-[#f59e0b] mt-0.5">•</span>
                  {t('academy.examIntroRule1', 'Only one correct answer per question')}
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#f59e0b] mt-0.5">•</span>
                  {t('academy.examIntroRule2', 'You cannot go back in the official exam (practice mode allows it)')}
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#f59e0b] mt-0.5">•</span>
                  {t('academy.examIntroRule3', 'The exam auto-submits when time runs out')}
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#f59e0b] mt-0.5">•</span>
                  {t('academy.examIntroRule4', 'You need 70% to pass')}
                </li>
              </ul>
            </div>
          </div>

          {/* Checkbox + Start */}
          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={rulesAccepted}
                onChange={(e) => setRulesAccepted(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-[#f59e0b] focus:ring-[#f59e0b]"
              />
              <span className="text-sm text-zinc-300">{t('academy.examUnderstand', 'I understand the exam rules')}</span>
            </label>

            <Button
              onClick={startExam}
              disabled={!rulesAccepted}
              className="w-full bg-[#f59e0b] hover:bg-[#d97706] text-black font-medium disabled:opacity-50"
            >
              {t('academy.examStart', 'Start Exam')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ─── RESULTS PHASE ───
  if (phase === 'results' && result) {
    return (
      <div className="min-h-screen bg-[#0a0a0a]">
        <div className="max-w-3xl mx-auto px-4 py-8">
          {/* Result Card */}
          <div className={`border rounded-lg p-8 mb-6 text-center ${
            result.passed
              ? 'border-emerald-500/50 bg-emerald-500/5'
              : 'border-rose-500/50 bg-rose-500/5'
          }`}>
            <div className="mb-4">
              {result.passed ? (
                <CheckCircle2 className="h-16 w-16 text-emerald-400 mx-auto" />
              ) : (
                <XCircle className="h-16 w-16 text-rose-400 mx-auto" />
              )}
            </div>
            <h2 className={`text-3xl font-bold mb-2 ${result.passed ? 'text-emerald-400' : 'text-rose-400'}`}>
              {result.passed
                ? t('academy.examResultPassed', 'PASSED')
                : t('academy.examResultFailed', 'FAILED')}
            </h2>
            <p className="text-lg text-zinc-200 mb-1">
              {t('academy.examResultScore', '{{correct}}/{{total}} correct ({{percentage}}%)')
                .replace('{{correct}}', String(result.correct))
                .replace('{{total}}', String(result.total))
                .replace('{{percentage}}', String(result.percentage))}
            </p>
            <p className="text-sm text-zinc-400 mb-1">
              {t('academy.examResultTime', 'Time used: {{time}}').replace('{{time}}', formatTime(result.duration))}
            </p>
            <div className="flex items-center justify-center gap-2 mt-3">
              <Badge variant="outline" className="text-[10px] border-[#f59e0b]/30 text-[#f59e0b]">
                {type === 'bvca' ? 'B-VCA' : 'VOL-VCA'}
              </Badge>
              <span className="text-xs text-zinc-500">{new Date().toLocaleDateString()}</span>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-lg p-4 text-center">
              <p className="text-xs text-zinc-500 mb-1">{t('academy.examIntroDuration', 'Duration')}</p>
              <p className="text-lg font-semibold text-zinc-100">{formatTime(result.duration)}</p>
              <p className="text-xs text-zinc-500">/ {formatTime(config.duration)}</p>
            </div>
            <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-lg p-4 text-center">
              <p className="text-xs text-zinc-500 mb-1">{t('academy.examIntroPassScore', 'Pass Score')}</p>
              <p className="text-lg font-semibold text-zinc-100">{result.percentage}%</p>
              <p className="text-xs text-zinc-500">/ 70%</p>
            </div>
            <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-lg p-4 text-center">
              <p className="text-xs text-zinc-500 mb-1">{t('academy.examIntroQuestions', 'Questions')}</p>
              <p className="text-lg font-semibold text-zinc-100">{result.correct}</p>
              <p className="text-xs text-zinc-500">/ {result.total}</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3 mb-6">
            <Button
              onClick={() => setShowReview(!showReview)}
              variant="outline"
              className="border-zinc-700"
            >
              {t('academy.examReviewAnswers', 'Review Answers')}
            </Button>
            <Button
              onClick={handleNewExam}
              variant="outline"
              className="border-zinc-700"
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              {t('academy.examNewExam', 'New Exam')}
            </Button>
            <Button
              onClick={() => navigate('/academy')}
              variant="outline"
              className="border-zinc-700"
            >
              {t('academy.examBackToAcademy', 'Back to Academy')}
            </Button>
          </div>

          {/* Review */}
          {showReview && (
            <div className="space-y-4">
              {questions.map((q, qi) => {
                const userAnswer = answers[q.id];
                const isCorrect = userAnswer === q.correctAnswer;
                return (
                  <div
                    key={q.id}
                    className={`border rounded-lg p-5 ${
                      isCorrect
                        ? 'border-emerald-500/30 bg-emerald-500/5'
                        : 'border-rose-500/30 bg-rose-500/5'
                    }`}
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <span className="text-xs text-zinc-500 mt-0.5">#{qi + 1}</span>
                      {isCorrect ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-rose-400 mt-0.5 shrink-0" />
                      )}
                      <p className="text-sm text-zinc-200">{q.questionText}</p>
                    </div>
                    <div className="ml-7 space-y-1 text-xs">
                      {(['A', 'B', 'C'] as const).map(letter => {
                        const optText = q[`option${letter}` as keyof VCAQuestion] as string;
                        const isUserChoice = userAnswer === letter;
                        const isCorrectChoice = q.correctAnswer === letter;
                        let style = 'text-zinc-500';
                        if (isCorrectChoice) style = 'text-emerald-400 font-medium';
                        else if (isUserChoice && !isCorrectChoice) style = 'text-rose-400 line-through';
                        return (
                          <p key={letter} className={style}>
                            {letter}. {optText}
                            {isCorrectChoice && ' ✓'}
                            {isUserChoice && !isCorrectChoice && ' ✗'}
                          </p>
                        );
                      })}
                      {!userAnswer && (
                        <p className="text-zinc-600 italic">{t('academy.examNoAnswer', 'Not answered')}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── EXAM PHASE ───
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-[#0a0a0a] border-b border-zinc-800/80 px-4 py-3">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            {/* Timer */}
            <div className={`text-3xl font-mono font-bold ${
              timeLeft <= 300 ? 'text-rose-500 animate-pulse' : 'text-[#f59e0b]'
            }`}>
              <Clock className="h-5 w-5 inline-block mr-2 mb-1" />
              {formatTime(timeLeft)}
            </div>
            {/* Question counter */}
            <p className="text-sm text-zinc-400">
              {t('academy.examQuestionOf', 'Question {{current}} of {{total}}')
                .replace('{{current}}', String(currentIdx + 1))
                .replace('{{total}}', String(questions.length))}
            </p>
            {/* Finish button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowConfirmFinish(true)}
              className="border-zinc-700 text-zinc-300 hover:border-rose-500 hover:text-rose-400"
            >
              {t('academy.examFinish', 'Finish & See Results')}
            </Button>
          </div>
          <Progress value={((currentIdx + 1) / questions.length) * 100} className="h-1.5" />
        </div>
      </div>

      {/* Question Body */}
      <div className="flex-1 px-4 py-6">
        <div className="max-w-3xl mx-auto">
          {currentQuestion && (
            <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-lg p-8 mb-6">
              <p className="text-xs text-zinc-500 mb-3">
                {t('academy.examQuestionOf', 'Question {{current}} of {{total}}')
                  .replace('{{current}}', String(currentIdx + 1))
                  .replace('{{total}}', String(questions.length))}
              </p>
              <p className="text-lg text-zinc-100 leading-relaxed mb-6">{currentQuestion.questionText}</p>

              <RadioGroup
                value={answers[currentQuestion.id] || ''}
                onValueChange={(val) => setAnswers(prev => ({ ...prev, [currentQuestion.id]: val as 'A' | 'B' | 'C' }))}
                className="space-y-3"
              >
                {(['A', 'B', 'C'] as const).map(letter => {
                  const optText = currentQuestion[`option${letter}` as keyof VCAQuestion] as string;
                  const isSelected = answers[currentQuestion.id] === letter;
                  return (
                    <div
                      key={letter}
                      onClick={() => setAnswers(prev => ({ ...prev, [currentQuestion.id]: letter }))}
                      className={`flex items-center gap-3 p-4 rounded-md border cursor-pointer transition-all ${
                        isSelected
                          ? 'border-[#f59e0b] bg-[#f59e0b]/5'
                          : 'border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <div className={`h-8 w-8 rounded-full border-2 flex items-center justify-center text-sm font-bold shrink-0 ${
                        isSelected
                          ? 'border-[#f59e0b] text-[#f59e0b] bg-[#f59e0b]/10'
                          : 'border-zinc-700 text-zinc-500'
                      }`}>
                        {letter}
                      </div>
                      <RadioGroupItem value={letter} id={`exam-${currentQuestion.id}-${letter}`} className="sr-only" />
                      <Label htmlFor={`exam-${currentQuestion.id}-${letter}`} className="text-sm text-zinc-300 cursor-pointer flex-1">
                        {optText}
                      </Label>
                    </div>
                  );
                })}
              </RadioGroup>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between gap-3 mb-6">
            <Button
              variant="outline"
              onClick={() => setCurrentIdx(prev => Math.max(0, prev - 1))}
              disabled={currentIdx === 0}
              className="border-zinc-700 sm:w-auto w-full"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              {t('academy.examPrevious', 'Previous')}
            </Button>

            {currentIdx < questions.length - 1 ? (
              <Button
                onClick={() => setCurrentIdx(prev => prev + 1)}
                disabled={!answers[currentQuestion?.id]}
                className="bg-[#f59e0b] hover:bg-[#d97706] text-black font-medium sm:w-auto w-full"
              >
                {t('academy.examNext', 'Next')}
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={() => setShowConfirmFinish(true)}
                className="bg-[#f59e0b] hover:bg-[#d97706] text-black font-medium sm:w-auto w-full"
              >
                {t('academy.examFinish', 'Finish & See Results')}
              </Button>
            )}
          </div>

          {/* Question Navigation Grid */}
          <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-lg p-4">
            <div className="grid grid-cols-10 gap-2 overflow-x-auto">
              {questions.map((q, idx) => {
                const isAnswered = !!answers[q.id];
                const isCurrent = idx === currentIdx;
                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentIdx(idx)}
                    className={`h-9 w-9 text-xs rounded-md font-medium transition-all ${
                      isCurrent
                        ? 'ring-2 ring-[#f59e0b] bg-[#f59e0b]/20 text-[#f59e0b]'
                        : isAnswered
                          ? 'bg-[#f59e0b]/20 text-[#f59e0b] border border-[#f59e0b]/50'
                          : 'bg-zinc-900 text-zinc-500 border border-zinc-800'
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Confirm Finish Dialog */}
      <Dialog open={showConfirmFinish} onOpenChange={setShowConfirmFinish}>
        <DialogContent className="bg-[#0d0d0d] border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-zinc-100 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-[#f59e0b]" />
              {t('academy.examFinishConfirm', 'Finish Exam?')}
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              {t('academy.examFinishConfirmText', 'Are you sure you want to finish? You have {{unanswered}} unanswered questions.')
                .replace('{{unanswered}}', String(unansweredCount))}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowConfirmFinish(false)}
              className="border-zinc-700"
            >
              {t('academy.examFinishConfirmNo', 'Continue exam')}
            </Button>
            <Button
              onClick={() => {
                setShowConfirmFinish(false);
                handleSubmit();
              }}
              className="bg-[#f59e0b] hover:bg-[#d97706] text-black font-medium"
            >
              {t('academy.examFinishConfirmYes', 'Yes, finish')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}