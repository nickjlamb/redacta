"""PrivacyGateway - the protect -> work-on-tokens -> controlled-release loop
as a library, mirroring the TypeScript gateway in @pharmatools/redacta and the
discipline the Redacta MCP server enforces.

Honesty about the trust model: an in-process library cannot ENFORCE a
boundary - the caller's process holds the sessions. What it provides is the
same discipline: mappings never travel with the text, restoration is an
explicit act against an expiring session, and output can be screened before
release. For enforcement against an untrusted consumer, put a process
boundary in between (the Redacta MCP server, or a service wrapping this
class).

Standard library only. No network access; all processing is local.
"""

import re
import secrets
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Optional

from .structured import redact_structured, self_check
from .reinstate import reinstate as _reinstate

#: The single generic error message for any failed session lookup.
SESSION_ERROR = "Unknown or expired session."


class GatewayError(Exception):
    pass


# ---------------------------------------------------------------------------
# Output guard (also usable standalone)
# ---------------------------------------------------------------------------

_TOKEN_TYPE_RE = re.compile(r"^\[([A-Z_]+)_\d+\]$")
_TITLE_RE = re.compile(r"^(?:Mr|Mrs|Ms|Miss|Mx)\.?\s+", re.IGNORECASE)


def _category_of(token):
    m = _TOKEN_TYPE_RE.match(token)
    return m.group(1) if m else "UNKNOWN"


def _matcher_for(original):
    """Values containing digits get spacing/dash tolerance between characters
    ("943 476 5919" also matches "9434765919"); text values match
    case-insensitively as written."""
    if re.search(r"\d", original):
        chars = re.sub(r"[^A-Za-z0-9@._]", "", original)
        if len(chars) >= 4:
            body = r"[\s\-]*".join(re.escape(c) for c in chars)
            return re.compile(
                r"(?<![A-Za-z0-9])%s(?![A-Za-z0-9])" % body, re.IGNORECASE)
    return re.compile(
        r"(?<![A-Za-z0-9])%s(?![A-Za-z0-9])" % re.escape(original),
        re.IGNORECASE)


def _candidates_for(original):
    """The engine stores some names with a courtesy title ("Mrs Patricia
    Hartley"); a model may reproduce the name without it."""
    out = [original]
    stripped = _TITLE_RE.sub("", original)
    if stripped != original and len(stripped) >= 3:
        out.append(stripped)
    return out


def guard_output(text, token_map):
    """Scan text for verbatim reappearance of original values from a token map
    and re-tokenise anything found. Verbatim (with spacing/case tolerance)
    only - paraphrase and inference are out of scope. Never echoes raw values.

    Returns a dict: {"safe": bool, "leaks": [{"token", "category"}, ...],
    "sanitized_text": str}.
    """
    leaks = []
    out = text
    for token, original in sorted(
            token_map.items(), key=lambda kv: -len(kv[1] or "")):
        if not original:
            continue
        leaked = False
        for candidate in _candidates_for(original):
            rx = _matcher_for(candidate)
            if rx.search(out):
                out = rx.sub(token, out)
                leaked = True
        if leaked:
            leaks.append({"token": token, "category": _category_of(token)})
    return {"safe": not leaks, "leaks": leaks, "sanitized_text": out}


# ---------------------------------------------------------------------------
# PrivacyGateway
# ---------------------------------------------------------------------------

@dataclass
class ProtectResult:
    text: str
    session_id: Optional[str]
    expires_at: Optional[float]
    report: dict = field(default_factory=dict)
    self_check: list = field(default_factory=list)


@dataclass
class ReleaseResult:
    text: str
    changed: bool
    tokens_restored: int


class PrivacyGateway:
    """In-process privacy gateway over the deterministic Redacta engine.

    >>> gateway = PrivacyGateway()
    >>> protected = gateway.protect("NHS Number: 943 476 5919")
    >>> "[NHS_NUMBER_1]" in protected.text
    True
    >>> gateway.release("[NHS_NUMBER_1]", protected.session_id).text
    '943 476 5919'
    """

    def __init__(self, safe_harbor=False, session_ttl_seconds=3600,
                 max_sessions=64, clock=time.monotonic):
        self._safe_harbor = safe_harbor
        self._ttl = session_ttl_seconds
        self._max = max_sessions
        self._clock = clock
        self._sessions = OrderedDict()  # id -> (token_map, expires_at)

    def _sweep(self):
        now = self._clock()
        for sid in [s for s, (_m, exp) in self._sessions.items() if exp <= now]:
            del self._sessions[sid]

    def _require(self, session_id):
        self._sweep()
        entry = self._sessions.get(session_id) if isinstance(session_id, str) else None
        if entry is None:
            raise GatewayError(SESSION_ERROR)
        return entry[0]

    def protect(self, text):
        """Redact text; the token map stays inside the gateway's sessions."""
        redacted, report, token_map = redact_structured(
            text, safe_harbor=self._safe_harbor)
        residual = self_check(redacted)
        session_id = None
        expires_at = None
        if token_map:
            self._sweep()
            while len(self._sessions) >= self._max:
                self._sessions.popitem(last=False)  # evict oldest
            session_id = "rdx_" + secrets.token_hex(16)
            expires_at = self._clock() + self._ttl
            self._sessions[session_id] = (dict(token_map), expires_at)
        return ProtectResult(text=redacted, session_id=session_id,
                             expires_at=expires_at, report=report,
                             self_check=residual)

    def release(self, text, session_id):
        """Restore originals from the session's map.

        Raises GatewayError with one generic message on ANY failed lookup.
        """
        token_map = self._require(session_id)
        restored_count = sum(1 for t in token_map if t in text)
        restored, changed = _reinstate(text, token_map)
        return ReleaseResult(text=restored, changed=changed,
                             tokens_restored=restored_count)

    def check_output(self, text, session_id):
        """Verbatim-leak scan against the session's originals."""
        token_map = self._require(session_id)
        return guard_output(text, token_map)

    def discard_session(self, session_id):
        """Idempotent early deletion of a session's mapping."""
        self._sessions.pop(session_id, None)
        self._sweep()

    @property
    def session_count(self):
        self._sweep()
        return len(self._sessions)
