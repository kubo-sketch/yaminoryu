/* =====================================================================
   story.js — シナリオの進行が破綻していないかを機械的に確かめる
   ---------------------------------------------------------------------
   ・受注前に証拠品を取れてしまわないか（順序の逆転）
   ・受注 → 発見 → 報告 で必ず完了に到達するか
   ・報酬が二重取りできないか
   ・読み物がすべて到達可能な位置にあるか
   ・エンディングが達成状況で分岐するか
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', 'src');

global.window = {};
global.document = {
  createElement: () => ({ getContext: () => ({}) }),
  getElementById: () => null,
  querySelectorAll: () => ({ forEach: () => {} }),
};
['data.js', 'maps.js'].forEach((f) => new Function(fs.readFileSync(path.join(ROOT, f), 'utf8'))());
const G = global.window.G;
G.buildMaps();

let err = 0;
const fail = (m) => { console.log('  ✗ ' + m); err++; };
const ok = (m) => console.log('  ✓ ' + m);

/* ---- クエスト進行のシミュレーション ---- */
// 実ロジック（field.pickUp / 墓守の talk）を再現して順序を確かめる
G.flags = { q: {}, read: {}, chests: {} };
G.player = { name: 'ユウ', gold: 0, items: {} };
G.audio = { se: () => {} };

const cave1 = G.MAPS.cave1;
const keepsake = cave1.events.find((e) => e.type === 'pickup');
if (!keepsake) fail('洞窟に証拠品(pickup)が置かれていない');

function tryPickup() {
  const q = G.flags.q;
  if (keepsake.needQuest && (q[keepsake.needQuest] || 0) < 1) return 'locked';
  if (q[keepsake.setQuest] >= keepsake.setValue) return 'taken';
  q[keepsake.setQuest] = keepsake.setValue;
  return 'got';
}
// 墓守 NPC の talk をそのまま呼ぶ
const keeper = G.MAPS.town.npcs.find((n) => n.x === 3 && n.y === 11);   // 墓守（座標で特定）
if (!keeper) fail('町に墓守(依頼人)がいない');
const talk = () => keeper.talk();

console.log('=== クエスト「かえらぬ3人」===');
// 1) 受注前は拾えない
if (tryPickup() !== 'locked') fail('受注前に証拠品を拾えてしまう（順序が逆転する）');
else ok('受注前は拾えない');

// 2) 依頼人に話すと受注
talk();
if ((G.flags.q.missing || 0) < 1) fail('話しても受注状態にならない');
else ok('依頼人に話して受注');

// 3) 受注後は拾える
if (tryPickup() !== 'got') fail('受注後に証拠品を拾えない');
else ok('証拠品を拾得');

// 4) 二度目は拾えない
if (tryPickup() !== 'taken') fail('証拠品を何度でも拾えてしまう');
else ok('拾得は一度きり');

// 5) 報告で完了し、報酬が入る
const goldBefore = G.player.gold;
talk();
if (G.flags.q.missing < 3) fail('報告しても完了しない');
else if (G.player.gold <= goldBefore) fail('報酬のゴールドが入らない');
else if (!G.player.items.yakusou) fail('報酬のアイテムが入らない');
else ok(`報告で完了（+${G.player.gold - goldBefore}G, やくそう×${G.player.items.yakusou}）`);

// 6) 完了後に話しても報酬が増えない（二重取り防止）
const g2 = G.player.gold, y2 = G.player.items.yakusou;
talk(); talk();
if (G.player.gold !== g2 || G.player.items.yakusou !== y2) fail('報酬を何度でも受け取れてしまう');
else ok('報酬の二重取りなし');

/* ---- 読み物がすべて到達可能な場所にあるか ---- */
console.log('\n=== 読み物（竜の背景）===');
const reads = [];
for (const id of Object.keys(G.MAPS))
  (G.MAPS[id].events || []).forEach((e) => { if (e.type === 'read') reads.push({ map: id, e }); });
if (reads.length < 3) fail(`読み物が ${reads.length} 個しかない（3個以上を想定）`);
reads.forEach(({ map, e }) => {
  const m = G.MAPS[map];
  const around = [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => {
    const ch = m.rows[e.y + dy] && m.rows[e.y + dy][e.x + dx];
    return ch && G.TILEDEF[ch] && G.TILEDEF[ch].walk;
  });
  const here = G.TILEDEF[m.rows[e.y][e.x]];
  if (!around && !(here && here.walk)) fail(`読み物 ${e.id} (${map} ${e.x},${e.y}) に近づけない`);
  else ok(`${e.id} @ ${map}(${e.x},${e.y})`);
});

/* ---- エンディングが分岐するか ---- */
console.log('\n=== エンディングの分岐 ===');
// startEnding は main.js 内で DOM に触れるため、条件式だけを同じ形で確かめる
function endingShape(flags) {
  const lore = flags.read && flags.read.d1 && flags.read.d2 && flags.read.d3;
  const quest = flags.q && flags.q.missing >= 3;
  return { lore: !!lore, quest: !!quest };
}
const a = endingShape({ read: {}, q: {} });
const b = endingShape({ read: { d1: 1, d2: 1, d3: 1 }, q: { missing: 3 } });
if (a.lore || a.quest) fail('何もしていないのに分岐が立つ');
else ok('未達成：通常エンド');
if (!b.lore || !b.quest) fail('全部やっても分岐が立たない');
else ok('全達成：真相＋後日談エンド');

/* ---- 裏ボスの解放条件 ---- */
console.log('\n=== 裏ボス ガレン ===');
const t2 = G.MAPS.tower2, t3 = G.MAPS.tower3;
if (!t3) fail('とうだいの おくのま(tower3)が無い');
else {
  const gate = (t2.events || []).find((e) => e.to === 'tower3');
  if (!gate) fail('最上階から奥の間への通路が無い');
  else if (gate.requires !== 'bossDead') fail('竜を倒す前に裏ボスへ行けてしまう');
  else ok('竜を倒すまで奥の間は開かない');
  const gb = (t3.events || []).filter((e) => e.type === 'boss');
  if (!gb.length) fail('奥の間にガレンが配置されていない');
  else if (gb.some((e) => e.flag !== 'galenDead')) fail('ガレンの撃破フラグが正しくない');
  else ok(`ガレン戦の起動点 ${gb.length} か所`);
  const def = G.ENEMIES.galen;
  if (!def) fail('ガレンのデータが無い');
  else if (!def.truelast) fail('ガレンに truelast 指定が無い（真エンド分岐が動かない）');
  else if (!def.rage) fail('ガレンに形態変化が無い');
  else ok(`ガレン HP${def.hp} こうげき${def.atk}→${def.rage.atk}（形態変化あり）`);
}

/* ---- 灯台の発見が町の会話に反映されるか ---- */
console.log('\n=== 発見の持ち帰り ===');
G.flags.read = {}; G.flags.q = { missing: 3 };
const before = JSON.stringify(keeper.talk());
G.flags.read.g4 = 1;
const after = JSON.stringify(keeper.talk());
if (before === after) fail('灯台の手帳を読んでも墓守の話が変わらない');
else ok('墓守：灯台の手帳を読むと話が変わる');
const capt = G.MAPS.port.npcs.find((n) => n.spr === 'king');
G.flags.read = {};
const b2 = JSON.stringify(capt.talk());
G.flags.read.g3 = 1;
if (b2 === JSON.stringify(capt.talk())) fail('研究日誌を読んでも船長の話が変わらない');
else ok('船長：研究日誌を読むと話が変わる');

/* ---- 竜討伐後、町の空気が変わるか ---- */
console.log('\n=== 後日談（竜を倒したあと）===');
{
  let changed = 0, fixed = 0;
  ['town', 'port'].forEach((id) => {
    (G.MAPS[id].npcs || []).forEach((n) => {
      if (typeof n.talk !== 'function') { fixed++; return; }
      G.flags = { q: { missing: 0 }, read: {}, bossDead: 0, galenDead: 0, chests: {} };
      const a = JSON.stringify(n.talk());
      G.flags.bossDead = 1;
      const b = JSON.stringify(n.talk());
      if (a !== b) changed++;
    });
  });
  const total = (G.MAPS.town.npcs || []).length + (G.MAPS.port.npcs || []).length;
  console.log(`  会話が変わるNPC ${changed} / ${total}（うち固定文のまま ${fixed}）`);
  if (changed < 6) fail('竜を倒しても町の空気がほとんど変わらない');
  else ok('討伐後に町の会話が変わる');
}

/* ---- 毒が機能しているか ---- */
console.log('\n=== 状態異常「どく」===');
{
  const poisoners = Object.keys(G.ENEMIES).filter((k) => G.ENEMIES[k].poison);
  if (!poisoners.length) fail('毒を与える敵がいない（解毒薬が無意味になる）');
  else ok('毒を持つ敵: ' + poisoners.map((k) => G.ENEMIES[k].name).join('・'));
  if (!G.POISON) fail('毒の効果量が定義されていない');
  else {
    const bd = G.POISON.battleDamage(100), sd = G.POISON.stepDamage(100);
    if (bd <= 0 || sd <= 0) fail('毒のダメージが0');
    else ok(`最大HP100のとき 戦闘${bd}/ターン・歩行${sd}/${G.POISON.stepInterval}歩`);
  }
  const cure = G.ITEMS.dokukesi;
  if (!cure) fail('解毒手段が無い');
  else ok('どくけしそう ' + cure.price + 'G で購入可');
  // 毒を出す敵が、実際に出現テーブルに載っているか
  const inTable = Object.keys(G.ENC).some((k) => G.ENC[k].table.some((e) => G.ENEMIES[e].poison));
  if (!inTable) fail('毒を持つ敵がどのエンカウント表にも載っていない');
  else ok('毒を持つ敵が出現テーブルに載っている');
}

/* ---- 隠し部屋 ---- */
console.log('\n=== 隠し部屋 ===');
{
  const m = G.MAPS.cave1;
  let secret = 0;
  m.rows.forEach((r) => { for (const ch of r) if (ch === '@') secret++; });
  if (!secret) fail('隠し通路タイルが無い');
  else ok(`隠し通路 ${secret} マス（見た目は壁・通行可）`);
  // ヒントを言うNPCがいるか
  const hint = ['town', 'port'].some((id) => (G.MAPS[id].npcs || []).some((n) => {
    const t = typeof n.talk === 'function' ? n.talk() : n.talk;
    return t && JSON.stringify(t).indexOf('にせもの') >= 0;
  }));
  if (!hint) fail('隠し通路のヒントを言うNPCがいない（発見不可能）');
  else ok('ヒントを言うNPCがいる');
}

/* ---- 海底遺跡アルシオン ---- */
console.log('\n=== しずんだ みやこ アルシオン ===');
{
  const ruin = G.MAPS.ruin, port = G.MAPS.port;
  if (!ruin) fail('海底遺跡(ruin)が無い');
  else {
    const ship = (port.events || []).filter((e) => e.to === 'ruin');
    if (!ship.length) fail('港から海底遺跡への船着き場が無い');
    else if (ship.some((e) => e.requires !== 'shipReady')) fail('黒幕を倒す前に海底へ行けてしまう');
    else ok('黒幕を倒すまで船は出ない');
    // 船長がフラグを立てるか
    G.flags = { read: {}, q: {}, bossDead: 1, galenDead: 1, chests: {} };
    const capt2 = port.npcs.find((n) => n.spr === 'king');
    capt2.talk();
    if (!G.flags.shipReady) fail('船長に話しても船が出ない（進行不能）');
    else ok('船長に話すと船が出る');
    // 碑文が4枚そろっているか
    const lore = (ruin.events || []).filter((e) => e.type === 'read');
    if (lore.length < 4) fail(`碑文が ${lore.length} 枚しかない`);
    else ok(`碑文 ${lore.length} 枚（輪の起源）`);
  }
}

/* ---- 天候が進行で変わるか ---- */
console.log('\n=== 天候 ===');
{
  let dynamic = 0, fixed = 0;
  for (const id of Object.keys(G.MAPS)) {
    const w = G.MAPS[id].weather;
    if (typeof w === 'function') dynamic++;
    else if (w) fixed++;
  }
  if (!fixed && !dynamic) fail('天候がどこにも設定されていない');
  else ok(`固定 ${fixed} マップ・進行で変わる ${dynamic} マップ`);
  G.flags.galenDead = 0;
  const before2 = G.MAPS.port.weather();
  G.flags.galenDead = 1;
  const after2 = G.MAPS.port.weather();
  if (before2 === after2) fail('港の天候が進行で変わらない');
  else ok(`港：討伐前=${before2 || 'なし'} → 討伐後=${after2}`);
}

console.log(err ? `\n【NG】${err}件` : '\n【OK】シナリオ進行に破綻なし');
process.exit(err ? 1 : 0);
