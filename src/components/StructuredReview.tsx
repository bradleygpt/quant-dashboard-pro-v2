// Renders an earnings-review / research note. The deep earnings reviews (from earnings_reviewer.py,
// the same generator Streamlit uses) come back as labelled sections — HEADLINE / KEY METRICS /
// GUIDANCE / THESIS CHECK / CALLOUTS / BOTTOM LINE — so we parse and format them like Streamlit
// (bold section headers, bulleted metrics) instead of flattening into one paragraph. Unstructured
// text (the 4-paragraph research note) falls back to clean paragraphs.
const SECTION_HEADERS = ["HEADLINE", "KEY METRICS", "GUIDANCE", "THESIS CHECK", "CALLOUTS", "BOTTOM LINE"];

function parseSections(text: string): { header: string; body: string }[] {
  const marks: { h: string; i: number; len: number }[] = [];
  for (const h of SECTION_HEADERS) {
    const m = text.match(new RegExp(`^[ \\t]*${h}\\b.*$`, "im"));
    if (m && m.index != null) marks.push({ h, i: m.index, len: m[0].length });
  }
  marks.sort((a, b) => a.i - b.i);
  if (!marks.length) return [];
  const out: { header: string; body: string }[] = [];
  const pre = text.slice(0, marks[0].i).replace(/VERDICT:\s*[A-Z ]+/i, "").trim();
  if (pre) out.push({ header: "", body: pre });
  for (let k = 0; k < marks.length; k++) {
    const start = marks[k].i + marks[k].len;
    const end = k + 1 < marks.length ? marks[k + 1].i : text.length;
    out.push({ header: marks[k].h, body: text.slice(start, end).trim() });
  }
  return out;
}

function Body({ text }: { text: string }) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const bulletish = lines.filter((l) => /^[-•*]\s/.test(l)).length;
  if (bulletish >= 2 && bulletish >= lines.length - 1) {
    return (
      <ul className="mt-0.5 space-y-1">
        {lines.map((l, i) => (
          <li key={i} className="flex gap-1.5 text-ink-2"><span className="mt-0.5 text-link">•</span><span>{l.replace(/^[-•*]\s*/, "")}</span></li>
        ))}
      </ul>
    );
  }
  return <p className="mt-0.5 leading-relaxed text-ink-2">{text}</p>;
}

export default function StructuredReview({ text }: { text: string }) {
  const clean = text.replace(/VERDICT:\s*[A-Z ]+\s*$/i, "").trim();
  const sections = parseSections(clean);
  if (!sections.length) {
    return (
      <div className="space-y-2 text-sm">
        {clean.split(/\n\n+/).map((p, i) => <p key={i} className="leading-relaxed text-ink-2">{p}</p>)}
      </div>
    );
  }
  return (
    <div className="space-y-2.5 text-sm">
      {sections.map((s, i) => (
        <div key={i}>
          {s.header && <div className="mb-0.5 text-[11px] font-bold uppercase tracking-wide text-[#9CB6E0]">{s.header}</div>}
          <Body text={s.body} />
        </div>
      ))}
    </div>
  );
}
