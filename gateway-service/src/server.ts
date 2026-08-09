#!/usr/bin/env node
/**
 * Redacta gateway service — the privacy boundary as a self-hosted HTTP service.
 *
 * A thin wrapper over the engine (`@pharmatools/redacta`): no boundary logic
 * lives here. It exists so that an organisation can run pseudonymisation as a
 * network service inside its own infrastructure (typically Kubernetes) and
 * keep raw identifiers from ever reaching an external AI service.
 *
 * Two endpoint groups with different state profiles:
 *
 *  - STATELESS (always on): /v1/redact, /v1/reinstate, /v1/guard,
 *    /v1/self-check. The token map travels to/from the TRUSTED caller; each
 *    request is complete in itself, so any number of replicas is safe. The
 *    property that matters — mappings never enter the model's context — is
 *    the caller's to uphold, exactly as with the in-process library
 *    (see GATEWAY.md, "Honesty about the trust model").
 *
 *  - SESSION BOUNDARY (opt-in, REDACTA_SESSIONS=1): /v1/protect, /v1/release,
 *    /v1/check-output, /v1/discard — the PrivacyGateway loop, mappings held in
 *    THIS process's memory. Only safe with exactly one replica: a second pod
 *    would answer "Unknown or expired session." for sessions it never stored.
 *    When disabled, these endpoints refuse loudly rather than failing
 *    intermittently behind a load balancer.
 *
 * No PHI in logs, ever: request logs carry method/path/status/duration only.
 * Sessions are memory-only and die with the process — the safe direction.
 */

import { createServer, type Server } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  GatewayError,
  PrivacyGateway,
  Redactor,
  guardOutput,
  isValidTokenMap,
  reinstate,
  selfCheck,
} from "@pharmatools/redacta";
import { loadConfig, type Config } from "./config.js";

// ---------------------------------------------------------------------------
// Small HTTP helpers (dependency-free by design — the engine has no runtime
// deps and neither should its wrapper)
// ---------------------------------------------------------------------------

const CATEGORIES = ["clinical", "general", "safeharbor"] as const;
type Category = (typeof CATEGORIES)[number];

class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
    // An early error reply (e.g. 413 before the body finished arriving)
    // must not let the connection be reused mid-upload.
    ...(status >= 400 ? { connection: "close" } : {}),
  });
  res.end(payload);
}

function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        // Stop reading but leave the socket alive so the 413 can be
        // delivered; the response side closes the connection afterwards.
        req.removeAllListeners("data");
        req.removeAllListeners("end");
        req.on("error", () => {});
        req.pause();
        reject(new HttpError(413, `Request body exceeds ${limit} bytes.`));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", () => reject(new HttpError(400, "Request aborted.")));
  });
}

function parseJsonObject(raw: Buffer): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new HttpError(400, "Body must be valid JSON.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new HttpError(400, "Body must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function requireString(body: Record<string, unknown>, field: string): string {
  const v = body[field];
  if (typeof v !== "string") {
    throw new HttpError(400, `"${field}" must be a string.`);
  }
  return v;
}

function optionalCategories(body: Record<string, unknown>): Category[] | undefined {
  const v = body["categories"];
  if (v === undefined || v === null) return undefined;
  if (
    !Array.isArray(v) ||
    !v.every((c) => (CATEGORIES as readonly string[]).includes(c as string))
  ) {
    throw new HttpError(
      400,
      `"categories" must be an array drawn from ${CATEGORIES.join(", ")}.`
    );
  }
  return v.length ? (v as Category[]) : undefined;
}

function requireTokenMap(
  body: Record<string, unknown>
): Record<string, string> {
  const v = body["token_map"];
  if (!isValidTokenMap(v)) {
    throw new HttpError(
      400,
      'Invalid "token_map". Expected {"[TOKEN_1]": "original value", ...}.'
    );
  }
  return v as Record<string, string>;
}

/** Constant-time bearer-token check. */
function authorized(req: IncomingMessage, token: string): boolean {
  if (!token) return true;
  const header = req.headers.authorization ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(presented);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// The app
// ---------------------------------------------------------------------------

export interface App {
  server: Server;
  /** Flip readiness off and drain; resolves when the listener has closed. */
  shutdown(): Promise<void>;
}

export function createApp(config: Config = loadConfig()): App {
  const gateway = new PrivacyGateway({
    sessionTtlMs: config.sessionTtlMinutes * 60_000,
    maxSessions: config.maxSessions,
  });
  let draining = false;

  const log = (line: Record<string, unknown>) => {
    if (config.requestLogs) {
      process.stdout.write(JSON.stringify(line) + "\n");
    }
  };

  // Each handler returns { status, body } or throws HttpError/GatewayError.
  type Handler = (
    body: Record<string, unknown>
  ) => { status: number; body: unknown };

  const statelessRoutes: Record<string, Handler> = {
    "/v1/redact": (body) => {
      const text = requireString(body, "text");
      const cats = optionalCategories(body) ?? ["clinical", "general"];
      const redactor = new Redactor([...cats]);
      const { text: redacted } = redactor.redactText(text);
      return {
        status: 200,
        body: {
          text: redacted,
          report: redactor.report,
          token_map: redactor.tokenMap,
          self_check: selfCheck(redacted),
        },
      };
    },
    "/v1/reinstate": (body) => {
      const text = requireString(body, "text");
      const tokenMap = requireTokenMap(body);
      const { text: restored, changed } = reinstate(text, tokenMap);
      return { status: 200, body: { text: restored, changed } };
    },
    "/v1/guard": (body) => {
      const text = requireString(body, "text");
      const tokenMap = requireTokenMap(body);
      const { safe, leaks, sanitizedText } = guardOutput(text, tokenMap);
      return {
        status: 200,
        body: { safe, leaks, sanitized_text: sanitizedText },
      };
    },
    "/v1/self-check": (body) => ({
      status: 200,
      body: { findings: selfCheck(requireString(body, "text")) },
    }),
  };

  const sessionRoutes: Record<string, Handler> = {
    "/v1/protect": (body) => {
      const text = requireString(body, "text");
      const cats = optionalCategories(body);
      const r = gateway.protect(text, cats);
      return {
        status: 200,
        body: {
          text: r.text,
          session_id: r.sessionId,
          expires_at: r.expiresAt,
          report: r.report,
          self_check: r.selfCheck,
        },
      };
    },
    "/v1/release": (body) => {
      const text = requireString(body, "text");
      const sessionId = requireString(body, "session_id");
      const r = gateway.release(text, sessionId);
      return {
        status: 200,
        body: { text: r.text, changed: r.changed, tokens_restored: r.tokensRestored },
      };
    },
    "/v1/check-output": (body) => {
      const text = requireString(body, "text");
      const sessionId = requireString(body, "session_id");
      const { safe, leaks, sanitizedText } = gateway.checkOutput(text, sessionId);
      return {
        status: 200,
        body: { safe, leaks, sanitized_text: sanitizedText },
      };
    },
    "/v1/discard": (body) => {
      gateway.discardSession(requireString(body, "session_id"));
      return { status: 200, body: { discarded: true } };
    },
  };

  const server = createServer(async (req, res) => {
    const started = Date.now();
    const method = req.method ?? "GET";
    const path = (req.url ?? "/").split("?")[0];
    const finish = (status: number, body: unknown) => {
      sendJson(res, status, body);
      log({
        ts: new Date().toISOString(),
        method,
        path,
        status,
        ms: Date.now() - started,
      });
    };

    try {
      // Health first — no auth, so kubelet probes stay plain.
      if (method === "GET" && path === "/healthz") {
        return finish(200, { status: "ok" });
      }
      if (method === "GET" && path === "/readyz") {
        return draining
          ? finish(503, { status: "draining" })
          : finish(200, {
              status: "ready",
              sessions: config.sessions ? gateway.sessionCount : null,
            });
      }

      if (!authorized(req, config.apiToken)) {
        return finish(401, { error: "Missing or invalid bearer token." });
      }

      const handler =
        statelessRoutes[path] ??
        (config.sessions ? sessionRoutes[path] : undefined);

      if (!handler) {
        if (!config.sessions && path in sessionRoutes) {
          // Refuse loudly, not intermittently: behind a multi-replica
          // Service these endpoints would fail for whichever pod didn't
          // store the session.
          return finish(404, {
            error:
              "Session endpoints are disabled. They hold mappings in " +
              "one process's memory, so they are only served by the " +
              "single-replica boundary deployment (REDACTA_SESSIONS=1). " +
              "Use /v1/redact + /v1/reinstate here, or call the boundary " +
              "Service.",
          });
        }
        return finish(404, { error: "Not found." });
      }
      if (method !== "POST") {
        return finish(405, { error: "Use POST." });
      }

      const body = parseJsonObject(
        await readBody(req, config.maxBodyBytes)
      );
      const { status, body: payload } = handler(body);
      return finish(status, payload);
    } catch (err) {
      if (err instanceof HttpError) {
        return finish(err.status, { error: err.message });
      }
      if (err instanceof GatewayError) {
        // The engine's single generic session error — no enumeration.
        return finish(404, { error: err.message });
      }
      // Never leak internals (paths, stack traces) to the client.
      return finish(500, { error: "Operation failed." });
    }
  });

  const shutdown = (): Promise<void> => {
    draining = true; // /readyz now 503s; the endpoints controller stops
    // routing new traffic to this pod while open requests finish.
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        server.closeAllConnections();
        resolve();
      }, config.shutdownGraceMs);
      timer.unref();
      server.close(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  };

  return { server, shutdown };
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

// Only start listening when run directly, not when imported by tests
// (same pattern as the MCP server's entrypoint).
function isMainModule(): boolean {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  const config = loadConfig();
  const app = createApp(config);
  app.server.listen(config.port, () => {
    // Startup lines go to stderr; stdout is reserved for request logs.
    console.error(
      `redacta-gateway-service listening on :${config.port} ` +
        `(sessions ${config.sessions ? "ENABLED — single replica only" : "disabled"}, ` +
        `auth ${config.apiToken ? "bearer token" : "none"})`
    );
  });
  const stop = (signal: string) => {
    console.error(`${signal} received — draining connections`);
    void app.shutdown().then(() => process.exit(0));
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));
}
