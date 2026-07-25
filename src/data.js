/* =====================================================================
   data.js — バランス定数の一括置き場
   ---------------------------------------------------------------------
   手触り調整はすべてこのファイルの数値だけを触る。
   ロジック（engine/field/battle）には数値を埋め込まない。
   ===================================================================== */
(function () {
  'use strict';
  const G = (window.G = window.G || {});

  /* ---------------- 成長テーブル（Lv1〜12） ----------------
     exp: そのレベルに上がるのに必要な累計経験値
     ドラクエ1準拠で、序盤は3〜4戦で1レベル上がるように置く      */
  G.LEVELS = [
    /* Lv1  */ { exp: 0, hp: 22, mp: 0, atk: 5, def: 4 },
    /* Lv2  */ { exp: 8, hp: 29, mp: 0, atk: 7, def: 6 },
    /* Lv3  */ { exp: 20, hp: 36, mp: 6, atk: 10, def: 8, learn: 'hoimi' },
    /* Lv4  */ { exp: 42, hp: 44, mp: 12, atk: 14, def: 11, learn: 'mera' },
    /* Lv5  */ { exp: 76, hp: 53, mp: 18, atk: 18, def: 14 },
    /* Lv6  */ { exp: 124, hp: 62, mp: 25, atk: 22, def: 18, learn: 'rarihou' },
    /* Lv7  */ { exp: 190, hp: 72, mp: 32, atk: 27, def: 22 },
    /* Lv8  */ { exp: 280, hp: 84, mp: 40, atk: 32, def: 26, learn: 'behoimi' },
    /* Lv9  */ { exp: 400, hp: 96, mp: 48, atk: 38, def: 31 },
    /* Lv10 */ { exp: 560, hp: 110, mp: 58, atk: 44, def: 36, learn: 'begirama' },
    /* Lv11 */ { exp: 760, hp: 124, mp: 68, atk: 50, def: 41 },
    /* Lv12 */ { exp: 1000, hp: 140, mp: 80, atk: 57, def: 47 },
  ];

  /* ---------------- 武器・防具 ---------------- */
  G.WEAPONS = [
    { name: 'すで', atk: 0, price: 0 },
    { name: 'ひのきのぼう', atk: 2, price: 10 },
    { name: 'どうのつるぎ', atk: 8, price: 90 },
    { name: 'てつのやり', atk: 14, price: 280 },
    { name: 'はがねのつるぎ', atk: 22, price: 620 },
  ];
  G.ARMORS = [
    { name: 'たびのふく', atk: 0, def: 0, price: 0 },
    { name: 'ぬののふく', def: 3, price: 20 },
    { name: 'かわのよろい', def: 8, price: 120 },
    { name: 'くさりかたびら', def: 15, price: 380 },
    { name: 'てつのよろい', def: 24, price: 800 },
  ];

  /* ---------------- 道具 ---------------- */
  G.ITEMS = {
    yakusou: {
      name: 'やくそう', price: 12, battle: true, field: true,
      use: function (p) {
        const heal = 22 + ((Math.random() * 9) | 0);
        const before = p.hp;
        p.hp = Math.min(p.maxhp, p.hp + heal);
        return p.name + 'は やくそうをつかった！\nHPが ' + (p.hp - before) + ' かいふくした。';
      },
    },
    dokukesi: {
      name: 'どくけしそう', price: 18, battle: true, field: true,
      use: function (p) {
        if (!p.poison) return 'どくには かかっていない。';
        p.poison = 0;
        return 'どくが きえた！';
      },
    },
    tubasa: {
      name: 'キメラのつばさ', price: 30, battle: false, field: true,
      use: function (p) {
        G.warpToTown();
        return 'キメラのつばさをつかった！\nはじまりの村へ もどってきた。';
      },
    },
    seisui: {
      name: 'せいすい', price: 25, battle: true, field: false,
      use: function (p) {
        p.holy = 30;                                  // 30歩ぶんエンカウント率が下がる
        return 'せいすいを ふりまいた。\nしばらく まものが よってこない。';
      },
    },
  };

  /* ---------------- 呪文 ---------------- */
  G.SPELLS = {
    hoimi: {
      name: 'ホイミ', mp: 3, battle: true, field: true, kind: 'heal',
      power: function () { return 26 + ((Math.random() * 11) | 0); },
    },
    behoimi: {
      name: 'ベホイミ', mp: 7, battle: true, field: true, kind: 'heal',
      power: function () { return 62 + ((Math.random() * 21) | 0); },
    },
    mera: {
      name: 'メラ', mp: 2, battle: true, field: false, kind: 'attack',
      power: function () { return 11 + ((Math.random() * 6) | 0); },
    },
    begirama: {
      name: 'ベギラマ', mp: 5, battle: true, field: false, kind: 'attack',
      power: function () { return 30 + ((Math.random() * 13) | 0); },
    },
    rarihou: {
      name: 'ラリホー', mp: 4, battle: true, field: false, kind: 'sleep',
      power: function () { return 0; },
    },
  };

  /* ---------------- 敵 ----------------
     atk/def は §ダメージ式に直接入る。exp/gold は撃破報酬。
     spell: 使う呪文の抽選（1ターンごとに rate で判定）
     flee : 逃走許容（ボスは false）                              */
  G.ENEMIES = {
    slime: {
      name: 'スライム', spr: 'slime', hp: 7, atk: 6, def: 3, exp: 2, gold: 4,
      scale: 1.35, flee: true,
    },
    bat: {
      name: 'おおコウモリ', spr: 'bat', hp: 11, atk: 9, def: 4, exp: 4, gold: 7,
      scale: 1.45, flee: true, agi: 1.3,
    },
    goblin: {
      name: 'ゴブリン', spr: 'goblin', hp: 18, atk: 14, def: 7, exp: 9, gold: 13,
      scale: 1.6, flee: true,
    },
    skeleton: {
      name: 'がいこつへい', spr: 'skeleton', hp: 28, atk: 21, def: 12, exp: 18, gold: 30,
      scale: 1.7, flee: true,
    },
    mage: {
      name: 'やみのまどうし', spr: 'mage', hp: 24, atk: 15, def: 9, exp: 24, gold: 40,
      scale: 1.75, flee: true, spell: { id: 'mera', rate: 0.45 },
    },
    boss: {
      name: 'やみのりゅう', spr: 'boss', hp: 150, atk: 30, def: 20, exp: 250, gold: 400,
      scale: 1.55, flee: false, boss: true,
      spell: { id: 'begirama', rate: 0.25 },
      breath: 0.2,                                   // ほのおのいき（しゅび力を無視）
    },
    /* ボス戦の想定（1ターンあたりの期待値で検算）
       Lv8・はがねのつるぎ＋くさりかたびら → こうげき54 / しゅび41
         あたえる: 54 - 20/2 = 44  → 150/44 ≒ 3.4ターンで撃破
         うける  : 0.2×32(いき) + 0.2×30(ベギラマ) + 0.6×9.5(つうじょう) ≒ 18
                   HP84 → 4.6ターン。ホイミ1回はさんで ぎりぎり勝てる
       装備が てつのやり止まりだと 4.2ターンかかり かなり苦しい
       ＝「ぶきやで そろえてから いけ」が機能する設計                        */
  };

  /* ---------------- 出現テーブル ---------------- */
  G.ENC = {
    field_near: { rate: 0.055, table: ['slime', 'slime', 'slime', 'bat', 'bat', 'goblin'] },
    field_far: { rate: 0.07, table: ['slime', 'bat', 'bat', 'goblin', 'goblin', 'skeleton'] },
    cave1: { rate: 0.085, table: ['bat', 'goblin', 'goblin', 'skeleton', 'skeleton', 'mage'] },
    cave2: { rate: 0.10, table: ['goblin', 'skeleton', 'skeleton', 'mage', 'mage'] },
  };

  /* ---------------- 称号（結果表示用） ---------------- */
  G.RANKS = [
    { lv: 1, name: 'たびだちの者' },
    { lv: 3, name: 'みならい' },
    { lv: 5, name: 'せんし' },
    { lv: 7, name: 'つわもの' },
    { lv: 9, name: 'ゆうしゃ' },
    { lv: 11, name: 'りゅうごろし' },
  ];

  /* ---------------- 店の品揃え ---------------- */
  G.SHOPS = {
    tool: {
      title: 'どうぐや',
      lines: ['いらっしゃい。\nなにを おもとめかな？'],
      goods: [
        { type: 'item', id: 'yakusou' },
        { type: 'item', id: 'dokukesi' },
        { type: 'item', id: 'seisui' },
        { type: 'item', id: 'tubasa' },
      ],
    },
    weapon: {
      title: 'ぶきや',
      lines: ['うちは ぶきと よろいの みせだ。\nいいものが そろってるぜ。'],
      goods: [
        { type: 'weapon', id: 1 },
        { type: 'weapon', id: 2 },
        { type: 'weapon', id: 3 },
        { type: 'weapon', id: 4 },
        { type: 'armor', id: 1 },
        { type: 'armor', id: 2 },
        { type: 'armor', id: 3 },
        { type: 'armor', id: 4 },
      ],
    },
  };

  G.INN_PRICE = 6;
})();
