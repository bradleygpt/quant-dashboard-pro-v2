// Rebalance schedule — computed by ops/rebalance_schedule.py (quant-historical) and
// emitted as rebalance_schedule.json. THE single authority.
//
// Before this, four scheduling models shared the field name `next_rebalance` with nothing
// in the data saying which produced a value, and dates were stored rather than computed.
// A wrong value was therefore unreadable as wrong: Aristeia rendered 2026-07-15 on a
// LIVE-MONEY book (8 days past) while the correct c78q date displayed as null.
//
// Two dimensions always travel with a date:
//   model            -- what rule produced it (so it can be read as correct-or-not)
//   rebalanceBookType-- whether THAT rebalance trades real money (a sleeve can rebalance
//                       on schedule while the rebalance is deliberately non-trading)
import { useEffect, useState } from "react";

import { loadDataJSON } from "./data";

export interface SleeveSchedule {
  sleeve: string;
  model: string;
  model_label: string;
  hold_days: number | null;
  anchor: string | null;
  next_rebalance: string;
  effective_trading_day: string;
  book_type: "paper" | "live";
  rebalance_book_type: "paper" | "live";
  go_live: string | null;
  go_live_pending: boolean;
  never_goes_live: boolean;
  gates_execution: boolean;
  rationale: string;
}

export type ScheduleMap = Record<string, SleeveSchedule>;

export function useRebalanceSchedule(): ScheduleMap {
  const [map, setMap] = useState<ScheduleMap>({});
  useEffect(() => {
    loadDataJSON<any>("rebalance_schedule.json")
      .then((j) => setMap(j?.sleeves ?? {}))
      .catch(() => setMap({}));
  }, []);
  return map;
}

/** Past due = the effective trading day has passed. This is the condition that sat
 *  unnoticed for 22 days on the paper track, because nothing displayed it. */
export function isPastDue(s: SleeveSchedule | undefined, today = new Date()): boolean {
  if (!s) return false;
  const t = today.toISOString().slice(0, 10);
  return s.effective_trading_day < t;
}

/** One-line label carrying both dimensions. Never render a bare date. */
export function scheduleLabel(s: SleeveSchedule | undefined): string {
  if (!s) return "";
  const who = s.rebalance_book_type === "live" ? "live" : "paper";
  const tail = s.go_live_pending && s.go_live ? ` · go live ${s.go_live}` : "";
  return `${s.model_label} · ${who}${tail}`;
}
