import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveRoot, toRepoPath } from "../paths.js";
import { CONVERT_EXTS, extOf } from "../scan.js";
import { ikatPath, type RepoIndex, readIndex, writeIndex } from "../store.js";
import { run, which } from "../tools.js";

/** Converted Markdown is bounded like every other ikat artifact. */
const MAX_CONVERT_SRC = 64 * 1024 * 1024;
const MAX_MD_BYTES = 500 * 1024;

const convDir = (root: string): string => ikatPath(root, "converted");
const mdPath = (root: string, rel: string): string =>
  path.join(convDir(root), `${rel}.md`);
const metaPath = (root: string, rel: string): string =>
  path.join(convDir(root), `${rel}.meta.json`);

async function persist(root: string, index: RepoIndex): Promise<void> {
  await writeIndex(root, index);
}

export async function runConvert(opts: {
  target: string;
  file: string;
}): Promise<number> {
  const root = resolveRoot(opts.target);
  const index = await readIndex(root);
  if (!index) {
    process.stderr.write(`ikat: no index at ${root} — run \`ikat init\`\n`);
    return 1;
  }
  const rel = toRepoPath(root, process.cwd(), opts.file);
  const entry = index.files.find((f) => f.path === rel);
  if (!entry) {
    process.stderr.write(`ikat: ${rel} not in index — run \`ikat sync\`\n`);
    return 1;
  }
  if (!CONVERT_EXTS.has(extOf(rel))) {
    process.stderr.write(
      `ikat: ${rel} is not a convertible document (${extOf(rel) || "no ext"})\n`,
    );
    return 1;
  }

  const abs = path.join(root, rel);
  const setConv = async (
    conv: NonNullable<typeof entry.conv>,
  ): Promise<void> => {
    entry.conv = conv;
    await persist(root, index);
  };

  if (entry.size > MAX_CONVERT_SRC) {
    await setConv("too-large");
    process.stderr.write(
      `ikat: ${rel} is ${(entry.size / 1024 / 1024).toFixed(0)} MB — conv=too-large\n`,
    );
    return 1;
  }

  // fresh cache hit: source hash still matches → nothing to do
  if (entry.conv === "converted" && entry.hash) {
    const meta = JSON.parse(
      await fs.readFile(metaPath(root, rel), "utf8").catch(() => "null"),
    );
    if (meta?.hash === entry.hash) {
      process.stdout.write(
        `converted ${rel} · cached → .ikat/converted/${rel}.md\n`,
      );
      return 0;
    }
  }

  const haveMd = which("markitdown");
  const haveUvx = which("uvx");
  if (!haveMd && !haveUvx) {
    await setConv("unavailable");
    process.stderr.write(
      `ikat: markitdown not found on PATH — conv=unavailable\n` +
        `  install: pipx install markitdown  (or use uvx)\n`,
    );
    return 1;
  }

  let tool = "markitdown";
  let r = haveMd ? await run("markitdown", [abs], 120_000) : null;
  if ((r === null || !r.stdout.trim()) && haveUvx) {
    if (haveMd)
      process.stderr.write(
        `ikat: markitdown on PATH failed — retrying via uvx (first run resolves the package)\n`,
      );
    tool = "uvx markitdown";
    r = await run("uvx", ["markitdown", abs], 180_000);
  }
  if (r === null) {
    process.stderr.write(
      `ikat: markitdown failed to run (spawn error or timeout) — check \`ikat doctor\`\n`,
    );
    return 1;
  }
  if (!r.stdout.trim()) {
    const why = r.stderr.trim().split("\n").pop()?.slice(0, 160);
    process.stderr.write(
      `ikat: markitdown produced no output for ${rel}${why ? ` — ${why}` : ""}\n`,
    );
    return 1;
  }

  let md = r.stdout;
  let truncated = false;
  if (Buffer.byteLength(md) > MAX_MD_BYTES) {
    md = `${md.slice(0, MAX_MD_BYTES)}\n\n<!-- ikat: truncated at ${MAX_MD_BYTES} bytes — use the source file for the rest -->\n`;
    truncated = true;
  }

  await fs.mkdir(path.dirname(mdPath(root, rel)), { recursive: true });
  await fs.writeFile(mdPath(root, rel), md);
  await fs.writeFile(
    metaPath(root, rel),
    `${JSON.stringify(
      {
        source: rel,
        hash: entry.hash,
        tool,
        at: new Date().toISOString(),
        bytes: Buffer.byteLength(md),
        truncated,
      },
      null,
      2,
    )}\n`,
  );
  await setConv("converted");
  process.stdout.write(
    `converted ${rel} · ${(Buffer.byteLength(md) / 1024).toFixed(1)} KB md${truncated ? " (truncated)" : ""} → .ikat/converted/${rel}.md\n`,
  );
  return 0;
}
