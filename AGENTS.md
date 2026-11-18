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
- **Index model**: L0 deterministic skeleton (instant, zero token cost) plus
  L1 agent-authored FRAS entries (semantic, hash-bound, amortized across
  tasks). Default local `.ikat/`; `--tracked` makes the index Git-versioned.
- **Status**: `SKILL.md` is the agreed workflow draft; the CLI is not yet
  implemented. Treat command names and index formats there as the contract to
  build against, flagging deviations back to the user.

Layout (planned — files that don't exist yet are intent, not fact):

```
SKILL.md    # skill entry point: triggers, init/orient/diagram workflows
AGENTS.md   # this file — contributor conventions
src/        # TypeScript CLI source (pending)
```

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
