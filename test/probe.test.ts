import { describe, expect, it } from "vitest";
import { imageDims, magicFormat, zipMembers } from "../src/probe.js";

const pngHeader = (w: number, h: number): Buffer => {
  const b = Buffer.alloc(33);
  b.writeUInt32BE(0x89504e47, 0);
  b.write("\x0d\x0a\x1a\x0a", 4, "latin1");
  b.write("IHDR", 12, "latin1");
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
};

const gifHeader = (w: number, h: number): Buffer => {
  const b = Buffer.alloc(10);
  b.write("GIF89a", 0, "latin1");
  b.writeUInt16LE(w, 6);
  b.writeUInt16LE(h, 8);
  return b;
};

/** Minimal parseable ZIP tail: central directory records + EOCD. */
const zipWith = (names: string[]): Buffer => {
  const central = names.map((name) => {
    const nameBuf = Buffer.from(name, "utf8");
    const cen = Buffer.alloc(46 + nameBuf.length);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(nameBuf.length, 28);
    nameBuf.copy(cen, 46);
    return cen;
  });
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(names.length, 8);
  eocd.writeUInt16LE(names.length, 10);
  eocd.writeUInt32LE(
    central.reduce((n, c) => n + c.length, 0),
    12,
  );
  eocd.writeUInt32LE(0, 16); // cd offset — parser walks count records from here
  return Buffer.concat([...central, eocd]);
};

describe("magicFormat", () => {
  it("detects common signatures", () => {
    expect(magicFormat(pngHeader(1, 1))).toBe("png");
    expect(magicFormat(gifHeader(1, 1))).toBe("gif");
    expect(magicFormat(Buffer.from("%PDF-1.7\n"))).toBe("pdf");
    expect(
      magicFormat(
        Buffer.concat([Buffer.from("PK\x03\x04", "latin1"), Buffer.alloc(8)]),
      ),
    ).toBe("zip");
    expect(magicFormat(Buffer.from("plain text"))).toBeNull();
  });
});

describe("imageDims", () => {
  it("reads PNG IHDR", () => {
    expect(imageDims(pngHeader(640, 480), "png")).toBe("640x480");
  });
  it("reads GIF header", () => {
    expect(imageDims(gifHeader(320, 200), "gif")).toBe("320x200");
  });
  it("returns null on truncated headers", () => {
    expect(imageDims(pngHeader(1, 1).subarray(0, 10), "png")).toBeNull();
  });
});

describe("zipMembers", () => {
  it("lists central directory names", () => {
    const buf = zipWith(["a.txt", "dir/b.md"]);
    expect(zipMembers(buf)).toEqual(["a.txt", "dir/b.md"]);
  });
  it("returns null on non-zip", () => {
    expect(zipMembers(Buffer.from("not a zip"))).toBeNull();
  });
});
