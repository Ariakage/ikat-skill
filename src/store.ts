import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { FileEntry } from "./scan.js";

export const VERSION = "0.2.0";
export const FORMAT = 1;
export const IKAT_DIR = ".ikat";

export interface RepoMeta {
  format: number;
  tool: string;
  toolVersion: string;
  generatedAt: string;
  head: string | null;
  counts: Record<string, number>;
  digestBytes: number;
  diagramBytes?: number;
  /** probe tools on PATH at index time (ffprobe/pdfinfo/exiftool/…) */
  probe?: string[];
  exclude: "info/exclude" | "tracked" | "none";
}

export interface RepoIndex {
  format: number;
  tool: string;
  toolVersion: string;
  generatedAt: string;
  repo: {
    name: string;
    root: string;
    head: string | null;
    purpose: string | null;
  };
  stats: {
    files: number;
    edges: number;
    langs: Record<string, number>;
    roles: Record<string, number>;
  };
  files: FileEntry[];
}

export async function hashFile(abs: string): Promise<string> {
  const h = createHash("sha1");
  const buf = await fs.readFile(abs);
  h.update(buf);
  return h.digest("hex").slice(0, 12);
}

export const ikatPath = (root: string, name: string): string =>
  path.join(root, IKAT_DIR, name);

export async function writeArtifacts(
  root: string,
  index: RepoIndex,
  digest: string,
  meta: RepoMeta,
): Promise<void> {
  const dir = path.join(root, IKAT_DIR);
  await fs.mkdir(path.join(dir, "converted"), { recursive: true });
  await fs.writeFile(
    path.join(dir, "index.json"),
    `${JSON.stringify(index, null, 2)}\n`,
  );
  await fs.writeFile(path.join(dir, "digest.md"), digest);
  await fs.writeFile(
    path.join(dir, "meta.json"),
    `${JSON.stringify(meta, null, 2)}\n`,
  );
}

export async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

export const readMeta = (root: string): Promise<RepoMeta | null> =>
  readJson<RepoMeta>(ikatPath(root, "meta.json"));

export const readIndex = (root: string): Promise<RepoIndex | null> =>
  readJson<RepoIndex>(ikatPath(root, "index.json"));

export async function writeIndex(
  root: string,
  index: RepoIndex,
): Promise<void> {
  await fs.writeFile(
    ikatPath(root, "index.json"),
    `${JSON.stringify(index, null, 2)}\n`,
  );
}
