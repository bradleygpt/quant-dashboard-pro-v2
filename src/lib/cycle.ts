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

export const ETF_EVENTS = [
  { date: "2024-01-11", label: "BTC Spot ETF launch" },
  { date: "2024-07-23", label: "ETH Spot ETF launch" },
  { date: "2024-09-20", label: "BTC ETF options approved" },
];

const DAY = 86400000;
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

export function historicalAverages() {
  const done = HISTORICAL_CYCLES.filter((c) => c.takeoff && c.peak && c.bottom);
  const avg = (f: (c: Cycle) => number) => Math.round(done.reduce((a, c) => a + f(c), 0) / done.length);
  return {
    avg_days_to_takeoff: avg((c) => days(c.halving, c.takeoff!)),
    avg_days_to_peak: avg((c) => days(c.halving, c.peak!)),
    avg_days_to_bottom: avg((c) => days(c.halving, c.bottom!)),
    avg_days_peak_to_bottom: avg((c) => days(c.peak!, c.bottom!)),
    avg_days_takeoff_to_peak: avg((c) => days(c.takeoff!, c.peak!)),
    n: done.length,
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

export function cycleCountdown(nowISO: string) {
  const cur = HISTORICAL_CYCLES[HISTORICAL_CYCLES.length - 1];
  const avg = historicalAverages();
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

  const allDays = new Set<number>([...perDay.keys(), ...curPts.keys()]);
  const rows = [...allDays].sort((a, b) => a - b).map((day) => {
    const vals = (perDay.get(day) ?? []).slice().sort((a, b) => a - b);
    const median = vals.length ? vals[Math.floor(vals.length / 2)] : null;
    return {
      day,
      proj_low: vals.length ? vals[0] : null,
      proj_high: vals.length ? vals[vals.length - 1] : null,
      proj_median: median,
      current: curPts.get(day) ?? null,
    };
  });
  return rows;
}
