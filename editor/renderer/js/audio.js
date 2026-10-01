// ================================================================
//  소리 — 참조 풀기 · 미리 듣기 · 파형 · WAV 저장 · 효과음 합성기
//   참조:  sound:<id>          사운드 편집기에 등록한 소리 (audio/sounds.json)
//          game:music/x.ogg    게임에 들어 있는 파일 (게임 저장소 assets)
//          assets/audio/x.wav  프로젝트 폴더의 파일
//   게임 런타임(MakerAudio.java)도 같은 참조를 씁니다.
// ================================================================
PDM.GAME_MUSIC = ['sewers_1', 'sewers_2', 'sewers_3', 'sewers_tense', 'sewers_boss', 'prison_1', 'prison_2', 'prison_3', 'prison_tense', 'prison_boss',
  'caves_1', 'caves_2', 'caves_3', 'caves_tense', 'caves_boss', 'caves_boss_finale', 'city_1', 'city_2', 'city_3', 'city_tense', 'city_boss', 'city_boss_finale',
  'halls_1', 'halls_2', 'halls_3', 'halls_tense', 'halls_boss', 'halls_boss_finale', 'theme_1', 'theme_2', 'theme_finale'].map(n => 'game:music/' + n + '.ogg').concat(['game:music/title.mp3']);   // title.mp3 = mod-2 타이틀 곡
PDM.GAME_SOUNDS = ['alert', 'badge', 'beacon', 'bee', 'blast', 'bones', 'boss', 'burning', 'chains', 'challenge', 'chargeup', 'charms', 'click', 'cursed', 'death',
  'debuff', 'degrade', 'descend', 'dewdrop', 'door_open', 'drink', 'eat', 'evoke', 'falling', 'gas', 'ghost', 'gold', 'grass', 'health_critical', 'health_warn',
  'hit', 'hit_arrow', 'hit_crush', 'hit_magic', 'hit_parry', 'hit_slash', 'hit_stab', 'hit_strong', 'item', 'levelup', 'lightning', 'lullaby', 'mastery', 'meld',
  'mimic', 'mine', 'miss', 'plant', 'puff', 'ray', 'read', 'rocks', 'scan', 'secret', 'shatter', 'sheep', 'step', 'sturdy', 'teleport', 'tomb', 'trample', 'trap',
  'unlock', 'water', 'zap'].map(n => 'game:sounds/' + n + '.mp3');
/** mod-2(위츨링) 에만 있는 효과음 — 원작 저장소에서는 소리가 나지 않음 */
PDM.MOD2_SOUNDS = ['atk_charge', 'atk_crossbow', 'atk_grimoire', 'atk_meltdown', 'atk_shield', 'atk_smash', 'atk_spiritbow', 'atk_sword_slash1', 'atk_sword_slash2',
  'atk_sword_slash3', 'atk_sword_stab', 'atk_sword_sweep', 'elemental_earth', 'elemental_fire', 'elemental_water', 'elemental_wind', 'hit_bullet'].map(n => 'game:sounds/' + n + '.mp3');
PDM.GAME_SOUNDS = PDM.GAME_SOUNDS.concat(PDM.MOD2_SOUNDS).sort();

/** 게임 효과음 설정 (audio/sounds.json 의 sfx) — 게임 MakerAudio.SFX 와 같은 키·기본값. 값 "" = 기본, "none" = 소리 없음 */
PDM.SFX = [
  ['codex.melee', '코덱스 · 근접 쓸 때', 'game:sounds/atk_sword_slash1.mp3|game:sounds/hit_slash.mp3'],
  ['codex.meleeHit', '코덱스 · 근접 맞을 때', 'game:sounds/hit_slash.mp3'],
  ['codex.ranged', '코덱스 · 원거리 쓸 때', 'game:sounds/atk_grimoire.mp3|game:sounds/zap.mp3'],
  ['codex.cast', '코덱스 · 시전 쓸 때', 'game:sounds/read.mp3'],
  ['codex.hit', '코덱스 · 원거리·시전 맞을 때', 'game:sounds/hit_magic.mp3'],
  ['codex.miss', '코덱스 · 빗나갈 때', 'game:sounds/miss.mp3'],
  ['codex.break', '코덱스 · 다 닳아 없어질 때', ''],
  ['spell.cast', '주문 · 쓸 때', 'game:sounds/read.mp3'],
  ['spell.hit', '주문 · 맞을 때', 'game:sounds/hit_magic.mp3'],
  ['ability.cast', '직업 능력 · 쓸 때', 'game:sounds/chargeup.mp3'],
  ['ability.hit', '직업 능력 · 맞을 때', 'game:sounds/hit_magic.mp3'],
  ['item.eat', '아이템 · 먹을 때 (음식)', 'game:sounds/eat.mp3'],
  ['item.drink', '아이템 · 마실 때 (물약)', 'game:sounds/drink.mp3'],
  ['item.read', '아이템 · 읽을 때 (주문서·일지)', 'game:sounds/read.mp3'],
  ['item.use', '아이템 · 그 밖의 사용', ''],
  ['dialogue.open', '대사창 · 열 때', ''],
  ['dialogue.type', '대사창 · 글자 나올 때 (세 글자마다)', ''],
  ['dialogue.next', '대사창 · 넘길 때', ''],
  ['choice.move', '선택지 · 옮길 때', ''],
  ['choice.select', '선택지 · 고를 때', 'game:sounds/click.mp3'],
  ['heart.up', '마음 · 호감이 오를 때', ''],
  ['heart.down', '마음 · 호감이 내릴 때', ''],
  ['heart.bond', '마음 · 이정표를 얻을 때', 'game:sounds/levelup.mp3'],
  ['heart.crystal', '마음 · 결정이 생길 때', ''],
  ['gauge.overflow', '게이지 · 폭주할 때', 'game:sounds/blast.mp3'],
  ['gauge.switch', '게이지 · 원소를 바꿀 때', 'game:sounds/meld.mp3']
];


/** 게임 테마별 기본 음악 (SPD 3.x Level.playLevelMusic) — 그룹 음악을 비워 두면 이것이 나옴 */
PDM.THEME_MUSIC = {
  SEWER:  { tracks: ['sewers_1', 'sewers_2', 'sewers_3'], tense: 'sewers_tense', boss: 'sewers_boss' },
  PRISON: { tracks: ['prison_1', 'prison_2', 'prison_3'], tense: 'prison_tense', boss: 'prison_boss' },
  CAVES:  { tracks: ['caves_1', 'caves_2', 'caves_3'], tense: 'caves_tense', boss: 'caves_boss' },
  CITY:   { tracks: ['city_1', 'city_2', 'city_3'], tense: 'city_tense', boss: 'city_boss' },
  HALLS:  { tracks: ['halls_1', 'halls_2', 'halls_3'], tense: 'halls_tense', boss: 'halls_boss' }
};
PDM.themeMusicRef = n => 'game:music/' + n + '.ogg';

PDM.audio = (function () {
  let ctx = null;
  const ac = () => (ctx = ctx || new (window.AudioContext || window.webkitAudioContext)());
  const bufCache = new Map();
  let playing = null;

  function entry(id) { return (((PDM.store.get('sounds') || {}).sounds) || []).find(s => s.id === id) || null; }
  /** 참조 → { path, file, volume, pitch, loop, entry } */
  function resolve(ref) {
    if (!ref) return null;
    let file = ref, e = null;
    if (ref.startsWith('sound:')) { e = entry(ref.slice(6)); if (!e) return null; file = e.file; }
    if (!file) return null;
    const path = file.startsWith('game:') ? PDM.assets.resolvePath(file) : (file.startsWith('assets/') ? PDM.store.abs(file) : PDM.assets.resolvePath('game:' + file));
    return { path, file, entry: e, volume: e ? (e.volume ?? 1) : 1, pitch: e ? (e.pitch ?? 1) : 1, loop: e ? e.loop !== false : true };
  }
  function label(ref) {
    if (!ref) return '(없음)';
    if (ref === 'none') return '(음악 끄기)';
    if (ref.startsWith('sound:')) { const e = entry(ref.slice(6)); return e ? `♪ ${e.name || e.id}` : `⚠ ${ref} (없음)`; }
    return ref.replace(/^game:/, '게임: ');
  }
  async function dataToBuffer(dataURL) {
    const bin = atob(dataURL.split(',')[1]); const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return ac().decodeAudioData(u.buffer);
  }
  /** 파일 경로 → AudioBuffer (캐시) */
  function bufferOfPath(path) {
    if (!path) return Promise.resolve(null);
    if (!bufCache.has(path)) bufCache.set(path, pdm.readDataURL(path).then(dataToBuffer).catch(e => { bufCache.delete(path); throw e; }));
    return bufCache.get(path);
  }
  function invalidate(path) { bufCache.delete(path); }

  function stop() { if (playing) { try { playing.src.stop(); } catch (_) { /* 이미 끝남 */ } playing = null; } }
  /** AudioBuffer 재생 (from~to 초) */
  function playBuffer(buf, o = {}) {
    stop();
    const src = ac().createBufferSource(); src.buffer = buf;
    src.playbackRate.value = o.pitch || 1; src.loop = !!o.loop;
    if (o.loop && o.to) { src.loopStart = o.from || 0; src.loopEnd = o.to; }
    const g = ac().createGain(); g.gain.value = o.volume ?? 1;
    src.connect(g).connect(ac().destination);
    src.start(0, o.from || 0, o.loop ? undefined : (o.to ? o.to - (o.from || 0) : undefined));
    playing = { src, started: ac().currentTime, from: o.from || 0, rate: o.pitch || 1, buf };
    src.onended = () => { if (playing && playing.src === src) playing = null; if (o.onend) o.onend(); };
    return playing;
  }
  async function play(ref, o = {}) {
    const r = resolve(ref);
    if (!r || !r.path) { toast('소리를 찾지 못했습니다: ' + label(ref) + (ref && ref.startsWith('game:') ? ' (프로젝트 설정의 게임 저장소 경로 확인)' : ''), 'bad'); return null; }
    try {
      const buf = await bufferOfPath(r.path);
      return playBuffer(buf, { volume: r.volume * (o.volume ?? 1), pitch: r.pitch, loop: o.loop ?? false });
    } catch (e) { toast('재생 실패: ' + e.message, 'bad'); return null; }
  }
  /** 지금 재생 위치(초) */
  function position() { if (!playing) return null; return playing.from + (ac().currentTime - playing.started) * playing.rate; }

  // ---------------- WAV ----------------
  /** Float32Array[] (채널) → WAV dataURL (16bit PCM) */
  function encodeWav(channels, rate) {
    const n = channels[0].length, ch = channels.length, bytes = 44 + n * ch * 2;
    const b = new ArrayBuffer(bytes), v = new DataView(b);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, bytes - 8, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); v.setUint16(22, ch, true); v.setUint32(24, rate, true); v.setUint32(28, rate * ch * 2, true);
    v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * ch * 2, true);
    let o = 44;
    for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, channels[c][i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
    let bin = ''; const u = new Uint8Array(b);
    for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return 'data:audio/wav;base64,' + btoa(bin);
  }
  function bufferFrom(channels, rate) {
    const b = ac().createBuffer(channels.length, channels[0].length, rate);
    channels.forEach((d, i) => b.copyToChannel(d, i));
    return b;
  }
  const channelsOf = buf => Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i).slice());

  /** 파형 그리기 (sel: {a,b} 초) */
  function drawWave(cv, buf, o = {}) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height;
    g.fillStyle = o.bg || '#14121a'; g.fillRect(0, 0, W, H);
    if (!buf) return;
    const d = buf.getChannelData(0), dur = buf.duration;
    const view = o.view || { a: 0, b: dur };
    const x = t => (t - view.a) / (view.b - view.a) * W;
    if (o.sel && o.sel.b > o.sel.a) { g.fillStyle = 'rgba(165,139,255,.25)'; g.fillRect(x(o.sel.a), 0, x(o.sel.b) - x(o.sel.a), H); }
    g.strokeStyle = o.color || '#a58bff'; g.beginPath();
    const s0 = Math.floor(view.a * buf.sampleRate), s1 = Math.floor(view.b * buf.sampleRate), step = Math.max(1, (s1 - s0) / W);
    for (let px = 0; px < W; px++) {
      let mn = 1, mx = -1; const a = Math.floor(s0 + px * step), b = Math.min(d.length, Math.floor(a + step) + 1);
      for (let i = a; i < b; i++) { const s = d[i]; if (s < mn) mn = s; if (s > mx) mx = s; }
      if (mn > mx) continue;
      g.moveTo(px + 0.5, (1 - mx) * H / 2); g.lineTo(px + 0.5, (1 - mn) * H / 2 + 1);
    }
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
    if (o.cursor !== undefined && o.cursor !== null) { g.strokeStyle = '#ffde59'; g.beginPath(); g.moveTo(x(o.cursor), 0); g.lineTo(x(o.cursor), H); g.stroke(); }
  }

  // ---------------- 효과음 합성기 (층 · 필터 · FM · 잔향) ----------------
  //  한 소리 = 층(layer) 최대 4개. 층마다 파형·음높이 미끄러짐·FM·떨림·엔벨로프·필터, 전체에 드라이브·메아리·잔향.
  //  에디터(미리 듣기·저장)와 tools/make_sounds.js(샘플)가 같은 계산을 씁니다. 결과는 44.1kHz 모노.
  const RATE = 44100;
  const LAYER_DEFAULT = { on: true, wave: 'sine', freq: 440, freqEnd: 0, glide: 0.1, detune: 0, unison: 1, spread: 8,
    fmRatio: 0, fmIndex: 0, fmDecay: 0.3, vibRate: 0, vibDepth: 0, gain: 1, delay: 0,
    attack: 0.005, hold: 0, decay: 0.3, sustain: 0, release: 0.2, length: 0.4,
    filter: 'none', cutoff: 2000, cutoffEnd: 0, q: 0.7 };
  const SYNTH_DEFAULT = { layers: [], pitch: 1, stretch: 1, brightness: 1, drive: 0, echoTime: 0.18, echoFeedback: 0.3, echoMix: 0, reverbMix: 0.15, reverbSize: 0.5, reverbDamp: 0.4, volume: 0.8 };
  const L = o => Object.assign({}, LAYER_DEFAULT, o);
  const note = n => 440 * Math.pow(2, (n - 69) / 12);   // MIDI 번호 → Hz
  const SYNTH_PRESETS = {
    bell: () => ({ layers: [L({ wave: 'sine', freq: note(81), fmRatio: 3.5, fmIndex: 3.2, fmDecay: 0.35, attack: 0.002, decay: 1.6, length: 1.8, release: 0.4 }),
      L({ wave: 'sine', freq: note(93), gain: 0.25, attack: 0.002, decay: 0.6, length: 0.7 })], reverbMix: 0.3, reverbSize: 0.7 }),
    chime: () => ({ layers: [L({ wave: 'sine', freq: note(88), fmRatio: 2, fmIndex: 1.5, fmDecay: 0.2, decay: 0.5, length: 0.6 }),
      L({ wave: 'sine', freq: note(95), fmRatio: 2, fmIndex: 1.2, fmDecay: 0.2, delay: 0.08, decay: 0.8, length: 0.9 })], reverbMix: 0.25, echoMix: 0.15 }),
    sparkle: () => ({ layers: [0, 4, 7, 12].map((iv, i) => L({ wave: 'triangle', freq: note(84 + iv), delay: i * 0.055, attack: 0.002, decay: 0.35, length: 0.4, gain: 0.6, vibRate: 7, vibDepth: 8 })),
      reverbMix: 0.35, reverbSize: 0.75, echoMix: 0.2, echoTime: 0.11 }),
    heal: () => ({ layers: [L({ wave: 'saw', freq: note(64), unison: 3, spread: 14, attack: 0.12, decay: 0.5, sustain: 0.4, length: 0.9, release: 0.5, filter: 'lp', cutoff: 500, cutoffEnd: 2600, q: 1, gain: 0.5 }),
      L({ wave: 'sine', freq: note(76), attack: 0.1, decay: 0.8, length: 0.9, release: 0.5, gain: 0.5, vibRate: 5, vibDepth: 10 }),
      L({ wave: 'triangle', freq: note(83), delay: 0.25, attack: 0.05, decay: 0.6, length: 0.7, gain: 0.3 })], reverbMix: 0.35, reverbSize: 0.8 }),
    pickup: () => ({ layers: [L({ wave: 'triangle', freq: note(79), attack: 0.002, decay: 0.12, length: 0.12, gain: 0.8 }),
      L({ wave: 'triangle', freq: note(86), delay: 0.07, attack: 0.002, decay: 0.25, length: 0.3, gain: 0.8 })], reverbMix: 0.15, echoMix: 0.1 }),
    hit: () => ({ layers: [L({ wave: 'noise', attack: 0.001, decay: 0.12, length: 0.14, filter: 'lp', cutoff: 3500, cutoffEnd: 400, q: 0.8, gain: 0.9 }),
      L({ wave: 'sine', freq: 140, freqEnd: 45, glide: 0.12, attack: 0.001, decay: 0.18, length: 0.2, gain: 1 })], drive: 0.3, reverbMix: 0.08 }),
    slash: () => ({ layers: [L({ wave: 'noise', attack: 0.015, decay: 0.16, length: 0.2, filter: 'bp', cutoff: 900, cutoffEnd: 5000, q: 2.5, gain: 1 }),
      L({ wave: 'noise', delay: 0.02, attack: 0.005, decay: 0.08, length: 0.1, filter: 'hp', cutoff: 3000, q: 0.7, gain: 0.4 })], reverbMix: 0.1 }),
    explosion: () => ({ layers: [L({ wave: 'noise', attack: 0.003, decay: 1.2, length: 1.4, filter: 'lp', cutoff: 2200, cutoffEnd: 120, q: 0.9, gain: 1 }),
      L({ wave: 'sine', freq: 70, freqEnd: 28, glide: 0.8, attack: 0.002, decay: 1, length: 1.1, gain: 0.9 })], drive: 0.5, reverbMix: 0.3, reverbSize: 0.8 }),
    door: () => ({ layers: [L({ wave: 'saw', freq: 120, freqEnd: 150, glide: 0.5, vibRate: 22, vibDepth: 35, attack: 0.05, decay: 0.3, sustain: 0.5, length: 0.55, release: 0.1, filter: 'lp', cutoff: 900, q: 3, gain: 0.5 }),
      L({ wave: 'noise', delay: 0.5, attack: 0.001, decay: 0.12, length: 0.15, filter: 'lp', cutoff: 800, q: 0.7, gain: 0.8 }),
      L({ wave: 'sine', freq: 90, freqEnd: 50, delay: 0.5, glide: 0.1, attack: 0.001, decay: 0.15, length: 0.15, gain: 0.8 })], reverbMix: 0.2 }),
    step: () => ({ layers: [L({ wave: 'noise', attack: 0.001, decay: 0.05, length: 0.06, filter: 'lp', cutoff: 900, cutoffEnd: 300, q: 0.7, gain: 0.8 }),
      L({ wave: 'sine', freq: 95, freqEnd: 60, glide: 0.05, attack: 0.001, decay: 0.06, length: 0.06, gain: 0.6 })], reverbMix: 0.1, volume: 0.6 }),
    drop: () => ({ layers: [L({ wave: 'sine', freq: 700, freqEnd: 1900, glide: 0.06, attack: 0.001, decay: 0.12, length: 0.13, gain: 1 })], reverbMix: 0.35, reverbSize: 0.6, echoMix: 0.12 }),
    wind: () => ({ layers: [L({ wave: 'noise', attack: 0.6, decay: 0.6, sustain: 0.7, length: 2.2, release: 0.8, filter: 'bp', cutoff: 380, cutoffEnd: 900, q: 5, gain: 1, vibRate: 0.5 }),
      L({ wave: 'noise', attack: 0.8, sustain: 0.6, decay: 0.4, length: 2.2, release: 0.8, filter: 'bp', cutoff: 1400, cutoffEnd: 600, q: 8, gain: 0.5 })], reverbMix: 0.25 }),
    magic: () => ({ layers: [L({ wave: 'saw', freq: note(62), freqEnd: note(74), glide: 0.4, unison: 4, spread: 20, attack: 0.05, decay: 0.4, sustain: 0.3, length: 0.6, release: 0.3, filter: 'lp', cutoff: 600, cutoffEnd: 4000, q: 4, gain: 0.45 }),
      L({ wave: 'sine', freq: note(86), fmRatio: 1.5, fmIndex: 2, fmDecay: 0.4, delay: 0.1, attack: 0.02, decay: 0.6, length: 0.7, gain: 0.35, vibRate: 8, vibDepth: 15 })], reverbMix: 0.4, reverbSize: 0.8, echoMix: 0.15 }),
    curse: () => ({ layers: [L({ wave: 'saw', freq: note(45), freqEnd: note(40), glide: 1, unison: 3, spread: 25, attack: 0.2, decay: 0.8, sustain: 0.4, length: 1.3, release: 0.6, filter: 'lp', cutoff: 700, cutoffEnd: 250, q: 2, gain: 0.6, vibRate: 3, vibDepth: 20 }),
      L({ wave: 'noise', attack: 0.3, decay: 0.8, length: 1.2, filter: 'bp', cutoff: 300, q: 6, gain: 0.3 })], drive: 0.2, reverbMix: 0.4, reverbSize: 0.9 }),
    alert: () => ({ layers: [L({ wave: 'triangle', freq: note(76), attack: 0.005, decay: 0.12, sustain: 0.6, length: 0.14, release: 0.03 }),
      L({ wave: 'triangle', freq: note(81), delay: 0.16, attack: 0.005, decay: 0.12, sustain: 0.6, length: 0.14, release: 0.05 })], reverbMix: 0.12 }),
    ui: () => ({ layers: [L({ wave: 'sine', freq: note(84), fmRatio: 1, fmIndex: 0.8, fmDecay: 0.03, attack: 0.001, decay: 0.05, length: 0.05, gain: 0.8 })], reverbMix: 0.05, volume: 0.6 })
  };
  const SYNTH_NAMES = { bell: '종소리', chime: '차임·코인', sparkle: '반짝임', heal: '회복', pickup: '아이템 줍기', hit: '타격', slash: '베기', explosion: '폭발',
    door: '문 열림', step: '발소리', drop: '물방울', wind: '바람', magic: '마법 시전', curse: '저주·어둠', alert: '알림', ui: '버튼' };
  function makeSynth(p) { const o = Object.assign({}, SYNTH_DEFAULT, p || {}); o.layers = (o.layers || []).map(l => Object.assign({}, LAYER_DEFAULT, l)); return o; }

  function envAt(l, t) {
    if (t < 0) return 0;
    const len = l.length, rel = Math.max(0.001, l.release);
    let v;
    if (t < l.attack) v = t / Math.max(0.0001, l.attack);
    else if (t < l.attack + l.hold) v = 1;
    else { const d = t - l.attack - l.hold; v = l.sustain + (1 - l.sustain) * Math.exp(-d / Math.max(0.005, l.decay / 4)); }
    if (t > len) v *= Math.max(0, 1 - (t - len) / rel);
    return v;
  }
  /** RBJ 바이쿼드 계수 */
  function biquad(type, f, q) {
    const w = 2 * Math.PI * Math.min(f, RATE * 0.45) / RATE, cs = Math.cos(w), sn = Math.sin(w), a = sn / (2 * Math.max(0.1, q));
    let b0, b1, b2; const a0 = 1 + a, a1 = -2 * cs, a2 = 1 - a;
    if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; }
    else if (type === 'bp') { b0 = a; b1 = 0; b2 = -a; }
    else { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; }
    return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
  }
  const polyblep = (t, dt) => { if (t < dt) { t /= dt; return t + t - t * t - 1; } if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; } return 0; };

  function renderLayer(l, g, out, rnd) {
    const start = Math.floor((l.delay * g.stretch) * RATE);
    const len = (l.length + l.release) * g.stretch, n = Math.min(out.length - start, Math.ceil(len * RATE));
    if (n <= 0) return;
    const L2 = Object.assign({}, l, { attack: l.attack * g.stretch, hold: l.hold * g.stretch, decay: l.decay * g.stretch, length: l.length * g.stretch, release: l.release * g.stretch });
    const voices = Math.max(1, Math.min(7, l.unison | 0));
    const phases = Array.from({ length: voices }, () => rnd()), mphase = [0];
    const f0 = l.freq * g.pitch, f1 = (l.freqEnd > 0 ? l.freqEnd : l.freq) * g.pitch, glide = Math.max(0.001, l.glide * g.stretch);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, coef = null, noiseHold = 0, pink = [0, 0, 0];
    const c0 = l.cutoff * g.brightness, c1 = (l.cutoffEnd > 0 ? l.cutoffEnd : l.cutoff) * g.brightness;
    for (let i = 0; i < n; i++) {
      const t = i / RATE;
      const k = Math.min(1, t / glide);
      let f = f0 * Math.pow(f1 / f0, k);
      if (l.vibDepth > 0 && l.vibRate > 0) f *= Math.pow(2, l.vibDepth / 1200 * Math.sin(2 * Math.PI * l.vibRate * t));
      let s = 0;
      if (l.wave === 'noise') {
        const w = rnd() * 2 - 1;
        s = w;
      } else {
        let fm = 0;
        if (l.fmRatio > 0 && l.fmIndex > 0) {
          mphase[0] = (mphase[0] + f * l.fmRatio / RATE) % 1;
          fm = l.fmIndex * Math.exp(-t / Math.max(0.005, l.fmDecay * g.stretch)) * Math.sin(2 * Math.PI * mphase[0]);
        }
        for (let v = 0; v < voices; v++) {
          const cents = l.detune + (voices > 1 ? (v / (voices - 1) - 0.5) * 2 * l.spread : 0);
          const fv = f * Math.pow(2, cents / 1200), dt = fv / RATE;
          phases[v] = (phases[v] + dt) % 1;
          const ph = phases[v] + fm / (2 * Math.PI);
          const p = ((ph % 1) + 1) % 1;
          let x;
          switch (l.wave) {
            case 'triangle': x = 1 - 4 * Math.abs(p - 0.5); break;
            case 'saw': x = 2 * p - 1 - polyblep(p, dt); break;
            case 'square': x = (p < 0.5 ? 1 : -1) + polyblep(p, dt) - polyblep((p + 0.5) % 1, dt); break;
            default: x = Math.sin(2 * Math.PI * p);
          }
          s += x;
        }
        s /= Math.sqrt(voices);
      }
      if (l.filter && l.filter !== 'none') {
        if (i % 32 === 0) { const kk = Math.min(1, t / Math.max(0.01, L2.length)); coef = biquad(l.filter, c0 * Math.pow(c1 / c0, kk), l.q); }
        const y = coef[0] * s + coef[1] * x1 + coef[2] * x2 - coef[3] * y1 - coef[4] * y2;
        x2 = x1; x1 = s; y2 = y1; y1 = y; s = y;
      }
      out[start + i] += s * envAt(L2, t) * l.gain;
    }
  }
  /** 간단한 잔향 (콤 4 + 올패스 2, Freeverb 축소판) */
  function reverb(buf, mix, size, damp) {
    if (mix <= 0) return buf;
    const combs = [1557, 1617, 1491, 1422].map(d => ({ d: Math.round(d * (0.6 + size * 0.6)), b: null, i: 0, f: 0 }));
    combs.forEach(c => { c.b = new Float32Array(c.d); });
    const aps = [556, 341].map(d => ({ d, b: new Float32Array(d), i: 0 }));
    const fb = 0.7 + size * 0.25, out = new Float32Array(buf.length);
    for (let n = 0; n < buf.length; n++) {
      const x = buf[n] * 0.25; let y = 0;
      for (const c of combs) { const o = c.b[c.i]; c.f = o * (1 - damp) + c.f * damp; c.b[c.i] = x + c.f * fb; c.i = (c.i + 1) % c.d; y += o; }
      for (const a of aps) { const o = a.b[a.i]; const v = y + o * 0.5; a.b[a.i] = v; a.i = (a.i + 1) % a.d; y = o - v * 0.5; }
      out[n] = buf[n] * (1 - mix * 0.5) + y * mix;
    }
    return out;
  }
  /** 설정 → Float32Array (44.1kHz 모노) */
  function synth(p, seed) {
    const g = makeSynth(p);
    let s0 = seed || 12345; const rnd = () => ((s0 = (s0 * 1664525 + 1013904223) >>> 0) / 4294967296);
    const on = g.layers.filter(l => l.on !== false);
    const dry = on.reduce((m, l) => Math.max(m, (l.delay + l.length + l.release) * g.stretch), 0.05);
    const tail = (g.reverbMix > 0 ? 0.4 + g.reverbSize * 1.6 : 0) + (g.echoMix > 0 ? g.echoTime * 4 : 0);
    let out = new Float32Array(Math.ceil((dry + tail) * RATE));
    on.forEach(l => renderLayer(l, g, out, rnd));
    if (g.drive > 0) { const k = 1 + g.drive * 8; for (let i = 0; i < out.length; i++) out[i] = Math.tanh(out[i] * k) / Math.tanh(k); }
    if (g.echoMix > 0) {
      const d = Math.max(1, Math.round(g.echoTime * RATE)), o = new Float32Array(out.length);
      for (let i = 0; i < out.length; i++) o[i] = out[i] + (i >= d ? o[i - d] * g.echoFeedback : 0);
      for (let i = 0; i < out.length; i++) out[i] = out[i] * (1 - g.echoMix * 0.5) + (o[i] - out[i]) * g.echoMix;
    }
    out = reverb(out, g.reverbMix, g.reverbSize, g.reverbDamp);
    let peak = 0; for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
    // 끝부분 무음 자르기 + 정규화 + 끝 페이드
    let end = out.length; while (end > 1 && Math.abs(out[end - 1]) < peak * 0.001) end--;
    out = out.slice(0, Math.max(1, end));
    const norm = peak > 0 ? 0.9 * g.volume / peak : 1, fade = Math.min(out.length, Math.floor(0.01 * RATE));
    for (let i = 0; i < out.length; i++) out[i] *= norm * (i >= out.length - fade ? (out.length - i) / fade : 1);
    return out;
  }
  /** 살짝 바꾸기: 음높이·길이·필터를 조금씩 흔듦 */
  function vary(p, amt = 0.12) {
    const g = makeSynth(JSON.parse(JSON.stringify(p)));
    const j = x => x * (1 + (Math.random() * 2 - 1) * amt);
    g.layers.forEach(l => { l.freq = j(l.freq); if (l.freqEnd) l.freqEnd = j(l.freqEnd); l.decay = j(l.decay); l.cutoff = j(l.cutoff); if (l.cutoffEnd) l.cutoffEnd = j(l.cutoffEnd); });
    return g;
  }

  return { entry, resolve, label, bufferOfPath, dataToBuffer, invalidate, play, playBuffer, stop, position, encodeWav, bufferFrom, channelsOf, drawWave,
    RATE, LAYER_DEFAULT, SYNTH_DEFAULT, SYNTH_PRESETS, SYNTH_NAMES, makeSynth, synth, vary, ac, get playing() { return playing; } };
})();
