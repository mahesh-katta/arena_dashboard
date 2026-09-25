import React, { useState, useMemo, useEffect } from "react";
import { matchingSets, pool, prune, inPreset } from "./store.js";

/* Inside a bank: the mode is the first decision, because it changes what the
   whole session is for. */
export function Landing({ onPick, notes, progress, bankName }) {
  return (
    <div className="landing">
      <p className="eyebrow">{bankName}</p>
      <h1>What are we doing?</h1>
      <div className="modes">
        <button className="modecard glass practice" onClick={() => onPick("practice")}>
          <span className="mcglow" aria-hidden="true" />
          <b>Practice</b>
          <span>
            Answer until you get it right, with the clock running and the working
            there when you want it. Nothing is scored — the only thing kept is what
            you write down.
          </span>
          <em>{notes.count ? notes.count + " notes so far" : "no stakes"}</em>
        </button>
        <button className="modecard glass test" onClick={() => onPick("test")}>
          <span className="mcglow" aria-hidden="true" />
          <b>Test</b>
          <span>
            One shot per question, clock up, marked at the end. This is the only
            thing that moves your progress.
          </span>
          <em>{progress.attempts.length.toLocaleString()} answered</em>
        </button>
      </div>
    </div>
  );
}

function Checklist({ values, counts, picked, onToggle, searchable, tiles }) {
  const [term, setTerm] = useState("");
  const t = term.trim().toLowerCase();
  const shown = values.filter((v) => !t || v.toLowerCase().includes(t));
  if (tiles)
    return (
      <div className="tilepick">
        {values.map((v) => (
          <button key={v} className={"tp" + (picked.includes(v) ? " on" : "")}
                  aria-pressed={picked.includes(v)} onClick={() => onToggle(v, !picked.includes(v))}>
            <span className="tpcheck" aria-hidden="true">✓</span>
            <b>{v}</b>
            <small className="num">{counts[v] || 0} sets</small>
          </button>
        ))}
      </div>
    );
  return (
    <>
      {searchable && values.length > 12 && (
        <div className="fsearch">
          <input type="search" placeholder={"Search " + values.length + "…"} value={term}
                 onChange={(e) => setTerm(e.target.value)} autoComplete="off" />
        </div>
      )}
      <div className="checklist wide">
        {shown.map((v) => (
          <label key={v} className="cbrow">
            <input type="checkbox" checked={picked.includes(v)} onChange={(e) => onToggle(v, e.target.checked)} />
            <span className="cbtext">{v}</span>
            <span className="cn">{counts[v] || 0}</span>
          </label>
        ))}
        {!shown.length && <div className="note" style={{ padding: 10 }}>Nothing matches “{term}”.</div>}
      </div>
    </>
  );
}

const PRESETS = [
  ["all", "All", "everything"],
  ["standalone", "Standalone", "one-off questions"],
  ["grouped", "Grouped", "chart, passage or puzzle sets"],
];

const STEPS = [
  ["sections", "Sections"],
  ["topics", "Topics"],
  ["subtopics", "Subtopics"],
  ["count", "How many"],
];

/* The same five decisions as always — preset, sections, topics, subtopics,
   how many — asked one screen at a time, with Back and Next between them. */
export default function Funnel({ data, F, setF, step, setStep, onStart, onBack }) {
  const { sets, shape } = data;
  const [dir, setDir] = useState(1);
  const go = (n) => { setDir(n > step ? 1 : -1); setStep(n); window.scrollTo({ top: 0 }); };

  const setPreset = (p) => setF((prev) => ({ ...prev, preset: p, sections: [], topics: [], subtopics: [] }));
  const update = (fn) => setF((prev) => { const n = { ...prev }; fn(n); return prune(n, sets); });
  const toggler = (field) => (v, on) =>
    update((f) => { f[field] = on ? f[field].concat(v) : f[field].filter((x) => x !== v); });

  const counts = useMemo(() => {
    const sec = {}, top = {}, sub = {};
    for (const s of Object.values(sets)) {
      if (!inPreset(shape, F.preset, s.topic)) continue;
      sec[s.section] = (sec[s.section] || 0) + 1;
      if (!F.sections.length || F.sections.includes(s.section)) top[s.topic] = (top[s.topic] || 0) + 1;
      if ((!F.sections.length || F.sections.includes(s.section)) &&
          (!F.topics.length || F.topics.includes(s.topic)))
        sub[s.subtopic] = (sub[s.subtopic] || 0) + 1;
    }
    return { sec, top, sub };
  }, [sets, shape, F.preset, F.sections, F.topics]);

  const names = {
    sections: useMemo(() => Object.keys(counts.sec).sort(), [counts.sec]),
    topics: useMemo(() => Object.keys(counts.top).sort(), [counts.top]),
    subtopics: useMemo(() => Object.keys(counts.sub).sort(), [counts.sub]),
  };
  const avail = useMemo(() => pool(F, data), [F, data]);
  const nSets = useMemo(() => matchingSets(F, sets, shape).length, [F, sets, shape]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Enter") return;
      const tag = e.target.tagName;
      if (tag === "BUTTON" || tag === "TEXTAREA" || (tag === "INPUT" && e.target.type !== "checkbox")) return;
      e.preventDefault();
      if (step < STEPS.length - 1) go(step + 1);
      else if (avail.length) onStart(avail);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  const list = (a) => (a.length > 2 ? a.slice(0, 2).join(", ") + " +" + (a.length - 2) : a.join(", "));
  const summary = (id) => {
    if (id === "count") return (F.limit || "All") + " · " + (F.order === "shuffle" ? "shuffled" : "in order");
    return F[id].length ? list(F[id]) : "all " + names[id].length;
  };
  const [id, label] = STEPS[step];
  const last = step === STEPS.length - 1;
  const n = Math.min(F.limit || avail.length, avail.length);
  const mode = F.style === "test" ? "Test" : "Practice";

  return (
    <div className={"wiz " + F.style}>
      <div className="wizhead">
        <button className="linky" onClick={onBack}>← change mode</button>
        <h2><span className={"mode " + F.style}>{mode}</span> Pick your ground</h2>
      </div>

      <ol className="stepper">
        {STEPS.map(([sid, slabel], i) => (
          <li key={sid} className={i === step ? "cur" : i < step ? "past" : ""}>
            <button disabled={i > step} onClick={() => go(i)}>
              <span className="sn">{i < step ? "✓" : i + 1}</span>
              <span className="stx">
                <b>{slabel}</b>
                <small>{i <= step ? summary(sid) : " "}</small>
              </span>
            </button>
          </li>
        ))}
      </ol>

      <section key={step} className={"wizcard glass " + (dir > 0 ? "in-r" : "in-l")}>
        <div className="wiztitle">
          <div>
            <span className="stepof num">Step {step + 1} of {STEPS.length}</span>
            <h3>{id === "count" ? "How many, and in what order?" : "Which " + label.toLowerCase() + "?"}</h3>
          </div>
          {id !== "count" && F[id].length > 0 && (
            <button className="ghost sm" onClick={() => update((f) => { f[id] = []; })}>Clear {F[id].length}</button>
          )}
        </div>

        {id === "sections" && (
          <>
            <div className="presetbar">
              <span className="plabel">Kind of question</span>
              <div className="seg glassseg">
                {PRESETS.map(([v, t, sub]) => (
                  <button key={v} aria-pressed={F.preset === v} title={sub} onClick={() => setPreset(v)}>{t}</button>
                ))}
              </div>
            </div>
            <p className="note">Tick the sections you want, or leave them all empty to take every section.</p>
            <Checklist tiles values={names.sections} counts={counts.sec} picked={F.sections}
                       onToggle={toggler("sections")} />
          </>
        )}
        {id === "topics" && (
          <>
            <p className="note">
              {F.sections.length ? "Topics inside " + list(F.sections) + "." : "Topics across every section."}
              {" "}Leave empty to take all {names.topics.length}.
            </p>
            <Checklist searchable values={names.topics} counts={counts.top} picked={F.topics}
                       onToggle={toggler("topics")} />
          </>
        )}
        {id === "subtopics" && (
          <>
            <p className="note">
              {F.topics.length ? "Subtopics inside " + list(F.topics) + "." : "Subtopics across everything picked so far."}
              {" "}Leave empty to take all {names.subtopics.length}.
            </p>
            <Checklist searchable values={names.subtopics} counts={counts.sub} picked={F.subtopics}
                       onToggle={toggler("subtopics")} />
          </>
        )}
        {id === "count" && (
          <div className="countpick">
            <div className="bigseg">
              {[[10, "10"], [20, "20"], [50, "50"], [0, "All"]].map(([v, t]) => (
                <button key={v} aria-pressed={F.limit === v} onClick={() => setF((p) => ({ ...p, limit: v }))}>
                  <b className="num">{t}</b><small>questions</small>
                </button>
              ))}
            </div>
            <div className="seg glassseg" style={{ marginTop: 14 }}>
              {[["shuffle", "Shuffle"], ["order", "In order"]].map(([v, t]) => (
                <button key={v} aria-pressed={F.order === v} onClick={() => setF((p) => ({ ...p, order: v }))}>{t}</button>
              ))}
            </div>
            <ul className="wizrecap">
              <li><span>Kind</span><b>{PRESETS.find((p) => p[0] === F.preset)[1]}</b></li>
              {STEPS.slice(0, 3).map(([sid, sl]) => <li key={sid}><span>{sl}</span><b>{summary(sid)}</b></li>)}
            </ul>
          </div>
        )}
      </section>

      <div className="wizfoot glass">
        <button className="ghost big" onClick={() => (step ? go(step - 1) : onBack())}>← Back</button>
        <div className="wizcount">
          <b className="num">{avail.length.toLocaleString()}</b> questions
          <small>{nSets.toLocaleString()} {nSets === 1 ? "set" : "sets"}</small>
        </div>
        {last ? (
          <button className="go grad" disabled={!avail.length} onClick={() => onStart(avail)}>
            {avail.length ? "Start " + mode.toLowerCase() + " · " + n : "Nothing matches"}
          </button>
        ) : (
          <button className="go grad" disabled={!avail.length} onClick={() => go(step + 1)}>
            Next · {STEPS[step + 1][1]} →
          </button>
        )}
      </div>
    </div>
  );
}
