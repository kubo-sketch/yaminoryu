/* =====================================================================
   field.js — マップ探索（歩行・当たり判定・会話・イベント・エンカウント）
   ===================================================================== */
(function () {
  'use strict';
  const G = (window.G = window.G || {});

  const MOVE_MS = 145;          // 1マス歩くのにかかる時間
  const ENC_GRACE = 3;          // 戦闘後この歩数はエンカウントしない
  const DOWN = 0, LEFT = 1, RIGHT = 2, UP = 3;
  const DX = [0, -1, 1, 0], DY = [1, 0, 0, -1];

  G.field = {
    map: null,
    cam: { x: 0, y: 0 },
    grace: 0,
    busy: false,               // 会話・イベント処理中は歩けない

    /* ---------------- マップ切り替え ---------------- */
    enter: function (mapId, x, y, dir) {
      const m = G.MAPS[mapId];
      this.map = m;
      const p = G.player;
      p.map = mapId;
      p.x = x; p.y = y;
      p.dir = dir === undefined ? p.dir : dir;
      p.moving = false; p.moveT = 0; p.frame = 0;
      this.grace = ENC_GRACE;
      this.busy = false;
      // NPCの初期向きを戻す
      m.npcs.forEach(function (n) { if (n.dir0 === undefined) n.dir0 = n.dir; n.dir = n.dir0; });
      this.updateCam(true);
      G.audio.scene(mapId);
    },

    /* ---------------- タイル参照 ---------------- */
    tileAt: function (x, y) {
      const m = this.map;
      if (!m || x < 0 || y < 0 || x >= m.w || y >= m.h) return null;
      return G.TILEDEF[m.rows[y][x]] || null;
    },
    npcAt: function (x, y) {
      const list = this.map.npcs;
      for (let i = 0; i < list.length; i++) if (list[i].x === x && list[i].y === y) return list[i];
      return null;
    },
    eventAt: function (x, y) {
      const list = this.map.events;
      for (let i = 0; i < list.length; i++) if (list[i].x === x && list[i].y === y) return list[i];
      return null;
    },
    walkable: function (x, y) {
      const t = this.tileAt(x, y);
      if (!t || !t.walk) return false;
      if (this.npcAt(x, y)) return false;
      return true;
    },

    /* ---------------- カメラ ---------------- */
    updateCam: function (snap) {
      const p = G.player, T = G.T, m = this.map;
      let tx = p.x * T + (p.moving ? DX[p.dir] * T * (p.moveT / MOVE_MS) : 0);
      let ty = p.y * T + (p.moving ? DY[p.dir] * T * (p.moveT / MOVE_MS) : 0);
      p.rx = tx; p.ry = ty;                       // 描画用の実座標
      let cx = tx + T / 2 - G.W / 2;
      let cy = ty + T / 2 - G.H / 2;
      const maxX = m.w * T - G.W, maxY = m.h * T - G.H;
      cx = maxX <= 0 ? maxX / 2 : G.clamp(cx, 0, maxX);
      cy = maxY <= 0 ? maxY / 2 : G.clamp(cy, 0, maxY);
      this.cam.x = cx; this.cam.y = cy;
    },

    /* ---------------- 毎フレーム ---------------- */
    update: function (dt) {
      const p = G.player;

      if (G.msg.active) { G.msg.update(dt); this.updateCam(); return; }
      // 確認ダイアログ（やどやの「とまりますか？」など）はフィールド上に出る
      if (G.modal.active) { G.modal.update(); this.updateCam(); return; }
      if (this.busy || G.fx.busy) { this.updateCam(); return; }

      // 歩行中
      if (p.moving) {
        p.moveT += dt;
        p.frame = p.moveT < MOVE_MS / 2 ? 1 : 0;
        if (p.moveT >= MOVE_MS) {
          p.moving = false; p.moveT = 0; p.frame = 0;
          p.x += DX[p.dir]; p.y += DY[p.dir];
          p.steps++;
          if (p.holy > 0) p.holy--;
          if (this.grace > 0) this.grace--;
          this.updateCam();
          if (this.onStep()) return;             // 踏んだ瞬間のイベント/戦闘
        }
        this.updateCam();
        return;
      }

      // メニュー
      if (G.pressed('cancel')) { G.audio.se('confirm'); G.openMenu(); return; }
      // 調べる・話す
      if (G.pressed('ok')) { this.interact(); return; }

      // 方向入力
      let d = -1;
      if (G.held.up) d = UP;
      else if (G.held.down) d = DOWN;
      else if (G.held.left) d = LEFT;
      else if (G.held.right) d = RIGHT;

      if (d >= 0) {
        p.dir = d;
        const nx = p.x + DX[d], ny = p.y + DY[d];
        if (this.walkable(nx, ny)) {
          p.moving = true; p.moveT = 0;
          G.audio.se('step');
        } else {
          p.frame = 0;
        }
      }
      this.updateCam();
    },

    /* ---------------- 踏んだマスの処理 ---------------- */
    onStep: function () {
      const p = G.player;
      const ev = this.eventAt(p.x, p.y);
      if (ev) {
        if (ev.type === 'warp') {
          if (ev.requires && !G.flags[ev.requires]) {
            G.msg.show(ev.deny || 'とおれない。');
            return true;
          }
          this.warp(ev);
          return true;
        }
        if (ev.type === 'boss' && !G.flags.bossDead) {
          this.busy = true;
          const self = this;
          G.msg.show(['ずしり――\nつめたい かぜが ふきぬけた。'], function () {
            self.busy = false;
            G.startBattle(ev.enemy, true);
          });
          return true;
        }
      }
      // 通常エンカウント
      const encDef = typeof this.map.enc === 'function' ? this.map.enc(p.x, p.y) : this.map.enc;
      if (encDef && this.grace <= 0) {
        const t = this.tileAt(p.x, p.y);
        if (t && t.enc) {
          let rate = encDef.rate;
          if (p.holy > 0) rate *= 0.35;
          if (Math.random() < rate) {
            G.startBattle(G.pick(encDef.table), false);
            return true;
          }
        }
      }
      return false;
    },

    warp: function (ev) {
      const self = this;
      this.busy = true;
      G.audio.se('door');
      G.fx.fadeOut(function () {
        self.enter(ev.to, ev.tx, ev.ty, ev.dir);
        G.fx.fadeIn(function () { self.busy = false; }, 0.006);
      }, 0.006);
    },

    /* ---------------- 「しらべる／はなす」 ---------------- */
    interact: function () {
      const p = G.player;
      const fx = p.x + DX[p.dir], fy = p.y + DY[p.dir];

      // 目の前のNPC
      const npc = this.npcAt(fx, fy);
      if (npc) {
        npc.dir = [UP, RIGHT, LEFT, DOWN][p.dir];    // プレイヤーの方を向く
        G.audio.se('confirm');
        if (npc.act) { G.npcAction(npc); return; }
        const lines = typeof npc.talk === 'function' ? npc.talk() : npc.talk;
        G.msg.show(lines);
        return;
      }

      // 目の前のイベント（看板・宝箱）
      const ev = this.eventAt(fx, fy) || this.eventAt(p.x, p.y);
      if (ev) {
        if (ev.type === 'sign') { G.audio.se('confirm'); G.msg.show(ev.text); return; }
        if (ev.type === 'chest') { this.openChest(ev); return; }
      }
      G.audio.se('cancel');
      G.msg.show('なにも みつからなかった。');
    },

    openChest: function (ev) {
      if (G.flags.chests[ev.id]) {
        G.audio.se('cancel');
        G.msg.show('からっぽだ。');
        return;
      }
      G.flags.chests[ev.id] = 1;
      G.audio.se('open');
      const p = G.player;
      let text = 'たからばこを あけた！\n';
      if (ev.gold) { p.gold += ev.gold; text += ev.gold + 'ゴールドを てにいれた！'; }
      else if (ev.item) {
        const n = ev.n || 1;
        p.items[ev.item] = (p.items[ev.item] || 0) + n;
        text += G.ITEMS[ev.item].name + 'を ' + n + 'こ てにいれた！';
      } else if (ev.weapon !== undefined) {
        const w = G.WEAPONS[ev.weapon];
        text += w.name + 'を てにいれた！';
        if (ev.weapon > p.weapon) { p.weapon = ev.weapon; text += '\nさっそく そうびした。'; }
      } else if (ev.armor !== undefined) {
        const a = G.ARMORS[ev.armor];
        text += a.name + 'を てにいれた！';
        if (ev.armor > p.armor) { p.armor = ev.armor; text += '\nさっそく そうびした。'; }
      }
      G.msg.show(text);
    },

    /* ---------------- オートタイル ----------------
       上下左右に「同じグループ」があるかを4ビットに畳んで、
       境界の描き分け済みタイルを選ぶ。画面外は同種とみなす
       （マップの縁に不要な縁取りを出さないため）。            */
    autoMask: function (mx, my, grp) {
      const m = this.map;
      const same = function (x, y) {
        if (x < 0 || y < 0 || x >= m.w || y >= m.h) return true;
        const d = G.TILEDEF[m.rows[y][x]];
        return !!d && (d.auto === grp || d.group === grp);
      };
      return (same(mx, my - 1) ? 1 : 0) | (same(mx + 1, my) ? 2 : 0)
        | (same(mx, my + 1) ? 4 : 0) | (same(mx - 1, my) ? 8 : 0);
    },

    tileImage: function (mx, my, ch, def, wf) {
      if (ch === '$') {
        const ev = this.eventAt(mx, my);
        return G.TILE[ev && G.flags.chests[ev.id] ? 'chestOpen' : 'chest'];
      }
      const t = G.TILE[def.tile];
      if (!t) return null;
      // 模様違いはマップ座標から決める（毎フレーム同じ絵になるように）
      const vari = (mx * 7 + my * 13 + ((mx * my) & 7)) & 0xffff;
      if (def.auto) {
        const mask = this.autoMask(mx, my, def.auto);
        const set = def.anim ? t[wf] : t[vari % t.length];
        return set[mask];
      }
      if (Array.isArray(t)) return def.anim ? t[wf] : t[vari % t.length];
      return t;
    },

    /* ---------------- 描画 ---------------- */
    draw: function () {
      const c = G.ctx, T = G.T, TS = G.TS, CH = G.CH, m = this.map;
      const cam = this.cam;
      const x0 = Math.floor(cam.x / T), y0 = Math.floor(cam.y / T);
      const ox = -(cam.x - x0 * T), oy = -(cam.y - y0 * T);
      const lift = (CH - TS) * G.S;                 // キャラは上に伸びる分だけ持ち上げる

      c.fillStyle = m.indoor ? '#0d0b14' : '#1b2a1a';
      c.fillRect(0, 0, G.W, G.H);

      const wf = Math.floor(G.time / 220) % 4;      // 水のアニメ

      for (let j = 0; j <= G.VH; j++) {
        for (let i = 0; i <= G.VW; i++) {
          const mx = x0 + i, my = y0 + j;
          if (mx < 0 || my < 0 || mx >= m.w || my >= m.h) continue;
          const ch = m.rows[my][mx];
          const def = G.TILEDEF[ch];
          if (!def) continue;
          const img = this.tileImage(mx, my, ch, def, wf);
          if (!img) continue;
          c.drawImage(img, 0, 0, TS, TS, (ox + i * T) | 0, (oy + j * T) | 0, T, T);
        }
      }

      // キャラは足元のY順に並べて描く（下にいる者が手前になる）
      const p = G.player;
      const actors = [];
      m.npcs.forEach(function (n) {
        const sx = n.x * T - cam.x, sy = n.y * T - cam.y;
        if (sx < -T * 2 || sy < -T * 2 || sx > G.W + T || sy > G.H + T) return;
        const set = G.SPR[n.spr];
        if (set) actors.push({ x: sx, y: sy, img: set[n.dir][0] });
      });
      const psx = p.rx - cam.x, psy = p.ry - cam.y;   // 松明の中心にも使う
      actors.push({ x: psx, y: psy, img: G.SPR.hero[p.dir][p.frame] });
      actors.sort(function (a, b) { return a.y - b.y; });

      // 落ち影を先にまとめて敷く（キャラ同士で影が上書きし合わないように）
      c.fillStyle = 'rgba(10,8,20,0.30)';
      actors.forEach(function (a) {
        c.beginPath();
        c.ellipse(a.x + T / 2, a.y + T - 5, T * 0.30, T * 0.12, 0, 0, Math.PI * 2);
        c.fill();
      });
      actors.forEach(function (a) {
        c.drawImage(a.img, 0, 0, TS, CH, a.x | 0, (a.y - lift) | 0, T, CH * G.S);
      });

      // 洞窟の暗さ（松明の届く範囲だけ見える）
      if (m.dark) {
        const cx = psx + T / 2, cy = psy + T / 2;
        const g = c.createRadialGradient(cx, cy, T * 1.1, cx, cy, T * 4.4);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(0.55, 'rgba(0,0,0,0.45)');
        g.addColorStop(1, 'rgba(0,0,0,0.9)');
        c.fillStyle = g;
        c.fillRect(0, 0, G.W, G.H);
      }

      G.drawHud();
      G.msg.draw();
      if (G.modal.active) G.modal.draw();
    },
  };

  /* =====================================================================
     HUD（左上の常時ステータス）
     ===================================================================== */
  G.drawHud = function () {
    const p = G.player;
    const w = 208, h = 128;
    G.win(12, 12, w, h);
    G.text('レベル', 30, 28, { size: 19, color: '#b8c4d4' });
    G.text(String(p.lv), 172, 28, { size: 21, align: 'right' });
    G.text('HP', 30, 54, { size: 19, color: '#b8c4d4' });
    G.text(p.hp + '/' + p.maxhp, 190, 54, { size: 21, align: 'right', color: p.hp <= p.maxhp * 0.25 ? '#e8664a' : '#f2f0e5' });
    G.text('MP', 30, 80, { size: 19, color: '#b8c4d4' });
    G.text(p.mp + '/' + p.maxmp, 190, 80, { size: 21, align: 'right' });
    G.text('G', 30, 106, { size: 19, color: '#b8c4d4' });
    G.text(String(p.gold), 190, 106, { size: 21, align: 'right', color: '#e8c34a' });
  };

  /* =====================================================================
     NPCの特殊アクション
     ===================================================================== */
  G.npcAction = function (npc) {
    const a = npc.act;
    if (a.type === 'shop') { G.openShop(a.shop); return; }
    if (a.type === 'inn') { G.openInn(); return; }
    if (a.type === 'elder') { G.elderTalk(); return; }
  };

  /* ---------------- 村長（進行フラグとセーブ） ---------------- */
  G.elderTalk = function () {
    const p = G.player;
    if (G.flags.bossDead) {
      G.msg.show([
        'おお ' + p.name + 'よ……\nやみのりゅうを たおしたのか。',
        'この村は すくわれた。\nありがとう。ほんとうに ありがとう。',
      ]);
      return;
    }
    if (!G.flags.toldByElder) {
      G.flags.toldByElder = 1;
      G.msg.show([
        'よく きてくれた ' + p.name + '。\nわしが この村の そんちょうだ。',
        'きたの ほらあなに\n「やみのりゅう」が すみついた。',
        'あれが めをさましてから\nまものが ふえて こまっている。',
        'たのむ。\nあの りゅうを たおしてくれ。',
        'ほらあなの ふういんを といた。\nきたへ すすめば たどりつく。',
        'ゆけ。ぶじを いのっている。\n（ここまでの ぼうけんを きろくした）',
      ], function () {
        G.saveGame();
        G.audio.se('levelup');
      });
      return;
    }
    G.msg.show([
      'ほらあなは きたの やまの なかだ。',
      'ここまでの ぼうけんを きろくしておこう。',
    ], function () {
      G.saveGame();
      G.audio.se('confirm');
      G.msg.show('（ぼうけんの きろくを つけた）');
    });
  };

  /* ---------------- 宿屋 ---------------- */
  G.openInn = function () {
    const p = G.player;
    G.msg.show(['やどやへ ようこそ。\n1ぱん ' + G.INN_PRICE + 'ゴールドだよ。'], function () {
      G.confirmBox('とまりますか？', function (yes) {
        if (!yes) { G.msg.show('また どうぞ。'); return; }
        if (p.gold < G.INN_PRICE) { G.msg.show('ゴールドが たりないようだね。'); return; }
        p.gold -= G.INN_PRICE;
        G.field.busy = true;
        G.audio.stopBgm();
        G.fx.fadeOut(function () {
          p.hp = p.maxhp; p.mp = p.maxmp; p.poison = 0;
          setTimeout(function () {
            G.fx.fadeIn(function () {
              G.audio.scene(p.map);
              G.audio.se('levelup');
              G.field.busy = false;
              G.msg.show('おはよう。\nHPと MPが すべて かいふくした！');
            }, 0.005);
          }, 700);
        }, 0.005);
      });
    });
  };

  /* ---------------- キメラのつばさ ---------------- */
  G.warpToTown = function () {
    G.closeMenu();
    G.field.busy = true;
    G.fx.fadeOut(function () {
      G.field.enter('town', 11, 16, 3);
      G.fx.fadeIn(function () { G.field.busy = false; }, 0.006);
    }, 0.006);
  };
})();
