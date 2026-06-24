(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // npm-package/dist/redact.js
  function isValidNhs(digits) {
    if (!/^\d{10}$/.test(digits))
      return false;
    if (digits === digits[0].repeat(10))
      return false;
    const weights = [10, 9, 8, 7, 6, 5, 4, 3, 2];
    const total = weights.reduce((sum, w, i) => sum + Number(digits[i]) * w, 0);
    let check = 11 - total % 11;
    if (check === 11)
      check = 0;
    if (check === 10)
      return false;
    return check === Number(digits[9]);
  }
  var NI_INVALID_PREFIX = /* @__PURE__ */ new Set(["BG", "GB", "NK", "KN", "TN", "NT", "ZZ"]);
  var NI_PREFIX1_BAD = new Set("DFIQUV");
  var NI_PREFIX2_BAD = new Set("DFIOQUV");
  function isValidNi(prefix) {
    const p = prefix.toUpperCase();
    if (p.length !== 2 || NI_INVALID_PREFIX.has(p))
      return false;
    return !NI_PREFIX1_BAD.has(p[0]) && !NI_PREFIX2_BAD.has(p[1]);
  }
  function isValidLuhn(digits) {
    if (!/^\d{13,19}$/.test(digits))
      return false;
    let sum = 0;
    let dbl = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let d = Number(digits[i]);
      if (dbl) {
        d *= 2;
        if (d > 9)
          d -= 9;
      }
      sum += d;
      dbl = !dbl;
    }
    return sum % 10 === 0;
  }
  var Tokeniser = class {
    constructor() {
      __publicField(this, "byKey", /* @__PURE__ */ new Map());
      __publicField(this, "counters", /* @__PURE__ */ new Map());
      __publicField(this, "tokenMap", {});
    }
    tokenFor(type, original, key) {
      var _a;
      const k = `${type}::${key != null ? key : original}`;
      const existing = this.byKey.get(k);
      if (existing)
        return existing;
      const n = ((_a = this.counters.get(type)) != null ? _a : 0) + 1;
      this.counters.set(type, n);
      const token = `[${type}_${n}]`;
      this.byKey.set(k, token);
      this.tokenMap[token] = original;
      return token;
    }
  };
  var MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec";
  var DATE = [
    String.raw`\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}`,
    String.raw`\d{4}-\d{2}-\d{2}`,
    String.raw`\d{1,2}(?:st|nd|rd|th)?\s+(?:${MONTHS})\s+\d{4}`,
    String.raw`(?:${MONTHS})\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}`
  ].map((s) => `(?:${s})`).join("|");
  var DOB_RE = new RegExp(String.raw`(\b(?:date\s+of\s+birth|d\.?o\.?b\.?|born(?:\s+on)?)[\s:.]*)((?:${DATE}))`, "gi");
  var NHS_RE = /\b(\d{3}[\s-]?\d{3}[\s-]?\d{4})\b/g;
  var NI_RE = /\b([A-Za-z]{2})\s?(\d{2})\s?(\d{2})\s?(\d{2})\s?([A-Da-d])\b/g;
  var SSN_FMT_RE = /(?<!\d)(?!000|666|9\d\d)(\d{3})([-\s])(\d{2})\2(\d{4})(?!\d)/g;
  var SSN_KW_RE = /((?:SSN|Social\s*Security(?:\s*(?:Number|No\.?|#))?)[\s:]*)((?!000|666|9\d\d)\d{9})(?!\d)/gi;
  var EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  var MRN_RE = /((?:MRN|Hospital\s*(?:No\.?|Number)|Hosp\.?\s*(?:No\.?|Number)|Patient\s*ID|Unit\s*(?:No\.?|Number))[\s:]*)([A-Z0-9-]{4,15})/gi;
  var POSTCODE_RE = /\b(GIR\s?0AA|[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\b/gi;
  var US_STATES = "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC";
  var ZIP_KW_RE = /((?:ZIP|Zip\s*Code|Postal\s*Code)[\s:]*)(\d{5}(?:-\d{4})?)(?!\d)/gi;
  var ZIP_STATE_RE = new RegExp(String.raw`((?:,?\s)(?:${US_STATES})\s+)(\d{5}(?:-\d{4})?)(?!\d)`, "g");
  var URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'\])]+/gi;
  var IP_RE = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;
  var CARD_RE = /(?<![\d-])(?:\d[ -]?){12,18}\d(?![\d-])/g;
  var IBAN_RE = /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,3})?\b/g;
  var ACCOUNT_KW_RE = /((?:Account|Acct\.?|Member\s*ID|Policy\s*(?:No\.?|Number)|Insurance\s*ID)\s*(?:No\.?|Number|#)?[\s:]*)((?=[A-Z0-9-]*\d)[A-Z0-9-]{5,17})/gi;
  var UK_PLATE_RE = /\b[A-Z]{2}\d{2}\s?[A-Z]{3}\b/g;
  var NAME = String.raw`[A-Z][a-z]+(?:['’\-][A-Za-z]+)?(?:[ \t]+[A-Z][a-z]+(?:['’\-][A-Za-z]+)?){0,2}`;
  var STRICT_NAME_RE = new RegExp("^" + NAME);
  function leadingName(s) {
    const m = s.match(STRICT_NAME_RE);
    if (!m)
      return null;
    return { name: m[0], rest: s.slice(m[0].length) };
  }
  var COURTESY_TITLE = "Mr|Mrs|Ms|Miss|Mx";
  var CLINICAL_TITLE = "Dr|Doctor|Prof|Professor|Consultant|Nurse|Sister|Matron|Surgeon|Registrar";
  var NAME_TITLE_RE = new RegExp(String.raw`\b(?:${COURTESY_TITLE})\.?\s+(${NAME})`, "g");
  var NAME_SALUTATION_RE = new RegExp(String.raw`\b(Dear)\s+(?!(?:${CLINICAL_TITLE})\b)(${NAME})`, "g");
  var NAME_LABEL_RE = new RegExp(String.raw`\b((?:Patient(?:\s+Name)?|Name|Client|Re)\s*[:\-]\s*)(${NAME})`, "gi");
  var RELATION = "daughter|son|wife|husband|partner|spouse|mother|father|mum|mom|dad|sister|brother|sibling|grandson|granddaughter|grandmother|grandfather|grandparent|aunt|uncle|niece|nephew|cousin|carer|caregiver|guardian|parent|next\\s+of\\s+kin|nok|relative|widow|widower";
  var RELATIVE_NAME_RE = new RegExp(String.raw`\b(${RELATION})([:,\-]?[ \t]+)(${NAME})`, "gi");
  var digitsOf = (s) => s.replace(/\D/g, "");
  var redactMrn = (text, tok) => text.replace(MRN_RE, (_m, kw, id) => kw + tok.tokenFor("MRN", id, id.toUpperCase()));
  var redactAccount = (text, tok) => text.replace(ACCOUNT_KW_RE, (_m, kw, id) => kw + tok.tokenFor("ACCOUNT_NUMBER", id, id.toUpperCase()));
  var redactDob = (text, tok) => text.replace(DOB_RE, (_m, kw, date) => kw + tok.tokenFor("DATE_OF_BIRTH", date));
  var redactNhs = (text, tok) => text.replace(NHS_RE, (m, raw) => {
    const d = digitsOf(raw);
    if (d.length === 10 && isValidNhs(d))
      return tok.tokenFor("NHS_NUMBER", raw, d);
    return m;
  });
  var redactNi = (text, tok) => text.replace(NI_RE, (m, p1, p2, p3, p4, p5) => {
    if (!isValidNi(p1))
      return m;
    const key = (p1 + p2 + p3 + p4 + p5).toUpperCase();
    return tok.tokenFor("NI_NUMBER", m.trim(), key);
  });
  var redactSsn = (text, tok) => {
    let out = text.replace(SSN_FMT_RE, (m, a, _sep, b, c) => {
      if (b === "00" || c === "0000")
        return m;
      return tok.tokenFor("SSN", m, a + b + c);
    });
    out = out.replace(SSN_KW_RE, (m, kw, num) => {
      if (num.slice(3, 5) === "00" || num.slice(5, 9) === "0000")
        return m;
      return kw + tok.tokenFor("SSN", num, num);
    });
    return out;
  };
  var redactCard = (text, tok) => text.replace(CARD_RE, (m) => {
    const d = digitsOf(m);
    if (d.length >= 13 && d.length <= 19 && isValidLuhn(d)) {
      return tok.tokenFor("CARD_NUMBER", m.trim(), d);
    }
    return m;
  });
  var redactIban = (text, tok) => text.replace(IBAN_RE, (m) => {
    const clean = m.replace(/\s/g, "");
    if (clean.length >= 15 && clean.length <= 34) {
      return tok.tokenFor("IBAN", m, clean.toUpperCase());
    }
    return m;
  });
  var redactUrl = (text, tok) => text.replace(URL_RE, (m) => tok.tokenFor("URL", m, m.toLowerCase()));
  var redactEmail = (text, tok) => text.replace(EMAIL_RE, (m) => tok.tokenFor("EMAIL", m, m.toLowerCase()));
  var redactPhone = (text, tok) => {
    const mk = (m) => tok.tokenFor("PHONE", m.trim(), digitsOf(m));
    let out = text.replace(/(?<!\d)\+44[\s-]?(?:\(0\))?[\s-]?\d{2,5}[\s-]?\d{3,4}[\s-]?\d{3,4}(?!\d)/g, mk);
    out = out.replace(/(?<!\d)\+1[\s\-.]?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}(?!\d)/g, mk);
    out = out.replace(/(?<!\d)\(?0\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}(?!\d)/g, (m) => {
      const len = digitsOf(m).length;
      return len >= 10 && len <= 11 ? mk(m) : m;
    });
    out = out.replace(/(?<!\d)\(?[2-9]\d{2}\)?[\s\-.][2-9]\d{2}[\s\-.]\d{4}(?!\d)/g, mk);
    return out;
  };
  var redactPostcode = (text, tok) => text.replace(POSTCODE_RE, (m) => {
    const clean = m.replace(/\s/g, "");
    if (clean.length >= 5 && clean.length <= 7) {
      return tok.tokenFor("POSTCODE", m, clean.toUpperCase());
    }
    return m;
  });
  var redactZip = (text, tok) => {
    let out = text.replace(ZIP_KW_RE, (_m, kw, zip) => kw + tok.tokenFor("ZIP", zip));
    out = out.replace(ZIP_STATE_RE, (_m, pre, zip) => pre + tok.tokenFor("ZIP", zip));
    return out;
  };
  var redactIp = (text, tok) => text.replace(IP_RE, (m) => tok.tokenFor("IP_ADDRESS", m));
  var redactPlate = (text, tok) => text.replace(UK_PLATE_RE, (m) => tok.tokenFor("VEHICLE_REG", m, m.replace(/\s/g, "").toUpperCase()));
  var redactRelative = (text, tok) => text.replace(RELATIVE_NAME_RE, (m, rel, sep, name) => {
    const split = leadingName(name);
    if (!split)
      return m;
    return rel + sep + tok.tokenFor("RELATIVE_NAME", split.name, split.name.toLowerCase()) + split.rest;
  });
  var redactName = (text, tok) => {
    const nameToken = (raw) => tok.tokenFor("PATIENT_NAME", raw.trim(), raw.trim().toLowerCase().replace(/\s+/g, " "));
    let out = text.replace(NAME_TITLE_RE, (m, name) => tok.tokenFor("PATIENT_NAME", m.trim(), name.trim().toLowerCase().replace(/\s+/g, " ")));
    out = out.replace(NAME_SALUTATION_RE, (_m, dear, name) => `${dear} ${nameToken(name)}`);
    out = out.replace(NAME_LABEL_RE, (m, prefix, name) => {
      const split = leadingName(name);
      if (!split)
        return m;
      return prefix + nameToken(split.name) + split.rest;
    });
    return out;
  };
  var ANY_DATE_RE = new RegExp("(?:" + DATE + ")", "g");
  var AGE_PHRASE_RE = /\b\d{1,3}[\s-]?(?:years?[\s-]?old|y\/?o)\b/gi;
  var AGE_LABEL_RE = /\b(aged|age)([:\s]+)(\d{1,3})\b/gi;
  var FAX_RE = /\b(fax(?:\s*(?:no\.?|number|#))?[:\s]+)(\+?[\d(][\d().\s-]{6,}\d)/gi;
  var LICENSE_RE = /\b((?:licen[cs]e|certificate|cert\.?|registration)\s*(?:no\.?|number|#)?[:\s]+)([A-Z0-9][A-Z0-9-]{3,})/gi;
  var DEVICE_RE = /\b((?:serial|device\s*(?:id|identifier|no\.?|number)|imei)\s*(?:no\.?|number|#)?[:\s]+)([A-Z0-9][A-Z0-9-]{4,})/gi;
  var VIN_RE = /\b[A-HJ-NPR-Z0-9]{17}\b/g;
  var HEALTH_PLAN_RE = /\b((?:health\s*plan|beneficiary|medicare|medicaid)\s*(?:id|no\.?|number|#)?[:\s]+)([A-Z0-9][A-Z0-9-]{4,})/gi;
  var redactAllDates = (text, tok) => text.replace(ANY_DATE_RE, (m) => tok.tokenFor("DATE", m));
  var redactAge = (text, tok) => {
    let out = text.replace(AGE_PHRASE_RE, (m) => tok.tokenFor("AGE", m.trim(), m.replace(/\D/g, "")));
    out = out.replace(AGE_LABEL_RE, (_m, kw, sep, num) => kw + sep + tok.tokenFor("AGE", num));
    return out;
  };
  var redactFax = (text, tok) => text.replace(FAX_RE, (_m, kw, num) => kw + tok.tokenFor("FAX", num.trim(), digitsOf(num)));
  var redactLicense = (text, tok) => text.replace(LICENSE_RE, (_m, kw, id) => kw + tok.tokenFor("LICENSE", id, id.toUpperCase()));
  var redactDevice = (text, tok) => text.replace(DEVICE_RE, (_m, kw, id) => kw + tok.tokenFor("DEVICE_ID", id, id.toUpperCase()));
  var redactVin = (text, tok) => text.replace(VIN_RE, (m) => {
    if (!/\d/.test(m) || !/[A-Z]/.test(m))
      return m;
    return tok.tokenFor("VIN", m, m.toUpperCase());
  });
  var redactHealthPlan = (text, tok) => text.replace(HEALTH_PLAN_RE, (_m, kw, id) => kw + tok.tokenFor("HEALTH_PLAN_NUMBER", id, id.toUpperCase()));
  var CLINICAL_PASSES = [
    redactMrn,
    redactDob,
    redactNhs,
    redactNi,
    redactSsn,
    redactEmail,
    redactPhone,
    redactPostcode,
    redactZip,
    redactRelative,
    redactName
  ];
  var GENERAL_PASSES = [
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
    redactRelative,
    redactName
  ];
  var SAFE_HARBOR_PRE_PASSES = [redactFax];
  var SAFE_HARBOR_EXTRA_PASSES = [
    redactAge,
    redactLicense,
    redactDevice,
    redactVin,
    redactHealthPlan,
    redactAllDates
  ];
  var RESIDUAL_CHECKS = [
    { label: "long number (10+ digits)", re: /(?<![\d-])\d[\d\s-]{8,}\d(?![\d-])/g },
    { label: "email address", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
    { label: "UK postcode", re: /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/gi },
    { label: "URL", re: /\b(?:https?:\/\/|www\.)\S+/gi }
  ];
  var Redactor = class {
    constructor(categories) {
      __publicField(this, "tok", new Tokeniser());
      __publicField(this, "passes");
      const safeHarbor = categories.includes("safeharbor");
      const seen = /* @__PURE__ */ new Set();
      const passes = [];
      if (safeHarbor) {
        for (const p of SAFE_HARBOR_PRE_PASSES)
          if (!seen.has(p))
            seen.add(p), passes.push(p);
      }
      if (categories.includes("clinical") || safeHarbor) {
        for (const p of CLINICAL_PASSES)
          if (!seen.has(p))
            seen.add(p), passes.push(p);
      }
      if (categories.includes("general") || safeHarbor) {
        for (const p of GENERAL_PASSES)
          if (!seen.has(p))
            seen.add(p), passes.push(p);
      }
      if (safeHarbor) {
        for (const p of SAFE_HARBOR_EXTRA_PASSES)
          if (!seen.has(p))
            seen.add(p), passes.push(p);
      }
      this.passes = passes;
    }
    redactText(input) {
      let text = input.replace(/[   ]/g, " ");
      for (const pass of this.passes)
        text = pass(text, this.tok);
      return { text, changed: text !== input };
    }
    /** {token_type: number_of_distinct_values} */
    get report() {
      var _a;
      const report = {};
      for (const token of Object.keys(this.tok.tokenMap)) {
        const type = token.slice(1, -1).replace(/_\d+$/, "");
        report[type] = ((_a = report[type]) != null ? _a : 0) + 1;
      }
      return report;
    }
    /** {token: original_value} — for review / re-identification. Handle with care. */
    get tokenMap() {
      return { ...this.tok.tokenMap };
    }
  };
  function reinstate(text, tokenMap) {
    let out = text;
    for (const [token, original] of Object.entries(tokenMap)) {
      if (token)
        out = out.split(token).join(original);
    }
    return { text: out, changed: out !== text };
  }
  function isValidTokenMap(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return false;
    const entries = Object.entries(value);
    if (entries.length === 0)
      return false;
    return entries.every(([k, v]) => /^\[[A-Z_]+_\d+\]$/.test(k) && typeof v === "string");
  }
  function selfCheck(redactedText) {
    const seen = /* @__PURE__ */ new Set();
    const findings = [];
    for (const { label, re } of RESIDUAL_CHECKS) {
      for (const match of redactedText.matchAll(re)) {
        const sample = match[0].trim();
        if (/^\[[A-Z_]+_\d+\]$/.test(sample))
          continue;
        const key = `${label}:${sample.toLowerCase()}`;
        if (seen.has(key))
          continue;
        seen.add(key);
        findings.push({ label, sample });
        if (findings.length >= 20)
          return findings;
      }
    }
    return findings;
  }

  // ios-app/RedactaEngine/entry.mjs
  function redact(text, modesCsv) {
    const modes = (modesCsv || "clinical").split(",").map((m) => m.trim()).filter(Boolean);
    const r = new Redactor(modes.length ? modes : ["clinical"]);
    const { text: out, changed } = r.redactText(text);
    return {
      text: out,
      changed,
      report: r.report,
      tokenMap: r.tokenMap,
      residuals: selfCheck(out)
    };
  }
  globalThis.Redacta = {
    redact,
    reinstate: (text, map) => reinstate(text, map),
    selfCheck,
    isValidTokenMap,
    isValidNhs,
    isValidNi,
    isValidLuhn,
    version: "1.0.0-ios-proto"
  };
})();
