#!/usr/bin/env node
import { parseArgs } from "node:util";
import { runInit } from "./commands/init.js";
import { runDigest, runUninit } from "./commands/misc.js";
import { runStatus } from "./commands/status.js";
import { VERSION } from "./store.js";

const HELP = `ikat — low-token project orientation for coding agents

usage: ikat <command> [path] [flags]

commands:
  init [path]     build .ikat/ index + digest.md + AGENTS.md marker
  status [path]   index freshness vs HEAD and stats
  digest [path]   print .ikat/digest.md
  uninit [path]   remove index, marker, and exclude entry

init flags:
  --tracked       keep .ikat/ versioned instead of .git/info/exclude
  --no-marker     skip the AGENTS.md marker block
  -q, --quiet     suppress summary output
`;

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
    case "status":
      return runStatus(rest[0] ?? ".");
    case "digest":
      return runDigest(rest[0] ?? ".");
    case "uninit":
      return runUninit(rest[0] ?? ".");
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
