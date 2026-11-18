---
name: ikat
description: Low-token project orientation for coding agents. Builds a local structural index of a repository (file tree, ranked core modules, computed import/reference graph) and lets the agent answer architecture questions and generate Mermaid diagrams from it instead of re-scanning files. Use when entering an unfamiliar repository, when asked "how is this project structured / how does X reach Y", or when asked to diagram the current repo.
status: draft-contract — CLI not yet implemented; this file defines intended behavior.
---

# ikat — I Know All Things

ikat gives an agent a fast, cheap map of the current repository. The split of
labor is deliberate:

- **The CLI is deterministic.** `ikat` walks the tree, ranks files, and
  computes the import/reference index. It never calls a model — every byte of
  output is grounded in real files.
- **The agent does the reasoning.** You read the bounded digest, drill down
  only where needed, and compose explanations/diagrams yourself. This is where
  the token savings come from: you never grep a whole repo to learn its shape.

Inspired by gitdiagram (evidence-grounded architecture diagrams) and codegraph
(per-project index + agent wiring), scaled down to a local skill + CLI.

## The index

`ikat init` creates `.ikat/` in the target repository:

```
.ikat/
├── index.json      # machine store: files, sizes, hashes, imports/exports,
│                   # per-file reference lists, ranking scores
├── digest.md       # the agent-facing summary — READ THIS FIRST (bounded)
├── diagram.mmd     # last generated architecture diagram (Mermaid source)
└── meta.json       # tool version, generation time, repo HEAD, stats
```

`.ikat/` is index output, not source. `ikat init` appends `.ikat/` to the
repo's `.git/info/exclude` (never touches `.gitignore` without being asked via
`--tracked`, which instead adds it to `.gitignore` for teams who want the index
committed).

## Workflow 1 — init (automatic or manual)

**Agent auto-init:** on entering a repo, check for `.ikat/digest.md`.

- Missing → run `npx ikat@latest init` (no global install needed). If `npx` is
  unavailable, fall back to the repo's own toolchain per README.
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

**User manual init:** `npm i -g ikat` once, then `ikat init` per project — same
command, same result. `--yes` for non-interactive (CI/agent use).

## Workflow 2 — orient (answering structure questions)

1. Read `.ikat/digest.md` (~8–16 KB). It is organized as:
   - **Header**: repo name, one-line purpose (from manifest/README), stats.
   - **Tree**: pruned directory skeleton — entry points, source roots, tests,
     config collapsed to counts.
   - **Core modules**: the largest and most-imported files, with their role
     guessed from path (`entry`, `route`, `service`, `store`…).
   - **Source index**: per core file, the repo files it actually imports —
     computed from source text, not inferred. This is your edge evidence.
   - **Coverage note**: what was truncated or skipped. Absent ≠ doesn't exist.
2. Answer from the digest whenever possible. Do not re-scan the tree.
3. Drill down only on demand:
   - `ikat file <path>` — bounded, line-numbered excerpt of one file.
   - `ikat refs <path>` — what this file imports and who imports it.
   - `ikat status` — index freshness, file counts, index version.

## Workflow 3 — diagram (architecture diagram for the current repo)

Triggered by "diagram this repo", "架构图", "生成 diagram", etc.

1. `ikat diagram --draft` emits `.ikat/diagram.mmd` — a deterministic baseline:
   nodes = ranked modules clustered by directory, edges = real import edges
   from the index. Ugly but never wrong.
2. Rewrite it into an architecture diagram using the digest + targeted
   `ikat file`/`refs` reads, then save back to `.ikat/diagram.mmd` and show it.
   Rules (adapted from gitdiagram's planner contract):
   - **Every edge needs evidence**: an import in the source index, a call seen
     in an excerpt, or an explicit README statement. Never connect components
     because names or folders suggest it.
   - **The caller owns the edge.** `A -> B` means code in A invokes/reads/
     writes B. Importing two siblings together does not make them call each
     other; never chain siblings into an invented pipeline.
   - **Groups are subsystem boundaries** (3–6 for an app, none for a tiny lib).
     Nodes get exact repo paths from the tree; external actors get no path.
   - **Dashed = inferred or optional.** If a relationship is likely but unseen
     in sampled code, draw it dashed and say so.
   - **Exclude machinery**: tests, CI, build config, barrels that only
     re-export — unless they are the product.
   - Prefer omitting a relationship over guessing. Missing evidence is stated
     in the answer, not hidden.
3. Validation is on you: every node path must exist in the digest's tree or
   `index.json`; every edge endpoint must be a defined node; label edge verbs
   (imports / calls / reads / writes / dispatches) so control vs data flow is
   unambiguous.
4. Optional rendering: if `mmdc` (mermaid-cli) or an equivalent is installed,
   offer to render SVG/PNG. Never install render tooling silently.

## CLI contract (v1 draft)

```bash
ikat init [path]      # build .ikat/ (index + digest + AGENTS.md marker)
                      #   --yes non-interactive · --tracked commit index via .gitignore
ikat sync [path]      # hash-diff incremental update
ikat status [path]    # freshness, stats, index version  (--json)
ikat digest [path]    # print digest.md to stdout
ikat file <path>      # bounded line-numbered excerpt     (--full, --lines a-b)
ikat refs <path>      # imports + reverse importers       (--json)
ikat diagram [path]   # --draft writes baseline mermaid · default prints it
ikat uninit [path]    # remove .ikat/ and the AGENTS.md marker block
```

Commands print compact output; `--json` for scripting. Exit code 0 = success,
1 = user-facing error (no index → tells you to run `ikat init`), 2 = misuse.

## Boundaries — what ikat is not

- Not a symbol-level code graph. No cross-file call resolution, no type
  tracking — file-level structure and import edges only.
- Not a remote service. No upload, no API keys, no model calls inside the CLI.
- Not a watcher daemon (v1). Freshness is `ikat status`'s job; auto-sync
  semantics are undecided — raise before implementing a daemon.

## Design principles (do not regress)

1. **Bounded everything.** Digest fits a budget; excerpts window the file;
   truncation is always explicit.
2. **Evidence or nothing.** The index separates "computed from source" from
   "exists but unread". Diagrams carry that honesty into dashed edges.
3. **Deterministic tool, reasoning agent.** If the CLI starts inferring
   architecture instead of measuring it, the split has broken.
4. **Cheap to adopt.** One `npx` command, one `.ikat/` dir, one marker block —
   all reversible via `ikat uninit`.
