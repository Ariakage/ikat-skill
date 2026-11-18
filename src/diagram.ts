import path from "node:path";
import { type AuthoredEntry, entryState } from "./entries.js";
import type { FileEntry } from "./scan.js";
import type { RepoIndex } from "./store.js";

/** Roles that carry architecture meaning; tests/config/assets/docs are
 * machinery and stay out of the baseline diagram. */
const NODE_ROLES = new Set(["entry", "route", "service", "store", "src"]);

const MAX_NODES = 24;
const LABEL_MAX = 44;

const mmdId = (p: string): string => `n_${p.replace(/[^a-zA-Z0-9]/g, "_")}`;

const esc = (s: string): string =>
  s
    .replace(/["[\]{}()<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const label = (
  f: FileEntry,
  index: RepoIndex,
  entries: Map<string, AuthoredEntry>,
): string => {
  const e = entries.get(f.path);
  const authored = e && entryState(e, index) === "fresh" ? e.fields.F : null;
  const base = authored ?? f.doc ?? path.posix.basename(f.path);
  return base.length > LABEL_MAX ? `${base.slice(0, LABEL_MAX - 1)}…` : base;
};

const clusterOf = (p: string): string | null => {
  const dir = path.posix.dirname(p);
  return dir === "." ? null : dir;
};

/** Render the deterministic "ugly but never wrong" baseline: ranked modules
 * clustered by directory, labels F > doc > filename, edges = resolved
 * imports between shown nodes only (caller owns the edge). */
export function renderDiagram(
  index: RepoIndex,
  entries: Map<string, AuthoredEntry>,
): { mmd: string; nodes: number; edges: number; clusters: number } {
  const shown = index.files
    .filter((f) => NODE_ROLES.has(f.role))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, MAX_NODES);
  const shownSet = new Set(shown.map((f) => f.path));

  const clusters = new Map<string, FileEntry[]>();
  const loose: FileEntry[] = [];
  for (const f of shown) {
    const c = clusterOf(f.path);
    if (c === null) loose.push(f);
    else {
      const list = clusters.get(c) ?? [];
      list.push(f);
      clusters.set(c, list);
    }
  }

  const nodeLine = (f: FileEntry, indent: string): string => {
    const lbl = esc(label(f, index, entries));
    const p = f.path.replace(/["`\\]/g, "");
    return `${indent}${mmdId(f.path)}["${p}<br/>${lbl}"]`;
  };

  const lines: string[] = [
    `%% ikat diagram draft — ${index.repo.name}`,
    `%% deterministic baseline: edit labels/edges, keep evidence`,
    `%% regenerate: ikat diagram --draft`,
    `flowchart LR`,
  ];

  for (const [dir, files] of [...clusters.entries()].sort()) {
    lines.push(`  subgraph ${mmdId(dir)}["${esc(dir)}/"]`);
    for (const f of files) lines.push(nodeLine(f, "    "));
    lines.push("  end");
  }
  for (const f of loose) lines.push(nodeLine(f, "  "));

  const edges: Array<[string, string]> = [];
  const seen = new Set<string>();
  for (const f of shown) {
    for (const to of f.imports) {
      if (!shownSet.has(to)) continue;
      const key = `${f.path}${to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([f.path, to]);
    }
  }
  for (const [from, to] of edges.sort()) {
    lines.push(`  ${mmdId(from)} --> ${mmdId(to)}`);
  }

  return {
    mmd: `${lines.join("\n")}\n`,
    nodes: shown.length,
    edges: edges.length,
    clusters: clusters.size,
  };
}
