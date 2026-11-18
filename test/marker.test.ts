import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyMarker,
  ensureExclude,
  MARK_OPEN,
  removeExclude,
  removeMarker,
} from "../src/marker.js";

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(tmpdir(), "ikat-test-"));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("AGENTS.md marker", () => {
  it("creates a minimal file when absent", async () => {
    expect(await applyMarker(dir)).toBe("created");
    const text = await fs.readFile(path.join(dir, "AGENTS.md"), "utf8");
    expect(text).toContain(MARK_OPEN);
  });
  it("appends to existing AGENTS.md", async () => {
    await fs.writeFile(path.join(dir, "AGENTS.md"), "# Rules\n\n- be nice\n");
    expect(await applyMarker(dir)).toBe("appended");
    const text = await fs.readFile(path.join(dir, "AGENTS.md"), "utf8");
    expect(text).toMatch(/^# Rules[\s\S]*ikat:index/);
  });
  it("replaces an existing block in place", async () => {
    await applyMarker(dir);
    await fs.writeFile(
      path.join(dir, "AGENTS.md"),
      `# Head\n\n${MARK_OPEN}\nold\n<!-- /ikat:index -->\n\ntail\n`,
    );
    expect(await applyMarker(dir)).toBe("updated");
    const text = await fs.readFile(path.join(dir, "AGENTS.md"), "utf8");
    expect(text).toContain("# Head");
    expect(text).toContain("tail");
    expect(text).not.toContain("old");
  });
  it("removes the block and keeps other content", async () => {
    await fs.writeFile(path.join(dir, "AGENTS.md"), "# Keep\n");
    await applyMarker(dir);
    expect(await removeMarker(dir)).toBe(true);
    const text = await fs.readFile(path.join(dir, "AGENTS.md"), "utf8");
    expect(text.trim()).toBe("# Keep");
  });
});

describe("git exclude", () => {
  it("adds and removes .ikat/ idempotently", async () => {
    const gd = path.join(dir, ".git");
    expect(await ensureExclude(gd)).toBe("added");
    expect(await ensureExclude(gd)).toBe("present");
    const text = await fs.readFile(path.join(gd, "info", "exclude"), "utf8");
    expect(text.trim()).toBe(".ikat/");
    expect(await removeExclude(gd)).toBe(true);
    expect(await removeExclude(gd)).toBe(false);
  });
});
