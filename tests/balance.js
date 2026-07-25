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

/* ---------------- 1戦闘のシミュレーション ---------------- */
// 戻り: {win, fled, turns, hpLeft, heals}
function simBattle(p, enemyId) {
  const d = ENEMIES[enemyId];
  let ehp = d.hp, sleep = 0, turns = 0, heals = 0;

  while (turns < 60) {
    turns++;

    /* --- プレイヤーの行動（人間らしい判断） --- */
    const lowHp = p.hp < p.maxhp * 0.38;
    const canHoimi = p.spells.includes('behoimi') && p.mp >= SPELLS.behoimi.mp
      ? 'behoimi' : (p.spells.includes('hoimi') && p.mp >= SPELLS.hoimi.mp ? 'hoimi' : null);
    let acted = false;

    if (lowHp && canHoimi) {
      p.mp -= SPELLS[canHoimi].mp;
      p.hp = Math.min(p.maxhp, p.hp + SPELLS[canHoimi].power());
      heals++; acted = true;
    } else if (lowHp && p.items.yakusou > 0) {
      p.items.yakusou--;
      p.hp = Math.min(p.maxhp, p.hp + 22 + Math.floor(Math.random() * 9));
      heals++; acted = true;
    } else if (p.hp < p.maxhp * 0.22 && d.flee !== false) {
      if (Math.random() < (d.agi ? 0.45 : 0.68)) return { win: false, fled: true, turns, hpLeft: p.hp, heals };
      acted = true;                                  // 逃げ失敗＝1ターン損
    }

    if (!acted) {
      // 攻撃呪文が通るならそちらを優先（ベギラマは通常攻撃より強い場面がある）
      const beg = p.spells.includes('begirama') && p.mp >= SPELLS.begirama.mp + 7;
      const phys = damage(atkOf(p), d.def);
      if (beg && 36 > phys) {
        p.mp -= SPELLS.begirama.mp;
        ehp -= Math.max(1, Math.floor(SPELLS.begirama.power() * 0.95));
      } else {
        ehp -= isCrit() ? Math.floor(atkOf(p) * (0.95 + Math.random() * 0.2)) : phys;
      }
      if (sleep > 0 && Math.random() < 0.4) sleep = 0;
    }
    if (ehp <= 0) return { win: true, fled: false, turns, hpLeft: p.hp, heals };

    /* --- 敵の行動（battle.js の enemyPhase と同じ分岐） --- */
    if (sleep > 0) { sleep--; continue; }
    if (d.breath && Math.random() < d.breath) {
      p.hp = Math.max(0, p.hp - (26 + Math.floor(Math.random() * 14)));
    } else if (d.spell && Math.random() < d.spell.rate) {
      p.hp = Math.max(0, p.hp - Math.max(1, Math.floor(SPELLS[d.spell.id].power() * 0.85)));
    } else {
      p.hp = Math.max(0, p.hp - damage(d.atk, defOf(p)));
    }
    if (p.hp <= 0) return { win: false, fled: false, turns, hpLeft: 0, heals };
  }
  return { win: false, fled: false, turns, hpLeft: p.hp, heals, timeout: true };
}

/* =====================================================================
   1) 雑魚戦：Lv別の勝率と平均ターン数
   ===================================================================== */
console.log('=== 雑魚戦の勝率（やくそう6個持ち・N=2000）===');
console.log('敵\\Lv        ' + [1, 2, 3, 4, 5, 6, 7, 8].map((l) => 'Lv' + String(l).padEnd(4)).join(''));
const zako = ['slime', 'bat', 'goblin', 'skeleton', 'mage'];
zako.forEach((id) => {
  const row = [1, 2, 3, 4, 5, 6, 7, 8].map((lv) => {
    // その頃に現実的な装備
    const w = lv <= 2 ? 1 : lv <= 4 ? 2 : lv <= 6 ? 3 : 4;
    const a = lv <= 2 ? 1 : lv <= 4 ? 2 : lv <= 6 ? 3 : 3;
    let win = 0;
    for (let i = 0; i < 2000; i++) if (simBattle(mkPlayer(lv, w, a), id).win) win++;
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
      const r = simBattle(mkPlayer(lv, k.w, k.a), 'boss');
      if (r.win) { win++; turnSum += r.turns; }
    }
    return { lv, rate: win / 4000, turns: win ? turnSum / win : 0 };
  });
  console.log('\n' + k.label);
  console.log('  ' + cells.map((c) => 'Lv' + c.lv + ': ' + String(Math.round(c.rate * 100)).padStart(3) + '%').join('   '));
  console.log('  平均ターン ' + cells.map((c) => (c.turns ? c.turns.toFixed(1) : '—')).join('  '));
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
      const r = simBattle(p, id);
      battles++;
      if (r.win) {
        p.exp += ENEMIES[id].exp; p.gold += ENEMIES[id].gold; p.kills++;
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
