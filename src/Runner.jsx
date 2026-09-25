import React, { useState, useEffect, useRef, useCallback } from "react";
import { pace, uid, qKey, imgSrc, pdfSrc } from "./store.js";
import Rich from "./Rich.jsx";
import SourceLine from "./Source.jsx";

const CALM = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const LETTERS = ["a", "b", "c", "d", "e"];

/* Remounted for each question (see the key where it is used), so it always
   reads the time spent on the one in front of you. */
function Clock({ from }) {
  const [s, setS] = useState(0);
  useEffect(() => {
    const tick = () => setS((performance.now() - from.current) / 1000);
    tick();
    const t = setInterval(tick, 100);
    return () => clearInterval(t);
  }, [from]);
  return <div className={"clock num " + pace(s)}>{s.toFixed(1)}s</div>;
}

/* A note box that saves itself: typing is local, the write lands a beat after
   you stop. Practice exists to produce these, so it should never feel like a
   form you have to submit. */
function NoteBox({ value, onSave }) {
  const [text, setText] = useState(value || "");
  const [saved, setSaved] = useState(false);
  const t = useRef(null);
  useEffect(() => setText(value || ""), [value]);
  const change = (v) => {
    setText(v);
    setSaved(false);
    clearTimeout(t.current);
    t.current = setTimeout(async () => { await onSave(v); setSaved(true); }, 600);
  };
  return (
    <div className="notewrap">
      <label>
        Note
        {saved && <span className="savedcue">saved</span>}
      </label>
      <textarea rows={2} value={text} placeholder="What tripped you up? The trick to remember?"
                onChange={(e) => change(e.target.value)}
                onBlur={() => { clearTimeout(t.current); onSave(text).then(() => setSaved(true)); }} />
    </div>
  );
}

function QCard({ q, idx, state, here, practice, note, solo, config, onAnswer, onSkip, onReveal, onNote }) {
  const [showSol, setShowSol] = useState(false);
  const keys = LETTERS.filter((k) => q.options[k] != null);
  const longest = Math.max(0, ...keys.map((k) => String(q.options[k]).length));
  const answer = (q.answer || "").toLowerCase();
  const st = state || {};
  const finished = practice ? !!(st.solved || st.skipped || st.revealed) : !!st.done;

  useEffect(() => { if (practice && (st.revealed || st.solved) && st.tries && st.tries.length > 1) setShowSol(true); },
           [st.revealed, st.solved]);

  return (
    <div className={"qitem" + (finished ? " done" : "") + (here ? " here" : "") + (st.skipped ? " skipped" : "")}
         style={!CALM ? { animationDelay: Math.min(idx * 45, 220) + "ms" } : undefined}>
      {solo && q.dirs && <div className="dirs"><b>Instructions</b><Rich text={q.dirs} /></div>}
      <div className="qhead">
        <span className="qnum">Q{q.q_no}</span>
        <div className="qtext">{q.stem ? <Rich text={q.stem} /> : "(question text not captured — open the PDF)"}</div>
      </div>

      <div className={"opts" + (longest <= 34 ? " row" : "")}>
        {keys.map((k) => {
          let cls = "opt";
          if (practice) {
            const tried = (st.tries || []).includes(k);
            if (st.solved && k === answer) cls += " right";
            else if (tried) cls += " wrong";
            if (st.revealed && k === answer) cls += " right";
          } else if (st.done) {
            if (st.chosen === k) cls += " chosen picked";
          }
          const dead = practice
            ? st.solved || st.revealed || st.skipped || (st.tries || []).includes(k)
            : !!st.done;
          return (
            <button key={k} className={cls} disabled={dead} onClick={() => onAnswer(k)}>
              <span className="key">{k.toUpperCase()}</span>
              <span><Rich text={q.options[k]} /></span>
            </button>
          );
        })}
      </div>

      <div className="qfoot">
        {practice ? (
          <>
            {st.solved && <span className="pill right">
              Got it{st.tries && st.tries.length > 1 ? " — after " + st.tries.length + " tries" : " first time"}
            </span>}
            {st.revealed && <span className="pill na">Answer shown — {(q.answer || "").toUpperCase()}</span>}
            {st.skipped && <span className="pill na">Skipped</span>}
            {(st.solved || st.revealed) && st.secs != null && (
              <span className="tchip" style={{ color: "var(--" + pace(st.secs) + ")" }}>{st.secs.toFixed(1)}s</span>
            )}
            {!finished && (
              <>
                <button className="ghost" onClick={onReveal}>Show me</button>
                <button className="ghost" onClick={onSkip}>Skip</button>
              </>
            )}
            {q.solution && finished && (
              <button className="ghost" onClick={() => setShowSol((v) => !v)}>
                {showSol ? "Hide working" : "Working"}
              </button>
            )}
            {config.pdfs && finished && <a className="srclink" href={pdfSrc(q.set)} target="_blank" rel="noreferrer">PDF</a>}
            <SourceLine q={q} showAnswer={finished} />
          </>
        ) : (
          <>
            {st.done && !st.skipped && <span className="pill na">Answered {st.chosen.toUpperCase()}</span>}
            {st.skipped && <span className="pill na">Skipped</span>}
            {!st.done && <button className="ghost" onClick={onSkip}>Skip</button>}
          </>
        )}
      </div>

      {practice && showSol && q.solution && <div className="sol"><Rich text={q.solution} /></div>}
      {practice && finished && <NoteBox value={note} onSave={onNote} />}
    </div>
  );
}

export default function Runner({ data, progress, notes, F, session, onFinish, snap, onSnap }) {
  const practice = F.style === "practice";
  const [bi, setBi] = useState(() => Math.min((snap && snap.bi) || 0, session.blocks.length - 1));
  const [states, setStates] = useState(() => (snap && snap.states) || {});
  const [results, setResults] = useState(() => (snap && snap.results) || []);
  const segT = useRef(performance.now());
  const sidRef = useRef(null);
  const listRef = useRef(null);
  const startedAt = useRef((snap && snap.started) || Date.now());

  /* A practice run writes nothing but notes: no session row, no attempts, no
     mark on your progress. Only a test creates a session. A resumed test keeps
     the session it started with. */
  if (!practice && !sidRef.current && snap && snap.sid) {
    sidRef.current = snap.sid;
    if (!progress.sessions.some((x) => x.sid === snap.sid))
      progress.startSession({ sid: snap.sid, started: snap.started || Date.now(), planned: session.total,
                              style: "test", filter: { ...F } });
  }
  if (!practice && !sidRef.current) {
    sidRef.current = "s_" + uid();
    progress.startSession({
      sid: sidRef.current, started: Date.now(), planned: session.total, style: "test",
      filter: {
        preset: F.preset, sections: F.sections.slice(),
        topics: F.topics.slice(), subtopics: F.subtopics.slice(),
        order: F.order, limit: F.limit,
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

  const isFinished = (q) => {
    const s = states[qKey(q)];
    return !!s && (practice ? s.solved || s.skipped || s.revealed : s.done);
  };
  const openIdx = blk.findIndex((q) => !isFinished(q));
  const blockDone = openIdx === -1;

  useEffect(() => { segT.current = performance.now(); }, [bi]);
  useEffect(() => {
    if (onSnap) onSnap({ bi, states, results, sid: SID, started: startedAt.current });
  }, [bi, states, results]);

  const elapsed = () => {
    const s = (performance.now() - segT.current) / 1000;
    segT.current = performance.now();
    return +s.toFixed(1);
  };

  const recordTest = useCallback((q, patch) => {
    const key = (q.answer || "").toLowerCase();
    const rec = {
      id: uid(), sid: SID, set: q.set, q_no: q.q_no,
      topic: meta.topic || (data.sets[q.set] || {}).topic || "",
      section: (data.sets[q.set] || {}).section || "",
      subtopic: (data.sets[q.set] || {}).subtopic || "",
      chosen: patch.chosen || "-", answer: key.toUpperCase(),
      correct: patch.skipped ? null : key ? patch.chosen === key : null,
      secs: patch.secs, at: Date.now(), style: "test",
    };
    progress.record(rec);
    setResults((r) => r.concat(rec));
    return rec;
  }, [SID, data.sets, progress, meta.topic]);

  const answer = (q, k) => {
    const s = states[qKey(q)] || {};
    if (practice) {
      if (s.solved || s.revealed || s.skipped) return;
      const right = k === (q.answer || "").toLowerCase();
      const tries = (s.tries || []).concat(k);
      // the clock only stops when you get there; a wrong pick keeps it running
      setStates((m) => ({ ...m, [qKey(q)]: right ? { tries, solved: true, secs: elapsed() } : { tries } }));
    } else {
      if (s.done) return;
      const secs = elapsed();
      setStates((m) => ({ ...m, [qKey(q)]: { done: true, chosen: k, secs } }));
      recordTest(q, { chosen: k, secs });
    }
  };
  const skip = (q) => {
    if (isFinished(q)) return;
    const secs = elapsed();
    setStates((m) => ({ ...m, [qKey(q)]: { ...(m[qKey(q)] || {}), skipped: true, done: true, chosen: "-", secs } }));
    if (!practice) recordTest(q, { skipped: true, chosen: "-", secs });
  };
  const reveal = (q) => {
    if (isFinished(q)) return;
    setStates((m) => ({ ...m, [qKey(q)]: { ...(m[qKey(q)] || {}), revealed: true, secs: elapsed() } }));
  };

  const next = () => {
    if (bi + 1 < session.blocks.length) {
      setBi(bi + 1);
      scrollTo({ top: 0, behavior: CALM ? "auto" : "smooth" });
    } else end();
  };
  const end = () => {
    if (!practice) progress.endSession(SID, results.length);
    onFinish({ results, style: F.style, sid: SID, notesWritten: notes.count });
  };

  useEffect(() => {
    const onKey = (e) => {
      if (/input|select|textarea/i.test(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const open = blk[openIdx];
      if (/^[a-e]$/.test(k) && open) {
        if (LETTERS.filter((x) => open.options[x] != null).includes(k)) { e.preventDefault(); answer(open, k); }
      } else if (/^[1-5]$/.test(k) && open) {
        const key = LETTERS.filter((x) => open.options[x] != null)[+k - 1];
        if (key) { e.preventDefault(); answer(open, key); }
      } else if (k === "k" && open) { e.preventDefault(); skip(open); }
      else if (k === "s" && open && practice) { e.preventDefault(); reveal(open); }
      else if (k === "enter" && blockDone) { e.preventDefault(); next(); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [blk, states, blockDone, practice, openIdx]);

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(".qitem.here");
    if (el && Object.keys(states).length) el.scrollIntoView({ block: "center", behavior: CALM ? "auto" : "smooth" });
  }, [openIdx]);

  const settled = blk.filter(isFinished).length;
  const frac = (bi + settled / blk.length) / session.blocks.length;

  return (
    <>
      <div className="topline" style={{ width: Math.min(1, frac) * 100 + "%" }} />
      <div className="runbar">
        <Clock key={bi + ":" + openIdx} from={segT} />
        <div className="prog">
          <div className="crumb">
            <b>{meta.topic || ""}</b> · {meta.subtopic || first.set}
            {blk.length > 1 && <span className="grp">{blk.length} on this {first.img ? "chart" : "passage"}</span>}
            <span className={"mode " + F.style}>{practice ? "Practice" : "Test"}</span>
          </div>
          <div className="bar"><i style={{ width: Math.min(1, frac) * 100 + "%" }} /></div>
        </div>
        <div className="crumb num">set {bi + 1} / {session.blocks.length}</div>
        <button className="ghost" onClick={end}>End</button>
      </div>

      <div className={"blockwrap" + (stack ? " stack" : shared ? "" : " solo")}>
        {shared && (
          <div className="stimulus">
            {first.dirs && <div className="dirs"><b>Instructions</b><Rich text={first.dirs} /></div>}
            {first.passage && <div className="ptext"><Rich text={first.passage} /></div>}
            {(first.img || []).map((src) => (
              <img key={src} src={imgSrc(src)} alt="Stimulus for this set" loading="lazy" decoding="async" />
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
                   note={notes.get(qKey(q))}
                   onAnswer={(k) => answer(q, k)} onSkip={() => skip(q)} onReveal={() => reveal(q)}
                   onNote={(text) => notes.set(qKey(q), text)} />
          ))}
        </div>
      </div>

      <div className="blockbar">
        <p className="hint">
          <kbd>A</kbd>–<kbd>E</kbd> answer · <kbd>K</kbd> skip
          {practice && <> · <kbd>S</kbd> show me</>} · <kbd>Enter</kbd> continue
        </p>
        <button className="next" disabled={!blockDone} onClick={next}>
          {bi + 1 < session.blocks.length ? "Next set" : "Finish"}
        </button>
      </div>
    </>
  );
}
