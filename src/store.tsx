import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import type { Floor, Meta, PresetName, Row } from "./lib/types";
import { loadMeta, loadUniverse } from "./lib/data";
import { resolveScores } from "./lib/scoring";

export type PresetSel = PresetName | "Custom";
export interface ViewRow extends Row {
  composite: number;
  rating: string;
}

interface Store {
  meta: Meta;
  floor: Floor;
  setFloor: (f: Floor) => void;
  preset: PresetSel;
  setPreset: (p: PresetSel) => void;
  customWeights: Record<string, number>;
  setCustomWeights: (w: Record<string, number>) => void;
  rows: ViewRow[];
  byTicker: Map<string, ViewRow>;
  loadingUniverse: boolean;
  selectedTicker: string | null;
  selectTicker: (t: string | null) => void;
  goToDetail: (t: string) => void;
  activeTab: string;
  setActiveTab: (t: string) => void;
  // persistence
  watchlist: string[];
  toggleWatch: (t: string) => void;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside provider");
  return s;
};

function usePersisted<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback((nv: T) => {
    setV(nv);
    try { localStorage.setItem(key, JSON.stringify(nv)); } catch { /* ignore */ }
  }, [key]);
  return [v, set];
}

export function StoreProvider({ meta, children }: { meta: Meta; children: React.ReactNode }) {
  const [floor, setFloor] = useState<Floor>(meta.default_floor);
  const [preset, setPreset] = useState<PresetSel>(meta.default_preset);
  const [customWeights, setCustomWeights] = usePersisted<Record<string, number>>(
    "qd_custom_weights",
    meta.presets[meta.default_preset].weights,
  );
  const [rawRows, setRawRows] = useState<Row[]>([]);
  const [loadingUniverse, setLoading] = useState(true);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("home");
  const [watchlist, setWatchlist] = usePersisted<string[]>("qd_watchlist", []);

  useEffect(() => {
    let live = true;
    setLoading(true);
    loadUniverse(floor).then((u) => {
      if (live) { setRawRows(u.rows); setLoading(false); }
    });
    return () => { live = false; };
  }, [floor]);

  const { rows, byTicker } = useMemo(() => {
    const presetWeights = preset !== "Custom" ? meta.presets[preset]?.weights : undefined;
    const scored = resolveScores(rawRows, preset, customWeights, presetWeights);
    const vr: ViewRow[] = rawRows.map((r) => {
      const s = scored.get(r.ticker)!;
      // A missing company name (e.g. MCW once baked as null) must not reach consumers
      // that call name.toLowerCase()/sort — coerce to the ticker so nothing crashes.
      return { ...r, name: r.name ?? r.ticker, composite: s?.composite ?? 0, rating: s?.rating ?? "Hold" };
    });
    vr.sort((a, b) => b.composite - a.composite);
    const map = new Map<string, ViewRow>();
    for (const r of vr) map.set(r.ticker, r);
    return { rows: vr, byTicker: map };
  }, [rawRows, preset, customWeights, meta.presets]);

  const selectTicker = useCallback((t: string | null) => setSelectedTicker(t), []);
  const goToDetail = useCallback((t: string) => { setSelectedTicker(t); setActiveTab("detail"); }, []);
  const toggleWatch = useCallback((t: string) => {
    setWatchlist(watchlist.includes(t) ? watchlist.filter((x) => x !== t) : [...watchlist, t]);
  }, [watchlist, setWatchlist]);

  const store: Store = {
    meta, floor, setFloor, preset, setPreset, customWeights, setCustomWeights,
    rows, byTicker, loadingUniverse, selectedTicker, selectTicker, goToDetail,
    activeTab, setActiveTab, watchlist, toggleWatch,
  };
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
