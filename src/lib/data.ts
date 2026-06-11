// Data-loading layer for the baked static JSON. Universe + meta load eagerly;
// detail and prices lazy-load on demand and are cached in-module.

import type { Meta, UniverseFile, Floor, TickerDetail, PriceSeries } from "./types";

const BASE = `${import.meta.env.BASE_URL}data`;

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/${path}`);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}
async function getJSONOrNull<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}/${path}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// Windows reserved device names (CON, PRN, …) can't be filenames; the bake writes
// CON_.json etc. Mirror that mapping when building the per-ticker shard path.
const RESERVED_NAMES = new Set(
  ["CON", "PRN", "AUX", "NUL", ...Array.from({ length: 9 }, (_, i) => `COM${i + 1}`), ...Array.from({ length: 9 }, (_, i) => `LPT${i + 1}`)],
);
function shardName(ticker: string): string {
  const safe = RESERVED_NAMES.has(ticker.toUpperCase()) ? `${ticker}_` : ticker;
  return encodeURIComponent(safe);
}

let metaP: Promise<Meta> | null = null;
export function loadMeta(): Promise<Meta> {
  return (metaP ??= getJSON<Meta>("meta.json"));
}

const universeCache = new Map<Floor, Promise<UniverseFile>>();
export function loadUniverse(floor: Floor): Promise<UniverseFile> {
  if (!universeCache.has(floor)) universeCache.set(floor, getJSON<UniverseFile>(`universe_floor${floor}.json`));
  return universeCache.get(floor)!;
}

// per-ticker shards — Stock Detail fetches ~5KB instead of an 8MB monolith
const detailCache = new Map<string, Promise<TickerDetail | null>>();
export function loadTickerDetail(floor: Floor, ticker: string): Promise<TickerDetail | null> {
  const key = `${floor}/${ticker}`;
  if (!detailCache.has(key))
    detailCache.set(key, getJSONOrNull<TickerDetail>(`detail/floor${floor}/${shardName(ticker)}.json`));
  return detailCache.get(key)!;
}

const priceCache = new Map<string, Promise<PriceSeries | null>>();
export function loadTickerPrices(ticker: string): Promise<PriceSeries | null> {
  if (!priceCache.has(ticker))
    priceCache.set(ticker, getJSONOrNull<PriceSeries>(`prices/${shardName(ticker)}.json`));
  return priceCache.get(ticker)!;
}

// Point-in-time FV/QBP daily series (build_detail_timeseries_v2). Null when the
// shard is absent, so the chart falls back to flat FV/QBP lines.
export interface DetailTimeseries {
  ticker: string; sector: string; n: number;
  series: { date: string; close: number; fair_value: number | null; buy_point: number | null }[];
  fv_steps: { date: string; fair_value: number }[];
}
const tsCache = new Map<string, Promise<DetailTimeseries | null>>();
export function loadTickerTimeseries(ticker: string): Promise<DetailTimeseries | null> {
  if (!tsCache.has(ticker))
    tsCache.set(ticker, getJSONOrNull<DetailTimeseries>(`detail_timeseries/${shardName(ticker)}.json`));
  return tsCache.get(ticker)!;
}
