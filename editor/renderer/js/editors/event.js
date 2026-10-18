// ================================================================
//  이벤트 편집기 (RPG Maker 식 페이지 · 조건 · 트리거 · 명령)
//   종류: 커먼 이벤트 / 장면(연출) / 이정표 이벤트 / 층 이벤트(데일리)
//   장면은 "미리보기"로 일러스트·대사·선택지를 바로 재생해 볼 수 있습니다.
// ================================================================
(function () {
  const { h } = PDM;
  const store = PDM.store;
  const KIND_ICON = { common: '⚡', scene: '🎬', milestone: '💞', daily: '🎲' };

  async function newEvent(kind) {
    const id = await PDM.ui.prompt('새 이벤트 id (영문)', ''); if (!id) return;
    const clean = PDM.slugId(id);
    if (store.has('event:' + clean)) { toast('같은 id 가 있습니다', 'bad'); return; }
    const e = PDM.make.event(clean, kind); e.name = id;
    if (kind === 'scene') e.pages[0].trigger = 'none';
    if (kind === 'daily') { e.pages[0].trigger = 'floorEnter'; e.daily = { chance: 30, from: 1, to: 25, once: true }; }
    store.add('event:' + clean, e, '이벤트 추가'); PDM.tabs.open('event:' + clean);
  }

  // =============================================================
  //  장면 미리보기 플레이어
  // =============================================================
  async function preview(ev) {
    const stage = h('div', { class: 'scene-prev' });
    const box = h('div', { class: 'scene-box', hidden: true });
    const choices = h('div', { class: 'scene-choices' });
    const logEl = h('div', { class: 'sim-log', style: { width: '640px' } });
    stage.append(box, choices);
    const illusts = {};
    const state = { switches: {}, vars: {}, self: {} };
    let closed = false;
    const resolve = n => {
      if (n.startsWith('switch.')) return !!state.switches[n.slice(7)];
      if (n.startsWith('var.')) return state.vars[n.slice(4)] || 0;
      if (n.startsWith('self.')) return !!state.self[n.slice(5)];
      return 0;
    };
    const log = t => logEl.prepend(h('div', {}, t));
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const click = () => new Promise(r => { const f = () => { stage.removeEventListener('click', f); r(); }; stage.addEventListener('click', f); });
    // 일러스트: 런타임 MakerStage 와 같은 자리 계산(PDM.Dialogue.stageLayout — 게임 화면 높이 270 단위를 미리보기 크기로) · 번호가 큰 그림이 앞
    const UH = PDM.Dialogue.UI_H, unit = () => stage.clientHeight / UH, UW = () => stage.clientWidth / unit();
    function placeIllust(s) {
      const L = PDM.Dialogue.stageLayout(s.pos, UW(), UH, s.iw, s.ih, s), k = unit();
      L.x += s.shift || 0;   // 움직이기 중 자리(왼쪽 · 가운데 · 오른쪽)를 바꾸는 만큼
      Object.assign(s.img.style, { left: L.x * k + 'px', top: L.y * k + 'px', width: L.w * k + 'px', height: L.h * k + 'px', bottom: 'auto', maxHeight: 'none', transform: L.flip ? 'scaleX(-1)' : '' });
      s.L = L;
    }
    async function setIllust(slot, ref, pos, fade, o = {}) {
      if (illusts[slot]) { const old = illusts[slot]; old.img.style.transition = `opacity ${(fade ?? 3) / 10}s`; old.img.style.opacity = 0; setTimeout(() => old.img.remove(), (fade ?? 3) * 100 + 50); delete illusts[slot]; }
      if (!ref) return true;
      const abs = PDM.assets.resolvePath(ref);
      let url = null; try { url = abs && await pdm.readDataURL(abs); } catch (_) { url = null; }
      if (!url) { log('⚠ 그림 없음: ' + ref + ' — 게임에서도 보이지 않습니다 (검사 F7)'); return false; }
      const img = h('img', { src: url, style: { opacity: 0, position: 'absolute', zIndex: slot } });
      await new Promise(r => { img.onload = r; img.onerror = r; });
      const sl = { img, pos: pos || 'center', iw: img.naturalWidth || 1, ih: img.naturalHeight || 1, scale: (o.scale || 100) / 100, alpha: (o.alpha ?? 100) / 100, ox: +o.ox || 0, oy: +o.oy || 0, flip: !!o.flip };
      stage.insertBefore(img, box); illusts[slot] = sl; placeIllust(sl);
      img.style.transition = `opacity ${(fade ?? 3) / 10}s`;
      requestAnimationFrame(() => { img.style.opacity = sl.alpha; });
      return true;
    }
    /** 일러스트 움직이기 — 런타임과 같은 곡선 · 시간 (지금 값 → 목표) */
    function moveIllust(slot, c) {
      const s = illusts[slot]; if (!s) { log(`⚠ 일러스트 움직이기: ${slot}번에 그림이 없음`); return Promise.resolve(); }
      const from = { scale: s.scale, ox: s.ox, oy: s.oy, alpha: s.alpha };
      const to = { scale: c.scale > 0 ? c.scale / 100 : s.scale, ox: +c.ox || 0, oy: +c.oy || 0, alpha: c.alpha != null && c.alpha !== '' ? c.alpha / 100 : s.alpha };
      const newPos = c.pos && c.pos !== 'full' && s.pos !== 'full' ? c.pos : s.pos;
      const bx = p => PDM.Dialogue.stageLayout(p, UW(), UH, s.iw, s.ih, {}).baseX, dBx = bx(newPos) - bx(s.pos);   // 자리를 바꾸면 기준 x 가 움직이는 만큼
      const dur = Math.max(0.01, (c.time ?? 5) / 10) * 1000, t0 = performance.now();
      s.img.style.transition = 'none';
      return new Promise(res => { const tick = () => { if (closed) return res(); const k = PDM.Dialogue.ease(Math.min(1, (performance.now() - t0) / dur));
        s.scale = from.scale + (to.scale - from.scale) * k; s.ox = from.ox + (to.ox - from.ox) * k; s.oy = from.oy + (to.oy - from.oy) * k; s.alpha = from.alpha + (to.alpha - from.alpha) * k; s.shift = dBx * k;
        placeIllust(s); s.img.style.opacity = s.alpha;
        if (k < 1) requestAnimationFrame(tick); else { s.pos = newPos; s.shift = 0; placeIllust(s); res(); } }; requestAnimationFrame(tick); });
    }
    // 화면 어둡게 / 밝게 (런타임: 화면 위 색 상자 · 대사창 아래)
    const fadeEl = h('div', { style: { position: 'absolute', inset: 0, opacity: 0, pointerEvents: 'none', zIndex: 50, background: '#000' } });
    stage.append(fadeEl);
    const SPEED = { instant: 0, slow: 20, normal: 40, fast: 80 };
    function portraitOf(charId, face) {
      const c = store.get('char:' + charId); if (!c || !c.portrait) return null;
      const ex = (c.portrait.expressions || []).find(e => e.key === face);
      return (ex && ex.image) || c.portrait.default || null;
    }
    const faces = {};
    const newStyle = !PDM.Dialogue.classic();
    async function run(list) {
      list = list || [];
      for (let li = 0; li < list.length; li++) {
        const c = list[li];
        if (closed) return 'stop';
        const def = PDM.COMMANDS[c.cmd] || {};
        switch (c.cmd) {
          case 'text': if (newStyle) {
            const l = PDM.Dialogue.line(c.speaker, c.face, c.illust, c.text || '', faces);
            if (c.name) l.name = c.name; if (c.side) l.side = c.side;
            if (c.speed in SPEED) l.speed = SPEED[c.speed]; if (+c.auto > 0) l.auto = c.auto / 10;
            const nx = list[li + 1];
            const withChoice = nx && nx.cmd === 'choice' && (nx.options || []).length;
            box.hidden = true;
            const pick = await PDM.Dialogue.play(stage, l, withChoice ? nx.options : null);
            if (withChoice) {
              li++; log(`선택: ${nx.options[pick]}`);
              if ((await run((nx.branches || [])[pick])) === 'stop') return 'stop';
            }
            break;
          } else {
            const who = c.speaker ? PDM.refName('character', c.speaker) : '';
            const img = c.illust || (c.speaker && c.speaker !== '$hero' ? portraitOf(c.speaker, c.face) : null);
            if (img) await setIllust(9, img, 'right', 2);
            box.hidden = false; box.replaceChildren(who ? h('b', {}, who + (c.face ? ` (${c.face})` : '')) : '', h('div', { class: 'pre-wrap' }, c.text || ''));
            await click(); break;
          }
          case 'choice': {
            if (newStyle && (c.options || []).length) {
              box.hidden = true;
              const pick = await PDM.Dialogue.play(stage, { text: '', name: '' }, c.options);
              log(`선택: ${c.options[pick]}`);
              if ((await run((c.branches || [])[pick])) === 'stop') return 'stop'; break;
            }
            box.hidden = false;
            const pick = await new Promise(r => { choices.replaceChildren(...(c.options || []).map((o, i) => h('button', { onclick: e => { e.stopPropagation(); r(i); } }, o))); });
            choices.replaceChildren(); log(`선택: ${c.options[pick]}`);
            if ((await run((c.branches || [])[pick])) === 'stop') return 'stop'; break;
          }
          case 'if': { const ok = PDM.Cond.evaluate(c.cond, resolve); log(`조건 ${c.cond || '(항상)'} → ${ok}`); if ((await run(ok ? c.then : c.else)) === 'stop') return 'stop'; break; }
          case 'loop': for (let i = 0; i < (c.times || 3); i++) { const r = await run(c.body); if (r === 'break') break; if (r === 'stop') return 'stop'; } break;
          case 'break': return 'break';
          case 'stop': return 'stop';
          case 'wait': await wait((c.turns || 5) * 100); break;
          case 'switch': state.switches[c.id] = !!c.value; log(`스위치 ${c.id} = ${!!c.value}`); break;
          case 'var': { const v = state.vars[c.id] || 0, x = +c.value || 0; state.vars[c.id] = ({ set: x, add: v + x, sub: v - x, mul: v * x })[c.op || 'set']; log(`변수 ${c.id} = ${state.vars[c.id]}`); break; }
          case 'self': state.self[c.key || 'A'] = !!c.value; break;
          case 'illust': { const ok = await setIllust(c.slot || 1, c.image, c.pos, c.fade, c); if (ok && c.wait) await wait((c.fade ?? 3) * 100); break; }
          case 'illustMove': { const p = moveIllust(c.slot || 1, c); if (c.wait !== false) await p; break; }
          case 'waitInput': log('입력 기다리는 중 — 화면을 누르세요'); await click(); break;
          case 'fade': { const t = Math.max(1, c.time ?? 5) * 100; fadeEl.style.background = c.color || '#000'; fadeEl.style.transition = `opacity ${t}ms linear`; fadeEl.style.opacity = c.op === 'in' ? 0 : 1; if (c.wait !== false) await wait(t); break; }
          case 'sound': {
            if (c.kind === 'bgmStop') { log(`배경음 끄기${c.fade ? ` (${c.fade / 10}초)` : ''}`); if (PDM.audio && PDM.audio.stop) PDM.audio.stop(); break; }
            if (!c.file) { log('⚠ 소리를 고르지 않음'); break; }
            log(`${c.kind === 'bgm' ? '배경음' : '효과음'}: ${PDM.audio ? PDM.audio.label(c.file) : c.file}`);
            try { if (PDM.audio && PDM.audio.play) await Promise.race([PDM.audio.play(c.file), wait(50)]); } catch (e) { log('⚠ 소리를 재생하지 못함: ' + c.file); }
            break;
          }
          case 'face': faces[c.char] = c.face || ''; log(`표정: ${PDM.refName('character', c.char)} → ${c.face || '기본'}`); break;
          case 'illustHide': if (!c.slot) Object.keys(illusts).forEach(k => setIllust(k, null, null, c.fade)); else await setIllust(c.slot, null, null, c.fade); break;
          case 'shake': stage.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${c.power || 3}px,0)` }, { transform: `translate(-${c.power || 3}px,0)` }, { transform: 'translate(0,0)' }], { duration: 120, iterations: Math.max(1, (c.time || 5) / 1.2) }); await wait((c.time || 5) * 100); break;
          case 'flash': stage.animate([{ boxShadow: `inset 0 0 0 400px ${c.color || '#ffffff'}` }, { boxShadow: 'inset 0 0 0 400px transparent' }], { duration: (c.time || 3) * 100 }); await wait((c.time || 3) * 100); break;
          case 'call': { const e2 = store.get('event:' + c.event); if (e2) { if ((await run(e2.pages[0].commands)) === 'stop') return 'stop'; } break; }
          case 'comment': break;
          default: log(`(${def.name || c.cmd} — 게임에서 실행됨)`);
        }
      }
      return 'done';
    }
    const done = PDM.ui.modal('장면 미리보기 — ' + ev.name, h('div', {}, stage, h('div', { class: 'hint my-3' }, '화면을 클릭하면 대사가 넘어갑니다. 게임 데이터(수치 변경, 이동 등)는 기록만 됩니다.'), logEl), [['닫기', null]]);
    done.then(() => { closed = true; });
    const res = await run(ev.pages[0].commands);
    if (!closed) { box.hidden = false; box.replaceChildren(h('i', {}, res === 'stop' ? '— 이벤트 중지 —' : '— 끝 —')); }
  }
  PDM.previewEvent = preview;

  // =============================================================
  const TRIG_HINT = {
            action: '맵 오브젝트(캐릭터 · 이벤트 칸)에 이 이벤트를 지정하면, 말을 걸거나 조사할 때 실행됩니다.',
            touch: '맵의 이벤트 칸에 지정하면, 영웅이 그 칸을 밟을 때 실행됩니다.',
            auto: '맵에 놓지 않아도 됩니다. 페이지 조건이 맞는 순간 한 번 실행됩니다 (게임마다 한 번). 조건을 비우면 게임을 시작하자마자 실행.',
            parallel: '맵에 놓지 않아도 됩니다. 페이지 조건이 맞는 동안 매 턴 실행됩니다 (다른 이벤트가 진행 중이면 쉼). 대사처럼 멈추는 명령은 피하세요.',
            floorEnter: '맵에 놓지 않아도 됩니다. 어느 맵이든 들어올 때마다 실행됩니다. 특정 맵만이면 조건에 node == "노드id" 를 쓰세요.',
            turn: '맵에 놓지 않아도 됩니다. 정한 턴마다 실행됩니다.',
            heart: '맵에 놓지 않아도 됩니다. 대상 캐릭터의 마음 조건을 만족하면 한 번 실행됩니다.',
            itemPickup: '맵에 놓지 않아도 됩니다. 그 아이템을 주울 때마다 실행됩니다 (프로젝트 아이템 id 또는 spd:게임 아이템). 금화는 해당 없음.',
            mobKilled: '맵에 놓지 않아도 됩니다. 적이 죽을 때마다 실행됩니다 (캐릭터 id · 게임 클래스 이름, 비우면 아무 적이나).',
            bossDefeated: '맵에 놓지 않아도 됩니다. 보스(게임의 BOSS 속성)가 죽을 때 실행됩니다.',
            none: '스스로 실행되지 않습니다. "커먼 이벤트 호출" · 노드의 입장 이벤트 · 스토리 비트 · 엔딩 장면 등에서 불러 씁니다.'
          };
  PDM.registerEditor({
    id: 'event', icon: k => { const e = store.get(k); return (e && KIND_ICON[e.kind]) || '⚡'; },
    match: k => k.startsWith('event:'),
    title: k => { const e = store.get(k); return e ? e.name : k; },
    watch: (ck, tk) => ck === tk || ck === 'story',
    tree() {
      if (!store.isOpen) return [];
      const all = store.all('event');
      return [{ id: 'event', label: '이벤트', icon: '⚡', order: 40, count: all.length,
        menu: Object.entries(PDM.EVENT_KINDS).map(([k, v]) => ({ label: `새 ${v}…`, run: () => newEvent(k) })),
        children: Object.entries(PDM.EVENT_KINDS).map(([kind, label]) => {
          const list = all.filter(e => (e.kind || 'common') === kind);
          return { id: 'ev_' + kind, label, icon: KIND_ICON[kind], count: list.length, menu: [{ label: `새 ${label}…`, run: () => newEvent(kind) }],
            children: list.map(e => ({ id: 'e_' + e.id, label: `${e.name} (${e.id})`, open: 'event:' + e.id,
              menu: PDM.resOps.menu('event', e.id, [{ label: '미리보기', run: () => preview(e) }, { label: '쓰는 곳…', run: () => PDM.resOps.showUsage('event', e.id) }]) })) };
        }) }];
    },
    render(key, ctx) {
      const ev = store.get(key);
      const { F, section, row } = PDM.ui;
      const st = ctx.st = ctx.st || { page: 0 };
      if (st.page >= ev.pages.length) st.page = 0;
      const pi = st.page, pg = ev.pages[pi], P = ['pages', pi];

      const blank = () => PDM.make.page();
      const pageTabs = h('div', { class: 'pages' },
        ev.pages.map((p, i) => h('button', { class: 'chip' + (i === pi ? ' on' : ''), onclick: () => { st.page = i; ctx.refresh(); } }, `${i + 1}`)),
        h('button', { class: 'btn sm', onclick: () => { store.edit(key, '페이지 추가', r => { r.pages.splice(pi + 1, 0, blank()); }); st.page = pi + 1; ctx.refresh(); } }, '이벤트 페이지 새로 만들기'),
        h('button', { class: 'btn sm', title: '이 페이지를 복사해 둡니다 (다른 이벤트에도 붙여넣을 수 있음)', onclick: () => { PDM._pageClip = PDM.clone(pg); toast(`페이지 ${pi + 1} 을 복사했습니다`); ctx.refresh(); } }, '복사하기'),
        h('button', { class: 'btn sm', disabled: !PDM._pageClip, title: '복사한 페이지를 이 페이지 다음에 넣습니다', onclick: () => { if (!PDM._pageClip) return; store.edit(key, '페이지 붙여넣기', r => { r.pages.splice(pi + 1, 0, PDM.clone(PDM._pageClip)); }); st.page = pi + 1; ctx.refresh(); } }, '붙여넣기'),
        h('button', { class: 'btn sm danger', disabled: ev.pages.length <= 1, onclick: async () => { if (ev.pages.length > 1 && await PDM.ui.confirm(`페이지 ${pi + 1} 을(를) 삭제할까요?`)) { store.edit(key, '페이지 삭제', r => { r.pages.splice(pi, 1); }); st.page = Math.max(0, pi - 1); ctx.refresh(); } } }, '삭제하기'),
        h('button', { class: 'btn sm', onclick: async () => { if (await PDM.ui.confirm(`페이지 ${pi + 1} 의 조건 · 이미지 · 이동 · 실행 내용을 모두 비울까요?`)) store.edit(key, '페이지 비우기', r => { r.pages[pi] = blank(); }); } }, '비우기'));

      // ---- 페이지 설정 (RPG Maker 의 이벤트 에디터처럼: 왼쪽 = 조건 · 이미지 · 자율 이동 · 옵션 · 발동, 오른쪽 = 실행 내용)
      const cd = pg.conds || {}, mv = pg.move || {}, op = pg.opts || {}, gr = pg.graphic || {};
      const setIn = (path, v, label) => store.edit(key, label || '페이지 설정', r => { const p = r.pages[pi]; let o = p; for (let k = 0; k < path.length - 1; k++) o = o[path[k]] = (o[path[k]] && typeof o[path[k]] === 'object' && !Array.isArray(o[path[k]])) ? o[path[k]] : {}; if (v === undefined) delete o[path[path.length - 1]]; else o[path[path.length - 1]] = v; });
      const sel = (opts, cur, on, o = {}) => { const s2 = h('select', { disabled: !!o.disabled, class: 'grow min-0' }, o.empty ? h('option', { value: '' }, o.empty) : null, opts.map(([v, t]) => h('option', { value: v, selected: String(v) === String(cur ?? '') }, t))); s2.onchange = () => on(s2.value); return s2; };
      const story = store.get('story') || {};
      const swOpts = (story.switches || []).map(x => [x.id, x.name ? `${x.name} (${x.id})` : x.id]), varOpts = (story.variables || []).map(x => [x.id, x.name ? `${x.name} (${x.id})` : x.id]);
      const itemOpts = store.all('item').map(x => [x.id, x.name || x.id]), heroOpts = store.all('hero').filter(x => x.enabled !== false).map(x => [x.id, x.name || x.id]), charOpts = store.all('char').map(x => [x.id, `${x.name || x.id}`]);
      /** 조건 한 줄: 체크하면 켜지고(첫 항목으로), 끄면 지워짐 */
      const condRow = (label, k, opts, extra) => { const on = cd[k] !== undefined && cd[k] !== '';
        const cb = h('input', { type: 'checkbox', checked: on }); cb.onchange = () => { if (cb.checked && !opts.length) { cb.checked = false; toast(label + ': 고를 것이 없습니다 — 먼저 만들어 주세요', 'bad'); return; } setIn(['conds', k], cb.checked ? opts[0][0] : undefined, '출현 조건'); };
        return h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', margin: '3px 0' } }, h('label', { class: 'check', style: { width: '92px', flex: 'none' } }, cb, label),
          sel(opts, cd[k], v => setIn(['conds', k], v, '출현 조건'), { disabled: !on }), extra ? extra(on) : null); };
      const panel = (title, ...kids) => h('div', { style: { border: '1px solid var(--line)', borderRadius: '8px', padding: '8px 10px', background: 'var(--bg2)' } }, h('div', { class: 'mb-2 fw-bold' }, title), ...kids);
      const varMin = on => { const i = h('input', { type: 'number', value: cd.varMin ?? 0, disabled: !on || PDM.varTypeOf(cd.var) !== 'number', style: { width: '64px' }, title: '숫자 변수: 이 값 이상 · 참/거짓 변수: 참일 때 · 문자열 변수: 비어 있지 않을 때' }); i.onchange = () => setIn(['conds', 'varMin'], parseInt(i.value, 10) || 0, '출현 조건'); return h('span', { class: 'hstack gap-2' }, '≥', i); };
      const gch = gr.char && store.has('char:' + gr.char) ? store.get('char:' + gr.char) : null;
      const gcv = h('canvas', { width: 64, height: 64, class: 'checker', style: { imageRendering: 'pixelated', borderRadius: '4px', flex: 'none' } });
      if (gch && gch.sprite && gch.sprite.sheet) PDM.assets.load(gch.sprite.sheet).then(im => { if (!im) return; const fw = (gch.sprite.frame || [16, 16])[0], fh = (gch.sprite.frame || [16, 16])[1], z = Math.max(1, Math.floor(Math.min(64 / fw, 64 / fh))); const g2 = gcv.getContext('2d'); g2.imageSmoothingEnabled = false; g2.drawImage(im, 0, 0, fw, fh, (64 - fw * z) / 2, (64 - fh * z) / 2, fw * z, fh * z); }).catch(() => {});
      const custom = mv.type === 'custom';
      const left = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', width: '330px', flex: 'none' } },
        panel('출현 조건',
          condRow('스위치', 'sw1', swOpts), condRow('스위치', 'sw2', swOpts), condRow('변수', 'var', varOpts, varMin),
          condRow('셀프 스위치', 'self', [['A', 'A'], ['B', 'B'], ['C', 'C'], ['D', 'D']]), condRow('아이템', 'item', itemOpts), condRow('영웅', 'hero', heroOpts),
          F.cond(key, [...P, 'cond'], { label: '조건식 (선택 — 위 조건과 함께 모두 만족해야 함)', hint: '예: switch.bridge_fixed && self.A' })),
        panel('이미지',
          h('div', { class: 'hstack gap-4' }, gcv,
            h('div', { class: 'grow min-0' }, sel(charOpts, gr.char, v => setIn(['graphic', 'char'], v || undefined, '페이지 이미지'), { empty: '(없음 — 보이지 않음)' }),
              h('small', { class: 'hint' }, '캐릭터의 그림을 씁니다. 맵 편집기에서 이 이벤트를 "이벤트" 오브젝트로 놓으면 이 모습으로 나타나고, 페이지가 바뀌면 그림도 바뀝니다. 이미지가 없는 페이지에서는 사라집니다.')))),
        panel('자율 이동',
          h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', margin: '3px 0' } }, h('span', { style: { width: '48px' } }, '유형:'), sel([['fixed', '고정'], ['random', '랜덤'], ['approach', '접근 (영웅에게)'], ['custom', '사용자 지정']], mv.type || 'fixed', v => setIn(['move', 'type'], v, '자율 이동')),
            h('button', { class: 'btn sm', disabled: !custom, onclick: async e => { e.preventDefault(); const r = await PDM.editRouteModal({ route: mv.route || [], repeat: mv.repeat !== false, skip: !!mv.skip }, '이동 루트 — 페이지 ' + (pi + 1)); if (r) store.edit(key, '이동 루트', q => { const m = q.pages[pi].move = q.pages[pi].move || {}; m.route = r.route || []; m.repeat = !!r.repeat; m.skip = !!r.skip; }); } }, '루트…')),
          custom ? h('small', { class: 'hint' }, (mv.route || []).length ? (mv.route || []).map(PDM.routeOpText).join(' → ').slice(0, 120) + (mv.repeat !== false ? ' ↻' : '') : '루트가 비어 있습니다 — "루트…" 를 눌러 만드세요') : null,
          h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', margin: '3px 0' } }, h('span', { style: { width: '48px' } }, '속도:'), sel([[1, '1: x8 느리게'], [2, '2: x4 느리게'], [3, '3: x2 느리게'], [4, '4: 보통'], [5, '5: x2 빠르게'], [6, '6: x4 빠르게']], mv.speed || 3, v => setIn(['move', 'speed'], +v, '이동 속도'))),
          h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', margin: '3px 0' } }, h('span', { style: { width: '48px' } }, '빈도:'), sel([[1, '1: 최저'], [2, '2: 낮음'], [3, '3: 보통'], [4, '4: 높음'], [5, '5: 최고']], mv.freq || 3, v => setIn(['move', 'freq'], +v, '이동 빈도')))),
        panel('옵션',
          F.bool(key, [...P, 'opts', 'dirFix'], { label: '방향 고정 (움직여도 그림을 뒤집지 않음)' }),
          F.bool(key, [...P, 'opts', 'through'], { label: '통과 (벽 · 장애물을 무시하고 이동)' })),
        panel('발동',
          row(F.select(key, [...P, 'trigger'], PDM.TRIGGERS, { label: '', rerender: true })),
          pg.trigger === 'turn' ? F.num(key, [...P, 'turnEvery'], { label: '몇 턴마다', int: true, min: 1 }) : null,
          pg.trigger === 'heart' ? F.ref(key, [...P, 'heartChar'], 'char', { label: '대상 캐릭터' }) : null,
          pg.trigger === 'heart' ? F.cond(key, [...P, 'heartCond'], { label: '마음 조건 (그 캐릭터 기준)', placeholder: 'favor>=800 && abl.intimacy>=3' }) : null,
          ['mobKilled', 'itemPickup'].includes(pg.trigger) ? F.text(key, [...P, 'triggerRef'], { label: pg.trigger === 'mobKilled' ? '몬스터 id (비우면 아무거나)' : '아이템 id' }) : null,
          h('small', { class: 'hint' }, TRIG_HINT[pg.trigger || 'action'] || '')));

      return h('div', { class: 'page' },
        h('div', { class: 'hstack gap-5' }, h('h1', { class: 'grow' }, `${KIND_ICON[ev.kind] || ''} ${ev.name}`),
          h('button', { class: 'btn pri', onclick: () => preview(ev) }, '▶ 미리보기')),
        section('기본',
          row(F.text(key, ['name'], { label: '이름', rerender: true }), F.select(key, ['kind'], PDM.EVENT_KINDS, { label: '종류' })),
          ev.kind === 'daily' ? row(F.num(key, ['daily', 'chance'], { label: '확률(%)', min: 0, max: 100, int: true }), F.num(key, ['daily', 'from'], { label: '층 부터', int: true }), F.num(key, ['daily', 'to'], { label: '층 까지', int: true }), F.bool(key, ['daily', 'once'], { label: '한 번만' })) : null,
          F.textarea(key, ['note'], { label: '메모', rows: 2 })),
        h('p', { class: 'hint' }, '페이지는 번호가 큰 것부터 조건을 검사해서, 처음 맞는 페이지 하나만 동작합니다 (RPG Maker 와 같음).'),
        pageTabs,
        h('div', { class: 'ev-cols mt-4' }, left,   // 좁으면 실행 내용이 아래로 (4차: 예전엔 230px 로 눌려 "명령 8개"가 세로로 쪼개짐)
          h('div', { class: 'ev-cmds' }, panel(`실행 내용 — 페이지 ${pi + 1}`, PDM.commandList(key, [...P, 'commands'])))));
    }
  });
  PDM.events = { newEvent };
})();
