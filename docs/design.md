# ikat — Design decisions

Status: **confirmed design, implementation not started**. This file is the
record of what was decided and why; `SKILL.md` is the working contract built
from it. When they disagree, flag it — don't silently follow either.

## Positioning

ikat ("I know all things") is an agent skill + TypeScript CLI that gives a
coding agent a fast, low-token map of the current repository.

The one rule behind every choice: **determinism extracts everything it can;
agent tokens are spent only on what structure cannot know.** The CLI never
calls a model and never edits authored text; the agent never writes unchecked
index bytes.

## Reference analysis → adopted elements

| Project | What it is | What ikat takes | What ikat skips |
|---|---|---|---|
| [gitdiagram](https://github.com/ahmedkhaleel2004/gitdiagram) | Remote service: bounded tree + README + computed SOURCE INDEX → LLM → strict graph AST → validated → deterministic Mermaid | Evidence-grounded edges (caller owns the edge, dashed = inferred), computed source index as edge evidence, "absent ≠ nonexistent" honesty | Server pipeline, LLM-in-the-middle (our agent IS the model), hosted rendering |
| [codegraph](https://github.com/colbymchenry/codegraph) | Local Rust+tree-sitter symbol graph in SQLite, MCP server, file watcher | Per-project index dir, one-command `init`, AGENTS.md marker-fenced block so skill-less agents discover the index | SQLite store, symbol-level depth, watcher daemon (their own docs list lock/WSL pain) |
| [aoci-code](https://github.com/aoci-spec/aoci-code) | Governed plain-text index *written by the agent* through MCP tools; FRAS lines; Git-versioned | FRAS entry semantics, "model owns meaning / tool owns governance", hash-bound drift→stale maintenance, coverage % as mastery | Full model-authored index cost (~1h/200k LOC), MCP state machine, multi-volume layout (v1 flattens to one file) |
| [video-storyboard](https://github.com/Ariakage/video-storyboard) | Node CLI skill: deterministic probe/storyboard/index → agent's vision does the reading | Probe-then-delegate media strategy, `doctor` env check, "never describe what wasn't read" | Any in-CLI media understanding |

## Confirmed decisions

1. **Layered hybrid index** (user-confirmed). L0 deterministic skeleton
   (instant, zero tokens) + L1 agent-authored FRAS **overlay** — entries carry
   only the delta determinism can't produce, mostly the S field. Omitted
   fields inherit L0 extractions at render time. Confirmed over deterministic-only
   and full model-authored alternatives.
2. **Local `.ikat/` default, `--tracked` opt-in** (user-confirmed). Default
   writes `.git/info/exclude`; `--tracked` leaves `.ikat/` committable so the
   index is Git-versioned and shared — aoci's trade-off, opt-in.
3. **L0 extraction breadth.** Per file: hash, imports (resolved to repo
   paths), exports, leading doc-comment, heuristic role, deterministic rank.
   Inventory via `git ls-files -c -o --exclude-standard`; fs walk fallback.
   Purpose line = manifest `description` else README first paragraph.
4. **Media: probe + delegate.** Layered probe — built-in magic bytes/headers
   (format, image dimensions, ZIP listing, zero deps) → `file(1)` → `ffprobe`
   (A/V) → `exiftool`/`pdfinfo` (docs) → extension floor. Content
   understanding delegated: A/V → video-storyboard skill, images → host's
   vision. Sidecars (`<name>.md/.txt/.srt`) feed F/transcript for free.
5. **Documents: markitdown lazily.** PDF/DOCX/XLSX/PPTX/EPUB/HTML/IPYNB/MSG/
   ZIP → cached `.ikat/converted/<path>.md` on first `ikat file`/`convert`,
   hash-bound, `conv` state tracked. Converted docs behave like text (doc→F,
   excerpts, enrichable). markitdown's image/speech features explicitly out —
   they need model calls.
6. **Diagram workflow.** `ikat diagram --draft` emits a never-wrong baseline
   (directory clustering + real import edges + F/doc labels); the agent
   edits per gitdiagram's evidence rules; output is `.mmd` source only —
   chat renders it.
7. **Zero-dependency core.** Node ≥ 20, `node:util` `parseArgs`, single-file
   ESM bundle. Must install wherever an agent runs (`npx ikat-cli@latest init`).
8. **No daemon, no MCP, no remote** (v1). Staleness via digest-header sha +
   `status`/`sync`; pre-commit hook is the `--tracked` refresh story.

## Entry format (FRAS overlay)

`path[TAG]: F:… | R:… | A:… | S:…` — any subset legal. Budgets: F≤140, A≤100,
S≤200, R≤10 existing paths/globs, line ≤400 chars. Tag `[XIS]` = layer
(`E`ntry/`C`ore/`S`upport/`I`nfra/`T`est/`A`sset/`D`ocument) + importance
1–9 + size `T`/`S`/`M`/`L`. CLI validates structure/paths/budgets, never the
claims or the text.

## Deferred (not forgotten)

File watcher / auto-sync daemon · MCP server · tree-sitter symbol graph ·
DB schema indexing · single-binary packaging.

## Open decisions (resolve during implementation)

- `conv` needs a `stale` state when source hash drifts (almost certainly yes).
- markitdown output truncation threshold (~500 KB md + flag, proposed).
- ZIP handling: member listing only (v1) vs recursive document expansion.
- FRAS budgets are draft values — tune on real repos.
- Tag dictionary is a starter set; extensions via project meta later.
- enrich priority formula (rank weights).

Resolved during M1:

- npm package: `ikat` taken → published name **`ikat-cli`**, bin stays `ikat`.
- Bundler/lint/test: tsup (single ESM bundle) + biome + vitest; pnpm.
- Extraction table v1: regex imports/exports/doc-comments for ts, js, py,
  go, rs, java, c/c++, rb, php, swift, kt, cs, sh — no tree-sitter yet.
- `index.json` v1: flat `files[]` with role/lang/hash/imports/external/
  exports/doc/rank + `meta.json` freshness record; format version `1`.
