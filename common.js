// Shared helpers for the public page, profile page and reviewer page.
(function () {
  const C = window.STORIES_CONFIG;
  const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey);

  // Branch colors from each service's official colors; `on` is the text color on top.
  const BRANCHES = {
    "Army":         { color: "#C9A227", on: "#111111" },
    "Marine Corps": { color: "#B22234", on: "#FFFFFF" },
    "Navy":         { color: "#1F3A6E", on: "#FFFFFF" },
    "Air Force":    { color: "#2E6DB4", on: "#FFFFFF" },
    "Coast Guard":  { color: "#E35205", on: "#FFFFFF" },
    "Space Force":  { color: "#5B6770", on: "#FFFFFF" }
  };
  // Era colors from each era's service-medal ribbon.
  const ERAS = {
    "WWII":                    "#6B6B3A",
    "Korea":                   "#4A90C8",
    "Vietnam":                 "#E8B400",
    "Cold War":                "#6D7B8D",
    "Gulf War":                "#C2A26B",
    "Global War on Terrorism": "#9E1B32",
    "Afghanistan (OEF)":       "#3E7C3A",
    "Iraq (OIF)":              "#A23B2A",
    "Peacetime / Other":       "#8A8F86"
  };

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  // Paint an element in a veteran's branch color (used by CSS as --branch / --on-branch).
  function paintBranch(node, branch) {
    const b = BRANCHES[branch];
    if (!b) return;
    node.style.setProperty("--branch", b.color);
    node.style.setProperty("--on-branch", b.on);
  }

  // A row of era ribbons; labeled chips when `labeled`.
  function ribbons(eras, labeled) {
    const row = el("div", labeled ? "ribbons labeled" : "ribbons");
    (eras || []).filter(e => ERAS[e]).forEach(e => {
      const r = el("span", "ribbon", labeled ? e : null);
      r.style.setProperty("--c", ERAS[e]);
      r.title = e;
      row.append(r);
    });
    return row;
  }

  // "Staff Sergeant · Army National Guard · 2004–2012"
  function serviceLine(v) {
    const branch = v.branch && v.component && v.component !== "Active" ? v.branch + " " + v.component : v.branch;
    return [v.rank, branch, v.years_served].filter(Boolean);
  }

  // Signed links for a batch of file paths (private bucket).
  async function signedUrls(paths) {
    paths = paths.filter(Boolean);
    if (!paths.length) return {};
    const { data, error } = await sb.storage.from(C.bucket).createSignedUrls(paths, 60 * 60 * 6);
    if (error || !data) return {};
    const out = {};
    data.forEach(d => { if (d.signedUrl) out[d.path] = d.signedUrl; });
    return out;
  }

  function videoEl(url, captionsUrl) {
    const v = el("video");
    v.controls = true; v.playsInline = true; v.preload = "metadata";
    if (captionsUrl) {
      v.crossOrigin = "anonymous";
      const t = el("track"); t.kind = "captions"; t.label = "English"; t.srclang = "en"; t.src = captionsUrl;
      v.append(t);
    }
    v.src = url;
    return v;
  }

  // Wall / review card for one veteran: branch stripe, photo, name, ribbons, intro video.
  function veteranCard(v, urls) {
    const card = el("article", "story");
    paintBranch(card, v.branch);
    const vids = v.videos || [];
    const intro = vids.find(x => x.kind === "intro");
    const stories = vids.filter(x => x.kind === "story");
    const lead = intro || stories[0];
    if (lead && urls[lead.video_path]) card.append(videoEl(urls[lead.video_path]));

    const meta = el("div", "meta");
    if (v.status && v.status !== "approved") meta.append(el("span", "pill", v.status === "pending" ? "Waiting for review" : "Hidden"));
    const who = el("div", "who");
    if (urls[v.photo_path]) { const img = el("img"); img.src = urls[v.photo_path]; img.alt = ""; who.append(img); }
    const name = el("div");
    name.append(el("h3", null, v.display_name || "A veteran"));
    const tag = el("div", "dogtag");
    serviceLine(v).forEach(t => tag.append(el("span", null, t)));
    name.append(tag);
    who.append(name);
    meta.append(who, ribbons(v.eras));
    if (stories.length) meta.append(el("p", null, stories.length === 1 ? "1 story: " + stories[0].title : stories.length + " stories: " + stories.map(s => s.title).join(" · ")));
    if (v.id) {
      const a = el("a", "more", "Open " + (v.display_name ? v.display_name + "'s" : "the") + " profile");
      a.href = "bio.html?id=" + encodeURIComponent(v.id);
      meta.append(a);
    }
    card.append(meta);
    return { card, meta };
  }

  function emptyState(title, body) {
    const e = el("div", "empty");
    e.append(el("strong", null, title), document.createTextNode(body));
    return e;
  }

  // Columns every page reads for a veteran and their videos.
  const VETERAN_COLS = "id,display_name,branch,component,eras,years_served,status,approved_at,created_at,photo_path,rank,unit,job,duty_stations,deployments,awards,hometown,after_service,bio," +
    "videos(id,kind,position,title,summary,video_path,transcript_status,transcript,captions_path)";

  function sortVideos(v) {
    (v.videos || []).sort((a, b) => (a.kind === "intro" ? -1 : 0) - (b.kind === "intro" ? -1 : 0) || a.position - b.position);
    return v;
  }

  // Donate section, on any page that has one, once a link is set in config.js.
  const donate = document.getElementById("donate");
  if (donate && C.donateUrl) { document.getElementById("donateBtn").href = C.donateUrl; donate.hidden = false; }

  window.Stories = { sb, C, el, BRANCHES, ERAS, paintBranch, ribbons, serviceLine, signedUrls, videoEl, veteranCard, emptyState, VETERAN_COLS, sortVideos };
})();
