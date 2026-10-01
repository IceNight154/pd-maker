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
    async function setIllust(slot, ref, pos, fade) {
      if (illusts[slot]) { illusts[slot].style.opacity = 0; const old = illusts[slot]; setTimeout(() => old.remove(), 300); delete illusts[slot]; }
      if (!ref) return;
      const abs = PDM.assets.resolvePath(ref); if (!abs) return;
      let url; try { url = await pdm.readDataURL(abs); } catch (_) { log('이미지 없음: ' + ref); return; }
      const img = h('img', { src: url, style: { opacity: 0 } });
      const P = { left: { left: '4%' }, right: { right: '4%' }, center: { left: '50%', transform: 'translateX(-50%)' }, full: { left: 0, top: 0, width: '100%', height: '100%', maxHeight: 'none', objectFit: 'cover' } }[pos || 'center'];
      Object.assign(img.style, P, { transition: `opacity ${(fade || 3) / 10}s` });
      stage.insertBefore(img, box); illusts[slot] = img;
      requestAnimationFrame(() => { img.style.opacity = 1; });
    }
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
            box.hidden = false; box.replaceChildren(who ? h('b', {}, who + (c.face ? ` (${c.face})` : '')) : '', h('div', { style: { whiteSpace: 'pre-wrap' } }, c.text || ''));
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
          case 'illust': await setIllust(c.slot || 1, c.image, c.pos, c.fade); break;
          case 'face': faces[c.char] = c.face || ''; log(`표정: ${PDM.refName('character', c.char)} → ${c.face || '기본'}`); break;
          case 'illustHide': if (!c.slot) Object.keys(illusts).forEach(k => setIllust(k, null)); else await setIllust(c.slot, null); break;
          case 'shake': stage.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${c.power || 3}px,0)` }, { transform: `translate(-${c.power || 3}px,0)` }, { transform: 'translate(0,0)' }], { duration: 120, iterations: Math.max(1, (c.time || 5) / 1.2) }); await wait((c.time || 5) * 100); break;
          case 'flash': stage.animate([{ boxShadow: `inset 0 0 0 400px ${c.color || '#ffffff'}` }, { boxShadow: 'inset 0 0 0 400px transparent' }], { duration: (c.time || 3) * 100 }); await wait((c.time || 3) * 100); break;
          case 'call': { const e2 = store.get('event:' + c.event); if (e2) { if ((await run(e2.pages[0].commands)) === 'stop') return 'stop'; } break; }
          case 'comment': break;
          default: log(`(${def.name || c.cmd} — 게임에서 실행됨)`);
        }
      }
      return 'done';
    }
    const done = PDM.ui.modal('장면 미리보기 — ' + ev.name, h('div', {}, stage, h('div', { class: 'hint', style: { margin: '6px 0' } }, '화면을 클릭하면 대사가 넘어갑니다. 게임 데이터(수치 변경, 이동 등)는 기록만 됩니다.'), logEl), [['닫기', null]]);
    done.then(() => { closed = true; });
    const res = await run(ev.pages[0].commands);
    if (!closed) { box.hidden = false; box.replaceChildren(h('i', {}, res === 'stop' ? '— 이벤트 중지 —' : '— 끝 —')); }
  }
  PDM.previewEvent = preview;

  // =============================================================
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
              menu: [{ label: '미리보기', run: () => preview(e) },
                { label: '복제', run: () => { const c = PDM.clone(e); c.id = e.id + '_copy'; c.name += ' 사본'; if (!store.has('event:' + c.id)) store.add('event:' + c.id, c, '이벤트 복제'); } },
                { label: '삭제', run: async () => { if (await PDM.ui.confirm(`「${e.name}」 이벤트를 삭제할까요?`)) store.remove('event:' + e.id, '이벤트 삭제'); } }] })) };
        }) }];
    },
    render(key, ctx) {
      const ev = store.get(key);
      const { F, section, row } = PDM.ui;
      const st = ctx.st = ctx.st || { page: 0 };
      if (st.page >= ev.pages.length) st.page = 0;
      const pi = st.page, pg = ev.pages[pi], P = ['pages', pi];

      const pageTabs = h('div', { class: 'pages' },
        ev.pages.map((p, i) => h('button', { class: 'chip' + (i === pi ? ' on' : ''), onclick: () => { st.page = i; ctx.refresh(); } }, `페이지 ${i + 1}`)),
        h('button', { class: 'btn sm', onclick: () => { store.edit(key, '페이지 추가', r => { r.pages.push(PDM.make.page()); }); st.page = ev.pages.length - 1; ctx.refresh(); } }, '+ 새 페이지'),
        h('button', { class: 'btn sm', onclick: () => { store.edit(key, '페이지 복사', r => { r.pages.splice(pi + 1, 0, PDM.clone(r.pages[pi])); }); st.page = pi + 1; ctx.refresh(); } }, '페이지 복사'),
        ev.pages.length > 1 ? h('button', { class: 'btn sm danger', onclick: async () => { if (await PDM.ui.confirm(`페이지 ${pi + 1} 을(를) 삭제할까요?`)) { store.edit(key, '페이지 삭제', r => { r.pages.splice(pi, 1); }); st.page = 0; ctx.refresh(); } } }, '페이지 삭제') : null);

      return h('div', { class: 'page' },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } }, h('h1', { style: { flex: 1 } }, `${KIND_ICON[ev.kind] || ''} ${ev.name}`),
          h('button', { class: 'btn pri', onclick: () => preview(ev) }, '▶ 미리보기')),
        section('기본',
          row(F.text(key, ['name'], { label: '이름', rerender: true }), F.select(key, ['kind'], PDM.EVENT_KINDS, { label: '종류' })),
          ev.kind === 'daily' ? row(F.num(key, ['daily', 'chance'], { label: '확률(%)', min: 0, max: 100, int: true }), F.num(key, ['daily', 'from'], { label: '층 부터', int: true }), F.num(key, ['daily', 'to'], { label: '층 까지', int: true }), F.bool(key, ['daily', 'once'], { label: '한 번만' })) : null,
          F.textarea(key, ['note'], { label: '메모', rows: 2 })),
        h('p', { class: 'hint' }, '페이지는 번호가 큰 것부터 조건을 검사해서, 처음 맞는 페이지 하나만 동작합니다 (RPG Maker 와 같음).'),
        pageTabs,
        section(`페이지 ${pi + 1} — 조건 · 트리거`,
          F.cond(key, [...P, 'cond'], { label: '페이지 조건', hint: '예: switch.bridge_fixed && self.A' }),
          row(F.select(key, [...P, 'trigger'], PDM.TRIGGERS, { label: '트리거' }),
            pg.trigger === 'turn' ? F.num(key, [...P, 'turnEvery'], { label: '몇 턴마다', int: true, min: 1 }) : h('span'),
            pg.trigger === 'heart' ? F.ref(key, [...P, 'heartChar'], 'char', { label: '대상 캐릭터' }) : h('span')),
          pg.trigger === 'heart' ? F.cond(key, [...P, 'heartCond'], { label: '마음 조건 (그 캐릭터 기준)', placeholder: 'favor>=800 && abl.intimacy>=3' }) : null,
          ['mobKilled', 'itemPickup'].includes(pg.trigger) ? F.text(key, [...P, 'triggerRef'], { label: pg.trigger === 'mobKilled' ? '몬스터 id (비우면 아무거나)' : '아이템 id' }) : null),
        section(`페이지 ${pi + 1} — 실행 내용`, PDM.commandList(key, [...P, 'commands'])));
    }
  });
  PDM.events = { newEvent };
})();
