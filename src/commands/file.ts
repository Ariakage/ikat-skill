import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveRoot, toRepoPath } from "../paths.js";
import type { FileEntry } from "../scan.js";
import { readIndex } from "../store.js";

const DEFAULT_HEAD = 100;
const FULL_CAP = 4000;

const kb = (n: number): string =>
  n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`;

function suggestions(files: FileEntry[], rel: string): string[] {
  const bn = rel.slice(rel.lastIndexOf("/") + 1);
  return files
    .filter((f) => f.path.endsWith(`/${bn}`) || f.path.endsWith(bn))
    .map((f) => f.path)
    .slice(0, 5);
}

export interface FileOptions {
  target: string;
  file: string;
  lines: string | null;
  full: boolean;
}

export async function runFile(opts: FileOptions): Promise<number> {
  const root = resolveRoot(opts.target);
  const index = await readIndex(root);
  if (!index) {
    process.stderr.write(`ikat: no index at ${root} — run \`ikat init\`\n`);
    return 1;
  }
  const rel = toRepoPath(root, process.cwd(), opts.file);
  const entry = index.files.find((f) => f.path === rel);
  const importedBy = index.files
    .filter((f) => f.imports.includes(rel))
    .map((f) => f.path);

  const out: string[] = [];
  if (entry) {
    out.push(
      `${entry.path}  · ${entry.role} · ${entry.lang ?? "no-lang"} · ${kb(entry.size)} · #${entry.hash ?? "nohash"} · rank ${entry.rank}`,
    );
    if (entry.doc) out.push(`doc: ${entry.doc}`);
    if (entry.exports.length) out.push(`exports: ${entry.exports.join(", ")}`);
    if (entry.imports.length) out.push(`imports: ${entry.imports.join(", ")}`);
    if (entry.external.length)
      out.push(`external: ${entry.external.join(", ")}`);
    if (importedBy.length)
      out.push(
        `imported by: ${importedBy.slice(0, 12).join(", ")}${importedBy.length > 12 ? ` +${importedBy.length - 12}` : ""}`,
      );
  } else {
    const cands = suggestions(index.files, rel);
    const absFile = path.join(root, rel);
    const exists = await fs
      .stat(absFile)
      .then((s) => s.isFile())
      .catch(() => false);
    if (!exists) {
      process.stderr.write(
        `ikat: ${rel} not found${cands.length ? ` — did you mean ${cands.join(", ")}?` : ""}\n`,
      );
      return 1;
    }
    out.push(`${rel}  · not indexed (run \`ikat sync\`)`);
  }

  // excerpt
  if (entry && !entry.lang) {
    out.push(
      "",
      `(binary/${entry.role} file — content not shown; probe lands in M5)`,
    );
  } else {
    const absFile = path.join(root, rel);
    try {
      const text = await fs.readFile(absFile, "utf8");
      const all = text.split(/\r?\n/);
      let from = 1;
      let to = Math.min(all.length, DEFAULT_HEAD);
      let truncated = all.length > to;
      if (opts.lines) {
        const m = /^(\d+)-(\d+)$/.exec(opts.lines);
        if (!m) {
          process.stderr.write(
            `ikat: --lines expects a-b (got "${opts.lines}")\n`,
          );
          return 2;
        }
        from = Math.max(1, Number(m[1]));
        to = Math.min(all.length, Number(m[2]));
        truncated = all.length > to;
        if (from > all.length) {
          process.stderr.write(`ikat: ${rel} has ${all.length} lines\n`);
          return 2;
        }
      } else if (opts.full) {
        to = Math.min(all.length, FULL_CAP);
        truncated = all.length > to;
      }
      out.push("");
      const width = String(to).length;
      for (let i = from; i <= to; i++) {
        out.push(`${String(i).padStart(width)}│${all[i - 1]}`);
      }
      if (truncated)
        out.push(
          `… +${all.length - to} lines — use --lines ${to + 1}-${Math.min(to + DEFAULT_HEAD, all.length)} or --full`,
        );
    } catch {
      out.push("", "(unreadable file)");
    }
  }

  process.stdout.write(`${out.join("\n")}\n`);
  return 0;
}
