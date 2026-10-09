(function () {
  const { sb, el, signedUrls, emptyState } = window.Stories;
  const page = document.getElementById("page");
  const id = new URLSearchParams(location.search).get("id");

  async function load() {
    if (!/^[0-9a-f-]{36}$/i.test(id || "")) return page.replaceChildren(emptyState("Story not found", "Head back to the wall to pick a story."));
    // The public can only read approved stories; reviewers can read any.
    const { data: s, error } = await sb.from("stories")
      .select("id,title,display_name,branch,era,years_served,summary,video_path,status,photo_path,rank,unit,job,duty_stations,deployments,awards,hometown,after_service,bio")
      .eq("id", id).maybeSingle();
    if (error) return page.replaceChildren(emptyState("Couldn't load this story", "Refresh the page to try again."));
    if (!s) return page.replaceChildren(emptyState("Story not found", "It may still be waiting for review, or it was taken down."));

    document.title = (s.display_name || "A veteran") + " · Stories of Service";
    const urls = await signedUrls([s.video_path, s.photo_path].filter(Boolean));
    const out = [];

    const head = el("div", "bio-head");
    if (urls[s.photo_path]) { const img = el("img"); img.src = urls[s.photo_path]; img.alt = s.display_name || ""; head.append(img); }
    const who = el("div");
    who.append(el("h1", null, s.display_name || "A veteran"));
    const tag = el("div", "dogtag");
    [s.rank, s.branch, s.era, s.years_served].filter(Boolean).forEach(t => tag.append(el("span", null, t)));
    who.append(tag);
    if (s.status && s.status !== "approved") who.append(el("span", "pill", s.status === "pending" ? "Waiting for review" : "Hidden"));
    head.append(who);
    out.push(head);

    const story = el("section");
    story.append(el("h2", null, s.title || "Story"));
    if (urls[s.video_path]) {
      const v = el("video"); v.controls = true; v.playsInline = true; v.preload = "metadata"; v.src = urls[s.video_path];
      story.append(v);
    }
    if (s.summary) story.append(el("p", null, s.summary));
    out.push(story);

    const facts = [["Hometown", s.hometown], ["Job", s.job], ["Units", s.unit], ["Duty stations", s.duty_stations],
                   ["Deployments", s.deployments], ["Awards", s.awards]].filter(f => f[1]);
    if (facts.length) {
      const sec = el("section"); sec.append(el("h2", null, "Service"));
      const dl = el("dl", "facts");
      facts.forEach(([k, v]) => dl.append(el("dt", null, k), el("dd", null, v)));
      sec.append(dl); out.push(sec);
    }

    [["Life after service", s.after_service], ["In their own words", s.bio]].forEach(([h, text]) => {
      if (!text) return;
      const sec = el("section", "bio-text"); sec.append(el("h2", null, h));
      text.split(/\n\s*\n/).forEach(p => sec.append(el("p", null, p.trim())));
      out.push(sec);
    });

    page.replaceChildren(...out);
  }
  load();
})();
