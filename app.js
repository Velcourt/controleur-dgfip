/* Companion site: Concours Contrôleur des Finances publiques 2027-2028.
   Data comes from data/*.json, exported by the book's build script.
   Progress is stored in localStorage only (wrapped in try/catch). */
"use strict";
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const md = s => esc(s).replace(/\^\(([^()]*)\)/g, "<sup>$1</sup>").replace(/\^([−-]?\w+)/g, "<sup>$1</sup>").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*(.+?)\*/g, "<i>$1</i>").replace(/\n{2,}/g, "<br><br>").replace(/\n/g, "<br>");
const store = {
  get(k, d) { try { const v = localStorage.getItem("cfp." + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("cfp." + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
};
let D = { qcm: [], qrc: [], flash: [], config: {} };
let tick = null;
const app = $("#app");

async function load() {
  const get = async f => { try { const r = await fetch(f + ".json", { cache: "no-cache" }); return r.ok ? r.json() : null; } catch (e) { return null; } };
  const [qcm, qrc, flash, config] = await Promise.all(["qcm", "qrc", "flash", "config"].map(get));
  D = { qcm: qcm || [], qrc: qrc || [], flash: flash || [], config: config || {} };
  route();
}
window.addEventListener("hashchange", route);

function route() {
  clearInterval(tick); tick = null;
  const h = location.hash.replace(/^#\/?/, "");
  const [page, arg] = [h.split("/")[0], decodeURIComponent(h.split("/").slice(1).join("/"))];
  document.querySelectorAll("nav a").forEach(a => a.classList.toggle("on", a.getAttribute("href") === "#/" + page));
  const views = { "": home, qcm: arg ? quiz : qcmList, blanc: arg ? exam : blancList, qrc: arg ? qrcSerie : qrcList,
    cartes: arg ? deck : deckList, chrono: chrono, simulateur: simu, oral: oral, diagnostic: () => quiz("diag"),
    maj: maj, liens: liens };
  (views[page] || home)(arg);
  window.scrollTo(0, 0); app.focus({ preventScroll: true });
}

/* ------------------------------------------------------------ helpers */
const series = list => { const m = new Map(); list.forEach(q => { if (!m.has(q.serie)) m.set(q.serie, { id: q.serie, titre: q.titre, ch: q.chapitre, items: [] }); m.get(q.serie).items.push(q); }); return [...m.values()]; };
const P = () => Object.assign({ juste: 1, faux: -0.5, blanc: 0 }, D.config.bareme || {});
const isBlanc = id => /^(qb\d|cb\d|blanc)/.test(id);
const chapName = c => (D.config.chapitres || {})[c] || (typeof c === "number" ? "Chapitre " + c : c === "front" ? "Diagnostic" : String(c ?? ""));
function scoreOf(items, answers) {
  const p = P(); let j = 0, f = 0, b = 0;
  items.forEach((q, i) => { const a = answers[i]; if (!a) b++; else if (a === q.reponse) j++; else f++; });
  const raw = j * p.juste + f * p.faux + b * p.blanc;
  return { j, f, b, raw, sur20: Math.max(0, raw) / (items.length * p.juste) * 20 };
}
const fmt = n => (Math.round(n * 100) / 100).toString().replace(".", ",");
const hms = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ":" : "") + String(m).padStart(h ? 2 : 1, "0") + ":" + String(x).padStart(2, "0"); };

/* ------------------------------------------------------------ home */
function home() {
  const nQ = D.qcm.length, nF = D.flash.length;
  app.innerHTML = `
  <h1>Bienvenue dans l'espace lecteurs</h1>
  <p class="muted">Tout ce qui ne tient pas sur le papier : les QCM du livre en ligne avec pénalité (barème d'entraînement), des QCM blancs chronométrés, ${nF} cartes mémo à répétition espacée, les chronomètres des épreuves et l'entraînement à l'oral.</p>
  <div class="grid">
    ${tile("#/diagnostic", "Diagnostic", "30 questions pour savoir par où commencer.")}
    ${tile("#/qcm", "QCM par thème", nQ + " questions corrigées, par série.")}
    ${tile("#/blanc", "QCM blancs", "30 questions, chronomètre, note sur 20 avec pénalité.")}
    ${tile("#/qrc", "QRC des 5 options", "Rédigez, puis comparez au corrigé.")}
    ${tile("#/cartes", "Cartes mémo", "Répétition espacée, progression sauvegardée.")}
    ${tile("#/oral", "Entraînement oral", "Questions du jury tirées au sort, chrono 5 minutes.")}
    ${tile("#/chrono", "Chronomètres", "Épreuve 1 (3 h) découpée en étapes, épreuve 2 (2 h).")}
    ${tile("#/simulateur", "Simulateur de note", "Coefficients, pénalité du QCM, note éliminatoire.")}
    ${tile("#/maj", "Mises à jour", "Calendrier, changements, errata.")}
  </div>`;
}
const tile = (href, t, d) => `<a class="card" href="${href}"><h3>${esc(t)}</h3><p>${esc(d)}</p></a>`;

/* ------------------------------------------------------------ QCM */
function qcmList() {
  const S = series(D.qcm).filter(s => !isBlanc(s.id) && s.id !== "diag");
  const done = store.get("qcm", {});
  const by = new Map(); S.forEach(s => { const k = chapName(s.ch); if (!by.has(k)) by.set(k, []); by.get(k).push(s); });
  app.innerHTML = `<h1>QCM par thème</h1><p class="muted">Barème d'entraînement : bonne réponse ${fmt(P().juste)}, mauvaise ${fmt(P().faux)}, sans réponse ${fmt(P().blanc)}. ${esc(D.config.bareme_note || "")}</p>` +
    [...by].map(([k, ss]) => `<h2>${esc(k)}</h2><div class="grid">${ss.map(s => {
      const d = done[s.id]; return `<a class="card" href="#/qcm/${encodeURIComponent(s.id)}"><span class="tag">${esc(s.id.toUpperCase())}</span><h3 style="margin-top:6px">${esc(s.titre)}</h3><p>${s.items.length} questions${d ? " · meilleure note " + fmt(d) + "/20" : ""}</p></a>`; }).join("")}</div>`).join("") ||
    `<p class="muted">Les séries arrivent.</p>`;
}

function quiz(id) {
  const items = D.qcm.filter(q => q.serie === id);
  if (!items.length) { app.innerHTML = `<h1>Série introuvable</h1><p><a href="#/qcm">Toutes les séries</a></p>`; return; }
  const ans = {};
  app.innerHTML = `<h1><span class="tag">${esc(id.toUpperCase())}</span> ${esc(items[0].titre)}</h1>
    <p class="muted">Correction immédiate. Le bouton « Je m'abstiens » compte 0, comme une case vide le jour J.</p>
    <div id="qs"></div><div class="card" id="res" hidden></div>`;
  const qs = $("#qs");
  items.forEach((q, i) => {
    const el = document.createElement("div"); el.className = "q";
    el.innerHTML = `<div class="qt">${i + 1}. ${md(q.q)}</div>` +
      Object.entries(q.options).map(([k, v]) => `<button class="opt" data-k="${k}"><b>${k}</b><span>${md(v)}</span></button>`).join("") +
      `<div class="row" style="margin-top:6px"><button class="btn ghost abst">Je m'abstiens</button></div><div class="expl" hidden></div>`;
    const reveal = k => {
      ans[i] = k; el.querySelectorAll(".opt").forEach(b => { b.disabled = true; if (b.dataset.k === q.reponse) b.classList.add("ok"); else if (b.dataset.k === k) b.classList.add("ko"); });
      el.querySelector(".abst").remove();
      const ex = el.querySelector(".expl"); ex.hidden = false; ex.innerHTML = `<b>Réponse ${esc(q.reponse)}.</b> ${md(q.explication)}`;
      if (Object.keys(ans).length === items.length) finish();
    };
    el.querySelectorAll(".opt").forEach(b => b.onclick = () => reveal(b.dataset.k));
    el.querySelector(".abst").onclick = () => reveal(null);
    qs.appendChild(el);
  });
  function finish() {
    const s = scoreOf(items, ans); const best = store.get("qcm", {});
    if (!(best[id] >= s.sur20)) { best[id] = Math.round(s.sur20 * 100) / 100; store.set("qcm", best); }
    const r = $("#res"); r.hidden = false;
    r.innerHTML = `<div class="score">${fmt(s.sur20)}/20</div><p>${s.j} justes, ${s.f} fausses, ${s.b} sans réponse. Points bruts : ${fmt(s.raw)}.</p>` +
      (id === "diag" ? diagAdvice(items, ans) : "") + `<p><a href="#/qcm">Autres séries</a></p>`;
    r.scrollIntoView({ behavior: "smooth" });
  }
}
function diagAdvice(items, ans) {
  const by = {}; items.forEach((q, i) => { const t = (q.q.match(/^\[(.+?)\]/) || [, "Général"])[1]; by[t] = by[t] || [0, 0]; by[t][1]++; if (ans[i] === q.reponse) by[t][0]++; });
  return `<table><tr><th>Domaine</th><th>Résultat</th></tr>${Object.entries(by).map(([k, [a, n]]) => `<tr><td>${esc(k)}</td><td>${a}/${n}</td></tr>`).join("")}</table><p class="muted">Commencez par le domaine le plus faible : le livre indique le chapitre correspondant après le diagnostic.</p>`;
}

/* ------------------------------------------------------------ QCM blancs (exam mode) */
function blancList() {
  const S = series(D.qcm).filter(s => isBlanc(s.id)); const done = store.get("blanc", {});
  app.innerHTML = `<h1>QCM blancs chronométrés</h1><p class="muted">Conditions du jour J : pas de correction avant la fin, barème avec pénalité, chronomètre. Comptez environ ${D.config.minutesQcm || 50} minutes pour 30 questions et gardez le reste des 2 heures pour les QRC.</p><div class="grid">` +
    S.map(s => `<a class="card" href="#/blanc/${encodeURIComponent(s.id)}"><span class="tag">${esc(s.id.toUpperCase())}</span><h3 style="margin-top:6px">${esc(s.titre)}</h3><p>${s.items.length} questions${done[s.id] != null ? " · dernière note " + fmt(done[s.id]) + "/20" : ""}</p></a>`).join("") + `</div>`;
}
function exam(id) {
  const items = D.qcm.filter(q => q.serie === id);
  if (!items.length) { app.innerHTML = `<h1>QCM introuvable</h1><p><a href="#/blanc">Tous les QCM blancs</a></p>`; return; }
  const ans = {}; let left = (D.config.minutesQcm || 50) * 60; let over = false;
  app.innerHTML = `<h1><span class="tag">${esc(id.toUpperCase())}</span> ${esc(items[0].titre)}</h1>
   <div class="sticky row"><span class="timer small" id="t">${hms(left)}</span><span class="muted" id="cnt">0/${items.length} répondues</span><button class="btn" id="end">Rendre la copie</button></div><div id="qs"></div><div id="res"></div>`;
  const qs = $("#qs");
  items.forEach((q, i) => {
    const el = document.createElement("div"); el.className = "q";
    el.innerHTML = `<div class="qt">${i + 1}. ${md(q.q)}</div>` + Object.entries(q.options).map(([k, v]) => `<button class="opt" data-k="${k}"><b>${k}</b><span>${md(v)}</span></button>`).join("") + `<div class="expl" hidden></div>`;
    el.querySelectorAll(".opt").forEach(b => b.onclick = () => {
      if (over) return; const k = b.dataset.k; ans[i] = ans[i] === k ? undefined : k; if (!ans[i]) delete ans[i];
      el.querySelectorAll(".opt").forEach(x => x.classList.toggle("sel", x.dataset.k === ans[i]));
      $("#cnt").textContent = Object.keys(ans).length + "/" + items.length + " répondues";
    });
    qs.appendChild(el);
  });
  tick = setInterval(() => { left--; $("#t").textContent = hms(left); if (left <= 0) end(); }, 1000);
  $("#end").onclick = end;
  function end() {
    if (over) return; over = true; clearInterval(tick);
    [...qs.children].forEach((el, i) => { const q = items[i]; el.querySelectorAll(".opt").forEach(b => { b.disabled = true; if (b.dataset.k === q.reponse) b.classList.add("ok"); else if (b.dataset.k === ans[i]) b.classList.add("ko"); }); const ex = el.querySelector(".expl"); ex.hidden = false; ex.innerHTML = `<b>Réponse ${esc(q.reponse)}.</b> ${md(q.explication)}`; });
    const s = scoreOf(items, ans); const d = store.get("blanc", {}); d[id] = Math.round(s.sur20 * 100) / 100; store.set("blanc", d);
    $("#res").innerHTML = `<div class="card"><div class="score">${fmt(s.sur20)}/20</div><p>${s.j} justes, ${s.f} fausses, ${s.b} sans réponse. Points bruts : ${fmt(s.raw)} sur ${items.length * P().juste}.</p><p class="muted">Le jour J, le QCM n'est qu'une partie de l'épreuve n° 2 : la note de l'épreuve combine QCM et QRC.</p></div>`;
    $("#end").disabled = true; $("#res").scrollIntoView({ behavior: "smooth" });
  }
}

/* ------------------------------------------------------------ QRC */
function qrcList() {
  const S = series(D.qrc).filter(s => !/^(oral|ms)/.test(s.id));
  const by = new Map(); S.forEach(s => { const k = chapName(s.ch); if (!by.has(k)) by.set(k, []); by.get(k).push(s); });
  app.innerHTML = `<h1>QRC : rédiger puis comparer</h1><p class="muted">Écrivez votre réponse, puis affichez le corrigé du livre. Comparez le fond (définition, exemple, chiffres) avant la forme.</p>` +
    [...by].map(([k, ss]) => `<h2>${esc(k)}</h2><div class="grid">${ss.map(s => `<a class="card" href="#/qrc/${encodeURIComponent(s.id)}"><span class="tag">${esc(s.id.toUpperCase())}</span><h3 style="margin-top:6px">${esc(s.titre)}</h3><p>${s.items.length} questions</p></a>`).join("")}</div>`).join("");
}
function qrcSerie(id) {
  const items = D.qrc.filter(q => q.serie === id);
  if (!items.length) { app.innerHTML = `<h1>Série introuvable</h1><p><a href="#/qrc">Toutes les séries</a></p>`; return; }
  const drafts = store.get("qrcDraft", {});
  app.innerHTML = `<h1><span class="tag">${esc(id.toUpperCase())}</span> ${esc(items[0].titre)}</h1>` + items.map((q, i) => `
   <div class="q"><div class="qt">${i + 1}. ${md(q.q)} ${q.points ? `<span class="muted">(${esc(q.points)})</span>` : ""}</div>
   <textarea data-i="${i}" placeholder="Votre réponse…">${esc(drafts[q.id] || "")}</textarea>
   <div class="row" style="margin-top:6px"><button class="btn ghost" data-show="${i}">Voir le corrigé</button></div>
   <div class="expl model" id="m${i}" hidden>${md(q.reponse)}</div></div>`).join("");
  app.querySelectorAll("textarea").forEach(t => t.oninput = () => { const d = store.get("qrcDraft", {}); d[items[t.dataset.i].id] = t.value; store.set("qrcDraft", d); });
  app.querySelectorAll("[data-show]").forEach(b => b.onclick = () => { const m = $("#m" + b.dataset.show); m.hidden = !m.hidden; b.textContent = m.hidden ? "Voir le corrigé" : "Masquer le corrigé"; });
}

/* ------------------------------------------------------------ flashcards (Leitner) */
const BOX_DAYS = [0, 1, 3, 7, 16];
const slugify = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function decks() { const m = new Map(); D.flash.forEach((c, i) => { const k = slugify(c.deck); if (!m.has(k)) m.set(k, { slug: k, name: c.deck, cards: [] }); m.get(k).cards.push({ ...c, key: k + ":" + slugify(c.recto).slice(0, 60) }); }); return [...m.values()]; }
function due(card, st) { const s = st[card.key]; if (!s) return true; return Date.now() >= s.next; }
function deckList() {
  const st = store.get("leitner", {});
  app.innerHTML = `<h1>Cartes mémo</h1><p class="muted">Répétition espacée en 5 boîtes : une carte sue avance d'une boîte (revue après 1, 3, 7 puis 16 jours), une carte ratée revient en boîte 1.</p><div class="grid">` +
    `<a class="card" href="#/cartes/tout"><h3>Toutes les cartes</h3><p>${D.flash.length} cartes · ${D.flash.filter((c, i) => due(decks().flatMap(d => d.cards)[i], st)).length} à revoir</p></a>` +
    decks().map(d => `<a class="card" href="#/cartes/${d.slug}"><h3>${esc(d.name)}</h3><p>${d.cards.length} cartes · ${d.cards.filter(c => due(c, st)).length} à revoir</p></a>`).join("") + `</div>`;
}
function deck(slug) {
  const all = decks(); const d = slug === "tout" ? { name: "Toutes les cartes", cards: all.flatMap(x => x.cards) } : all.find(x => x.slug === slug);
  if (!d) { app.innerHTML = `<h1>Paquet introuvable</h1><p><a href="#/cartes">Tous les paquets</a></p>`; return; }
  let st = store.get("leitner", {});
  let queue = d.cards.filter(c => due(c, st)).sort(() => Math.random() - .5);
  const total = queue.length; let flipped = false;
  const show = () => {
    if (!queue.length) { app.innerHTML = `<h1>${esc(d.name)}</h1><div class="card"><p>Plus aucune carte à revoir aujourd'hui dans ce paquet.</p><div class="row"><button class="btn" id="all">Revoir quand même tout le paquet</button><a class="btn ghost" href="#/cartes">Autres paquets</a></div></div>`; $("#all").onclick = () => { queue = d.cards.slice().sort(() => Math.random() - .5); show(); }; return; }
    const c = queue[0]; flipped = false;
    app.innerHTML = `<h1>${esc(d.name)}</h1><div class="bar"><i style="width:${(total - queue.length) / Math.max(1, total) * 100}%"></i></div><p class="muted">${queue.length} restante(s) · boîte ${(st[c.key]?.box ?? 0) + 1}/5</p>
     <div class="card flash" id="fc"><div><b>${md(c.recto)}</b><p class="muted" style="font-size:13px">Touchez pour retourner</p></div></div>
     <div class="row" id="ctl" hidden><button class="btn ghost" id="ko">À revoir</button><button class="btn" id="ok">Je savais</button></div>`;
    $("#fc").onclick = () => { if (flipped) return; flipped = true; $("#fc").innerHTML = `<div><p class="muted">${md(c.recto)}</p><div class="back">${md(c.verso)}</div></div>`; $("#ctl").hidden = false; };
    const grade = ok => { const s = st[c.key] || { box: 0 }; s.box = ok ? Math.min(4, s.box + 1) : 0; s.next = Date.now() + BOX_DAYS[s.box] * 864e5 - 36e5; st[c.key] = s; store.set("leitner", st); queue.shift(); if (!ok) queue.push(c); show(); };
    $("#ok").onclick = () => grade(true); $("#ko").onclick = () => grade(false);
  };
  show();
}

/* ------------------------------------------------------------ timers */
function chrono() {
  const E = D.config.phases || {};
  const defs = {
    e1: { titre: "Épreuve n° 1 · analyse de dossier (3 h)", dur: 180, phases: E.e1 || [] },
    e2: { titre: "Épreuve n° 2 · QCM et QRC (2 h)", dur: 120, phases: E.e2 || [] },
    oral: { titre: "Oral · présentation (5 min)", dur: 5, phases: E.oral || [] }
  };
  app.innerHTML = `<h1>Chronomètres d'épreuve</h1><p class="muted">Lancez le chronomètre au début de votre sujet blanc. Les étapes suivent la méthode du livre ; l'étape en cours s'affiche en couleur.</p><div class="grid">` +
    Object.entries(defs).map(([k, v]) => `<button class="card" style="text-align:left;cursor:pointer;font:inherit;color:inherit" data-k="${k}"><h3>${esc(v.titre)}</h3><p>Démarrer</p></button>`).join("") + `</div><div id="run"></div>`;
  app.querySelectorAll("[data-k]").forEach(b => b.onclick = () => run(defs[b.dataset.k]));
  function run(def) {
    clearInterval(tick); const t0 = Date.now(); let paused = 0, pauseAt = null;
    $("#run").innerHTML = `<div class="card" style="margin-top:14px"><h2 style="margin-top:0">${esc(def.titre)}</h2><div class="timer" id="tt"></div><div class="bar" style="margin:10px 0"><i id="tb"></i></div><div class="row"><button class="btn ghost" id="pz">Pause</button><button class="btn ghost" id="st">Arrêter</button></div><div id="ph"></div></div>`;
    const draw = () => {
      const el = ((pauseAt || Date.now()) - t0 - paused) / 1000, left = def.dur * 60 - el;
      $("#tt").textContent = hms(left); $("#tb").style.width = Math.min(100, el / (def.dur * 60) * 100) + "%";
      let acc = 0; $("#ph").innerHTML = def.phases.map(p => { const a = acc; acc += p.min; const cls = el / 60 >= acc ? "done" : el / 60 >= a ? "now" : ""; return `<div class="phase ${cls}">${hms(a * 60)} → ${hms(acc * 60)} · ${esc(p.label)}</div>`; }).join("");
      if (left <= 0) { clearInterval(tick); $("#tt").textContent = "Temps écoulé"; }
    };
    tick = setInterval(draw, 500); draw();
    $("#pz").onclick = () => { if (pauseAt) { paused += Date.now() - pauseAt; pauseAt = null; $("#pz").textContent = "Pause"; } else { pauseAt = Date.now(); $("#pz").textContent = "Reprendre"; } };
    $("#st").onclick = () => { clearInterval(tick); $("#run").innerHTML = ""; };
  }
}

/* ------------------------------------------------------------ score simulator */
function simu() {
  const p = P(); const C = Object.assign({ e1: 4, e2: 2, oral: 6, elim: 5 }, D.config.coefs || {});
  app.innerHTML = `<h1>Simulateur de note</h1>
  <div class="card"><h2 style="margin-top:0">1. Votre QCM</h2><div class="row">Justes <input type="number" id="qj" min="0" max="30" value="18"> Fausses <input type="number" id="qf" min="0" max="30" value="6"> Sans réponse <input type="number" id="qb" min="0" max="30" value="6"></div>
  <p id="qr" class="muted"></p></div>
  <div class="card" style="margin-top:12px"><h2 style="margin-top:0">2. Vos notes sur 20</h2><div class="row">Épreuve 1 (coef ${C.e1}) <input type="number" id="n1" step="0.25" min="0" max="20" value="11"> Épreuve 2 (coef ${C.e2}) <input type="number" id="n2" step="0.25" min="0" max="20" value="12"> Oral (coef ${C.oral}) <input type="number" id="no" step="0.25" min="0" max="20" value="13"></div>
  <div id="nr" style="margin-top:10px"></div></div>
  <p class="muted">Barème d'entraînement du QCM : bonne ${fmt(p.juste)}, mauvaise ${fmt(p.faux)}, sans réponse ${fmt(p.blanc)}. ${esc(D.config.bareme_note || "")} Les seuils d'admissibilité et d'admission sont fixés chaque année par le jury : comparez-vous aux barres publiées (page « Mises à jour »).</p>`;
  const v = id => parseFloat($("#" + id).value.replace(",", ".")) || 0;
  const upd = () => {
    const j = v("qj"), f = v("qf"), b = v("qb"); const raw = j * p.juste + f * p.faux + b * p.blanc, n = j + f + b;
    $("#qr").innerHTML = `Points bruts : <b>${fmt(raw)}</b> sur ${fmt(n * p.juste)} · soit <b>${fmt(Math.max(0, raw) / Math.max(1, n * p.juste) * 20)}/20</b> pour la partie QCM. ${f > 0 ? `Sans les ${f} réponses fausses (en vous abstenant), vous auriez ${fmt(j * p.juste)} points.` : ""}`;
    const n1 = v("n1"), n2 = v("n2"), no = v("no");
    const adm = (n1 * C.e1 + n2 * C.e2) / (C.e1 + C.e2), fin = (n1 * C.e1 + n2 * C.e2 + no * C.oral) / (C.e1 + C.e2 + C.oral);
    const el = [n1, n2, no].some(x => x < C.elim);
    $("#nr").innerHTML = `<table><tr><td>Moyenne d'admissibilité (écrits)</td><td><b>${fmt(adm)}/20</b></td></tr><tr><td>Moyenne générale (écrits + oral)</td><td><b>${fmt(fin)}/20</b></td></tr><tr><td>Poids de l'oral dans la note finale</td><td>${Math.round(C.oral / (C.e1 + C.e2 + C.oral) * 100)} %</td></tr></table>` + (el ? `<p style="color:var(--ko)"><b>Attention :</b> une note inférieure à ${C.elim}/20 est éliminatoire.</p>` : "");
  };
  app.querySelectorAll("input").forEach(i => i.oninput = upd); upd();
}

/* ------------------------------------------------------------ oral */
function oral() {
  const Q = D.qrc.filter(q => /^oral/.test(q.serie)), M = D.qrc.filter(q => /^ms/.test(q.serie));
  app.innerHTML = `<h1>Entraînement à l'oral</h1><p class="muted">Tirez une question au sort, répondez à voix haute (enregistrez-vous si possible), puis lisez la piste du livre.</p>
   <div class="row"><button class="btn" id="dq">Question du jury (${Q.length})</button><button class="btn" id="dm">Mise en situation (${M.length})</button><button class="btn ghost" id="pr">Présentation : chrono 5 min</button></div><div id="o" style="margin-top:14px"></div>`;
  const draw = list => { if (!list.length) { $("#o").innerHTML = `<p class="muted">Bientôt disponible.</p>`; return; } const q = list[Math.floor(Math.random() * list.length)]; clearInterval(tick); let s = 0;
    $("#o").innerHTML = `<div class="q"><div class="qt">${md(q.q)}</div><div class="timer small" id="ot">0:00</div><div class="row" style="margin-top:8px"><button class="btn ghost" id="sh">Voir la piste</button></div><div class="expl model" id="ex" hidden>${md(q.reponse)}</div></div>`;
    tick = setInterval(() => { s++; $("#ot").textContent = hms(s); }, 1000);
    $("#sh").onclick = () => { $("#ex").hidden = false; clearInterval(tick); }; };
  $("#dq").onclick = () => draw(Q); $("#dm").onclick = () => draw(M);
  $("#pr").onclick = () => { clearInterval(tick); let left = 300; $("#o").innerHTML = `<div class="card"><div class="timer" id="ot">5:00</div><p class="muted">Arrêtez-vous à 4:30 au plus tard : le jury coupe à 5 minutes.</p></div>`; tick = setInterval(() => { left--; $("#ot").textContent = left > 0 ? hms(left) : "Stop"; if (left <= 0) clearInterval(tick); }, 1000); };
}

/* ------------------------------------------------------------ static pages */
function maj() {
  const L = D.config.maj || [];
  app.innerHTML = `<h1>Mises à jour</h1><p class="muted">Changements de calendrier ou de règlement, résultats publiés, corrections du livre.</p>` +
    (L.length ? L.map(m => `<div class="card" style="margin:10px 0"><span class="tag">${esc(m.date)}</span><h3 style="margin-top:6px">${esc(m.titre)}</h3><p>${md(m.texte)}</p></div>`).join("") : `<p>Aucune mise à jour pour l'instant.</p>`);
}
function liens() {
  const L = D.config.liens || [];
  app.innerHTML = `<h1>Liens officiels</h1>` + L.map(l => `<div class="card" style="margin:10px 0"><h3><a href="${esc(l.url)}" rel="noopener" target="_blank">${esc(l.titre)}</a></h3><p>${esc(l.texte || "")}</p></div>`).join("");
}

load();
