import React, { useState } from "react";
import { BANK, DATA_BASE } from "./store.js";

/* Where a question came from, for banks built from mock tests (not Guidely,
   which links its PDFs instead). "Original" opens the question exactly as it
   sits in the source mock file — the way to check whether anything went
   missing on the way in. The answer is only marked once you are allowed to
   see it. */
const cache = new Map();
function loadMock(file) {
  if (!cache.has(file))
    cache.set(file, fetch(DATA_BASE + "source/" + encodeURIComponent(file)).then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    }));
  return cache.get(file);
}

const english = (h) =>
  String(h || "").split("@|@")[0].replace(/<script[\s\S]*?<\/script>/gi, "").replace(/\son\w+\s*=/gi, " data-x=");

export default function SourceLine({ q, showAnswer = true }) {
  const [open, setOpen] = useState(false);
  const [orig, setOrig] = useState(null);
  const [err, setErr] = useState(null);
  const s = q && q.source;
  if (BANK === "guidely" || !s) return null;

  const toggle = async () => {
    if (!open && !orig && s.file) {
      try {
        const t = await loadMock(s.file);
        const hit = t.questionsData.questions.find((x) => String(x.qno) === String(s.qno));
        if (hit) setOrig(hit);
        else setErr("Q" + s.qno + " is not in " + s.file);
      } catch {
        setErr("Couldn't open " + s.file);
      }
    }
    setOpen((v) => !v);
  };

  const key = orig ? Number(orig.cans) : 0;
  return (
    <>
      <span className="srcline" title={s.mock}>
        Source: Model Test {s.model_test} · Q{s.qno}{s.file ? " · " + s.file : ""}
      </span>
      {s.file && <button className="ghost" onClick={toggle}>{open ? "Hide original" : "Original"}</button>}
      {open && (
        <div className="origpanel">
          {err && <p className="note">{err}</p>}
          {orig && (
            <>
              <div className="orighead">As in {s.file} — {s.mock}, Q{s.qno}</div>
              {orig.direction && <div className="origdir" dangerouslySetInnerHTML={{ __html: english(orig.direction) }} />}
              <div className="origq" dangerouslySetInnerHTML={{ __html: english(orig.question) }} />
              <ol className="origopts">
                {[1, 2, 3, 4, 5].filter((i) => orig["choice" + i] != null).map((i) => (
                  <li key={i} className={showAnswer && i === key ? "right" : ""}>
                    <b>{"ABCDE"[i - 1]}</b>
                    <span dangerouslySetInnerHTML={{ __html: english(orig["choice" + i]) }} />
                  </li>
                ))}
              </ol>
              {showAnswer && key > 0 && <div className="note">Answer in the source: {"ABCDE"[key - 1]}</div>}
            </>
          )}
        </div>
      )}
    </>
  );
}
