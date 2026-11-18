import { promises as fs } from "node:fs";
import path from "node:path";

export const MARK_OPEN = "<!-- ikat:index -->";
export const MARK_CLOSE = "<!-- /ikat:index -->";
const BLOCK = `${MARK_OPEN}
This repo has an ikat index: read .ikat/digest.md for architecture context.
Run \`ikat init\` to regenerate it; remove .ikat/ and this block to opt out.
${MARK_CLOSE}`;

export type MarkerResult = "created" | "appended" | "updated" | "skipped";

export async function applyMarker(root: string): Promise<MarkerResult> {
  const file = path.join(root, "AGENTS.md");
  let text: string;
  try {
    text = await fs.readFile(file, "utf8");
  } catch {
    await fs.writeFile(file, `${BLOCK}\n`);
    return "created";
  }
  const open = text.indexOf(MARK_OPEN);
  const close = text.indexOf(MARK_CLOSE);
  if (open !== -1 && close !== -1 && close > open) {
    const next = `${text.slice(0, open)}${BLOCK}${text.slice(close + MARK_CLOSE.length)}`;
    if (next !== text) {
      await fs.writeFile(file, next);
      return "updated";
    }
    return "skipped";
  }
  const sep = text.endsWith("\n") ? "\n" : "\n\n";
  await fs.writeFile(file, `${text}${sep}${BLOCK}\n`);
  return "appended";
}

export async function removeMarker(root: string): Promise<boolean> {
  const file = path.join(root, "AGENTS.md");
  let text: string;
  try {
    text = await fs.readFile(file, "utf8");
  } catch {
    return false;
  }
  const open = text.indexOf(MARK_OPEN);
  const close = text.indexOf(MARK_CLOSE);
  if (open === -1 || close === -1 || close < open) return false;
  let next = text.slice(0, open) + text.slice(close + MARK_CLOSE.length);
  next = next.replace(/\n{3,}/g, "\n\n");
  if (!next.trim()) {
    await fs.rm(file);
  } else {
    await fs.writeFile(file, next);
  }
  return true;
}

/** Resolve the real .git dir, following worktree pointer files. */
export async function gitDir(root: string): Promise<string | null> {
  const dotgit = path.join(root, ".git");
  try {
    const st = await fs.stat(dotgit);
    if (st.isDirectory()) return dotgit;
    if (st.isFile()) {
      const text = await fs.readFile(dotgit, "utf8");
      const m = /^gitdir:\s*(.+)$/m.exec(text);
      if (!m) return null;
      const gd = path.resolve(root, m[1]!.trim());
      try {
        const common = (
          await fs.readFile(path.join(gd, "commondir"), "utf8")
        ).trim();
        return path.resolve(gd, common);
      } catch {
        return gd;
      }
    }
  } catch {
    /* not a git repo */
  }
  return null;
}

const EXCLUDE_LINE = ".ikat/";

export async function ensureExclude(gd: string): Promise<"added" | "present"> {
  const file = path.join(gd, "info", "exclude");
  let text = "";
  try {
    text = await fs.readFile(file, "utf8");
  } catch {
    await fs.mkdir(path.dirname(file), { recursive: true });
  }
  if (/^\.ikat\/?\s*$/m.test(text)) return "present";
  const sep = text.length && !text.endsWith("\n") ? "\n" : "";
  await fs.writeFile(file, `${text}${sep}${EXCLUDE_LINE}\n`);
  return "added";
}

export async function removeExclude(gd: string): Promise<boolean> {
  const file = path.join(gd, "info", "exclude");
  let text: string;
  try {
    text = await fs.readFile(file, "utf8");
  } catch {
    return false;
  }
  const next = text.replace(/^\.ikat\/?\s*\n?/gm, "");
  if (next === text) return false;
  await fs.writeFile(file, next);
  return true;
}
