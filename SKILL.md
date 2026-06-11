---
name: redacta
version: 1.1.0
description: Pseudonymises medical and clinical documents by replacing patient identifiers with labelled tokens (e.g. [PATIENT_NAME_1], [NHS_NUMBER_1], [DATE_OF_BIRTH_1]) so the text can be safely processed by AI or shared, with clinical meaning intact. Combines a deterministic pattern layer (NHS numbers with Modulus-11 validation, UK National Insurance numbers, dates of birth, UK postcodes, phone numbers, emails, hospital/MRN numbers) with contextual reasoning for patient names, postal addresses and identifying ages, then returns the redacted document plus a redaction report. Use when the user wants to redact, de-identify, anonymise or pseudonymise a medical letter, clinical note, discharge summary, referral or patient record, or before pasting clinical text into another AI tool. Can also re-identify (reverse the redaction) by restoring original values from a token map.
license: MIT-0
---

# Redacta

Pseudonymise medical text before it is processed by AI or shared: replace patient
identifiers with labelled tokens (`[PATIENT_NAME_1]`, `[NHS_NUMBER_1]`,
`[DATE_OF_BIRTH_1]`, ...) while leaving the clinical meaning untouched. Return the
redacted document plus a redaction report.

Redacta works in two layers:

- **Layer 1 — patterns (deterministic).** Fixed-format identifiers, matched by a
  bundled script: NHS numbers (Modulus-11 validated), UK National Insurance
  numbers, dates of birth, UK postcodes, phone numbers, emails, hospital/MRN
  numbers. (US SSN and ZIP codes are also handled.)
- **Layer 2 — reasoning (your judgement).** Identifiers that do not follow a fixed
  pattern: patient names, postal addresses and identifying ages. This is where you
  read context and tell a patient apart from the clinician treating them.

## Workflow

Copy this checklist and tick items off as you go:

```
Redaction progress:
- [ ] 1. Save the source text to a file
- [ ] 2. Run the pattern layer (scripts/redact_structured.py)
- [ ] 3. Apply the reasoning layer (names, addresses, ages)
- [ ] 4. Assemble the pseudonymised document (formatting preserved)
- [ ] 5. Self-check the output for residual identifiers
- [ ] 6. Write the redaction report
- [ ] 7. Add the limits note
```

### 1–2. Pattern layer

Write the user's text **verbatim** to a temp file, then run the script (execute
it — do not read it into context):

```bash
python3 scripts/redact_structured.py /tmp/redacta_input.txt
```

It prints JSON with `redacted_text`, `report` (count of distinct values per type)
and `token_map` (token → original value, for review and re-identification). Carry
`redacted_text` forward into Layer 2. The script uses the Python 3 standard
library only and makes no network calls.

### 3. Reasoning layer

Read `redacted_text` and pseudonymise what the patterns cannot:

- **Patient names** → `[PATIENT_NAME_n]`. Redact the patient and any relatives or
  carers named. **Keep** the names of treating clinicians, GPs, and institutions
  (hospital, ward, practice) by default — they carry meaning and are not the data
  subject. If the user asks for full de-identification, also redact those as
  `[CLINICIAN_NAME_n]` and `[ORG_NAME_n]`.
- **Postal addresses** → `[ADDRESS_n]`. Any postcode inside the address is already
  a token from Layer 1.
- **Identifying ages** → `[AGE_n]`. Redact specific ages ("a 73-year-old woman").
  Leave non-identifying bands ("elderly", "in her 70s") unless the user wants them
  removed.
- **Same value → same token.** Reuse a token for every occurrence of the same
  value; give different values new numbers. Continue numbering alongside the tokens
  already in `token_map`.
- **When unsure, redact.** Prefer removing a possible identifier over leaving it.

See [reference.md](reference.md) for disambiguation heuristics and the full token
vocabulary.

### 4. Assemble

Reproduce the document exactly — same line breaks, headings and layout — changing
only the identifiers. Never alter clinical content (findings, medications, doses,
results, dates of appointments or procedures).

### 5. Self-check

Before finalising, re-read the assembled document as if you were an auditor and
look for anything that still identifies a person:

- Numbers that look like an NHS number, phone, MRN, account or reference but were
  not tokenised.
- A name, relative, carer or place name you passed over — especially mid-sentence
  ("…lives with her sister Joan…", "…transferred from St Elsewhere…").
- A specific age, postcode fragment, email, URL or date of birth.

If you find anything, tokenise it and update the report. A clean self-check is not
a guarantee — it is a second pass, not a proof. Treat it as the moment to catch
what Layers 1 and 2 missed.

### 6. Report

End with a short, human-readable report, for example:

> **Redaction report:** 5 identifiers pseudonymised — 1 patient name, 1 date of
> birth, 1 age, 1 NHS number, 1 address. Clinical content preserved.

If the user may need to reverse the process, also offer the token map as a table
(`token | original value`). Treat that table as the key that undoes the
pseudonymisation — include it only where the user wants it, and never alongside the
redacted text if the point was to keep identifiers separate.

### 7. Limits note

Always include this note:

> Redacta is a strong first line of defence, not a guarantee. It will not catch
> every possible identifier and is not a substitute for formal data-protection
> processes. Review the report before sharing the text.

## Re-identification (reversing the redaction)

When the user has run the redacted text through another tool and wants the real
values put back, use the token map with the bundled script (execute it — do not
read it into context):

```bash
python3 scripts/reinstate.py redacted_or_ai_output.txt --map token_map.json
```

`token_map.json` may be either a bare map (`{"[NHS_NUMBER_1]": "943 476 5919"}`)
or the full JSON object printed by `redact_structured.py` — both work. The script
swaps every token back to its original value and prints `{text, changed}`; add
`--text-only` for just the restored text. It is standard-library only and makes no
network calls.

This completes the round trip: **redact → process/share → re-identify**, with the
real identifiers only ever present locally. The token map is the key that reverses
the pseudonymisation — handle and store it with the same care as the original data.

## Notes

- All processing happens in this session: the script makes no network calls and
  sends your text to no third-party service. Your text is of course visible to the
  assistant running this skill — the purpose of Redacta is to produce output that
  is safe to pass on to *other* tools, services or storage.
- Redacta is UK-focused (NHS, NI, UK postcodes) and also handles emails,
  international phone numbers, and US SSN/ZIP codes.
- The Modulus-11 algorithm, the date-of-birth vs clinical-date rule, NI prefix
  rules, the full token list and known limitations are documented in
  [reference.md](reference.md).
