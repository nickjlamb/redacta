/**
 * Privacy-boundary tests.
 *
 * The acceptance tests at the bottom run through a REAL MCP client over an
 * in-memory transport pair and assert the core invariant of v2: no original
 * identifier value and no token map ever appears in a protect or
 * release_to_file tool response.
 */

import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { makeAuditSink } from "./audit.js";
import { Boundary, BoundaryError } from "./boundary.js";
import type { Config } from "./config.js";
import { guardOutput } from "./guard.js";
import { createServer } from "./index.js";
import { ReleaseError, writeRelease } from "./release.js";
import { SESSION_ERROR, SessionStore } from "./sessions.js";

// ---------------------------------------------------------------------------
// Fixtures (synthetic only — no real patient data)
// ---------------------------------------------------------------------------

const NOTE =
  "Dear Mrs Patricia Hartley,\n" +
  "DOB: 14/03/1952. NHS Number: 943 476 5919. NI: AB 12 34 56 C.\n" +
  "Address: Leeds LS6 3PJ. Tel: 0113 278 4532.\n" +
  "Email: p.hartley@example.com. Her daughter Sarah visits daily.";

/** Every sensitive value in NOTE, for leak assertions. */
const SENSITIVE = [
  "Patricia",
  "Hartley",
  "14/03/1952",
  "943 476 5919",
  "AB 12 34 56 C",
  "LS6 3PJ",
  "0113 278 4532",
  "p.hartley@example.com",
  "Sarah",
];

/** Lowercase alphanumerics only, so spacing/format differences can't hide a leak. */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function expectNoSensitive(serialized: string) {
  const flat = norm(serialized);
  for (const value of SENSITIVE) {
    expect(flat).not.toContain(norm(value));
  }
}

function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    releaseMode: "file",
    releaseDir: null,
    sessionTtlMs: 60 * 60_000,
    maxSessions: 64,
    auditLog: null,
    legacyTools: true,
    ...overrides,
  };
}

const noopAudit = makeAuditSink(null);

// ---------------------------------------------------------------------------
// Session store
// ---------------------------------------------------------------------------

describe("SessionStore", () => {
  it("issues opaque crypto-random ids", () => {
    const store = new SessionStore(60_000, 10);
    const a = store.create({ "[EMAIL_1]": "x@y.com" }, ["clinical"]);
    const b = store.create({ "[EMAIL_1]": "x@y.com" }, ["clinical"]);
    expect(a.id).toMatch(/^rdx_[0-9a-f]{32}$/);
    expect(a.id).not.toBe(b.id);
  });

  it("expires sessions after the TTL", () => {
    let now = 1_000;
    const store = new SessionStore(500, 10, () => now);
    const s = store.create({ "[EMAIL_1]": "x@y.com" }, ["clinical"]);
    expect(store.get(s.id)).not.toBeNull();
    now += 501;
    expect(store.get(s.id)).toBeNull();
    expect(store.size).toBe(0);
  });

  it("evicts the oldest session at the cap", () => {
    const store = new SessionStore(60_000, 2);
    const a = store.create({ "[EMAIL_1]": "a" }, []);
    const b = store.create({ "[EMAIL_1]": "b" }, []);
    const c = store.create({ "[EMAIL_1]": "c" }, []);
    expect(store.get(a.id)).toBeNull();
    expect(store.get(b.id)).not.toBeNull();
    expect(store.get(c.id)).not.toBeNull();
  });

  it("returns null for malformed or unknown ids and discards idempotently", () => {
    const store = new SessionStore(60_000, 10);
    expect(store.get("nonsense")).toBeNull();
    expect(store.get("rdx_" + "0".repeat(32))).toBeNull();
    store.discard("rdx_" + "0".repeat(32)); // no throw
  });
});

// ---------------------------------------------------------------------------
// File release
// ---------------------------------------------------------------------------

describe("writeRelease", () => {
  it("writes atomically with 0600 permissions and a generated name", () => {
    const dir = mkdtempSync(join(tmpdir(), "redacta-test-"));
    const receipt = writeRelease(dir, "restored content");
    expect(receipt.file.startsWith(dir)).toBe(true);
    expect(receipt.file).toMatch(/redacta-release-[\d\-_]+-[0-9a-f]{6}\.txt$/);
    expect(readFileSync(receipt.file, "utf8")).toBe("restored content");
    expect(statSync(receipt.file).mode & 0o777).toBe(0o600);
    // no temp files left behind
    expect(readdirSync(dir).filter((f) => f.endsWith(".tmp"))).toHaveLength(0);
  });

  it("refuses a non-existent release directory", () => {
    expect(() => writeRelease("/nonexistent/redacta-dir", "x")).toThrow(
      ReleaseError
    );
  });
});

// ---------------------------------------------------------------------------
// Output guard
// ---------------------------------------------------------------------------

describe("guardOutput", () => {
  const tokenMap = {
    "[NHS_NUMBER_1]": "943 476 5919",
    "[PATIENT_NAME_1]": "Patricia Hartley",
  };

  it("catches spacing/dash variants of numeric identifiers", () => {
    for (const variant of ["9434765919", "943-476-5919", "943 476 5919"]) {
      const r = guardOutput(`The number is ${variant}.`, tokenMap);
      expect(r.safe).toBe(false);
      expect(r.sanitized_text).toContain("[NHS_NUMBER_1]");
      expect(norm(JSON.stringify(r))).not.toContain(norm(variant));
    }
  });

  it("catches names case-insensitively and never echoes raw values", () => {
    const r = guardOutput("patient PATRICIA HARTLEY was seen", tokenMap);
    expect(r.leaks).toEqual([
      { token: "[PATIENT_NAME_1]", category: "PATIENT_NAME" },
    ]);
    expect(norm(JSON.stringify(r))).not.toContain(norm("Patricia Hartley"));
  });

  it("passes clean text through unchanged", () => {
    const r = guardOutput("Patient [PATIENT_NAME_1] is stable.", tokenMap);
    expect(r.safe).toBe(true);
    expect(r.sanitized_text).toBe("Patient [PATIENT_NAME_1] is stable.");
  });
});

// ---------------------------------------------------------------------------
// Boundary handlers
// ---------------------------------------------------------------------------

describe("Boundary", () => {
  it("creates no session when nothing was detected", () => {
    const b = new Boundary(testConfig(), noopAudit);
    const r = b.protect("The quick brown fox.");
    expect(r.session_id).toBeNull();
    expect(b.sessions.size).toBe(0);
  });

  it("uses one generic error for unknown and expired sessions", () => {
    const b = new Boundary(
      testConfig({ releaseDir: mkdtempSync(join(tmpdir(), "redacta-test-")) }),
      noopAudit
    );
    expect(() => b.releaseToFile("[EMAIL_1]", "rdx_" + "0".repeat(32))).toThrow(
      SESSION_ERROR
    );
    const p = b.protect(NOTE);
    b.discard(p.session_id!);
    expect(() => b.releaseToFile("[EMAIL_1]", p.session_id!)).toThrow(
      SESSION_ERROR
    );
  });

  it("blocks releases according to the server release mode", () => {
    const off = new Boundary(testConfig({ releaseMode: "off" }), noopAudit);
    const p = off.protect(NOTE);
    expect(() => off.releaseToFile("x", p.session_id!)).toThrow(BoundaryError);
    expect(() => off.releaseToClient("x", p.session_id!)).toThrow(BoundaryError);

    const fileOnly = new Boundary(testConfig(), noopAudit);
    const p2 = fileOnly.protect(NOTE);
    expect(() => fileOnly.releaseToClient("x", p2.session_id!)).toThrow(
      BoundaryError
    );
  });

  it("explains missing release dir without touching the session", () => {
    const b = new Boundary(testConfig({ releaseDir: null }), noopAudit);
    const p = b.protect(NOTE);
    expect(() => b.releaseToFile("x", p.session_id!)).toThrow(
      /REDACTA_RELEASE_DIR/
    );
  });

  it("round-trips: protect -> agent output -> release_to_file restores originals on disk only", () => {
    const dir = mkdtempSync(join(tmpdir(), "redacta-test-"));
    const b = new Boundary(testConfig({ releaseDir: dir }), noopAudit);
    const p = b.protect(NOTE);
    expectNoSensitive(JSON.stringify(p));

    // Simulated agent output that reuses tokens from the protected text.
    const agentOutput = `Summary for [PATIENT_NAME_1] (NHS [NHS_NUMBER_1]): stable.`;
    const receipt = b.releaseToFile(agentOutput, p.session_id!);

    expectNoSensitive(JSON.stringify(receipt));
    const onDisk = readFileSync(receipt.file, "utf8");
    expect(onDisk).toContain("943 476 5919");
    expect(onDisk).toContain("Patricia Hartley");
    expect(receipt.tokens_restored).toBe(2);
    expect(receipt.changed).toBe(true);
  });

  it("audit log contains events but no PHI, no full session ids", () => {
    const dir = mkdtempSync(join(tmpdir(), "redacta-test-"));
    const auditPath = join(dir, "audit.jsonl");
    const b = new Boundary(
      testConfig({ releaseDir: dir, auditLog: auditPath }),
      makeAuditSink(auditPath)
    );
    const p = b.protect(NOTE);
    b.releaseToFile("[NHS_NUMBER_1]", p.session_id!);
    b.checkOutput("her number is 9434765919", p.session_id!);
    b.discard(p.session_id!);

    const lines = readFileSync(auditPath, "utf8").trim().split("\n");
    const events = lines.map((l) => JSON.parse(l).event);
    expect(events).toEqual(["protect", "release_file", "check_output", "discard"]);
    expectNoSensitive(readFileSync(auditPath, "utf8"));
    for (const line of lines) {
      expect(line).not.toContain(p.session_id!);
      const session = JSON.parse(line).session;
      expect(session).toMatch(/^[0-9a-f]{12}$/);
    }
  });

  it("gives repeated values the same token within one session", () => {
    const b = new Boundary(testConfig(), noopAudit);
    const r = b.protect(
      "Email p.hartley@example.com today. Again: p.hartley@example.com."
    );
    const matches = r.text.match(/\[EMAIL_1\]/g);
    expect(matches).toHaveLength(2);
    expect(r.report.EMAIL).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Acceptance: through a real MCP client, over an in-memory transport
// ---------------------------------------------------------------------------

async function connectedClient(config: Config) {
  const server = createServer(config);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return client;
}

const textOf = (result: any) => result.content[0].text as string;
const parse = (result: any) => JSON.parse(textOf(result));

describe("MCP acceptance: the boundary holds", () => {
  it("protect responses contain no original value and no token map", async () => {
    const client = await connectedClient(testConfig());
    const result = await client.callTool({
      name: "protect",
      arguments: { text: NOTE },
    });
    const serialized = JSON.stringify(result);
    expectNoSensitive(serialized);
    expect(serialized).not.toContain("token_map");

    const body = parse(result);
    expect(body.session_id).toMatch(/^rdx_[0-9a-f]{32}$/);
    expect(body.text).toContain("[NHS_NUMBER_1]");
    expect(body.report.NHS_NUMBER).toBe(1);
  });

  it("release_to_file responses are receipts only; the file gets the PHI", async () => {
    const dir = mkdtempSync(join(tmpdir(), "redacta-test-"));
    const client = await connectedClient(testConfig({ releaseDir: dir }));
    const p = parse(
      await client.callTool({ name: "protect", arguments: { text: NOTE } })
    );
    const result = await client.callTool({
      name: "release_to_file",
      arguments: {
        text: "Letter for [PATIENT_NAME_1], NHS [NHS_NUMBER_1].",
        session_id: p.session_id,
      },
    });
    expectNoSensitive(JSON.stringify(result));
    const receipt = parse(result);
    expect(readFileSync(receipt.file, "utf8")).toBe(
      "Letter for Mrs Patricia Hartley, NHS 943 476 5919."
    );
    expect(statSync(receipt.file).mode & 0o777).toBe(0o600);
  });

  it("check_output reports leaks without echoing them", async () => {
    const client = await connectedClient(testConfig());
    const p = parse(
      await client.callTool({ name: "protect", arguments: { text: NOTE } })
    );
    const result = await client.callTool({
      name: "check_output",
      arguments: {
        text: "As discussed, Patricia Hartley (9434765919) is stable.",
        session_id: p.session_id,
      },
    });
    expectNoSensitive(JSON.stringify(result));
    const body = parse(result);
    expect(body.safe).toBe(false);
    expect(body.sanitized_text).toContain("[NHS_NUMBER_1]");
  });

  it("release tools follow the configured mode", async () => {
    const fileOnly = await connectedClient(testConfig());
    const fileTools = (await fileOnly.listTools()).tools.map((t) => t.name);
    expect(fileTools).toContain("release_to_file");
    expect(fileTools).not.toContain("release_to_client");

    const off = await connectedClient(testConfig({ releaseMode: "off" }));
    const offTools = (await off.listTools()).tools.map((t) => t.name);
    expect(offTools).not.toContain("release_to_file");
    expect(offTools).not.toContain("release_to_client");

    const both = await connectedClient(
      testConfig({ releaseMode: "both", legacyTools: false })
    );
    const bothTools = (await both.listTools()).tools.map((t) => t.name);
    expect(bothTools).toContain("release_to_client");
    expect(bothTools).not.toContain("redact"); // legacy hidden
  });

  it("invalid sessions get one generic error", async () => {
    const dir = mkdtempSync(join(tmpdir(), "redacta-test-"));
    const client = await connectedClient(testConfig({ releaseDir: dir }));
    const result = await client.callTool({
      name: "release_to_file",
      arguments: { text: "x", session_id: "rdx_" + "f".repeat(32) },
    });
    expect((result as any).isError).toBe(true);
    expect(textOf(result)).toBe(SESSION_ERROR);
  });

  it("legacy redact still works unchanged for existing users", async () => {
    const client = await connectedClient(testConfig());
    const body = parse(
      await client.callTool({
        name: "redact",
        arguments: { text: "NHS Number: 943 476 5919" },
      })
    );
    expect(body.redacted_text).toContain("[NHS_NUMBER_1]");
    expect(body.token_map["[NHS_NUMBER_1]"]).toBe("943 476 5919");
  });
});
