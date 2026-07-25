/* =====================================================================
   main.js — 起動・状態遷移・セーブ・タイトル・ゲームオーバー・エンディング
   ===================================================================== */
(function () {
  'use strict';
  const G = (window.G = window.G || {});

  const SAVE_KEY = 'yaminoryu.save.v1';
  G.time = 0;
  G.state = 'title';

  /* =====================================================================
     セーブ / ロード
     ===================================================================== */
  function safeLS(fn, fallback) {
    try { return fn(); } catch (e) { return fallback; }
  }
  G.hasSave = function () {
    return !!safeLS(function () { return localStorage.getItem(SAVE_KEY); }, null);
  };
  G.saveGame = function () {
    const p = G.player;
    const data = {
      v: 1, player: p, flags: G.flags,
      at: { map: p.map, x: p.x, y: p.y, dir: p.dir },
      playMs: p.playMs,
    };
    safeLS(function () { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); }, null);
  };
  G.loadGame = function () {
    const raw = safeLS(function () { return localStorage.getItem(SAVE_KEY); }, null);
    if (!raw) return false;
    let d;
    try { d = JSON.parse(raw); } catch (e) { return false; }
    if (!d || !d.player) return false;
    G.player = d.player;
    G.flags = d.flags || { chests: {} };
    if (!G.flags.chests) G.flags.chests = {};
    // 後方互換（項目が増えたときに undefined で落ちないように）
    const p = G.player;
    if (p.kills === undefined) p.kills = 0;
    if (p.steps === undefined) p.steps = 0;
    if (p.holy === undefined) p.holy = 0;
    if (p.playMs === undefined) p.playMs = 0;
    if (!p.items) p.items = {};
    if (!p.spells) p.spells = [];
    G.field.enter(d.at.map, d.at.x, d.at.y, d.at.dir);
    G.state = 'field';
    return true;
  };

  /* =====================================================================
     ニューゲーム
     ===================================================================== */
  G.newGame = function () {
    const L = G.LEVELS[0];
    G.flags = { toldByElder: 0, gateOpen: 0, bossDead: 0, chests: {} };
    G.player = {
      name: 'ユウ',
      lv: 1, hp: L.hp, maxhp: L.hp, mp: L.mp, maxmp: L.mp,
      baseAtk: L.atk, baseDef: L.def,
      exp: 0, gold: 24,
      weapon: 1, armor: 1,
      items: { yakusou: 3 }, spells: [],
      map: 'town', x: 15, y: 23, dir: 3,
      rx: 0, ry: 0, moving: false, moveT: 0, frame: 0,
      steps: 0, kills: 0, holy: 0, poison: 0, playMs: 0,
    };
    G.field.enter('town', 15, 23, 3);
    G.state = 'field';
    G.msg.show([
      'ここは「はじまりの村」。',
      'きたの ほらあなに ひそむ\n「やみのりゅう」が\nこの ちを おびやかしている。',
      'まずは そんちょうに あいさつを。\n（みなみひがしの いえ）',
      '── そうさ ──\nうごく：やじるし\nはなす・しらべる：Ｚ／スペース\nメニュー：Ｘ／Esc',
    ]);
  };

  /* =====================================================================
     戦闘の出入り
     ===================================================================== */
  G.startBattle = function (enemyId, isBoss) {
    G.battle.start(enemyId, isBoss);
  };
  G.endBattle = function (result) {
    const p = G.player;
    if (result === 'win') p.kills++;

    if (result === 'lose') {
      G.state = 'gameover';
      G.gameover.t = 0;
      G.gameover.shown = 0;      // 前回の死亡でフラグが残ると復活処理が走らない
      G.msg.clear();
      return;
    }
    if (result === 'boss') {
      p.kills++;
      G.saveGame();
      G.fx.fadeOut(function () {
        G.startEnding();
        G.fx.fadeIn(null, 0.003);
      }, 0.003);
      return;
    }
    if (result === 'midboss') {
      G.state = 'field';
      G.field.grace = 3;
      G.audio.scene(p.map);
      G.saveGame();
      G.msg.show(['もんばんは くずれおちた。', 'おくへ つづく かいだんの\nふういんが とけた！\n（ぼうけんを きろくした）']);
      return;
    }
    // 通常勝利／逃走 → フィールドへ復帰
    G.state = 'field';
    G.field.grace = 3;
    G.audio.scene(p.map);
  };

  /* =====================================================================
     ゲームオーバー（村で復活・ゴールド半減）
     ===================================================================== */
  G.gameover = {
    t: 0, sel: 0,
    update: function (dt) {
      this.t += dt;
      if (this.t < 900) return;
      if (G.msg.active) { G.msg.update(dt); return; }
      if (!this.shown) {
        this.shown = 1;
        const p = G.player;
        const lost = Math.floor(p.gold / 2);
        p.gold -= lost;
        G.msg.show([
          'あ……\nおまえが しんでしまうとは。',
          'ゴールドは はんぶん\nおとしてしまった。（-' + lost + 'G）',
          'きを つけて いくのだぞ。',
        ], function () {
          p.hp = p.maxhp; p.mp = p.maxmp; p.poison = 0;
          G.field.enter('town', 24, 21, 3);
          G.state = 'field';
          G.gameover.shown = 0;
          G.gameover.t = 0;
        });
      }
    },
    draw: function () {
      G.ctx.fillStyle = '#000';
      G.ctx.fillRect(0, 0, G.W, G.H);
      if (this.t > 500) {
        G.text('しんでしまった……', G.W / 2, 220, { size: 34, align: 'center', color: '#c8433a' });
      }
      if (G.msg.active) G.msg.draw();
    },
  };

  /* =====================================================================
     エンディング
     ===================================================================== */
  G.ending = { t: 0, done: false, stars: [] };
  G.startEnding = function () {
    G.state = 'ending';
    G.ending.t = 0; G.ending.done = false;
    G.audio.scene(null, 'ending');
    const p = G.player;
    const min = Math.floor(p.playMs / 60000);
    const sec = Math.floor((p.playMs % 60000) / 1000);
    G.msg.show([
      'やみのりゅうは ちりとなって\nきえていった。',
      'ほらあなに さしこむ ひかり。\nまものたちの けはいは\nもう どこにも ない。',
      '村に もどると\nみんなが まちかまえていた。',
      'そんちょう「よくやった ' + p.name + '。\nおまえは この村の ほこりだ」',
      'こうして ' + p.name + 'の\nはじめての ぼうけんは おわった。',
      'だが これは\nはじまりの村の はなしにすぎない。',
      '── クリア ──\nレベル ' + p.lv + '　／　たおした まもの ' + p.kills + '\nあるいた ほすう ' + p.steps + '\nプレイじかん ' + min + 'ふん' + sec + 'びょう',
      'ボタンを おすと\nタイトルに もどります。',
    ], function () { G.ending.done = true; });
  };
  G.endingUpdate = function (dt) {
    G.ending.t += dt;
    if (G.msg.active) { G.msg.update(dt); return; }
    if (G.ending.done && (G.pressed('ok') || G.pressed('cancel'))) {
      G.audio.se('confirm');
      G.state = 'title';
      G.title.sel = 0;
      G.audio.stopBgm();
      G.audio.bgm('town');
    }
  };
  G.endingDraw = function () {
    const c = G.ctx;
    // 朝焼け
    const g = c.createLinearGradient(0, 0, 0, G.H);
    g.addColorStop(0, '#2a2050');
    g.addColorStop(0.45, '#a2536a');
    g.addColorStop(0.75, '#e8a04a');
    g.addColorStop(1, '#f6d38a');
    c.fillStyle = g; c.fillRect(0, 0, G.W, G.H);
    // 山並み
    c.fillStyle = '#3a2b46';
    for (let i = 0; i < 5; i++) {
      const bx = i * 180 - 60, bw = 260, bh = 120 + (i % 3) * 40;
      c.beginPath();
      c.moveTo(bx, 470); c.lineTo(bx + bw / 2, 470 - bh); c.lineTo(bx + bw, 470);
      c.closePath(); c.fill();
    }
    c.fillStyle = '#241a2e';
    c.fillRect(0, 466, G.W, G.H - 466);
    // 主人公の後ろ姿
    const img = G.SPR.hero[3][0];
    c.drawImage(img, 0, 0, 16, G.CH, (G.W / 2 - 48) | 0, 332, 96, 144);
    if (G.msg.active) G.msg.draw();
  };

  /* =====================================================================
     タイトル
     ===================================================================== */
  G.title = {
    sel: 0, t: 0,
    items: function () {
      return G.hasSave() ? ['つづきから', 'はじめから'] : ['はじめから'];
    },
    update: function (dt) {
      this.t += dt;
      const list = this.items(), n = list.length;
      if (G.pressed('up')) { this.sel = (this.sel - 1 + n) % n; G.audio.se('select'); }
      if (G.pressed('down')) { this.sel = (this.sel + 1) % n; G.audio.se('select'); }
      if (G.pressed('ok')) {
        G.audio.se('confirm');
        const pick = list[this.sel];
        const self = this;
        G.fx.fadeOut(function () {
          if (pick === 'つづきから') {
            if (!G.loadGame()) G.newGame();
          } else {
            G.newGame();
          }
          G.fx.fadeIn(null, 0.005);
        }, 0.006);
      }
    },
    draw: function () {
      const c = G.ctx;
      const g = c.createLinearGradient(0, 0, 0, G.H);
      g.addColorStop(0, '#080a18');
      g.addColorStop(0.6, '#12162e');
      g.addColorStop(1, '#1a1024');
      c.fillStyle = g; c.fillRect(0, 0, G.W, G.H);
      // 星
      for (let i = 0; i < 70; i++) {
        const x = (i * 137) % G.W, y = (i * 89) % 380;
        const tw = 0.35 + 0.65 * Math.abs(Math.sin(G.time / 900 + i));
        c.globalAlpha = tw * 0.8;
        c.fillStyle = '#f2f0e5';
        c.fillRect(x, y, 2, 2);
      }
      c.globalAlpha = 1;

      // 背後に竜のシルエット
      const boss = G.ENEMY.boss;
      c.globalAlpha = 0.22;
      c.drawImage(boss, 0, 0, 64, 64, (G.W - 460) / 2, 120, 460, 460);
      c.globalAlpha = 1;

      // タイトル
      G.text('やみのりゅう', G.W / 2, 96, { size: 62, align: 'center', color: '#f2f0e5' });
      G.text('— はじまりの村と ほらあなの ぬし —', G.W / 2, 178, { size: 19, align: 'center', color: '#b8a06a' });

      // 主人公
      c.drawImage(G.SPR.hero[0][Math.floor(G.time / 400) % 2], 0, 0, 16, G.CH, G.W / 2 - 36, 264, 72, 108);

      // メニュー
      const list = this.items();
      const bw = 300, bx = (G.W - bw) / 2, by = 404;
      G.win(bx, by, bw, 40 + list.length * 44);
      for (let i = 0; i < list.length; i++) {
        const cy = by + 28 + i * 44;
        G.text(list[i], G.W / 2, cy, { size: 24, align: 'center' });
        if (this.sel === i) G.cursor(bx + 46, cy);
      }
      G.text('やじるし＝いどう　Ｚ／スペース＝けってい　Ｘ＝メニュー',
        G.W / 2, G.H - 44, { size: 16, align: 'center', color: '#7d8494' });
    },
  };

  /* =====================================================================
     メインループ
     ===================================================================== */
  let last = 0;
  function frame(ts) {
    if (!last) last = ts;
    let dt = ts - last;
    last = ts;
    if (dt > 60) dt = 60;                     // タブ復帰時の暴走を防ぐ
    G.time = ts;

    G.fx.update(dt);

    switch (G.state) {
      case 'title': G.title.update(dt); break;
      case 'field':
        G.player.playMs += dt;
        G.field.update(dt);
        break;
      case 'menu': G.player.playMs += dt; G.menu.update(dt); break;
      case 'shop': G.player.playMs += dt; G.shop.update(dt); break;
      case 'battle': G.player.playMs += dt; G.battle.update(dt); break;
      case 'gameover': G.gameover.update(dt); break;
      case 'ending': G.endingUpdate(dt); break;
    }

    const shifted = G.fx.pre();
    switch (G.state) {
      case 'title': G.title.draw(); break;
      case 'field': G.field.draw(); break;
      case 'menu': G.menu.draw(); break;
      case 'shop': G.shop.draw(); break;
      case 'battle': G.battle.draw(); break;
      case 'gameover': G.gameover.draw(); break;
      case 'ending': G.endingDraw(); break;
    }
    G.fx.post(shifted);

    G.clearEdges();
    requestAnimationFrame(frame);
  }

  /* =====================================================================
     起動
     ===================================================================== */
  window.addEventListener('DOMContentLoaded', function () {
    G.initCanvas();
    G.initSprites();
    G.buildMaps();
    G.initInput();

    // ダミーのプレイヤー（タイトル描画で参照されるため）
    G.flags = { chests: {} };
    G.player = { name: 'ユウ', lv: 1, hp: 1, maxhp: 1, mp: 0, maxmp: 0, gold: 0, playMs: 0, dir: 0, frame: 0, map: 'town' };

    // ミュートボタン
    const mb = document.getElementById('mute');
    if (mb) {
      mb.addEventListener('click', function () {
        const m = G.audio.toggleMute();
        mb.textContent = m ? '🔇' : '🔊';
        mb.classList.toggle('off', m);
      });
    }
    // セーブ削除（デバッグ用・長押し）
    const rb = document.getElementById('reset');
    if (rb) {
      rb.addEventListener('click', function () {
        if (!confirm('ぼうけんのきろくを けしますか？')) return;
        try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 無視 */ }
        location.reload();
      });
    }

    requestAnimationFrame(frame);
  });
})();
