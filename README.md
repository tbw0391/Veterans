# Stories of Service

A phone-friendly site where veterans record their story, add a few details, and submit it. Every story waits in a review queue until a reviewer approves it for the public wall.

## How it works

- **index.html**: record or pick a video, fill in name, branch, era and years, give consent, submit. Shows approved stories.
- **bio.html**: each story's own page with the veteran's photo, service details, life after service and an "about me". Filled in as step 3 of the submit form.
- **admin.html**: reviewers sign in with a code texted to their phone (or an emailed link), then approve, hide or delete stories.
- **Supabase** (project "Vetrans") stores the `stories` table and the private `story-videos` bucket (8 GB per file, about 30 minutes of video). Uploads are resumable, so a dropped signal picks up where it left off.
- Plain static files, no build step. Hosted on Vercel.

## Security rules (enforced in the database)

- Submissions only go through the `submit-story` Edge Function (`supabase/functions/submit-story`). It checks a Cloudflare Turnstile CAPTCHA, limits each IP to 5 submissions an hour, and hands out one-time upload tokens for the video and photo. The public cannot write to the table or the bucket directly.
- New stories start as `uploading`, then become `pending` once the video arrives.
- The public can only read `approved` stories and their videos. Contact emails are never public.
- Only phones or emails listed in the `admins` table can review. Add a reviewer in the Supabase SQL editor (phone is digits only, with the country code):

```sql
insert into public.admins (phone) values ('15551234567');
insert into public.admins (email) values ('someone@example.com');
```

- A "Before User Created" auth hook (`private.only_reviewers_sign_up`) refuses anyone not on that list, so strangers can't trigger texts.

## One-time setup in Supabase

Authentication → URL Configuration:
- **Site URL**: the live site address
- **Redirect URLs**: add `https://<your-site>/admin`

Authentication → Sign In / Providers → **Phone**: turn on, choose Twilio, and enter the Account SID, Auth Token and Messaging Service SID.

Authentication → Hooks → **Before User Created**: choose Postgres, function `private.only_reviewers_sign_up`.

Storage → Settings → **Upload file size limit**: at least 8 GB (the project-wide cap; the bucket limit cannot exceed it).

Database changes live in `supabase/migrations/`.

## CAPTCHA keys (Cloudflare Turnstile)

The site ships with Cloudflare's test keys, which always pass. To turn on real protection:

1. In the Cloudflare dashboard, open **Turnstile** and add a widget for the site's domain.
2. Put the **site key** in `config.js` (`turnstileSiteKey`).
3. Set the **secret key** as the Edge Function secret `TURNSTILE_SECRET` in Supabase (Edge Functions → Secrets).
