import type { FileEntry } from "./scan.js";

const LOW_VALUE_ROLES = new Set([
  "test",
  "config",
  "generated",
  "asset",
  "document",
]);

/** Deterministic core-rank: in-degree dominates, size and role tune it. */
export function computeRanks(files: FileEntry[]): void {
  const inDeg = new Map<string, number>();
  for (const f of files) {
    for (const imp of f.imports) {
      inDeg.set(imp, (inDeg.get(imp) ?? 0) + 1);
    }
  }
  for (const f of files) {
    let r = (inDeg.get(f.path) ?? 0) * 3 + Math.log2(f.size + 1) / 4;
    if (f.role === "entry") r += 4;
    if (f.doc) r += 0.5;
    if (LOW_VALUE_ROLES.has(f.role)) r *= 0.25;
    f.rank = Math.round(r * 100) / 100;
  }
}
