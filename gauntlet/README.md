# Redacta Gauntlet — v0

An adversarial evaluation harness for [Redacta](https://www.pharmatools.ai/redacta),
the clinical pseudonymisation engine (Zenodo DOI
[10.5281/zenodo.21115605](https://doi.org/10.5281/zenodo.21115605)).

Where the [friendly benchmark](https://www.pharmatools.ai/redacta-benchmark)
measures the engine *in scope, under cooperative conditions* (300 notes, 100%
recall, zero false positives, stable across 10 seeds), the Gauntlet does the
opposite job: it attacks. It asks what happens at the edges — hostile formats,
near-misses, prompt injection, and identity leaking through context rather than
through any literal identifier.

**Headline metric: recall under adversarial conditions.** A false negative is a
privacy breach, so recall is asymmetric and comes first. Over-redaction is
tracked as the cost axis — a redactor that deletes everything scores 100% recall
and is useless. The two numbers only mean something together.

See [`THREAT_MODEL.md`](./THREAT_MODEL.md) for the attacker model and the five
attack surfaces.

## Run it

```bash
npm install
npm run eval          # offline: the shipping engine, no API key, no network
npm run gate          # offline + regression gate (exit 1 on any drop) — for CI
npm run baseline      # accept the current scorecard as the new baseline
npm run eval:online   # exercise the live Redacta MCP (needs REDACTA_MCP_URL)
```

`npm run eval` runs the deterministic engine that ships in the iPhone app, CLI,
libraries and MCP server (`@pharmatools/redacta`), so it is fast enough to gate
every commit. The online engine points at the live MCP for parity checks; the
two agree token-for-token (see [`results/mcp-parity.json`](./results/mcp-parity.json)).

## Architecture

Same shape as the RefCheckr eval harness — gold cases in, scorers out, a
SHA-stamped scorecard, a regression gate diffed against a saved baseline.

```
gold.json ──▶ scorers ──▶ scorecard (code SHA, timestamp) ──▶ regression gate ──▶ CI
              │                                                     │
   offline: deterministic engine, no network            fails the build on any
   online: live Redacta MCP (--online)                  metric worse than baseline
```

- **`gold.json`** — 28 synthetic cases across the five attack surfaces, every
  identifier labelled with its type; `scope: deterministic|reasoning` marks
  whether the pattern engine is expected to catch it, and hostile cases carry
  `expected_miss: true` so a known limitation can't masquerade as a pass.
- **`src/engine.mjs`** — adapters turning text into `[{value, cat}]`, offline
  (npm package) and online (MCP).
- **`src/score.mjs`** — recall (lenient / strict), over-redaction, injection
  resistance, per-category and per-scope breakouts. Matching is on normalised
  alphanumerics so spacing and punctuation don't create phantom misses.
- **`src/run.mjs`** — driver: load, score, print, persist, gate.
- **`results/baseline.json`** — the accepted baseline the gate compares against.
- **`results/mcp-parity.json`** — live-MCP spot-check.

## v0 results (offline engine `@pharmatools/redacta@1.2.0`)

| Metric | Value |
|---|---|
| Adversarial recall (lenient, all 28 cases) | **76.8%** (43/56 identifiers) |
| In-scope recall (`deterministic` scope only) | **91.5%** (43/47) |
| Over-redaction rate (labelled distractors) | **0%** (0/17) |
| Precision (all removals) | **97.7%** (43/44) |
| Spurious redactions (non-identifiers grabbed) | **1** — prose-04 "confirmed" |
| Injection resistance | **100%** (5/5) |
| Reasoning-scope recall (quasi-identifiers, edge formats) | **0%** (0/9) — expected |

Precision counts every token the engine removed, not just the baited
distractors: of 44 removals, 43 were real identifiers and one — the word
"confirmed" in prose-04 — was a spurious grab. Over-redaction rate stays 0%
because "confirmed" was never a labelled distractor; precision is what catches
it. Both the rate and the spurious count now gate CI.

Per-category lenient recall: injection 100%, nearmiss 92.9%, prose 80%,
edge 53.8%, leakage 33.3%.

### What the Gauntlet found (v0)

The point of an adversarial set is the failures. Four are worth naming:

1. **Prose-04 — a dual failure.** Given "…transferred to the RJ1-2209841 record
   after a merge. Hospital number confirmed at desk", the keyword-anchored MRN
   pass latched onto the word **"confirmed"** (it followed "Hospital number") and
   tokenised *that* as the MRN — while the real identifier `RJ1-2209841` survived
   in the clear. A miss and a spurious redaction in the same sentence. Reproduced
   identically by the offline engine and the live MCP.
2. **Edge-02 — NHS number grouping.** `9234 4578 54` (4-4-2) is missed; the
   standard `923 445 7854` (3-3-4) is caught. The live MCP's `self_check` net
   *does* flag the 4-4-2 string as a "long number" for human review — a miss at
   the redaction layer, caught at the review layer.
3. **Edge-07 — DOB keyword distance.** `07/22/1955` is missed when the "DOB"
   keyword is separated from the number by intervening prose; the name and
   postcode in the same note are caught.
4. **Nearmiss-04 — untitled name.** `Sarah Trevino`, written without a
   title/salutation and set off in dashes, is missed; `Mrs Sarah Trevino` is
   caught. The documented free-text-name limitation, made concrete.

The injection surface, by contrast, is resisted completely: the deterministic
engine never interprets the document, so instructions embedded in the text buy
the attacker nothing — every identifier around them redacts exactly as normal.

## Known gaps (tracked, not hidden)

- **No reasoning layer yet.** The `reasoning`-scope cases (indirect leakage,
  partial postcodes, initials, DOB-as-age) score 0% by design; catching them
  needs the LLM-assisted layer, which is Gauntlet v1's target.
- **Injection is only tested against the deterministic engine.** The genuinely
  injectable surface is any downstream model consuming Redacta's output; those
  same cases are staged to point there next.
- **~~Over-redaction metric counts only labelled distractors.~~** *Closed:* a
  precision metric now scores every non-gold token the engine removed as a
  candidate false positive, so spurious grabs like prose-04's "confirmed" show up
  in the headline (97.7% precision) and gate CI, not just in case notes.
- **Synthetic only.** Realism is bounded by policy — no real patient data, ever.

## Reproducibility

Every scorecard in `results/` is stamped with the engine version, the code SHA,
and a timestamp, and records every case's per-identifier outcome. `npm run eval`
regenerates `results/latest.json`; `npm run gate` fails CI if any metric is worse
than `results/baseline.json`.
