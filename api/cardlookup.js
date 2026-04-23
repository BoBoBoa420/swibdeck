// api/cardlookup.js — Vercel Serverless Function
// Fetches real card data from free public APIs:
//   One Piece  → apitcg.com + optcgapi.com
//   Yu-Gi-Oh!  → db.ygoprodeck.com (free, no key needed)
//   Pokémon    → apitcg.com + api.pokemontcg.io
//
// GET /api/cardlookup?id=OP07-051&tcg=onepiece
// GET /api/cardlookup?id=LOCR-JP001&tcg=yugioh
// GET /api/cardlookup?id=SV3-185&tcg=pokemon
//
// Returns unified card object:
// { found, cardId, name, nameJP, set, setName, rarity, type, color,
//   cost, power, ability, abilityJP, image, sources: [] }

const CACHE = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function cached(key, fn) {
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return Promise.resolve(hit.data);
  return fn().then(data => { CACHE.set(key, { at: Date.now(), data }); return data; });
}

async function safeFetch(url, opts = {}) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "BoBoa-Scanner/1.0",
        "Accept": "application/json",
        ...opts.headers,
      },
      signal: AbortSignal.timeout(8000),
      ...opts,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── ONE PIECE ────────────────────────────────────────────────────────────
async function lookupOnePiece(cardId) {
  const results = { found: false, sources: [] };

  // Source 1: apitcg.com (has JP + EN data, images from official site)
  const apiTCG = await cached(`apitcg:op:${cardId}`, () =>
    safeFetch(`https://apitcg.com/api/one-piece/cards?code=${encodeURIComponent(cardId)}`)
  );

  if (apiTCG?.data?.length > 0) {
    const c = apiTCG.data[0];
    results.found = true;
    results.cardId = c.code || c.id;
    results.name = c.name;
    results.set = c.set?.name || "";
    results.rarity = c.rarity;
    results.type = c.type;
    results.color = c.color;
    results.cost = c.cost;
    results.power = c.power;
    results.counter = c.counter;
    results.ability = c.ability?.replace(/<br\s*\/?>/gi, "\n") || "";
    results.family = c.family;
    results.trigger = c.trigger;
    results.image = c.images?.large || c.images?.small || null;
    results.sources.push({ name: "ApiTCG", url: `https://apitcg.com/api/one-piece/cards?code=${cardId}` });
  }

  // Source 2: optcgapi.com (EN-focused, has TCGPlayer pricing)
  const optcg = await cached(`optcg:${cardId}`, async () => {
    // Try set card first, then starter deck
    const isStarter = cardId.startsWith("ST");
    const endpoint = isStarter
      ? `https://optcgapi.com/api/decks/card/${cardId}/`
      : `https://optcgapi.com/api/sets/card/${cardId}/`;
    return safeFetch(endpoint);
  });

  if (optcg && !optcg.error) {
    results.sources.push({ name: "OPTCG API", url: `https://optcgapi.com` });
    // Merge additional data if not already set
    if (!results.found) {
      results.found = true;
      results.cardId = optcg.CardCode || cardId;
      results.name = optcg.CardName || results.name;
      results.rarity = optcg.Rarity || results.rarity;
      results.color = optcg.Color || results.color;
      results.cost = optcg.Cost || results.cost;
      results.power = optcg.Power || results.power;
      results.ability = optcg.Effect || results.ability;
    }
    // Supplement: EN price from TCGPlayer if available
    if (optcg.TCGPlayerPrice) {
      results.tcgplayerPriceUSD = optcg.TCGPlayerPrice;
    }
  }

  // Source 3: Limitless TCG (card page link for user)
  results.limitlessUrl = `https://onepiece.limitlesstcg.com/cards/${cardId}`;
  results.sources.push({ name: "Limitless TCG", url: results.limitlessUrl });

  // Source 4: Official card image fallback
  if (!results.image) {
    results.image = `https://en.onepiece-cardgame.com/images/cardlist/card/${cardId}.png`;
  }

  return results;
}

// ── YU-GI-OH! ────────────────────────────────────────────────────────────
async function lookupYugioh(cardId) {
  const results = { found: false, sources: [] };

  // Strategy: YGOProDeck API — search by set code
  // cardId like "LOCR-JP001" → setcode search
  const encoded = encodeURIComponent(cardId);

  // Try exact set code match first
  const bySet = await cached(`ygo:set:${cardId}`, () =>
    safeFetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?cardsets=${encoded}`)
  );

  if (bySet?.data?.length > 0) {
    const c = bySet.data[0];
    results.found = true;
    results.cardId = cardId;
    results.name = c.name;
    results.type = c.type;
    results.ability = c.desc;
    results.attribute = c.attribute;
    results.level = c.level || c.linkval;
    results.atk = c.atk;
    results.def = c.def;
    results.race = c.race; // "Dragon", "Spellcaster", etc.
    results.archetype = c.archetype;
    results.image = c.card_images?.[0]?.image_url || null;
    results.imageSmall = c.card_images?.[0]?.image_url_small || null;

    // Find the specific set info for this print
    const setInfo = c.card_sets?.find(s => s.set_code?.toUpperCase() === cardId.toUpperCase());
    if (setInfo) {
      results.set = setInfo.set_code;
      results.setName = setInfo.set_name;
      results.rarity = setInfo.set_rarity;
      results.rarityCode = setInfo.set_rarity_code;
      results.tcgplayerPriceUSD = parseFloat(setInfo.set_price) || null;
    }

    results.sources.push({
      name: "YGOProDeck",
      url: `https://ygoprodeck.com/card/?search=${encodeURIComponent(c.name)}`,
    });
  }

  // Fallback: search by card name fragment from ID
  if (!results.found) {
    // Strip set prefix, try to search name
    // e.g. "LOB-001" → probably "Blue-Eyes White Dragon" but we can't know without DB
    // Use the card ID to construct a DB search link for user
  }

  results.ygoprodeckUrl = `https://ygoprodeck.com/card-search/?cardSet=${encodeURIComponent(cardId)}`;
  results.sources.push({ name: "YGOProDeck Search", url: results.ygoprodeckUrl });

  return results;
}

// ── POKÉMON ───────────────────────────────────────────────────────────────
async function lookupPokemon(cardId) {
  const results = { found: false, sources: [] };

  // ApiTCG.com Pokémon — search by id
  // cardId format varies: "SV3-185" or "185/203" or "swsh12-160"
  const normalized = cardId.toLowerCase().replace("/", "-");

  const apiTCG = await cached(`apitcg:poke:${normalized}`, () =>
    safeFetch(`https://apitcg.com/api/pokemon/cards?id=${encodeURIComponent(normalized)}`)
  );

  if (apiTCG?.data?.length > 0) {
    const c = apiTCG.data[0];
    results.found = true;
    results.cardId = c.id;
    results.name = c.name;
    results.supertype = c.supertype;
    results.subtypes = c.subtypes;
    results.hp = c.hp;
    results.types = c.types;
    results.ability = c.abilities?.map(a => `[${a.name}] ${a.text}`).join("\n") || "";
    results.attacks = c.attacks?.map(a => `${a.name} (${a.convertedEnergyCost}⚡): ${a.damage} — ${a.text||""}`).join("\n") || "";
    results.rarity = c.rarity;
    results.artist = c.artist;
    results.number = c.number;
    results.image = c.images?.large || c.images?.small || null;
    results.setName = c.set?.name || "";
    results.set = c.set?.id || "";
    results.sources.push({ name: "ApiTCG", url: `https://apitcg.com` });
  }

  results.limitlessUrl = `https://limitlesstcg.com/cards/${cardId}`;
  results.sources.push({ name: "Limitless TCG", url: results.limitlessUrl });

  return results;
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const { id, tcg } = req.query;

  if (!id) return res.status(400).json({ error: "id is required (e.g. OP07-051)" });
  if (!tcg) return res.status(400).json({ error: "tcg is required: onepiece | yugioh | pokemon" });

  const cardId = id.trim().toUpperCase();

  try {
    let data;
    if (tcg === "onepiece") data = await lookupOnePiece(cardId);
    else if (tcg === "yugioh") data = await lookupYugioh(cardId);
    else if (tcg === "pokemon") data = await lookupPokemon(cardId);
    else return res.status(400).json({ error: "tcg must be: onepiece, yugioh, or pokemon" });

    return res.status(data.found ? 200 : 404).json({
      cardId,
      tcg,
      ...data,
      lookedUpAt: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
