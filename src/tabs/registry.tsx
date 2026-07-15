import { lazy, type ComponentType } from "react";
import ComingSoon from "./ComingSoon";
import LandingDemoTab from "./LandingDemoTab";

// Code-split every tab except the default landing (audit §4: all tabs were eagerly
// bundled into an ~888 KB main chunk; only the three.js Scene was lazy). The landing
// stays eager — it is the boot view and already lazy-loads its heavy Scene internally.
// Mechanical change only: same ids, same labels, same order. The render site (App.tsx)
// wraps the active tab in <Suspense>.
const HomeTab = lazy(() => import("./HomeTab"));
const ScreenerTab = lazy(() => import("./ScreenerTab"));
const StockDetailTab = lazy(() => import("./StockDetailTab"));
const SectorTab = lazy(() => import("./SectorTab"));
const ETFTab = lazy(() => import("./ETFTab"));
const PortfolioTab = lazy(() => import("./PortfolioTab"));
const QuantPortfolioTab = lazy(() => import("./QuantPortfolioTab"));
const HelpTab = lazy(() => import("./HelpTab"));
const MarketRegimeTab = lazy(() => import("./MarketRegimeTab"));
const MacroOutlookTab = lazy(() => import("./MacroOutlookTab"));
const CryptoTab = lazy(() => import("./CryptoTab"));
const PunditViewsTab = lazy(() => import("./PunditViewsTab"));
const DoppelgangerTab = lazy(() => import("./DoppelgangerTab"));
const MLPredTab = lazy(() => import("./MLPredTab"));
const AiBubbleWatchTab = lazy(() => import("./AiBubbleWatchTab"));
const StrategiesTab = lazy(() => import("./StrategiesTab"));
const ThesisEngineTab = lazy(() => import("./ThesisEngineTab"));

export interface TabDef {
  id: string;
  label: string;
  component: ComponentType;
}

/** SURFACE BOUNDARY (design rule, 2026-07-15): this deployed dashboard is the EXTERNAL product
 *  surface — nothing personal/internal may link from it. Personal tools (the /drafts review queue,
 *  /m, anything token-gated on the markets tunnel) live only on the authenticated tunnel pages and
 *  are reached from Bradley's own bookmark, never from here. A link on this nav publishes its URL
 *  to every dashboard visitor — that is how the tunnel address leaked once already (the since-
 *  reverted Drafts link-out). The Thesis Engine tab stays: it is a product feature for dashboard
 *  users. Before adding ANY nav entry, ask: is this for visitors, or for Bradley? If Bradley, it
 *  does not belong in this registry. */

const Placeholder = (title: string) => () =>
  ComingSoon({ title, reason: "This tab is a placeholder in the source Streamlit app (no implemented logic)." });

export const TABS: TabDef[] = [
  // Home = the cinematic TRI-STAR landing (planets route to real tabs; live system_status).
  { id: "home", label: "🏠 Home", component: LandingDemoTab },
  // The previous data-dashboard home is preserved here, reachable from the nav bar / landing.
  { id: "overview", label: "📊 Overview", component: HomeTab },
  { id: "regime", label: "📊 Market Regime", component: MarketRegimeTab },
  { id: "macro", label: "🌐 Macro Outlook", component: MacroOutlookTab },
  { id: "portfolio", label: "💼 Your Portfolio", component: PortfolioTab },
  { id: "quantport", label: "💎 Quant Portfolio", component: QuantPortfolioTab },
  { id: "detail", label: "🔍 Stock Detail", component: StockDetailTab },
  { id: "doppel", label: "✨ Doppelganger", component: DoppelgangerTab },
  { id: "screener", label: "📋 Quant Screener", component: ScreenerTab },
  { id: "mlpred", label: "Project Prolepsis (ML Predictions)", component: MLPredTab },
  { id: "strategies", label: "📈 Strategies", component: StrategiesTab },
  { id: "sectors", label: "Sector Overview", component: SectorTab },
  { id: "crypto", label: "₿ Crypto", component: CryptoTab },
  { id: "aibubble", label: "🫧 AI Bubble Watch", component: AiBubbleWatchTab },
  { id: "etfs", label: "ETF Center", component: ETFTab },
  { id: "voices", label: "🎤 Pundit Views", component: PunditViewsTab },
  { id: "thesis", label: "📝 Thesis Engine", component: ThesisEngineTab },
  { id: "help", label: "📖 Help", component: HelpTab },
];
