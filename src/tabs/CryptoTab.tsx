import { useState } from "react";
import { Card, Pill, Spinner, Unavailable } from "../components/ui";
import { useLiveData } from "../lib/live";
import CryptoBitcoin from "./CryptoBitcoin";
import CryptoEthereum from "./CryptoEthereum";
import CryptoEthBtc from "./CryptoEthBtc";
import CryptoOnChain from "./CryptoOnChain";

const BASE = `${import.meta.env.BASE_URL}data`;

interface Coin {
  price?: number; market_cap?: number; volume_24h?: number; circulating_supply?: number; max_supply?: number;
  ath?: number; ath_change_pct?: number; change_24h_pct?: number; change_7d_pct?: number; change_30d_pct?: number; change_1y_pct?: number;
}
interface Crypto {
  ok?: boolean; coins_ok?: boolean; coins?: { btc?: Coin; eth?: Coin };
  btc_history?: { dates: string[]; close: number[] }; eth_history?: { dates: string[]; close: number[] };
  btc_daily_max?: { dates: string[]; close: number[] }; eth_daily_max?: { dates: string[]; close: number[] };
  onchain?: { ok?: boolean; block_height?: number; fees?: { fastest?: number; half_hour?: number }; hashrate_ehs?: number; difficulty?: number };
}
interface Commentator { name: string; firm?: string; stance?: string; key_quote?: string; quote_source?: string; quote_date?: string; key_views?: string[]; btc_view?: string; eth_view?: string; price_target_or_view?: string }
interface Pundits { ok?: boolean; crypto?: { commentators?: Commentator[]; synthesis?: string; themes?: string[] }; last_updated_human?: string }

function stanceColor(s = ""): string {
  const l = s.toLowerCase();
  if (l.includes("very bull") || l.includes("bullish")) return "#00C805";
  if (l.includes("cautiously bull")) return "#8BC34A";
  if (l.includes("neutral")) return "#FFC107";
  if (l.includes("caution")) return "#FF9800";
  if (l.includes("bear")) return "#FF5722";
  return "#9CA7BB";
}

function CryptoPundits() {
  const p = useLiveData<Pundits>(`${BASE}/pundits.json`);
  if (p.status === "loading") return <Spinner label="Loading crypto commentary…" />;
  const sec = p.data?.crypto;
  if (p.status === "unavailable" || !sec?.commentators?.length)
    return <Unavailable what="Crypto commentary" detail="Crypto-commentator views are AI-summarized daily with web grounding and baked into pundits.json by the refresh job." />;
  return (
    <div className="space-y-3">
      <p className="text-xs text-[#7C879B]">Crypto-commentator outlook — refreshed daily, AI-summarized with web grounding.{p.data?.last_updated_human ? ` As of ${p.data.last_updated_human}.` : ""}</p>
      {sec.synthesis && (
        <Card title="Synthesis">
          <p className="text-sm leading-relaxed text-[#C3CAD7]">{sec.synthesis}</p>
          {sec.themes && <div className="mt-2 flex flex-wrap gap-1">{sec.themes.map((t, i) => <span key={i} className="rounded-full bg-[#1A2130] px-2 py-0.5 text-[11px] text-[#9CA7BB]">{t}</span>)}</div>}
        </Card>
      )}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {sec.commentators.map((c, i) => (
          <Card key={i} title={c.name} sub={[c.firm, c.quote_date].filter(Boolean).join(" · ")}>
            {c.stance && <span className="inline-block rounded px-2 py-0.5 text-xs font-semibold" style={{ color: stanceColor(c.stance), background: `${stanceColor(c.stance)}22` }}>{c.stance}</span>}
            {c.key_quote && <p className="mt-2 border-l-2 border-[#2A3242] pl-2 text-sm italic text-[#C3CAD7]">“{c.key_quote}”{c.quote_source ? <span className="not-italic text-[#7C879B]"> — {c.quote_source}</span> : null}</p>}
            {c.btc_view && <div className="mt-2 text-xs text-[#9CA7BB]"><strong className="text-[#C3CAD7]">BTC:</strong> {c.btc_view}</div>}
            {c.eth_view && <div className="text-xs text-[#9CA7BB]"><strong className="text-[#C3CAD7]">ETH:</strong> {c.eth_view}</div>}
            {c.price_target_or_view && <div className="text-xs text-[#9CA7BB]"><strong className="text-[#C3CAD7]">Target/View:</strong> {c.price_target_or_view}</div>}
            {c.key_views?.length ? <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-[#9CA7BB]">{c.key_views.map((v, j) => <li key={j}>{v}</li>)}</ul> : null}
          </Card>
        ))}
      </div>
    </div>
  );
}

type Sub = "btc" | "eth" | "ratio" | "onchain" | "pundits";

export default function CryptoTab() {
  const cr = useLiveData<Crypto>("/api/crypto");
  const [sub, setSub] = useState<Sub>("btc");

  if (cr.status === "loading") return <Spinner label="Loading crypto data…" />;
  if (cr.status === "unavailable" || !cr.data?.ok)
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-white">Crypto</h2>
        <Unavailable what="Crypto data" detail="BTC/ETH prices, cycle history and on-chain metrics are fetched by the /api/crypto serverless function (CoinGecko, Yahoo, mempool.space) on the deployed app. In a static-only preview this shows unavailable — by design." />
      </div>
    );

  const d = cr.data;
  const tabs: [Sub, string][] = [["btc", "Bitcoin Cycle"], ["eth", "Ethereum"], ["ratio", "ETH/BTC Ratio"], ["onchain", "On-Chain"], ["pundits", "🎤 Crypto Pundits"]];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">₿ Crypto Analysis</h2>
        <p className="text-xs text-[#7C879B]">Bitcoin cycle position, Ethereum supply dynamics, on-chain metrics, and commentator outlook. Live keyless feeds (CoinGecko, Yahoo, mempool.space).</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {tabs.map(([key, label]) => <Pill key={key} active={sub === key} onClick={() => setSub(key)}>{label}</Pill>)}
      </div>

      {sub === "btc" && <CryptoBitcoin btcDaily={d.btc_daily_max} btc={d.coins?.btc} blockHeight={d.onchain?.block_height} />}
      {sub === "eth" && <CryptoEthereum eth={d.coins?.eth} ethDaily={d.eth_daily_max} />}
      {sub === "ratio" && <CryptoEthBtc ethDaily={d.eth_daily_max} btcDaily={d.btc_daily_max} />}
      {sub === "onchain" && <CryptoOnChain oc={d.onchain} />}
      {sub === "pundits" && <CryptoPundits />}
    </div>
  );
}
