# AGENTS.md

Conventions for coding agents working in this repository.

## Project overview

**ikat** ("I know all things") is an agent skill that gives coding agents a
fast, low-token understanding of a project's structure. A deterministic
TypeScript CLI builds a per-repo index under `.ikat/`; the agent reads a
bounded digest and drills into files only when needed. The same index feeds
the `diagram` workflow, which produces an evidence-grounded Mermaid
architecture diagram of the repo.

- **Type**: agent skill repository — `SKILL.md` (the workflow contract) plus
  the TypeScript CLI that produces and maintains the index.
- **Implementation language**: TypeScript.
- **Design constraint**: outputs are consumed by agents, so they must be
  compact. Prefer terse, structured formats over prose; token cost is a
  first-class requirement, not an afterthought.
- **Design split**: the CLI measures and validates (tree, ranking, import
  graph, entry contracts); the agent authors and reasons (semantic entries,
  orientation, diagram composition). The CLI never infers architecture or
  edits authored text; the agent never writes unchecked index bytes.
- **Index model**: L0 deterministic skeleton (instant, zero token cost —
  extracts imports, exports, doc-comments, roles and rank) plus L1
  agent-authored FRAS overlays (only the delta determinism can't produce —
  mostly the S field — hash-bound, amortized across tasks). Default local
  `.ikat/`; `--tracked` makes the index Git-versioned.
- **Toolchain**: TypeScript, zero-dependency core (`node:util` `parseArgs`),
  Node ≥ 20, single-file ESM bundle. No model calls inside the CLI, no native
  modules — it must install wherever an agent runs.
- **Status**: M5 implemented — full v1 CLI surface against `SKILL.md`:
  L0 lifecycle, L1 entries, `diagram --draft`, media probe fallback
  chain, `convert` (markitdown/uvx), and `doctor`.

Layout:

```
SKILL.md           # skill entry point: triggers, workflows, CLI contract
AGENTS.md          # this file — contributor conventions
docs/design.md     # confirmed decisions + reference analysis + open items
docs/progress.md   # milestone tracker + decision log — keep current
src/cli.ts         # arg dispatch (parseArgs, zero deps)
src/commands/      # init / sync / status / digest / file / refs /
                   # enrich / put / uninit
src/entries.ts     # L1 FRAS overlay: parse, validate, store, auto-tag
src/pipeline.ts    # shared scan→extract→resolve→index pipeline
src/paths.ts       # repo-root + arg→repo-path resolution
src/scan.ts        # inventory, role classify, purpose detection
src/langs.ts       # per-language extraction table (regex, v1)
src/extract.ts     # doc-comment/import/export extraction + spec resolution
src/rank.ts        # deterministic core ranking
src/store.ts       # index/meta io, hashing, format version
src/digest.ts      # pruned tree + digest.md renderer
src/marker.ts      # AGENTS.md marker + .git/info/exclude (worktree-aware)
src/git.ts         # git plumbing helpers
test/              # vitest unit tests
```

Checks: `pnpm typecheck`, `pnpm lint` (biome), `pnpm test` (vitest),
`pnpm build` (tsup → single ESM bundle `dist/cli.js`). Run `pnpm ikat` or
`node dist/cli.js` for the dev CLI.

## Getting started

1. Read the docs and code relevant to the task, plus this `AGENTS.md`.
2. Check the working tree for existing changes; preserve the user's and other
   collaborators' work.
3. Judge project state from actual files — a plan written in docs does not
   mean the capability is implemented.
4. Work within the authorized scope. Ordinary, reversible implementation
   choices may be made directly. Raise anything that changes product direction
   or public contracts first, stating the impact, and wait for confirmation.

## Collaboration and scope

- Communicate with the user in Chinese by default; write documentation in
  English; use English identifiers.
- Release notes are provided in both Simplified Chinese and English.
  Repository release notes stay consistent with GitHub Releases on features,
  compatibility, and known limitations.
- Keep changes focused — no unrelated refactors, dependency swaps, or
  reformatting.
- Clearly distinguish implemented / confirmed / draft / undecided. Do not
  write suggestions as facts.
- Sync user-confirmed direction changes into the relevant docs and decision
  records.
- When changing behavior, public interfaces, or configuration, update the
  related docs and examples in the same change.
- Do not fabricate run results or claim checks passed that were not run.
- After finishing an independently verifiable stage of work, commit per the
  Git conventions below. Do not push or publish unless asked.

## Git commits

- Create a focused commit after each independently verifiable stage (a DEV
  task, a milestone, or a standalone feature), once applicable checks pass and
  related docs are synced. If the user explicitly asks not to commit, follow
  that instead. If required checks fail or cannot run, say why and what is
  unverified — do not mark the task done.
- One commit, one purpose: each commit carries a single, clear objective. Do
  not mix unrelated features, fixes, refactors, or docs in one commit.
- Before committing, review the working tree and staged content; commit only
  what belongs to this stage and keep unrelated work from the user and other
  collaborators intact.
- Commit messages follow
  [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/):
  - Title format: `type(scope): description`; `scope` is optional.
  - `feat` for new features, `fix` for bug fixes; use `docs`, `test`,
    `refactor`, `chore`, `build` etc. as appropriate.
  - Title and body descriptions in English.
  - Mark breaking changes with `!` before the colon, or with a
    `BREAKING CHANGE:` footer.
  - Example: `docs(agents): record Conventional Commits usage in English`
- Commits and PRs carry only the user's identity — no AI tool attribution,
  co-author lines, "generated with" footers, badges, or links.

## Delivery notes

When reporting finished work, briefly state:

- what changed and why;
- which verifications ran and their results;
- what remains unresolved.

Reference code or docs with locatable paths.

<!-- ikat:index -->
This repo has an ikat index: read .ikat/digest.md for architecture context.
Run `ikat init` to regenerate it; remove .ikat/ and this block to opt out.
<!-- /ikat:index -->
