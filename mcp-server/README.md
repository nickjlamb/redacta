# Redacta MCP server

An [MCP](https://modelcontextprotocol.io) server that pseudonymises patient
identifiers and PII in text — and restores them. Gives any MCP client (Claude
Desktop, Cursor, etc.) three tools:

- **`redact`** — replace identifiers with labelled tokens (`[NHS_NUMBER_1]`,
  `[PATIENT_NAME_1]`, …). Returns the redacted text, a report, a `token_map`
  (token → original, for re-identification), and a self-check.
- **`reinstate`** — reverse a redaction using a token map, to put real values
  back into output generated from redacted text.
- **`self_check`** — re-scan redacted text for anything that still looks like an
  identifier.

Everything runs locally in the server process: **no network calls, no storage.**
Same engine as the [Redacta skill](https://clawhub.ai/nickjlamb/redacta) and the
Redacta for Miro app.

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
      "args": ["-y", "redacta-mcp"]
    }
  }
}
```

Restart Claude Desktop. Then: *"Redact this letter before I share it"* → the
`redact` tool runs; *"put the real details back using this token map"* →
`reinstate`.

## Local development

```bash
npm install
npm run build
npm test          # engine tests (vitest)
npm start         # run the server on stdio
```

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

- **Data collection:** none. Redacta does not collect, transmit, or log any of
  the text you pass to it.
- **Usage & storage:** input text is processed in memory to produce the redacted
  output and token map, then discarded. Nothing is persisted by the server. The
  token map is returned to you (the caller) and never stored or sent anywhere.
- **Third-party sharing:** none. The server makes no network calls.
- **Data retention:** none. No data is retained after a request completes.
- **Contact:** info@pharmatools.ai

Full policy: https://www.pharmatools.ai/privacy-policy

## Desktop extension (MCPB) for the Claude Connectors Directory

Redacta is a local stdio server, so it's distributed to Claude as a Desktop
Extension (MCPB), not a remote connector.

```bash
npm run build:mcpb                      # bundles mcpb/server.mjs (+ icon)
npx @anthropic-ai/mcpb pack mcpb        # produces redacta-<version>.mcpb
```

All three tools are annotated `readOnlyHint: true` (no side effects), and the
manifest declares no network access and links the privacy policy.

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
git tag redacta-1.3.0
git push origin redacta-1.3.0
```

The workflow syncs `package.json` + `mcpb/manifest.json` to the tag version,
builds, and publishes `redacta-1.3.0.mcpb` to the release. Tag convention:
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

Deterministic + keyword-anchored detection only — not a guarantee, and not a
substitute for formal data-protection processes. Always review the result, and
treat the `token_map` as the key that reverses the redaction: store it with the
same care as the original data.

## License

MIT-0. Built by [PharmaTools.AI](https://www.pharmatools.ai/redacta).
