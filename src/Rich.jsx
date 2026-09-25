import React from "react";
import { BANK, imgSrc } from "./store.js";

/* Question text is plain text. The Guidely bank is shown exactly as stored.
   Other banks carry three light markers from their source HTML, kept so nothing
   is lost: **bold**, __underline__ and [img:path] for a picture sitting inside
   a question or an option. Literal ** or __ in the source (a coded symbol, a
   "____" blank) carry a zero-width space between the characters, so they can
   never be mistaken for a marker. */
const MARK = /(\[img:[^\]\n]+\]|\*\*[\s\S]+?\*\*|__[\s\S]+?__)/g;

function parts(s, key = "") {
  return s.split(MARK).map((part, i) => {
    if (!part) return null;
    const k = key + i;
    if (part.startsWith("[img:"))
      return <img key={k} className="inl" src={imgSrc(part.slice(5, -1))} alt="" loading="lazy" decoding="async" />;
    for (const [m, Tag] of [["**", "b"], ["__", "u"]]) {
      if (part.length >= 4 && part.startsWith(m) && part.endsWith(m)) {
        const inner = part.slice(2, -2);
        return inner.trim() ? <Tag key={k}>{parts(inner, k + ".")}</Tag> : null;
      }
    }
    return part;
  });
}

/* A run of lines shaped "| a | b | c |" is a table from the source: one line per
   row, every row the same width, merged cells left empty so no column shifts.
   The first row is the header. */
const ROWLINE = /^\|.*\|$/;

function Table({ rows, k }) {
  const cells = rows.map((r) => r.slice(1, -1).split(" | ").map((c) => c.trim()));
  const [head, ...body] = cells;
  return (
    <div className="dtable-wrap" key={k}>
      <table className="dtable">
        <thead><tr>{head.map((c, i) => <th key={i}>{parts(c, k + "h" + i)}</th>)}</tr></thead>
        <tbody>
          {body.map((r, ri) => (
            <tr key={ri}>{r.map((c, i) => (i === 0
              ? <th key={i} scope="row">{parts(c, k + "r" + ri + i)}</th>
              : <td key={i}>{parts(c, k + "c" + ri + i)}</td>))}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Rich({ text }) {
  if (text == null || text === "") return null;
  const s = String(text);
  if (BANK === "guidely" || !/\[img:|\*\*|__|^\|.*\|$/m.test(s)) return s;
  const out = [];
  let buf = [], rows = [];
  const flushText = () => {
    if (buf.length) out.push(<span key={"t" + out.length}>{parts(buf.join("\n"), "t" + out.length + ".")}</span>);
    buf = [];
  };
  const flushRows = () => {
    if (rows.length >= 2) out.push(<Table key={"g" + out.length} rows={rows} k={"g" + out.length} />);
    else buf.push(...rows);
    rows = [];
  };
  for (const line of s.split("\n")) {
    if (ROWLINE.test(line.trim())) { flushText(); rows.push(line.trim()); }
    else { flushRows(); buf.push(line); }
  }
  flushRows();
  flushText();
  return out;
}
