import { describe, expect, it } from "vitest";
import {
  type AuthoredEntry,
  autoTag,
  entryLine,
  entryState,
  parseEntryLine,
  tagString,
  validateEntry,
} from "../src/entries.js";
import type { FileEntry } from "../src/scan.js";

const file = (p: string, over: Partial<FileEntry> = {}): FileEntry => ({
  path: p,
  size: 2000,
  mtime: 0,
  role: "src",
  lang: "ts",
  hash: "abc123",
  oversized: false,
  specs: [],
  imports: [],
  external: [],
  exports: [],
  doc: null,
  rank: 5,
  ...over,
});
const index = {
  files: [
    file("src/a.ts", { rank: 9 }),
    file("src/b.ts", { rank: 3 }),
    file("docs/x.md", { role: "document", lang: null }),
  ],
};

describe("parseEntryLine", () => {
  it("parses a full line", () => {
    const { entry, error } = parseEntryLine(
      "src/a.ts[C7M]: F:does a | R:src/b.ts | S:never on fridays @deadbeef",
    );
    expect(error).toBeNull();
    expect(entry!.path).toBe("src/a.ts");
    expect(entry!.tag).toEqual({ layer: "C", importance: 7, size: "M" });
    expect(entry!.fields.F).toBe("does a");
    expect(entry!.fields.R).toBe("src/b.ts");
    expect(entry!.fields.S).toBe("never on fridays");
    expect(entry!.hash).toBe("deadbeef");
  });
  it("parses tagless lines", () => {
    const { entry } = parseEntryLine("src/a.ts: S:just s");
    expect(entry!.tag.layer).toBe("?");
    expect(entry!.fields.S).toBe("just s");
  });
  it("rejects out-of-order fields", () => {
    expect(parseEntryLine("a: S:x | F:y").error).toContain("out of order");
  });
  it("rejects bad field segments", () => {
    expect(parseEntryLine("a: X:x").error).toContain("bad field");
  });
  it("skips comments and blanks", () => {
    expect(parseEntryLine("# header").entry).toBeNull();
    expect(parseEntryLine("").entry).toBeNull();
  });
});

describe("validateEntry", () => {
  const parsed = (s: string) => parseEntryLine(s).entry!;
  it("accepts a valid entry and auto-tags", () => {
    const { ok, errors } = validateEntry(parsed("src/a.ts: S:c"), index);
    expect(errors).toEqual([]);
    expect(tagString(ok!.tag)).toBe("C9S"); // src→C, rank 9→top importance, 2KB→S
  });
  it("rejects unknown paths and R targets", () => {
    const { errors } = validateEntry(
      parsed("nope.ts[C1S]: R:src/missing.ts"),
      index,
    );
    expect(errors.join(";")).toContain("not in index");
    expect(errors.join(";")).toContain("R target not in index");
  });
  it("enforces field budgets", () => {
    const { errors } = validateEntry(
      parsed(`src/a.ts: F:${"x".repeat(200)}`),
      index,
    );
    expect(errors.join()).toContain("F exceeds");
  });
  it("accepts R globs without existence checks", () => {
    const { ok, errors } = validateEntry(
      parsed("src/a.ts: R:src/*,gone.ts"),
      index,
    );
    // glob skipped, but literal targets still validated
    expect(errors.join()).toContain("gone.ts");
    expect(errors.join()).not.toContain("src/*");
    expect(ok).toBeNull();
  });
});

describe("state + serialize", () => {
  const entry: AuthoredEntry = {
    path: "src/a.ts",
    tag: { layer: "C", importance: 8, size: "S" },
    fields: { F: "f", S: "s" },
    hash: "abc123",
  };
  it("entryState detects fresh/stale/orphan", () => {
    expect(entryState(entry, index)).toBe("fresh");
    expect(entryState({ ...entry, hash: "old" }, index)).toBe("stale");
    expect(entryState({ ...entry, path: "gone.ts" }, index)).toBe("orphan");
  });
  it("round-trips through entryLine", () => {
    const line = entryLine(entry);
    const { entry: back } = parseEntryLine(line);
    expect(back).toEqual(entry);
  });
});

describe("autoTag", () => {
  it("maps roles to layers", () => {
    expect(autoTag(file("a.ts", { role: "entry" }), index.files).layer).toBe(
      "E",
    );
    expect(autoTag(file("a.ts", { role: "test" }), index.files).layer).toBe(
      "T",
    );
    expect(
      autoTag(file("a.md", { role: "document", lang: null }), index.files)
        .layer,
    ).toBe("D");
  });
});
