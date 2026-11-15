-- Run once in the Supabase SQL Editor. Safe to rerun.
-- Clerk remains the identity provider; only the server's Supabase secret has access.
begin;
create table if not exists public.handpress_fonts (
  id uuid primary key,
  owner_id text not null,
  owner_name text not null,
  name text not null,
  designer text not null,
  visibility text not null check (visibility in ('private', 'public')),
  glyph_count integer not null check (glyph_count between 1 and 85),
  size integer not null check (size between 1 and 4194304),
  created_at bigint not null,
  updated_at bigint not null,
  editable integer not null default 1,
  version uuid not null,
  font_path text not null,
  project_path text not null
);
create index if not exists handpress_fonts_owner on public.handpress_fonts(owner_id, updated_at desc, id);
create index if not exists handpress_fonts_public on public.handpress_fonts(visibility, updated_at desc, id);
create table if not exists public.handpress_uploads (
  id uuid primary key,
  font_id uuid not null,
  owner_id text not null,
  expected_version uuid,
  state text not null default 'pending' check (state in ('pending', 'processing', 'complete', 'failed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '130 minutes',
  cleaned boolean not null default false,
  previous_font_path text,
  previous_project_path text
);
create index if not exists handpress_uploads_owner on public.handpress_uploads(owner_id, created_at desc);
alter table public.handpress_fonts enable row level security;
alter table public.handpress_uploads enable row level security;
revoke all on public.handpress_fonts, public.handpress_uploads from public, anon, authenticated;
grant all on public.handpress_fonts, public.handpress_uploads to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('handpress', 'handpress', false, 12582912, array['application/octet-stream', 'application/json'])
on conflict(id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
-- No Storage policies are granted to browser roles. Upload URLs grant access only to a staging object.

create or replace function public.handpress_public_page(p_query text, p_limit integer, p_offset integer)
returns jsonb language sql stable set search_path = '' as $$
  with matches as (
    select id, owner_name, name, designer, visibility, glyph_count, size, created_at, updated_at, editable
    from public.handpress_fonts
    where visibility = 'public' and strpos(lower(name || ' ' || designer || ' ' || owner_name), lower(p_query)) > 0
  ), page as (select * from matches order by updated_at desc, id limit greatest(1, least(p_limit, 48)) offset greatest(0, p_offset))
  select jsonb_build_object('fonts', coalesce((select jsonb_agg(to_jsonb(page) order by updated_at desc, id) from page), '[]'::jsonb),
    'total', (select count(*) from matches));
$$;

create or replace function public.handpress_reserve_upload(p_owner text, p_font_id uuid, p_upload_id uuid)
returns public.handpress_uploads language plpgsql set search_path = '' as $$
declare old public.handpress_fonts; result public.handpress_uploads;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner, 0));
  if (select count(*) from public.handpress_uploads where owner_id = p_owner and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'UPLOAD_RATE_LIMIT';
  end if;
  if (select count(*) from public.handpress_uploads where owner_id = p_owner and state in ('pending', 'processing') and created_at > now() - interval '15 minutes') >= 3 then
    raise exception 'UPLOAD_PENDING_LIMIT';
  end if;
  if p_font_id is not null then
    select * into old from public.handpress_fonts where id = p_font_id and owner_id = p_owner;
    if not found then raise exception 'FONT_NOT_FOUND'; end if;
  else
    if (select count(*) from public.handpress_fonts where owner_id = p_owner) >= 50 then raise exception 'FONT_LIMIT'; end if;
  end if;
  insert into public.handpress_uploads(id, font_id, owner_id, expected_version, previous_font_path, previous_project_path)
  values (p_upload_id, coalesce(p_font_id, p_upload_id), p_owner, old.version, old.font_path, old.project_path) returning * into result;
  return result;
end;
$$;

-- Font bytes and drawings have already been validated into immutable, server-only objects.
-- The lock enforces the account quota across all Vercel function instances.
create or replace function public.handpress_commit_upload(p_upload_id uuid, p_owner text, p_metadata jsonb)
returns boolean language plpgsql set search_path = '' as $$
declare upload public.handpress_uploads; old public.handpress_fonts;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner, 0));
  select * into upload from public.handpress_uploads where id = p_upload_id and owner_id = p_owner for update;
  if not found or upload.state <> 'processing' or upload.created_at < now() - interval '15 minutes' then return false; end if;
  select * into old from public.handpress_fonts where id = upload.font_id for update;
  if upload.expected_version is null then
    if old.id is not null or (select count(*) from public.handpress_fonts where owner_id = p_owner) >= 50 then return false; end if;
  elsif old.id is null or old.owner_id <> p_owner or old.version <> upload.expected_version then
    return false;
  end if;
  insert into public.handpress_fonts(id, owner_id, owner_name, name, designer, visibility, glyph_count, size, created_at, updated_at, version, font_path, project_path)
  values (upload.font_id, p_owner, p_metadata->>'owner_name', p_metadata->>'name', p_metadata->>'designer', p_metadata->>'visibility',
    (p_metadata->>'glyph_count')::integer, (p_metadata->>'size')::integer, coalesce(old.created_at, (p_metadata->>'updated_at')::bigint),
    (p_metadata->>'updated_at')::bigint, upload.id, 'saved/' || upload.id || '/font', 'saved/' || upload.id || '/project')
  on conflict(id) do update set owner_name = excluded.owner_name, name = excluded.name, designer = excluded.designer,
    visibility = excluded.visibility, glyph_count = excluded.glyph_count, size = excluded.size, updated_at = excluded.updated_at,
    version = excluded.version, font_path = excluded.font_path, project_path = excluded.project_path;
  update public.handpress_uploads set state = 'complete' where id = upload.id;
  return true;
end;
$$;
revoke all on function public.handpress_public_page(text, integer, integer), public.handpress_reserve_upload(text, uuid, uuid), public.handpress_commit_upload(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.handpress_public_page(text, integer, integer), public.handpress_reserve_upload(text, uuid, uuid), public.handpress_commit_upload(uuid, text, jsonb) to service_role;
commit;
