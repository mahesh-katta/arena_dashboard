# Area Drill

Practice and timed tests over your own question bank.

```
area/
  app/            <- this repo. `git pull` here updates the whole interface.
    dist/            the built app (committed on purpose — see below)
    src/             the React source
    server.mjs       the server + progress/notes API (Node, no dependencies)
    start.command    double-click launcher (Mac) — start.bat on Windows
  data/           <- questions.json, sets.json, charts/   (set up once, never changes)
  progress.json   <- what you got right in tests. Outside the repo, so a pull can't touch it.
  notes.json      <- what you wrote while practising. Its own file, on purpose.
```

## Running it

Double-click **start.command** (Mac) or **start.bat** (Windows), then open
<http://localhost:8000>. Keep the window open while you work.

Or from a terminal:

```sh
cd app && npm start           # or: node server.mjs 8080
```

Node 18+ is the only thing to install, once, from <https://nodejs.org>. The
server has no dependencies — `npm install` is only needed to build from source.

## Updating the interface

```sh
cd app && git pull
```

That's the whole thing. The built files live in the repo, so there is no npm, no
build step and no Node toolchain needed on the machine running it — a pull swaps
the interface and leaves your data, progress and notes alone. Refresh the browser
after.

## Practice vs Test

The mode is the first thing you pick, because it decides what the session is for.

**Practice** — keep answering until you get it right. The clock runs in the open
and only stops when you land it; a wrong pick greys out and the clock keeps
going. The working is there when you want it, and under every question is a note
box. **Nothing else is saved** — no attempts, no session, no mark on your
progress. The only thing a practice run leaves behind is what you wrote down.

**Test** — one pick per question, clock up, nothing revealed. Marked at the end,
where every question reopens with its passage, chart, answer and working. This is
the only thing that moves Progress.

Keys: `A`–`E` answer · `K` skip · `S` show me (practice) · `Enter` continue.

## Picking what to drill

Five steps, each narrowing the one below it: **Preset** (all / standalone /
grouped) → **Sections** → **Topics** → **Subtopics** → **how many and in what
order**. Leave a step empty to take all of it.

Preset sits at the top because standalone-versus-grouped is the broadest cut
there is, and it is worked out from the data rather than a hand-written list — a
topic is standalone when most of its questions stand on their own. Changing the
preset clears everything below it and starts the funnel again.

## Progress, and Reset

**Progress** is one hierarchy: Everything → Section → Topic → Subtopic. A
question counts once you have answered it correctly **in a test**. Every number
is a rollup — a topic is the sum of its subtopics, a section the sum of its
topics — so the levels can never disagree with each other.

**Reset** is that same hierarchy, walked the same way. Whatever node you are
standing on is what gets wiped, and the confirmation names it before anything
happens.

**Notes are never touched by a reset**, at any level. That is why they live in
`notes.json` rather than inside the progress record: a different lifecycle, and
nothing about clearing your attempts should cost you what you learned.

## Your files

`progress.json` and `notes.json` sit beside the app, outside the repo. The same
history in every browser, and on your phone over wifi if you open the machine's
address instead of localhost. Back either up by copying the file; Stats has an
Export for progress.

## Editing the code

```sh
npm install                   # once
npm run dev                   # build --watch + server together
```

Edit `src/`, save, refresh the browser. Watch and one-off builds produce the same
minified output, so whatever is in `dist/` is always what ships — there is no
separate build to remember before committing.

```sh
git add -A && git commit -m "what changed" && git push
```

## What build.mjs does

`src/` is React with JSX, which no browser understands. `build.mjs` runs esbuild
over it: it follows the imports from `src/main.jsx`, pulls in React itself, turns
the JSX into plain JavaScript, and writes the lot into one file, `dist/app.js`.
It also copies `src/styles.css` across. That one file is what the browser loads,
and what your friend's `git pull` delivers.

    node build.mjs            build once
    node build.mjs --watch    stay running, rebuild on every save

`--watch` additionally writes a sourcemap, which is gitignored, so an error in
the browser still points at the real line in `src/`.

## Where the code lives

| file | what's in it |
|---|---|
| `main.jsx` | the shell — menu, which screen is showing |
| `Funnel.jsx` | the landing choice and the five-step picker |
| `Runner.jsx` | the question screen, both modes |
| `Progress.jsx` | the hierarchy, used for both Progress and Reset |
| `Notes.jsx` | the shelf and the book view |
| `Views.jsx` | end-of-session, Stats, Review, Sets |
| `store.js` | no UI — data loading, progress, notes, the tree |

## The data folder

`data/` is the question bank: `questions.json`, `sets.json`, and `charts/` (the
images for questions whose content is a picture, which text extraction can never
recover). Optionally `data/guidely-pdfs/` — if it's there, every question links
to its source PDF; if not, those links simply don't appear.
