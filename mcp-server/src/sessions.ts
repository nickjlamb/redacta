/**
 * In-memory session store: the private side of the privacy boundary.
 *
 * A session holds the token map produced by `protect`. It lives only in this
 * process's memory — it is never returned to the MCP client, never written to
 * disk, and disappears when the server exits or the session expires. That is
 * the safe failure direction.
 *
 * Every lookup failure (unknown, expired, evicted, discarded) is reported to
 * the caller with the same generic error so session IDs cannot be probed.
 */

import { randomBytes } from "node:crypto";

export interface Session {
  id: string;
  tokenMap: Record<string, string>;
  categories: string[];
  createdAt: number;
  expiresAt: number;
}

/** The single generic error message for any failed session lookup. */
export const SESSION_ERROR = "Unknown or expired session.";

export class SessionStore {
  private sessions = new Map<string, Session>();

  constructor(
    private ttlMs: number,
    private maxSessions: number,
    private clock: () => number = Date.now
  ) {}

  /** Remove expired sessions; called on every store access. */
  private sweep(): void {
    const now = this.clock();
    for (const [id, s] of this.sessions) {
      if (s.expiresAt <= now) this.sessions.delete(id);
    }
  }

  create(tokenMap: Record<string, string>, categories: string[]): Session {
    this.sweep();
    // At the cap, evict the oldest session (Map preserves insertion order).
    while (this.sessions.size >= this.maxSessions) {
      const oldest = this.sessions.keys().next().value;
      if (oldest === undefined) break;
      this.sessions.delete(oldest);
    }
    const now = this.clock();
    const session: Session = {
      id: "rdx_" + randomBytes(16).toString("hex"),
      tokenMap,
      categories,
      createdAt: now,
      expiresAt: now + this.ttlMs,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  /** Returns the session, or null for ANY failure (never say which). */
  get(id: string): Session | null {
    this.sweep();
    if (typeof id !== "string" || !id.startsWith("rdx_")) return null;
    return this.sessions.get(id) ?? null;
  }

  /** Idempotent delete. Returns nothing on purpose — no enumeration signal. */
  discard(id: string): void {
    this.sessions.delete(id);
    this.sweep();
  }

  get size(): number {
    this.sweep();
    return this.sessions.size;
  }
}
