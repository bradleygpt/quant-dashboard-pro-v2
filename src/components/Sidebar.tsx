import { useStore, type PresetSel } from "../store";
import type { Floor, PresetName } from "../lib/types";
import { fmtPct } from "../lib/format";
import AsOf from "./AsOf";

const FLOOR_LABELS: Record<number, string> = { 0: "No floor", 1: "$1B+", 10: "$10B+" };

export default function Sidebar({ mobileOpen = false, onClose }: { mobileOpen?: boolean; onClose?: () => void }) {
  const { meta, floor, setFloor, preset, setPreset, rows } = useStore();
  const presetNames = Object.keys(meta.presets) as PresetName[];
  const info = preset !== "Custom" ? meta.presets[preset] : null;
  const stockCount = rows.filter((r) => r.sector !== "ETF").length;

  return (
    <aside
      style={{ left: mobileOpen ? 0 : "-16rem" }}
      className="fixed inset-y-0 z-40 flex w-64 shrink-0 flex-col overflow-y-auto border-r border-line bg-head p-4 md:static md:z-auto md:!left-auto"
    >
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="text-lg font-bold text-white">Akribeia</div>
          <div className="text-xs text-mute">React migration candidate</div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close menu"
          className="-mr-1 rounded-md p-1 text-mute transition hover:bg-hover md:hidden"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="mb-4">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-mute">Weight Preset</div>
        <div className="flex flex-col gap-1">
          {presetNames.map((p) => (
            <button
              key={p}
              onClick={() => { setPreset(p as PresetSel); onClose?.(); }}
              className={`rounded-md px-2.5 py-1.5 text-left text-xs transition ${
                preset === p ? "bg-active font-semibold text-white" : "text-ink-3 hover:bg-hover"
              }`}
            >
              {meta.presets[p].label}
            </button>
          ))}
          <button
            onClick={() => { setPreset("Custom"); onClose?.(); }}
            className={`rounded-md px-2.5 py-1.5 text-left text-xs transition ${
              preset === "Custom" ? "bg-active font-semibold text-white" : "text-ink-3 hover:bg-hover"
            }`}
          >
            Custom weights (experimental)
          </button>
        </div>
      </div>

      {info && (
        <div className={`mb-4 rounded-md border p-2.5 text-xs ${info.is_research_prior ? "border-warn/25 bg-warn/5" : "border-line bg-panel"}`}>
          {info.is_research_prior && (
            <div className="mb-1.5 inline-block rounded-sm bg-paper/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.15em] text-paper">⚗ Research prior · not validated</div>
          )}
          <div className="flex justify-between"><span className="text-mute">{info.is_research_prior ? "OOS CAGR (2011-26)" : "Backtest CAGR"}</span><span className="font-semibold text-pos">{fmtPct(info.backtest_cagr)}</span></div>
          {info.is_research_prior && info.in_sample_cagr != null && (
            <div className="flex justify-between"><span className="text-mute">in-sample (overfit)</span><span className="text-ink-3">{fmtPct(info.in_sample_cagr)}</span></div>
          )}
          <div className="flex justify-between"><span className="text-mute">Sharpe</span><span>{info.backtest_sharpe.toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-mute">Max DD</span><span className="text-neg">{fmtPct(info.backtest_max_dd)}</span></div>
          <div className={`mt-1 text-[10px] leading-tight ${info.is_research_prior ? "text-paper" : "text-dim"}`}>{info.caveat ?? info.backtest_universe}</div>
        </div>
      )}

      <div className="mb-4">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-mute">Market-Cap Floor</div>
        <div className="flex gap-1">
          {meta.floors.map((f) => (
            <button
              key={f}
              onClick={() => { setFloor(f as Floor); onClose?.(); }}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs transition ${
                floor === f ? "bg-link font-semibold text-white" : "bg-raised text-ink-3 hover:bg-active"
              }`}
            >
              {FLOOR_LABELS[f] ?? `$${f}B+`}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 text-xs text-mute">
        <div>{stockCount.toLocaleString()} stocks scored</div>
        <div>Sector-relative ranking</div>
      </div>

      <div className="mt-auto border-t border-line pt-3 text-[10px] leading-relaxed text-dim">
        <div className="mb-1"><AsOf date={meta.generated_at} /></div>
        <div>Data baked {meta.generated_at}</div>
        <div>Source commit {meta.source_commit}</div>
        <div className="mt-1 text-dim">Static snapshot · not investment advice</div>
      </div>
    </aside>
  );
}
