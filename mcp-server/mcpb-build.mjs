// Build a self-contained server bundle for the MCPB (desktop extension) package.
// Bundles the MCP server + engine + SDK into mcpb/server.mjs so the .mcpb needs
// no node_modules. Then pack with:  npx @anthropic-ai/mcpb pack mcpb
import * as esbuild from "esbuild";
import { copyFileSync } from "fs";

await esbuild.build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  outfile: "mcpb/server.mjs",
  logLevel: "info",
});

copyFileSync("icon.png", "mcpb/icon.png");
console.log("MCPB bundle ready: mcpb/server.mjs + mcpb/icon.png (manifest.json already present)");
