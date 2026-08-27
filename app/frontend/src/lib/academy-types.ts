export type VCAQuestionType =
  | 'single_choice'
  | 'multiple_choice'
  | 'true_false_matrix'
  | 'ordering'
  | 'matching';

export interface VCAQuestionBase {
  id: string;
  questionType: VCAQuestionType;
  moduleId: number;
  moduleName: string;
  difficulty: 'easy' | 'medium' | 'hard';
  isBVCA: boolean;
  isVOLVCA: boolean;
  explanation?: string;
  officialRef?: string;
  studyTopic?: string;
}

export interface SingleChoiceQuestion extends VCAQuestionBase {
  questionType: 'single_choice';
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  correctAnswer: 'A' | 'B' | 'C';
}

export interface MultipleChoiceQuestion extends VCAQuestionBase {
  questionType: 'multiple_choice';
  questionText: string;
  options: Array<{ id: string; text: string; isCorrect: boolean }>;
}

export interface TrueFalseMatrixQuestion extends VCAQuestionBase {
  questionType: 'true_false_matrix';
  questionText: string;
  statements: Array<{ id: string; text: string; isTrue: boolean }>;
}

export interface OrderingQuestion extends VCAQuestionBase {
  questionType: 'ordering';
  questionText: string;
  items: Array<{ id: string; text: string; correctPosition: number }>;
}

export interface MatchingQuestion extends VCAQuestionBase {
  questionType: 'matching';
  questionText: string;
  leftItems: Array<{ id: string; text: string }>;
  rightItems: Array<{ id: string; text: string; matchesLeftId: string }>;
}

export type VCAQuestion =
  | SingleChoiceQuestion
  | MultipleChoiceQuestion
  | TrueFalseMatrixQuestion
  | OrderingQuestion
  | MatchingQuestion;

// Legacy type alias for backward compat during migration
export type LegacyVCAQuestion = SingleChoiceQuestion;

export type QuestionAnswer =
  | string                      // single_choice: 'A'|'B'|'C'
  | string[]                    // multiple_choice or ordering: array of ids
  | Record<string, boolean>     // true_false_matrix: {s1:true, s2:false}
  | Record<string, string>;     // matching: {l1:'r1', l2:'r3'}

export interface ModuleContent {
  moduleId: number;
  moduleName: string;
  moduleNameNL: string;
  summary: string;
  keyTopics: string[];
  isBVCA: boolean;
  isVOLVCA: boolean;
}
