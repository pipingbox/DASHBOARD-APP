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
  difficulty: 'easy' | 'medium' | 'hard';
  isBVCA: boolean;
  isVOLVCA: boolean;
}

// Convert from academy-questions format to quiz format with numeric ids
export const QUIZ_QUESTIONS: VCAQuizQuestion[] = VCA_QUESTIONS.map((q, idx) => ({
  id: idx + 1,
  moduleId: q.moduleId,
  questionText: q.questionText,
  optionA: q.optionA,
  optionB: q.optionB,
  optionC: q.optionC,
  correctAnswer: q.correctAnswer as 'A' | 'B' | 'C',
  difficulty: q.difficulty as 'easy' | 'medium' | 'hard',
  isBVCA: q.isBVCA,
  isVOLVCA: q.isVOLVCA,
}));

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