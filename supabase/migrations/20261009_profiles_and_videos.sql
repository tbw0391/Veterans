-- One profile per veteran (the old stories table), holding an intro video
-- and any number of separate story videos. Review happens per profile.
-- This file rule reads the old video_path column, so it goes first; it's rebuilt at the end.
drop policy "Approved videos and photos are viewable; admins see all" on storage.objects;
alter table public.stories rename to veterans;
alter table public.veterans
  drop column title,
  drop column summary,
  drop column video_path,
  drop column video_type;
-- Branch is a fixed list (each gets a color); Guard/Reserve is its own question.
-- A veteran can tick several eras, shown as a row of ribbon colors.
alter table public.veterans drop column era;
alter table public.veterans
  add constraint veterans_branch_list check (branch in ('Army', 'Marine Corps', 'Navy', 'Air Force', 'Coast Guard', 'Space Force')),
  add column component text check (component in ('Active', 'National Guard', 'Reserve')),
  add column eras text[] not null default '{}' check (
    cardinality(eras) <= 9 and eras <@ array['WWII', 'Korea', 'Vietnam', 'Cold War', 'Gulf War',
      'Global War on Terrorism', 'Afghanistan (OEF)', 'Iraq (OIF)', 'Peacetime / Other']);
grant insert (component, eras) on public.veterans to anon, authenticated;
grant select (component, eras) on public.veterans to anon, authenticated;

-- The phone picks the id so it can attach videos without reading back a pending row.
grant insert (id) on public.veterans to anon, authenticated;

create or replace function public.admin_story_contacts()
returns table(id uuid, contact_email text)
language sql stable security definer set search_path = ''
as $$ select v.id, v.contact_email from public.veterans v where private.is_admin(); $$;

-- True while a profile is still waiting for review (new videos can only go there).
create or replace function private.veteran_is_pending(vid uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.veterans where id = vid and status = 'pending'); $$;
grant execute on function private.veteran_is_pending(uuid) to anon, authenticated;

create table public.videos (
  id uuid primary key default gen_random_uuid(),
  veteran_id uuid not null references public.veterans(id) on delete cascade,
  kind text not null check (kind in ('intro', 'story')),
  position int not null default 0 check (position between 0 and 100),
  title text check (char_length(title) between 1 and 120),
  summary text check (char_length(summary) <= 400),
  video_path text not null unique check (video_path ~ '^submissions/[0-9a-f-]{36}\.(mp4|mov|webm|m4a|m4v|3gp)$'),
  video_type text,
  created_at timestamptz not null default now(),
  -- Filled in by the transcribe function.
  transcript_status text check (transcript_status in ('processing', 'done', 'failed')),
  transcript_job text,
  transcript text,
  captions_path text check (captions_path ~ '^captions/[0-9a-f-]{36}\.vtt$'),
  check (kind = 'intro' or title is not null)
);
create unique index videos_one_intro on public.videos (veteran_id) where kind = 'intro';
create index videos_veteran on public.videos (veteran_id, kind, position);

alter table public.videos enable row level security;
revoke all on public.videos from anon, authenticated;
grant insert (veteran_id, kind, position, title, summary, video_path, video_type) on public.videos to anon, authenticated;
grant select (id, veteran_id, kind, position, title, summary, video_path, video_type, created_at,
              transcript_status, transcript, captions_path) on public.videos to anon, authenticated;
grant delete on public.videos to authenticated;

create policy "Anyone can add a video to a pending profile" on public.videos
  for insert to anon, authenticated
  with check (private.veteran_is_pending(veteran_id));
create policy "Public sees videos of approved profiles; admins see all" on public.videos
  for select to anon, authenticated
  using ((select private.is_admin())
         or exists (select 1 from public.veterans v where v.id = veteran_id and v.status = 'approved'));
create policy "Admins delete videos" on public.videos
  for delete to authenticated
  using ((select private.is_admin()));

-- Files: videos, photos and captions are public only once the profile is approved.
create policy "Approved profile files are viewable; admins see all" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'story-videos' and (
    (select private.is_admin())
    or exists (select 1 from public.videos d join public.veterans v on v.id = d.veteran_id
               where v.status = 'approved' and (d.video_path = objects.name or d.captions_path = objects.name))
    or exists (select 1 from public.veterans v where v.status = 'approved' and v.photo_path = objects.name)));
