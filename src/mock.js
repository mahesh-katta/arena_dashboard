/* Full mock tests: the index from the server, the sittings, the clocks and the
   marking. Nothing here renders. */
import { api, uid } from "./store.js";

/* ---------------- settings ----------------
   null means "no limit" (∞) everywhere. Section minutes are per section, so a
   long Reasoning paper can get more than English. */
export const DEFAULTS = { sectionMin: 20, questionSec: 40, groupMin: 7 };
const SKEY = "arena.mock.settings";
export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SKEY) || "null");
    if (s) return { ...DEFAULTS, perSection: {}, ...s };
  } catch {}
  return { ...DEFAULTS, perSection: {} };
}
export function saveSettings(s) { try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch {} }

export const fmtClock = (s) => {
  if (s == null || !isFinite(s)) return "∞";
  s = Math.max(0, Math.ceil(s));
  const m = Math.floor(s / 60), r = s % 60;
  return m >= 60 ? Math.floor(m / 60) + ":" + String(m % 60).padStart(2, "0") + ":" + String(r).padStart(2, "0")
                 : m + ":" + String(r).padStart(2, "0");
};
export const fmtSecs = (s) => (s < 60 ? Math.round(s) + "s" : Math.floor(s / 60) + "m " + String(Math.round(s % 60)).padStart(2, "0") + "s");
export const fmtLimit = (v, unit) => (v == null ? "∞" : v + " " + unit);

/* ---------------- the index ----------------
   The server reads each source paper and says which runs of questions share
   material (see mocks.mjs). Here each paper question is tied to the question
   the bank already holds — same text, pictures and answer as Practice/Test. */
export async function loadMockIndex(data) {
  const r = await fetch(api("api/mocks"), { cache: "no-store" });
  if (!r.ok) throw new Error("api/mocks -> " + r.status);
  const { mocks } = await r.json();
  const byPaper = new Map();
  for (const q of data.questions) if (q.source && q.source.file) byPaper.set(q.source.file + "#" + q.source.qno, q);
  for (const m of mocks) {
    m.q = {};                                  // paper qno -> bank question
    m.topic = {};                              // paper qno -> topic, from the bank's tagging
    for (let no = 1; no <= m.total; no++) {
      const q = byPaper.get(m.file + "#" + no);
      if (q) { m.q[no] = q; m.topic[no] = (data.sets[q.set] || {}).topic || ""; }
    }
    m.missing = m.total - Object.keys(m.q).length;
    m.sections.forEach((s, i) => {
      const bs = m.blocks.filter((b) => b.sec === i);
      s.standalone = bs.filter((b) => !b.group).length;
      s.groups = bs.filter((b) => b.group).length;
      s.groupQs = bs.filter((b) => b.group).reduce((a, b) => a + b.q.length, 0);
    });
  }
  return mocks;
}

/* ---------------- sittings ----------------
   One record per sitting in <bank>_mocks.json. A live sitting is saved every
   few seconds and on the way out, so a refresh — or another device — carries on
   from the same question with the same clocks. */
export class MockStore {
  constructor() {
    this.attempts = {};
    this.api = true;
    this.error = null;
    this.dirty = new Map();
    this.t = null;
    this.listeners = new Set();
  }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach((f) => f()); }
  list() { return Object.values(this.attempts); }
  get(id) { return this.attempts[id] || null; }
  forMock(mockId) {
    return this.list().filter((a) => a.mockId === mockId).sort((a, b) => (b.started || 0) - (a.started || 0));
  }
  live() { return this.list().filter((a) => a.status === "live").sort((a, b) => (b.saved || 0) - (a.saved || 0)); }
  done() { return this.list().filter((a) => a.status === "done").sort((a, b) => (b.ended || 0) - (a.ended || 0)); }

  async load() {
    try {
      const r = await fetch(api("api/mock-attempts"), { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) { this.error = d.error || "mock file unreadable"; throw 0; }
      this.attempts = d.attempts || {};
      this.api = true;
    } catch { this.api = !!this.error; }
    this.emit();
  }
  put(a, now) {
    this.attempts[a.id] = a;
    this.dirty.set(a.id, a);
    clearTimeout(this.t);
    if (now) this.flush();
    else this.t = setTimeout(() => this.flush(), 1500);
    this.emit();
  }
  async flush() {
    if (!this.api || this.error) return;
    for (const [id, a] of [...this.dirty]) {
      try {
        const r = await fetch(api("api/mock-attempts"), {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attempt: a }),
        });
        if (!r.ok) throw 0;
        if (this.dirty.get(id) === a) this.dirty.delete(id);
      } catch { /* stays dirty; retried next time */ }
    }
  }
  flushBeacon() {
    if (!this.api || this.error || !navigator.sendBeacon) return;
    for (const [id, a] of [...this.dirty])
      if (navigator.sendBeacon(api("api/mock-attempts"), JSON.stringify({ attempt: a }))) this.dirty.delete(id);
  }
  async remove(id) {
    delete this.attempts[id];
    this.dirty.delete(id);
    this.emit();
    if (this.api && !this.error) {
      try { await fetch(api("api/mock-attempts?id=" + encodeURIComponent(id)), { method: "DELETE" }); } catch {}
    }
  }
}

/* ---------------- a new sitting ----------------
   The plan freezes what was chosen: which sections, in paper order, and every
   limit in seconds (null = no limit). The blocks are the paper's own. */
export function newAttempt(mock, settings, sectionIdx) {
  const secs = sectionIdx.slice().sort((a, b) => a - b);
  const limits = {
    section: Object.fromEntries(secs.map((i) => {
      const v = settings.perSection[i] !== undefined ? settings.perSection[i] : settings.sectionMin;
      return [i, v == null ? null : v * 60];
    })),
    question: settings.questionSec == null ? null : settings.questionSec,
    group: settings.groupMin == null ? null : settings.groupMin * 60,
  };
  const blocks = mock.blocks.map((b, i) => ({ ...b, i })).filter((b) => secs.includes(b.sec));
  return {
    id: "m_" + uid(), mockId: mock.id, n: mock.n, title: mock.title, file: mock.file,
    status: "live", started: Date.now(), ended: null,
    plan: { sections: secs, limits, blocks: blocks.map((b) => b.i) },
    // live state
    pos: { s: 0, q: blocks.length ? blocks[0].q[0] : null },
    ans: {},          // qno -> { c: "a".."e" | null, t: secs on it, v: visits, m: marked, x: timed out, at: last change }
    used: { block: {}, section: {} },   // block index / section index -> seconds used
    closed: { block: {}, section: {} }, // why each one ended: "time" | "submit"
    paused: false, active: 0,
  };
}

export const blockLimit = (att, mock, bi) => {
  const b = mock.blocks[bi];
  return b.group ? att.plan.limits.group : att.plan.limits.question;
};
export const sectionLimit = (att, si) => att.plan.limits.section[si];

/* ---------------- marking ---------------- */
export function score(att, mock) {
  const rows = [];
  for (const bi of att.plan.blocks) {
    const b = mock.blocks[bi];
    const sec = mock.sections[b.sec];
    for (const no of b.q) {
      const q = mock.q[no];
      const a = att.ans[no] || {};
      const key = q ? String(q.answer || "").toLowerCase() : "";
      const chosen = a.c || null;
      const result = !chosen ? (a.x ? "timeout" : "skipped") : !key ? "unmarked" : chosen === key ? "right" : "wrong";
      const marks = result === "right" ? sec.pos : result === "wrong" ? -sec.neg : 0;
      rows.push({
        no, q, sec: b.sec, block: bi, group: b.group, groupSize: b.q.length,
        chosen, key, result, marks, t: a.t || 0, visits: a.v || 0, marked: !!a.m, timedOut: !!a.x,
        topic: mock.topic[no] || "", answer: key,
      });
    }
  }
  return rows;
}

const sum = (xs, f) => xs.reduce((s, x) => s + f(x), 0);
export function summarise(att, mock, rows) {
  rows = rows || score(att, mock);
  const tally = (rs) => {
    const right = rs.filter((r) => r.result === "right").length;
    const wrong = rs.filter((r) => r.result === "wrong").length;
    const attempted = right + wrong + rs.filter((r) => r.result === "unmarked").length;
    const time = sum(rs, (r) => r.t);
    const max = sum(rs, (r) => mock.sections[r.sec].pos);
    const seen = rs.filter((r) => r.visits > 0).length;
    return {
      n: rs.length, right, wrong, attempted,
      skipped: rs.filter((r) => r.result === "skipped").length,
      timeout: rs.filter((r) => r.result === "timeout").length,
      marks: +sum(rs, (r) => r.marks).toFixed(2), max,
      neg: +sum(rs.filter((r) => r.result === "wrong"), (r) => mock.sections[r.sec].neg).toFixed(2),
      acc: attempted ? right / attempted : null,
      time, seen, avg: seen ? time / seen : 0,
      avgAttempted: attempted ? sum(rs.filter((r) => r.chosen), (r) => r.t) / attempted : 0,
    };
  };
  const all = tally(rows);
  const sections = att.plan.sections.map((si) => {
    const rs = rows.filter((r) => r.sec === si);
    return { si, name: mock.sections[si].short, ...tally(rs), used: att.used.section[si] || 0, limit: sectionLimit(att, si),
             ended: att.closed.section[si] || null };
  });
  const kinds = [false, true].map((g) => ({ group: g, ...tally(rows.filter((r) => r.group === g)) }));
  const topics = {};
  for (const r of rows) (topics[r.topic || "—"] || (topics[r.topic || "—"] = [])).push(r);
  const byTopic = Object.entries(topics).map(([t, rs]) => ({ topic: t, sec: rs[0].sec, ...tally(rs) }))
    .sort((a, b) => a.sec - b.sec || b.n - a.n);
  const groups = att.plan.blocks.filter((bi) => mock.blocks[bi].group).map((bi) => {
    const rs = rows.filter((r) => r.block === bi);
    return { bi, sec: mock.blocks[bi].sec, from: rs[0].no, to: rs[rs.length - 1].no, topic: rs[0].topic,
             used: att.used.block[bi] || 0, limit: blockLimit(att, mock, bi), ...tally(rs) };
  });
  return { all, sections, kinds, byTopic, groups, rows };
}
