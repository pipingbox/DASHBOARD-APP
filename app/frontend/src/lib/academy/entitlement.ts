import { supabase, TABLES } from '@/lib/supabase';

/**
 * PB-MARKET-ACCESS-001 — canonical course entitlement.
 *
 * Being authenticated is NOT an entitlement. A user may access premium lesson
 * content only through an explicit, canonical source:
 *
 *   1. a paid order (app_orders.status = 'paid') for a product key that
 *      unlocks the course;
 *   2. the lesson's free-preview flag (checked by the caller);
 *   3. the admin role.
 *
 * Extension point (documented, intentionally NOT wired): a future course
 * access-grant table. `app_certification_access_grants` belongs to a different
 * domain (worker-certification consent during hiring) and must not be used
 * for course access.
 *
 * Fail-closed: any query error resolves to "no access".
 */

export interface EntitlementCourse {
  slug: string;
  is_premium: boolean;
}

export interface EntitlementSubject {
  userId: string | null | undefined;
  role: string | null | undefined;
}

/**
 * Course slug -> product keys sold via app_stripe_prices that unlock it.
 * TODO(PB-MARKET-PRICING-001): replace this static map with catalog data so
 * the mapping is maintained in one place (app_academy_courses <-> catalog).
 */
const COURSE_PRODUCT_KEYS: Record<string, string[]> = {
  'vca-preparation': ['vca_course_bvca'],
};

export function courseProductKeys(slug: string): string[] {
  return COURSE_PRODUCT_KEYS[slug] ?? [];
}

async function hasPaidOrder(userId: string, slug: string): Promise<boolean> {
  const keys = courseProductKeys(slug);
  if (keys.length === 0) return false;
  const { data } = await supabase
    .from(TABLES.orders)
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'paid')
    .in('product_key', keys)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

/**
 * Resolve whether the subject has an entitlement for the course.
 * Non-premium courses are always entitled. Premium courses require a paid
 * order (or the admin role). Anonymous users never have an entitlement.
 */
export async function hasCourseEntitlement(
  subject: EntitlementSubject,
  course: EntitlementCourse,
): Promise<boolean> {
  if (!course.is_premium) return true;
  if (!subject.userId) return false;
  if (subject.role === 'admin') return true;
  return hasPaidOrder(subject.userId, course.slug);
}
