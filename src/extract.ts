import { promises as fs } from "node:fs";
import path from "node:path";
import type { DocStyle, LangSpec } from "./langs.js";

const DOC_MAX = 400;
const MAX_LIST = 64;

const firstPara = (s: string): string =>
  s
    .split(/\n\s*\n/)[0]!
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, DOC_MAX);

/** File-top comment/docstring, flattened to one line. */
export function extractDoc(text: string, style: DocStyle): string | null {
  const head = text.slice(0, 16_000);
  const lines = head.split(/\r?\n/);
  if (style === "prose") {
    const buf: string[] = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) {
        if (buf.length) break;
        continue;
      }
      if (/^(#|[!<[`]|\[!\[|>|={3,}|-{3,})/.test(line)) continue;
      buf.push(line);
      if (buf.join(" ").length > DOC_MAX) break;
    }
    return buf.length ? firstPara(buf.join("\n")) : null;
  }
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const t = line.trim();
    if (!t || t.startsWith("#!")) {
      i++;
      continue;
    }
    if (style === "slash") {
      if (t.startsWith("/*")) {
        const buf: string[] = [];
        let j = i;
        let body = line.slice(line.indexOf("/*") + 2);
        while (true) {
          const end = body.indexOf("*/");
          buf.push(end === -1 ? body : body.slice(0, end));
          if (end !== -1 || ++j >= lines.length) break;
          body = lines[j]!;
        }
        const cleaned = buf
          .map((l) => l.replace(/^\s*\*\s?/, "").trim())
          .join("\n")
          .trim();
        return cleaned ? firstPara(cleaned) : null;
      }
      if (t.startsWith("//")) {
        const buf: string[] = [];
        while (i < lines.length && lines[i]!.trim().startsWith("//")) {
          buf.push(lines[i]!.trim().replace(/^\/\/+[!/]?\s?/, ""));
          i++;
        }
        const cleaned = buf.join("\n").trim();
        return cleaned ? firstPara(cleaned) : null;
      }
      return null;
    }
    if (style === "hash") {
      if (!t.startsWith("#")) return null;
      const buf: string[] = [];
      while (i < lines.length && lines[i]!.trim().startsWith("#")) {
        buf.push(lines[i]!.trim().replace(/^#+\s?/, ""));
        i++;
      }
      const cleaned = buf.join("\n").trim();
      return cleaned ? firstPara(cleaned) : null;
    }
    if (style === "docstring") {
      if (t.startsWith("#")) {
        i++;
        continue;
      }
      const m = /^(?:[rubf]*)("""|''')/i.exec(t);
      if (!m) return null;
      const quote = m[1]!;
      const rest = t.slice(m[0].length);
      const joined = rest.includes(quote)
        ? rest.slice(0, rest.indexOf(quote))
        : `${rest}\n${lines
            .slice(i + 1, i + 80)
            .join("\n")
            .split(quote)[0]!}`;
      const cleaned = joined.trim();
      return cleaned ? firstPara(cleaned) : null;
    }
    return null;
  }
  return null;
}

function matchesAll(re: RegExp, text: string, group = 1): string[] {
  const out: string[] = [];
  re.lastIndex = 0;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    const g = m[group];
    if (g) out.push(g);
  }
  return out;
}

/** Raw module specifiers as written in source. */
export function extractImportSpecs(text: string, lang: LangSpec): string[] {
  const specs: string[] = [];
  for (const rule of lang.imports) {
    if ("block" in rule) {
      for (const b of matchesAll(rule.block, text))
        specs.push(...matchesAll(rule.item, b));
    } else {
      specs.push(...matchesAll(rule.re, text));
    }
  }
  return [...new Set(specs)].slice(0, MAX_LIST);
}

export function extractExports(text: string, lang: LangSpec): string[] {
  const names: string[] = [];
  for (const rule of lang.exports ?? []) {
    for (const hit of matchesAll(rule.re, text)) {
      if (rule.list) {
        for (const part of hit.split(",")) {
          const t = part.trim();
          if (!t) continue;
          const as = /\s+as\s+(\w+)$/.exec(t);
          names.push(as ? as[1]! : t.split(/\s+/)[0]!);
        }
      } else {
        names.push(hit.trim());
      }
    }
  }
  return [...new Set(names)].filter(Boolean).slice(0, MAX_LIST);
}

/* ---------- import resolution ---------- */

export interface WsPkg {
  dir: string;
  main?: string | undefined;
  exports?: Record<string, unknown> | undefined;
}

export interface TsPaths {
  dir: string;
  baseUrl: string;
  paths: Record<string, string[]>;
}

export interface ResolveCtx {
  fileSet: Set<string>;
  dirSet: Set<string>;
  /** basename → repo paths (for C-style include suffix resolution) */
  suffix: Map<string, string[]>;
  /** workspace package name → dir/exports (monorepo self-imports) */
  pkgs?: Map<string, WsPkg>;
  /** tsconfig/jsconfig paths tables, deepest dir first */
  tsconfigs?: TsPaths[];
}

/** Normalize a repo-relative posix path (resolve . and .., drop dup slashes). */
export function norm(p: string): string {
  const parts = p.split("/").filter((s) => s && s !== ".");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

const dirname = (p: string): string =>
  p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
const base = (p: string): string => p.slice(p.lastIndexOf("/") + 1);

export function buildResolveCtx(paths: string[]): ResolveCtx {
  const fileSet = new Set(paths);
  const dirSet = new Set<string>();
  const suffix = new Map<string, string[]>();
  for (const p of paths) {
    let d = dirname(p);
    while (d && !dirSet.has(d)) {
      dirSet.add(d);
      d = dirname(d);
    }
    const b = base(p);
    const arr = suffix.get(b) ?? [];
    arr.push(p);
    suffix.set(b, arr);
  }
  return { fileSet, dirSet, suffix };
}

const hit = (ctx: ResolveCtx, candidates: (string | null)[]): string | null => {
  for (const c of candidates) if (c && ctx.fileSet.has(c)) return c;
  return null;
};

/* ---------- workspace + tsconfig-paths resolution ---------- */

/** Strip // and /* *\/ comments while preserving string literals —
 * enough JSONC tolerance for tsconfig files. */
const stripJsonComments = (s: string): string =>
  s.replace(/"(?:[^"\\]|\\.)*"|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m) =>
    m.startsWith("/") ? "" : m,
  );

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Load workspace package.json names/exports and tsconfig paths tables
 * into the ctx — the deterministic half of JS/TS alias resolution. */
export async function augmentResolveCtx(
  root: string,
  ctx: ResolveCtx,
): Promise<void> {
  const pkgs = new Map<string, WsPkg>();
  const tsconfigs: TsPaths[] = [];
  const readJson = async (rel: string): Promise<unknown | null> => {
    try {
      return JSON.parse(
        stripJsonComments(
          await fs.readFile(path.join(root, rel), "utf8"),
        ).replace(/,(\s*[}\]])/g, "$1"),
      );
    } catch {
      return null;
    }
  };
  for (const p of ctx.fileSet) {
    if (p.endsWith("/package.json") || p === "package.json") {
      const j = await readJson(p);
      if (!isObj(j) || typeof j.name !== "string") continue;
      pkgs.set(j.name, {
        dir: dirname(p),
        main: typeof j.main === "string" ? j.main : undefined,
        exports: isObj(j.exports) ? j.exports : undefined,
      });
    } else if (/(^|\/)(ts|js)config[^/]*\.json$/.test(p)) {
      const j = await readJson(p);
      if (!isObj(j) || !isObj(j.compilerOptions)) continue;
      const co = j.compilerOptions;
      const paths: Record<string, string[]> = {};
      if (isObj(co.paths)) {
        for (const [k, v] of Object.entries(co.paths)) {
          const arr = Array.isArray(v) ? v : [v];
          paths[k] = arr.filter((t): t is string => typeof t === "string");
        }
      }
      const baseUrl = typeof co.baseUrl === "string" ? co.baseUrl : ".";
      if (Object.keys(paths).length || baseUrl !== ".")
        tsconfigs.push({ dir: dirname(p), baseUrl, paths });
    }
  }
  tsconfigs.sort((a, b) => b.dir.length - a.dir.length);
  ctx.pkgs = pkgs;
  ctx.tsconfigs = tsconfigs;
}

/** Deepest string leaf of an exports value (conditional objects: take
 * the first branch deterministically rather than guessing conditions). */
const firstStringLeaf = (v: unknown): string | null => {
  if (typeof v === "string") return v;
  if (isObj(v)) {
    for (const val of Object.values(v)) {
      const s = firstStringLeaf(val);
      if (s) return s;
    }
  }
  return null;
};

/** Resolve a "./sub" subpath against a package.json exports map —
 * exact keys first, then single-* pattern substitution. */
const exportsTarget = (
  exp: Record<string, unknown>,
  sub: string,
): string | null => {
  if (sub in exp) return firstStringLeaf(exp[sub]);
  for (const [k, v] of Object.entries(exp)) {
    const i = k.indexOf("*");
    if (i === -1) continue;
    const [pre, post] = [k.slice(0, i), k.slice(i + 1)];
    if (!sub.startsWith(pre) || !sub.endsWith(post)) continue;
    const t = firstStringLeaf(v);
    if (t)
      return t.replaceAll("*", sub.slice(pre.length, sub.length - post.length));
  }
  return null;
};

/** spec `@scope/pkg/sub` → file inside the workspace package dir. */
const resolveWorkspace = (spec: string, ctx: ResolveCtx): string | null => {
  if (!ctx.pkgs?.size) return null;
  let best: { name: string; pkg: WsPkg } | null = null;
  for (const [name, pkg] of ctx.pkgs) {
    if (
      (spec === name || spec.startsWith(`${name}/`)) &&
      (!best || name.length > best.name.length)
    )
      best = { name, pkg };
  }
  if (!best) return null;
  const rest = spec === best.name ? "" : spec.slice(best.name.length + 1);
  const dir = best.pkg.dir;
  if (best.pkg.exports) {
    const target = exportsTarget(best.pkg.exports, rest ? `./${rest}` : ".");
    if (target) {
      const t = norm(`${dir}/${target}`);
      const f =
        hit(ctx, [t]) ??
        hit(ctx, withExts(t.replace(/\.(mjs|cjs|js|jsx)$/, ""), JS_EXTS));
      if (f) return f;
    }
  }
  if (!rest) {
    if (best.pkg.main) {
      const f = hit(ctx, withExts(norm(`${dir}/${best.pkg.main}`), JS_EXTS));
      if (f) return f;
    }
    return (
      hit(ctx, withExts(`${dir}/index`, JS_EXTS)) ??
      hit(ctx, withExts(`${dir}/src/index`, JS_EXTS))
    );
  }
  return hit(ctx, [
    ...withExts(`${dir}/src/${rest}`, JS_EXTS),
    ...withExts(`${dir}/${rest}`, JS_EXTS),
  ]);
};

/** spec `@/lib/x` → file via the nearest covering tsconfig paths table. */
const resolveTsPaths = (
  spec: string,
  fromDir: string,
  ctx: ResolveCtx,
): string | null => {
  for (const tc of ctx.tsconfigs ?? []) {
    if (tc.dir && fromDir !== tc.dir && !fromDir.startsWith(`${tc.dir}/`))
      continue;
    const baseDir = norm(tc.dir ? `${tc.dir}/${tc.baseUrl}` : tc.baseUrl);
    for (const [pat, targets] of Object.entries(tc.paths)) {
      const i = pat.indexOf("*");
      let suffix: string | null = null;
      if (i === -1) {
        if (spec === pat) suffix = "";
        else continue;
      } else {
        const [pre, post] = [pat.slice(0, i), pat.slice(i + 1)];
        if (!spec.startsWith(pre) || !spec.endsWith(post)) continue;
        suffix = spec.slice(pre.length, spec.length - post.length);
      }
      for (const t of targets) {
        const cand = norm(`${baseDir}/${t.replaceAll("*", suffix)}`);
        const f = hit(ctx, withExts(cand, JS_EXTS));
        if (f) return f;
      }
    }
  }
  return null;
};

/** Unique suffix match: basename of spec has exactly one candidate whose
 * path ends with the spec. Avoids wrong guesses in forked trees. */
const suffixHit = (ctx: ResolveCtx, spec: string): string | null => {
  const cands = (ctx.suffix.get(base(spec)) ?? []).filter(
    (p) => p === spec || p.endsWith(`/${spec}`),
  );
  return cands.length === 1 ? cands[0]! : null;
};

const JS_EXTS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".d.ts",
];
const withExts = (stem: string, exts: string[]): string[] => [
  stem,
  ...exts.map((e) => stem + e),
  ...exts.map((e) => `${stem}/index${e}`),
];

export type Resolved = { internal: string } | { external: string } | null;

const pkgName = (spec: string): string =>
  spec.startsWith("@")
    ? spec.split("/").slice(0, 2).join("/")
    : spec.split("/")[0]!;

type Resolver = (
  spec: string,
  fromDir: string,
  ctx: ResolveCtx,
  fromFile?: string,
) => Resolved;

const resolveJsLike = (exts: string[]): Resolver => {
  return (spec, fromDir, ctx) => {
    if (spec.startsWith(".") || spec.startsWith("/")) {
      const stem = norm(spec.startsWith("/") ? spec : `${fromDir}/${spec}`);
      // NodeNext convention: `import "./x.js"` may point at `x.ts` on disk.
      const stemTs = stem.replace(/\.(mjs|cjs|js|jsx)$/, "");
      const found =
        hit(ctx, withExts(stem, exts)) ??
        (stemTs !== stem ? hit(ctx, withExts(stemTs, exts)) : null);
      return found ? { internal: found } : null;
    }
    if (spec.startsWith("node:")) return { external: spec };
    const aliased =
      resolveWorkspace(spec, ctx) ?? resolveTsPaths(spec, fromDir, ctx);
    if (aliased) return { internal: aliased };
    if (!/^[\w-]+$/.test(spec)) {
      const f = suffixHit(ctx, spec);
      return f ? { internal: f } : { external: pkgName(spec) };
    }
    return { external: pkgName(spec) };
  };
};

const resolvePy: Resolver = (spec, fromDir, ctx) => {
  const dots = /^\.*/.exec(spec)![0].length;
  const rest = spec.slice(dots).replace(/\./g, "/");
  const relBase = dots
    ? norm(`${fromDir}${"/..".repeat(Math.max(dots - 1, 0))}`)
    : "";
  const roots = dots ? [relBase] : ["", fromDir];
  for (const root of roots) {
    const stem = norm(root ? `${root}/${rest}` : rest);
    const found = hit(ctx, [
      stem + ".py",
      stem + ".pyi",
      stem + "/__init__.py",
      stem,
    ]);
    if (found) return { internal: found };
  }
  return dots ? null : { external: spec.split(".")[0]! };
};

const resolveGo: Resolver = (spec, _fromDir, ctx) => {
  const p = norm(spec);
  if (ctx.dirSet.has(p)) return { internal: `${p}/` };
  const f = hit(ctx, [p + ".go", p + "/main.go"]);
  if (f) return { internal: f };
  if (/^\.\.?\/|^[\w-]+$/.test(spec)) {
    const s = suffixHit(ctx, p);
    if (s) return { internal: s };
  }
  const first = spec.split("/")[0]!;
  return { external: first.includes(".") ? spec : first };
};

/** Deepest ancestor dir containing lib.rs/main.rs = the crate root for
 * `crate::` paths (workspace-aware; src/ fallback for exotic layouts). */
const crateRoot = (fromDir: string, ctx: ResolveCtx): string => {
  const parts = fromDir.split("/");
  for (let i = parts.length; i > 0; i--) {
    const d = parts.slice(0, i).join("/");
    if (ctx.fileSet.has(`${d}/lib.rs`) || ctx.fileSet.has(`${d}/main.rs`))
      return d;
  }
  return "src";
};

const resolveRs: Resolver = (spec, fromDir, ctx, fromFile) => {
  // `use a::{b, c}` captures "a::" — drop the brace tail; `mod x;` → "x"
  const segs = spec.replace(/:+$/, "").split("::").filter(Boolean);
  if (!segs.length) return { external: spec };
  const head = segs[0]!;
  if (["std", "core", "alloc"].includes(head)) return { external: head };

  // Rust 2018 layout: `foo.rs` + sibling `foo/` dir — self:: and bare
  // paths look into the stem dir (credentials.rs → credentials/file.rs)
  const stem = fromFile ? base(fromFile).replace(/\.rs$/, "") : "";
  const selfDir =
    stem && !["mod", "lib", "main"].includes(stem)
      ? `${fromDir}/${stem}`
      : fromDir;

  let anchor = "";
  let rest = segs;
  if (head === "crate") {
    anchor = crateRoot(fromDir, ctx);
    rest = segs.slice(1);
  } else if (head === "self") {
    anchor = selfDir;
    rest = segs.slice(1);
  } else if (head === "super") {
    anchor = dirname(fromDir);
    rest = segs.slice(1);
  }
  while (rest[0] === "super") {
    anchor = dirname(anchor) || anchor;
    rest = rest.slice(1);
  }
  if (anchor && !rest.length) {
    // `use crate::{..}` / `use super::{..}` — symbols of the root module
    const rootFile = hit(ctx, [
      `${anchor}/lib.rs`,
      `${anchor}/main.rs`,
      `${anchor}/mod.rs`,
    ]);
    if (rootFile) return { internal: rootFile };
  }
  const p = rest.join("/");
  const found = hit(ctx, [
    ...(anchor && p ? [`${anchor}/${p}.rs`, `${anchor}/${p}/mod.rs`] : []),
    ...(anchor && rest.length
      ? [`${anchor}/${rest[0]}.rs`, `${anchor}/${rest[0]}/mod.rs`]
      : []),
    // bare `use foo::` / `mod foo;` — stem-dir child or sibling
    `${selfDir}/${p}.rs`,
    `${selfDir}/${p}/mod.rs`,
    `${selfDir}/${head}.rs`,
    `${selfDir}/${head}/mod.rs`,
    `${fromDir}/${head}.rs`,
    `${fromDir}/${head}/mod.rs`,
  ]);
  if (found) return { internal: found };
  // crate::/self::/super:: are definitionally internal — an unresolved
  // one is our miss, not an external package; drop rather than misreport
  if (["crate", "self", "super"].includes(head)) return null;
  return { external: head };
};

const resolveC: Resolver = (spec, fromDir, ctx) => {
  const rel = norm(`${fromDir}/${spec}`);
  const found = hit(ctx, [rel, norm(spec)]) ?? suffixHit(ctx, spec);
  return found ? { internal: found } : { external: spec };
};

const resolveDotsToSrc =
  (ext: string, prefixes: string[]): Resolver =>
  (spec, _fromDir, ctx) => {
    const p = spec.replace(/\./g, "/");
    const candidates = [
      p + ext,
      ...prefixes.map((pre) => `${pre}/${p}${ext}`),
      ...prefixes.map((pre) => `${pre}/${p}/${"mod" + ext}`),
    ];
    const found = hit(ctx, candidates) ?? suffixHit(ctx, p + ext);
    if (found) return { internal: found };
    return { external: spec.split(".")[0]! };
  };

const resolveRb: Resolver = (spec, fromDir, ctx) => {
  const rel = norm(`${fromDir}/${spec}`);
  const found =
    hit(ctx, [
      rel,
      rel + ".rb",
      norm(spec),
      norm(spec) + ".rb",
      `lib/${norm(spec)}.rb`,
    ]) ?? suffixHit(ctx, spec + ".rb");
  if (found) return { internal: found };
  return { external: spec.split("/")[0]! };
};

const resolveSh: Resolver = (spec, fromDir, ctx) => {
  const rel = norm(spec.startsWith("/") ? spec : `${fromDir}/${spec}`);
  const found = hit(ctx, [rel]) ?? suffixHit(ctx, spec);
  return found ? { internal: found } : { external: spec };
};

const RESOLVERS: Record<string, Resolver> = {
  ts: resolveJsLike(JS_EXTS),
  js: resolveJsLike(JS_EXTS),
  py: resolvePy,
  go: resolveGo,
  rs: resolveRs,
  java: resolveDotsToSrc(".java", ["src", "src/main/java"]),
  c: resolveC,
  rb: resolveRb,
  php: (spec, _fromDir, ctx) =>
    spec.includes("\\")
      ? { external: spec.split("\\")[0]! }
      : (() => {
          const f = suffixHit(ctx, spec);
          return f ? { internal: f } : { external: spec };
        })(),
  swift: (spec, _fromDir, ctx) =>
    ctx.fileSet.has(`${spec}.swift`)
      ? { internal: `${spec}.swift` }
      : { external: spec },
  kt: resolveDotsToSrc(".kt", ["src", "src/main/kotlin"]),
  cs: resolveDotsToSrc(".cs", ["src"]),
  sh: resolveSh,
};

/** Resolve one specifier → repo path, external name, or unresolvable. */
export function resolveSpec(
  langName: string,
  spec: string,
  fromDir: string,
  ctx: ResolveCtx,
  fromFile?: string,
): Resolved {
  const r = RESOLVERS[langName];
  return r ? r(spec, fromDir, ctx, fromFile) : { external: spec };
}
