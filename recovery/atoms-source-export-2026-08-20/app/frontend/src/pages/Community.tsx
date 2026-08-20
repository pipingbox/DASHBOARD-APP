import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Hash,
  Briefcase,
  Flame,
  MessageSquare,
  Ruler,
  ShieldAlert,
  Wrench,
  Users,
  ArrowRight,
  Search,
  Megaphone,
  Home,
  Scale,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { supabase, TABLES } from '@/lib/supabase';
import { Channel } from '@/lib/community';
import { CreatePostDialog } from '@/components/community/CreatePostDialog';
import { useNavigate } from 'react-router-dom';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  MessageSquare,
  Flame,
  Ruler,
  ShieldAlert,
  Briefcase,
  Wrench,
  Hash,
  Megaphone,
  Home,
  Scale,
};

function channelIcon(name: string | null | undefined) {
  if (!name) return Hash;
  return ICON_MAP[name] ?? Hash;
}

export default function Community() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data: chData } = await supabase
      .from(TABLES.communityChannels)
      .select('*')
      .eq('is_public', true)
      .order('name', { ascending: true });

    const list = (chData as Channel[]) ?? [];

    const counts = await Promise.all(
      list.map((c) =>
        supabase
          .from(TABLES.communityPosts)
          .select('*', { count: 'exact', head: true })
          .eq('channel_id', c.id)
          .eq('is_deleted', false),
      ),
    );
    const memberCounts = await Promise.all(
      list.map((c) =>
        supabase
          .from(TABLES.communityPosts)
          .select('user_id', { count: 'exact', head: false })
          .eq('channel_id', c.id)
          .eq('is_deleted', false),
      ),
    );

    const enriched = list.map((c, idx) => {
      const postCount = counts[idx].count ?? 0;
      const rows = (memberCounts[idx].data as { user_id: string }[] | null) ?? [];
      const uniqueMembers = new Set(rows.map((r) => r.user_id)).size;
      return {
        ...c,
        post_count: postCount,
        member_count: uniqueMembers,
      };
    });

    setChannels(enriched);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!query.trim()) return channels;
    const q = query.trim().toLowerCase();
    return channels.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description ?? '').toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q),
    );
  }, [channels, query]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t('nav.community')}
        title={t('community.title')}
        description={t('community.description')}
        actions={
          channels.length > 0 ? (
            <CreatePostDialog
              channels={channels}
              onCreated={({ channelSlug, id }) => {
                if (channelSlug) {
                  navigate(`/community/${channelSlug}/post/${id}`);
                } else {
                  load();
                }
              }}
            />
          ) : undefined
        }
      />

      <div className="flex items-center gap-3 max-w-md">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600" />
          <Input
            placeholder={t('community.searchChannels')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-[#f59e0b]"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-44 border border-zinc-800/80 bg-[#0d0d0d] animate-pulse"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="border border-dashed border-zinc-800 p-12 text-center">
          <Hash className="mx-auto h-8 w-8 text-zinc-700" />
          <p className="mt-3 text-sm text-zinc-400">
            {query ? t('community.noChannelsMatch') : t('community.noChannels')}
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => {
            const Icon = channelIcon(c.icon);
            return (
              <Link
                key={c.id}
                to={`/community/${c.slug}`}
                className="group border border-zinc-800/80 bg-[#0d0d0d] p-6 hover:border-[#f59e0b] transition"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-9 w-9 items-center justify-center bg-zinc-900 text-[#f59e0b] group-hover:bg-[#f59e0b]/10">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                    <Users className="h-3 w-3" />
                    {(c.member_count ?? 0).toLocaleString()}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-zinc-100">
                  #{c.slug}
                </h3>
                <p className="mt-0.5 text-xs uppercase tracking-[0.2em] text-zinc-500">
                  {c.name}
                </p>
                {c.description && (
                  <p className="mt-2 text-sm text-zinc-400 line-clamp-2">
                    {c.description}
                  </p>
                )}
                <div className="mt-4 flex items-center justify-between border-t border-zinc-800/70 pt-3">
                  <span className="flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                    <MessageSquare className="h-3 w-3" />
                    {(c.post_count ?? 0).toLocaleString()} {t('community.posts')}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-zinc-500 group-hover:text-[#f59e0b]">
                    {t('community.openChannel')} <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}