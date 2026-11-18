import { promises as fs } from "node:fs";
import { type AuthoredEntry, entryState, tagString } from "./entries.js";
import type { FileEntry } from "./scan.js";
import { ikatPath, type RepoIndex, readMeta } from "./store.js";

const TREE_DEPTH = 3;
const TREE_CHILD_CAP = 12;
const TREE_LINE_CAP = 120;
const CORE_CAP = 25;
const SRC_INDEX_CAP = 40;
const LOW_VALUE = new Set(["test", "config", "generated", "asset", "document"]);

interface Dir {
  count: number;
  children: Map<string, Dir>;
  files: string[];
}

const kb = (n: number): string =>
  n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`;

function buildTree(paths: string[]): Dir {
  const root: Dir = { count: 0, children: new Map(), files: [] };
  for (const p of paths) {
    const parts = p.split("/");
    let node = root;
    root.count++;
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i]!;
      let child = node.children.get(seg);
      if (!child) {
        child = { count: 0, children: new Map(), files: [] };
        node.children.set(seg, child);
      }
      child.count++;
      node = child;
    }
    node.files.push(parts[parts.length - 1]!);
  }
  return root;
}

/** Directory skeleton: `name/ (total descendants)`, depth- and line-capped. */
export function renderTree(paths: string[]): string[] {
  const root = buildTree(paths);
  const lines: string[] = [];
  const render = (dir: Dir, prefix: string, depth: number): void => {
    const kids = [...dir.children.entries()].sort(
      (a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]),
    );
    let shown = 0;
    for (const [name, child] of kids) {
      if (lines.length >= TREE_LINE_CAP) break;
      if (shown >= TREE_CHILD_CAP) {
        lines.push(`${prefix}… +${kids.length - shown} dirs`);
        break;
      }
      lines.push(`${prefix}${name}/ (${child.count})`);
      shown++;
      if (depth + 1 < TREE_DEPTH) render(child, `${prefix}  `, depth + 1);
    }
  };
  render(root, "", 0);
  if (root.files.length) {
    const shown = root.files.slice(0, 10).join(", ");
    const more = root.files.length > 10 ? `, … +${root.files.length - 10}` : "";
    lines.push(`root files: ${shown}${more}`);
  }
  if (lines.length >= TREE_LINE_CAP)
    lines.push("… (tree truncated; see index.json for full inventory)");
  return lines;
}

const fmtImport = (f: FileEntry): string =>
  f.imports.length ? f.imports.join(", ") : "(none)";

const ENTRIES_CAP = 15;

/** Deterministic digest.md — the single orientation artifact. */
export function renderDigest(
  index: RepoIndex,
  entries: Map<string, AuthoredEntry> = new Map(),
): string {
  const { files, stats, repo } = index;
  const counts = stats.roles;
  const head = repo.head ? repo.head.slice(0, 8) : "no-git";
  const fieldOf = (f: FileEntry, key: "F" | "S"): string | null =>
    entries.get(f.path)?.fields[key] ?? null;
  const fOf = (f: FileEntry): string | null => fieldOf(f, "F") ?? f.doc;

  const core = files
    .filter((f) => f.lang && !LOW_VALUE.has(f.role))
    .sort((a, b) => b.rank - a.rank || a.path.localeCompare(b.path))
    .slice(0, CORE_CAP);

  const srcIndexed = files
    .filter(
      (f) =>
        f.lang &&
        !LOW_VALUE.has(f.role) &&
        (f.imports.length || f.external.length),
    )
    .sort((a, b) => b.rank - a.rank || a.path.localeCompare(b.path))
    .slice(0, SRC_INDEX_CAP)
    .sort((a, b) => a.path.localeCompare(b.path));

  const extracted = files.filter(
    (f) => (f.lang || f.role === "document") && !f.oversized,
  ).length;
  const oversized = files.filter((f) => f.oversized).length;
  const externals = new Set(files.flatMap((f) => f.external)).size;

  const entryRows = files
    .filter((f) => entries.has(f.path))
    .sort((a, b) => b.rank - a.rank || a.path.localeCompare(b.path))
    .slice(0, ENTRIES_CAP)
    .map((f) => {
      const e = entries.get(f.path)!;
      const stale = entryState(e, index) === "stale" ? " ⚠stale" : "";
      const parts = (["F", "R", "A", "S"] as const)
        .filter((k) => e.fields[k])
        .map((k) => `${k}:${e.fields[k]}`)
        .join(" | ");
      return `- \`${f.path}\` [${tagString(e.tag)}]${stale} — ${parts}`;
    });
  const freshEntries = [...entries.values()].filter(
    (e) => entryState(e, index) === "fresh",
  ).length;
  const entriesLine =
    entries.size > 0
      ? `- entries: ${freshEntries} fresh / ${entries.size} total (${Math.round((freshEntries / entries.size) * 100)}%)`
      : "- entries: none yet (`ikat enrich` for the queue)";

  const probed = files.filter((f) => f.media);
  const tools = [...new Set(probed.map((f) => f.media!.tool))].sort();
  const convPending = files.filter((f) => f.conv === "pending").length;
  const convDone = files.filter((f) => f.conv === "converted").length;
  const convParts = [
    convDone ? `${convDone} converted` : null,
    convPending ? `${convPending} pending` : null,
  ].filter(Boolean);
  const mediaLine =
    probed.length || convParts.length
      ? `- media: ${probed.length} probed${tools.length ? ` (${tools.join("+")})` : ""}${convParts.length ? ` · docs: ${convParts.join(", ")}` : ""}`
      : null;

  const roleSummary = [
    [
      "source",
      (counts.src ?? 0) +
        (counts.entry ?? 0) +
        (counts.route ?? 0) +
        (counts.service ?? 0) +
        (counts.store ?? 0),
    ],
    ["test", counts.test ?? 0],
    ["config", counts.config ?? 0],
    ["asset", counts.asset ?? 0],
    ["document", counts.document ?? 0],
    ["generated", counts.generated ?? 0],
  ]
    .filter(([, n]) => (n as number) > 0)
    .map(([k, n]) => `${k} ${n}`)
    .join(" · ");

  const body = [
    "## Tree",
    ...renderTree(files.map((f) => f.path)),
    "",
    "## Core",
    ...(core.length
      ? core.map((f) => {
          const fText = fOf(f);
          return `- \`${f.path}\` (${f.role} · ${kb(f.size)})${fText ? ` — ${fText}` : ""}`;
        })
      : ["- (no source files detected)"]),
    "",
    ...(entryRows.length ? ["## Entries", ...entryRows, ""] : []),
    "## Source index",
    ...(srcIndexed.length
      ? srcIndexed.map(
          (f) =>
            `- \`${f.path}\` → ${fmtImport(f)}${f.external.length ? `  ·ext: ${f.external.slice(0, 6).join(", ")}` : ""}`,
        )
      : ["- (no import edges detected)"]),
    "",
    "## Coverage",
    `- indexed ${stats.files} files (${roleSummary})`,
    `- extracted ${extracted} files (imports/exports/doc)${oversized ? ` · skipped ${oversized} oversized` : ""}`,
    `- ${stats.edges} internal edges · ${externals} external packages`,
    entriesLine,
    ...(mediaLine ? [mediaLine] : []),
    `- limits: content ≤1 MB/file · tree depth ≤${TREE_DEPTH} · langs: ${Object.keys(stats.langs).sort().join(", ") || "none"}`,
  ];

  const header = [
    `# ${repo.name}${repo.purpose ? ` — ${repo.purpose}` : ""}`,
    "",
    `index: ${head} · files ${stats.files} · edges ${stats.edges} · generated ${index.generatedAt}`,
  ];

  const draft = `${header.join("\n")}\n\n${body.join("\n")}\n`;
  const tokens = Math.ceil(draft.length / 4);
  return `${header.join("\n")} · ≈${tokens} tokens\n\n${body.join("\n")}\n`;
}

/** Re-render digest.md after authored data (entries) changed without a
 * full sync — the index itself is untouched. */
export async function rewriteDigest(
  root: string,
  index: RepoIndex,
  entries: Map<string, AuthoredEntry>,
): Promise<void> {
  const digest = renderDigest(index, entries);
  await fs.writeFile(ikatPath(root, "digest.md"), digest);
  const meta = await readMeta(root);
  if (meta) {
    meta.digestBytes = Buffer.byteLength(digest);
    await fs.writeFile(
      ikatPath(root, "meta.json"),
      `${JSON.stringify(meta, null, 2)}\n`,
    );
  }
}
