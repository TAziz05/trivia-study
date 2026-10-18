/* Trivia Study — app UI and storage. Everything is stored in this browser. */
(() => {
"use strict";
const G = window.Gen;
const META_KEY = "ts.v1", QKEY = id => "ts.q." + id;
const REVIEW_STEPS = [1, 3, 7, 16];
const COLORS = 8;
const GEMINI_MODELS = [["gemini-3.8-flash", "Gemini 3.8 Flash (recommended)"], ["gemini-3.5-flash-lite", "Gemini 3.5 Flash-Lite (faster, higher free limits)"]];
const ANTHROPIC_MODELS = [["claude-haiku-5-5", "Claude Haiku 5.5 (cheapest)"], ["claude-sonnet-5-5", "Claude Sonnet 5.5 (best questions)"]];

// ---------- storage ----------
const blank = () => ({ classes: [], days: {}, log: {}, review: {}, settings: { provider: "none", geminiKey: "", anthropicKey: "", geminiModel: GEMINI_MODELS[0][0], anthropicModel: ANTHROPIC_MODELS[0][0] }, theme: null, nextColor: 0 });
function load() { try { const s = JSON.parse(localStorage.getItem(META_KEY)); return s ? Object.assign(blank(), s, { settings: Object.assign(blank().settings, s.settings || {}) }) : blank(); } catch (e) { return blank(); } }
let state = load();
const qcache = {};
function save() { try { localStorage.setItem(META_KEY, JSON.stringify(state)); return true; } catch (e) { toast("Couldn't save: this browser's storage is full or blocked."); return false; } }
function getQs(cid) {
  if (!qcache[cid]) { try { qcache[cid] = JSON.parse(localStorage.getItem(QKEY(cid))) || []; } catch (e) { qcache[cid] = []; } }
  return qcache[cid];
}
function setQs(cid, qs) {
  qcache[cid] = qs;
  try { localStorage.setItem(QKEY(cid), JSON.stringify(qs)); return true; }
  catch (e) { toast("Storage is full. Delete a finished class or remove some PDFs, then try again."); return false; }
}
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const cls = id => state.classes.find(c => c.id === id);
const qById = (cid, qid) => getQs(cid).find(q => q.id === qid);

// ---------- dates ----------
function dkey(d = new Date()) { const z = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; }
const dayNum = k => { const [y, m, d] = k.split("-").map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
function addDays(k, n) { const t = new Date((dayNum(k) + n) * 864e5); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`; }
let TODAY = dkey();

// ---------- daily logic ----------
const activeClasses = () => state.classes.filter(c => getQs(c.id).length);
function todayRec() { state.days[TODAY] = state.days[TODAY] || { q: {}, r: {} }; return state.days[TODAY]; }
function dailyQuestion(c) {
  const rec = todayRec();
  if (rec.q[c.id]) { const q = qById(c.id, rec.q[c.id]); if (q) return q; }
  const qs = getQs(c.id); if (!qs.length) return null;
  const order = G.shuffle(qs.map(q => q.id).sort(), G.mulberry(G.hashStr("order:" + c.id)));
  const seen = new Set(); for (const d of Object.values(state.days)) if (d.q && d.q[c.id]) seen.add(d.q[c.id]);
  const start = dayNum(TODAY) % order.length;
  let pick = order[start];
  for (let i = 0; i < order.length; i++) { const id = order[(start + i) % order.length]; if (!seen.has(id)) { pick = id; break; } }
  rec.q[c.id] = pick; save();
  return qById(c.id, pick);
}
function record(cid, q, ok, mode) {
  const L = state.log[cid] = state.log[cid] || { n: 0, c: 0 };
  L.n++; if (ok) L.c++;
  const rv = state.review[q.id];
  if (!ok) state.review[q.id] = { cid, step: 0, due: addDays(TODAY, REVIEW_STEPS[0]) };
  else if (rv && mode === "review") {
    const next = rv.step + 1;
    if (next >= REVIEW_STEPS.length) delete state.review[q.id];
    else state.review[q.id] = { cid, step: next, due: addDays(TODAY, REVIEW_STEPS[next]) };
  }
  save();
}
function dueReviews() {
  const out = [];
  for (const [qid, r] of Object.entries(state.review)) {
    if (r.due > TODAY || !cls(r.cid)) continue;
    const q = qById(r.cid, qid); if (q) out.push({ cid: r.cid, q });
  }
  return out;
}
function streak() {
  const done = d => { const r = state.days[d]; return r && Object.keys(r.q || {}).length && Object.keys(r.q).every(k => r.r && k in r.r); };
  let n = 0, d = TODAY; if (!done(d)) d = addDays(d, -1);
  while (done(d)) { n++; d = addDays(d, -1); }
  return n;
}

// ---------- UI helpers ----------
const $ = s => document.querySelector(s);
const view = $("#view");
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const colorOf = c => `var(--c${c.color % COLORS})`;
function toast(msg, ms = 2200) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), ms); }
function choicesFor(q, salt = "") { return G.shuffle([q.a, ...q.w], G.mulberry(G.hashStr(q.id + salt))); }

function questionCard(c, q, { mode, head = "", onDone, answered = null, salt = "" }) {
  const el = document.createElement("div");
  el.className = "card"; el.style.setProperty("--c", colorOf(c));
  el.innerHTML = `${head}<div class="subj"><span class="dot"></span>${esc(c.name)}</div>
    <div class="topic">${esc(q.t || "")}</div>
    <div class="question">${esc(q.q)}</div>
    <div class="choices">${choicesFor(q, salt).map((o, i) => `<button class="choice" data-v="${esc(o)}"><span class="key">${"ABCD"[i]}</span><span>${esc(o)}</span></button>`).join("")}</div>
    <div class="fb"></div>`;
  const btns = [...el.querySelectorAll(".choice")];
  function reveal(chosen) {
    const ok = chosen === q.a;
    btns.forEach(b => { b.disabled = true; const v = b.dataset.v; b.classList.add(v === q.a ? "right" : v === chosen ? "wrong" : "dim"); });
    el.querySelector(".fb").innerHTML = `<div class="feedback"><div class="verdict ${ok ? "ok" : "no"}">${ok ? "Correct." : `Not quite. The answer is “${esc(q.a)}”.`}</div>
      ${q.e ? `<div>${esc(q.e)}</div>` : ""}<div class="src">Source: ${esc(q.s || "")}</div></div><div class="actions"></div>`;
    return ok;
  }
  if (answered !== null) reveal(answered);
  else btns.forEach(b => b.addEventListener("click", () => { const ok = reveal(b.dataset.v); record(c.id, q, ok, mode); onDone && onDone(ok, b.dataset.v, el.querySelector(".actions")); }));
  return el;
}
document.addEventListener("keydown", e => {
  if (e.target.matches("input,textarea,select")) return;
  const map = { "1": 0, "2": 1, "3": 2, "4": 3, a: 0, b: 1, c: 2, d: 3 };
  const btns = [...document.querySelectorAll(".choice:not([disabled])")];
  if (e.key in map && btns[map[e.key]]) { btns[map[e.key]].click(); return; }
  if (e.key === "Enter") { const n = document.querySelector(".actions .btn:not(.ghost)"); n && n.click(); }
});

// ---------- navigation ----------
let tab = "today";
function setTab(t) { tab = t; document.querySelectorAll("nav.tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === t)); render(); window.scrollTo({ top: 0 }); }
document.querySelectorAll("nav.tabs button").forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));
function showOnly(fn) { document.querySelectorAll("nav.tabs button").forEach(b => b.setAttribute("aria-selected", "false")); fn(); window.scrollTo({ top: 0 }); }

// ---------- Today ----------
function welcome() {
  view.innerHTML = `<div class="card empty">
    <h2>Turn your notes into a daily quiz</h2>
    <p>Create a class, add your lecture PDFs, and you'll get one question per class every day. Missed questions come back for review. Everything stays in this browser.</p>
    <div class="actions" style="justify-content:center"><button class="btn" id="startBtn">Create your first class</button></div>
    <p class="small" style="margin-top:14px">Free questions work right away. For better questions, add a <button class="linkbtn" id="keyLink">free Gemini key</button>.</p></div>`;
  $("#startBtn").onclick = () => { setTab("classes"); newClassForm(); };
  $("#keyLink").onclick = () => showOnly(renderSettings);
}
function renderToday() {
  if (!state.classes.length) return welcome();
  const list = activeClasses();
  if (!list.length) { view.innerHTML = `<div class="card empty"><h2>No questions yet</h2><p>Add a PDF to one of your classes to get started.</p><div class="actions" style="justify-content:center"><button class="btn" id="go">Go to classes</button></div></div>`; $("#go").onclick = () => setTab("classes"); return; }
  const rec = todayRec();
  list.forEach(c => dailyQuestion(c));
  const todays = list.filter(c => rec.q[c.id]);
  const next = todays.find(c => !(c.id in rec.r));
  if (!next) return renderSummary();
  const q = dailyQuestion(next);
  const head = `<div class="steps">${todays.map(c => `<span class="step ${c.id in rec.r ? "done" : c.id === next.id ? "current" : ""}" style="--c:${colorOf(c)}"></span>`).join("")}</div>`;
  view.replaceChildren(questionCard(next, q, { mode: "daily", head, onDone: (ok, chosen, actions) => {
    rec.r[next.id] = { ok, chosen }; save(); chrome();
    const more = todays.find(c => !(c.id in rec.r));
    actions.innerHTML = `<button class="btn">${more ? "Next: " + esc(more.name) + " →" : "See today’s results"}</button>`;
    actions.querySelector(".btn").onclick = () => { renderToday(); window.scrollTo({ top: 0 }); };
  } }));
}
function renderSummary() {
  const rec = todayRec();
  const ids = Object.keys(rec.q).filter(cls);
  const got = ids.filter(id => rec.r[id] && rec.r[id].ok).length;
  const due = dueReviews().length;
  view.innerHTML = `<div class="card"><div class="empty" style="padding:8px 0 0">
      <h2>${got === ids.length ? "Clean sweep." : got >= ids.length / 2 ? "Nice work today." : "Done for today."}</h2>
      <p>${got} of ${ids.length} correct. Missed questions come back in Review tomorrow, then 3, 7 and 16 days later. New questions tomorrow.</p></div>
    <div class="list">${ids.map(id => { const c = cls(id), r = rec.r[id]; return `<div class="srow" style="--c:${colorOf(c)}"><span class="mark">${esc(c.name.trim().charAt(0).toUpperCase() || "?")}</span><span class="name">${esc(c.name)}</span><button class="btn ghost small" data-see="${id}">Revisit</button><span class="res ${r.ok ? "ok" : "no"}">${r.ok ? "✓" : "✗"}</span></div>`; }).join("")}</div>
    <div class="actions">${due ? `<button class="btn ghost" id="goReview">Review ${due} due</button>` : ""}<button class="btn" id="goPractice">Keep practicing</button></div></div>`;
  view.querySelectorAll("[data-see]").forEach(b => b.onclick = () => {
    const c = cls(b.dataset.see), q = qById(c.id, rec.q[c.id]);
    const card = questionCard(c, q, { mode: "view", answered: rec.r[c.id].chosen });
    card.querySelector(".actions").innerHTML = `<button class="btn ghost">← Back</button>`;
    card.querySelector(".actions .btn").onclick = renderSummary;
    view.replaceChildren(card);
  });
  const gr = $("#goReview"); gr && (gr.onclick = () => setTab("review"));
  $("#goPractice").onclick = () => setTab("practice");
}

// ---------- Review ----------
function renderReview() {
  const due = dueReviews();
  if (!due.length) {
    const later = Object.values(state.review).filter(r => cls(r.cid)).length;
    view.innerHTML = `<div class="card empty"><h2>Nothing due</h2><p>${later ? `${later} missed question${later > 1 ? "s are" : " is"} scheduled for later.` : "Questions you miss will show up here for spaced review."}</p></div>`;
    return;
  }
  const { cid, q } = due[0];
  view.replaceChildren(questionCard(cls(cid), q, { mode: "review", salt: TODAY, head: `<div class="small muted" style="margin-bottom:10px">${due.length} due for review</div>`, onDone: (ok, _, actions) => {
    chrome();
    const r = state.review[q.id];
    actions.innerHTML = `<span class="small muted" style="margin-right:auto">${ok ? (r ? "Next review in " + REVIEW_STEPS[r.step] + " days." : "Cleared from review.") : "You'll see this again tomorrow."}</span><button class="btn">Next →</button>`;
    actions.querySelector(".btn").onclick = renderReview;
  } }));
}

// ---------- Practice ----------
let practice = { cid: null, topic: "all", queue: [], n: 0, c: 0 };
function renderPractice() {
  const list = activeClasses();
  if (!list.length) { view.innerHTML = `<div class="card empty"><h2>Nothing to practice yet</h2><p>Add a class and some PDFs first.</p></div>`; return; }
  if (!practice.cid || !cls(practice.cid) || !getQs(practice.cid).length) {
    view.innerHTML = `<div class="card"><div class="subj">Practice</div><p class="muted" style="margin:6px 0 14px">Unlimited questions. Pick a class, and optionally a single PDF or topic.</p>
      <div class="pick-grid">${list.map(c => `<button class="pick" data-c="${c.id}" style="--c:${colorOf(c)}"><div class="subj"><span class="dot"></span>${esc(c.name)}</div><div class="n">${getQs(c.id).length} questions</div></button>`).join("")}</div></div>`;
    view.querySelectorAll(".pick").forEach(b => b.onclick = () => { practice = { cid: b.dataset.c, topic: "all", queue: [], n: 0, c: 0 }; renderPractice(); });
    return;
  }
  const c = cls(practice.cid), all = getQs(c.id);
  const docs = (c.docs || []).filter(d => all.some(q => q.doc === d.id));
  const pool = practice.topic === "all" ? all : all.filter(q => q.doc === practice.topic);
  if (!practice.queue.length) practice.queue = G.shuffle(pool.map(q => q.id));
  const q = qById(c.id, practice.queue[0]);
  const head = document.createElement("div");
  head.className = "card"; head.style.setProperty("--c", colorOf(c)); head.style.marginBottom = "12px";
  head.innerHTML = `<div class="row"><div class="subj" style="flex:1"><span class="dot"></span>${esc(c.name)} practice</div><span class="small muted">${practice.c}/${practice.n} this session</span><button class="btn ghost small" id="pBack">Change class</button></div>
    <select id="pTopic" style="margin-top:12px"><option value="all">All PDFs (${all.length})</option>${docs.map(d => `<option value="${d.id}" ${d.id === practice.topic ? "selected" : ""}>${esc(d.name)} (${all.filter(x => x.doc === d.id).length})</option>`).join("")}</select>`;
  const card = questionCard(c, q, { mode: "practice", salt: String(practice.n), onDone: (ok, _, actions) => {
    practice.n++; if (ok) practice.c++; practice.queue.shift(); chrome();
    actions.innerHTML = `<button class="btn">Next →</button>`; actions.querySelector(".btn").onclick = renderPractice;
  } });
  view.replaceChildren(head, card);
  $("#pBack").onclick = () => { practice.cid = null; renderPractice(); };
  $("#pTopic").onchange = e => { practice.topic = e.target.value; practice.queue = []; renderPractice(); };
}

// ---------- Classes ----------
function renderClasses() {
  const rows = state.classes.map(c => {
    const n = getQs(c.id).length, L = state.log[c.id] || { n: 0, c: 0 };
    const pending = Object.values(state.review).filter(r => r.cid === c.id).length;
    return `<div class="card" style="--c:${colorOf(c)}">
      <div class="row"><div class="subj" style="flex:1;min-width:0"><span class="dot"></span><span style="overflow-wrap:anywhere">${esc(c.name)}</span></div>
      <button class="btn ghost small" data-manage="${c.id}">Manage</button><button class="btn small" data-add="${c.id}">Add PDFs</button></div>
      <div class="small muted" style="margin-top:8px">${(c.docs || []).length} PDF${(c.docs || []).length === 1 ? "" : "s"} · ${n} questions${L.n ? ` · ${Math.round(100 * L.c / L.n)}% correct over ${L.n} answers` : ""}${pending ? ` · ${pending} in review` : ""}</div>
      ${L.n ? `<div class="bar"><span style="width:${Math.round(100 * L.c / L.n)}%"></span></div>` : ""}</div>`;
  }).join("");
  view.innerHTML = `${rows || `<div class="card empty"><h2>No classes yet</h2><p>Create one for each subject you're studying.</p></div>`}
    <div class="card" id="newCard"><button class="btn" id="newBtn">+ New class</button></div>`;
  $("#newBtn").onclick = newClassForm;
  view.querySelectorAll("[data-add]").forEach(b => b.onclick = () => showOnly(() => renderAdd(b.dataset.add)));
  view.querySelectorAll("[data-manage]").forEach(b => b.onclick = () => showOnly(() => renderManage(b.dataset.manage)));
}
function newClassForm() {
  const card = $("#newCard"); if (!card) return;
  card.innerHTML = `<label class="field" for="cName" style="margin-top:0">Class name</label>
    <input type="text" id="cName" maxlength="60" placeholder="e.g. Biology 101, Japanese, Data Mining" autocomplete="off">
    <div class="actions"><button class="btn ghost" id="cCancel">Cancel</button><button class="btn" id="cCreate">Create class</button></div>`;
  const inp = $("#cName"); inp.focus();
  const create = () => {
    const name = inp.value.trim(); if (!name) { inp.focus(); return; }
    const c = { id: uid(), name, color: state.nextColor++ % COLORS, created: TODAY, docs: [] };
    state.classes.push(c); setQs(c.id, []); save();
    showOnly(() => renderAdd(c.id));
  };
  $("#cCreate").onclick = create; inp.onkeydown = e => { if (e.key === "Enter") create(); };
  $("#cCancel").onclick = renderClasses;
}
function aiReady() { const s = state.settings; return (s.provider === "gemini" && s.geminiKey) || (s.provider === "anthropic" && s.anthropicKey); }
function renderAdd(cid) {
  const c = cls(cid); if (!c) return setTab("classes");
  let mode = aiReady() ? "ai" : "free";
  const provName = state.settings.provider === "gemini" ? "Gemini" : "Claude";
  view.innerHTML = `<div class="card" style="--c:${colorOf(c)}">
    <div class="row"><div class="subj" style="flex:1"><span class="dot"></span>${esc(c.name)}</div><button class="btn ghost small" id="back">Done</button></div>
    <h2 class="section-title" style="margin-top:12px">Add PDFs</h2>
    <div class="seg" role="group" aria-label="Question style">
      <button data-mode="free" aria-pressed="${mode === "free"}">Free questions</button>
      <button data-mode="ai" aria-pressed="${mode === "ai"}">AI questions${aiReady() ? ` (${provName})` : ""}</button>
    </div>
    <p class="small muted" id="modeHelp" style="margin:10px 0 14px"></p>
    <label class="drop" id="drop"><input type="file" id="file" accept="application/pdf,.pdf" multiple hidden>
      <strong>Drop PDFs here or tap to choose</strong><span class="small muted">Lecture slides, notes, readings. Several at once is fine.</span></label>
    <div id="jobs"></div></div>`;
  const help = () => {
    $("#modeHelp").innerHTML = mode === "free"
      ? "Fill-in-the-blank and definition questions made in your browser from the PDF's text. Your files never leave this device. Works best on text-heavy notes and readings, poorly on image-heavy slides."
      : aiReady() ? `Multiple-choice questions with explanations, written by ${provName}. Reads slides and images too. Your PDF is sent directly from your browser to ${state.settings.provider === "gemini" ? "Google" : "Anthropic"} using your key.`
      : `AI questions need a free Gemini key (or an Anthropic key). <button class="linkbtn" id="setKey">Set it up in Settings</button>, about 2 minutes.`;
    const sk = $("#setKey"); sk && (sk.onclick = () => showOnly(renderSettings));
  };
  help();
  view.querySelectorAll(".seg button").forEach(b => b.onclick = () => { mode = b.dataset.mode; view.querySelectorAll(".seg button").forEach(x => x.setAttribute("aria-pressed", x === b)); help(); });
  $("#back").onclick = () => setTab("classes");
  const drop = $("#drop"), file = $("#file");
  file.onchange = () => { handleFiles(c, [...file.files], mode === "ai" && aiReady() ? "ai" : "free", mode === "ai" && !aiReady()); file.value = ""; };
  ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", e => handleFiles(c, [...e.dataTransfer.files].filter(f => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)), mode === "ai" && aiReady() ? "ai" : "free", mode === "ai" && !aiReady()));
}
async function handleFiles(c, files, mode, needKey) {
  if (needKey) { toast("Add an API key in Settings first, or switch to Free questions."); return; }
  if (!files.length) { toast("Choose PDF files."); return; }
  const jobs = $("#jobs");
  for (const f of files) {
    const el = document.createElement("div"); el.className = "job";
    el.innerHTML = `<div class="row"><strong style="flex:1;overflow-wrap:anywhere">${esc(f.name)}</strong><span class="pill">${mode === "ai" ? "AI" : "Free"}</span></div><div class="st">Waiting…</div><div class="progress"><span style="width:0%"></span></div>`;
    jobs.prepend(el);
    f._el = el;
  }
  for (const f of files) {
    const el = f._el, st = el.querySelector(".st"), bar = el.querySelector(".progress span");
    const prog = (x, msg) => { bar.style.width = Math.round(x * 100) + "%"; if (msg) st.textContent = msg; };
    try {
      if (f.size > 60 * 1024 * 1024) throw new Error("This file is over 60 MB. Try splitting it.");
      prog(0.02, "Reading PDF…");
      const doc = await G.readPdf(f, x => prog(x * (mode === "ai" ? 0.15 : 0.6)));
      doc.name = f.name;
      let qs;
      if (mode === "ai") qs = await G.aiQuestions(doc, state.settings, (x, msg) => prog(0.15 + x * 0.85, msg));
      else { prog(0.7, "Making questions…"); qs = G.freeQuestions(doc); }
      if (!qs.length) {
        throw new Error(mode === "free" && doc.chars / Math.max(1, doc.numPages) < 250
          ? "This PDF has almost no readable text (it's probably scanned or mostly images). Turn on AI questions in Settings to read it."
          : "Couldn't make questions from this file.");
      }
      const docId = uid();
      const stamped = qs.map(q => Object.assign({}, q, { id: uid(), doc: docId }));
      const all = getQs(c.id).concat(stamped);
      if (!setQs(c.id, all)) throw new Error("Storage is full.");
      c.docs = c.docs || [];
      c.docs.push({ id: docId, name: f.name, pages: doc.numPages, mode, count: stamped.length, added: TODAY });
      save(); chrome();
      prog(1);
      el.classList.add("ok");
      st.textContent = `${stamped.length} questions added.` + (mode === "free" && qs.lowText ? " This PDF is mostly images, so free mode found little text. AI questions would do better." : "");
    } catch (e) {
      el.classList.add("err"); st.textContent = e.message || String(e); bar.style.width = "0%";
      console.error(e);
    }
  }
}
function renderManage(cid) {
  const c = cls(cid); if (!c) return setTab("classes");
  const all = getQs(c.id);
  view.innerHTML = `<div class="card" style="--c:${colorOf(c)}">
    <div class="row"><div class="subj" style="flex:1"><span class="dot"></span>Manage class</div><button class="btn ghost small" id="back">Done</button></div>
    <label class="field" for="rename">Name</label>
    <div class="row" style="flex-wrap:nowrap"><input type="text" id="rename" value="${esc(c.name)}" maxlength="60"><button class="btn small" id="saveName">Save</button></div>
    <h2 class="section-title">PDFs</h2>
    <div>${(c.docs || []).length ? c.docs.map(d => `<div class="doc"><span class="dn">${esc(d.name)}<br><span class="small muted">${d.count} questions · ${d.pages} pages · ${d.mode === "ai" ? "AI" : "Free"}</span></span><button class="btn ghost small" data-rm="${d.id}">Remove</button></div>`).join("") : `<p class="muted small">No PDFs yet.</p>`}</div>
    <div class="actions" style="justify-content:flex-start"><button class="btn small" id="addMore">Add PDFs</button></div>
    <h2 class="section-title">Finished with this class?</h2>
    <p class="small muted" style="margin-top:0">Deleting removes its ${all.length} questions, review schedule and scores from this browser. Your other classes and your streak stay.</p>
    <button class="btn danger" id="del">Delete “${esc(c.name)}”</button></div>`;
  $("#back").onclick = () => setTab("classes");
  $("#addMore").onclick = () => renderAdd(c.id);
  $("#saveName").onclick = () => { const v = $("#rename").value.trim(); if (!v) return; c.name = v; save(); toast("Renamed"); };
  view.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => {
    const d = c.docs.find(x => x.id === b.dataset.rm);
    if (!confirm(`Remove “${d.name}” and its ${d.count} questions?`)) return;
    const removed = new Set(getQs(c.id).filter(q => q.doc === d.id).map(q => q.id));
    setQs(c.id, getQs(c.id).filter(q => q.doc !== d.id));
    removed.forEach(id => delete state.review[id]);
    c.docs = c.docs.filter(x => x.id !== d.id);
    save(); chrome(); renderManage(c.id);
  });
  $("#del").onclick = () => {
    if (!confirm(`Delete “${c.name}” for good? This removes its questions, reviews and scores from this browser.`)) return;
    deleteClass(c.id); toast(`Deleted “${c.name}”`); setTab("classes");
  };
}
function deleteClass(id) {
  state.classes = state.classes.filter(c => c.id !== id);
  try { localStorage.removeItem(QKEY(id)); } catch (e) {}
  delete qcache[id]; delete state.log[id];
  for (const [qid, r] of Object.entries(state.review)) if (r.cid === id) delete state.review[qid];
  for (const d of Object.values(state.days)) { if (d.q) delete d.q[id]; if (d.r) delete d.r[id]; }
  if (practice.cid === id) practice.cid = null;
  save(); chrome();
}

// ---------- Settings ----------
function renderSettings() {
  const s = state.settings;
  let provider = s.provider;
  view.innerHTML = `<div class="card">
    <div class="row"><h2 class="section-title" style="margin:0;flex:1">Settings</h2><button class="btn ghost small" id="back">Done</button></div>
    <h3 style="margin:18px 0 4px">AI questions (optional)</h3>
    <p class="small muted" style="margin:0 0 10px">Free questions always work. Adding a key gets you real multiple-choice questions with explanations, including from image-heavy slides.</p>
    <div class="seg" role="group" aria-label="AI provider">
      <button data-p="none" aria-pressed="${provider === "none"}">Off</button>
      <button data-p="gemini" aria-pressed="${provider === "gemini"}">Gemini (free)</button>
      <button data-p="anthropic" aria-pressed="${provider === "anthropic"}">Anthropic</button>
    </div>
    <div id="provBody"></div>
    <h3 style="margin:26px 0 4px">Use on another device</h3>
    <p class="small muted" style="margin:0 0 10px">Your classes and progress live in this browser only. Download a backup file and load it on your other device. (API keys aren't included; add them separately on each device.)</p>
    <div class="row"><button class="btn ghost" id="exportBtn">Download backup</button><label class="btn ghost" for="importFile">Load backup…</label><input type="file" id="importFile" accept="application/json,.json" hidden></div>
    <h3 style="margin:26px 0 4px">Start over</h3>
    <button class="btn danger small" id="wipe">Erase everything on this device</button>
  </div>`;
  const body = () => {
    const pb = $("#provBody");
    if (provider === "none") { pb.innerHTML = `<p class="small muted" style="margin-top:12px">AI is off. New PDFs use free questions.</p>`; return; }
    const isG = provider === "gemini";
    const models = isG ? GEMINI_MODELS : ANTHROPIC_MODELS;
    const cur = isG ? s.geminiModel : s.anthropicModel;
    pb.innerHTML = `
      <details class="note" ${(isG ? s.geminiKey : s.anthropicKey) ? "" : "open"}><summary>How to get ${isG ? "a free Gemini" : "an Anthropic"} API key</summary>
      ${isG ? `<ol class="steps-list">
        <li>Open <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio → API keys</a> and sign in with any Google account.</li>
        <li>Click <strong>Create API key</strong>. If asked, let it create a project for you.</li>
        <li>Copy the key. It starts with <code>AIza</code>.</li>
        <li>Paste it below and click <strong>Save key</strong>, then <strong>Test</strong>.</li></ol>
        <p class="small" style="margin:8px 0 0">It's free with daily limits, which is plenty for studying. On Google's free tier, Google may use what you send to improve its products, so don't upload anything private or sensitive.</p>`
      : `<ol class="steps-list">
        <li>Go to the <a href="https://platform.claude.com/" target="_blank" rel="noopener">Claude Developer Platform</a> (formerly the Anthropic Console) and sign up or log in.</li>
        <li>Under <strong>Billing</strong>, add a small amount of credit. This one isn't free, but each PDF costs about a few cents with Haiku.</li>
        <li>Open <strong>API keys</strong>, click <strong>Create key</strong>, and copy it. It starts with <code>sk-ant-</code>.</li>
        <li>Paste it below and click <strong>Save key</strong>, then <strong>Test</strong>.</li></ol>`}
      <p class="small" style="margin:8px 0 0">Your key is saved only in this browser and sent only to ${isG ? "Google" : "Anthropic"}. Anyone using this browser profile could see it, so don't add it on a shared computer.</p></details>
      <label class="field" for="key">${isG ? "Gemini" : "Anthropic"} API key</label>
      <div class="row" style="flex-wrap:nowrap"><input type="password" id="key" autocomplete="off" spellcheck="false" placeholder="${isG ? "AIza…" : "sk-ant-…"}" value="${esc(isG ? s.geminiKey : s.anthropicKey)}"><button class="btn ghost small" id="showKey">Show</button></div>
      <label class="field" for="model">Model</label>
      <select id="model">${models.map(([id, label]) => `<option value="${id}" ${id === cur ? "selected" : ""}>${label}</option>`).join("")}</select>
      <div class="actions" style="justify-content:flex-start"><button class="btn" id="saveKey">Save key</button><button class="btn ghost" id="testKey">Test</button>${(isG ? s.geminiKey : s.anthropicKey) ? `<button class="btn ghost" id="clearKey">Remove key</button>` : ""}<span class="small muted" id="keyMsg"></span></div>`;
    $("#showKey").onclick = () => { const k = $("#key"); k.type = k.type === "password" ? "text" : "password"; $("#showKey").textContent = k.type === "password" ? "Show" : "Hide"; };
    const persist = () => { const k = $("#key").value.trim(); if (isG) { s.geminiKey = k; s.geminiModel = $("#model").value; } else { s.anthropicKey = k; s.anthropicModel = $("#model").value; } s.provider = provider; save(); };
    $("#saveKey").onclick = () => { persist(); toast("Saved. New PDFs can use AI questions."); body(); };
    $("#model").onchange = persist;
    $("#testKey").onclick = async () => {
      persist(); const msg = $("#keyMsg"); msg.textContent = "Testing…";
      try { await G.testKey(provider, isG ? s.geminiKey : s.anthropicKey, isG ? s.geminiModel : s.anthropicModel); msg.textContent = "✓ Key works"; msg.style.color = "var(--good)"; }
      catch (e) { msg.textContent = e.message; msg.style.color = "var(--bad)"; }
    };
    const ck = $("#clearKey"); ck && (ck.onclick = () => { if (isG) s.geminiKey = ""; else s.anthropicKey = ""; save(); body(); toast("Key removed"); });
  };
  body();
  view.querySelectorAll(".seg button").forEach(b => b.onclick = () => { provider = b.dataset.p; view.querySelectorAll(".seg button").forEach(x => x.setAttribute("aria-pressed", x === b)); if (provider === "none") { s.provider = "none"; save(); } body(); });
  $("#back").onclick = () => setTab(tab);
  $("#exportBtn").onclick = () => {
    const data = { app: "trivia-study", version: 1, exported: new Date().toISOString(), state: Object.assign({}, state, { settings: Object.assign({}, state.settings, { geminiKey: "", anthropicKey: "" }) }), questions: Object.fromEntries(state.classes.map(c => [c.id, getQs(c.id)])) };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
    a.download = `trivia-study-backup-${TODAY}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  $("#importFile").onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data.app !== "trivia-study" || !data.state) throw new Error();
      if (!confirm("Replace everything on this device with this backup?")) return;
      const keep = state.settings;
      state.classes.forEach(c => { try { localStorage.removeItem(QKEY(c.id)); } catch (e) {} delete qcache[c.id]; });
      state = Object.assign(blank(), data.state, { settings: Object.assign({}, data.state.settings, { geminiKey: keep.geminiKey, anthropicKey: keep.anthropicKey }) });
      for (const [cid, qs] of Object.entries(data.questions || {})) setQs(cid, qs);
      save(); chrome(); toast("Backup loaded"); setTab("today");
    } catch (err) { toast("That file isn't a Trivia Study backup."); }
  };
  $("#wipe").onclick = () => {
    if (!confirm("Erase all classes, questions, progress and keys on this device?")) return;
    state.classes.forEach(c => { try { localStorage.removeItem(QKEY(c.id)); } catch (e) {} });
    try { localStorage.removeItem(META_KEY); } catch (e) {}
    state = blank(); Object.keys(qcache).forEach(k => delete qcache[k]); chrome(); setTab("today");
  };
}

function renderAbout() {
  view.innerHTML = `<div class="card">
    <div class="row"><h2 class="section-title" style="margin:0;flex:1">How it works</h2><button class="btn ghost small" id="back">Done</button></div>
    <ol class="steps-list">
      <li><strong>Make a class</strong> for each subject, then add your PDFs (slides, notes, readings).</li>
      <li><strong>Every day</strong> you get one question per class. Finish them all to keep your streak.</li>
      <li><strong>Missed questions</strong> come back in Review after 1, 3, 7 and 16 days.</li>
      <li><strong>Practice</strong> gives unlimited questions from any class or single PDF.</li>
      <li><strong>Done with a class?</strong> Delete it under Classes → Manage.</li>
    </ol>
    <h3 style="margin:20px 0 4px">Free vs. AI questions</h3>
    <p class="small" style="margin:0">Free questions are made in your browser from your PDF's text: fill-in-the-blank and definition matching. They work best on notes and readings, and nothing is uploaded anywhere. AI questions (optional, with your own free Gemini key or an Anthropic key) are written like a tutor would, with explanations, and they can read image-heavy slides.</p>
    <h3 style="margin:20px 0 4px">Privacy</h3>
    <p class="small" style="margin:0">There's no account and no server. Your classes, questions, scores and keys are stored in this browser. In AI mode, the PDF goes directly from your browser to the AI provider you chose. Clearing your browser data erases everything, so download a backup in Settings if you care about your progress.</p>
  </div>`;
  $("#back").onclick = () => setTab(tab);
}

// ---------- chrome ----------
function render() { ({ today: renderToday, review: renderReview, practice: renderPractice, classes: renderClasses })[tab](); }
function chrome() {
  $("#streakNum").textContent = streak();
  const n = dueReviews().length, b = $("#reviewBadge"); b.hidden = !n; b.textContent = n;
}
function applyTheme() { if (state.theme) document.documentElement.setAttribute("data-theme", state.theme); else document.documentElement.removeAttribute("data-theme"); }
$("#themeBtn").onclick = () => { const o = [null, "light", "dark"]; state.theme = o[(o.indexOf(state.theme) + 1) % 3]; save(); applyTheme(); toast("Theme: " + (state.theme || "system")); };
$("#settingsBtn").onclick = () => showOnly(renderSettings);
$("#aboutBtn").onclick = () => showOnly(renderAbout);
$("#dateLine").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
document.addEventListener("visibilitychange", () => { if (!document.hidden && dkey() !== TODAY) { TODAY = dkey(); chrome(); render(); } });
applyTheme(); chrome(); render();
})();
