import { promises as fs } from "node:fs";
import { renderDiagram } from "../diagram.js";
import { readEntries } from "../entries.js";
import { resolveRoot } from "../paths.js";
import { ikatPath, readIndex, readMeta } from "../store.js";

export async function runDiagram(opts: {
  target: string;
  draft: boolean;
}): Promise<number> {
  const root = resolveRoot(opts.target);
  if (!root) {
    process.stderr.write(`ikat: not a repository: ${opts.target}\n`);
    return 1;
  }
  const mmdPath = ikatPath(root, "diagram.mmd");

  if (!opts.draft) {
    try {
      process.stdout.write(await fs.readFile(mmdPath, "utf8"));
      return 0;
    } catch {
      process.stderr.write(
        `ikat: no diagram yet — run \`ikat diagram --draft\`\n`,
      );
      return 1;
    }
  }

  const index = await readIndex(root);
  if (!index) {
    process.stderr.write(`ikat: no index — run \`ikat init\` first\n`);
    return 1;
  }
  const entries = await readEntries(root);
  const { mmd, nodes, edges, clusters } = renderDiagram(index, entries);
  await fs.writeFile(mmdPath, mmd);
  const meta = await readMeta(root);
  if (meta) {
    meta.diagramBytes = Buffer.byteLength(mmd);
    await fs.writeFile(
      ikatPath(root, "meta.json"),
      `${JSON.stringify(meta, null, 2)}\n`,
    );
  }
  process.stdout.write(
    `diagram · ${nodes} nodes · ${edges} edges · ${clusters} clusters → .ikat/diagram.mmd\n`,
  );
  return 0;
}
