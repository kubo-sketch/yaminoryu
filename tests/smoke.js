/* =====================================================================
   smoke.js — canvas / DOM をスタブして、全画面の update+draw を実際に走らせる。
   描画結果は見ないが「実行時に落ちないか」を検出する。
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const ROOT = require('path').join(__dirname, '..', 'src');

/* ---------------- canvas 2D のスタブ ---------------- */
function makeCtx(cv) {
  const noop = () => {};
  const ctx = {
    canvas: cv,
    imageSmoothingEnabled: false, textBaseline: '', textAlign: '',
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillRect: noop, strokeRect: noop, clearRect: noop,
    save: noop, restore: noop, translate: noop, scale: noop, rotate: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
    fill: noop, stroke: noop, arc: noop, ellipse: noop, rect: noop, clip: noop,
    fillText: noop, strokeText: noop,
    measureText: (s) => ({ width: String(s).length * 10 }),
    drawImage: function (img) {
      if (!img) throw new Error('drawImage(undefined) — 画像が未定義');
      if (img.width === undefined) throw new Error('drawImage: width が無いものを渡した');
    },
    getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => null,
  };
  return ctx;
}
function makeCanvas(w, h) {
  const cv = { width: w || 300, height: h || 150, style: {}, classList: { add: () => {}, remove: () => {}, toggle: () => {} } };
  const ctx = makeCtx(cv);
  cv.getContext = () => ctx;
  return cv;
}

/* ---------------- DOM / window のスタブ ---------------- */
const listeners = {};
const els = {
  screen: makeCanvas(720, 624),
  mute: { addEventListener: () => {}, classList: { toggle: () => {} }, textContent: '' },
  reset: { addEventListener: () => {}, classList: { toggle: () => {} } },
};
global.document = {
  createElement: (tag) => (tag === 'canvas' ? makeCanvas() : { style: {} }),
  getElementById: (id) => els[id] || null,
  querySelectorAll: () => ({ forEach: () => {} }),
  addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
};
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
let rafQueue = [];
global.window = {
  addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
  requestAnimationFrame: (f) => { rafQueue.push(f); return rafQueue.length; },
  AudioContext: null,          // 音は無効化（WebAudio未実装環境として振る舞う）
  localStorage: global.localStorage,
};
global.requestAnimationFrame = global.window.requestAnimationFrame;
global.setTimeout = ((orig) => (f, ms) => { pendingTimers.push({ f: f, at: clock + (ms || 0) }); return 0; })(setTimeout);
global.clearTimeout = () => {};
global.confirm = () => false;
global.location = { reload: () => {} };
let pendingTimers = [];
let clock = 0;

/* ---------------- ロード ---------------- */
const FILES = ['sprites.js', 'data.js', 'maps.js', 'engine.js', 'audio.js', 'field.js', 'battle.js', 'ui.js', 'main.js'];
FILES.forEach((f) => {
  try {
    new Function(fs.readFileSync(path.join(ROOT, f), 'utf8'))();
  } catch (e) {
    console.log(`✗ ${f} のロードで例外: ${e.message}`);
    process.exit(1);
  }
});
const G = global.window.G;
console.log('ロード: OK (' + FILES.length + 'ファイル)');

/* DOMContentLoaded を発火して初期化 */
(listeners.DOMContentLoaded || []).forEach((f) => f());
console.log('初期化: OK');
console.log('  スプライト: ' + Object.keys(G.SPR).length + '種 / タイル: ' + Object.keys(G.TILE).length + '種 / 敵: ' + Object.keys(G.ENEMY).length + '種');

/* ---------------- 1フレーム進める ---------------- */
let errors = 0;
function step(label, n) {
  for (let i = 0; i < (n || 1); i++) {
    clock += 16;
    // 溜まったタイマーを消化
    const due = pendingTimers.filter((t) => t.at <= clock);
    pendingTimers = pendingTimers.filter((t) => t.at > clock);
    due.forEach((t) => { try { t.f(); } catch (e) { fail(label + ' (timer)', e); } });
    const f = rafQueue.shift();
    if (!f) { console.log('✗ ' + label + ': rAF が途切れた'); errors++; return; }
    try { f(clock); } catch (e) { fail(label, e); return; }
  }
}
function fail(label, e) {
  console.log('✗ ' + label + ': ' + e.message);
  console.log('   ' + (e.stack || '').split('\n')[1]);
  errors++;
}
function ok(label) { console.log('✓ ' + label + '  [state=' + G.state + ']'); }
// シーンごとに状態を切り離す（前のテストの残りで結果が読めなくなるのを防ぐ）
function reset() {
  G.msg.clear();
  G.modal.active = false; G.modal.cb = null;
  G.field.busy = false;
  G.fx.fadeV = 0; G.fx.fadeTarget = 0; G.fx.fadeCb = null;
  G.gameover.shown = 0; G.gameover.t = 0;
  G.state = 'field';
}

/* 入力をねじ込む（edge フラグを直接立てられないので keydown を模す） */
function press(k) {
  const map = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', ok: 'Enter', cancel: 'Escape' };
  (listeners.keydown || []).forEach((f) => f({ code: map[k], preventDefault: () => {} }));
}
function release(k) {
  const map = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', ok: 'Enter', cancel: 'Escape' };
  (listeners.keyup || []).forEach((f) => f({ code: map[k], preventDefault: () => {} }));
}
function tap(k, frames) { press(k); step('tap:' + k, 1); release(k); step('after:' + k, frames || 1); }

console.log('\n--- タイトル画面 ---');
step('title draw', 5);
if (!errors) ok('タイトル描画');

console.log('\n--- ニューゲーム ---');
tap('ok', 2);
// フェード完了まで回す
step('fade', 400);
if (G.state !== 'field') { console.log('✗ field に入れていない: state=' + G.state); errors++; }
else ok('フィールドへ遷移');

console.log('\n--- 冒頭メッセージを送る ---');
for (let i = 0; i < 40; i++) { tap('ok', 6); }
if (G.msg.active) console.log('  （メッセージ継続中）');
ok('メッセージ送り');

console.log('\n--- 歩行（各方向） ---');
['down', 'left', 'right', 'up'].forEach((d) => {
  press(d); step('walk:' + d, 30); release(d); step('walk end', 5);
});
const encountered = G.state === 'battle';
ok('歩行 現在地=' + G.player.map + '(' + G.player.x + ',' + G.player.y + ')'
  + (encountered ? ' ※歩行中にエンカウント発生（正常）' : ''));

console.log('\n--- メニューを開いて全ページ ---');
reset();
tap('cancel', 3);
if (G.state !== 'menu') { console.log('✗ メニューが開かない: ' + G.state); errors++; } else ok('メニュー');
tap('ok', 3); ok('つよさ（ステータス）');
tap('cancel', 3);
tap('down', 2); tap('ok', 3); ok('じゅもん一覧');
tap('cancel', 2);
tap('down', 2); tap('ok', 3); ok('どうぐ一覧');
tap('cancel', 2); tap('cancel', 3);
if (G.state !== 'field') { console.log('✗ メニューが閉じない: ' + G.state); errors++; }

console.log('\n--- 店（どうぐや／ぶきや）---');
reset();
G.player.gold = 1000; G.player.items = {};
G.openShop('tool'); step('shop', 3);
for (let i = 0; i < 10; i++) tap('ok', 4);      // 買えるだけ買う
if (G.state === 'shop') { tap('cancel', 4); }
ok('どうぐや（所持: ' + JSON.stringify(G.player.items) + ' / ' + G.player.gold + 'G）');
G.openShop('weapon'); step('shop', 3);
tap('ok', 4); tap('ok', 4); tap('cancel', 4);
ok('ぶきや（ぶき=' + G.WEAPONS[G.player.weapon].name + '）');

console.log('\n--- 宿屋 ---');
reset();
G.player.gold = 100; G.player.hp = 3; G.player.mp = 0;
G.openInn(); step('inn', 3);
// 「いらっしゃい」を送り切ると確認ダイアログが出る（1回目のokは文字送りスキップ）
let modalSeen = false;
for (let i = 0; i < 6 && !modalSeen; i++) { tap('ok', 4); modalSeen = G.modal.active; }
if (!modalSeen) { console.log('✗ 確認ダイアログが出ない'); errors++; }
tap('ok', 4);                                  // 「はい」
step('inn sleep', 300);                        // 暗転→700ms→明転 を待つ
for (let i = 0; i < 5; i++) tap('ok', 6);
step('inn after', 60);
if (G.player.hp !== G.player.maxhp) { console.log('✗ HPが回復していない: ' + G.player.hp + '/' + G.player.maxhp); errors++; }
if (G.player.gold !== 100 - G.INN_PRICE) { console.log('✗ 宿代が引かれていない: ' + G.player.gold); errors++; }
if (G.field.busy) { console.log('✗ busy が解除されていない（操作不能で固まる）'); errors++; }
ok('やどや（HP=' + G.player.hp + '/' + G.player.maxhp + ' MP=' + G.player.mp + ' G=' + G.player.gold + '）');

console.log('\n--- 村長（進行フラグ＋セーブ）---');
reset();
G.elderTalk();
for (let i = 0; i < 30; i++) tap('ok', 6);
console.log('  toldByElder=' + G.flags.toldByElder + ' / セーブ有無=' + G.hasSave());
if (!G.flags.toldByElder) { console.log('✗ 進行フラグが立たない'); errors++; } else ok('村長イベント');

console.log('\n--- 通常戦闘（スライム）---');
reset();
G.player.hp = G.player.maxhp;
G.startBattle('slime', false);
step('battle appear', 5);
for (let i = 0; i < 60 && G.state === 'battle'; i++) tap('ok', 8);
ok('戦闘（結果 state=' + G.state + ' / Lv' + G.player.lv + ' exp' + G.player.exp + '）');

console.log('\n--- 呪文とどうぐのサブメニュー ---');
reset();
G.player.spells = ['hoimi', 'mera'];
G.player.maxmp = 30; G.player.mp = 30; G.player.items.yakusou = 3;
G.player.lv = 8; G.player.baseAtk = 32; G.player.baseDef = 26;
G.player.maxhp = 84; G.player.hp = 84;
G.startBattle('goblin', false); step('b', 4);
tap('right', 2); tap('ok', 3);            // じゅもん
ok('じゅもんメニュー phase=' + G.battle.phase);
tap('ok', 8);                              // 唱える
for (let i = 0; i < 8; i++) tap('ok', 8);
if (G.state === 'battle') { tap('down', 2); tap('ok', 3); ok('どうぐメニュー phase=' + G.battle.phase); tap('ok', 8); }
for (let i = 0; i < 40 && G.state === 'battle'; i++) tap('ok', 8);
ok('呪文・道具つき戦闘 完了');

console.log('\n--- にげる ---');
reset();
G.player.hp = G.player.maxhp;
G.startBattle('bat', false); step('b', 4);
tap('down', 2); tap('right', 2); tap('ok', 4);
for (let i = 0; i < 30 && G.state === 'battle'; i++) tap('ok', 8);
ok('にげる（state=' + G.state + '）');

console.log('\n--- ボス戦（プレイヤーを強化して勝つ）---');
reset();
G.player.lv = 10; G.player.baseAtk = 44; G.player.baseDef = 36;
G.player.maxhp = 110; G.player.hp = 110; G.player.maxmp = 58; G.player.mp = 58;
G.player.weapon = 4; G.player.armor = 4;
G.player.map = 'cave2';
G.startBattle('boss', true);
step('boss appear', 5);
for (let i = 0; i < 200 && G.state === 'battle'; i++) tap('ok', 8);
console.log('  bossDead=' + G.flags.bossDead + ' state=' + G.state);
step('ending fade', 600);
ok('ボス戦（state=' + G.state + '）');

console.log('\n--- エンディング ---');
if (G.state === 'ending') {
  // メッセージを全部送り、最後の1回でタイトルへ戻ることを確認
  for (let i = 0; i < 24 && G.state === 'ending'; i++) tap('ok', 8);
  if (G.state !== 'title') { console.log('✗ タイトルに戻らない: ' + G.state); errors++; }
  else ok('エンディング → タイトル');
} else { console.log('✗ エンディングに入っていない: ' + G.state); errors++; }

console.log('\n--- ゲームオーバー（村で復活・ゴールド半減）---');
G.newGame(); step('n', 5);
reset();
G.player.gold = 100;
const goldBefore = G.player.gold;
G.player.hp = 1;
G.startBattle('skeleton', false); step('b', 4);
for (let i = 0; i < 60 && G.state === 'battle'; i++) {
  G.player.hp = Math.min(G.player.hp, 1);             // 瀕死のまま＝確実に負ける
  tap('ok', 8);
}
if (G.state !== 'gameover') { console.log('✗ ゲームオーバーになっていない: ' + G.state); errors++; }
for (let i = 0; i < 30 && G.state === 'gameover'; i++) tap('ok', 12);
step('go', 100);
if (G.state !== 'field') { console.log('✗ 復活してフィールドに戻らない: ' + G.state); errors++; }
if (G.player.hp !== G.player.maxhp) { console.log('✗ 復活時にHPが全快していない: ' + G.player.hp); errors++; }
if (G.player.gold !== goldBefore - Math.floor(goldBefore / 2)) { console.log('✗ ゴールド半減が効いていない: ' + G.player.gold); errors++; }
if (G.player.map !== 'town') { console.log('✗ 村に戻っていない: ' + G.player.map); errors++; }
ok('ゲームオーバー → 復活（' + G.player.map + ' HP=' + G.player.hp + '/' + G.player.maxhp + ' G=' + goldBefore + '→' + G.player.gold + '）');

console.log('\n--- セーブ／ロード往復 ---');
G.player.gold = 777; G.player.x = 12; G.player.y = 8; G.player.map = 'town';
G.saveGame();
G.player.gold = 0;
const loaded = G.loadGame();
console.log('  load=' + loaded + ' gold=' + G.player.gold + ' at=' + G.player.map + '(' + G.player.x + ',' + G.player.y + ')');
if (!loaded || G.player.gold !== 777) { console.log('✗ セーブ／ロードが壊れている'); errors++; }
else ok('セーブ／ロード');

console.log('\n--- 全マップの描画 ---');
['town', 'field', 'cave1', 'cave2'].forEach((id) => {
  G.field.enter(id, G.MAPS[id].events[0].x, G.MAPS[id].events[0].y, 0);
  G.state = 'field';
  step('draw:' + id, 3);
  ok('描画 ' + id);
});

console.log(errors ? `\n【NG】${errors}件の実行時エラー` : '\n【OK】実行時エラーなし');
process.exit(errors ? 1 : 0);
