// Data-loading layer for the baked static JSON. Universe + meta load eagerly;
// detail and prices lazy-load on demand and are cached in-module.

import type { Meta, UniverseFile, Floor, TickerDetail, PriceSeries } from "./types";

const BASE = `${import.meta.env.BASE_URL}data`;

// ── git-vs-blob resolver (data-in-git option B, ruling 2026-07-03) ───────────
// Bulk payloads live in object storage (Cloudflare R2); small/headline JSON
// stays in git. freshness_manifest.json (always git-served) is the ONLY
// pointer: its optional `blob` section carries {base_url, version,
// manifest_key, files{...}, dirs[...]}. No blob section → every read resolves
// to the git path exactly as before (safe no-op until first publish).
// Blob objects are content-addressed (f/{relpath}@{sha12}, immutable-cached),
// so a stale manifest can never read half-updated data. Top-level bulk files
// resolve straight from the git manifest; per-ticker shards (detail/, prices/,
// detail_timeseries/) resolve via the R2 version manifest, fetched lazily once
// per session (it's version-keyed, hence safely cacheable). Any blob failure
// falls back to the git path, which after the git-slim phase 404s into the
// caller's existing null/Unavailable handling — never a crash.
type BlobEntry = { key: string; sha256?: string; bytes?: number; as_of?: string };
type BlobSection = {
  version: string; manifest_key: string; base_url: string;
  files?: Record<string, BlobEntry>; dirs?: string[];
};

let blobSectionP: Promise<BlobSection | null> | null = null;
function loadBlobSection(): Promise<BlobSection | null> {
  return (blobSectionP ??= fetch(`${BASE}/freshness_manifest.json`, { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : null))
    .then((m) => (m?.blob?.base_url && m?.blob?.version ? (m.blob as BlobSection) : null))
    .catch(() => null));
}

let blobMapP: Promise<Record<string, BlobEntry> | null> | null = null;
function loadBlobMap(blob: BlobSection): Promise<Record<string, BlobEntry> | null> {
  return (blobMapP ??= fetch(`${blob.base_url}/${blob.manifest_key}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((m) => m?.files ?? null)
    .catch(() => null));
}

async function resolveBlobUrl(path: string): Promise<string | null> {
  const blob = await loadBlobSection();
  if (!blob) return null;
  // shard paths arrive with the filename segment already encodeURIComponent'd
  // (shardName below); manifest keys are raw filesystem relpaths.
  const rel = decodeURIComponent(path);
  const direct = blob.files?.[rel];
  if (direct) return `${blob.base_url}/${encodeURI(direct.key)}`;
  if (!(blob.dirs ?? []).some((d) => rel.startsWith(`${d}/`))) return null;
  const map = await loadBlobMap(blob);
  const e = map?.[rel];
  return e ? `${blob.base_url}/${encodeURI(e.key)}` : null;
}

/** Fetch a data file wherever it lives (blob first per the manifest, git
 *  fallback). ALL data reads — lib and components alike — go through this;
 *  never build a `data/...` URL in a component. */
export async function fetchData(path: string, init?: RequestInit): Promise<Response> {
  let blobUrl: string | null = null;
  try { blobUrl = await resolveBlobUrl(path); } catch { blobUrl = null; }
  if (blobUrl) {
    try {
      const res = await fetch(blobUrl, init);
      if (res.ok) return res;
    } catch { /* fall through to the git path */ }
  }
  return fetch(`${BASE}/${path}`, init);
}

/** JSON convenience over fetchData: resolves null on any failure. */
export async function loadDataJSON<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetchData(path, init);
    if (!res.ok) return null;
    return parseTolerant<T>(await res.text());
  } catch {
    return null;
  }
}

// Python json.dump (allow_nan default) can emit bare NaN/Infinity, which is INVALID
// JSON and makes the browser's JSON.parse reject the WHOLE file — e.g. one ticker
// (MCW) with a NaN name once blanked the entire universe ("0 stocks scored"). Parse
// tolerantly: replace any NaN/Infinity appearing as a JSON *value* (right after :,
// [ or ,) with null. The delimiter anchors avoid touching "NaN" inside a quoted string.
function parseTolerant<T>(text: string): T {
  return JSON.parse(text.replace(/([:[,]\s*)(NaN|-?Infinity)(?=\s*[,\]}])/g, "$1null")) as T;
}
async function getJSON<T>(path: string): Promise<T> {
  const res = await fetchData(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return parseTolerant<T>(await res.text());
}
async function getJSONOrNull<T>(path: string): Promise<T | null> {
  return loadDataJSON<T>(path);
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
