import { createClient } from '@metagptx/web-sdk';
import { supabase, TABLES } from './supabase';
import type { User } from '@supabase/supabase-js';

// Create client instance
export const client = createClient();

// ─── ARCH-003: Centralized API layer ───
// All Supabase queries go through here so table changes affect one file.
// Import from here instead of using supabase directly in components.

// ─── Jobs ───
export async function fetchJobs(opts?: { postedBy?: string; limit?: number }) {
  let q = supabase.from(TABLES.jobs).select('*').order('created_at', { ascending: false });
  if (opts?.postedBy) q = q.eq('posted_by', opts.postedBy);
  if (opts?.limit) q = q.limit(opts.limit);
  return q;
}

export async function countJobs(postedBy?: string) {
  let q = supabase.from(TABLES.jobs).select('*', { count: 'exact', head: true });
  if (postedBy) q = q.eq('posted_by', postedBy);
  return q;
}

// ─── Profiles ───
export async function fetchProfile(userId: string) {
  return supabase.from(TABLES.profiles).select('*').eq('user_id', userId).maybeSingle();
}

export async function updateProfile(userId: string, updates: Record<string, unknown>) {
  return supabase.from(TABLES.profiles).update(updates).eq('user_id', userId);
}

export async function countProfilesByRole(role: string) {
  return supabase.from(TABLES.profiles).select('*', { count: 'exact', head: true }).eq('role', role);
}

// ─── Job Applications ───
export async function fetchApplicationsByJob(jobIds: string[]) {
  if (jobIds.length === 0) return { data: [], error: null };
  return supabase.from(TABLES.jobApplications).select('job_id, created_at').in('job_id', jobIds);
}

export async function countApplications() {
  return supabase.from(TABLES.jobApplications).select('*', { count: 'exact', head: true });
}

// ─── Company Leads (Workforce Requests) ───
export async function fetchCompanyLeads(email: string, isAdmin: boolean) {
  let q = supabase.from(TABLES.companyLeads).select('*').order('created_at', { ascending: false });
  if (!isAdmin) q = q.eq('email', email);
  return q;
}

// ─── Tool Usage ───
export async function logToolUsage(userId: string, toolName: string, category: string, input: unknown, output: unknown) {
  return supabase.from(TABLES.toolUsage).insert({
    user_id: userId,
    tool_name: toolName,
    tool_category: category,
    input_data: input,
    output_data: output,
  });
}

export async function countToolUsage(userId: string) {
  return supabase.from(TABLES.toolUsage).select('*', { count: 'exact', head: true }).eq('user_id', userId);
}

// ─── Conversations ───
export async function fetchUnreadCount(user: User, role: string) {
  const isCompany = role === 'company' || role === 'admin';
  const col = isCompany ? 'company_user_id' : 'worker_user_id';
  const unreadCol = isCompany ? 'unread_company' : 'unread_worker';
  const { data } = await supabase.from(TABLES.conversations).select(unreadCol).eq(col, user.id);
  return (data || []).reduce((sum, row) => sum + ((row as Record<string, number>)[unreadCol] || 0), 0);
}

// Re-export for convenience
export { supabase, TABLES };
