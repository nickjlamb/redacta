# Redacta for FigJam

Redact patient identifiers and PII on FigJam boards before sharing or AI
processing. Select sticky notes (or scan the whole page) and Redacta replaces
identifiers with labelled tokens — `[NHS_NUMBER_1]`, `[PATIENT_NAME_1]`, … — and
shows a redaction report.

**On-device by design: the manifest grants no network access, so board content
never leaves FigJam.** Same engine as the
[Redacta skill](https://clawhub.ai/nickjlamb/redacta), the MCP server, and the
Miro app — including a **HIPAA Safe Harbor** mode.

## What it covers

Reads and redacts sticky notes, shapes with text, connectors, text, and table
cells. Detection: NHS numbers (Modulus-11), UK NI, SSNs, dates of birth, MRNs,
postcodes, ZIP, emails, phones, plus general PII (URLs, IPs, Luhn cards, IBANs,
account numbers, vehicle regs) and keyword-anchored patient/relative/carer names.
**Safe Harbor mode** additionally removes all dates, ages, fax, licence, device,
VIN and health-plan numbers. Re-identify restores originals from a token map.

## Develop

```bash
npm install
npm run build        # bundles dist/code.js (engine inlined) + dist/ui.html
npm run watch        # rebuild on change
```

Then in the **Figma desktop app**, open a FigJam file →
**Plugins → Development → Import plugin from manifest…** → choose this folder's
`manifest.json`. Run it from **Plugins → Development → Redacta**.

> The `id` in `manifest.json` is a placeholder. Figma assigns a real plugin id
> when you create the plugin (Plugins → Development → New plugin…) or on first
> publish; replace `REPLACE_WITH_FIGMA_ASSIGNED_ID` with it.

## Publish

Build, then in Figma: **Plugins → Development → Redacta → Publish**, or manage at
<https://www.figma.com/developers/plugins>. Set editor type to FigJam, add the
listing copy, and a privacy note (no network access). Figma reviews submissions
before they go live in Community.

The plugin **icon** is set in the publish dialog (there is no manifest field for
it) — upload `icon.png` (128×128) from this folder.

## Limits

Deterministic + keyword-anchored detection only — not a guarantee, and not a
substitute for formal data-protection processes. Always review the result, and
treat the token map as the key that reverses the redaction.

## License

MIT-0. Built by [PharmaTools.AI](https://www.pharmatools.ai/redacta).
