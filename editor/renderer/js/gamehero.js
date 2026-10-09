// ================================================================
//  gamehero — 게임 저장소의 영웅 직업을 소스에서 읽어 옴 (시작 아이템 · 전직 · 직업 능력 · 특성)
//    PDM.gameHero(cls)        → { inv, subs, abilities, tiers, heroic, src } (저장소·직업마다 한 번만 읽음)
//    PDM.gameUsages(token)    → 저장소 소스에서 token 이 쓰인 곳 [{ file, line, text }]
//    PDM.gameHeroBox(c, kind) → 영웅 편집기에 넣는 "게임 원래 설정" 상자 (kind: inv | subs | abilities | talents)
//    읽는 곳: actors/hero/HeroClass.java · HeroSubClass.java · Talent.java · abilities/** · (글자) actors.properties
// ================================================================
(function () {
  const h = PDM.h;
  const J = ['core', 'src', 'main', 'java', 'com', 'shatteredpixel', 'shatteredpixeldungeon'];
  const cache = {}, srcCache = {};
  const repoOf = () => (PDM.GAME_SCAN || {}).repo || '';
  const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, m => ' '.repeat(m.length));
  /** open 위치의 { 와 짝이 맞는 } 까지 (안쪽 글자) */
  function block(src, open) {
    let d = 0;
    for (let i = open; i < src.length; i++) { const ch = src[i]; if (ch === '{') d++; else if (ch === '}' && --d === 0) return src.slice(open + 1, i); }
    return src.slice(open + 1);
  }
  /** 메서드 전체 (서명 줄 ~ 닫는 괄호) · 본문 */
  function method(src, re) {
    const m = re.exec(src); if (!m) return null;
    const open = src.indexOf('{', m.index + m[0].length - 1); if (open < 0) return null;
    const body = block(src, open), start = src.lastIndexOf('\n', m.index) + 1;
    return { body, code: src.slice(start, open + body.length + 2), line: src.slice(0, start).split('\n').length };
  }
  /** switch 의 case NAME: … 다음 case/닫힘 전까지 (case A: default: 처럼 붙은 것도) */
  function caseBodies(body, name) {
    const out = [], re = new RegExp('case\\s+' + name + '\\s*:', 'g'); let m;
    while ((m = re.exec(body))) {
      let rest = body.slice(m.index + m[0].length).replace(/^(\s*(default|case\s+\w+)\s*:)+/, '');
      const end = rest.search(/\b(case\s+\w+\s*:|default\s*:)/);
      out.push(end < 0 ? rest : rest.slice(0, end));
    }
    return out;
  }
  const fmt = s => String(s || '').replace(/\\n/g, '\n').replace(/_([^_\n]+)_/g, '$1').trim();
  const lc = s => String(s).toLowerCase();

  /** 본문에서 주는 아이템 뽑기: new X() … (장착 · 개수 · 강화 · 퀵슬롯 · 감정만) */
  function parseItems(body) {
    const out = [], vars = {};
    for (const st of strip(body).split(';')) {
      const s = st.trim(); if (!s) continue;
      const slot = /setSlot\(\s*(\d+)\s*,\s*(\w+)\s*\)/.exec(s);
      if (slot && vars[slot[2]]) { vars[slot[2]].quickslot = +slot[1] + 1; continue; }
      const news = [...s.matchAll(/new\s+([A-Z]\w*)\s*\(/g)].map(x => x[1]);
      if (!news.length) {   // 변수에 뒤따르는 호출
        const vn = Object.keys(vars).find(n => new RegExp('\\b' + n + '\\s*\\.').test(s)), it = vn && vars[vn];
        const eq = /belongings\.(\w+)\s*=\s*(?:\(\s*\w+\s*\)\s*)?(\w+)/.exec(s);
        if (eq && vars[eq[2]]) { vars[eq[2]].equip = eq[1]; if (/\.identify\(/.test(s)) vars[eq[2]].identify = true; continue; }
        if (it) { const q = /\.quantity\(\s*(\d+)/.exec(s), u = /\.upgrade\(\s*(\d+)?/.exec(s);
          if (q) it.count = +q[1]; if (u) it.level = +(u[1] || 1); if (/\.identify\(/.test(s)) it.identify = true; if (/\.collect\(/.test(s)) it.collect = true; }
        continue;
      }
      if (/affixSeal\s*\(/.test(s)) { out.push({ cls: news[news.length - 1], affix: true }); continue; }
      const cls = news[0], it = { cls, count: 1, level: 0 };
      const dec = /(?:^|\s)(?:[A-Z]\w*\s+)?(\w+)\s*=\s*new\s/.exec(s), eq = /belongings\.(\w+)\s*=/.exec(s);
      if (eq) it.equip = eq[1]; else if (dec) vars[dec[1]] = it;
      if (eq && dec && dec[1] !== eq[1]) vars[dec[1]] = it;
      const q = /\.quantity\(\s*(\d+)/.exec(s), u = /\.upgrade\(\s*(\d+)?/.exec(s);
      if (q) it.count = +q[1]; if (u) it.level = +(u[1] || 1);
      if (/\.identify\(/.test(s)) it.identify = true;
      if (/\.collect\(/.test(s)) it.collect = true;
      if (/^\(?\s*hero\.belongings\.(\w+)\s*=\s*(\w+)\s*\)?/.test(s) && !/new\s/.test(s.split('=')[1] || '')) continue;
      out.push(it);
    }
    // 장착도 가방도 아니고 변수도 아닌 "new X().identify()" → 처음부터 아는 아이템
    out.forEach(it => { if (!it.affix && !it.equip && !it.collect && it.identify && !Object.values(vars).includes(it)) it.known = true; });
    return out;
  }
  /** if (DeviceCompat.isDebug() …) { … } 블록을 떼어 냄 → [나머지, 디버그 본문] */
  function splitDebug(body) {
    const m = /if\s*\(\s*DeviceCompat\.isDebug\(\)[^{]*\{/.exec(body); if (!m) return [body, ''];
    const open = m.index + m[0].length - 1, inner = block(body, open);
    return [body.slice(0, m.index) + body.slice(open + inner.length + 2), inner];
  }

  PDM.gameHero = async function (cls) {
    const repo = repoOf(); cls = String(cls || '').toUpperCase();
    if (!repo || !cls) return null;
    const ck = repo + '|' + cls; if (cache[ck]) return cache[ck];
    return (cache[ck] = (async () => {
      const root = pdm.join(repo, ...J), read = async rel => { try { return await pdm.readText(pdm.join(root, rel)); } catch (_) { return ''; } };
      const [hc, hs, tl] = await Promise.all(['HeroClass', 'HeroSubClass', 'Talent'].map(n => read('actors/hero/' + n + '.java')));
      if (!hc || !new RegExp('\\b' + cls + '\\s*\\(').test(strip(hc))) return null;
      const msg = PDM.gameProps ? await PDM.gameProps(repo, 'actors') : {};
      const hcS = strip(hc), tlS = strip(tl), hsS = strip(hs);
      const hk = 'actors.hero.heroclass.' + lc(cls);
      const texts = { name: fmt(msg[hk]), short: fmt(msg[hk + '_desc_short']), desc: fmt(msg[hk + '_desc']), unlock: fmt(msg[hk + '_unlock']) };
      const res = { cls, texts, inv: null, subs: [], abilities: [], tiers: [], files: { hero: 'actors/hero/HeroClass.java', sub: 'actors/hero/HeroSubClass.java', talent: 'actors/hero/Talent.java' } };

      // ---- 특성: enum 상수 (아이콘 x, y, 최대 포인트) · 글자
      const xy = /Talent\s*\(\s*int\s+x\s*,\s*int\s+y\s*[,)]/.test(tlS);   // 생성자가 (x, y[, 최대]) 인 모드 · 원작은 (아이콘[, 최대])
      const talent = id => {
        const m = new RegExp('\\b' + id + '\\s*\\(\\s*(-?\\d+)\\s*(?:,\\s*(-?\\d+)\\s*)?(?:,\\s*(\\d+)\\s*)?\\)').exec(tlS), k = 'actors.hero.talent.' + lc(id);
        const a = m ? [m[1], m[2], m[3]].filter(v => v !== undefined).map(Number) : [];
        const max = !m ? null : xy && a.length >= 2 ? (a[2] || 2) : (a[1] || 2), icon = !m ? '' : xy && a.length >= 2 ? `(${a[0]}, ${a[1]})` : String(a[0]);
        return { id, icon, max, name: fmt(msg[k + '.title']) || id, desc: fmt(msg[k + '.desc']), def: m ? m[0] : '' };
      };
      const addAll = seg => { const m = /addAll\s*\(\s*tierTalents\s*,([^)]*)\)/.exec(seg); return m ? m[1].split(',').map(s => s.trim()).filter(Boolean).map(talent) : []; };

      // ---- 시작 인벤토리: initHero (공통) + init직업 (전용)
      const ih = method(hcS, /public\s+void\s+initHero\s*\([^)]*\)\s*\{/), ihRaw = method(hc, /public\s+void\s+initHero\s*\([^)]*\)\s*\{/);
      if (ih) {
        const sw = ih.body.search(/switch\s*\(\s*this\s*\)/), [common, dbg] = splitDebug(sw < 0 ? ih.body : ih.body.slice(0, sw));
        const call = (caseBodies(ih.body, cls)[0] || '').match(/(\w+)\s*\(\s*hero\s*\)/);
        const own = call ? method(hcS, new RegExp('void\\s+' + call[1] + '\\s*\\([^)]*\\)\\s*\\{')) : null;
        const ownRaw = call ? method(hc, new RegExp('void\\s+' + call[1] + '\\s*\\([^)]*\\)\\s*\\{')) : null;
        res.inv = { common: parseItems(common), debug: parseItems(dbg), own: own ? parseItems(own.body) : [], fn: call ? call[1] : '',
          code: ownRaw ? ownRaw.code : '', line: ownRaw ? ownRaw.line : 0, commonCode: ihRaw ? ihRaw.code : '', commonLine: ihRaw ? ihRaw.line : 0 };
      }

      // ---- 전직: enum 줄 CLS(HeroSubClass.A, HeroSubClass.B)
      const en = new RegExp('\\b' + cls + '\\s*\\(([^)]*)\\)').exec(hcS);
      const subIds = en ? [...en[1].matchAll(/HeroSubClass\.(\w+)/g)].map(x => x[1]) : [];
      const st = method(tlS, /void\s+initSubclassTalents\s*\(\s*HeroSubClass[^)]*\)\s*\{/);
      res.subs = subIds.map(id => { const ic = new RegExp('\\b' + id + '\\s*\\(\\s*([^)]*)\\)').exec(hsS), k = 'actors.hero.herosubclass.' + lc(id);
        return { id, icon: ic ? ic[1].trim() : '', name: fmt(msg[k]) || id, short: fmt(msg[k + '_short_desc']), desc: fmt(msg[k + '_desc']), def: ic ? ic[0] : '', talents: st ? addAll(caseBodies(st.body, id)[0] || '') : [] }; });
      res.enumDef = en ? en[0] : '';

      // ---- 특성 1~2단계 (직업) : initClassTalents 의 switch 마다 case CLS
      const ct = method(tlS, /void\s+initClassTalents\s*\(\s*HeroClass[^)]*replacements\s*\)\s*\{/) || method(tlS, /void\s+initClassTalents\s*\(\s*HeroClass[^)]*\)\s*\{/);
      if (ct) res.tiers = caseBodies(ct.body, cls).map(addAll).filter(t => t.length);

      // ---- 직업 능력: armorAbilities() 의 case CLS → new X()
      const aa = method(hcS, /ArmorAbility\s*\[\s*\]\s+armorAbilities\s*\(\s*\)\s*\{/);
      const abNames = aa ? [...(caseBodies(aa.body, cls)[0] || '').split(';')[0].matchAll(/new\s+(\w+)\s*\(\s*\)/g)].map(x => x[1]) : [];
      if (abNames.length) {
        let files = []; try { files = await PDM.gameWalk(pdm.join(root, 'actors', 'hero', 'abilities')); } catch (_) { files = []; }
        files = files.map(f => f.replace(/\\/g, '/'));
        res.abilities = await Promise.all(abNames.map(async n => {
          let rel = files.find(f => f.endsWith('/' + n + '.java') || f === n + '.java');
          if (!rel) for (const d of [lc(cls), '']) { const t = (d ? d + '/' : '') + n + '.java'; if (await read('actors/hero/abilities/' + t)) { rel = t; break; } }
          const code = rel ? await read('actors/hero/abilities/' + rel) : '', s = strip(code);
          const k = 'actors.hero.abilities.' + (rel ? lc(rel.slice(0, -5).replace(/\//g, '.')) : lc(n));
          const ch = /baseChargeUse\s*=\s*([\d.]+)/.exec(s), tm = method(s, /Talent\s*\[\s*\]\s+talents\s*\(\s*\)\s*\{/), ic = /int\s+icon\s*\(\s*\)\s*\{\s*return\s+([\w.]+)/.exec(s);
          return { cls: n, file: rel ? 'actors/hero/abilities/' + rel : '', name: fmt(msg[k + '.name']) || n, short: fmt(msg[k + '.short_desc']), desc: fmt(msg[k + '.desc']),
            charge: ch ? +ch[1] : null, icon: ic ? ic[1] : '', target: /targetingPrompt\s*\(/.test(s), code,
            talents: tm ? [...tm.body.matchAll(/Talent\.(\w+)/g)].map(x => talent(x[1])) : [] };
        }));
      }
      return res;
    })().catch(e => { delete cache[ck]; PDM.log && PDM.log('게임 영웅 읽기 오류: ' + e, 'warn'); return null; }));
  };

  /** 저장소 소스 전체에서 token 이 쓰인 곳 (처음 한 번 전부 읽어 둠) */
  PDM.gameUsages = async function (token, skip) {
    const repo = repoOf(); if (!repo) return [];
    if (!srcCache[repo]) srcCache[repo] = (async () => {
      const root = pdm.join(repo, ...J); let files = [];
      try { files = (await PDM.gameWalk(root)).map(f => f.replace(/\\/g, '/')).filter(f => f.endsWith('.java') && !f.startsWith('pdmaker/')); } catch (_) { files = []; }
      const out = [];
      for (let i = 0; i < files.length; i += 40) await Promise.all(files.slice(i, i + 40).map(async f => { try { out.push([f, await pdm.readText(pdm.join(root, f))]); } catch (_) { /* 없음 */ } }));
      return out.sort((a, b) => a[0].localeCompare(b[0]));
    })();
    const all = await srcCache[repo], re = new RegExp('\\b' + token.replace(/[.$]/g, '\\$&') + '\\b'), hits = [];
    for (const [f, src] of all) {
      if (!src.includes(token) || (skip || []).includes(f)) continue;
      const lines = src.split(/\r?\n/);
      lines.forEach((l, i) => { if (re.test(l) && !/^\s*(import|\/\/)/.test(l) && !/addAll\s*\(\s*tierTalents/.test(l) && !new RegExp('^\\s*' + token + '\\s*\\(').test(l)) hits.push({ file: f, line: i + 1, text: lines.slice(Math.max(0, i - 3), i + 5).join('\n'), from: Math.max(0, i - 3) + 1 }); });
    }
    return hits;
  };

  // ---------------------------------------------------------------- 화면
  function codeView(code, first, mark) {
    return h('pre', { class: 'code-view', style: { maxHeight: '340px' } }, ...String(code).replace(/\t/g, '    ').split(/\r?\n/).map((l, i) =>
      h('div', { class: (first || 1) + i === mark ? 'mark' : '' }, h('i', {}, String((first || 1) + i)), l || ' ')));
  }
  const fold = (label, make) => { let done = false; const body = h('div', { class: 'm-0 mt-2 mb-3' });
    return h('details', { ontoggle: async e => { if (!e.target.open || done) return; done = true; body.textContent = '읽는 중…';
      try { const r = await make(); body.textContent = ''; [].concat(r).forEach(x => x && body.appendChild(x)); } catch (er) { body.textContent = '읽지 못했습니다: ' + er; } } },
      h('summary', { class: 'pointer c-accent' }, label), body); };
  const kv = (k, v) => v === null || v === undefined || v === '' ? null : h('div', { style: { display: 'flex', gap: '8px', margin: '1px 0' } }, h('span', { class: 'hint', style: { minWidth: '92px', flex: 'none' } }, k), h('span', { style: { whiteSpace: 'pre-wrap', userSelect: 'text' } }, String(v)));
  const mono = s => h('code', { style: { fontFamily: 'var(--mono)', fontSize: '12px', userSelect: 'text' } }, s);
  function usageFold(token, skip) {
    return fold('코드에서 쓰이는 곳 (' + token + ')', async () => { const u = await PDM.gameUsages(token, skip);
      if (!u.length) return h('div', { class: 'hint' }, '쓰이는 곳을 찾지 못했습니다.');
      return [h('div', { class: 'hint' }, u.length + '곳' + (u.length > 30 ? ' (앞의 30곳만 보여 줌)' : '')), ...u.slice(0, 30).map(x => h('div', { class: 'my-2' }, mono(x.file + ' : ' + x.line), codeView(x.text, x.from, x.line)))]; });
  }
  function itemName(cls) {
    const g = Object.values(PDM.SPD_ITEM_GROUPS || {}).flat().find(x => x.p === cls || String(x.p).endsWith('.' + cls));
    return g ? { name: g.n, path: g.p, img: g.img } : { name: cls };
  }
  const SLOT = { weapon: '무기', armor: '갑옷', artifact: '유물', misc: '장신구', ring: '반지', secondWep: '보조 무기' };
  function itemRow(it) {
    const g = itemName(it.cls), tags = [];
    if (it.affix) tags.push('입은 갑옷에 붙임'); if (it.equip) tags.push('장착: ' + (SLOT[it.equip] || it.equip));
    if (it.known) tags.push('주지 않음 — 처음부터 아는 종류로만'); else if (it.identify) tags.push('감정됨');
    if (it.count > 1) tags.push('× ' + it.count); if (it.level) tags.push('+' + it.level); if (it.quickslot) tags.push('퀵슬롯 ' + it.quickslot);
    const cv = g.img ? h('canvas', { width: 16, height: 16, style: { imageRendering: 'pixelated', verticalAlign: 'middle', marginRight: '4px' } }) : null;
    if (cv && PDM.assets && PDM.assets.drawItemSprite) Promise.resolve(PDM.assets.drawItemSprite(cv, { sheet: 'builtin:items', name: g.img }, 1)).catch(() => {});
    return h('div', { class: 'my-1' }, cv, h('b', {}, g.name), ' ', mono(g.path ? 'spd:' + g.path : it.cls), tags.length ? h('span', { class: 'hint' }, '  ' + tags.join(' · ')) : null);
  }
  function talentRow(t, skip) {
    return h('details', { style: { margin: '2px 0 2px 8px' } },
      h('summary', { class: 'pointer' }, h('b', {}, t.name), ' ', mono(t.id), h('span', { class: 'hint' }, t.max ? `  최대 ${t.max} 포인트 · 아이콘 ${t.icon}` : '')),
      h('div', { style: { margin: '4px 0 6px 12px' } }, kv('설명', t.desc || '(글자 없음)'), kv('선언', t.def), kv('글자 키', 'actors.hero.talent.' + lc(t.id) + '.title / .desc'), usageFold(t.id)));
  }
  const TIER = ['1단계 (레벨 2~)', '2단계 (레벨 7~)', '3단계 (레벨 13~ · 전직 뒤)', '4단계 (레벨 21~ · 직업 능력 뒤)'];

  function render(d, kind, c) {
    const out = [];
    if (kind === 'inv') {
      const iv = d.inv; if (!iv) return [h('div', { class: 'hint' }, 'HeroClass.initHero 를 찾지 못했습니다.')];
      out.push(h('div', { class: 'fl' }, `이 직업만 받는 것 — ${iv.fn || '(전용 메서드 없음)'}()`), ...(iv.own.length ? iv.own.map(itemRow) : [h('div', { class: 'hint' }, '없음')]),
        h('div', { class: 'fl mt-3' }, '모든 직업이 받는 것 — initHero()'), ...iv.common.map(itemRow));
      if (iv.debug.length) out.push(h('div', { class: 'fl mt-3' }, '디버그 빌드 · "test" 시드에서만 더 받는 것'), ...iv.debug.map(itemRow));
      if (iv.code) out.push(fold(`코드 보기 — ${iv.fn}() (${d.files.hero} : ${iv.line})`, () => codeView(iv.code, iv.line)));
      if (iv.commonCode) out.push(fold(`코드 보기 — initHero() (${d.files.hero} : ${iv.commonLine})`, () => codeView(iv.commonCode, iv.commonLine)));
    } else if (kind === 'subs') {
      if (!d.subs.length) return [h('div', { class: 'hint' }, '이 직업의 전직을 찾지 못했습니다.')];
      out.push(kv('선언', d.enumDef + '   — ' + d.files.hero));
      d.subs.forEach(s => out.push(h('details', { class: 'my-2' },
        h('summary', { class: 'pointer' }, h('b', {}, s.name), ' ', mono('HeroSubClass.' + s.id), h('span', { class: 'hint' }, '  ' + (s.short || '').split('\n')[0].slice(0, 60))),
        h('div', { style: { margin: '4px 0 8px 12px' } }, kv('한 줄 설명', s.short), kv('설명', s.desc), kv('아이콘', s.icon), kv('선언', s.def + '   — ' + d.files.sub),
          kv('글자 키', 'actors.hero.herosubclass.' + lc(s.id) + ' / _short_desc / _desc'),
          h('div', { class: 'fl mt-2' }, '전직 특성 (3단계)'), ...(s.talents.length ? s.talents.map(t => talentRow(t, [d.files.talent])) : [h('div', { class: 'hint' }, '없음')]),
          usageFold(s.id, [d.files.hero, d.files.sub])))));
    } else if (kind === 'abilities') {
      if (!d.abilities.length) return [h('div', { class: 'hint' }, '이 직업의 직업 능력을 찾지 못했습니다 (HeroClass.armorAbilities).')];
      d.abilities.forEach(a => out.push(h('details', { class: 'my-2' },
        h('summary', { class: 'pointer' }, h('b', {}, a.name), ' ', mono(a.cls), h('span', { class: 'hint' }, '  ' + (a.charge !== null ? '충전 ' + a.charge + '% · ' : '') + (a.target ? '대상 지정' : '즉시 발동'))),
        h('div', { style: { margin: '4px 0 8px 12px' } }, kv('한 줄 설명', a.short), kv('설명', a.desc), kv('충전 소모', a.charge !== null ? a.charge + '% (baseChargeUse)' : '(기본값)'), kv('아이콘', a.icon), kv('파일', a.file),
          h('div', { class: 'fl mt-2' }, '능력 특성 (4단계)'), ...(a.talents.length ? a.talents.map(t => talentRow(t, [d.files.talent])) : [h('div', { class: 'hint' }, '없음')]),
          a.code ? fold('코드 보기 — ' + a.cls + '.java (' + a.code.split('\n').length + '줄)', () => codeView(a.code, 1)) : null))));
    } else {
      if (!d.tiers.length) out.push(h('div', { class: 'hint' }, 'Talent.initClassTalents 에서 이 직업을 찾지 못했습니다.'));
      d.tiers.forEach((t, i) => out.push(h('div', { class: 'fl', style: { marginTop: i ? '6px' : 0 } }, TIER[i] || (i + 1) + '단계'), ...t.map(x => talentRow(x, [d.files.talent]))));
      d.subs.forEach(s => { if (s.talents.length) out.push(h('div', { class: 'fl mt-3' }, '3단계 — 전직 「' + s.name + '」'), ...s.talents.map(x => talentRow(x, [d.files.talent]))); });
      d.abilities.forEach(a => { if (a.talents.length) out.push(h('div', { class: 'fl mt-3' }, '4단계 — 직업 능력 「' + a.name + '」'), ...a.talents.map(x => talentRow(x, [d.files.talent]))); });
    }
    return out.filter(Boolean);
  }

  const TITLE = { inv: '게임 원래 시작 아이템', subs: '게임 원래 전직', abilities: '게임 원래 직업 능력', talents: '게임 원래 특성' };
  /** 영웅 편집기에 넣는 상자. used = 지금 게임이 이것을 그대로 쓰는지 (false 면 프로젝트 설정이 대신함) */
  PDM.gameHeroBox = function (c, kind, used, st) {
    const cls = String(c.baseClass || '').trim().toUpperCase(); if (!cls) return null;
    const body = h('div', { class: 'mt-3' }, h('div', { class: 'hint' }, '저장소에서 읽는 중…'));
    const sk = 'gh_' + kind, open = st ? st[sk] !== false : true;
    const box = h('details', { open, ontoggle: e => { if (st) st[sk] = e.target.open; }, style: { border: '1px solid var(--line, #444)', borderRadius: '6px', padding: '6px 10px', margin: '0 0 8px', background: 'rgba(127,127,127,.06)' } },
      h('summary', { class: 'pointer' }, h('b', {}, TITLE[kind] + ' — ' + cls), ' ',
        h('span', { class: 'badge' }, used ? '지금 게임에서 쓰임' : '프로젝트 설정이 대신함 (참고용)'), h('span', { class: 'hint' }, '  게임 저장소 소스에서 읽은 값 (읽기 전용)')), body);
    PDM.gameHero(cls).then(d => { body.textContent = '';
      if (!d) { body.appendChild(h('div', { class: 'hint' }, repoOf() ? `게임 저장소의 HeroClass.java 에 ${cls} 직업이 없습니다.` : '게임 저장소를 찾지 못해 읽을 수 없습니다 (프로젝트 설정 → 게임 저장소).')); return; }
      render(d, kind, c).forEach(x => body.appendChild(x)); });
    return box;
  };
  PDM.gameSrc = { J, repoOf, strip, block, method, caseBodies, fmt, lc, codeView, fold, kv, mono, itemName, usageFold };
  PDM.gameHeroClear = () => { Object.keys(cache).forEach(k => delete cache[k]); Object.keys(srcCache).forEach(k => delete srcCache[k]); };
})();
