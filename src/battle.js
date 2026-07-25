/* =====================================================================
   battle.js — ターン制コマンドバトル（ドラクエ型・一人称／敵が正面）
   ---------------------------------------------------------------------
   進行は「行動キュー」で管理する。各行動は最後に必ず B.next() を呼ぶ。

   戦術性のために入れているもの
   ・敵は最大3体まで同時出現し、単体攻撃は対象を選ぶ
   ・呪文に属性（ほのお／こおり／いかずち）、敵に弱点と耐性
   ・ぼうぎょ（被ダメ半減＋MP微回復）
   ・ルカニ（しゅび力を下げる）、ラリホー（眠らせる）
   ・ボスはHPが半分を切ると形態変化して行動が激化する
   ===================================================================== */
(function () {
  'use strict';
  const G = (window.G = window.G || {});

  //  たたかう / じゅもん / ぼうぎょ / どうぐ / にげる
  const CMDS = ['たたかう', 'じゅもん', 'ぼうぎょ', 'どうぐ', 'にげる'];

  /* ---------------- ダメージ式 ---------------- */
  // ドラクエ準拠：(こうげき力 - しゅび力/2) に ±15% の幅
  function damage(atk, def) {
    const base = atk - def / 2;
    if (base <= 1) return Math.random() < 0.45 ? 0 : 1;      // 硬すぎる相手
    return Math.max(1, Math.floor(base * (0.85 + Math.random() * 0.3)));
  }
  function isCrit() { return Math.random() < 1 / 32; }
  G.damage = damage;
  G.isCrit = isCrit;

  G.atkOf = function (p) { return p.baseAtk + G.WEAPONS[p.weapon].atk; };
  G.defOf = function (p) { return p.baseDef + G.ARMORS[p.armor].def; };

  const B = G.battle = {
    enemies: [], isBoss: false, canFlee: true,
    phase: 'msg',        // msg | command | spell | item | target | anim | over
    cmd: 0, sub: 0, subList: [], target: 0, pendingSpell: null,
    queue: [], pops: [], efx: [], defending: false, hitstop: 0, intro: 0,

    /* ---------------- 開始 ---------------- */
    start: function (enemyId, isBoss) {
      const d = G.ENEMIES[enemyId];
      // 出現数：雑魚は max まで。ボスは必ず1体
      const n = isBoss ? 1 : 1 + ((Math.random() * (d.max || 1)) | 0);
      this.enemies = [];
      for (let i = 0; i < n; i++) {
        this.enemies.push({
          id: enemyId, def: d, name: d.name, hp: d.hp, maxhp: d.hp,
          sleep: 0, alive: true, defDown: 0, raged: false,
          blink: 0, lunge: 0, fade: 0, bob: Math.random() * 6.28,
        });
      }
      this.isBoss = !!isBoss;
      this.canFlee = d.flee !== false;
      this.cmd = 0; this.sub = 0; this.target = 0;
      this.actor = 0;                                // いま入力しているメンバー
      this.orders = [];                              // 各メンバーの行動予約
      G.party = G.party || [G.player];
      G.party.forEach(function (m) { m.alive = m.hp > 0; m.defending = false; });
      this.queue = []; this.pops = []; this.efx = []; this.hitstop = 0;
      this.intro = 1;                                // 1→0 で敵がせり上がる
      G.state = 'battle';
      G.audio.se('encounter');
      G.audio.scene(null, isBoss ? 'boss' : 'battle');
      G.fx.flash('#ffffff', 220);
      const self = this;
      this.phase = 'msg';
      const label = n > 1 ? d.name + ' ' + n +'たいが' : d.name + 'が';
      G.msg.show(label + ' あらわれた！', function () { self.phase = 'command'; self.pickTarget(); }, { auto: 700 });
    },

    living: function () { return this.enemies.filter(function (e) { return e.alive; }); },
    // 対象が倒れていたら生きている敵に寄せる
    pickTarget: function () {
      if (this.enemies[this.target] && this.enemies[this.target].alive) return;
      for (let i = 0; i < this.enemies.length; i++)
        if (this.enemies[i].alive) { this.target = i; return; }
    },

    /* ---------------- エフェクト ----------------
       斬撃・呪文を図形で描く。モーションが無いと、どの攻撃をしても
       画面が同じに見えて手応えが出ない。 */
    efxAt: function (kind, idx, dur) {
      this.efx.push({ kind: kind, x: this.slotX(idx), y: 300, t: 0, dur: dur || 420 });
    },
    efxAll: function (kind, dur) {
      const self = this;
      this.living().forEach(function (e) { self.efxAt(kind, self.enemies.indexOf(e), dur); });
    },

    /* ---------------- ダメージ表示 ---------------- */
    pop: function (idx, text, col) {
      const pos = this.slotX(idx);
      this.pops.push({ x: pos, y: 300, text: text, col: col || '#f2f0e5', t: 0 });
    },
    slotX: function (i) {
      const n = this.enemies.length;
      const span = n === 1 ? 0 : n === 2 ? 190 : 215;
      return G.W / 2 + (i - (n - 1) / 2) * span;
    },

    /* ---------------- パーティ ---------------- */
    members: function () { return G.party || [G.player]; },
    aliveMembers: function () { return this.members().filter(function (m) { return m.alive !== false && m.hp > 0; }); },
    cur: function () { return this.members()[this.actor] || G.player; },
    nextAliveActor: function (from) {
      const ms = this.members();
      for (let i = from + 1; i < ms.length; i++) if (ms[i].alive !== false && ms[i].hp > 0) return i;
      return -1;
    },
    prevAliveActor: function (from) {
      const ms = this.members();
      for (let i = from - 1; i >= 0; i--) if (ms[i].alive !== false && ms[i].hp > 0) return i;
      return 0;
    },
    // 1人ぶんの行動を予約し、次のメンバーへ。全員終わったら実行に移る
    commit: function (order) {
      order.who = this.actor;
      this.orders.push(order);
      const nx = this.nextAliveActor(this.actor);
      if (nx >= 0) { this.actor = nx; this.cmd = 0; this.phase = 'command'; return; }
      this.execTurn();
    },
    // 予約された行動を順に実行し、そのあと敵が動く
    execTurn: function () {
      const self = this;
      const acts = [];
      this.orders.forEach(function (o) {
        acts.push(function () {
          const m = self.members()[o.who];
          if (!m || m.alive === false || m.hp <= 0) { self.next(); return; }
          self.perform(m, o);
        });
      });
      this.enemyPhase(acts);
      this.orders = [];
      this.run(acts);
    },

    /* ---------------- 行動キュー ---------------- */
    run: function (list) {
      this.queue = list;
      this.phase = 'msg';
      this.next();
    },
    next: function () {
      if (this.queue.length) { this.queue.shift()(); return; }
      if (!this.living().length) { this.doWin(); return; }
      if (!this.aliveMembers().length) { this.doLose(); return; }
      // 毒は1ターンの終わりに効く（戦闘中は死にうる）
      if (!this.poisonDone) {
        const hurt = this.aliveMembers().filter(function (m) { return m.poison; });
        if (hurt.length) {
          this.poisonDone = 1;
          const self0 = this;
          let txt = '';
          hurt.forEach(function (m) {
            const d = G.POISON.battleDamage(m.maxhp);
            m.hp = Math.max(0, m.hp - d);
            self0.popAlly(m, '-' + d, '#8fd07f');
            txt += m.name + 'は どくで ' + d + 'の ダメージ！\n';
            if (m.hp <= 0) { m.alive = false; txt += m.name + 'は たおれた！\n'; }
          });
          G.audio.se('damage');
          this.phase = 'msg';
          G.msg.show(txt.replace(/\n$/, ''),
            function () { self0.poisonDone = 0; self0.next(); }, { auto: 620 });
          return;
        }
      }
      this.poisonDone = 0;
      this.members().forEach(function (m) { m.defending = false; });
      this.orders = [];
      const first = this.aliveMembers().length ? this.members().indexOf(this.aliveMembers()[0]) : 0;
      this.actor = first;
      this.phase = 'command';
      this.cmd = 0;
      this.pickTarget();
    },
    // 戦闘中の実況は自動で流す（読み終えて 620ms で次へ）。
    // ボタンを押せば即座に飛ばせるので、速い人は待たされない。
    say: function (text, after) {
      const self = this;
      G.msg.show(text, after || function () { self.next(); }, { auto: 620 });
    },

    /* =====================================================================
       プレイヤーの行動
       ===================================================================== */
    hitEnemy: function (e, dmg, elem) {
      const mul = G.elemMul(e.def, elem);
      dmg = Math.max(1, Math.round(dmg * mul));
      e.hp -= dmg;
      e.blink = 260;
      if (e.sleep > 0 && Math.random() < 0.4) e.sleep = 0;
      if (e.hp <= 0) { e.alive = false; e.fade = 1; }
      return { dmg: dmg, mul: mul };
    },
    elemNote: function (mul) {
      if (mul > 1) return '\nじゃくてんを ついた！';
      if (mul < 1) return '\nしかし きき目が うすい……';
      return '';
    },

    // 予約された行動を「そのメンバー」として実行する
    perform: function (m, o) {
      const self = this;
      if (o.kind === 'attack') return this.actAttack(m, o.target);
      if (o.kind === 'defend') return this.actDefend(m);
      if (o.kind === 'spell') return this.actSpell(m, o.id, o.target);
      if (o.kind === 'item') return this.actItem(m, o.id);
      if (o.kind === 'flee') return this.actFlee(m);
      this.next();
    },

    actAttack: function (m, tgt) {
      const self = this;
      const e = this.enemies[tgt !== undefined ? tgt : this.target];
      if (!e || !e.alive) {
        // 予約した相手が既に倒れていたら、生きている敵へ振り替える
        const alt = this.living()[0];
        if (!alt) { this.next(); return; }
        return this.actAttack(m, this.enemies.indexOf(alt));
      }
      const crit = isCrit();
      const raw = crit ? Math.floor(G.atkOf(m) * (0.95 + Math.random() * 0.2))
        : damage(G.atkOf(m), Math.max(0, e.def.def - e.defDown));
      e.lunge = 200;
      if (raw <= 0) {
        G.audio.se('miss');
        this.say(m.name + 'の こうげき！\nミス！ ダメージを あたえられない！');
        return;
      }
      const idx = this.enemies.indexOf(e);
      const r = this.hitEnemy(e, raw, null);
      G.audio.se(crit ? 'crit' : 'hit');
      G.fx.shake(crit ? 8 : 4, crit ? 260 : 180);
      this.efxAt(crit ? 'slash2' : 'slash', idx, crit ? 520 : 380);
      this.hitstop = crit ? 110 : 60;
      this.pop(idx, String(r.dmg), crit ? '#e8c85c' : '#f2f0e5');
      let t = m.name + 'の こうげき！\n';
      if (crit) t += 'かいしんの いちげき！！\n';
      t += e.name + 'に ' + r.dmg + 'の ダメージ！';
      if (!e.alive) t += '\n' + e.name + 'を たおした！';
      this.say(t);
    },

    actDefend: function (m) {
      m.defending = true;
      const back = Math.min(m.maxmp - m.mp, 1 + ((Math.random() * 2) | 0));
      m.mp += back;
      G.audio.se('select');
      this.say(m.name + 'は みを まもっている。' + (back ? '\n（MPが すこし かいふくした）' : ''));
    },

    actSpell: function (m, id, tgt) {
      const self = this;
      const sp = G.SPELLS[id];
      if (m.mp < sp.mp) { this.say(m.name + 'は MPが たりない！'); return; }
      m.mp -= sp.mp;
      G.audio.se(sp.kind === 'heal' || sp.kind === 'healall' ? 'heal'
        : sp.kind === 'sleep' ? 'sleep' : sp.kind === 'revive' ? 'levelup' : 'spell');
      let t = m.name + 'は ' + sp.name + 'を となえた！\n';

      if (sp.kind === 'heal') {
        // 対象は「いちばん傷ついている味方」（自動選択で操作を軽くする）
        const tg = this.mostHurt();
        const before = tg.hp;
        tg.hp = Math.min(tg.maxhp, tg.hp + sp.power());
        this.popAlly(tg, '+' + (tg.hp - before), '#7fd07f');
        t += tg.name + 'の HPが ' + (tg.hp - before) + ' かいふくした。';

      } else if (sp.kind === 'healall') {
        let sum = 0;
        this.aliveMembers().forEach(function (a) {
          const b = a.hp;
          a.hp = Math.min(a.maxhp, a.hp + sp.power());
          sum += a.hp - b;
          self.popAlly(a, '+' + (a.hp - b), '#7fd07f');
        });
        t += 'パーティの HPが\nあわせて ' + sum + ' かいふくした。';

      } else if (sp.kind === 'revive') {
        const dead = this.members().filter(function (a) { return a.alive === false || a.hp <= 0; });
        if (!dead.length) { t += 'しかし きき目が なかった。'; }
        else {
          const tg = dead[0];
          const rate = sp.power();
          if (rate >= 1 || Math.random() < 0.6) {
            tg.alive = true;
            tg.hp = Math.max(1, Math.round(tg.maxhp * rate));
            G.fx.flash('#ffe8a0', 400);
            this.popAlly(tg, 'いきかえった', '#e8c85c');
            t += tg.name + 'は いきかえった！';
          } else t += 'しかし ' + tg.name + 'は\nいきかえらなかった。';
        }

      } else if (sp.kind === 'attack') {
        const targets = sp.all ? this.living()
          : [this.enemies[tgt !== undefined ? tgt : this.target]].filter(function (x) { return x && x.alive; });
        if (!targets.length) {
          const alt = this.living();
          if (!alt.length) { this.next(); return; }
          targets.push(alt[0]);
        }
        G.fx.flash(sp.elem === 'ice' ? '#8fd8ff' : sp.elem === 'thunder' ? '#fff2a0'
          : sp.elem === 'fire' ? '#ffcc66' : '#e0b0ff', 200);
        G.fx.shake(5, 220);
        const ek = sp.elem || 'dark';
        if (sp.all) this.efxAll(ek === 'dark' ? 'fire' : ek, 620);
        else this.efxAt(ek === 'dark' ? 'fire' : ek, this.enemies.indexOf(targets[0]), 620);
        this.hitstop = 90;
        let note = '';
        targets.forEach(function (te) {
          const i2 = self.enemies.indexOf(te);
          const r = self.hitEnemy(te, sp.power(), sp.elem);
          self.pop(i2, String(r.dmg), sp.elem === 'ice' ? '#8fd8ff'
            : sp.elem === 'thunder' ? '#fff2a0' : '#ffb060');
          t += te.name + 'に ' + r.dmg + 'の ダメージ！\n';
          if (!note) note = self.elemNote(r.mul);
        });
        t = t.replace(/\n$/, '') + note;
        const dead = targets.filter(function (x) { return !x.alive; });
        if (dead.length) t += '\n' + dead[0].name + 'を たおした！';

      } else if (sp.kind === 'sleep') {
        const te = this.enemies[tgt !== undefined ? tgt : this.target];
        if (!te || !te.alive) { this.next(); return; }
        if (te.def.boss ? Math.random() < 0.1 : Math.random() < 0.6) {
          te.sleep = 2 + G.rnd(3);
          t += te.name + 'は ねむってしまった！';
        } else t += te.name + 'には きかなかった！';

      } else if (sp.kind === 'debuff') {
        const te = this.enemies[tgt !== undefined ? tgt : this.target];
        if (!te || !te.alive) { this.next(); return; }
        if (te.defDown) t += te.name + 'の しゅび力は\nもう さがっている。';
        else if (te.def.boss ? Math.random() < 0.45 : Math.random() < 0.8) {
          te.defDown = Math.ceil(te.def.def * 0.45);
          this.pop(this.enemies.indexOf(te), 'DEF↓', '#c07ae8');
          t += te.name + 'の しゅび力が さがった！';
        } else t += te.name + 'には きかなかった！';
      }
      this.say(t);
    },

    actItem: function (m, id) {
      const p = G.player;                              // 道具はパーティ共有
      const it = G.ITEMS[id];
      if (!p.items[id]) { this.next(); return; }
      p.items[id]--;
      if (p.items[id] <= 0) delete p.items[id];
      G.audio.se('heal');
      // 回復系はいちばん傷ついている味方に使う
      const tg = (id === 'yakusou') ? this.mostHurt() : m;
      const before = tg.hp;
      const text = it.use(tg);
      if (tg.hp > before) this.popAlly(tg, '+' + (tg.hp - before), '#7fd07f');
      this.say(m.name + 'は ' + it.name + 'を つかった。\n' + text.split('\n').slice(1).join('\n'));
    },

    actFlee: function (m) {
      const self = this;
      const fail = function () {
        self.say(m.name + 'は にげだそうとした！\nしかし まわりこまれて しまった！');
      };
      if (!this.canFlee) { fail(); return; }
      const agi = this.living().some(function (e) { return e.def.agi; });
      let rate = agi ? 0.45 : 0.68;
      const ratio = m.hp / m.maxhp;
      if (ratio < 0.25) rate += 0.18;
      else if (ratio < 0.5) rate += 0.08;
      if (Math.random() < Math.min(0.92, rate)) {
        G.audio.se('flee');
        this.phase = 'over';
        this.say('パーティは にげだした！', function () { G.endBattle('flee'); });
      } else fail();
    },

    // いちばんHPの割合が低い生存メンバー
    mostHurt: function () {
      const alive = this.aliveMembers();
      if (!alive.length) return G.player;
      return alive.slice().sort(function (a, b) { return a.hp / a.maxhp - b.hp / b.maxhp; })[0];
    },
    popAlly: function (m, text, col) {
      const i = this.members().indexOf(m);
      this.pops.push({ x: 120 + i * 150, y: 300, text: text, col: col || '#f2f0e5', t: 0 });
    },

    /* =====================================================================
       敵の行動（プレイヤー行動のあとに acts へ積む）
       ===================================================================== */
    enemyPhase: function (acts) {
      const self = this;
      this.enemies.forEach(function (e, idx) {
        acts.push(function () {
          if (!e.alive || !self.aliveMembers().length) { self.next(); return; }
          // 狙う相手はパーティからランダム（HPが低い者をやや狙いやすくする）
          const alive = self.aliveMembers();
          const p = alive.length === 1 ? alive[0]
            : (Math.random() < 0.35 ? self.mostHurt() : alive[(Math.random() * alive.length) | 0]);

          // ボスの形態変化
          const rg = e.def.rage;
          if (rg && !e.raged && e.hp <= e.maxhp * rg.at) {
            e.raged = true;
            G.audio.se('encounter');
            G.fx.flash('#ff5a3c', 400);
            G.fx.shake(10, 500);
            self.say(rg.text);
            return;
          }
          const cur = e.raged ? Object.assign({}, e.def, e.def.rage) : e.def;

          if (e.sleep > 0) {
            e.sleep--;
            self.say(e.name + 'は ねむっている。');
            return;
          }
          e.lunge = 200;

          const hit = function (dmg, kind) {
            self.efx.push({ kind: kind || 'claw', x: 160, y: 300, t: 0, dur: 380 });
            self.hitstop = 70;
            if (p.defending) dmg = Math.max(1, Math.floor(dmg * 0.5));
            p.hp = Math.max(0, p.hp - dmg);
            self.popAlly(p, '-' + dmg, '#ff8878');
            if (p.hp <= 0) { p.alive = false; p.defending = false; }
            return dmg;
          };

          if (cur.breath && Math.random() < cur.breath) {
            const dmg = hit(26 + G.rnd(14), 'fire');
            G.audio.se('fire');
            G.fx.flash('#ff7a2a', 320); G.fx.shake(9, 380);
            self.say(e.name + 'は ほのおの いきを はいた！\n' + p.name + 'は ' + dmg + 'の ダメージ！'
              + (p.defending ? '\n（みを まもって はんげん）' : '')
              + (p.hp <= 0 ? '\n' + p.name + 'は たおれた！' : ''));
            return;
          }
          if (cur.spell && Math.random() < cur.spell.rate) {
            const sp = G.SPELLS[cur.spell.id];
            const dmg = hit(Math.max(1, Math.floor(sp.power() * 0.85)), 'dark');
            G.audio.se('spell');
            G.fx.flash('#c07ae8', 260); G.fx.shake(6, 260);
            self.say(e.name + 'は ' + sp.name + 'を となえた！\n' + p.name + 'は ' + dmg + 'の ダメージ！'
              + (p.hp <= 0 ? '\n' + p.name + 'は たおれた！' : ''));
            return;
          }
          const raw = damage(cur.atk, G.defOf(p));
          if (raw > 0) {
            const dmg = hit(raw);
            G.audio.se('damage');
            G.fx.flash('#e03c2c', 240); G.fx.shake(7, 280);
            // 毒を持つ敵は、当てたときに一定確率で毒にする
            let ptxt = '';
            if (cur.poison && !p.poison && Math.random() < cur.poison) {
              p.poison = 1;
              G.fx.flash('#8fd07f', 260);
              self.pops.push({ x: 160, y: 268, text: 'どく', col: '#8fd07f', t: 0 });
              ptxt = '\n' + p.name + 'は どくを うけた！';
            }
            self.say(e.name + 'の こうげき！\n' + p.name + 'は ' + dmg + 'の ダメージを うけた！'
              + (p.defending ? '\n（みを まもって はんげん）' : '') + ptxt
              + (p.hp <= 0 ? '\n' + p.name + 'は たおれた！' : ''));
          } else {
            G.audio.se('miss');
            self.say(e.name + 'の こうげき！\n' + p.name + 'は みを かわした！');
          }
        });
      });
    },

    /* =====================================================================
       決着
       ===================================================================== */
    doWin: function () {
      const self = this, p = G.player;
      this.phase = 'over';
      G.audio.stopBgm();
      G.audio.se('win');
      let exp = 0, gold = 0;
      this.enemies.forEach(function (e) { exp += e.def.exp; gold += e.def.gold; });
      p.exp += exp; p.gold += gold;
      p.kills += this.enemies.length;

      G.msg.show([
        'まものを たおした！\n' + p.name + 'は ' + exp + 'ポイントの けいけんちと\n'
          + gold + 'ゴールドを てにいれた！',
      ], function () {
        let ups = G.checkLevelUp();
        if (G.syncAllies) ups = ups.concat(G.syncAllies());
        if (ups.length) {
          G.audio.se('levelup');
          G.msg.show(ups, function () { self.finishWin(); });
        } else self.finishWin();
      });
    },
    finishWin: function () {
      const first = this.enemies[0];
      if (first && first.def.truelast) { G.flags.galenDead = 1; G.endBattle('truelast'); return; }
      if (first && first.def.midboss) { G.flags.gateOpen = 1; G.endBattle('midboss'); return; }
      if (this.isBoss) { G.flags.bossDead = 1; G.endBattle('boss'); return; }
      G.endBattle('win');
    },

    doLose: function () {
      this.phase = 'over';
      G.audio.stopBgm();
      G.audio.se('dead');
      G.fx.flash('#000000', 400);
      G.msg.show([G.player.name + 'は しんでしまった！'], function () { G.endBattle('lose'); });
    },

    /* =====================================================================
       更新
       ===================================================================== */
    update: function (dt) {
      // ヒットストップ：当たった瞬間だけ時間を止めて打撃感を出す
      if (this.hitstop > 0) { this.hitstop -= dt; dt *= 0.15; }
      if (this.intro > 0) this.intro = Math.max(0, this.intro - dt / 460);
      for (let i = this.efx.length - 1; i >= 0; i--) {
        this.efx[i].t += dt;
        if (this.efx[i].t > this.efx[i].dur) this.efx.splice(i, 1);
      }
      this.enemies.forEach(function (e) {
        if (e.blink > 0) e.blink -= dt;
        if (e.lunge > 0) e.lunge -= dt;
        if (e.fade > 0) e.fade = Math.max(0, e.fade - dt / 420);
        e.bob += dt / 620;
      });
      for (let i = this.pops.length - 1; i >= 0; i--) {
        this.pops[i].t += dt;
        if (this.pops[i].t > 800) this.pops.splice(i, 1);
      }

      if (G.msg.active) { G.msg.update(dt); return; }
      if (this.phase === 'anim' || this.phase === 'over') return;

      if (this.phase === 'command') {
        const n = CMDS.length;
        if (G.pressed('down')) { this.cmd = (this.cmd + 1) % n; G.audio.se('select'); }
        if (G.pressed('up')) { this.cmd = (this.cmd - 1 + n) % n; G.audio.se('select'); }
        // 前のメンバーの入力に戻る
        if (G.pressed('cancel') && this.actor > 0) {
          G.audio.se('cancel');
          this.orders.pop();
          this.actor = this.prevAliveActor(this.actor);
          return;
        }
        if (G.pressed('ok')) {
          G.audio.se('confirm');
          const c = this.cmd;
          if (c === 0) this.beginTarget('attack');
          else if (c === 1) this.openSub('spell');
          else if (c === 2) this.commit({ kind: 'defend' });
          else if (c === 3) this.openSub('item');
          else this.commit({ kind: 'flee' });
        }
        return;
      }

      if (this.phase === 'target') {
        const alive = this.enemies.map(function (e, i) { return e.alive ? i : -1; })
          .filter(function (i) { return i >= 0; });
        const cur = alive.indexOf(this.target);
        if (G.pressed('left') || G.pressed('up')) {
          this.target = alive[(cur - 1 + alive.length) % alive.length]; G.audio.se('select');
        }
        if (G.pressed('right') || G.pressed('down')) {
          this.target = alive[(cur + 1) % alive.length]; G.audio.se('select');
        }
        if (G.pressed('cancel')) { G.audio.se('cancel'); this.phase = 'command'; this.pendingSpell = null; return; }
        if (G.pressed('ok')) {
          G.audio.se('confirm');
          const sp = this.pendingSpell;
          this.pendingSpell = null;
          if (sp) this.commit({ kind: 'spell', id: sp, target: this.target });
          else this.commit({ kind: 'attack', target: this.target });
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
          if (this.phase === 'spell') {
            const sp = G.SPELLS[item.id];
            const needTarget = ['attack', 'sleep', 'debuff'].indexOf(sp.kind) >= 0;
            if (needTarget && !sp.all && this.living().length > 1) {
              this.pendingSpell = item.id;
              this.beginTarget('spell');
            } else this.commit({ kind: 'spell', id: item.id, target: this.target });
          } else this.commit({ kind: 'item', id: item.id });
        }
      }
    },

    beginTarget: function (kind) {
      this.pickTarget();
      if (this.living().length <= 1) {
        if (kind === 'spell' && this.pendingSpell) {
          const sp = this.pendingSpell; this.pendingSpell = null;
          this.commit({ kind: 'spell', id: sp, target: this.target });
        } else this.commit({ kind: 'attack', target: this.target });
        return;
      }
      this.phase = 'target';
    },

    openSub: function (kind) {
      const p = this.cur();
      this.sub = 0;
      this.subList = [];
      const self = this;
      if (kind === 'spell') {
        (p.spells || []).forEach(function (id) {
          const sp = G.SPELLS[id];
          if (!sp.battle) return;
          self.subList.push({
            id: id, label: sp.name + (sp.all ? '（全）' : ''),
            right: 'MP' + sp.mp, disabled: p.mp < sp.mp,
          });
        });
        if (!this.subList.length) {
          G.audio.se('cancel');
          this.say('つかえる じゅもんが ない。', function () { self.phase = 'command'; });
          return;
        }
        this.phase = 'spell';
      } else {
        const inv = G.player.items;                   // 道具はパーティ共有
        Object.keys(inv).forEach(function (id) {
          const it = G.ITEMS[id];
          if (!it.battle) return;
          self.subList.push({ id: id, label: it.name, right: '×' + inv[id] });
        });
        if (!this.subList.length) {
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
      const c = G.ctx;
      const indoor = G.MAPS[G.player.map].indoor;
      const HZ = 396;

      // 空
      const g = c.createLinearGradient(0, 0, 0, HZ);
      if (indoor) { g.addColorStop(0, '#0d0a12'); g.addColorStop(0.6, '#1c1622'); g.addColorStop(1, '#2a2130'); }
      else { g.addColorStop(0, '#0a1024'); g.addColorStop(0.55, '#16244a'); g.addColorStop(1, '#2d3f6b'); }
      c.fillStyle = g;
      c.fillRect(0, 0, G.W, HZ);

      if (indoor) {
        c.fillStyle = '#181320';
        for (let i = 0; i < 9; i++) {
          const x = i * 88 + ((i * 37) % 40), w = 26 + ((i * 17) % 22), h = 60 + ((i * 53) % 90);
          c.beginPath(); c.moveTo(x, 0); c.lineTo(x + w / 2, h); c.lineTo(x + w, 0);
          c.closePath(); c.fill();
        }
        c.fillStyle = '#241d2c';
        for (let i = 0; i < 6; i++) {
          const h = 90 + ((i * 47) % 70);
          c.fillRect(i * 130 - 30, HZ - h, 170, h);
        }
      } else {
        for (let i = 0; i < 46; i++) {
          const x = (i * 151) % G.W, y = (i * 73) % 240;
          c.globalAlpha = 0.25 + 0.5 * Math.abs(Math.sin(G.time / 1100 + i));
          c.fillStyle = '#e8e4d2';
          c.fillRect(x, y, 2, 2);
        }
        c.globalAlpha = 1;
        c.fillStyle = '#111a33';
        for (let i = 0; i < 6; i++) {
          const bx = i * 150 - 40, bw = 240, bh = 130 + ((i * 61) % 70);
          c.beginPath(); c.moveTo(bx, HZ); c.lineTo(bx + bw / 2, HZ - bh); c.lineTo(bx + bw, HZ);
          c.closePath(); c.fill();
        }
        c.fillStyle = '#0b1224';
        for (let i = 0; i < 5; i++) {
          const bx = i * 190 - 90, bw = 260, bh = 80 + ((i * 43) % 50);
          c.beginPath(); c.moveTo(bx, HZ); c.lineTo(bx + bw / 2, HZ - bh); c.lineTo(bx + bw, HZ);
          c.closePath(); c.fill();
        }
      }

      // 地面
      const gt = indoor ? G.TILE.cfloor[0][15] : G.TILE.grass[0];
      for (let gy = HZ; gy < G.H; gy += G.T)
        for (let gx = 0; gx < G.W; gx += G.T)
          c.drawImage(gt, 0, 0, G.TS, G.TS, gx, gy, G.T, G.T);
      const gg = c.createLinearGradient(0, HZ, 0, G.H);
      gg.addColorStop(0, 'rgba(6,6,14,0.72)');
      gg.addColorStop(1, 'rgba(6,6,14,0.40)');
      c.fillStyle = gg;
      c.fillRect(0, HZ, G.W, G.H - HZ);
      c.fillStyle = 'rgba(232,228,210,0.10)';
      c.fillRect(0, HZ, G.W, 2);

      // 敵（複数時は少し小さくして並べる）
      const n = this.enemies.length;
      const shrink = n === 1 ? 1 : n === 2 ? 0.82 : 0.68;
      const self = this;
      this.enemies.forEach(function (e, i) {
        if (!e.alive && e.fade <= 0) return;
        const img = G.ENEMY[e.def.spr];
        const sc = Math.min((e.def.scale || 2) * G.S, 296 / img.height) * shrink;
        const w = img.width * sc, h = img.height * sc;
        let ex = self.slotX(i) - w / 2;
        let ey = 400 - h + Math.sin(e.bob) * 3;             // 待機の揺れ
        if (e.lunge > 0) ey += Math.sin((1 - e.lunge / 200) * Math.PI) * 14;
        ey += self.intro * 46;                              // 登場：下からせり上がる
        c.save();
        if (!e.alive) c.globalAlpha = e.fade;
        else if (self.intro > 0) c.globalAlpha = 1 - self.intro;
        // 影
        c.fillStyle = 'rgba(0,0,0,0.35)';
        c.beginPath();
        c.ellipse(self.slotX(i), 400, w * 0.34, 12, 0, 0, Math.PI * 2);
        c.fill();
        const blink = e.blink > 0 && Math.floor(e.blink / 60) % 2 === 0;
        c.drawImage(img, 0, 0, img.width, img.height, ex | 0, ey | 0, w, h);
        if (blink) {
          c.globalCompositeOperation = 'source-atop';
          c.fillStyle = 'rgba(255,255,255,0.85)';
          c.fillRect(ex, ey, w, h);
          c.globalCompositeOperation = 'source-over';
        }
        if (e.sleep > 0 && e.alive) {
          G.text('Zzz', self.slotX(i) + w * 0.30, ey - 6, { size: 20, color: '#8fd8ff' });
        }
        c.restore();
      });

      // 攻撃・呪文のモーション
      this.efx.forEach(function (f) { self.drawEfx(c, f); });

      // 対象カーソル
      if (this.phase === 'target') {
        const x = this.slotX(this.target);
        const t = Math.floor(G.time / 220) % 2;
        G.text('▼', x, 340 + (t ? 4 : 0), { size: 30, align: 'center', color: '#e8c85c' });
      }

      // 敵名＋ボスHPゲージ
      const first = this.living()[0] || this.enemies[0];
      if (first) {
        const nw = 300, nx = (G.W - nw) / 2;
        const showHp = this.isBoss || first.def.boss;
        G.win(nx, 14, nw, showHp ? 80 : 54);
        const label = n > 1 ? first.name + ' ×' + this.living().length : first.name;
        G.text(label, G.W / 2, 28, { size: 22, align: 'center' });
        if (showHp) {
          const bw = nw - 60, bx = nx + 30, by = 62;
          c.fillStyle = '#3a1c1c'; c.fillRect(bx, by, bw, 12);
          c.fillStyle = first.raged ? '#e8783c' : '#d63b30';
          c.fillRect(bx, by, Math.max(0, (bw * first.hp) / first.maxhp) | 0, 12);
          c.strokeStyle = '#f2f0e5'; c.lineWidth = 2;
          c.strokeRect(bx - 1, by - 1, bw + 2, 14);
        }
      }

      // ダメージ表示
      this.pops.forEach(function (p) {
        const k = p.t / 800;
        const y = p.y - k * 46;
        G.ctx.globalAlpha = k > 0.75 ? (1 - k) * 4 : 1;
        G.text(p.text, p.x, y, { size: 30, align: 'center', color: p.col });
        G.ctx.globalAlpha = 1;
      });

      this.drawParty();

      if (this.phase === 'command' || this.phase === 'target') this.drawCmd(this.phase === 'target');
      else if (this.phase === 'spell' || this.phase === 'item') { this.drawCmd(true); this.drawSub(); }
      else G.msg.draw();
    },

    drawEfx: function (c, f) {
      const k = f.t / f.dur;                       // 0→1
      const x = f.x, y = f.y;
      c.save();
      if (f.kind === 'slash' || f.kind === 'slash2') {
        // 斜めの太い光跡。会心は2本走らせる
        const n = f.kind === 'slash2' ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const kk = Math.max(0, Math.min(1, k * 1.6 - i * 0.35));
          if (kk <= 0 || kk >= 1) continue;
          c.globalAlpha = 1 - kk;
          c.strokeStyle = i ? '#ffe89a' : '#ffffff';
          c.lineWidth = 10 - kk * 7;
          c.beginPath();
          const len = 150, sx = x - 70 + i * 30, sy = y - 80 + i * 40;
          c.moveTo(sx + kk * 40, sy + kk * 20);
          c.lineTo(sx + len * kk + 40, sy + len * kk * 0.9);
          c.stroke();
        }
      } else if (f.kind === 'fire') {
        // 立ち上る火の粉
        for (let i = 0; i < 16; i++) {
          const t2 = (k + i * 0.06) % 1;
          const px2 = x + Math.sin(i * 2.1 + k * 5) * 42 * (1 - t2 * 0.4);
          const py2 = y + 60 - t2 * 150;
          c.globalAlpha = (1 - t2) * 0.95;
          c.fillStyle = t2 < 0.35 ? '#fff0a0' : t2 < 0.7 ? '#f08a30' : '#a83820';
          const r = (1 - t2) * 11 + 3;
          c.fillRect(px2 - r / 2, py2 - r / 2, r, r);
        }
      } else if (f.kind === 'ice') {
        // 上から降る結晶と、着弾の砕け
        for (let i = 0; i < 10; i++) {
          const t2 = Math.min(1, k * 1.5 - i * 0.05);
          if (t2 <= 0) continue;
          const px2 = x + ((i % 5) - 2) * 26 + Math.sin(i) * 8;
          const py2 = y - 120 + t2 * 170;
          c.globalAlpha = t2 > 0.85 ? (1 - t2) * 6 : 0.95;
          c.fillStyle = i % 2 ? '#bfeaff' : '#7fc4ee';
          c.save();
          c.translate(px2, py2); c.rotate(k * 5 + i);
          c.fillRect(-3, -11, 6, 22); c.fillRect(-11, -3, 22, 6);
          c.restore();
        }
      } else if (f.kind === 'thunder') {
        // 上から落ちるジグザグの稲妻
        c.globalAlpha = k < 0.6 ? 1 : (1 - k) * 2.5;
        c.strokeStyle = k < 0.25 ? '#ffffff' : '#ffe45c';
        c.lineWidth = 9 - k * 5;
        c.beginPath();
        c.moveTo(x, -10);
        let yy = -10, xx = x;
        for (let i = 0; i < 7; i++) {
          yy += 50; xx += ((i % 2) ? 26 : -26) * (1 - i / 9);
          c.lineTo(xx, yy);
          if (yy > y + 70) break;
        }
        c.stroke();
        c.globalAlpha = (1 - k) * 0.5;
        c.fillStyle = '#fff8c0';
        c.fillRect(0, 0, G.W, 396);
      } else if (f.kind === 'claw') {
        // 敵の攻撃：画面手前を横切る3本の爪痕
        for (let i = 0; i < 3; i++) {
          const kk = Math.max(0, Math.min(1, k * 1.8 - i * 0.12));
          if (kk <= 0 || kk >= 1) continue;
          c.globalAlpha = 1 - kk;
          c.strokeStyle = '#ff6a5a';
          c.lineWidth = 7;
          c.beginPath();
          c.moveTo(60 + i * 34, 200 + kk * 40);
          c.lineTo(60 + i * 34 + 110 * kk, 200 + kk * 190);
          c.stroke();
        }
      } else if (f.kind === 'dark') {
        for (let i = 0; i < 12; i++) {
          const t2 = (k + i * 0.08) % 1;
          c.globalAlpha = (1 - t2) * 0.9;
          c.fillStyle = i % 2 ? '#a67fc4' : '#634080';
          const a = i * 0.9 + k * 4;
          const r = 20 + t2 * 90;
          c.fillRect(160 + Math.cos(a) * r, 290 + Math.sin(a) * r * 0.6, 9, 9);
        }
      }
      c.restore();
      c.globalAlpha = 1;
    },

    // パーティの状態（左上に縦積み。入力中の者を光らせる）
    drawParty: function () {
      const ms = this.members();
      const w = 214, h = 30 + ms.length * 52;
      G.win(12, 12, w, h);
      const self = this;
      ms.forEach(function (m, i) {
        const y = 30 + i * 52;
        const on = (self.phase === 'command' || self.phase === 'target'
          || self.phase === 'spell' || self.phase === 'item') && self.actor === i;
        const dead = m.alive === false || m.hp <= 0;
        G.text(m.name, 30, y, {
          size: 19,
          color: dead ? '#7d6a6a' : on ? '#e8c85c' : '#f2f0e5',
        });
        if (on) G.cursor(18, y);
        if (dead) { G.text('たおれている', 200, y, { size: 15, align: 'right', color: '#a4705c' }); return; }
        if (m.poison) G.text('どく', 200, y - 2, { size: 14, align: 'right', color: '#8fd07f' });
        // HP/MP バー
        const bw = 176;
        G.ctx.fillStyle = '#2a1c1c'; G.ctx.fillRect(30, y + 22, bw, 7);
        G.ctx.fillStyle = m.hp <= m.maxhp * 0.25 ? '#e8664a' : '#4ec46e';
        G.ctx.fillRect(30, y + 22, Math.max(0, (bw * m.hp) / m.maxhp) | 0, 7);
        if (m.maxmp > 0) {
          G.ctx.fillStyle = '#1c2440'; G.ctx.fillRect(30, y + 32, bw, 5);
          G.ctx.fillStyle = '#5a9bd8';
          G.ctx.fillRect(30, y + 32, Math.max(0, (bw * m.mp) / m.maxmp) | 0, 5);
        }
        G.text(m.hp + '/' + m.maxhp, 206, y + 16, { size: 14, align: 'right', color: '#b8c4d4' });
        if (m.defending) G.text('まもり', 30, y + 38, { size: 13, color: '#8fd8ff' });
      });
    },

    drawCmd: function (dim) {
      const x = 14, y = G.H - 232, w = 250, h = 218;
      G.win(x, y, w, h);
      const col = dim ? '#7d8494' : '#f2f0e5';
      if (this.members().length > 1) {
        G.text(this.cur().name, x + w - 20, y + 8, { size: 16, align: 'right', color: '#e8c85c' });
      }
      for (let i = 0; i < CMDS.length; i++) {
        const cy = y + 26 + i * 38;
        G.text(CMDS[i], x + 58, cy, { size: 22, color: col });
        if (!dim && this.cmd === i) G.cursor(x + 24, cy);
      }
    },
    drawSub: function () {
      const x = 278, y = G.H - 232, w = 300, h = 218;
      G.win(x, y, w, h);
      const vis = 5;
      const top = Math.max(0, Math.min(this.sub - 2, this.subList.length - vis));
      for (let i = 0; i < Math.min(vis, this.subList.length); i++) {
        const it = this.subList[top + i];
        const cy = y + 26 + i * 38;
        G.text(it.label, x + 50, cy, { size: 21, color: it.disabled ? '#6d7484' : '#f2f0e5' });
        if (it.right) G.text(it.right, x + w - 26, cy, { size: 18, align: 'right', color: '#b8c4d4' });
        if (this.sub === top + i) G.cursor(x + 18, cy);
      }
      if (this.subList.length > vis) G.text('▼', x + w - 24, y + h - 28, { size: 16, color: '#e8c85c' });
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
      if (L.learn && !p.spells.includes(L.learn)) {
        p.spells.push(L.learn);
        out.push('じゅもん「' + G.SPELLS[L.learn].name + '」を\nおぼえた！');
      }
    }
    return out;
  };
})();
