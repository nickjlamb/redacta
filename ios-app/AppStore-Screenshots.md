# Redacta — App Store screenshot plan

## Sizes & rules (verified against Apple's current spec)

- **Provide the 6.9" iPhone set** — **1320 × 2868** (or 1290 × 2796) portrait.
  Apple auto-scales it down for smaller iPhones, so this one set is enough.
- The 6.5" set (1242 × 2688) is only *required if you don't provide 6.9"*. Skip it.
- iPad: not needed (Redacta is iPhone-only).
- Up to **10** screenshots; the **first 2–3** appear in search results, so lead with
  your strongest. PNG or JPEG, no alpha, no rounded corners/device frame required.

**Capture device:** iPhone 16 Pro Max simulator (6.9"). Save with **⌘S** (or
Device ▸ Trigger Screenshot) — it writes a native-resolution PNG.

**Clean status bar (do this first, pro tip):**
```bash
xcrun simctl status_bar booted override \
  --time "9:41" --batteryState charged --batteryLevel 100 \
  --cellularBars 4 --wifiBars 3
```

---

## The sequence (8 frames — at minimum ship 1–4)

Each frame = a captured screen + a short marketing headline. The redaction "reveal"
is the most visual moment, so it leads.

**1 — Hero: the reveal**
Setup: Redact tab → **Try an example** → set mode to **HIPAA** → **Redact**.
Headline: **"Every patient identifier — replaced."**
Sub: "Names, NHS numbers and dates become tokens."

**2 — How simple it is**
Setup: Redact tab with the example text loaded (before tapping Redact).
Headline: **"Paste a note. Tap Redact. Done."**
Sub: "Then paste the safe text into ChatGPT or Claude."

**3 — Privacy (the differentiator)**
Setup: Settings tab, the **Privacy** card visible (the four rows).
Headline: **"On-device. Nothing leaves your phone."**
Sub: "No network, no accounts, no analytics."

**4 — Modes**
Setup: Redact tab, segmented control on **HIPAA** with the description showing.
Headline: **"Clinical, General PII, or HIPAA."**
Sub: "Match the rules you work under."

**5 — Scan**
Setup: Scan tab (the dashed drop zone empty state).
Headline: **"Photograph a letter — redact the text."**
Sub: "On-device OCR. The image never leaves your phone."

**6 — Reinstate**
Setup: Reinstate tab showing a restored result (paste a reply + the last map, Reinstate).
Headline: **"Put the real values back."**
Sub: "Reverse the AI's reply in one step."

**7 — Works everywhere (Share Sheet)**
Setup: In Safari/Notes, select text → Share → **Redacta**; capture the redacted sheet.
Headline: **"Redact from any app."**
Sub: "Select text → Share → Redacta."

**8 — Widget + dark mode**
Setup: Home Screen with the **Redact Clipboard** widget added; switch to **Dark**.
Headline: **"One-tap clipboard redaction."**
Sub: "Plus Shortcuts, and full dark mode."

> Put at least one **dark-mode** frame in the set (8 is ideal) to show the toggle.

---

## Caption frame design (if you add headline overlays)

Optional but recommended — framed screenshots convert better than raw ones.

- **Headline:** Poppins SemiBold/Bold, brand ink `#0B0F1C` (or white on a blue band).
- **Background band:** brand blue `#2036F5` or canvas white `#FFFFFF`; keep it on-brand.
- **Layout:** headline in the top ~22%, the device screenshot below, generous margins.
- Keep headlines to ~4–6 words; don't cover key UI in the screenshot.
- Be consistent: same headline position, font size, and background across all frames.
- Tools: Figma, or a template tool (e.g. Screenshots.pro / Previewed) at 1320 × 2868.

## Localization
Lead with **English (UK)** (NHS-number, "anonymise" spelling). Optionally add a
**U.S. English** variant emphasising HIPAA / "anonymize".

## Final checklist
- [ ] 6.9" set at 1320 × 2868, portrait, no alpha
- [ ] Clean 9:41 status bar on every shot
- [ ] Use the synthetic sample note (no real PHI in screenshots)
- [ ] First 3 frames tell the story on their own
- [ ] At least one dark-mode frame
- [ ] Captions consistent and ≤6 words
