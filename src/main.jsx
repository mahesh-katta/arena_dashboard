import React, { useState, useEffect, useRef, useReducer } from "react";
import { createRoot } from "react-dom/client";
import {
  Progress, Notes, loadData, emptyFilter, buildBlocks, keysUnder, masteredKeys, qKey, setBank, DATA_BASE,
  loadResume, saveResume, ago,
} from "./store.js";
import Funnel, { Landing } from "./Funnel.jsx";
import Runner from "./Runner.jsx";
import ProgressView from "./Progress.jsx";
import NotesView from "./Notes.jsx";
import { Done, Stats, SetsView, Review } from "./Views.jsx";

/* The question bank comes from the URL (?bank=guidely / ?bank=sreedhar), so a
   switch is a fresh page: nothing from one bank can leak into the other's
   progress, notes or filters. No bank in the URL = the entry screen asks.
   ?mode=practice|test jumps straight into the picker; ?resume=1 carries on
   from the saved snapshot without asking. Both are dropped from the URL once
   read, so a refresh never replays them. */
const URLP = new URLSearchParams(location.search);
const BANK_ID = URLP.get("bank");
const MODE = URLP.get("mode");
const RESUME = URLP.get("resume") === "1";
if (BANK_ID) {
  setBank(BANK_ID);
  if (MODE || RESUME) history.replaceState(null, "", "?bank=" + encodeURIComponent(BANK_ID));
}

const progress = new Progress();
const notes = new Notes();

const DEFAULT_BANKS = [
  { id: "guidely", name: "Guidely", note: "Topic-wise sets from the Guidely PDFs", available: true },
  { id: "sreedhar", name: "Sreedhar", note: "81 full IBPS mock tests, tagged by topic", available: true },
];

/* Mid-work screens get a "carry on?" prompt; the rest just reopen. */
const ASK_VIEWS = ["funnel", "run"];
const describe = (s, bankName) => {
  if (!s) return "";
  const mode = s.F && s.F.style === "test" ? "test" : "practice";
  if (s.view === "run" && s.session) {
    const nq = s.session.blocks.reduce((a, b) => a + b.length, 0);
    return bankName + " " + mode + " · set " + (((s.run && s.run.bi) || 0) + 1) + " of " +
      s.session.blocks.length + " · " + nq + " questions";
  }
  return bankName + " " + mode + " · choosing questions";
};

/* What each bank is, drawn rather than spelled: Guidely is topic-wise sets
   (a stack of layers), Sreedhar is full timed mocks (a stopwatch). */
const svg = (children) => (
  <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor"
       strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
const ORB_ICONS = {
  guidely: svg(<>
    <path d="M12 3 2.5 8 12 13l9.5-5L12 3Z" />
    <path d="m2.5 12.5 9.5 5 9.5-5" />
    <path d="m2.5 17 9.5 5 9.5-5" />
  </>),
  sreedhar: svg(<>
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M12 13.5V9.5" /><path d="M9.5 2.5h5" /><path d="M12 2.5V6" />
    <path d="m18.5 6.5 1.5-1.5" />
  </>),
  default: svg(<>
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" />
    <path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" />
  </>),
};

/* ---------------- the entry screen ---------------- */
function Entry({ banks }) {
  const [stats, setStats] = useState({});
  const [saved, setSaved] = useState(() =>
    Object.fromEntries(banks.map((b) => [b.id, loadResume(b.id)])));

  useEffect(() => {
    banks.forEach(async (b) => {
      try {
        const [p, n] = await Promise.all([
          fetch("api/progress?bank=" + b.id).then((r) => r.json()),
          fetch("api/notes?bank=" + b.id).then((r) => r.json()),
        ]);
        setStats((s) => ({ ...s, [b.id]: { answered: (p.attempts || []).length, notes: Object.keys(n.notes || {}).length } }));
      } catch {}
    });
  }, [banks.map((b) => b.id).join()]);

  const open = (id, q) => {
    try { localStorage.setItem("arena.bank", id); } catch {}
    location.search = "?bank=" + encodeURIComponent(id) + q;
  };
  const pending = banks.filter((b) => saved[b.id] && ASK_VIEWS.includes(saved[b.id].view));

  return (
    <div className="entry">
      <div className="blob b1" /><div className="blob b2" /><div className="blob b3" />
      <header className="entrytop">
        <span className="brand light">Arena <span>Dashboard</span></span>
        <span className="entrysub">Pick a bank, then how you want to work.</span>
      </header>

      <div className="bankcards">
        {banks.map((b) => {
          const st = stats[b.id];
          return (
            <section key={b.id} className={"bankcard " + b.id + (b.available ? "" : " off")}>
              <div className="bankglass">
                <span className="bankorb" aria-hidden="true"><i>{ORB_ICONS[b.id] || ORB_ICONS.default}</i></span>
                <div className="bankmeta">
                  <h2>{b.name}</h2>
                  <p>{b.note}</p>
                  <div className="bankstats num">
                    {!b.available ? <span>not installed</span> : st
                      ? <><span>{st.answered.toLocaleString()} answered</span><span>{st.notes.toLocaleString()} notes</span></>
                      : <span>&nbsp;</span>}
                  </div>
                </div>
                <div className="bankmodes">
                  <button disabled={!b.available} onClick={() => open(b.id, "&mode=practice")}>
                    <b>Practice</b><small>until you get it right</small>
                  </button>
                  <button disabled={!b.available} onClick={() => open(b.id, "&mode=test")}>
                    <b>Test</b><small>one shot, marked</small>
                  </button>
                </div>
                <button className="bankmore" disabled={!b.available} onClick={() => open(b.id, "")}>
                  Progress, stats &amp; notes →
                </button>
              </div>
            </section>
          );
        })}
      </div>

      {pending.length > 0 && (
        <div className="resumetoast glass">
          {pending.map((b) => (
            <div key={b.id} className="rtrow">
              <div>
                <b>Continue where you left off?</b>
                <small>{describe(saved[b.id], b.name)} · {ago(saved[b.id].at)}</small>
              </div>
              <button className="ghost" onClick={() => {
                saveResume(b.id, { ...saved[b.id], view: "home" });
                setSaved((s) => ({ ...s, [b.id]: null }));
              }}>Discard</button>
              <button className="go grad sm" onClick={() => open(b.id, "&resume=1")}>Continue</button>
            </div>
          ))}
        </div>
      )}
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

function ResumeAsk({ snap, bankName, onYes, onNo }) {
  useEffect(() => {
    const k = (e) => { if (e.key === "Enter") onYes(); if (e.key === "Escape") onNo(); };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  });
  return (
    <div className="sheet">
      <div className="sheetbox glass resumebox">
        <span className="resumeicon" aria-hidden="true">↺</span>
        <h3>Continue where you left off?</h3>
        <p className="scopeline">{describe(snap, bankName)}</p>
        <p className="note">Saved {ago(snap.at)}. Starting fresh keeps everything already recorded.</p>
        <div className="sheetfoot">
          <button className="ghost" onClick={onNo}>Start fresh</button>
          <button className="go grad" onClick={onYes}>Continue</button>
        </div>
      </div>
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
  const [fstep, setFstep] = useState(0);
  const [session, setSession] = useState(null);
  const [runInit, setRunInit] = useState(null);
  const [runKey, setRunKey] = useState(0);
  const [outcome, setOutcome] = useState(null);
  const [reviewSid, setReviewSid] = useState(null);
  const [ask, setAsk] = useState(null);
  const [, refresh] = useReducer((x) => x + 1, 0);
  const started = useRef(false);

  /* Saving is off until the "carry on?" question is settled, so the empty
     start-up state can never overwrite the snapshot we are about to offer. */
  const hydrated = useRef(false);
  const runSnap = useRef(null);
  const live = useRef({});
  live.current = { view, F, fstep, session, outcome, reviewSid };
  const persist = () => {
    if (!hydrated.current || !BANK_ID) return;
    const s = live.current;
    saveResume(BANK_ID, {
      view: s.view, F: s.F, fstep: s.fstep, reviewSid: s.reviewSid,
      session: s.view === "run" && s.session
        ? { total: s.session.total, blocks: s.session.blocks.map((b) => b.map(qKey)) } : null,
      run: s.view === "run" ? runSnap.current : null,
      outcome: s.view === "done" ? s.outcome : null,
    });
  };
  useEffect(persist, [view, F, fstep, session, outcome, reviewSid]);

  const restore = (snap, d) => {
    if (snap.F) setF({ ...emptyFilter(), ...snap.F });
    setFstep(snap.fstep || 0);
    setReviewSid(snap.reviewSid || null);
    if (snap.view === "run" && snap.session) {
      const byKey = new Map(d.questions.map((q) => [qKey(q), q]));
      const blocks = snap.session.blocks.map((b) => b.map((k) => byKey.get(k)).filter(Boolean)).filter((b) => b.length);
      if (blocks.length) {
        runSnap.current = snap.run;
        setRunInit(snap.run);
        setSession({ blocks, total: blocks.reduce((a, b) => a + b.length, 0) });
        setView("run");
      } else setView("home");
    } else if (snap.view === "done" && snap.outcome) {
      setOutcome(snap.outcome);
      setView("done");
    } else if (snap.view && snap.view !== "done") setView(snap.view);
  };

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
      let d;
      try { d = await loadData(setPct); }
      catch (e) { setError(e.message); return; }
      setData(d);

      const snap = loadResume(BANK_ID);
      if (MODE === "practice" || MODE === "test") {
        setF((p) => ({ ...(snap && snap.F ? { ...emptyFilter(), ...snap.F } : p), style: MODE }));
        setFstep(0);
        setView("funnel");
        hydrated.current = true;
      } else if (snap && ASK_VIEWS.includes(snap.view) && !RESUME) {
        setAsk(snap);
      } else {
        if (snap) restore(snap, d);
        hydrated.current = true;
      }
    })();
  }, []);

  useEffect(() => {
    const bye = () => { progress.flushBeacon(); persist(); };
    addEventListener("pagehide", bye);
    return () => removeEventListener("pagehide", bye);
  }, []);

  useEffect(() => {
    let t = null;
    try { t = localStorage.getItem("arena.theme"); } catch {}
    if (t) document.documentElement.setAttribute("data-theme", t);
    const measure = () => {
      const h = document.querySelector(".top");
      if (h) document.documentElement.style.setProperty("--stick", h.offsetHeight + "px");
    };
    measure();
    addEventListener("resize", measure);
    return () => removeEventListener("resize", measure);
  }, []);

  const banks = config.banks || DEFAULT_BANKS;
  const bankName = (banks.find((b) => b.id === BANK_ID) || {}).name || BANK_ID;
  const switchBank = () => { persist(); location.href = location.pathname; };

  if (!BANK_ID) return <Entry banks={banks} />;

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

  const go = (v) => { setSession(null); runSnap.current = null; setView(v); };
  const openFunnel = (style) => { setF((p) => ({ ...p, style })); setFstep(0); setSession(null); setView("funnel"); };

  const launch = (s, f) => {
    runSnap.current = null;
    setRunInit(null);
    setRunKey((k) => k + 1);
    if (f) setF(f);
    setSession(s);
    setView("run");
  };
  const startFrom = (avail) => {
    const s = buildBlocks(avail, F);
    if (s.blocks.length) launch(s);
  };

  /* "Test on what's left here", straight off the Progress tree: the scope you
     are standing on, minus what you have already got right. */
  const testWhatsLeft = (path) => {
    const done = masteredKeys(progress.attempts);
    const keys = new Set(keysUnder(data, path).filter((k) => !done.has(k)));
    const avail = data.questions.filter((q) => keys.has(qKey(q)));
    if (!avail.length) return;
    const f = { ...emptyFilter(), style: "test", limit: 20 };
    launch(buildBlocks(avail, f), f);
  };

  const finish = (o) => {
    runSnap.current = null;
    setOutcome(o);
    setSession(null);
    setView("done");
  };

  return (
    <>
      <div className="appbg" aria-hidden="true"><i /><i /><i /></div>
      <header className="top glass">
        <button className="brand" onClick={() => go("home")}>Arena <span>Dashboard</span></button>
        <button className={"bankchip " + BANK_ID} onClick={switchBank} title="Switch question bank">{bankName} ⇄</button>
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
          <Landing notes={notes} progress={progress} bankName={bankName} onPick={openFunnel} />
        )}
        {view === "funnel" && (
          <Funnel data={data} F={F} setF={setF} step={fstep} setStep={setFstep}
                  onStart={startFrom} onBack={() => go("home")} />
        )}
        {view === "run" && session && (
          <Runner key={runKey} data={{ ...data, config }} progress={progress} notes={notes}
                  F={F} session={session} onFinish={finish}
                  snap={runInit} onSnap={(s) => { runSnap.current = s; persist(); }} />
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
                 onStart={() => openFunnel("test")}
                 onReview={(sid) => { setReviewSid(sid); setView("review"); }} />
        )}
        {view === "review" && (
          <Review data={data} progress={progress} sid={reviewSid} config={config} onBack={() => go("stats")} />
        )}
        {view === "notes" && (
          <NotesView data={data} notes={notes} config={config}
                     onStartSession={() => openFunnel("practice")} />
        )}
        {view === "sets" && <SetsView data={data} config={config} />}
      </main>

      {ask && (
        <ResumeAsk snap={ask} bankName={bankName}
                   onYes={() => { restore(ask, data); setAsk(null); hydrated.current = true; }}
                   onNo={() => { setAsk(null); hydrated.current = true; persist(); }} />
      )}
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);
