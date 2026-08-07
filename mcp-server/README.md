# Redacta MCP server

**Keep patient identifiers out of AI agent context.**

An [MCP](https://modelcontextprotocol.io) server that acts as a **stateful
privacy boundary** between clinical text and AI agents. `protect` replaces
patient identifiers with labelled tokens (`[NHS_NUMBER_1]`,
`[PATIENT_NAME_1]`, …) and keeps the reversal mapping **inside the server
process** — the agent receives only the protected text and an opaque session
ID. Restoration happens at the boundary, on your terms.

```text
clinical text ──▶ protect ──▶ agent sees tokens only
                     │
                     └─ token map stays in server memory
                        (never in the tool result, never in model context)

agent output ──▶ release_to_file ──▶ restored text lands in a folder
                                     you configured; the agent gets a
                                     receipt, not the identifiers
```

Everything runs locally in the server process: **no network calls, no
persistent storage.** Same deterministic engine as the
[Redacta skill](https://clawhub.ai/nickjlamb/redacta), libraries, CLI and iOS
app. Listed in
[Anthropic's MCP Directory](https://claude.ai/directory/connectors/ant.dir.gh.nickjlamb.redacta)
— one-click install in Claude Desktop.

## Tools

| Tool | What it does |
|------|--------------|
| `protect` | Redact text; the token map stays server-side. Returns protected text, an opaque `session_id`, a category report, and a self-check. |
| `release_to_file` | Restore identifiers into text from a protected session, writing the result to a file inside `REDACTA_RELEASE_DIR` (atomic, `0600`, generated filename). Returns a receipt only — restored data never enters the model context. |
| `release_to_client` | Opt-in (`REDACTA_RELEASE=client\|both`): returns restored text in the tool result, for trusted environments. Carries an explicit warning. |
| `check_output` | Scan model output for verbatim reappearance of a session's original values (spacing/dash/case tolerant) and re-tokenise anything found. Reports leaked categories — never the raw values. |
| `discard_session` | Delete a session's mapping immediately instead of waiting for expiry. |
| `redact`, `reinstate`, `self_check` | **Legacy (v1)** — unchanged, for backward compatibility and client-managed workflows. `redact` returns the token map to the caller, which places the reversal key in the client and potentially the model context; prefer `protect`. Hide with `REDACTA_LEGACY_TOOLS=0`. |

## Sessions

Mappings live in server memory only: sessions expire after
`REDACTA_SESSION_TTL_MINUTES` (default 60), are capped at
`REDACTA_MAX_SESSIONS` (default 64, oldest evicted), and disappear when the
server exits — the safe failure direction. Any invalid, expired or discarded
session yields the same generic error, so session IDs cannot be probed.

## Detection

Deterministic patterns with checksum validation — NHS numbers (Modulus-11), UK
National Insurance numbers, dates of birth (keyword-anchored; appointment dates
preserved), UK postcodes, US SSNs/ZIPs, hospital/MRN numbers, emails, phones —
plus general PII (URLs, IPs, Luhn-validated cards, IBANs, account numbers, UK
vehicle regs) and keyword-anchored patient/relative/carer names (clinician names
preserved by design). Names in free prose are not caught; review the output.

## Use with Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "redacta": {
      "command": "npx",
      "args": ["-y", "redacta-mcp"],
      "env": {
        "REDACTA_RELEASE_DIR": "/Users/you/Documents/Redacta"
      }
    }
  }
}
```

Restart Claude Desktop. Then: *"Protect this letter before you summarise it"*
→ `protect` runs and Claude works on tokens only; *"restore the real details
into a file"* → `release_to_file` writes the re-identified result to your
release folder and Claude sees only the receipt.

## Configuration

| Env var | Default | Meaning |
|---------|---------|---------|
| `REDACTA_RELEASE` | `file` | Where restored output may go: `file`, `client`, `both`, or `off` (no release tools at all) |
| `REDACTA_RELEASE_DIR` | *(unset)* | Existing directory where `release_to_file` may write. Unset → the tool explains how to configure it |
| `REDACTA_SESSION_TTL_MINUTES` | `60` | Session lifetime |
| `REDACTA_MAX_SESSIONS` | `64` | Concurrent session cap |
| `REDACTA_AUDIT_LOG` | *(unset)* | Path to a JSONL audit log (events + category counts + hashed session IDs; never source text, values, or mappings) |
| `REDACTA_LEGACY_TOOLS` | `1` | `0` hides the v1 `redact` / `reinstate` / `self_check` tools |

## Migrating from v1

Nothing breaks: the v1 tools keep their exact schemas and behaviour. The
difference is what you should reach for. In v1, `redact` handed the token map
back to the MCP client — fine when a human drives the round trip, but in an
agent workflow it puts the reversal key into the model's context. In v2,
`protect` + `release_to_file` keep the mapping at the boundary. See
[`DESIGN.md`](DESIGN.md) for the full design, threat notes and test strategy.

## Local development

```bash
npm install
npm run build
npm test          # engine + privacy-boundary tests (vitest)
npm start         # run the server on stdio
```

The acceptance tests run a real MCP client against the server over an
in-memory transport and assert that no original identifier value and no token
map ever appears in a `protect` or `release_to_file` response.

## Publishing

To npm (powers the `npx redacta-mcp` install above):

```bash
npm publish
```

Then list it on the MCP registries for discovery:

- **Official MCP registry** — <https://registry.modelcontextprotocol.io>
- **Smithery** — `smithery mcp publish`
- **Glama** — auto-indexes published npm MCP servers; verify the listing
- **mcp.so / PulseMCP** — community submission
- **awesome-mcp-servers** — open a PR adding the entry

## Privacy Policy

Redacta runs entirely on your device.

- **Data collection:** none. Redacta does not collect or transmit any of the
  text you pass to it, and makes no network calls.
- **Usage & storage:** input text is processed in memory. Token maps are held
  in server memory for the session lifetime, then discarded; they are never
  returned to the client by `protect` and never written to disk. The only
  disk writes are the ones you configure: re-identified output into
  `REDACTA_RELEASE_DIR` when you call `release_to_file`, and the optional
  audit log (which contains no PHI, no values and no mappings).
- **Third-party sharing:** none.
- **Contact:** info@pharmatools.ai

Full policy: https://www.pharmatools.ai/privacy-policy

## Desktop extension (MCPB) for the Claude Connectors Directory

Redacta is a local stdio server, so it's distributed to Claude as a Desktop
Extension (MCPB), not a remote connector.

```bash
npm run build:mcpb                      # bundles mcpb/server.mjs (+ icon)
npx @anthropic-ai/mcpb pack mcpb        # produces redacta-<version>.mcpb
```

The manifest declares no network access, links the privacy policy, and asks
the user for an optional release folder at install time.

### Automated releases (Anthropic MCP Directory)

Redacta is published in the Anthropic MCP Directory via a **pull-based** flow —
no submission form per release. The workflow at
[`.github/workflows/mcpb-pack.yaml`](../.github/workflows/mcpb-pack.yaml) builds
the bundle, packs a versioned `.mcpb`, and attaches it to the GitHub Release
whenever a tag matching `redacta-*` is pushed. The directory review cycle then
picks the new tag up automatically.

**First decide whether the engine changed.** The workflow publishes only
`redacta-mcp` — not the shared `@pharmatools/redacta` engine. So:

- **Engine changed?** Publish it first, otherwise the MCP build picks up the old
  version:
  ```bash
  # in npm-package/: bump version, then
  npm publish
  # then bump the "@pharmatools/redacta" range in mcp-server/package.json to match
  ```
- **MCP server only?** Skip the above and go straight to tagging.

To cut the release:

```bash
# from repo root, after bumping the version in mcp-server/package.json
git tag redacta-2.0.0
git push origin redacta-2.0.0
```

The workflow syncs `package.json` + `mcpb/manifest.json` to the tag version,
builds, and publishes `redacta-2.0.0.mcpb` to the release. Tag convention:
`redacta-<version>` → asset `redacta-<version>.mcpb`.

Registered with the directory as: **repo** `nickjlamb/redacta`, **tag pattern**
`redacta-*`. For a one-off / first manual submission, pack locally and upload the
`.mcpb` via the
[Desktop extension submission form](https://clau.de/desktop-extention-submission).

The same tag also fans out to the other distribution channels:

1. **GitHub Release** — attaches `redacta-<version>.mcpb` (Anthropic directory).
2. **npm** — publishes `redacta-mcp@<version>` (`publish-npm` job).
3. **Official MCP Registry** — publishes `io.github.nickjlamb/redacta-mcp`
   (`publish-registry` job, after npm has indexed the version).

One-time setup — **no secrets required**; both npm and the registry authenticate
with tokenless GitHub OIDC (`id-token: write`):

- **npm Trusted Publishing** — on npmjs.com, open the `redacta-mcp` package →
  *Settings → Trusted Publisher → GitHub Actions*, and register:
  repository `nickjlamb/redacta`, workflow `mcpb-pack.yaml`. After that the
  `publish-npm` job publishes via OIDC (and gets build provenance for free).
- **MCP Registry** — needs no setup; the `io.github.nickjlamb/*` namespace is
  granted automatically because the workflow runs in a repo owned by that account.

## Limits

Be precise about what the boundary does and doesn't give you. Detection is
deterministic + keyword-anchored — not a guarantee, and not a substitute for
formal data-protection processes. `check_output` detects **verbatim**
reappearance of session values only: paraphrases, inferred identities and
information the model learned elsewhere are out of scope. Sessions live in
memory, so a server restart ends them (by design). And if you use the legacy
`redact` tool, treat the `token_map` as the key that reverses the redaction:
store it with the same care as the original data.

## License

MIT-0. Built by [PharmaTools.AI](https://www.pharmatools.ai/redacta).
