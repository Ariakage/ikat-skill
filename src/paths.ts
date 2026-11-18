import path from "node:path";
import { topLevel } from "./git.js";

/** Repo root for a target arg: enclosing git work-tree root if any. */
export const resolveRoot = (target: string): string => {
  const abs = path.resolve(target);
  return topLevel(abs) ?? abs;
};

/** Map a user-supplied file arg onto a repo-relative path.
 * cwd-relative wins when it lands inside root (shell usage from a
 * subdir); otherwise the arg is treated as already repo-relative. */
export function toRepoPath(root: string, cwd: string, arg: string): string {
  const fromCwd = path.relative(root, path.resolve(cwd, arg));
  if (fromCwd && !fromCwd.startsWith("..") && !path.isAbsolute(fromCwd))
    return fromCwd.split(path.sep).join("/");
  const fromRoot = path.relative(root, path.resolve(root, arg));
  return fromRoot.split(path.sep).join("/");
}
