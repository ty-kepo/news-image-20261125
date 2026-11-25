// "The World in One Day" — make.fun news-image-20261125 entry.
// A Node 22 program, standard library only, no network, deterministic.
// It draws a 1024x1024 newspaper front page summing up Wednesday
// 25 November 2026: a world map with 32 numbered story markers and
// the 32 stories as short labelled items, plus the day's markets.
// Run: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

// ---------------------------------------------------------------- font --
// 5x7 bitmap font. Each glyph is 7 rows of 5 bits (bit 4 = leftmost pixel).
const FONT: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14], D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  '0': [14, 17, 19, 21, 25, 17, 14], '1': [4, 12, 4, 4, 4, 4, 14],
  '2': [14, 17, 1, 6, 8, 16, 31], '3': [31, 2, 4, 2, 1, 17, 14],
  '4': [2, 6, 10, 18, 31, 2, 2], '5': [31, 16, 30, 1, 1, 17, 14],
  '6': [6, 8, 16, 30, 17, 17, 14], '7': [31, 1, 2, 4, 8, 8, 8],
  '8': [14, 17, 17, 14, 17, 17, 14], '9': [14, 17, 17, 15, 1, 2, 12],
  ' ': [0, 0, 0, 0, 0, 0, 0], '.': [0, 0, 0, 0, 0, 12, 12],
  ',': [0, 0, 0, 0, 12, 4, 8], ':': [0, 12, 12, 0, 12, 12, 0],
  ';': [0, 12, 12, 0, 12, 4, 8], '!': [4, 4, 4, 4, 4, 0, 4],
  '?': [14, 17, 1, 6, 4, 0, 4], '-': [0, 0, 0, 14, 0, 0, 0],
  '/': [1, 2, 2, 4, 8, 8, 16], '(': [2, 4, 8, 8, 8, 4, 2],
  ')': [8, 4, 2, 2, 2, 4, 8], '%': [25, 26, 2, 4, 8, 11, 19],
  '+': [0, 4, 4, 14, 4, 4, 0], '$': [4, 15, 20, 14, 5, 30, 4],
  '&': [12, 18, 20, 8, 21, 18, 13], '=': [0, 0, 14, 0, 14, 0, 0],
  "'": [4, 4, 8, 0, 0, 0, 0], '"': [10, 10, 0, 0, 0, 0, 0],
  '\u2022': [0, 0, 12, 12, 12, 0, 0], '\u00d7': [0, 17, 10, 4, 10, 17, 0],
  '\u00b0': [12, 18, 12, 0, 0, 0, 0],
};
const EMPTY_GLYPH = [0, 0, 0, 0, 0, 0, 0];

function glyph(ch: string): number[] {
  if (ch === '\u2019' || ch === '\u2018') return FONT["'"];
  if (ch === '\u2013' || ch === '\u2014') return FONT['-'];
  return FONT[ch] ?? EMPTY_GLYPH;
}

// -------------------------------------------------------------- canvas --
type RGB = [number, number, number];

class Canvas {
  readonly w: number;
  readonly h: number;
  readonly buf: Uint8Array;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.buf = new Uint8Array(w * h * 3);
  }
  px(x: number, y: number, c: RGB): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    this.buf[i] = c[0]; this.buf[i + 1] = c[1]; this.buf[i + 2] = c[2];
  }
  fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
    const x0 = Math.max(0, x), y0 = Math.max(0, y);
    const x1 = Math.min(this.w, x + w), y1 = Math.min(this.h, y + h);
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const i = (yy * this.w + xx) * 3;
        this.buf[i] = c[0]; this.buf[i + 1] = c[1]; this.buf[i + 2] = c[2];
      }
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, x = x0, y = y0;
    for (;;) {
      this.px(x, y, c);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  }
  circle(cx: number, cy: number, r: number, c: RGB): void {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y <= r * r) this.px(cx + x, cy + y, c);
      }
    }
  }
  ring(cx: number, cy: number, r: number, c: RGB): void {
    for (let a = 0; a < 360; a += 1) {
      const t = (a * Math.PI) / 180;
      this.px(Math.round(cx + r * Math.cos(t)), Math.round(cy + r * Math.sin(t)), c);
    }
  }
  fillPolygon(pts: Array<[number, number]>, c: RGB): void {
    // Scanline fill; pts are canvas coordinates.
    let minY = Infinity, maxY = -Infinity;
    for (const [, y] of pts) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
    for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % pts.length];
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
          xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.ceil(xs[k]); x <= Math.floor(xs[k + 1]); x++) this.px(x, y, c);
      }
    }
  }
  text(str: string, x: number, y: number, scale: number, c: RGB): void {
    const s = str.toUpperCase();
    let cx = x;
    for (const ch of s) {
      const g = glyph(ch);
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 5; col++) {
          if (g[row] & (16 >> col)) {
            this.fillRect(cx + col * scale, y + row * scale, scale, scale, c);
          }
        }
      }
      cx += 6 * scale;
    }
  }
  textWidth(str: string, scale: number): number {
    return str.length * 6 * scale - scale;
  }
  textCentered(str: string, cx: number, y: number, scale: number, c: RGB): void {
    this.text(str, cx - Math.floor(this.textWidth(str, scale) / 2), y, scale, c);
  }
}

// ----------------------------------------------------------------- PNG --
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crcIn = new Uint8Array(4 + data.length);
  crcIn.set(out.subarray(4, 8), 0);
  crcIn.set(data, 4);
  dv.setUint32(8 + data.length, crc32(crcIn));
  return out;
}

function encodePNG(cv: Canvas): Uint8Array {
  const raw = new Uint8Array((cv.w * 3 + 1) * cv.h);
  for (let y = 0; y < cv.h; y++) {
    raw[y * (cv.w * 3 + 1)] = 0; // filter: none
    raw.set(cv.buf.subarray(y * cv.w * 3, (y + 1) * cv.w * 3), y * (cv.w * 3 + 1) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, cv.w); dv.setUint32(4, cv.h);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

// ------------------------------------------------------------ palette --
const PAPER: RGB = [247, 244, 236];
const INK: RGB = [20, 33, 61];
const INK_SOFT: RGB = [51, 65, 92];
const RED: RGB = [185, 28, 28];
const SEA: RGB = [216, 232, 244];
const LAND: RGB = [168, 191, 154];
const LAND_LINE: RGB = [122, 147, 112];
const GRID_LINE: RGB = [190, 208, 222];
const RULE: RGB = [20, 33, 61];

// Region colours for the numbered chips.
const REGION: Record<string, RGB> = {
  americas: [37, 99, 235],
  europe: [22, 163, 74],
  africa: [234, 88, 12],
  asia: [220, 38, 38],
  pacific: [124, 58, 237],
};
const WHITE: RGB = [255, 255, 255];

// ------------------------------------------------------------- map ----
const MAP = { x: 8, y: 112, w: 1008, h: 204, latTop: 78, latBottom: -58 };
function mapX(lon: number): number {
  return Math.round(MAP.x + ((lon + 180) / 360) * MAP.w);
}
function mapY(lat: number): number {
  return Math.round(MAP.y + ((MAP.latTop - lat) / (MAP.latTop - MAP.latBottom)) * MAP.h);
}
type LonLat = [number, number];
const CONTINENTS: LonLat[][] = [
  // North America
  [[-168, 66], [-150, 70], [-140, 70], [-130, 71], [-120, 70], [-110, 68], [-100, 69], [-90, 69], [-85, 66], [-82, 70], [-78, 71], [-75, 68], [-70, 62], [-65, 60], [-60, 55], [-55, 52], [-55, 47], [-60, 45], [-65, 44], [-70, 42], [-74, 39], [-76, 35], [-80, 32], [-81, 26], [-84, 30], [-89, 29], [-94, 29], [-97, 26], [-102, 24], [-105, 22], [-100, 19], [-95, 16], [-90, 14], [-86, 13], [-83, 9], [-80, 8], [-84, 11], [-90, 14], [-95, 17], [-100, 20], [-105, 23], [-110, 25], [-114, 29], [-120, 34], [-124, 40], [-124, 48], [-130, 55], [-140, 60], [-150, 58], [-158, 58], [-162, 55], [-165, 60], [-168, 66]],
  // South America
  [[-79, 9], [-77, 4], [-75, -1], [-79, -4], [-81, -6], [-80, -12], [-77, -18], [-71, -19], [-70, -23], [-70, -30], [-72, -37], [-73, -44], [-74, -50], [-70, -54], [-66, -55], [-68, -50], [-65, -45], [-62, -40], [-58, -35], [-53, -33], [-49, -29], [-44, -24], [-40, -21], [-38, -15], [-35, -9], [-35, -6], [-38, -4], [-42, -3], [-44, -2], [-48, 0], [-52, 4], [-55, 6], [-58, 8], [-62, 10], [-68, 11], [-72, 12], [-76, 10], [-79, 9]],
  // Africa
  [[-17, 15], [-16, 21], [-15, 27], [-10, 31], [-6, 34], [-1, 35], [3, 37], [9, 37], [11, 34], [15, 32], [20, 32], [25, 32], [30, 31], [32, 31], [34, 28], [36, 24], [37, 20], [39, 18], [40, 15], [43, 11], [46, 11], [51, 12], [48, 11], [44, 10], [42, 6], [40, 0], [40, -6], [40, -12], [38, -16], [36, -20], [33, -26], [30, -30], [28, -33], [24, -34], [19, -35], [17, -32], [15, -27], [13, -20], [12, -14], [12, -8], [9, -1], [9, 4], [4, 6], [-2, 5], [-8, 5], [-13, 8], [-16, 12], [-17, 15]],
  // Europe
  [[-10, 36], [-9, 43], [-2, 44], [-1, 46], [-4, 48], [0, 50], [3, 52], [7, 54], [8, 57], [10, 59], [6, 60], [5, 62], [12, 65], [18, 69], [25, 71], [30, 70], [30, 66], [28, 62], [25, 58], [22, 55], [20, 52], [18, 48], [16, 44], [14, 42], [18, 40], [22, 40], [26, 38], [28, 36], [26, 40], [23, 42], [20, 44], [18, 46], [15, 44], [12, 44], [8, 44], [4, 43], [0, 40], [-2, 37], [-6, 36], [-10, 36]],
  // Asia
  [[30, 70], [40, 68], [50, 69], [60, 69], [68, 73], [75, 73], [85, 75], [95, 76], [105, 77], [115, 76], [125, 75], [135, 74], [145, 72], [155, 70], [162, 66], [170, 66], [178, 65], [170, 60], [162, 56], [158, 52], [150, 59], [142, 55], [140, 50], [135, 43], [130, 40], [127, 35], [122, 32], [120, 28], [115, 23], [110, 20], [108, 15], [105, 10], [100, 8], [98, 12], [95, 16], [92, 20], [90, 22], [88, 22], [85, 18], [80, 15], [77, 8], [75, 12], [72, 20], [68, 23], [66, 25], [62, 25], [58, 26], [56, 27], [54, 26], [52, 25], [50, 29], [48, 30], [44, 29], [42, 28], [40, 25], [38, 20], [36, 18], [35, 15], [39, 12], [43, 12], [45, 15], [48, 18], [50, 22], [52, 26], [54, 28], [52, 30], [48, 30], [44, 32], [40, 35], [36, 36], [33, 36], [30, 38], [28, 41], [30, 45], [30, 50], [28, 55], [30, 60], [30, 65], [30, 70]],
  // Australia
  [[113, -22], [114, -30], [115, -33], [118, -35], [124, -33], [129, -32], [132, -32], [135, -35], [138, -35], [140, -38], [145, -38], [150, -37], [153, -32], [153, -27], [150, -23], [146, -19], [142, -15], [142, -11], [137, -12], [135, -15], [132, -12], [130, -13], [126, -14], [122, -17], [118, -20], [113, -22]],
  // United Kingdom
  [[-5, 50], [-3, 53], [-5, 56], [-3, 58], [-1, 57], [0, 53], [1, 51], [-3, 50], [-5, 50]],
  // Japan
  [[130, 31], [132, 33], [135, 34], [137, 35], [139, 37], [140, 39], [141, 41], [142, 43], [144, 44], [142, 42], [140, 40], [139, 37], [136, 35], [133, 34], [131, 32], [130, 31]],
  // Sumatra
  [[95, 5], [100, 0], [104, -3], [106, -6], [103, -5], [99, -1], [96, 3], [95, 5]],
  // Borneo
  [[109, 1], [112, 4], [117, 6], [119, 1], [117, -3], [113, -4], [110, -3], [109, 1]],
  // Java
  [[105, -6], [110, -7], [114, -7], [114, -9], [108, -8], [105, -6]],
  // New Guinea
  [[131, -1], [136, -2], [141, -3], [146, -6], [147, -8], [141, -8], [136, -7], [132, -4], [131, -1]],
  // Madagascar
  [[44, -16], [47, -15], [50, -16], [49, -20], [47, -24], [45, -25], [44, -20], [44, -16]],
  // New Zealand
  [[167, -45], [170, -43], [173, -41], [175, -38], [177, -38], [174, -41], [172, -43], [168, -46], [167, -45]],
];

// ------------------------------------------------------------ stories --
// 32 stories, each verified as having happened or first been reported on
// Wednesday 25 November 2026 (see STORIES.md for sources). lon/lat place
// the marker on the map; dx/dy nudge apart markers that would collide.
// Titles and details are kept to 37 characters so they fit one line each
// at scale 2 in a 454 px column.
interface Story {
  n: number;
  title: string;
  detail: string;
  lon: number;
  lat: number;
  dx: number;
  dy: number;
  region: keyof typeof REGION;
}
const STORIES: Story[] = [
  { n: 1, title: 'SHENZHOU-24 LIFTS OFF', detail: "PAKISTAN'S FIRST ASTRONAUT ABOARD", lon: 100, lat: 40, dx: -8, dy: -8, region: 'asia' },
  { n: 2, title: "RUSSIA'S WAR DEAD NEAR 500,000", detail: 'LEAKED FIGURES REVEAL THE TOLL', lon: 37, lat: 55, dx: 0, dy: 0, region: 'europe' },
  { n: 3, title: 'ABREGO GARCIA LEAVES US FOR SPAIN', detail: 'DEPORTATION BATTLE ENDS IN EXILE', lon: -98, lat: 39, dx: 0, dy: 0, region: 'americas' },
  { n: 4, title: 'JORDAN DEATH SENTENCE FOR KILLER', detail: 'COURT: ATTACK KILLED AN OFFICER', lon: 36, lat: 31, dx: -28, dy: -14, region: 'asia' },
  { n: 5, title: 'CHINA PROBES SHANGHAI PARTY CHIEF', detail: 'CHEN JINING IN GRAFT INVESTIGATION', lon: 121, lat: 31, dx: -14, dy: -8, region: 'asia' },
  { n: 6, title: 'DANANTARA BEHIND SEIZED FOREST LAND', detail: 'REUTERS TRACES INDONESIA CONCESSION', lon: 102, lat: 0, dx: -10, dy: -6, region: 'asia' },
  { n: 7, title: 'ASIAN STOCKS TUMBLE ON TARIFF FEAR', detail: 'NIKKEI -2.8%, SEOUL -5.3%, TAIWAN -5%', lon: 139, lat: 36, dx: 8, dy: -6, region: 'asia' },
  { n: 8, title: 'SENEGAL REGAINS AFCON TITLE', detail: 'CAS RULING HANDS BACK 2025 CROWN', lon: -17, lat: 14, dx: 0, dy: 0, region: 'africa' },
  { n: 9, title: 'CARTAGENA HOSTAGES FREED', detail: 'GUNMEN HELD ABOUT 20 IN SUPERMARKET', lon: -75, lat: 10, dx: -16, dy: -10, region: 'americas' },
  { n: 10, title: 'DOZENS TRAPPED IN INDONESIA MINE', detail: 'RAIN FLOODS 100-METRE-DEEP PIT', lon: 113, lat: -2, dx: 10, dy: 4, region: 'asia' },
  { n: 11, title: 'BANGLADESH TEXTILE PAY UP 36%', detail: 'MINIMUM WAGE RISES AFTER PROTESTS', lon: 90, lat: 24, dx: 0, dy: 0, region: 'asia' },
  { n: 12, title: 'SIX DEAD IN GULF PLANE CRASH', detail: 'SMALL PLANE DOWN IN GULF OF MEXICO', lon: -90, lat: 25, dx: -20, dy: 8, region: 'americas' },
  { n: 13, title: 'WHO: END US FUEL BLOCKADE ON CUBA', detail: 'CHIEF URGES END TO FUEL BLOCKADE', lon: -79, lat: 21, dx: 22, dy: 16, region: 'americas' },
  { n: 14, title: 'COALITION STRIKES HODEIDAH PORT', detail: 'HOUTHIS THREATEN TO HIT JEDDAH', lon: 43, lat: 15, dx: 24, dy: 14, region: 'asia' },
  { n: 15, title: 'TWO LIBYAN SOLDIERS KILLED', detail: 'UKRAINIAN STRIKES HIT RUSSIAN SHIPS', lon: 20, lat: 32, dx: -26, dy: -8, region: 'africa' },
  { n: 16, title: "HOUTHIS HIT RIYADH'S TALLEST TOWER", detail: '11 WOUNDED, SAUDI DEFENCE SAYS', lon: 47, lat: 25, dx: -26, dy: 18, region: 'asia' },
  { n: 17, title: 'TWO TANKERS HIT MINES IN HORMUZ', detail: "IRAN'S GUARDS REPORT THE STRIKES", lon: 57, lat: 26, dx: 22, dy: 10, region: 'asia' },
  { n: 18, title: 'TRUMP WARNS IRAN OVER NUCLEAR DEAL', detail: 'VERY TRAUMATIC OUTCOME IF TALKS FAIL', lon: 51, lat: 35, dx: -8, dy: -26, region: 'asia' },
  { n: 19, title: 'TRUMP PARDONS TURKEYS FOR THANKSGIVING', detail: 'FREEDOM AND FEATHERS SPARED THE AXE', lon: -77, lat: 39, dx: -14, dy: 10, region: 'americas' },
  { n: 20, title: 'GIULIANI GETS MEDAL OF FREEDOM', detail: 'TRUMP HONOURS EX-MAYOR AT CEREMONY', lon: -77, lat: 39, dx: 20, dy: 14, region: 'americas' },
  { n: 21, title: "SPAIN'S LEADERS CLASH IN TV DEBATE", detail: 'SANCHEZ V FEIJOO BEFORE SUNDAY VOTE', lon: -4, lat: 40, dx: -10, dy: 8, region: 'europe' },
  { n: 22, title: 'SOLOMONS SIGN AUSTRALIA TREATY', detail: 'PACT BARS FOREIGN MILITARY BASES', lon: 160, lat: -9, dx: 0, dy: 0, region: 'pacific' },
  { n: 23, title: 'ZAMBIA INDICTS OPPOSITION LEADER', detail: 'TREASON CHARGE AGAINST RIVAL CHIEF', lon: 28, lat: -14, dx: 10, dy: 4, region: 'africa' },
  { n: 24, title: 'DR CONGO PLANE MISSING', detail: 'REBELS CLAIM THEY SHOT IT DOWN', lon: 25, lat: -2, dx: -10, dy: -4, region: 'africa' },
  { n: 25, title: 'DRONE ATTACKS HIT KHARTOUM', detail: 'ABDUCTIONS REPORTED IN BLUE NILE', lon: 32, lat: 15, dx: -18, dy: -8, region: 'africa' },
  { n: 26, title: 'IRAN FLOGS SINGER 74 TIMES', detail: 'PUNISHED OVER UNVEILED CONCERT', lon: 51, lat: 35, dx: 22, dy: -18, region: 'asia' },
  { n: 27, title: "PENTAGON FAULTS CANADA'S SPENDING", detail: "US CRITICISES ALLY'S DEFENCE BUDGET", lon: -75, lat: 45, dx: -16, dy: -14, region: 'americas' },
  { n: 28, title: 'AI FAKES SMEAR TAIWAN CANDIDATES', detail: 'CHINA-LINKED NETWORK, BBC VERIFY', lon: 121, lat: 24, dx: 14, dy: 8, region: 'asia' },
  { n: 29, title: "N KOREAN CHRISTIANS 'SPIED, BEATEN'", detail: 'BBC: JAILED FOR THEIR FAITH', lon: 127, lat: 40, dx: 0, dy: 0, region: 'asia' },
  { n: 30, title: 'NIGERIAN MONARCH, 92, SUSPENDED', detail: 'SEXUAL ASSAULT CLAIMS PROBED', lon: 8, lat: 9, dx: 0, dy: 0, region: 'africa' },
  { n: 31, title: 'BRITAIN SANCTIONS HOUTHI OFFICIALS', detail: 'FOUR REBEL LEADERS FACE MEASURES', lon: 0, lat: 51, dx: 10, dy: -8, region: 'europe' },
  { n: 32, title: 'COLOMBIA CAR BOMB INJURES 23', detail: 'BLAST WOUNDS DOZENS IN CITY', lon: -74, lat: 5, dx: -14, dy: 18, region: 'americas' },
];

// -------------------------------------------------------------- draw ---
const W = 1024;
const H = 1024;

function drawChip(cv: Canvas, cx: number, cy: number, n: number, color: RGB): void {
  const w = 28, h = 22;
  const x = cx - Math.floor(w / 2), y = cy - Math.floor(h / 2);
  cv.fillRect(x, y, w, h, color);
  cv.fillRect(x, y, w, 2, WHITE);
  cv.fillRect(x, y + h - 2, w, 2, WHITE);
  cv.fillRect(x, y, 2, h, WHITE);
  cv.fillRect(x + w - 2, y, 2, h, WHITE);
  const label = String(n);
  const tw = cv.textWidth(label, 2);
  cv.text(label, cx - Math.floor(tw / 2), y + 4, 2, WHITE);
}

function draw(cv: Canvas): void {
  cv.fillRect(0, 0, W, H, PAPER);

  // ---- masthead ----
  cv.fillRect(16, 8, W - 32, 4, RED);
  cv.textCentered('THE WORLD IN ONE DAY', 512, 20, 6, INK);
  cv.textCentered('WEDNESDAY 25 NOVEMBER 2026', 512, 66, 3, RED);
  cv.textCentered('32 STORIES FROM EVERY REGION - ONE DAY OF NEWS, DRAWN AS A MAP', 512, 94, 1, INK_SOFT);
  cv.fillRect(16, 106, W - 32, 2, RULE);

  // ---- world map ----
  cv.fillRect(MAP.x, MAP.y, MAP.w, MAP.h, SEA);
  // graticule
  for (let lon = -150; lon <= 150; lon += 30) {
    const x = mapX(lon);
    for (let y = MAP.y; y < MAP.y + MAP.h; y += 6) cv.px(x, y, GRID_LINE);
  }
  for (let lat = 60; lat >= -60; lat -= 30) {
    const y = mapY(lat);
    for (let x = MAP.x; x < MAP.x + MAP.w; x += 6) cv.px(x, y, GRID_LINE);
  }
  // continents
  for (const poly of CONTINENTS) {
    const pts = poly.map(([lo, la]): [number, number] => [mapX(lo), mapY(la)]);
    cv.fillPolygon(pts, LAND);
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      cv.line(x1, y1, x2, y2, LAND_LINE);
    }
  }
  // equator
  const eqY = mapY(0);
  for (let x = MAP.x; x < MAP.x + MAP.w; x += 8) cv.fillRect(x, eqY, 4, 1, GRID_LINE);
  // markers (a thin leader line joins an offset chip to its true point)
  for (const s of STORIES) {
    const bx = mapX(s.lon), by = mapY(s.lat);
    const cx = bx + s.dx, cy = by + s.dy;
    if (s.dx !== 0 || s.dy !== 0) {
      cv.line(bx, by, cx, cy, INK_SOFT);
      cv.circle(bx, by, 3, REGION[s.region]);
    }
    drawChip(cv, cx, cy, s.n, REGION[s.region]);
  }
  cv.fillRect(MAP.x, MAP.y, MAP.w, 2, RULE);
  cv.fillRect(MAP.x, MAP.y + MAP.h - 2, MAP.w, 2, RULE);

  // ---- map caption + region legend ----
  cv.textCentered('EACH NUMBER MARKS WHERE THE STORY HAPPENED - FIND IT IN THE LIST BELOW', 512, 324, 1, INK_SOFT);
  const legend: Array<[string, RGB]> = [
    ['AMERICAS', REGION.americas], ['EUROPE', REGION.europe], ['AFRICA', REGION.africa],
    ['ASIA', REGION.asia], ['PACIFIC', REGION.pacific],
  ];
  let lx = 343;
  for (const [name, col] of legend) {
    cv.fillRect(lx, 338, 10, 10, col);
    cv.text(name, lx + 14, 340, 1, INK_SOFT);
    lx += 14 + cv.textWidth(name, 1) + 22;
  }

  // ---- story grid: 2 columns x 16 rows ----
  const colX = [16, 520];
  const rowH = 37;
  const gridY = 356;
  for (let i = 0; i < STORIES.length; i++) {
    const s = STORIES[i];
    const col = i < 16 ? 0 : 1;
    const row = i % 16;
    const x = colX[col];
    const y = gridY + row * rowH;
    drawChip(cv, x + 14, y + 10, s.n, REGION[s.region]);
    const tx = x + 34;
    // Width guard: every line must fit the 454 px column at scale 2.
    if (cv.textWidth(s.title, 2) > 454 || cv.textWidth(s.detail, 2) > 454) {
      throw new Error(`story ${s.n} line too long for the column`);
    }
    cv.text(s.title, tx, y, 2, INK);
    cv.text(s.detail, tx, y + 16, 2, INK_SOFT);
    if (row < 15) cv.fillRect(x, y + 31, 488, 1, [214, 210, 198]);
  }

  // ---- footer ----
  const footY = gridY + 16 * rowH + 8; // 956
  cv.fillRect(16, footY, W - 32, 2, RULE);
  cv.textCentered('MARKETS 25 NOV: NIKKEI -2.76% - S&P 500 -0.50% - BRENT $87.49 - SENSEX +1.8%', 512, footY + 8, 2, INK);
  cv.textCentered('ALL STORIES HAPPENED OR WERE FIRST REPORTED ON 25 NOVEMBER 2026 - SOURCES: REUTERS, BBC, ONE TURN, HORIZON', 512, footY + 30, 1, INK_SOFT);
  cv.textCentered('DRAWN BY CODE - NO PHOTOGRAPHS - MAKE.FUN NEWS-IMAGE-20261125', 512, footY + 44, 1, INK_SOFT);
}

// --------------------------------------------------------------- main --
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
const cv = new Canvas(W, H);
draw(cv);
const png = encodePNG(cv);
writeFileSync(join(outDir, 'entry.png'), png);
console.log(`wrote ${join(outDir, 'entry.png')} ${png.length} bytes ${W}x${H}`);
