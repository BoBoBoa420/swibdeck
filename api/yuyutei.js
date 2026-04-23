// ═══════════════════════════════════════════════════════════════════════════
// api/yuyutei.js — Vercel Serverless Function
// Scrapes Yuyu-tei buy-back and retail prices for a given card.
//
// Deploy: Drop this file into /api/yuyutei.js in your Vercel project.
//         It will be available at https://your-app.vercel.app/api/yuyutei
//
// Usage from frontend:
//   const r = await fetch(`/api/yuyutei?tcg=opc&set=st30&cardId=ST30-001`);
//   const data = await r.json();
//   // → { cardId, name, buy: { jpy, thb, usd }, sell: { jpy, thb, usd }, updatedAt }
//
// Replace the mock fetchMultiSourcePrices in App.js to call this endpoint.
// ═══════════════════════════════════════════════════════════════════════════

const FX = { JPY_TO_THB: 0.24, JPY_TO_USD: 0.0068 };

// Very simple in-memory cache (~1 hour per (tcg, set))
const cache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000;

const YUYUTEI_TCG = {
  opc:  "One Piece",
  ygo:  "Yu-Gi-Oh!",
  ptcg: "Pokémon",
};

// ─── Scraper ──────────────────────────────────────────────────────────────
async function scrapeYuyuteiSet({ tcg, set, kind }) {
  // kind: "sell" or "buy"
  const url = `https://yuyu-tei.jp/${kind}/${tcg}/s/${set.toLowerCase()}`;
  const cacheKey = `${kind}:${tcg}:${set.toLowerCase()}`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }

  let html;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
        "Accept-Language": "ja,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (e) {
    return { error: `Fetch failed: ${e.message}`, cards: [] };
  }

  // ─── HTML parsing ───
  // Yuyu-tei lists each card in a block with:
  //   - Card code (like "LOCR-JP001" or "ST30-001")  in a small label/badge
  //   - Name in a link/heading
  //   - Price as "NN,NNN 円" (yen sign)
  //   - Stock marker (在庫)
  //
  // The HTML structure is not stable long-term; inspect and adjust selectors
  // if scraping breaks. This is a starting regex-based extractor — for
  // production you should use cheerio or node-html-parser.
  //
  // Install: npm i node-html-parser   (then swap in the commented block below)

  const cards = [];

  // Rough extraction by looking for card code + nearby yen price
  // Pattern: look for {CODE} ... NN,NNN 円 within a few hundred chars
  const codeRegex = /([A-Z]{2,4}-?(?:JP|EN)?-?\d{3,4})[\s\S]{0,800}?(\d{1,3}(?:,\d{3})*)\s*円/g;
  let match;
  const seen = new Set();
  while ((match = codeRegex.exec(html)) !== null) {
    const code = match[1];
    if (seen.has(code)) continue;  // take first occurrence per card
    seen.add(code);
    const price = parseInt(match[2].replace(/,/g, ""), 10);
    if (isNaN(price) || price < 10 || price > 10_000_000) continue;
    cards.push({
      cardId: code,
      priceJPY: price,
    });
  }

  const result = { url, kind, tcg, set, cards, scrapedAt: new Date().toISOString() };
  cache.set(cacheKey, { at: Date.now(), data: result });
  return result;

  // ═══════════════════════════════════════════════════════════════════════
  // BETTER PARSING with cheerio (recommended for production):
  //
  // import { load } from "cheerio";
  // const $ = load(html);
  // const cards = [];
  // $('div.card-list-item, div.product-card').each((_, el) => {
  //   const $el = $(el);
  //   const code  = $el.find('.card-code, .product-code').text().trim();
  //   const name  = $el.find('.card-name, .product-name').text().trim();
  //   const priceText = $el.find('.price, .product-price').text().trim();
  //   const price = parseInt(priceText.replace(/[^0-9]/g, ""), 10);
  //   if (code && !isNaN(price)) cards.push({ cardId: code, name, priceJPY: price });
  // });
  // ═══════════════════════════════════════════════════════════════════════
}

// ─── Vercel handler ──────────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const { tcg, set, cardId } = req.query;

  if (!tcg || !YUYUTEI_TCG[tcg]) {
    res.status(400).json({ error: "tcg must be one of: opc, ygo, ptcg" });
    return;
  }
  if (!set) {
    res.status(400).json({ error: "set is required (e.g. st30, locr, op07)" });
    return;
  }

  try {
    const [buyData, sellData] = await Promise.all([
      scrapeYuyuteiSet({ tcg, set, kind: "buy" }),
      scrapeYuyuteiSet({ tcg, set, kind: "sell" }),
    ]);

    // Find the specific card, or return the whole set
    if (cardId) {
      const buyCard  = buyData.cards.find(c => c.cardId.toUpperCase() === cardId.toUpperCase());
      const sellCard = sellData.cards.find(c => c.cardId.toUpperCase() === cardId.toUpperCase());

      if (!buyCard && !sellCard) {
        res.status(404).json({
          error: `Card ${cardId} not found in Yuyu-tei set ${set}`,
          hint: "Check that the cardId matches what Yuyu-tei displays (e.g. ST30-001 not ST30-001P)",
          buyUrl: buyData.url,
          sellUrl: sellData.url,
        });
        return;
      }

      const buyJPY  = buyCard?.priceJPY  || 0;
      const sellJPY = sellCard?.priceJPY || 0;

      res.status(200).json({
        cardId,
        tcg,
        tcgName: YUYUTEI_TCG[tcg],
        set,
        buy: {
          jpy: buyJPY,
          thb: Math.round(buyJPY * FX.JPY_TO_THB),
          usd: Math.round(buyJPY * FX.JPY_TO_USD * 100) / 100,
          url: buyData.url,
        },
        sell: {
          jpy: sellJPY,
          thb: Math.round(sellJPY * FX.JPY_TO_THB),
          usd: Math.round(sellJPY * FX.JPY_TO_USD * 100) / 100,
          url: sellData.url,
        },
        spread: {
          jpy: sellJPY - buyJPY,
          shopMarginPct: sellJPY > 0 ? Math.round((1 - buyJPY / sellJPY) * 100) : 0,
        },
        updatedAt: new Date().toISOString(),
      });
    } else {
      // Return full set
      res.status(200).json({
        tcg,
        set,
        buy:  { url: buyData.url,  cards: buyData.cards },
        sell: { url: sellData.url, cards: sellData.cards },
        updatedAt: new Date().toISOString(),
      });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
