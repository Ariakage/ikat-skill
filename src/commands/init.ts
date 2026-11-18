import path from "node:path";
import { renderDigest } from "../digest.js";
import { readEntries } from "../entries.js";
import { topLevel } from "../git.js";
import { applyMarker, ensureExclude, gitDir } from "../marker.js";
import { buildEntry, buildIndex, resolveAllEdges } from "../pipeline.js";
import { probeTools } from "../probe.js";
import { computeRanks } from "../rank.js";
import { type FileEntry, inventory } from "../scan.js";
import { FORMAT, VERSION, writeArtifacts } from "../store.js";

export interface InitOptions {
  path: string;
  tracked: boolean;
  marker: boolean;
  quiet: boolean;
}

export async function runInit(opts: InitOptions): Promise<number> {
  const abs = path.resolve(opts.path);
  const root = topLevel(abs) ?? abs;
  const log = (s: string) => {
    if (!opts.quiet) process.stdout.write(`${s}\n`);
  };

  const paths = (await inventory(root)).filter((p) => !p.startsWith(".ikat/"));
  if (!paths.length) {
    process.stderr.write(`ikat: no files found at ${root}\n`);
    return 1;
  }

  const repoFiles = new Set(paths);
  const entries: FileEntry[] = [];
  for (const p of paths) {
    const e = await buildEntry(root, p, repoFiles);
    if (e) entries.push(e);
  }

  resolveAllEdges(entries);
  computeRanks(entries);
  const index = await buildIndex(root, entries, paths);
  const stats = index.stats;
  const digest = renderDigest(index, await readEntries(root));

  const gd = await gitDir(root);
  const tracked = opts.tracked || !gd;
  let excludeStatus: "added" | "present" | "tracked" | "none" = "none";
  if (tracked) excludeStatus = "tracked";
  else if (gd) excludeStatus = await ensureExclude(gd);

  await writeArtifacts(root, index, digest, {
    format: FORMAT,
    tool: "ikat",
    toolVersion: VERSION,
    generatedAt: index.generatedAt,
    head: index.repo.head,
    counts: stats.roles,
    digestBytes: Buffer.byteLength(digest),
    probe: probeTools(),
    exclude: excludeStatus === "tracked" ? "tracked" : "info/exclude",
  });

  let markerStatus = "skipped";
  if (opts.marker) markerStatus = await applyMarker(root);

  const src =
    (stats.roles.src ?? 0) +
    (stats.roles.entry ?? 0) +
    (stats.roles.route ?? 0) +
    (stats.roles.service ?? 0) +
    (stats.roles.store ?? 0);
  log(`ikat ${VERSION} · ${root}`);
  log(
    `files  · ${stats.files} (source ${src} · test ${stats.roles.test ?? 0} · config ${stats.roles.config ?? 0} · asset ${stats.roles.asset ?? 0} · document ${stats.roles.document ?? 0} · generated ${stats.roles.generated ?? 0})`,
  );
  log(
    `edges  · ${stats.edges} internal · ${new Set(entries.flatMap((e) => e.external)).size} external`,
  );
  log(
    `digest · .ikat/digest.md (${(Buffer.byteLength(digest) / 1024).toFixed(1)} KB)`,
  );
  log(`marker · ${markerStatus}${opts.marker ? "" : " (--no-marker)"}`);
  log(
    `ignore · ${excludeStatus === "tracked" ? "tracked (commit .ikat/ to share)" : `.git/info/exclude ${excludeStatus}`}`,
  );
  return 0;
}
