# ikat — Progress

Current phase: **M1 done — L0 skeleton works end-to-end**.
Working contract: `SKILL.md` · Decision record: `docs/design.md`

## Milestones

- [x] **M1 — skeleton end-to-end**: `init` + inventory + extraction +
  `index.json` + `digest.md` render + AGENTS.md marker. L0 usable.
- [ ] **M2 — drill-down + drift**: `file` / `refs` / `status` / `sync`,
  hash-based staleness.
- [ ] **M3 — entries**: `entries.txt` store, `put` / `enrich` validation,
  merged digest render.
- [ ] **M4 — diagram**: `diagram --draft` baseline + marker/docs polish.
- [ ] **M5 — formats + hardening**: media probe chain, markitdown pipeline,
  doctor, tests.

## Decision log

| Date | Commit | What |
|---|---|---|
| 2026-11-19 | `be562f4` | Repo initialized: AGENTS.md conventions |
| 2026-11-19 | `1170ef0` | SKILL.md draft: init/orient/diagram workflow (gitdiagram + codegraph model) |
| 2026-11-19 | `1c1cf42` | Layered index confirmed: L0 skeleton + L1 agent FRAS (aoci model); local `.ikat/` + `--tracked` |
| 2026-11-19 | `8cbbf42` | Entries converge to overlays (author the delta, mostly S); zero-dep toolchain; deferred list |
| 2026-11-19 | `bd3af3` | Media strategy: probe + delegate to content skills (video-storyboard model) |
| 2026-11-19 | `ef1948a` | Probe fallback chain; markitdown lazy document pipeline |
| 2026-11-19 | `def22a5` | Design + progress docs recorded |
| 2026-11-19 | `5c092b2` | M1: CLI scaffold + init/status/digest/uninit; package `ikat-cli` |

## Confirmed (do not re-litigate)

- Layered hybrid index; entries are overlays not full records
- Default local `.ikat/` + `.git/info/exclude`; `--tracked` opts into
  Git-versioned index
- Zero-dependency core: Node ≥ 20, `parseArgs`, ESM single-file bundle
- No model calls inside the CLI; CLI never edits authored text
- Media = probe + delegate; documents = markitdown → cached md → text flow
- Package name: **`ikat-cli`** on npm (`ikat` was taken); bin is `ikat`,
  so `npx ikat-cli@latest init` works

## Implemented in M1

- `ikat init [path] [--tracked] [--no-marker] [-q]` — inventory via
  `git ls-files` (fallback: ignore-list walk) → per-file classify/hash →
  extraction (imports/exports/doc-comment) → specifier resolution →
  rank → `.ikat/{index.json,digest.md,meta.json}` → AGENTS.md marker →
  `.git/info/exclude` (worktree-aware).
- `ikat status [path]` — index freshness vs `HEAD` (exit 2 when stale),
  file counts, digest size.
- `ikat digest` / `ikat uninit` — print digest; full clean removal.
- Language table v1: ts, js, py, go, rs, java, c/c++, rb, php, swift, kt,
  cs, sh. Role classifier: entry/route/service/store/test/config/asset/
  document/generated/src.
- Rank formula v1: `inDegree*3 + log2(size+1)/4 (+4 entry, +0.5 doc,
  ×0.25 low-value roles)`.
- Verified: 44 vitest cases, `tsc --noEmit`, biome clean, tsup build;
  dogfooded on a fixture repo and on this repo itself.

## Open (implementation-time decisions)

- Exact `entries.txt` schema and FRAS field budgets (M3)
- Enrich queue ordering beyond rank (M3)
- tsconfig `paths` / babel alias resolution for JS/TS imports (M2+?)
- Monorepo/multi-root behavior; max-repo performance tuning
- Mermaid draft layout strategy (M4)

## Next action

M2: `ikat file <path>` metadata card + bounded excerpts, `ikat refs <path>`
in/out edges, `ikat sync` incremental hash-drift re-index.
