import { promises as fs } from "node:fs";
import path from "node:path";
import { entryState, readEntries } from "../entries.js";
import { headSha, topLevel } from "../git.js";
import { FORMAT, ikatPath, readIndex, readMeta } from "../store.js";

export interface StatusOptions {
  target: string;
  json: boolean;
}

export async function runStatus(opts: StatusOptions): Promise<number> {
  const abs = path.resolve(opts.target);
  const root = topLevel(abs) ?? abs;
  const meta = await readMeta(root);
  if (!meta) {
    process.stderr.write(`ikat: no index at ${root} — run \`ikat init\`\n`);
    return 1;
  }
  const index = await readIndex(root);
  const authored = await readEntries(root);
  const freshEntries = index
    ? [...authored.values()].filter((e) => entryState(e, index) === "fresh")
        .length
    : 0;
  const head = headSha(root);
  const oldFormat = meta.format !== FORMAT;
  const fresh = !oldFormat && head !== null && head === meta.head;
  const state =
    meta.head === null
      ? "no-git"
      : oldFormat
        ? `old-format (${meta.format} → ${FORMAT}; run \`ikat sync\`)`
        : fresh
          ? "fresh"
          : `stale (indexed ${meta.head.slice(0, 8)}, HEAD ${head?.slice(0, 8)})`;
  const digestSize = await fs
    .stat(ikatPath(root, "digest.md"))
    .then((s) => `${(s.size / 1024).toFixed(1)} KB`)
    .catch(() => "missing");
  const counts = Object.entries(meta.counts)
    .map(([k, n]) => `${k} ${n}`)
    .join(" · ");

  if (opts.json) {
    process.stdout.write(
      `${JSON.stringify({ root, version: meta.toolVersion, format: meta.format, fresh, head, indexedHead: meta.head, counts: meta.counts, entries: { total: authored.size, fresh: freshEntries }, digestBytes: meta.digestBytes, generatedAt: meta.generatedAt }, null, 2)}\n`,
    );
    return 0;
  }
  const entriesLine = authored.size
    ? `entries · ${freshEntries}/${authored.size} fresh (${Math.round((freshEntries / authored.size) * 100)}%)\n`
    : "";
  process.stdout.write(
    `ikat ${meta.toolVersion} · ${root}\nstate  · ${state}\nfiles  · ${counts}\n${entriesLine}digest · ${digestSize} · generated ${meta.generatedAt}\n`,
  );
  return 0;
}
