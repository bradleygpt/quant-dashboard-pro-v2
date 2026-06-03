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
  const res = await fetch(`${BASE}/${path}`);
  if (!res.ok) return null;
  return res.json() as Promise<T>;
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
    detailCache.set(key, getJSONOrNull<TickerDetail>(`detail/floor${floor}/${encodeURIComponent(ticker)}.json`));
  return detailCache.get(key)!;
}

const priceCache = new Map<string, Promise<PriceSeries | null>>();
export function loadTickerPrices(ticker: string): Promise<PriceSeries | null> {
  if (!priceCache.has(ticker))
    priceCache.set(ticker, getJSONOrNull<PriceSeries>(`prices/${encodeURIComponent(ticker)}.json`));
  return priceCache.get(ticker)!;
}
