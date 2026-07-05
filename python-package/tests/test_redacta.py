"""Smoke tests for the redacta package public API.

Run:  python3 -m pytest        (or)  python3 tests/test_redacta.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from redacta import (  # noqa: E402
    redact, reinstate, self_check,
    is_valid_nhs, is_valid_luhn, __version__,
)

passed = 0


def check(name, cond):
    global passed
    assert cond, "FAILED: " + name
    passed += 1


check("version present", isinstance(__version__, str) and __version__)

# --- structured IDs --------------------------------------------------------
redacted, report, token_map = redact(
    "NHS Number: 943 476 5919, email jo@example.com")
check("nhs tokenised", "[NHS_NUMBER_1]" in redacted)
check("email tokenised", "[EMAIL_1]" in redacted)
check("report counts", report.get("NHS_NUMBER") == 1)
check("token map maps back", token_map["[NHS_NUMBER_1]"] == "943 476 5919")
check("round trip", reinstate(redacted, token_map)
      == "NHS Number: 943 476 5919, email jo@example.com")
check("reinstate accepts full object",
      reinstate(redacted, {"token_map": token_map, "report": report})
      == "NHS Number: 943 476 5919, email jo@example.com")

# --- general PII (new) -----------------------------------------------------
g, _, _ = redact("Visit https://example.com from 192.168.1.1, card 4111 1111 1111 1111")
check("url", "[URL_1]" in g)
check("ip", "[IP_ADDRESS_1]" in g)
check("luhn card", "[CARD_NUMBER_1]" in g)

# --- names (new) -----------------------------------------------------------
n, _, _ = redact("Dear Mrs Patricia Hartley, her daughter Sarah is here. Seen by Dr Patel.")
check("patient name", "[PATIENT_NAME_1]" in n and "Patricia" not in n)
check("relative name", "[RELATIVE_NAME_1]" in n and "daughter Sarah" not in n)
check("clinician preserved", "Dr Patel" in n)

# --- clinical default keeps appointment dates ------------------------------
c, _, _ = redact("DOB: 14/03/1952. Appointment 15 March 2026.")
check("dob redacted by default", "[DATE_OF_BIRTH_1]" in c)
check("appointment kept by default", "15 March 2026" in c)

# --- Safe Harbor mode ------------------------------------------------------
s, rep, tm = redact(
    "Mr Earl Dawson, 91 years old, admitted 02/03/2026, clinic 20 March 2026. "
    "Fax: 0113 496 1234. Medicare ID: 1EG4TE5MK73.",
    safe_harbor=True)
check("safe harbor redacts all dates", "[DATE_1]" in s and "20 March 2026" not in s)
check("safe harbor redacts age", "[AGE_1]" in s and "91 years old" not in s)
check("safe harbor fax", "[FAX_1]" in s)
check("safe harbor health plan", "[HEALTH_PLAN_NUMBER_1]" in s)
check("safe harbor name", "[PATIENT_NAME_1]" in s)

# --- self-check ------------------------------------------------------------
check("self-check flags leftover", any(
    f["label"] == "URL" for f in self_check("see https://example.com")))
check("self-check ignores tokens", self_check("NHS: [NHS_NUMBER_1]") == [])

# --- regressions found by the OpenGATE redaction eval ----------------------
c, _, tm = redact("Next of kin: her daughter Anita (07700 900456) was updated.")
check("relative nested in next-of-kin phrase is caught", "Anita" not in c)
c, _, _ = redact("Mrs Eileen O'Brien was admitted. His daughter Mary O'Brien attended.")
check("apostrophe surnames captured", "O'Brien" not in c)
c, _, _ = redact("Her daughter Sarah is the main contact. The patient has a daughter and two sons.")
check("no over-capture regressions", "Sarah" not in c and "two sons" in c)

# --- street addresses -------------------------------------------------------
c, _, tm = redact("Address on file: 42 Maple Road, Oxford OX2 6JX.")
check("street line redacted", "42 Maple Road" not in c and "[STREET_ADDRESS_1]" in c)
check("city kept, postcode tokenised", "Oxford" in c and "[POSTCODE_1]" in c)
c, _, _ = redact("Lives at Flat 3, 42 Chestnut Grove. Also 10 Priory Dr and 7 Baker St.")
check("flat prefix and abbreviations", "Chestnut Grove" not in c and "Priory Dr" not in c and "Baker St" not in c)
c, _, _ = redact("Seen at St Mary's Hospital by the 24 hour pharmacy team on 4 June 2026.")
check("no street false positives", "St Mary's Hospital" in c and "24 hour pharmacy" in c and "4 June 2026" in c)

# --- validators ------------------------------------------------------------
check("nhs validator", is_valid_nhs("9434765919") and not is_valid_nhs("9434765918"))
check("luhn validator", is_valid_luhn("4111111111111111") and not is_valid_luhn("4111111111111112"))

print("All %d checks passed." % passed)
