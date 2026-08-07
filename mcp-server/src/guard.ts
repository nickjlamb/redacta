/**
 * Output guard: scan model output for verbatim reappearance of the original
 * values held in a session, and re-tokenise anything found.
 *
 * Scope is deliberately narrow and honestly stated: this catches values from
 * the ACTIVE SESSION appearing verbatim (with case, spacing and dash
 * tolerance for identifier-like values). It does not catch paraphrase,
 * inference, misspellings, or data the model learned through another channel.
 *
 * Results never echo the leaked raw values — only the token and its category.
 */

export interface Leak {
  token: string;
  category: string;
}

export interface GuardResult {
  safe: boolean;
  leaks: Leak[];
  sanitized_text: string;
}

function categoryOf(token: string): string {
  // "[NHS_NUMBER_1]" -> "NHS_NUMBER"
  const m = /^\[([A-Z_]+)_\d+\]$/.exec(token);
  return m ? m[1] : "UNKNOWN";
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a matcher for one original value.
 * Values containing digits get spacing/dash tolerance between characters
 * ("943 476 5919" also matches "9434765919" and "943-476-5919"); pure-text
 * values (names, emails) match case-insensitively as written.
 */
function matcherFor(original: string): RegExp {
  const hasDigits = /\d/.test(original);
  if (hasDigits) {
    const chars = original.replace(/[^A-Za-z0-9@._]/g, "").split("");
    if (chars.length >= 4) {
      const body = chars.map(escapeRe).join("[\\s\\-]*");
      return new RegExp(`(?<![A-Za-z0-9])${body}(?![A-Za-z0-9])`, "gi");
    }
  }
  return new RegExp(`(?<![A-Za-z0-9])${escapeRe(original)}(?![A-Za-z0-9])`, "gi");
}

/**
 * Variants of an original value to scan for. The engine stores some names
 * with their courtesy title ("Mrs Patricia Hartley"); a model may reproduce
 * the name without it, so the title-stripped form is scanned too.
 */
function candidatesFor(original: string): string[] {
  const out = [original];
  const stripped = original.replace(/^(?:Mr|Mrs|Ms|Miss|Mx)\.?\s+/i, "");
  if (stripped !== original && stripped.length >= 3) out.push(stripped);
  return out;
}

export function guardOutput(
  text: string,
  tokenMap: Record<string, string>
): GuardResult {
  const leaks: Leak[] = [];
  let out = text;
  // Longest originals first so contained values don't shadow longer ones.
  const entries = Object.entries(tokenMap).sort(
    (a, b) => b[1].length - a[1].length
  );
  for (const [token, original] of entries) {
    if (!original) continue;
    let leaked = false;
    for (const candidate of candidatesFor(original)) {
      const re = matcherFor(candidate);
      if (re.test(out)) {
        out = out.replace(re, token);
        leaked = true;
      }
    }
    if (leaked) leaks.push({ token, category: categoryOf(token) });
  }
  return { safe: leaks.length === 0, leaks, sanitized_text: out };
}
