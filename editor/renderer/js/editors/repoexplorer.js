// ================================================================
//  게임 저장소 탐색 (11차) — 저장소의 파일 · 클래스 · 게임 데이터 · 번역을 한 화면에서 (읽기 전용)
//    탭 키: 'repoexplorer'  ·  열기: 메뉴 프로젝트 › 게임 저장소 탐색 · 프로젝트 설정 › 게임 저장소 연결
//    자료: PDM.REPO_ANALYSIS (repo-analyzer.js 의 index · objects · modules) — 파일 내용 · 그림 · 소리는 그때그때 읽음
//    game/ 아래 원본 저장소는 읽기만 함 (이 화면에는 저장소 파일을 고치는 동작이 없음).
//    프로젝트로 옮긴 값의 출처(provenance.js)와 다시 맞추기(reposync.js · repomaps.js)는 같은 규칙:
//      사용자가 고친 칸은 지킴 · 원본이 바뀌었는데 사용자 값이 있으면 충돌로 표시 · 저장소에서 사라진 것은 확인한 것만 지움 · 새 것은 더함
// ================================================================
(function () {
  const h = PDM.h;
  const K = 'repoexplorer';
  const KIND = { java: ['☕', 'Java'], kotlin: ['K', 'Kotlin'], gradle: ['🐘', 'Gradle'], props: ['🌐', '글자(properties)'], image: ['🖼', '그림'], audio: ['♪', '소리'], font: ['F', '글꼴'], text: ['≡', '글자 파일'], other: ['·', '기타'] };
  const TABS = [['files', '📁 파일'], ['classes', '☕ 클래스'], ['data', '🎮 게임 데이터'], ['texts', '🌐 번역']];
  const MAX = 400;   // 목록에 한 번에 그리는 줄 수 (더 보기)
  const R = () => PDM.REPO_ANALYSIS;
  const abs = rel => pdm.join(R().root, ...String(rel).split('/'));
  const badge = (cls, txt, title) => h('span', { class: 'badge ' + cls, title: title || '' }, txt);
  const SRC = { repo: ['good', '원본'], derived: ['info', '추론'], none: ['', '없음'] };
  const EDIT = { yes: ['good', '편집 가능'], part: ['warn', '일부 편집'], no: ['', '읽기 전용'] };
  const srcBadge = (k, t) => badge(SRC[k][0], SRC[k][1], t);
  const editBadge = (k, t) => badge(EDIT[k][0], EDIT[k][1], t);

  // ------------------------------------------------------------ 자료 (분석 결과에서)
  let memo = null;
  function data() {
    const rep = R(); if (!rep) return null;
    if (memo && memo.rep === rep) return memo;
    const idx = rep.index || { files: [], classes: [] };
    const byName = new Map(); idx.classes.forEach(c => (byName.get(c.n) || byName.set(c.n, []).get(c.n)).push(c));
    const kids = new Map(); idx.classes.forEach(c => { if (c.p) (kids.get(c.p) || kids.set(c.p, []).get(c.p)).push(c); });
    // 그림 · 소리 파일 → 쓰는 곳 (게임 데이터)
    const roots = (rep.resources || {}).roots || [], uses = new Map();
    const use = (key, what) => { if (!key) return; for (const a of roots) { const p = a + '/' + key; (uses.get(p) || uses.set(p, []).get(p)).push(what); } };
    const O = rep.objects || {};
    (O.heroes || []).forEach(x => use(x.sheet, `영웅 ${x.name || x.cls} 시트`));
    (O.mobs || []).forEach(m => { if (m.sprite && m.sprite.sheet) use(m.sprite.sheet, `${m.displayName || m.name || m.simple} 그림`); });
    if (rep.itemSheet && rep.itemSheet.image) use(rep.itemSheet.image, '아이템 시트');
    if (O.badges && O.badges.sheet) use(O.badges.sheet.file, '배지 시트');
    ((O.title || {}).music || []).forEach(m => use(m.file, '타이틀 음악'));
    memo = { rep, idx, byName, kids, uses };
    return memo;
  }
  /** 이름 → 클래스 (같은 이름이 여럿이면 같은 폴더 쪽) */
  function resolve(name, from) {
    const D = data(), l = D.byName.get(String(name || '').split('.').pop()) || []; if (!l.length) return null;
    if (l.length === 1 || !from) return l[0];
    const dir = f => f.split('/').slice(0, -1).join('/');
    return l.find(c => dir(c.f) === dir(from.f)) || l[0];
  }
  const ancestry = c => { const out = []; let cur = c, g = 0; while (cur && cur.p && g++ < 30) { const nx = resolve(cur.p, cur); out.push(nx || { n: cur.p, missing: true }); cur = nx; } return out; };

  // ------------------------------------------------------------ 공용: 파일 보기 (오른쪽)
  async function preview(box, rel, line) {
    box.innerHTML = ''; const D = data(), f = D.idx.files.find(x => x.p === rel) || { p: rel, k: 'other' };
    const head = h('div', { class: 'rx-head' }, h('b', { class: 'mono', style: { userSelect: 'text', wordBreak: 'break-all' } }, rel),
      h('span', { class: 'ra-note ml-3' }, `${KIND[f.k] ? KIND[f.k][1] : f.k} · ${fmtB(f.b)}${f.w ? ` · ${f.w}×${f.h}` : ''}${f.s ? ' · ' + f.s : ''}`), badge('', '읽기 전용', 'game/ 아래 원본 저장소는 PDMaker 가 고치지 않습니다'),
      pdm.isElectron ? h('button', { class: 'btn xs ml-3', onclick: () => pdm.showInFolder(abs(rel)).catch(e => PDM.toast(e.message, 'bad')) }, '폴더에서 보기') : null);
    box.append(head);
    const used = D.uses.get(rel); if (used) box.append(h('div', { class: 'ra-note' }, '쓰는 곳: ' + used.slice(0, 12).join(' · ') + (used.length > 12 ? ` 외 ${used.length - 12}` : '')));
    const cls = D.idx.classes.filter(c => c.f === rel);
    if (cls.length) box.append(h('div', { class: 'rx-chips' }, ...cls.map(c => h('button', { class: 'btn xs', onclick: () => go({ tab: 'classes', cls: c.n, clsFile: c.f }) }, `${c.k} ${c.n}${c.p ? ' : ' + c.p : ''}`))));
    try {
      if (f.k === 'image') { const url = await pdm.readDataURL(abs(rel)); box.append(h('div', { class: 'rx-img' }, h('img', { src: url, style: { imageRendering: 'pixelated', maxWidth: '100%', minWidth: Math.min(512, (f.w || 64) * 2) + 'px' } }))); return; }
      if (f.k === 'audio') { const url = await pdm.readDataURL(abs(rel)); box.append(h('audio', { controls: true, src: url, style: { width: '100%' } })); return; }
      if (f.k === 'font' || f.k === 'other' && f.b > 512 * 1024) { box.append(h('div', { class: 'ra-note' }, '미리 보기 없음 (이진 파일)')); return; }
      const txt = await pdm.readText(abs(rel)), lines = txt.split('\n'), cut = lines.length > 4000;
      const pre = h('pre', { class: 'code-view rx-code' }, (cut ? lines.slice(0, 4000) : lines).map((l, i) => h('div', { class: line && i + 1 === line ? 'mark' : '' }, h('i', {}, String(i + 1)), l || ' ')));
      box.append(pre, cut ? h('div', { class: 'ra-note' }, `처음 4000줄만 (전체 ${lines.length}줄)`) : null);
      if (line) setTimeout(() => { const m = pre.querySelector('.mark'); if (m) m.scrollIntoView({ block: 'center' }); }, 30);
    } catch (e) { box.append(h('div', { class: 'c-warn' }, '읽지 못함: ' + (e && e.message || e))); }
  }
  const fmtB = b => b == null ? '' : b < 1024 ? b + 'B' : b < 1048576 ? (b / 1024).toFixed(1) + 'KB' : (b / 1048576).toFixed(1) + 'MB';

  // ------------------------------------------------------------ 탭: 파일 (폴더 트리 · 검색 · 종류)
  function filesTab(st, left, right) {
    const D = data(), q = (st.q || '').toLowerCase(), kf = st.kind || '';
    const list = D.idx.files.filter(f => (!kf || f.k === kf) && (!q || f.p.toLowerCase().includes(q)));
    const counts = {}; D.idx.files.forEach(f => { counts[f.k] = (counts[f.k] || 0) + 1; });
    left.append(h('div', { class: 'rx-filters' },
      ...[['', `모두 ${D.idx.files.length}`]].concat(Object.keys(KIND).filter(k => counts[k]).map(k => [k, `${KIND[k][0]} ${counts[k]}`])).map(([k, l]) =>
        h('button', { class: 'btn xs' + (kf === k ? ' pri' : ''), title: k ? KIND[k][1] : '모든 종류', onclick: () => { st.kind = k; refresh(); } }, l))));
    if (q || kf) {
      left.append(h('div', { class: 'ra-note' }, `${list.length}개`), ...list.slice(0, st.more || MAX).map(f => fileRow(st, f, f.p)),
        list.length > (st.more || MAX) ? h('button', { class: 'btn xs', onclick: () => { st.more = (st.more || MAX) + MAX; refresh(); } }, '더 보기') : null);
    } else {
      // 폴더 트리 (펼친 폴더 기억)
      const open = st.open = st.open || {};
      const tree = {}; D.idx.files.forEach(f => { let n = tree; const ps = f.p.split('/'); ps.slice(0, -1).forEach(p => { n = n[p] = n[p] || {}; }); (n.__f = n.__f || []).push(f); });
      const count = n => Object.keys(n).filter(k => k !== '__f').reduce((a, k) => a + count(n[k]), (n.__f || []).length);
      const draw = (n, path, depth) => {
        const out = [];
        Object.keys(n).filter(k => k !== '__f').sort().forEach(k => {
          const p = path ? path + '/' + k : k, on = !!open[p];
          out.push(h('div', { class: 'rx-row dir', style: { paddingLeft: depth * 12 + 'px' }, onclick: () => { open[p] = !on; refresh(); } }, (on ? '▾ ' : '▸ ') + k + '/', h('span', { class: 'ra-note ml-2' }, String(count(n[k])))));
          if (on) out.push(...draw(n[k], p, depth + 1));
        });
        (n.__f || []).sort((a, b) => a.p.localeCompare(b.p)).forEach(f => out.push(fileRow(st, f, f.p.split('/').pop(), depth)));
        return out;
      };
      left.append(...draw(tree, '', 0));
    }
    if (st.file) preview(right, st.file, st.line); else right.append(h('div', { class: 'ra-note' }, '왼쪽에서 파일을 고르면 내용 · 그림 · 소리를 봅니다. 위 검색칸 = 경로로 찾기'));
  }
  const fileRow = (st, f, label, depth) => h('div', { class: 'rx-row' + (st.file === f.p ? ' on' : ''), style: { paddingLeft: (depth || 0) * 12 + 'px' }, title: f.p, onclick: () => { st.file = f.p; st.line = 0; refresh(); } },
    (KIND[f.k] || KIND.other)[0] + ' ' + label, h('span', { class: 'ra-note ml-2' }, f.w ? `${f.w}×${f.h}` : fmtB(f.b)), data().uses.has(f.p) ? h('span', { class: 'badge info ml-2', title: data().uses.get(f.p).join(' · ') }, '쓰임') : null);

  // ------------------------------------------------------------ 탭: 클래스 (상속)
  function classesTab(st, left, right) {
    const D = data(), q = (st.q || '').toLowerCase(), base = st.base || '';
    const isA = (c, b) => ancestry(c).some(x => x.n === b);
    const list = D.idx.classes.filter(c => (!q || c.n.toLowerCase().includes(q) || c.f.toLowerCase().includes(q)) && (!base || isA(c, base)) && (st.ck ? c.k === st.ck || (st.ck === 'abstract' && c.a) : true));
    left.append(h('div', { class: 'rx-filters' },
      ...[['', '모두'], ['Mob', 'Mob 계열'], ['Item', 'Item 계열'], ['Level', 'Level 계열'], ['Buff', 'Buff 계열'], ['Window', 'Window 계열'], ['PixelScene', '화면(Scene)']].map(([b, l]) => h('button', { class: 'btn xs' + (base === b ? ' pri' : ''), onclick: () => { st.base = b; st.more = 0; refresh(); } }, l)),
      ...[['', '종류 모두'], ['enum', 'enum'], ['interface', 'interface'], ['abstract', 'abstract']].map(([k, l]) => h('button', { class: 'btn xs' + ((st.ck || '') === k ? ' pri' : ''), onclick: () => { st.ck = k; refresh(); } }, l))));
    left.append(h('div', { class: 'ra-note' }, `${list.length}개`), ...list.slice(0, st.more || MAX).map(c => h('div', { class: 'rx-row' + (st.cls === c.n && st.clsFile === c.f ? ' on' : ''), title: c.f, onclick: () => { st.cls = c.n; st.clsFile = c.f; refresh(); } },
      `${c.k === 'enum' ? 'E' : c.k === 'interface' ? 'I' : c.a ? 'A' : 'C'} ${c.o ? c.o + '.' : ''}${c.n}`, c.p ? h('span', { class: 'ra-note ml-2' }, ': ' + c.p) : null)),
      list.length > (st.more || MAX) ? h('button', { class: 'btn xs', onclick: () => { st.more = (st.more || MAX) + MAX; refresh(); } }, '더 보기') : null);
    const c = st.cls ? D.idx.classes.find(x => x.n === st.cls && (!st.clsFile || x.f === st.clsFile)) : null;
    if (!c) { right.append(h('div', { class: 'ra-note' }, '왼쪽에서 클래스를 고르면 상속 관계와 원본 코드를 봅니다')); return; }
    const anc = ancestry(c), sub = D.kids.get(c.n) || [];
    const link = x => x.missing ? h('span', { class: 'mono c-warn', title: '저장소에 없는 클래스 (라이브러리 · 게임 엔진)' }, x.n) : h('a', { class: 'mono pointer', onclick: () => go({ tab: 'classes', cls: x.n, clsFile: x.f }) }, x.n);
    const box = h('div', {});
    right.append(h('div', { class: 'kv' },
      h('b', {}, '클래스'), h('span', { class: 'mono' }, `${c.k}${c.a ? ' (abstract)' : ''} ${c.o ? c.o + '.' : ''}${c.n}`),
      h('b', {}, '파일'), h('a', { class: 'mono pointer', onclick: () => go({ tab: 'files', file: c.f, line: c.l }) }, `${c.f}:${c.l}`),
      h('b', {}, '부모'), h('span', {}, ...(anc.length ? anc.flatMap((x, i) => [i ? ' → ' : '', link(x)]) : ['없음'])),
      h('b', {}, `자식 ${sub.length}`), h('span', {}, ...(sub.length ? sub.slice(0, 60).flatMap((x, i) => [i ? ', ' : '', link(x)]) : ['없음']), sub.length > 60 ? ` 외 ${sub.length - 60}` : '')),
      semanticOf(c), box);
    preview(box, c.f, c.l);
  }
  /** 이 클래스가 게임 데이터의 무엇인지 (영웅 직업 · 몬스터 · 아이템 · 층) */
  function semanticOf(c) {
    const O = R().objects || {}, out = [];
    const mob = (O.mobs || []).find(m => m.file === c.f && m.simple === c.n); if (mob) out.push(`캐릭터 「${mob.displayName || mob.name || mob.simple}」 (${(mob.classify || {}).category || '?'})`);
    const it = (O.items || []).find(m => m.file === c.f && m.simple === c.n); if (it) out.push(`아이템 「${it.name || it.simple}」`);
    const lv = ((O.maps || {}).levels || {})[c.n]; if (lv) out.push(`층 클래스 (${lv.generator})`);
    if (/HeroClass\.java$/.test(c.f)) out.push('영웅 직업 목록 (HeroClass)');
    return out.length ? h('div', { class: 'ra-note mb-2' }, '게임 데이터: ' + out.join(' · ')) : null;
  }

  // ------------------------------------------------------------ 탭: 게임 데이터 (의미)
  const GROUPS = [['maps', '맵'], ['heroes', '영웅'], ['mobs', '몬스터'], ['bosses', '보스'], ['items', '아이템'], ['badges', '배지'], ['title', '타이틀'], ['ui', 'UI'], ['audio', '소리'], ['build', '빌드 모듈']];
  function dataTab(st, left, right) {
    const g = st.group || 'maps', q = (st.q || '').toLowerCase();
    left.append(h('div', { class: 'rx-filters' }, ...GROUPS.map(([k, l]) => h('button', { class: 'btn xs' + (g === k ? ' pri' : ''), onclick: () => { st.group = k; st.pick = null; refresh(); } }, l))));
    const rows = dataRows(g).filter(r => !q || (r.label + ' ' + (r.sub || '')).toLowerCase().includes(q));
    left.append(h('div', { class: 'ra-note' }, `${rows.length}개`), ...rows.slice(0, st.more || MAX).map((r, i) => h('div', { class: 'rx-row' + (st.pick === r.id ? ' on' : ''), onclick: () => { st.pick = r.id; refresh(); } },
      r.label, r.src ? srcBadge(r.src, r.srcNote) : null, r.edit ? editBadge(r.edit, r.editNote) : null, r.status ? h('span', { class: 'ra-note ml-2' }, r.status) : null)));
    const r = rows.find(x => x.id === st.pick);
    if (!r) { right.append(h('div', { class: 'ra-note' }, '저장소 원본에서 읽은 값(원본) · 규칙으로 정한 값(추론) · PDMaker 에서 고칠 수 있는지를 함께 봅니다. 고르면 근거(파일 · 줄)와 편집기 바로가기')); return; }
    right.append(h('h3', {}, r.label), h('div', { class: 'kv' }, ...(r.kv || []).flatMap(([k, v]) => [h('b', {}, k), h('span', { class: 'mono', style: { userSelect: 'text', wordBreak: 'break-all' } }, v == null ? '-' : String(v))])),
      ...(r.notes || []).map(n => h('div', { class: 'ra-note' }, n)),
      h('div', { class: 'btnbar mt-3' },
        r.file ? h('button', { class: 'btn sm', onclick: () => go({ tab: 'files', file: r.file, line: r.line }) }, '원본 보기') : null,
        ...(r.open || []).map(([l, fn]) => h('button', { class: 'btn sm pri', onclick: fn }, l))),
      r.prov ? provBox(r.prov) : null);
  }
  /** 프로젝트 리소스의 출처 상태 (provenance) — 사용자 편집 · 충돌 */
  function provBox(key) {
    const o = PDM.store.get(key); if (!o || !PDM.prov) return null;
    const S = PDM.prov.summary(o); if (!S.length) return h('div', { class: 'ra-note mt-3' }, '이 리소스에는 저장소 출처 기록이 없습니다 (직접 만든 것 · 예전 프로젝트)');
    const n = k => S.filter(s => s.status === k).length, conf = S.filter(s => s.conflict).length;
    return h('div', { class: 'mt-3' }, h('b', {}, '프로젝트 값의 출처 '), h('span', { class: 'ra-note' }, `원본 ${n('repo')} · 추론 ${n('derived')} · 사용자 편집 ${n('user')}${conf ? ` · 충돌 ${conf} (원본이 바뀌었는데 사용자 값이 있음 — 편집기의 출처 상자에서 고름)` : ''}`),
      ...S.map(s => h('div', { class: 'ra-note mono' }, `${s.path} — ${s.label}${s.conflict ? ' ⚠ 충돌' : ''}${s.file ? ' · ' + s.file + (s.line ? ':' + s.line : '') : ''}${s.note ? ' · ' + s.note : ''}`)));
  }
  const open = k => () => PDM.tabs.open(k);
  function dataRows(g) {
    const rep = R(), O = rep.objects || {}, store = PDM.store, out = [];
    if (g === 'maps') {
      const pl = PDM.repoMaps ? PDM.repoMaps.plan() : null, inGraph = id => store.has('node:' + id);
      (PDM.repoMaps ? PDM.repoMaps.list() : []).forEach(s => { const f = PDM.repoMaps.facts(s), l = s.level;
        const st = !s.extra ? '기본 층 노드가 대신' : s.ids.every(inGraph) ? '그래프에 있음' : pl && pl.dismissed.some(d => s.ids.includes(d.id)) ? '사용자가 지움' : '그래프에 없음';
        out.push({ id: 'map:' + s.i, label: `${s.cls} — ${s.depth.join(',') || '-'}층`, sub: s.conds.join(' '), src: 'repo', srcNote: 'Dungeon.newLevel()', edit: f.editable === 'tiles' ? 'yes' : 'part', editNote: f.editableNote, status: f.mapTypes.map(t => PDM.repoMaps.TYPE_LABEL[t] || t).join('·') + ' · ' + st,
          file: l ? l.file : rep.objects.maps.file, line: l ? l.line : s.line, kv: [['유형', f.mapTypes.join(', ')], ['편집', f.editableNote], ['그래프', st], ['조건', s.conds.join(' 그리고 ') || '없음']], notes: f.evidence.map(e => `근거 · ${e.kind} — ${e.file}:${e.line} — ${e.text}`),
          open: s.ids.filter(inGraph).slice(0, 4).map(id => [`노드 ${id} 열기`, open('node:' + id)]) });
      });
      (pl ? pl.missing : []).forEach(m => out.push({ id: 'miss:' + m.id, label: `⚠ ${m.id} — ${m.cls}`, status: '저장소에 없음 (지우지 않음)', kv: [['노드', m.id], ['고침', m.touched ? '타일을 고침' : '-']], open: [['노드 열기', open('node:' + m.id)], ['확인 · 지우기…', () => PDM.repoMaps.confirmMissing()]] }));
    } else if (g === 'heroes') {
      const HS = O.heroSprite, IC = O.heroSelectIcons || {};
      (O.heroes || []).forEach(x => { const hr = store.all('hero').find(q => q.baseClass === x.cls), ic = IC[x.cls] || IC['*'];
        out.push({ id: 'hero:' + x.cls, label: `${x.name || x.cls} (${x.cls})${x.hidden ? ' · 감춤' : ''}`, src: x.nameSource === 'repo' ? 'repo' : 'derived', srcNote: x.nameSource === 'repo' ? '번역 파일의 이름' : '번역이 없어 enum 이름', edit: hr ? 'part' : 'no', editNote: hr ? '이름 · 그림 · 시작 아이템 · 특성은 PDMaker 데이터로 덮어씀 — 게임 코드 동작은 그대로' : '프로젝트에 이 직업 영웅이 없음 (저장소에 맞추기로 더함)',
          status: hr ? '프로젝트: ' + hr.id : '프로젝트에 없음', file: x.file, line: x.line,
          kv: [['시트', `${x.sheet || '-'}${x.sheetSize ? ' (' + x.sheetSize.join('×') + ')' : ''} · ${x.spriteKind}`], ['칸 · 줄 높이', HS ? `${HS.frame.join('×')} · ${HS.rowH} (${HS.evidence.frame})` : '-'], ['동작', HS ? Object.entries(HS.anims).map(([k, a]) => `${k} ${a.frames.length}칸@${a.fps}`).join(' · ') : '-'], ['선택 아이콘', ic ? (ic.kind === 'icons' ? 'Icons.' + ic.name : '시트 ' + ic.rect.join(',')) : '-'], ['번역 키', x.nameKey]],
          open: hr ? [['영웅 편집기', open('hero:' + hr.id)]] : [['저장소에 맞추기…', () => PDM.repoSync.dialog()]], prov: hr ? 'hero:' + hr.id : null });
      });
    } else if (g === 'mobs' || g === 'bosses') {
      const boss = m => /boss/.test((m.classify || {}).category || '');
      (O.mobs || []).filter(m => !m.abstract && !m.base && (g === 'bosses' ? boss(m) : !boss(m))).forEach(m => { const c = store.all('char').find(q => q.game === m.cls), cl = m.classify || {};
        out.push({ id: 'mob:' + m.cls, label: `${m.displayName || m.name || m.simple} (${m.cls})`, sub: m.parent, src: m.nameSource === 'repo' ? 'repo' : 'derived', srcNote: m.nameSource === 'repo' ? '번역 파일의 이름' : '번역이 없어 클래스 이름', edit: c ? 'part' : m.convertible ? 'no' : 'no', editNote: c ? '이름 · 그림 · 능력치 · 분류는 PDMaker 데이터 — 행동 코드는 게임 그대로' : m.convertible ? '프로젝트에 없음 (저장소에 맞추기로 더함)' : (m.reasons || []).join(' · '),
          status: `${cl.category || '?'}${cl.confidence ? ' (' + cl.confidence + ')' : ''}${m.spriteOk ? '' : ' · 그림 없음'}`, file: m.file, line: m.line,
          kv: [['부모', m.parent], ['분류', `${cl.category} · 확신 ${cl.confidence || '-'} — ${(cl.evidence || []).map(e => e.kind).join(', ') || '근거 없음'}`], ['그림', m.spriteOk ? `${m.sprite.sheet} ${m.sprite.frame.join('×')} (${m.spriteKind})` : '없음 — ' + (m.reasons || []).join(' · ')], ['능력치', JSON.stringify(m.stats || {})]],
          open: c ? [['캐릭터 편집기', open('char:' + c.id)]] : [], prov: c ? 'char:' + c.id : null });
      });
    } else if (g === 'items') {
      const G = Object.values(PDM.SPD_ITEM_GROUPS || {}).flat(), byP = new Map(G.map(x => [x.p, x]));
      (O.items || []).filter(i => !i.abstract && !i.base).forEach(i => { const gi = byP.get(i.cls);
        out.push({ id: 'item:' + i.cls, label: `${i.name || i.simple} (${i.cls})`, src: i.name ? 'repo' : 'derived', edit: gi ? 'part' : 'no', editNote: gi ? '게임 아이템 — 그림 · 드랍 · 등장 금지 · 공격 모션은 PDMaker 에서' : (i.reasons || []).join(' · ') || '목록에 없음',
          status: i.image ? `그림 ${i.image}${i.inSheet === false ? ' (시트 밖)' : ''}` : '그림 상수 없음', file: i.file, line: i.line, kv: [['부모', i.parent], ['그림', i.image ? `${i.image} (${i.imageFrom || '자기'})` : '-'], ['변환', i.convertible ? '가능' : '불가 — ' + (i.reasons || []).join(' · ')]],
          open: gi ? [['게임 아이템 편집', open('spditem:' + i.cls)]] : [] });
      });
    } else if (g === 'badges') {
      const B = O.badges || {}; (B.list || []).forEach(b => out.push({ id: 'badge:' + b.id, label: `${b.name || b.id}`, src: b.nameSource === 'repo' ? 'repo' : 'derived', edit: 'part', editNote: '배지 편집기 — 이름 · 설명 · 그림 · 조건 표시',
        status: b.conds && b.conds.length ? `조건 ${b.conds.length}` : '조건 못 읽음', file: B.file, line: b.line, kv: [['id', b.id], ['그림 칸', b.noImage ? '없음' : b.image], ['조건', (b.conds || []).map(c => `${c.method}:${c.line}`).join(', ') || '-']], open: [['배지 편집기', open('badges')]] }));
    } else if (g === 'title') {
      const T = O.title || {};
      out.push({ id: 'title', label: '타이틀 화면 (TitleScene)', src: 'repo', edit: 'part', editNote: '타이틀 편집기 — PDMaker 타이틀을 켜면 바꿈, 끄면 게임 그대로', file: (rep.objects.scenes || []).find(s => s.cls === 'TitleScene') ? rep.objects.scenes.find(s => s.cls === 'TitleScene').file : '', line: T.line,
        kv: [['배경', (T.background || []).join(', ')], ['음악', (T.music || []).map(m => m.file).join(', ')], ['로고', JSON.stringify(T.logo || {})], ['버튼', String((T.buttons || []).length || '-')]], open: [['타이틀 편집기', open('title')]] });
    } else if (g === 'ui') {
      (O.scenes || []).forEach(s => out.push({ id: 'scene:' + s.cls, label: `화면 ${s.cls}`, src: 'repo', edit: 'no', editNote: '게임 화면 코드 — PDMaker 는 UI 테마 · 그림 바꾸기만', file: s.file, line: s.line, kv: [['부모', s.parent]], open: [['UI 그림', open('uiart')], ['게임 UI 테마', open('theme')]] }));
      (O.windows || []).forEach(s => out.push({ id: 'wnd:' + s.cls, label: `창 ${s.cls}`, src: 'repo', edit: 'no', file: s.file, line: s.line, kv: [['부모', s.parent]] }));
    } else if (g === 'audio') {
      data().idx.files.filter(f => f.k === 'audio').forEach(f => out.push({ id: 'aud:' + f.p, label: f.p.split('/').pop(), sub: f.p, src: 'repo', edit: 'part', editNote: '소리 편집기에서 프로젝트 소리로 바꿀 수 있음 (원본은 그대로)', status: fmtB(f.b), file: f.p, kv: [['경로', f.p]], open: [['소리 편집기', open('sounds')]] }));
    } else if (g === 'build') {
      const B = rep.build || {};
      out.push({ id: 'build', label: `${B.appName || rep.name} ${B.appVersionName || ''}`, src: 'repo', edit: 'no', file: B.buildFile, kv: [['패키지', B.appPackageName], ['gdx', B.gdxVersion], ['Gradle', B.gradleVersion], ['Java', B.javaCompat]] });
      (rep.modules || []).forEach(m => out.push({ id: 'mod:' + m.name, label: `모듈 ${m.name}`, src: 'repo', edit: 'no', status: m.exists ? '' : '폴더 없음', file: m.buildFile, kv: [['폴더', m.dir], ['소스', (m.java || []).join(', ')], ['에셋', (m.assets || []).join(', ')], ['의존', (m.dependsOn || []).join(', ')], ['라이브러리', (m.libraries || []).join(', ')]] }));
    }
    return out;
  }

  // ------------------------------------------------------------ 탭: 번역 (messages 검색)
  let msgs = null;
  async function loadMessages() {
    const rep = R(); if (msgs && msgs.rep === rep) return msgs.list;
    const files = data().idx.files.filter(f => f.k === 'props' && /\/messages\//.test(f.p) && !/\.bak$/.test(f.p)), list = [];
    for (const f of files) {
      let txt = ''; try { txt = await pdm.readText(abs(f.p)); } catch (_) { continue; }
      const lang = (/_([a-z]{2}(?:[-_][A-Za-z]+)?)\.properties$/.exec(f.p) || [, '기본'])[1];
      txt.split(/\r?\n/).forEach((l, i) => { const m = /^\s*([^#!=:\s][^=:]*?)\s*[=:]\s*(.*)$/.exec(l); if (m) list.push({ k: m[1], v: m[2], f: f.p, l: i + 1, lang }); });
    }
    msgs = { rep, list }; return list;
  }
  function textsTab(st, left, right) {
    const q = (st.q || '').toLowerCase();
    if (!q) { left.append(h('div', { class: 'ra-note' }, '위 검색칸에 번역 키나 글자를 넣으세요 (예: heroclass.warrior · 블레이즈)')); }
    loadMessages().then(list => {
      const langs = [...new Set(list.map(x => x.lang))].sort();
      left.prepend(h('div', { class: 'rx-filters' }, ...[''].concat(langs).map(l => h('button', { class: 'btn xs' + ((st.lang || '') === l ? ' pri' : ''), onclick: () => { st.lang = l; refresh(); } }, l || `언어 모두 (${list.length}줄)`))));
      if (!q) return;
      const hit = list.filter(x => (!st.lang || x.lang === st.lang) && (x.k.toLowerCase().includes(q) || x.v.toLowerCase().includes(q)));
      left.append(h('div', { class: 'ra-note' }, `${hit.length}개`), ...hit.slice(0, MAX).map(x => h('div', { class: 'rx-row', title: `${x.f}:${x.l}`, onclick: () => { st.file = x.f; st.line = x.l; right.innerHTML = ''; preview(right, x.f, x.l); } },
        h('span', { class: 'mono' }, x.k), h('span', { class: 'ra-note ml-2' }, `[${x.lang}] ${x.v.slice(0, 80)}`))));
    });
    if (st.file && /\.properties$/.test(st.file)) preview(right, st.file, st.line);
  }

  // ------------------------------------------------------------ 화면
  let cur = null;
  const refresh = () => { if (cur) cur.refresh(); };
  /** 다른 탭으로 이동 (파일 · 클래스) */
  function go(o) { if (!cur) { PDM.tabs.open(K); setTimeout(() => go(o), 50); return; } Object.assign(cur.state, o); if (o.tab) cur.state.q = ''; cur.state.more = 0; refresh(); }
  function render(key, ctx) {
    cur = ctx; const st = ctx.state = ctx.state || { tab: 'files' };
    const page = h('div', { class: 'page rx-page' });
    const rep = R();
    page.append(h('h1', {}, '🔎 게임 저장소 탐색', rep ? h('span', { class: 'hint ml-4 mono' }, rep.root) : null, badge('ml-4', '읽기 전용', 'game/ 아래 원본 저장소는 PDMaker 가 고치지 않습니다')));
    if (!rep) {
      page.append(h('div', { class: 'box c-warn' }, pdm.analyzeRepo ? '아직 이 프로젝트의 게임 저장소를 분석하지 않았습니다.' : '이 실행 환경(웹 모드)에는 저장소 분석기가 없습니다 — Electron 편집기에서 여세요.'),
        pdm.analyzeRepo ? h('button', { class: 'btn pri mt-3', onclick: async () => { const dir = await PDM.app.resolveRepo(true); if (dir) { await PDM.gameScan(dir, true); refresh(); } } }, '저장소 분석') : null);
      return page;
    }
    if (!rep.index) page.append(h('div', { class: 'box c-warn' }, '이 분석 결과에는 파일 · 클래스 색인이 없습니다 (예전 분석기). ', h('button', { class: 'btn xs', onclick: async () => { await PDM.gameScan(rep.root, true); memo = null; refresh(); } }, '다시 분석')));
    const P = rep.profile || {};
    page.append(h('div', { class: 'ra-note mb-2' }, `${rep.name || ''} · 프로파일 ${P.id || '?'} · 파일 ${(rep.index || {}).files ? rep.index.files.length : '?'} · 클래스 ${(rep.index || {}).classes ? rep.index.classes.length : '?'} · 분석 ${String(rep.generatedAt || '').slice(0, 19).replace('T', ' ')}${rep.cached ? ' (저장된 결과)' : ''}`),
      h('div', { class: 'btnbar mb-3' },
        h('button', { class: 'btn sm', title: '영웅 · 캐릭터를 저장소 값에 맞춤 — 사용자가 고친 칸은 지키고, 충돌은 보여 주고, 사라진 것은 고른 것만 지움', onclick: () => PDM.repoSync && PDM.repoSync.dialog().then(() => refresh()) }, '영웅 · 캐릭터 다시 맞추기…'),
        h('button', { class: 'btn sm', title: '저장소 맵 중 그래프에 없는 새 맵만 더함 (지우지 않음)', onclick: () => { PDM.repoMaps && PDM.repoMaps.autoSync(); refresh(); } }, '맵 다시 맞추기'),
        h('button', { class: 'btn sm', onclick: () => PDM.repoMaps && PDM.repoMaps.confirmMissing().then(() => refresh()) }, '저장소에 없는 맵…'),
        h('button', { class: 'btn sm', onclick: () => PDM.tabs.open('repoanalysis') }, '분석 보고서'),
        h('button', { class: 'btn sm', title: 'game/ 아래 다른 저장소와 비교해 기능(클래스 · 함수)을 골라 이 프로젝트에 가져옴', onclick: () => PDM.tabs.open('features') }, '다른 저장소 기능 가져오기…')));
    const search = h('input', { type: 'search', class: 'rx-search', placeholder: { files: '경로로 찾기 (예: sprites/blaze)', classes: '클래스 이름 · 파일로 찾기', data: '이름으로 찾기', texts: '번역 키 · 글자로 찾기' }[st.tab], value: st.q || '' });
    let tm = 0; search.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { st.q = search.value; st.more = 0; refresh(); setTimeout(() => { const s2 = document.querySelector('.rx-search'); if (s2) { s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); } }, 0); }, 250); });
    page.append(h('div', { class: 'rx-tabs' }, ...TABS.map(([k, l]) => h('button', { class: 'btn sm' + (st.tab === k ? ' pri' : ''), onclick: () => { st.tab = k; st.q = ''; st.more = 0; refresh(); } }, l)), search));
    const left = h('div', { class: 'rx-left' }), right = h('div', { class: 'rx-right' });
    page.append(h('div', { class: 'rx-layout' }, left, right));
    if (rep.index) ({ files: filesTab, classes: classesTab, data: dataTab, texts: textsTab })[st.tab](st, left, right);
    else if (st.tab === 'data') dataTab(st, left, right);
    return page;
  }

  PDM.registerEditor({
    id: K, icon: '🔎', title: () => '게임 저장소 탐색',
    match: k => k === K, needsResource: false, watch: ck => ck === 'world' || ck.startsWith('hero:') || ck.startsWith('char:') || ck.startsWith('node:'),
    render
  });
  PDM.repoExplorer = { data, resolve, ancestry, dataRows, loadMessages, go };
})();
