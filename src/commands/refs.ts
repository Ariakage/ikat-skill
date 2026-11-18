import { resolveRoot, toRepoPath } from "../paths.js";
import { readIndex } from "../store.js";

export interface RefsOptions {
  target: string;
  file: string;
  json: boolean;
}

/** imports + reverse importers for one file. */
export async function runRefs(opts: RefsOptions): Promise<number> {
  const root = resolveRoot(opts.target);
  const index = await readIndex(root);
  if (!index) {
    process.stderr.write(`ikat: no index at ${root} — run \`ikat init\`\n`);
    return 1;
  }
  const rel = toRepoPath(root, process.cwd(), opts.file);
  const entry = index.files.find((f) => f.path === rel);
  if (!entry) {
    const bn = rel.slice(rel.lastIndexOf("/") + 1);
    const cands = index.files
      .filter((f) => f.path.endsWith(`/${bn}`))
      .map((f) => f.path)
      .slice(0, 5);
    process.stderr.write(
      `ikat: ${rel} not in index${cands.length ? ` — did you mean ${cands.join(", ")}?` : " — run `ikat sync` if it is new"}\n`,
    );
    return 1;
  }
  const importedBy = index.files
    .filter((f) => f.imports.includes(rel))
    .map((f) => f.path);

  if (opts.json) {
    process.stdout.write(
      `${JSON.stringify({ path: rel, imports: entry.imports, external: entry.external, importedBy }, null, 2)}\n`,
    );
    return 0;
  }
  const out = [
    rel,
    `out (${entry.imports.length}): ${entry.imports.join(", ") || "·"}`,
    `ext (${entry.external.length}): ${entry.external.join(", ") || "·"}`,
    `in  (${importedBy.length}): ${importedBy.join(", ") || "·"}`,
  ];
  process.stdout.write(`${out.join("\n")}\n`);
  return 0;
}
