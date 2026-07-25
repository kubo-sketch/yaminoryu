/* =====================================================================
   balance.js — 戦闘を大量に自動プレイしてバランスを数値で確認する。
   ダメージ式は battle.js の G.damage をそのまま使う（式の二重管理を避ける）。
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const ROOT = require('path').join(__dirname, '..', 'src');

// battle.js は document を触らないので、最小のスタブで読める
global.window = {};
global.document = { createElement: () => ({ getContext: () => ({}) }), getElementById: () => null, querySelectorAll: () => ({ forEach: () => {} }) };
['data.js', 'battle.js'].forEach((f) => new Function(fs.readFileSync(path.join(ROOT, f), 'utf8'))());
const G = global.window.G;
const { damage, isCrit, LEVELS, WEAPONS, ARMORS, ENEMIES, SPELLS } = G;


/* ---------------- 戦闘シミュレーション（パーティ対応） ----------------
   battle.js と同じ規則で回す：全員が1手ずつ行動し、敵はパーティから
   ランダムに狙う。戦闘不能と蘇生、属性倍率、ぼうぎょ、形態変化を含む。 */
function mkPlayer(lv, weapon, armor) {
  const L = LEVELS[Math.min(lv, LEVELS.length) - 1];
  const p = {
    name: 'ユウ', lv: lv, maxhp: L.hp, hp: L.hp, maxmp: L.mp, mp: L.mp,
    baseAtk: L.atk, baseDef: L.def, weapon: weapon, armor: armor,
    spells: [], items: { yakusou: 6 }, alive: true,
  };
  for (let i = 0; i < lv && i < LEVELS.length; i++) if (LEVELS[i].learn) p.spells.push(LEVELS[i].learn);
  return p;
}
function mkAlly(id, lv, weapon, armor) {
  const d = G.ALLIES[id];
  const L = LEVELS[Math.min(lv, LEVELS.length) - 1];
  const m = {
    name: d.name, lv: lv,
    maxhp: Math.max(1, Math.round(L.hp * d.mul.hp)),
    maxmp: Math.round(L.mp * d.mul.mp),
    baseAtk: Math.max(1, Math.round(L.atk * d.mul.atk)),
    baseDef: Math.max(0, Math.round(L.def * d.mul.def)),
    weapon: weapon !== undefined ? weapon : d.weapon,
    armor: armor !== undefined ? armor : d.armor,
    spells: [], alive: true,
  };
  m.hp = m.maxhp; m.mp = m.maxmp;
  Object.keys(d.spellAt).forEach(function (k) { if (+k <= lv) m.spells.push(d.spellAt[k]); });
  return m;
}
// n人パーティ（1=主人公のみ / 2=+ユキ / 3=+カイ）
function mkParty(lv, w, a, n) {
  const party = [mkPlayer(lv, w, a)];
  if (n >= 2) party.push(mkAlly('yuki', lv, w > 1 ? w - 1 : 1, a > 1 ? a - 1 : 1));
  if (n >= 3) party.push(mkAlly('kai', lv, w > 1 ? w - 1 : 1, a > 1 ? a - 1 : 1));
  if (n >= 4) party.push(mkAlly('nagi', lv, w > 1 ? w - 1 : 1, a > 1 ? a - 1 : 1));
  return party;
}
const atkOf = (p) => p.baseAtk + WEAPONS[p.weapon].atk;
const defOf = (p) => p.baseDef + ARMORS[p.armor].def;

function makeGroup(enemyId, forceOne) {
  const d = ENEMIES[enemyId];
  const n = forceOne ? 1 : 1 + Math.floor(Math.random() * (d.max || 1));
  const g = [];
  for (let i = 0; i < n; i++)
    g.push({ def: d, name: d.name, hp: d.hp, maxhp: d.hp, sleep: 0, alive: true, defDown: 0, raged: false });
  return g;
}
const elemMul = (def, elem) => (!elem ? 1 : def.weak === elem ? 1.6 : def.resist === elem ? 0.5 : 1);
const isAlive = (m) => m.alive !== false && m.hp > 0;

function simBattle(party, group) {
  if (!Array.isArray(party)) party = [party];
  const inv = party[0].items || (party[0].items = { yakusou: 6 });
  let turns = 0, heals = 0, revives = 0;
  const livingE = () => group.filter((e) => e.alive);
  const livingP = () => party.filter(isAlive);

  while (turns < 90) {
    turns++;
    if (!livingE().length) return { win: true, fled: false, turns, heals, revives };
    if (!livingP().length) return { win: false, fled: false, turns, heals, revives };

    /* --- 味方の行動（1人ずつ）--- */
    let fled = false;
    for (const m of party) {
      if (!isAlive(m) || !livingE().length) continue;
      const alive = livingE();
      const hurt = livingP().slice().sort((a, b) => a.hp / a.maxhp - b.hp / b.maxhp)[0];
      const down = party.filter((x) => !isAlive(x));
      const has = (id) => m.spells.indexOf(id) >= 0 && m.mp >= SPELLS[id].mp;

      // 1) 倒れた仲間がいれば蘇生（パーティ制の肝）
      const rev = has('zaorik') ? 'zaorik' : has('zaoral') ? 'zaoral' : null;
      if (down.length && rev) {
        m.mp -= SPELLS[rev].mp;
        const t = down[0];
        if (SPELLS[rev].power() >= 1 || Math.random() < 0.6) {
          t.alive = true; t.hp = Math.max(1, Math.round(t.maxhp * SPELLS[rev].power()));
          revives++;
        }
        continue;
      }
      // 2) 危ないメンバーを回復
      const lowAll = livingP().filter((x) => x.hp < x.maxhp * 0.45).length >= 2;
      const healAll = has('behomara') ? 'behomara' : null;
      const heal1 = has('behoma') ? 'behoma' : has('behoimi') ? 'behoimi' : has('hoimi') ? 'hoimi' : null;
      if (lowAll && healAll) {
        m.mp -= SPELLS[healAll].mp;
        livingP().forEach((x) => { x.hp = Math.min(x.maxhp, x.hp + SPELLS[healAll].power()); });
        heals++; continue;
      }
      if (hurt.hp < hurt.maxhp * 0.4 && heal1) {
        m.mp -= SPELLS[heal1].mp;
        hurt.hp = Math.min(hurt.maxhp, hurt.hp + SPELLS[heal1].power());
        heals++; continue;
      }
      if (hurt.hp < hurt.maxhp * 0.35 && inv.yakusou > 0) {
        inv.yakusou--;
        hurt.hp = Math.min(hurt.maxhp, hurt.hp + 22 + Math.floor(Math.random() * 9));
        heals++; continue;
      }
      // 3) 逃走（全員が瀕死で回復手段が尽きたとき）
      if (m === party[0] && livingP().every((x) => x.hp < x.maxhp * 0.22)
          && group[0].def.flee !== false) {
        let rate = group.some((e) => e.def.agi) ? 0.45 : 0.68;
        rate += 0.18;
        if (Math.random() < rate) { fled = true; break; }
        continue;
      }
      // 4) 攻撃：全体呪文 → 弱点呪文 → 物理
      const phys = Math.max(1, atkOf(m) - Math.max(0, alive[0].def.def - alive[0].defDown) / 2);
      let best = null, bestScore = phys * 1.25;
      m.spells.forEach((id) => {
        const sp = SPELLS[id];
        if (sp.kind !== 'attack' || m.mp < sp.mp) return;
        const per = { mera: 13, hyado: 19, begirama: 32, raidein: 46, mahyado: 69, ionazun: 122, merazoma: 157 }[id] || 20;
        const tot = sp.all
          ? alive.reduce((s2, e) => s2 + per * elemMul(e.def, sp.elem), 0)
          : per * elemMul(alive[0].def, sp.elem);
        if (tot > bestScore && m.mp > m.maxmp * 0.3) { best = { id, sp }; bestScore = tot; }
      });
      if (best) {
        m.mp -= best.sp.mp;
        (best.sp.all ? alive : [alive[0]]).forEach((e) => {
          e.hp -= Math.max(1, Math.round(best.sp.power() * elemMul(e.def, best.sp.elem)));
          if (e.hp <= 0) e.alive = false;
        });
      } else {
        const e = alive[0];
        const dmg = isCrit() ? Math.floor(atkOf(m) * (0.95 + Math.random() * 0.2))
          : damage(atkOf(m), Math.max(0, e.def.def - e.defDown));
        e.hp -= dmg;
        if (e.hp <= 0) e.alive = false;
      }
    }
    if (fled) return { win: false, fled: true, turns, heals, revives };
    if (!livingE().length) return { win: true, fled: false, turns, heals, revives };

    /* --- 敵の行動（生存メンバーからランダムに狙う）--- */
    for (const e of group) {
      if (!e.alive) continue;
      const rg = e.def.rage;
      if (rg && !e.raged && e.hp <= e.maxhp * rg.at) { e.raged = true; continue; }
      const cur = e.raged ? Object.assign({}, e.def, e.def.rage) : e.def;
      if (e.sleep > 0) { e.sleep--; continue; }
      const want = (e.raged && e.def.rage && e.def.rage.acts) || e.def.acts || 1;
      const times = Math.max(1, Math.min(want, livingP().length));
      for (let rep = 0; rep < times; rep++) {
        const alive = livingP();
        if (!alive.length) break;
        // 全体ブレス
        if (cur.breath && cur.breathAll && Math.random() < cur.breath) {
          alive.forEach((x) => {
            x.hp = Math.max(0, x.hp - (26 + Math.floor(Math.random() * 14)));
            if (x.hp <= 0) x.alive = false;
          });
          continue;
        }
        const hurt = alive.slice().sort((a, b) => a.hp / a.maxhp - b.hp / b.maxhp)[0];
        const t = Math.random() < 0.35 ? hurt : alive[(Math.random() * alive.length) | 0];
        let dmg;
        if (cur.breath && Math.random() < cur.breath) dmg = 26 + Math.floor(Math.random() * 14);
        else if (cur.spell && Math.random() < cur.spell.rate) dmg = Math.max(1, Math.floor(SPELLS[cur.spell.id].power() * 0.85));
        else dmg = damage(cur.atk, defOf(t));
        t.hp = Math.max(0, t.hp - dmg);
        if (t.hp <= 0) t.alive = false;
      }
    }
  }
  return { win: false, fled: false, turns, heals, revives, timeout: true };
}

/* =====================================================================
   1) 雑魚戦：Lv別の勝率と平均ターン数
   ===================================================================== */
console.log('=== 雑魚戦の勝率（やくそう6個持ち・N=2000）===');
console.log('敵\\Lv        ' + [3, 5, 7, 9, 10, 11, 12].map((l) => 'Lv' + String(l).padEnd(4)).join(''));
const zako = ['slime', 'bat', 'spider', 'goblin', 'wolf', 'skeleton', 'mage', 'serpent', 'statue', 'guardian'];
zako.forEach((id) => {
  const row = [3, 5, 7, 9, 10, 11, 12].map((lv) => {
    // その頃に現実的な装備
    const w = lv <= 2 ? 1 : lv <= 4 ? 2 : lv <= 6 ? 3 : lv <= 9 ? 4 : 5;
    const a = lv <= 2 ? 1 : lv <= 4 ? 2 : lv <= 6 ? 3 : lv <= 9 ? 4 : 5;
    let win = 0;
    for (let i = 0; i < 2000; i++) if (simBattle(mkParty(lv, w, a, 1), makeGroup(id)).win) win++;
    return String(Math.round((win / 2000) * 100)).padStart(3) + '% ';
  });
  console.log(ENEMIES[id].name.padEnd(12, '　').slice(0, 12) + ' ' + row.join(''));
});

/* =====================================================================
   2) ボス戦：レベル×装備 別の勝率
   ===================================================================== */
console.log('\n=== やみのりゅう の勝率（やくそう6個・N=4000）===');
const kits = [
  { label: 'てつのやり＋くさりかたびら（宝箱のみ）', w: 3, a: 3 },
  { label: 'はがねのつるぎ＋くさりかたびら（620G購入）', w: 4, a: 3 },
  { label: 'はがねのつるぎ＋てつのよろい（フル装備）', w: 4, a: 4 },
];
kits.forEach((k) => {
  const cells = [6, 7, 8, 9, 10, 11, 12].map((lv) => {
    let win = 0, turnSum = 0;
    for (let i = 0; i < 4000; i++) {
      const r = simBattle(mkParty(lv, k.w, k.a, 3), makeGroup('boss', true));
      if (r.win) { win++; turnSum += r.turns; }
    }
    return { lv, rate: win / 4000, turns: win ? turnSum / win : 0 };
  });
  console.log('\n' + k.label);
  console.log('  ' + cells.map((c) => 'Lv' + c.lv + ': ' + String(Math.round(c.rate * 100)).padStart(3) + '%').join('   '));
  console.log('  平均ターン ' + cells.map((c) => (c.turns ? c.turns.toFixed(1) : '—')).join('  '));
});

/* =====================================================================
   2.2) 仲間の有無で難易度がどう変わるか（パーティ制の効き目）
   ===================================================================== */
console.log('\n=== 人数別の勝率（N=2000）===');
[['やみのりゅう', 'boss', [6, 7, 8, 9]], ['ガレン', 'galen', [9, 10, 11, 12]],
 ['はじまりの りゅう', 'elderdragon', [14, 17, 20, 23, 26]],
 ['ヴェルドの まぼろし', 'phantom', [24, 28, 32, 36, 40]]].forEach(([label, id, lvs]) => {
  console.log('  ' + label);
  [1, 2, 3, 4].forEach((n) => {
    const cells = lvs.map((lv) => {
      let win = 0;
      for (let i = 0; i < 2000; i++)
        if (simBattle(mkParty(lv, id === 'boss' ? 4 : 5, id === 'boss' ? 4 : 5, n), makeGroup(id, true)).win) win++;
      return 'Lv' + lv + ':' + String(Math.round((win / 2000) * 100)).padStart(4) + '%';
    });
    console.log(`    ${n}人  ` + cells.join('  '));
  });
});

/* =====================================================================
   2.3) 裏ボス ガレン（竜を倒したあとに戦える）
   ===================================================================== */
console.log('\n=== ガレン の勝率（灯台装備・N=2500）===');
{
  const cells = [9, 10, 11, 12].map((lv) => {
    let win = 0, tSum = 0;
    for (let i = 0; i < 2500; i++) {
      const r = simBattle(mkParty(lv, 5, 5, 3), makeGroup('galen', true));
      if (r.win) { win++; tSum += r.turns; }
    }
    return 'Lv' + lv + ': ' + String(Math.round((win / 2500) * 100)).padStart(3) + '%'
      + '(' + (win ? (tSum / win).toFixed(1) : '-') + 'T)';
  });
  console.log('  ' + cells.join('  '));
}

/* =====================================================================
   2.4) 灯台の装備を取ったあと、ボス戦が作業にならないか
   ===================================================================== */
console.log('\n=== 灯台装備でのボス戦（壊れていないかの確認）===');
[{ label: 'はがねのつるぎ＋てつのよろい（買える最強）', w: 4, a: 4 },
 { label: 'うみなりのやり＋りゅうのローブ（灯台の報酬）', w: 5, a: 5 }]
  .forEach((k) => {
    const cells = [6, 7, 8].map((lv) => {
      let win = 0, tSum = 0;
      for (let i = 0; i < 3000; i++) {
        const r = simBattle(mkParty(lv, k.w, k.a, 3), makeGroup('boss', true));
        if (r.win) { win++; tSum += r.turns; }
      }
      return 'Lv' + lv + ': ' + String(Math.round((win / 3000) * 100)).padStart(3) + '%'
        + '(' + (win ? (tSum / win).toFixed(1) : '-') + 'T)';
    });
    console.log('  ' + k.label + '\n    ' + cells.join('  '));
  });

/* =====================================================================
   2.5) 中ボス「もんばんの がいこつ」
   ===================================================================== */
console.log('\n=== もんばんの がいこつ の勝率（N=3000）===');
[{ label: 'どうのつるぎ＋かわのよろい', w: 2, a: 2 }, { label: 'てつのやり＋かわのよろい', w: 3, a: 2 }]
  .forEach((k) => {
    const cells = [5, 6, 7, 8, 9].map((lv) => {
      let win = 0;
      for (let i = 0; i < 3000; i++) if (simBattle(mkParty(lv, k.w, k.a, 2), makeGroup('gatekeeper', true)).win) win++;
      return 'Lv' + lv + ': ' + String(Math.round((win / 3000) * 100)).padStart(3) + '%';
    });
    console.log('  ' + k.label + '  ' + cells.join('  '));
  });

/* =====================================================================
   3) レベリング：普通に戦い続けて何戦でボスに挑めるか
   ===================================================================== */
console.log('\n=== レベリング（負けたら宿で全快して継続／敵は場所相応）===');
function grind(trials) {
  const stats = [];
  for (let t = 0; t < trials; t++) {
    const p = mkPlayer(1, 1, 1);
    p.exp = 0; p.gold = 24; p.kills = 0;
    let battles = 0, deaths = 0;
    const hist = {};
    while (p.lv < 10 && battles < 400) {
      // 進行に応じた狩り場
      const table = p.lv <= 3 ? G.ENC.field_near.table
        : p.lv <= 5 ? G.ENC.field_far.table
          : p.lv <= 7 ? G.ENC.cave1.table : G.ENC.cave2.table;
      const id = table[Math.floor(Math.random() * table.length)];
      const r = simBattle([p], makeGroup(id));
      battles++;
      if (r.win) {
        p.exp += ENEMIES[id].exp; p.gold += ENEMIES[id].gold; p.kills++;   // 1体ぶんで控えめに見積もる
      } else if (!r.fled) {
        deaths++; p.gold = Math.floor(p.gold / 2);
      }
      // レベルアップ
      while (p.lv < LEVELS.length && p.exp >= LEVELS[p.lv].exp) {
        p.lv++;
        const L = LEVELS[p.lv - 1];
        p.maxhp = L.hp; p.maxmp = L.mp; p.baseAtk = L.atk; p.baseDef = L.def;
        if (L.learn && !p.spells.includes(L.learn)) p.spells.push(L.learn);
        if (!hist[p.lv]) hist[p.lv] = battles;
      }
      // 宿に戻って全快（HP3割以下 or やくそう切れ）
      if (p.hp < p.maxhp * 0.3 || !p.items.yakusou) {
        if (p.gold >= 6) { p.gold -= 6; p.hp = p.maxhp; p.mp = p.maxmp; }
        else { p.hp = p.maxhp; p.mp = p.maxmp; }
        // やくそう補充（12G）
        while (p.items.yakusou < 6 && p.gold >= 12) { p.gold -= 12; p.items.yakusou++; }
      }
      // 装備更新（買えるものは買う）
      for (let wi = WEAPONS.length - 1; wi > p.weapon; wi--)
        if (p.gold >= WEAPONS[wi].price) { p.gold -= WEAPONS[wi].price; p.weapon = wi; break; }
      for (let ai = ARMORS.length - 1; ai > p.armor; ai--)
        if (p.gold >= ARMORS[ai].price) { p.gold -= ARMORS[ai].price; p.armor = ai; break; }
    }
    stats.push({ battles, deaths, gold: p.gold, w: p.weapon, a: p.armor, hist });
  }
  return stats;
}
const gs = grind(300);
const avg = (f) => (gs.reduce((s, x) => s + f(x), 0) / gs.length);
console.log('  Lv10 到達までの戦闘数（平均）: ' + avg((x) => x.battles).toFixed(0) + ' 戦');
console.log('  その間の死亡回数（平均）      : ' + avg((x) => x.deaths).toFixed(1) + ' 回');
console.log('  到達時の装備                  : ' +
  WEAPONS[Math.round(avg((x) => x.w))].name + ' / ' + ARMORS[Math.round(avg((x) => x.a))].name);
console.log('  余ったゴールド（平均）        : ' + avg((x) => x.gold).toFixed(0) + 'G');
const lvHist = {};
[2, 3, 4, 5, 6, 7, 8, 9, 10].forEach((l) => {
  const vals = gs.map((x) => x.hist[l]).filter((v) => v !== undefined);
  lvHist[l] = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(0) : '—';
});
console.log('  各レベル到達までの累計戦闘数  : ' +
  Object.keys(lvHist).map((l) => 'Lv' + l + '=' + lvHist[l]).join(' '));

// 1戦あたりの体感時間から総プレイ時間を概算
const perBattle = 18;   // 秒（メッセージ送り込み）
const walk = 0.55;      // 戦闘以外（歩き・買い物）の割合
const b = avg((x) => x.battles);
console.log('\n  概算プレイ時間: 戦闘 ' + b.toFixed(0) + '戦 × ' + perBattle + '秒 ÷ (1-' + walk + ') ≒ '
  + Math.round((b * perBattle) / (1 - walk) / 60) + '分');
