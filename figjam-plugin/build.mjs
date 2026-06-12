import * as esbuild from "esbuild";
import { copyFileSync, mkdirSync } from "fs";

const watch = process.argv.includes("--watch");
mkdirSync("dist", { recursive: true });

const opts = {
  entryPoints: ["src/code.ts"],
  bundle: true,
  outfile: "dist/code.js",
  target: "es2017",
  format: "iife",
  logLevel: "info",
};

function copyUi() {
  copyFileSync("src/ui.html", "dist/ui.html");
}

if (watch) {
  const ctx = await esbuild.context(opts);
  await ctx.watch();
  copyUi();
  console.log("watching… (ui.html copied; re-run to recopy UI changes)");
} else {
  await esbuild.build(opts);
  copyUi();
  console.log("built dist/code.js and dist/ui.html");
}
