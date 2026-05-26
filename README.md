# Redacta

Pseudonymise medical and clinical documents before they're processed by AI or
shared. Redacta replaces patient identifiers with labelled tokens —
`[PATIENT_NAME_1]`, `[NHS_NUMBER_1]`, `[DATE_OF_BIRTH_1]`, … — while leaving the
clinical meaning intact, and returns a redaction report alongside the cleaned
text.

It's an [Agent Skill](https://agentskills.io) (the open standard used by Claude
and other agents), so it drops into Claude Code, the Claude apps, or the API.

## How it works

Two layers:

- **Patterns (deterministic).** A bundled script (`scripts/redact_structured.py`,
  Python standard library only, no network) matches fixed-format identifiers:
  NHS numbers (Modulus-11 validated), UK National Insurance numbers, dates of
  birth, UK postcodes, phone numbers, emails, and hospital/MRN numbers. US SSN
  and ZIP codes are also handled.
- **Reasoning (judgement).** The skill then has the agent handle what patterns
  can't: patient names (told apart from the clinicians treating them), postal
  addresses, and identifying ages.

## Install

**Claude Code**

```bash
git clone https://github.com/nickjlamb/redacta ~/.claude/skills/redacta
```

Then invoke it with `/redacta`, or let it trigger automatically when you ask to
redact or de-identify clinical text.

**Claude apps / API**

Zip the repository folder and upload it as a skill.

## Contents

| Path | What it is |
|------|------------|
| `SKILL.md` | The skill — instructions plus metadata |
| `reference.md` | Pattern specs, the Modulus-11 algorithm, NI prefix rules, the date-of-birth vs clinical-date rule, token vocabulary, limitations |
| `scripts/redact_structured.py` | The deterministic pattern layer |
| `scripts/test_redact_structured.py` | Tests for the pattern layer |
| `evaluations.json` | Example evaluation scenarios |

Run the pattern-layer tests:

```bash
python3 scripts/test_redact_structured.py
```

## A note on limits

Redacta is a strong first line of defence, not a guarantee. It won't catch every
possible identifier and isn't a substitute for formal data-protection processes.
Always review the redaction report before sharing text.

## License

[MIT-0](LICENSE) (MIT No Attribution). Built by
[PharmaTools.AI](https://www.pharmatools.ai/redacta).
