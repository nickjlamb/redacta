/**
 * File release: write restored (re-identified) text to the operator's
 * allowlisted directory, returning only a receipt.
 *
 * Safety properties:
 * - The client never influences the path: the directory comes from server
 *   config and the filename is generated here, so traversal is excluded by
 *   construction. The resolved path is still verified against the realpath
 *   of the release directory (belt and braces, e.g. symlinked dirs).
 * - The directory must already exist — the server never silently creates a
 *   destination for PHI.
 * - Content is written to a same-directory temp file opened with O_EXCL and
 *   mode 0600, then renamed into place (atomic on the same filesystem).
 * - Filenames, receipts and errors contain no PHI.
 */

import { randomBytes } from "node:crypto";
import { closeSync, constants, openSync, realpathSync, renameSync, statSync, writeSync } from "node:fs";
import { join, resolve, sep } from "node:path";

export interface ReleaseReceipt {
  file: string;
  bytes: number;
}

export class ReleaseError extends Error {}

function assertReleasableDir(dir: string): string {
  let real: string;
  try {
    real = realpathSync(dir);
  } catch {
    throw new ReleaseError(
      "Release directory does not exist. Set REDACTA_RELEASE_DIR to an existing directory."
    );
  }
  if (!statSync(real).isDirectory()) {
    throw new ReleaseError("REDACTA_RELEASE_DIR is not a directory.");
  }
  return real;
}

function generatedName(): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);
  return `redacta-release-${stamp}-${randomBytes(3).toString("hex")}.txt`;
}

/** Atomically write `content` into `dir` under a generated name, mode 0600. */
export function writeRelease(dir: string, content: string): ReleaseReceipt {
  const realDir = assertReleasableDir(dir);
  const name = generatedName();
  const finalPath = resolve(join(realDir, name));
  const tmpPath = finalPath + ".tmp";
  // Defence in depth: both paths must sit inside the release dir.
  for (const p of [finalPath, tmpPath]) {
    if (!p.startsWith(realDir + sep)) {
      throw new ReleaseError("Refusing to write outside the release directory.");
    }
  }
  const data = Buffer.from(content, "utf8");
  const fd = openSync(
    tmpPath,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
    0o600
  );
  try {
    writeSync(fd, data);
  } finally {
    closeSync(fd);
  }
  renameSync(tmpPath, finalPath);
  return { file: finalPath, bytes: data.byteLength };
}
