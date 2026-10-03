// ================================================================
//  맵 오브젝트 편집기 — 맵에 놓는 물건 (상자·바위·레버·문짝…)
//   'prop:<id>' → props/<id>.json   (런타임: MakerProp)
//   · 그림: 스프라이트 시트 + 프레임 크기 + 게임 배율
//   · 상태 여러 개 (상태마다 그림·막힘 여부·스위치)
//   · 밀 수 있음 (목표 지형 위로 밀면 스위치·이벤트)
//   · 상호작용: 다음 상태로 / 이벤트 실행,  밟았을 때: 다음 상태로 / 이벤트 실행
//   맵·방 템플릿 편집기의 "오브젝트 놓기 → 맵 오브젝트" 로 놓습니다.
// ================================================================
(function () {
  const { h } = PDM;
  const store = PDM.store;

  async function newProp() {
    // 만들 때 바로 정함: id · 이름 · 밀 수 있는(이동 가능) 오브젝트인지
    const idI = h('input', { type: 'text', placeholder: '예: crate, lever, gate, lamp' }), nmI = h('input', { type: 'text', placeholder: '(비우면 id)' }), mv = h('input', { type: 'checkbox' });
    setTimeout(() => idI.focus(), 30);
    const ok = await PDM.ui.modal('새 맵 오브젝트', h('div', { style: { minWidth: '380px' } },
      PDM.ui.field('id (영문 — 파일 이름이 됩니다)', idI), PDM.ui.field('이름', nmI),
      h('label', { class: 'check', style: { marginTop: '8px' } }, mv, '이동 가능 오브젝트 — 영웅이 옆에서 누르면 한 칸씩 밀립니다 (상자 · 바위)'),
      h('p', { class: 'hint' }, '끄면 제자리에 고정된 오브젝트(가로등 · 문 · 레버)가 되고, 대신 "상호작용"을 정할 수 있습니다. 나중에 오브젝트 편집 화면의 "밀기"에서 바꿀 수 있습니다.')), [['취소', false], ['만들기', true, 'pri']]);
    if (!ok) return;
    const clean = PDM.slugId(idI.value);
    if (!clean) { toast('id 를 적어 주세요 (영문)', 'bad'); return; }
    if (store.has('prop:' + clean)) { toast('같은 id 가 있습니다', 'bad'); return; }
    const p = PDM.make.prop(clean); p.name = nmI.value.trim() || idI.value.trim(); p.pushable = mv.checked;
    store.add('prop:' + clean, p, '맵 오브젝트 추가'); PDM.tabs.open('prop:' + clean);
  }
  /** 이 오브젝트를 놓은 맵·방 */
  function usage(id) {
    const out = [];
    store.all('node').forEach(f => { const n = (f.objects || []).filter(o => o.type === 'prop' && o.ref === id).length; if (n) out.push([`node:${f.id}`, `${PDM.World.fullName(f.id)} ×${n}`]); });
    store.all('room').forEach(r => { const n = (r.objects || []).filter(o => o.type === 'prop' && o.ref === id).length; if (n) out.push([`room:${r.id}`, `방 ${r.name} ×${n}`]); });
    return out;
  }
  const frameOf = st => (st.frames && st.frames.length ? st.frames[0] : st.frame) || 0;

  PDM.registerEditor({
    id: 'prop', icon: '📦',
    match: k => k.startsWith('prop:'),
    title: k => { const p = store.get(k); return p ? '오브젝트: ' + p.name : k; },
    watchStructure: k => k.startsWith('prop:'),
    tree() {
      if (!store.isOpen) return [];
      const all = store.all('prop');
      return [{ id: 'prop', label: '맵 오브젝트', icon: '📦', order: 12, count: all.length,
        menu: [{ label: '새 맵 오브젝트…', run: newProp }], actions: [{ label: '＋', title: '새 맵 오브젝트', run: newProp }],
        children: all.map(p => ({ id: 'prop_' + p.id, label: `${p.name} (${p.id})`, icon: p.pushable ? '⇄' : (p.states || []).length > 1 ? '◐' : '▪', open: 'prop:' + p.id,
          menu: [{ label: '복제', run: () => { const c = PDM.clone(p); c.id = p.id + '_copy'; c.name += ' 사본'; if (!store.has('prop:' + c.id)) store.add('prop:' + c.id, c, '맵 오브젝트 복제'); } },
            { label: '삭제', run: async () => { const u = usage(p.id); if (await PDM.ui.confirm(`「${p.name}」 맵 오브젝트를 삭제할까요?` + (u.length ? `\n(놓인 곳 ${u.length}군데 — 그 자리의 오브젝트는 "대상 없음"이 됩니다)` : ''))) store.remove('prop:' + p.id, '맵 오브젝트 삭제'); } }] })) }];
    },
    render(key, ctx) {
      const p = store.get(key);
      if (!p) return h('div', { class: 'page' }, '맵 오브젝트가 없습니다');
      const { F, section, row } = PDM.ui;
      const st = ctx.state = ctx.state || { sel: 0 };
      p.sprite = p.sprite || { sheet: '', frame: [16, 16], scale: 0 };
      if (!Array.isArray(p.foot)) p.foot = [1, 1];   // 예전 오브젝트: 설치 칸 1×1
      const states = p.states || [];
      if (st.sel >= states.length) st.sel = Math.max(0, states.length - 1);
      const fw = Math.max(1, p.sprite.frame[0] || 16), fh = Math.max(1, p.sprite.frame[1] || 16);

      // ---- 시트 보기: 프레임 번호 · 누르면 고른 상태의 그림으로
      const sheetBox = h('div', { class: 'hint' }, p.sprite.sheet ? '불러오는 중…' : '시트를 고르거나 그리면 프레임 번호가 보입니다');
      const previews = [];
      if (p.sprite.sheet) PDM.assets.load(p.sprite.sheet).then(img => {
        sheetBox.innerHTML = '';
        if (!img) { sheetBox.textContent = '그림을 읽을 수 없습니다: ' + p.sprite.sheet; return; }
        const cols = Math.max(1, Math.floor(img.width / fw)), rows = Math.max(1, Math.floor(img.height / fh));
        const k = Math.max(1, Math.min(4, Math.floor(560 / img.width) || 1));
        const cv = h('canvas', { width: img.width * k, height: img.height * k, class: 'checker', style: { imageRendering: 'pixelated', cursor: 'pointer', border: '1px solid var(--line)' },
          title: '프레임을 누르면 고른 상태의 그림이 됩니다',
          onclick: e => { const r = cv.getBoundingClientRect(); const x = Math.floor((e.clientX - r.left) / (fw * k)), y = Math.floor((e.clientY - r.top) / (fh * k)); if (x >= cols || y >= rows || !states.length) return;
            store.edit(key, '상태 그림', o => { o.states[st.sel].frame = y * cols + x; delete o.states[st.sel].frames; }); } });
        const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, img.width * k, img.height * k);
        g.strokeStyle = 'rgba(165,139,255,.6)'; g.font = `${Math.max(8, Math.min(11, fw * k / 3))}px sans-serif`; g.textBaseline = 'top';
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
          g.strokeRect(x * fw * k + .5, y * fh * k + .5, fw * k, fh * k);
          const n = y * cols + x; g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x * fw * k + 1, y * fh * k + 1, g.measureText(String(n)).width + 3, 11); g.fillStyle = '#fff'; g.fillText(String(n), x * fw * k + 2, y * fh * k + 1);
        }
        const cur = states[st.sel] ? frameOf(states[st.sel]) : -1;
        if (cur >= 0) { g.strokeStyle = '#ffd24a'; g.lineWidth = 2; g.strokeRect((cur % cols) * fw * k + 1, Math.floor(cur / cols) * fh * k + 1, fw * k - 2, fh * k - 2); }
        sheetBox.append(cv, h('div', { class: 'hint' }, `${img.width}×${img.height}px · ${cols}×${rows} 프레임 (번호는 왼쪽 위부터)`));
        previews.forEach(([c2, s2]) => { const g2 = c2.getContext('2d'); g2.imageSmoothingEnabled = false; g2.clearRect(0, 0, 48, 48); const k2 = Math.min(48 / fw, 48 / fh); PDM.assets.drawFrame(g2, img, fw, fh, frameOf(s2), (48 - fw * k2) / 2, 48 - fh * k2, k2); });
      });
      const drawSheet = async () => {
        const rel = p.sprite.sheet && !p.sprite.sheet.startsWith('game:') ? p.sprite.sheet : `assets/sprites/props/${p.id}.png`;
        const out = await PDM.editPixelsModal('오브젝트 그림 — ' + p.name, p.sprite.sheet || rel, fw * 4, fh, fw, p.sprite.sheet && p.sprite.sheet.startsWith('game:') ? rel : null, { rowStep: fh });
        if (out) { PDM.assets.invalidate(out); store.edit(key, '오브젝트 그림', o => { o.sprite.sheet = out; }); }
      };

      // ---- 상태 목록
      const stateCards = states.map((s, i) => {
        const cv = h('canvas', { width: 48, height: 48, class: 'checker', style: { imageRendering: 'pixelated', flex: '0 0 48px', borderRadius: '4px' } });
        previews.push([cv, s]);
        const P = ['states', i];
        return h('div', { class: 'li', style: { alignItems: 'flex-start', outline: st.sel === i ? '1px solid var(--accent)' : '' }, onclick: e => { if (st.sel !== i && !/INPUT|BUTTON|SELECT|LABEL/.test(e.target.tagName)) { st.sel = i; ctx.refresh(); } } },
          cv,
          h('div', { class: 'li-body' },
            h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '4px' } }, h('b', {}, `상태 ${i}`),
              (p.start || 0) === i ? h('span', { class: 'badge good' }, '시작 상태') : h('button', { class: 'btn xs', onclick: () => store.edit(key, '시작 상태', o => { o.start = i; }) }, '시작 상태로'),
              st.sel === i ? h('span', { class: 'badge' }, '시트 클릭 → 이 상태의 그림') : null),
            row(F.text(key, [...P, 'name'], { label: '이름' }), F.num(key, [...P, 'frame'], { label: '프레임 번호', int: true, min: 0, rerender: true }),
              F.bool(key, [...P, 'solid'], { label: '막힘 (지나갈 수 없음)' })),
            row(PDM.ui.field('움직이는 그림 (프레임 번호들, 선택)', (() => { const fi = h('input', { type: 'text', value: (s.frames || []).join(', '), placeholder: '예: 0, 1, 2 — 비우면 위 프레임 하나' });
                fi.addEventListener('change', () => store.edit(key, '상태 애니메이션', o => { const a = fi.value.split(/[ ,]+/).filter(Boolean).map(Number).filter(n => !isNaN(n)); if (a.length) o.states[i].frames = a; else delete o.states[i].frames; })); return fi; })()),
              F.num(key, [...P, 'fps'], { label: 'fps', int: true, min: 1, max: 30 }),
              F.ref(key, [...P, 'switch'], 'switch', { label: '이 상태일 때 켜지는 스위치', empty: '(없음)' }))),
          h('div', { class: 'li-tools' },
            h('button', { class: 'ib', title: '위로', disabled: i === 0, onclick: () => store.edit(key, '상태 순서', o => { [o.states[i - 1], o.states[i]] = [o.states[i], o.states[i - 1]]; }) }, '↑'),
            h('button', { class: 'ib', title: '아래로', disabled: i === states.length - 1, onclick: () => store.edit(key, '상태 순서', o => { [o.states[i + 1], o.states[i]] = [o.states[i], o.states[i + 1]]; }) }, '↓'),
            h('button', { class: 'ib danger', title: '삭제', disabled: states.length <= 1, onclick: () => store.edit(key, '상태 삭제', o => { o.states.splice(i, 1); if ((o.start || 0) >= o.states.length) o.start = 0; }) }, '✕')));
      });

      const used = usage(p.id);
      const terrainOpts = [[-1, '(없음)'], ...PDM.TERRAIN.filter(t => t.pass).map(t => [t.id, t.name])];
      return h('div', { class: 'page' },
        h('h1', {}, '📦 ', p.name, h('span', { class: 'hint mono', style: { marginLeft: '10px', fontSize: '12px' } }, p.id)),
        h('p', { class: 'lead' }, '맵에 놓는 물건입니다. 맵·방 템플릿 편집기의 "오브젝트 놓기"에서 「맵 오브젝트」를 골라 놓습니다. 게임에서는 옆에서 그 칸을 누르면 밀거나 상호작용합니다.'),
        section('기본',
          row(F.text(key, ['name'], { label: '이름', rerender: true })),
          F.textarea(key, ['desc'], { label: '살펴볼 때 설명 (선택)', rows: 2 }),
          F.text(key, ['note'], { label: '메모' })),
        section('그림',
          row(F.image(key, ['sprite', 'sheet'], { label: '스프라이트 시트', sub: 'sprites/props', rerender: true }),
            h('div', { class: 'field' }, h('span', { class: 'fl' }, ' '), h('button', { class: 'btn sm', onclick: drawSheet }, p.sprite.sheet ? '시트 그리기/편집…' : '새로 그리기…'))),
          row(F.num(key, ['sprite', 'frame', 0], { label: '프레임 가로(px)', int: true, min: 1, rerender: true }), F.num(key, ['sprite', 'frame', 1], { label: '프레임 세로(px)', int: true, min: 1, rerender: true }),
            F.num(key, ['sprite', 'scale'], { label: '표시 배율 (0 = 설치 칸에 맞춤 · 1 = 그림 크기 그대로)', step: 0.05, min: 0, rerender: true, hint: '한 칸은 16px. 1 이면 16×32 그림이 가로 1칸 × 세로 2칸으로 보입니다 (설치 칸 위로 솟음).' })),
          row(F.num(key, ['foot', 0], { label: '설치 칸 가로', int: true, min: 1, max: 8, def: 1, rerender: true }), F.num(key, ['foot', 1], { label: '설치 칸 세로', int: true, min: 1, max: 8, def: 1, rerender: true }),
            F.num(key, ['sprite', 'ox'], { label: '그림 옮김 → (px)', def: 0 }), F.num(key, ['sprite', 'oy'], { label: '그림 옮김 ↓ (px)', def: 0 })),
          F.bool(key, ['sprite', 'over'], { label: '설치 칸 위로 솟은 부분이 캐릭터를 가림 (가로등 · 나무처럼 뒤에 선 캐릭터 위에 그려짐)' }),
          (() => { const fw = (p.sprite.frame || [16, 16])[0] || 16, fh = (p.sprite.frame || [16, 16])[1] || 16, ft = p.foot || [1, 1], fx = Math.max(1, ft[0] | 0), fy = Math.max(1, ft[1] | 0);
            const sc = p.sprite.scale > 0 ? p.sprite.scale : Math.min(1, fx * 16 / fw, fy * 16 / fh), dw = fw * sc / 16, dh = fh * sc / 16;
            return h('div', { class: 'hint', style: { margin: '2px 0 6px' } }, `설치(막히는 칸): 가로 ${fx} × 세로 ${fy}칸 — 맵에 놓은 칸이 왼쪽 아래.  표시: 가로 ${+dw.toFixed(2)} × 세로 ${+dh.toFixed(2)}칸 (설치 칸의 아래 가운데에 맞춤).`); })(),
          sheetBox),
        section(`상태 (${states.length})`,
          h('p', { class: 'hint' }, '상태마다 그림과 "막힘" 여부를 정합니다. 예) 문짝: 닫힘(막힘) → 열림(지나감), 레버: 꺼짐 → 켜짐(스위치 ON).'),
          h('div', { class: 'listed' }, stateCards),
          h('button', { class: 'btn sm add', style: { marginTop: '6px' }, onclick: () => store.edit(key, '상태 추가', o => { o.states = o.states || []; o.states.push({ name: '상태 ' + o.states.length, frame: (frameOf(o.states[o.states.length - 1] || {}) || 0) + 1, solid: true, switch: '' }); }) }, '+ 상태 추가')),
        section('밀기',
          F.bool(key, ['pushable'], { label: '이동 가능 (밀 수 있음) — 영웅이 옆에서 누르면 반대쪽으로 한 칸 밀립니다. 설치 칸이 여러 칸이면 통째로 밀립니다 (벽·다른 물건·캐릭터·아이템이 있으면 안 밀림)', rerender: true }),
          p.pushable ? h('div', {},
            F.sound(key, ['pushSound'], { label: '밀릴 때 소리', kind: 'se', empty: '(기본: 돌 구르는 소리)' }),
            row(F.select(key, ['goal', 'terrain'], terrainOpts, { label: '목표 지형 (그 위로 밀어 올리면)', number: true, rerender: true }),
              (p.goal || {}).terrain >= 0 ? F.ref(key, ['goal', 'switch'], 'switch', { label: '켜지는 스위치 (벗어나면 꺼짐)', empty: '(없음)' }) : null,
              (p.goal || {}).terrain >= 0 ? F.ref(key, ['goal', 'event'], 'event', { label: '실행할 이벤트', empty: '(없음)' }) : null),
            h('p', { class: 'hint' }, '예) 목표 지형 = 받침대, 스위치 = box_on → 상자를 받침대 위로 밀면 스위치가 켜지고, 그 스위치를 조건으로 문 이벤트를 열 수 있습니다. 밀 수 있는 오브젝트는 누르면 밀리기만 하고 아래 "상호작용"은 쓰이지 않습니다.')) : null),
        p.pushable ? null : section('상호작용 (옆에서 누를 때 — 막힌 상태일 때만)',
          row(F.select(key, ['interact'], { none: '없음', next: '다음 상태로 바뀜', event: '이벤트만 실행' }, { label: '동작', rerender: true }),
            p.interact === 'next' ? F.bool(key, ['loop'], { label: '마지막 상태 다음은 처음으로' }) : null),
          p.interact && p.interact !== 'none' ? row(F.ref(key, ['event'], 'event', { label: p.interact === 'next' ? '바뀐 뒤 실행할 이벤트 (선택)' : '실행할 이벤트', empty: '(없음)' }),
            p.interact === 'next' ? F.sound(key, ['sound'], { label: '바뀔 때 소리', kind: 'se' }) : null) : null,
          p.interact && p.interact !== 'none' ? F.cond(key, ['cond'], { label: '조건 (선택) — 맞을 때만 동작', placeholder: '예: switch.has_key' }) : null),
        section('밟았을 때 (지나갈 수 있는 상태에서 영웅이 올라서면)',
          row(F.select(key, ['stepOn'], { none: '없음', next: '다음 상태로 바뀜 (다음 상태도 지나갈 수 있을 때만)', event: '이벤트만 실행' }, { label: '동작', rerender: true }),
            p.stepOn && p.stepOn !== 'none' ? F.ref(key, ['stepEvent'], 'event', { label: '실행할 이벤트', empty: '(없음)' }) : null)),
        section('놓인 곳', used.length ? h('div', {}, used.map(([k, t]) => h('div', {}, h('a', { href: '#', onclick: e => { e.preventDefault(); PDM.tabs.open(k); } }, t))))
          : h('p', { class: 'hint' }, '아직 놓인 곳이 없습니다. 맵이나 방 템플릿을 열고 왼쪽 "오브젝트 놓기"에서 「맵 오브젝트」를 고르세요.')));
    }
  });
  PDM.propUtil = { newProp, usage };
})();
