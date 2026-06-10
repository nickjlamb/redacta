# Redacta for Miro

Redact patient identifiers and PII on Miro boards before sharing or AI
processing. Select sticky notes (or scan the whole board), and Redacta replaces
identifiers with labelled tokens — `[NHS_NUMBER_1]`, `[EMAIL_1]`,
`[DATE_OF_BIRTH_1]`, … — and shows a redaction report.

**Privacy by design: everything runs client-side in the panel iframe. Board
content is never sent to a server.** Miro's native Private Mode anonymises *who
wrote* content; Redacta handles *what's in it*.

## Detection

Two modes (combinable):

- **Clinical** — NHS numbers (Modulus-11 validated), UK National Insurance
  numbers, dates of birth (keyword-anchored; appointment dates preserved), UK
  postcodes, US SSNs and ZIP codes, hospital/MRN numbers, emails, phone numbers.
- **General PII** — URLs, IP addresses, payment cards (Luhn validated), IBANs,
  keyword-anchored account/member/policy numbers, UK vehicle registrations,
  plus emails/phones/postcodes.

Same engine design as the [Redacta agent skill](https://clawhub.ai/nickjlamb/redacta):
deterministic patterns with checksum validation, consistent tokens (the same
value gets the same token across the whole board), and a token map you can
download for local re-identification.

Supported items: sticky notes, text, shapes, cards.

## Development setup

```bash
cd miro-app
npm install
npm run dev          # serves on http://localhost:3000
```

1. Go to [Miro app settings](https://miro.com/app/settings/user-profile/apps)
   → **Create new app** (pick your dev team).
2. In the app's settings, paste `app-manifest.yaml` into the manifest editor
   (or set App URL to `http://localhost:3000` and enable the `boards:read` and
   `boards:write` scopes manually).
3. Click **Install app and get OAuth token** and install to your dev team.
4. Open any board → find **Redacta** in the toolbar (under More apps) → the
   panel opens.

## Tests

```bash
npm test
```

The suite covers the validators (NHS Modulus-11, NI prefix rules, Luhn), the
DOB-vs-appointment-date rule, token consistency across items, and mode
separation.

## Build & deploy

```bash
npm run build        # type-checks, outputs dist/
```

Host `dist/` on any static host, then update `sdkUri` (and the toolbar icon
URL) in the app settings to the deployed URL.

**Railway** (configured — `railway.json` builds and serves `dist/` via `serve`):

```bash
railway init && railway up
```

**Vercel** (also configured via `vercel.json`):

```bash
npx vercel --prod
```

## Marketplace checklist

- [ ] Deploy to a public HTTPS URL and update `sdkUri`
- [ ] Add a toolbar icon (24×24 SVG) in app settings
- [ ] Complete the [Marketplace profile](https://developers.miro.com/docs/marketplace-profile)
      (logo, developer name/description, contact email, privacy policy URL)
- [ ] Fill in the [partner interest form](https://developers.miro.com/docs/get-ready-for-marketplace)
- [ ] Submit for [app review](https://developers.miro.com/docs/understand-app-submission-requirements)

## Limits

Deterministic patterns only — names and free-text addresses are not detected in
this version (the agent-skill version of Redacta handles those with LLM
reasoning). Always review the result before sharing. Not a substitute for
formal data-protection processes.

## License

MIT-0. Built by [PharmaTools.AI](https://www.pharmatools.ai/redacta).
