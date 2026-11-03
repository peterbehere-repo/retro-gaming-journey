// Retro Gaming Journey — who is using this page.
//
// The page is a personal dashboard, so identity has to come from somewhere that
// already knows the player. It is the RetroAchievements account: every visitor who
// has progress to show has one, the API can verify a key without a backend of our
// own, and it is the same account the handhelds award achievements to.
//
// What a session decides:
//   • whose progress the dashboard shows   (state is stored per account)
//   • whose achievements the pull reads     (RA.configure(user, key))
//   • what the header and greeting say
//
// What it does NOT do: send anything to a server of ours. The key stays in this
// browser's localStorage and goes only to retroachievements.org.
"use strict";

const IDENT = (() => {
  const SESSION  = "rgj-session-v1";   // { user, key, since }  — the live session
  const ACCOUNTS = "rgj-accounts-v1";  // { "<lower>": { user, key, pic, last } } — device profiles
  const API = "https://retroachievements.org/API/";
  const PIC = "https://retroachievements.org";

  let session = read(SESSION);

  function read(key) {
    try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { return null; }
  }
  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* private mode */ }
  }

  /* ---------------- verification ---------------- */

  // Returns { ok, profile } or { ok:false, error }. A 401 means the key is wrong;
  // an empty array means the username does not exist. Those are different problems
  // and the user can only fix the one they are told about.
  async function verify(user, key) {
    const u = String(user || "").trim();
    const k = String(key || "").trim();
    if (!u) return { ok: false, error: "Enter your RetroAchievements username." };
    if (!/^[A-Za-z0-9_\-]{1,32}$/.test(u))
      return { ok: false, error: "That is not a valid RetroAchievements username." };
    if (!k) return { ok: false, error: "Enter your web API key (it is on your RA settings page)." };
    if (!/^[A-Za-z0-9]{16,64}$/.test(k))
      return { ok: false, error: "That does not look like a web API key — they are 32 letters and digits." };

    let r;
    try {
      r = await fetch(`${API}API_GetUserProfile.php?u=${encodeURIComponent(u)}&y=${encodeURIComponent(k)}`,
        { headers: { Accept: "application/json" } });
    } catch (e) {
      return { ok: false, error: "Could not reach RetroAchievements — check the connection." };
    }
    if (r.status === 401) return { ok: false, error: "That API key was rejected (401 Unauthorized)." };
    if (r.status === 429) return { ok: false, error: "RetroAchievements is rate-limiting this connection. Try again in a minute." };
    if (!r.ok) return { ok: false, error: `RetroAchievements answered HTTP ${r.status}.` };
    let body;
    try { body = await r.json(); } catch (e) { return { ok: false, error: "RetroAchievements returned something that was not JSON." }; }
    const p = Array.isArray(body) ? body[0] : body;
    if (!p || !p.User) return { ok: false, error: `No RetroAchievements account called "${u}".` };
    if (p.Untracked) return { ok: false, error: `${p.User}'s profile is set to untracked, so progress cannot be read.` };
    return { ok: true, profile: p };
  }

  /* ---------------- session ---------------- */

  function accounts() {
    const all = read(ACCOUNTS) || {};
    return Object.values(all).sort((a, b) => (b.last || 0) - (a.last || 0));
  }

  function remember(user, key, pic) {
    const all = read(ACCOUNTS) || {};
    all[user.toLowerCase()] = { user, key, pic: pic || "", last: Date.now() };
    write(ACCOUNTS, all);
  }

  function signIn(user, key, pic) {
    session = { user, key, pic: pic || "", since: new Date().toISOString() };
    write(SESSION, session);
    remember(user, key, pic);
    return session;
  }

  function signOut() {
    session = null;
    localStorage.removeItem(SESSION);
  }

  // Drop one remembered profile (and its live session, if it is the active one).
  function forgetAccount(user) {
    const all = read(ACCOUNTS) || {};
    delete all[String(user).toLowerCase()];
    write(ACCOUNTS, all);
    if (session && session.user.toLowerCase() === String(user).toLowerCase()) signOut();
  }

  function current() { return session; }
  function signedIn() { return !!(session && session.user && session.key); }
  function name() { return session ? session.user : ""; }
  function pic() {
    if (!session) return "";
    if (session.pic) return /^https?:/.test(session.pic) ? session.pic : PIC + session.pic;
    return `${PIC}/UserPic/${encodeURIComponent(session.user)}.png`;
  }

  // Progress is per account. Guest progress lives under the original key so that
  // anything earned before signing in is not lost — it becomes the signed-in
  // profile's data on the first sign-in (see adoptGuestState).
  const GUEST_KEY = "rgj-state-v1";
  function stateKey() { return signedIn() ? `${GUEST_KEY}:u:${session.user.toLowerCase()}` : GUEST_KEY; }

  /* Revalidate on load: a stored key may have been revoked, and a silent 401 in the
     middle of a pull is worse than a prompt. Never blocks rendering — resolves to
     "ok" | "invalid" | "offline" and the caller decides how loudly to say so. */
  async function revalidate() {
    if (!signedIn()) return "signed-out";
    const res = await verify(session.user, session.key);
    if (res.ok) {
      session.user = res.profile.User;             // canonical casing
      session.pic = res.profile.UserPic || session.pic;
      write(SESSION, session);
      remember(session.user, session.key, session.pic);
      return "ok";
    }
    if (/401|rejected/.test(res.error || "")) { signOut(); return "invalid"; }
    return "offline";
  }

  return {
    verify, signIn, signOut, forgetAccount, accounts,
    current, signedIn, name, pic, stateKey, revalidate, GUEST_KEY
  };
})();
window.IDENT = IDENT;
