# ikat — Progress

Current phase: **v1 complete — M5 done + real-repo acceptance (soyo-harness,
626 files) passed**.
Working contract: `SKILL.md` · Decision record: `docs/design.md`

## Milestones

- [x] **M1 — skeleton end-to-end**: `init` + inventory + extraction +
  `index.json` + `digest.md` render + AGENTS.md marker. L0 usable.
- [x] **M2 — drill-down + drift**: `file` / `refs` / `status` / `sync`,
  hash-based staleness.
- [x] **M3 — entries**: `entries.txt` store, `put` / `enrich` validation,
  merged digest render.
- [x] **M4 — diagram**: `diagram --draft` baseline + marker/docs polish.
- [x] **M5 — formats + hardening**: media probe chain, markitdown pipeline,
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
| 2026-11-19 |  `16898df` | M2: file/refs/sync/status --json; index stores specs+mtime for incremental reuse |
| 2026-11-19 | `5f43d23` | M3: entries.txt store + put/enrich + merged digest; live-hash binding |
| 2026-11-19 | `6d3555a` | M4: diagram --draft writes .ikat/diagram.mmd (ranked nodes, dir clusters, import edges) |
| 2026-11-19 | `207b3f6` | M5: probe fallback chain + convert (markitdown/uvx) + doctor --verify |
| 2026-11-19 | `5bbd772` | Rust resolver: anchors, pub use, stem-dir modules (soyo-harness acceptance) |
| 2026-11-19 | `8913325` | Diagram: connected-component growth + cap (0→34 edges on soyo-harness) |
| 2026-11-19 | `aa96042` | digest `(none)` label; `.temp/` ignored |

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

## Implemented in M2

- `ikat file <path>` — metadata card (role/lang/size/hash/rank/doc/
  exports/imports/imported-by) + line-numbered excerpt (default 100,
  `--lines a-b`, `--full` ≤4000) + near-match suggestions.
- `ikat refs <path>` — out/in/ext edge listing; `--json`.
- `ikat sync` — incremental: entries with unchanged size+mtime are reused
  verbatim (raw `specs` persist in index.json so edges re-resolve without
  re-reading); reports unchanged/refreshed/added/removed.
- `ikat status --json` — machine-readable meta; stale now exits 0 per
  contract (2 = misuse only). Old-format detection included.
- `index.json` entries gained `mtime` + `specs` (additive, format stays 1;
  spec-less old entries rebuild once on first sync).
- Verified: 54 vitest cases incl. tmp-repo integration tests; dogfooded
  on this repo (31→1 refreshed drift detection, edge re-resolution).

## Implemented in M3

- `.ikat/entries.txt` — one line per file:
  `path[TAG]: F:..|R:..|A:..|S:.. @hash12`; any field subset legal;
  comments/blank lines skipped; sorted output.
- `ikat put <path> --entry "S:…"` (or stdin lines `path[TAG]: fields`) —
  validates path-in-index, tag letters, field order F→R→A→S, budgets
  (F≤140/A≤100/S≤200/R≤10 targets/line≤400), literal R-target existence
  (globs pass unchecked); binds the **live file hash**, warning when the
  index is stale; re-renders digest on store.
- `ikat enrich [--limit n] [--only-stale] [--json]` — ranked queue of
  files missing a fresh entry; auto-tag preview `path [E8M]`; stale rows
  flagged.
- Auto-tag: layer from role (E/C/S/I/T/A/D), importance from rank
  percentile 1–9, size tier T/S/M/L — authors may still write explicit
  `[XIS]` tags.
- Digest merge: `## Entries` section (top 15 ranked, stale flagged),
  Core lines use entry-F override over doc, Coverage reports
  `entries: fresh/total (pct)`.
- `ikat status` reports `entries X/Y fresh (Z%)`; `--json` includes it.
- `ikat sync` drops orphaned entries (file gone) and reports the count;
  stale is computed, never stored.
- Verified: 69 vitest cases incl. parse/validate/tag/state units and
  put→enrich→sync→status integration on tmp repos; dogfooded on this
  repo (entries 3/3 fresh 100%).

## Implemented in M4

- `ikat diagram --draft` writes `.ikat/diagram.mmd`: `flowchart LR`,
  nodes = top-24 ranked files of diagram-worthy roles
  (entry/route/service/store/src — tests/config/assets/docs excluded),
  clustered by parent directory into subgraphs, root files unclustered,
  labels = fresh entry F > doc > filename (path always shown), edges =
  resolved imports between shown nodes only (caller owns the edge).
- `ikat diagram` (no flag) prints the current `.mmd`; missing →
  exit 1 with a `--draft` hint. `meta.json` tracks `diagramBytes`.
- `diagram.mmd` is a render: `--draft` regenerates; agent edits live in
  the same file and are only overwritten by an explicit `--draft`.
- Verified: 74 vitest cases incl. diagram unit tests (clustering, edge
  filtering, label precedence, escaping, node cap); dogfooded on this
  repo — 22 nodes / 68 edges / 2 clusters.

## Implemented in M5

- Probe fallback chain (`src/probe.ts`): builtin magic bytes (20
  signatures incl. ftyp brand refine) + PNG/GIF/JPEG/WebP dims + ZIP
  central-dir member list — all zero-dep — then optional `ffprobe`
  (duration/dims/codec), `pdfinfo` (pages/title), `exiftool` (image dims
  fallback), `file -b` (type line), floor = format+size. `media.tool`
  records the deepest level used; sidecars (`.md/.txt/.srt`) detected
  from the repo file set.
- `conv` state on convertible docs (`CONVERT_EXTS` = DOCUMENT_EXTS +
  `.zip`): `pending` at index; `ikat convert` runs `markitdown`, falling
  back to `uvx markitdown` when the PATH shim is broken (stderr
  discloses the fallback). Output cached at
  `.ikat/converted/<path>.md` + `<path>.meta.json` (source hash, tool,
  bytes, truncated flag); >64 MB source → `too-large`, >500 KB md →
  truncated + marker. Fresh-cache hit is a no-op.
- `ikat file`: binaries show a probe card (format/dims/duration/codec/
  pages/members/sidecars/tool) + delegation hint (A/V → content skill,
  image → host vision); converted docs excerpt the cached Markdown;
  `.md`/`.txt` files now excerpt correctly (they have no lang but are
  readable).
- `ikat doctor` verifies tools actually run (`--version` probes), not
  just PATH presence — a broken shim reports `! BROKEN` and exits 1
  (this caught a real broken markitdown install during dev). `--json`
  for scripting. video-storyboard skill detected across
  `~/.agents`/`~/.claude`/`~/.codex` skill dirs incl. plugin `--` names.
- `meta.probe` records which tools were on PATH at index time; digest
  Coverage gains `media: N probed (tools) · docs: X converted, Y pending`.
- Verified: 83 vitest cases incl. probe units (magic/dims/zip central
  dir) and command integration; dogfooded on a media fixture —
  ffprobe card `320x240 · 2s · h264`, sidecars, zip members, uvx
  fallback converting real HTML.

## Acceptance — soyo-harness (626 files, Rust workspace + desktop)

Cloned `Ariakage/soyo-harness` into `.temp/` and ran the full workflow.
Findings and fixes:

- `init`: 626 files in ~0.27 s; `sync` (no-op) ~0.10 s. Marker appended
  cleanly after the repo's existing AGENTS.md content.
- **Rust resolver was the biggest gap.** `use` extraction missed
  `pub use`; `crate::`/`self::`/`super::` were labelled external; and
  stem-dir modules (`credentials.rs` + `credentials/file.rs`) were
  unreachable. Fixes: broader import regex (pub use), anchor-aware
  resolver (`crate`→crate-root, `self`/`super`→relative, brace-tail
  normalization), stem-dir candidate paths, and unresolved
  internal-style paths now return `null` instead of a false `external`
  label. Internal edges 315 → **678**, external labels 213 → 132.
- `//!` inner doc comments kept the `!` — now stripped in `extractDoc`.
- `refs crates/soyo-core/src/lib.rs`: 47 out / 1 ext / 140 in — the
  hub picture is correct.
- `enrich` produced a plausible queue (`[E9S]` lib.rs, runtime, mcp…)
  with clean doc-derived labels.
- **Diagram node selection needed rework.** Top-rank alone picked a
  disconnected set → 0 edges. Iterated: top-60 pool still 1 edge;
  connected greedy growth flooded 24 slots with one frontend
  component. Final: seed by rank, grow the frontier only (per-component
  cap 10), start a new component on exhaustion. Result:
  24 nodes / 34 edges / 7 clusters — credentials hub, mcp tree, and the
  desktop `sanitize.ts` fan-in all visible. `lib.rs` still misses the
  cut (ranked below the frontier seeds); acceptable for a draft
  baseline, agent edits anyway.
- `.gitignore` gained `.temp/` so acceptance fixtures stay out of the
  repo.

## Acceptance — opencode (11,575 files, TS monorepo)

Second real-repo pass, ~18× larger:

- `init`: 11,575 files in **21.6 s** (~536 files/s), 15,745 internal
  edges, 341 external packages, digest 13.8 KB / ≈3.5k tokens.
- `sync` (no-op): **0.47 s** — size+mtime reuse holds at scale;
  incremental path is ~46× cheaper than cold init.
- `refs packages/ai/src/effect.ts`: 21 out / 0 ext / **185 in** — the
  barrel-hub picture is honest (test fan-in dominates).
- `enrich` top of queue plausible (`effect.ts [C9S]`,
  `schema/index.ts [E8T]`).
- `diagram --draft`: 24 nodes / 15 edges / 14 clusters — weaker than
  soyo-harness: on a monorepo this size the frontier seeds scatter
  across packages before hubs form. Known limitation, acceptable for a
  draft.
- **Perf observation**: per-file cost grows with repo size
  (626 f/0.41 s ≈ 1.5k f/s → 11.6k f/21.6 s ≈ 0.54k f/s) — superlinear
  somewhere (probe/exec or edge passes). Fine for a one-time init;
  profiled tuning is an open item.
- Measurement set (this machine, warm cache): ikat-skill 43 f / 0.084 s
  init / 0.080 s sync · soyo-harness 626 f / 0.413 s / 0.090 s ·
  opencode 11,575 f / 21.594 s / 0.468 s. Charts generated
  (`/tmp/ikat-perf-*.png`).

## Open (implementation-time decisions)

- Enrich queue ordering beyond rank (subsystem focus, git-recent)
- tsconfig `paths` / babel alias resolution for JS/TS imports (M2+?)
- Monorepo/multi-root behavior; max-repo performance tuning
- Entry-layer clustering option for diagram draft (currently directory)
- Diagram: highest-rank `lib.rs` can still lose to frontier seeds —
  consider a floor guaranteeing the top-N ranked nodes a slot; on
  >10k-file monorepos seeds scatter across packages (15 edges @ opencode)
- Perf: profile the superlinear per-file cost at scale (~1.9 ms/file on
  opencode vs ~0.66 ms on soyo-harness); likely probe exec or an O(n)
  pass per file

## Next action

Publish-readiness pass: npm metadata/bin wiring, README, `--tracked`
end-to-end check, large-repo perf smoke. The v1 CLI surface is
feature-complete against SKILL.md.
