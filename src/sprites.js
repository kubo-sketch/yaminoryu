/* =====================================================================
   sprites.js — 全グラフィックをコードで生成する（外部画像ファイル 0枚）
   ---------------------------------------------------------------------
   ・タイルとキャラは 16x16、敵は 48x48（ボスのみ 64x64）で生成
   ・生成物は <canvas> として G.TILE / G.SPR / G.ENEMY に保持
   ・描画時は S 倍（既定3倍）に拡大。imageSmoothing は必ず false
   ===================================================================== */
(function () {
  'use strict';
  const G = (window.G = window.G || {});

  /* ---------------- パレット（この15色＋αに固定する） ---------------- */
  const C = {
    out: '#181425',
    white: '#f2f0e5',
    skin: '#f0b088', skinD: '#c07a55',
    hair: '#8a5a2b', hairD: '#5c3a1a',
    blue: '#3f6fb5', blueD: '#28477a',
    red: '#c8433a', redD: '#8a2a26',
    green: '#5a8f3d', greenD: '#3d6b28',
    gold: '#e8c34a', goldD: '#a8832a',
    purple: '#7a4f9a', purpleD: '#4a2d63',
    grass: '#6aa84f', grassL: '#7cbb5c', grassD: '#4f8a3a',
    road: '#c9a86a', roadD: '#ab8a52',
    water: '#3a7bbf', waterL: '#69a8dd', waterD: '#295b91',
    rock: '#8a8a9a', rockD: '#5a5a6a',
    brick: '#a5715a', brickD: '#754a38',
    roof: '#b8483f', roofD: '#7d2c26',
    wood: '#9a6b3f', woodD: '#654425',
    floor: '#c9b394', floorD: '#a08a6c',
    cave: '#6b675c', caveD: '#403d36', caveL: '#847f72',
    bone: '#e8e4d4', boneD: '#a8a291',
    dark: '#12121c',
    steel: '#b6c0cc', steelD: '#7d8794',
  };
  G.C = C;

  /* ---------------- 低レベルヘルパ ---------------- */
  function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    return c;
  }
  function px(g, x, y, col, w, h) {
    g.fillStyle = col;
    g.fillRect(x | 0, y | 0, w === undefined ? 1 : w, h === undefined ? 1 : h);
  }
  // ピクセルパーフェクトな塗り円（arc を使うとドット感が消えるため自前）
  function disc(g, cx, cy, r, col) {
    const rr = r * r + r * 0.6;
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++)
        if (x * x + y * y <= rr) px(g, cx + x, cy + y, col);
  }
  // 塗り楕円
  function ellipse(g, cx, cy, rx, ry, col) {
    for (let y = -ry; y <= ry; y++)
      for (let x = -rx; x <= rx; x++) {
        const v = (x * x) / (rx * rx) + (y * y) / (ry * ry);
        if (v <= 1.04) px(g, cx + x, cy + y, col);
      }
  }
  // 上半分だけの楕円（スライム等の「おわん」形）
  function dome(g, cx, cy, rx, ry, col) {
    for (let y = -ry; y <= 0; y++)
      for (let x = -rx; x <= rx; x++) {
        const v = (x * x) / (rx * rx) + (y * y) / (ry * ry);
        if (v <= 1.04) px(g, cx + x, cy + y, col);
      }
  }
  // 塗り三角（上頂点 → 底辺）
  function tri(g, cx, topY, halfW, h, col) {
    for (let i = 0; i < h; i++) {
      const w = Math.round((halfW * 2 * (i + 1)) / h);
      px(g, cx - (w >> 1), topY + i, col, Math.max(1, w), 1);
    }
  }
  // 決定論的な擬似乱数（タイルの模様を毎回同じにするため）
  function rng(seed) {
    let s = seed | 0;
    return function () {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  }
  // 図形の外周に輪郭を足す（アルファを見て縁取り）
  function outline(cv, col) {
    const g = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    const src = g.getImageData(0, 0, w, h);
    const a = src.data;
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : a[(y * w + x) * 4 + 3]);
    const add = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (!at(x, y) && (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)))
          add.push(x, y);
    for (let i = 0; i < add.length; i += 2) px(g, add[i], add[i + 1], col);
    return cv;
  }
  G.mk = mk; G.px = px;

  /* =====================================================================
     タイル（16x16）
     ===================================================================== */
  function tGrass(seed) {
    const c = mk(16, 16), g = c.getContext('2d');
    const r = rng(seed);
    px(g, 0, 0, C.grass, 16, 16);
    for (let i = 0; i < 26; i++) px(g, (r() * 16) | 0, (r() * 16) | 0, r() < 0.5 ? C.grassL : C.grassD);
    // 草の房を2〜3個
    for (let i = 0; i < 3; i++) {
      const x = 2 + ((r() * 12) | 0), y = 3 + ((r() * 11) | 0);
      px(g, x, y, C.grassD); px(g, x - 1, y + 1, C.grassD); px(g, x + 1, y + 1, C.grassD);
    }
    return c;
  }
  function tRoad() {
    const c = mk(16, 16), g = c.getContext('2d');
    const r = rng(7);
    px(g, 0, 0, C.road, 16, 16);
    for (let i = 0; i < 22; i++) px(g, (r() * 16) | 0, (r() * 16) | 0, C.roadD);
    return c;
  }
  function tWater(frame) {
    const c = mk(16, 16), g = c.getContext('2d');
    px(g, 0, 0, C.water, 16, 16);
    const off = frame * 4;
    for (let y = 2; y < 16; y += 6) {
      for (let x = 0; x < 16; x++) {
        const yy = y + Math.round(Math.sin((x + off) * 0.6) * 1.2);
        px(g, x, yy, C.waterL);
        px(g, x, yy + 3, C.waterD);
      }
    }
    return c;
  }
  function tTree() {
    const c = mk(16, 16), g = c.getContext('2d');
    g.drawImage(tGrass(3), 0, 0);
    px(g, 7, 11, C.woodD, 3, 5);
    px(g, 8, 11, C.wood, 1, 5);
    disc(g, 8, 7, 5, C.green);
    disc(g, 5, 8, 3, C.greenD);
    disc(g, 11, 8, 3, C.greenD);
    disc(g, 8, 5, 3, C.grassL);
    for (let i = 0; i < 8; i++) px(g, 4 + ((i * 5) % 9), 4 + ((i * 3) % 7), C.greenD);
    return c;
  }
  function tMountain() {
    const c = mk(16, 16), g = c.getContext('2d');
    g.drawImage(tGrass(11), 0, 0);
    tri(g, 8, 1, 8, 15, C.rock);
    // 陰影（右側を暗く）
    for (let i = 0; i < 15; i++) {
      const w = Math.round((16 * (i + 1)) / 15);
      const x0 = 8 - (w >> 1);
      px(g, x0 + Math.ceil(w * 0.55), 1 + i, C.rockD, Math.max(1, w - Math.ceil(w * 0.55)), 1);
    }
    px(g, 7, 2, C.white, 3, 2);
    px(g, 6, 4, C.white, 2, 1);
    return c;
  }
  function tBrick() {
    const c = mk(16, 16), g = c.getContext('2d');
    px(g, 0, 0, C.brick, 16, 16);
    for (let y = 0; y < 16; y += 4) {
      px(g, 0, y, C.brickD, 16, 1);
      const off = (y / 4) % 2 ? 0 : 8;
      px(g, off, y, C.brickD, 1, 4);
      px(g, (off + 8) % 16, y, C.brickD, 1, 4);
    }
    for (let i = 0; i < 10; i++) px(g, (i * 7) % 16, (i * 5) % 16, '#b07f68');
    return c;
  }
  function tRoof() {
    const c = mk(16, 16), g = c.getContext('2d');
    px(g, 0, 0, C.roof, 16, 16);
    for (let y = 0; y < 16; y += 4) {
      px(g, 0, y + 3, C.roofD, 16, 1);
      for (let x = ((y / 4) % 2) * 2; x < 16; x += 4) px(g, x, y, C.roofD, 1, 3);
    }
    return c;
  }
  function tRoofTop() {
    const c = mk(16, 16), g = c.getContext('2d');
    g.drawImage(tRoof(), 0, 0);
    px(g, 0, 0, C.out, 16, 2);
    px(g, 0, 2, '#d4635a', 16, 1);
    return c;
  }
  function tDoor() {
    const c = mk(16, 16), g = c.getContext('2d');
    g.drawImage(tBrick(), 0, 0);
    px(g, 3, 3, C.woodD, 10, 13);
    px(g, 4, 4, C.wood, 8, 12);
    px(g, 7, 4, C.woodD, 1, 12);
    px(g, 10, 9, C.gold, 2, 2);
    px(g, 4, 3, C.woodD, 8, 1);
    return c;
  }
  function tFloor() {
    const c = mk(16, 16), g = c.getContext('2d');
    px(g, 0, 0, C.floor, 16, 16);
    for (let y = 0; y < 16; y += 8) px(g, 0, y, C.floorD, 16, 1);
    for (let x = 0; x < 16; x += 8) px(g, x, 0, C.floorD, 1, 16);
    const r = rng(21);
    for (let i = 0; i < 14; i++) px(g, (r() * 16) | 0, (r() * 16) | 0, C.floorD);
    return c;
  }
  function tCaveFloor(seed) {
    const c = mk(16, 16), g = c.getContext('2d');
    const r = rng(seed);
    px(g, 0, 0, C.cave, 16, 16);
    for (let i = 0; i < 30; i++) px(g, (r() * 16) | 0, (r() * 16) | 0, r() < 0.5 ? C.caveL : C.caveD);
    for (let i = 0; i < 2; i++) {
      const x = 3 + ((r() * 10) | 0), y = 3 + ((r() * 10) | 0);
      px(g, x, y, C.caveD, 2, 1); px(g, x, y + 1, C.caveD, 1, 1);
    }
    return c;
  }
  function tCaveWall() {
    const c = mk(16, 16), g = c.getContext('2d');
    const r = rng(33);
    px(g, 0, 0, C.caveD, 16, 16);
    for (let i = 0; i < 40; i++) {
      const x = (r() * 16) | 0, y = (r() * 16) | 0;
      px(g, x, y, r() < 0.4 ? C.cave : '#33312b', 2, 1);
    }
    px(g, 0, 0, '#7a756a', 16, 1);
    return c;
  }
  function tStairs(down) {
    const c = mk(16, 16), g = c.getContext('2d');
    g.drawImage(down ? tCaveFloor(5) : tCaveFloor(6), 0, 0);
    px(g, 2, 2, C.out, 12, 12);
    for (let i = 0; i < 3; i++) {
      const y = 3 + i * 4, w = down ? 10 - i * 2 : 4 + i * 3;
      px(g, 3, y, C.rock, w, 3);
      px(g, 3, y + 2, C.rockD, w, 1);
    }
    return c;
  }
  function tCaveEntrance() {
    const c = mk(16, 16), g = c.getContext('2d');
    g.drawImage(tMountain(), 0, 0);
    dome(g, 8, 15, 5, 9, C.dark);
    px(g, 3, 14, C.dark, 10, 2);
    px(g, 3, 13, C.rockD, 1, 3); px(g, 12, 13, C.rockD, 1, 3);
    return c;
  }
  function tBridge() {
    const c = mk(16, 16), g = c.getContext('2d');
    g.drawImage(tWater(0), 0, 0);
    px(g, 0, 3, C.woodD, 16, 10);
    px(g, 0, 4, C.wood, 16, 8);
    for (let x = 0; x < 16; x += 4) px(g, x, 4, C.woodD, 1, 8);
    px(g, 0, 3, C.woodD, 16, 1); px(g, 0, 12, C.woodD, 16, 1);
    return c;
  }
  function tSign() {
    const c = mk(16, 16), g = c.getContext('2d');
    g.drawImage(tGrass(9), 0, 0);
    px(g, 7, 9, C.woodD, 2, 7);
    px(g, 2, 3, C.woodD, 12, 7);
    px(g, 3, 4, C.wood, 10, 5);
    px(g, 4, 5, C.woodD, 8, 1);
    px(g, 4, 7, C.woodD, 6, 1);
    return c;
  }
  function tChest(open) {
    const c = mk(16, 16), g = c.getContext('2d');
    px(g, 2, 6, C.out, 12, 9);
    px(g, 3, 7, C.wood, 10, 7);
    if (open) {
      px(g, 3, 7, C.dark, 10, 3);
      px(g, 2, 4, C.out, 12, 3); px(g, 3, 5, C.woodD, 10, 1);
    } else {
      px(g, 3, 9, C.woodD, 10, 1);
      px(g, 7, 9, C.gold, 2, 3);
    }
    px(g, 3, 13, C.woodD, 10, 1);
    px(g, 2, 15, 'rgba(0,0,0,0.2)', 12, 1);
    return c;
  }
  function tCounter() {
    const c = mk(16, 16), g = c.getContext('2d');
    g.drawImage(tFloor(), 0, 0);
    px(g, 0, 4, C.woodD, 16, 9);
    px(g, 0, 5, C.wood, 16, 7);
    px(g, 0, 4, '#b8834f', 16, 1);
    for (let x = 2; x < 16; x += 5) px(g, x, 6, C.woodD, 1, 6);
    return c;
  }
  function tFlower() {
    const c = mk(16, 16), g = c.getContext('2d');
    g.drawImage(tGrass(13), 0, 0);
    const pts = [[4, 5, C.red], [10, 4, C.gold], [7, 10, C.white], [12, 11, C.red]];
    pts.forEach(function (p) {
      px(g, p[0], p[1], p[2]); px(g, p[0] - 1, p[1], p[2]); px(g, p[0] + 1, p[1], p[2]);
      px(g, p[0], p[1] - 1, p[2]); px(g, p[0], p[1] + 1, p[2]);
      px(g, p[0], p[1], C.gold === p[2] ? C.red : C.gold);
    });
    return c;
  }
  function tThrone() {
    const c = mk(16, 16), g = c.getContext('2d');
    g.drawImage(tFloor(), 0, 0);
    px(g, 3, 1, C.out, 10, 15);
    px(g, 4, 2, C.purple, 8, 13);
    px(g, 4, 2, C.purpleD, 8, 2);
    px(g, 5, 5, C.gold, 6, 1);
    px(g, 4, 10, C.purpleD, 8, 1);
    return c;
  }

  /* =====================================================================
     キャラクター（16x16／4方向 × 2コマ）
     ===================================================================== */
  const DOWN = 0, LEFT = 1, RIGHT = 2, UP = 3;
  G.DIR = { DOWN: DOWN, LEFT: LEFT, RIGHT: RIGHT, UP: UP };

  function charFrame(o, dir, frame) {
    const c = mk(16, 16), g = c.getContext('2d');
    const hair = o.hair, hairD = o.hairD || C.hairD;
    const body = o.body, bodyD = o.bodyD || C.out;
    const boot = o.boot || C.woodD;
    const skin = o.skin || C.skin;
    const back = dir === UP;
    const side = dir === LEFT || dir === RIGHT;

    // 足（frame で交互に前後）
    const sw = frame ? 1 : 0;
    if (side) {
      px(g, 6 + sw, 12, boot, 3, 3);
      px(g, 8 - sw, 12, boot, 3, 3);
    } else {
      px(g, 5, 12, boot, 3, 3);
      px(g, 9, 12, boot, 3, 3);
      if (frame) { px(g, 5, 14, C.out, 3, 1); } else { px(g, 9, 14, C.out, 3, 1); }
    }

    // 胴（マント風に肩を広く）
    const bw = side ? 6 : 8;
    const bx = side ? 5 : 4;
    px(g, bx, 8, body, bw, 5);
    px(g, bx, 8, o.bodyL || body, bw, 1);
    px(g, bx, 12, bodyD, bw, 1);
    // 腕
    if (side) {
      px(g, dir === LEFT ? 4 : 11, 9, skin, 1, 3);
    } else {
      px(g, 3, 9, body, 1, 3); px(g, 12, 9, body, 1, 3);
      px(g, 3, 11, skin, 1, 1); px(g, 12, 11, skin, 1, 1);
    }
    // ベルト
    px(g, bx, 11, o.belt || C.woodD, bw, 1);

    // 頭
    if (back) {
      px(g, 4, 2, hair, 8, 6);
      px(g, 4, 2, o.hairL || hair, 8, 1);
      px(g, 4, 7, hairD, 8, 1);
    } else if (side) {
      const f = dir === LEFT ? 0 : 1;
      px(g, 4, 3, skin, 8, 5);          // 顔（横）
      px(g, 4, 2, hair, 8, 3);          // 髪
      px(g, f ? 4 : 11, 3, hair, 1, 3); // 後頭部側
      px(g, f ? 11 : 4, 6, C.skinD, 1, 2);
      px(g, f ? 10 : 5, 5, C.out, 1, 1);  // 目（1つ）
    } else {
      px(g, 4, 4, skin, 8, 4);          // 顔
      px(g, 5, 8, C.skinD, 6, 1);
      px(g, 4, 2, hair, 8, 3);          // 髪
      px(g, 4, 2, o.hairL || hair, 8, 1);
      px(g, 3, 3, hair, 1, 3); px(g, 12, 3, hair, 1, 3);
      px(g, 6, 6, C.out, 1, 1); px(g, 9, 6, C.out, 1, 1);  // 目
      if (o.beard) px(g, 5, 8, C.white, 6, 3);
    }
    if (o.hat) {  // とんがり帽子（まどうし系NPC）
      px(g, 2, 3, o.hat, 12, 1);
      tri(g, 8, -3, 5, 6, o.hat);
      px(g, 2, 2, C.out, 12, 1);
    }
    if (o.crown) {
      px(g, 5, 0, C.gold, 6, 2);
      px(g, 5, 0, C.out, 1, 1); px(g, 7, 0, C.out, 1, 1); px(g, 10, 0, C.out, 1, 1);
    }

    outline(c, C.out);
    // 影を輪郭の後に敷く
    const c2 = mk(16, 16), g2 = c2.getContext('2d');
    px(g2, 4, 15, 'rgba(0,0,0,0.22)', 8, 1);
    g2.drawImage(c, 0, 0);
    return c2;
  }

  function makeChar(o) {
    const set = [];
    for (let d = 0; d < 4; d++) set.push([charFrame(o, d, 0), charFrame(o, d, 1)]);
    return set;
  }

  /* =====================================================================
     敵（48x48／ボスは64x64）
     ===================================================================== */
  function eSlime() {
    const c = mk(48, 48), g = c.getContext('2d');
    dome(g, 24, 40, 17, 22, C.blue);
    for (let y = 24; y <= 40; y++)      // 下半分を暗く
      for (let x = 6; x < 42; x++) {
        const v = ((x - 24) * (x - 24)) / (17 * 17) + ((y - 40) * (y - 40)) / (22 * 22);
        if (v <= 1.04 && y > 34) px(g, x, y, C.blueD);
      }
    px(g, 7, 40, C.blue, 34, 1);
    disc(g, 17, 26, 4, C.waterL);       // ハイライト
    disc(g, 18, 25, 2, C.white);
    px(g, 17, 31, C.out, 4, 5); px(g, 27, 31, C.out, 4, 5);   // 目
    px(g, 18, 32, C.white, 2, 2); px(g, 28, 32, C.white, 2, 2);
    px(g, 21, 37, C.out, 6, 1); px(g, 20, 36, C.out, 1, 1); px(g, 27, 36, C.out, 1, 1);
    outline(c, C.out);
    return c;
  }
  function eBat() {
    const c = mk(48, 48), g = c.getContext('2d');
    // 翼
    for (let i = 0; i < 3; i++) {
      const y = 16 + i * 5, w = 16 - i * 3;
      px(g, 6 + i * 2, y, C.purpleD, w, 4);
      px(g, 42 - i * 2 - w, y, C.purpleD, w, 4);
    }
    px(g, 4, 14, C.purple, 14, 3); px(g, 30, 14, C.purple, 14, 3);
    ellipse(g, 24, 24, 8, 10, C.purple);      // 体
    ellipse(g, 24, 28, 6, 6, C.purpleD);
    disc(g, 24, 18, 7, C.purple);             // 頭
    tri(g, 19, 6, 3, 7, C.purple);            // 耳
    tri(g, 29, 6, 3, 7, C.purple);
    px(g, 20, 17, C.red, 3, 3); px(g, 25, 17, C.red, 3, 3);
    px(g, 21, 18, C.gold, 1, 1); px(g, 26, 18, C.gold, 1, 1);
    px(g, 22, 23, C.white, 1, 2); px(g, 25, 23, C.white, 1, 2);  // 牙
    outline(c, C.out);
    return c;
  }
  function eGoblin() {
    const c = mk(48, 48), g = c.getContext('2d');
    px(g, 17, 36, C.greenD, 5, 9); px(g, 26, 36, C.greenD, 5, 9);   // 脚
    px(g, 15, 43, C.woodD, 8, 3); px(g, 25, 43, C.woodD, 8, 3);
    ellipse(g, 24, 30, 9, 8, C.green);                              // 胴
    px(g, 15, 30, C.wood, 18, 5);                                   // 腰布
    px(g, 15, 34, C.woodD, 18, 1);
    px(g, 12, 22, C.green, 4, 12); px(g, 32, 22, C.green, 4, 12);   // 腕
    disc(g, 24, 16, 9, C.green);                                    // 頭
    tri(g, 12, 10, 4, 9, C.green); tri(g, 36, 10, 4, 9, C.green);   // 耳
    px(g, 19, 15, C.gold, 4, 3); px(g, 26, 15, C.gold, 4, 3);       // 目
    px(g, 20, 16, C.out, 2, 2); px(g, 27, 16, C.out, 2, 2);
    px(g, 21, 21, C.out, 7, 2);                                     // 口
    px(g, 22, 20, C.white, 1, 1); px(g, 26, 20, C.white, 1, 1);
    px(g, 34, 12, C.woodD, 4, 22); px(g, 32, 8, C.wood, 8, 7);      // こんぼう
    px(g, 33, 9, C.woodD, 2, 2);
    outline(c, C.out);
    return c;
  }
  function eSkeleton() {
    const c = mk(48, 48), g = c.getContext('2d');
    px(g, 19, 34, C.bone, 4, 12); px(g, 25, 34, C.bone, 4, 12);     // 脚
    px(g, 17, 44, C.boneD, 7, 2); px(g, 24, 44, C.boneD, 7, 2);
    px(g, 20, 22, C.bone, 8, 13);                                   // 背骨
    for (let i = 0; i < 4; i++) px(g, 14, 24 + i * 3, C.bone, 20, 2);  // 肋骨
    for (let i = 0; i < 4; i++) px(g, 22, 24 + i * 3, C.boneD, 4, 2);
    disc(g, 24, 14, 9, C.bone);                                     // 頭蓋
    px(g, 19, 17, C.out, 4, 4); px(g, 26, 17, C.out, 4, 4);         // 眼窩
    px(g, 20, 18, C.red, 2, 2); px(g, 27, 18, C.red, 2, 2);
    px(g, 22, 22, C.out, 5, 1);
    for (let i = 0; i < 4; i++) px(g, 21 + i * 2, 21, C.boneD, 1, 3);
    px(g, 10, 22, C.bone, 5, 3);                                    // 腕
    px(g, 33, 22, C.bone, 5, 3);
    px(g, 36, 4, C.steelD, 3, 26); px(g, 37, 5, C.steel, 1, 24);    // 剣
    px(g, 33, 28, C.woodD, 9, 3); px(g, 36, 31, C.woodD, 3, 6);
    outline(c, C.out);
    return c;
  }
  function eMage() {
    const c = mk(48, 48), g = c.getContext('2d');
    tri(g, 24, 34, 15, 13, C.purple);                              // ローブ裾
    px(g, 9, 45, C.purpleD, 30, 2);
    px(g, 15, 22, C.purple, 18, 14);                               // 胴
    px(g, 15, 22, C.purpleD, 18, 2);
    px(g, 23, 26, C.gold, 2, 12);                                  // 前あわせ
    disc(g, 24, 18, 8, C.dark);                                    // 顔（影）
    px(g, 19, 17, C.gold, 3, 2); px(g, 26, 17, C.gold, 3, 2);      // 光る目
    px(g, 13, 12, C.purpleD, 22, 3);                               // 帽子つば
    tri(g, 24, -6, 8, 18, C.purple);                               // 帽子
    px(g, 20, 3, C.gold, 3, 3);
    px(g, 11, 24, C.purple, 5, 8);                                 // 腕
    px(g, 33, 24, C.purple, 5, 8);
    px(g, 37, 10, C.woodD, 3, 30);                                 // 杖
    disc(g, 38, 8, 4, C.red);
    disc(g, 38, 7, 2, C.gold);
    outline(c, C.out);
    return c;
  }
  function eBoss() {
    const c = mk(64, 64), g = c.getContext('2d');
    // 翼
    for (let i = 0; i < 5; i++) {
      const y = 8 + i * 6, w = 22 - i * 4;
      px(g, 2 + i, y, C.purpleD, w, 6);
      px(g, 62 - i - w, y, C.purpleD, w, 6);
    }
    px(g, 1, 6, C.purple, 22, 4); px(g, 41, 6, C.purple, 22, 4);
    ellipse(g, 32, 42, 16, 15, C.green);                            // 胴
    ellipse(g, 32, 46, 12, 10, C.greenD);
    for (let i = 0; i < 5; i++) px(g, 24 + i * 4, 40 + (i % 2), C.gold, 3, 8);  // 腹の鱗
    px(g, 27, 26, C.green, 11, 14);                                 // 首
    px(g, 27, 26, C.greenD, 3, 14);
    disc(g, 32, 20, 12, C.green);                                   // 頭
    px(g, 32, 14, C.greenD, 12, 12);
    ellipse(g, 32, 26, 9, 6, C.green);                              // 鼻先
    tri(g, 22, 2, 3, 10, C.bone); tri(g, 42, 2, 3, 10, C.bone);     // 角
    px(g, 24, 17, C.red, 6, 4); px(g, 35, 17, C.red, 6, 4);         // 目
    px(g, 26, 18, C.gold, 2, 2); px(g, 37, 18, C.gold, 2, 2);
    px(g, 25, 29, C.out, 15, 2);                                    // 口
    for (let i = 0; i < 5; i++) px(g, 26 + i * 3, 27, C.white, 2, 3);
    px(g, 14, 44, C.green, 8, 10); px(g, 42, 44, C.green, 8, 10);   // 前脚
    px(g, 12, 53, C.bone, 4, 3); px(g, 48, 53, C.bone, 4, 3);
    px(g, 46, 54, C.green, 16, 5); px(g, 58, 50, C.green, 5, 8);    // 尾
    outline(c, C.out);
    return c;
  }

  /* =====================================================================
     初期化
     ===================================================================== */
  G.initSprites = function () {
    G.TILE = {
      grass: tGrass(1), grass2: tGrass(2), road: tRoad(),
      water: [tWater(0), tWater(1), tWater(2), tWater(3)],
      tree: tTree(), mtn: tMountain(), brick: tBrick(),
      roof: tRoof(), roofTop: tRoofTop(), door: tDoor(),
      floor: tFloor(), counter: tCounter(), throne: tThrone(),
      cfloor: tCaveFloor(1), cfloor2: tCaveFloor(2), cwall: tCaveWall(),
      down: tStairs(true), up: tStairs(false), centr: tCaveEntrance(),
      bridge: tBridge(), sign: tSign(),
      chest: tChest(false), chestOpen: tChest(true),
      flower: tFlower(),
    };

    G.SPR = {
      hero: makeChar({ hair: C.hair, hairL: '#a87340', body: C.blue, bodyL: '#5b8ed4', bodyD: C.blueD, belt: C.gold, boot: C.woodD }),
      elder: makeChar({ hair: C.white, hairL: '#ffffff', hairD: '#b8b8c8', body: C.purple, bodyD: C.purpleD, belt: C.gold, beard: 1 }),
      king: makeChar({ hair: C.white, hairL: '#ffffff', body: C.red, bodyL: '#e0655c', bodyD: C.redD, belt: C.gold, crown: 1, beard: 1 }),
      villager: makeChar({ hair: C.hairD, body: C.green, bodyL: '#6fa84c', bodyD: C.greenD, belt: C.woodD }),
      girl: makeChar({ hair: C.gold, hairL: '#f5d968', hairD: C.goldD, body: C.red, bodyL: '#e0655c', bodyD: C.redD, belt: C.white }),
      shop: makeChar({ hair: C.hairD, body: C.gold, bodyL: '#f2d264', bodyD: C.goldD, belt: C.woodD }),
      smith: makeChar({ hair: C.out, body: C.steelD, bodyL: C.steel, bodyD: C.out, belt: C.woodD }),
      inn: makeChar({ hair: C.hair, body: C.waterL, bodyL: '#8ec4ee', bodyD: C.water, belt: C.white }),
      priest: makeChar({ hair: C.boneD, body: C.white, bodyL: '#ffffff', bodyD: C.boneD, belt: C.gold, hat: C.white }),
      sage: makeChar({ hair: C.white, body: C.purpleD, bodyL: C.purple, bodyD: C.out, belt: C.gold, hat: C.purple, beard: 1 }),
      soldier: makeChar({ hair: C.hairD, body: C.steel, bodyL: '#d2dae4', bodyD: C.steelD, belt: C.out }),
    };

    G.ENEMY = {
      slime: eSlime(), bat: eBat(), goblin: eGoblin(),
      skeleton: eSkeleton(), mage: eMage(), boss: eBoss(),
    };
  };
})();
