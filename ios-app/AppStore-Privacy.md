# Redacta — App Store privacy ("nutrition label")

**Bottom line: Data Not Collected.** In App Store Connect → App Privacy, answer
**"No, we do not collect data from this app."**

This is accurate because Redacta runs entirely on-device with no network entitlement.
Apple's rule (App Privacy Details, "Types of data" guidance):

> "Data that is processed only on device is not 'collected' and does not need to be
> disclosed in your answers."

and Apple defines **"Collect"** as *transmitting data off the device and storing it in a
readable form for longer than needed to service a request in real time.* Redacta does
neither.

---

## Preconditions (all true for Redacta — confirm before you submit)

- **No network.** The redaction engine (JavaScriptCore), OCR (Vision), and reinstating
  all run locally. There is no networking code and the app has no analytics, ads, or
  accounts.
- **No third-party SDKs** that collect data (no Firebase/Crashlytics/Facebook/etc.).
- **Nothing is retained off-device.** Token maps live in memory for the session only and
  are never written to disk or sent anywhere.
- **The App Group is local storage**, not collection — it only holds the selected mode
  and the light/dark preference on the device.
- If any of the above ever changes (you add analytics, crash reporting, a backend, etc.),
  you must revisit this label.

## The two questions App Store Connect asks

1. **"Do you or your third-party partners collect data from this app?"** → **No.**
   Selecting this gives the "Data Not Collected" label and skips the data-type pickers.
2. **Tracking** (App Tracking Transparency): Redacta does **no tracking** — it never links
   data with third-party data for advertising, and shares nothing with data brokers. No
   `NSUserTrackingUsageDescription` is needed.

## Nuances worth understanding (so you can answer with confidence)

These are the areas a reviewer might wonder about; each is still **Not Collected**:

- **Clinical text the user pastes/types** is sensitive health data, *but* it's free-form
  input that is processed only on-device and never transmitted or stored. Apple: you are
  "not responsible for disclosing all possible data that users may manually enter…
  through free-form fields." → Not collected.
- **Photos used in Scan** are read for on-device Vision OCR only; the image is never
  uploaded or retained. On-device processing is not collection. → Not collected.
  (The camera still needs its usage string, `NSCameraUsageDescription`, which you have —
  that's a *permission*, not a privacy-label data type.)
- **Clipboard** read/write (paste, copy, the Shortcut/widget) services the request in
  real time and is not stored or transmitted. → Not collection.

## Data-type checklist (every category → Not Collected)

| Apple category | Redacta | Why |
|---|---|---|
| Health (clinical text) | Not collected | On-device only, free-form, never transmitted/stored |
| Photos or Videos (Scan) | Not collected | OCR on-device; image not retained or sent |
| Other User Content / Emails or Text | Not collected | Free-form, on-device only |
| Contact Info, Location, Contacts | Not collected | Never accessed |
| Identifiers (User/Device ID) | Not collected | No accounts, no analytics, no ad IDs |
| Usage Data / Product Interaction | Not collected | No analytics |
| Diagnostics / Crash / Performance | Not collected | No crash or analytics SDK |
| Purchases, Financial, Browsing/Search | Not collected | Not applicable |

## Privacy Policy link (required)

App Store Connect requires a public **Privacy Policy URL**. Use:
`https://www.pharmatools.ai/privacy-policy`

Make sure that page states plainly: Redacta runs on-device, collects no data, uses no
analytics or tracking, and never transmits patient information. (Optionally add a
"Privacy Choices" URL — not required.)

---

## Also required for submission: the privacy manifest

Separate from the nutrition label, App Store submissions now require a **privacy manifest**
(`PrivacyInfo.xcprivacy`) when an app uses certain "required reason" APIs. Redacta uses
**UserDefaults** (for the saved mode and appearance, including the App Group), which is a
required-reason API, so a manifest is needed. It should declare:

- `NSPrivacyTracking` = false, `NSPrivacyTrackingDomains` = [] (empty)
- `NSPrivacyCollectedDataTypes` = [] (empty — nothing collected)
- `NSPrivacyAccessedAPITypes`: UserDefaults category with reasons **CA92.1** (App Group)
  and **1C8F.1** (app-only).

This file should be bundled in the app and in each extension that touches UserDefaults
(the Share Extension and the Widget). Ask and I'll generate `PrivacyInfo.xcprivacy` and
wire it into all three targets in `project.yml`.

> Sources: Apple, "App privacy details on the App Store"
> (developer.apple.com/app-store/app-privacy-details/).
