#!/usr/bin/env node
import { parseArgs } from "node:util";
import { runFile } from "./commands/file.js";
import { runInit } from "./commands/init.js";
import { runDigest, runUninit } from "./commands/misc.js";
import { runRefs } from "./commands/refs.js";
import { runStatus } from "./commands/status.js";
import { runSync } from "./commands/sync.js";
import { VERSION } from "./store.js";

const HELP = `ikat — low-token project orientation for coding agents

usage: ikat <command> [path] [flags]

commands:
  init [path]     build .ikat/ index + digest.md + AGENTS.md marker
  sync [path]     incremental refresh (reuses unchanged entries)
  status [path]   index freshness vs HEAD and stats        --json
  digest [path]   print .ikat/digest.md
  file <path>     metadata card + bounded excerpt          --full · --lines a-b
  refs <path>     imports + reverse importers              --json
  uninit [path]   remove index, marker, and exclude entry

init flags:
  --tracked       keep .ikat/ versioned instead of .git/info/exclude
  --no-marker     skip the AGENTS.md marker block
  -q, --quiet     suppress summary output
`;

const cwdTarget = (rest: string[]): string => rest[0] ?? ".";

async function main(): Promise<number> {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "init": {
      const { values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: {
          tracked: { type: "boolean", default: false },
          "no-marker": { type: "boolean", default: false },
          yes: { type: "boolean", default: false },
          quiet: { type: "boolean", short: "q", default: false },
        },
      });
      return runInit({
        path: positionals[0] ?? ".",
        tracked: values.tracked!,
        marker: !values["no-marker"],
        quiet: values.quiet!,
      });
    }
    case "sync": {
      const { values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: { quiet: { type: "boolean", short: "q", default: false } },
      });
      return runSync({ path: positionals[0] ?? ".", quiet: values.quiet! });
    }
    case "status": {
      const { values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: { json: { type: "boolean", default: false } },
      });
      return runStatus({ target: positionals[0] ?? ".", json: values.json! });
    }
    case "digest":
      return runDigest(cwdTarget(rest));
    case "file": {
      const { values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: {
          full: { type: "boolean", default: false },
          lines: { type: "string" },
        },
      });
      const target = positionals[0];
      if (!target) {
        process.stderr.write("ikat: file needs a path\n");
        return 2;
      }
      return runFile({
        target: ".",
        file: target,
        lines: values.lines ?? null,
        full: values.full!,
      });
    }
    case "refs": {
      const { values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: { json: { type: "boolean", default: false } },
      });
      const target = positionals[0];
      if (!target) {
        process.stderr.write("ikat: refs needs a path\n");
        return 2;
      }
      return runRefs({ target: ".", file: target, json: values.json! });
    }
    case "uninit":
      return runUninit(cwdTarget(rest));
    case "-v":
    case "--version":
    case "version":
      process.stdout.write(`${VERSION}\n`);
      return 0;
    default:
      process.stdout.write(HELP);
      return cmd === "help" || cmd === "--help" || cmd === "-h" || !cmd ? 0 : 1;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`ikat: ${err instanceof Error ? err.message : err}\n`);
    process.exit(1);
  });
