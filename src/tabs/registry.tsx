import type { ComponentType } from "react";
import ComingSoon from "./ComingSoon";
import HomeTab from "./HomeTab";
import ScreenerTab from "./ScreenerTab";
import StockDetailTab from "./StockDetailTab";
import SectorTab from "./SectorTab";
import ETFTab from "./ETFTab";
import PortfolioTab from "./PortfolioTab";
import QuantPortfolioTab from "./QuantPortfolioTab";
import HelpTab from "./HelpTab";

export interface TabDef {
  id: string;
  label: string;
  component: ComponentType;
}

const Live = (title: string) => () =>
  ComingSoon({
    title,
    reason:
      "This view depends on live network data (real-time quotes, FRED/VIX, crypto feeds, or LLM-generated commentary). " +
      "Per the migration plan, live-data tabs are stubbed in this pass; the deterministic, cached-data scoring tabs are fully ported.",
  });

const Placeholder = (title: string) => () =>
  ComingSoon({ title, reason: "This tab is a placeholder in the source Streamlit app (no implemented logic)." });

export const TABS: TabDef[] = [
  { id: "home", label: "🏠 Home", component: HomeTab },
  { id: "regime", label: "📊 Market Regime", component: Live("Market Regime") },
  { id: "portfolio", label: "💼 Your Portfolio", component: PortfolioTab },
  { id: "quantport", label: "💎 Quant Portfolio", component: QuantPortfolioTab },
  { id: "detail", label: "🔍 Stock Detail", component: StockDetailTab },
  { id: "doppel", label: "✨ Doppelganger", component: Live("Doppelganger") },
  { id: "screener", label: "📋 Quant Screener", component: ScreenerTab },
  { id: "raqp", label: "🎯 RAQP", component: Placeholder("RAQP") },
  { id: "bh", label: "🔥 BH Watch", component: Placeholder("BH Watch") },
  { id: "sectors", label: "Sector Overview", component: SectorTab },
  { id: "crypto", label: "₿ Crypto", component: Live("Crypto") },
  { id: "etfs", label: "ETF Center", component: ETFTab },
  { id: "voices", label: "🎤 Pundit Views", component: Live("Pundit Views & Predictions") },
  { id: "help", label: "📖 Help", component: HelpTab },
];
