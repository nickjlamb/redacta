# redacta-cli

Command-line redaction: pseudonymise patient identifiers and PII in text — and
restore them — with a HIPAA Safe Harbor mode. Runs locally, no network.

```bash
npx redacta-cli letter.txt --safe-harbor
# or install it
npm i -g redacta-cli
```

## Usage

```bash
redacta-cli [redact] [file] [options]       # redact a file or stdin
redacta-cli reinstate [file] --map <file>   # restore originals from a token map
```

Redact options:

| Option | Description |
|--------|-------------|
| `--mode <m>` | `clinical` \| `general` \| `both` \| `safeharbor` (default: `both`) |
| `--safe-harbor` | shorthand for `--mode safeharbor` (HIPAA Safe Harbor) |
| `--text-only` | print just the redacted text (no JSON) |
| `--map-out <file>` | also write the token map to `<file>` |

Reads stdin when no file is given.

## Examples

```bash
# Redact a letter, strict US HIPAA Safe Harbor
redacta-cli letter.txt --safe-harbor

# Pipe text, get just the safe version
cat note.txt | redacta-cli --text-only

# Redact to a file and keep the key for later
redacta-cli letter.txt --map-out map.json --text-only > safe.txt

# …run safe.txt through an AI tool, then restore the originals locally
redacta-cli reinstate ai-output.txt --map map.json --text-only
```

Same engine as the [Redacta skill](https://clawhub.ai/nickjlamb/redacta),
[MCP server](https://www.npmjs.com/package/redacta-mcp) and
[library](https://www.npmjs.com/package/@pharmatools/redacta). Deterministic +
keyword-anchored detection — review the result; not a substitute for formal
data-protection processes.

## License

MIT-0. Built by [PharmaTools.AI](https://www.pharmatools.ai/redacta).
