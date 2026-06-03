# Deploy & operations — Quant Dashboard Pro (React/Vercel)

## TL;DR: zero runtime keys required

The app is **fully functional with no API keys set**. All live market data uses
**keyless** public endpoints (Yahoo Finance chart API, FRED's `fredgraph.csv`,
CoinGecko, mempool.space, Polymarket). AI-generated pundit commentary is
**baked** from the source repo's cache (the Gemini call happens offline in the
source project's refresh job, never at request time). Every external fetch is
wrapped in try/catch with a timeout and degrades to a clean "temporarily
unavailable" card — a missing key or upstream outage never crashes a tab or
affects other tabs.

## Environment variables (set in Vercel → Project → Settings → Environment Variables)

Reference by **name only** — never hardcoded, logged, or committed.

| Env var | Powers | Required? | If unset, the app… |
|---|---|---|---|
| _(none)_ | Core scoring, Screener, Stock Detail, Sector, Portfolio, Quant Portfolio, Doppelganger, ETF Center, Help — all baked/static | — | …works fully |
| _(none)_ | Market Regime live gauges (VIX, indices, yields, Buffett), PGI | — | …works (keyless Yahoo + FRED CSV) |
| _(none)_ | Crypto (BTC/ETH prices, on-chain), Prediction markets | — | …works (keyless CoinGecko/Yahoo/mempool/Polymarket) |
| `FRED_API_KEY` | **Optional** enhancement only. The PGI money-market series already loads via the keyless `fredgraph.csv` endpoint, so this is not needed. Reserved for future higher-rate-limit FRED usage. | No | …uses the keyless FRED CSV; identical data |
| `GEMINI_API_KEY` | **Build-time only**, in the *source* repo's pundit-refresh job — NOT used by this app at runtime. | No (not in this project) | …shows the last baked commentary |

To bring a feature "online one key at a time": there is nothing to bring online —
all live features work keyless. `FRED_API_KEY` can be added later with no behavior
change. If you ever add a keyed feed, put the key in Vercel env (all
environments), reference it as `process.env.NAME` inside a `web/api/*.ts` function,
and the function must keep its existing graceful-degradation fallback.

## Live-data architecture

Vercel **Edge Functions** in `api/` (`/api/market`, `/api/crypto`, `/api/polymarket`).
Chosen over baking (these feeds are real-time) and over a separate backend
(serverless is zero-ops, holds env secrets, avoids browser CORS, and caches at the
edge). Each function: `Promise.all` of independent fetches, per-fetch
`AbortController` timeout (8–12s), `Cache-Control: s-maxage` + `stale-while-revalidate`
so a momentary upstream blip serves cached data, and an `{ ok: false }` / partial
payload on failure that the client renders as "temporarily unavailable".

Note: the `/api/*` functions only run on Vercel. In a local `vite preview` (no
serverless), the live tabs intentionally show the unavailable state — this is the
graceful-degradation path, not a bug.

## Automated refresh (`.github/workflows/refresh.yml`)

Runs ~11:30 ET and ~00:30 ET (after the source repo's morning/evening fundamentals
refresh), plus manual `workflow_dispatch`. Steps: checkout this repo → clone the
**source** repo (`quant-dashboard-pro`, which holds the fresh caches incl. the LFS
`prices_cache.parquet`) → `pip install` deps → run `bake/bake.py` against the source
caches → copy the refreshed `public/data` here → commit. **The push auto-deploys on
Vercel** via git integration (no deploy hook needed). Commits are skipped when data
is unchanged.

**Verify it ran:** GitHub → Actions → "Refresh baked data + redeploy" (green run) →
a new `chore: bake data refresh <timestamp>` commit on `main` → a corresponding
Vercel deployment. In the app, the sidebar shows the bake date (`meta.json`
`generated_at`); Pundit Views shows "Commentary as of …". If the workflow can't
push, confirm the repo's Actions have `contents: write` permission.

## Parity gates (run before any data-affecting change)

```
npm run validate-parity        # scoring/FV/QBP/ratings vs Python oracle → 0 mismatches
npm run validate-portfolio     # analyze_portfolio + build_optimal_portfolio → 0 mismatches
npm run validate-doppelganger  # doppelganger analog matching → 0 mismatches
```

## Deferred (not in this pass): live intraday pricing

Today, per-ticker prices are daily closes baked from `prices_cache.parquet`; the
live tabs add real-time *index/crypto* quotes but not intraday *per-stock* prices.
To add live intraday stock pricing later:
- **Architecture:** a new `/api/quote?symbols=…` edge function batching the Yahoo
  chart/quote endpoint (keyless) or a paid provider (Polygon/Finnhub via
  `process.env.*`); client polls on the Stock Detail / watchlist views with SWR and
  the same graceful-degradation wrapper. FV/QBP would still derive from the baked
  daily series (intraday only updates the displayed last price + distance-to-QBP).
- **Cost:** keyless Yahoo is free but unofficial/rate-limited (fine for low traffic);
  a paid quote API is ~$0–$50/mo at hobby tiers. No change to the parity-verified
  computations — intraday is display-only.
