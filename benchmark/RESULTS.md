# Redacta — deterministic engine benchmark

A reproducible accuracy benchmark for Redacta's **deterministic detection engine** —
the layer that ships in the iOS app, the MCP server, the CLI and the libraries. It
measures how reliably the engine redacts the identifiers it targets, and — just as
importantly — how well it *avoids* redacting things it shouldn't.

> **Reproduce it:** `node benchmark/benchmark.mjs` (seed `20260626`), run against
> `ios-app/RedactaEngine/Resources/redacta.bundle.js`, clinical mode. The corpus is
> exported to `corpus.json`; `presidio_baseline.py` scores Microsoft Presidio on the
> identical input with the identical rule.

## Headline

| Metric | Redacta | Microsoft Presidio (default) |
|---|---|---|
| **Identifiers found** (any label) | **100%** | 89.7% |
| **Strict recall** (correct category) | **100%** | 77.3% |
| **False positives** (wrongly redacted) | **0** | 1,643 |
| **Clinical context preserved** | **100%** (1,329 / 1,329) | 32.8% |
| Free-text names (out of scope) | 0% (0 / 50) — *by design* | — |

Corpus: **300 synthetic UK clinical notes** containing **1,713** gold-labelled
identifiers, plus **1,329** "preserve" distractors designed to tempt a naive redactor.

**Robustness.** Repeated across **10 independent seeds (17,227 identifiers total)**, every
metric is identical run to run — recall 100%, false positives 0, preservation 100%,
**zero variance**. Expected for a deterministic engine, and now measured.

Presidio finds most identifiers but over-redacts heavily — flagging 1,643 non-identifiers
(every clinician name, every appointment date) and keeping barely a third of the
clinical context. It also has no recogniser for UK National Insurance numbers (32%
found) or postcodes (38%). Presidio was run as shipped (presidio-analyzer 2.2.362,
default recognisers, `en_core_web_lg` 3.7.x); the corpus is UK clinical text,
Redacta's tuned domain.

## What was tested

Per-category recall (all detected):

| Category | n | Recall |
|---|---|---|
| NHS number (Modulus-11 validated) | 60 | 100% |
| Patient name (title / salutation / label anchored) | 60 | 100% |
| Date of birth (keyword anchored) | 45 | 100% |
| Relative / next-of-kin name | 32 | 100% |
| Phone number (UK / US formats) | 32 | 100% |
| Postcode (UK) | 31 | 100% |
| MRN / hospital number | 27 | 100% |
| National Insurance number | 25 | 100% |
| Email | 21 | 100% |

NHS numbers appeared in spaced, unspaced and dashed forms; DOBs were introduced by
varied keywords (`Date of birth`, `DOB:`, `D.O.B.`, `Born on`).

## What it must *not* redact (precision / preservation)

The corpus seeds each note with false-positive bait. The engine correctly **kept all
269**:

- **Invalid NHS numbers** that fail the Modulus-11 checksum (proves detection isn't
  "any 10 digits").
- **Invalid-prefix NI numbers** (e.g. `BG …`) the format rejects.
- **Appointment / clinical dates** with no DOB keyword — preserved in clinical mode so
  the record keeps its meaning.
- **Clinician names** (`Dr`, `Consultant`, `Registrar`) — only the patient is redacted.
- **Dosages and lab values** (`200 mg`, `Ferritin 23 ug/L`).

## Speed & footprint

The engine is deterministic regex + checksums, so it's tiny and instant — which is
what lets it run on-device (iPhone app, browser) rather than server-side.

| | Redacta | Presidio |
|---|---|---|
| Engine / model size | **~15 KB** (5 KB gzipped) | ~560 MB (`en_core_web_lg`) |
| Per-note time | **0.04 ms** (~25,000 notes/sec) | loads a ~560 MB model first |
| Where it runs | on-device, 0 network calls | Python runtime, in practice server-side |

Redacta's footprint is ~37,000× smaller than the model Presidio loads. Measured with
Node 22 on a laptop-class core (warm, 12,000 redactions); on-device it runs in
JavaScriptCore. Reproduce the speed number:

```
node -e 'const fs=require("fs"),vm=require("vm");const c={};vm.createContext(c);vm.runInContext(fs.readFileSync("ios-app/RedactaEngine/Resources/redacta.bundle.js","utf8"),c);const t=JSON.parse(fs.readFileSync("benchmark/corpus.json")).notes.map(n=>n.text);for(let i=0;i<3;i++)t.forEach(x=>c.Redacta.redact(x,"clinical"));const s=process.hrtime.bigint();for(let i=0;i<200;i++)t.forEach(x=>c.Redacta.redact(x,"clinical"));console.log((Number(process.hrtime.bigint()-s)/1e6/(200*t.length)).toFixed(3),"ms/note")'
```

## Methodology

1. A seeded generator builds 60 synthetic notes from clinical templates, inserting
   programmatically-valid identifiers (e.g. checksum-valid NHS numbers) and recording
   the gold span + category for each, plus the preserve distractors.
2. Each note is run through the shipping engine in clinical mode.
3. An identifier counts as **caught** if its value appears in the returned token map;
   a redaction counts as **correct** if it maps to a gold identifier; a distractor
   counts as **preserved** if it never appears in the token map. Comparison is on
   alphanumerics only, so format differences (spacing/dashes) don't affect scoring.

All data is **synthetic** — no real patient information is used.

## Limitations (read this)

The headline numbers describe the engine **within its deterministic scope**. They are
high because the engine is regex + checksum based and near-exhaustive on the patterns
it targets — the benchmark *verifies* that and probes the boundaries. The real limits:

- **Free-text names are out of scope.** A name with no anchoring title, salutation,
  label or relationship word (e.g. *"Patricia returned today…"*) is **not** caught
  (0/15 here). This is by design for a deterministic on-device engine; the app prompts
  the user to review, and the agent-skill layer adds LLM reasoning for these cases.
- **Over-redaction in ambiguous cases (the safe direction).** A 10-digit `NNN NNN NNNN`
  reference number, or any 10–11 digit string starting with `0`, matches the generic
  phone pattern and is redacted even if it isn't a phone number. `Sister <Name>` (a UK
  nurse title) is treated as a relative and redacted. These err toward redaction.
- **Apostrophe-particle surnames** (e.g. *O'Brien*, *de Souza*) can be partially caught.
- **Synthetic data.** Real letters are messier (OCR noise, unusual layouts); expect
  real-world recall to be lower, especially for names. Always review the output.

> Redacta is a strong first line of defence, not a guarantee. Always review the
> redaction report before sharing text.
