// マップの整合性検証（node で実行。document 非依存の maps.js / data.js のみ読む）
const fs = require('fs');
const path = require('path');
const ROOT = require('path').join(__dirname, '..', 'src');

global.window = {};
new Function(fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8'))();
new Function(fs.readFileSync(path.join(ROOT, 'maps.js'), 'utf8'))();
const G = global.window.G;
G.buildMaps();

let errors = 0;
const err = (m) => { console.log('  ✗ ' + m); errors++; };

for (const id of Object.keys(G.MAPS)) {
  const m = G.MAPS[id];
  console.log(`\n=== ${id}  ${m.w}x${m.h}  "${m.name}" ===`);

  // 1) 未定義タイル文字
  const bad = new Set();
  m.rows.forEach((r) => { for (const ch of r) if (!G.TILEDEF[ch]) bad.add(ch); });
  if (bad.size) err('未定義タイル: ' + [...bad].join(' '));

  // 2) NPC が通行可能タイルの上にいるか
  (m.npcs || []).forEach((n) => {
    const ch = m.rows[n.y] && m.rows[n.y][n.x];
    const d = G.TILEDEF[ch];
    if (!d) err(`NPC(${n.spr}) が範囲外 (${n.x},${n.y})`);
    else if (!d.walk) err(`NPC(${n.spr}) が通行不可タイル '${ch}' の上 (${n.x},${n.y})`);
  });

  // 3) イベント座標のタイル
  (m.events || []).forEach((e) => {
    const ch = m.rows[e.y] && m.rows[e.y][e.x];
    if (ch === undefined) { err(`event(${e.type}) 範囲外 (${e.x},${e.y})`); return; }
    const d = G.TILEDEF[ch];
    if ((e.type === 'warp' || e.type === 'boss') && !d.walk)
      err(`${e.type} が通行不可タイル '${ch}' の上 (${e.x},${e.y}) — 踏めないので発動しない`);
    if (e.type === 'sign' && ch !== 'S') err(`sign の位置に看板タイルが無い (${e.x},${e.y}) = '${ch}'`);
    if (e.type === 'chest' && ch !== '$') err(`chest の位置に宝箱タイルが無い (${e.x},${e.y}) = '${ch}'`);
  });

  // 4) ワープ先の検証（相手マップで通行可能か）
  (m.events || []).forEach((e) => {
    if (e.type !== 'warp') return;
    const t = G.MAPS[e.to];
    if (!t) { err(`warp 先マップが無い: ${e.to}`); return; }
    const ch = t.rows[e.ty] && t.rows[e.ty][e.tx];
    if (ch === undefined) err(`warp 先が範囲外 ${e.to}(${e.tx},${e.ty})`);
    else if (!G.TILEDEF[ch].walk) err(`warp 先が通行不可 ${e.to}(${e.tx},${e.ty}) = '${ch}'`);
  });

  // 5) 隣接して調べるもの（看板・宝箱）に近づけるか
  (m.events || []).forEach((e) => {
    if (e.type !== 'sign' && e.type !== 'chest') return;
    const around = [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => {
      const ch = m.rows[e.y + dy] && m.rows[e.y + dy][e.x + dx];
      return ch && G.TILEDEF[ch] && G.TILEDEF[ch].walk;
    });
    if (!around) err(`${e.type}(${e.x},${e.y}) の四方が全て通行不可 — 調べられない`);
  });
}

/* ---- 到達可能性：町のスタートから全ワープを辿って BFS ---- */
console.log('\n=== 到達可能性（スタート地点から歩いて行けるか）===');
const start = { map: 'town', x: 13, y: 18 };
const seen = new Set();
const q = [start];
const reachedWarps = new Set();
const reachedEvents = new Set();

const key = (m, x, y) => `${m}:${x},${y}`;
if (!G.TILEDEF[G.MAPS.town.rows[18][13]].walk) err('スタート地点が通行不可！');

while (q.length) {
  const cur = q.shift();
  const k = key(cur.map, cur.x, cur.y);
  if (seen.has(k)) continue;
  seen.add(k);
  const m = G.MAPS[cur.map];

  const ev = (m.events || []).find((e) => e.x === cur.x && e.y === cur.y);
  if (ev) {
    reachedEvents.add(cur.map + ':' + ev.type + (ev.id ? '/' + ev.id : ''));
    if (ev.type === 'warp') {
      reachedWarps.add(`${cur.map}(${cur.x},${cur.y}) → ${ev.to}(${ev.tx},${ev.ty})`);
      q.push({ map: ev.to, x: ev.tx, y: ev.ty });      // requires は「解除後」を前提に辿る
    }
  }
  // 隣接して調べられるイベントも記録
  [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dx, dy]) => {
    const nx = cur.x + dx, ny = cur.y + dy;
    const ch = m.rows[ny] && m.rows[ny][nx];
    if (!ch) return;
    const nev = (m.events || []).find((e) => e.x === nx && e.y === ny);
    if (nev && (nev.type === 'chest' || nev.type === 'sign'))
      reachedEvents.add(cur.map + ':' + nev.type + (nev.id ? '/' + nev.id : ''));
    const npc = (m.npcs || []).find((n) => n.x === nx && n.y === ny);
    if (npc) reachedEvents.add(cur.map + ':npc/' + npc.spr);
    if (!G.TILEDEF[ch].walk) return;
    if ((m.npcs || []).some((n) => n.x === nx && n.y === ny)) return;   // NPCは通れない
    q.push({ map: cur.map, x: nx, y: ny });
  });
}

console.log('たどれたワープ:');
[...reachedWarps].sort().forEach((w) => console.log('   ' + w));

// 全イベント・全NPCが到達できたか
const allTargets = [];
for (const id of Object.keys(G.MAPS)) {
  const m = G.MAPS[id];
  (m.events || []).forEach((e) => allTargets.push(id + ':' + e.type + (e.id ? '/' + e.id : '')));
  (m.npcs || []).forEach((n) => allTargets.push(id + ':npc/' + n.spr));
}
const missing = allTargets.filter((t) => !reachedEvents.has(t) && !t.includes(':warp'));
const missingWarps = [];
for (const id of Object.keys(G.MAPS))
  (G.MAPS[id].events || []).forEach((e) => {
    if (e.type === 'warp' && !seen.has(key(id, e.x, e.y)))
      missingWarps.push(`${id}(${e.x},${e.y})→${e.to}`);
  });

if (missing.length) { console.log('\n到達できなかった対象:'); missing.forEach((x) => err(x)); }
if (missingWarps.length) { console.log('\n到達できなかったワープ:'); missingWarps.forEach((x) => err(x)); }

// 洞窟2Fのボスに行けるか（最重要）
const bossOk = [...seen].some((k) => k.startsWith('cave2:'));
console.log('\ncave2 に到達: ' + (bossOk ? 'はい' : 'いいえ'));
if (!bossOk) err('ボスまで到達できない');

console.log('\n歩ける総マス数: ' + seen.size);
console.log(errors ? `\n【NG】${errors}件の問題` : '\n【OK】問題なし');

/* ---- 参考：マップを文字で吐く ---- */
if (process.argv[2]) {
  const m = G.MAPS[process.argv[2]];
  console.log('\n' + m.rows.map((r, i) => String(i).padStart(2, ' ') + ' ' + r).join('\n'));
  console.log('   ' + [...Array(m.w).keys()].map((i) => i % 10).join(''));
}

/* =====================================================================
   追加検証：狭すぎる通路・孤立領域・NPCによる封鎖
   ---------------------------------------------------------------------
   当たり判定は足元1マスなので、キャラを縦長にしても通行性は変わらない。
   ただしマップを編集すると「1マス幅の隘路」や「NPCが唯一の通路を塞ぐ」
   事故が起きる。到達可能性のBFSだけでは前者は検出できない。
   ===================================================================== */
console.log('\n=== 通路の詰まり ===');
let warn = 0;
for (const id of Object.keys(G.MAPS)) {
  const m = G.MAPS[id];
  const walk = (x, y) => {
    const ch = m.rows[y] && m.rows[y][x];
    const d = ch && G.TILEDEF[ch];
    return !!(d && d.walk);
  };
  const npcAt = (x, y) => (m.npcs || []).some((n) => n.x === x && n.y === y);

  // 1) NPC が唯一の通路を塞いでいないか
  (m.npcs || []).forEach((n) => {
    const nbr = [[0, 1], [0, -1], [1, 0], [-1, 0]]
      .filter(([dx, dy]) => walk(n.x + dx, n.y + dy) && !npcAt(n.x + dx, n.y + dy))
      .map(([dx, dy]) => [n.x + dx, n.y + dy]);
    if (nbr.length < 2) return;
    const seen = new Set([nbr[0][0] + ',' + nbr[0][1]]);
    const q = [nbr[0]];
    while (q.length) {
      const [cx, cy] = q.shift();
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nx = cx + dx, ny = cy + dy, k = nx + ',' + ny;
        if (seen.has(k) || !walk(nx, ny)) continue;
        if (nx === n.x && ny === n.y) continue;
        if (npcAt(nx, ny)) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    if (nbr.some(([x, y]) => !seen.has(x + ',' + y))) {
      console.log(`  ✗ ${id}: NPC(${n.spr}) が (${n.x},${n.y}) で通路を塞いで分断している`);
      warn++;
    }
  });

  // 2) 1マス幅の隘路
  let narrow = 0; const spots = [];
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    if (!walk(x, y)) continue;
    const lr = !walk(x - 1, y) && !walk(x + 1, y);
    const ud = !walk(x, y - 1) && !walk(x, y + 1);
    if (lr || ud) { narrow++; if (spots.length < 6) spots.push(`(${x},${y})`); }
  }
  if (narrow) console.log(`  ・${id}: 1マス幅の通路 ${narrow}か所  例 ${spots.join(' ')}`);

  // 3) 孤立した歩行可能領域
  const all = [];
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (walk(x, y)) all.push([x, y]);
  if (all.length) {
    const seen = new Set([all[0][0] + ',' + all[0][1]]);
    const q = [all[0]];
    while (q.length) {
      const [cx, cy] = q.shift();
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nx = cx + dx, ny = cy + dy, k = nx + ',' + ny;
        if (seen.has(k) || !walk(nx, ny)) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    const orphan = all.filter(([x, y]) => !seen.has(x + ',' + y));
    if (orphan.length) {
      console.log(`  ✗ ${id}: 孤立マス ${orphan.length}個  例 ${orphan.slice(0, 5).map((o) => '(' + o + ')').join(' ')}`);
      warn++;
    }
  }
}
console.log(warn ? `\n【要確認】${warn}件` : '\n【OK】通路の詰まりなし');
