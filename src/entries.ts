import { promises as fs } from "node:fs";
import type { FileEntry, Role } from "./scan.js";
import { ikatPath } from "./store.js";

/* L1 authored overlay. File format — one line per indexed path:

   src/cli.ts[E8M]: F:responsibility | R:a.ts,b.ts | A:public contract | S:constraint @hash12

   Any subset of F/R/A/S is legal; omitted fields inherit L0 in renders.
   The trailing @hash binds the entry to the index hash it was written
   against — drift is computed, never stored. */

export const FIELD_BUDGET = { F: 140, A: 100, S: 200 } as const;
export const R_MAX = 10;
export const LINE_MAX = 400;

const LAYERS = new Set(["E", "C", "S", "I", "T", "A", "D"]);
const SIZES = new Set(["T", "S", "M", "L"]);
const FIELD_ORDER = ["F", "R", "A", "S"] as const;
export type FieldKey = (typeof FIELD_ORDER)[number];

export interface Tag {
  layer: string;
  importance: number;
  size: string;
}

export interface AuthoredEntry {
  path: string;
  tag: Tag;
  fields: Partial<Record<FieldKey, string>>;
  hash: string;
}

export const ENTRIES_HEADER =
  "# ikat entries — one line per file: path[TAG]: F:..|R:..|A:..|S:.. @hash";

const ROLE_LAYER: Record<Role, string> = {
  entry: "E",
  src: "C",
  route: "C",
  service: "C",
  store: "C",
  test: "T",
  config: "I",
  generated: "I",
  asset: "A",
  document: "D",
};

const sizeTier = (bytes: number): string =>
  bytes < 1024 ? "T" : bytes < 16 * 1024 ? "S" : bytes < 128 * 1024 ? "M" : "L";

/** Deterministic tag when the author didn't supply one: layer from role,
 * importance from rank percentile among extracted files, size tier. */
export function autoTag(entry: FileEntry, all: FileEntry[]): Tag {
  const ranked = all
    .filter((f) => f.lang)
    .map((f) => f.rank)
    .sort((a, b) => a - b);
  let importance = 5;
  if (ranked.length > 1) {
    const pos = ranked.findIndex((r) => r >= entry.rank);
    const p = pos === -1 ? 1 : pos / (ranked.length - 1);
    importance = Math.min(9, Math.max(1, 1 + Math.floor(p * 8)));
  }
  return {
    layer: ROLE_LAYER[entry.role] ?? "S",
    importance,
    size: sizeTier(entry.size),
  };
}

export const tagString = (t: Tag): string =>
  `${t.layer}${t.importance}${t.size}`;

export interface ParsedLine {
  entry: AuthoredEntry | null;
  error: string | null;
}

/** Parse `path[TAG]: F:x | R:y | @hash` (tag and hash optional). */
export function parseEntryLine(line: string): ParsedLine {
  const src = line.trim();
  if (!src || src.startsWith("#")) return { entry: null, error: null };
  const m = /^(\S+?)(?:\[([A-Z])(\d)([A-Z])\])?\s*:\s*(.*)$/.exec(src);
  if (!m) return { entry: null, error: `no "path:" prefix` };
  const [, p, l, i, s, body] = m;
  if (l && (!LAYERS.has(l) || !SIZES.has(s!)))
    return { entry: null, error: `bad tag [${l}${i}${s}]` };
  const hashM = /(?:^|\s)@([0-9a-f]{6,16})\s*$/.exec(body!);
  const fieldSrc = hashM
    ? body!.slice(0, body!.length - hashM[0].length)
    : body!;
  const fields: Partial<Record<FieldKey, string>> = {};
  let lastIdx = -1;
  for (const part of fieldSrc.split("|")) {
    const fm = /^\s*([FRAS])\s*:\s*(.*)$/.exec(part);
    if (!fm)
      return { entry: null, error: `bad field segment "${part.trim()}"` };
    const key = fm[1] as FieldKey;
    const idx = FIELD_ORDER.indexOf(key);
    if (idx <= lastIdx)
      return {
        entry: null,
        error: `fields out of order (${key} after ${FIELD_ORDER[lastIdx]})`,
      };
    if (fields[key]) return { entry: null, error: `duplicate ${key}` };
    lastIdx = idx;
    fields[key] = fm[2]!.trim();
  }
  return {
    entry: {
      path: p!,
      tag: l
        ? { layer: l, importance: Number(i), size: s! }
        : { layer: "?", importance: 0, size: "?" },
      fields,
      hash: hashM ? hashM[1]! : "",
    },
    error: null,
  };
}

export interface Validated extends Omit<AuthoredEntry, "hash"> {
  tag: Tag;
}

/** Contract checks: path indexed, tag letters, budgets, field order,
 * R-targets exist. Never validates the truth of the claims. */
export function validateEntry(
  parsed: Omit<AuthoredEntry, "hash">,
  index: { files: FileEntry[] },
): { ok: Validated | null; errors: string[] } {
  const errors: string[] = [];
  const file = index.files.find((f) => f.path === parsed.path);
  if (!file) errors.push(`path not in index: ${parsed.path}`);
  if (!Object.keys(parsed.fields).length) errors.push("no fields");
  for (const [k, v] of Object.entries(parsed.fields)) {
    const key = k as FieldKey;
    const budget =
      key === "R" ? Infinity : FIELD_BUDGET[key as "F" | "A" | "S"];
    if (v.length > budget)
      errors.push(`${key} exceeds ${budget} chars (${v.length})`);
  }
  if (parsed.fields.R) {
    const targets = parsed.fields.R.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (targets.length > R_MAX)
      errors.push(`R exceeds ${R_MAX} targets (${targets.length})`);
    for (const t of targets) {
      if (t.includes("*")) continue; // globs allowed unchecked
      if (!index.files.some((f) => f.path === t))
        errors.push(`R target not in index: ${t}`);
    }
  }
  const tag =
    parsed.tag.layer === "?" && file ? autoTag(file, index.files) : parsed.tag;
  if (tag.layer === "?" && !file) errors.push("cannot auto-tag unindexed path");
  if (tag.layer !== "?" && (!LAYERS.has(tag.layer) || !SIZES.has(tag.size)))
    errors.push(`bad tag ${tagString(tag)}`);
  return { ok: errors.length ? null : { ...parsed, tag }, errors };
}

/** Serialize for storage (sorted by path). */
export function entryLine(e: AuthoredEntry): string {
  const body = FIELD_ORDER.filter((k) => e.fields[k])
    .map((k) => `${k}:${e.fields[k]}`)
    .join(" | ");
  return `${e.path}[${tagString(e.tag)}]: ${body} @${e.hash}`;
}

export async function readEntries(
  root: string,
): Promise<Map<string, AuthoredEntry>> {
  const map = new Map<string, AuthoredEntry>();
  let text: string;
  try {
    text = await fs.readFile(ikatPath(root, "entries.txt"), "utf8");
  } catch {
    return map;
  }
  for (const line of text.split(/\r?\n/)) {
    const { entry } = parseEntryLine(line);
    if (!entry) continue;
    map.set(entry.path, entry);
  }
  return map;
}

export async function writeEntries(
  root: string,
  entries: Map<string, AuthoredEntry>,
): Promise<void> {
  const lines = [ENTRIES_HEADER];
  for (const e of [...entries.values()].sort((a, b) =>
    a.path.localeCompare(b.path),
  ))
    lines.push(entryLine(e));
  await fs.mkdir(ikatPath(root, ""), { recursive: true });
  await fs.writeFile(ikatPath(root, "entries.txt"), `${lines.join("\n")}\n`);
}

/** fresh = hash matches current index; stale = bound to an older hash. */
export function entryState(
  e: AuthoredEntry,
  index: { files: FileEntry[] },
): "fresh" | "stale" | "orphan" {
  const file = index.files.find((f) => f.path === e.path);
  if (!file) return "orphan";
  return file.hash === e.hash ? "fresh" : "stale";
}
