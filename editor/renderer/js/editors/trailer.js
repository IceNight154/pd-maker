// ================================================================
//  예고편 컷신 (확장 기능 "글자 연출"에 포함) — 장면을 순서대로 넣으면 게임 안에서 이벤트 명령으로 재생
//    데이터: trailers.json { list: [ { id, name, style(simple|band|frame), bg, bgAlpha, text, accent, skippable, fade, scenes: [ 장면 ] } ] }
//    장면 type: title { title, sub, sec } · char { chars: [ { char, image, name, line } ] (1~2명), sec } · copy { text, sec } · credit { lines, date, countdown, sec }
//    영상 파일이 아니라 게임이 그 자리에서 그림 (런타임 MakerTrailer). 이벤트 명령 "예고편 컷신 재생" (trailer)
// ================================================================
(function () {
  const { h, store } = PDM;
  const K = 'trailers';
  const list = () => (store.get(K) || {}).list || [];
  const num = (v, d) => (isFinite(+v) && v !== '' && v !== null && v !== undefined ? +v : d);
  const STYLES = { simple: '기본 (가운데 글자 + 밑줄)', band: '띠 (색 띠가 지나가며 검은 글자)', frame: '액자 (화면 둘레에 선)' };
  const TYPES = { title: '제목', char: '등장인물 소개', copy: '맺음말 (한 줄 문구)', credit: '크레딧 · 날짜' };
  const S = {
    title: () => ({ type: 'title', sub: '', title: '제목', sec: 3 }),
    char: () => ({ type: 'char', chars: [{ char: (store.all('char')[0] || {}).id || '', image: '', name: '', line: '' }], sec: 3 }),
    copy: () => ({ type: 'copy', text: '한 줄 문구', sec: 3 }),
    credit: () => ({ type: 'credit', lines: '제작: ', date: '', countdown: '', sec: 3 })
  };
  const PRESETS = { basic: '기본 예고편 (제목 → 인물 → 맺음말 → 크레딧)', opening: '오프닝 (제목 → 맺음말)', blank: '빈 컷신' };
  function make(id, preset) {
    const proj = store.get('project') || {};
    const t = { id, name: id, style: 'simple', bg: '#0c0a14', bgAlpha: 100, text: '#ffffff', accent: '#e6b95c', skippable: true, fade: 0.4, scenes: [] };
    if (preset === 'basic') t.scenes = [Object.assign(S.title(), { title: proj.name || '제목', sub: '' }), S.char(), Object.assign(S.copy(), { text: '이야기가 시작된다.' }), Object.assign(S.credit(), { lines: '제작: ' + (proj.author || '') })];
    else if (preset === 'opening') t.scenes = [Object.assign(S.title(), { title: proj.name || '제목' }), Object.assign(S.copy(), { text: '이야기가 시작된다.' })];
    return t;
  }
  const ops = PDM.listOps({ K, label: '예고편 컷신', title: '예고편 컷신', icon: '🎬', prefix: 'trailer', make, presets: PRESETS });

  // ---------------- 미리보기 (런타임 MakerTrailer 와 같은 배치)
  const imgs = {};
  const img = rel => { if (!rel) return null; if (imgs[rel] !== undefined) return imgs[rel]; imgs[rel] = null; PDM.assets.load(rel).then(i => { imgs[rel] = i || null; }).catch(() => { }); return null; };
  const countdown = d => { const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(d || '').trim()); if (!m) return null; const a = new Date(); a.setHours(0, 0, 0, 0); const n = Math.round((new Date(+m[1], m[2] - 1, +m[3]) - a) / 86400000); return n < 0 ? null : n === 0 ? 'D-DAY' : 'D-' + n; };
  function preview(cv, getT, getOpt) {
    const g = cv.getContext('2d'); let raf = 0, last = performance.now();
    const wrap = (txt, size, maxW) => { g.font = `${size}px sans-serif`; const out = []; String(txt).split('\n').forEach(par => { let line = ''; for (const chr of par) { if (g.measureText(line + chr).width > maxW && line) { out.push(line); line = chr; } else line += chr; } out.push(line); }); return out; };
    const face = c => { const ch = store.get('char:' + c.char) || null; const rel = c.image || (ch && ch.portrait && ch.portrait.default) || '';
      if (rel) { const im = img(rel); return im ? { im, sx: 0, sy: 0, sw: im.width, sh: im.height } : null; }
      if (ch && ch.sprite && ch.sprite.sheet) { const im = img(ch.sprite.sheet); return im ? { im, sx: 0, sy: 0, sw: (ch.sprite.frame || [16, 16])[0], sh: (ch.sprite.frame || [16, 16])[1] } : null; } return null; };
    const who = c => { const ch = store.get('char:' + c.char) || {}; return [c.name || ch.name || '', c.line || ch.title || '']; };
    const frame = now => {
      raf = requestAnimationFrame(frame);
      if (!cv.isConnected) { cancelAnimationFrame(raf); return; }
      if (!cv.offsetParent) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const t = getT(), o = getOpt(); if (!t) return;
      const port = !!o.portrait, W = port ? 150 : 320, H = port ? 267 : 180, Z = port ? 1.8 : 1.5;
      if (cv.width !== W * Z) { cv.width = W * Z; cv.height = H * Z; }
      const F = Math.max(1, Math.min(1.6, W / 200)), fade = Math.max(0.05, num(t.fade, 0.4));
      g.setTransform(Z, 0, 0, Z, 0, 0); g.imageSmoothingEnabled = false; g.globalAlpha = 1;
      // 뒤: 게임 화면 흉내
      g.fillStyle = '#3d3a44'; g.fillRect(0, 0, W, H); g.fillStyle = '#57534e'; for (let y = 0; y < H; y += 16) for (let x = (y / 16 % 2) * 16; x < W; x += 32) g.fillRect(x, y, 16, 16);
      const sc = t.scenes || []; if (!sc.length) return;
      let k = 1, i = PDM.clamp(o.scene | 0, 0, sc.length - 1), bgK = 1, tt = 1, dur = 2;
      if (o.playing) { o.time = (o.time || 0) + dt; let acc = 0; i = -1;
        for (let j = 0; j < sc.length; j++) { const d = Math.max(fade * 2 + 0.2, num(sc[j].sec, 3)); if (o.time < acc + d) { i = j; tt = o.time - acc; dur = d; break; } acc += d; }
        if (i < 0) { const e = o.time - acc; if (e >= fade) { o.playing = false; o.time = 0; if (o.onEnd) o.onEnd(); return; } bgK = 1 - e / fade; k = 0; i = sc.length - 1; }
        else { k = tt < fade ? tt / fade : tt > dur - fade ? Math.max(0, (dur - tt) / fade) : 1; if (i === 0) bgK = Math.min(1, tt / fade); } }
      g.globalAlpha = Math.max(0, Math.min(1, num(t.bgAlpha, 100) / 100)) * bgK; g.fillStyle = t.bg || '#000'; g.fillRect(0, 0, W, H);
      if (k <= 0) return;
      const s = sc[i], cx = W / 2, maxW = W * 0.86, band = t.style === 'band', cT = band ? '#000000' : (t.text || '#fff'), cA = band ? '#000000' : (t.accent || '#e6b95c');
      const rows = [];   // { lines, size, color, gap } | { face, h, gap } | { pair }
      const T = (txt, size, color, gap) => { if (txt) rows.push({ lines: wrap(txt, Math.round(size * F), maxW), size: Math.round(size * F), color, gap: gap || 0 }); };
      if (s.type === 'title') { T(s.sub, 7, cA, 0); T(s.title, 16, cT, 4); }
      else if (s.type === 'char') { const cs = (s.chars || []).slice(0, 2), ih = Math.min(H * 0.34, 64 * F);
        if (cs.length > 1) rows.push({ pair: cs, ih, gap: 0 });
        else if (cs.length) { const f = face(cs[0]); if (f) rows.push({ face: f, h: ih, gap: 0 }); const [nm, ln] = who(cs[0]); T(nm, 12, cT, 5); T(ln, 7, cA, 3); } }
      else if (s.type === 'credit') { T(s.lines, 8, cT, 0); T(s.date, 7, cA, 6); T(countdown(s.countdown), 14, cA, 6); }
      else T(s.text, 11, cT, 0);
      const lh = r => r.lines.length * (r.size + 2);
      const pairH = r => Math.max(...r.pair.map(c => { const [nm, ln] = who(c); return (face(c) ? r.ih : 0) + (nm ? Math.round(10 * F) + 6 : 0) + (ln ? Math.round(6 * F) + 4 : 0); }));
      const total = rows.reduce((a, r) => a + r.gap + (r.lines ? lh(r) : r.face ? r.h : pairH(r)), 0);
      let y = (H - total) / 2;
      if (band) { g.globalAlpha = 0.92; g.fillStyle = t.accent || '#e6b95c'; const bx = o.playing ? -W * (1 - k) * (tt < dur / 2 ? 1 : -1) : 0; g.fillRect(bx, y - 10, W, total + 20); }
      g.globalAlpha = k;
      if (t.style === 'frame') { g.strokeStyle = t.accent || '#e6b95c'; g.lineWidth = 1; g.globalAlpha = 0.9 * k; g.strokeRect(8.5, 8.5, W - 17, H - 17); g.globalAlpha = k; }
      const drawT = (lines, size, color, x, y0) => { g.font = `${size}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillStyle = color; lines.forEach((l, n) => g.fillText(l, x, y0 + n * (size + 2))); return y0 + lines.length * (size + 2); };
      const drawF = (f, hh, x, y0) => { const w = f.sw * hh / f.sh; g.drawImage(f.im, f.sx, f.sy, f.sw, f.sh, x - w / 2, y0, w, hh); };
      rows.forEach(r => { y += r.gap;
        if (r.lines) y = drawT(r.lines, r.size, r.color, cx, y);
        else if (r.face) { drawF(r.face, r.h, cx, y); y += r.h; }
        else { const y0 = y; let end = y; r.pair.forEach((c, n) => { const x = W * (n === 0 ? 0.27 : 0.73), f = face(c), [nm, ln] = who(c); let yy = y0; if (f) { drawF(f, r.ih, x, yy); yy += r.ih; }
          if (nm) yy = drawT(wrap(nm, Math.round(10 * F), W * 0.44), Math.round(10 * F), cT, x, yy + 4); if (ln) yy = drawT(wrap(ln, Math.round(6 * F), W * 0.44), Math.round(6 * F), cA, x, yy + 2); end = Math.max(end, yy); }); y = end; } });
      if (t.style === 'simple' && rows.length && !rows[rows.length - 1].pair) { g.globalAlpha = 0.9 * k; g.fillStyle = t.accent || '#e6b95c'; const lw = Math.min(W * 0.5, 80); g.fillRect(cx - lw / 2, y + 4, lw, 1); }
      g.globalAlpha = 1;
    };
    raf = requestAnimationFrame(frame);
  }

  PDM.trailers = { K, make, ops, list };

  PDM.registerEditor({
    id: K, icon: '🎬', title: () => '예고편 컷신',
    match: k => k === K,
    tree: () => store.isOpen && PDM.extensions && PDM.extensions.on('textfx') ? [ops.treeNode(54.5)] : [],
    render(key, ctx) {
      const { F, row } = PDM.ui;
      const st = ctx.state = ctx.state || { scene: 0, portrait: false, playing: false };
      const all = list();
      if (ops.take(st)) st.scene = 0;
      if (!all.some(x => x.id === st.id)) { st.id = (all[0] || {}).id; st.scene = 0; }
      const idx = all.findIndex(x => x.id === st.id), t = all[idx];
      const intro = h('p', { class: 'hint' }, '제목 · 등장인물 소개 · 맺음말 · 크레딧 장면을 순서대로 넣어 예고편(오프닝 · 장 시작 · 엔딩 크레딧)을 만듭니다. 이벤트 명령 "예고편 컷신 재생"으로 게임 안에서 틉니다. 영상 파일이 아니라 게임이 그 자리에서 그리므로 용량이 들지 않고, 글자는 게임 글꼴로 나옵니다. 글에는 {변수} 를 쓸 수 있습니다.');
      const head = h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' } }, all.map(x => h('button', { class: 'btn sm' + (x.id === st.id ? ' pri' : ''), onclick: () => { st.id = x.id; st.scene = 0; ctx.refresh(); } }, x.name || x.id)));
      if (!t) return h('div', { class: 'editor' }, h('h2', {}, '🎬 예고편 컷신'), intro, ops.bar(null), h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, Object.entries(PRESETS).map(([k, v]) => h('button', { class: 'btn', onclick: () => ops.add(k) }, v))));
      if (st.scene >= (t.scenes || []).length) st.scene = Math.max(0, (t.scenes || []).length - 1);
      const edit = (label, fn) => store.edit(K, label, r => fn(r.list[idx]));
      const colorF = (path, cur, label) => { const c = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(cur || '') ? cur : '#000000', style: { width: '56px', padding: 0 } }); c.addEventListener('change', () => PDM.ui.commit(K, path, c.value, label)); return PDM.ui.field(label, c); };
      const cv = h('canvas', { width: 480, height: 270, style: { imageRendering: 'pixelated', border: '1px solid var(--line)', borderRadius: '6px', display: 'block' } });
      const playBtn = h('button', { class: 'btn sm pri', onclick: () => { st.playing = !st.playing; st.time = 0; playBtn.textContent = st.playing ? '■ 멈춤' : '▶ 처음부터 재생'; } }, st.playing ? '■ 멈춤' : '▶ 처음부터 재생');
      st.onEnd = () => { playBtn.textContent = '▶ 처음부터 재생'; };
      preview(cv, () => ((store.get(K) || {}).list || [])[idx], () => st);
      const sp = i => ['list', idx, 'scenes', i];
      const charOpts = [['', '(직접 적기)'], ...store.all('char').map(c => [c.id, `${c.name} (${c.id})`])];
      const charBox = (s, i) => h('div', {}, (s.chars || []).map((c, j) => h('div', { style: { borderTop: j ? '1px dashed var(--line)' : '', paddingTop: j ? '6px' : 0, marginTop: j ? '6px' : 0 } },
        row(F.select(K, [...sp(i), 'chars', j, 'char'], Object.fromEntries(charOpts), { label: `${j + 1}번 인물 (캐릭터)`, rerender: true }), F.text(K, [...sp(i), 'chars', j, 'name'], { label: '이름 (비우면 캐릭터 이름)' })),
        row(F.text(K, [...sp(i), 'chars', j, 'line'], { label: '한 줄 소개 (비우면 캐릭터의 칭호)' }),
          (() => { const tx = h('input', { type: 'text', value: c.image || '', placeholder: '(비우면 초상화 → 스프라이트)' }); tx.onchange = () => PDM.ui.commit(K, [...sp(i), 'chars', j, 'image'], tx.value.trim(), '인물 그림');
            return PDM.ui.field('그림', h('div', { class: 'imgpick' }, tx, h('button', { class: 'btn sm', onclick: async e => { e.preventDefault(); const r = await PDM.ui.pickImage('portraits'); if (r) PDM.ui.commit(K, [...sp(i), 'chars', j, 'image'], r, '인물 그림', true); } }, '찾기…'))); })()))),
        h('div', { style: { display: 'flex', gap: '6px', marginTop: '6px' } },
          (s.chars || []).length < 2 ? h('button', { class: 'btn xs', title: '두 사람을 나란히 (관계를 보여 주는 장면)', onclick: () => edit('인물 추가', x => { x.scenes[i].chars.push({ char: '', image: '', name: '', line: '' }); }) }, '+ 한 명 더 (2인 장면)') : h('button', { class: 'btn xs', onclick: () => edit('인물 빼기', x => { x.scenes[i].chars.pop(); }) }, '− 한 명으로')));
      const sceneEl = (s, i) => {
        const body = s.type === 'title' ? row(F.text(K, [...sp(i), 'sub'], { label: '위 작은 글 (부제 · 시스템)' }), F.text(K, [...sp(i), 'title'], { label: '제목' }))
          : s.type === 'char' ? charBox(s, i)
          : s.type === 'credit' ? h('div', {}, F.textarea ? F.textarea(K, [...sp(i), 'lines'], { label: '크레딧 (여러 줄)', rows: 3 }) : F.text(K, [...sp(i), 'lines'], { label: '크레딧' }),
            row(F.text(K, [...sp(i), 'date'], { label: '날짜 글 (예: 2026. 12. 24 공개)' }), F.text(K, [...sp(i), 'countdown'], { label: '남은 날 표시 — 기준일 (YYYY-MM-DD · 비우면 없음)', hint: '플레이하는 날 기준으로 D-12 · D-DAY 처럼 나옵니다. 지나면 안 나옵니다.' })))
          : F.text(K, [...sp(i), 'text'], { label: '문구' });
        return h('div', { style: { border: '1px solid ' + (i === st.scene ? 'var(--acc, #a58bff)' : 'var(--line)'), borderRadius: '8px', padding: '8px 10px', marginBottom: '8px' }, onclick: () => { if (st.scene !== i) { st.scene = i; st.playing = false; ctx.refresh(); } } },
          h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px' } }, h('b', { style: { flex: 1 } }, `${i + 1}. ${TYPES[s.type] || s.type}`),
            h('button', { class: 'ib', title: '앞으로', disabled: i === 0, onclick: e => { e.stopPropagation(); st.scene = i - 1; edit('장면 순서', x => { [x.scenes[i - 1], x.scenes[i]] = [x.scenes[i], x.scenes[i - 1]]; }); } }, '↑'),
            h('button', { class: 'ib', title: '뒤로', disabled: i === t.scenes.length - 1, onclick: e => { e.stopPropagation(); st.scene = i + 1; edit('장면 순서', x => { [x.scenes[i + 1], x.scenes[i]] = [x.scenes[i], x.scenes[i + 1]]; }); } }, '↓'),
            h('button', { class: 'ib', title: '복제', onclick: e => { e.stopPropagation(); edit('장면 복제', x => { x.scenes.splice(i + 1, 0, PDM.clone(x.scenes[i])); }); } }, '⧉'),
            h('button', { class: 'ib', title: '삭제', onclick: e => { e.stopPropagation(); edit('장면 삭제', x => { x.scenes.splice(i, 1); }); } }, '✕')),
          body, row(F.num(K, [...sp(i), 'sec'], { label: '보이는 시간 (초)', min: 0.5, max: 60, step: 0.5, def: 3 })));
      };
      const total = (t.scenes || []).reduce((a, s) => a + num(s.sec, 3), 0);
      return h('div', { class: 'editor' }, h('h2', {}, '🎬 예고편 컷신'), intro, head, ops.bar(t),
        h('div', { style: { display: 'flex', gap: '14px', alignItems: 'flex-start', flexWrap: 'wrap' } },
          h('div', { style: { flex: 'none' } }, cv,
            h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' } }, playBtn,
              (() => { const c = h('input', { type: 'checkbox', checked: st.portrait }); c.onchange = () => { st.portrait = c.checked; }; return h('label', { class: 'check' }, c, '세로 화면 (모바일)'); })(),
              h('span', { class: 'hint' }, `전체 ${total.toFixed(1)}초 · 장면을 누르면 그 장면이 보입니다`)),
            h('div', { class: 'hint', style: { marginTop: '4px', maxWidth: '480px' } }, '미리보기의 글꼴은 게임 글꼴과 다릅니다 (배치 확인용).')),
          h('div', { style: { flex: 1, minWidth: '380px' } },
            row(F.text(K, ['list', idx, 'name'], { label: '이름', rerender: true }), F.select(K, ['list', idx, 'style'], STYLES, { label: '틀' })),
            row(colorF(['list', idx, 'bg'], t.bg, '배경 색'), F.num(K, ['list', idx, 'bgAlpha'], { label: '배경 진하기 (100 = 게임 화면 가림)', min: 0, max: 100, def: 100 }), colorF(['list', idx, 'text'], t.text, '글자 색'), colorF(['list', idx, 'accent'], t.accent, '강조 색')),
            row(F.num(K, ['list', idx, 'fade'], { label: '장면이 바뀌는 시간 (초)', min: 0.05, max: 3, step: 0.1, def: 0.4 }), F.bool(K, ['list', idx, 'skippable'], { label: '화면을 누르면 다음 장면으로' })),
            h('div', { class: 'fl', style: { margin: '8px 0 4px' } }, '장면 (위에서부터 차례로)'),
            (t.scenes || []).length ? t.scenes.map(sceneEl) : h('p', { class: 'hint' }, '장면이 없습니다. 아래에서 추가하세요.'),
            h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, Object.entries(TYPES).map(([k, n]) => h('button', { class: 'btn sm', onclick: () => { st.scene = (t.scenes || []).length; edit('장면 추가', x => { x.scenes = x.scenes || []; x.scenes.push(S[k]()); }); } }, '+ ' + n))))));
    }
  });
})();
