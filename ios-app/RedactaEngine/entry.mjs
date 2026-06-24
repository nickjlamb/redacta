// IIFE entry: expose the Redacta engine on globalThis.Redacta for JavaScriptCore.
//
// JavaScriptCore (the JS runtime built into iOS) has no module system and no
// DOM/Node globals. esbuild bundles this entry plus the shared engine in
// ../../npm-package into a single IIFE that assigns `globalThis.Redacta`, which
// the Swift wrapper (RedactaEngine.swift) then calls. This keeps the
// "one engine, many surfaces" principle: iOS reuses the exact same TypeScript
// engine as the skill, MCP server, CLI and FigJam/Miro plugins.
import {
  Redactor,
  reinstate,
  selfCheck,
  isValidTokenMap,
  isValidNhs,
  isValidNi,
  isValidLuhn,
} from "../../npm-package/dist/redact.js";

// JSON-friendly facade so Swift only ever exchanges strings and plain objects.
function redact(text, modesCsv) {
  const modes = (modesCsv || "clinical")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const r = new Redactor(modes.length ? modes : ["clinical"]);
  const { text: out, changed } = r.redactText(text);
  return {
    text: out,
    changed,
    report: r.report,
    tokenMap: r.tokenMap,
    residuals: selfCheck(out),
  };
}

globalThis.Redacta = {
  redact,
  reinstate: (text, map) => reinstate(text, map),
  selfCheck,
  isValidTokenMap,
  isValidNhs,
  isValidNi,
  isValidLuhn,
  version: "1.0.0-ios-proto",
};
