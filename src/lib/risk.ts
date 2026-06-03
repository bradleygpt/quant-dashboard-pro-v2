// Faithful port of risk_metrics.py (price-only metrics). Computed from the baked
// daily close series. Beta/alpha (need a benchmark series) are omitted. Verified
// against the Python source — see web/scripts/validate-risk.ts.
const RF = 0.04, TD = 252;

function dailyReturns(closes: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < closes.length; i++) r.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  return r;
}
function mean(a: number[]) { return a.reduce((x, y) => x + y, 0) / a.length; }
function std(a: number[]) { // ddof=1 (sample)
  if (a.length < 2) return 0; const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}

export interface RiskMetrics {
  cagr_pct: number | null; sharpe: number | null; sortino: number | null;
  calmar: number | null; max_drawdown_pct: number | null; volatility_pct: number | null;
  current_drawdown_pct: number | null;
}

export function computeRisk(closes: number[]): RiskMetrics | null {
  if (!closes || closes.length < 30) return null;
  const rets = dailyReturns(closes);
  if (rets.length < 2) return null;
  const rfPer = (1 + RF) ** (1 / TD) - 1;
  const sd = std(rets);
  const excessMean = mean(rets.map((x) => x - rfPer));
  const sharpe = sd === 0 ? null : excessMean / sd * Math.sqrt(TD);
  const down = rets.filter((x) => x < 0);
  const dsd = down.length >= 2 ? std(down) : null;
  const sortino = dsd && dsd !== 0 ? excessMean / dsd * Math.sqrt(TD) : null;
  const vol = sd * Math.sqrt(TD) * 100;

  // max drawdown on cumulative returns
  let cum = 1, peak = 1, maxDD = 0;
  for (const r of rets) { cum *= 1 + r; if (cum > peak) peak = cum; const dd = (cum - peak) / peak; if (dd < maxDD) maxDD = dd; }
  const maxDDpct = Math.abs(maxDD) * 100;

  const nYears = rets.length / TD;
  let cumRet = 1; for (const r of rets) cumRet *= 1 + r; cumRet -= 1;
  const cagr = nYears > 0 && cumRet > -1 ? ((1 + cumRet) ** (1 / nYears) - 1) : null;
  const calmar = cagr != null && maxDDpct > 0 ? cagr / (maxDDpct / 100) : null;

  // current drawdown vs ATH (on prices)
  let p = closes[0]; for (const c of closes) if (c > p) p = c;
  const curDD = Math.abs((closes[closes.length - 1] - p) / p) * 100;

  return {
    cagr_pct: cagr != null ? cagr * 100 : null, sharpe, sortino, calmar,
    max_drawdown_pct: maxDDpct, volatility_pct: vol, current_drawdown_pct: curDD,
  };
}
