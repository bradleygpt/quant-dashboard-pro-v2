#!/usr/bin/env node
/**
 * Job B — AI Bubble Watch deal-proposal layer (STAGED, never auto-promoted).
 * =========================================================================
 *
 * WHAT IT DOES
 *   Produces candidate AI-deal records (same schema as ai_deals.json) and writes
 *   them to  public/data/ai_deals_proposed.json  — a STAGING file the rendered
 *   graph never reads. A human reviews each candidate's source_url + figure and
 *   manually promotes it into ai_deals.json. Job B proposes; it never writes what
 *   renders.
 *
 *   HARD GUARANTEE: this script only ever writes ai_deals_proposed.json. It never
 *   opens ai_deals.json for writing (it reads it only to compute the self-prune
 *   threshold so it can flag candidates too small to make the top-15).
 *
 * HOW TO RUN
 *   1. Gather newly-reported large AI deals (manually, or via a search API / LLM
 *      with web access — not wired here because it needs a key; see CANDIDATES).
 *   2. Add records to the CANDIDATES array below (each MUST have a real source_url
 *      and a date — records missing either are rejected, mirroring the graph's
 *      integrity rule).
 *   3. node scripts/propose-ai-deals.mjs
 *   4. Review public/data/ai_deals_proposed.json, then hand-move winners into
 *      ai_deals.json. If ai_deals.json exceeds ~15 deals, drop the smallest by
 *      value (self-pruning) so the graph stays legible.
 *
 *   To automate discovery later: run this from a scheduled action (cron / GitHub
 *   Action) that first calls a news/search API to fill CANDIDATES, then runs this
 *   writer. Keep promotion manual regardless.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, "..", "public", "data");
const RENDERED = join(DATA, "ai_deals.json");          // READ-ONLY here
const STAGING = join(DATA, "ai_deals_proposed.json");  // the ONLY file we write

const VALID_TYPES = new Set(["hardware_software", "investment", "services", "venture_capital"]);

// ── Candidate deals to stage. Fill from reporting; each needs source_url + date.
// (Empty by default — add records here, or have an upstream search step populate it.)
const CANDIDATES = [
  // Example shape (commented so a clean run stages nothing):
  // { id: "example-deal", from: "SoftBank", to: "OpenAI", type: "investment",
  //   value_usd_bn: 40, date: "2025-03",
  //   source_url: "https://www.reuters.com/...", note: "SoftBank-led round ..." },
];

function validate(d) {
  const errs = [];
  if (!d.id) errs.push("missing id");
  if (!d.from || !d.to) errs.push("missing from/to");
  if (!VALID_TYPES.has(d.type)) errs.push(`bad type '${d.type}'`);
  if (typeof d.value_usd_bn !== "number" || !(d.value_usd_bn > 0)) errs.push("bad value_usd_bn");
  if (!d.date) errs.push("missing date");                 // integrity rule
  if (!d.source_url || !/^https?:\/\//.test(d.source_url)) errs.push("missing/invalid source_url"); // integrity rule
  return errs;
}

function main() {
  let minRendered = 0, renderedCount = 0;
  try {
    const rendered = JSON.parse(readFileSync(RENDERED, "utf8"));
    const vals = (rendered.deals ?? []).map((d) => d.value_usd_bn).filter((v) => typeof v === "number");
    renderedCount = vals.length;
    minRendered = vals.length ? Math.min(...vals) : 0;
  } catch { /* rendered file optional for staging */ }

  const accepted = [];
  for (const d of CANDIDATES) {
    const errs = validate(d);
    if (errs.length) { console.error(`SKIP ${d.id ?? "(no id)"}: ${errs.join(", ")}`); continue; }
    accepted.push({
      ...d,
      _would_enter_top15: renderedCount < 15 || d.value_usd_bn > minRendered,
      _prune_threshold_usd_bn: minRendered,
    });
  }

  const out = {
    _doc: "STAGING ONLY — reviewed by a human, then manually promoted into ai_deals.json. The graph never reads this file.",
    generated_at: new Date().toISOString(),
    rendered_deal_count: renderedCount,
    prune_threshold_usd_bn: minRendered,
    proposed: accepted,
  };
  writeFileSync(STAGING, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${accepted.length} proposal(s) to ${STAGING}. (Rendered dataset untouched.)`);
  if (accepted.length === 0) console.log("No candidates staged — add records to CANDIDATES and re-run.");
}

main();
