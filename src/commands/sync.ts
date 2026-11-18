import { promises as fs } from "node:fs";
import path from "node:path";
import { renderDigest } from "../digest.js";
import { topLevel } from "../git.js";
import { gitDir } from "../marker.js";
import { buildEntry, buildIndex, resolveAllEdges } from "../pipeline.js";
import { computeRanks } from "../rank.js";
import { type FileEntry, inventory } from "../scan.js";
import { FORMAT, readIndex, VERSION, writeArtifacts } from "../store.js";

export interface SyncOptions {
  path: string;
  quiet: boolean;
}

export interface SyncReport {
  unchanged: number;
  refreshed: number;
  added: number;
  removed: number;
}

/** Incremental L0 refresh. Entries whose size+mtime are unchanged are
 * reused verbatim (extraction skipped); edges re-resolve globally since
 * the file set may have changed. */
export async function runSync(opts: SyncOptions): Promise<number> {
  const abs = path.resolve(opts.path);
  const root = topLevel(abs) ?? abs;
  const log = (s: string) => {
    if (!opts.quiet) process.stdout.write(`${s}\n`);
  };

  const prev = await readIndex(root);
  if (!prev) {
    process.stderr.write(`ikat: no index at ${root} — run \`ikat init\`\n`);
    return 1;
  }
  const oldByPath = new Map(prev.files.map((f) => [f.path, f]));

  const paths = (await inventory(root)).filter((p) => !p.startsWith(".ikat/"));
  const entries: FileEntry[] = [];
  const report: SyncReport = {
    unchanged: 0,
    refreshed: 0,
    added: 0,
    removed: 0,
  };

  for (const p of paths) {
    const old = oldByPath.get(p);
    let reusable = false;
    if (old && Array.isArray(old.specs)) {
      try {
        const st = await fs.stat(path.join(root, p));
        reusable =
          st.isFile() &&
          st.size === old.size &&
          Math.round(st.mtimeMs) === old.mtime;
      } catch {
        /* stat failed — fall through to rebuild */
      }
    }
    if (old && reusable) {
      entries.push({ ...old, specs: [...old.specs] });
      report.unchanged++;
      continue;
    }
    if (old) report.refreshed++;
    else report.added++;
    const e = await buildEntry(root, p);
    if (e) entries.push(e);
  }
  const current = new Set(entries.map((e) => e.path));
  report.removed = prev.files.filter((f) => !current.has(f.path)).length;

  resolveAllEdges(entries);
  computeRanks(entries);
  const index = await buildIndex(root, entries, paths);
  const digest = renderDigest(index);
  const gd = await gitDir(root);
  await writeArtifacts(root, index, digest, {
    format: FORMAT,
    tool: "ikat",
    toolVersion: VERSION,
    generatedAt: index.generatedAt,
    head: index.repo.head,
    counts: index.stats.roles,
    digestBytes: Buffer.byteLength(digest),
    exclude: gd ? "info/exclude" : "tracked",
  });

  log(
    `sync · ${report.unchanged} unchanged · ${report.refreshed} refreshed · ${report.added} added · ${report.removed} removed`,
  );
  log(
    `edges · ${index.stats.edges} internal · files ${index.stats.files} · index ${index.repo.head ? index.repo.head.slice(0, 8) : "no-git"}`,
  );
  return 0;
}
