import { tooltipProps } from "../components/ChartFrame";
import { useMemo } from "react";
import { Card, Metric } from "../components/ui";
import { fmtMoney, fmtPct } from "../lib/format";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { ethSupplyMetrics, ETH_SUPPLY_REFERENCES } from "../lib/cycle";
import { ASSET, INK, PAPER, SEM, SURFACE, alpha } from "../theme";

type Series = { dates: string[]; close: number[] } | null | undefined;
interface Coin { price?: number; market_cap?: number; circulating_supply?: number; ath?: number; ath_change_pct?: number; change_24h_pct?: number; change_1y_pct?: number }

const k = (v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`);

function sma(series: { dates: string[]; close: number[] }, n: number): (number | null)[] {
  const out: (number | null)[] = []; let s = 0;
  for (let i = 0; i < series.close.length; i++) {
    s += series.close[i]; if (i >= n) s -= series.close[i - n];
    out.push(i >= n - 1 ? s / n : null);
  }
  return out;
}

const BULL = [
  "Deflationary supply — burn often exceeds issuance during high activity",
  "Staking yield — ~3–5% native yield from staking",
  "L2 ecosystem growth — Arbitrum, Base, Optimism extending Ethereum's reach",
  "Institutional adoption — ETH ETFs approved July 2024, growing flows",
  "Programmable money — DeFi, NFTs, tokenization all built on ETH",
  "First-mover advantage in smart contracts",
];
const BEAR = [
  "L2s extracting value — most activity moves to L2s, ETH itself less used",
  "Solana / alt-L1 competition — faster, cheaper alternatives gaining share",
  "Regulatory uncertainty — staking, DeFi face SEC scrutiny",
  "Less narrative simplicity than Bitcoin's \"digital gold\" story",
  "Underperformed BTC — ETH/BTC ratio has trended down for years",
  "Validator concentration — Lido controls large stake share",
];

export default function CryptoEthereum({ eth, ethDaily }: { eth?: Coin; ethDaily: Series }) {
  const today = new Date().toISOString().slice(0, 10);
  const supply = useMemo(() => ethSupplyMetrics(eth?.circulating_supply, today), [eth?.circulating_supply, today]);
  const chart = useMemo(() => {
    if (!ethDaily?.dates?.length) return [];
    const ma = sma(ethDaily, 200);
    return ethDaily.dates.map((d, i) => ({ t: Date.parse(d), close: ethDaily.close[i], ma: ma[i] }));
  }, [ethDaily]);
  const mergeTs = Date.parse(ETH_SUPPLY_REFERENCES.merge_date);

  return (
    <div className="space-y-4">
      {eth && (
        <Card title="Ethereum Analysis" sub="Current state">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Price" value={eth.price != null ? fmtMoney(eth.price, 0) : "—"} hint={eth.change_24h_pct != null ? `${fmtPct(eth.change_24h_pct, 2, true)} 24h` : undefined} />
            <Metric label="Market Cap" value={eth.market_cap != null ? `$${(eth.market_cap / 1e9).toFixed(1)}B` : "—"} />
            <Metric label="All-Time High" value={eth.ath != null ? fmtMoney(eth.ath, 0) : "—"} hint={eth.ath_change_pct != null ? `${fmtPct(eth.ath_change_pct, 1, true)} from ATH` : undefined} />
            <Metric label="1-year change" value={eth.change_1y_pct != null ? fmtPct(eth.change_1y_pct, 1, true) : "N/A"} />
          </div>
        </Card>
      )}

      <Card title="Supply Dynamics (Post-Merge)" sub="ETH moved to proof-of-stake in Sept 2022 (“The Merge”). With EIP-1559's burn, supply has been roughly flat to slightly deflationary.">
        {supply ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Current supply" value={`${(supply.current_supply / 1e6).toFixed(2)}M ETH`} hint={`vs ${(supply.merge_supply / 1e6).toFixed(2)}M at Merge`} />
              <Metric label="Change since Merge" value={`${supply.net_change_pct >= 0 ? "+" : ""}${supply.net_change_pct.toFixed(3)}%`} hint={`${supply.net_change_since_merge >= 0 ? "+" : ""}${(supply.net_change_since_merge / 1e3).toFixed(0)}k ETH`} />
              <Metric label="Annualized change" value={`${supply.annualized_change_pct >= 0 ? "+" : ""}${supply.annualized_change_pct.toFixed(3)}%/yr`} hint={supply.is_deflationary ? "Deflationary" : "Mildly inflationary"} />
              <Metric label="Approx. staked" value={`~${supply.staking_ratio_pct}%`} hint="of supply locked" />
            </div>
            <div className="mt-3 rounded-lg border px-3 py-2 text-xs" style={
              supply.is_deflationary ? { borderColor: alpha(SEM.pos, 0.35), background: alpha(SEM.pos, 0.08), color: SEM.posSoft }
                : supply.is_disinflationary ? { borderColor: alpha(SEM.link, 0.3), background: alpha(SEM.link, 0.08), color: SEM.link }
                  : { borderColor: alpha(SEM.warn, 0.3), background: alpha(SEM.warn, 0.08), color: PAPER }
            }>
              {supply.is_deflationary
                ? `📉 ETH supply has DECLINED by ${Math.abs(supply.net_change_pct).toFixed(3)}% since The Merge — the "ultrasound money" thesis: gas burns exceed issuance during high activity.`
                : supply.is_disinflationary
                  ? `📊 ETH supply is growing slowly (${supply.annualized_change_pct >= 0 ? "+" : ""}${supply.annualized_change_pct.toFixed(3)}%/yr), well below pre-Merge issuance (~4–5%/yr). Closer to flat than meaningfully inflationary.`
                  : `📈 ETH supply is growing at ${supply.annualized_change_pct >= 0 ? "+" : ""}${supply.annualized_change_pct.toFixed(3)}%/yr — faster than recent history. Could indicate lower activity (less burning) or staking changes.`}
            </div>
          </>
        ) : <div className="py-4 text-center text-sm text-mute">Supply metrics unavailable.</div>}
      </Card>

      <Card title="Price Chart with Key Milestones" sub="Log scale · The Merge (Sept 2022) · 200-day MA">
        {chart.length > 0 ? (
          <ResponsiveContainer width="100%" height={360}>
            <LineChart data={chart} margin={{ top: 16, right: 12, bottom: 0, left: 4 }}>
              <CartesianGrid stroke={SURFACE.raised} vertical={false} />
              <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time" tickFormatter={(t) => new Date(t).getFullYear().toString()} tick={{ fill: INK.mute, fontSize: 11 }} minTickGap={50} />
              <YAxis scale="log" domain={["auto", "auto"]} allowDataOverflow tick={{ fill: INK.mute, fontSize: 11 }} width={52} tickFormatter={k} />
              <Tooltip {...tooltipProps}
                labelFormatter={(t) => new Date(t).toLocaleDateString()} formatter={(v: number, n) => [`$${Math.round(v).toLocaleString()}`, n === "ma" ? "200d MA" : "ETH"]} />
              <ReferenceLine x={mergeTs} stroke={SEM.pos} strokeDasharray="4 3" opacity={0.7} label={{ value: "The Merge (PoS)", fill: SEM.pos, fontSize: 10, position: "top" }} />
              <Line type="monotone" dataKey="close" stroke={ASSET.eth} dot={false} strokeWidth={1.6} name="ETH" />
              <Line type="monotone" dataKey="ma" stroke={INK.mute} dot={false} strokeWidth={1.2} strokeDasharray="3 3" name="ma" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        ) : <div className="py-8 text-center text-sm text-mute">Price history loading / unavailable.</div>}
      </Card>

      <Card title="The Honest Bull and Bear Cases">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-1 text-sm font-semibold text-pos">🟢 Bull Case</div>
            <ul className="list-disc space-y-1 pl-4 text-xs text-ink-3">{BULL.map((b, i) => <li key={i}>{b}</li>)}</ul>
          </div>
          <div>
            <div className="mb-1 text-sm font-semibold text-neg">🔴 Bear Case</div>
            <ul className="list-disc space-y-1 pl-4 text-xs text-ink-3">{BEAR.map((b, i) => <li key={i}>{b}</li>)}</ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
