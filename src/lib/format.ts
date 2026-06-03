export function fmtMoney(v: number | null | undefined, dp = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}

export function fmtNum(v: number | null | undefined, dp = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function fmtPct(v: number | null | undefined, dp = 1, signed = false): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const s = `${v.toFixed(dp)}%`;
  return signed && v > 0 ? `+${s}` : s;
}

export function fmtCapB(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v >= 1000) return `$${(v / 1000).toFixed(2)}T`;
  return `$${v.toFixed(1)}B`;
}

// premium/discount of price vs a fair anchor, as a percentage
export function premiumPct(price: number | null, anchor: number | null): number | null {
  if (!price || !anchor || anchor <= 0) return null;
  return (price / anchor - 1) * 100;
}
