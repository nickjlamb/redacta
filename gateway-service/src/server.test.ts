/**
 * Tests run against a real listening server on an ephemeral port — the same
 * HTTP surface a pod serves — including the acceptance test that matters
 * most: no original identifier value ever appears in a /v1/protect response
 * or in a request log line.
 */
import { afterEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { createApp, type App } from "./server.js";
import { loadConfig, type Config } from "./config.js";

const NOTE =
  "Patient NHS Number: 943 476 5919. Contact: patricia.hartley@example.com, " +
  "phone 020 7946 0958.";
const IDENTIFIERS = ["9434765919", "patricia.hartley@example.com", "02079460958"];

/** Alphanumeric-normalised "does this blob contain the identifier?" check. */
function containsIdentifier(blob: string, identifier: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9@.]/g, "");
  return norm(blob).includes(norm(identifier));
}

let app: App | undefined;

function start(overrides: Partial<Config> = {}): { base: string } {
  const config: Config = { ...loadConfig({}), port: 0, ...overrides };
  app = createApp(config);
  app.server.listen(0);
  const { port } = app.server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}` };
}

afterEach(async () => {
  await app?.shutdown();
  app = undefined;
});

async function post(
  base: string,
  path: string,
  body: unknown,
  headers: Record<string, string> = {}
): Promise<{ status: number; json: any }> {
  const res = await fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

describe("health", () => {
  it("liveness and readiness respond without auth even when a token is set", async () => {
    const { base } = start({ apiToken: "sekrit" });
    expect((await fetch(base + "/healthz")).status).toBe(200);
    const ready = await fetch(base + "/readyz");
    expect(ready.status).toBe(200);
    expect((await ready.json()).status).toBe("ready");
  });

  it("readiness flips to 503 once shutdown begins", async () => {
    const { base } = start();
    const closing = app!.shutdown();
    const res = await fetch(base + "/readyz").catch(() => undefined);
    // The listener may already be fully closed; either refusal is correct.
    if (res) expect(res.status).toBe(503);
    await closing;
  });
});

describe("stateless endpoints", () => {
  it("redact returns tokens, report, map and self_check", async () => {
    const { base } = start();
    const { status, json } = await post(base, "/v1/redact", { text: NOTE });
    expect(status).toBe(200);
    expect(json.text).toContain("[NHS_NUMBER_1]");
    expect(json.text).toContain("[EMAIL_1]");
    expect(json.report.NHS_NUMBER).toBe(1);
    expect(json.token_map["[NHS_NUMBER_1]"]).toBe("943 476 5919");
    expect(Array.isArray(json.self_check)).toBe(true);
  });

  it("redact → reinstate round-trips through the service", async () => {
    const { base } = start();
    const r = await post(base, "/v1/redact", { text: NOTE });
    const back = await post(base, "/v1/reinstate", {
      text: r.json.text,
      token_map: r.json.token_map,
    });
    expect(back.status).toBe(200);
    expect(back.json.text).toBe(NOTE);
    expect(back.json.changed).toBe(true);
  });

  it("guard re-tokenises a verbatim leak without echoing the value", async () => {
    const { base } = start();
    const r = await post(base, "/v1/redact", { text: NOTE });
    const leaky = "The patient with number 943-476-5919 should rest.";
    const g = await post(base, "/v1/guard", {
      text: leaky,
      token_map: r.json.token_map,
    });
    expect(g.json.safe).toBe(false);
    expect(g.json.sanitized_text).toContain("[NHS_NUMBER_1]");
    expect(containsIdentifier(JSON.stringify(g.json), "9434765919")).toBe(false);
  });

  it("rejects bad input with 400s, not stack traces", async () => {
    const { base } = start();
    expect((await post(base, "/v1/redact", { nope: 1 })).status).toBe(400);
    expect(
      (await post(base, "/v1/reinstate", { text: "x", token_map: "bad" }))
        .status
    ).toBe(400);
    expect(
      (await post(base, "/v1/redact", { text: "x", categories: ["martian"] }))
        .status
    ).toBe(400);
    const raw = await fetch(base + "/v1/redact", {
      method: "POST",
      body: "not json",
    });
    expect(raw.status).toBe(400);
  });

  it("enforces the body limit with 413", async () => {
    const { base } = start({ maxBodyBytes: 200 });
    const { status } = await post(base, "/v1/redact", {
      text: "x".repeat(1000),
    });
    expect(status).toBe(413);
  });
});

describe("session boundary endpoints", () => {
  it("refuse loudly when sessions are disabled (the multi-replica default)", async () => {
    const { base } = start({ sessions: false });
    const { status, json } = await post(base, "/v1/protect", { text: NOTE });
    expect(status).toBe(404);
    expect(json.error).toMatch(/single-replica/);
  });

  it("protect → check-output → release round-trips when enabled", async () => {
    const { base } = start({ sessions: true });
    const p = await post(base, "/v1/protect", { text: NOTE });
    expect(p.status).toBe(200);
    expect(p.json.session_id).toMatch(/^rdx_[0-9a-f]{32}$/);
    expect(p.json.text).toContain("[NHS_NUMBER_1]");

    const model = `Advise the patient in ${p.json.text.slice(0, 40)}...`;
    const c = await post(base, "/v1/check-output", {
      text: model,
      session_id: p.json.session_id,
    });
    expect(c.json.safe).toBe(true);

    const r = await post(base, "/v1/release", {
      text: p.json.text,
      session_id: p.json.session_id,
    });
    expect(r.status).toBe(200);
    expect(r.json.text).toBe(NOTE);
    expect(r.json.tokens_restored).toBeGreaterThan(0);
  });

  it("unknown, discarded and malformed sessions all get one generic error", async () => {
    const { base } = start({ sessions: true });
    const p = await post(base, "/v1/protect", { text: NOTE });
    await post(base, "/v1/discard", { session_id: p.json.session_id });
    const responses = await Promise.all([
      post(base, "/v1/release", { text: "x", session_id: p.json.session_id }),
      post(base, "/v1/release", { text: "x", session_id: "rdx_nope" }),
      post(base, "/v1/check-output", { text: "x", session_id: "rdx_nope" }),
    ]);
    for (const r of responses) {
      expect(r.status).toBe(404);
      expect(r.json.error).toBe("Unknown or expired session.");
    }
  });
});

describe("privacy invariants", () => {
  it("a protect response never contains an original identifier or a token map", async () => {
    const { base } = start({ sessions: true });
    const res = await fetch(base + "/v1/protect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: NOTE }),
    });
    const blob = await res.text();
    expect(blob).not.toMatch(/token_map/);
    for (const id of IDENTIFIERS) {
      expect(containsIdentifier(blob, id)).toBe(false);
    }
  });

  it("request logs never contain request or response bodies", async () => {
    const lines: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    (process.stdout as any).write = (chunk: any) => {
      lines.push(String(chunk));
      return true;
    };
    try {
      const { base } = start({ sessions: true, requestLogs: true });
      await post(base, "/v1/protect", { text: NOTE });
      await post(base, "/v1/redact", { text: NOTE });
    } finally {
      (process.stdout as any).write = orig;
    }
    const logged = lines.join("");
    expect(logged).toContain('"/v1/protect"');
    for (const id of IDENTIFIERS) {
      expect(containsIdentifier(logged, id)).toBe(false);
    }
    expect(logged).not.toContain("rdx_");
  });
});

describe("bearer-token auth", () => {
  it("gates the API but not the probes", async () => {
    const { base } = start({ apiToken: "cluster-secret" });
    expect((await post(base, "/v1/redact", { text: "hi" })).status).toBe(401);
    expect(
      (
        await post(base, "/v1/redact", { text: "hi" }, {
          authorization: "Bearer wrong",
        })
      ).status
    ).toBe(401);
    expect(
      (
        await post(base, "/v1/redact", { text: "hi" }, {
          authorization: "Bearer cluster-secret",
        })
      ).status
    ).toBe(200);
  });
});
