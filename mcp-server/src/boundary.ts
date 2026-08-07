/**
 * The privacy boundary: protect / release / check_output / discard handlers,
 * independent of MCP wiring so they can be tested directly.
 *
 * Invariant enforced here and verified by tests: no handler result on the
 * protect path ever contains a token map or an original detected value.
 * Restored content appears ONLY in release_to_client results (explicitly
 * enabled trusted mode) or in files written inside the operator's release
 * directory.
 */

import { Redactor, reinstate, selfCheck } from "@pharmatools/redacta";
import type { AuditSink } from "./audit.js";
import type { Config } from "./config.js";
import { guardOutput, type GuardResult } from "./guard.js";
import { writeRelease } from "./release.js";
import { SESSION_ERROR, SessionStore } from "./sessions.js";

export type Category = "clinical" | "general" | "safeharbor";
export const DEFAULT_CATEGORIES: Category[] = ["clinical", "general"];

export class BoundaryError extends Error {}

export interface ProtectResult {
  text: string;
  session_id: string | null;
  expires_at: string | null;
  report: Record<string, number>;
  self_check: unknown[];
}

export interface FileReleaseResult {
  file: string;
  bytes: number;
  tokens_restored: number;
  changed: boolean;
}

export interface ClientReleaseResult {
  text: string;
  changed: boolean;
  warning: string;
}

export const CLIENT_RELEASE_WARNING =
  "Restored identifiers are now present in this tool result and may enter " +
  "the model context. Handle downstream with care.";

export class Boundary {
  readonly sessions: SessionStore;

  constructor(private config: Config, private audit: AuditSink) {
    this.sessions = new SessionStore(config.sessionTtlMs, config.maxSessions);
  }

  protect(text: string, categories?: Category[]): ProtectResult {
    const cats =
      categories && categories.length ? categories : DEFAULT_CATEGORIES;
    const redactor = new Redactor([...cats]);
    const { text: redacted } = redactor.redactText(text);
    const tokenMap = redactor.tokenMap;
    const report = redactor.report;
    const residual = selfCheck(redacted);

    let sessionId: string | null = null;
    let expiresAt: string | null = null;
    if (Object.keys(tokenMap).length > 0) {
      const session = this.sessions.create(tokenMap, cats);
      sessionId = session.id;
      expiresAt = new Date(session.expiresAt).toISOString();
    }
    this.audit.record("protect", sessionId, {
      categories: report,
      status: "ok",
    });
    return {
      text: redacted,
      session_id: sessionId,
      expires_at: expiresAt,
      report,
      self_check: residual,
    };
  }

  private requireSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.audit.record("release_denied", null, { reason: "unknown_session" });
      throw new BoundaryError(SESSION_ERROR);
    }
    return session;
  }

  private restore(text: string, tokenMap: Record<string, string>) {
    const tokensRestored = Object.keys(tokenMap).filter((t) =>
      text.includes(t)
    ).length;
    const { text: restored, changed } = reinstate(text, tokenMap);
    return { restored, changed, tokensRestored };
  }

  releaseToFile(text: string, sessionId: string): FileReleaseResult {
    if (this.config.releaseMode === "off" || this.config.releaseMode === "client") {
      this.audit.record("release_denied", null, { reason: "mode" });
      throw new BoundaryError("File release is disabled on this server.");
    }
    if (!this.config.releaseDir) {
      throw new BoundaryError(
        "No release directory configured. Set REDACTA_RELEASE_DIR to an " +
          "existing directory where restored output may be written."
      );
    }
    const session = this.requireSession(sessionId);
    const { restored, changed, tokensRestored } = this.restore(
      text,
      session.tokenMap
    );
    const receipt = writeRelease(this.config.releaseDir, restored);
    this.audit.record("release_file", sessionId, {
      tokens_restored: tokensRestored,
      bytes: receipt.bytes,
      status: "ok",
    });
    return {
      file: receipt.file,
      bytes: receipt.bytes,
      tokens_restored: tokensRestored,
      changed,
    };
  }

  releaseToClient(text: string, sessionId: string): ClientReleaseResult {
    if (this.config.releaseMode !== "client" && this.config.releaseMode !== "both") {
      this.audit.record("release_denied", null, { reason: "mode" });
      throw new BoundaryError("Client release is disabled on this server.");
    }
    const session = this.requireSession(sessionId);
    const { restored, changed, tokensRestored } = this.restore(
      text,
      session.tokenMap
    );
    this.audit.record("release_client", sessionId, {
      tokens_restored: tokensRestored,
      status: "ok",
    });
    return { text: restored, changed, warning: CLIENT_RELEASE_WARNING };
  }

  checkOutput(
    text: string,
    sessionId: string
  ): GuardResult & { self_check: unknown[] } {
    const session = this.requireSession(sessionId);
    const result = guardOutput(text, session.tokenMap);
    this.audit.record("check_output", sessionId, {
      leaks: result.leaks.length,
      categories: result.leaks.map((l) => l.category),
      status: result.safe ? "clean" : "leaks_sanitized",
    });
    return { ...result, self_check: selfCheck(result.sanitized_text) };
  }

  discard(sessionId: string): { discarded: true } {
    this.sessions.discard(sessionId);
    this.audit.record("discard", sessionId, { status: "ok" });
    return { discarded: true };
  }
}
