"""Smoke tests for redacta.PrivacyGateway.

Run:  python3 tests/test_gateway.py     (from python-package/)
      python3 python-package/tests/test_gateway.py  (from the repo root)

The invariant mirrors the MCP server's acceptance tests: no protect or
check_output result ever contains an original identifier value. (Release
results contain originals by definition - release is the explicit act.)
"""

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from redacta import (  # noqa: E402
    PrivacyGateway, GatewayError, SESSION_ERROR, guard_output,
)

passed = 0


def check(name, cond):
    global passed
    assert cond, "FAILED: " + name
    passed += 1


NOTE = ("DOB: 14/03/1952. NHS Number: 943 476 5919. "
        "Email: p.hartley@example.com. Tel: 0113 278 4532.")
SENSITIVE = ["14/03/1952", "943 476 5919", "p.hartley@example.com",
             "0113 278 4532"]


def norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


def no_sensitive(obj):
    flat = norm(repr(obj))
    return all(norm(v) not in flat for v in SENSITIVE)


# --- protect ----------------------------------------------------------------
g = PrivacyGateway()
p = g.protect(NOTE)
check("tokens in protected text", "[NHS_NUMBER_1]" in p.text and "[EMAIL_1]" in p.text)
check("opaque session id", re.fullmatch(r"rdx_[0-9a-f]{32}", p.session_id) is not None)
check("report counts", p.report.get("NHS_NUMBER") == 1)
check("no originals in protect result", no_sensitive(p))
check("no token map in protect result", "token_map" not in repr(p))

empty = g.protect("The quick brown fox.")
check("no session when nothing detected", empty.session_id is None)

# --- release ----------------------------------------------------------------
r = g.release("Patient [NHS_NUMBER_1] emailed from [EMAIL_1].", p.session_id)
check("release restores originals",
      r.text == "Patient 943 476 5919 emailed from p.hartley@example.com.")
check("release counts tokens", r.tokens_restored == 2 and r.changed)

# --- generic session errors ---------------------------------------------------
try:
    g.release("x", "rdx_" + "0" * 32)
    check("unknown session raises", False)
except GatewayError as e:
    check("unknown session raises generic error", str(e) == SESSION_ERROR)

g.discard_session(p.session_id)
try:
    g.release("x", p.session_id)
    check("discarded session raises", False)
except GatewayError as e:
    check("discarded session raises same error", str(e) == SESSION_ERROR)

# --- expiry (injectable clock) -----------------------------------------------
t = [1000.0]
g2 = PrivacyGateway(session_ttl_seconds=5, clock=lambda: t[0])
p2 = g2.protect(NOTE)
t[0] += 6
try:
    g2.release("x", p2.session_id)
    check("expired session raises", False)
except GatewayError as e:
    check("expired session raises same error", str(e) == SESSION_ERROR)
check("expired session swept", g2.session_count == 0)

# --- cap / eviction ------------------------------------------------------------
g3 = PrivacyGateway(max_sessions=2)
a = g3.protect("Email a@example.com")
b = g3.protect("Email b@example.com")
c = g3.protect("Email c@example.com")
try:
    g3.release("[EMAIL_1]", a.session_id)
    check("oldest session evicted at cap", False)
except GatewayError:
    check("oldest session evicted at cap", True)
check("newer sessions survive",
      g3.release("[EMAIL_1]", c.session_id).text == "c@example.com")

# --- output guard ---------------------------------------------------------------
g4 = PrivacyGateway()
p4 = g4.protect(NOTE)
out = g4.check_output("As discussed, 9434765919 rang from 0113-278-4532.", p4.session_id)
check("guard catches spacing/dash variants",
      not out["safe"] and "[NHS_NUMBER_1]" in out["sanitized_text"]
      and "[PHONE_1]" in out["sanitized_text"])
check("guard never echoes raw values", no_sensitive(out))
clean = g4.check_output("Patient [NHS_NUMBER_1] is stable.", p4.session_id)
check("clean output passes", clean["safe"] and clean["sanitized_text"] == "Patient [NHS_NUMBER_1] is stable.")

# --- standalone guard with courtesy-title stripping ----------------------------
sg = guard_output("patient PATRICIA HARTLEY seen",
                  {"[PATIENT_NAME_1]": "Mrs Patricia Hartley"})
check("standalone guard strips titles and is case-insensitive",
      not sg["safe"] and sg["sanitized_text"] == "patient [PATIENT_NAME_1] seen")

# --- safe harbor mode ------------------------------------------------------------
g5 = PrivacyGateway(safe_harbor=True)
p5 = g5.protect("Aged 91, clinic 20 March 2026.")
check("safe harbor gateway redacts ages and dates",
      "[AGE_1]" in p5.text and "[DATE_1]" in p5.text)

print("All %d checks passed." % passed)
