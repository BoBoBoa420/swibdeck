import { useState, useRef, useCallback, useEffect } from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   BoBoa Scanner · v9
   - REAL pricing via deep-links to Mercari/eBay/Yuyu-tei/Yahoo Auctions
   - Rarity-sensitive search queries (uses Yuyu-tei JP abbreviations)
   - Correct OCG (JP) vs TCG (EN) rarity systems per official sources
   - Card DB lookup via free public APIs (YGOProDeck, apitcg.com, optcgapi.com)
   - Last-sold tab + Current-listings tab (both deep-linked)
   - Image viewer with pinch/zoom for corner photos
   - Locked 4K camera, no zoom lock drift
   - No more seed data — if we can't find it, we say so and provide search links
═══════════════════════════════════════════════════════════════════════════ */

/* ── Currency & formatting ───────────────────────────────────────────────── */
const FX = { USD_THB: 35, JPY_THB: 0.24, JPY_USD: 0.0068 };
const toTHB = (n, cur="JPY") => Math.round(!n ? 0 : cur === "JPY" ? n * FX.JPY_THB : cur === "USD" ? n * FX.USD_THB : n);
const toUSD = (n, cur="JPY") => !n ? 0 : cur === "JPY" ? Math.round(n * FX.JPY_USD * 100) / 100 : cur === "THB" ? Math.round(n / FX.USD_THB * 100) / 100 : n;
const fmtTHB = n => "฿" + Math.round(n || 0).toLocaleString();
const fmtUSD = n => "$" + (Number(n || 0) % 1 === 0 ? Number(n).toFixed(0) : Number(n).toFixed(2));
const fmtJPY = n => "¥" + Math.round(n || 0).toLocaleString();
const rgba = (h, a) => { const r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16); return `rgba(${r},${g},${b},${a})`; };

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
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Inter+Tight:wght@500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap');
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
html,body,#root{min-height:100%;background:${C.bg};}
body{font-family:'Inter','-apple-system','Helvetica Neue',sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased;overscroll-behavior:none;touch-action:manipulation;font-size:16px;letter-spacing:-0.01em;line-height:1.45;}
::-webkit-scrollbar{display:none;}
a{text-decoration:none;color:inherit;}
input,button{font-family:inherit;-webkit-appearance:none;appearance:none;}
button{cursor:pointer;}
.display{font-family:'Inter Tight',sans-serif;letter-spacing:-0.025em;}
.mono{font-family:'JetBrains Mono',monospace;letter-spacing:0;}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes rise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes scanLine{0%{top:2%}100%{top:96%}}
.r1{animation:rise .42s .00s cubic-bezier(.2,.8,.2,1) both}
.r2{animation:rise .42s .07s cubic-bezier(.2,.8,.2,1) both}
.r3{animation:rise .42s .14s cubic-bezier(.2,.8,.2,1) both}
.r4{animation:rise .42s .21s cubic-bezier(.2,.8,.2,1) both}
.r5{animation:rise .42s .28s cubic-bezier(.2,.8,.2,1) both}
`;

if (typeof window !== "undefined" && typeof CanvasRenderingContext2D !== "undefined" && !CanvasRenderingContext2D.prototype.roundRect) {
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
   TCG + LANGUAGE CONFIG (Pokémon/Chinese removed)
═══════════════════════════════════════════════════════════════════════════ */
const TCG_TYPES = [
  {
    id:"onepiece", name:"One Piece", shortName:"OP TCG", color:C.coral,
    codeHint:"Bottom-right card code, e.g. OP07-051, ST30-001",
    codeRegion:"bottom-right",
    // Circular pirate-emblem style SVG logo
    logo: (color) => `
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="op-g" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="${color}" stop-opacity="1"/>
            <stop offset="100%" stop-color="${color}" stop-opacity="0.65"/>
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="38" fill="none" stroke="url(#op-g)" stroke-width="4"/>
        <path d="M 35 35 Q 50 25 65 35 L 65 65 Q 50 75 35 65 Z" fill="url(#op-g)" opacity="0.9"/>
        <circle cx="42" cy="44" r="3" fill="#fff"/>
        <circle cx="58" cy="44" r="3" fill="#fff"/>
        <path d="M 40 58 Q 50 64 60 58" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        <text x="50" y="90" text-anchor="middle" font-family="Inter Tight" font-weight="800" font-size="11" fill="${color}">ONE PIECE</text>
      </svg>`,
  },
  {
    id:"yugioh", name:"Yu-Gi-Oh!", shortName:"YGO OCG", color:C.lavDk,
    codeHint:"Bottom-right card code, e.g. LOCH-JP003, LOB-001",
    codeRegion:"bottom-right below artwork",
    logo: (color) => `
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="ygo-g" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="${color}" stop-opacity="1"/>
            <stop offset="100%" stop-color="${color}" stop-opacity="0.6"/>
          </linearGradient>
        </defs>
        <polygon points="50,12 86,32 86,68 50,88 14,68 14,32" fill="none" stroke="url(#ygo-g)" stroke-width="4"/>
        <polygon points="50,24 74,38 74,62 50,76 26,62 26,38" fill="url(#ygo-g)" opacity="0.85"/>
        <circle cx="50" cy="50" r="10" fill="#fff"/>
        <circle cx="50" cy="50" r="4" fill="${color}"/>
        <text x="50" y="98" text-anchor="middle" font-family="Inter Tight" font-weight="800" font-size="10" fill="${color}">遊戯王 OCG</text>
      </svg>`,
  },
];

const LANGUAGES = [
  { id:"JP", label:"Japanese", flag:"🇯🇵", note:"OCG / JP print" },
  { id:"EN", label:"English",  flag:"🇬🇧", note:"TCG / EN print" },
];

/* ═══════════════════════════════════════════════════════════════════════════
   DON!! CARD SYSTEM
   Don!! cards are a special One Piece TCG card type (resource cards).
   They don't have set codes like regular cards.
   JP: ドン!! カード — Golden (黄金) is the premium version
   EN: DON!! CARD — standard black or special variants
═══════════════════════════════════════════════════════════════════════════ */
const DON_VARIANTS = {
  JP: [
    {
      id:"don-jp-normal",
      label:"ドン!! カード (通常)",
      full:"Don!! Card — Normal",
      searchJP:"ドン!! カード",
      searchEN:"Don Card",
      color:C.sageDk,
      // Illustration hint (no real thumbnail without hosting)
      style:{ bg:"#1a1a2e", border:C.sage, text:"#fff" },
      desc:"Standard Don!! — blue back, gold border",
      icon:"⚡",
    },
    {
      id:"don-jp-golden",
      label:"黄金 ドン!! カード",
      full:"Golden Don!! Card",
      searchJP:"黄金 ドン!! カード 金",
      searchEN:"Golden Don Card Holographic",
      color:C.butterDk,
      style:{ bg:"linear-gradient(135deg,#b8860b,#ffd700,#b8860b)", border:"#ffd700", text:"#000" },
      desc:"Golden Don!! — rainbow holographic gold",
      icon:"✨",
    },
  ],
  EN: [
    {
      id:"don-en-normal",
      label:"DON!! Card",
      full:"DON!! Card — Standard",
      searchJP:"ドン!! カード",
      searchEN:"DON Card One Piece",
      color:C.sageDk,
      style:{ bg:"#1a1a2e", border:"#4a9eda", text:"#fff" },
      desc:"Standard DON!! — black border",
      icon:"⚡",
    },
    {
      id:"don-en-special",
      label:"DON!! Card Special",
      full:"DON!! Card — Special Art",
      searchJP:"ドン!! カード スペシャル",
      searchEN:"DON Card Special Art One Piece",
      color:C.coral,
      style:{ bg:"linear-gradient(135deg,#8B0000,#DC143C)", border:"#FF6347", text:"#fff" },
      desc:"Special art DON!! variant",
      icon:"🌟",
    },
  ],
};

/* ═══════════════════════════════════════════════════════════════════════════
   RARITY SYSTEMS — full names, with search tokens in target language.
   searchJP = Japanese full name for searching on Mercari/Yahoo/Yuyu-tei
   searchEN = English full name for searching on eBay/TCGPlayer
   thumb = visual style hints (since we can't host real images)
═══════════════════════════════════════════════════════════════════════════ */
const RARITIES = {
  onepiece: {
    JP: [
      {id:"C",      label:"Common",             searchJP:"コモン",               searchEN:"Common",            color:C.dim},
      {id:"UC",     label:"Uncommon",           searchJP:"アンコモン",            searchEN:"Uncommon",          color:C.sageDk},
      {id:"R",      label:"Rare",               searchJP:"レア",                 searchEN:"Rare",              color:C.skyDk},
      {id:"SR",     label:"Super Rare",         searchJP:"スーパーレア",          searchEN:"Super Rare",        color:C.butterDk},
      {id:"SR-P",   label:"SR Parallel (Alt Art)",searchJP:"パラレル",            searchEN:"Parallel Alt Art",  color:C.peachDk},
      {id:"L",      label:"Leader",             searchJP:"リーダー",             searchEN:"Leader",            color:C.roseDk},
      {id:"L-P",    label:"Leader Parallel",    searchJP:"リーダーパラレル",      searchEN:"Leader Parallel",   color:C.lavDk},
      {id:"SEC",    label:"Secret Rare",        searchJP:"シークレットレア",      searchEN:"Secret Rare",       color:C.coral},
      {id:"SEC-P",  label:"Secret Rare Parallel",searchJP:"シークレットパラレル",   searchEN:"Secret Parallel",   color:C.rose},
      {id:"SP",     label:"Special (Manga)",    searchJP:"SPカード",             searchEN:"Special",           color:C.lav},
      {id:"MR",     label:"Manga Rare",         searchJP:"マンガレア",            searchEN:"Manga Rare",        color:C.lavDk},
      {id:"TR",     label:"Treasure Rare",      searchJP:"トレジャーレア",        searchEN:"Treasure Rare",     color:C.butterDk},
      {id:"PR",     label:"Promo",              searchJP:"プロモ",               searchEN:"Promo",             color:C.sub},
    ],
    EN: [
      {id:"C",      label:"Common",             searchJP:"コモン",               searchEN:"Common",            color:C.dim},
      {id:"UC",     label:"Uncommon",           searchJP:"アンコモン",            searchEN:"Uncommon",          color:C.sageDk},
      {id:"R",      label:"Rare",               searchJP:"レア",                 searchEN:"Rare",              color:C.skyDk},
      {id:"SR",     label:"Super Rare",         searchJP:"スーパーレア",          searchEN:"Super Rare",        color:C.butterDk},
      {id:"SR-AA",  label:"SR Alternate Art",   searchJP:"パラレル",             searchEN:"Alternate Art",     color:C.peachDk},
      {id:"L",      label:"Leader",             searchJP:"リーダー",             searchEN:"Leader",            color:C.roseDk},
      {id:"L-P",    label:"Leader Alternate Art",searchJP:"リーダーパラレル",      searchEN:"Leader Alt Art",    color:C.lavDk},
      {id:"SEC",    label:"Secret Rare",        searchJP:"シークレットレア",      searchEN:"Secret Rare",       color:C.coral},
      {id:"SEC-AA", label:"Secret Alt Art",     searchJP:"シークレットパラレル",   searchEN:"Secret Alt Art",    color:C.rose},
      {id:"SP",     label:"Special",            searchJP:"SPカード",             searchEN:"Special",           color:C.lav},
      {id:"MR",     label:"Manga Rare",         searchJP:"マンガレア",            searchEN:"Manga Rare",        color:C.lavDk},
      {id:"TR",     label:"Treasure Rare",      searchJP:"トレジャーレア",        searchEN:"Treasure Rare",     color:C.butterDk},
      {id:"PR",     label:"Promo",              searchJP:"プロモ",               searchEN:"Promo",             color:C.sub},
    ],
  },
  yugioh: {
    JP: [
      {id:"N",      label:"Normal (Common)",    searchJP:"ノーマル",             searchEN:"Common",            color:C.dim},
      {id:"NP",     label:"Normal Parallel",    searchJP:"ノーマルパラレル",      searchEN:"Normal Parallel",   color:C.sage},
      {id:"R",      label:"Rare",               searchJP:"レア",                 searchEN:"Rare",              color:C.skyDk},
      {id:"RP",     label:"Rare Parallel",      searchJP:"レアパラレル",          searchEN:"Rare Parallel",     color:C.sky},
      {id:"SR",     label:"Super Rare",         searchJP:"スーパーレア",          searchEN:"Super Rare",        color:C.butterDk},
      {id:"UR",     label:"Ultra Rare",         searchJP:"ウルトラレア",          searchEN:"Ultra Rare",        color:C.peachDk},
      {id:"ULR",    label:"Ultimate Rare (Relief)",searchJP:"アルティメットレア レリーフ", searchEN:"Ultimate Rare",color:C.roseDk},
      {id:"SER",    label:"Secret Rare",        searchJP:"シークレットレア",      searchEN:"Secret Rare",       color:C.coral},
      {id:"PSE",    label:"Prismatic Secret Rare",searchJP:"プリズマティックシークレットレア",searchEN:"Prismatic Secret Rare",color:C.rose},
      // NEW 2025 rarities
      {id:"OFPSE",  label:"Overframe PSE",      searchJP:"オーバーフレーム プリズマ", searchEN:"Overframe Prismatic Secret",color:C.roseDk},
      {id:"GMR",    label:"Grandmaster Rare",   searchJP:"グランドマスターレア",   searchEN:"Grandmaster Rare",  color:C.coral},
      {id:"20TH",   label:"20th Secret Rare",   searchJP:"20thシークレットレア",   searchEN:"20th Secret Rare",  color:C.lav},
      {id:"QCSE",   label:"Quarter Century Secret",searchJP:"クォーターセンチュリーシークレットレア",searchEN:"Quarter Century Secret",color:C.butterDk},
      {id:"GR",     label:"Ghost Rare",         searchJP:"ゴーストレア",          searchEN:"Ghost Rare",        color:C.lavDk},
      {id:"KC",     label:"Kings Court",        searchJP:"コレクターズレア",      searchEN:"Collector Rare",    color:C.rose},
      {id:"HOL",    label:"Holographic",        searchJP:"ホログラフィックレア",   searchEN:"Holographic",       color:C.lavDk},
      {id:"ORsr",   label:"Overrush Rare",      searchJP:"オーバーラッシュレア",   searchEN:"Overrush Rare",     color:C.coral},
    ],
    EN: [
      {id:"C",      label:"Common",             searchJP:"コモン",               searchEN:"Common",            color:C.dim},
      {id:"R",      label:"Rare",               searchJP:"レア",                 searchEN:"Rare",              color:C.skyDk},
      {id:"SR",     label:"Super Rare",         searchJP:"スーパーレア",          searchEN:"Super Rare",        color:C.butterDk},
      {id:"UR",     label:"Ultra Rare",         searchJP:"ウルトラレア",          searchEN:"Ultra Rare",        color:C.peachDk},
      {id:"UtR",    label:"Ultimate Rare",      searchJP:"アルティメットレア",    searchEN:"Ultimate Rare",     color:C.roseDk},
      {id:"ScR",    label:"Secret Rare",        searchJP:"シークレットレア",      searchEN:"Secret Rare",       color:C.coral},
      {id:"PScR",   label:"Prismatic Secret Rare",searchJP:"プリズマティックシークレットレア",searchEN:"Prismatic Secret Rare",color:C.rose},
      {id:"StR",    label:"Starlight Rare",     searchJP:"スターライトレア",      searchEN:"Starlight Rare",    color:C.sageDk},
      {id:"CR",     label:"Collector's Rare",   searchJP:"コレクターズレア",      searchEN:"Collector's Rare",  color:C.lav},
      {id:"GR",     label:"Ghost Rare",         searchJP:"ゴーストレア",          searchEN:"Ghost Rare",        color:C.lavDk},
      {id:"QCSR",   label:"Quarter Century Secret",searchJP:"クォーターセンチュリーシークレットレア",searchEN:"Quarter Century Secret",color:C.butterDk},
      {id:"GoldR",  label:"Gold Rare",          searchJP:"ゴールドレア",          searchEN:"Gold Rare",         color:C.butter},
      {id:"PlatR",  label:"Platinum Rare",      searchJP:"プラチナレア",          searchEN:"Platinum Rare",     color:C.skyDk},
    ],
  },
};

const TCG_SLUG = { onepiece:"opc", yugioh:"ygo" };

/* ═══════════════════════════════════════════════════════════════════════════
   SEARCH LINK BUILDER — rarity-sensitive, uses FULL rarity name in the
   chosen language, always with card name (in chosen language) + card number.
═══════════════════════════════════════════════════════════════════════════ */
function buildSearchLinks({ cardId, cardNameJP, cardNameEN, rarityOpt, tcg, language, setSlug, searchOverrideJP, searchOverrideEN }) {
  const q = (s) => encodeURIComponent(s);
  const id = cardId || "";

  // Name token — only use REAL names (skip "Card LOCH-JP003" placeholder)
  const isRealName = (n) => n && n !== `Card ${cardId}` && n !== cardId && n.trim().length > 0;
  const nameJP = isRealName(cardNameJP) ? cardNameJP : "";
  const nameEN = isRealName(cardNameEN) ? cardNameEN : "";
  const nameForJPSearch = nameJP || nameEN;
  const nameForENSearch = nameEN || nameJP;

  // Full rarity name in appropriate language
  const rarityJP = rarityOpt?.searchJP || "";
  const rarityEN = rarityOpt?.searchEN || "";

  // If DON!! override provided, use that instead of normal query
  const jpQuery = searchOverrideJP
    ? [id, searchOverrideJP].filter(Boolean).join(" ")
    : [id, nameForJPSearch, rarityJP].filter(Boolean).join(" ");
  const enQuery = searchOverrideEN
    ? [id, searchOverrideEN].filter(Boolean).join(" ")
    : [id, nameForENSearch, rarityEN].filter(Boolean).join(" ");
  const idOnlyQuery = id;

  const links = [];

  // ── MERCARI JP ─────────────────────────────────────────────
  links.push({
    id: "mercari-sold",
    marketplace: "mercari",
    name: "Mercari JP · Sold",
    icon: "🟠", color: C.roseDk,
    category: "sold",
    query: jpQuery,
    url: `https://jp.mercari.com/search?keyword=${q(jpQuery)}&status=sold_out&sort=created_time&order=desc`,
    note: "Last sold listings",
  });
  links.push({
    id: "mercari-active",
    marketplace: "mercari",
    name: "Mercari JP · Active",
    icon: "🟠", color: C.roseDk,
    category: "active",
    query: jpQuery,
    url: `https://jp.mercari.com/search?keyword=${q(jpQuery)}&status=on_sale&sort=price&order=asc`,
    note: "Currently for sale",
  });

  // ── YAHOO AUCTIONS JP ───────────────────────────────────────
  links.push({
    id: "yahoo-closed",
    marketplace: "yahoo",
    name: "Yahoo Auctions · Ended",
    icon: "🅾", color: C.lav,
    category: "sold",
    query: jpQuery,
    url: `https://auctions.yahoo.co.jp/closedsearch/closedsearch?p=${q(jpQuery)}&n=50`,
    note: "Completed auctions",
  });
  links.push({
    id: "yahoo-active",
    marketplace: "yahoo",
    name: "Yahoo Auctions · Live",
    icon: "🅾", color: C.lav,
    category: "active",
    query: jpQuery,
    url: `https://auctions.yahoo.co.jp/search/search?p=${q(jpQuery)}&n=50`,
    note: "Live auctions right now",
  });

  // ── YUYU-TEI (set-level pages) ──────────────────────────────
  if (setSlug) {
    links.push({
      id: "yuyutei-buy",
      marketplace: "yuyutei",
      name: "Yuyu-tei · Buy-back (買取)",
      icon: "🏯", color: C.coral,
      category: "sold",
      query: idOnlyQuery,
      url: `https://yuyu-tei.jp/buy/${TCG_SLUG[tcg]}/s/${setSlug.toLowerCase()}`,
      note: "Shop will pay this (guaranteed)",
    });
    links.push({
      id: "yuyutei-sell",
      marketplace: "yuyutei",
      name: "Yuyu-tei · Retail (販売)",
      icon: "🏯", color: C.coral,
      category: "active",
      query: idOnlyQuery,
      url: `https://yuyu-tei.jp/sell/${TCG_SLUG[tcg]}/s/${setSlug.toLowerCase()}`,
      note: "Shop retail price",
    });
  }
  // Yuyu-tei global search by card number
  links.push({
    id: "yuyutei-search",
    marketplace: "yuyutei",
    name: "Yuyu-tei · Search",
    icon: "🏯", color: C.coral,
    category: "active",
    query: idOnlyQuery,
    url: `https://yuyu-tei.jp/top/${TCG_SLUG[tcg]}/search?word=${q(id)}`,
    note: "Search by card number",
  });

  // ── eBay ────────────────────────────────────────────────────
  const ebayQuery = language === "JP"
    ? [id, nameForENSearch, rarityEN, "Japanese"].filter(Boolean).join(" ")
    : enQuery;
  links.push({
    id: "ebay-sold",
    marketplace: "ebay",
    name: "eBay · Sold listings",
    icon: "🛒", color: C.butterDk,
    category: "sold",
    query: ebayQuery,
    url: `https://www.ebay.com/sch/i.html?_nkw=${q(ebayQuery)}&LH_Sold=1&LH_Complete=1&_ipg=240&_sop=13`,
    note: "Completed sales (global)",
  });
  links.push({
    id: "ebay-active",
    marketplace: "ebay",
    name: "eBay · Active listings",
    icon: "🛒", color: C.butterDk,
    category: "active",
    query: ebayQuery,
    url: `https://www.ebay.com/sch/i.html?_nkw=${q(ebayQuery)}&_ipg=240&_sop=15`,
    note: "Current listings",
  });

  // ── TCGPlayer (EN only) ─────────────────────────────────────
  if (language === "EN") {
    const tcgPlayerQuery = enQuery;
    links.push({
      id: "tcgplayer",
      marketplace: "tcgplayer",
      name: "TCGPlayer · Prices",
      icon: "🎯", color: C.skyDk,
      category: "active",
      query: tcgPlayerQuery,
      url: `https://www.tcgplayer.com/search/all/product?q=${q(tcgPlayerQuery)}&productLineName=${tcg==="onepiece"?"one-piece":"yugioh"}`,
      note: "US market retail",
    });
  }

  // ── Cardmarket (Yu-Gi-Oh! EU) ───────────────────────────────
  if (tcg === "yugioh") {
    links.push({
      id: "cardmarket",
      marketplace: "cardmarket",
      name: "Cardmarket · EU prices",
      icon: "🇪🇺", color: "#B8860B",
      category: "active",
      query: enQuery,
      url: `https://www.cardmarket.com/en/YuGiOh/Products/Search?searchString=${q(enQuery)}`,
      note: "European market",
    });
  }

  // ── snkrdunk (One Piece) ────────────────────────────────────
  if (tcg === "onepiece") {
    links.push({
      id: "snkrdunk",
      marketplace: "snkrdunk",
      name: "snkrdunk · Graded + DON!!",
      icon: "👟", color: C.sageDk,
      category: "sold",
      query: jpQuery,
      url: `https://snkrdunk.com/search?keyword=${q(jpQuery)}`,
      note: "Popular for DON!! / graded",
    });
  }

  // ── PriceCharting ───────────────────────────────────────────
  links.push({
    id: "pricecharting",
    marketplace: "pricecharting",
    name: "PriceCharting · History",
    icon: "📈", color: C.sageDk,
    category: "sold",
    query: enQuery,
    url: `https://www.pricecharting.com/search-products?q=${q(enQuery)}`,
    note: "Multi-source sales history",
  });

  // ── DB info links ───────────────────────────────────────────
  if (tcg === "onepiece") {
    links.push({
      id: "limitless",
      marketplace: "info",
      name: "Limitless TCG · Card page",
      icon: "♾", color: C.lavDk,
      category: "info",
      query: id,
      url: `https://onepiece.limitlesstcg.com/cards/${id}`,
      note: "Full card details",
    });
    links.push({
      id: "optcgapi-page",
      marketplace: "info",
      name: "OPTCGAPI · Analytics",
      icon: "📊", color: C.sageDk,
      category: "info",
      query: id,
      url: `https://optcgapi.com/analytics/card/${id}/`,
      note: "Price history charts",
    });
  } else if (tcg === "yugioh") {
    links.push({
      id: "ygoprodeck",
      marketplace: "info",
      name: "YGOProDeck · Card page",
      icon: "🎴", color: C.lavDk,
      category: "info",
      query: id,
      url: `https://ygoprodeck.com/card-search/?cardSet=${q(id)}`,
      note: "Full card details",
    });
  }

  return links;
}

/* ═══════════════════════════════════════════════════════════════════════════
   LIVE CARD LOOKUP — calls /api/cardlookup v3
   Returns card name (JP + EN), description, image, and PRICE SAMPLES
   from free APIs (YGOProDeck card_prices, OPTCGAPI TCGPlayer price, etc.)
═══════════════════════════════════════════════════════════════════════════ */
async function lookupCard({ cardId, tcg, language, fallbackName }) {
  try {
    const res = await fetch(
      `/api/cardlookup?id=${encodeURIComponent(cardId)}&tcg=${tcg}&lang=${language}`,
      { signal: AbortSignal.timeout(12000) }
    );
    if (!res.ok) throw new Error("API " + res.status);
    const data = await res.json();
    if (data.found) {
      return {
        ok: true,
        cardId: data.cardId || cardId,
        name: data.name || fallbackName || `Card ${cardId}`,
        nameEN: data.nameEN || data.name || "",
        nameJP: data.nameJP || "",
        set: data.set || "",
        setName: data.setName || "",
        rarityFromDB: data.rarity || "",
        type: data.type || "",
        color: data.color || "",
        cost: data.cost ?? null,
        power: data.power || null,
        ability: data.ability || "",
        image: data.image || null,
        atk: data.atk, def: data.def, level: data.level,
        attribute: data.attribute, race: data.race, archetype: data.archetype,
        dbSources: data.sources || [],
        priceSamples: data.priceSamples || [],
        setSlug: inferSetSlug(cardId, tcg),
      };
    }
  } catch(e) {
    console.warn("Card lookup failed:", e.message);
  }
  return {
    ok: false,
    cardId,
    name: fallbackName || `Card ${cardId}`,   // display name only
    nameEN: fallbackName || "",                // search name — EMPTY if unknown (avoids "Card LOCH-JP003" in query)
    nameJP: "",
    setSlug: inferSetSlug(cardId, tcg),
    dbSources: [],
    priceSamples: [],
  };
}

// Infer Yuyu-tei set slug from card ID (e.g. "OP07-051" → "op07", "LOCH-JP003" → "loch")
function inferSetSlug(cardId, tcg) {
  if (!cardId) return null;
  const m = cardId.match(/^([A-Z]+\d*)/i);
  if (!m) return null;
  return m[1].toLowerCase();
}

/* ═══════════════════════════════════════════════════════════════════════════
   BoBoa AI — identify card + detect rarity from image
═══════════════════════════════════════════════════════════════════════════ */
async function boboaIdentify({ imageDataUrl, tcgType, language }) {
  const base64 = imageDataUrl.split(",")[1];
  const tcg = TCG_TYPES.find(t => t.id === tcgType);
  const rarities = RARITIES[tcgType]?.[language] || [];
  const raritiesList = rarities.map(r => `${r.id} (${r.label})`).join(", ");

  const prompt = `You are BoBoa Scanner — TCG card identification engine.

TCG: ${tcg?.name}
Language: ${language} ${language === "JP" ? "(Japanese OCG — original characters preserved)" : "(English TCG)"}

IDENTIFY the card. Read the bottom-right card code carefully (this is the most reliable identifier).
For ${tcg?.name}: ${tcg?.codeHint}

RARITY — look for rarity indicator in bottom-right corner. Valid rarities for this TCG+language:
${raritiesList}

Return ONLY valid JSON, no markdown fences:
{
  "candidates": [
    {
      "cardId": "exact code you can READ from the card e.g. OP07-051 or LOCH-JP003",
      "name": "card name in English (translate if Japanese)",
      "nameOriginal": "name as printed on the card",
      "set": "set code e.g. OP07 or LOCH",
      "setName": "set name if visible",
      "rarity": "rarity ID matching one from the list above",
      "confidence": 0-100,
      "evidence": "specifically what text/marker you saw"
    }
  ],
  "language": "JP or EN",
  "cardIdRegion": "where you found the code, e.g. bottom-right"
}

Up to 4 candidates, most confident first. Always provide at least 1 candidate even at low confidence.`;

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
    const text = data.content?.map(c => c.text || "").join("") || "";
    return { success:true, data: JSON.parse(text.replace(/```json|```/g, "").trim()) };
  } catch(e) {
    return { success:false, error:e.message };
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   CAMERA CAPTURE — locked 4K, no zoom drift, frame-matched
═══════════════════════════════════════════════════════════════════════════ */
function captureCard({ video, frameEl, watermark }) {
  const vw = video.videoWidth, vh = video.videoHeight;
  const cw = video.clientWidth, ch = video.clientHeight;
  const vAr = vw/vh, bAr = cw/ch;
  let scale, ox, oy;
  if (vAr > bAr) { scale = ch/vh; ox = (vw*scale - cw)/2; oy = 0; }
  else           { scale = cw/vw; ox = 0; oy = (vh*scale - ch)/2; }

  const fr = frameEl.getBoundingClientRect();
  const vr = video.getBoundingClientRect();
  const disp = { left: fr.left - vr.left, top: fr.top - vr.top, width: fr.width, height: fr.height };
  const fx = Math.max(0, Math.round((disp.left + ox) / scale));
  const fy = Math.max(0, Math.round((disp.top  + oy) / scale));
  const fw = Math.min(vw - fx, Math.round(disp.width  / scale));
  const fh = Math.min(vh - fy, Math.round(disp.height / scale));

  const card = document.createElement("canvas");
  card.width = fw; card.height = fh;
  const ctx = card.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(video, fx, fy, fw, fh, 0, 0, fw, fh);

  // Watermark
  const fs = Math.max(12, Math.round(fw * 0.026));
  ctx.font = `500 ${fs}px 'Inter', sans-serif`;
  const tw = ctx.measureText(watermark).width;
  const pad = Math.round(fw * 0.018);
  ctx.save();
  ctx.globalAlpha = 0.36; ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath(); ctx.roundRect(fw-tw-pad*3, fh-fs-pad*1.8, tw+pad*2.4, fs+pad*1.2, 6); ctx.fill();
  ctx.globalAlpha = 0.8; ctx.fillStyle = "#fff";
  ctx.fillText(watermark, fw-tw-pad*1.8, fh-pad*0.8);
  ctx.restore();

  // 4-corner grid at maximum quality
  const cpct = 0.30, ccw = Math.round(fw*cpct), cch = Math.round(fh*cpct);
  const corners = [
    {label:"TL",sx:0,sy:0},
    {label:"TR",sx:fw-ccw,sy:0},
    {label:"BL",sx:0,sy:fh-cch},
    {label:"BR",sx:fw-ccw,sy:fh-cch},
  ];
  const gap = 6;
  const grid = document.createElement("canvas");
  grid.width = ccw*2 + gap*3; grid.height = cch*2 + gap*3;
  const gc = grid.getContext("2d");
  gc.imageSmoothingEnabled = true; gc.imageSmoothingQuality = "high";
  gc.fillStyle = "#1C1B26"; gc.fillRect(0,0,grid.width,grid.height);
  corners.forEach((c,i) => {
    const col = i%2, row = Math.floor(i/2);
    const dx = gap + col*(ccw+gap), dy = gap + row*(cch+gap);
    gc.drawImage(card, c.sx, c.sy, ccw, cch, dx, dy, ccw, cch);
    const ls = Math.round(cch*0.09);
    gc.fillStyle = "rgba(240,158,122,0.9)";
    gc.beginPath(); gc.roundRect(dx+6, dy+6, ls*2.5, ls*1.5, 4); gc.fill();
    gc.fillStyle = "#fff"; gc.font = `700 ${ls}px 'JetBrains Mono', monospace`;
    gc.fillText(c.label, dx+10, dy+ls*1.3);
  });

  return {
    full:    card.toDataURL("image/jpeg", 0.98),
    corners: grid.toDataURL("image/jpeg", 0.95),
    // Also export each corner individually for zoom viewer
    cornersSeparate: corners.map(c => {
      const cv = document.createElement("canvas");
      cv.width = ccw; cv.height = cch;
      cv.getContext("2d").drawImage(card, c.sx, c.sy, ccw, cch, 0, 0, ccw, cch);
      return { label: c.label, src: cv.toDataURL("image/jpeg", 0.95) };
    }),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   IMAGE VIEWER — pinch/zoom, pan, close
═══════════════════════════════════════════════════════════════════════════ */
function ImageViewer({ image, label, onClose }) {
  const [scale, setScale]     = useState(1);
  const [pos, setPos]         = useState({ x:0, y:0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x:0, y:0 });
  const [pinchDist, setPinchDist] = useState(null);

  const onWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setScale(s => Math.max(1, Math.min(5, s + delta)));
  };

  const onTouchStart = (e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      setPinchDist(Math.hypot(dx, dy));
    } else if (e.touches.length === 1 && scale > 1) {
      setDragging(true);
      setDragStart({ x: e.touches[0].clientX - pos.x, y: e.touches[0].clientY - pos.y });
    }
  };

  const onTouchMove = (e) => {
    e.preventDefault();
    if (e.touches.length === 2 && pinchDist !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const newDist = Math.hypot(dx, dy);
      const ratio = newDist / pinchDist;
      setScale(s => Math.max(1, Math.min(5, s * ratio)));
      setPinchDist(newDist);
    } else if (dragging && scale > 1 && e.touches[0]) {
      setPos({ x: e.touches[0].clientX - dragStart.x, y: e.touches[0].clientY - dragStart.y });
    }
  };

  const onTouchEnd = () => { setDragging(false); setPinchDist(null); };

  const reset = () => { setScale(1); setPos({x:0,y:0}); };
  const zoomIn  = () => setScale(s => Math.min(5, s + 0.5));
  const zoomOut = () => setScale(s => { const n = Math.max(1, s - 0.5); if (n === 1) setPos({x:0,y:0}); return n; });

  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,0.94)", zIndex:9999,
      display:"flex", flexDirection:"column",
    }}
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Top bar */}
      <div style={{
        padding:"44px 20px 12px", display:"flex", justifyContent:"space-between", alignItems:"center",
        background:"linear-gradient(to bottom, rgba(0,0,0,.7), transparent)",
      }}>
        <button onClick={onClose} style={{
          background:"rgba(255,255,255,0.14)", border:"1px solid rgba(255,255,255,0.22)",
          borderRadius:11, padding:"8px 14px", fontSize:13, fontWeight:600, color:"#fff",
        }}>✕ Close</button>
        {label && <div style={{ color:"#fff", fontSize:14, fontWeight:600 }}>{label}</div>}
        <div className="mono" style={{ color:"rgba(255,255,255,0.65)", fontSize:12 }}>{scale.toFixed(1)}×</div>
      </div>

      {/* Image */}
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden" }}>
        <img
          src={image}
          alt={label || "zoom"}
          onDoubleClick={reset}
          style={{
            maxWidth:"100%", maxHeight:"100%",
            transform:`translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
            transition: dragging || pinchDist !== null ? "none" : "transform .2s",
            cursor: scale > 1 ? (dragging ? "grabbing" : "grab") : "zoom-in",
            userSelect:"none",
          }}
          onClick={() => scale === 1 && zoomIn()}
          draggable={false}
        />
      </div>

      {/* Zoom controls */}
      <div style={{
        padding:"12px 20px 30px", display:"flex", gap:10, justifyContent:"center",
        background:"linear-gradient(to top, rgba(0,0,0,.6), transparent)",
      }}>
        <button onClick={zoomOut} style={ctrlBtn}>−</button>
        <button onClick={reset}   style={{...ctrlBtn, minWidth:80}}>Reset</button>
        <button onClick={zoomIn}  style={ctrlBtn}>+</button>
      </div>
    </div>
  );
}
const ctrlBtn = {
  background:"rgba(255,255,255,0.14)", border:"1px solid rgba(255,255,255,0.22)",
  borderRadius:12, padding:"10px 16px", fontSize:18, fontWeight:700, color:"#fff",
  minWidth:52, cursor:"pointer",
};

/* ═══════════════════════════════════════════════════════════════════════════
   UI ATOMS
═══════════════════════════════════════════════════════════════════════════ */
function Pill({ ch, color, s }) {
  color = color || C.peachDk;
  return <span style={{ background:rgba(color,0.14), color, border:`1px solid ${rgba(color,0.35)}`, borderRadius:99, padding:"3px 10px", fontSize:11, fontWeight:600, display:"inline-block", whiteSpace:"nowrap", ...s }}>{ch}</span>;
}
function PBtn({ children, onClick, disabled, s }) {
  return <button onClick={onClick} disabled={disabled} style={{ background:disabled?C.dim:C.peachDk, color:"#fff", border:"none", borderRadius:14, padding:"13px 20px", fontSize:15, fontWeight:700, width:"100%", cursor:disabled?"not-allowed":"pointer", boxShadow:disabled?"none":`0 6px 20px ${rgba(C.peachDk,0.32)}`, display:"flex", alignItems:"center", justifyContent:"center", gap:8, ...s }}>{children}</button>;
}
function SBtn({ children, onClick, s }) {
  return <button onClick={onClick} style={{ background:"transparent", color:C.ink, border:`1px solid ${C.bord}`, borderRadius:10, padding:"8px 14px", fontSize:13, fontWeight:600, cursor:"pointer", ...s }}>{children}</button>;
}
function Card({ children, s, accent }) {
  return <div style={{ background:C.surf, border:`1px solid ${C.bord}`, borderRadius:16, overflow:"hidden", boxShadow: accent ? `0 4px 18px ${rgba(accent,0.12)}` : "0 2px 10px rgba(28,27,38,0.04)", ...s }}>{children}</div>;
}
function Hdr({ children, accent }) {
  return <div style={{ padding:"10px 16px", borderBottom:`1px solid ${C.line}`, background:accent?rgba(accent,0.06):rgba(C.deep,0.5), fontSize:10.5, fontWeight:700, color:accent||C.sub, letterSpacing:"0.08em", textTransform:"uppercase" }}>{children}</div>;
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

  const goSocial = (id) => {
    const n = { facebook:"FB_"+Math.random().toString(36).slice(2,6), google:"G_"+Math.random().toString(36).slice(2,6), instagram:"IG_"+Math.random().toString(36).slice(2,6) };
    onLogin({ name:n[id], provider:id, verified:true });
  };
  const goGuest = () => {
    if (!name.trim() || name.trim().length < 2) return setErr("Enter at least 2 characters");
    onLogin({ name:name.trim(), provider:"guest", verified:false });
  };

  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"40px 22px", position:"relative", overflow:"hidden" }}>
      <style>{CSS}</style>
      <div style={{ position:"fixed", inset:0, pointerEvents:"none" }}>
        <div style={{ position:"absolute", top:"-15%", left:"-15%", width:"55%", height:"50%", background:rgba(C.peach,.18), borderRadius:"50%", filter:"blur(70px)" }}/>
        <div style={{ position:"absolute", bottom:"-20%", right:"-20%", width:"65%", height:"55%", background:rgba(C.lav,.2), borderRadius:"50%", filter:"blur(80px)" }}/>
      </div>

      <div style={{ width:"100%", maxWidth:370, position:"relative", zIndex:1 }}>
        <div className="r1" style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ width:70, height:70, borderRadius:21, background:`linear-gradient(135deg,${C.peach},${C.coral})`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px", boxShadow:`0 12px 32px ${rgba(C.coral,.35)}` }}>
            <span style={{ fontSize:32, color:"#fff" }}>◆</span>
          </div>
          <div className="display" style={{ fontSize:32, fontWeight:800, marginBottom:4 }}>BoBoa <span style={{ color:C.peachDk }}>Scanner</span></div>
          <div style={{ fontSize:13.5, color:C.sub }}>Scan · Identify · Price across platforms</div>
        </div>

        {!guest ? (
          <>
            <div className="r2" style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {socials.map(s => (
                <button key={s.id} onClick={() => goSocial(s.id)} style={{ display:"flex", alignItems:"center", gap:12, background:s.bg, color:s.text, border:s.bord?`1px solid ${C.bord}`:"none", borderRadius:13, padding:"12px 18px", fontSize:14.5, fontWeight:600, cursor:"pointer", boxShadow:"0 4px 14px rgba(28,27,38,0.06)" }}>
                  <div style={{ width:26, height:26, borderRadius:7, background:s.bord?"#4285F4":"rgba(255,255,255,.22)", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, fontWeight:800 }}>{s.icon}</div>
                  <span style={{ flex:1, textAlign:"left" }}>{s.label}</span>
                </button>
              ))}
            </div>
            <div className="r3" style={{ display:"flex", alignItems:"center", gap:12, margin:"20px 0" }}>
              <div style={{ flex:1, height:1, background:C.bord }}/>
              <span style={{ fontSize:11, color:C.dim, letterSpacing:"0.08em" }}>OR</span>
              <div style={{ flex:1, height:1, background:C.bord }}/>
            </div>
            <button className="r3" onClick={() => setGuest(true)} style={{ width:"100%", background:"transparent", border:`1.5px dashed ${C.bord}`, borderRadius:13, padding:"13px", fontSize:14, fontWeight:600, color:C.ink, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
              <span style={{ fontSize:16 }}>👤</span> Continue as Guest
            </button>
          </>
        ) : (
          <div className="r1">
            <Card>
              <div style={{ padding:20 }}>
                <div style={{ fontSize:13, fontWeight:700, marginBottom:3 }}>Your watermark name</div>
                <div style={{ fontSize:12, color:C.sub, marginBottom:14, lineHeight:1.6 }}>Stamped on every scan at low opacity.</div>
                <input autoFocus type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. BoBoBoa" maxLength={20}
                  style={{ width:"100%", background:C.bg, border:`1.5px solid ${C.bord}`, borderRadius:11, padding:"12px 14px", fontSize:15, color:C.ink, outline:"none", marginBottom:10 }}
                  onKeyDown={e => e.key === "Enter" && goGuest()}/>
                {name && <div style={{ background:C.deep, borderRadius:9, padding:"8px 12px", marginBottom:10, fontSize:11.5, color:C.sub }}>Preview: <strong style={{ color:C.ink }}>{name} · {new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}).replace(/ /g,"-")}</strong></div>}
                {err && <div style={{ background:rgba(C.coral,.14), border:`1px solid ${rgba(C.coral,.35)}`, borderRadius:9, padding:"8px 12px", fontSize:12, color:C.coral, marginBottom:10 }}>{err}</div>}
                <PBtn onClick={goGuest}>Continue →</PBtn>
                <button onClick={() => { setGuest(false); setErr(""); setName(""); }} style={{ width:"100%", background:"transparent", border:"none", marginTop:8, padding:"6px", fontSize:12, color:C.sub, cursor:"pointer" }}>← Back</button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCREEN: WELCOME
═══════════════════════════════════════════════════════════════════════════ */
function WelcomeScreen({ user, onStart, onLogout }) {
  const [tcg, setTcg]   = useState("onepiece");
  const [lang, setLang] = useState("JP");

  return (
    <div style={{ minHeight:"100vh", background:C.bg, padding:"54px 20px 40px", position:"relative" }}>
      <style>{CSS}</style>
      <div style={{ position:"fixed", inset:0, pointerEvents:"none", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:"5%", right:"-20%", width:"55%", height:"40%", background:rgba(C.butter,.22), borderRadius:"50%", filter:"blur(80px)" }}/>
        <div style={{ position:"absolute", bottom:0, left:"-15%", width:"45%", height:"35%", background:rgba(C.sky,.2), borderRadius:"50%", filter:"blur(70px)" }}/>
      </div>

      <div style={{ position:"relative", zIndex:1, maxWidth:430, margin:"0 auto" }}>
        <div className="r1" style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:28 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:34, height:34, borderRadius:"50%", background:`linear-gradient(135deg,${C.peach},${C.rose})`, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:13, fontWeight:700 }}>{user.name[0].toUpperCase()}</div>
            <div>
              <div style={{ fontSize:12.5, fontWeight:600 }}>{user.name}</div>
              <div style={{ fontSize:10, color:C.dim, textTransform:"capitalize" }}>{user.verified ? `✓ ${user.provider}` : "Guest"}</div>
            </div>
          </div>
          <SBtn onClick={onLogout}>Sign out</SBtn>
        </div>

        <div className="r2" style={{ marginBottom:26 }}>
          <div className="display" style={{ fontSize:34, fontWeight:800, lineHeight:1.05, marginBottom:8 }}>
            Scan a card<br/><span style={{ color:C.peachDk }}>instantly.</span>
          </div>
          <div style={{ fontSize:13.5, color:C.sub, lineHeight:1.6 }}>
            Real prices from Mercari, Yahoo Auctions, Yuyu-tei, eBay and more — opened live in your browser.
          </div>
        </div>

        <div className="r3" style={{ marginBottom:22 }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.sub, marginBottom:10, letterSpacing:"0.1em", textTransform:"uppercase" }}>Step 1 · Choose TCG</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            {TCG_TYPES.map(t => {
              const sel = tcg === t.id;
              const logoColor = sel ? "#fff" : t.color;
              return (
                <button key={t.id} onClick={() => setTcg(t.id)} style={{
                  background: sel ? t.color : C.surf,
                  color: sel ? "#fff" : C.ink,
                  border: `2px solid ${sel ? t.color : C.bord}`,
                  borderRadius:18, padding:"18px 12px 14px", cursor:"pointer", textAlign:"center",
                  boxShadow: sel ? `0 8px 22px ${rgba(t.color,.32)}` : "0 2px 8px rgba(28,27,38,0.04)",
                  transition:"all .18s", display:"flex", flexDirection:"column", alignItems:"center", gap:8,
                }}>
                  <div style={{ width:76, height:76 }} dangerouslySetInnerHTML={{__html: t.logo(logoColor)}}/>
                  <div className="display" style={{ fontSize:16, fontWeight:800 }}>{t.name}</div>
                  <div style={{ fontSize:10.5, fontWeight:500, opacity:sel?0.9:0.55, letterSpacing:"0.04em", textTransform:"uppercase" }}>{t.shortName}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="r3" style={{ marginBottom:26 }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.sub, marginBottom:10, letterSpacing:"0.1em", textTransform:"uppercase" }}>Step 2 · Card language</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {LANGUAGES.map(l => {
              const sel = lang === l.id;
              return (
                <button key={l.id} onClick={() => setLang(l.id)} style={{
                  background: sel ? C.ink : C.surf,
                  color: sel ? "#fff" : C.ink,
                  border: `2px solid ${sel ? C.ink : C.bord}`,
                  borderRadius:14, padding:"14px 10px", cursor:"pointer", textAlign:"center",
                  boxShadow: sel ? "0 6px 18px rgba(28,27,38,0.2)" : "0 2px 8px rgba(28,27,38,0.04)",
                }}>
                  <div style={{ fontSize:30, marginBottom:6 }}>{l.flag}</div>
                  <div className="display" style={{ fontSize:15, fontWeight:700, marginBottom:2 }}>{l.label}</div>
                  <div style={{ fontSize:10.5, opacity:sel?0.75:0.55 }}>{l.note}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="r4">
          <PBtn onClick={() => onStart({ tcg, lang })} s={{ padding:"16px 20px", fontSize:16 }}>
            <span style={{ fontSize:19 }}>📷</span> Scan or Upload a Card
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
   SCREEN: CAPTURE — locked 4K camera, no zoom drift
═══════════════════════════════════════════════════════════════════════════ */
function CaptureScreen({ user, ctx, onCapture, onBack }) {
  const videoRef  = useRef(null);
  const frameRef  = useRef(null);
  const streamRef = useRef(null);
  const trackRef  = useRef(null);
  const fileRef   = useRef(null);
  const [mode,    setMode]    = useState("camera");
  const [status,  setStatus]  = useState("starting");
  const [errMsg,  setErrMsg]  = useState("");
  const [flash,   setFlash]   = useState(false);

  const stopCam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      trackRef.current = null;
    }
  };

  const startCam = useCallback(async () => {
    setStatus("starting"); setErrMsg("");
    try {
      // Request back camera with max resolution
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width:  { ideal: 4096, min: 1920 },
          height: { ideal: 3072, min: 1080 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });

      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      trackRef.current = track;

      // LOCK the lens/zoom after stream starts to prevent lens swap drift
      try {
        const caps = track.getCapabilities?.() || {};
        const constraints = { advanced: [] };
        // Try to lock to 1x zoom (base lens)
        if (caps.zoom) constraints.advanced.push({ zoom: caps.zoom.min || 1 });
        // Continuous autofocus — still refocuses on content but doesn't swap lens
        if (caps.focusMode?.includes("continuous")) constraints.advanced.push({ focusMode: "continuous" });
        // Continuous auto white balance
        if (caps.whiteBalanceMode?.includes("continuous")) constraints.advanced.push({ whiteBalanceMode: "continuous" });
        // Continuous auto exposure
        if (caps.exposureMode?.includes("continuous")) constraints.advanced.push({ exposureMode: "continuous" });
        // Apply after a beat so stream is stable
        setTimeout(() => track.applyConstraints(constraints).catch(() => {}), 400);
      } catch(e) { /* capabilities API not supported — fine */ }

      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        v.setAttribute("playsinline","true");
        v.muted = true;
        v.onloadedmetadata = () => v.play()
          .then(() => setStatus("live"))
          .catch(e => { setErrMsg("Video: " + e.message); setStatus("error"); });
      }
    } catch(e) {
      setErrMsg(e.name === "NotAllowedError"
        ? "Camera denied.\n\niPhone: Settings → Safari → Camera → Allow"
        : "Camera: " + e.message);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (mode === "camera") startCam();
    return stopCam;
  }, [mode, startCam]);

  const dateStr = new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}).replace(/ /g,"-");
  const watermark = `${user.name} · ${dateStr}`;

  const capture = () => {
    const v = videoRef.current, f = frameRef.current;
    if (!v || !f || status !== "live") return;
    setFlash(true); setTimeout(() => setFlash(false), 150);
    const result = captureCard({ video: v, frameEl: f, watermark });
    stopCam();
    onCapture(result);
  };

  const handleUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        const ctx2 = canvas.getContext("2d");
        ctx2.imageSmoothingEnabled = true; ctx2.imageSmoothingQuality = "high";
        ctx2.drawImage(img, 0, 0);

        const fw = canvas.width, fh = canvas.height;
        const fs = Math.max(16, Math.round(fw * 0.022));
        ctx2.font = `500 ${fs}px Inter, sans-serif`;
        const tw = ctx2.measureText(watermark).width;
        const pad = Math.round(fw * 0.016);
        ctx2.save();
        ctx2.globalAlpha = 0.36; ctx2.fillStyle = "rgba(0,0,0,0.55)";
        ctx2.beginPath(); ctx2.roundRect(fw-tw-pad*3, fh-fs-pad*1.8, tw+pad*2.4, fs+pad*1.2, 6); ctx2.fill();
        ctx2.globalAlpha = 0.8; ctx2.fillStyle = "#fff";
        ctx2.fillText(watermark, fw-tw-pad*1.8, fh-pad*0.8);
        ctx2.restore();

        const cpct = 0.30, ccw = Math.round(fw*cpct), cch = Math.round(fh*cpct);
        const corners = [
          {label:"TL",sx:0,sy:0}, {label:"TR",sx:fw-ccw,sy:0},
          {label:"BL",sx:0,sy:fh-cch}, {label:"BR",sx:fw-ccw,sy:fh-cch},
        ];
        const gap = 6;
        const grid = document.createElement("canvas");
        grid.width = ccw*2 + gap*3; grid.height = cch*2 + gap*3;
        const gc = grid.getContext("2d");
        gc.imageSmoothingEnabled = true; gc.imageSmoothingQuality = "high";
        gc.fillStyle = "#1C1B26"; gc.fillRect(0,0,grid.width,grid.height);
        corners.forEach((c,i) => {
          const col = i%2, row = Math.floor(i/2);
          const dx = gap + col*(ccw+gap), dy = gap + row*(cch+gap);
          gc.drawImage(canvas, c.sx, c.sy, ccw, cch, dx, dy, ccw, cch);
          const ls = Math.round(cch*0.09);
          gc.fillStyle = "rgba(240,158,122,0.9)";
          gc.beginPath(); gc.roundRect(dx+6, dy+6, ls*2.5, ls*1.5, 4); gc.fill();
          gc.fillStyle = "#fff"; gc.font = `700 ${ls}px JetBrains Mono, monospace`;
          gc.fillText(c.label, dx+10, dy+ls*1.3);
        });

        onCapture({
          full:    canvas.toDataURL("image/jpeg", 0.98),
          corners: grid.toDataURL("image/jpeg", 0.95),
          cornersSeparate: corners.map(c => {
            const cv = document.createElement("canvas");
            cv.width = ccw; cv.height = cch;
            cv.getContext("2d").drawImage(canvas, c.sx, c.sy, ccw, cch, 0, 0, ccw, cch);
            return { label: c.label, src: cv.toDataURL("image/jpeg", 0.95) };
          }),
        });
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const tcg  = TCG_TYPES.find(t => t.id === ctx.tcg);
  const lang = LANGUAGES.find(l => l.id === ctx.lang);

  return (
    <div style={{ position:"fixed", inset:0, background:"#000", display:"flex", flexDirection:"column" }}>
      <style>{CSS}</style>

      {/* Top bar */}
      <div style={{ position:"absolute", top:0, left:0, right:0, zIndex:10, padding:"48px 18px 10px", background:"linear-gradient(to bottom,rgba(0,0,0,0.7),transparent)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <button onClick={() => { stopCam(); onBack(); }} style={{ background:"rgba(255,255,255,.16)", border:"1px solid rgba(255,255,255,.22)", borderRadius:11, padding:"7px 13px", fontSize:13, fontWeight:600, color:"#fff", cursor:"pointer" }}>← Back</button>
        <div style={{ display:"flex", background:"rgba(0,0,0,.4)", borderRadius:11, padding:3, gap:2 }}>
          <button onClick={() => { if (mode !== "camera") { stopCam(); setMode("camera"); } }} style={{ background:mode==="camera"?"rgba(255,255,255,.22)":"transparent", border:"none", borderRadius:9, padding:"6px 14px", fontSize:12, fontWeight:600, color:"#fff", cursor:"pointer" }}>📷 Camera</button>
          <button onClick={() => { stopCam(); setMode("upload"); }} style={{ background:mode==="upload"?"rgba(255,255,255,.22)":"transparent", border:"none", borderRadius:9, padding:"6px 14px", fontSize:12, fontWeight:600, color:"#fff", cursor:"pointer" }}>🖼 Upload</button>
        </div>
        <div style={{ background:"rgba(255,255,255,.16)", border:"1px solid rgba(255,255,255,.22)", borderRadius:11, padding:"6px 10px", fontSize:11, color:"#fff", display:"flex", gap:6 }}>
          <span style={{ fontWeight:700 }}>{tcg?.shortName}</span><span>·</span><span>{lang?.flag}</span>
        </div>
      </div>

      {mode === "camera" && (
        <>
          <video ref={videoRef} playsInline muted autoPlay style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", display:status==="live"?"block":"none" }}/>
          {flash && <div style={{ position:"absolute", inset:0, background:"#fff", opacity:.85, zIndex:20 }}/>}

          {status === "starting" && (
            <div style={{ position:"absolute", inset:0, background:C.dark, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16 }}>
              <div style={{ width:50, height:50, border:`3px solid ${C.peach}`, borderTopColor:"transparent", borderRadius:"50%", animation:"spin .8s linear infinite" }}/>
              <div style={{ color:"#fff", fontSize:15, fontWeight:600 }}>Opening camera…</div>
              <div style={{ fontSize:12, color:"rgba(255,255,255,.5)", textAlign:"center", padding:"0 40px", lineHeight:1.7 }}>Tap <strong style={{color:"#fff"}}>Allow</strong> when prompted · Locking to 1× main lens</div>
            </div>
          )}
          {status === "error" && (
            <div style={{ position:"absolute", inset:0, background:C.dark, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"32px 24px", gap:14, textAlign:"center" }}>
              <div style={{ fontSize:44 }}>📷</div>
              <div style={{ fontSize:18, fontWeight:700, color:C.coral }}>Camera Error</div>
              <div style={{ fontSize:13, color:"rgba(255,255,255,.6)", lineHeight:1.7, whiteSpace:"pre-line", maxWidth:320 }}>{errMsg}</div>
              <button onClick={startCam} style={{ background:C.peachDk, border:"none", borderRadius:12, padding:"12px 28px", fontSize:14, fontWeight:700, color:"#fff", cursor:"pointer", marginTop:6 }}>Try Again</button>
              <button onClick={() => { stopCam(); setMode("upload"); }} style={{ background:"transparent", border:"1px solid rgba(255,255,255,.2)", borderRadius:12, padding:"10px 28px", fontSize:13, color:"rgba(255,255,255,.5)", cursor:"pointer" }}>Use Upload instead</button>
            </div>
          )}

          {/* Full-screen framing guide */}
          <div style={{ position:"absolute", inset:0, zIndex:4, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <div ref={frameRef} style={{ position:"relative", width:"92%", maxWidth:360, aspectRatio:"63/88" }}>
              {[
                {top:0,left:0,   borderTop:`3px solid ${C.peach}`, borderLeft:`3px solid ${C.peach}`},
                {top:0,right:0,  borderTop:`3px solid ${C.peach}`, borderRight:`3px solid ${C.peach}`},
                {bottom:0,left:0,borderBottom:`3px solid ${C.peach}`, borderLeft:`3px solid ${C.peach}`},
                {bottom:0,right:0,borderBottom:`3px solid ${C.peach}`, borderRight:`3px solid ${C.peach}`},
              ].map((s,i) => <div key={i} style={{ position:"absolute", width:32, height:32, borderRadius:4, ...s }}/>)}
              <div style={{ position:"absolute", inset:0, border:`1.5px dashed ${rgba(C.peach,.55)}`, borderRadius:8 }}/>
              {status === "live" && <div style={{ position:"absolute", left:4, right:4, height:2, top:"50%", background:`linear-gradient(90deg,transparent,${C.peach},transparent)`, boxShadow:`0 0 12px ${C.peach}`, animation:"scanLine 2.2s ease-in-out infinite" }}/>}
              {/* Code region hint */}
              <div style={{ position:"absolute", bottom:8, right:8, background:rgba(C.peach,0.88), borderRadius:6, padding:"4px 8px", fontSize:10, fontWeight:700, color:"#fff", letterSpacing:"0.04em" }}>
                Code ↙ here
              </div>
            </div>
          </div>

          {status === "live" && (
            <div style={{ position:"absolute", bottom:0, left:0, right:0, zIndex:5, padding:"16px 24px 40px", background:"linear-gradient(to top,rgba(0,0,0,.75),transparent)" }}>
              <div style={{ textAlign:"center", marginBottom:14, fontSize:12, color:"rgba(255,255,255,.75)", fontWeight:500 }}>
                Fit card inside frame · 4K quality · Lens locked
              </div>
              <div style={{ display:"flex", justifyContent:"center" }}>
                <button onClick={capture} style={{ width:72, height:72, borderRadius:"50%", background:"#fff", border:"4px solid rgba(255,255,255,.35)", cursor:"pointer", padding:0, display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 24px rgba(0,0,0,.4)" }}>
                  <div style={{ width:56, height:56, borderRadius:"50%", background:`linear-gradient(135deg,${C.peach},${C.peachDk})`, boxShadow:`0 0 18px ${rgba(C.peachDk,.6)}` }}/>
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {mode === "upload" && (
        <div style={{ position:"absolute", inset:0, background:C.dark, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"40px 28px", gap:18 }}>
          <div style={{ width:80, height:80, borderRadius:22, background:rgba(C.peach,.15), border:`2px dashed ${rgba(C.peach,.5)}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:36 }}>🖼</div>
          <div style={{ textAlign:"center" }}>
            <div className="display" style={{ fontSize:22, fontWeight:700, color:"#fff", marginBottom:6 }}>Upload a card photo</div>
            <div style={{ fontSize:13, color:"rgba(255,255,255,.55)", lineHeight:1.6, maxWidth:260 }}>Choose any photo from your gallery. Use a well-lit, flat photo.</div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} style={{ display:"none" }}/>
          <button onClick={() => fileRef.current?.click()} style={{ background:`linear-gradient(135deg,${C.peach},${C.peachDk})`, border:"none", borderRadius:14, padding:"14px 32px", fontSize:15, fontWeight:700, color:"#fff", cursor:"pointer", boxShadow:`0 6px 20px ${rgba(C.peachDk,.4)}` }}>
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
  "Analysing card image…",
  "Reading card code…",
  "Detecting language…",
  "Identifying rarity…",
  "Listing candidates…",
  "Building report…",
];

function ProcessingScreen({ photos, ctx, onDone }) {
  const [step, setStep] = useState(0);
  const [pct,  setPct]  = useState(0);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; ran.current = true;
    let i = 0;
    const iv = setInterval(() => {
      i++; setStep(i); setPct(Math.round((i/STEPS.length)*100));
      if (i >= STEPS.length - 1) {
        clearInterval(iv);
        boboaIdentify({ imageDataUrl: photos.full, tcgType: ctx.tcg, language: ctx.lang })
          .then(idResult => setTimeout(() => onDone({ identify: idResult }), 500));
      }
    }, 340);
    return () => clearInterval(iv);
  }, [photos, ctx, onDone]);

  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:22, padding:"40px 30px", position:"relative", overflow:"hidden" }}>
      <style>{CSS}</style>
      <div style={{ position:"absolute", top:"20%", left:"-20%", width:"60%", height:"40%", background:rgba(C.peach,.18), borderRadius:"50%", filter:"blur(80px)" }}/>
      <div style={{ position:"absolute", bottom:"15%", right:"-20%", width:"60%", height:"40%", background:rgba(C.lav,.18), borderRadius:"50%", filter:"blur(80px)" }}/>

      <div className="r1" style={{ position:"relative", width:100, height:100, zIndex:1 }}>
        <div style={{ position:"absolute", inset:0, border:`3px solid ${rgba(C.peach,.22)}`, borderRadius:"50%" }}/>
        <div style={{ position:"absolute", inset:0, border:"3px solid transparent", borderTopColor:C.peachDk, borderRadius:"50%", animation:"spin .9s linear infinite" }}/>
        <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <span className="display" style={{ fontSize:22, fontWeight:700, color:C.peachDk }}>{pct}%</span>
        </div>
      </div>
      <div className="r2" style={{ textAlign:"center", zIndex:1 }}>
        <div className="display" style={{ fontSize:24, fontWeight:700, marginBottom:5 }}>BoBoa AI working…</div>
        <div style={{ fontSize:13, color:C.sub }}>{STEPS[step-1] || STEPS[0]}</div>
      </div>
      <div style={{ width:"100%", maxWidth:290, height:5, background:C.deep, borderRadius:99, zIndex:1 }}>
        <div style={{ height:"100%", width:`${pct}%`, background:`linear-gradient(90deg,${C.peach},${C.peachDk})`, borderRadius:99, transition:"width .35s" }}/>
      </div>
      {photos.corners && (
        <div className="r3" style={{ width:"100%", maxWidth:220, textAlign:"center", zIndex:1 }}>
          <div style={{ fontSize:10, color:C.dim, marginBottom:8, letterSpacing:".1em" }} className="mono">CORNERS · EXTRACTED</div>
          <img src={photos.corners} alt="corners" style={{ width:"100%", borderRadius:12, border:`1px solid ${C.bord}` }}/>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCREEN: CARD PICKER
═══════════════════════════════════════════════════════════════════════════ */
function CardPickerScreen({ photos, aiData, ctx, onSelect, onRescan, onOpenImage }) {
  const idResult = aiData?.identify;
  const candidates = idResult?.success ? (idResult.data?.candidates || []) : [];

  const [selected,    setSelected]    = useState(candidates[0]?.cardId || null);
  const [manualId,    setManualId]    = useState("");
  const [showManual,  setShowManual]  = useState(candidates.length === 0);
  const [lookingUp,   setLookingUp]   = useState(false);

  const tcg  = TCG_TYPES.find(t => t.id === ctx.tcg);
  const lang = LANGUAGES.find(l => l.id === ctx.lang);

  const handleConfirm = async () => {
    const cardId = showManual ? manualId.trim().toUpperCase() : selected;
    if (!cardId) return;
    setLookingUp(true);
    const aiCard = candidates.find(c => c.cardId === cardId);
    const fallbackName = aiCard?.name || candidates[0]?.name || "";
    const dbResult = await lookupCard({ cardId, tcg: ctx.tcg, language: ctx.lang, fallbackName });
    setLookingUp(false);

    onSelect({
      ...dbResult,
      cardId,
      tcgType: ctx.tcg,
      // Prefer AI-detected rarity, then DB rarity, then blank
      aiRarity: aiCard?.rarity || "",
      language: idResult?.data?.language || ctx.lang,
      confidence: aiCard?.confidence || (dbResult.ok ? 70 : 40),
      evidence: aiCard?.evidence || "",
    });
  };

  const confColor = (c) => c >= 85 ? C.sageDk : c >= 65 ? C.butterDk : C.coral;

  return (
    <div style={{ maxWidth:430, margin:"0 auto", background:C.bg, minHeight:"100vh" }}>
      <style>{CSS}</style>
      <div style={{ background:C.surf, borderBottom:`1px solid ${C.bord}`, padding:"46px 18px 12px", position:"sticky", top:0, zIndex:40 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <SBtn onClick={onRescan}>← Rescan</SBtn>
          <div className="display" style={{ fontSize:15, fontWeight:700 }}>Confirm Card</div>
          <div style={{ width:72 }}/>
        </div>
      </div>

      <div style={{ padding:"14px 16px 110px", display:"flex", flexDirection:"column", gap:12 }}>
        {/* Photos — tap to zoom */}
        <div className="r1" style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:10 }}>
          <button onClick={() => onOpenImage({ image: photos.full, label: "Full card" })}
            style={{ background:"transparent", border:"none", padding:0, cursor:"zoom-in", textAlign:"left" }}>
            <Card>
              <img src={photos.full} alt="card" style={{ width:"100%", aspectRatio:"63/88", objectFit:"cover", display:"block" }}/>
              <div style={{ padding:"6px 12px", fontSize:10, color:C.sub, display:"flex", justifyContent:"space-between" }} className="mono">
                <span>CAPTURED</span><span>🔍 tap to zoom</span>
              </div>
            </Card>
          </button>
          <button onClick={() => onOpenImage({ image: photos.corners, label: "4 Corners" })}
            style={{ background:"transparent", border:"none", padding:0, cursor:"zoom-in", textAlign:"left" }}>
            <Card>
              <img src={photos.corners} alt="corners" style={{ width:"100%", aspectRatio:"1/1", objectFit:"cover", display:"block" }}/>
              <div style={{ padding:"6px 12px", fontSize:10, color:C.sub, display:"flex", justifyContent:"space-between" }} className="mono">
                <span>CORNERS</span><span>🔍</span>
              </div>
            </Card>
          </button>
        </div>

        {/* Language / TCG detected */}
        <div className="r2">
          <Card>
            <div style={{ padding:"12px 16px", display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
              <Pill ch={`${lang?.flag} ${idResult?.data?.language || ctx.lang}`} color={C.skyDk}/>
              <Pill ch={`${tcg?.shortName}`} color={tcg?.color || C.coral}/>
              {idResult?.data?.cardIdRegion && <div style={{ fontSize:11, color:C.sub }}>📍 {idResult.data.cardIdRegion}</div>}
            </div>
          </Card>
        </div>

        {/* Candidate list */}
        {candidates.length > 0 && (
          <div className="r3">
            <Card>
              <Hdr accent={C.peachDk}>◆ BoBoa AI · Candidates — tap to select</Hdr>
              <div style={{ padding:"8px 0" }}>
                {candidates.map((c,i) => {
                  const sel = selected === c.cardId;
                  return (
                    <button key={i} onClick={() => { setSelected(c.cardId); setShowManual(false); }} style={{
                      display:"block", width:"100%", textAlign:"left",
                      background: sel ? rgba(C.peachDk,.08) : "transparent",
                      border:"none",
                      borderLeft: sel ? `3px solid ${C.peachDk}` : "3px solid transparent",
                      borderBottom: i < candidates.length - 1 ? `1px solid ${C.line}` : "none",
                      padding:"12px 16px", cursor:"pointer",
                    }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10 }}>
                        <div style={{ flex:1 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                            <span className="mono" style={{ fontSize:12.5, fontWeight:700, color:C.peachDk }}>{c.cardId}</span>
                            {c.rarity && <Pill ch={c.rarity} color={C.lavDk} s={{fontSize:9}}/>}
                          </div>
                          <div className="display" style={{ fontSize:16, fontWeight:700, lineHeight:1.1, marginBottom:2 }}>{c.name}</div>
                          {c.nameOriginal && c.nameOriginal !== c.name && <div className="mono" style={{ fontSize:11, color:C.dim }}>{c.nameOriginal}</div>}
                          {c.setName && <div style={{ fontSize:12, color:C.sub, marginTop:3 }}>{c.setName}</div>}
                          {c.evidence && <div style={{ fontSize:11, color:C.dim, marginTop:4, lineHeight:1.5 }}>💡 {c.evidence}</div>}
                        </div>
                        <div style={{ textAlign:"right", flexShrink:0 }}>
                          <div className="display" style={{ fontSize:22, fontWeight:800, color:confColor(c.confidence), lineHeight:1 }}>{c.confidence}%</div>
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

        {/* Manual entry */}
        <div className="r4">
          <Card>
            <button onClick={() => setShowManual(m => !m)} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", width:"100%", background:"transparent", border:"none", padding:"13px 16px", cursor:"pointer" }}>
              <div style={{ fontSize:13.5, fontWeight:600, color:C.ink }}>
                {candidates.length > 0 ? "None match — enter manually" : "Enter card number manually"}
              </div>
              <span style={{ fontSize:18, color:C.sub }}>{showManual ? "▲" : "▼"}</span>
            </button>
            {showManual && (
              <div style={{ padding:"0 16px 16px", borderTop:`1px solid ${C.line}` }}>
                <div style={{ fontSize:12, color:C.sub, margin:"12px 0 8px", lineHeight:1.5 }}>{tcg?.codeHint}</div>
                <input type="text" value={manualId} onChange={e => { setManualId(e.target.value.toUpperCase()); setSelected(null); }} placeholder={tcg?.id === "onepiece" ? "e.g. OP07-051" : "e.g. LOCH-JP003"}
                  style={{ width:"100%", background:C.bg, border:`1.5px solid ${C.bord}`, borderRadius:11, padding:"11px 12px", fontSize:14, color:C.ink, outline:"none", fontFamily:"JetBrains Mono, monospace" }}/>
              </div>
            )}
          </Card>
        </div>
      </div>

      <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:430, background:"rgba(250,247,242,.96)", backdropFilter:"blur(16px)", borderTop:`1px solid ${C.bord}`, padding:"11px 16px 28px", display:"flex", gap:10 }}>
        <SBtn onClick={onRescan} s={{ flex:1, padding:"12px" }}>📷 Rescan</SBtn>
        <PBtn onClick={handleConfirm} disabled={(!selected && !manualId.trim()) || lookingUp} s={{ flex:2, padding:"12px", fontSize:14 }}>
          {lookingUp ? (
            <><div style={{ width:16, height:16, border:"2px solid rgba(255,255,255,.4)", borderTopColor:"#fff", borderRadius:"50%", animation:"spin .7s linear infinite" }}/> Looking up…</>
          ) : "Confirm & Continue →"}
        </PBtn>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCREEN: RARITY PICKER — uses correct JP/EN system per TCG
═══════════════════════════════════════════════════════════════════════════ */
function RarityScreen({ photos, card, ctx, onConfirm, onBack, onOpenImage }) {
  const rarityList = RARITIES[ctx.tcg]?.[ctx.lang] || [];
  const aiRarity = card.aiRarity || card.rarityFromDB;
  const [rarity, setRarity] = useState(
    rarityList.find(r => r.id === aiRarity)?.id || rarityList[0]?.id
  );
  // DON!! mode — special One Piece resource card
  const [isDon, setIsDon] = useState(false);
  const donList = ctx.tcg === "onepiece" ? (DON_VARIANTS[ctx.lang] || DON_VARIANTS.JP) : [];
  const [donVariant, setDonVariant] = useState(donList[0]?.id || null);

  const selectedRarity = rarityList.find(r => r.id === rarity);
  const selectedDon    = donList.find(d => d.id === donVariant);

  const handleConfirm = () => {
    if (isDon) {
      const don = selectedDon || donList[0];
      onConfirm({
        ...card,
        rarity: don.id,
        rarityLabel: don.label,
        isDon: true,
        donVariant: don,
        // Mercari/eBay search using don-specific terms
        searchOverrideJP: don.searchJP,
        searchOverrideEN: don.searchEN,
      });
    } else {
      onConfirm({ ...card, rarity });
    }
  };

  return (
    <div style={{ maxWidth:430, margin:"0 auto", background:C.bg, minHeight:"100vh" }}>
      <style>{CSS}</style>
      <div style={{ background:C.surf, borderBottom:`1px solid ${C.bord}`, padding:"46px 18px 12px", position:"sticky", top:0, zIndex:40 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <SBtn onClick={onBack}>← Back</SBtn>
          <div className="display" style={{ fontSize:15, fontWeight:700 }}>Select Rarity · {ctx.lang}</div>
          <div style={{ width:72 }}/>
        </div>
      </div>

      <div style={{ padding:"14px 16px 110px", display:"flex", flexDirection:"column", gap:12 }}>

        {/* Card preview */}
        <div className="r1">
          <Card>
            <div style={{ padding:"14px 16px", display:"flex", gap:12, alignItems:"center" }}>
              <button onClick={() => onOpenImage({ image: photos.full, label: card.name })}
                style={{ background:"transparent", border:"none", padding:0, cursor:"zoom-in" }}>
                <img src={photos.full} alt="card" style={{ width:70, aspectRatio:"63/88", objectFit:"cover", borderRadius:9, boxShadow:"0 4px 14px rgba(28,27,38,.18)" }}/>
              </button>
              <div style={{ flex:1, minWidth:0 }}>
                <div className="mono" style={{ fontSize:10, color:C.peachDk, marginBottom:4, fontWeight:600 }}>{card.cardId}</div>
                <div className="display" style={{ fontSize:18, fontWeight:700, lineHeight:1.15, marginBottom:4 }}>{card.name}</div>
                {card.setName && <div style={{ fontSize:12, color:C.sub, marginBottom:3 }}>{card.setName}</div>}
                {aiRarity && <div style={{ fontSize:11, color:C.dim }}>AI suggested: <strong style={{color:C.ink}}>{aiRarity}</strong></div>}
              </div>
            </div>
          </Card>
        </div>

        {/* DON!! toggle — One Piece only */}
        {ctx.tcg === "onepiece" && (
          <div className="r2">
            <Card>
              <div style={{ padding:"14px 16px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ fontSize:14, fontWeight:700, marginBottom:2 }}>
                    {ctx.lang === "JP" ? "ドン!! カードですか？" : "Is this a DON!! Card?"}
                  </div>
                  <div style={{ fontSize:11.5, color:C.sub }}>
                    {ctx.lang === "JP" ? "資源カード — セットコードなし" : "Resource card — no set code"}
                  </div>
                </div>
                <button onClick={() => setIsDon(d => !d)} style={{
                  width:50, height:28, borderRadius:99,
                  background: isDon ? C.sageDk : C.bord,
                  border:"none", cursor:"pointer", position:"relative",
                  transition:"background .2s",
                }}>
                  <div style={{
                    position:"absolute", top:3, left: isDon?24:3, width:22, height:22,
                    borderRadius:"50%", background:"#fff",
                    transition:"left .2s",
                    boxShadow:"0 1px 4px rgba(0,0,0,0.25)",
                  }}/>
                </button>
              </div>
            </Card>
          </div>
        )}

        {/* DON!! variant picker */}
        {isDon && donList.length > 0 && (
          <div className="r3">
            <Card>
              <Hdr accent={C.sageDk}>
                {ctx.lang === "JP" ? "DON!! バリエーション" : "DON!! Card variant"}
              </Hdr>
              <div style={{ padding:"14px", display:"flex", flexDirection:"column", gap:10 }}>
                {donList.map(don => {
                  const sel = donVariant === don.id;
                  return (
                    <button key={don.id} onClick={() => setDonVariant(don.id)} style={{
                      display:"flex", alignItems:"center", gap:12,
                      background: sel ? rgba(don.color,.1) : C.surf,
                      border: `2px solid ${sel ? don.color : C.bord}`,
                      borderRadius:14, padding:"12px 14px", cursor:"pointer", textAlign:"left",
                    }}>
                      {/* Stylized DON!! card thumbnail */}
                      <div style={{
                        width:52, height:72, borderRadius:7, flexShrink:0, overflow:"hidden",
                        background: don.style.bg, border:`2px solid ${don.style.border}`,
                        display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"flex-end",
                        padding:"4px 3px",
                        boxShadow: sel ? `0 4px 14px ${rgba(don.color,.35)}` : "0 2px 8px rgba(0,0,0,0.1)",
                      }}>
                        <div style={{ fontSize:16, marginBottom:2 }}>{don.icon}</div>
                        <div style={{ fontSize:5.5, fontWeight:800, color:don.style.text, textAlign:"center", lineHeight:1.2, letterSpacing:"0.02em" }}>
                          {ctx.lang === "JP" ? "ドン!!" : "DON!!"}
                        </div>
                        <div style={{ fontSize:4.5, color:don.style.text, opacity:0.7, marginTop:1, textAlign:"center" }}>+1000</div>
                      </div>
                      <div style={{ flex:1 }}>
                        <div className="display" style={{ fontSize:14, fontWeight:700, color: sel ? don.color : C.ink, marginBottom:3 }}>{don.label}</div>
                        <div style={{ fontSize:11, color:C.sub, marginBottom:3 }}>{don.desc}</div>
                        <div className="mono" style={{ fontSize:10, color:C.dim }}>
                          Search: {ctx.lang === "JP" ? don.searchJP : don.searchEN}
                        </div>
                      </div>
                      {sel && <div style={{ width:18, height:18, borderRadius:"50%", background:don.color, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                        <span style={{ color:"#fff", fontSize:10, fontWeight:700 }}>✓</span>
                      </div>}
                    </button>
                  );
                })}
              </div>
            </Card>
          </div>
        )}

        {/* Standard rarity grid */}
        {!isDon && (
          <div className="r2">
            <Card>
              <Hdr accent={C.lavDk}>
                {ctx.lang === "JP"
                  ? "レアリティを選択 · OCG (遊々亭表記)"
                  : "Select Rarity · TCG English"}
              </Hdr>
              <div style={{ padding:"14px" }}>
                {/* Selected rarity visual preview */}
                {selectedRarity && (
                  <div style={{
                    marginBottom:12,
                    background: rgba(selectedRarity.color,.1),
                    border:`2px solid ${selectedRarity.color}`,
                    borderRadius:12, padding:"10px 14px",
                    display:"flex", alignItems:"center", gap:12,
                  }}>
                    {/* Stylized card mockup for selected rarity */}
                    <div style={{
                      width:44, height:62, borderRadius:6, flexShrink:0,
                      background: rarityCardBg(selectedRarity.id),
                      border:`2px solid ${selectedRarity.color}`,
                      display:"flex", flexDirection:"column", alignItems:"center",
                      justifyContent:"flex-end", padding:"3px",
                      boxShadow:`0 4px 14px ${rgba(selectedRarity.color,.4)}`,
                    }}>
                      <div className="mono" style={{ fontSize:5.5, fontWeight:700, color:rarityCardText(selectedRarity.id), textAlign:"center", lineHeight:1.3 }}>
                        {selectedRarity.label.length > 12 ? selectedRarity.label.split(" ").slice(0,2).join(" ") : selectedRarity.label}
                      </div>
                    </div>
                    <div style={{ flex:1 }}>
                      <div className="display" style={{ fontSize:15, fontWeight:800, color:selectedRarity.color, marginBottom:2 }}>{selectedRarity.label}</div>
                      <div className="mono" style={{ fontSize:11, color:C.sub }}>
                        {ctx.lang === "JP" ? selectedRarity.searchJP : selectedRarity.searchEN}
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:7 }}>
                  {rarityList.map(r => {
                    const sel = rarity === r.id;
                    return (
                      <button key={r.id} onClick={() => setRarity(r.id)} style={{
                        background: sel ? r.color : C.surf,
                        color: sel ? "#fff" : C.ink,
                        border: `1.5px solid ${sel ? r.color : C.bord}`,
                        borderRadius:11, padding:"10px 8px", cursor:"pointer", textAlign:"left",
                        boxShadow: sel ? `0 4px 12px ${rgba(r.color,.3)}` : "none",
                        transition:"all .15s",
                      }}>
                        <div className="display" style={{ fontSize:13, fontWeight:700, lineHeight:1.2 }}>{r.label}</div>
                        <div style={{ fontSize:9.5, opacity: sel ? 0.85 : 0.5, marginTop:2 }} className="mono">
                          {ctx.lang === "JP" ? r.searchJP : r.searchEN}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize:11, color:C.dim, marginTop:12, lineHeight:1.5 }}>
                  {ctx.lang === "JP"
                    ? "日本語OCG：遊々亭の表記を使用。Overframe PSE・グランドマスターレアはLOCR/LOCH設定より。"
                    : "English TCG rarities from official One Piece / Yu-Gi-Oh! releases."}
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>

      <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:430, background:"rgba(250,247,242,.96)", backdropFilter:"blur(16px)", borderTop:`1px solid ${C.bord}`, padding:"11px 16px 28px", display:"flex", gap:10 }}>
        <SBtn onClick={onBack} s={{ flex:1, padding:"12px" }}>← Back</SBtn>
        <PBtn onClick={handleConfirm} s={{ flex:2, padding:"12px", fontSize:14 }}>
          {isDon ? "Confirm DON!! →" : "View Prices & Listings →"}
        </PBtn>
      </div>
    </div>
  );
}

// Card background/text based on rarity type
function rarityCardBg(id) {
  const m = {
    "C":"#e8e4d8","UC":"#d4e8d4","R":"#c4d8f0","SR":"#f0e4a0","SR-P":"#f0c8a0",
    "L":"#f0a0a0","L-P":"#d0b0f0","SEC":"#f06040","SEC-P":"#c04060","SP":"#c0a0e0",
    "MR":"#a070c0","TR":"#e8c840","PR":"#c0c0c0",
    "N":"#e8e4d8","NP":"#d4e8d4","RP":"#b8d0e8","SR":"#f0e4a0","UR":"#f0c860",
    "ULR":"#e8a060","SER":"#d04040","PSE":"#c03060","OFPSE":"#a02050","GMR":"#800020",
    "20TH":"#9060c0","QCSE":"#c08020","GR":"rgba(200,230,240,0.3)","KC":"#d04080",
    "HOL":"linear-gradient(135deg,#f0e0ff,#c0e0ff,#e0ffc0)","ORsr":"#e04020",
  };
  return m[id] || "#e8e4d8";
}
function rarityCardText(id) {
  const dark = ["C","UC","R","SR","NP","RP","N","GR"];
  return dark.includes(id) ? "#333" : "#fff";
}

/* ═══════════════════════════════════════════════════════════════════════════
   MARKETPLACE TAB — filter pills + deep-link cards per marketplace
═══════════════════════════════════════════════════════════════════════════ */
function MarketplaceTab({ links, marketplaces, card, rarOpt }) {
  const [filter, setFilter] = useState("all");

  const MARKETPLACE_META = {
    all:          { label:"All",           icon:"🌐", color:C.ink },
    mercari:      { label:"Mercari JP",    icon:"🟠", color:C.roseDk },
    yahoo:        { label:"Yahoo Auctions",icon:"🅾", color:C.lav },
    yuyutei:      { label:"Yuyu-tei",      icon:"🏯", color:C.coral },
    ebay:         { label:"eBay",          icon:"🛒", color:C.butterDk },
    tcgplayer:    { label:"TCGPlayer",     icon:"🎯", color:C.skyDk },
    cardmarket:   { label:"Cardmarket",    icon:"🇪🇺", color:"#B8860B" },
    snkrdunk:     { label:"snkrdunk",      icon:"👟", color:C.sageDk },
    pricecharting:{ label:"PriceCharting", icon:"📈", color:C.sageDk },
  };

  const filtered = filter === "all" ? links : links.filter(l => l.marketplace === filter);
  // Group by category within filtered results
  const soldLinks   = filtered.filter(l => l.category === "sold");
  const activeLinks = filtered.filter(l => l.category === "active");

  return (
    <>
      {/* Marketplace filter pills */}
      <div className="r1" style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:4, marginBottom:2 }}>
        {["all", ...marketplaces].map(id => {
          const m = MARKETPLACE_META[id] || { label:id, icon:"•", color:C.sub };
          const sel = filter === id;
          return (
            <button key={id} onClick={() => setFilter(id)} style={{
              background: sel ? m.color : C.surf,
              color: sel ? "#fff" : C.ink,
              border: `1.5px solid ${sel ? m.color : C.bord}`,
              borderRadius: 99, padding: "7px 13px",
              fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
              flexShrink: 0, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <span>{m.icon}</span>{m.label}
            </button>
          );
        })}
      </div>

      {/* Query note */}
      <div className="r2" style={{ background:rgba(C.peach,0.08), border:`1px solid ${rgba(C.peachDk,0.2)}`, borderRadius:10, padding:"10px 12px", fontSize:11.5, color:C.sub, lineHeight:1.55 }}>
        <div style={{ fontSize:10, fontWeight:700, color:C.peachDk, letterSpacing:"0.1em", marginBottom:3 }}>SEARCH QUERY</div>
        <div className="mono" style={{ color:C.ink, fontSize:11, wordBreak:"break-all" }}>
          {card.cardId}{" "}
          {card.language === "JP" ? (card.nameJP || card.nameEN || card.name) : (card.nameEN || card.name)}{" "}
          <span style={{color:C.peachDk, fontWeight:700}}>
            {card.language === "JP" ? rarOpt?.searchJP : rarOpt?.searchEN}
          </span>
        </div>
      </div>

      {/* Sold section */}
      {soldLinks.length > 0 && (
        <>
          <div className="r3" style={{ fontSize:11, fontWeight:700, color:C.sub, letterSpacing:"0.1em", textTransform:"uppercase", padding:"6px 4px 0" }}>
            ◆ Last Sold
          </div>
          {soldLinks.map((link, i) => (
            <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" className={`r${Math.min(i+3, 5)}`}>
              <Card s={{ borderColor: rgba(link.color, 0.4) }}>
                <div style={{ padding:"13px 16px", display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ fontSize:24, flexShrink:0 }}>{link.icon}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div className="display" style={{ fontSize:14.5, fontWeight:700, color:link.color, marginBottom:2 }}>{link.name}</div>
                    <div style={{ fontSize:11.5, color:C.sub, marginBottom:3 }}>{link.note}</div>
                    <div className="mono" style={{ fontSize:10, color:C.dim, wordBreak:"break-all" }}>🔍 {link.query}</div>
                  </div>
                  <div style={{ fontSize:18, color:C.dim }}>›</div>
                </div>
              </Card>
            </a>
          ))}
        </>
      )}

      {/* Active section */}
      {activeLinks.length > 0 && (
        <>
          <div className="r4" style={{ fontSize:11, fontWeight:700, color:C.sub, letterSpacing:"0.1em", textTransform:"uppercase", padding:"12px 4px 0" }}>
            ◇ Current Listings
          </div>
          {activeLinks.map((link, i) => (
            <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" className={`r${Math.min(i+3, 5)}`}>
              <Card s={{ borderColor: rgba(link.color, 0.4) }}>
                <div style={{ padding:"13px 16px", display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ fontSize:24, flexShrink:0 }}>{link.icon}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div className="display" style={{ fontSize:14.5, fontWeight:700, color:link.color, marginBottom:2 }}>{link.name}</div>
                    <div style={{ fontSize:11.5, color:C.sub, marginBottom:3 }}>{link.note}</div>
                    <div className="mono" style={{ fontSize:10, color:C.dim, wordBreak:"break-all" }}>🔍 {link.query}</div>
                  </div>
                  <div style={{ fontSize:18, color:C.dim }}>›</div>
                </div>
              </Card>
            </a>
          ))}
        </>
      )}

      {filtered.length === 0 && (
        <div className="r3" style={{ padding:"40px 20px", textAlign:"center", color:C.dim, fontSize:13 }}>
          No {MARKETPLACE_META[filter]?.label || filter} links for this card.
        </div>
      )}

      {/* Honest caveat on embedded thumbnails */}
      <div className="r5" style={{ background:rgba(C.butter,0.12), border:`1px solid ${rgba(C.butterDk,0.3)}`, borderRadius:10, padding:"12px 14px", fontSize:11.5, color:C.sub, lineHeight:1.65, marginTop:4 }}>
        <div style={{ fontSize:12, fontWeight:700, color:C.butterDk, marginBottom:5 }}>ℹ️ About embedded listings</div>
        Mercari, Yahoo, eBay and Yuyu-tei all block server scrapers (Cloudflare / bot detection).
        Tapping any link above opens the real live page in your browser — that's where you see the thumbnails and exact per-listing prices.
        For in-app embedded thumbnails we'd need a paid scraping API (~$4 per 1,000 listings via Apify).
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCREEN: RESULT — deep-link to Mercari/Yahoo/Yuyu-tei/eBay
═══════════════════════════════════════════════════════════════════════════ */
function ResultScreen({ photos, card, user, onRescan, onOpenImage }) {
  const [tab, setTab] = useState("prices");

  const rarityList = RARITIES[card.tcgType]?.[card.language] || [];
  const rarOpt = rarityList.find(r => r.id === card.rarity) || rarityList[0];
  const tcg = TCG_TYPES.find(t => t.id === card.tcgType);

  const links = buildSearchLinks({
    cardId: card.cardId,
    cardNameJP: card.nameJP,
    cardNameEN: card.nameEN || (card.name !== `Card ${card.cardId}` ? card.name : ""),
    rarityOpt: rarOpt,
    tcg: card.tcgType, language: card.language, setSlug: card.setSlug,
    searchOverrideJP: card.searchOverrideJP,
    searchOverrideEN: card.searchOverrideEN,
  });
  const soldLinks    = links.filter(l => l.category === "sold");
  const activeLinks  = links.filter(l => l.category === "active");
  const infoLinks    = links.filter(l => l.category === "info");
  const priceSamples = card.priceSamples || [];

  // Marketplaces present in link list — for filter tabs
  const marketplaces = [...new Set(links.filter(l => l.category !== "info").map(l => l.marketplace))];

  return (
    <div style={{ maxWidth:430, margin:"0 auto", background:C.bg, minHeight:"100vh" }}>
      <style>{CSS}</style>

      {/* Header */}
      <div style={{ background:C.surf, borderBottom:`1px solid ${C.bord}`, padding:"44px 16px 0", position:"sticky", top:0, zIndex:40 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <SBtn onClick={onRescan}>📷 Scan</SBtn>
          <div style={{ display:"flex", gap:4 }}>
            {card.ok ? <Pill ch="✓ DB Match" color={C.sageDk}/> : <Pill ch="AI Only" color={C.butterDk}/>}
            {priceSamples.length > 0 && <Pill ch={`${priceSamples.length} prices`} color={C.peachDk}/>}
          </div>
        </div>

        <div style={{ display:"flex", gap:13, alignItems:"flex-start", marginBottom:10 }}>
          <button onClick={() => onOpenImage({ image: photos.full, label: card.name })}
            style={{ background:"transparent", border:"none", padding:0, cursor:"zoom-in", flexShrink:0 }}>
            <img src={photos.full} alt="card" style={{ width:88, aspectRatio:"63/88", objectFit:"cover", borderRadius:11, boxShadow:"0 6px 20px rgba(28,27,38,.2)" }}/>
          </button>
          <div style={{ flex:1, minWidth:0 }}>
            <div className="mono" style={{ fontSize:10, color:C.peachDk, letterSpacing:".1em", marginBottom:4, fontWeight:600 }}>
              {card.set || tcg?.shortName} · {card.cardId}
            </div>
            <div className="display" style={{ fontSize:20, fontWeight:800, lineHeight:1.1, marginBottom:5 }}>{card.name}</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:5 }}>
              <Pill ch={rarOpt?.label || card.rarity} color={rarOpt?.color} s={{fontSize:10}}/>
              <Pill ch={card.language} color={C.skyDk} s={{fontSize:10}}/>
              {tcg && <Pill ch={tcg.shortName} color={tcg.color} s={{fontSize:10}}/>}
            </div>
            <div style={{ fontSize:11.5, color:C.sub, lineHeight:1.65 }}>
              {card.setName && <strong style={{color:C.ink}}>{card.setName}</strong>}
              {card.nameJP && <><br/><span className="mono" style={{fontSize:11,color:C.dim}}>{card.nameJP}</span></>}
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div style={{ display:"flex", gap:6, marginBottom:10 }}>
          <div style={{ flex:1, background:C.deep, borderRadius:10, padding:"9px 5px", textAlign:"center" }}>
            <div style={{ fontSize:10, color:C.sub, marginBottom:2 }}>AI Match</div>
            <div className="display" style={{ fontSize:15, fontWeight:800, color: card.confidence >= 85 ? C.sageDk : C.butterDk }}>{card.confidence}%</div>
          </div>
          <div style={{ flex:1, background:C.deep, borderRadius:10, padding:"9px 5px", textAlign:"center" }}>
            <div style={{ fontSize:10, color:C.sub, marginBottom:2 }}>Rarity</div>
            <div className="display" style={{ fontSize:14, fontWeight:800, color: rarOpt?.color || C.ink }}>{rarOpt?.label}</div>
          </div>
          <div style={{ flex:1.5, background:rgba(C.roseDk,.1), border:`1px solid ${rgba(C.roseDk,.25)}`, borderRadius:10, padding:"9px 5px", textAlign:"center" }}>
            <div style={{ fontSize:10, color:C.roseDk, marginBottom:2, fontWeight:700 }}>🌐 Live lookups</div>
            <div className="display" style={{ fontSize:14, fontWeight:800, color:C.roseDk }}>{links.length} sites</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", borderTop:`1px solid ${C.bord}`, margin:"0 -16px" }}>
          {[
            { id:"prices",  label:"Prices",    count: priceSamples.length || null },
            { id:"search",  label:"Marketplaces", count: links.filter(l=>l.category!=="info").length },
            { id:"info",    label:"Card Info", count: null },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex:1, background:"none", border:"none",
              borderBottom:`2px solid ${tab===t.id?C.peachDk:"transparent"}`,
              color:tab===t.id?C.peachDk:C.sub, padding:"11px 2px", fontSize:12.5,
              fontWeight: tab===t.id ? 700 : 500, cursor:"pointer",
            }}>
              {t.label}{t.count ? <span style={{ opacity:0.55, marginLeft:4 }}>·{t.count}</span> : ""}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding:"14px 16px 100px", display:"flex", flexDirection:"column", gap:12 }}>

        {/* ═════ PRICES tab — real samples from free APIs ═════ */}
        {tab === "prices" && (
          <>
            {priceSamples.length > 0 ? (
              <>
                <div className="r1" style={{ background:rgba(C.sage,0.12), border:`1px solid ${rgba(C.sageDk,0.25)}`, borderRadius:12, padding:"12px 14px", fontSize:12.5, color:C.sub, lineHeight:1.55 }}>
                  <strong style={{ color:C.sageDk }}>✓ {priceSamples.length} real price sources found</strong> from free public APIs (YGOProDeck, OPTCGAPI) — updated daily.
                </div>
                {priceSamples.slice(0, 8).map((p, i) => (
                  <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" className={`r${Math.min(i+2, 5)}`}>
                    <Card s={{ borderColor: rgba(p.color || C.peach, 0.4) }}>
                      <div style={{ padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
                        <div style={{ fontSize:26 }}>{p.icon}</div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div className="display" style={{ fontSize:15, fontWeight:700, color:p.color || C.ink, marginBottom:2 }}>{p.source}</div>
                          <div style={{ fontSize:10.5, color:C.dim }}>
                            via {p.via} · {p.freshness || "cached"}
                          </div>
                        </div>
                        <div style={{ textAlign:"right" }}>
                          <div className="display" style={{ fontSize:17, fontWeight:800, color:C.ink, lineHeight:1 }}>{fmtTHB(p.priceTHB)}</div>
                          <div className="mono" style={{ fontSize:11, color:C.sub, marginTop:2 }}>
                            {fmtUSD(p.priceUSD)}
                            {p.currency && p.currency !== "USD" && p.currency !== "THB" && (
                              <span style={{marginLeft:6, color:C.dim}}>
                                {p.currency === "EUR" ? "€" : p.currency === "JPY" ? "¥" : p.currency}{p.priceNative?.toFixed(p.currency==="JPY"?0:2)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </Card>
                  </a>
                ))}
              </>
            ) : (
              <div className="r1" style={{ background:rgba(C.butter,0.14), border:`1px solid ${rgba(C.butterDk,0.35)}`, borderRadius:12, padding:"16px", fontSize:13, color:C.sub, lineHeight:1.65 }}>
                <div style={{ fontSize:15, fontWeight:700, color:C.ink, marginBottom:6 }}>⚠ No API price data for this card</div>
                Free APIs (YGOProDeck, OPTCGAPI) don't have pricing for this specific print yet.
                Use the <strong style={{color:C.peachDk}}>Marketplaces</strong> tab to see live prices from Mercari, Yahoo, eBay, and Yuyu-tei.
              </div>
            )}

            {/* Honest data source note */}
            <div className="r5" style={{ fontSize:10.5, color:C.dim, lineHeight:1.65, padding:"12px 4px 0", textAlign:"center" }}>
              Prices from YGOProDeck <span className="mono">card_prices</span> + OPTCGAPI <span className="mono">tcgplayer_price</span>.<br/>
              For live per-listing data (Mercari/Yahoo), tap the <strong>Marketplaces</strong> tab.
            </div>
          </>
        )}

        {/* ═════ MARKETPLACES tab — filter + deep-link cards ═════ */}
        {tab === "search" && (
          <MarketplaceTab
            links={links.filter(l => l.category !== "info")}
            marketplaces={marketplaces}
            card={card}
            rarOpt={rarOpt}
          />
        )}

        {/* ═════ INFO tab ═════ */}
        {tab === "info" && (
          <>
            {card.image && (
              <div className="r1" style={{ textAlign:"center" }}>
                <button onClick={() => onOpenImage({ image: card.image, label: "Official " + card.name })}
                  style={{ background:"transparent", border:"none", padding:0, cursor:"zoom-in" }}>
                  <img src={card.image} alt={card.name} style={{ maxWidth:220, width:"65%", borderRadius:14, boxShadow:"0 8px 28px rgba(28,27,38,.2)" }}/>
                </button>
                <div style={{ fontSize:11, color:C.dim, marginTop:8 }}>🔍 Official image · tap to zoom</div>
              </div>
            )}

            <Card className="r2">
              <Hdr>Card details</Hdr>
              <div style={{ padding:"14px 16px" }}>
                {[
                  ["Card ID",     card.cardId],
                  ["Name",        card.name],
                  ["JP Name",     card.nameJP],
                  ["Set",         card.setName ? `${card.setName}${card.set ? " · " + card.set : ""}` : card.set],
                  ["Rarity",      rarOpt?.label || card.rarity],
                  ["Language",    LANGUAGES.find(l => l.id === card.language)?.label],
                  ["Type",        card.type],
                  ["Color",       card.color],
                  ["Cost",        card.cost != null ? String(card.cost) : null],
                  ["Power",       card.power],
                  ["Attribute",   card.attribute],
                  ["Level",       card.level != null ? String(card.level) : null],
                  ["ATK / DEF",   card.atk != null ? `${card.atk} / ${card.def}` : null],
                  ["Race",        card.race],
                  ["Archetype",   card.archetype],
                  ["DB lookup",   card.ok ? "✓ Live API found" : "⚠ Not in DB — AI only"],
                  ["AI Match",    `${card.confidence}%`],
                ].filter(([,v]) => v != null && v !== "" && v !== "—").map(([k,v]) => (
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

            {infoLinks.length > 0 && (
              <Card className="r4">
                <Hdr>External card pages</Hdr>
                {infoLinks.map((l,i) => (
                  <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer">
                    <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 16px", borderBottom: i < infoLinks.length - 1 ? `1px solid ${C.line}` : "none" }}>
                      <span style={{ fontSize:18 }}>{l.icon}</span>
                      <span style={{ flex:1, fontSize:13, fontWeight:600 }}>{l.name}</span>
                      <span style={{ fontSize:18, color:C.dim }}>›</span>
                    </div>
                  </a>
                ))}
              </Card>
            )}

            {card.dbSources?.length > 0 && (
              <Card className="r5">
                <Hdr>Data sources crosschecked</Hdr>
                {card.dbSources.map((s,i) => (
                  <a key={i} href={s.url && s.url !== "#" ? s.url : undefined} target="_blank" rel="noopener noreferrer">
                    <div style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 16px", borderBottom: i < card.dbSources.length - 1 ? `1px solid ${C.line}` : "none" }}>
                      <div style={{ width:7, height:7, borderRadius:"50%", background:C.sageDk, flexShrink:0 }}/>
                      <span style={{ fontSize:13, flex:1 }}>{s.name}</span>
                      {s.url && s.url !== "#" && <span style={{ color:C.dim }}>›</span>}
                    </div>
                  </a>
                ))}
              </Card>
            )}

            <Card className="r5">
              <Hdr>Captured photos · ⬡ {user.name}</Hdr>
              <div style={{ padding:"12px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                {[
                  { label:"Full card", src:photos.full,    aspect:"63/88" },
                  { label:"4 corners", src:photos.corners, aspect:"1/1" },
                ].map((p,i) => (
                  <button key={i} onClick={() => onOpenImage({ image: p.src, label: p.label })}
                    style={{ background:"transparent", border:"none", padding:0, cursor:"zoom-in", textAlign:"left" }}>
                    <div style={{ background:C.deep, borderRadius:10, overflow:"hidden", border:`1px solid ${C.line}` }}>
                      <img src={p.src} alt={p.label} style={{ width:"100%", aspectRatio:p.aspect, objectFit:"cover", display:"block" }}/>
                      <div style={{ padding:"6px 10px", fontSize:10.5, fontWeight:600, display:"flex", justifyContent:"space-between" }}>
                        <span>{p.label}</span><span style={{color:C.dim}}>🔍</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </Card>

            {/* Individual corner photos — tap each to zoom */}
            {photos.cornersSeparate?.length > 0 && (
              <Card className="r5">
                <Hdr>Individual corners · Tap to zoom</Hdr>
                <div style={{ padding:"12px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  {photos.cornersSeparate.map((c,i) => (
                    <button key={i} onClick={() => onOpenImage({ image: c.src, label: `Corner ${c.label}` })}
                      style={{ background:"transparent", border:"none", padding:0, cursor:"zoom-in", textAlign:"left" }}>
                      <div style={{ background:C.deep, borderRadius:10, overflow:"hidden", border:`1px solid ${C.line}` }}>
                        <img src={c.src} alt={c.label} style={{ width:"100%", aspectRatio:"1/1", objectFit:"cover", display:"block" }}/>
                        <div style={{ padding:"5px 10px", fontSize:11, fontWeight:700 }} className="mono">{c.label} 🔍</div>
                      </div>
                    </button>
                  ))}
                </div>
              </Card>
            )}
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
  const [viewer,  setViewer]  = useState(null);

  const login        = useCallback(u => { setUser(u); setScreen("welcome"); }, []);
  const logout       = useCallback(() => { setUser(null); setScreen("login"); }, []);
  const start        = useCallback(c => { setCtx(c); setScreen("capture"); }, []);
  const captured     = useCallback(p => { setPhotos(p); setScreen("processing"); }, []);
  const procDone     = useCallback(r => { setAiData(r); setScreen("picker"); }, []);
  const picked       = useCallback(c => { setCard(c); setScreen("rarity"); }, []);
  const rarityOk     = useCallback(c => { setCard(c); setScreen("result"); }, []);
  const rescan       = useCallback(() => { setPhotos(null); setAiData(null); setCard(null); setScreen("capture"); }, []);
  const backToPicker = useCallback(() => setScreen("picker"), []);
  const openImage    = useCallback(v => setViewer(v), []);
  const closeImage   = useCallback(() => setViewer(null), []);

  let screenNode;
  if (screen === "login")      screenNode = <LoginScreen onLogin={login}/>;
  else if (screen === "welcome")    screenNode = <WelcomeScreen user={user} onStart={start} onLogout={logout}/>;
  else if (screen === "capture")    screenNode = <CaptureScreen user={user} ctx={ctx} onCapture={captured} onBack={() => setScreen("welcome")}/>;
  else if (screen === "processing") screenNode = <ProcessingScreen photos={photos} ctx={ctx} onDone={procDone}/>;
  else if (screen === "picker")     screenNode = <CardPickerScreen photos={photos} aiData={aiData} ctx={ctx} onSelect={picked} onRescan={rescan} onOpenImage={openImage}/>;
  else if (screen === "rarity")     screenNode = <RarityScreen photos={photos} card={card} ctx={ctx} onConfirm={rarityOk} onBack={backToPicker} onOpenImage={openImage}/>;
  else if (screen === "result")     screenNode = <ResultScreen photos={photos} card={card} user={user} onRescan={rescan} onOpenImage={openImage}/>;

  return (
    <>
      {screenNode}
      {viewer && <ImageViewer image={viewer.image} label={viewer.label} onClose={closeImage}/>}
    </>
  );
}
