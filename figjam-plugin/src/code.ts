/// <reference types="@figma/plugin-typings" />

/**
 * Redacta for FigJam — main (sandbox) code.
 *
 * Runs the Redacta engine on FigJam text nodes (sticky notes, shapes with text,
 * text, connectors, table cells). Pure on-device: the manifest grants no network
 * access, so nothing leaves the board.
 */

import {
  Category,
  Redactor,
  ResidualFinding,
  isValidTokenMap,
  reinstate,
  selfCheck,
} from "@pharmatools/redacta";

type Scope = "selection" | "page";

figma.showUI(__html__, { width: 340, height: 560, title: "Redacta" });

// --- Text targets ----------------------------------------------------------
// A uniform read/write wrapper over the various FigJam text-bearing nodes.

interface TextTarget {
  read(): string;
  write(value: string): Promise<void>;
}

// StickyNode, ShapeWithTextNode, ConnectorNode and TableCellNode expose a
// `text` TextSublayerNode; TextNode exposes the text properties directly.
function sublayerTarget(sub: TextSublayerNode): TextTarget {
  return {
    read: () => sub.characters,
    write: async (value) => {
      await loadFontsForSublayer(sub);
      sub.characters = value;
    },
  };
}

function textNodeTarget(node: TextNode): TextTarget {
  return {
    read: () => node.characters,
    write: async (value) => {
      await loadFontsForTextNode(node);
      node.characters = value;
    },
  };
}

async function loadFontsForTextNode(node: TextNode): Promise<void> {
  if (node.characters.length === 0) return;
  const fn = node.fontName;
  if (fn !== figma.mixed) {
    await figma.loadFontAsync(fn);
    return;
  }
  const seen = new Set<string>();
  for (let i = 0; i < node.characters.length; i++) {
    const f = node.getRangeFontName(i, i + 1) as FontName;
    const key = f.family + "|" + f.style;
    if (!seen.has(key)) {
      seen.add(key);
      await figma.loadFontAsync(f);
    }
  }
}

async function loadFontsForSublayer(sub: TextSublayerNode): Promise<void> {
  const len = sub.characters.length;
  if (len === 0) return;
  const fn = sub.fontName;
  if (fn !== figma.mixed) {
    await figma.loadFontAsync(fn);
    return;
  }
  const seen = new Set<string>();
  for (let i = 0; i < len; i++) {
    const f = sub.getRangeFontName(i, i + 1) as FontName;
    const key = f.family + "|" + f.style;
    if (!seen.has(key)) {
      seen.add(key);
      await figma.loadFontAsync(f);
    }
  }
}

function collectTargets(scope: Scope): TextTarget[] {
  const roots: readonly BaseNode[] =
    scope === "selection" ? figma.currentPage.selection : figma.currentPage.children;
  const targets: TextTarget[] = [];

  const visit = (node: BaseNode): void => {
    switch (node.type) {
      case "STICKY":
      case "SHAPE_WITH_TEXT":
      case "CONNECTOR":
        targets.push(sublayerTarget((node as StickyNode).text));
        break;
      case "TEXT":
        targets.push(textNodeTarget(node as TextNode));
        break;
      case "TABLE": {
        const table = node as TableNode;
        for (let r = 0; r < table.numRows; r++) {
          for (let c = 0; c < table.numColumns; c++) {
            targets.push(sublayerTarget(table.cellAt(r, c).text));
          }
        }
        break;
      }
    }
    if ("children" in node) {
      for (const child of (node as ChildrenMixin).children) visit(child);
    }
  };

  for (const r of roots) visit(r);
  return targets;
}

// --- Messaging -------------------------------------------------------------

function categoriesFor(mode: string): Category[] {
  if (mode === "clinical") return ["clinical"];
  if (mode === "general") return ["general"];
  if (mode === "safeharbor") return ["safeharbor"];
  return ["clinical", "general"];
}

interface RunMessage {
  type: "scan" | "redact";
  mode: string;
  scope: Scope;
}
interface ReinstateMessage {
  type: "reinstate";
  scope: Scope;
  tokenMap: unknown;
}

figma.ui.onmessage = async (msg: RunMessage | ReinstateMessage) => {
  try {
    if (msg.type === "scan" || msg.type === "redact") {
      await handleRun(msg);
    } else if (msg.type === "reinstate") {
      await handleReinstate(msg);
    }
  } catch (err) {
    figma.ui.postMessage({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
};

async function handleRun(msg: RunMessage): Promise<void> {
  const apply = msg.type === "redact";
  const targets = collectTargets(msg.scope);
  const redactor = new Redactor(categoriesFor(msg.mode));
  const redactedParts: string[] = [];
  let changed = 0;

  for (const t of targets) {
    const original = t.read();
    if (!original) continue;
    const result = redactor.redactText(original);
    redactedParts.push(result.text);
    if (result.changed) {
      changed++;
      if (apply) await t.write(result.text);
    }
  }

  const residual: ResidualFinding[] = selfCheck(redactedParts.join("\n"));
  figma.ui.postMessage({
    type: "result",
    applied: apply,
    itemsScanned: targets.length,
    itemsChanged: changed,
    report: redactor.report,
    tokenMap: redactor.tokenMap,
    residual,
  });
}

async function handleReinstate(msg: ReinstateMessage): Promise<void> {
  if (!isValidTokenMap(msg.tokenMap)) {
    figma.ui.postMessage({ type: "reinstate-result", error: "invalid token map" });
    return;
  }
  const map = msg.tokenMap as Record<string, string>;
  const targets = collectTargets(msg.scope);
  let changed = 0;
  for (const t of targets) {
    const original = t.read();
    if (!original) continue;
    const out = reinstate(original, map);
    if (out.changed) {
      changed++;
      await t.write(out.text);
    }
  }
  figma.ui.postMessage({
    type: "reinstate-result",
    itemsChanged: changed,
    itemsScanned: targets.length,
  });
}
