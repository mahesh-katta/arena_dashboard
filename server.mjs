/* Arena Drill — serves the app and keeps your progress.
 *
 *     node server.mjs            http://localhost:8000
 *     node server.mjs 8080       a different port
 *
 * No dependencies: Node's own http and fs, nothing installed. Layout:
 *
 *     arena/
 *       app/                   this folder (the git repo — `git pull` updates the UI)
 *         dist/                the built app
 *         server.mjs
 *       data/                  one folder per question bank (set up once)
 *         guidely/             questions.json, sets.json, charts/, pdfs/
 *         sreedhar/            questions.json, sets.json, charts/
 *       guidely_progress.json  written here, outside the repo, so a pull never
 *       guidely_notes.json     touches them — one pair per bank
 *       sreedhar_progress.json
 *       sreedhar_notes.json
 *
 * Routes:
 *     /                     the app
 *     /data/...             the question bank and images
 *     GET    /api/config    what this install has (are the PDFs here? which banks?)
 *     GET    /api/progress  the whole progress document
 *     POST   /api/progress  merge in sessions and attempts (idempotent), or
 *                           drop an exact set of questions (a scoped reset)
 *     DELETE /api/progress  wipe, or drop one topic / one session
 *     GET    /api/notes     every note
 *     POST   /api/notes     write or clear one note
 *
 * Notes live in their own file. Reset, at any scope, never touches them.
 *
 * Question banks: every bank lives in data/<bank>/ and keeps its own
 * <bank>_progress.json and <bank>_notes.json. The API picks the bank from
 * ?bank=<id>; no bank (or an unknown one) = guidely.
 */
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync, renameSync, mkdirSync } from "node:fs";
import { readFile, writeFile, rename, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const APP = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(APP);
const DIST = path.join(APP, "dist");
const DATA = path.join(ROOT, "data");
const EMPTY = { version: 1, sessions: [], attempts: [] };

const BANKS = [
  { id: "guidely", name: "Guidely", note: "Topic-wise sets from the Guidely PDFs" },
  { id: "sreedhar", name: "Sreedhar", note: "81 full IBPS mock tests, tagged by topic" },
].map((b) => ({ ...b, dir: path.join(DATA, b.id) }));
const bankOf = (url) => {
  const b = url.searchParams.get("bank");
  return BANKS.some((x) => x.id === b) ? b : "guidely";
};
const storeFile = (b) => path.join(ROOT, b + "_progress.json");
const notesFile = (b) => path.join(ROOT, b + "_notes.json");
const STORE = storeFile("guidely");
const NOTES = notesFile("guidely");

/* One-time move from the old layout (Guidely loose in data/, progress.json,
   progress-<bank>.json) to one folder and one file pair per bank. Only renames,
   only when the new name is free — nothing is overwritten or deleted. */
function migrateLayout() {
  const moves = [
    [path.join(DATA, "questions.json"), path.join(DATA, "guidely", "questions.json")],
    [path.join(DATA, "sets.json"), path.join(DATA, "guidely", "sets.json")],
    [path.join(DATA, "charts"), path.join(DATA, "guidely", "charts")],
    [path.join(DATA, "guidely-pdfs"), path.join(DATA, "guidely", "pdfs")],
    [path.join(ROOT, "progress.json"), STORE],
    [path.join(ROOT, "progress.json.bak"), STORE + ".bak"],
    [path.join(ROOT, "notes.json"), NOTES],
    [path.join(ROOT, "notes.json.bak"), NOTES + ".bak"],
  ];
  for (const b of BANKS) {
    moves.push([path.join(ROOT, "progress-" + b.id + ".json"), storeFile(b.id)]);
    moves.push([path.join(ROOT, "notes-" + b.id + ".json"), notesFile(b.id)]);
  }
  for (const [from, to] of moves) {
    if (!existsSync(from) || existsSync(to)) continue;
    mkdirSync(path.dirname(to), { recursive: true });
    renameSync(from, to);
    console.log("  moved " + path.relative(ROOT, from) + " -> " + path.relative(ROOT, to));
  }
}

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml", ".pdf": "application/pdf", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".map": "application/json",
};

/* One writer at a time. Every write goes through this chain, so two requests
   landing together cannot interleave and shred the file. */
let chain = Promise.resolve();
const serial = (fn) => (chain = chain.then(fn, fn));

async function readStore(file = STORE) {
  try {
    const d = JSON.parse(await readFile(file, "utf8"));
    return { ...EMPTY, ...d };
  } catch {
    return { ...EMPTY, sessions: [], attempts: [] };
  }
}

async function readNotes(file = NOTES) {
  try {
    const d = JSON.parse(await readFile(file, "utf8"));
    return { version: 1, notes: d.notes || {} };
  } catch {
    return { version: 1, notes: {} };
  }
}

/* atomic: a crash mid-write must not shred either file */
async function writeJSON(file, doc) {
  if (existsSync(file)) await copyFile(file, file + ".bak");
  const tmp = path.join(ROOT, "." + path.basename(file) + "-" + process.pid + "-" + Date.now() + ".tmp");
  await writeFile(tmp, JSON.stringify(doc));
  await rename(tmp, file);
}
const writeStore = (doc, file = STORE) => writeJSON(file, doc);

const json = (res, obj, code = 200) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
};

function body(req) {
  return new Promise((resolve) => {
    let s = "";
    req.on("data", (c) => {
      s += c;
      if (s.length > 64e6) { s = ""; req.destroy(); }   // don't eat the machine
    });
    req.on("end", () => { try { resolve(JSON.parse(s || "{}")); } catch { resolve({}); } });
    req.on("error", () => resolve({}));
  });
}

/* Resolve a URL path to a file, refusing anything that climbs out of its root. */
function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  let root = DIST, rel = clean;
  if (clean.startsWith("/data/")) { root = DATA; rel = clean.slice("/data".length); }
  let full = path.normalize(path.join(root, rel));
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  if (existsSync(full) && statSync(full).isDirectory()) full = path.join(full, "index.html");
  return existsSync(full) ? full : null;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;
  const bank = bankOf(url);
  const SF = storeFile(bank);
  const NF = notesFile(bank);

  try {
    if (p === "/api/config") {
      return json(res, {
        pdfs: existsSync(path.join(DATA, "guidely", "pdfs")),
        charts: existsSync(path.join(DATA, "guidely", "charts")),
        api: true,
        banks: BANKS.map(({ id, name, note, dir }) => ({
          id, name, note, available: existsSync(path.join(dir, "questions.json")),
        })),
      });
    }

    if (p === "/api/notes") {
      if (req.method === "GET") return json(res, await serial(() => readNotes(NF)));
      if (req.method === "POST") {
        const { key, text } = await body(req);
        if (!key) return json(res, { ok: false, error: "no key" }, 400);
        return json(res, await serial(async () => {
          const doc = await readNotes(NF);
          const clean = (text || "").trim();
          if (clean) doc.notes[key] = { text: clean, at: Date.now() };
          else delete doc.notes[key];
          await writeJSON(NF, doc);
          return { ok: true, notes: Object.keys(doc.notes).length };
        }));
      }
      res.writeHead(405).end();
      return;
    }

    if (p === "/api/progress") {
      if (req.method === "GET") return json(res, await serial(() => readStore(SF)));

      if (req.method === "POST") {
        const payload = await body(req);
        return json(res, await serial(async () => {
          let doc = await readStore(SF);
          if (payload.replace) {
            doc = {
              version: 1,
              sessions: payload.sessions || [],
              attempts: payload.attempts || [],
            };
            await writeStore(doc, SF);
            return { ok: true, replaced: true, attempts: doc.attempts.length };
          }
          // a reset scoped to a node in the tree: the client works out which
          // questions sit under it and hands over the exact keys, so the server
          // never needs to know what a section or a topic is
          if (payload.remove) {
            const gone = new Set(payload.remove);
            const before = doc.attempts.length;
            doc.attempts = doc.attempts.filter((a) => !gone.has(a.set + "#" + a.q_no));
            await writeStore(doc, SF);
            return { ok: true, removed: before - doc.attempts.length, attempts: doc.attempts.length };
          }
          // attempts carry an id, so a retried request cannot double-count
          const have = new Set(doc.attempts.map((a) => a.id));
          let added = 0;
          for (const a of payload.attempts || []) {
            if (a.id && have.has(a.id)) continue;
            doc.attempts.push(a);
            have.add(a.id);
            added++;
          }
          const sess = new Map(doc.sessions.map((s) => [s.sid, s]));
          for (const s of payload.sessions || [])
            if (s.sid) sess.set(s.sid, { ...(sess.get(s.sid) || {}), ...s });
          doc.sessions = [...sess.values()];
          await writeStore(doc, SF);
          return { ok: true, added, attempts: doc.attempts.length };
        }));
      }

      if (req.method === "DELETE") {
        const topic = url.searchParams.get("topic");
        const sid = url.searchParams.get("sid");
        return json(res, await serial(async () => {
          let doc = await readStore(SF);
          const before = doc.attempts.length;
          if (topic) doc.attempts = doc.attempts.filter((a) => a.topic !== topic);
          else if (sid) {
            doc.attempts = doc.attempts.filter((a) => a.sid !== sid);
            doc.sessions = doc.sessions.filter((s) => s.sid !== sid);
          } else doc = { version: 1, sessions: [], attempts: [] };
          await writeStore(doc, SF);
          return { ok: true, removed: before - doc.attempts.length, attempts: doc.attempts.length };
        }));
      }
      res.writeHead(405).end();
      return;
    }

    const file = resolveFile(p === "/" ? "/index.html" : p);
    if (!file) {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
      return;
    }
    const { size } = statSync(file);
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Content-Length": size,     // the app shows a real loading percentage from this
    });
    createReadStream(file).pipe(res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Server error");
  }
});

const port = Number(process.argv[2]) || 8000;
migrateLayout();
for (const b of BANKS) {
  const missing = ["questions.json", "sets.json"].filter((f) => !existsSync(path.join(b.dir, f)));
  if (missing.length)
    console.log("The " + b.name + " bank is missing " + missing.join(", ") + " (expected in " + b.dir + ")\n");
}
if (!existsSync(path.join(DIST, "app.js")))
  console.log("dist/app.js is missing — run:  node build.mjs\n");

console.log("Arena Drill");
console.log("  http://localhost:" + port);
console.log("  data : " + DATA);
for (const b of BANKS) {
  const d = await readStore(storeFile(b.id));
  const n = Object.keys((await readNotes(notesFile(b.id))).notes).length;
  console.log("  " + b.name.padEnd(9) + ": " + d.attempts.length + " attempts, " + n + " notes  (" + b.id + "_progress.json)");
}
console.log("\nKeep this window open. Press Ctrl+C to stop.\n");
server.listen(port, "0.0.0.0");
