import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  augmentResolveCtx,
  buildResolveCtx,
  extractDoc,
  extractExports,
  extractImportSpecs,
  resolveSpec,
} from "./extract.js";
import { headSha } from "./git.js";
import { langFor, PROSE_EXTS } from "./langs.js";
import { type ProbeBatch, probeFile } from "./probe.js";
import {
  CONVERT_EXTS,
  classify,
  detectPurpose,
  extOf,
  type FileEntry,
  MAX_EXTRACT_BYTES,
  MAX_HASH_BYTES,
} from "./scan.js";
import { FORMAT, type RepoIndex, VERSION } from "./store.js";

const SHA_TAIL = 12;

/** Bounded-concurrency map preserving input order — deterministic index
 * output even though entries build in parallel. */
export async function mapPool<T, R>(
  items: T[],
  n: number,
  fn: (t: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      for (;;) {
        const j = i++;
        if (j >= items.length) break;
        out[j] = await fn(items[j]!);
      }
    }),
  );
  return out;
}

/** Stat, classify, hash and extract one repo file. Returns null when the
 * path vanished between listing and stat. */
export async function buildEntry(
  root: string,
  rel: string,
  repoFiles?: Set<string>,
  probeBatch?: ProbeBatch,
): Promise<FileEntry | null> {
  const abs = path.join(root, rel);
  let st: Awaited<ReturnType<typeof fs.stat>>;
  try {
    st = await fs.stat(abs);
  } catch {
    return null;
  }
  if (!st.isFile()) return null;
  const lang = langFor(rel);
  const role = classify(rel, { hasLang: !!lang });
  const entry: FileEntry = {
    path: rel,
    size: st.size,
    mtime: Math.round(st.mtimeMs),
    role,
    lang: lang?.name ?? null,
    hash: null,
    oversized: st.size > MAX_EXTRACT_BYTES,
    specs: [],
    imports: [],
    external: [],
    exports: [],
    doc: null,
    rank: 0,
  };
  if (st.size > MAX_HASH_BYTES) return entry;
  const extractable =
    !entry.oversized &&
    (lang !== null || (role === "document" && PROSE_EXTS.has(extOf(rel))));
  try {
    if (extractable) {
      const buf = await fs.readFile(abs);
      if (buf.includes(0)) {
        entry.oversized = true; // binary masquerading as text; hashed only
      } else {
        entry.hash = createHash("sha1")
          .update(buf)
          .digest("hex")
          .slice(0, SHA_TAIL);
        const text = buf.toString("utf8");
        if (lang) {
          entry.doc = extractDoc(text, lang.doc ?? "slash");
          entry.exports = extractExports(text, lang);
          entry.specs = extractImportSpecs(text, lang);
        } else {
          entry.doc = extractDoc(text, "prose");
        }
      }
    } else {
      entry.hash = createHash("sha1")
        .update(await fs.readFile(abs))
        .digest("hex")
        .slice(0, SHA_TAIL);
    }
  } catch {
    /* unreadable file: keep inventory row without hash */
  }
  // binaries/documents: probe metadata; convertible docs get conv state
  const probed =
    role === "asset" || (role === "document" && !PROSE_EXTS.has(extOf(rel)));
  if (probed && st.size <= MAX_HASH_BYTES) {
    try {
      entry.media = await probeFile(
        abs,
        rel,
        repoFiles ?? new Set(),
        probeBatch,
      );
    } catch {
      /* probe is best-effort */
    }
  }
  if (CONVERT_EXTS.has(extOf(rel))) entry.conv = "pending";
  return entry;
}

/** Re-resolve every entry's raw specifiers against the current file set.
 * Edges depend on the whole inventory, so this must run on all entries —
 * including reused ones — on every init/sync. */
export async function resolveAllEdges(
  root: string,
  entries: FileEntry[],
  onItem?: () => void,
): Promise<void> {
  const ctx = buildResolveCtx(entries.map((e) => e.path));
  await augmentResolveCtx(root, ctx);
  for (const e of entries) {
    onItem?.();
    const dir = e.path.includes("/")
      ? e.path.slice(0, e.path.lastIndexOf("/"))
      : "";
    const imports = new Set<string>();
    const external = new Set<string>();
    for (const spec of e.specs) {
      const r = resolveSpec(e.lang ?? "", spec, dir, ctx, e.path);
      if (r && "internal" in r) imports.add(r.internal);
      else if (r && "external" in r) external.add(r.external);
    }
    e.imports = [...imports].sort();
    e.external = [...external].sort();
  }
}

export function buildStats(entries: FileEntry[]): RepoIndex["stats"] {
  return {
    files: entries.length,
    edges: entries.reduce((n, e) => n + e.imports.length, 0),
    langs: Object.fromEntries(
      [
        ...entries.reduce((m, e) => {
          if (e.lang) m.set(e.lang, (m.get(e.lang) ?? 0) + 1);
          return m;
        }, new Map<string, number>()),
      ].sort(),
    ),
    roles: Object.fromEntries(
      [
        ...entries.reduce(
          (m, e) => m.set(e.role, (m.get(e.role) ?? 0) + 1),
          new Map<string, number>(),
        ),
      ].sort(),
    ),
  };
}

export async function buildIndex(
  root: string,
  entries: FileEntry[],
  paths: string[],
): Promise<RepoIndex> {
  return {
    format: FORMAT,
    tool: "ikat",
    toolVersion: VERSION,
    generatedAt: new Date().toISOString(),
    repo: {
      name: path.basename(root),
      root,
      head: headSha(root),
      purpose: await detectPurpose(root, new Set(paths)),
    },
    stats: buildStats(entries),
    files: entries,
  };
}
