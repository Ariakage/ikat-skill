/** Language extraction table. Regexes target surface syntax only — imports
 * and doc-comments have stable shapes; deeper analysis is deferred. */

export type ImportRule =
  | { re: RegExp } // group 1 = specifier
  | { block: RegExp; item: RegExp }; // block text → item regex extracts specs

export type DocStyle = "slash" | "hash" | "docstring" | "prose";

export interface LangSpec {
  name: string;
  exts: string[];
  imports: ImportRule[];
  /** group 1 = exported name; when list=true the group is a {a, b as c} list */
  exports?: { re: RegExp; list?: boolean }[];
  doc?: DocStyle;
}

const JS_IMPORTS: ImportRule[] = [
  { re: /\bimport\s+(?:[\w${}*,\s]+?\s+from\s+)?["']([^"']+)["']/g },
  { re: /\bexport\s+(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["']/g },
  { re: /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g },
  { re: /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g },
];

const JS_EXPORTS = [
  {
    re: /\bexport\s+(?:default\s+|async\s+)*(?:function\*?|class|interface|type|enum|const|let|var|abstract\s+class)\s+([A-Za-z_$][\w$]*)/g,
  },
  { re: /\bexport\s*\{([^}]+)\}/g, list: true },
];

const SLASH_DOC: DocStyle = "slash";

export const LANGS: LangSpec[] = [
  {
    name: "ts",
    exts: [".ts", ".tsx", ".mts", ".cts"],
    imports: JS_IMPORTS,
    exports: JS_EXPORTS,
    doc: SLASH_DOC,
  },
  {
    name: "js",
    exts: [".js", ".jsx", ".mjs", ".cjs"],
    imports: JS_IMPORTS,
    exports: JS_EXPORTS,
    doc: SLASH_DOC,
  },
  {
    name: "py",
    exts: [".py", ".pyi"],
    imports: [
      { re: /^\s*import\s+([\w.]+)/gm },
      { re: /^\s*from\s+([.\w]+)\s+import\b/gm },
    ],
    exports: [
      { re: /^(?:async\s+)?def\s+(\w+)/gm },
      { re: /^class\s+(\w+)/gm },
      { re: /^([A-Z][A-Z0-9_]{2,})\s*(?::[^=]+)?=/gm },
    ],
    doc: "docstring",
  },
  {
    name: "go",
    exts: [".go"],
    imports: [
      { re: /^\s*import\s+"([^"]+)"/gm },
      { block: /import\s*\(\s*([\s\S]*?)\)/g, item: /"([^"]+)"/g },
    ],
    exports: [
      {
        re: /^(?:func\s+(?:\([^)]*\)\s*)?|type\s+|var\s+|const\s+)([A-Z][\w]*)/gm,
      },
    ],
    doc: SLASH_DOC,
  },
  {
    name: "rs",
    exts: [".rs"],
    imports: [
      { re: /^\s*(?:pub(?:\([^)]*\))?\s+)?use\s+([\w:]+)/gm },
      { re: /^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+(\w+)\s*;/gm },
      { re: /^\s*extern\s+crate\s+(\w+)/gm },
    ],
    exports: [
      {
        re: /\bpub(?:\([^)]*\))?\s+(?:async\s+)?(?:fn|struct|enum|trait|const|static|type|mod)\s+(\w+)/g,
      },
    ],
    doc: SLASH_DOC,
  },
  {
    name: "java",
    exts: [".java"],
    imports: [{ re: /^\s*import\s+(?:static\s+)?([\w.]+)\s*;/gm }],
    exports: [
      {
        re: /\bpublic\s+(?:final\s+|abstract\s+)?(?:class|interface|enum|record|@interface)\s+(\w+)/g,
      },
    ],
    doc: SLASH_DOC,
  },
  {
    name: "c",
    exts: [".c", ".h", ".cc", ".cpp", ".cxx", ".hh", ".hpp", ".hxx"],
    imports: [{ re: /^\s*#\s*include\s*[<"]([^>"]+)[>"]/gm }],
    doc: SLASH_DOC,
  },
  {
    name: "rb",
    exts: [".rb"],
    imports: [
      {
        re: /^\s*require(?:_relative)?\s*(?:\(\s*)?["']([^"']+)["']/gm,
      },
    ],
    exports: [
      { re: /^\s*(?:class|module)\s+([A-Z][\w:]*)/gm },
      { re: /^\s*def\s+(?:self\.)?(\w+[!?=]?)/gm },
    ],
    doc: "hash",
  },
  {
    name: "php",
    exts: [".php"],
    imports: [
      { re: /^\s*use\s+([\w\\]+)\s*;/gm },
      { re: /\b(?:require|include)(?:_once)?\s*\(?\s*["']([^"']+)["']/g },
    ],
    exports: [{ re: /\b(?:class|interface|trait|enum|function)\s+(\w+)/g }],
    doc: SLASH_DOC,
  },
  {
    name: "swift",
    exts: [".swift"],
    imports: [
      {
        re: /^\s*import\s+(?:class|struct|enum|protocol|func|typealias\s+)?(\w+)/gm,
      },
    ],
    exports: [
      {
        re: /\b(?:public|open)\s+(?:final\s+)?(?:class|struct|enum|protocol|actor|typealias)\s+(\w+)/g,
      },
      { re: /\b(?:public|open)\s+func\s+(\w+)/g },
    ],
    doc: SLASH_DOC,
  },
  {
    name: "kt",
    exts: [".kt", ".kts"],
    imports: [{ re: /^\s*import\s+([\w.]+)/gm }],
    exports: [
      { re: /\b(?:class|object|interface|enum\s+class)\s+(\w+)/g },
      { re: /\bfun\s+(?:<[^>]+>\s+)?(?:[\w.]+\.)?(\w+)\s*\(/g },
    ],
    doc: SLASH_DOC,
  },
  {
    name: "cs",
    exts: [".cs"],
    imports: [{ re: /^\s*using\s+(?:static\s+)?([\w.]+)\s*;/gm }],
    exports: [
      {
        re: /\bpublic\s+(?:sealed\s+|abstract\s+|static\s+|partial\s+)*(?:class|interface|enum|struct|record)\s+(\w+)/g,
      },
    ],
    doc: SLASH_DOC,
  },
  {
    name: "sh",
    exts: [".sh", ".bash", ".zsh"],
    imports: [{ re: /^\s*(?:source|\.)\s+["']?([^\s"']+)["']?/gm }],
    doc: "hash",
  },
];

const byExt = new Map<string, LangSpec>();
for (const lang of LANGS) for (const ext of lang.exts) byExt.set(ext, lang);

export function langFor(path: string): LangSpec | null {
  const m = /\.[^./\\]+$/.exec(path);
  return m ? (byExt.get(m[0].toLowerCase()) ?? null) : null;
}

export const PROSE_EXTS = new Set([".md", ".mdx", ".txt", ".rst", ".adoc"]);

export const MEDIA_EXTS = new Set([
  ".mp4",
  ".mov",
  ".mkv",
  ".webm",
  ".avi",
  ".m4v",
  ".mp3",
  ".wav",
  ".flac",
  ".ogg",
  ".m4a",
  ".aac",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".svg",
  ".ico",
  ".tif",
  ".tiff",
  ".bmp",
  ".heic",
  ".ttf",
  ".otf",
  ".woff",
  ".woff2",
  ".zip",
  ".tar",
  ".gz",
  ".bz2",
  ".xz",
  ".7z",
  ".rar",
  ".wasm",
  ".so",
  ".dylib",
  ".dll",
  ".exe",
  ".bin",
]);

export const DOCUMENT_EXTS = new Set([
  ".pdf",
  ".docx",
  ".doc",
  ".xlsx",
  ".xls",
  ".pptx",
  ".ppt",
  ".epub",
  ".odt",
  ".msg",
  ".ipynb",
  ".html",
  ".htm",
]);

export const CONFIG_NAME =
  /(^|\/)(Dockerfile|Makefile|Justfile|Rakefile|CMakeLists\.txt|Procfile|\.?babelrc|\.?eslintrc[^/]*|\.?prettierrc[^/]*|biome\.json|tsconfig[^/]*\.json|jsconfig[^/]*\.json|package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.toml|Cargo\.lock|pyproject\.toml|setup\.py|setup\.cfg|requirements[^/]*\.txt|go\.mod|go\.sum|pom\.xml|build\.gradle[^/]*|composer\.json|Gemfile[^/]*|.*\.csproj|.*\.sln|[^/]*\.config\.[cm]?[jt]sx?)$/i;

export const CONFIG_EXTS = new Set([
  ".json",
  ".jsonc",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".cfg",
  ".conf",
  ".env",
  ".lock",
  ".xml",
]);
