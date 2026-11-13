// Retro Gaming Journey — the Diorama Wing.
//
// The Achievements tab used to be a wall of text. This puts the twenty NES Action
// dioramas in front of it as a grid of objects under glass, and each one opens
// onto its own stage: the world large, its three achievement picks beside it, the
// ones this account has earned lit gold.
//
// Everything is driven by the same data as the rest of the page:
//   ACH.get("nes", title)      → { raId, picks: [easy, intermediate, advanced] }
//   ACH.earnedOf("nes", title) → { <achievementId>: "<date>" }
// so a star lit here is lit on the Journey map, and vice versa.
//
// No framework, no requests: the art is img/dioramas/<slug>-420.webp (grid) and
// -900.webp (stage), baked from /rool-drive/Dioramas by tools/build-diorama-cards.py.
"use strict";

const DIORAMA = (() => {
  // Library order — the same order the Action map numbers its path points in.
  const GAMES = [
    "Contra", "Super Mario Bros. 3", "Mega Man 2", "Ninja Gaiden", "Castlevania III",
    "Double Dragon II", "Bionic Commando", "Duck Tales", "Blaster Master", "River City Ransom",
    "Life Force", "Gradius", "Jackal", "Skate or Die!", "Punch-Out!!",
    "Bubble Bobble", "Rygar", "Ikari Warriors", "Strider", "Section Z"
  ];
  const ART = "img/dioramas";
  const SOUND_KEY = "rgj-dw-sound";

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function slug(title) {
    return String(title).toLowerCase().replace(/!!/g, "").replace(/[!.]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  // Stars for one game: the three picks, each carrying its unlock date if this
  // account has it. `loaded` is false until RA's catalogue for the title is cached.
  function stars(title) {
    const g = (typeof ACH !== "undefined") ? ACH.get("nes", title) : null;
    if (!g || !g.picks || !g.picks.length) return { picks: [], earned: 0, loaded: false, raId: g && g.raId };
    const have = ACH.earnedOf("nes", title) || {};
    const picks = g.picks.map(p => ({ ...p, earnedDate: have[p.id] || null }));
    return { picks, earned: picks.filter(p => p.earnedDate).length, loaded: true, raId: g.raId };
  }

  /* ---------------- sound: three blips of square wave ---------------- */
  let actx = null;
  let soundOn = localStorage.getItem(SOUND_KEY) !== "0";
  function tone(freq, at, dur, gain) {
    if (!actx) return;
    const t0 = actx.currentTime + at;
    const osc = actx.createOscillator();
    const amp = actx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(freq, t0);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp).connect(actx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }
  function play(kind) {
    if (!soundOn) return;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
    } catch (e) { return; }
    if (kind === "open") { tone(523, 0, .07, .05); tone(784, .06, .09, .045); }
    else if (kind === "win") { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * .07, .11, .05)); }
    else if (kind === "nav") { tone(392, 0, .05, .035); }
    else if (kind === "close") { tone(330, 0, .06, .035); tone(247, .05, .08, .03); }
  }

  /* ---------------- the wing ---------------- */
  let grid, stage, bigImg, info, current = -1, mounted = false, lastFocus = null;

  function caseHTML(title, i) {
    const s = stars(title);
    const pips = [0, 1, 2].map(k => `<i class="dw-pip${s.picks[k] && s.picks[k].earnedDate ? " on" : ""}"></i>`).join("");
    const done = s.loaded && s.earned === 3;
    const state = !s.loaded || s.earned === 0 ? "new" : done ? "done" : "part";
    return `<button class="dw-case${done ? " done" : ""}" role="listitem" data-title="${esc(title)}" data-state="${state}"
        style="--i:${i}" title="${esc(title)} — ${s.earned} of 3 stars">
      <span class="dw-tilt">
        <span class="dw-frame">
          <img src="${ART}/${slug(title)}-420.webp" alt="${esc(title)} diorama" loading="lazy" decoding="async">
          <span class="dw-sheen" aria-hidden="true"></span>
          <span class="dw-badge" aria-hidden="true">★</span>
          <span class="dw-pips" aria-hidden="true">${pips}</span>
        </span>
        <span class="dw-plaque"><span class="dw-name">${esc(title)}</span></span>
      </span>
    </button>`;
  }

  function mount(host) {
    if (!host || mounted) return;
    mounted = true;
    host.innerHTML = `
      <section class="dw" aria-label="Diorama wing">
        <div class="dw-floor" aria-hidden="true"></div>
        <div class="dw-head">
          <div>
            <span class="dw-kicker">The diorama wing</span>
            <h3 class="dw-title">Twenty NES worlds, lifted off their maps</h3>
            <p class="dw-blurb">All twenty Action worlds on one wall, no sideways hunting. Open a case
            and its three picks wait beside the world they belong to.</p>
          </div>
          <div class="dw-meter">
            <div class="dw-stars"><b id="dw-lit">0</b> / <span id="dw-total">60</span> stars lit</div>
            <div class="dw-meter-track" role="presentation"><i id="dw-fill"></i></div>
            <button class="dw-snd" id="dw-snd" aria-pressed="${soundOn}" title="${soundOn ? "Sound on" : "Sound off"}">♪</button>
          </div>
        </div>
        <div class="dw-tools">
          <div class="dw-filters" role="group" aria-label="Which cases to show">
            <button class="dw-chip on" data-filter="all">All 20</button>
            <button class="dw-chip" data-filter="new">Unstarted</button>
            <button class="dw-chip" data-filter="part">In progress</button>
            <button class="dw-chip" data-filter="done">Mastered</button>
          </div>
          <div class="dw-tools-right">
            <button class="dw-tour" id="dw-tour" aria-pressed="false" title="Walk the whole wing, case by case">&#9654; take the tour</button>
            <button class="dw-shuffle" id="dw-shuffle" title="Open a case at random">&#8646; surprise me</button>
          </div>
        </div>
        <div class="dw-gridwrap">
          <div class="dw-grid" id="dw-grid" role="list" aria-label="Dioramas">${GAMES.map(caseHTML).join("")}</div>
        </div>
        <p class="dw-hint" id="dw-hint">click a case to step onto its stage · every one of the twenty is on this grid</p>
      </section>`;
    grid = host.querySelector("#dw-grid");

    const snd = host.querySelector("#dw-snd");
    snd.addEventListener("click", () => {
      soundOn = !soundOn;
      localStorage.setItem(SOUND_KEY, soundOn ? "1" : "0");
      snd.setAttribute("aria-pressed", String(soundOn));
      snd.title = soundOn ? "Sound on" : "Sound off";
      if (soundOn) play("nav");
    });

    grid.addEventListener("click", e => {
      const c = e.target.closest(".dw-case");
      if (!c) return;
      open(GAMES.indexOf(c.dataset.title));
    });

    // Filters: a grid that can show only the cases you could still light is far more
    // use than twenty identical rectangles. The chips hold their choice for the session.
    host.querySelectorAll(".dw-chip").forEach(b => b.addEventListener("click", () => {
      host.querySelectorAll(".dw-chip").forEach(o => o.classList.toggle("on", o === b));
      host.dataset.filter = b.dataset.filter;
      applyFilter(host);
      play("nav");
    }));

    const sh = host.querySelector("#dw-shuffle");
    if (sh) sh.addEventListener("click", () => {
      // Prefer a case with something still to earn; if all twenty are mastered, any case.
      const open_ = GAMES.map((t, i) => ({ t, i, s: stars(t) })).filter(x => x.s.loaded && x.s.earned < 3);
      const pool = open_.length ? open_ : GAMES.map((t, i) => ({ t, i }));
      open(pool[Math.floor(Math.random() * pool.length)].i);
    });

    const tourBtn = host.querySelector("#dw-tour");
    if (tourBtn) tourBtn.addEventListener("click", () => tour.on ? stopTour() : startTour());

    tilt(grid);
    buildStage();
    refresh();
  }

  // Follow the pointer with a shallow 3D rotation, so a case reads as an object
  // rather than a picture. Touch and reduced-motion users keep the flat version.
  function tilt(host) {
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches || matchMedia("(pointer: coarse)").matches;
    if (calm) return;
    host.addEventListener("pointermove", e => {
      const c = e.target.closest(".dw-case");
      if (!c) return;
      const r = c.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5;
      const ny = (e.clientY - r.top) / r.height - 0.5;
      const t = c.querySelector(".dw-tilt");
      t.style.setProperty("--ry", (nx * 13).toFixed(2) + "deg");
      t.style.setProperty("--rx", (-ny * 11).toFixed(2) + "deg");
      t.style.setProperty("--lift", "-8px");
      c.querySelector(".dw-sheen").style.setProperty("--mx", (nx * 14).toFixed(1));
    });
    host.addEventListener("pointerout", e => {
      const c = e.target.closest(".dw-case");
      if (!c || c.contains(e.relatedTarget)) return;
      const t = c.querySelector(".dw-tilt");
      ["--ry", "--rx", "--lift"].forEach(v => t.style.removeProperty(v));
      c.querySelector(".dw-sheen").style.removeProperty("--mx");
    });
  }

  // A case is "new" until a star is lit, "part" with one or two, "done" with all three.
  function applyFilter(host) {
    if (!grid) return;
    const want = (host || grid.closest(".dw")).dataset.filter || "all";
    let shown = 0;
    grid.querySelectorAll(".dw-case").forEach(c => {
      const keep = want === "all" || c.dataset.state === want;
      c.hidden = !keep;
      if (keep) shown++;
    });
    const hint = document.getElementById("dw-hint");
    if (hint) hint.textContent = shown === GAMES.length
      ? "click a case to step onto its stage · every one of the twenty is on this grid"
      : shown
        ? `${shown} of 20 cases showing · click one to step onto its stage`
        : "Nothing in this state yet — clear the filter to see the whole wing.";
  }

  function refresh() {
    if (!grid) return;
    let lit = 0;
    grid.querySelectorAll(".dw-case").forEach(c => {
      const s = stars(c.dataset.title);
      lit += s.earned;
      c.classList.toggle("done", s.loaded && s.earned === 3);
      c.dataset.state = !s.loaded || s.earned === 0 ? "new" : s.earned === 3 ? "done" : "part";
      c.querySelectorAll(".dw-pip").forEach((p, i) => p.classList.toggle("on", !!(s.picks[i] && s.picks[i].earnedDate)));
      c.title = `${c.dataset.title} — ${s.earned} of 3 stars`;
    });
    // Counts on the chips: "Mastered 3" says more than "Mastered" ever will.
    const tally = { all: GAMES.length, new: 0, part: 0, done: 0 };
    grid.querySelectorAll(".dw-case").forEach(c => { tally[c.dataset.state]++; });
    document.querySelectorAll(".dw-chip").forEach(b => {
      const k = b.dataset.filter;
      const label = { all: "All", new: "Unstarted", part: "In progress", done: "Mastered" }[k];
      b.textContent = `${label} ${tally[k]}`;
    });

    const fill = document.getElementById("dw-fill"), count = document.getElementById("dw-lit");
    if (count) count.textContent = lit;
    if (fill) fill.style.width = Math.round((lit / (GAMES.length * 3)) * 100) + "%";
    if (mounted) applyFilter();
    if (current >= 0 && stage && !stage.hidden) paint(current);
  }

  /* ---------------- the guided tour ---------------- */
  // "Take the tour" walks the wing on its own: one case every few seconds, unmastered
  // first, because those are the ones worth looking at. Any move of your own ends it.
  const TOUR_MS = 5200;
  const tour = { on: false, queue: [], at: 0, timer: null, bar: null, btn: null };

  function startTour() {
    if (!grid) return;
    const all = GAMES.map((t, i) => ({ i, s: stars(t) }));
    const dark = all.filter(x => !(x.s.loaded && x.s.earned === 3));
    tour.queue = (dark.length ? dark : all).map(x => x.i);
    tour.at = 0;
    tour.on = true;
    if (tour.btn) { tour.btn.setAttribute("aria-pressed", "true"); tour.btn.innerHTML = "&#9632; stop the tour"; }
    open(tour.queue[0]);
    stepTour();
    play("open");
  }

  function stepTour() {
    clearTimeout(tour.timer);
    if (!tour.on) return;
    if (tour.bar) {
      tour.bar.style.transition = "none";
      tour.bar.style.width = "0%";
      void tour.bar.offsetWidth;
      tour.bar.style.transition = `width ${TOUR_MS}ms linear`;
      tour.bar.style.width = "100%";
    }
    tour.timer = setTimeout(() => {
      if (!tour.on) return;
      tour.at++;
      if (tour.at >= tour.queue.length) { stopTour(); close(); return; }
      open(tour.queue[tour.at]);
      stepTour();
    }, TOUR_MS);
  }

  function stopTour() {
    tour.on = false;
    clearTimeout(tour.timer);
    if (tour.btn) { tour.btn.setAttribute("aria-pressed", "false"); tour.btn.innerHTML = "&#9654; take the tour"; }
    if (tour.bar) { tour.bar.style.transition = "none"; tour.bar.style.width = "0%"; }
    if (stage) stage.classList.remove("touring");
  }

  // A mastered case opens with a burst of gold — the only reward the wing can give
  // that a gold star has not already given.
  function spark() {
    if (!stage || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const box = stage.querySelector(".dw-stage-art");
    if (!box) return;
    for (let k = 0; k < 22; k++) {
      const s = document.createElement("i");
      s.className = "dw-spark";
      const a = Math.random() * Math.PI * 2, r = 90 + Math.random() * 190;
      s.style.setProperty("--dx", (Math.cos(a) * r).toFixed(0) + "px");
      s.style.setProperty("--dy", (Math.sin(a) * r * .7).toFixed(0) + "px");
      s.style.animationDelay = (Math.random() * .25).toFixed(2) + "s";
      box.appendChild(s);
      setTimeout(() => s.remove(), 2200);
    }
  }

  /* ---------------- the stage ---------------- */
  function buildStage() {
    stage = document.createElement("div");
    stage.className = "dw-stage";
    stage.hidden = true;
    stage.setAttribute("role", "dialog");
    stage.setAttribute("aria-modal", "true");
    stage.setAttribute("aria-labelledby", "dw-stage-name");
    stage.innerHTML = `
      <div class="dw-scrim" data-close></div>
      <div class="dw-stage-body">
        <button class="dw-x" data-close aria-label="Close">✕</button>
        <button class="dw-navb prev" data-step="-1" aria-label="Previous diorama">‹</button>
        <button class="dw-navb next" data-step="1" aria-label="Next diorama">›</button>
        <div class="dw-stage-art">
          <div class="rays" aria-hidden="true"></div>
          <div class="dw-bigart">
            <img id="dw-bigimg" alt="">
            <span class="sweep" aria-hidden="true"></span>
          </div>
          <div class="dw-motes" aria-hidden="true"></div>
        </div>
        <div class="dw-stage-info">
          <p class="dw-kicker" id="dw-stage-kicker"></p>
          <h3 id="dw-stage-name"></h3>
          <div class="dw-stage-stars" id="dw-stage-stars"></div>
          <ul class="dw-ach" id="dw-stage-ach"></ul>
          <p class="dw-stage-note" id="dw-stage-note"></p>
        </div>
        <div class="dw-thumbs" id="dw-thumbs" aria-label="Jump to another diorama"></div>
        <button class="dw-stoptour" type="button">&#9632; stop the tour</button>

      </div>
      <div class="dw-tourbar" aria-hidden="true"><i></i></div>`;
    document.body.appendChild(stage);
    bigImg = stage.querySelector("#dw-bigimg");
    info = stage;
    tour.bar = stage.querySelector(".dw-tourbar i");
    stage.querySelector(".dw-stoptour").addEventListener("click", stopTour);
    tour.btn = document.querySelector("#dw-tour");

    // A strip of the other nineteen worlds: the fastest way between cases, and the
    // only way to see at a glance which ones are still dark.
    const thumbs = stage.querySelector("#dw-thumbs");
    thumbs.innerHTML = GAMES.map((t, i) => `
      <button class="dw-thumb" data-i="${i}" title="${esc(t)}">
        <img src="${ART}/${slug(t)}-420.webp" alt="" loading="lazy"><i></i>
      </button>`).join("");
    thumbs.addEventListener("click", e => {
      const b = e.target.closest(".dw-thumb");
      if (b) { stopTour(); open(Number(b.dataset.i)); }
    });

    // Swipe the world to walk the shelf — the natural gesture on a phone.
    const artBox = stage.querySelector(".dw-stage-art");
    let sx = 0, sy = 0, swiping = false;
    artBox.addEventListener("pointerdown", e => {
      if (e.pointerType === "mouse") return;
      sx = e.clientX; sy = e.clientY; swiping = true;
    });
    artBox.addEventListener("pointerup", e => {
      if (!swiping) return;
      swiping = false;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 46 && Math.abs(dx) > Math.abs(dy)) { stopTour(); open(current + (dx < 0 ? 1 : -1)); }
    });
    artBox.addEventListener("pointercancel", () => { swiping = false; });

    stage.querySelectorAll("[data-close]").forEach(el => el.addEventListener("click", close));
    stage.querySelectorAll("[data-step]").forEach(el =>
      el.addEventListener("click", () => { stopTour(); open(current + Number(el.dataset.step)); }));

    document.addEventListener("keydown", e => {
      if (stage.hidden) return;
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); stopTour(); open(current + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); stopTour(); open(current - 1); }
    });

    // pointer parallax on the big art
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches && !matchMedia("(pointer: coarse)").matches) {
      const art = stage.querySelector(".dw-bigart");
      stage.addEventListener("pointermove", e => {
        const r = art.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width - 0.5;
        const ny = (e.clientY - r.top) / r.height - 0.5;
        art.style.setProperty("--px", (nx * -16).toFixed(1));
        art.style.setProperty("--py", (ny * -12).toFixed(1));
        art.style.setProperty("--pry", (nx * 4).toFixed(2) + "deg");
        art.style.setProperty("--prx", (-ny * 3).toFixed(2) + "deg");
      });
      stage.addEventListener("pointerleave", () => {
        ["--px", "--py", "--pry", "--prx"].forEach(v => art.style.removeProperty(v));
      });
    }
  }

  function fmtDate(s) {
    const d = new Date(String(s).replace(" ", "T"));
    if (isNaN(d)) return String(s);
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  function paint(i) {
    current = (i + GAMES.length) % GAMES.length;
    const title = GAMES[current];
    const s = stars(title);
    const done = s.loaded && s.earned === 3;

    stage.classList.toggle("done", done);
    stage.classList.toggle("touring", tour.on);
    if (done) spark();
    // Re-shoot the case: the new world fades up through a small push, so switching
    // cases feels like a cut between scenes rather than a silent image swap.
    const art = stage.querySelector(".dw-bigart");
    art.classList.remove("swap");
    void art.offsetWidth;
    art.classList.add("swap");
    bigImg.src = ART + "/" + slug(title) + "-900.webp";
    bigImg.alt = title + " diorama";
    info.querySelector("#dw-stage-kicker").textContent =
      `No. ${String(current + 1).padStart(2, "0")} · NES Action`;
    info.querySelector("#dw-stage-name").textContent = title;

    const starsEl = info.querySelector("#dw-stage-stars");
    starsEl.innerHTML = [0, 1, 2].map(k =>
      `<span class="dw-star${s.picks[k] && s.picks[k].earnedDate ? " on" : ""}">★</span>`).join("") +
      `<span class="dw-starcount">${s.earned} of 3 earned${done ? " · mastered" : ""}</span>`;

    const list = info.querySelector("#dw-stage-ach");
    if (!s.loaded) {
      list.innerHTML = `<li class="dw-row" style="--delay:0s"><span class="tag">—</span>
        <div><div class="r-title">No picks cached for this title yet</div>
        <div class="r-desc">Press “Load from RetroAchievements” above and the three pulls will appear here.</div></div></li>`;
    } else {
      list.innerHTML = s.picks.map((p, k) => `
        <li class="dw-row ${p.tier}${p.earnedDate ? " on" : ""}" style="--delay:${0.05 + k * 0.07}s">
          <span class="tag">${p.tier === "intermediate" ? "mid" : esc(p.tier)}</span>
          <div>
            <div class="r-title">${p.earnedDate ? "★ " : ""}${esc(p.title)}</div>
            <div class="r-desc">${esc(p.desc)}</div>
            <div class="r-meta">${p.points} pts · ratio ${p.ratio}${p.earnedDate ? ` · unlocked ${esc(fmtDate(p.earnedDate))}` : " · not yet"}</div>
          </div>
        </li>`).join("");
    }
    info.querySelector("#dw-stage-note").textContent = done
      ? "All three lit — this one is finished. The same stars are gold on its Journey map path point."
      : "Stars lit here are the same ones that light the path point on the Journey map.";

    // dust motes: randomised once per paint, they read as a lit, breathing case
    const motes = info.querySelector(".dw-motes");
    motes.innerHTML = Array.from({ length: 9 }, () => {
      const left = 6 + Math.random() * 88;
      const dur = (5 + Math.random() * 5).toFixed(1);
      const delay = (-Math.random() * 8).toFixed(1);
      return `<i class="dw-mote" style="left:${left}%;bottom:${(Math.random() * 30).toFixed(0)}%;--d:${dur}s;--delay:${delay}s"></i>`;
    }).join("");

    stage.querySelectorAll(".dw-thumb").forEach(b => {
      const t = GAMES[Number(b.dataset.i)];
      const ts = stars(t);
      b.classList.toggle("on", Number(b.dataset.i) === current);
      b.classList.toggle("lit", ts.loaded && ts.earned === 3);
    });

    // The stage covers the grid, so marking the case is enough: on close you are
    // standing in front of the case you last opened, no scroll jump.
    grid.querySelectorAll(".dw-case").forEach(c =>
      c.classList.toggle("current", c.dataset.title === title));
  }

  function open(i) {
    if (!grid) return;
    if (i == null) return;
    if (stage.hidden) {
      lastFocus = document.activeElement;
      stage.hidden = false;
      document.body.style.overflow = "hidden";
      paint(i);
      const s = stars(GAMES[current]);
      play(s.loaded && s.earned === 3 ? "win" : "open");
      stage.querySelector(".dw-x").focus({ preventScroll: true });
    } else {
      paint(i);
      const s = stars(GAMES[current]);
      play(s.loaded && s.earned === 3 ? "win" : "nav");
    }
  }

  function close() {
    if (!stage || stage.hidden) return;
    stopTour();
    stage.hidden = true;
    document.body.style.overflow = "";
    play("close");
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  return { mount, refresh, open, close, stars, GAMES, has: t => GAMES.includes(t), _slug: slug };
})();
window.DIORAMA = DIORAMA;
