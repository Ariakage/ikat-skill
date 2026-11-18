import { describe, expect, it } from "vitest";
import { renderTree } from "../src/digest.js";
import { langFor } from "../src/langs.js";
import { classify, readmePurpose } from "../src/scan.js";

describe("classify", () => {
  it.each([
    ["src/a.ts", "src"],
    ["src/main.ts", "entry"],
    ["cmd/server/main.go", "entry"],
    ["src/api/routes.ts", "route"],
    ["app/services/user.py", "service"],
    ["src/models/user.ts", "store"],
    ["src/a.test.ts", "test"],
    ["tests/test_app.py", "test"],
    ["foo_test.go", "test"],
    ["package.json", "config"],
    [".github/workflows/ci.yml", "config"],
    ["video/intro.mp4", "asset"],
    ["docs/spec.pdf", "document"],
    ["README.md", "document"],
    ["dist/bundle.min.js", "generated"],
    ["schema.pb.go", "generated"],
    [".gitignore", "config"],
    ["tsup.config.ts", "config"],
  ])("%s → %s", (p, role) => {
    expect(
      classify(p, {
        hasLang: !!langFor(p),
      }),
    ).toBe(role);
  });
});

describe("readmePurpose", () => {
  it("skips badges and headers for first prose line", () => {
    const md =
      "# Project\n\n[![CI](x)](y) ![img](z)\n\nDoes something useful for agents.\n";
    expect(readmePurpose(md)).toBe("Does something useful for agents.");
  });
  it("returns null for header-only files", () => {
    expect(readmePurpose("# A\n# B\n")).toBeNull();
  });
});

describe("renderTree", () => {
  it("renders depth-capped directory counts", () => {
    const paths = [
      "a/b/c/d/f1.ts",
      "a/b/c/d/f2.ts",
      "a/x.ts",
      "r1.md",
      "r2.md",
    ];
    const lines = renderTree(paths);
    expect(lines[0]).toBe("a/ (3)");
    expect(lines).toContain("  b/ (2)");
    expect(lines).toContain("    c/ (2)");
    // depth 3 reached: d/ folded into c/ count
    expect(lines.some((l) => l.includes("d/"))).toBe(false);
    expect(lines.at(-1)).toBe("root files: r1.md, r2.md");
  });
  it("caps children per directory", () => {
    const paths = Array.from(
      { length: 20 },
      (_, i) => `d${String(i).padStart(2, "0")}/f.ts`,
    );
    const lines = renderTree(paths);
    expect(lines.filter((l) => l.endsWith(")"))).toHaveLength(12);
    expect(lines.some((l) => l.includes("+8 dirs"))).toBe(true);
  });
});
