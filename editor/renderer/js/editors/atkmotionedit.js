// ================================================================
//  아이템 공격 모션 · 이펙트 타임라인 편집기 (8차) — 탭 키 "atkfx:item:<id>" (프로젝트 아이템) · "atkfx:gameitems:spd:<경로>" (게임 무기)
//    아이템 화면의 "⚔ 공격 모션" 칸에서 엶. 데이터 = 그 아이템의 attackFx (형식 · 규칙 = js/atkmotion.js — 런타임 MakerAtkMotion · MakerSwing 과 같음)
//    위: 미리보기(영웅 + 무기 + 대상 · 방향 · 판정 구간 · 이펙트 자리) + 재생 · 멈춤 · 처음으로 · 한 프레임 앞/뒤 · 빠르기
//    가운데: 타임라인 — 구간 표시(준비 · 타격 · 회복) · 타격/판정 구간 · 속성 트랙 6개(각도 · 거리 · 크기 · 불투명도 · 앞 · 옆) · 이펙트 줄
//            키프레임: 누르면 고름 · 끌면 시각 · 빈 자리 두 번 누르면 추가 · Delete 로 삭제 (끌기는 놓을 때 한 번만 실행 취소에 남음)
//    아래: 고른 것의 속성 · 이펙트 목록 · 검사(그림은 나오는데 판정이 없는 경우 등) · 기본 모션 복제 · 내 모션 저장(프로젝트 설정 atkMotionPresets)
//    1판 데이터(keys)는 그대로 재생 — 트랙을 처음 고칠 때 같은 값의 2판 tracks 로 바꿔 저장 (keys 는 그대로 둠 — 예전 판 PDMaker 도 읽게)
// ================================================================
(function () {
  const { h } = PDM, store = PDM.store;
  const A = () => PDM.atkMotion;
  const PROP_NAMES = { angle: '각도 (°)', dist: '거리 (px)', scale: '크기 (배)', alpha: '불투명도', ox: '앞 (px)', oy: '옆 (px)' };
  const PROP_RANGE = { angle: [-720, 720, 1], dist: [-32, 64, 0.5], scale: [0, 8, 0.05], alpha: [0, 1, 0.05], ox: [-32, 32, 0.5], oy: [-32, 32, 0.5] };
  const EASE_NAMES = { smooth: '부드럽게 (기본)', linear: '일정하게', in: '천천히 시작', out: '천천히 끝', inout: '천천히 시작 · 끝', step: '다음 키까지 그대로', back: '살짝 넘침' };
  const TYPE_NAMES = { effect: '이펙트 (effects.json)', flash: '맞는 번쩍임', shake: '화면 흔들기', sound: '소리', trail: '휘두름 잔상 (이펙트 반복)', shock: '충격파', image: '그림', projectile: '투사체' };
  const ANCHOR_NAMES = { tip: '무기 끝', hero: '영웅', target: '대상 칸' };
  const SEG_NAMES = { windup: '준비', hit: '타격', recovery: '회복' };
  const ROW = 22, HEAD = 92, PAD = 8;
  /** 탭마다 재생 고리 (탭을 다시 열 때 이어 돌림) */
  const LOOPS = new Map();
  const parseKey = key => { const r = key.slice(6); if (r.startsWith('gameitems:')) return { sk: 'gameitems', base: ['items', r.slice(10), 'attackFx'], gk: r.slice(10) }; return { sk: r, base: ['attackFx'] }; };
  const spriteOf = (P) => P.sk === 'gameitems' ? ((((store.get('gameitems') || {}).items || {})[P.gk] || {}).sprite || { sheet: 'builtin:items', name: '' }) : ((store.get(P.sk) || {}).sprite);
  const nameOf = P => P.sk === 'gameitems' ? P.gk.replace(/^spd:/, '게임 ') : ((store.get(P.sk) || {}).name || P.sk);

  PDM.registerEditor({
    id: 'atkmotion', icon: '⚔',
    match: k => k.startsWith('atkfx:'), needsResource: false,
    title: k => '공격 모션 — ' + nameOf(parseKey(k)),
    watch: (ck, tk) => ck === parseKey(tk).sk || ck === 'project',
    tree: () => [],
    onActivate(key) { const pv = LOOPS.get(key); if (pv) pv.wake(); },
    focus(key, ctx) { },
    render(key, ctx) {
      const P = parseKey(key), st = ctx.state = ctx.state || { sel: null, playing: true, sec: 0, speed: 1, dir: 'right', loop: true, q: '' };
      const fx = () => PDM.deepGet(store.get(P.sk), P.base) || null;
      const cur = fx();
      const edit = (label, fn) => store.edit(P.sk, label, r => { let o = PDM.deepGet(r, P.base); if (!o) { o = {}; PDM.deepSet(r, P.base, o); } fn(o, r); });
      /** 트랙을 고치기 전: 1판(keys)이면 같은 값의 2판 tracks 로 */
      const ensureTracks = o => { if (!o.tracks || typeof o.tracks !== 'object') { const T = A().tracksOf(o); o.tracks = {}; for (const p of A().PROPS) if (T[p].length) o.tracks[p] = T[p].map(k => k.slice()); o.v = 2; } return o.tracks; };
      const page = h('div', { class: 'page am-page' });
      const head = h('div', { class: 'am-head' }, h('h1', {}, '⚔ 공격 모션 — ', h('span', {}, nameOf(P))), h('button', { class: 'btn sm', onclick: () => PDM.tabs.open(P.sk === 'gameitems' ? 'gameitems' : P.sk) }, '← 아이템 설정'));
      page.append(head);
      const presets = h('div', { class: 'btnbar' }, h('span', { class: 'hint' }, '기본 모션 복제:'),
        ...Object.entries(PDM.SWING_MOTIONS).map(([k, m]) => h('button', { class: 'btn xs', title: m.desc, onclick: async () => {
          if (cur && cur.on && !(await PDM.ui.confirm(`지금 모션을 「${m.name}」 으로 바꿀까요? (실행 취소로 되돌릴 수 있음)`))) return;
          edit('공격 모션: ' + m.name, o => { Object.assign(o, { on: true, motion: k, keys: PDM.clone(m.keys), hits: m.hits.slice(), dur: m.dur }); delete o.tracks; delete o.v; o.speed = o.speed || 1; o.dist = o.dist || 0; o.scale = o.scale || 1; });
        } }, `${m.icon} ${m.name}`)));
      const user = (store.get('project') || {}).atkMotionPresets || [];
      if (user.length) presets.append(h('span', { class: 'hint' }, ' · 내 모션:'), ...user.map((u, i) => h('button', { class: 'btn xs', onclick: async () => { if (cur && cur.on && !(await PDM.ui.confirm(`지금 모션을 내 모션 「${u.name}」 으로 바꿀까요?`))) return; edit('내 모션: ' + u.name, o => { const keep = { on: true }; Object.keys(o).forEach(k => delete o[k]); Object.assign(o, PDM.clone(u.fx), keep); }); } }, '★ ' + u.name)));
      page.append(presets);
      if (!cur || !cur.on) {
        page.append(h('div', { class: 'card am-empty' }, h('p', {}, '이 아이템은 공격 모션이 꺼져 있어 게임의 원래 공격(무기 그림 없이)으로 보입니다.'), h('p', { class: 'hint' }, '위의 기본 모션을 누르면 켜지고, 그 모션을 복제해 키프레임 · 이펙트를 고칠 수 있습니다.')));
        return page;
      }
      const D = A().durOf(cur), T = A().tracksOf(cur), hits = A().hitsOf(cur), wins = A().windowsOf(cur), evs = A().eventsOf(cur);
      const life = Math.max(D, ...evs.map(e => e.t * D + e.dur));
      const issues = A().validate(cur);
      const dirty = store.dirtyKeys().includes(P.sk);
      head.append(h('div', { class: 'am-status' },
        h('span', { class: 'badge' + (issues.some(i => i.level === 'error') ? ' bad' : issues.length ? ' warn' : ' good'), title: issues.map(i => i.msg).join('\n') }, issues.some(i => i.level === 'error') ? '오류' : issues.length ? `주의 ${issues.length}` : '검사 통과'),
        h('span', { class: 'hint' }, dirty ? '● 저장 안 됨' : '저장됨'),
        h('button', { class: 'btn xs', title: '지금 모션을 이 프로젝트의 "내 모션"으로 저장 (다른 무기에서 고를 수 있음)', onclick: async () => { const n = await PDM.ui.prompt('내 모션 이름', (PDM.SWING_MOTIONS[cur.motion] || {}).name || '내 모션'); if (!n) return; store.edit('project', '내 모션 저장', p => { p.atkMotionPresets = (p.atkMotionPresets || []).filter(x => x.name !== n); const c = PDM.clone(cur); delete c.on; p.atkMotionPresets.push({ name: n, fx: c }); }); } }, '★ 내 모션으로 저장'),
        h('button', { class: 'btn xs danger', onclick: async () => { if (!(await PDM.ui.confirm('공격 모션을 끌까요? (설정은 남고 게임은 원래 공격으로)'))) return; edit('공격 모션 끄기', o => { o.on = false; }); } }, '끄기')));
      // ---------------- 기본 값
      const { F } = PDM.ui, Pb = p => [...P.base, p];
      page.append(h('div', { class: 'am-basic' },
        F.num(P.sk, Pb('dur'), { label: '길이 (초, 0.05~3, 기본 0.3)', min: 0.05, max: 3, step: 0.01, def: 0.3, rerender: true }),
        F.num(P.sk, Pb('speed'), { label: '빠르기 (배, 0.25~4)', min: 0.25, max: 4, step: 0.05, def: 1, rerender: true }),
        F.num(P.sk, Pb('dist'), { label: '영웅과 거리 (+px)', min: -16, max: 32, step: 1, def: 0 }),
        F.num(P.sk, Pb('scale'), { label: '그림 크기 (배)', min: 0.25, max: 4, step: 0.05, def: 1 }),
        F.select(P.sk, Pb('sync'), [['game', '원작 (게임 공격 동작이 끝날 때)'], ['hit', '첫 타격 시각에 맞춤']], { label: '판정 시각', def: 'game', rerender: true }),
        F.bool(P.sk, Pb('behind'), { label: '영웅 뒤에 그림' })));
      page.append(h('p', { class: 'hint am-time' }, `한 번 ${D.toFixed(3)}초 = ${A().frameOf(D)}프레임 (60fps 기준 표시 · 게임은 같은 초 단위 Game.elapsed) · 게임 판정 ${A().judgeSec(cur).toFixed(3)}초 (${(cur.sync || 'game') === 'hit' && hits.length ? '첫 타격' : '영웅 공격 동작 4칸 × 1/15초가 끝날 때'}) · 타격 ${hits.length}번`));
      // ---------------- 미리보기 + 재생 막대
      const pvCv = h('canvas', { class: 'am-pv checker', width: 56 * 4, height: 48 * 4, 'aria-label': '공격 모션 미리보기' });
      const tlCv = h('canvas', { class: 'am-tl', tabindex: '0', 'aria-label': '타임라인 — 키프레임 누르기 · 끌기 · 두 번 누르기(추가) · Delete(삭제) · ←→(한 프레임)' });
      const timeLbl = h('span', { class: 'mono am-tlbl' });
      const pv = st.pv = st.pv || makeLoop(st);
      LOOPS.set(key, pv);
      pv.bind({ st, fxGet: fx, pvCv, tlCv, timeLbl, sprite: () => spriteOf(P), life: () => { const f = fx(); if (!f) return 0.3; const d = A().durOf(f); return Math.max(d, ...A().eventsOf(f).map(e => e.t * d + e.dur)); } });
      ctx.onDispose(() => pv.park());
      const transport = h('div', { class: 'am-transport' },
        h('button', { class: 'btn xs', title: '처음으로', 'aria-label': '처음으로', onclick: () => { st.sec = 0; pv.kick(); } }, '⏮'),
        h('button', { class: 'btn xs', title: '한 프레임 뒤 (1/60초)', 'aria-label': '한 프레임 뒤', onclick: () => { st.playing = false; st.sec = Math.max(0, st.sec - 1 / A().FPS); pv.kick(); ctx.refresh(); } }, '◀|'),
        h('button', { class: 'btn xs pri am-play', 'aria-label': st.playing ? '멈춤' : '재생', onclick: () => { st.playing = !st.playing; pv.kick(); ctx.refresh(); } }, st.playing ? '⏸' : '▶'),
        h('button', { class: 'btn xs', title: '한 프레임 앞 (1/60초)', 'aria-label': '한 프레임 앞', onclick: () => { st.playing = false; st.sec = Math.min(life, st.sec + 1 / A().FPS); pv.kick(); ctx.refresh(); } }, '|▶'),
        h('select', { 'aria-label': '재생 빠르기', onchange: e => { st.speed = +e.target.value; } }, ...[0.1, 0.25, 0.5, 1].map(v => h('option', { value: v, selected: v === st.speed }, v + '×'))),
        h('label', { class: 'check m-0' }, h('input', { type: 'checkbox', checked: st.loop, onchange: e => { st.loop = e.target.checked; } }), h('span', {}, '반복')),
        h('span', { class: 'hint' }, ' 대상 방향'), ...[['left', '←'], ['up', '↑'], ['upright', '↗'], ['right', '→'], ['down', '↓']].map(([d, ic]) => h('button', { class: 'btn xs' + (st.dir === d ? ' pri' : ''), 'aria-label': '대상 방향 ' + d, onclick: () => { if (d === 'left') st.lastLeft = true; else if (d === 'right' || d === 'upright') st.lastLeft = false; st.dir = d; pv.kick(); ctx.refresh(); } }, ic)),
        timeLbl);
      page.append(h('div', { class: 'am-top' }, pvCv, h('div', { class: 'am-legend hint' }, '빨간 칸 = 대상 · 노란 테두리 = 판정 구간 · 흰 번쩍임 = 게임 판정 시각 · 점 = 이펙트 자리 (실제 이펙트 그림은 게임에서)')), transport);
      // ---------------- 타임라인
      page.append(h('div', { class: 'am-tlwrap' }, tlCv));
      timeline(tlCv, st, cur, D, T, hits, wins, evs, { edit, ensureTracks, ctx, pv });
      // ---------------- 고른 것 · 이펙트 · 검사
      const inspector = h('div', { class: 'am-insp' }, inspect(st, cur, D, T, hits, evs, { edit, ensureTracks, ctx, P }));
      const evList = h('div', { class: 'am-evs' },
        h('div', { class: 'am-evs-head' }, h('b', {}, `이펙트 (${evs.length})`), PDM.ui.dropBtn('＋ 이펙트', () => Object.entries(TYPE_NAMES).map(([k, n]) => ({ label: n, run: () => edit('이펙트 추가', o => { o.events = o.events || []; const t = +(Math.min(1, Math.max(0, st.sec / D))).toFixed(3); o.events.push({ id: k + (o.events.length + 1), type: k, t, dur: ['shake', 'image', 'trail'].includes(k) ? 0.2 : 0, anchor: k === 'flash' || k === 'shock' ? 'target' : 'tip', role: k === 'flash' ? 'hit' : '' }); st.sel = { kind: 'ev', i: o.events.length - 1 }; }) })), { cls: 'btn xs' })),
        ...evs.map((e, i) => h('div', { class: 'am-ev' + (st.sel && st.sel.kind === 'ev' && st.sel.i === i ? ' on' : ''), role: 'button', tabindex: '0', 'data-i': i, onclick: ev => { if (ev.target.closest('button')) return; st.sel = { kind: 'ev', i }; ctx.refresh(); }, onkeydown: ev => { if (ev.key === 'Enter') { st.sel = { kind: 'ev', i }; ctx.refresh(); } } },
          h('span', {}, `${TYPE_NAMES[e.type].split(' ')[0]} ${e.id || ''}`), h('span', { class: 'hint' }, ` ${(e.t * D).toFixed(2)}초${e.dur ? ` · ${e.dur}초` : ''} · ${ANCHOR_NAMES[e.anchor]}${e.role === 'hit' ? ' · 맞는 순간' : ''}`),
          h('button', { class: 'ib', title: '복제', 'aria-label': '이펙트 복제', onclick: async () => { if (!(await PDM.ui.confirm('이 이펙트를 복제할까요?'))) return; edit('이펙트 복제', o => { const c = PDM.clone(o.events[i]); c.id = (c.id || 'fx') + '_2'; o.events.splice(i + 1, 0, c); }); } }, '⧉'),
          h('button', { class: 'ib danger', title: '삭제', 'aria-label': '이펙트 삭제', onclick: async () => { if (!(await PDM.ui.confirm('이 이펙트를 삭제할까요?'))) return; edit('이펙트 삭제', o => { o.events.splice(i, 1); st.sel = null; }); } }, '✕'))),
        !evs.length ? h('div', { class: 'hint' }, '이펙트가 없습니다. 아래 예전 칸(휘두름 · 맞는 순간 파티클 · 소리)도 그대로 쓸 수 있습니다.') : null,
        h('details', {}, h('summary', { class: 'hint' }, '예전 칸 (1판 — 휘두르는 동안 · 맞는 순간 파티클 · 소리)'),
          F.select(P.sk, Pb('trail'), PDM.ui.refOptions('effect'), { label: '휘두르는 동안 끝에서', empty: '(없음)' }),
          F.select(P.sk, Pb('hit'), PDM.ui.refOptions('effect'), { label: '맞는 순간 (타격 시각마다)', empty: '(없음)' }),
          F.sound(P.sk, Pb('sound'), { label: '휘두를 때 소리', kind: 'se', empty: '(게임 기본 소리만)' })));
      const checks = h('div', { class: 'am-checks' }, h('b', {}, '검사'), issues.length ? h('ul', {}, ...issues.map(i => h('li', { class: i.level }, (i.level === 'error' ? '⛔ ' : '⚠ ') + i.msg))) : h('div', { class: 'hint' }, '문제 없음'));
      page.append(h('div', { class: 'am-bottom' }, inspector, evList, checks));
      page.append(h('p', { class: 'hint' }, '게임에서 지원하지 않는 것: 프레임마다 다른 그림(무기 그림은 한 장 — 아이템 그림), 이펙트 크기 · 방향은 "그림" 이펙트에만 (effects.json 이펙트는 그 이펙트 설정대로), 타격이 여러 번이어도 게임 판정은 공격 한 번에 한 번.'));
      pv.kick();
      return page;
    }
  });

  // ---------------- 재생 고리: 미리보기 · 타임라인 공용 하나 (화면에 없으면 멈춤 · 다시 그리거나 탭으로 돌아오면 이어 씀)
  function makeLoop(st0) {
    let raf = 0, hideT = 0, last = 0, B = null, parked = false, heroImg = null, itemCv = null, itemKey = '', imgCache = new Map();
    PDM.assets.load('game:sprites/warrior.png').then(i => { heroImg = i; }).catch(() => { });
    const loop = {
      bind(b) { B = b; parked = false; const sp = b.sprite(), k = JSON.stringify(sp || {}); if (k !== itemKey) { itemKey = k; const c = document.createElement('canvas'); PDM.assets.drawItemSprite(c, sp, 1).then(() => { itemCv = c; }).catch(() => { itemCv = null; }); } this.wake(); },
      park() { parked = true; if (hideT) { clearTimeout(hideT); hideT = 0; } },
      wake() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } },
      kick() { draw(); this.wake(); },
      get running() { return !!raf; }
    };
    function tick(now) {
      raf = 0;
      if (!B) return;
      const el = B.pvCv, vis = el && el.isConnected && el.offsetParent !== null;
      if (!vis) {   // 떨어짐(다른 탭 · 닫음 · 다시 그리는 중) = 멈춤 — 다시 그리면 bind, 탭으로 돌아오면 onActivate 가 깨움. 붙어 있지만 숨김 = 0.3초마다 확인
        if (el && el.isConnected && !parked && !hideT) hideT = setTimeout(() => { hideT = 0; loop.wake(); }, 300);
        return;
      }
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const st = B.st, life = B.life();
      if (st.playing) { st.sec += dt * st.speed; if (st.sec > life + 0.35) st.sec = st.loop ? 0 : (st.playing = false, life); }
      draw();
      raf = requestAnimationFrame(tick);
    }
    function img(ref) { if (!ref) return null; if (imgCache.has(ref)) return imgCache.get(ref); imgCache.set(ref, null); PDM.assets.load(ref).then(i => imgCache.set(ref, i || false)).catch(() => imgCache.set(ref, false)); return null; }
    function draw() {
      if (!B) return;
      const fx = B.fxGet(); if (!fx) return;
      const st = B.st, M = A(), D = M.durOf(fx), T = M.tracksOf(fx), sec = Math.max(0, st.sec), tt = sec / D;
      B.timeLbl.textContent = ` ${sec.toFixed(3)}초 · ${M.frameOf(sec)}f / ${D.toFixed(2)}초`;
      // 미리보기 (런타임 MakerSwing.pose 와 같은 계산)
      const S = 4, W = 56, H = 48, cv = B.pvCv, g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
      const evs = M.eventsOf(fx);
      let shx = 0, shy = 0;
      evs.forEach(e => { if (e.type !== 'shake') return; const s = M.eventState(e, D, sec); if (s.phase === 'active') { const k = e.power * (1 - s.u) / 4; shx = (Math.sin(sec * 75) * k); shy = (Math.cos(sec * 61) * k); } });
      g.setTransform(S, 0, 0, S, shx * S, shy * S);
      g.fillStyle = '#2a2440'; for (let y = 0; y < H; y += 16) for (let x = (y / 16) % 2 * 16; x < W; x += 32) g.fillRect(x, y, 16, 16);
      const dir = st.dir || 'right', face = { right: 0, left: 180, up: -90, down: 90, upright: -45 }[dir], mirror = dir === 'left' || (dir === 'up' || dir === 'down') && st.lastLeft;
      const cx = W / 2, cy = H / 2 + 2, fr = face * Math.PI / 180, tx = cx + Math.cos(fr) * 16, ty = cy + Math.sin(fr) * 16;
      const inWin = M.windowsOf(fx).some(w => tt >= w[0] - 1e-6 && tt <= w[1] + 1e-6);
      g.strokeStyle = inWin ? '#ffd166' : '#ff6b6b88'; g.lineWidth = inWin ? 1.5 : 1; g.strokeRect(Math.round(tx - 7) + .5, Math.round(ty - 7) + .5, 14, 14);
      const js = M.judgeSec(fx); if (Math.abs(sec - js) < 0.05) { g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(Math.round(tx - 7), Math.round(ty - 7), 14, 14); }
      const drawHero = () => { if (heroImg) { g.save(); if (mirror) { g.translate(cx, 0); g.scale(-1, 1); g.translate(-cx, 0); } g.drawImage(heroImg, 0, 0, 12, 15, Math.round(cx - 6), Math.round(cy - 8), 12, 15); g.restore(); } else { g.fillStyle = '#dcd5ef'; g.fillRect(cx - 4, cy - 7, 8, 14); } };
      let tip = [cx, cy];
      const drawItem = () => {
        if (tt > 1) return;
        const s = M.sample(fx, Math.min(1, tt), T), th = (face + (mirror ? -s.angle : s.angle)) * Math.PI / 180;
        const d = s.dist + (+fx.dist || 0), sc = s.scale * (fx.scale == null ? 1 : +fx.scale), side = mirror ? -s.oy : s.oy;
        const px = cx + Math.cos(th) * d + Math.cos(fr) * s.ox - Math.sin(fr) * side, py = cy + Math.sin(th) * d + Math.sin(fr) * s.ox + Math.cos(fr) * side;
        const iw = itemCv ? itemCv.width : 16, ih = itemCv ? itemCv.height : 16, r = th + (mirror ? 3 : 1) * Math.PI / 4;
        g.save(); g.globalAlpha = Math.max(0, Math.min(1, s.alpha)); g.translate(px, py); g.rotate(r); g.scale(mirror ? -sc : sc, sc);
        if (itemCv) g.drawImage(itemCv, 0, -ih); else { g.fillStyle = '#ccc'; g.fillRect(0, -2, 14, 2); }
        g.restore();
        const vx = (mirror ? -iw : iw) * sc, vy = -ih * sc; tip = [px + vx * Math.cos(r) - vy * Math.sin(r), py + vx * Math.sin(r) + vy * Math.cos(r)];
      };
      if (fx.behind) { drawItem(); drawHero(); } else { drawHero(); drawItem(); }
      const at = e => e.anchor === 'hero' ? [cx, cy] : e.anchor === 'target' ? [tx, ty] : tip;
      evs.forEach(e => {
        const s = M.eventState(e, D, sec); if (s.phase === 'before' || s.phase === 'after') return;
        if (s.phase === 'fire' && sec - e.t * D > 0.12) return;
        const [ax, ay] = at(e);
        g.save();
        if (e.type === 'image') { const im = img(e.ref); if (im) { g.globalAlpha = Math.max(0, Math.min(1, s.alpha)); g.translate(ax, ay); g.rotate((face + (mirror ? -e.dir : e.dir)) * Math.PI / 180); g.scale(s.size, s.size); g.drawImage(im, -im.width / 2, -im.height / 2); } }
        else if (e.type === 'flash') { g.fillStyle = 'rgba(255,255,255,.8)'; g.fillRect(Math.round(ax - 7), Math.round(ay - 7), 14, 14); }
        else if (e.type === 'shock') { g.strokeStyle = 'rgba(180,220,255,.9)'; g.beginPath(); g.arc(ax, ay, 2 + 14 * (s.phase === 'fire' ? (sec - e.t * D) / 0.12 : s.u) * Math.max(0.5, e.size), 0, 7); g.stroke(); }
        else if (e.type === 'projectile') { const u = Math.min(1, (sec - e.t * D) / 0.12); g.fillStyle = '#9fd3ff'; g.fillRect(cx + (tx - cx) * u - 1, cy + (ty - cy) * u - 1, 2, 2); }
        else if (e.type === 'sound') { g.fillStyle = '#ffe27a'; g.font = '6px sans-serif'; g.fillText('♪', ax + 2, ay - 3); }
        else { g.fillStyle = e.type === 'trail' ? 'rgba(255,226,122,.9)' : '#ffffff'; g.beginPath(); g.arc(ax, ay, e.type === 'trail' ? 1 : 2, 0, 7); g.fill(); }
        g.restore();
      });
      // 타임라인 재생선
      if (B.tlCv && B.tlCv._redraw) B.tlCv._redraw(sec);
    }
    return loop;
  }

  // ---------------- 타임라인 그리기 · 조작
  function timeline(cv, st, fx, D, T, hits, wins, evs, o) {
    const M = A(), rows = ['seg', 'hit', ...M.PROPS, 'ev'];
    const width = () => Math.max(320, (cv.parentNode && cv.parentNode.clientWidth) || 800);
    let drag = null;
    const X = t => HEAD + PAD + t * (cv.width - HEAD - PAD * 2), TT = x => Math.max(0, Math.min(1, (x - HEAD - PAD) / (cv.width - HEAD - PAD * 2)));
    const rowY = r => 18 + rows.indexOf(r) * ROW;
    const items = () => {   // 누를 수 있는 것들
      const out = [];
      for (const p of M.PROPS) T[p].forEach((k, i) => out.push({ kind: 'key', p, i, t: k[0], y: rowY(p) + ROW / 2 }));
      hits.forEach((t, i) => out.push({ kind: 'hit', i, t, y: rowY('hit') + ROW / 2 }));
      evs.forEach((e, i) => out.push({ kind: 'ev', i, t: e.t, y: rowY('ev') + ROW / 2 }));
      for (const [k, t] of Object.entries((fx.segments && typeof fx.segments === 'object') ? fx.segments : {})) if (typeof t === 'number') out.push({ kind: 'seg', k, t, y: rowY('seg') + ROW / 2 });
      if (drag && drag.it) { const d = out.find(x => x.kind === drag.it.kind && x.i === drag.it.i && x.p === drag.it.p && x.k === drag.it.k); if (d) d.t = drag.t; }   // 끄는 중인 것은 끄는 자리에
      return out;
    };
    const redraw = sec => {
      const w = width(); if (cv.width !== w) cv.width = w; cv.height = 18 + rows.length * ROW + 4;
      const g = cv.getContext('2d'), css = n => PDM.cssVar ? PDM.cssVar(n, '#888') : '#888';
      g.clearRect(0, 0, cv.width, cv.height); g.font = '11px sans-serif'; g.textBaseline = 'middle';
      // 눈금: 초 · 프레임
      g.fillStyle = css('--dim'); const steps = 10;
      for (let i = 0; i <= steps; i++) { const t = i / steps, x = X(t); g.fillRect(x, 12, 1, cv.height - 12); g.fillText(`${(t * D).toFixed(2)}s`, x + 2, 6); }
      rows.forEach((r, i) => {
        const y = rowY(r);
        g.fillStyle = i % 2 ? 'rgba(127,127,127,.06)' : 'rgba(127,127,127,.12)'; g.fillRect(0, y, cv.width, ROW);
        g.fillStyle = css('--fg'); g.fillText(r === 'seg' ? '구간' : r === 'hit' ? '타격 · 판정' : r === 'ev' ? '이펙트' : PROP_NAMES[r], 6, y + ROW / 2);
      });
      // 구간 (준비 · 타격 · 회복)
      const seg = fx.segments && typeof fx.segments === 'object' ? fx.segments : {};
      const segs = Object.entries(seg).filter(([, t]) => typeof t === 'number').sort((a, b) => a[1] - b[1]);
      segs.forEach(([k, t], i) => { const x0 = X(t), x1 = X(i + 1 < segs.length ? segs[i + 1][1] : 1); g.fillStyle = k === 'hit' ? 'rgba(255,107,107,.25)' : k === 'windup' ? 'rgba(255,209,102,.25)' : 'rgba(110,198,255,.25)'; g.fillRect(x0, rowY('seg') + 3, x1 - x0, ROW - 6); g.fillStyle = css('--fg'); g.fillText(SEG_NAMES[k] || k, x0 + 3, rowY('seg') + ROW / 2); });
      // 판정 구간 · 타격
      wins.forEach(w => { g.fillStyle = 'rgba(255,209,102,.35)'; g.fillRect(X(w[0]) - 1, rowY('hit') + 3, Math.max(2, X(w[1]) - X(w[0]) + 2), ROW - 6); });
      const js = M.judgeSec(fx) / D; g.fillStyle = '#ffffff'; g.fillRect(X(Math.min(1.05, js)) - 1, rowY('hit'), 2, ROW);
      // 키프레임 · 타격 · 이펙트
      const sel = st.sel;
      items().forEach(it => {
        const x = X(it.t), y = it.y, on = sel && sel.kind === it.kind && sel.i === it.i && (it.kind !== 'key' || sel.p === it.p) && (it.kind !== 'seg' || sel.k === it.k);
        g.fillStyle = on ? css('--accent') : it.kind === 'hit' ? '#ff6b6b' : it.kind === 'ev' ? '#c084fc' : it.kind === 'seg' ? '#ffd166' : css('--fg');
        g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 6, y); g.lineTo(x, y + 6); g.lineTo(x - 6, y); g.closePath(); g.fill();
        if (on) { g.strokeStyle = css('--fg'); g.lineWidth = 1; g.stroke(); }
      });
      evs.forEach(e => { if (e.dur > 0) { g.fillStyle = 'rgba(192,132,252,.35)'; g.fillRect(X(e.t), rowY('ev') + 8, Math.max(1, X(Math.min(1, e.t + e.dur / D)) - X(e.t)), ROW - 16); } });
      // 재생선
      const ps = Math.min(1, Math.max(0, (sec || 0) / D)); g.fillStyle = css('--accent'); g.fillRect(X(ps) - 1, 12, 2, cv.height - 12);
    };
    cv._redraw = redraw;
    redraw(st.sec);
    const hitTest = (x, y) => { let best = null, bd = 9; items().forEach(it => { const d = Math.hypot(X(it.t) - x, it.y - y); if (d < bd) { bd = d; best = it; } }); return best; };
    const local = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
    cv.addEventListener('pointerdown', e => {
      const [x, y] = local(e), it = hitTest(x, y);
      cv.focus();
      if (it) { st.sel = { kind: it.kind, i: it.i, p: it.p, k: it.k }; drag = { it, t0: it.t, t: it.t }; cv.setPointerCapture(e.pointerId); redraw(st.sec); return; }
      if (y < 18) { st.playing = false; st.sec = TT(x) * D; drag = { scrub: true }; cv.setPointerCapture(e.pointerId); o.pv.kick(); }
    });
    cv.addEventListener('pointermove', e => {
      if (!drag) return; const [x] = local(e);
      if (drag.scrub) { st.sec = TT(x) * D; o.pv.kick(); return; }
      drag.t = +TT(x).toFixed(3); redraw(st.sec);   // 놓을 때 한 번 저장 (실행 취소 한 번)
    });
    cv.addEventListener('pointerup', () => {
      const d = drag; drag = null;
      if (!d || d.scrub) return;   // 빈 자리 · 재생선: 다시 그리지 않음 (두 번 누르기가 같은 캔버스에 오게)
      if (Math.abs(d.t - d.t0) < 1e-4) { o.ctx.refresh(); return; }   // 고르기만 함 → 속성 칸 다시
      const it = d.it, t = d.t;
      o.edit('타임라인에서 옮기기', f => {
        if (it.kind === 'key') { const tr = o.ensureTracks(f)[it.p]; const k = M.normTrack(tr)[it.i]; const j = tr.findIndex(x => Array.isArray(x) && x[0] === k[0] && x[1] === k[1]); if (j >= 0) tr[j][0] = t; tr.sort((a, b) => a[0] - b[0]); st.sel = { kind: 'key', p: it.p, i: M.normTrack(tr).findIndex(x => x[0] === t) }; }
        else if (it.kind === 'hit') { const hs = M.hitsOf(f); hs[it.i] = t; f.hits = hs.sort((a, b) => a - b); }
        else if (it.kind === 'ev') f.events[it.i].t = t;
        else if (it.kind === 'seg') { f.segments = f.segments || {}; f.segments[it.k] = t; }
      });
    });
    cv.addEventListener('dblclick', e => {
      const [x, y] = local(e), t = +TT(x).toFixed(3), row = rows[Math.floor((y - 18) / ROW)];
      if (!row || hitTest(x, y)) return;
      if (M.PROPS.includes(row)) o.edit('키프레임 추가', f => { const tr = o.ensureTracks(f); const v = +M.sample(f, t)[row].toFixed(3); tr[row] = (tr[row] || []).concat([[t, v, 'smooth']]).sort((a, b) => a[0] - b[0]); st.sel = { kind: 'key', p: row, i: M.normTrack(tr[row]).findIndex(k => k[0] === t) }; });
      else if (row === 'hit') o.edit('타격 추가', f => { f.hits = M.hitsOf(f).concat([t]).sort((a, b) => a - b); st.sel = { kind: 'hit', i: f.hits.indexOf(t) }; });
      else if (row === 'seg') o.edit('구간 표시 추가', f => { f.segments = f.segments || {}; const k = ['windup', 'hit', 'recovery'].find(k => typeof f.segments[k] !== 'number') || 'hit'; f.segments[k] = t; st.sel = { kind: 'seg', k }; });
    });
    cv.addEventListener('keydown', e => {
      const sel = st.sel;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); st.playing = false; st.sec = Math.max(0, st.sec + (e.key === 'ArrowLeft' ? -1 : 1) / M.FPS); o.pv.kick(); return; }
      if (e.key === ' ') { e.preventDefault(); st.playing = !st.playing; o.pv.kick(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
        e.preventDefault(); e.stopPropagation();
        if (sel.kind === 'key') o.edit('키프레임 삭제', f => { const tr = o.ensureTracks(f)[sel.p]; const k = M.normTrack(tr)[sel.i]; const j = tr.findIndex(x => Array.isArray(x) && x[0] === k[0] && x[1] === k[1]); if (j >= 0) tr.splice(j, 1); st.sel = null; });
        else if (sel.kind === 'hit') o.edit('타격 삭제', f => { const hs = M.hitsOf(f); hs.splice(sel.i, 1); f.hits = hs; st.sel = null; });
        else if (sel.kind === 'seg') o.edit('구간 표시 삭제', f => { if (f.segments) delete f.segments[sel.k]; st.sel = null; });
        else if (sel.kind === 'ev') PDM.ui.confirm('이 이펙트를 삭제할까요?').then(ok => { if (ok) o.edit('이펙트 삭제', f => { f.events.splice(sel.i, 1); st.sel = null; }); });
      }
    });
  }

  // ---------------- 고른 것의 속성
  function inspect(st, fx, D, T, hits, evs, o) {
    const M = A(), sel = st.sel, n = (label, v, min, max, step, on, unit) => h('label', { class: 'am-f' }, h('span', { class: 'fl' }, label), h('input', { type: 'number', value: v, min, max, step, 'aria-label': label, onchange: e => { const x = parseFloat(e.target.value); if (Number.isFinite(x)) on(Math.min(max, Math.max(min, x))); } }), unit ? h('span', { class: 'hint' }, unit) : null);
    const sel2 = (label, v, opts, on) => h('label', { class: 'am-f' }, h('span', { class: 'fl' }, label), h('select', { 'aria-label': label, onchange: e => on(e.target.value) }, ...Object.entries(opts).map(([k, t]) => h('option', { value: k, selected: k === v }, t))));
    const head = h('b', {}, '고른 것');
    if (!sel) return [head, h('div', { class: 'hint' }, '타임라인에서 키프레임 · 타격 · 이펙트 · 구간을 누르세요. 빈 자리를 두 번 누르면 추가 · Delete 로 삭제 · ←→ 한 프레임 · Space 재생/멈춤.')];
    const secOf = t => `${(t * D).toFixed(3)}초 · ${M.frameOf(t * D)}f`;
    if (sel.kind === 'key') {
      const k = (T[sel.p] || [])[sel.i]; if (!k) return [head];
      const set = (label, fn) => o.edit(label, f => { const tr = o.ensureTracks(f)[sel.p]; const kk = M.normTrack(tr)[sel.i]; const j = tr.findIndex(x => Array.isArray(x) && x[0] === kk[0] && x[1] === kk[1]); if (j >= 0) fn(tr[j]); tr.sort((a, b) => a[0] - b[0]); });
      const [lo, hi, stp] = PROP_RANGE[sel.p];
      return [head, h('div', { class: 'hint' }, `${PROP_NAMES[sel.p]} 키프레임 — ${secOf(k[0])}`),
        n('시각 (0~1)', k[0], 0, 1, 0.01, v => set('키프레임 시각', x => { x[0] = v; }), secOf(k[0])),
        n('값', k[1], lo, hi, stp, v => set('키프레임 값', x => { x[1] = v; }), `${lo}~${hi}`),
        sel2('이징 (다음 키까지)', k[2], EASE_NAMES, v => set('키프레임 이징', x => { x[2] = v; }))];
    }
    if (sel.kind === 'hit') { const t = hits[sel.i]; if (t == null) return [head]; return [head, h('div', { class: 'hint' }, `타격 ${sel.i + 1} — ${secOf(t)}`), n('시각 (0~1)', t, 0, 1, 0.01, v => o.edit('타격 시각', f => { const hs = M.hitsOf(f); hs[sel.i] = v; f.hits = hs.sort((a, b) => a - b); }), secOf(t)),
      h('div', { class: 'hint' }, sel.i === 0 ? ((fx.sync || 'game') === 'hit' ? '첫 타격 = 게임 판정 시각 (판정 맞추기)' : '판정 시각을 "첫 타격 시각에 맞춤"으로 하면 게임 피해가 이 시각에') : '두 번째부터는 그림 · 이펙트만 (게임 판정은 공격 한 번에 한 번)')]; }
    if (sel.kind === 'seg') { const t = (fx.segments || {})[sel.k]; return [head, sel2('구간', sel.k, SEG_NAMES, v => o.edit('구간 종류', f => { const tt = f.segments[sel.k]; delete f.segments[sel.k]; f.segments[v] = tt; st.sel = { kind: 'seg', k: v }; })), n('시작 (0~1)', t, 0, 1, 0.01, v => o.edit('구간 시작', f => { f.segments[sel.k] = v; }), secOf(t || 0))]; }
    if (sel.kind === 'ev') {
      const e = evs[sel.i]; if (!e) return [head];
      const raw = (fx.events || [])[sel.i] || {};
      const set = (label, k, v) => o.edit(label, f => { f.events[sel.i][k] = v; });
      const refField = e.type === 'effect' || e.type === 'trail' ? sel2('이펙트', raw.ref || '', Object.fromEntries([['', '(고르세요)'], ...PDM.ui.refOptions('effect')]), v => set('이펙트', 'ref', v))
        : e.type === 'sound' ? h('label', { class: 'am-f' }, h('span', { class: 'fl' }, '소리 (sfx: · assets/…)'), h('input', { type: 'text', value: raw.ref || '', onchange: ev => set('소리', 'ref', ev.target.value.trim()) }))
        : e.type === 'image' ? h('label', { class: 'am-f' }, h('span', { class: 'fl' }, '그림 (assets/… · game:…)'), h('input', { type: 'text', value: raw.ref || '', onchange: ev => set('그림', 'ref', ev.target.value.trim()) }), h('button', { class: 'btn xs', onclick: async () => { const f = await PDM.ui.pickImage('effects'); if (f) set('그림', 'ref', f); } }, '찾기…')) : null;
      return [head, h('div', { class: 'hint' }, `${TYPE_NAMES[e.type]} — ${secOf(e.t)}`),
        h('label', { class: 'am-f' }, h('span', { class: 'fl' }, '이름'), h('input', { type: 'text', value: raw.id || '', onchange: ev => set('이펙트 이름', 'id', ev.target.value.trim()) })),
        sel2('종류', e.type, TYPE_NAMES, v => set('이펙트 종류', 'type', v)), refField,
        n('시작 (0~1)', e.t, 0, 1, 0.01, v => set('이펙트 시작', 't', v), secOf(e.t)), n('길이 (초, 0 = 한 번)', e.dur, 0, 10, 0.01, v => set('이펙트 길이', 'dur', v), M.frameOf(e.dur) + 'f'),
        sel2('기준점', e.anchor, ANCHOR_NAMES, v => set('기준점', 'anchor', v)), sel2('이징', e.ease, EASE_NAMES, v => set('이펙트 이징', 'ease', v)),
        e.type === 'image' ? n('방향 (°)', e.dir, -360, 360, 1, v => set('방향', 'dir', v)) : null, e.type === 'image' || e.type === 'shock' ? n('크기 (배)', e.size, 0, 20, 0.1, v => set('크기', 'size', v)) : null,
        e.type === 'image' ? n('불투명도', e.alpha, 0, 1, 0.05, v => set('불투명도', 'alpha', v)) : null, e.type === 'image' ? n('커지기 (끝 크기 배수 − 1)', e.grow, -1, 10, 0.1, v => set('커지기', 'grow', v)) : null,
        e.type === 'trail' ? n('간격 (초)', e.every, 0.01, 1, 0.01, v => set('잔상 간격', 'every', v)) : null, e.type === 'shake' ? n('세기 (px)', e.power, 0, 64, 0.5, v => set('흔들기 세기', 'power', v)) : null,
        h('label', { class: 'check m-0' }, h('input', { type: 'checkbox', checked: e.role === 'hit', onchange: ev => set('맞는 순간', 'role', ev.target.checked ? 'hit' : '') }), h('span', {}, '맞는 순간 이펙트 (판정 구간 밖이면 검사에서 알림)'))];
    }
    return [head];
  }

  /** 아이템 화면에서 쓰는 여는 버튼 */
  PDM.atkMotionOpen = (storeKey, gameKey) => h('button', { class: 'btn sm pri', onclick: () => PDM.tabs.open('atkfx:' + (storeKey === 'gameitems' ? 'gameitems:' + gameKey : storeKey)) }, '⏱ 모션 · 이펙트 타임라인 편집기…');
})();
