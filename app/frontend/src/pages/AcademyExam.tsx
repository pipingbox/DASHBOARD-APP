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
import {
  VCAQuestion,
  QuestionAnswer,
  SingleChoiceQuestion,
  MultipleChoiceQuestion,
  TrueFalseMatrixQuestion,
  OrderingQuestion,
  MatchingQuestion,
} from '@/lib/academy-types';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  XCircle,
  Clock,
  Shield,
  RotateCcw,
  ChevronRight,
  AlertTriangle,
  BookOpen,
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

// Corrected VCA exam config: B-VCA 40q/60min/65%, VOL-VCA 60q/60min/65%
const EXAM_CONFIG: Record<ExamType, { questions: number; duration: number; passScore: number; maxPoints: number }> = {
  bvca:   { questions: 40, duration: 60 * 60, passScore: 26, maxPoints: 4000 },
  volvca: { questions: 60, duration: 60 * 60, passScore: 39, maxPoints: 6000 },
};

// ─── SCORING ─────────────────────────────────────────────────────────────────

function scoreQuestion(question: VCAQuestion, answer: QuestionAnswer | undefined): number {
  if (answer === undefined || answer === null) return 0;

  switch (question.questionType) {
    case 'single_choice': {
      return (answer as string) === question.correctAnswer ? 100 : 0;
    }
    case 'multiple_choice': {
      const selected = (answer as string[]) || [];
      const correctIds = question.options.filter(o => o.isCorrect).map(o => o.id);
      const totalCorrect = correctIds.length;
      if (totalCorrect === 0) return 0;
      const pointsPerItem = 100 / totalCorrect;
      let score = 0;
      for (const opt of question.options) {
        const userSelected = selected.includes(opt.id);
        if (opt.isCorrect && userSelected) score += pointsPerItem;
        else if (!opt.isCorrect && userSelected) score -= pointsPerItem;
      }
      return Math.max(0, Math.round(score));
    }
    case 'true_false_matrix': {
      const userAnswers = (answer as Record<string, boolean>) || {};
      const totalStatements = question.statements.length;
      if (totalStatements === 0) return 0;
      const pointsPerStatement = 100 / totalStatements;
      let score = 0;
      for (const stmt of question.statements) {
        if (userAnswers[stmt.id] === stmt.isTrue) score += pointsPerStatement;
        // Wrong answers do NOT deduct for matrix type
      }
      return Math.round(score);
    }
    case 'ordering': {
      const userOrder = (answer as string[]) || [];
      const correct = [...question.items]
        .sort((a, b) => a.correctPosition - b.correctPosition)
        .map(i => i.id);
      return JSON.stringify(userOrder) === JSON.stringify(correct) ? 100 : 0;
    }
    case 'matching': {
      const userMatches = (answer as Record<string, string>) || {};
      const allCorrect = question.rightItems.every(r => userMatches[r.matchesLeftId] === r.id);
      return allCorrect ? 100 : 0;
    }
  }
}

// ─── QUESTION INPUT RENDERERS ─────────────────────────────────────────────────

function SingleChoiceInput({
  question,
  answer,
  setAnswer,
}: {
  question: SingleChoiceQuestion;
  answer: QuestionAnswer | undefined;
  setAnswer: (a: QuestionAnswer) => void;
}) {
  const current = (answer as string) || '';
  return (
    <RadioGroup
      value={current}
      onValueChange={(val) => setAnswer(val)}
      className="space-y-3"
    >
      {(['A', 'B', 'C'] as const).map(letter => {
        const optText = question[`option${letter}` as 'optionA' | 'optionB' | 'optionC'];
        const isSelected = current === letter;
        return (
          <div
            key={letter}
            onClick={() => setAnswer(letter)}
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
            <RadioGroupItem value={letter} id={`exam-${question.id}-${letter}`} className="sr-only" />
            <Label htmlFor={`exam-${question.id}-${letter}`} className="text-sm text-zinc-300 cursor-pointer flex-1">
              {optText}
            </Label>
          </div>
        );
      })}
    </RadioGroup>
  );
}

function MultipleChoiceInput({
  question,
  answer,
  setAnswer,
}: {
  question: MultipleChoiceQuestion;
  answer: QuestionAnswer | undefined;
  setAnswer: (a: QuestionAnswer) => void;
}) {
  const { t } = useTranslation();
  const selected = (answer as string[]) || [];

  const toggle = (id: string) => {
    const next = selected.includes(id)
      ? selected.filter(x => x !== id)
      : [...selected, id];
    setAnswer(next);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-[#f59e0b] font-medium mb-2">
        {t('academy.questionTypeMultipleChoice', 'Select all correct answers')}
      </p>
      {question.options.map(opt => {
        const isSelected = selected.includes(opt.id);
        return (
          <div
            key={opt.id}
            onClick={() => toggle(opt.id)}
            className={`flex items-center gap-3 p-4 rounded-md border cursor-pointer transition-all ${
              isSelected
                ? 'border-[#f59e0b] bg-[#f59e0b]/5'
                : 'border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <div className={`h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 ${
              isSelected
                ? 'border-[#f59e0b] bg-[#f59e0b]/20'
                : 'border-zinc-700'
            }`}>
              {isSelected && <div className="h-2.5 w-2.5 rounded-sm bg-[#f59e0b]" />}
            </div>
            <span className="text-sm text-zinc-300 flex-1">{opt.text}</span>
          </div>
        );
      })}
    </div>
  );
}

function TrueFalseMatrixInput({
  question,
  answer,
  setAnswer,
}: {
  question: TrueFalseMatrixQuestion;
  answer: QuestionAnswer | undefined;
  setAnswer: (a: QuestionAnswer) => void;
}) {
  const { t } = useTranslation();
  const userAnswers = (answer as Record<string, boolean>) || {};

  const setStatement = (id: string, val: boolean) => {
    setAnswer({ ...userAnswers, [id]: val });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-[#f59e0b] font-medium mb-2">
        {t('academy.questionTypeTrueFalse', 'Indicate true or false for each statement')}
      </p>
      {question.statements.map(stmt => {
        const val = userAnswers[stmt.id];
        return (
          <div key={stmt.id} className="border border-zinc-800 rounded-md p-4">
            <p className="text-sm text-zinc-300 mb-3">{stmt.text}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setStatement(stmt.id, true)}
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium border transition-all ${
                  val === true
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                    : 'border-zinc-700 text-zinc-400 hover:border-zinc-600'
                }`}
              >
                {t('academy.trueFalseTrue', 'True')}
              </button>
              <button
                onClick={() => setStatement(stmt.id, false)}
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium border transition-all ${
                  val === false
                    ? 'border-rose-500 bg-rose-500/10 text-rose-400'
                    : 'border-zinc-700 text-zinc-400 hover:border-zinc-600'
                }`}
              >
                {t('academy.trueFalseFalse', 'False')}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OrderingInput({
  question,
  answer,
  setAnswer,
}: {
  question: OrderingQuestion;
  answer: QuestionAnswer | undefined;
  setAnswer: (a: QuestionAnswer) => void;
}) {
  const { t } = useTranslation();
  // Initialize with shuffled order if no answer yet
  const defaultOrder = shuffle(question.items.map(i => i.id));
  const orderedIds = (answer as string[]) || defaultOrder;

  // Ensure all items are present (in case answer was set before items were known)
  const allIds = question.items.map(i => i.id);
  const safeOrder = orderedIds.length === allIds.length ? orderedIds : defaultOrder;

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const next = [...safeOrder];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    setAnswer(next);
  };

  const moveDown = (idx: number) => {
    if (idx === safeOrder.length - 1) return;
    const next = [...safeOrder];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    setAnswer(next);
  };

  const itemMap = Object.fromEntries(question.items.map(i => [i.id, i.text]));

  return (
    <div className="space-y-2">
      <p className="text-xs text-[#f59e0b] font-medium mb-2">
        {t('academy.questionTypeOrdering', 'Arrange in the correct order')}
      </p>
      {safeOrder.map((id, idx) => (
        <div
          key={id}
          className="flex items-center gap-3 p-3 rounded-md border border-zinc-800 bg-zinc-900/50"
        >
          <span className="text-xs text-zinc-500 w-5 text-center font-mono">{idx + 1}</span>
          <span className="text-sm text-zinc-300 flex-1">{itemMap[id]}</span>
          <div className="flex flex-col gap-1">
            <button
              onClick={() => moveUp(idx)}
              disabled={idx === 0}
              className="p-1 rounded text-zinc-500 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed"
              title={t('academy.orderingMoveUp', 'Move up')}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => moveDown(idx)}
              disabled={idx === safeOrder.length - 1}
              className="p-1 rounded text-zinc-500 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed"
              title={t('academy.orderingMoveDown', 'Move down')}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function MatchingInput({
  question,
  answer,
  setAnswer,
}: {
  question: MatchingQuestion;
  answer: QuestionAnswer | undefined;
  setAnswer: (a: QuestionAnswer) => void;
}) {
  const { t } = useTranslation();
  const userMatches = (answer as Record<string, string>) || {};

  const setMatch = (leftId: string, rightId: string) => {
    setAnswer({ ...userMatches, [leftId]: rightId });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-[#f59e0b] font-medium mb-2">
        {t('academy.questionTypeMatching', 'Match each item on the left to the correct option on the right')}
      </p>
      {question.leftItems.map(left => {
        const selected = userMatches[left.id] || '';
        return (
          <div key={left.id} className="border border-zinc-800 rounded-md p-4">
            <p className="text-sm text-zinc-200 font-medium mb-2">{left.text}</p>
            <select
              value={selected}
              onChange={e => setMatch(left.id, e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-[#f59e0b]"
            >
              <option value="">{t('academy.matchingSelectMatch', 'Select match...')}</option>
              {question.rightItems.map(right => (
                <option key={right.id} value={right.id}>
                  {right.text}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}

function renderQuestionInput(
  question: VCAQuestion,
  answer: QuestionAnswer | undefined,
  setAnswer: (a: QuestionAnswer) => void,
) {
  switch (question.questionType) {
    case 'single_choice':
      return <SingleChoiceInput question={question} answer={answer} setAnswer={setAnswer} />;
    case 'multiple_choice':
      return <MultipleChoiceInput question={question} answer={answer} setAnswer={setAnswer} />;
    case 'true_false_matrix':
      return <TrueFalseMatrixInput question={question} answer={answer} setAnswer={setAnswer} />;
    case 'ordering':
      return <OrderingInput question={question} answer={answer} setAnswer={setAnswer} />;
    case 'matching':
      return <MatchingInput question={question} answer={answer} setAnswer={setAnswer} />;
  }
}

// ─── REVIEW RENDERERS ─────────────────────────────────────────────────────────

function ReviewSingleChoice({
  question,
  answer,
}: {
  question: SingleChoiceQuestion;
  answer: QuestionAnswer | undefined;
}) {
  const userAnswer = answer as string | undefined;
  return (
    <div className="ml-7 space-y-1 text-xs">
      {(['A', 'B', 'C'] as const).map(letter => {
        const optText = question[`option${letter}` as 'optionA' | 'optionB' | 'optionC'];
        const isUserChoice = userAnswer === letter;
        const isCorrectChoice = question.correctAnswer === letter;
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
        <p className="text-zinc-600 italic">Not answered</p>
      )}
    </div>
  );
}

function ReviewMultipleChoice({
  question,
  answer,
}: {
  question: MultipleChoiceQuestion;
  answer: QuestionAnswer | undefined;
}) {
  const selected = (answer as string[]) || [];
  return (
    <div className="ml-7 space-y-1 text-xs">
      {question.options.map(opt => {
        const isSelected = selected.includes(opt.id);
        const isCorrect = opt.isCorrect;
        let style = 'text-zinc-500';
        let suffix = '';
        if (isCorrect && isSelected) { style = 'text-emerald-400 font-medium'; suffix = ' ✓'; }
        else if (isCorrect && !isSelected) { style = 'text-amber-400'; suffix = ' (missed ✓)'; }
        else if (!isCorrect && isSelected) { style = 'text-rose-400 line-through'; suffix = ' ✗'; }
        return (
          <p key={opt.id} className={style}>
            {opt.text}{suffix}
          </p>
        );
      })}
    </div>
  );
}

function ReviewTrueFalseMatrix({
  question,
  answer,
}: {
  question: TrueFalseMatrixQuestion;
  answer: QuestionAnswer | undefined;
}) {
  const { t } = useTranslation();
  const userAnswers = (answer as Record<string, boolean>) || {};
  return (
    <div className="ml-7 space-y-2 text-xs">
      {question.statements.map(stmt => {
        const userVal = userAnswers[stmt.id];
        const isCorrect = userVal === stmt.isTrue;
        const correctLabel = stmt.isTrue
          ? t('academy.trueFalseTrue', 'True')
          : t('academy.trueFalseFalse', 'False');
        const userLabel = userVal === undefined
          ? '—'
          : userVal
            ? t('academy.trueFalseTrue', 'True')
            : t('academy.trueFalseFalse', 'False');
        return (
          <div key={stmt.id} className={`p-2 rounded ${isCorrect ? 'bg-emerald-500/5' : 'bg-rose-500/5'}`}>
            <p className="text-zinc-300 mb-1">{stmt.text}</p>
            <p className={isCorrect ? 'text-emerald-400' : 'text-rose-400'}>
              {t('academy.examYourStatement', 'Your answer: {{answer}}').replace('{{answer}}', userLabel)}
              {' · '}
              {t('academy.examCorrectStatement', 'Correct: {{answer}}').replace('{{answer}}', correctLabel)}
              {isCorrect ? ' ✓' : ' ✗'}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function ReviewOrdering({
  question,
  answer,
}: {
  question: OrderingQuestion;
  answer: QuestionAnswer | undefined;
}) {
  const { t } = useTranslation();
  const userOrder = (answer as string[]) || [];
  const correctOrder = [...question.items]
    .sort((a, b) => a.correctPosition - b.correctPosition)
    .map(i => i.id);
  const itemMap = Object.fromEntries(question.items.map(i => [i.id, i.text]));
  const isAllCorrect = JSON.stringify(userOrder) === JSON.stringify(correctOrder);

  return (
    <div className="ml-7 text-xs space-y-3">
      <div>
        <p className="text-zinc-500 mb-1">{t('academy.examYourOrder', 'Your order')}:</p>
        {userOrder.map((id, idx) => {
          const isCorrectPos = correctOrder[idx] === id;
          return (
            <p key={id} className={isCorrectPos ? 'text-emerald-400' : 'text-rose-400'}>
              {idx + 1}. {itemMap[id] || id} {isCorrectPos ? '✓' : '✗'}
            </p>
          );
        })}
      </div>
      {!isAllCorrect && (
        <div>
          <p className="text-zinc-500 mb-1">{t('academy.examCorrectOrder', 'Correct order')}:</p>
          {correctOrder.map((id, idx) => (
            <p key={id} className="text-emerald-400">
              {idx + 1}. {itemMap[id] || id}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewMatching({
  question,
  answer,
}: {
  question: MatchingQuestion;
  answer: QuestionAnswer | undefined;
}) {
  const { t } = useTranslation();
  const userMatches = (answer as Record<string, string>) || {};
  const rightMap = Object.fromEntries(question.rightItems.map(r => [r.id, r.text]));

  return (
    <div className="ml-7 space-y-2 text-xs">
      {question.leftItems.map(left => {
        const correctRight = question.rightItems.find(r => r.matchesLeftId === left.id);
        const userRightId = userMatches[left.id];
        const isCorrect = userRightId === correctRight?.id;
        return (
          <div key={left.id} className={`p-2 rounded ${isCorrect ? 'bg-emerald-500/5' : 'bg-rose-500/5'}`}>
            <p className="text-zinc-300 font-medium mb-1">{left.text}</p>
            <p className={isCorrect ? 'text-emerald-400' : 'text-rose-400'}>
              {t('academy.examYourStatement', 'Your answer: {{answer}}').replace('{{answer}}', userRightId ? rightMap[userRightId] || '—' : '—')}
              {isCorrect ? ' ✓' : ''}
            </p>
            {!isCorrect && correctRight && (
              <p className="text-emerald-400">
                {t('academy.examCorrectStatement', 'Correct: {{answer}}').replace('{{answer}}', correctRight.text)}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function renderReview(question: VCAQuestion, answer: QuestionAnswer | undefined) {
  switch (question.questionType) {
    case 'single_choice':
      return <ReviewSingleChoice question={question} answer={answer} />;
    case 'multiple_choice':
      return <ReviewMultipleChoice question={question} answer={answer} />;
    case 'true_false_matrix':
      return <ReviewTrueFalseMatrix question={question} answer={answer} />;
    case 'ordering':
      return <ReviewOrdering question={question} answer={answer} />;
    case 'matching':
      return <ReviewMatching question={question} answer={answer} />;
  }
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

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
  const [answers, setAnswers] = useState<Record<string, QuestionAnswer>>({});
  const [timeLeft, setTimeLeft] = useState(config.duration);
  const [showConfirmFinish, setShowConfirmFinish] = useState(false);
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [result, setResult] = useState<{
    correct: number;
    total: number;
    totalPoints: number;
    maxPoints: number;
    percentage: number;
    passed: boolean;
    duration: number;
  } | null>(null);

  const startTimeRef = useRef<number>(0);
  const warningShownRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Stale closure fix: keep a ref that always points to current answers ──
  const answersRef = useRef<Record<string, QuestionAnswer>>(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  // Keep a ref to the latest questions too (set once on exam start, but safe)
  const questionsRef = useRef<VCAQuestion[]>(questions);
  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

  // ── handleSubmit reads from refs so it's safe to call from timer ──
  const handleSubmitRef = useRef<() => void>(() => {});

  const handleSubmit = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);

    const currentQuestions = questionsRef.current;
    const currentAnswers = answersRef.current;

    let totalPoints = 0;
    let correctCount = 0;
    for (const q of currentQuestions) {
      const pts = scoreQuestion(q, currentAnswers[q.id]);
      totalPoints += pts;
      if (pts === 100) correctCount++;
    }

    const maxPoints = currentQuestions.length * 100;
    const percentage = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;
    // Pass at 65% of total points
    const passed = percentage >= 65;
    const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);

    setResult({ correct: correctCount, total: currentQuestions.length, totalPoints, maxPoints, percentage, passed, duration });

    try {
      if (user?.id) {
        await supabase.from('app_14da0f1941_academy_mock_exams').insert({
          user_id: user.id,
          exam_type: type,
          total_questions: currentQuestions.length,
          correct_answers: correctCount,
          passed,
          duration_seconds: duration,
          completed_at: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn('Could not save exam result:', e);
    }

    setPhase('results');
  }, [type, user]);

  // Update the ref every render so the timer always calls the latest version
  handleSubmitRef.current = handleSubmit;

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

  // Timer — uses handleSubmitRef.current to avoid stale closure
  useEffect(() => {
    if (phase !== 'exam') return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          // Call via ref so we always get the latest handleSubmit with current answers
          handleSubmitRef.current();
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
  }, [phase, t]);

  const handleNewExam = () => {
    setPhase('intro');
    setRulesAccepted(false);
    setShowReview(false);
    setResult(null);
  };

  const currentQuestion = questions[currentIdx];
  const answeredCount = Object.keys(answers).length;
  const unansweredCount = questions.length - answeredCount;

  const setCurrentAnswer = useCallback((a: QuestionAnswer) => {
    if (!currentQuestion) return;
    setAnswers(prev => ({ ...prev, [currentQuestion.id]: a }));
  }, [currentQuestion]);

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
          <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-lg p-6 mb-4">
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
                <p className="text-xs text-zinc-500 mb-1">{t('academy.examPassScore', 'Pass Score')}</p>
                <p className="text-lg font-semibold text-zinc-100">
                  {t('academy.examPassScoreValue', '65% ({{threshold}}/{{max}} pts)')
                    .replace('{{threshold}}', String(Math.round(config.maxPoints * 0.65)))
                    .replace('{{max}}', String(config.maxPoints))}
                </p>
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
                  {t('academy.examIntroRule4', 'You need 65% to pass')}
                </li>
              </ul>
            </div>
          </div>

          {/* Language note */}
          <div className="border border-zinc-800/50 bg-zinc-900/30 rounded-lg p-4 mb-6 text-xs text-zinc-500 space-y-1">
            <p>{t('academy.examLanguageNote', 'This simulator uses English questions.')}</p>
            <p>
              {type === 'bvca'
                ? t('academy.examLanguageBVCA', 'The official B-VCA exam is available in up to 20 languages at exam centers.')
                : t('academy.examLanguageVOLVCA', 'The official VOL-VCA exam is available in Dutch, English, German and French.')}
            </p>
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
              {t('academy.examTotalPoints', '{{points}}/{{max}} points ({{percentage}}%)')
                .replace('{{points}}', String(result.totalPoints))
                .replace('{{max}}', String(result.maxPoints))
                .replace('{{percentage}}', String(result.percentage))}
            </p>
            <p className="text-sm text-zinc-400 mb-1">
              {t('academy.examCorrectCount', '{{correct}} of {{total}} questions correct')
                .replace('{{correct}}', String(result.correct))
                .replace('{{total}}', String(result.total))}
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
              <p className="text-xs text-zinc-500 mb-1">{t('academy.examPassScore', 'Pass Score')}</p>
              <p className="text-lg font-semibold text-zinc-100">{result.percentage}%</p>
              <p className="text-xs text-zinc-500">/ 65%</p>
            </div>
            <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-lg p-4 text-center">
              <p className="text-xs text-zinc-500 mb-1">{t('academy.examIntroQuestions', 'Questions')}</p>
              <p className="text-lg font-semibold text-zinc-100">{result.correct}</p>
              <p className="text-xs text-zinc-500">/ {result.total}</p>
            </div>
          </div>

          {/* Book Official Exam CTA — shown only on PASSED */}
          {result.passed && (
            <div className="border border-emerald-500/30 bg-emerald-500/5 rounded-lg p-5 mb-6">
              <div className="flex items-start gap-3">
                <BookOpen className="h-5 w-5 text-emerald-400 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-zinc-100 mb-1">
                    {t('academy.examBookOfficialCTA', 'Ready for your certificate?')}
                  </p>
                  <p className="text-xs text-zinc-400 mb-3">
                    {t('academy.examBookOfficialText', 'Book your official VCA exam with an authorized exam center.')}
                  </p>
                  <Button
                    onClick={() => navigate('/academy/vca-booking')}
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                  >
                    {t('academy.examBookOfficialButton', 'Book Official Exam')}
                  </Button>
                </div>
              </div>
            </div>
          )}

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
                const ans = answers[q.id];
                const pts = scoreQuestion(q, ans);
                const isFullCredit = pts === 100;
                const isPartial = pts > 0 && pts < 100;
                return (
                  <div
                    key={q.id}
                    className={`border rounded-lg p-5 ${
                      isFullCredit
                        ? 'border-emerald-500/30 bg-emerald-500/5'
                        : isPartial
                          ? 'border-amber-500/30 bg-amber-500/5'
                          : 'border-rose-500/30 bg-rose-500/5'
                    }`}
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <span className="text-xs text-zinc-500 mt-0.5">#{qi + 1}</span>
                      {isFullCredit ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                      ) : (
                        <XCircle className={`h-4 w-4 mt-0.5 shrink-0 ${isPartial ? 'text-amber-400' : 'text-rose-400'}`} />
                      )}
                      <div className="flex-1">
                        <p className="text-sm text-zinc-200">{q.questionText}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {t('academy.examPartialScore', 'Partial score: {{score}}/100 pts').replace('{{score}}', String(pts))}
                        </p>
                      </div>
                    </div>

                    {renderReview(q, ans)}

                    {/* Explanation */}
                    {q.explanation && (
                      <div className="mt-3 ml-7 p-3 rounded-md bg-zinc-800/50 border border-zinc-700/50">
                        <p className="text-xs text-zinc-400 font-medium mb-1">
                          {t('academy.examExplanation', 'Explanation')}
                        </p>
                        <p className="text-xs text-zinc-300">{q.explanation}</p>
                      </div>
                    )}

                    {/* Official Reference */}
                    {q.officialRef && (
                      <div className="mt-2 ml-7">
                        <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-500">
                          {t('academy.examStudyReference', 'Study reference')}: {q.officialRef}
                        </Badge>
                      </div>
                    )}
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

              {renderQuestionInput(currentQuestion, answers[currentQuestion.id], setCurrentAnswer)}
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
