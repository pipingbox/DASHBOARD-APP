-- PB-SEC-01b / PB-MARKETPLACE-V3-RECRUITMENT-001 TRACK B (PO review P1c)
-- Backend-only metadata lookup for storage objects.
--
-- secure-file-access needs the REAL content type of an object to answer
-- proxied company deliveries with the correct Content-Type and a neutral
-- filename carrying the real extension (no forced .pdf). PostgREST does not
-- expose the storage schema, so this RPC reads storage.objects server-side.
--
-- Same hardening lesson as sql/047: PostgreSQL grants EXECUTE on new
-- functions to PUBLIC by default, so REVOKE is explicit. Only service_role
-- (the broker Edge Function) may call it. The function re-checks that the
-- object lives inside the declared owner's namespace, mirroring the broker's
-- own integrity rule, so it cannot be used to probe other users' metadata.

create or replace function public.pb_get_storage_object_meta(
  p_bucket_name text,
  p_path text,
  p_owner_user_id uuid
)
returns table (mimetype text, size_bytes bigint)
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  -- Owner-namespace guard: refuse paths outside the declared owner's prefix.
  if p_path not like (p_owner_user_id::text || '/%') then
    return;
  end if;

  return query
    select
      coalesce(o.metadata ->> 'mimetype', null)::text as mimetype,
      nullif(o.metadata ->> 'size', '')::bigint as size_bytes
    from storage.objects o
    where o.bucket_id = p_bucket_name
      and o.name = p_path
    limit 1;
end;
$$;

comment on function public.pb_get_storage_object_meta(text, text, uuid) is
  'PB-SEC-01b (P1c): real MIME/size of a storage object for proxied broker deliveries. Owner-namespace guarded. service_role only.';

revoke all on function public.pb_get_storage_object_meta(text, text, uuid) from public;
revoke all on function public.pb_get_storage_object_meta(text, text, uuid) from anon, authenticated;
grant execute on function public.pb_get_storage_object_meta(text, text, uuid) to service_role;
