(function () {
  const { sb, el, paintBranch, ribbons, serviceLine, signedUrls, videoEl, emptyState, VETERAN_COLS, sortVideos } = window.Stories;
  const page = document.getElementById("page");
  const id = new URLSearchParams(location.search).get("id");

  // Video with its title, summary and (once transcribed) captions + transcript.
  function videoBlock(d, urls, heading) {
    const sec = el("section", "video-block");
    if (heading) sec.append(el("h3", null, heading));
    if (urls[d.video_path]) sec.append(videoEl(urls[d.video_path], urls[d.captions_path]));
    if (d.summary) sec.append(el("p", "hint", d.summary));
    if (d.transcript) {
      const t = el("details", "transcript");
      t.append(el("summary", null, "Read the transcript"));
      d.transcript.split(/\n\s*\n/).forEach(p => t.append(el("p", null, p.trim())));
      sec.append(t);
    } else if (d.transcript_status === "processing") {
      sec.append(el("div", "fileinfo", "Transcript coming soon"));
    }
    return sec;
  }

  async function load() {
    if (!/^[0-9a-f-]{36}$/i.test(id || "")) return page.replaceChildren(emptyState("Profile not found", "Head back to the wall to pick a story."));
    // The public can only read approved profiles; reviewers can read any.
    const { data: v, error } = await sb.from("veterans").select(VETERAN_COLS).eq("id", id).maybeSingle();
    if (error) return page.replaceChildren(emptyState("Couldn't load this profile", "Refresh the page to try again."));
    if (!v) return page.replaceChildren(emptyState("Profile not found", "It may still be waiting for review, or it was taken down."));
    sortVideos(v);

    document.title = (v.display_name || "A veteran") + " · Stories of Service";
    paintBranch(document.body, v.branch);
    const urls = await signedUrls([v.photo_path, ...v.videos.flatMap(d => [d.video_path, d.captions_path])]);
    const out = [];

    const head = el("div", "bio-head");
    if (urls[v.photo_path]) { const img = el("img"); img.src = urls[v.photo_path]; img.alt = v.display_name || ""; head.append(img); }
    const who = el("div");
    who.append(el("h1", null, v.display_name || "A veteran"));
    const tag = el("div", "dogtag");
    serviceLine(v).forEach(t => tag.append(el("span", null, t)));
    who.append(tag);
    if (v.status && v.status !== "approved") who.append(el("span", "pill", v.status === "pending" ? "Waiting for review" : "Hidden"));
    head.append(who);
    out.push(head);
    if (v.eras && v.eras.length) out.push(ribbons(v.eras, true));

    const intro = v.videos.find(d => d.kind === "intro");
    if (intro) out.push(videoBlock(intro, urls));

    const stories = v.videos.filter(d => d.kind === "story");
    if (stories.length) {
      const sec = el("section");
      sec.append(el("h2", null, stories.length === 1 ? "Story" : "Stories"));
      stories.forEach(d => sec.append(videoBlock(d, urls, d.title)));
      out.push(sec);
    }

    const facts = [["Hometown", v.hometown], ["Job", v.job], ["Units", v.unit], ["Duty stations", v.duty_stations],
                   ["Deployments", v.deployments], ["Awards", v.awards]].filter(f => f[1]);
    if (facts.length) {
      const sec = el("section"); sec.append(el("h2", null, "Service"));
      const dl = el("dl", "facts");
      facts.forEach(([k, val]) => dl.append(el("dt", null, k), el("dd", null, val)));
      sec.append(dl); out.push(sec);
    }

    [["Life after service", v.after_service], ["In their own words", v.bio]].forEach(([h, text]) => {
      if (!text) return;
      const sec = el("section", "bio-text"); sec.append(el("h2", null, h));
      text.split(/\n\s*\n/).forEach(p => sec.append(el("p", null, p.trim())));
      out.push(sec);
    });

    page.replaceChildren(...out);
  }
  load();
})();
