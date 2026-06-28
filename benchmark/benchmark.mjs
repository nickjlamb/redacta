#!/usr/bin/env node
// Redacta — deterministic engine benchmark.
//
// Builds a seeded, synthetic UK clinical corpus with gold-labelled identifiers
// (and "preserve" distractors: clinician names, appointment dates), runs the
// SHIPPING engine (redacta.bundle.js, clinical mode), and scores per-category
// recall, precision, F1, plus preserve accuracy. All data is synthetic — no real
// patient information.
//
//   node benchmark/benchmark.mjs

import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const bundlePath = path.resolve(here, "../ios-app/RedactaEngine/Resources/redacta.bundle.js");

// --- Load the shipping engine into a bare context (as JSCore sees it) --------
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(bundlePath, "utf8"), ctx);
const Redacta = ctx.Redacta;

// --- Seeded RNG (reproducible corpus) ---------------------------------------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260626);
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const randInt = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const pad = (n, w) => String(n).padStart(w, "0");

// --- Valid identifier generators --------------------------------------------
function validNhs() {
  // 9 random digits + Modulus-11 check digit; reject check 10 / all-same.
  for (;;) {
    const d = Array.from({ length: 9 }, () => randInt(0, 9));
    const sum = d.reduce((s, x, i) => s + x * (10 - i), 0);
    let c = 11 - (sum % 11);
    if (c === 11) c = 0;
    if (c === 10) continue;
    const all = [...d, c];
    if (all.every((x) => x === all[0])) continue;
    const s = all.join("");
    return `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6)}`;
  }
}
// A 10-digit number that deliberately FAILS the Modulus-11 check — the engine
// must NOT redact it (proves detection isn't "any 10 digits").
function invalidNhs() {
  for (;;) {
    // First digit 1-9 (real NHS numbers don't start with 0; a 0-leading 10-digit
    // string would match the generic phone pattern — see the limitations note).
    const d = [randInt(1, 9), ...Array.from({ length: 8 }, () => randInt(0, 9))];
    const sum = d.reduce((s, x, i) => s + x * (10 - i), 0);
    let c = 11 - (sum % 11);
    if (c === 11) c = 0;
    if (c === 10) continue;
    const wrong = (c + 1) % 10; // wrong check digit
    // Unspaced, so this cleanly tests the Modulus-11 check (a spaced NNN NNN NNNN
    // form would also match the generic phone pattern — see the limitations note).
    return [...d, wrong].join("");
  }
}
// Vary the surface format of a valid NHS number (spaced / unspaced / dashed).
function fmtNhs(spaced) {
  const g = spaced.replace(/\D/g, "");
  const r = rng();
  if (r < 0.34) return g;
  if (r < 0.67) return `${g.slice(0, 3)}-${g.slice(3, 6)}-${g.slice(6)}`;
  return spaced;
}
const DOB_KW = ["Date of birth", "DOB:", "D.O.B.", "Born on"];
// NI prefixes the engine rejects (disallowed pairs) — a hard negative.
const NI_BAD = ["BG", "GB", "NK", "ZZ"];
function invalidNi() {
  return `${pick(NI_BAD)} ${pad(randInt(0, 99), 2)} ${pad(randInt(0, 99), 2)} ${pad(randInt(0, 99), 2)} A`;
}
// Valid NI prefixes (avoid disallowed letters/pairs).
const NI_PREFIXES = ["AB", "CE", "EH", "JM", "PR", "WK", "ZA", "BB", "GH", "LM"];
function validNi() {
  return `${pick(NI_PREFIXES)} ${pad(randInt(0, 99), 2)} ${pad(randInt(0, 99), 2)} ${pad(randInt(0, 99), 2)} A`;
}
const POSTCODES = ["LS1 4DY", "M1 1AE", "EC1A 1BB", "B33 8TH", "CR2 6XH", "SW1A 2AA", "NE1 7RU", "G2 8DL", "CF10 1EP", "BT1 5GS"];
const FIRST = ["Patricia", "Harold", "Maureen", "Derek", "Eileen", "Raymond", "Doreen", "Gerald", "Brenda", "Malcolm", "Sylvia", "Clifford", "Marjorie", "Stanley", "Pauline", "Leonard"];
const cleanLast = ["Hartley", "Fenwick", "Ashcroft", "Brierley", "Crowther", "Pemberton", "Rowbotham", "Thistlewood", "Hargreaves", "Wadsworth", "Entwistle", "Collier", "Birtwistle", "Postlethwaite", "Ramsbottom"];
function fullName() { return `${pick(FIRST)} ${pick(cleanLast)}`; }
function dob() { return `${pad(randInt(1, 28), 2)}/${pad(randInt(1, 12), 2)}/${randInt(1935, 1995)}`; }
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function apptDate() { return `${randInt(1, 28)} ${pick(MONTHS)} 2025`; }
function phone() { return rng() < 0.5 ? `07700 900${pad(randInt(0, 999), 3)}` : `020 7946 0${pad(randInt(0, 999), 3)}`; }
function email(name) { return `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`; }
function mrn() { return `${pick(["RJ1", "RGT", "RXH"])}-${pad(randInt(0, 9999999), 7)}`; }
const RELATIONS = ["daughter", "son", "wife", "husband", "mother", "father", "sister", "brother"];
const COURTESY = ["Mr", "Mrs", "Ms", "Miss"];
// Unambiguous clinician titles (note: "Sister", a UK nurse title, overlaps the
// relative-name rule — a known edge case discussed in the write-up).
const CLINICIANS = ["Dr", "Doctor", "Consultant", "Registrar"];

// --- Note templates: return {text, gold:[{value,cat}], preserve:[{value,reason}]}
function note() {
  const patient = fullName();
  const courtesy = pick(COURTESY);
  const nhs = validNhs();
  const d = dob();
  const pc = pick(POSTCODES);
  const ph = phone();
  const em = email(patient);
  const clinician = `${pick(CLINICIANS)} ${pick(cleanLast)}`;
  const appt = apptDate();
  const ni = validNi();
  const m = mrn();
  const rel = pick(RELATIONS);
  const relative = fullName();

  const gold = [];
  const preserve = [];
  const add = (v, cat) => gold.push({ value: v, cat });
  const keep = (v, reason) => preserve.push({ value: v, reason });

  // Build a varied letter; not every note uses every field.
  const parts = [];
  parts.push(`Re: ${courtesy} ${patient}, NHS Number ${fmtNhs(nhs)}.`);
  add(patient, "PATIENT_NAME"); add(nhs, "NHS_NUMBER");

  if (rng() < 0.85) { parts.push(`${pick(DOB_KW)} ${d}.`); add(d, "DATE_OF_BIRTH"); }
  if (rng() < 0.6) { parts.push(`Address on file at ${pc}.`); add(pc, "POSTCODE"); }
  if (rng() < 0.6) { parts.push(`Contact number ${ph}.`); add(ph, "PHONE"); }
  if (rng() < 0.45) { parts.push(`Email ${em}.`); add(em, "EMAIL"); }
  if (rng() < 0.4) { parts.push(`MRN: ${m}.`); add(m, "MRN"); }
  if (rng() < 0.35) { parts.push(`NI number ${ni}.`); add(ni, "NI_NUMBER"); }
  if (rng() < 0.5) { parts.push(`Their ${rel} ${relative} attended.`); add(relative, "RELATIVE_NAME"); }

  // Preserve distractors — must NOT be redacted:
  parts.push(`Reviewed in clinic on ${appt} by ${clinician}.`);
  keep(clinician, "clinician name"); keep(appt, "appointment date");

  // Hard negatives that tempt a naive redactor:
  const badNhs = invalidNhs();
  parts.push(`Lab sample reference ${badNhs} (not an NHS number).`);
  keep(badNhs, "invalid NHS — fails checksum");
  if (rng() < 0.5) { const bni = invalidNi(); parts.push(`Old form quoted ${bni}, since corrected.`); keep(bni, "invalid NI prefix"); }
  parts.push(`Ferritin ${randInt(8, 40)} ug/L; continuing oral iron 200 mg.`);
  keep("200 mg", "dosage");

  return { text: parts.join(" "), gold, preserve };
}

// Free-text (unanchored) names — a KNOWN limitation of the deterministic engine.
function freeTextNameNote() {
  const f = pick(FIRST);
  return { text: `${f} returned today feeling much improved and will self-refer if symptoms recur.`, name: f };
}

// --- Scoring helpers ---------------------------------------------------------
// Compare on alphanumerics only, so "943 476 5919", "9434765919" and
// "943-476-5919" match, and "Mrs Patricia Hartley" still contains "Patricia Hartley".
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const overlap = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x.includes(y) || y.includes(x)); };
// Category from a Redacta token, e.g. "[DATE_OF_BIRTH_2]" -> "DATE_OF_BIRTH".
const catOf = (token) => token.slice(1, -1).replace(/_\d+$/, "");

const N = 60;
const corpus = Array.from({ length: N }, note);
const freeSet = Array.from({ length: 15 }, freeTextNameNote);

// Generic scorer so Redacta and any other engine are measured identically.
// engineFn(text) -> [{ value, cat }] (cat optional; used for strict recall).
function score(engineFn) {
  const cats = {};
  let goldTotal = 0, lenient = 0, strict = 0;
  let redactTotal = 0, redactCorrect = 0, falsePos = 0;
  let preserveTotal = 0, preserveKept = 0;

  for (const item of corpus) {
    const found = engineFn(item.text); // [{value, cat}]
    for (const g of item.gold) {
      goldTotal++;
      cats[g.cat] ??= { lenient: 0, strict: 0, total: 0 };
      cats[g.cat].total++;
      if (found.some((f) => overlap(f.value, g.value))) { lenient++; cats[g.cat].lenient++; }
      if (found.some((f) => overlap(f.value, g.value) && f.cat === g.cat)) { strict++; cats[g.cat].strict++; }
    }
    for (const f of found) {
      redactTotal++;
      if (item.gold.some((g) => overlap(f.value, g.value))) redactCorrect++; else falsePos++;
    }
    for (const p of item.preserve) {
      preserveTotal++;
      if (!found.some((f) => overlap(f.value, p.value))) preserveKept++;
    }
  }
  return {
    leaksAvoided: +((lenient / goldTotal) * 100).toFixed(1), // any-category recall
    strictRecall: +((strict / goldTotal) * 100).toFixed(1),  // correct-category recall
    precision: +((redactCorrect / redactTotal) * 100).toFixed(1),
    falsePositives: falsePos,
    goldIdentifiers: goldTotal,
    preserveAccuracy: +((preserveKept / preserveTotal) * 100).toFixed(1),
    perCategory: Object.fromEntries(
      Object.entries(cats).sort().map(([k, v]) => [k, {
        leaksAvoided: +((v.lenient / v.total) * 100).toFixed(1),
        strictRecall: +((v.strict / v.total) * 100).toFixed(1),
        n: v.total,
      }])
    ),
  };
}

// Redacta as an engine: token type -> category, token value -> matched text.
const redactaEngine = (text) => {
  const r = Redacta.redact(text, "clinical");
  return Object.entries(r.tokenMap).map(([tok, val]) => ({ value: val, cat: catOf(tok) }));
};

const redacta = score(redactaEngine);

// Free-text name probe (clinical mode)
let freeCaught = 0;
for (const f of freeSet) {
  if (redactaEngine(f.text).some((x) => overlap(x.value, f.name))) freeCaught++;
}

const out = {
  seed: 20260626, notes: N,
  redacta: {
    leaksAvoided: redacta.leaksAvoided,
    strictRecall: redacta.strictRecall,
    precision: redacta.precision,
    falsePositives: redacta.falsePositives,
    preserveAccuracy: redacta.preserveAccuracy,
    goldIdentifiers: redacta.goldIdentifiers,
  },
  perCategory: redacta.perCategory,
  freeTextNames: { caught: freeCaught, total: freeSet.length, note: "Out of deterministic scope; the app prompts the user to review." },
};

console.log(JSON.stringify(out, null, 2));
fs.writeFileSync(path.resolve(here, "results.json"), JSON.stringify(out, null, 2) + "\n");

// Emit the labelled corpus so other engines (e.g. Presidio) can be scored on
// the identical input with the identical rule. See presidio_baseline.py.
fs.writeFileSync(
  path.resolve(here, "corpus.json"),
  JSON.stringify({ seed: 20260626, notes: corpus, freeTextNames: freeSet }, null, 2) + "\n"
);
