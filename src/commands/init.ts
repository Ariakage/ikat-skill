import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { renderDigest } from "../digest.js";
import {
  buildResolveCtx,
  extractDoc,
  extractExports,
  extractImportSpecs,
  resolveSpec,
} from "../extract.js";
import { headSha, topLevel } from "../git.js";
import { langFor, PROSE_EXTS } from "../langs.js";
import { applyMarker, ensureExclude, gitDir } from "../marker.js";
import { computeRanks } from "../rank.js";
import {
  classify,
  detectPurpose,
  extOf,
  type FileEntry,
  inventory,
  MAX_EXTRACT_BYTES,
  MAX_HASH_BYTES,
} from "../scan.js";
import { FORMAT, type RepoIndex, VERSION, writeArtifacts } from "../store.js";

export interface InitOptions {
  path: string;
  tracked: boolean;
  marker: boolean;
  quiet: boolean;
}

const SHA_TAIL = 12;

async function buildEntry(
  root: string,
  rel: string,
): Promise<FileEntry | null> {
  const abs = path.join(root, rel);
  let st: Awaited<ReturnType<typeof fs.stat>>;
  try {
    st = await fs.stat(abs);
  } catch {
    return null; // listed but vanished
  }
  if (!st.isFile()) return null;
  const lang = langFor(rel);
  const role = classify(rel, { hasLang: !!lang });
  const entry: FileEntry = {
    path: rel,
    size: st.size,
    role,
    lang: lang?.name ?? null,
    hash: null,
    oversized: st.size > MAX_EXTRACT_BYTES,
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
          (entry as { _specs?: string[] })._specs = extractImportSpecs(
            text,
            lang,
          );
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
  return entry;
}

export async function runInit(opts: InitOptions): Promise<number> {
  const abs = path.resolve(opts.path);
  const tl = topLevel(abs);
  const root = tl ?? abs;
  const log = (s: string) => {
    if (!opts.quiet) process.stdout.write(`${s}\n`);
  };

  const paths = (await inventory(root)).filter((p) => !p.startsWith(".ikat/"));
  if (!paths.length) {
    process.stderr.write(`ikat: no files found at ${root}\n`);
    return 1;
  }

  const entries: FileEntry[] = [];
  for (const p of paths) {
    const e = await buildEntry(root, p);
    if (e) entries.push(e);
  }

  // resolve raw specifiers → internal paths / external names
  const ctx = buildResolveCtx(entries.map((e) => e.path));
  for (const e of entries) {
    const specs = (e as { _specs?: string[] })._specs ?? [];
    delete (e as { _specs?: string[] })._specs;
    const dir = e.path.includes("/")
      ? e.path.slice(0, e.path.lastIndexOf("/"))
      : "";
    for (const spec of specs) {
      const r = resolveSpec(e.lang ?? "", spec, dir, ctx);
      if (r && "internal" in r) e.imports.push(r.internal);
      else if (r && "external" in r) e.external.push(r.external);
    }
    e.imports = [...new Set(e.imports)].sort();
    e.external = [...new Set(e.external)].sort();
  }

  computeRanks(entries);

  const stats = {
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

  const index: RepoIndex = {
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
    stats,
    files: entries,
  };

  const digest = renderDigest(index);
  const gd = await gitDir(root);
  const tracked = opts.tracked || !gd;
  let excludeStatus: "added" | "present" | "tracked" | "none" = "none";
  if (tracked) excludeStatus = "tracked";
  else if (gd) excludeStatus = await ensureExclude(gd);

  await writeArtifacts(root, index, digest, {
    format: FORMAT,
    tool: "ikat",
    toolVersion: VERSION,
    generatedAt: index.generatedAt,
    head: index.repo.head,
    counts: stats.roles,
    digestBytes: Buffer.byteLength(digest),
    exclude: excludeStatus === "tracked" ? "tracked" : "info/exclude",
  });

  let markerStatus = "skipped";
  if (opts.marker) markerStatus = await applyMarker(root);

  const src =
    (stats.roles.src ?? 0) +
    (stats.roles.entry ?? 0) +
    (stats.roles.route ?? 0) +
    (stats.roles.service ?? 0) +
    (stats.roles.store ?? 0);
  log(`ikat ${VERSION} · ${root}`);
  log(
    `files  · ${stats.files} (source ${src} · test ${stats.roles.test ?? 0} · config ${stats.roles.config ?? 0} · asset ${stats.roles.asset ?? 0} · document ${stats.roles.document ?? 0} · generated ${stats.roles.generated ?? 0})`,
  );
  log(
    `edges  · ${stats.edges} internal · ${new Set(entries.flatMap((e) => e.external)).size} external`,
  );
  log(
    `digest · .ikat/digest.md (${(Buffer.byteLength(digest) / 1024).toFixed(1)} KB)`,
  );
  log(`marker · ${markerStatus}${opts.marker ? "" : " (--no-marker)"}`);
  log(
    `ignore · ${excludeStatus === "tracked" ? "tracked (commit .ikat/ to share)" : `.git/info/exclude ${excludeStatus}`}`,
  );
  return 0;
}
