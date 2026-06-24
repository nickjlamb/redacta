#!/usr/bin/env node
// Rebuild Resources/redacta.bundle.js from the shared engine.
//
// Usage (from repo root, after `npm --prefix npm-package run build`):
//   node ios-app/RedactaEngine/build-bundle.mjs
//
// Uses the esbuild binary already vendored in mcp-server/node_modules, so it
// needs no extra install. The output is a single IIFE with no module / Node /
// DOM dependencies, suitable for loading into a JavaScriptCore JSContext on iOS.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

const candidates = [
  resolve(repoRoot, "mcp-server/node_modules/.bin/esbuild"),
  resolve(repoRoot, "npm-package/node_modules/.bin/esbuild"),
  resolve(repoRoot, "node_modules/.bin/esbuild"),
];
const esbuild = candidates.find(existsSync);
if (!esbuild) {
  console.error("esbuild not found. Run `npm i` in mcp-server, or `npm i -g esbuild`.");
  process.exit(1);
}

const out = resolve(here, "Resources/redacta.bundle.js");
const res = spawnSync(
  esbuild,
  [
    resolve(here, "entry.mjs"),
    "--bundle",
    "--format=iife",
    "--platform=neutral",
    "--target=es2018",
    "--legal-comments=none",
    `--outfile=${out}`,
  ],
  { stdio: "inherit" }
);
process.exit(res.status ?? 0);
