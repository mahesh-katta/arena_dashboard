import React, { useState, useMemo, useEffect } from "react";
import { ago } from "./store.js";
import { DEFAULTS, newAttempt, summarise, fmtLimit, fmtClock } from "./mock.js";

const pct = (x) => (x == null ? "—" : Math.round(x * 100) + "%");
const marks = (v) => (Math.round(v * 100) / 100).toString();

/* ---------------- the mock home ----------------
   Every paper, what you have done with it, and the sittings still open. */
export function MockHome({ mocks, store, onSetup, onResume, onResult }) {
  const [filter, setFilter] = useState("all");
  const done = store.done();
  const live = store.live();

  const byMock = useMemo(() => {
    const m = {};
    for (const a of store.list()) (m[a.mockId] || (m[a.mockId] = [])).push(a);
    return m;
  }, [store.list().length, done.length, live.length]);

  const sums = useMemo(() => done.map((a) => {
    const mk = mocks.find((m) => m.id === a.mockId);
    return mk ? { a, mk, s: summarise(a, mk).all } : null;
  }).filter(Boolean), [done.length, mocks]);

  const full = sums.filter((x) => x.a.plan.sections.length === x.mk.sections.length);
  const avg = full.length ? full.reduce((t, x) => t + x.s.marks, 0) / full.length : null;
  const best = full.length ? Math.max(...full.map((x) => x.s.marks)) : null;
  const acc = sums.reduce((t, x) => t + x.s.attempted, 0);
  const accR = acc ? sums.reduce((t, x) => t + x.s.right, 0) / acc : null;

  const shown = mocks.filter((m) => {
    const as = (byMock[m.id] || []).filter((a) => a.status === "done");
    return filter === "all" || (filter === "new" ? !as.length : as.length);
  });

  return (
    <div className="mockhome">
      <p className="eyebrow">Full mocks</p>
      <h2>{mocks.length} model tests, sat like the real paper</h2>
      <p className="note">Pick a paper, choose the sections and the clocks, and get a full breakdown at the end.</p>

      {live.map((a) => {
        const mk = mocks.find((m) => m.id === a.mockId);
        if (!mk) return null;
        const answered = Object.values(a.ans).filter((x) => x.c).length;
        const total = a.plan.blocks.reduce((t, bi) => t + mk.blocks[bi].q.length, 0);
        return (
          <div key={a.id} className="livecard glass">
            <span className="livedot" aria-hidden="true" />
            <div>
              <b>Model Test {a.n} is still open</b>
              <small>Q{a.pos.q} · {answered}/{total} answered · {a.plan.sections.map((i) => mk.sections[i].short).join(", ")} · saved {ago(a.saved || a.started)}</small>
            </div>
            <button className="ghost" onClick={() => onResult(a, true)}>Submit as is</button>
            <button className="go grad sm" onClick={() => onResume(a)}>Continue</button>
          </div>
        );
      })}

      <div className="tiles" style={{ marginTop: 18 }}>
        <div className="tile"><div className="k">Mocks sat</div><div className="v">{done.length}<small> / {mocks.length} papers</small></div></div>
        <div className="tile"><div className="k">Average (full papers)</div><div className="v">{avg == null ? "—" : marks(avg)}<small>{full.length ? " / " + full[0].s.max : ""}</small></div></div>
        <div className="tile"><div className="k">Best</div><div className="v">{best == null ? "—" : marks(best)}</div></div>
        <div className="tile"><div className="k">Accuracy</div><div className="v">{pct(accR)}</div></div>
      </div>

      {sums.length > 0 && (
        <>
          <h3 className="mh3">Recent sittings</h3>
          <div className="scroll">
            <table>
              <thead><tr><th>Paper</th><th>When</th><th>Sections</th><th className="r">Score</th><th className="r">Accuracy</th><th className="r">Time</th><th></th></tr></thead>
              <tbody>
                {sums.slice(0, 8).map(({ a, mk, s }) => (
                  <tr key={a.id}>
                    <td><b>Model Test {a.n}</b></td>
                    <td className="note">{new Date(a.ended || a.started).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="note">{a.plan.sections.length === mk.sections.length ? "All" : a.plan.sections.map((i) => mk.sections[i].short).join(", ")}</td>
                    <td className="r num"><b>{marks(s.marks)}</b> / {s.max}</td>
                    <td className="r num">{pct(s.acc)}</td>
                    <td className="r num">{fmtClock(s.time)}</td>
                    <td><button className="ghost" onClick={() => onResult(a)}>Analysis</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="mockbar">
        <h3 className="mh3" style={{ margin: 0 }}>Papers</h3>
        <div className="seg glassseg">
          {[["all", "All"], ["new", "Not sat"], ["done", "Sat"]].map(([k, l]) => (
            <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="mockgrid">
        {shown.map((m) => {
          const as = byMock[m.id] || [];
          const sat = as.filter((a) => a.status === "done");
          const open = as.some((a) => a.status === "live");
          const last = sat.sort((x, y) => (y.ended || 0) - (x.ended || 0))[0];
          const ls = last ? summarise(last, m).all : null;
          return (
            <button key={m.id} className={"mockcard" + (sat.length ? " sat" : "") + (open ? " open" : "")} onClick={() => onSetup(m)}>
              <span className="mcn num">{m.n}</span>
              <span className="mct">Model Test {m.n}</span>
              <span className="mcs">
                {open ? <i className="chip live">in progress</i>
                  : ls ? <i className="chip done">{marks(ls.marks)} / {ls.max}{sat.length > 1 ? " · " + sat.length + "×" : ""}</i>
                  : <i className="chip">new</i>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* A time limit: a number, or ∞. */
function TimeField({ label, sub, value, unit, def, min = 1, max = 600, onChange }) {
  const inf = value == null;
  return (
    <div className={"timefield" + (inf ? " inf" : "")}>
      <div className="tflabel"><b>{label}</b>{sub && <small>{sub}</small>}</div>
      <div className="tfctl">
        <button className="tfstep" disabled={inf || value <= min} onClick={() => onChange(Math.max(min, value - 1))} aria-label="less">−</button>
        <input type="number" inputMode="numeric" min={min} max={max} disabled={inf}
               value={inf ? "" : value} placeholder="∞"
               onChange={(e) => { const v = Math.round(+e.target.value); if (v >= min && v <= max) onChange(v); }} />
        <span className="tfunit">{unit}</span>
        <button className="tfstep" disabled={inf || value >= max} onClick={() => onChange(Math.min(max, value + 1))} aria-label="more">+</button>
        <button className={"tfinf" + (inf ? " on" : "")} aria-pressed={inf} title="No limit"
                onClick={() => onChange(inf ? def : null)}>∞</button>
      </div>
      {!inf && value !== def && <button className="linky tfdef" onClick={() => onChange(def)}>default {def} {unit}</button>}
    </div>
  );
}

/* ---------------- where a setup starts from ----------------
   "Last time" is read off your most recent sitting (any paper), so it is the
   same on every device — the sittings file is the memory. "Default" is the
   paper as the exam sets it: every section, 20 min each, 40 s a question,
   7 min a group. */
const defaultPreset = (mock) => ({
  secs: mock.sections.map((_, i) => i),
  S: { ...DEFAULTS, perSection: {} },
});
function lastPreset(mock, store) {
  const a = store.list().filter((x) => x.plan).sort((x, y) => (y.started || 0) - (x.started || 0))[0];
  if (!a) return null;
  const L = a.plan.limits;
  const secs = a.plan.sections.filter((i) => i < mock.sections.length);
  if (!secs.length) return null;
  const toMin = (v) => (v == null ? null : Math.round(v / 60));
  const perSection = {};
  for (const i of secs) perSection[i] = toMin(L.section[i]);
  return {
    secs, at: a.started, n: a.n,
    S: { ...DEFAULTS, perSection, questionSec: L.question == null ? null : L.question, groupMin: toMin(L.group) },
  };
}
/* Two setups are the same when they would start the same sitting. */
const shape = (mock, secs, S) => JSON.stringify({
  secs: secs.slice().sort(),
  sec: secs.slice().sort().map((i) => (S.perSection[i] !== undefined ? S.perSection[i] : S.sectionMin)),
  q: S.questionSec, g: S.groupMin,
});
const describePreset = (mock, p) =>
  p.secs.map((i) => mock.sections[i].short + " " + fmtLimit(p.S.perSection[i] !== undefined ? p.S.perSection[i] : p.S.sectionMin, "m")).join(" · ") +
  " · " + fmtLimit(p.S.questionSec, "s") + " a question · " + fmtLimit(p.S.groupMin, "m") + " a group";

/* ---------------- setting up one sitting ---------------- */
export function MockSetup({ mock, store, onStart, onBack, onResult }) {
  const last = useMemo(() => lastPreset(mock, store), [mock, store.list().length]);
  const def = useMemo(() => defaultPreset(mock), [mock]);
  const first = last || def;
  const [S, setS] = useState(first.S);
  const [secs, setSecs] = useState(first.secs);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, []);
  const set = (patch) => setS((p) => ({ ...p, ...patch }));
  const apply = (p) => { setS(p.S); setSecs(p.secs); };
  const now = shape(mock, secs, S);
  const onLast = !!last && now === shape(mock, last.secs, last.S);
  const onDef = now === shape(mock, def.secs, def.S);
  const secMin = (i) => (S.perSection[i] !== undefined ? S.perSection[i] : S.sectionMin);
  const setSecMin = (i, v) => set({ perSection: { ...S.perSection, [i]: v } });
  const all = secs.length === mock.sections.length;
  const toggle = (i) => setSecs((p) => (p.includes(i) ? p.filter((x) => x !== i) : p.concat(i).sort()));
  const past = store.forMock(mock.id).filter((a) => a.status === "done");

  const chosen = mock.sections.filter((_, i) => secs.includes(i));
  const nq = chosen.reduce((t, s) => t + s.count, 0);
  const totalMin = secs.every((i) => secMin(i) != null) ? secs.reduce((t, i) => t + secMin(i), 0) : null;

  /* What the per-question and per-group budgets add up to inside each section,
     so a mismatch with the section clock is visible before you start. */
  const budget = (i) => {
    const s = mock.sections[i];
    if (S.questionSec == null || S.groupMin == null) return null;
    return s.standalone * S.questionSec + s.groups * S.groupMin * 60;
  };

  const start = () => {
    if (!secs.length) return;
    onStart(newAttempt(mock, S, secs));
  };

  return (
    <div className="mocksetup">
      <button className="linky" onClick={onBack}>← all papers</button>
      <p className="eyebrow" style={{ marginTop: 10 }}>Model Test {mock.n}</p>
      <h2>Set up this sitting</h2>
      <p className="note">{mock.title} · {mock.total} questions · +{mock.sections[0].pos} right, −{mock.sections[0].neg} wrong
        {mock.missing ? " · " + mock.missing + " questions missing from the bank" : ""}</p>

      <section className="msblock">
        <h3>Start from</h3>
        <div className="presetpick">
          {last ? (
            <button className={"tp" + (onLast ? " on" : "")} aria-pressed={onLast} onClick={() => apply(last)}>
              <span className="tpcheck" aria-hidden="true">✓</span>
              <b>Last time</b>
              <small>Model Test {last.n} · {ago(last.at)}</small>
              <small className="num">{describePreset(mock, last)}</small>
            </button>
          ) : (
            <div className="tp ghosttp">
              <b>Last time</b>
              <small>Nothing yet — after your first mock, its sections and clocks are offered here.</small>
            </div>
          )}
          <button className={"tp" + (onDef ? " on" : "")} aria-pressed={onDef} onClick={() => apply(def)}>
            <span className="tpcheck" aria-hidden="true">✓</span>
            <b>Default</b>
            <small>The paper as the exam sets it</small>
            <small className="num">{describePreset(mock, def)}</small>
          </button>
        </div>
        {!onLast && !onDef && <p className="note customnote">Custom — changed below. Whatever you start with becomes "Last time".</p>}
      </section>

      <section className="msblock">
        <h3>1 · Sections</h3>
        <div className="secpick">
          <button className={"tp" + (all ? " on" : "")} aria-pressed={all}
                  onClick={() => setSecs(all ? [] : mock.sections.map((_, i) => i))}>
            <span className="tpcheck" aria-hidden="true">✓</span>
            <b>All sections</b><small className="num">{mock.total} questions · the full paper</small>
          </button>
          {mock.sections.map((s, i) => (
            <button key={i} className={"tp" + (secs.includes(i) ? " on" : "")} aria-pressed={secs.includes(i)} onClick={() => toggle(i)}>
              <span className="tpcheck" aria-hidden="true">✓</span>
              <b>{s.short}</b>
              <small className="num">Q{s.from}–{s.to} · {s.count} questions</small>
              <small className="num">{s.standalone} standalone · {s.groups} group{s.groups === 1 ? "" : "s"} ({s.groupQs} qs)</small>
            </button>
          ))}
        </div>
      </section>

      <section className="msblock">
        <h3>2 · Time</h3>
        <p className="note">Three clocks run together. Whichever runs out first moves you on. ∞ switches a clock off.</p>
        <div className="tfgrid">
          {secs.length === 0 && <p className="note">Pick at least one section.</p>}
          {mock.sections.map((s, i) => secs.includes(i) && (
            <TimeField key={i} label={s.short + " section"} sub={"paper gives " + s.minutes + " min"}
                       value={secMin(i)} unit="min" def={DEFAULTS.sectionMin} max={300}
                       onChange={(v) => setSecMin(i, v)} />
          ))}
        </div>
        <div className="tfgrid">
          <TimeField label="Each standalone question" sub="its own clock; leaving it keeps what is left"
                     value={S.questionSec} unit="sec" def={DEFAULTS.questionSec} min={5} max={900}
                     onChange={(v) => set({ questionSec: v })} />
          <TimeField label="Each group" sub="one clock for the whole passage / puzzle / chart"
                     value={S.groupMin} unit="min" def={DEFAULTS.groupMin} max={120}
                     onChange={(v) => set({ groupMin: v })} />
        </div>
        {secs.some((i) => budget(i) != null && secMin(i) != null && budget(i) > secMin(i) * 60) && (
          <p className="note budgetnote">
            {secs.filter((i) => budget(i) != null && secMin(i) != null && budget(i) > secMin(i) * 60).map((i) =>
              mock.sections[i].short + ": question + group clocks add up to " + fmtClock(budget(i)) +
              " but the section has " + secMin(i) + " min").join(" · ")}
            {" "}— the section clock will cut in first, as in the real exam.
          </p>
        )}
      </section>

      <section className="msblock summary">
        <div className="tiles">
          <div className="tile"><div className="k">Questions</div><div className="v">{nq}</div></div>
          <div className="tile"><div className="k">Total time</div><div className="v">{totalMin == null ? "∞" : totalMin + " min"}</div></div>
          <div className="tile"><div className="k">Per question</div><div className="v">{fmtLimit(S.questionSec, "s")}</div></div>
          <div className="tile"><div className="k">Per group</div><div className="v">{fmtLimit(S.groupMin, "min")}</div></div>
        </div>
        <ul className="rules">
          <li>Sections run one after another and close behind you, as in IBPS.</li>
          <li>Inside a section, jump to any question that still has time from the palette.</li>
          <li>A question or group whose clock runs out locks with whatever you had chosen.</li>
          <li><kbd>A</kbd>–<kbd>E</kbd> answer · <kbd>N</kbd>/<kbd>→</kbd> next · <kbd>P</kbd>/<kbd>←</kbd> previous · <kbd>M</kbd> mark · <kbd>X</kbd> clear</li>
        </ul>
        <button className="go grad" style={{ maxWidth: 320 }} disabled={!secs.length} onClick={start}>
          Start Model Test {mock.n}{all ? "" : " · " + chosen.map((s) => s.short).join(" + ")}
        </button>
      </section>

      {past.length > 0 && (
        <section className="msblock">
          <h3>Your earlier sittings</h3>
          <div className="scroll">
            <table>
              <thead><tr><th>When</th><th>Sections</th><th className="r">Score</th><th className="r">Accuracy</th><th></th></tr></thead>
              <tbody>
                {past.map((a) => {
                  const s = summarise(a, mock).all;
                  return (
                    <tr key={a.id}>
                      <td className="note">{new Date(a.ended || a.started).toLocaleString()}</td>
                      <td>{a.plan.sections.map((i) => mock.sections[i].short).join(", ")}</td>
                      <td className="r num"><b>{marks(s.marks)}</b> / {s.max}</td>
                      <td className="r num">{pct(s.acc)}</td>
                      <td><button className="ghost" onClick={() => onResult(a)}>Analysis</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
