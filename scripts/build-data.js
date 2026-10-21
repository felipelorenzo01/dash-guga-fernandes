#!/usr/bin/env node
// Gera o data.json do painel do Guga Fernandes a partir de:
//   Meta  (conector "MCP - Meta", ads_get_ad_entities): raw/adsets.json, raw/demo.json, raw/ads.json
//         e, opcionalmente, raw/previews.json ({ "<nome do criativo>": { "url": "...", "thumb": "thumbs/x.jpg" } })
//   Google Ads (planilha preenchida pelo Google Ads Script, convertida por scripts/xlsx-to-json.py): raw/google.json
// Uso: UNTIL=AAAA-MM-DD node scripts/build-data.js raw
// Se uma das fontes não vier, o script mantém a parte dela do data.json anterior.
"use strict";
const fs = require("fs");
const path = require("path");
const CONFIG = require("./config.json");

const dir = process.argv[2] || "raw";
const has = (f) => fs.existsSync(path.join(dir, f));
const read = (f, fallback) => (has(f) ? JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) : fallback);
const prev = fs.existsSync("data.json") ? JSON.parse(fs.readFileSync("data.json", "utf8")) : null;

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const mv = (v) => { if (v == null) return 0; if (typeof v === "object") return "value" in v ? mv(v.value) : 0; const x = Number(v); return isFinite(x) ? x : 0; };
const r2 = (x) => Math.round(x * 100) / 100;
const r6 = (x) => Math.round(x * 1e6) / 1e6;
const slug = (s) => norm(s).replace(/^\d+\s*-\s*/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* ---------------- Meta ---------------- */
function buildMeta() {
  const adsetsRaw = read("adsets.json", null);
  if (!adsetsRaw) return null;
  const demoRaw = read("demo.json", []), adsRaw = read("ads.json", []), previewsNew = read("previews.json", {});
  const visitsOf = (r) => { const x = r && r.results; if (!x || String(x.indicator || "").indexOf("profile_visit") < 0) return 0; return Array.isArray(x.values) && x.values.length ? mv(x.values[0].value) : 0; };
  const cleanName = (s) => String(s || "(sem nome)").replace(/(\s*[—-]\s*C[óo]pia(\s*\d+)?)+\s*$/i, "").trim();
  const cities = CONFIG.meta.cities || [];
  function cityOf(adset, campaign) {
    for (const s of [norm(adset), norm(campaign)]) {
      const toks = s.split(/[^a-z0-9]+/);
      for (const c of cities) for (const k0 of c.keywords) {
        const k = norm(k0).trim();
        if ((k.includes(" ") || k.length > 3) ? s.includes(k) : toks.includes(k)) return c.key;
      }
    }
    return null;
  }
  const day = (r) => String(r.date_start).slice(0, 10);
  const hasData = (r) => mv(r.amount_spent) > 0 || mv(r.impressions) > 0 || mv(r.instagram_profile_follow_v2) > 0;
  const adsets = [], idx = {};
  function ref(id, name, campaign) {
    if (!(id in idx)) { idx[id] = adsets.length; adsets.push({ id, name, campaign: campaign || "", city: cityOf(name, campaign) }); }
    const a = adsets[idx[id]];
    if (campaign && !a.campaign) { a.campaign = campaign; a.city = cityOf(a.name, campaign); }
    return idx[id];
  }
  // [data, conjunto, investimento, impressões, cliques no link, visitas, seguidores]
  const daily = adsetsRaw.filter(hasData).map((r) => [day(r), ref(r.id, r.name, r.campaign_name), r2(mv(r.amount_spent)), mv(r.impressions), mv(r.link_click), visitsOf(r), mv(r.instagram_profile_follow_v2)]);
  // [data, conjunto, idade, gênero, investimento, impressões, cliques, seguidores]
  const demo = demoRaw.filter(hasData).map((r) => [day(r), ref(r.id, r.name), r.age, r.gender, r2(mv(r.amount_spent)), mv(r.impressions), mv(r.link_click), mv(r.instagram_profile_follow_v2)]);
  const creatives = {};
  // [data, conjunto, criativo, investimento, impressões, cliques, visitas, seguidores, plays]
  const ads = adsRaw.filter(hasData).map((r) => {
    const name = cleanName(r.name), key = norm(name);
    const c = creatives[key] || (creatives[key] = { name, top: 0, adId: "" });
    const sp = mv(r.amount_spent); if (sp >= c.top) { c.top = sp; c.adId = r.id; }
    const asId = Object.keys(idx).find((id) => adsets[idx[id]].name === r.adset_name);
    const ai = asId != null ? idx[asId] : ref("name:" + r.adset_name, r.adset_name, r.campaign_name);
    return [day(r), ai, key, r2(sp), mv(r.impressions), mv(r.link_click), visitsOf(r), mv(r.instagram_profile_follow_v2), mv(r.video_play_actions)];
  });
  const old = (prev && prev.meta && prev.meta.creatives) || {};
  Object.keys(creatives).forEach((k) => {
    const c = creatives[k], base = c.name.replace(/^\d+\s*-\s*/, "");
    const pv = previewsNew[c.name] || previewsNew[base] || {}, o = old[k] || {};
    const guess = "thumbs/" + slug(c.name) + ".jpg";
    creatives[k] = { name: c.name, adId: c.adId, preview: pv.url || o.preview || "", thumb: pv.thumb || o.thumb || (fs.existsSync(guess) ? guess : "") };
  });
  const semPraca = adsets.filter((a) => !a.city).map((a) => a.name);
  return { account: CONFIG.meta.account, cities: cities.map((c) => ({ key: c.key, label: c.label, uf: c.uf })), adsets, creatives, daily, demo, ads, _semPraca: semPraca };
}

/* ---------------- YouTube (Google Ads) ---------------- */
function isoDay(v) {
  if (typeof v === "number") { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5); return d.toISOString().slice(0, 10); }
  return String(v || "").slice(0, 10);
}
function sheetTime(v) {
  if (typeof v === "number") return new Date(Date.UTC(1899, 11, 30) + v * 864e5).toISOString().slice(0, 16).replace("T", " ");
  return String(v || "");
}
function buildYT() {
  const g = read("google.json", null);
  if (!g || !Array.isArray(g.dados) || !g.dados.length) return null;
  const campaigns = [], cidx = {};
  const camp = (id, name) => { id = String(id); if (!(id in cidx)) { cidx[id] = campaigns.length; campaigns.push({ id, name: name || id }); } return cidx[id]; };
  const q = (r) => [r6(mv(r.q25)), r6(mv(r.q50)), r6(mv(r.q75)), r6(mv(r.q100))];
  // [data, campanha, investimento, impressões, cliques, visualizações, engajamentos, q25, q50, q75, q100]
  const daily = g.dados.filter((r) => mv(r.impressoes) > 0).map((r) => [isoDay(r.data), camp(r.campanha_id, r.campanha), r2(mv(r.custo)), mv(r.impressoes), mv(r.cliques), mv(r.visualizacoes), mv(r.engajamentos)].concat(q(r)));
  const videos = {};
  let vdaily = [];
  if (Array.isArray(g.videos) && g.videos.length) {
    // [data, campanha, vídeo, investimento, impressões, cliques, visualizações, q25, q50, q75, q100]
    vdaily = g.videos.filter((r) => mv(r.impressoes) > 0 && r.video_id).map((r) => {
      const v = String(r.video_id);
      videos[v] = { title: r.video_titulo || videos[v]?.title || v, duration: mv(r.duracao_seg) || videos[v]?.duration || 0 };
      return [isoDay(r.data), camp(r.campanha_id, r.campanha), v, r2(mv(r.custo)), mv(r.impressoes), mv(r.cliques), mv(r.visualizacoes)].concat(q(r));
    });
  } else {
    // Sem a aba "videos" (script antigo): usa o vídeo indicado para cada campanha em scripts/config.json.
    const fb = CONFIG.youtube.videoPorCampanha || {};
    vdaily = daily.map((r) => {
      const c = campaigns[r[1]], v = fb[c.id] || fb[c.name] || CONFIG.youtube.videoPadrao.id;
      videos[v] = { title: CONFIG.youtube.videoPadrao.id === v ? CONFIG.youtube.videoPadrao.title : v, duration: 0 };
      return [r[0], r[1], v, r[2], r[3], r[4], r[5], r[7], r[8], r[9], r[10]];
    });
  }
  const seg = (rows) => (Array.isArray(rows) ? rows : []).filter((r) => mv(r.impressoes) > 0)
    // [data, segmento, investimento, impressões, cliques, visualizações, q100]
    .map((r) => [isoDay(r.data), String(r.segmento || "UNDETERMINED"), r2(mv(r.custo)), mv(r.impressoes), mv(r.cliques), mv(r.visualizacoes), r6(mv(r.q100))]);
  const upd = g.dados.map((r) => sheetTime(r.atualizado_em)).sort().pop() || "";
  const log = Array.isArray(g.log) ? g.log.filter((l) => String(l.ok) !== "sim").map((l) => l.parte + ": " + l.mensagem) : [];
  return { account: CONFIG.youtube.account, campaigns, videos, daily, vdaily, age: seg(g.idade), gender: seg(g.genero), sheetUpdatedAt: upd, _log: log, _hasVideoTab: Array.isArray(g.videos) };
}

const meta = buildMeta() || (prev && prev.meta) || null;
const yt = buildYT() || (prev && prev.yt) || null;
const days = [].concat(meta ? meta.daily.map((r) => r[0]) : [], yt ? yt.daily.map((r) => r[0]) : []).sort();
const notes = { semPraca: meta && meta._semPraca || [], googleLog: yt && yt._log || [], semAbaVideos: yt && yt._hasVideoTab === false };
if (meta) delete meta._semPraca;
if (yt) { delete yt._log; delete yt._hasVideoTab; }
const out = {
  updatedAt: new Date().toISOString(),
  firstDay: days[0] || null,
  lastDay: process.env.UNTIL || days[days.length - 1] || null,
  meta, yt
};
fs.writeFileSync("data.json", JSON.stringify(out));

const sum = (rows, i) => rows.reduce((t, r) => t + r[i], 0);
console.log(`data.json: período ${out.firstDay} a ${out.lastDay}`);
if (meta) console.log(`Meta: ${meta.daily.length} linhas/dia, ${meta.demo.length} de público, ${Object.keys(meta.creatives).length} criativo(s) · R$ ${sum(meta.daily, 2).toFixed(2)} · ${sum(meta.daily, 5)} visitas · ${sum(meta.daily, 6)} seguidores`);
else console.log("Meta: SEM DADOS");
if (yt) {
  const imp = sum(yt.daily, 3), vw = sum(yt.daily, 5), sp = sum(yt.daily, 2);
  const w = (k) => imp ? yt.daily.reduce((t, r) => t + r[k] * r[3], 0) / imp : 0;
  console.log(`YouTube: ${yt.daily.length} linhas/dia, ${Object.keys(yt.videos).length} vídeo(s), ${yt.age.length} de idade, ${yt.gender.length} de gênero · R$ ${sp.toFixed(2)} · ${vw} visualizações · CPV R$ ${(vw ? sp / vw : 0).toFixed(4)} · taxa ${(imp ? vw / imp * 100 : 0).toFixed(2)}% · até o fim ${(w(10) * 100).toFixed(2)}% · planilha de ${yt.sheetUpdatedAt}`);
} else console.log("YouTube: SEM DADOS");
if (notes.semAbaVideos) console.log("AVISO: a planilha não tem a aba \"videos\" (script do Google Ads ainda na versão 1). Usei o vídeo padrão de scripts/config.json.");
if (notes.googleLog.length) console.log("AVISO: partes do script do Google Ads falharam: " + notes.googleLog.join(" | "));
if (meta && meta.cities.length && notes.semPraca.length) console.log("Conjuntos sem praça (entram só na visão geral): " + notes.semPraca.join(" | "));
