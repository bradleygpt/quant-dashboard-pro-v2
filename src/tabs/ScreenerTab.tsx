import { useMemo, useState } from "react";
import { useStore, type ViewRow } from "../store";
import { RatingBadge, GradePill, Spinner, Pill } from "../components/ui";
import { SortableTable, RATING_RANK, type Column } from "../components/SortableTable";
import ThematicExplorer from "../components/ThematicExplorer";
import { fmtMoney, fmtCapB, fmtPct } from "../lib/format";
import IndexBadges from "../components/IndexBadges";
import { applyScreen, flattenMetrics, type ScreenFilters } from "../lib/screener";
import { useFcfMap, fcfFlag } from "../lib/fcf";

const RATINGS = ["Strong Buy+", "Strong Buy", "Buy", "Hold", "Sell", "Strong Sell"];
const FV_VERDICTS = ["Deeply Undervalued", "Undervalued", "Fairly Valued", "Overvalued", "Significantly Overvalued"];
const FV_RANK: Record<string, number> = {
  "Deeply Undervalued": 5, Undervalued: 4, "Fairly Valued": 3, Overvalued: 2, "Significantly Overvalued": 1,
};
const SIGNAL_RANK: Record<string, number> = {
  "AT BUY POINT": 5, "Near Buy Point": 4, Approaching: 3, "Above Buy Point": 2, "Far from Buy Point": 1,
};

function toggle(arr: string[], v: string): string[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

export default function ScreenerTab() {
  const { rows, loadingUniverse, meta, floor, goToDetail } = useStore();
  const fcf = useFcfMap();
  const cfg = meta.screener;
  const sectors = meta.floor_meta[String(floor)]?.sectors ?? [];

  const [preset, setPreset] = useState("Custom");
  const [ratings, setRatings] = useState<string[]>([]);
  const [secs, setSecs] = useState<string[]>([]);
  const [fvVerdicts, setFvVerdicts] = useState<string[]>([]);
  const [underQbp, setUnderQbp] = useState(false);
  const [metricRanges, setMetricRanges] = useState<Record<string, [number, number]>>({});
  const [q, setQ] = useState("");

  const allMetrics = useMemo(() => (cfg ? flattenMetrics(cfg) : []), [cfg]);
  const hasMA = rows.some((r) => r.ma_score != null);

  const applyPreset = (name: string) => {
    setPreset(name);
    if (name === "Custom" || !cfg) {
      setRatings([]); setFvVerdicts([]); setMetricRanges({}); return;
    }
    const p = cfg.preset_screens[name];
    setRatings(p.rating_filter ?? []);
    setFvVerdicts(p.fair_value_filter ?? []);
    setMetricRanges(Object.fromEntries(Object.entries(p.metric_filters ?? {}).map(([k, v]) => [k, [v[0], v[1]]])));
    setSecs([]);
  };

  const filtered = useMemo(() => {
    if (!cfg) return rows.filter((r) => r.sector !== "ETF");
    const f: ScreenFilters = { ratings, sectors: secs, fvVerdicts, underQbp, metricRanges };
    let r = applyScreen(rows.filter((x) => x.sector !== "ETF"), f, cfg);
    if (q.trim()) {
      const s = q.trim().toUpperCase();
      r = r.filter((x) => x.ticker.includes(s) || (x.name ?? "").toUpperCase().includes(s));
    }
    return r;
  }, [rows, cfg, ratings, secs, fvVerdicts, underQbp, metricRanges, q]);

  const columns = useMemo<Column<ViewRow>[]>(() => {
    const grade = (p: string, label: string): Column<ViewRow> => ({
      key: p, header: label, align: "center",
      sortValue: (r) => r.pillars[p], render: (r) => <GradePill grade={r.grades[p]} />,
    });
    const cols: Column<ViewRow>[] = [
      { key: "ticker", header: "Ticker", sortValue: (r) => r.ticker,
        render: (r) => <><button onClick={() => goToDetail(r.ticker)} className="font-semibold text-[#5BA8FF] hover:underline">{r.ticker}</button><IndexBadges ticker={r.ticker} /></> },
      { key: "name", header: "Company", sortValue: (r) => r.name ?? "",
        render: (r) => <span className="block max-w-[200px] truncate text-[#C3CAD7]" title={r.name ?? ""}>{r.name}</span> },
      { key: "sector", header: "Sector", sortValue: (r) => r.sector ?? "", render: (r) => <span className="text-[#9CA7BB]">{r.sector}</span> },
      { key: "composite", header: "Score", align: "right", sortValue: (r) => r.composite, render: (r) => <span className="font-semibold">{r.composite.toFixed(2)}</span> },
      { key: "rating", header: "Rating", sortValue: (r) => RATING_RANK[r.rating] ?? 0, render: (r) => <RatingBadge rating={r.rating} /> },
      { key: "price", header: "Price", align: "right", sortValue: (r) => r.price, render: (r) => fmtMoney(r.price) },
      { key: "fv", header: "Fair Value", align: "right", sortValue: (r) => r.fv, render: (r) => fmtMoney(r.fv) },
      { key: "fvVerdict", header: "FV Verdict", sortValue: (r) => (r.fvVerdict ? FV_RANK[r.fvVerdict] ?? 0 : null), title: (r) => r.fvVerdict ?? undefined,
        render: (r) => <span className="text-[#9CA7BB]">{r.fvVerdict ?? "—"}</span> },
      { key: "fvPremium", header: "Prem/Disc", align: "right", sortValue: (r) => r.fvPremium,
        render: (r) => <span style={{ color: r.fvPremium == null ? "#7C879B" : r.fvPremium <= 0 ? "#00C805" : r.fvPremium > 25 ? "#FF5722" : "#FFC107" }}>{r.fvPremium == null ? "—" : fmtPct(r.fvPremium, 1, true)}</span> },
      { key: "qbp", header: "Buy Point", align: "right", sortValue: (r) => r.qbp, render: (r) => fmtMoney(r.qbp) },
      { key: "qbpDistance", header: "BP Dist", align: "right", sortValue: (r) => r.qbpDistance, render: (r) => r.qbpDistance == null ? "—" : fmtPct(r.qbpDistance, 1, true) },
      { key: "qbpSignal", header: "BP Signal", sortValue: (r) => (r.qbpSignal ? SIGNAL_RANK[r.qbpSignal] ?? 0 : null), title: (r) => r.qbpSignal ?? undefined, render: (r) => <span className="text-[#9CA7BB]">{r.qbpSignal ?? "—"}</span> },
      grade("Valuation", "Val"), grade("Growth", "Grw"), grade("Profitability", "Prof"),
      grade("Momentum", "Mom"), grade("EPS Revisions", "EPS"),
      { key: "marketCapB", header: "Mkt Cap", align: "right", sortValue: (r) => r.marketCapB, render: (r) => <span className="text-[#9CA7BB]">{fmtCapB(r.marketCapB)}</span> },
    ];
    if (hasMA) cols.push({ key: "ma", header: "M&A", align: "right", sortValue: (r) => r.ma_score ?? null, render: (r) => r.ma_score == null ? "—" : r.ma_score.toFixed(0) });
    // FCF quality (SBC distortion) — true FCF = OCF-capex-SBC, from the EDGAR engine
    cols.push(
      { key: "fcfFlag", header: "FCF", title: () => "FCF quality once stock comp is expensed", sortValue: (r) => fcfFlag(fcf?.get(r.ticker)).rank,
        render: (r) => { const f = fcfFlag(fcf?.get(r.ticker)); return <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: f.color, background: f.color + "1F" }}>{f.short}</span>; } },
      { key: "sbcOcf", header: "SBC/OCF", align: "right", title: () => "Stock comp as a share of operating cash flow", sortValue: (r) => fcf?.get(r.ticker)?.sbc_pct_ocf ?? null,
        render: (r) => { const v = fcf?.get(r.ticker)?.sbc_pct_ocf; return <span className="text-[#9CA7BB]">{v == null ? "—" : v < 0 ? "n/a" : fmtPct(v * 100, 0)}</span>; } },
      { key: "trueFcfYld", header: "True FCF yld", align: "right", title: () => "Free-cash-flow yield after expensing SBC", sortValue: (r) => fcf?.get(r.ticker)?.true_fcf_yield ?? null,
        render: (r) => { const v = fcf?.get(r.ticker)?.true_fcf_yield; return <span className="text-[#9CA7BB]">{v == null ? "—" : fmtPct(v * 100, 1, true)}</span>; } },
    );
    return cols;
  }, [goToDetail, hasMA, fcf]);

  if (loadingUniverse) return <Spinner label="Scoring universe…" />;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-bold text-white">Quant Screener</h2>
        <p className="text-xs text-[#7C879B]">Combine rating, fair value, QBP, and custom metric filters. All columns sortable. ETFs excluded.</p>
      </div>

      <ThematicExplorer />

      {/* quick screens */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase text-[#7C879B]">Quick screen</span>
        <Pill active={preset === "Custom"} onClick={() => applyPreset("Custom")}>Custom</Pill>
        {cfg && Object.keys(cfg.preset_screens).map((p) => (
          <Pill key={p} active={preset === p} onClick={() => applyPreset(p)}>{p}</Pill>
        ))}
      </div>
      {preset !== "Custom" && cfg && <div className="rounded-md border border-[#1E2632] bg-[#121723] px-3 py-2 text-xs text-[#9CA7BB]">{cfg.preset_screens[preset].description}</div>}

      {/* filters */}
      <div className="space-y-2 rounded-lg border border-[#1E2632] bg-[#0E131D] p-3">
        <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase text-[#7C879B]">Rating</div>
            <div className="flex flex-wrap gap-1">{RATINGS.map((x) => <Pill key={x} active={ratings.includes(x)} onClick={() => setRatings(toggle(ratings, x))}>{x}</Pill>)}</div>
          </div>
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase text-[#7C879B]">Fair Value Verdict</div>
            <div className="flex flex-wrap gap-1">{FV_VERDICTS.map((x) => <Pill key={x} active={fvVerdicts.includes(x)} onClick={() => setFvVerdicts(toggle(fvVerdicts, x))}>{x}</Pill>)}</div>
          </div>
          <label className="flex items-center gap-2 text-xs text-[#C3CAD7]">
            <input type="checkbox" checked={underQbp} onChange={(e) => setUnderQbp(e.target.checked)} /> Under QBP
          </label>
        </div>
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase text-[#7C879B]">Sector</div>
          <div className="flex flex-wrap gap-1">{sectors.map((x) => <Pill key={x} active={secs.includes(x)} onClick={() => setSecs(toggle(secs, x))}>{x}</Pill>)}</div>
        </div>

        {/* metric range filters */}
        <div>
          <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase text-[#7C879B]">
            Metric filters
            <select onChange={(e) => { const k = e.target.value; if (k) { const m = allMetrics.find((x) => x.m.key === k)!.m; setMetricRanges({ ...metricRanges, [k]: [m.default_min, m.default_max] }); } e.target.value = ""; }}
              className="rounded border border-[#1E2632] bg-[#121723] px-1.5 py-1 text-[11px] normal-case text-white">
              <option value="">+ add metric…</option>
              {allMetrics.filter(({ m }) => !(m.key in metricRanges)).map(({ cat, m }) => <option key={m.key} value={m.key}>{cat}: {m.name}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-3">
            {Object.entries(metricRanges).map(([key, [lo, hi]]) => {
              const m = allMetrics.find((x) => x.m.key === key)?.m;
              return (
                <div key={key} className="flex items-center gap-1 rounded-md border border-[#1E2632] bg-[#121723] px-2 py-1 text-xs">
                  <span className="text-[#C3CAD7]">{m?.name ?? key}{m?.type === "pct_range" ? " %" : ""}</span>
                  <input type="number" value={lo} step={m?.step} onChange={(e) => setMetricRanges({ ...metricRanges, [key]: [parseFloat(e.target.value), hi] })} className="w-16 rounded border border-[#1E2632] bg-[#0F1420] px-1 py-0.5 text-white" />
                  <span className="text-[#7C879B]">–</span>
                  <input type="number" value={hi} step={m?.step} onChange={(e) => setMetricRanges({ ...metricRanges, [key]: [lo, parseFloat(e.target.value)] })} className="w-16 rounded border border-[#1E2632] bg-[#0F1420] px-1 py-0.5 text-white" />
                  <button onClick={() => { const mr = { ...metricRanges }; delete mr[key]; setMetricRanges(mr); }} className="ml-1 text-[#7C879B] hover:text-red-400">✕</button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ticker or name" className="w-56 rounded-md border border-[#1E2632] bg-[#121723] px-2 py-1.5 text-sm text-white" />
          <span className="ml-auto text-sm text-[#7C879B]">{filtered.length.toLocaleString()} stocks</span>
        </div>
      </div>

      <SortableTable columns={columns} rows={filtered} rowKey={(r) => r.ticker} initialSortKey="composite" initialSortDir="desc" freezeFirst minWidth={2100} />
    </div>
  );
}
