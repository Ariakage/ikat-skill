import { autoTag, entryState, readEntries, tagString } from "../entries.js";
import { recentFiles } from "../git.js";
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

  // rank stays the spine; two deterministic bonuses tilt the queue:
  // files touched by recent commits (+30%) and files in directories
  // with no fresh entry yet (+20%) — breadth across subsystems wins.
  const recentAll = recentFiles(root);
  // shallow clones list the whole tree as "changed" — a recency signal
  // covering ~everything carries no information; drop it
  const recent =
    recentAll.size > 0 && recentAll.size <= index.files.length * 0.8
      ? recentAll
      : new Set<string>();
  const dirOf = (p: string): string =>
    p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
  const freshDirs = new Set<string>();
  for (const f of index.files) {
    const e = entries.get(f.path);
    if (e && entryState(e, index) === "fresh") freshDirs.add(dirOf(f.path));
  }
  const scoreOf = (f: FileEntry): number => {
    let s = f.rank;
    if (recent.has(f.path)) s *= 1.3;
    if (!freshDirs.has(dirOf(f.path))) s *= 1.2;
    return s;
  };

  const queue = index.files
    .filter((f) => ENRICH_ROLES.has(f.role))
    .map((f) => ({ f, state: stateOf(f), recent: recent.has(f.path) }))
    .filter(({ state }) =>
      opts.onlyStale ? state === "stale" : state !== "fresh",
    )
    .sort(
      (a, b) => scoreOf(b.f) - scoreOf(a.f) || a.f.path.localeCompare(b.f.path),
    )
    .slice(0, opts.limit);

  if (opts.json) {
    process.stdout.write(
      `${JSON.stringify(
        queue.map(({ f, state, recent }) => ({
          path: f.path,
          state,
          rank: f.rank,
          score: Math.round(scoreOf(f) * 100) / 100,
          recent,
          tag: tagString(autoTag(f, index.files)),
          doc: f.doc,
        })),
        null,
        2,
      )}\n`,
    );
    return 0;
  }
  const out = queue.map(({ f, state, recent }) => {
    const fHint = f.doc ? ` — ${f.doc}` : "";
    const stale = state === "stale" ? " ⚠stale" : "";
    const rec = recent && state !== "stale" ? " ·recent" : "";
    return `${f.path} [${tagString(autoTag(f, index.files))}]${stale}${rec}${fHint}`;
  });
  process.stdout.write(
    out.length
      ? `${out.join("\n")}\n${queue.length} queued — put lines via \`ikat put <path> --entry "S:…"\`\n`
      : `queue empty — ${opts.onlyStale ? "no stale entries" : "all ranked files have fresh entries"}\n`,
  );
  return 0;
}
