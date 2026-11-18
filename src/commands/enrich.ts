import { autoTag, entryState, readEntries, tagString } from "../entries.js";
import { resolveRoot } from "../paths.js";
import type { FileEntry } from "../scan.js";
import { readIndex } from "../store.js";

export interface EnrichOptions {
  target: string;
  limit: number;
  onlyStale: boolean;
  json: boolean;
}

const ENRICH_ROLES = new Set([
  "entry",
  "route",
  "service",
  "store",
  "src",
  "document",
]);

/** Work queue: ranked index files lacking a fresh entry. The agent reads
 * each row and authors only the delta L0 can't produce (usually S). */
export async function runEnrich(opts: EnrichOptions): Promise<number> {
  const root = resolveRoot(opts.target);
  const index = await readIndex(root);
  if (!index) {
    process.stderr.write(`ikat: no index at ${root} — run \`ikat init\`\n`);
    return 1;
  }
  const entries = await readEntries(root);
  const stateOf = (f: FileEntry): "missing" | "stale" | "fresh" => {
    const e = entries.get(f.path);
    if (!e) return "missing";
    return entryState(e, index) === "stale" ? "stale" : "fresh";
  };

  const queue = index.files
    .filter((f) => ENRICH_ROLES.has(f.role))
    .map((f) => ({ f, state: stateOf(f) }))
    .filter(({ state }) =>
      opts.onlyStale ? state === "stale" : state !== "fresh",
    )
    .sort((a, b) => b.f.rank - a.f.rank || a.f.path.localeCompare(b.f.path))
    .slice(0, opts.limit);

  if (opts.json) {
    process.stdout.write(
      `${JSON.stringify(
        queue.map(({ f, state }) => ({
          path: f.path,
          state,
          rank: f.rank,
          tag: tagString(autoTag(f, index.files)),
          doc: f.doc,
        })),
        null,
        2,
      )}\n`,
    );
    return 0;
  }
  const out = queue.map(({ f, state }) => {
    const fHint = f.doc ? ` — ${f.doc}` : "";
    const stale = state === "stale" ? " ⚠stale" : "";
    return `${f.path} [${tagString(autoTag(f, index.files))}]${stale}${fHint}`;
  });
  process.stdout.write(
    out.length
      ? `${out.join("\n")}\n${queue.length} queued — put lines via \`ikat put <path> --entry "S:…"\`\n`
      : `queue empty — ${opts.onlyStale ? "no stale entries" : "all ranked files have fresh entries"}\n`,
  );
  return 0;
}
