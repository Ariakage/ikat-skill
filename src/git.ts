import { execFileSync } from "node:child_process";

/** Run git, return trimmed stdout or null on any failure. */
export function git(args: string[], cwd: string): string | null {
  try {
    const out = execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.trimEnd();
  } catch {
    return null;
  }
}

export const headSha = (cwd: string): string | null =>
  git(["rev-parse", "HEAD"], cwd);

export const topLevel = (cwd: string): string | null =>
  git(["rev-parse", "--show-toplevel"], cwd);

/** Tracked + untracked-not-ignored paths, NUL-separated for safety. */
export function listFiles(cwd: string): string[] | null {
  const out = git(["ls-files", "-c", "-o", "--exclude-standard", "-z"], cwd);
  if (out === null) return null;
  return out.split("\0").filter((p) => p.length > 0);
}
