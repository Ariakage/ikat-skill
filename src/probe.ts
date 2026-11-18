import { promises as fs } from "node:fs";
import { extOf } from "./scan.js";
import { run, which } from "./tools.js";

/** Deepest probe level used — self-reported so consumers know how much
 * of the card is measurement vs. fallback. */
export type ProbeTool =
  | "builtin"
  | "file"
  | "ffprobe"
  | "pdfinfo"
  | "exiftool"
  | "ext";

export interface ProbeInfo {
  format: string;
  size: number;
  /** image/video dimensions "WxH" */
  dims?: string;
  /** seconds, rounded to 0.1 */
  duration?: number;
  codec?: string;
  /** generic file(1) description */
  type?: string;
  pages?: number;
  title?: string;
  /** first ZIP member names (cap 8) + "+N more" tail */
  members?: string[];
  /** sidecar evidence found next to the file */
  sidecars?: string[];
  tool: ProbeTool;
}

const HEAD_BYTES = 8192;

interface Magic {
  format: string;
  test: (b: Buffer) => boolean;
}

const MAGIC: Magic[] = [
  {
    format: "png",
    test: (b) => b.length > 7 && b.readUInt32BE(0) === 0x89504e47,
  },
  {
    format: "jpeg",
    test: (b) =>
      b.length > 2 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    format: "gif",
    test: (b) =>
      b.length > 5 && b.subarray(0, 6).toString("latin1").startsWith("GIF8"),
  },
  {
    format: "webp",
    test: (b) =>
      b.length > 11 &&
      b.subarray(0, 4).toString("latin1") === "RIFF" &&
      b.subarray(8, 12).toString("latin1") === "WEBP",
  },
  {
    format: "wav",
    test: (b) =>
      b.length > 11 &&
      b.subarray(0, 4).toString("latin1") === "RIFF" &&
      b.subarray(8, 12).toString("latin1") === "WAVE",
  },
  {
    format: "avi",
    test: (b) =>
      b.length > 11 &&
      b.subarray(0, 4).toString("latin1") === "RIFF" &&
      b.subarray(8, 12).toString("latin1") === "AVI ",
  },
  {
    format: "isobmff",
    test: (b) =>
      b.length > 11 && b.subarray(4, 8).toString("latin1") === "ftyp",
  },
  {
    format: "mkv/webm",
    test: (b) => b.length > 3 && b.readUInt32BE(0) === 0x1a45dfa3,
  },
  {
    format: "flac",
    test: (b) => b.length > 3 && b.subarray(0, 4).toString("latin1") === "fLaC",
  },
  {
    format: "ogg",
    test: (b) => b.length > 3 && b.subarray(0, 4).toString("latin1") === "OggS",
  },
  {
    format: "id3",
    test: (b) => b.length > 2 && b.subarray(0, 3).toString("latin1") === "ID3",
  },
  {
    format: "mp3",
    test: (b) => b.length > 1 && b[0] === 0xff && (b[1]! & 0xe0) === 0xe0,
  },
  {
    format: "pdf",
    test: (b) =>
      b.length > 4 && b.subarray(0, 5).toString("latin1") === "%PDF-",
  },
  {
    format: "zip",
    test: (b) => b.length > 3 && b.readUInt32BE(0) === 0x504b0304,
  },
  {
    format: "gzip",
    test: (b) => b.length > 1 && b[0] === 0x1f && b[1] === 0x8b,
  },
  {
    format: "7z",
    test: (b) =>
      b.length > 5 && b.subarray(0, 6).toString("latin1") === "7z\xbc\xaf'\x1c",
  },
  {
    format: "rar",
    test: (b) =>
      b.length > 6 &&
      (b.subarray(0, 7).toString("latin1") === "Rar!\x1a\x07\x00" ||
        b.subarray(0, 8).toString("latin1") === "Rar!\x1a\x07\x01\x00"),
  },
  {
    format: "wasm",
    test: (b) => b.length > 3 && b.readUInt32BE(0) === 0x0061736d,
  },
  {
    format: "elf",
    test: (b) => b.length > 3 && b.readUInt32BE(0) === 0x7f454c46,
  },
  {
    format: "macho",
    test: (b) =>
      b.length > 3 &&
      [0xfeedfabe, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe].includes(
        b.readUInt32BE(0),
      ),
  },
  {
    format: "sqlite",
    test: (b) =>
      b.length > 15 &&
      b.subarray(0, 16).toString("latin1") === "SQLite format 3\x00",
  },
];

/** Refine isobmff container into a brand name (mp4/mov/m4a/avif/heic). */
const ftypBrand = (b: Buffer): string | null => {
  if (b.length < 12 || b.subarray(4, 8).toString("latin1") !== "ftyp")
    return null;
  const brand = b.subarray(8, 12).toString("latin1");
  const map: Record<string, string> = {
    isom: "mp4",
    iso2: "mp4",
    mp41: "mp4",
    mp42: "mp4",
    M4V: "m4v",
    M4A: "m4a",
    qt: "mov",
    avif: "avif",
    heic: "heic",
    heix: "heic",
    mif1: "heif",
    dash: "mp4",
  };
  return map[brand] ?? map[brand.trim()] ?? null;
};

export function magicFormat(buf: Buffer): string | null {
  for (const m of MAGIC) if (m.test(buf)) return m.format;
  return null;
}

export function imageDims(buf: Buffer, format: string): string | null {
  try {
    if (format === "png" && buf.length > 24) {
      return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
    }
    if (format === "gif" && buf.length > 9) {
      return `${buf.readUInt16LE(6)}x${buf.readUInt16LE(8)}`;
    }
    if (format === "jpeg") {
      let off = 2;
      while (off + 9 < buf.length) {
        if (buf[off] !== 0xff) break;
        const marker = buf[off + 1]!;
        if (
          marker >= 0xc0 &&
          marker <= 0xcf &&
          ![0xc4, 0xc8, 0xcc].includes(marker)
        ) {
          return `${buf.readUInt16BE(off + 7)}x${buf.readUInt16BE(off + 5)}`;
        }
        off += 2 + buf.readUInt16BE(off + 2);
      }
    }
    if (format === "webp" && buf.length > 29) {
      const chunk = buf.subarray(12, 16).toString("latin1");
      if (chunk === "VP8 ") {
        const w = buf.readUInt16LE(26) & 0x3fff;
        const h = buf.readUInt16LE(28) & 0x3fff;
        return `${w}x${h}`;
      }
      if (chunk === "VP8X") {
        const w = 1 + buf.readUIntLE(24, 3);
        const h = 1 + buf.readUIntLE(27, 3);
        return `${w}x${h}`;
      }
    }
  } catch {
    /* truncated header */
  }
  return null;
}

/** Central-directory member names of a ZIP buffer — zero dependency.
 * Reads the whole file (archives are bounded by MAX_HASH_BYTES anyway). */
export function zipMembers(buf: Buffer, cap = 8): string[] | null {
  try {
    // EOCD: scan tail for 0x06054b50
    let eocd = -1;
    const min = Math.max(0, buf.length - 65557);
    for (let i = buf.length - 22; i >= min; i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) return null;
    const count = buf.readUInt16LE(eocd + 10);
    let off = buf.readUInt32LE(eocd + 16);
    const names: string[] = [];
    for (let i = 0; i < count && off + 46 <= buf.length; i++) {
      if (buf.readUInt32LE(off) !== 0x02014b50) break;
      const nameLen = buf.readUInt16LE(off + 28);
      const extraLen = buf.readUInt16LE(off + 30);
      const commentLen = buf.readUInt16LE(off + 32);
      names.push(buf.subarray(off + 46, off + 46 + nameLen).toString("utf8"));
      off += 46 + nameLen + extraLen + commentLen;
    }
    if (names.length > cap)
      return [...names.slice(0, cap), `+${names.length - cap} more`];
    return names.length ? names : null;
  } catch {
    return null;
  }
}

const secs = (s: string | undefined): number | undefined => {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : undefined;
};

async function probeFfprobe(abs: string, info: ProbeInfo): Promise<boolean> {
  const r = await run("ffprobe", [
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    abs,
  ]);
  if (!r) return false;
  try {
    interface Stream {
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
    }
    const j = JSON.parse(r.stdout) as {
      format?: { duration?: string; format_name?: string };
      streams?: Stream[];
    };
    const dur = secs(j?.format?.duration);
    if (dur) info.duration = dur;
    const streams = j?.streams ?? [];
    const v = streams.find((s) => s.codec_type === "video");
    const a = streams.find((s) => s.codec_type === "audio");
    if (v?.width && v?.height) info.dims = `${v.width}x${v.height}`;
    const codecs = [v?.codec_name, a?.codec_name].filter(Boolean);
    if (codecs.length) info.codec = codecs.join("+");
    if (j?.format?.format_name)
      info.format = j.format.format_name.split(",")[0] ?? info.format;
    return true;
  } catch {
    return false;
  }
}

async function probePdfinfo(abs: string, info: ProbeInfo): Promise<boolean> {
  const r = await run("pdfinfo", [abs]);
  if (!r) return false;
  const get = (k: string) => {
    const m = new RegExp(`^${k}:\\s*(.+)$`, "m").exec(r.stdout);
    return m?.[1]?.trim();
  };
  const pages = Number(get("Pages"));
  if (Number.isFinite(pages)) info.pages = pages;
  const title = get("Title");
  if (title) info.title = title.slice(0, 120);
  return true;
}

const AV_EXTS = new Set([
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
]);
const IMG_EXTS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".heic",
  ".tif",
  ".tiff",
  ".bmp",
]);

/** External-tool work deferred for one batched flush — spawning a
 * process per file dominates init time at scale (2.8k execs ≈ 20 s on
 * an 11.5k-file repo), so callers collect these queues during the
 * per-file pass and drain them once via runProbeBatch. */
export interface ProbeBatch {
  ffprobe: { abs: string; info: ProbeInfo }[];
  pdfinfo: { abs: string; info: ProbeInfo }[];
  exiftool: { abs: string; info: ProbeInfo }[];
  file: { abs: string; info: ProbeInfo }[];
}

export const newProbeBatch = (): ProbeBatch => ({
  ffprobe: [],
  pdfinfo: [],
  exiftool: [],
  file: [],
});

const chunks = <T>(items: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
};

/** Drain deferred probe queues: file(1) and exiftool go out in argv
 * batches (one process per ~400 paths), ffprobe/pdfinfo run per file on
 * a small concurrency pool. Output is joined back by arg order (file -b)
 * or SourceFile (exiftool -json). */
export async function runProbeBatch(
  batch: ProbeBatch,
  onStep?: (n?: number) => void,
): Promise<void> {
  for (const chunk of chunks(batch.exiftool, 400)) {
    const r = await run(
      "exiftool",
      ["-json", "-ImageWidth", "-ImageHeight", ...chunk.map((c) => c.abs)],
      60_000,
    );
    onStep?.(chunk.length);
    if (!r) continue;
    try {
      const arr = JSON.parse(r.stdout) as Record<string, unknown>[];
      const bySrc = new Map(arr.map((j) => [String(j.SourceFile), j]));
      for (const c of chunk) {
        const j = bySrc.get(c.abs);
        if (j?.ImageWidth && j?.ImageHeight) {
          c.info.dims = `${j.ImageWidth}x${j.ImageHeight}`;
          c.info.tool = "exiftool";
        }
      }
    } catch {
      /* malformed tool output — keep builtin data */
    }
  }
  for (const chunk of chunks(batch.file, 400)) {
    const r = await run("file", ["-b", ...chunk.map((c) => c.abs)], 30_000);
    onStep?.(chunk.length);
    const lines = r?.stdout.split("\n") ?? [];
    chunk.forEach((c, i) => {
      const t = lines[i]?.trim();
      if (t) {
        c.info.type = t.slice(0, 160);
        if (c.info.tool === "ext" || c.info.tool === "builtin")
          c.info.tool = "file";
      }
    });
  }
  const pool = async <T>(
    items: T[],
    n: number,
    fn: (x: T) => Promise<void>,
  ) => {
    let i = 0;
    await Promise.all(
      Array.from({ length: Math.min(n, items.length) }, async () => {
        for (;;) {
          const x = items[i++];
          if (x === undefined) break;
          await fn(x);
          onStep?.();
        }
      }),
    );
  };
  await pool(batch.ffprobe, 8, async (c) => {
    if (await probeFfprobe(c.abs, c.info)) c.info.tool = "ffprobe";
  });
  await pool(batch.pdfinfo, 8, async (c) => {
    if (await probePdfinfo(c.abs, c.info)) c.info.tool = "pdfinfo";
  });
}

export const probeBatchSize = (b: ProbeBatch): number =>
  b.exiftool.length + b.file.length + b.ffprobe.length + b.pdfinfo.length;

/** Probe one file: builtin header → ffprobe (A/V) → pdfinfo (pdf) →
 * exiftool → file(1) → extension fallback. Missing tools skip silently;
 * the floor is always format + size. Pass `batch` to defer every
 * external call into runProbeBatch queues instead of spawning per file. */
export async function probeFile(
  abs: string,
  rel: string,
  repoFiles: Set<string>,
  batch?: ProbeBatch,
): Promise<ProbeInfo> {
  const st = await fs.stat(abs);
  const info: ProbeInfo = {
    format: extOf(rel).slice(1) || "unknown",
    size: st.size,
    tool: "ext",
  };

  // sidecars — free authored text evidence (never read here, just noted)
  const base = rel.slice(0, rel.length - extOf(rel).length);
  const side = [".md", ".txt", ".srt"].filter((e) => repoFiles.has(base + e));
  if (side.length) info.sidecars = side.map((e) => base + e);

  let head = Buffer.alloc(0);
  try {
    const fh = await fs.open(abs, "r");
    try {
      head = Buffer.alloc(HEAD_BYTES);
      const { bytesRead } = await fh.read(head, 0, HEAD_BYTES, 0);
      head = head.subarray(0, bytesRead);
    } finally {
      await fh.close();
    }
  } catch {
    return info;
  }

  const magic = magicFormat(head);
  if (magic) {
    info.format = magic === "isobmff" ? (ftypBrand(head) ?? "mp4") : magic;
    info.tool = "builtin";
    const dims = imageDims(head, info.format);
    if (dims) info.dims = dims;
  }
  if (info.format === "zip") {
    const members = zipMembers(
      await fs.readFile(abs).catch(() => Buffer.alloc(0)),
    );
    if (members) info.members = members;
  }

  const ext = extOf(rel);
  if (batch) {
    if (AV_EXTS.has(ext) && which("ffprobe")) batch.ffprobe.push({ abs, info });
    if (info.format === "pdf" && which("pdfinfo"))
      batch.pdfinfo.push({ abs, info });
    if (!info.dims && !info.duration && IMG_EXTS.has(ext) && which("exiftool"))
      batch.exiftool.push({ abs, info });
    if (which("file")) batch.file.push({ abs, info });
    return info;
  }
  if (AV_EXTS.has(ext) && which("ffprobe")) {
    if (await probeFfprobe(abs, info)) info.tool = "ffprobe";
  }
  if (info.format === "pdf" && which("pdfinfo")) {
    if (await probePdfinfo(abs, info)) info.tool = "pdfinfo";
  }
  if (!info.dims && !info.duration && IMG_EXTS.has(ext) && which("exiftool")) {
    const r = await run("exiftool", [
      "-json",
      "-ImageWidth",
      "-ImageHeight",
      abs,
    ]);
    if (r) {
      try {
        const j = JSON.parse(r.stdout)?.[0];
        if (j?.ImageWidth && j?.ImageHeight) {
          info.dims = `${j.ImageWidth}x${j.ImageHeight}`;
          info.tool = "exiftool";
        }
      } catch {
        /* keep level */
      }
    }
  }
  if (which("file")) {
    const r = await run("file", ["-b", abs], 5000);
    if (r?.stdout.trim()) {
      info.type = r.stdout.trim().slice(0, 160);
      if (info.tool === "ext" || info.tool === "builtin") info.tool = "file";
    }
  }
  return info;
}

/** Which probe tools the environment offers — recorded in meta so the
 * digest can say which level ran. */
export function probeTools(): string[] {
  return [
    "file",
    "ffprobe",
    "pdfinfo",
    "exiftool",
    "markitdown",
    "mmdc",
  ].filter((t) => which(t) !== null);
}
