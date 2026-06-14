# Redacta MCP — discovery listings

Where `redacta-mcp` is (or should be) listed, and how to (re)submit.

## 1. Official MCP Registry (keystone — others pull from it)

Requires `mcpName` in `package.json` (already set to `io.github.nickjlamb/redacta-mcp`)
and a matching `server.json` (in this folder). The npm package must be published
first so the registry can verify the `mcpName`.

```bash
# 1. publish the npm package carrying mcpName (v1.2.1+)
npm publish

# 2. install the registry CLI (Homebrew or the release binary)
brew install mcp-publisher

# 3. authenticate as the GitHub owner of the io.github.nickjlamb/* namespace
mcp-publisher login github

# 4. publish (run from this mcp-server/ folder, where server.json lives)
mcp-publisher publish

# verify
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=redacta"
```

Bump `version` in both `package.json` and `server.json` together on each release.

## 2. Glama

Auto-indexes published npm MCP servers and the official registry — usually
appears within a day of the registry publish. Claim/verify the listing at
<https://glama.ai/mcp/servers> if you want to edit it.

## 3. Smithery

Redacta is a **local stdio** server (no hosted HTTPS URL), so do **not** use the
`/servers/new` URL form. Instead use Smithery's **Connect GitHub repository**
flow and let it read `mcp-server/smithery.yaml`, which declares the stdio start
command (`npx -y redacta-mcp`). If Smithery insists on a hosted URL, skip it —
the official MCP Registry listing already drives discovery.

## 4. awesome-mcp-servers (GitHub)

Open a PR to <https://github.com/punkpeye/awesome-mcp-servers> adding, under a
Security / Healthcare heading:

```markdown
- [redacta-mcp](https://github.com/nickjlamb/redacta) 🏠 📇 - Pseudonymise patient identifiers and PII in text (and restore them) locally, with a HIPAA Safe Harbor mode. Nothing leaves your machine.
```

(🏠 = local service, 📇 = TypeScript — match the list's current legend.)

## 5. PulseMCP / mcp.so

Community directories that mostly crawl npm + the official registry; submit
manually at <https://www.pulsemcp.com> and <https://mcp.so> if they haven't
picked it up.
