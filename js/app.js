import { CATEGORIES, getCategory } from "./plots.js";
import { moderateText, SAFETY_BOT, safetySelfCheck } from "./safety.js";
import {
  makePlotCode,
  normalizeCode,
  usedCodes,
  ensurePlotCode,
  emptyIrl,
  plotIrl,
  unpackPlot,
  shareUrl,
  qrImageUrl,
  readLinkParams,
  clearLinkParams,
  stashPending,
  takePending,
} from "./phygital.js";

const STORAGE_KEY = "little-meetup-v2";
const LEGACY_KEYS = ["little-meetup-v1"];
const SKINS = ["#ffd6a5", "#fdffb6", "#caffbf", "#9bf6ff", "#bdb2ff", "#ffc6ff", "#ffadad", "#f4a261"];
const PLOT_EMOJIS = ["🌈", "🍕", "🎮", "📚", "🐱", "🌙", "🔥", "💜", "🍀", "🎵", "🚀", "🧸", "☕", "🌸", "⚡", "🧊", "🌊", "🎯", "🪄", "🧁"];
const PLOT_THEMES = [
  { color: "#7b61ff", ground: "#d9d2ff" },
  { color: "#ef476f", ground: "#ffd0da" },
  { color: "#118ab2", ground: "#c5ebf6" },
  { color: "#f4a261", ground: "#ffe0c2" },
  { color: "#2a9d8f", ground: "#b7e4c7" },
  { color: "#3a86ff", ground: "#d6e6ff" },
  { color: "#9b5de5", ground: "#e8d6fb" },
  { color: "#f72585", ground: "#ffd0e6" },
  { color: "#e07a5f", ground: "#f8d8ce" },
  { color: "#f9c74f", ground: "#fff3c4" },
];
const EYES = [
  { id: "happy", label: "Happy" },
  { id: "wink", label: "Wink" },
  { id: "sleepy", label: "Sleepy" },
  { id: "cool", label: "Cool" },
];
const HATS = ["none", "🎀", "🎩", "🎧", "👑", "🌸", "🧢", "⭐"];
const OUTFITS = [
  { id: "none", label: "Plain" },
  { id: "hoodie", label: "Hoodie" },
  { id: "dress", label: "Dress" },
  { id: "overalls", label: "Overalls" },
  { id: "tee", label: "Tee" },
  { id: "scarf", label: "Scarf" },
  { id: "cape", label: "Cape" },
  { id: "pjs", label: "Pajamas" },
  { id: "raincoat", label: "Raincoat" },
  { id: "sweater", label: "Sweater" },
  { id: "vest", label: "Vest" },
  { id: "tuxedo", label: "Tuxedo" },
  { id: "astronaut", label: "Astronaut" },
  { id: "bee", label: "Bee" },
  { id: "apron", label: "Apron" },
  { id: "varsity", label: "Varsity" },
];

const VISITOR_NAMES = [
  "Pip", "Mochi", "Noodle", "Bean", "Pebble", "Sunny", "Clover", "Biscuit",
  "Maple", "Olive", "Pudding", "Pixel", "Nori", "Butter", "Juniper", "Toast",
];
const START_CAP = 100;
const CAP_STEP = 25;

const state = loadState();

function defaultState() {
  return {
    me: null,
    draft: {
      name: "",
      skin: SKINS[0],
      eyes: "happy",
      hat: "🎀",
      outfit: "tee",
    },
    groups: [],
    customPlots: [],
    plotCap: START_CAP,
    flash: "",
    lives: {},
    messages: {},
    view: "welcome",
    plotId: 1,
    filter: "all",
    query: "",
    modal: null,
    bans: [],
    warns: {},
    checkins: {},
  };
}

function readSaved() {
  const current = localStorage.getItem(STORAGE_KEY);
  if (current) return JSON.parse(current);
  for (const key of LEGACY_KEYS) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    const legacy = JSON.parse(raw);
    localStorage.removeItem(key);
    return {
      ...legacy,
      customPlots: [],
      groups: [],
      lives: {},
      messages: {},
      plotId: 1,
      view: legacy.me ? "map" : "welcome",
    };
  }
  return null;
}

function loadState() {
  const base = defaultState();
  try {
    const saved = readSaved();
    if (saved) {
      const customPlots = (Array.isArray(saved.customPlots) ? saved.customPlots : []).map((plot, _, list) => {
        const next = {
          ...plot,
          owner: plot.owner || saved.me?.name || "",
          admins: Array.isArray(plot.admins)
            ? plot.admins.filter((name) => name && name !== (plot.owner || saved.me?.name))
            : [],
          irl: plotIrl(plot),
        };
        return ensurePlotCode(next, list);
      });
      const plotExists = customPlots.some((plot) => Number(plot.id) === Number(saved.plotId));
      const next = {
        ...base,
        ...saved,
        me: saved.me ? { outfit: "none", ...saved.me } : null,
        customPlots,
        plotCap: Math.max(START_CAP, Number(saved.plotCap) || START_CAP, minCapFor(customPlots.length)),
        groups: livingGroups(saved.groups, customPlots),
        messages: saved.messages && typeof saved.messages === "object" ? saved.messages : {},
        lives: saved.lives && typeof saved.lives === "object" ? saved.lives : {},
        draft: { ...base.draft, ...(saved.draft || {}) },
        view: saved.me ? (plotExists && saved.view === "plot" ? "plot" : "map") : "welcome",
        filter: saved.filter || "all",
        query: saved.query || "",
        plotId: plotExists ? saved.plotId : 1,
        modal: null,
        flash: "",
        bans: Array.isArray(saved.bans) ? saved.bans : [],
        warns: saved.warns && typeof saved.warns === "object" ? saved.warns : {},
        checkins: saved.checkins && typeof saved.checkins === "object" ? saved.checkins : {},
      };
      try { persist(next); } catch { /* keep going even if storage is full */ }
      return next;
    }
  } catch {
    /* start fresh */
  }
  return base;
}

function livingGroups(groups, plots) {
  const ids = new Set((plots || []).map((plot) => Number(plot.id)));
  if (!Array.isArray(groups)) return [];
  return groups.filter((group) => ids.has(Number(group.plotId)));
}

function persist(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    me: data.me,
    groups: data.groups,
    customPlots: data.customPlots,
    plotCap: data.plotCap,
    messages: data.messages,
    lives: data.lives,
    bans: data.bans,
    warns: data.warns,
    checkins: data.checkins,
    draft: data.draft,
  }));
}

function save() {
  persist(state);
}

function minCapFor(count) {
  let cap = START_CAP;
  while (count >= cap) cap += CAP_STEP;
  return cap;
}

function canCreatePlot() {
  if (isBanned()) return false;
  return allPlots().length < state.plotCap;
}

function expandIfFull() {
  if (allPlots().length < state.plotCap) return 0;
  let added = 0;
  while (allPlots().length >= state.plotCap) {
    state.plotCap += CAP_STEP;
    added += CAP_STEP;
  }
  return added;
}

function showFlash(text) {
  state.flash = text;
  window.clearTimeout(showFlash.timer);
  showFlash.timer = window.setTimeout(() => {
    state.flash = "";
    const note = document.getElementById("town-flash");
    if (note) note.remove();
  }, 2800);
}

function createPlotButton() {
  if (isBanned()) {
    return `<button class="btn ghost" disabled title="You're banned from town chat">You're banned from town chat</button>`;
  }
  if (canCreatePlot()) {
    return `<button class="btn berry open-plot">Create a plot</button>`;
  }
  return `<button class="btn ghost" disabled title="The town is full right now">Plots full</button>`;
}

function allPlots() {
  return [...state.customPlots];
}

function findPlot(id) {
  const n = Number(id);
  if (!Number.isFinite(n)) return null;
  return allPlots().find((plot) => Number(plot.id) === n) || null;
}

function isBanned(name = state.me?.name) {
  if (!name) return false;
  return (state.bans || []).includes(name);
}

function botPost(plotId, text, kind) {
  const list = state.messages[plotId] || [];
  list.push({ name: SAFETY_BOT, text, bot: true, kind });
  state.messages[plotId] = list.slice(-20);
}

function applyModeration(text, plotId) {
  if (isBanned()) {
    showFlash("You're banned from town chat");
    return "blocked";
  }
  const verdict = moderateText(text);
  if (verdict.action === "ban") {
    if (!state.bans) state.bans = [];
    if (!state.bans.includes(state.me.name)) state.bans.push(state.me.name);
    botPost(
      plotId,
      verdict.reason === "address"
        ? "Sharing a home address is not allowed here."
        : "A message was blocked to keep the town safe.",
      "ban"
    );
    showFlash("You're banned from town chat");
    save();
    return "blocked";
  }
  if (verdict.action === "block") {
    showFlash("Please use kind words. Swears aren't allowed.");
    return "blocked";
  }
  if (verdict.action === "warn") {
    if (!state.warns) state.warns = {};
    const n = (state.warns[state.me.name] || 0) + 1;
    state.warns[state.me.name] = n;
    botPost(plotId, `Please don't share Discord or other contact apps here. (warning ${n})`, "warn");
    showFlash("Safety Pip: please don't share Discord here.");
    save();
    return "blocked";
  }
  return "ok";
}

function liveKey(id) {
  return String(id);
}

function getLive(plotId) {
  return state.lives[liveKey(plotId)] || null;
}

function isPlotLive(plotId) {
  return Boolean(getLive(plotId)?.on);
}

function isPlotOwner(plot) {
  if (!plot || !state.me) return false;
  if (plot.owner) return plot.owner === state.me.name;
  return true;
}

function plotAdmins(plot) {
  if (!plot || !Array.isArray(plot.admins)) return [];
  return plot.admins.filter((name) => name && name !== plot.owner);
}

function isPlotAdmin(plot, name = state.me?.name) {
  if (!plot || !name || name === plot.owner) return false;
  return plotAdmins(plot).includes(name);
}

function canTeachOn(plot) {
  if (!plot || !state.me || isBanned()) return false;
  if (isPlotOwner(plot)) return true;
  return plotAdmins(plot).includes(state.me.name);
}

function plotPeopleNames(plot) {
  const names = new Set();
  getParkPeople(plot.id).forEach((person) => names.add(person.name));
  state.groups
    .filter((group) => Number(group.plotId) === Number(plot.id))
    .forEach((group) => (group.members || []).forEach((name) => names.add(name)));
  plotAdmins(plot).forEach((name) => names.add(name));
  names.delete(plot.owner);
  if (isPlotOwner(plot)) names.delete(state.me.name);
  return [...names].filter(Boolean);
}

function nextPlotId() {
  return allPlots().reduce((max, plot) => Math.max(max, Number(plot.id) || 0), 0) + 1;
}

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function seed(n) {
  let x = n * 1103515245 + 12345;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

function visitorsFor(plotId) {
  const rand = seed(plotId + 17);
  const count = 3 + Math.floor(rand() * 4);
  return Array.from({ length: count }, (_, i) => {
    const name = VISITOR_NAMES[Math.floor(rand() * VISITOR_NAMES.length)];
    return {
      id: `v-${plotId}-${i}`,
      name: i === 0 ? name : `${name}${i > 1 ? i : ""}`,
      skin: SKINS[Math.floor(rand() * SKINS.length)],
      eyes: EYES[Math.floor(rand() * EYES.length)].id,
      hat: HATS[Math.floor(rand() * HATS.length)],
      outfit: OUTFITS[Math.floor(rand() * OUTFITS.length)].id,
      x: 14 + rand() * 72,
      y: 28 + rand() * 58,
    };
  });
}

function avatarMarkup(person, size = "") {
  const hat = person.hat && person.hat !== "none" ? `<div class="hat">${person.hat}</div>` : "";
  const outfit = person.outfit || "none";
  return `
    <div class="avatar ${size} ${person.eyes || "happy"} outfit-${outfit}" style="--skin:${person.skin}">
      <div class="cape"></div>
      ${hat}
      <div class="body"></div>
      <div class="fit"></div>
      <div class="face">
        <div class="eye left"></div>
        <div class="eye right"></div>
        <div class="blush left"></div>
        <div class="blush right"></div>
        <div class="mouth"></div>
      </div>
    </div>
  `;
}

function littleMarkup(person, isYou = false) {
  return `
    <div class="little ${isYou ? "you" : ""}" data-id="${person.id}" style="left:${person.x}%; top:${person.y}%">
      ${avatarMarkup(person)}
      <div class="nameplate">${isYou ? "You · " : ""}${person.name}</div>
    </div>
  `;
}

function render() {
  const app = document.getElementById("app");
  if (!state.me) {
    app.innerHTML = welcomeScreen();
    bindWelcome();
    return;
  }
  app.innerHTML = `
    ${topbar()}
    ${state.view === "map" ? mapScreen() : ""}
    ${state.view === "plot" ? plotScreen() : ""}
    ${state.view === "groups" ? groupsScreen() : ""}
    ${state.modal ? modalScreen() : ""}
    ${state.flash ? `<div class="flash" id="town-flash" role="status">${escapeHtml(state.flash)}</div>` : ""}
  `;
  bindChrome();
  if (state.view === "map") bindMap();
  if (state.view === "plot") bindPlot();
  if (state.view === "groups") bindGroups();
  if (state.modal) bindModal();
}

function topbar() {
  return `
    <header class="topbar">
      <div class="brand">
        <div>${avatarMarkup(state.me)}</div>
        <div>
          <h1 class="logo">Little Meetup</h1>
          <p class="tag">Hi ${escapeHtml(state.me.name)}. ${allPlots().length} / ${state.plotCap} plots.${isBanned() ? " You're banned from town chat." : ""}</p>
        </div>
      </div>
      <div class="nav-actions">
        ${createPlotButton()}
        <button class="btn ghost" data-go="map">Plots</button>
        <button class="btn ghost" data-go="groups">Groups</button>
        <button class="btn ghost" id="reset-me">New avatar</button>
      </div>
    </header>
  `;
}

function welcomeScreen() {
  const d = state.draft;
  return `
    <section class="card welcome screen">
      <div>
        <p class="tag">A tiny town for tiny avatars</p>
        <h1>Meet up on the plot you love.</h1>
        <p>Make a little you, plant a plot, then take it into the real world with a QR sign and a join code. Friends scan it, hang out online, or check in IRL.</p>
        <div class="form-grid">
          <label>Your name
            <input id="name-input" type="text" maxlength="16" value="${escapeHtml(d.name)}" placeholder="Pip, Mochi, you..." />
          </label>
          <div>
            <label>Body color</label>
            <div class="swatches">
              ${SKINS.map((color) => `
                <button class="swatch ${d.skin === color ? "active" : ""}" data-skin="${color}" style="background:${color}"></button>
              `).join("")}
            </div>
          </div>
          <div>
            <label>Face</label>
            <div class="picks">
              ${EYES.map((eye) => `
                <button class="pick ${d.eyes === eye.id ? "active" : ""}" data-eyes="${eye.id}">${eye.label}</button>
              `).join("")}
            </div>
          </div>
          <div>
            <label>Hat</label>
            <div class="picks">
              ${HATS.map((hat) => `
                <button class="pick ${d.hat === hat ? "active" : ""}" data-hat="${hat}">${hat === "none" ? "None" : hat}</button>
              `).join("")}
            </div>
          </div>
          <div>
            <label>Outfit</label>
            <div class="picks">
              ${OUTFITS.map((fit) => `
                <button class="pick ${ (d.outfit || "none") === fit.id ? "active" : ""}" data-outfit="${fit.id}">${fit.label}</button>
              `).join("")}
            </div>
          </div>
          <button class="btn berry" id="enter-world">Enter town</button>
        </div>
      </div>
      <div class="preview-stage">
        ${avatarMarkup({ ...d, name: d.name || "You" }, "lg")}
      </div>
    </section>
  `;
}

function mapScreen() {
  const plots = allPlots().filter((plot) => {
    const hay = `${plot.name} ${plot.blurb} ${plot.emoji} ${plot.code || ""}`.toLowerCase();
    const matchesQuery = hay.includes((state.query || "").toLowerCase());
    const matchesFilter = state.filter === "all"
      || (state.filter === "irl" && plotIrl(plot).on)
      || plot.category === state.filter;
    return matchesQuery && matchesFilter;
  });
  return `
    <section class="screen">
      <div class="stats">
        <div class="stat">${allPlots().length} / ${state.plotCap} plots</div>
        <div class="stat">${state.groups.length} groups</div>
        <div class="stat">${state.groups.filter((g) => g.members.includes(state.me.name)).length} joined</div>
        <div class="stat">${allPlots().filter((plot) => plotIrl(plot).on).length} IRL</div>
      </div>
      <div class="toolbar">
        <input class="search" id="plot-search" type="text" value="${escapeHtml(state.query)}" placeholder="Search plots or a join code..." />
        ${createPlotButton()}
      </div>
      <form class="join-code" id="join-code-form">
        <input name="code" maxlength="8" placeholder="Got a code from a poster? Type it here" autocomplete="off" />
        <button class="btn" type="submit">Open door</button>
      </form>
      <div class="filters">
        <button class="chip ${state.filter === "all" ? "active" : ""}" data-filter="all">All</button>
        <button class="chip ${state.filter === "irl" ? "active" : ""}" data-filter="irl">IRL</button>
        ${CATEGORIES.map((cat) => `
          <button class="chip ${state.filter === cat.id ? "active" : ""}" data-filter="${cat.id}">${cat.label}</button>
        `).join("")}
      </div>
      ${plots.length ? `
      <div class="plot-grid">
        ${plots.map((plot) => `
          <button class="card plot-card" data-plot="${plot.id}" style="background:${plot.ground}">
            <span class="num">#${String(plot.id).padStart(2, "0")}</span>
            <span class="yours">Yours</span>
            ${isPlotLive(plot.id) ? `<span class="live-pill card-live">LIVE</span>` : ""}
            ${plotIrl(plot).on ? `<span class="irl-pill card-irl">IRL</span>` : ""}
            <div>
              <div class="emoji">${plot.emoji}</div>
              <h3>${escapeHtml(plot.name)}</h3>
              <p>${escapeHtml(plot.blurb)}</p>
            </div>
          </button>
        `).join("")}
      </div>
      ` : `
      <div class="card empty-town">
        <div class="emoji" style="font-size:2.4rem">🌱</div>
        <h2>${allPlots().length ? "Nothing matches" : "No plots yet"}</h2>
        <p>${allPlots().length
          ? "Try another search or category."
          : "The town is empty until someone plants one. Name what you like, pick a vibe, and hang out there."}</p>
        ${allPlots().length ? "" : createPlotButton()}
      </div>
      `}
    </section>
  `;
}

function plotScreen() {
  const plot = findPlot(state.plotId);
  if (!plot) {
    state.view = "map";
    return mapScreen();
  }
  const cat = getCategory(plot.category) || { label: "Custom" };
  const people = getParkPeople(plot.id);
  const groups = state.groups.filter((g) => g.plotId === plot.id);
  const msgs = state.messages[plot.id] || [];
  const deco = decorations(plot);
  const live = getLive(plot.id);
  const teaching = Boolean(live?.on);
  const owner = isPlotOwner(plot);
  const teacher = canTeachOn(plot);
  return `
    <section class="screen">
      <div class="toolbar">
        <button class="btn ghost" data-go="map">← All plots</button>
        <div>
          <h2 style="margin:0">${teaching ? `<span class="live-pill">LIVE</span> ` : ""}${plot.emoji} ${escapeHtml(plot.name)}</h2>
          <p class="tag">Plot #${plot.id} · ${cat.label}${plot.owner ? ` · ${escapeHtml(plot.owner)}'s plot` : ""}${plot.code ? ` · code ${plot.code}` : ""} · click the park to walk over</p>
        </div>
        <div class="nav-actions">
          ${teacher && !teaching ? `<button class="btn berry go-live">Teach live</button>` : ""}
          <button class="btn ghost" id="open-phygital">Phygital</button>
          ${owner ? `<button class="btn ghost" id="pick-admins">Pick admins</button>` : ""}
          <button class="btn berry" id="open-group">Make a group here</button>
          ${owner ? `<button class="btn danger" id="delete-plot">Delete plot</button>` : ""}
        </div>
      </div>
      <div class="plot-layout">
        <div class="park" id="park" style="background:
          radial-gradient(circle at 20% 20%, rgba(255,255,255,.35), transparent 28%),
          linear-gradient(${plot.ground}, ${plot.color}55);">
          ${teaching ? `<div class="park-deco live-sign">LIVE class with ${escapeHtml(live.teacher || plot.owner || "a friend")}</div>` : ""}
          ${plotIrl(plot).on ? `<div class="park-deco irl-sign">IRL · ${escapeHtml(plotIrl(plot).place || "Meet in real life")}${plotIrl(plot).when ? ` · ${escapeHtml(plotIrl(plot).when)}` : ""}</div>` : ""}
          ${deco}
          ${people.map((person) => littleMarkup(person, person.id === "me")).join("")}
        </div>
        <aside class="side">
          ${phygitalPanel(plot, owner)}
          ${lessonPanel(plot, live, teacher, teaching)}
          <div class="card panel">
            <h3>Who's hanging out</h3>
            <div class="who">
              ${people.map((person) => `
                <div class="who-row">
                  ${avatarMarkup(person)}
                  <div>
                    <div class="who-name">
                      <strong>${escapeHtml(person.name)}</strong>
                      ${person.name === plot.owner ? `<span class="role-pill owner">Owner</span>` : isPlotAdmin(plot, person.name) ? `<span class="role-pill admin">Admin</span>` : ""}
                      ${isCheckedIn(plot.id, person.name) ? `<span class="role-pill irl">Here IRL</span>` : ""}
                    </div>
                    <div class="tag">${person.id === "me" ? "That's you" : teaching && person.name === live.teacher ? "Teaching live" : isCheckedIn(plot.id, person.name) ? "Checked in nearby" : "Visiting this plot"}</div>
                  </div>
                </div>
              `).join("")}
            </div>
          </div>
          <div class="card panel">
            <h3>Groups on this plot</h3>
            <div class="group-list">
              ${groups.length ? groups.map(groupRow).join("") : `<p class="empty">No groups yet. Be the first.</p>`}
            </div>
          </div>
          <div class="card panel">
            <h3>Plot chatter</h3>
            <div class="msg-list">
              ${msgs.length ? msgs.slice(-6).map((msg) => `
                <div class="msg ${msg.bot ? `bot ${msg.kind || ""}` : ""}"><strong>${escapeHtml(msg.name)}</strong><span>${escapeHtml(msg.text)}</span></div>
              `).join("") : `<p class="empty">Say hi. Someone will hear you.</p>`}
            </div>
            ${isBanned() ? `<p class="ban-note">You're banned from town chat. Safety Pip is keeping the town safe.</p>` : `
            <form class="compose" id="chat-form">
              <input name="text" maxlength="80" placeholder="Wave, joke, invite..." />
              <button class="btn" type="submit">Send</button>
            </form>
            `}
          </div>
        </aside>
      </div>
    </section>
  `;
}

function groupsScreen() {
  const mine = state.groups.filter((g) => g.members.includes(state.me.name));
  const listed = state.groups.filter((group) => findPlot(group.plotId));
  return `
    <section class="screen">
      <div class="toolbar">
        <div>
          <h2 style="margin:0">Groups</h2>
          <p class="tag">Make a club around what you like. Each group lives on one plot.</p>
        </div>
        <button class="btn berry" id="open-group">${allPlots().length ? "Start a group" : "Create a plot first"}</button>
      </div>
      <div class="stats">
        <div class="stat">You joined ${mine.length}</div>
        <div class="stat">${listed.length} open groups</div>
      </div>
      ${listed.length ? `
      <div class="group-list">
        ${listed.map((group) => {
          const plot = findPlot(group.plotId);
          return `
            <article class="card panel group-item">
              <div>
                <h3 style="margin:0 0 4px">${escapeHtml(group.name)}</h3>
                <p class="tag">${plot.emoji} ${escapeHtml(plot.name)} · ${group.members.length} members</p>
                <p>${escapeHtml(group.blurb)}</p>
                <p class="tag">${group.members.join(", ")}</p>
              </div>
              <div>
                ${joinButton(group)}
                <div style="height:8px"></div>
                <button class="btn ghost" data-plot="${plot.id}">Visit plot</button>
              </div>
            </article>
          `;
        }).join("")}
      </div>
      ` : `
      <div class="card empty-town">
        <h2>No groups yet</h2>
        <p>${allPlots().length ? "Start a group on one of your plots." : "Plant a plot first, then invite people who like the same thing."}</p>
        <button class="btn berry ${allPlots().length ? "" : "open-plot"}" ${allPlots().length ? 'id="open-group-empty"' : ""}>${allPlots().length ? "Start a group" : "Create a plot"}</button>
      </div>
      `}
    </section>
  `;
}

function groupRow(group) {
  return `
    <div class="group-item">
      <div>
        <strong>${escapeHtml(group.name)}</strong>
        <div class="tag">${group.members.length} members · ${escapeHtml(group.blurb)}</div>
      </div>
      ${joinButton(group)}
    </div>
  `;
}

function phygitalPanel(plot, owner) {
  const irl = plotIrl(plot);
  const here = isCheckedIn(plot.id, state.me.name);
  const door = shareUrl(plot);
  const hereNames = checkedInNames(plot.id);
  return `
    <div class="card panel phygital-panel">
      <h3>Phygital door</h3>
      <p class="tag">A real-world sign that opens this digital hangout.</p>
      <div class="code-row">
        <span class="join-code-big">${escapeHtml(plot.code || "------")}</span>
        <button class="btn ghost" id="copy-plot-code" type="button">Copy code</button>
      </div>
      <img class="qr" alt="QR code for this plot" src="${qrImageUrl(door)}" width="160" height="160" />
      ${irl.on ? `<p class="irl-note">Meet IRL${irl.place ? ` at ${escapeHtml(irl.place)}` : ""}${irl.when ? ` · ${escapeHtml(irl.when)}` : ""}</p>` : `<p class="tag">Digital only — turn on IRL if you're meeting in a real place.</p>`}
      <p class="tag">${hereNames.length ? `Here IRL: ${hereNames.map(escapeHtml).join(", ")}` : "Nobody has checked in nearby yet."}</p>
      <div class="nav-actions">
        <button class="btn ${here ? "ghost" : "berry"}" id="checkin-irl" type="button">${here ? "I'm here ✓" : "I'm here IRL"}</button>
        <button class="btn ghost" id="print-plot-sign" type="button">Print sign</button>
        ${owner ? `<button class="btn ghost" id="edit-irl" type="button">${irl.on ? "Edit IRL" : "Add IRL meetup"}</button>` : ""}
      </div>
    </div>
  `;
}

function lessonPanel(plot, live, teacher, teaching) {
  if (!teaching) {
    if (!teacher) return "";
    return `
      <div class="card panel lesson-panel">
        <h3>Teach live</h3>
        <p class="tag">Share what you learned. Friends on this plot can follow along.</p>
        <button class="btn berry go-live">Go live</button>
      </div>
    `;
  }
  const claps = live.claps || 0;
  const gotIt = Array.isArray(live.gotIt) ? live.gotIt : [];
  const learning = Array.isArray(live.learning) ? live.learning : [];
  const meName = state.me.name;
  const iGotIt = gotIt.includes(meName);
  const iLearn = learning.includes(meName);
  return `
    <div class="card panel lesson-panel on-air">
      <div class="lesson-head">
        <span class="live-pill">LIVE</span>
        <span class="tag">with ${escapeHtml(live.teacher || plot.owner || "a teacher")}</span>
      </div>
      ${teacher ? `
        <form id="live-update-form" class="form-grid">
          <label>Lesson title
            <input name="title" required maxlength="42" value="${escapeHtml(live.title)}" />
          </label>
          <label>What you learned / what you're teaching
            <textarea name="notes" required maxlength="280">${escapeHtml(live.notes)}</textarea>
          </label>
          <div class="nav-actions">
            <button class="btn berry" type="submit">Update lesson</button>
            <button class="btn ghost" type="button" id="end-live">End live</button>
          </div>
        </form>
      ` : `
        <h3 style="margin:8px 0 6px">${escapeHtml(live.title)}</h3>
        <p class="lesson-notes">${escapeHtml(live.notes)}</p>
      `}
      <p class="tag">${claps} claps · ${gotIt.length} got it · ${learning.length} learning</p>
      ${teacher ? "" : `
        <div class="nav-actions">
          <button class="btn ghost" id="live-clap">Clap</button>
          <button class="btn ${iLearn ? "ghost" : "berry"}" id="live-learn">${iLearn ? "Learning ✓" : "I'm learning"}</button>
          <button class="btn ${iGotIt ? "ghost" : ""}" id="live-gotit">${iGotIt ? "Got it ✓" : "Got it"}</button>
        </div>
      `}
    </div>
  `;
}

function joinButton(group) {
  const inGroup = group.members.includes(state.me.name);
  return `<button class="btn ${inGroup ? "ghost" : ""}" data-join="${group.id}">${inGroup ? "Leave" : "Join"}</button>`;
}

function modalScreen() {
  if (state.modal === "plot") return plotModal();
  if (state.modal === "delete") return deleteModal();
  if (state.modal === "live") return liveModal();
  if (state.modal === "admins") return adminsModal();
  if (state.modal === "phygital") return phygitalModal();
  if (state.modal === "irl") return irlModal();
  return groupModal();
}

function phygitalModal() {
  const plot = findPlot(state.plotId);
  if (!plot) return "";
  const door = shareUrl(plot);
  const irl = plotIrl(plot);
  return `
    <div class="modal-back" id="modal-back">
      <div class="card modal print-poster">
        <p class="tag">Phygital sign</p>
        <div class="poster-emoji">${plot.emoji}</div>
        <h2>${escapeHtml(plot.name)}</h2>
        <p>${escapeHtml(plot.blurb)}</p>
        <img class="qr lg" alt="QR code for this plot" src="${qrImageUrl(door)}" width="200" height="200" />
        <p class="join-code-big">${escapeHtml(plot.code || "------")}</p>
        <p class="tag">Scan the QR or type the code at Little Meetup to hang out here.</p>
        ${irl.on ? `<p class="irl-note">IRL${irl.place ? ` · ${escapeHtml(irl.place)}` : ""}${irl.when ? ` · ${escapeHtml(irl.when)}` : ""}</p>` : ""}
        <div class="nav-actions no-print">
          <button class="btn berry" type="button" id="print-now">Print this sign</button>
          <button class="btn ghost" type="button" id="close-modal">Close</button>
        </div>
      </div>
    </div>
  `;
}

function irlModal() {
  const plot = findPlot(state.plotId);
  if (!plot || !isPlotOwner(plot)) return "";
  const irl = plotIrl(plot);
  return `
    <div class="modal-back" id="modal-back">
      <form class="card modal" id="irl-form">
        <h2>IRL meetup</h2>
        <p class="tag">Tell friends where the digital plot meets the real world. Don't share a home address — Safety Pip will ban that.</p>
        <div class="form-grid">
          <label class="check-row">
            <input type="checkbox" name="on" ${irl.on ? "checked" : ""} />
            This plot has a real-world hangout
          </label>
          <label>Place
            <input name="place" maxlength="48" value="${escapeHtml(irl.place)}" placeholder="Library, cafe, school club..." />
          </label>
          <label>When
            <input name="when" maxlength="42" value="${escapeHtml(irl.when)}" placeholder="Saturdays after 3" />
          </label>
          <div class="nav-actions">
            <button class="btn berry" type="submit">Save IRL</button>
            <button class="btn ghost" type="button" id="close-modal">Not now</button>
          </div>
        </div>
      </form>
    </div>
  `;
}

function adminsModal() {
  const plot = findPlot(state.plotId);
  if (!plot || !isPlotOwner(plot)) return "";
  const names = plotPeopleNames(plot);
  const admins = plotAdmins(plot);
  return `
    <div class="modal-back" id="modal-back">
      <div class="card modal">
        <h2>Pick admins</h2>
        <p class="tag">Tap someone hanging out here to let them teach live. They still can't delete this plot or pick other admins.</p>
        <div class="picks admin-picks">
          ${names.length ? names.map((name) => `
            <button type="button" class="pick ${admins.includes(name) ? "active" : ""}" data-admin-name="${escapeHtml(name)}">${escapeHtml(name)}${admins.includes(name) ? " · Admin" : ""}</button>
          `).join("") : `<p class="empty">Nobody else is here yet. Wait for a visitor, then pick them.</p>`}
        </div>
        <p class="tag">${admins.length ? `Admins: ${admins.map(escapeHtml).join(", ")}` : "No admins yet."}</p>
        <div class="nav-actions">
          <button class="btn berry" type="button" id="close-modal">Done</button>
        </div>
      </div>
    </div>
  `;
}

function liveModal() {
  const plot = findPlot(state.plotId);
  if (!plot || !canTeachOn(plot)) return "";
  const prev = getLive(plot.id) || {};
  return `
    <div class="modal-back" id="modal-back">
      <form class="card modal" id="live-start-form">
        <h2>Go live and teach</h2>
        <p class="tag">Tell people what you learned. Anyone hanging out here can follow the lesson.</p>
        <div class="form-grid">
          <label>Lesson title
            <input name="title" required maxlength="42" value="${escapeHtml(prev.title || "")}" placeholder="How I finally got the hang of chords" />
          </label>
          <label>What you learned / what you're teaching
            <textarea name="notes" required maxlength="280" placeholder="Start with two notes. Hum them. Then try together.">${escapeHtml(prev.notes || "")}</textarea>
          </label>
          <div class="nav-actions">
            <button class="btn berry" type="submit">Start live</button>
            <button class="btn ghost" type="button" id="close-modal">Not now</button>
          </div>
        </div>
      </form>
    </div>
  `;
}

function deleteModal() {
  const plot = findPlot(state.plotId);
  if (!plot) return "";
  const groupCount = state.groups.filter((g) => Number(g.plotId) === Number(plot.id)).length;
  return `
    <div class="modal-back" id="modal-back">
      <div class="card modal">
        <h2>Delete ${plot.emoji} ${escapeHtml(plot.name)}?</h2>
        <p class="tag">This removes the plot${groupCount ? `, ${groupCount} group${groupCount === 1 ? "" : "s"},` : ""} and its chatter. You cannot undo it.</p>
        <div class="nav-actions">
          <button class="btn danger solid" id="confirm-delete">Delete plot</button>
          <button class="btn ghost" type="button" id="close-modal">Keep it</button>
        </div>
      </div>
    </div>
  `;
}

function groupModal() {
  const plots = allPlots();
  if (!plots.length) {
    return canCreatePlot() ? plotModal() : "";
  }
  const current = findPlot(state.plotId) || plots[0];
  return `
    <div class="modal-back" id="modal-back">
      <form class="card modal" id="group-form">
        <h2>Make a group</h2>
        <p class="tag">Pick the plot that matches the vibe, then invite people who like the same thing.</p>
        <div class="form-grid">
          <label>Group name
            <input name="name" required maxlength="28" placeholder="Midnight Pizza Club" />
          </label>
          <label>Lives on plot
            <select name="plotId">
              ${allPlots().map((plot) => `
                <option value="${plot.id}" ${plot.id === current.id ? "selected" : ""}>#${plot.id} ${escapeHtml(plot.name)}</option>
              `).join("")}
            </select>
          </label>
          <label>What you like
            <textarea name="blurb" required maxlength="120" placeholder="We meet to talk snacks, share playlists, and wave at strangers."></textarea>
          </label>
          <div class="nav-actions">
            <button class="btn berry" type="submit">Create group</button>
            <button class="btn ghost" type="button" id="close-modal">Not now</button>
          </div>
        </div>
      </form>
    </div>
  `;
}

function plotModal() {
  const theme = PLOT_THEMES[0];
  return `
    <div class="modal-back" id="modal-back">
      <form class="card modal" id="plot-form">
        <h2>Create a plot</h2>
        <p class="tag">Make a hangout for what you like. Friends can visit, walk around, and start groups here.</p>
        <div class="form-grid">
          <label>Plot name
            <input name="name" required maxlength="24" placeholder="Moonlit Dumpling Yard" />
          </label>
          <label>What people like here
            <textarea name="blurb" required maxlength="120" placeholder="Late-night dumplings, steam, and kind strangers."></textarea>
          </label>
          <label>Category
            <select name="category">
              ${CATEGORIES.map((cat) => `<option value="${cat.id}">${cat.label}</option>`).join("")}
            </select>
          </label>
          <div>
            <label>Emoji</label>
            <div class="picks" id="plot-emojis">
              ${PLOT_EMOJIS.map((emoji, i) => `
                <button type="button" class="pick ${i === 0 ? "active" : ""}" data-plot-emoji="${emoji}">${emoji}</button>
              `).join("")}
            </div>
            <input type="hidden" name="emoji" value="${PLOT_EMOJIS[0]}" />
          </div>
          <div>
            <label>Color</label>
            <div class="swatches" id="plot-colors">
              ${PLOT_THEMES.map((item, i) => `
                <button type="button" class="swatch ${i === 0 ? "active" : ""}" data-plot-color="${item.color}" data-plot-ground="${item.ground}" style="background:${item.color}"></button>
              `).join("")}
            </div>
            <input type="hidden" name="color" value="${theme.color}" />
            <input type="hidden" name="ground" value="${theme.ground}" />
          </div>
          <div class="nav-actions">
            <button class="btn berry" type="submit">Plant this plot</button>
            <button class="btn ghost" type="button" id="close-modal">Not now</button>
          </div>
        </div>
      </form>
    </div>
  `;
}

function decorations(plot) {
  const rand = seed(plot.id * 9);
  return Array.from({ length: 8 }, (_, i) => {
    const glyphs = [plot.emoji, "🌳", "🌼", "☁️", "🪨"];
    const glyph = glyphs[Math.floor(rand() * glyphs.length)];
    const left = 6 + rand() * 88;
    const top = 8 + rand() * 78;
    return `<div class="park-deco tree" style="left:${left}%; top:${top}%; font-size:${1.4 + rand()}rem">${glyph}</div>`;
  }).join("");
}

function getParkPeople(plotId) {
  const visitors = visitorsFor(plotId);
  const me = {
    ...state.me,
    id: "me",
    x: state.me.x ?? 50,
    y: state.me.y ?? 62,
  };
  return [me, ...visitors];
}

function syncDraftName() {
  const typed = document.getElementById("name-input")?.value;
  if (typeof typed === "string") state.draft.name = typed;
}

function bindWelcome() {
  document.getElementById("name-input").addEventListener("input", (e) => {
    state.draft.name = e.target.value;
  });
  document.querySelectorAll("[data-skin]").forEach((btn) => {
    btn.addEventListener("click", () => {
      syncDraftName();
      state.draft.skin = btn.dataset.skin;
      render();
      document.getElementById("name-input")?.focus();
    });
  });
  document.querySelectorAll("[data-eyes]").forEach((btn) => {
    btn.addEventListener("click", () => {
      syncDraftName();
      state.draft.eyes = btn.dataset.eyes;
      render();
    });
  });
  document.querySelectorAll("[data-hat]").forEach((btn) => {
    btn.addEventListener("click", () => {
      syncDraftName();
      state.draft.hat = btn.dataset.hat;
      render();
    });
  });
  document.querySelectorAll("[data-outfit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      syncDraftName();
      state.draft.outfit = btn.dataset.outfit;
      render();
    });
  });
  document.getElementById("enter-world").addEventListener("click", () => {
    const typed = document.getElementById("name-input")?.value || "";
    const name = typed.trim() || state.draft.name.trim() || "Little One";
    state.draft.name = name;
    state.me = {
      ...state.draft,
      name,
      x: 48,
      y: 64,
    };
    state.view = "map";
    save();
    consumePhygitalLink();
    if (state.view !== "plot" && !state.portaling) render();
  });
}

function bindChrome() {
  document.querySelectorAll("[data-go]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.view = btn.dataset.go;
      state.modal = null;
      render();
    });
  });
  document.getElementById("reset-me")?.addEventListener("click", () => {
    state.me = null;
    state.view = "welcome";
    render();
  });
  document.querySelectorAll("#open-group, #open-group-empty").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.modal = allPlots().length ? "group" : (canCreatePlot() ? "plot" : "group");
      render();
    });
  });
  document.querySelectorAll(".go-live").forEach((btn) => {
    btn.addEventListener("click", () => {
      const plot = findPlot(state.plotId);
      if (!canTeachOn(plot)) return;
      state.modal = "live";
      render();
    });
  });
  document.getElementById("end-live")?.addEventListener("click", () => endLive(state.plotId));
  document.getElementById("live-clap")?.addEventListener("click", () => clapLive(state.plotId));
  document.getElementById("live-learn")?.addEventListener("click", () => toggleLearn(state.plotId));
  document.getElementById("live-gotit")?.addEventListener("click", () => toggleGotIt(state.plotId));
  document.getElementById("live-update-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    updateLive(state.plotId, data.get("title").toString().trim(), data.get("notes").toString().trim());
  });
  document.getElementById("pick-admins")?.addEventListener("click", () => {
    if (!isPlotOwner(findPlot(state.plotId))) return;
    state.modal = "admins";
    render();
  });
  document.querySelectorAll("[data-admin-name]").forEach((btn) => {
    btn.addEventListener("click", () => toggleAdmin(state.plotId, btn.dataset.adminName));
  });
  document.getElementById("delete-plot")?.addEventListener("click", () => {
    if (!isPlotOwner(findPlot(state.plotId))) return;
    state.modal = "delete";
    render();
  });
  document.querySelectorAll(".open-plot").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!canCreatePlot()) return;
      state.modal = "plot";
      render();
    });
  });
  document.querySelectorAll("[data-join]").forEach((btn) => {
    btn.addEventListener("click", () => toggleJoin(btn.dataset.join));
  });
  document.querySelectorAll("[data-plot]").forEach((btn) => {
    btn.addEventListener("click", () => enterPlot(Number(btn.dataset.plot)));
  });
  document.getElementById("open-phygital")?.addEventListener("click", () => {
    state.modal = "phygital";
    render();
  });
  document.getElementById("edit-irl")?.addEventListener("click", () => {
    if (!isPlotOwner(findPlot(state.plotId))) return;
    state.modal = "irl";
    render();
  });
  document.getElementById("copy-plot-code")?.addEventListener("click", () => copyPlotCode());
  document.getElementById("print-plot-sign")?.addEventListener("click", () => {
    state.modal = "phygital";
    render();
  });
  document.getElementById("print-now")?.addEventListener("click", () => window.print());
  document.getElementById("checkin-irl")?.addEventListener("click", () => toggleCheckin(state.plotId));
}

function bindMap() {
  const search = document.getElementById("plot-search");
  if (!search) return;
  search.addEventListener("input", (e) => {
    state.query = e.target.value;
    const active = document.activeElement === e.target;
    const start = e.target.selectionStart;
    render();
    if (active) {
      const next = document.getElementById("plot-search");
      next?.focus();
      next?.setSelectionRange(start, start);
    }
  });
  document.querySelectorAll("[data-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.filter = btn.dataset.filter;
      render();
    });
  });
  document.getElementById("join-code-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const code = normalizeCode(new FormData(e.target).get("code"));
    if (!joinPhygital(code, "")) {
      showFlash("No plot found for that code.");
      render();
    }
  });
}

function bindPlot() {
  const park = document.getElementById("park");
  if (!park) return;
  park.addEventListener("click", (e) => {
    const box = park.getBoundingClientRect();
    state.me.x = ((e.clientX - box.left) / box.width) * 100;
    state.me.y = ((e.clientY - box.top) / box.height) * 100;
    save();
    const you = park.querySelector(".little.you");
    if (you) {
      you.style.left = `${state.me.x}%`;
      you.style.top = `${state.me.y}%`;
    }
  });
  document.getElementById("chat-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = new FormData(e.target).get("text").toString().trim();
    if (!text) return;
    if (applyModeration(text, state.plotId) !== "ok") {
      render();
      return;
    }
    const list = state.messages[state.plotId] || [];
    list.push({ name: state.me.name, text });
    state.messages[state.plotId] = list.slice(-20);
    save();
    render();
  });
  wanderVisitors();
}

function bindGroups() {
  /* joins and plot visits bound in chrome */
}

function bindModal() {
  document.getElementById("close-modal")?.addEventListener("click", () => {
    state.modal = null;
    render();
  });
  document.getElementById("modal-back")?.addEventListener("click", (e) => {
    if (e.target.id === "modal-back") {
      state.modal = null;
      render();
    }
  });
  document.querySelectorAll("[data-plot-emoji]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const form = document.getElementById("plot-form");
      form.emoji.value = btn.dataset.plotEmoji;
      document.querySelectorAll("[data-plot-emoji]").forEach((el) => el.classList.toggle("active", el === btn));
    });
  });
  document.querySelectorAll("[data-plot-color]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const form = document.getElementById("plot-form");
      form.color.value = btn.dataset.plotColor;
      form.ground.value = btn.dataset.plotGround;
      document.querySelectorAll("[data-plot-color]").forEach((el) => el.classList.toggle("active", el === btn));
    });
  });
  document.getElementById("group-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    state.groups.unshift({
      id: uid("g"),
      name: data.get("name").toString().trim(),
      plotId: Number(data.get("plotId")),
      blurb: data.get("blurb").toString().trim(),
      members: [state.me.name],
    });
    state.modal = null;
    state.view = "groups";
    save();
    render();
  });
  document.getElementById("confirm-delete")?.addEventListener("click", () => {
    deletePlot(state.plotId);
  });
  document.getElementById("live-start-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    startLive(state.plotId, data.get("title").toString().trim(), data.get("notes").toString().trim());
  });
  document.getElementById("irl-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    saveIrlMeetup(state.plotId, new FormData(e.target));
  });
  document.getElementById("print-now")?.addEventListener("click", () => window.print());
  document.getElementById("plot-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!canCreatePlot()) {
      state.modal = null;
      render();
      return;
    }
    const data = new FormData(e.target);
    const name = data.get("name").toString().trim();
    const blurb = data.get("blurb").toString().trim();
    const naming = moderateText(`${name} ${blurb}`);
    if (naming.action === "block") {
      showFlash("Please pick a kind plot name. Swears aren't allowed.");
      render();
      return;
    }
    if (naming.action !== "ok") {
      applyModeration(`${name} ${blurb}`, state.plotId);
      state.modal = naming.action === "ban" ? null : state.modal;
      render();
      return;
    }
    const plot = {
      id: nextPlotId(),
      name,
      blurb,
      category: data.get("category").toString(),
      emoji: data.get("emoji").toString() || "🌈",
      color: data.get("color").toString() || PLOT_THEMES[0].color,
      ground: data.get("ground").toString() || PLOT_THEMES[0].ground,
      custom: true,
      owner: state.me.name,
      admins: [],
      code: makePlotCode(usedCodes(allPlots())),
      irl: emptyIrl(),
    };
    state.customPlots.unshift(plot);
    const opened = expandIfFull();
    if (opened) showFlash(`${opened} new plots opened up!`);
    state.modal = null;
    state.filter = "all";
    state.query = "";
    save();
    enterPlot(plot.id);
    if (state.view !== "plot" && !state.portaling) render();
  });
}

function deletePlot(id) {
  const plotId = Number(id);
  if (!isPlotOwner(findPlot(plotId))) return;
  state.customPlots = state.customPlots.filter((plot) => Number(plot.id) !== plotId);
  state.groups = state.groups.filter((group) => Number(group.plotId) !== plotId);
  Object.keys(state.messages).forEach((key) => {
    if (Number(key) === plotId) delete state.messages[key];
  });
  delete state.lives[liveKey(plotId)];
  if (state.checkins) delete state.checkins[String(plotId)];
  state.modal = null;
  state.view = "map";
  state.plotId = allPlots()[0]?.id || 1;
  save();
  render();
}

function toggleAdmin(plotId, name) {
  const plot = findPlot(plotId);
  if (!isPlotOwner(plot) || !name || name === plot.owner) return;
  if (!Array.isArray(plot.admins)) plot.admins = [];
  if (plot.admins.includes(name)) {
    plot.admins = plot.admins.filter((admin) => admin !== name);
  } else {
    plot.admins.push(name);
  }
  save();
  render();
}

function startLive(plotId, title, notes) {
  const plot = findPlot(plotId);
  if (!canTeachOn(plot) || !title || !notes) return;
  if (applyModeration(`${title} ${notes}`, plotId) !== "ok") {
    state.modal = null;
    render();
    return;
  }
  if (!state.lives) state.lives = {};
  const prev = getLive(plotId) || {};
  state.lives[liveKey(plotId)] = {
    on: true,
    title,
    notes,
    teacher: state.me.name,
    claps: prev.claps || 0,
    gotIt: prev.gotIt || [],
    learning: prev.learning || [],
  };
  state.modal = null;
  save();
  showFlash("You're live — teach what you learned!");
  render();
}

function endLive(plotId) {
  const plot = findPlot(plotId);
  if (!canTeachOn(plot)) return;
  const live = getLive(plotId);
  if (!live) return;
  live.on = false;
  save();
  render();
}

function updateLive(plotId, title, notes) {
  const plot = findPlot(plotId);
  const live = getLive(plotId);
  if (!canTeachOn(plot) || !live?.on || !title || !notes) return;
  if (applyModeration(`${title} ${notes}`, plotId) !== "ok") {
    if (isBanned()) endLive(plotId);
    render();
    return;
  }
  live.title = title;
  live.notes = notes;
  save();
  showFlash("Lesson updated");
  render();
}

function clapLive(plotId) {
  const live = getLive(plotId);
  if (!live?.on) return;
  live.claps = (live.claps || 0) + 1;
  save();
  render();
}

function toggleNameList(list, name) {
  const next = Array.isArray(list) ? [...list] : [];
  const i = next.indexOf(name);
  if (i >= 0) next.splice(i, 1);
  else next.push(name);
  return next;
}

function toggleLearn(plotId) {
  const live = getLive(plotId);
  if (!live?.on || canTeachOn(findPlot(plotId))) return;
  live.learning = toggleNameList(live.learning, state.me.name);
  save();
  render();
}

function toggleGotIt(plotId) {
  const live = getLive(plotId);
  if (!live?.on || canTeachOn(findPlot(plotId))) return;
  live.gotIt = toggleNameList(live.gotIt, state.me.name);
  save();
  render();
}

function findPlotByCode(code) {
  const needle = normalizeCode(code);
  if (!needle) return null;
  return allPlots().find((plot) => normalizeCode(plot.code) === needle) || null;
}

function isCheckedIn(plotId, name) {
  const bag = state.checkins?.[String(plotId)];
  return Boolean(bag && name && bag[name]);
}

function checkedInNames(plotId) {
  const bag = state.checkins?.[String(plotId)] || {};
  return Object.keys(bag).filter((name) => bag[name]);
}

function toggleCheckin(plotId) {
  if (!state.me?.name || !findPlot(plotId)) return;
  if (!state.checkins) state.checkins = {};
  const key = String(plotId);
  if (!state.checkins[key]) state.checkins[key] = {};
  const here = Boolean(state.checkins[key][state.me.name]);
  if (here) delete state.checkins[key][state.me.name];
  else state.checkins[key][state.me.name] = true;
  save();
  showFlash(here ? "Checked out of IRL" : "You're here in real life.");
  render();
}

function copyPlotCode() {
  const plot = findPlot(state.plotId);
  if (!plot?.code) return;
  const text = `${plot.code} · ${shareUrl(plot)}`;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showFlash("Code and door link copied");
      render();
    }).catch(() => {
      showFlash(plot.code);
      render();
    });
    return;
  }
  showFlash(plot.code);
  render();
}

function saveIrlMeetup(plotId, data) {
  const plot = findPlot(plotId);
  if (!isPlotOwner(plot)) return;
  const place = data.get("place")?.toString().trim() || "";
  const when = data.get("when")?.toString().trim() || "";
  const on = data.get("on") === "on" || data.get("on") === "true";
  if (applyModeration(`${place} ${when}`, plotId) !== "ok") {
    state.modal = null;
    render();
    return;
  }
  plot.irl = { on, place, when };
  state.modal = null;
  save();
  showFlash(on ? "IRL meetup is on this plot" : "Plot is digital-only again");
  render();
}

function importPackedPlot(data) {
  const verdict = moderateText(`${data.name} ${data.blurb} ${data.irl?.place || ""}`);
  if (verdict.action === "ban") {
    showFlash("That plot sign was blocked to keep the town safe.");
    return null;
  }
  if (verdict.action === "block") {
    showFlash("That plot name isn't allowed. Swears stay out of town.");
    return null;
  }
  const plot = {
    id: nextPlotId(),
    name: String(data.name).slice(0, 28),
    blurb: String(data.blurb || "A phygital hangout.").slice(0, 120),
    category: CATEGORIES.some((cat) => cat.id === data.category) ? data.category : "cozy",
    emoji: data.emoji || "🌈",
    color: data.color || "#7b61ff",
    ground: data.ground || "#d9d2ff",
    custom: true,
    guest: data.owner !== state.me.name,
    owner: data.owner || "A friend",
    admins: [],
    code: normalizeCode(data.code) || makePlotCode(usedCodes(allPlots())),
    irl: plotIrl(data),
  };
  state.customPlots.unshift(plot);
  expandIfFull();
  save();
  return plot;
}

function joinPhygital(code, pack) {
  const existing = findPlotByCode(code);
  if (existing) {
    enterPlot(existing.id);
    return true;
  }
  const data = pack ? unpackPlot(pack) : null;
  if (data) {
    const again = findPlotByCode(data.code);
    if (again) {
      enterPlot(again.id);
      return true;
    }
    const imported = importPackedPlot(data);
    if (imported) {
      enterPlot(imported.id);
      return true;
    }
    return false;
  }
  return false;
}

function consumePhygitalLink() {
  const fromUrl = readLinkParams();
  let pending = fromUrl.join || fromUrl.pack ? fromUrl : takePending();
  if (!pending?.join && !pending?.pack) return;
  if (!state.me) {
    stashPending(pending);
    return;
  }
  clearLinkParams();
  if (joinPhygital(pending.join, pending.pack)) {
    showFlash("Phygital door opened.");
  } else if (pending.join || pending.pack) {
    showFlash("That door code didn't open a plot.");
    render();
  }
}

function enterPlot(id) {
  const plotId = Number(id);
  const plot = findPlot(plotId);
  if (!plot) return;
  if (state.portaling) {
    clearPortal();
  }
  const skipMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (skipMotion) {
    landOnPlot(plotId);
    return;
  }
  state.portaling = true;
  try {
    playPortal(plot, () => {
      landOnPlot(plotId);
    });
  } catch {
    clearPortal();
    landOnPlot(plotId);
  }
}

function landOnPlot(id) {
  state.plotId = id;
  state.view = "plot";
  state.modal = null;
  state.me.x = 50;
  state.me.y = 62;
  save();
  render();
}

function clearPortal() {
  window.clearTimeout(playPortal.mid);
  window.clearTimeout(playPortal.end);
  const layer = document.getElementById("portal");
  if (layer) {
    layer.className = "portal";
    layer.hidden = true;
    layer.innerHTML = "";
  }
  state.portaling = false;
}

function playPortal(plot, onOpen) {
  const layer = document.getElementById("portal");
  if (!layer) {
    onOpen();
    state.portaling = false;
    return;
  }
  layer.hidden = false;
  layer.removeAttribute("hidden");
  layer.className = "portal play";
  layer.style.setProperty("--portal", plot.color || "#7b61ff");
  layer.style.setProperty("--portal-ground", plot.ground || "#ffe8a3");
  layer.innerHTML = `
    <div class="portal-stage">
      <div class="portal-well">
        <div class="portal-ring"></div>
        <div class="portal-ring two"></div>
      </div>
      <div class="portal-emoji">${plot.emoji || "🌈"}</div>
    </div>
  `;
  window.clearTimeout(playPortal.mid);
  window.clearTimeout(playPortal.end);
  playPortal.mid = window.setTimeout(() => {
    try {
      onOpen();
    } catch {
      clearPortal();
      return;
    }
    layer.classList.add("open");
  }, 400);
  playPortal.end = window.setTimeout(() => {
    clearPortal();
  }, 800);
}

function toggleJoin(id) {
  const group = state.groups.find((g) => g.id === id);
  if (!group) return;
  if (group.members.includes(state.me.name)) {
    group.members = group.members.filter((name) => name !== state.me.name);
  } else {
    group.members.push(state.me.name);
  }
  save();
  render();
}

let wanderTimer = 0;
function wanderVisitors() {
  clearInterval(wanderTimer);
  wanderTimer = setInterval(() => {
    const park = document.getElementById("park");
    if (!park || state.view !== "plot") {
      clearInterval(wanderTimer);
      return;
    }
    park.querySelectorAll(".little:not(.you)").forEach((node) => {
      if (Math.random() > 0.45) return;
      const x = 12 + Math.random() * 76;
      const y = 24 + Math.random() * 62;
      node.style.left = `${x}%`;
      node.style.top = `${y}%`;
    });
  }, 1800);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

render();
consumePhygitalLink();
