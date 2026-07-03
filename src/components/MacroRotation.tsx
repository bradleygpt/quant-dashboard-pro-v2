import { useEffect, useState } from "react";
import { Card } from "./ui";
import { loadDataJSON } from "../lib/data";

// AI Sector Rotation — which sectors the macro setup favors / pressures, synthesized over the
// already-sourced risk radar + macro forecasts (macro_rotation.json). Numbers/risks-only-fed.
const BASE = `${import.meta.env.BASE_URL}data`;
let cache: { rotation?: string; generated_at?: string } | null = null;

export default function MacroRotation() {
  const [d, setD] = useState(cache);
  useEffect(() => {
    if (cache) return;
    loadDataJSON<any>("macro_rotation.json").then((j) => { cache = j; setD(j); });
  }, []);
  if (!d?.rotation) return null;
  return (
    <Card title="AI Sector Rotation" sub="Which sectors the macro setup favors / pressures — synthesized over the risk radar + consensus forecasts.">
      <p className="text-sm leading-relaxed text-ink-2">{d.rotation}</p>
    </Card>
  );
}
