# Area Drill

Timed practice for banking prelims, over your own question bank.

```
area/
  app/            <- this repo. `git pull` here updates the whole interface.
    dist/            the built app (committed on purpose — see below)
    src/             the React source
    server.mjs       the server + progress API (Node, no dependencies)
    start.command    double-click launcher (Mac) - start.bat on Windows
    serve.py         the same thing in Python, as a fallback
  data/           <- questions.json, sets.json, charts/   (set up once, never changes)
  progress.json   <- your history. Outside the repo, so a pull can never touch it.
  start.command / start.bat
```

## Running it

Double-click **start.command** (Mac) or **start.bat** (Windows), then open
<http://localhost:8000>. Keep the window open while you work; closing it stops
the server.

Or from a terminal:

```sh
cd app && npm start           # or: node server.mjs 8080
```

Node 18+ is the only thing to install, once, from <https://nodejs.org>. The
server itself has no dependencies — `npm install` is only needed if you want to
build the app from source. If Node isn't there, `python3 app/serve.py` runs the
same thing.

## Updating the interface

```sh
cd app && git pull
```

That's the whole thing. The built files live in the repo, so there is no npm,
no build step and no Node needed on the machine running it — a pull swaps the
interface and leaves your data and progress alone. Refresh the browser after.

## Practice vs Test

**Practice** — marks each answer as you go, shows the worked solution, and lets
you retry a question you got wrong. The clock still records your time; it just
isn't shown, so there's no pressure.

**Test** — the clock is up, answers lock without telling you anything, and the
whole paper is marked at the end. That's the exam.

Either way you can flag a question (`F`) to come back to, or skip it (`K`)
without it counting against you.

Keys: `A`–`E` answer · `K` skip · `F` flag · `S` solution (practice) · `Enter` continue.

## Your progress

Everything is one file, `progress.json`, sitting beside the app. Same history in
every browser, and on your phone over wifi if you open the machine's address
instead of localhost. Back it up by copying that one file, or use Export in the
Stats tab.

Stats also has: reset one topic, reset one session, wipe everything, and import
a backup.

## Editing the code

```sh
npm install                   # once
node build.mjs --watch        # terminal 1: rebuilds on every save
npm start                     # terminal 2: serves it
```

Edit `src/`, save, refresh the browser. When you're done, build once without
`--watch` so `dist/` is the minified version, then commit.

```sh
node build.mjs          # only if you were not running --watch
git add -A && git commit -m "what changed" && git push
```

Commit `dist/` along with your changes — that is what makes `git pull` enough
on the other machine.

## The data folder

`data/` is the question bank: `questions.json` (12,826 questions), `sets.json`
(749 sets), `charts/` (the images for questions whose data is a picture, which
text extraction can never recover). Optionally `data/guidely-pdfs/` — if it's
there, every question gets a link to its source PDF; if not, those links simply
don't appear.

## What build.mjs does

`src/` is React with JSX, which no browser understands. `build.mjs` runs esbuild
over it: it follows the imports from `src/main.jsx`, pulls in React itself, turns
the JSX into plain JavaScript, and writes the lot into one file, `dist/app.js`.
It also copies `src/styles.css` across. That one file is what the browser loads,
and the one your friend's `git pull` delivers.

    node build.mjs            build once
    node build.mjs --watch    stay running, rebuild on every save

Both produce the same minified output, so whatever is sitting in `dist/` at any
moment is exactly what ships - there is no separate "build for real" step to
forget before committing. `--watch` additionally writes a sourcemap, which is
gitignored, so an error in the browser still points at the real line in `src/`.
