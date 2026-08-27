import { VCA_QUESTIONS } from './academy-questions';

export interface VCAQuizQuestion {
  id: number;
  moduleId: number;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  correctAnswer: 'A' | 'B' | 'C';
  explanation?: string;
  officialRef?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  isBVCA: boolean;
  isVOLVCA: boolean;
}

// Convert from academy-questions format to quiz format with numeric ids.
// Only single_choice questions are used in module quizzes.
export const QUIZ_QUESTIONS: VCAQuizQuestion[] = VCA_QUESTIONS
  .filter(q => q.questionType === 'single_choice')
  .map((q, idx) => {
    // q is narrowed to SingleChoiceQuestion here
    if (q.questionType !== 'single_choice') return null as unknown as VCAQuizQuestion;
    return {
      id: idx + 1,
      moduleId: q.moduleId,
      questionText: q.questionText,
      optionA: q.optionA,
      optionB: q.optionB,
      optionC: q.optionC,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
      officialRef: q.officialRef,
      difficulty: q.difficulty,
      isBVCA: q.isBVCA,
      isVOLVCA: q.isVOLVCA,
    };
  });

export function getModuleQuestions(moduleId: number): VCAQuizQuestion[] {
  return QUIZ_QUESTIONS.filter(q => q.moduleId === moduleId);
}

export function getModuleCount(): Record<number, number> {
  const counts: Record<number, number> = {};
  QUIZ_QUESTIONS.forEach(q => {
    counts[q.moduleId] = (counts[q.moduleId] || 0) + 1;
  });
  return counts;
}
