# Redacta — Case Study

> Open-source AI skill that pseudonymises medical documents — replacing patient
> identifiers with labelled tokens so clinical text can be safely processed by
> AI, with the clinical meaning intact.

**Role:** Sole creator — concept, architecture, implementation, documentation, and release.
**Built as:** an Agent Skill for Claude, to the open Agent Skills standard.
**Stack:** Python (standard library) + agent reasoning · MIT-0 · 800+ installs on ClawHub · open-sourced on GitHub.

## The problem

Clinicians, researchers and medical writers routinely paste real clinical text —
letters, discharge summaries, referrals — into AI tools to summarise or rewrite
it. That text is dense with patient identifiers: names, NHS numbers, dates of
birth, addresses. Redacting by hand is slow and error-prone, and a single missed
identifier defeats the purpose.

## What I built

A two-layer redaction skill that strips identifiers *before* the text reaches any
downstream AI:

- **Patterns (deterministic).** Fixed-format identifiers matched exactly — NHS
  numbers validated with the Modulus-11 checksum (so a phone number is never
  mistaken for one), UK National Insurance numbers with HMRC prefix rules, UK
  postcodes, phones, emails and hospital/MRN numbers.
- **Reasoning (judgement).** What patterns can't catch — patient names
  (distinguished from the clinicians treating them), postal addresses, identifying
  ages — handled by agent reasoning, erring toward redaction when uncertain.

Output: a pseudonymised document with clinical content untouched, plus a report of
every identifier replaced.

## Decisions that show the thinking

- **DOB vs clinical date** — a date of birth is removed, but an appointment date is
  kept; blanket date-stripping would destroy the meaning Redacta exists to
  preserve.
- **Patient vs clinician** — pseudonymisation protects the data subject, so the
  patient is redacted while the treating clinician and institution are kept by
  default (with a full-de-identification option).
- **Honest about limits** — positioned explicitly as a strong first line of
  defence, *not* a guarantee or a substitute for formal data-protection review.
  Accuracy over hype.

## Impact

- 800+ installs on ClawHub (v1.0.0, MIT-0).
- Runs in Claude Code, the Claude apps, and the Claude API; published open-source
  on GitHub.
- The same on-device redaction approach also ships in Patiently AI, a live
  medical-text simplifier I build — so the technique is proven in production, not
  just as a demo.

## Skills demonstrated

Medical domain knowledge (NHS/clinical data formats, data-protection awareness) ·
AI/agent engineering (hybrid code-plus-reasoning design on an emerging open
standard) · Python (validation algorithms, regex, tested) · product positioning
and technical writing.

## Links

- GitHub — https://github.com/nickjlamb/redacta
- Website — https://www.pharmatools.ai/redacta
- ClawHub — https://clawhub.ai/nickjlamb/redacta

---

## Short variants (for reuse across channels)

**One-liner (portfolio grid / header)**

Redacta — an open-source AI skill that pseudonymises medical documents before AI
processing. Two-layer design (checksum-validated patterns + agent reasoning),
MIT-0, 800+ installs.

**LinkedIn / profile blurb**

I built Redacta, an open-source Agent Skill that pseudonymises medical documents
so clinical text can be processed by AI without exposing the patient. It pairs
deterministic pattern-matching (NHS numbers validated by Modulus-11 checksum, UK
National Insurance numbers, postcodes) with agent reasoning for the things regex
can't reliably catch — names, addresses and ages. 800+ installs; open-sourced
under MIT-0.

**CV bullet**

Designed and shipped **Redacta**, an open-source (MIT-0) AI skill for
medical-document pseudonymisation — checksum-validated identifier detection +
agent reasoning; 800+ installs; runs across Claude Code, apps and API.

**Skills / tech tags**

Agent Skills · Python · Clinical NLP / de-identification · NHS & UK data formats ·
data-protection-aware product design
