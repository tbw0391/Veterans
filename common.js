// Shared helpers for the public page and the reviewer page.
(function () {
  const C = window.STORIES_CONFIG;
  const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey);

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  // Signed links for a batch of video paths (private bucket).
  async function signedUrls(paths) {
    if (!paths.length) return {};
    const { data, error } = await sb.storage.from(C.bucket).createSignedUrls(paths, 60 * 60 * 6);
    if (error || !data) return {};
    const out = {};
    data.forEach(d => { if (d.signedUrl) out[d.path] = d.signedUrl; });
    return out;
  }

  function storyCard(s, url) {
    const card = el("article", "story");
    if (url) {
      const v = el("video");
      v.controls = true; v.playsInline = true; v.preload = "metadata"; v.src = url;
      card.append(v);
    }
    const meta = el("div", "meta");
    if (s.status && s.status !== "approved") meta.append(el("span", "pill", s.status === "pending" ? "Waiting for review" : "Hidden"));
    meta.append(el("h3", null, s.title || "Untitled story"));
    const tag = el("div", "dogtag");
    [s.display_name, s.branch, s.era, s.years_served].filter(Boolean).forEach(t => tag.append(el("span", null, t)));
    meta.append(tag);
    if (s.summary) meta.append(el("p", null, s.summary));
    card.append(meta);
    return { card, meta };
  }

  function emptyState(title, body) {
    const e = el("div", "empty");
    e.append(el("strong", null, title), document.createTextNode(body));
    return e;
  }

  window.Stories = { sb, C, el, signedUrls, storyCard, emptyState };
})();
