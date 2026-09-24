/* Data loading, progress persistence, and the filter model.
   Nothing in here renders; the views read from it. */

import { idbGet, idbSet, migrateFromLocalStorage } from "./local.js";

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
      this.api = true;
      this.emit();
      return;
    } catch (e) { this.api = false; }
    // no server: this device is the only copy
    const d = await migrateFromLocalStorage("progress", LS_KEY, { attempts: [], sessions: [] });
    this.attempts = d.attempts || [];
    this.sessions = d.sessions || [];
    this.emit();
  }
  mirror() {
    if (this.api) return true;            // the server is the record
    idbSet("progress", { attempts: this.attempts, sessions: this.sessions });
    return true;
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
  async flush() {
    if (!this.api) return;
    const batch = this.pending.slice();
    if (!batch.length) return;
    const body = { attempts: batch, sessions: this.sessions.slice(-3) };
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
    if (!query) { this.attempts = []; this.sessions = []; }
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
    if (this.api) {
      await fetch("api/progress", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replace: true, attempts: this.attempts, sessions: this.sessions }),
      });
      await this.load();
    } else { this.mirror(); this.emit(); }
  }

  /* Reset follows wherever you are standing in the tree, so the scope arrives
     as the exact set of questions underneath that node. The server stays dumb
     about sections and topics; it just drops the keys it is handed. */
  async removeKeys(keys) {
    const gone = new Set(keys);
    const kept = this.attempts.filter((a) => !gone.has(a.set + "#" + a.q_no));
    const removed = this.attempts.length - kept.length;
    this.attempts = kept;
    if (this.api) {
      try {
        await fetch("api/progress", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ remove: [...gone] }),
        });
      } catch {}
      await this.load();
    } else { this.mirror(); this.emit(); }
    return removed;
  }
}

/* ---------------- the filter ---------------- */
export const emptyFilter = () => ({
  preset: "all",                       // all | standalone | grouped — filters everything below
  sections: [], topics: [], subtopics: [],
  limit: 20, order: "shuffle", style: "practice",
});

/* Which topics a preset admits. "all" admits everything. */
export function presetTopics(shape, preset) {
  const names = Object.keys(shape);
  if (preset === "standalone") return names.filter((t) => shape[t].standalone);
  if (preset === "grouped") return names.filter((t) => !shape[t].standalone);
  return names;
}
export function inPreset(shape, preset, topic) {
  if (preset === "all") return true;
  const sh = shape[topic];
  return !!sh && (preset === "standalone" ? sh.standalone : !sh.standalone);
}

/* A pick you cannot see must not still be filtering: each level drops the picks
   below it that no longer belong. Changing the preset clears the lot — handled
   by the caller, since that is a deliberate "start again". */
export function prune(F, sets) {
  const all = Object.values(sets);
  if (F.sections.length)
    F.topics = F.topics.filter((t) => all.some((s) => s.topic === t && F.sections.includes(s.section)));
  if (F.sections.length || F.topics.length)
    F.subtopics = F.subtopics.filter((st) => all.some((s) =>
      s.subtopic === st &&
      (!F.sections.length || F.sections.includes(s.section)) &&
      (!F.topics.length || F.topics.includes(s.topic))));
  if (!F.sections.length) { F.topics = []; F.subtopics = []; }
  if (!F.topics.length) F.subtopics = [];
  return F;
}

export function matchingSets(F, sets, shape) {
  return Object.entries(sets).filter(([, s]) =>
    (!shape || inPreset(shape, F.preset, s.topic)) &&
    (!F.sections.length || F.sections.includes(s.section)) &&
    (!F.topics.length || F.topics.includes(s.topic)) &&
    (!F.subtopics.length || F.subtopics.includes(s.subtopic)));
}

export function pool(F, data) {
  let qs = [];
  for (const [slug] of matchingSets(F, data.sets, data.shape)) qs = qs.concat(data.bySet[slug] || []);
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

/* ---------------- notes ----------------
   Written during Practice, read from the Notes tab, and never touched by any
   Reset. Its own file for exactly that reason: a different lifecycle from
   progress, and nothing about wiping your attempts should cost you what you
   wrote down while learning. */
const LS_NOTES = "area.notes.v1";

export class Notes {
  constructor() {
    this.map = {};          // "set#q_no" -> { text, at }
    this.api = true;
    this.listeners = new Set();
  }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach((f) => f()); }
  get(key) { return (this.map[key] || {}).text || ""; }
  get count() { return Object.keys(this.map).length; }

  async load() {
    try {
      const r = await fetch("api/notes", { cache: "no-store" });
      if (!r.ok) throw 0;
      this.map = (await r.json()).notes || {};
      this.api = true;
      this.emit();
      return;
    } catch { this.api = false; }
    this.map = await migrateFromLocalStorage("notes", LS_NOTES, {});
    this.emit();
  }
  mirror() {
    if (this.api) return;
    idbSet("notes", this.map);
  }

  async set(key, text) {
    text = (text || "").trim();
    if (text) this.map[key] = { text, at: Date.now() };
    else delete this.map[key];
    this.mirror();
    this.emit();
    if (this.api) {
      try {
        await fetch("api/notes", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, text }),
        });
      } catch { /* the local copy still has it */ }
    }
  }
}

/* ---------------- progress as a hierarchy ----------------
   A question counts as done only once answered correctly in a Test. Practice
   never writes an attempt at all, so it cannot move this.

   Every number is a rollup: a subtopic counts its own questions, a topic is the
   sum of its subtopics, a section the sum of its topics. Nothing is tracked
   separately at a higher level, so the levels can never disagree. */
export function masteredKeys(attempts) {
  const done = new Set();
  for (const a of attempts)
    if (a.correct === true && a.style !== "practice") done.add(a.set + "#" + a.q_no);
  return done;
}

export function buildTree(data, attempts) {
  const done = masteredKeys(attempts);
  const root = { name: "Everything", total: 0, done: 0, kind: "root", children: new Map() };

  for (const q of data.questions) {
    const meta = data.sets[q.set] || {};
    const path = [meta.section || "—", meta.topic || "—", meta.subtopic || q.set];
    const hit = done.has(q.set + "#" + q.q_no);
    let node = root;
    node.total++; if (hit) node.done++;
    for (let d = 0; d < path.length; d++) {
      const name = path[d];
      let child = node.children.get(name);
      if (!child)
        node.children.set(name, (child = {
          name, total: 0, done: 0, children: new Map(),
          kind: ["section", "topic", "subtopic"][d],
          path: path.slice(0, d + 1),
        }));
      child.total++; if (hit) child.done++;
      node = child;
    }
  }
  const sortKids = (n) => {
    n.kids = [...n.children.values()].sort((a, b) => a.name.localeCompare(b.name));
    n.kids.forEach(sortKids);
    return n;
  };
  return sortKids(root);
}

export function nodeAt(tree, path) {
  let n = tree;
  for (const name of path) {
    const next = (n.kids || []).find((k) => k.name === name);
    if (!next) return n;
    n = next;
  }
  return n;
}

/* Every question sitting under a node — what a Reset at that node would clear. */
export function keysUnder(data, path) {
  const [section, topic, subtopic] = path;
  const out = [];
  for (const q of data.questions) {
    const m = data.sets[q.set] || {};
    if (section && (m.section || "—") !== section) continue;
    if (topic && (m.topic || "—") !== topic) continue;
    if (subtopic && (m.subtopic || q.set) !== subtopic) continue;
    out.push(q.set + "#" + q.q_no);
  }
  return out;
}

/* Notes for the book view: every note under a topic, in question order. */
export function notesUnder(data, notes, path) {
  const [section, topic] = path;
  const rows = [];
  for (const q of data.questions) {
    const key = qKey(q);
    const note = notes.map[key];
    if (!note) continue;
    const m = data.sets[q.set] || {};
    if (section && (m.section || "—") !== section) continue;
    if (topic && (m.topic || "—") !== topic) continue;
    rows.push({ key, q, note, section: m.section, topic: m.topic, subtopic: m.subtopic });
  }
  rows.sort((a, b) =>
    (a.subtopic || "").localeCompare(b.subtopic || "") || a.q.q_no - b.q.q_no);
  return rows;
}
