// submit-story: the only way to add a story.
// 1. action "start": checks the CAPTCHA, validates the details, creates the story
//    row in "uploading" state and returns a one-time signed upload link.
// 2. action "finish": confirms the video arrived, then moves the story to "pending"
//    so it shows up in the review queue.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const BUCKET = "story-videos";
const MAX_BYTES = 8 * 1024 * 1024 * 1024; // matches the bucket limit (about 30 minutes of video)
const MAX_STARTS_PER_HOUR = 5;
// Cloudflare's published test secret (always passes). Replace by setting TURNSTILE_SECRET.
const TEST_SECRET = "1x0000000000000000000000000000000AA";

const TYPES: Record<string, string> = {
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
  "video/3gpp": "3gp", "audio/mp4": "m4a",
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (status: number, code: string, message: string) => json({ error: { code, message } }, status);

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

function text(v: unknown, max: number, required = false): string | null {
  if (v == null || v === "") { if (required) throw new Error("missing"); return null; }
  if (typeof v !== "string") throw new Error("bad");
  const s = v.trim();
  if (!s) { if (required) throw new Error("missing"); return null; }
  if (s.length > max) throw new Error("too long");
  return s;
}

async function checkCaptcha(token: string, ip: string | null): Promise<boolean> {
  const secret = Deno.env.get("TURNSTILE_SECRET") || TEST_SECRET;
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const out = await r.json();
    return out.success === true;
  } catch {
    return false;
  }
}

async function start(body: Record<string, unknown>, ip: string | null) {
  if (typeof body.captchaToken !== "string" || !body.captchaToken) {
    return fail(400, "captcha_missing", "Please complete the check box before submitting.");
  }
  if (!(await checkCaptcha(body.captchaToken, ip))) {
    return fail(403, "captcha_failed", "The human check didn't pass. Please try it again.");
  }

  // Basic per-IP rate limit
  if (ip) {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin.from("stories").select("id", { count: "exact", head: true })
      .eq("submitter_ip", ip).gte("created_at", since);
    if ((count ?? 0) >= MAX_STARTS_PER_HOUR) {
      return fail(429, "too_many", "You've sent several stories in the last hour. Please wait a bit and try again.");
    }
  }

  let row;
  try {
    const type = typeof body.videoType === "string" ? body.videoType : "";
    const ext = TYPES[type];
    if (!ext) return fail(400, "bad_type", "That file type isn't supported. Use an MP4 or MOV video.");
    const size = Number(body.videoSize);
    if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) {
      return fail(400, "too_large", "That video is too big. Keep it under 30 minutes.");
    }
    const hasPhoto = body.hasPhoto === true;
    if (body.consent !== true) return fail(400, "no_consent", "Consent is required.");
    row = {
      title: text(body.title, 120, true),
      display_name: text(body.displayName, 80, true),
      branch: text(body.branch, 40),
      era: text(body.era, 40),
      years_served: text(body.yearsServed, 30),
      summary: text(body.summary, 400),
      contact_email: text(body.contactEmail, 200),
      rank: text(body.rank, 60),
      job: text(body.job, 120),
      unit: text(body.unit, 200),
      duty_stations: text(body.dutyStations, 500),
      deployments: text(body.deployments, 500),
      awards: text(body.awards, 500),
      hometown: text(body.hometown, 120),
      after_service: text(body.afterService, 1000),
      bio: text(body.bio, 4000),
      photo_path: hasPhoto ? `photos/${crypto.randomUUID()}.jpg` : null,
      video_path: `submissions/${crypto.randomUUID()}.${ext}`,
      video_type: type,
      consent: true,
      status: "uploading",
      upload_key: crypto.randomUUID(),
      submitter_ip: ip,
    };
  } catch {
    return fail(400, "bad_details", "Check the story title and name, then try again.");
  }

  // One-time upload tokens. The video token goes in the resumable upload's
  // x-signature header; the photo token is used with uploadToSignedUrl.
  const { data: vid, error: vErr } = await admin.storage.from(BUCKET).createSignedUploadUrl(row.video_path);
  if (vErr || !vid) return fail(500, "upload_link", "Couldn't prepare the upload. Please try again.");
  let pic: { token: string } | null = null;
  if (row.photo_path) {
    const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(row.photo_path);
    if (error || !data) return fail(500, "upload_link", "Couldn't prepare the photo upload. Please try again.");
    pic = data;
  }

  const { data: ins, error: insErr } = await admin.from("stories").insert(row).select("id").single();
  if (insErr || !ins) return fail(500, "save_failed", "Couldn't save your story. Please try again.");

  return json({
    storyId: ins.id, uploadKey: row.upload_key,
    videoPath: row.video_path, videoToken: vid.token,
    photoPath: row.photo_path, photoToken: pic ? pic.token : null,
  });
}

async function finish(body: Record<string, unknown>) {
  const id = typeof body.storyId === "string" ? body.storyId : "";
  const key = typeof body.uploadKey === "string" ? body.uploadKey : "";
  if (!id || !key) return fail(400, "bad_request", "Missing story id.");

  const { data: s } = await admin.from("stories").select("id,status,upload_key,video_path,photo_path").eq("id", id).maybeSingle();
  if (!s || s.status !== "uploading" || s.upload_key !== key) return fail(404, "not_found", "That upload wasn't found.");

  const exists = async (path: string) => {
    const [folder, name] = path.split("/");
    const { data } = await admin.storage.from(BUCKET).list(folder, { search: name, limit: 1 });
    return !!data && data.some((f) => f.name === name);
  };
  if (!(await exists(s.video_path))) {
    return fail(409, "video_missing", "The video didn't finish uploading. Please try again.");
  }
  const patch: Record<string, unknown> = { status: "pending", upload_key: null };
  // A photo that never arrived is dropped rather than blocking the story.
  if (s.photo_path && !(await exists(s.photo_path))) patch.photo_path = null;

  const { error } = await admin.from("stories").update(patch).eq("id", id);
  if (error) return fail(500, "save_failed", "Couldn't finish saving. Please try again.");
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail(405, "method", "Use POST.");
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail(400, "bad_json", "Bad request."); }
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
  try {
    if (body.action === "start") return await start(body, ip);
    if (body.action === "finish") return await finish(body);
    return fail(400, "bad_action", "Unknown action.");
  } catch (e) {
    console.error(e);
    return fail(500, "server", "Something went wrong. Please try again.");
  }
});
