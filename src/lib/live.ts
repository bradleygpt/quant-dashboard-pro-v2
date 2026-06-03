import { useEffect, useState } from "react";

export type LiveState<T> = { status: "loading" | "ok" | "unavailable"; data: T | null };

// Fetch a live API/static endpoint with graceful degradation. A non-OK response,
// network error, timeout, or {ok:false} payload yields status "unavailable" — the
// caller renders a clean "temporarily unavailable" state, never crashes.
export function useLiveData<T extends { ok?: boolean }>(path: string, timeoutMs = 12000): LiveState<T> {
  const [state, setState] = useState<LiveState<T>>({ status: "loading", data: null });
  useEffect(() => {
    let live = true;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    setState({ status: "loading", data: null });
    fetch(path, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: T) => { if (live) setState(d && d.ok === false ? { status: "unavailable", data: d } : { status: "ok", data: d }); })
      .catch(() => { if (live) setState({ status: "unavailable", data: null }); })
      .finally(() => clearTimeout(timer));
    return () => { live = false; ctrl.abort(); clearTimeout(timer); };
  }, [path, timeoutMs]);
  return state;
}
