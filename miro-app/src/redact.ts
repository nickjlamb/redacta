/**
 * Redacta for Miro — deterministic pattern engine.
 *
 * TypeScript port of scripts/redact_structured.py from the Redacta skill,
 * extended with general-PII patterns (URLs, IPs, payment cards, IBANs,
 * account numbers, vehicle registrations).
 *
 * Everything runs client-side. No network calls, no storage.
 */

export type Category = "clinical" | "general";

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

/** Validate a 10-digit NHS number using the Modulus-11 check digit. */
export function isValidNhs(digits: string): boolean {
  if (!/^\d{10}$/.test(digits)) return false;
  if (digits === digits[0].repeat(10)) return false;
  const weights = [10, 9, 8, 7, 6, 5, 4, 3, 2];
  const total = weights.reduce((sum, w, i) => sum + Number(digits[i]) * w, 0);
  let check = 11 - (total % 11);
  if (check === 11) check = 0;
  if (check === 10) return false;
  return check === Number(digits[9]);
}

const NI_INVALID_PREFIX = new Set(["BG", "GB", "NK", "KN", "TN", "NT", "ZZ"]);
const NI_PREFIX1_BAD = new Set("DFIQUV");
const NI_PREFIX2_BAD = new Set("DFIOQUV");

/** Validate the two-letter prefix of a UK National Insurance number. */
export function isValidNi(prefix: string): boolean {
  const p = prefix.toUpperCase();
  if (p.length !== 2 || NI_INVALID_PREFIX.has(p)) return false;
  return !NI_PREFIX1_BAD.has(p[0]) && !NI_PREFIX2_BAD.has(p[1]);
}

/** Luhn checksum for payment card numbers. */
export function isValidLuhn(digits: string): boolean {
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

// ---------------------------------------------------------------------------
// Tokeniser: same value -> same token, distinct values -> new numbers
// ---------------------------------------------------------------------------

class Tokeniser {
  private byKey = new Map<string, string>();
  private counters = new Map<string, number>();
  readonly tokenMap: Record<string, string> = {};

  tokenFor(type: string, original: string, key?: string): string {
    const k = `${type}::${key ?? original}`;
    const existing = this.byKey.get(k);
    if (existing) return existing;
    const n = (this.counters.get(type) ?? 0) + 1;
    this.counters.set(type, n);
    const token = `[${type}_${n}]`;
    this.byKey.set(k, token);
    this.tokenMap[token] = original;
    return token;
  }
}

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

const MONTHS =
  "January|February|March|April|May|June|July|August|September|" +
  "October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec";

const DATE = [
  String.raw`\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}`,
  String.raw`\d{4}-\d{2}-\d{2}`,
  String.raw`\d{1,2}(?:st|nd|rd|th)?\s+(?:${MONTHS})\s+\d{4}`,
  String.raw`(?:${MONTHS})\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}`,
]
  .map((s) => `(?:${s})`)
  .join("|");

// A date only counts as a DOB when anchored to a DOB keyword, so clinical and
// appointment dates are left intact.
const DOB_RE = new RegExp(
  String.raw`(\b(?:date\s+of\s+birth|d\.?o\.?b\.?|born(?:\s+on)?)[\s:.]*)((?:${DATE}))`,
  "gi"
);

const NHS_RE = /\b(\d{3}[\s-]?\d{3}[\s-]?\d{4})\b/g;

const NI_RE = /\b([A-Za-z]{2})\s?(\d{2})\s?(\d{2})\s?(\d{2})\s?([A-Da-d])\b/g;

const SSN_FMT_RE = /(?<!\d)(?!000|666|9\d\d)(\d{3})([-\s])(\d{2})\2(\d{4})(?!\d)/g;
const SSN_KW_RE =
  /((?:SSN|Social\s*Security(?:\s*(?:Number|No\.?|#))?)[\s:]*)((?!000|666|9\d\d)\d{9})(?!\d)/gi;

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

const MRN_RE =
  /((?:MRN|Hospital\s*(?:No\.?|Number)|Hosp\.?\s*(?:No\.?|Number)|Patient\s*ID|Unit\s*(?:No\.?|Number))[\s:]*)([A-Z0-9-]{4,15})/gi;

const POSTCODE_RE = /\b(GIR\s?0AA|[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\b/gi;

const US_STATES =
  "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|" +
  "MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC";
const ZIP_KW_RE = /((?:ZIP|Zip\s*Code|Postal\s*Code)[\s:]*)(\d{5}(?:-\d{4})?)(?!\d)/gi;
const ZIP_STATE_RE = new RegExp(
  String.raw`((?:,?\s)(?:${US_STATES})\s+)(\d{5}(?:-\d{4})?)(?!\d)`,
  "g"
);

// --- General-PII additions -------------------------------------------------

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'\])]+/gi;

const IP_RE = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;

// Candidate card numbers (13-19 digits, optionally space/dash separated),
// confirmed with the Luhn checksum before redacting.
const CARD_RE = /(?<![\d-])(?:\d[ -]?){12,18}\d(?![\d-])/g;

const IBAN_RE = /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,3})?\b/g;

const ACCOUNT_KW_RE =
  /((?:Account|Acct\.?|Member\s*ID|Policy\s*(?:No\.?|Number)|Insurance\s*ID)\s*(?:No\.?|Number|#)?[\s:]*)((?=[A-Z0-9-]*\d)[A-Z0-9-]{5,17})/gi;

const UK_PLATE_RE = /\b[A-Z]{2}\d{2}\s?[A-Z]{3}\b/g;

// --- Names (keyword-anchored) ----------------------------------------------
// Names need contextual judgement, which a client-side deterministic engine
// can't fully do. We catch the high-confidence cases — names introduced by a
// courtesy title, a salutation, or a label — and deliberately PRESERVE names
// carrying a clinical title (Dr, Consultant, Nurse, ...), matching the Redacta
// skill's "don't redact the treating clinician" rule. Names buried in free
// prose are NOT caught; the UI tells users to review.
const NAME = String.raw`[A-Z][a-z]+(?:['’\-][A-Za-z]+)?(?:[ \t]+[A-Z][a-z]+(?:['’\-][A-Za-z]+)?){0,2}`;
const COURTESY_TITLE = "Mr|Mrs|Ms|Miss|Mx";
const CLINICAL_TITLE =
  "Dr|Doctor|Prof|Professor|Consultant|Nurse|Sister|Matron|Surgeon|Registrar";

// "Mrs Patricia Hartley" → redact title + name together.
const NAME_TITLE_RE = new RegExp(String.raw`\b(?:${COURTESY_TITLE})\.?\s+(${NAME})`, "g");
// "Dear Patricia Hartley" → keep "Dear", redact the name — unless a clinical title follows.
const NAME_SALUTATION_RE = new RegExp(
  String.raw`\b(Dear)\s+(?!(?:${CLINICAL_TITLE})\b)(${NAME})`,
  "g"
);
// "Patient: ...", "Name - ...", "Re: ..." → keep the label, redact the name.
const NAME_LABEL_RE = new RegExp(
  String.raw`\b((?:Patient(?:\s+Name)?|Name|Client|Re)\s*[:\-]\s*)(${NAME})`,
  "gi"
);

// ---------------------------------------------------------------------------
// Redaction passes
// ---------------------------------------------------------------------------

type Pass = (text: string, tok: Tokeniser) => string;

const digitsOf = (s: string) => s.replace(/\D/g, "");

const redactMrn: Pass = (text, tok) =>
  text.replace(MRN_RE, (_m, kw: string, id: string) =>
    kw + tok.tokenFor("MRN", id, id.toUpperCase())
  );

const redactAccount: Pass = (text, tok) =>
  text.replace(ACCOUNT_KW_RE, (_m, kw: string, id: string) =>
    kw + tok.tokenFor("ACCOUNT_NUMBER", id, id.toUpperCase())
  );

const redactDob: Pass = (text, tok) =>
  text.replace(DOB_RE, (_m, kw: string, date: string) =>
    kw + tok.tokenFor("DATE_OF_BIRTH", date)
  );

const redactNhs: Pass = (text, tok) =>
  text.replace(NHS_RE, (m, raw: string) => {
    const d = digitsOf(raw);
    if (d.length === 10 && isValidNhs(d)) return tok.tokenFor("NHS_NUMBER", raw, d);
    return m;
  });

const redactNi: Pass = (text, tok) =>
  text.replace(NI_RE, (m, p1: string, p2: string, p3: string, p4: string, p5: string) => {
    if (!isValidNi(p1)) return m;
    const key = (p1 + p2 + p3 + p4 + p5).toUpperCase();
    return tok.tokenFor("NI_NUMBER", m.trim(), key);
  });

const redactSsn: Pass = (text, tok) => {
  let out = text.replace(SSN_FMT_RE, (m, a: string, _sep: string, b: string, c: string) => {
    if (b === "00" || c === "0000") return m;
    return tok.tokenFor("SSN", m, a + b + c);
  });
  out = out.replace(SSN_KW_RE, (m, kw: string, num: string) => {
    if (num.slice(3, 5) === "00" || num.slice(5, 9) === "0000") return m;
    return kw + tok.tokenFor("SSN", num, num);
  });
  return out;
};

const redactCard: Pass = (text, tok) =>
  text.replace(CARD_RE, (m) => {
    const d = digitsOf(m);
    if (d.length >= 13 && d.length <= 19 && isValidLuhn(d)) {
      return tok.tokenFor("CARD_NUMBER", m.trim(), d);
    }
    return m;
  });

const redactIban: Pass = (text, tok) =>
  text.replace(IBAN_RE, (m) => {
    const clean = m.replace(/\s/g, "");
    if (clean.length >= 15 && clean.length <= 34) {
      return tok.tokenFor("IBAN", m, clean.toUpperCase());
    }
    return m;
  });

const redactUrl: Pass = (text, tok) =>
  text.replace(URL_RE, (m) => tok.tokenFor("URL", m, m.toLowerCase()));

const redactEmail: Pass = (text, tok) =>
  text.replace(EMAIL_RE, (m) => tok.tokenFor("EMAIL", m, m.toLowerCase()));

const redactPhone: Pass = (text, tok) => {
  const mk = (m: string) => tok.tokenFor("PHONE", m.trim(), digitsOf(m));
  let out = text.replace(
    /(?<!\d)\+44[\s-]?(?:\(0\))?[\s-]?\d{2,5}[\s-]?\d{3,4}[\s-]?\d{3,4}(?!\d)/g,
    mk
  );
  out = out.replace(/(?<!\d)\+1[\s\-.]?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}(?!\d)/g, mk);
  out = out.replace(/(?<!\d)\(?0\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}(?!\d)/g, (m) => {
    const len = digitsOf(m).length;
    return len >= 10 && len <= 11 ? mk(m) : m;
  });
  out = out.replace(/(?<!\d)\(?[2-9]\d{2}\)?[\s\-.][2-9]\d{2}[\s\-.]\d{4}(?!\d)/g, mk);
  return out;
};

const redactPostcode: Pass = (text, tok) =>
  text.replace(POSTCODE_RE, (m) => {
    const clean = m.replace(/\s/g, "");
    if (clean.length >= 5 && clean.length <= 7) {
      return tok.tokenFor("POSTCODE", m, clean.toUpperCase());
    }
    return m;
  });

const redactZip: Pass = (text, tok) => {
  let out = text.replace(ZIP_KW_RE, (_m, kw: string, zip: string) =>
    kw + tok.tokenFor("ZIP", zip)
  );
  out = out.replace(ZIP_STATE_RE, (_m, pre: string, zip: string) =>
    pre + tok.tokenFor("ZIP", zip)
  );
  return out;
};

const redactIp: Pass = (text, tok) =>
  text.replace(IP_RE, (m) => tok.tokenFor("IP_ADDRESS", m));

const redactPlate: Pass = (text, tok) =>
  text.replace(UK_PLATE_RE, (m) =>
    tok.tokenFor("VEHICLE_REG", m, m.replace(/\s/g, "").toUpperCase())
  );

const redactName: Pass = (text, tok) => {
  const nameToken = (raw: string) =>
    tok.tokenFor("PATIENT_NAME", raw.trim(), raw.trim().toLowerCase().replace(/\s+/g, " "));
  // Courtesy-titled names first, so the title is absorbed into the token.
  let out = text.replace(NAME_TITLE_RE, (_m, name: string) => nameToken(name));
  // Salutations without a courtesy title (clinical titles already excluded).
  out = out.replace(NAME_SALUTATION_RE, (_m, dear: string, name: string) =>
    `${dear} ${nameToken(name)}`
  );
  // Labelled names — preserve the original label + separator.
  out = out.replace(NAME_LABEL_RE, (_m, prefix: string, name: string) =>
    prefix + nameToken(name)
  );
  return out;
};

// Order matters: keyword-anchored and checksum-validated patterns first,
// weaker heuristics last, so high-confidence matches win any overlap.
const CLINICAL_PASSES: Pass[] = [
  redactMrn,
  redactDob,
  redactNhs,
  redactNi,
  redactSsn,
  redactEmail,
  redactPhone,
  redactPostcode,
  redactZip,
  redactName,
];

const GENERAL_PASSES: Pass[] = [
  redactAccount,
  redactCard,
  redactIban,
  redactUrl,
  redactEmail,
  redactPhone,
  redactPostcode,
  redactZip,
  redactIp,
  redactPlate,
  redactName,
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RedactionResult {
  text: string;
  changed: boolean;
}

/**
 * A Redactor keeps one Tokeniser across many texts, so the same identifier
 * gets the same token on every sticky note on the board.
 */
export class Redactor {
  private tok = new Tokeniser();
  private passes: Pass[];

  constructor(categories: Category[]) {
    const seen = new Set<Pass>();
    const passes: Pass[] = [];
    if (categories.includes("clinical")) {
      for (const p of CLINICAL_PASSES) if (!seen.has(p)) (seen.add(p), passes.push(p));
    }
    if (categories.includes("general")) {
      for (const p of GENERAL_PASSES) if (!seen.has(p)) (seen.add(p), passes.push(p));
    }
    this.passes = passes;
  }

  redactText(input: string): RedactionResult {
    // Normalise non-breaking spaces so spaced identifiers still match.
    let text = input.replace(/[   ]/g, " ");
    for (const pass of this.passes) text = pass(text, this.tok);
    return { text, changed: text !== input };
  }

  /** {token_type: number_of_distinct_values} */
  get report(): Record<string, number> {
    const report: Record<string, number> = {};
    for (const token of Object.keys(this.tok.tokenMap)) {
      const type = token.slice(1, -1).replace(/_\d+$/, "");
      report[type] = (report[type] ?? 0) + 1;
    }
    return report;
  }

  /** {token: original_value} — for review / re-identification. Handle with care. */
  get tokenMap(): Record<string, string> {
    return { ...this.tok.tokenMap };
  }
}
