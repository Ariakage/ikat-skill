import { promises as fs } from "node:fs";
import path from "node:path";
import { topLevel } from "../git.js";
import { gitDir, removeExclude, removeMarker } from "../marker.js";
import { IKAT_DIR, ikatPath } from "../store.js";

export async function runDigest(target: string): Promise<number> {
  const abs = path.resolve(target);
  const root = topLevel(abs) ?? abs;
  try {
    process.stdout.write(
      await fs.readFile(ikatPath(root, "digest.md"), "utf8"),
    );
    return 0;
  } catch {
    process.stderr.write(`ikat: no digest at ${root} — run \`ikat init\`\n`);
    return 1;
  }
}

export async function runUninit(target: string): Promise<number> {
  const abs = path.resolve(target);
  const root = topLevel(abs) ?? abs;
  const dir = path.join(root, IKAT_DIR);
  const removed = await fs
    .rm(dir, { recursive: true, force: true })
    .then(() => true)
    .catch(() => false);
  const marker = await removeMarker(root);
  const gd = await gitDir(root);
  const excl = gd ? await removeExclude(gd) : false;
  if (!removed && !marker && !excl) {
    process.stderr.write(`ikat: nothing to remove at ${root}\n`);
    return 1;
  }
  process.stdout.write(
    `removed ${[removed ? ".ikat/" : null, marker ? "AGENTS.md marker" : null, excl ? "info/exclude line" : null].filter(Boolean).join(" · ")}\n`,
  );
  return 0;
}
