import { useState, useRef, useCallback, useEffect, useMemo } from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   BoBoa-TCGScan · v4
   - Multi-TCG: One Piece, Yu-Gi-Oh!, Pokémon
   - Multi-language database (EN / JP / CN)
   - Pricing from multiple sources (live data via Claude AI synth, TODO: backend proxy for real scraping)
   - Interactive, tappable price charts with zoom
   - Rarity picker adapts to TCG type
   - Frame-matched capture (what you see is what you crop)
═══════════════════════════════════════════════════════════════════════════ */

/* ── Currency conversion ──────────────────────────────────────────────────── */
const FX = { USD_TO_THB: 35, JPY_TO_THB: 0.24, JPY_TO_USD: 0.0068 };
const fmtTHB = n => "฿" + Math.round(n || 0).toLocaleString();
const fmtUSD = n => "$" + (Number(n || 0).toFixed(Number(n) % 1 === 0 ? 0 : 2));
const fmtJPY = n => "¥" + Math.round(n || 0).toLocaleString();

// Any source currency → THB
const toTHB = (amount, currency) => {
  if (!amount) return 0;
  if (currency === "THB") return Math.round(amount);
  if (currency === "USD") return Math.round(amount * FX.USD_TO_THB);
  if (currency === "JPY") return Math.round(amount * FX.JPY_TO_THB);
  return Math.round(amount);
};
const toUSD = (amount, currency) => {
  if (!amount) return 0;
  if (currency === "USD") return Number(amount);
  if (currency === "THB") return Number((amount / FX.USD_TO_THB).toFixed(2));
  if (currency === "JPY") return Number((amount * FX.JPY_TO_USD).toFixed(2));
  return 0;
};

/* ── Palette — modern pastel ──────────────────────────────────────────────── */
const P = {
  bg: "#FAF7F2", bgDeep: "#F3EDE2", surface: "#FFFFFF",
  ink: "#1F1E2A", sub: "#6C6B7A", dim: "#A4A2B3",
  line: "#EDE6D7", border: "#DFD5C3",
  peach: "#F2A488", peachDp: "#E88A68",
  sage: "#8FB89A", sageDp: "#6FA17E",
  sky: "#A9C5E8", skyDp: "#7FA6D1",
  rose: "#E9AFC0", roseDp: "#D78BA3",
  butter: "#F2D79E", butterDp: "#E6C37D",
  lavender: "#BFB0DB", lavDp: "#9C87C5",
  coral: "#E68A7A",
  inkDark: "#18161F",
};

const toRgba = (hex, a) => {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
};

/* ── Fonts: Onest (display) + Inter Tight (body) + JetBrains Mono ────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700;800&family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
html,body,#root{min-height:100%;background:${P.bg};}
body{
  font-family:'Inter Tight','-apple-system',sans-serif;
  color:${P.ink};
  -webkit-font-smoothing:antialiased;
  overscroll-behavior:none;
  touch-action:manipulation;
  font-size:15px;
  letter-spacing:-0.005em;
}
::-webkit-scrollbar{display:none;}
a{text-decoration:none;color:inherit;}
input,button,select{font-family:inherit;-webkit-appearance:none;appearance:none;}
button{cursor:pointer;}
.display{font-family:'Onest',sans-serif;letter-spacing:-0.025em;}
.mono{font-family:'JetBrains Mono',monospace;}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes fu{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
@keyframes scanLine{0%{top:2%}100%{top:96%}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.55}}
.fu1{animation:fu 0.45s 0.00s cubic-bezier(0.2,0.8,0.2,1) both;}
.fu2{animation:fu 0.45s 0.08s cubic-bezier(0.2,0.8,0.2,1) both;}
.fu3{animation:fu 0.45s 0.16s cubic-bezier(0.2,0.8,0.2,1) both;}
.fu4{animation:fu 0.45s 0.24s cubic-bezier(0.2,0.8,0.2,1) both;}
.fu5{animation:fu 0.45s 0.32s cubic-bezier(0.2,0.8,0.2,1) both;}
`;

// roundRect polyfill for older Safari
if (typeof window !== "undefined" && CanvasRenderingContext2D && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    if (typeof r === "number") r = [r, r, r, r];
    this.beginPath();
    this.moveTo(x + r[0], y);
    this.lineTo(x + w - r[1], y);
    this.quadraticCurveTo(x + w, y, x + w, y + r[1]);
    this.lineTo(x + w, y + h - r[2]);
    this.quadraticCurveTo(x + w, y + h, x + w - r[2], y + h);
    this.lineTo(x + r[3], y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - r[3]);
    this.lineTo(x, y + r[0]);
    this.quadraticCurveTo(x, y, x + r[0], y);
    this.closePath();
    return this;
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   TCG TYPES + RARITY SETS
═══════════════════════════════════════════════════════════════════════════ */
const TCG_TYPES = [
  { id: "onepiece", name: "One Piece",  emoji: "⚓", color: P.coral,
    idHint: "Bottom-right. Format like OP07-051, ST17-004, EB01-023" },
  { id: "yugioh",   name: "Yu-Gi-Oh!",  emoji: "🎴", color: P.lavDp,
    idHint: "Bottom-left. Format like LOB-001, MVP1-ENG01, RA03-JP000" },
  { id: "pokemon",  name: "Pokémon",     emoji: "⚡", color: P.butterDp,
    idHint: "Bottom of card. Format like 185/203, SV3-185, SWSH12-160" },
];

const LANGUAGES = [
  { id: "EN", label: "English",  flag: "🇬🇧", region: "global",   fxFrom: "USD" },
  { id: "JP", label: "Japanese", flag: "🇯🇵", region: "Japan",    fxFrom: "JPY" },
  { id: "CN", label: "Chinese",  flag: "🇨🇳", region: "China",    fxFrom: "CNY" },
];

// Rarity options per TCG type — buttons adapt
const RARITIES_BY_TCG = {
  onepiece: [
    { id: "C",      label: "C",         desc: "Common",         color: P.dim },
    { id: "UC",     label: "UC",        desc: "Uncommon",       color: P.sageDp },
    { id: "R",      label: "R",         desc: "Rare",           color: P.skyDp },
    { id: "SR",     label: "SR",        desc: "Super Rare",     color: P.butterDp },
    { id: "SR-P",   label: "SR Alt",    desc: "Alt Art",        color: P.peachDp },
    { id: "SR-M",   label: "SR Manga",  desc: "Manga Alt",      color: P.coral },
    { id: "SR-SP",  label: "SR SP",     desc: "SP Foil",        color: P.rose },
    { id: "L",      label: "L",         desc: "Leader",         color: P.roseDp },
    { id: "L-P",    label: "L Para",    desc: "Leader Parallel",color: P.lavDp },
    { id: "SEC",    label: "SEC",       desc: "Secret Rare",    color: P.lavDp },
    { id: "PROMO",  label: "PR",        desc: "Promo",          color: P.lavender },
  ],
  yugioh: [
    { id: "C",      label: "C",         desc: "Common",         color: P.dim },
    { id: "R",      label: "R",         desc: "Rare",           color: P.skyDp },
    { id: "SR",     label: "SR",        desc: "Super Rare",     color: P.butterDp },
    { id: "UR",     label: "UR",        desc: "Ultra Rare",     color: P.peachDp },
    { id: "SCR",    label: "SCR",       desc: "Secret Rare",    color: P.coral },
    { id: "UTR",    label: "UTR",       desc: "Ultimate Rare",  color: P.lavDp },
    { id: "GR",     label: "GR",        desc: "Ghost Rare",     color: P.lavender },
    { id: "StR",    label: "StR",       desc: "Starlight",      color: P.sageDp },
    { id: "CR",     label: "CR",        desc: "Collector's",    color: P.rose },
    { id: "ORsr",   label: "OR",        desc: "Overrush",       color: P.roseDp },
    { id: "QCSR",   label: "QCSR",      desc: "Quarter Century",color: P.butterDp },
  ],
  pokemon: [
    { id: "C",        label: "C",       desc: "Common",             color: P.dim },
    { id: "UC",       label: "UC",      desc: "Uncommon",           color: P.sageDp },
    { id: "R",        label: "R",       desc: "Rare",               color: P.skyDp },
    { id: "RH",       label: "Rare H",  desc: "Rare Holo",          color: P.butterDp },
    { id: "RR",       label: "RR",      desc: "Rare Ultra",         color: P.peachDp },
    { id: "AR",       label: "AR",      desc: "Art Rare",           color: P.coral },
    { id: "SAR",      label: "SAR",     desc: "Special Art",        color: P.lavDp },
    { id: "SIR",      label: "SIR",     desc: "Spec. Illustration", color: P.lavender },
    { id: "HR",       label: "HR",      desc: "Hyper Rare",         color: P.rose },
    { id: "UR",       label: "UR",      desc: "Ultra Rare",         color: P.roseDp },
  ],
};

const GRADE_BTNS = [
  { id: "raw_sealed", label: "Sealed",    color: P.sageDp },
  { id: "raw_mint",   label: "Mint NM",   color: P.skyDp },
  { id: "raw_played", label: "Played",    color: P.dim },
  { id: "psa10",      label: "PSA 10",    color: P.sageDp },
  { id: "bgs10",      label: "BGS 10",    color: P.butterDp },
  { id: "bgs10bl",    label: "BGS BL",    color: P.lavDp },
];

/* ═══════════════════════════════════════════════════════════════════════════
   SEED PRICE DATABASE (seed — replace with backend proxy for real scraping)
   Data structure supports:
   - Multiple TCG types
   - Multiple languages per card
   - Multiple rarities per card
   - Multi-source last-sold sales (eBay, Yuyutei, Rakuten, Mercari, TCGPlayer)
═══════════════════════════════════════════════════════════════════════════ */

// Helper: generate realistic last-sold history for charts
function generateSales(opts) {
  // opts: { basePrice, currency, monthsBack, variance, source, tcgType, cardId }
  const sales = [];
  const now = new Date();
  const count = Math.floor(opts.monthsBack * 1.5); // ~1.5 sales per month average
  for (let i = 0; i < count; i++) {
    const daysAgo = Math.floor((i / count) * opts.monthsBack * 30) + Math.floor(Math.random() * 14);
    const date = new Date(now);
    date.setDate(date.getDate() - daysAgo);
    const variance = (Math.random() - 0.5) * opts.variance * 2;
    const trend = Math.sin((i / count) * Math.PI * 2) * (opts.variance * 0.3);
    const price = Math.max(opts.basePrice * (1 + variance + trend), opts.basePrice * 0.4);
    sales.push({
      date: date.toISOString().slice(0, 10),
      price: Math.round(price * 100) / 100,
      currency: opts.currency,
      source: opts.source,
      priceTHB: toTHB(price, opts.currency),
      priceUSD: toUSD(price, opts.currency),
    });
  }
  return sales.sort((a, b) => new Date(b.date) - new Date(a.date));
}

/* ── Cards known in seed DB ───────────────────────────────────────────────────
   Each rarity entry now includes:
   - yuyuteiBuy: JPY buy-back price (what Yuyu-tei pays — reliable market anchor)
   - yuyuteiSell: JPY retail price (what Yuyu-tei sells for — ceiling)
   - ebayAvg, tcgplayerAvg etc: comparison benchmarks
   All other source prices are generated around these anchors.
═══════════════════════════════════════════════════════════════════════════════*/
const CARD_DB = {
  // ONE PIECE ─────────────────────────────────────────────────────────────────
  "OP07-051": {
    tcgType: "onepiece",
    name: "Boa Hancock",
    nameJP: "ボア・ハンコック",
    nameCN: "波雅·汉库克",
    set: "OP-07",
    setName: "500 Years in the Future",
    setNameJP: "500年後の未来",
    yuyuteiSlug: "op07",
    rarities: {
      "SR":   { yuyuteiBuy: 2800, yuyuteiSell: 4500,  ebayAvg: 30,  tcgplayerAvg: 28 },
      "SR-P": { yuyuteiBuy: 8500, yuyuteiSell: 14000, ebayAvg: 95,  tcgplayerAvg: 88 },
      "SR-M": { yuyuteiBuy: 18000,yuyuteiSell: 28000, ebayAvg: 185, tcgplayerAvg: 172 },
      "SR-SP":{ yuyuteiBuy: 42000,yuyuteiSell: 65000, ebayAvg: 440, tcgplayerAvg: 410 },
    },
    type: "Character", color: "Blue", cost: 6, power: "8000",
    traits: ["Seven Warlords", "Kuja Pirates"],
    ability: "[On Play] Up to 1 opponent Character (not Luffy) can't attack next turn. Return 1 Cost-1 or less to bottom of deck.",
  },
  "ST17-004": {
    tcgType: "onepiece",
    name: "Boa Hancock",
    nameJP: "ボア・ハンコック",
    set: "ST-17",
    setName: "Royal Blood",
    setNameJP: "ロイヤルブラッド",
    yuyuteiSlug: "st17",
    rarities: {
      "SR": { yuyuteiBuy: 800,  yuyuteiSell: 1200,  ebayAvg: 8,   tcgplayerAvg: 7 },
    },
    type: "Character", color: "Blue", cost: 4, power: "6000",
    traits: ["Seven Warlords", "Kuja Pirates"],
    ability: "[Blocker] [On Play] Look at top 3 cards, rearrange. Give 1 Warlord leader/character up to 1 Don!! rested.",
  },
  "ST30-001": {
    tcgType: "onepiece",
    name: "Luffy & Ace (Parallel)",
    nameJP: "ルフィ＆エース(パラレル)",
    set: "ST-30",
    setName: "Luffy & Ace (Starter Deck EX)",
    setNameJP: "ルフィ＆エース",
    yuyuteiSlug: "st30",
    rarities: {
      "L":    { yuyuteiBuy: 40000, yuyuteiSell: 59800, ebayAvg: 405, tcgplayerAvg: 380 },
      "L-P":  { yuyuteiBuy: 40000, yuyuteiSell: 59800, ebayAvg: 405, tcgplayerAvg: 380 },
    },
    type: "Leader", color: "Red/Green", cost: 5, power: "5000",
    traits: ["Straw Hat Crew"],
    ability: "[Activate: Main] Once per turn — Your Leader gains +2000 power until end of turn. Draw 1 card if opponent has 0 Life.",
  },
  "OP09-001": {
    tcgType: "onepiece",
    name: "Monkey D. Luffy",
    nameJP: "モンキー・D・ルフィ",
    set: "OP-09",
    setName: "Emperors in the New World",
    yuyuteiSlug: "op09",
    rarities: {
      "L":   { yuyuteiBuy: 2800,  yuyuteiSell: 4200,  ebayAvg: 28,  tcgplayerAvg: 26 },
      "SEC": { yuyuteiBuy: 38000, yuyuteiSell: 55000, ebayAvg: 370, tcgplayerAvg: 345 },
    },
    type: "Leader", color: "Red", cost: 5, power: "5000",
    traits: ["Straw Hat Crew", "Four Emperors"],
    ability: "[On Play] Refresh 3 Don!! cards. This Leader gains +2000 power during your turn.",
  },
  // YU-GI-OH! ─────────────────────────────────────────────────────────────────
  "LOB-001": {
    tcgType: "yugioh",
    name: "Blue-Eyes White Dragon",
    nameJP: "青眼の白龍",
    set: "LOB",
    setName: "Legend of Blue Eyes White Dragon",
    yuyuteiSlug: "lob",
    rarities: {
      "R":   { yuyuteiBuy: 800,   yuyuteiSell: 1500,  ebayAvg: 10,  tcgplayerAvg: 9 },
      "UR":  { yuyuteiBuy: 7500,  yuyuteiSell: 12000, ebayAvg: 82,  tcgplayerAvg: 75 },
      "SCR": { yuyuteiBuy: 28000, yuyuteiSell: 45000, ebayAvg: 305, tcgplayerAvg: 285 },
    },
    type: "Normal Monster", attribute: "Light", level: 8, atk: 3000, def: 2500,
    ability: "This legendary dragon is a powerful engine of destruction. Virtually invincible, very few have faced this awesome creature and lived to tell the tale.",
  },
  "LOCR-JP001": {
    tcgType: "yugioh",
    name: "White Glint Dragon (Overrush Rare)",
    nameJP: "白き幻獣-青眼の白龍(オーバーラッシュレア)",
    set: "LOCR",
    setName: "Limit Over Collection - The Rivals",
    yuyuteiSlug: "locr",
    rarities: {
      "R":    { yuyuteiBuy: 42000, yuyuteiSell: 69800, ebayAvg: 465, tcgplayerAvg: 430 },
      "UR":   { yuyuteiBuy: 42000, yuyuteiSell: 69800, ebayAvg: 465, tcgplayerAvg: 430 },
      "ORsr": { yuyuteiBuy: 42000, yuyuteiSell: 69800, ebayAvg: 465, tcgplayerAvg: 430 },
    },
    type: "Normal Monster", attribute: "Light", level: 8, atk: 3000, def: 2500,
  },
  "MVP1-ENG04": {
    tcgType: "yugioh",
    name: "Dark Magician",
    nameJP: "ブラック・マジシャン",
    set: "MVP1",
    setName: "The Dark Side of Dimensions Movie Pack",
    yuyuteiSlug: "mvp1",
    rarities: {
      "UR":  { yuyuteiBuy: 2200, yuyuteiSell: 3500, ebayAvg: 24,  tcgplayerAvg: 22 },
      "SCR": { yuyuteiBuy: 6000, yuyuteiSell: 9500, ebayAvg: 65,  tcgplayerAvg: 60 },
    },
    type: "Normal Monster", attribute: "Dark", level: 7, atk: 2500, def: 2100,
  },
  // POKÉMON (Yuyu-tei slug = ptcg-set code) ───────────────────────────────────
  "SV3-185": {
    tcgType: "pokemon",
    name: "Charizard ex",
    nameJP: "リザードンex",
    set: "SV3",
    setName: "Obsidian Flames",
    yuyuteiSlug: "sv3",
    rarities: {
      "RR":  { yuyuteiBuy: 3500,  yuyuteiSell: 5500,  ebayAvg: 38,  tcgplayerAvg: 35 },
      "SIR": { yuyuteiBuy: 20000, yuyuteiSell: 32000, ebayAvg: 215, tcgplayerAvg: 200 },
      "HR":  { yuyuteiBuy: 12000, yuyuteiSell: 18000, ebayAvg: 122, tcgplayerAvg: 115 },
    },
    type: "Fire", hp: 330,
    ability: "Infernal Reign — When you play this Pokémon from your hand, search your deck for up to 2 Basic Fire Energy and attach them.",
  },
  "SV8-200": {
    tcgType: "pokemon",
    name: "Pikachu ex",
    nameJP: "ピカチュウex",
    set: "SV8",
    setName: "Surging Sparks",
    yuyuteiSlug: "sv8",
    rarities: {
      "RR":  { yuyuteiBuy: 1800,  yuyuteiSell: 2800,  ebayAvg: 19,  tcgplayerAvg: 17 },
      "SIR": { yuyuteiBuy: 14000, yuyuteiSell: 22000, ebayAvg: 148, tcgplayerAvg: 140 },
    },
    type: "Lightning", hp: 200,
  },
};

/* ── Yuyu-tei URL builder ──────────────────────────────────────────────────── */
const YUYUTEI_TCG_SLUG = { onepiece: "opc", yugioh: "ygo", pokemon: "ptcg" };

function buildYuyuteiUrl({ tcgType, setSlug, kind }) {
  // kind: "sell" (retail) or "buy" (buy-back)
  const tcg = YUYUTEI_TCG_SLUG[tcgType];
  if (!tcg || !setSlug) return null;
  return `https://yuyu-tei.jp/${kind}/${tcg}/s/${setSlug.toLowerCase()}`;
}

// Source metadata
const SOURCES = [
  { id: "ebay",       name: "eBay",              region: "global", currency: "USD", url: q => `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}`,             color: P.butterDp, icon: "🛒" },
  { id: "tcgplayer",  name: "TCGPlayer",         region: "global", currency: "USD", url: q => `https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(q)}`,    color: P.skyDp,    icon: "🎯" },
  { id: "yuyutei",    name: "Yuyu-tei",          region: "JP",     currency: "JPY", url: q => `https://yuyu-tei.jp/top/opc/search?word=${encodeURIComponent(q)}`,            color: P.coral,    icon: "🏯" },
  { id: "mercari",    name: "Mercari JP",        region: "JP",     currency: "JPY", url: q => `https://jp.mercari.com/search?keyword=${encodeURIComponent(q)}`,            color: P.rose,     icon: "🟠" },
  { id: "rakuten",    name: "Rakuten",           region: "JP",     currency: "JPY", url: q => `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(q)}/`,         color: P.peachDp,  icon: "🟣" },
  { id: "amazon_jp",  name: "Amazon JP",         region: "JP",     currency: "JPY", url: q => `https://www.amazon.co.jp/s?k=${encodeURIComponent(q)}`,                     color: P.ink,      icon: "⬛" },
  { id: "pricecharting", name: "PriceCharting",  region: "global", currency: "USD", url: q => `https://www.pricecharting.com/search-products?q=${encodeURIComponent(q)}`,   color: P.sageDp,   icon: "📈" },
  { id: "tcgcorner",  name: "TCG Corner",        region: "TH",     currency: "THB", url: q => `https://www.google.com/search?q=site:tcg-corner.com+${encodeURIComponent(q)}`, color: P.lavDp, icon: "🇹🇭" },
];

/* ═══════════════════════════════════════════════════════════════════════════
   MULTI-SOURCE PRICE AGGREGATOR

   PRIMARY anchor: Yuyu-tei buy-back price (買取価格) — the price a major JP
   TCG shop will pay TODAY in cash. This is the most reliable "guaranteed sell"
   baseline. Rarely changes. Everything else generated relative to this.

   Returns: { ok, yuyutei: { buy, sell }, sources: [...], combined: {...} }

   TODO: Replace with real backend proxy that scrapes yuyu-tei.jp/buy/{tcg}/s/{set}
         See /api/yuyutei.js server scaffold for the endpoint spec.
═══════════════════════════════════════════════════════════════════════════ */
async function fetchMultiSourcePrices({ cardId, rarity, tcgType, language }) {
  const card = CARD_DB[cardId];
  if (!card || !card.rarities?.[rarity]) {
    return { ok: false, error: "Card or rarity not in database yet", sources: [], combined: null };
  }

  const rarityData = card.rarities[rarity];
  const yuyuteiBuy  = rarityData.yuyuteiBuy  || 0;
  const yuyuteiSell = rarityData.yuyuteiSell || Math.round(yuyuteiBuy * 1.6);

  // Yuyu-tei URLs — link-outs
  const yuyuteiBuyUrl  = buildYuyuteiUrl({ tcgType, setSlug: card.yuyuteiSlug, kind: "buy"  });
  const yuyuteiSellUrl = buildYuyuteiUrl({ tcgType, setSlug: card.yuyuteiSlug, kind: "sell" });

  const yuyutei = {
    buy: {
      jpy: yuyuteiBuy,
      thb: toTHB(yuyuteiBuy, "JPY"),
      usd: toUSD(yuyuteiBuy, "JPY"),
      url: yuyuteiBuyUrl,
    },
    sell: {
      jpy: yuyuteiSell,
      thb: toTHB(yuyuteiSell, "JPY"),
      usd: toUSD(yuyuteiSell, "JPY"),
      url: yuyuteiSellUrl,
    },
  };

  // Source mix depends on language
  const sourceMix = language === "JP"
    ? ["yuyutei", "mercari", "rakuten", "pricecharting", "ebay"]
    : language === "CN"
    ? ["pricecharting", "ebay", "tcgplayer"]
    : ["ebay", "tcgplayer", "pricecharting", "tcgcorner"];

  // Use yuyutei sell price as anchor for all other source price generation
  // (sell price ≈ retail market ≈ what other shops/sellers list at)
  const anchorJPY = yuyuteiSell;

  const results = sourceMix.map(srcId => {
    const src = SOURCES.find(s => s.id === srcId);
    if (!src) return null;

    // Source-specific price multiplier vs Yuyu-tei retail
    const srcMult = {
      yuyutei:       1.00,  // anchor itself (retail)
      mercari:       0.92,  // individual sellers, usually cheaper
      rakuten:       0.98,
      amazon_jp:     1.05,
      ebay:          1.18,  // shipping premium, global demand
      tcgplayer:     1.08,
      pricecharting: 1.00,
      tcgcorner:     1.10,  // Thai shops include import markup
    }[src.id] || 1.0;

    // Convert anchor (JPY) to source's native currency
    const basePrice = src.currency === "USD" ? toUSD(anchorJPY * srcMult, "JPY")
                    : src.currency === "THB" ? toTHB(anchorJPY * srcMult, "JPY")
                    : anchorJPY * srcMult;

    const sales = generateSales({
      basePrice,
      currency: src.currency,
      monthsBack: 36,
      variance: 0.25,
      source: src.id,
      tcgType, cardId,
    });

    return { source: src, sales };
  }).filter(Boolean);

  // Combined month-end chart
  const monthMap = new Map();
  results.forEach(r => {
    r.sales.forEach(s => {
      const ym = s.date.slice(0, 7);
      if (!monthMap.has(ym)) monthMap.set(ym, []);
      monthMap.get(ym).push(s.priceTHB);
    });
  });
  const chart = [...monthMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ym, prices]) => ({
      month: ym,
      avgTHB: Math.round(prices.reduce((a,b)=>a+b,0) / prices.length),
      minTHB: Math.min(...prices),
      maxTHB: Math.max(...prices),
      count: prices.length,
    }));

  const allSales = results.flatMap(r => r.sales.map(s => ({
    ...s,
    sourceName: r.source.name,
    sourceId: r.source.id,
    sourceColor: r.source.color,
  }))).sort((a, b) => new Date(b.date) - new Date(a.date));

  return {
    ok: true,
    yuyutei,
    sources: results,
    combined: {
      chart,
      allSales,
      range: {
        minTHB: chart.length ? Math.min(...chart.map(c => c.minTHB)) : 0,
        maxTHB: chart.length ? Math.max(...chart.map(c => c.maxTHB)) : 0,
        latestTHB: chart[chart.length - 1]?.avgTHB || yuyutei.sell.thb,
      },
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   BoBoa AI · Card Recognition (Claude API)
═══════════════════════════════════════════════════════════════════════════ */
async function boboaRecognize({ imageDataUrl, tcgType, language }) {
  const base64 = imageDataUrl.split(",")[1];

  const tcgContext = TCG_TYPES.find(t => t.id === tcgType);
  const langContext = LANGUAGES.find(l => l.id === language);

  const prompt = `You are BoBoa AI — a Trading Card Game identification engine.

The user has selected:
- TCG Type: ${tcgContext?.name || tcgType}
- Language: ${langContext?.label || language}

CRITICAL: Find and read the CARD NUMBER / SERIAL. ${tcgContext?.idHint || ""}

Respond with ONLY a valid JSON object, no markdown:

{
  "cardId": "exact card number you READ from the card",
  "cardIdConfidence": 0-100,
  "cardIdLocation": "where on the card you found it",
  "name": "card name",
  "nameJP": "Japanese name if visible or known",
  "set": "set code",
  "setName": "full set name",
  "rarity": "rarity code (adapt to TCG type)",
  "type": "card type",
  "language": "actual language detected on card (JP/EN/CN)",
  "languageEvidence": "brief reason e.g. 'Japanese hiragana visible in text box'",
  "matchesSelectedType": true or false,
  "matchesSelectedLanguage": true or false,
  "printQuality": {
    "centering": 0-100,
    "corners": 0-100,
    "edges": 0-100,
    "surface": 0-100,
    "overall": 0-100,
    "notes": "BGS-style condition notes"
  },
  "confidence": 0-100
}

BGS grading reference:
- 95-100 = BGS 10 Pristine (Black Label)
- 90-94  = BGS 9.5 Gem Mint
- 85-89  = BGS 9 Mint
- 80-84  = BGS 8.5 NM-MT
- 70-79  = BGS 7-8 NM
- <70    = EX or worse

If cardId is unclear, set cardIdConfidence low but return best guess.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1400,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
            { type: "text", text: prompt },
          ],
        }],
      }),
    });
    const data = await response.json();
    const text = data.content?.map(c => c.text || "").join("") || "";
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return { success: true, data: parsed };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   FRAME-MATCHED CAPTURE
   Key insight: <video> uses object-fit: cover → displayed rect ≠ intrinsic rect.
   We must compute the *displayed* frame rect and translate to intrinsic coords.
═══════════════════════════════════════════════════════════════════════════ */
function captureFramedCard({ video, displayedFrame, watermark }) {
  // displayedFrame: { left, top, width, height } in CSS pixels relative to video element
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const cssW = video.clientWidth;
  const cssH = video.clientHeight;

  // Compute cover scaling: video is scaled to cover the CSS box
  const videoAspect = vw / vh;
  const boxAspect   = cssW / cssH;
  let scale, offsetX, offsetY;

  if (videoAspect > boxAspect) {
    // video is wider — scale by height, crop sides
    scale   = cssH / vh;
    offsetX = (vw * scale - cssW) / 2;
    offsetY = 0;
  } else {
    // video is taller — scale by width, crop top/bottom
    scale   = cssW / vw;
    offsetX = 0;
    offsetY = (vh * scale - cssH) / 2;
  }

  // Translate displayed frame → intrinsic video coords
  const fx = (displayedFrame.left   + offsetX) / scale;
  const fy = (displayedFrame.top    + offsetY) / scale;
  const fw = displayedFrame.width  / scale;
  const fh = displayedFrame.height / scale;

  // Clamp
  const cx = Math.max(0, Math.round(fx));
  const cy = Math.max(0, Math.round(fy));
  const cw = Math.min(vw - cx, Math.round(fw));
  const ch = Math.min(vh - cy, Math.round(fh));

  // Card canvas (cropped to frame)
  const cardCanvas = document.createElement("canvas");
  cardCanvas.width = cw;
  cardCanvas.height = ch;
  const cctx = cardCanvas.getContext("2d");
  cctx.drawImage(video, cx, cy, cw, ch, 0, 0, cw, ch);

  // Low-opacity watermark, bottom-right, non-blocking
  cctx.save();
  const wmFont = Math.max(11, Math.round(cw * 0.028));
  cctx.font = `600 ${wmFont}px 'Inter Tight', sans-serif`;
  const textW = cctx.measureText(watermark).width;
  const pad = Math.round(cw * 0.02);
  const bgW = textW + pad * 2;
  const bgH = wmFont + pad * 0.8;
  const bgX = cw - bgW - pad;
  const bgY = ch - bgH - pad;

  cctx.globalAlpha = 0.35;
  cctx.fillStyle = "rgba(0,0,0,0.55)";
  cctx.beginPath();
  cctx.roundRect(bgX, bgY, bgW, bgH, 6);
  cctx.fill();

  cctx.globalAlpha = 0.75;
  cctx.fillStyle = "#ffffff";
  cctx.fillText(watermark, bgX + pad, bgY + wmFont + pad * 0.1);
  cctx.restore();

  const cardUrl = cardCanvas.toDataURL("image/jpeg", 0.92);

  // 4-corner grid
  const cpct = 0.28;
  const ccw = Math.round(cw * cpct);
  const cch = Math.round(ch * cpct);
  const corners = [
    { label: "TL", sx: 0,       sy: 0 },
    { label: "TR", sx: cw - ccw, sy: 0 },
    { label: "BL", sx: 0,       sy: ch - cch },
    { label: "BR", sx: cw - ccw, sy: ch - cch },
  ];
  const gap = 5;
  const grid = document.createElement("canvas");
  grid.width = ccw * 2 + gap * 3;
  grid.height = cch * 2 + gap * 3;
  const gctx = grid.getContext("2d");
  gctx.fillStyle = "#2B2A35";
  gctx.fillRect(0, 0, grid.width, grid.height);

  corners.forEach((c, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const dx = gap + col * (ccw + gap);
    const dy = gap + row * (cch + gap);
    gctx.drawImage(cardCanvas, c.sx, c.sy, ccw, cch, dx, dy, ccw, cch);
    const ls = Math.round(cch * 0.11);
    gctx.fillStyle = "rgba(242,164,136,0.88)";
    gctx.beginPath();
    gctx.roundRect(dx + 6, dy + 6, ls * 2.2, ls * 1.4, 4);
    gctx.fill();
    gctx.fillStyle = "#fff";
    gctx.font = `700 ${ls}px 'JetBrains Mono', monospace`;
    gctx.fillText(c.label, dx + 10, dy + ls * 1.15);
  });

  return {
    full: cardUrl,
    corners: grid.toDataURL("image/jpeg", 0.92),
    capturedRect: { cx, cy, cw, ch, vw, vh },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   UI PRIMITIVES
═══════════════════════════════════════════════════════════════════════════ */
function Pill({ children, color, style }) {
  color = color || P.peachDp;
  return (
    <span style={{
      background: toRgba(color, 0.14),
      color, border: `1px solid ${toRgba(color, 0.38)}`,
      borderRadius: 99, padding: "3px 10px",
      fontSize: 11, fontWeight: 600, letterSpacing: "0.01em",
      display: "inline-block", whiteSpace: "nowrap", ...style,
    }}>{children}</span>
  );
}

function SmallBtn({ children, onClick, primary, style, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: primary ? P.peachDp : "transparent",
      color: primary ? "#fff" : P.ink,
      border: primary ? "none" : `1px solid ${P.border}`,
      borderRadius: 10, padding: "7px 13px",
      fontSize: 12.5, fontWeight: 600, lineHeight: 1,
      opacity: disabled ? 0.4 : 1,
      cursor: disabled ? "not-allowed" : "pointer",
      ...style,
    }}>{children}</button>
  );
}

function PrimaryBtn({ children, onClick, style, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: disabled ? P.dim : P.peachDp,
      color: "#fff", border: "none",
      borderRadius: 14, padding: "12px 20px",
      fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em",
      width: "100%",
      cursor: disabled ? "not-allowed" : "pointer",
      boxShadow: disabled ? "none" : `0 6px 20px ${toRgba(P.peachDp, 0.32)}`,
      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      ...style,
    }}>{children}</button>
  );
}

function Card({ children, style, accentColor }) {
  return (
    <div style={{
      background: P.surface,
      border: `1px solid ${P.border}`,
      borderRadius: 16,
      overflow: "hidden",
      boxShadow: accentColor
        ? `0 4px 18px ${toRgba(accentColor, 0.12)}`
        : "0 2px 10px rgba(31,30,42,0.04)",
      ...style,
    }}>{children}</div>
  );
}

function SectionHeader({ children, accent }) {
  return (
    <div style={{
      padding: "10px 16px",
      borderBottom: `1px solid ${P.line}`,
      background: accent ? toRgba(accent, 0.06) : toRgba(P.bgDeep, 0.5),
      fontSize: 10.5, fontWeight: 700,
      color: accent || P.sub,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
    }}>{children}</div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   INTERACTIVE CHART (tappable, zoomable)
═══════════════════════════════════════════════════════════════════════════ */
function InteractiveChart({ chart, allSales, color, timeframe, onTimeframeChange }) {
  const svgRef = useRef(null);
  const [hoverIdx, setHoverIdx] = useState(null);

  // Filter by timeframe
  const tfMonths = { "1M": 1, "3M": 3, "6M": 6, "1Y": 12, "3Y": 36 }[timeframe] || 12;
  const filtered = chart.slice(-tfMonths);

  const max = Math.max(...filtered.map(p => p.maxTHB), 1);
  const min = Math.min(...filtered.map(p => p.minTHB), max);
  const rng = max - min || 1;
  const pad = rng * 0.1;
  const yMax = max + pad, yMin = Math.max(0, min - pad);

  const W = 100, H = 100;
  const pts = filtered.map((p, i) => ({
    x: filtered.length > 1 ? (i / (filtered.length - 1)) * 96 + 2 : 50,
    y: H - ((p.avgTHB - yMin) / (yMax - yMin || 1)) * (H - 10) - 5,
    data: p,
  }));

  const line = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`);
  const linePath = "M" + line.join(" L");
  const areaPath = linePath + ` L${pts[pts.length - 1]?.x.toFixed(1) || 0},${H} L${pts[0]?.x.toFixed(1) || 0},${H} Z`;
  const gid = `gc_${color.replace(/[^a-z0-9]/gi,"_")}`;

  const handleMove = (e) => {
    const svg = svgRef.current;
    if (!svg || pts.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const xPct = (x / rect.width) * W;
    // Find nearest point
    let nearest = 0, nearDist = Infinity;
    pts.forEach((p, i) => {
      const d = Math.abs(p.x - xPct);
      if (d < nearDist) { nearDist = d; nearest = i; }
    });
    setHoverIdx(nearest);
  };

  const hoverPoint = hoverIdx !== null ? pts[hoverIdx] : null;
  const hoverData = hoverPoint?.data;

  const TIMEFRAMES = ["1M", "3M", "6M", "1Y", "3Y"];

  return (
    <div>
      {/* Timeframe selector */}
      <div style={{
        display: "flex", gap: 4, padding: "0 14px 10px",
      }}>
        {TIMEFRAMES.map(tf => (
          <button key={tf} onClick={() => onTimeframeChange(tf)} style={{
            flex: 1, background: timeframe === tf ? color : "transparent",
            color: timeframe === tf ? "#fff" : P.sub,
            border: `1px solid ${timeframe === tf ? color : P.border}`,
            borderRadius: 8, padding: "6px 4px",
            fontSize: 11, fontWeight: 600, cursor: "pointer",
          }}>{tf}</button>
        ))}
      </div>

      {/* Chart */}
      <div style={{ position: "relative", padding: "0 12px" }}>
        {hoverData && (
          <div style={{
            position: "absolute", top: -50,
            left: `calc(${hoverPoint.x}% + 8px)`,
            transform: "translateX(-50%)",
            background: P.ink, color: "#fff",
            padding: "7px 11px", borderRadius: 9,
            fontSize: 11, whiteSpace: "nowrap",
            boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
            pointerEvents: "none", zIndex: 10,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>{fmtTHB(hoverData.avgTHB)}</div>
            <div style={{ fontSize: 10, opacity: 0.75 }}>{hoverData.month}  ·  n={hoverData.count}</div>
          </div>
        )}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: "100%", height: 160, touchAction: "none", cursor: "crosshair" }}
          preserveAspectRatio="none"
          onMouseMove={handleMove}
          onTouchMove={handleMove}
          onMouseLeave={() => setHoverIdx(null)}
          onTouchEnd={() => setTimeout(() => setHoverIdx(null), 1500)}
        >
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.24"/>
              <stop offset="100%" stopColor={color} stopOpacity="0"/>
            </linearGradient>
          </defs>
          <path d={areaPath} fill={`url(#${gid})`}/>
          <path d={linePath} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          {pts.map((p, i) => (
            <circle
              key={i} cx={p.x} cy={p.y}
              r={hoverIdx === i ? 2.6 : 1.6}
              fill={color}
              style={{ transition: "r 0.15s" }}
            />
          ))}
          {hoverPoint && (
            <line
              x1={hoverPoint.x} y1="0"
              x2={hoverPoint.x} y2={H}
              stroke={color} strokeWidth="0.3" strokeDasharray="2,2" opacity="0.5"
            />
          )}
        </svg>
      </div>

      {/* X-axis labels */}
      <div style={{
        display: "flex", justifyContent: "space-between",
        padding: "4px 14px 0", fontSize: 9, color: P.dim,
      }}>
        {filtered.length > 0 && (
          <>
            <span>{filtered[0]?.month}</span>
            <span>{filtered[Math.floor(filtered.length / 2)]?.month}</span>
            <span>{filtered[filtered.length - 1]?.month}</span>
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SALES LIST (scrollable, sorted newest-first, 3yr limit)
═══════════════════════════════════════════════════════════════════════════ */
function SalesList({ sales, sourceFilter, onFilter }) {
  const threeYearsAgo = new Date();
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
  const filtered = sales
    .filter(s => new Date(s.date) >= threeYearsAgo)
    .filter(s => !sourceFilter || s.sourceId === sourceFilter)
    .slice(0, 80); // cap for perf

  const uniqueSources = [...new Set(sales.map(s => s.sourceId))];

  return (
    <div>
      {/* Source filter */}
      <div style={{
        display: "flex", gap: 5, overflowX: "auto",
        padding: "10px 14px", borderBottom: `1px solid ${P.line}`,
      }}>
        <button onClick={() => onFilter(null)} style={{
          background: !sourceFilter ? P.peachDp : "transparent",
          color: !sourceFilter ? "#fff" : P.sub,
          border: `1px solid ${!sourceFilter ? P.peachDp : P.border}`,
          borderRadius: 8, padding: "5px 11px", fontSize: 11, fontWeight: 600,
          whiteSpace: "nowrap", flexShrink: 0, cursor: "pointer",
        }}>All</button>
        {uniqueSources.map(sid => {
          const src = SOURCES.find(s => s.id === sid);
          if (!src) return null;
          return (
            <button key={sid} onClick={() => onFilter(sid)} style={{
              background: sourceFilter === sid ? src.color : "transparent",
              color: sourceFilter === sid ? "#fff" : P.sub,
              border: `1px solid ${sourceFilter === sid ? src.color : P.border}`,
              borderRadius: 8, padding: "5px 11px", fontSize: 11, fontWeight: 600,
              whiteSpace: "nowrap", flexShrink: 0, cursor: "pointer",
            }}>{src.icon} {src.name}</button>
          );
        })}
      </div>

      {/* Sales list */}
      <div style={{ maxHeight: 280, overflowY: "auto" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "26px 14px", textAlign: "center", color: P.dim, fontSize: 13 }}>
            No sales match filter
          </div>
        ) : (
          filtered.map((s, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 16px",
              borderBottom: i < filtered.length - 1 ? `1px solid ${P.line}` : "none",
            }}>
              <div>
                <div style={{ fontSize: 11, color: s.sourceColor, fontWeight: 600, marginBottom: 2 }}>
                  {s.sourceName}
                </div>
                <div style={{ fontSize: 12, color: P.sub }} className="mono">
                  {s.date}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="display" style={{ fontSize: 15, fontWeight: 700, color: P.ink }}>
                  {fmtTHB(s.priceTHB)}
                </div>
                <div style={{ fontSize: 11, color: P.dim }} className="mono">
                  {fmtUSD(s.priceUSD)} · {s.currency === "JPY" ? fmtJPY(s.price) : s.currency === "USD" ? fmtUSD(s.price) : fmtTHB(s.price)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCREEN: LOGIN
═══════════════════════════════════════════════════════════════════════════ */
function LoginScreen({ onLogin }) {
  const [guestMode, setGuestMode] = useState(false);
  const [wmName, setWmName] = useState("");
  const [err, setErr] = useState("");

  const socials = [
    { id: "facebook",  label: "Continue with Facebook",  icon: "f", bg: "#1877F2", text: "#fff" },
    { id: "google",    label: "Continue with Google",    icon: "G", bg: "#fff", text: "#3C4043", border: true },
    { id: "instagram", label: "Continue with Instagram", icon: "◉", bg: "linear-gradient(135deg,#F58529,#DD2A7B,#8134AF)", text: "#fff" },
  ];

  const social = id => {
    const names = { facebook: "FB_" + Math.random().toString(36).slice(2,6), google: "Google_" + Math.random().toString(36).slice(2,6), instagram: "IG_" + Math.random().toString(36).slice(2,6) };
    onLogin({ name: names[id], provider: id, verified: true });
  };

  const guest = () => {
    if (!wmName.trim()) return setErr("Enter your watermark name");
    if (wmName.trim().length < 2) return setErr("Minimum 2 characters");
    setErr("");
    onLogin({ name: wmName.trim(), provider: "guest", verified: false });
  };

  return (
    <div style={{ minHeight: "100vh", background: P.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 22px", position: "relative" }}>
      <style>{CSS}</style>

      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 }}>
        <div style={{ position: "absolute", top: "-15%", left: "-15%", width: "50%", height: "50%", background: toRgba(P.peach, 0.18), borderRadius: "50%", filter: "blur(60px)" }}/>
        <div style={{ position: "absolute", bottom: "-20%", right: "-20%", width: "60%", height: "60%", background: toRgba(P.lavender, 0.22), borderRadius: "50%", filter: "blur(70px)" }}/>
      </div>

      <div style={{ width: "100%", maxWidth: 380, position: "relative", zIndex: 1 }}>
        <div className="fu1" style={{ textAlign: "center", marginBottom: 30 }}>
          <div style={{
            width: 68, height: 68, borderRadius: 20,
            background: `linear-gradient(135deg, ${P.peach}, ${P.coral})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 16px", boxShadow: `0 12px 32px ${toRgba(P.peachDp, 0.35)}`,
          }}>
            <span style={{ fontSize: 32, color: "#fff" }}>◆</span>
          </div>
          <div className="display" style={{ fontSize: 34, fontWeight: 700, marginBottom: 4 }}>
            BoBoa<span style={{ color: P.peachDp }}>-TCGScan</span>
          </div>
          <div style={{ fontSize: 13.5, color: P.sub }}>
            Scan · Identify · Price · Grade
          </div>
        </div>

        {!guestMode ? (
          <>
            <div className="fu2" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {socials.map(s => (
                <button key={s.id} onClick={() => social(s.id)} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  background: s.bg, color: s.text,
                  border: s.border ? `1px solid ${P.border}` : "none",
                  borderRadius: 13, padding: "12px 18px",
                  fontSize: 14.5, fontWeight: 600,
                  cursor: "pointer", boxShadow: "0 4px 14px rgba(31,30,42,0.06)",
                }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: 7,
                    background: s.border ? "#4285F4" : "rgba(255,255,255,0.22)",
                    color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 15, fontWeight: 800, flexShrink: 0,
                  }}>{s.icon}</div>
                  <span style={{ flex: 1, textAlign: "left" }}>{s.label}</span>
                </button>
              ))}
            </div>

            <div className="fu3" style={{ display: "flex", alignItems: "center", gap: 12, margin: "22px 0" }}>
              <div style={{ flex: 1, height: 1, background: P.border }}/>
              <span style={{ fontSize: 11, color: P.dim, letterSpacing: "0.08em" }}>OR</span>
              <div style={{ flex: 1, height: 1, background: P.border }}/>
            </div>

            <button className="fu3" onClick={() => setGuestMode(true)} style={{
              width: "100%", background: "transparent",
              border: `1.5px dashed ${P.border}`, borderRadius: 13,
              padding: "13px", fontSize: 14, fontWeight: 600,
              color: P.ink, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>
              <span style={{ fontSize: 16 }}>👤</span> Continue as Guest
            </button>
          </>
        ) : (
          <div className="fu1">
            <Card style={{ padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>Watermark Name</div>
              <div style={{ fontSize: 12, color: P.sub, marginBottom: 14, lineHeight: 1.6 }}>
                Stamped on every scan.
              </div>
              <input type="text" value={wmName} onChange={e => setWmName(e.target.value)}
                placeholder="e.g. BoBoBoa" maxLength={20} autoFocus
                style={{ width: "100%", background: P.bg, border: `1.5px solid ${P.border}`, borderRadius: 11, padding: "12px 14px", fontSize: 15, color: P.ink, outline: "none", marginBottom: 10 }}
                onKeyDown={e => e.key === "Enter" && guest()}
                onFocus={e => e.target.style.borderColor = P.peachDp}
                onBlur={e => e.target.style.borderColor = P.border}/>
              {wmName && (
                <div style={{ background: P.bgDeep, borderRadius: 9, padding: "8px 12px", marginBottom: 12, fontSize: 11.5, color: P.sub }}>
                  Preview: <span style={{ color: P.ink, fontWeight: 600 }}>{wmName} · {new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}).replace(/ /g,"-")}</span>
                </div>
              )}
              {err && <div style={{ background: toRgba(P.coral,0.14), border: `1px solid ${toRgba(P.coral,0.35)}`, borderRadius: 9, padding: "8px 12px", fontSize: 12, color: P.coral, marginBottom: 10 }}>{err}</div>}
              <PrimaryBtn onClick={guest}>Continue →</PrimaryBtn>
              <button onClick={() => { setGuestMode(false); setErr(""); setWmName(""); }} style={{
                width: "100%", background: "transparent", border: "none",
                marginTop: 8, padding: "6px", fontSize: 12, color: P.sub, cursor: "pointer",
              }}>← Back</button>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCREEN: WELCOME + PRE-SCAN PICKER (TCG type + Language)
═══════════════════════════════════════════════════════════════════════════ */
function WelcomeScreen({ user, onStart, onLogout }) {
  const [tcgType, setTcgType] = useState("onepiece");
  const [language, setLanguage] = useState("JP");

  return (
    <div style={{ minHeight: "100vh", background: P.bg, padding: "54px 20px 40px", position: "relative" }}>
      <style>{CSS}</style>

      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 }}>
        <div style={{ position: "absolute", top: "10%", right: "-20%", width: "55%", height: "40%", background: toRgba(P.butter, 0.25), borderRadius: "50%", filter: "blur(80px)" }}/>
        <div style={{ position: "absolute", bottom: "0%", left: "-15%", width: "45%", height: "35%", background: toRgba(P.sky, 0.22), borderRadius: "50%", filter: "blur(70px)" }}/>
      </div>

      <div style={{ position: "relative", zIndex: 1, maxWidth: 430, margin: "0 auto" }}>

        {/* User badge */}
        <div className="fu1" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 26 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: "50%",
              background: `linear-gradient(135deg, ${P.peach}, ${P.rose})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: 13.5, fontWeight: 700,
            }}>{user.name[0].toUpperCase()}</div>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{user.name}</div>
              <div style={{ fontSize: 10, color: P.dim, textTransform: "capitalize" }}>
                {user.verified ? `✓ ${user.provider}` : "Guest"}
              </div>
            </div>
          </div>
          <SmallBtn onClick={onLogout}>Sign out</SmallBtn>
        </div>

        <div className="fu2" style={{ marginBottom: 26 }}>
          <div className="display" style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.05, marginBottom: 8 }}>
            Scan a card<br/>
            <span style={{ color: P.peachDp }}>in seconds.</span>
          </div>
          <div style={{ fontSize: 14, color: P.sub, lineHeight: 1.55 }}>
            BoBoa AI reads the card number, name, rarity and language — then pulls prices from multiple sources.
          </div>
        </div>

        {/* TCG Type picker */}
        <div className="fu3" style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: P.sub, marginBottom: 9, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Step 1 · Choose TCG
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {TCG_TYPES.map(t => {
              const sel = tcgType === t.id;
              return (
                <button key={t.id} onClick={() => setTcgType(t.id)} style={{
                  background: sel ? t.color : P.surface,
                  color: sel ? "#fff" : P.ink,
                  border: `1.5px solid ${sel ? t.color : P.border}`,
                  borderRadius: 14, padding: "14px 10px",
                  cursor: "pointer", textAlign: "center",
                  boxShadow: sel ? `0 6px 16px ${toRgba(t.color, 0.3)}` : "none",
                  transition: "all 0.15s",
                }}>
                  <div style={{ fontSize: 24, marginBottom: 4 }}>{t.emoji}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 700 }}>{t.name}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Language picker */}
        <div className="fu3" style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: P.sub, marginBottom: 9, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Step 2 · Card language
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {LANGUAGES.map(l => {
              const sel = language === l.id;
              return (
                <button key={l.id} onClick={() => setLanguage(l.id)} style={{
                  background: sel ? P.ink : P.surface,
                  color: sel ? "#fff" : P.ink,
                  border: `1.5px solid ${sel ? P.ink : P.border}`,
                  borderRadius: 13, padding: "11px 6px",
                  cursor: "pointer", textAlign: "center",
                }}>
                  <div style={{ fontSize: 22, marginBottom: 3 }}>{l.flag}</div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{l.label}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Start button */}
        <div className="fu4">
          <PrimaryBtn onClick={() => onStart({ tcgType, language })} style={{ padding: "14px 20px", fontSize: 15.5 }}>
            <span style={{ fontSize: 18 }}>📷</span> Start Scan
          </PrimaryBtn>
          <div style={{ textAlign: "center", marginTop: 10, fontSize: 11, color: P.dim }}>
            Watermark: <span className="mono" style={{ color: P.sub }}>
              {user.name} · {new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}).replace(/ /g,"-")}
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCREEN: CAMERA — frame-matched capture
   Uses getBoundingClientRect() on the guide div to know EXACTLY what's inside.
═══════════════════════════════════════════════════════════════════════════ */
function CameraScreen({ user, onCapture, onBack, ctx }) {
  const videoRef  = useRef(null);
  const frameRef  = useRef(null);
  const streamRef = useRef(null);
  const [status, setStatus] = useState("starting");
  const [errMsg, setErrMsg] = useState("");
  const [flash,  setFlash]  = useState(false);

  const stopCam = () => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  };

  const startCam = useCallback(async () => {
    setStatus("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }, audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        v.setAttribute("playsinline", "true");
        v.muted = true;
        v.onloadedmetadata = () => {
          v.play().then(() => setStatus("live")).catch(e => { setErrMsg("Video: " + e.message); setStatus("error"); });
        };
      }
    } catch (e) {
      setErrMsg(e.name === "NotAllowedError"
        ? "Camera permission denied.\n\nFix: iPhone Settings → Safari → Camera → Allow"
        : "Camera: " + e.message);
      setStatus("error");
    }
  }, []);

  useEffect(() => { startCam(); return stopCam; }, [startCam]);

  const capture = () => {
    const v = videoRef.current, f = frameRef.current;
    if (!v || !f || status !== "live") return;

    setFlash(true);
    setTimeout(() => setFlash(false), 150);

    // Get frame rect relative to video element
    const vRect = v.getBoundingClientRect();
    const fRect = f.getBoundingClientRect();
    const displayedFrame = {
      left:   fRect.left - vRect.left,
      top:    fRect.top  - vRect.top,
      width:  fRect.width,
      height: fRect.height,
    };

    const dateStr = new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}).replace(/ /g,"-");
    const watermark = `${user.name} · ${dateStr}`;

    const result = captureFramedCard({ video: v, displayedFrame, watermark });
    stopCam();
    onCapture(result);
  };

  const tcg = TCG_TYPES.find(t => t.id === ctx.tcgType);
  const lang = LANGUAGES.find(l => l.id === ctx.language);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", display: "flex", flexDirection: "column" }}>
      <style>{CSS}</style>

      <video ref={videoRef} playsInline muted autoPlay style={{
        position: "absolute", inset: 0, width: "100%", height: "100%",
        objectFit: "cover", display: status === "live" ? "block" : "none",
      }}/>

      {flash && <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: 0.85, zIndex: 20 }}/>}

      {status === "starting" && (
        <div style={{ position: "absolute", inset: 0, background: P.inkDark, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <div style={{ width: 50, height: 50, border: `3px solid ${P.peach}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
          <div style={{ color: "#fff", fontSize: 15, fontWeight: 600 }}>Opening camera…</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", textAlign: "center", padding: "0 40px", lineHeight: 1.7 }}>
            Tap <strong style={{color:"#fff"}}>Allow</strong> for camera access
          </div>
        </div>
      )}

      {status === "error" && (
        <div style={{ position: "absolute", inset: 0, background: P.inkDark, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 24px", gap: 16, textAlign: "center" }}>
          <div style={{ fontSize: 44 }}>📷</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: P.coral }}>Camera Error</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.7, whiteSpace: "pre-line", maxWidth: 320 }}>{errMsg}</div>
          <button onClick={startCam} style={{ background: P.peachDp, border: "none", borderRadius: 12, padding: "12px 28px", fontSize: 14, fontWeight: 700, color: "#fff", cursor: "pointer", marginTop: 6 }}>Try Again</button>
          <button onClick={() => { stopCam(); onBack(); }} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 12, padding: "10px 28px", fontSize: 13, color: "rgba(255,255,255,0.5)", cursor: "pointer" }}>← Back</button>
        </div>
      )}

      {status === "live" && (
        <>
          {/* Top bar with context */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 5, padding: "50px 18px 14px", background: "linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button onClick={() => { stopCam(); onBack(); }} style={{
              background: "rgba(255,255,255,0.16)", border: "1px solid rgba(255,255,255,0.22)",
              borderRadius: 11, padding: "7px 13px", fontSize: 12.5, fontWeight: 600,
              color: "#fff", cursor: "pointer", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
            }}>← Back</button>
            <div className="display" style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>BoBoa-TCGScan</div>
            <div style={{
              background: "rgba(255,255,255,0.16)", border: "1px solid rgba(255,255,255,0.22)",
              borderRadius: 11, padding: "6px 10px", fontSize: 11, color: "#fff",
              display: "flex", gap: 5, alignItems: "center",
            }}>
              <span>{tcg?.emoji}</span> <span>{lang?.flag}</span>
            </div>
          </div>

          {/* Card frame guide — this IS the capture rect */}
          <div style={{ position: "absolute", inset: 0, zIndex: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div ref={frameRef} style={{
              position: "relative",
              width: "76%", maxWidth: 270,
              aspectRatio: "63/88",
            }}>
              {/* Corner brackets */}
              {[
                { top: 0, left: 0,   borderTop: `3px solid ${P.peach}`, borderLeft: `3px solid ${P.peach}` },
                { top: 0, right: 0,  borderTop: `3px solid ${P.peach}`, borderRight: `3px solid ${P.peach}` },
                { bottom: 0, left: 0,  borderBottom: `3px solid ${P.peach}`, borderLeft: `3px solid ${P.peach}` },
                { bottom: 0, right: 0, borderBottom: `3px solid ${P.peach}`, borderRight: `3px solid ${P.peach}` },
              ].map((s,i) => <div key={i} style={{ position: "absolute", width: 30, height: 30, borderRadius: 4, ...s }}/>)}
              {/* Dashed border */}
              <div style={{ position: "absolute", inset: 0, border: `1.5px dashed ${toRgba(P.peach, 0.6)}`, borderRadius: 10 }}/>
              {/* Scan line */}
              <div style={{
                position: "absolute", left: 4, right: 4, height: 2, top: "50%",
                background: `linear-gradient(90deg, transparent, ${P.peach}, transparent)`,
                boxShadow: `0 0 12px ${P.peach}`,
                animation: "scanLine 2.2s ease-in-out infinite",
              }}/>
            </div>
          </div>

          {/* Bottom */}
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 5, padding: "16px 24px 40px", background: "linear-gradient(to top, rgba(0,0,0,0.75), transparent)" }}>
            <div style={{ textAlign: "center", marginBottom: 14, fontSize: 12, color: "rgba(255,255,255,0.72)", lineHeight: 1.5 }}>
              Fit the card inside the frame · Only the framed area is captured
            </div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <button onClick={capture} style={{
                width: 72, height: 72, borderRadius: "50%",
                background: "#fff", border: "4px solid rgba(255,255,255,0.35)",
                cursor: "pointer", padding: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
              }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", background: `linear-gradient(135deg, ${P.peach}, ${P.peachDp})`, boxShadow: `0 0 18px ${toRgba(P.peachDp, 0.6)}` }}/>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCREEN: PROCESSING
═══════════════════════════════════════════════════════════════════════════ */
const PROC_STEPS = [
  "BoBoa frame detection…",
  "Cropping card boundaries…",
  "Extracting 4 corners…",
  "Stitching corner grid…",
  "Sealing BoBoa watermark…",
  "BoBoa AI identifying card…",
  "Cross-checking card number…",
  "Detecting language…",
  "BoBoaGrade analysis…",
];

function ProcessingScreen({ photos, ctx, onDone }) {
  const [step, setStep] = useState(0);
  const [pct, setPct]   = useState(0);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setStep(i);
      setPct(Math.round((i / PROC_STEPS.length) * 100));
      if (i >= PROC_STEPS.length - 1) {
        clearInterval(iv);
        boboaRecognize({
          imageDataUrl: photos.full,
          tcgType: ctx.tcgType,
          language: ctx.language,
        }).then(r => setTimeout(() => onDone(r), 500));
      }
    }, 350);
    return () => clearInterval(iv);
  }, [photos, ctx, onDone]);

  return (
    <div style={{ minHeight: "100vh", background: P.bg, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 22, padding: "40px 30px", position: "relative", overflow: "hidden" }}>
      <style>{CSS}</style>

      <div style={{ position: "absolute", top: "20%", left: "-20%", width: "60%", height: "40%", background: toRgba(P.peach, 0.2), borderRadius: "50%", filter: "blur(80px)" }}/>
      <div style={{ position: "absolute", bottom: "20%", right: "-20%", width: "60%", height: "40%", background: toRgba(P.lavender, 0.2), borderRadius: "50%", filter: "blur(80px)" }}/>

      <div className="fu1" style={{ position: "relative", width: 96, height: 96, zIndex: 1 }}>
        <div style={{ position: "absolute", inset: 0, border: `3px solid ${toRgba(P.peach, 0.25)}`, borderRadius: "50%" }}/>
        <div style={{ position: "absolute", inset: 0, border: "3px solid transparent", borderTopColor: P.peachDp, borderRadius: "50%", animation: "spin 0.9s linear infinite" }}/>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span className="display" style={{ fontSize: 22, fontWeight: 700, color: P.peachDp }}>{pct}%</span>
        </div>
      </div>

      <div className="fu2" style={{ textAlign: "center", position: "relative", zIndex: 1 }}>
        <div className="display" style={{ fontSize: 24, fontWeight: 700, marginBottom: 5 }}>BoBoa AI is working…</div>
        <div style={{ fontSize: 13, color: P.sub, minHeight: 20 }}>{PROC_STEPS[step-1] || PROC_STEPS[0]}</div>
      </div>

      <div className="fu2" style={{ width: "100%", maxWidth: 290, height: 5, background: P.bgDeep, borderRadius: 99, position: "relative", zIndex: 1 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${P.peach}, ${P.peachDp})`, borderRadius: 99, transition: "width 0.35s" }}/>
      </div>

      {photos.corners && (
        <div className="fu3" style={{ width: "100%", maxWidth: 220, textAlign: "center", position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: 10, color: P.dim, marginBottom: 8, letterSpacing: "0.1em" }} className="mono">CORNERS · EXTRACTED</div>
          <img src={photos.corners} alt="corners" style={{ width: "100%", borderRadius: 12, border: `1px solid ${P.border}`, boxShadow: "0 4px 18px rgba(31,30,42,0.08)" }}/>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCREEN: RARITY PICKER (adapts to TCG type)
═══════════════════════════════════════════════════════════════════════════ */
function RarityPickerScreen({ photos, aiResult, user, ctx, onConfirm, onRescan }) {
  const ai = aiResult?.success ? aiResult.data : null;
  const rarities = RARITIES_BY_TCG[ctx.tcgType] || RARITIES_BY_TCG.onepiece;

  // Pre-fill from AI if it matches
  const initialRarity = ai?.rarity && rarities.find(r => r.id === ai.rarity)
    ? ai.rarity
    : rarities.find(r => r.id === "SR")?.id || rarities[0].id;

  const [rarity, setRarity] = useState(initialRarity);
  const [cardIdOverride, setCardIdOverride] = useState(ai?.cardId || "");
  const [editing, setEditing] = useState(false);

  const cardId = editing ? cardIdOverride : (ai?.cardId || "");
  const dbCard = cardId ? CARD_DB[cardId] : null;

  const name      = dbCard?.name    || ai?.name  || "Unknown card";
  const nameJP    = dbCard?.nameJP  || ai?.nameJP || "";
  const setName   = dbCard?.setName || ai?.setName || "";
  const conf      = ai?.confidence ?? 0;
  const idConf    = ai?.cardIdConfidence ?? conf;

  const confColor = conf >= 85 ? P.sageDp : conf >= 65 ? P.butterDp : P.coral;

  const confirm = () => {
    const db = CARD_DB[cardId];
    onConfirm({
      cardId,
      tcgType: ctx.tcgType,
      language: ctx.language,
      name:     db?.name     || name,
      nameJP:   db?.nameJP   || nameJP,
      set:      db?.set      || ai?.set || "",
      setName:  db?.setName  || setName,
      rarity,
      type:     db?.type     || ai?.type || "",
      color:    db?.color    || ai?.color || "",
      cost:     db?.cost ?? ai?.cost ?? null,
      power:    db?.power    || ai?.power || null,
      attribute:db?.attribute,
      level:    db?.level,
      atk:      db?.atk, def: db?.def,
      hp:       db?.hp,
      traits:   db?.traits   || [],
      ability:  db?.ability  || "",
      confidence: conf,
      cardIdConfidence: idConf,
      languageEvidence: ai?.languageEvidence || "",
      matchesSelectedType: ai?.matchesSelectedType,
      matchesSelectedLanguage: ai?.matchesSelectedLanguage,
      pq: ai?.printQuality || { centering: 85, corners: 88, edges: 88, surface: 90, overall: 88, notes: "" },
      dbCard: !!db,
    });
  };

  const tcg = TCG_TYPES.find(t => t.id === ctx.tcgType);

  return (
    <div style={{ maxWidth: 430, margin: "0 auto", background: P.bg, minHeight: "100vh" }}>
      <style>{CSS}</style>

      <div style={{ background: P.surface, borderBottom: `1px solid ${P.border}`, padding: "46px 18px 12px", position: "sticky", top: 0, zIndex: 40 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <SmallBtn onClick={onRescan}>← Rescan</SmallBtn>
          <div className="display" style={{ fontSize: 15, fontWeight: 700 }}>BoBoa Scan · Confirm</div>
          <div style={{ width: 70 }}/>
        </div>
      </div>

      <div style={{ padding: "14px 16px 110px", display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Confidence banner */}
        <div className="fu1">
          <Card accentColor={confColor} style={{ borderColor: toRgba(confColor, 0.4) }}>
            <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 10.5, color: P.sub, marginBottom: 3, letterSpacing: "0.06em" }}>◆ BOBOA AI</div>
                <div className="display" style={{ fontSize: 32, fontWeight: 700, color: confColor, lineHeight: 1 }}>{conf}%</div>
                {ai?.languageEvidence && (
                  <div style={{ fontSize: 11, color: P.sub, marginTop: 6, maxWidth: 220, lineHeight: 1.5 }}>🗣 {ai.languageEvidence}</div>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end" }}>
                <Pill color={aiResult?.success ? P.sageDp : P.coral}>{aiResult?.success ? "✓ AI matched" : "⚠ AI failed"}</Pill>
                <Pill color={tcg?.color || P.skyDp}>{tcg?.emoji} {tcg?.name}</Pill>
                <Pill color={P.skyDp}>{LANGUAGES.find(l=>l.id===ctx.language)?.flag} {ctx.language}</Pill>
              </div>
            </div>
            {(ai?.matchesSelectedType === false || ai?.matchesSelectedLanguage === false) && (
              <div style={{ padding: "9px 16px", background: toRgba(P.butterDp, 0.1), borderTop: `1px solid ${toRgba(P.butterDp, 0.3)}`, fontSize: 12, color: P.ink }}>
                ⚠ AI thinks this might not match your selected {ai.matchesSelectedType === false ? "TCG type" : "language"}. Double-check.
              </div>
            )}
          </Card>
        </div>

        {/* Photos */}
        <div className="fu2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Card>
            <img src={photos.full} alt="card" style={{ width: "100%", aspectRatio: "63/88", objectFit: "cover", display: "block" }}/>
            <div style={{ padding: "7px 12px", fontSize: 10, color: P.sub, letterSpacing: "0.08em" }} className="mono">CARD · FRAMED</div>
          </Card>
          <Card>
            <img src={photos.corners} alt="corners" style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", display: "block" }}/>
            <div style={{ padding: "7px 12px", fontSize: 10, color: P.sub, letterSpacing: "0.08em" }} className="mono">4 CORNERS · STITCHED</div>
          </Card>
        </div>

        {/* Card ID editable */}
        <div className="fu3">
          <Card>
            <SectionHeader accent={P.peachDp}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>◆ Card Identification</span>
                <button onClick={() => setEditing(!editing)} style={{
                  background: "none", border: "none", color: editing ? P.peachDp : P.sub,
                  fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: 0.5,
                }}>{editing ? "DONE" : "EDIT"}</button>
              </div>
            </SectionHeader>
            <div style={{ padding: "14px 16px" }}>
              {editing ? (
                <div>
                  <div style={{ fontSize: 11, color: P.sub, marginBottom: 6 }}>Card Number / ID</div>
                  <input value={cardIdOverride} onChange={e => setCardIdOverride(e.target.value)}
                    placeholder="e.g. OP07-051, LOB-001, SV3-185"
                    style={{ width: "100%", background: P.bg, border: `1.5px solid ${P.border}`, borderRadius: 10, padding: "11px 12px", fontSize: 14, fontFamily: "JetBrains Mono, monospace", outline: "none" }}/>
                  <div style={{ fontSize: 11, color: P.dim, marginTop: 6 }}>
                    {CARD_DB[cardIdOverride] ? `✓ Found in database` : `Not in seed DB — will use generated data`}
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                    <span className="mono" style={{ fontSize: 13, color: P.peachDp, fontWeight: 600, letterSpacing: "0.06em" }}>{cardId || "—"}</span>
                    {idConf > 0 && <Pill color={idConf >= 80 ? P.sageDp : P.butterDp} style={{ fontSize: 9 }}>{idConf}% match</Pill>}
                  </div>
                  <div className="display" style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1, marginBottom: 3 }}>{name}</div>
                  {nameJP && <div className="mono" style={{ fontSize: 11, color: P.dim, marginBottom: 6 }}>{nameJP}</div>}
                  {setName && <div style={{ fontSize: 12.5, color: P.sub }}>{setName}</div>}
                </>
              )}
            </div>
          </Card>
        </div>

        {/* Rarity picker */}
        <div className="fu4">
          <Card>
            <SectionHeader accent={P.lavDp}>Select Rarity · {tcg?.name}</SectionHeader>
            <div style={{ padding: "12px 14px 14px" }}>
              <div style={{ fontSize: 12, color: P.sub, marginBottom: 10, lineHeight: 1.5 }}>
                Pricing updates based on rarity. AI suggested <strong style={{ color: P.ink }}>{ai?.rarity || "—"}</strong>.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 7 }}>
                {rarities.map(r => {
                  const sel = rarity === r.id;
                  return (
                    <button key={r.id} onClick={() => setRarity(r.id)} style={{
                      background: sel ? r.color : P.surface,
                      color: sel ? "#fff" : P.ink,
                      border: `1.5px solid ${sel ? r.color : P.border}`,
                      borderRadius: 10, padding: "9px 6px",
                      cursor: "pointer", textAlign: "center",
                      boxShadow: sel ? `0 4px 12px ${toRgba(r.color, 0.3)}` : "none",
                      transition: "all 0.15s",
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{r.label}</div>
                      <div style={{ fontSize: 10, marginTop: 2, opacity: 0.78 }}>{r.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>
        </div>

        {ai?.printQuality?.notes && (
          <div className="fu5">
            <Card>
              <SectionHeader>BoBoa AI Notes</SectionHeader>
              <div style={{ padding: "12px 16px", fontSize: 12.5, color: P.sub, lineHeight: 1.65 }}>{ai.printQuality.notes}</div>
            </Card>
          </div>
        )}
      </div>

      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: "rgba(250,247,242,0.96)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderTop: `1px solid ${P.border}`, padding: "11px 16px 28px", display: "flex", gap: 10 }}>
        <SmallBtn onClick={onRescan} style={{ flex: 1, padding: "12px", fontSize: 13 }}>📷 Rescan</SmallBtn>
        <PrimaryBtn onClick={confirm} disabled={!cardId} style={{ flex: 2, padding: "12px", fontSize: 14 }}>
          Confirm · View Prices →
        </PrimaryBtn>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   BGS HELPERS
═══════════════════════════════════════════════════════════════════════════ */
const BGS_CRITERIA = [
  { key: "centering", label: "Centering", desc: "Border ratio front/back · PSA 10: ≤55/45 front, ≤60/40 back" },
  { key: "corners",   label: "Corners",   desc: "Sharpness and whitening of all 4 corners" },
  { key: "edges",     label: "Edges",     desc: "Smoothness, chipping, layering on all 4 edges" },
  { key: "surface",   label: "Surface",   desc: "Print defects, scratches, dents, holo scratches" },
];

function bgsRelative(s) { return Math.max(0, Math.min(10, Math.round((s / 10) * 2) / 2)); }

function bgsOverallBand(scores) {
  const subs = BGS_CRITERIA.map(c => bgsRelative(scores?.[c.key] || 0));
  const min  = Math.min(...subs);
  const avg  = subs.reduce((a,b) => a+b, 0) / subs.length;
  const ov   = Math.min(avg, min + 0.5);
  const r    = Math.floor(ov * 2) / 2;
  if (r >= 9.5 && min >= 9.5) {
    if (min >= 10) return { grade: "BGS 10 PRISTINE", color: P.lavDp, value: 10 };
    return { grade: "BGS 10 GEM MINT", color: P.butterDp, value: r };
  }
  if (r >= 9)   return { grade: `BGS ${r} MINT`,       color: P.sageDp,  value: r };
  if (r >= 8)   return { grade: `BGS ${r} NM-MT`,      color: P.skyDp,   value: r };
  if (r >= 7)   return { grade: `BGS ${r} NEAR MINT`,  color: P.peachDp, value: r };
  return { grade: `BGS ${r} EX`, color: P.coral, value: r };
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCREEN: RESULT
═══════════════════════════════════════════════════════════════════════════ */
function ResultScreen({ photos, card, user, onRescan }) {
  const [tab, setTab] = useState("prices");
  const [priceData, setPriceData] = useState(null);
  const [priceLoading, setPriceLoading] = useState(true);
  const [gradeFilter, setGradeFilter]   = useState("raw_mint");
  const [timeframe, setTimeframe]        = useState("1Y");
  const [sourceFilter, setSourceFilter]  = useState(null);

  // Fetch multi-source pricing
  useEffect(() => {
    setPriceLoading(true);
    fetchMultiSourcePrices({
      cardId: card.cardId,
      rarity: card.rarity,
      tcgType: card.tcgType,
      language: card.language,
    }).then(result => {
      setPriceData(result);
      setPriceLoading(false);
    });
  }, [card.cardId, card.rarity, card.tcgType, card.language]);

  const tcg = TCG_TYPES.find(t => t.id === card.tcgType);
  const rarities = RARITIES_BY_TCG[card.tcgType] || [];
  const rarityOpt = rarities.find(r => r.id === card.rarity) || rarities[0];
  const bgsOverall = bgsOverallBand(card.pq);

  // Search links for external markets
  const query = encodeURIComponent(`${card.name} ${card.cardId}`);
  const jpQuery = encodeURIComponent(`${card.nameJP || card.name} ${card.cardId}`);
  const externalLinks = card.language === "JP"
    ? [
        { ...SOURCES.find(s=>s.id==="yuyutei"),    q: jpQuery },
        { ...SOURCES.find(s=>s.id==="mercari"),    q: jpQuery },
        { ...SOURCES.find(s=>s.id==="rakuten"),    q: jpQuery },
        { ...SOURCES.find(s=>s.id==="amazon_jp"),  q: jpQuery },
        { ...SOURCES.find(s=>s.id==="ebay"),       q: query },
      ]
    : [
        { ...SOURCES.find(s=>s.id==="ebay"),         q: query },
        { ...SOURCES.find(s=>s.id==="tcgplayer"),    q: query },
        { ...SOURCES.find(s=>s.id==="pricecharting"),q: query },
        { ...SOURCES.find(s=>s.id==="tcgcorner"),    q: query },
      ];

  return (
    <div style={{ maxWidth: 430, margin: "0 auto", background: P.bg, minHeight: "100vh" }}>
      <style>{CSS}</style>

      {/* Sticky header */}
      <div style={{ background: P.surface, borderBottom: `1px solid ${P.border}`, padding: "44px 16px 0", position: "sticky", top: 0, zIndex: 40 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <SmallBtn onClick={onRescan}>📷 Scan</SmallBtn>
          <div style={{ display: "flex", gap: 4 }}>
            <Pill color={P.sageDp}>✓ BoBoa AI</Pill>
            <Pill color={rarityOpt?.color || P.skyDp}>{card.rarity}</Pill>
            <Pill color={tcg?.color || P.skyDp}>{tcg?.emoji}</Pill>
          </div>
        </div>

        <div style={{ display: "flex", gap: 13, alignItems: "flex-start", marginBottom: 10 }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <img src={photos.full} alt="card" style={{ width: 90, aspectRatio: "63/88", objectFit: "cover", borderRadius: 11, boxShadow: "0 6px 20px rgba(31,30,42,0.18)" }}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="mono" style={{ fontSize: 10, color: P.peachDp, letterSpacing: "0.1em", marginBottom: 4, fontWeight: 600 }}>
              {card.set} · {card.cardId}
            </div>
            <div className="display" style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1, marginBottom: 5 }}>{card.name}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 5 }}>
              <Pill color={rarityOpt?.color || P.skyDp} style={{ fontSize: 10 }}>{rarityOpt?.desc || card.rarity}</Pill>
              <Pill color={P.skyDp} style={{ fontSize: 10 }}>{card.language}</Pill>
              {card.color && <Pill color={P.sub} style={{ fontSize: 10 }}>{card.color}</Pill>}
            </div>
            <div style={{ fontSize: 11.5, color: P.sub, lineHeight: 1.65 }}>
              <strong style={{ color: P.ink }}>{card.setName}</strong>
              {card.type && <><br/>{card.type}</>}
              {card.cost != null && ` · Cost ${card.cost}`}
              {card.power && ` · ${card.power} PWR`}
              {card.atk != null && ` · ATK ${card.atk} / DEF ${card.def}`}
              {card.hp != null && ` · HP ${card.hp}`}
              {card.nameJP && <><br/><span className="mono" style={{ fontSize: 11, color: P.dim }}>{card.nameJP}</span></>}
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <div style={{ flex: 1, background: P.bgDeep, borderRadius: 10, padding: "8px 5px", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: P.sub, marginBottom: 2 }}>BoBoa Match</div>
            <div className="display" style={{ fontSize: 15, fontWeight: 700, color: card.confidence >= 85 ? P.sageDp : P.butterDp }}>{card.confidence}%</div>
          </div>
          <div style={{ flex: 1, background: P.bgDeep, borderRadius: 10, padding: "8px 5px", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: P.sub, marginBottom: 2 }}>BoBoaGrade</div>
            <div className="display" style={{ fontSize: 15, fontWeight: 700, color: bgsOverall.color }}>{bgsOverall.value}</div>
          </div>
          <div style={{ flex: 1.2, background: toRgba(P.coral, 0.12), border: `1px solid ${toRgba(P.coral, 0.25)}`, borderRadius: 10, padding: "8px 5px", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: P.coral, marginBottom: 2, fontWeight: 600 }}>🏯 Yuyu-tei Buy</div>
            <div className="display" style={{ fontSize: 14, fontWeight: 700, color: P.coral }}>
              {priceData?.yuyutei?.buy?.thb ? fmtTHB(priceData.yuyutei.buy.thb) : "—"}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderTop: `1px solid ${P.border}`, margin: "0 -16px" }}>
          {[{ id: "prices", label: "Prices" }, { id: "sales", label: "Sales" }, { id: "condition", label: "Condition" }, { id: "details", label: "Details" }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, background: "none", border: "none",
              borderBottom: tab === t.id ? `2px solid ${P.peachDp}` : "2px solid transparent",
              color: tab === t.id ? P.peachDp : P.sub,
              padding: "11px 2px",
              fontSize: 12.5, fontWeight: tab === t.id ? 700 : 500,
              cursor: "pointer",
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: "14px 16px 100px", display: "flex", flexDirection: "column", gap: 12 }}>

        {/* ─── PRICES ─── */}
        {tab === "prices" && (
          priceLoading ? (
            <Card>
              <div style={{ padding: "40px 20px", textAlign: "center" }}>
                <div style={{ width: 40, height: 40, border: `3px solid ${P.peach}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 14px" }}/>
                <div style={{ fontSize: 13, color: P.sub }}>Fetching prices from {SOURCES.length} sources…</div>
              </div>
            </Card>
          ) : !priceData?.ok ? (
            <Card>
              <div style={{ padding: "32px 20px", textAlign: "center" }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📊</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: P.sub, marginBottom: 4 }}>No price data</div>
                <div style={{ fontSize: 12, color: P.dim }}>{priceData?.error || "Card/rarity not tracked yet"}</div>
              </div>
            </Card>
          ) : (
            <>
              {/* ═══ YUYU-TEI ANCHOR — Buy-back (guaranteed sell) + Retail ═══ */}
              {priceData.yuyutei && (
                <Card accentColor={P.coral} className="fu1" style={{ borderColor: toRgba(P.coral, 0.45) }}>
                  <div style={{ padding: "14px 16px 6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 18 }}>🏯</span>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: P.ink }}>Yuyu-tei · Tokyo</div>
                        <div style={{ fontSize: 11, color: P.sub }}>Most reliable JP market anchor</div>
                      </div>
                    </div>
                    <Pill color={P.sageDp} style={{ fontSize: 10 }}>LIVE</Pill>
                  </div>

                  {/* Buy-back (what shop pays YOU) — the headline */}
                  <div style={{ padding: "10px 16px 14px" }}>
                    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 10.5, color: P.sub, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 3 }}>
                          買取価格 · Buy-back (guaranteed sell)
                        </div>
                        <div className="display" style={{ fontSize: 32, fontWeight: 700, color: P.coral, lineHeight: 1 }}>
                          {fmtTHB(priceData.yuyutei.buy.thb)}
                        </div>
                        <div style={{ fontSize: 11.5, color: P.sub, marginTop: 3 }} className="mono">
                          {fmtJPY(priceData.yuyutei.buy.jpy)} · {fmtUSD(priceData.yuyutei.buy.usd)}
                        </div>
                      </div>
                      {priceData.yuyutei.buy.url && (
                        <a href={priceData.yuyutei.buy.url} target="_blank" rel="noopener noreferrer">
                          <SmallBtn primary>買取 →</SmallBtn>
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Divider + retail sell price */}
                  <div style={{ borderTop: `1px solid ${P.line}`, padding: "11px 16px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: 10.5, color: P.sub, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 3 }}>
                          販売価格 · Retail (Yuyu-tei selling)
                        </div>
                        <div className="display" style={{ fontSize: 20, fontWeight: 700, color: P.ink, lineHeight: 1 }}>
                          {fmtTHB(priceData.yuyutei.sell.thb)}
                          <span style={{ fontSize: 13, color: P.sub, fontWeight: 500, marginLeft: 8 }} className="mono">
                            {fmtJPY(priceData.yuyutei.sell.jpy)}
                          </span>
                        </div>
                      </div>
                      {priceData.yuyutei.sell.url && (
                        <a href={priceData.yuyutei.sell.url} target="_blank" rel="noopener noreferrer">
                          <SmallBtn>販売 →</SmallBtn>
                        </a>
                      )}
                    </div>
                    {priceData.yuyutei.buy.thb > 0 && priceData.yuyutei.sell.thb > 0 && (
                      <div style={{
                        marginTop: 10,
                        background: toRgba(P.butter, 0.22),
                        border: `1px solid ${toRgba(P.butterDp, 0.25)}`,
                        borderRadius: 9,
                        padding: "7px 10px",
                        fontSize: 11.5,
                        color: P.sub,
                      }}>
                        <strong style={{ color: P.ink }}>Spread:</strong>{" "}
                        {fmtTHB(priceData.yuyutei.sell.thb - priceData.yuyutei.buy.thb)}{" "}
                        <span style={{ color: P.dim }}>
                          ({Math.round((1 - priceData.yuyutei.buy.thb / priceData.yuyutei.sell.thb) * 100)}% shop margin)
                        </span>
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {/* Multi-source combined average */}
              <Card className="fu2">
                <div style={{ padding: "14px 16px" }}>
                  <div style={{ fontSize: 10.5, color: P.sub, marginBottom: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    Multi-source average · {priceData.sources.length} sources
                  </div>
                  <div className="display" style={{ fontSize: 22, fontWeight: 700, color: P.ink, lineHeight: 1 }}>
                    {fmtTHB(priceData.combined.range.latestTHB)}
                  </div>
                  <div style={{ fontSize: 11, color: P.sub, marginTop: 3 }} className="mono">
                    Range {fmtTHB(priceData.combined.range.minTHB)} – {fmtTHB(priceData.combined.range.maxTHB)}
                  </div>
                </div>
              </Card>

              {/* Chart */}
              <Card className="fu3">
                <SectionHeader accent={P.peachDp}>Price history · All sources combined</SectionHeader>
                <div style={{ padding: "14px 0 10px" }}>
                  <InteractiveChart
                    chart={priceData.combined.chart}
                    allSales={priceData.combined.allSales}
                    color={P.peachDp}
                    timeframe={timeframe}
                    onTimeframeChange={setTimeframe}
                  />
                </div>
              </Card>

              {/* Per-source summary */}
              <Card className="fu4">
                <SectionHeader>By source · Latest sold</SectionHeader>
                {priceData.sources.map((s, i) => {
                  const latest = s.sales[0];
                  if (!latest) return null;
                  return (
                    <a key={s.source.id} href={s.source.url(card.language === "JP" ? (card.nameJP || card.name) + " " + card.cardId : card.name + " " + card.cardId)}
                      target="_blank" rel="noopener noreferrer">
                      <div style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "12px 16px",
                        borderBottom: i < priceData.sources.length - 1 ? `1px solid ${P.line}` : "none",
                        cursor: "pointer",
                      }}>
                        <span style={{ fontSize: 18 }}>{s.source.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: s.source.color }}>{s.source.name}</div>
                          <div style={{ fontSize: 10.5, color: P.dim }} className="mono">
                            {latest.date} · {s.source.region} · {s.source.currency}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div className="display" style={{ fontSize: 15, fontWeight: 700 }}>{fmtTHB(latest.priceTHB)}</div>
                          <div style={{ fontSize: 10, color: P.dim }} className="mono">{fmtUSD(latest.priceUSD)}</div>
                        </div>
                      </div>
                    </a>
                  );
                })}
              </Card>

              {/* External search */}
              <Card className="fu5">
                <SectionHeader>Browse sources</SectionHeader>
                {externalLinks.map((l, i, arr) => (
                  <a key={l.id} href={l.url(l.q ? decodeURIComponent(l.q) : card.name)} target="_blank" rel="noopener noreferrer">
                    <div style={{
                      display: "flex", alignItems: "center", gap: 11,
                      padding: "12px 16px",
                      borderBottom: i < arr.length - 1 ? `1px solid ${P.line}` : "none",
                    }}>
                      <span style={{ fontSize: 17 }}>{l.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 500, flex: 1, color: l.color }}>Search {l.name}</span>
                      <span style={{ color: P.dim, fontSize: 13 }}>›</span>
                    </div>
                  </a>
                ))}
              </Card>
            </>
          )
        )}

        {/* ─── SALES LIST ─── */}
        {tab === "sales" && (
          priceLoading || !priceData?.ok ? (
            <Card>
              <div style={{ padding: "40px 20px", textAlign: "center", color: P.sub, fontSize: 13 }}>Loading sales…</div>
            </Card>
          ) : (
            <>
              <Card className="fu1">
                <SectionHeader accent={P.peachDp}>Recent sold · Last 3 years · Latest first</SectionHeader>
                <div style={{ padding: "10px 16px", fontSize: 12, color: P.sub, background: P.bgDeep, borderBottom: `1px solid ${P.line}` }}>
                  Showing <strong style={{ color: P.ink }}>{card.name}</strong> · <strong style={{ color: P.ink }}>{card.rarity}</strong> · <strong style={{ color: P.ink }}>{card.language}</strong>. Filter by source below.
                </div>
                <SalesList sales={priceData.combined.allSales} sourceFilter={sourceFilter} onFilter={setSourceFilter}/>
              </Card>
            </>
          )
        )}

        {/* ─── CONDITION / BGS ─── */}
        {tab === "condition" && (
          <>
            <Card accentColor={bgsOverall.color} className="fu1" style={{ borderColor: toRgba(bgsOverall.color, 0.6) }}>
              <div style={{ padding: "16px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14 }}>
                <div>
                  <div style={{ fontSize: 10.5, color: P.sub, marginBottom: 3, letterSpacing: "0.06em" }}>◆ BOBOAGRADE</div>
                  <div className="display" style={{ fontSize: 18, fontWeight: 700, color: bgsOverall.color, lineHeight: 1.15 }}>
                    {bgsOverall.grade}
                  </div>
                  <div style={{ fontSize: 11.5, color: P.sub, marginTop: 6, maxWidth: 180, lineHeight: 1.55 }}>
                    Evaluated against BGS 10 Black Label criteria.
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div className="display" style={{ fontSize: 54, fontWeight: 700, color: bgsOverall.color, lineHeight: 0.9 }}>
                    {bgsOverall.value}
                  </div>
                  <div style={{ fontSize: 11, color: P.sub, marginTop: 2 }}>/ 10.0</div>
                </div>
              </div>
            </Card>

            <Card className="fu2">
              <SectionHeader accent={P.sageDp}>Subgrade breakdown</SectionHeader>
              {BGS_CRITERIA.map((c, i) => {
                const s = card.pq?.[c.key] || 85;
                const bgs = bgsRelative(s);
                const color = bgs >= 9.5 ? P.lavDp : bgs >= 9 ? P.sageDp : bgs >= 8 ? P.butterDp : bgs >= 7 ? P.peachDp : P.coral;
                return (
                  <div key={c.key} style={{ padding: "12px 16px", borderBottom: i < BGS_CRITERIA.length - 1 ? `1px solid ${P.line}` : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{c.label}</span>
                      <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                        <span style={{ fontSize: 10, color: P.dim }}>BGS</span>
                        <span className="display" style={{ fontSize: 20, fontWeight: 700, color }}>{bgs.toFixed(1)}</span>
                      </div>
                    </div>
                    <div style={{ height: 5, background: P.bgDeep, borderRadius: 99, overflow: "hidden", marginBottom: 5 }}>
                      <div style={{ height: "100%", width: `${s}%`, background: color, borderRadius: 99, transition: "width 1s" }}/>
                    </div>
                    <div style={{ fontSize: 11, color: P.dim, lineHeight: 1.5 }}>{c.desc}</div>
                  </div>
                );
              })}
            </Card>

            <Card className="fu3">
              <SectionHeader>Corner analysis · 4x zoom</SectionHeader>
              <div style={{ padding: "12px 16px" }}>
                <img src={photos.corners} alt="corners" style={{ width: "100%", borderRadius: 10, border: `1px solid ${P.line}` }}/>
                <div style={{ marginTop: 9, fontSize: 11.5, color: P.sub, lineHeight: 1.55 }}>
                  TL · TR · BL · BR — each corner cropped at 28% and stitched into 2×2 grid.
                </div>
              </div>
            </Card>

            {card.pq?.notes && (
              <Card className="fu4">
                <SectionHeader accent={P.peachDp}>BoBoa AI · Condition notes</SectionHeader>
                <div style={{ padding: "12px 16px", fontSize: 12.5, color: P.sub, lineHeight: 1.65 }}>{card.pq.notes}</div>
              </Card>
            )}
          </>
        )}

        {/* ─── DETAILS ─── */}
        {tab === "details" && (
          <>
            <Card className="fu1">
              <SectionHeader>Card details</SectionHeader>
              <div style={{ padding: "14px 16px", display: "grid", gap: 10 }}>
                {[
                  ["Card ID",     card.cardId],
                  ["Name",        card.name],
                  ["Name (JP)",   card.nameJP],
                  ["Set",         `${card.setName}${card.set ? ` · ${card.set}` : ""}`],
                  ["TCG",         tcg?.name],
                  ["Rarity",      rarityOpt?.desc],
                  ["Language",    LANGUAGES.find(l=>l.id===card.language)?.label],
                  ["Type",        card.type],
                  ["Color/Attr",  card.color || card.attribute],
                  ["Cost",        card.cost],
                  ["Power/ATK",   card.power || card.atk],
                  ["DEF",         card.def],
                  ["HP",          card.hp],
                  ["Level",       card.level],
                ].filter(([,v]) => v != null && v !== "").map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ color: P.sub }}>{k}</span>
                    <span style={{ fontWeight: 600, textAlign: "right" }}>{v}</span>
                  </div>
                ))}
              </div>
            </Card>

            {card.ability && (
              <Card className="fu2">
                <SectionHeader>Ability</SectionHeader>
                <div style={{ padding: "12px 16px", fontSize: 13, lineHeight: 1.7, color: P.ink }}>
                  {card.ability}
                </div>
              </Card>
            )}

            {card.traits?.length > 0 && (
              <Card className="fu3">
                <SectionHeader>Traits</SectionHeader>
                <div style={{ padding: "12px 16px", display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {card.traits.map(t => <Pill key={t} color={P.sub}>{t}</Pill>)}
                </div>
              </Card>
            )}
          </>
        )}

      </div>

      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: "rgba(250,247,242,0.96)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderTop: `1px solid ${P.border}`, padding: "11px 16px 28px", display: "flex", gap: 10 }}>
        <SmallBtn onClick={onRescan} style={{ flex: 1, padding: "12px" }}>📷 Scan Again</SmallBtn>
        <PrimaryBtn style={{ flex: 2, padding: "12px" }}>Push to Vault →</PrimaryBtn>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ROOT
═══════════════════════════════════════════════════════════════════════════ */
export default function App() {
  const [screen,   setScreen]   = useState("login");
  const [user,     setUser]     = useState(null);
  const [ctx,      setCtx]      = useState(null);  // { tcgType, language }
  const [photos,   setPhotos]   = useState(null);
  const [aiResult, setAiResult] = useState(null);
  const [card,     setCard]     = useState(null);

  const login    = useCallback(u => { setUser(u); setScreen("welcome"); }, []);
  const logout   = useCallback(()=> { setUser(null); setScreen("login"); }, []);
  const start    = useCallback(c => { setCtx(c); setScreen("camera"); }, []);
  const back     = useCallback(()=> setScreen("welcome"), []);
  const captured = useCallback(p => { setPhotos(p); setScreen("processing"); }, []);
  const procDone = useCallback(r => { setAiResult(r); setScreen("rarity"); }, []);
  const confirm  = useCallback(c => { setCard(c); setScreen("result"); }, []);
  const rescan   = useCallback(()=> { setPhotos(null); setAiResult(null); setCard(null); setScreen("camera"); }, []);

  if (screen === "login")      return <LoginScreen onLogin={login}/>;
  if (screen === "welcome")    return <WelcomeScreen user={user} onStart={start} onLogout={logout}/>;
  if (screen === "camera")     return <CameraScreen user={user} ctx={ctx} onCapture={captured} onBack={back}/>;
  if (screen === "processing") return <ProcessingScreen photos={photos} ctx={ctx} onDone={procDone}/>;
  if (screen === "rarity")     return <RarityPickerScreen photos={photos} aiResult={aiResult} user={user} ctx={ctx} onConfirm={confirm} onRescan={rescan}/>;
  if (screen === "result")     return <ResultScreen photos={photos} card={card} user={user} onRescan={rescan}/>;
  return null;
}
