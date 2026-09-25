import React, { useMemo } from "react";
import { buildTree, nodeAt, nextUnder } from "./store.js";

const pctOf = (n) => (n.total ? (n.done / n.total) * 100 : 0);
const pctTxt = (p) => (p > 0 && p < 1 ? "<1" : Math.floor(p)) + "%";

function Ring({ pct, size = 56, stroke = 6 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const full = pct >= 100;
  return (
    <svg className={"ring" + (full ? " full" : "")} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} className="ringbg" strokeWidth={stroke} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} className="ringfg" strokeWidth={stroke} fill="none"
              strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, pct) / 100)}
              strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="ringtx"
            style={{ fontSize: size * 0.24 }}>{full ? "✓" : pctTxt(pct)}</text>
    </svg>
  );
}

const status = (n) => (n.done >= n.total ? "Complete" : n.done ? "In progress" : "Not started");
const LEVEL = ["section", "topic", "subtopic"];

/* The course map. You still pick — a section, a topic, a subtopic — but
   every node knows how far you have got, and Continue always lands on the
   next unsolved question in a fixed order. */
export default function CourseView({ data, course, order, path, setPath, limit, setLimit, lastPath, onStart }) {
  const done = useMemo(() => course.doneSet(), [course.count]);
  const tree = useMemo(() => buildTree(data, done), [data, done]);
  const here = nodeAt(tree, path);
  const realPath = here.path || [];
  const kids = here.kids || [];
  const next = useMemo(() => nextUnder(order, done, realPath), [order, done, realPath.join("\u0000")]);
  const lastNode = lastPath && lastPath.length ? nodeAt(tree, lastPath) : null;
  const showLast = lastNode && lastNode !== here && lastNode.done < lastNode.total &&
    (lastNode.path || []).join("/") !== realPath.join("/");
  const leafLevel = realPath.length >= 2;

  return (
    <div className="course">
      <nav className="crumbs">
        <button className="crumb-btn" onClick={() => setPath([])}>Course</button>
        {realPath.map((name, i) => (
          <React.Fragment key={i}>
            <span className="csep">/</span>
            <button className="crumb-btn" onClick={() => setPath(realPath.slice(0, i + 1))}>{name}</button>
          </React.Fragment>
        ))}
      </nav>

      <section className="coursehero glass">
        <Ring pct={pctOf(here)} size={112} stroke={10} />
        <div className="chmeta">
          <span className="eyebrow">{realPath.length ? LEVEL[realPath.length - 1] : "whole course"}</span>
          <h2>{realPath.length ? here.name : "Your course"}</h2>
          <p className="note num">
            {here.done.toLocaleString()} of {here.total.toLocaleString()} solved · {status(here)}
          </p>
          {next ? (
            <p className="nextup">
              <span>Next up</span>
              {next.path.slice(realPath.length).map((x) => x + " › ").join("")}Q{next.q.q_no}
            </p>
          ) : <p className="nextup done"><span>All solved</span>Revise any time — it won't change your progress.</p>}
          <div className="chactions">
            {next && (
              <button className="go grad" onClick={() => onStart(realPath, "next")}>
                {here.done ? "Continue" : "Start"} · {limit || "all"}
              </button>
            )}
            {here.done > 0 && (
              <button className="ghost big" onClick={() => onStart(realPath, "revise")}>Revise solved</button>
            )}
          </div>
        </div>
        <div className="chlimit">
          <span className="plabel">Per sitting</span>
          <div className="seg glassseg">
            {[[10, "10"], [20, "20"], [50, "50"], [0, "All"]].map(([v, t]) => (
              <button key={v} aria-pressed={limit === v} onClick={() => setLimit(v)}>{t}</button>
            ))}
          </div>
        </div>
      </section>

      {showLast && (
        <button className="lastchip glass" onClick={() => onStart(lastNode.path, "next")}>
          <span className="lcicon" aria-hidden="true">↻</span>
          <span className="lctx">
            <small>Pick up where you left off</small>
            <b>{lastNode.path.join(" › ")}</b>
          </span>
          <span className="lcpct num">{pctTxt(pctOf(lastNode))}</span>
        </button>
      )}

      <h3 className="kidhead">
        {realPath.length === 0 ? "Sections" : realPath.length === 1 ? "Topics in " + here.name : "Subtopics"}
      </h3>
      <div className={leafLevel ? "unitlist" : "unitgrid"}>
        {kids.map((k) => {
          const p = pctOf(k);
          const canOpen = !!(k.kids && k.kids.length) && !leafLevel;
          const kidNext = k.done < k.total;
          return (
            <div key={k.name} className={"unit glass" + (k.done >= k.total ? " complete" : "")}>
              <button className="unitmain" onClick={() => (canOpen ? setPath(k.path) : kidNext && onStart(k.path, "next"))}>
                <Ring pct={p} size={leafLevel ? 44 : 58} stroke={leafLevel ? 5 : 6} />
                <span className="unittx">
                  <b>{k.name}</b>
                  <small className="num">{k.done.toLocaleString()} / {k.total.toLocaleString()} · {status(k)}</small>
                  <span className="ubar"><i style={{ width: p + "%" }} /></span>
                </span>
                {canOpen && <span className="chev" aria-hidden="true">›</span>}
              </button>
              <div className="unitact">
                {kidNext
                  ? <button className="ghost sm" onClick={() => onStart(k.path, "next")}>{k.done ? "Continue" : "Start"}</button>
                  : <button className="ghost sm" onClick={() => onStart(k.path, "revise")}>Revise</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { Ring };
