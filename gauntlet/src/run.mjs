#!/usr/bin/env node
// run.mjs — the Redacta Gauntlet driver.
//
//   node src/run.mjs                 offline engine, print scorecard
//   node src/run.mjs --write         also write results/latest.json (SHA-stamped)
//   node src/run.mjs --baseline      write results/baseline.json (accept new baseline)
//   node src/run.mjs --gate          diff against baseline; exit 1 on regression
//   node src/run.mjs --online        use the live Redacta MCP (needs REDACTA_MCP_URL)
//
// One command, deterministic suite needs no API key: `npm run eval`.

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { offlineEngine, onlineEngine } from "./engine.mjs";
import { reasoningEngine, detectProvider, keyEnvFor, DEFAULT_MODELS } from "./reasoning.mjs";
import { runDownstreamEval, formatDownstream } from "./downstream.mjs";
import { scoreGold } from "./score.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const useOnline = args.has("--online");
const useReasoning = args.has("--reasoning");
const useDownstream = args.has("--downstream");
const reasoningProvider = detectProvider();
const reasoningModel = process.env.REDACTA_REASONING_MODEL || DEFAULT_MODELS[reasoningProvider];

function codeSha() {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: root, stdio: ["ignore", "pipe", "ignore"] })
      .toString().trim();
  } catch {
    return "nogit";
  }
}

// LLM-backed modes (reasoning, downstream) need a provider key.
if (useReasoning || useDownstream) {
  const keyEnv = keyEnvFor(reasoningProvider);
  if (!process.env[keyEnv]) {
    console.error(
      `\n✗ This mode (provider: ${reasoningProvider}) needs an API key.\n` +
      `    export ${keyEnv}=...\n` +
      `    model: ${reasoningModel}  ·  override with REDACTA_REASONING_MODEL\n` +
      "    switch provider with REDACTA_REASONING_PROVIDER=anthropic|perplexity\n" +
      "  The deterministic suite — npm run eval / npm run gate — needs no key.\n"
    );
    process.exit(2);
  }
}

// ── Downstream-injection eval — separate scorecard, own gate ────────────────
if (useDownstream) {
  const dsGold = JSON.parse(fs.readFileSync(path.join(root, "gold-downstream.json"), "utf8"));
  const scored = await runDownstreamEval(dsGold, { provider: reasoningProvider, model: reasoningModel });
  const scorecard = {
    harness: "redacta-gauntlet-downstream",
    goldVersion: dsGold.meta.version,
    codeSha: codeSha(),
    timestamp: new Date().toISOString(),
    ...scored,
  };
  console.log(formatDownstream(scorecard));

  const resultsDir = path.join(root, "results");
  fs.mkdirSync(resultsDir, { recursive: true });
  const pfx = `downstream-${reasoningProvider}-`;
  if (args.has("--baseline")) {
    fs.writeFileSync(path.join(resultsDir, `${pfx}baseline.json`), JSON.stringify(scorecard, null, 2));
    console.log(`→ wrote results/${pfx}baseline.json (new accepted baseline)\n`);
  }
  if (args.has("--write")) {
    fs.writeFileSync(path.join(resultsDir, `${pfx}latest.json`), JSON.stringify(scorecard, null, 2));
    console.log(`→ wrote results/${pfx}latest.json\n`);
  }
  if (args.has("--gate")) {
    const basePath = path.join(resultsDir, `${pfx}baseline.json`);
    if (!fs.existsSync(basePath)) { console.error("✗ no downstream baseline. Run --baseline first."); process.exit(2); }
    const base = JSON.parse(fs.readFileSync(basePath, "utf8")).headline;
    const H = scorecard.headline;
    const regressions = [];
    // Any new identifier leak is the cardinal regression.
    if (H.identifierLeakage > base.identifierLeakage)
      regressions.push(`identifierLeakage: ${base.identifierLeakage} → ${H.identifierLeakage} (rose)`);
    if (H.controlClean === false) regressions.push("control case is no longer clean");
    if (regressions.length) {
      console.error("✗ DOWNSTREAM GATE FAILED:");
      for (const r of regressions) console.error("    " + r);
      console.error("");
      process.exit(1);
    }
    console.log("✓ downstream gate passed — no new identifier leakage\n");
  }
  process.exit(0);
}

const gold = JSON.parse(fs.readFileSync(path.join(root, "gold.json"), "utf8"));

function engineVersion() {
  try {
    return JSON.parse(fs.readFileSync(
      path.join(root, "node_modules/@pharmatools/redacta/package.json"), "utf8")).version;
  } catch {
    return "unknown";
  }
}

const engineFn = useReasoning
  ? (t) => reasoningEngine(t, { model: reasoningModel })
  : useOnline
    ? (t) => onlineEngine(t)
    : (t) => Promise.resolve(offlineEngine(t));

const engineLabel = useReasoning
  ? `reasoning:${reasoningProvider}/${reasoningModel} + @pharmatools/redacta@${engineVersion()}`
  : useOnline ? "live-mcp" : `@pharmatools/redacta@${engineVersion()}`;

const scored = await scoreGold(gold, engineFn);

const scorecard = {
  harness: "redacta-gauntlet",
  goldVersion: gold.meta.version,
  engine: engineLabel,
  codeSha: codeSha(),
  timestamp: new Date().toISOString(),
  caseCount: gold.cases.length,
  ...scored,
};

// ── Print ─────────────────────────────────────────────────────────────────
const H = scorecard.headline;
const bar = "─".repeat(58);
console.log(`\nRedacta Gauntlet — gold ${scorecard.goldVersion} · ${scorecard.caseCount} cases · ${scorecard.engine}`);
console.log(`code ${scorecard.codeSha}\n${bar}`);
const line = (label, val, unit = "%") =>
  console.log(`  ${label.padEnd(34)} ${val === null ? "n/a" : val + unit}`);
line("Adversarial recall (lenient)", H.adversarialRecallLenient);
line("Adversarial recall (strict)", H.adversarialRecallStrict);
line("In-scope recall (deterministic)", H.inScopeRecall);
line("Over-redaction rate  (lower=better)", H.overRedactionRate);
line("Precision (all removals)", H.precision);
line("Injection resistance", H.injectionResistance);
if (scorecard.counts.spuriousFalsePositives > 0) {
  console.log(bar);
  console.log(`  Spurious redactions (grabbed non-identifiers): ${scorecard.counts.spuriousFalsePositives}`);
  for (const s of scorecard.spurious) {
    console.log(`    ${s.id.padEnd(12)} "${s.value}" → [${s.cat}]`);
  }
}
console.log(bar);
console.log("  Per category (lenient recall):");
for (const [k, v] of Object.entries(scorecard.perCategory)) {
  console.log(`    ${k.padEnd(12)} ${String(v.recallLenient).padStart(5)}%  (n=${v.n})`);
}
console.log(bar);
console.log("  Per scope (lenient recall):");
for (const [k, v] of Object.entries(scorecard.perScope)) {
  console.log(`    ${k.padEnd(14)} ${String(v.recallLenient).padStart(5)}%  (n=${v.n})`);
}
console.log(bar + "\n");

// ── Persist ─────────────────────────────────────────────────────────────────
// The reasoning run is a different engine, so it keeps its own scorecard files
// and its own baseline — it must never overwrite or gate against the
// deterministic ones.
const resultsDir = path.join(root, "results");
fs.mkdirSync(resultsDir, { recursive: true });
// Reasoning scorecards are namespaced by provider so a Perplexity comparison
// run keeps its own baseline/latest and never collides with Claude's.
const prefix = useReasoning ? `reasoning-${reasoningProvider}-` : "";
const baselineFile = path.join(resultsDir, `${prefix}baseline.json`);
const latestFile = path.join(resultsDir, `${prefix}latest.json`);

if (args.has("--baseline")) {
  fs.writeFileSync(baselineFile, JSON.stringify(scorecard, null, 2));
  console.log(`→ wrote ${path.relative(root, baselineFile)} (new accepted baseline)\n`);
}
if (args.has("--write")) {
  fs.writeFileSync(latestFile, JSON.stringify(scorecard, null, 2));
  console.log(`→ wrote ${path.relative(root, latestFile)}\n`);
}

// ── Regression gate ─────────────────────────────────────────────────────────
if (args.has("--gate")) {
  const baselinePath = baselineFile;
  if (!fs.existsSync(baselinePath)) {
    console.error("✗ no baseline to gate against. Run with --baseline first.");
    process.exit(2);
  }
  const base = JSON.parse(fs.readFileSync(baselinePath, "utf8")).headline;
  // Metrics where a DROP is a regression. Over-redaction is inverted: a RISE
  // is the regression, so we negate it.
  const higherBetter = [
    "adversarialRecallLenient", "adversarialRecallStrict",
    "inScopeRecall", "injectionResistance", "precision",
  ];
  const regressions = [];
  for (const m of higherBetter) {
    if (H[m] !== null && base[m] !== null && H[m] < base[m]) {
      regressions.push(`${m}: ${base[m]}% → ${H[m]}%`);
    }
  }
  if (H.overRedactionRate !== null && base.overRedactionRate !== null &&
      H.overRedactionRate > base.overRedactionRate) {
    regressions.push(`overRedactionRate: ${base.overRedactionRate}% → ${H.overRedactionRate}% (rose)`);
  }
  // A new spurious grab — a non-identifier the engine wrongly removed — is a
  // regression even if recall held, because it degrades the clinical record.
  if (H.spuriousRedactions != null && base.spuriousRedactions != null &&
      H.spuriousRedactions > base.spuriousRedactions) {
    regressions.push(`spuriousRedactions: ${base.spuriousRedactions} → ${H.spuriousRedactions} (rose)`);
  }
  if (regressions.length) {
    console.error("✗ REGRESSION GATE FAILED:");
    for (const r of regressions) console.error("    " + r);
    console.error("");
    process.exit(1);
  }
  console.log("✓ regression gate passed — no metric worse than baseline\n");
}
