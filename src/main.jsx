import React, { useState, useEffect, useRef, useReducer } from "react";
import { createRoot } from "react-dom/client";
import { Progress, Notes, loadData, emptyFilter, buildBlocks, keysUnder, masteredKeys, qKey, setBank, DATA_BASE } from "./store.js";
import Funnel, { Landing } from "./Funnel.jsx";
import Runner from "./Runner.jsx";
import ProgressView from "./Progress.jsx";
import NotesView from "./Notes.jsx";
import { Done, Stats, SetsView, Review } from "./Views.jsx";

/* The question bank comes from the URL (?bank=guidely / ?bank=sreedhar), so a
   switch is a fresh page: nothing from one bank can leak into the other's
   progress, notes or filters. No bank in the URL = the home screen asks. */
const BANK_ID = new URLSearchParams(location.search).get("bank");
if (BANK_ID) setBank(BANK_ID);

const progress = new Progress();
const notes = new Notes();

const DEFAULT_BANKS = [
  { id: "guidely", name: "Guidely", note: "Topic-wise sets from the Guidely PDFs", available: true },
  { id: "sreedhar", name: "Sreedhar", note: "81 full IBPS mock tests, tagged by topic", available: true },
];

function BankPick({ banks }) {
  let last = null;
  try { last = localStorage.getItem("arena.bank"); } catch {}
  const pick = (id) => {
    try { localStorage.setItem("arena.bank", id); } catch {}
    location.search = "?bank=" + encodeURIComponent(id);
  };
  return (
    <div className="landing">
      <h1>Which question bank?</h1>
      <div className="modes">
        {banks.map((b) => (
          <button key={b.id} className={"modecard " + (b.id === "guidely" ? "practice" : "test")}
                  disabled={!b.available} onClick={() => pick(b.id)}>
            <b>{b.name}</b>
            <span>{b.note}</span>
            <em>{!b.available ? "not installed" : b.id === last ? "last used" : "\u00a0"}</em>
          </button>
        ))}
      </div>
      <p className="note">Each bank keeps its own progress and notes.</p>
    </div>
  );
}

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
      if (!BANK_ID) {
        try {
          const r = await fetch("api/config");
          if (r.ok) setConfig(await r.json());
        } catch {}
        return;
      }
      await Promise.all([progress.load(), notes.load()]);
      progress.subscribe(refresh);
      notes.subscribe(refresh);
      try {
        const r = await fetch("api/config");
        if (r.ok) {
          const c = await r.json();
          setConfig({ ...c, pdfs: !!c.pdfs && BANK_ID === "guidely" });
        }
      } catch {}
      try { setData(await loadData(setPct)); }
      catch (e) { setError(e.message); }
    })();
  }, []);

  useEffect(() => {
    const t = localStorage.getItem("arena.theme");
    if (t) document.documentElement.setAttribute("data-theme", t);
    const measure = () => {
      const h = document.querySelector(".top");
      if (h) document.documentElement.style.setProperty("--stick", h.offsetHeight + "px");
    };
    measure();
    addEventListener("resize", measure);
    return () => removeEventListener("resize", measure);
  }, []);

  const bankName = ((config.banks || DEFAULT_BANKS).find((b) => b.id === BANK_ID) || {}).name || BANK_ID;
  const switchBank = () => { location.href = location.pathname; };

  if (!BANK_ID)
    return (
      <>
        <header className="top">
          <span className="brand">Arena <span>Dashboard</span></span>
        </header>
        <main className="wrap"><BankPick banks={config.banks || DEFAULT_BANKS} /></main>
      </>
    );

  if (error)
    return (
      <div className="empty">
        <h2>Can't read the question bank</h2>
        <p className="note">
          It needs <code>{DATA_BASE}questions.json</code>, <code>{DATA_BASE}sets.json</code> and
          {" "}<code>{DATA_BASE}charts/</code> sitting beside the app.
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
        <button className="brand" onClick={() => go("home")}>Arena <span>Dashboard</span></button>
        <button className="ghost bankchip" onClick={switchBank} title="Switch question bank">{bankName} ⇄</button>
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
          try { localStorage.setItem("arena.theme", next); } catch {}
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
