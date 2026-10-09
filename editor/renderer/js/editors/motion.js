// ================================================================
//  모션 랩 (확장 'motion') — CSS · HTML · JS 로 움직이는 그림을 만들고, 픽셀 아트로 구워(PNG 시트 + APNG) 게임 여러 곳에 보냄
//    데이터: motion.json { list: [ { id, name, lang: css|js, html, code, w, h, frames, fps, seed,
//                                    pixel { px, keep, alphaCut, palette('' | editor | levels), levels, dither, outline }, out, baked { fw, fh, frames, fps, cols, apng } } ] }
//    굽기 · 프레임 찍기는 공용 모션 코어(motioncore.js — PDM.motion) — 화면 필터의 코드 층 · 글자 연출과 같은 부품
//    보내기: 화면 필터 층(motion 으로 이어짐 — 다시 구우면 따라감) · 이펙트 알갱이 그림 · 맵 오브젝트 그림(애니메이션) · 노드 합성기 그림 노드 · 아이템 그림(첫 장)
//    가져오기: 화면 필터의 코드 층 · 글자 연출(만들어진 HTML · CSS 그대로)
//    예시: 기본(픽셀 게임 움직임) + 웹 모션 24종(motion-presets.js — 등장 · 스크롤 연동(시간으로) · 고정/전환/내비게이션), 묶음 메뉴 · "예시로 바꾸기" · "예시 둘러보기"(실시간 미리보기 갤러리)
//    게임 안에서 코드가 도는 것은 아님 — 구운 그림이 들어감 (정해진 길이로 반복되는 그림)
// ================================================================
(function () {
  const { h, store, toast } = PDM;
  const K = 'motion';
  const M = () => PDM.motion;
  const list = () => (store.get(K) || {}).list || [];
  const num = (v, d) => (isFinite(+v) && v !== '' && v !== null && v !== undefined ? +v : d);

  // ---------------- 예시 (픽셀 게임에 어울리는 작은 움직임 위주)
  const PX0 = { px: 1, keep: false, alphaCut: 0, palette: '', levels: 4, dither: false, outline: '' };
  const PRESETS = {
    blank: { name: '빈 CSS', lang: 'css', w: 32, h: 32, frames: 8, fps: 8, html: '', code: `/* .fx 가 그림 전체입니다. @keyframes 의 길이를 "프레임 수 ÷ 초당 프레임" 초에 맞추면 끊김 없이 반복됩니다 */
.fx::before{content:'';position:absolute;left:8px;top:8px;width:16px;height:16px;background:#a58bff;animation:pulse 1s steps(8) infinite}
@keyframes pulse{50%{transform:scale(.6);background:#dcd5ef}}`, pixel: { alphaCut: 128 } },
    star: { name: '반짝이는 별', lang: 'css', w: 16, h: 16, frames: 8, fps: 10, html: '<div class="s"></div>', code: `.s{position:absolute;left:7px;top:7px;width:2px;height:2px;background:#fff;
  box-shadow:0 -2px #fff,0 2px #fff,-2px 0 #fff,2px 0 #fff,0 -4px #ffe27a,0 4px #ffe27a,-4px 0 #ffe27a,4px 0 #ffe27a;
  animation:tw .8s steps(8) infinite}
@keyframes tw{0%,100%{transform:scale(.6);opacity:.7}50%{transform:scale(1.2);opacity:1}}`, pixel: { alphaCut: 100 } },
    ring: { name: '퍼지는 고리 (맥박)', lang: 'css', w: 32, h: 32, frames: 12, fps: 12, html: '<div class="r"></div>', code: `.r{position:absolute;left:4px;top:4px;width:24px;height:24px;border:2px solid #7fd3ff;border-radius:50%;box-sizing:border-box;animation:p 1s linear infinite}
@keyframes p{0%{transform:scale(.2);opacity:1}100%{transform:scale(1);opacity:0}}`, pixel: { alphaCut: 64, dither: true } },
    circle: { name: '도는 마법진', lang: 'css', w: 48, h: 48, frames: 16, fps: 12, html: '<div class="c"></div><div class="c2"></div>', code: `.c,.c2{position:absolute;inset:4px;border-radius:50%;box-sizing:border-box}
.c{border:2px dashed #a58bff;animation:spin 1.333s linear infinite}
.c2{inset:12px;border:2px dotted #ffe27a;animation:spin 1.333s linear infinite reverse}
@keyframes spin{to{transform:rotate(360deg)}}`, pixel: { alphaCut: 128 } },
    wave: { name: '흐르는 물결 무늬 (이어 붙임)', lang: 'css', w: 32, h: 32, frames: 8, fps: 8, html: '', code: `.fx{background:#1d3b6a;background-image:repeating-linear-gradient(135deg,transparent 0 6px,rgba(127,211,255,.55) 6px 8px);
  background-size:16px 16px;animation:mv 1s steps(8) infinite}
@keyframes mv{to{background-position:16px 0}}`, pixel: { palette: 'levels', levels: 5 } },
    text: { name: '글자가 하나씩 튀어 오름', lang: 'css', w: 96, h: 32, frames: 20, fps: 20, html: '<div class="t"><span style="--i:0">L</span><span style="--i:1">E</span><span style="--i:2">V</span><span style="--i:3">E</span><span style="--i:4">L</span></div>',
      code: `.t{position:absolute;left:0;right:0;top:8px;text-align:center;font:bold 16px monospace;color:#ffe27a;text-shadow:1px 1px #6a45d6}
.t span{display:inline-block;animation:hop 1s ease-out infinite;animation-delay:calc(var(--i) * .08s)}
@keyframes hop{0%,40%,100%{transform:translateY(0)}20%{transform:translateY(-6px)}}`, pixel: { alphaCut: 128, outline: '#231b3b' } },
    spark: { name: '떠오르는 불티 (JS)', lang: 'js', w: 32, h: 32, frames: 16, fps: 12, html: '', code: `// 프레임마다 실행 — g(캔버스) w h t(0~1 한 바퀴) frame frames rand()(씨앗 난수: 매 프레임 같은 순서)
for (let i = 0; i < 10; i++) {
  const x0 = rand() * w, sp = 0.5 + rand(), ph = rand();
  const k = (t * sp + ph) % 1, y = h - k * h;
  g.fillStyle = k < .5 ? '#ffe27a' : '#ff7a3c';
  g.globalAlpha = 1 - k;
  g.fillRect(Math.round(x0 + Math.sin((k + ph) * 6.28) * 2), Math.round(y), 1, 1);
}`, pixel: {} },
    flame: { name: '일렁이는 불꽃 (JS)', lang: 'js', w: 16, h: 24, frames: 8, fps: 10, html: '', code: `const cols = ['#fff3b0', '#ffd23f', '#ff8c2a', '#d9381e'];
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const cx = w / 2 + Math.sin(t * 6.28 + y * .45) * 1.5, r = (h - y) / h * (w / 2.2);
  const d = Math.abs(x + .5 - cx) / Math.max(.5, r) + Math.sin(t * 12.56 + x * .9 + y * .3) * .12;
  if (d < 1 && y > 2) { g.fillStyle = cols[Math.min(3, Math.floor(d * 3.2 + (1 - y / h) * .9))]; g.fillRect(x, y, 1, 1); }
}`, pixel: {} }
  };
  // 화면 필터의 예시 코드도 (필터 편집기가 먼저 실렸으면)
  const filterPresets = () => PDM.filters && PDM.filters.CODE ? {
    scanbar: { name: '훑는 빛 + 조리개 (화면 · CSS)', lang: 'css', w: 160, h: 96, frames: 12, fps: 12, html: '', code: PDM.filters.CODE.scanbar, pixel: {} },
    crack: { name: '깨진 화면 (화면 · JS)', lang: 'js', w: 160, h: 96, frames: 1, fps: 8, html: '', code: PDM.filters.CODE.crack, pixel: {} } } : {};
  const allPresets = () => Object.assign({}, PRESETS, filterPresets(), PDM.MOTION_WEB_PRESETS || {});
  /** 예시 묶음 [[묶음 이름, [키 …]]] — 기본 + 웹 모션 24종(motion-presets.js) */
  const presetGroups = () => [['기본 (픽셀 게임 움직임)', [...Object.keys(PRESETS), ...Object.keys(filterPresets())]], ...(PDM.MOTION_PRESET_GROUPS || [])];
  /** 묶음 메뉴: 묶음 이름(누를 수 없음) 아래에 예시들. pickFn(키) */
  const groupedMenu = pickFn => { const all = allPresets(), out = [];
    presetGroups().forEach(([g, keys], gi) => { if (gi) out.push('-'); out.push({ head: g }); keys.filter(k => all[k]).forEach(k => out.push({ label: all[k].name, hint: all[k].desc || '', run: () => pickFn(k) })); });
    out.push('-', { label: '🎞 예시 둘러보기 (움직이는 미리보기)…', run: () => gallery(pickFn) });
    return out; };

  function make(id, preset) {
    const p = allPresets()[preset] || PRESETS.blank;
    return { id, name: preset && preset !== 'blank' ? p.name : id, lang: p.lang, html: p.html || '', code: p.code || '', w: p.w, h: p.h, frames: p.frames, fps: p.fps, seed: 1,
      pixel: Object.assign({}, PX0, p.pixel || {}), out: `assets/motion/${id}.png` };
  }
  const ops = PDM.listOps({ K, label: '모션', title: '모션 랩', icon: '🎞', prefix: 'motion', make, fields: ['motion'],
    presets: Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [k, v.name])), presetMenu: add => groupedMenu(k => add(k)),
    clean: c => { c.out = `assets/motion/${c.id}.png`; delete c.baked; } });   // 복제본은 제 그림 파일로

  /** 지금 항목의 코드를 예시로 바꿈 (이름 · id · 저장할 곳은 그대로) */
  async function applyPreset(id, k) {
    const p = allPresets()[k], m = list().find(x => x.id === id); if (!p || !m) return;
    if ((m.code || '').trim() && !(await PDM.ui.confirm(`「${m.name || m.id}」 의 코드를 예시 「${p.name}」 로 바꿀까요?\n(크기 · 프레임 · 픽셀 설정도 예시대로 — 실행 취소로 되돌릴 수 있음)`))) return;
    store.edit(K, '예시로 바꾸기: ' + p.name, o => { const x = o.list.find(q => q.id === id); Object.assign(x, { lang: p.lang, html: p.html || '', code: p.code || '', w: p.w, h: p.h, frames: p.frames, fps: p.fps, pixel: Object.assign({}, PX0, p.pixel || {}) }); delete x.baked; const presetNames = Object.values(allPresets()).map(q => q.name); if (!x.name || x.name === x.id || presetNames.includes(x.name)) x.name = p.name; });   // 직접 지은 이름은 그대로
  }
  /** 예시 둘러보기: 모든 예시를 실시간으로 돌려 보여 주고 고르면 pickFn(키) */
  function gallery(pickFn) {
    const all = allPresets();
    const body = h('div', { style: { maxHeight: '70vh', overflow: 'auto', minWidth: 'min(900px, 86vw)' } });
    presetGroups().forEach(([g, keys]) => {
      body.append(h('h3', { style: { margin: '10px 0 6px' } }, g));
      body.append(h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px' } },
        keys.filter(k => all[k]).map(k => { const p = all[k], z = Math.max(1, Math.min(4, Math.floor(140 / Math.max(p.w, p.h * 1.6))));
          return h('div', { class: 'card', style: { padding: '6px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }, title: '눌러서 고르기', onclick: () => { PDM.ui.closeTop(); pickFn(k); } },
            h('div', { style: { height: (p.h * z + 2) + 'px', display: 'flex', alignItems: 'center' } }, livePreview(Object.assign({ seed: 1 }, p), z, '#16131f')),
            h('b', { style: { fontSize: '12px', textAlign: 'center' } }, p.name), p.desc ? h('span', { class: 'hint', style: { fontSize: '11px', textAlign: 'center' } }, p.desc) : null); })));
    });
    PDM.ui.modal('🎞 모션 예시', h('div', {}, h('p', { class: 'hint' }, '실제 코드가 그대로 돌고 있습니다. 눌러서 고르세요. "스크롤 연동" 예시는 게임 그림에 스크롤이 없으므로 시간이 스크롤 대신 진행을 끌고 갑니다.'), body), [['닫기', null]]);
  }

  // ---------------- 굽기 · 저장
  const srcAt = id => list().find(x => x.id === id);
  async function bakeSave(id, onProgress) {
    const m = srcAt(id); if (!m) throw new Error('없는 모션: ' + id);
    const out = m.out || `assets/motion/${id}.png`;
    const r = await M().bake(m, out, onProgress);
    const baked = { fw: r.fw, fh: r.fh, frames: r.frames, fps: r.fps, cols: r.cols, apng: r.apng };
    store.edit(K, '모션 굽기', o => { const x = o.list.find(q => q.id === id); if (x) { x.out = out; x.baked = baked; } }, { silent: true });
    return Object.assign({ out, canvases: r.canvases }, baked);
  }
  /** 첫 장만 따로 (아이템 그림 · 노드 합성기 그림 노드) */
  async function stillOf(id) {
    const m = srcAt(id), r = await M().renderSrc(Object.assign({}, m, { frames: 1 }));
    const rel = String(m.out || `assets/motion/${id}.png`).replace(/\.png$/i, '') + '_still.png';
    await pdm.writeDataURL(store.abs(rel), r.frames[0].toDataURL('image/png')); PDM.assets.invalidate(rel);
    return rel;
  }

  // ---------------- 보내기
  async function ensureBaked(id) { const m = srcAt(id); return m && m.baked ? Object.assign({ out: m.out }, m.baked) : bakeSave(id); }
  /** 보내기 대상: targets() → [[값, 이름]] · apply(모션, 값) */
  const SEND = [
    { id: 'filter', label: '화면 필터에 층으로 (이어짐 — 다시 구우면 따라감)',
      targets: () => [['__new', '＋ 새 화면 필터'], ...((store.get('filters') || {}).list || []).map(f => [f.id, f.name || f.id])],
      async apply(m, fid) {
        const fl = (store.get('filters') || {}).list || [];
        let target = fid;
        if (fid === '__new') { target = m.id; let n = 2; while (fl.some(f => f.id === target)) target = m.id + '_' + n++;
          store.edit('filters', '화면 필터 추가', r => { r.list = r.list || []; r.list.push({ id: target, name: m.name || m.id, overUI: false, inType: 'fade', inSec: 0.5, outType: 'fade', outSec: 0.5, layers: [] }); }); }
        const f = ((store.get('filters') || {}).list || []).find(x => x.id === target), idx = f.layers.length;
        const layer = { type: 'code', on: true, lang: m.lang, code: '', motion: m.id, w: m.w, h: m.h, frames: m.frames, fps: m.fps, fit: 'stretch', png: `assets/filters/${target}_${idx + 1}_code.png`, alpha: 100, blend: 'normal', scale: 1, vx: 0, vy: 0, jitter: 0, fw: 0 };
        const r = await PDM.filters.bake(layer);
        store.edit('filters', '모션 → 필터 층', o => { o.list.find(x => x.id === target).layers.push(Object.assign(layer, { fw: r.fw, frames: r.frames, fps: r.fps })); });
        toast(`화면 필터 「${f.name || target}」 에 층을 넣었습니다`, 'ok');
        if (!(PDM.extensions && PDM.extensions.on('filters'))) toast('화면 필터 확장 기능이 꺼져 있습니다 — 확장 기능에서 켜면 편집할 수 있습니다');
        return target;
      } },
    { id: 'effect', label: '이펙트 알갱이 그림으로 (움직이는 시트)',
      targets: () => { const out = []; ((store.get('effects') || {}).list || []).forEach(e => (e.emitters || []).forEach((em, j) => out.push([e.id + '|' + j, `${e.name || e.id} › 이미터 ${j + 1}`]))); return out; },
      async apply(m, v) {
        const b = await ensureBaked(m.id), [eid, j] = v.split('|');
        store.edit('effects', '모션 → 이펙트 알갱이', o => { const em = o.list.find(x => x.id === eid).emitters[+j]; em.sprite = { png: b.out, fw: b.fw, fh: b.fh, frames: b.frames > 1 ? `0-${b.frames - 1}` : '', fps: b.fps, anim: b.frames > 1 ? 'loop' : 'none' }; });
        if (PDM.effects && PDM.effects.invalidate) PDM.effects.invalidate(b.out);
        toast('이펙트 알갱이 그림으로 넣었습니다', 'ok');
      } },
    { id: 'prop', label: '맵 오브젝트 그림으로 (애니메이션 "motion")',
      targets: () => store.all('prop').map(p => [p.id, `${p.name || p.id} (${p.id})`]),
      async apply(m, pid) {
        const b = await ensureBaked(m.id);
        store.edit('prop:' + pid, '모션 → 오브젝트 그림', o => { o.sprite = Object.assign(o.sprite || {}, { sheet: b.out, frame: [b.fw, b.fh] }); o.sprite.anims = o.sprite.anims || {};
          if (b.frames > 1) { o.sprite.anims.motion = { frames: [...Array(b.frames).keys()], fps: b.fps, loop: true }; if (o.states && o.states[0]) o.states[0].anim = 'motion'; } });
        toast('맵 오브젝트 그림으로 넣었습니다', 'ok');
      } },
    { id: 'compose', label: '노드 합성기에 그림 노드로 (첫 장)',
      targets: () => ((store.get('compose') || {}).list || []).map(g => [g.id, g.name || g.id]),
      async apply(m, gid) {
        const rel = await stillOf(m.id);
        store.edit('compose', '모션 → 그림 노드', o => { const g = o.list.find(x => x.id === gid); const id = 'n' + Math.random().toString(36).slice(2, 7); g.nodes.push({ id, type: 'image', x: 40, y: 40 + (30 * g.nodes.length) % 400, p: { file: rel, fit: 'center' } }); });
        toast('노드 합성기에 그림 노드를 넣었습니다', 'ok');
      } },
    { id: 'item', label: '아이템 그림으로 (첫 장 — 16×16 권장)',
      targets: () => store.all('item').map(i => [i.id, `${i.name || i.id} (${i.id})`]),
      async apply(m, iid) {
        const rel = await stillOf(m.id);
        store.edit('item:' + iid, '모션 → 아이템 그림', o => { o.sprite = { png: rel }; });
        toast('아이템 그림으로 넣었습니다', 'ok');
      } }
  ];
  const lastPt = [240, 240]; document.addEventListener('mousedown', e => { lastPt[0] = e.clientX; lastPt[1] = e.clientY; }, true);   // 하위 메뉴를 누른 자리에
  /** 보내기 메뉴: 대상 종류 → 대상 고르기(하위 메뉴) */
  const sendMenu = m => SEND.map(sd => ({ label: sd.label, run: () => { const t = sd.targets();
    if (!t.length) { toast(sd.label.replace(/\s*\(.*$/, '') + ': 고를 것이 없습니다', 'bad'); return; }
    const x = lastPt[0], y = lastPt[1];
    setTimeout(() => PDM.ui.menu(x, y + 8, t.map(([v, label]) => ({ label, run: async () => { try { await sd.apply(m, v); } catch (er) { toast('보내기 실패: ' + (er.message || er), 'bad'); } } }))), 0); } }));

  // ---------------- 가져오기
  async function fromFilterLayer(f, i) {
    const l = f.layers[i]; if (!l) return null;
    let id = (f.id + '_' + (i + 1)).replace(/[^A-Za-z0-9_]/g, '_'); let n = 2; while (list().some(x => x.id === id)) id = f.id + '_' + (i + 1) + '_' + n++;
    const it = { id, name: `${f.name || f.id} 층 ${i + 1}`, lang: l.lang || 'css', html: '', code: l.code || '', w: num(l.w, 160), h: num(l.h, 96), frames: num(l.frames, 1), fps: num(l.fps, 8), seed: num(l.seed, 1), pixel: Object.assign({}, PX0), out: `assets/motion/${id}.png` };
    store.edit(K, '필터 층 → 모션', r => { r.list = r.list || []; r.list.push(it); });
    toast(`모션 랩 「${it.name}」 으로 옮겼습니다`, 'ok');
    return id;
  }
  async function fromTextfx(tid) {
    const fx = ((store.get('textfx') || {}).list || []).find(x => x.id === tid); if (!fx || !PDM.textfx) return null;
    const b = PDM.textfx.build(fx, ''), fps = Math.max(1, Math.min(60, num(fx.fps, 20)));
    let id = 'txt_' + String(tid).replace(/[^A-Za-z0-9_]/g, '_'); let n = 2; while (list().some(x => x.id === id)) id = 'txt_' + tid + '_' + n++;
    const it = { id, name: `${fx.name || tid} (글자 연출에서)`, lang: 'css', html: b.html, code: b.css, w: b.W, h: b.H, frames: Math.max(1, Math.min(M().MAXF, Math.round(b.total * fps))), fps, seed: 1, pixel: Object.assign({}, PX0), out: `assets/motion/${id}.png` };
    store.edit(K, '글자 연출 → 모션', r => { r.list = r.list || []; r.list.push(it); });
    ops.show(id);
    return id;
  }

  // ---------------- 실시간 미리보기 (CSS 는 그대로 돌리고, JS 는 프레임을 차례로)
  function livePreview(m, zoom, bg) {
    const box = h('div', { class: bg === 'checker' ? 'checker' : '', style: { display: 'inline-block', background: bg === 'checker' ? '' : bg, border: '1px solid var(--line)', borderRadius: '6px', lineHeight: 0 } });
    if (m.lang === 'js') {
      const cv = h('canvas', { width: m.w, height: m.h, style: { width: m.w * zoom + 'px', height: m.h * zoom + 'px', imageRendering: 'pixelated' } }); box.append(cv);
      let fn = null, err = null; try { fn = new Function('g', 'w', 'h', 't', 'frame', 'frames', 'rand', m.code || ''); } catch (e) { err = e; }
      const n = Math.max(1, num(m.frames, 1) | 0), fps = Math.max(1, num(m.fps, 8)), t0 = performance.now();
      const tick = () => { if (!cv.isConnected) return; const f = Math.floor((performance.now() - t0) / 1000 * fps) % n, g = cv.getContext('2d');
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); g.imageSmoothingEnabled = false;
        if (fn) try { g.save(); fn(g, cv.width, cv.height, f / n, f, n, M().rng(num(m.seed, 1) * 9973 + 17)); g.restore(); } catch (e) { err = e; fn = null; }
        if (err) { g.fillStyle = '#f55'; g.font = '8px monospace'; g.fillText('오류', 2, 10); }
        requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      return box;
    }
    const host = h('div'), doc = M().cssDoc(m); box.append(host); M().registerProps(doc.css);
    const root = host.attachShadow({ mode: 'open' }), own = !/class="stage"/.test(doc.html);
    root.innerHTML = `<style>${doc.css}</style>` + (own ? `<div class="pdm-stage" style="position:relative;width:${doc.W}px;height:${doc.H}px;overflow:hidden;zoom:${zoom}">${doc.html}</div>` : `<div style="zoom:${zoom}">${doc.html}</div>`);
    return box;
  }
  /** 구운 결과를 재생하는 캔버스 */
  function playFrames(frames, fps, zoom, bg) {
    const w = frames[0].width, hh = frames[0].height;
    const cv = h('canvas', { width: w, height: hh, class: bg === 'checker' ? 'checker' : '', style: { width: w * zoom + 'px', height: hh * zoom + 'px', imageRendering: 'pixelated', background: bg === 'checker' ? '' : bg, border: '1px solid var(--line)', borderRadius: '6px' } });
    const t0 = performance.now();
    const tick = () => { if (!cv.isConnected && performance.now() - t0 > 500) return; const f = Math.floor((performance.now() - t0) / 1000 * fps) % frames.length, g = cv.getContext('2d'); g.clearRect(0, 0, w, hh); g.drawImage(frames[f], 0, 0); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    return cv;
  }

  PDM.registerEditor({
    id: K, icon: '🎞', title: () => '모션 랩',
    match: k => k === K,
    tree: () => store.isOpen && PDM.extensions && PDM.extensions.on(K) ? [ops.treeNode(58)] : [],
    render(key, ctx) {
      const { F, row, section } = PDM.ui;
      const st = ctx.state = ctx.state || { zoom: 4, bg: 'checker', baked: null };
      const all = list(); ops.take(st);
      if (!all.some(x => x.id === st.id)) st.id = (all[0] || {}).id;
      const idx = all.findIndex(x => x.id === st.id), m = all[idx];
      const intro = h('p', { class: 'hint' }, 'CSS(+HTML) 나 JS(캔버스)로 움직이는 그림을 만들고, 픽셀 아트로 구워 게임 그림(격자 시트 PNG · APNG)으로 씁니다. 화면 필터의 코드 층 · 글자 연출과 같은 굽는 부품을 씁니다. 게임 안에서 코드가 도는 것이 아니라 구운 그림이 정해진 길이로 반복됩니다.');
      const head = h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '8px' } },
        all.map(x => h('button', { class: 'btn sm' + (x.id === st.id ? ' pri' : ''), onclick: () => { st.id = x.id; st.baked = null; ctx.refresh(); } }, x.name || x.id)));
      const importBar = h('div', { class: 'btnbar' },
        PDM.ui.dropBtn('⤓ 가져오기', () => {
          const items = [
            ...((store.get('filters') || {}).list || []).flatMap(f => (f.layers || []).map((l, i) => [l, i]).filter(([l]) => l.type === 'code' && !l.motion && (l.code || '').trim())
              .map(([, i]) => ({ label: `화면 필터 「${f.name || f.id}」 코드 층 ${i + 1}`, run: async () => { const id = await fromFilterLayer(f, i); if (id) { store.edit('filters', '모션 랩 항목', r => { r.list.find(x => x.id === f.id).layers[i].motion = id; }); ops.show(id); } } }))),
            ...((store.get('textfx') || {}).list || []).map(t => ({ label: `글자 연출 「${t.name || t.id}」 (HTML · CSS 그대로)`, run: () => fromTextfx(t.id) }))];
          return items.length ? items : [{ label: '가져올 것이 없습니다 (화면 필터의 코드 층 · 글자 연출)', run: () => { } }];
        }),
        h('span', { class: 'hint' }, '화면 필터의 코드 층(옮긴 층은 이 항목을 쓰게 됨) · 글자 연출(만들어진 HTML · CSS — 직접 다듬기용)'));
      if (!m) return h('div', { class: 'editor' }, h('h2', {}, '🎞 모션 랩'), intro, ops.bar(null), importBar,
        h('div', { class: 'btnbar' }, h('button', { class: 'btn pri', onclick: () => gallery(k => ops.add(k)) }, '🎞 예시 둘러보기 (움직이는 미리보기)…')),
        ...presetGroups().map(([g, keys]) => h('div', {}, h('h3', { style: { margin: '10px 0 4px' } }, g),
          h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, keys.filter(k => allPresets()[k]).map(k => h('button', { class: 'btn', title: allPresets()[k].desc || '', onclick: () => ops.add(k) }, allPresets()[k].name))))));

      const P = (...p) => ['list', idx, ...p];
      const edit = (label, fn, silent) => store.edit(K, label, r => fn(r.list[idx]), silent ? { silent: true } : undefined);
      // ---- 코드 칸
      const ta = (path, rows, ph) => { const t = h('textarea', { rows, class: 'mono', spellcheck: false, placeholder: ph || '', style: { width: '100%', whiteSpace: 'pre', fontSize: '12px', tabSize: 2 } }); t.value = PDM.deepGet(m, path) || '';
        t.addEventListener('change', () => { edit('모션 코드', x => { PDM.deepSet(x, path, t.value); }, true); st.baked = null; refreshLive(); });
        t.addEventListener('keydown', e => { if (e.key === 'Tab') { e.preventDefault(); const s0 = t.selectionStart; t.setRangeText('  ', s0, t.selectionEnd, 'end'); } e.stopPropagation(); });
        return t; };
      const live = h('div');
      const refreshLive = () => { const cur = list()[idx]; live.innerHTML = ''; live.append(livePreview(cur, st.zoom, st.bg)); };
      refreshLive();
      // ---- 구운 결과
      const bakedBox = h('div'), msg = h('div', { class: 'hint' });
      const showBaked = r => { bakedBox.innerHTML = ''; if (!r) return; bakedBox.append(playFrames(r.frames, r.fps, st.zoom, st.bg), h('div', { class: 'hint' }, `결과 ${r.w}×${r.h} · ${r.n}장 · 초당 ${r.fps} · 한 바퀴 ${(r.n / r.fps).toFixed(2)}초`)); };
      const previewBake = async () => { msg.style.color = ''; msg.textContent = '굽는 중…';
        try { const r = await M().renderSrc(list()[idx], p => { msg.textContent = `굽는 중… ${Math.round(p / 0.7 * 100)}%`; }); st.baked = r; showBaked(r); msg.textContent = ''; }
        catch (e) { msg.style.color = 'var(--bad)'; msg.textContent = '오류: ' + (e.message || e); } };
      if (st.baked) showBaked(st.baked); else setTimeout(previewBake, 0);
      const doSave = async () => { msg.style.color = ''; msg.textContent = '굽고 저장하는 중…';
        try { const r = await bakeSave(m.id); st.baked = { frames: r.canvases, w: r.fw, h: r.fh, n: r.frames, fps: r.fps }; showBaked(st.baked); msg.textContent = `저장했습니다: ${r.out}` + (r.frames > 1 ? ` (${r.frames}장 시트 ${r.cols}칸 × ${Math.ceil(r.frames / r.cols)}줄)` : '') + (r.apng ? ` · APNG ${r.apng}` : ''); }
        catch (e) { msg.style.color = 'var(--bad)'; msg.textContent = '오류: ' + (e.message || e); } };
      const opt = (label, k, o2) => F.num(K, P('pixel', k), Object.assign({ label, onchange: () => { st.baked = null; previewBake(); } }, o2));
      const pxl = m.pixel || {};

      return h('div', { class: 'editor' },
        h('h2', {}, '🎞 모션 랩'), intro, ops.bar(m), head,
        h('div', { style: { display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-start' } },
          h('div', { style: { flex: '1 1 460px', minWidth: '320px' } },
            row(F.text(K, P('name'), { label: '이름', rerender: true }), F.select(K, P('lang'), { css: 'CSS + HTML (움직임은 @keyframes)', js: 'JavaScript (캔버스에 프레임마다 그리기)' }, { label: '만드는 방식', rerender: true })),
            h('div', { class: 'btnbar', style: { margin: '0 0 6px' } },
              PDM.ui.dropBtn('📋 예시로 바꾸기', () => groupedMenu(k => applyPreset(m.id, k)), { title: '지금 항목의 코드 · 크기 · 프레임을 예시로 바꿉니다 (이름 · 저장할 곳은 그대로)' }),
              h('button', { class: 'btn sm', onclick: () => gallery(k => applyPreset(m.id, k)) }, '🎞 예시 둘러보기…'),
              h('span', { class: 'hint' }, '등장 · 스크롤 연동 · 고정/전환/내비게이션 24종 + 픽셀 게임 움직임 — 고른 뒤 색 · 글자 · 크기를 고쳐 쓰세요.')),
            m.lang === 'js' ? h('div', {}, h('div', { class: 'fl' }, 'JS — 프레임마다 실행: g(캔버스 2D) · w · h · t(0~1 한 바퀴) · frame · frames · rand()(씨앗 난수: 매 프레임 같은 순서) · Math.random()(프레임마다 다름)'), ta(['code'], 16))
              : h('div', {},
                h('div', { class: 'fl' }, 'HTML — 그림 전체 상자 .fx 안에 들어감 (비워도 됨: .fx 와 ::before/::after 로만 그려도 됨)'), ta(['html'], 3, '<div class="card">…</div>'),
                h('div', { class: 'fl', style: { marginTop: '6px' } }, 'CSS — background · gradient · box-shadow · border · transform · ::before/::after · @keyframes · CSS 변수. 바깥 그림 url() · 웹 글꼴은 못 씀'), ta(['code'], 16)),
            row(F.num(K, P('w'), { label: '그림 가로 (px)', int: true, min: 4, max: 1024, def: 32, onchange: () => { st.baked = null; refreshLive(); previewBake(); } }),
              F.num(K, P('h'), { label: '그림 세로 (px)', int: true, min: 4, max: 1024, def: 32, onchange: () => { st.baked = null; refreshLive(); previewBake(); } }),
              F.num(K, P('frames'), { label: `프레임 수 (1~${M().MAXF})`, int: true, min: 1, max: M().MAXF, def: 8, onchange: () => { st.baked = null; previewBake(); } }),
              F.num(K, P('fps'), { label: '초당 프레임', int: true, min: 1, max: 60, def: 8, onchange: () => { st.baked = null; previewBake(); } }),
              m.lang === 'js' ? F.num(K, P('seed'), { label: '씨앗', int: true, def: 1, onchange: () => { st.baked = null; previewBake(); } }) : null),
            h('p', { class: 'hint' }, `한 바퀴 = 프레임 수 ÷ 초당 프레임 = ${(num(m.frames, 1) / num(m.fps, 8)).toFixed(2)}초 — CSS 애니메이션 길이를 이 값(또는 그 약수)에 맞추면 끊김 없이 반복됩니다. steps(n) 을 쓰면 픽셀 게임다운 끊어지는 움직임이 됩니다.`),
            section('🟪 픽셀 아트로 굽기',
              row(opt('덩어리 크기 (1 = 그대로)', 'px', { int: true, min: 1, max: 16, def: 1 }),
                F.bool(K, P('pixel', 'keep'), { label: '크기는 그대로 (덩어리만 키움)', onchange: () => { st.baked = null; previewBake(); } }),
                opt('투명 경계 자르기 (0 = 안 함, 128 = 반)', 'alphaCut', { int: true, min: 0, max: 255, def: 0 })),
              row(F.select(K, P('pixel', 'palette'), { '': '색 그대로', editor: '편집기 기본 팔레트로', levels: '색마다 단계 수로' }, { label: '색 줄이기', rerender: true, onchange: () => { st.baked = null; } }),
                pxl.palette === 'levels' ? opt('단계 수', 'levels', { int: true, min: 2, max: 32, def: 4 }) : null,
                F.bool(K, P('pixel', 'dither'), { label: '디더링 (점 무늬로 섞기)', onchange: () => { st.baked = null; previewBake(); } }),
                h('div', { class: 'field' }, h('span', { class: 'fl' }, '외곽선 (1칸)'), h('div', { style: { display: 'flex', gap: '4px', alignItems: 'center' } },
                  h('input', { type: 'checkbox', checked: !!pxl.outline, onchange: e => { edit('외곽선', x => { x.pixel = x.pixel || {}; x.pixel.outline = e.target.checked ? (x.pixel.outlineColor || '#231b3b') : ''; }); st.baked = null; } }),
                  h('input', { type: 'color', value: pxl.outline || pxl.outlineColor || '#231b3b', style: { width: '44px', padding: 0 }, onchange: e => { edit('외곽선 색', x => { x.pixel = x.pixel || {}; x.pixel.outlineColor = e.target.value; if (x.pixel.outline) x.pixel.outline = e.target.value; }); st.baked = null; } })))),
              h('p', { class: 'hint' }, 'CSS 는 경계를 부드럽게(반투명) 그려서 픽셀 게임에서 뿌옇게 보이기 쉽습니다 — 큰 크기로 그리고 덩어리 크기로 줄이거나(예: 128×128 + 덩어리 4 → 32×32), 투명 경계를 자르고 색을 줄이면 또렷해집니다.')),
            section('💾 굽기 · 보내기',
              row(F.text(K, P('out'), { label: '저장할 곳 (격자 시트 PNG — 여러 장이면 옆에 …_anim.png APNG)', placeholder: `assets/motion/${m.id}.png` })),
              h('div', { class: 'btnbar' },
                h('button', { class: 'btn pri', onclick: doSave }, '💾 굽고 저장'),
                h('button', { class: 'btn', onclick: async () => { try { const out = await M().exportApng(list()[idx], `${m.id}.png`); if (out) toast('APNG 로 내보냈습니다: ' + out, 'ok'); } catch (e) { toast('내보내기 실패: ' + (e.message || e), 'bad'); } } }, '⤓ APNG 로 내보내기'),
                PDM.ui.dropBtn('➜ 보내기', () => sendMenu(list()[idx])),
                h('button', { class: 'btn sm', onclick: () => ops.showUsage(m.id) }, '이 모션을 쓰는 화면 필터')),
              msg,
              m.baked ? h('p', { class: 'hint' }, `마지막으로 구운 것: ${m.out} · ${m.baked.fw}×${m.baked.fh} · ${m.baked.frames}장 · 초당 ${m.baked.fps}`) : h('p', { class: 'hint' }, '아직 저장하지 않았습니다 — 보내기를 하면 먼저 굽고 저장합니다.'),
              h('p', { class: 'hint' }, '보내기: 화면 필터 층은 이 모션과 이어져 있어 여기서 고친 뒤 필터에서 "다시 굽기"하면 따라옵니다. 이펙트 · 맵 오브젝트는 저장한 시트를 쓰므로 여기서 다시 저장하면 그대로 바뀝니다. 아이템 · 노드 합성기에는 첫 장만 들어갑니다.')),
            importBar),
          h('div', { style: { flex: '0 1 auto', position: 'sticky', top: '0' } },
            h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px' } },
              h('span', { class: 'hint' }, '확대'), (() => { const s = h('select', { onchange: () => { st.zoom = +s.value; refreshLive(); if (st.baked) showBaked(st.baked); } }, [1, 2, 3, 4, 6, 8].map(z => h('option', { value: z, selected: z === st.zoom }, '×' + z))); return s; })(),
              h('span', { class: 'hint' }, '배경'), (() => { const s = h('select', { onchange: () => { st.bg = s.value; refreshLive(); if (st.baked) showBaked(st.baked); } }, [['checker', '체크'], ['#16131f', '어둡게'], ['#3a3346', '중간'], ['#e8e4f0', '밝게']].map(([v, n]) => h('option', { value: v, selected: v === st.bg }, n))); return s; })()),
            h('div', { class: 'fl' }, '실시간 (코드 그대로)'), live,
            h('div', { class: 'fl', style: { marginTop: '10px' } }, '구운 결과 (게임에 들어가는 그림)'), bakedBox,
            h('div', { style: { marginTop: '6px' } }, h('button', { class: 'btn sm', onclick: previewBake }, '↻ 다시 굽기 (미리보기)')))));
    }
  });

  M().lab = { show: id => ops.show(id), fromFilterLayer, fromTextfx, bakeSave, list, ops, PRESETS, SEND, send: (kind, id, target) => SEND.find(x => x.id === kind).apply(srcAt(id), target) };
})();
