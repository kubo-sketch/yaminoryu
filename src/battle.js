/* =====================================================================
   battle.js — ターン制コマンドバトル（ドラクエ型・一人称／敵が正面）
   ---------------------------------------------------------------------
   進行は「行動キュー」で管理する。各行動は最後に必ず B.next() を呼ぶ。
   ===================================================================== */
(function () {
  'use strict';
  const G = (window.G = window.G || {});

  const CMDS = ['たたかう', 'じゅもん', 'どうぐ', 'にげる'];

  /* ---------------- ダメージ式 ---------------- */
  // ドラクエ準拠：(こうげき力 - しゅび力/2) に ±15% の幅
  function damage(atk, def) {
    const base = atk - def / 2;
    if (base <= 1) return Math.random() < 0.45 ? 0 : 1;      // 硬すぎる相手
    return Math.max(1, Math.floor(base * (0.85 + Math.random() * 0.3)));
  }
  function isCrit() { return Math.random() < 1 / 32; }
  // バランス検証スクリプトから同じ式を使えるように公開する（式の二重管理を避ける）
  G.damage = damage;
  G.isCrit = isCrit;

  G.atkOf = function (p) { return p.baseAtk + G.WEAPONS[p.weapon].atk; };
  G.defOf = function (p) { return p.baseDef + G.ARMORS[p.armor].def; };

  const B = G.battle = {
    enemy: null, def: null, isBoss: false,
    phase: 'msg',        // msg | command | spell | item | anim | over
    cmd: 0, sub: 0, subList: [],
    queue: [],
    shakeE: 0, blinkE: 0, lunge: 0, deadE: 0,
    canFlee: true,

    /* ---------------- 開始 ---------------- */
    start: function (enemyId, isBoss) {
      const d = G.ENEMIES[enemyId];
      this.def = d;
      this.enemy = { id: enemyId, name: d.name, hp: d.hp, maxhp: d.hp, sleep: 0 };
      this.isBoss = !!isBoss;
      this.canFlee = d.flee !== false;
      this.cmd = 0; this.sub = 0;
      this.shakeE = 0; this.blinkE = 0; this.lunge = 0; this.deadE = 0;
      this.queue = [];
      G.state = 'battle';
      G.audio.se('encounter');
      G.audio.scene(null, isBoss ? 'boss' : 'battle');
      G.fx.flash('#ffffff', 220);
      const self = this;
      this.phase = 'msg';
      G.msg.show(d.name + 'が あらわれた！', function () { self.phase = 'command'; });
    },

    /* ---------------- 行動キュー ---------------- */
    run: function (list) {
      this.queue = list;
      this.phase = 'msg';
      this.next();
    },
    next: function () {
      if (this.queue.length) {
        const f = this.queue.shift();
        f();
        return;
      }
      // キューが空 → 決着判定
      if (this.enemy.hp <= 0) { this.doWin(); return; }
      if (G.player.hp <= 0) { this.doLose(); return; }
      this.phase = 'command';
      this.cmd = 0;
    },
    say: function (text, after) {
      const self = this;
      G.msg.show(text, after || function () { self.next(); });
    },
    wait: function (ms, after) {
      const self = this;
      this.phase = 'anim';
      setTimeout(function () { (after || function () { self.next(); })(); }, ms);
    },

    /* =====================================================================
       プレイヤーの行動
       ===================================================================== */
    doAttack: function () {
      const self = this, p = G.player, e = this.enemy;
      const acts = [];
      acts.push(function () {
        const crit = isCrit();
        const dmg = crit ? Math.floor(G.atkOf(p) * (0.95 + Math.random() * 0.2))
          : damage(G.atkOf(p), self.def.def);
        self.lunge = 200;
        G.audio.se(crit ? 'crit' : dmg > 0 ? 'hit' : 'miss');
        if (dmg > 0) { self.blinkE = 260; self.shakeE = 220; }
        e.hp -= dmg;
        if (e.sleep > 0 && dmg > 0 && Math.random() < 0.4) e.sleep = 0;
        let t = p.name + 'の こうげき！\n';
        if (crit) t = p.name + 'の こうげき！\nかいしんの いちげき！！\n';
        t += dmg > 0 ? e.name + 'に ' + dmg + 'の ダメージ！' : 'ミス！ ダメージを あたえられない！';
        self.say(t);
      });
      this.enemyPhase(acts);
      this.run(acts);
    },

    doSpell: function (id) {
      const self = this, p = G.player, e = this.enemy;
      const sp = G.SPELLS[id];
      if (p.mp < sp.mp) {
        G.audio.se('cancel');
        this.say('MPが たりない！', function () { self.phase = 'command'; });
        return;
      }
      p.mp -= sp.mp;
      const acts = [];
      acts.push(function () {
        G.audio.se(sp.kind === 'heal' ? 'heal' : sp.kind === 'sleep' ? 'sleep' : 'spell');
        let t = p.name + 'は ' + sp.name + 'を となえた！\n';
        if (sp.kind === 'heal') {
          const before = p.hp;
          p.hp = Math.min(p.maxhp, p.hp + sp.power());
          t += 'HPが ' + (p.hp - before) + ' かいふくした。';
        } else if (sp.kind === 'attack') {
          const dmg = Math.max(1, Math.floor(sp.power() * (0.9 + Math.random() * 0.2)));
          e.hp -= dmg;
          self.blinkE = 300; self.shakeE = 240;
          G.fx.flash('#ffcc66', 160);
          t += e.name + 'に ' + dmg + 'の ダメージ！';
          if (e.sleep > 0) e.sleep = 0;
        } else if (sp.kind === 'sleep') {
          if (self.isBoss ? Math.random() < 0.12 : Math.random() < 0.62) {
            e.sleep = 2 + G.rnd(3);
            t += e.name + 'は ねむってしまった！';
          } else {
            t += e.name + 'には きかなかった！';
          }
        }
        self.say(t);
      });
      this.enemyPhase(acts);
      this.run(acts);
    },

    doItem: function (id) {
      const self = this, p = G.player;
      const it = G.ITEMS[id];
      if (!p.items[id]) { G.audio.se('cancel'); this.phase = 'command'; return; }
      p.items[id]--;
      if (p.items[id] <= 0) delete p.items[id];
      const acts = [];
      acts.push(function () {
        G.audio.se('heal');
        self.say(it.use(p));
      });
      this.enemyPhase(acts);
      this.run(acts);
    },

    doFlee: function () {
      const self = this, p = G.player;
      if (!this.canFlee) {
        const acts = [function () { self.say(p.name + 'は にげだした！\nしかし まわりこまれて しまった！'); }];
        this.enemyPhase(acts);
        this.run(acts);
        return;
      }
      const rate = this.def.agi ? 0.45 : 0.68;
      if (Math.random() < rate) {
        G.audio.se('flee');
        this.phase = 'over';
        this.say(p.name + 'は にげだした！', function () { G.endBattle('flee'); });
      } else {
        const acts = [function () { self.say(p.name + 'は にげだした！\nしかし まわりこまれて しまった！'); }];
        this.enemyPhase(acts);
        this.run(acts);
      }
    },

    /* =====================================================================
       敵の行動（プレイヤー行動のあとに acts へ積む）
       ===================================================================== */
    enemyPhase: function (acts) {
      const self = this, p = G.player, e = this.enemy, d = this.def;

      acts.push(function () {
        if (e.hp <= 0) { self.next(); return; }        // 倒れているので行動なし

        if (e.sleep > 0) {
          e.sleep--;
          self.say(e.name + 'は ねむっている。');
          return;
        }

        // ボスのブレス
        if (d.breath && Math.random() < d.breath) {
          const dmg = 26 + G.rnd(14);
          p.hp = Math.max(0, p.hp - dmg);
          G.audio.se('fire');
          G.fx.flash('#ff7a2a', 320);
          G.fx.shake(9, 380);
          self.say(e.name + 'は ほのおの いきを はいた！\n' + p.name + 'は ' + dmg + 'の ダメージ！');
          return;
        }
        // 敵の呪文
        if (d.spell && Math.random() < d.spell.rate) {
          const sp = G.SPELLS[d.spell.id];
          const dmg = Math.max(1, Math.floor(sp.power() * 0.85));
          p.hp = Math.max(0, p.hp - dmg);
          G.audio.se('spell');
          G.fx.flash('#c07ae8', 260);
          G.fx.shake(6, 260);
          self.say(e.name + 'は ' + sp.name + 'を となえた！\n' + p.name + 'は ' + dmg + 'の ダメージ！');
          return;
        }
        // 通常攻撃
        const dmg = damage(d.atk, G.defOf(p));
        p.hp = Math.max(0, p.hp - dmg);
        if (dmg > 0) {
          G.audio.se('damage');
          G.fx.flash('#e03c2c', 240);
          G.fx.shake(7, 280);
        } else {
          G.audio.se('miss');
        }
        self.say(e.name + 'の こうげき！\n' +
          (dmg > 0 ? p.name + 'は ' + dmg + 'の ダメージを うけた！' : p.name + 'は みを かわした！'));
      });
    },

    /* =====================================================================
       決着
       ===================================================================== */
    doWin: function () {
      const self = this, p = G.player, d = this.def;
      this.phase = 'over';
      this.deadE = 1;
      G.audio.stopBgm();
      G.audio.se('win');
      p.exp += d.exp; p.gold += d.gold;

      const lines = [
        this.enemy.name + 'を たおした！',
        p.name + 'は ' + d.exp + 'ポイントの\nけいけんちを かくとくした！',
        d.gold + 'ゴールドを てにいれた！',
      ];
      G.msg.show(lines, function () {
        const ups = G.checkLevelUp();
        if (ups.length) {
          G.audio.se('levelup');
          G.msg.show(ups, function () { self.finishWin(); });
        } else {
          self.finishWin();
        }
      });
    },
    finishWin: function () {
      if (this.isBoss) {
        G.flags.bossDead = 1;
        G.endBattle('boss');
      } else {
        G.endBattle('win');
      }
    },

    doLose: function () {
      this.phase = 'over';
      G.audio.stopBgm();
      G.audio.se('dead');
      G.fx.flash('#000000', 400);
      const p = G.player;
      G.msg.show([
        p.name + 'は しんでしまった！',
      ], function () { G.endBattle('lose'); });
    },

    /* =====================================================================
       更新
       ===================================================================== */
    update: function (dt) {
      if (this.shakeE > 0) this.shakeE -= dt;
      if (this.blinkE > 0) this.blinkE -= dt;
      if (this.lunge > 0) this.lunge -= dt;

      if (G.msg.active) { G.msg.update(dt); return; }
      if (this.phase === 'anim' || this.phase === 'over') return;

      if (this.phase === 'command') {
        if (G.pressed('left') && this.cmd % 2 === 1) { this.cmd--; G.audio.se('select'); }
        else if (G.pressed('right') && this.cmd % 2 === 0) { this.cmd++; G.audio.se('select'); }
        else if (G.pressed('up') && this.cmd >= 2) { this.cmd -= 2; G.audio.se('select'); }
        else if (G.pressed('down') && this.cmd < 2) { this.cmd += 2; G.audio.se('select'); }

        if (G.pressed('ok')) {
          G.audio.se('confirm');
          const c = this.cmd;
          if (c === 0) this.doAttack();
          else if (c === 1) this.openSub('spell');
          else if (c === 2) this.openSub('item');
          else this.doFlee();
        }
        return;
      }

      if (this.phase === 'spell' || this.phase === 'item') {
        const n = this.subList.length;
        if (G.pressed('up')) { this.sub = (this.sub - 1 + n) % n; G.audio.se('select'); }
        if (G.pressed('down')) { this.sub = (this.sub + 1) % n; G.audio.se('select'); }
        if (G.pressed('cancel')) { G.audio.se('cancel'); this.phase = 'command'; return; }
        if (G.pressed('ok')) {
          const item = this.subList[this.sub];
          if (!item || item.disabled) { G.audio.se('cancel'); return; }
          G.audio.se('confirm');
          if (this.phase === 'spell') this.doSpell(item.id);
          else this.doItem(item.id);
        }
      }
    },

    openSub: function (kind) {
      const p = G.player;
      this.sub = 0;
      this.subList = [];
      if (kind === 'spell') {
        p.spells.forEach(function (id) {
          const sp = G.SPELLS[id];
          if (!sp.battle) return;
          G.battle.subList.push({ id: id, label: sp.name, right: 'MP' + sp.mp, disabled: p.mp < sp.mp });
        });
        if (!this.subList.length) {
          const self = this;
          G.audio.se('cancel');
          this.say('つかえる じゅもんが ない。', function () { self.phase = 'command'; });
          return;
        }
        this.phase = 'spell';
      } else {
        Object.keys(p.items).forEach(function (id) {
          const it = G.ITEMS[id];
          if (!it.battle) return;
          G.battle.subList.push({ id: id, label: it.name, right: '×' + p.items[id] });
        });
        if (!this.subList.length) {
          const self = this;
          G.audio.se('cancel');
          this.say('どうぐを もっていない。', function () { self.phase = 'command'; });
          return;
        }
        this.phase = 'item';
      }
    },

    /* =====================================================================
       描画
       ===================================================================== */
    draw: function () {
      const c = G.ctx, e = this.enemy, d = this.def;

      // 背景（洞窟なら暗い岩肌、屋外なら夜空）
      const indoor = G.MAPS[G.player.map].indoor;
      const g = c.createLinearGradient(0, 0, 0, G.H);
      if (indoor) { g.addColorStop(0, '#1a1720'); g.addColorStop(1, '#0a0a10'); }
      else { g.addColorStop(0, '#101a2e'); g.addColorStop(1, '#060810'); }
      c.fillStyle = g;
      c.fillRect(0, 0, G.W, G.H);
      // 地面
      c.fillStyle = indoor ? '#2a2620' : '#1d2a1a';
      c.fillRect(0, 396, G.W, G.H - 396);
      c.fillStyle = 'rgba(255,255,255,0.05)';
      c.fillRect(0, 396, G.W, 3);

      // 敵。地面(y=400)から上へ伸ばすので、敵名ウィンドウ(〜94px)に
      // かからない高さで頭打ちにする。これが無いと大きい敵の頭が切れる。
      const img = G.ENEMY[d.spr];
      const MAXH = 296;
      const sc = Math.min((d.scale || 2) * G.S, MAXH / img.height);
      const w = img.width * sc, h = img.height * sc;
      let ex = (G.W - w) / 2;
      let ey = 400 - h;
      if (this.lunge > 0) ey += Math.sin((1 - this.lunge / 200) * Math.PI) * 14;
      if (this.shakeE > 0) ex += (Math.random() * 2 - 1) * 7;
      const blink = this.blinkE > 0 && Math.floor(this.blinkE / 60) % 2 === 0;
      const dying = this.deadE && e.hp <= 0;

      c.save();
      if (dying) c.globalAlpha = 0.45;
      // 足元の影
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.beginPath();
      c.ellipse(G.W / 2, 400, w * 0.34, 12, 0, 0, Math.PI * 2);
      c.fill();
      if (!blink) {
        c.drawImage(img, 0, 0, img.width, img.height, ex | 0, ey | 0, w, h);
      } else {
        // 被弾フラッシュ（白抜き）
        c.globalAlpha = 0.9;
        c.drawImage(img, 0, 0, img.width, img.height, ex | 0, ey | 0, w, h);
        c.globalCompositeOperation = 'source-atop';
        c.fillStyle = '#ffffff';
        c.fillRect(ex, ey, w, h);
        c.globalCompositeOperation = 'source-over';
      }
      c.restore();

      // 敵名＋HPゲージ（ボスのみHPを見せる）
      const nw = 260, nx = (G.W - nw) / 2;
      G.win(nx, 16, nw, this.isBoss ? 78 : 54);
      G.text(e.name, G.W / 2, 30, { size: 22, align: 'center' });
      if (this.isBoss) {
        const bw = nw - 56, bx = nx + 28, by = 62;
        c.fillStyle = '#3a1c1c'; c.fillRect(bx, by, bw, 12);
        c.fillStyle = '#d63b30';
        c.fillRect(bx, by, Math.max(0, (bw * e.hp) / e.maxhp) | 0, 12);
        c.strokeStyle = '#f2f0e5'; c.lineWidth = 2;
        c.strokeRect(bx - 1, by - 1, bw + 2, 14);
      }

      G.drawHud();

      // コマンド／サブメニュー／メッセージ
      if (this.phase === 'command') this.drawCmd();
      else if (this.phase === 'spell' || this.phase === 'item') { this.drawCmd(true); this.drawSub(); }
      else G.msg.draw();
    },

    drawCmd: function (dim) {
      const x = 14, y = G.H - 172, w = 340, h = 158;
      G.win(x, y, w, h);
      const col = dim ? '#7d8494' : '#f2f0e5';
      for (let i = 0; i < 4; i++) {
        const cx = x + 40 + (i % 2) * 150;
        const cy = y + 32 + Math.floor(i / 2) * 58;
        G.text(CMDS[i], cx, cy, { size: 23, color: col });
        if (!dim && this.cmd === i) G.cursor(cx - 30, cy);
      }
    },
    drawSub: function () {
      const x = 366, y = G.H - 172, w = 340, h = 158;
      G.win(x, y, w, h);
      const n = Math.min(4, this.subList.length);
      const top = Math.max(0, Math.min(this.sub - 1, this.subList.length - n));
      for (let i = 0; i < n; i++) {
        const it = this.subList[top + i];
        const cy = y + 24 + i * 32;
        G.text(it.label, x + 46, cy, { size: 21, color: it.disabled ? '#6d7484' : '#f2f0e5' });
        if (it.right) G.text(it.right, x + w - 28, cy, { size: 19, align: 'right', color: '#b8c4d4' });
        if (this.sub === top + i) G.cursor(x + 16, cy);
      }
      if (this.subList.length > n) G.text('▼', x + w - 26, y + h - 30, { size: 16, color: '#e8c34a' });
    },
  };

  /* =====================================================================
     レベルアップ
     ===================================================================== */
  G.checkLevelUp = function () {
    const p = G.player, out = [];
    while (p.lv < G.LEVELS.length && p.exp >= G.LEVELS[p.lv].exp) {
      p.lv++;
      const L = G.LEVELS[p.lv - 1];
      const dh = L.hp - p.maxhp, dm = L.mp - p.maxmp;
      const da = L.atk - p.baseAtk, dd = L.def - p.baseDef;
      p.maxhp = L.hp; p.maxmp = L.mp; p.baseAtk = L.atk; p.baseDef = L.def;
      p.hp = Math.min(p.maxhp, p.hp + dh);
      p.mp = Math.min(p.maxmp, p.mp + dm);
      let t = 'レベルが ' + p.lv + 'に あがった！\n';
      t += 'ちからが ' + da + ' HPが ' + dh + ' あがった。';
      out.push(t);
      if (dm > 0 || dd > 0) out.push('みのまもりが ' + dd + '\nさいだいMPが ' + dm + ' あがった。');
      if (L.learn) out.push('じゅもん「' + G.SPELLS[L.learn].name + '」を\nおぼえた！');
      if (!p.spells.includes(L.learn) && L.learn) p.spells.push(L.learn);
    }
    return out;
  };
})();
