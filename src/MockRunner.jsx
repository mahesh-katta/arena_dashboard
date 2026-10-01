import React, { useState, useEffect, useRef, useReducer } from "react";
import { imgSrc } from "./store.js";
import Rich from "./Rich.jsx";
import { fmtClock, blockLimit, sectionLimit } from "./mock.js";

const LETTERS = ["a", "b", "c", "d", "e"];
const TICK = 200;

/* The sitting. One attempt object is the whole truth — position, answers, time
   on every question, block and section — mutated in place and saved as it
   goes, so a refresh carries on exactly here.

   Three clocks run at once while you are on a question: the section's, the
   block's (a standalone question, or a whole group), and the question's own
   stopwatch, which only counts and never stops you. A block whose budget runs
   out locks with whatever you had chosen; a section whose budget runs out
   closes, and the next one waits for you to start it. */
export default function MockRunner({ mock, attempt, store, resumed, onFinish, onLeave }) {
  const A = useRef(attempt).current;
  const [, render] = useReducer((x) => x + 1, 0);
  const [ready, setReady] = useState(!resumed);
  const [sheet, setSheet] = useState(null);        // "section" | "finish" | null
  const [palette, setPalette] = useState(false);
  const last = useRef(performance.now());
  const saveT = useRef(0);

  const plan = A.plan;
  const si = plan.sections[A.pos.s];
  const section = mock.sections[si];
  const secBlocks = plan.blocks.filter((bi) => mock.blocks[bi].sec === si);
  const order = secBlocks.flatMap((bi) => mock.blocks[bi].q);
  const blockOf = {};
  for (const bi of plan.blocks) for (const no of mock.blocks[bi].q) blockOf[no] = bi;
  const sectionClosed = !!A.closed.section[si];
  const between = sectionClosed && A.pos.s + 1 < plan.sections.length;
  const cur = A.pos.q;
  const bi = blockOf[cur];
  const blk = mock.blocks[bi];
  const locked = (b) => !!A.closed.block[b];
  const isOpen = (no) => !locked(blockOf[no]) && !A.closed.section[mock.blocks[blockOf[no]].sec];
  const ans = (no) => A.ans[no] || (A.ans[no] = { c: null, t: 0, v: 0, m: false, x: false });
  const running = ready && !A.paused && !sheet && !sectionClosed && A.status === "live";

  const save = (now) => store.put(A, now);

  /* ---- moving about ---- */
  const go = (no) => {
    if (no == null || no === A.pos.q || !isOpen(no)) return;
    A.pos.q = no;
    ans(no).v++;
    save();
    render();
    scrollTo({ top: 0 });
  };
  const nextOpen = (from, dir = 1) => {
    const i = order.indexOf(from);
    for (let k = 1; k <= order.length; k++) {
      const no = order[(i + dir * k + order.length * 2) % order.length];
      if (isOpen(no)) return no;
    }
    return null;
  };
  const next = () => { const n = nextOpen(cur, 1); if (n != null && n !== cur) go(n); };
  const prev = () => { const n = nextOpen(cur, -1); if (n != null && n !== cur) go(n); };

  const closeSection = (why) => {
    if (A.closed.section[si]) return;
    A.closed.section[si] = why;
    for (const b of secBlocks) if (!A.closed.block[b]) A.closed.block[b] = "section";
    if (A.pos.s + 1 >= plan.sections.length) finish();
    else { save(true); render(); }
  };
  const startNextSection = () => {
    A.pos.s++;
    const nsi = plan.sections[A.pos.s];
    const first = plan.blocks.find((b) => mock.blocks[b].sec === nsi);
    A.pos.q = mock.blocks[first].q[0];
    ans(A.pos.q).v++;
    last.current = performance.now();
    save(true);
    render();
  };
  const finish = () => {
    A.status = "done";
    A.ended = Date.now();
    A.paused = false;
    save(true);
    onFinish(A);
  };

  /* ---- the clocks ---- */
  useEffect(() => {
    if (cur != null && ans(cur).v === 0) ans(cur).v = 1;
    const t = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(2, (now - last.current) / 1000);   // a sleeping laptop is not exam time
      last.current = now;
      if (!runningRef.current) return;
      const q = A.pos.q, b = blockOfRef.current[q], s = mock.blocks[b].sec;
      ans(q).t += dt;
      A.used.block[b] = (A.used.block[b] || 0) + dt;
      A.used.section[s] = (A.used.section[s] || 0) + dt;
      A.active += dt;
      // a tick can overshoot a limit by a fraction; hand that back so no clock reads past its budget
      const giveBack = (over) => {
        if (over <= 0) return;
        ans(q).t -= over; A.used.block[b] -= over; A.used.section[s] -= over; A.active -= over;
      };
      const sl = sectionLimit(A, s);
      if (sl != null && A.used.section[s] >= sl) { giveBack(A.used.section[s] - sl); closeSectionRef.current("time"); return; }
      const bl = blockLimit(A, mock, b);
      if (bl != null && A.used.block[b] >= bl) {
        giveBack(A.used.block[b] - bl);
        A.closed.block[b] = "time";
        for (const no of mock.blocks[b].q) if (!ans(no).c) ans(no).x = true;
        const n = nextOpenRef.current(q, 1);
        if (n == null) closeSectionRef.current("locked");
        else { A.pos.q = n; ans(n).v++; save(true); }
      }
      if (now - saveT.current > 5000) { saveT.current = now; save(); }
      render();
    }, TICK);
    return () => clearInterval(t);
  }, []);
  // the interval reads the latest closures through refs
  const runningRef = useRef(running); runningRef.current = running;
  const blockOfRef = useRef(blockOf); blockOfRef.current = blockOf;
  const closeSectionRef = useRef(closeSection); closeSectionRef.current = closeSection;
  const nextOpenRef = useRef(nextOpen); nextOpenRef.current = nextOpen;

  useEffect(() => () => { if (A.status === "live") store.put(A, true); }, []);
  useEffect(() => { last.current = performance.now(); }, [running]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [A.pos.s]);

  /* ---- answering ---- */
  const choose = (k) => {
    if (!running || !isOpen(cur)) return;
    const a = ans(cur);
    a.c = k; a.x = false; a.at = Date.now();
    save(); render();
  };
  const clear = () => { if (!running || !isOpen(cur)) return; ans(cur).c = null; save(); render(); };
  const mark = () => { if (!running) return; ans(cur).m = !ans(cur).m; save(); render(); };
  const markNext = () => { if (!running) return; ans(cur).m = true; next(); render(); };
  const pause = () => { A.paused = true; save(true); render(); };
  const unpause = () => { A.paused = false; last.current = performance.now(); setReady(true); render(); };

  useEffect(() => {
    const onKey = (e) => {
      if (/input|select|textarea/i.test(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!running) {
        if (e.key === "Enter" && (A.paused || !ready)) { e.preventDefault(); unpause(); }
        return;
      }
      const k = e.key.toLowerCase();
      const q = mock.q[cur];
      if (/^[a-e]$/.test(k) && q && q.options[k] != null) { e.preventDefault(); choose(k); }
      else if (/^[1-5]$/.test(k) && q) { const key = LETTERS.filter((x) => q.options[x] != null)[+k - 1]; if (key) { e.preventDefault(); choose(key); } }
      else if (k === "n" || e.key === "ArrowRight") { e.preventDefault(); next(); }
      else if (k === "p" || e.key === "ArrowLeft") { e.preventDefault(); prev(); }
      else if (k === "m") { e.preventDefault(); mark(); }
      else if (k === "x" || e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); clear(); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  /* ---- what is on screen ---- */
  if (A.status !== "live") return null;
  const q = mock.q[cur];
  const a = ans(cur);
  const sLim = sectionLimit(A, si), sUsed = A.used.section[si] || 0;
  const bLim = blockLimit(A, mock, bi), bUsed = A.used.block[bi] || 0;
  const sLeft = sLim == null ? null : sLim - sUsed;
  const bLeft = bLim == null ? null : bLim - bUsed;
  const warn = (left, lim) => (left == null ? "" : left <= Math.min(lim * 0.2, 60) ? " hot" : left <= lim * 0.4 ? " warm" : "");
  const answered = order.filter((no) => A.ans[no] && A.ans[no].c).length;
  const first = blk.group ? mock.q[blk.q[0]] : null;
  const stim = first || q;
  const hasStim = blk.group && first && (first.passage || (first.img && first.img.length) || first.dirs);
  const posInGroup = blk.q.indexOf(cur);

  const stateOf = (no) => {
    const x = A.ans[no];
    const lockedNo = !isOpen(no);
    if (!x || !x.v) return lockedNo ? "gone" : "nv";
    if (x.m) return x.c ? "mka" : "mk";
    return x.c ? "ans" : lockedNo ? "gone" : "na";
  };

  const Palette = (
    <aside className={"palette" + (palette ? " show" : "")}>
      <div className="palsecs">
        {plan.sections.map((s, i) => (
          <span key={s} className={"palsec" + (i === A.pos.s ? " on" : A.closed.section[s] ? " shut" : "")}>
            {mock.sections[s].short}
          </span>
        ))}
      </div>
      <div className="palgrid">
        {secBlocks.map((b) => {
          const B = mock.blocks[b];
          return (
            <div key={b} className={"palblk" + (B.group ? " grp" : "") + (locked(b) ? " lk" : "")}
                 title={B.group ? "Group Q" + B.q[0] + "–" + B.q[B.q.length - 1] : undefined}>
              {B.q.map((no) => (
                <button key={no} className={"palq " + stateOf(no) + (no === cur ? " cur" : "")}
                        disabled={!isOpen(no) || !running} onClick={() => { go(no); setPalette(false); }}>{no}</button>
              ))}
            </div>
          );
        })}
      </div>
      <div className="legend">
        <span><i className="palq ans" />answered</span><span><i className="palq na" />not answered</span>
        <span><i className="palq nv" />not visited</span><span><i className="palq mk" />marked</span>
        <span><i className="palq mka" />marked + answered</span><span><i className="palq gone" />locked</span>
      </div>
      <div className="palcount num">{answered} / {order.length} answered in {section.short}</div>
      <button className="ghost" disabled={!running} onClick={() => setSheet("section")}>
        {A.pos.s + 1 < plan.sections.length ? "Submit " + section.short + " section" : "Submit test"}
      </button>
    </aside>
  );

  const sectionFacts = (s) => {
    const nos = plan.blocks.filter((b) => mock.blocks[b].sec === s).flatMap((b) => mock.blocks[b].q);
    const st = nos.map(stateOf);
    return {
      n: nos.length, ans: nos.filter((no) => A.ans[no] && A.ans[no].c).length,
      marked: nos.filter((no) => A.ans[no] && A.ans[no].m).length,
      nv: st.filter((x) => x === "nv").length,
    };
  };

  return (
    <div className={"mockrun" + ((!ready || A.paused) && !between ? " hidden" : "")}>
      <div className="mockbarx glass">
        <div className="mbsec">
          <span className="mbtitle">Model Test {A.n}</span>
          <b>{section.short}</b>
          <span className="note num">Q{section.from}–{section.to}</span>
        </div>
        <div className={"mbclock" + warn(sLeft, sLim)} title="Section time">
          <small>Section</small>
          <span className="num">{fmtClock(sLim == null ? sUsed : sLeft)}</span>
          {sLim == null && <em>∞ · elapsed</em>}
        </div>
        <div className={"mbclock" + warn(bLeft, bLim)} title={blk.group ? "Time for this whole group" : "Time for this question"}>
          <small>{blk.group ? "Group Q" + blk.q[0] + "–" + blk.q[blk.q.length - 1] : "This question"}</small>
          <span className="num">{bLim == null ? "∞" : fmtClock(bLeft)}</span>
          {bLim != null && <i className="mbbar"><b style={{ width: Math.min(100, (bUsed / bLim) * 100) + "%" }} /></i>}
        </div>
        <div className="mbclock quiet" title="Time on this question so far">
          <small>On Q{cur}</small>
          <span className="num">{fmtClock(a.t)}</span>
        </div>
        <div className="mbtools">
          <button className="ghost" onClick={pause} disabled={!running}>Pause</button>
          <button className="ghost palbtn" onClick={() => setPalette((v) => !v)}>Questions</button>
          <button className="ghost danger" disabled={!running} onClick={() => setSheet("finish")}>Submit test</button>
        </div>
      </div>

      <div className="mocklayout">
        <div className={"mockmain" + (hasStim ? " withstim" : "")}>
          {hasStim && (
            <div className="stimulus mstim">
              <div className="grptag">Group · {blk.q.length} questions share this · Q{blk.q[0]}–{blk.q[blk.q.length - 1]}</div>
              {stim.dirs && <div className="dirs"><b>Directions</b><Rich text={stim.dirs} /></div>}
              {stim.passage && <div className="ptext"><Rich text={stim.passage} /></div>}
              {(stim.img || []).map((src) => <img key={src} src={imgSrc(src)} alt="Shared material for this group" />)}
            </div>
          )}
          <div className="mq">
            {blk.group && (
              <div className="grpnav">
                {blk.q.map((no, i) => (
                  <button key={no} className={"palq " + stateOf(no) + (no === cur ? " cur" : "")}
                          disabled={!running} onClick={() => go(no)}>{no}</button>
                ))}
                <span className="note">question {posInGroup + 1} of {blk.q.length}</span>
              </div>
            )}
            {!q ? (
              <div className="qitem"><p className="note">Q{cur} is not in the question bank. Move on — it is left unanswered.</p></div>
            ) : (
              <div className="qitem here" key={cur}>
                {!hasStim && q.dirs && <div className="dirs"><b>Directions</b><Rich text={q.dirs} /></div>}
                {!hasStim && q.passage && <div className="ptext"><Rich text={q.passage} /></div>}
                {!hasStim && (q.img || []).map((src) => <img key={src} className="qimg" src={imgSrc(src)} alt="" />)}
                {hasStim && q !== first && q.passage && q.passage !== first.passage && <div className="ptext"><Rich text={q.passage} /></div>}
                <div className="qhead">
                  <span className="qnum">Q{cur}</span>
                  <div className="qtext"><Rich text={q.stem} /></div>
                  {a.m && <span className="pill mkpill">marked</span>}
                </div>
                <div className="opts">
                  {LETTERS.filter((k) => q.options[k] != null).map((k) => (
                    <button key={k} className={"opt" + (a.c === k ? " chosen" : "")} disabled={!running}
                            onClick={() => choose(k)}>
                      <span className="key">{k.toUpperCase()}</span>
                      <span><Rich text={q.options[k]} /></span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="mockfoot">
              <button className="ghost" disabled={!running} onClick={prev}>← Previous</button>
              <button className="ghost" disabled={!running || !a.c} onClick={clear}>Clear</button>
              <button className={"ghost" + (a.m ? " on" : "")} disabled={!running} onClick={markNext}>Mark &amp; next</button>
              <button className="next" disabled={!running} onClick={next}>Save &amp; next →</button>
            </div>
            <p className="hint"><kbd>A</kbd>–<kbd>E</kbd> answer · <kbd>N</kbd> next · <kbd>P</kbd> previous · <kbd>M</kbd> mark · <kbd>X</kbd> clear</p>
          </div>
        </div>
        {Palette}
      </div>

      {(!ready || A.paused) && !between && (
        <div className="sheet">
          <div className="sheetbox glass resumebox">
            <span className="resumeicon" aria-hidden="true">{ready ? "❚❚" : "↺"}</span>
            <h3>{ready ? "Paused" : "Model Test " + A.n + " — carry on?"}</h3>
            <p className="scopeline">{section.short} · Q{cur} · {sLim == null ? "no section limit" : fmtClock(sLeft) + " left in the section"}</p>
            <p className="note">The clocks are stopped. The questions stay hidden until you go on.</p>
            <div className="sheetfoot">
              <button className="ghost" onClick={() => { A.paused = true; save(true); onLeave(); }}>Leave for now</button>
              <button className="go grad" onClick={unpause}>{ready ? "Resume" : "Continue"}</button>
            </div>
          </div>
        </div>
      )}

      {between && (() => {
        const f = sectionFacts(si);
        const ns = mock.sections[plan.sections[A.pos.s + 1]];
        const nl = sectionLimit(A, plan.sections[A.pos.s + 1]);
        const why = A.closed.section[si];
        return (
          <div className="sheet">
            <div className="sheetbox glass resumebox">
              <span className="resumeicon" aria-hidden="true">✓</span>
              <h3>{section.short} {why === "time" ? "— time is up" : why === "locked" ? "— every clock has run out" : "submitted"}</h3>
              <p className="scopeline num">{f.ans} answered · {f.n - f.ans} not answered · {f.marked} marked</p>
              <p className="note">This section is closed. Next is <b>{ns.short}</b> (Q{ns.from}–{ns.to}),
                {nl == null ? " with no section limit." : " " + fmtClock(nl) + " on its clock."} It starts when you do.</p>
              <div className="sheetfoot">
                <button className="ghost" onClick={() => { save(true); onLeave(); }}>Leave for now</button>
                <button className="go grad" onClick={startNextSection}>Start {ns.short}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {sheet && (() => {
        const lastSec = A.pos.s + 1 >= plan.sections.length;
        const toFinish = sheet === "finish" || lastSec;
        const rows = (toFinish ? plan.sections.slice(A.pos.s) : [si]).map((s) => ({ s, ...sectionFacts(s) }));
        return (
          <div className="sheet" onClick={(e) => e.target === e.currentTarget && setSheet(null)}>
            <div className="sheetbox glass">
              <h3>{toFinish ? "Submit the whole test?" : "Submit " + section.short + "?"}</h3>
              <table className="subtable">
                <thead><tr><th>Section</th><th className="r">Answered</th><th className="r">Not answered</th><th className="r">Marked</th><th className="r">Not visited</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.s}><td>{mock.sections[r.s].short}</td><td className="r num">{r.ans}</td><td className="r num">{r.n - r.ans}</td>
                      <td className="r num">{r.marked}</td><td className="r num">{r.nv}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="note">
                {toFinish
                  ? (lastSec ? "This is the last section. " : "Sections you have not reached will count as not answered. ") + "You cannot change anything after this."
                  : "You cannot come back to " + section.short + " after this."}
              </p>
              <div className="sheetfoot">
                <button className="ghost" onClick={() => setSheet(null)}>Keep going</button>
                <button className="danger solid" onClick={() => {
                  setSheet(null);
                  if (toFinish) {
                    for (const s of plan.sections.slice(A.pos.s)) if (!A.closed.section[s]) A.closed.section[s] = "submit";
                    finish();
                  } else closeSection("submit");
                }}>{toFinish ? "Submit test" : "Submit section"}</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
