import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Hash,
  Heart,
  MessageSquare,
  Search,
  Users,
  Pin,
  PinOff,
  Lock,
  LockOpen,
  Trash2,
  Shield,
  AlertCircle,
  MapPin,
  X,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { supabase, TABLES } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useIsModerator } from '@/hooks/useIsModerator';
import {
  AuthorSummary,
  Channel,
  Post,
  initialsFrom,
  isLikelyLocationTag,
} from '@/lib/community';
import { CreatePostDialog } from '@/components/community/CreatePostDialog';
import { createNotification } from '@/lib/notifications';

export default function CommunityChannel() {
  const { t } = useTranslation();
  const { channelSlug } = useParams<{ channelSlug: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [channel, setChannel] = useState<Channel | null>(null);
  const [allChannels, setAllChannels] = useState<Channel[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'recent' | 'top'>('recent');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const { isModerator } = useIsModerator(channel?.id ?? null);

  const formatRelativeTime = useCallback(
    (iso: string) => {
      const diff = Date.now() - new Date(iso).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return t('common.justNow');
      if (mins < 60) return t('common.minutesAgo', { count: mins });
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return t('common.hoursAgo', { count: hrs });
      const days = Math.floor(hrs / 24);
      return t('common.daysAgo', { count: days });
    },
    [t],
  );

  const load = useCallback(async () => {
    if (!channelSlug) return;
    setLoading(true);
    setError(null);

    const [{ data: chData, error: chErr }, { data: allData }] = await Promise.all([
      supabase
        .from(TABLES.communityChannels)
        .select('*')
        .eq('slug', channelSlug)
        .eq('is_public', true)
        .single(),
      supabase
        .from(TABLES.communityChannels)
        .select('*')
        .eq('is_public', true)
        .order('name', { ascending: true }),
    ]);

    if (chErr || !chData) {
      setError(t('community.channelNotFound'));
      setLoading(false);
      return;
    }
    setChannel(chData as Channel);
    setAllChannels((allData as Channel[]) ?? []);

    const { data: postsData, error: postsErr } = await supabase
      .from(TABLES.communityPosts)
      .select('*')
      .eq('channel_id', (chData as Channel).id)
      .eq('is_deleted', false)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (postsErr) {
      setError(t('community.failedToLoadPosts'));
      setLoading(false);
      return;
    }

    const list = (postsData as Post[]) ?? [];

    const userIds = Array.from(new Set(list.map((p) => p.user_id)));
    const authorsMap = new Map<string, AuthorSummary>();
    if (userIds.length > 0) {
      const { data: profData } = await supabase
        .from(TABLES.profiles)
        .select('id, display_name, title, avatar_url')
        .in('id', userIds);
      (profData as AuthorSummary[] | null)?.forEach((p) => authorsMap.set(p.id, p));
    }

    const postIds = list.map((p) => p.id);
    const counts = await Promise.all(
      postIds.flatMap((id) => [
        supabase
          .from(TABLES.communityPostLikes)
          .select('*', { count: 'exact', head: true })
          .eq('post_id', id),
        supabase
          .from(TABLES.communityComments)
          .select('*', { count: 'exact', head: true })
          .eq('post_id', id)
          .eq('is_deleted', false),
      ]),
    );

    let myLikes = new Set<string>();
    if (user && postIds.length > 0) {
      const { data: likesData } = await supabase
        .from(TABLES.communityPostLikes)
        .select('post_id')
        .eq('user_id', user.id)
        .in('post_id', postIds);
      myLikes = new Set(
        (likesData as { post_id: string }[] | null)?.map((l) => l.post_id) ?? [],
      );
    }

    const enriched: Post[] = list.map((p, idx) => {
      const likeCount = counts[idx * 2].count ?? 0;
      const commentCount = counts[idx * 2 + 1].count ?? 0;
      return {
        ...p,
        author: authorsMap.get(p.user_id) ?? null,
        like_count: likeCount,
        comment_count: commentCount,
        liked_by_me: myLikes.has(p.id),
      };
    });

    setPosts(enriched);
    setLoading(false);
  }, [channelSlug, user, t]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredAndSorted = useMemo(() => {
    let list = posts;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.body.toLowerCase().includes(q) ||
          (p.tags ?? []).some((tag) => tag.toLowerCase().includes(q)),
      );
    }
    if (activeTags.length > 0) {
      const actLower = activeTags.map((tag) => tag.toLowerCase());
      list = list.filter((p) => {
        const postTags = (p.tags ?? []).map((tag) => tag.toLowerCase());
        return actLower.every((tag) => postTags.includes(tag));
      });
    }
    if (sort === 'top') {
      list = [...list].sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
        const scoreA = (a.like_count ?? 0) + (a.comment_count ?? 0);
        const scoreB = (b.like_count ?? 0) + (b.comment_count ?? 0);
        if (scoreA !== scoreB) return scoreB - scoreA;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    }
    return list;
  }, [posts, query, sort, activeTags]);

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    posts.forEach((p) => {
      (p.tags ?? []).forEach((tag) => {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      });
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));
  }, [posts]);

  const toggleTag = (tag: string) => {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag],
    );
  };

  const uniqueMembers = useMemo(() => {
    return new Set(posts.map((p) => p.user_id)).size;
  }, [posts]);

  const handleToggleLike = async (post: Post) => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (post.liked_by_me) {
      await supabase
        .from(TABLES.communityPostLikes)
        .delete()
        .eq('post_id', post.id)
        .eq('user_id', user.id);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? { ...p, liked_by_me: false, like_count: Math.max(0, (p.like_count ?? 1) - 1) }
            : p,
        ),
      );
    } else {
      const { error: insErr } = await supabase
        .from(TABLES.communityPostLikes)
        .insert({ post_id: post.id, user_id: user.id });
      if (!insErr) {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === post.id
              ? { ...p, liked_by_me: true, like_count: (p.like_count ?? 0) + 1 }
              : p,
          ),
        );
        void createNotification({
          recipientId: post.user_id,
          actorId: user.id,
          type: 'like',
          postId: post.id,
          postTitle: post.title,
          postChannelSlug: channelSlug ?? null,
          actorName: profile?.display_name ?? null,
        });
      }
    }
  };

  const handleTogglePin = async (post: Post) => {
    const next = !post.is_pinned;
    const { error: updErr } = await supabase
      .from(TABLES.communityPosts)
      .update({ is_pinned: next })
      .eq('id', post.id);
    if (updErr) {
      toast.error(next ? t('community.failedToPin') : t('community.failedToUnpin'), {
        description: updErr.message,
      });
      return;
    }
    setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, is_pinned: next } : p)));
    toast.success(next ? t('community.postPinned') : t('community.postUnpinned'));
  };

  const handleToggleLock = async (post: Post) => {
    const next = !post.is_locked;
    const { error: updErr } = await supabase
      .from(TABLES.communityPosts)
      .update({ is_locked: next })
      .eq('id', post.id);
    if (updErr) {
      toast.error(next ? t('community.failedToLock') : t('community.failedToUnlock'), {
        description: updErr.message,
      });
      return;
    }
    setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, is_locked: next } : p)));
    toast.success(next ? t('community.postLockedToast') : t('community.postUnlockedToast'));
  };

  const handleModeratorRemove = async (post: Post) => {
    if (!window.confirm(t('community.confirmRemovePost'))) {
      return;
    }
    const { error: updErr } = await supabase
      .from(TABLES.communityPosts)
      .update({ is_deleted: true })
      .eq('id', post.id);
    if (updErr) {
      toast.error(t('community.failedToRemove'), { description: updErr.message });
      return;
    }
    setPosts((prev) => prev.filter((p) => p.id !== post.id));
    toast.success(t('community.postRemoved'));
  };

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="h-24 border border-zinc-800/80 bg-[#0d0d0d] animate-pulse" />
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 border border-zinc-800/80 bg-[#0d0d0d] animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error || !channel) {
    return (
      <div className="space-y-6">
        <Link
          to="/community"
          className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-zinc-500 hover:text-[#f59e0b]"
        >
          <ArrowLeft className="h-3 w-3" /> {t('community.backToCommunity')}
        </Link>
        <div className="border border-dashed border-zinc-800 p-12 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-zinc-700" />
          <p className="mt-3 text-sm text-zinc-400">{error ?? t('community.channelUnavailable')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Link
        to="/community"
        className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-zinc-500 hover:text-[#f59e0b]"
      >
        <ArrowLeft className="h-3 w-3" /> {t('community.backToCommunity')}
      </Link>

      <PageHeader
        eyebrow={`${t('community.channel')} · #${channel.slug}${isModerator ? ` · ${t('community.moderator')}` : ''}`}
        title={channel.name}
        description={channel.description ?? undefined}
        actions={
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-4 text-[10px] uppercase tracking-[0.2em] text-zinc-500 mr-2">
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" /> {uniqueMembers} {t('community.members')}
              </span>
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3" /> {posts.length} {t('community.posts')}
              </span>
              {isModerator && (
                <span className="flex items-center gap-1 text-[#f59e0b]">
                  <Shield className="h-3 w-3" /> {t('community.moderator')}
                </span>
              )}
            </div>
            <CreatePostDialog
              channels={allChannels}
              defaultChannelId={channel.id}
              onCreated={({ channelSlug: slug, id }) => {
                if (slug === channel.slug) {
                  load();
                  navigate(`/community/${slug}/post/${id}`);
                } else {
                  navigate(`/community/${slug}/post/${id}`);
                }
              }}
            />
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600" />
          <Input
            placeholder={t('community.searchPosts')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-[#f59e0b]"
          />
        </div>
        <div className="flex border border-zinc-800">
          <button
            type="button"
            onClick={() => setSort('recent')}
            className={`px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] transition ${
              sort === 'recent'
                ? 'bg-[#f59e0b] text-black font-semibold'
                : 'bg-transparent text-zinc-400 hover:text-zinc-100'
            }`}
          >
            {t('community.sortRecent')}
          </button>
          <button
            type="button"
            onClick={() => setSort('top')}
            className={`px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] transition ${
              sort === 'top'
                ? 'bg-[#f59e0b] text-black font-semibold'
                : 'bg-transparent text-zinc-400 hover:text-zinc-100'
            }`}
          >
            {t('community.sortTop')}
          </button>
        </div>
      </div>

      {allTags.length > 0 && (
        <div className="border border-zinc-800/80 bg-[#0d0d0d] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mr-1">
              {t('community.filterByTag')}
            </span>
            {allTags.slice(0, 20).map(({ tag, count }) => {
              const active = activeTags.includes(tag);
              const isLoc = isLikelyLocationTag(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] border transition ${
                    active
                      ? 'bg-[#f59e0b] text-black border-[#f59e0b] font-semibold'
                      : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-100 hover:border-zinc-600'
                  }`}
                >
                  {isLoc && <MapPin className="h-3 w-3" />}
                  {!isLoc && <span className="opacity-70">#</span>}
                  {tag}
                  <span className={active ? 'text-black/60' : 'text-zinc-600'}>
                    {count}
                  </span>
                </button>
              );
            })}
            {activeTags.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTags([])}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-zinc-500 hover:text-[#f59e0b]"
              >
                <X className="h-3 w-3" /> {t('common.clear')}
              </button>
            )}
          </div>
        </div>
      )}

      {filteredAndSorted.length === 0 ? (
        <div className="border border-dashed border-zinc-800 p-12 text-center">
          <Hash className="mx-auto h-8 w-8 text-zinc-700" />
          <p className="mt-3 text-sm text-zinc-400">
            {query ? t('community.noPostsMatch') : t('community.noPostsYet')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAndSorted.map((p) => (
            <PostRow
              key={p.id}
              post={p}
              channelSlug={channel.slug}
              onToggleLike={handleToggleLike}
              isModerator={isModerator}
              onTogglePin={handleTogglePin}
              onToggleLock={handleToggleLock}
              onRemove={handleModeratorRemove}
              formatRelativeTime={formatRelativeTime}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PostRow({
  post,
  channelSlug,
  onToggleLike,
  isModerator,
  onTogglePin,
  onToggleLock,
  onRemove,
  formatRelativeTime,
  t,
}: {
  post: Post;
  channelSlug: string;
  onToggleLike: (p: Post) => void;
  isModerator: boolean;
  onTogglePin: (p: Post) => void;
  onToggleLock: (p: Post) => void;
  onRemove: (p: Post) => void;
  formatRelativeTime: (iso: string) => string;
  t: (k: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <div className="group border border-zinc-800/80 bg-[#0d0d0d] p-5 hover:border-[#f59e0b] transition">
      <div className="flex items-start gap-4">
        <Avatar author={post.author} t={t} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
            <span className="font-medium text-zinc-300">
              {post.author?.display_name || t('common.anonymous')}
            </span>
            {post.author?.title && (
              <>
                <span className="text-zinc-700">·</span>
                <span>{post.author.title}</span>
              </>
            )}
            <span className="text-zinc-700">·</span>
            <span>{formatRelativeTime(post.created_at)}</span>
            {post.is_pinned && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#f59e0b]/10 text-[#f59e0b] uppercase tracking-[0.2em]">
                <Pin className="h-3 w-3" /> {t('community.pinned')}
              </span>
            )}
            {post.is_locked && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-zinc-900 text-zinc-400 border border-zinc-800 uppercase tracking-[0.2em]">
                <Lock className="h-3 w-3" /> {t('community.locked')}
              </span>
            )}
          </div>

          <Link
            to={`/community/${channelSlug}/post/${post.id}`}
            className="mt-1 block text-base font-semibold text-zinc-100 group-hover:text-[#f59e0b] line-clamp-2"
          >
            {post.title}
          </Link>
          <p className="mt-1.5 text-sm text-zinc-400 line-clamp-2 whitespace-pre-wrap">
            {post.body}
          </p>

          {post.tags && post.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {post.tags.map((tag) => {
                const isLoc = isLikelyLocationTag(tag);
                return (
                  <span
                    key={tag}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] border ${
                      isLoc
                        ? 'bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/30'
                        : 'bg-zinc-900 text-zinc-400 border-zinc-800'
                    }`}
                  >
                    {isLoc ? <MapPin className="h-3 w-3" /> : <span className="opacity-70">#</span>}
                    {tag}
                  </span>
                );
              })}
            </div>
          )}

          <div className="mt-4 flex items-center gap-4 text-[11px]">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onToggleLike(post);
              }}
              className={`inline-flex items-center gap-1.5 uppercase tracking-[0.2em] transition ${
                post.liked_by_me
                  ? 'text-[#f59e0b]'
                  : 'text-zinc-500 hover:text-[#f59e0b]'
              }`}
            >
              <Heart
                className={`h-3.5 w-3.5 ${post.liked_by_me ? 'fill-[#f59e0b]' : ''}`}
              />
              {post.like_count ?? 0} {t('community.useful')}
            </button>
            <Link
              to={`/community/${channelSlug}/post/${post.id}`}
              className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-zinc-500 hover:text-[#f59e0b]"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {post.comment_count ?? 0} {t('community.comments')}
            </Link>
            {isModerator && (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-[#f59e0b]">
                  <Shield className="h-3 w-3" /> {t('community.mod')}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    onTogglePin(post);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[10px] uppercase tracking-[0.2em] border border-zinc-800 text-zinc-300 hover:border-[#f59e0b] hover:text-[#f59e0b] transition"
                  title={post.is_pinned ? t('community.unpinPost') : t('community.pinPost')}
                >
                  {post.is_pinned ? (
                    <>
                      <PinOff className="h-3 w-3" /> {t('community.unpin')}
                    </>
                  ) : (
                    <>
                      <Pin className="h-3 w-3" /> {t('community.pin')}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    onToggleLock(post);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[10px] uppercase tracking-[0.2em] border border-zinc-800 text-zinc-300 hover:border-[#f59e0b] hover:text-[#f59e0b] transition"
                  title={post.is_locked ? t('community.unlockPost') : t('community.lockPost')}
                >
                  {post.is_locked ? (
                    <>
                      <LockOpen className="h-3 w-3" /> {t('community.unlock')}
                    </>
                  ) : (
                    <>
                      <Lock className="h-3 w-3" /> {t('community.lock')}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    onRemove(post);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[10px] uppercase tracking-[0.2em] border border-red-900/50 text-red-500 hover:border-red-500 transition"
                  title={t('community.removePost')}
                >
                  <Trash2 className="h-3 w-3" /> {t('community.remove')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Avatar({
  author,
  t,
}: {
  author: AuthorSummary | null | undefined;
  t: (k: string) => string;
}) {
  if (author?.avatar_url) {
    return (
      <img
        src={author.avatar_url}
        alt={author.display_name || t('common.anonymous')}
        className="h-10 w-10 object-cover bg-zinc-900"
      />
    );
  }
  return (
    <div className="flex h-10 w-10 items-center justify-center bg-zinc-900 text-[11px] font-semibold text-[#f59e0b] uppercase">
      {initialsFrom(author?.display_name)}
    </div>
  );
}