import React, { useState, useEffect, useRef, useReducer } from "react";
import { createRoot } from "react-dom/client";
import { Progress, loadData, emptyFilter, buildBlocks } from "./store.js";
import Setup from "./Setup.jsx";
import Runner from "./Runner.jsx";
import { Done, Stats, SetsView, Review } from "./Views.jsx";

const progress = new Progress();

function Boot({ pct }) {
  return (
    <div className="loading">
      <div>Loading the question bank…</div>
      <div className="loadbar"><i style={{ width: Math.round(pct * 100) + "%" }} /></div>
      <div className="note num">{Math.round(pct * 100)}%</div>
    </div>
  );
}

function App() {
  const [pct, setPct] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [config, setConfig] = useState({ pdfs: false });
  const [view, setView] = useState("practice");
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
      await progress.load();
      progress.subscribe(refresh);
      try {
        const r = await fetch("api/config");
        if (r.ok) setConfig(await r.json());
      } catch { /* opened without the server */ }
      try { setData(await loadData(setPct)); }
      catch (e) { setError(e.message); }
    })();
  }, []);

  useEffect(() => {
    const t = localStorage.getItem("area.theme");
    if (t) document.documentElement.setAttribute("data-theme", t);
    // the sticky bars offset from the real header height, measured rather than
    // guessed: a fixed number leaves them clipped at some font sizes and zooms
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
          This page has to be served, not opened from the file system.<br />
          In the folder above <code>app</code>, double-click <b>start.command</b> (Mac) or <b>start.bat</b> (Windows),
          then open <a href="http://localhost:8000">localhost:8000</a>.
        </p>
        <p className="note">It also needs <code>data/questions.json</code>, <code>data/sets.json</code> and <code>data/charts/</code>. ({error})</p>
      </div>
    );
  if (!data) return <Boot pct={pct} />;

  const start = (avail) => {
    const s = buildBlocks(avail, F);
    if (!s.blocks.length) return;
    setSession(s);
    setView("run");
  };
  const finish = (o) => { setOutcome(o); setSession(null); setView("done"); };

  const tab = (v, label) => (
    <button className="tab" role="tab" aria-selected={view === v} onClick={() => { setSession(null); setView(v); }}>
      {label}
    </button>
  );

  return (
    <>
      <header className="top">
        <div className="brand">Area <span>Drill</span></div>
        <div className="tabs" role="tablist">
          {tab("practice", "Practice")}
          {tab("stats", "Stats")}
          {tab("sets", "Sets")}
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
        {view === "practice" && (
          <Setup data={data} progress={progress} F={F} setF={setF} onStart={start} config={config} />
        )}
        {view === "run" && session && (
          <Runner data={{ ...data, config }} progress={progress} F={F} session={session}
                  onFinish={finish} onEnd={finish} />
        )}
        {view === "done" && outcome && (
          <Done data={data} outcome={outcome} config={config} onAgain={() => { setOutcome(null); setView("practice"); }} />
        )}
        {view === "stats" && (
          <Stats data={data} progress={progress} config={config} refresh={refresh}
                 onReview={(sid) => { setReviewSid(sid); setView("review"); }} />
        )}
        {view === "review" && (
          <Review data={data} progress={progress} sid={reviewSid} config={config} onBack={() => setView("stats")} />
        )}
        {view === "sets" && <SetsView data={data} config={config} />}
      </main>
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);
