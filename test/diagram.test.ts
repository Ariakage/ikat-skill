import { describe, expect, it } from "vitest";
import { renderDiagram } from "../src/diagram.js";
import type { AuthoredEntry } from "../src/entries.js";
import type { FileEntry } from "../src/scan.js";
import type { RepoIndex } from "../src/store.js";

const fe = (over: Partial<FileEntry>): FileEntry => ({
  path: "x.ts",
  size: 100,
  mtime: 0,
  role: "src",
  lang: "typescript",
  hash: "aaaa1111bbbb",
  oversized: false,
  specs: [],
  imports: [],
  external: [],
  exports: [],
  doc: null,
  rank: 99,
  ...over,
});

const idx = (files: FileEntry[]): RepoIndex => ({
  format: 1,
  tool: "ikat",
  toolVersion: "0.1.0",
  generatedAt: "t",
  repo: { name: "r", root: "/r", head: null, purpose: null },
  stats: { files: files.length, edges: 0, langs: {}, roles: {} },
  files,
});

const ent = (path: string, hash: string, F?: string): AuthoredEntry => ({
  path,
  tag: { layer: "C", importance: 5, size: "S" },
  fields: F ? { F } : {},
  hash,
});

describe("renderDiagram", () => {
  it("clusters by directory and emits real import edges", () => {
    const files = [
      fe({ path: "src/a.ts", imports: ["src/lib/b.ts"], rank: 1 }),
      fe({ path: "src/lib/b.ts", rank: 2 }),
      fe({ path: "src/lib/c.ts", rank: 3, doc: "Helpers" }),
    ];
    const { mmd, nodes, edges, clusters } = renderDiagram(
      idx(files),
      new Map(),
    );
    expect(nodes).toBe(3);
    expect(edges).toBe(1);
    expect(clusters).toBe(2); // src + src/lib
    expect(mmd).toContain("flowchart LR");
    expect(mmd).toContain('subgraph n_src_lib["src/lib/"]');
    expect(mmd).toContain("n_src_a_ts --> n_src_lib_b_ts");
    expect(mmd).toContain("Helpers");
  });

  it("only draws edges between shown nodes", () => {
    const files = [
      fe({ path: "a.ts", imports: ["gone.ts"], rank: 1 }),
      fe({
        path: "t.test.ts",
        role: "test",
        rank: 2,
        imports: ["a.ts"],
      }),
    ];
    const { mmd, nodes, edges } = renderDiagram(idx(files), new Map());
    expect(nodes).toBe(1);
    expect(edges).toBe(0);
    expect(mmd).not.toContain("-->");
    expect(mmd).not.toContain("test.ts");
  });

  it("prefers fresh entry F over doc, ignores stale entries", () => {
    const files = [
      fe({ path: "a.ts", hash: "h1", doc: "Doc label", rank: 1 }),
      fe({ path: "b.ts", hash: "h2", doc: "Doc b", rank: 2 }),
    ];
    const entries = new Map([
      ["a.ts", ent("a.ts", "h1", "Entry label")],
      ["b.ts", ent("b.ts", "DIFFERENT", "Stale label")],
    ]);
    const { mmd } = renderDiagram(idx(files), entries);
    expect(mmd).toContain("Entry label");
    expect(mmd).toContain("Doc b"); // stale F ignored → falls back to doc
    expect(mmd).not.toContain("Stale label");
  });

  it("leaves root files unclustered and escapes label specials", () => {
    const files = [fe({ path: "main.ts", doc: 'Run "the" (thing)', rank: 1 })];
    const { mmd, clusters } = renderDiagram(idx(files), new Map());
    expect(clusters).toBe(0);
    expect(mmd).not.toContain("subgraph");
    expect(mmd).toContain('n_main_ts["main.ts<br/>Run the thing"]');
  });

  it("caps nodes at 24 by rank", () => {
    const files = Array.from({ length: 30 }, (_, i) =>
      fe({ path: `src/f${String(i).padStart(2, "0")}.ts`, rank: i + 1 }),
    );
    const { nodes } = renderDiagram(idx(files), new Map());
    expect(nodes).toBe(24);
  });
});
