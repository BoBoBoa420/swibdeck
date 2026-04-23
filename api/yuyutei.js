// api/yuyutei.js — Vercel Serverless Function v2
// Returns Yuyu-tei buy-back + retail prices.
// Strategy: try live scrape → if Cloudflare blocks → return seed prices.

const FX = { JPY_TO_THB: 0.24, JPY_TO_USD: 0.0068 };

const SEED_PRICES = {
  "ST30-001": {
    "L-P": { buy: 40000, sell: 59800 },
    "L":   { buy: 800,   sell: 1280  },
  },
  "OP07-051": {
    "SR":    { buy: 2800,  sell: 4500  },
    "SR-P":  { buy: 8500,  sell: 14000 },
    "SR-M":  { buy: 18000, sell: 28000 },
    "SR-SP": { buy: 42000, sell: 65000 },
  },
  "ST17-004": {
    "SR": { buy: 800, sell: 1200 },
  },
  "OP09-001": {
    "L":   { buy: 2800,  sell: 4200  },
    "SEC": { buy: 38000, sell: 55000 },
  },
  "LOCR-JP001": {
    "ORsr": { buy: 42000, sell: 69800 },
    "UR":   { buy: 42000, sell: 69800 },
  },
  "LOB-001": {
    "R":   { buy: 800,   sell: 1500  },
    "UR":  { buy: 7500,  sell: 12000 },
    "SCR": { buy: 28000, sell: 45000 },
  },
  "MVP1-ENG04": {
    "UR":  { buy: 2200, sell: 3500 },
    "SCR": { buy: 6000, sell: 9500 },
  },
  "SV3-185": {
    "RR":  { buy: 3500,  sell: 5500  },
    "SIR": { buy: 20000, sell: 32000 },
    "HR":  { buy: 12000, sell: 18000 },
  },
  "SV8-200": {
    "RR":  { buy: 1800, sell: 2800  },
    "SIR": { buy: 14000, sell: 22000 },
  },
};

const TCG_SLUG = { opc: "opc", ygo: "ygo", ptcg: "ptcg" };

function buildUrl(kind, tcg, set) {
  return `https://yuyu-tei.jp/${kind}/${tcg}/s/${set.toLowerCase()}`;
}

function makeResponse(cardId, rarity, prices, tcg, set, source) {
  const { buy, sell } = prices;
  return {
    cardId, rarity, tcg, set, source,
    buy: {
      jpy: buy,
      thb: Math.round(buy * FX.JPY_TO_THB),
      usd: Math.round(buy * FX.JPY_TO_USD * 100) / 100,
      url: buildUrl("buy", tcg, set),
    },
    sell: {
      jpy: sell,
      thb: Math.round(sell * FX.JPY_TO_THB),
      usd: Math.round(sell * FX.JPY_TO_USD * 100) / 100,
      url: buildUrl("sell", tcg, set),
    },
    spread: {
      jpy: sell - buy,
      thb: Math.round((sell - buy) * FX.JPY_TO_THB),
      shopMarginPct: sell > 0 ? Math.round((1 - buy / sell) * 100) : 0,
    },
    updatedAt: new Date().toISOString(),
  };
}

async function tryLiveScrape(tcg, set, cardId) {
  try {
    const [buyRes, sellRes] = await Promise.all([
      fetch(buildUrl("buy", tcg, set), {
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
          "Accept-Language": "ja-JP,ja;q=0.9",
          "Accept": "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(6000),
      }),
      fetch(buildUrl("sell", tcg, set), {
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
          "Accept-Language": "ja-JP,ja;q=0.9",
          "Accept": "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(6000),
      }),
    ]);
    if (!buyRes.ok || !sellRes.ok) return null;
    const [buyHtml, sellHtml] = await Promise.all([buyRes.text(), sellRes.text()]);
    if (buyHtml.includes("reCAPTCHA") || buyHtml.includes("Checking your browser")) return null;
    const extractPrice = (html, code) => {
      const idx = html.indexOf(code);
      if (idx === -1) return null;
      const slice = html.slice(idx, idx + 600);
      const match = slice.match(/(\d{1,3}(?:,\d{3})+|\d{3,})\s*円/);
      return match ? parseInt(match[1].replace(/,/g, ""), 10) : null;
    };
    const buyPrice = extractPrice(buyHtml, cardId);
    const sellPrice = extractPrice(sellHtml, cardId);
    if (!buyPrice && !sellPrice) return null;
    return { buy: buyPrice || 0, sell: sellPrice || 0 };
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const { tcg, set, cardId, rarity } = req.query;

  if (!tcg || !TCG_SLUG[tcg]) return res.status(400).json({ error: "tcg must be: opc, ygo, or ptcg" });
  if (!set)    return res.status(400).json({ error: "set required e.g. st30" });
  if (!cardId) return res.status(400).json({ error: "cardId required e.g. ST30-001" });

  const id = cardId.toUpperCase();

  // 1. Try live
  const live = await tryLiveScrape(tcg, set, id);
  if (live && (live.buy > 0 || live.sell > 0)) {
    return res.status(200).json(makeResponse(id, rarity || "?", live, tcg, set, "live"));
  }

  // 2. Seed fallback
  const seedCard = SEED_PRICES[id];
  if (seedCard) {
    if (rarity && seedCard[rarity]) {
      return res.status(200).json(makeResponse(id, rarity, seedCard[rarity], tcg, set, "seed"));
    }
    const allRarities = Object.entries(seedCard).map(([r, p]) => makeResponse(id, r, p, tcg, set, "seed"));
    return res.status(200).json({
      cardId: id, tcg, set, source: "seed",
      note: "Yuyu-tei is behind Cloudflare — returning manually verified seed prices",
      rarities: allRarities,
      updatedAt: new Date().toISOString(),
    });
  }

  // 3. Not found
  return res.status(404).json({
    error: `No price data for ${id}. Add it to SEED_PRICES in api/yuyutei.js`,
    buyUrl: buildUrl("buy", tcg, set),
    sellUrl: buildUrl("sell", tcg, set),
  });
}
