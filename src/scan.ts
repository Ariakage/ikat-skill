import { promises as fs } from "node:fs";
import path from "node:path";
import { listFiles } from "./git.js";
import {
  CONFIG_EXTS,
  CONFIG_NAME,
  DOCUMENT_EXTS,
  MEDIA_EXTS,
  PROSE_EXTS,
} from "./langs.js";
import type { ProbeInfo } from "./probe.js";

export type Role =
  | "entry"
  | "route"
  | "service"
  | "store"
  | "test"
  | "config"
  | "asset"
  | "document"
  | "generated"
  | "src";

export interface FileEntry {
  path: string;
  size: number;
  mtime: number;
  role: Role;
  lang: string | null;
  hash: string | null;
  oversized: boolean;
  /** raw module specifiers as written (needed to re-resolve on sync) */
  specs: string[];
  imports: string[];
  external: string[];
  exports: string[];
  doc: string | null;
  rank: number;
  /** probed metadata for binary/media/document files (M5) */
  media?: ProbeInfo;
  /** markitdown conversion state for convertible documents */
  conv?: "pending" | "converted" | "too-large" | "unavailable";
}

const DEFAULT_IGNORE = new Set([
  ".git",
  ".ikat",
  "node_modules",
  "dist",
  "build",
  "out",
  "target",
  ".venv",
  "venv",
  "__pycache__",
  "vendor",
  "coverage",
  ".next",
  ".nuxt",
  ".turbo",
  ".idea",
  ".vscode",
  ".cache",
  ".DS_Store",
]);

/** Repos larger than this are capped at inventory level. */
export const MAX_FILES = 200_000;
/** Files larger than this are hashed but not content-extracted. */
export const MAX_EXTRACT_BYTES = 1_000_000;
/** Files larger than this are not even hashed (still listed). */
export const MAX_HASH_BYTES = 256 * 1024 * 1024;

const TEST_PATH =
  /(^|\/)(__tests__|__mocks__|tests?|spec|e2e|fixtures?|testdata)(\/|$)|\.(test|spec|stories)\.[^./]+$|_test\.(go|rs)$|(^|\/)test_[^/]*$|conftest\.py$/i;
const GENERATED_PATH =
  /(\.gen\.|\.generated\.|_pb\.(go|py|js|ts)|\.pb\.(go|py|js|ts)|\.min\.|__generated__|\.designer\.[^./]+$|\.g\.[^./]+$)/i;
const ENTRY_PATH =
  /(^|\/)(main|index|cli|app|server|__main__|mod|lib)\.[^./]+$|^(cmd|bin|scripts?)\//i;
const ROUTE_PATH =
  /(^|\/)(routes?|router|endpoints?|controllers?|pages|views|handlers?)(\/|$)|(^|\/)(routes?|router|controllers?|handlers?|endpoints?)\.[^./]+$/i;
const SERVICE_PATH =
  /(^|\/)(services?|usecases?|api)(\/|$)|\.(service|usecase)s?\.[^./]+$|(^|\/)api\.[^./]+$/i;
const STORE_PATH =
  /(^|\/)(store|state|models?|db|database|data|repositories?|repos|entities|migrations?)(\/|$)|\.(model|entity|migration)s?\.[^./]+$/i;

/** Extensions markitdown can turn into Markdown. `.zip` (media-classified)
 * converts to a member listing, so it lives here rather than in
 * DOCUMENT_EXTS. */
export const CONVERT_EXTS = new Set([...DOCUMENT_EXTS, ".zip"]);

export function extOf(p: string): string {
  const m = /\.[^./\\]+$/.exec(p);
  return m ? m[0].toLowerCase() : "";
}

export function classify(p: string, opts: { hasLang: boolean }): Role {
  const ext = extOf(p);
  if (TEST_PATH.test(p)) return "test";
  if (GENERATED_PATH.test(p)) return "generated";
  if (MEDIA_EXTS.has(ext)) return "asset";
  if (DOCUMENT_EXTS.has(ext)) return "document";
  if (CONFIG_NAME.test(p) || CONFIG_EXTS.has(ext)) return "config";
  if (!opts.hasLang && PROSE_EXTS.has(ext)) return "document";
  const bn = p.slice(p.lastIndexOf("/") + 1);
  if (!opts.hasLang && bn.startsWith(".")) return "config"; // dotfile config (.gitignore, .npmrc)
  if (!opts.hasLang) return "asset"; // unknown extension, likely binary
  if (ENTRY_PATH.test(p)) return "entry";
  if (ROUTE_PATH.test(p)) return "route";
  if (SERVICE_PATH.test(p)) return "service";
  if (STORE_PATH.test(p)) return "store";
  return "src";
}

/** Inventory: git ls-files when inside a work tree, else a walk with
 * DEFAULT_IGNORE. Paths are repo-relative, forward slashes, sorted. */
export async function inventory(root: string): Promise<string[]> {
  const fromGit = listFiles(root);
  if (fromGit !== null) return fromGit.sort().slice(0, MAX_FILES);
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    let ents: import("node:fs").Dirent[];
    try {
      ents = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    ents.sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const ent of ents) {
      if (DEFAULT_IGNORE.has(ent.name)) continue;
      const abs = path.join(dir, ent.name);
      const rel = path.relative(root, abs).split(path.sep).join("/");
      if (ent.isDirectory()) {
        if (out.length >= MAX_FILES) return;
        await walk(abs);
      } else if (ent.isFile()) {
        out.push(rel);
        if (out.length >= MAX_FILES) return;
      }
    }
  }
  await walk(root);
  return out.sort();
}

/** First prose paragraph of a README, skipping badges/images/headers. */
export function readmePurpose(text: string): string | null {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (
      !line ||
      line.startsWith("#") ||
      line.startsWith("[!") ||
      line.startsWith("<") ||
      line.startsWith("!") ||
      /^[-=*>|`]/.test(line)
    )
      continue;
    const clean = line.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").trim();
    if (clean.length > 12) return clean.slice(0, 240);
  }
  return null;
}

/** Repo purpose line: manifest description, else README first paragraph. */
export async function detectPurpose(
  root: string,
  files: Set<string>,
): Promise<string | null> {
  const manifestCandidates = [
    { p: "package.json", key: "description" },
    { p: "pyproject.toml", key: "description" },
    { p: "Cargo.toml", key: "description" },
  ];
  for (const { p, key } of manifestCandidates) {
    if (!files.has(p)) continue;
    try {
      const text = await fs.readFile(path.join(root, p), "utf8");
      const m = new RegExp(`"${key}"\\s*:\\s*"([^"]{4,240})"`).exec(text);
      if (m) return m[1]!;
      const t = /^description\s*=\s*"([^"]{4,240})"/m.exec(text);
      if (t) return t[1]!;
    } catch {
      /* keep looking */
    }
  }
  for (const name of ["README.md", "README.mdx", "README.txt", "README"]) {
    if (!files.has(name)) continue;
    try {
      const text = await fs.readFile(path.join(root, name), "utf8");
      const purpose = readmePurpose(text);
      if (purpose) return purpose;
    } catch {
      /* keep looking */
    }
  }
  return null;
}
