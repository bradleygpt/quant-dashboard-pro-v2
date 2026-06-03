import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type Align = "left" | "right" | "center";
export interface Column<T> {
  key: string;
  header: ReactNode;
  align?: Align;
  sortable?: boolean; // default true
  /** Value used for sorting. number → numeric; string → locale; null/undefined → always last. */
  sortValue?: (row: T) => number | string | null | undefined;
  render: (row: T) => ReactNode;
  className?: string;
  width?: string; // optional fixed width (used when virtualized, table-layout:fixed)
}

export const RATING_RANK: Record<string, number> = {
  "Strong Buy+": 6, "Strong Buy": 5, Buy: 4, Hold: 3, Sell: 2, "Strong Sell": 1,
};

type Dir = "asc" | "desc";
const ROW_H = 33;          // fixed row height (px) for virtualization
const OVERSCAN = 8;
const VIRTUALIZE_OVER = 60; // auto-virtualize above this row count

function compare(a: unknown, b: unknown, dir: Dir): number {
  const an = a == null || (typeof a === "number" && !Number.isFinite(a));
  const bn = b == null || (typeof b === "number" && !Number.isFinite(b));
  if (an && bn) return 0;
  if (an) return 1;  // nulls always last, regardless of dir
  if (bn) return -1;
  let c: number;
  if (typeof a === "number" && typeof b === "number") c = a - b;
  else c = String(a).localeCompare(String(b));
  return dir === "asc" ? c : -c;
}

export function SortableTable<T>({
  columns, rows, rowKey, initialSortKey, initialSortDir = "desc", maxHeight = "72vh",
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  initialSortKey?: string;
  initialSortDir?: Dir;
  maxHeight?: string;
}) {
  const [sortKey, setSortKey] = useState<string | undefined>(initialSortKey);
  const [dir, setDir] = useState<Dir>(initialSortDir);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(700);
  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (scrollRef.current) setViewH(scrollRef.current.clientHeight);
  }, []);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return rows;
    const sv = col.sortValue;
    return rows.map((r, i) => [r, i] as const)
      .sort((x, y) => { const c = compare(sv(x[0]), sv(y[0]), dir); return c !== 0 ? c : x[1] - y[1]; })
      .map(([r]) => r);
  }, [rows, columns, sortKey, dir]);

  const onHeader = (col: Column<T>) => {
    if (col.sortable === false || !col.sortValue) return;
    if (sortKey === col.key) setDir(dir === "asc" ? "desc" : "asc");
    else { setSortKey(col.key); setDir(typeof col.sortValue(rows[0]) === "string" ? "asc" : "desc"); }
  };

  const alignCls = (a?: Align) => a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

  const virtual = sorted.length > VIRTUALIZE_OVER;
  const start = virtual ? Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN) : 0;
  const end = virtual ? Math.min(sorted.length, Math.ceil((scrollTop + viewH) / ROW_H) + OVERSCAN) : sorted.length;
  const topPad = start * ROW_H;
  const bottomPad = (sorted.length - end) * ROW_H;
  const visible = sorted.slice(start, end);

  return (
    <div
      ref={scrollRef}
      className="overflow-auto rounded-lg border border-[#1E2632]"
      style={{ maxHeight }}
      onScroll={(e) => {
        if (!virtual) return;
        setScrollTop(e.currentTarget.scrollTop);
        setViewH(e.currentTarget.clientHeight);
      }}
    >
      <table className="w-full border-collapse text-sm" style={virtual ? { tableLayout: "fixed" } : undefined}>
        <thead>
          <tr>
            {columns.map((col) => {
              const active = sortKey === col.key;
              const canSort = col.sortable !== false && !!col.sortValue;
              return (
                <th
                  key={col.key}
                  onClick={() => onHeader(col)}
                  style={col.width ? { width: col.width } : undefined}
                  className={`sticky top-0 z-10 bg-[#0F1420] px-3 py-2 text-xs font-semibold uppercase tracking-wide ${alignCls(col.align)} ${
                    canSort ? "cursor-pointer select-none hover:text-[#C3CAD7]" : ""
                  } ${active ? "text-[#5BA8FF]" : "text-[#7C879B]"}`}
                  title={canSort ? "Click to sort" : undefined}
                >
                  {col.header}
                  {canSort && <span className="ml-0.5 inline-block w-2 text-[10px]">{active ? (dir === "asc" ? "▲" : "▼") : ""}</span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {topPad > 0 && <tr style={{ height: topPad }}><td colSpan={columns.length} /></tr>}
          {visible.map((row) => (
            <tr key={rowKey(row)} className="border-t border-[#161D29] hover:bg-[#141B27]" style={virtual ? { height: ROW_H } : undefined}>
              {columns.map((col) => (
                <td key={col.key} className={`overflow-hidden px-3 py-1.5 ${alignCls(col.align)} ${virtual ? "truncate" : "whitespace-nowrap"} ${col.className ?? ""}`}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
          {bottomPad > 0 && <tr style={{ height: bottomPad }}><td colSpan={columns.length} /></tr>}
        </tbody>
      </table>
    </div>
  );
}
