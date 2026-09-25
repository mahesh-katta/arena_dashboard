import React, { useState, useMemo } from "react";
import { buildTree, nodeAt, keysUnder } from "./store.js";

const RESET_PIN = "1234";
const pctOf = (n) => (n.total ? (n.done / n.total) * 100 : 0);

function Row({ node, onOpen, mode, onReset }) {
  const pct = pctOf(node);
  return (
    <div className="prow">
      <button className="pname" onClick={onOpen} disabled={!node.kids || !node.kids.length}>
        {node.kids && node.kids.length ? <span className="chev">▸</span> : <span className="chev leaf">·</span>}
        {node.name}
      </button>
      <div className="pbar"><i style={{ width: pct + "%" }} /></div>
      <div className="pcount num">
        <b>{node.done.toLocaleString()}</b> / {node.total.toLocaleString()}
      </div>
      <div className="ppct num">{pct >= 0.05 || pct === 0 ? Math.round(pct) + "%" : "<1%"}</div>
      {mode === "reset" && (
        <button className="ghost danger sm" onClick={onReset}>Reset</button>
      )}
    </div>
  );
}

/* Progress and Reset are the same screen. You walk the same section → topic →
   subtopic hierarchy either way; in reset mode each row carries a button, and
   what it wipes is exactly the node you are standing on. One mental model. */
export default function ProgressView({ data, progress, course, mode, refresh, onStartSession, onCourse }) {
  const [path, setPath] = useState([]);
  const [kind, setKind] = useState("course");
  const isCourse = kind === "course";
  const [pending, setPending] = useState(null);
  const [pin, setPin] = useState("");
  const [pinErr, setPinErr] = useState(false);

  const tree = useMemo(
    () => buildTree(data, isCourse ? course.doneSet() : progress.attempts),
    [data, isCourse, course.count, progress.attempts.length]);
  const here = nodeAt(tree, path);
  const kids = here.kids || [];

  const confirmReset = (node, nodePath) => {
    const keys = keysUnder(data, nodePath);
    const done = isCourse ? course.doneSet() : new Set(progress.attempts.map((a) => a.set + "#" + a.q_no));
    setPending({ node, nodePath, keys, kind, hit: keys.filter((k) => done.has(k)).length });
    setPin("");
    setPinErr(false);
  };
  const doReset = async () => {
    if (pin !== RESET_PIN) { setPinErr(true); return; }
    const n = pending.kind === "course"
      ? await course.removeKeys(pending.keys.filter((k) => course.has(k)))
      : await progress.removeKeys(pending.keys);
    setPending(null);
    refresh();
    return n;
  };

  return (
    <>
      <div className="phead">
        <div className="crumbs">
          <button className="crumb-btn" onClick={() => setPath([])}>Everything</button>
          {path.map((name, i) => (
            <React.Fragment key={name}>
              <span className="csep">/</span>
              <button className="crumb-btn" onClick={() => setPath(path.slice(0, i + 1))}>{name}</button>
            </React.Fragment>
          ))}
        </div>
        {mode === "reset" && <span className="resetbadge">Reset mode</span>}
      </div>
      <div className="seg glassseg kindseg">
        <button aria-pressed={isCourse} onClick={() => setKind("course")}>Course · practice</button>
        <button aria-pressed={!isCourse} onClick={() => setKind("tests")}>Tests</button>
      </div>

      <div className="tiles" style={{ marginTop: 16 }}>
        <div className="tile">
          <div className="k">{here.name}</div>
          <div className="v">{Math.round(pctOf(here))}%<small> done</small></div>
        </div>
        <div className="tile">
          <div className="k">{isCourse ? "Solved in practice" : "Correct in a test"}</div>
          <div className="v">{here.done.toLocaleString()}</div>
        </div>
        <div className="tile">
          <div className="k">Questions here</div>
          <div className="v">{here.total.toLocaleString()}</div>
        </div>
        <div className="tile">
          <div className="k">Left</div>
          <div className="v">{(here.total - here.done).toLocaleString()}</div>
        </div>
      </div>

      {mode === "reset" ? (
        <p className="note warnline">
          Wipes {isCourse ? "your course progress (what you solved in practice)" : "your test attempts"} only.
          {" "}The other kind, and your notes, are never touched.
        </p>
      ) : isCourse ? (
        <p className="note">
          A question counts here once you have solved it in Practice — any number of tries.
          Each topic is its questions, each section its topics.
        </p>
      ) : (
        <p className="note">
          A question counts here once you have answered it correctly in a test.
        </p>
      )}

      {mode === "reset" && (
        <div className="prow selfrow">
          <span className="pname big">Everything under “{here.name}”</span>
          <button className="ghost danger" onClick={() => confirmReset(here, path)}>
            Reset this whole level
          </button>
        </div>
      )}

      <div className="plist">
        {kids.length
          ? kids.map((k) => (
              <Row key={k.name} node={k} mode={mode}
                   onOpen={() => setPath(path.concat(k.name))}
                   onReset={() => confirmReset(k, path.concat(k.name))} />
            ))
          : <div className="empty">Nothing below this level.</div>}
      </div>

      {mode !== "reset" && here.total > here.done && (
        <button className="go grad" style={{ maxWidth: 320, marginTop: 22 }}
                onClick={() => (isCourse ? onCourse(path) : onStartSession(path))}>
          {isCourse ? "Continue this in the course" : "Test on what's left here"}
        </button>
      )}

      {pending && (
        <div className="sheet" onClick={(e) => e.target === e.currentTarget && setPending(null)}>
          <div className="sheetbox">
            <h3>Reset {pending.kind === "course" ? "course progress" : "test progress"}</h3>
            <p className="note">You are about to wipe progress for:</p>
            <p className="scopeline">
              {pending.nodePath.length ? pending.nodePath.join("  /  ") : "Everything"}
            </p>
            <ul className="scopefacts">
              <li><b>{pending.keys.length.toLocaleString()}</b> questions in scope</li>
              <li><b>{pending.hit.toLocaleString()}</b> of them {pending.kind === "course" ? "are marked solved and will reopen" : "have attempts that will be deleted"}</li>
              <li>Notes: <b>untouched</b></li>
            </ul>
            <form className="pinrow" onSubmit={(e) => { e.preventDefault(); doReset(); }}>
              <label htmlFor="resetpin">Password</label>
              <input id="resetpin" type="password" inputMode="numeric" autoComplete="off" autoFocus
                     className={pinErr ? "bad" : ""} value={pin} placeholder="Enter the reset password"
                     onChange={(e) => { setPin(e.target.value); setPinErr(false); }} />
              {pinErr && <span className="pinerr">Wrong password</span>}
            </form>
            <div className="sheetfoot">
              <button className="ghost" onClick={() => setPending(null)}>Cancel</button>
              <button className="danger solid" disabled={!pin} onClick={doReset}>
                {pending.kind === "course" ? "Reopen " + pending.hit.toLocaleString() + " questions" : "Wipe " + pending.hit.toLocaleString() + " attempts"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
