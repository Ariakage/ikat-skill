# ikat — Progress

Current phase: **spec converged, implementation not started**.
Working contract: `SKILL.md` · Decision record: `docs/design.md`

## Milestones

- [ ] **M1 — skeleton end-to-end**: `init` + inventory + extraction +
  `index.json` + `digest.md` render + AGENTS.md marker. L0 usable.
- [ ] **M2 — drill-down + drift**: `file` / `refs` / `status` / `sync`,
  hash-based staleness.
- [ ] **M3 — entries**: `entries.txt` store, `put` / `enrich` validation,
  merged digest render.
- [ ] **M4 — diagram**: `diagram --draft` baseline + marker/docs polish.
- [ ] **M5 — formats + hardening**: media probe chain, markitdown pipeline,
  `--tracked` mode, doctor, tests.

## Decision log

| Date | Commit | What |
|---|---|---|
| 2026-11-19 | `be562f4` | Repo initialized: AGENTS.md conventions |
| 2026-11-19 | `1170ef0` | SKILL.md draft: init/orient/diagram workflow (gitdiagram + codegraph model) |
| 2026-11-19 | `1c1cf42` | Layered index confirmed: L0 skeleton + L1 agent FRAS (aoci model); local `.ikat/` + `--tracked` |
| 2026-11-19 | `8cbbf42` | Entries converge to overlays (author the delta, mostly S); zero-dep toolchain; deferred list |
| 2026-11-19 | `bd3af3` | Media strategy: probe + delegate to content skills (video-storyboard model) |
| 2026-11-19 | `ef1948a` | Probe fallback chain; markitdown lazy document pipeline |

## Confirmed (do not re-litigate)

- Layered hybrid index; entries are overlays not full records
- Default local `.ikat/` + `.git/info/exclude`; `--tracked` opts into
  Git-versioned index
- Zero-dependency core: Node ≥ 20, `parseArgs`, ESM single-file bundle
- No model calls inside the CLI; CLI never edits authored text
- Media = probe + delegate; documents = markitdown → cached md → text flow

## Open (before/during implementation)

- Package name availability on npm (`ikat` may be taken — check first)
- Import-extraction language table for v1 (regex per language; ts/js/py/go/
  rs first)
- Exact `index.json` / `entries.txt` schemas
- Rank formula weights; enrich queue ordering
- Whether `.devin/` or root placement for skill development here (repo IS
  the skill — SKILL.md at root is deliberate)

## Next action

Scaffold `package.json` + `tsconfig` + `src/cli.ts` with `init`/`status`
stubs (M1), if the user approves.
