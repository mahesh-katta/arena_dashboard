import React, { useState, useEffect, useRef, useReducer } from "react";
import { createRoot } from "react-dom/client";
import { Progress, Notes, loadData, emptyFilter, buildBlocks, keysUnder, masteredKeys, qKey } from "./store.js";
import Funnel, { Landing } from "./Funnel.jsx";
import Runner from "./Runner.jsx";
import ProgressView from "./Progress.jsx";
import NotesView from "./Notes.jsx";
import { Done, Stats, SetsView, Review } from "./Views.jsx";

const progress = new Progress();
const notes = new Notes();

function Boot({ pct }) {
  return (
    <div className="loading">
      <div>Loading the question bank…</div>
      <div className="loadbar"><i style={{ width: Math.round(pct * 100) + "%" }} /></div>
      <div className="note num">{Math.round(pct * 100)}%</div>
    </div>
  );
}

const MENU = [
  ["progress", "Progress"],
  ["stats", "Stats"],
  ["notes", "Notes"],
  ["reset", "Reset"],
];

function App() {
  const [pct, setPct] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [config, setConfig] = useState({ pdfs: false });
  const [view, setView] = useState("home");
  const [F, setF] = useState(emptyFilter);
  const [session, setSession] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const [reviewSid, setReviewSid] = useState(null);
  const [, refresh] = useReducer((x) => x + 1, 0);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      await Promise.all([progress.load(), notes.load()]);
      progress.subscribe(refresh);
      notes.subscribe(refresh);
      try {
        const r = await fetch("api/config");
        if (r.ok) setConfig(await r.json());
      } catch {}
      try { setData(await loadData(setPct)); }
      catch (e) { setError(e.message); }
    })();
  }, []);

  useEffect(() => {
    const t = localStorage.getItem("area.theme");
    if (t) document.documentElement.setAttribute("data-theme", t);
    const measure = () => {
      const h = document.querySelector(".top");
      if (h) document.documentElement.style.setProperty("--stick", h.offsetHeight + "px");
    };
    measure();
    addEventListener("resize", measure);
    return () => removeEventListener("resize", measure);
  }, []);

  if (error)
    return (
      <div className="empty">
        <h2>Can't read the question bank</h2>
        <p className="note">
          It needs <code>data/questions.json</code>, <code>data/sets.json</code> and
          {" "}<code>data/charts/</code> sitting beside the app.
        </p>
        <p className="note">
          On a computer this page has to be served rather than opened from the file
          system — double-click <b>start.command</b> or <b>start.bat</b>, then open
          {" "}<a href="http://localhost:8000">localhost:8000</a>.
        </p>
        <p className="note">({error})</p>
      </div>
    );
  if (!data) return <Boot pct={pct} />;

  const go = (v) => { setSession(null); setView(v); };

  const startFrom = (avail) => {
    const s = buildBlocks(avail, F);
    if (!s.blocks.length) return;
    setSession(s);
    setView("run");
  };

  /* "Test on what's left here", straight off the Progress tree: the scope you
     are standing on, minus what you have already got right. */
  const testWhatsLeft = (path) => {
    const done = masteredKeys(progress.attempts);
    const keys = new Set(keysUnder(data, path).filter((k) => !done.has(k)));
    const avail = data.questions.filter((q) => keys.has(qKey(q)));
    if (!avail.length) return;
    const f = { ...emptyFilter(), style: "test", limit: 20 };
    setF(f);
    const s = buildBlocks(avail, f);
    setSession(s);
    setView("run");
  };

  const finish = (o) => {
    setOutcome(o);
    setSession(null);
    setView("done");
  };

  return (
    <>
      <header className="top">
        <button className="brand" onClick={() => go("home")}>Area <span>Drill</span></button>
        <div className="tabs" role="tablist">
          {MENU.map(([v, label]) => (
            <button key={v} className={"tab" + (v === "reset" ? " resettab" : "")} role="tab"
                    aria-selected={view === v} onClick={() => go(v)}>{label}</button>
          ))}
        </div>
        <button className="ghost" onClick={() => {
          const cur = document.documentElement.getAttribute("data-theme") ||
            (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
          const next = cur === "dark" ? "light" : "dark";
          document.documentElement.setAttribute("data-theme", next);
          try { localStorage.setItem("area.theme", next); } catch {}
        }}>Theme</button>
      </header>

      <main className="wrap">
        {view === "home" && (
          <Landing notes={notes} progress={progress}
                   onPick={(style) => { setF((p) => ({ ...p, style })); setView("funnel"); }} />
        )}
        {view === "funnel" && (
          <Funnel data={data} F={F} setF={setF} onStart={startFrom} onBack={() => go("home")} />
        )}
        {view === "run" && session && (
          <Runner data={{ ...data, config }} progress={progress} notes={notes}
                  F={F} session={session} onFinish={finish} />
        )}
        {view === "done" && outcome && (
          <Done data={data} outcome={outcome} notes={notes} config={config}
                onStats={() => go("stats")} onNotes={() => go("notes")} onAgain={() => go("home")} />
        )}
        {(view === "progress" || view === "reset") && (
          <ProgressView data={data} progress={progress} mode={view} refresh={refresh}
                        onStartSession={testWhatsLeft} />
        )}
        {view === "stats" && (
          <Stats data={data} progress={progress} notes={notes} config={config}
                 onStart={() => { setF((p) => ({ ...p, style: "test" })); setView("funnel"); }}
                 onReview={(sid) => { setReviewSid(sid); setView("review"); }} />
        )}
        {view === "review" && (
          <Review data={data} progress={progress} sid={reviewSid} config={config} onBack={() => go("stats")} />
        )}
        {view === "notes" && (
          <NotesView data={data} notes={notes} config={config}
                     onStartSession={() => { setF((p) => ({ ...p, style: "practice" })); setView("funnel"); }} />
        )}
        {view === "sets" && <SetsView data={data} config={config} />}
      </main>
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);
