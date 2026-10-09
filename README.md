# Stories of Service

A phone-friendly site where veterans record their story, add a few details, and submit it. Every story waits in a review queue until a reviewer approves it for the public wall.

## How it works

- **index.html**: record or pick a video, fill in name, branch, era and years, give consent, submit. Shows approved stories.
- **admin.html**: reviewers sign in with an emailed link, then approve, hide or delete stories.
- **Supabase** (project "Vetrans") stores the `stories` table and the private `story-videos` bucket (50 MB per file).
- Plain static files, no build step. Hosted on Vercel.

## Security rules (enforced in the database)

- Anyone can submit; new stories are always `pending`.
- The public can only read `approved` stories and their videos. Contact emails are never public.
- Only emails listed in the `admins` table can review. Add a reviewer in the Supabase SQL editor:

```sql
insert into public.admins (email) values ('someone@example.com');
```

## One-time setup in Supabase

Authentication → URL Configuration:
- **Site URL**: the live site address
- **Redirect URLs**: add `https://<your-site>/admin`
