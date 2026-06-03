import { useStore, type PresetSel } from "../store";
import type { Floor, PresetName } from "../lib/types";
import { fmtPct } from "../lib/format";

const FLOOR_LABELS: Record<number, string> = { 0: "No floor", 1: "$1B+", 10: "$10B+" };

export default function Sidebar() {
  const { meta, floor, setFloor, preset, setPreset, rows } = useStore();
  const presetNames = Object.keys(meta.presets) as PresetName[];
  const info = preset !== "Custom" ? meta.presets[preset] : null;
  const stockCount = rows.filter((r) => r.sector !== "ETF").length;

  return (
    <aside className="w-64 shrink-0 border-r border-[#1E2632] bg-[#0E131D] p-4">
      <div className="mb-4">
        <div className="text-lg font-bold text-white">Quant Dashboard <span className="text-[#3B82F6]">Pro</span></div>
        <div className="text-xs text-[#7C879B]">React migration candidate</div>
      </div>

      <div className="mb-4">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#7C879B]">Weight Preset</div>
        <div className="flex flex-col gap-1">
          {presetNames.map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p as PresetSel)}
              className={`rounded-md px-2.5 py-1.5 text-left text-xs transition ${
                preset === p ? "bg-[#1B2433] font-semibold text-white" : "text-[#9CA7BB] hover:bg-[#161D29]"
              }`}
            >
              {meta.presets[p].label}
            </button>
          ))}
          <button
            onClick={() => setPreset("Custom")}
            className={`rounded-md px-2.5 py-1.5 text-left text-xs transition ${
              preset === "Custom" ? "bg-[#1B2433] font-semibold text-white" : "text-[#9CA7BB] hover:bg-[#161D29]"
            }`}
          >
            Custom weights (experimental)
          </button>
        </div>
      </div>

      {info && (
        <div className="mb-4 rounded-md border border-[#1E2632] bg-[#121723] p-2.5 text-xs">
          <div className="flex justify-between"><span className="text-[#7C879B]">Backtest CAGR</span><span className="font-semibold text-[#00C805]">{fmtPct(info.backtest_cagr)}</span></div>
          <div className="flex justify-between"><span className="text-[#7C879B]">Sharpe</span><span>{info.backtest_sharpe.toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-[#7C879B]">Max DD</span><span className="text-[#FF5722]">{fmtPct(info.backtest_max_dd)}</span></div>
          <div className="mt-1 text-[10px] leading-tight text-[#5C6678]">{info.backtest_universe}</div>
        </div>
      )}

      <div className="mb-4">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#7C879B]">Market-Cap Floor</div>
        <div className="flex gap-1">
          {meta.floors.map((f) => (
            <button
              key={f}
              onClick={() => setFloor(f as Floor)}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs transition ${
                floor === f ? "bg-[#3B82F6] font-semibold text-white" : "bg-[#1A2130] text-[#9CA7BB] hover:bg-[#222B3C]"
              }`}
            >
              {FLOOR_LABELS[f] ?? `$${f}B+`}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 text-xs text-[#7C879B]">
        <div>{stockCount.toLocaleString()} stocks scored</div>
        <div>Sector-relative ranking</div>
      </div>

      <div className="mt-auto border-t border-[#1E2632] pt-3 text-[10px] leading-relaxed text-[#5C6678]">
        <div>Data baked {meta.generated_at}</div>
        <div>Source commit {meta.source_commit}</div>
        <div className="mt-1 text-[#4B5563]">Static snapshot · not investment advice</div>
      </div>
    </aside>
  );
}
