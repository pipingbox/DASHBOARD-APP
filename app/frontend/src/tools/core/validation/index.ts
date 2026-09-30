/**
 * Input validation schemas for PipingBox Tools.
 *
 * Built on zod (already in dependencies). Engines receive validated inputs;
 * invalid combinations are rejected before calculation.
 */

import { z } from 'zod';

export const PositiveNumber = z.number().finite().positive();
export const NonNegativeNumber = z.number().finite().nonnegative();
export const AngleDegrees = z.number().finite().min(0).max(180);
export const AcuteAngleDegrees = z.number().finite().min(0).max(90);

/** NPS string such as "1/2", "1-1/2", "24". */
export const NpsString = z.string().min(1);

/** Pipe schedule such as "STD", "XS", "Sch 40", "160". */
export const ScheduleString = z.string().min(1);

export const UnitSystemSchema = z.enum(['metric', 'imperial']);

/** Shared offset input base: A (advance) and B (offset) are positive lengths. */
export const OffsetBaseInput = z.object({
  a: PositiveNumber.describe('horizontal advance'),
  b: PositiveNumber.describe('vertical offset'),
});

export const ElbowSpec = z.object({
  /** Center-line radius of the elbow in mm. */
  clrMm: PositiveNumber,
  /** Elbow angle in degrees (90, 45, etc.). */
  elbowAngleDeg: AcuteAngleDegrees.default(90),
});

export const PipeSpec = z.object({
  nps: NpsString,
  schedule: ScheduleString,
});

/** Result wrapper for validated or invalid input. */
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: string[];
}

export function validate<T>(validator: z.ZodType<T>, value: unknown): ValidationResult<T> {
  const result = validator.safeParse(value);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
  };
}

export type { z };
