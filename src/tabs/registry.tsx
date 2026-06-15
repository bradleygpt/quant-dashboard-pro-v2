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
import C78QTab from "./C78QTab";
import MLPredTab from "./MLPredTab";
import AiBubbleWatchTab from "./AiBubbleWatchTab";
import LandingDemoTab from "./LandingDemoTab";
import ValueQualityTab from "./ValueQualityTab";

export interface TabDef {
  id: string;
  label: string;
  component: ComponentType;
}

const Placeholder = (title: string) => () =>
  ComingSoon({ title, reason: "This tab is a placeholder in the source Streamlit app (no implemented logic)." });

export const TABS: TabDef[] = [
  // Home = the cinematic TRI-STAR landing (planets route to real tabs; live system_status).
  { id: "home", label: "🏠 Home", component: LandingDemoTab },
  // The previous data-dashboard home is preserved here, reachable from the nav bar / landing.
  { id: "overview", label: "📊 Overview", component: HomeTab },
  { id: "regime", label: "📊 Market Regime", component: MarketRegimeTab },
  { id: "portfolio", label: "💼 Your Portfolio", component: PortfolioTab },
  { id: "quantport", label: "💎 Quant Portfolio", component: QuantPortfolioTab },
  { id: "valqual", label: "🎯 Project Axia (Value+Quality)", component: ValueQualityTab },
  { id: "detail", label: "🔍 Stock Detail", component: StockDetailTab },
  { id: "doppel", label: "✨ Doppelganger", component: DoppelgangerTab },
  { id: "screener", label: "📋 Quant Screener", component: ScreenerTab },
  { id: "mlpred", label: "Project Prolepsis (ML Predictions)", component: MLPredTab },
  { id: "bh", label: "🔥 Project Katalepsis (c78q)", component: C78QTab },
  { id: "sectors", label: "Sector Overview", component: SectorTab },
  { id: "crypto", label: "₿ Crypto", component: CryptoTab },
  { id: "aibubble", label: "🫧 AI Bubble Watch", component: AiBubbleWatchTab },
  { id: "etfs", label: "ETF Center", component: ETFTab },
  { id: "voices", label: "🎤 Pundit Views", component: PunditViewsTab },
  { id: "help", label: "📖 Help", component: HelpTab },
];