/* =====================================================================
   ui.js — メニュー・店・宿・確認ダイアログ
   ===================================================================== */
(function () {
  'use strict';
  const G = (window.G = window.G || {});

  /* =====================================================================
     確認ダイアログ（はい／いいえ）
     ===================================================================== */
  G.modal = {
    active: false, text: '', sel: 0, cb: null,
    update: function () {
      if (G.pressed('left') || G.pressed('up')) { this.sel = 0; G.audio.se('select'); }
      if (G.pressed('right') || G.pressed('down')) { this.sel = 1; G.audio.se('select'); }
      if (G.pressed('cancel')) {
        G.audio.se('cancel');
        this.close(false);
        return;
      }
      if (G.pressed('ok')) {
        G.audio.se('confirm');
        this.close(this.sel === 0);
      }
    },
    close: function (yes) {
      this.active = false;
      const cb = this.cb; this.cb = null;
      if (cb) cb(yes);
    },
    draw: function () {
      const w = 400, h = 150, x = (G.W - w) / 2, y = G.H - 300;
      G.win(x, y, w, h);
      G.textLines(this.text, x + 32, y + 26, { size: 22, lh: 30 });
      const oy = y + h - 48;
      G.text('はい', x + 92, oy, { size: 22 });
      G.text('いいえ', x + 232, oy, { size: 22 });
      G.cursor(x + (this.sel === 0 ? 62 : 202), oy);
    },
  };
  G.confirmBox = function (text, cb) {
    G.modal.active = true;
    G.modal.text = text;
    G.modal.sel = 0;
    G.modal.cb = cb;
  };

  /* =====================================================================
     メニュー
     ===================================================================== */
  const MAIN = ['つよさ', 'じゅもん', 'どうぐ', 'とじる'];

  G.menu = {
    open: false, page: 'main', sel: 0, sub: 0, list: [],

    update: function (dt) {
      if (G.msg.active) { G.msg.update(dt); return; }
      if (G.modal.active) { G.modal.update(); return; }

      if (this.page === 'main') {
        if (G.pressed('up')) { this.sel = (this.sel + MAIN.length - 1) % MAIN.length; G.audio.se('select'); }
        if (G.pressed('down')) { this.sel = (this.sel + 1) % MAIN.length; G.audio.se('select'); }
        if (G.pressed('cancel')) { G.audio.se('cancel'); G.closeMenu(); return; }
        if (G.pressed('ok')) {
          G.audio.se('confirm');
          if (this.sel === 0) this.page = 'status';
          else if (this.sel === 1) this.openList('spell');
          else if (this.sel === 2) this.openList('item');
          else G.closeMenu();
        }
        return;
      }

      if (this.page === 'status') {
        if (G.pressed('ok') || G.pressed('cancel')) { G.audio.se('cancel'); this.page = 'main'; }
        return;
      }

      // spell / item のリスト
      const n = this.list.length;
      if (G.pressed('cancel')) { G.audio.se('cancel'); this.page = 'main'; return; }
      if (!n) { if (G.pressed('ok')) { G.audio.se('cancel'); this.page = 'main'; } return; }
      if (G.pressed('up')) { this.sub = (this.sub - 1 + n) % n; G.audio.se('select'); }
      if (G.pressed('down')) { this.sub = (this.sub + 1) % n; G.audio.se('select'); }
      if (G.pressed('ok')) {
        const it = this.list[this.sub];
        if (it.disabled) { G.audio.se('cancel'); return; }
        G.audio.se('confirm');
        if (this.page === 'spell') this.useSpell(it.id);
        else this.useItem(it.id);
      }
    },

    openList: function (kind) {
      const p = G.player;
      this.list = []; this.sub = 0;
      if (kind === 'spell') {
        p.spells.forEach(function (id) {
          const sp = G.SPELLS[id];
          if (!sp.field) return;
          G.menu.list.push({ id: id, label: sp.name, right: 'MP' + sp.mp, disabled: p.mp < sp.mp });
        });
        this.page = 'spell';
      } else {
        Object.keys(p.items).forEach(function (id) {
          const it = G.ITEMS[id];
          if (!it.field) return;
          G.menu.list.push({ id: id, label: it.name, right: '×' + p.items[id] });
        });
        this.page = 'item';
      }
    },

    useSpell: function (id) {
      const p = G.player, sp = G.SPELLS[id];
      if (p.mp < sp.mp) { G.msg.show('MPが たりない。'); return; }
      if (sp.kind !== 'heal') { G.msg.show('ここでは つかえない。'); return; }
      p.mp -= sp.mp;
      const before = p.hp;
      p.hp = Math.min(p.maxhp, p.hp + sp.power());
      G.audio.se('heal');
      G.msg.show(p.name + 'は ' + sp.name + 'を となえた！\nHPが ' + (p.hp - before) + ' かいふくした。');
      this.openList('spell');
    },

    useItem: function (id) {
      const p = G.player, it = G.ITEMS[id];
      if (!p.items[id]) return;
      p.items[id]--;
      if (p.items[id] <= 0) delete p.items[id];
      G.audio.se(id === 'tubasa' ? 'spell' : 'heal');
      const text = it.use(p);
      G.msg.show(text);
      this.openList('item');
    },

    draw: function () {
      // 背景はフィールドをそのまま見せる
      G.field.draw();

      if (this.page === 'status') { this.drawStatus(); }
      else {
        // メインメニュー（右上）
        const w = 200, h = 40 + MAIN.length * 40, x = G.W - w - 14, y = 14;
        G.win(x, y, w, h);
        for (let i = 0; i < MAIN.length; i++) {
          const cy = y + 26 + i * 40;
          G.text(MAIN[i], x + 54, cy, { size: 22 });
          if (this.page === 'main' && this.sel === i) G.cursor(x + 22, cy);
        }
        if (this.page === 'spell' || this.page === 'item') this.drawList();
      }
      if (G.msg.active) G.msg.draw();
      if (G.modal.active) G.modal.draw();
    },

    drawList: function () {
      const w = 300, h = 216, x = G.W - 200 - w - 24, y = 14;
      G.win(x, y, w, h);
      G.text(this.page === 'spell' ? 'じゅもん' : 'どうぐ', x + 24, y + 18, { size: 18, color: '#b8c4d4' });
      if (!this.list.length) {
        G.text(this.page === 'spell' ? 'まだ おぼえていない' : 'なにも もっていない', x + 30, y + 60, { size: 20, color: '#8d94a4' });
        return;
      }
      const vis = 4;
      const top = Math.max(0, Math.min(this.sub - 1, this.list.length - vis));
      for (let i = 0; i < Math.min(vis, this.list.length); i++) {
        const it = this.list[top + i];
        const cy = y + 52 + i * 38;
        G.text(it.label, x + 52, cy, { size: 21, color: it.disabled ? '#6d7484' : '#f2f0e5' });
        if (it.right) G.text(it.right, x + w - 28, cy, { size: 18, align: 'right', color: '#b8c4d4' });
        if (this.sub === top + i) G.cursor(x + 20, cy);
      }
      if (this.list.length > vis) G.text('▼', x + w - 26, y + h - 30, { size: 16, color: '#e8c34a' });
    },

    drawStatus: function () {
      const p = G.player;
      const w = 560, h = 480, x = (G.W - w) / 2, y = 60;
      G.win(x, y, w, h);
      G.text(p.name, x + 36, y + 26, { size: 28 });
      G.text(G.rankName(), x + w - 36, y + 30, { size: 20, align: 'right', color: '#e8c34a' });

      const nextExp = p.lv < G.LEVELS.length ? G.LEVELS[p.lv].exp - p.exp : 0;
      const rows = [
        ['レベル', p.lv],
        ['HP', p.hp + ' / ' + p.maxhp],
        ['MP', p.mp + ' / ' + p.maxmp],
        ['ちから', G.atkOf(p) + '（' + p.baseAtk + '＋' + G.WEAPONS[p.weapon].atk + '）'],
        ['みのまもり', G.defOf(p) + '（' + p.baseDef + '＋' + G.ARMORS[p.armor].def + '）'],
        ['けいけんち', p.exp],
        ['つぎのレベルまで', p.lv < G.LEVELS.length ? nextExp : '——'],
        ['ゴールド', p.gold],
        ['ぶき', G.WEAPONS[p.weapon].name],
        ['よろい', G.ARMORS[p.armor].name],
        ['たおした まもの', p.kills],
      ];
      rows.forEach(function (r, i) {
        const cy = y + 76 + i * 34;
        G.text(r[0], x + 40, cy, { size: 20, color: '#b8c4d4' });
        G.text(String(r[1]), x + w - 40, cy, { size: 21, align: 'right' });
      });
      G.text('（ボタンで もどる）', x + w / 2, y + h - 38, { size: 17, align: 'center', color: '#8d94a4' });
    },
  };

  G.openMenu = function () {
    G.menu.open = true; G.menu.page = 'main'; G.menu.sel = 0;
    G.state = 'menu';
  };
  G.closeMenu = function () {
    G.menu.open = false;
    G.state = 'field';
  };

  G.rankName = function () {
    const p = G.player;
    let name = G.RANKS[0].name;
    G.RANKS.forEach(function (r) { if (p.lv >= r.lv) name = r.name; });
    if (G.flags.bossDead) name = 'りゅうごろし';
    return name;
  };

  /* =====================================================================
     店
     ===================================================================== */
  G.shop = {
    id: null, def: null, sel: 0, list: [],

    open: function (id) {
      this.id = id;
      this.def = G.SHOPS[id];
      this.sel = 0;
      this.buildList();
      G.state = 'shop';
      const self = this;
      G.msg.show(this.def.lines);
    },

    buildList: function () {
      const p = G.player;
      this.list = this.def.goods.map(function (g) {
        let name, price, owned = false;
        if (g.type === 'item') { name = G.ITEMS[g.id].name; price = G.ITEMS[g.id].price; }
        else if (g.type === 'weapon') {
          name = G.WEAPONS[g.id].name; price = G.WEAPONS[g.id].price;
          owned = p.weapon >= g.id;
        } else {
          name = G.ARMORS[g.id].name; price = G.ARMORS[g.id].price;
          owned = p.armor >= g.id;
        }
        return { g: g, name: name, price: price, owned: owned };
      });
      this.list.push({ leave: true, name: 'やめる', price: null });
    },

    update: function (dt) {
      if (G.msg.active) { G.msg.update(dt); return; }
      if (G.modal.active) { G.modal.update(); return; }
      const n = this.list.length;
      if (G.pressed('up')) { this.sel = (this.sel - 1 + n) % n; G.audio.se('select'); }
      if (G.pressed('down')) { this.sel = (this.sel + 1) % n; G.audio.se('select'); }
      if (G.pressed('cancel')) { G.audio.se('cancel'); this.leave(); return; }
      if (G.pressed('ok')) {
        const it = this.list[this.sel];
        if (it.leave) { G.audio.se('confirm'); this.leave(); return; }
        G.audio.se('confirm');
        this.tryBuy(it);
      }
    },

    tryBuy: function (it) {
      const p = G.player, self = this;
      if (it.owned) { G.msg.show('それより よいものを\nすでに そうびしている。'); return; }
      if (p.gold < it.price) { G.msg.show('ゴールドが たりないよ。'); return; }
      G.confirmBox(it.name + '　' + it.price + 'ゴールド\nかいますか？', function (yes) {
        if (!yes) { G.audio.se('cancel'); return; }
        p.gold -= it.price;
        G.audio.se('open');
        let text = it.name + 'を てにいれた！';
        const g = it.g;
        if (g.type === 'item') {
          p.items[g.id] = (p.items[g.id] || 0) + 1;
        } else if (g.type === 'weapon') {
          p.weapon = g.id; text += '\nさっそく そうびした。';
        } else {
          p.armor = g.id; text += '\nさっそく そうびした。';
        }
        self.buildList();
        G.msg.show(text);
      });
    },

    leave: function () {
      G.state = 'field';
      G.msg.show('また きてくれよ。');
    },

    draw: function () {
      G.field.draw();
      const w = 420, h = 330, x = 24, y = 40;
      G.win(x, y, w, h);
      G.text(this.def.title, x + 28, y + 20, { size: 22, color: '#e8c34a' });
      const vis = 6;
      const top = Math.max(0, Math.min(this.sel - 2, this.list.length - vis));
      for (let i = 0; i < Math.min(vis, this.list.length); i++) {
        const it = this.list[top + i];
        const cy = y + 62 + i * 40;
        const col = it.owned ? '#6d7484' : it.price !== null && G.player.gold < it.price ? '#a4705c' : '#f2f0e5';
        G.text(it.name, x + 52, cy, { size: 21, color: col });
        if (it.price !== null) G.text(it.price + 'G', x + w - 28, cy, { size: 20, align: 'right', color: col });
        if (this.sel === top + i) G.cursor(x + 20, cy);
      }
      // 所持金
      G.win(G.W - 220, 40, 200, 62);
      G.text('もちきん', G.W - 200, 54, { size: 17, color: '#b8c4d4' });
      G.text(G.player.gold + 'G', G.W - 40, 72, { size: 22, align: 'right', color: '#e8c34a' });

      if (G.msg.active) G.msg.draw();
      if (G.modal.active) G.modal.draw();
    },
  };

  G.openShop = function (id) { G.shop.open(id); };
})();
