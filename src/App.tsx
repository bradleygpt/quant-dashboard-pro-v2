import { useEffect, useState } from "react";
import type { Meta } from "./lib/types";
import { loadMeta } from "./lib/data";
import { StoreProvider, useStore } from "./store";
import { Spinner } from "./components/ui";
import Sidebar from "./components/Sidebar";
import { TABS } from "./tabs/registry";

function Shell() {
  const { activeTab, setActiveTab } = useStore();
  const active = TABS.find((t) => t.id === activeTab) ?? TABS[0];
  const Active = active.component;
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <nav className="flex flex-wrap gap-1 border-b border-[#1E2632] bg-[#0B0E14] px-3 py-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`rounded-md px-3 py-1.5 text-sm transition ${
                t.id === activeTab ? "bg-[#1B2433] font-semibold text-white" : "text-[#9CA7BB] hover:bg-[#161D29]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <main className="min-w-0 flex-1 overflow-x-hidden p-4">
          <Active />
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
