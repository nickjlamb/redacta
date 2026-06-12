# Figma Community listing — Redacta for FigJam

Copy/paste into the Publish dialog (Plugins → Development → Redacta → Publish).

## Name
Redacta

## Tagline (one line)
Redact patient data and PII before you share or AI-process a board.

## Description
Redacta replaces patient identifiers and personal data on your FigJam board with
labelled tokens — [NHS_NUMBER_1], [PATIENT_NAME_1], [EMAIL_1] — so you can share
a board, export it, or paste its contents into an AI tool without exposing the
people behind it.

Select a few sticky notes or scan the whole page. Redacta works across sticky
notes, shapes with text, connectors, text and table cells.

What it detects
• Clinical: NHS numbers (checksum-validated), National Insurance numbers, dates
  of birth, hospital/MRN numbers, UK postcodes, US SSN/ZIP, emails, phone numbers
• General PII: URLs, IP addresses, payment cards, IBANs, account numbers,
  vehicle registrations
• Names: patients, relatives and carers (clinician names are kept by design)
• Safe Harbor mode (US HIPAA): also removes all dates, ages, fax, licence,
  device-serial, VIN and health-plan numbers

Private by design
All detection runs on your device inside the plugin. Redacta requests no network
access, so board content never leaves FigJam.

Reversible
Download a token map when you redact, then use Re-identify to restore the real
values locally after you've processed the safe version elsewhere.

A first line of defence, not a guarantee — always review the result before
sharing. Not a substitute for formal data-protection processes.

Built by PharmaTools.AI — applied AI for pharma and healthcare.

## Tags
redaction, privacy, PII, de-identification, anonymise, healthcare, NHS, HIPAA,
GDPR, compliance, security, AI

## Category
Productivity / Workflow  (whichever FigJam category fits best)

## Support contact
info@pharmatools.ai · https://www.pharmatools.ai/redacta

## Permissions / network
No network access (declared in manifest). All processing on-device.

## Assets
- Icon: icon.png (128×128, in this folder)
- Cover art: cover.png (in this folder)
