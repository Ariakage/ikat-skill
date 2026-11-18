# ikat

Low-token repository orientation for coding agents. `ikat` builds a
**deterministic, local index** of your repo — file roles, import graph,
doc-comments, media metadata — then renders a bounded `digest.md` an
agent reads first instead of re-scanning the tree. No model calls, no
daemon, no network. Everything in the index is measured evidence.

```
$ npx ikat-cli@latest init

ikat 0.1.0 · /repo
files  · 626 (source 338 · test 100 · config 41 · asset 20 · document 127)
edges  · 678 internal · 132 external
digest · .ikat/digest.md (6.2 KB)
marker · appended
ignore · .git/info/exclude added
```

## Install & run

```bash
npx ikat-cli@latest init          # index the current repo (zero install)
npm i -g ikat-cli                 # or install globally → `ikat init`
```

Requires Node ≥ 20. Zero runtime dependencies.

## What it produces

```
.ikat/
├── index.json      # L0 store: every file's role/lang/hash/imports/exports/doc/rank
├── digest.md       # bounded orientation doc — agents read this first (~500–3.5k tokens)
├── entries.txt     # L1 overlay: agent-authored FRAS lines, hash-bound
├── diagram.mmd     # Mermaid baseline (written only by `diagram --draft`)
├── converted/      # markitdown conversion cache, keyed by source hash
└── meta.json       # tool version, HEAD, stats, probe environment
```

`.ikat/` is added to `.git/info/exclude` by default (local-only index).
`ikat init --tracked` skips that so the index can be committed and shared.

## Commands

| Command | What it does |
|---|---|
| `ikat init [path]` | Build the index + digest + AGENTS.md marker. `--tracked` git-versions `.ikat/`; `--no-marker` skips the marker; `-q` quiet |
| `ikat status [path]` | Freshness vs `HEAD`, counts, coverage. `--json` for scripts. Stale = exit 0 (a state, not an error) |
| `ikat digest [path]` | Print the rendered digest |
| `ikat file <path>` | Metadata card + bounded excerpt. `--lines a-b`, `--full`. Binaries get a probe card, not a byte dump |
| `ikat refs <path>` | Outgoing imports / external packages / incoming references. `--json` |
| `ikat sync [path]` | Incremental refresh: unchanged files (size+mtime) are reused, edges re-resolve globally, orphaned entries dropped |
| `ikat put <path>` | Store an authored entry (`--entry "S:…"` or stdin `path[TAG]: F|R|A|S`). Binds the live file hash |
| `ikat enrich [path]` | Ranked queue of files missing entries — recency- and coverage-aware. `--limit`, `--only-stale`, `--json` |
| `ikat diagram [--draft]` | Print current `.mmd`; `--draft` regenerates the deterministic Mermaid baseline (your edits survive — only `--draft` overwrites) |
| `ikat convert <path>` | Document → Markdown via markitdown, cached by hash. Falls back to `uvx markitdown` |
| `ikat doctor` | Verify optional tools actually run (not just on PATH). `--json` |
| `ikat uninit [path]` | Remove `.ikat/`, the AGENTS marker, and the exclude entry — fully reversible |

## The two-layer model

**L0 — measured (free).** The CLI scans inventory (`git ls-files`), then
per file: role classification, sha1, and a per-language regex pass that
pulls imports/exports/doc-comments. Specifiers resolve against the real
file set — NodeNext `.js`→`.ts`, Python dots, Rust `crate`/`self`/`super`
+ stem-dirs, workspace package names (`@scope/pkg` → `packages/pkg` via
`exports`), and tsconfig `paths` aliases. Nothing is inferred a model
could do better for free.

**L1 — authored (agent's tokens go here).** Agents write one line per
file in `entries.txt`:

```
src/session.ts[XIS]: F:..|R:..|A:..|S:.. @hash12
```

Any field subset is legal — F (function) and A (contract) are usually
already covered by extracted doc/exports, so the real delta is **S**:
constraints the code can't tell you. Lines bind to the file hash; drift
marks entries `stale` but never deletes them. The CLI validates
structure and provenance — it never edits your text. Validation ≠
correctness: it guarantees the contract, not the claim.

`digest.md` merges both layers: fresh entry-F overrides the extracted
doc, coverage is reported honestly (`entries 3/12 fresh (25%)`).

## Media & documents

- **Probe chain**: builtin magic bytes → `file` → `ffprobe` →
  `exiftool`/`pdfinfo` → extension floor. Missing tools degrade, never
  fail. `media.tool` records the deepest level used.
- **Delegation, not interpretation**: audio/video → a content skill,
  images → the host's vision. ikat says *what and where*, never *what's
  in it* — it does not OCR, transcribe, or describe media.
- **Documents** (pdf/docx/xlsx/pptx/epub/html/ipynb): `ikat convert`
  runs [markitdown](https://github.com/microsoft/markitdown) lazily and
  caches by hash; converted docs become normal text in the pipeline.
- Sidecars are detected free: `clip.mp4` next to `clip.srt`/`clip.md`
  shows up on its card.

Run `ikat doctor` to see which optional tools your environment actually
executes — it probes with `--version`, not just PATH presence.

## Diagrams

`ikat diagram --draft` writes a deterministic `flowchart LR` baseline:
top-ranked modules as nodes (directory clusters), real resolved imports
as edges — every edge has evidence; nothing is invented. It's meant to
be *edited*: keep the evidence, fix the labels. If `mmdc` (Mermaid CLI)
is installed you can render it; ikat never installs tools itself.

## Performance

Measured on this machine (warm cache):

| repo | files | `init` | `sync` (no-op) | internal edges |
|---|---|---|---|---|
| ikat-skill | 45 | 0.098 s | 0.076 s | 105 |
| soyo-harness | 626 | 0.23 s | 0.088 s | 678 |
| opencode | 11,575 | **2.8 s** | 0.32 s | 26,884 |

`sync` reuses unchanged entries by size+mtime — ~9× cheaper than cold
init at 11.5k files. Probing batches external tool calls instead of
spawning one process per asset.

## Boundaries

- No model calls inside the CLI. Ever.
- Index = evidence, not a truth oracle. Stale is shown, never hidden.
- The CLI validates entry format and hash binding; authored text is
  yours to own.

## Development

```bash
pnpm install
pnpm test          # vitest
pnpm typecheck     # tsc --noEmit
pnpm lint          # biome
pnpm build         # tsup → dist/cli.js
node dist/cli.js init /some/repo
```

Design decisions live in `docs/design.md`, milestone state in
`docs/progress.md`, and the agent-facing contract in `SKILL.md`.

## License

MIT
