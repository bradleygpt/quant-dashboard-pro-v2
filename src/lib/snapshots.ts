// Port of snapshots._get_derived_snapshot delta logic: find the snapshot value
// closest to 7 / 30 days ago (±3 day tolerance) and compute the % change.
export interface SnapshotsFile { snapshots?: Record<string, Record<string, number>>; last_capture_date?: string }

function closestValue(series: Record<string, number>, targetDaysAgo: number, tolDays = 3): number | null {
  const now = Date.now();
  const target = now - targetDaysAgo * 86400000;
  let best: number | null = null, bestDiff = Infinity;
  for (const [date, val] of Object.entries(series)) {
    const t = Date.parse(date + "T00:00:00Z");
    if (Number.isNaN(t)) continue;
    const diff = Math.abs(t - target);
    if (diff <= tolDays * 86400000 && diff < bestDiff) { bestDiff = diff; best = val; }
  }
  return best;
}

export function getDeltas(snap: SnapshotsFile | null, indicator: string, current: number | null):
  { wk: number | null; mo: number | null } {
  if (!snap?.snapshots || current == null) return { wk: null, mo: null };
  const series = snap.snapshots[indicator];
  if (!series) return { wk: null, mo: null };
  const w = closestValue(series, 7), m = closestValue(series, 30);
  return {
    wk: w != null && w !== 0 ? (current / w - 1) * 100 : null,
    mo: m != null && m !== 0 ? (current / m - 1) * 100 : null,
  };
}
