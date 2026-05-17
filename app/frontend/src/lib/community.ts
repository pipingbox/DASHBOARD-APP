// Types and helpers for the PipingBox Community module.

export interface Channel {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  is_public: boolean;
  created_at: string;
  // Derived (joined client-side)
  post_count?: number;
  member_count?: number;
}

export interface AuthorSummary {
  id: string;
  display_name: string | null;
  title: string | null;
  avatar_url: string | null;
}

export interface Post {
  id: string;
  channel_id: string;
  user_id: string;
  title: string;
  body: string;
  tags: string[] | null;
  attachment_url: string | null;
  is_pinned: boolean;
  is_locked: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  // Derived
  author?: AuthorSummary | null;
  channel?: Pick<Channel, 'id' | 'slug' | 'name'> | null;
  like_count?: number;
  comment_count?: number;
  liked_by_me?: boolean;
  saved_by_me?: boolean;
}

export interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  is_deleted: boolean;
  created_at: string;
  author?: AuthorSummary | null;
}

export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function initialsFrom(name: string | null | undefined, fallback = 'U'): string {
  if (!name) return fallback;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Tag helpers. Location tags are plain tags prefixed conceptually; we treat any
// tag as a potential location. A lightweight heuristic marks well-known
// location strings so the UI can render a pin icon for them.
const KNOWN_COUNTRIES = new Set([
  'belgium', 'netherlands', 'germany', 'france', 'spain', 'portugal', 'italy',
  'uk', 'united-kingdom', 'ireland', 'norway', 'sweden', 'finland', 'denmark',
  'poland', 'czechia', 'austria', 'switzerland', 'luxembourg', 'usa', 'canada',
  'uae', 'qatar', 'saudi-arabia', 'australia', 'singapore',
]);

export function isLikelyLocationTag(tag: string): boolean {
  const t = tag.trim().toLowerCase();
  if (!t) return false;
  if (KNOWN_COUNTRIES.has(t)) return true;
  // Capitalized single words (e.g. "Antwerp") are treated as locations.
  return /^[A-Z][a-zA-Z-]+$/.test(tag.trim());
}

export function normalizeTag(raw: string): string {
  return raw.trim().replace(/^#/, '').replace(/\s+/g, '-').slice(0, 40);
}

export interface Moderator {
  id: string;
  channel_id: string;
  user_id: string;
  assigned_by: string | null;
  created_at: string;
}