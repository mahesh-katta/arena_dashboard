import React, { useState, useMemo, useEffect } from "react";
import { imgSrc } from "./store.js";
import Rich from "./Rich.jsx";
import SourceLine from "./Source.jsx";
import { summarise, fmtClock, fmtSecs } from "./mock.js";

const pct = (x) => (x == null ? "—" : Math.round(x * 100) + "%");
const mk = (v) => (Math.round(v * 100) / 100).toString();
const RES = {
  right: ["Correct", "right"], wrong: ["Wrong", "wrong"], skipped: ["Not answered", "na"],
  timeout: ["Timed out", "to"], unmarked: ["No key", "na"],
};
const PIN = "1234";

function Tile({ k, v, sub, tone }) {
  return (
    <div className={"tile" + (tone ? " " + tone : "")}>
      <div className="k">{k}</div>
      <div className="v">{v}{sub != null && <small> {sub}</small>}</div>
    </div>
  );
}

/* Every question as a bar: height is the time you spent, colour is how it went.
   Groups sit on a shaded band; the dashed line is the standalone budget. */
function TimeMap({ rows, mock, att, onPick }) {
  const W = 1000, H = 190, pad = 24;
  const max = Math.max(30, ...rows.map((r) => r.t));
  const bw = (W - pad) / rows.length;
  const y = (t) => H - 18 - (t / max) * (H - 36);
  const qb = att.plan.limits.question;
  const bands = [];
  rows.forEach((r, i) => {
    if (!r.group) return;
    const last = bands[bands.length - 1];
    if (last && last.block === r.block) last.to = i;
    else bands.push({ block: r.block, from: i, to: i });
  });
  const secStarts = rows.map((r, i) => (i === 0 || rows[i - 1].sec !== r.sec ? i : -1)).filter((i) => i >= 0);
  return (
    <div className="timemap">
      <svg viewBox={"0 0 " + W + " " + H} preserveAspectRatio="none" role="img" aria-label="Time spent on each question">
        {bands.map((b) => (
          <rect key={b.block} x={pad + b.from * bw} y={4} width={(b.to - b.from + 1) * bw} height={H - 22} className="tmband" />
        ))}
        {secStarts.map((i) => (
          <g key={"s" + i}>
            {i > 0 && <line x1={pad + i * bw} x2={pad + i * bw} y1={0} y2={H - 18} className="tmsec" />}
            <text x={pad + i * bw + 4} y={14} className="tmlabel">{mock.sections[rows[i].sec].short}</text>
          </g>
        ))}
        {qb != null && qb < max && <line x1={pad} x2={W} y1={y(qb)} y2={y(qb)} className="tmbudget" />}
        {rows.map((r, i) => (
          <rect key={r.no} x={pad + i * bw + bw * 0.15} width={Math.max(1, bw * 0.7)}
                y={y(r.t)} height={Math.max(1.5, H - 18 - y(r.t))} className={"tmbar " + r.result}
                onClick={() => onPick(r.no)}>
            <title>{"Q" + r.no + " · " + RES[r.result][0] + " · " + fmtSecs(r.t) + (r.group ? " · group" : "")}</title>
          </rect>
        ))}
        <text x={2} y={y(max) + 4} className="tmlabel">{fmtSecs(max)}</text>
        <text x={2} y={H - 20} className="tmlabel">0</text>
      </svg>
      <div className="legend">
        <span><i className="sw right" />correct</span><span><i className="sw wrong" />wrong</span>
        <span><i className="sw skipped" />not answered</span><span><i className="sw timeout" />timed out</span>
        <span><i className="sw band" />group</span>{qb != null && <span><i className="sw dash" />{qb}s per question</span>}
      </div>
    </div>
  );
}

function QView({ r, mock }) {
  const q = r.q;
  if (!q) return <p className="note">This question is not in the bank.</p>;
  const b = mock.blocks[r.block];
  const first = b.group ? mock.q[b.q[0]] : q;
  return (
    <div className="rbody">
      {first && first.dirs && <div className="dirs"><b>Directions</b><Rich text={first.dirs} /></div>}
      {first && first.passage && <div className="ptext"><Rich text={first.passage} /></div>}
      {first && (first.img || []).map((s) => <img key={s} src={imgSrc(s)} alt="" loading="lazy" />)}
      {q !== first && q.passage && q.passage !== first.passage && <div className="ptext"><Rich text={q.passage} /></div>}
      <div className="qtext"><Rich text={q.stem} /></div>
      <div className="opts">
        {["a", "b", "c", "d", "e"].filter((k) => q.options[k] != null).map((k) => (
          <div key={k} className={"opt" + (k === r.key ? " right" : k === r.chosen ? " wrong" : "")}>
            <span className="key">{k.toUpperCase()}</span><span><Rich text={q.options[k]} /></span>
          </div>
        ))}
      </div>
      {q.solution ? <div className="sol"><Rich text={q.solution} /></div> : <p className="note">No worked solution in the paper for this one.</p>}
      <div className="qfoot"><SourceLine q={q} /></div>
    </div>
  );
}

const FILTERS = [
  ["all", "All"], ["wrong", "Wrong"], ["open", "Not answered"], ["timeout", "Timed out"],
  ["marked", "Marked"], ["slow", "Slowest 15"], ["group", "Groups"], ["solo", "Standalone"],
];

export default function MockResult({ mock, attempt: att, store, onBack, onRetake }) {
  const S = useMemo(() => summarise(att, mock), [att, mock]);
  const { all, sections, kinds, byTopic, groups, rows } = S;
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(null);
  const [del, setDel] = useState(null);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, []);

  const earlier = store.forMock(mock.id).filter((a) => a.status === "done" && a.id !== att.id && (a.ended || 0) < (att.ended || Infinity));
  const prev = earlier[0] ? summarise(earlier[0], mock).all : null;
  const allotted = att.plan.sections.every((s) => att.plan.limits.section[s] != null)
    ? att.plan.sections.reduce((t, s) => t + att.plan.limits.section[s], 0) : null;
  const unseen = rows.filter((r) => !r.visits).length;
  const qb = att.plan.limits.question;

  /* ---- what to take away ---- */
  const insights = [];
  const slowCut = qb != null ? qb * 1.5 : 75;
  const sinks = rows.filter((r) => r.result === "wrong" && !r.group && r.t > slowCut);
  if (sinks.length)
    insights.push(["slow", sinks.length + " standalone question" + (sinks.length > 1 ? "s" : "") + " took over " + fmtSecs(slowCut) +
      " and still went wrong — " + fmtSecs(sinks.reduce((t, r) => t + r.t, 0)) + " lost (Q" + sinks.map((r) => r.no).join(", Q") + ")."]);
  const rushed = rows.filter((r) => r.result === "wrong" && r.t < 12);
  if (rushed.length)
    insights.push(["ok", rushed.length + " wrong answer" + (rushed.length > 1 ? "s" : "") + " came in under 12 seconds — read those once more before marking (−" + mk(rushed.reduce((t, r) => t + mock.sections[r.sec].neg, 0)) + ")."]);
  if (all.timeout)
    insights.push(["slow", all.timeout + " question" + (all.timeout > 1 ? "s" : "") + " ran out of time unanswered" +
      (groups.some((g) => g.timeout) ? ", " + groups.filter((g) => g.timeout).reduce((t, g) => t + g.timeout, 0) + " of them inside groups" : "") + "."]);
  if (unseen) insights.push(["na", unseen + " question" + (unseen > 1 ? "s were" : " was") + " never reached."]);
  const markedOpen = rows.filter((r) => r.marked && !r.chosen);
  if (markedOpen.length) insights.push(["na", markedOpen.length + " marked for review and left unanswered (Q" + markedOpen.map((r) => r.no).join(", Q") + ")."]);
  const eff = sections.filter((s) => s.used > 0).map((s) => ({ ...s, rate: s.marks / (s.used / 60) }));
  if (eff.length > 1) {
    const best = eff.reduce((a, b) => (b.rate > a.rate ? b : a));
    const worst = eff.reduce((a, b) => (b.rate < a.rate ? b : a));
    if (best !== worst)
      insights.push(["fast", best.name + " paid best: " + mk(best.rate) + " marks a minute, against " + mk(worst.rate) + " in " + worst.name + "."]);
  }
  const [solo, grp] = kinds;
  if (solo.attempted && grp.attempted)
    insights.push(["na", "Standalone: " + pct(solo.acc) + " accurate at " + fmtSecs(solo.avg) + " a question. Groups: " +
      pct(grp.acc) + " at " + fmtSecs(grp.avg) + " a question."]);
  const weak = byTopic.filter((t) => t.attempted >= 3 && t.acc != null && t.acc < 0.5);
  if (weak.length) insights.push(["slow", "Weak here: " + weak.slice(0, 5).map((t) => t.topic + " (" + pct(t.acc) + ")").join(", ") + "."]);
  if (prev) {
    const d = all.marks - prev.marks;
    insights.push([d >= 0 ? "fast" : "slow", (d >= 0 ? "Up " : "Down ") + mk(Math.abs(d)) + " marks on your last sitting of this paper (" + mk(prev.marks) + ")."]);
  }

  const shown = (() => {
    let rs = rows;
    if (filter === "wrong") rs = rs.filter((r) => r.result === "wrong");
    if (filter === "open") rs = rs.filter((r) => r.result === "skipped" || r.result === "timeout");
    if (filter === "timeout") rs = rs.filter((r) => r.timedOut);
    if (filter === "marked") rs = rs.filter((r) => r.marked);
    if (filter === "group") rs = rs.filter((r) => r.group);
    if (filter === "solo") rs = rs.filter((r) => !r.group);
    if (filter === "slow") rs = [...rs].sort((a, b) => b.t - a.t).slice(0, 15);
    return rs;
  })();

  const pick = (no) => {
    setFilter("all");
    setOpen(no);
    setTimeout(() => {
      const el = document.getElementById("mq-" + no);
      if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 30);
  };

  return (
    <div className="mockresult">
      <button className="linky" onClick={onBack}>← all papers</button>
      <div className="mrhead">
        <div>
          <p className="eyebrow" style={{ marginTop: 10 }}>Analysis</p>
          <h2>Model Test {att.n}{att.plan.sections.length < mock.sections.length ? " · " + att.plan.sections.map((i) => mock.sections[i].short).join(" + ") : ""}</h2>
          <p className="note">
            {new Date(att.ended || att.started).toLocaleString()} · sections {att.plan.sections.map((s) => mock.sections[s].short + " " +
              (att.plan.limits.section[s] == null ? "∞" : att.plan.limits.section[s] / 60 + "m")).join(", ")} ·
            {" "}question {qb == null ? "∞" : qb + "s"} · group {att.plan.limits.group == null ? "∞" : att.plan.limits.group / 60 + "m"}
          </p>
        </div>
        <div className="toolrow" style={{ marginTop: 0 }}>
          <button className="ghost big" onClick={() => onRetake(mock)}>Sit it again</button>
        </div>
      </div>

      <div className="scorehero glass">
        <div className="shscore">
          <small>Score</small>
          <b className="num">{mk(all.marks)}</b><span className="num">/ {all.max}</span>
          {prev && <em className={all.marks >= prev.marks ? "up" : "down"}>{all.marks >= prev.marks ? "▲" : "▼"} {mk(Math.abs(all.marks - prev.marks))} vs last time</em>}
        </div>
        <div className="shbar" aria-hidden="true">
          <i className="right" style={{ flex: all.right }} /><i className="wrong" style={{ flex: all.wrong }} />
          <i className="timeout" style={{ flex: all.timeout }} /><i className="skipped" style={{ flex: all.skipped }} />
        </div>
        <div className="shlegend num">
          <span><i className="sw right" />{all.right} correct</span><span><i className="sw wrong" />{all.wrong} wrong</span>
          <span><i className="sw timeout" />{all.timeout} timed out</span><span><i className="sw skipped" />{all.skipped} not answered</span>
        </div>
      </div>

      <div className="tiles" style={{ marginTop: 16 }}>
        <Tile k="Accuracy" v={pct(all.acc)} sub={all.right + "/" + all.attempted} />
        <Tile k="Attempted" v={all.attempted} sub={"of " + all.n} />
        <Tile k="Negative marks" v={"−" + mk(all.neg)} tone={all.neg ? "neg" : ""} />
        <Tile k="Time used" v={fmtClock(att.active)} sub={allotted == null ? "no limit" : "of " + fmtClock(allotted)} />
        <Tile k="Avg per question" v={fmtSecs(all.avg)} sub={"over " + all.seen + " seen"} />
        <Tile k="Avg per attempt" v={fmtSecs(all.avgAttempted)} />
        <Tile k="Timed out" v={all.timeout} />
        <Tile k="Never reached" v={unseen} />
      </div>

      {insights.length > 0 && (
        <>
          <h3 className="mh3">What this sitting says</h3>
          <ul className="insights">
            {insights.map(([tone, t], i) => <li key={i} className={tone}>{t}</li>)}
          </ul>
        </>
      )}

      <h3 className="mh3">Sections</h3>
      <div className="scroll">
        <table>
          <thead><tr><th>Section</th><th className="r">Score</th><th className="r">Right</th><th className="r">Wrong</th><th className="r">Not ans.</th>
            <th className="r">Accuracy</th><th className="r">Time used</th><th className="r">Avg / q</th><th>Ended</th></tr></thead>
          <tbody>
            {sections.map((s) => (
              <tr key={s.si}>
                <td><b>{s.name}</b></td>
                <td className="r num"><b>{mk(s.marks)}</b> / {s.max}</td>
                <td className="r num">{s.right}</td><td className="r num">{s.wrong}</td><td className="r num">{s.skipped + s.timeout}</td>
                <td className="r num">{pct(s.acc)}</td>
                <td className="r num">{fmtClock(s.used)}{s.limit != null ? " / " + fmtClock(s.limit) : ""}</td>
                <td className="r num">{fmtSecs(s.avg)}</td>
                <td className="note">{s.ended === "time" ? "time up" : s.ended === "locked" ? "all clocks out" : s.ended === "submit" ? "submitted" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mh3">Time on every question</h3>
      <p className="note">Click a bar to open that question below.</p>
      <TimeMap rows={rows} mock={mock} att={att} onPick={pick} />

      <div className="mrsplit">
        <div>
          <h3 className="mh3">Standalone vs group</h3>
          <div className="scroll">
            <table>
              <thead><tr><th></th><th className="r">Qs</th><th className="r">Score</th><th className="r">Accuracy</th><th className="r">Avg / q</th><th className="r">Timed out</th></tr></thead>
              <tbody>
                {kinds.map((k) => (
                  <tr key={String(k.group)}>
                    <td><b>{k.group ? "Groups" : "Standalone"}</b></td>
                    <td className="r num">{k.n}</td><td className="r num">{mk(k.marks)}</td><td className="r num">{pct(k.acc)}</td>
                    <td className="r num">{fmtSecs(k.avg)}</td><td className="r num">{k.timeout}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h3 className="mh3">Each group</h3>
          <div className="scroll">
            <table>
              <thead><tr><th>Group</th><th>Topic</th><th className="r">Right</th><th className="r">Time</th></tr></thead>
              <tbody>
                {groups.length ? groups.map((g) => (
                  <tr key={g.bi} onClick={() => pick(g.from)} className="clicky">
                    <td className="num">Q{g.from}–{g.to}</td><td className="note">{g.topic}</td>
                    <td className="r num">{g.right}/{g.n}{g.timeout ? " · " + g.timeout + " ⏱" : ""}</td>
                    <td className="r num">{fmtClock(g.used)}{g.limit != null ? " / " + fmtClock(g.limit) : ""}</td>
                  </tr>
                )) : <tr><td colSpan={4} className="note">No groups in these sections.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <h3 className="mh3">By topic</h3>
      <div className="scroll">
        <table>
          <thead><tr><th>Topic</th><th>Section</th><th className="r">Qs</th><th className="r">Right</th><th className="r">Wrong</th><th className="r">Not ans.</th><th className="r">Accuracy</th><th className="r">Avg time</th></tr></thead>
          <tbody>
            {byTopic.map((t) => (
              <tr key={t.topic}>
                <td>{t.topic}</td><td className="note">{mock.sections[t.sec].short}</td>
                <td className="r num">{t.n}</td><td className="r num">{t.right}</td><td className="r num">{t.wrong}</td>
                <td className="r num">{t.skipped + t.timeout}</td><td className="r num">{pct(t.acc)}</td><td className="r num">{fmtSecs(t.avg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mh3">Question by question</h3>
      <div className="seg glassseg qfilter">
        {FILTERS.map(([k, l]) => <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}
      </div>
      <div className="recaps" style={{ marginTop: 12 }}>
        {shown.map((r) => {
          const [label, tone] = RES[r.result];
          const isOpen = open === r.no;
          const lim = r.group ? null : qb;
          return (
            <div key={r.no} id={"mq-" + r.no} className={"recap" + (r.result === "right" ? " r" : r.result === "wrong" ? " w" : "")}>
              <div className="rhead">
                <span className="qnum">Q{r.no}</span>
                <span className="note">{mock.sections[r.sec].short} · {r.topic}{r.group ? " · group of " + r.groupSize : ""}</span>
                <span className={"pill " + tone}>{label}{r.result === "wrong" ? " — you " + r.chosen.toUpperCase() + ", key " + r.key.toUpperCase() : ""}</span>
                <span className={"tchip" + (lim != null && r.t > lim ? " over" : "")}>{fmtSecs(r.t)}{lim != null ? " / " + lim + "s" : ""}</span>
                {r.visits > 1 && <span className="note">{r.visits} visits</span>}
                {r.marked && <span className="pill mkpill">marked</span>}
                <button className="ghost" onClick={() => setOpen(isOpen ? null : r.no)}>{isOpen ? "Hide" : "Look again"}</button>
              </div>
              {isOpen && <QView r={r} mock={mock} />}
            </div>
          );
        })}
        {!shown.length && <p className="note">Nothing here.</p>}
      </div>

      {earlier.length > 0 && (
        <>
          <h3 className="mh3">This paper over time</h3>
          <div className="scroll">
            <table>
              <thead><tr><th>When</th><th>Sections</th><th className="r">Score</th><th className="r">Accuracy</th><th className="r">Time</th></tr></thead>
              <tbody>
                {[att, ...earlier].map((a) => {
                  const s = a === att ? all : summarise(a, mock).all;
                  return (
                    <tr key={a.id} className={a === att ? "thisrow" : ""}>
                      <td className="note">{new Date(a.ended || a.started).toLocaleString()}{a === att ? " · this one" : ""}</td>
                      <td>{a.plan.sections.map((i) => mock.sections[i].short).join(", ")}</td>
                      <td className="r num"><b>{mk(s.marks)}</b> / {s.max}</td><td className="r num">{pct(s.acc)}</td><td className="r num">{fmtClock(a.active)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="toolrow" style={{ marginTop: 28 }}>
        <button className="go grad" style={{ maxWidth: 240 }} onClick={() => onRetake(mock)}>Sit Model Test {att.n} again</button>
        <button className="ghost big" onClick={onBack}>All papers</button>
        <button className="ghost danger" style={{ marginLeft: "auto" }} onClick={() => setDel("")}>Delete this sitting</button>
      </div>

      {del != null && (
        <div className="sheet" onClick={(e) => e.target === e.currentTarget && setDel(null)}>
          <div className="sheetbox">
            <h3>Delete this sitting?</h3>
            <p className="note">Removes it from your mock history. Answers it added to Tests progress stay — clear those from Reset.</p>
            <form className="pinrow" onSubmit={(e) => { e.preventDefault(); if (del === PIN) { store.remove(att.id); onBack(); } }}>
              <label htmlFor="mpin">Password</label>
              <input id="mpin" type="password" autoFocus value={del} placeholder="Enter the reset password" onChange={(e) => setDel(e.target.value)} />
            </form>
            <div className="sheetfoot">
              <button className="ghost" onClick={() => setDel(null)}>Cancel</button>
              <button className="danger solid" disabled={del !== PIN} onClick={() => { store.remove(att.id); onBack(); }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
