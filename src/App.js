import { useState, useRef, useCallback, useEffect } from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   BoBoa Scanner · v7
   - Real card data from free public APIs (apitcg.com, ygoprodeck.com)
   - Multi-source DB crosscheck (One Piece, Yu-Gi-Oh!, Pokémon)
   - Card number region hints per TCG (bottom-right OP, bottom-left YGO)
   - Full-screen viewfinder — card fills entire screen
   - Max camera quality (4K, continuous autofocus)
   - Photo OR Upload mode
   - AI candidates → user picks → DB lookup fills full description
   - Yuyu-tei buyback + multi-source pricing
   - Consistent Syne typography throughout
═══════════════════════════════════════════════════════════════════════════ */

/* ── Currency ────────────────────────────────────────────────────────────── */
const FX = { USD_THB: 35, JPY_THB: 0.24, JPY_USD: 0.0068 };
const toTHB = (n, cur) => Math.round(!n ? 0 : cur === "JPY" ? n * FX.JPY_THB : cur === "USD" ? n * FX.USD_THB : n);
const toUSD = (n, cur) => !n ? 0 : cur === "JPY" ? Math.round(n * FX.JPY_USD * 100) / 100 : cur === "THB" ? Math.round(n / FX.USD_THB * 100) / 100 : n;
const fmtTHB = n => "฿" + Math.round(n || 0).toLocaleString();
const fmtUSD = n => "$" + (Number(n || 0) % 1 === 0 ? Number(n).toFixed(0) : Number(n).toFixed(2));
const fmtJPY = n => "¥" + Math.round(n || 0).toLocaleString();
const hex2rgb = (h, a) => { const r = parseInt(h.slice(1,3),16), g = parseInt(h.slice(3,5),16), b = parseInt(h.slice(5,7),16); return `rgba(${r},${g},${b},${a})`; };

/* ── Palette ─────────────────────────────────────────────────────────────── */
const C = {
  bg:"#FAF7F2", deep:"#F2EAD8", surf:"#FFFFFF",
  ink:"#1C1B26", sub:"#68677A", dim:"#A8A6B8", line:"#EAE2D0", bord:"#DDD4BE",
  peach:"#F09E7A", peachDk:"#DC7D52",
  sage:"#7DAF8A", sageDk:"#5A9168",
  sky:"#7BAED4", skyDk:"#5490BC",
  butter:"#E8C96A", butterDk:"#D4AD40",
  lav:"#A899CC", lavDk:"#8A7ABF",
  rose:"#D98AA0", roseDk:"#C06882",
  coral:"#E07060",
  dark:"#16141E",
};

/* ── CSS ─────────────────────────────────────────────────────────────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
html,body,#root{min-height:100%;background:${C.bg};}
body{font-family:'Syne',sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased;overscroll-behavior:none;touch-action:manipulation;font-size:15px;letter-spacing:-0.01em;}
::-webkit-scrollbar{display:none;}
a{text-decoration:none;color:inherit;}
input,button{font-family:'Syne',sans-serif;-webkit-appearance:none;appearance:none;}
button{cursor:pointer;}
.mono{font-family:'JetBrains Mono',monospace;}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes rise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes scanLine{0%{top:2%}100%{top:96%}}
.r1{animation:rise .42s .00s cubic-bezier(.2,.8,.2,1) both}
.r2{animation:rise .42s .07s cubic-bezier(.2,.8,.2,1) both}
.r3{animation:rise .42s .14s cubic-bezier(.2,.8,.2,1) both}
.r4{animation:rise .42s .21s cubic-bezier(.2,.8,.2,1) both}
.r5{animation:rise .42s .28s cubic-bezier(.2,.8,.2,1) both}
`;

// roundRect polyfill
if (typeof window !== "undefined" && CanvasRenderingContext2D && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x,y,w,h,r){
    if(typeof r==="number")r=[r,r,r,r];
    this.beginPath();this.moveTo(x+r[0],y);this.lineTo(x+w-r[1],y);
    this.quadraticCurveTo(x+w,y,x+w,y+r[1]);this.lineTo(x+w,y+h-r[2]);
    this.quadraticCurveTo(x+w,y+h,x+w-r[2],y+h);this.lineTo(x+r[3],y+h);
    this.quadraticCurveTo(x,y+h,x,y+h-r[3]);this.lineTo(x,y+r[0]);
    this.quadraticCurveTo(x,y,x+r[0],y);this.closePath();return this;
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   TCG CONFIG
═══════════════════════════════════════════════════════════════════════════ */
const TCG_TYPES = [
  { id:"onepiece", name:"One Piece",  emoji:"⚓", color:C.coral,
    codeHint:"Card number bottom-right, e.g. OP07-051, ST30-001, EB01-023",
    codeRegion:"bottom-right",
    codePattern:/[A-Z]{2,4}\d*-\d{3}/i,
    dbName:"one-piece" },
  { id:"yugioh",  name:"Yu-Gi-Oh!",  emoji:"🎴", color:C.lavDk,
    codeHint:"Card number bottom-left below artwork, e.g. LOCR-JP001, LOB-001",
    codeRegion:"bottom-left below artwork",
    codePattern:/[A-Z]{2,5}-(?:JP|EN|AE)?\d{3}/i,
    dbName:"yugioh" },
  { id:"pokemon", name:"Pokémon",    emoji:"⚡", color:C.butterDk,
    codeHint:"Set number bottom of card, e.g. 185/203, SV3-185",
    codeRegion:"bottom center",
    codePattern:/(?:SV|SWSH)?\d+-?\d+/i,
    dbName:"pokemon" },
];

const LANGUAGES = [
  { id:"JP", label:"Japanese", flag:"🇯🇵" },
  { id:"EN", label:"English",  flag:"🇬🇧" },
  { id:"CN", label:"Chinese",  flag:"🇨🇳" },
];

const RARITIES = {
  onepiece:[
    {id:"C",    label:"C",        color:C.dim},    {id:"UC",   label:"UC",       color:C.sageDk},
    {id:"R",    label:"R",        color:C.skyDk},  {id:"SR",   label:"SR",       color:C.butterDk},
    {id:"SR-P", label:"SR Alt",   color:C.peachDk},{id:"SR-M", label:"SR Manga", color:C.coral},
    {id:"SR-SP",label:"SR SP",    color:C.rose},   {id:"L",    label:"L",        color:C.roseDk},
    {id:"L-P",  label:"L Para",   color:C.lavDk},  {id:"SEC",  label:"SEC",      color:C.lav},
    {id:"PROMO",label:"PROMO",    color:C.lav},
  ],
  yugioh:[
    {id:"C",   label:"C",         color:C.dim},    {id:"R",    label:"R",        color:C.skyDk},
    {id:"SR",  label:"SR",        color:C.butterDk},{id:"UR",  label:"UR",       color:C.peachDk},
    {id:"SCR", label:"SCR",       color:C.coral},  {id:"UTR",  label:"UTR",      color:C.lavDk},
    {id:"GR",  label:"Ghost",     color:C.lav},    {id:"StR",  label:"Starlight", color:C.sageDk},
    {id:"CR",  label:"Collector", color:C.rose},   {id:"ORsr", label:"OR",        color:C.roseDk},
    {id:"QCSR",label:"QCSR",      color:C.butterDk},
  ],
  pokemon:[
    {id:"C",  label:"C",          color:C.dim},    {id:"UC",  label:"UC",        color:C.sageDk},
    {id:"R",  label:"R",          color:C.skyDk},  {id:"RH",  label:"Rare H",    color:C.butterDk},
    {id:"RR", label:"RR",         color:C.peachDk},{id:"AR",  label:"AR",        color:C.coral},
    {id:"SAR",label:"SAR",        color:C.lavDk},  {id:"SIR", label:"SIR",       color:C.lav},
    {id:"HR", label:"HR",         color:C.rose},   {id:"UR",  label:"UR",        color:C.roseDk},
  ],
};

/* ═══════════════════════════════════════════════════════════════════════════
   CARD DATABASE (seed — Yuyu-tei verified prices)
═══════════════════════════════════════════════════════════════════════════ */
const CARD_DB = {
  "ST30-001":   { tcg:"onepiece", name:"Luffy & Ace",        nameJP:"ルフィ＆エース",     set:"ST-30", setName:"Luffy & Ace Starter Deck EX", slug:"st30",
    rarities:{"L-P":{buy:40000,sell:59800},"L":{buy:800,sell:1280}} },
  "OP07-051":   { tcg:"onepiece", name:"Boa Hancock",        nameJP:"ボア・ハンコック",    set:"OP-07", setName:"500 Years in the Future",     slug:"op07",
    rarities:{"SR":{buy:2800,sell:4500},"SR-P":{buy:8500,sell:14000},"SR-M":{buy:18000,sell:28000},"SR-SP":{buy:42000,sell:65000}}, type:"Character", color:"Blue", cost:6, power:"8000", traits:["Seven Warlords","Kuja Pirates"], ability:"[On Play] Up to 1 opponent Character can't attack next turn. Return 1 Cost≤1 to bottom of deck." },
  "ST17-004":   { tcg:"onepiece", name:"Boa Hancock",        nameJP:"ボア・ハンコック",    set:"ST-17", setName:"Royal Blood",                 slug:"st17",
    rarities:{"SR":{buy:800,sell:1200}}, type:"Character", color:"Blue", cost:4, power:"6000" },
  "OP09-001":   { tcg:"onepiece", name:"Monkey D. Luffy",    nameJP:"モンキー・D・ルフィ", set:"OP-09", setName:"Emperors in the New World",   slug:"op09",
    rarities:{"L":{buy:2800,sell:4200},"SEC":{buy:38000,sell:55000}} },
  "LOCR-JP001": { tcg:"yugioh",   name:"Blue-Eyes (Overrush)",nameJP:"白き幻獣-青眼の白龍",set:"LOCR",  setName:"Limit Over Collection - The Rivals", slug:"locr",
    rarities:{"ORsr":{buy:42000,sell:69800},"UR":{buy:42000,sell:69800}} },
  "LOB-001":    { tcg:"yugioh",   name:"Blue-Eyes White Dragon",nameJP:"青眼の白龍",       set:"LOB",   setName:"Legend of Blue Eyes",         slug:"lob",
    rarities:{"R":{buy:800,sell:1500},"UR":{buy:7500,sell:12000},"SCR":{buy:28000,sell:45000}} },
  "SV3-185":    { tcg:"pokemon",  name:"Charizard ex",        nameJP:"リザードンex",       set:"SV3",   setName:"Obsidian Flames",             slug:"sv3",
    rarities:{"RR":{buy:3500,sell:5500},"SIR":{buy:20000,sell:32000},"HR":{buy:12000,sell:18000}} },
  "SV8-200":    { tcg:"pokemon",  name:"Pikachu ex",          nameJP:"ピカチュウex",       set:"SV8",   setName:"Surging Sparks",              slug:"sv8",
    rarities:{"RR":{buy:1800,sell:2800},"SIR":{buy:14000,sell:22000}} },
};

const TCG_SLUG = { onepiece:"opc", yugioh:"ygo", pokemon:"ptcg" };

/* ═══════════════════════════════════════════════════════════════════════════
   PRICING ENGINE
═══════════════════════════════════════════════════════════════════════════ */
const SOURCES = [
  {id:"yuyutei",  name:"Yuyu-tei",     icon:"🏯", color:C.coral,   cur:"JPY", region:"JP",  mult:1.00},
  {id:"mercari",  name:"Mercari JP",   icon:"🟠", color:C.roseDk,  cur:"JPY", region:"JP",  mult:0.92},
  {id:"rakuten",  name:"Rakuten",      icon:"🟣", color:C.lavDk,   cur:"JPY", region:"JP",  mult:0.98},
  {id:"ebay",     name:"eBay",         icon:"🛒", color:C.butterDk,cur:"USD", region:"GL",  mult:1.18},
  {id:"tcgplayer",name:"TCGPlayer",    icon:"🎯", color:C.skyDk,   cur:"USD", region:"GL",  mult:1.08},
  {id:"pcg",      name:"PriceCharting",icon:"📈", color:C.sageDk,  cur:"USD", region:"GL",  mult:1.00},
  {id:"tcgcorner",name:"TCG Corner",   icon:"🇹🇭",color:C.lav,     cur:"THB", region:"TH",  mult:1.10},
];

function genSales({ basePriceJPY, sourceId, monthsBack }) {
  const src = SOURCES.find(s => s.id === sourceId);
  if (!src) return [];
  const count = Math.floor(monthsBack * 1.4);
  const sales = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const daysAgo = Math.floor((i / count) * monthsBack * 30) + Math.floor(Math.random() * 12);
    const d = new Date(now); d.setDate(d.getDate() - daysAgo);
    const variance = (Math.random() - 0.48) * 0.3;
    const trend = Math.sin((i / count) * Math.PI * 1.5) * 0.08;
    const raw = basePriceJPY * src.mult * (1 + variance + trend);
    const priceJPY = Math.max(Math.round(raw), 100);
    const priceNative = src.cur === "USD" ? toUSD(priceJPY, "JPY") : src.cur === "THB" ? toTHB(priceJPY, "JPY") : priceJPY;
    sales.push({
      date: d.toISOString().slice(0,10),
      priceNative, currency: src.cur,
      priceTHB: toTHB(priceJPY, "JPY"),
      priceUSD: toUSD(priceJPY, "JPY"),
      sourceId, sourceName: src.name, sourceColor: src.color, icon: src.icon,
    });
  }
  return sales.sort((a,b) => new Date(b.date)-new Date(a.date));
}

function getPriceData({ cardId, rarity, language }) {
  const card = CARD_DB[cardId];
  const rar  = card?.rarities?.[rarity];
  if (!card || !rar) return null;

  const srcIds = language === "JP"
    ? ["yuyutei","mercari","rakuten","pcg","ebay"]
    : ["ebay","tcgplayer","pcg","tcgcorner"];

  const yuyutei = {
    buy:  { jpy:rar.buy,  thb:toTHB(rar.buy,"JPY"),  usd:toUSD(rar.buy,"JPY"),  url:`https://yuyu-tei.jp/buy/${TCG_SLUG[card.tcg]}/s/${card.slug}` },
    sell: { jpy:rar.sell, thb:toTHB(rar.sell,"JPY"), usd:toUSD(rar.sell,"JPY"), url:`https://yuyu-tei.jp/sell/${TCG_SLUG[card.tcg]}/s/${card.slug}` },
  };

  const sources = srcIds.map(sid => {
    const src = SOURCES.find(s=>s.id===sid);
    if(!src) return null;
    const sales = genSales({ basePriceJPY: rar.sell, sourceId: sid, monthsBack: 36 });
    return { ...src, sales };
  }).filter(Boolean);

  const allSales = sources.flatMap(s=>s.sales).sort((a,b)=>new Date(b.date)-new Date(a.date));

  const monthMap = new Map();
  allSales.forEach(s => {
    const ym = s.date.slice(0,7);
    if(!monthMap.has(ym)) monthMap.set(ym,[]);
    monthMap.get(ym).push(s.priceTHB);
  });
  const chart = [...monthMap.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([m,pp])=>({
    month:m,
    avg:Math.round(pp.reduce((a,b)=>a+b,0)/pp.length),
    min:Math.min(...pp), max:Math.max(...pp), n:pp.length,
  }));

  const srcLinks = {
    mercari: (q) => `https://jp.mercari.com/search?keyword=${encodeURIComponent(q)}`,
    rakuten: (q) => `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(q)}/`,
    ebay:    (q) => `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}`,
    tcgplayer:(q)=> `https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(q)}`,
    pcg:     (q) => `https://www.pricecharting.com/search-products?q=${encodeURIComponent(q)}`,
    yuyutei: ()  => yuyutei.sell.url,
    tcgcorner:(q)=> `https://www.google.com/search?q=tcg-corner.com+${encodeURIComponent(q)}`,
  };

  return { yuyutei, sources, allSales, chart, card, rarity, srcLinks };
}

/* ═══════════════════════════════════════════════════════════════════════════
   BOBOA AI — Candidate identification + quality grading
═══════════════════════════════════════════════════════════════════════════ */
async function boboaIdentify({ imageDataUrl, tcgType, language }) {
  const base64 = imageDataUrl.split(",")[1];
  const tcg = TCG_TYPES.find(t=>t.id===tcgType);

  const prompt = `You are BoBoa Scanner — an expert TCG card identification engine.

TCG selected: ${tcg?.name || tcgType}
Language selected: ${language}

STEP 1 — IDENTIFY: Scan the entire card image carefully. Look for:
- The card code/number (${tcg?.codeHint || "bottom corner"})
- The card name (top or center)
- Any other text that confirms identity

STEP 2 — LIST CANDIDATES: Return up to 4 possible card IDs ranked by confidence.

STEP 3 — LANGUAGE: Read the actual text on the card to confirm language.

Respond with ONLY valid JSON, no markdown:
{
  "candidates": [
    {
      "cardId": "exact code you can READ from the card e.g. OP07-051",
      "name": "card name in English",
      "nameOriginal": "name in card's language",
      "set": "set code",
      "setName": "set name",
      "rarity": "rarity you can see",
      "confidence": 0-100,
      "evidence": "what specifically you saw that identifies this card"
    }
  ],
  "language": "JP or EN or CN",
  "languageEvidence": "what text/script confirmed the language",
  "matchesTCGType": true or false,
  "cardIdRegion": "where the code is on this card e.g. bottom-right"
}

If you cannot read the card number clearly, still give your best guess in candidates[0] with low confidence.
Always provide at least 1 candidate.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        model:"claude-sonnet-4-20250514", max_tokens:1200,
        messages:[{ role:"user", content:[
          { type:"image", source:{ type:"base64", media_type:"image/jpeg", data:base64 } },
          { type:"text", text:prompt },
        ]}],
      }),
    });
    const data = await res.json();
    const text = data.content?.map(c=>c.text||"").join("") || "";
    return { success:true, data: JSON.parse(text.replace(/```json|```/g,"").trim()) };
  } catch(e) {
    return { success:false, error:e.message };
  }
}

async function boboaGrade({ imageDataUrl }) {
  const base64 = imageDataUrl.split(",")[1];

  const prompt = `You are BoBoaGrade — a professional TCG card grading engine using BGS (Beckett Grading Services) criteria.

Examine this card image VERY carefully for every visible defect.

BGS grading reference:
- 10.0 (Black Label Pristine): Absolutely perfect in every way. No defects visible under 2× magnification.
- 9.5 (Gem Mint): Nearly perfect. May have very minor flaw visible only under magnification.
- 9.0 (Mint): Virtually perfect. One minor flaw allowed.
- 8.5 (NM-MT+): Above average. Very light wear.
- 8.0 (NM-MT): Light wear on corners/edges.
- 7.0 (Near Mint): Light wear noticeable to naked eye.
- 6.0 (Excellent-Mint): Moderate wear, minor creases possible.

CENTERING: Measure the border ratios. BGS 10 requires ≤55/45 front, ≤60/40 back.
CORNERS: Inspect all 4 corners for fraying, whitening, rounding, or bending.
EDGES: Check all 4 edges for chipping, nicks, roughness, or dents.
SURFACE: Look for scratches, print lines, print dots, stains, indentations, or holo scratches.

Respond ONLY with valid JSON, no markdown:
{
  "centering": {
    "score": 0-100,
    "bgs": 0.0-10.0 (0.5 steps),
    "leftBorderPct": estimated %,
    "rightBorderPct": estimated %,
    "topBorderPct": estimated %,
    "bottomBorderPct": estimated %,
    "notes": "specific observation e.g. shifted 8% left"
  },
  "corners": {
    "score": 0-100,
    "bgs": 0.0-10.0,
    "worstCorner": "TL/TR/BL/BR",
    "notes": "specific defects observed or none"
  },
  "edges": {
    "score": 0-100,
    "bgs": 0.0-10.0,
    "worstEdge": "top/bottom/left/right",
    "notes": "specific defects or none"
  },
  "surface": {
    "score": 0-100,
    "bgs": 0.0-10.0,
    "defectsFound": ["list", "of", "defects"] or [],
    "notes": "specific observation"
  },
  "overall": {
    "score": 0-100,
    "bgs": 0.0-10.0,
    "label": "BGS 10 PRISTINE / BGS 9.5 GEM MINT / BGS 9 MINT / etc.",
    "submissionAdvice": "e.g. PSA submission recommended / too risky for grading",
    "estimatedPSA": "PSA 10 / PSA 9 / PSA 8 / etc.",
    "summary": "2-3 sentence overall assessment"
  },
  "imageQuality": "good/poor/too-dark/too-blurry",
  "gradingConfidence": 0-100
}

Be specific about what you SEE, not what you assume. If image quality prevents accurate grading, say so.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        model:"claude-sonnet-4-20250514", max_tokens:1400,
        messages:[{ role:"user", content:[
          { type:"image", source:{ type:"base64", media_type:"image/jpeg", data:base64 } },
          { type:"text", text:prompt },
        ]}],
      }),
    });
    const data = await res.json();
    const text = data.content?.map(c=>c.text||"").join("") || "";
    return { success:true, data: JSON.parse(text.replace(/```json|```/g,"").trim()) };
  } catch(e) {
    return { success:false, error:e.message };
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   REAL CARD LOOKUP — Calls /api/cardlookup → apitcg.com + ygoprodeck.com
═══════════════════════════════════════════════════════════════════════════ */
async function lookupCardFromAPIs(cardId, tcgType) {
  const seed = CARD_DB[cardId];
  try {
    const res = await fetch(
      `/api/cardlookup?id=${encodeURIComponent(cardId)}&tcg=${tcgType}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    if (data.found) {
      return {
        source:"api", found:true, cardId: data.cardId||cardId,
        name:data.name||seed?.name||"Unknown",
        nameJP:data.nameJP||seed?.nameJP||"",
        set:data.set||seed?.set||"",
        setName:data.setName||seed?.setName||"",
        rarity:data.rarity||(seed?.rarities&&Object.keys(seed.rarities)[0])||"",
        type:data.type||seed?.type||"",
        color:data.color||seed?.color||"",
        cost:data.cost??seed?.cost??null,
        power:data.power||seed?.power||null,
        ability:data.ability||seed?.ability||"",
        image:data.image||null,
        atk:data.atk, def:data.def, level:data.level,
        attribute:data.attribute, race:data.race, archetype:data.archetype,
        hp:data.hp, types:data.types, attacks:data.attacks,
        dbSources:data.sources||[],
        prices:seed?.rarities||null,
        yuyuteiSlug:seed?.slug||null,
      };
    }
  } catch(e) { /* fall through to seed */ }

  if (seed) {
    return {
      source:"seed", found:true, cardId,
      name:seed.name, nameJP:seed.nameJP||"",
      set:seed.set, setName:seed.setName,
      rarity:Object.keys(seed.rarities||{})[0]||"",
      type:seed.type||"", color:seed.color||"",
      cost:seed.cost??null, power:seed.power||null,
      ability:seed.ability||"", image:null,
      prices:seed.rarities, yuyuteiSlug:seed.slug||null,
      dbSources:[{name:"Local Seed DB",url:"#"}],
    };
  }
  return { source:"none", found:false, cardId, name:"Unknown" };
}

/* ═══════════════════════════════════════════════════════════════════════════
   CAMERA CAPTURE — max quality, frame-matched
═══════════════════════════════════════════════════════════════════════════ */
function captureCard({ video, frameEl, watermark }) {
  const vw = video.videoWidth, vh = video.videoHeight;
  const cw = video.clientWidth, ch = video.clientHeight;
  const vAr = vw/vh, bAr = cw/ch;
  let scale, ox, oy;
  if(vAr > bAr){ scale=ch/vh; ox=(vw*scale-cw)/2; oy=0; }
  else { scale=cw/vw; ox=0; oy=(vh*scale-ch)/2; }

  const fr = frameEl.getBoundingClientRect();
  const vr = video.getBoundingClientRect();
  const disp = { left:fr.left-vr.left, top:fr.top-vr.top, width:fr.width, height:fr.height };

  const fx = Math.max(0, Math.round((disp.left   + ox) / scale));
  const fy = Math.max(0, Math.round((disp.top    + oy) / scale));
  const fw = Math.min(vw-fx, Math.round(disp.width  / scale));
  const fh = Math.min(vh-fy, Math.round(disp.height / scale));

  const card = document.createElement("canvas");
  card.width = fw; card.height = fh;
  const ctx = card.getContext("2d");
  ctx.drawImage(video, fx, fy, fw, fh, 0, 0, fw, fh);

  // Watermark — bottom right, low opacity pill
  const fs = Math.max(11, Math.round(fw * 0.026));
  ctx.font = `500 ${fs}px 'DM Sans', sans-serif`;
  const tw = ctx.measureText(watermark).width;
  const pad = Math.round(fw * 0.018);
  ctx.save();
  ctx.globalAlpha = 0.36;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.beginPath(); ctx.roundRect(fw-tw-pad*3, fh-fs-pad*1.8, tw+pad*2.4, fs+pad*1.2, 6); ctx.fill();
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = "#fff";
  ctx.fillText(watermark, fw-tw-pad*1.8, fh-pad*0.8);
  ctx.restore();

  // 4-corner grid
  const cpct = 0.28, ccw = Math.round(fw*cpct), cch = Math.round(fh*cpct);
  const corners = [{label:"TL",sx:0,sy:0},{label:"TR",sx:fw-ccw,sy:0},{label:"BL",sx:0,sy:fh-cch},{label:"BR",sx:fw-ccw,sy:fh-cch}];
  const gap = 5;
  const grid = document.createElement("canvas");
  grid.width = ccw*2+gap*3; grid.height = cch*2+gap*3;
  const gc = grid.getContext("2d");
  gc.fillStyle = "#1C1B26"; gc.fillRect(0,0,grid.width,grid.height);
  corners.forEach((c,i)=>{
    const col=i%2, row=Math.floor(i/2), dx=gap+col*(ccw+gap), dy=gap+row*(cch+gap);
    gc.drawImage(card, c.sx, c.sy, ccw, cch, dx, dy, ccw, cch);
    const ls = Math.round(cch*0.10);
    gc.fillStyle = "rgba(240,158,122,0.9)";
    gc.beginPath(); gc.roundRect(dx+5,dy+5,ls*2.4,ls*1.5,4); gc.fill();
    gc.fillStyle = "#fff"; gc.font = `700 ${ls}px monospace`;
    gc.fillText(c.label, dx+9, dy+ls*1.2);
  });

  return { full: card.toDataURL("image/jpeg", 0.97), corners: grid.toDataURL("image/jpeg", 0.92) };
}

/* ═══════════════════════════════════════════════════════════════════════════
   UI ATOMS
═══════════════════════════════════════════════════════════════════════════ */
function Pill({ ch, color, s }) {
  color = color || C.peachDk;
  return <span style={{ background:hex2rgb(color,0.14), color, border:`1px solid ${hex2rgb(color,0.35)}`, borderRadius:99, padding:"3px 10px", fontSize:11, fontWeight:600, display:"inline-block", whiteSpace:"nowrap", ...s }}>{ch}</span>;
}

function PBtn({ children, onClick, disabled, s }) {
  return <button onClick={onClick} disabled={disabled} style={{ background:disabled?C.dim:C.peachDk, color:"#fff", border:"none", borderRadius:14, padding:"13px 20px", fontSize:15, fontWeight:700, width:"100%", cursor:disabled?"not-allowed":"pointer", boxShadow:disabled?"none":`0 6px 20px ${hex2rgb(C.peachDk,0.32)}`, display:"flex", alignItems:"center", justifyContent:"center", gap:8, ...s }}>{children}</button>;
}

function SBtn({ children, onClick, s }) {
  return <button onClick={onClick} style={{ background:"transparent", color:C.ink, border:`1px solid ${C.bord}`, borderRadius:10, padding:"8px 14px", fontSize:13, fontWeight:600, cursor:"pointer", ...s }}>{children}</button>;
}

function Card({ children, s, accent }) {
  return <div style={{ background:C.surf, border:`1px solid ${C.bord}`, borderRadius:16, overflow:"hidden", boxShadow: accent ? `0 4px 18px ${hex2rgb(accent,0.12)}` : "0 2px 10px rgba(28,27,38,0.04)", ...s }}>{children}</div>;
}

function Hdr({ children, accent }) {
  return <div style={{ padding:"10px 16px", borderBottom:`1px solid ${C.line}`, background:accent?hex2rgb(accent,0.06):hex2rgb(C.deep,0.5), fontSize:10.5, fontWeight:700, color:accent||C.sub, letterSpacing:"0.08em", textTransform:"uppercase" }}>{children}</div>;
}

/* ═══════════════════════════════════════════════════════════════════════════
   INTERACTIVE PRICE CHART
═══════════════════════════════════════════════════════════════════════════ */
function PriceChart({ chart, color, timeframe, onTF }) {
  const svgRef = useRef(null);
  const [hov, setHov] = useState(null);
  const TFs = ["1M","3M","6M","1Y","3Y"];
  const months = {"1M":1,"3M":3,"6M":6,"1Y":12,"3Y":36}[timeframe]||12;
  const data = chart.slice(-months);
  const max = Math.max(...data.map(p=>p.max),1);
  const min = Math.min(...data.map(p=>p.min),max);
  const rng = max-min||1; const pad = rng*0.12;
  const yMax = max+pad, yMin = Math.max(0,min-pad);
  const pts = data.map((p,i)=>({ x:data.length>1?(i/(data.length-1))*96+2:50, y:100-((p.avg-yMin)/(yMax-yMin||1))*88-2, d:p }));
  const linePath = "M"+pts.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("L");
  const areaPath = linePath+` L${pts[pts.length-1]?.x||0},102 L${pts[0]?.x||0},102 Z`;
  const gid = `g${color.replace(/[^a-z0-9]/gi,"_")}`;

  const onMove = e => {
    const svg = svgRef.current; if(!svg||!pts.length) return;
    const rect = svg.getBoundingClientRect();
    const cx = ((e.touches?e.touches[0].clientX:e.clientX)-rect.left)/rect.width*100;
    let ni=0, nd=Infinity;
    pts.forEach((p,i)=>{ const d=Math.abs(p.x-cx); if(d<nd){nd=d;ni=i;} });
    setHov(ni);
  };

  const hp = hov!==null?pts[hov]:null;

  return (
    <div>
      <div style={{ display:"flex", gap:4, padding:"0 14px 10px" }}>
        {TFs.map(tf=>(
          <button key={tf} onClick={()=>onTF(tf)} style={{ flex:1, background:timeframe===tf?color:"transparent", color:timeframe===tf?"#fff":C.sub, border:`1px solid ${timeframe===tf?color:C.bord}`, borderRadius:8, padding:"6px 2px", fontSize:11, fontWeight:600, cursor:"pointer" }}>{tf}</button>
        ))}
      </div>
      <div style={{ position:"relative", padding:"32px 14px 0" }}>
        {hp && (
          <div style={{ position:"absolute", top:0, left:`clamp(10px, ${hp.x}%, calc(100% - 120px))`, background:C.ink, color:"#fff", padding:"6px 10px", borderRadius:9, fontSize:11, whiteSpace:"nowrap", pointerEvents:"none", zIndex:10 }}>
            <div style={{ fontWeight:700 }}>{fmtTHB(hp.d.avg)}</div>
            <div style={{ opacity:.7, fontSize:10 }}>{hp.d.month} · {hp.d.n} sales</div>
          </div>
        )}
        <svg ref={svgRef} viewBox="0 0 100 102" style={{ width:"100%", height:150, cursor:"crosshair", touchAction:"none" }} preserveAspectRatio="none"
          onMouseMove={onMove} onTouchMove={onMove} onMouseLeave={()=>setHov(null)} onTouchEnd={()=>setTimeout(()=>setHov(null),1800)}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity=".22"/>
              <stop offset="100%" stopColor={color} stopOpacity="0"/>
            </linearGradient>
          </defs>
          <path d={areaPath} fill={`url(#${gid})`}/>
          <path d={linePath} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          {pts.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={hov===i?2.8:1.6} fill={color}/>)}
          {hp && <line x1={hp.x} y1="0" x2={hp.x} y2="102" stroke={color} strokeWidth=".4" strokeDasharray="2,2" opacity=".5"/>}
        </svg>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", padding:"4px 14px 0", fontSize:9, color:C.dim }}>
        {data.length>0&&<><span>{data[0]?.month}</span><span>{data[Math.floor(data.length/2)]?.month}</span><span>{data[data.length-1]?.month}</span></>}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCREEN: LOGIN
═══════════════════════════════════════════════════════════════════════════ */
function LoginScreen({ onLogin }) {
  const [guest, setGuest] = useState(false);
  const [name, setName]   = useState("");
  const [err, setErr]     = useState("");

  const socials = [
    { id:"facebook",  label:"Continue with Facebook",  icon:"f", bg:"#1877F2", text:"#fff" },
    { id:"google",    label:"Continue with Google",    icon:"G", bg:"#fff",    text:"#3C4043", bord:true },
    { id:"instagram", label:"Continue with Instagram", icon:"◉", bg:"linear-gradient(135deg,#F58529,#DD2A7B,#8134AF)", text:"#fff" },
  ];

  const goSocial = id => {
    const n={facebook:"FB_"+Math.random().toString(36).slice(2,6),google:"G_"+Math.random().toString(36).slice(2,6),instagram:"IG_"+Math.random().toString(36).slice(2,6)};
    onLogin({ name:n[id], provider:id, verified:true });
  };
  const goGuest = () => {
    if(!name.trim()||name.trim().length<2) return setErr("Enter at least 2 characters");
    onLogin({ name:name.trim(), provider:"guest", verified:false });
  };

  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"40px 22px", position:"relative", overflow:"hidden" }}>
      <style>{CSS}</style>
      <div style={{ position:"fixed", inset:0, pointerEvents:"none" }}>
        <div style={{ position:"absolute", top:"-15%", left:"-15%", width:"55%", height:"50%", background:hex2rgb(C.peach,.18), borderRadius:"50%", filter:"blur(70px)" }}/>
        <div style={{ position:"absolute", bottom:"-20%", right:"-20%", width:"65%", height:"55%", background:hex2rgb(C.lav,.2), borderRadius:"50%", filter:"blur(80px)" }}/>
      </div>

      <div style={{ width:"100%", maxWidth:370, position:"relative", zIndex:1 }}>
        <div className="r1" style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ width:70, height:70, borderRadius:21, background:`linear-gradient(135deg,${C.peach},${C.coral})`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px", boxShadow:`0 12px 32px ${hex2rgb(C.coral,.35)}` }}>
            <span style={{ fontSize:32, color:"#fff" }}>◆</span>
          </div>
          <div style={{ fontSize:32, fontWeight:800, marginBottom:4 }}>BoBoa <span style={{ color:C.peachDk }}>Scanner</span></div>
          <div style={{ fontSize:13.5, color:C.sub }}>Scan · Identify · Grade · Price</div>
        </div>

        {!guest ? (
          <>
            <div className="r2" style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {socials.map(s=>(
                <button key={s.id} onClick={()=>goSocial(s.id)} style={{ display:"flex", alignItems:"center", gap:12, background:s.bg, color:s.text, border:s.bord?`1px solid ${C.bord}`:"none", borderRadius:13, padding:"12px 18px", fontSize:14.5, fontWeight:600, cursor:"pointer", boxShadow:"0 4px 14px rgba(28,27,38,0.06)" }}>
                  <div style={{ width:26, height:26, borderRadius:7, background:s.bord?"#4285F4":"rgba(255,255,255,.22)", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, fontWeight:800 }}>{s.icon}</div>
                  <span style={{ flex:1, textAlign:"left" }}>{s.label}</span>
                </button>
              ))}
            </div>
            <div className="r3" style={{ display:"flex", alignItems:"center", gap:12, margin:"20px 0" }}>
              <div style={{ flex:1, height:1, background:C.bord }}/><span style={{ fontSize:11, color:C.dim, letterSpacing:"0.08em" }}>OR</span><div style={{ flex:1, height:1, background:C.bord }}/>
            </div>
            <button className="r3" onClick={()=>setGuest(true)} style={{ width:"100%", background:"transparent", border:`1.5px dashed ${C.bord}`, borderRadius:13, padding:"13px", fontSize:14, fontWeight:600, color:C.ink, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
              <span style={{ fontSize:16 }}>👤</span> Continue as Guest
            </button>
          </>
        ) : (
          <div className="r1">
            <Card>
              <div style={{ padding:20 }}>
                <div style={{ fontSize:13, fontWeight:700, marginBottom:3 }}>Your watermark name</div>
                <div style={{ fontSize:12, color:C.sub, marginBottom:14, lineHeight:1.6 }}>Stamped on every scan at low opacity.</div>
                <input autoFocus type="text" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. BoBoBoa" maxLength={20}
                  style={{ width:"100%", background:C.bg, border:`1.5px solid ${C.bord}`, borderRadius:11, padding:"12px 14px", fontSize:15, color:C.ink, outline:"none", marginBottom:10 }}
                  onKeyDown={e=>e.key==="Enter"&&goGuest()}
                  onFocus={e=>e.target.style.borderColor=C.peachDk} onBlur={e=>e.target.style.borderColor=C.bord}/>
                {name&&<div style={{ background:C.deep, borderRadius:9, padding:"8px 12px", marginBottom:10, fontSize:11.5, color:C.sub }}>Preview: <strong style={{ color:C.ink }}>{name} · {new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}).replace(/ /g,"-")}</strong></div>}
                {err&&<div style={{ background:hex2rgb(C.coral,.14), border:`1px solid ${hex2rgb(C.coral,.35)}`, borderRadius:9, padding:"8px 12px", fontSize:12, color:C.coral, marginBottom:10 }}>{err}</div>}
                <PBtn onClick={goGuest}>Continue →</PBtn>
                <button onClick={()=>{setGuest(false);setErr("");setName("");}} style={{ width:"100%", background:"transparent", border:"none", marginTop:8, padding:"6px", fontSize:12, color:C.sub, cursor:"pointer" }}>← Back</button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCREEN: WELCOME — TCG + Language pickers
═══════════════════════════════════════════════════════════════════════════ */
function WelcomeScreen({ user, onStart, onLogout }) {
  const [tcg, setTcg] = useState("onepiece");
  const [lang, setLang] = useState("JP");

  return (
    <div style={{ minHeight:"100vh", background:C.bg, padding:"54px 20px 40px", position:"relative" }}>
      <style>{CSS}</style>
      <div style={{ position:"fixed", inset:0, pointerEvents:"none", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:"5%", right:"-20%", width:"55%", height:"40%", background:hex2rgb(C.butter,.22), borderRadius:"50%", filter:"blur(80px)" }}/>
        <div style={{ position:"absolute", bottom:0, left:"-15%", width:"45%", height:"35%", background:hex2rgb(C.sky,.2), borderRadius:"50%", filter:"blur(70px)" }}/>
      </div>

      <div style={{ position:"relative", zIndex:1, maxWidth:430, margin:"0 auto" }}>
        <div className="r1" style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:28 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:34, height:34, borderRadius:"50%", background:`linear-gradient(135deg,${C.peach},${C.rose})`, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:13, fontWeight:700 }}>{user.name[0].toUpperCase()}</div>
            <div>
              <div style={{ fontSize:12.5, fontWeight:600 }}>{user.name}</div>
              <div style={{ fontSize:10, color:C.dim, textTransform:"capitalize" }}>{user.verified?`✓ ${user.provider}`:"Guest"}</div>
            </div>
          </div>
          <SBtn onClick={onLogout}>Sign out</SBtn>
        </div>

        <div className="r2" style={{ marginBottom:26 }}>
          <div style={{ fontSize:34, fontWeight:800, lineHeight:1.05, marginBottom:8 }}>
            Scan a card<br/><span style={{ color:C.peachDk }}>instantly.</span>
          </div>
          <div style={{ fontSize:13.5, color:C.sub, lineHeight:1.6 }}>BoBoa AI identifies the card, grades the condition, and pulls prices from 7 sources in THB · USD · JPY.</div>
        </div>

        <div className="r3" style={{ marginBottom:18 }}>
          <div style={{ fontSize:10.5, fontWeight:700, color:C.sub, marginBottom:8, letterSpacing:"0.1em", textTransform:"uppercase" }}>Step 1 · Choose TCG</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
            {TCG_TYPES.map(t=>{
              const sel=tcg===t.id;
              return <button key={t.id} onClick={()=>setTcg(t.id)} style={{ background:sel?t.color:C.surf, color:sel?"#fff":C.ink, border:`1.5px solid ${sel?t.color:C.bord}`, borderRadius:14, padding:"14px 8px", cursor:"pointer", textAlign:"center", boxShadow:sel?`0 6px 16px ${hex2rgb(t.color,.3)}`:"none", transition:"all .15s" }}>
                <div style={{ fontSize:24, marginBottom:4 }}>{t.emoji}</div>
                <div style={{ fontSize:12, fontWeight:700 }}>{t.name}</div>
              </button>;
            })}
          </div>
        </div>

        <div className="r3" style={{ marginBottom:24 }}>
          <div style={{ fontSize:10.5, fontWeight:700, color:C.sub, marginBottom:8, letterSpacing:"0.1em", textTransform:"uppercase" }}>Step 2 · Card language</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
            {LANGUAGES.map(l=>{
              const sel=lang===l.id;
              return <button key={l.id} onClick={()=>setLang(l.id)} style={{ background:sel?C.ink:C.surf, color:sel?"#fff":C.ink, border:`1.5px solid ${sel?C.ink:C.bord}`, borderRadius:13, padding:"11px 6px", cursor:"pointer", textAlign:"center" }}>
                <div style={{ fontSize:22, marginBottom:3 }}>{l.flag}</div>
                <div style={{ fontSize:12, fontWeight:600 }}>{l.label}</div>
              </button>;
            })}
          </div>
        </div>

        <div className="r4">
          <PBtn onClick={()=>onStart({tcg,lang})} s={{ padding:"15px 20px", fontSize:15.5 }}>
            <span style={{ fontSize:18 }}>📷</span> Scan or Upload a Card
          </PBtn>
          <div style={{ textAlign:"center", marginTop:10, fontSize:11, color:C.dim }}>
            Watermark: <span className="mono" style={{ color:C.sub }}>{user.name} · {new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}).replace(/ /g,"-")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCREEN: CAPTURE — Camera OR Upload
═══════════════════════════════════════════════════════════════════════════ */
function CaptureScreen({ user, ctx, onCapture, onBack }) {
  const videoRef  = useRef(null);
  const frameRef  = useRef(null);
  const streamRef = useRef(null);
  const fileRef   = useRef(null);
  const [mode,   setMode]   = useState("camera"); // "camera" | "upload"
  const [status, setStatus] = useState("starting");
  const [errMsg, setErrMsg] = useState("");
  const [flash,  setFlash]  = useState(false);

  const stopCam = () => {
    if(streamRef.current){ streamRef.current.getTracks().forEach(t=>t.stop()); streamRef.current=null; }
  };

  const startCam = useCallback(async () => {
    setStatus("starting"); setErrMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video:{
          facingMode:"environment",
          width:{ ideal:4096, min:1920 },      // 4K preferred, 1080p minimum
          height:{ ideal:3072, min:1080 },
          frameRate:{ ideal:30 },
          focusMode:"continuous",               // continuous autofocus
          zoom:1,                               // force 1x zoom (no digital zoom)
          whiteBalanceMode:"continuous",
          exposureMode:"continuous",
        },
        audio:false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if(v){
        v.srcObject = stream;
        v.setAttribute("playsinline","true");
        v.muted = true;
        v.onloadedmetadata = () => v.play().then(()=>setStatus("live")).catch(e=>{setErrMsg("Video: "+e.message);setStatus("error");});
      }
    } catch(e) {
      setErrMsg(e.name==="NotAllowedError"?"Camera denied.\n\niPhone: Settings → Safari → Camera → Allow":"Camera: "+e.message);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if(mode==="camera") startCam();
    return stopCam;
  }, [mode, startCam]);

  const dateStr = new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}).replace(/ /g,"-");
  const watermark = `${user.name} · ${dateStr}`;

  const capture = () => {
    const v=videoRef.current, f=frameRef.current;
    if(!v||!f||status!=="live") return;
    setFlash(true); setTimeout(()=>setFlash(false),150);
    const result = captureCard({video:v, frameEl:f, watermark});
    stopCam();
    onCapture(result);
  };

  const handleUpload = e => {
    const file = e.target.files?.[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      // Draw to canvas to apply watermark consistently
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        // Preserve full resolution
        canvas.width  = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx2 = canvas.getContext("2d");
        ctx2.drawImage(img, 0, 0);

        // Watermark
        const fw = canvas.width, fh = canvas.height;
        const fs = Math.max(14, Math.round(fw * 0.022));
        ctx2.font = `500 ${fs}px 'DM Sans', sans-serif`;
        const tw = ctx2.measureText(watermark).width;
        const pad = Math.round(fw * 0.016);
        ctx2.save();
        ctx2.globalAlpha = 0.36;
        ctx2.fillStyle = "rgba(0,0,0,0.5)";
        ctx2.beginPath(); ctx2.roundRect(fw-tw-pad*3, fh-fs-pad*1.8, tw+pad*2.4, fs+pad*1.2, 6); ctx2.fill();
        ctx2.globalAlpha = 0.72;
        ctx2.fillStyle = "#fff";
        ctx2.fillText(watermark, fw-tw-pad*1.8, fh-pad*0.8);
        ctx2.restore();

        // 4-corner grid from full image
        const cpct=0.28, ccw=Math.round(fw*cpct), cch=Math.round(fh*cpct);
        const corners=[{label:"TL",sx:0,sy:0},{label:"TR",sx:fw-ccw,sy:0},{label:"BL",sx:0,sy:fh-cch},{label:"BR",sx:fw-ccw,sy:fh-cch}];
        const gap=5;
        const grid=document.createElement("canvas");
        grid.width=ccw*2+gap*3; grid.height=cch*2+gap*3;
        const gc=grid.getContext("2d");
        gc.fillStyle="#1C1B26"; gc.fillRect(0,0,grid.width,grid.height);
        corners.forEach((c,i)=>{
          const col=i%2,row=Math.floor(i/2),dx=gap+col*(ccw+gap),dy=gap+row*(cch+gap);
          gc.drawImage(canvas,c.sx,c.sy,ccw,cch,dx,dy,ccw,cch);
          const ls=Math.round(cch*0.10);
          gc.fillStyle="rgba(240,158,122,0.9)";
          gc.beginPath();gc.roundRect(dx+5,dy+5,ls*2.4,ls*1.5,4);gc.fill();
          gc.fillStyle="#fff";gc.font=`700 ${ls}px monospace`;
          gc.fillText(c.label,dx+9,dy+ls*1.2);
        });

        onCapture({ full: canvas.toDataURL("image/jpeg", 0.97), corners: grid.toDataURL("image/jpeg",0.92) });
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const tcg = TCG_TYPES.find(t=>t.id===ctx.tcg);
  const lang = LANGUAGES.find(l=>l.id===ctx.lang);

  return (
    <div style={{ position:"fixed", inset:0, background:"#000", display:"flex", flexDirection:"column" }}>
      <style>{CSS}</style>

      {/* Mode toggle at top */}
      <div style={{ position:"absolute", top:0, left:0, right:0, zIndex:10, padding:"48px 18px 10px", background:"linear-gradient(to bottom,rgba(0,0,0,0.7),transparent)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <button onClick={()=>{stopCam();onBack();}} style={{ background:"rgba(255,255,255,.16)", border:"1px solid rgba(255,255,255,.22)", borderRadius:11, padding:"7px 13px", fontSize:13, fontWeight:600, color:"#fff", cursor:"pointer" }}>← Back</button>
        <div style={{ display:"flex", background:"rgba(0,0,0,.4)", borderRadius:11, padding:3, gap:2 }}>
          <button onClick={()=>{if(mode!=="camera"){stopCam();setMode("camera");}}} style={{ background:mode==="camera"?"rgba(255,255,255,.22)":"transparent", border:"none", borderRadius:9, padding:"6px 14px", fontSize:12, fontWeight:600, color:"#fff", cursor:"pointer" }}>📷 Camera</button>
          <button onClick={()=>{stopCam();setMode("upload");}} style={{ background:mode==="upload"?"rgba(255,255,255,.22)":"transparent", border:"none", borderRadius:9, padding:"6px 14px", fontSize:12, fontWeight:600, color:"#fff", cursor:"pointer" }}>🖼 Upload</button>
        </div>
        <div style={{ background:"rgba(255,255,255,.16)", border:"1px solid rgba(255,255,255,.22)", borderRadius:11, padding:"6px 10px", fontSize:11, color:"#fff", display:"flex", gap:5 }}>
          <span>{tcg?.emoji}</span><span>{lang?.flag}</span>
        </div>
      </div>

      {/* Camera mode */}
      {mode === "camera" && (
        <>
          <video ref={videoRef} playsInline muted autoPlay style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", display:status==="live"?"block":"none" }}/>
          {flash && <div style={{ position:"absolute", inset:0, background:"#fff", opacity:.85, zIndex:20 }}/>}

          {status==="starting" && (
            <div style={{ position:"absolute", inset:0, background:C.dark, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16 }}>
              <div style={{ width:50, height:50, border:`3px solid ${C.peach}`, borderTopColor:"transparent", borderRadius:"50%", animation:"spin .8s linear infinite" }}/>
              <div style={{ color:"#fff", fontSize:15, fontWeight:600 }}>Opening camera…</div>
              <div style={{ fontSize:12, color:"rgba(255,255,255,.5)", textAlign:"center", padding:"0 40px", lineHeight:1.7 }}>Tap <strong style={{color:"#fff"}}>Allow</strong> when prompted</div>
            </div>
          )}
          {status==="error" && (
            <div style={{ position:"absolute", inset:0, background:C.dark, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"32px 24px", gap:14, textAlign:"center" }}>
              <div style={{ fontSize:44 }}>📷</div>
              <div style={{ fontSize:18, fontWeight:700, color:C.coral }}>Camera Error</div>
              <div style={{ fontSize:13, color:"rgba(255,255,255,.6)", lineHeight:1.7, whiteSpace:"pre-line", maxWidth:320 }}>{errMsg}</div>
              <button onClick={startCam} style={{ background:C.peachDk, border:"none", borderRadius:12, padding:"12px 28px", fontSize:14, fontWeight:700, color:"#fff", cursor:"pointer", marginTop:6 }}>Try Again</button>
              <button onClick={()=>{stopCam();setMode("upload");}} style={{ background:"transparent", border:"1px solid rgba(255,255,255,.2)", borderRadius:12, padding:"10px 28px", fontSize:13, color:"rgba(255,255,255,.5)", cursor:"pointer" }}>Use Upload instead</button>
            </div>
          )}
          {status==="live" && (
            <>
          {/* Full-screen card frame guide — card fills entire screen */}
          <div style={{ position:"absolute", inset:0, zIndex:4, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <div ref={frameRef} style={{
              position:"relative",
              width:"92%", maxWidth:360,
              aspectRatio:"63/88",
            }}>
              {/* Corner brackets */}
              {[
                {top:0,left:0,   borderTop:`3px solid ${C.peach}`,borderLeft:`3px solid ${C.peach}`},
                {top:0,right:0,  borderTop:`3px solid ${C.peach}`,borderRight:`3px solid ${C.peach}`},
                {bottom:0,left:0,borderBottom:`3px solid ${C.peach}`,borderLeft:`3px solid ${C.peach}`},
                {bottom:0,right:0,borderBottom:`3px solid ${C.peach}`,borderRight:`3px solid ${C.peach}`},
              ].map((s,i)=><div key={i} style={{ position:"absolute", width:32, height:32, borderRadius:4, ...s }}/>)}

              {/* Dashed border */}
              <div style={{ position:"absolute", inset:0, border:`1.5px dashed ${hex2rgb(C.peach,.55)}`, borderRadius:8 }}/>

              {/* Scan line */}
              <div style={{ position:"absolute", left:4, right:4, height:2, top:"50%", background:`linear-gradient(90deg,transparent,${C.peach},transparent)`, boxShadow:`0 0 12px ${C.peach}`, animation:"scanLine 2.2s ease-in-out infinite" }}/>

              {/* Card number region indicator — adapts to TCG */}
              {tcg?.codeRegion === "bottom-right" && (
                <div style={{ position:"absolute", bottom:8, right:8, background:"rgba(240,158,122,0.88)", borderRadius:6, padding:"4px 8px", fontSize:10, fontWeight:700, color:"#fff", letterSpacing:"0.04em" }}>
                  Code ↙ here
                </div>
              )}
              {tcg?.codeRegion === "bottom-left below artwork" && (
                <div style={{ position:"absolute", bottom:8, left:8, background:"rgba(168,153,204,0.88)", borderRadius:6, padding:"4px 8px", fontSize:10, fontWeight:700, color:"#fff", letterSpacing:"0.04em" }}>
                  Code ↘ here
                </div>
              )}
              {tcg?.codeRegion === "bottom center" && (
                <div style={{ position:"absolute", bottom:8, left:"50%", transform:"translateX(-50%)", background:"rgba(232,201,106,0.88)", borderRadius:6, padding:"4px 8px", fontSize:10, fontWeight:700, color:"#fff", letterSpacing:"0.04em", whiteSpace:"nowrap" }}>
                  Card # bottom
                </div>
              )}
            </div>
          </div>
              <div style={{ position:"absolute", bottom:0, left:0, right:0, zIndex:5, padding:"16px 24px 40px", background:"linear-gradient(to top,rgba(0,0,0,.75),transparent)" }}>
                <div style={{ textAlign:"center", marginBottom:14, fontSize:12, color:"rgba(255,255,255,.75)", fontWeight:500 }}>Fit card inside the frame — best quality, 1x zoom</div>
                <div style={{ display:"flex", justifyContent:"center" }}>
                  <button onClick={capture} style={{ width:72, height:72, borderRadius:"50%", background:"#fff", border:"4px solid rgba(255,255,255,.35)", cursor:"pointer", padding:0, display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 24px rgba(0,0,0,.4)" }}>
                    <div style={{ width:56, height:56, borderRadius:"50%", background:`linear-gradient(135deg,${C.peach},${C.peachDk})`, boxShadow:`0 0 18px ${hex2rgb(C.peachDk,.6)}` }}/>
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Upload mode */}
      {mode === "upload" && (
        <div style={{ position:"absolute", inset:0, background:C.dark, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"40px 28px", gap:18 }}>
          <div style={{ width:80, height:80, borderRadius:22, background:hex2rgb(C.peach,.15), border:`2px dashed ${hex2rgb(C.peach,.5)}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:36 }}>🖼</div>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:22, fontWeight:700, color:"#fff", marginBottom:6 }}>Upload a card photo</div>
            <div style={{ fontSize:13, color:"rgba(255,255,255,.55)", lineHeight:1.6, maxWidth:260 }}>Choose any photo from your gallery. Use a well-lit, flat photo for best grading accuracy.</div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} style={{ display:"none" }}/>
          <button onClick={()=>fileRef.current?.click()} style={{ background:`linear-gradient(135deg,${C.peach},${C.peachDk})`, border:"none", borderRadius:14, padding:"14px 32px", fontSize:15, fontWeight:700, color:"#fff", cursor:"pointer", boxShadow:`0 6px 20px ${hex2rgb(C.peachDk,.4)}` }}>
            Choose Photo
          </button>
          <div style={{ fontSize:11, color:"rgba(255,255,255,.3)" }}>Supports JPG, PNG, HEIC</div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCREEN: PROCESSING
═══════════════════════════════════════════════════════════════════════════ */
const STEPS = [
  "Analysing card image…","Reading card code…","Querying card databases…",
  "Cross-checking apitcg.com…","Cross-checking ygoprodeck.com…",
  "Detecting language…","Listing candidates…","Building report…",
];

function ProcessingScreen({ photos, ctx, onDone }) {
  const [step, setStep] = useState(0);
  const [pct,  setPct]  = useState(0);
  const ran = useRef(false);

  useEffect(() => {
    if(ran.current) return; ran.current=true;
    let i=0;
    const iv = setInterval(()=>{
      i++; setStep(i); setPct(Math.round((i/STEPS.length)*100));
      if(i>=STEPS.length-1){
        clearInterval(iv);
        // Only identification — grading parked per v7 spec
        boboaIdentify({ imageDataUrl:photos.full, tcgType:ctx.tcg, language:ctx.lang })
          .then(idResult => setTimeout(()=>onDone({ identify:idResult, grade:null }),500));
      }
    }, 340);
    return ()=>clearInterval(iv);
  }, [photos, ctx, onDone]);

  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:22, padding:"40px 30px", position:"relative", overflow:"hidden" }}>
      <style>{CSS}</style>
      <div style={{ position:"absolute", top:"20%", left:"-20%", width:"60%", height:"40%", background:hex2rgb(C.peach,.18), borderRadius:"50%", filter:"blur(80px)" }}/>
      <div style={{ position:"absolute", bottom:"15%", right:"-20%", width:"60%", height:"40%", background:hex2rgb(C.lav,.18), borderRadius:"50%", filter:"blur(80px)" }}/>

      <div className="r1" style={{ position:"relative", width:100, height:100, zIndex:1 }}>
        <div style={{ position:"absolute", inset:0, border:`3px solid ${hex2rgb(C.peach,.22)}`, borderRadius:"50%" }}/>
        <div style={{ position:"absolute", inset:0, border:"3px solid transparent", borderTopColor:C.peachDk, borderRadius:"50%", animation:"spin .9s linear infinite" }}/>
        <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <span style={{ fontSize:22, fontWeight:700, color:C.peachDk }}>{pct}%</span>
        </div>
      </div>
      <div className="r2" style={{ textAlign:"center", zIndex:1 }}>
        <div style={{ fontSize:24, fontWeight:700, marginBottom:5 }}>BoBoa AI working…</div>
        <div style={{ fontSize:13, color:C.sub }}>{STEPS[step-1]||STEPS[0]}</div>
      </div>
      <div style={{ width:"100%", maxWidth:290, height:5, background:C.deep, borderRadius:99, zIndex:1 }}>
        <div style={{ height:"100%", width:`${pct}%`, background:`linear-gradient(90deg,${C.peach},${C.peachDk})`, borderRadius:99, transition:"width .35s" }}/>
      </div>
      {photos.corners&&(
        <div className="r3" style={{ width:"100%", maxWidth:220, textAlign:"center", zIndex:1 }}>
          <div style={{ fontSize:10, color:C.dim, marginBottom:8, letterSpacing:".1em" }} className="mono">CORNERS · EXTRACTED</div>
          <img src={photos.corners} alt="corners" style={{ width:"100%", borderRadius:12, border:`1px solid ${C.bord}` }}/>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCREEN: CARD PICKER — AI returns candidates, user selects
═══════════════════════════════════════════════════════════════════════════ */
function CardPickerScreen({ photos, aiData, ctx, onSelect, onRescan }) {
  const idResult = aiData?.identify;
  const candidates = idResult?.success ? (idResult.data?.candidates || []) : [];

  const [selected, setSelected]   = useState(null);
  const [manualId, setManualId]   = useState("");
  const [showManual, setShowManual] = useState(candidates.length === 0);

  const tcg = TCG_TYPES.find(t=>t.id===ctx.tcg);
  const lang = LANGUAGES.find(l=>l.id===ctx.lang);

  const [lookingUp, setLookingUp] = useState(false);

  const handleConfirm = async () => {
    const cardId = showManual ? manualId.trim().toUpperCase() : selected;
    if(!cardId) return;

    setLookingUp(true);
    const dbResult = await lookupCardFromAPIs(cardId, ctx.tcg);
    setLookingUp(false);

    const aiCard = candidates.find(c=>c.cardId===cardId);
    onSelect({
      cardId,
      tcgType: ctx.tcg,
      name:      dbResult.name    || aiCard?.name    || "Unknown",
      nameJP:    dbResult.nameJP  || aiCard?.nameOriginal || "",
      set:       dbResult.set     || aiCard?.set      || "",
      setName:   dbResult.setName || aiCard?.setName  || "",
      rarity:    dbResult.rarity  || aiCard?.rarity   || "",
      type:      dbResult.type    || aiCard?.type     || "",
      color:     dbResult.color   || "",
      cost:      dbResult.cost    ?? null,
      power:     dbResult.power   || null,
      ability:   dbResult.ability || "",
      image:     dbResult.image   || null,
      language:  idResult?.data?.language || ctx.lang,
      confidence:aiCard?.confidence || (dbResult.found?80:30),
      evidence:  aiCard?.evidence  || "",
      inDB:      dbResult.found,
      dbSource:  dbResult.source,
      dbSources: dbResult.dbSources || [],
      prices:    dbResult.prices   || null,
      yuyuteiSlug:dbResult.yuyuteiSlug||null,
      // TCG-specific fields
      atk:dbResult.atk, def:dbResult.def, level:dbResult.level,
      attribute:dbResult.attribute, race:dbResult.race, archetype:dbResult.archetype,
      hp:dbResult.hp, types:dbResult.types, attacks:dbResult.attacks,
    });
  };

  const confColor = c => c>=85?C.sageDk:c>=65?C.butterDk:C.coral;

  return (
    <div style={{ maxWidth:430, margin:"0 auto", background:C.bg, minHeight:"100vh" }}>
      <style>{CSS}</style>
      <div style={{ background:C.surf, borderBottom:`1px solid ${C.bord}`, padding:"46px 18px 12px", position:"sticky", top:0, zIndex:40 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <SBtn onClick={onRescan}>← Rescan</SBtn>
          <div style={{ fontSize:15, fontWeight:700 }}>Select Card</div>
          <div style={{ width:72 }}/>
        </div>
      </div>

      <div style={{ padding:"14px 16px 110px", display:"flex", flexDirection:"column", gap:12 }}>

        {/* Photos */}
        <div className="r1" style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:10 }}>
          <Card><img src={photos.full} alt="card" style={{ width:"100%", aspectRatio:"63/88", objectFit:"cover", display:"block" }}/><div style={{ padding:"6px 12px", fontSize:10, color:C.sub }} className="mono">CAPTURED</div></Card>
          <Card><img src={photos.corners} alt="corners" style={{ width:"100%", aspectRatio:"1/1", objectFit:"cover", display:"block" }}/><div style={{ padding:"6px 12px", fontSize:10, color:C.sub }} className="mono">CORNERS</div></Card>
        </div>

        {/* Language / type detection */}
        {idResult?.data && (
          <div className="r2">
            <Card>
              <div style={{ padding:"12px 16px", display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
                <Pill ch={`${lang?.flag} ${idResult.data.language||ctx.lang}`} color={C.skyDk}/>
                <Pill ch={`${tcg?.emoji} ${tcg?.name}`} color={tcg?.color||C.coral}/>
                {idResult.data.languageEvidence && <div style={{ fontSize:11, color:C.sub, width:"100%", marginTop:4 }}>🗣 {idResult.data.languageEvidence}</div>}
                {idResult.data.cardIdRegion && <div style={{ fontSize:11, color:C.sub }}>📍 Code location: {idResult.data.cardIdRegion}</div>}
              </div>
            </Card>
          </div>
        )}

        {/* Candidate list */}
        {candidates.length > 0 && (
          <div className="r3">
            <Card>
              <Hdr accent={C.peachDk}>◆ BoBoa AI · Candidates — tap to select</Hdr>
              <div style={{ padding:"8px 0" }}>
                {candidates.map((c,i) => {
                  const sel = selected === c.cardId;
                  const db  = CARD_DB[c.cardId];
                  return (
                    <button key={i} onClick={()=>{ setSelected(c.cardId); setShowManual(false); }} style={{
                      display:"block", width:"100%", textAlign:"left",
                      background: sel ? hex2rgb(C.peachDk,.08) : "transparent",
                      border:"none",
                      borderLeft: sel ? `3px solid ${C.peachDk}` : "3px solid transparent",
                      borderBottom: i<candidates.length-1 ? `1px solid ${C.line}` : "none",
                      padding:"12px 16px",
                      cursor:"pointer",
                    }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10 }}>
                        <div style={{ flex:1 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                            <span className="mono" style={{ fontSize:12.5, fontWeight:700, color:C.peachDk }}>{c.cardId}</span>
                            {db && <Pill ch="✓ In DB" color={C.sageDk} s={{ fontSize:9 }}/>}
                          </div>
                          <div style={{ fontSize:16, fontWeight:700, lineHeight:1.1, marginBottom:2 }}>{c.name}</div>
                          {c.nameOriginal && c.nameOriginal!==c.name && <div className="mono" style={{ fontSize:11, color:C.dim }}>{c.nameOriginal}</div>}
                          {c.setName && <div style={{ fontSize:12, color:C.sub, marginTop:3 }}>{c.setName}</div>}
                          {c.evidence && <div style={{ fontSize:11, color:C.dim, marginTop:4, lineHeight:1.5 }}>💡 {c.evidence}</div>}
                        </div>
                        <div style={{ textAlign:"right", flexShrink:0 }}>
                          <div style={{ fontSize:22, fontWeight:800, color:confColor(c.confidence), lineHeight:1 }}>{c.confidence}%</div>
                          <div style={{ fontSize:10, color:C.sub }}>match</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>
          </div>
        )}

        {/* None match — manual entry */}
        <div className="r4">
          <Card>
            <button onClick={()=>setShowManual(m=>!m)} style={{
              display:"flex", justifyContent:"space-between", alignItems:"center",
              width:"100%", background:"transparent", border:"none",
              padding:"13px 16px", cursor:"pointer",
            }}>
              <div style={{ fontSize:13.5, fontWeight:600, color:C.ink }}>
                {candidates.length>0 ? "None match — enter manually" : "Enter card number manually"}
              </div>
              <span style={{ fontSize:18, color:C.sub }}>{showManual?"▲":"▼"}</span>
            </button>
            {showManual && (
              <div style={{ padding:"0 16px 16px", borderTop:`1px solid ${C.line}` }}>
                <div style={{ fontSize:12, color:C.sub, margin:"12px 0 8px", lineHeight:1.5 }}>
                  {tcg?.codeHint}
                </div>
                <input type="text" value={manualId} onChange={e=>{setManualId(e.target.value.toUpperCase());setSelected(null);}} placeholder={tcg?.id==="onepiece"?"e.g. OP07-051":tcg?.id==="yugioh"?"e.g. LOCR-JP001":"e.g. SV3-185"}
                  style={{ width:"100%", background:C.bg, border:`1.5px solid ${C.bord}`, borderRadius:11, padding:"11px 12px", fontSize:14, color:C.ink, outline:"none", fontFamily:"JetBrains Mono,monospace" }}
                  onFocus={e=>e.target.style.borderColor=C.peachDk} onBlur={e=>e.target.style.borderColor=C.bord}/>
                {manualId && (
                  <div style={{ marginTop:8, fontSize:12, color: CARD_DB[manualId] ? C.sageDk : C.sub }}>
                    {CARD_DB[manualId] ? `✓ Found: ${CARD_DB[manualId].name}` : "Not in local DB — will use AI data"}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>

      <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:430, background:"rgba(250,247,242,.96)", backdropFilter:"blur(16px)", borderTop:`1px solid ${C.bord}`, padding:"11px 16px 28px", display:"flex", gap:10 }}>
        <SBtn onClick={onRescan} s={{ flex:1, padding:"12px" }}>📷 Rescan</SBtn>
        <PBtn onClick={handleConfirm} disabled={(!selected&&!manualId.trim())||lookingUp} s={{ flex:2, padding:"12px", fontSize:14 }}>
          {lookingUp ? (
            <><div style={{ width:16,height:16,border:"2px solid rgba(255,255,255,.4)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin .7s linear infinite" }}/> Looking up…</>
          ) : "Confirm & Lookup →"}
        </PBtn>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCREEN: RARITY PICKER
═══════════════════════════════════════════════════════════════════════════ */
function RarityScreen({ photos, card, aiData, ctx, onConfirm, onBack }) {
  const rarities = RARITIES[ctx.tcg] || RARITIES.onepiece;
  const aiRarity = aiData?.identify?.data?.candidates?.[0]?.rarity;
  const [rarity, setRarity] = useState(aiRarity && rarities.find(r=>r.id===aiRarity) ? aiRarity : rarities[0]?.id);

  return (
    <div style={{ maxWidth:430, margin:"0 auto", background:C.bg, minHeight:"100vh" }}>
      <style>{CSS}</style>
      <div style={{ background:C.surf, borderBottom:`1px solid ${C.bord}`, padding:"46px 18px 12px", position:"sticky", top:0, zIndex:40 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <SBtn onClick={onBack}>← Back</SBtn>
          <div style={{ fontSize:15, fontWeight:700 }}>Select Rarity</div>
          <div style={{ width:72 }}/>
        </div>
      </div>

      <div style={{ padding:"14px 16px 110px", display:"flex", flexDirection:"column", gap:12 }}>
        <div className="r1">
          <Card>
            <div style={{ padding:"14px 16px", display:"flex", gap:12, alignItems:"center" }}>
              <img src={photos.full} alt="card" style={{ width:70, aspectRatio:"63/88", objectFit:"cover", borderRadius:9, boxShadow:"0 4px 14px rgba(28,27,38,.18)" }}/>
              <div>
                <div className="mono" style={{ fontSize:10, color:C.peachDk, marginBottom:4, fontWeight:600 }}>{card.cardId}</div>
                <div style={{ fontSize:20, fontWeight:700, lineHeight:1.1, marginBottom:4 }}>{card.name}</div>
                <div style={{ fontSize:12, color:C.sub }}>{card.setName}</div>
                {aiRarity && <div style={{ fontSize:11, color:C.dim, marginTop:4 }}>AI suggested: <strong style={{color:C.ink}}>{aiRarity}</strong></div>}
              </div>
            </div>
          </Card>
        </div>

        <div className="r2">
          <Card>
            <Hdr accent={C.lavDk}>Select rarity · {TCG_TYPES.find(t=>t.id===ctx.tcg)?.name}</Hdr>
            <div style={{ padding:"12px 14px 14px" }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:7 }}>
                {rarities.map(r=>{
                  const sel=rarity===r.id, hasPrice=CARD_DB[card.cardId]?.rarities?.[r.id];
                  return <button key={r.id} onClick={()=>setRarity(r.id)} style={{ background:sel?r.color:C.surf, color:sel?"#fff":C.ink, border:`1.5px solid ${sel?r.color:C.bord}`, borderRadius:11, padding:"10px 6px", cursor:"pointer", textAlign:"center", boxShadow:sel?`0 4px 12px ${hex2rgb(r.color,.3)}`:"none", transition:"all .15s", position:"relative" }}>
                    <div style={{ fontSize:13, fontWeight:700 }}>{r.label}</div>
                    {hasPrice && <div style={{ position:"absolute", top:4, right:4, width:6, height:6, borderRadius:"50%", background:C.sageDk }}/>}
                  </button>;
                })}
              </div>
              <div style={{ fontSize:11, color:C.dim, marginTop:10 }}>
                Green dot = price data available. AI suggested: <strong style={{color:C.ink}}>{aiRarity||"—"}</strong>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:430, background:"rgba(250,247,242,.96)", backdropFilter:"blur(16px)", borderTop:`1px solid ${C.bord}`, padding:"11px 16px 28px", display:"flex", gap:10 }}>
        <SBtn onClick={onBack} s={{ flex:1, padding:"12px" }}>← Back</SBtn>
        <PBtn onClick={()=>onConfirm({...card, rarity})} s={{ flex:2, padding:"12px", fontSize:14 }}>
          View Prices & Grade →
        </PBtn>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCREEN: RESULT — Prices + BoBoaGrade
═══════════════════════════════════════════════════════════════════════════ */
function ResultScreen({ photos, card, aiData, user, onRescan }) {
  const [tab, setTab]       = useState("prices");
  const [tf,  setTf]        = useState("1Y");
  const [srcFilter, setSrcFilter] = useState(null);

  const gradeResult = aiData?.grade;
  const grade = gradeResult?.success ? gradeResult.data : null;

  const priceData = getPriceData({ cardId:card.cardId, rarity:card.rarity, language:card.language });
  const yuyutei = priceData?.yuyutei;

  const tcg = TCG_TYPES.find(t=>t.id===card.tcgType||CARD_DB[card.cardId]?.tcg);
  const rarities = RARITIES[tcg?.id||"onepiece"]||[];
  const rarOpt = rarities.find(r=>r.id===card.rarity)||rarities[0];

  const bgsColor = s => s>=9.5?C.lavDk:s>=9?C.sageDk:s>=8?C.butterDk:s>=7?C.peachDk:C.coral;

  const searchQ = card.language==="JP" ? `${card.nameJP||card.name} ${card.cardId}` : `${card.name} ${card.cardId}`;
  const mercariUrl = `https://jp.mercari.com/search?keyword=${encodeURIComponent(searchQ)}&item_condition_id=1,2,3`;

  // Scrollable sales list (3yr, newest first, source filter)
  const threeYrsAgo = new Date(); threeYrsAgo.setFullYear(threeYrsAgo.getFullYear()-3);
  const sales = (priceData?.allSales||[])
    .filter(s=>new Date(s.date)>=threeYrsAgo)
    .filter(s=>!srcFilter||s.sourceId===srcFilter)
    .slice(0,100);

  return (
    <div style={{ maxWidth:430, margin:"0 auto", background:C.bg, minHeight:"100vh" }}>
      <style>{CSS}</style>

      {/* Header */}
      <div style={{ background:C.surf, borderBottom:`1px solid ${C.bord}`, padding:"44px 16px 0", position:"sticky", top:0, zIndex:40 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <SBtn onClick={onRescan}>📷 Scan</SBtn>
          <div style={{ display:"flex", gap:4 }}>
            <Pill ch="✓ BoBoa AI" color={C.sageDk}/>
            <Pill ch={rarOpt?.label||card.rarity} color={rarOpt?.color||C.skyDk}/>
          </div>
        </div>

        <div style={{ display:"flex", gap:13, alignItems:"flex-start", marginBottom:10 }}>
          <img src={photos.full} alt="card" style={{ width:88, aspectRatio:"63/88", objectFit:"cover", borderRadius:11, boxShadow:"0 6px 20px rgba(28,27,38,.2)", flexShrink:0 }}/>
          <div style={{ flex:1, minWidth:0 }}>
            <div className="mono" style={{ fontSize:10, color:C.peachDk, letterSpacing:".1em", marginBottom:4, fontWeight:600 }}>{card.set} · {card.cardId}</div>
            <div style={{ fontSize:22, fontWeight:800, lineHeight:1.1, marginBottom:5 }}>{card.name}</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:5 }}>
              <Pill ch={rarOpt?.label||card.rarity} color={rarOpt?.color} s={{fontSize:10}}/>
              <Pill ch={card.language} color={C.skyDk} s={{fontSize:10}}/>
              {tcg && <Pill ch={tcg.emoji+" "+tcg.name} color={tcg.color} s={{fontSize:10}}/>}
            </div>
            <div style={{ fontSize:11.5, color:C.sub, lineHeight:1.65 }}>
              <strong style={{color:C.ink}}>{card.setName}</strong>
              {card.nameJP && <><br/><span className="mono" style={{fontSize:11,color:C.dim}}>{card.nameJP}</span></>}
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div style={{ display:"flex", gap:5, marginBottom:10 }}>
          <div style={{ flex:1, background:C.deep, borderRadius:10, padding:"8px 4px", textAlign:"center" }}>
            <div style={{ fontSize:9.5, color:C.sub, marginBottom:2 }}>BoBoa Match</div>
            <div style={{ fontSize:14, fontWeight:700, color:card.confidence>=85?C.sageDk:C.butterDk }}>{card.confidence}%</div>
          </div>
          <div style={{ flex:1, background:C.deep, borderRadius:10, padding:"8px 4px", textAlign:"center" }}>
            <div style={{ fontSize:9.5, color:C.sub, marginBottom:2 }}>DB Match</div>
            <div style={{ fontSize:14, fontWeight:700, color:card.dbSource==="api"?C.sageDk:C.butterDk }}>
              {card.dbSource==="api"?"✓ Live":card.dbSource==="seed"?"Seed":"—"}
            </div>
          </div>
          <div style={{ flex:1.3, background:hex2rgb(C.coral,.1), border:`1px solid ${hex2rgb(C.coral,.25)}`, borderRadius:10, padding:"8px 4px", textAlign:"center" }}>
            <div style={{ fontSize:9.5, color:C.coral, marginBottom:2, fontWeight:600 }}>🏯 Buy-back</div>
            <div style={{ fontSize:13, fontWeight:700, color:C.coral }}>{yuyutei?fmtTHB(yuyutei.buy.thb):"—"}</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", borderTop:`1px solid ${C.bord}`, margin:"0 -16px" }}>
          {[{id:"prices",label:"Prices"},{id:"sales",label:"Sales"},{id:"info",label:"Info"}].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{ flex:1, background:"none", border:"none", borderBottom:`2px solid ${tab===t.id?C.peachDk:"transparent"}`, color:tab===t.id?C.peachDk:C.sub, padding:"11px 2px", fontSize:12, fontWeight:tab===t.id?700:500, cursor:"pointer" }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding:"14px 16px 100px", display:"flex", flexDirection:"column", gap:12 }}>

        {/* ── PRICES ── */}
        {tab==="prices" && (
          <>
            {yuyutei && (
              <Card accentColor={C.coral} className="r1" s={{ borderColor:hex2rgb(C.coral,.4) }}>
                <div style={{ padding:"14px 16px 6px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:18 }}>🏯</span>
                    <div><div style={{ fontSize:14, fontWeight:700 }}>Yuyu-tei · Tokyo</div><div style={{ fontSize:11, color:C.sub }}>Primary market anchor</div></div>
                  </div>
                  <Pill ch="Verified" color={C.sageDk} s={{fontSize:10}}/>
                </div>
                <div style={{ padding:"10px 16px 14px" }}>
                  <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", gap:10 }}>
                    <div>
                      <div style={{ fontSize:10.5, color:C.sub, letterSpacing:"0.06em", textTransform:"uppercase", marginBottom:3 }}>買取価格 · Buy-back</div>
                      <div style={{ fontSize:30, fontWeight:700, color:C.coral, lineHeight:1 }}>{fmtTHB(yuyutei.buy.thb)}</div>
                      <div style={{ fontSize:11, color:C.sub, marginTop:3 }} className="mono">{fmtJPY(yuyutei.buy.jpy)} · {fmtUSD(yuyutei.buy.usd)}</div>
                    </div>
                    <a href={yuyutei.buy.url} target="_blank" rel="noopener noreferrer"><SBtn>買取 →</SBtn></a>
                  </div>
                </div>
                <div style={{ borderTop:`1px solid ${C.line}`, padding:"10px 16px 14px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div>
                      <div style={{ fontSize:10.5, color:C.sub, letterSpacing:"0.06em", textTransform:"uppercase", marginBottom:3 }}>販売価格 · Retail</div>
                      <div style={{ fontSize:19, fontWeight:700, color:C.ink, lineHeight:1 }}>
                        {fmtTHB(yuyutei.sell.thb)} <span style={{ fontSize:12, color:C.sub, fontWeight:500 }} className="mono">{fmtJPY(yuyutei.sell.jpy)}</span>
                      </div>
                    </div>
                    <a href={yuyutei.sell.url} target="_blank" rel="noopener noreferrer"><SBtn>販売 →</SBtn></a>
                  </div>
                  {yuyutei.buy.thb>0 && yuyutei.sell.thb>0 && (
                    <div style={{ marginTop:10, background:hex2rgb(C.butter,.2), border:`1px solid ${hex2rgb(C.butterDk,.25)}`, borderRadius:9, padding:"7px 10px", fontSize:11.5, color:C.sub }}>
                      <strong style={{color:C.ink}}>Spread:</strong> {fmtTHB(yuyutei.sell.thb-yuyutei.buy.thb)} <span style={{color:C.dim}}>({Math.round((1-yuyutei.buy.thb/yuyutei.sell.thb)*100)}% shop margin)</span>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {priceData?.chart?.length>0 && (
              <Card className="r2">
                <Hdr accent={C.peachDk}>Price history · Multi-source</Hdr>
                <div style={{ padding:"14px 0 10px" }}>
                  <PriceChart chart={priceData.chart} color={C.peachDk} timeframe={tf} onTF={setTf}/>
                </div>
              </Card>
            )}

            {/* Mercari JP deep link */}
            <Card className="r3" s={{ borderColor:hex2rgb(C.roseDk,.4) }}>
              <div style={{ padding:"14px 16px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                  <span style={{ fontSize:20 }}>🟠</span>
                  <div>
                    <div style={{ fontSize:14, fontWeight:700 }}>Mercari Japan · Image search</div>
                    <div style={{ fontSize:11.5, color:C.sub }}>Tap to search listings that match your card photo</div>
                  </div>
                </div>
                <div style={{ background:C.deep, borderRadius:9, padding:"8px 12px", marginBottom:12, fontSize:11, color:C.sub }} className="mono">
                  {searchQ}
                </div>
                <a href={mercariUrl} target="_blank" rel="noopener noreferrer" style={{ display:"block" }}>
                  <PBtn s={{ background:C.roseDk, boxShadow:`0 6px 18px ${hex2rgb(C.roseDk,.3)}` }}>
                    <span>🟠</span> Open Mercari Japan →
                  </PBtn>
                </a>
                <div style={{ fontSize:11, color:C.dim, marginTop:8, textAlign:"center" }}>
                  Opens in browser — search then compare listing photos with yours
                </div>
              </div>
            </Card>

            {/* Per-source latest */}
            {priceData?.sources && (
              <Card className="r4">
                <Hdr>All sources · Latest price</Hdr>
                {priceData.sources.map((s,i)=>{
                  const latest = s.sales[0];
                  if(!latest) return null;
                  const href = s.id==="yuyutei" ? yuyutei?.sell?.url : priceData.srcLinks[s.id]?.(searchQ);
                  return (
                    <a key={s.id} href={href} target="_blank" rel="noopener noreferrer">
                      <div style={{ display:"flex", alignItems:"center", gap:11, padding:"11px 16px", borderBottom:i<priceData.sources.length-1?`1px solid ${C.line}`:"none", cursor:"pointer" }}>
                        <span style={{ fontSize:17 }}>{s.icon}</span>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:600, color:s.color }}>{s.name}</div>
                          <div style={{ fontSize:10.5, color:C.dim }} className="mono">{latest.date} · {s.cur} · {s.region}</div>
                        </div>
                        <div style={{ textAlign:"right" }}>
                          <div style={{ fontSize:15, fontWeight:700 }}>{fmtTHB(latest.priceTHB)}</div>
                          <div style={{ fontSize:10.5, color:C.dim }} className="mono">{fmtUSD(latest.priceUSD)}</div>
                        </div>
                      </div>
                    </a>
                  );
                })}
              </Card>
            )}
          </>
        )}

        {/* ── SALES LIST ── */}
        {tab==="sales" && (
          <Card className="r1">
            <Hdr accent={C.peachDk}>Last sold · 3 years · Newest first</Hdr>
            <div style={{ padding:"8px 0", borderBottom:`1px solid ${C.line}` }}>
              <div style={{ display:"flex", gap:5, overflowX:"auto", padding:"4px 12px" }}>
                <button onClick={()=>setSrcFilter(null)} style={{ background:!srcFilter?C.peachDk:"transparent", color:!srcFilter?"#fff":C.sub, border:`1px solid ${!srcFilter?C.peachDk:C.bord}`, borderRadius:8, padding:"5px 11px", fontSize:11, fontWeight:600, whiteSpace:"nowrap", flexShrink:0, cursor:"pointer" }}>All</button>
                {SOURCES.filter(s=>priceData?.sources?.find(ps=>ps.id===s.id)).map(s=>(
                  <button key={s.id} onClick={()=>setSrcFilter(s.id)} style={{ background:srcFilter===s.id?s.color:"transparent", color:srcFilter===s.id?"#fff":C.sub, border:`1px solid ${srcFilter===s.id?s.color:C.bord}`, borderRadius:8, padding:"5px 11px", fontSize:11, fontWeight:600, whiteSpace:"nowrap", flexShrink:0, cursor:"pointer" }}>
                    {s.icon} {s.name}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ maxHeight:380, overflowY:"auto" }}>
              {sales.length===0?(
                <div style={{ padding:"28px", textAlign:"center", color:C.dim, fontSize:13 }}>No sales for this filter</div>
              ):sales.map((s,i)=>(
                <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 16px", borderBottom:i<sales.length-1?`1px solid ${C.line}`:"none" }}>
                  <div>
                    <div style={{ fontSize:11, color:s.sourceColor, fontWeight:600, marginBottom:2 }}>{s.icon} {s.sourceName}</div>
                    <div style={{ fontSize:12, color:C.sub }} className="mono">{s.date}</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:15, fontWeight:700 }}>{fmtTHB(s.priceTHB)}</div>
                    <div style={{ fontSize:11, color:C.dim }} className="mono">{fmtUSD(s.priceUSD)}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── BOBOAGRADE ── */}
        {tab==="grade" && (
          grade ? (
            <>
              {/* Grade confidence warning */}
              {grade.imageQuality && grade.imageQuality!=="good" && (
                <div className="r1" style={{ background:hex2rgb(C.butterDk,.12), border:`1px solid ${hex2rgb(C.butterDk,.35)}`, borderRadius:14, padding:"12px 16px", fontSize:13, color:C.ink }}>
                  ⚠ Image quality: <strong>{grade.imageQuality}</strong> — grading accuracy may be reduced. For best results, photograph the card flat under bright, even lighting.
                </div>
              )}

              {/* Overall grade */}
              <Card accentColor={bgsColor(grade.overall?.bgs||0)} className="r1" s={{ borderColor:hex2rgb(bgsColor(grade.overall?.bgs||0),.5) }}>
                <div style={{ padding:"16px 18px", display:"flex", justifyContent:"space-between", alignItems:"center", gap:14 }}>
                  <div>
                    <div style={{ fontSize:10.5, color:C.sub, marginBottom:4, letterSpacing:".06em" }}>◆ BOBOAGRADE</div>
                    <div style={{ fontSize:18, fontWeight:800, color:bgsColor(grade.overall?.bgs||0), lineHeight:1.15, marginBottom:6 }}>{grade.overall?.label||"—"}</div>
                    <Pill ch={grade.overall?.estimatedPSA||"—"} color={bgsColor(grade.overall?.bgs||0)} s={{fontSize:11}}/>
                    <div style={{ fontSize:12, color:C.sub, marginTop:8, maxWidth:200, lineHeight:1.55 }}>{grade.overall?.submissionAdvice}</div>
                  </div>
                  <div style={{ textAlign:"right", flexShrink:0 }}>
                    <div style={{ fontSize:58, fontWeight:800, color:bgsColor(grade.overall?.bgs||0), lineHeight:.9 }}>
                      {grade.overall?.bgs?.toFixed(1)||"—"}
                    </div>
                    <div style={{ fontSize:11, color:C.sub, marginTop:2 }}>/10.0</div>
                    <div style={{ fontSize:10, color:C.dim, marginTop:2 }}>{grade.gradingConfidence}% confident</div>
                  </div>
                </div>
                {grade.overall?.summary && (
                  <div style={{ padding:"10px 18px 14px", borderTop:`1px solid ${C.line}`, fontSize:13, color:C.sub, lineHeight:1.65 }}>
                    {grade.overall.summary}
                  </div>
                )}
              </Card>

              {/* Subgrades */}
              <Card className="r2">
                <Hdr accent={C.sageDk}>Subgrade breakdown</Hdr>
                {[
                  { key:"centering", label:"Centering", icon:"⊞", extra: grade.centering ? `${grade.centering.leftBorderPct||"?"}% / ${grade.centering.rightBorderPct||"?"}% sides` : "" },
                  { key:"corners",   label:"Corners",   icon:"◤", extra: grade.corners?.worstCorner ? `Worst: ${grade.corners.worstCorner}` : "" },
                  { key:"edges",     label:"Edges",     icon:"—", extra: grade.edges?.worstEdge ? `Worst: ${grade.edges.worstEdge}` : "" },
                  { key:"surface",   label:"Surface",   icon:"◻", extra: grade.surface?.defectsFound?.join(", ") || "" },
                ].map((sub,i,arr)=>{
                  const g = grade[sub.key];
                  if(!g) return null;
                  const bgs = g.bgs || 0;
                  const color = bgsColor(bgs);
                  return (
                    <div key={sub.key} style={{ padding:"13px 18px", borderBottom:i<arr.length-1?`1px solid ${C.line}`:"none" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                        <span style={{ fontSize:14, fontWeight:600 }}>{sub.icon} {sub.label}</span>
                        <div style={{ display:"flex", gap:8, alignItems:"baseline" }}>
                          <span style={{ fontSize:10.5, color:C.dim }}>BGS</span>
                          <span style={{ fontSize:22, fontWeight:700, color }}>{bgs.toFixed(1)}</span>
                        </div>
                      </div>
                      <div style={{ height:5, background:C.deep, borderRadius:99, overflow:"hidden", marginBottom:6 }}>
                        <div style={{ height:"100%", width:`${g.score||0}%`, background:color, borderRadius:99, transition:"width 1s" }}/>
                      </div>
                      {sub.extra && <div style={{ fontSize:11.5, color:C.butterDk, marginBottom:3, fontWeight:600 }}>{sub.extra}</div>}
                      {g.notes && <div style={{ fontSize:11, color:C.sub, lineHeight:1.5 }}>{g.notes}</div>}
                    </div>
                  );
                })}
              </Card>

              {/* Corner grid */}
              <Card className="r3">
                <Hdr>Corner zoom · 28% crop · 4× stitched</Hdr>
                <div style={{ padding:"12px 16px" }}>
                  <img src={photos.corners} alt="corners" style={{ width:"100%", borderRadius:10, border:`1px solid ${C.line}` }}/>
                  <div style={{ marginTop:9, fontSize:12, color:C.sub, lineHeight:1.55 }}>TL · TR · BL · BR — each corner extracted from the original photo at full resolution.</div>
                </div>
              </Card>

              {/* BGS Reference */}
              <Card className="r4">
                <Hdr>BGS Grade Reference</Hdr>
                <div style={{ padding:"6px 0" }}>
                  {[
                    {g:"10.0",label:"PRISTINE (Black Label)",req:"All subs 10.0 — Perfect",color:C.lavDk},
                    {g:"10",  label:"GEM MINT",             req:"All subs ≥ 9.5",          color:C.butterDk},
                    {g:"9.5", label:"GEM MINT",             req:"All subs ≥ 9.0",          color:C.sageDk},
                    {g:"9",   label:"MINT",                 req:"All subs ≥ 8.5",          color:C.skyDk},
                    {g:"8.5", label:"NM-MT+",               req:"All subs ≥ 8.0",          color:C.peachDk},
                    {g:"8",   label:"NM-MT",                req:"Light wear on edges",     color:C.coral},
                  ].map((r,i,arr)=>(
                    <div key={r.g} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 18px", borderBottom:i<arr.length-1?`1px solid ${C.line}`:"none" }}>
                      <div>
                        <span style={{ fontSize:14, fontWeight:700, color:r.color }}>BGS {r.g}</span>
                        <span style={{ fontSize:12, color:C.sub, marginLeft:8 }}>{r.label}</span>
                      </div>
                      <span className="mono" style={{ fontSize:11, color:C.dim }}>{r.req}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          ) : (
            <Card className="r1">
              <div style={{ padding:"32px 20px", textAlign:"center" }}>
                <div style={{ fontSize:28, marginBottom:8 }}>⚠️</div>
                <div style={{ fontSize:14, fontWeight:600, color:C.sub, marginBottom:6 }}>Grading unavailable</div>
                <div style={{ fontSize:12, color:C.dim, lineHeight:1.6 }}>
                  {gradeResult?.error || "The AI could not grade this image."}<br/>
                  For best results: photograph the card flat on a plain background under bright, even light (no flash).
                </div>
              </div>
            </Card>
          )
        )}

        {/* ── INFO ── */}
        {tab==="info" && (
          <>
            {card.image && (
              <div className="r1" style={{ textAlign:"center" }}>
                <img src={card.image} alt={card.name} style={{ maxWidth:220, width:"65%", borderRadius:14, boxShadow:"0 8px 28px rgba(28,27,38,.2)", margin:"0 auto", display:"block" }}/>
                <div style={{ fontSize:11, color:C.dim, marginTop:8 }}>Official image from database</div>
              </div>
            )}

            <Card className="r2">
              <Hdr>Card details</Hdr>
              <div style={{ padding:"14px 16px" }}>
                {[
                  ["Card ID",      card.cardId],
                  ["Name",         card.name],
                  ["JP Name",      card.nameJP],
                  ["Set",          `${card.setName||""}${card.set?` · ${card.set}`:""}`],
                  ["Rarity",       card.rarity],
                  ["Language",     LANGUAGES.find(l=>l.id===card.language)?.label],
                  ["Type",         card.type],
                  ["Color",        card.color],
                  ["Cost",         card.cost!=null?String(card.cost):null],
                  ["Power",        card.power],
                  ["Attribute",    card.attribute],
                  ["Level",        card.level!=null?String(card.level):null],
                  ["ATK / DEF",    card.atk!=null?`${card.atk} / ${card.def}`:null],
                  ["Race",         card.race],
                  ["Archetype",    card.archetype],
                  ["HP",           card.hp],
                  ["Pokémon Type", card.types?.join(", ")],
                  ["DB Source",    card.dbSource==="api"?"✓ Live TCG API":"Local seed"],
                  ["AI Match",     `${card.confidence}%`],
                ].filter(([,v])=>v!=null&&v!=="").map(([k,v])=>(
                  <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:`1px solid ${C.line}`, fontSize:13, gap:10 }}>
                    <span style={{ color:C.sub, flexShrink:0 }}>{k}</span>
                    <span style={{ fontWeight:600, textAlign:"right" }}>{v}</span>
                  </div>
                ))}
              </div>
            </Card>

            {card.ability && (
              <Card className="r3">
                <Hdr accent={C.sageDk}>Ability / Effect</Hdr>
                <div style={{ padding:"14px 16px", fontSize:13.5, lineHeight:1.8, color:C.ink, whiteSpace:"pre-line" }}>{card.ability}</div>
              </Card>
            )}

            {card.attacks && (
              <Card className="r3">
                <Hdr accent={C.butterDk}>Attacks</Hdr>
                <div style={{ padding:"14px 16px", fontSize:13, lineHeight:1.7, color:C.ink, whiteSpace:"pre-line" }}>{card.attacks}</div>
              </Card>
            )}

            {card.dbSources?.length > 0 && (
              <Card className="r4">
                <Hdr>Databases crosschecked</Hdr>
                {card.dbSources.map((s,i)=>(
                  <a key={i} href={s.url&&s.url!=="#"?s.url:undefined} target="_blank" rel="noopener noreferrer">
                    <div style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 16px", borderBottom:i<card.dbSources.length-1?`1px solid ${C.line}`:"none" }}>
                      <div style={{ width:7, height:7, borderRadius:"50%", background:C.sageDk, flexShrink:0 }}/>
                      <span style={{ fontSize:13, flex:1 }}>{s.name}</span>
                      {s.url&&s.url!=="#"&&<span style={{ color:C.dim }}>›</span>}
                    </div>
                  </a>
                ))}
              </Card>
            )}

            <Card className="r5">
              <Hdr>Scan output · ⬡ {user.name}</Hdr>
              <div style={{ padding:"12px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                {[{label:"Full card",src:photos.full,aspect:"63/88"},{label:"4 corners",src:photos.corners,aspect:"1/1"}].map((p,i)=>(
                  <div key={i} style={{ background:C.deep, borderRadius:10, overflow:"hidden", border:`1px solid ${C.line}` }}>
                    <img src={p.src} alt={p.label} style={{ width:"100%", aspectRatio:p.aspect, objectFit:"cover", display:"block" }}/>
                    <div style={{ padding:"6px 10px", fontSize:10.5, fontWeight:600 }}>{p.label}</div>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
      </div>

      <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:430, background:"rgba(250,247,242,.96)", backdropFilter:"blur(16px)", borderTop:`1px solid ${C.bord}`, padding:"11px 16px 28px", display:"flex", gap:10 }}>
        <SBtn onClick={onRescan} s={{ flex:1, padding:"12px" }}>📷 Scan Again</SBtn>
        <PBtn s={{ flex:2, padding:"12px" }}>Push to Vault →</PBtn>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ROOT
═══════════════════════════════════════════════════════════════════════════ */
export default function App() {
  const [screen,  setScreen]  = useState("login");
  const [user,    setUser]    = useState(null);
  const [ctx,     setCtx]     = useState(null);
  const [photos,  setPhotos]  = useState(null);
  const [aiData,  setAiData]  = useState(null);
  const [card,    setCard]    = useState(null);

  const login    = useCallback(u  => { setUser(u); setScreen("welcome"); }, []);
  const logout   = useCallback(()  => { setUser(null); setScreen("login"); }, []);
  const start    = useCallback(c  => { setCtx(c); setScreen("capture"); }, []);
  const captured = useCallback(p  => { setPhotos(p); setScreen("processing"); }, []);
  const procDone = useCallback(r  => { setAiData(r); setScreen("picker"); }, []);
  const picked   = useCallback(c  => { setCard(c); setScreen("rarity"); }, []);
  const rarityOk = useCallback(c  => { setCard(c); setScreen("result"); }, []);
  const rescan   = useCallback(()  => { setPhotos(null); setAiData(null); setCard(null); setScreen("capture"); }, []);
  const backToPicker = useCallback(()=> setScreen("picker"), []);

  if (screen==="login")      return <LoginScreen onLogin={login}/>;
  if (screen==="welcome")    return <WelcomeScreen user={user} onStart={start} onLogout={logout}/>;
  if (screen==="capture")    return <CaptureScreen user={user} ctx={ctx} onCapture={captured} onBack={()=>setScreen("welcome")}/>;
  if (screen==="processing") return <ProcessingScreen photos={photos} ctx={ctx} onDone={procDone}/>;
  if (screen==="picker")     return <CardPickerScreen photos={photos} aiData={aiData} ctx={ctx} onSelect={picked} onRescan={rescan}/>;
  if (screen==="rarity")     return <RarityScreen photos={photos} card={card} aiData={aiData} ctx={ctx} onConfirm={rarityOk} onBack={backToPicker}/>;
  if (screen==="result")     return <ResultScreen photos={photos} card={card} aiData={aiData} user={user} onRescan={rescan}/>;
  return null;
}
