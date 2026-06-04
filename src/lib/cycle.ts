// Bitcoin cycle analysis — faithful port of crypto.py / cycle_timeline.py
// constants + computations. Static constants copied verbatim; price-derived
// pieces (200-week MA, cycle overlay) computed from /api/crypto btc_daily_max.

export const HALVINGS = [
  { date: "2012-11-28", reward_after: 25.0 },
  { date: "2016-07-09", reward_after: 12.5 },
  { date: "2020-05-11", reward_after: 6.25 },
  { date: "2024-04-19", reward_after: 3.125 },
  { date: "2028-04-01", reward_after: 1.5625, estimated: true },
];

export const CYCLE_PHASES: [number, number, string, string][] = [
  [0, 180, "Post-Halving Quiet", "Price often consolidates 3–6 months post-halving"],
  [180, 450, "Early Markup", "Historical pattern: gradual uptrend begins"],
  [450, 600, "Late Markup / Peak Window", "Historical peaks occurred 12–18 months post-halving"],
  [600, 730, "Distribution / Early Bear", "Historical pattern: peak forms, then decline begins"],
  [730, 1100, "Bear Market", "Historical bear lasts 12–18 months"],
  [1100, 1460, "Accumulation", "Pre-halving accumulation phase"],
];

export interface Cycle { label: string; halving: string; halving_price: number; takeoff: string | null; takeoff_price: number | null; peak: string | null; peak_price: number | null; bottom: string | null; bottom_price: number | null; color: string }
export const HISTORICAL_CYCLES: Cycle[] = [
  { label: "Cycle 1 (2012–2015)", halving: "2012-11-28", halving_price: 12, takeoff: "2013-03-01", takeoff_price: 50, peak: "2013-11-30", peak_price: 1163, bottom: "2015-01-14", bottom_price: 178, color: "#666666" },
  { label: "Cycle 2 (2016–2018)", halving: "2016-07-09", halving_price: 650, takeoff: "2017-03-01", takeoff_price: 1200, peak: "2017-12-17", peak_price: 19783, bottom: "2018-12-15", bottom_price: 3200, color: "#888888" },
  { label: "Cycle 3 (2020–2022)", halving: "2020-05-11", halving_price: 8800, takeoff: "2020-10-01", takeoff_price: 11000, peak: "2021-11-09", peak_price: 68789, bottom: "2022-11-21", bottom_price: 15500, color: "#5DADE2" },
  { label: "Cycle 4 (2024–current)", halving: "2024-04-19", halving_price: 64000, takeoff: "2024-10-01", takeoff_price: 65000, peak: "2025-10-06", peak_price: 126198, bottom: null, bottom_price: null, color: "#F7931A" },
];

export interface EtfEvent { date: string; label: string; short_label: string; description: string; impact: string; color: string }
export const ETF_EVENTS: EtfEvent[] = [
  { date: "2024-01-11", label: "BTC Spot ETF launch", short_label: "BTC ETF", description: "First US spot Bitcoin ETFs began trading (IBIT, FBTC, etc.)", impact: "Pre-halving institutional bid changed cycle dynamics fundamentally", color: "#9B59B6" },
  { date: "2024-07-23", label: "ETH Spot ETF launch", short_label: "ETH ETF", description: "First US spot Ethereum ETFs began trading", impact: "Brought institutional access to ETH (no staking allowed in ETFs)", color: "#627EEA" },
  { date: "2024-09-20", label: "BTC ETF options approved", short_label: "IBIT options", description: "SEC approved options trading on BTC ETFs", impact: "Deepened institutional access; enabled hedging and leverage", color: "#9B59B6" },
];

// ETH supply reference points (crypto.py ETH_SUPPLY_REFERENCES)
export const ETH_SUPPLY_REFERENCES = {
  merge_date: "2022-09-15",
  merge_supply: 120_521_000,
  approximate_annual_issuance_pct: 0.55,
  staking_ratio_pct_approx: 28,
};

const DAY = 86400000;
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

export function historicalAverages(include2012 = true) {
  let done = HISTORICAL_CYCLES.filter((c) => c.takeoff && c.peak && c.bottom);
  if (!include2012) done = done.filter((c) => Date.parse(c.halving) >= Date.parse("2016-01-01"));
  const avg = (f: (c: Cycle) => number) => Math.round(done.reduce((a, c) => a + f(c), 0) / done.length);
  return {
    avg_days_to_takeoff: avg((c) => days(c.halving, c.takeoff!)),
    avg_days_to_peak: avg((c) => days(c.halving, c.peak!)),
    avg_days_to_bottom: avg((c) => days(c.halving, c.bottom!)),
    avg_days_peak_to_bottom: avg((c) => days(c.peak!, c.bottom!)),
    avg_days_takeoff_to_peak: avg((c) => days(c.takeoff!, c.peak!)),
    n: done.length,
    cycles_used: done.map((c) => c.label),
  };
}

export function cycleMilestones() {
  return HISTORICAL_CYCLES.map((c) => ({
    label: c.label, halving: c.halving,
    days_to_takeoff: c.takeoff ? days(c.halving, c.takeoff) : null,
    days_to_peak: c.peak ? days(c.halving, c.peak) : null,
    days_to_bottom: c.bottom ? days(c.halving, c.bottom) : null,
    days_takeoff_to_peak: c.takeoff && c.peak ? days(c.takeoff, c.peak) : null,
    days_peak_to_bottom: c.peak && c.bottom ? days(c.peak, c.bottom) : null,
  }));
}

export function cycleCountdown(nowISO: string, include2012 = true) {
  const cur = HISTORICAL_CYCLES[HISTORICAL_CYCLES.length - 1];
  const avg = historicalAverages(include2012);
  const daysSinceHalving = days(cur.halving, nowISO);
  const daysSincePeak = cur.peak ? days(cur.peak, nowISO) : null;
  const projBottom = cur.peak ? new Date(Date.parse(cur.peak) + avg.avg_days_peak_to_bottom * DAY).toISOString().slice(0, 10) : null;
  const daysToBottom = projBottom ? days(nowISO, projBottom) : null;
  const nextHalving = "2028-04-01";
  const daysToNextHalving = days(nowISO, nextHalving);
  const projNextTakeoff = new Date(Date.parse(nextHalving) + avg.avg_days_to_takeoff * DAY).toISOString().slice(0, 10);
  const projNextPeak = new Date(Date.parse(nextHalving) + avg.avg_days_to_peak * DAY).toISOString().slice(0, 10);
  const phase = CYCLE_PHASES.find(([lo, hi]) => daysSinceHalving >= lo && daysSinceHalving < hi);
  return { daysSinceHalving, daysSincePeak, projBottom, daysToBottom, nextHalving, daysToNextHalving, projNextTakeoff, projNextPeak, phase, avg };
}

// 200-week moving average from daily closes
export function weekly200MA(series: { dates: string[]; close: number[] } | null): { date: string; ma: number }[] {
  if (!series) return [];
  // resample to weekly (last close per ISO week)
  const byWeek = new Map<string, { date: string; close: number }>();
  for (let i = 0; i < series.dates.length; i++) {
    const d = new Date(series.dates[i]);
    const onejan = new Date(d.getFullYear(), 0, 1);
    const wk = Math.ceil((((d.getTime() - onejan.getTime()) / DAY) + onejan.getDay() + 1) / 7);
    const key = `${d.getFullYear()}-W${wk}`;
    byWeek.set(key, { date: series.dates[i], close: series.close[i] }); // last wins (sorted ascending)
  }
  const weeks = [...byWeek.values()];
  const out: { date: string; ma: number }[] = [];
  for (let i = 199; i < weeks.length; i++) {
    let s = 0; for (let j = i - 199; j <= i; j++) s += weeks[j].close;
    out.push({ date: weeks[i].date, ma: s / 200 });
  }
  return out;
}

// Cycle overlay in % RETURN since the halving (day 0). Intentionally diverges from
// the Streamlit source's absolute-dollar scaling (which produced the meaningless
// ~$1.1M y-axis): every cycle is expressed as % change from its own day-0 close, so
// the current cycle is directly comparable to the 2016/2020 return *rhythm* on one
// axis. Returns per-day {day, proj_low, proj_median, proj_high, current} in percent.
export function buildCyclePctOverlay(series: { dates: string[]; close: number[] } | null) {
  if (!series) return [];
  const past = ["2016-07-09", "2020-05-11"];
  const curHalving = "2024-04-19";
  const idx = series.dates.map((d) => Date.parse(d));
  const slice = (startISO: string, endDays: number) => {
    const start = Date.parse(startISO);
    const pts: { day: number; close: number }[] = [];
    for (let i = 0; i < idx.length; i++) {
      const dd = Math.round((idx[i] - start) / DAY);
      if (dd >= 0 && dd <= endDays) pts.push({ day: dd, close: series.close[i] });
    }
    return pts.sort((a, b) => a.day - b.day);
  };
  const toPct = (pts: { day: number; close: number }[]) => {
    if (!pts.length) return [] as { day: number; pct: number }[];
    const base = pts[0].close; // day-0 (or earliest available) close
    return base > 0 ? pts.map((p) => ({ day: p.day, pct: (p.close / base - 1) * 100 })) : [];
  };
  const median = (sorted: number[]): number | null => {
    if (!sorted.length) return null;
    const m = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
  };
  const perDay = new Map<number, number[]>();
  for (const h of past) for (const p of toPct(slice(h, 1400))) { const a = perDay.get(p.day) ?? []; a.push(p.pct); perDay.set(p.day, a); }
  const curPts = new Map<number, number>();
  for (const p of toPct(slice(curHalving, 1400))) curPts.set(p.day, p.pct);
  const allDays = new Set<number>([...perDay.keys(), ...curPts.keys()]);
  return [...allDays].sort((a, b) => a - b).map((day) => {
    const vals = (perDay.get(day) ?? []).slice().sort((a, b) => a - b);
    return {
      day,
      proj_low: vals.length ? vals[0] : null,
      proj_high: vals.length ? vals[vals.length - 1] : null,
      proj_median: median(vals),
      current: curPts.get(day) ?? null,
    };
  });
}

// Cycle overlay: scale past cycles (2016, 2020) to the current halving price and
// aggregate min/median/max by days-since-halving; merge the current cycle path.
export function buildCycleOverlay(series: { dates: string[]; close: number[] } | null) {
  if (!series) return [];
  const past = [{ halving: "2016-07-09", hp: 650 }, { halving: "2020-05-11", hp: 8800 }];
  const curHalving = "2024-04-19", curHp = 64000;
  const idx = series.dates.map((d) => Date.parse(d));
  const sliceFrom = (startISO: string, endDays: number) => {
    const start = Date.parse(startISO);
    const pts: { day: number; close: number }[] = [];
    for (let i = 0; i < idx.length; i++) {
      const dd = Math.round((idx[i] - start) / DAY);
      if (dd >= 0 && dd <= endDays) pts.push({ day: dd, close: series.close[i] });
    }
    return pts;
  };
  // scaled historical paths
  const perDay = new Map<number, number[]>();
  for (const c of past) {
    const scale = curHp / c.hp;
    for (const p of sliceFrom(c.halving, 1400)) {
      const arr = perDay.get(p.day) ?? []; arr.push(p.close * scale); perDay.set(p.day, arr);
    }
  }
  const curPts = new Map<number, number>();
  for (const p of sliceFrom(curHalving, 1400)) curPts.set(p.day, p.close);

  // Proper median (matches pandas/numpy: even length averages the two middle values).
  // The previous vals[floor(len/2)] returned the UPPER element, so for the 2-cycle
  // band median always equalled max — the high==median bug.
  const median = (sorted: number[]): number | null => {
    if (!sorted.length) return null;
    const m = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
  };
  const allDays = new Set<number>([...perDay.keys(), ...curPts.keys()]);
  const rows = [...allDays].sort((a, b) => a - b).map((day) => {
    const vals = (perDay.get(day) ?? []).slice().sort((a, b) => a - b);
    return {
      day,
      proj_low: vals.length ? vals[0] : null,
      proj_high: vals.length ? vals[vals.length - 1] : null,
      proj_median: median(vals),
      current: curPts.get(day) ?? null,
    };
  });
  return rows;
}

// ── Halving info / cycle phase (crypto.py get_current_halving_info / get_cycle_phase) ──
const REWARDS: Record<string, number> = { "2012-11-28": 25, "2016-07-09": 12.5, "2020-05-11": 6.25, "2024-04-19": 3.125, "2028-04-01": 1.5625 };
export function getCurrentHalvingInfo(nowISO: string) {
  const now = Date.parse(nowISO);
  const past = HALVINGS.filter((h) => Date.parse(h.date) <= now);
  const future = HALVINGS.filter((h) => Date.parse(h.date) > now);
  if (!past.length) return null;
  const last = past[past.length - 1];
  const daysSince = days(last.date, nowISO);
  let next: typeof HALVINGS[number] | null = null, daysUntil: number | null = null, progress: number | null = null;
  if (future.length) {
    next = future[0];
    daysUntil = days(nowISO, next.date);
    const cycleLen = days(last.date, next.date);
    progress = (daysSince / cycleLen) * 100;
  }
  return {
    last_halving: last.date, next_halving: next ? next.date : null,
    next_halving_estimated: next ? !!next.estimated : false,
    days_since_last: daysSince, days_until_next: daysUntil,
    cycle_progress_pct: progress == null ? null : Math.round(progress * 10) / 10,
    current_reward: last.reward_after, next_reward: next ? next.reward_after : null,
  };
}

export function getCyclePhase(daysSince: number) {
  for (const [lo, hi, label, description] of CYCLE_PHASES) {
    if (daysSince >= lo && daysSince < hi) return { phase: label, description, days_in_phase: daysSince - lo, phase_duration: hi - lo };
  }
  return { phase: "Beyond Historical Pattern", description: "We are past the typical 4-year cycle window. Pattern is breaking down or extended.", days_in_phase: daysSince, phase_duration: null as number | null };
}

export function estimateNextHalvingFromBlock(block: number | null | undefined, nowISO: string) {
  if (block == null) return null;
  const nextBlock = (Math.floor(block / 210_000) + 1) * 210_000;
  const blocksToGo = nextBlock - block;
  const daysToGo = (blocksToGo * 9.85) / (60 * 24);
  const estDate = new Date(Date.parse(nowISO) + daysToGo * DAY).toISOString().slice(0, 10);
  return { next_halving_block: nextBlock, blocks_remaining: blocksToGo, estimated_date: estDate, days_remaining: Math.round(daysToGo) };
}

// ── Weekly resample (last close per ISO week, ordered) ──
function weeklyLast(series: { dates: string[]; close: number[] }): number[] {
  const byWeek = new Map<string, { t: number; close: number }>();
  for (let i = 0; i < series.dates.length; i++) {
    const d = new Date(series.dates[i]);
    const key = `${d.getUTCFullYear()}-${Math.floor(d.getTime() / (7 * DAY))}`;
    byWeek.set(key, { t: d.getTime(), close: series.close[i] });
  }
  return [...byWeek.values()].sort((a, b) => a.t - b.t).map((w) => w.close);
}
function smaLast(arr: number[], n: number): number | null {
  if (arr.length < n) return null;
  let s = 0; for (let i = arr.length - n; i < arr.length; i++) s += arr[i];
  return s / n;
}

// ── BTC valuation indicators (crypto.py compute_btc_valuation_indicators) ──
export function btcValuationIndicators(series: { dates: string[]; close: number[] } | null | undefined) {
  if (!series || !series.close.length) return null;
  const close = series.close;
  const current = close[close.length - 1];
  const ath = Math.max(...close);
  const athIdx = close.indexOf(ath);
  const ath_date = series.dates[athIdx];
  const distance_from_ath = ((current - ath) / ath) * 100;
  const sma111 = smaLast(close, 111);
  const sma350 = smaLast(close, 350);
  const sma350x2 = sma350 == null ? null : sma350 * 2;
  const pi_cycle_signal = sma111 != null && sma350x2 != null && sma111 > sma350x2 ? "Top Triggered" : "Below Top";
  const pi_cycle_distance = sma111 != null && sma350x2 != null ? ((sma111 - sma350x2) / sma350x2) * 100 : null;
  const sma200 = smaLast(close, 200);
  const mayer = sma200 && sma200 > 0 ? current / sma200 : null;
  // Weekly RSI(14)
  const weekly = weeklyLast(series);
  let rsi: number | null = null;
  if (weekly.length >= 15) {
    const gains: number[] = [], losses: number[] = [];
    for (let i = 1; i < weekly.length; i++) { const d = weekly[i] - weekly[i - 1]; gains.push(d > 0 ? d : 0); losses.push(d < 0 ? -d : 0); }
    const avgG = smaLast(gains, 14), avgL = smaLast(losses, 14);
    if (avgG != null && avgL != null) { const rs = avgL === 0 ? Infinity : avgG / avgL; rsi = 100 - 100 / (1 + rs); }
  }
  return {
    current_price: current, ath, ath_date, distance_from_ath_pct: round2(distance_from_ath),
    pi_cycle_signal, pi_cycle_distance_pct: pi_cycle_distance == null ? null : round2(pi_cycle_distance),
    sma_111d: sma111, sma_350d_x2: sma350x2, sma_200d: sma200,
    mayer_multiple: mayer == null ? null : Math.round(mayer * 1000) / 1000,
    rsi_weekly: rsi == null ? null : Math.round(rsi * 10) / 10,
  };
}
const round2 = (x: number) => Math.round(x * 100) / 100;

export interface Interp { indicator: string; value: string; interp: string; tone: "red" | "orange" | "yellow" | "green" }
export function interpretValuation(ind: ReturnType<typeof btcValuationIndicators>): Interp[] {
  if (!ind) return [];
  const out: Interp[] = [];
  const mm = ind.mayer_multiple;
  if (mm != null) {
    if (mm > 2.4) out.push({ indicator: "Mayer Multiple", value: mm.toFixed(2), interp: "Historically extreme — past tops occurred near 2.4+", tone: "red" });
    else if (mm > 1.5) out.push({ indicator: "Mayer Multiple", value: mm.toFixed(2), interp: "Elevated — caution zone", tone: "orange" });
    else if (mm > 1.0) out.push({ indicator: "Mayer Multiple", value: mm.toFixed(2), interp: "Above 200-DMA — neutral to bullish", tone: "yellow" });
    else if (mm > 0.7) out.push({ indicator: "Mayer Multiple", value: mm.toFixed(2), interp: "Below 200-DMA — historically a buy zone", tone: "green" });
    else out.push({ indicator: "Mayer Multiple", value: mm.toFixed(2), interp: "Deep discount — historically bear-market lows", tone: "green" });
  }
  const rsi = ind.rsi_weekly;
  if (rsi != null) {
    if (rsi > 80) out.push({ indicator: "Weekly RSI", value: rsi.toFixed(0), interp: "Extreme overbought", tone: "red" });
    else if (rsi > 70) out.push({ indicator: "Weekly RSI", value: rsi.toFixed(0), interp: "Overbought", tone: "orange" });
    else if (rsi > 50) out.push({ indicator: "Weekly RSI", value: rsi.toFixed(0), interp: "Bullish bias", tone: "yellow" });
    else if (rsi > 30) out.push({ indicator: "Weekly RSI", value: rsi.toFixed(0), interp: "Neutral to weak", tone: "yellow" });
    else out.push({ indicator: "Weekly RSI", value: rsi.toFixed(0), interp: "Oversold — historically a buy zone", tone: "green" });
  }
  if (ind.pi_cycle_signal) {
    if (ind.pi_cycle_signal === "Top Triggered") out.push({ indicator: "Pi Cycle Top", value: "TRIGGERED", interp: "111-DMA > 350-DMA × 2 — historical top signal", tone: "red" });
    else out.push({ indicator: "Pi Cycle Top", value: `${(ind.pi_cycle_distance_pct ?? 0) >= 0 ? "+" : ""}${(ind.pi_cycle_distance_pct ?? 0).toFixed(1)}% from trigger`, interp: "Below historical top threshold", tone: "green" });
  }
  const dist = ind.distance_from_ath_pct;
  if (dist != null) {
    const v = `${dist >= 0 ? "+" : ""}${dist.toFixed(1)}%`;
    if (dist > -5) out.push({ indicator: "From ATH", value: v, interp: "At or near all-time high", tone: "red" });
    else if (dist > -20) out.push({ indicator: "From ATH", value: v, interp: "Modest pullback from ATH", tone: "yellow" });
    else if (dist > -50) out.push({ indicator: "From ATH", value: v, interp: "Significant correction", tone: "orange" });
    else out.push({ indicator: "From ATH", value: v, interp: "Deep bear territory — historical buy zone", tone: "green" });
  }
  return out;
}

// ── ETH supply metrics (crypto.py compute_eth_supply_metrics) ──
export function ethSupplyMetrics(circulatingSupply: number | null | undefined, nowISO: string) {
  if (circulatingSupply == null) return null;
  const mergeSupply = ETH_SUPPLY_REFERENCES.merge_supply;
  const daysSinceMerge = days(ETH_SUPPLY_REFERENCES.merge_date, nowISO);
  const yearsSinceMerge = daysSinceMerge / 365.25;
  const netChange = circulatingSupply - mergeSupply;
  const netChangePct = (netChange / mergeSupply) * 100;
  const annualizedPct = yearsSinceMerge > 0 ? netChangePct / yearsSinceMerge : 0;
  return {
    current_supply: circulatingSupply, merge_supply: mergeSupply,
    net_change_since_merge: netChange, net_change_pct: Math.round(netChangePct * 1000) / 1000,
    annualized_change_pct: Math.round(annualizedPct * 1000) / 1000,
    years_since_merge: Math.round(yearsSinceMerge * 100) / 100,
    is_deflationary: netChange < 0, is_disinflationary: annualizedPct < ETH_SUPPLY_REFERENCES.approximate_annual_issuance_pct,
    staking_ratio_pct: ETH_SUPPLY_REFERENCES.staking_ratio_pct_approx,
  };
}

// ── ETH/BTC ratio (crypto.py compute_eth_btc_ratio) ──
export function ethBtcRatio(eth: { dates: string[]; close: number[] } | null | undefined, btc: { dates: string[]; close: number[] } | null | undefined) {
  if (!eth?.dates?.length || !btc?.dates?.length) return null;
  const btcByDate = new Map(btc.dates.map((d, i) => [d, btc.close[i]]));
  const out: { date: string; t: number; ratio: number }[] = [];
  for (let i = 0; i < eth.dates.length; i++) {
    const b = btcByDate.get(eth.dates[i]);
    if (b && b > 0) out.push({ date: eth.dates[i], t: Date.parse(eth.dates[i]), ratio: eth.close[i] / b });
  }
  if (!out.length) return null;
  const ratios = out.map((r) => r.ratio);
  const current = ratios[ratios.length - 1];
  const r30 = ratios.length >= 30 ? ratios[ratios.length - 30] : null;
  const r1y = ratios.length >= 365 ? ratios[ratios.length - 365] : null;
  const ath = Math.max(...ratios);
  return {
    series: out, current,
    change_30d_pct: r30 ? (current / r30 - 1) * 100 : null,
    change_1y_pct: r1y ? (current / r1y - 1) * 100 : null,
    from_ath_pct: (current / ath - 1) * 100, ath,
  };
}

// ── Bitcoin Cycle Timeline (cycle_timeline.py render_cycle_timeline) ──
export interface TimelineMarker { t: number; price: number; type: "halving" | "takeoff" | "peak" | "bottom"; label: string; projected: boolean }
export function cycleTimeline(nowISO: string, show2012: boolean, include2012: boolean) {
  const now = Date.parse(nowISO);
  const avg = historicalAverages(include2012);
  const cur = HISTORICAL_CYCLES[HISTORICAL_CYCLES.length - 1];
  const cyclesShown = HISTORICAL_CYCLES.filter((c) => show2012 || Date.parse(c.halving) >= Date.parse("2016-01-01"));

  // Actual event markers, plotted at actual prices
  const markers: TimelineMarker[] = [];
  for (const c of cyclesShown) {
    if (c.halving) markers.push({ t: Date.parse(c.halving), price: c.halving_price, type: "halving", label: `${c.label.split(" ")[1]} halving`, projected: false });
    if (c.takeoff && c.takeoff_price) markers.push({ t: Date.parse(c.takeoff), price: c.takeoff_price, type: "takeoff", label: "Takeoff", projected: false });
    if (c.peak && c.peak_price) markers.push({ t: Date.parse(c.peak), price: c.peak_price, type: "peak", label: "Peak", projected: false });
    if (c.bottom && c.bottom_price) markers.push({ t: Date.parse(c.bottom), price: c.bottom_price, type: "bottom", label: "Bottom", projected: false });
  }

  // Projections
  const curPeakPrice = cur.peak_price ?? 0;
  const curPeakDate = cur.peak ? Date.parse(cur.peak) : now;
  const nextHalving = Date.parse("2028-04-01");
  const nextTakeoff = nextHalving + avg.avg_days_to_takeoff * DAY;
  const nextPeak = nextHalving + avg.avg_days_to_peak * DAY;
  const nextPeakMid = curPeakPrice * 1.4;
  const projBottomDate = curPeakDate + avg.avg_days_peak_to_bottom * DAY;
  const projBottomMid = curPeakPrice * 0.23;

  // Projected (hollow) markers
  const projMarkers: TimelineMarker[] = [
    { t: nextHalving, price: cur.halving_price * 1.0, type: "halving", label: "Next halving (est.)", projected: true },
    { t: nextPeak, price: nextPeakMid, type: "peak", label: "Projected next peak", projected: true },
    { t: projBottomDate, price: projBottomMid, type: "bottom", label: "Projected current-cycle bottom", projected: true },
  ];

  // Trendlines (sorted by date), extended with projection
  const peakPts = cyclesShown.filter((c) => c.peak && c.peak_price).map((c) => ({ t: Date.parse(c.peak!), y: c.peak_price! }));
  peakPts.sort((a, b) => a.t - b.t); peakPts.push({ t: nextPeak, y: nextPeakMid });
  const bottomPts = cyclesShown.filter((c) => c.bottom && c.bottom_price).map((c) => ({ t: Date.parse(c.bottom!), y: c.bottom_price! }));
  bottomPts.sort((a, b) => a.t - b.t); bottomPts.push({ t: projBottomDate, y: projBottomMid });

  return {
    markers, projMarkers, peakTrend: peakPts, bottomTrend: bottomPts,
    nextWindow: { x0: nextHalving, x1: nextPeak + 60 * DAY },
    today: now, nextHalving, nextTakeoff, nextPeak,
    curPeakPrice, ranges: {
      bottomLow: curPeakPrice * 0.15, bottomMid: projBottomMid, bottomHigh: curPeakPrice * 0.35,
      peakLow: curPeakPrice * 1.2, peakMid: nextPeakMid, peakHigh: curPeakPrice * 1.6,
    },
    daysToNextTakeoff: days(nowISO, new Date(nextTakeoff).toISOString().slice(0, 10)),
    daysToNextPeak: days(nowISO, new Date(nextPeak).toISOString().slice(0, 10)),
    avg,
  };
}
