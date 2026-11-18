---
name: ikat
description: Low-token project orientation for coding agents. Builds a local structural index of a repository (file tree, ranked core modules, computed import/reference graph, optional agent-authored semantic entries) and lets the agent answer architecture questions and generate Mermaid diagrams from it instead of re-scanning files. Use when entering an unfamiliar repository, when asked "how is this project structured / how does X reach Y", or when asked to diagram the current repo.
status: draft-contract — CLI not yet implemented; this file defines intended behavior.
---

# ikat — I Know All Things

ikat gives an agent a fast, cheap map of the current repository. The split of
labor is deliberate:

- **The CLI measures and validates.** `ikat` walks the tree, ranks files,
  computes the import/reference index, tracks hashes, and checks everything it
  is asked to store. It never calls a model and never rewrites what a model
  wrote — every byte of *measured* output is grounded in real files.
- **The agent authors and reasons.** You read the bounded digest, drill down
  only where needed, write the semantic entries, and compose explanations and
  diagrams yourself. This is where the token savings come from: you never
  re-scan a repo to learn its shape, and index cost is paid once, then
  amortized.

Informed by gitdiagram (evidence-grounded diagrams, computed source index),
codegraph (per-project index dir, AGENTS.md marker wiring), and aoci-code
(model-authored FRAS entries, tool-owned governance, drift-based maintenance).

## The index

`ikat init` creates `.ikat/` in the target repository:

```
.ikat/
├── index.json      # L0 — measured store: files, sizes, hashes, imports,
│                   #   reference lists, ranking scores
├── entries.txt     # L1 — authored store: one FRAS line per file, written by
│                   #   the agent, validated + hash-bound by the CLI
├── digest.md       # the agent-facing summary — READ THIS FIRST (bounded);
│                   #   merges L0 structure with current L1 entries
├── diagram.mmd     # last generated architecture diagram (Mermaid source)
└── meta.json       # tool version, generation time, repo HEAD, stats
```

Two layers, different costs, both optional-but-ordered:

- **L0 skeleton** is built in seconds at `init`, zero token spend. Enough for
  structure questions and a baseline diagram.
- **L1 entries** carry what structure cannot: responsibility, strong
  relations, public contract, and un-inferable constraints. They cost agent
  reading time, are written incrementally (deep-init or during tasks), and
  persist — so the cost is paid once.

`.ikat/` is index output, not source. `ikat init` appends `.ikat/` to the
repo's `.git/info/exclude`. With `--tracked`, init instead writes index files
at repo root (`ikat.txt`, `ikat.meta.txt`), adds them to `.gitignore`'s care
(i.e. NOT ignored) so the index is Git-versioned and shared — same trade-off
aoci makes, kept off by default.

## Entry format (L1)

One line per file, ~300 chars max:

```
src/cli.ts[E8M]: F:Command dispatch and flag parsing | R:src/commands/*.ts | A:main | S:Exits 2 on misuse; --yes disables all prompts
```

- **F** — core responsibility (≤120 chars)
- **R** — strong relations: files you must read alongside it (≤8 paths or
  globs, must exist in `index.json`)
- **A** — public contract: exported names callers depend on (≤80 chars)
- **S** — constraints you cannot infer from code but must not get wrong
  (≤160 chars; write nothing here if F/R/A cover it)

Tags `[XIS]`: **X** layer — `E` entry, `C` core, `S` support, `I` infra,
`T` test/tooling; **I** importance 1–9; **S** size `T`iny/`S`mall/`M`ed/`L`arge.
The CLI validates paths, tag letters, field order and budgets; it never edits
the text. A green check means the contract holds — not that the claims are
true; that part is on the authoring agent.

## Workflow 1 — init (automatic or manual)

**Agent auto-init:** on entering a repo, check for `.ikat/digest.md` (or
`ikat.txt` in a `--tracked` repo).

- Missing → run `npx ikat@latest init` (no global install needed; `--yes`
  when non-interactive). If `npx` is unavailable, fall back to the repo's own
  toolchain per README.
- Present but stale (`ikat status` reports drifted hashes or an old index
  version) → run `ikat sync`.
- Present and fresh → go to Workflow 2.

Auto-init is silent and safe: it only writes inside `.ikat/` plus one
marker-fenced block in the repo's `AGENTS.md` (created if absent) so agents
without this skill learn that an index exists:

```
<!-- ikat:index -->
This repo has an ikat index. Read .ikat/digest.md for architecture context;
run `ikat sync` if it looks stale. Remove .ikat/ and this block to opt out.
<!-- /ikat:index -->
```

**User manual init:** `npm i -g ikat` once, then `ikat init` per project —
same command, same result.

## Workflow 2 — orient (answering structure questions)

1. Read `.ikat/digest.md` (~8–16 KB). Sections:
   - **Header**: repo name, one-line purpose (manifest/README), stats,
     coverage % (how many ranked files carry a fresh entry).
   - **Tree**: pruned directory skeleton.
   - **Core modules**: largest and most-imported files with guessed roles.
   - **Entries**: authored FRAS lines for core files (when L1 exists).
   - **Source index**: per core file, the repo files it actually imports —
     computed from source text. This is your edge evidence.
   - **Coverage note**: what was truncated or skipped. Absent ≠ doesn't exist.
2. Answer from the digest whenever possible. Do not re-scan the tree.
3. Drill down only on demand:
   - `ikat file <path>` — bounded, line-numbered excerpt.
   - `ikat refs <path>` — what this file imports and who imports it.
   - `ikat status` — freshness, coverage %, stale-entry count.

## Workflow 3 — enrich (write L1 entries)

When the digest's coverage is low, or the user asks for a deep index:

1. `ikat enrich` prints a prioritized queue: ranked files with no fresh entry
   (`--limit`, `--json`). Each item carries the file's current hash.
2. Read the file (via `ikat file`), write its FRAS line, store it:
   `ikat put <path>` with the line on stdin or `--entry`. The CLI validates
   structure, tags, referenced paths and budgets, binds it to the file hash,
   and rejects contract violations with a reason.
3. Entries go stale automatically when the file's hash changes — `ikat sync`
   refreshes L0 and marks drifted entries `stale` rather than deleting them.
4. Report coverage honestly: `ikat status` shows `entries: fresh/total (pct)`
   — that percentage is your "mastery" figure when asked how well you know
   the repo.

Batch order: entry points → most-imported core → the subsystem the user
cares about → everything else. Skip files that are tests, barrels, vendored
or generated unless they are the product.

## Workflow 4 — maintain (index stays aligned for free)

At the end of a task where you modified files:

1. `ikat sync` — refreshes hashes and marks touched entries stale.
2. `ikat enrich` — lists your touched files needing re-entry; rewrite just
   those `ikat put` lines.
3. Never bulk-rewrite entries you did not re-read. A stale mark is honest;
   a confident wrong entry is not.

## Workflow 5 — diagram (architecture diagram for the current repo)

Triggered by "diagram this repo", "架构图", "生成 diagram", etc.

1. `ikat diagram --draft` emits `.ikat/diagram.mmd` — a deterministic baseline:
   nodes = ranked modules clustered by directory, edges = real import edges
   from `index.json`. Ugly but never wrong.
2. Rewrite it into an architecture diagram using the digest (entries give you
   ready-made node labels and boundaries) + targeted `ikat file`/`refs` reads,
   then save back to `.ikat/diagram.mmd` and show it. Rules (adapted from
   gitdiagram's planner contract):
   - **Every edge needs evidence**: an import in the source index, a call seen
     in an excerpt, or an explicit README statement. Never connect components
     because names or folders suggest it.
   - **The caller owns the edge.** `A -> B` means code in A invokes/reads/
     writes B. Importing two siblings together does not make them call each
     other; never chain siblings into an invented pipeline.
   - **Groups are subsystem boundaries** (3–6 for an app, none for a tiny
     lib). Nodes get exact repo paths; external actors get none. Prefer
     entry-derived labels (F field) over invented names.
   - **Dashed = inferred or optional.** Likely but unseen → dashed, and say so.
   - **Exclude machinery**: tests, CI, build config, re-export barrels —
     unless they are the product.
   - Prefer omitting a relationship over guessing. Missing evidence is stated
     in the answer, not hidden.
3. Validation is on you: every node path must exist in the digest's tree or
   `index.json`; every edge endpoint must be a defined node; edge verbs
   (imports / calls / reads / writes / dispatches) must distinguish control
   from data flow.
4. Optional rendering: if `mmdc` (mermaid-cli) or equivalent is installed,
   offer to render SVG/PNG. Never install render tooling silently.

## CLI contract (v1 draft)

```bash
ikat init [path]      # build .ikat/ (index + digest + AGENTS.md marker)
                      #   --yes non-interactive · --tracked Git-versioned index
ikat sync [path]      # refresh L0 hashes; mark drifted entries stale
ikat status [path]    # freshness, stats, coverage %     (--json)
ikat digest [path]    # print digest.md to stdout
ikat file <path>      # bounded line-numbered excerpt    (--full, --lines a-b)
ikat refs <path>      # imports + reverse importers      (--json)
ikat enrich [path]    # prioritized queue of files lacking fresh entries
                      #   (--limit n, --json)
ikat put <path>       # validate + store one FRAS entry (stdin or --entry)
ikat diagram [path]   # --draft writes baseline mermaid · default prints it
ikat uninit [path]    # remove .ikat/ and the AGENTS.md marker block
```

Commands print compact output; `--json` for scripting. Exit code 0 = success,
1 = user-facing error (no index → tells you to run `ikat init`), 2 = misuse.

## Boundaries — what ikat is not

- Not a symbol-level code graph. No cross-file call resolution, no type
  tracking — file-level structure, import edges, and authored entries only.
- Not a remote service. No upload, no API keys, no model calls inside the CLI.
- Not a watcher daemon (v1). Freshness is `ikat status` + `ikat sync`'s job;
  auto-sync semantics are undecided — raise before implementing a daemon.
- Not a truth oracle. The CLI validates entry contracts, not claims; a fresh
  index can still contain a wrong F or S. Re-read when it matters.

## Design principles (do not regress)

1. **Bounded everything.** Digest fits a budget; excerpts window the file;
   truncation is always explicit.
2. **Evidence or nothing.** The index separates "computed from source" from
   "exists but unread". Diagrams carry that honesty into dashed edges.
3. **Tool measures and validates; the agent authors and reasons.** The CLI
   never infers architecture and never edits authored text; the agent never
   writes unchecked index bytes.
4. **Cheap to adopt, honest to keep.** One `npx` command, one `.ikat/` dir,
   one marker block — all reversible via `ikat uninit`. Stale beats wrong.
