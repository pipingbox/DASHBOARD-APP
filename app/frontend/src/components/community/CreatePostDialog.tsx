import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus } from 'lucide-react';
import { supabase, TABLES } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Channel } from '@/lib/community';

interface CreatePostDialogProps {
  channels: Channel[];
  defaultChannelId?: string;
  onCreated?: (post: { id: string; channelSlug: string }) => void;
  trigger?: React.ReactNode;
}

interface FormState {
  channel_id: string;
  title: string;
  body: string;
  location: string;
  tags: string;
  attachment_url: string;
}

const empty = (defaultChannelId?: string): FormState => ({
  channel_id: defaultChannelId ?? '',
  title: '',
  body: '',
  location: '',
  tags: '',
  attachment_url: '',
});

export function CreatePostDialog({
  channels,
  defaultChannelId,
  onCreated,
  trigger,
}: CreatePostDialogProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty(defaultChannelId));
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  useEffect(() => {
    if (open) {
      setForm(empty(defaultChannelId));
      setErrors({});
      setSubmitError(null);
    }
  }, [open, defaultChannelId]);

  const channelsById = useMemo(() => {
    const map = new Map<string, Channel>();
    channels.forEach((c) => map.set(c.id, c));
    return map;
  }, [channels]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validate = () => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.channel_id) next.channel_id = 'Pick a channel';
    if (!form.title.trim() || form.title.trim().length < 4) {
      next.title = 'Title must be at least 4 characters';
    } else if (form.title.length > 160) {
      next.title = 'Title is too long (max 160)';
    }
    if (!form.body.trim() || form.body.trim().length < 8) {
      next.body = 'Post body must be at least 8 characters';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!user) {
      const msg = 'You must be signed in to post';
      setSubmitError(msg);
      toast.error(msg);
      return;
    }
    if (!validate()) {
      toast.error('Please fix the highlighted fields');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Verify we actually have an authenticated session — RLS requires it.
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();
      if (sessionError) {
        console.error('[CreatePost] getSession failed:', sessionError);
      }
      const session = sessionData?.session;
      if (!session || !session.user) {
        const msg =
          'Your session has expired. Please sign out and sign in again, then retry.';
        console.error('[CreatePost] No active session found', { sessionData });
        setSubmitError(msg);
        toast.error('Not signed in', { description: msg });
        return;
      }

      // 2. Build the payload with all required fields.
      const rawTags = form.tags
        .split(',')
        .map((t) => t.trim().replace(/^#/, ''))
        .filter(Boolean);

      // Location is stored as a normal tag so filtering works uniformly.
      const locationTags = form.location
        .split(',')
        .map((t) => t.trim().replace(/^#/, ''))
        .filter(Boolean);

      const tagsArr = Array.from(new Set([...locationTags, ...rawTags])).slice(0, 8);

      const payload = {
        user_id: session.user.id,
        channel_id: form.channel_id,
        title: form.title.trim(),
        body: form.body.trim(),
        tags: tagsArr.length > 0 ? tagsArr : null,
        attachment_url: form.attachment_url.trim() || null,
      };

      console.info('[CreatePost] inserting post', {
        table: TABLES.communityPosts,
        payload,
      });

      // 3. Insert into the community posts table.
      const { data, error } = await supabase
        .from(TABLES.communityPosts)
        .insert(payload)
        .select('id, channel_id')
        .single();

      if (error || !data) {
        console.error('[CreatePost] insert failed', {
          error,
          message: error?.message,
          code: (error as { code?: string } | null)?.code,
          details: (error as { details?: string } | null)?.details,
          hint: (error as { hint?: string } | null)?.hint,
          payload,
        });
        const description =
          error?.message ||
          'The server rejected the insert. Please try again or contact support.';
        setSubmitError(description);
        toast.error('Failed to create post', { description });
        return;
      }

      // 4. Success — confirm, close, hand back to parent for refresh/navigation.
      const ch = channelsById.get(data.channel_id);
      toast.success('Post published');
      setSubmitError(null);
      setOpen(false);
      onCreated?.({ id: data.id, channelSlug: ch?.slug ?? '' });
    } catch (err) {
      console.error('[CreatePost] unexpected error', err);
      const description =
        err instanceof Error ? err.message : 'Unexpected error. Please try again.';
      setSubmitError(description);
      toast.error('Failed to create post', { description });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button className="bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold">
            <Plus className="mr-2 h-4 w-4" />
            New post
          </Button>
        )}
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg bg-[#0a0a0a] border-l border-zinc-800 text-zinc-100 overflow-y-auto"
      >
        <SheetHeader className="space-y-1">
          <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">
            Community
          </p>
          <SheetTitle className="text-zinc-100">Create a new post</SheetTitle>
          <SheetDescription className="text-zinc-500">
            Share a question, a tip or a shop-floor story with the PipingBox community.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          {submitError && (
            <div
              role="alert"
              className="border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300"
            >
              <p className="font-semibold uppercase tracking-[0.2em] text-red-400">
                Post not created
              </p>
              <p className="mt-1 break-words text-red-200">{submitError}</p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="channel" className="text-xs uppercase tracking-[0.2em] text-zinc-400">
              Channel <span className="text-[#f59e0b]">*</span>
            </Label>
            <select
              id="channel"
              value={form.channel_id}
              onChange={(e) => update('channel_id', e.target.value)}
              className="flex h-9 w-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#f59e0b]"
            >
              <option value="">— Select a channel —</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.slug} · {c.name}
                </option>
              ))}
            </select>
            {errors.channel_id && (
              <p className="text-xs text-red-500">{errors.channel_id}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="title" className="text-xs uppercase tracking-[0.2em] text-zinc-400">
              Title <span className="text-[#f59e0b]">*</span>
            </Label>
            <Input
              id="title"
              placeholder="e.g. Best purge setup for DSS TIG root?"
              value={form.title}
              onChange={(e) => update('title', e.target.value)}
              maxLength={200}
              className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-[#f59e0b]"
            />
            {errors.title && <p className="text-xs text-red-500">{errors.title}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="body" className="text-xs uppercase tracking-[0.2em] text-zinc-400">
              Body <span className="text-[#f59e0b]">*</span>
            </Label>
            <Textarea
              id="body"
              placeholder="Share the details — what you tried, what went wrong, what worked…"
              rows={8}
              value={form.body}
              onChange={(e) => update('body', e.target.value)}
              className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-[#f59e0b] resize-none"
            />
            {errors.body && <p className="text-xs text-red-500">{errors.body}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="location" className="text-xs uppercase tracking-[0.2em] text-zinc-400">
              Location (optional)
            </Label>
            <Input
              id="location"
              placeholder="Antwerp, Belgium"
              value={form.location}
              onChange={(e) => update('location', e.target.value)}
              className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-[#f59e0b]"
            />
            <p className="text-[10px] text-zinc-600">
              City, country or region. Comma-separated. Used for filtering.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tags" className="text-xs uppercase tracking-[0.2em] text-zinc-400">
              Tags (optional)
            </Label>
            <Input
              id="tags"
              placeholder="tig, 316l, orbital"
              value={form.tags}
              onChange={(e) => update('tags', e.target.value)}
              className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-[#f59e0b]"
            />
            <p className="text-[10px] text-zinc-600">
              Comma-separated. Max 8 tags.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="attachment" className="text-xs uppercase tracking-[0.2em] text-zinc-400">
              Attachment URL (optional)
            </Label>
            <Input
              id="attachment"
              type="url"
              placeholder="https://…"
              value={form.attachment_url}
              onChange={(e) => update('attachment_url', e.target.value)}
              className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-[#f59e0b]"
            />
            <p className="text-[10px] text-zinc-600">
              Link to a drawing, photo or doc. File uploads will be added later.
            </p>
          </div>

          <SheetFooter className="mt-4 flex-row gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="!bg-transparent !hover:bg-transparent border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:border-zinc-600"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Publishing…
                </>
              ) : (
                'Publish post'
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}