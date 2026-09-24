import React, { useState, useMemo } from "react";
import { buildTree, nodeAt, keysUnder } from "./store.js";

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
export default function ProgressView({ data, progress, mode, refresh, onStartSession }) {
  const [path, setPath] = useState([]);
  const [pending, setPending] = useState(null);

  const tree = useMemo(() => buildTree(data, progress.attempts), [data, progress.attempts.length]);
  const here = nodeAt(tree, path);
  const kids = here.kids || [];

  const confirmReset = (node, nodePath) => {
    const keys = keysUnder(data, nodePath);
    const done = new Set(progress.attempts.map((a) => a.set + "#" + a.q_no));
    setPending({ node, nodePath, keys, hit: keys.filter((k) => done.has(k)).length });
  };
  const doReset = async () => {
    const n = await progress.removeKeys(pending.keys);
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

      <div className="tiles" style={{ marginTop: 16 }}>
        <div className="tile">
          <div className="k">{here.name}</div>
          <div className="v">{Math.round(pctOf(here))}%<small> done</small></div>
        </div>
        <div className="tile">
          <div className="k">Correct in a test</div>
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
          Wipes progress only. Notes are never touched by a reset, at any level.
        </p>
      ) : (
        <p className="note">
          A question counts here once you have answered it correctly in a test.
          Practice never moves these numbers.
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
        <button className="go" style={{ maxWidth: 320, marginTop: 22 }}
                onClick={() => onStartSession(path)}>
          Test on what's left here
        </button>
      )}

      {pending && (
        <div className="sheet" onClick={(e) => e.target === e.currentTarget && setPending(null)}>
          <div className="sheetbox">
            <h3>Reset progress</h3>
            <p className="note">You are about to wipe progress for:</p>
            <p className="scopeline">
              {pending.nodePath.length ? pending.nodePath.join("  /  ") : "Everything"}
            </p>
            <ul className="scopefacts">
              <li><b>{pending.keys.length.toLocaleString()}</b> questions in scope</li>
              <li><b>{pending.hit.toLocaleString()}</b> of them have attempts that will be deleted</li>
              <li>Notes: <b>untouched</b></li>
            </ul>
            <div className="sheetfoot">
              <button className="ghost" onClick={() => setPending(null)}>Cancel</button>
              <button className="danger solid" onClick={doReset}>
                Wipe {pending.hit.toLocaleString()} attempts
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
