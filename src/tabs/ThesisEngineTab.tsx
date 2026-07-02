// Markets Thesis Engine — embedded via iframe (loose coupling: this tab holds ONLY a URL, imports no
// markets code). The streaming UI, persistence, and reconnect-by-job-id all live inside the iframe'd
// standalone window (markets-llm/api/static/thesis.html), served by the markets API.
//
// The markets API runs locally (default http://127.0.0.1:8765), so this tab is live when the dashboard is
// viewed FROM the machine running markets. Override the URL with VITE_MARKETS_URL at build time if needed.

const MARKETS_URL = (import.meta.env.VITE_MARKETS_URL as string | undefined) ?? "http://127.0.0.1:8765";

export default function ThesisEngineTab() {
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold text-white">📝 Markets Thesis Engine</div>
          <p className="mt-0.5 text-sm text-[#9CA7BB]">
            Ask a markets question and watch the staged reasoning settle into a grounded thesis, live.
          </p>
        </div>
        <a
          href={MARKETS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-md border border-[#1E2632] bg-[#1B2433] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#243047]"
        >
          ↗ Pop out
        </a>
      </div>
      <iframe
        src={MARKETS_URL}
        title="Markets Thesis Engine"
        className="min-h-[78vh] w-full flex-1 rounded-lg border border-[#1E2632] bg-[#0B0E14]"
      />
      <p className="text-xs text-[#7C879B]">
        Served by the local markets engine at <code className="text-[#9CA7BB]">{MARKETS_URL}</code>. If this
        panel is blank, start the engine (<code className="text-[#9CA7BB]">python api/server.py</code> in
        markets-llm) and reload — it only renders when reachable from this machine.
      </p>
    </div>
  );
}
