// api/cardlookup.js — v2
// Mercari-first card lookup for JP cards (One Piece + Yu-Gi-Oh!).
// Pokémon and Chinese removed per user request.
//
// GET /api/cardlookup?id=LOCH-JP003&tcg=yugioh&lang=JP
// GET /api/cardlookup?id=OP07-051&tcg=onepiece&lang=EN
//
// Returns:
// {
//   found, cardId, name, nameJP, set, setName, rarity, ability,
//   image, atk, def, level, type, color, cost, power,
//   sources: [{name, url}],
//   mercari: {
//     searchUrl,
//     listings: [{title, priceJPY, priceTHB, imageUrl, soldOut, listingUrl}],
//     stats: { count, median, min, max, soldCount }
//   }
// }

const FX = { JPY_THB: 0.24, JPY_USD: 0.0068, USD_THB: 35 };
const toTHB = (jpy) => Math.round(jpy * FX.JPY_THB);
const toUSD = (jpy) => Math.round(jpy * FX.JPY_USD * 100) / 100;

const CACHE = new Map();
const TTL = 30 * 60 * 1000; // 30 min

function cached(key, fn) {
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < TTL) return Promise.resolve(hit.data);
  return fn().then(d => { CACHE.set(key, { at: Date.now(), data: d }); return d; });
}

async function safeFetch(url, opts = {}) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
        "Accept": "application/json, text/html",
        "Accept-Language": "ja,en;q=0.9",
        ...opts.headers,
      },
      signal: AbortSignal.timeout(10000),
      ...opts,
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    return ct.includes("json") ? await res.json() : await res.text();
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MERCARI JP — use their internal search-item API via the public web search
// URL pattern: jp.mercari.com/search?keyword=X&status=sold_out (completed)
// Or: jp.mercari.com/search?keyword=X (on-sale)
// The HTML embeds a __NEXT_DATA__ JSON blob with all listings — we parse that.
// ═══════════════════════════════════════════════════════════════════════════

async function mercariSearch(keyword, soldOnly = true) {
  const k = encodeURIComponent(keyword);
  const status = soldOnly ? "&status=sold_out" : "";
  const url = `https://jp.mercari.com/search?keyword=${k}${status}&sort=created_time&order=desc`;

  const cacheKey = `mer:${keyword}:${soldOnly}`;
  return cached(cacheKey, async () => {
    const html = await safeFetch(url);
    if (!html || typeof html !== "string") {
      return { listings: [], url, error: "Fetch failed or blocked" };
    }

    // Mercari embeds data in <script id="__NEXT_DATA__">
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) {
      return { listings: [], url, error: "No data blob found" };
    }

    let blob;
    try {
      blob = JSON.parse(m[1]);
    } catch {
      return { listings: [], url, error: "Failed to parse data blob" };
    }

    // Walk the blob looking for items array (path varies between Mercari versions)
    const items = findItemsArray(blob);
    if (!items || items.length === 0) {
      return { listings: [], url, error: "No items in blob" };
    }

    const listings = items.slice(0, 40).map(it => {
      const priceJPY = Number(it.price || 0);
      return {
        id: it.id || it.item_id || "",
        title: it.name || it.title || "",
        priceJPY,
        priceTHB: toTHB(priceJPY),
        priceUSD: toUSD(priceJPY),
        imageUrl: it.thumbnails?.[0] || it.thumbnail || (it.photos?.[0]) || "",
        soldOut: it.status === "sold_out" || it.sold_out === true,
        listingUrl: `https://jp.mercari.com/item/${it.id || it.item_id}`,
        createdAt: it.created || it.updated || "",
      };
    }).filter(l => l.priceJPY > 0);

    return { listings, url };
  });
}

function findItemsArray(obj, depth = 0) {
  if (depth > 8 || !obj || typeof obj !== "object") return null;
  if (Array.isArray(obj)) {
    // Array of items? Check shape.
    if (obj.length > 0 && typeof obj[0] === "object" && obj[0] && ("price" in obj[0] || "name" in obj[0])) {
      return obj;
    }
    for (const item of obj) {
      const found = findItemsArray(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  for (const key of Object.keys(obj)) {
    if (key === "items" && Array.isArray(obj[key])) return obj[key];
    const found = findItemsArray(obj[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function mercariStats(listings) {
  if (listings.length === 0) return null;
  const prices = listings.map(l => l.priceJPY).sort((a, b) => a - b);
  const median = prices[Math.floor(prices.length / 2)];
  return {
    count: listings.length,
    soldCount: listings.filter(l => l.soldOut).length,
    min: prices[0],
    max: prices[prices.length - 1],
    median,
    medianTHB: toTHB(median),
    medianUSD: toUSD(median),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ONE PIECE — apitcg.com + optcgapi.com + Limitless
// ═══════════════════════════════════════════════════════════════════════════
async function lookupOnePiece(cardId) {
  const out = { found: false, sources: [] };

  // apitcg.com search by code
  const ap = await cached(`apitcg:op:${cardId}`, () =>
    safeFetch(`https://apitcg.com/api/one-piece/cards?code=${encodeURIComponent(cardId)}`)
  );
  if (ap?.data?.length > 0) {
    const c = ap.data[0];
    out.found = true;
    out.cardId = c.code || c.id || cardId;
    out.name = c.name;
    out.set = c.set?.name || "";
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

  // Try OPTCG API as fallback/supplement
  const isStarter = /^(ST|EB)/i.test(cardId);
  const optcgEndpoint = isStarter
    ? `https://optcgapi.com/api/decks/card/${cardId}/`
    : `https://optcgapi.com/api/sets/card/${cardId}/`;
  const optcg = await cached(`optcg:${cardId}`, () => safeFetch(optcgEndpoint));
  if (optcg && !optcg.error) {
    if (!out.found) {
      out.found = true;
      out.cardId = optcg.CardCode || cardId;
      out.name = optcg.CardName || out.name;
      out.rarity = optcg.Rarity || out.rarity;
      out.color = optcg.Color || out.color;
      out.cost = optcg.Cost || out.cost;
      out.power = optcg.Power || out.power;
      out.ability = optcg.Effect || out.ability;
    }
    out.sources.push({ name: "OPTCG API", url: "https://optcgapi.com" });
    if (optcg.TCGPlayerPrice) out.tcgplayerUSD = Number(optcg.TCGPlayerPrice);
  }

  out.limitlessUrl = `https://onepiece.limitlesstcg.com/cards/${cardId}`;
  out.sources.push({ name: "Limitless TCG", url: out.limitlessUrl });

  if (!out.image) {
    out.image = `https://en.onepiece-cardgame.com/images/cardlist/card/${cardId}.png`;
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// YU-GI-OH! — YGOProDeck
// ═══════════════════════════════════════════════════════════════════════════
async function lookupYugioh(cardId) {
  const out = { found: false, sources: [] };

  // YGOProDeck supports cardsets filter
  const ygo = await cached(`ygo:${cardId}`, () =>
    safeFetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?cardsets=${encodeURIComponent(cardId)}`)
  );

  if (ygo?.data?.length > 0) {
    const c = ygo.data[0];
    out.found = true;
    out.cardId = cardId;
    out.name = c.name;
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
      out.tcgplayerUSD = parseFloat(setInfo.set_price) || null;
    }

    out.sources.push({ name: "YGOProDeck", url: `https://ygoprodeck.com/card/?search=${encodeURIComponent(c.name)}` });
  }

  out.sources.push({ name: "YGOProDeck Search", url: `https://ygoprodeck.com/card-search/?cardSet=${encodeURIComponent(cardId)}` });
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════════════════════════════════
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
    // Run DB lookup and Mercari search in parallel
    const [dbData, mercariSold, mercariActive] = await Promise.all([
      tcg === "onepiece" ? lookupOnePiece(cardId) : lookupYugioh(cardId),
      mercariSearch(cardId, true),   // sold listings
      mercariSearch(cardId, false),  // active listings
    ]);

    // Combine Mercari results
    const allListings = [...mercariSold.listings, ...mercariActive.listings]
      .filter((v, i, arr) => arr.findIndex(x => x.id === v.id) === i);
    const stats = mercariStats(allListings);

    // If DB lookup found nothing but Mercari has listings, extract name from top listing
    if (!dbData.found && allListings.length > 0) {
      dbData.name = allListings[0].title.split(/\s+/).slice(0, 6).join(" ");
      dbData.cardId = cardId;
      dbData.found = true;
      dbData.source = "mercari-title";
    }

    return res.status(200).json({
      ...dbData,
      cardId,
      tcg,
      language: lang,
      mercari: {
        searchUrlSold:   mercariSold.url,
        searchUrlActive: mercariActive.url,
        listings: allListings.slice(0, 30),
        stats,
      },
      lookedUpAt: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
