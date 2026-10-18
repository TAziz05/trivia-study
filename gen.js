/* Trivia Study — PDF reading and question generation.
 * Free mode: everything runs in the browser (pdf.js + heuristics).
 * AI mode: the PDF is sent straight from the browser to Google Gemini or
 * Anthropic using the user's own key. No server of ours is involved.
 */
(function () {
"use strict";

pdfjsLib.GlobalWorkerOptions.workerSrc = "lib/pdf.worker.min.js";

const STOP = new Set(("a an the and or but if then else of to in on at by for with from as is are was were be been being this that these those it its it's into than so such not no nor do does did done can could should would may might must will shall about above after again against all am any because before below between both each few further here how i me my more most other our out over own same she he her him his they them their there what when where which while who whom why you your we us also via per vs etc e.g i.e eg ie one two three use used using get got make made very just only much many some every lecture slide chapter page figure fig table example examples note notes see also within without upon onto among across like since consider however therefore thus recall suppose assume lets let given using works way ways first second third finally next instead rather quite still even really often usually always never sometimes thing things lot kind sort part parts case cases fact point points question questions answer answers idea ideas time times say says said says shows show shown want wants need needs").split(/\s+/));

// ---------- PDF text extraction ----------
async function readPdf(file, onProgress) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    // Rebuild lines from item positions so slide bullets stay separate.
    let lines = [], cur = "", lastY = null;
    for (const it of tc.items) {
      if (!("str" in it)) continue;
      const y = Math.round(it.transform[5]);
      if (lastY !== null && Math.abs(y - lastY) > 2) { if (cur.trim()) lines.push(cur.trim()); cur = ""; }
      cur += (cur && !cur.endsWith(" ") && it.str && !it.str.startsWith(" ") ? " " : "") + it.str;
      lastY = y;
      if (it.hasEOL) { if (cur.trim()) lines.push(cur.trim()); cur = ""; lastY = null; }
    }
    if (cur.trim()) lines.push(cur.trim());
    pages.push(lines.map(l => l.replace(/\s+/g, " ")).join("\n"));
    onProgress && onProgress(p / pdf.numPages);
  }
  return { buf, numPages: pdf.numPages, pages, chars: pages.join("").replace(/\s/g, "").length };
}

// ---------- free (no-AI) generator ----------
function cleanPages(pages) {
  // Drop lines repeated on many pages (headers/footers) and everything after a references heading.
  const count = new Map();
  pages.forEach(t => new Set(t.split("\n").map(l => l.trim().toLowerCase()).filter(Boolean)).forEach(l => count.set(l, (count.get(l) || 0) + 1)));
  const lim = Math.max(3, pages.length * 0.3);
  let stop = false;
  return pages.map(t => {
    if (stop) return "";
    const keep = [];
    for (const line of t.split("\n")) {
      const l = line.trim();
      if (/^(references|bibliography|works cited|literature cited|sources)\s*:?$/i.test(l)) { stop = true; break; }
      if (pages.length >= 4 && count.get(l.toLowerCase()) >= lim) continue;
      if (/^\d{1,4}$/.test(l)) continue; // bare page numbers
      keep.push(line);
    }
    return keep.join("\n");
  });
}
function sentencesOf(pageText) {
  // Join wrapped lines, keep bullets as separate units.
  const units = [];
  let para = "";
  for (const raw of pageText.split("\n")) {
    const line = raw.replace(/^[•●▪◦\-–—*·o]\s+/, "").trim();
    const isBullet = /^[•●▪◦\-–—*·]\s/.test(raw.trim());
    if (!line) continue;
    if (isBullet && para) { units.push(para); para = ""; }
    para = para ? (para.endsWith("-") ? para.slice(0, -1) + line : para + " " + line) : line;
    if (/[.!?:;]$/.test(line) || isBullet) { units.push(para); para = ""; }
  }
  if (para) units.push(para);
  const out = [];
  for (const u of units) for (const s of u.split(/(?<=[.!?])\s+(?=[A-Z0-9“"(])/)) out.push(s.trim());
  return out.filter(s => s.length > 0);
}
const words = s => s.match(/[A-Za-z][A-Za-z'’\-]*[A-Za-z]|[A-Za-z]/g) || [];
const cleanTerm = t => t.replace(/^[^A-Za-z0-9(]+|[^A-Za-z0-9)]+$/g, "").trim();
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const termRe = (k, flags = "i") => new RegExp("(?<![\\w-])" + escRe(k) + "(?![\\w-])", flags);
const JUNK = /\b(universit|press|journal|vol|pp|http|www|copyright|isbn|doi|proceedings|ed\.|eds\.|inc|retrieved|accessed|jstor|instructor|lecture)\b/i;
const looksCitation = s => (/\(?(1[89]|20)\d\d[a-z]?\)?[.,;:]/.test(s) && ((s.match(/[A-Z][a-z]+,/g) || []).length >= 2 || /[“"].+[”"]/.test(s) || /\bIn\s+[A-Z]\./.test(s))) || /:\s*\d+[–-]\d+/.test(s) || JUNK.test(s);
const spacedOut = s => { const t = s.split(/\s+/); return t.filter(x => /^[A-Za-z]$/.test(x)).length > t.length * 0.2; };
const ADJ = /(ly|al|ous|ive|ful|ing|ed|able|ible|ic|ary|less)$/i;

function keyTerms(sents) {
  const freq = new Map(), cap = new Map();
  for (const s of sents) {
    if (looksCitation(s) || spacedOut(s)) continue;
    const ws = words(s);
    for (let n = 1; n <= 3; n++) {
      for (let i = 0; i + n <= ws.length; i++) {
        const g = ws.slice(i, i + n);
        if (STOP.has(g[0].toLowerCase()) || STOP.has(g[n - 1].toLowerCase())) continue;
        if (n === 1 && (g[0].length < 5 || ADJ.test(g[0]))) continue;
        if (g.some(x => x.length < 2) || JUNK.test(g.join(" "))) continue;
        const key = g.join(" ").toLowerCase();
        freq.set(key, (freq.get(key) || 0) + 1);
        if (i > 0 && /^[A-Z]/.test(g[0])) cap.set(key, (cap.get(key) || 0) + 1);
      }
    }
  }
  const scored = [];
  for (const [k, f] of freq) {
    const n = k.split(" ").length;
    if (f < 2 && !(cap.get(k) >= 1 && n > 1)) continue;
    if (n === 1 && f < 3 && !(cap.get(k) >= 1)) continue;
    if (n === 3 && f < 3 && !(cap.get(k) >= 2)) continue;
    let score = f * (n === 1 ? 1 : n === 2 ? 2.2 : 2.6) + (cap.get(k) || 0) * 1.5 + Math.min(k.length, 14) / 7;
    scored.push({ k, f, n, score });
  }
  scored.sort((a, b) => b.score - a.score);
  // drop unigrams that are just pieces of a stronger bigram with same frequency
  const chosen = [];
  for (const t of scored) {
    if (chosen.some(c => c.k.includes(t.k) && c.f >= t.f)) continue;
    chosen.push(t);
    if (chosen.length > 160) break;
  }
  return chosen;
}

function pickDistractors(answer, pool, n, rng, avoidText = "") {
  const al = answer.toLowerCase(), avoid = avoidText.toLowerCase();
  const aw = answer.split(" ").length;
  const cands = pool.filter(p => {
    const pl = p.toLowerCase();
    return pl !== al && !al.includes(pl) && !pl.includes(al) && !avoid.includes(pl);
  });
  const capA = /^[A-Z]/.test(answer), upA = answer === answer.toUpperCase();
  const cost = c => Math.abs(c.split(" ").length - aw) * 2 + (/^[A-Z]/.test(c) !== capA ? 1 : 0) + ((c === c.toUpperCase()) !== upA ? 1.5 : 0) + Math.abs(c.length - answer.length) / 12;
  const scored = cands.map(c => [c, cost(c) + rng() * 1.2]).sort((x, y) => x[1] - y[1]);
  cands.length = 0; scored.forEach(([c]) => cands.push(c));
  const out = [];
  for (const c of cands) { if (!out.some(o => o.toLowerCase() === c.toLowerCase())) out.push(c); if (out.length === n) break; }
  return out;
}

function countIn(sents, term) { const re = termRe(term, "gi"); let c = 0; for (const s of sents) c += (s.match(re) || []).length; return c; }
function matchCase(term, sentence) {
  const m = sentence.match(termRe(term));
  return m ? m[0] : term;
}

function freeQuestions(doc, opts = {}) {
  const rng = mulberry(hashStr(doc.name));
  const pagesClean = cleanPages(doc.pages);
  const perPage = pagesClean.map(sentencesOf);
  const all = perPage.flat();
  const terms = keyTerms(all);
  const termList = terms.map(t => t.k);
  const termSet = new Set(termList);
  const display = new Map(termList.map(k => {
    const c = new Map(); const re = termRe(k, "gi");
    for (const s of all) for (const m of (s.match(re) || [])) { if (s.startsWith(m)) continue; c.set(m, (c.get(m) || 0) + 1); }
    let best = k, bn = 0; for (const [f, n] of c) if (n > bn) { best = f; bn = n; }
    return [k, best];
  }));
  const termPool = termList.map(k => display.get(k));
  const qs = [], usedSent = new Set();
  const topic = doc.name.replace(/\.pdf$/i, "");

  // 1) definitions: "X is/are/refers to ... Y"
  const defs = [];
  const defRe = /^(?:an?\s+|the\s+)?([A-Za-z][\w\s\-’'()]{1,48}?)\s*(?:\bis\b|\bare\b|\brefers to\b|\bmeans\b|\bis defined as\b|\bis called\b|:|=|—|–)\s+(.{18,220})$/;
  perPage.forEach((ss, pi) => ss.forEach(s => {
    const m = s.match(defRe);
    if (!m) return;
    const term = cleanTerm(m[1]);
    const def = m[2].replace(/\s+/g, " ").trim().replace(/[.;]$/, "");
    const tw = term.split(/\s+/).length;
    if (tw > 5 || term.length < 3 || STOP.has(term.toLowerCase())) return;
    if (/^(it|its|this|that|there|which|what|these|those|they|he|she|we|you|i|our|my|one|some|another|each|such|here|then|now|so|but|and|or|first|second|third|next|finally|note|recall|example|bad|good|yes|no)\b/i.test(term)) return;
    if (/^(the|a|an)\s/i.test(m[1].trim()) && !termSet.has(term.toLowerCase())) return;
    if (!termSet.has(term.toLowerCase()) && countIn(all, term) < 2) return;
    if (/^[^:=—–]*[:=—–]\s/.test(s) && !/\b(is|are|refers to|means|defined as|called)\b/.test(s.slice(0, m[1].length + 20)) && countIn(all, term) < 3) return;
    if (term === term.toUpperCase() && term.length < 6) return;
    if (looksCitation(s) || spacedOut(s)) return;
    if (words(def).length < 4) return;
    defs.push({ term, def, page: pi + 1, s });
  }));
  const defTerms = defs.map(d => d.term);
  for (const d of defs) {
    const pool = defTerms.length >= 6 ? defTerms.concat(termPool) : termPool.concat(defTerms);
    const w = pickDistractors(d.term, pool, 3, rng, d.def);
    if (w.length < 3) continue;
    usedSent.add(d.s);
    qs.push({ t: topic, s: `${doc.name}, p. ${d.page}`, q: `Which term matches this description?\n“${d.def}”`, a: d.term, w, e: `From your notes: “${d.s}”` });
  }

  // 2) cloze: blank a key term inside a good sentence
  const strong = new Set(termList.slice(0, Math.max(30, Math.round(termList.length * 0.7))));
  perPage.forEach((ss, pi) => ss.forEach(s => {
    if (usedSent.has(s)) return;
    const wc = words(s).length;
    if (wc < 7 || wc > 45) return;
    if ((s.match(/[0-9]/g) || []).length > s.length * 0.25) return;
    if (/https?:|www\.|@|©/.test(s) || looksCitation(s) || spacedOut(s)) return;
    if (!/^[A-Z0-9“"(]/.test(s)) return;
    let best = null;
    for (const k of termList) {
      if (!strong.has(k)) continue;
      if (termRe(k).test(s)) { best = k; break; }
    }
    if (!best) return;
    const shown = matchCase(best, s);
    const blanked = s.replace(termRe(best), "_____");
    if (blanked.replace(/_____/, "").trim().length < 25) return;
    const w = pickDistractors(display.get(best) || shown, termPool, 3, rng, s);
    if (w.length < 3) return;
    usedSent.add(s);
    qs.push({ t: topic, s: `${doc.name}, p. ${pi + 1}`, q: `Fill in the blank:\n${blanked}`, a: display.get(best) || shown, w, e: `From your notes: “${s}”` });
  }));

  // keep a reasonable number, spread across pages
  const cap = Math.max(10, Math.min(400, Math.round(doc.numPages * 4)));
  const lowText = doc.chars / Math.max(1, doc.numPages) < 250;
  const res = shuffle(qs, rng).slice(0, cap);
  res.lowText = lowText;
  return res;
}

// ---------- AI generation ----------
const AI_PROMPT = (n, docName, pageOffset) => `You are writing study quiz questions for a student, based ONLY on the attached course material ("${docName}").

Write ${n} multiple-choice questions that test understanding of the most important concepts, definitions, arguments, examples, and facts in the material. Spread them across the whole document. Avoid trivia about slide layout, page numbers, instructor names, course logistics, or URLs. Each question must be answerable from the material alone.

Rules:
- Exactly 1 correct answer and 3 plausible but clearly wrong answers of similar length and style.
- Do not use "all of the above" or "none of the above".
- Keep questions and answers concise.
- "explanation": 1–2 sentences on why the answer is right, grounded in the material.
- "topic": a short topic label (2–5 words).
- "page": the page number in the attached material where the answer is found (the first page is 1).
- Write in the same language as the material.

Return ONLY a JSON array, no prose, like:
[{"topic":"...","question":"...","answer":"...","wrong":["...","...","..."],"explanation":"...","page":3}]`;

const AI_TEXT_PROMPT = (n, docName) => AI_PROMPT(n, docName, 0) + `\n\nThe material (text extracted from the PDF, with page markers) follows:\n`;

function parseAiJson(text) {
  let t = String(text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const s = t.indexOf("["), e = t.lastIndexOf("]");
  if (s >= 0 && e > s) t = t.slice(s, e + 1);
  const arr = JSON.parse(t);
  if (!Array.isArray(arr)) throw new Error("AI response was not a list");
  return arr;
}
function normalizeAi(arr, doc, offset) {
  const out = [];
  for (const x of arr) {
    if (!x || typeof x.question !== "string" || typeof x.answer !== "string" || !Array.isArray(x.wrong)) continue;
    const w = [...new Set(x.wrong.map(String).map(s => s.trim()).filter(s => s && s !== x.answer.trim()))].slice(0, 3);
    if (w.length < 3) continue;
    const page = Number.isFinite(+x.page) && +x.page > 0 ? Math.round(+x.page) + (offset || 0) : null;
    out.push({ t: (x.topic || doc.name.replace(/\.pdf$/i, "")).toString().slice(0, 60), s: page ? `${doc.name}, p. ${page}` : doc.name, q: x.question.trim(), a: x.answer.trim(), w, e: (x.explanation || "").toString().trim() });
  }
  return out;
}

function b64(buf) {
  const bytes = new Uint8Array(buf); let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function splitPdf(buf, chunkPages) {
  const src = await PDFLib.PDFDocument.load(buf, { ignoreEncryption: true });
  const n = src.getPageCount(), parts = [];
  for (let start = 0; start < n; start += chunkPages) {
    const out = await PDFLib.PDFDocument.create();
    const idx = []; for (let i = start; i < Math.min(n, start + chunkPages); i++) idx.push(i);
    const copied = await out.copyPages(src, idx);
    copied.forEach(p => out.addPage(p));
    parts.push({ offset: start, pages: idx.length, bytes: await out.save() });
  }
  return parts;
}

async function callGemini(key, model, promptText, pdfBytes) {
  const parts = [];
  if (pdfBytes) parts.push({ inline_data: { mime_type: "application/pdf", data: b64(pdfBytes) } });
  parts.push({ text: promptText });
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseMimeType: "application/json", temperature: 0.4 } }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(friendlyError("Gemini", res.status, data && data.error && data.error.message));
  const text = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts || []).map(p => p.text || "").join("");
  if (!text) throw new Error("Gemini returned no questions (the file may have been blocked or was empty).");
  return text;
}

async function callAnthropic(key, model, promptText, pdfBytes) {
  const content = [];
  if (pdfBytes) content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64(pdfBytes) } });
  content.push({ type: "text", text: promptText });
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({ model, max_tokens: 16000, messages: [{ role: "user", content }] }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(friendlyError("Anthropic", res.status, data && data.error && data.error.message));
  return (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
}

function friendlyError(who, status, msg) {
  if (status === 400 && /api key|API_KEY_INVALID/i.test(msg || "")) return `${who} says the API key isn't valid. Check it in Settings.`;
  if (status === 401 || status === 403) return `${who} rejected the API key. Check it in Settings.`;
  if (status === 429) return `${who} rate limit reached. Wait a minute (or until tomorrow on a free tier) and try again.`;
  if (status === 402 || /credit|billing/i.test(msg || "")) return `${who}: your account needs credits/billing for this key.`;
  return `${who} error ${status}${msg ? ": " + msg : ""}`;
}

async function aiQuestions(doc, settings, onProgress) {
  const provider = settings.provider;
  const key = provider === "gemini" ? settings.geminiKey : settings.anthropicKey;
  const model = provider === "gemini" ? (settings.geminiModel || "gemini-3.8-flash") : (settings.anthropicModel || "claude-haiku-5-5");
  const call = provider === "gemini" ? callGemini : callAnthropic;
  if (!key) throw new Error("Add your API key in Settings first.");
  const CHUNK = 20;
  let parts;
  try { parts = await splitPdf(doc.buf, CHUNK); }
  catch (e) { parts = null; }
  const out = [];
  if (parts) {
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const n = Math.max(6, Math.min(40, Math.round(p.pages * 2.5)));
      onProgress && onProgress(i / parts.length, `Writing questions (part ${i + 1} of ${parts.length})…`);
      const text = await call(key, model, AI_PROMPT(n, doc.name, p.offset), p.bytes);
      out.push(...normalizeAi(parseAiJson(text), doc, p.offset));
    }
  } else {
    // Fallback: send extracted text in chunks.
    for (let start = 0; start < doc.pages.length; start += CHUNK) {
      const slice = doc.pages.slice(start, start + CHUNK).map((t, i) => `--- page ${start + i + 1} ---\n${t}`).join("\n");
      if (slice.replace(/\s|-|page|\d/g, "").length < 200) continue;
      const n = Math.max(6, Math.min(40, Math.round(Math.min(CHUNK, doc.pages.length - start) * 2.5)));
      onProgress && onProgress(start / doc.pages.length, "Writing questions…");
      const text = await call(key, model, AI_TEXT_PROMPT(n, doc.name) + slice, null);
      out.push(...normalizeAi(parseAiJson(text), doc, 0));
    }
  }
  return out;
}

async function testKey(provider, key, model) {
  const call = provider === "gemini" ? callGemini : callAnthropic;
  const text = await call(key, model, 'Reply with exactly this JSON: [{"ok":true}]', null);
  return /ok/.test(text);
}

// ---------- utils ----------
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function shuffle(arr, rng = Math.random) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

window.Gen = { readPdf, freeQuestions, aiQuestions, testKey, hashStr, mulberry, shuffle };
})();
