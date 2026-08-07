# Redacta MCP v2 — the stateful privacy boundary

**Status:** implemented (vertical slice) · **Target:** `redacta-mcp` 2.0.0

## 1. Problem

In v1.x, the `redact` tool returns the `token_map` in the tool result. MCP tool
results are appended to the model's context, so the agent Redacta is protecting
the data *from* is handed the key that reverses the redaction. The strongest
privacy claim Redacta can make — *identity mappings never enter the agent's
context* — is not true of the current server.

## 2. Design

The server becomes a **stateful boundary**. Mappings live inside the server
process; the client only ever sees redacted text and an opaque session ID.

```text
protect(text)                       release_to_file(text, session_id)
  ├─ redact                           ├─ look up session (generic error if
  ├─ store token map in session       │  unknown/expired — no enumeration)
  │  (server memory only)             ├─ restore tokens from the session map
  └─ return redacted text             ├─ atomic write, 0600, generated name,
     + session_id + report            │  inside the allowlisted release dir
     (NO token map, NO originals)     └─ return a receipt (path + counts —
                                         NO restored content)
```

Restoration necessarily re-exposes originals to *someone*; the design makes
**where** explicit:

- **`release_to_file` (default).** Restored text is written server-side to a
  directory the operator configured (`REDACTA_RELEASE_DIR`). The tool result is
  a receipt only, so restored PHI never enters the MCP client or model context.
- **`release_to_client` (opt-in, `REDACTA_RELEASE=client|both`).** Returns the
  restored text in the tool result, for trusted environments. Its description
  carries a prominent warning that restored PHI will enter the client and
  potentially the model context.
- **`REDACTA_RELEASE=off`.** No release tools are registered at all; sessions
  are protect-only and expire.

## 3. Tools

| Tool | In | Out | Notes |
|---|---|---|---|
| `protect` | `text`, `categories?` | `text`, `session_id`, `expires_at`, `report`, `self_check` | Never contains the token map or any original value |
| `release_to_file` | `text`, `session_id` | `file`, `tokens_restored`, `changed`, `bytes` | Receipt only; registered unless `REDACTA_RELEASE` is `client`/`off` |
| `release_to_client` | `text`, `session_id` | `text`, `changed`, `warning` | Only when `REDACTA_RELEASE=client\|both` |
| `check_output` | `text`, `session_id` | `safe`, `leaks[{token,category}]`, `sanitized_text`, `self_check` | Scans model output for verbatim reappearance of session originals (spacing/case-tolerant for numeric identifiers); re-tokenises what it finds; **never echoes raw values** |
| `discard_session` | `session_id` | `discarded` | Idempotent early cleanup |
| `redact`, `reinstate`, `self_check` | *(unchanged)* | *(unchanged)* | **Legacy**, kept for backward compatibility; descriptions now warn that the token map enters the client context and point to `protect`. Hidden with `REDACTA_LEGACY_TOOLS=0` |

## 4. Session lifecycle

```ts
interface Session {
  id: string;          // "rdx_" + 32 hex chars, crypto.randomBytes(16)
  tokenMap: Record<string, string>;
  categories: Category[];
  createdAt: number;
  expiresAt: number;   // createdAt + TTL (REDACTA_SESSION_TTL_MINUTES, default 60)
}
```

- In-memory `Map`, capped at `REDACTA_MAX_SESSIONS` (default 64); expired
  sessions are swept on every store access; at the cap, the oldest session is
  evicted.
- Every lookup failure — unknown, expired, evicted — returns the same generic
  `"Unknown or expired session."` error (no enumeration, no timing oracle worth
  the name at this scale).
- `protect` on text with **no** detected identifiers returns `session_id: null`
  and stores nothing.
- **Restart semantics (documented limitation):** stdio MCP servers live per
  client app session; a server restart discards all sessions and the mapping is
  gone. That is the safe failure direction. Users who need durable round-trips
  use the legacy tools, the CLI, or a future encrypted vault (deferred).

## 5. File release safety

- Path = `REDACTA_RELEASE_DIR` + a **generated** filename
  (`redacta-release-<UTC timestamp>-<6 hex>.txt`). The client cannot influence
  the path — traversal is excluded by construction, and the resolved path is
  still verified to sit inside the realpath of the release dir.
- Write to a `.tmp` sibling with `O_EXCL` and mode `0600`, then `rename()`
  (atomic on the same filesystem). The directory must already exist — the
  server never creates PHI destinations implicitly.
- Filenames, receipts, errors and audit events contain no PHI.

## 6. Audit trail

Enabled by setting `REDACTA_AUDIT_LOG=<path>.jsonl`; off otherwise. One line
per event (`protect`, `release_file`, `release_client`, `release_denied`,
`check_output`, `discard`):

```json
{"ts":"2026-08-06T21:05:00Z","event":"protect","session":"e28c1a9b04d7",
 "categories":{"NHS_NUMBER":1,"EMAIL":1},"status":"ok"}
```

`session` is the first 12 hex chars of SHA-256(session_id). Audit lines never
contain source text, token maps, detected values, full session IDs, restored
output, or file contents. Audit write failures never block the operation.

## 7. Configuration summary

| Env var | Default | Meaning |
|---|---|---|
| `REDACTA_RELEASE` | `file` | `file` \| `client` \| `both` \| `off` |
| `REDACTA_RELEASE_DIR` | *(unset)* | Allowlisted dir for `release_to_file`; the tool errors with setup instructions if unset |
| `REDACTA_SESSION_TTL_MINUTES` | `60` | Session lifetime |
| `REDACTA_MAX_SESSIONS` | `64` | Session cap (oldest evicted) |
| `REDACTA_AUDIT_LOG` | *(unset)* | JSONL audit sink path |
| `REDACTA_LEGACY_TOOLS` | `1` | `0` hides `redact`/`reinstate`/`self_check` |

## 8. Migration & compatibility

- **2.0.0.** Legacy tools keep their exact v1 schemas and behaviour, so no
  existing client breaks; the major bump marks the repositioning and the new
  default story. README, Directory listing and `manifest.json` copy move to
  `protect`/`release_to_file` as the featured flow.
- The `@pharmatools/redacta` engine, Python package, CLI, iOS app and plugins
  are untouched — this change is confined to the MCP server, where the process
  boundary makes enforcement real.

## 9. Acceptance tests

The one that matters most, run through a real MCP client over an in-memory
transport pair, on synthetic notes with known identifiers:

1. **No leak on protect:** the full serialized `protect` response contains no
   original identifier value (alphanumeric-normalised comparison) and no
   `token_map` key.
2. **No leak on file release:** the full serialized `release_to_file` response
   contains no restored value; the file on disk contains the restored text and
   has mode `0600`.
3. Unknown, expired and discarded sessions all yield the identical generic
   error; `release_to_client` is absent unless enabled; `check_output` reports
   leaks without echoing them; audit lines contain no PHI; same-session
   `protect` calls reuse stable tokens for repeated values.

## 10. Explicitly deferred

Encrypted persistent vaults; roles/authentication (`recipient_role` is theatre
without an identity at the boundary); declarative policy files; diagnosis /
medication classification; date generalisation; framework adapters; hosted
gateway. `check_output` detects **verbatim** reappearance only — not
paraphrase, inference, or data learned through another channel — and the README
must say so.
