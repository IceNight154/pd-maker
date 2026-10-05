// ================================================================
//  이펙트 · 파티클 — 여러 이미터 + 모디파이어 + 곡선으로 만드는 파티클 이펙트 (Defold ParticleFX 와 같은 구성)
//    데이터: effects.json { list: [ { id, name, sound, emitters: [E…], modifiers: [M…] } ] }
//      E 이미터: { name, x, y, rot, mode: once|loop, duration, delay, startOffset, space: world|emitter, max, burst,
//                 type: circle|box|cone, blend: alpha|add|mult|screen, orient: default|initial|movement, inheritVel, stretchVel,
//                 sprite: { png, fw, fh, frames: "0-3", fps, anim: none|life|loop|random }, color, colorSp,
//                 이미터 속성 K { v, sp(퍼짐 ±), pts(이미터 진행 0~1 곡선 [[t,v]…]) }: rate sizeX sizeY life speed size alpha rot0 stretchX stretchY angVel
//                 수명 속성 L { v, pts(알갱이 수명 0~1 곡선) }: lScale lAlpha lRot lStretchX lStretchY lAngVel,  lColor: [[t,"#hex"]…]
//                 modifiers: [M…] }
//      M 모디파이어: { type: accel|drag|radial|vortex, mag: K, x, y, rot, maxDist }
//    쓰는 곳: 맵 오브젝트 "이펙트" · 아이템의 이펙트 칸 · 이벤트 명령 "이펙트 재생" — 런타임 MakerEffect (같은 계산)
//    단위: 게임 픽셀 (한 칸 16px) · 초 · 도.  화면 좌표라 위쪽이 -y.
// ================================================================
(function () {
  const { h, store } = PDM;
  const K = 'effects';
  const kv = (v, sp, pts) => ({ v, sp: sp || 0, pts: pts || null });
  const EK = { rate: ['초당 생기는 수', 20], sizeX: ['이미터 크기 X (px)', 0], sizeY: ['이미터 크기 Y (px)', 0], life: ['알갱이 수명 (초)', 0.8], speed: ['처음 속도 (px/초)', 20],
    size: ['처음 크기 (px)', 2], alpha: ['처음 불투명도 (0~1)', 1], rot0: ['처음 회전 (도)', 0], stretchX: ['처음 늘림 X (배)', 1], stretchY: ['처음 늘림 Y (배)', 1], angVel: ['처음 회전 속도 (도/초)', 0] };
  const LK = { lScale: ['수명 동안 크기 (배)', 1], lAlpha: ['수명 동안 불투명도 (배)', 1], lRot: ['수명 동안 회전 (도, 더함)', 0], lStretchX: ['수명 동안 늘림 X (배)', 1], lStretchY: ['수명 동안 늘림 Y (배)', 1], lAngVel: ['수명 동안 회전 속도 (도/초, 더함)', 0] };
  const TYPES = { circle: '원 (바깥쪽으로)', box: '상자 (위쪽으로)', cone: '원뿔 (꼭짓점에서 퍼짐)' };
  const BLENDS = { alpha: '보통', add: '더하기 (빛)', mult: '곱하기 (어둡게)', screen: '스크린 (밝게)' };
  const ORIENTS = { default: '기본 (회전 값만)', initial: '처음 나간 방향', movement: '움직이는 방향' };
  const MODS = { accel: '가속 (중력·바람)', drag: '저항 (점점 느려짐)', radial: '방사 (밀어냄 · 음수 = 끌어당김)', vortex: '소용돌이' };
  const emitter = o => Object.assign({ name: '이미터', x: 0, y: 0, rot: 0, mode: 'once', duration: 1, delay: 0, startOffset: 0, space: 'world', max: 200, burst: 0,
    type: 'circle', blend: 'alpha', orient: 'default', inheritVel: 0, stretchVel: false, sprite: { png: '', fw: 0, fh: 0, frames: '', fps: 10, anim: 'none' }, color: '#ffffff', colorSp: 0,
    rate: kv(20), sizeX: kv(0), sizeY: kv(0), life: kv(0.8, 0.2), speed: kv(20, 8), size: kv(2), alpha: kv(1), rot0: kv(0), stretchX: kv(1), stretchY: kv(1), angVel: kv(0),
    lScale: { v: 1, pts: [[0, 1], [1, 0]] }, lAlpha: { v: 1, pts: null }, lRot: { v: 0, pts: null }, lStretchX: { v: 1, pts: null }, lStretchY: { v: 1, pts: null }, lAngVel: { v: 0, pts: null },
    lColor: null, modifiers: [] }, o || {});
  const mod = (type, mag, o) => Object.assign({ type, mag: kv(mag), x: 0, y: 0, rot: 0, maxDist: 0 }, o || {});
  const fade = [[0, 1], [1, 0]];
  const PRESETS = {
    fire: { name: '불꽃', emitters: [emitter({ name: '불', mode: 'loop', type: 'box', blend: 'add', y: 4, rate: kv(30), sizeX: kv(8), life: kv(0.6, 0.2), speed: kv(16, 7), size: kv(3, 0.5), lColor: [[0, '#ffd23a'], [1, '#e0301a']], modifiers: [mod('accel', 20)] })] },
    smoke: { name: '연기', emitters: [emitter({ name: '연기', mode: 'loop', type: 'box', rate: kv(10), sizeX: kv(6), life: kv(1.4, 0.4), speed: kv(7, 3), size: kv(2), alpha: kv(0.6), color: '#777777', lScale: { v: 1, pts: [[0, 1], [1, 3]] }, lAlpha: { v: 1, pts: fade }, lColor: [[0, '#ffffff'], [1, '#666666']], modifiers: [mod('accel', 6, { rot: 70 })] })] },
    sparkle: { name: '반짝임', emitters: [emitter({ name: '반짝', mode: 'loop', type: 'circle', blend: 'add', rate: kv(8), sizeX: kv(16), life: kv(0.7, 0.25), speed: kv(2, 2), size: kv(2), color: '#fff1a8', lScale: { v: 1, pts: [[0, 0], [0.5, 1], [1, 0]] } })] },
    burst: { name: '폭발', emitters: [
      emitter({ name: '불똥', type: 'circle', blend: 'add', duration: 0.2, burst: 40, rate: kv(0), sizeX: kv(4), life: kv(0.5, 0.2), speed: kv(60, 30), size: kv(3), lColor: [[0, '#fff3b0'], [1, '#ff5a1f']], modifiers: [mod('accel', -60), mod('drag', 1.5)] }),
      emitter({ name: '연기', type: 'circle', duration: 0.3, delay: 0.1, burst: 12, rate: kv(0), sizeX: kv(8), life: kv(0.9, 0.3), speed: kv(14, 6), size: kv(3), alpha: kv(0.5), color: '#555555', lScale: { v: 1, pts: [[0, 1], [1, 2.5]] }, lAlpha: { v: 1, pts: fade } })] },
    heal: { name: '치유', emitters: [emitter({ name: '빛', type: 'box', blend: 'add', duration: 0.8, burst: 6, y: 6, rate: kv(14), sizeX: kv(12), sizeY: kv(6), life: kv(0.8, 0.2), speed: kv(15, 5), size: kv(2), lColor: [[0, '#aaffaa'], [1, '#33cc55']] })] },
    poison: { name: '독 기포', emitters: [emitter({ name: '기포', mode: 'loop', type: 'box', y: 6, rate: kv(6), sizeX: kv(12), sizeY: kv(4), life: kv(1.1, 0.3), speed: kv(5, 2), size: kv(1), alpha: kv(0.9), lScale: { v: 1, pts: [[0, 1], [0.9, 3], [1, 0]] }, lColor: [[0, '#9be36a'], [1, '#3c7a1e']] })] },
    snow: { name: '눈 · 재', emitters: [emitter({ name: '눈', mode: 'loop', type: 'box', rot: 180, y: -24, startOffset: 2, rate: kv(12), sizeX: kv(40), life: kv(2, 0.5), speed: kv(9, 3), size: kv(1.5), alpha: kv(0.9), lScale: { v: 1, pts: null }, lAlpha: { v: 1, pts: [[0, 1], [0.7, 1], [1, 0]] }, modifiers: [mod('accel', 4, { rot: 90 })] })] },
    fountain: { name: '분수', emitters: [emitter({ name: '물', mode: 'loop', type: 'cone', rate: kv(40), sizeX: kv(10), sizeY: kv(14), life: kv(0.85, 0.15), speed: kv(55, 8), size: kv(2), color: '#bfe9ff', lScale: { v: 1, pts: [[0, 1], [1, 0.5]] }, lAlpha: { v: 1, pts: [[0, 1], [1, 0.3]] }, lColor: [[0, '#ffffff'], [1, '#3a8bd6']], modifiers: [mod('accel', -140)] })] },
    vortex: { name: '소용돌이', emitters: [emitter({ name: '소용돌이', mode: 'loop', type: 'circle', blend: 'add', space: 'emitter', rate: kv(30), sizeX: kv(28), life: kv(1.2, 0.2), speed: kv(0), size: kv(2), color: '#b89cff', lAlpha: { v: 1, pts: [[0, 0], [0.2, 1], [1, 0]] }, lScale: { v: 1, pts: null }, modifiers: [mod('vortex', 90), mod('radial', -40), mod('drag', 1)] })] }
  };
  const make = (id, preset) => { const p = PDM.clone(PRESETS[preset] || PRESETS.fire); return Object.assign({ id, name: preset ? p.name : '새 이펙트', sound: '' }, { emitters: p.emitters, modifiers: [] }); };
  const list = () => (store.get(K) || {}).list || [];
  const num = (v, d) => (isFinite(+v) && v !== '' && v !== null && v !== undefined ? +v : d);
  const rgb = hex => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); const v = m ? parseInt(m[1], 16) : 0xffffff; return [v >> 16 & 255, v >> 8 & 255, v & 255]; };

  /** 예전(한 겹) 이펙트 { count, rate, angle, spread … } → 이미터 하나짜리 새 형식 */
  function migrate(o) {
    if (o.emitters) return o;
    const loop = !(o.count > 0), ang = num(o.angle, -90), spr = num(o.spread, 360);
    const e = emitter({ name: o.name || '이미터', mode: loop ? 'loop' : 'once', duration: Math.max(0.05, num(o.duration, 1)), burst: num(o.count, 0), blend: o.light ? 'add' : 'alpha',
      type: spr >= 300 ? 'circle' : spr > 5 ? 'cone' : 'box', rot: spr >= 300 ? 0 : ang + 90, y: -num(o.offY, 0),
      rate: kv(num(o.rate, 0)), sizeX: kv(spr >= 300 || spr <= 5 ? num(o.areaW, 0) : Math.tan(spr * Math.PI / 360) * 20), sizeY: kv(spr > 5 && spr < 300 ? 10 : num(o.areaH, 0)),
      life: kv((num(o.lifeMin, 0.5) + num(o.lifeMax, 0.5)) / 2, Math.abs(num(o.lifeMax, 0.5) - num(o.lifeMin, 0.5)) / 2), speed: kv((num(o.speedMin, 0) + num(o.speedMax, 0)) / 2, Math.abs(num(o.speedMax, 0) - num(o.speedMin, 0)) / 2),
      size: kv(Math.max(num(o.size0, 2), num(o.size1, 0)) || 1), alpha: kv(1),
      lScale: { v: 1, pts: [[0, num(o.size0, 2) / (Math.max(num(o.size0, 2), num(o.size1, 0)) || 1)], [1, num(o.size1, 0) / (Math.max(num(o.size0, 2), num(o.size1, 0)) || 1)]] },
      lAlpha: { v: 1, pts: [[0, num(o.alpha0, 1)], [1, num(o.alpha1, 0)]] }, lColor: [[0, o.color0 || '#ffffff'], [1, o.color1 || o.color0 || '#ffffff']],
      modifiers: [num(o.gy, 0) ? mod('accel', -num(o.gy, 0)) : null, num(o.gx, 0) ? mod('accel', num(o.gx, 0), { rot: 90 }) : null].filter(Boolean) });
    return { id: o.id, name: o.name, sound: o.sound || '', emitters: [e], modifiers: [] };
  }
  store.on && store.on('load', () => { try { const d = store.get(K); if (d && (d.list || []).some(x => !x.emitters)) store.edit(K, '이펙트 형식 바꾸기', r => { r.list = r.list.map(migrate); }); } catch (e) { console.error(e); } });

  // ---------------- 계산 (런타임 MakerEffect 와 같음)
  const interp = (pts, t) => { if (!pts || !pts.length) return 0; if (t <= pts[0][0]) return pts[0][1]; for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) { const a = pts[i - 1], b = pts[i], d = b[0] - a[0]; return d <= 0 ? b[1] : a[1] + (b[1] - a[1]) * (t - a[0]) / d; } return pts[pts.length - 1][1]; };
  const K0 = (k, te, d) => !k ? d : (k.pts && k.pts.length ? interp(k.pts, te) : num(k.v, d));
  const KV = (k, te, d) => K0(k, te, d) + (k && k.sp ? (Math.random() * 2 - 1) * k.sp : 0);
  const grad = (st, t) => { if (!st || !st.length) return [255, 255, 255]; if (t <= st[0][0]) return rgb(st[0][1]); for (let i = 1; i < st.length; i++) if (t <= st[i][0]) { const a = rgb(st[i - 1][1]), b = rgb(st[i][1]), d = st[i][0] - st[i - 1][0], k = d <= 0 ? 1 : (t - st[i - 1][0]) / d; return a.map((v, j) => v + (b[j] - v) * k); } return rgb(st[st.length - 1][1]); };
  const frameList = sp => { const out = []; String((sp && sp.frames) || '').split(',').forEach(s => { const m = /^\s*(\d+)\s*(?:-\s*(\d+))?\s*$/.exec(s); if (!m) return; const a = +m[1], b = m[2] === undefined ? a : +m[2]; for (let i = a; a <= b ? i <= b : i >= b; i += a <= b ? 1 : -1) out.push(i); }); return out.length ? out : [0]; };

  /** 이펙트 하나의 재생 상태. loopAll = 맵에 놓았을 때처럼 계속 (한 번짜리 이미터도 끝나면 다시) */
  function Sim(fx, loopAll) {
    const ems = (fx.emitters || []).map(e => ({ e, t: 0, acc: 0, burst: false, ps: [], frames: frameList(e.sprite), warmed: false }));
    const spawn = (s, te, c) => {
      const e = s.e; if (s.ps.length >= Math.max(1, num(e.max, 200))) return;
      const sx = KV(e.sizeX, te, 0), sy = KV(e.sizeY, te, 0); let px = 0, py = 0, dx = 0, dy = -1;
      if (e.type === 'box') { px = (Math.random() - 0.5) * sx; py = (Math.random() - 0.5) * sy; }
      else if (e.type === 'cone') { const u = Math.sqrt(Math.random()); px = (Math.random() - 0.5) * sx * u; py = -u * sy; const l = Math.hypot(px, py); if (l > 0.001) { dx = px / l; dy = py / l; } }
      else { const a = Math.random() * Math.PI * 2, r = sx / 2 * Math.sqrt(Math.random()); dx = Math.cos(a); dy = Math.sin(a); px = dx * r; py = dy * r; }
      const rr = num(e.rot, 0) * Math.PI / 180, cs = Math.cos(rr), sn = Math.sin(rr);
      [px, py] = [px * cs - py * sn, px * sn + py * cs]; [dx, dy] = [dx * cs - dy * sn, dx * sn + dy * cs];
      const world = e.space !== 'emitter', sp = KV(e.speed, te, 0), inh = num(e.inheritVel, 0), c0 = rgb(e.color), cj = num(e.colorSp, 0);
      s.ps.push({ x: (world ? c.x : 0) + num(e.x, 0) + px, y: (world ? c.y : 0) + num(e.y, 0) + py, vx: dx * sp + inh * c.vx, vy: dy * sp + inh * c.vy,
        life: Math.max(0.02, KV(e.life, te, 0.8)), age: 0, size: KV(e.size, te, 2), a: KV(e.alpha, te, 1), rot: KV(e.rot0, te, 0), stx: KV(e.stretchX, te, 1), sty: KV(e.stretchY, te, 1), av: KV(e.angVel, te, 0),
        spin: 0, mr: Math.random() * 2 - 1, dir: Math.atan2(dy, dx) * 180 / Math.PI + 90, fr: Math.floor(Math.random() * s.frames.length), te,
        c: cj ? c0.map(v => Math.max(0, Math.min(255, v * (1 + (Math.random() * 2 - 1) * cj)))) : c0 });
    };
    const step = (s, dt, c, emit) => {
      const e = s.e, dur = Math.max(0.02, num(e.duration, 1)), delay = Math.max(0, num(e.delay, 0));
      s.t += dt; let local = s.t - delay;
      if (local >= dur) {
        if (e.mode === 'loop' && loopAll) { s.t -= dur; local -= dur; s.burst = false; }
        else if (loopAll && !s.ps.length) { s.t = 0; s.acc = 0; s.burst = false; local = -delay; }
      }
      if (emit && local >= 0 && local < dur) {
        const te = local / dur;
        if (!s.burst) { s.burst = true; for (let i = 0, n = Math.round(num(e.burst, 0)); i < n; i++) spawn(s, te, c); }
        s.acc += Math.max(0, K0(e.rate, te, 0)) * dt;
        while (s.acc >= 1) { s.acc -= 1; spawn(s, te, c); }
      }
      const mods = (e.modifiers || []).concat(fx.modifiers || []), world = e.space !== 'emitter', bx = (world ? c.x : 0) + num(e.x, 0), by = (world ? c.y : 0) + num(e.y, 0);
      s.ps = s.ps.filter(p => {
        p.age += dt; const k = p.age / p.life; if (k >= 1) return false;
        mods.forEach(m => {
          const mag = K0(m.mag, p.te, 0) + (m.mag && m.mag.sp ? p.mr * m.mag.sp : 0), mx = bx + num(m.x, 0), my = by + num(m.y, 0);
          if (m.type === 'accel') { const r = num(m.rot, 0) * Math.PI / 180; p.vx += Math.sin(r) * mag * dt; p.vy += -Math.cos(r) * mag * dt; }
          else if (m.type === 'drag') { const f = Math.max(0, 1 - mag * dt); p.vx *= f; p.vy *= f; }
          else { const ox = p.x - mx, oy = p.y - my, d = Math.hypot(ox, oy); if (d < 0.001 || (num(m.maxDist, 0) > 0 && d > m.maxDist)) return;
            if (m.type === 'radial') { p.vx += ox / d * mag * dt; p.vy += oy / d * mag * dt; } else { p.vx += -oy / d * mag * dt; p.vy += ox / d * mag * dt; } }
        });
        p.x += p.vx * dt; p.y += p.vy * dt; p.spin += (p.av + K0(e.lAngVel, k, 0)) * dt;
        return true;
      });
    };
    return {
      ems,
      /** c = { x, y, vx, vy } 중심(월드)과 그 속도. emit=false 면 새로 뿜지 않음 */
      update(dt, c, emit = true) {
        ems.forEach(s => { if (!s.warmed) { s.warmed = true; let w = Math.max(0, num(s.e.startOffset, 0)); while (w > 0) { step(s, Math.min(w, 1 / 30), c, true); w -= 1 / 30; } } step(s, dt, c, emit); });
      },
      /** 한 번 재생이 끝났는가 (계속 도는 이미터가 없고 알갱이도 없음) */
      done() { return ems.every(s => s.t >= num(s.e.delay, 0) + Math.max(0.02, num(s.e.duration, 1)) && !s.ps.length); },
      count() { return ems.reduce((a, s) => a + s.ps.length, 0); },
      /** 그릴 값: f(이미터, 알갱이, { x, y, w, sx, sy, alpha, color, angle, frame }) */
      each(c, f) {
        ems.forEach(s => { const e = s.e, world = e.space !== 'emitter'; s.ps.forEach(p => {
          const k = p.age / p.life, spd = Math.hypot(p.vx, p.vy), move = e.orient === 'movement' || e.stretchVel;
          const base = move ? Math.atan2(p.vy, p.vx) * 180 / Math.PI + 90 : e.orient === 'initial' ? p.dir : 0;
          const an = (e.sprite || {}).anim, n = s.frames.length;
          f(s, p, { x: p.x + (world ? 0 : c.x), y: p.y + (world ? 0 : c.y), w: p.size * K0(e.lScale, k, 1), sx: p.stx * K0(e.lStretchX, k, 1), sy: p.sty * K0(e.lStretchY, k, 1) * (e.stretchVel ? 1 + spd / 40 : 1),
            alpha: Math.max(0, Math.min(1, p.a * K0(e.lAlpha, k, 1))), color: e.lColor && e.lColor.length ? grad(e.lColor, k).map((v, i) => v * p.c[i] / 255) : p.c,
            angle: base + p.rot + K0(e.lRot, k, 0) + p.spin, frame: s.frames[an === 'life' ? Math.min(n - 1, Math.floor(k * n)) : an === 'loop' ? Math.floor(p.age * Math.max(1, num(e.sprite.fps, 10))) % n : an === 'random' ? p.fr : 0] });
        }); });
      }
    };
  }

  // ---------------- 미리보기
  const imgCache = {};
  const loadSprite = png => { if (!png) return null; const c = imgCache[png]; if (c !== undefined) return c; imgCache[png] = null; PDM.assets.load(png).then(im => { imgCache[png] = im || null; }).catch(() => { }); return null; };
  const tintCv = document.createElement('canvas');
  /** 알갱이들을 그림 (미리보기 · 굽기 공용). Z = 배율, imgOf(png) → 그림(없으면 네모) */
  function drawSim(g, sim, c, Z, imgOf) {
    sim.each(c, (s, p, v) => {
        if (v.w <= 0 || v.alpha <= 0) return;
        const e = s.e, sp = e.sprite || {}, img = imgOf(sp.png);
        g.globalCompositeOperation = { add: 'lighter', mult: 'multiply', screen: 'screen' }[e.blend] || 'source-over'; g.globalAlpha = v.alpha;
        g.save(); g.translate(v.x * Z, v.y * Z); g.rotate(v.angle * Math.PI / 180);
        const col = `rgb(${v.color.map(x => Math.round(x)).join(',')})`;
        if (!img) { g.fillStyle = col; const w = v.w * v.sx * Z, hh = v.w * v.sy * Z; g.fillRect(-w / 2, -hh / 2, w, hh); }
        else {
          const fw = num(sp.fw, 0) > 0 ? sp.fw : img.width, fh = num(sp.fh, 0) > 0 ? sp.fh : img.height, cols = Math.max(1, Math.floor(img.width / fw));
          const fxp = (v.frame % cols) * fw, fyp = Math.floor(v.frame / cols) * fh, w = v.w * v.sx * Z, hh = v.w * fh / fw * v.sy * Z;
          let src = img, sxp = fxp, syp = fyp;
          if (v.color.some(x => x < 254)) { tintCv.width = fw; tintCv.height = fh; const t = tintCv.getContext('2d'); t.drawImage(img, fxp, fyp, fw, fh, 0, 0, fw, fh); t.globalCompositeOperation = 'multiply'; t.fillStyle = col; t.fillRect(0, 0, fw, fh); t.globalCompositeOperation = 'destination-in'; t.drawImage(img, fxp, fyp, fw, fh, 0, 0, fw, fh); src = tintCv; sxp = 0; syp = 0; }
          g.drawImage(src, sxp, syp, fw, fh, -w / 2, -hh / 2, w, hh);
        }
        g.restore();
      });
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  }
  /** 씨앗 난수 (굽기: 같은 값이면 언제나 같은 그림) */
  const seeded = seed => { let a = (seed | 0) || 1; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
  const bakeCache = new Map();
  /** 이펙트를 프레임 그림들로 굽기 (노드 합성기의 "이펙트" 노드가 씀)
   *  o: { w, h, frames, fps, x(%), y(%), scale, seed, warm(초 — 미리 돌려 둠), loop } → Promise<canvas[]> */
  async function bake(fx, o) {
    if (!fx || !fx.emitters) return [];
    const key = JSON.stringify([fx, o]);
    if (bakeCache.has(key)) return bakeCache.get(key);
    const imgs = {};
    for (const e of fx.emitters) { const png = (e.sprite || {}).png; if (png && !(png in imgs)) { try { imgs[png] = await PDM.assets.load(png); } catch (_) { imgs[png] = null; } } }
    const n = Math.max(1, o.frames | 0), dt = 1 / Math.max(1, num(o.fps, 8)), Z = Math.max(0.1, num(o.scale, 1)), out = [];
    const c = { x: o.w * num(o.x, 50) / 100 / Z, y: o.h * num(o.y, 50) / 100 / Z, vx: 0, vy: 0 };
    const rnd = Math.random; Math.random = seeded(num(o.seed, 1));
    try {
      const sim = Sim(fx, o.loop !== false), sub = 4;
      for (let w = Math.max(0, num(o.warm, 0)); w > 0; w -= 1 / 30) sim.update(Math.min(w, 1 / 30), c);
      for (let f = 0; f < n; f++) {
        const cv = document.createElement('canvas'); cv.width = o.w; cv.height = o.h; const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
        drawSim(g, sim, c, Z, png => imgs[png] || null); out.push(cv);
        for (let k = 0; k < sub; k++) sim.update(dt / sub, c);
      }
    } finally { Math.random = rnd; }
    if (bakeCache.size > 12) bakeCache.delete(bakeCache.keys().next().value);
    bakeCache.set(key, out); return out;
  }
  function simulator(cv, getFx, getOpt) {
    const g = cv.getContext('2d'); let sim = null, key = '', last = performance.now(), raf = 0, idle = 0;
    const restart = () => { sim = null; };
    const frame = now => {
      raf = requestAnimationFrame(frame);
      if (!cv.isConnected) { cancelAnimationFrame(raf); return; }
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const fx = getFx(), o = getOpt(); if (!fx || !fx.emitters) return;
      const k2 = JSON.stringify(fx) + o.loop; if (k2 !== key) { key = k2; sim = null; }
      const Z = o.zoom, W = cv.width / Z, H = cv.height / Z, c = { x: W / 2, y: H / 2 + 8, vx: 0, vy: 0 };
      if (o.mouse) { c.vx = (o.mouse.x - (o.pm || o.mouse).x) / Math.max(dt, 0.001); c.vy = (o.mouse.y - (o.pm || o.mouse).y) / Math.max(dt, 0.001); c.x = o.mouse.x; c.y = o.mouse.y; o.pm = { x: o.mouse.x, y: o.mouse.y }; }
      if (!sim) { sim = Sim(fx, o.loop); idle = 0; }
      sim.update(dt, c);
      if (!o.loop && sim.done() && (idle += dt) > 0.6) sim = null;
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.imageSmoothingEnabled = false;
      g.fillStyle = o.bg; g.fillRect(0, 0, cv.width, cv.height);
      const hx = W / 2, hy = H / 2 + 8;
      g.strokeStyle = 'rgba(128,128,128,.25)'; g.lineWidth = 1; g.beginPath();
      for (let x = (hx - 8) % 16; x < W; x += 16) { g.moveTo(Math.round(x * Z) + .5, 0); g.lineTo(Math.round(x * Z) + .5, cv.height); }
      for (let y = (hy - 8) % 16; y < H; y += 16) { g.moveTo(0, Math.round(y * Z) + .5); g.lineTo(cv.width, Math.round(y * Z) + .5); }
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.5)'; g.strokeRect((hx - 8) * Z + .5, (hy - 8) * Z + .5, 16 * Z, 16 * Z);
      if (!sim) return;
      if (o.shapes) fx.emitters.forEach((e, i) => {   // 이미터 모양
        g.save(); g.translate((c.x + num(e.x, 0)) * Z, (c.y + num(e.y, 0)) * Z); g.rotate(num(e.rot, 0) * Math.PI / 180); g.strokeStyle = i === o.sel ? 'rgba(255,210,80,.9)' : 'rgba(120,200,255,.5)'; g.beginPath();
        const sx = K0(e.sizeX, 0, 0) * Z, sy = K0(e.sizeY, 0, 0) * Z;
        if (e.type === 'box') g.rect(-sx / 2, -sy / 2, sx, sy); else if (e.type === 'cone') { g.moveTo(0, 0); g.lineTo(-sx / 2, -sy); g.lineTo(sx / 2, -sy); g.closePath(); } else g.arc(0, 0, Math.max(1, sx / 2), 0, Math.PI * 2);
        g.moveTo(0, 0); g.lineTo(0, -6 * Z); g.stroke(); g.restore(); });
      drawSim(g, sim, c, Z, loadSprite);
      if (o.onCount) o.onCount(sim.count());
    };
    raf = requestAnimationFrame(frame);
    return { restart };
  }
  const ops = PDM.listOps({ K, label: '이펙트', title: '이펙트 · 파티클', icon: '🎇', prefix: 'fx', make, presets: Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [k, v.name])),
    cmdType: 'effect', objType: 'effect', fields: ['fxUse', 'fxThrow', 'fxEquip'] });
  PDM.effects = { make, PRESETS, simulator, Sim, migrate, emitter, mod, ops, bake, K,
    /** 그림 파일이 바뀌었을 때 (노드 합성기에서 다시 저장 등) 미리보기 · 굽기 캐시를 비움 */
    invalidate(png) { if (png) delete imgCache[png]; else Object.keys(imgCache).forEach(k => delete imgCache[k]); bakeCache.clear(); } };

  // ---------------- 기본 모양 그림 (assets/fx/shapes/*.png — 흰색으로 그려 두고 색은 이펙트에서 입힘)
  const SHAPES = {
    dot: ['둥근 점', 16, (g, s) => { g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 1, 0, 7); g.fill(); }],
    glow: ['빛 번짐', 32, (g, s) => { const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, s, s); }],
    star: ['별', 16, (g, s) => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? s * 0.2 : s * 0.48; g.lineTo(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r); } g.fill(); }],
    spark: ['십자 빛', 16, (g, s) => { g.fillRect(s / 2 - 1, 0, 2, s); g.fillRect(0, s / 2 - 1, s, 2); g.fillRect(s / 2 - 2, s / 2 - 2, 4, 4); }],
    ring: ['고리', 16, (g, s) => { g.lineWidth = 2; g.strokeStyle = '#fff'; g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 2, 0, 7); g.stroke(); }],
    streak: ['빗줄기', 16, (g, s) => { const r = g.createLinearGradient(0, 0, 0, s); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(1, 'rgba(255,255,255,1)'); g.fillStyle = r; g.fillRect(s / 2 - 1, 0, 2, s); }],
    smoke: ['연기 덩이', 16, (g, s) => { [[6, 9, 5], [10, 8, 5], [8, 5, 4]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }); }]
  };
  async function makeShape(k) {
    const [, s, draw] = SHAPES[k], cv = h('canvas', { width: s, height: s }), g = cv.getContext('2d'); g.fillStyle = '#fff'; draw(g, s);
    const rel = `assets/fx/shapes/${k}.png`; await pdm.writeDataURL(pdm.join(store.root, rel), cv.toDataURL('image/png'));
    if (PDM.assets.invalidate) PDM.assets.invalidate(rel); delete imgCache[rel];
    return rel;
  }

  // ---------------- 편집 칸
  const ptsText = pts => (pts || []).map(p => `${+p[0].toFixed(3)}:${+p[1].toFixed(3)}`).join(', ');
  const parsePts = s => { const out = []; String(s).split(',').forEach(x => { const m = /^\s*(-?[\d.]+)\s*:\s*(-?[\d.]+)\s*$/.exec(x); if (m) out.push([Math.max(0, Math.min(1, +m[1])), +m[2]]); }); return out.sort((a, b) => a[0] - b[0]); };
  /** 곡선 편집기: 눌러서 점 추가, 끌어서 옮김, 오른쪽 누르거나 두 번 눌러 지움 */
  function curveEditor(pts, onChange) {
    const W = 260, H = 84, P = 6, cv = h('canvas', { width: W, height: H, style: { border: '1px solid var(--line)', borderRadius: '4px', cursor: 'crosshair', background: 'var(--bg2)' } });
    const txt = h('input', { type: 'text', class: 'mono', value: ptsText(pts), style: { width: '100%', marginTop: '3px', fontSize: '11px' }, title: '시점:값, 시점:값 … (시점 0~1)' });
    let drag = -1;
    const range = () => { const vs = pts.map(p => p[1]); const lo = Math.min(0, ...vs), hi = Math.max(1, ...vs); return [lo, hi === lo ? lo + 1 : hi]; };
    const X = t => P + t * (W - 2 * P), Y = v => { const [lo, hi] = range(); return H - P - (v - lo) / (hi - lo) * (H - 2 * P); };
    const draw = () => { const g = cv.getContext('2d'); g.clearRect(0, 0, W, H); const [lo, hi] = range();
      g.strokeStyle = 'rgba(128,128,128,.4)'; g.beginPath(); g.moveTo(P, Y(0)); g.lineTo(W - P, Y(0)); g.stroke();
      g.fillStyle = 'rgba(128,128,128,.9)'; g.font = '9px sans-serif'; g.fillText(String(+hi.toFixed(2)), 2, 9); g.fillText(String(+lo.toFixed(2)), 2, H - 1);
      g.strokeStyle = '#7a5cff'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X(0), Y(interp(pts, 0))); pts.forEach(p => g.lineTo(X(p[0]), Y(p[1]))); g.lineTo(X(1), Y(interp(pts, 1))); g.stroke();
      pts.forEach((p, i) => { g.fillStyle = i === drag ? '#ffd24a' : '#7a5cff'; g.beginPath(); g.arc(X(p[0]), Y(p[1]), 3.5, 0, 7); g.fill(); }); };
    const at = e => { const r = cv.getBoundingClientRect(), [lo, hi] = range(); return [Math.max(0, Math.min(1, (e.clientX - r.left - P) / (W - 2 * P))), lo + (H - P - (e.clientY - r.top)) / (H - 2 * P) * (hi - lo)]; };
    const hit = e => { const r = cv.getBoundingClientRect(); return pts.findIndex(p => Math.hypot(X(p[0]) - (e.clientX - r.left), Y(p[1]) - (e.clientY - r.top)) < 7); };
    const done = () => { pts.sort((a, b) => a[0] - b[0]); txt.value = ptsText(pts); draw(); onChange(pts.map(p => [+p[0].toFixed(3), +p[1].toFixed(3)])); };
    cv.addEventListener('mousedown', e => { if (e.button === 2) return; drag = hit(e); if (drag < 0) { const [t, v] = at(e); pts.push([t, v]); drag = pts.length - 1; } draw();
      const mv = ev => { if (drag < 0) return; const [t, v] = at(ev); pts[drag][0] = t; pts[drag][1] = v; draw(); };
      const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); drag = -1; done(); };
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); });
    const rm = e => { e.preventDefault(); const i = hit(e); if (i >= 0 && pts.length > 1) { pts.splice(i, 1); done(); } };
    cv.addEventListener('contextmenu', rm); cv.addEventListener('dblclick', rm);
    txt.addEventListener('change', () => { const n = parsePts(txt.value); if (n.length) { pts.length = 0; pts.push(...n); done(); } });
    draw();
    return h('div', { style: { margin: '2px 0 6px' } }, cv, txt);
  }

  PDM.registerEditor({
    id: K, icon: '🎇', title: () => '이펙트 · 파티클',
    match: k => k === K,
    tree: () => store.isOpen ? [ops.treeNode(55)] : [],
    render(key, ctx) {
      const { F, section, row } = PDM.ui;
      const st = ctx.state = ctx.state || { loop: true, bg: '#16131f', zoom: 4, em: 0, shapes: true, open: {} };
      const all = list();
      if (ops.take(st)) st.em = 0;
      if (!all.some(x => x.id === st.id)) { st.id = (all[0] || {}).id; st.em = 0; }
      const idx = all.findIndex(x => x.id === st.id), fx = all[idx];
      const add = (preset, from) => from ? ops.dup(from.id) : ops.add(preset);
      const head = h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '8px' } },
        all.map(x => h('button', { class: 'btn sm' + (x.id === st.id ? ' pri' : ''), onclick: () => { st.id = x.id; st.em = 0; ctx.refresh(); } }, x.name || x.id)));
      const intro = h('p', { class: 'hint' }, '이미터(뿜는 곳) 여러 개와 모디파이어(힘)로 파티클 이펙트를 만듭니다. 쓰는 곳: ① 맵 편집기의 오브젝트 놓기 › 종류 "이펙트" ② 아이템 편집 화면의 "이펙트" 칸 ③ 이벤트 명령 "연출 › 이펙트 재생".');
      const starter = h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', margin: '4px 0 10px' } }, h('span', { class: 'hint' }, '새로 만들기:'), ...Object.entries(PRESETS).map(([k, v]) => h('button', { class: 'btn sm', onclick: () => add(k) }, '+ ' + v.name)));
      if (!fx) return h('div', { class: 'editor' }, h('h2', {}, '이펙트 · 파티클'), intro, ops.bar(null), starter);
      if (!fx.emitters) { store.edit(K, '이펙트 형식 바꾸기', r => { r.list = r.list.map(migrate); }); return h('div', {}); }
      if (st.em >= fx.emitters.length) st.em = Math.max(0, fx.emitters.length - 1);
      const e = fx.emitters[st.em], ep = ['list', idx, 'emitters', st.em];
      const edit = (label, fn) => store.edit(K, label, r => fn(r.list[idx], r.list[idx].emitters[st.em]));

      // ---- 미리보기
      const cv = h('canvas', { width: 384, height: 384, style: { imageRendering: 'pixelated', border: '1px solid var(--line)', borderRadius: '6px', maxWidth: '100%' } });
      const cnt = h('span', { class: 'hint' });
      st.sel = st.em; st.onCount = n => { cnt.textContent = `알갱이 ${n}개`; };
      const sim = simulator(cv, () => ((store.get(K) || {}).list || []).find(x => x.id === st.id), () => st);
      const mpos = ev => { const r = cv.getBoundingClientRect(); return { x: (ev.clientX - r.left) * cv.width / r.width / st.zoom, y: (ev.clientY - r.top) * cv.height / r.height / st.zoom }; };
      cv.addEventListener('mousedown', ev => { st.mouse = mpos(ev); st.pm = null; const mv = e2 => { st.mouse = mpos(e2); }; const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); st.mouse = null; st.pm = null; }; window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); });
      const sel = (opts, cur, on) => { const s = h('select', { onchange: () => on(s.value) }, opts.map(([v, t]) => h('option', { value: v }, t))); s.value = cur; return s; };

      // ---- 값 + 퍼짐 + 곡선 한 줄
      const keyRow = (path, f, label, def, hasSpread, curveHint) => {
        const k = PDM.deepGet(store.get(K), [...path, f]) || { v: def, sp: 0, pts: null }, id = path.join('.') + f, curved = !!(k.pts && k.pts.length);
        const set = fn => store.edit(K, label, r => { const o = PDM.deepGet(r, path); o[f] = Object.assign({ v: def, pts: null }, hasSpread ? { sp: 0 } : {}, o[f] || {}); fn(o[f]); });
        const inp = (val, on, dis) => { const i = h('input', { type: 'number', step: 'any', value: val, disabled: !!dis, style: { width: '76px' } }); i.addEventListener('change', () => on(num(i.value, 0))); return i; };
        return h('div', { style: { borderBottom: '1px solid var(--line)', padding: '3px 0' } },
          h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
            h('span', { style: { flex: '1 1 150px', fontSize: '12px' } }, label),
            inp(num(k.v, def), v => set(o => { o.v = v; }), curved),
            hasSpread ? h('span', { class: 'hint', title: '퍼짐: 알갱이마다 ± 이만큼 무작위' }, '±') : null, hasSpread ? inp(num(k.sp, 0), v => set(o => { o.sp = Math.abs(v); })) : null,
            h('button', { class: 'btn xs' + (curved ? ' pri' : ''), title: curveHint, onclick: () => { if (curved) set(o => { o.v = +interp(o.pts, 0).toFixed(3); o.pts = null; }); else { st.open[id] = true; set(o => { o.pts = [[0, num(o.v, def)], [1, num(o.v, def)]]; }); } } }, curved ? '곡선 ✕' : '곡선')),
          curved ? curveEditor(PDM.clone(k.pts), pts => set(o => { o.pts = pts; })) : null);
      };
      const modList = (path, title) => {
        const arr = PDM.deepGet(store.get(K), path) || [];
        return h('div', {}, arr.map((m, i) => h('div', { style: { border: '1px solid var(--line)', borderRadius: '6px', padding: '6px 8px', margin: '6px 0' } },
          h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
            sel(Object.entries(MODS), m.type, v => store.edit(K, '모디파이어', r => { PDM.deepGet(r, path)[i].type = v; })),
            h('button', { class: 'ib', title: '지우기', style: { marginLeft: 'auto' }, onclick: () => store.edit(K, '모디파이어 삭제', r => { PDM.deepGet(r, path).splice(i, 1); }) }, '✕')),
          keyRow([...path, i], 'mag', m.type === 'drag' ? '세기 (1 = 1초에 거의 멈춤)' : m.type === 'accel' ? '세기 (px/초²)' : '세기', 0, true, '이미터 진행(0~1)에 따라 세기를 바꿈'),
          m.type === 'accel' ? row(F.num(K, [...path, i, 'rot'], { label: '방향(도) · 0 위 · 90 오른쪽 · 180 아래' })) :
            m.type === 'drag' ? null : row(F.num(K, [...path, i, 'x'], { label: '위치 x (이미터 기준 px)' }), F.num(K, [...path, i, 'y'], { label: '위치 y' }), F.num(K, [...path, i, 'maxDist'], { label: '닿는 거리 (0 = 끝없이)', min: 0 })))),
          h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } }, Object.entries(MODS).map(([k, t]) => h('button', { class: 'btn xs', onclick: () => store.edit(K, '모디파이어 추가', r => { const o = PDM.deepGet(r, path.slice(0, -1)); o[path[path.length - 1]] = o[path[path.length - 1]] || []; o[path[path.length - 1]].push(mod(k, k === 'drag' ? 1 : 20)); }) }, '+ ' + t.split(' ')[0]))));
      };
      const sp = e.sprite || {};
      const spriteBox = () => {
        const prev = h('canvas', { width: 48, height: 48, style: { imageRendering: 'pixelated', border: '1px solid var(--line)', borderRadius: '4px', background: '#222' } });
        if (sp.png) PDM.assets.load(sp.png).then(im => { if (!im) return; const g = prev.getContext('2d'); g.imageSmoothingEnabled = false; const fw = num(sp.fw, 0) > 0 ? sp.fw : im.width, fh = num(sp.fh, 0) > 0 ? sp.fh : im.height, s = Math.min(48 / fw, 48 / fh); g.drawImage(im, 0, 0, fw, fh, (48 - fw * s) / 2, (48 - fh * s) / 2, fw * s, fh * s); }).catch(() => { });
        const setPng = (png, extra) => edit('알갱이 그림', (f, em) => { em.sprite = Object.assign({ fw: 0, fh: 0, frames: '', fps: 10, anim: 'none' }, em.sprite || {}, { png }, extra || {}); });
        const txt = h('input', { type: 'text', value: sp.png || '', placeholder: '(네모 알갱이) — assets/… 또는 game:effects/…', style: { flex: 1, minWidth: '140px' } });
        txt.addEventListener('change', () => setPng(txt.value.trim()));
        return h('div', {},
          h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' } }, prev, txt,
            h('button', { class: 'btn sm', onclick: async () => { const r = await PDM.ui.pickImage('fx'); if (r) { delete imgCache[r]; setPng(r); } } }, '그림 고르기…'),
            h('button', { class: 'btn sm', onclick: async () => {
              const rel = sp.png && !sp.png.startsWith('game:') ? sp.png : `assets/fx/${fx.id}_${st.em + 1}.png`;
              const out = await PDM.editPixelsModal('알갱이 그리기 — ' + fx.name, rel, num(sp.fw, 0) || 16, num(sp.fh, 0) || 16);
              if (out) { delete imgCache[out]; if (PDM.assets.invalidate) PDM.assets.invalidate(out); setPng(out); sim.restart(); }
            } }, sp.png && !sp.png.startsWith('game:') ? '그림 편집…' : '직접 그리기…'),
            PDM.compose && PDM.compose.forEffect ? h('button', { class: 'btn sm', title: '노드 합성기에서 이 알갱이 그림을 만들거나 고칩니다. 합성기에서 저장하면 이 이미터의 그림 · 프레임 설정이 바로 바뀝니다 (확장 기능 "노드 합성기"가 켜짐)',
              onclick: async () => { const em = st.em, rel = await PDM.compose.forEffect(fx, em); if (rel && rel !== sp.png) { delete imgCache[rel]; } } }, '🧩 노드 합성기로…') : null,
            sp.png ? h('button', { class: 'btn sm', onclick: () => setPng('') }, '네모로') : null),
          h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center', margin: '6px 0' } }, h('span', { class: 'hint' }, '기본 모양:'),
            Object.entries(SHAPES).map(([k, v]) => h('button', { class: 'btn xs', onclick: async () => { try { setPng(await makeShape(k), { fw: 0, fh: 0, frames: '', anim: 'none' }); } catch (er) { PDM.log && PDM.log(er.message, 'err'); } } }, v[0]))),
          sp.png ? row(F.num(K, [...ep, 'sprite', 'fw'], { label: '프레임 너비 (0 = 그림 전체)', int: true, min: 0 }), F.num(K, [...ep, 'sprite', 'fh'], { label: '프레임 높이', int: true, min: 0 }),
            F.text(K, [...ep, 'sprite', 'frames'], { label: '프레임 (예: 0-3 또는 0,2,4)' }), F.select(K, [...ep, 'sprite', 'anim'], { none: '첫 프레임만', life: '수명에 맞춰 한 번', loop: '반복 재생', random: '알갱이마다 무작위' }, { label: '애니메이션' }),
            F.num(K, [...ep, 'sprite', 'fps'], { label: '반복 속도 (fps)', min: 1 })) : null,
          h('p', { class: 'hint' }, '그림은 흰색으로 그려 두면 아래 "색"으로 물들일 수 있습니다. 크기(px)는 그림의 가로 길이입니다. 게임 그림은 game:effects/… 처럼 적습니다.'));
      };
      const gradEditor = () => {
        const stops = e.lColor || [];
        return h('div', {},
          stops.length ? h('div', { style: { height: '12px', borderRadius: '3px', margin: '4px 0', background: `linear-gradient(90deg, ${stops.map(s => `${s[1]} ${s[0] * 100}%`).join(',')})` } }) : null,
          stops.map((s, i) => h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', margin: '2px 0' } },
            (() => { const c = h('input', { type: 'color', value: s[1], style: { width: '40px', padding: 0 } }); c.addEventListener('change', () => edit('색 변화', (f, em) => { em.lColor[i][1] = c.value; })); return c; })(),
            h('span', { class: 'hint' }, '시점'), (() => { const t = h('input', { type: 'number', min: 0, max: 1, step: 0.05, value: s[0], style: { width: '64px' } }); t.addEventListener('change', () => edit('색 변화', (f, em) => { em.lColor[i][0] = Math.max(0, Math.min(1, num(t.value, 0))); em.lColor.sort((a, b) => a[0] - b[0]); })); return t; })(),
            h('button', { class: 'ib', onclick: () => edit('색 변화', (f, em) => { em.lColor.splice(i, 1); if (!em.lColor.length) em.lColor = null; }) }, '✕'))),
          h('button', { class: 'btn xs', onclick: () => edit('색 변화', (f, em) => { em.lColor = em.lColor || []; em.lColor.push(em.lColor.length ? [1, '#ffffff'] : [0, '#ffffff']); if (em.lColor.length === 1) em.lColor.push([1, '#ffffff']); em.lColor.sort((a, b) => a[0] - b[0]); }) }, '+ 색 추가'),
          h('span', { class: 'hint', style: { marginLeft: '6px' } }, stops.length ? '처음 색에 곱해집니다 (처음 색이 흰색이면 이 색 그대로).' : '수명 동안 색을 바꾸려면 추가하세요.'));
      };
      const emTabs = h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center', margin: '6px 0' } },
        fx.emitters.map((x, i) => h('button', { class: 'btn sm' + (i === st.em ? ' pri' : ''), onclick: () => { st.em = i; ctx.refresh(); } }, `${i + 1}. ${x.name || '이미터'}`)),
        h('button', { class: 'btn sm', onclick: () => { st.em = fx.emitters.length; store.edit(K, '이미터 추가', r => { r.list[idx].emitters.push(emitter({ name: '이미터 ' + (fx.emitters.length + 1), mode: 'loop' })); }); } }, '+ 이미터'),
        e ? h('button', { class: 'btn sm', onclick: () => { st.em = fx.emitters.length; store.edit(K, '이미터 복제', r => { r.list[idx].emitters.push(Object.assign(PDM.clone(e), { name: e.name + ' 사본' })); }); } }, '복제') : null,
        e && fx.emitters.length > 1 ? h('button', { class: 'btn sm', onclick: () => store.edit(K, '이미터 삭제', r => { r.list[idx].emitters.splice(st.em, 1); }) }, '삭제') : null);
      const uses = [];
      store.all('item').forEach(it => ['fxUse', 'fxThrow', 'fxEquip'].forEach(f => { if (it[f] === fx.id) uses.push(['item:' + it.id, `아이템 ${it.name}`]); }));
      return h('div', { class: 'editor' },
        h('h2', {}, '이펙트 · 파티클'), intro, head, ops.bar(fx),
        h('div', { style: { display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'flex-start' } },
          h('div', { style: { flex: '0 0 auto', position: 'sticky', top: '0' } }, cv,
            h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginTop: '6px', maxWidth: '384px' } },
              h('button', { class: 'btn sm', onclick: () => sim.restart() }, '▶ 다시'),
              h('label', { class: 'check', title: '맵에 놓았을 때처럼 계속 재생. 끄면 아이템·이벤트처럼 한 번 — 반복 이미터도 길이만큼 한 바퀴만 뿜고 끝남' }, h('input', { type: 'checkbox', checked: st.loop, onchange: ev => { st.loop = ev.target.checked; sim.restart(); } }), '계속'),
              h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: st.shapes, onchange: ev => { st.shapes = ev.target.checked; } }), '이미터 모양'),
              sel([['#16131f', '어두운 배경'], ['#5a5a5a', '회색'], ['#d8d8d8', '밝은 배경']], st.bg, v => { st.bg = v; }),
              sel([2, 3, 4, 6].map(v => [v, v + '배']), st.zoom, v => { st.zoom = +v; sim.restart(); }), cnt),
            h('p', { class: 'hint', style: { maxWidth: '384px' } }, '가운데 흰 네모가 이펙트가 놓인 칸(16px)입니다. 미리보기를 누른 채 끌면 이펙트가 따라옵니다 (움직이는 캐릭터에 붙었을 때).')),
          h('div', { style: { flex: '1 1 400px', minWidth: '340px' } },
            section('이펙트',
              row(F.text(K, ['list', idx, 'name'], { label: '이름', rerender: true }), PDM.ui.field('id', h('input', { type: 'text', value: fx.id, disabled: true }))),
              F.sound ? F.sound(K, ['list', idx, 'sound'], { label: '재생할 때 소리 (한 번 재생할 때만)', kind: 'se', empty: '(소리 없음)' }) : null,
              h('div', { style: { display: 'flex', gap: '6px', marginTop: '6px', alignItems: 'center', flexWrap: 'wrap' } },
                uses.length ? h('span', { class: 'hint' }, '쓰는 곳: ', uses.map(([k, t]) => h('a', { href: '#', style: { marginRight: '8px' }, onclick: ev => { ev.preventDefault(); PDM.tabs.open(k); } }, t))) : null)),
            section('광원 (재생하는 동안 퍼지는 빛)',
              F.bool(K, ['list', idx, 'light', 'on'], { label: '💡 광원 켜기 — 게임에서 이펙트 자리에 점광원 (벽 · 물건 · 캐릭터 그림자 있음). 따라다니는 이펙트면 빛도 따라가고, 한 번 재생이면 알갱이가 줄면서 함께 어두워짐', rerender: true }),
              (fx.light || {}).on ? h('div', {}, ...PDM.lightFields(K, ['list', idx, 'light'], fx.light || {})) : null),
            h('h3', { style: { margin: '12px 0 0' } }, '이미터'), emTabs,
            !e ? null : h('div', {},
              section('이미터 기본',
                row(F.text(K, [...ep, 'name'], { label: '이름', rerender: true }), F.select(K, [...ep, 'mode'], { once: '한 번', loop: '반복' }, { label: '재생 방식', hint: '반복은 맵에 놓았을 때 끊김 없이 이어짐. 아이템·이벤트로 재생하면 길이만큼만' }), F.num(K, [...ep, 'duration'], { label: '길이(초)', min: 0.02, step: 0.1 }),
                  F.num(K, [...ep, 'delay'], { label: '시작 지연(초)', min: 0, step: 0.1 }), F.num(K, [...ep, 'startOffset'], { label: '미리 진행(초)', min: 0, step: 0.5, hint: '시작할 때 이미 이만큼 뿜은 상태' })),
                row(F.select(K, [...ep, 'type'], TYPES, { label: '이미터 모양', rerender: true }), F.num(K, [...ep, 'x'], { label: '위치 x (px)' }), F.num(K, [...ep, 'y'], { label: '위치 y (아래가 +)' }), F.num(K, [...ep, 'rot'], { label: '회전(도)' })),
                row(F.select(K, [...ep, 'space'], { world: '월드 (뿜은 뒤 따로 움직임)', emitter: '이미터 (이미터를 따라감)' }, { label: '알갱이 공간' }), F.select(K, [...ep, 'blend'], BLENDS, { label: '겹치는 방식' }),
                  F.num(K, [...ep, 'max'], { label: '최대 알갱이 수', int: true, min: 1, max: 1000 }), F.num(K, [...ep, 'burst'], { label: '시작할 때 한꺼번에', int: true, min: 0, max: 500 })),
                row(F.select(K, [...ep, 'orient'], ORIENTS, { label: '알갱이 방향' }), F.num(K, [...ep, 'inheritVel'], { label: '이미터 속도 물려받기 (0~1)', min: 0, max: 2, step: 0.1 }), F.bool(K, [...ep, 'stretchVel'], { label: '속도만큼 길게 늘이기' }))),
              section('알갱이 그림 (스프라이트)', spriteBox()),
              section('생성 · 처음 값 (값 ± 퍼짐 · 곡선 = 이미터 길이 동안 변화)',
                Object.entries(EK).map(([f, [label, def]]) => keyRow(ep, f, label, def, f !== 'rate', '이미터가 진행되는 동안(0 = 시작, 1 = 끝) 이 값을 바꿈')),
                row(PDM.ui.field('처음 색', (() => { const c = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(e.color || '') ? e.color : '#ffffff', style: { width: '48px', padding: 0 } }); c.addEventListener('change', () => PDM.ui.commit(K, [...ep, 'color'], c.value, '처음 색', false)); return c; })()),
                  F.num(K, [...ep, 'colorSp'], { label: '색 밝기 퍼짐 (0~1)', min: 0, max: 1, step: 0.05 }))),
              section('수명 동안 변화 (곡선 = 알갱이가 태어나서 사라질 때까지)',
                Object.entries(LK).map(([f, [label, def]]) => keyRow(ep, f, label, def, false, '알갱이 수명(0 = 태어남, 1 = 사라짐) 동안 이 값을 바꿈')),
                h('div', { style: { marginTop: '6px' } }, h('b', { style: { fontSize: '12px' } }, '수명 동안 색'), gradEditor())),
              section('모디파이어 (이 이미터에만)', modList([...ep, 'modifiers']))),
            section('모디파이어 (모든 이미터에)', modList(['list', idx, 'modifiers'])))));
    }
  });
})();
