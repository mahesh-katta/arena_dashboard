/* Data loading, progress persistence, and the filter model.
   Nothing in here renders; the views read from it. */

export const PACE = 36;                  // prelims pace: 60 min / 100 questions
const LS_KEY = "area.progress.v1";

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const fmt = (s) =>
  s < 60 ? s.toFixed(1) + "s" : Math.floor(s / 60) + "m " + Math.round(s % 60) + "s";
export const pace = (s) => (s <= PACE ? "fast" : s <= PACE * 2 ? "ok" : "slow");
export const qKey = (q) => q.set + "#" + q.q_no;
export const imgSrc = (p) => "data/" + p;
export const pdfSrc = (slug) => "data/guidely-pdfs/" + encodeURIComponent(slug) + ".pdf";

/* Questions that share a passage — or a chart image, which is the same thing
   when the data lives in a picture — are one block: you read the stimulus once
   and answer everything hanging off it. */
export function blockKey(q) {
  if (q.passage) return "p\u0000" + q.set + "\u0000" + q.passage;
  if (q.img && q.img.length) return "i\u0000" + q.set + "\u0000" + q.img.join("|");
  return "s\u0000" + q.set + "\u0000" + q.q_no;
}

/* Measured, never hand-listed: a topic is "standalone" when most of its
   questions stand on their own, "grouped" when most hang off a shared stimulus.
   Repair an extraction and a topic moves sides on its own. */
export function computeShape(questions, sets) {
  const per = new Map();
  for (const q of questions) {
    let m = per.get(q.set);
    if (!m) per.set(q.set, (m = new Map()));
    const k = blockKey(q);
    m.set(k, (m.get(k) || 0) + 1);
  }
  const agg = {};
  for (const q of questions) {
    const t = (sets[q.set] || {}).topic || "";
    const a = agg[t] || (agg[t] = [0, 0]);
    a[0]++;
    if (per.get(q.set).get(blockKey(q)) > 1) a[1]++;
  }
  const shape = {};
  for (const t in agg)
    shape[t] = { n: agg[t][0], shared: agg[t][1], standalone: agg[t][1] / agg[t][0] < 0.5 };
  return shape;
}

async function fetchJSON(url, onProgress) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + " -> " + r.status);
  const total = +(r.headers.get("content-length") || 0);
  if (!r.body || !total || !onProgress) return r.json();
  const rd = r.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress(got / total);
  }
  const buf = new Uint8Array(got);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.length; }
  return JSON.parse(new TextDecoder().decode(buf));
}

export async function loadData(onProgress) {
  const sets = await fetchJSON("data/sets.json");
  onProgress(0.04);
  const questions = await fetchJSON("data/questions.json", (f) => onProgress(0.04 + f * 0.96));
  const bySet = {};
  questions.forEach((q, i) => {
    q._i = i;
    (bySet[q.set] || (bySet[q.set] = [])).push(q);
  });
  return { sets, questions, bySet, shape: computeShape(questions, sets) };
}

/* ---------------- progress ----------------
   An append-only log of attempts grouped into sessions, plus a flag list.
   Everything Stats shows is derived from it, never stored. It lives in
   progress.json beside the app, so the history is the same in every browser and
   on your phone over wifi; localStorage is the fallback when the server is off. */
export class Progress {
  constructor() {
    this.attempts = [];
    this.sessions = [];
    this.flags = new Set();
    this.api = true;
    this.pending = [];
    this.flushT = null;
    this.listeners = new Set();
  }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach((f) => f()); }

  async load() {
    try {
      const r = await fetch("api/progress", { cache: "no-store" });
      if (!r.ok) throw 0;
      const d = await r.json();
      this.attempts = d.attempts || [];
      this.sessions = d.sessions || [];
      this.flags = new Set(d.flags || []);
      this.api = true;
      this.emit();
      return;
    } catch (e) { this.api = false; }
    try {
      const d = JSON.parse(localStorage.getItem(LS_KEY)) || {};
      this.attempts = d.attempts || [];
      this.sessions = d.sessions || [];
      this.flags = new Set(d.flags || []);
    } catch { /* first run */ }
    this.emit();
  }
  mirror() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        attempts: this.attempts, sessions: this.sessions, flags: [...this.flags],
      }));
      return true;
    } catch (e) { return false; }
  }
  record(rec) {
    this.attempts.push(rec);
    this.pending.push(rec);
    this.mirror();
    clearTimeout(this.flushT);
    this.flushT = setTimeout(() => this.flush(), 700);
    this.emit();
  }
  startSession(s) { this.sessions.push(s); this.mirror(); }
  endSession(sid, done) {
    const s = this.sessions.find((x) => x.sid === sid);
    if (s) { s.ended = Date.now(); s.done = done; }
    this.mirror();
    this.flush();
  }
  toggleFlag(key) {
    this.flags.has(key) ? this.flags.delete(key) : this.flags.add(key);
    this.mirror();
    this.flush(true);
    this.emit();
  }
  async flush(withFlags) {
    if (!this.api) return;
    const batch = this.pending.slice();
    if (!batch.length && !withFlags) return;
    const body = { attempts: batch, sessions: this.sessions.slice(-3) };
    if (withFlags) body.flags = [...this.flags];
    try {
      const r = await fetch("api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw 0;
      this.pending = this.pending.filter((p) => !batch.includes(p));
    } catch (e) { /* stays queued; the next flush retries */ }
  }
  async wipe(query) {
    if (this.api) {
      try { await fetch("api/progress" + (query ? "?" + query : ""), { method: "DELETE" }); } catch {}
      await this.load();
      return;
    }
    if (!query) { this.attempts = []; this.sessions = []; this.flags = new Set(); }
    else if (query.startsWith("topic=")) {
      const t = decodeURIComponent(query.slice(6));
      this.attempts = this.attempts.filter((a) => a.topic !== t);
    } else if (query.startsWith("sid=")) {
      const v = query.slice(4);
      this.attempts = this.attempts.filter((a) => a.sid !== v);
      this.sessions = this.sessions.filter((s) => s.sid !== v);
    }
    this.mirror();
    this.emit();
  }
  async replaceAll(doc) {
    this.attempts = doc.attempts || [];
    this.sessions = doc.sessions || [];
    this.flags = new Set(doc.flags || []);
    if (this.api) {
      await fetch("api/progress", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replace: true, attempts: this.attempts, sessions: this.sessions, flags: [...this.flags] }),
      });
      await this.load();
    } else { this.mirror(); this.emit(); }
  }
}

/* ---------------- the filter ---------------- */
export const emptyFilter = () => ({
  sections: [], topics: [], subtopics: [],
  standalone: false, grouped: false,
  limit: 20, order: "shuffle", mode: "unseen", style: "practice",
});

export function presetTopics(shape, wantStandalone) {
  return Object.keys(shape).filter((t) => shape[t].standalone === wantStandalone);
}

/* A pick you cannot see must not still be filtering: Topic is hidden until a
   section or preset is on, Subtopic until a topic is. */
export function prune(F, sets) {
  const all = Object.values(sets);
  if (F.sections.length)
    F.topics = F.topics.filter((t) => all.some((s) => s.topic === t && F.sections.includes(s.section)));
  if (F.sections.length || F.topics.length)
    F.subtopics = F.subtopics.filter((st) => all.some((s) =>
      s.subtopic === st &&
      (!F.sections.length || F.sections.includes(s.section)) &&
      (!F.topics.length || F.topics.includes(s.topic))));
  if (!F.sections.length && !F.standalone && !F.grouped) { F.topics = []; F.subtopics = []; }
  if (!F.topics.length) F.subtopics = [];
  return F;
}

export function matchingSets(F, sets) {
  return Object.entries(sets).filter(([, s]) =>
    (!F.sections.length || F.sections.includes(s.section)) &&
    (!F.topics.length || F.topics.includes(s.topic)) &&
    (!F.subtopics.length || F.subtopics.includes(s.subtopic)));
}

export function pool(F, data, progress) {
  const seen = new Set(progress.attempts.map((a) => a.set + "#" + a.q_no));
  let qs = [];
  for (const [slug] of matchingSets(F, data.sets)) qs = qs.concat(data.bySet[slug] || []);
  if (F.mode === "unseen") qs = qs.filter((q) => !seen.has(qKey(q)));
  else if (F.mode === "wrong") {
    const bad = new Set(progress.attempts.filter((a) => a.correct === false).map((a) => a.set + "#" + a.q_no));
    qs = qs.filter((q) => bad.has(qKey(q)));
  } else if (F.mode === "flagged") qs = qs.filter((q) => progress.flags.has(qKey(q)));
  return qs;
}

/* Blocks are shuffled, never the questions inside one: you read the chart once
   and answer everything hanging off it. */
export function buildBlocks(avail, F) {
  const map = new Map();
  for (const q of avail) {
    const k = blockKey(q);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(q);
  }
  let bs = [...map.values()];
  bs.forEach((b) => b.sort((a, c) => a.q_no - c.q_no));
  if (F.order === "shuffle")
    for (let i = bs.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [bs[i], bs[j]] = [bs[j], bs[i]];
    }
  else
    bs.sort((a, b) => (a[0].set === b[0].set ? a[0].q_no - b[0].q_no : a[0].set < b[0].set ? -1 : 1));

  const chosen = [];
  let n = 0;
  for (const b of bs) {
    if (F.limit && n && n + b.length > F.limit) break;   // keep blocks whole
    chosen.push(b);
    n += b.length;
    if (F.limit && n >= F.limit) break;
  }
  return { blocks: chosen, total: n };
}
