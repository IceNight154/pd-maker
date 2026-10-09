// ================================================================
//  무기 공격 모션 — 영웅이 공격할 때 그 무기의 아이템 그림이 영웅 가운데에서 휘둘러짐 (런타임 MakerSwing)
//    아이템 그림의 왼쪽 아래 = 손잡이(돌아가는 중심), 오른쪽 위 = 날 · 끝
//    데이터 (프로젝트 아이템 items/<id>.json · 게임 무기 gameitems.json items["spd:weapon.melee.X"]):
//      attackFx { on, motion, keys: [[t(0~1), 각도(°, 바라보는 쪽 기준 · + = 시계 방향), 거리(px), 크기, 불투명도]], hits: [t …], dur(초),
//                 dist(+px), speed(배), scale(배), behind(영웅 뒤에 그림), trail(이펙트 id), trailEvery(초), hit(이펙트 id), hitAt(tip | target), sound }
//    모션을 고르면 그 keys · hits · dur 를 데이터에 복사 → 런타임은 keys 만 재생 (예시를 고친 직접 모션도 가능)
//    왼쪽을 볼 때는 각도를 좌우로 뒤집음 (위에서 내려베기는 왼쪽에서도 위에서)
// ================================================================
(function () {
  const { h, store } = PDM;
  const num = (v, d) => (isFinite(+v) && v !== '' && v !== null && v !== undefined ? +v : d);
  // 연타: 찌르기 4번 (각도를 조금씩 다르게)
  const flurry = (() => { const k = [], offs = [-18, 14, -6, 22], n = offs.length;
    offs.forEach((a, i) => { const t0 = i / n, s = 1 / n; k.push([t0, a, -2, 1, 1], [t0 + s * 0.45, a, 11, 1, 1], [t0 + s * 0.9, a, 2, 1, 1]); });
    k.push([1, 0, 2, 1, 0]); return { keys: k, hits: offs.map((_, i) => (i + 0.45) / n) }; })();
  PDM.SWING_MOTIONS = {
    slash:  { name: '베기',          icon: '↘', desc: '위에서 앞으로 비스듬히 베어 내림', dur: 0.32, hits: [0.5],  keys: [[0, -100, 3, 1, 1], [0.15, -92, 4, 1, 1], [0.55, 70, 6, 1, 1], [0.8, 80, 5, 1, 1], [1, 80, 4, 1, 0]] },
    thrust: { name: '찌르기',        icon: '→', desc: '뒤로 당겼다가 앞으로 쭉 찌름', dur: 0.28, hits: [0.5],  keys: [[0, 0, -2, 1, 1], [0.25, 0, -4, 1, 1], [0.5, 0, 12, 1, 1], [0.75, 0, 8, 1, 1], [1, 0, 4, 1, 0]] },
    chop:   { name: '찍기',          icon: '⤓', desc: '머리 위로 들었다가 내리찍음', dur: 0.36, hits: [0.6],  keys: [[0, -150, 2, 1, 1], [0.35, -160, 3, 1, 1], [0.6, 40, 8, 1, 1], [0.85, 45, 8, 1, 1], [1, 45, 7, 1, 0]] },
    swing:  { name: '휘두르기',      icon: '↻', desc: '뒤에서 앞으로 크게 휘두름', dur: 0.45, hits: [0.45], keys: [[0, -150, 4, 1, 1], [0.6, 150, 7, 1, 1], [1, 170, 6, 1, 0]] },
    strike: { name: '치기',          icon: '✊', desc: '짧게 당겨 툭 침', dur: 0.25, hits: [0.6],  keys: [[0, -40, 2, 1, 1], [0.4, -50, 1, 1, 1], [0.6, 10, 7, 1, 1], [1, 15, 5, 1, 0]] },
    upper:  { name: '올려치기 · 받아치기', icon: '↗', desc: '아래에서 위로 쳐 올림', dur: 0.3, hits: [0.5],  keys: [[0, 80, 4, 1, 1], [0.2, 90, 3, 1, 1], [0.55, -80, 7, 1, 1], [1, -90, 6, 1, 0]] },
    shove:  { name: '밀치기',        icon: '⇥', desc: '무기를 세워 앞으로 밀어냄', dur: 0.4, hits: [0.6],  keys: [[0, -30, 0, 1, 1], [0.3, -30, -3, 1, 1], [0.6, -20, 10, 1.1, 1], [1, -20, 6, 1, 0]] },
    spin:   { name: '회전 베기',     icon: '⟳', desc: '한 바퀴 돌며 둘레를 벰', dur: 0.5, hits: [0.25, 0.5, 0.75], keys: [[0, 0, 6, 1, 1], [0.9, 360, 7, 1, 1], [1, 380, 6, 1, 0]] },
    sweep:  { name: '휩쓸기',        icon: '〰', desc: '낮게 앞을 쓸어 넘김', dur: 0.4, hits: [0.5],  keys: [[0, 110, 7, 0.95, 1], [0.6, -60, 10, 0.95, 1], [1, -70, 9, 0.95, 0]] },
    flurry: { name: '연타 · 난무',   icon: '⁂', desc: '빠르게 여러 번 찌름', dur: 0.6, hits: flurry.hits, keys: flurry.keys }
  };
  /** t(0~1) 에서의 [각도, 거리, 크기, 불투명도] — 구간마다 부드럽게 (런타임 MakerSwing.sample 과 같은 계산) */
  function sample(keys, t) {
    if (!keys || !keys.length) return [0, 0, 1, 1];
    if (t <= keys[0][0]) return keys[0].slice(1);
    for (let i = 1; i < keys.length; i++) {
      const a = keys[i - 1], b = keys[i];
      if (t <= b[0]) { let u = (t - a[0]) / Math.max(1e-6, b[0] - a[0]); u = u * u * (3 - 2 * u); return [1, 2, 3, 4].map(j => a[j] + (b[j] - a[j]) * u); }
    }
    return keys[keys.length - 1].slice(1);
  }
  PDM.swingSample = sample;

  /** 미리보기: 영웅(게임 전사 그림) 가운데에서 무기 그림이 휘둘러짐 — 런타임과 같은 계산 */
  function preview(getCfg, getSprite, st) {
    const S = 4, W = 56, H = 48;
    const cv = h('canvas', { width: W * S, height: H * S, class: 'checker', style: { imageRendering: 'pixelated', border: '1px solid var(--line)', borderRadius: '6px', background: '#16131f' } });
    let itemImg = null, heroImg = null, t0 = performance.now(), trails = [];
    PDM.assets.load('game:sprites/warrior.png').then(i => { heroImg = i; }).catch(() => { });
    const sp = getSprite();
    const itemCv = document.createElement('canvas');
    PDM.assets.drawItemSprite(itemCv, sp, 1).then(() => { itemImg = itemCv; }).catch(() => { });
    const tick = () => {
      if (!cv.isConnected && performance.now() - t0 > 1000) return;
      const c = getCfg() || {}, g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
      g.setTransform(S, 0, 0, S, 0, 0);
      // 바닥 칸
      g.fillStyle = '#2a2440'; for (let y = 0; y < H; y += 16) for (let x = (y / 16) % 2 * 16; x < W; x += 32) g.fillRect(x, y, 16, 16);
      const dur = Math.max(0.05, num(c.dur, 0.3) / Math.max(0.1, num(c.speed, 1))), cycle = dur + 0.45;
      const now = (performance.now() - t0) / 1000, tt = (now % cycle) / dur;
      const dir = st.dir || 'right', face = { right: 0, left: 180, up: -90, down: 90, upright: -45 }[dir], mirror = dir === 'left' || (dir === 'up' || dir === 'down') && st.lastLeft;
      const cx = W / 2, cy = H / 2 + 2;
      // 대상 표시
      const fr = face * Math.PI / 180; g.strokeStyle = '#ff6b6b88'; g.strokeRect(Math.round(cx + Math.cos(fr) * 16 - 7) + .5, Math.round(cy + Math.sin(fr) * 16 - 7) + .5, 14, 14);
      const drawHero = () => { if (heroImg) { g.save(); if (mirror) { g.translate(cx, 0); g.scale(-1, 1); g.translate(-cx, 0); } g.drawImage(heroImg, 0, 0, 12, 15, Math.round(cx - 6), Math.round(cy - 8), 12, 15); g.restore(); } else { g.fillStyle = '#dcd5ef'; g.fillRect(cx - 4, cy - 7, 8, 14); } };
      let tip = null;
      const drawItem = () => {
        if (tt > 1) return;
        const [ang, d0, sc0, al] = sample(c.keys, tt), th = (face + (mirror ? -ang : ang)) * Math.PI / 180;
        const dist = d0 + num(c.dist, 0), sc = sc0 * num(c.scale, 1);
        const px = cx + Math.cos(th) * dist, py = cy + Math.sin(th) * dist;
        const iw = itemImg ? itemImg.width : 16, ih = itemImg ? itemImg.height : 16;
        // 손잡이(왼쪽 아래)가 중심 · 날(오른쪽 위, 그림의 -45°)이 th 를 가리킴. 뒤집으면 그림도 좌우로 (날은 -135°)
        const r = th + (mirror ? 3 : 1) * Math.PI / 4;
        g.save(); g.globalAlpha = Math.max(0, Math.min(1, al)); g.translate(px, py); g.rotate(r); g.scale(mirror ? -sc : sc, sc);
        if (itemImg) g.drawImage(itemImg, 0, -ih); else { g.fillStyle = '#ccc'; g.fillRect(0, -2, 14, 2); }
        g.restore();
        const vx = (mirror ? -iw : iw) * sc, vy = -ih * sc;
        tip = [px + vx * Math.cos(r) - vy * Math.sin(r), py + vx * Math.sin(r) + vy * Math.cos(r)];
      };
      if (c.behind) { drawItem(); drawHero(); } else { drawHero(); drawItem(); }
      // 잔상 · 맞는 순간 표시 (이펙트 자체는 게임에서 — 여기선 자리만)
      if (tip && c.trail) { trails.push([tip[0], tip[1], now]); }
      trails = trails.filter(p => now - p[2] < 0.25);
      trails.forEach(p => { g.fillStyle = `rgba(255,226,122,${1 - (now - p[2]) / 0.25})`; g.fillRect(Math.round(p[0]), Math.round(p[1]), 1, 1); });
      (c.hits || []).forEach(hT => { if (tt >= hT && tt < hT + 0.12 && c.hit) { const at = c.hitAt === 'target' ? [cx + Math.cos(fr) * 16, cy + Math.sin(fr) * 16] : tip; if (at) { g.fillStyle = '#ffffffcc'; g.beginPath(); g.arc(at[0], at[1], 3, 0, 7); g.fill(); } } });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return cv;
  }

  /** 편집 칸: key(리소스) · base(attackFx 경로) · spriteOf() → 미리보기에 쓸 아이템 그림 */
  PDM.swingEditor = function (key, base, spriteOf) {
    const { F, row } = PDM.ui;
    const P = p => [...base, p], cur = PDM.deepGet(store.get(key), base) || {};
    const st = PDM.swingEditor.st = PDM.swingEditor.st || { dir: 'right' };
    const pick = mid => store.edit(key, '공격 모션: ' + PDM.SWING_MOTIONS[mid].name, r => { const m = PDM.SWING_MOTIONS[mid]; const o = PDM.deepGet(r, base) || {};
      PDM.deepSet(r, base, Object.assign({ dist: 0, speed: 1, scale: 1, trailEvery: 0.03, hitAt: 'tip' }, o, { on: true, motion: mid, keys: PDM.clone(m.keys), hits: m.hits.slice(), dur: m.dur })); });
    if (!cur.on) return h('div', {},
      h('p', { class: 'hint' }, '공격할 때 이 무기의 그림이 영웅 가운데에서 휘둘러지게 합니다 (아이템 그림의 왼쪽 아래 = 손잡이, 오른쪽 위 = 날 · 끝). 모션을 누르면 켜집니다.'),
      h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } }, Object.entries(PDM.SWING_MOTIONS).map(([k, m]) => h('button', { class: 'btn sm', title: m.desc, onclick: () => pick(k) }, `${m.icon} ${m.name}`))));
    const getCfg = () => PDM.deepGet(store.get(key), base) || {};
    const pv = preview(getCfg, spriteOf, st);
    return h('div', {},
      h('div', { style: { display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'flex-start' } },
        h('div', {}, pv,
          h('div', { style: { display: 'flex', gap: '3px', marginTop: '4px', flexWrap: 'wrap' } }, h('span', { class: 'hint' }, '대상 방향'),
            [['left', '←'], ['up', '↑'], ['upright', '↗'], ['right', '→'], ['down', '↓']].map(([d, ic]) => h('button', { class: 'btn xs' + (st.dir === d ? ' pri' : ''), onclick: () => { if (d === 'left') st.lastLeft = true; else if (d === 'right' || d === 'upright') st.lastLeft = false; st.dir = d; PDM.tabs.refresh(); } }, ic)))),
        h('div', { style: { flex: '1', minWidth: '260px' } },
          h('div', { class: 'fl' }, '모션 (누르면 그 모션으로)'),
          h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '6px' } }, Object.entries(PDM.SWING_MOTIONS).map(([k, m]) => h('button', { class: 'btn sm' + (cur.motion === k ? ' pri' : ''), title: m.desc, onclick: () => pick(k) }, `${m.icon} ${m.name}`))),
          row(F.num(key, P('dist'), { label: '영웅과의 거리 (+px)', min: -16, max: 32, step: 1, def: 0 }), F.num(key, P('speed'), { label: '빠르기 (배)', min: 0.25, max: 4, step: 0.05, def: 1 }), F.num(key, P('scale'), { label: '무기 그림 크기 (배)', min: 0.25, max: 4, step: 0.05, def: 1 })),
          row(F.select(key, P('trail'), PDM.ui.refOptions('effect'), { label: '휘두르는 동안 끝에서 (파티클)', empty: '(없음)', rerender: true }),
            cur.trail ? F.num(key, P('trailEvery'), { label: '몇 초마다', min: 0.01, max: 0.5, step: 0.01, def: 0.03 }) : null),
          row(F.select(key, P('hit'), PDM.ui.refOptions('effect'), { label: '맞는 순간 (파티클)', empty: '(없음)', rerender: true }),
            cur.hit ? F.select(key, P('hitAt'), { tip: '무기 끝에서', target: '대상 칸에서' }, { label: '어디서', def: 'tip' }) : null,
            F.sound(key, P('sound'), { label: '휘두를 때 소리', kind: 'se', empty: '(게임 기본 소리만)' })),
          row(F.bool(key, P('behind'), { label: '영웅 뒤에 그림 (등 뒤에서 휘두를 때)' }), F.bool(key, P('on'), { label: '공격 모션 쓰기', rerender: true })),
          h('p', { class: 'hint' }, `${(PDM.SWING_MOTIONS[cur.motion] || {}).desc || '직접 고친 모션'} · 한 번 ${(num(cur.dur, 0.3) / Math.max(0.1, num(cur.speed, 1))).toFixed(2)}초 · 맞는 순간 ${(cur.hits || []).length}번. 왼쪽을 볼 때는 좌우가 뒤집혀서 위에서 내려베기는 왼쪽에서도 위에서 내려옵니다. 미리보기의 노란 점 · 흰 원은 파티클이 나오는 자리(실제 이펙트는 게임에서).`),
          h('details', {}, h('summary', { class: 'hint' }, '고급: 키프레임 직접 고치기'),
            h('p', { class: 'hint' }, '한 줄에 하나: 시각(0~1), 각도(°, 바라보는 쪽 기준 · + = 시계 방향 — 오른쪽을 볼 때 아래로), 거리(px), 크기, 불투명도'),
            (() => { const ta = h('textarea', { rows: 6, class: 'mono', style: { width: '100%', fontSize: '12px' } }); ta.value = (cur.keys || []).map(k => k.join(', ')).join('\n');
              ta.addEventListener('change', () => { const keys = ta.value.split('\n').map(l => l.split(',').map(x => +x.trim())).filter(k => k.length >= 5 && k.every(isFinite)).sort((a, b) => a[0] - b[0]);
                if (keys.length >= 2) store.edit(key, '공격 모션 키프레임', r => { const o = PDM.deepGet(r, base); o.keys = keys; o.motion = 'custom'; }); });
              const hi = h('input', { type: 'text', value: (cur.hits || []).join(', '), placeholder: '0.5' });
              hi.addEventListener('change', () => store.edit(key, '맞는 순간', r => { PDM.deepGet(r, base).hits = hi.value.split(',').map(x => +x.trim()).filter(x => isFinite(x) && x >= 0 && x <= 1); }));
              return h('div', {}, ta, row(PDM.ui.field('맞는 순간 (시각, 쉼표로)', hi), F.num(key, P('dur'), { label: '기본 길이 (초)', min: 0.05, max: 3, step: 0.01, def: 0.3 }))); })()))));
  };
})();
