import React from "react";
import AsOf from "./AsOf";
import { GRADE_COLORS, INK, RATING_COLORS, alpha } from "../theme";

export function Card({ title, sub, children, className = "", asOfSource, asOfDate }: {
  title?: string; sub?: string; children: React.ReactNode; className?: string;
  /** freshness_manifest key (e.g. "universe_floor0") — renders the global AsOf badge top-right */
  asOfSource?: string;
  /** explicit vintage for panels that carry their own as_of/generated_at */
  asOfDate?: string | null;
}) {
  const badge = asOfSource || asOfDate ? <AsOf source={asOfSource} date={asOfDate} /> : null;
  return (
    <div className={`rounded-lg border border-line bg-panel p-4 ${className}`}>
      {(title || badge) && (
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm font-semibold text-ink">{title}</div>
          {badge}
        </div>
      )}
      {sub && <div className="mb-2 text-xs text-mute">{sub}</div>}
      {children}
    </div>
  );
}

export function Metric({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-mute">{label}</div>
      <div className="mt-1 text-xl font-semibold text-ink">{value}</div>
      {hint && <div className="text-xs text-mute">{hint}</div>}
    </div>
  );
}

export function RatingBadge({ rating }: { rating: string }) {
  const c = RATING_COLORS[rating] ?? INK.mute;
  return (
    <span
      className="inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold"
      style={{ color: c, background: alpha(c, 0.13), border: `1px solid ${alpha(c, 0.33)}` }}
    >
      {rating}
    </span>
  );
}

export function GradePill({ grade }: { grade: string | null | undefined }) {
  if (!grade || grade === "N/A" || grade === "---") return <span className="text-mute">—</span>;
  const c = GRADE_COLORS[grade] ?? INK.mute;
  return <span className="font-semibold" style={{ color: c }}>{grade}</span>;
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 p-8 text-mute">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-line-2 border-t-link" />
      {label}
    </div>
  );
}

export function Unavailable({ what, detail }: { what: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-warn/25 bg-warn/5 p-5">
      <div className="text-sm font-semibold text-warn">⚠ {what} temporarily unavailable</div>
      <p className="mt-1 text-xs leading-relaxed text-ink-3">
        {detail ?? "The live data source didn’t respond. This is a transient condition — other tabs are unaffected. Try again shortly."}
      </p>
    </div>
  );
}

export function Pill({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
        active ? "bg-cta text-white" : "bg-raised text-ink-3 hover:bg-active"
      }`}
    >
      {children}
    </button>
  );
}

export const TH = ({ children, className = "", ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th {...p} className={`sticky top-0 z-10 bg-head px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-mute ${className}`}>
    {children}
  </th>
);

export const TD = ({ children, className = "", ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td {...p} className={`whitespace-nowrap px-3 py-1.5 ${className}`}>{children}</td>
);
