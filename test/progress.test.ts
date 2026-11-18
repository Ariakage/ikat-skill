import { describe, expect, it, vi } from "vitest";
import { Progress, progressOn } from "../src/progress.js";

describe("Progress", () => {
  it("stays silent when disabled", () => {
    const spy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const p = new Progress("build", 10, false);
    for (let i = 0; i < 10; i++) p.tick();
    p.finish();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("renders bar + counters and clears on finish", () => {
    const out: string[] = [];
    const spy = vi.spyOn(process.stderr, "write").mockImplementation((s) => {
      out.push(String(s));
      return true;
    });
    const p = new Progress("build", 4, true);
    p.tick(4); // completion always renders (throttle exempt at 100%)
    p.finish();
    const line = out.join("");
    expect(line).toContain("build ·");
    expect(line).toContain("100%");
    expect(line).toContain("4/4");
    expect(line.endsWith("\r\x1b[K")).toBe(true);
    spy.mockRestore();
  });
});

describe("progressOn", () => {
  it("is false when quiet regardless of TTY", () => {
    expect(progressOn(true)).toBe(false);
  });
});
