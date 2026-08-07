/**
 * Privacy-safe audit trail: one JSON line per event, appended to the file
 * named by REDACTA_AUDIT_LOG. Disabled when unset.
 *
 * Audit lines NEVER contain: source text, restored output, token maps,
 * detected raw values, full session IDs, or release file contents. Session
 * IDs are logged as the first 12 hex chars of their SHA-256. Audit failures
 * never block the privacy operation itself.
 */

import { createHash } from "node:crypto";
import { appendFileSync } from "node:fs";

export type AuditEvent =
  | "protect"
  | "release_file"
  | "release_client"
  | "release_denied"
  | "check_output"
  | "discard";

export interface AuditSink {
  record(
    event: AuditEvent,
    sessionId: string | null,
    detail?: Record<string, unknown>
  ): void;
}

export function hashSessionId(id: string): string {
  return createHash("sha256").update(id).digest("hex").slice(0, 12);
}

class JsonlAuditSink implements AuditSink {
  constructor(private path: string) {}

  record(
    event: AuditEvent,
    sessionId: string | null,
    detail: Record<string, unknown> = {}
  ): void {
    try {
      const line = JSON.stringify({
        ts: new Date().toISOString(),
        event,
        session: sessionId ? hashSessionId(sessionId) : null,
        ...detail,
      });
      appendFileSync(this.path, line + "\n", { mode: 0o600 });
    } catch {
      // Auditing is best-effort; never fail the operation.
    }
  }
}

class NoopAuditSink implements AuditSink {
  record(): void {}
}

export function makeAuditSink(path: string | null): AuditSink {
  return path ? new JsonlAuditSink(path) : new NoopAuditSink();
}
