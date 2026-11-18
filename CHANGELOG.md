# Changelog

All notable changes to ikat. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[SemVer](https://semver.org/).

## [0.2.0] — 2026-11-18

### Added

- TTY progress bars for `ikat init` / `ikat sync` — one line per hot phase
  (`build`, `probe`, `edges`), rendered on stderr with throttled redraw.
  Silent when stderr isn't a terminal or `-q` is passed, so agent and
  piped output stays clean.
- Optional step callbacks on `runProbeBatch` and `resolveAllEdges`.

## [0.1.0] — 2026-11-18

First public release.

### Added

- Deterministic L0 repo index: inventory, role classification, sha1 hashes,
  per-language import/export/doc-comment extraction, specifier resolution
  (relative, NodeNext `.js`→`.ts`, Python, Rust `mod`/`crate::`/stem-dir,
  workspace packages, `tsconfig` paths), rank scoring.
- `ikat init / status / digest / file / refs / sync / uninit` with bounded,
  evidence-grounded output and an AGENTS.md orientation marker.
- L1 FRAS overlay: `.ikat/entries.txt`, `ikat put`, `ikat enrich`
  (recency- and coverage-aware ordering), hash-bound staleness.
- Media/document probing with builtin magic bytes + optional
  `file`/`exiftool`/`ffprobe`/`pdfinfo` batched fallback chain;
  `ikat convert` (markitdown/uvx) and `ikat doctor`.
- `ikat diagram --draft` Mermaid baseline: rank seeds + connected
  frontier growth + per-component caps.
- `SKILL.md` agent contract; installable via `npx skills add
  Ariakage/ikat-skill`.
