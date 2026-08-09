/**
 * PrivacyGateway — the protect → work-on-tokens → controlled-release loop as
 * a library, mirroring the discipline the Redacta MCP server enforces.
 *
 * Honesty about the trust model: an in-process library cannot ENFORCE a
 * boundary — the caller's process holds the sessions. What it provides is the
 * same discipline: mappings never travel with the text, restoration is an
 * explicit act against an expiring session, and output can be screened before
 * release. For enforcement against an untrusted consumer, put a process
 * boundary in between (the Redacta MCP server, or a service wrapping this
 * class).
 *
 * Environment: this package is dependency-free and runs in Node, browsers and
 * bare JavaScriptCore. No Node APIs are used. Session IDs come from
 * globalThis.crypto.getRandomValues when available, or an injected
 * idGenerator; if neither exists, session creation throws with a clear
 * message (nothing touches crypto at module load).
 */

import { Redactor, reinstate, selfCheck } from "./redact.js";
import type { Category, ResidualFinding } from "./redact.js";

export class GatewayError extends Error {}

/** The single generic error for any failed session lookup — no probing. */
export const SESSION_ERROR = "Unknown or expired session.";

// ---------------------------------------------------------------------------
// Session IDs
// ---------------------------------------------------------------------------

interface MinimalCrypto {
  getRandomValues?: (array: Uint8Array) => Uint8Array;
}

function defaultIdGenerator(): string {
  const cryptoObj = (globalThis as { crypto?: MinimalCrypto }).crypto;
  if (!cryptoObj?.getRandomValues) {
    throw new GatewayError(
      "No crypto.getRandomValues in this environment. Pass idGenerator to " +
        "PrivacyGateway (it must return unguessable, unique strings)."
    );
  }
  const bytes = new Uint8Array(16);
  cryptoObj.getRandomValues(bytes);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return "rdx_" + hex;
}

// ---------------------------------------------------------------------------
// Output guard (also exported standalone)
// ---------------------------------------------------------------------------

export interface Leak {
  token: string;
  category: string;
}

export interface GuardResult {
  safe: boolean;
  leaks: Leak[];
  sanitizedText: string;
}

function categoryOf(token: string): string {
  const m = /^\[([A-Z_]+)_\d+\]$/.exec(token);
  return m ? m[1] : "UNKNOWN";
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Matcher for one original value: values containing digits get spacing/dash
 * tolerance between characters ("943 476 5919" also matches "9434765919");
 * text values match case-insensitively as written.
 */
function matcherFor(original: string): RegExp {
  if (/\d/.test(original)) {
    const chars = original.replace(/[^A-Za-z0-9@._]/g, "").split("");
    if (chars.length >= 4) {
      const body = chars.map(escapeRe).join("[\\s\\-]*");
      return new RegExp(`(?<![A-Za-z0-9])${body}(?![A-Za-z0-9])`, "gi");
    }
  }
  return new RegExp(`(?<![A-Za-z0-9])${escapeRe(original)}(?![A-Za-z0-9])`, "gi");
}

/**
 * Variants to scan for: the engine stores some names with a courtesy title
 * ("Mrs Patricia Hartley"); a model may reproduce the name without it.
 */
function candidatesFor(original: string): string[] {
  const out = [original];
  const stripped = original.replace(/^(?:Mr|Mrs|Ms|Miss|Mx)\.?\s+/i, "");
  if (stripped !== original && stripped.length >= 3) out.push(stripped);
  return out;
}

/**
 * Scan text for verbatim reappearance of original values from a token map and
 * re-tokenise anything found. Scope is deliberately narrow and honestly
 * stated: verbatim (with spacing/case tolerance) only — paraphrase, inference
 * and data learned elsewhere are not detected. Never echoes raw values.
 */
export function guardOutput(
  text: string,
  tokenMap: Record<string, string>
): GuardResult {
  const leaks: Leak[] = [];
  let out = text;
  const entries = Object.entries(tokenMap).sort(
    (a, b) => b[1].length - a[1].length // longest first
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
  return { safe: leaks.length === 0, leaks, sanitizedText: out };
}

// ---------------------------------------------------------------------------
// PrivacyGateway
// ---------------------------------------------------------------------------

export interface GatewayOptions {
  /** Detection categories. Default: clinical + general. */
  categories?: Category[];
  /** Session lifetime in ms. Default: 60 minutes. */
  sessionTtlMs?: number;
  /** Max concurrent sessions; oldest evicted at the cap. Default: 64. */
  maxSessions?: number;
  /** Override the session-ID source (needed on hosts without Web Crypto). */
  idGenerator?: () => string;
  /** Override the clock (for tests). */
  now?: () => number;
}

export interface ProtectResult {
  /** The protected text — identifiers replaced with labelled tokens. */
  text: string;
  /** Opaque session handle, or null when nothing was detected. */
  sessionId: string | null;
  /** Epoch ms when the session expires (null when no session). */
  expiresAt: number | null;
  /** {token_type: number_of_distinct_values} */
  report: Record<string, number>;
  /** Possible leftovers flagged for human review. */
  selfCheck: ResidualFinding[];
}

export interface ReleaseResult {
  text: string;
  changed: boolean;
  tokensRestored: number;
}

interface GatewaySession {
  tokenMap: Record<string, string>;
  createdAt: number;
  expiresAt: number;
}

export class PrivacyGateway {
  private sessions = new Map<string, GatewaySession>();
  private categories: Category[];
  private ttlMs: number;
  private maxSessions: number;
  private idGenerator: () => string;
  private now: () => number;

  constructor(opts: GatewayOptions = {}) {
    this.categories =
      opts.categories && opts.categories.length
        ? opts.categories
        : ["clinical", "general"];
    this.ttlMs = opts.sessionTtlMs ?? 60 * 60_000;
    this.maxSessions = opts.maxSessions ?? 64;
    this.idGenerator = opts.idGenerator ?? defaultIdGenerator;
    this.now = opts.now ?? Date.now;
  }

  private sweep(): void {
    const now = this.now();
    for (const [id, s] of this.sessions) {
      if (s.expiresAt <= now) this.sessions.delete(id);
    }
  }

  private requireSession(sessionId: string): GatewaySession {
    this.sweep();
    const session =
      typeof sessionId === "string" ? this.sessions.get(sessionId) : undefined;
    if (!session) throw new GatewayError(SESSION_ERROR);
    return session;
  }

  /** Redact text; the token map stays inside the gateway's session store. */
  protect(text: string): ProtectResult {
    const redactor = new Redactor([...this.categories]);
    const { text: redacted } = redactor.redactText(text);
    const tokenMap = redactor.tokenMap;
    const residual = selfCheck(redacted);

    let sessionId: string | null = null;
    let expiresAt: number | null = null;
    if (Object.keys(tokenMap).length > 0) {
      this.sweep();
      while (this.sessions.size >= this.maxSessions) {
        const oldest = this.sessions.keys().next().value;
        if (oldest === undefined) break;
        this.sessions.delete(oldest);
      }
      const now = this.now();
      sessionId = this.idGenerator();
      expiresAt = now + this.ttlMs;
      this.sessions.set(sessionId, { tokenMap, createdAt: now, expiresAt });
    }
    return {
      text: redacted,
      sessionId,
      expiresAt,
      report: redactor.report,
      selfCheck: residual,
    };
  }

  /** Restore originals from the session's map. Throws SESSION_ERROR generically. */
  release(text: string, sessionId: string): ReleaseResult {
    const session = this.requireSession(sessionId);
    const tokensRestored = Object.keys(session.tokenMap).filter((t) =>
      text.includes(t)
    ).length;
    const { text: restored, changed } = reinstate(text, session.tokenMap);
    return { text: restored, changed, tokensRestored };
  }

  /** Verbatim-leak scan against the session's originals. Never echoes values. */
  checkOutput(text: string, sessionId: string): GuardResult {
    const session = this.requireSession(sessionId);
    return guardOutput(text, session.tokenMap);
  }

  /** Idempotent early deletion of a session's mapping. */
  discardSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.sweep();
  }

  /** Live session count (after sweeping expired sessions). */
  get sessionCount(): number {
    this.sweep();
    return this.sessions.size;
  }
}
