#!/usr/bin/env python3
"""
Redacta - deterministic redaction engine.

Detects identifiers in text and replaces each distinct value with a numbered,
labelled token. Ported from / kept in step with the TypeScript engine
(@pharmatools/redacta).

Modes:
    default       - clinical + general PII: NHS (Modulus-11), NI, SSN, DOB,
                    MRN, postcodes, ZIP, emails, phones, plus URLs, IPs,
                    Luhn-validated cards, IBANs, account numbers, vehicle regs,
                    and keyword-anchored patient / relative / carer names
                    (clinician names preserved).
    safe_harbor   - the above PLUS, for HIPAA Safe Harbor: ALL dates (not just
                    DOB), specific ages, fax, certificate/licence, device serial,
                    VIN and health-plan numbers.

Usage:
    python3 structured.py input.txt              # read a file
    python3 structured.py < input.txt            # read stdin
    python3 structured.py input.txt --text-only
    python3 structured.py input.txt --safe-harbor

Default output is JSON on stdout with three keys:
    redacted_text  - the text with identifiers tokenised
    report         - {token_type: number_of_distinct_values}
    token_map      - {token: original_value}  (for review / re-identification)

Standard library only. No network access; all processing is local.
"""

import argparse
import json
import re
import sys


# ---------------------------------------------------------------------------
# Validators
# ---------------------------------------------------------------------------

def is_valid_nhs(digits):
    """Validate a 10-digit NHS number using the Modulus-11 check digit."""
    if len(digits) != 10 or not digits.isdigit():
        return False
    if digits == digits[0] * 10:                 # all-same-digit is invalid
        return False
    weights = [10, 9, 8, 7, 6, 5, 4, 3, 2]
    total = sum(int(d) * w for d, w in zip(digits[:9], weights))
    check = 11 - (total % 11)
    if check == 11:
        check = 0
    if check == 10:
        return False
    return check == int(digits[9])


_NI_INVALID_PREFIX = {"BG", "GB", "NK", "KN", "TN", "NT", "ZZ"}
_NI_PREFIX1_BAD = set("DFIQUV")
_NI_PREFIX2_BAD = set("DFIOQUV")


def is_valid_ni(prefix):
    """Validate the two-letter prefix of a UK National Insurance number."""
    prefix = prefix.upper()
    if len(prefix) != 2 or prefix in _NI_INVALID_PREFIX:
        return False
    return prefix[0] not in _NI_PREFIX1_BAD and prefix[1] not in _NI_PREFIX2_BAD


def is_valid_luhn(digits):
    """Luhn checksum for payment card numbers."""
    if not re.fullmatch(r"\d{13,19}", digits or ""):
        return False
    total, dbl = 0, False
    for ch in reversed(digits):
        d = int(ch)
        if dbl:
            d *= 2
            if d > 9:
                d -= 9
        total += d
        dbl = not dbl
    return total % 10 == 0


# ---------------------------------------------------------------------------
# Token allocation: same value -> same token, distinct values -> new numbers
# ---------------------------------------------------------------------------

class Tokeniser:
    def __init__(self):
        self._by_key = {}
        self._counters = {}
        self.token_map = {}

    def token_for(self, type_name, original, key=None):
        k = (type_name, key if key is not None else original)
        if k in self._by_key:
            return self._by_key[k]
        self._counters[type_name] = self._counters.get(type_name, 0) + 1
        token = "[%s_%d]" % (type_name, self._counters[type_name])
        self._by_key[k] = token
        self.token_map[token] = original
        return token


# ---------------------------------------------------------------------------
# Patterns
# ---------------------------------------------------------------------------

_MONTHS = ("January|February|March|April|May|June|July|August|September|"
           "October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|"
           "Oct|Nov|Dec")

_DATE = "(?:%s)" % "|".join([
    r"\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}",
    r"\d{4}-\d{2}-\d{2}",
    r"\d{1,2}(?:st|nd|rd|th)?\s+(?:%s)\s+\d{4}" % _MONTHS,
    r"(?:%s)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}" % _MONTHS,
])

_DOB_RE = re.compile(
    r"(?P<kw>\b(?:date\s+of\s+birth|d\.?o\.?b\.?|born(?:\s+on)?)[\s:.]*)"
    r"(?P<date>%s)" % _DATE, re.IGNORECASE)

_NHS_RE = re.compile(r"\b(\d{3}[\s\-]?\d{3}[\s\-]?\d{4})\b")

_NI_RE = re.compile(
    r"\b([A-Za-z]{2})\s?(\d{2})\s?(\d{2})\s?(\d{2})\s?([A-Da-d])\b")

_SSN_FMT_RE = re.compile(
    r"(?<!\d)(?!000|666|9\d\d)(\d{3})([\-\s])(\d{2})\2(\d{4})(?!\d)")
_SSN_KW_RE = re.compile(
    r"(?P<kw>(?:SSN|Social\s*Security(?:\s*(?:Number|No\.?|#))?)[\s:]*)"
    r"(?P<num>(?!000|666|9\d\d)\d{9})(?!\d)", re.IGNORECASE)

_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")

_MRN_RE = re.compile(
    r"(?P<kw>(?:MRN|Hospital\s*(?:No\.?|Number)|Hosp\.?\s*(?:No\.?|Number)|"
    r"Patient\s*ID|Unit\s*(?:No\.?|Number))[\s:]*)(?P<id>[A-Z0-9\-]{4,15})",
    re.IGNORECASE)

_POSTCODE_RE = re.compile(
    r"\b(GIR\s?0AA|[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\b", re.IGNORECASE)

_US_STATES = ("AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|"
              "MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|"
              "TX|UT|VT|VA|WA|WV|WI|WY|DC")
_ZIP_KW_RE = re.compile(
    r"(?P<kw>(?:ZIP|Zip\s*Code|Postal\s*Code)[\s:]*)"
    r"(?P<zip>\d{5}(?:-\d{4})?)(?!\d)", re.IGNORECASE)
_ZIP_STATE_RE = re.compile(
    r"(?P<pre>(?:,?\s)(?:%s)\s+)(?P<zip>\d{5}(?:-\d{4})?)(?!\d)" % _US_STATES)

# --- General PII ----------------------------------------------------------
_URL_RE = re.compile(r"\b(?:https?://|www\.)[^\s<>\"'\])]+", re.IGNORECASE)
_IP_RE = re.compile(
    r"\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b")
_CARD_RE = re.compile(r"(?<![\d-])(?:\d[ -]?){12,18}\d(?![\d-])")
_IBAN_RE = re.compile(r"\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,3})?\b")
_ACCOUNT_RE = re.compile(
    r"((?:Account|Acct\.?|Member\s*ID|Policy\s*(?:No\.?|Number)|Insurance\s*ID)"
    r"\s*(?:No\.?|Number|#)?[\s:]*)((?=[A-Z0-9-]*\d)[A-Z0-9-]{5,17})",
    re.IGNORECASE)
_PLATE_RE = re.compile(r"\b[A-Z]{2}\d{2}\s?[A-Z]{3}\b")

# --- Names (keyword-anchored) ---------------------------------------------
_NAME = (r"[A-Z][a-z]+(?:['’\-][A-Za-z]+)?"
         r"(?:[ \t]+[A-Z][a-z]+(?:['’\-][A-Za-z]+)?){0,2}")
_STRICT_NAME_RE = re.compile("^" + _NAME)
_COURTESY = "Mr|Mrs|Ms|Miss|Mx"
_CLINICAL_TITLE = ("Dr|Doctor|Prof|Professor|Consultant|Nurse|Sister|Matron|"
                   "Surgeon|Registrar")
_NAME_TITLE_RE = re.compile(r"\b(?:%s)\.?\s+(%s)" % (_COURTESY, _NAME))
_NAME_SALUTATION_RE = re.compile(
    r"\b(Dear)\s+(?!(?:%s)\b)(%s)" % (_CLINICAL_TITLE, _NAME))
_NAME_LABEL_RE = re.compile(
    r"\b((?:Patient(?:\s+Name)?|Name|Client|Re)\s*[:\-]\s*)(%s)" % _NAME,
    re.IGNORECASE)
_RELATION = ("daughter|son|wife|husband|partner|spouse|mother|father|mum|mom|"
             "dad|sister|brother|sibling|grandson|granddaughter|grandmother|"
             "grandfather|grandparent|aunt|uncle|niece|nephew|cousin|carer|"
             "caregiver|guardian|parent|next\\s+of\\s+kin|nok|relative|widow|"
             "widower")
_RELATIVE_NAME_RE = re.compile(
    r"\b(%s)([:,\-]?[ \t]+)(%s)" % (_RELATION, _NAME), re.IGNORECASE)


def _leading_name(s):
    """Trim a loosely-captured name to its leading run of capitalised words."""
    m = _STRICT_NAME_RE.match(s)
    if not m:
        return None
    return m.group(0), s[m.end():]


# --- Safe Harbor extras (HIPAA 164.514(b)(2)) -----------------------------
_ANY_DATE_RE = re.compile(_DATE)
_AGE_PHRASE_RE = re.compile(
    r"\b\d{1,3}[\s-]?(?:years?[\s-]?old|y/?o)\b", re.IGNORECASE)
_AGE_LABEL_RE = re.compile(r"\b(aged|age)([:\s]+)(\d{1,3})\b", re.IGNORECASE)
_FAX_RE = re.compile(
    r"\b(fax(?:\s*(?:no\.?|number|#))?[:\s]+)(\+?[\d(][\d().\s\-]{6,}\d)",
    re.IGNORECASE)
_LICENSE_RE = re.compile(
    r"\b((?:licen[cs]e|certificate|cert\.?|registration)\s*(?:no\.?|number|#)?"
    r"[:\s]+)([A-Z0-9][A-Z0-9\-]{3,})", re.IGNORECASE)
_DEVICE_RE = re.compile(
    r"\b((?:serial|device\s*(?:id|identifier|no\.?|number)|imei)\s*"
    r"(?:no\.?|number|#)?[:\s]+)([A-Z0-9][A-Z0-9\-]{4,})", re.IGNORECASE)
_VIN_RE = re.compile(r"\b[A-HJ-NPR-Z0-9]{17}\b")
_HEALTH_PLAN_RE = re.compile(
    r"\b((?:health\s*plan|beneficiary|medicare|medicaid)\s*(?:id|no\.?|number|#)?"
    r"[:\s]+)([A-Z0-9][A-Z0-9\-]{4,})", re.IGNORECASE)


# ---------------------------------------------------------------------------
# Redaction passes
# ---------------------------------------------------------------------------

def _digits(s):
    return re.sub(r"\D", "", s)


def redact_mrn(text, tok):
    return _MRN_RE.sub(
        lambda m: m.group("kw") + tok.token_for(
            "MRN", m.group("id"), key=m.group("id").upper()), text)


def redact_nhs(text, tok):
    def repl(m):
        raw = m.group(1)
        d = _digits(raw)
        if len(d) == 10 and is_valid_nhs(d):
            return tok.token_for("NHS_NUMBER", raw, key=d)
        return raw
    return _NHS_RE.sub(repl, text)


def redact_ni(text, tok):
    def repl(m):
        if not is_valid_ni(m.group(1)):
            return m.group(0)
        key = (m.group(1) + m.group(2) + m.group(3) + m.group(4)
               + m.group(5)).upper()
        return tok.token_for("NI_NUMBER", m.group(0).strip(), key=key)
    return _NI_RE.sub(repl, text)


def redact_ssn(text, tok):
    def fmt(m):
        if m.group(3) == "00" or m.group(4) == "0000":
            return m.group(0)
        key = m.group(1) + m.group(3) + m.group(4)
        return tok.token_for("SSN", m.group(0), key=key)
    text = _SSN_FMT_RE.sub(fmt, text)

    def kw(m):
        d = m.group("num")
        if d[3:5] == "00" or d[5:9] == "0000":
            return m.group(0)
        return m.group("kw") + tok.token_for("SSN", d, key=d)
    return _SSN_KW_RE.sub(kw, text)


def redact_email(text, tok):
    return _EMAIL_RE.sub(
        lambda m: tok.token_for("EMAIL", m.group(0), key=m.group(0).lower()),
        text)


def redact_phone(text, tok):
    def mk(m):
        return tok.token_for("PHONE", m.group(0).strip(), key=_digits(m.group(0)))

    text = re.sub(
        r"(?<!\d)\+44[\s\-]?(?:\(0\))?[\s\-]?\d{2,5}[\s\-]?\d{3,4}[\s\-]?\d{3,4}(?!\d)",
        mk, text)
    text = re.sub(
        r"(?<!\d)\+1[\s\-.]?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}(?!\d)",
        mk, text)

    def uk(m):
        if 10 <= len(_digits(m.group(0))) <= 11:
            return mk(m)
        return m.group(0)
    text = re.sub(
        r"(?<!\d)\(?0\d{2,4}\)?[\s\-]?\d{3,4}[\s\-]?\d{3,4}(?!\d)", uk, text)

    text = re.sub(
        r"(?<!\d)\(?[2-9]\d{2}\)?[\s\-.][2-9]\d{2}[\s\-.]\d{4}(?!\d)", mk, text)
    return text


def redact_postcode(text, tok):
    def repl(m):
        clean = re.sub(r"\s", "", m.group(0))
        if 5 <= len(clean) <= 7:
            return tok.token_for("POSTCODE", m.group(0), key=clean.upper())
        return m.group(0)
    return _POSTCODE_RE.sub(repl, text)


def redact_zip(text, tok):
    text = _ZIP_KW_RE.sub(
        lambda m: m.group("kw") + tok.token_for("ZIP", m.group("zip")), text)
    text = _ZIP_STATE_RE.sub(
        lambda m: m.group("pre") + tok.token_for("ZIP", m.group("zip")), text)
    return text


def redact_dob(text, tok):
    return _DOB_RE.sub(
        lambda m: m.group("kw") + tok.token_for(
            "DATE_OF_BIRTH", m.group("date")), text)


def redact_account(text, tok):
    return _ACCOUNT_RE.sub(
        lambda m: m.group(1) + tok.token_for(
            "ACCOUNT_NUMBER", m.group(2), key=m.group(2).upper()), text)


def redact_card(text, tok):
    def repl(m):
        d = _digits(m.group(0))
        if 13 <= len(d) <= 19 and is_valid_luhn(d):
            return tok.token_for("CARD_NUMBER", m.group(0).strip(), key=d)
        return m.group(0)
    return _CARD_RE.sub(repl, text)


def redact_iban(text, tok):
    def repl(m):
        clean = re.sub(r"\s", "", m.group(0))
        if 15 <= len(clean) <= 34:
            return tok.token_for("IBAN", m.group(0), key=clean.upper())
        return m.group(0)
    return _IBAN_RE.sub(repl, text)


def redact_url(text, tok):
    return _URL_RE.sub(
        lambda m: tok.token_for("URL", m.group(0), key=m.group(0).lower()), text)


def redact_ip(text, tok):
    return _IP_RE.sub(lambda m: tok.token_for("IP_ADDRESS", m.group(0)), text)


def redact_plate(text, tok):
    return _PLATE_RE.sub(
        lambda m: tok.token_for(
            "VEHICLE_REG", m.group(0),
            key=re.sub(r"\s", "", m.group(0)).upper()), text)


def redact_relative(text, tok):
    def repl(m):
        rel, sep, name = m.group(1), m.group(2), m.group(3)
        split = _leading_name(name)
        if not split:
            return m.group(0)
        nm, rest = split
        return rel + sep + tok.token_for(
            "RELATIVE_NAME", nm, key=nm.lower()) + rest
    return _RELATIVE_NAME_RE.sub(repl, text)


def redact_name(text, tok):
    def key_for(raw):
        return " ".join(raw.strip().lower().split())

    # Courtesy-titled names: store the full match (title + name), key on name.
    text = _NAME_TITLE_RE.sub(
        lambda m: tok.token_for(
            "PATIENT_NAME", m.group(0).strip(), key=key_for(m.group(1))), text)

    # Salutations (case-sensitive, so no over-capture trim needed).
    text = _NAME_SALUTATION_RE.sub(
        lambda m: "%s %s" % (
            m.group(1),
            tok.token_for("PATIENT_NAME", m.group(2).strip(),
                          key=key_for(m.group(2)))), text)

    # Labelled names (case-insensitive label -> trim the captured name).
    def label_repl(m):
        split = _leading_name(m.group(2))
        if not split:
            return m.group(0)
        nm, rest = split
        return m.group(1) + tok.token_for(
            "PATIENT_NAME", nm.strip(), key=key_for(nm)) + rest
    return _NAME_LABEL_RE.sub(label_repl, text)


# --- Safe Harbor passes ---------------------------------------------------

def redact_all_dates(text, tok):
    return _ANY_DATE_RE.sub(lambda m: tok.token_for("DATE", m.group(0)), text)


def redact_age(text, tok):
    text = _AGE_PHRASE_RE.sub(
        lambda m: tok.token_for("AGE", m.group(0).strip(),
                                key=_digits(m.group(0))), text)
    text = _AGE_LABEL_RE.sub(
        lambda m: m.group(1) + m.group(2) + tok.token_for("AGE", m.group(3)),
        text)
    return text


def redact_fax(text, tok):
    return _FAX_RE.sub(
        lambda m: m.group(1) + tok.token_for(
            "FAX", m.group(2).strip(), key=_digits(m.group(2))), text)


def redact_license(text, tok):
    return _LICENSE_RE.sub(
        lambda m: m.group(1) + tok.token_for(
            "LICENSE", m.group(2), key=m.group(2).upper()), text)


def redact_device(text, tok):
    return _DEVICE_RE.sub(
        lambda m: m.group(1) + tok.token_for(
            "DEVICE_ID", m.group(2), key=m.group(2).upper()), text)


def redact_vin(text, tok):
    def repl(m):
        v = m.group(0)
        if not re.search(r"\d", v) or not re.search(r"[A-Z]", v):
            return v
        return tok.token_for("VIN", v, key=v.upper())
    return _VIN_RE.sub(repl, text)


def redact_health_plan(text, tok):
    return _HEALTH_PLAN_RE.sub(
        lambda m: m.group(1) + tok.token_for(
            "HEALTH_PLAN_NUMBER", m.group(2), key=m.group(2).upper()), text)


# ---------------------------------------------------------------------------
# Composition
# ---------------------------------------------------------------------------

# Order matters: keyword-anchored / checksum-validated first, weaker heuristics
# last, so high-confidence matches win any overlap.
_DEFAULT_PASSES = [
    redact_mrn, redact_dob, redact_nhs, redact_ni, redact_ssn, redact_email,
    redact_phone, redact_postcode, redact_zip, redact_relative, redact_name,
    redact_account, redact_card, redact_iban, redact_url, redact_ip,
    redact_plate,
]
# redact_fax runs before redact_phone (keyword-anchored, avoids [PHONE] theft);
# redact_all_dates runs last so keyword DOBs are already [DATE_OF_BIRTH].
_SAFE_HARBOR_POST = [
    redact_age, redact_license, redact_device, redact_vin, redact_health_plan,
    redact_all_dates,
]


def redact_structured(text, safe_harbor=False):
    """Run every pass and return (redacted_text, report, token_map)."""
    for ch in (" ", " ", " "):
        text = text.replace(ch, " ")

    tok = Tokeniser()
    passes = ([redact_fax] if safe_harbor else []) + list(_DEFAULT_PASSES)
    if safe_harbor:
        passes += _SAFE_HARBOR_POST
    for fn in passes:
        text = fn(text, tok)

    report = {}
    for token in tok.token_map:
        type_name = token.strip("[]").rsplit("_", 1)[0]
        report[type_name] = report.get(type_name, 0) + 1
    return text, report, tok.token_map


# ---------------------------------------------------------------------------
# Self-check
# ---------------------------------------------------------------------------

_RESIDUAL_CHECKS = [
    ("long number (10+ digits)", re.compile(r"(?<![\d-])\d[\d\s-]{8,}\d(?![\d-])")),
    ("email address", re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")),
    ("UK postcode", re.compile(r"\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b", re.IGNORECASE)),
    ("URL", re.compile(r"\b(?:https?://|www\.)\S+", re.IGNORECASE)),
]
_TOKEN_RE = re.compile(r"^\[[A-Z_]+_\d+\]$")


def self_check(redacted_text):
    """Re-scan already-redacted text for things that still look like identifiers.

    Returns a list of {"label", "sample"} dicts — a second pair of eyes, not a
    guarantee. Redacta's own tokens are ignored.
    """
    seen = set()
    findings = []
    for label, rx in _RESIDUAL_CHECKS:
        for m in rx.finditer(redacted_text):
            sample = m.group(0).strip()
            if _TOKEN_RE.match(sample):
                continue
            k = (label, sample.lower())
            if k in seen:
                continue
            seen.add(k)
            findings.append({"label": label, "sample": sample})
            if len(findings) >= 20:
                return findings
    return findings


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(
        description="Redacta deterministic redaction engine.")
    ap.add_argument("file", nargs="?",
                    help="input file; reads stdin if omitted")
    ap.add_argument("--text-only", action="store_true",
                    help="print only the redacted text (no JSON)")
    ap.add_argument("--safe-harbor", action="store_true",
                    help="stricter HIPAA Safe Harbor pass (all dates, ages, "
                         "fax, licence, device, VIN, health-plan numbers)")
    args = ap.parse_args()

    if args.file:
        with open(args.file, encoding="utf-8") as fh:
            raw = fh.read()
    else:
        raw = sys.stdin.read()

    redacted, report, token_map = redact_structured(
        raw, safe_harbor=args.safe_harbor)

    if args.text_only:
        sys.stdout.write(redacted)
        if not redacted.endswith("\n"):
            sys.stdout.write("\n")
        return

    json.dump({"redacted_text": redacted, "report": report,
               "token_map": token_map},
              sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
