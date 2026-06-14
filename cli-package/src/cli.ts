#!/usr/bin/env node
/**
 * redacta-cli — command-line redaction.
 *
 * Pseudonymise patient identifiers and PII in text, and restore them, from the
 * terminal. Wraps @pharmatools/redacta. Runs locally; no network.
 */

import { readFileSync, writeFileSync } from "node:fs";
import {
  Category,
  Redactor,
  isValidTokenMap,
  reinstate,
  selfCheck,
} from "@pharmatools/redacta";

const HELP = `redacta-cli — pseudonymise patient identifiers & PII (and restore them)

Usage:
  redacta-cli [redact] [file] [options]      Redact a file or stdin
  redacta-cli reinstate [file] --map <file>  Restore originals from a token map

Redact options:
  --mode <m>        clinical | general | both | safeharbor   (default: both)
  --safe-harbor     shorthand for --mode safeharbor (HIPAA Safe Harbor)
  --text-only       print just the redacted text (no JSON)
  --map-out <file>  also write the token map to <file>

General:
  -h, --help        show this help

Reads stdin when no file is given. Examples:
  redacta-cli letter.txt --safe-harbor
  cat note.txt | redacta-cli --text-only
  redacta-cli letter.txt --map-out map.json --text-only > safe.txt
  redacta-cli reinstate safe.txt --map map.json --text-only
`;

interface Args {
  command: "redact" | "reinstate";
  file?: string;
  mode: Category[];
  textOnly: boolean;
  mapOut?: string;
  map?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { command: "redact", mode: ["clinical", "general"], textOnly: false };
  let i = 0;
  if (argv[0] === "redact" || argv[0] === "reinstate") {
    args.command = argv[0] as Args["command"];
    i = 1;
  }
  for (; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--text-only": args.textOnly = true; break;
      case "--safe-harbor": args.mode = ["safeharbor"]; break;
      case "--mode": {
        const v = argv[++i];
        args.mode = v === "clinical" ? ["clinical"]
          : v === "general" ? ["general"]
          : v === "safeharbor" ? ["safeharbor"]
          : ["clinical", "general"];
        break;
      }
      case "--map-out": args.mapOut = argv[++i]; break;
      case "--map": args.map = argv[++i]; break;
      default:
        if (a.startsWith("-")) {
          process.stderr.write(`Unknown option: ${a}\n`);
          process.exit(2);
        }
        args.file = a;
    }
  }
  return args;
}

function readInput(file?: string): string {
  if (file) return readFileSync(file, "utf8");
  return readFileSync(0, "utf8"); // stdin
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.includes("-h") || argv.includes("--help") || argv.length === 0 && process.stdin.isTTY) {
    process.stdout.write(HELP);
    return;
  }
  const args = parseArgs(argv);
  const input = readInput(args.file);

  if (args.command === "reinstate") {
    if (!args.map) {
      process.stderr.write("reinstate requires --map <token map file>\n");
      process.exit(2);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(args.map, "utf8"));
    } catch {
      process.stderr.write("Could not read --map file as JSON\n");
      process.exit(2);
    }
    const map = (parsed && typeof parsed === "object" && "token_map" in (parsed as object)
      ? (parsed as { token_map: unknown }).token_map
      : parsed);
    if (!isValidTokenMap(map)) {
      process.stderr.write("Not a valid Redacta token map\n");
      process.exit(2);
    }
    const { text, changed } = reinstate(input, map as Record<string, string>);
    if (args.textOnly) process.stdout.write(text.endsWith("\n") ? text : text + "\n");
    else process.stdout.write(JSON.stringify({ text, changed }, null, 2) + "\n");
    return;
  }

  // redact
  const redactor = new Redactor(args.mode);
  const { text } = redactor.redactText(input);
  if (args.mapOut) writeFileSync(args.mapOut, JSON.stringify(redactor.tokenMap, null, 2) + "\n");

  if (args.textOnly) {
    process.stdout.write(text.endsWith("\n") ? text : text + "\n");
  } else {
    process.stdout.write(
      JSON.stringify(
        {
          redacted_text: text,
          report: redactor.report,
          token_map: redactor.tokenMap,
          self_check: selfCheck(text),
        },
        null,
        2
      ) + "\n"
    );
  }
}

main();
