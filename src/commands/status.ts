import { promises as fs } from "node:fs";
import path from "node:path";
import { headSha, topLevel } from "../git.js";
import { ikatPath, readMeta } from "../store.js";

export async function runStatus(target: string): Promise<number> {
  const abs = path.resolve(target);
  const root = topLevel(abs) ?? abs;
  const meta = await readMeta(root);
  if (!meta) {
    process.stderr.write(`ikat: no index at ${root} — run \`ikat init\`\n`);
    return 1;
  }
  const head = headSha(root);
  const fresh = head !== null && head === meta.head;
  const digestSize = await fs
    .stat(ikatPath(root, "digest.md"))
    .then((s) => `${(s.size / 1024).toFixed(1)} KB`)
    .catch(() => "missing");
  const counts = Object.entries(meta.counts)
    .map(([k, n]) => `${k} ${n}`)
    .join(" · ");
  process.stdout.write(
    [
      `ikat ${meta.toolVersion} · ${root}`,
      `state  · ${meta.head === null ? "no git" : fresh ? "fresh" : `stale (indexed ${meta.head.slice(0, 8)}, HEAD ${head?.slice(0, 8)})`}`,
      `files  · ${counts}`,
      `digest · ${digestSize} · generated ${meta.generatedAt}`,
    ].join("\n") + "\n",
  );
  return fresh || meta.head === null ? 0 : 2;
}
