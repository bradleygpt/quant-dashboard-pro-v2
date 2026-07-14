import { Suspense, useEffect, useState } from "react";
import type { Meta } from "./lib/types";
import { loadMeta } from "./lib/data";
import { StoreProvider, useStore } from "./store";
import { Spinner } from "./components/ui";
import Sidebar from "./components/Sidebar";
import { LINKS, TABS } from "./tabs/registry";

function Shell() {
  const { activeTab, setActiveTab } = useStore();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const active = TABS.find((t) => t.id === activeTab) ?? TABS[0];
  const Active = active.component;
  return (
    <div className="flex min-h-screen">
      {/* mobile drawer backdrop */}
      {drawerOpen && (
        <div className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={() => setDrawerOpen(false)} aria-hidden />
      )}
      <Sidebar mobileOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* mobile top bar: hamburger + brand (sidebar is hidden off-canvas below md) */}
        <div className="flex items-center gap-3 border-b border-line bg-page px-3 py-2 md:hidden">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="rounded-md p-1.5 text-ink-3 transition hover:bg-hover"
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M3 6h16M3 11h16M3 16h16" strokeLinecap="round" />
            </svg>
          </button>
          <span className="text-base font-bold text-white">Akribeia</span>
        </div>
        {/* tab bar: horizontal scroll strip on mobile, wraps on desktop */}
        <nav className="flex gap-1 overflow-x-auto border-b border-line bg-page px-3 py-2 md:flex-wrap [scrollbar-width:thin]">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setActiveTab(t.id);
                setDrawerOpen(false);
              }}
              className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition ${
                t.id === activeTab ? "bg-active font-semibold text-white" : "text-ink-3 hover:bg-hover"
              }`}
            >
              {t.label}
            </button>
          ))}
          {/* LINK-OUTS (registry LINKS): external surfaces, not dashboard tabs — they navigate away
              rather than mounting a component, so they render as anchors and never become `activeTab`. */}
          {LINKS.map((l) => (
            <a
              key={l.id}
              href={l.href}
              target="_blank"
              rel="noreferrer"
              title={l.title}
              className="shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-ink-3 transition hover:bg-hover"
            >
              {l.label} <span aria-hidden>↗</span>
            </a>
          ))}
        </nav>
        <main className="min-w-0 flex-1 overflow-x-hidden p-4 max-md:p-3">
          <Suspense fallback={<Spinner label="Loading tab…" />}>
            <Active />
          </Suspense>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    loadMeta().then(setMeta).catch((e) => setErr(String(e)));
  }, []);
  if (err) return <div className="p-8 text-red-400">Failed to load data: {err}</div>;
  if (!meta) return <Spinner label="Loading dashboard…" />;
  return (
    <StoreProvider meta={meta}>
      <Shell />
    </StoreProvider>
  );
}
