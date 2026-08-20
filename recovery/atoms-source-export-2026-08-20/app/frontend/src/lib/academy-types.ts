export interface VCAQuestion {
  id: string;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  correctAnswer: 'A' | 'B' | 'C';
  moduleId: number;
  moduleName: string;
  difficulty: 'easy' | 'medium' | 'hard';
  isBVCA: boolean;
  isVOLVCA: boolean;
}

export interface ModuleContent {
  moduleId: number;
  moduleName: string;
  moduleNameNL: string;
  summary: string;
  keyTopics: string[];
  isBVCA: boolean;
  isVOLVCA: boolean;
}
