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
import MarketRegimeTab from "./MarketRegimeTab";
import CryptoTab from "./CryptoTab";
import PunditViewsTab from "./PunditViewsTab";
import DoppelgangerTab from "./DoppelgangerTab";

export interface TabDef {
  id: string;
  label: string;
  component: ComponentType;
}

const Placeholder = (title: string) => () =>
  ComingSoon({ title, reason: "This tab is a placeholder in the source Streamlit app (no implemented logic)." });

export const TABS: TabDef[] = [
  { id: "home", label: "🏠 Home", component: HomeTab },
  { id: "regime", label: "📊 Market Regime", component: MarketRegimeTab },
  { id: "portfolio", label: "💼 Your Portfolio", component: PortfolioTab },
  { id: "quantport", label: "💎 Quant Portfolio", component: QuantPortfolioTab },
  { id: "detail", label: "🔍 Stock Detail", component: StockDetailTab },
  { id: "doppel", label: "✨ Doppelganger", component: DoppelgangerTab },
  { id: "screener", label: "📋 Quant Screener", component: ScreenerTab },
  { id: "raqp", label: "🎯 RAQP", component: Placeholder("RAQP") },
  { id: "bh", label: "🔥 BH Watch", component: Placeholder("BH Watch") },
  { id: "sectors", label: "Sector Overview", component: SectorTab },
  { id: "crypto", label: "₿ Crypto", component: CryptoTab },
  { id: "etfs", label: "ETF Center", component: ETFTab },
  { id: "voices", label: "🎤 Pundit Views", component: PunditViewsTab },
  { id: "help", label: "📖 Help", component: HelpTab },
];
