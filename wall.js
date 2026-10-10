(function () {
  const { sb, el, BRANCHES, paintBranch, signedUrls, veteranCard, emptyState, VETERAN_COLS, sortVideos } = window.Stories;
  const $ = id => document.getElementById(id);

  // ---- The wall: approved profiles, newest first, with a button per branch ----
  let wallBranch = null;
  async function loadTabs() {
    const { data } = await sb.from("veterans").select("branch").eq("status", "approved");
    const n = {};
    (data || []).forEach(v => n[v.branch] = (n[v.branch] || 0) + 1);
    const tab = (label, b, count) => {
      const t = el("button", null, `${label} (${count})`);
      t.type = "button";
      t.disabled = !count && b !== null;
      t.setAttribute("aria-pressed", wallBranch === b);
      if (b) paintBranch(t, b);
      t.onclick = () => {
        wallBranch = b;
        $("wallTabs").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === t));
        loadWall();
      };
      return t;
    };
    $("wallTabs").replaceChildren(tab("All", null, (data || []).length),
      ...Object.keys(BRANCHES).map(b => tab(b, b, n[b] || 0)));
  }
  async function loadWall() {
    const wall = $("wall");
    let q = sb.from("veterans").select(VETERAN_COLS).eq("status", "approved");
    if (wallBranch) q = q.eq("branch", wallBranch);
    const { data, error } = await q.order("approved_at", { ascending: false, nullsFirst: false }).limit(60);
    wall.replaceChildren();
    if (error) { wall.append(emptyState("Couldn't load stories", "Refresh the page to try again.")); return; }
    if (!data.length) { wall.append(emptyState("No stories posted yet", "Stories show here once they've been reviewed.")); return; }
    data.forEach(sortVideos);
    const urls = await signedUrls(data.flatMap(v => [v.photo_path, (v.videos[0] || {}).video_path]));
    data.forEach(v => wall.append(veteranCard(v, urls).card));
  }
  loadTabs();
  loadWall();
})();
