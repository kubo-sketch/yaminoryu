/* =====================================================================
   naming.js — 主人公の名前を決める画面
   ---------------------------------------------------------------------
   エンディングやNPCの台詞に名前が入るので、固定名だと他人事になる。
   ドラクエ式に、かな表からカーソルで1文字ずつ選ぶ。
   ブラウザの prompt() を使わないのは、ゲーム画面から出てしまうため。
   ===================================================================== */
(function () {
  'use strict';
  const G = (window.G = window.G || {});

  const MAXLEN = 6;
  // 10列 × 5行。最終行は記号と機能に充てる
  const HIRA = [
    'あいうえおかきくけこ',
    'さしすせそたちつてと',
    'なにぬねのはひふへほ',
    'まみむめもやゆよらり',
    'るれろわをんぁぃぅー',
  ];
  const KATA = [
    'アイウエオカキクケコ',
    'サシスセソタチツテト',
    'ナニヌネノハヒフヘホ',
    'マミムメモヤユヨラリ',
    'ルレロワヲンァィゥー',
  ];
  // 濁点・半濁点は直前の文字を変換する
  const DAKU = {
    か: 'が', き: 'ぎ', く: 'ぐ', け: 'げ', こ: 'ご',
    さ: 'ざ', し: 'じ', す: 'ず', せ: 'ぜ', そ: 'ぞ',
    た: 'だ', ち: 'ぢ', つ: 'づ', て: 'で', と: 'ど',
    は: 'ば', ひ: 'び', ふ: 'ぶ', へ: 'べ', ほ: 'ぼ',
    カ: 'ガ', キ: 'ギ', ク: 'グ', ケ: 'ゲ', コ: 'ゴ',
    サ: 'ザ', シ: 'ジ', ス: 'ズ', セ: 'ゼ', ソ: 'ゾ',
    タ: 'ダ', チ: 'ヂ', ツ: 'ヅ', テ: 'デ', ト: 'ド',
    ハ: 'バ', ヒ: 'ビ', フ: 'ブ', ヘ: 'ベ', ホ: 'ボ',
  };
  const HANDAKU = {
    は: 'ぱ', ひ: 'ぴ', ふ: 'ぷ', へ: 'ぺ', ほ: 'ぽ',
    ハ: 'パ', ヒ: 'ピ', フ: 'プ', ヘ: 'ペ', ホ: 'ポ',
  };
  // 最終行に並べる機能ボタン
  const FUNCS = ['゛', '゜', 'かな/カナ', 'けす', 'けってい'];

  const COLS = 10, ROWS = 5;
  const CELL = 54, CW = 44;

  G.naming = {
    name: '', page: 0, cx: 0, cy: 0, row: 0,   // row: 0=かな表 / 1=機能列
    fx: 0,
    done: null,

    open: function (done) {
      this.name = '';
      this.page = 0; this.cx = 0; this.cy = 0; this.row = 0; this.fx = 0;
      this.done = done || null;
      G.state = 'naming';
    },

    table: function () { return this.page ? KATA : HIRA; },

    put: function (ch) {
      if (this.name.length >= MAXLEN) { G.audio.se('cancel'); return; }
      this.name += ch;
      G.audio.se('select');
    },
    back: function () {
      if (!this.name.length) { G.audio.se('cancel'); return; }
      this.name = this.name.slice(0, -1);
      G.audio.se('cancel');
    },
    mark: function (map) {
      // 直前の文字に濁点／半濁点を付ける
      if (!this.name.length) { G.audio.se('cancel'); return; }
      const last = this.name[this.name.length - 1];
      const conv = map[last];
      if (!conv) { G.audio.se('cancel'); return; }
      this.name = this.name.slice(0, -1) + conv;
      G.audio.se('select');
    },
    finish: function () {
      const n = this.name.trim() || 'ユウ';          // 空なら既定名
      G.audio.se('confirm');
      const cb = this.done; this.done = null;
      if (cb) cb(n);
    },

    update: function (dt) {
      this.fx += dt;
      if (this.row === 0) {
        if (G.pressed('left')) { this.cx = (this.cx + COLS - 1) % COLS; G.audio.se('select'); }
        if (G.pressed('right')) { this.cx = (this.cx + 1) % COLS; G.audio.se('select'); }
        if (G.pressed('up')) {
          if (this.cy === 0) { this.row = 1; this.fx = 0; this.cx = Math.min(this.cx, FUNCS.length - 1); }
          else this.cy--;
          G.audio.se('select');
        }
        if (G.pressed('down')) {
          if (this.cy === ROWS - 1) { this.row = 1; this.cx = Math.min(this.cx, FUNCS.length - 1); }
          else this.cy++;
          G.audio.se('select');
        }
        if (G.pressed('ok')) this.put(this.table()[this.cy][this.cx]);
        if (G.pressed('cancel')) this.back();
      } else {
        const n = FUNCS.length;
        if (G.pressed('left')) { this.cx = (this.cx + n - 1) % n; G.audio.se('select'); }
        if (G.pressed('right')) { this.cx = (this.cx + 1) % n; G.audio.se('select'); }
        if (G.pressed('up') || G.pressed('down')) {
          this.row = 0; this.cy = G.pressed ? this.cy : 0;
          this.cy = 0;
          G.audio.se('select');
        }
        if (G.pressed('ok')) {
          const f = FUNCS[this.cx];
          if (f === '゛') this.mark(DAKU);
          else if (f === '゜') this.mark(HANDAKU);
          else if (f === 'かな/カナ') { this.page ^= 1; G.audio.se('select'); }
          else if (f === 'けす') this.back();
          else this.finish();
        }
        if (G.pressed('cancel')) this.back();
      }
    },

    draw: function () {
      const c = G.ctx;
      // 背景（タイトルと同じ夜空にして、地続きに見せる）
      const g = c.createLinearGradient(0, 0, 0, G.H);
      g.addColorStop(0, '#080a18');
      g.addColorStop(0.6, '#12162e');
      g.addColorStop(1, '#1a1024');
      c.fillStyle = g; c.fillRect(0, 0, G.W, G.H);
      for (let i = 0; i < 60; i++) {
        const x = (i * 137) % G.W, y = (i * 89) % 300;
        c.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(G.time / 900 + i));
        c.fillStyle = '#f2f0e5';
        c.fillRect(x, y, 2, 2);
      }
      c.globalAlpha = 1;

      G.text('なまえを つけてください', G.W / 2, 30, { size: 24, align: 'center' });

      // 主人公の立ち絵と、入力中の名前
      const hero = (G.SPR.hero || [])[0];
      if (hero) c.drawImage(hero[Math.floor(G.time / 400) % 2], 0, 0, 16, G.CH, 92, 74, 60, 90);

      const nw = 400, nx = 176, ny = 86;
      G.win(nx, ny, nw, 62);
      const shown = this.name || '';
      G.text(shown, nx + 26, ny + 18, { size: 28 });
      // カーソル（次に入る位置）
      if (Math.floor(G.time / 320) % 2 && shown.length < MAXLEN) {
        c.fillStyle = '#e8c85c';
        c.fillRect(nx + 26 + shown.length * 30, ny + 46, 24, 3);
      }
      G.text(MAXLEN - shown.length + '', nx + nw - 26, ny + 22, { size: 16, align: 'right', color: '#8d94a4' });

      // かな表
      const tx = (G.W - COLS * CELL) / 2, ty = 176;
      G.win(tx - 16, ty - 16, COLS * CELL + 32, ROWS * CELL + 32);
      const tbl = this.table();
      for (let y = 0; y < ROWS; y++)
        for (let x = 0; x < COLS; x++) {
          const on = this.row === 0 && this.cx === x && this.cy === y;
          if (on) {
            c.fillStyle = 'rgba(232,200,92,0.22)';
            c.fillRect(tx + x * CELL + 2, ty + y * CELL - 2, CW, CW);
            c.strokeStyle = '#e8c85c'; c.lineWidth = 2;
            c.strokeRect(tx + x * CELL + 2.5, ty + y * CELL - 1.5, CW, CW);
          }
          G.text(tbl[y][x], tx + x * CELL + 2 + CW / 2, ty + y * CELL + 8,
            { size: 26, align: 'center', color: on ? '#ffffff' : '#f2f0e5' });
        }

      // 機能ボタン
      const fy = ty + ROWS * CELL + 36;
      G.win(tx - 16, fy - 12, COLS * CELL + 32, 62);
      let fxp = tx + 6;
      FUNCS.forEach(function (f, i) {
        const w = f.length > 2 ? 148 : 62;
        const on = G.naming.row === 1 && G.naming.cx === i;
        if (on) {
          c.fillStyle = 'rgba(232,200,92,0.22)';
          c.fillRect(fxp, fy, w, 40);
          c.strokeStyle = '#e8c85c'; c.lineWidth = 2;
          c.strokeRect(fxp + 0.5, fy + 0.5, w, 40);
        }
        G.text(f, fxp + w / 2, fy + 8, { size: f.length > 2 ? 19 : 24, align: 'center' });
        fxp += w + 10;
      });

      G.text('やじるし＝えらぶ　Ｚ＝きめる　Ｘ＝1もじ けす',
        G.W / 2, G.H - 30, { size: 15, align: 'center', color: '#7d8494' });
    },
  };
})();
