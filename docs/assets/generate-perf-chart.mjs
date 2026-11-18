// Generate docs/assets/perf-scaling.svg — measured init scaling,
// log-x (files) × linear-y (seconds). Deterministic, zero deps.
// Run: node docs/assets/generate-perf-chart.mjs && rsvg-convert -w 1520 docs/assets/perf-scaling.svg -o docs/assets/perf-scaling.png
import { writeFileSync } from "node:fs";

const W = 1520;
const H = 900;
const PAD = { l: 110, r: 60, t: 90, b: 100 };
const IW = W - PAD.l - PAD.r;
const IH = H - PAD.t - PAD.b;

// measured (this machine, warm cache, post-batching)
const data = [
  { name: "ikat-skill", files: 45, sec: 0.098, edges: 105 },
  { name: "soyo-harness", files: 626, sec: 0.228, edges: 678 },
  { name: "opencode", files: 11575, sec: 2.844, edges: 26884 },
];

const XMIN = 1.6; // log10(40)
const XMAX = 4.15; // log10(14125)
const YMAX = 3.2;
const x = (files) => PAD.l + ((Math.log10(files) - XMIN) / (XMAX - XMIN)) * IW;
const y = (sec) => PAD.t + IH - (sec / YMAX) * IH;

const INK = "#26272b";
const GRID = "#e8e8ec";
const BLUE = "#4E79A7";
const ORANGE = "#F28E2B";
const GREEN = "#59A14F";
const colors = [BLUE, ORANGE, GREEN];

const el = [];
el.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
el.push(
  `<text x="${PAD.l}" y="52" font-family="Menlo, monospace" font-weight="bold" font-size="34" fill="${INK}">ikat init scaling — files indexed vs seconds</text>`,
);

// gridlines + y ticks
for (let s = 0; s <= 3; s += 0.5) {
  const yy = y(s);
  el.push(
    `<line x1="${PAD.l}" y1="${yy}" x2="${W - PAD.r}" y2="${yy}" stroke="${GRID}" stroke-width="1.5"/>`,
  );
  el.push(
    `<text x="${PAD.l - 16}" y="${yy + 8}" text-anchor="end" font-family="Menlo, monospace" font-size="22" fill="#9a9aa2">${s}</text>`,
  );
}
// x ticks at decades
for (const f of [50, 100, 500, 1000, 5000, 10000]) {
  const xx = x(f);
  el.push(
    `<line x1="${xx}" y1="${PAD.t}" x2="${xx}" y2="${H - PAD.b}" stroke="${GRID}" stroke-width="1.5"/>`,
  );
  el.push(
    `<text x="${xx}" y="${H - PAD.b + 38}" text-anchor="middle" font-family="Menlo, monospace" font-size="22" fill="#9a9aa2">${f.toLocaleString("en-US")}</text>`,
  );
}
// axis titles
el.push(
  `<text x="${(PAD.l + W - PAD.r) / 2}" y="${H - 24}" text-anchor="middle" font-family="Menlo, monospace" font-size="24" fill="${INK}">files indexed (log scale)</text>`,
);
el.push(
  `<text x="34" y="${PAD.t + IH / 2}" text-anchor="middle" font-family="Menlo, monospace" font-size="24" fill="${INK}" transform="rotate(-90 34 ${PAD.t + IH / 2})">init seconds</text>`,
);

// trend line through the three points
const pts = data.map((d) => [x(d.files), y(d.sec)]);
el.push(
  `<polyline points="${pts.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${INK}" stroke-width="2.5" stroke-dasharray="10 8" stroke-opacity="0.45"/>`,
);

// points: big filled dots + name + measured value
data.forEach((d, i) => {
  const [px, py] = pts[i];
  const c = colors[i];
  el.push(`<circle cx="${px}" cy="${py}" r="14" fill="${c}"/>`);
  el.push(
    `<circle cx="${px}" cy="${py}" r="14" fill="none" stroke="${c}" stroke-opacity="0.3" stroke-width="10"/>`,
  );
  const above = i !== 2; // labels above the line to keep the axis clear
  const nameY = py + (above ? -64 : 48);
  const valueY = py + (above ? -32 : 82);
  const anchor = i === 2 ? "end" : "start";
  const lx = i === 2 ? px - 26 : px + 24;
  el.push(
    `<text x="${lx}" y="${nameY}" text-anchor="${anchor}" font-family="Menlo, monospace" font-weight="bold" font-size="26" fill="${INK}">${d.name}</text>`,
  );
  el.push(
    `<text x="${lx}" y="${valueY}" text-anchor="${anchor}" font-family="Menlo, monospace" font-size="22" fill="#6a6a72">${d.files.toLocaleString("en-US")} files · ${d.sec}s · ${d.edges.toLocaleString("en-US")} edges</text>`,
  );
});

// takeaway annotation in the empty upper-left region
el.push(
  `<text x="${PAD.l + 30}" y="${PAD.t + 60}" font-family="Menlo, monospace" font-size="22" fill="#6a6a72">18.5× more files → 12.5× more time ≈ near-linear indexing</text>`,
);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n${el.join("\n")}\n</svg>\n`;
writeFileSync(new URL("./perf-scaling.svg", import.meta.url), svg);
console.log("perf-scaling.svg written");
