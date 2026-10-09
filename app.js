(function () {
  const { sb, C, el, BRANCHES, ERAS, signedUrls, veteranCard, emptyState, VETERAN_COLS, sortVideos } = window.Stories;
  const $ = id => document.getElementById(id);
  const mb = b => b >= 1073741824 ? (b / 1073741824).toFixed(1) + " GB" : (b / 1048576).toFixed(1) + " MB";
  const LIMIT = C.maxMinutes + " minutes";
  document.querySelectorAll(".maxmin").forEach(n => n.textContent = LIMIT);

  function showMsg(text, kind) {
    const m = $("formMsg");
    m.textContent = text || "";
    m.className = "msg " + (kind || "");
    m.hidden = !text;
  }

  // ---- Step 1: branch, component, eras as tap-to-pick buttons ----
  function choice(group, type, value, color, on) {
    const l = el("label", "choice");
    const i = el("input"); i.type = type; i.name = group; i.value = value;
    if (color) { l.style.setProperty("--c", color); l.style.setProperty("--on-c", on || "#fff"); }
    l.append(i, el("span", null, value));
    return l;
  }
  Object.entries(BRANCHES).forEach(([b, k]) => $("branchChoices").append(choice("branch", "radio", b, k.color, k.on)));
  ["Active", "National Guard", "Reserve"].forEach(c => $("componentChoices").append(choice("component", "radio", c)));
  Object.entries(ERAS).forEach(([e, c]) => $("eraChoices").append(choice("era", "checkbox", e, c)));
  const picked = name => [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(i => i.value);

  // ---- Video pickers (intro + each story) ----
  const PROMPTS = [
    "Where were you when you decided to join, and why?",
    "What do you remember about your first day of basic or boot camp?",
    "Tell us about someone you served with who you still think about.",
    "What was the funniest thing that happened on deployment?",
    "What did a normal day look like in your job?",
    "What was it like coming home?",
    "What do you want people to understand about your service?"
  ];

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

  // Record/choose buttons, preview and size/length check. Returns its state.
  function videoPicker(host) {
    const st = { file: null, tooLong: false, url: null };
    const btns = el("div", "btns");
    const cam = el("label", "filebtn primary", "Open camera");
    const camIn = el("input"); camIn.type = "file"; camIn.accept = "video/*"; camIn.setAttribute("capture", "user");
    cam.append(camIn);
    const pick = el("label", "filebtn", "Choose from phone");
    const pickIn = el("input"); pickIn.type = "file"; pickIn.accept = "video/*,audio/mp4,audio/x-m4a,.m4a,.mov";
    pick.append(pickIn);
    btns.append(cam, pick);
    const info = el("div", "fileinfo", "Up to " + LIMIT + ". Long videos are big files, so Wi-Fi is best for sending.");
    const DEFAULT_INFO = info.textContent;
    const prev = el("video"); prev.controls = true; prev.playsInline = true; prev.hidden = true;
    host.append(btns, info, prev);

    function take(f) {
      if (!f) return;
      st.file = f; st.tooLong = false;
      if (st.url) URL.revokeObjectURL(st.url);
      st.url = URL.createObjectURL(f);
      prev.src = st.url; prev.hidden = false;
      const big = f.size > C.maxBytes;
      const label = (f.name || "Recording") + " · " + mb(f.size);
      info.textContent = label + (big ? " · Too big. Keep it under " + LIMIT + ", or split it into two stories." : " · Ready");
      info.classList.toggle("bad", big);
      prev.onloadedmetadata = () => {
        if (st.file !== f || !isFinite(prev.duration)) return;
        const mins = Math.round(prev.duration / 60);
        st.tooLong = prev.duration > C.maxMinutes * 60 + 30;
        if (big) return;
        info.textContent = label + " · " + (mins ? mins + " min" : Math.round(prev.duration) + " sec") +
          (st.tooLong ? " · Too long. Keep it under " + LIMIT + ", or split it into two stories." : " · Ready");
        info.classList.toggle("bad", st.tooLong);
      };
    }
    camIn.onchange = e => take(e.target.files[0]);
    pickIn.onchange = e => take(e.target.files[0]);
    st.reset = () => {
      st.file = null; st.tooLong = false; camIn.value = ""; pickIn.value = "";
      if (st.url) URL.revokeObjectURL(st.url);
      st.url = null; prev.hidden = true; prev.removeAttribute("src");
      info.textContent = DEFAULT_INFO; info.classList.remove("bad");
    };
    st.bad = () => st.file && (st.file.size > C.maxBytes || st.tooLong);
    return st;
  }

  const intro = videoPicker($("introPicker"));
  let stories = [];

  function addStory() {
    const n = stories.length;
    const box = el("div", "story-block");
    const head = el("div", "story-block-h");
    const num = el("strong");
    const rm = el("button", "small", "Remove");
    rm.type = "button";
    head.append(num, rm);
    let pi = n % PROMPTS.length;
    const prompt = el("div", "prompt");
    const ptext = el("span", null, PROMPTS[pi]);
    const pnext = el("button", "small", "Another question"); pnext.type = "button";
    pnext.onclick = () => { pi = (pi + 1) % PROMPTS.length; ptext.textContent = PROMPTS[pi]; };
    prompt.append(ptext, pnext);
    const tl = el("label", null, "Story title");
    const title = el("input"); title.type = "text"; title.maxLength = 120; title.placeholder = "The night the generator quit at the FOB";
    tl.append(title);
    const pickerHost = el("div", "step");
    const sl = el("label", null, "One-line summary ");
    sl.append(el("small", null, "(optional)"));
    const summary = el("textarea"); summary.maxLength = 400; summary.placeholder = "What the story is about, in a sentence.";
    sl.append(summary);
    box.append(head, prompt, tl, pickerHost, sl);
    $("storyList").append(box);
    const item = { box, title, summary, picker: videoPicker(pickerHost) };
    rm.onclick = () => { item.picker.reset(); box.remove(); stories = stories.filter(s => s !== item); renumber(); };
    stories.push(item);
    renumber();
  }
  function renumber() {
    stories.forEach((s, i) => {
      s.box.querySelector(".story-block-h strong").textContent = "Story " + (i + 1);
      s.box.querySelector(".story-block-h button").hidden = stories.length === 1;
    });
  }
  $("addStory").onclick = () => { addStory(); stories[stories.length - 1].title.focus(); };
  addStory();

  // ---- Bio photo: shrink to 1600px JPEG on the phone, which also drops location data ----
  let photo = null, photoUrl = null;
  const PHOTO_INFO = $("photoInfo").textContent;
  async function shrinkPhoto(f) {
    const img = await createImageBitmap(f, { imageOrientation: "from-image" });
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return new Promise((ok, bad) => c.toBlob(b => b ? ok(b) : bad(new Error("photo")), "image/jpeg", 0.85));
  }
  function clearPhoto() {
    photo = null; $("photoInput").value = "";
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    $("photoPreview").hidden = true; $("photoClear").hidden = true;
    $("photoBtn").firstChild.textContent = "Add a photo";
    $("photoInfo").textContent = PHOTO_INFO; $("photoInfo").classList.remove("bad");
  }
  $("photoInput").onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    try { photo = await shrinkPhoto(f); }
    catch { clearPhoto(); $("photoInfo").textContent = "That photo couldn't be opened. Try a JPEG or PNG."; $("photoInfo").classList.add("bad"); return; }
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = URL.createObjectURL(photo);
    $("photoPreview").src = photoUrl; $("photoPreview").hidden = false;
    $("photoClear").hidden = false; $("photoBtn").firstChild.textContent = "Change photo";
    $("photoInfo").textContent = "Photo ready";
  };
  $("photoClear").onclick = clearPhoto;

  // ---- Sending ----
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

  // What's already been sent, so tapping Send again after a failure carries on.
  let sent = null;

  $("form").addEventListener("submit", async e => {
    e.preventDefault();
    const branch = picked("branch")[0], name = $("name").value.trim();
    if (!branch) return showMsg("Pick the branch you served in (step 1).", "err");
    if (!name) return showMsg("Add the name to show (step 1).", "err");

    const queue = [];
    if (intro.file) queue.push({ kind: "intro", picker: intro, title: null, summary: null });
    for (const [i, s] of stories.entries()) {
      const title = s.title.value.trim();
      if (!s.picker.file && !title) continue;
      if (!s.picker.file) return showMsg("Story " + (i + 1) + " has a title but no video yet.", "err");
      if (!title) return showMsg("Give story " + (i + 1) + " a title.", "err");
      queue.push({ kind: "story", picker: s.picker, title, summary: s.summary.value.trim() || null, position: i });
    }
    if (!queue.length) return showMsg("Record an intro or at least one story first.", "err");
    for (const q of queue) {
      if (q.picker.bad()) return showMsg((q.title ? "\"" + q.title + "\"" : "Your intro") + " is longer than " + LIMIT + ". Trim it or split it into two stories.", "err");
      q.type = fileKind(q.picker.file);
      if (!q.type) return showMsg("One of the files isn't a video we can take. Use a video from your phone's camera (MP4 or MOV).", "err");
    }
    if (!$("consent").checked) return showMsg("Check the consent box so we can share your profile.", "err");

    const btn = $("submitBtn"), bar = $("progress"), label = $("progressLabel");
    btn.disabled = true; btn.textContent = "Sending…";
    bar.hidden = false; label.hidden = false;
    const total = queue.reduce((n, q) => n + q.picker.file.size, 0);
    showMsg("Sending " + mb(total) + ". Keep this page open and your phone unlocked until it finishes. If the signal drops, it picks up where it left off.");
    const lock = await stayAwake();
    sent = sent || { id: crypto.randomUUID(), profile: false, files: new Map() };
    try {
      if (!sent.profile) {
        label.textContent = "Saving your profile…"; bar.value = 0;
        let photo_path = null;
        if (photo) {
          photo_path = `photos/${crypto.randomUUID()}.jpg`;
          const { error: pe } = await sb.storage.from(C.bucket).upload(photo_path, photo, { contentType: "image/jpeg", upsert: false });
          if (pe) throw pe;
        }
        const val = id => $(id).value.trim() || null;
        const { error } = await sb.from("veterans").insert({
          id: sent.id, display_name: name, branch,
          component: picked("component")[0] || null, eras: picked("era"),
          years_served: val("years"), contact_email: val("email"), consent: true,
          photo_path, rank: val("rank"), job: val("job"), unit: val("unit"),
          duty_stations: val("stations"), deployments: val("deployments"), awards: val("awards"),
          hometown: val("hometown"), after_service: val("after"), bio: val("bio")
        });
        if (error) throw error;
        sent.profile = true;
      }
      for (const [i, q] of queue.entries()) {
        if (sent.files.get(q.picker.file)) continue;
        const what = q.kind === "intro" ? "your intro" : "\"" + q.title + "\"";
        label.textContent = "Video " + (i + 1) + " of " + queue.length + ": " + what;
        bar.value = 0;
        const path = `submissions/${crypto.randomUUID()}.${q.type.ext}`;
        await uploadFile(path, q.picker.file, q.type.type, p => { bar.value = p; });
        const { error } = await sb.from("videos").insert({
          veteran_id: sent.id, kind: q.kind, position: q.position || 0,
          title: q.title, summary: q.summary, video_path: path, video_type: q.type.type
        });
        if (error) throw error;
        sent.files.set(q.picker.file, true);
      }
      fetch(C.supabaseUrl + "/functions/v1/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: C.supabaseAnonKey, Authorization: "Bearer " + C.supabaseAnonKey },
        body: JSON.stringify({ veteran_id: sent.id })
      }).catch(() => {});
      sent = null;
      $("form").reset(); intro.reset(); clearPhoto();
      stories.forEach(s => { s.picker.reset(); s.box.remove(); }); stories = []; addStory();
      showMsg("Profile received. It goes up on the wall once it's reviewed. Thank you for your service.", "ok");
    } catch (err) {
      console.error(err);
      const s = String(err && err.message || "");
      showMsg(s.includes("413") || /too large|exceeded the maximum/i.test(s)
        ? "A video is too big to send. Keep each one under " + LIMIT + "."
        : /network|failed to fetch|response code: 0/i.test(s)
          ? "Sending stopped. Check your signal or Wi-Fi and tap Send again. It picks up where it left off."
          : "Something went wrong sending your profile. Tap Send to try again.", "err");
    } finally {
      if (lock) lock.release().catch(() => {});
      btn.disabled = false; btn.textContent = "Send my profile";
      bar.hidden = true; label.hidden = true;
    }
  });

  // ---- The wall: approved profiles, newest first ----
  async function loadWall() {
    const wall = $("wall");
    const { data, error } = await sb.from("veterans").select(VETERAN_COLS)
      .eq("status", "approved").order("approved_at", { ascending: false, nullsFirst: false }).limit(60);
    wall.replaceChildren();
    if (error) { wall.append(emptyState("Couldn't load stories", "Refresh the page to try again.")); return; }
    if (!data.length) { wall.append(emptyState("No stories posted yet", "Record the first one above. It shows here once it's been reviewed.")); return; }
    data.forEach(sortVideos);
    const urls = await signedUrls(data.flatMap(v => [v.photo_path, (v.videos[0] || {}).video_path]));
    data.forEach(v => wall.append(veteranCard(v, urls).card));
  }
  loadWall();
})();
