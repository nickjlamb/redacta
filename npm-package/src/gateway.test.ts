/**
 * PrivacyGateway tests.
 *
 * The invariant mirrors the MCP server's acceptance tests: no protect result,
 * checkOutput result, or thrown error ever contains an original identifier
 * value or the token map. (Release results contain originals by definition —
 * release is the explicit restoration act.)
 */

import { describe, expect, it } from "vitest";
import {
  GatewayError,
  PrivacyGateway,
  SESSION_ERROR,
  guardOutput,
} from "./gateway.js";

const NOTE =
  "Dear Mrs Patricia Hartley,\n" +
  "DOB: 14/03/1952. NHS Number: 943 476 5919. NI: AB 12 34 56 C.\n" +
  "Address: Leeds LS6 3PJ. Tel: 0113 278 4532.\n" +
  "Email: p.hartley@example.com. Her daughter Sarah visits daily.";

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

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function expectNoSensitive(serialized: string) {
  const flat = norm(serialized);
  for (const value of SENSITIVE) {
    expect(flat).not.toContain(norm(value));
  }
}

describe("protect", () => {
  it("returns tokens, an opaque session id, and never the originals or map", () => {
    const g = new PrivacyGateway();
    const p = g.protect(NOTE);
    expect(p.text).toContain("[NHS_NUMBER_1]");
    expect(p.text).toContain("[PATIENT_NAME_1]");
    expect(p.sessionId).toMatch(/^rdx_[0-9a-f]{32}$/);
    expect(p.report.NHS_NUMBER).toBe(1);
    expectNoSensitive(JSON.stringify(p));
    expect(JSON.stringify(p)).not.toContain("tokenMap");
  });

  it("creates no session when nothing is detected", () => {
    const g = new PrivacyGateway();
    const p = g.protect("The quick brown fox.");
    expect(p.sessionId).toBeNull();
    expect(p.expiresAt).toBeNull();
    expect(g.sessionCount).toBe(0);
  });

  it("keeps sessions isolated: same value, different sessions, no crosstalk", () => {
    const g = new PrivacyGateway();
    const a = g.protect("NHS Number: 943 476 5919");
    const b = g.protect("NHS Number: 943 476 5919");
    expect(a.sessionId).not.toBe(b.sessionId);
    // b's session releases b's text; a's id is independent
    expect(g.release("[NHS_NUMBER_1]", b.sessionId!).text).toBe("943 476 5919");
    g.discardSession(b.sessionId!);
    expect(g.release("[NHS_NUMBER_1]", a.sessionId!).text).toBe("943 476 5919");
  });
});

describe("release", () => {
  it("round-trips through simulated agent output", () => {
    const g = new PrivacyGateway();
    const p = g.protect(NOTE);
    const agentOutput = "Summary for [PATIENT_NAME_1] (NHS [NHS_NUMBER_1]): stable.";
    const r = g.release(agentOutput, p.sessionId!);
    expect(r.text).toBe("Summary for Mrs Patricia Hartley (NHS 943 476 5919): stable.");
    expect(r.changed).toBe(true);
    expect(r.tokensRestored).toBe(2);
  });

  it("uses one generic error for unknown, expired and discarded sessions", () => {
    let now = 1_000;
    const g = new PrivacyGateway({ sessionTtlMs: 500, now: () => now });
    expect(() => g.release("x", "rdx_" + "0".repeat(32))).toThrowError(SESSION_ERROR);

    const p = g.protect(NOTE);
    now += 501; // expire
    expect(() => g.release("x", p.sessionId!)).toThrowError(SESSION_ERROR);

    const p2 = g.protect(NOTE);
    g.discardSession(p2.sessionId!);
    expect(() => g.release("x", p2.sessionId!)).toThrowError(SESSION_ERROR);
  });

  it("evicts the oldest session at the cap", () => {
    const g = new PrivacyGateway({ maxSessions: 2 });
    const a = g.protect("Email a@example.com");
    const b = g.protect("Email b@example.com");
    const c = g.protect("Email c@example.com");
    expect(() => g.release("[EMAIL_1]", a.sessionId!)).toThrowError(SESSION_ERROR);
    expect(g.release("[EMAIL_1]", b.sessionId!).text).toBe("b@example.com");
    expect(g.release("[EMAIL_1]", c.sessionId!).text).toBe("c@example.com");
  });
});

describe("checkOutput", () => {
  it("catches spacing variants and title-stripped names, never echoing values", () => {
    const g = new PrivacyGateway();
    const p = g.protect(NOTE);
    const r = g.checkOutput(
      "As discussed, Patricia Hartley (9434765919) is stable.",
      p.sessionId!
    );
    expect(r.safe).toBe(false);
    expect(r.sanitizedText).toContain("[NHS_NUMBER_1]");
    expect(r.sanitizedText).toContain("[PATIENT_NAME_1]");
    expectNoSensitive(JSON.stringify(r));
  });

  it("passes clean output through unchanged", () => {
    const g = new PrivacyGateway();
    const p = g.protect(NOTE);
    const r = g.checkOutput("Patient [PATIENT_NAME_1] is stable.", p.sessionId!);
    expect(r.safe).toBe(true);
    expect(r.sanitizedText).toBe("Patient [PATIENT_NAME_1] is stable.");
  });
});

describe("guardOutput (standalone)", () => {
  it("works with a caller-held map", () => {
    const r = guardOutput("number 943-476-5919 here", {
      "[NHS_NUMBER_1]": "943 476 5919",
    });
    expect(r.leaks).toEqual([{ token: "[NHS_NUMBER_1]", category: "NHS_NUMBER" }]);
    expect(r.sanitizedText).toBe("number [NHS_NUMBER_1] here");
  });
});

describe("environment", () => {
  it("uses an injected idGenerator when provided", () => {
    let n = 0;
    const g = new PrivacyGateway({ idGenerator: () => `rdx_test${n++}` });
    const p = g.protect("Email a@example.com");
    expect(p.sessionId).toBe("rdx_test0");
  });

  it("throws GatewayError (not a crash) when no crypto and no idGenerator", () => {
    const saved = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
    try {
      const g = new PrivacyGateway();
      expect(() => g.protect("Email a@example.com")).toThrowError(GatewayError);
      // No session half-created:
      expect(g.sessionCount).toBe(0);
    } finally {
      if (saved) Object.defineProperty(globalThis, "crypto", saved);
    }
  });
});
