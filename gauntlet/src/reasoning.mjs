// reasoning.mjs — the Layer-2 reasoning scorer, provider-agnostic.
//
// Redacta's reasoning layer is not a separate service: it is the host LLM
// applying the skill's Layer-2 rules (patient names, addresses, identifying
// ages) to text the deterministic Layer 1 has already redacted. This engine
// reproduces that — run the offline engine, then ask an LLM to pseudonymise
// what the patterns cannot, and combine both layers' findings.
//
// Works with either provider:
//   • anthropic  — needs ANTHROPIC_API_KEY   (SDK, lazy-loaded, tool-use)
//   • perplexity — needs PERPLEXITY_API_KEY  (plain fetch, JSON-schema output)
// Provider is auto-detected from whichever key is set (Perplexity wins if both),
// or forced with REDACTA_REASONING_PROVIDER. Model: REDACTA_REASONING_MODEL,
// else the per-provider default below. The deterministic gate never loads this.
//
// NOTE: Perplexity Sonar models are search-augmented (they call the web every
// request). That is fine for synthetic gold data but is not a production
// reasoning-layer choice for real clinical text — you would not send PHI to a
// search model. This path measures "Sonar as the reasoning layer", nothing more.

import { offlineEngine } from "./engine.mjs";

export const DEFAULT_MODELS = {
  anthropic: "claude-sonnet-5",
  perplexity: "sonar-pro",
};

// Claude is the canonical reasoning layer — it's what the skill runs on in
// production, so its scorecard is the gated baseline. Perplexity is an explicit
// opt-in comparison (REDACTA_REASONING_PROVIDER=perplexity), never the default,
// even if only a Perplexity key is present.
export function detectProvider() {
  const forced = process.env.REDACTA_REASONING_PROVIDER;
  if (forced) return forced.toLowerCase();
  return "anthropic";
}

export function keyEnvFor(provider) {
  return provider === "perplexity" ? "PERPLEXITY_API_KEY" : "ANTHROPIC_API_KEY";
}

const IDENTIFIER_TYPES = ["PATIENT_NAME", "RELATIVE_NAME", "ADDRESS", "AGE"];

// Layer-2 instructions, lifted from the Redacta SKILL so the eval measures the
// documented behaviour, not an ad-hoc prompt.
const SYSTEM = `You are Layer 2 of the Redacta pseudonymisation pipeline. The text you receive has already had pattern-based identifiers (NHS numbers, dates of birth, postcodes, phone numbers, emails, MRNs) replaced with tokens like [NHS_NUMBER_1] by Layer 1.

Your job is to find the identifiers the patterns cannot: things that need judgement, not a fixed shape. Work ONLY from the text provided. Do not search for or infer external information.

Rules:
- PATIENT_NAME — the patient, and any relatives or carers named. KEEP the names of treating clinicians, GPs, wards, hospitals and practices; they are not the data subject. A first name alone, or initials used in place of a name, still identifies the patient — include them.
- RELATIVE_NAME — a named relative or carer of the patient.
- ADDRESS — a postal address (any postcode inside it is already a Layer-1 token).
- AGE — a specific identifying age ("a 73-year-old woman", "76 years old", a stated year of birth used as an age anchor). Leave vague bands ("elderly", "in her 70s").
- When unsure, include it. Prefer flagging a possible identifier over leaving it.
- Report the exact substring as it appears in the text. Do not invent values, and do not report anything that is already a [TOKEN].

Return ONLY a JSON object of the form {"identifiers": [{"value": "...", "type": "PATIENT_NAME"}]}. If there are none, return {"identifiers": []}.`;

// JSON schema shared by both providers (Anthropic tool input / Perplexity response_format).
const SCHEMA = {
  type: "object",
  properties: {
    identifiers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          value: { type: "string" },
          type: { type: "string", enum: IDENTIFIER_TYPES },
        },
        required: ["value", "type"],
      },
    },
  },
  required: ["identifiers"],
};

function userContent(redactedText) {
  return `Layer-1-redacted clinical text below. Identify the residual patient identifiers per your rules.\n\n<text>\n${redactedText}\n</text>`;
}

// ── Providers ───────────────────────────────────────────────────────────────
async function callAnthropic(model, redactedText) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const TOOL = {
    name: "record_identifiers",
    description: "Record the residual patient identifiers found in the redacted text.",
    input_schema: SCHEMA,
  };
  const msg = await client.messages.create({
    model,
    max_tokens: 1024,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [{ role: "user", content: userContent(redactedText) }],
  });
  const toolUse = msg.content.find((b) => b.type === "tool_use");
  return toolUse?.input?.identifiers || [];
}

async function callPerplexity(model, redactedText) {
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 1024,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userContent(redactedText) },
      ],
      response_format: { type: "json_schema", json_schema: { schema: SCHEMA } },
    }),
  });
  if (!res.ok) {
    throw new Error(`Perplexity API ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  let content = data.choices?.[0]?.message?.content ?? "{}";
  // Reasoning models can wrap JSON in prose or <think> blocks — extract the object.
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    const m = content.match(/\{[\s\S]*\}/);
    parsed = m ? JSON.parse(m[0]) : { identifiers: [] };
  }
  return parsed?.identifiers || [];
}

/**
 * Reasoning engine: deterministic Layer 1 + LLM Layer 2, findings combined.
 * Returns { findings: [{value, cat}], redactedText, tokenMap, provider, model, latencyMs }.
 */
export async function reasoningEngine(text, { provider, model } = {}) {
  const prov = provider || detectProvider();
  const chosenModel = model || process.env.REDACTA_REASONING_MODEL || DEFAULT_MODELS[prov];
  const layer1 = offlineEngine(text);

  const t0 = Date.now();
  const raw = prov === "perplexity"
    ? await callPerplexity(chosenModel, layer1.redactedText)
    : await callAnthropic(chosenModel, layer1.redactedText);
  const latencyMs = Date.now() - t0;

  const layer2 = (raw || [])
    .filter((i) => i && i.value && !/^\[[A-Z_]+_\d+\]$/.test(String(i.value).trim()))
    .map((i) => ({ value: i.value, cat: i.type }));

  return {
    findings: [...layer1.findings, ...layer2],
    redactedText: layer1.redactedText,
    tokenMap: layer1.tokenMap,
    provider: prov,
    model: chosenModel,
    latencyMs,
  };
}
