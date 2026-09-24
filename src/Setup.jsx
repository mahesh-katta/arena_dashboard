import React, { useState, useMemo } from "react";
import { PACE, matchingSets, pool, prune, presetTopics, qKey, pdfSrc } from "./store.js";

/* One collapsible facet holding a checklist. The rows for Section and Topic are
   built once and only hidden or shown as the scope changes, so ticking a box
   never rebuilds the list, never moves it, and never loses your scroll. */
function Facet({ label, open, onToggle, picked, locked, lockNote, search, onSearch, children, chips }) {
  return (
    <div className={"facet" + (open && !locked ? " open" : "") + (locked ? " locked" : "")}>
      <div className="fhead" onClick={locked ? undefined : onToggle}>
        <span className="arrow">▶</span>
        <span>{label}</span>
        {picked > 0 && <span className="pick">{picked}</span>}
      </div>
      <div className="fbody">
        <div className="inner">
          {onSearch && (
            <div className="fsearch">
              <input type="search" placeholder="Type to narrow…" value={search}
                     onChange={(e) => onSearch(e.target.value)} autoComplete="off" />
            </div>
          )}
          <div className="checklist">{children}</div>
          {chips}
          {locked && <p className="hint">{lockNote}</p>}
          {!locked && !picked && <p className="hint">Nothing picked means all of them.</p>}
        </div>
      </div>
    </div>
  );
}

function Row({ value, label, note, count, checked, onChange, hidden, preset }) {
  return (
    <label className={"cbrow" + (preset ? " preset" : "")} hidden={hidden || undefined} data-val={value}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="cbtext">
        {label}
        {note && <small>{note}</small>}
      </span>
      <span className="cn">{count}</span>
    </label>
  );
}

const CHIP_CAP = 6;
function Chips({ values, onRemove, expanded, setExpanded }) {
  if (!values.length) return null;
  const show = expanded ? values : values.slice(0, CHIP_CAP);
  return (
    <div className="chosen">
      {show.map((v) => (
        <button key={v} className="pin" title={"Remove " + v} onClick={() => onRemove(v)}>
          <b>{v}</b><i>×</i>
        </button>
      ))}
      {values.length > show.length && (
        <button className="linky" onClick={() => setExpanded(true)}>+{values.length - show.length} more</button>
      )}
      {expanded && values.length > CHIP_CAP && (
        <button className="linky" onClick={() => setExpanded(false)}>Show fewer</button>
      )}
      {values.length > 1 && (
        <button className="linky" style={{ marginLeft: 10 }}
                onClick={() => values.slice().forEach(onRemove)}>Clear all {values.length}</button>
      )}
    </div>
  );
}

function Seg({ label, options, value, onChange }) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="seg">
        {options.map(([v, t]) => (
          <button key={String(v)} aria-pressed={value === v} onClick={() => onChange(v)}>{t}</button>
        ))}
      </div>
    </div>
  );
}

function Tile({ k, v, sub }) {
  return (
    <div className="tile">
      <div className="k">{k}</div>
      <div className="v">{v}{sub && <small> {sub}</small>}</div>
    </div>
  );
}

export default function Setup({ data, progress, F, setF, onStart, config }) {
  const [open, setOpen] = useState({ sections: true, topics: false, subtopics: false });
  const [term, setTerm] = useState({ sections: "", topics: "", subtopics: "" });
  const [expand, setExpand] = useState({});
  const { sets, bySet, shape } = data;

  const update = (fn) => setF((prev) => { const next = { ...prev }; fn(next); return prune(next, sets); });

  /* counts flow strictly downward: a section's count never depends on the
     topics ticked below it, so ticking a topic can never make a section vanish */
  const counts = useMemo(() => {
    const sec = {}, top = {}, sub = {};
    for (const s of Object.values(sets)) {
      sec[s.section] = (sec[s.section] || 0) + 1;
      if (!F.sections.length || F.sections.includes(s.section)) top[s.topic] = (top[s.topic] || 0) + 1;
      if ((!F.sections.length || F.sections.includes(s.section)) &&
          (!F.topics.length || F.topics.includes(s.topic)))
        sub[s.subtopic] = (sub[s.subtopic] || 0) + 1;
    }
    return { sec, top, sub };
  }, [sets, F.sections, F.topics]);

  const allSections = useMemo(() => [...new Set(Object.values(sets).map((s) => s.section))].sort(), [sets]);
  const allTopics = useMemo(() => [...new Set(Object.values(sets).map((s) => s.topic))].sort(), [sets]);
  const subNames = useMemo(() => Object.keys(counts.sub).sort(), [counts.sub]);
  const standCount = useMemo(
    () => Object.values(sets).filter((s) => shape[s.topic] && shape[s.topic].standalone).length, [sets, shape]);
  const groupCount = Object.keys(sets).length - standCount;

  const avail = useMemo(() => pool(F, data, progress), [F, data, progress.attempts.length, progress.flags.size]);
  const mSets = useMemo(() => matchingSets(F, sets), [F, sets]);

  const topicsUnlocked = F.sections.length > 0 || F.standalone || F.grouped;
  const subsUnlocked = F.topics.length > 0 && subNames.length > 1;
  const secPicked = F.sections.length + (F.standalone ? 1 : 0) + (F.grouped ? 1 : 0);

  const done = progress.attempts.length;
  const scored = progress.attempts.filter((a) => a.correct !== null).length;
  const corr = progress.attempts.filter((a) => a.correct === true).length;
  const avg = done ? progress.attempts.reduce((s, a) => s + a.secs, 0) / done : 0;
  const seen = useMemo(() => new Set(progress.attempts.map((a) => a.set + "#" + a.q_no)), [progress.attempts.length]);

  const togglePreset = (which, on) => update((f) => {
    f[which] = on;
    const names = presetTopics(shape, which === "standalone");
    f.topics = on ? [...new Set(f.topics.concat(names))] : f.topics.filter((t) => !names.includes(t));
  });

  return (
    <div className="setup">
      <div className="panel">
        <h2>Build a set</h2>
        <p className="note">Narrow it down, choose how many, then run the clock.</p>

        <div className="styleswitch">
          {[["practice", "Practice", "answers and solutions as you go"],
            ["test", "Test", "clock on, marked at the end"]].map(([v, t, sub]) => (
            <button key={v} className={"styleopt" + (F.style === v ? " on" : "")}
                    onClick={() => setF((p) => ({ ...p, style: v }))}>
              <b>{t}</b><small>{sub}</small>
            </button>
          ))}
        </div>

        <Facet label="Section" open={open.sections} picked={secPicked}
               onToggle={() => setOpen((o) => ({ ...o, sections: !o.sections }))}
               chips={<Chips values={[...F.sections, ...(F.standalone ? ["Standalone"] : []), ...(F.grouped ? ["Grouped"] : [])]}
                             expanded={expand.sections} setExpanded={(v) => setExpand((e) => ({ ...e, sections: v }))}
                             onRemove={(v) => v === "Standalone" ? togglePreset("standalone", false)
                                            : v === "Grouped" ? togglePreset("grouped", false)
                                            : update((f) => { f.sections = f.sections.filter((x) => x !== v); })} />}>
          {allSections.map((v) => (
            <Row key={v} value={v} label={v} count={counts.sec[v] || 0}
                 checked={F.sections.includes(v)}
                 onChange={(on) => update((f) => { f.sections = on ? f.sections.concat(v) : f.sections.filter((x) => x !== v); })} />
          ))}
          <Row preset value="Standalone" label="Standalone" note="one-off questions — ticks the matching topics below"
               count={standCount} checked={F.standalone} onChange={(on) => togglePreset("standalone", on)} />
          <Row preset value="Grouped" label="Grouped" note="sets that hang off one chart, passage or puzzle"
               count={groupCount} checked={F.grouped} onChange={(on) => togglePreset("grouped", on)} />
        </Facet>

        <Facet label="Topic" open={open.topics} picked={F.topics.length}
               locked={!topicsUnlocked} lockNote="Pick a section above first."
               onToggle={() => setOpen((o) => ({ ...o, topics: !o.topics }))}
               search={term.topics} onSearch={(v) => setTerm((t) => ({ ...t, topics: v }))}
               chips={<Chips values={F.topics} expanded={expand.topics}
                             setExpanded={(v) => setExpand((e) => ({ ...e, topics: v }))}
                             onRemove={(v) => update((f) => { f.topics = f.topics.filter((x) => x !== v); })} />}>
          {allTopics.map((v) => {
            const n = counts.top[v] || 0;
            const checked = F.topics.includes(v);
            const t = term.topics.toLowerCase();
            return (
              <Row key={v} value={v} label={v} count={n} checked={checked}
                   hidden={(n === 0 && !checked) || (!!t && !v.toLowerCase().includes(t))}
                   onChange={(on) => update((f) => { f.topics = on ? f.topics.concat(v) : f.topics.filter((x) => x !== v); })} />
            );
          })}
        </Facet>

        <Facet label="Subtopic" open={open.subtopics} picked={F.subtopics.length}
               locked={!subsUnlocked}
               lockNote={F.topics.length ? "This topic has only one subtopic." : "Pick a topic above first."}
               onToggle={() => setOpen((o) => ({ ...o, subtopics: !o.subtopics }))}
               search={term.subtopics} onSearch={(v) => setTerm((t) => ({ ...t, subtopics: v }))}
               chips={<Chips values={F.subtopics} expanded={expand.subtopics}
                             setExpanded={(v) => setExpand((e) => ({ ...e, subtopics: v }))}
                             onRemove={(v) => update((f) => { f.subtopics = f.subtopics.filter((x) => x !== v); })} />}>
          {subNames.map((v) => {
            const t = term.subtopics.toLowerCase();
            return (
              <Row key={v} value={v} label={v} count={counts.sub[v] || 0} checked={F.subtopics.includes(v)}
                   hidden={!!t && !v.toLowerCase().includes(t)}
                   onChange={(on) => update((f) => { f.subtopics = on ? f.subtopics.concat(v) : f.subtopics.filter((x) => x !== v); })} />
            );
          })}
        </Facet>

        <Seg label="Which questions" value={F.mode} onChange={(v) => setF((p) => ({ ...p, mode: v }))}
             options={[["unseen", "New"], ["all", "All"], ["wrong", "Wrong"], ["flagged", "Flagged"]]} />
        <Seg label="How many" value={F.limit} onChange={(v) => setF((p) => ({ ...p, limit: v }))}
             options={[[10, "10"], [20, "20"], [50, "50"], [0, "All"]]} />
        <Seg label="Order" value={F.order} onChange={(v) => setF((p) => ({ ...p, order: v }))}
             options={[["shuffle", "Shuffle"], ["order", "In order"]]} />

        <button className="go" disabled={!avail.length} onClick={() => onStart(avail)}>
          {avail.length
            ? "Start · " + Math.min(F.limit || avail.length, avail.length) + " questions"
            : F.mode === "flagged" ? "Nothing flagged yet" : "Nothing matches"}
        </button>
      </div>

      <div>
        <div className="tiles">
          <Tile k="In this filter" v={avail.length.toLocaleString()} sub="questions" />
          <Tile k="Across" v={mSets.length.toLocaleString()} sub={mSets.length === 1 ? "set" : "sets"} />
          <Tile k="You've solved" v={done.toLocaleString()} sub="all time" />
          <Tile k="Accuracy" v={scored ? Math.round((corr / scored) * 100) + "%" : "—"} />
          <Tile k="Avg pace" v={done ? avg.toFixed(1) + "s" : "—"} sub={done ? "target " + PACE + "s" : ""} />
        </div>
        <h3 style={{ margin: "4px 0 10px" }}>Sets in this filter</h3>
        <div className="scroll">
          <table>
            <thead><tr><th>Set</th><th>Topic</th><th className="r">Qs</th><th className="r">Done</th><th></th></tr></thead>
            <tbody>
              {mSets.slice(0, 300).map(([slug, s]) => {
                const all = bySet[slug] || [];
                const d = all.filter((q) => seen.has(qKey(q))).length;
                return (
                  <tr key={slug}>
                    <td>
                      {s.subtopic}{" "}
                      {config.pdfs && <a href={pdfSrc(slug)} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>PDF</a>}
                    </td>
                    <td className="note">{s.topic}</td>
                    <td className="r num">{all.length}</td>
                    <td className="r num">{d}</td>
                    <td><div className="bar"><i style={{ width: (all.length ? Math.round((d / all.length) * 100) : 0) + "%" }} /></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {mSets.length > 300 && <p className="note">Showing the first 300 of {mSets.length} sets.</p>}
      </div>
    </div>
  );
}
