import type { FileEntry } from "./scan.js";
import type { RepoIndex } from "./store.js";

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
  f.imports.length ? f.imports.join(", ") : "·";

/** Deterministic digest.md — the single orientation artifact. */
export function renderDigest(index: RepoIndex): string {
  const { files, stats, repo } = index;
  const counts = stats.roles;
  const head = repo.head ? repo.head.slice(0, 8) : "no-git";

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
      ? core.map(
          (f) =>
            `- \`${f.path}\` (${f.role} · ${kb(f.size)})${f.doc ? ` — ${f.doc}` : ""}`,
        )
      : ["- (no source files detected)"]),
    "",
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
    `- limits: content ≤1 MB/file · tree depth ≤${TREE_DEPTH} · langs: ${Object.keys(stats.langs).sort().join(", ") || "none"}`,
    `- L1 entries: none yet (run \`ikat put\` to add; planned M3)`,
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
