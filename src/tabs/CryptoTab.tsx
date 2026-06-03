import { useMemo, useState } from "react";
import { Card, Metric, Pill, Spinner, Unavailable } from "../components/ui";
import { fmtPct, fmtMoney } from "../lib/format";
import { useLiveData } from "../lib/live";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface Coin {
  price?: number; market_cap?: number; volume_24h?: number; circulating_supply?: number; max_supply?: number;
  ath?: number; ath_change_pct?: number; change_24h_pct?: number; change_7d_pct?: number; change_30d_pct?: number; change_1y_pct?: number;
}
interface Crypto {
  ok?: boolean; coins_ok?: boolean; coins?: { btc?: Coin; eth?: Coin };
  btc_history?: { dates: string[]; close: number[] }; eth_history?: { dates: string[]; close: number[] };
  onchain?: { ok?: boolean; block_height?: number; fees?: { fastest?: number; half_hour?: number }; hashrate_ehs?: number; difficulty?: number };
}

function clr(v?: number) { return (v ?? 0) >= 0 ? "#00C805" : "#FF5722"; }

function CoinCard({ name, c }: { name: string; c?: Coin }) {
  if (!c) return null;
  return (
    <Card title={name} sub={c.price != null ? fmtMoney(c.price, c.price > 100 ? 0 : 2) : undefined}>
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        {([["24h", c.change_24h_pct], ["7d", c.change_7d_pct], ["30d", c.change_30d_pct], ["1y", c.change_1y_pct]] as const).map(([l, v]) => (
          <div key={l}><div className="text-[10px] uppercase text-[#7C879B]">{l}</div><div className="font-semibold" style={{ color: clr(v) }}>{v == null ? "—" : fmtPct(v, 1, true)}</div></div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[#9CA7BB]">
        {c.market_cap != null && <div className="flex justify-between"><span>Market cap</span><span>${(c.market_cap / 1e9).toFixed(0)}B</span></div>}
        {c.volume_24h != null && <div className="flex justify-between"><span>24h vol</span><span>${(c.volume_24h / 1e9).toFixed(1)}B</span></div>}
        {c.ath != null && <div className="flex justify-between"><span>ATH</span><span>{fmtMoney(c.ath, 0)}</span></div>}
        {c.ath_change_pct != null && <div className="flex justify-between"><span>vs ATH</span><span style={{ color: clr(c.ath_change_pct) }}>{fmtPct(c.ath_change_pct, 0, true)}</span></div>}
        {c.circulating_supply != null && <div className="flex justify-between"><span>Supply</span><span>{(c.circulating_supply / 1e6).toFixed(1)}M</span></div>}
      </div>
    </Card>
  );
}

export default function CryptoTab() {
  const cr = useLiveData<Crypto>("/api/crypto");
  const [coin, setCoin] = useState<"btc" | "eth">("btc");
  const hist = coin === "btc" ? cr.data?.btc_history : cr.data?.eth_history;
  const chart = useMemo(() => hist ? hist.dates.map((d, i) => ({ date: d, close: hist.close[i] })) : [], [hist]);

  if (cr.status === "loading") return <Spinner label="Loading crypto data…" />;
  if (cr.status === "unavailable" || !cr.data?.ok)
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-white">Crypto</h2>
        <Unavailable what="Crypto data" detail="BTC/ETH prices and on-chain metrics are fetched by the /api/crypto serverless function (CoinGecko, Yahoo, mempool.space) on the deployed app. In a static-only preview this shows unavailable — by design." />
      </div>
    );

  const oc = cr.data.onchain;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">₿ Crypto</h2>
        <p className="text-xs text-[#7C879B]">Bitcoin & Ethereum prices, on-chain metrics. Live keyless feeds (CoinGecko, Yahoo, mempool.space).</p>
      </div>

      {cr.data.coins_ok ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <CoinCard name="Bitcoin (BTC)" c={cr.data.coins?.btc} />
          <CoinCard name="Ethereum (ETH)" c={cr.data.coins?.eth} />
        </div>
      ) : <Unavailable what="Price feed (CoinGecko)" />}

      {oc?.ok && (
        <Card title="Bitcoin On-Chain">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {oc.block_height != null && <Metric label="Block Height" value={oc.block_height.toLocaleString()} />}
            {oc.fees?.fastest != null && <Metric label="Fastest Fee" value={`${oc.fees.fastest} sat/vB`} />}
            {oc.fees?.half_hour != null && <Metric label="~30m Fee" value={`${oc.fees.half_hour} sat/vB`} />}
            {oc.hashrate_ehs != null && <Metric label="Hash Rate" value={`${oc.hashrate_ehs} EH/s`} />}
          </div>
        </Card>
      )}

      {chart.length > 0 && (
        <Card title="Price history (1y)">
          <div className="mb-2 flex gap-2">
            <Pill active={coin === "btc"} onClick={() => setCoin("btc")}>BTC</Pill>
            <Pill active={coin === "eth"} onClick={() => setCoin("eth")}>ETH</Pill>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chart} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#1A2130" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "#7C879B", fontSize: 11 }} minTickGap={48} />
              <YAxis domain={["auto", "auto"]} tick={{ fill: "#7C879B", fontSize: 11 }} width={60} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ background: "#0F1420", border: "1px solid #1E2632", borderRadius: 8 }} formatter={(v: number) => [`$${v.toLocaleString()}`, "Close"]} />
              <Line type="monotone" dataKey="close" stroke="#F7931A" dot={false} strokeWidth={1.6} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
}
