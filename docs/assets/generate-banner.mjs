// Generate docs/assets/banner.svg — ikat-weave motif with an embedded
// dependency lattice. Deterministic (seeded), no dependencies.
// Run: node docs/assets/generate-banner.mjs && rsvg-convert -w 1600 docs/assets/banner.svg -o docs/assets/banner.png
import { writeFileSync } from "node:fs";

const W = 1600;
const H = 640;

// deterministic jitter (LCG)
let seed = 20261119;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

const INDIGO = "#101a30";
const INK2 = "#1b2947";
const VERM = "#c8451f";
const VERM2 = "#8f2f16";
const NATURAL = "#e8ddc8";
const NATURAL_DIM = "#6b7288";

const el = [];
el.push(`<rect width="${W}" height="${H}" fill="${INDIGO}"/>`);

/* ---------- ikat weave field (left ~60%) ----------
 * Bands of chevron registers; each chevron is built from short vertical
 * strokes whose tops/bottoms are offset alternately — the characteristic
 * feathered edge of bound-warp dyeing. */
const fieldX = 0;
const fieldW = 980;
const colW = 46;
const rowH = 64;

// faint vertical warp lines across the whole canvas — the loom ground
// unifies the graph side with the weave side
for (let x = fieldX + 20; x < W - 14; x += 9) {
  el.push(
    `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#ffffff" stroke-opacity="0.022"/>`,
  );
}

const chevron = (cx, cy, w, h, color, feather) => {
  // chevron as a thick open path built of short vertical strokes so the
  // edges feather like tied yarns
  const strokes = [];
  const n = Math.max(6, Math.round(w / 9));
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = cx - w / 2 + t * w;
    const peak = cy - (t < 0.5 ? t * 2 : (1 - t) * 2) * h;
    const j1 = (rnd() - 0.5) * 2 * feather;
    const j2 = (rnd() - 0.5) * 2 * feather;
    strokes.push(
      `<line x1="${x.toFixed(1)}" y1="${(peak - 7 + j1).toFixed(1)}" x2="${x.toFixed(1)}" y2="${(peak + 7 + j2).toFixed(1)}" stroke="${color}" stroke-width="4" stroke-linecap="round"/>`,
    );
  }
  return strokes.join("");
};

const bandColors = [INK2, VERM, INK2, NATURAL_DIM, INK2, VERM2, INK2];
let band = 0;
for (let y = 30; y < H - 40; y += rowH) {
  const color = bandColors[band % bandColors.length];
  const w = colW * 0.82;
  for (let x = fieldX + 60 + (band % 2) * (colW / 2); x < fieldW - 40; x += colW) {
    const fade = x > 640 ? Math.max(0.12, 1 - (x - 640) / 340) : 1;
    if (fade < 0.14) continue;
    el.push(
      `<g opacity="${(0.9 * fade).toFixed(2)}">${chevron(x, y, w, rowH * 0.34, color, 3)}</g>`,
    );
  }
  band++;
}

/* ---------- embedded dependency lattice (right side) ---------- */
// a small graph woven out of the same palette — clusters like real dirs
const nodes = [
  [1130, 130], [1245, 90], [1360, 150], [1290, 200],
  [1120, 300], [1230, 270], [1355, 310], [1455, 260],
  [1180, 430], [1300, 470], [1420, 420], [1500, 520], [1340, 560],
];
const edges = [
  [0, 1], [1, 2], [0, 3], [3, 2], [1, 3],
  [4, 5], [5, 6], [4, 6], [5, 7], [6, 7],
  [8, 9], [9, 10], [8, 10], [10, 11], [9, 12], [11, 12],
  [3, 5], [6, 10], [7, 10],
];
for (const [a, b] of edges) {
  const [x1, y1] = nodes[a];
  const [x2, y2] = nodes[b];
  el.push(
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${NATURAL}" stroke-opacity="0.35" stroke-width="1.2"/>`,
  );
}
const nodeColor = (i) =>
  i % 5 === 0 ? VERM : i % 3 === 0 ? NATURAL : "#9fb3d9";
for (const [i, [x, y]] of nodes.entries()) {
  el.push(
    `<circle cx="${x}" cy="${y}" r="5" fill="${INDIGO}" stroke="${nodeColor(i)}" stroke-width="1.6"/>`,
  );
}

// transition stitches: a few lattice threads reach back into the weave
el.push(
  `<path d="M 980 320 Q 1040 300 1120 300" stroke="${VERM}" stroke-opacity="0.5" fill="none" stroke-width="1.4" stroke-dasharray="5 5"/>`,
);
el.push(
  `<path d="M 980 200 Q 1060 160 1130 130" stroke="${NATURAL}" stroke-opacity="0.4" fill="none" stroke-width="1.2" stroke-dasharray="4 6"/>`,
);

/* ---------- wordmark + sparse annotations ---------- */
// quiet ground panel so the wordmark reads against the weave
el.push(
  `<rect x="52" y="392" width="640" height="226" fill="${INDIGO}" opacity="0.82" rx="4"/>`,
);
el.push(
  `<text x="80" y="470" font-family="Menlo, monospace" font-weight="bold" font-size="150" fill="${NATURAL}" letter-spacing="-4">ikat</text>`,
);
el.push(
  `<text x="84" y="515" font-family="Menlo, monospace" font-size="21" fill="${NATURAL_DIM}">low-token repo orientation</text>`,
);
el.push(
  `<text x="84" y="548" font-family="Menlo, monospace" font-size="21" fill="#4d5b7a">deterministic index · agent entries</text>`,
);
// tally marks, like a weaver's count
for (let i = 0; i < 5; i++) {
  const x = 84 + i * 14;
  el.push(
    `<line x1="${x}" y1="590" x2="${x + 8}" y2="604" stroke="${VERM}" stroke-width="2" stroke-linecap="round"/>`,
  );
}

// thin registration border
el.push(
  `<rect x="14" y="14" width="${W - 28}" height="${H - 28}" fill="none" stroke="${NATURAL}" stroke-opacity="0.14" stroke-width="1"/>`,
);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n${el.join("\n")}\n</svg>\n`;
writeFileSync(new URL("./banner.svg", import.meta.url), svg);
console.log(`banner.svg written (${el.length} elements)`);
