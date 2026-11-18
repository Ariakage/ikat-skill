import path from "node:path";
import { createInterface } from "node:readline";
import { rewriteDigest } from "../digest.js";
import {
  type AuthoredEntry,
  parseEntryLine,
  readEntries,
  tagString,
  validateEntry,
  writeEntries,
} from "../entries.js";
import { resolveRoot, toRepoPath } from "../paths.js";
import { hashFile, readIndex } from "../store.js";

export interface PutOptions {
  target: string;
  file: string | null;
  entry: string | null;
}

const stdinLines = async (): Promise<string[]> => {
  const rl = createInterface({ input: process.stdin, terminal: false });
  const lines: string[] = [];
  for await (const l of rl) lines.push(l);
  return lines;
};

/** Validate + store one (or many, via stdin) FRAS lines, hash-bound to the
 * current index. The agent owns the text; ikat owns the contract. */
export async function runPut(opts: PutOptions): Promise<number> {
  const root = resolveRoot(opts.target);
  const index = await readIndex(root);
  if (!index) {
    process.stderr.write(`ikat: no index at ${root} — run \`ikat init\`\n`);
    return 1;
  }

  const rel = opts.file ? toRepoPath(root, process.cwd(), opts.file) : null;
  const lines: string[] = [];
  if (opts.entry !== null) {
    if (!rel) {
      process.stderr.write("ikat: --entry needs a file path arg\n");
      return 2;
    }
    lines.push(`${rel}: ${opts.entry}`);
  } else if (rel) {
    // path arg + fields on stdin
    const stdin = await stdinLines();
    const body = stdin.join(" ").trim();
    if (!body) {
      process.stderr.write("ikat: no entry text on stdin\n");
      return 2;
    }
    lines.push(`${rel}: ${body}`);
  } else {
    lines.push(...(await stdinLines()));
  }

  const entries = await readEntries(root);
  const stored: string[] = [];
  const failures: string[] = [];

  for (const raw of lines) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    const { entry, error } = parseEntryLine(raw);
    if (error || !entry) {
      failures.push(`${raw.slice(0, 60)} — ${error ?? "unparseable"}`);
      continue;
    }
    const { ok, errors } = validateEntry(entry, index);
    if (!ok) {
      failures.push(`${entry.path} — ${errors.join("; ")}`);
      continue;
    }
    const file = index.files.find((f) => f.path === ok.path)!;
    // bind the live file hash, not the (possibly stale) index hash
    let live = file.hash ?? "";
    try {
      live = await hashFile(path.join(root, ok.path));
      if (live !== file.hash)
        process.stderr.write(
          `ikat: ${ok.path} drifted since index — bound to live hash; run \`ikat sync\`\n`,
        );
    } catch {
      /* keep index hash */
    }
    const authored: AuthoredEntry = {
      path: ok.path,
      tag: ok.tag,
      fields: ok.fields,
      hash: live,
    };
    entries.set(ok.path, authored);
    stored.push(
      `${ok.path} [${tagString(ok.tag)}] @${authored.hash || "nohash"} · ${Object.keys(ok.fields).join("/")}`,
    );
  }

  if (stored.length) {
    await writeEntries(root, entries);
    await rewriteDigest(root, index, entries);
  }
  for (const s of stored) process.stdout.write(`stored ${s}\n`);
  for (const f of failures) process.stderr.write(`ikat: ${f}\n`);
  return failures.length && !stored.length ? 1 : 0;
}
