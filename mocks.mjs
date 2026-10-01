/* Full mock tests, built straight from the source papers in data/<bank>/source/.
 *
 * Each source file is one sitting: sections with their own question ranges and
 * marking, then 100 questions in paper order. Nothing here is precomputed or
 * stored; the index is read once per server start and kept in memory.
 *
 * Standalone or group?
 * --------------------
 * The paper itself says. A setter writes one "direction" for a run of
 * consecutive questions, and that direction is either
 *   - a rule for answering each question on its own ("In this question a
 *     sentence is divided into four parts…", "What will come in place of ?"),
 *   - or shared material every question in the run needs ("Ten people sit in a
 *     row… ", a passage, a table, a chart).
 * So the unit is the run of questions under one direction (near-identical
 * repeats of a direction are one run), and the run is read like a person would:
 *   1. media      the direction carries a picture or a table          -> group
 *   2. rule       it addresses each question ("In this/each question…") -> standalone
 *   3. pointer    it says "study / read / based on the following…" AND
 *                 something actually follows the pointer               -> group
 *   4. passage    it speaks of a passage/paragraph and is long enough
 *                 to contain one                                       -> group
 *   5. long       400+ characters of direction is material, not a rule -> group
 *   otherwise     a plain instruction                                  -> standalone
 * A run of one question is always standalone — there is nothing to share.
 */
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const text = (h) =>
  String(h || "").split("@|@")[0]
    .replace(/<img[^>]*>/gi, " [IMG] ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&[a-z]+;|&#\d+;/gi, " ")
    .replace(/\s+/g, " ").trim();

const RANGE = /directions?\s*\(?\s*\d+\s*(?:-|–|to)\s*\d+\s*\)?\s*[:.]?/gi;
const RULE = /^(directions?\s*:?\s*)?(in|for|if)\s+(this|each|every|the following|the given|the)?\s*(of the\s+)?(questions?|sentences?|statements?)\b/i;
const POINTER = /(study|read|go through|refer to|based on|based upon|consider|observe|look at)\b[^.?!:]*\b(following|given|below|above|this|these)\b/i;
const PASSAGE = /\b(passage|paragraph)\b/i;
const alnum = (s) => s.replace(/[^A-Za-z0-9#@$%&*^©£¥~!]/g, "").length;

export function classify(dirText, hasMedia) {
  const d = dirText.replace(RANGE, "").trim();
  if (!d) return "none";
  if (hasMedia) return "media";
  if (RULE.test(d)) return "rule";
  const ss = d.split(/(?<=[.?!:])\s+/).filter(Boolean);
  const at = ss.findIndex((s) => POINTER.test(s));
  if (at >= 0 && alnum(ss.slice(at + 1).join(" ")) >= 10) return "pointer";
  if (PASSAGE.test(d) && d.length >= 300) return "passage";
  if (d.length >= 400) return "long";
  return "instruction";
}
export const GROUP_KINDS = new Set(["media", "pointer", "passage", "long"]);

/* Two directions are "the same" when they match after normalising, or when a
   setter re-typed the same block with a stray character (same opening, same
   length within 3%). */
const sameDir = (a, b) => {
  if (a === b) return true;
  if (a.length < 60 || b.length < 60) return false;
  const k = (s) => s.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const x = k(a), y = k(b);
  return x.slice(0, 120) === y.slice(0, 120) && Math.abs(x.length - y.length) <= Math.max(x.length, y.length) * 0.03;
};

const SHORT = { "English Language": "English", "Numerical Ability": "Quant", "Quantitative Aptitude": "Quant", "Reasoning Ability": "Reasoning" };

export function indexMock(file, doc) {
  const qd = doc.questionsData || {};
  const qs = qd.questions || [];
  const name = doc.testName || qd.examname || file;
  const n = +((name.match(/MODEL TEST\s*(\d+)/i) || [])[1] || 0);
  const sections = (qd.modules || []).map((m) => ({
    name: m.mname, short: SHORT[m.mname] || m.mname,
    from: +m.qfrom, to: +m.qto, count: +m.noofq,
    minutes: +m.duration || 0, pos: +m.psvmarks || 1, neg: +m.negmarks || 0,
  }));
  const secOf = (no) => sections.findIndex((s) => no >= s.from && no <= s.to);

  // runs of consecutive questions under one direction, never across a section
  const runs = [];
  for (const q of qs) {
    const no = +q.qno;
    const d = text(q.direction);
    const media = /<img|<table/i.test(String(q.direction || "").split("@|@")[0]);
    const last = runs[runs.length - 1];
    if (last && d && sameDir(d, last.d) && last.sec === secOf(no)) last.q.push(no);
    else runs.push({ d, media, q: [no], sec: secOf(no) });
  }
  const blocks = runs.map((r) => {
    const kind = classify(r.d, r.media);
    const group = r.q.length > 1 && GROUP_KINDS.has(kind);
    return group ? { group: true, kind, q: r.q } : null;
  });
  // standalone runs split into one block per question
  const out = [];
  runs.forEach((r, i) => {
    if (blocks[i]) out.push(blocks[i]);
    else for (const no of r.q) out.push({ group: false, kind: classify(r.d, r.media), q: [no] });
  });
  return {
    id: String(doc.testId || qd.examid || file), n, file, title: name,
    total: qs.length, sections,
    blocks: out.map((b) => ({ ...b, sec: secOf(b.q[0]) })),
  };
}

const cache = new Map();
export async function mockIndex(dataDir, bank) {
  if (cache.has(bank)) return cache.get(bank);
  const dir = path.join(dataDir, bank, "source");
  const p = (async () => {
    if (!existsSync(dir)) return { mocks: [] };
    const files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith(".json"));
    const mocks = [];
    for (const f of files) {
      try { mocks.push(indexMock(f, JSON.parse(await readFile(path.join(dir, f), "utf8")))); }
      catch (e) { console.log("  skipped mock " + f + ": " + e.message); }
    }
    mocks.sort((a, b) => a.n - b.n || a.title.localeCompare(b.title));
    return { mocks };
  })();
  cache.set(bank, p);
  return p;
}
