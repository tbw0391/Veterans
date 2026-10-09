(function () {
  const { sb, C, signedUrls, storyCard, emptyState } = window.Stories;
  const $ = id => document.getElementById(id);

  // Interview prompts to help people get started
  const PROMPTS = [
    "Where were you when you decided to join, and why?",
    "What do you remember about your first day of basic or boot camp?",
    "Tell us about someone you served with who you still think about.",
    "What was the funniest thing that happened on deployment?",
    "What did a normal day look like in your job?",
    "What was it like coming home?",
    "What do you want people to understand about your service?"
  ];
  let pi = 0;
  $("nextPrompt").onclick = () => { pi = (pi + 1) % PROMPTS.length; $("promptText").textContent = PROMPTS[pi]; };

  const DEFAULT_INFO = $("fileInfo").textContent;
  const mb = b => b >= 1073741824 ? (b / 1073741824).toFixed(1) + " GB" : (b / 1048576).toFixed(1) + " MB";
  const LIMIT = C.maxMinutes + " minutes";
  let chosen = null, previewUrl = null, tooLong = false;

  function showMsg(text, kind) {
    const m = $("formMsg");
    m.textContent = text || "";
    m.className = "msg " + (kind || "");
    m.hidden = !text;
  }

  function takeFile(f) {
    if (!f) return;
    chosen = f; tooLong = false;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(f);
    const v = $("preview"); v.src = previewUrl; v.hidden = false;
    const big = f.size > C.maxBytes;
    const info = $("fileInfo");
    const label = (f.name || "Recording") + " · " + mb(f.size);
    info.textContent = label +
      (big ? " · Too big. Keep it under " + LIMIT + ", or record your story in two parts." : " · Ready");
    info.classList.toggle("bad", big);
    showMsg("");
    // Check the length once the phone has read the video.
    v.onloadedmetadata = () => {
      if (chosen !== f || !isFinite(v.duration)) return;
      const mins = Math.round(v.duration / 60);
      tooLong = v.duration > C.maxMinutes * 60 + 30;
      if (big) return;
      info.textContent = label + " · " + (mins ? mins + " min" : Math.round(v.duration) + " sec") +
        (tooLong ? " · Too long. Keep it under " + LIMIT + ", or record your story in two parts." : " · Ready");
      info.classList.toggle("bad", tooLong);
    };
  }
  $("camInput").onchange = e => takeFile(e.target.files[0]);
  $("pickInput").onchange = e => takeFile(e.target.files[0]);

  // Work out the storage content type and file extension
  function fileKind(f) {
    const t = (f.type || "").toLowerCase(), n = (f.name || "").toLowerCase();
    const ext = (n.match(/\.([a-z0-9]+)$/) || [])[1];
    if (t === "video/webm" || ext === "webm") return { type: "video/webm", ext: "webm" };
    if (t === "video/quicktime" || ext === "mov") return { type: "video/quicktime", ext: "mov" };
    if (t === "video/3gpp" || ext === "3gp") return { type: "video/3gpp", ext: "3gp" };
    if (t.startsWith("audio/") || ext === "m4a") return { type: "audio/mp4", ext: "m4a" };
    if (t === "video/mp4" || ext === "mp4" || ext === "m4v") return { type: "video/mp4", ext: "mp4" };
    return null;
  }

  // Resumable upload in 6 MB pieces, so a dropped signal picks up where it
  // left off instead of starting a multi-GB file over.
  const storageHost = C.supabaseUrl.replace(".supabase.co", ".storage.supabase.co");
  function uploadFile(path, file, type, onProgress) {
    return new Promise((resolve, reject) => {
      const up = new tus.Upload(file, {
        endpoint: storageHost + "/storage/v1/upload/resumable",
        retryDelays: [0, 2000, 5000, 10000, 20000, 30000, 60000],
        headers: { authorization: "Bearer " + C.supabaseAnonKey, apikey: C.supabaseAnonKey, "x-upsert": "false" },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        chunkSize: 6 * 1024 * 1024,
        metadata: { bucketName: C.bucket, objectName: path, contentType: type, cacheControl: "3600" },
        onProgress: (sent, total) => onProgress(Math.round(sent / total * 100)),
        onSuccess: () => resolve(),
        onError: err => reject(err)
      });
      up.start();
    });
  }

  // Keep the screen on during a long upload; a locked phone can stop it.
  async function stayAwake() {
    try { return await navigator.wakeLock.request("screen"); } catch { return null; }
  }

  $("form").addEventListener("submit", async e => {
    e.preventDefault();
    if (!chosen) return showMsg("Record or choose a video first (step 1).", "err");
    if (chosen.size > C.maxBytes || tooLong) return showMsg("That video is longer than " + LIMIT + ". Trim it, or record your story in two parts.", "err");
    const title = $("title").value.trim(), name = $("name").value.trim();
    if (!title || !name) return showMsg("Add a story title and the name to show.", "err");
    if (!$("consent").checked) return showMsg("Check the consent box so we can share your story.", "err");
    const kind = fileKind(chosen);
    if (!kind) return showMsg("That file type isn't supported. Use a video from your phone's camera (MP4 or MOV).", "err");

    const btn = $("submitBtn"), bar = $("progress");
    btn.disabled = true; btn.textContent = "Uploading…";
    bar.hidden = false; bar.value = 0;
    showMsg("Sending " + mb(chosen.size) + ". Keep this page open and your phone unlocked until it finishes. If the signal drops, it picks up where it left off.");
    const path = `submissions/${crypto.randomUUID()}.${kind.ext}`;
    const lock = await stayAwake();
    try {
      await uploadFile(path, chosen, kind.type, p => { bar.value = p; });
      btn.textContent = "Saving…";
      const { error } = await sb.from("stories").insert({
        title, display_name: name,
        branch: $("branch").value || null,
        era: $("era").value || null,
        years_served: $("years").value.trim() || null,
        summary: $("summary").value.trim() || null,
        contact_email: $("email").value.trim() || null,
        video_path: path, video_type: kind.type, consent: true
      });
      if (error) throw error;
      $("form").reset(); chosen = null;
      $("preview").hidden = true; $("preview").removeAttribute("src");
      $("fileInfo").textContent = DEFAULT_INFO; $("fileInfo").classList.remove("bad");
      showMsg("Story received. It goes up on the wall once it's reviewed. Thank you for your service.", "ok");
    } catch (err) {
      console.error(err);
      const s = String(err && err.message || "");
      showMsg(s.includes("413") || /too large|exceeded the maximum/i.test(s)
        ? "That file is too big to send. Keep it under " + LIMIT + "."
        : /network|failed to fetch|response code: 0/i.test(s)
          ? "The upload stopped. Check your signal or Wi-Fi and tap Submit again. It picks up where it left off."
          : "Something went wrong saving your story. Please try again.", "err");
    } finally {
      if (lock) lock.release().catch(() => {});
      btn.disabled = false; btn.textContent = "Submit story"; bar.hidden = true;
    }
  });

  // The wall: approved stories, newest first
  async function loadWall() {
    const wall = $("wall");
    const { data, error } = await sb.from("stories")
      .select("id,title,display_name,branch,era,years_served,summary,video_path,status,created_at")
      .eq("status", "approved").order("approved_at", { ascending: false, nullsFirst: false }).limit(60);
    wall.replaceChildren();
    if (error) { wall.append(emptyState("Couldn't load stories", "Refresh the page to try again.")); return; }
    if (!data.length) { wall.append(emptyState("No stories posted yet", "Record the first one above. It shows here once it's been reviewed.")); return; }
    const urls = await signedUrls(data.map(s => s.video_path));
    data.forEach(s => wall.append(storyCard(s, urls[s.video_path]).card));
  }
  loadWall();
})();
