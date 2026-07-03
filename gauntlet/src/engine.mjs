// engine.mjs — adapters that turn a piece of text into a normalised list of
// findings: [{ value, cat }]. Two engines are exposed so the harness can score
// the deterministic layer offline (no network) and, optionally, the live MCP.

import { Redactor } from "@pharmatools/redacta";

// Category from a Redacta token, e.g. "[DATE_OF_BIRTH_2]" -> "DATE_OF_BIRTH".
const catOf = (token) => token.slice(1, -1).replace(/_\d+$/, "");

/**
 * OFFLINE engine — the shipping deterministic engine (@pharmatools/redacta),
 * the same code the iPhone app, CLI, libraries and MCP server wrap. No API key,
 * no network: fast enough to gate every commit.
 *
 * Returns { findings: [{value, cat}], redactedText, tokenMap }.
 */
export function offlineEngine(text, categories = ["clinical", "general"]) {
  const r = new Redactor(categories);
  const { text: redactedText } = r.redactText(text);
  const tokenMap = r.tokenMap;
  const findings = Object.entries(tokenMap).map(([token, value]) => ({
    value,
    cat: catOf(token),
  }));
  return { findings, redactedText, tokenMap };
}

/**
 * ONLINE engine — the live Redacta MCP server. Model/service-dependent, so it
 * runs only under --online. Point REDACTA_MCP_URL at an HTTP shim that exposes
 * the `redact` tool; the harness records the endpoint in the scorecard.
 *
 * Left as an adapter stub: in this environment the MCP is exercised directly
 * from the eval driver (see results/mcp-run.json), and offline/online parity is
 * asserted in verify.mjs. Wire this to your transport to gate the MCP in CI.
 */
export async function onlineEngine(text) {
  const url = process.env.REDACTA_MCP_URL;
  if (!url) throw new Error("REDACTA_MCP_URL not set — online engine unavailable");
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tool: "redact", arguments: { text } }),
  });
  const data = await res.json();
  const tokenMap = data.token_map ?? {};
  const findings = Object.entries(tokenMap).map(([token, value]) => ({
    value,
    cat: catOf(token),
  }));
  return { findings, redactedText: data.redacted_text, tokenMap };
}
