-- A short bio for each veteran, sent with their story.
alter table public.stories
  add column photo_path text unique check (photo_path ~ '^photos/[0-9a-f-]{36}\.jpg$'),
  add column rank text check (char_length(rank) <= 60),
  add column unit text check (char_length(unit) <= 200),
  add column job text check (char_length(job) <= 120),
  add column duty_stations text check (char_length(duty_stations) <= 500),
  add column deployments text check (char_length(deployments) <= 500),
  add column awards text check (char_length(awards) <= 500),
  add column hometown text check (char_length(hometown) <= 120),
  add column after_service text check (char_length(after_service) <= 1000),
  add column bio text check (char_length(bio) <= 4000);

grant insert (photo_path, rank, unit, job, duty_stations, deployments, awards, hometown, after_service, bio)
  on public.stories to anon, authenticated;
grant select (photo_path, rank, unit, job, duty_stations, deployments, awards, hometown, after_service, bio)
  on public.stories to anon, authenticated;

-- Photos go in the same private bucket under photos/, resized to JPEG on the phone.
update storage.buckets
  set allowed_mime_types = array_append(allowed_mime_types, 'image/jpeg')
  where id = 'story-videos' and not ('image/jpeg' = any(allowed_mime_types));

drop policy "Anyone can upload a submission video" on storage.objects;
create policy "Anyone can upload a submission video or photo" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'story-videos' and (
    name ~ '^submissions/[0-9a-f-]{36}\.(mp4|mov|webm|m4a|m4v|3gp)$'
    or name ~ '^photos/[0-9a-f-]{36}\.jpg$'));

drop policy "Approved videos are viewable; admins see all" on storage.objects;
create policy "Approved videos and photos are viewable; admins see all" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'story-videos' and (
    (select private.is_admin())
    or exists (select 1 from public.stories s
               where (s.video_path = objects.name or s.photo_path = objects.name)
                 and s.status = 'approved')));
