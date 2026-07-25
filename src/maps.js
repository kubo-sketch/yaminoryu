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

  /* ---------------- タイル属性 ----------------
     walk : 通行可 / enc: エンカウント判定を行う / tile: 描画するタイル名
     auto : オートタイルのグループ名。隣接する同グループを見て縁を描き分ける
     group: 自分はオートタイルではないが、この auto グループの一員として
            扱ってほしいとき（例：階段は床の一部なので壁との境界を持たない） */
  G.TILEDEF = {
    '.': { tile: 'grass', walk: 1, enc: 1 },
    '2': { tile: 'grass', walk: 1, enc: 1 },
    ',': { tile: 'road', walk: 1, enc: 1, auto: 'road' },
    '*': { tile: 'flower', walk: 1, enc: 1 },
    '~': { tile: 'water', walk: 0, anim: 1, auto: 'water' },
    'B': { tile: 'bridge', walk: 1, enc: 1 },
    'T': { tile: 'tree', walk: 0, over: 8 },
    '^': { tile: 'mtn', walk: 0, auto: 'mtn' },
    '#': { tile: 'brick', walk: 0, auto: 'brick' },
    'R': { tile: 'roof', walk: 0, over: 16 },
    'r': { tile: 'roofTop', walk: 0, over: 16 },
    'D': { tile: 'door', walk: 1, group: 'brick' },
    '=': { tile: 'floor', walk: 1, auto: 'floor' },
    'C': { tile: 'counter', walk: 0, group: 'floor' },
    'H': { tile: 'throne', walk: 1, group: 'floor' },
    'c': { tile: 'carpet', walk: 1, group: 'floor' },
    'b': { tile: 'barrel', walk: 0, group: 'floor' },
    'p': { tile: 'pot', walk: 0, group: 'floor' },
    't': { tile: 'torch', walk: 0, group: 'floor' },
    'f': { tile: 'fence', walk: 0 },
    'w': { tile: 'well', walk: 0 },
    'e': { tile: 'bed', walk: 0, group: 'floor' },
    'a': { tile: 'table', walk: 0, group: 'floor' },
    'h': { tile: 'shelf', walk: 0, group: 'floor' },
    'k': { tile: 'crate', walk: 0, group: 'floor' },
    'F': { tile: 'fountain', walk: 0, group: 'stone' },
    'n': { tile: 'bench', walk: 0 },
    'y': { tile: 'cart', walk: 0 },
    'l': { tile: 'flowerbed', walk: 0 },
    'x': { tile: 'grave', walk: 0 },
    'o': { tile: 'stone', walk: 1, auto: 'stone' },
    'i': { tile: 'stalag', walk: 0 },
    'u': { tile: 'puddle', walk: 1, enc: 1, group: 'cfloor' },
    'j': { tile: 'bones', walk: 1, enc: 1, group: 'cfloor' },
    '%': { tile: 'cwall', walk: 0, auto: 'cwall' },
    '-': { tile: 'cfloor', walk: 1, enc: 1, auto: 'cfloor' },
    '3': { tile: 'cfloor', walk: 1, enc: 1, auto: 'cfloor' },
    '<': { tile: 'up', walk: 1, group: 'cfloor' },
    '>': { tile: 'down', walk: 1, group: 'cfloor' },
    'O': { tile: 'centr', walk: 1, group: 'mtn' },
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
  // 楕円状のかたまりを置く。縁をランダムに欠けさせて四角さを消す
  Grid.prototype.blob = function (cx, cy, rx, ry, ch, seed) {
    let st = seed | 0;
    const rnd = function () { st = (st * 1103515245 + 12345) & 0x7fffffff; return st / 0x7fffffff; };
    for (let y = -ry; y <= ry; y++)
      for (let x = -rx; x <= rx; x++)
        if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1 - rnd() * 0.4) this.set(cx + x, cy + y, ch);
    return this;
  };
  Grid.prototype.rows = function () {
    return this.d.map(function (r) { return r.join(''); });
  };

  /* =====================================================================
     はじまりの村（32 x 26）
     ---------------------------------------------------------------------
     配置の鉄則が2つある。どちらも実際に破って詰まりを出した。
     1. 建物は「道」を絶対に踏まない。大通りの上に家を置くと、その先
        （＝南の出口）へ行けなくなる
     2. 部屋は内寸6x5以上、店主は扉から遠い側の壁際、家具は隅。
        3x3の部屋の中央に人を置くと回り込めず部屋が分断される

        どうぐや              やどや
        ┌──────┐ ║ ┌──────┐
        │ C 店 C     │ ║ │ C 宿 C     │
        └───D──┘ ║ └───D──┘
        ═══════ 石畳の広場（噴水） ═══════
        ┌───D──┐ ║ ┌───D──┐
        │            │ ║ │   玉座      │
        └──────┘ ║ └──────┘
                     ↓ 南の出口
     ===================================================================== */
  function buildTown() {
    const g = new Grid(32, 26, '.');
    g.frame(0, 0, 32, 26, 'T');
    g.rect(15, 1, 2, 24, ',');                     // 縦の大通り（x=15,16）
    g.rect(1, 12, 30, 2, ',');                     // 横の道（y=12,13）
    g.rect(11, 9, 10, 8, 'o');                     // 石畳の広場（道の交差点を覆う）

    // 建物は大通り(x=15,16)と横道(y=12,13)を避けて置く。
    // 内寸は 5x4。前は 6x5 で、家具を置いても中央がガランとしていた。
    function house(x, y, doorDx, doorTop) {
      g.rect(x, y, 7, 6, '#');
      g.rect(x + 1, y + 1, 5, 4, '=');
      g.set(x + doorDx, doorTop ? y : y + 5, 'D');
    }
    house(4, 3, 3, false);      // どうぐや    内寸 x=5..9,  y=4..7   扉(7,8)
    house(21, 3, 3, false);     // やどや      内寸 x=22..26,y=4..7   扉(24,8)
    house(4, 17, 3, true);      // ぶきや      内寸 x=5..9,  y=18..21 扉(7,17)
    house(21, 17, 3, true);     // 村長の家    内寸 x=22..26,y=18..21 扉(24,17)

    // 店主は扉から遠い側の壁際、カウンターはその「片側」だけに置く。
    // 左右を両方カウンターにすると、その行が塞がって奥へ回り込めなくなる。
    g.set(6, 4, 'C');                              // どうぐや（店主 7,4）
    g.set(23, 4, 'C');                             // やどや  （宿主 24,4）
    g.set(6, 21, 'C');                             // ぶきや  （鍛冶 7,21）
    g.set(24, 19, 'H');                            // 村長の玉座

    // 家具は壁際へ。店主の行(y=4/21)には置かず、回り込む道を残す
    g.set(6, 5, 'h'); g.set(9, 5, 'k'); g.set(9, 7, 'p'); g.set(5, 7, 'b');    // どうぐや
    g.set(23, 5, 'e'); g.set(26, 5, 'e'); g.set(22, 7, 'a'); g.set(26, 7, 'h'); // やどや
    g.set(5, 19, 'b'); g.set(9, 19, 'k'); g.set(9, 21, 'p'); g.set(5, 21, 'k'); // ぶきや
    g.set(22, 18, 't'); g.set(26, 18, 't'); g.set(22, 21, 'h');                 // 村長の家
    g.set(23, 21, 'c'); g.set(24, 21, 'c'); g.set(25, 21, 'c');

    // 広場まわり
    g.set(12, 10, 'F');                            // 噴水
    g.set(19, 10, 'n'); g.set(12, 15, 'n'); g.set(19, 15, 'n');  // ベンチ
    g.set(9, 10, 'l'); g.set(22, 15, 'l');         // 花壇
    g.set(28, 10, 'y'); g.set(2, 15, 'y');         // 荷車
    g.set(29, 12, 'w');                            // 井戸
    g.set(13, 8, 'S');                             // 看板

    // 墓地（北西の隅）と木立
    g.set(1, 9, 'x'); g.set(1, 10, 'x'); g.set(2, 10, 'x');
    g.set(11, 2, 'T'); g.set(12, 5, 'T'); g.set(19, 3, 'T'); g.set(18, 6, 'T');
    g.set(11, 20, 'T'); g.set(19, 21, 'T'); g.set(29, 20, 'T'); g.set(2, 20, 'T');
    g.scatter([1, 1, 2, 1, 1, 2, 29, 1, 30, 1, 30, 2,
               1, 23, 2, 24, 29, 23, 30, 24, 12, 3, 18, 4, 12, 21, 18, 20], '*');
    g.set(11, 24, 'f'); g.set(12, 24, 'f'); g.set(13, 24, 'f');
    g.set(18, 24, 'f'); g.set(19, 24, 'f'); g.set(20, 24, 'f');

    g.set(15, 25, ','); g.set(16, 25, ',');        // 南の出口

    return {
      id: 'town', name: 'はじまりの村', rows: g.rows(),
      enc: null, indoor: false,
      npcs: [
        { x: 7, y: 4, spr: 'shop', dir: 0, act: { type: 'shop', shop: 'tool' } },
        { x: 24, y: 4, spr: 'inn', dir: 0, act: { type: 'inn' } },
        { x: 7, y: 21, spr: 'smith', dir: 3, act: { type: 'shop', shop: 'weapon' } },
        { x: 24, y: 19, spr: 'elder', dir: 0, act: { type: 'elder' } },
        {
          x: 2, y: 11, spr: 'priest', dir: 0,
          talk: ['ここに ねむるのは\nほらあなへ むかった わかものたち。',
                 'まものには それぞれ にがてな\nこうげきが ある。ほのお こおり\nいかずち……みきわめるのだ。'],
        },
        {
          x: 13, y: 11, spr: 'girl', dir: 0,
          talk: ['ふんすいの みずは つめたくて\nきもちいいの！', 'おにいちゃん\nむりしちゃ だめだよ。'],
        },
        {
          x: 18, y: 14, spr: 'sage', dir: 0,
          talk: ['てきが つよいと おもったら\n「ぼうぎょ」だ。うけるダメージが\nはんぶんに なる。',
                 'MPも すこし もどる。\nじゅもんの ためが きくのだ。'],
        },
        {
          x: 17, y: 23, spr: 'soldier', dir: 0,
          talk: function () {
            return G.flags.toldByElder
              ? ['ほらあなの ふういんは とけたか。',
                 'おくの かいだんは おおきな\nがいこつが まもっている。\nゆだんするな。']
              : ['むらの そとへ でるなら\nまず そんちょうに あいさつを。',
                 'そんちょうは みなみひがしの\nいえに おられる。'];
          },
        },
        {
          x: 28, y: 8, spr: 'villager', dir: 0,
          talk: ['やどやは HPも MPも\nぜんぶ なおしてくれる。', '6ゴールドは やすいもんだ。'],
        },
        {
          x: 10, y: 13, spr: 'villager', dir: 0,
          talk: ['スライムは こおりに よわい。\nがいこつは ほのおに よわい。',
                 'まどうしは いかずちだ。\nおぼえておいて そんは ない。'],
        },
        {
          x: 22, y: 12, spr: 'girl', dir: 0,
          talk: ['まものが 2ひき 3びきと\nいちどに おそってくるって……',
                 'ぜんたいこうげきの じゅもんが\nあれば いいのにね。'],
        },
        {
          x: 8, y: 15, spr: 'villager', dir: 3,
          talk: function () {
            if (G.flags.q.missing >= 3)
              return ['あんたが つれて かえってくれた\nかたみを、はかに おさめたよ。',
                      'あの子たちも これで\nやっと ねむれる。'];
            if (G.flags.q.missing >= 2)
              return ['それは……うちの子の ペンダント！', 'はやく はかもりの ところへ。\nきょうかいの にしの はかばに おる。'];
            if (G.flags.q.missing >= 1)
              return ['きたの ほらあなの どこかに\nあの子たちの あとが あるはずなんだ。'];
            return ['きたの ほらあなで\nむらの わかものが\n3にんも かえってこない……'];
          },
        },
        {
          // 墓守。行方不明の若者たちの依頼人
          x: 3, y: 11, spr: 'sage', dir: 0,
          talk: function () {
            const q = G.flags.q;
            if (q.missing >= 3) {
              // 灯台の手帳を読んでいれば、3人が実験台にされた事実を伝えられる
              if (G.flags.read.g4)
                return ['……とうだいで なにを みた。',
                        'あの子らを ほらあなへ むかわせたのは\nガレンだと いうのか。',
                        '「ちょうど よい ためしに なる」……\nあの子らは ためされたのか。',
                        'ゆるさぬ。\nあの おとこを さがしてくれ。'];
              return ['よく もどってきた。',
                      'あの3人は ほらあなの ぬしを\nしらべに いって かえらなかった。',
                      'おまえは かならず かえってこい。'];
            }
            if (q.missing >= 2) {
              q.missing = 3;
              const p2 = G.player;
              p2.gold += 150;
              p2.items.yakusou = (p2.items.yakusou || 0) + 3;
              G.audio.se('levelup');
              return ['……ペンダントか。\nやはり あの子たちは……',
                      'ありがとう。これで はかに\nおさめて やれる。',
                      'これは わしからの れいだ。\n150ゴールドと やくそう3こを\nうけとってくれ。',
                      'ほらあなの ぬしは\nもとは この ちを まもる りゅうだった。',
                      'それが なぜ やみに おちたのか……\nおくの にっきに かかれているやも しれん。'];
            }
            if (q.missing >= 1)
              return ['ほらあなの どこかに\nあの子たちの あとが あるはずだ。',
                      'みつけたら もってきておくれ。'];
            q.missing = 1;
            return ['わしは この はかばの もりだ。',
                    'はんとしまえ、むらの わかもの3人が\nきたの ほらあなへ むかった。',
                    'ぬしの しょうたいを\nつきとめると いってな。\nそれきり もどらぬ。',
                    'もし ほらあなで あの子たちの\nかたみを みつけたら\nもってきては くれぬか。',
                    '（クエスト「かえらぬ3人」を うけた）'];
          },
        },
      ],
      events: [
        { x: 15, y: 25, type: 'warp', to: 'field', tx: 20, ty: 27, dir: 0 },
        { x: 16, y: 25, type: 'warp', to: 'field', tx: 20, ty: 27, dir: 0 },
        { x: 13, y: 8, type: 'sign', text: '「はじまりの村」\n　きた ほらあな\n　みなみ ぼうけんの はじまり' },
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

    // 川（東西に横断）。直線だと運河に見えるので緩やかに蛇行させる。
    // 急に曲げると1マスずつ段差がついて「水たまりの列」になるので振幅は小さく。
    const river = {};
    for (let x = 1; x < 39; x++) {
      const y = 15 + Math.round(Math.sin(x * 0.16) * 1.3);
      for (let k = 0; k < 2; k++) { g.set(x, y + k, '~'); river[x + ',' + (y + k)] = 1; }
      if ((x * 5) % 9 < 2) { g.set(x, y + 2, '~'); river[x + ',' + (y + 2)] = 1; }
    }
    // 川のあいだに草が1マスだけ残ると、水に囲まれた到達不能マスになる。
    // 3方向以上が水なら埋める（2回まわして連鎖的な取り残しも潰す）
    for (let pass = 0; pass < 2; pass++)
      for (let x = 2; x < 38; x++)
        for (let y = 11; y < 21; y++) {
          if (g.d[y][x] === '~') continue;
          let n = 0;
          if (g.d[y - 1][x] === '~') n++;
          if (g.d[y + 1][x] === '~') n++;
          if (g.d[y][x - 1] === '~') n++;
          if (g.d[y][x + 1] === '~') n++;
          if (n >= 3) { g.set(x, y, '~'); river[x + ',' + y] = 1; }
        }

    // 森（楕円のかたまり。矩形で置くと四角い森になる）
    [[6, 5, 4, 2, 3], [32, 5, 4, 3, 11], [4, 10, 3, 3, 23], [35, 11, 3, 3, 31],
     [8, 20, 4, 2, 41], [30, 21, 4, 3, 53], [5, 25, 3, 2, 61], [33, 25, 3, 2, 71],
     [14, 7, 2, 2, 83], [25, 7, 2, 2, 97], [14, 22, 2, 2, 101], [26, 22, 2, 2, 103],
    ].forEach(function (w) { g.blob(w[0], w[1], w[2], w[3], 'T', w[4]); });

    // 山（島状に置いて道を狭める）
    [[10, 6, 3, 2, 7], [28, 12, 3, 2, 17], [11, 12, 2, 2, 29], [16, 4, 2, 1, 37],
     [24, 4, 2, 1, 43]].forEach(function (m) { g.blob(m[0], m[1], m[2], m[3], '^', m[4]); });

    // 草の濃淡でメリハリ
    for (let i = 0; i < 90; i++) {
      const x = 1 + ((i * 7 + 3) % 38), y = 3 + ((i * 11 + 5) % 25);
      if (g.d[y][x] === '.') g.set(x, y, '2');
    }
    g.scatter([6, 8, 7, 8, 34, 7, 35, 7, 5, 22, 33, 22, 12, 26, 27, 26], '*');

    // 街道を復元（森や山で潰れないように最後に引き直す）
    g.vline(20, 2, 27, ',');
    // 街道が川と交わるところに橋を架ける。街道を引き直したあとに
    // タイルを見ても既に ',' で潰れているので、川の座標を控えておいて使う。
    for (let y = 2; y <= 27; y++) if (river['20,' + y]) g.set(20, y, 'B');
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
    g.set(34, 23, '$');
    // 東：みなとまちの入口（街道から脇道でつなぐ）
    g.hline(26, 35, 20, ',');
    // 北東の岬：ふるい とうだい
    g.hline(20, 36, 9, ',');
    g.vline(36, 6, 9, ',');
    g.rect(34, 4, 5, 3, '#');
    g.set(36, 6, 'D');
    g.set(33, 10, 'S');
    g.rect(33, 18, 5, 2, 'R'); g.rect(33, 18, 5, 1, 'r');
    g.set(35, 19, ','); g.set(35, 20, 'V');
    g.set(31, 21, 'S');

    return {
      id: 'field', name: 'フィールド', rows: g.rows(),
      // 川より北は敵が強い
      enc: function (x, y) { return y < 15 ? G.ENC.field_far : G.ENC.field_near; },
      indoor: false,
      npcs: [],
      events: [
        { x: 20, y: 27, type: 'warp', to: 'town', tx: 15, ty: 24, dir: 3 },
        {
          x: 20, y: 2, type: 'warp', to: 'cave1', tx: 12, ty: 2, dir: 0,
          requires: 'toldByElder',
          deny: 'ほらあなの いりぐちは\nおおきな いわで ふさがれている。',
        },
        { x: 19, y: 25, type: 'sign', text: 'みなみ →「はじまりの村」' },
        { x: 21, y: 5, type: 'sign', text: 'きた →「やみの ほらあな」\n　　もどれぬ者 おおし' },
        { x: 8, y: 8, type: 'chest', id: 'f1', item: 'yakusou', n: 2 },
        { x: 34, y: 23, type: 'chest', id: 'f2', gold: 60 },
        { x: 35, y: 20, type: 'warp', to: 'port', tx: 11, ty: 18, dir: 0 },
        { x: 36, y: 6, type: 'warp', to: 'tower1', tx: 8, ty: 14, dir: 3 },
        { x: 33, y: 10, type: 'sign', text: 'きたひがし →「ふるい とうだい」\n　５ねんまえから とじられている' },
        { x: 31, y: 21, type: 'sign', text: 'ひがし →「みなとまち シオカゼ」' },
      ],
    };
  }

  /* =====================================================================
     みなとまち「シオカゼ」（26 x 20）— 2つめの町
     ---------------------------------------------------------------------
     フィールドの東にある港町。上位の武具を扱い、ボスの弱点を教えてくれる。
     はじまりの村より一段上の装備が揃うので、洞窟の途中で寄る動機になる。
     ===================================================================== */
  function buildPort() {
    const g = new Grid(26, 20, '.');
    g.frame(0, 0, 26, 20, 'T');
    g.rect(0, 0, 26, 4, '~');                      // 北は海
    g.rect(0, 4, 26, 1, 'o');                      // 岸壁
    g.rect(11, 5, 2, 14, ',');                     // 大通り
    g.rect(1, 10, 24, 2, ',');                     // 横道
    g.rect(8, 4, 8, 3, 'o');                       // 波止場の広場

    function house(x, y, doorDx, doorTop) {
      g.rect(x, y, 7, 6, '#');
      g.rect(x + 1, y + 1, 5, 4, '=');
      g.set(x + doorDx, doorTop ? y : y + 5, 'D');
    }
    house(2, 5, 3, false);      // ぶきや（上位） 内寸 x=3..7, y=6..9  扉(5,10)
    house(17, 5, 3, false);     // どうぐや       内寸 x=18..22,y=6..9 扉(20,10)
    house(2, 13, 3, true);      // やどや         内寸 x=3..7, y=14..17 扉(5,13)
    house(17, 13, 3, true);     // 船長の家       内寸 x=18..22,y=14..17 扉(20,13)

    g.set(4, 6, 'C'); g.set(19, 6, 'C');
    g.set(4, 17, 'C');
    g.set(20, 15, 'H');
    g.set(6, 7, 'k'); g.set(3, 9, 'b'); g.set(7, 9, 'p');
    g.set(21, 7, 'h'); g.set(18, 9, 'k'); g.set(22, 9, 'p');
    g.set(4, 14, 'e'); g.set(7, 14, 'e'); g.set(7, 16, 'a');
    g.set(18, 14, 't'); g.set(22, 14, 't'); g.set(18, 17, 'h');
    g.set(19, 17, 'c'); g.set(20, 17, 'c'); g.set(21, 17, 'c');

    // 港らしい装飾
    g.set(9, 5, 'y'); g.set(14, 5, 'y');           // 荷車
    g.set(8, 6, 'k'); g.set(15, 6, 'k');           // 木箱
    g.set(10, 12, 'n'); g.set(14, 12, 'n');        // ベンチ
    g.set(2, 11, 'w');                             // 井戸
    g.set(9, 8, 'l'); g.set(15, 8, 'l');           // 花壇
    g.set(10, 6, 'S');
    g.set(1, 18, 'T'); g.set(24, 18, 'T'); g.set(9, 17, 'T'); g.set(15, 17, 'T');
    g.scatter([1, 6, 24, 6, 1, 16, 24, 16, 9, 15, 15, 15], '*');

    g.set(11, 19, ','); g.set(12, 19, ',');        // 南の出口

    return {
      id: 'port', name: 'みなとまち シオカゼ', rows: g.rows(),
      enc: null, indoor: false,
      npcs: [
        { x: 5, y: 6, spr: 'smith', dir: 0, act: { type: 'shop', shop: 'weapon2' } },
        { x: 20, y: 6, spr: 'shop', dir: 0, act: { type: 'shop', shop: 'tool' } },
        { x: 5, y: 17, spr: 'inn', dir: 3, act: { type: 'inn' } },
        {
          x: 20, y: 15, spr: 'king', dir: 0,
          talk: function () {
            if (G.flags.read.g3)
              return ['とうだいの きろくを みたか。',
                      'ガレンは 30ねんまえに ながれてきた\nがくしゃだ。うみを わたって な。',
                      'あの おとこは りゅうの ちからを\n「ひとが つかえるように する」と\nいっておった。',
                      'わしは とうだいを とじた。\nだが おそかったようだ。'];
            return ['わしは この みなとの ふなおさだ。',
                    'やみのりゅうは ほのおの けもの。\nほのおは きかん。こおりで うて。',
                    'ヒャドを おぼえておらぬなら\nレベルを あげてから いくのだ。'];
          },
        },
        {
          x: 12, y: 6, spr: 'soldier', dir: 0,
          talk: ['ここは みなとまち シオカゼ。',
                 'はじまりの村より いい ぶきが\nそろっているぞ。かねを ためてこい。'],
        },
        {
          x: 8, y: 11, spr: 'girl', dir: 0,
          talk: ['うみの むこうには\nもっと おおきな くにが あるんだって。',
                 'いつか いってみたいなあ。'],
        },
        {
          x: 16, y: 11, spr: 'sage', dir: 0,
          talk: ['ルカニは しゅび力を さげる じゅもん。',
                 'かたい てきには こうげきより\nさきに ルカニだ。とおる ダメージが\nまるで ちがう。'],
        },
        {
          x: 13, y: 15, spr: 'villager', dir: 0,
          talk: ['ほらあなの おくで\nおおきな がいこつを みた……',
                 'あれは ほのおに よわいはずだ。'],
        },
        {
          x: 4, y: 8, spr: 'priest', dir: 0,
          talk: ['まものが むれで おそってくるなら\nぜんたいこうげきの じゅもんだ。',
                 'ベギラマ、そして ライデイン。'],
        },
      ],
      events: [
        { x: 11, y: 19, type: 'warp', to: 'field', tx: 35, ty: 20, dir: 0 },
        { x: 12, y: 19, type: 'warp', to: 'field', tx: 35, ty: 20, dir: 0 },
        { x: 10, y: 6, type: 'sign', text: '「みなとまち シオカゼ」\n　うみの かおりが する' },
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
    g.set(21, 11, '$');                            // 東の行き止まりの宝

    // 床の暗い差し色（見た目のメリハリ）
    for (let i = 0; i < 60; i++) {
      const x = 1 + ((i * 5 + 2) % 24), y = 1 + ((i * 9 + 4) % 18);
      if (g.d[y][x] === '-') g.set(x, y, '3');
    }
    g.set(12, 1, '<'); g.set(7, 17, '>'); g.set(11, 12, '$'); g.set(21, 11, '$');
    g.set(5, 5, 'j'); g.set(20, 8, 'j'); g.set(15, 16, 'j');   // 手がかりの目印

    return {
      id: 'cave1', name: 'やみのほらあな １かい', rows: g.rows(),
      enc: G.ENC.cave1, indoor: true, dark: 1,
      npcs: [],
      events: [
        { x: 12, y: 1, type: 'warp', to: 'field', tx: 20, ty: 3, dir: 0 },
        // 階段は門番を倒すまで進めない（中ボスが関門になる）
        {
          x: 7, y: 17, type: 'warp', to: 'cave2', tx: 3, ty: 13, dir: 0,
          requires: 'gateOpen',
          deny: 'かいだんは くろい もやに\nふさがれている。',
        },
        {
          x: 7, y: 16, type: 'boss', id: 'gate', enemy: 'gatekeeper', flag: 'gateOpen',
          intro: 'かいだんの まえに\nおおきな がいこつが たちふさがった！',
        },
        { x: 11, y: 12, type: 'chest', id: 'c1', weapon: 3 },
        { x: 21, y: 11, type: 'chest', id: 'c3', item: 'seisui', n: 2 },
        {
          x: 5, y: 5, type: 'pickup', needQuest: 'missing', setQuest: 'missing', setValue: 2,
          locked: 'つちに なにかが うまっている。\nいまは かかわらないでおこう。',
          text: 'つちの なかから\nちいさな ペンダントを みつけた。\n\n'
              + 'うらに 「ミナ」と ほられている。\n（かえらぬ3人・てがかりを えた）',
          taken: 'ほったあとが のこっている。',
        },
        {
          x: 20, y: 8, type: 'read', id: 'd1',
          text: 'かべに ほられた もじ――\n\n'
              + '「ぬしは いた。だが おそわれては\nいない。あれは なにかを\nまもって いるようだ」',
          again: 'かべに もじが ほられている。',
        },
        {
          x: 15, y: 16, type: 'read', id: 'd2',
          text: 'やぶれた にっきの きれはし――\n\n'
              + '「りゅうの めは くるしそうだった。\nくびに くろい わが はまっている。\n'
              + 'だれかが あれを つけたのだ」',
          again: 'やぶれた にっきの きれはし。',
        },
      ],
    };
  }

  /* =====================================================================
     やみのほらあな 2F（20 x 16）— 最深部にボス
     ===================================================================== */
  function buildCave2() {
    const g = new Grid(20, 16, '%');
    g.corridor(3, 8, 3, 13, '-', 2);               // 階段から北へ
    g.corridor(3, 10, 5, 10, '-', 1);              // 日記のある小部屋へ
    g.corridor(3, 8, 10, 8, '-', 2);               // 東へ
    g.corridor(10, 5, 10, 8, '-', 2);              // 広間へ上がる
    g.rect(5, 1, 10, 5, '-');                      // ボスの広間
    g.frame(4, 0, 12, 7, '%');
    g.rect(9, 5, 2, 2, '-');                       // 広間の入口
    g.corridor(12, 10, 16, 10, '-', 2);            // 東の隠し通路
    g.corridor(12, 8, 12, 11, '-', 2);
    g.set(16, 11, '$');
    g.set(13, 2, '$');                             // 広間の奥（ボスの背後）
    g.set(3, 13, '<');                             // 1Fへ

    for (let i = 0; i < 40; i++) {
      const x = 1 + ((i * 7 + 1) % 18), y = 1 + ((i * 5 + 2) % 14);
      if (g.d[y][x] === '-') g.set(x, y, '3');
    }
    g.set(3, 13, '<'); g.set(16, 11, '$'); g.set(13, 2, '$');
    g.set(4, 10, 'j');

    return {
      id: 'cave2', name: 'やみのほらあな さいしんぶ', rows: g.rows(),
      enc: G.ENC.cave2, indoor: true, dark: 1,
      npcs: [],
      events: [
        { x: 3, y: 13, type: 'warp', to: 'cave1', tx: 7, ty: 16, dir: 0 },
        { x: 16, y: 11, type: 'chest', id: 'c2', armor: 3 },
        { x: 13, y: 2, type: 'chest', id: 'c4', gold: 250 },
        {
          x: 4, y: 10, type: 'read', id: 'd3',
          text: 'さいごの にっきの ページ――\n\n'
              + '「わが つけた わは\nりゅうの こころを のっとる。\n'
              + 'われは この ちを ほろぼす。\nりゅうの てで」\n\n'
              + '……しょめいは かすれて よめない。',
          again: 'さいごの にっきの ページ。',
        },
        // 広間の入口を踏むとボス戦
        { x: 9, y: 5, type: 'boss', id: 'boss', enemy: 'boss', flag: 'bossDead', scene: 'boss' },
        { x: 10, y: 5, type: 'boss', id: 'boss', enemy: 'boss', flag: 'bossDead', scene: 'boss' },
      ],
    };
  }

  /* =====================================================================
     ふるい とうだい（東の岬）— 学者ガレンが「支配の輪」を研究していた廃墟
     1階 18x16 ／ 最上階 14x12
     ===================================================================== */
  function buildTower1() {
    const g = new Grid(18, 16, '#');
    g.rect(2, 2, 14, 12, '=');                     // 大部屋
    g.rect(6, 6, 6, 4, '#');                       // 中央の柱（回り込める）
    g.set(8, 15, 'D');                             // 外へ
    g.set(8, 14, '='); g.set(9, 14, '=');
    g.set(3, 2, '<'); // 上階への階段（左上）
    g.set(14, 3, '$');
    // 装飾
    g.set(2, 2, 't'); g.set(15, 2, 't'); g.set(2, 13, 't'); g.set(15, 13, 't');
    g.set(4, 5, 'k'); g.set(13, 5, 'k'); g.set(4, 11, 'b'); g.set(13, 11, 'p');
    g.set(6, 12, 'h'); g.set(11, 12, 'h');
    return {
      id: 'tower1', name: 'ふるい とうだい １かい', rows: g.rows(),
      enc: G.ENC.tower1, indoor: true,
      npcs: [],
      events: [
        { x: 8, y: 15, type: 'warp', to: 'field', tx: 36, ty: 9, dir: 0 },
        { x: 3, y: 2, type: 'warp', to: 'tower2', tx: 7, ty: 10, dir: 3 },
        { x: 14, y: 3, type: 'chest', id: 't1', gold: 180 },
        {
          x: 9, y: 12, type: 'read', id: 'g1',
          text: 'かべに はりつけられた けいこく――\n\n'
              + '「この とうだいは とじられた。\n'
              + 'なかの ものを もちださぬこと。\n'
              + '　　　　　シオカゼ ふなおさ」',
          again: 'とじられた とうだいの けいこく。',
        },
        {
          x: 5, y: 8, type: 'read', id: 'g2',
          text: 'ゆかに ちらばった けんきゅうメモ――\n\n'
              + '「わは ちからを つたえる。\n'
              + 'だが こころまでは しばれぬ。\n'
              + 'にの わが いる」',
          again: 'ちらばった けんきゅうメモ。',
        },
      ],
    };
  }

  function buildTower2() {
    const g = new Grid(14, 12, '#');
    g.rect(2, 2, 10, 8, '=');
    g.set(7, 10, '>');                             // 下階へ
    g.set(7, 1, 'D');                              // 奥へ（竜を倒すまで開かない）
    g.set(3, 3, 'h'); g.set(10, 3, 'h');           // 書棚
    g.set(2, 6, 'a'); g.set(11, 6, 'a');           // 机
    g.set(3, 8, 't'); g.set(10, 8, 't');           // 松明
    g.set(5, 3, '$'); g.set(8, 3, '$');
    return {
      id: 'tower2', name: 'とうだい さいじょうかい', rows: g.rows(),
      enc: G.ENC.tower2, indoor: true,
      npcs: [],
      events: [
        { x: 7, y: 10, type: 'warp', to: 'tower1', tx: 3, ty: 3, dir: 0 },
        {
          x: 7, y: 1, type: 'warp', to: 'tower3', tx: 6, ty: 9, dir: 3,
          requires: 'bossDead',
          deny: 'とびらは かたく とざされている。\nおくから かすかに\nひとの けはいが する……',
        },
        { x: 5, y: 3, type: 'chest', id: 't2', weapon: 5 },
        { x: 8, y: 3, type: 'chest', id: 't3', armor: 5 },
        {
          x: 7, y: 6, type: 'read', id: 'g3',
          text: 'ひらかれたままの けんきゅうにっし――\n\n'
              + '「いちの わは りゅうに はめた。\n'
              + 'せいぎょは しっぱいした。\n'
              + 'あれは もう わたしの ものでは ない」\n\n'
              + '「にの わは まだ てもとに ある。\n'
              + 'こんどは しくじらぬ」',
          again: 'ひらかれたままの けんきゅうにっし。',
        },
        {
          x: 3, y: 6, type: 'read', id: 'g4',
          text: 'ちいさな てちょう――\n\n'
              + '「むらの わかものが ３にん\n'
              + 'たずねてきた。ぬしの ことを\n'
              + 'しらべていると いう」\n\n'
              + '「きたの ほらあなへ むかわせた。\n'
              + 'ちょうど よい ためしに なる」',
          again: 'ちいさな てちょう。',
        },
      ],
    };
  }

  /* =====================================================================
     とうだいの おくのま — 竜を倒したあとにだけ入れる（裏ボス）
     ===================================================================== */
  function buildTower3() {
    const g = new Grid(13, 11, '#');
    g.rect(2, 2, 9, 8, '=');
    g.set(6, 10, 'D');                             // 最上階へ戻る
    g.set(2, 2, 't'); g.set(10, 2, 't');
    g.set(2, 9, 't'); g.set(10, 9, 't');
    g.set(3, 3, 'h'); g.set(9, 3, 'h');
    g.set(5, 8, 'c'); g.set(6, 8, 'c'); g.set(7, 8, 'c');
    return {
      id: 'tower3', name: 'とうだいの おくのま', rows: g.rows(),
      enc: null, indoor: true,
      npcs: [],
      events: [
        { x: 6, y: 10, type: 'warp', to: 'tower2', tx: 7, ty: 2, dir: 0 },
        {
          x: 6, y: 4, type: 'boss', id: 'galen', enemy: 'galen', flag: 'galenDead',
          intro: 'おくのまに ひとりの ろうじんが\nたっていた。\n\n'
               + '「……りゅうを ころしたのは\nおまえか」',
        },
        {
          x: 6, y: 5, type: 'boss', id: 'galen', enemy: 'galen', flag: 'galenDead',
          intro: 'おくのまに ひとりの ろうじんが\nたっていた。\n\n'
               + '「……りゅうを ころしたのは\nおまえか」',
        },
        {
          x: 3, y: 6, type: 'read', id: 'g5',
          text: 'つくえに のこされた しょめん――\n\n'
              + '「にの わは かんせいした。\n'
              + 'こんどは りゅうでは ない。\n'
              + 'ひとに はめる」',
          again: 'つくえに のこされた しょめん。',
        },
      ],
    };
  }

  G.buildMaps = function () {
    G.MAPS = {
      town: buildTown(),
      port: buildPort(),
      field: buildField(),
      cave1: buildCave1(),
      cave2: buildCave2(),
      tower1: buildTower1(),
      tower2: buildTower2(),
      tower3: buildTower3(),
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
