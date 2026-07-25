/* =====================================================================
   engine.js — 描画基盤・入力・ウィンドウ・メッセージ・画面効果
   ---------------------------------------------------------------------
   内部解像度 720x624（15x13タイル × 16px × 3倍）。
   ドット絵を守るため imageSmoothingEnabled は常に false。
   ===================================================================== */
(function () {
  'use strict';
  const G = (window.G = window.G || {});

  G.TS = 16;              // タイルの元サイズ
  G.S = 3;                // 拡大率
  G.T = G.TS * G.S;       // 画面上のタイルサイズ = 48
  G.VW = 15; G.VH = 13;   // 表示タイル数
  G.W = G.VW * G.T;       // 720
  G.H = G.VH * G.T;       // 624

  const FONT = '"Hiragino Kaku Gothic ProN","Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif';
  G.font = function (size, weight) { return (weight || 'bold') + ' ' + size + 'px ' + FONT; };

  /* ---------------- 初期化 ---------------- */
  G.initCanvas = function () {
    const cv = document.getElementById('screen');
    cv.width = G.W; cv.height = G.H;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.textBaseline = 'top';
    G.cv = cv; G.ctx = ctx;
  };

  /* =====================================================================
     入力
     ===================================================================== */
  const keyMap = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
    Enter: 'ok', Space: 'ok', KeyZ: 'ok', NumpadEnter: 'ok',
    Escape: 'cancel', KeyX: 'cancel', Backspace: 'cancel', ShiftLeft: 'cancel',
  };
  G.held = {};      // 押しっぱなし判定（移動用）
  const edge = {};  // 押した瞬間だけ立つフラグ

  G.initInput = function () {
    window.addEventListener('keydown', function (e) {
      const k = keyMap[e.code];
      if (!k) return;
      e.preventDefault();
      if (!G.held[k]) edge[k] = true;
      G.held[k] = true;
      G.audio.unlock();
    });
    window.addEventListener('keyup', function (e) {
      const k = keyMap[e.code];
      if (!k) return;
      e.preventDefault();
      G.held[k] = false;
    });
    window.addEventListener('blur', function () { G.held = {}; });

    // 仮想パッド（スマホ）
    document.querySelectorAll('[data-key]').forEach(function (el) {
      const k = el.getAttribute('data-key');
      const on = function (e) {
        e.preventDefault();
        if (!G.held[k]) edge[k] = true;
        G.held[k] = true;
        el.classList.add('on');
        G.audio.unlock();
      };
      const off = function (e) {
        e.preventDefault();
        G.held[k] = false;
        el.classList.remove('on');
      };
      el.addEventListener('touchstart', on, { passive: false });
      el.addEventListener('touchend', off, { passive: false });
      el.addEventListener('touchcancel', off, { passive: false });
      el.addEventListener('mousedown', on);
      el.addEventListener('mouseup', off);
      el.addEventListener('mouseleave', off);
    });
  };

  // 押した瞬間を1回だけ拾う
  G.pressed = function (k) {
    if (edge[k]) { edge[k] = false; return true; }
    return false;
  };
  G.clearEdges = function () { for (const k in edge) edge[k] = false; };

  /* =====================================================================
     ウィンドウとテキスト
     ===================================================================== */
  // ウィンドウ。単色の黒地＋白枠だと8bit期の見え方になるので、
  // 濃紺のグラデーション＋白の外枠＋金の内罫＋四隅の飾りで質感を出す。
  G.win = function (x, y, w, h) {
    const c = G.ctx;
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(26,32,58,0.96)');
    g.addColorStop(0.5, 'rgba(14,18,36,0.96)');
    g.addColorStop(1, 'rgba(8,10,20,0.97)');
    c.fillStyle = g;
    c.fillRect(x, y, w, h);
    // 上端のハイライト（面に厚みを出す）
    c.fillStyle = 'rgba(120,140,190,0.20)';
    c.fillRect(x + 3, y + 3, w - 6, 2);
    // 外枠（白）
    c.strokeStyle = '#e8e4d2';
    c.lineWidth = 3;
    c.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);
    // 内罫（金）
    c.strokeStyle = 'rgba(208,168,58,0.5)';
    c.lineWidth = 1;
    c.strokeRect(x + 7.5, y + 7.5, w - 15, h - 15);
    // 四隅の飾り
    c.fillStyle = '#e8c85c';
    [[x + 4, y + 4], [x + w - 9, y + 4], [x + 4, y + h - 9], [x + w - 9, y + h - 9]]
      .forEach(function (p) { c.fillRect(p[0], p[1], 5, 5); });
  };

  G.text = function (s, x, y, opt) {
    const c = G.ctx;
    opt = opt || {};
    c.font = G.font(opt.size || 22, opt.weight);
    c.textAlign = opt.align || 'left';
    if (opt.shadow !== false) {
      c.fillStyle = 'rgba(0,0,0,0.85)';
      c.fillText(s, x + 2, y + 2);
    }
    c.fillStyle = opt.color || '#f2f0e5';
    c.fillText(s, x, y);
    c.textAlign = 'left';
  };

  // 複数行（\n 区切り）
  G.textLines = function (s, x, y, opt) {
    opt = opt || {};
    const lh = opt.lh || 30;
    s.split('\n').forEach(function (line, i) { G.text(line, x, y + i * lh, opt); });
  };

  // 選択カーソル（▶）
  G.cursor = function (x, y) {
    const c = G.ctx;
    const t = Math.floor(G.time / 260) % 2;
    G.text('▶', x + (t ? 2 : 0), y, { size: 20, color: '#e8c34a' });
  };

  /* =====================================================================
     メッセージ（1文字ずつ表示 → OKで次へ）
     ===================================================================== */
  const MSG_SPEED = 26;   // 1文字あたり ms
  G.msg = {
    queue: [], full: '', shown: 0, t: 0, active: false, cb: null, waiting: false,
    // lines: 文字列 or 文字列配列。cb は全部読み終わったあとに呼ぶ
    show: function (lines, cb) {
      this.queue = (typeof lines === 'string' ? [lines] : lines.slice());
      this.cb = cb || null;
      this.active = true;
      this.next();
    },
    next: function () {
      if (!this.queue.length) {
        this.active = false; this.waiting = false;
        const cb = this.cb; this.cb = null;
        if (cb) cb();
        return;
      }
      this.full = this.queue.shift();
      this.shown = 0; this.t = 0; this.waiting = false;
    },
    update: function (dt) {
      if (!this.active) return;
      if (this.shown < this.full.length) {
        this.t += dt;
        while (this.t >= MSG_SPEED && this.shown < this.full.length) {
          this.t -= MSG_SPEED;
          this.shown++;
          const ch = this.full[this.shown - 1];
          if (ch !== '\n' && ch !== '　' && this.shown % 2 === 0) G.audio.se('type');
        }
        if (G.pressed('ok') || G.pressed('cancel')) this.shown = this.full.length;
      } else {
        this.waiting = true;
        if (G.pressed('ok') || G.pressed('cancel')) {
          G.audio.se('confirm');
          this.next();
        }
      }
    },
    // 表示途中の文字列（\n を保ったまま切り出す）
    visible: function () { return this.full.slice(0, this.shown); },
    draw: function () {
      if (!this.active) return;
      const h = 150, y = G.H - h - 14;
      G.win(14, y, G.W - 28, h);
      G.textLines(this.visible(), 40, y + 24, { size: 23, lh: 36 });
      if (this.waiting) {
        const t = Math.floor(G.time / 300) % 2;
        G.text('▼', G.W - 62, y + h - 44 + (t ? 3 : 0), { size: 20, color: '#e8c34a' });
      }
    },
    clear: function () {
      this.queue = []; this.active = false; this.waiting = false; this.cb = null;
    },
  };

  /* =====================================================================
     画面効果（フラッシュ・シェイク・フェード）
     ===================================================================== */
  G.fx = {
    shakeT: 0, shakeAmp: 0,
    flashT: 0, flashDur: 0, flashCol: '#fff',
    fadeV: 0, fadeTarget: 0, fadeSpeed: 0.004, fadeCb: null,

    shake: function (amp, dur) { this.shakeAmp = amp; this.shakeT = dur; },
    flash: function (col, dur) { this.flashCol = col; this.flashT = dur; this.flashDur = dur; },
    // 既に目標の濃度に達している場合は cb を即実行する。
    // ここを取り違えると「fadeIn の cb で busy を false に戻す」処理が
    // 永久に走らず、操作不能のまま固まる。
    fadeOut: function (cb, speed) {
      this.fadeSpeed = speed || 0.004;
      this.fadeTarget = 1;
      if (this.fadeV === 1) { this.fadeCb = null; if (cb) cb(); return; }
      this.fadeCb = cb || null;
    },
    fadeIn: function (cb, speed) {
      this.fadeSpeed = speed || 0.004;
      this.fadeTarget = 0;
      if (this.fadeV === 0) { this.fadeCb = null; if (cb) cb(); return; }
      this.fadeCb = cb || null;
    },
    get busy() { return this.fadeV !== this.fadeTarget; },

    update: function (dt) {
      if (this.shakeT > 0) this.shakeT -= dt;
      if (this.flashT > 0) this.flashT -= dt;
      if (this.fadeV !== this.fadeTarget) {
        const d = this.fadeSpeed * dt;
        if (this.fadeV < this.fadeTarget) this.fadeV = Math.min(this.fadeTarget, this.fadeV + d);
        else this.fadeV = Math.max(this.fadeTarget, this.fadeV - d);
        if (this.fadeV === this.fadeTarget && this.fadeCb) {
          const cb = this.fadeCb; this.fadeCb = null; cb();
        }
      }
    },
    // 描画前：シェイクぶんずらす
    pre: function () {
      if (this.shakeT > 0) {
        const a = this.shakeAmp;
        G.ctx.save();
        G.ctx.translate(((Math.random() * 2 - 1) * a) | 0, ((Math.random() * 2 - 1) * a) | 0);
        return true;
      }
      return false;
    },
    post: function (shifted) {
      if (shifted) G.ctx.restore();
      if (this.flashT > 0) {
        G.ctx.globalAlpha = Math.min(0.75, (this.flashT / this.flashDur) * 0.75);
        G.ctx.fillStyle = this.flashCol;
        G.ctx.fillRect(0, 0, G.W, G.H);
        G.ctx.globalAlpha = 1;
      }
      if (this.fadeV > 0) {
        G.ctx.globalAlpha = this.fadeV;
        G.ctx.fillStyle = '#000';
        G.ctx.fillRect(0, 0, G.W, G.H);
        G.ctx.globalAlpha = 1;
      }
    },
  };

  /* =====================================================================
     共通の小物
     ===================================================================== */
  G.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  G.rnd = function (n) { return (Math.random() * n) | 0; };
  G.pick = function (arr) { return arr[(Math.random() * arr.length) | 0]; };

  // 全角に寄せた数値表示（HUDの桁揺れを抑える）
  G.pad = function (n, w) {
    let s = String(n);
    while (s.length < w) s = ' ' + s;
    return s;
  };
})();
