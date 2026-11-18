import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runFile } from "../src/commands/file.js";
import { runInit } from "../src/commands/init.js";
import { runRefs } from "../src/commands/refs.js";
import { runStatus } from "../src/commands/status.js";
import { runSync } from "../src/commands/sync.js";

let dir: string;
const createSpy = () =>
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
let outSpy: ReturnType<typeof createSpy>;

const out = (): string =>
  (outSpy.mock.calls as unknown as [string][]).map((c) => c[0]).join("");

async function fixture(): Promise<void> {
  dir = await fs.mkdtemp(path.join(tmpdir(), "ikat-cmd-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  const files: Record<string, string> = {
    "package.json": '{"name":"fx","description":"cmd fixture"}',
    "src/index.ts": 'import { a } from "./lib/a";\nexport const main = a;\n',
    "src/lib/a.ts": "/** A module. */\nexport const a = 1;\n",
    "src/lib/b.ts": 'import { a } from "./a";\nexport const b = a + 1;\n',
    "README.md": "# Fx\n\nFixture purpose line.\n",
  };
  for (const [p, c] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(dir, p)), { recursive: true });
    await fs.writeFile(path.join(dir, p), c);
  }
  execFileSync(
    "git",
    ["-c", "user.email=t@t", "-c", "user.name=t", "add", "-A"],
    { cwd: dir },
  );
  execFileSync(
    "git",
    ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"],
    { cwd: dir },
  );
}

beforeEach(async () => {
  await fixture();
  outSpy = createSpy();
});
afterEach(async () => {
  outSpy.mockRestore();
  await fs.rm(dir, { recursive: true, force: true });
});

const init = () =>
  runInit({ path: dir, tracked: false, marker: true, quiet: true });

describe("init → status", () => {
  it("reports fresh after init", async () => {
    expect(await init()).toBe(0);
    outSpy.mockClear();
    expect(await runStatus({ target: dir, json: false })).toBe(0);
    expect(out()).toContain("state  · fresh");
  });
  it("emits --json", async () => {
    await init();
    outSpy.mockClear();
    expect(await runStatus({ target: dir, json: true })).toBe(0);
    const j = JSON.parse(out());
    expect(j.fresh).toBe(true);
    expect(j.counts.src).toBeGreaterThan(0);
  });
});

describe("file", () => {
  it("prints the metadata card and bounded excerpt", async () => {
    await init();
    outSpy.mockClear();
    const code = await runFile({
      target: dir,
      file: "src/lib/a.ts",
      lines: null,
      full: false,
    });
    expect(code).toBe(0);
    const s = out();
    expect(s).toContain("src/lib/a.ts  · src · ts");
    expect(s).toContain("doc: A module.");
    expect(s).toContain("exports: a");
    expect(s).toContain("imported by: src/index.ts, src/lib/b.ts");
    expect(s).toContain("1│/** A module. */");
  });
  it("honors --lines ranges", async () => {
    await init();
    outSpy.mockClear();
    await runFile({
      target: dir,
      file: "src/index.ts",
      lines: "2-2",
      full: false,
    });
    expect(out()).toContain("2│export const main = a;");
    expect(out()).not.toContain("1│import");
  });
  it("suggests near matches for missing files", async () => {
    await init();
    const err = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const code = await runFile({
      target: dir,
      file: "src/a.ts",
      lines: null,
      full: false,
    });
    expect(code).toBe(1);
    const errs = err.mock.calls.map((c) => String(c[0])).join("");
    expect(errs).toContain("did you mean src/lib/a.ts");
    err.mockRestore();
  });
});

describe("refs", () => {
  it("lists out and in edges", async () => {
    await init();
    outSpy.mockClear();
    expect(
      await runRefs({ target: dir, file: "src/lib/a.ts", json: false }),
    ).toBe(0);
    const s = out();
    expect(s).toContain("out (0): ·");
    expect(s).toContain("in  (2): src/index.ts, src/lib/b.ts");
  });
  it("--json output parses", async () => {
    await init();
    outSpy.mockClear();
    await runRefs({ target: dir, file: "src/lib/b.ts", json: true });
    const j = JSON.parse(out());
    expect(j.imports).toEqual(["src/lib/a.ts"]);
    expect(j.importedBy).toEqual([]);
  });
});

describe("sync", () => {
  it("reuses unchanged entries and picks up new files", async () => {
    await init();
    // add a file + modify another
    await fs.writeFile(
      path.join(dir, "src/lib/c.ts"),
      'import { b } from "./b";\nexport const c = b;\n',
    );
    await fs.writeFile(
      path.join(dir, "src/index.ts"),
      'import { a } from "./lib/a";\nimport { c } from "./lib/c";\nexport const main = a;\n',
    );
    outSpy.mockClear();
    expect(await runSync({ path: dir, quiet: false })).toBe(0);
    const s = out();
    // c.ts plus the AGENTS.md marker file created by init
    expect(s).toContain("2 added");
    expect(s).toContain("1 refreshed");
    expect(s).toContain("0 removed");
    // edges picked up after re-resolution
    outSpy.mockClear();
    await runRefs({ target: dir, file: "src/lib/c.ts", json: true });
    const j = JSON.parse(out());
    expect(j.imports).toEqual(["src/lib/b.ts"]);
    expect(j.importedBy).toEqual(["src/index.ts"]);
  });
  it("drops removed files", async () => {
    await init();
    await fs.rm(path.join(dir, "src/lib/b.ts"));
    outSpy.mockClear();
    await runSync({ path: dir, quiet: false });
    expect(out()).toContain("1 removed");
    outSpy.mockClear();
    await runRefs({ target: dir, file: "src/lib/a.ts", json: true });
    const j = JSON.parse(out());
    expect(j.importedBy).toEqual(["src/index.ts"]); // b.ts importer gone
  });
  it("fails cleanly without an index", async () => {
    const bare = await fs.mkdtemp(path.join(tmpdir(), "ikat-empty-"));
    const err = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    expect(await runSync({ path: bare, quiet: true })).toBe(1);
    err.mockRestore();
    await fs.rm(bare, { recursive: true, force: true });
  });
});
