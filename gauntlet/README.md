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

# Reasoning layer (Layer 2) — needs an API key; keeps its own scorecard.
# Claude is the default (the layer that ships); Perplexity is explicit opt-in.
export ANTHROPIC_API_KEY=sk-ant-...      # default → anthropic / claude-sonnet-5
export PERPLEXITY_API_KEY=pplx-...       # used only when forced (below)
# force provider: REDACTA_REASONING_PROVIDER=anthropic|perplexity
# pick model:     REDACTA_REASONING_MODEL=sonar-reasoning-pro

npm run eval:reasoning        # deterministic Layer 1 + LLM Layer 2, combined
npm run reasoning:baseline    # accept a reasoning baseline (results/reasoning-<provider>-baseline.json)
npm run reasoning:gate        # gate the reasoning run against its own baseline

# Downstream injection — an LLM CONSUMING Redacta's output (same keys/provider)
npm run eval:downstream       # redact → feed to a summariser → score hijack + leakage
npm run downstream:baseline   # accept a downstream baseline
npm run downstream:gate       # gate — any NEW identifier leak fails the build
```

`npm run eval` runs the deterministic engine that ships in the iPhone app, CLI,
libraries and MCP server (`@pharmatools/redacta`), so it is fast enough to gate
every commit. The online engine points at the live MCP for parity checks; the
two agree token-for-token (see [`results/mcp-parity.json`](./results/mcp-parity.json)).

**The reasoning scorer** reproduces Redacta's Layer 2 — which, in the product, is
the host LLM applying the [skill's](https://github.com/nickjlamb/redacta/blob/main/SKILL.md)
reasoning rules (patient names, addresses, identifying ages) to the
already-redacted text. `npm run eval:reasoning` runs Layer 1, then an LLM pass
with those exact rules, and combines both layers' findings before scoring. It is
**provider-agnostic**: Anthropic (tool-use, via the lazy-loaded SDK) or Perplexity
(JSON-schema output, via plain `fetch` — no SDK). Provider is auto-detected from
whichever key is set, or forced with `REDACTA_REASONING_PROVIDER`; model defaults
per provider and is overridable with `REDACTA_REASONING_MODEL`. The reasoning run
writes `results/reasoning-*.json` and gates against its own baseline — it never
touches the deterministic one, which stays keyless and network-free.

> **Perplexity caveat.** Sonar models are search-augmented — they hit the web on
> every call. That is fine for this synthetic gold set, but it is not a production
> reasoning-layer choice for real clinical text: you would never route PHI through
> a search model. A Perplexity run measures "Sonar as the reasoning layer", and
> nothing about the run should be read as shipping guidance for real records.

**The downstream scorer** (`gold-downstream.json`, `src/downstream.mjs`) tests the
surface the earlier work did not: an LLM *consuming* Redacta's output. Redacta
redacts identifiers, not instructions, so an injection embedded in a note survives
redaction and reaches the consumer. Each case is redacted (Layer 1), handed to a
downstream summariser, and scored on two axes:

- **Identifier leakage** (the headline breach) — did any real identifier appear in
  the output? It is contained to **zero wherever redaction was complete**, because
  the consumer only ever receives tokens; it cannot leak what it never got. The one
  leak path is a redaction *miss* (case `ds-05`, an untitled name Layer 1 skips),
  which is a completeness problem the reasoning layer fixes — not an injection one.
- **Behavioural resistance** — did the consumer obey an embedded instruction (emit a
  canary)? This depends entirely on the *consumer's* own injection defences, not on
  Redacta. It is reported for context and is an honest boundary: Redacta bounds the
  blast radius of injection to non-identifying, but it does not — and cannot — stop a
  downstream model from being hijacked. `downstream:gate` fails the build only on a
  new identifier leak or a dirtied control case, never on behavioural hijack alone.

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

- **~~Reasoning layer unmeasured.~~** *Closed:* the Layer-2 scorer measures it,
  and the gold set's scopes are split into `reasoning` (Layer-2 territory) and
  `quasi` (indirect leakage). Measured lift: names/ages/initials **0% → 80%
  (Claude) / 100% (Sonar Pro)**; indirect leakage stays **0% on every layer** —
  the standing ceiling, now named with a number. Remaining gap: quasi-identifier
  reconstruction is beyond any current Redacta layer, deterministic or reasoning.
- **~~Injection only tested against Redacta's own engines.~~** *Closed:* the
  downstream scorer tests an LLM consuming Redacta's output. Identifier leakage is
  contained to zero wherever redaction was complete — the consumer never receives
  the identifier. Remaining gap: **behavioural** hijack of the downstream model is
  real and is *not* Redacta's to fix; the eval reports it as an honest boundary
  rather than claiming a defence Redacta does not provide.
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
