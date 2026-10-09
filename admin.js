(function () {
  const { sb, C, el, signedUrls, storyCard, emptyState } = window.Stories;
  const $ = id => document.getElementById(id);
  let stories = [], contacts = {}, urls = {}, view = "pending";

  function show(id) { ["signin", "denied", "queue"].forEach(s => $(s).hidden = s !== id); }

  $("loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    const email = $("loginEmail").value.trim();
    const msg = $("loginMsg");
    if (!email) { msg.hidden = false; msg.className = "msg err"; msg.textContent = "Enter your email."; return; }
    $("loginBtn").disabled = true;
    const { error } = await sb.auth.signInWithOtp({
      email, options: { emailRedirectTo: location.origin + "/admin" }
    });
    $("loginBtn").disabled = false;
    msg.hidden = false;
    if (error) { msg.className = "msg err"; msg.textContent = "Couldn't send the link: " + error.message; }
    else { msg.className = "msg ok"; msg.textContent = "Check your email for a sign-in link. Open it on this device."; }
  });

  document.querySelectorAll(".signout").forEach(b => b.onclick = async () => { await sb.auth.signOut(); location.reload(); });

  document.querySelectorAll("[data-view]").forEach(b => b.onclick = () => {
    view = b.dataset.view;
    document.querySelectorAll("[data-view]").forEach(x => x.setAttribute("aria-pressed", x === b));
    render();
  });

  async function load() {
    const { data, error } = await sb.from("stories")
      .select("id,title,display_name,branch,era,years_served,summary,video_path,status,created_at,approved_at")
      .order("created_at", { ascending: false }).limit(500);
    if (error) { $("list").replaceChildren(emptyState("Couldn't load stories", error.message)); return; }
    stories = data;
    const { data: c } = await sb.rpc("admin_story_contacts");
    contacts = {}; (c || []).forEach(r => { if (r.contact_email) contacts[r.id] = r.contact_email; });
    urls = await signedUrls(stories.map(s => s.video_path));
    render();
  }

  async function setStatus(s, status) {
    const patch = { status, approved_at: status === "approved" ? new Date().toISOString() : null };
    const { error } = await sb.from("stories").update(patch).eq("id", s.id);
    if (error) return alert("Couldn't update: " + error.message);
    Object.assign(s, patch); render();
  }

  async function remove(s) {
    await sb.storage.from(C.bucket).remove([s.video_path]);
    const { error } = await sb.from("stories").delete().eq("id", s.id);
    if (error) return alert("Couldn't delete: " + error.message);
    stories = stories.filter(x => x !== s); render();
  }

  function btn(label, cls, fn) { const b = el("button", "small " + (cls || ""), label); b.type = "button"; b.onclick = fn; return b; }

  function render() {
    ["pending", "approved", "hidden"].forEach(k => {
      const n = stories.filter(s => s.status === k).length;
      document.querySelector(`[data-count="${k}"]`).textContent = n ? `(${n})` : "";
    });
    const list = $("list");
    list.replaceChildren();
    const rows = stories.filter(s => s.status === view);
    if (!rows.length) {
      list.append(emptyState(
        view === "pending" ? "Nothing waiting" : view === "approved" ? "Nothing posted yet" : "Nothing hidden",
        view === "pending" ? "New submissions land here for you to review." : ""));
      return;
    }
    rows.forEach(s => {
      const { card, meta } = storyCard(s, urls[s.video_path]);
      const info = el("div", "dogtag");
      info.append(el("span", null, "Sent " + new Date(s.created_at).toLocaleString()));
      if (contacts[s.id]) info.append(el("span", null, contacts[s.id]));
      meta.append(info);
      const r = el("div", "review");
      if (s.status !== "approved") r.append(btn("Approve and post", "primary", () => setStatus(s, "approved")));
      if (s.status !== "hidden") r.append(btn(s.status === "approved" ? "Take down" : "Hide", "", () => setStatus(s, "hidden")));
      if (s.status === "hidden") r.append(btn("Move to waiting", "", () => setStatus(s, "pending")));
      const del = btn("Delete for good", "danger", () => {
        if (del.dataset.armed !== "1") {
          del.dataset.armed = "1"; del.textContent = "Tap again to delete";
          setTimeout(() => { del.dataset.armed = ""; del.textContent = "Delete for good"; }, 4000);
          return;
        }
        del.disabled = true; remove(s);
      });
      r.append(del);
      meta.append(r);
      list.append(card);
    });
  }

  async function start(session) {
    if (!session) { show("signin"); $("signoutBtn").hidden = true; $("who").textContent = ""; return; }
    $("who").textContent = session.user.email;
    $("signoutBtn").hidden = false;
    const { data: ok } = await sb.rpc("am_i_reviewer");
    if (!ok) { $("whoDenied").textContent = session.user.email; show("denied"); return; }
    show("queue");
    load();
  }

  sb.auth.getSession().then(({ data }) => start(data.session));
  sb.auth.onAuthStateChange((evt, session) => { if (evt === "SIGNED_IN" || evt === "SIGNED_OUT") start(session); });
})();
