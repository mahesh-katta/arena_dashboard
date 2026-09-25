import React, { useState, useMemo } from "react";
import { notesUnder, imgSrc, pdfSrc, qKey } from "./store.js";
import Rich from "./Rich.jsx";
import SourceLine from "./Source.jsx";

/* Notes read as a book: pick a topic, then walk its notes in order, each one
   sitting under the question that prompted it. Not a search box over a flat
   list — you reread a topic the way you revise it. */
export default function NotesView({ data, notes, config, onStartSession }) {
  const [topic, setTopic] = useState(null);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState("");

  const byTopic = useMemo(() => {
    const m = new Map();
    for (const key of Object.keys(notes.map)) {
      const [slug] = key.split("#");
      const meta = data.sets[slug] || {};
      const t = meta.topic || "—";
      if (!m.has(t)) m.set(t, { topic: t, section: meta.section || "—", n: 0 });
      m.get(t).n++;
    }
    return [...m.values()].sort((a, b) =>
      a.section.localeCompare(b.section) || a.topic.localeCompare(b.topic));
  }, [notes.map, data.sets, notes.count]);

  const pages = useMemo(
    () => (topic ? notesUnder(data, notes, [null, topic]) : []), [topic, notes.map, data, notes.count]);

  if (!notes.count)
    return (
      <div className="empty">
        <h3>No notes yet</h3>
        <p className="note">
          Write one while you practise — there's a box under every question.
          They live in their own file and no reset ever deletes them.
        </p>
        <button className="go" style={{ maxWidth: 260, marginTop: 18 }} onClick={() => onStartSession()}>
          Start practising
        </button>
      </div>
    );

  if (!topic)
    return (
      <>
        <h2>Notes</h2>
        <p className="note">
          {notes.count} {notes.count === 1 ? "note" : "notes"} across {byTopic.length}
          {" "}{byTopic.length === 1 ? "topic" : "topics"}. Pick one to read through.
        </p>
        <div className="shelf">
          {byTopic.map((t) => (
            <button key={t.topic} className="book" onClick={() => setTopic(t.topic)}>
              <span className="bsec">{t.section}</span>
              <b>{t.topic}</b>
              <span className="bn">{t.n} {t.n === 1 ? "note" : "notes"}</span>
            </button>
          ))}
        </div>
      </>
    );

  return (
    <>
      <button className="linky" onClick={() => setTopic(null)}>← all topics</button>
      <h2 style={{ marginTop: 8 }}>{topic}</h2>
      <p className="note">{pages.length} {pages.length === 1 ? "note" : "notes"}, in order.</p>

      <div className="pages">
        {pages.map((row, i) => {
          const key = row.key;
          const isEditing = editing === key;
          return (
            <article className="page" key={key}>
              <header>
                <span className="pageno num">{i + 1}</span>
                <span className="note">{row.subtopic}</span>
                <span className="qnum">Q{row.q.q_no}</span>
                {config.pdfs && <a className="srclink" href={pdfSrc(row.q.set)} target="_blank" rel="noreferrer">PDF</a>}
              </header>

              {row.q.passage && <div className="ptext small"><Rich text={row.q.passage} /></div>}
              {(row.q.img || []).map((s) => <img key={s} src={imgSrc(s)} alt="" loading="lazy" />)}
              <div className="qtext"><Rich text={row.q.stem} /></div>
              {row.q.answer && (
                <div className="answerline">
                  Answer <b>{row.q.answer.toUpperCase()}</b>
                  {row.q.options && row.q.options[row.q.answer.toLowerCase()] &&
                    <span> — <Rich text={row.q.options[row.q.answer.toLowerCase()]} /></span>}
                </div>
              )}
              <div className="qfoot"><SourceLine q={row.q} /></div>

              {isEditing ? (
                <div className="noteedit">
                  <textarea value={draft} autoFocus rows={4} onChange={(e) => setDraft(e.target.value)} />
                  <div className="noterow">
                    <button className="ghost" onClick={() => setEditing(null)}>Cancel</button>
                    <button className="solid" onClick={async () => { await notes.set(key, draft); setEditing(null); }}>
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="notebody" onClick={() => { setEditing(key); setDraft(row.note.text); }}>
                  {row.note.text}
                  <span className="editcue">edit</span>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}
