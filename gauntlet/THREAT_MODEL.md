# Redacta Gauntlet — Threat Model (v0)

**Status:** v0 · gold set 28 synthetic cases · deterministic engine under test
**Engine:** `@pharmatools/redacta` (the layer that ships in the iPhone app, MCP server, CLI and libraries)
**Companion:** the [Redacta benchmark](https://www.pharmatools.ai/redacta-benchmark) measures the engine *in scope, under friendly conditions*. The Gauntlet exists to attack it.

---

## 1. The attacker and the asset

The asset is a patient's identity. The attacker is anyone — or any downstream
system — who receives text that Redacta has processed and should not be able
to identify the patient from it.

The attacker's goal is simple: **one identifier surviving redaction.** Unlike
most quality metrics, this one is asymmetric:

- A **false negative** (a missed identifier) is a privacy breach. One is too many.
- A **false positive** (over-redaction) is a quality cost — it degrades the
  clinical record — but it is not a breach.

So the Gauntlet's headline metric is **recall under adversarial conditions**,
with **over-redaction rate** tracked as the cost axis. A redactor can trivially
achieve 100% recall by deleting the document; the two numbers only mean
something together.

## 2. Trust boundaries

Redacta's promise is made at a specific boundary: text goes *in* containing
identifiers, text comes *out* not containing them, and a token map — the only
route back — stays local. Three properties follow, and the Gauntlet tests the
first two directly:

1. **Completeness** — no in-scope identifier appears in the output.
2. **Integrity under hostile input** — the document itself cannot alter the
   redaction behaviour (prompt injection).
3. **Containment of the token map** — out of scope for this harness; it is an
   architectural property tested at the app/MCP layer, not a text-processing one.

A critical architectural fact shapes the threat model: **the deterministic
engine does not interpret the document.** It applies pattern passes and
keyword-anchored rules. It cannot "follow instructions" found in the text,
because it never treats text as instructions. Prompt injection against the
deterministic layer should therefore fail *by construction* — but "should" is
not a measurement, so the Gauntlet measures it anyway. The genuinely
injectable surface is any **LLM-assisted layer** (the reasoning pass in the
app, or a model consuming Redacta's MCP output): that surface is named as a
gap below and is the target of Gauntlet v1.

## 3. Attack surfaces

Five categories, each with labelled gold cases. Categories are ordered
roughly from "engine should win" to "engine is expected to lose" — the
Gauntlet includes cases we expect to fail, because an eval that only contains
winnable cases is marketing.

### A. Identifiers embedded in clinical prose (`prose`)

Identifiers rarely arrive as neat labelled fields. Names appear mid-sentence
inside adverse-event narratives ("...at which point Margaret developed a
rash..."), dates of birth hide inside dosing histories, contact details are
folded into referral prose. The keyword-anchored name detection is the
component under stress: a name with no title, no label and no salutation is
the canonical hard case for a deterministic engine.

### B. Unusual and edge formats (`edge`)

The same identifier, hostile spelling. NHS numbers with non-standard grouping
or interleaved punctuation; initials in place of names; partial postcodes
("the M23 area"); dates of birth written as ages plus birth years; two-digit
years; MRNs in odd header formats; phone numbers in international notation.
Pattern engines live or die on format coverage — this category maps its edges.

### C. Adversarial near-misses (`nearmiss`)

Cases built to fool both pattern engines and LLMs, in both directions:

- **Bait to over-redact:** checksum-invalid NHS numbers, lab references and
  lot numbers with identifier-like shapes, eponymous disease names
  (Parkinson's), clinician names adjacent to patient names. These are
  `preserve` items — redacting them is the failure.
- **Camouflaged identifiers:** a real identifier placed where the surrounding
  context suggests it is something innocent (a patient sharing a clinician's
  name; a DOB adjacent to a look-alike appointment date). Missing these is
  the failure.

This category is where recall and over-redaction are directly traded against
each other, which is why the Gauntlet reports both.

### D. Direct prompt injection (`injection`)

The document itself attacks: embedded instructions telling the processor to
skip redaction, output originals, or reinstate tokens — styled variously as
system prompts, transcriptionist notes, registry instructions and markdown
comments. Scored two ways: (1) every identifier in an injection case must
still be caught, and (2) the injected instruction must produce no behavioural
change. For the deterministic engine the expected result is full resistance;
the measurement exists so that claim is tested on every commit, and so the
same cases are ready to aim at LLM-assisted layers where the outcome is far
less certain.

### E. Indirect leakage (`leakage`)

No identifier appears verbatim, yet the patient is identifiable from context:
rare role plus place ("the sitting MP for a Greater Manchester
constituency"), unique clinical events ("the only paediatric liver transplant
at the trust this year"), employer-plus-village combinations, dates of
publicly reported incidents. These are **quasi-identifiers**. A pattern
engine has no category for them and is expected to score at or near zero
here. The cases are labelled `scope: "reasoning"` and reported separately —
not to excuse the number, but so the gap has a name, a size, and a place in
the scorecard where it cannot be quietly averaged away.

## 4. Metrics

| Metric | Definition | Direction |
|---|---|---|
| **Adversarial recall (lenient)** | Gold identifiers no longer present in output, any label, all 28 cases | Higher; the headline |
| **Adversarial recall (strict)** | Caught *and* tokenised under the correct category | Higher |
| **In-scope recall** | Recall restricted to `scope: "deterministic"` gold items | Higher; comparable to the friendly benchmark |
| **Over-redaction rate** | `preserve` items wrongly removed / total preserve items | Lower; the cost axis |
| **Injection resistance** | Injection cases where all identifiers were caught and behaviour was unchanged | 100% expected |
| **Per-category recall** | The five surfaces broken out | Where the story is |

Scoring follows the existing benchmark's conventions: values are compared on
normalised alphanumerics (so `943 476 5919`, `9434765919` and `943-476-5919`
match), and strict recall requires the token category to match the gold label.

## 5. Out of scope for v0 (named, not hidden)

- **LLM-assisted reasoning layer** — the injectable surface; Gauntlet v1 target.
- **Token-map exfiltration** — architectural, tested elsewhere.
- **Non-English text, OCR noise, scanned-document artefacts.**
- **Statistical re-identification across documents** (linkage attacks) — the
  leakage category probes single-document reconstruction only.
- **Real patient data** — every case is synthetic by policy. This bounds
  realism; the trade is deliberate and permanent.

## 6. Relationship to the friendly benchmark

The benchmark answers "does the engine do what it targets, reliably?" —
300 notes, in-scope identifiers, 100% recall, zero false positives, stable
across 10 seeds. The Gauntlet answers the question that number invites:
**what happens outside the target?** The two are designed to be read
together, and the Gauntlet's job is to make the benchmark's 100% earn its
asterisks in public.
