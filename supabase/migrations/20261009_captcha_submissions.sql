-- Submissions go through the submit-story Edge Function, which checks a
-- Cloudflare Turnstile CAPTCHA and hands out one-time upload tokens.
-- The public can no longer write to the table or the bucket directly.
drop policy if exists "Anyone can submit a pending story" on public.stories;
drop policy if exists "Anyone can upload a submission video" on storage.objects;
drop policy if exists "Anyone can upload a submission video or photo" on storage.objects;
revoke insert on public.stories from anon, authenticated;

alter table public.stories drop constraint if exists stories_status_check;
alter table public.stories add constraint stories_status_check
  check (status in ('uploading','pending','approved','hidden'));
alter table public.stories add column if not exists upload_key text;
alter table public.stories add column if not exists submitter_ip text;
-- upload_key and submitter_ip have no column grants: never readable through the public API
