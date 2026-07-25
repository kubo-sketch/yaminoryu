/* =====================================================================
   render_preview.js — sprites.js が生成する絵を PNG に書き出す。
   ---------------------------------------------------------------------
   ブラウザを立ち上げずにドット絵を目視確認するための道具。
   Canvas2D のうち sprites.js が使う分だけを自前実装し、
   zlib で PNG を書く（外部パッケージ不要）。

     node tools/render_preview.js [出力先ディレクトリ]
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SRC = path.join(__dirname, '..', 'src');
const OUT = process.argv[2] || path.join(__dirname, '..', 'preview');

/* =====================================================================
   最小の Canvas2D 実装
   ===================================================================== */
function parseColor(s) {
  if (typeof s !== 'string') return [0, 0, 0, 0];
  s = s.trim();
  let m;
  if ((m = /^#([0-9a-f]{6})$/i.exec(s))) {
    const v = parseInt(m[1], 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255, 255];
  }
  if ((m = /^#([0-9a-f]{3})$/i.exec(s))) {
    const r = parseInt(m[1][0], 16), g = parseInt(m[1][1], 16), b = parseInt(m[1][2], 16);
    return [r * 17, g * 17, b * 17, 255];
  }
  if ((m = /^rgba?\(([^)]+)\)$/i.exec(s))) {
    const p = m[1].split(',').map((x) => parseFloat(x));
    return [p[0] | 0, p[1] | 0, p[2] | 0, Math.round((p[3] === undefined ? 1 : p[3]) * 255)];
  }
  return [255, 0, 255, 255];        // 未知の色はマゼンタ（発見しやすく）
}

class Ctx {
  constructor(cv) {
    this.cv = cv;
    this.fillStyle = '#000000';
    this.strokeStyle = '#000000';
    this.lineWidth = 1;
    this.globalAlpha = 1;
    this.globalCompositeOperation = 'source-over';
    this.imageSmoothingEnabled = false;
    this.font = ''; this.textAlign = 'left'; this.textBaseline = 'top';
  }
  _blend(x, y, r, g, b, a) {
    const cv = this.cv;
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= cv.width || y >= cv.height) return;
    a = a * this.globalAlpha;
    if (a <= 0) return;
    const i = (y * cv.width + x) * 4;
    const d = cv.data;
    const sa = a / 255;
    const da = d[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa <= 0) { d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0; return; }
    d[i] = (r * sa + d[i] * da * (1 - sa)) / oa;
    d[i + 1] = (g * sa + d[i + 1] * da * (1 - sa)) / oa;
    d[i + 2] = (b * sa + d[i + 2] * da * (1 - sa)) / oa;
    d[i + 3] = oa * 255;
  }
  fillRect(x, y, w, h) {
    const c = parseColor(this.fillStyle);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this._blend(x + i, y + j, c[0], c[1], c[2], c[3]);
  }
  clearRect(x, y, w, h) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const xx = (x + i) | 0, yy = (y + j) | 0;
      if (xx < 0 || yy < 0 || xx >= this.cv.width || yy >= this.cv.height) continue;
      const k = (yy * this.cv.width + xx) * 4;
      this.cv.data[k] = this.cv.data[k + 1] = this.cv.data[k + 2] = this.cv.data[k + 3] = 0;
    }
  }
  // drawImage(img, dx, dy) / (img, dx,dy,dw,dh) / (img, sx,sy,sw,sh, dx,dy,dw,dh)
  drawImage(img) {
    if (!img || img.width === undefined) throw new Error('drawImage: 画像でないものが渡された');
    let sx = 0, sy = 0, sw = img.width, sh = img.height, dx, dy, dw, dh;
    if (arguments.length === 3) { dx = arguments[1]; dy = arguments[2]; dw = sw; dh = sh; }
    else if (arguments.length === 5) { dx = arguments[1]; dy = arguments[2]; dw = arguments[3]; dh = arguments[4]; }
    else {
      sx = arguments[1]; sy = arguments[2]; sw = arguments[3]; sh = arguments[4];
      dx = arguments[5]; dy = arguments[6]; dw = arguments[7]; dh = arguments[8];
    }
    // 最近傍で拡大縮小（ドット絵なのでこれが正しい）
    for (let j = 0; j < dh; j++) {
      const syy = sy + Math.floor((j * sh) / dh);
      for (let i = 0; i < dw; i++) {
        const sxx = sx + Math.floor((i * sw) / dw);
        if (sxx < 0 || syy < 0 || sxx >= img.width || syy >= img.height) continue;
        const k = (syy * img.width + sxx) * 4;
        const a = img.data[k + 3];
        if (!a) continue;
        this._blend(dx + i, dy + j, img.data[k], img.data[k + 1], img.data[k + 2], a);
      }
    }
  }
  getImageData(x, y, w, h) {
    const out = new Uint8ClampedArray(w * h * 4);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const sx = x + i, sy = y + j;
      if (sx < 0 || sy < 0 || sx >= this.cv.width || sy >= this.cv.height) continue;
      const k = (sy * this.cv.width + sx) * 4, o = (j * w + i) * 4;
      out[o] = this.cv.data[k]; out[o + 1] = this.cv.data[k + 1];
      out[o + 2] = this.cv.data[k + 2]; out[o + 3] = this.cv.data[k + 3];
    }
    return { width: w, height: h, data: out };
  }
  putImageData(img, dx, dy) {
    for (let j = 0; j < img.height; j++) for (let i = 0; i < img.width; i++) {
      const k = (j * img.width + i) * 4;
      this._blend(dx + i, dy + j, img.data[k], img.data[k + 1], img.data[k + 2], img.data[k + 3]);
    }
  }
  // 使わないが呼ばれても落ちないように
  save() {} restore() {} translate() {} scale() {} beginPath() {} closePath() {}
  moveTo() {} lineTo() {} fill() {} stroke() {} strokeRect() {} clip() {}
  arc() {} ellipse() {} rect() {} fillText() {} strokeText() {}
  measureText(s) { return { width: String(s).length * 8 }; }
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }
}

class Cv {
  constructor(w, h) {
    this.width = w || 300; this.height = h || 150;
    this.data = new Uint8ClampedArray(this.width * this.height * 4);
    this._ctx = null;
    this.style = {};
  }
  getContext() {
    if (!this._ctx) this._ctx = new Ctx(this);
    return this._ctx;
  }
}
// width/height への代入でバッファを作り直す（sprites.js は生成直後に設定する）
Object.defineProperty(Cv.prototype, 'resize', { value: function (w, h) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); } });

/* =====================================================================
   PNG 書き出し
   ===================================================================== */
const CRC_T = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function writePNG(file, cv) {
  const w = cv.width, h = cv.height;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w * 4; x++) raw[y * (w * 4 + 1) + 1 + x] = cv.data[y * w * 4 + x];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(file, png);
  return png.length;
}

/* =====================================================================
   sprites.js / maps.js を読み込む
   ===================================================================== */
global.window = {};
global.document = {
  createElement: (tag) => (tag === 'canvas' ? new Cv() : { style: {} }),
  getElementById: () => null,
  querySelectorAll: () => ({ forEach: () => {} }),
};
['sprites.js', 'data.js', 'maps.js'].forEach((f) =>
  new Function(fs.readFileSync(path.join(SRC, f), 'utf8'))());
const G = global.window.G;
// sprites.js は canvas.width=w を代入するので、バッファを合わせ直す
const origMk = document.createElement;
G.initSprites();
G.buildMaps();

/* =====================================================================
   シート出力
   ===================================================================== */
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

function sheet(file, items, opt) {
  const o = Object.assign({ scale: 4, cols: 8, pad: 6, bg: '#20242e', cell: 16 }, opt);
  const cell = o.cell * o.scale + o.pad * 2;
  const cols = Math.min(o.cols, items.length);
  const rows = Math.ceil(items.length / cols);
  const cv = new Cv(cols * cell, rows * cell);
  const g = cv.getContext('2d');
  g.fillStyle = o.bg; g.fillRect(0, 0, cv.width, cv.height);
  // 市松模様で1マスの境界を見せる
  items.forEach((img, i) => {
    const cx = (i % cols) * cell, cy = Math.floor(i / cols) * cell;
    g.fillStyle = (i % 2) ? '#262b36' : '#1c2029';
    g.fillRect(cx, cy, cell, cell);
    if (!img) return;
    g.drawImage(img, 0, 0, img.width, img.height,
      cx + o.pad, cy + o.pad, img.width * o.scale, img.height * o.scale);
  });
  const bytes = writePNG(path.join(OUT, file), cv);
  console.log('  ' + file + '  ' + cv.width + 'x' + cv.height + '  ' + (bytes / 1024).toFixed(1) + 'KB');
}

console.log('出力先: ' + OUT);

/* --- タイル --- */
const tileNames = Object.keys(G.TILE);
const tiles = [];
const labels = [];
tileNames.forEach((k) => {
  let v = G.TILE[k];
  if (Array.isArray(v) && Array.isArray(v[0])) v = v[0];      // [variant|frame][mask]
  if (Array.isArray(v)) {
    if (v.length === 16) { tiles.push(v[15], v[0]); labels.push(k + '(連)', k + '(孤)'); }
    else { tiles.push(v[0]); labels.push(k); }                 // 模様違いのみ
  } else { tiles.push(v); labels.push(k); }
});
sheet('01_tiles.png', tiles, { scale: 5, cols: 8 });
console.log('     ' + labels.join(' / '));

// オートタイルの全16パターン（境界の描き分けを確認する用）
['road', 'water', 'cwall', 'cfloor', 'brick', 'floor'].forEach((k) => {
  let v = G.TILE[k];
  if (Array.isArray(v) && Array.isArray(v[0])) v = v[0];
  if (!Array.isArray(v) || v.length !== 16) return;
  sheet('05_auto_' + k + '.png', v, { scale: 5, cols: 8 });
});

/* --- キャラ（全方向・全コマ） --- */
const charNames = Object.keys(G.SPR);
const chars = [];
charNames.forEach((k) => {
  const set = G.SPR[k];
  for (let d = 0; d < 4; d++) for (let f = 0; f < 2; f++) chars.push(set[d][f]);
});
sheet('02_chars.png', chars, { scale: 5, cols: 8, cell: 24 });
console.log('     ' + charNames.join(' / ') + '（各行=1キャラ／下左右上×2コマ）');

/* --- 敵 --- */
const enemyNames = Object.keys(G.ENEMY);
sheet('03_enemies.png', enemyNames.map((k) => G.ENEMY[k]),
  { scale: 3, cols: 3, cell: 64, bg: '#101a2e' });
console.log('     ' + enemyNames.join(' / '));

/* =====================================================================
   実際のゲーム画面（マップ描画の再現）
   ===================================================================== */
function renderMap(file, mapId, px, py, opt) {
  const o = Object.assign({ vw: 15, vh: 13, scale: 3 }, opt || {});
  const m = G.MAPS[mapId];
  const TS = 16, T = TS * o.scale;
  const cv = new Cv(o.vw * T, o.vh * T);
  const g = cv.getContext('2d');
  g.fillStyle = m.indoor ? '#12121c' : '#1b2a1a';
  g.fillRect(0, 0, cv.width, cv.height);

  let camX = px * T + T / 2 - cv.width / 2;
  let camY = py * T + T / 2 - cv.height / 2;
  const maxX = m.w * T - cv.width, maxY = m.h * T - cv.height;
  camX = maxX <= 0 ? maxX / 2 : Math.max(0, Math.min(camX, maxX));
  camY = maxY <= 0 ? maxY / 2 : Math.max(0, Math.min(camY, maxY));

  const x0 = Math.floor(camX / T), y0 = Math.floor(camY / T);
  const ox = -(camX - x0 * T), oy = -(camY - y0 * T);
  const CH = G.CH, lift = (CH - TS) * o.scale;
  const autoMask = (mx, my, grp) => {
    const same = (x, y) => {
      if (x < 0 || y < 0 || x >= m.w || y >= m.h) return true;
      const d = G.TILEDEF[m.rows[y][x]];
      return !!d && (d.auto === grp || d.group === grp);
    };
    return (same(mx, my - 1) ? 1 : 0) | (same(mx + 1, my) ? 2 : 0)
      | (same(mx, my + 1) ? 4 : 0) | (same(mx - 1, my) ? 8 : 0);
  };
  for (let j = 0; j <= o.vh; j++) for (let i = 0; i <= o.vw; i++) {
    const mx = x0 + i, my = y0 + j;
    if (mx < 0 || my < 0 || mx >= m.w || my >= m.h) continue;
    const ch = m.rows[my][mx];
    const def = G.TILEDEF[ch];
    if (!def) continue;
    let img = G.TILE[def.tile];
    if (!img) continue;
    const vari = (mx * 7 + my * 13 + ((mx * my) & 7)) & 0xffff;
    if (def.auto) {
      const mask = autoMask(mx, my, def.auto);
      const set = def.anim ? img[0] : img[vari % img.length];
      img = set[mask];
    } else if (Array.isArray(img)) img = def.anim ? img[0] : img[vari % img.length];
    g.drawImage(img, 0, 0, TS, TS, Math.round(ox + i * T), Math.round(oy + j * T), T, T);
  }
  const actors = [];
  (m.npcs || []).forEach((n) => {
    const sx = n.x * T - camX, sy = n.y * T - camY;
    if (sx < -T * 2 || sy < -T * 2 || sx > cv.width + T || sy > cv.height + T) return;
    actors.push({ x: sx, y: sy, img: G.SPR[n.spr][n.dir][0] });
  });
  actors.push({ x: px * T - camX, y: py * T - camY, img: G.SPR.hero[0][0] });
  actors.sort((a, b) => a.y - b.y);
  actors.forEach((a) => {                       // 落ち影（楕円を手で塗る）
    const cx = a.x + T / 2, cy = a.y + T - 5, rx = T * 0.30, ry = T * 0.12;
    for (let yy = -ry; yy <= ry; yy++)
      for (let xx = -rx; xx <= rx; xx++)
        if ((xx * xx) / (rx * rx) + (yy * yy) / (ry * ry) <= 1)
          g.fillStyle = 'rgba(10,8,20,0.30)', g.fillRect(Math.round(cx + xx), Math.round(cy + yy), 1, 1);
  });
  actors.forEach((a) => {
    g.drawImage(a.img, 0, 0, TS, CH, Math.round(a.x), Math.round(a.y - lift), T, CH * o.scale);
  });
  for (let j = -1; j <= o.vh; j++) for (let i = 0; i <= o.vw; i++) {
    const mx = x0 + i, my = y0 + j;
    if (mx < 0 || my < 0 || mx >= m.w || my >= m.h) continue;
    const def = G.TILEDEF[m.rows[my][mx]];
    if (!def || !def.over) continue;
    let img = G.TILE[def.tile];
    const vari = (mx * 7 + my * 13 + ((mx * my) & 7)) & 0xffff;
    if (def.auto) {
      const mask = autoMask(mx, my, def.auto);
      img = (def.anim ? img[0] : img[vari % img.length])[mask];
    } else if (Array.isArray(img)) img = def.anim ? img[0] : img[vari % img.length];
    g.drawImage(img, 0, 0, TS, def.over,
      Math.round(ox + i * T), Math.round(oy + j * T), T, def.over * o.scale);
  }

  const bytes = writePNG(path.join(OUT, file), cv);
  console.log('  ' + file + '  ' + cv.width + 'x' + cv.height + '  ' + (bytes / 1024).toFixed(1) + 'KB');
}

console.log('\nゲーム画面:');
renderMap('10_town.png', 'town', 11, 8);
renderMap('11_town_shop.png', 'town', 6, 5);
renderMap('12_field.png', 'field', 20, 20);
renderMap('13_field_river.png', 'field', 20, 14);
renderMap('14_cave.png', 'cave1', 11, 5);

/* --- 戦闘画面（敵の見え方） --- */
function renderBattle(file, enemyId, indoor) {
  const d = G.ENEMIES[enemyId];
  const W = 720, H = 624, S = 3;
  const cv = new Cv(W, H);
  const g = cv.getContext('2d');
  // 背景（battle.js と同じ3層構成を近似）
  const HZ = 396;
  for (let y = 0; y < HZ; y++) {
    const t = y / HZ;
    let r, gg, b;
    if (indoor) { r = 13 + t * 29; gg = 10 + t * 23; b = 18 + t * 30; }
    else { r = 10 + t * 35; gg = 16 + t * 47; b = 36 + t * 71; }
    g.fillStyle = `rgb(${r | 0},${gg | 0},${b | 0})`;
    g.fillRect(0, y, W, 1);
  }
  const shape = (col, list) => { list.forEach(([bx, bw, bh]) => {
    g.fillStyle = col;
    for (let i = 0; i < bh; i++) {
      const w = Math.round(bw * (i / bh));
      g.fillRect(Math.round(bx + bw / 2 - w / 2), HZ - bh + i, w, 1);
    }
  }); };
  if (indoor) {
    g.fillStyle = '#181320';
    for (let i = 0; i < 9; i++) {
      const x = i * 88 + ((i * 37) % 40), w = 26 + ((i * 17) % 22), h = 60 + ((i * 53) % 90);
      for (let j = 0; j < h; j++) {
        const ww = Math.round(w * (1 - j / h));
        g.fillRect(Math.round(x + w / 2 - ww / 2), j, ww, 1);
      }
    }
    g.fillStyle = '#241d2c';
    for (let i = 0; i < 6; i++) g.fillRect(i * 130 - 30, HZ - (90 + ((i * 47) % 70)), 170, 90 + ((i * 47) % 70));
  } else {
    for (let i = 0; i < 46; i++) { g.fillStyle = '#e8e4d2'; g.fillRect((i * 151) % W, (i * 73) % 240, 2, 2); }
    shape('#111a33', [0,1,2,3,4,5].map(i => [i * 150 - 40, 240, 130 + ((i * 61) % 70)]));
    shape('#0b1224', [0,1,2,3,4].map(i => [i * 190 - 90, 260, 80 + ((i * 43) % 50)]));
  }
  const gt = indoor ? G.TILE.cfloor[0][15] : G.TILE.grass[0];
  for (let gy = HZ; gy < H; gy += 48)
    for (let gx = 0; gx < W; gx += 48)
      g.drawImage(gt, 0, 0, 16, 16, gx, gy, 48, 48);
  for (let y = HZ; y < H; y++) {
    const a = 0.72 - 0.32 * ((y - HZ) / (H - HZ));
    g.fillStyle = `rgba(6,6,14,${a.toFixed(3)})`;
    g.fillRect(0, y, W, 1);
  }
  const img = G.ENEMY[d.spr];
  const sc = Math.min((d.scale || 2) * S, 296 / img.height);   // battle.js と同じ頭打ち
  const w = img.width * sc, h = img.height * sc;
  g.drawImage(img, 0, 0, img.width, img.height,
    Math.round((W - w) / 2), Math.round(400 - h), w, h);
  const bytes = writePNG(path.join(OUT, file), cv);
  console.log('  ' + file + '  ' + d.name + '  ' + (bytes / 1024).toFixed(1) + 'KB');
}
console.log('\n戦闘画面:');
renderBattle('20_battle_slime.png', 'slime', false);
renderBattle('21_battle_skeleton.png', 'skeleton', true);
renderBattle('22_battle_boss.png', 'boss', true);

console.log('\n完了。');
