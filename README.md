# Area Drill

Timed practice for banking prelims, over your own question bank.

```
area/
  app/            <- this repo. `git pull` here updates the whole interface.
    dist/            the built app (committed on purpose — see below)
    src/             the React source
    serve.py         the server + progress API
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
python3 app/serve.py          # or: python3 app/serve.py 8080
```

Nothing to install. Python 3.8+ is already on macOS and most Linux machines;
on Windows, install Python once from python.org and tick "Add to PATH".

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
npm install          # once
node build.mjs       # build
node build.mjs --watch
```

Commit `dist/` along with your changes — that is what makes `git pull` enough
on the other machine.

## The data folder

`data/` is the question bank: `questions.json` (12,826 questions), `sets.json`
(749 sets), `charts/` (the images for questions whose data is a picture, which
text extraction can never recover). Optionally `data/guidely-pdfs/` — if it's
there, every question gets a link to its source PDF; if not, those links simply
don't appear.
