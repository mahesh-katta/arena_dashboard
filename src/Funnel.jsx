import React, { useState, useMemo } from "react";
import { matchingSets, pool, prune, inPreset, presetTopics } from "./store.js";

/* The landing screen: the mode is the first decision, not one field among
   twenty, because it changes what the whole session is for. */
export function Landing({ onPick, notes, progress }) {
  return (
    <div className="landing">
      <h1>What are we doing?</h1>
      <div className="modes">
        <button className="modecard practice" onClick={() => onPick("practice")}>
          <b>Practice</b>
          <span>
            Answer until you get it right, with the clock running and the working
            there when you want it. Nothing is scored and nothing is recorded —
            the only thing kept is what you write down.
          </span>
          <em>{notes.count ? notes.count + " notes so far" : "no stakes"}</em>
        </button>
        <button className="modecard test" onClick={() => onPick("test")}>
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

function Step({ n, label, note, children, open, onToggle, done }) {
  return (
    <div className={"step" + (open ? " open" : "") + (done ? " done" : "")}>
      <div className="shead" onClick={onToggle}>
        <span className="sn">{done ? "✓" : n}</span>
        <span className="slab">{label}</span>
        <span className="snote">{note}</span>
      </div>
      <div className="sbody"><div className="inner">{children}</div></div>
    </div>
  );
}

function Checklist({ values, counts, picked, onToggle, searchable }) {
  const [term, setTerm] = useState("");
  const t = term.trim().toLowerCase();
  return (
    <>
      {searchable && values.length > 12 && (
        <div className="fsearch">
          <input type="search" placeholder="Type to narrow…" value={term}
                 onChange={(e) => setTerm(e.target.value)} autoComplete="off" />
        </div>
      )}
      <div className="checklist">
        {values.map((v) => (
          <label key={v} className="cbrow" hidden={!!t && !v.toLowerCase().includes(t) ? true : undefined}>
            <input type="checkbox" checked={picked.includes(v)} onChange={(e) => onToggle(v, e.target.checked)} />
            <span className="cbtext">{v}</span>
            <span className="cn">{counts[v] || 0}</span>
          </label>
        ))}
      </div>
    </>
  );
}

const PRESETS = [
  ["all", "All", "everything in the bank"],
  ["standalone", "Standalone", "one-off questions that stand alone"],
  ["grouped", "Grouped", "sets hanging off one chart, passage or puzzle"],
];

export default function Funnel({ data, F, setF, onStart, onBack }) {
  const { sets, shape } = data;
  const [open, setOpen] = useState(1);

  /* Changing the preset is a deliberate start-again: everything below it goes,
     rather than trying to re-filter picks made under different rules. */
  const setPreset = (p) => {
    setF((prev) => ({ ...prev, preset: p, sections: [], topics: [], subtopics: [] }));
    setOpen(2);
  };
  const update = (fn) => setF((prev) => { const n = { ...prev }; fn(n); return prune(n, sets); });

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

  const secNames = useMemo(() => Object.keys(counts.sec).sort(), [counts.sec]);
  const topNames = useMemo(() => Object.keys(counts.top).sort(), [counts.top]);
  const subNames = useMemo(() => Object.keys(counts.sub).sort(), [counts.sub]);
  const avail = useMemo(() => pool(F, data), [F, data]);
  const nSets = useMemo(() => matchingSets(F, sets, shape).length, [F, sets, shape]);
  const presetTotal = useMemo(
    () => Object.values(sets).filter((s) => inPreset(shape, F.preset, s.topic)).length, [sets, shape, F.preset]);

  const list = (a) => (a.length > 2 ? a.slice(0, 2).join(", ") + " +" + (a.length - 2) : a.join(", "));

  return (
    <div className="funnel">
      <button className="linky" onClick={onBack}>← back</button>
      <h2>{F.style === "test" ? "Test" : "Practice"} — pick your ground</h2>
      <p className="note">Each step narrows the one below it. Leave a step empty to take all of it.</p>

      <Step n="1" label="Preset" done={F.preset !== "all"} open={open === 1} onToggle={() => setOpen(open === 1 ? 0 : 1)}
            note={PRESETS.find((p) => p[0] === F.preset)[1] + " · " + presetTotal + " sets"}>
        <div className="presets">
          {PRESETS.map(([v, t, sub]) => (
            <button key={v} className={"presetopt" + (F.preset === v ? " on" : "")} onClick={() => setPreset(v)}>
              <b>{t}</b><small>{sub}</small>
            </button>
          ))}
        </div>
        {F.preset !== "all" && (F.sections.length > 0 || F.topics.length > 0) && (
          <p className="hint">Changing this clears everything below.</p>
        )}
      </Step>

      <Step n="2" label="Sections" done={!!F.sections.length} open={open === 2} onToggle={() => setOpen(open === 2 ? 0 : 2)}
            note={F.sections.length ? list(F.sections) : "all " + secNames.length}>
        <Checklist values={secNames} counts={counts.sec} picked={F.sections}
                   onToggle={(v, on) => update((f) => { f.sections = on ? f.sections.concat(v) : f.sections.filter((x) => x !== v); })} />
      </Step>

      <Step n="3" label="Topics" done={!!F.topics.length} open={open === 3} onToggle={() => setOpen(open === 3 ? 0 : 3)}
            note={F.topics.length ? list(F.topics) : "all " + topNames.length}>
        <Checklist searchable values={topNames} counts={counts.top} picked={F.topics}
                   onToggle={(v, on) => update((f) => { f.topics = on ? f.topics.concat(v) : f.topics.filter((x) => x !== v); })} />
      </Step>

      <Step n="4" label="Subtopics" done={!!F.subtopics.length} open={open === 4} onToggle={() => setOpen(open === 4 ? 0 : 4)}
            note={F.subtopics.length ? list(F.subtopics) : "all " + subNames.length}>
        <Checklist searchable values={subNames} counts={counts.sub} picked={F.subtopics}
                   onToggle={(v, on) => update((f) => { f.subtopics = on ? f.subtopics.concat(v) : f.subtopics.filter((x) => x !== v); })} />
      </Step>

      <Step n="5" label="How many" done open={open === 5} onToggle={() => setOpen(open === 5 ? 0 : 5)}
            note={(F.limit || "all") + " · " + (F.order === "shuffle" ? "shuffled" : "in order")}>
        <div className="seg">
          {[[10, "10"], [20, "20"], [50, "50"], [0, "All"]].map(([v, t]) => (
            <button key={v} aria-pressed={F.limit === v} onClick={() => setF((p) => ({ ...p, limit: v }))}>{t}</button>
          ))}
        </div>
        <div className="seg" style={{ marginTop: 8 }}>
          {[["shuffle", "Shuffle"], ["order", "In order"]].map(([v, t]) => (
            <button key={v} aria-pressed={F.order === v} onClick={() => setF((p) => ({ ...p, order: v }))}>{t}</button>
          ))}
        </div>
      </Step>

      <div className="funfoot">
        <div className="note">
          {avail.length.toLocaleString()} questions across {nSets.toLocaleString()} {nSets === 1 ? "set" : "sets"}
        </div>
        <button className="go" disabled={!avail.length} onClick={() => onStart(avail)}>
          {avail.length
            ? "Start " + (F.style === "test" ? "test" : "practice") + " · " +
              Math.min(F.limit || avail.length, avail.length) + " questions"
            : "Nothing matches"}
        </button>
      </div>
    </div>
  );
}
