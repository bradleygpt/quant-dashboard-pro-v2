// Edge function: live market data for the Market Regime tab.
// KEYLESS — uses Yahoo Finance chart API + FRED's keyless fredgraph.csv.
// FRED_API_KEY is NOT required (the CSV endpoint needs no key); if set it is
// ignored here. Every fetch is wrapped, time-bounded, and degrades to nulls.
export const config = { runtime: "edge" };

const UA = { "User-Agent": "Mozilla/5.0 (compatible; QuantDashboard/2.0)" };
const US_GDP_TRILLIONS = 29.7; // sentiment.py US_GDP_TRILLIONS

async function tfetch(url: string, opts: RequestInit = {}, ms = 8000): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    return r.ok ? r : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function yahooCloses(symbol: string, range = "1y"): Promise<number[] | null> {
  const r = await tfetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`, { headers: UA });
  if (!r) return null;
  try {
    const j: any = await r.json();
    const closes = j?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
    return Array.isArray(closes) ? closes.filter((x: any) => typeof x === "number" && isFinite(x)) : null;
  } catch { return null; }
}

function last<T>(a: T[]): T | null { return a.length ? a[a.length - 1] : null; }
function pctChange(c: number[], lookback: number): number | null {
  if (c.length <= lookback) return null;
  const cur = c[c.length - 1], prev = c[c.length - 1 - lookback];
  return prev ? ((cur - prev) / prev) * 100 : null;
}

const INDICES: [string, string][] = [
  ["^GSPC", "S&P 500"], ["^IXIC", "Nasdaq"], ["^DJI", "Dow Jones"], ["^RUT", "Russell 2000"],
];

function vixScore(v: number): [string, number] {
  if (v < 12) return ["Extreme Complacency", 95];
  if (v < 16) return ["Low Volatility", 80];
  if (v < 20) return ["Normal", 55];
  if (v < 25) return ["Elevated Caution", 35];
  if (v < 30) return ["High Fear", 20];
  if (v < 40) return ["Extreme Fear", 10];
  return ["Panic", 2];
}
function buffettLevel(r: number): [string, number] {
  if (r > 200) return ["Significantly Overvalued", 10];
  if (r > 150) return ["Overvalued", 30];
  if (r > 120) return ["Fairly Valued", 50];
  if (r > 90) return ["Undervalued", 70];
  return ["Significantly Undervalued", 90];
}

async function fredLatest(seriesId: string): Promise<number | null> {
  // keyless CSV endpoint (economic_calendar.py fallback path) — FRED is slower; allow 12s
  const r = await tfetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}`, { headers: UA }, 12000);
  if (!r) return null;
  try {
    const txt = await r.text();
    const lines = txt.trim().split("\n");
    for (let i = lines.length - 1; i >= 1; i--) {
      const parts = lines[i].split(",");
      const v = parseFloat(parts[1]);
      if (isFinite(v)) return v;
    }
  } catch { /* ignore */ }
  return null;
}

export default async function handler() {
  const [indexCloses, vixCloses, tnx, irx, w5000, mmMillions, sepMedian, sepLongRun] = await Promise.all([
    Promise.all(INDICES.map(([sym]) => yahooCloses(sym))),
    yahooCloses("^VIX"),
    yahooCloses("^TNX"), yahooCloses("^IRX"), yahooCloses("^W5000"),
    fredLatest("MMMFFAQ027S"),
    fredLatest("FEDTARMD"),    // SEP median target, current year (keyless)
    fredLatest("FEDTARMDLR"),  // SEP median target, longer run
  ]);

  // indices
  const indices = INDICES.map(([, name], i) => {
    const c = indexCloses[i];
    if (!c || !c.length) return { name, ok: false };
    const cur = last(c)!, ath = Math.max(...c);
    return {
      name, ok: true, price: cur, all_time_high: ath,
      distance_from_ath_pct: ((cur - ath) / ath) * 100,
      change_1d_pct: pctChange(c, 1), change_1m_pct: pctChange(c, 22), change_3m_pct: pctChange(c, 66),
    };
  });

  // SPY (^GSPC) moving averages + 3-month return — for Pullback Pressure
  let spy: any = { ok: false };
  {
    const c = indexCloses[0]; // ^GSPC
    if (c && c.length >= 50) {
      const sma = (n: number) => c.length >= n ? c.slice(-n).reduce((a, b) => a + b, 0) / n : null;
      const cur = c[c.length - 1];
      const ago3m = c.length > 63 ? c[c.length - 64] : c[0];
      spy = { ok: true, price: cur, sma50: sma(50), sma200: sma(200),
              ret_3m_pct: ago3m ? ((cur - ago3m) / ago3m) * 100 : null };
    }
  }

  // VIX
  let vix: any = { ok: false };
  if (vixCloses && vixCloses.length) {
    const cur = last(vixCloses)!;
    const win = vixCloses.slice(-252);
    const hi = Math.max(...win), lo = Math.min(...win);
    const [level, score] = vixScore(cur);
    vix = { ok: true, current: cur, avg_1y: win.reduce((a, b) => a + b, 0) / win.length, high_1y: hi, low_1y: lo,
            percentile: hi > lo ? ((cur - lo) / (hi - lo)) * 100 : 50, level, score };
  }

  // yield curve
  let yields: any = { ok: false };
  if (tnx?.length && irx?.length) {
    const y10 = last(tnx)!, y2 = last(irx)!;
    yields = { ok: true, y10, y2, spread: y10 - y2 };
  }

  // buffett indicator
  let buffett: any = { ok: false };
  if (w5000?.length) {
    const mcapT = (last(w5000)! * 1.2) / 1000;
    const ratio = (mcapT / US_GDP_TRILLIONS) * 100;
    const [level, score] = buffettLevel(ratio);
    buffett = { ok: true, ratio, level, score, market_cap_t: mcapT, gdp_t: US_GDP_TRILLIONS };
  }

  // PGI: money-market AUM / total market cap
  let pgi: any = { ok: false };
  if (w5000?.length) {
    let mmT = mmMillions != null ? mmMillions / 1e6 : 7.0; // FRED millions -> trillions; fallback 7.0
    if (!(mmT >= 1 && mmT <= 20)) mmT = 7.0;
    const totalT = last(w5000)! / 1000;
    const val = totalT > 0 ? (mmT / totalT) * 100 : 0;
    const level = val > 11.5 ? "Eager to Invest" : val >= 9.5 ? "Neutral" : "Cautious";
    const score = val > 11.5 ? Math.min(100, (val - 8) * 5) : val >= 9.5 ? 50 : Math.max(0, val * 5);
    pgi = { ok: true, pgi: val, money_market_t: mmT, total_mkt_cap_t: totalT, level, score, fred_keyless: mmMillions != null };
  }

  const dots = (sepMedian != null || sepLongRun != null)
    ? { ok: true, median_current_year: sepMedian, median_longer_run: sepLongRun } : { ok: false };
  const body = JSON.stringify({ ok: true, generated_at: new Date().toISOString(), indices, spy, vix, yields, buffett, pgi, dots });
  return new Response(body, {
    headers: { "Content-Type": "application/json", "Cache-Control": "s-maxage=600, stale-while-revalidate=3600" },
  });
}
