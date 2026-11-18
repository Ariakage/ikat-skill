import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { firstExisting, run, which } from "../tools.js";

type State = "ok" | "broken" | "missing";

interface Check {
  name: string;
  state: State;
  detail: string | null;
  unlocks: string;
}

async function skillPath(name: string): Promise<string | null> {
  const home = os.homedir();
  const candidates = [
    path.join(home, ".agents", "skills", name, "SKILL.md"),
    path.join(home, ".claude", "skills", name, "SKILL.md"),
    path.join(home, ".codex", "skill-sources", name, "SKILL.md"),
  ];
  // plugin-style dirs: ~/.claude/skills/<anything>--<name>/SKILL.md
  for (const dir of [
    path.join(home, ".claude", "skills"),
    path.join(home, ".agents", "skills"),
  ]) {
    try {
      for (const ent of await fs.readdir(dir)) {
        if (ent === name || ent.endsWith(`--${name}`)) {
          candidates.push(path.join(dir, ent, "SKILL.md"));
        }
      }
    } catch {
      /* no skills dir */
    }
  }
  return firstExisting(candidates);
}

/** A tool on PATH that crashes on --version is worse than absent — the
 * fallback chain would trust it and get garbage. Verify cheaply. */
async function checkBin(
  name: string,
  unlocks: string,
  verArgs: string[],
): Promise<Check> {
  const p = which(name);
  if (!p) return { name, state: "missing", detail: null, unlocks };
  const r = await run(name, verArgs, 8000);
  if (r === null || r.code !== 0) {
    const last = (r?.stderr.trim().split("\n").pop() ?? "").slice(0, 80);
    return {
      name,
      state: "broken",
      detail: last || "exited non-zero",
      unlocks,
    };
  }
  const ver = r.stdout.trim().split("\n")[0]?.slice(0, 60) ?? p;
  return { name, state: "ok", detail: ver, unlocks };
}

export async function runDoctor(opts: { json: boolean }): Promise<number> {
  const bins: Array<[string, string, string[]]> = [
    ["git", "inventory via ls-files + HEAD staleness", ["--version"]],
    ["file", "binary type descriptions", ["--version"]],
    ["ffprobe", "A/V duration, resolution, codec", ["-version"]],
    ["pdfinfo", "PDF pages + title", ["-v"]],
    ["exiftool", "image dims fallback, doc metadata", ["-ver"]],
    [
      "markitdown",
      "ikat convert — PDF/DOCX/XLSX/EPUB/HTML/IPYNB/ZIP → md",
      ["--version"],
    ],
    ["uvx", "markitdown without a pip install", ["--version"]],
    ["mmdc", "render diagram.mmd to svg/png (optional)", ["--version"]],
  ];
  const checks: Check[] = [
    {
      name: "node",
      state: "ok",
      detail: process.version,
      unlocks: "core runtime",
    },
    ...(await Promise.all(bins.map(([n, u, a]) => checkBin(n, u, a)))),
  ];
  const skill = await skillPath("video-storyboard");
  checks.push({
    name: "video-storyboard",
    state: skill ? "ok" : "missing",
    detail: skill,
    unlocks: "delegate A/V understanding (frames, storyboards, transcripts)",
  });

  if (opts.json) {
    process.stdout.write(
      `${JSON.stringify(
        checks.map((c) => ({ name: c.name, state: c.state, detail: c.detail })),
        null,
        2,
      )}\n`,
    );
    return checks.some((c) => c.state === "broken") ? 1 : 0;
  }

  for (const c of checks) {
    const mark = c.state === "ok" ? "✓" : c.state === "broken" ? "!" : "✗";
    const what =
      c.state === "ok"
        ? `${c.unlocks}${c.detail && c.detail.length < 50 ? ` · ${c.detail}` : ""}`
        : c.state === "broken"
          ? `— ${c.unlocks} (BROKEN: ${c.detail})`
          : `— ${c.unlocks} (unavailable)`;
    process.stdout.write(`${mark} ${c.name.padEnd(16)} ${what}\n`);
  }
  const broken = checks.filter((c) => c.state === "broken");
  const missing = checks.filter((c) => c.state === "missing");
  const tail: string[] = [];
  if (broken.length)
    tail.push(
      `${broken.length} tool(s) on PATH but broken — fix or remove so the fallback chain skips them`,
    );
  if (missing.length)
    tail.push(
      `${missing.length} optional tool(s) missing — probes degrade gracefully`,
    );
  process.stdout.write(
    `${tail.length ? `\n${tail.join("\n")}\n` : "\nall tools available\n"}`,
  );
  return broken.length ? 1 : 0;
}
