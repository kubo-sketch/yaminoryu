/* =====================================================================
   cutscene.js — イベント演出（カメラ移動・自動歩行・待ち・効果）
   ---------------------------------------------------------------------
   会話ウィンドウだけで物語を進めると、どれだけ絵を描いても紙芝居になる。
   カメラを振る／人を歩かせる／間を置く、の3つがあるだけで場面が生きる。

   使い方：
     G.cut.play([
       { t: 'pan', x: 20, y: 3, ms: 900 },      // マップ座標へカメラを振る
       { t: 'wait', ms: 400 },
       { t: 'msg', lines: ['...'] },
       { t: 'walk', who: 'player', dir: 3, steps: 2 },
       { t: 'panBack', ms: 700 },
     ], onDone);
   ===================================================================== */
(function () {
  'use strict';
  const G = (window.G = window.G || {});

  const DX = [0, -1, 1, 0], DY = [1, 0, 0, -1];
  const WALK_MS = 165;

  G.cut = {
    active: false,
    list: [], step: null, t: 0, done: null,
    from: null, to: null,        // カメラ補間用

    play: function (list, done) {
      this.list = list.slice();
      this.done = done || null;
      this.active = true;
      G.field.busy = true;
      this.nextStep();
    },

    nextStep: function () {
      if (!this.list.length) {
        this.active = false;
        this.step = null;
        G.field.camOverride = null;
        G.field.busy = false;
        const d = this.done; this.done = null;
        if (d) d();
        return;
      }
      const s = this.list.shift();
      this.step = s;
      this.t = 0;

      switch (s.t) {
        case 'msg':
          G.msg.show(s.lines, () => this.nextStep());
          break;
        case 'pan': {
          const T = G.T;
          const cur = G.field.camOverride || { x: G.field.cam.x, y: G.field.cam.y };
          this.from = { x: cur.x, y: cur.y };
          this.to = G.field.clampCam(s.x * T + T / 2 - G.W / 2, s.y * T + T / 2 - G.H / 2);
          break;
        }
        case 'panBack': {
          const p = G.player, T = G.T;
          const cur = G.field.camOverride || { x: G.field.cam.x, y: G.field.cam.y };
          this.from = { x: cur.x, y: cur.y };
          this.to = G.field.clampCam(p.x * T + T / 2 - G.W / 2, p.y * T + T / 2 - G.H / 2);
          break;
        }
        case 'walk': {
          const a = this.actor(s.who);
          if (!a) { this.nextStep(); return; }
          a.dir = s.dir;
          s._left = s.steps;
          break;
        }
        case 'face': {
          const a = this.actor(s.who);
          if (a) a.dir = s.dir;
          this.nextStep();
          break;
        }
        case 'flash': G.fx.flash(s.col || '#ffffff', s.ms || 300); this.nextStep(); break;
        case 'shake': G.fx.shake(s.amp || 8, s.ms || 400); this.nextStep(); break;
        case 'se': G.audio.se(s.name); this.nextStep(); break;
        case 'bgm': G.audio.bgm(s.name); this.nextStep(); break;
        case 'stopBgm': G.audio.stopBgm(); this.nextStep(); break;
        case 'fn': if (s.f) s.f(); this.nextStep(); break;
        case 'wait': break;
        default: this.nextStep();
      }
    },

    actor: function (who) {
      if (who === 'player' || who === undefined) return G.player;
      const list = G.field.map.npcs;
      if (typeof who === 'number') return list[who];
      return list.find(function (n) { return n.spr === who; });
    },

    update: function (dt) {
      if (!this.active) return;
      const s = this.step;
      if (!s) return;
      if (G.msg.active) { G.msg.update(dt); return; }
      this.t += dt;

      if (s.t === 'wait') {
        if (this.t >= (s.ms || 500)) this.nextStep();

      } else if (s.t === 'pan' || s.t === 'panBack') {
        const k = Math.min(1, this.t / (s.ms || 800));
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;   // ease in-out
        G.field.camOverride = {
          x: this.from.x + (this.to.x - this.from.x) * e,
          y: this.from.y + (this.to.y - this.from.y) * e,
        };
        if (k >= 1) {
          if (s.t === 'panBack') G.field.camOverride = null;
          this.nextStep();
        }

      } else if (s.t === 'walk') {
        const a = this.actor(s.who);
        if (!a) { this.nextStep(); return; }
        const k = Math.min(1, this.t / WALK_MS);
        a.frame = k < 0.5 ? 1 : 0;
        // 見た目の位置を補間（プレイヤーは rx/ry、NPCはタイル単位なので都度確定）
        if (a === G.player) {
          a.moving = true; a.moveT = k * WALK_MS; a.dir = s.dir;
        }
        if (k >= 1) {
          a.x += DX[s.dir]; a.y += DY[s.dir];
          if (a === G.player) { a.moving = false; a.moveT = 0; }
          a.frame = 0;
          s._left--;
          this.t = 0;
          G.audio.se('step');
          if (s._left <= 0) this.nextStep();
        }
      }
    },
  };

  /* =====================================================================
     実際の場面
     ===================================================================== */

  // 冒頭：村を見渡してから主人公に寄る
  G.sceneOpening = function () {
    G.cut.play([
      { t: 'wait', ms: 500 },
      { t: 'pan', x: 15, y: 12, ms: 1100 },
      { t: 'msg', lines: ['ここは「はじまりの村」。'] },
      { t: 'pan', x: 15, y: 3, ms: 900 },
      {
        t: 'msg',
        lines: ['きたの ほらあなに ひそむ\n「やみのりゅう」が\nこの ちを おびやかしている。'],
      },
      { t: 'panBack', ms: 900 },
      {
        t: 'msg',
        lines: [
          'まずは そんちょうに あいさつを。\n（みなみひがしの いえ）',
          '── そうさ ──\nうごく：やじるし\nはなす・しらべる：Ｚ／スペース\nメニュー：Ｘ／Esc',
        ],
      },
    ]);
  };

  // 村長に頼まれた直後：北の洞窟へカメラが飛ぶ
  G.sceneElder = function (after) {
    G.cut.play([
      { t: 'msg', lines: ['ほらあなの ふういんを といた。'] },
      { t: 'pan', x: 15, y: 2, ms: 1000 },
      { t: 'shake', amp: 5, ms: 500 },
      { t: 'se', name: 'encounter' },
      { t: 'msg', lines: ['きたの そらが\nどす黒く にごっている……'] },
      { t: 'panBack', ms: 900 },
      { t: 'msg', lines: ['ゆけ。ぶじを いのっている。\n（ここまでの ぼうけんを きろくした）'] },
    ], after);
  };

  // ボスの間へ踏み込んだとき
  G.sceneBoss = function (after) {
    G.cut.play([
      { t: 'stopBgm' },
      { t: 'wait', ms: 300 },
      { t: 'shake', amp: 4, ms: 700 },
      { t: 'msg', lines: ['ずしり――\nつめたい かぜが ふきぬけた。'] },
      { t: 'pan', x: 10, y: 2, ms: 900 },
      { t: 'wait', ms: 250 },
      { t: 'se', name: 'encounter' },
      { t: 'flash', col: '#ff5a3c', ms: 500 },
      { t: 'shake', amp: 11, ms: 800 },
      { t: 'msg', lines: ['やみのりゅうが\nめを さました！'] },
      { t: 'panBack', ms: 500 },
    ], after);
  };
})();
