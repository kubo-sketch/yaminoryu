/* =====================================================================
   audio.js — 効果音とBGMを WebAudio で合成（音声ファイル 0個）
   ---------------------------------------------------------------------
   ・矩形波2声（メロディ＋ベース）＋ノイズのドラムで FC 風に鳴らす
   ・iOS はユーザー操作まで音が出ないので、初回入力で unlock() を呼ぶ
   ===================================================================== */
(function () {
  'use strict';
  const G = (window.G = window.G || {});

  const AC = window.AudioContext || window.webkitAudioContext;
  let ac = null, master = null, bgmGain = null, seGain = null;
  let noiseBuf = null;

  const NOTES = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  function freq(name) {
    const m = /^([A-G]#?)(-?\d)$/.exec(name);
    if (!m) return 0;
    return 440 * Math.pow(2, (NOTES[m[1]] + (+m[2] - 4) * 12 - 9) / 12);
  }
  // 'C4:2 E4 . G4:4' → [{f,len}, ...]
  function parse(s) {
    return s.trim().split(/\s+/).map(function (tok) {
      const p = tok.split(':');
      const len = p[1] ? +p[1] : 1;
      return { f: p[0] === '.' ? 0 : freq(p[0]), len: len };
    });
  }

  /* ---------------- 曲データ（8分音符 = 1単位） ---------------- */
  const TUNES = {
    town: {
      bpm: 100, wave: 'triangle', vol: 1,
      mel: 'E4:2 G4:2 A4:2 G4:2 E4:2 D4:2 C4:4 D4:2 E4:2 F4:2 E4:2 D4:4 G3:4',
      bass: 'C3:4 C3:4 G2:4 G2:4 F2:4 F2:4 C3:4 C3:4',
    },
    field: {
      bpm: 132, wave: 'square', vol: 0.9,
      mel: 'C4:2 C4:2 D4:2 E4:2 F4:2 E4:2 D4:2 C4:2 G4:2 G4:2 A4:2 G4:2 F4:2 E4:2 D4:4',
      bass: 'C3:2 G3:2 C3:2 G3:2 F3:2 C4:2 F3:2 C4:2 G3:2 D4:2 G3:2 D4:2 C3:2 G3:2 C3:4',
    },
    cave: {
      bpm: 88, wave: 'triangle', vol: 0.85,
      mel: 'A3:4 C4:2 B3:2 A3:4 E3:4 F3:4 E3:2 D3:2 C3:4 E3:4',
      bass: 'A2:4 A2:4 E2:4 E2:4 F2:4 F2:4 A2:4 A2:4',
    },
    battle: {
      bpm: 162, wave: 'square', vol: 0.95, drum: 1,
      mel: 'A4:1 A4:1 C5:2 A4:1 A4:1 E5:2 A4:1 A4:1 C5:2 D5:1 C5:1 A4:2 G4:2 A4:2 C5:2 E5:2',
      bass: 'A2:2 A2:2 A2:2 A2:2 F2:2 F2:2 G2:2 G2:2 A2:2 A2:2 E2:2 E2:2',
    },
    boss: {
      bpm: 138, wave: 'sawtooth', vol: 0.8, drum: 1,
      mel: 'D4:2 D4:2 F4:2 A4:2 G4:4 F4:4 E4:2 E4:2 G4:2 C5:2 A4:4 D4:4',
      bass: 'D2:4 D2:4 A#2:4 A#2:4 C3:4 C3:4 D2:4 D2:4',
    },
    ending: {
      bpm: 84, wave: 'triangle', vol: 1,
      mel: 'G4:2 A4:2 B4:4 A4:2 G4:2 E4:4 D4:2 E4:2 G4:4 E4:4 D4:4',
      bass: 'G2:4 G2:4 C3:4 C3:4 D3:4 D3:4 G2:4 G2:4',
    },
  };

  /* ---------------- 内部 ---------------- */
  let curTune = null, loopTimer = 0, nodes = [];

  function ensure() {
    if (ac) return true;
    if (!AC) return false;
    ac = new AC();
    master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
    bgmGain = ac.createGain(); bgmGain.gain.value = 0.055; bgmGain.connect(master);
    seGain = ac.createGain(); seGain.gain.value = 0.14; seGain.connect(master);
    // ノイズ（打撃音・ドラム用）
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  function tone(f, t, dur, gain, wave, dest) {
    if (!f) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = wave || 'square';
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.012);
    g.gain.setValueAtTime(gain, t + dur * 0.65);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || seGain);
    o.start(t); o.stop(t + dur + 0.03);
    nodes.push(o);
    return o;
  }
  function sweep(f1, f2, t, dur, gain, wave, dest) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = wave || 'square';
    o.frequency.setValueAtTime(f1, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || seGain);
    o.start(t); o.stop(t + dur + 0.02);
    nodes.push(o);
  }
  function noise(t, dur, gain, hp, dest) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const g = ac.createGain(), f = ac.createBiquadFilter();
    f.type = hp ? 'highpass' : 'lowpass';
    f.frequency.value = hp || 1400;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || seGain);
    s.start(t); s.stop(t + dur + 0.02);
    nodes.push(s);
  }

  /* ---------------- 効果音 ---------------- */
  const SE = {
    type: function (t) { tone(1180, t, 0.018, 0.22, 'square'); },
    select: function (t) { tone(760, t, 0.05, 0.5, 'square'); },
    confirm: function (t) { tone(700, t, 0.05, 0.5, 'square'); tone(1050, t + 0.05, 0.09, 0.5, 'square'); },
    cancel: function (t) { tone(500, t, 0.06, 0.45, 'square'); tone(330, t + 0.055, 0.1, 0.45, 'square'); },
    hit: function (t) {
      noise(t, 0.11, 0.85, 0);
      sweep(320, 90, t, 0.13, 0.6, 'square');
    },
    crit: function (t) {
      noise(t, 0.17, 1.0, 0);
      sweep(520, 80, t, 0.2, 0.75, 'sawtooth');
      tone(1400, t, 0.05, 0.5, 'square');
    },
    miss: function (t) { noise(t, 0.13, 0.4, 2600); },
    damage: function (t) {
      sweep(420, 70, t, 0.26, 0.8, 'sawtooth');
      noise(t, 0.16, 0.5, 0);
    },
    heal: function (t) {
      [880, 1174, 1568, 2093].forEach(function (f, i) { tone(f, t + i * 0.055, 0.14, 0.32, 'triangle'); });
    },
    spell: function (t) { sweep(300, 1900, t, 0.24, 0.4, 'triangle'); noise(t + 0.1, 0.14, 0.28, 1800); },
    fire: function (t) { noise(t, 0.45, 0.7, 0); sweep(880, 140, t, 0.42, 0.35, 'sawtooth'); },
    sleep: function (t) { sweep(1200, 260, t, 0.5, 0.34, 'triangle'); },
    levelup: function (t) {
      ['C5', 'E5', 'G5', 'C6'].forEach(function (n, i) { tone(freq(n), t + i * 0.1, 0.24, 0.4, 'square'); });
    },
    open: function (t) {
      tone(1046, t, 0.07, 0.4, 'square'); tone(1568, t + 0.07, 0.07, 0.4, 'square');
      tone(2093, t + 0.14, 0.2, 0.36, 'square');
    },
    encounter: function (t) {
      sweep(140, 620, t, 0.3, 0.6, 'sawtooth');
      noise(t, 0.3, 0.4, 0);
      tone(90, t + 0.26, 0.3, 0.7, 'square');
    },
    dead: function (t) {
      ['G4', 'E4', 'C4', 'G3', 'E3'].forEach(function (n, i) {
        tone(freq(n), t + i * 0.19, 0.3, 0.42, 'triangle');
      });
      sweep(200, 40, t + 0.95, 1.1, 0.5, 'sawtooth');
    },
    flee: function (t) { sweep(400, 1200, t, 0.2, 0.32, 'square'); noise(t, 0.22, 0.3, 2000); },
    win: function (t) {
      const seq = [['C5', 0.12], ['E5', 0.12], ['G5', 0.12], ['C6', 0.34], ['G5', 0.14], ['C6', 0.5]];
      let ofs = 0;
      seq.forEach(function (s) { tone(freq(s[0]), t + ofs, s[1] * 1.1, 0.42, 'square'); ofs += s[1]; });
    },
    door: function (t) { noise(t, 0.14, 0.35, 900); tone(240, t, 0.1, 0.3, 'square'); },
    step: function (t) { noise(t, 0.035, 0.13, 1200); },
  };

  /* ---------------- BGM ---------------- */
  function scheduleTune() {
    if (!curTune || !ac) return;
    const tn = TUNES[curTune];
    const unit = 60 / tn.bpm / 2;             // 8分音符の秒数
    const t0 = ac.currentTime + 0.06;
    let total = 0;

    parse(tn.mel).forEach(function (n) {
      const dur = n.len * unit;
      if (n.f) tone(n.f, t0 + total, dur * 0.92, 0.55 * (tn.vol || 1), tn.wave, bgmGain);
      total += dur;
    });
    let bt = 0;
    parse(tn.bass).forEach(function (n) {
      const dur = n.len * unit;
      if (n.f) tone(n.f, t0 + bt, dur * 0.9, 0.42 * (tn.vol || 1), 'triangle', bgmGain);
      bt += dur;
    });
    if (tn.drum) {
      for (let i = 0; i * unit * 2 < total; i++) {
        const t = t0 + i * unit * 2;
        sweep(150, 50, t, 0.09, 0.5, 'square', bgmGain);
        noise(t + unit, 0.05, 0.18, 3000, bgmGain);
      }
    }
    const loopMs = Math.max(total, bt) * 1000;
    loopTimer = setTimeout(scheduleTune, loopMs - 40);
  }

  /* ---------------- 公開API ---------------- */
  G.audio = {
    muted: false,
    unlock: function () {
      if (!ensure()) return;
      if (ac.state === 'suspended') ac.resume();
    },
    se: function (name) {
      if (this.muted || !ensure() || !SE[name]) return;
      if (ac.state === 'suspended') return;
      SE[name](ac.currentTime + 0.001);
    },
    bgm: function (name) {
      if (!ensure()) return;
      if (curTune === name) return;
      this.stopBgm();
      curTune = name;
      if (!name || this.muted) return;
      if (ac.state === 'suspended') { ac.resume(); }
      scheduleTune();
    },
    stopBgm: function () {
      clearTimeout(loopTimer);
      const keep = curTune;
      curTune = null;
      nodes.forEach(function (n) { try { n.stop(0); } catch (e) { /* 既に停止 */ } });
      nodes = [];
      return keep;
    },
    toggleMute: function () {
      this.muted = !this.muted;
      if (!ensure()) return this.muted;
      if (this.muted) {
        const k = curTune; this.stopBgm(); curTune = k;   // 曲名は保持して復帰できるように
      } else if (curTune) {
        const k = curTune; curTune = null; this.bgm(k);
      }
      return this.muted;
    },
    // 場面ごとのBGMを1か所で決める
    scene: function (mapId, mode) {
      if (mode === 'battle') return this.bgm('battle');
      if (mode === 'boss') return this.bgm('boss');
      if (mode === 'ending') return this.bgm('ending');
      if (mapId === 'town') return this.bgm('town');
      if (mapId === 'cave1' || mapId === 'cave2') return this.bgm('cave');
      return this.bgm('field');
    },
  };
})();
