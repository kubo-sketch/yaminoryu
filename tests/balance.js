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

/* ---------------- プレイヤーを作る ---------------- */
function mkPlayer(lv, weapon, armor) {
  const L = LEVELS[lv - 1];
  const p = {
    lv: lv, maxhp: L.hp, hp: L.hp, maxmp: L.mp, mp: L.mp,
    baseAtk: L.atk, baseDef: L.def, weapon: weapon, armor: armor,
    spells: [], items: { yakusou: 6 },
  };
  for (let i = 0; i < lv; i++) if (LEVELS[i].learn) p.spells.push(LEVELS[i].learn);
  return p;
}
const atkOf = (p) => p.baseAtk + WEAPONS[p.weapon].atk;
const defOf = (p) => p.baseDef + ARMORS[p.armor].def;

/* ---------------- 1戦闘のシミュレーション ----------------
   battle.js と同じ規則で回す：複数敵・属性倍率・ぼうぎょ・ボスの形態変化。
   プレイヤーAIは「弱点を突く／複数なら全体攻撃／危なければ回復か防御」。 */
function makeGroup(enemyId, forceOne) {
  const d = ENEMIES[enemyId];
  const n = forceOne ? 1 : 1 + Math.floor(Math.random() * (d.max || 1));
  const g = [];
  for (let i = 0; i < n; i++)
    g.push({ def: d, name: d.name, hp: d.hp, maxhp: d.hp, sleep: 0, alive: true, defDown: 0, raged: false });
  return g;
}
const elemMul = (def, elem) => (!elem ? 1 : def.weak === elem ? 1.6 : def.resist === elem ? 0.5 : 1);

function simBattle(p, group) {
  let turns = 0, heals = 0, defends = 0;
  const living = () => group.filter((e) => e.alive);

  while (turns < 80) {
    turns++;
    const alive = living();
    if (!alive.length) return { win: true, fled: false, turns, hpLeft: p.hp, heals, defends };

    /* --- プレイヤー --- */
    const lowHp = p.hp < p.maxhp * 0.38;
    const healSpell = p.spells.includes('behoimi') && p.mp >= SPELLS.behoimi.mp ? 'behoimi'
      : (p.spells.includes('hoimi') && p.mp >= SPELLS.hoimi.mp ? 'hoimi' : null);
    let defending = false, acted = false;

    if (lowHp && healSpell) {
      p.mp -= SPELLS[healSpell].mp;
      p.hp = Math.min(p.maxhp, p.hp + SPELLS[healSpell].power());
      heals++; acted = true;
    } else if (lowHp && p.items.yakusou > 0) {
      p.items.yakusou--;
      p.hp = Math.min(p.maxhp, p.hp + 22 + Math.floor(Math.random() * 9));
      heals++; acted = true;
    } else if (p.hp < p.maxhp * 0.25) {
      // 回復手段が尽きたら、逃げるか身を守る
      if (group[0].def.flee !== false && Math.random() < 0.5) {
        if (Math.random() < (group.some((e) => e.def.agi) ? 0.45 : 0.68))
          return { win: false, fled: true, turns, hpLeft: p.hp, heals, defends };
      } else { defending = true; defends++; p.mp = Math.min(p.maxmp, p.mp + 1); acted = true; }
    }

    if (!acted) {
      // 攻撃：全体攻撃 → 弱点呪文 → 通常攻撃 の順で価値を見る
      const atk = atkOf(p);
      const cands = [];
      p.spells.forEach((id) => {
        const sp = SPELLS[id];
        if (sp.kind !== 'attack' || p.mp < sp.mp) return;
        const base = 30;   // power() の期待値のおおよそ
        alive.forEach(() => {});
        const per = (id === 'mera' ? 13 : id === 'hyado' ? 19 : id === 'begirama' ? 32 : 46);
        const tot = sp.all
          ? alive.reduce((s2, e) => s2 + per * elemMul(e.def, sp.elem), 0)
          : per * elemMul(alive[0].def, sp.elem);
        // MPは有限なので、通常攻撃より十分強いときだけ使う
        cands.push({ id, sp, score: tot, mp: sp.mp });
      });
      const phys = Math.max(1, atk - Math.max(0, alive[0].def.def - alive[0].defDown) / 2);
      const best = cands.sort((a, b) => b.score - a.score)[0];
      const mpRoom = p.mp > p.maxmp * 0.35;
      if (best && mpRoom && best.score > phys * 1.25) {
        p.mp -= best.sp.mp;
        const targets = best.sp.all ? alive : [alive[0]];
        targets.forEach((e) => {
          const dmg = Math.max(1, Math.round(best.sp.power() * elemMul(e.def, best.sp.elem)));
          e.hp -= dmg;
          if (e.hp <= 0) e.alive = false;
        });
      } else {
        const e = alive[0];
        const dmg = isCrit() ? Math.floor(atk * (0.95 + Math.random() * 0.2))
          : damage(atk, Math.max(0, e.def.def - e.defDown));
        e.hp -= dmg;
        if (e.hp <= 0) e.alive = false;
      }
    }
    if (!living().length) return { win: true, fled: false, turns, hpLeft: p.hp, heals, defends };

    /* --- 敵（生存している順に行動） --- */
    for (const e of group) {
      if (!e.alive) continue;
      const rg = e.def.rage;
      if (rg && !e.raged && e.hp <= e.maxhp * rg.at) { e.raged = true; continue; }   // 変身に1ターン使う
      const cur = e.raged ? Object.assign({}, e.def, e.def.rage) : e.def;
      if (e.sleep > 0) { e.sleep--; continue; }
      let dmg;
      if (cur.breath && Math.random() < cur.breath) dmg = 26 + Math.floor(Math.random() * 14);
      else if (cur.spell && Math.random() < cur.spell.rate) dmg = Math.max(1, Math.floor(SPELLS[cur.spell.id].power() * 0.85));
      else dmg = damage(cur.atk, defOf(p));
      if (defending) dmg = Math.max(1, Math.floor(dmg * 0.5));
      p.hp = Math.max(0, p.hp - dmg);
      if (p.hp <= 0) return { win: false, fled: false, turns, hpLeft: 0, heals, defends };
    }
  }
  return { win: false, fled: false, turns, hpLeft: p.hp, heals, defends, timeout: true };
}

/* =====================================================================
   1) 雑魚戦：Lv別の勝率と平均ターン数
   ===================================================================== */
console.log('=== 雑魚戦の勝率（やくそう6個持ち・N=2000）===');
console.log('敵\\Lv        ' + [1, 2, 3, 4, 5, 6, 7, 8].map((l) => 'Lv' + String(l).padEnd(4)).join(''));
const zako = ['slime', 'bat', 'goblin', 'skeleton', 'mage', 'serpent', 'statue'];
zako.forEach((id) => {
  const row = [1, 2, 3, 4, 5, 6, 7, 8].map((lv) => {
    // その頃に現実的な装備
    const w = lv <= 2 ? 1 : lv <= 4 ? 2 : lv <= 6 ? 3 : 4;
    const a = lv <= 2 ? 1 : lv <= 4 ? 2 : lv <= 6 ? 3 : 3;
    let win = 0;
    for (let i = 0; i < 2000; i++) if (simBattle(mkPlayer(lv, w, a), makeGroup(id)).win) win++;
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
      const r = simBattle(mkPlayer(lv, k.w, k.a), makeGroup('boss', true));
      if (r.win) { win++; turnSum += r.turns; }
    }
    return { lv, rate: win / 4000, turns: win ? turnSum / win : 0 };
  });
  console.log('\n' + k.label);
  console.log('  ' + cells.map((c) => 'Lv' + c.lv + ': ' + String(Math.round(c.rate * 100)).padStart(3) + '%').join('   '));
  console.log('  平均ターン ' + cells.map((c) => (c.turns ? c.turns.toFixed(1) : '—')).join('  '));
});

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
        const r = simBattle(mkPlayer(lv, k.w, k.a), makeGroup('boss', true));
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
      for (let i = 0; i < 3000; i++) if (simBattle(mkPlayer(lv, k.w, k.a), makeGroup('gatekeeper', true)).win) win++;
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
      const r = simBattle(p, makeGroup(id));
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
