/**
 * Server configuration, read once from the environment.
 *
 * Everything here is operator-controlled (the person who configures the MCP
 * server), never client-controlled. The MCP client cannot change release mode,
 * release directory, TTLs or audit destinations.
 */

export type ReleaseMode = "file" | "client" | "both" | "off";

export interface Config {
  /** Where restored output may go. Default: "file" (receipt-only responses). */
  releaseMode: ReleaseMode;
  /** Allowlisted directory for release_to_file. Must exist; never created. */
  releaseDir: string | null;
  /** Session lifetime in milliseconds. */
  sessionTtlMs: number;
  /** Maximum concurrent sessions; oldest is evicted at the cap. */
  maxSessions: number;
  /** JSONL audit sink path, or null for no auditing. */
  auditLog: string | null;
  /** Whether the v1 tools (redact / reinstate / self_check) are registered. */
  legacyTools: boolean;
}

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < min || n > max) return fallback;
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const modeRaw = (env.REDACTA_RELEASE ?? "file").toLowerCase();
  const releaseMode: ReleaseMode =
    modeRaw === "client" || modeRaw === "both" || modeRaw === "off"
      ? modeRaw
      : "file";
  return {
    releaseMode,
    releaseDir: env.REDACTA_RELEASE_DIR?.trim() || null,
    sessionTtlMs:
      intEnv("REDACTA_SESSION_TTL_MINUTES", 60, 1, 24 * 60) * 60_000,
    maxSessions: intEnv("REDACTA_MAX_SESSIONS", 64, 1, 10_000),
    auditLog: env.REDACTA_AUDIT_LOG?.trim() || null,
    legacyTools: env.REDACTA_LEGACY_TOOLS !== "0",
  };
}
