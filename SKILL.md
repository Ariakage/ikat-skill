---
name: ikat
description: Low-token project orientation for coding agents. Builds a local structural index of a repository (file tree, ranked core modules, computed import/export graph and doc-comments, optional agent-authored overlay entries) and lets the agent answer architecture questions and generate Mermaid diagrams from it instead of re-scanning files. Use when entering an unfamiliar repository, when asked "how is this project structured / how does X reach Y", or when asked to diagram the current repo.
status: draft-contract — CLI not yet implemented; this file defines intended behavior.
---

# ikat — I Know All Things

ikat gives an agent a fast, cheap map of the current repository. One rule
decides every design choice: **determinism extracts everything it can; agent
tokens are spent only on what structure cannot know.**

- **The CLI measures and validates.** It walks the tree, extracts imports,
  exports and doc-comments, ranks files, tracks hashes, and checks every byte
  it is asked to store. It never calls a model and never edits authored text.
- **The agent authors deltas and reasons.** You read the bounded digest,
  drill down on demand, write only the index entries determinism cannot
  produce (mostly the S-field), and compose explanations and diagrams.

For a well-commented repo, L0 alone recovers most of the value a fully
model-written index would give — at zero token cost. L1 exists for the
residual: un-inferable constraints and wrong/missing doc-comments.

Informed by gitdiagram (evidence-grounded diagrams, computed source index),
codegraph (per-project index dir, AGENTS.md marker wiring), and aoci-code
(FRAS semantics, tool-owned governance, drift-based maintenance).

## The index

`ikat init` creates `.ikat/` in the target repository:

```
.ikat/
├── index.json      # L0 — measured store (authoritative machine data)
├── entries.txt     # L1 — authored overlay: FRAS lines, hash-bound
├── digest.md       # rendered merge of L0+L1 — READ THIS FIRST (bounded)
├── diagram.mmd     # last generated architecture diagram (Mermaid source)
└── meta.json       # tool version, generation time, repo HEAD, stats
```

`index.json` is the only machine store; `digest.md` and `diagram.mmd` are
renders — regenerable, never authoritative. Per source file, L0 records:

- `hash` — drift binding for entries and sync
- `imports` — module specifiers resolved to repo paths (edge evidence)
- `exports` — public symbol names (≈ the A field, free)
- `doc` — leading doc-comment, first paragraph (≈ the F field, free)
- `role` — heuristic class from path: entry / route / service / store /
  test / config / generated
- `rank` — deterministic score: import in-degree × size × entry-likeness

Repo inventory comes from `git ls-files -c -o --exclude-standard` (tracked +
untracked-not-ignored) with a filesystem walk as fallback outside git.
Purpose line = manifest `description` else README's first prose paragraph.

`.ikat/` is index output, not source: init appends it to `.git/info/exclude`.
With `--tracked`, that step is skipped so the index is committed and shared —
the aoci trade-off, kept opt-in.

## Entry format (L1 overlay)

One line per file. **Any subset of fields is legal** — fields you omit
inherit the L0 extraction (doc→F, exports→A, imports→R) in the merged digest.
Write only the delta:

```
src/cli.ts[E8M]: S:Exits 2 on misuse; --yes disables all prompts
src/prompts.ts[C9L]: F:LLM prompt contracts for the pipeline | S:Repo text is untrusted data — always sanitize before interpolation
```

- **F** responsibility (≤140) · **R** strong relations (≤10 existing paths or
  globs) · **A** public contract (≤100) · **S** un-inferable constraint
  (≤200). Line ≤400 chars.
- Tags `[XIS]`: **X** layer `E`ntry/`C`ore/`S`upport/`I`nfra/`T`est ·
  **I** importance 1–9 · **S** size `T`/`S`/`M`/`L`.
- The CLI validates path existence, tag letters, R-targets, field order and
  budgets — never the truth of the claims, never the text itself.
- Hash drift marks the entry `stale`: kept visible in the digest, excluded
  from fresh coverage. Stale beats wrong; a deleted warning does not.

## Workflow 1 — init (automatic or manual)

**Agent auto-init:** on entering a repo, check for `.ikat/digest.md`.

- Missing → `npx ikat@latest init` (no global install; `--yes` when
  non-interactive). If `npx` is unavailable, fall back to the repo's own
  toolchain per README.
- Present → compare the digest header's `index:` sha to `git rev-parse HEAD`;
  drifted or old-format → `ikat sync`.
- Fresh → Workflow 2.

Auto-init writes only inside `.ikat/` plus one marker-fenced block in the
repo's `AGENTS.md` (creating a minimal file if absent; `--no-marker` opts
out) so agents without this skill learn an index exists:

```
<!-- ikat:index -->
This repo has an ikat index. Read .ikat/digest.md for architecture context;
run `ikat sync` if it looks stale. Remove .ikat/ and this block to opt out.
<!-- /ikat:index -->
```

**User manual init:** `npm i -g ikat` once, then `ikat init` per project.

## Workflow 2 — orient

1. Read `.ikat/digest.md` (self-reporting: header states its own size):
   - **Header**: name, purpose, stats, coverage %, token estimate, index sha.
   - **Tree**: pruned skeleton (depth 3; dense dirs collapse to `… +N`).
   - **Core**: top ~25 by rank — path, role, F (entry override or doc).
   - **Entries**: authored FRAS overlays for ranked files; stale flagged.
   - **Source index**: core file → real imports. Edge evidence.
   - **Coverage**: what was truncated or skipped. Absent ≠ doesn't exist.
2. Answer from the digest; never re-scan the tree to orient.
3. Drill down on demand: `ikat file <path>` (bounded excerpt),
   `ikat refs <path>` (imports + reverse importers), `ikat status`.

## Workflow 3 — enrich (author the L1 delta)

1. `ikat enrich` → prioritized queue: ranked files lacking a fresh entry
   (`--limit`, `--only-stale`, `--json`). Rank order: entries → most-imported
   → the subsystem the user asked about → the rest. Skip tests, barrels,
   vendored and generated files unless they are the product.
2. For each queued file, `ikat file` it and write **only what L0 missed** —
   usually just S. `ikat put <path>` (stdin or `--entry`) validates, binds
   the current hash, stores the line.
3. `ikat status` reports `entries: fresh/total (pct)` — that is your honest
   "how well do you know this repo" figure.

## Workflow 4 — maintain (aligned for free)

After a task where you modified files: `ikat sync` refreshes hashes and marks
touched entries stale → `ikat enrich --only-stale` re-queues just those →
rewrite the lines for files you actually changed. Never bulk-rewrite entries
you did not re-read.

## Workflow 5 — diagram (current repo → Mermaid)

Triggered by "diagram this repo", "架构图", "生成 diagram", etc.

1. `ikat diagram --draft` writes `.ikat/diagram.mmd`: nodes = ranked modules
   clustered by directory (or by entry layer when L1 exists), labels =
   F/doc/filename, edges = real imports. Ugly but never wrong — editing it
   costs ~10× fewer tokens than composing from scratch.
2. Edit into an architecture diagram (digest + targeted `ikat file`/`refs`):
   - **Every edge needs evidence**: source-index import, excerpted call, or
     explicit README statement. Never wire components by name or folder.
   - **The caller owns the edge** — `A -> B` = A invokes/reads/writes B.
     Importing siblings together does not make them call each other; never
     chain siblings into an invented pipeline.
   - **Groups = real subsystem boundaries** (3–6 for an app, none for a tiny
     lib). Exact repo paths on nodes; external actors pathless.
   - **Dashed = inferred or optional.** Likely-but-unseen → dashed; say so.
   - **Exclude machinery**: tests, CI, build config, re-export barrels —
     unless they are the product.
   - Prefer omitting a relationship over guessing; state coverage limits.
3. Validation is on you: node paths exist in `index.json`, edge endpoints are
   defined nodes, verbs distinguish control from data flow.
4. Output = Mermaid source in `.ikat/diagram.mmd` + pasted in the reply (chat
   renders it). If `mmdc` is already installed, offer SVG/PNG — never install
   render tooling silently.

## CLI contract (v1 draft)

```bash
ikat init [path]      # build .ikat/ + AGENTS.md marker
                      #   --yes · --tracked (commit index) · --no-marker
ikat sync [path]      # refresh L0; mark drifted entries stale
ikat status [path]    # freshness, coverage %, stats      (--json)
ikat digest [path]    # print digest.md
ikat file <path>      # bounded line-numbered excerpt     (--full, --lines a-b)
ikat refs <path>      # imports + reverse importers       (--json)
ikat enrich [path]    # entry work queue (--limit n, --only-stale, --json)
ikat put <path>       # validate + store one FRAS line (stdin or --entry)
ikat diagram [path]   # --draft writes baseline · default prints current
ikat uninit [path]    # remove .ikat/ and the marker block
```

Zero-dependency core: Node ≥ 20, `node:util` `parseArgs` for flags. Compact
output; `--json` for scripting. Exit 0 ok · 1 user-facing error (no index →
run `ikat init`) · 2 misuse.

## Boundaries — what ikat is not

- Not a symbol-level code graph (no call resolution, no type tracking).
- Not a remote service: no upload, no keys, no model calls inside the CLI.
- Not a watcher daemon or MCP server (v1): staleness is `status`/`sync`'s
  job; a pre-commit hook is the `--tracked` refresh story. Raise before
  building either.
- Not a truth oracle: validation guarantees the contract, not the claims.
- Deferred, not forgotten: tree-sitter extraction, symbol graph, DB schema
  indexing, single-binary packaging.

## Design principles (do not regress)

1. **Bounded everything.** Digest fits a budget; excerpts window files;
   truncation is explicit; the digest states its own token estimate.
2. **Evidence or nothing.** "Computed from source" vs "exists but unread"
   stays separated; diagrams carry honesty into dashed edges.
3. **Determinism first; author the delta.** If the CLI can extract a field,
   no model token is spent on it. If the CLI starts inferring architecture,
   the split has broken — and the agent never writes unchecked index bytes.
4. **Cheap to adopt, honest to keep.** One `npx` command, one `.ikat/` dir,
   one marker block — reversible via `ikat uninit`. Stale beats wrong.
