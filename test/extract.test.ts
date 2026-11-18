import { describe, expect, it } from "vitest";
import {
  buildResolveCtx,
  extractDoc,
  extractExports,
  extractImportSpecs,
  norm,
  resolveSpec,
} from "../src/extract.js";
import { langFor } from "../src/langs.js";

const ts = langFor("a.ts")!;
const py = langFor("a.py")!;
const go = langFor("a.go")!;
const rs = langFor("a.rs")!;

describe("extractDoc", () => {
  it("reads jsdoc blocks", () => {
    const doc = extractDoc(
      "/**\n * Init command.\n *\n * More detail.\n */\nimport x;\n",
      "slash",
    );
    expect(doc).toBe("Init command.");
  });
  it("reads line comments", () => {
    const doc = extractDoc(
      "// Package main does things.\n// second line\n\npackage main\n",
      "slash",
    );
    expect(doc).toBe("Package main does things. second line");
  });
  it("reads python docstrings", () => {
    const doc = extractDoc(
      '#!/usr/bin/env python\n"""Module purpose.\n\nDetails."""\nimport os\n',
      "docstring",
    );
    expect(doc).toBe("Module purpose.");
  });
  it("reads hash headers", () => {
    expect(extractDoc("#!/bin/sh\n# Deploy helper.\nset -e\n", "hash")).toBe(
      "Deploy helper.",
    );
  });
  it("reads prose first paragraph", () => {
    expect(
      extractDoc(
        "# Title\n\n[![b](x)]()\n\nReal intro text here.\n\n## Next\n",
        "prose",
      ),
    ).toBe("Real intro text here.");
  });
});

describe("import specs", () => {
  it("extracts ts/js specifiers", () => {
    const specs = extractImportSpecs(
      `import a from "./a";
import { b } from '../lib/b';
export * from "./c";
const d = require("pkg");
const e = await import("./e");
`,
      ts,
    );
    expect(specs.sort()).toEqual(["../lib/b", "./a", "./c", "./e", "pkg"]);
  });
  it("extracts go block imports", () => {
    const specs = extractImportSpecs(
      `import "fmt"
import (
  "os"
  "example.com/m/pkg"
)
`,
      go,
    );
    expect(specs.sort()).toEqual(["example.com/m/pkg", "fmt", "os"]);
  });
  it("extracts python imports", () => {
    const specs = extractImportSpecs(
      "import os\nfrom .utils import x\nfrom pkg.sub import y\n",
      py,
    );
    expect(specs.sort()).toEqual([".utils", "os", "pkg.sub"]);
  });
  it("extracts rust use/mod", () => {
    const specs = extractImportSpecs(
      "use crate::core::x;\nmod helper;\nuse std::io;\n",
      rs,
    );
    expect(specs.sort()).toEqual(["crate::core::x", "helper", "std::io"]);
  });
});

describe("exports", () => {
  it("captures named and list exports", () => {
    const names = extractExports(
      `export function foo() {}
export const bar = 1;
export default class Baz {}
export { a, b as c };
`,
      ts,
    );
    expect(names.sort()).toEqual(["Baz", "a", "bar", "c", "foo"]);
  });
  it("captures exported go identifiers only", () => {
    const names = extractExports(
      "func private() {}\nfunc Public() {}\ntype Thing struct{}\nvar local = 1\n",
      go,
    );
    expect(names.sort()).toEqual(["Public", "Thing"]);
  });
});

describe("norm", () => {
  it("normalizes dot segments", () => {
    expect(norm("a/./b/../c")).toBe("a/c");
    expect(norm("./x")).toBe("x");
    expect(norm("a/../../b")).toBe("b");
  });
});

describe("resolveSpec", () => {
  const ctx = buildResolveCtx([
    "src/a.ts",
    "src/lib/b.ts",
    "src/lib/index.ts",
    "pkg/utils.py",
    "pkg/__init__.py",
    "src/foo.rs",
    "src/helper/mod.rs",
    "include/net/socket.h",
  ]);

  it("resolves relative ts imports", () => {
    expect(resolveSpec("ts", "./lib/b", "src", ctx)).toEqual({
      internal: "src/lib/b.ts",
    });
    expect(resolveSpec("ts", "./lib", "src", ctx)).toEqual({
      internal: "src/lib/index.ts",
    });
  });
  it("marks bare specifiers external", () => {
    expect(resolveSpec("ts", "react", "src", ctx)).toEqual({
      external: "react",
    });
    expect(resolveSpec("ts", "@scope/n/sub", "src", ctx)).toEqual({
      external: "@scope/n",
    });
    expect(resolveSpec("ts", "node:path", "src", ctx)).toEqual({
      external: "node:path",
    });
  });
  it("resolves python dotted and relative imports", () => {
    expect(resolveSpec("py", "pkg.utils", "", ctx)).toEqual({
      internal: "pkg/utils.py",
    });
    expect(resolveSpec("py", "pkg", "", ctx)).toEqual({
      internal: "pkg/__init__.py",
    });
    expect(resolveSpec("py", "os", "pkg", ctx)).toEqual({ external: "os" });
  });
  it("resolves rust mod decls relative to the file", () => {
    expect(resolveSpec("rs", "helper", "src", ctx)).toEqual({
      internal: "src/helper/mod.rs",
    });
    expect(resolveSpec("rs", "foo", "src", ctx)).toEqual({
      internal: "src/foo.rs",
    });
    expect(resolveSpec("rs", "std::io", "src", ctx)).toEqual({
      external: "std",
    });
  });
  it("resolves c includes by suffix", () => {
    expect(resolveSpec("c", "net/socket.h", "src", ctx)).toEqual({
      internal: "include/net/socket.h",
    });
  });
});
