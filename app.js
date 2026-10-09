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
  const mb = b => (b / 1048576).toFixed(1) + " MB";
  let chosen = null, previewUrl = null;

  function showMsg(text, kind) {
    const m = $("formMsg");
    m.textContent = text || "";
    m.className = "msg " + (kind || "");
    m.hidden = !text;
  }

  function takeFile(f) {
    if (!f) return;
    chosen = f;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(f);
    const v = $("preview"); v.src = previewUrl; v.hidden = false;
    const big = f.size > C.maxBytes;
    const info = $("fileInfo");
    info.textContent = (f.name || "Recording") + " · " + mb(f.size) +
      (big ? " · Too long. Keep it under 50 MB, or record your story in two parts." : " · Ready");
    info.classList.toggle("bad", big);
    showMsg("");
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

  // Upload with a progress bar (plain XHR so we can report progress)
  function uploadFile(path, file, type, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${C.supabaseUrl}/storage/v1/object/${C.bucket}/${path}`);
      xhr.setRequestHeader("apikey", C.supabaseAnonKey);
      xhr.setRequestHeader("Authorization", "Bearer " + C.supabaseAnonKey);
      xhr.setRequestHeader("Content-Type", type);
      xhr.setRequestHeader("x-upsert", "false");
      xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100)); };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(xhr.status + " " + xhr.responseText));
      xhr.onerror = () => reject(new Error("network"));
      xhr.send(file);
    });
  }

  $("form").addEventListener("submit", async e => {
    e.preventDefault();
    if (!chosen) return showMsg("Record or choose a video first (step 1).", "err");
    if (chosen.size > C.maxBytes) return showMsg("That clip is " + mb(chosen.size) + ". The limit is 50 MB. Trim it, or record your story in two parts.", "err");
    const title = $("title").value.trim(), name = $("name").value.trim();
    if (!title || !name) return showMsg("Add a story title and the name to show.", "err");
    if (!$("consent").checked) return showMsg("Check the consent box so we can share your story.", "err");
    const kind = fileKind(chosen);
    if (!kind) return showMsg("That file type isn't supported. Use a video from your phone's camera (MP4 or MOV).", "err");

    const btn = $("submitBtn"), bar = $("progress");
    btn.disabled = true; btn.textContent = "Uploading…";
    bar.hidden = false; bar.value = 0;
    showMsg("Uploading " + mb(chosen.size) + ". Keep this page open until it finishes.");
    const path = `submissions/${crypto.randomUUID()}.${kind.ext}`;
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
      showMsg(s.includes("413") || s.includes("too large")
        ? "That file is over the 50 MB limit."
        : s === "network"
          ? "The upload didn't go through. Check your signal or Wi-Fi and try again."
          : "Something went wrong saving your story. Please try again.", "err");
    } finally {
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
