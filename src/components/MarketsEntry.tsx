// Stock Detail → Markets Engine entry block (engine-wiring handoff Phase 2-3, 2026-07-20).
//
// The engine measures SECTOR/MACRO ANCHORS, not single names — proxy honesty is
// mandatory UI here, not fine print. Templates are pre-filled with the ticker's
// mapped anchor ALIAS (ticker_anchor_map.json, generated from the verified engine
// manifest) and are phrased in the engine's detection-gate vocabulary (validated
// against relational_escalation.py: recovery gate = alias + drawdown/recovery intent;
// pair gate = 2 anchors + relation term; event gate = FOMC vocab + behavior shape).
// Never send a question the engine will decline: unmapped tickers render a disabled
// state and fire nothing.
//
// Click = navigate to the Thesis Engine tab with the query PRE-FILLED, never
// auto-submitted (one slot, 7-21 min jobs). Offline is the NORMAL state for a
// laptop-hosted engine — it renders quiet and intentional, templates visible but
// disabled.
import { useEffect, useState } from "react";
import { Card } from "./ui";
import { loadDataJSON } from "../lib/data";
import { MARKETS_CONFIGURED, probeHealth, type HealthVerdict } from "../lib/markets";
import { setPrefill } from "../lib/marketsPrefill";
import { useStore } from "../store";
import { INK, LINE, SEM, SURFACE } from "../theme";

interface AnchorEntry {
  anchor: string | null; alias: string | null; anchor_name: string | null; mapping_kind: string;
  // Short-history anchors (XLC from 2018-06): the SHORT-HISTORY label is an S5 obligation
  // that must render at this click-out, not only on the engine tab.
  short_history?: boolean; coverage_start?: string; short_history_note?: string;
}
type AnchorMap = Record<string, AnchorEntry>;

let mapCache: AnchorMap | null = null;
let mapInflight: Promise<AnchorMap | null> | null = null;
function useAnchorMap(): AnchorMap | null {
  const [m, setM] = useState<AnchorMap | null>(mapCache);
  useEffect(() => {
    if (mapCache) return;
    // load failure -> {} (block hides) rather than a permanent "loading" state
    if (!mapInflight) mapInflight = loadDataJSON<AnchorMap>("ticker_anchor_map.json").then((j) => { mapCache = j ?? {}; return mapCache; });
    mapInflight.then(setM);
  }, []);
  return m;
}

// Gate-validated templates (see header). Wording is deliberately alias-based —
// "SMH"/"XLK" are NOT in the gate vocabulary; "semiconductors"/"tech stocks" are.
// Grammar is plurality-neutral (aliases mix singular/plural).
// `since` is the anchor's real coverage start — "2004" for full-history anchors, the
// documented later start for short-history ones (XLC → 2018). Sending "since 2004" for XLC
// would pre-fill a false premise the engine would then have to correct.
const TEMPLATES: { label: string; make: (alias: string, since: string) => string }[] = [
  { label: "Drawdowns + recoveries", make: (a, since) => `How deep were ${a} drawdowns since ${since}, and how long did recoveries take?` },
  { label: "Regime correlation", make: (a) => `How does the correlation between ${a} and the stock market change across regimes?` },
  { label: "FOMC behavior", make: (a) => `How did ${a} perform around FOMC meetings?` },
  { label: "Post-selloff recovery", make: (a) => `After a big selloff, how quickly did ${a} recover?` },
];

// SHORT-HISTORY label — renders wherever XLC (or any short-history anchor) evidence
// appears. S5 obligation: unmissable, and it states the real coverage so the reader never
// reads the measured counts as full-history-robust.
function ShortHistoryNote({ entry, since }: { entry: AnchorEntry; since: string }) {
  return (
    <div
      className="rounded-md px-2.5 py-1.5 text-[11px] leading-snug"
      style={{ color: INK.ink2, background: SURFACE.raised, border: `1px solid ${SEM.warn ?? LINE.line}` }}
    >
      <span className="font-semibold" style={{ color: SEM.warn ?? INK.ink }}>⚠ Short history</span>{" "}
      {entry.short_history_note
        ?? `${entry.anchor_name} is measured only since ${since} — evidence spans ~1 market cycle, so treat drawdown and event counts as indicative, not robust.`}
    </div>
  );
}

export default function MarketsEntry({ ticker }: { ticker: string | null }) {
  const { setActiveTab } = useStore();
  const map = useAnchorMap();
  const [health, setHealth] = useState<HealthVerdict | null>(null);
  const [expanded, setExpanded] = useState(false);

  // health probe on expand (not on every Stock Detail load — the block is collapsed
  // by default and the probe is only needed once templates become clickable)
  useEffect(() => {
    if (!expanded) return;
    let live = true;
    probeHealth().then((h) => { if (live) setHealth(h); });
    return () => { live = false; };
  }, [expanded, ticker]);

  if (!MARKETS_CONFIGURED || !ticker) return null;
  const entry = map?.[ticker];
  if (map && !entry) return null; // ETFs / unknown tickers: no entry point at all

  const mapped = entry && entry.mapping_kind !== "none" && entry.alias;
  const offline = expanded && health != null && !health.up;
  const clickable = mapped && expanded && health?.up;
  const shortHist = !!(entry && entry.short_history);
  const sinceYear = (entry?.coverage_start || "2004").slice(0, 4);

  const go = (q: string) => {
    if (!clickable || !entry) return;
    setPrefill({
      query: q,
      proxyLabel: `via ${entry.anchor_name} — the engine measures sectors and macro anchors, not single names.`,
      ticker,
    });
    setActiveTab("thesis");
  };

  return (
    <Card
      title="Markets Engine"
      sub={mapped
        ? `via ${entry!.anchor_name} — the engine measures sectors and macro anchors, not single names.`
        : `Engine measures sector/macro anchors; no proxy for ${ticker} (${entry?.mapping_kind === "none" ? "sector unmapped" : "loading…"}).`}
    >
      {!mapped ? (
        <p className="text-sm" style={{ color: INK.mute }}>
          {map ? `No measured anchor covers this name's sector — asking would only produce the engine's honest refusal, so nothing fires from here.` : "Loading anchor map…"}
        </p>
      ) : !expanded ? (
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setExpanded(true)}
            className="self-start rounded-md px-3 py-1.5 text-sm font-medium"
            style={{ background: SURFACE.active, color: INK.ink, border: `1px solid ${LINE.line}` }}
          >
            Ask the engine about {entry!.alias} →
          </button>
          {shortHist && <ShortHistoryNote entry={entry!} since={sinceYear} />}
        </div>
      ) : (
        <>
          {shortHist && <ShortHistoryNote entry={entry!} since={sinceYear} />}
          <div className="mb-2 flex items-center gap-2 text-[11px]">
            <span
              className="rounded-full px-2 py-0.5 font-semibold"
              style={{ color: health == null ? INK.mute : health.up ? SEM.pos : INK.mute, background: SURFACE.raised, border: `1px solid ${LINE.line}` }}
            >
              {health == null ? "checking…" : health.up ? (health.yielding ? "live · yielding to quant GPU" : "engine live") : "engine offline"}
            </span>
            {offline && (
              <span style={{ color: INK.mute }}>
                Normal for a laptop-hosted engine — templates activate when it's back.
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {TEMPLATES.map((t) => {
              const q = t.make(entry!.alias!, sinceYear);
              return (
                <button
                  key={t.label}
                  onClick={() => go(q)}
                  disabled={!clickable}
                  title={q}
                  className="rounded-md border px-3 py-2 text-left text-xs disabled:opacity-45"
                  style={{ borderColor: LINE.line, color: INK.ink2, background: SURFACE.inset }}
                >
                  <span className="block font-semibold" style={{ color: INK.ink }}>{t.label}</span>
                  <span className="mt-0.5 block" style={{ color: INK.ink3 }}>{q}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px]" style={{ color: INK.dim }}>
            Opens the Thesis Engine tab with the question pre-filled — you confirm and submit there;
            nothing fires from this click. Typically ~7 minutes; up to ~20 with charts. After ~10pm the
            engine yields to the nightly quant run.
          </p>
        </>
      )}
    </Card>
  );
}
