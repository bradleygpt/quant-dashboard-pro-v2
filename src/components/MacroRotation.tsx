import { useEffect, useState } from "react";
import { Card } from "./ui";

// AI Sector Rotation — which sectors the macro setup favors / pressures, synthesized over the
// already-sourced risk radar + macro forecasts (macro_rotation.json). Numbers/risks-only-fed.
const BASE = `${import.meta.env.BASE_URL}data`;
let cache: { rotation?: string; generated_at?: string } | null = null;

export default function MacroRotation() {
  const [d, setD] = useState(cache);
  useEffect(() => {
    if (cache) return;
    fetch(`${BASE}/macro_rotation.json`).then((r) => (r.ok ? r.json() : null)).then((j) => { cache = j; setD(j); }).catch(() => {});
  }, []);
  if (!d?.rotation) return null;
  return (
    <Card title="AI Sector Rotation" sub="Which sectors the macro setup favors / pressures — synthesized over the risk radar + consensus forecasts.">
      <p className="text-sm leading-relaxed text-ink-2">{d.rotation}</p>
    </Card>
  );
}
