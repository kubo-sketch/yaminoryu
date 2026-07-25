/* =====================================================================
   sprites.js — 全グラフィックをコードで生成する（外部画像ファイル 0枚）
   ---------------------------------------------------------------------
   狙いは「スーパーファミコン期のJRPG」の見え方。ファミコン期との差は
   色数そのものではなく、次の3つで決まる。

   1. オートタイル … 隣接を見て境界を描き分ける。敷き詰めた直線の境目が
      残っていると、何色使っても8bitに見える
   2. 階調 …… 1つの面を4〜5段階で塗る。2〜3色だと平面に見える
   3. 頭身 …… キャラを 16x24 にして表情と装備を持たせる（16x16はFCの制約）

   これに落ち影を足すと立体感が出る。光源は常に左上とする。
   ===================================================================== */
(function () {
  'use strict';
  const G = (window.G = window.G || {});

  /* =====================================================================
     パレット — 各素材を4〜5段階で持つ。彩度は低めに寄せて全体を馴染ませる
     ===================================================================== */
  const P = {
    // 草地
    gr0: '#31573a', gr1: '#3f6d42', gr2: '#4f854c', gr3: '#639b58', gr4: '#7fb56a',
    // 土・道
    rd0: '#6b5236', rd1: '#8a6b45', rd2: '#a98a5e', rd3: '#c4a87c', rd4: '#dbc59c',
    // 水
    wt0: '#173d68', wt1: '#235688', wt2: '#3272ab', wt3: '#4d93cc', wt4: '#7fbde8',
    // 石（建物の壁・岩）
    st0: '#3e3a31', st1: '#5b5548', st2: '#7a7262', st3: '#988e7a', st4: '#b8ad96',
    // 木材
    wd0: '#3f2c1b', wd1: '#5e4229', wd2: '#7d5a38', wd3: '#9c764b', wd4: '#bb9566',
    // 屋根（赤瓦）
    rf0: '#5e241f', rf1: '#83352c', rf2: '#a8473a', rf3: '#c4614f', rf4: '#d98878',
    // 洞窟の壁（暖色の岩）
    cw0: '#2e2519', cw1: '#4a3d29', cw2: '#68573a', cw3: '#87724e', cw4: '#a68f66',
    // 洞窟の床（寒色の砂利）※壁と色相を離して通路を読ませる
    cf0: '#23262e', cf1: '#2f333d', cf2: '#3c414d', cf3: '#4b5160', cf4: '#5d6473',
    // 室内の床
    fl0: '#6b5a41', fl1: '#8f7856', fl2: '#b09570', fl3: '#c9b189', fl4: '#dfcaa6',
    // 葉
    lf0: '#1f4227', lf1: '#2d5c33', lf2: '#3d7841', lf3: '#519453', lf4: '#6cb069',
    // 肌
    sk0: '#8f5334', sk1: '#c07a4e', sk2: '#e6a274', sk3: '#f8c79b', sk4: '#ffe0c0',
    // 骨・白
    bn0: '#8a8474', bn1: '#b0a993', bn2: '#d2cbb4', bn3: '#eae4d2', bn4: '#fbf7ea',
    // 金
    gd0: '#7a5a12', gd1: '#a8832a', gd2: '#d0a83a', gd3: '#e8c85c', gd4: '#f7e392',
    // 紫
    pp0: '#2e1c40', pp1: '#472c60', pp2: '#634080', pp3: '#8158a3', pp4: '#a67fc4',
    // 鋼
    sl0: '#3d4450', sl1: '#5c6675', sl2: '#818c9c', sl3: '#a5b0bd', sl4: '#ccd4de',
    // 布（青／赤／緑）
    bl0: '#1b3560', bl1: '#2a4d85', bl2: '#3d6bab', bl3: '#5a8bc9', bl4: '#84b0e0',
    re0: '#5e1c1c', re1: '#8a2f28', re2: '#b0463a', re3: '#cc6a58', re4: '#e29280',
    gn0: '#20401f', gn1: '#345c2c', gn2: '#4b7a3c', gn3: '#679954', gn4: '#8ab873',
    out: '#171320', dark: '#0d0b14', white: '#fbf7ea', shadow: 'rgba(10,8,20,0.28)',
  };
  G.P = P;
  // 旧コード（battle.js 等）が参照する名前を残す
  G.C = {
    out: P.out, white: P.white, gold: P.gd3, red: P.re2, dark: P.dark,
    bone: P.bn3, steel: P.sl3, purple: P.pp3, green: P.gn3, blue: P.bl2,
  };

  /* =====================================================================
     低レベルヘルパ
     ===================================================================== */
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
  function tri(g, cx, topY, halfW, h, col) {
    for (let i = 0; i < h; i++) {
      const w = Math.round((halfW * 2 * (i + 1)) / h);
      px(g, cx - (w >> 1), topY + i, col, Math.max(1, w), 1);
    }
  }
  function tri3(g, x1, y1, x2, y2, x3, y3, col) {
    const minX = Math.min(x1, x2, x3), maxX = Math.max(x1, x2, x3);
    const minY = Math.min(y1, y2, y3), maxY = Math.max(y1, y2, y3);
    const s = (a, b, c, d, e, f) => (a - e) * (d - f) - (c - e) * (b - f);
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        const d1 = s(x, y, x1, y1, x2, y2), d2 = s(x, y, x2, y2, x3, y3), d3 = s(x, y, x3, y3, x1, y1);
        if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) px(g, x, y, col);
      }
  }
  function rng(seed) {
    let s = seed | 0;
    return function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  }
  // 決まった種で「ざらつき」を撒く。階調を持たせるための下地
  function grain(g, seed, n, cols, x0, y0, w, h) {
    const r = rng(seed);
    x0 = x0 || 0; y0 = y0 || 0; w = w || 16; h = h || 16;
    for (let i = 0; i < n; i++)
      px(g, x0 + ((r() * w) | 0), y0 + ((r() * h) | 0), cols[(r() * cols.length) | 0]);
  }
  function outline(cv, col) {
    const g = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    const a = g.getImageData(0, 0, w, h).data;
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : a[(y * w + x) * 4 + 3]);
    const add = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (!at(x, y) && (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1))) add.push(x, y);
    for (let i = 0; i < add.length; i += 2) px(g, add[i], add[i + 1], col);
    return cv;
  }
  function flipX(src) {
    const c = mk(src.width, src.height), g = c.getContext('2d');
    g.save(); g.translate(src.width, 0); g.scale(-1, 1);
    g.drawImage(src, 0, 0);
    g.restore();
    return c;
  }
  G.mk = mk; G.px = px;

  /* =====================================================================
     オートタイル
     ---------------------------------------------------------------------
     mask のビット = 同じ種類のタイルが隣にあるか
       1:上  2:右  4:下  8:左
     ビットが立っていない側＝異種と接する側に縁を描く。
     これがあるだけで「敷き詰めた四角」が「地形」に見える。
     ===================================================================== */
  // ※ 下のキャラ方向定数(UP/DOWN/…)と衝突しないよう N_ を付ける
  const N_UP = 1, N_RT = 2, N_DN = 4, N_LT = 8;
  // 同じタイルが並ぶと格子模様が見えるので、地面には複数の模様違いを持たせ、
  // 描画側がマップ座標から選ぶ。戻り値は [variant][mask]。
  function autoVar(draw, n) {
    const out = [];
    for (let v = 0; v < n; v++) out.push(autoTile(function (g, m, e) { draw(g, m, e, v); }));
    return out;
  }
  function autoTile(draw) {
    const out = [];
    for (let m = 0; m < 16; m++) {
      const c = mk(16, 16), g = c.getContext('2d');
      draw(g, m, {
        up: !(m & N_UP), right: !(m & N_RT), down: !(m & N_DN), left: !(m & N_LT),
      });
      out.push(c);
    }
    return out;
  }

  /* =====================================================================
     地形タイル
     ===================================================================== */
  function baseGrass(g, seed) {
    px(g, 0, 0, P.gr2, 16, 16);
    grain(g, seed, 40, [P.gr1, P.gr3, P.gr1]);
    grain(g, seed + 7, 10, [P.gr4]);
    grain(g, seed + 13, 8, [P.gr0]);
    // 草の房（V字を2〜3個）
    const r = rng(seed + 31);
    for (let i = 0; i < 3; i++) {
      const x = 2 + ((r() * 12) | 0), y = 3 + ((r() * 10) | 0);
      px(g, x, y, P.gr4); px(g, x - 1, y + 1, P.gr1); px(g, x + 1, y + 1, P.gr1);
      px(g, x, y + 1, P.gr3);
    }
  }
  function tGrass(seed) {
    const c = mk(16, 16), g = c.getContext('2d');
    baseGrass(g, seed);
    return c;
  }

  // 道：草の上に、縁がほぐれた土を乗せる
  function drawRoad(g, m, e, v) {
    baseGrass(g, 5 + v * 17);
    const r = rng(11 + v * 23);
    // 縁が接する側は内側に食い込ませる（直線の境界をなくす）
    const inset = [0, 0, 0, 0];   // up, right, down, left
    if (e.up) inset[0] = 2; if (e.right) inset[1] = 2;
    if (e.down) inset[2] = 2; if (e.left) inset[3] = 2;
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const wob = (n) => n + ((r() < 0.45) ? 1 : 0);
        if (y < (inset[0] ? wob(inset[0]) : 0)) continue;
        if (x > 15 - (inset[1] ? wob(inset[1]) : 0)) continue;
        if (y > 15 - (inset[2] ? wob(inset[2]) : 0)) continue;
        if (x < (inset[3] ? wob(inset[3]) : 0)) continue;
        px(g, x, y, P.rd2);
      }
    grain(g, 3 + v * 11, 26, [P.rd1, P.rd3, P.rd1], 2, 2, 12, 12);
    grain(g, 9 + v * 13, 8, [P.rd4, P.rd0], 3, 3, 10, 10);
  }
  const tRoad = () => autoVar(drawRoad, 3);

  // 水：陸に接する側に波打ち際を作る
  function tWater(frame) {
    return autoTile(function (g, m, e) {
      px(g, 0, 0, P.wt2, 16, 16);
      const off = frame * 4;
      for (let x = 0; x < 16; x++) {
        const y1 = 4 + Math.round(Math.sin((x + off) * 0.55) * 1.8 + Math.sin((x + off) * 1.4) * 0.8);
        const y2 = 11 + Math.round(Math.cos((x + off) * 0.65) * 1.6);
        px(g, x, y1, P.wt3); px(g, x, y1 + 1, P.wt1);
        px(g, x, y2, P.wt3); px(g, x, y2 + 1, P.wt1);
      }
      grain(g, 17 + frame, 12, [P.wt1, P.wt3]);
      // 波打ち際。1本の直線で塗ると「水色の帯」に見えるので、
      // 泡の厚みをマスごとに変えて縁をギザギザにする。
      const fr = rng(71 + frame * 13);
      if (e.up) for (let x = 0; x < 16; x++) {
        const h = 1 + ((fr() * 3) | 0);
        px(g, x, 0, P.wt0); px(g, x, 1, P.wt4, 1, h); px(g, x, 1 + h, P.wt3);
      }
      if (e.down) for (let x = 0; x < 16; x++) {
        const h = 1 + ((fr() * 3) | 0);
        px(g, x, 15, P.wt0); px(g, x, 15 - h, P.wt4, 1, h); px(g, x, 14 - h, P.wt3);
      }
      if (e.left) for (let y = 0; y < 16; y++) {
        const w = 1 + ((fr() * 3) | 0);
        px(g, 0, y, P.wt0); px(g, 1, y, P.wt4, w, 1); px(g, 1 + w, y, P.wt3);
      }
      if (e.right) for (let y = 0; y < 16; y++) {
        const w = 1 + ((fr() * 3) | 0);
        px(g, 15, y, P.wt0); px(g, 15 - w, y, P.wt4, w, 1); px(g, 14 - w, y, P.wt3);
      }
    });
  }

  function tTree() {
    const c = mk(16, 16), g = c.getContext('2d');
    baseGrass(g, 3);
    px(g, 5, 13, P.shadow, 7, 2);                 // 落ち影
    px(g, 7, 11, P.wd1, 3, 5); px(g, 8, 11, P.wd2, 1, 5);
    ellipse(g, 8, 8, 7, 6, P.lf2);                // 樹冠（外形は1つ）
    ellipse(g, 8, 10, 7, 4, P.lf1);
    ellipse(g, 8, 12, 5, 2, P.lf0);
    ellipse(g, 7, 6, 4, 3, P.lf3);
    ellipse(g, 6, 5, 2, 2, P.lf4);                // 左上に光
    grain(g, 5, 14, [P.lf1, P.lf3], 2, 3, 12, 9);
    grain(g, 8, 6, [P.lf4], 3, 3, 8, 5);
    return c;
  }
  // 山：単体だと三角、つながると岩肌になるオートタイル。
  // 三角をそのまま並べると「三角形の行列」になって山脈に見えない。
  const tMountain = () => [autoTile(function (g, m, e) {
    baseGrass(g, 11);
    if (e.up) {                                    // 稜線（頂上のある面）
      tri(g, 8, 0, 8, 16, P.st1);
      for (let i = 0; i < 16; i++) {
        const w = Math.round((16 * (i + 1)) / 16), x0 = 8 - (w >> 1);
        px(g, x0 + Math.ceil(w * 0.5), i, P.st0, Math.max(1, w - Math.ceil(w * 0.5)), 1);
        px(g, x0, i, P.st2, Math.max(1, Math.ceil(w * 0.25)), 1);
      }
      px(g, 7, 1, P.bn4, 3, 2); px(g, 6, 3, P.bn3, 2, 1); px(g, 9, 3, P.bn3, 2, 1);
    } else {                                       // 山腹
      px(g, 0, 0, P.st1, 16, 16);
      px(g, 0, 0, P.st2, 8, 16);
      px(g, 9, 0, P.st0, 7, 16);
      for (let i = 0; i < 3; i++) {                // 岩の割れ目
        const x = 2 + i * 5;
        px(g, x, 2 + ((i * 5) % 9), P.st0, 1, 5);
        px(g, x + 1, 2 + ((i * 5) % 9), P.st3, 1, 4);
      }
    }
    grain(g, 23, 18, [P.st0, P.st2, P.st3], 1, e.up ? 5 : 0, 14, e.up ? 10 : 16);
    if (e.left) px(g, 0, 0, P.st2, 1, 16);
    if (e.right) px(g, 15, 0, P.st0, 1, 16);
    if (e.down) px(g, 0, 14, P.st0, 16, 2);        // 裾の影
  })];

  // 建物の石壁：上面に光、下端に影。オートタイルで角を締める
  const tBrick = () => [autoTile(function (g, m, e) {
    px(g, 0, 0, P.st2, 16, 16);
    for (let y = 0; y < 16; y += 4) {
      px(g, 0, y, P.st3, 16, 1);
      px(g, 0, y + 3, P.st1, 16, 1);
      const off = ((y / 4) | 0) % 2 ? 3 : 11;
      px(g, off, y, P.st1, 1, 4);
      px(g, off + 1, y, P.st3, 1, 3);
    }
    grain(g, 29, 10, [P.st1, P.st4]);
    if (e.up) px(g, 0, 0, P.st4, 16, 2);           // 天端の光
    if (e.down) { px(g, 0, 14, P.st0, 16, 2); }    // 接地の影
    if (e.left) px(g, 0, 0, P.st3, 1, 16);
    if (e.right) px(g, 15, 0, P.st0, 1, 16);
  })];

  function tRoof() {
    const c = mk(16, 16), g = c.getContext('2d');
    px(g, 0, 0, P.rf2, 16, 16);
    for (let y = 0; y < 16; y += 4)                // 瓦を鱗状に
      for (let x = ((y / 4) % 2) * 4; x < 16; x += 8) {
        dome(g, x + 4, y + 4, 4, 4, P.rf1);
        dome(g, x + 4, y + 3, 4, 3, P.rf3);
        dome(g, x + 4, y + 2, 3, 2, P.rf4);
        px(g, x, y + 4, P.rf0, 8, 1);
      }
    return c;
  }
  function tRoofTop() {
    const c = mk(16, 16), g = c.getContext('2d');
    g.drawImage(tRoof(), 0, 0);
    px(g, 0, 0, P.rf0, 16, 2);
    px(g, 0, 2, P.rf4, 16, 1);
    px(g, 0, 3, P.rf3, 16, 1);
    px(g, 0, 4, P.rf0, 16, 1);
    return c;
  }
  function tDoor() {
    const c = mk(16, 16), g = c.getContext('2d');
    px(g, 0, 0, P.st2, 16, 16);
    for (let y = 0; y < 16; y += 4) { px(g, 0, y, P.st3, 16, 1); px(g, 0, y + 3, P.st1, 16, 1); }
    px(g, 1, 1, P.st0, 14, 15);                    // 戸口の陰
    px(g, 2, 2, P.wd1, 12, 14);
    px(g, 3, 3, P.wd2, 10, 12);
    px(g, 3, 3, P.wd3, 10, 1);
    for (let x = 4; x < 13; x += 4) px(g, x, 4, P.wd1, 1, 11);
    px(g, 3, 8, P.wd1, 10, 1);
    px(g, 10, 9, P.gd2, 2, 2); px(g, 10, 9, P.gd4, 1, 1);
    dome(g, 8, 4, 4, 3, P.wd0);                    // 上部のアーチ
    dome(g, 8, 3, 3, 2, P.wd2);
    return c;
  }

  // 室内の床（板張り）
  const tFloor = () => [autoTile(function (g, m, e) {
    px(g, 0, 0, P.fl2, 16, 16);
    for (let y = 0; y < 16; y += 4) {
      px(g, 0, y, P.fl3, 16, 1);
      px(g, 0, y + 3, P.fl1, 16, 1);
    }
    grain(g, 41, 10, [P.fl1, P.fl3]);
    const r = rng(6);
    for (let i = 0; i < 6; i++) px(g, (r() * 14) | 0, ((r() * 4) | 0) * 4 + 1, P.fl1, 2 + ((r() * 3) | 0), 1);
    // 壁際は暗く落とす（部屋の中が奥まって見える）
    if (e.up) { px(g, 0, 0, P.fl0, 16, 1); px(g, 0, 1, P.fl1, 16, 1); }
    if (e.left) { px(g, 0, 0, P.fl0, 1, 16); px(g, 1, 0, P.fl1, 1, 16); }
    if (e.right) px(g, 15, 0, P.fl1, 1, 16);
    if (e.down) px(g, 0, 15, P.fl1, 16, 1);
  })];

  /* ---- 洞窟：壁は暖色の岩、床は寒色の砂利。壁の下端に「側面」を描く ---- */
  const tCaveWall = () => [autoTile(function (g, m, e) {
    px(g, 0, 0, P.cw2, 16, 16);
    for (let row = 0; row < 2; row++) {            // 岩を2段のブロックに
      const y = row * 8;
      px(g, 0, y, P.cw3, 16, 2);
      px(g, 0, y + 6, P.cw1, 16, 2);
      const seam = row ? 4 : 11;
      px(g, seam, y, P.cw1, 1, 8);
      px(g, seam + 1, y, P.cw3, 1, 7);
    }
    grain(g, 33, 26, [P.cw1, P.cw3, P.cw0], 0, 2, 16, 13);
    grain(g, 51, 8, [P.cw4], 0, 0, 16, 6);
    if (e.up) px(g, 0, 0, P.cw4, 16, 2);           // 天端に光
    if (e.down) {                                  // 床に接する側＝壁の見えている「面」
      px(g, 0, 11, P.cw1, 16, 5);
      px(g, 0, 11, P.cw2, 16, 1);
      px(g, 0, 15, P.cw0, 16, 1);
      grain(g, 61, 8, [P.cw0, P.cw2], 0, 12, 16, 3);
    }
    if (e.left) px(g, 0, 0, P.cw3, 1, 16);
    if (e.right) px(g, 15, 0, P.cw0, 1, 16);
  })];
  function drawCaveFloor(g, m, e, v) {
    const seed = 1 + v * 29;
    px(g, 0, 0, P.cf2, 16, 16);
    grain(g, seed, 34, [P.cf1, P.cf3, P.cf1]);
    grain(g, seed + 5, 8, [P.cf4]);
    grain(g, seed + 9, 10, [P.cf0]);
    const r = rng(seed + 17);
    for (let i = 0; i < 2; i++) {                  // 小石
      const x = 3 + ((r() * 10) | 0), y = 3 + ((r() * 10) | 0);
      px(g, x, y, P.cf4, 2, 1); px(g, x, y + 1, P.cf0, 2, 1);
    }
    // 壁に接する側は暗く（壁の落ち影）
    if (e.up) { px(g, 0, 0, P.cf0, 16, 2); px(g, 0, 2, P.cf1, 16, 1); }
    if (e.left) px(g, 0, 0, P.cf1, 1, 16);
    if (e.right) px(g, 15, 0, P.cf1, 1, 16);
    if (e.down) px(g, 0, 15, P.cf1, 16, 1);
  }
  const tCaveFloor = () => autoVar(drawCaveFloor, 3);

  function tStairs(down) {
    const c = mk(16, 16), g = c.getContext('2d');
    px(g, 0, 0, P.cf2, 16, 16);
    grain(g, 7, 20, [P.cf1, P.cf3]);
    px(g, 1, 0, P.cf0, 14, 16);
    for (let i = 0; i < 4; i++) {
      const y = i * 4;
      const w = down ? 13 - i * 3 : 4 + i * 3;
      const x = down ? 2 + i : 2;
      px(g, x, y, P.st1, w, 4);
      px(g, x, y, P.st3, w, 1);
      px(g, x, y + 3, P.st0, w, 1);
    }
    return c;
  }
  function tCaveEntrance() {
    const c = mk(16, 16), g = c.getContext('2d');
    // 山はオートタイル配列 [variant][mask] になったので、
    // 四方を山に囲まれた「山腹」の絵(mask=15)を下地に使う
    g.drawImage(tMountain()[0][15], 0, 0);
    dome(g, 8, 16, 6, 10, P.cw0);
    dome(g, 8, 16, 5, 9, P.dark);
    for (let i = 0; i < 11; i++) {                 // 岩の縁取り
      const t = i / 10, x = 8 - Math.round(Math.sin(t * Math.PI) * 6);
      px(g, x - 1, 15 - i, P.cw2, 2, 1);
      px(g, 15 - x, 15 - i, P.cw1, 2, 1);
    }
    px(g, 2, 12, P.cw3, 3, 1); px(g, 11, 12, P.cw3, 3, 1);
    return c;
  }
  function tBridge() {
    const c = mk(16, 16), g = c.getContext('2d');
    px(g, 0, 0, P.wt2, 16, 16);
    for (let x = 0; x < 16; x++) px(g, x, 4 + ((x % 5) < 2 ? 1 : 0), P.wt3);
    px(g, 0, 1, P.wd0, 16, 14);
    px(g, 0, 2, P.wd2, 16, 12);
    for (let x = 0; x < 16; x += 4) {
      px(g, x, 2, P.wd1, 1, 12);
      px(g, x + 1, 2, P.wd3, 1, 1);
      px(g, x + 1, 13, P.wd1, 3, 1);
    }
    px(g, 0, 1, P.wd3, 16, 1);
    px(g, 0, 14, P.wd0, 16, 1);
    return c;
  }
  function tSign() {
    const c = mk(16, 16), g = c.getContext('2d');
    baseGrass(g, 9);
    px(g, 5, 14, P.shadow, 7, 2);
    px(g, 7, 9, P.wd1, 2, 6); px(g, 7, 9, P.wd2, 1, 6);
    px(g, 1, 2, P.wd0, 14, 9);
    px(g, 2, 3, P.wd2, 12, 7);
    px(g, 2, 3, P.wd4, 12, 1);
    px(g, 2, 9, P.wd1, 12, 1);
    px(g, 3, 5, P.wd0, 9, 1); px(g, 3, 7, P.wd0, 7, 1);
    return c;
  }
  function tChest(open) {
    const c = mk(16, 16), g = c.getContext('2d');
    px(g, 2, 14, P.shadow, 12, 2);
    if (open) {
      px(g, 1, 2, P.wd0, 14, 5);
      px(g, 2, 3, P.wd2, 12, 3); px(g, 2, 3, P.wd3, 12, 1);
      px(g, 1, 7, P.wd0, 14, 8);
      px(g, 2, 8, P.dark, 12, 6);
      px(g, 3, 9, '#1a1520', 10, 4);
      px(g, 2, 13, P.wd1, 12, 1);
    } else {
      px(g, 1, 3, P.wd0, 14, 12);
      px(g, 2, 4, P.wd2, 12, 10);
      px(g, 2, 4, P.wd4, 12, 2);                   // 蓋の上面
      px(g, 2, 8, P.wd0, 12, 1);
      px(g, 2, 9, P.wd3, 12, 1);
      px(g, 2, 12, P.wd1, 12, 2);
      px(g, 3, 4, P.gd1, 2, 10); px(g, 11, 4, P.gd1, 2, 10);   // 金具
      px(g, 3, 4, P.gd3, 1, 10); px(g, 11, 4, P.gd3, 1, 10);
      px(g, 6, 7, P.gd1, 4, 5); px(g, 6, 7, P.gd3, 4, 3);
      px(g, 7, 9, P.wd0, 2, 2);
    }
    return c;
  }
  function tCounter() {
    const c = mk(16, 16), g = c.getContext('2d');
    bgFloor(g);
    px(g, 0, 2, P.wd0, 16, 12);
    px(g, 0, 3, P.wd2, 16, 10);
    px(g, 0, 3, P.wd4, 16, 2);                     // 天板の光
    px(g, 0, 11, P.wd1, 16, 2);
    px(g, 0, 13, P.wd0, 16, 1);
    for (let x = 2; x < 16; x += 5) px(g, x, 5, P.wd1, 1, 6);
    px(g, 0, 14, P.shadow, 16, 2);
    return c;
  }
  function tFlower() {
    const c = mk(16, 16), g = c.getContext('2d');
    baseGrass(g, 13);
    const pts = [[4, 5, P.re3], [10, 4, P.gd3], [7, 10, P.bn4], [12, 11, P.re3]];
    pts.forEach(function (p) {
      px(g, p[0], p[1] + 1, P.gr0, 1, 2);
      px(g, p[0], p[1] - 1, p[2]); px(g, p[0] - 1, p[1], p[2]);
      px(g, p[0] + 1, p[1], p[2]); px(g, p[0], p[1] + 1, p[2]);
      px(g, p[0], p[1], p[2] === P.gd3 ? P.re2 : P.gd3);
    });
    return c;
  }
  function tThrone() {
    const c = mk(16, 16), g = c.getContext('2d');
    bgFloor(g);
    px(g, 2, 14, P.shadow, 12, 2);
    px(g, 2, 0, P.wd0, 12, 15);
    px(g, 3, 1, P.pp1, 10, 9);                     // 背もたれ
    px(g, 4, 2, P.pp2, 8, 7);
    px(g, 4, 2, P.pp3, 8, 1);
    px(g, 5, 4, P.gd2, 6, 1); px(g, 7, 2, P.gd3, 2, 2);
    px(g, 3, 10, P.wd1, 10, 5);                    // 座面
    px(g, 3, 10, P.wd3, 10, 2);
    px(g, 3, 14, P.wd0, 10, 1);
    return c;
  }

  /* ---- 小物（町の密度を上げる。SFC期は装飾物の数で差が出る） ----
     背景が透明のままだと下に何も無く黒く抜けるので、床を敷いてから描く。 */
  function bgFloor(g) {
    px(g, 0, 0, P.fl2, 16, 16);
    for (let y = 0; y < 16; y += 4) { px(g, 0, y, P.fl3, 16, 1); px(g, 0, y + 3, P.fl1, 16, 1); }
    grain(g, 41, 8, [P.fl1, P.fl3]);
  }
  function tBarrel() {
    const c = mk(16, 16), g = c.getContext('2d');
    bgFloor(g);
    px(g, 3, 14, P.shadow, 10, 2);
    px(g, 3, 2, P.wd0, 10, 13);
    px(g, 4, 3, P.wd2, 8, 11);
    px(g, 4, 3, P.wd4, 3, 11);                     // 左に光
    px(g, 10, 3, P.wd1, 2, 11);
    px(g, 4, 5, P.st1, 8, 2); px(g, 4, 10, P.st1, 8, 2);
    px(g, 4, 5, P.st3, 8, 1); px(g, 4, 10, P.st3, 8, 1);
    ellipse(g, 8, 3, 4, 2, P.wd3);
    ellipse(g, 8, 3, 3, 1, P.wd4);
    return c;
  }
  function tPot() {
    const c = mk(16, 16), g = c.getContext('2d');
    bgFloor(g);
    px(g, 4, 14, P.shadow, 8, 2);
    ellipse(g, 8, 10, 5, 5, P.rf1);
    ellipse(g, 7, 9, 3, 3, P.rf3);
    px(g, 6, 3, P.rf1, 4, 3);
    px(g, 5, 2, P.rf2, 6, 2);
    px(g, 5, 2, P.rf4, 4, 1);
    px(g, 4, 12, P.rf0, 8, 2);
    return c;
  }
  function tTorch() {
    const c = mk(16, 16), g = c.getContext('2d');
    bgFloor(g);
    px(g, 5, 14, P.shadow, 6, 2);
    px(g, 6, 8, P.wd1, 4, 8);
    px(g, 7, 8, P.wd3, 1, 8);
    px(g, 5, 6, P.st1, 6, 3); px(g, 5, 6, P.st3, 6, 1);
    disc(g, 8, 4, 3, P.re2);                       // 炎
    disc(g, 8, 3, 2, P.gd2);
    px(g, 8, 1, P.gd4, 1, 2);
    px(g, 7, 2, P.gd3, 2, 2);
    return c;
  }
  function tFence() {
    const c = mk(16, 16), g = c.getContext('2d');
    baseGrass(g, 27);
    px(g, 1, 11, P.shadow, 14, 2);
    px(g, 0, 5, P.wd1, 16, 2); px(g, 0, 5, P.wd3, 16, 1);
    px(g, 0, 9, P.wd1, 16, 2); px(g, 0, 9, P.wd3, 16, 1);
    for (let x = 2; x < 16; x += 6) {
      px(g, x, 2, P.wd1, 3, 11);
      px(g, x, 2, P.wd3, 1, 11);
      px(g, x, 2, P.wd4, 3, 1);
    }
    return c;
  }
  function tWell() {
    const c = mk(16, 16), g = c.getContext('2d');
    baseGrass(g, 19);
    px(g, 2, 13, P.shadow, 12, 3);
    ellipse(g, 8, 11, 6, 4, P.st1);
    ellipse(g, 8, 10, 5, 3, P.st3);
    ellipse(g, 8, 10, 4, 2, P.dark);
    px(g, 2, 11, P.st2, 12, 4);
    px(g, 2, 11, P.st4, 12, 1);
    px(g, 2, 14, P.st0, 12, 1);
    px(g, 3, 2, P.wd1, 2, 9); px(g, 11, 2, P.wd1, 2, 9);
    px(g, 2, 1, P.wd2, 12, 2); px(g, 2, 1, P.wd4, 12, 1);
    px(g, 7, 3, P.wd0, 2, 4);
    return c;
  }
  function tCarpet() {
    const c = mk(16, 16), g = c.getContext('2d');
    bgFloor(g);
    px(g, 0, 0, P.re1, 16, 16);
    px(g, 1, 1, P.re2, 14, 14);
    px(g, 2, 2, P.re3, 12, 12);
    px(g, 3, 3, P.re2, 10, 10);
    px(g, 0, 0, P.gd2, 16, 1); px(g, 0, 15, P.gd2, 16, 1);
    px(g, 0, 0, P.gd2, 1, 16); px(g, 15, 0, P.gd2, 1, 16);
    px(g, 6, 6, P.gd3, 4, 4); px(g, 7, 7, P.re1, 2, 2);
    return c;
  }


  /* ---- 家具・装飾（町の密度はここで決まる） ---- */
  function tBed() {
    const c = mk(16, 16), g = c.getContext('2d');
    bgFloor(g);
    px(g, 2, 1, P.wd0, 12, 15);
    px(g, 3, 2, P.wd2, 10, 13);
    px(g, 3, 2, P.bn3, 10, 5);                 // 枕
    px(g, 4, 3, P.bn4, 8, 3);
    px(g, 3, 7, P.re1, 10, 8);                 // 掛け布団
    px(g, 3, 7, P.re2, 10, 6);
    px(g, 4, 8, P.re3, 8, 2);
    px(g, 3, 14, P.wd0, 10, 1);
    return c;
  }
  function tTable() {
    const c = mk(16, 16), g = c.getContext('2d');
    bgFloor(g);
    px(g, 1, 13, P.shadow, 14, 3);
    px(g, 1, 3, P.wd0, 14, 10);
    px(g, 2, 4, P.wd2, 12, 8);
    px(g, 2, 4, P.wd4, 12, 2);
    px(g, 2, 11, P.wd1, 12, 1);
    px(g, 6, 5, P.bn3, 4, 3); px(g, 6, 5, P.bn4, 4, 1);   // 皿
    px(g, 11, 6, P.gd2, 2, 3); px(g, 11, 6, P.gd4, 1, 1); // 杯
    return c;
  }
  function tShelf() {
    const c = mk(16, 16), g = c.getContext('2d');
    bgFloor(g);
    px(g, 1, 0, P.wd0, 14, 15);
    px(g, 2, 1, P.wd1, 12, 13);
    for (let r = 0; r < 3; r++) {
      const y = 1 + r * 4;
      px(g, 2, y + 3, P.wd3, 12, 1);
      const cols = [P.re2, P.bl2, P.gn2, P.gd2, P.pp3];
      for (let i = 0; i < 5; i++) px(g, 3 + i * 2, y, cols[(i + r) % 5], 2, 3);
    }
    return c;
  }
  function tFountain() {
    const c = mk(16, 16), g = c.getContext('2d');
    px(g, 0, 0, P.st2, 16, 16);
    for (let y = 0; y < 16; y += 8) { px(g, 0, y, P.st3, 16, 1); px(g, 0, y + 7, P.st1, 16, 1); }
    ellipse(g, 8, 9, 7, 6, P.st1);
    ellipse(g, 8, 9, 6, 5, P.wt1);
    ellipse(g, 8, 9, 5, 4, P.wt2);
    ellipse(g, 7, 8, 3, 2, P.wt3);
    px(g, 7, 2, P.st3, 2, 6);                  // 噴水柱
    px(g, 6, 1, P.st4, 4, 2);
    px(g, 7, 0, P.wt4, 2, 2);
    px(g, 5, 3, P.wt4, 1, 2); px(g, 10, 3, P.wt4, 1, 2);
    return c;
  }
  function tBench() {
    const c = mk(16, 16), g = c.getContext('2d');
    baseGrass(g, 45);
    px(g, 1, 12, P.shadow, 14, 2);
    px(g, 1, 6, P.wd1, 14, 3); px(g, 1, 6, P.wd3, 14, 1);
    px(g, 1, 2, P.wd1, 14, 2); px(g, 1, 2, P.wd3, 14, 1);
    px(g, 2, 9, P.wd0, 2, 4); px(g, 12, 9, P.wd0, 2, 4);
    px(g, 2, 4, P.wd0, 2, 2); px(g, 12, 4, P.wd0, 2, 2);
    return c;
  }
  function tCart() {
    const c = mk(16, 16), g = c.getContext('2d');
    baseGrass(g, 47);
    px(g, 1, 13, P.shadow, 14, 3);
    px(g, 2, 3, P.wd0, 12, 8);
    px(g, 3, 4, P.wd2, 10, 6);
    px(g, 3, 4, P.wd4, 10, 1);
    for (let x = 4; x < 13; x += 3) px(g, x, 5, P.wd1, 1, 5);
    disc(g, 5, 12, 3, P.wd0); disc(g, 5, 12, 2, P.wd3);
    disc(g, 11, 12, 3, P.wd0); disc(g, 11, 12, 2, P.wd3);
    return c;
  }
  function tFlowerbed() {
    const c = mk(16, 16), g = c.getContext('2d');
    px(g, 0, 0, P.rd1, 16, 16);
    grain(g, 51, 20, [P.rd0, P.rd2]);
    px(g, 0, 0, P.st2, 16, 2); px(g, 0, 14, P.st1, 16, 2);
    px(g, 0, 0, P.st2, 2, 16); px(g, 14, 0, P.st1, 2, 16);
    px(g, 0, 0, P.st3, 16, 1);
    const cols = [P.re3, P.gd3, P.bn4, P.pp4];
    for (let i = 0; i < 5; i++) {
      const x = 3 + ((i * 5) % 10), y = 4 + ((i * 3) % 8);
      px(g, x, y + 1, P.gn2, 1, 2);
      px(g, x, y - 1, cols[i % 4]); px(g, x - 1, y, cols[i % 4]);
      px(g, x + 1, y, cols[i % 4]); px(g, x, y + 1, cols[i % 4]);
      px(g, x, y, P.gd4);
    }
    return c;
  }
  // 石畳（広場用・オートタイル）
  const tStone = () => [autoTile(function (g, m, e) {
    px(g, 0, 0, P.st2, 16, 16);
    for (let y = 0; y < 16; y += 8)
      for (let x = ((y / 8) % 2) * 4; x < 16; x += 8) {
        px(g, x, y, P.st3, 7, 7);
        px(g, x, y, P.st4, 7, 1);
        px(g, x, y + 6, P.st1, 7, 1);
      }
    grain(g, 53, 14, [P.st1, P.st4]);
    if (e.up) px(g, 0, 0, P.st1, 16, 1);
    if (e.down) px(g, 0, 15, P.st1, 16, 1);
    if (e.left) px(g, 0, 0, P.st1, 1, 16);
    if (e.right) px(g, 15, 0, P.st1, 1, 16);
  })];
  function tGrave() {
    const c = mk(16, 16), g = c.getContext('2d');
    baseGrass(g, 57);
    px(g, 4, 13, P.shadow, 8, 2);
    px(g, 4, 3, P.st1, 8, 11);
    px(g, 5, 4, P.st3, 6, 9);
    dome(g, 8, 4, 4, 3, P.st1);
    dome(g, 8, 3, 3, 2, P.st3);
    px(g, 7, 6, P.st0, 2, 6); px(g, 5, 8, P.st0, 6, 2);   // 十字
    px(g, 3, 14, P.st0, 10, 2);
    return c;
  }
  function tCrate() {
    const c = mk(16, 16), g = c.getContext('2d');
    bgFloor(g);
    px(g, 2, 14, P.shadow, 12, 2);
    px(g, 2, 2, P.wd0, 12, 13);
    px(g, 3, 3, P.wd2, 10, 11);
    px(g, 3, 3, P.wd4, 10, 2);
    px(g, 3, 8, P.wd1, 10, 1);
    px(g, 7, 3, P.wd1, 2, 11);
    return c;
  }
  // 洞窟の装飾
  function tStalag() {
    const c = mk(16, 16), g = c.getContext('2d');
    px(g, 0, 0, P.cf2, 16, 16);
    grain(g, 61, 24, [P.cf1, P.cf3]);
    tri(g, 4, 16, 3, -10, P.cw2);
    for (let i = 0; i < 10; i++) px(g, 4 - ((i * 3) % 3), 15 - i, P.cw2, 3 - ((i / 4) | 0), 1);
    for (let i = 0; i < 8; i++) px(g, 11 - ((i * 2) % 2), 15 - i, P.cw1, 3 - ((i / 4) | 0), 1);
    px(g, 3, 6, P.cw3, 1, 6); px(g, 10, 8, P.cw3, 1, 5);
    px(g, 2, 14, P.cw0, 12, 2);
    return c;
  }
  function tPuddle() {
    const c = mk(16, 16), g = c.getContext('2d');
    px(g, 0, 0, P.cf2, 16, 16);
    grain(g, 63, 20, [P.cf1, P.cf3]);
    ellipse(g, 8, 9, 6, 4, P.wt0);
    ellipse(g, 8, 9, 5, 3, P.wt1);
    ellipse(g, 7, 8, 3, 2, P.wt2);
    px(g, 5, 7, P.wt3, 2, 1);
    return c;
  }
  function tBones() {
    const c = mk(16, 16), g = c.getContext('2d');
    px(g, 0, 0, P.cf2, 16, 16);
    grain(g, 67, 20, [P.cf1, P.cf3]);
    disc(g, 6, 9, 3, P.bn1);
    disc(g, 6, 8, 2, P.bn3);
    px(g, 4, 9, P.cf0, 2, 2); px(g, 7, 9, P.cf0, 2, 2);
    px(g, 10, 6, P.bn1, 5, 2); px(g, 10, 6, P.bn3, 5, 1);
    px(g, 9, 11, P.bn1, 6, 2); px(g, 9, 11, P.bn3, 6, 1);
    return c;
  }

  /* =====================================================================
     キャラクター（16x24／4方向 × 2コマ）
     ---------------------------------------------------------------------
     足元の1タイルに合わせるため、描画側で上に8px はみ出させる。
     頭を大きく取り、目・眉・髪・装備を描き分けられる面積を確保する。
     ===================================================================== */
  const DOWN = 0, LEFT = 1, RIGHT = 2, UP = 3;
  G.DIR = { DOWN: DOWN, LEFT: LEFT, RIGHT: RIGHT, UP: UP };
  G.CH = 24;                                        // キャラの高さ（field.js が参照）

  function shade(col, lv) {
    // 色名から階調違いを引く（body:'bl' のような2文字キーを使う）
    return P[col + lv] || col;
  }

  function charFront(o, back, frame) {
    const c = mk(16, 24), g = c.getContext('2d');
    const hair = o.hair, hd = o.hairD || hair, hl = o.hairL || hair;
    const b = o.body;                               // 'bl' 'gn' 're' などのキー
    const b1 = P[b + 1], b2 = P[b + 2], b3 = P[b + 3], b0 = P[b + 0];
    const boot = o.boot || P.wd1;
    const bob = frame ? 1 : 0;

    // 足（交互に踏み出す）
    const la = frame ? 0 : 1, ra = frame ? 1 : 0;
    px(g, 4, 19 + la, boot, 3, 5 - la);
    px(g, 9, 19 + ra, boot, 3, 5 - ra);
    px(g, 4, 19 + la, P.wd3, 1, 5 - la);
    px(g, 9, 19 + ra, P.wd3, 1, 5 - ra);
    px(g, 4, 23, P.wd0, 3, 1); px(g, 9, 23, P.wd0, 3, 1);

    // 胴（頭より細くしてくびれを作る）
    px(g, 3, 13 + bob, b2, 10, 7 - bob);
    px(g, 3, 13 + bob, b3, 10, 1);                  // 肩の光
    px(g, 3, 14 + bob, b3, 3, 2);
    px(g, 10, 14 + bob, b1, 3, 5);                  // 右の影
    px(g, 3, 19, b0, 10, 1);                        // 裾
    px(g, 3, 17 + bob, o.belt || P.wd1, 10, 2);
    px(g, 3, 17 + bob, P.gd3, 10, 1);
    // 腕
    px(g, 2, 13 + bob, b1, 2, 5); px(g, 12, 13 + bob, b1, 2, 5);
    px(g, 2, 13 + bob, b2, 1, 5);
    px(g, 2, 18, P.sk2, 2, 2); px(g, 12, 18, P.sk2, 2, 2);
    px(g, 2, 18, P.sk3, 1, 1);
    // 首
    px(g, 6, 11, P.sk1, 4, 2);
    px(g, 6, 11, P.sk2, 4, 1);

    if (back) {
      px(g, 3, 1, hair, 10, 11);
      px(g, 2, 3, hair, 1, 7); px(g, 13, 3, hair, 1, 7);
      px(g, 3, 1, hl, 8, 2);
      px(g, 4, 3, hl, 4, 2);
      px(g, 11, 2, hd, 3, 9);
      px(g, 3, 10, hd, 10, 2);                      // 襟足
    } else {
      // 顔
      px(g, 3, 3, P.sk2, 10, 8);
      px(g, 2, 5, P.sk2, 1, 4); px(g, 13, 5, P.sk2, 1, 4);
      px(g, 3, 3, P.sk3, 7, 2);                     // 額の光
      px(g, 11, 4, P.sk1, 2, 6);                    // 右の影
      px(g, 4, 10, P.sk1, 8, 1);                    // 顎
      px(g, 5, 11, P.sk1, 6, 1);
      // 目（白目＋瞳）
      px(g, 4, 6, P.bn4, 3, 3); px(g, 9, 6, P.bn4, 3, 3);
      px(g, 5, 6, o.eye || P.out, 2, 3); px(g, 10, 6, o.eye || P.out, 2, 3);
      px(g, 5, 6, P.white, 1, 1); px(g, 10, 6, P.white, 1, 1);
      px(g, 4, 5, hd, 3, 1); px(g, 9, 5, hd, 3, 1);  // 眉
      // 髪
      px(g, 3, 0, hair, 10, 4);
      px(g, 2, 1, hair, 1, 5); px(g, 13, 1, hair, 1, 5);
      px(g, 3, 3, hair, 2, 3); px(g, 11, 3, hair, 2, 3);
      px(g, 3, 0, hl, 7, 2);
      px(g, 4, 2, hl, 3, 1);
      px(g, 11, 0, hd, 3, 5);
      if (o.beard) {
        px(g, 3, 9, P.bn3, 10, 4); px(g, 4, 13, P.bn3, 8, 2);
        px(g, 3, 9, P.bn4, 6, 1);
        px(g, 6, 9, P.sk1, 4, 1);
      }
    }
    if (o.hat) {
      px(g, 0, 3, P[o.hat + 1], 16, 3);
      px(g, 0, 3, P[o.hat + 3], 16, 1);
      tri(g, 8, -6, 5, 9, P[o.hat + 2]);
      tri(g, 7, -5, 3, 8, P[o.hat + 3]);
      px(g, 0, 2, P.out, 16, 1);
    }
    if (o.crown) {
      px(g, 3, -1, P.gd2, 10, 3);
      px(g, 3, 0, P.gd4, 10, 1);
      px(g, 3, -2, P.gd3, 1, 2); px(g, 7, -2, P.gd3, 2, 2); px(g, 12, -2, P.gd3, 1, 2);
      px(g, 3, 2, P.gd0, 10, 1);
    }
    if (o.cape) {                                   // マント（村長・王など）
      px(g, 1, 13 + bob, P[o.cape + 1], 2, 7);
      px(g, 13, 13 + bob, P[o.cape + 0], 2, 7);
    }
    outline(c, P.out);
    return c;
  }

  function charSide(o, frame) {
    const c = mk(16, 24), g = c.getContext('2d');
    const hair = o.hair, hd = o.hairD || hair, hl = o.hairL || hair;
    const b = o.body;
    const b1 = P[b + 1], b2 = P[b + 2], b3 = P[b + 3], b0 = P[b + 0];
    const boot = o.boot || P.wd1;
    const bob = frame ? 1 : 0;

    // 足を前後に大きく開く
    if (frame) {
      px(g, 2, 19, boot, 5, 5); px(g, 9, 19, boot, 5, 5);
      px(g, 2, 19, P.wd3, 5, 1); px(g, 9, 19, P.wd3, 5, 1);
      px(g, 2, 23, P.wd0, 5, 1); px(g, 9, 23, P.wd0, 5, 1);
    } else {
      px(g, 4, 19, boot, 5, 5); px(g, 8, 20, boot, 5, 4);
      px(g, 4, 19, P.wd3, 5, 1);
      px(g, 4, 23, P.wd0, 5, 1);
    }

    px(g, 4, 13 + bob, b2, 8, 7 - bob);             // 胴（正面より細い）
    px(g, 4, 13 + bob, b3, 8, 1);
    px(g, 9, 14 + bob, b1, 3, 5);
    px(g, 4, 19, b0, 8, 1);
    px(g, 4, 17 + bob, o.belt || P.wd1, 8, 2);
    px(g, 4, 17 + bob, P.gd3, 8, 1);
    // 腕は1本だけ振る
    const ax = frame ? 2 : 4;
    px(g, ax, 13 + bob, b1, 3, 5);
    px(g, ax, 13 + bob, b2, 1, 5);
    px(g, ax, 18, P.sk2, 3, 2);
    px(g, 6, 11, P.sk1, 4, 2); px(g, 6, 11, P.sk2, 4, 1);   // 首

    // 頭：顔を左に寄せ、後頭部を右に膨らませる
    px(g, 2, 3, P.sk2, 9, 8);
    px(g, 1, 5, P.sk2, 1, 4);                       // 鼻先
    px(g, 2, 3, P.sk3, 5, 2);
    px(g, 3, 10, P.sk1, 7, 1);
    px(g, 4, 11, P.sk1, 5, 1);
    px(g, 3, 6, P.bn4, 3, 3);                       // 目（1つ）
    px(g, 3, 6, o.eye || P.out, 2, 3);
    px(g, 3, 6, P.white, 1, 1);
    px(g, 3, 5, hd, 3, 1);                          // 眉
    px(g, 2, 0, hair, 11, 4);                       // 髪
    px(g, 9, 2, hair, 5, 9);                        // 後頭部
    px(g, 1, 2, hair, 2, 3);
    px(g, 2, 0, hl, 7, 2);
    px(g, 11, 3, hd, 3, 8);
    if (o.beard) { px(g, 1, 9, P.bn3, 9, 4); px(g, 2, 13, P.bn3, 5, 2); px(g, 1, 9, P.bn4, 5, 1); }
    if (o.hat) {
      px(g, 0, 3, P[o.hat + 1], 15, 3);
      px(g, 0, 3, P[o.hat + 3], 15, 1);
      tri(g, 7, -6, 5, 9, P[o.hat + 2]);
      px(g, 0, 2, P.out, 15, 1);
    }
    if (o.crown) { px(g, 2, -1, P.gd2, 10, 3); px(g, 2, 0, P.gd4, 10, 1); px(g, 2, 2, P.gd0, 10, 1); }
    if (o.cape) px(g, 12, 13 + bob, P[o.cape + 0], 2, 7);
    outline(c, P.out);
    return c;
  }

  function makeChar(o) {
    const down = [charFront(o, false, 0), charFront(o, false, 1)];
    const up = [charFront(o, true, 0), charFront(o, true, 1)];
    const left = [charSide(o, 0), charSide(o, 1)];
    return [down, left, [flipX(left[0]), flipX(left[1])], up];
  }

  /* =====================================================================
     敵（96x96。面積が2.25倍になったぶん、鱗・毛・装備・光沢まで描く）
     ---------------------------------------------------------------------
     解像度を上げただけでは密度は出ない。各パーツを
     「暗部 → 基本 → 明部 → ハイライト」の4段で塗り、
     質感（鱗・骨・布のしわ・金属の反射）を1枚ずつ置いていく。
     ===================================================================== */
  function eSlime() {
    const c = mk(96, 96), g = c.getContext('2d');
    const CY = 82, RX = 36, RY = 46;
    dome(g, 48, CY, RX, RY, P.wt2);
    // 下ほど濃く（body の丸み）
    for (let y = 50; y <= CY; y++)
      for (let x = 10; x < 86; x++)
        if (((x - 48) * (x - 48)) / (RX * RX) + ((y - CY) * (y - CY)) / (RY * RY) <= 1.04)
          px(g, x, y, y > CY - 12 ? P.wt0 : y > CY - 26 ? P.wt1 : P.wt2);
    // 上面の透過光
    for (let y = 40; y <= 62; y++)
      for (let x = 20; x < 66; x++)
        if (((x - 42) * (x - 42)) / (23 * 23) + ((y - 68) * (y - 68)) / (34 * 34) <= 1.0)
          px(g, x, y, P.wt3);
    ellipse(g, 34, 48, 10, 8, P.wt4);
    ellipse(g, 32, 46, 5, 4, P.white);              // ハイライト
    px(g, 30, 44, P.white, 3, 2);
    // 底の接地面
    px(g, 12, CY, P.wt1, 72, 2);
    px(g, 16, CY + 2, P.wt0, 64, 1);
    // 粘液の垂れ
    for (let i = 0; i < 4; i++) {
      const x = 22 + i * 17, h = 5 + ((i * 7) % 9);
      px(g, x, CY - 2, P.wt1, 4, h);
      px(g, x + 1, CY + h - 4, P.wt0, 2, 3);
    }
    // 目と口
    px(g, 30, 60, P.out, 9, 13); px(g, 57, 60, P.out, 9, 13);
    px(g, 32, 62, P.white, 5, 8); px(g, 59, 62, P.white, 5, 8);
    px(g, 32, 66, P.wt4, 5, 4); px(g, 59, 66, P.wt4, 5, 4);
    px(g, 33, 63, P.white, 2, 2); px(g, 60, 63, P.white, 2, 2);
    px(g, 40, 74, P.out, 16, 3);
    px(g, 38, 72, P.out, 2, 2); px(g, 56, 72, P.out, 2, 2);
    px(g, 42, 78, P.wt3, 12, 2);
    outline(c, P.out);
    return c;
  }

  function eBat() {
    const c = mk(96, 96), g = c.getContext('2d');
    // 翼（膜＋骨＋縁の毛羽）
    tri3(g, 42, 34, 2, 16, 10, 62, P.pp1);
    tri3(g, 42, 34, 10, 62, 38, 58, P.pp1);
    tri3(g, 54, 34, 94, 16, 86, 62, P.pp2);
    tri3(g, 54, 34, 86, 62, 58, 58, P.pp2);
    for (let i = 0; i < 4; i++) {
      const t = (i + 1) / 5;
      const ex = Math.round(2 + t * 10), ey = Math.round(16 + t * 44);
      for (let sN = 0; sN <= 18; sN++) {
        const k = sN / 18;
        px(g, Math.round(42 + (ex - 42) * k), Math.round(34 + (ey - 34) * k), P.pp3);
        px(g, Math.round(54 + (94 - ex - 54) * k), Math.round(34 + (ey - 34) * k), P.pp3);
      }
    }
    px(g, 26, 30, P.pp3, 20, 5); px(g, 50, 30, P.pp3, 20, 5);
    // 胴（毛の質感）
    ellipse(g, 48, 52, 15, 21, P.pp2);
    ellipse(g, 44, 46, 11, 14, P.pp3);
    ellipse(g, 48, 64, 12, 9, P.pp1);
    for (let i = 0; i < 22; i++) px(g, 36 + ((i * 5) % 24), 38 + ((i * 7) % 30), P.pp4);
    // 頭
    disc(g, 48, 34, 17, P.pp2);
    disc(g, 43, 28, 11, P.pp3);
    disc(g, 41, 25, 5, P.pp4);
    tri(g, 34, 3, 6, 19, P.pp2); tri(g, 62, 3, 6, 19, P.pp2);
    tri(g, 34, 8, 3, 13, P.pp1); tri(g, 62, 8, 3, 13, P.pp1);
    // 目
    px(g, 36, 30, P.re0, 11, 9); px(g, 50, 30, P.re0, 11, 9);
    px(g, 37, 31, P.re2, 9, 7); px(g, 51, 31, P.re2, 9, 7);
    px(g, 39, 32, P.gd3, 5, 4); px(g, 53, 32, P.gd3, 5, 4);
    px(g, 40, 33, P.white, 2, 2); px(g, 54, 33, P.white, 2, 2);
    px(g, 34, 26, P.pp0, 13, 3); px(g, 50, 26, P.pp0, 13, 3);   // 眉
    // 口と牙
    px(g, 40, 44, P.out, 16, 5);
    px(g, 41, 47, P.bn4, 4, 7); px(g, 51, 47, P.bn4, 4, 7);
    px(g, 46, 46, P.re1, 5, 3);
    // 足
    px(g, 40, 70, P.pp1, 6, 10); px(g, 51, 70, P.pp1, 6, 10);
    for (let i = 0; i < 3; i++) { px(g, 38 + i * 3, 78, P.bn2, 2, 5); px(g, 49 + i * 3, 78, P.bn2, 2, 5); }
    outline(c, P.out);
    return c;
  }

  function eGoblin() {
    const c = mk(96, 96), g = c.getContext('2d');
    px(g, 31, 68, P.gn1, 11, 20); px(g, 54, 68, P.gn1, 11, 20);
    px(g, 31, 68, P.gn2, 5, 20); px(g, 54, 68, P.gn2, 5, 20);
    px(g, 28, 85, P.wd1, 16, 8); px(g, 52, 85, P.wd1, 16, 8);
    px(g, 28, 85, P.wd3, 16, 2); px(g, 52, 85, P.wd3, 16, 2);
    // 胴（胸筋と腹の陰影）
    ellipse(g, 48, 60, 20, 18, P.gn2);
    ellipse(g, 42, 54, 13, 12, P.gn3);
    ellipse(g, 40, 50, 7, 6, P.gn4);
    ellipse(g, 48, 70, 16, 9, P.gn1);
    px(g, 46, 48, P.gn1, 3, 18);                     // 胸の谷
    for (let i = 0; i < 3; i++) px(g, 40, 60 + i * 5, P.gn1, 16, 1);   // 腹筋
    // 腰布（模様つき）
    px(g, 28, 64, P.wd2, 40, 13);
    px(g, 28, 64, P.wd4, 40, 3);
    px(g, 28, 74, P.wd0, 40, 3);
    for (let i = 0; i < 5; i++) px(g, 31 + i * 8, 67, P.re2, 4, 5);
    // 腕
    px(g, 22, 42, P.gn1, 11, 27); px(g, 63, 42, P.gn1, 11, 27);
    px(g, 22, 42, P.gn2, 5, 27); px(g, 69, 42, P.gn0, 5, 27);
    px(g, 20, 64, P.gn2, 13, 9); px(g, 63, 64, P.gn2, 13, 9);
    px(g, 24, 46, P.st1, 8, 4); px(g, 64, 46, P.st1, 8, 4);        // 腕輪
    // 頭
    disc(g, 48, 30, 20, P.gn2);
    disc(g, 42, 23, 12, P.gn3);
    disc(g, 40, 20, 6, P.gn4);
    tri3(g, 28, 15, 28, 42, 3, 22, P.gn2);
    tri3(g, 68, 15, 68, 42, 93, 22, P.gn2);
    tri3(g, 28, 20, 28, 37, 10, 24, P.gn1);
    tri3(g, 68, 20, 68, 37, 86, 24, P.gn1);
    px(g, 32, 26, P.gd3, 10, 8); px(g, 54, 26, P.gd3, 10, 8);
    px(g, 34, 28, P.out, 6, 6); px(g, 56, 28, P.out, 6, 6);
    px(g, 35, 29, P.gd4, 2, 2); px(g, 57, 29, P.gd4, 2, 2);
    px(g, 29, 20, P.gn0, 14, 4); px(g, 53, 20, P.gn0, 14, 4);      // 眉
    px(g, 44, 34, P.gn1, 8, 5);                                    // 鼻
    px(g, 36, 42, P.out, 24, 7);                                   // 口
    for (let i = 0; i < 4; i++) px(g, 38 + i * 6, 42, P.bn4, 4, 5);
    px(g, 30, 18, P.gn0, 8, 2);                                    // 傷跡
    px(g, 32, 15, P.gn0, 2, 6);
    // こんぼう
    px(g, 68, 22, P.wd1, 9, 48); px(g, 70, 24, P.wd3, 3, 44);
    px(g, 63, 4, P.wd1, 19, 20); px(g, 65, 6, P.wd2, 14, 15);
    px(g, 67, 8, P.wd4, 6, 5);
    for (let i = 0; i < 4; i++) px(g, 64 + (i % 2) * 9, 8 + i * 4, P.st2, 4, 4);   // 打ち込んだ鋲
    outline(c, P.out);
    return c;
  }

  function eSkeleton() {
    const c = mk(96, 96), g = c.getContext('2d');
    px(g, 36, 66, P.bn2, 9, 23); px(g, 51, 66, P.bn2, 9, 23);
    px(g, 36, 66, P.bn3, 3, 23); px(g, 57, 66, P.bn0, 3, 23);
    px(g, 34, 74, P.bn1, 13, 4); px(g, 49, 74, P.bn1, 13, 4);      // 膝
    px(g, 31, 87, P.bn2, 16, 6); px(g, 49, 87, P.bn2, 16, 6);
    px(g, 34, 60, P.bn2, 28, 9); px(g, 34, 66, P.bn1, 28, 3);      // 骨盤
    px(g, 44, 38, P.bn1, 8, 24);                                    // 背骨
    for (let i = 0; i < 5; i++) px(g, 43, 40 + i * 5, P.bn0, 10, 2);
    // 肋骨
    for (let i = 0; i < 5; i++) {
      const y = 39 + i * 6, len = 16 - i * 2;
      px(g, 48 - len, y, P.bn2, len, 3); px(g, 48, y, P.bn2, len, 3);
      px(g, 46 - len, y + 2, P.bn2, 3, 4); px(g, 46 + len, y + 2, P.bn2, 3, 4);
      px(g, 48 - len, y + 2, P.bn1, len * 2, 1);
      px(g, 48 - len, y, P.bn3, len, 1);
    }
    // 肩当て（鎧の断片）
    px(g, 26, 32, P.st1, 20, 12); px(g, 26, 32, P.st3, 20, 4);
    px(g, 50, 32, P.st1, 20, 12); px(g, 50, 32, P.st3, 20, 4);
    px(g, 26, 42, P.st0, 20, 3); px(g, 50, 42, P.st0, 20, 3);
    px(g, 30, 35, P.gd2, 5, 5); px(g, 61, 35, P.gd2, 5, 5);
    // 腕
    px(g, 22, 44, P.bn2, 8, 24); px(g, 66, 44, P.bn2, 8, 24);
    px(g, 22, 44, P.bn3, 3, 24); px(g, 71, 44, P.bn0, 3, 24);
    px(g, 19, 64, P.bn2, 12, 8); px(g, 65, 64, P.bn2, 12, 8);
    // 頭蓋
    disc(g, 48, 22, 18, P.bn2);
    disc(g, 42, 16, 11, P.bn3);
    disc(g, 40, 13, 5, P.bn4);
    px(g, 34, 19, P.out, 11, 11); px(g, 51, 19, P.out, 11, 11);
    px(g, 36, 21, P.re0, 8, 8); px(g, 53, 21, P.re0, 8, 8);
    px(g, 38, 23, P.re2, 5, 5); px(g, 55, 23, P.re2, 5, 5);
    px(g, 39, 24, P.re4, 2, 2); px(g, 56, 24, P.re4, 2, 2);
    px(g, 44, 31, P.out, 6, 5);                                     // 鼻腔
    px(g, 36, 36, P.bn1, 22, 6);                                    // 歯
    for (let i = 0; i < 8; i++) px(g, 37 + i * 3, 36, P.bn4, 2, 6);
    px(g, 30, 10, P.bn0, 10, 3);                                    // 頭蓋のひび
    px(g, 34, 6, P.bn0, 3, 8);
    // 剣（刃の反射）
    px(g, 70, 2, P.sl1, 8, 54); px(g, 72, 4, P.sl3, 4, 50);
    px(g, 73, 4, P.sl4, 2, 44);
    px(g, 72, 30, P.white, 3, 10);
    px(g, 62, 54, P.gd1, 24, 6); px(g, 62, 54, P.gd3, 24, 3);
    px(g, 70, 60, P.wd1, 8, 14); px(g, 72, 60, P.wd3, 3, 14);
    px(g, 69, 72, P.gd2, 10, 5);
    outline(c, P.out);
    return c;
  }

  function eMage() {
    const c = mk(96, 96), g = c.getContext('2d');
    // ローブ（襞を強調）
    tri3(g, 48, 44, 10, 94, 86, 94, P.pp2);
    tri3(g, 48, 44, 18, 94, 48, 94, P.pp3);
    tri3(g, 48, 44, 62, 94, 86, 94, P.pp1);
    px(g, 10, 89, P.pp1, 76, 6);
    for (let i = 0; i < 7; i++) {
      const x = 16 + i * 11;
      px(g, x, 66, P.pp1, 3, 28);
      px(g, x + 3, 70, P.pp3, 2, 24);
    }
    // 胴
    px(g, 30, 38, P.pp2, 36, 30);
    px(g, 30, 38, P.pp3, 36, 5);
    px(g, 58, 42, P.pp1, 8, 26);
    px(g, 44, 42, P.gd2, 6, 30);                                    // 前あわせ
    px(g, 44, 42, P.gd4, 2, 30);
    px(g, 38, 56, P.gd2, 18, 5); px(g, 38, 56, P.gd4, 18, 2);
    // 顔（影の中に光る目）
    disc(g, 48, 30, 17, P.dark);
    disc(g, 48, 29, 13, '#07060c');
    px(g, 35, 28, P.gd2, 10, 6); px(g, 52, 28, P.gd2, 10, 6);
    px(g, 36, 29, P.gd4, 8, 4); px(g, 53, 29, P.gd4, 8, 4);
    px(g, 38, 30, P.white, 3, 2); px(g, 55, 30, P.white, 3, 2);
    // 帽子
    px(g, 20, 16, P.pp1, 56, 8);
    px(g, 20, 16, P.pp3, 56, 3);
    px(g, 20, 22, P.pp0, 56, 2);
    tri(g, 43, -16, 15, 34, P.pp2);
    tri(g, 39, -12, 9, 29, P.pp3);
    px(g, 32, 2, P.gd2, 8, 7); px(g, 32, 2, P.gd4, 5, 4);
    // 腕
    px(g, 20, 42, P.pp2, 13, 20); px(g, 64, 42, P.pp2, 13, 20);
    px(g, 20, 42, P.pp3, 5, 20); px(g, 72, 42, P.pp1, 5, 20);
    px(g, 18, 58, P.sk1, 12, 8); px(g, 66, 58, P.sk1, 12, 8);       // 手
    // 杖（宝玉の発光）
    px(g, 72, 16, P.wd1, 7, 66); px(g, 74, 18, P.wd3, 3, 62);
    for (let i = 0; i < 4; i++) px(g, 71, 28 + i * 14, P.gd2, 9, 3);
    disc(g, 76, 12, 12, 'rgba(200,60,60,0.30)');
    disc(g, 76, 12, 9, P.re1);
    disc(g, 75, 11, 6, P.re3);
    disc(g, 74, 10, 3, P.gd3);
    disc(g, 74, 9, 1, P.white);
    outline(c, P.out);
    return c;
  }

  function eBoss() {
    const c = mk(96, 96), g = c.getContext('2d');
    // 翼（骨・膜・爪）
    tri3(g, 36, 56, 0, 4, 2, 48, P.pp1);
    tri3(g, 36, 56, 2, 48, 26, 70, P.pp1);
    tri3(g, 60, 56, 96, 4, 94, 48, P.pp2);
    tri3(g, 60, 56, 94, 48, 70, 70, P.pp2);
    for (let i = 0; i < 4; i++) {
      const t = (i + 1) / 5;
      const ex = Math.round(t * 26), ey = Math.round(4 + t * 66);
      for (let k = 0; k <= 20; k++) {
        const q = k / 20;
        px(g, Math.round(36 + (ex - 36) * q), Math.round(56 + (ey - 56) * q), P.pp3);
        px(g, Math.round(60 + (96 - ex - 60) * q), Math.round(56 + (ey - 56) * q), P.pp3);
      }
    }
    px(g, 24, 52, P.pp3, 16, 6); px(g, 56, 52, P.pp3, 16, 6);
    px(g, 2, 4, P.bn2, 5, 5); px(g, 89, 4, P.bn2, 5, 5);            // 翼の爪
    // 胴（鱗を1枚ずつ）
    ellipse(g, 48, 72, 24, 20, P.gn2);
    ellipse(g, 40, 66, 16, 13, P.gn3);
    ellipse(g, 37, 62, 8, 6, P.gn4);
    ellipse(g, 48, 82, 18, 11, P.gn1);
    for (let r = 0; r < 4; r++)
      for (let i = 0; i < 6; i++) {
        const x = 28 + i * 7 + (r % 2) * 3, y = 58 + r * 7;
        if ((x - 48) * (x - 48) / (22 * 22) + (y - 72) * (y - 72) / (18 * 18) > 1) continue;
        dome(g, x, y + 4, 3, 4, P.gn1);
        dome(g, x, y + 3, 3, 3, P.gn3);
      }
    for (let i = 0; i < 6; i++) {                                   // 腹の甲板
      px(g, 34 + i * 5, 68 + (i % 2), P.gd2, 4, 15);
      px(g, 34 + i * 5, 68 + (i % 2), P.gd4, 4, 3);
      px(g, 34 + i * 5, 81 + (i % 2), P.gd0, 4, 2);
    }
    // 首（S字＋背びれ）
    for (let i = 0; i < 26; i++) {
      const t = i / 25;
      const x = 48 + Math.round(Math.sin(t * 1.7) * 8);
      const w = 21 - Math.round(t * 7);
      px(g, x - (w >> 1), 58 - i, P.gn2, w, 1);
      px(g, x + (w >> 1) - 6, 58 - i, P.gn1, 6, 1);
      px(g, x - (w >> 1), 58 - i, P.gn3, 4, 1);
      if (i % 3 === 0) px(g, x - (w >> 1) + 2, 58 - i, P.gn4, 3, 1);
    }
    for (let i = 0; i < 7; i++) tri(g, 56 + i, 50 - i * 4, 3, 6, P.bn2);
    // 頭
    disc(g, 50, 22, 17, P.gn2);
    disc(g, 44, 16, 11, P.gn3);
    disc(g, 42, 13, 5, P.gn4);
    ellipse(g, 50, 33, 15, 7, P.gn2);                               // 口吻
    ellipse(g, 50, 36, 14, 4, P.gn1);
    px(g, 44, 28, P.gn1, 4, 4); px(g, 54, 28, P.gn1, 4, 4);         // 鼻孔
    tri(g, 34, -2, 6, 19, P.bn3); tri(g, 66, -2, 6, 19, P.bn3);     // 角
    px(g, 33, 6, P.bn1, 4, 9); px(g, 65, 6, P.bn1, 4, 9);
    tri(g, 28, 12, 4, 12, P.bn2); tri(g, 72, 12, 4, 12, P.bn2);
    // 目
    px(g, 36, 16, P.re0, 13, 9); px(g, 52, 16, P.re0, 13, 9);
    px(g, 37, 17, P.re2, 11, 7); px(g, 53, 17, P.re2, 11, 7);
    px(g, 40, 18, P.gd3, 5, 4); px(g, 56, 18, P.gd3, 5, 4);
    px(g, 41, 19, P.white, 2, 2); px(g, 57, 19, P.white, 2, 2);
    px(g, 34, 9, P.gn0, 15, 5); px(g, 51, 9, P.gn0, 15, 5);         // 眉
    // 口と牙
    px(g, 36, 38, P.out, 28, 4);
    for (let i = 0; i < 8; i++) px(g, 37 + i * 3.4, 35, P.bn4, 3, 5);
    px(g, 42, 42, P.re1, 14, 3);
    // 前脚
    px(g, 16, 68, P.gn2, 15, 20); px(g, 65, 68, P.gn2, 15, 20);
    px(g, 16, 68, P.gn1, 6, 20); px(g, 74, 68, P.gn1, 6, 20);
    px(g, 18, 62, P.gn3, 11, 8); px(g, 67, 62, P.gn3, 11, 8);
    for (let i = 0; i < 3; i++) {
      px(g, 14 + i * 6, 86, P.bn3, 5, 8); px(g, 64 + i * 6, 86, P.bn3, 5, 8);
      px(g, 14 + i * 6, 86, P.bn4, 5, 3); px(g, 64 + i * 6, 86, P.bn4, 5, 3);
    }
    // 尾
    for (let i = 0; i < 24; i++) {
      const w = Math.max(3, 15 - Math.round(i * 0.55));
      const y = 80 - Math.round(Math.sin(i * 0.19) * 11);
      px(g, 68 + i, y, P.gn2, 2, w);
      px(g, 68 + i, y, P.gn3, 2, 3);
      if (i % 4 === 0) px(g, 68 + i, y + w - 3, P.gn1, 2, 3);
    }
    tri(g, 93, 62, 5, 11, P.bn3);
    outline(c, P.out);
    return c;
  }

  /* =====================================================================
     初期化
     ===================================================================== */
  G.initSprites = function () {
    G.TILE = {
      grass: [tGrass(1), tGrass(2), tGrass(3), tGrass(4)],   // 模様違い
      road: tRoad(),                                 // [variant][mask]
      water: [tWater(0), tWater(1), tWater(2), tWater(3)],   // [frame][mask]
      tree: tTree(), mtn: tMountain(),
      brick: tBrick(), floor: tFloor(),
      cfloor: tCaveFloor(), cwall: tCaveWall(),
      roof: tRoof(), roofTop: tRoofTop(), door: tDoor(),
      counter: tCounter(), throne: tThrone(),
      down: tStairs(true), up: tStairs(false), centr: tCaveEntrance(),
      bridge: tBridge(), sign: tSign(),
      chest: tChest(false), chestOpen: tChest(true),
      flower: tFlower(),
      barrel: tBarrel(), pot: tPot(), torch: tTorch(),
      fence: tFence(), well: tWell(), carpet: tCarpet(),
      bed: tBed(), table: tTable(), shelf: tShelf(), fountain: tFountain(),
      bench: tBench(), cart: tCart(), flowerbed: tFlowerbed(), stone: tStone(),
      grave: tGrave(), crate: tCrate(),
      stalag: tStalag(), puddle: tPuddle(), bones: tBones(),
    };

    G.SPR = {
      hero: makeChar({ hair: P.wd2, hairL: P.wd4, hairD: P.wd0, body: 'bl', belt: P.wd1, boot: P.wd1 }),
      elder: makeChar({ hair: P.bn3, hairL: P.bn4, hairD: P.bn1, body: 'pp', beard: 1, cape: 'pp' }),
      king: makeChar({ hair: P.bn3, hairL: P.bn4, hairD: P.bn1, body: 're', crown: 1, beard: 1, cape: 're' }),
      villager: makeChar({ hair: P.wd1, hairL: P.wd3, hairD: P.wd0, body: 'gn', boot: P.wd0 }),
      girl: makeChar({ hair: P.gd2, hairL: P.gd4, hairD: P.gd0, body: 're', belt: P.bn3 }),
      shop: makeChar({ hair: P.wd0, hairL: P.wd2, hairD: P.wd0, body: 'gd', belt: P.wd1 }),
      smith: makeChar({ hair: P.out, hairL: P.sl1, hairD: P.out, body: 'sl', belt: P.wd0 }),
      inn: makeChar({ hair: P.wd2, hairL: P.wd4, hairD: P.wd0, body: 'wt', belt: P.bn3 }),
      priest: makeChar({ hair: P.bn1, hairL: P.bn3, hairD: P.bn0, body: 'bn', hat: 'bn', belt: P.gd2 }),
      sage: makeChar({ hair: P.bn3, hairL: P.bn4, hairD: P.bn1, body: 'pp', hat: 'pp', beard: 1 }),
      soldier: makeChar({ hair: P.wd0, hairL: P.wd2, hairD: P.wd0, body: 'sl', belt: P.out }),
    };

    G.ENEMY = {
      slime: eSlime(), bat: eBat(), goblin: eGoblin(),
      skeleton: eSkeleton(), mage: eMage(), boss: eBoss(),
    };
  };
})();
