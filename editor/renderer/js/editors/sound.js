// ================================================================
//  사운드 편집기 — 프로젝트 소리 목록 (audio/sounds.json)
//   · 가져오기(ogg/mp3/wav) · 게임 소리 복사 · 미리 듣기 · 음량/음높이/반복 · 사용하는 곳
//   · 파형 편집: 구간 선택 → 자르기/지우기/무음/페이드/음량/노멀라이즈/뒤집기/속도, 되돌리기, WAV 로 저장
//   · 효과음 만들기 (층·FM·필터·잔향 합성기, 설정을 저장해 두고 다시 만들 수 있음)
//   게임에서는 sound:<id> 로 부르고 (이벤트 "효과음/음악", 맵 그룹·노드 배경음), 게임 설정의 음량을 따릅니다.
// ================================================================
(function () {
  const { h } = PDM;
  const store = PDM.store;
  const K = 'sounds';
  const KIND = { bgm: '배경음', se: '효과음' };
  const list = () => (store.get(K) || {}).sounds || [];
  const fmt = t => (t == null || !isFinite(t)) ? '-' : `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

  function uniqueId(base) {
    let id = PDM.slugId(base || 'sound') || 'sound', n = 2;
    const ids = new Set(list().map(s => s.id));
    const b = id; while (ids.has(id)) id = b + '_' + (n++);
    return id;
  }
  function addEntry(e, label) { store.edit(K, label || '소리 추가', r => { r.sounds = r.sounds || []; r.sounds.push(e); }); }
  async function uniquePath(rel) {
    const dot = rel.lastIndexOf('.'), base = rel.slice(0, dot), ext = rel.slice(dot);
    let p = rel, n = 2;
    while (await pdm.exists(store.abs(p))) p = `${base}_${n++}${ext}`;
    return p;
  }

  /** 파일 가져오기 */
  async function importFile() {
    const src = await pdm.openFile('소리 파일 (ogg · mp3 · wav)', ['ogg', 'mp3', 'wav']);
    if (!src) return;
    const name = pdm.basename(src), ext = (name.split('.').pop() || '').toLowerCase();
    if (!['ogg', 'mp3', 'wav'].includes(ext)) { toast('ogg, mp3, wav 만 게임에서 재생됩니다', 'bad'); return; }
    let rel = pdm.relative(store.root, src).replace(/\\/g, '/');
    if (rel.startsWith('..') || /^[A-Za-z]:/.test(rel)) { rel = await uniquePath(`assets/audio/${name}`); await pdm.copy(src, store.abs(rel)); }
    if (ext === 'wav') {   // 게임은 16비트(또는 8비트) PCM WAV 만 읽음 — 24비트 · float 등은 16비트로 바꿔 둠
      try {
        const info = PDM.audio.wavInfo(await pdm.readDataURL(store.abs(rel)));
        if (!PDM.audio.wavOk(info)) {
          if (!rel.startsWith('assets/audio/')) { const own = await uniquePath(`assets/audio/${name}`); await pdm.copy(store.abs(rel), store.abs(own)); rel = own; }   // 원본은 그대로 두고 사본을 바꿈
          const r = await PDM.audio.fixWav(store.abs(rel));
          if (r.changed) toast(`WAV(${r.from})는 게임에서 재생되지 않아 16비트로 바꿨습니다`, 'ok');
        }
      } catch (e) { toast('WAV 확인 실패: ' + (e.message || e), 'bad'); }
    }
    let kind = 'se';
    try { const b = await PDM.audio.bufferOfPath(store.abs(rel)); kind = b.duration > 12 ? 'bgm' : 'se'; } catch (_) { /* 길이 모름 */ }
    const id = uniqueId(name.replace(/\.[^.]+$/, ''));
    addEntry({ id, name: name.replace(/\.[^.]+$/, ''), kind, file: rel, volume: 1, pitch: 1, loop: kind === 'bgm', note: '' }, '소리 가져오기');
    st.sel = id; toast(`「${id}」 가져옴 (${KIND[kind]})`);
  }
  /** 프로젝트 폴더 안의 WAV 경로인지 (assets/ 밖 — 예: audio/x.wav — 도 게임이 읽음; game: · 절대 경로 · 상위 폴더는 아님) */
  const projWav = f => typeof f === 'string' && /\.wav$/i.test(f) && !/^(game|builtin|sound):/.test(f) && !/^([A-Za-z]:|\/|\\|\.\.)/.test(f) && f.length < 400;
  /** 이 소리 파일이 게임이 못 읽는 WAV 면 경고 + 16비트로 바꾸기 버튼 */
  function wavCheck(e) {
    const box = h('div', {});
    if (/\.ogg$/i.test(e.file || '') && !/^(game|builtin):/.test(e.file)) {   // 여러 채널 ogg: 게임(libGDX jorbis)이 읽다가 멈춤
      pdm.readDataURL(store.abs(e.file)).then(d => {
        const bin = atob(d.split(',')[1] || '').slice(0, 200), i = bin.indexOf('\x01vorbis'), ch = i >= 0 ? bin.charCodeAt(i + 11) : 0;
        if (ch > 2) box.append(h('div', { style: { margin: '6px 0', padding: '8px 10px', border: '1px solid var(--warn, #c9a227)', borderRadius: '6px' } },
          h('b', {}, `⚠ ${ch}채널 ogg 는 게임에서 재생되지 않습니다`), ' ', h('span', { class: 'hint' }, '게임의 ogg 디코더가 2채널까지만 읽습니다 — 5.1 · 7.1 은 WAV 로 저장하세요 (WAV 는 5.1 · 7.1 그대로 재생).')));
      }).catch(() => {});
      return box;
    }
    if (!projWav(e.file)) return box;
    pdm.readDataURL(store.abs(e.file)).then(d => {
      const info = PDM.audio.wavInfo(d);
      if (PDM.audio.wavOk(info)) return;
      box.append(h('div', { style: { margin: '6px 0', padding: '8px 10px', border: '1px solid var(--warn, #c9a227)', borderRadius: '6px' } },
        h('b', {}, '⚠ 게임에서 재생되지 않는 WAV'), ' ', h('span', { class: 'hint' }, `${PDM.audio.wavDesc(info)} — 게임은 16비트(또는 8비트) PCM WAV 만 읽습니다 (채널은 모노 · 스테레오 · 5.1 · 7.1 등 그대로 가능) (ogg · mp3 는 상관없음). 테스트 플레이 · 내보내기 때도 자동으로 바꿉니다.`), ' ',
        h('button', { class: 'btn xs pri', onclick: async () => { try { const r = await PDM.audio.fixWav(store.abs(e.file)); if (r.changed) { toast(`16비트 WAV 로 바꿨습니다 (${r.from} →)`, 'ok'); PDM.tabs.refresh && PDM.tabs.refresh(); } } catch (err) { toast('변환 실패: ' + (err.message || err), 'bad'); } } }, '16비트로 바꾸기')));
    }).catch(() => {});
    return box;
  }
  /** 프로젝트가 쓰는 WAV(소리 목록 + 칸에 직접 넣은 assets/….wav) 중 게임이 못 읽는 것을 16비트로 — 테스트 플레이 · 내보내기 전에. → 바꾼 수 */
  async function fixProjectWavs() {
    const files = new Set();
    for (const x of ((store.get('sounds') || {}).sounds || [])) if (projWav(x.file)) files.add(x.file);
    const walk = v => { if (typeof v === 'string') { if (projWav(v)) files.add(v); } else if (v && typeof v === 'object') for (const k in v) walk(v[k]); };
    for (const k of store.keys()) walk(store.get(k));
    let n = 0;
    for (const f of files) {
      try { const r = await PDM.audio.fixWav(store.abs(f)); if (r.changed) { n++; PDM.log && PDM.log(`WAV 를 16비트로 바꿈 (게임은 ${r.from} 를 못 읽음): ${f}`, 'ok'); } }
      catch (e) { PDM.log && PDM.log(`WAV 확인 실패 ${f}: ${e.message || e}`, 'warn'); }
    }
    return n;
  }
  /** 게임 소리를 프로젝트로 복사 (편집하려면) */
  async function copyGame() {
    const pick = h('select', {}, h('optgroup', { label: '게임 음악' }, PDM.GAME_MUSIC.map(g => h('option', { value: g }, g.slice(5)))),
      h('optgroup', { label: '게임 효과음' }, PDM.GAME_SOUNDS.map(g => h('option', { value: g }, g.slice(5)))));
    const r = await PDM.ui.modal('게임 소리 가져오기', h('div', {}, PDM.ui.field('소리', h('div', { class: 'sndpick' }, pick,
      h('button', { class: 'ib', onclick: e => { e.preventDefault(); PDM.audio.play(pick.value); } }, '▶'), h('button', { class: 'ib', onclick: e => { e.preventDefault(); PDM.audio.stop(); } }, '■'))),
      h('p', { class: 'hint' }, '그대로 쓰려면 복사하지 않고 이벤트·배경음 칸에서 게임 소리를 바로 골라도 됩니다. 복사하면 파형 편집을 할 수 있습니다.')),
      [['취소', null], ['프로젝트로 복사', () => pick.value, 'pri']]);
    if (!r) return;
    const src = PDM.assets.resolvePath(r);
    if (!src) { toast('프로젝트 설정에서 게임 저장소 경로를 먼저 지정하세요', 'bad'); return; }
    const name = r.split('/').pop();
    const rel = await uniquePath(`assets/audio/${name}`);
    try { await pdm.copy(src, store.abs(rel)); } catch (e) { toast('복사 실패: ' + e.message, 'bad'); return; }
    const isBgm = r.startsWith('game:music/'), id = uniqueId(name.replace(/\.[^.]+$/, ''));
    addEntry({ id, name: name.replace(/\.[^.]+$/, ''), kind: isBgm ? 'bgm' : 'se', file: rel, volume: 1, pitch: 1, loop: isBgm, note: '게임에서 복사: ' + r }, '게임 소리 복사');
    st.sel = id;
  }

  /** 칸에서 고른 게임 소리를 프로젝트로 복사해 편집 → 돌려줌: 'sound:<id>' (그 칸을 이것으로 바꿈) */
  async function copyGameRef(ref) {
    if (!(await PDM.ui.confirm(`게임 소리 「${ref.slice(5)}」 은(는) 직접 고칠 수 없습니다. 프로젝트로 복사해서 이 칸을 복사본으로 바꾸고 파형 편집기를 열까요?`))) return null;
    const src = PDM.assets.resolvePath(ref);
    if (!src) { toast('프로젝트 설정에서 게임 저장소 경로를 먼저 지정하세요', 'bad'); return null; }
    const name = ref.split('/').pop();
    const rel = await uniquePath(`assets/audio/${name}`);
    try { await pdm.copy(src, store.abs(rel)); } catch (e) { toast('복사 실패: ' + e.message, 'bad'); return null; }
    const isBgm = ref.startsWith('game:music/'), id = uniqueId(name.replace(/\.[^.]+$/, ''));
    addEntry({ id, name: name.replace(/\.[^.]+$/, ''), kind: isBgm ? 'bgm' : 'se', file: rel, volume: 1, pitch: 1, loop: isBgm, note: '게임에서 복사: ' + ref }, '게임 소리 복사');
    st.sel = id;
    setTimeout(() => waveEditor(id), 50);
    return 'sound:' + id;
  }

  /** id 바꾸기 — 프로젝트 전체의 "sound:<옛 id>" 값을 새 id 로 (다른 목록 리소스의 id 바꾸기와 같은 동작) */
  async function renameSound(old) {
    const raw = await PDM.ui.prompt('소리 새 id (영문 · 숫자 · _)', old); if (!raw) return;
    const nu = PDM.slugId(raw.trim()); if (!nu || nu === old) return;
    if (list().some(x => x.id === nu)) { toast('이미 있는 id 입니다: ' + nu, 'bad'); return; }
    const from = 'sound:' + old, to = 'sound:' + nu;
    const fix = v => { let n = 0; if (!v || typeof v !== 'object') return 0; for (const k of Object.keys(v)) { if (v[k] === from) { v[k] = to; n++; } else n += fix(v[k]); } return n; };
    let refs = 0;
    store.transaction('소리 id 바꾸기', () => {
      store.edit(K, 'id 바꾸기', r => { const it = r.sounds.find(x => x.id === old); if (it) it.id = nu; });
      store.keys().forEach(k => { if (k === K) return; if (fix(PDM.clone(store.get(k)))) store.edit(k, '소리 id 바꾸기 (참조)', r => { refs += fix(r); }); });
    });
    st.sel = nu; PDM.tabs.refresh(K);
    PDM.log(`소리 id: ${old} → ${nu}` + (refs ? ` (쓰는 곳 ${refs}군데도 고침)` : ''), 'ok');
  }
  /** 이 소리를 쓰는 곳 — 프로젝트 전체에서 "sound:<id>" 값을 찾음 */
  const TYPE_NAMES = { event: '이벤트', item: '아이템', char: '캐릭터', hero: '영웅', node: '맵', room: '방', spell: '주문', ability: '능력' };
  const SINGLE_NAMES = { world: '맵 그래프', project: '프로젝트', dialogue: '대사창', heart: '마음 시스템', title: '타이틀', story: '스토리' };
  const FIELD_NAMES = { bgm: '배경음', bgmExtra: '배경음', bgmTense: '긴장 음악', bgmBoss: '보스 음악', music: '음악', file: '소리 명령', sound: '소리', voice: '목소리',
    throwSound: '던질 때', pickupSound: '주울 때', equipSound: '장착할 때', use: '사용', throw: '던지기', pickup: '줍기', equip: '장착',
    attack: '공격', hurt: '다침', die: '쓰러짐', talk: '말 걸기', hit: '맞힘', miss: '빗나감', break: '부서짐', open: '열기', type: '글자', next: '다음', move: '선택 이동', select: '선택' };
  function usages(id) {
    const ref = 'sound:' + id, out = [];
    for (const k of store.keys()) {
      const d = store.get(k); if (!d || typeof d !== 'object') continue;
      if (k === K) {   // 게임 아이템 소리
        Object.entries(d.gameItems || {}).forEach(([gid, m]) => Object.entries(m || {}).forEach(([f, v]) => { if (v === ref) out.push([`게임 아이템 ${gid.slice(4)} · ${FIELD_NAMES[f] || f}`, 'spditem:' + gid.slice(4)]); }));
        continue;
      }
      const hits = new Set();
      const walk = (o, last) => {
        if (typeof o === 'string') { if (o === ref) hits.add(FIELD_NAMES[last] || last); return; }
        if (Array.isArray(o)) o.forEach(x => walk(x, last));
        else if (o && typeof o === 'object') Object.entries(o).forEach(([kk, v]) => walk(v, kk));
      };
      walk(d, '');
      if (!hits.size) continue;
      const [type, rid] = k.split(':');
      const name = rid ? `${TYPE_NAMES[type] || type} ${type === 'node' ? PDM.World.fullName(rid) : (d.name || rid)}` : (SINGLE_NAMES[k] || k);
      out.push([`${name} · ${[...hits].join(', ')}`, k]);
    }
    return out;
  }

  // ---------------- 파형 편집 ----------------
  async function waveEditor(id) {
    const e = PDM.audio.entry(id); if (!e) return;
    const r = PDM.audio.resolve('sound:' + id);
    let buf;
    try { PDM.audio.invalidate(r.path); buf = await PDM.audio.bufferOfPath(r.path); } catch (err) { toast('파일을 읽지 못했습니다: ' + err.message, 'bad'); return; }
    let rate = buf.sampleRate, ch = PDM.audio.channelsOf(buf);
    const undo = [];
    const S = { sel: { a: 0, b: 0 }, view: null, cursor: null, raf: 0, dirty: false };
    const cv = h('canvas', { class: 'wave', width: 1100, height: 180 });
    const info = h('div', { class: 'info' });
    const cur = () => PDM.audio.bufferFrom(ch, rate);
    let B = cur();
    const dur = () => ch[0].length / rate;
    const redraw = () => {
      if (!S.view) S.view = { a: 0, b: dur() };
      PDM.audio.drawWave(cv, B, { sel: S.sel, view: S.view, cursor: S.cursor });
      const hasSel = S.sel.b > S.sel.a;
      info.textContent = `길이 ${fmt(dur())} · ${rate}Hz · ${ch.length}채널${hasSel ? ` · 선택 ${fmt(S.sel.a)} ~ ${fmt(S.sel.b)} (${(S.sel.b - S.sel.a).toFixed(2)}초)` : ' · 파형을 끌어서 구간 선택'}${S.dirty ? ' · 바뀜' : ''}`;
    };
    const tAt = ev => { const b = cv.getBoundingClientRect(); return S.view.a + (ev.clientX - b.left) / b.width * (S.view.b - S.view.a); };
    cv.addEventListener('mousedown', ev => {
      const t0 = Math.max(0, Math.min(dur(), tAt(ev))); S.sel = { a: t0, b: t0 };
      const mv = e2 => { const t = Math.max(0, Math.min(dur(), tAt(e2))); S.sel = { a: Math.min(t0, t), b: Math.max(t0, t) }; redraw(); };
      const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); redraw();
    });
    cv.addEventListener('wheel', ev => {
      ev.preventDefault();
      const t = tAt(ev), span = S.view.b - S.view.a, ns = Math.max(0.02, Math.min(dur(), span * (ev.deltaY > 0 ? 1.25 : 0.8)));
      let a = t - (t - S.view.a) * ns / span; a = Math.max(0, Math.min(dur() - ns, a)); S.view = { a, b: a + ns }; redraw();
    }, { passive: false });
    const range = () => {
      const hasSel = S.sel.b > S.sel.a;
      return { i0: hasSel ? Math.floor(S.sel.a * rate) : 0, i1: hasSel ? Math.floor(S.sel.b * rate) : ch[0].length, hasSel };
    };
    const apply = (label, fn) => {
      undo.push({ ch: ch.map(c => c.slice()), rate }); if (undo.length > 30) undo.shift();
      fn(); B = cur(); S.dirty = true; S.view = null;
      if (S.sel.b > dur()) S.sel = { a: 0, b: 0 };
      redraw(); toast(label);
    };
    const splice = (i0, i1, insert) => { ch = ch.map(c => { const o = new Float32Array(c.length - (i1 - i0) + (insert || 0)); o.set(c.subarray(0, i0)); o.set(c.subarray(i1), i0 + (insert || 0)); return o; }); };
    const ops = {
      trim: () => { const { i0, i1, hasSel } = range(); if (!hasSel) return toast('먼저 구간을 선택하세요', 'bad'); apply('선택 구간만 남김', () => { ch = ch.map(c => c.slice(i0, i1)); S.sel = { a: 0, b: 0 }; }); },
      cut: () => { const { i0, i1, hasSel } = range(); if (!hasSel) return toast('먼저 구간을 선택하세요', 'bad'); apply('선택 구간 지움', () => { splice(i0, i1); S.sel = { a: 0, b: 0 }; }); },
      silence: () => { const { i0, i1 } = range(); apply('무음으로', () => ch.forEach(c => c.fill(0, i0, i1))); },
      fadeIn: () => { const { i0, i1 } = range(); apply('페이드 인', () => ch.forEach(c => { for (let i = i0; i < i1; i++) c[i] *= (i - i0) / Math.max(1, i1 - i0); })); },
      fadeOut: () => { const { i0, i1 } = range(); apply('페이드 아웃', () => ch.forEach(c => { for (let i = i0; i < i1; i++) c[i] *= 1 - (i - i0) / Math.max(1, i1 - i0); })); },
      gain: async () => {
        const v = await PDM.ui.prompt('음량 배율 (1 = 그대로, 0.5 = 절반, 2 = 두 배)', '1.5'); const g = parseFloat(v); if (!isFinite(g)) return;
        const { i0, i1 } = range(); apply(`음량 ×${g}`, () => ch.forEach(c => { for (let i = i0; i < i1; i++) c[i] = Math.max(-1, Math.min(1, c[i] * g)); }));
      },
      normalize: () => {
        const { i0, i1 } = range(); let m = 0; ch.forEach(c => { for (let i = i0; i < i1; i++) m = Math.max(m, Math.abs(c[i])); });
        if (!m) return; apply('노멀라이즈 (최대 음량 95%)', () => ch.forEach(c => { for (let i = i0; i < i1; i++) c[i] *= 0.95 / m; }));
      },
      reverse: () => { const { i0, i1 } = range(); apply('뒤집기', () => ch.forEach(c => c.subarray(i0, i1).reverse())); },
      speed: async () => {
        const v = await PDM.ui.prompt('속도 배율 (음높이도 같이 바뀜. 1.5 = 빠르고 높게, 0.75 = 느리고 낮게)', '1.25'); const f = parseFloat(v); if (!(f > 0.1 && f < 8)) return;
        apply(`속도 ×${f}`, () => { ch = ch.map(c => { const n = Math.max(1, Math.floor(c.length / f)), o = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i * f, j = Math.floor(x), t = x - j; o[i] = (c[j] || 0) * (1 - t) + (c[j + 1] || 0) * t; } return o; }); S.sel = { a: 0, b: 0 }; });
      },
      addSilence: async () => {
        const v = await PDM.ui.prompt('끝에 붙일 무음 길이 (초)', '0.5'); const sec = parseFloat(v); if (!(sec > 0)) return;
        apply('무음 추가', () => { const n = Math.floor(sec * rate); ch = ch.map(c => { const o = new Float32Array(c.length + n); o.set(c); return o; }); });
      },
      mono: () => { if (ch.length < 2) return toast('이미 모노입니다'); apply('모노로 합치기', () => { const m = new Float32Array(ch[0].length); ch.forEach(c => { for (let i = 0; i < m.length; i++) m[i] += c[i] / ch.length; }); ch = [m]; }); },
      undo: () => { const u = undo.pop(); if (!u) return toast('되돌릴 것이 없습니다'); ch = u.ch; rate = u.rate; B = cur(); S.view = null; redraw(); }
    };
    let loopPlay = false;
    const tick = () => { S.cursor = PDM.audio.position(); if (S.cursor !== null && loopPlay && S.sel.b > S.sel.a) { const L = S.sel.b - S.sel.a; S.cursor = S.sel.a + ((S.cursor - S.sel.a) % L); } redraw(); if (PDM.audio.playing) S.raf = requestAnimationFrame(tick); else { S.cursor = null; redraw(); } };
    const play = loop => {
      loopPlay = loop; const hasSel = S.sel.b > S.sel.a;
      PDM.audio.playBuffer(B, { from: hasSel ? S.sel.a : 0, to: hasSel ? S.sel.b : undefined, loop, volume: e.volume ?? 1, pitch: e.pitch ?? 1 });
      cancelAnimationFrame(S.raf); S.raf = requestAnimationFrame(tick);
    };
    const btn = (t, fn, cls) => h('button', { class: 'btn sm' + (cls ? ' ' + cls : ''), onclick: ev => { ev.preventDefault(); fn(); } }, t);
    const body = h('div', { class: 'wave-ed', style: { width: '1120px', maxWidth: '90vw' } },
      h('div', { class: 'tools' }, btn('▶ 재생 (선택 구간)', () => play(false), 'pri'), btn('⟳ 반복 재생', () => play(true)), btn('■ 멈춤', () => PDM.audio.stop()),
        h('span', { class: 'tb-sep' }), btn('전체 보기', () => { S.view = null; redraw(); }), btn('전체 선택', () => { S.sel = { a: 0, b: dur() }; redraw(); }), btn('선택 해제', () => { S.sel = { a: 0, b: 0 }; redraw(); })),
      cv, info,
      h('div', { class: 'tools' }, btn('✂ 선택만 남기기', ops.trim), btn('선택 지우기', ops.cut), btn('무음으로', ops.silence), btn('페이드 인', ops.fadeIn), btn('페이드 아웃', ops.fadeOut),
        btn('음량…', ops.gain), btn('노멀라이즈', ops.normalize), btn('뒤집기', ops.reverse), btn('속도·음높이…', ops.speed), btn('끝에 무음…', ops.addSilence), btn('모노로', ops.mono),
        h('span', { class: 'tb-sep' }), btn('↶ 되돌리기', ops.undo)),
      h('p', { class: 'hint' }, '선택 구간이 없으면 전체에 적용됩니다. 휠로 확대/축소. 저장하면 WAV 파일로 씁니다 (원본이 ogg/mp3 면 같은 이름의 .wav 를 새로 만들고 이 소리가 그 파일을 가리킵니다).'));
    setTimeout(redraw, 0);
    const res = await PDM.ui.modal(`파형 편집 — ${e.name || e.id}`, body, [['닫기', null], ['WAV 로 저장', 'save', 'pri']]);
    PDM.audio.stop(); cancelAnimationFrame(S.raf);
    if (res !== 'save') { if (S.dirty) toast('저장하지 않고 닫았습니다'); return; }
    let rel = e.file;
    if (!rel.startsWith('assets/') || !rel.toLowerCase().endsWith('.wav')) rel = await uniquePath(`assets/audio/${e.id}.wav`);
    await pdm.writeDataURL(store.abs(rel), PDM.audio.encodeWav(ch, rate));
    PDM.audio.invalidate(store.abs(rel));
    if (rel !== e.file) store.edit(K, '소리 파일 바꿈', o => { o.sounds.find(x => x.id === id).file = rel; });
    else PDM.tabs.refresh(K);
    toast('저장했습니다: ' + rel);
  }

  // ---------------- 효과음 만들기 (합성기) ----------------
  async function sfxMaker(id) {
    const A = PDM.audio;
    const old = id ? A.entry(id) : null;
    let P = A.makeSynth((old && old.synth) || A.SYNTH_PRESETS.bell());
    let seed = 1 + Math.floor(Math.random() * 1e6);
    const cv = h('canvas', { class: 'wave', width: 900, height: 110 });
    const globalBox = h('div', { class: 'sfx-grid' }), layerBox = h('div', {});
    const render = () => A.synth(P, seed);
    const redraw = () => { const d = render(); A.drawWave(cv, A.bufferFrom([d], A.RATE)); return d; };
    const playNow = () => { const d = redraw(); A.playBuffer(A.bufferFrom([d], A.RATE)); };
    const slider = (obj, k, lab, mn, mx, step, log) => {
      const toS = v => log ? Math.log(Math.max(v, mn)) : v, fromS = v => log ? Math.round(Math.exp(v) * 10) / 10 : v;
      const out = h('b', {}, String(obj[k]));
      const r = h('input', { type: 'range', min: toS(mn), max: toS(mx), step: log ? 0.01 : step, value: toS(obj[k]) });
      r.addEventListener('input', () => { obj[k] = fromS(parseFloat(r.value)); out.textContent = String(obj[k]); redraw(); });
      r.addEventListener('change', playNow);
      return h('label', {}, h('span', {}, lab, ' ', out), r);
    };
    const select = (obj, k, lab, opts) => {
      const s = h('select', { onchange: () => { obj[k] = s.value; drawLayers(); playNow(); } }, Object.entries(opts).map(([v, t]) => h('option', { value: v }, t)));
      s.value = obj[k]; return h('label', {}, lab, s);
    };
    const drawGlobal = () => {
      globalBox.innerHTML = '';
      globalBox.append(slider(P, 'pitch', '전체 음높이 배율', 0.25, 4, 0.01, true), slider(P, 'stretch', '전체 길이 배율', 0.25, 4, 0.01, true), slider(P, 'brightness', '밝기(필터 배율)', 0.2, 4, 0.01, true),
        slider(P, 'drive', '거칠기(드라이브)', 0, 1, 0.01), slider(P, 'reverbMix', '잔향 양', 0, 1, 0.01), slider(P, 'reverbSize', '잔향 크기(공간)', 0, 1, 0.01),
        slider(P, 'reverbDamp', '잔향 먹먹함', 0, 0.95, 0.01), slider(P, 'echoMix', '메아리 양', 0, 1, 0.01), slider(P, 'echoTime', '메아리 간격(초)', 0.03, 0.8, 0.01),
        slider(P, 'echoFeedback', '메아리 반복', 0, 0.85, 0.01), slider(P, 'volume', '음량', 0.1, 1, 0.01));
    };
    const WAVES = { sine: '사인 (맑음)', triangle: '삼각 (부드러움)', saw: '톱니 (풍성함)', square: '사각 (속이 빔)', noise: '잡음 (바람·타격)' };
    const FILTERS = { none: '없음', lp: '저역 통과 (먹먹하게)', hp: '고역 통과 (가늘게)', bp: '대역 통과 (한 대역만)' };
    const drawLayers = () => {
      layerBox.innerHTML = '';
      P.layers.forEach((l, i) => {
        const tone = l.wave !== 'noise';
        const box = h('details', { class: 'sec', open: i === 0 },
          h('summary', { class: 'sec-head pointer' },
            `층 ${i + 1} · ${WAVES[l.wave].split(' ')[0]}${tone ? ` ${Math.round(l.freq)}Hz` : ''}${l.filter !== 'none' ? ' · ' + FILTERS[l.filter].split(' ')[0] : ''}`,
            h('span', { class: 'grow' }),
            h('label', { class: 'fs-xs', onclick: e => e.stopPropagation() }, (() => { const c = h('input', { type: 'checkbox', checked: l.on !== false }); c.addEventListener('change', () => { l.on = c.checked; playNow(); }); return c; })(), ' 켜기'),
            h('button', { class: 'ib', title: '복제', onclick: e => { e.preventDefault(); P.layers.splice(i + 1, 0, JSON.parse(JSON.stringify(l))); drawLayers(); playNow(); } }, '⧉'),
            h('button', { class: 'ib danger', title: '삭제', onclick: e => { e.preventDefault(); P.layers.splice(i, 1); drawLayers(); playNow(); } }, '✕')),
          h('div', { class: 'sfx-grid', style: { padding: '6px 8px' } },
            select(l, 'wave', '파형', WAVES),
            tone ? slider(l, 'freq', '음높이(Hz)', 20, 8000, 1, true) : null, tone ? slider(l, 'freqEnd', '끝 음높이(0=같음)', 0, 8000, 1) : null, tone ? slider(l, 'glide', '미끄러지는 시간', 0.001, 2, 0.001) : null,
            tone ? slider(l, 'unison', '겹친 목소리 수', 1, 7, 1) : null, tone ? slider(l, 'spread', '겹침 퍼짐(센트)', 0, 50, 1) : null,
            tone ? slider(l, 'fmRatio', 'FM 배율 (종·금속, 0=끔)', 0, 8, 0.01) : null, tone ? slider(l, 'fmIndex', 'FM 세기', 0, 10, 0.1) : null, tone ? slider(l, 'fmDecay', 'FM 사라짐(초)', 0.01, 2, 0.01) : null,
            slider(l, 'vibRate', '떨림 속도(Hz)', 0, 30, 0.1), slider(l, 'vibDepth', '떨림 깊이(센트)', 0, 100, 1),
            slider(l, 'delay', '시작 지연(초)', 0, 2, 0.005), slider(l, 'gain', '크기', 0, 1.5, 0.01),
            slider(l, 'attack', '올라옴(초)', 0.001, 2, 0.001), slider(l, 'hold', '유지(초)', 0, 2, 0.01), slider(l, 'decay', '사라짐(초)', 0.01, 4, 0.01),
            slider(l, 'sustain', '남는 크기', 0, 1, 0.01), slider(l, 'length', '누르는 길이(초)', 0.01, 4, 0.01), slider(l, 'release', '끝 여운(초)', 0.001, 3, 0.001),
            select(l, 'filter', '필터', FILTERS),
            l.filter !== 'none' ? slider(l, 'cutoff', '필터 시작(Hz)', 30, 16000, 1, true) : null, l.filter !== 'none' ? slider(l, 'cutoffEnd', '필터 끝(0=같음)', 0, 16000, 1) : null,
            l.filter !== 'none' ? slider(l, 'q', '울림(Q)', 0.2, 20, 0.1) : null));
        layerBox.append(box);
      });
      layerBox.append(h('button', { class: 'btn sm add', onclick: e => { e.preventDefault(); if (P.layers.length >= 4) return toast('층은 4개까지'); P.layers.push(Object.assign({}, A.LAYER_DEFAULT)); drawLayers(); playNow(); } }, '+ 층 추가'));
    };
    const presets = h('div', { class: 'tools' }, Object.entries(A.SYNTH_NAMES).map(([k, v]) => h('button', { class: 'btn sm', onclick: ev => { ev.preventDefault(); P = A.makeSynth(A.SYNTH_PRESETS[k]()); drawGlobal(); drawLayers(); playNow(); } }, v)),
      h('span', { class: 'tb-sep' }),
      h('button', { class: 'btn sm', onclick: ev => { ev.preventDefault(); P = A.vary(P); seed++; drawGlobal(); drawLayers(); playNow(); } }, '살짝 바꾸기'));
    const body = h('div', { class: 'wave-ed' },
      h('p', { class: 'hint' }, '시작할 소리를 고르고 다듬으세요. 층(파형·음높이·FM·필터·엔벨로프)을 겹쳐 만들고, 전체에 잔향·메아리를 씌웁니다. 슬라이더에서 손을 떼면 다시 들려줍니다. 저장하면 WAV 파일이 되고 설정도 함께 저장돼 "다시 만들기"로 고칠 수 있습니다.'),
      presets, cv,
      h('div', { class: 'tools' }, h('button', { class: 'btn sm pri', onclick: ev => { ev.preventDefault(); playNow(); } }, '▶ 들어보기'), h('button', { class: 'btn sm', onclick: ev => { ev.preventDefault(); A.stop(); } }, '■')),
      h('div', { class: 'fl' }, '전체'), globalBox, h('div', { class: 'fl mt-4' }, '층'), layerBox);
    drawGlobal(); drawLayers(); setTimeout(redraw, 0);
    const res = await PDM.ui.modal(old ? `효과음 다시 만들기 — ${old.name}` : '효과음 만들기', body, [['취소', null], [old ? '덮어쓰기' : '저장', 'save', 'pri']]);
    A.stop();
    if (res !== 'save') return;
    const data = render();
    if (old) {
      const rel = old.file && old.file.startsWith('assets/') && old.file.endsWith('.wav') ? old.file : await uniquePath(`assets/audio/${old.id}.wav`);
      await pdm.writeDataURL(store.abs(rel), A.encodeWav([data], A.RATE)); A.invalidate(store.abs(rel));
      store.edit(K, '효과음 다시 만들기', o => { const x = o.sounds.find(s2 => s2.id === old.id); x.file = rel; x.synth = PDM.clone(P); x.seed = seed; delete x.sfx; });
      return;
    }
    const name = await PDM.ui.prompt('효과음 이름 (id 는 영문으로 자동)', 'sfx'); if (!name) return;
    const nid = uniqueId(/[A-Za-z0-9]/.test(name) ? name : 'sfx');
    const rel = await uniquePath(`assets/audio/${nid}.wav`);
    await pdm.writeDataURL(store.abs(rel), A.encodeWav([data], A.RATE));
    addEntry({ id: nid, name, kind: 'se', file: rel, volume: 1, pitch: 1, loop: false, note: '효과음 만들기로 만든 소리', synth: PDM.clone(P), seed }, '효과음 만들기');
    st.sel = nid;
  }

  // ---------------- 화면 ----------------
  const st = { sel: null, filter: '' };
  /** 사운드 편집기를 열고 그 소리를 고른 상태로 */
  function select(id) { if (id) st.sel = id; PDM.tabs.open(K); PDM.tabs.refresh && PDM.tabs.refresh(K); }
  PDM.sounds = { fixProjectWavs, importFile, copyGame, copyGameRef, waveEditor, sfxMaker, usages, select };

  PDM.registerEditor({
    id: 'sound', icon: () => '🎵', title: () => '사운드',
    match: k => k === K,
    watch: ck => ck === K || ck === 'world',
    tree() {
      if (!store.isOpen) return [];
      const l = list();
      return [{ id: 'sounds', label: '사운드', icon: '🎵', order: 50, count: l.length, open: K,
        menu: [{ label: '파일 가져오기…', run: () => { PDM.tabs.open(K); importFile(); } }, { label: '효과음 만들기…', run: () => { PDM.tabs.open(K); sfxMaker(); } }] }];
    },
    render(key, ctx) {
      const { F, section, row } = PDM.ui;
      const all = list();
      const shown = all.filter(s => !st.filter || (s.kind || 'se') === st.filter);
      if (!st.sel || !all.some(s => s.id === st.sel)) st.sel = (shown[0] || all[0] || {}).id || null;
      const idx = all.findIndex(s => s.id === st.sel), e = all[idx];
      const rows = shown.map(s => {
        const cv = h('canvas', { width: 220, height: 40 });
        const r = PDM.audio.resolve('sound:' + s.id);
        if (r && r.path) PDM.audio.bufferOfPath(r.path).then(b => PDM.audio.drawWave(cv, b, { bg: '#1c1924' })).catch(() => { const g = cv.getContext('2d'); g.fillStyle = '#ff7a93'; g.font = '11px sans-serif'; g.fillText('파일 없음', 8, 24); });
        return h('div', { class: 'snd-row' + (s.id === st.sel ? ' on' : ''), onclick: ev => { if (ev.target.tagName === 'BUTTON') return; st.sel = s.id; ctx.refresh(); } },
          h('button', { class: 'ib', title: '재생', onclick: () => PDM.audio.play('sound:' + s.id) }, '▶'),
          h('div', {}, h('b', {}, s.name || s.id), ' ', h('span', { class: 'kind ' + (s.kind || 'se') }, KIND[s.kind || 'se']), h('div', { class: 'hint mono' }, `sound:${s.id} · ${s.file}`)),
          cv,
          h('button', { class: 'ib', title: '멈춤', onclick: () => PDM.audio.stop() }, '■'));
      });
      const detail = e ? (() => {
        const p = ['sounds', idx], used = usages(e.id);
        return section(`「${e.name || e.id}」`,
          row(F.text(K, [...p, 'name'], { label: '이름', rerender: true }), F.text(K, [...p, 'id'], { label: 'id (sound:id 로 부름)', transform: v => PDM.slugId(v), rerender: true, onchange: v => { st.sel = v; } }),
            F.select(K, [...p, 'kind'], KIND, { label: '종류', rerender: true })),
          row(F.num(K, [...p, 'volume'], { label: '음량 배율', step: 0.05, min: 0, max: 2, def: 1, hint: '게임 설정 음량에 곱함' }),
            F.num(K, [...p, 'pitch'], { label: '음높이 (효과음)', step: 0.05, min: 0.5, max: 2, def: 1 }),
            (e.kind || 'se') === 'bgm' ? F.bool(K, [...p, 'loop'], { label: '반복' }) : h('span')),
          row(F.text(K, [...p, 'file'], { label: '파일', rerender: true }),
            h('div', { class: 'field' }, h('span', { class: 'fl' }, ' '), h('div', { class: 'flex gap-2' },
              h('button', { class: 'btn sm', onclick: () => PDM.audio.play('sound:' + e.id) }, '▶ 듣기'),
              h('button', { class: 'btn sm', onclick: () => PDM.audio.stop() }, '■'),
              h('button', { class: 'btn sm pri', onclick: () => waveEditor(e.id) }, '파형 편집…'),
              e.synth ? h('button', { class: 'btn sm', onclick: () => sfxMaker(e.id) }, '다시 만들기…') : null))),
          wavCheck(e),
          F.textarea(K, [...p, 'note'], { label: '메모', rows: 2 }),
          h('div', { class: 'fl mt-3' }, `쓰는 곳 (${used.length})`),
          used.length ? h('div', {}, used.map(([t, k]) => h('button', { class: 'chip', onclick: () => PDM.tabs.open(k) }, t))) : h('p', { class: 'hint' }, '아직 쓰는 곳이 없습니다. 맵 그래프의 배경음, 이벤트 명령 "효과음/음악", 아이템·캐릭터·게임 아이템의 "소리", 대사창·마음 시스템의 소리에서 고르세요.'),
          h('div', { class: 'flex gap-3 mt-5' },
            h('button', { class: 'btn sm', title: 'id 를 바꾸고 쓰는 곳의 "sound:<id>" 도 함께 고칩니다', onclick: () => renameSound(e.id) }, 'id 바꾸기…'),
            h('button', { class: 'btn sm', onclick: () => { const c = PDM.clone(e); c.id = uniqueId(e.id + '_copy'); c.name = (e.name || e.id) + ' 사본'; addEntry(c, '소리 복제'); st.sel = c.id; } }, '복제 (같은 파일)'),
            h('button', { class: 'btn sm danger', onclick: async () => {
              if (!(await PDM.ui.confirm(`「${e.name || e.id}」 을(를) 목록에서 지울까요?${used.length ? ` (${used.length}곳에서 쓰는 중)` : ''} 파일은 남겨 둡니다.`))) return;
              store.edit(K, '소리 삭제', o => { o.sounds.splice(o.sounds.findIndex(x => x.id === e.id), 1); }); st.sel = null;
            } }, '목록에서 삭제')));
      })() : null;
      return h('div', { class: 'page' },
        h('h1', {}, '🎵 사운드'),
        h('p', { class: 'lead' }, '프로젝트의 배경음과 효과음을 모아 두는 곳입니다. 여기 등록한 소리는 sound:<id> 로 불리고, 맵 그래프의 그룹·노드 배경음, 사용자 테마 음악, 이벤트 명령 "효과음/음악"에서 고를 수 있습니다. 게임 소리는 등록하지 않고 바로 골라도 됩니다.'),
        h('div', { class: 'flex gap-3 wrap mb-5' },
          h('button', { class: 'btn pri', onclick: importFile }, '파일 가져오기 (ogg·mp3·wav)'),
          h('button', { class: 'btn', onclick: () => sfxMaker() }, '효과음 만들기'),
          h('button', { class: 'btn', onclick: copyGame }, '게임 소리 복사해 오기'),
          h('span', { class: 'tb-sep' }),
          ...[['', '전체'], ['bgm', '배경음'], ['se', '효과음']].map(([k, t]) => h('button', { class: 'chip' + (st.filter === k ? ' on' : ''), onclick: () => { st.filter = k; ctx.refresh(); } }, `${t} ${k ? all.filter(s => (s.kind || 'se') === k).length : all.length}`)),
          h('button', { class: 'btn sm', onclick: () => PDM.audio.stop() }, '■ 모두 멈춤')),
        shown.length ? h('div', { class: 'snd-list' }, rows) : h('div', { class: 'empty' }, '소리가 없습니다. 파일을 가져오거나 효과음을 만들어 보세요.'),
        detail);
    }
  });
})();
