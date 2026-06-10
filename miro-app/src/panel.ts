/// <reference types="@mirohq/websdk-types" />

import { Category, Redactor } from "./redact";

type RedactableItem = {
  id: string;
  type: string;
  sync: () => Promise<void>;
  [key: string]: unknown;
};

const SUPPORTED_TYPES = ["sticky_note", "text", "shape", "card"];

/** Text-bearing fields per item type. */
function fieldsFor(item: RedactableItem): string[] {
  switch (item.type) {
    case "card":
      return ["title", "description"];
    default:
      return ["content"];
  }
}

async function collectItems(scope: "selection" | "board"): Promise<RedactableItem[]> {
  const items =
    scope === "selection"
      ? await miro.board.getSelection()
      : await miro.board.get({ type: SUPPORTED_TYPES as never });
  return (items as unknown as RedactableItem[]).filter((it) =>
    SUPPORTED_TYPES.includes(it.type)
  );
}

function selectedCategories(): Category[] {
  const mode = (document.getElementById("mode") as HTMLSelectElement).value;
  if (mode === "clinical") return ["clinical"];
  if (mode === "general") return ["general"];
  return ["clinical", "general"];
}

function selectedScope(): "selection" | "board" {
  const checked = document.querySelector<HTMLInputElement>('input[name="scope"]:checked');
  return checked?.value === "board" ? "board" : "selection";
}

interface RunResult {
  redactor: Redactor;
  itemsScanned: number;
  itemsChanged: number;
}

/** Run the engine over items. When `apply` is true, write changes back. */
async function run(apply: boolean): Promise<RunResult> {
  const scope = selectedScope();
  const redactor = new Redactor(selectedCategories());
  const items = await collectItems(scope);

  let itemsChanged = 0;
  for (const item of items) {
    let itemChanged = false;
    for (const field of fieldsFor(item)) {
      const value = item[field];
      if (typeof value !== "string" || !value) continue;
      const { text, changed } = redactor.redactText(value);
      if (changed) {
        itemChanged = true;
        if (apply) item[field] = text;
      }
    }
    if (itemChanged) {
      itemsChanged++;
      if (apply) await item.sync();
    }
  }
  return { redactor, itemsScanned: items.length, itemsChanged };
}

function renderReport(result: RunResult, applied: boolean) {
  const el = document.getElementById("report")!;
  const report = result.redactor.report;
  const types = Object.keys(report).sort();
  const verb = applied ? "redacted" : "found";

  if (result.itemsScanned === 0) {
    el.innerHTML = `<p class="status">No supported items ${
      selectedScope() === "selection" ? "selected — select sticky notes, text, shapes or cards first" : "on this board"
    }.</p>`;
    return;
  }
  if (types.length === 0) {
    el.innerHTML = `<p class="status ok">✓ No identifiers ${verb} across ${result.itemsScanned} item(s).</p>`;
    return;
  }

  const rows = types
    .map((t) => `<tr><td><code>[${t}]</code></td><td>${report[t]}</td></tr>`)
    .join("");
  el.innerHTML = `
    <p class="status ${applied ? "ok" : "warn"}">
      ${applied ? "✓ Redacted" : "⚠ Found"} identifiers in ${result.itemsChanged} of ${result.itemsScanned} item(s):
    </p>
    <table class="report-table">
      <thead><tr><th>Type</th><th>Distinct values</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${
      applied
        ? `<button id="download-map" class="button button-secondary button-small" type="button">Download token map</button>
           <p class="hint">The token map links tokens back to original values for re-identification. It is generated locally and never uploaded — store it securely.</p>`
        : `<p class="hint">Nothing has been changed yet. Click <strong>Redact</strong> to apply.</p>`
    }
  `;

  const dl = document.getElementById("download-map");
  if (dl) {
    dl.addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(result.redactor.tokenMap, null, 2)], {
        type: "application/json",
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `redacta-token-map-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }
}

function setBusy(busy: boolean) {
  for (const id of ["scan", "redact"]) {
    (document.getElementById(id) as HTMLButtonElement).disabled = busy;
  }
}

document.getElementById("scan")!.addEventListener("click", async () => {
  setBusy(true);
  try {
    renderReport(await run(false), false);
  } finally {
    setBusy(false);
  }
});

document.getElementById("redact")!.addEventListener("click", async () => {
  setBusy(true);
  try {
    renderReport(await run(true), true);
  } finally {
    setBusy(false);
  }
});
