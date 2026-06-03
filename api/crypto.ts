// Edge function: live crypto data for the Crypto tab. KEYLESS — CoinGecko,
// Yahoo (BTC/ETH history), mempool.space. Every fetch wrapped + time-bounded.
export const config = { runtime: "edge" };

const UA = { "User-Agent": "Mozilla/5.0 (compatible; QuantDashboard/2.0)" };

async function tfetch(url: string, ms = 8000): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { const r = await fetch(url, { headers: UA, signal: ctrl.signal }); return r.ok ? r : null; }
  catch { return null; } finally { clearTimeout(t); }
}
async function jget(url: string): Promise<any | null> { const r = await tfetch(url); if (!r) return null; try { return await r.json(); } catch { return null; } }

async function yahooCloses(symbol: string, range = "1y"): Promise<{ dates: string[]; close: number[] } | null> {
  const r = await tfetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`);
  if (!r) return null;
  try {
    const j: any = await r.json();
    const res = j?.chart?.result?.[0];
    const ts: number[] = res?.timestamp ?? [];
    const cl: (number | null)[] = res?.indicators?.quote?.[0]?.close ?? [];
    const dates: string[] = [], close: number[] = [];
    for (let i = 0; i < ts.length; i++) {
      if (typeof cl[i] === "number" && isFinite(cl[i] as number)) {
        dates.push(new Date(ts[i] * 1000).toISOString().slice(0, 10)); close.push(cl[i] as number);
      }
    }
    return close.length ? { dates, close } : null;
  } catch { return null; }
}

export default async function handler() {
  const [markets, btcHist, ethHist, blockHeight, fees, hashrate] = await Promise.all([
    jget("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum&order=market_cap_desc&per_page=2&page=1&sparkline=false&price_change_percentage=24h,7d,30d,1y"),
    yahooCloses("BTC-USD"), yahooCloses("ETH-USD"),
    (async () => { const r = await tfetch("https://mempool.space/api/blocks/tip/height"); if (!r) return null; try { return parseInt((await r.text()).trim(), 10); } catch { return null; } })(),
    jget("https://mempool.space/api/v1/fees/recommended"),
    jget("https://mempool.space/api/v1/mining/hashrate/3d"),
  ]);

  const coins: any = {};
  if (Array.isArray(markets)) {
    for (const c of markets) {
      const key = c.id === "bitcoin" ? "btc" : c.id === "ethereum" ? "eth" : null;
      if (!key) continue;
      coins[key] = {
        price: c.current_price, market_cap: c.market_cap, volume_24h: c.total_volume,
        circulating_supply: c.circulating_supply, max_supply: c.max_supply,
        ath: c.ath, ath_change_pct: c.ath_change_percentage,
        change_24h_pct: c.price_change_percentage_24h,
        change_7d_pct: c.price_change_percentage_7d_in_currency,
        change_30d_pct: c.price_change_percentage_30d_in_currency,
        change_1y_pct: c.price_change_percentage_1y_in_currency,
      };
    }
  }
  const onchain: any = { ok: blockHeight != null || !!fees || !!hashrate, block_height: blockHeight };
  if (fees) onchain.fees = { fastest: fees.fastestFee, half_hour: fees.halfHourFee };
  if (hashrate?.currentHashrate) onchain.hashrate_ehs = Math.round((hashrate.currentHashrate / 1e18) * 100) / 100;
  if (hashrate?.currentDifficulty) onchain.difficulty = hashrate.currentDifficulty;

  const body = JSON.stringify({
    ok: Object.keys(coins).length > 0 || onchain.ok,
    generated_at: new Date().toISOString(),
    coins_ok: Object.keys(coins).length > 0, coins,
    btc_history: btcHist, eth_history: ethHist, onchain,
  });
  return new Response(body, { headers: { "Content-Type": "application/json", "Cache-Control": "s-maxage=300, stale-while-revalidate=1800" } });
}
