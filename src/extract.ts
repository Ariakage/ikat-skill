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

export interface ResolveCtx {
  fileSet: Set<string>;
  dirSet: Set<string>;
  /** basename → repo paths (for C-style include suffix resolution) */
  suffix: Map<string, string[]>;
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
