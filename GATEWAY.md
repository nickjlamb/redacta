# PrivacyGateway — the boundary as a library

**Status:** implemented · **Ships in:** `@pharmatools/redacta` 1.4.0 and `redacta` (PyPI) 1.4.0

## 1. What this is

The v2 MCP server proved out a protect → work-on-tokens → controlled-release
loop with the token map held behind a boundary. `PrivacyGateway` lifts that
loop into the libraries, so any TypeScript or Python application can run the
same flow in-process:

```ts
import { PrivacyGateway } from "@pharmatools/redacta";

const gateway = new PrivacyGateway({ categories: ["clinical", "general"] });

const protectedNote = gateway.protect(note);      // { text, sessionId, report, selfCheck }
const response = await agent.run(protectedNote.text);

const guard = gateway.checkOutput(response, protectedNote.sessionId!);
const released = gateway.release(guard.sanitizedText, protectedNote.sessionId!);
```

```python
from redacta import PrivacyGateway

gateway = PrivacyGateway()
protected = gateway.protect(note)
response = my_agent(protected.text)
released = gateway.release(response, protected.session_id)
```

## 2. Honesty about the trust model

An in-process library cannot *enforce* a boundary — the caller's process holds
the vault, so the caller can always reach in. What the gateway gives an
application is the same **discipline** the MCP server enforces: mappings never
travel with the text, restoration is an explicit act against a session, output
can be screened before release, and sessions expire. The docs say this
plainly: for enforcement against an untrusted consumer (an agent, a model),
put the process boundary in between — the MCP server, or a future HTTP
service wrapping this same class. The gateway is also exactly the core that
HTTP service (and any Kubernetes deployment of it) will wrap.

## 3. API surface (TypeScript; Python mirrors it in snake_case)

| Member | Behaviour |
|---|---|
| `new PrivacyGateway(opts?)` | `categories` (default clinical+general), `sessionTtlMs` (default 60 min), `maxSessions` (default 64), `idGenerator` (optional RNG override) |
| `protect(text)` | Redacts; stores the token map in an internal session; returns `{ text, sessionId, expiresAt, report, selfCheck }`. `sessionId` is `null` when nothing was detected (no session stored) |
| `release(text, sessionId)` | Restores originals from the session's map; returns `{ text, changed, tokensRestored }`. Throws `GatewayError("Unknown or expired session.")` on any failed lookup — one generic message, no probing |
| `checkOutput(text, sessionId)` | Verbatim-leak scan (spacing/dash/case tolerant for identifier-like values, courtesy-title-stripped variants for names); returns `{ safe, leaks: [{token, category}], sanitizedText }` — never echoes raw values |
| `discardSession(sessionId)` | Idempotent early deletion |
| `sessionCount` | Live session count (post-sweep) |

`guardOutput(text, tokenMap)` is also exported standalone, for callers who
manage their own maps (e.g. the legacy redact flow).

## 4. Environment constraints (why the code looks the way it does)

`@pharmatools/redacta` is dependency-free and runs in Node, browsers, and
bare JavaScriptCore on iOS. Therefore the gateway uses **no Node APIs**:
session IDs come from `globalThis.crypto.getRandomValues` when available
(Node ≥ 19, all browsers), with an injectable `idGenerator` for other hosts;
if neither exists, session creation throws with a clear message. Nothing
touches crypto at module load, so the iOS engine bundle is unaffected.

## 5. What moves where

- `guard.ts` logic (leak scan) moves INTO the engine package — it is pure
  string work and belongs beside the detector.
- Session semantics (opaque `rdx_` IDs, TTL, cap with oldest-first eviction,
  sweep-on-access, generic errors) are reimplemented dependency-free.
- File release, audit sinks, and release-mode policy do NOT move — they are
  Node/host concerns and stay in the MCP server.
- Follow-up (separate commit, after 1.4.0 publishes): refactor the MCP
  server's `Boundary` to consume `PrivacyGateway` + engine `guardOutput`,
  deleting its private copies. Sequenced second so CI (which installs the
  published engine) never breaks.

## 6. Versioning

Engine 1.3.0 → **1.4.0** (additive; no breaking changes), PyPI 1.3.0 →
**1.4.0**. The iOS bundle, CLI and plugins are untouched. `redacta-mcp`
bumps its engine range and drops its private session/guard code in the
follow-up (→ 2.1.0).
