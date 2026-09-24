import React, { useState, useEffect, useRef, useCallback } from "react";
import { PACE, pace, uid, qKey, imgSrc, pdfSrc } from "./store.js";

const CALM = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const LETTERS = ["a", "b", "c", "d", "e"];

function Clock({ startedAt, hidden }) {
  const [s, setS] = useState(0);
  useEffect(() => {
    setS(0);
    const t = setInterval(() => setS((performance.now() - startedAt.current) / 1000), 100);
    return () => clearInterval(t);
  }, [startedAt, hidden]);
  if (hidden) return <div className="clock quiet num" title="Still timed — just not shown">••</div>;
  return <div className={"clock num " + pace(s)}>{s.toFixed(1)}s</div>;
}

/* One question card. `state` is null until it is resolved, then
   {chosen, correct, secs, revealed, skipped}. */
function QCard({ q, idx, state, here, practice, flagged, alreadyRetried, onAnswer, onSkip, onReveal, onRetry, onFlag, solo, config }) {
  const [showSol, setShowSol] = useState(false);
  useEffect(() => {
    // in practice, a wrong answer opens the working straight away
    if (practice && state && state.correct === false) setShowSol(true);
  }, [state, practice]);

  const keys = LETTERS.filter((k) => q.options[k] != null);
  const longest = Math.max(0, ...keys.map((k) => String(q.options[k]).length));
  const done = !!state;
  const marked = done && practice;          // test mode withholds right/wrong

  return (
    <div className={"qitem" + (done ? " done" : "") + (here ? " here" : "") + (state && state.skipped ? " skipped" : "")}
         style={!CALM ? { animationDelay: Math.min(idx * 45, 220) + "ms" } : undefined}>
      {solo && q.dirs && <div className="dirs"><b>Instructions</b>{q.dirs}</div>}
      <div className="qhead">
        <span className="qnum">Q{q.q_no}</span>
        <div className="qtext">{q.stem || "(question text not captured — open the PDF)"}</div>
        <button className={"flag" + (flagged ? " on" : "")} title={flagged ? "Unflag" : "Flag for later"}
                onClick={onFlag}>{flagged ? "★" : "☆"}</button>
      </div>

      <div className={"opts" + (longest <= 34 ? " row" : "")}>
        {keys.map((k) => {
          const key = (q.answer || "").toLowerCase();
          let cls = "opt";
          if (done && state.chosen === k) cls += " picked";
          if (marked && key && k === key) cls += " right";
          if (marked && state.chosen === k && state.correct === false) cls += " wrong";
          if (done && !marked && state.chosen === k) cls += " chosen";
          return (
            <button key={k} className={cls} disabled={done} onClick={() => onAnswer(k)}>
              <span className="key">{k.toUpperCase()}</span>
              <span>{q.options[k]}</span>
            </button>
          );
        })}
      </div>

      <div className="qfoot">
        {!done && (
          <>
            {practice && q.solution && (
              <button className="ghost" onClick={onReveal}>Show solution</button>
            )}
            <button className="ghost" onClick={onSkip}>Skip</button>
          </>
        )}
        {done && state.skipped && <span className="pill na">Skipped</span>}
        {done && state.revealed && <span className="pill na">Solution shown</span>}
        {done && !state.skipped && !state.revealed && (
          marked ? (
            <span className={"pill " + (state.correct === null ? "na" : state.correct ? "right" : "wrong")}>
              {state.correct === null ? "Answer not in the PDF"
                : state.correct ? "Correct"
                : "Wrong — answer " + (q.answer || "").toUpperCase()}
            </span>
          ) : <span className="pill na">Answered {state.chosen.toUpperCase()}</span>
        )}
        {done && !state.skipped && (
          <span className="tchip" style={{ color: "var(--" + pace(state.secs) + ")" }}>{state.secs.toFixed(1)}s</span>
        )}
        {done && practice && state.correct === false && !state.retried && !alreadyRetried && (
          <button className="ghost" onClick={onRetry}>Try again</button>
        )}
        {done && practice && q.solution && (
          <button className="ghost" onClick={() => setShowSol((v) => !v)}>
            {showSol ? "Hide solution" : "Solution"}
          </button>
        )}
        {done && config.pdfs && (
          <a className="srclink" href={pdfSrc(q.set)} target="_blank" rel="noreferrer">PDF</a>
        )}
      </div>
      {done && practice && showSol && q.solution && <div className="sol">{q.solution}</div>}
    </div>
  );
}

export default function Runner({ data, progress, F, session, onFinish, onEnd }) {
  const practice = F.style === "practice";
  const [bi, setBi] = useState(0);
  const [states, setStates] = useState({});        // qKey -> state
  const [retried, setRetried] = useState(() => new Set());
  const [results, setResults] = useState([]);
  const segT = useRef(performance.now());
  const sidRef = useRef(null);
  const listRef = useRef(null);

  if (!sidRef.current) {
    sidRef.current = "s_" + uid();
    progress.startSession({
      sid: sidRef.current, started: Date.now(), planned: session.total, style: F.style,
      filter: {
        sections: F.sections.slice(), topics: F.topics.slice(), subtopics: F.subtopics.slice(),
        standalone: F.standalone, grouped: F.grouped, mode: F.mode, order: F.order, limit: F.limit,
      },
    });
  }
  const SID = sidRef.current;
  const blk = session.blocks[bi];
  const first = blk[0];
  const meta = data.sets[first.set] || {};
  const hasImg = !!(first.img && first.img.length);
  const shared = blk.length > 1 || !!first.passage || hasImg;
  const stack = blk.length === 1 && hasImg && !first.passage;

  const resolved = blk.filter((q) => states[qKey(q)]).length;
  const blockDone = resolved >= blk.length;
  const answeredCount = results.length;

  useEffect(() => { segT.current = performance.now(); }, [bi]);

  const settle = useCallback((q, patch) => {
    const secs = (performance.now() - segT.current) / 1000;
    segT.current = performance.now();
    const st = { secs: +secs.toFixed(1), retried: retried.has(qKey(q)), ...patch };
    setStates((s) => ({ ...s, [qKey(q)]: st }));
    // a second go at the same question is for learning, not for the record:
    // the first attempt is what the stats are built on
    if (!patch.skipped && !retried.has(qKey(q))) {
      const key = (q.answer || "").toLowerCase();
      const rec = {
        id: uid(), sid: SID, set: q.set, q_no: q.q_no,
        topic: (data.sets[q.set] || {}).topic || "", section: (data.sets[q.set] || {}).section || "",
        chosen: patch.chosen || "-", answer: key.toUpperCase(),
        correct: patch.revealed ? null : patch.correct,
        secs: st.secs, at: Date.now(), style: F.style, revealed: !!patch.revealed,
      };
      progress.record(rec);
      setResults((r) => r.concat(rec));
    }
    return st;
  }, [SID, data.sets, progress, F.style, retried]);

  const answer = (q, k) => {
    if (states[qKey(q)]) return;
    const key = (q.answer || "").toLowerCase();
    settle(q, { chosen: k, correct: key ? k === key : null });
  };
  const skip = (q) => { if (!states[qKey(q)]) settle(q, { skipped: true, chosen: "-" }); };
  const reveal = (q) => { if (!states[qKey(q)]) settle(q, { revealed: true, chosen: "-", correct: null }); };
  const retry = (q) => {
    setRetried((r) => new Set(r).add(qKey(q)));
    setStates((s) => { const n = { ...s }; delete n[qKey(q)]; return n; });
    segT.current = performance.now();
  };

  const next = () => {
    if (bi + 1 < session.blocks.length) {
      setBi(bi + 1);
      scrollTo({ top: 0, behavior: CALM ? "auto" : "smooth" });
    } else finish();
  };
  const finish = () => {
    progress.endSession(SID, results.length);
    onFinish({ results, style: F.style, sid: SID });
  };

  /* keyboard: A–E answer, S solution, F flag, K skip, Enter continue */
  useEffect(() => {
    const onKey = (e) => {
      if (/input|select|textarea/i.test(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const open = blk.find((q) => !states[qKey(q)]);
      const current = open || [...blk].reverse().find((q) => states[qKey(q)]);
      if (/^[a-e]$/.test(k) && open) {
        const keys = LETTERS.filter((x) => open.options[x] != null);
        if (keys.includes(k)) { e.preventDefault(); answer(open, k); }
      } else if (/^[1-5]$/.test(k) && open) {
        const keys = LETTERS.filter((x) => open.options[x] != null);
        const key = keys[+k - 1];
        if (key) { e.preventDefault(); answer(open, key); }
      } else if (k === "k" && open) { e.preventDefault(); skip(open); }
      else if (k === "f" && current) { e.preventDefault(); progress.toggleFlag(qKey(current)); }
      else if (k === "s" && open && practice) { e.preventDefault(); reveal(open); }
      else if (k === "enter" && blockDone) { e.preventDefault(); next(); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [blk, states, blockDone, practice, retried, settle]);

  /* keep the question you are on in view */
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(".qitem.here");
    if (el && answeredCount) el.scrollIntoView({ block: "center", behavior: CALM ? "auto" : "smooth" });
  }, [resolved]);

  const openIdx = blk.findIndex((q) => !states[qKey(q)]);
  const progressFrac = Object.keys(states).length / session.total;

  return (
    <>
      <div className="topline" style={{ width: Math.min(1, progressFrac) * 100 + "%" }} />
      <div className="runbar">
        <Clock startedAt={segT} hidden={practice} />
        <div className="prog">
          <div className="crumb">
            <b>{meta.topic || ""}</b> · {meta.subtopic || first.set}
            {blk.length > 1 && <span className="grp">{blk.length} questions on this {first.img ? "chart" : "passage"}</span>}
            <span className={"mode " + F.style}>{practice ? "Practice" : "Test"}</span>
          </div>
          <div className="bar"><i style={{ width: Math.min(1, progressFrac) * 100 + "%" }} /></div>
        </div>
        <div className="crumb num">set {bi + 1} / {session.blocks.length}</div>
        <button className="ghost" onClick={() => { progress.endSession(SID, results.length); onEnd({ results, style: F.style, sid: SID }); }}>End</button>
      </div>

      <div className={"blockwrap" + (stack ? " stack" : shared ? "" : " solo")}>
        {shared && (
          <div className="stimulus">
            {first.dirs && <div className="dirs"><b>Instructions</b>{first.dirs}</div>}
            {first.passage && <div className="ptext">{first.passage}</div>}
            {(first.img || []).map((src) => (
              <img key={src} src={imgSrc(src)} alt="Stimulus for this set" loading="lazy" decoding="async"
                   onError={(e) => { e.currentTarget.replaceWith(Object.assign(document.createElement("p"), { className: "note", textContent: "Image missing — open the PDF." })); }} />
            ))}
            {hasImg && (
              <button className="ghost" style={{ marginTop: 10 }}
                      onClick={() => window.open(imgSrc(first.img[0]), "_blank")}>Open full size</button>
            )}
          </div>
        )}
        <div className="qlist" ref={listRef}>
          {blk.map((q, i) => (
            <QCard key={qKey(q)} q={q} idx={i} solo={!shared} config={data.config}
                   state={states[qKey(q)]} here={i === openIdx} practice={practice}
                   flagged={progress.flags.has(qKey(q))} alreadyRetried={retried.has(qKey(q))}
                   onAnswer={(k) => answer(q, k)} onSkip={() => skip(q)}
                   onReveal={() => reveal(q)} onRetry={() => retry(q)}
                   onFlag={() => progress.toggleFlag(qKey(q))} />
          ))}
        </div>
      </div>

      <div className="blockbar">
        <p className="hint">
          <kbd>A</kbd>–<kbd>E</kbd> answer · <kbd>K</kbd> skip · <kbd>F</kbd> flag
          {practice && <> · <kbd>S</kbd> solution</>} · <kbd>Enter</kbd> continue
        </p>
        <button className="next" disabled={!blockDone} onClick={next}>
          {bi + 1 < session.blocks.length ? "Next set" : "Finish"}
        </button>
      </div>
    </>
  );
}
