(function () {
  const { sb, C, el, signedUrls, storyCard, emptyState } = window.Stories;
  const $ = id => document.getElementById(id);
  let stories = [], contacts = {}, urls = {}, view = "pending";

  function show(id) { ["signin", "denied", "queue"].forEach(s => $(s).hidden = s !== id); }
  function form(id) { ["phoneForm", "codeForm", "loginForm"].forEach(f => $(f).hidden = f !== id); }
  function say(id, ok, text) { const m = $(id); m.hidden = false; m.className = "msg " + (ok ? "ok" : "err"); m.textContent = text; }

  // US numbers by default; a leading + keeps any country code.
  function toE164(raw) {
    const d = raw.replace(/\D/g, "");
    if (raw.trim().startsWith("+")) return d.length >= 11 ? "+" + d : null;
    if (d.length === 10) return "+1" + d;
    if (d.length === 11 && d[0] === "1") return "+" + d;
    return null;
  }
  let pendingPhone = null;

  $("useEmail").onclick = () => form("loginForm");
  $("usePhone").onclick = () => form("phoneForm");
  $("codeBack").onclick = () => { $("loginCode").value = ""; form("phoneForm"); };

  $("phoneForm").addEventListener("submit", async e => {
    e.preventDefault();
    const phone = toE164($("loginPhone").value);
    if (!phone) return say("phoneMsg", false, "Enter a 10-digit phone number.");
    $("phoneBtn").disabled = true;
    const { error } = await sb.auth.signInWithOtp({ phone });
    $("phoneBtn").disabled = false;
    if (error) return say("phoneMsg", false, "Couldn't send a code: " + error.message);
    pendingPhone = phone;
    $("phoneMsg").hidden = true;
    say("codeMsg", true, "We texted a code to " + $("loginPhone").value.trim() + ".");
    form("codeForm");
    $("loginCode").focus();
  });

  $("codeForm").addEventListener("submit", async e => {
    e.preventDefault();
    const token = $("loginCode").value.replace(/\D/g, "");
    if (token.length !== 6) return say("codeMsg", false, "Enter the 6-digit code.");
    $("codeBtn").disabled = true;
    const { error } = await sb.auth.verifyOtp({ phone: pendingPhone, token, type: "sms" });
    $("codeBtn").disabled = false;
    if (error) { $("loginCode").value = ""; return say("codeMsg", false, "That code didn't work: " + error.message); }
  });
  $("loginCode").addEventListener("input", e => {
    if (e.target.value.replace(/\D/g, "").length === 6) $("codeForm").requestSubmit();
  });

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
    const who = session.user.email || (session.user.phone ? "+" + session.user.phone.replace(/^\+/, "") : "");
    $("who").textContent = who;
    $("signoutBtn").hidden = false;
    const { data: ok } = await sb.rpc("am_i_reviewer");
    if (!ok) { $("whoDenied").textContent = who; show("denied"); return; }
    show("queue");
    load();
  }

  sb.auth.getSession().then(({ data }) => start(data.session));
  sb.auth.onAuthStateChange((evt, session) => { if (evt === "SIGNED_IN" || evt === "SIGNED_OUT") start(session); });
})();
