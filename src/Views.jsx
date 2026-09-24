import React, { useState, useMemo } from "react";
import { PACE, pace, fmt, qKey, pdfSrc, imgSrc } from "./store.js";

function Tile({ k, v, sub }) {
  return (
    <div className="tile">
      <div className="k">{k}</div>
      <div className="v">{v}{sub && <small> {sub}</small>}</div>
    </div>
  );
}

/* One answered question, reopened: stem, what you chose, the right answer and
   the working. Used by the end-of-session screen and by session review, which
   is how Test mode shows you everything it held back while you were working. */
function Recap({ rec, q, config }) {
  const [open, setOpen] = useState(false);
  const right = rec.correct === true;
  const wrong = rec.correct === false;
  return (
    <div className={"recap" + (right ? " r" : wrong ? " w" : "")}>
      <div className="rhead">
        <span className="qnum">Q{rec.q_no}</span>
        <span className="note">{rec.topic}</span>
        <span className={"pill " + (rec.revealed ? "na" : right ? "right" : wrong ? "wrong" : "na")}>
          {rec.revealed ? "Solution shown"
            : rec.correct === null ? "Not marked"
            : right ? "Correct" : "Wrong — " + rec.answer}
        </span>
        <span className="tchip" style={{ color: "var(--" + pace(rec.secs) + ")" }}>{rec.secs.toFixed(1)}s</span>
        {q && (q.solution || q.passage) && (
          <button className="ghost" onClick={() => setOpen((v) => !v)}>{open ? "Hide" : "Look again"}</button>
        )}
        {config.pdfs && <a className="srclink" href={pdfSrc(rec.set)} target="_blank" rel="noreferrer">PDF</a>}
      </div>
      {open && q && (
        <div className="rbody">
          {q.dirs && <div className="dirs"><b>Instructions</b>{q.dirs}</div>}
          {q.passage && <div className="ptext">{q.passage}</div>}
          {(q.img || []).map((s) => <img key={s} src={imgSrc(s)} alt="" loading="lazy" />)}
          <div className="qtext">{q.stem}</div>
          <div className="opts">
            {["a", "b", "c", "d", "e"].filter((k) => q.options[k] != null).map((k) => {
              const key = (q.answer || "").toLowerCase();
              return (
                <div key={k} className={"opt" + (k === key ? " right" : k === rec.chosen && wrong ? " wrong" : "")}>
                  <span className="key">{k.toUpperCase()}</span><span>{q.options[k]}</span>
                </div>
              );
            })}
          </div>
          {q.solution && <div className="sol">{q.solution}</div>}
        </div>
      )}
    </div>
  );
}

export function Done({ data, outcome, onAgain, config }) {
  const r = outcome.results;
  if (!r.length) return <div className="empty">Nothing answered. <button className="linky" onClick={onAgain}>Back to practice</button></div>;
  const tot = r.reduce((s, a) => s + a.secs, 0);
  const scored = r.filter((a) => a.correct !== null);
  const corr = r.filter((a) => a.correct === true).length;
  const byKey = {};
  for (const q of data.questions) byKey[qKey(q)] = q;
  return (
    <>
      <h2>Session done</h2>
      <p className="note">{outcome.style === "test" ? "Test mode — here is everything it held back." : "Practice session."}</p>
      <div className="tiles" style={{ marginTop: 16 }}>
        <Tile k="Questions" v={r.length} />
        <Tile k="Score" v={scored.length ? corr + "/" + scored.length : "—"} />
        <Tile k="Total time" v={fmt(tot)} />
        <Tile k="Avg per question" v={(tot / r.length).toFixed(1) + "s"} sub={"target " + PACE + "s"} />
        <Tile k="On pace" v={r.filter((a) => a.secs <= PACE).length + "/" + r.length} />
      </div>
      <h3 style={{ margin: "22px 0 10px" }}>Question by question</h3>
      <div className="recaps">
        {r.map((rec) => <Recap key={rec.id} rec={rec} q={byKey[rec.set + "#" + rec.q_no]} config={config} />)}
      </div>
      <button className="go" style={{ maxWidth: 240, marginTop: 20 }} onClick={onAgain}>Back to practice</button>
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
      <button className="linky" onClick={onBack}>← Back to stats</button>
      <h2 style={{ marginTop: 8 }}>Session review</h2>
      <p className="note">
        {s ? new Date(s.started).toLocaleString() : ""} · {r.length} questions
        {s && s.style && <> · {s.style === "test" ? "Test" : "Practice"} mode</>}
      </p>
      <div className="recaps" style={{ marginTop: 16 }}>
        {r.map((rec) => <Recap key={rec.id} rec={rec} q={byKey[rec.set + "#" + rec.q_no]} config={config} />)}
      </div>
    </>
  );
}

export function Stats({ data, progress, onReview, refresh, config }) {
  const [busy, setBusy] = useState("");
  const A = progress.attempts;
  const flagged = useMemo(
    () => data.questions.filter((q) => progress.flags.has(qKey(q))), [data.questions, progress.flags.size]);

  if (!A.length && !flagged.length)
    return <div className="empty">Nothing solved yet. Run a session and your times show up here.</div>;

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

  const act = async (fn, label) => { setBusy(label); await fn(); setBusy(""); refresh(); };

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify({
      version: 1, sessions: progress.sessions, attempts: A, flags: [...progress.flags],
    }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "progress-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const importBackup = async (file) => {
    const d = JSON.parse(await file.text());
    const inA = d.attempts || (Array.isArray(d) ? d : []);
    const have = new Set(A.map((x) => x.id || x.sid + "#" + x.set + "#" + x.q_no + "#" + x.at));
    const fresh = inA.filter((x) => !have.has(x.id || x.sid + "#" + x.set + "#" + x.q_no + "#" + x.at));
    await progress.replaceAll({
      attempts: A.concat(fresh),
      sessions: progress.sessions.concat((d.sessions || []).filter((x) => !progress.sessions.some((y) => y.sid === x.sid))),
      flags: [...new Set([...progress.flags, ...(d.flags || [])])],
    });
    refresh();
    alert("Imported " + fresh.length + " attempts (" + (inA.length - fresh.length) + " already here).");
  };

  return (
    <>
      <div className="tiles">
        <Tile k="Solved" v={A.length.toLocaleString()} />
        <Tile k="Accuracy" v={scored.length ? Math.round((corr / scored.length) * 100) + "%" : "—"}
              sub={scored.length ? corr + "/" + scored.length : ""} />
        <Tile k="Time spent" v={fmt(tot)} />
        <Tile k="Avg pace" v={A.length ? (tot / A.length).toFixed(1) + "s" : "—"} sub={"target " + PACE + "s"} />
        <Tile k="Flagged" v={flagged.length} sub="to revisit" />
      </div>

      {!!rows.length && (
        <>
          <h3 style={{ margin: "6px 0 10px" }}>By topic</h3>
          <div className="scroll">
            <table>
              <thead><tr><th>Topic</th><th className="r">Solved</th><th className="r">Accuracy</th><th className="r">Avg time</th><th>Pace</th></tr></thead>
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
        </>
      )}

      {!!flagged.length && (
        <>
          <h3 style={{ margin: "22px 0 10px" }}>Flagged questions</h3>
          <div className="scroll">
            <table>
              <thead><tr><th>Topic</th><th>Set</th><th className="r">Q</th><th></th><th></th></tr></thead>
              <tbody>
                {flagged.slice(0, 60).map((q) => (
                  <tr key={qKey(q)}>
                    <td className="note">{(data.sets[q.set] || {}).topic}</td>
                    <td>{(data.sets[q.set] || {}).subtopic || q.set}</td>
                    <td className="r num">{q.q_no}</td>
                    <td>{config.pdfs && <a href={pdfSrc(q.set)} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>PDF</a>}</td>
                    <td><button className="ghost" onClick={() => { progress.toggleFlag(qKey(q)); refresh(); }}>Unflag</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {flagged.length > 60 && <p className="note">Showing 60 of {flagged.length}. Use Practice → Which questions → Flagged to drill them.</p>}
        </>
      )}

      {!!sessions.length && (
        <>
          <h3 style={{ margin: "22px 0 10px" }}>Sessions</h3>
          <div className="scroll">
            <table>
              <thead><tr><th>When</th><th>Mode</th><th>Filter</th><th className="r">Qs</th><th className="r">Score</th><th className="r">Avg</th><th></th></tr></thead>
              <tbody>
                {sessions.slice(0, 40).map((x) => {
                  const as = A.filter((a) => a.sid === x.sid);
                  const sc = as.filter((a) => a.correct !== null);
                  const avg = as.reduce((t, a) => t + a.secs, 0) / as.length;
                  const f = x.filter || {};
                  const shape = [f.standalone && "standalone", f.grouped && "grouped"].filter(Boolean).join("+");
                  const what = [(f.sections || []).join("/"), (f.topics || []).join("/"),
                                (f.subtopics || []).join("/"), shape].filter(Boolean).join(" · ") || "everything";
                  return (
                    <tr key={x.sid}>
                      <td className="note">{new Date(x.started).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                      <td><span className={"mode " + (x.style || "practice")}>{x.style === "test" ? "Test" : "Practice"}</span></td>
                      <td>{what}</td>
                      <td className="r num">{as.length}</td>
                      <td className="r num">{sc.length ? sc.filter((a) => a.correct).length + "/" + sc.length : "—"}</td>
                      <td className="r num" style={{ color: "var(--" + pace(avg) + ")" }}>{avg.toFixed(1)}s</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button className="ghost" onClick={() => onReview(x.sid)}>Review</button>{" "}
                        <ArmedButton label="Delete" onConfirm={() => act(() => progress.wipe("sid=" + encodeURIComponent(x.sid)), "s")} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h3 style={{ margin: "26px 0 10px" }}>Your history</h3>
      <p className="note">
        {progress.api
          ? "Saved in progress.json next to the app — the same history in every browser, and on your phone over wifi."
          : "Saved in this browser only (the server isn't running, so there's nowhere else to put it)."}
      </p>
      <div className="toolrow">
        <button className="ghost" onClick={exportBackup}>Export backup</button>
        <label className="ghost filebtn">
          Import backup
          <input type="file" accept="application/json,.json" hidden
                 onChange={(e) => e.target.files[0] && importBackup(e.target.files[0])} />
        </label>
        <select defaultValue="" onChange={(e) => {
          const t = e.target.value; e.target.value = "";
          if (t && confirm("Delete all " + A.filter((a) => a.topic === t).length + ' attempts for "' + t + '"?'))
            act(() => progress.wipe("topic=" + encodeURIComponent(t)), "t");
        }}>
          <option value="">Reset one topic…</option>
          {[...new Set(A.map((a) => a.topic))].filter(Boolean).sort().map((t) => <option key={t}>{t}</option>)}
        </select>
        <ArmedButton label="Clear everything" armedLabel="Click again to erase all history"
                     onConfirm={() => act(() => progress.wipe(""), "all")} />
        {busy && <span className="note">working…</span>}
      </div>
    </>
  );
}

function ArmedButton({ label, armedLabel, onConfirm }) {
  const [armed, setArmed] = useState(false);
  return (
    <button className={"ghost" + (armed ? " danger" : "")}
            onClick={() => (armed ? onConfirm() : setArmed(true))}
            onBlur={() => setArmed(false)}>
      {armed ? armedLabel || "Sure?" : label}
    </button>
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
          <thead><tr><th>Set</th><th>Topic</th><th>Section</th><th className="r">Qs</th><th className="r">Pages</th><th></th></tr></thead>
          <tbody>
            {rows.map(([slug, s]) => (
              <tr key={slug}>
                <td>{s.subtopic}</td>
                <td className="note">{s.topic}</td>
                <td className="note">{s.section}</td>
                <td className="r num">{(data.bySet[slug] || []).length}</td>
                <td className="r num">{s.pages}</td>
                <td>{config.pdfs && <a href={pdfSrc(slug)} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>PDF</a>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
