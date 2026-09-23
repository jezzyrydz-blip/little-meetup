const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PENDING_KEY = "little-meetup-join";

export function makePlotCode(existing = []) {
  const taken = new Set(existing.map((code) => normalizeCode(code)));
  for (let i = 0; i < 50; i += 1) {
    let code = "";
    for (let j = 0; j < 6; j += 1) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    if (!taken.has(code)) return code;
  }
  return `P${Date.now().toString(36).slice(-5).toUpperCase()}`;
}

export function normalizeCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

export function usedCodes(plots) {
  return (plots || []).map((plot) => plot.code);
}

export function ensurePlotCode(plot, plots) {
  const code = normalizeCode(plot.code);
  if (code.length >= 4) {
    plot.code = code;
    return plot;
  }
  plot.code = makePlotCode(usedCodes(plots).filter((item) => item !== plot.code));
  return plot;
}

export function emptyIrl() {
  return { on: false, place: "", when: "" };
}

export function plotIrl(plot) {
  const irl = plot?.irl && typeof plot.irl === "object" ? plot.irl : emptyIrl();
  return {
    on: Boolean(irl.on),
    place: String(irl.place || ""),
    when: String(irl.when || ""),
  };
}

export function packPlot(plot) {
  const irl = plotIrl(plot);
  const data = {
    v: 1,
    name: plot.name,
    blurb: plot.blurb,
    category: plot.category,
    emoji: plot.emoji,
    color: plot.color,
    ground: plot.ground,
    owner: plot.owner,
    code: normalizeCode(plot.code),
    irl,
  };
  return btoa(unescape(encodeURIComponent(JSON.stringify(data)))).replace(/=+$/g, "");
}

export function unpackPlot(pack) {
  try {
    const padded = String(pack || "").replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    const json = decodeURIComponent(escape(atob(padded + pad)));
    const data = JSON.parse(json);
    if (!data || data.v !== 1 || !data.name || !normalizeCode(data.code)) return null;
    return { ...data, code: normalizeCode(data.code), irl: plotIrl(data) };
  } catch {
    return null;
  }
}

export function shareUrl(plot) {
  const url = new URL(location.href);
  url.hash = "";
  url.search = "";
  url.searchParams.set("join", plot.code);
  url.searchParams.set("pack", packPlot(plot));
  return url.toString();
}

export function qrImageUrl(data) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(data)}`;
}

export function readLinkParams() {
  const url = new URL(location.href);
  return {
    join: normalizeCode(url.searchParams.get("join") || ""),
    pack: url.searchParams.get("pack") || "",
  };
}

export function clearLinkParams() {
  const url = new URL(location.href);
  if (!url.searchParams.has("join") && !url.searchParams.has("pack")) return;
  url.searchParams.delete("join");
  url.searchParams.delete("pack");
  const search = url.searchParams.toString();
  history.replaceState({}, "", `${url.pathname}${search ? `?${search}` : ""}${url.hash}`);
}

export function stashPending(pending) {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
}

export function takePending() {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
