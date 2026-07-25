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

  /* ---- 屋内の壁面設備（部屋に用途を持たせる） ---- */
  function tFireplace() {
    const c = mk(16, 16), g = c.getContext('2d');
    px(g, 0, 0, P.st2, 16, 16);
    for (let y = 0; y < 16; y += 4) { px(g, 0, y, P.st3, 16, 1); px(g, 0, y + 3, P.st1, 16, 1); }
    px(g, 2, 4, P.st0, 12, 12);                    // 炉の口
    px(g, 3, 6, '#1a0f08', 10, 10);
    px(g, 1, 2, P.st1, 14, 3); px(g, 1, 2, P.st4, 14, 1);   // まぐさ石
    // 炎
    disc(g, 8, 13, 4, P.re1);
    disc(g, 8, 13, 3, P.re3);
    disc(g, 8, 12, 2, P.gd2);
    px(g, 7, 9, P.gd3, 2, 3); px(g, 6, 11, P.gd4, 1, 2); px(g, 10, 11, P.gd4, 1, 2);
    px(g, 4, 15, P.wd0, 8, 1);                     // 薪
    px(g, 5, 14, P.wd1, 6, 1);
    return c;
  }
  function tForge() {
    const c = mk(16, 16), g = c.getContext('2d');
    bgFloor(g);
    px(g, 2, 14, P.shadow, 12, 2);
    px(g, 3, 8, P.st0, 10, 7);                     // 金床の台
    px(g, 4, 9, P.st2, 8, 5);
    px(g, 1, 4, P.st1, 14, 5);                     // 金床
    px(g, 1, 4, P.st3, 14, 2);
    px(g, 1, 8, P.st0, 14, 1);
    px(g, 12, 3, P.st1, 4, 2);                     // 角
    px(g, 5, 2, P.wd1, 2, 3); px(g, 4, 0, P.st2, 5, 3);     // ハンマー
    px(g, 4, 0, P.st4, 5, 1);
    px(g, 9, 5, P.re2, 3, 2); px(g, 9, 5, P.gd3, 3, 1);     // 熱した鉄
    px(g, 10, 3, P.gd4, 1, 2);
    return c;
  }
  function tBookwall() {
    const c = mk(16, 16), g = c.getContext('2d');
    px(g, 0, 0, P.wd0, 16, 16);
    for (let r = 0; r < 4; r++) {
      const y = r * 4;
      px(g, 0, y + 3, P.wd2, 16, 1);
      const cols = [P.re2, P.bl2, P.gn2, P.gd2, P.pp3, P.bn2];
      for (let i = 0; i < 8; i++) {
        const h = 3 - ((i + r) % 2);
        px(g, i * 2, y + (3 - h), cols[(i * 3 + r * 2) % 6], 2, h);
        px(g, i * 2, y + (3 - h), P.white, 1, 1);
      }
    }
    px(g, 0, 0, P.wd1, 16, 1);
    return c;
  }
  function tAltar() {
    const c = mk(16, 16), g = c.getContext('2d');
    bgFloor(g);
    px(g, 2, 13, P.shadow, 12, 3);
    px(g, 2, 6, P.st1, 12, 9);
    px(g, 2, 6, P.st3, 12, 2);
    px(g, 2, 14, P.st0, 12, 1);
    px(g, 4, 2, P.bn3, 8, 5);                      // 供物の布
    px(g, 4, 2, P.bn4, 8, 2);
    px(g, 7, 0, P.gd2, 2, 6); px(g, 5, 2, P.gd2, 6, 2);     // 十字
    px(g, 7, 0, P.gd4, 1, 6);
    px(g, 3, 8, P.re2, 2, 2); px(g, 11, 8, P.re2, 2, 2);    // 灯
    px(g, 3, 8, P.gd4, 2, 1); px(g, 11, 8, P.gd4, 2, 1);
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
     敵（96x96）
     ---------------------------------------------------------------------
     前回の反省：パーツを描き込んでもシルエットが弱いと迫力が出ない。
     「影絵にしたとき何の生き物か分かるか」を先に決めてから中身を塗る。

       スライム   … 低く横に広い半球（他より明らかに小さい＝雑魚の記号）
       コウモリ   … 体は小さく翼が横いっぱい。横長のシルエット
       ゴブリン   … 猫背で縦長。頭は小さく、腕が長い
       がいこつ   … 細く縦に長い。隙間が多い
       まどうし   … 裾が広がる三角。帽子で背丈を稼ぐ
       やみのりゅう… 首を長く、翼を大きく、体高を出す。縦にも横にも最大
     ===================================================================== */
  function eSlime() {
    const c = mk(96, 96), g = c.getContext('2d');
    const CY = 84, RX = 33, RY = 40;
    dome(g, 48, CY, RX, RY, P.wt2);
    for (let y = 52; y <= CY; y++)
      for (let x = 12; x < 84; x++)
        if (((x - 48) * (x - 48)) / (RX * RX) + ((y - CY) * (y - CY)) / (RY * RY) <= 1.04)
          px(g, x, y, y > CY - 10 ? P.wt0 : y > CY - 22 ? P.wt1 : P.wt2);
    for (let y = 48| 0; y <= 66; y++)
      for (let x = 22; x < 64; x++)
        if (((x - 42) * (x - 42)) / (21 * 21) + ((y - 72) * (y - 72)) / (30 * 30) <= 1.0)
          px(g, x, y, P.wt3);
    ellipse(g, 34, 54, 9, 7, P.wt4);
    ellipse(g, 32, 52, 5, 4, P.white);
    px(g, 30, 50, P.white, 3, 2);
    px(g, 14, CY, P.wt1, 68, 2);
    px(g, 18, CY + 2, P.wt0, 60, 1);
    for (let i = 0; i < 4; i++) {
      const x = 24 + i * 16, h = 4 + ((i * 7) % 8);
      px(g, x, CY - 2, P.wt1, 4, h);
      px(g, x + 1, CY + h - 4, P.wt0, 2, 3);
    }
    px(g, 31, 64, P.out, 9, 12); px(g, 56, 64, P.out, 9, 12);
    px(g, 33, 66, P.white, 5, 7); px(g, 58, 66, P.white, 5, 7);
    px(g, 33, 70, P.wt4, 5, 3); px(g, 58, 70, P.wt4, 5, 3);
    px(g, 34, 67, P.white, 2, 2); px(g, 59, 67, P.white, 2, 2);
    px(g, 40, 76, P.out, 16, 3);
    px(g, 38, 74, P.out, 2, 2); px(g, 56, 74, P.out, 2, 2);
    outline(c, P.out);
    return c;
  }

  function eBat() {
    const c = mk(96, 96), g = c.getContext('2d');
    // 翼を横いっぱいに広げる。体は小さく保ち、横長のシルエットにする
    const WY = 34;
    tri3(g, 40, WY, 0, 8, 4, 56, P.pp1);
    tri3(g, 40, WY, 4, 56, 22, 62, P.pp1);
    tri3(g, 40, WY, 22, 62, 38, 54, P.pp1);
    tri3(g, 56, WY, 96, 8, 92, 56, P.pp2);
    tri3(g, 56, WY, 92, 56, 74, 62, P.pp2);
    tri3(g, 56, WY, 74, 62, 58, 54, P.pp2);
    for (let i = 0; i < 4; i++) {
      const t = (i + 1) / 5;
      const ex = Math.round(t * 22), ey = Math.round(8 + t * 54);
      for (let k = 0; k <= 22; k++) {
        const q = k / 22;
        px(g, Math.round(40 + (ex - 40) * q), Math.round(WY + (ey - WY) * q), P.pp3);
        px(g, Math.round(56 + (96 - ex - 56) * q), Math.round(WY + (ey - WY) * q), P.pp3);
      }
    }
    px(g, 16, 26, P.pp3, 26, 6); px(g, 54, 26, P.pp3, 26, 6);   // 翼の前縁
    px(g, 2, 8, P.bn2, 5, 5); px(g, 89, 8, P.bn2, 5, 5);        // 翼の爪
    ellipse(g, 48, 48, 11, 16, P.pp2);                          // 胴（小さめ）
    ellipse(g, 45, 43, 8, 11, P.pp3);
    ellipse(g, 48, 58, 9, 7, P.pp1);
    for (let i = 0; i < 18; i++) px(g, 40 + ((i * 5) % 17), 38 + ((i * 7) % 24), P.pp4);
    disc(g, 48, 30, 13, P.pp2);
    disc(g, 44, 26, 8, P.pp3);
    disc(g, 42, 23, 4, P.pp4);
    tri(g, 37, 2, 5, 17, P.pp2); tri(g, 59, 2, 5, 17, P.pp2);
    tri(g, 37, 6, 2, 12, P.pp1); tri(g, 59, 6, 2, 12, P.pp1);
    px(g, 39, 27, P.re0, 8, 7); px(g, 49, 27, P.re0, 8, 7);
    px(g, 40, 28, P.re2, 6, 5); px(g, 50, 28, P.re2, 6, 5);
    px(g, 41, 29, P.gd3, 4, 3); px(g, 51, 29, P.gd3, 4, 3);
    px(g, 42, 30, P.white, 2, 2); px(g, 52, 30, P.white, 2, 2);
    px(g, 36, 23, P.pp0, 11, 3); px(g, 49, 23, P.pp0, 11, 3);
    px(g, 42, 38, P.out, 12, 4);
    px(g, 43, 40, P.bn4, 3, 6); px(g, 50, 40, P.bn4, 3, 6);
    px(g, 42, 64, P.pp1, 5, 9); px(g, 49, 64, P.pp1, 5, 9);
    for (let i = 0; i < 3; i++) { px(g, 40 + i * 3, 71, P.bn2, 2, 5); px(g, 48 + i * 3, 71, P.bn2, 2, 5); }
    outline(c, P.out);
    return c;
  }

  function eGoblin() {
    const c = mk(96, 96), g = c.getContext('2d');
    // 猫背で縦長。頭を小さくして、腕を長く垂らす
    px(g, 33, 70, P.gn1, 11, 18); px(g, 52, 70, P.gn1, 11, 18);
    px(g, 33, 70, P.gn2, 5, 18);
    px(g, 30, 85, P.wd1, 16, 8); px(g, 50, 85, P.wd1, 16, 8);
    px(g, 30, 85, P.wd3, 16, 2); px(g, 50, 85, P.wd3, 16, 2);
    ellipse(g, 48, 54, 17, 22, P.gn2);                           // 胴（縦長）
    ellipse(g, 42, 48, 11, 15, P.gn3);
    ellipse(g, 40, 42, 6, 6, P.gn4);
    ellipse(g, 48, 68, 14, 9, P.gn1);
    px(g, 46, 36, P.gn1, 3, 22);
    for (let i = 0; i < 4; i++) px(g, 41, 52 + i * 5, P.gn1, 14, 1);
    px(g, 30, 62, P.wd2, 36, 12);                                // 腰布
    px(g, 30, 62, P.wd4, 36, 3);
    px(g, 30, 71, P.wd0, 36, 3);
    for (let i = 0; i < 4; i++) px(g, 34 + i * 9, 65, P.re2, 4, 5);
    // 腕は長く、膝の高さまで垂らす
    px(g, 24, 36, P.gn1, 10, 34); px(g, 62, 36, P.gn1, 10, 34);
    px(g, 24, 36, P.gn2, 4, 34); px(g, 68, 36, P.gn0, 4, 34);
    px(g, 21, 66, P.gn2, 13, 10); px(g, 62, 66, P.gn2, 13, 10);
    px(g, 26, 40, P.st1, 7, 4); px(g, 63, 40, P.st1, 7, 4);
    disc(g, 48, 24, 16, P.gn2);                                  // 頭（前より小さい）
    disc(g, 43, 19, 10, P.gn3);
    disc(g, 41, 16, 5, P.gn4);
    tri3(g, 32, 12, 32, 34, 8, 18, P.gn2);
    tri3(g, 64, 12, 64, 34, 88, 18, P.gn2);
    tri3(g, 32, 16, 32, 30, 14, 20, P.gn1);
    tri3(g, 64, 16, 64, 30, 82, 20, P.gn1);
    px(g, 36, 21, P.gd3, 8, 7); px(g, 52, 21, P.gd3, 8, 7);
    px(g, 38, 23, P.out, 5, 5); px(g, 54, 23, P.out, 5, 5);
    px(g, 39, 24, P.gd4, 2, 2); px(g, 55, 24, P.gd4, 2, 2);
    px(g, 34, 16, P.gn0, 12, 3); px(g, 51, 16, P.gn0, 12, 3);
    px(g, 45, 28, P.gn1, 6, 4);
    px(g, 39, 34, P.out, 19, 6);
    for (let i = 0; i < 4; i++) px(g, 41 + i * 5, 34, P.bn4, 3, 4);
    // こんぼう（長く、上に突き出す）
    px(g, 68, 20, P.wd1, 9, 50); px(g, 70, 22, P.wd3, 3, 46);
    px(g, 63, 2, P.wd1, 19, 20); px(g, 65, 4, P.wd2, 14, 15);
    px(g, 67, 6, P.wd4, 6, 5);
    for (let i = 0; i < 4; i++) px(g, 64 + (i % 2) * 9, 6 + i * 4, P.st2, 4, 4);
    outline(c, P.out);
    return c;
  }

  function eSkeleton() {
    const c = mk(96, 96), g = c.getContext('2d');
    // 細く縦に長い。体の中に隙間があるのが骨のシルエット
    px(g, 38, 68, P.bn2, 7, 22); px(g, 51, 68, P.bn2, 7, 22);
    px(g, 38, 68, P.bn3, 2, 22); px(g, 56, 68, P.bn0, 2, 22);
    px(g, 36, 76, P.bn1, 11, 4); px(g, 49, 76, P.bn1, 11, 4);
    px(g, 33, 88, P.bn2, 14, 6); px(g, 49, 88, P.bn2, 14, 6);
    px(g, 37, 62, P.bn2, 22, 8); px(g, 37, 67, P.bn1, 22, 3);
    px(g, 45, 34, P.bn1, 6, 28);
    for (let i = 0; i < 6; i++) px(g, 44, 36 + i * 5, P.bn0, 8, 2);
    for (let i = 0; i < 5; i++) {                                // 肋骨（細く）
      const y = 36 + i * 6, len = 14 - i * 2;
      px(g, 48 - len, y, P.bn2, len, 2); px(g, 48, y, P.bn2, len, 2);
      px(g, 47 - len, y + 1, P.bn2, 2, 4); px(g, 47 + len, y + 1, P.bn2, 2, 4);
      px(g, 48 - len, y, P.bn3, len, 1);
    }
    px(g, 28, 28, P.st1, 18, 11); px(g, 28, 28, P.st3, 18, 4);   // 肩当て
    px(g, 50, 28, P.st1, 18, 11); px(g, 50, 28, P.st3, 18, 4);
    px(g, 28, 37, P.st0, 18, 3); px(g, 50, 37, P.st0, 18, 3);
    px(g, 32, 31, P.gd2, 5, 5); px(g, 59, 31, P.gd2, 5, 5);
    px(g, 24, 39, P.bn2, 7, 26); px(g, 65, 39, P.bn2, 7, 26);
    px(g, 24, 39, P.bn3, 2, 26); px(g, 70, 39, P.bn0, 2, 26);
    px(g, 21, 62, P.bn2, 11, 8); px(g, 64, 62, P.bn2, 11, 8);
    disc(g, 48, 18, 16, P.bn2);                                  // 頭蓋
    disc(g, 43, 13, 10, P.bn3);
    disc(g, 41, 10, 4, P.bn4);
    px(g, 36, 15, P.out, 10, 10); px(g, 51, 15, P.out, 10, 10);
    px(g, 38, 17, P.re0, 7, 7); px(g, 53, 17, P.re0, 7, 7);
    px(g, 39, 19, P.re2, 5, 4); px(g, 54, 19, P.re2, 5, 4);
    px(g, 40, 20, P.re4, 2, 2); px(g, 55, 20, P.re4, 2, 2);
    px(g, 45, 26, P.out, 6, 4);
    px(g, 38, 30, P.bn1, 20, 5);
    for (let i = 0; i < 7; i++) px(g, 39 + i * 3, 30, P.bn4, 2, 5);
    px(g, 32, 7, P.bn0, 9, 3); px(g, 36, 3, P.bn0, 3, 7);
    px(g, 72, 0, P.sl1, 8, 58); px(g, 74, 2, P.sl3, 4, 54);      // 剣
    px(g, 75, 2, P.sl4, 2, 48);
    px(g, 74, 28, P.white, 3, 12);
    px(g, 64, 56, P.gd1, 24, 6); px(g, 64, 56, P.gd3, 24, 3);
    px(g, 72, 62, P.wd1, 8, 15); px(g, 74, 62, P.wd3, 3, 15);
    px(g, 71, 75, P.gd2, 10, 5);
    outline(c, P.out);
    return c;
  }

  function eMage() {
    const c = mk(96, 96), g = c.getContext('2d');
    // 裾が大きく広がる三角＋高い帽子。縦にも横にも「浮いた三角」
    tri3(g, 48, 40, 4, 94, 92, 94, P.pp2);
    tri3(g, 48, 40, 14, 94, 48, 94, P.pp3);
    tri3(g, 48, 40, 60, 94, 92, 94, P.pp1);
    px(g, 4, 88, P.pp1, 88, 7);
    for (let i = 0; i < 9; i++) {
      const x = 10 + i * 10;
      px(g, x, 62, P.pp1, 3, 32);
      px(g, x + 3, 66, P.pp3, 2, 28);
    }
    px(g, 30, 34, P.pp2, 36, 28);
    px(g, 30, 34, P.pp3, 36, 5);
    px(g, 58, 38, P.pp1, 8, 24);
    px(g, 44, 38, P.gd2, 6, 28);
    px(g, 44, 38, P.gd4, 2, 28);
    px(g, 38, 50, P.gd2, 18, 5); px(g, 38, 50, P.gd4, 18, 2);
    disc(g, 48, 26, 16, P.dark);
    disc(g, 48, 25, 12, '#07060c');
    px(g, 36, 24, P.gd2, 9, 6); px(g, 52, 24, P.gd2, 9, 6);
    px(g, 37, 25, P.gd4, 7, 4); px(g, 53, 25, P.gd4, 7, 4);
    px(g, 39, 26, P.white, 3, 2); px(g, 55, 26, P.white, 3, 2);
    px(g, 18, 12, P.pp1, 60, 8);                                 // つば（広い）
    px(g, 18, 12, P.pp3, 60, 3);
    px(g, 18, 18, P.pp0, 60, 2);
    tri(g, 43, -22, 16, 36, P.pp2);                              // 帽子（高い）
    tri(g, 39, -18, 9, 31, P.pp3);
    px(g, 31, -2, P.gd2, 9, 8); px(g, 31, -2, P.gd4, 5, 5);
    px(g, 20, 38, P.pp2, 13, 20); px(g, 64, 38, P.pp2, 13, 20);
    px(g, 20, 38, P.pp3, 5, 20); px(g, 72, 38, P.pp1, 5, 20);
    px(g, 17, 54, P.sk1, 13, 9); px(g, 66, 54, P.sk1, 13, 9);
    px(g, 74, 10, P.wd1, 7, 74); px(g, 76, 12, P.wd3, 3, 70);
    for (let i = 0; i < 5; i++) px(g, 73, 24 + i * 14, P.gd2, 9, 3);
    disc(g, 78, 6, 13, 'rgba(200,60,60,0.28)');
    disc(g, 78, 6, 10, P.re1);
    disc(g, 77, 5, 6, P.re3);
    disc(g, 76, 4, 3, P.gd3);
    disc(g, 76, 3, 1, P.white);
    outline(c, P.out);
    return c;
  }

  function eBoss() {
    const c = mk(96, 96), g = c.getContext('2d');
    // ── シルエット設計 ──
    // 胸を張って首をまっすぐ上へ伸ばし、翼を左右いっぱいに開く。
    // 前回は首のS字を強くしすぎて頭が右へ流れ、翼が胴の裏に隠れていた。
    // 首は「ほぼ垂直・わずかに反る」程度に留め、翼は胴より外から生やす。
    // 翼：付け根から1枚の大きな三角膜として張り、下端を指の間で波打たせる。
    // 三角を縦に積むと上辺が垂直に切れて「板」に見えるので1枚で通す。
    const WX = 33, WY = 48;                                      // 付け根
    const tipX = 3, tipY = 2;                                    // 先端（上外）
    const botX = 20, botY = 66;                                  // 下の角
    tri3(g, WX, WY, tipX, tipY, botX, botY, P.pp1);
    tri3(g, 96 - WX, WY, 96 - tipX, tipY, 96 - botX, botY, P.pp2);
    // 指の骨（付け根から膜の縁へ放射）と、その間の膜のたるみ
    for (let i = 0; i <= 3; i++) {
      const t = i / 3;
      const ex = Math.round(tipX + (botX - tipX) * t);
      const ey = Math.round(tipY + (botY - tipY) * t);
      for (let k = 0; k <= 28; k++) {
        const q = k / 28;
        px(g, Math.round(WX + (ex - WX) * q), Math.round(WY + (ey - WY) * q), P.pp3);
        px(g, Math.round(96 - WX + (96 - ex - (96 - WX)) * q), Math.round(WY + (ey - WY) * q), P.pp3);
      }
      // 膜の外縁を弧でつなぐ（指と指の間がたるむ）
      if (i < 3) {
        const t2 = (i + 1) / 3;
        const ex2 = Math.round(tipX + (botX - tipX) * t2);
        const ey2 = Math.round(tipY + (botY - tipY) * t2);
        for (let k = 0; k <= 14; k++) {
          const q = k / 14;
          const bx = ex + (ex2 - ex) * q + Math.sin(q * Math.PI) * 5;
          const by = ey + (ey2 - ey) * q + Math.sin(q * Math.PI) * 3;
          px(g, Math.round(bx), Math.round(by), P.pp0);
          px(g, 96 - Math.round(bx), Math.round(by), P.pp0);
        }
      }
    }
    // 翼の先端は鋭角なので、爪を置くと浮いて見える。膜だけで通す

    // 胴（縦長・胸を張る）
    ellipse(g, 48, 68, 18, 21, P.gn2);
    ellipse(g, 42, 61, 12, 14, P.gn3);
    ellipse(g, 40, 57, 6, 6, P.gn4);
    ellipse(g, 48, 81, 14, 10, P.gn1);
    for (let r = 0; r < 4; r++)
      for (let i = 0; i < 5; i++) {
        const x = 35 + i * 7 + (r % 2) * 3, y = 56 + r * 7;
        if ((x - 48) * (x - 48) / (16 * 16) + (y - 68) * (y - 68) / (19 * 19) > 1) continue;
        dome(g, x, y + 4, 3, 4, P.gn1);
        dome(g, x, y + 3, 3, 3, P.gn3);
      }
    for (let i = 0; i < 5; i++) {                                // 腹の甲板
      px(g, 38 + i * 5, 64 + (i % 2), P.gd2, 4, 17);
      px(g, 38 + i * 5, 64 + (i % 2), P.gd4, 4, 3);
      px(g, 38 + i * 5, 79 + (i % 2), P.gd0, 4, 2);
    }

    // 首：ほぼ垂直に34px。わずかに反らせるだけにして頭を中央に置く
    for (let i = 0; i < 34; i++) {
      const t = i / 33;
      const x = 48 + Math.round(Math.sin(t * 1.1) * 4);
      const w = 19 - Math.round(t * 8);
      px(g, x - (w >> 1), 56 - i, P.gn2, w, 1);
      px(g, x + (w >> 1) - 5, 56 - i, P.gn1, 5, 1);
      px(g, x - (w >> 1), 56 - i, P.gn3, 4, 1);
      if (i % 3 === 0) px(g, x - (w >> 1) + 2, 56 - i, P.gn4, 3, 1);
    }
    for (let i = 0; i < 10; i++) {                               // 背びれ
      const t = i / 9, x = 48 + Math.round(Math.sin(t * 1.1) * 4);
      tri(g, x + 8 - Math.round(t * 2), 52 - i * 4, 3, 6, P.bn2);
    }

    // 頭（中央上・やや前傾）
    disc(g, 48, 16, 14, P.gn2);
    disc(g, 43, 11, 8, P.gn3);
    disc(g, 41, 9, 4, P.gn4);
    ellipse(g, 50, 26, 15, 6, P.gn2);                            // 口吻
    ellipse(g, 50, 28, 14, 3, P.gn1);
    px(g, 44, 22, P.gn1, 3, 3); px(g, 55, 22, P.gn1, 3, 3);      // 鼻孔
    tri(g, 35, -4, 5, 18, P.bn3); tri(g, 61, -4, 5, 18, P.bn3);  // 角
    px(g, 34, 4, P.bn1, 3, 9); px(g, 60, 4, P.bn1, 3, 9);
    tri(g, 29, 7, 4, 12, P.bn2); tri(g, 67, 7, 4, 12, P.bn2);
    px(g, 38, 12, P.re0, 11, 8); px(g, 52, 12, P.re0, 11, 8);    // 目
    px(g, 39, 13, P.re2, 9, 6); px(g, 53, 13, P.re2, 9, 6);
    px(g, 41, 14, P.gd3, 4, 4); px(g, 55, 14, P.gd3, 4, 4);
    px(g, 42, 15, P.white, 2, 2); px(g, 56, 15, P.white, 2, 2);
    px(g, 36, 6, P.gn0, 13, 4); px(g, 51, 6, P.gn0, 13, 4);      // 眉
    px(g, 38, 31, P.out, 26, 4);                                 // 口
    for (let i = 0; i < 7; i++) px(g, 39 + i * 3.6, 28, P.bn4, 3, 5);
    px(g, 44, 35, P.re1, 12, 3);

    // 脚（胴の下から。左右に開かず体高を出す）
    px(g, 27, 72, P.gn2, 14, 22); px(g, 55, 72, P.gn2, 14, 22);
    px(g, 27, 72, P.gn1, 5, 22); px(g, 64, 72, P.gn1, 5, 22);
    px(g, 29, 66, P.gn3, 10, 8); px(g, 56, 66, P.gn3, 10, 8);
    for (let i = 0; i < 3; i++) {
      px(g, 25 + i * 6, 92, P.bn3, 5, 5); px(g, 53 + i * 6, 92, P.bn3, 5, 5);
      px(g, 25 + i * 6, 92, P.bn4, 5, 2); px(g, 53 + i * 6, 92, P.bn4, 5, 2);
    }
    // 尾（右後方へ長く伸ばす）
    for (let i = 0; i < 28; i++) {
      const w = Math.max(3, 15 - Math.round(i * 0.45));
      const y = 76 - Math.round(Math.sin(i * 0.15) * 8);
      px(g, 64 + i, y, P.gn2, 2, w);
      px(g, 64 + i, y, P.gn3, 2, 3);
      if (i % 4 === 0) px(g, 64 + i, y + w - 3, P.gn1, 2, 3);
    }
    tri(g, 93, 54, 5, 13, P.bn3);
    outline(c, P.out);
    return c;
  }

  /* ---- 灯台の魔物（うみへび・せきぞう） ---- */
  function eSerpent() {
    const c = mk(96, 96), g = c.getContext('2d');
    // 長い胴をS字にうねらせる。とぐろの重なりで「長さ」を見せる
    const seg = [];
    for (let i = 0; i < 46; i++) {
      const t = i / 45;
      const x = 48 + Math.round(Math.sin(t * 7.2) * (30 - t * 8));
      const y = 92 - Math.round(t * 62);
      seg.push([x, y, Math.round(15 - t * 7)]);
    }
    // 奥のとぐろ（暗く）
    for (let i = seg.length - 1; i >= 20; i--) {
      const [x, y, w] = seg[i];
      ellipse(g, x, y, w, Math.max(4, w - 3), P.gn1);
    }
    for (let i = 19; i >= 0; i--) {
      const [x, y, w] = seg[i];
      ellipse(g, x, y, w, Math.max(4, w - 3), P.gn2);
      ellipse(g, x - 2, y - 2, Math.max(3, w - 5), Math.max(3, w - 7), P.gn3);
    }
    // 腹の帯
    for (let i = 0; i < 44; i += 3) {
      const [x, y, w] = seg[i];
      px(g, x - (w >> 1), y + Math.max(2, w - 6), P.wt4, w, 2);
    }
    // 頭（先端）
    const hd = seg[seg.length - 1];
    const hx = hd[0], hy = hd[1];
    ellipse(g, hx, hy, 13, 10, P.gn2);
    ellipse(g, hx - 2, hy - 3, 9, 6, P.gn3);
    ellipse(g, hx + 6, hy + 2, 8, 5, P.gn2);            // 鼻先
    px(g, hx - 8, hy - 4, P.gd3, 6, 5); px(g, hx + 2, hy - 4, P.gd3, 6, 5);
    px(g, hx - 7, hy - 3, P.out, 2, 4); px(g, hx + 3, hy - 3, P.out, 2, 4);
    px(g, hx - 4, hy + 5, P.out, 12, 2);                // 口
    px(g, hx + 8, hy + 6, P.re2, 8, 2);                 // 舌
    px(g, hx + 14, hy + 5, P.re2, 4, 1); px(g, hx + 14, hy + 8, P.re2, 4, 1);
    // えら／ひれ
    for (let i = 0; i < 3; i++) {
      tri(g, hx - 12 + i * 3, hy - 16, 3, 8, P.wt3);
      tri(g, hx + 4 + i * 3, hy - 16, 3, 8, P.wt3);
    }
    outline(c, P.out);
    return c;
  }

  function eStatue() {
    const c = mk(96, 96), g = c.getContext('2d');
    // 石像。左右対称で角ばったシルエット＝生物と対比させる
    px(g, 26, 78, P.st0, 44, 14);                       // 台座
    px(g, 26, 78, P.st3, 44, 3);
    px(g, 30, 82, P.st1, 36, 8);
    px(g, 34, 40, P.st2, 28, 40);                       // 胴
    px(g, 34, 40, P.st3, 12, 40);
    px(g, 56, 40, P.st1, 6, 40);
    for (let i = 0; i < 4; i++) px(g, 34, 46 + i * 8, P.st1, 28, 2);   // 石の継ぎ目
    px(g, 20, 42, P.st2, 14, 30); px(g, 62, 42, P.st2, 14, 30);        // 腕
    px(g, 20, 42, P.st3, 5, 30); px(g, 71, 42, P.st0, 5, 30);
    px(g, 16, 66, P.st1, 18, 12); px(g, 62, 66, P.st1, 18, 12);        // こぶし
    px(g, 16, 66, P.st3, 18, 3); px(g, 62, 66, P.st3, 18, 3);
    px(g, 36, 8, P.st2, 24, 30);                        // 頭
    px(g, 36, 8, P.st3, 10, 30);
    px(g, 54, 8, P.st1, 6, 30);
    px(g, 32, 12, P.st1, 32, 6);                        // 兜のひさし
    px(g, 32, 12, P.st3, 32, 2);
    px(g, 39, 22, P.re1, 7, 6); px(g, 50, 22, P.re1, 7, 6);            // 目（赤く灯る）
    px(g, 40, 23, P.re3, 5, 4); px(g, 51, 23, P.re3, 5, 4);
    px(g, 41, 24, P.gd4, 2, 2); px(g, 52, 24, P.gd4, 2, 2);
    px(g, 42, 32, P.st0, 12, 3);                        // 口の線
    tri(g, 48, 0, 5, 10, P.st1);                        // 兜の角
    px(g, 46, 0, P.st3, 4, 6);
    // ひび割れ（古さ）
    px(g, 44, 44, P.st0, 2, 12); px(g, 45, 50, P.st0, 6, 2);
    px(g, 38, 60, P.st0, 2, 9); px(g, 58, 52, P.st0, 2, 10);
    outline(c, P.out);
    return c;
  }

  function eSpider() {
    const c = mk(96, 96), g = c.getContext('2d');
    // 8本脚を左右に張り出す。低く横に広いシルエット＝虫
    for (let i = 0; i < 4; i++) {
      const y0 = 44 + i * 6;
      const spread = 34 - Math.abs(i - 1.5) * 6;
      for (let k = 0; k <= 16; k++) {
        const q = k / 16;
        const bend = Math.sin(q * Math.PI) * 12;
        px(g, Math.round(38 - spread * q), Math.round(y0 - bend), P.pp1, 3, 3);
        px(g, Math.round(58 + spread * q), Math.round(y0 - bend), P.pp1, 3, 3);
      }
      px(g, Math.round(38 - spread), y0 - 2, P.out, 4, 6);
      px(g, Math.round(58 + spread), y0 - 2, P.out, 4, 6);
    }
    ellipse(g, 48, 62, 21, 18, P.pp2);               // 腹
    ellipse(g, 44, 57, 14, 12, P.pp3);
    // 毒々しい斑紋
    for (let i = 0; i < 3; i++) {
      dome(g, 48, 56 + i * 8, 9 - i * 2, 5, P.gd2);
      dome(g, 48, 55 + i * 8, 7 - i * 2, 4, P.gn4);
    }
    ellipse(g, 48, 38, 15, 12, P.pp2);               // 頭胸部
    ellipse(g, 45, 34, 10, 8, P.pp3);
    // 目（8つ）
    for (let i = 0; i < 4; i++) {
      px(g, 38 + i * 5, 32, P.re2, 4, 4);
      px(g, 39 + i * 5, 33, P.gd4, 2, 2);
    }
    px(g, 40, 39, P.re1, 3, 3); px(g, 53, 39, P.re1, 3, 3);
    // 牙
    px(g, 42, 46, P.bn3, 4, 8); px(g, 50, 46, P.bn3, 4, 8);
    px(g, 42, 52, P.gn4, 4, 4); px(g, 50, 52, P.gn4, 4, 4);
    px(g, 46, 45, P.out, 4, 5);
    outline(c, P.out);
    return c;
  }

  function eWolf() {
    const c = mk(96, 96), g = c.getContext('2d');
    // 四つ足・前傾。低く長いシルエットで「獣」だと分からせる
    px(g, 22, 62, P.st1, 10, 26); px(g, 62, 62, P.st1, 10, 26);   // 後脚
    px(g, 30, 66, P.st2, 9, 22); px(g, 54, 66, P.st2, 9, 22);     // 前脚
    for (let i = 0; i < 3; i++) {
      px(g, 20 + i * 4, 86, P.bn2, 3, 5); px(g, 60 + i * 4, 86, P.bn2, 3, 5);
      px(g, 29 + i * 3, 86, P.bn2, 3, 5); px(g, 53 + i * 3, 86, P.bn2, 3, 5);
    }
    ellipse(g, 47, 56, 27, 17, P.st1);                            // 胴（横長）
    ellipse(g, 40, 50, 19, 12, P.st2);
    ellipse(g, 36, 46, 10, 6, P.st3);
    ellipse(g, 47, 66, 22, 8, P.st0);
    for (let i = 0; i < 14; i++) px(g, 24 + i * 4, 40 + ((i * 5) % 9), P.st3, 3, 2);  // 毛
    // 尾（後ろへ跳ね上げる）
    for (let i = 0; i < 18; i++) {
      const w = Math.max(3, 11 - Math.round(i * 0.4));
      px(g, 72 + i, 50 - Math.round(Math.sin(i * 0.16) * 12), P.st1, 2, w);
      px(g, 72 + i, 50 - Math.round(Math.sin(i * 0.16) * 12), P.st2, 2, 3);
    }
    // 頭（前へ突き出す）
    ellipse(g, 26, 34, 15, 13, P.st1);
    ellipse(g, 22, 30, 10, 8, P.st2);
    ellipse(g, 14, 38, 11, 6, P.st1);                             // 鼻づら
    ellipse(g, 13, 40, 9, 3, P.st0);
    px(g, 6, 37, P.out, 5, 4);                                    // 鼻
    tri(g, 22, 14, 5, 12, P.st1); tri(g, 34, 14, 5, 12, P.st1);   // 耳
    tri(g, 22, 17, 3, 8, P.st0); tri(g, 34, 17, 3, 8, P.st0);
    px(g, 14, 31, P.gd3, 6, 5); px(g, 25, 31, P.gd3, 6, 5);       // 目
    px(g, 15, 32, P.out, 4, 4); px(g, 26, 32, P.out, 4, 4);
    px(g, 16, 33, P.gd4, 1, 1); px(g, 27, 33, P.gd4, 1, 1);
    px(g, 10, 44, P.out, 18, 4);                                  // 口
    for (let i = 0; i < 4; i++) px(g, 11 + i * 5, 43, P.bn4, 3, 5);
    outline(c, P.out);
    return c;
  }

  /* ---- ガレン（黒幕・人型のラスボス） ----
     まどうしと差別化する：あちらは顔が影で匿名的、こちらは素顔の老人。
     人間が黒幕であることを一目で伝える。浮遊する「二の輪」を目印にする。 */
  function eGalen() {
    const c = mk(96, 96), g = c.getContext('2d');
    // 足元に漂う闇
    for (let i = 0; i < 30; i++) {
      const a = i * 1.4, r = 20 + (i % 5) * 7;
      px(g, 48 + Math.round(Math.cos(a) * r), 88 + Math.round(Math.sin(a) * r * 0.22), P.pp0, 4, 2);
    }
    // ローブ（黒紫・裾が大きく広がる）
    tri3(g, 48, 34, 6, 92, 90, 92, P.pp0);
    tri3(g, 48, 34, 16, 92, 48, 92, P.pp1);
    tri3(g, 48, 34, 64, 92, 90, 92, '#1c1228');
    px(g, 6, 88, '#140d1e', 84, 5);
    for (let i = 0; i < 9; i++) {
      const x = 12 + i * 9;
      px(g, x, 58, '#140d1e', 3, 34);
      px(g, x + 3, 62, P.pp1, 2, 30);
    }
    // 胴と襟
    px(g, 32, 30, P.pp1, 32, 30);
    px(g, 32, 30, P.pp2, 32, 4);
    px(g, 56, 34, '#1c1228', 8, 26);
    tri3(g, 48, 20, 28, 40, 68, 40, P.pp2);        // 立て襟
    px(g, 44, 40, P.gd2, 8, 22);                   // 前立ての金
    px(g, 44, 40, P.gd4, 3, 22);
    // 素顔（老人）
    disc(g, 48, 20, 12, P.sk1);
    disc(g, 46, 17, 8, P.sk2);
    px(g, 40, 17, P.out, 5, 4); px(g, 51, 17, P.out, 5, 4);        // 目
    px(g, 41, 18, P.gd3, 3, 2); px(g, 52, 18, P.gd3, 3, 2);
    px(g, 38, 13, P.bn2, 8, 3); px(g, 50, 13, P.bn2, 8, 3);        // 白い眉
    px(g, 44, 22, P.sk0, 4, 3);                                     // 鼻
    px(g, 42, 27, P.out, 12, 2);                                    // 口（への字）
    px(g, 40, 26, P.out, 3, 1); px(g, 53, 26, P.out, 3, 1);
    px(g, 36, 28, P.bn3, 24, 10);                                   // 白い顎髭
    px(g, 40, 36, P.bn3, 16, 6);
    px(g, 36, 28, P.bn4, 12, 3);
    px(g, 34, 6, P.bn2, 28, 8);                                     // 白髪
    px(g, 34, 6, P.bn3, 20, 4);
    px(g, 32, 10, P.bn2, 5, 14); px(g, 59, 10, P.bn2, 5, 14);
    // 腕を左右に広げる（掌を上に向けた「掲げる」姿勢）
    px(g, 16, 40, P.pp1, 18, 10); px(g, 62, 40, P.pp1, 18, 10);
    px(g, 16, 40, P.pp2, 18, 3); px(g, 62, 40, P.pp2, 18, 3);
    px(g, 10, 44, P.sk1, 10, 8); px(g, 76, 44, P.sk1, 10, 8);
    px(g, 10, 44, P.sk2, 10, 3); px(g, 76, 44, P.sk2, 10, 3);
    // 二の輪（掌の上に浮く黒い環）
    for (const cx of [15, 81]) {
      for (let a = 0; a < 360; a += 6) {
        const r = a * Math.PI / 180;
        px(g, cx + Math.round(Math.cos(r) * 9), 32 + Math.round(Math.sin(r) * 4), P.out, 2, 2);
      }
      for (let a = 0; a < 360; a += 12) {
        const r = a * Math.PI / 180;
        px(g, cx + Math.round(Math.cos(r) * 9), 32 + Math.round(Math.sin(r) * 4), P.pp4);
      }
      disc(g, cx, 32, 3, 'rgba(160,90,220,0.5)');
    }
    // 背後に立ちのぼる闇
    for (let i = 0; i < 16; i++) {
      const t = i / 15;
      px(g, 48 + Math.round(Math.sin(t * 9) * 22), 4 + Math.round(t * 26), 'rgba(70,30,110,0.55)', 5, 4);
    }
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
      fireplace: tFireplace(), forge: tForge(), bookwall: tBookwall(), altar: tAltar(),
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
      serpent: eSerpent(), statue: eStatue(), galen: eGalen(), spider: eSpider(), wolf: eWolf(),
    };
  };
})();
