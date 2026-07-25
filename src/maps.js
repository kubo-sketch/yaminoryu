/* =====================================================================
   maps.js — マップ定義
   ---------------------------------------------------------------------
   タイルは1文字1マス。文字列を直書きすると行の長さがズレて必ずバグるので、
   Grid で組み立てる（幅が構造的に保証される）。
     .  草      2 草(濃)   ,  道      *  花
     ~  水      B  橋      T  木      ^  山
     #  石壁    R  屋根    r  屋根(上) D  扉
     =  床      C  カウンター         H  玉座
     %  洞窟壁  -  洞窟床  3  洞窟床(暗)
     <  のぼり階段  >  くだり階段     O  洞窟の入口
     S  看板    $  宝箱    V  村の入口
   ===================================================================== */
(function () {
  'use strict';
  const G = (window.G = window.G || {});

  /* ---------------- タイル属性 ---------------- */
  //  walk: 通行可 / enc: エンカウント判定を行う / tile: 描画するタイル名
  G.TILEDEF = {
    '.': { tile: 'grass', walk: 1, enc: 1 },
    '2': { tile: 'grass2', walk: 1, enc: 1 },
    ',': { tile: 'road', walk: 1, enc: 1 },
    '*': { tile: 'flower', walk: 1, enc: 1 },
    '~': { tile: 'water', walk: 0, anim: 1 },
    'B': { tile: 'bridge', walk: 1, enc: 1 },
    'T': { tile: 'tree', walk: 0 },
    '^': { tile: 'mtn', walk: 0 },
    '#': { tile: 'brick', walk: 0 },
    'R': { tile: 'roof', walk: 0 },
    'r': { tile: 'roofTop', walk: 0 },
    'D': { tile: 'door', walk: 1 },
    '=': { tile: 'floor', walk: 1 },
    'C': { tile: 'counter', walk: 0 },
    'H': { tile: 'throne', walk: 1 },
    '%': { tile: 'cwall', walk: 0 },
    '-': { tile: 'cfloor', walk: 1, enc: 1 },
    '3': { tile: 'cfloor2', walk: 1, enc: 1 },
    '<': { tile: 'up', walk: 1 },
    '>': { tile: 'down', walk: 1 },
    'O': { tile: 'centr', walk: 1 },
    'S': { tile: 'sign', walk: 0 },
    '$': { tile: 'chest', walk: 0 },
    'V': { tile: 'door', walk: 1 },
  };

  /* ---------------- Grid ヘルパ ---------------- */
  function Grid(w, h, fill) {
    this.w = w; this.h = h;
    this.d = [];
    for (let y = 0; y < h; y++) {
      const row = [];
      for (let x = 0; x < w; x++) row.push(fill);
      this.d.push(row);
    }
  }
  Grid.prototype.set = function (x, y, ch) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y][x] = ch;
    return this;
  };
  Grid.prototype.rect = function (x, y, w, h, ch) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, ch);
    return this;
  };
  // 外周だけ塗る
  Grid.prototype.frame = function (x, y, w, h, ch) {
    for (let i = 0; i < w; i++) { this.set(x + i, y, ch); this.set(x + i, y + h - 1, ch); }
    for (let j = 0; j < h; j++) { this.set(x, y + j, ch); this.set(x + w - 1, y + j, ch); }
    return this;
  };
  Grid.prototype.hline = function (x1, x2, y, ch) {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) this.set(x, y, ch);
    return this;
  };
  Grid.prototype.vline = function (x, y1, y2, ch) {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) this.set(x, y, ch);
    return this;
  };
  // 太さのある通路（洞窟用）
  Grid.prototype.corridor = function (x1, y1, x2, y2, ch, thick) {
    const t = thick || 1;
    for (let k = 0; k < t; k++) {
      if (y1 === y2) this.hline(x1, x2, y1 + k, ch);
      else this.vline(x1 + k, y1, y2, ch);
    }
    return this;
  };
  Grid.prototype.scatter = function (list, ch) {
    for (let i = 0; i < list.length; i += 2) this.set(list[i], list[i + 1], ch);
    return this;
  };
  Grid.prototype.rows = function () {
    return this.d.map(function (r) { return r.join(''); });
  };

  /* =====================================================================
     はじまりの村（24 x 18）
     ---------------------------------------------------------------------
        どうぐや        やどや
        ┌────┐  │  ┌───┐
        │    │  │  │   │
        └─D──┘  │  └─D─┘
      ────────  大通り  ────────  ← 横の道(y=8)
        ┌─D──┐  │  ┌─D─┐
        │    │  │  │ 王 │      村長の家
        └────┘  │  └───┘
                  ↓ 南の出口
     ===================================================================== */
  function buildTown() {
    const g = new Grid(24, 18, '.');
    g.frame(0, 0, 24, 18, 'T');                    // 外周は森で囲う
    g.rect(9, 1, 6, 16, ',');                      // 縦の大通り
    g.hline(1, 22, 8, ',');                        // 横の道
    g.scatter([1, 1, 2, 1, 1, 2, 21, 1, 22, 1, 22, 2, 1, 15, 2, 16, 21, 15, 22, 16, 2, 6, 21, 6], '*');

    // どうぐや（左上）
    g.rect(3, 2, 6, 5, '#'); g.rect(4, 3, 4, 3, '='); g.set(6, 6, 'D');
    g.set(4, 4, 'C'); g.set(5, 4, 'C');
    // やどや（右上）
    g.rect(15, 2, 5, 5, '#'); g.rect(16, 3, 3, 3, '='); g.set(17, 6, 'D');
    g.set(16, 4, 'C');
    // ぶきや（左下）
    g.rect(3, 10, 6, 5, '#'); g.rect(4, 11, 4, 3, '='); g.set(6, 10, 'D');
    g.set(4, 12, 'C'); g.set(5, 12, 'C');
    // 村長の家（右下）
    g.rect(15, 10, 5, 5, '#'); g.rect(16, 11, 3, 3, '='); g.set(17, 10, 'D');
    g.set(17, 12, 'H');

    g.set(11, 17, ','); g.set(12, 17, ',');        // 南の出口
    g.set(8, 9, 'S');                              // 看板

    return {
      id: 'town', name: 'はじまりの村', rows: g.rows(),
      enc: null, indoor: false,
      npcs: [
        { x: 6, y: 4, spr: 'shop', dir: 0, act: { type: 'shop', shop: 'tool' } },
        { x: 17, y: 4, spr: 'inn', dir: 0, act: { type: 'inn' } },
        { x: 6, y: 12, spr: 'smith', dir: 0, act: { type: 'shop', shop: 'weapon' } },
        { x: 17, y: 12, spr: 'elder', dir: 0, act: { type: 'elder' } },
        {
          x: 11, y: 5, spr: 'villager', dir: 0, wander: 1,
          talk: ['この村は ずっと へいわだった。', 'きたの ほらあなから\nまものが あふれだすまでは……'],
        },
        {
          x: 20, y: 12, spr: 'girl', dir: 0,
          talk: ['おにいちゃん たたかえるの？', 'むらの そとは まものが いるから\nきをつけてね。'],
        },
        {
          x: 12, y: 15, spr: 'soldier', dir: 0,
          talk: function () {
            return G.flags.toldByElder
              ? ['ほらあなの ふういんは とけたか。', 'ぶきと やくそうを ととのえてから\nいくのだぞ。']
              : ['むらの そとへ でるなら\nまず そんちょうに あいさつを。', 'そんちょうは みなみひがしの\nいえに おられる。'];
          },
        },
        {
          x: 4, y: 9, spr: 'sage', dir: 0,
          talk: ['まものと たたかえば ちからが つく。', 'にげるのも せんじゅつだ。\nHPが へったら やどで やすむのだ。'],
        },
        {
          x: 20, y: 4, spr: 'villager', dir: 0,
          talk: ['やどやは HPも MPも\nぜんぶ なおしてくれる。', '6ゴールドは やすいもんだ。'],
        },
      ],
      events: [
        { x: 11, y: 17, type: 'warp', to: 'field', tx: 20, ty: 27, dir: 0 },
        { x: 12, y: 17, type: 'warp', to: 'field', tx: 20, ty: 27, dir: 0 },
        { x: 8, y: 9, type: 'sign', text: '「はじまりの村」\n　きた ほらあな\n　みなみ ぼうけんの はじまり' },
      ],
    };
  }

  /* =====================================================================
     フィールド（40 x 30）
     ===================================================================== */
  function buildField() {
    const g = new Grid(40, 30, '.');
    g.frame(0, 0, 40, 30, '^');
    g.rect(0, 0, 40, 2, '^');                      // 北は山脈
    g.rect(0, 28, 40, 2, '^');

    // 縦の街道
    g.vline(20, 2, 27, ',');

    // 川（東西に横断）＋橋
    g.hline(1, 38, 15, '~');
    g.hline(1, 38, 16, '~');
    g.set(20, 15, 'B'); g.set(20, 16, 'B');

    // 森（塊で置く）
    const woods = [
      [4, 4, 5, 3], [30, 3, 6, 4], [2, 9, 4, 4], [33, 9, 5, 4],
      [6, 19, 5, 3], [28, 19, 6, 4], [3, 24, 5, 3], [31, 24, 6, 3],
      [13, 6, 3, 2], [24, 6, 3, 2], [13, 21, 3, 2], [24, 21, 3, 2],
    ];
    woods.forEach(function (w) { g.rect(w[0], w[1], w[2], w[3], 'T'); });

    // 山（島状に置いて道を狭める）
    const mtns = [[9, 5, 3, 2], [27, 11, 3, 2], [10, 12, 3, 2], [16, 3, 2, 2], [22, 3, 2, 2]];
    mtns.forEach(function (m) { g.rect(m[0], m[1], m[2], m[3], '^'); });

    // 草の濃淡でメリハリ
    for (let i = 0; i < 90; i++) {
      const x = 1 + ((i * 7 + 3) % 38), y = 3 + ((i * 11 + 5) % 25);
      if (g.d[y][x] === '.') g.set(x, y, '2');
    }
    g.scatter([6, 8, 7, 8, 34, 7, 35, 7, 5, 22, 33, 22, 12, 26, 27, 26], '*');

    // 街道を復元（森や山で潰れないように最後に引き直す）
    g.vline(20, 2, 27, ',');
    g.set(20, 15, 'B'); g.set(20, 16, 'B');
    g.hline(14, 26, 20, ',');                      // 東西の脇道

    // 洞窟の入口（北の山肌）
    g.rect(18, 1, 5, 2, '^');
    g.set(20, 2, 'O');
    // 村の入口。屋根は街道の左右に置き、街道そのものは必ず残す
    // （屋根で (20,26) を潰すと町から出た瞬間に詰むので、最後に街道を引き直す）
    g.rect(18, 26, 2, 2, 'R'); g.rect(18, 26, 2, 1, 'r');
    g.rect(21, 26, 2, 2, 'R'); g.rect(21, 26, 2, 1, 'r');
    g.set(20, 26, ','); g.set(20, 27, 'V');
    g.set(19, 25, 'S');
    g.set(21, 5, 'S');
    g.set(8, 8, '$');
    g.set(34, 21, '$');

    return {
      id: 'field', name: 'フィールド', rows: g.rows(),
      // 川より北は敵が強い
      enc: function (x, y) { return y < 15 ? G.ENC.field_far : G.ENC.field_near; },
      indoor: false,
      npcs: [],
      events: [
        { x: 20, y: 27, type: 'warp', to: 'town', tx: 11, ty: 16, dir: 3 },
        {
          x: 20, y: 2, type: 'warp', to: 'cave1', tx: 12, ty: 2, dir: 0,
          requires: 'toldByElder',
          deny: 'ほらあなの いりぐちは\nおおきな いわで ふさがれている。',
        },
        { x: 19, y: 25, type: 'sign', text: 'みなみ →「はじまりの村」' },
        { x: 21, y: 5, type: 'sign', text: 'きた →「やみの ほらあな」\n　　もどれぬ者 おおし' },
        { x: 8, y: 8, type: 'chest', id: 'f1', item: 'yakusou', n: 2 },
        { x: 34, y: 21, type: 'chest', id: 'f2', gold: 60 },
      ],
    };
  }

  /* =====================================================================
     やみのほらあな 1F（26 x 20）
     ===================================================================== */
  function buildCave1() {
    const g = new Grid(26, 20, '%');
    g.corridor(11, 1, 11, 5, '-', 3);              // 入口から南へ
    g.corridor(4, 5, 21, 5, '-', 2);               // 東西の大通路
    g.corridor(4, 5, 4, 16, '-', 2);               // 西の縦通路
    g.corridor(20, 5, 20, 11, '-', 2);             // 東の縦通路
    g.corridor(14, 10, 21, 10, '-', 2);            // 東の枝
    g.corridor(14, 10, 14, 16, '-', 2);            // 中央の縦通路
    g.corridor(4, 16, 15, 16, '-', 2);             // 南の通路
    g.corridor(5, 12, 11, 12, '-', 1);             // 宝箱への行き止まり（西の縦通路 x=5 から掘る）
    g.set(12, 1, '<');                             // 外へ
    g.set(7, 17, '>');                             // 2Fへ
    g.set(11, 12, '$');

    // 床の暗い差し色（見た目のメリハリ）
    for (let i = 0; i < 60; i++) {
      const x = 1 + ((i * 5 + 2) % 24), y = 1 + ((i * 9 + 4) % 18);
      if (g.d[y][x] === '-') g.set(x, y, '3');
    }
    g.set(12, 1, '<'); g.set(7, 17, '>'); g.set(11, 12, '$');

    return {
      id: 'cave1', name: 'やみのほらあな １かい', rows: g.rows(),
      enc: G.ENC.cave1, indoor: true, dark: 1,
      npcs: [],
      events: [
        { x: 12, y: 1, type: 'warp', to: 'field', tx: 20, ty: 3, dir: 0 },
        { x: 7, y: 17, type: 'warp', to: 'cave2', tx: 3, ty: 13, dir: 0 },
        { x: 11, y: 12, type: 'chest', id: 'c1', weapon: 3 },
      ],
    };
  }

  /* =====================================================================
     やみのほらあな 2F（20 x 16）— 最深部にボス
     ===================================================================== */
  function buildCave2() {
    const g = new Grid(20, 16, '%');
    g.corridor(3, 8, 3, 13, '-', 2);               // 階段から北へ
    g.corridor(3, 8, 10, 8, '-', 2);               // 東へ
    g.corridor(10, 5, 10, 8, '-', 2);              // 広間へ上がる
    g.rect(5, 1, 10, 5, '-');                      // ボスの広間
    g.frame(4, 0, 12, 7, '%');
    g.rect(9, 5, 2, 2, '-');                       // 広間の入口
    g.corridor(12, 10, 16, 10, '-', 2);            // 東の隠し通路
    g.corridor(12, 8, 12, 11, '-', 2);
    g.set(16, 11, '$');
    g.set(3, 13, '<');                             // 1Fへ

    for (let i = 0; i < 40; i++) {
      const x = 1 + ((i * 7 + 1) % 18), y = 1 + ((i * 5 + 2) % 14);
      if (g.d[y][x] === '-') g.set(x, y, '3');
    }
    g.set(3, 13, '<'); g.set(16, 11, '$');

    return {
      id: 'cave2', name: 'やみのほらあな さいしんぶ', rows: g.rows(),
      enc: G.ENC.cave2, indoor: true, dark: 1,
      npcs: [],
      events: [
        { x: 3, y: 13, type: 'warp', to: 'cave1', tx: 7, ty: 16, dir: 0 },
        { x: 16, y: 11, type: 'chest', id: 'c2', armor: 3 },
        // 広間の入口を踏むとボス戦
        { x: 9, y: 5, type: 'boss', id: 'boss', enemy: 'boss' },
        { x: 10, y: 5, type: 'boss', id: 'boss', enemy: 'boss' },
      ],
    };
  }

  G.buildMaps = function () {
    G.MAPS = {
      town: buildTown(),
      field: buildField(),
      cave1: buildCave1(),
      cave2: buildCave2(),
    };
    // 幅の検証（構造上ズレないはずだが、編集ミスを早期に出す）
    Object.keys(G.MAPS).forEach(function (k) {
      const m = G.MAPS[k], w = m.rows[0].length;
      m.w = w; m.h = m.rows.length;
      m.rows.forEach(function (r, i) {
        if (r.length !== w) console.warn('[map] 幅不一致 ' + k + ' 行' + i + ': ' + r.length + ' != ' + w);
      });
    });
  };
})();
