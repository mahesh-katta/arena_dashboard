/* Area Drill — serves the app and keeps your progress.
 *
 *     node server.mjs            http://localhost:8000
 *     node server.mjs 8080       a different port
 *
 * No dependencies: Node's own http and fs, nothing installed. Layout:
 *
 *     area/
 *       app/          this folder (the git repo — `git pull` updates the UI)
 *         dist/       the built app
 *         server.mjs
 *       data/         questions.json, sets.json, charts/   (set up once)
 *       progress.json written here, outside the repo, so a pull never touches it
 *
 * Routes:
 *     /                     the app
 *     /data/...             the question bank and images
 *     GET    /api/config    what this install has (are the PDFs here?)
 *     GET    /api/progress  the whole progress document
 *     POST   /api/progress  merge in sessions and attempts (idempotent), or
 *                           drop an exact set of questions (a scoped reset)
 *     DELETE /api/progress  wipe, or drop one topic / one session
 *     GET    /api/notes     every note
 *     POST   /api/notes     write or clear one note
 *
 * Notes live in their own file. Reset, at any scope, never touches them.
 */
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile, writeFile, rename, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const APP = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(APP);
const DIST = path.join(APP, "dist");
const DATA = path.join(ROOT, "data");
const STORE = path.join(ROOT, "progress.json");
const NOTES = path.join(ROOT, "notes.json");
const EMPTY = { version: 1, sessions: [], attempts: [] };

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

async function readStore() {
  try {
    const d = JSON.parse(await readFile(STORE, "utf8"));
    return { ...EMPTY, ...d };
  } catch {
    return { ...EMPTY, sessions: [], attempts: [] };
  }
}

async function readNotes() {
  try {
    const d = JSON.parse(await readFile(NOTES, "utf8"));
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
const writeStore = (doc) => writeJSON(STORE, doc);

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

  try {
    if (p === "/api/config") {
      return json(res, {
        pdfs: existsSync(path.join(DATA, "guidely-pdfs")),
        charts: existsSync(path.join(DATA, "charts")),
        api: true,
      });
    }

    if (p === "/api/notes") {
      if (req.method === "GET") return json(res, await serial(readNotes));
      if (req.method === "POST") {
        const { key, text } = await body(req);
        if (!key) return json(res, { ok: false, error: "no key" }, 400);
        return json(res, await serial(async () => {
          const doc = await readNotes();
          const clean = (text || "").trim();
          if (clean) doc.notes[key] = { text: clean, at: Date.now() };
          else delete doc.notes[key];
          await writeJSON(NOTES, doc);
          return { ok: true, notes: Object.keys(doc.notes).length };
        }));
      }
      res.writeHead(405).end();
      return;
    }

    if (p === "/api/progress") {
      if (req.method === "GET") return json(res, await serial(readStore));

      if (req.method === "POST") {
        const payload = await body(req);
        return json(res, await serial(async () => {
          let doc = await readStore();
          if (payload.replace) {
            doc = {
              version: 1,
              sessions: payload.sessions || [],
              attempts: payload.attempts || [],
            };
            await writeStore(doc);
            return { ok: true, replaced: true, attempts: doc.attempts.length };
          }
          // a reset scoped to a node in the tree: the client works out which
          // questions sit under it and hands over the exact keys, so the server
          // never needs to know what a section or a topic is
          if (payload.remove) {
            const gone = new Set(payload.remove);
            const before = doc.attempts.length;
            doc.attempts = doc.attempts.filter((a) => !gone.has(a.set + "#" + a.q_no));
            await writeStore(doc);
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
          await writeStore(doc);
          return { ok: true, added, attempts: doc.attempts.length };
        }));
      }

      if (req.method === "DELETE") {
        const topic = url.searchParams.get("topic");
        const sid = url.searchParams.get("sid");
        return json(res, await serial(async () => {
          let doc = await readStore();
          const before = doc.attempts.length;
          if (topic) doc.attempts = doc.attempts.filter((a) => a.topic !== topic);
          else if (sid) {
            doc.attempts = doc.attempts.filter((a) => a.sid !== sid);
            doc.sessions = doc.sessions.filter((s) => s.sid !== sid);
          } else doc = { version: 1, sessions: [], attempts: [] };
          await writeStore(doc);
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
const missing = ["questions.json", "sets.json"].filter((f) => !existsSync(path.join(DATA, f)));
if (missing.length) {
  console.log("The question bank is missing: " + missing.join(", "));
  console.log("Expected in: " + DATA);
  console.log("Copy the data folder in beside this app, then run this again.\n");
}
if (!existsSync(path.join(DIST, "app.js")))
  console.log("dist/app.js is missing — run:  node build.mjs\n");

const doc = await readStore();
console.log("Area Drill");
console.log("  http://localhost:" + port);
console.log("  data     : " + DATA);
console.log("  progress : " + STORE + "  (" + doc.attempts.length + " attempts)");
console.log("  notes    : " + NOTES + "  (" + Object.keys((await readNotes()).notes).length + " written)");
console.log("\nKeep this window open. Press Ctrl+C to stop.\n");
server.listen(port, "0.0.0.0");
