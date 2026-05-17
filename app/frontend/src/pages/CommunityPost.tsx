import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Heart,
  Bookmark,
  BookmarkCheck,
  Loader2,
  MessageSquare,
  AlertCircle,
  Pin,
  PinOff,
  Lock,
  LockOpen,
  Shield,
  Trash2,
  Link as LinkIcon,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { supabase, TABLES } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useIsModerator } from '@/hooks/useIsModerator';
import {
  AuthorSummary,
  Channel,
  Comment,
  Post,
  initialsFrom,
} from '@/lib/community';
import { createNotification } from '@/lib/notifications';

export default function CommunityPost() {
  const { t } = useTranslation();
  const { channelSlug, postId } = useParams<{ channelSlug: string; postId: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [channel, setChannel] = useState<Channel | null>(null);
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [commentBody, setCommentBody] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
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
    if (!channelSlug || !postId) return;
    setLoading(true);
    setError(null);

    const { data: chData, error: chErr } = await supabase
      .from(TABLES.communityChannels)
      .select('*')
      .eq('slug', channelSlug)
      .eq('is_public', true)
      .single();

    if (chErr || !chData) {
      setError(t('community.channelNotFound'));
      setLoading(false);
      return;
    }
    setChannel(chData as Channel);

    const { data: postData, error: postErr } = await supabase
      .from(TABLES.communityPosts)
      .select('*')
      .eq('id', postId)
      .eq('channel_id', (chData as Channel).id)
      .eq('is_deleted', false)
      .single();

    if (postErr || !postData) {
      setError(t('community.postNotFound'));
      setLoading(false);
      return;
    }

    const { data: authorData } = await supabase
      .from(TABLES.profiles)
      .select('id, display_name, title, avatar_url')
      .eq('id', (postData as Post).user_id)
      .maybeSingle();

    const [likeCountRes, myLikeRes, savedRes] = await Promise.all([
      supabase
        .from(TABLES.communityPostLikes)
        .select('*', { count: 'exact', head: true })
        .eq('post_id', postId),
      user
        ? supabase
            .from(TABLES.communityPostLikes)
            .select('id')
            .eq('post_id', postId)
            .eq('user_id', user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      user
        ? supabase
            .from(TABLES.communitySavedPosts)
            .select('id')
            .eq('post_id', postId)
            .eq('user_id', user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    setPost({
      ...(postData as Post),
      author: (authorData as AuthorSummary) ?? null,
      like_count: likeCountRes.count ?? 0,
      liked_by_me: Boolean(myLikeRes.data),
      saved_by_me: Boolean(savedRes.data),
    });

    const { data: commentsData } = await supabase
      .from(TABLES.communityComments)
      .select('*')
      .eq('post_id', postId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true });

    const list = (commentsData as Comment[]) ?? [];
    const commenterIds = Array.from(new Set(list.map((c) => c.user_id)));
    const authorsMap = new Map<string, AuthorSummary>();
    if (commenterIds.length > 0) {
      const { data: profData } = await supabase
        .from(TABLES.profiles)
        .select('id, display_name, title, avatar_url')
        .in('id', commenterIds);
      (profData as AuthorSummary[] | null)?.forEach((p) => authorsMap.set(p.id, p));
    }
    setComments(list.map((c) => ({ ...c, author: authorsMap.get(c.user_id) ?? null })));
    setLoading(false);
  }, [channelSlug, postId, user, t]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggleLike = async () => {
    if (!post) return;
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
      setPost({
        ...post,
        liked_by_me: false,
        like_count: Math.max(0, (post.like_count ?? 1) - 1),
      });
    } else {
      const { error: insErr } = await supabase
        .from(TABLES.communityPostLikes)
        .insert({ post_id: post.id, user_id: user.id });
      if (!insErr) {
        setPost({
          ...post,
          liked_by_me: true,
          like_count: (post.like_count ?? 0) + 1,
        });
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

  const handleToggleSave = async () => {
    if (!post) return;
    if (!user) {
      navigate('/login');
      return;
    }
    if (post.saved_by_me) {
      await supabase
        .from(TABLES.communitySavedPosts)
        .delete()
        .eq('post_id', post.id)
        .eq('user_id', user.id);
      setPost({ ...post, saved_by_me: false });
      toast.success(t('community.removedFromSaved'));
    } else {
      const { error: insErr } = await supabase
        .from(TABLES.communitySavedPosts)
        .insert({ post_id: post.id, user_id: user.id });
      if (!insErr) {
        setPost({ ...post, saved_by_me: true });
        toast.success(t('community.savedForLater'));
      }
    }
  };

  const handleDeletePost = async () => {
    if (!post || !user) return;
    const canDelete = post.user_id === user.id || isModerator;
    if (!canDelete) return;
    if (!window.confirm(t('community.confirmDeletePost'))) return;

    const query = supabase.from(TABLES.communityPosts).update({ is_deleted: true }).eq('id', post.id);
    const { error: delErr } = post.user_id === user.id
      ? await query.eq('user_id', user.id)
      : await query;

    if (delErr) {
      toast.error(t('community.failedToDelete'), { description: delErr.message });
      return;
    }
    toast.success(t('community.postDeleted'));
    navigate(`/community/${channelSlug}`);
  };

  const handleTogglePin = async () => {
    if (!post || !isModerator) return;
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
    setPost({ ...post, is_pinned: next });
    toast.success(next ? t('community.postPinned') : t('community.postUnpinned'));
  };

  const handleToggleLock = async () => {
    if (!post || !isModerator) return;
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
    setPost({ ...post, is_locked: next });
    toast.success(next ? t('community.postLockedToast') : t('community.postUnlockedToast'));
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!post) return;
    if (!user) {
      navigate('/login');
      return;
    }
    if (post.is_locked && !isModerator) {
      toast.error(t('community.postLockedCommentsClosed'));
      return;
    }
    if (!commentBody.trim() || commentBody.trim().length < 2) {
      toast.error(t('community.writeSomethingFirst'));
      return;
    }
    setSubmittingComment(true);
    const { data: newComment, error: insErr } = await supabase
      .from(TABLES.communityComments)
      .insert({
        post_id: post.id,
        user_id: user.id,
        body: commentBody.trim(),
      })
      .select('id')
      .single();
    setSubmittingComment(false);
    if (insErr) {
      toast.error(t('community.failedToPostComment'), { description: insErr.message });
      return;
    }
    void createNotification({
      recipientId: post.user_id,
      actorId: user.id,
      type: 'comment',
      postId: post.id,
      commentId: (newComment as { id: string } | null)?.id,
      postTitle: post.title,
      postChannelSlug: channelSlug ?? null,
      actorName: profile?.display_name ?? null,
    });
    setCommentBody('');
    await load();
    toast.success(t('community.commentPosted'));
  };

  const handleDeleteComment = async (comment: Comment) => {
    if (!user) return;
    const isOwnComment = comment.user_id === user.id;
    if (!isOwnComment && !isModerator) return;
    if (!window.confirm(t('community.confirmDeleteComment'))) return;

    const query = supabase
      .from(TABLES.communityComments)
      .update({ is_deleted: true })
      .eq('id', comment.id);
    const { error: delErr } = isOwnComment
      ? await query.eq('user_id', user.id)
      : await query;

    if (delErr) {
      toast.error(t('community.failedToDeleteComment'), { description: delErr.message });
      return;
    }
    setComments((prev) => prev.filter((c) => c.id !== comment.id));
    toast.success(t('community.commentDeleted'));
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-6 w-40 bg-zinc-900 animate-pulse" />
        <div className="h-48 border border-zinc-800/80 bg-[#0d0d0d] animate-pulse" />
        <div className="h-32 border border-zinc-800/80 bg-[#0d0d0d] animate-pulse" />
      </div>
    );
  }

  if (error || !post || !channel) {
    return (
      <div className="space-y-6">
        <Link
          to={`/community${channelSlug ? `/${channelSlug}` : ''}`}
          className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-zinc-500 hover:text-[#f59e0b]"
        >
          <ArrowLeft className="h-3 w-3" /> {t('community.back')}
        </Link>
        <div className="border border-dashed border-zinc-800 p-12 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-zinc-700" />
          <p className="mt-3 text-sm text-zinc-400">{error ?? t('community.postUnavailable')}</p>
        </div>
      </div>
    );
  }

  const isOwner = Boolean(user && user.id === post.user_id);
  const canDeletePost = isOwner || isModerator;

  return (
    <div className="space-y-8">
      <Link
        to={`/community/${channel.slug}`}
        className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-zinc-500 hover:text-[#f59e0b]"
      >
        <ArrowLeft className="h-3 w-3" /> {t('community.backToChannel', { slug: channel.slug })}
      </Link>

      <PageHeader
        eyebrow={`#${channel.slug} · ${t('community.post')}`}
        title={post.title}
        description={t('community.postedBy', {
          name: post.author?.display_name || t('common.anonymous'),
          time: formatRelativeTime(post.created_at),
        })}
      />

      <article className="border border-zinc-800/80 bg-[#0d0d0d] p-6">
        <div className="flex items-start gap-4">
          <Avatar author={post.author} size="lg" t={t} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
              <span className="font-medium text-zinc-200">
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
              {isModerator && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#f59e0b]/10 text-[#f59e0b] uppercase tracking-[0.2em]">
                  <Shield className="h-3 w-3" /> {t('community.moderator')}
                </span>
              )}
            </div>

            <h2 className="mt-2 text-xl font-semibold text-zinc-100">{post.title}</h2>
            <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
              {post.body}
            </div>

            {post.attachment_url && (
              <a
                href={post.attachment_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300 hover:border-[#f59e0b] hover:text-[#f59e0b]"
              >
                <LinkIcon className="h-3.5 w-3.5" />
                <span className="truncate max-w-xs">{post.attachment_url}</span>
              </a>
            )}

            {post.tags && post.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] bg-zinc-900 text-zinc-400 border border-zinc-800"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-zinc-800/70 pt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleToggleLike}
                className={`!bg-transparent !hover:bg-transparent border-zinc-800 ${
                  post.liked_by_me
                    ? 'text-[#f59e0b] border-[#f59e0b]'
                    : 'text-zinc-300 hover:text-[#f59e0b] hover:border-[#f59e0b]'
                }`}
              >
                <Heart
                  className={`mr-2 h-3.5 w-3.5 ${
                    post.liked_by_me ? 'fill-[#f59e0b]' : ''
                  }`}
                />
                {post.like_count ?? 0} {t('community.useful')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleToggleSave}
                className={`!bg-transparent !hover:bg-transparent border-zinc-800 ${
                  post.saved_by_me
                    ? 'text-[#f59e0b] border-[#f59e0b]'
                    : 'text-zinc-300 hover:text-[#f59e0b] hover:border-[#f59e0b]'
                }`}
              >
                {post.saved_by_me ? (
                  <BookmarkCheck className="mr-2 h-3.5 w-3.5 fill-[#f59e0b]" />
                ) : (
                  <Bookmark className="mr-2 h-3.5 w-3.5" />
                )}
                {post.saved_by_me ? t('community.saved') : t('community.save')}
              </Button>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                  <MessageSquare className="h-3 w-3" /> {comments.length} {t('community.comments')}
                </span>
                {isModerator && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleTogglePin}
                      className="!bg-transparent !hover:bg-transparent border-zinc-800 text-zinc-300 hover:text-[#f59e0b] hover:border-[#f59e0b]"
                    >
                      {post.is_pinned ? (
                        <>
                          <PinOff className="mr-2 h-3.5 w-3.5" />
                          {t('community.unpin')}
                        </>
                      ) : (
                        <>
                          <Pin className="mr-2 h-3.5 w-3.5" />
                          {t('community.pin')}
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleToggleLock}
                      className="!bg-transparent !hover:bg-transparent border-zinc-800 text-zinc-300 hover:text-[#f59e0b] hover:border-[#f59e0b]"
                    >
                      {post.is_locked ? (
                        <>
                          <LockOpen className="mr-2 h-3.5 w-3.5" />
                          {t('community.unlock')}
                        </>
                      ) : (
                        <>
                          <Lock className="mr-2 h-3.5 w-3.5" />
                          {t('community.lock')}
                        </>
                      )}
                    </Button>
                  </>
                )}
                {canDeletePost && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleDeletePost}
                    className="!bg-transparent !hover:bg-transparent border-red-900/50 text-red-500 hover:border-red-500"
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    {isOwner ? t('community.delete') : t('community.remove')}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </article>

      <section className="space-y-4">
        <h3 className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">
          {t('community.comments')} ({comments.length})
        </h3>

        {post.is_locked && !isModerator ? (
          <div className="border border-dashed border-zinc-800 p-6 text-center text-xs text-zinc-500">
            <Lock className="mx-auto h-4 w-4 text-zinc-600" />
            <p className="mt-2 uppercase tracking-[0.2em]">{t('community.postLocked')}</p>
            <p className="mt-1 normal-case tracking-normal text-zinc-600">
              {t('community.postLockedDescription')}
            </p>
          </div>
        ) : user ? (
          <form
            onSubmit={handleSubmitComment}
            className="border border-zinc-800/80 bg-[#0d0d0d] p-4 space-y-3"
          >
            <Textarea
              placeholder={
                post.is_locked
                  ? t('community.commentPlaceholderLocked')
                  : t('community.commentPlaceholder')
              }
              rows={3}
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-[#f59e0b] resize-none"
            />
            <div className="flex items-center justify-end">
              <Button
                type="submit"
                disabled={submittingComment}
                className="bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold"
              >
                {submittingComment ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('community.posting')}
                  </>
                ) : (
                  t('community.postComment')
                )}
              </Button>
            </div>
          </form>
        ) : (
          <div className="border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-400">
            <Link to="/login" className="text-[#f59e0b] hover:underline">
              {t('community.signInToComment')}
            </Link>{' '}
            {t('community.signInToJoin')}
          </div>
        )}

        {comments.length === 0 ? (
          <div className="border border-dashed border-zinc-800 p-8 text-center text-xs text-zinc-500">
            {t('community.noCommentsYet')}
          </div>
        ) : (
          <ul className="space-y-3">
            {comments.map((c) => (
              <li
                key={c.id}
                className="border border-zinc-800/80 bg-[#0d0d0d] p-4"
              >
                <div className="flex items-start gap-3">
                  <Avatar author={c.author} t={t} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                      <span className="font-medium text-zinc-200">
                        {c.author?.display_name || t('common.anonymous')}
                      </span>
                      {c.author?.title && (
                        <>
                          <span className="text-zinc-700">·</span>
                          <span>{c.author.title}</span>
                        </>
                      )}
                      <span className="text-zinc-700">·</span>
                      <span>{formatRelativeTime(c.created_at)}</span>
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm text-zinc-300">
                      {c.body}
                    </p>
                  </div>
                  {user && (user.id === c.user_id || isModerator) && (
                    <button
                      type="button"
                      onClick={() => handleDeleteComment(c)}
                      className="text-zinc-600 hover:text-red-500 transition"
                      title={
                        user.id === c.user_id
                          ? t('community.deleteComment')
                          : t('community.removeCommentMod')
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Avatar({
  author,
  size = 'md',
  t,
}: {
  author: AuthorSummary | null | undefined;
  size?: 'md' | 'lg';
  t: (k: string) => string;
}) {
  const cls = size === 'lg' ? 'h-12 w-12 text-sm' : 'h-9 w-9 text-[11px]';
  if (author?.avatar_url) {
    return (
      <img
        src={author.avatar_url}
        alt={author.display_name || t('common.anonymous')}
        className={`${cls} object-cover bg-zinc-900`}
      />
    );
  }
  return (
    <div
      className={`${cls} flex items-center justify-center bg-zinc-900 font-semibold text-[#f59e0b] uppercase`}
    >
      {initialsFrom(author?.display_name)}
    </div>
  );
}