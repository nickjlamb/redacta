/**
 * Configuration from environment variables only — no files, no flags — so a
 * Kubernetes ConfigMap/Secret is the complete configuration surface.
 *
 * Env var names reuse the MCP server's vocabulary (REDACTA_SESSION_TTL_MINUTES,
 * REDACTA_MAX_SESSIONS) so operators configure both surfaces the same way.
 */

export interface Config {
  /** TCP port to listen on. Default 8080. */
  port: number;
  /**
   * Enable the stateful session endpoints (protect / release / check-output /
   * discard). Default OFF: sessions live in this process's memory, so these
   * endpoints are only safe when exactly one replica serves them. The k8s
   * "boundary" profile sets this; the default multi-replica profile must not.
   */
  sessions: boolean;
  /** Session lifetime in minutes (sessions profile only). Default 60. */
  sessionTtlMinutes: number;
  /**
   * Max concurrent sessions; the OLDEST is silently evicted at the cap, after
   * which its release fails with the generic session error. The library
   * default (64) suits one in-process caller; a shared HTTP service gets a
   * higher default. Size to your workload. Default 256.
   */
  maxSessions: number;
  /**
   * Shared token callers must present as "Authorization: Bearer <token>".
   * Empty = no auth (rely on cluster network controls). Inject from a
   * Kubernetes Secret — never from an image layer or a ConfigMap.
   */
  apiToken: string;
  /** Reject request bodies larger than this. Default 1 MiB. */
  maxBodyBytes: number;
  /** Emit one JSON request log line per request (no bodies, no PHI). Default on. */
  requestLogs: boolean;
  /** How long to keep draining open requests after SIGTERM, ms. Default 10s. */
  shutdownGraceMs: number;
}

function intFromEnv(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number
): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} must be a positive number, got "${raw}"`);
  }
  return Math.floor(n);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: intFromEnv(env, "PORT", 8080),
    sessions: env.REDACTA_SESSIONS === "1" || env.REDACTA_SESSIONS === "true",
    sessionTtlMinutes: intFromEnv(env, "REDACTA_SESSION_TTL_MINUTES", 60),
    maxSessions: intFromEnv(env, "REDACTA_MAX_SESSIONS", 256),
    apiToken: env.REDACTA_API_TOKEN ?? "",
    maxBodyBytes: intFromEnv(env, "REDACTA_MAX_BODY_BYTES", 1024 * 1024),
    requestLogs: env.REDACTA_REQUEST_LOGS !== "0",
    shutdownGraceMs: intFromEnv(env, "REDACTA_SHUTDOWN_GRACE_MS", 10_000),
  };
}
