export type VcaExamType = 'bvca' | 'volvca';

export const EXAM_CONFIG: Record<VcaExamType, { questions: number; duration: number; passScore: number; maxPoints: number }> = {
  bvca: { questions: 40, duration: 60 * 60, passScore: 26, maxPoints: 4000 },
  volvca: { questions: 60, duration: 60 * 60, passScore: 39, maxPoints: 6000 },
};

export function examPassPercent(type: VcaExamType): number {
  const { passScore, questions } = EXAM_CONFIG[type];
  return (passScore / questions) * 100;
}

export function examPassPoints(type: VcaExamType): number {
  return (EXAM_CONFIG[type].maxPoints * examPassPercent(type)) / 100;
}

export function examPassed(type: VcaExamType, totalPoints: number, maxPoints: number): boolean {
  return maxPoints > 0 && totalPoints * 100 >= maxPoints * examPassPercent(type);
}
