# redacta

Pseudonymise patient identifiers and PII in text — and restore them. A local,
dependency-free Python pattern engine.

```bash
pip install redacta
```

```python
from redacta import redact, reinstate

redacted, report, token_map = redact(
    "Dear patient, NHS Number: 943 476 5919, tel 0113 278 4532."
)
# redacted -> "Dear patient, NHS Number: [NHS_NUMBER_1], tel [PHONE_1]."

original = reinstate(redacted, token_map)
# original -> "Dear patient, NHS Number: 943 476 5919, tel 0113 278 4532."
```

## What it detects

Deterministic, checksum-validated patterns: NHS numbers (Modulus-11), UK National
Insurance numbers, dates of birth (keyword-anchored; appointment dates left
intact by default), UK postcodes, US SSNs and ZIP codes, hospital/MRN numbers,
emails, phone numbers, URLs, IP addresses, Luhn-validated payment cards, IBANs,
account numbers, and UK vehicle registrations — plus keyword-anchored patient,
relative and carer names (clinician names preserved). Same value → same token; a
`token_map` lets you reverse it.

Names in free prose aren't caught (they need an LLM — see the
[Redacta agent skill](https://clawhub.ai/nickjlamb/redacta)). Stdlib only, no
network calls; review output before sharing.

## Safe Harbor mode

```python
redacted, report, token_map = redact(text, safe_harbor=True)
```

Applies the stricter HIPAA Safe Harbor (§164.514) pass on top of the default:
**all** dates (not just DOB — appointment dates included), specific ages, fax
numbers, certificate/licence numbers, device serial numbers, VINs, and
health-plan/beneficiary numbers. Over-redacts slightly versus the letter of the
standard, on the safe side. Not legal advice.

## Self-check

```python
from redacta import self_check
leftovers = self_check(redacted)   # [{'label': ..., 'sample': ...}, ...]
```

## CLI

```bash
redacta letter.txt                 # prints JSON: redacted_text, report, token_map
redacta letter.txt --text-only     # just the redacted text
redacta letter.txt --safe-harbor   # strict HIPAA Safe Harbor pass
redacta-reinstate redacted.txt --map token_map.json
```

## License

MIT-0 (MIT No Attribution). Built by
[PharmaTools.AI](https://www.pharmatools.ai/redacta).
