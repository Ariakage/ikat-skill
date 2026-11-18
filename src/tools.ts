import { execFile } from "node:child_process";
import { accessSync, constants, promises as fs } from "node:fs";
import path from "node:path";

const whichCache = new Map<string, string | null>();

/** Resolve a binary on PATH (cached). Never installs anything. */
export function which(bin: string): string | null {
  if (whichCache.has(bin)) return whichCache.get(bin)!;
  const exts =
    process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const p = path.join(dir, bin + ext);
      try {
        accessSync(p, constants.X_OK);
        whichCache.set(bin, p);
        return p;
      } catch {
        /* next candidate */
      }
    }
  }
  whichCache.set(bin, null);
  return null;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

/** Run a tool with a hard timeout. Returns null only when the process
 * never produced output at all (spawn failure or kill); non-zero exits
 * still resolve with captured stderr so callers can report the cause. */
export function run(
  bin: string,
  args: string[],
  timeoutMs = 15_000,
): Promise<RunResult | null> {
  const resolved = which(bin);
  if (!resolved) return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile(
      resolved,
      args,
      { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const out = typeof stdout === "string" ? stdout : "";
        const errOut = typeof stderr === "string" ? stderr : "";
        if (err && !out.trim() && !errOut.trim()) return resolve(null);
        resolve({ stdout: out, stderr: errOut, code: err ? 1 : 0 });
      },
    );
  });
}

/** First existing path from candidates (skill lookup). */
export async function firstExisting(paths: string[]): Promise<string | null> {
  for (const p of paths) {
    try {
      await fs.access(p);
      return p;
    } catch {
      /* next */
    }
  }
  return null;
}
