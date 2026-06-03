import React from "react";

export function Card({ title, sub, children, className = "" }: {
  title?: string; sub?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`rounded-lg border border-[#1E2632] bg-[#121723] p-4 ${className}`}>
      {title && <div className="text-sm font-semibold text-[#E6E9EF]">{title}</div>}
      {sub && <div className="mb-2 text-xs text-[#7C879B]">{sub}</div>}
      {children}
    </div>
  );
}

export function Metric({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-[#1E2632] bg-[#121723] px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-[#7C879B]">{label}</div>
      <div className="mt-1 text-xl font-semibold text-[#E6E9EF]">{value}</div>
      {hint && <div className="text-xs text-[#7C879B]">{hint}</div>}
    </div>
  );
}

const RATING_COLORS: Record<string, string> = {
  "Strong Buy+": "#00FF00",
  "Strong Buy": "#00C805",
  Buy: "#8BC34A",
  Hold: "#FFC107",
  Sell: "#FF5722",
  "Strong Sell": "#D32F2F",
};

export function RatingBadge({ rating }: { rating: string }) {
  const c = RATING_COLORS[rating] ?? "#7C879B";
  return (
    <span
      className="inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold"
      style={{ color: c, background: `${c}22`, border: `1px solid ${c}55` }}
    >
      {rating}
    </span>
  );
}

const GRADE_COLORS: Record<string, string> = {
  "A+": "#00C805", A: "#00C805", "A-": "#4CAF50",
  "B+": "#8BC34A", B: "#8BC34A", "B-": "#CDDC39",
  "C+": "#FFC107", C: "#FFC107", "C-": "#FF9800",
  "D+": "#FF5722", D: "#FF5722", F: "#D32F2F",
};

export function GradePill({ grade }: { grade: string | null | undefined }) {
  if (!grade || grade === "N/A" || grade === "---") return <span className="text-[#7C879B]">—</span>;
  const c = GRADE_COLORS[grade] ?? "#7C879B";
  return <span className="font-semibold" style={{ color: c }}>{grade}</span>;
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 p-8 text-[#7C879B]">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#2A3242] border-t-[#3B82F6]" />
      {label}
    </div>
  );
}

export function Pill({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
        active ? "bg-[#3B82F6] text-white" : "bg-[#1A2130] text-[#9CA7BB] hover:bg-[#222B3C]"
      }`}
    >
      {children}
    </button>
  );
}

export const TH = ({ children, className = "", ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th {...p} className={`sticky top-0 z-10 bg-[#0F1420] px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[#7C879B] ${className}`}>
    {children}
  </th>
);

export const TD = ({ children, className = "", ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td {...p} className={`whitespace-nowrap px-3 py-1.5 ${className}`}>{children}</td>
);
