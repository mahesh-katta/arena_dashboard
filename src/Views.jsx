import React, { useState, useMemo } from "react";
import { PACE, pace, fmt, qKey, pdfSrc, imgSrc, BANK } from "./store.js";
import Rich from "./Rich.jsx";
import SourceLine from "./Source.jsx";

function Tile({ k, v, sub }) {
  return (
    <div className="tile">
      <div className="k">{k}</div>
      <div className="v">{v}{sub && <small> {sub}</small>}</div>
    </div>
  );
}

/* One answered question reopened: the stimulus, what you chose, the right
   answer and the working. This is how a test gives back everything it held
   while you were sitting it. */
function Recap({ rec, q, config }) {
  const [open, setOpen] = useState(false);
  const right = rec.correct === true;
  const wrong = rec.correct === false;
  return (
    <div className={"recap" + (right ? " r" : wrong ? " w" : "")}>
      <div className="rhead">
        <span className="qnum">Q{rec.q_no}</span>
        <span className="note">{rec.topic}</span>
        <span className={"pill " + (right ? "right" : wrong ? "wrong" : "na")}>
          {rec.chosen === "-" ? "Skipped"
            : rec.correct === null ? "Not marked"
            : right ? "Correct" : "Wrong — " + rec.answer}
        </span>
        <span className="tchip" style={{ color: "var(--" + pace(rec.secs) + ")" }}>{rec.secs.toFixed(1)}s</span>
        {q && <button className="ghost" onClick={() => setOpen((v) => !v)}>{open ? "Hide" : "Look again"}</button>}
        {config.pdfs && <a className="srclink" href={pdfSrc(rec.set)} target="_blank" rel="noreferrer">PDF</a>}
      </div>
      {open && q && (
        <div className="rbody">
          {q.dirs && <div className="dirs"><b>Instructions</b><Rich text={q.dirs} /></div>}
          {q.passage && <div className="ptext"><Rich text={q.passage} /></div>}
          {(q.img || []).map((s) => <img key={s} src={imgSrc(s)} alt="" loading="lazy" />)}
          <div className="qtext"><Rich text={q.stem} /></div>
          <div className="opts">
            {["a", "b", "c", "d", "e"].filter((k) => q.options[k] != null).map((k) => {
              const key = (q.answer || "").toLowerCase();
              return (
                <div key={k} className={"opt" + (k === key ? " right" : k === rec.chosen && wrong ? " wrong" : "")}>
                  <span className="key">{k.toUpperCase()}</span><span><Rich text={q.options[k]} /></span>
                </div>
              );
            })}
          </div>
          {q.solution && <div className="sol"><Rich text={q.solution} /></div>}
          <div className="qfoot"><SourceLine q={q} /></div>
        </div>
      )}
    </div>
  );
}

/* Where a session lands: a test hands you the marking, a practice run hands you
   what you wrote. Neither dumps you back on a settings screen. */
export function Done({ data, outcome, notes, config, onStats, onNotes, onAgain, courseInfo, onContinue, onCourse }) {
  if (outcome.style === "practice") {
    const c = courseInfo;
    const pct = c && c.total ? Math.floor((c.done / c.total) * 100) : 0;
    return (
      <div className="doneprac">
        <p className="eyebrow">{outcome.mode === "revise" ? "Revision done" : "Sitting done"}</p>
        <h2>{c ? c.name : "Practice done"}</h2>
        <div className="tiles" style={{ marginTop: 16 }}>
          <Tile k="Solved this sitting" v={outcome.solvedNow || 0} sub={outcome.mode === "revise" ? "revision" : "new"} />
          {c && <Tile k={c.level + " progress"} v={pct + "%"} sub={c.done + " / " + c.total} />}
          <Tile k="Notes you have" v={notes.count} sub={notes.count === 1 ? "note" : "notes"} />
        </div>
        <div className="toolrow" style={{ marginTop: 20 }}>
          {c && c.done < c.total && (
            <button className="go grad" style={{ maxWidth: 260 }} onClick={onContinue}>Continue — next stretch</button>
          )}
          <button className="ghost big" onClick={onCourse}>Back to the course</button>
          {notes.count > 0 && <button className="ghost big" onClick={onNotes}>Read your notes</button>}
        </div>
      </div>
    );
  }

  const r = outcome.results;
  if (!r.length)
    return <div className="empty">Nothing answered. <button className="linky" onClick={onAgain}>Start again</button></div>;

  const tot = r.reduce((s, a) => s + a.secs, 0);
  const scored = r.filter((a) => a.correct !== null);
  const corr = r.filter((a) => a.correct === true).length;
  const byKey = {};
  for (const q of data.questions) byKey[qKey(q)] = q;

  return (
    <>
      <h2>Test done</h2>
      <p className="note">Everything it held back while you were working:</p>
      <div className="tiles" style={{ marginTop: 16 }}>
        <Tile k="Questions" v={r.length} />
        <Tile k="Score" v={scored.length ? corr + "/" + scored.length : "—"} />
        <Tile k="Total time" v={fmt(tot)} />
        <Tile k="Avg per question" v={(tot / r.length).toFixed(1) + "s"} sub={"target " + PACE + "s"} />
        <Tile k="Added to progress" v={corr} sub="correct" />
      </div>
      <h3 style={{ margin: "22px 0 10px" }}>Question by question</h3>
      <div className="recaps">
        {r.map((rec) => <Recap key={rec.id} rec={rec} q={byKey[rec.set + "#" + rec.q_no]} config={config} />)}
      </div>
      <div className="toolrow" style={{ marginTop: 20 }}>
        <button className="go" style={{ maxWidth: 200 }} onClick={onStats}>See your stats</button>
        <button className="ghost" onClick={onAgain}>Another round</button>
      </div>
    </>
  );
}

export function Review({ data, progress, sid, onBack, config }) {
  const r = progress.attempts.filter((a) => a.sid === sid);
  const s = progress.sessions.find((x) => x.sid === sid);
  const byKey = {};
  for (const q of data.questions) byKey[qKey(q)] = q;
  return (
    <>
      <button className="linky" onClick={onBack}>← back to stats</button>
      <h2 style={{ marginTop: 8 }}>Session review</h2>
      <p className="note">{s ? new Date(s.started).toLocaleString() : ""} · {r.length} questions</p>
      <div className="recaps" style={{ marginTop: 16 }}>
        {r.map((rec) => <Recap key={rec.id} rec={rec} q={byKey[rec.set + "#" + rec.q_no]} config={config} />)}
      </div>
    </>
  );
}

/* Stats reads the same attempts Progress counts — it holds no numbers of its
   own. Practice contributes nothing here, by design. */
export function Stats({ data, progress, notes, onReview, onStart, config }) {
  const A = progress.attempts;
  if (!A.length)
    return (
      <div className="empty">
        <h3>Nothing to analyse yet</h3>
        <p className="note">Sit a test and your accuracy and pace show up here. Practice doesn't count.</p>
        <button className="go" style={{ maxWidth: 220, marginTop: 18 }} onClick={onStart}>Start a test</button>
      </div>
    );

  const tot = A.reduce((s, a) => s + a.secs, 0);
  const scored = A.filter((a) => a.correct !== null);
  const corr = scored.filter((a) => a.correct).length;

  const by = {};
  A.forEach((a) => (by[a.topic] || (by[a.topic] = [])).push(a));
  const rows = Object.entries(by).map(([t, as]) => {
    const sc = as.filter((a) => a.correct !== null);
    return {
      t, n: as.length,
      acc: sc.length ? sc.filter((a) => a.correct).length / sc.length : null,
      avg: as.reduce((s, a) => s + a.secs, 0) / as.length,
    };
  }).sort((a, b) => b.n - a.n);

  const sessions = progress.sessions
    .filter((x) => A.some((a) => a.sid === x.sid))
    .sort((x, y) => (y.started || 0) - (x.started || 0));

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify({
      version: 1, sessions: progress.sessions, attempts: A, notes: notes ? notes.map : undefined,
    }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "progress-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <>
      <div className="tiles">
        <Tile k="Answered in tests" v={A.length.toLocaleString()} />
        <Tile k="Accuracy" v={scored.length ? Math.round((corr / scored.length) * 100) + "%" : "—"}
              sub={scored.length ? corr + "/" + scored.length : ""} />
        <Tile k="Time spent" v={fmt(tot)} />
        <Tile k="Avg pace" v={(tot / A.length).toFixed(1) + "s"} sub={"target " + PACE + "s"} />
        <Tile k="Within pace" v={Math.round((A.filter((a) => a.secs <= PACE).length / A.length) * 100) + "%"} />
      </div>

      <h3 style={{ margin: "6px 0 10px" }}>By topic</h3>
      <div className="scroll">
        <table>
          <thead><tr><th>Topic</th><th className="r">Answered</th><th className="r">Accuracy</th><th className="r">Avg time</th><th>Pace</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.t}>
                <td>{r.t}</td>
                <td className="r num">{r.n}</td>
                <td className="r num">{r.acc == null ? "—" : Math.round(r.acc * 100) + "%"}</td>
                <td className="r num" style={{ color: "var(--" + pace(r.avg) + ")" }}>{r.avg.toFixed(1)}s</td>
                <td><div className="bar"><i style={{ width: Math.min(100, (r.avg / (PACE * 2)) * 100) + "%", background: "var(--" + pace(r.avg) + ")" }} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ margin: "22px 0 10px" }}>Slowest questions</h3>
      <div className="scroll">
        <table>
          <thead><tr><th>Topic</th><th>Set</th><th className="r">Q</th><th className="r">Time</th><th></th></tr></thead>
          <tbody>
            {[...A].sort((a, b) => b.secs - a.secs).slice(0, 15).map((a) => {
              const m = data.sets[a.set] || {};
              return (
                <tr key={a.id}>
                  <td className="note">{a.topic}</td>
                  <td>{m.subtopic || a.set}</td>
                  <td className="r num">{a.q_no}</td>
                  <td className="r num" style={{ color: "var(--slow)" }}>{a.secs.toFixed(1)}s</td>
                  <td>{config.pdfs && <a href={pdfSrc(a.set)} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>PDF</a>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!!sessions.length && (
        <>
          <h3 style={{ margin: "22px 0 10px" }}>Sessions</h3>
          <div className="scroll">
            <table>
              <thead><tr><th>When</th><th>What</th><th className="r">Qs</th><th className="r">Score</th><th className="r">Avg</th><th></th></tr></thead>
              <tbody>
                {sessions.slice(0, 40).map((x) => {
                  const as = A.filter((a) => a.sid === x.sid);
                  const sc = as.filter((a) => a.correct !== null);
                  const avg = as.reduce((t, a) => t + a.secs, 0) / as.length;
                  const f = x.filter || {};
                  const what = [f.preset && f.preset !== "all" ? f.preset : "",
                                (f.sections || []).join("/"), (f.topics || []).join("/"),
                                (f.subtopics || []).join("/")].filter(Boolean).join(" · ") || "everything";
                  return (
                    <tr key={x.sid}>
                      <td className="note">{new Date(x.started).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                      <td>{what}</td>
                      <td className="r num">{as.length}</td>
                      <td className="r num">{sc.length ? sc.filter((a) => a.correct).length + "/" + sc.length : "—"}</td>
                      <td className="r num" style={{ color: "var(--" + pace(avg) + ")" }}>{avg.toFixed(1)}s</td>
                      <td><button className="ghost" onClick={() => onReview(x.sid)}>Review</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h3 style={{ margin: "26px 0 10px" }}>Backup</h3>
      <p className="note">
        {progress.api
          ? "Progress lives in " + BANK + "_progress.json and notes in " + BANK + "_notes.json, both beside the app."
          : "The server isn't running, so nothing here is being saved. Start it with start.command or start.bat."}
      </p>
      <div className="toolrow">
        <button className="ghost" onClick={exportBackup}>Export everything</button>
        <span className="note">To clear anything, use Reset — it works level by level.</span>
      </div>
    </>
  );
}

export function SetsView({ data, config }) {
  const [term, setTerm] = useState("");
  const rows = useMemo(() => {
    const t = term.toLowerCase();
    return Object.entries(data.sets)
      .filter(([, s]) => !t || (s.subtopic + " " + s.topic + " " + s.section).toLowerCase().includes(t))
      .slice(0, 400);
  }, [term, data.sets]);
  return (
    <>
      <div className="panel" style={{ marginBottom: 16 }}>
        <input type="search" placeholder="Search sets and topics…" value={term}
               onChange={(e) => setTerm(e.target.value)} autoFocus />
      </div>
      <div className="scroll">
        <table>
          <thead><tr><th>Set</th><th>Topic</th><th>Section</th><th className="r">Qs</th><th></th></tr></thead>
          <tbody>
            {rows.map(([slug, s]) => (
              <tr key={slug}>
                <td>{s.subtopic}</td>
                <td className="note">{s.topic}</td>
                <td className="note">{s.section}</td>
                <td className="r num">{(data.bySet[slug] || []).length}</td>
                <td>{config.pdfs && <a href={pdfSrc(slug)} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>PDF</a>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
