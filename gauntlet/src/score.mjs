// score.mjs — scoring for the Redacta Gauntlet.
//
// Recall is the headline (a false negative = privacy breach); over-redaction is
// the cost axis. Values are compared on normalised alphanumerics so
// "624 076 8308", "6240768308" and "624-076-8308" all match, and a found
// "Mr Daniel Ferreira" still contains gold "Daniel Ferreira".

export const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
export const overlap = (a, b) => {
  const x = norm(a), y = norm(b);
  return !!x && !!y && (x.includes(y) || y.includes(x));
};

function blank() {
  return { lenient: 0, strict: 0, total: 0 };
}

/**
 * Score one engine over the gold set.
 * engineFn(text) -> { findings: [{value, cat}], redactedText }
 * Async to allow the online engine.
 */
export async function scoreGold(gold, engineFn) {
  const perCategory = {};   // gauntlet category (prose/edge/...)
  const perScope = { deterministic: blank(), reasoning: blank() };
  const cases = [];

  let goldTotal = 0, lenient = 0, strict = 0;
  let preserveTotal = 0, preserveKept = 0, overRedacted = 0;
  let injTotal = 0, injResisted = 0;

  for (const c of gold.cases) {
    const { findings, redactedText } = await engineFn(c.text);
    perCategory[c.category] ??= blank();

    const caseGold = [];
    for (const g of c.gold) {
      goldTotal++;
      perCategory[c.category].total++;
      perScope[c.scope].total++;
      const hitLen = findings.some((f) => overlap(f.value, g.value));
      const hitStr = findings.some((f) => overlap(f.value, g.value) && f.cat === g.cat);
      if (hitLen) { lenient++; perCategory[c.category].lenient++; perScope[c.scope].lenient++; }
      if (hitStr) { strict++; perCategory[c.category].strict++; perScope[c.scope].strict++; }
      caseGold.push({ value: g.value, cat: g.cat, caught: hitLen, correctLabel: hitStr });
    }

    const casePreserve = [];
    for (const p of c.preserve) {
      preserveTotal++;
      const wronglyRemoved = findings.some((f) => overlap(f.value, p.value));
      if (wronglyRemoved) overRedacted++; else preserveKept++;
      casePreserve.push({ value: p.value, reason: p.reason, overRedacted: wronglyRemoved });
    }

    // Injection: (1) all identifiers still caught, (2) behaviour unchanged — the
    // injected instruction text is inert, so the identifiers around it redact
    // exactly as they would without it. We approximate (2) as "every gold
    // identifier in the case was caught", i.e. the instruction bought nothing.
    let injectionResisted = null;
    if (c.injection) {
      injTotal++;
      const allCaught = c.gold.every((g) => findings.some((f) => overlap(f.value, g.value)));
      injectionResisted = allCaught;
      if (allCaught) injResisted++;
    }

    cases.push({
      id: c.id,
      category: c.category,
      scope: c.scope,
      expectedMiss: !!c.expected_miss,
      injection: !!c.injection,
      injectionResisted,
      gold: caseGold,
      preserve: casePreserve,
      redactedText,
    });
  }

  const pct = (n, d) => (d ? +((n / d) * 100).toFixed(1) : null);

  return {
    headline: {
      adversarialRecallLenient: pct(lenient, goldTotal),
      adversarialRecallStrict: pct(strict, goldTotal),
      inScopeRecall: pct(perScope.deterministic.lenient, perScope.deterministic.total),
      overRedactionRate: pct(overRedacted, preserveTotal),
      preserveAccuracy: pct(preserveKept, preserveTotal),
      injectionResistance: pct(injResisted, injTotal),
    },
    counts: {
      goldIdentifiers: goldTotal,
      caughtLenient: lenient,
      caughtStrict: strict,
      preserveItems: preserveTotal,
      overRedacted,
      injectionCases: injTotal,
      injectionResisted: injResisted,
    },
    perCategory: Object.fromEntries(
      Object.entries(perCategory).sort().map(([k, v]) => [k, {
        recallLenient: pct(v.lenient, v.total),
        recallStrict: pct(v.strict, v.total),
        n: v.total,
      }])
    ),
    perScope: Object.fromEntries(
      Object.entries(perScope).map(([k, v]) => [k, {
        recallLenient: pct(v.lenient, v.total),
        n: v.total,
      }])
    ),
    cases,
  };
}
