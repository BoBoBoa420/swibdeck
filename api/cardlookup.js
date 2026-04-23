// api/cardlookup.js — v3
//
// Strategy: name-first then price-sources
// 1. Look up card by number → get name in JP and EN, image, rarity, description
// 2. Pull price samples from all FREE APIs that actually return them:
//    - OPTCGAPI (One Piece) → TCGPlayer USD price
//    - YGOProDeck (Yu-Gi-Oh!) → card_prices { tcgplayer, cardmarket, ebay, amazon, coolstuffinc }
//    - YGOJSON (Yu-Gi-Oh!) → detailed set/rarity info
//    - apitcg.com → card data + image
// 3. Build marketplace deep-link URLs using FULL rarity names (JP or EN)
//
// GET /api/cardlookup?id=OP07-051&tcg=onepiece&lang=JP
// GET /api/cardlookup?id=LOCH-JP003&tcg=yugioh&lang=JP

const FX = { JPY_THB: 0.24, JPY_USD: 0.0068, USD_THB: 35, EUR_THB: 38, EUR_USD: 1.08 };
const toTHB = (n, cur="USD") => Math.round(
  cur === "USD" ? n * FX.USD_THB :
  cur === "JPY" ? n * FX.JPY_THB :
  cur === "EUR" ? n * FX.EUR_THB : n
);
const toUSD = (n, cur="USD") => Math.round((
  cur === "USD" ? n :
  cur === "JPY" ? n * FX.JPY_USD :
  cur === "EUR" ? n * FX.EUR_USD : n
) * 100) / 100;

const CACHE = new Map();
const TTL = 30 * 60 * 1000; // 30min

function cached(key, fn) {
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < TTL) return Promise.resolve(hit.data);
  return fn().then(d => { CACHE.set(key, { at: Date.now(), data: d }); return d; });
}

async function safeFetch(url, opts = {}) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 BoBoaScanner/1.0",
        "Accept": "application/json, text/*",
        ...opts.headers,
      },
      signal: AbortSignal.timeout(10000),
      ...opts,
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    return ct.includes("json") ? await res.json() : await res.text();
  } catch { return null; }
}

// ── ONE PIECE — apitcg.com (EN) + optcgapi.com (EN + TCGPlayer price) ─────
async function lookupOnePiece(cardId) {
  const out = { found: false, sources: [], priceSamples: [] };

  // apitcg.com — EN data + image
  const ap = await cached(`apitcg:op:${cardId}`, () =>
    safeFetch(`https://apitcg.com/api/one-piece/cards?code=${encodeURIComponent(cardId)}`)
  );
  if (ap?.data?.length > 0) {
    const c = ap.data[0];
    out.found = true;
    out.cardId = c.code || c.id || cardId;
    out.name = c.name;
    out.nameEN = c.name;
    out.set = c.set?.name || "";
    out.setName = c.set?.name || "";
    out.rarity = c.rarity;
    out.type = c.type;
    out.color = c.color;
    out.cost = c.cost;
    out.power = c.power;
    out.counter = c.counter;
    out.ability = (c.ability || "").replace(/<br\s*\/?>/gi, "\n");
    out.family = c.family;
    out.image = c.images?.large || c.images?.small || null;
    out.sources.push({ name: "ApiTCG", url: "https://apitcg.com" });
  }

  // optcgapi.com — TCGPlayer price + English data
  const isStarter = /^(ST|EB)/i.test(cardId);
  const optcgEndpoint = isStarter
    ? `https://optcgapi.com/api/decks/card/${cardId}/`
    : `https://optcgapi.com/api/sets/card/${cardId}/`;
  const optcg = await cached(`optcg:${cardId}`, () => safeFetch(optcgEndpoint));
  if (optcg && !optcg.error && optcg.card_code) {
    if (!out.found) {
      out.found = true;
      out.cardId = optcg.card_code || cardId;
      out.name = optcg.card_name || out.name;
      out.nameEN = optcg.card_name || out.nameEN;
      out.rarity = optcg.rarity || out.rarity;
      out.color = optcg.colors || out.color;
      out.cost = optcg.cost ?? out.cost;
      out.power = optcg.power || out.power;
      out.ability = optcg.ability || out.ability;
    }
    // Price from TCGPlayer via OPTCGAPI
    if (optcg.tcgplayer_price) {
      const priceUSD = parseFloat(optcg.tcgplayer_price);
      if (!isNaN(priceUSD) && priceUSD > 0) {
        out.priceSamples.push({
          source: "TCGPlayer",
          icon: "🎯",
          color: "#34789C",
          priceUSD,
          priceTHB: toTHB(priceUSD, "USD"),
          via: "OPTCGAPI",
          url: `https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(cardId + " " + (out.name || ""))}`,
          freshness: "daily",
        });
      }
    }
    if (!out.image && optcg.card_image) out.image = optcg.card_image;
    out.sources.push({ name: "OPTCGAPI", url: "https://optcgapi.com" });
  }

  // Limitless — info page link
  out.limitlessUrl = `https://onepiece.limitlesstcg.com/cards/${cardId}`;
  out.sources.push({ name: "Limitless TCG", url: out.limitlessUrl });

  // Official image fallback
  if (!out.image) {
    out.image = `https://en.onepiece-cardgame.com/images/cardlist/card/${cardId}.png`;
  }

  return out;
}

// ── YU-GI-OH! — YGOProDeck (with card_prices) + YGOJSON enrichment ────────
async function lookupYugioh(cardId) {
  const out = { found: false, sources: [], priceSamples: [] };

  const ygo = await cached(`ygo:${cardId}`, () =>
    safeFetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?cardsets=${encodeURIComponent(cardId)}`)
  );

  if (ygo?.data?.length > 0) {
    const c = ygo.data[0];
    out.found = true;
    out.cardId = cardId;
    out.name = c.name;
    out.nameEN = c.name;
    out.type = c.type;
    out.ability = c.desc;
    out.attribute = c.attribute;
    out.level = c.level || c.linkval;
    out.atk = c.atk;
    out.def = c.def;
    out.race = c.race;
    out.archetype = c.archetype;
    out.image = c.card_images?.[0]?.image_url || null;

    const setInfo = c.card_sets?.find(s => s.set_code?.toUpperCase() === cardId.toUpperCase());
    if (setInfo) {
      out.set = setInfo.set_code;
      out.setName = setInfo.set_name;
      out.rarity = setInfo.set_rarity;
      out.rarityCode = setInfo.set_rarity_code;
    }

    // Real price samples from YGOProDeck's card_prices array
    // Each entry: { cardmarket_price, tcgplayer_price, ebay_price, amazon_price, coolstuffinc_price }
    if (c.card_prices?.[0]) {
      const p = c.card_prices[0];
      const priceFields = [
        { field: "tcgplayer_price",    source: "TCGPlayer",    icon: "🎯", color: "#34789C", baseUrl: "https://www.tcgplayer.com/search/all/product?productLineName=yugioh&q=" },
        { field: "cardmarket_price",   source: "Cardmarket",   icon: "🇪🇺", color: "#B8860B", baseUrl: "https://www.cardmarket.com/en/YuGiOh/Products/Search?searchString=", currency: "EUR" },
        { field: "ebay_price",         source: "eBay",         icon: "🛒", color: "#E8C96A", baseUrl: "https://www.ebay.com/sch/i.html?_nkw=" },
        { field: "amazon_price",       source: "Amazon",       icon: "📦", color: "#FF9900", baseUrl: "https://www.amazon.com/s?k=" },
        { field: "coolstuffinc_price", source: "CoolStuffInc", icon: "❄️", color: "#1E90FF", baseUrl: "https://www.coolstuffinc.com/main_advSearch.php?pa=advSearchResults&resultsPerPage=25&name=" },
      ];

      priceFields.forEach(pf => {
        const raw = parseFloat(p[pf.field]);
        if (!isNaN(raw) && raw > 0) {
          const currency = pf.currency || "USD";
          out.priceSamples.push({
            source: pf.source,
            icon: pf.icon,
            color: pf.color,
            priceUSD: toUSD(raw, currency),
            priceTHB: toTHB(raw, currency),
            priceNative: raw,
            currency,
            via: "YGOProDeck",
            url: `${pf.baseUrl}${encodeURIComponent(c.name + " " + cardId)}`,
            freshness: "daily",
          });
        }
      });
    }

    out.sources.push({ name: "YGOProDeck", url: `https://ygoprodeck.com/card/?search=${encodeURIComponent(c.name)}` });
  }

  out.sources.push({ name: "YGOProDeck Search", url: `https://ygoprodeck.com/card-search/?cardSet=${encodeURIComponent(cardId)}` });
  return out;
}

// ── Translate card name to target language if needed ───────────────────────
// (For One Piece: apitcg returns EN. For Japanese language, we'd ideally
// pull from the official Bandai JP site but it doesn't have a public API.
// Instead, we pass the JP name from a curated list for common cards, else
// fall back to using EN name + kanji card number for JP searches.)
const JP_NAME_HINTS = {
  // One Piece famous cards
  "OP01-001": "モンキー・D・ルフィ",
  "OP07-051": "ボア・ハンコック",
  "OP09-001": "モンキー・D・ルフィ",
  "ST17-004": "ボア・ハンコック",
  "ST30-001": "ルフィ＆エース",
  "OP03-070": "モンキー・D・ルフィ",
};

// ── Main handler ──────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const { id, tcg, lang = "JP" } = req.query;
  if (!id) return res.status(400).json({ error: "id required" });
  if (!tcg || !["onepiece", "yugioh"].includes(tcg)) {
    return res.status(400).json({ error: "tcg must be: onepiece or yugioh" });
  }

  const cardId = id.trim().toUpperCase();

  try {
    const data = tcg === "onepiece" ? await lookupOnePiece(cardId) : await lookupYugioh(cardId);

    // Infer JP name if we have a curated hint
    if (JP_NAME_HINTS[cardId]) {
      data.nameJP = JP_NAME_HINTS[cardId];
    }

    return res.status(200).json({
      ...data,
      cardId, tcg, language: lang,
      lookedUpAt: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
