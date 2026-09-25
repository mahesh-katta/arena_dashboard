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

export default function Rich({ text }) {
  if (text == null || text === "") return null;
  const s = String(text);
  if (BANK === "guidely" || !/\[img:|\*\*|__/.test(s)) return s;
  return parts(s);
}
