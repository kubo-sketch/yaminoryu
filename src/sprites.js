/* =====================================================================
   sprites.js — 全グラフィックをコードで生成する（外部画像ファイル 0枚）
   ---------------------------------------------------------------------
   ・タイルとキャラは 16x16、敵は 48x48（ボスのみ 64x64）で生成
   ・生成物は <canvas> として G.TILE / G.SPR / G.ENEMY に保持
   ・描画時は S 倍（既定3倍）に拡大。imageSmoothing は必ず false

   描くときの原則（ここを崩すと一気に安っぽくなる）
   1. 面は必ず3階調（明部・基本・暗部）で塗る。ベタ1色にしない
   2. 光は左上から。上面を明るく、下と右に影を落とす
   3. 洞窟の壁と床は「明度」と「色相」の両方を変える（迷子防止）
   4. 手足・翼は必ず胴に接続する。浮かせない
   ===================================================================== */
(function () {
  'use strict';
  const G = (window.G = window.G || {});

  /* ---------------- パレット ---------------- */
  const C = {
    out: '#181425',
    white: '#f2f0e5',
    skin: '#f0b088', skinL: '#ffcfa8', skinD: '#c07a55',
    hair: '#8a5a2b', hairD: '#5c3a1a',
    blue: '#3f6fb5', blueD: '#28477a',
    red: '#c8433a', redD: '#8a2a26',
    green: '#5a8f3d', greenD: '#3d6b28',
    gold: '#e8c34a', goldD: '#a8832a',
    purple: '#7a4f9a', purpleD: '#4a2d63', purpleL: '#9d6fc0',
    grass: '#6aa84f', grassL: '#7cbb5c', grassD: '#4f8a3a',
    road: '#c9a86a', roadD: '#ab8a52', roadL: '#dcc08a',
    water: '#3a7bbf', waterL: '#69a8dd', waterD: '#295b91',
    rock: '#8a8a9a', rockD: '#5a5a6a',
    brick: '#a5715a', brickD: '#7a5040', brickL: '#bd8a70',
    roof: '#b8483f', roofD: '#7d2c26', roofL: '#d4655a',
    wood: '#9a6b3f', woodD: '#654425', woodL: '#b8834f',
    floor: '#c9b394', floorD: '#a08a6c', floorL: '#ddc9ac',
    // 洞窟：壁は「茶色い岩」／床は「青灰の砂利」。明度も色相も離す
    wall: '#6b5a42', wallL: '#8f7a5c', wallD: '#3e3325',
    cfl: '#3f434d', cflL: '#4d525e', cflD: '#31343c',
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
  function disc(g, cx, cy, r, col) {
    const rr = r * r + r * 0.6;
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++)
        if (x * x + y * y <= rr) px(g, cx + x, cy + y, col);
  }
  function ellipse(g, cx, cy, rx, ry, col) {
    for (let y = -ry; y <= ry; y++)
      for (let x = -rx; x <= rx; x++)
        if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1.04) px(g, cx + x, cy + y, col);
  }
  function dome(g, cx, cy, rx, ry, col) {
    for (let y = -ry; y <= 0; y++)
      for (let x = -rx; x <= rx; x++)
        if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1.04) px(g, cx + x, cy + y, col);
  }
  // 上頂点から下底辺へ広がる三角
  function tri(g, cx, topY, halfW, h, col) {
    for (let i = 0; i < h; i++) {
      const w = Math.round((halfW * 2 * (i + 1)) / h);
      px(g, cx - (w >> 1), topY + i, col, Math.max(1, w), 1);
    }
  }
  // 任意の3点を結ぶ塗り三角（翼の膜に使う）
  function tri3(g, x1, y1, x2, y2, x3, y3, col) {
    const minX = Math.min(x1, x2, x3), maxX = Math.max(x1, x2, x3);
    const minY = Math.min(y1, y2, y3), maxY = Math.max(y1, y2, y3);
    const s = (a, b, c, d, e, f) => (a - e) * (d - f) - (c - e) * (b - f);
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        const d1 = s(x, y, x1, y1, x2, y2), d2 = s(x, y, x2, y2, x3, y3), d3 = s(x, y, x3, y3, x1, y1);
        const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
        if (!(neg && pos)) px(g, x, y, col);
      }
  }
  function rng(seed) {
    let s = seed | 0;
    return function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  }
  // アルファのある形の外周に縁取りを足す
  function outline(cv, col) {
    const g = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    const a = g.getImageData(0, 0, w, h).data;
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : a[(y * w + x) * 4 + 3]);
    const add = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (!at(x, y) && (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)))
          add.push(x, y);
    for (let i = 0; i < add.length; i += 2) px(g, add[i], add[i + 1], col);
    return cv;
  }
  // 左右反転コピー（横向きキャラを作るのに使う）
  function flipX(src) {
    const c = mk(src.width, src.height), g = c.getContext('2d');
    g.save(); g.translate(src.width, 0); g.scale(-1, 1);
    g.drawImage(src, 0, 0);
    g.restore();
    return c;
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
    for (let i = 0; i < 3; i++) {           // 草の房
      const x = 2 + ((r() * 12) | 0), y = 3 + ((r() * 11) | 0);
      px(g, x, y, C.grassD); px(g, x - 1, y + 1, C.grassD); px(g, x + 1, y + 1, C.grassD);
    }
    return c;
  }
  function tRoad() {
    const c = mk(16, 16), g = c.getContext('2d');
    const r = rng(7);
    px(g, 0, 0, C.road, 16, 16);
    for (let i = 0; i < 20; i++) px(g, (r() * 16) | 0, (r() * 16) | 0, C.roadD);
    for (let i = 0; i < 10; i++) px(g, (r() * 16) | 0, (r() * 16) | 0, C.roadL);
    return c;
  }
  function tWater(frame) {
    const c = mk(16, 16), g = c.getContext('2d');
    px(g, 0, 0, C.water, 16, 16);
    const off = frame * 4;
    // 波を2種の周期で重ねて、直線に見えないようにする
    for (let x = 0; x < 16; x++) {
      const y1 = 3 + Math.round(Math.sin((x + off) * 0.55) * 1.6 + Math.sin((x + off) * 1.3) * 0.7);
      const y2 = 11 + Math.round(Math.cos((x + off) * 0.7) * 1.6);
      px(g, x, y1, C.waterL); px(g, x, y1 + 1, C.waterD);
      px(g, x, y2, C.waterL); px(g, x, y2 + 1, C.waterD);
    }
    return c;
  }
  function tTree() {
    const c = mk(16, 16), g = c.getContext('2d');
    g.drawImage(tGrass(3), 0, 0);
    px(g, 7, 12, C.woodD, 3, 4);            // 幹（葉より下に出す）
    px(g, 8, 12, C.wood, 1, 4);
    // 葉：外形は1つの塊にして、内側だけで明暗を付ける
    // （外周に別の円を足すと上部がへこんでハート型に見えてしまう）
    ellipse(g, 8, 8, 7, 6, C.green);
    ellipse(g, 8, 10, 7, 4, C.greenD);      // 下half を暗く
    ellipse(g, 7, 6, 4, 3, C.grassL);       // 左上に光
    for (let i = 0; i < 9; i++) px(g, 3 + ((i * 5) % 11), 4 + ((i * 7) % 9), C.greenD);
    for (let i = 0; i < 5; i++) px(g, 4 + ((i * 3) % 9), 5 + ((i * 2) % 5), C.grassL);
    px(g, 5, 15, 'rgba(0,0,0,0.18)', 7, 1);  // 影
    return c;
  }
  function tMountain() {
    const c = mk(16, 16), g = c.getContext('2d');
    g.drawImage(tGrass(11), 0, 0);
    tri(g, 8, 1, 8, 15, C.rock);
    for (let i = 0; i < 15; i++) {          // 右面を暗く
      const w = Math.round((16 * (i + 1)) / 15);
      const x0 = 8 - (w >> 1);
      px(g, x0 + Math.ceil(w * 0.55), 1 + i, C.rockD, Math.max(1, w - Math.ceil(w * 0.55)), 1);
    }
    px(g, 7, 2, C.white, 3, 2);             // 雪
    px(g, 6, 4, C.white, 2, 1);
    px(g, 9, 4, C.white, 1, 1);
    return c;
  }
  // レンガ：目地は1pxに抑え、上面に光を置く
  function tBrick() {
    const c = mk(16, 16), g = c.getContext('2d');
    px(g, 0, 0, C.brick, 16, 16);
    for (let y = 0; y < 16; y += 5) {
      px(g, 0, y, C.brickL, 16, 1);         // レンガの上面
      px(g, 0, y + 4, C.brickD, 16, 1);     // 目地
      const off = ((y / 5) | 0) % 2 ? 3 : 11;
      px(g, off, y, C.brickD, 1, 5);
    }
    const r = rng(4);
    for (let i = 0; i < 8; i++) px(g, (r() * 16) | 0, (r() * 16) | 0, '#96634f');
    return c;
  }
  function tRoof() {
    const c = mk(16, 16), g = c.getContext('2d');
    px(g, 0, 0, C.roof, 16, 16);
    for (let y = 0; y < 16; y += 4) {       // 瓦を鱗状に
      for (let x = ((y / 4) % 2) * 4; x < 16; x += 8) {
        dome(g, x + 4, y + 3, 4, 3, C.roofL);
        px(g, x + 1, y + 3, C.roofD, 7, 1);
      }
    }
    return c;
  }
  function tRoofTop() {                     // 屋根の棟（家の一番上の列）
    const c = mk(16, 16), g = c.getContext('2d');
    g.drawImage(tRoof(), 0, 0);
    px(g, 0, 0, C.out, 16, 2);
    px(g, 0, 2, C.roofL, 16, 2);
    px(g, 0, 4, C.roofD, 16, 1);
    return c;
  }
  function tDoor() {
    const c = mk(16, 16), g = c.getContext('2d');
    g.drawImage(tBrick(), 0, 0);
    px(g, 2, 2, C.out, 12, 14);
    px(g, 3, 3, C.woodD, 10, 13);
    px(g, 4, 4, C.wood, 8, 11);
    px(g, 4, 4, C.woodL, 8, 1);
    px(g, 7, 4, C.woodD, 1, 11);            // 合わせ目
    px(g, 10, 9, C.gold, 2, 2);             // 取っ手
    px(g, 10, 9, C.white, 1, 1);
    return c;
  }
  function tFloor() {                       // 室内の板張り
    const c = mk(16, 16), g = c.getContext('2d');
    px(g, 0, 0, C.floor, 16, 16);
    for (let y = 0; y < 16; y += 4) {
      px(g, 0, y, C.floorL, 16, 1);
      px(g, 0, y + 3, C.floorD, 16, 1);
    }
    const r = rng(21);
    for (let i = 0; i < 10; i++) {          // 木目
      const x = (r() * 16) | 0, y = (r() * 4) | 0;
      px(g, x, y * 4 + 1, C.floorD, 2 + ((r() * 3) | 0), 1);
    }
    return c;
  }

  /* ---- 洞窟：壁は明るい茶色の岩ブロック／床は暗い青灰の砂利 ----
     ここのコントラストが弱いと通路が読めず、プレイヤーが迷子になる。 */
  function tCaveWall() {
    const c = mk(16, 16), g = c.getContext('2d');
    const r = rng(33);
    px(g, 0, 0, C.wall, 16, 16);
    // 岩を2段のブロックに割る
    for (let row = 0; row < 2; row++) {
      const y = row * 8;
      px(g, 0, y, C.wallL, 16, 2);          // 上面のハイライト
      px(g, 0, y + 7, C.wallD, 16, 1);      // 段の影
      const seam = row ? 4 : 11;            // 縦の割れ目（互い違い）
      px(g, seam, y, C.wallD, 1, 8);
      px(g, seam + 1, y, C.wallL, 1, 7);
    }
    for (let i = 0; i < 24; i++) {          // 岩肌のざらつき
      const x = (r() * 16) | 0, y = 2 + ((r() * 14) | 0);
      px(g, x, y, r() < 0.5 ? '#7d6b50' : '#57492f');
    }
    return c;
  }
  function tCaveFloor(seed) {
    const c = mk(16, 16), g = c.getContext('2d');
    const r = rng(seed);
    px(g, 0, 0, C.cfl, 16, 16);
    for (let i = 0; i < 26; i++) px(g, (r() * 16) | 0, (r() * 16) | 0, r() < 0.5 ? C.cflL : C.cflD);
    for (let i = 0; i < 2; i++) {           // 小石
      const x = 3 + ((r() * 10) | 0), y = 3 + ((r() * 10) | 0);
      px(g, x, y, C.cflL, 2, 1); px(g, x, y + 1, C.cflD, 2, 1);
    }
    return c;
  }
  function tStairs(down) {
    const c = mk(16, 16), g = c.getContext('2d');
    g.drawImage(tCaveFloor(down ? 5 : 6), 0, 0);
    px(g, 1, 1, C.out, 14, 14);
    for (let i = 0; i < 3; i++) {
      const y = 2 + i * 4;
      const w = down ? 12 - i * 3 : 6 + i * 3;
      const x = down ? 2 + i * 1 : 2;
      px(g, x, y, C.rock, w, 3);
      px(g, x, y, '#a8a8b8', w, 1);
      px(g, x, y + 2, C.rockD, w, 1);
    }
    return c;
  }
  function tCaveEntrance() {
    const c = mk(16, 16), g = c.getContext('2d');
    g.drawImage(tMountain(), 0, 0);
    dome(g, 8, 15, 5, 9, C.dark);
    px(g, 3, 14, C.dark, 10, 2);
    // 入口の縁を岩で囲って「穴」だと分かるように
    for (let i = 0; i < 9; i++) {
      const t = i / 8, x = 8 - Math.round(Math.sin(t * Math.PI) * 5.5);
      px(g, x - 1, 15 - i, C.wallD, 1, 1);
      px(g, 16 - x, 15 - i, C.wallD, 1, 1);
    }
    px(g, 3, 13, C.wallL, 2, 1); px(g, 11, 13, C.wallL, 2, 1);
    return c;
  }
  function tBridge() {
    const c = mk(16, 16), g = c.getContext('2d');
    g.drawImage(tWater(0), 0, 0);
    px(g, 0, 2, C.woodD, 16, 12);
    px(g, 0, 3, C.wood, 16, 10);
    for (let x = 0; x < 16; x += 4) { px(g, x, 3, C.woodD, 1, 10); px(g, x + 1, 3, C.woodL, 1, 1); }
    px(g, 0, 2, C.woodL, 16, 1);
    px(g, 0, 13, C.woodD, 16, 1);
    return c;
  }
  function tSign() {
    const c = mk(16, 16), g = c.getContext('2d');
    g.drawImage(tGrass(9), 0, 0);
    px(g, 7, 9, C.woodD, 2, 7);
    px(g, 1, 2, C.out, 14, 9);
    px(g, 2, 3, C.woodD, 12, 7);
    px(g, 2, 3, C.woodL, 12, 1);
    px(g, 3, 5, C.woodD, 9, 1);
    px(g, 3, 7, C.woodD, 7, 1);
    px(g, 5, 15, 'rgba(0,0,0,0.2)', 6, 1);
    return c;
  }
  function tChest(open) {
    const c = mk(16, 16), g = c.getContext('2d');
    if (open) {
      px(g, 1, 3, C.out, 14, 5);            // 開いた蓋
      px(g, 2, 4, C.woodD, 12, 3);
      px(g, 2, 4, C.wood, 12, 1);
      px(g, 1, 8, C.out, 14, 8);
      px(g, 2, 9, C.dark, 12, 6);            // 中は空
      px(g, 3, 10, '#241f18', 10, 4);
    } else {
      px(g, 1, 4, C.out, 14, 12);
      px(g, 2, 5, C.wood, 12, 10);
      px(g, 2, 5, C.woodL, 12, 2);           // 蓋の上面
      px(g, 2, 9, C.woodD, 12, 1);           // 蓋の合わせ目
      px(g, 2, 13, C.woodD, 12, 2);
      px(g, 6, 8, C.goldD, 4, 4);            // 錠前
      px(g, 6, 8, C.gold, 4, 3);
      px(g, 7, 10, C.out, 2, 2);
    }
    px(g, 2, 15, 'rgba(0,0,0,0.25)', 12, 1);
    return c;
  }
  function tCounter() {
    const c = mk(16, 16), g = c.getContext('2d');
    g.drawImage(tFloor(), 0, 0);
    px(g, 0, 3, C.out, 16, 11);
    px(g, 0, 4, C.wood, 16, 9);
    px(g, 0, 4, C.woodL, 16, 2);
    px(g, 0, 12, C.woodD, 16, 1);
    for (let x = 2; x < 16; x += 5) px(g, x, 6, C.woodD, 1, 6);
    return c;
  }
  function tFlower() {
    const c = mk(16, 16), g = c.getContext('2d');
    g.drawImage(tGrass(13), 0, 0);
    const pts = [[4, 5, C.red], [10, 4, C.gold], [7, 10, C.white], [12, 11, C.red]];
    pts.forEach(function (p) {
      px(g, p[0], p[1] - 1, p[2]); px(g, p[0] - 1, p[1], p[2]);
      px(g, p[0] + 1, p[1], p[2]); px(g, p[0], p[1] + 1, p[2]);
      px(g, p[0], p[1], p[2] === C.gold ? C.red : C.gold);
      px(g, p[0], p[1] + 2, C.greenD);
    });
    return c;
  }
  function tThrone() {
    const c = mk(16, 16), g = c.getContext('2d');
    g.drawImage(tFloor(), 0, 0);
    px(g, 2, 0, C.out, 12, 16);
    px(g, 3, 1, C.purpleD, 10, 14);
    px(g, 4, 2, C.purple, 8, 8);             // 背もたれ
    px(g, 4, 2, C.purpleL, 8, 1);
    px(g, 5, 4, C.gold, 6, 1);
    px(g, 7, 3, C.gold, 2, 2);
    px(g, 3, 10, C.woodD, 10, 5);            // 座面
    px(g, 3, 10, C.wood, 10, 2);
    return c;
  }

  /* =====================================================================
     キャラクター（16x16／4方向 × 2コマ）
     ---------------------------------------------------------------------
     頭を大きめ（約2頭身）に取り、横向きは専用のシルエットで描く。
     歩行は「足の前後」＋「胴の1px上下」で分かるようにする。
     ===================================================================== */
  const DOWN = 0, LEFT = 1, RIGHT = 2, UP = 3;
  G.DIR = { DOWN: DOWN, LEFT: LEFT, RIGHT: RIGHT, UP: UP };

  // 正面・背面
  function charFront(o, back, frame) {
    const c = mk(16, 16), g = c.getContext('2d');
    const hair = o.hair, hairD = o.hairD || C.hairD, hairL = o.hairL || hair;
    const body = o.body, bodyD = o.bodyD || C.out, bodyL = o.bodyL || body;
    const boot = o.boot || C.woodD;
    const skin = o.skin || C.skin;
    const bob = frame ? 1 : 0;               // 歩くと体が1px沈む

    // 足（左右を交互に踏み出す）。胴より内側に置いて2本に見せる
    const la = frame ? 0 : 1, ra = frame ? 1 : 0;
    px(g, 4, 13 + la, boot, 3, 3 - la);
    px(g, 9, 13 + ra, boot, 3, 3 - ra);
    px(g, 4, 15, C.out, 3, 1); px(g, 9, 15, C.out, 3, 1);

    // 胴（頭より2px細くして、肩にくびれを作る＝饅頭に見せない）
    px(g, 4, 9 + bob, body, 8, 4 - bob);
    px(g, 4, 9 + bob, bodyL, 8, 1);          // 肩の光
    px(g, 4, 12, bodyD, 8, 1);               // 裾の影
    px(g, 10, 10 + bob, bodyD, 2, 2);        // 右側の影
    px(g, 4, 11 + bob, o.belt || C.woodD, 8, 1);
    // 腕（胴の外側に1列。手先を肌色に）
    px(g, 3, 9 + bob, body, 1, 3);
    px(g, 12, 9 + bob, body, 1, 3);
    px(g, 3, 12, skin, 1, 1);
    px(g, 12, 12, skin, 1, 1);
    // 首（頭と胴を分ける1px。これが無いと頭が胴に埋まる）
    px(g, 6, 8, C.skinD, 4, 1);

    // 頭
    if (back) {
      px(g, 3, 1, hair, 10, 7);
      px(g, 3, 1, hairL, 10, 2);
      px(g, 2, 3, hair, 1, 4); px(g, 13, 3, hair, 1, 4);
      px(g, 4, 7, hairD, 8, 1);              // 襟足
      px(g, 11, 2, hairD, 2, 5);
    } else {
      px(g, 4, 3, skin, 8, 5);               // 顔
      px(g, 3, 4, skin, 1, 3); px(g, 12, 4, skin, 1, 3);
      px(g, 4, 3, C.skinL, 6, 1);            // 額の光
      px(g, 11, 4, C.skinD, 1, 3);           // 右頬の影
      px(g, 5, 7, C.skinD, 6, 1);            // 顎
      px(g, 3, 1, hair, 10, 2);              // 髪
      px(g, 3, 1, hairL, 10, 1);
      px(g, 2, 2, hair, 1, 3); px(g, 13, 2, hair, 1, 3);
      px(g, 3, 3, hair, 2, 2); px(g, 11, 3, hair, 2, 2);
      px(g, 11, 1, hairD, 2, 2);
      px(g, 5, 5, C.out, 2, 2); px(g, 9, 5, C.out, 2, 2);   // 目（2x2で大きく）
      px(g, 5, 5, C.white, 1, 1); px(g, 9, 5, C.white, 1, 1);
      if (o.beard) { px(g, 4, 7, C.white, 8, 2); px(g, 5, 9, C.white, 6, 1); }
    }
    if (o.hat) {                              // とんがり帽子
      px(g, 1, 2, o.hat, 14, 2);
      tri(g, 8, -5, 5, 7, o.hat);
      px(g, 1, 1, C.out, 14, 1);
      px(g, 1, 2, C.out, 1, 2); px(g, 14, 2, C.out, 1, 2);
    }
    if (o.crown) {
      px(g, 4, 0, C.gold, 8, 2);
      px(g, 4, 0, C.out, 1, 1); px(g, 7, 0, C.out, 1, 1); px(g, 11, 0, C.out, 1, 1);
      px(g, 4, 2, C.goldD, 8, 1);
    }
    outline(c, C.out);
    const o2 = mk(16, 16), g2 = o2.getContext('2d');
    px(g2, 4, 15, 'rgba(0,0,0,0.25)', 8, 1);
    g2.drawImage(c, 0, 0);
    return o2;
  }

  // 左向き（右向きは反転して作る）
  function charSide(o, frame) {
    const c = mk(16, 16), g = c.getContext('2d');
    const hair = o.hair, hairD = o.hairD || C.hairD, hairL = o.hairL || hair;
    const body = o.body, bodyD = o.bodyD || C.out, bodyL = o.bodyL || body;
    const boot = o.boot || C.woodD;
    const skin = o.skin || C.skin;
    const bob = frame ? 1 : 0;

    // 足：前後に大きく開く（横向きが一番アニメを読み取りやすい）
    if (frame) {
      px(g, 3, 13, boot, 4, 3);              // 前足
      px(g, 9, 13, boot, 4, 3);              // 後ろ足
      px(g, 3, 15, C.out, 4, 1); px(g, 9, 15, C.out, 4, 1);
    } else {
      px(g, 5, 13, boot, 4, 3);
      px(g, 8, 14, boot, 4, 2);
      px(g, 5, 15, C.out, 4, 1);
    }

    // 胴（正面より細い＝横を向いている手がかり）
    px(g, 5, 9 + bob, body, 6, 4 - bob);
    px(g, 5, 9 + bob, bodyL, 6, 1);
    px(g, 5, 12, bodyD, 6, 1);
    px(g, 9, 10 + bob, bodyD, 2, 2);
    px(g, 5, 11 + bob, o.belt || C.woodD, 6, 1);
    // 腕を1本だけ前方に振る
    if (frame) { px(g, 3, 9 + bob, body, 2, 3); px(g, 3, 12, skin, 2, 1); }
    else { px(g, 4, 9 + bob, body, 2, 3); px(g, 4, 12, skin, 2, 1); }
    px(g, 6, 8, C.skinD, 3, 1);              // 首

    // 頭：顔を左に寄せ、後頭部の髪を右に膨らませる
    px(g, 3, 3, skin, 7, 5);                 // 顔
    px(g, 2, 4, skin, 1, 3);                 // 鼻先の出っ張り
    px(g, 3, 3, C.skinL, 4, 1);
    px(g, 4, 7, C.skinD, 6, 1);
    px(g, 3, 1, hair, 10, 2);                // 髪（頭頂）
    px(g, 3, 1, hairL, 6, 1);
    px(g, 9, 2, hair, 5, 5);                 // 後頭部
    px(g, 11, 3, hairD, 3, 4);
    px(g, 2, 2, hair, 2, 2);                 // 前髪
    px(g, 4, 5, C.out, 2, 2);                // 目は1つだけ
    px(g, 4, 5, C.white, 1, 1);
    if (o.beard) { px(g, 2, 7, C.white, 7, 2); px(g, 3, 9, C.white, 4, 1); }
    if (o.hat) {
      px(g, 1, 2, o.hat, 13, 2);
      tri(g, 7, -5, 5, 7, o.hat);
      px(g, 1, 1, C.out, 13, 1);
    }
    if (o.crown) { px(g, 4, 0, C.gold, 7, 2); px(g, 4, 2, C.goldD, 7, 1); }

    outline(c, C.out);
    const o2 = mk(16, 16), g2 = o2.getContext('2d');
    px(g2, 4, 15, 'rgba(0,0,0,0.25)', 8, 1);
    g2.drawImage(c, 0, 0);
    return o2;
  }

  function makeChar(o) {
    const down = [charFront(o, false, 0), charFront(o, false, 1)];
    const up = [charFront(o, true, 0), charFront(o, true, 1)];
    const left = [charSide(o, 0), charSide(o, 1)];
    const right = [flipX(left[0]), flipX(left[1])];
    return [down, left, right, up];          // DOWN, LEFT, RIGHT, UP
  }

  /* =====================================================================
     敵（48x48／ボスは64x64）
     ===================================================================== */
  function eSlime() {
    const c = mk(48, 48), g = c.getContext('2d');
    dome(g, 24, 40, 17, 22, C.blue);
    // 下半分を暗く（丸みを出す）
    for (let y = 30; y <= 40; y++)
      for (let x = 6; x < 42; x++)
        if (((x - 24) * (x - 24)) / (17 * 17) + ((y - 40) * (y - 40)) / (22 * 22) <= 1.04)
          px(g, x, y, C.blueD);
    px(g, 7, 40, C.water, 34, 1);
    // 上面のハイライト
    for (let y = 20; y <= 28; y++)
      for (let x = 12; x < 30; x++)
        if (((x - 22) * (x - 22)) / (11 * 11) + ((y - 32) * (y - 32)) / (16 * 16) <= 1.0)
          px(g, x, y, C.waterL);
    disc(g, 17, 25, 3, C.white);
    px(g, 16, 30, C.out, 5, 6); px(g, 27, 30, C.out, 5, 6);      // 目
    px(g, 17, 31, C.white, 2, 3); px(g, 28, 31, C.white, 2, 3);
    px(g, 20, 37, C.out, 8, 2);                                   // 口
    px(g, 19, 36, C.out, 1, 1); px(g, 28, 36, C.out, 1, 1);
    px(g, 21, 39, C.waterL, 6, 1);
    outline(c, C.out);
    return c;
  }

  function eBat() {
    const c = mk(48, 48), g = c.getContext('2d');
    // 翼：三角の膜を2枚ずつ重ねて、外縁を波形にする
    tri3(g, 22, 16, 2, 10, 6, 30, C.purpleD);
    tri3(g, 22, 16, 6, 30, 20, 28, C.purpleD);
    tri3(g, 26, 16, 46, 10, 42, 30, C.purpleD);
    tri3(g, 26, 16, 42, 30, 28, 28, C.purpleD);
    // 翼の骨
    for (let i = 0; i < 3; i++) {
      const t = (i + 1) / 4;
      const ex = Math.round(2 + t * 6), ey = Math.round(10 + t * 20);
      for (let s = 0; s <= 10; s++) {
        px(g, Math.round(22 + (ex - 22) * (s / 10)), Math.round(16 + (ey - 16) * (s / 10)), C.purple);
        px(g, Math.round(26 + (46 - ex - 26 + 2) * (s / 10)), Math.round(16 + (ey - 16) * (s / 10)), C.purple);
      }
    }
    ellipse(g, 24, 25, 8, 11, C.purple);      // 胴
    ellipse(g, 24, 29, 6, 7, C.purpleD);
    disc(g, 24, 18, 8, C.purple);             // 頭
    disc(g, 22, 15, 4, C.purpleL);
    tri(g, 18, 5, 3, 8, C.purple);            // 耳
    tri(g, 30, 5, 3, 8, C.purple);
    px(g, 17, 7, C.purpleD, 3, 4); px(g, 28, 7, C.purpleD, 3, 4);
    px(g, 19, 16, C.red, 4, 4); px(g, 25, 16, C.red, 4, 4);       // 目
    px(g, 20, 17, C.gold, 2, 2); px(g, 26, 17, C.gold, 2, 2);
    px(g, 21, 22, C.out, 6, 2);                                    // 口
    px(g, 21, 23, C.white, 1, 3); px(g, 26, 23, C.white, 1, 3);    // 牙
    outline(c, C.out);
    return c;
  }

  function eGoblin() {
    const c = mk(48, 48), g = c.getContext('2d');
    px(g, 16, 34, C.greenD, 6, 10); px(g, 26, 34, C.greenD, 6, 10);   // 脚
    px(g, 14, 42, C.woodD, 9, 4); px(g, 25, 42, C.woodD, 9, 4);       // 足
    px(g, 14, 42, C.wood, 9, 1); px(g, 25, 42, C.wood, 9, 1);
    ellipse(g, 24, 29, 10, 9, C.green);                                // 胴
    ellipse(g, 22, 26, 7, 5, '#6ba848');                               // 胸の光
    px(g, 14, 31, C.wood, 20, 6);                                      // 腰布
    px(g, 14, 31, C.woodL, 20, 1);
    px(g, 14, 36, C.woodD, 20, 1);
    // 腕：胴と同じ緑だと埋没するので、一段暗い緑で描いて境界を出す
    px(g, 12, 21, C.greenD, 6, 13); px(g, 30, 21, C.greenD, 6, 13);
    px(g, 12, 21, '#4a7d30', 2, 13); px(g, 34, 21, '#4a7d30', 2, 13);
    px(g, 12, 31, C.green, 6, 3); px(g, 30, 31, C.green, 6, 3);        // 手
    disc(g, 24, 15, 10, C.green);                                      // 頭
    disc(g, 21, 12, 6, '#6ba848');
    tri3(g, 14, 8, 14, 20, 3, 12, C.green);                            // 耳
    tri3(g, 34, 8, 34, 20, 45, 12, C.green);
    px(g, 18, 13, C.gold, 5, 4); px(g, 26, 13, C.gold, 5, 4);          // 目
    px(g, 19, 14, C.out, 3, 3); px(g, 27, 14, C.out, 3, 3);
    px(g, 19, 20, C.out, 11, 3);                                       // 口
    px(g, 21, 20, C.white, 2, 2); px(g, 26, 20, C.white, 2, 2);        // 牙
    px(g, 33, 10, C.woodD, 5, 24); px(g, 34, 11, C.wood, 2, 22);       // こんぼう
    px(g, 31, 4, C.woodD, 9, 9); px(g, 32, 5, C.wood, 6, 6);
    px(g, 33, 6, C.woodL, 2, 2);
    outline(c, C.out);
    return c;
  }

  function eSkeleton() {
    const c = mk(48, 48), g = c.getContext('2d');
    px(g, 18, 33, C.bone, 5, 12); px(g, 25, 33, C.bone, 5, 12);        // 脚
    px(g, 18, 33, C.boneD, 2, 12); px(g, 28, 33, C.boneD, 2, 12);
    px(g, 16, 44, C.bone, 8, 3); px(g, 24, 44, C.bone, 8, 3);          // 足
    px(g, 17, 30, C.bone, 14, 5); px(g, 17, 33, C.boneD, 14, 2);       // 骨盤
    // 肋骨：1px の点線で描くと隙間に輪郭が入り込んで黒く潰れる。
    // 高さ2px の帯として左右対称に置き、外端だけ1px下げてV字に見せる。
    for (let i = 0; i < 3; i++) {
      const y = 21 + i * 4, len = 8 - i;
      px(g, 24 - len, y, C.bone, len, 2);
      px(g, 24, y, C.bone, len, 2);
      px(g, 23 - len, y + 1, C.bone, 2, 2);
      px(g, 23 + len, y + 1, C.bone, 2, 2);
      px(g, 24 - len, y + 1, C.boneD, len * 2, 1);
    }
    px(g, 22, 20, C.boneD, 4, 12);                                     // 背骨
    px(g, 14, 18, C.bone, 20, 3);                                      // 鎖骨
    px(g, 14, 20, C.boneD, 20, 1);
    px(g, 11, 20, C.bone, 4, 12);                                      // 腕（肩から）
    px(g, 33, 20, C.bone, 4, 12);
    px(g, 11, 20, C.boneD, 1, 12); px(g, 36, 20, C.boneD, 1, 12);
    disc(g, 24, 12, 9, C.bone);                                        // 頭蓋
    disc(g, 21, 9, 5, C.white);
    px(g, 19, 11, C.out, 5, 5); px(g, 25, 11, C.out, 5, 5);            // 眼窩
    px(g, 20, 12, C.red, 3, 3); px(g, 26, 12, C.red, 3, 3);
    px(g, 23, 16, C.out, 3, 2);                                        // 鼻腔
    px(g, 19, 19, C.boneD, 11, 3);                                     // 歯
    for (let i = 0; i < 5; i++) px(g, 20 + i * 2, 19, C.white, 1, 3);
    px(g, 36, 2, C.steelD, 4, 28); px(g, 37, 3, C.steel, 2, 26);       // 剣
    px(g, 37, 2, C.white, 1, 20);
    px(g, 32, 28, C.goldD, 12, 3); px(g, 32, 28, C.gold, 12, 1);
    px(g, 36, 31, C.woodD, 4, 7);
    outline(c, C.out);
    return c;
  }

  function eMage() {
    const c = mk(48, 48), g = c.getContext('2d');
    tri3(g, 24, 26, 8, 46, 40, 46, C.purple);                          // ローブ
    tri3(g, 24, 26, 12, 46, 24, 46, C.purpleD);
    px(g, 8, 44, C.purpleD, 32, 3);
    for (let i = 0; i < 4; i++) {                                      // 裾のひだ
      const x = 12 + i * 6;
      px(g, x, 38, C.purpleD, 1, 8);
    }
    px(g, 15, 20, C.purple, 18, 14);                                   // 胴
    px(g, 15, 20, C.purpleL, 18, 2);
    px(g, 29, 22, C.purpleD, 4, 12);
    px(g, 22, 24, C.gold, 3, 14);                                      // 前あわせ
    px(g, 21, 30, C.gold, 5, 2);
    disc(g, 24, 16, 8, C.dark);                                        // 顔（影に沈む）
    disc(g, 24, 15, 6, '#0a0a12');
    px(g, 18, 15, C.gold, 4, 3); px(g, 26, 15, C.gold, 4, 3);          // 光る目
    px(g, 19, 16, C.white, 2, 1); px(g, 27, 16, C.white, 2, 1);
    px(g, 11, 9, C.purpleD, 26, 4);                                    // 帽子のつば
    px(g, 11, 9, C.purple, 26, 1);
    tri(g, 22, -8, 8, 18, C.purple);                                   // 帽子
    tri(g, 20, -6, 5, 15, C.purpleL);
    px(g, 17, 2, C.gold, 4, 3);
    px(g, 10, 22, C.purple, 6, 9); px(g, 32, 22, C.purple, 6, 9);      // 腕
    px(g, 10, 22, C.purpleD, 2, 9);
    px(g, 37, 8, C.woodD, 4, 32); px(g, 38, 9, C.wood, 2, 30);         // 杖
    disc(g, 39, 6, 5, C.red);
    disc(g, 38, 5, 3, C.gold);
    disc(g, 38, 4, 1, C.white);
    outline(c, C.out);
    return c;
  }

  function eBoss() {
    const c = mk(64, 64), g = c.getContext('2d');
    // 翼（大きな三角膜＋骨）
    tri3(g, 26, 22, 0, 2, 2, 30, C.purpleD);
    tri3(g, 26, 22, 2, 30, 16, 34, C.purpleD);
    tri3(g, 38, 22, 64, 2, 62, 30, C.purpleD);
    tri3(g, 38, 22, 62, 30, 48, 34, C.purpleD);
    for (let i = 0; i < 3; i++) {                                      // 翼の骨
      const t = (i + 1) / 4;
      const ex = Math.round(0 + t * 16), ey = Math.round(2 + t * 32);
      for (let s = 0; s <= 12; s++) {
        px(g, Math.round(26 + (ex - 26) * (s / 12)), Math.round(22 + (ey - 22) * (s / 12)), C.purple);
        px(g, Math.round(38 + (64 - ex - 38) * (s / 12)), Math.round(22 + (ey - 22) * (s / 12)), C.purple);
      }
    }
    px(g, 22, 20, C.purple, 8, 3); px(g, 34, 20, C.purple, 8, 3);

    // 胴は下、頭は上に離して置き、その間に首を通す。
    // 近づけすぎると頭が胴に埋まり、ただの緑の塊になる。
    ellipse(g, 32, 50, 15, 12, C.green);                               // 胴 y=38..62
    ellipse(g, 28, 47, 10, 7, '#6ba848');                              // 胸の光
    ellipse(g, 32, 55, 11, 7, C.greenD);
    for (let i = 0; i < 5; i++) px(g, 25 + i * 4, 47 + (i % 2), C.gold, 3, 9);   // 腹の鱗
    for (let i = 0; i < 5; i++) px(g, 25 + i * 4, 47 + (i % 2), C.goldD, 3, 1);

    // 首（S字に曲げる）y=24..40
    for (let i = 0; i < 17; i++) {
      const t = i / 16;
      const x = 32 + Math.round(Math.sin(t * 1.7) * 5);
      const w = 13 - Math.round(t * 4);
      px(g, x - (w >> 1), 40 - i, C.green, w, 1);
      px(g, x + (w >> 1) - 3, 40 - i, C.greenD, 3, 1);
      px(g, x - (w >> 1), 40 - i, '#6ba848', 2, 1);
    }
    for (let i = 0; i < 5; i++) tri(g, 38 + i, 34 - i * 3, 2, 4, C.bone);        // 背びれ

    disc(g, 33, 14, 10, C.green);                                      // 頭 y=4..24
    disc(g, 30, 11, 6, '#6ba848');
    ellipse(g, 33, 21, 9, 4, C.green);                                 // 口吻
    ellipse(g, 33, 23, 8, 2, C.greenD);
    tri(g, 24, 0, 3, 10, C.bone); tri(g, 42, 0, 3, 10, C.bone);        // 角
    px(g, 23, 5, C.boneD, 2, 4); px(g, 42, 5, C.boneD, 2, 4);
    px(g, 26, 11, C.red, 6, 5); px(g, 35, 11, C.red, 6, 5);            // 目
    px(g, 27, 12, C.gold, 3, 3); px(g, 36, 12, C.gold, 3, 3);
    px(g, 28, 13, C.white, 1, 1); px(g, 37, 13, C.white, 1, 1);
    px(g, 26, 24, C.out, 15, 2);                                       // 口
    for (let i = 0; i < 5; i++) px(g, 27 + i * 3, 22, C.white, 2, 3);  // 牙

    px(g, 13, 46, C.green, 9, 12); px(g, 42, 46, C.green, 9, 12);      // 前脚
    px(g, 13, 46, C.greenD, 3, 12); px(g, 48, 46, C.greenD, 3, 12);
    for (let i = 0; i < 3; i++) {                                      // 爪
      px(g, 12 + i * 4, 57, C.bone, 3, 4);
      px(g, 42 + i * 4, 57, C.bone, 3, 4);
    }
    // 尾（先細り）
    for (let i = 0; i < 16; i++) {
      const w = Math.max(2, 9 - Math.round(i * 0.5));
      px(g, 46 + i, 54 - Math.round(Math.sin(i * 0.2) * 6), C.green, 2, w);
    }
    tri(g, 62, 44, 3, 6, C.bone);
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
      elder: makeChar({ hair: C.white, hairL: '#ffffff', hairD: '#b8b8c8', body: C.purple, bodyL: C.purpleL, bodyD: C.purpleD, belt: C.gold, beard: 1 }),
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
