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
    camOverride: null,          // 演出中はここを見る（cutscene.js が入れる）
    clampCam: function (cx, cy) {
      const T = G.T, m = this.map;
      const maxX = m.w * T - G.W, maxY = m.h * T - G.H;
      return {
        x: maxX <= 0 ? maxX / 2 : G.clamp(cx, 0, maxX),
        y: maxY <= 0 ? maxY / 2 : G.clamp(cy, 0, maxY),
      };
    },
    updateCam: function (snap) {
      const p = G.player, T = G.T;
      let tx = p.x * T + (p.moving ? DX[p.dir] * T * (p.moveT / MOVE_MS) : 0);
      let ty = p.y * T + (p.moving ? DY[p.dir] * T * (p.moveT / MOVE_MS) : 0);
      p.rx = tx; p.ry = ty;                       // 描画用の実座標
      if (this.camOverride) {
        this.cam.x = this.camOverride.x; this.cam.y = this.camOverride.y;
        return;
      }
      const c = this.clampCam(tx + T / 2 - G.W / 2, ty + T / 2 - G.H / 2);
      this.cam.x = c.x; this.cam.y = c.y;
    },

    /* ---------------- 毎フレーム ---------------- */
    update: function (dt) {
      const p = G.player;

      if (G.cut.active) { G.cut.update(dt); this.updateCam(); return; }
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
          // 毒はフィールドでも進行する。ただしHP1で止まり、歩いていて死ぬことはない
          if (p.poison && p.steps % G.POISON.stepInterval === 0 && p.hp > 1) {
            p.hp = Math.max(1, p.hp - G.POISON.stepDamage(p.maxhp));
            G.audio.se('damage');
            G.fx.flash('#8fd07f', 160);
          }
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
        if (ev.type === 'boss' && !G.flags[ev.flag || 'bossDead']) {
          this.busy = true;
          const self = this;
          const go = function () { self.busy = false; G.startBattle(ev.enemy, true); };
          if (ev.scene === 'boss') { G.sceneBoss(go); return true; }
          G.msg.show([ev.intro || 'ずしり――\nつめたい かぜが ふきぬけた。'], function () { go(); });
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

      // 目の前のイベント（看板・宝箱・読み物・拾得物）
      const ev = this.eventAt(fx, fy) || this.eventAt(p.x, p.y);
      if (ev) {
        if (ev.type === 'sign') { G.audio.se('confirm'); G.msg.show(ev.text); return; }
        if (ev.type === 'chest') { this.openChest(ev); return; }
        if (ev.type === 'read') { this.readIt(ev); return; }
        if (ev.type === 'pickup') { this.pickUp(ev); return; }
      }
      G.audio.se('cancel');
      G.msg.show('なにも みつからなかった。');
    },

    // 日記や碑文。一度読むと flags.read に残り、以後は短い文に変わる
    readIt: function (ev) {
      G.audio.se('confirm');
      const first = !G.flags.read[ev.id];
      G.flags.read[ev.id] = 1;
      const R = G.flags.read;
      // アルシオンで起源を知ると、竜の墓所への道が見えるようになる
      if (!G.flags.valleyOpen && R.a1 && R.a2 && R.a3) {
        G.flags.valleyOpen = 1;
        G.msg.show([ev.text,
          'りゅうを まつり、りゅうを つかい、\nほろんだ みやこ――',
          'では、まつられていた りゅうたちは\nどこへ いったのか。',
          '（きたの やまに「りゅうのはか」が\nあることを おもいだした）'], function () { G.saveGame(); });
        return;
      }
      G.msg.show(first ? ev.text : (ev.again || ev.text));
    },

    // クエストの証拠品。受注前は「気になるが持てない」状態にする
    pickUp: function (ev) {
      const q = G.flags.q;
      if (ev.needQuest && (q[ev.needQuest] || 0) < 1) {
        G.audio.se('cancel');
        G.msg.show(ev.locked || 'なにかが おちている。\nいまは かかわらないでおこう。');
        return;
      }
      if (q[ev.setQuest] >= ev.setValue) {
        G.audio.se('cancel');
        G.msg.show(ev.taken || 'もう なにも ない。');
        return;
      }
      q[ev.setQuest] = ev.setValue;
      G.audio.se('open');
      G.msg.show(ev.text);
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
      actors.push({ x: psx, y: psy, img: G.heroSprite()[p.dir][p.frame] });
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

      // 上レイヤー：木の葉や屋根の上部だけをキャラの後に描き直す。
      // これでキャラが木の陰に入り、平面的な貼り絵に見えなくなる。
      for (let j = -1; j <= G.VH; j++) {
        for (let i = 0; i <= G.VW; i++) {
          const mx = x0 + i, my = y0 + j;
          if (mx < 0 || my < 0 || mx >= m.w || my >= m.h) continue;
          const def = G.TILEDEF[m.rows[my][mx]];
          if (!def || !def.over) continue;
          const img = this.tileImage(mx, my, m.rows[my][mx], def, wf);
          if (!img) continue;
          c.drawImage(img, 0, 0, TS, def.over,
            (ox + i * T) | 0, (oy + j * T) | 0, T, def.over * G.S);
        }
      }

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

      // 天候。関数を許して、物語の進行で空気を変えられるようにする
      const wx = typeof m.weather === 'function' ? m.weather() : m.weather;
      if (wx === 'rain') {
        c.strokeStyle = 'rgba(150,180,225,0.42)';
        c.lineWidth = 2;
        for (let i = 0; i < 70; i++) {
          const sp = 520 + (i % 5) * 130;
          const x = ((i * 173) + (G.time * 0.10)) % (G.W + 200) - 100 + (G.time * 0.05 % 40);
          const y = ((i * 97) + (G.time * sp / 1000)) % (G.H + 60) - 30;
          c.beginPath();
          c.moveTo(x, y); c.lineTo(x - 7, y + 22);
          c.stroke();
        }
        c.fillStyle = 'rgba(30,42,70,0.24)';
        c.fillRect(0, 0, G.W, G.H);
        // 地面の跳ね返り
        c.fillStyle = 'rgba(190,215,245,0.30)';
        for (let i = 0; i < 22; i++) {
          const t = (G.time / 620 + i * 0.31) % 1;
          const x = (i * 311) % G.W, y = (i * 197) % G.H;
          const r = t * 7;
          if (t < 0.55) { c.fillRect(x - r, y, r * 2, 1); }
        }
      } else if (wx === 'fog') {
        for (let i = 0; i < 7; i++) {
          const w = 460 + i * 70, h = 130 + (i % 3) * 50;
          const x = ((G.time * (0.020 + i * 0.004) + i * 430) % (G.W + w * 2)) - w;
          const y = ((i * 173) % (G.H + h)) - h / 2;
          c.fillStyle = 'rgba(212,222,236,0.11)';
          c.beginPath();
          c.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
          c.fill();
        }
        c.fillStyle = 'rgba(206,216,232,0.13)';
        c.fillRect(0, 0, G.W, G.H);
      }

      // 環境レイヤー：地面より遅く流れる雲の影／洞窟の光の粉塵。
      // カメラと違う速度で動かすことで、平らな見下ろし画面に奥行きが出る。
      if (m.indoor) {
        c.fillStyle = 'rgba(255,236,180,0.30)';
        for (let i = 0; i < 26; i++) {
          const t = (G.time / 3600 + i * 0.13) % 1;
          const dx = (i * 137) % G.W;
          const dy = (i * 91) % G.H;
          const x = (dx + Math.sin(t * 6.28 + i) * 22 - cam.x * 0.15) % G.W;
          const y = (dy + t * 60 - cam.y * 0.15) % G.H;
          c.globalAlpha = 0.10 + 0.22 * Math.abs(Math.sin(t * 6.28 + i));
          c.fillRect((x + G.W) % G.W, (y + G.H) % G.H, 2, 2);
        }
        c.globalAlpha = 1;
      } else {
        c.fillStyle = 'rgba(12,16,30,0.16)';
        for (let i = 0; i < 5; i++) {
          const w = 420 + i * 90, h = 150 + (i % 3) * 60;
          // 雲そのものはカメラの0.55倍でしか動かない＝視差
          let x = ((G.time * 0.014 + i * 520) - cam.x * 0.55) % (G.W + w * 2) - w;
          let y = ((i * 233) % (G.H + h)) - cam.y * 0.55 % (G.H + h);
          if (y < -h) y += G.H + h;
          c.beginPath();
          c.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
          c.fill();
        }
      }

      G.drawHud();
      G.msg.draw();
      if (G.modal.active) G.modal.draw();
    },
  };

  // 防具のランクで主人公の見た目を切り替える。装備した実感を出す
  G.heroSprite = function () {
    const a = (G.player && G.player.armor) || 0;
    const key = a >= 5 ? 'hero3' : a >= 4 ? 'hero3' : a >= 3 ? 'hero2' : a >= 2 ? 'hero1' : 'hero';
    return G.SPR[key] || G.SPR.hero;
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
    if (p.poison) G.text('どく', 30, 128, { size: 17, color: '#8fd07f' });
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
      ], function () {
        G.sceneElder(function () { G.saveGame(); G.audio.se('levelup'); });
      });
      return;
    }
    // 進行に応じて「次にやること」を示す。寄り道が増えたので迷子にしない
    const R = G.flags.read || {};
    const hint = G.flags.elderDead
      ? ['たにの おくの とびらが\nひらいたと きいた。',
         'いくのか。……とめは せぬ。']
      : G.flags.galenDead
        ? ['とうだいの ぬしも たおれたか。',
           'みなとの ふなおさに あってみよ。\nうみの ことを しっている。']
        : G.flags.bossDead
          ? ['りゅうは たおれた。だが\nとうだいに まだ なにか いる。',
             'あの とうだいは 5ねんまえまで\nがくしゃが すんでいた。']
          : ['ほらあなは きたの やまの なかだ。',
             'ひがしの みなとまちでは\nよい ぶきを うっている。\nよってから いくと よい。'];
    G.msg.show(hint.concat(['ここまでの ぼうけんを きろくしておこう。']), function () {
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
          (G.party || [p]).forEach(function (m) {
            m.hp = m.maxhp; m.mp = m.maxmp; m.poison = 0; m.para = 0; m.seal = 0; m.alive = true;
          });
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
      G.field.enter('town', 15, 24, 3);
      G.fx.fadeIn(function () { G.field.busy = false; }, 0.006);
    }, 0.006);
  };
})();
