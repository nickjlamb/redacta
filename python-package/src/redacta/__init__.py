"""
Redacta — pseudonymise patient identifiers and PII in text, and restore them.

Deterministic pattern engine: replaces fixed-format identifiers (NHS numbers with
Modulus-11 validation, UK National Insurance numbers, dates of birth, UK
postcodes, US SSN/ZIP, hospital/MRN numbers, emails, phone numbers) with labelled
tokens, and reverses the process from a token map.

Names, addresses and identifying ages need contextual judgement and are out of
scope for this deterministic library — the Redacta agent skill handles those with
LLM reasoning (https://clawhub.ai/nickjlamb/redacta).

Quick start:

    >>> from redacta import redact, reinstate
    >>> redacted, report, token_map = redact("NHS Number: 943 476 5919")
    >>> redacted
    'NHS Number: [NHS_NUMBER_1]'
    >>> reinstate(redacted, token_map)
    'NHS Number: 943 476 5919'
"""

from .structured import (
    redact_structured,
    self_check,
    is_valid_nhs,
    is_valid_ni,
    is_valid_luhn,
)
from .reinstate import reinstate as _reinstate, load_token_map

__version__ = "1.2.0"

__all__ = [
    "redact",
    "redact_structured",
    "reinstate",
    "self_check",
    "load_token_map",
    "is_valid_nhs",
    "is_valid_ni",
    "is_valid_luhn",
    "__version__",
]


def redact(text, safe_harbor=False):
    """Redact identifiers in ``text``.

    Returns a tuple ``(redacted_text, report, token_map)`` where ``report`` maps
    each token type to a count of distinct values and ``token_map`` maps each
    token back to its original value (for re-identification).

    Pass ``safe_harbor=True`` for the stricter HIPAA Safe Harbor pass: all dates
    (not just DOB), specific ages, and fax / licence / device / VIN / health-plan
    numbers, on top of the default clinical + general detection.
    """
    return redact_structured(text, safe_harbor=safe_harbor)


def reinstate(text, token_map):
    """Restore original values in ``text`` from ``token_map``.

    Returns the re-identified text. ``token_map`` may be a bare mapping, or the
    full object produced by :func:`redact` / the CLI (with a ``token_map`` key).
    """
    if isinstance(token_map, dict) and isinstance(token_map.get("token_map"), dict):
        token_map = token_map["token_map"]
    restored, _changed = _reinstate(text, token_map)
    return restored
