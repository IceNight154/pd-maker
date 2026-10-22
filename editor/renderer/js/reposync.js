// ================================================================
//  저장소 기준 맞추기 (10차) — 프로젝트의 게임 영웅 · 캐릭터를 "선택한 게임 저장소"의 데이터에 맞춤
//    · 기준 = 저장소 분석 결과(PDM.REPO_ANALYSIS — editor/repo-analyzer.js). 원작 SPD 이름 · 분류 · 그림을 다른 저장소에 씌우지 않음
//    · 칸마다 출처를 기록(provenance.js): 저장소 원본 · 저장소에서 추론 · PDMaker 기본값 · 사용자 편집
//    · 사용자가 고친 칸은 다시 맞춰도 그대로 (원본이 바뀌었으면 "충돌"로 보고)
//    · 저장소에서 사라진 항목은 지우지 않고 목록으로 보여 줌 — 사용자가 고른 것만 지움 (opts.remove)
//    · 분석 실패 · 값을 못 읽은 칸은 지금 값을 그대로 둠
//  plan()  → { profile, heroes: [...], chars: [...], missing: [...], counts }
//  apply(plan, opts) → { heroesAdded, heroesUpdated, heroesHidden, charsAdded, charsUpdated, charsRemoved, heroesRemoved, conflicts, kept }
//  PDM.gameSyncVanilla(fixOnly, opts) 는 예전 이름 그대로 (plan + apply)
// ================================================================
(function () {
  const P = () => PDM.prov;
  const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const KIND_OF = { boss: 'boss', elite: 'elite', npc: 'npc', mob: 'mob', review: 'unsorted' };
  const simple = ref => String(ref || '').split(':').pop().split('.').pop();
  const spdChar = cls => (PDM.SPD_CHARS || []).find(e => e.cls === cls);
  const spdHero = cls => (PDM.SPD_HEROES || []).find(x => x.cls === cls);
  const rep = () => { const r = PDM.REPO_ANALYSIS, sc = PDM.GAME_SCAN; return r && r.objects && sc && sameRepo(r.root, sc.repo) ? r : null; };
  const sameRepo = (a, b) => String(a || '').replace(/[\\/]+$/, '').toLowerCase() === String(b || '').replace(/[\\/]+$/, '').toLowerCase();
  const evidenceText = c => (c.evidence || []).map(e => `${e.kind}${e.where ? ' — ' + e.where : ''}`).join(' · ');

  /** 영웅 한 명의 원하는 값 (칸 경로 → { value, from, file, line, key, note }) */
  function heroWant(x, R, sheetH) {
    const file = x.file || 'actors/hero/HeroClass.java', W = {};
    W.name = x.nameSource === 'repo' ? { value: x.name, from: 'repo', file, line: x.line, key: x.nameKey } : { value: x.cls, from: 'derived', file, line: x.line, note: '번역 키(' + (x.nameKey || '') + ')가 없어 직업 enum 이름' };
    if (x.desc) W.desc = { value: x.desc, from: 'repo', key: x.descKey };
    if (x.sheet) W['sprite.sheet'] = { value: 'game:' + x.sheet, from: x.spriteKind === 'direct' ? 'repo' : 'derived', file, note: x.spriteKind === 'direct' ? 'HeroClass.spritesheet() 의 ' + x.cls + ' 분기 (' + (x.sheetConst || '') + ')' : 'spritesheet() 의 기본(default) 분기' };
    const fr = R.objects.heroFrame; if (fr) W['sprite.frame'] = { value: fr.slice(), from: 'repo', file: 'sprites/HeroSprite.java', note: 'FRAME_WIDTH · FRAME_HEIGHT' };
    if (fr && sheetH && sheetH[x.cls]) { const used = sheetH[x.cls]; W['sprite.tierRows'] = { value: [0, 1, 2, 3, 4, 5, 6].map(i => used[Math.min(i, used.length - 1)]), from: 'derived', note: '시트에서 그림이 있는 줄' }; }
    return W;
  }
  /** 캐릭터 한 명의 원하는 값 */
  function charWant(m) {
    const W = {}, file = m.file, line = m.line;
    W.name = m.nameSource === 'repo' ? { value: m.name, from: 'repo', file, line, key: m.nameKey } : { value: m.simple, from: 'derived', file, line, note: '번역 키(' + m.nameKey + ')가 없어 클래스 이름 — 번역된 이름이 아님' };
    if (m.desc) W.desc = { value: m.desc, from: 'repo', key: m.nameKey.replace(/\.name$/, '.desc') };
    if (m.spriteOk) W.sprite = { value: { sheet: 'game:' + m.sprite.sheet, frame: m.sprite.frame.slice(), scale: 0, anims: clone(m.sprite.anims) }, from: m.spriteKind === 'inherited' ? 'derived' : 'repo', file: m.sprite.file,
      note: m.spriteKind === 'inherited' ? `spriteClass 를 ${m.sprite.from} 에서 이어받음 → ${m.sprite.cls}` : `spriteClass = ${m.sprite.ref}` + ((m.sprite.inherited || []).length ? ` (그림 · 프레임 일부를 ${m.sprite.inherited.join(' → ')} 에서)` : '') };
    const st = m.stats || {}, sx = m.statsExtra || {}, from = Object.assign({}, st.from || {}, m.statsExtraFrom || {});
    const num = (path, v, k, note) => { if (v === null || v === undefined) return; W[path] = { value: v, from: from[k] ? 'derived' : 'repo', file, note: (from[k] ? `${from[k]} 에서 이어받음 · ` : '') + note }; };
    num('stats.hp', st.hp, 'hp', 'HP = HT'); num('stats.evasion', st.evasion, 'evasion', 'defenseSkill'); num('exp', st.exp, 'exp', 'EXP');
    num('stats.attackMin', sx.attackMin, 'attackMin', 'damageRoll()'); num('stats.attackMax', sx.attackMax, 'attackMax', 'damageRoll()');
    num('stats.accuracy', sx.accuracy, 'accuracy', 'attackSkill()'); num('stats.defense', sx.defense, 'defense', 'drRoll()'); num('stats.speed', sx.speed, 'speed', 'baseSpeed');
    const k = KIND_OF[m.classify && m.classify.category] || 'mob';
    W.kind = { value: k, from: 'derived', file, note: `자동 분류 (${(m.classify || {}).confidence || '?'}) — ${evidenceText(m.classify || {}) || '근거 없음 (일반 몬스터)'}` };
    return W;
  }
  /** 예전 프로젝트(출처 기록 없음)에서 "원작 SPD 묶음 값"이면 기본값으로 봄 */
  let VAN = null;   // 원작 SPD 묶음으로 만든 새 프로젝트 내용 (한 번만 만듦)
  const van = () => VAN || (VAN = PDM.make.vanilla());
  function legacyChar(cls, path) {
    const e = spdChar(cls); if (!e) return undefined;
    const base = van()['char:' + PDM.make.vanillaCharId(cls)];
    return base && base.game === cls ? PDM.prov.getPath(base, path) : PDM.prov.getPath(PDM.make.vanillaChar(e), path);
  }
  function legacyHero(cls, path) {
    if (!spdHero(cls)) return undefined;
    const base = van()['hero:' + cls.toLowerCase()];
    return base ? PDM.prov.getPath(base, path) : undefined;
  }

  /** 계획: 무엇을 더하고 · 바꾸고 · 지키고 · 사라졌는지 (store 는 바꾸지 않음) */
  async function plan() {
    const sc = PDM.GAME_SCAN, store = PDM.store; if (!sc || !store.isOpen) return null;
    const R = rep();
    const out = { profile: R ? R.profile : null, analyzed: !!R, heroes: [], chars: [], missing: [], counts: {} };
    // 영웅 시트 높이 (갑옷 단계 줄) — 미리 읽음
    const sheetH = {};
    const heroes = R ? R.objects.heroes : (sc.heroes || []).map(x => Object.assign({ id: x.cls, nameSource: x.name && x.name !== x.cls ? 'repo' : 'class', spriteKind: x.sheet ? 'direct' : 'none' }, x));
    const fr = R ? R.objects.heroFrame : sc.heroFrame;
    if (fr && typeof document !== 'undefined') for (const x of heroes) { if (!x.sheet) continue; try { const im = await PDM.assets.load('game:' + x.sheet); if (!im) continue;
      const [fw, fh] = fr, n = Math.max(1, Math.floor(im.height / fh)), cv = document.createElement('canvas'); cv.width = fw; cv.height = n * fh;
      const g = cv.getContext('2d'); g.drawImage(im, 0, 0, fw, n * fh, 0, 0, fw, n * fh); const d = g.getImageData(0, 0, fw, n * fh).data, used = [];
      for (let r = 0; r < n; r++) { let c = 0; for (let k = r * fh * fw; k < (r + 1) * fh * fw; k++) if (d[k * 4 + 3] > 0) c++; if (c > 20) used.push(r); }
      sheetH[x.cls] = used.length ? used : [0]; } catch (_) { /* 그림 없음 */ } }
    // 영웅 시작 아이템: 원작 SPD 묶음 목록이 이 저장소의 실제 목록과 다르면 비움 (게임이 정함 — 영웅 화면 "게임 코드의 값")
    const invOf = {};
    if (PDM.gameHero) for (const x of heroes) { try { const g = await PDM.gameHero(x.cls); if (g && g.inv) invOf[x.cls] = [...new Set(g.inv.common.concat(g.inv.own).map(i => i.cls || i.name || i.item).filter(Boolean))].sort(); } catch (_) { /* 못 읽음 */ } }
    const R_FR = fr ? { objects: { heroFrame: fr } } : { objects: {} };
    for (const x of heroes) {
      const hr = store.all('hero').find(q => q.baseClass === x.cls);
      const W = heroWant(x, R || R_FR, sheetH);
      const spdItems = (spdHero(x.cls) || {}).items, repoItems = invOf[x.cls];
      if (spdItems && repoItems) { const spdNames = [...new Set(spdItems.map(i => simple(i.item)))].sort();
        if (JSON.stringify(spdNames) !== JSON.stringify(repoItems)) { W['inventory.items'] = { value: [], from: 'derived', note: `원작 SPD 시작 아이템과 이 저장소(${repoItems.join(', ')})가 달라 목록을 비움 — 게임 코드가 줌` }; W.knownItems = { value: [], from: 'derived', note: '원작 SPD 감정 목록을 비움 — 게임 코드가 정함' }; } }
      out.heroes.push({ cls: x.cls, id: hr ? hr.id : x.cls.toLowerCase(), exists: !!hr, hidden: !!x.hidden, want: W, name: W.name.value, x });
    }
    const mobs = R ? R.objects.mobs.filter(m => m.convertible && !String(m.cls).includes('$')) : (sc.newMobs || []).map(e => ({ cls: e.cls, simple: simple(e.cls), name: e.name, nameSource: 'repo', nameKey: '', desc: e.desc, file: (e.source || {}).file, line: (e.source || {}).line, spriteOk: !!e.sprite, sprite: e.sprite ? { sheet: String(e.sprite.sheet).replace(/^game:/, ''), frame: e.sprite.frame, anims: e.sprite.anims } : null, stats: { hp: (e.stats || {}).hp, evasion: (e.stats || {}).evasion, exp: e.exp }, classify: { category: e.kind === 'npc' ? 'npc' : e.kind === 'boss' ? 'boss' : 'mob' } }));
    const byCls = new Map(mobs.map(m => [m.cls, m]));
    for (const c of store.all('char')) {
      if (!c.game) continue;
      const m = byCls.get(c.game);
      if (m) out.chars.push({ cls: c.game, id: c.id, exists: true, want: charWant(m), m });
      else if (sc.missingMob(c.game) || (R && !R.objects.mobs.some(q => q.cls === c.game))) {
        const touched = PDM.prov.summary(c).some(s => s.status === 'user') || (!c.src && c.name !== legacyChar(c.game, 'name'));
        out.missing.push({ type: 'char', id: c.id, cls: c.game, name: c.name, touched, origin: (c.src && c.src.repo) || '원작 SPD 묶음' });
      }
    }
    const have = new Set(store.all('char').map(c => c.game).filter(Boolean));
    for (const m of mobs) if (!have.has(m.cls)) out.chars.push({ cls: m.cls, id: PDM.make.vanillaCharId(m.cls), exists: false, want: charWant(m), m });
    if (heroes.length) { const ok = new Set(heroes.map(x => x.cls));
      store.all('hero').forEach(hr => { if (hr.baseClass && !ok.has(hr.baseClass)) out.missing.push({ type: 'hero', id: hr.id, cls: hr.baseClass, name: hr.name, touched: PDM.prov.summary(hr).some(s => s.status === 'user') || (!hr.src && hr.name !== legacyHero(hr.baseClass, 'name')), origin: (hr.src && hr.src.repo) || '원작 SPD 묶음' }); }); }
    // 미리 보기: 칸마다 무엇이 일어날지 (store 사본에서)
    const dry = (o, W, legacy) => Object.keys(W).map(p => PDM.prov.sync(clone(o), p, W[p], { legacyDefault: legacy(p) })).filter(r => r.action !== 'same');
    out.heroes.forEach(e => { e.changes = e.exists ? dry(store.all('hero').find(q => q.baseClass === e.cls), e.want, p => legacyHero(e.cls, p)) : []; });
    out.chars.forEach(e => { e.changes = e.exists ? dry(store.get('char:' + e.id), e.want, p => legacyChar(e.cls, p)) : []; });
    out.counts = { heroesAdd: out.heroes.filter(e => !e.exists).length, heroesUpdate: out.heroes.filter(e => e.exists && e.changes.some(c => c.action === 'set')).length,
      charsAdd: out.chars.filter(e => !e.exists).length, charsUpdate: out.chars.filter(e => e.exists && e.changes.some(c => c.action === 'set')).length,
      conflicts: [...out.heroes, ...out.chars].reduce((n, e) => n + e.changes.filter(c => c.action === 'conflict').length, 0),
      kept: [...out.heroes, ...out.chars].reduce((n, e) => n + e.changes.filter(c => c.action === 'keep-user').length, 0), missing: out.missing.length };
    return out;
  }

  /** 계획 적용. opts = { fixOnly (더하지 않음), remove: ['char:<id>' | 'hero:<id>', …] (사라진 것 중 지울 것) } */
  function apply(pl, opts) {
    opts = opts || {}; const store = PDM.store, prof = pl.profile;
    const res = { heroesAdded: 0, heroesUpdated: 0, heroesHidden: 0, heroesRemoved: 0, charsAdded: 0, charsUpdated: 0, charsRemoved: 0, conflicts: 0, kept: 0, charsReclassified: 0 };
    const tpl = store.all('hero').find(x => x.baseClass && x.sprite && x.sprite.sheet);
    const fresh = (o, W) => { for (const p of Object.keys(W)) { if (W[p].value === undefined) continue; const meta = {}; ['file', 'line', 'key', 'note'].forEach(k => { if (W[p][k] !== undefined && W[p][k] !== '') meta[k] = W[p][k]; }); PDM.prov.mark(o, p, W[p].value, W[p].from, meta); } if (prof) PDM.prov.stamp(o, prof); };   // 새로 만든 것 = 저장소 값을 그대로
    const syncAll = (o, W, legacy) => { let ch = false; for (const p of Object.keys(W)) { const r = PDM.prov.sync(o, p, W[p], { legacyDefault: legacy(p) }); if (r.action === 'set') ch = true; if (r.action === 'conflict') res.conflicts++; if (r.action === 'keep-user') res.kept++; } if (prof) PDM.prov.stamp(o, prof); return ch; };
    store.transaction('게임 저장소에 맞추기', () => {
      for (const e of pl.heroes) {
        if (!e.exists) {
          if (opts.fixOnly || store.has('hero:' + e.id)) continue;
          const hr = PDM.make.hero(e.id); hr.baseClass = e.cls; hr.note = '게임 저장소의 직업 — 비워 둔 항목(그림·특성·전직·직업 능력)은 게임 코드의 값을 씁니다 (각 섹션 위 상자에 실제 값 표시)';
          if (hr.spellbook) hr.spellbook.enabled = false;
          if (tpl) hr.sprite = Object.assign(clone(tpl.sprite), { sheet: '' });
          if (e.hidden) hr.enabled = false;
          fresh(hr, e.want);
          hr.origin = { repo: prof ? prof.label : '', file: 'actors/hero/HeroClass.java', extracted: Object.keys(e.want).filter(p => e.want[p].from === 'repo') };
          store.add('hero:' + e.id, hr, '게임 영웅 추가'); res.heroesAdded++;
          continue;
        }
        const hr = store.all('hero').find(q => q.baseClass === e.cls); if (!hr) continue;
        store.edit('hero:' + hr.id, '저장소에 맞춤', o => { if (syncAll(o, e.want, p => legacyHero(e.cls, p))) res.heroesUpdated++; });
      }
      // 저장소가 영웅 선택 화면에서 감춘 직업은 꺼 둠 (처음 한 번 — 사용자가 다시 켜면 그대로)
      if (!opts.fixOnly) for (const e of pl.heroes.filter(x => x.hidden)) { const hr = store.all('hero').find(q => q.baseClass === e.cls);
        if (hr && hr.enabled !== false && !(hr.src && hr.src.fields && hr.src.fields.enabled)) { store.edit('hero:' + hr.id, '감춘 직업', r => { PDM.prov.mark(r, 'enabled', false, 'repo', { note: 'HeroSelectScene 이 감춤' }); }); res.heroesHidden++; } }
      for (const e of pl.chars) {
        if (!e.exists) {
          if (opts.fixOnly) continue;
          const id = e.id; if (store.has('char:' + id)) continue;
          const c = PDM.make.vanillaChar({ cls: e.cls, kind: e.want.kind.value, name: e.want.name.value, desc: '', sprite: PDM.make.character('x', e.want.kind.value).sprite, stats: {} });
          c.stats = { hp: 1, attackMin: 0, attackMax: 0, defense: 0, accuracy: 0, evasion: 0, speed: 1 };
          c.note = '게임 저장소에서 찾은 캐릭터 (actors.mobs.' + e.cls + ') — 그림·능력치·AI 는 게임 코드의 값을 씁니다' + (e.want.sprite ? '' : ' · 그림을 소스에서 확정하지 못해 임시 그림 (' + ((e.m.reasons || []).join(' · ') || '그림 없음') + ')');
          fresh(c, e.want);
          c.origin = { repo: prof ? prof.label : '', file: e.m.file, line: e.m.line, extracted: Object.keys(e.want).filter(p => e.want[p].from === 'repo'), sprite: e.want.sprite ? e.m.sprite.file || '' : '' };
          c.classify = { auto: (e.m.classify || {}).category || 'mob', confidence: (e.m.classify || {}).confidence || '', evidence: clone((e.m.classify || {}).evidence || []), summonOf: (e.m.classify || {}).summonOf || '' };
          store.add('char:' + id, c, '게임 캐릭터 추가'); res.charsAdded++;
          continue;
        }
        store.edit('char:' + e.id, '저장소에 맞춤', o => {
          const before = o.kind;
          if (syncAll(o, e.want, p => legacyChar(e.cls, p))) res.charsUpdated++;
          o.classify = Object.assign({}, o.classify || {}, { auto: (e.m.classify || {}).category || 'mob', confidence: (e.m.classify || {}).confidence || '', evidence: clone((e.m.classify || {}).evidence || []), summonOf: (e.m.classify || {}).summonOf || '' });
          if (o.kind !== before) res.charsReclassified++;
        });
      }
      for (const key of opts.remove || []) { if (!store.has(key)) continue; store.remove(key, '저장소에 없는 항목 지움'); if (key.startsWith('hero:')) res.heroesRemoved++; else res.charsRemoved++; }
      if (prof) store.edit('project', '저장소 프로파일', p => { if (p.repoProfile && p.repoProfile.id !== prof.id) p.repoProfilePrev = p.repoProfile; p.repoProfile = { id: prof.id, label: prof.label, at: new Date().toISOString() }; });
      if (res.heroesRemoved || res.heroesAdded || res.heroesHidden) store.edit('project', '영웅 순서', r => { const ids = pl.heroes.map(x => (store.all('hero').find(q => q.baseClass === x.cls) || {}).id).filter(Boolean); r.heroOrder = ids.concat((r.heroOrder || []).filter(id => store.has('hero:' + id) && !ids.includes(id))); if (r.startHero && !store.has('hero:' + r.startHero)) r.startHero = ''; });
    });
    return res;
  }

  /** 예전 이름 · 예전 반환값 (+ 새 칸). opts.remove: 'untouched' = 손대지 않은 사라진 항목만 지움 · 배열 = 그 키들 */
  PDM.gameSyncVanilla = async function (fixOnly, opts) {
    const pl = await plan(); if (!pl) return null;
    opts = Object.assign({ fixOnly: !!fixOnly }, opts || {});
    if (opts.remove === 'untouched') opts.remove = pl.missing.filter(x => !x.touched).map(x => x.type + ':' + x.id);
    const r = apply(pl, opts);
    return Object.assign(r, { heroesFixed: r.heroesUpdated, missing: pl.missing.length - (r.charsRemoved + r.heroesRemoved), plan: pl });
  };
  /** 맞추기 전에 보여 주는 창: 더할 것 · 바뀔 칸 · 지킬 사용자 값(충돌) · 저장소에서 사라진 것(고른 것만 지움) → 적용하면 결과, 취소하면 null */
  async function dialog(o) {
    o = o || {};
    const pl = await plan(); if (!pl) { PDM.toast && PDM.toast('게임 저장소를 읽지 못했습니다', 'bad'); return null; }
    const h = PDM.h, C = pl.counts, LBL = PDM.prov.LABEL;
    const nm = e => (e.exists ? (PDM.store.get((e.cls && e.want && e.want.kind ? 'char:' : 'hero:') + e.id) || {}).name : '') || (e.want && e.want.name && e.want.name.value) || e.id;
    const chRow = (e, kind) => { const sets = e.changes.filter(c => c.action !== 'same' && c.action !== 'no-value'); if (!sets.length) return null;
      return h('details', { class: 'ra-grp' }, h('summary', { class: 'pointer' }, `${kind} ${nm(e)} (${e.cls}) — ${sets.length}칸`),
        ...sets.map(c => h('div', { class: 'ra-note mono', style: { whiteSpace: 'pre-wrap' } },
          `${c.action === 'set' ? '바꿈' : c.action === 'conflict' ? '⚠ 충돌 — 사용자 값 유지' : '사용자 값 유지'} · ${c.path}: ${short(c.cur)} → ${short(c.next)}` + (e.want[c.path] ? `  [${LBL[e.want[c.path].from]}${e.want[c.path].note ? ' · ' + e.want[c.path].note : ''}]` : '')))); };
    const checks = pl.missing.map(x => ({ x, cb: h('input', { type: 'checkbox', checked: !x.touched && !o.keepMissing }) }));
    const body = h('div', { class: 'vstack gap-3', style: { minWidth: '640px', maxHeight: '70vh', overflow: 'auto' } },
      h('p', { class: 'ra-note' }, `기준 = 게임 저장소 ${pl.profile ? '「' + pl.profile.label + '」 (프로파일 ' + pl.profile.id + ')' : '(분석기 없음 — 파일 목록만)'}. 사용자가 고친 칸은 바꾸지 않습니다.`),
      h('div', {}, `더함: 영웅 ${C.heroesAdd} · 캐릭터 ${C.charsAdd}   바꿈: 영웅 ${C.heroesUpdate} · 캐릭터 ${C.charsUpdate}   사용자 값 유지: ${C.kept}   충돌: ${C.conflicts}   저장소에 없음: ${C.missing}`),
      pl.heroes.some(e => !e.exists) ? h('div', { class: 'ra-note' }, '새 영웅: ' + pl.heroes.filter(e => !e.exists).map(e => `${e.want.name.value} (${e.cls})`).join(', ')) : null,
      pl.chars.some(e => !e.exists) ? h('details', {}, h('summary', { class: 'pointer' }, `새 캐릭터 ${C.charsAdd}명`), h('div', { class: 'ra-note' }, pl.chars.filter(e => !e.exists).map(e => `${e.want.name.value} (${e.cls}, ${PDM.CHAR_KINDS[e.want.kind.value] || e.want.kind.value})`).join(', '))) : null,
      ...pl.heroes.map(e => chRow(e, '영웅')).filter(Boolean), ...pl.chars.map(e => chRow(e, '캐릭터')).filter(Boolean),
      checks.length ? h('div', {}, h('b', {}, `저장소에 없는 항목 ${checks.length}개 — 체크한 것만 지웁니다`), h('p', { class: 'ra-note' }, '체크가 꺼진 것 = 사용자가 고친 항목. 지우지 않으면 목록에 "⚠ 게임 저장소에 없음"으로 남습니다.'),
        ...checks.map(({ x, cb }) => h('label', { class: 'check' }, cb, h('span', {}, `${x.type === 'hero' ? '영웅' : '캐릭터'} ${x.name} (${x.cls}) — 출처: ${x.origin}${x.touched ? ' · 사용자 편집 있음' : ''}`)))) : null);
    const ok = o.auto ? true : await PDM.ui.modal('게임 저장소에 맞추기', body, [['취소', false], ['맞추기', () => true, 'pri']]);
    if (!ok) return null;
    const res = apply(pl, { remove: checks.filter(c => c.cb.checked).map(c => c.x.type + ':' + c.x.id) });
    PDM.log && PDM.log(`게임 저장소에 맞췄습니다 — 영웅 +${res.heroesAdded} ~${res.heroesUpdated} −${res.heroesRemoved} · 캐릭터 +${res.charsAdded} ~${res.charsUpdated} −${res.charsRemoved}` + (res.kept ? ` · 사용자 값 유지 ${res.kept}칸` : '') + (res.conflicts ? ` · 충돌 ${res.conflicts}칸 (사용자 값 유지 — 출처 상자에서 확인)` : ''), res.conflicts ? 'err' : 'ok');
    return Object.assign(res, { plan: pl });
  }
  const short = v => { const t = typeof v === 'string' ? v : JSON.stringify(v); return t === undefined ? '(없음)' : t.length > 60 ? t.slice(0, 57) + '…' : t; };

  PDM.repoSync = { plan, apply, dialog, charWant, heroWant, KIND_OF };

  /** 저장소에는 있는데 프로젝트에 없는 것 · 맞출 것 (프로젝트를 열었을 때 알려 주려고) — 동기 · 대략 */
  PDM.gameSyncNeeded = function () {
    const sc = PDM.GAME_SCAN, store = PDM.store; if (!sc || !store.isOpen) return null;
    const R = rep();
    const heroes = R ? R.objects.heroes : (sc.heroes || []);
    const haveH = new Set(store.all('hero').map(x => x.baseClass).filter(Boolean)), haveC = new Set(store.all('char').map(c => c.game).filter(Boolean));
    const mobs = R ? R.objects.mobs.filter(m => m.convertible && !String(m.cls).includes('$')).map(m => m.cls) : (sc.newMobs || []).map(e => e.cls);
    const gone = store.all('char').filter(c => c.game && sc.missingMob(c.game)).length + (heroes.length ? store.all('hero').filter(hr => hr.baseClass && !heroes.some(x => x.cls === hr.baseClass)).length : 0);
    let fix = 0;
    if (R) {
      for (const x of heroes) { const hr = store.all('hero').find(q => q.baseClass === x.cls); if (!hr) continue; const W = heroWant(x, R, null); if (Object.keys(W).some(p => PDM.prov.sync(clone(hr), p, W[p], { legacyDefault: legacyHero(x.cls, p) }).action === 'set')) fix++; }
      const byCls = new Map(R.objects.mobs.map(m => [m.cls, m]));
      for (const c of store.all('char')) { const m = c.game && byCls.get(c.game); if (!m || !m.convertible) continue; const W = charWant(m); if (Object.keys(W).some(p => PDM.prov.sync(clone(c), p, W[p], { legacyDefault: legacyChar(c.game, p) }).action === 'set')) fix++; }
    }
    return { heroes: heroes.filter(x => !haveH.has(x.cls)).length, mobs: mobs.filter(c => !haveC.has(c)).length, gone, fix };
  };
})();
