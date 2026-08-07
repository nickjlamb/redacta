#!/usr/bin/env node
/**
 * Redacta MCP server — a stateful privacy boundary.
 *
 * v2: `protect` redacts text and keeps the token map INSIDE this process,
 * returning only an opaque session ID. Reversal mappings never enter the MCP
 * client or the model context. Restoration happens at the boundary:
 * `release_to_file` (default) writes restored text to an operator-configured
 * directory and returns a receipt; `release_to_client` (opt-in) returns it in
 * the tool result for trusted environments.
 *
 * The v1 tools (redact / reinstate / self_check) remain for backward
 * compatibility, with descriptions that state their trade-off plainly.
 * Everything runs locally in this process — no network calls.
 */

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Redactor, isValidTokenMap, reinstate, selfCheck } from "@pharmatools/redacta";
import { makeAuditSink } from "./audit.js";
import { Boundary, BoundaryError, type Category } from "./boundary.js";
import { loadConfig, type Config } from "./config.js";

const jsonResult = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

const errorResult = (message: string) => ({
  isError: true,
  content: [{ type: "text" as const, text: message }],
});

/** Run a boundary handler, mapping expected errors to generic MCP errors. */
const guarded = (fn: () => unknown) => {
  try {
    return jsonResult(fn());
  } catch (err) {
    if (err instanceof BoundaryError) return errorResult(err.message);
    // Never leak internal details (paths, stack traces) to the client.
    return errorResult("Operation failed.");
  }
};

const CATEGORIES_SCHEMA = z
  .array(z.enum(["clinical", "general", "safeharbor"]))
  .optional()
  .describe(
    "Which pattern sets to apply. Defaults to clinical + general. " +
      "'clinical' = NHS/NI/DOB/MRN/postcode/SSN/ZIP/email/phone/names; " +
      "'general' = URLs, IPs, payment cards, IBANs, account numbers, " +
      "vehicle regs; 'safeharbor' = strictest, HIPAA Safe Harbor — implies " +
      "clinical + general and also removes ALL dates (not just DOB), ages, " +
      "fax, licence, device-serial, VIN and health-plan numbers."
  );

export function createServer(config: Config = loadConfig()): McpServer {
  const server = new McpServer({ name: "redacta", version: "2.0.0" });
  const boundary = new Boundary(config, makeAuditSink(config.auditLog));

  // ---------------------------------------------------------------------
  // Privacy-boundary tools (v2)
  // ---------------------------------------------------------------------

  server.registerTool(
    "protect",
    {
      title: "Protect text (mapping stays server-side)",
      annotations: {
        title: "Protect text (mapping stays server-side)",
        readOnlyHint: false,
        openWorldHint: false,
      },
      description:
        "Redact patient identifiers and PII, replacing each distinct value " +
        "with a labelled token ([NHS_NUMBER_1], [PATIENT_NAME_1], ...). The " +
        "reversal mapping is kept privately inside the Redacta server and is " +
        "NEVER included in this response — you receive only the protected " +
        "text, an opaque session_id for later controlled restoration, a " +
        "count of what was replaced, and a self-check of possible leftovers. " +
        "Sessions expire automatically.",
      inputSchema: {
        text: z.string().describe("The text to protect."),
        categories: CATEGORIES_SCHEMA,
      },
    },
    async ({ text, categories }) =>
      guarded(() => boundary.protect(text, categories as Category[] | undefined))
  );

  if (config.releaseMode === "file" || config.releaseMode === "both") {
    server.registerTool(
      "release_to_file",
      {
        title: "Restore identifiers into a local file",
        annotations: {
          title: "Restore identifiers into a local file",
          readOnlyHint: false,
          openWorldHint: false,
        },
        description:
          "Restore original identifiers into text produced from a protected " +
          "session, writing the result to a file inside the server's " +
          "configured release directory (REDACTA_RELEASE_DIR). Returns only " +
          "a receipt — file path, size, and counts — so restored data never " +
          "enters the model context. This is the privacy-preserving way to " +
          "complete the round trip.",
        inputSchema: {
          text: z
            .string()
            .describe("Text containing Redacta tokens to restore."),
          session_id: z
            .string()
            .describe("The session_id returned by protect."),
        },
      },
      async ({ text, session_id }) =>
        guarded(() => boundary.releaseToFile(text, session_id))
    );
  }

  if (config.releaseMode === "client" || config.releaseMode === "both") {
    server.registerTool(
      "release_to_client",
      {
        title: "Restore identifiers into this conversation (trusted mode)",
        annotations: {
          title: "Restore identifiers into this conversation (trusted mode)",
          readOnlyHint: true,
          openWorldHint: false,
        },
        description:
          "WARNING: returns re-identified text directly in the tool result, " +
          "so restored personal data WILL enter the MCP client and " +
          "potentially the model context. Only use in trusted environments. " +
          "This tool is only available because the server operator enabled " +
          "it (REDACTA_RELEASE=client or both). Prefer release_to_file.",
        inputSchema: {
          text: z
            .string()
            .describe("Text containing Redacta tokens to restore."),
          session_id: z
            .string()
            .describe("The session_id returned by protect."),
        },
      },
      async ({ text, session_id }) =>
        guarded(() => boundary.releaseToClient(text, session_id))
    );
  }

  server.registerTool(
    "check_output",
    {
      title: "Check output for leaked identifiers",
      annotations: {
        title: "Check output for leaked identifiers",
        readOnlyHint: true,
        openWorldHint: false,
      },
      description:
        "Scan generated text for verbatim reappearance of the original " +
        "values held in a protected session (tolerant of spacing, dashes " +
        "and case for identifier-like values) and re-tokenise anything " +
        "found. Returns which token categories leaked — never the raw " +
        "values — plus the sanitised text and a general self-check. Scope " +
        "is verbatim reappearance only: paraphrases and inferred identities " +
        "are not detected.",
      inputSchema: {
        text: z.string().describe("Model output to inspect."),
        session_id: z.string().describe("The session_id returned by protect."),
      },
    },
    async ({ text, session_id }) =>
      guarded(() => boundary.checkOutput(text, session_id))
  );

  server.registerTool(
    "discard_session",
    {
      title: "Discard a protection session",
      annotations: {
        title: "Discard a protection session",
        readOnlyHint: false,
        openWorldHint: false,
      },
      description:
        "Delete a session's private mapping immediately instead of waiting " +
        "for expiry. Idempotent. After this, no restoration is possible for " +
        "that session.",
      inputSchema: {
        session_id: z.string().describe("The session_id to discard."),
      },
    },
    async ({ session_id }) => guarded(() => boundary.discard(session_id))
  );

  // ---------------------------------------------------------------------
  // Legacy v1 tools (schemas and behaviour unchanged)
  // ---------------------------------------------------------------------

  if (config.legacyTools) {
    server.registerTool(
      "redact",
      {
        title: "Redact / pseudonymise text (legacy — exposes token map)",
        annotations: {
          title: "Redact / pseudonymise text (legacy — exposes token map)",
          readOnlyHint: true,
          openWorldHint: false,
        },
        description:
          "LEGACY: like protect, but returns the token_map (token -> " +
          "original value) in the response, which places the reversal key " +
          "in the client and potentially the model context. Kept for " +
          "backward compatibility and client-managed workflows. Prefer " +
          "protect, which keeps the mapping server-side.",
        inputSchema: {
          text: z.string().describe("The text to redact."),
          categories: CATEGORIES_SCHEMA,
        },
      },
      async ({ text, categories }) => {
        const cats =
          categories && categories.length
            ? categories
            : (["clinical", "general"] as const);
        const redactor = new Redactor([...cats]);
        const { text: redacted } = redactor.redactText(text);
        const residual = selfCheck(redacted);
        return jsonResult({
          redacted_text: redacted,
          report: redactor.report,
          token_map: redactor.tokenMap,
          self_check: residual,
        });
      }
    );

    server.registerTool(
      "reinstate",
      {
        title: "Re-identify from a client-held token map (legacy)",
        annotations: {
          title: "Re-identify from a client-held token map (legacy)",
          readOnlyHint: true,
          openWorldHint: false,
        },
        description:
          "LEGACY: reverse a redaction using a token map held by the " +
          "client (from the legacy redact tool). Restored personal data " +
          "will appear in this tool result. For session-based restoration " +
          "that keeps mappings server-side, use protect + release_to_file.",
        inputSchema: {
          text: z.string().describe("Text containing Redacta tokens to restore."),
          token_map: z
            .record(z.string())
            .describe('Token map, e.g. {"[NHS_NUMBER_1]": "943 476 5919"}.'),
        },
      },
      async ({ text, token_map }) => {
        if (!isValidTokenMap(token_map)) {
          return errorResult(
            "Invalid token map. Expected an object of [TOKEN] -> original-value entries."
          );
        }
        const { text: restored, changed } = reinstate(text, token_map);
        return jsonResult({ text: restored, changed });
      }
    );

    server.registerTool(
      "self_check",
      {
        title: "Self-check for residual identifiers",
        annotations: {
          title: "Self-check for residual identifiers",
          readOnlyHint: true,
          openWorldHint: false,
        },
        description:
          "Scan already-redacted text for anything that still looks like an " +
          "identifier (long numbers, emails, postcodes, URLs). A second pair " +
          "of eyes, not a guarantee. Returns a list of possible leftovers to " +
          "review.",
        inputSchema: {
          text: z.string().describe("Redacted text to re-scan."),
        },
      },
      async ({ text }) => jsonResult({ findings: selfCheck(text) })
    );
  }

  return server;
}

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr so we don't corrupt the stdio JSON-RPC channel
  console.error("Redacta MCP server (privacy boundary) running on stdio");
}

// Only start stdio transport when run directly (including via a bin
// symlink, e.g. npx), not when imported by tests.
function isMainModule(): boolean {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}
