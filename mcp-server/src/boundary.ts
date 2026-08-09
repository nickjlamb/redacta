/**
 * The privacy boundary: protect / release / check_output / discard handlers,
 * independent of MCP wiring so they can be tested directly.
 *
 * As of 2.1.0 the session store and output guard live in the engine package
 * (@pharmatools/redacta's PrivacyGateway) — one source of truth across the
 * libraries and this server. What stays here is everything host-specific:
 * release modes, file writing, auditing, and the MCP wire shapes.
 *
 * Invariant enforced here and verified by tests: no handler result on the
 * protect path ever contains a token map or an original detected value.
 * Restored content appears ONLY in release_to_client results (explicitly
 * enabled trusted mode) or in files written inside the operator's release
 * directory.
 */

import {
  GatewayError,
  PrivacyGateway,
  SESSION_ERROR,
  selfCheck,
} from "@pharmatools/redacta";
import type { Category, ResidualFinding } from "@pharmatools/redacta";
import type { AuditSink } from "./audit.js";
import type { Config } from "./config.js";
import { writeRelease } from "./release.js";

export { SESSION_ERROR };
export type { Category };
export const DEFAULT_CATEGORIES: Category[] = ["clinical", "general"];

export class BoundaryError extends Error {}

export interface ProtectResult {
  text: string;
  session_id: string | null;
  expires_at: string | null;
  report: Record<string, number>;
  self_check: ResidualFinding[];
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

export interface CheckOutputResult {
  safe: boolean;
  leaks: { token: string; category: string }[];
  sanitized_text: string;
  self_check: ResidualFinding[];
}

export const CLIENT_RELEASE_WARNING =
  "Restored identifiers are now present in this tool result and may enter " +
  "the model context. Handle downstream with care.";

export class Boundary {
  private gateway: PrivacyGateway;

  constructor(private config: Config, private audit: AuditSink) {
    this.gateway = new PrivacyGateway({
      categories: DEFAULT_CATEGORIES,
      sessionTtlMs: config.sessionTtlMs,
      maxSessions: config.maxSessions,
    });
  }

  /** Live session count (used by tests). */
  get sessionCount(): number {
    return this.gateway.sessionCount;
  }

  /** Run a gateway call, translating session failures to the generic error. */
  private guardSession<T>(fn: () => T): T {
    try {
      return fn();
    } catch (err) {
      if (err instanceof GatewayError) {
        this.audit.record("release_denied", null, { reason: "unknown_session" });
        throw new BoundaryError(SESSION_ERROR);
      }
      throw err;
    }
  }

  protect(text: string, categories?: Category[]): ProtectResult {
    const result = this.gateway.protect(text, categories);
    this.audit.record("protect", result.sessionId, {
      categories: result.report,
      status: "ok",
    });
    return {
      text: result.text,
      session_id: result.sessionId,
      expires_at:
        result.expiresAt === null ? null : new Date(result.expiresAt).toISOString(),
      report: result.report,
      self_check: result.selfCheck,
    };
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
    const released = this.guardSession(() =>
      this.gateway.release(text, sessionId)
    );
    const receipt = writeRelease(this.config.releaseDir, released.text);
    this.audit.record("release_file", sessionId, {
      tokens_restored: released.tokensRestored,
      bytes: receipt.bytes,
      status: "ok",
    });
    return {
      file: receipt.file,
      bytes: receipt.bytes,
      tokens_restored: released.tokensRestored,
      changed: released.changed,
    };
  }

  releaseToClient(text: string, sessionId: string): ClientReleaseResult {
    if (this.config.releaseMode !== "client" && this.config.releaseMode !== "both") {
      this.audit.record("release_denied", null, { reason: "mode" });
      throw new BoundaryError("Client release is disabled on this server.");
    }
    const released = this.guardSession(() =>
      this.gateway.release(text, sessionId)
    );
    this.audit.record("release_client", sessionId, {
      tokens_restored: released.tokensRestored,
      status: "ok",
    });
    return {
      text: released.text,
      changed: released.changed,
      warning: CLIENT_RELEASE_WARNING,
    };
  }

  checkOutput(text: string, sessionId: string): CheckOutputResult {
    const result = this.guardSession(() =>
      this.gateway.checkOutput(text, sessionId)
    );
    this.audit.record("check_output", sessionId, {
      leaks: result.leaks.length,
      categories: result.leaks.map((l) => l.category),
      status: result.safe ? "clean" : "leaks_sanitized",
    });
    return {
      safe: result.safe,
      leaks: result.leaks,
      sanitized_text: result.sanitizedText,
      self_check: selfCheck(result.sanitizedText),
    };
  }

  discard(sessionId: string): { discarded: true } {
    this.gateway.discardSession(sessionId);
    this.audit.record("discard", sessionId, { status: "ok" });
    return { discarded: true };
  }
}
