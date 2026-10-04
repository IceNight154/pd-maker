// ================================================================
//  게임 텍스트 — 게임 화면에 나오는 모든 글자(게임 저장소 assets/messages/*.properties)를 언어별로 바꿈
//    데이터: texts.json { texts: { "<언어 코드>": { "<키>": "<글자>" }, "*": { 모든 언어 } } }
//    런타임: MakerTexts (Messages.getFromBundle 연결 줄) — 바꾼 것이 있으면 게임 원래 글자 대신 그것
// ================================================================
(function () {
  const { h, store } = PDM;
  const K = 'texts';
  /** 게임 설정에서 고를 수 있는 언어 (messages/Languages.java) — 저장소에 파일이 있는 것만 보임 */
  const LANGS = { en: 'English', ko: '한국어', ja: '日本語', zh: '简体中文', 'zh-hant': '繁體中文', ru: 'русский', es: 'español', pt: 'português', fr: 'français', de: 'deutsch', pl: 'polski', it: 'italiano',
    tr: 'türkçe', vi: 'tiếng việt', uk: 'українська', in: 'indonesia', cs: 'čeština', nl: 'nederlands', sv: 'svenska', hu: 'magyar', el: 'ελληνικά', be: 'беларуская', eo: 'esperanto', fi: 'suomi', ca: 'català' };
  const BUNDLES = { actors: '캐릭터 · 버프 · 몬스터', items: '아이템', journal: '도감 · 기록', levels: '층 · 지형 · 함정', misc: '기타', plants: '식물', scenes: '화면 (타이틀 · 메뉴)', ui: 'UI (버튼 · 창 조각)', windows: '창 (설정 · 대화상자)' };
  const PER = 60;
  let cache = { repo: '', langs: null, bundles: null, files: {} };

  const parse = text => { const out = []; String(text).split(/\r?\n/).forEach(line => { if (!line || line[0] === '#' || line[0] === '!') return; const i = line.indexOf('='); if (i > 0) out.push([line.slice(0, i).trim(), line.slice(i + 1)]); }); return out; };
  async function repoInfo() {
    const repo = await PDM.app.resolveRepo(true);
    if (repo !== cache.repo) cache = { repo, langs: null, bundles: null, files: {} };
    if (!cache.langs) {
      cache.roots = PDM.gameMsgRoot ? await PDM.gameMsgRoot(repo) : ['messages'];   // 게임이 읽는 글자 폴더들 (모드에 따라 messages + new_messages 등 — 뒤의 것이 덮어씀)
      const base = pdm.join(repo, 'core', 'src', 'main', 'assets', cache.roots[0]);
      let dirs = []; try { dirs = (await pdm.list(base)).filter(e => e.dir).map(e => e.name).sort(); } catch (_) { /* 없음 */ }
      const codes = new Set();
      for (const d of dirs.slice(0, 1)) { try { (await pdm.list(pdm.join(base, d))).forEach(e => { const m = new RegExp('^' + d + '(?:_([A-Za-z-]+))?\\.properties$').exec(e.name); if (m) codes.add(m[1] || 'en'); }); } catch (_) { /* 없음 */ } }
      cache.bundles = dirs; cache.langs = [...codes].sort((a, b) => (a === 'en' ? -1 : b === 'en' ? 1 : a === 'ko' ? -1 : b === 'ko' ? 1 : a.localeCompare(b)));
    }
    return cache;
  }
  async function loadFile(bundle, lang) {
    const id = bundle + '|' + lang; if (cache.files[id]) return cache.files[id];
    const m = new Map();
    for (const root of cache.roots || ['messages']) { try { parse(await pdm.readText(pdm.join(cache.repo, 'core', 'src', 'main', 'assets', root, bundle, bundle + (lang === 'en' ? '' : '_' + lang) + '.properties'))).forEach(([k, v]) => m.set(k, v)); } catch (_) { /* 이 폴더에는 없음 */ } }
    const rows = [...m.entries()];
    return (cache.files[id] = rows);
  }
  /** [{ key, bundle, text(고른 언어 원문 — 없으면 영어), en }] */
  async function loadRows(bundle, lang) {
    const bs = bundle === 'all' ? cache.bundles : [bundle], out = [];
    for (const b of bs) {
      const en = await loadFile(b, 'en'), tr = lang === 'en' ? null : new Map(await loadFile(b, lang));
      en.forEach(([k, v]) => out.push({ key: k, bundle: b, en: v, text: tr && tr.has(k) ? tr.get(k) : v, missing: !!tr && !tr.has(k) }));
    }
    return out;
  }
  /** 게임 원래 글자 하나 (키로): { text(한국어가 있으면 한국어, 없으면 영어), en, lang } — 못 찾으면 null */
  async function one(key) {
    try {
      const c = await repoInfo(), lang = (c.langs || []).includes('ko') ? 'ko' : 'en';
      const head = String(key).split(/[.$]/)[0], guess = (c.bundles || []).includes(head) ? head : 'misc';
      for (const b of [guess, ...(c.bundles || []).filter(x => x !== guess)]) { const r = (await loadRows(b, lang)).find(x => x.key === key); if (r) return { text: String(r.text).replace(/\\n/g, '\n'), en: String(r.en).replace(/\\n/g, '\n'), lang }; }
    } catch (_) { /* 저장소 없음 */ }
    return null;
  }
  /** "게임 원래 글" 을 실제 글로 보여 주는 상자 (비동기로 채움). fmt(글) 로 다듬을 수 있음 */
  function origBox(key, label, fmt) {
    const el = h('div', { class: 'hint', style: { whiteSpace: 'pre-wrap', borderLeft: '2px solid var(--line)', padding: '2px 0 2px 8px', margin: '2px 0 8px' } }, (label || '게임 원래 글') + ': 읽는 중…');
    one(key).then(r => { el.textContent = (label || '게임 원래 글') + (r ? (r.lang === 'ko' ? '' : ' (영어 원문)') + ':\n' + (fmt ? fmt(r.text) : r.text) : ': (게임 저장소에서 찾지 못했습니다 — 키 ' + key + ')'); });
    return el;
  }
  PDM.gameTexts = { LANGS, repoInfo, loadRows, one, origBox };

  PDM.registerEditor({
    id: K, icon: '🔤', title: () => '게임 텍스트',
    match: k => k === K,
    tree: () => store.isOpen ? [{ id: K, label: '게임 텍스트', icon: '🔤', open: K, order: 4, count: Object.values((store.get(K) || {}).texts || {}).reduce((a, m) => a + Object.keys(m).length, 0) || undefined }] : [],
    render(key, ctx) {
      const st = ctx.state = ctx.state || { lang: 'ko', bundle: 'all', q: '', changed: false, page: 0, scope: 'lang' };
      const body = h('div', {}, h('p', { class: 'hint' }, '게임 저장소에서 글자를 읽는 중…'));
      const data = () => (store.get(K) || {}).texts || {};
      const ov = (lang, k) => (data()[lang] || {})[k.toLowerCase()];
      const setOv = (lang, k, v) => store.edit(K, '게임 텍스트: ' + k, r => { r.texts = r.texts || {}; const m = r.texts[lang] = r.texts[lang] || {}; if (v === null || v === undefined) { delete m[k.toLowerCase()]; if (!Object.keys(m).length) delete r.texts[lang]; } else m[k.toLowerCase()] = v; }, { silent: true });
      const sel = (opts, cur, on, style) => { const s = h('select', { style: style || {}, onchange: () => on(s.value) }, opts.map(([v, t]) => h('option', { value: v }, t))); s.value = cur; return s; };
      const draw = async () => {
        let info; try { info = await repoInfo(); } catch (e) { info = null; }
        if (!info || !info.bundles || !info.bundles.length) { body.replaceChildren(h('p', { class: 'hint', style: { color: 'var(--bad)' } }, '게임 저장소의 글자 파일(core/src/main/assets/messages)을 찾지 못했습니다. 프로젝트 설정에서 게임 저장소 경로를 확인하세요.')); return; }
        if (!info.langs.includes(st.lang)) st.lang = info.langs.includes('ko') ? 'ko' : info.langs[0];
        const rows = await loadRows(st.bundle, st.lang);
        const q = st.q.trim().toLowerCase(), tgt = st.scope === 'all' ? '*' : st.lang;
        const cur = r => { const a = ov(st.lang, r.key), b = ov('*', r.key); return a !== undefined ? a : b; };
        const list = rows.filter(r => (!st.changed || cur(r) !== undefined) && (!q || r.key.toLowerCase().includes(q) || r.text.toLowerCase().includes(q) || String(cur(r) || '').toLowerCase().includes(q)));
        const pages = Math.max(1, Math.ceil(list.length / PER)); if (st.page >= pages) st.page = pages - 1;
        const total = Object.values(data()).reduce((a, m) => a + Object.keys(m).length, 0);
        const qi = h('input', { type: 'search', value: st.q, placeholder: '키 또는 글자 검색 (예: 단검, sword, hero.name)…', style: { flex: '1 1 220px' } });
        let tm = 0; qi.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { st.q = qi.value; st.page = 0; draw().then(() => { const n = body.querySelector('input[type=search]'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }); }, 250); });
        const pager = () => h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', margin: '8px 0' } },
          h('button', { class: 'btn sm', disabled: st.page <= 0, onclick: () => { st.page--; draw(); } }, '◀'), h('span', { class: 'hint' }, `${st.page + 1} / ${pages} 쪽 · ${list.length}개`),
          h('button', { class: 'btn sm', disabled: st.page >= pages - 1, onclick: () => { st.page++; draw(); } }, '▶'));
        body.replaceChildren(
          h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' } },
            sel(info.langs.map(c => [c, `${LANGS[c] || c} (${c})`]), st.lang, v => { st.lang = v; st.page = 0; draw(); }),
            sel([['all', '모든 분류'], ...info.bundles.map(b => [b, BUNDLES[b] || b])], st.bundle, v => { st.bundle = v; st.page = 0; draw(); }),
            qi,
            h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: st.changed, onchange: e => { st.changed = e.target.checked; st.page = 0; draw(); } }), `바꾼 것만 (전체 ${total}개)`),
            sel([['lang', `바꿀 대상: ${LANGS[st.lang] || st.lang} 만`], ['all', '바꿀 대상: 모든 언어']], st.scope, v => { st.scope = v; draw(); })),
          pager(),
          h('div', {}, list.slice(st.page * PER, st.page * PER + PER).map(r => {
            const mine = ov(tgt, r.key), other = tgt === '*' ? ov(st.lang, r.key) : ov('*', r.key);
            const ta = h('textarea', { rows: Math.min(6, Math.max(1, Math.ceil(r.text.length / 60))), style: { width: '100%' }, placeholder: other !== undefined ? `(${tgt === '*' ? '이 언어에서' : '모든 언어로'} 바꿈: ${other})` : '(게임 원래 글자 그대로)' });
            ta.value = mine === undefined ? '' : mine;
            const box = h('div', { style: { borderTop: '1px solid var(--line)', padding: '6px 0', borderLeft: mine !== undefined || other !== undefined ? '3px solid var(--gold, #d9a441)' : '3px solid transparent', paddingLeft: '8px' } });
            const reset = h('button', { class: 'btn xs', style: { display: mine === undefined ? 'none' : '' }, onclick: () => { ta.value = ''; setOv(tgt, r.key, null); reset.style.display = 'none'; box.style.borderLeftColor = other !== undefined ? '' : 'transparent'; } }, '원래대로');
            ta.addEventListener('change', () => { const v = ta.value; if (v === '' || v === r.text) { setOv(tgt, r.key, null); reset.style.display = 'none'; } else { setOv(tgt, r.key, v); reset.style.display = ''; box.style.borderLeftColor = 'var(--gold, #d9a441)'; } });
            box.append(h('div', { style: { display: 'flex', gap: '8px', alignItems: 'baseline' } }, h('code', { style: { fontSize: '11px', opacity: 0.75, wordBreak: 'break-all' } }, r.key), h('span', { class: 'hint', style: { marginLeft: 'auto', whiteSpace: 'nowrap' } }, (BUNDLES[r.bundle] || r.bundle) + (r.missing ? ' · 번역 없음(영어)' : '')),
              h('button', { class: 'btn xs', title: '원문을 입력 칸에 복사', onclick: () => { ta.value = r.text; ta.focus(); } }, '원문 복사'), reset),
              h('div', { style: { fontSize: '12.5px', margin: '3px 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' } }, r.text), ta);
            return box; })),
          pager());
      };
      draw();
      return h('div', { class: 'editor' },
        h('h2', {}, '게임 텍스트'),
        h('p', { class: 'hint' }, '게임 화면에 나오는 글자(아이템·몬스터 이름과 설명, 버튼, 창, 메시지 …)를 언어별로 바꿉니다. 게임 설정에서 고를 수 있는 모든 언어를 고를 수 있고, 비워 두면 게임 원래 글자가 나옵니다. 줄바꿈은 \\n, 강조는 _글자_, %s · %d 같은 자리는 그대로 두세요. 프로젝트에서 만든 아이템·캐릭터·대사는 각 편집 화면에서, 메뉴 용어는 "용어 관리"에서 바꿉니다.'),
        body);
    }
  });
})();
